// netui.js — everything network-shaped that touches the scene or the DOM:
// remote player avatars, the host/join panel in the start menu, and the
// in-play player list and chat.
//
// net.js stays free of three.js so it can be tested headless; this is where
// the plain arrays it produces become bodies on the planet.

import * as THREE from 'three';
import * as CS from './cubesphere.js';
import { createAvatar, dressAvatar, poseAvatar } from './player.js';
import { buildAtlas, tileUV } from './textures.js';
import { realBodiesOn } from './realbody.js';
import { itemMaterial, terrainMaterial, disposeMats } from './realitem.js';
import { Net, FLAG } from './net.js';

const WALK_SPEED = 6;      // must match player.js or remote strides look wrong
const HELD_TOOL = 0.44;
const HELD_BLOCK = 0.30;
const UV_CORNERS = [[0, 1], [1, 1], [0, 0], [1, 0]];
// same shading as the world blocks: +x, -x, +y, -y, +z, -z
const FACE_SHADES = [0.86, 0.86, 1.0, 0.62, 0.74, 0.74];

const _up = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _back = new THREE.Vector3();
const _m = new THREE.Matrix4();

// ---------------------------------------------------------------------------
// remote avatars
// ---------------------------------------------------------------------------

function nameplate(text, color = '#ffffff') {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d');
  g.font = 'bold 34px "Segoe UI", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 7;
  g.strokeStyle = 'rgba(0,0,0,.75)';   // outline, not a plate: a box would
  g.strokeText(text, 128, 34);         // occlude the head from below
  g.fillStyle = color;                 // gold for a friend, white for the rest
  g.fillText(text, 128, 34);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(cv), transparent: true,
    depthWrite: false, depthTest: false,   // readable through your own build
  }));
  spr.scale.set(1.9, 0.48, 1);
  spr.position.set(0, 2.15, 0);
  spr.renderOrder = 10;
  return spr;
}

// A held item in a remote fist. Same construction as player.js: blocks are a
// small cube, tools a flat sprite whose grip point sits at the origin.
function buildHeld(atlas, tile, kind) {
  if (kind === 1) {
    const geo = new THREE.BoxGeometry(HELD_BLOCK, HELD_BLOCK, HELD_BLOCK);
    const uv = geo.attributes.uv;
    for (let f = 0; f < 6; f++) {
      for (let i = 0; i < 4; i++) {
        const [u, v] = UV_CORNERS[i];
        const [au, av] = tileUV(tile, u, v);
        uv.setXY(f * 4 + i, au, av);
      }
    }
    uv.needsUpdate = true;
    // under the Realistic style, the photograph the block in the ground wears
    const mats = realBodiesOn() ? terrainMaterial(atlas)
      : FACE_SHADES.map((sh) => new THREE.MeshBasicMaterial({
        map: atlas, alphaTest: 0.5, color: new THREE.Color().setScalar(sh),
      }));
    const mesh = new THREE.Mesh(geo, mats);
    const holder = new THREE.Group();
    holder.add(mesh);
    holder.position.set(0, -0.07, -0.10);
    holder.rotation.set(0.10, 0.50, 0.06);
    return holder;
  }
  const geo = new THREE.PlaneGeometry(HELD_TOOL, HELD_TOOL);
  // the Realistic style's repaint of the icon runs 0..1 across its own
  // texture; the atlas wants the tile's own corner of itself
  const real = realBodiesOn();
  if (!real) {
    const uv = geo.attributes.uv;
    for (let i = 0; i < 4; i++) {
      const [u, v] = UV_CORNERS[i];
      const [au, av] = tileUV(tile, u, v);
      uv.setXY(i, au, av);
    }
    uv.needsUpdate = true;
  }
  geo.translate(HELD_TOOL * 0.22, HELD_TOOL * 0.28, 0);
  // the icon's head end must point the way the body faces, and the body faces
  // -Z — the same rule as the face textures
  geo.rotateY(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, real ? itemMaterial(atlas, tile)
    : new THREE.MeshBasicMaterial({ map: atlas, alphaTest: 0.5, side: THREE.DoubleSide }));
  const holder = new THREE.Group();
  holder.add(mesh);
  holder.position.set(0.012, -0.01, 0);
  holder.rotation.set(0.45, 0.70, 0);
  return holder;
}

// The four worn keys as one string, so "has this man changed his armour?" is a
// compare and not a loop. Must agree with net.js's own key or a body would be
// re-dressed on every frame.
const wornKey = (w) => (w ? w.join(',') : '-');

class Avatar {
  constructor(scene, atlas, player, opts = {}) {
    // their character, not the default man — the look rode in on hello/join,
    // and the third argument is what they are WEARING, which arrives
    // separately and may already be here when the body is first built
    this.parts = createAvatar(player.look ?? undefined, null,
      player.armour ?? null);
    this.wornKey = wornKey(player.armour ?? null);
    this.group = this.parts.group;
    this.atlas = atlas;
    this.look = player.look ?? null;    // compared by RemoteAvatars to rebuild
    this.group.add(nameplate(player.name,
      opts.friend ? '#ffd76a' : '#ffffff'));
    scene.add(this.group);
    this.swingK = 0;
    this.flyBlend = 0;              // matches the local player's, see player.js
    this.t = Math.random() * 100;   // desync the idle breathing between players
    this.heldKey = null;
    this.heldMesh = null;
  }

  setHeld(tile, kind) {
    // the style is in the key: a change of style rebuilds what they carry
    const key = kind ? `${tile}:${kind}:${realBodiesOn() ? 1 : 0}` : null;
    if (key === this.heldKey) return;
    this.heldKey = key;
    if (this.heldMesh) {
      this.heldMesh.parent?.remove(this.heldMesh);
      this.heldMesh.traverse((o) => {
        o.geometry?.dispose();
        disposeMats(o.material);
      });
      this.heldMesh = null;
    }
    if (!key || tile < 0) return;
    this.heldMesh = buildHeld(this.atlas, tile, kind);
    this.parts.handAnchor.add(this.heldMesh);
  }

  // Put on, or take off, what the wire says they are wearing. dressAvatar and
  // nothing else: it adds and removes its own plates and leaves the rig alone,
  // so a helmet does not cost the walk cycle its phase — and it is the same
  // routine that dresses your own body, so nobody can end up with two
  // different ideas of what a breastplate looks like.
  setWorn(worn) {
    const key = wornKey(worn ?? null);
    if (key === this.wornKey) return;
    this.wornKey = key;
    dressAvatar(this.parts, worn ?? null);
  }

  update(p, dt) {
    if (!p.ready) { this.group.visible = false; return; }
    this.group.visible = true;
    this.t += dt;
    this.setWorn(p.armour);

    // The body frame, and the one thing in this file that is easy to get
    // wrong: player.js builds it as makeBasis(right, up, -forward), so the
    // avatar's local +Z points BACKWARD. Copy the construction exactly — a
    // sign flip here puts the face on the back of the head.
    _up.set(p.pos[0], p.pos[1], p.pos[2]);
    if (_up.lengthSq() < 1e-9) return;
    this.group.position.copy(_up);
    // remote bodies stand along the local up: radial on a globe, +Y on the
    // drafting table — normalizing a plane position would tip them over
    if (CS.FLAT) _up.set(0, 1, 0);
    else _up.normalize();
    _fwd.set(p.forward[0], p.forward[1], p.forward[2]);
    _fwd.addScaledVector(_up, -_fwd.dot(_up));       // project onto the tangent
    if (_fwd.lengthSq() < 1e-8) _fwd.set(_up.y, _up.z, -_up.x);
    _fwd.normalize();
    _right.crossVectors(_fwd, _up);
    _back.copy(_fwd).negate();
    _m.makeBasis(_right, _up, _back);
    this.group.quaternion.setFromRotationMatrix(_m);

    const swinging = (p.flags & FLAG.SWINGING) ? 1 : 0;
    this.swingK += (swinging - this.swingK) * Math.min(1, dt * 14);
    // A flying player is carried, not walking, so their stride goes to nothing
    // the same way yours does — otherwise everyone else sees you paddling
    // across the sky. Blended here too, and at the same rate, so the friend
    // who lifts off in front of you eases out of the walk rather than
    // snapping.
    const flying = (p.flags & FLAG.FLYING) ? 1 : 0;
    this.flyBlend += (flying - this.flyBlend) * Math.min(1, dt * 8);
    const amp = Math.min(0.55, p.speed / WALK_SPEED * 0.55) * (1 - this.flyBlend);
    poseAvatar(this.parts, p.walkPhase, amp, this.t,
      this.swingK, 0.5 + 0.5 * Math.sin(this.t * 22));
    this.setHeld(p.held, p.heldKind);
  }

  dispose(scene) {
    scene.remove(this.group);
    this.group.traverse((o) => {
      o.geometry?.dispose();
      for (const m of [o.material].flat()) {
        // The nameplate's canvas belongs to this player and nobody else, so it
        // goes with them. Every other map on this body does NOT: skins are
        // cached per look and a harness is cached per metal, and freeing one
        // of those here blanks the next man to wear it. The materials are
        // per-mesh wrappers and are ours to free either way.
        if (o.isSprite) m?.map?.dispose?.();
        m?.dispose?.();
      }
    });
  }
}

// Keeps one Avatar per remote player alive. Call update(dt) once a frame,
// after net.update(dt).
export class RemoteAvatars {
  constructor(scene, net, opts = {}) {
    this.scene = scene;
    this.net = net;
    this.atlas = opts.atlas ?? buildAtlas();
    this.isFriend = opts.isFriend ?? (() => false);   // (RemotePlayer) -> bool
    // What OUR body is wearing, for the one message that goes the other way.
    // Player.setArmour has already reduced the four slots to four material
    // keys and keeps them on `worn`, so there is nothing to work out here.
    //
    // The default reads the page's own player, because this class is handed a
    // scene and a net and never a body. main.js should pass `armour: () =>
    // player.worn` the next time it is opened and this line will step out of
    // the way — it is a stopgap, and it is guarded so that a harness on the
    // wire is never worth a crash.
    this.localArmour = opts.armour
      ?? (() => globalThis.__player?.worn ?? null);
    this.avatars = new Map();
    net.on('leave', ({ id }) => this.drop(id));
  }

  drop(id) {
    const a = this.avatars.get(id);
    if (a) { a.dispose(this.scene); this.avatars.delete(id); }
  }

  // friend colours live in baked nameplate textures, so a change to the
  // friend list rebuilds the bodies — a few players, a few canvases, nothing
  refresh() {
    for (const id of [...this.avatars.keys()]) this.drop(id);
  }

  update(dt) {
    // Our own harness first: net.sendArmour compares the four keys and says
    // nothing at all when they are the same, so asking every frame costs one
    // join and no traffic.
    try { this.net.sendArmour(this.localArmour()); }
    catch { /* no body yet — there is nothing to announce */ }
    for (const [id, p] of this.net.players) {
      let a = this.avatars.get(id);
      // a reconnect can hand the same session id a different character
      if (a && a.look !== p.look) { this.drop(id); a = null; }
      if (!a) {
        a = new Avatar(this.scene, this.atlas, p, { friend: this.isFriend(p) });
        this.avatars.set(id, a);
      }
      a.update(p, dt);
    }
    for (const id of [...this.avatars.keys()]) {
      if (!this.net.players.has(id)) this.drop(id);
    }
  }

  dispose() {
    for (const id of [...this.avatars.keys()]) this.drop(id);
  }
}

// ---------------------------------------------------------------------------
// the join panel and in-play HUD
// ---------------------------------------------------------------------------

const CSS = `
#netPanel { margin-top: 18px; padding-top: 16px; text-align: left;
  border-top: 1px solid rgba(255,255,255,.14); font-size: 13px; }
#netPanel h2 { margin: 0 0 8px; font-size: 14px; color: #fff;
  letter-spacing: .4px; font-weight: 600; }
#netPanel .row { display: flex; gap: 6px; margin: 7px 0; }
#netPanel input { flex: 1; min-width: 0; padding: 8px 9px; border-radius: 6px;
  background: #131b2e; color: #e6ecf7; border: 1px solid rgba(255,255,255,.18);
  font: 13px "Segoe UI", system-ui, sans-serif; }
#netPanel button { padding: 8px 13px; border: 0; border-radius: 6px;
  cursor: pointer; background: #2f5fa8; color: #fff;
  font: 600 13px "Segoe UI", sans-serif; white-space: nowrap; }
#netPanel button:hover { background: #3d78d8; }
#netPanel button.ghost { background: #1b2438; color: #9fb4d8; }
#netPanel .note { opacity: .62; font-size: 12px; line-height: 1.6; margin: 6px 0; }
#netPanel code { background: #0a1020; padding: 1px 5px; border-radius: 4px;
  font: 12px Consolas, monospace; color: #a8c7ff; }
#netPanel .urls { font: 12px Consolas, monospace; color: #a8c7ff;
  line-height: 1.7; word-break: break-all; }
#netPanel .st { margin-top: 8px; font-size: 12px; min-height: 15px; }
#netPanel .st.on { color: #7fe0a0; } #netPanel .st.err { color: #ff9d8a; }
#netFriends { margin-top: 10px; }
#netFriends .fr { display: flex; align-items: center; gap: 7px;
  padding: 3px 0; font-size: 12.5px; color: #cfd8ea; }
#netFriends .dot { width: 8px; height: 8px; border-radius: 50%;
  background: #3a4358; flex: none; }
#netFriends .fr.on .dot { background: #7fe0a0; }
#netFriends .fr .nm { flex: 1; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; }
#netFriends .fr.on .nm { color: #ffd76a; }
#netFriends button { padding: 2px 8px; font-size: 11px; }
#netHud { position: fixed; left: 14px; bottom: 16px; display: none;
  max-width: 340px; color: #cfd8ea; pointer-events: none;
  font: 12px "Segoe UI", system-ui, sans-serif;
  text-shadow: 0 1px 3px rgba(0,0,0,.9); }
#netHud .who { opacity: .8; margin-bottom: 3px; }
#netOnline { pointer-events: auto; margin-bottom: 6px;
  background: rgba(10,14,24,.72); border: 1px solid rgba(255,255,255,.12);
  border-radius: 7px; padding: 6px 9px; max-width: 300px; }
#netOnline:empty { display: none; }
#netOnline .oh { font-weight: 600; color: #fff; opacity: .85;
  margin-bottom: 2px; }
#netOnline .op { display: flex; align-items: center; gap: 7px; padding: 2px 0; }
#netOnline .op .dot { width: 7px; height: 7px; border-radius: 50%;
  background: #7fe0a0; flex: none; }
#netOnline .op .nm { color: #fff; max-width: 110px; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
#netOnline .op.fr .nm { color: #ffd76a; }
#netOnline .op .dist { opacity: .68; flex: 1; font-variant-numeric: tabular-nums; }
#netOnline .op .tag { opacity: .68; }
#netOnline button { padding: 2px 9px; border: 0; border-radius: 5px;
  cursor: pointer; background: #2f5fa8; color: #fff;
  font: 600 11px "Segoe UI", sans-serif; white-space: nowrap; }
#netOnline button:hover { background: #3d78d8; }
#netOnline button.acc { background: #2c7a4b; }
#netOnline button.acc:hover { background: #379659; }
#netHud .log div { line-height: 1.5; }
#netChat { display: none; pointer-events: auto; width: 320px; margin-top: 5px;
  padding: 6px 8px; border-radius: 6px; background: rgba(10,14,24,.85);
  border: 1px solid rgba(255,255,255,.2); color: #fff;
  font: 13px "Segoe UI", system-ui, sans-serif; }
`;

// Builds its own DOM rather than touching index.html, so the page shell and
// this module can be edited independently.
export class NetUI {
  // opts:
  //   net           a Net instance
  //   worldWish()   -> { radius, seed } to propose when hosting
  //   onWorld(w)    called with the authoritative { radius, seed, edits, ... }
  //   onMessage(s)  optional; routed to main.js's flash()
  constructor(opts = {}) {
    this.net = opts.net ?? new Net();
    this.worldWish = opts.worldWish ?? (() => null);
    this.onWorld = opts.onWorld ?? (() => {});
    this.onMessage = opts.onMessage ?? (() => {});
    this.onFriends = opts.onFriends ?? (() => {});   // plates/markers recolour
    this.localPos = opts.localPos ?? (() => null);   // for "42 blocks away"
    this.onInfo = opts.onInfo ?? null;   // every /net-info answer, for the corner panel
    this.lines = [];
    // Friendship is a handshake, not a bookmark: you REQUEST, they ACCEPT,
    // and only then are you on each other's lists. Session-scoped state —
    // an unanswered request simply asks again next time.
    this.pendingOut = new Set();   // session ids I have asked
    this.pendingIn = new Map();    // session id -> { name, pid } asking me
    // pid -> name. Stored locally: the server has no accounts, so a friend
    // list is a private address book, not a shared social graph.
    try {
      this.friends = JSON.parse(
        localStorage.getItem('planetcraft.friends') || '{}');
    } catch { this.friends = {}; }
    if (typeof this.friends !== 'object' || !this.friends) this.friends = {};
    this.build();
    this.wire();
    this.probe();
  }

  isFriend(pid) { return !!(pid && this.friends[pid]); }

  addFriend(pid, name) {
    if (!pid) return;
    this.friends[pid] = String(name || 'player').slice(0, 24);
    this.saveFriends();
  }

  // --- the handshake, over the relay's opaque event channel ----------------

  requestFriend(id) {
    const p = this.net.players.get(id);
    if (!p || this.pendingOut.has(id)) return;
    this.pendingOut.add(id);
    this.net.sendEvent({ kind: 'fr', to: id });
    this.say(`friend request sent to ${p.name}`);
    this.refreshOnline();
    this.refreshFriends();
  }

  acceptFriend(id) {
    const asked = this.pendingIn.get(id);
    const p = this.net.players.get(id);
    if (!asked && !p) return;
    this.pendingIn.delete(id);
    this.net.sendEvent({ kind: 'fa', to: id });
    this.addFriend(p?.pid ?? asked.pid, p?.name ?? asked.name);
    this.say(`you and ${p?.name ?? asked.name} are friends now`);
    this.refreshOnline();
  }

  _onFriendEvent(msg) {
    if (msg.to !== this.net.id) return;
    const other = this.net.players.get(msg.id);
    if (!other) return;
    if (msg.kind === 'fr') {
      // they asked. If they are already on my list — say I re-added them by
      // hand last week — there is nothing to decide: answer yes silently.
      if (this.isFriend(other.pid)) {
        this.net.sendEvent({ kind: 'fa', to: msg.id });
        return;
      }
      this.pendingIn.set(msg.id, { name: other.name, pid: other.pid });
      this.say(`${other.name} wants to be your friend — accept in the list`);
    } else if (msg.kind === 'fa') {
      // they said yes
      this.pendingOut.delete(msg.id);
      this.addFriend(other.pid, other.name);
      this.say(`${other.name} accepted — you are friends now`);
    }
    this.refreshOnline();
    this.refreshFriends();
  }

  removeFriend(pid) {
    delete this.friends[pid];
    this.saveFriends();
  }

  saveFriends() {
    try {
      localStorage.setItem('planetcraft.friends', JSON.stringify(this.friends));
    } catch { /* storage full or blocked — the list still works this session */ }
    this.refreshFriends();
    this.refreshWho();
    this.onFriends();
  }

  build() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    const panel = document.createElement('div');
    panel.id = 'netPanel';
    panel.innerHTML = `
      <h2>Play together</h2>
      <div class="note" id="netHostNote">looking for a co-op server…</div>
      <div class="urls" id="netUrls"></div>
      <div class="row">
        <input id="netName" maxlength="24" placeholder="your name">
        <button id="netHostBtn">Join this world</button>
      </div>
      <div class="row">
        <input id="netAddr" placeholder="or a friend's address, e.g. 192.168.1.5">
        <button id="netJoinBtn" class="ghost">Join</button>
      </div>
      <div class="st" id="netStatus"></div>
      <div id="netFriends"></div>`;
    // Sits in the "new world" screen, under the Create button: every world
    // you make is served to the network, so the door into it belongs beside
    // the thing that makes it. Falls back to the card, then to the page, if
    // the shell ever changes shape again.
    (document.getElementById('netHome') ?? document.getElementById('menuCard')
      ?? document.body).appendChild(panel);

    const hud = document.createElement('div');
    hud.id = 'netHud';
    hud.innerHTML = '<div id="netOnline"></div>'
      + '<div class="who"></div><div class="log"></div>'
      + '<input id="netChat" maxlength="200" placeholder="say something · enter to send">';
    document.body.appendChild(hud);

    this.panel = panel;
    this.hud = hud;
    this.onlineEl = hud.querySelector('#netOnline');
    this.who = hud.querySelector('.who');
    this.log = hud.querySelector('.log');
    this.chat = hud.querySelector('#netChat');
    this.statusEl = panel.querySelector('#netStatus');
    this.nameEl = panel.querySelector('#netName');
    this.addrEl = panel.querySelector('#netAddr');
    this.hostBtn = panel.querySelector('#netHostBtn');
    this.joinBtn = panel.querySelector('#netJoinBtn');
    this.hostNote = panel.querySelector('#netHostNote');
    this.urlsEl = panel.querySelector('#netUrls');
    this.friendsEl = panel.querySelector('#netFriends');
    this.refreshFriends();

    // NO INVENTED NAME. This used to fall back to "player 47" — a seat
    // number, not a name, and a different one every time until you happened
    // to open this panel and type something. main.js asks for a name before
    // anything else and writes it here; this field is the same setting seen
    // from the co-op panel.
    this.nameEl.value = localStorage.getItem('planetcraft.name') || '';
    this.addrEl.value = localStorage.getItem('planetcraft.addr') || '';
    this.hostBtn.disabled = true;
  }

  wire() {
    const join = (url) => {
      this.net.name = this.nameEl.value.trim()
        || localStorage.getItem('planetcraft.name') || 'player';
      localStorage.setItem('planetcraft.name', this.net.name);
      this.net.connect(url, this.worldWish());
    };
    // one handler that branches, not an onclick layered over a listener: the
    // second form leaves the join handler attached and "Leave" fires both
    this.hostBtn.addEventListener('click', () => {
      if (this.net.connected) this.net.close();
      else join(Net.ownUrl());
    });
    this.joinBtn.addEventListener('click', () => {
      const url = Net.resolve(this.addrEl.value);
      if (!url) return this.setStatus('err', 'type an address first');
      localStorage.setItem('planetcraft.addr', this.addrEl.value.trim());
      join(url);
    });
    this.addrEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.joinBtn.click();
      e.stopPropagation();       // the game listens on document for WASD
    });
    this.nameEl.addEventListener('keydown', (e) => e.stopPropagation());

    this.chat.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = this.chat.value.trim();
        if (text) { this.net.sendChat(text); this.say(`you: ${text}`); }
        this.chat.value = '';
        this.blurChat();
      } else if (e.key === 'Escape') {
        this.chat.value = '';
        this.blurChat();
      }
    });

    this.net.on('status', ({ status, message }) => {
      const cls = status === 'online' ? 'on' : status === 'error' ? 'err' : '';
      const label = { online: 'connected', connecting: 'connecting…',
        offline: 'not connected', error: 'failed' }[status] ?? status;
      this.setStatus(cls, message ? `${label} — ${message}` : label);
      this.hud.style.display = status === 'online' ? 'block' : 'none';
      this.hostBtn.textContent = status === 'online' ? 'Leave' : 'Join this world';
      // the distances tick along while connected; asking once a second is
      // plenty for a number that changes at walking pace
      if (status === 'online' && !this._onlineTimer) {
        this._onlineTimer = setInterval(() => this.refreshOnline(), 1000);
      } else if (status !== 'online' && this._onlineTimer) {
        clearInterval(this._onlineTimer);
        this._onlineTimer = null;
        this.pendingOut.clear();
        this.pendingIn.clear();
        this.refreshOnline();
      }
      this.refreshWho();
    });
    this.net.on('event', (m) => {
      if (m.kind === 'fr' || m.kind === 'fa') this._onFriendEvent(m);
    });
    this.net.on('welcome', (w) => {
      this.say(`joined — radius ${w.radius}, ${w.count} blocks changed so far`);
      this.refreshWho();
      this.refreshFriends();
      try { this.onWorld(w); } catch (e) { console.warn('net: onWorld failed', e); }
    });
    this.net.on('join', ({ name }) => {
      this.say(`${name} joined`); this.refreshWho(); this.refreshFriends();
    });
    this.net.on('leave', ({ name }) => {
      this.say(`${name} left`); this.refreshWho(); this.refreshFriends();
    });
    this.net.on('chat', ({ name, text }) => this.say(`${name}: ${text}`));
  }

  // Look for a co-op server at this page's own origin. If the page came from
  // plain serve.py there is none, and the panel says how to start one instead
  // of offering a button that cannot work.
  async probe() {
    const info = await Net.probe('');
    // Watch, don't ask once: a friend joining while you sit in the menu
    // should appear in the note without a reload. The timer re-arms while
    // CONNECTED too now — the corner panel (onInfo) reads player counts and
    // the server's own log lines from this probe, and the usual window-mode
    // session is connected to itself from the first minute.
    clearTimeout(this._probeTimer);
    this._probeTimer = setTimeout(() => this.probe(), 5000);
    if (!info) {
      this.hostNote.innerHTML =
        'This page is not being served by a co-op server. Stop it and run ' +
        '<code>python server.py</code> instead — same game, same port, but ' +
        'everyone who opens it shares one planet.';
      this.hostBtn.disabled = true;
      this.onInfo?.(null);
      return;
    }
    this.info = info;
    // main.js's corner panel shows what the server terminal used to say
    this.onInfo?.(info);
    this.hostBtn.disabled = false;
    // names beat a count: "bob is in there right now" is what makes someone
    // press the button
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const who = (info.names ?? []).slice(0, 6).map(esc).join(', ');
    this.hostNote.innerHTML = info.radius
      ? `A shared planet is running here — radius ${info.radius}, ` +
        `${info.edits} blocks changed. ` +
        (who ? `<b>Playing right now: ${who}.</b> `
          : 'Nobody in it at the moment. ') +
        'Send a friend:'
      : 'A co-op server is running here and has no planet yet — the first ' +
        'person to join picks the size. Send a friend:';
    this.urlsEl.innerHTML = (info.lan?.length ? info.lan : ['localhost'])
      .map((ip) => `http://${ip}:${info.port}`).join('<br>');
  }

  worldFor(radius, seed) { this.pending = { radius, seed }; }

  // Is there a co-op server behind this page? `probe` sets this.info when
  // there is. main.js asks before offering a world to the network — on plain
  // serve.py there is nobody to offer it to.
  canHost() { return !!this.info; }

  // The name to play under, remembered between sessions. main.js needs it
  // when it connects on the player's behalf rather than through the button.
  playerName() {
    // The stored name FIRST: it is the one the player was asked for and the
    // one every other screen shows. The field is only the co-op panel's view
    // of it, and it may be empty on a page where that panel was never opened.
    const kept = (localStorage.getItem('planetcraft.name') || '').trim();
    const n = this.nameEl?.value.trim();
    return kept || n || 'player';
  }

  setStatus(cls, text) {
    this.statusEl.className = `st ${cls}`;
    this.statusEl.textContent = text;
  }

  // Names and chat come off the wire, so the log is built from text nodes
  // rather than innerHTML — no escaping to get wrong.
  say(line) {
    this.lines.push(line);
    if (this.lines.length > 6) this.lines.shift();
    this.log.replaceChildren(...this.lines.map((l) => {
      const d = document.createElement('div');
      d.textContent = l;
      return d;
    }));
    this.onMessage(line);
  }

  refreshWho() {
    const n = this.net.players.size;
    this.who.textContent = this.net.connected
      ? `${n + 1} online${n ? ': you, ' + [...this.net.players.values()]
        .map((p) => (this.isFriend(p.pid) ? `★ ${p.name}` : p.name)).join(', ')
        : ' (just you so far)'}`
      : '';
  }

  // The right-hand end of a player row: what you can DO about this person.
  // Shared by the menu list and the in-play panel so the two never disagree.
  _actionFor(id, p) {
    const mk = (tag, cls, text, onClick) => {
      const el = document.createElement(tag);
      el.className = cls;
      el.textContent = text;
      if (onClick) el.addEventListener('click', onClick);
      return el;
    };
    if (this.isFriend(p.pid)) return mk('span', 'tag', '★ friend');
    if (this.pendingIn.has(id)) {
      return mk('button', 'acc', 'accept ✓', () => this.acceptFriend(id));
    }
    if (this.pendingOut.has(id)) return mk('span', 'tag', 'requested…');
    return mk('button', '', 'request friend', () => this.requestFriend(id));
  }

  // The in-play panel: everyone online around you, how far away they are,
  // and the friendship handshake. Rebuilt once a second while connected.
  refreshOnline() {
    if (!this.onlineEl) return;
    this.onlineEl.replaceChildren();
    if (!this.net.connected || !this.net.players.size) return;
    const head = document.createElement('div');
    head.className = 'oh';
    head.textContent = `online with you — ${this.net.players.size + 1} in this world`;
    this.onlineEl.append(head);
    const mine = this.localPos();
    for (const [id, p] of this.net.players) {
      const row = document.createElement('div');
      row.className = 'op' + (this.isFriend(p.pid) ? ' fr' : '');
      const dot = document.createElement('span');
      dot.className = 'dot';
      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = p.name;
      const dist = document.createElement('span');
      dist.className = 'dist';
      if (mine && p.ready) {
        const d = Math.hypot((mine.x ?? mine[0]) - p.pos[0],
          (mine.y ?? mine[1]) - p.pos[1], (mine.z ?? mine[2]) - p.pos[2]);
        dist.textContent = `${Math.round(d)} blocks away`;
      }
      row.append(dot, nm, dist, this._actionFor(id, p));
      this.onlineEl.append(row);
    }
  }

  // The address book, and the people in the room who are not yet in it.
  // Built from createElement rather than innerHTML: names come off the wire.
  refreshFriends() {
    if (!this.friendsEl) return;
    this.friendsEl.replaceChildren();
    const online = new Map();     // pid -> [session id, RemotePlayer]
    for (const [id, p] of this.net.players) {
      if (p.pid) online.set(p.pid, [id, p]);
    }
    const row = (cls, name, tail) => {
      const d = document.createElement('div');
      d.className = `fr ${cls}`;
      const dot = document.createElement('span');
      dot.className = 'dot';
      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = name;
      d.append(dot, nm);
      if (tail) d.append(tail);
      this.friendsEl.append(d);
    };
    const btn = (text, onClick) => {
      const b = document.createElement('button');
      b.className = 'ghost';
      b.textContent = text;
      b.addEventListener('click', onClick);
      return b;
    };
    const pids = Object.keys(this.friends);
    if (pids.length) {
      const h = document.createElement('h2');
      h.textContent = 'Friends';
      this.friendsEl.append(h);
      for (const pid of pids) {
        const live = online.get(pid);
        // a friend who renamed themselves keeps their entry, under the new name
        if (live) this.friends[pid] = live[1].name;
        row(live ? 'on' : '', this.friends[pid],
          btn('remove', () => this.removeFriend(pid)));
      }
    }
    const strangers = [...online.values()].filter(([, p]) => !this.isFriend(p.pid));
    if (strangers.length) {
      const h = document.createElement('h2');
      h.textContent = 'Online now';
      this.friendsEl.append(h);
      for (const [id, p] of strangers) row('on', p.name, this._actionFor(id, p));
    }
  }

  // main.js routes a key (T is the usual one) here to type a message
  focusChat() {
    if (!this.net.connected) return false;
    this.chat.style.display = 'block';
    this.chat.focus();
    return true;
  }

  blurChat() {
    this.chat.style.display = 'none';
    this.chat.blur();
  }

  get chatOpen() { return this.chat.style.display === 'block'; }
}

export default NetUI;
