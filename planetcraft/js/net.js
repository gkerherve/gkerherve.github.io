// net.js — LAN multiplayer transport for PlanetCraft.
//
// The planet is a pure function of (radius, seed, preset) and the designs its
// villages were built from, so nothing here ever ships a block of terrain. It
// ships that identity, the diffs, and where everybody is.
//
// This module has NO three.js import on purpose: it is pure protocol and
// interpolation, so it can be exercised from node with the built-in WebSocket
// and does not need a display to test. Rendering lives in netui.js.
//
// Nothing in here may throw into the game loop. Every callback is wrapped,
// every send is a no-op when the socket is not open, and a dropped connection
// leaves the game running exactly as it does single player.

export const NET_PROTOCOL = 1;

// Render remote players this far in the past. At a 10 Hz tick a snapshot
// arrives every 100 ms, so 120 ms of delay means there is almost always a
// later snapshot to interpolate *toward* — without it every player would be
// extrapolating, which overshoots on every direction change.
const INTERP_MS = 120;

// Edits per outbound message. 2000 five-int tuples is ~90 kB of JSON, well
// under the server's 1 MB frame limit, and normal play never reaches two.
const EDITS_PER_MSG = 2000;

// Flags packed into the state message. Cheaper than four booleans and it
// keeps the hottest message a fixed shape.
export const FLAG = {
  SWINGING: 1,   // mining or hitting; drives the avatar's swing blend
  ARMED: 2,      // weapon drawn
  IN_WATER: 4,
  GROUNDED: 8,
  // creative flight, so a flying body is not drawn walking through the air.
  // An older client simply never sets the bit and is read as not flying,
  // which is what it looked like before the bit existed.
  FLYING: 16,
};

const r2 = (n) => Math.round(n * 100) / 100;     // ~1 cm, plenty on a voxel grid
const r3 = (n) => Math.round(n * 1000) / 1000;   // unit vectors want more digits

// The four worn pieces, in ARMOUR_SLOTS order — helmet, chestplate, leggings,
// boots — each a material key or null. Never trust the wire: four entries,
// short strings only, and four nulls collapse to "wearing nothing" so that a
// stripped man and a man who never sent anything are the same man.
function cleanWorn(w) {
  if (!Array.isArray(w)) return null;
  const out = [];
  for (let i = 0; i < 4; i++) {
    const s = w[i];
    out.push(typeof s === 'string' && s ? s.slice(0, 16) : null);
  }
  return out.some(Boolean) ? out : null;
}

const wornKey = (w) => (w ? w.join(',') : '-');

// unpack the base64 Int32 stream the server (and js/save.js) use for edits
function unpackEdits(b64) {
  if (!b64) return [];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const a = new Int32Array(bytes.buffer, 0, bytes.length >> 2);
  const out = [];
  for (let i = 0; i + 4 < a.length; i += 5) {
    out.push([a[i], a[i + 1], a[i + 2], a[i + 3], a[i + 4]]);
  }
  return out;
}

// atob exists in browsers; node has Buffer. One line keeps this module usable
// from a node test harness without pulling in a polyfill.
const atob = globalThis.atob
  ?? ((s) => Buffer.from(s, 'base64').toString('binary'));

// ---------------------------------------------------------------------------
// a remote player
// ---------------------------------------------------------------------------

// Holds the snapshot buffer and the interpolated pose. `pos` and `forward` are
// plain arrays so this file stays three-free; netui.js copies them into
// Vector3s.
class RemotePlayer {
  constructor(id, name, pid = null, look = null) {
    this.id = id;
    this.name = name || `player ${id}`;
    this.pid = pid;         // stable identity across sessions; friend lists key on it
    this.look = look;       // the character JSON, so their avatar is THEIR avatar
    // What they are WEARING, which is not part of who they are: a look is a
    // body and armour is what got put on it this morning. Seeded from the look
    // for the day one carries a harness of its own — createAvatar already
    // reads `look.armour` — and replaced by the first `wear` event.
    this.armour = cleanWorn(look?.armour);
    this.buf = [];                   // [{ T, s }] oldest first
    this.pos = [0, 0, 0];
    this.forward = [0, 0, -1];
    this.pitch = 0;
    this.held = -1;                  // atlas tile of the held item, -1 = empty
    this.heldKind = 0;               // 0 none, 1 block, 2 tool
    this.flags = 0;
    this.speed = 0;                  // blocks/s, derived; drives the walk cycle
    this.walkPhase = 0;              // integrated locally, never sent
    this.ready = false;              // has at least one snapshot
  }

  push(T, s) {
    this.buf.push({ T, s });
    if (this.buf.length > 32) this.buf.shift();
  }

  // Interpolate to server-clock time `rt`. Falls back to the newest snapshot
  // when the buffer has not caught up yet, so a stalled connection freezes the
  // avatar in place rather than teleporting it.
  sample(rt, dt) {
    const b = this.buf;
    if (!b.length) return;
    let i = b.length - 1;
    while (i > 0 && b[i].T > rt) i--;
    const a = b[i];
    const c = b[i + 1];
    let s = a.s, k = 0;
    if (c && c.T > a.T) {
      k = Math.min(1, Math.max(0, (rt - a.T) / (c.T - a.T)));
      s = a.s;
    }
    const q = c ? c.s : a.s;

    for (let j = 0; j < 3; j++) this.pos[j] = s[j] + (q[j] - s[j]) * k;
    // facing is a unit vector; lerp then renormalise. Slerp would be more
    // correct but the angle between two 100 ms samples is small enough that
    // the difference is invisible and this costs one sqrt.
    let fx = s[3] + (q[3] - s[3]) * k;
    let fy = s[4] + (q[4] - s[4]) * k;
    let fz = s[5] + (q[5] - s[5]) * k;
    const len = Math.hypot(fx, fy, fz) || 1;
    this.forward[0] = fx / len;
    this.forward[1] = fy / len;
    this.forward[2] = fz / len;
    this.pitch = s[6] + (q[6] - s[6]) * k;
    this.held = q[7];
    this.heldKind = q[8];
    this.flags = q[9];

    // Speed drives the stride length, and it has to be measured over a window
    // rather than one snapshot pair: the server ticks on its own clock, so
    // whenever it relays a state the sender had not refreshed the pair is
    // identical and the naive estimate drops to zero — a visible stutter in
    // the walk cycle. Take the newest ~250 ms and smooth what comes out.
    const n = b.length;
    if (n >= 2) {
      const last = b[n - 1];
      let j = n - 2;
      while (j > 0 && last.T - b[j].T < 250) j--;
      const span = last.T - b[j].T;
      if (span > 0) {
        const d = Math.hypot(last.s[0] - b[j].s[0], last.s[1] - b[j].s[1],
          last.s[2] - b[j].s[2]);
        this.speed += (d / (span / 1000) - this.speed) * Math.min(1, dt * 8);
      }
    }
    this.walkPhase += this.speed * dt * 1.9;    // same constant as player.js
    this.ready = true;

    // drop snapshots we can no longer need
    while (this.buf.length > 2 && this.buf[1].T < rt - 1000) this.buf.shift();
  }
}

// ---------------------------------------------------------------------------
// Net
// ---------------------------------------------------------------------------

export class Net {
  // opts:
  //   name       display name sent with hello
  //   tickHz     how often our own state goes out (default 10, match server)
  //   autoRetry  reconnect on an unexpected close (default true)
  constructor(opts = {}) {
    this.name = opts.name || 'player';
    // `look` may be a value or a getter — the menu's chosen character is not
    // known until the join button is pressed, so a getter reads it late.
    this.look = opts.look ?? null;
    // ...and what we are wearing, the same way: a value or a getter. Read at
    // the net's own tick and sent only when it has changed — see setArmour.
    this.armour = opts.armour ?? null;
    this.worn = null;          // the last four keys we announced
    this._wornKey = null;      // null forces the next check to announce again
    this.pid = opts.pid ?? Net.identity();
    this.tickHz = opts.tickHz || 10;
    this.autoRetry = opts.autoRetry !== false;
    this.ws = null;
    this.url = null;
    this.id = 0;
    this.status = 'offline';    // offline | connecting | online | error
    this.message = '';
    this.world = null;          // { radius, seed } once welcomed
    this.players = new Map();   // id -> RemotePlayer
    this.rtt = 0;               // ms, from the last ping
    this.handlers = Object.create(null);
    this.pending = [];          // edits queued for the next flush
    this.wish = null;           // { radius, seed } we proposed
    this.renderTime = null;     // server-clock ms we are rendering at
    this.latestT = 0;
    this.attempts = 0;
    this._sendAcc = 0;
    this._pingAcc = 0;
    this._lastState = null;
    this.stats = { sent: 0, recv: 0, msgsSent: 0, msgsRecv: 0, since: Date.now() };
  }

  // on('welcome'|'join'|'leave'|'edit'|'chat'|'event'|'status', fn)
  on(evt, fn) {
    (this.handlers[evt] ??= []).push(fn);
    return this;
  }

  // A listener that throws must not stop the others, and must never reach the
  // render loop.
  emit(evt, arg) {
    for (const fn of this.handlers[evt] ?? []) {
      try { fn(arg); } catch (e) { console.warn(`net: ${evt} handler failed`, e); }
    }
  }

  get connected() { return this.status === 'online'; }

  setStatus(status, message = '') {
    this.status = status;
    this.message = message;
    this.emit('status', { status, message });
  }

  // Turn whatever the user typed into a websocket URL. "192.168.1.5",
  // "192.168.1.5:8123", "http://box.local:8123" and a full ws:// URL all work,
  // because nobody types "ws://host:port/ws" correctly the first time.
  static resolve(input, fallbackPort = 8123) {
    let s = String(input || '').trim();
    if (!s) return null;
    if (/^wss?:\/\//i.test(s)) return s.replace(/\/+$/, '').endsWith('/ws') ? s : s.replace(/\/+$/, '') + '/ws';
    s = s.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    const secure = typeof location !== 'undefined' && location.protocol === 'wss:';
    if (!/:\d+$/.test(s)) s += `:${fallbackPort}`;
    return `${secure ? 'wss' : 'ws'}://${s}/ws`;
  }

  // A stable identity for THIS browser, minted once and kept. It is what a
  // friend list keys on: session ids are integers the server reuses, and
  // names are whatever was typed that day.
  static identity() {
    try {
      let pid = localStorage.getItem('planetcraft.pid');
      if (!pid) {
        pid = (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${
          Math.random().toString(36).slice(2, 10)}`);
        localStorage.setItem('planetcraft.pid', pid);
      }
      return pid;
    } catch { return null; }   // node test harness has no localStorage
  }

  // The address of the server that served this page, when there is one.
  static ownUrl() {
    if (typeof location === 'undefined' || !location.host) return null;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/ws`;
  }

  // Is a PlanetCraft co-op server listening at this origin? Resolves to the
  // /net-info document or null. Used by the menu to offer "play together"
  // only when it would actually work.
  static async probe(origin = '', timeoutMs = 1200) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      const res = await fetch(`${origin}/net-info`, { signal: ctl.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      const doc = await res.json();
      return doc?.server?.startsWith('khervelanet') ? doc : null;
    } catch { return null; }
  }

  // connect(url, { radius, seed })
  //   radius/seed are a *proposal*: they are used only if the server has no
  //   world yet. The welcome always carries the authoritative pair, and it may
  //   not be the one asked for.
  connect(url, wish = null) {
    this.close(false);
    this.url = url;
    if (wish) this.wish = wish;
    const WS = globalThis.WebSocket;
    if (!WS) { this.setStatus('error', 'this browser has no WebSocket'); return this; }
    this.setStatus('connecting', url);
    let ws;
    try {
      ws = new WS(url);
    } catch (e) {
      this.setStatus('error', String(e.message || e));
      return this;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.attempts = 0;
      this.rawSend({
        t: 'hello', name: this.name, v: NET_PROTOCOL,
        pid: this.pid,
        look: (typeof this.look === 'function' ? this.look() : this.look) ?? null,
        // radius/seed/preset are the world PROPOSAL, used only if no world
        // exists yet — the preset belongs with them because terrain is a
        // function of all three. `style` is art, proposed the same way.
        radius: this.wish?.radius ?? null, seed: this.wish?.seed ?? null,
        preset: this.wish?.preset ?? null, style: this.wish?.style ?? null,
        // The saved designs this world's villages were laid out from, in the
        // same run-length form the blueprints/ files use. They belong with the
        // radius and the seed for exactly the same reason the preset does: put
        // a design in front of village.js and the whole planet lays out
        // differently, so a joiner whose folder holds other designs — or none
        // — generated a different world from the same name. Proposed, like the
        // rest, and the welcome carries the authoritative set.
        designs: this.wish?.designs ?? null,
        // ...and which generation of the terrain generator it was made with:
        // the same seed makes different ground in each (see TERRAIN_GEN in
        // cubesphere.js), so it is identity, not taste
        terrain: this.wish?.terrain ?? null,
        // `mode` is the game the world is being played as (attack, survival,
        // ...) — proposed with the world so every joiner lands in the same one
        mode: this.wish?.mode ?? null,
        // `host` turns the proposal into a statement. A player who has just
        // MADE a world is not asking whether one exists — they are putting
        // theirs up, and the server re-seats itself around it. Without this
        // every world after the first was a private one, because the first
        // claim held for the lifetime of the server.
        host: this.wish?.host ? 1 : 0,
      });
    };
    ws.onmessage = (ev) => {
      this.stats.recv += ev.data?.length ?? 0;
      this.stats.msgsRecv++;
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      try { this.receive(msg); } catch (e) { console.warn('net: bad message', e); }
    };
    ws.onerror = () => {
      // onerror carries no useful detail in any browser; onclose follows and
      // is where the retry decision is made
      if (this.status === 'connecting') this.setStatus('error', 'could not connect');
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;         // superseded by a newer socket
      this.ws = null;
      const wasOnline = this.status === 'online';
      this.players.clear();
      if (this.deliberate) { this.setStatus('offline'); return; }
      if (this.autoRetry && this.attempts < 6) {
        const wait = Math.min(8000, 500 * 2 ** this.attempts++);
        this.setStatus('connecting', `reconnecting in ${(wait / 1000).toFixed(1)}s`);
        setTimeout(() => { if (!this.ws && !this.deliberate) this.connect(url); }, wait);
      } else {
        this.setStatus(wasOnline ? 'offline' : 'error',
          wasOnline ? 'disconnected' : 'no server there');
      }
    };
    return this;
  }

  close(deliberate = true) {
    this.deliberate = deliberate;
    const ws = this.ws;
    this.ws = null;
    this.players.clear();
    this.id = 0;
    this.renderTime = null;
    if (ws) { try { ws.close(); } catch { /* already gone */ } }
    if (deliberate) this.setStatus('offline');
  }

  rawSend(msg) {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1) return false;
    try {
      const text = JSON.stringify(msg);
      ws.send(text);
      this.stats.sent += text.length;
      this.stats.msgsSent++;
      return true;
    } catch { return false; }
  }

  // --- inbound -------------------------------------------------------------

  receive(msg) {
    switch (msg.t) {
      case 'welcome': {
        this.id = msg.id;
        // "the same world" has to mean the same PRESET too, or a reconnect
        // that finds a differently-generated planet quietly keeps the old one
        const resumed = !!(this.world
          && this.world.radius === msg.radius && this.world.seed === msg.seed
          && this.world.preset === (msg.preset ?? 'terran')
          && this.world.terrain === (msg.terrain ?? 1));
        this.world = {
          radius: msg.radius, seed: msg.seed,
          preset: msg.preset ?? 'terran', style: msg.style ?? null,
          mode: msg.mode ?? null,
          designs: Array.isArray(msg.designs) ? msg.designs : null,
          terrain: msg.terrain ?? 1,
        };
        for (const p of msg.players ?? []) {
          this.players.set(p.id, new RemotePlayer(p.id, p.name, p.pid, p.look));
        }
        this.renderTime = null;
        // Nobody in this room has heard what we are wearing, and the hello
        // that got us in carried a look, not a harness. Forget what we last
        // announced and the next tick announces it again.
        this._wornKey = null;
        this.setStatus('online', `#${msg.id}`);
        // A joiner arriving an hour late gets everything built so far, in one
        // message, before their first frame. `spawn` is where THIS player was
        // standing when they last left this world, if the server remembers.
        this.emit('welcome', {
          id: msg.id, radius: msg.radius, seed: msg.seed,
          preset: msg.preset ?? 'terran', style: msg.style ?? null,
          mode: msg.mode ?? null,
          // ...and the buildings this world was generated with. An older
          // server sends none, and a client that gets none falls back to its
          // own library, which is what it did before this existed.
          designs: Array.isArray(msg.designs) ? msg.designs : null,
          // a server that has never heard of generations holds a world made
          // before them
          terrain: msg.terrain ?? 1,
          sun: typeof msg.sun === 'number' ? msg.sun : null,
          ledger: (msg.ledger && typeof msg.ledger === 'object')
            ? msg.ledger : null,
          // ...and what is hung in the frames and written on the signs,
          // for the same reason as the ledger: a joiner who did not get
          // them would stand in a world of blank boards
          art: (msg.art && typeof msg.art === 'object') ? msg.art : null,
          signs: (msg.signs && typeof msg.signs === 'object') ? msg.signs : null,
          edits: unpackEdits(msg.edits), count: msg.n ?? 0,
          players: msg.players ?? [], resumed, spawn: msg.spawn ?? null,
        });
        break;
      }
      case 'join': {
        this.players.set(msg.id,
          new RemotePlayer(msg.id, msg.name, msg.pid, msg.look));
        // Somebody walked in after we put the helmet on. Armour is announced
        // on change and nothing on the server remembers it, so the arrival of
        // a new pair of eyes is a change as far as we are concerned.
        this._wornKey = null;
        this.emit('join', { id: msg.id, name: msg.name, pid: msg.pid });
        break;
      }
      case 'leave': {
        const p = this.players.get(msg.id);
        this.players.delete(msg.id);
        this.emit('leave', { id: msg.id, name: p?.name ?? `player ${msg.id}` });
        break;
      }
      case 's': {
        this.latestT = msg.T;
        for (const key in msg.p) {
          const id = +key;
          let p = this.players.get(id);
          if (!p) { p = new RemotePlayer(id); this.players.set(id, p); }
          p.push(msg.T, msg.p[key]);
        }
        break;
      }
      case 'e': {
        // apply first, then let main.js mark the chunk dirty — a remote edit
        // is authoritative, there is nothing to reconcile against
        for (let i = 0; i + 4 < msg.e.length; i += 5) {
          this.emit('edit', {
            f: msg.e[i], u: msg.e[i + 1], v: msg.e[i + 2],
            h: msg.e[i + 3], b: msg.e[i + 4], by: msg.by,
          });
        }
        break;
      }
      case 'ledger':
        // Somebody traded. Whole-books replace rather than a delta: it is a
        // few hundred bytes and it arrives at most a few times a minute, and
        // a delta stream would need ordering guarantees the relay does not
        // give.
        if (msg.b && typeof msg.b === 'object') this.emit('ledger', msg.b);
        break;

      case 'art':
        if (typeof msg.c === 'string' && typeof msg.a === 'number') {
          this.emit('art', { cell: msg.c, art: msg.a | 0 });
        }
        break;

      case 'sign':
        // somebody wrote on a sign — or wiped one, which is an empty string
        if (typeof msg.c === 'string' && typeof msg.s === 'string') {
          this.emit('sign', { cell: msg.c, text: msg.s.slice(0, 80) });
        }
        break;

      case 'orders':
        // A chief has answered. It arrives long after the muster that asked —
        // seconds, sometimes — and it lands on the same door the steward used,
        // overriding what the steward gave in the meantime.
        if (msg.k && msg.a) this.emit('orders', { key: msg.k, answer: msg.a });
        break;

      case 'paperplan':
        // ...and its answer: the next far muster's deal and war
        if (msg.k && msg.a) this.emit('paperplan', { key: msg.k, plan: msg.a, by: msg.by });
        break;

      case 'dispatch':
        // The planet's news for a day, as the game's own AI wrote it up —
        // see js/dispatch.js. A picture of the world, never a cause in it.
        if (typeof msg.day === 'number' && msg.a) {
          this.emit('dispatch', { day: msg.day, a: msg.a, by: msg.by });
        }
        break;

      case 'chiefstat':
        // Whether whoever runs the villages is actually answering. The front
        // screen shows it before you have started a world and the settings
        // card shows it beside the model, because a setting you cannot check
        // is a setting you cannot use.
        if (msg.s) this.emit('chiefstat', msg.s);
        break;

      case 'chiefsaid':
        // ...and this is a chief ANSWERING SOMEBODY. Same shape as an order
        // list, because it is one: what a chief says to your face and what it
        // tells its people to do are the same decision, and a player who talks
        // it into cutting more timber should see the timber being cut.
        if (msg.k && msg.a) this.emit('chiefsaid', { key: msg.k, answer: msg.a });
        break;

      case 'sun':
        // the world's time of day, as a correction — the client keeps
        // running its own clock between these
        if (typeof msg.a === 'number') this.emit('sun', msg.a);
        break;
      case 'c':
        this.emit('chat', { id: msg.id, name: msg.name, text: msg.m });
        break;
      case 'v':
        // Somebody changed what they are wearing. It comes off the event
        // channel rather than the state message, so it is caught here before
        // the gameplay bus ever sees it — a shot, a hit and a death are things
        // that HAPPEN, and a harness is something that IS.
        if (msg.kind === 'wear') {
          const p = this.players.get(msg.id);
          // A peer that sends no `w` is a peer wearing nothing, not an error.
          if (p) p.armour = cleanWorn(msg.w);
          break;
        }
        // Somebody changed WHO THEY ARE — a new skin worn mid-session. The
        // look normally rides hello/join once; this is the one late change
        // to it, and swapping the object is all it takes: RemoteAvatars
        // compares looks by identity every frame and rebuilds the body.
        if (msg.kind === 'look') {
          const p = this.players.get(msg.id);
          if (p && msg.look && typeof msg.look === 'object') {
            p.look = msg.look;
          }
          break;
        }
        this.emit('event', msg);
        break;
      case 'pong':
        if (typeof msg.n === 'number') this.rtt = Date.now() - msg.n;
        break;
    }
  }

  // --- outbound ------------------------------------------------------------

  // Queue an edit. Several in one frame go out as one message; the server
  // rebroadcasts immediately, so a placed block appears remotely in one RTT.
  sendEdit(f, u, v, h, b) {
    if (!this.connected) return;
    this.pending.push(f, u, v, h, b);
  }

  // WHAT WE ARE WEARING. Four material keys — helmet, chestplate, leggings,
  // boots — and nothing else: not item ids, which the far end would have to
  // look up, and not the inventory, which is nobody else's business.
  //
  // It does NOT ride the state message. That goes out ten times a second for
  // ever, and a man being hit is a man whose armour has not changed; four
  // strings in there would be forty bytes a tick of the same answer. Nor does
  // it ride the look, which is who somebody IS and is sent once at hello: a
  // helmet goes on and comes off a dozen times in a fight, and re-announcing a
  // whole character to say so would rebuild the remote body every time.
  //
  // So it is its own small message on the event channel — about 55 bytes, sent
  // when the four keys change and at no other time, plus once more when
  // somebody new arrives who was not in the room to hear it. The relay fans
  // `v` out untouched and stamps the sender's id, so this needs nothing of
  // server.py that a friend request did not already need.
  // WHO WE ARE, CHANGED. A skin worn in the wardrobe mid-session — the one
  // late edit to a look that otherwise rides hello once. Sent when it
  // happens and never again, so the cost is one message per outfit change,
  // not a body on the state tick.
  sendLook(look) {
    if (!this.connected || !look) return;
    this.rawSend({ t: 'v', kind: 'look', look });
  }

  sendArmour(worn = null) {
    const clean = cleanWorn(worn);
    const key = wornKey(clean);
    if (key === this._wornKey) return false;   // said already, say nothing
    this._wornKey = key;
    this.worn = clean;
    if (!this.connected) return false;
    return this.rawSend({ t: 'v', kind: 'wear', w: clean });
  }

  // Somebody slept. The world clock belongs to the server, so a night skipped
  // in one player's bed has to be skipped in everybody's sky — otherwise two
  // people in the same world stop agreeing about what time it is, which is
  // the one thing the sun has to do.
  sendSun(a) {
    if (this.connected) this.rawSend({ t: 'sun', a: Number(a) });
  }

  // The village ledger — purses and what has come off the shelves. It goes
  // over the wire for the same reason the edit diff does: it is a record of
  // what people did, and two players in one world have to agree about it. The
  // server keeps the last one it saw with the session, so a rejoin gets the
  // money back rather than a fresh till.
  sendLedger(books) {
    if (this.connected) this.rawSend({ t: 'ledger', b: books ?? null });
  }

  // A picture hung in a frame. It cannot ride the edit path: a painting is one
  // block id per wall it hangs on and the DRAWING is an index resolved per
  // cell, so the block does not change when you change the picture.
  sendArt(f, u, v, h, art) {
    if (this.connected) {
      this.rawSend({ t: 'art', c: `${f},${u},${v},${h}`, a: art | 0 });
    }
  }

  // What a sign says. One cell, one string; empty wipes it.
  sendSign(cell, text) {
    if (this.connected) {
      this.rawSend({ t: 'sign', c: String(cell), s: String(text ?? '').slice(0, 80) });
    }
  }

  // A village's chief asking for orders. The brief is a page of text and the
  // answer comes back as an `orders` message; if nothing is listening the
  // server simply does not answer and the steward's orders — already given —
  // stand. Nothing waits on this. See rule 4 in CLAUDE.md.
  // `who` rides along for the server's chief log — the village's name and the
  // world's, so a line in chief_log.txt says WHO was asked without the server
  // having to parse the brief. See "the chief's log" in chief_ai.py.
  // A far village's muster, held on its book: the game's own AI may deal its
  // hands and choose its war for the next one (`paperplan` comes back).
  // `mark` is the muster's day and half, so the server asks once however
  // many clients send it.
  sendPaperMuster(key, brief, mark, who = null) {
    if (!this.connected) return false;
    this.rawSend({ t: 'papermuster', k: key, brief: String(brief).slice(0, 6000),
      m: String(mark).slice(0, 32),
      ...(who?.name ? { n: String(who.name).slice(0, 64) } : {}),
      ...(who?.world ? { w: String(who.world).slice(0, 64) } : {}) });
    return true;
  }

  // Yesterday's digest, for the game's own AI to write up. Answered — if at
  // all — by a `dispatch` to everybody. Returns whether it went.
  sendDispatch(day, digest, world = '') {
    if (!this.connected) return false;
    this.rawSend({ t: 'dispatch', day, digest: String(digest).slice(0, 12000),
      w: String(world).slice(0, 64) });
    return true;
  }

  sendMuster(key, brief, who = null) {
    if (this.connected) {
      this.rawSend({ t: 'muster', k: key, brief: String(brief),
        ...(who?.name ? { n: String(who.name).slice(0, 64) } : {}),
        ...(who?.world ? { w: String(who.world).slice(0, 64) } : {}) });
    }
  }

  // SOMEBODY IS TALKING TO A CHIEF. The brief goes with it — the same page the
  // muster sends, so the chief answers a player out of exactly the numbers it
  // is briefed on and cannot make anything up — and the answer comes back as
  // `chiefsaid`. Nothing waits on it: the card says the line was sent, and if
  // no model is listening the client answers out of the steward's own head.
  sendChiefSay(key, brief, say, role = 'chief', who = null) {
    if (!this.connected) return false;
    this.rawSend({ t: 'chiefsay', k: key, brief: String(brief),
      say: String(say).slice(0, 400), role: String(role),
      ...(who?.name ? { n: String(who.name).slice(0, 64) } : {}),
      ...(who?.world ? { w: String(who.world).slice(0, 64) } : {}) });
    return true;
  }

  // "Is it working?" — the state as the server holds it, costing nothing and
  // asking nobody. The card's own `test it` does not come this way: it goes
  // over plain HTTP so that it works from the menu, with no world running —
  // see `/chief-test` in server.py.
  sendChiefStat() {
    if (this.connected) this.rawSend({ t: 'chiefstat' });
    return this.connected;
  }

  // "I am done with this world." The server stops if nobody else is in it —
  // see the `quit` branch in server.py — which is what makes Exit an exit
  // rather than a tab you closed with a process still holding the port.
  sendQuit() {
    if (this.connected) this.rawSend({ t: 'quit' });
    return this.connected;
  }

  // Who should run the villages, and how to reach them. Sent on connect and
  // whenever the settings card changes — see js/chiefcfg.js. The server holds
  // it in memory only: it is never written into the session file, because a
  // key does not belong in a save any more than it belongs in the repository.
  sendChiefCfg(cfg) {
    if (this.connected) this.rawSend({ t: 'chiefcfg', c: cfg ?? null });
  }

  sendChat(text) {
    if (this.connected) this.rawSend({ t: 'c', m: String(text).slice(0, 200) });
  }

  // Fire-and-forget gameplay event (shot, hit, death). The server relays it
  // untouched; there is no server-side combat model.
  sendEvent(obj) {
    if (this.connected) this.rawSend({ ...obj, t: 'v' });
  }

  // Called every frame with the local player. Actually transmits at tickHz.
  // pos/forward may be THREE.Vector3 or arrays.
  setLocalState(pos, forward, pitch, held = -1, heldKind = 0, flags = 0) {
    this._lastState = {
      p: [r2(pos.x ?? pos[0]), r2(pos.y ?? pos[1]), r2(pos.z ?? pos[2])],
      f: [r3(forward.x ?? forward[0]), r3(forward.y ?? forward[1]),
        r3(forward.z ?? forward[2])],
      a: r3(pitch), h: held | 0, k: heldKind | 0, g: flags | 0,
    };
  }

  // Drive the clock. Returns the live player map so a caller can do
  // `for (const p of net.update(dt).values())`.
  update(dt) {
    if (!this.connected) return this.players;

    // Edits first: they are latency sensitive in a way position is not.
    // Chunked because the server refuses frames over a megabyte, and a single
    // frame's worth of mining is normally one or two edits — but replaying a
    // loaded world, or any future fill tool, could hand us thousands at once.
    while (this.pending.length) {
      this.rawSend({ t: 'e', e: this.pending.splice(0, EDITS_PER_MSG * 5) });
    }

    this._sendAcc += dt;
    const period = 1 / this.tickHz;
    if (this._sendAcc >= period && this._lastState) {
      this._sendAcc = 0;
      this.rawSend({ t: 's', ...this._lastState });
      // ...and while we are here, has the harness changed? Asked at the tick
      // rather than every frame because it is a string compare against a
      // getter somebody else owns, and answered with a message only when the
      // answer is different. Nothing to ask if nobody handed us a source —
      // then the armour arrives by push, through sendArmour.
      if (this.armour) {
        this.sendArmour(typeof this.armour === 'function'
          ? this.armour() : this.armour);
      }
    }

    this._pingAcc += dt;
    if (this._pingAcc > 2) { this._pingAcc = 0; this.rawSend({ t: 'ping', n: Date.now() }); }

    // The render clock runs on server time, INTERP_MS behind the newest
    // snapshot. It advances with dt and is nudged rather than snapped, so a
    // late packet does not produce a visible jump.
    if (this.latestT) {
      const target = this.latestT - INTERP_MS;
      if (this.renderTime === null || Math.abs(target - this.renderTime) > 1000) {
        this.renderTime = target;                  // first sample, or a stall
      } else {
        this.renderTime += dt * 1000 + (target - this.renderTime) * Math.min(1, dt * 2);
      }
    }
    for (const p of this.players.values()) p.sample(this.renderTime ?? 0, dt);
    return this.players;
  }

  // bytes/second in each direction since connecting — used by the HUD and by
  // the bandwidth test
  bandwidth() {
    const secs = Math.max(0.001, (Date.now() - this.stats.since) / 1000);
    return {
      up: this.stats.sent / secs, down: this.stats.recv / secs,
      msgsUp: this.stats.msgsSent / secs, msgsDown: this.stats.msgsRecv / secs,
      seconds: secs,
    };
  }
}

export default Net;
