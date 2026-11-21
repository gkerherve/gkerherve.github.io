// combat.js — guns, projectiles, impacts and player health.
//
// Deliberately not Minecraft: you shoot things. Everything here is
// self-contained — it owns its own meshes, its own pools and its own HUD DOM,
// and it never reaches into main.js. Wire it up with a planet, a scene, the
// player and a way to reach the live entity list; see INTEGRATION-combat.md.
//
// Ballistics run on the curved world, so "down" for a projectile is
// -normalize(pos) rather than a fixed axis. Bullets are fast enough that drop
// is invisible over their range; arrows are slow enough that it is the whole
// point, which is why gravity is per-weapon rather than global.
//
// Terrain collision marches the segment a projectile covered this frame and
// samples planet.solidAtWorld, then bisects to find the surface. That is the
// same trick raycast.js uses for block targeting, and for the same reason: a
// straight-line DDA does not exist on a curved grid.

import * as THREE from 'three';
import * as CS from './cubesphere.js';
import * as pixelHud from './hud.js';

const TAU = Math.PI * 2;
const GRAVITY = 30;          // matches player.js, so drop looks consistent
const SAMPLE = 0.3;          // blocks between terrain samples along a segment
const BISECT = 4;            // refinement steps once a sample lands inside
const MAX_PROJECTILES = 48;
// Sized for the loudest moment the game has: a rocket in flight sheds flame
// and smoke every frame, and its landing is a fireball, a debris shower and
// a smoke column all at once. 96 recycled the fireball while it was still
// in the air, and 288 recycled the trail once it grew dense.
const MAX_PARTICLES = 384;

// Fallback body volume, for an entity that does not describe its own.
// entities.js exposes `hitCentre` (height above the feet) and `hitRadius`,
// which is the difference between shooting a villager and shooting a chicken.
const BODY_CENTRE = 0.95;
const BODY_RADIUS = 0.55;

// scratch — one per role, so a helper cannot clobber its caller
const _dir = new THREE.Vector3();
const _seg = new THREE.Vector3();
const _from = new THREE.Vector3();
const _s = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();
const _ta = new THREE.Vector3();
const _tb = new THREE.Vector3();
const _centre = new THREE.Vector3();
const _port = new THREE.Vector3();   // the barrel's mouth, in world space
const _dUp = new THREE.Vector3();    // decal frame: local up at the hit...
const _dBest = new THREE.Vector3();  // ...and the face normal that won
const _q = new THREE.Quaternion();
const _axis = new THREE.Vector3(0, 0, 1);
// An enemy's shot keeps its OWN three: _spawnProjectile calls perp(), which
// writes through _tmp, so an origin held there is gone by the time the
// projectile is built. That cost a morning.
const _eOrg = new THREE.Vector3();
const _eAim = new THREE.Vector3();
const _eUp = new THREE.Vector3();
const _eBody = new THREE.Vector3();

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// two unit vectors spanning the plane perpendicular to `d`; the seed axis is
// the one least aligned with d so the cross product never degenerates
function perp(d, a, b) {
  if (Math.abs(d.x) < 0.9) _tmp.set(1, 0, 0);
  else _tmp.set(0, 1, 0);
  a.crossVectors(_tmp, d).normalize();
  b.crossVectors(d, a);
}

// ---------------------------------------------------------------------------
// weapons
//
// damage is per projectile, so the shotgun's 8 x 4.5 only lands in full at
// close range — the spread is what turns it into a range limit instead of an
// arbitrary damage falloff curve.
//
// rate is seconds between shots; spread is a half-angle in radians; speed is
// blocks/s; gravity scales GRAVITY, so 0.06 on a bullet is a hair of drop at
// 60 blocks and 1 on an arrow is a real arc you have to lead.

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'pistol', ammo: 'bullet',
    damage: 6, rate: 0.28, spread: 0.012, speed: 130, gravity: 0.06,
    pellets: 1, mag: 12, reload: 1.1, range: 180, auto: false,
    recoil: 2.6, tracer: 'bullet',
  },
  rifle: {
    id: 'rifle', name: 'rifle', ammo: 'bullet',
    damage: 8, rate: 0.1, spread: 0.02, speed: 170, gravity: 0.05,
    pellets: 1, mag: 30, reload: 1.9, range: 500, auto: true,
    recoil: 1.6, tracer: 'bullet',
  },
  // the shotgun stays a room-length weapon on purpose — spread is its range
  shotgun: {
    id: 'shotgun', name: 'shotgun', ammo: 'shell',
    damage: 4.5, rate: 0.85, spread: 0.11, speed: 110, gravity: 0.12,
    pellets: 8, mag: 6, reload: 2.4, range: 55, auto: false,
    recoil: 7.5, tracer: 'bullet',
  },
  // the odd one out on purpose: slow, silent, and it drops.
  // speed was 52 against GRAVITY 24; drop at a given range goes as g / v^2, so
  // 52 * sqrt(30/24) = 58 keeps the arc — and the aim points — where they were.
  bow: {
    id: 'bow', name: 'bow', ammo: 'arrow',
    damage: 11, rate: 0.85, spread: 0.008, speed: 58, gravity: 1,
    pellets: 1, mag: 1, reload: 0.55, range: 280, auto: false,
    recoil: 1.2, tracer: 'arrow',
  },
  // The explosives. `blast` is what makes a rocket a rocket: on ANY impact —
  // ground, zombie, another player — it goes off, hurting everything within
  // `radius` blocks (scaled by distance) and asking main.js for a crater via
  // onExplode. `damage` is the direct-hit bonus on top of the blast.
  bazooka: {
    id: 'bazooka', name: 'bazooka', ammo: 'rocket',
    damage: 14, rate: 1.2, spread: 0.006, speed: 60, gravity: 0.05,
    pellets: 1, mag: 1, reload: 2.8, range: 1200, auto: false,
    recoil: 10, tracer: 'rocket', blast: { radius: 4.6, damage: 34 },
  },
  launcher: {
    id: 'launcher', name: 'rocket launcher', ammo: 'rocket',
    damage: 8, rate: 0.6, spread: 0.02, speed: 62, gravity: 0.06,
    pellets: 1, mag: 4, reload: 3.4, range: 1000, auto: true,
    recoil: 6, tracer: 'rocket', blast: { radius: 3.2, damage: 18 },
  },
};

// Ascending nastiness — main.js's carriedGun takes the LAST one you carry,
// so the bow sits below the powder weapons: a rifle in the pack outranks it.
export const WEAPON_ORDER = [
  'pistol', 'bow', 'rifle', 'shotgun', 'bazooka', 'launcher',
];

export const START_AMMO = { bullet: 180, shell: 32, arrow: 40, rocket: 6 };

const ZOMBIE_DAMAGE = 3;     // per successful zombie swing
// ...and per arrow that lands on you. Higher than a swing, because you had
// the whole flight to move out of the way and chose not to.
const ENEMY_ARROW_DAMAGE = 4;
// ...and what a village bowman's arrow does to the thing he is shooting at
const GUARD_ARROW_DAMAGE = 5;
// how near an arrow has to pass the middle of you to count as a hit
const PLAYER_HIT_R = 0.6;

// ---------------------------------------------------------------------------
// game mode
//
// One module-level flag rather than a constructor option, because the mode has
// to be respected by things that never see the Combat instance — PlayerHealth
// on its own, the drowning timer, and main.js's own hunger and block costs.
// It is a single source of truth that anything can read:
//
//   import { isCreative } from './combat.js';
//   if (!isCreative()) inventory.remove(id, 1);
//
// Creative removes the survival pressures; it does not add a separate code
// path. Damage is refused at the one door every hit goes through, so nothing
// downstream has to know which mode it is in.

export const GAME_MODES = ['survival', 'creative'];

let _mode = 'survival';
const _modeListeners = new Set();

export function getMode() { return _mode; }
export function isCreative() { return _mode === 'creative'; }
export function isSurvival() { return _mode !== 'creative'; }

// Returns the mode actually in force, so a typo falls back to survival rather
// than silently making the player invulnerable.
export function setMode(mode) {
  const m = mode === 'creative' ? 'creative' : 'survival';
  if (m === _mode) return _mode;
  _mode = m;
  pixelHud.setMode(m);
  for (const fn of _modeListeners) fn(m);
  return _mode;
}

// cb(mode); returns an unsubscribe
export function onModeChange(fn) {
  _modeListeners.add(fn);
  return () => _modeListeners.delete(fn);
}

// alias, so Combat#setMode can reach the module function without the name of
// the method shadowing it in the reader's head
const applyMode = setMode;

// ---------------------------------------------------------------------------
// player health

export class PlayerHealth {
  constructor(opts = {}) {
    this.max = opts.max ?? 20;
    this.hp = this.max;
    this.regenDelay = opts.regenDelay ?? 6;    // seconds of calm before regen
    this.regenRate = opts.regenRate ?? 1.4;    // hp per second once it starts
    this.respawnDelay = opts.respawnDelay ?? 2.5;
    this.invuln = opts.invuln ?? 0.35;         // i-frames, so a pack of three
    this.onChange = opts.onChange ?? null;     // zombies cannot chain-stun you
    this.onDeath = opts.onDeath ?? null;
    this.onRespawn = opts.onRespawn ?? null;
    this.dead = false;
    this.sinceHit = 999;
    this.sinceDeath = 0;
    this.hurtFlash = 0;                        // 0..1, drives the HUD vignette
  }

  get fraction() { return clamp(this.hp / this.max, 0, 1); }

  damage(amount, opts = {}) {
    if (this.dead || amount <= 0) return false;
    // creative: the one door every hit comes through, so nothing else — not
    // zombies, not drowning, not starving, not a fall — needs a mode check
    if (isCreative()) return false;
    if (this.sinceHit < this.invuln && !opts.force) return false;
    this.sinceHit = 0;
    // Armour and the absorption pool soak the hit before health does.
    // THIS is the door every hit comes through — Hunger.hurt is not on the
    // path at all — so a harness that reduced damage anywhere else reduced
    // nothing, and neither did a golden apple's absorption. inventory.js
    // owns the arithmetic; this only asks.
    if (this.onArmour) {
      amount = this.onArmour(amount, opts);
      if (amount <= 0) return false;
    }
    this.hp = Math.max(0, this.hp - amount);
    this.hurtFlash = Math.min(1, this.hurtFlash + amount / this.max + 0.15);
    this.onChange?.(this);
    if (this.hp <= 0) {
      this.dead = true;
      this.sinceDeath = 0;
      this.onDeath?.(this);
      return true;
    }
    return false;
  }

  heal(amount) {
    if (this.dead) return;
    this.hp = Math.min(this.max, this.hp + amount);
    this.onChange?.(this);
  }

  // full reset; main.js should move the player somewhere safe in onRespawn
  respawn() {
    this.hp = this.max;
    this.dead = false;
    this.sinceHit = 999;
    this.hurtFlash = 0;
    this.onChange?.(this);
    this.onRespawn?.(this);
  }

  update(dt) {
    this.sinceHit += dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.8);
    // switched to creative while down: get up. Being dead and immortal at the
    // same time is the one state the death screen cannot leave.
    if (this.dead && isCreative()) { this.respawn(); return; }
    if (this.dead) {
      this.sinceDeath += dt;
      if (this.respawnDelay >= 0 && this.sinceDeath >= this.respawnDelay) {
        this.respawn();
      }
      return;
    }
    // Regeneration is slow and only after a real lull. Anything faster and
    // there is no reason to ever break off a fight.
    if (this.hp < this.max && this.sinceHit >= this.regenDelay) {
      const before = this.hp;
      this.hp = Math.min(this.max, this.hp + this.regenRate * dt);
      if ((this.hp | 0) !== (before | 0)) this.onChange?.(this);
    }
  }
}

// ---------------------------------------------------------------------------
// HUD — built from JS so index.html knows nothing about it, same approach as
// craftui.js. main.js only has to call setHudVisible().

const HUD_CSS = `
.cbt-root {
  position: fixed; inset: 0; z-index: 20; display: none;
  pointer-events: none; user-select: none;
  font: 13px "Segoe UI", system-ui, sans-serif; color: #cfd8ea;
  text-shadow: 0 1px 3px rgba(0,0,0,.85);
}
.cbt-root.cbt-on { display: block; }
.cbt-hp {
  position: absolute; left: 18px; bottom: 22px; width: 190px;
}
.cbt-hp .cbt-bar {
  height: 10px; border-radius: 5px; overflow: hidden;
  background: rgba(10,14,24,.6);
  border: 1px solid rgba(255,255,255,.22);
}
.cbt-hp i {
  display: block; height: 100%; width: 100%;
  background: linear-gradient(90deg, #d84040, #ff7a5c);
  transition: width .12s linear;
}
.cbt-hp .cbt-lab {
  font-size: 11px; letter-spacing: .6px; text-transform: uppercase;
  opacity: .65; margin-bottom: 4px;
}
.cbt-ammo {
  position: absolute; right: 22px; bottom: 20px; text-align: right;
}
.cbt-ammo b { font: 700 26px/1 Consolas, monospace; color: #fff; }
.cbt-ammo .cbt-res { font: 15px/1 Consolas, monospace; opacity: .6; }
.cbt-ammo .cbt-w {
  font-size: 11px; letter-spacing: .8px; text-transform: uppercase;
  opacity: .7; margin-top: 3px;
}
.cbt-ammo.cbt-low b { color: #ff8a6a; }
.cbt-reload {
  position: absolute; left: 50%; top: calc(50% + 34px);
  transform: translateX(-50%); font-size: 12px; letter-spacing: .5px;
  opacity: .85; display: none;
}
.cbt-hurt {
  position: absolute; inset: 0; opacity: 0;
  background: radial-gradient(ellipse at center,
    rgba(160,0,0,0) 45%, rgba(180,10,10,.75) 100%);
}
.cbt-dead {
  position: absolute; inset: 0; display: none;
  align-items: center; justify-content: center;
  background: rgba(60,0,0,.45);
  font: 600 30px "Segoe UI", system-ui, sans-serif; color: #ffd9d9;
  letter-spacing: 1px;
}
.cbt-dead.cbt-on { display: flex; }
`;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

class CombatHUD {
  constructor() {
    if (!document.getElementById('cbt-style')) {
      const s = el('style');
      s.id = 'cbt-style';
      s.textContent = HUD_CSS;
      document.head.appendChild(s);
    }
    this.root = el('div', 'cbt-root');

    const hp = el('div', 'cbt-hp');
    hp.appendChild(el('div', 'cbt-lab', 'health'));
    const bar = el('div', 'cbt-bar');
    this.fill = el('i');
    bar.appendChild(this.fill);
    hp.appendChild(bar);
    this.hpEl = hp;

    this.ammo = el('div', 'cbt-ammo');
    this.mag = el('b', null, '0');
    this.res = el('span', 'cbt-res', ' / 0');
    this.wname = el('div', 'cbt-w', '');
    this.ammo.append(this.mag, this.res, this.wname);

    this.reloadEl = el('div', 'cbt-reload', 'reloading…');
    this.hurt = el('div', 'cbt-hurt');
    this.deadEl = el('div', 'cbt-dead', 'you died');

    this.root.append(hp, this.ammo, this.reloadEl, this.hurt, this.deadEl);
    document.body.appendChild(this.root);
  }

  show(on = true) { this.root.classList.toggle('cbt-on', !!on); }
  isVisible() { return this.root.classList.contains('cbt-on'); }

  render(combat) {
    const h = combat.health;
    // hud.js draws hearts and its own vignette; showing a second health bar
    // and a second red flash on top of them is worse than showing neither
    const hearts = pixelHud.isVisible();
    this.hpEl.style.display = hearts ? 'none' : '';
    this.fill.style.width = `${(h.fraction * 100).toFixed(1)}%`;
    this.hurt.style.opacity = hearts ? '0' : (h.hurtFlash * 0.9).toFixed(2);
    this.deadEl.classList.toggle('cbt-on', h.dead);
    const w = combat.weapon;
    const inMag = combat.magOf(w.id);
    this.mag.textContent = String(inMag);
    this.res.textContent = ` / ${combat.ammo[w.ammo] | 0}`;
    this.wname.textContent = w.name;
    this.ammo.classList.toggle('cbt-low', inMag === 0);
    this.reloadEl.style.display = combat.reloading > 0 ? 'block' : 'none';
  }
}

// ---------------------------------------------------------------------------
// visuals — everything pooled, nothing allocated per shot
//
// Particles are tiny cubes rather than billboards: in a voxel world they read
// correctly, they need no per-frame orientation, and they can share one
// material per colour, which keeps the pool to four materials total.

const PARTICLE_COLORS = {
  spark: 0xffcf6a,
  smoke: 0x9aa0aa,
  dust: 0xb59a6f,
  blood: 0x8c1f1f,
  rot: 0x4c7a2e,       // zombies bleed something else
  flame: 0xff8a2e,     // rocket exhaust and the heart of an explosion
  flash: 0xfff6dc,     // the white instant before the fireball
  casing: 0xd8b45a,    // brass, ejected and falling
};

function buildTracerMeshes(scene, kind, count) {
  const geo = kind === 'arrow'
    ? new THREE.BoxGeometry(0.05, 0.05, 0.85)
    : kind === 'rocket'
      ? new THREE.BoxGeometry(0.16, 0.16, 0.55)
      : new THREE.BoxGeometry(0.06, 0.06, 0.5);
  const mat = new THREE.MeshBasicMaterial({
    color: kind === 'arrow' ? 0xd8c49a
      : kind === 'rocket' ? 0x8a9096 : 0xffe9a8,
  });
  const list = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(geo, mat);
    m.visible = false;
    m.frustumCulled = false;
    scene.add(m);
    list.push(m);
  }
  return list;
}

class ParticlePool {
  constructor(scene, count = MAX_PARTICLES) {
    this.geo = new THREE.BoxGeometry(1, 1, 1);
    this.mats = {};
    for (const [k, c] of Object.entries(PARTICLE_COLORS)) {
      this.mats[k] = new THREE.MeshBasicMaterial({ color: c });
    }
    this.items = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.geo, this.mats.spark);
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.items.push({
        mesh: m, life: 0, max: 1, size: 0.1,
        vel: new THREE.Vector3(), grav: 1,
      });
    }
    this.next = 0;
  }

  // Round-robin rather than a free list: a particle that outlives the pool
  // just gets recycled early, which is invisible, and there is no bookkeeping.
  spawn(pos, vel, opts = {}) {
    const p = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    p.mesh.material = this.mats[opts.color ?? 'spark'] ?? this.mats.spark;
    p.mesh.position.copy(pos);
    p.vel.copy(vel);
    p.size = opts.size ?? 0.11;
    p.max = p.life = opts.life ?? 0.5;
    p.grav = opts.gravity ?? 1;
    p.mesh.scale.setScalar(p.size);
    p.mesh.visible = true;
    return p;
  }

  burst(pos, n, opts = {}) {
    const speed = opts.speed ?? 4;
    for (let i = 0; i < n; i++) {
      _tmp2.set(Math.random() * 2 - 1, Math.random() * 2 - 1,
        Math.random() * 2 - 1);
      if (opts.dir) _tmp2.addScaledVector(opts.dir, opts.bias ?? 1.1);
      _tmp2.normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      this.spawn(pos, _tmp2, opts);
    }
  }

  update(dt) {
    for (const p of this.items) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; continue; }
      if (p.grav) {
        if (CS.FLAT) _tmp.set(0, 1, 0);
        else _tmp.copy(p.mesh.position).normalize();
        _tmp.multiplyScalar(-GRAVITY * p.grav * dt);
        p.vel.add(_tmp);
      }
      p.mesh.position.addScaledVector(p.vel, dt);
      // shrink instead of fading: a shared material cannot fade per particle,
      // and at this size the eye reads shrink as fade anyway
      p.mesh.scale.setScalar(p.size * (p.life / p.max));
    }
  }

  dispose() {
    for (const p of this.items) p.mesh.parent?.remove(p.mesh);
    this.geo.dispose();
    for (const m of Object.values(this.mats)) m.dispose();
  }
}

// ---------------------------------------------------------------------------

export class Combat {
  // opts: { planet, scene, player, entities, weapon, ammo, hud }
  //   entities — an array OR a getter returning the live array (main.js
  //   reassigns its list every frame it sweeps the dead, so pass `() => e`)
  constructor(opts = {}) {
    this.planet = opts.planet ?? null;
    this.scene = opts.scene;
    this.player = opts.player ?? null;
    this._entities = opts.entities ?? [];

    this.health = new PlayerHealth({
      ...opts.health,
      onChange: () => this._dirty = true,
      onDeath: (h) => { this.onDeath?.(h); this._dirty = true; },
      onRespawn: (h) => { this.onRespawn?.(h); this._dirty = true; },
    });

    // The weapon table is per-instance and overridable, because items.js
    // carries its own stat block for the same guns. main.js can reconcile the
    // two by passing opts.weapons instead of either module editing the other.
    this.weapons = {};
    for (const id of WEAPON_ORDER) this.weapons[id] = { ...WEAPONS[id] };
    for (const [id, over] of Object.entries(opts.weapons ?? {})) {
      this.weapons[id] = { ...(this.weapons[id] ?? WEAPONS.pistol), ...over, id };
    }
    this.order = opts.order ?? Object.keys(this.weapons);

    this.ammo = { ...START_AMMO, ...(opts.ammo ?? {}) };
    this.mags = {};
    for (const id of this.order) this.mags[id] = this.weapons[id].mag;
    this.weaponId = this.weapons[opts.weapon] ? opts.weapon : this.order[0];
    this.reloading = 0;
    this.cooldown = 0;
    this.triggerDown = false;
    this.firedSinceTrigger = false;
    this.zombieDamage = opts.zombieDamage ?? ZOMBIE_DAMAGE;
    // The last thing that hit the player, for anything that wants to know who
    // to blame — tame animals do, and a check can read it too.
    this.lastAttacker = null;

    // breath. `isUnderwater` defaults to player.inWater, which samples at the
    // waist — pass an eye-level test if you have one and wading should not
    // count. `air: false` turns the whole thing off, bar and drowning alike.
    this.airEnabled = opts.air !== false;
    this.air = 1;
    this.airTime = opts.airTime ?? 14;        // seconds of breath, empty to full
    this.drownDamage = opts.drownDamage ?? 2; // hp per second once it is gone
    this.isUnderwater = opts.isUnderwater ?? null;
    this._drownT = 0;
    // optional: anything with .food and .max (inventory.js's Hunger fits), and
    // the hunger row follows it with no per-frame call at the call site
    this.hunger = opts.hunger ?? null;
    this._shownHunger = -1;
    this._shownHp = -1;

    // hooks — assigned by main.js, all optional
    this.onSound = null;      // (name, opts) — wire to audio.js play()
    this.onRecoil = null;     // (dxPixels, dyPixels) — defaults to player.onMouse
    this.onKill = null;       // (entity, weapon)
    this.onHurt = null;       // (entity, weapon) — every hit, fatal or not
    this.onDeath = null;
    this.onRespawn = null;
    this.onExplode = null;    // (worldPos, radius) — main.js digs the crater
    this.onShot = null;       // (weapon) — the viewmodel's flash and kick

    // recoil: the kick goes on over ~45 ms and most of it comes back over
    // ~350 ms, so a burst climbs and then settles instead of walking away
    this.kick = { pitch: 0, yaw: 0 };
    this.give = { pitch: 0, yaw: 0 };
    this.recover = opts.recover ?? 0.7;

    this._buildVisuals();
    this.hud = opts.hud === false ? null : new CombatHUD();
    // main.js does not call setHudVisible() today, so the hearts follow the
    // play-mode marker on <body> instead. Explicit calls still win.
    if (opts.hud !== false && opts.followPlayMode !== false) {
      pixelHud.autoFollow();
      pixelHud.setMode(getMode());
      this._syncPixelHud(true);
    }
    this._dirty = true;
  }

  _buildVisuals() {
    this.projectiles = [];
    // 48: an auto rifle at 10 rounds a second with 3 seconds of flight keeps
    // ~30 in the air on its own; 32 dropped pellets mid-burst
    const bullets = buildTracerMeshes(this.scene, 'bullet', 48);
    const arrows = buildTracerMeshes(this.scene, 'arrow', 16);
    const rockets = buildTracerMeshes(this.scene, 'rocket', 8);
    this.tracers = { bullet: bullets, arrow: arrows, rocket: rockets };
    this.freeTracers = {
      bullet: bullets.slice(), arrow: arrows.slice(), rocket: rockets.slice(),
    };
    this.particles = new ParticlePool(this.scene);

    // Bullet marks: a pool of small dark quads pressed onto whatever face a
    // round struck, fading out over a dozen seconds. Round-robin like the
    // particles — a firefight that outruns the pool recycles its oldest
    // scars, which nobody has ever noticed in any game that does this.
    this.decals = [];
    this.decalNext = 0;
    const dgeo = new THREE.PlaneGeometry(0.16, 0.16);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(dgeo, new THREE.MeshBasicMaterial({
        color: 0x17171a, transparent: true, opacity: 0,
        depthWrite: false, polygonOffset: true,
        polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }));
      m.visible = false;
      m.frustumCulled = false;
      this.scene.add(m);
      this.decals.push({ mesh: m, life: 0, max: 1 });
    }

    // muzzle flash: one mesh, parked out of sight between shots
    this.flash = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.18, 0.3),
      new THREE.MeshBasicMaterial({ color: 0xfff0b0 }));
    this.flash.visible = false;
    this.flash.frustumCulled = false;
    this.scene.add(this.flash);
    this.flashTime = 0;
  }

  // --- accessors ---------------------------------------------------------

  get weapon() {
    return this.weapons[this.weaponId] ?? this.weapons[this.order[0]];
  }
  magOf(id) { return this.mags[id] | 0; }
  entities() {
    return typeof this._entities === 'function'
      ? (this._entities() ?? []) : this._entities;
  }

  setPlanet(planet) {
    this.planet = planet;
    // a new world means the old bullet marks hang in the wrong sky
    this.clearDecals?.();
  }
  setEntities(src) { this._entities = src; }

  // Shows the ammo block AND the hearts: main.js already calls this when play
  // mode starts and stops, so the survival HUD needs no wiring of its own.
  setHudVisible(on) {
    this.hud?.show(on);
    pixelHud.show(!!on);
    if (on) this._syncPixelHud(true);
  }

  // main.js: setGameMode() calls combat.setMode('creative' | 'survival').
  // Mirrors the module-level flag so either entry point works.
  setMode(mode) {
    const m = applyMode(mode);
    if (m === 'creative') {
      this.air = 1;
      this._drownT = 0;
      if (this.health.dead) this.health.respawn();
    }
    this._dirty = true;
    this._syncPixelHud(true);
    return m;
  }

  get mode() { return getMode(); }
  get creative() { return isCreative(); }

  select(id) {
    if (!this.weapons[id] || id === this.weaponId) return;
    this.weaponId = id;
    this.reloading = 0;
    this.cooldown = Math.max(this.cooldown, 0.2);   // small swap delay
    this.firedSinceTrigger = true;                  // no shot on the swap click
    this._dirty = true;
    this.onSound?.('reload', { gain: 0.4, weapon: id });
  }

  cycle(step = 1) {
    const i = this.order.indexOf(this.weaponId);
    const n = this.order.length;
    if (n) this.select(this.order[(i + step + n * 2) % n]);
  }

  giveAmmo(type, n) {
    this.ammo[type] = (this.ammo[type] | 0) + n;
    this._dirty = true;
  }

  // --- firing ------------------------------------------------------------

  // Call on mousedown, and every frame the trigger is held is fine too:
  // semi-automatic weapons need a release before the next shot.
  fire() {
    this.triggerDown = true;
    return this._tryShot();
  }

  releaseTrigger() {
    this.triggerDown = false;
    this.firedSinceTrigger = false;
  }

  reload() {
    const w = this.weapon;
    if (this.reloading > 0) return false;
    if (this.mags[w.id] >= w.mag) return false;
    if ((this.ammo[w.ammo] | 0) <= 0) return false;
    this.reloading = w.reload;
    this.onSound?.('reload', { weapon: w.id });
    this._dirty = true;
    return true;
  }

  _tryShot() {
    const w = this.weapon;
    if (this.health.dead || this.cooldown > 0 || this.reloading > 0) return false;
    if (!w.auto && this.firedSinceTrigger) return false;
    if (this.mags[w.id] <= 0) {
      // dry: a click, then start the reload for you rather than making you
      // discover a separate key mid-fight
      this.onSound?.('dryfire', { weapon: w.id });
      this.cooldown = 0.25;
      this.reload();
      return false;
    }
    this._shoot(w);
    return true;
  }

  // Where the barrel actually is, relative to the eye: a touch right and
  // below for a shouldered gun, further out for the bazooka's fat tube. The
  // round leaves from THERE, so you see it depart across the frame instead
  // of materialising at the crosshair — most of what makes a shot look real.
  _portOffset(w, out) {
    const p = this.player;
    if (CS.FLAT) _tmp.set(0, 1, 0);
    else _tmp.copy(p.eye).normalize();
    _ta.crossVectors(p.lookDir, _tmp).normalize();      // screen right
    const rocket = w.tracer === 'rocket';
    return out.copy(p.eye)
      .addScaledVector(p.lookDir, 0.5)
      .addScaledVector(_ta, rocket ? 0.34 : 0.2)
      .addScaledVector(_tmp, rocket ? -0.06 : -0.12);
  }

  _shoot(w) {
    const p = this.player;
    if (!p) return;
    this.mags[w.id] -= 1;
    this.cooldown = w.rate;
    this.firedSinceTrigger = true;
    this._dirty = true;

    this._portOffset(w, _port);
    for (let i = 0; i < w.pellets; i++) {
      this._spawnProjectile(w, _port, p.lookDir);
    }
    // the viewmodel's half: muzzle flash at the barrel, kick on the rig
    this.onShot?.(w);
    // a rocket tube vents backwards — the cloud behind you is the price of
    // no recoil worth naming, and it says "launcher" like nothing else
    if (w.tracer === 'rocket') {
      _tmp2.copy(p.eye).addScaledVector(p.lookDir, -1.1);
      this.particles.burst(_tmp2, 8, {
        color: 'smoke', dir: _dir.copy(p.lookDir).negate(), bias: 1.6,
        speed: 4, size: 0.2, life: 0.8, gravity: -0.03,
      });
    }

    // recoil, mostly up with a random lean; units are the "mouse pixels"
    // player.onMouse already speaks
    const k = w.recoil * (0.85 + Math.random() * 0.3);
    const yaw = (Math.random() - 0.5) * w.recoil * 0.8;
    this.kick.pitch += k;
    this.kick.yaw += yaw;
    this.give.pitch += k * this.recover;
    this.give.yaw += yaw * this.recover;

    // A small hot bloom just past the barrel's mouth. The rig's own muzzle
    // flash (player.gunFire) is the star now; this box is the light it casts
    // into the world, and at the port's distance from the eye the old 0.7+
    // scale filled a third of the screen.
    this.flash.position.copy(_port).addScaledVector(p.lookDir, 0.3);
    this.flash.quaternion.copy(p.camera?.quaternion ?? _q);
    this.flash.scale.setScalar(0.2 + Math.random() * 0.15);
    this.flash.visible = w.id !== 'bow';
    this.flashTime = 0.045;
    if (w.id !== 'bow') {
      _tmp2.copy(p.lookDir);
      this.particles.burst(this.flash.position, 3, {
        color: 'spark', dir: _tmp2, speed: 6, size: 0.07,
        life: 0.12, gravity: 0,
      });
      // powder smoke off the muzzle, drifting up and forward, so a fired gun
      // has an after rather than switching itself back off
      if (CS.FLAT) _tmp.set(0, 1, 0);
      else _tmp.copy(p.eye).normalize();
      for (let s = 0; s < 2; s++) {
        _tmp2.copy(p.lookDir).multiplyScalar(0.6 + Math.random())
          .addScaledVector(_tmp, 0.7 + Math.random() * 0.5);
        this.particles.spawn(this.flash.position, _tmp2, {
          color: 'smoke', size: 0.09 + Math.random() * 0.05,
          life: 0.5 + Math.random() * 0.3, gravity: -0.02,
        });
      }
      // ...and the case it came in, flicked out to the right and falling.
      // Not for rockets — a launcher tube keeps nothing worth dropping.
      if (w.ammo === 'bullet' || w.ammo === 'shell') {
        _dir.crossVectors(p.lookDir, _tmp).normalize();
        _tmp2.copy(_dir).multiplyScalar(1.6 + Math.random())
          .addScaledVector(_tmp, 1.4 + Math.random() * 0.6);
        this.particles.spawn(this.flash.position, _tmp2, {
          color: 'casing', size: 0.05, life: 0.8, gravity: 1,
        });
      }
    }
    this.onSound?.(w.id === 'bow' ? 'bowshot' : 'gunshot', { weapon: w.id });
  }

  // `hostile` inverts who the shot is looking for: an ordinary projectile
  // traces the entity list and ignores the player, a hostile one traces the
  // player and ignores the entity list. Everything else about it — the pool,
  // the tracer, the drop, the terrain collision — is identical, which is the
  // whole reason enemy arrows come through here.
  _spawnProjectile(w, origin, look, hostile = false) {
    if (this.projectiles.length >= MAX_PROJECTILES) return;
    const pool = this.freeTracers[w.tracer];
    const mesh = pool.pop();
    if (!mesh) return;              // pool exhausted: drop the pellet quietly

    _dir.copy(look);
    if (w.spread > 0) {
      // uniform in a disc, so pellets are not bunched at the centre
      perp(_dir, _ta, _tb);
      const a = Math.random() * TAU;
      const r = Math.tan(Math.sqrt(Math.random()) * w.spread);
      _dir.addScaledVector(_ta, Math.cos(a) * r)
        .addScaledVector(_tb, Math.sin(a) * r).normalize();
    }

    const proj = {
      pos: new THREE.Vector3().copy(origin).addScaledVector(_dir, 0.5),
      vel: new THREE.Vector3().copy(_dir).multiplyScalar(w.speed),
      dmg: w.damage, gravity: w.gravity, tracer: w.tracer,
      travelled: 0, range: w.range, mesh, weapon: w.id,
      // life is the safety net under `range`, not a second, shorter range:
      // the flat 6 seconds quietly airburst every rocket at ~360 blocks
      // however far the table said it could go
      life: Math.max(6, w.range / w.speed + 2),
      blast: w.blast ?? null,
      hostile,
      only: w.only ?? null,
    };
    mesh.visible = true;
    this._orientTracer(proj);
    this.projectiles.push(proj);
  }

  /**
   * THROW A CHARGE. Not a shot: no weapon, no magazine, no recoil — an item
   * out of the bag, lobbed along the look vector with gravity under it and a
   * fuse burning. `spec` is the item's own data (see dynamite in items.js),
   * so the fuse, the speed and the blast are the ITEM'S numbers and this
   * knows nothing about what it is throwing.
   *
   * It reuses the rocket's tracer for its body: a small bright thing turning
   * over as it flies, which is exactly what a thrown stick looks like.
   */
  throwCharge(origin, dir, spec) {
    if (!spec?.blast) return false;
    const tracer = this.freeTracers.rocket?.length ? 'rocket' : 'bullet';
    const mesh = this.freeTracers[tracer]?.pop();
    if (!mesh) return false;
    const proj = {
      pos: new THREE.Vector3().copy(origin).addScaledVector(dir, 0.6),
      vel: new THREE.Vector3().copy(dir).multiplyScalar(spec.throwSpeed ?? 16),
      dmg: 0, gravity: spec.gravity ?? 1, tracer,
      travelled: 0, range: 1e9, mesh, weapon: 'charge',
      life: (spec.fuse ?? 3) + 8,
      blast: spec.blast,
      fuse: spec.fuse ?? 3,
      hostile: false, only: null,
    };
    mesh.visible = true;
    this._orientTracer(proj);
    this.projectiles.push(proj);
    this.onSound?.('impact', { dist: 0 });
    return true;
  }

  _orientTracer(proj) {
    proj.mesh.position.copy(proj.pos);
    // the tracer box is long in +Z, so point +Z down the velocity
    _tmp.copy(proj.vel).normalize();
    proj.mesh.quaternion.setFromUnitVectors(_axis.set(0, 0, 1), _tmp);
  }

  _release(proj) {
    proj.mesh.visible = false;
    this.freeTracers[proj.tracer].push(proj.mesh);
  }

  // --- collision ---------------------------------------------------------

  // First solid point along `from + seg * t`, t in (0,1]. Returns -1 for a
  // clear segment. `out` gets the point just BEFORE the surface, so impact
  // particles sit on the face rather than inside the block.
  _traceTerrain(from, seg, out) {
    const planet = this.planet;
    if (!planet) return -1;
    const len = seg.length();
    const n = Math.max(1, Math.ceil(len / SAMPLE));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      _s.copy(from).addScaledVector(seg, t);
      if (!planet.solidAtWorld(_s.x, _s.y, _s.z)) continue;
      let lo = (i - 1) / n, hi = t;
      for (let k = 0; k < BISECT; k++) {
        const mid = (lo + hi) * 0.5;
        _s.copy(from).addScaledVector(seg, mid);
        if (planet.solidAtWorld(_s.x, _s.y, _s.z)) hi = mid;
        else lo = mid;
      }
      out.copy(from).addScaledVector(seg, lo);
      return hi;
    }
    return -1;
  }

  // The same walk, but for the water's SURFACE: a rocket must burst where it
  // meets the lake, not sail silently under it to detonate invisibly against
  // the bed — which is exactly what the player watched happen. Only blast
  // projectiles ask; bullets keep punching through water the way they do.
  _traceWater(from, seg, out) {
    const planet = this.planet;
    if (!planet?.blockAtWorld) return -1;
    const len = seg.length();
    const n = Math.max(1, Math.ceil(len / SAMPLE));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      _s.copy(from).addScaledVector(seg, t);
      if (planet.blockAtWorld(_s.x, _s.y, _s.z) !== CS.BLOCK.WATER) continue;
      let lo = (i - 1) / n, hi = t;
      for (let k = 0; k < BISECT; k++) {
        const mid = (lo + hi) * 0.5;
        _s.copy(from).addScaledVector(seg, mid);
        if (planet.blockAtWorld(_s.x, _s.y, _s.z) === CS.BLOCK.WATER) hi = mid;
        else lo = mid;
      }
      out.copy(from).addScaledVector(seg, lo);
      return hi;
    }
    return -1;
  }

  // Middle of an entity's body. Its origin is at the feet, so lift along the
  // local up — which on a planet is a different direction for each one.
  _bodyCentre(e, out) {
    out.copy(e.mesh.position);
    _tmp.copy(out).normalize();
    return out.addScaledVector(_tmp, e.hitCentre ?? BODY_CENTRE);
  }

  // Nearest entity whose body sphere the segment crosses, before `maxT`.
  // `only` narrows what counts as a target: a guard's arrow passes straight
  // through the villagers it is fired over, which is the whole reason the
  // garrison can be trusted with a bow on a crowded green.
  _traceEntities(from, seg, maxT, only = null) {
    const list = this.entities();
    if (!list || !list.length) return null;
    const l2 = seg.lengthSq() || 1;
    let best = null, bestT = maxT;
    for (const e of list) {
      if (!e || e.dead || !e.mesh) continue;
      if (only && !only(e)) continue;
      this._bodyCentre(e, _centre);
      const t = clamp(_tmp2.copy(_centre).sub(from).dot(seg) / l2, 0, 1);
      if (t > bestT) continue;
      _s.copy(from).addScaledVector(seg, t);
      const r = e.hitRadius ?? BODY_RADIUS;
      if (_s.distanceToSquared(_centre) > r * r) continue;
      best = e; bestT = t;
    }
    return best ? { entity: best, t: bestT } : null;
  }

  // The player's own body, for the shots coming the other way. A sphere at
  // the chest — half a metre under the eye, since the eye is at the top of the
  // head and an arrow through the shins should still count. Returns the
  // parameter along the segment, or -1 for a clean miss.
  _traceSelf(from, seg, maxT) {
    const eye = this.player?.eye;
    if (!eye) return -1;
    if (CS.FLAT) _eBody.set(0, 1, 0);
    else _eBody.copy(eye).normalize();
    _eBody.multiplyScalar(-0.6).add(eye);
    const l2 = seg.lengthSq() || 1;
    const t = clamp(_tmp2.copy(_eBody).sub(from).dot(seg) / l2, 0, maxT);
    _s.copy(from).addScaledVector(seg, t);
    return _s.distanceToSquared(_eBody) <= PLAYER_HIT_R * PLAYER_HIT_R ? t : -1;
  }

  // one entity hit. entities.js may or may not have damage() yet.
  _damageEntity(e, amount, fromDir) {
    const before = e.health ?? 0;
    // the body centre FIRST: entities.js hands its mesh to the corpse
    // animation when it dies and leaves an empty group at the origin behind,
    // so reading e.mesh.position after the hit puts the blood at the planet's
    // core and reports the sound as coming from underground
    this._bodyCentre(e, _centre);
    if (typeof e.damage === 'function') {
      e.damage(amount, fromDir);
    } else {
      e.health = before - amount;
      if (e.health <= 0) e.dead = true;
    }
    // a skeleton has nothing to bleed: it throws bone dust instead
    const gore = e.kind === 'zombie' ? 'rot'
      : e.kind === 'skeleton' ? 'dust' : 'blood';
    this.particles.burst(_centre, 6, {
      color: gore, dir: fromDir, speed: 3.5, size: 0.09, life: 0.5,
    });
    this.onSound?.(e.kind === 'zombie' || e.kind === 'skeleton'
      ? 'zombieHurt' : 'entityHurt', {
      kind: e.kind, dist: this._earshot(_centre), high: e.sex === 'woman',
    });
    // Somebody was HURT, which is a thing the world outside wants to know
    // about whether or not it killed them: shooting a guard is an offence
    // against his village, and an offence you got away with because he lived
    // is still an offence. onKill only ever fired for the fatal one.
    this.onHurt?.(e, this.weapon);
    if (e.dead) this.onKill?.(e, this.weapon);
  }

  // blocks from the player's ear, for the sound layer's distance falloff
  _earshot(pos) {
    const eye = this.player?.eye;
    return eye ? eye.distanceTo(pos) : 0;
  }

  // Press a bullet mark onto the face a round just struck. The face normal
  // is picked from the six the local cell frame allows — radial up and down,
  // and the two tangents — as the one most opposed to the shot: a wall hit
  // head-on marks the wall, a shot into the ground marks the ground.
  // (Own scratch vectors: perp() writes through _tmp, and the winner has to
  // survive the loop that found it.)
  _placeDecal(hitPos, vel) {
    const d = this.decals[this.decalNext];
    this.decalNext = (this.decalNext + 1) % this.decals.length;
    if (CS.FLAT) _dUp.set(0, 1, 0);
    else _dUp.copy(hitPos).normalize();
    perp(_dUp, _ta, _tb);
    let bestDot = 0;
    _dBest.copy(vel).normalize().negate();      // fallback: face the shooter
    for (const n of [_dUp, _ta, _tb]) {
      for (const s of [1, -1]) {
        const dot = (n.x * vel.x + n.y * vel.y + n.z * vel.z) * s;
        if (dot < bestDot) {
          bestDot = dot;
          _dBest.copy(n).multiplyScalar(s);
        }
      }
    }
    d.mesh.position.copy(hitPos).addScaledVector(_dBest, 0.015);
    d.mesh.quaternion.setFromUnitVectors(_axis.set(0, 0, 1), _dBest);
    d.mesh.rotateZ(Math.random() * TAU);
    d.mesh.scale.setScalar(0.75 + Math.random() * 0.5);
    d.mesh.material.opacity = 0.5;
    d.mesh.visible = true;
    d.max = d.life = 12;
  }

  _stepDecals(dt) {
    for (const d of this.decals) {
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life <= 0) { d.mesh.visible = false; continue; }
      // full strength for most of its stay, then a two-second fade
      if (d.life < 2) d.mesh.material.opacity = 0.5 * (d.life / 2);
    }
  }

  clearDecals() {
    for (const d of this.decals) { d.life = 0; d.mesh.visible = false; }
  }

  // --- damage taken ------------------------------------------------------

  // Bound so it can be dropped straight into an entity's hitPlayer slot.
  // A species that carries its own bite (wolves) says so on the entity;
  // zombies fall through to the world's zombieDamage as ever.
  hitPlayer = (entity) => {
    // Whatever just took a swing at the player is now every tame animal's
    // business — BEFORE the creative and death checks, not after. Being
    // attacked is a thing that happened in the world; whether it cost any
    // hit points is a separate question, and a dog that ignored a zombie
    // because its owner happened to be in creative would look broken. It is
    // also what keeps them fighting once you are down, which is the one
    // moment a pet is actually worth having.
    this.lastAttacker = entity;
    this._sicPets(entity);
    if (this.health.dead || isCreative()) return;
    const died = this.health.damage(
      entity.attackDamage ?? this.zombieDamage, { source: entity });
    if (died) return;
    this.onSound?.('playerHurt', {});
    // a small shove of the view, so a hit from behind is felt, not just seen
    this.kick.pitch += 3;
    this.give.pitch += 3 * this.recover;
  };

  // An arrow loosed by something that is NOT the player.
  //
  // Bound so it can be dropped straight into an entity's `shoot` slot, exactly
  // as hitPlayer is. It goes through _spawnProjectile so a skeleton's arrow is
  // one of the same projectiles a bow fires — same pool, same tracer, same
  // drop, same terrain collision — with `hostile` set, which is the one bit
  // _stepProjectiles reads to swap the entity trace for a trace against the
  // player. There is exactly one projectile system in this game.
  enemyShoot = (entity) => {
    if (!entity || entity.dead || this.health.dead || isCreative()) return;
    if (!this.player?.eye || !entity.pos) return;
    const w = WEAPONS.bow;
    // out of the chest, not out of the feet
    _eUp.copy(entity.pos).normalize();
    _eOrg.copy(entity.pos).addScaledVector(_eUp, (entity.hitCentre ?? 0.95) + 0.35);
    // Aim at the middle of the player and LIFT for the drop. A flat shot with
    // gravity 1 on it lands in the dirt at anything past a few blocks, which
    // reads as a skeleton that cannot shoot rather than as one you can dodge.
    _eAim.copy(this.player.eye).addScaledVector(_eUp, -0.6).sub(_eOrg);
    const dist = _eAim.length() || 1;
    const speed = w.speed * 0.62;          // slower than yours: dodgeable
    _eAim.divideScalar(dist);
    if (!CS.FLAT) {
      _eAim.addScaledVector(_eUp, GRAVITY * w.gravity * dist / (2 * speed * speed));
    }
    _eAim.normalize();
    this._spawnProjectile({
      ...w, speed, spread: 0.03,
      damage: entity.arrowDamage ?? ENEMY_ARROW_DAMAGE,
    }, _eOrg, _eAim, true);
    this.onSound?.('bowshot', { weapon: 'bow', dist: this._earshot(_eOrg) });
  };

  // A village guard's arrow. Same pool and same ballistics as everything else
  // that flies; the difference is `only`, which makes it pass clean through
  // anything that is not undead. Without that a bowman on a busy green is a
  // villager-killer, and a guard who shoots the people he is guarding is worse
  // than a guard with empty hands.
  guardShoot = (entity, foe) => {
    if (!entity || entity.dead || !foe || foe.dead || !entity.pos || !foe.pos) return;
    const w = WEAPONS.bow;
    _eUp.copy(entity.pos).normalize();
    _eOrg.copy(entity.pos).addScaledVector(_eUp, (entity.hitCentre ?? 0.95) + 0.35);
    _eAim.copy(foe.pos).addScaledVector(_eUp, foe.hitCentre ?? 0.95).sub(_eOrg);
    const dist = _eAim.length() || 1;
    const speed = w.speed * 0.7;
    _eAim.divideScalar(dist);
    if (!CS.FLAT) {
      _eAim.addScaledVector(_eUp, GRAVITY * w.gravity * dist / (2 * speed * speed));
    }
    _eAim.normalize();
    this._spawnProjectile({
      ...w, speed, spread: 0.02,
      damage: entity.arrowDamage ?? GUARD_ARROW_DAMAGE,
      only: (e) => !!e.undead,
    }, _eOrg, _eAim, false);
    this.onSound?.('bowshot', { weapon: 'bow', dist: this._earshot(_eOrg) });
  };

  // Set every tame animal on whatever just hurt their owner. entities.js owns
  // what "set on" means — see Entity.avenge and thinkPet — this only says who.
  //
  // A pet never avenges against ANOTHER pet, and never against its own owner:
  // a dog that turned on you because you clipped it with a shotgun spread
  // would be a dog nobody would ever tame twice.
  _sicPets(foe) {
    if (!foe || foe.dead || foe.tamed) return;
    const list = this.entities();
    if (!list) return;
    for (const e of list) {
      if (e && e.tamed && !e.dead && e.avenge) e.avenge(foe);
    }
  }

  // Assign the attacks to everything that can use one and has not got it yet —
  // hitPlayer to zombies, skeletons and any animal whose species table says
  // `fights` (wolves), and the bow to skeletons on top of that. Called from
  // update(), so new spawns wire themselves up.
  _wireEntities() {
    const list = this.entities();
    if (!list) return;
    for (const e of list) {
      if (!e || e.dead) continue;
      // A bee stings. It is not a `fights` animal — it never attacks
      // unprovoked, and the whole hive is peaceful until something swings at
      // it — but when it is angry it needs the same door onto the player's
      // health that everything else uses.
      if ((e.kind === 'zombie' || e.kind === 'skeleton' || e.fights
        || e.kind === 'bee') && e.hitPlayer == null) {
        e.hitPlayer = this.hitPlayer;
      }
      if (e.kind === 'skeleton' && e.shoot == null) e.shoot = this.enemyShoot;
      if (e.arm === 'bow' && e.shoot == null) e.shoot = this.guardShoot;
    }
  }

  // --- per frame ---------------------------------------------------------

  update(dt) {
    if (dt > 0.1) dt = 0.1;         // a tab that was backgrounded
    this.health.update(dt);
    this._updateAir(dt);
    this._wireEntities();

    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) this._finishReload();
    }
    if (this.triggerDown && this.weapon.auto) this._tryShot();

    if (this.flashTime > 0) {
      this.flashTime -= dt;
      if (this.flashTime <= 0) this.flash.visible = false;
    }

    this._stepProjectiles(dt);
    this._stepDecals(dt);
    this.particles.update(dt);
    this._applyRecoil(dt);
    this._syncPixelHud();

    if (this._dirty || this.health.hurtFlash > 0) {
      this.hud?.render(this);
      this._dirty = this.health.hurtFlash > 0;
    }
  }

  // Breath. Refills about four times as fast as it drains, so surfacing for a
  // moment is enough — the meter is there to make a long dive a decision, not
  // to make swimming a chore.
  _updateAir(dt) {
    if (!this.airEnabled) return;
    const under = !this.health.dead && !isCreative() && (this.isUnderwater
      ? !!this.isUnderwater() : !!this.player?.inWater);
    if (under) {
      this.air = Math.max(0, this.air - dt / this.airTime);
      if (this.air <= 0) {
        this._drownT += dt;
        while (this._drownT >= 1) {
          this._drownT -= 1;
          // force: drowning ignores i-frames, or a zombie on the shore would
          // keep you alive underwater indefinitely
          this.health.damage(this.drownDamage, { force: true, source: 'water' });
          this.onSound?.('playerHurt', {});
        }
      }
    } else if (this.air < 1) {
      this._drownT = 0;
      this.air = Math.min(1, this.air + dt * 4 / this.airTime);
    }
  }

  // Push state at hud.js. Everything is compared first: the setters touch the
  // DOM, and this runs every frame.
  _syncPixelHud(force = false) {
    if (!force && !pixelHud.isVisible()) return;
    const h = this.health;
    if (force) pixelHud.setMaxHealth(h.max);
    // rounded up: 0.2 hp left must not read as an empty row
    const shown = Math.ceil(h.hp * 2) / 2;
    if (force || shown !== this._shownHp) {
      this._shownHp = shown;
      pixelHud.setHealth(shown, { silent: force });
    }
    if (this.hunger) {
      const f = Math.ceil((this.hunger.food ?? 0) * 2) / 2;
      if (force || f !== this._shownHunger) {
        this._shownHunger = f;
        pixelHud.setHunger(f, this.hunger.max ?? 20);
      }
    }
    if (this.airEnabled) pixelHud.setAir(this.air);
  }

  _finishReload() {
    const w = this.weapon;
    const want = w.mag - this.mags[w.id];
    const have = Math.min(want, this.ammo[w.ammo] | 0);
    this.mags[w.id] += have;
    this.ammo[w.ammo] -= have;
    this.reloading = 0;
    this._dirty = true;
  }

  _applyRecoil(dt) {
    const a = 1 - Math.exp(-dt / 0.045);
    const b = 1 - Math.exp(-dt / 0.35);
    const upP = this.kick.pitch * a, upY = this.kick.yaw * a;
    this.kick.pitch -= upP; this.kick.yaw -= upY;
    const dnP = this.give.pitch * b, dnY = this.give.yaw * b;
    this.give.pitch -= dnP; this.give.yaw -= dnY;
    const dx = upY - dnY;
    // player.onMouse treats a negative dy as looking up, hence the sign
    const dy = -(upP - dnP);
    if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) return;
    if (this.onRecoil) this.onRecoil(dx, dy);
    else this.player?.onMouse?.(dx, dy);
  }

  _stepProjectiles(dt) {
    const live = this.projectiles;
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.life -= dt;

      // gravity toward the planet centre — "down" is different everywhere,
      // except on the drafting table, where it is the same -Y it looks like
      if (p.gravity) {
        if (CS.FLAT) _tmp.set(0, 1, 0);
        else _tmp.copy(p.pos).normalize();
        _tmp.multiplyScalar(-GRAVITY * p.gravity * dt);
        p.vel.add(_tmp);
      }

      _from.copy(p.pos);
      _seg.copy(p.vel).multiplyScalar(dt);
      const segLen = _seg.length();

      let tTerrain = this._traceTerrain(_from, _seg, _hit);
      // a rocket bursts on the lake's surface; the water trace only wins
      // when it comes BEFORE the ground the ray would otherwise reach
      if (p.blast) {
        const tWater = this._traceWater(_from, _seg, _tb);
        if (tWater >= 0 && (tTerrain < 0 || tWater < tTerrain)) {
          tTerrain = tWater;
          _hit.copy(_tb);
        }
      }
      const maxT = tTerrain < 0 ? 1 : tTerrain;

      // An enemy's arrow is looking for one body and it is not on the entity
      // list. Nothing else about the flight changes.
      if (p.hostile) {
        const t = this._traceSelf(_from, _seg, maxT);
        if (t >= 0) {
          _s.copy(_from).addScaledVector(_seg, t);
          _dir.copy(p.vel).normalize();
          this.particles.burst(_s, 6, {
            color: 'blood', dir: _dir, speed: 3.5, size: 0.09, life: 0.5,
          });
          if (!isCreative() && !this.health.dead) {
            const died = this.health.damage(p.dmg, { source: 'arrow' });
            if (!died) {
              this.onSound?.('playerHurt', {});
              this.kick.pitch += 4;
              this.give.pitch += 4 * this.recover;
            }
          }
          this._release(p);
          live.splice(i, 1);
          continue;
        }
      }
      const ent = p.hostile ? null : this._traceEntities(_from, _seg, maxT, p.only);

      if (ent) {
        _s.copy(_from).addScaledVector(_seg, ent.t);
        _dir.copy(p.vel).normalize();
        this._damageEntity(ent.entity, p.dmg, _dir);
        // a rocket that hits a body still goes off: the direct damage above
        // is the bonus for aim, the blast is what the weapon is
        if (p.blast) this._explode(_s, p.blast);
        this._release(p);
        live.splice(i, 1);
        continue;
      }
      // A CHARGE WITH A FUSE ON IT does not go off when it lands. That is
      // the whole difference between dynamite and a rocket: it bounces, it
      // rests where it stops, and it counts down — so you can drop it down a
      // shaft, roll it round a corner, and be somewhere else when it goes.
      if (p.fuse != null) {
        p.fuse -= dt;
        if (p.fuse <= 0) {
          this._explode(_s.copy(p.pos), p.blast);
          this._release(p);
          live.splice(i, 1);
          continue;
        }
        if (tTerrain >= 0) {
          // Landed: kill most of the speed and let what is left slide along
          // the ground, so a stick thrown at a wall drops at its foot rather
          // than sticking to it in mid-air.
          p.pos.copy(_hit).addScaledVector(_tmp.copy(p.vel).normalize(), -0.15);
          _tmp.copy(p.pos).normalize();                      // local up
          p.vel.addScaledVector(_tmp, -p.vel.dot(_tmp));     // drop the fall
          p.vel.multiplyScalar(0.35);                        // and the skid
          this._orientTracer(p);
          continue;
        }
        p.pos.add(_seg);
        this._orientTracer(p);
        continue;
      }
      if (tTerrain >= 0) {
        if (p.blast) {
          _s.copy(_hit);          // _hit is shared scratch: copy before use
          this._explode(_s, p.blast);
        } else {
          // the mark first, while _hit still holds the strike point
          this._placeDecal(_hit, p.vel);
          _dir.copy(p.vel).normalize().negate();
          this.particles.burst(_hit, 5, {
            color: 'dust', dir: _dir, speed: 3, size: 0.08, life: 0.35,
          });
          // a couple of ricochet sparks off the surface — brief, bright, and
          // the thing that sells a bullet as metal meeting rock
          this.particles.burst(_hit, 2, {
            color: 'spark', dir: _dir, speed: 7, size: 0.05,
            life: 0.14, gravity: 0.4,
          });
          // distance, not a position: _hit is shared scratch, and audio.js
          // wants blocks-from-the-ear anyway
          this.onSound?.('impact', { dist: this._earshot(_hit) });
        }
        this._release(p);
        live.splice(i, 1);
        continue;
      }

      p.pos.add(_seg);
      p.travelled += segLen;
      // A rocket rides its own fire: two tongues of flame licking off the
      // tail, and a fat rope of smoke laid out along the flight path — three
      // puffs per frame spaced down the segment, living long enough that a
      // whole crossing hangs in the air behind the shot.
      if (p.blast) {
        _tmp2.copy(p.vel).normalize();
        for (const back of [0.3, 0.6]) {
          _s.copy(p.pos).addScaledVector(_tmp2, -back);
          this.particles.spawn(_s, _dir.copy(_tmp2).multiplyScalar(-3), {
            color: 'flame', size: 0.16 - back * 0.08, life: 0.16, gravity: 0,
          });
        }
        for (const back of [0.15, 0.5, 0.85]) {
          _s.copy(p.pos).addScaledVector(_seg, -back);
          this.particles.spawn(_s, _tmp2.set(0, 0, 0), {
            color: 'smoke', size: 0.18 + Math.random() * 0.08,
            life: 1.1 + Math.random() * 0.5, gravity: -0.05,
          });
        }
      }
      if (p.travelled > p.range || p.life <= 0) {
        // out of fuel: a rocket airbursts rather than vanishing mid-sky
        if (p.blast) this._explode(_s.copy(p.pos), p.blast);
        this._release(p);
        live.splice(i, 1);
        continue;
      }
      this._orientTracer(p);
    }
  }

  // The blast: everything with a body inside `radius` blocks is hurt, more
  // the nearer it stands, and shoved outward — remote players included, since
  // the entity list already carries their adapters when online. main.js's
  // onExplode digs the crater; the shooter is not exempt from their own
  // rocket, only discounted, so point-blank fire is a choice with a price.
  _explode(centre, blast) {
    const radius = blast.radius, dmg = blast.damage;
    // capture every body centre BEFORE any damage lands: a kill swaps the
    // entity's mesh for an empty group at the origin (see _damageEntity)
    const caught = [];
    for (const e of this.entities()) {
      if (!e || e.dead || !e.mesh) continue;
      this._bodyCentre(e, _centre);
      const d = _centre.distanceTo(centre);
      if (d > radius) continue;
      caught.push({
        e, d,
        dir: new THREE.Vector3().copy(_centre).sub(centre).normalize(),
      });
    }
    for (const c of caught) {
      this._damageEntity(c.e, dmg * (1 - c.d / (radius * 1.4)), c.dir);
    }
    const ds = this.player?.eye ? this.player.eye.distanceTo(centre) : Infinity;
    if (ds < radius) {
      this.health.damage(dmg * (1 - ds / (radius * 1.4)) * 0.6,
        { source: 'blast' });
    }
    // The look of it, inside out: a white flash that exists for a tenth of a
    // second, a fireball of flame swelling through it, sparks thrown clear,
    // a shower of debris that falls like debris, and a column of smoke that
    // rises off the crater and hangs. Scaled by the blast radius, so the
    // bazooka's answer is visibly bigger than the launcher's.
    const k = radius / 3;
    this.particles.burst(centre, 6, {
      color: 'flash', speed: 3, size: 0.55 * k, life: 0.1, gravity: 0,
    });
    this.particles.burst(centre, Math.round(18 * k), {
      color: 'flame', speed: 7 * k, size: 0.3, life: 0.32, gravity: -0.1,
    });
    this.particles.burst(centre, Math.round(20 * k), {
      color: 'spark', speed: 13 * k, size: 0.14, life: 0.4, gravity: 0.35,
    });
    this.particles.burst(centre, Math.round(22 * k), {
      color: 'dust', speed: 8 * k, size: 0.22, life: 0.9, gravity: 1.3,
    });
    // the column: smoke biased hard along the local up, slow and long-lived
    if (CS.FLAT) _tmp.set(0, 1, 0);
    else _tmp.copy(centre).normalize();
    this.particles.burst(centre, Math.round(16 * k), {
      color: 'smoke', dir: _tmp, bias: 2.2, speed: 2.2, size: 0.38,
      life: 2.2, gravity: -0.1,
    });
    this.onSound?.('explosion', { dist: this._earshot(centre) });
    this.onExplode?.(centre, radius);
  }

  // --- teardown ----------------------------------------------------------

  reset() {
    for (const p of this.projectiles) this._release(p);
    this.projectiles.length = 0;
    this.reloading = 0;
    this.cooldown = 0;
    this.air = 1;
    this._drownT = 0;
    this.health.respawn();
    this._syncPixelHud(true);
  }

  dispose() {
    pixelHud.hide();
    this.reset();
    for (const kind of Object.keys(this.tracers)) {
      for (const m of this.tracers[kind]) {
        m.parent?.remove(m);
        m.geometry.dispose();
      }
      this.tracers[kind][0]?.material.dispose();
    }
    this.particles.dispose();
    for (const d of this.decals) {
      d.mesh.parent?.remove(d.mesh);
      d.mesh.material.dispose();
    }
    this.decals[0]?.mesh.geometry.dispose();
    this.flash.parent?.remove(this.flash);
    this.flash.geometry.dispose();
    this.flash.material.dispose();
    this.hud?.root.remove();
  }
}

export default Combat;
