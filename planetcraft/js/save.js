// save.js — saving and loading worlds.
//
// The planet is a pure function of (radius, seed, preset) and the designs its
// villages were built from: terrain, ore, trees and villages all regenerate
// identically. So a save does not store the world at all — it stores that
// identity plus the cells the player actually changed, which is usually a few
// hundred entries. A freshly explored radius-800 world saves in well under a
// kilobyte, where the blocks themselves would be gigabytes.
//
// WHERE IT LIVES. localStorage gives a page about five megabytes for
// everything it will ever keep, and one well-played world — forty thousand
// changed cells and a picture — is most of that on its own. 'The browser
// storage is full' was a player at that wall with the game refusing to save.
// Saves live in IndexedDB now, where the budget is a share of the disk and
// not a number anybody meets; localStorage is read for the worlds already
// in it, which move across the first time the game starts, and written only
// where IndexedDB is not there at all (a browser with site data blocked).
//
// The rest of the game reads and writes saves SYNCHRONOUSLY — the load list
// paints from listSaves, saveWorld throws on failure — so this keeps a mirror
// of every slot in memory and IndexedDB behind it: reads come off the mirror,
// writes go into the mirror and are put to the database as they happen.
// `savesReady` resolves once the mirror has been filled from the database,
// which is the one moment main.js has to wait for.

const PREFIX = 'planetcraft.save.';
// The game was called KhervePlanet until the rename. Worlds saved under the
// old key are still read — dropping it would silently orphan every existing
// save, which is the one thing a save system must never do.
const OLD_PREFIX = 'kherveplanet.save.';
const VERSION = 2;

const DB_NAME = 'planetcraft';
const DB_STORE = 'saves';

// name -> serialized text, for every world this browser has
const slots = new Map();
let db = null;                 // the IDBDatabase, or null where there is none
let lastError = null;          // the last database write that failed, if any

// ---- the database ------------------------------------------------------------

function openDB() {
  return new Promise((resolve) => {
    let req;
    try {
      if (!globalThis.indexedDB) return resolve(null);
      req = indexedDB.open(DB_NAME, 1);
    } catch { return resolve(null); }
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(DB_STORE)) d.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

function readAll(d) {
  return new Promise((resolve) => {
    const out = new Map();
    let tx;
    try { tx = d.transaction(DB_STORE, 'readonly'); } catch { return resolve(out); }
    const req = tx.objectStore(DB_STORE).openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return resolve(out);
      if (typeof c.value === 'string') out.set(String(c.key), c.value);
      c.continue();
    };
    req.onerror = () => resolve(out);
  });
}

// Fire and forget, with the failure kept: the game's save path is
// synchronous and cannot wait, but the next save can say what happened.
function dbPut(name, text) {
  if (!db) return;
  try {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(text, name);
    tx.onerror = () => { lastError = tx.error?.name ?? 'write failed'; };
    tx.onabort = () => { lastError = tx.error?.name ?? 'write failed'; };
    tx.oncomplete = () => { lastError = null; };
  } catch (e) { lastError = e?.name ?? 'write failed'; }
}

function dbDelete(name) {
  if (!db) return;
  try {
    db.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).delete(name);
  } catch { /* a delete that fails leaves a world behind, which is the safe way round */ }
}

// The worlds localStorage already holds. With a database they are moved
// into it and taken OUT of localStorage, which is what gives the browser its
// five megabytes back; without one they simply fill the mirror.
function readLegacy() {
  const found = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const p = k?.startsWith(PREFIX) ? PREFIX
        : k?.startsWith(OLD_PREFIX) ? OLD_PREFIX : null;
      if (!p) continue;
      const text = localStorage.getItem(k);
      if (text) found.push({ key: k, name: k.slice(p.length), text });
    }
  } catch { /* no localStorage at all: nothing to read */ }
  return found;
}

function legacyRemove(name) {
  try {
    localStorage.removeItem(PREFIX + name);
    localStorage.removeItem(OLD_PREFIX + name);
  } catch { /* fine */ }
}

async function start() {
  db = await openDB();
  if (db) {
    for (const [k, v] of await readAll(db)) slots.set(k, v);
  }
  for (const { name, text } of readLegacy()) {
    // the database's copy wins: it is the newer home, and a world saved
    // there since is a world saved after the move
    if (slots.has(name)) { if (db) legacyRemove(name); continue; }
    slots.set(name, text);
    if (db) {
      // moved, not copied: removed from localStorage only once the put has
      // gone through, so a crash mid-move leaves the world where it was
      try {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put(text, name);
        tx.oncomplete = () => legacyRemove(name);
      } catch { /* it stays in localStorage, and is read from there next time */ }
    }
  }
  return slots.size;
}

// Resolves to how many worlds there are, once they are all in hand.
export const savesReady = start();
// Where saves are going: true means the database, false the old cupboard.
export const savesInDB = () => !!db;
// ...and how much they add up to, for the load screen's meter.
export function savesBytes() {
  let n = 0;
  for (const [k, v] of slots) n += k.length + v.length;
  return n;
}

// ---- the file -----------------------------------------------------------------

// edits arrive as Map<"f,u,v,h", block>; pack to Int32 and base64 so a big
// build is a few hundred kilobytes and not a few megabytes of JSON
function packEdits(edits) {
  const a = new Int32Array(edits.size * 5);
  let i = 0;
  for (const [key, block] of edits) {
    const p = key.split(',');
    a[i++] = +p[0]; a[i++] = +p[1]; a[i++] = +p[2]; a[i++] = +p[3];
    a[i++] = block;
  }
  const bytes = new Uint8Array(a.buffer);
  let s = '';
  for (let k = 0; k < bytes.length; k += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(k, k + 0x8000));
  }
  return btoa(s);
}

function unpackEdits(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const a = new Int32Array(bytes.buffer);
  const out = [];
  for (let i = 0; i < a.length; i += 5) {
    out.push([a[i], a[i + 1], a[i + 2], a[i + 3], a[i + 4]]);
  }
  return out;
}

export function serialize(state) {
  return JSON.stringify({
    v: VERSION,
    saved: new Date().toISOString(),
    radius: state.radius,
    seed: state.seed,
    edits: packEdits(state.edits),
    editCount: state.edits.size,
    player: state.player,      // { pos:[x,y,z], forward:[x,y,z], pitch }
    inventory: state.inventory,
    // the preset was never stored, so every saved world came back terran —
    // an ocean planet reloaded as green hills
    preset: state.preset,
    // How you were playing it. Also never stored, with the same shape of
    // consequence as the preset: the mode fell back to survival on every
    // load, so a designer world came back with hunger and zombies in it and
    // the planner switched off. Absent in saves written before this, and a
    // save without one keeps the old behaviour rather than guessing.
    mode: state.mode ?? null,
    style: state.style,
    // snapshot() always wrote the look; this line is what was missing, so a
    // reloaded save put you back in your place but not in your character
    look: state.look,
    blockEntities: state.blockEntities,
    sunAngle: state.sunAngle,
    // THE SECOND THING THE WORLD STORES, and it was being thrown away.
    //
    // snapshot() has always handed the ledger over and restore() has always
    // looked for it, but this function never wrote it down — so every purse,
    // every shelf a player had sold to and the whole chronicle went in the bin
    // on save and came back blank. A village you had traded with for a week
    // reloaded as one nobody had ever walked into, which is exactly the thing
    // rule 5 in CLAUDE.md exists to stop. Same argument, same line, for the
    // pictures somebody chose to hang.
    ledger: state.ledger ?? null,
    // ...and who works for you. Same argument as the ledger: no machine given
    // the world's name could work out that you hired a farmer and called him
    // Osric, so it is a record and records are kept.
    hands: state.hands ?? null,
    // ...and where you marked the work. See SPOTS in main.js.
    spots: state.spots ?? null,
    // ...and what is PLANTED and still growing. snapshot() has handed this
    // over since the clocks were first saved, and this whitelist silently
    // dropped it — so every sapling and sown row still came back a twig,
    // and 'all my crops are gone' was the report that found it. The same
    // lesson the ledger line above learned the same way.
    crops: state.crops ?? null,
    // ...and any settlement you have given a name of your own.
    titles: state.titles ?? null,
    // ...and the gates you raised, so their name boards come back with them.
    gates: state.gates ?? null,
    art: state.art ?? null,
    // ...and what is written on the signs. Same argument as the pictures.
    signs: state.signs ?? null,
    // THE THIRD, and it is not taste either: the designs the villages on this
    // world were laid out from. The planet is a pure function of its identity
    // and a saved design is part of that identity — village.js rolls the coded
    // archetypes and the saved designs in one roll, so a design in the folder
    // moves every village on the planet, not one house. Left out of the file,
    // a world reloaded against a changed blueprints/ folder came back as a
    // different planet with the same name, and its ledger — kept by cell —
    // pointed at villages that were no longer there. Null on a world built
    // with no designs at all, which is most of them.
    designs: state.designs ?? null,
    // ...and the generation of the terrain generator the world was made with
    // (TERRAIN_GEN in cubesphere.js). Identity on exactly the same argument:
    // the same seed makes other ground in another generation, and a world
    // that came back in the wrong one would have its houses standing in
    // hillsides. A save without it holds a world of the first.
    terrain: state.terrain ?? 1,
    // THE FOURTH, and it is the rest of the SYSTEM.
    //
    // Only one planet is resident, so three things about the others exist in
    // memory and nowhere else: which body you are standing on, the seed each
    // world you have visited was actually BUILT from, and everything you put
    // on the ones you are not on. A body's seed in solar.js is what an
    // unvisited world is generated from — the world you made was not, it took
    // a fresh random one — so a save that forgot this came back on a planet
    // that had lost its name, and flying home built a different world under
    // the same word: your village somewhere else, your mine gone. Null on a
    // world that has never left home, which is most of them.
    planetId: state.planetId ?? null,
    planetSeeds: state.planetSeeds ?? null,
    travelEdits: state.travelEdits ?? null,
    travelKit: state.travelKit ?? null,
    travelBooks: state.travelBooks ?? null,
    // the hands left on each world you have flown from, and the worlds you
    // hold — see the company and the crown in main.js
    travelHands: state.travelHands ?? null,
    crowns: state.crowns ?? null,
    guide: state.guide ?? null,
    // What the world looked like when this was written, as a small JPEG data
    // URL. It is the biggest thing in the file by far — a few hundred bytes
    // of edits against fifteen kilobytes of picture — and it is worth every
    // one of them: a list of names is not a list of worlds.
    shot: state.shot ?? null,
    // The name is carried inside the file as well as being its key, so an
    // exported world still knows what it was called on the machine it left.
    name: state.name ?? null,
  });
}

export function deserialize(text) {
  const o = JSON.parse(text);
  if (!o || typeof o.radius !== 'number') throw new Error('not a PlanetCraft save');
  if (o.v > VERSION) throw new Error(`save is from a newer version (v${o.v})`);
  return { ...o, edits: unpackEdits(o.edits || '') };
}

// ---- the slots ----------------------------------------------------------------

export function listSaves() {
  const out = [];
  for (const [name, text] of slots) {
    let meta = {};
    try {
      const o = JSON.parse(text);
      // preset and shot are what the load screen draws a card from; without
      // them every world in the list looks the same as every other
      meta = {
        radius: o.radius, saved: o.saved, edits: o.editCount ?? 0,
        preset: o.preset ?? 'terran', shot: o.shot ?? null,
      };
    } catch { /* a corrupt slot should not hide the others */ }
    out.push({ name, ...meta });
  }
  return out.sort((a, b) => (b.saved ?? '').localeCompare(a.saved ?? ''));
}

// Write one slot. With the database, the mirror is the truth the moment
// this returns and the put follows; a put that failed last time is reported
// now, because it is the only time anybody is listening. Without one, it is
// localStorage and its quota, as it always was.
function writeSlot(name, text) {
  if (db) {
    const failed = lastError;
    slots.set(name, text);
    dbPut(name, text);
    if (failed) {
      throw new Error(`could not save: the browser's database refused the `
        + `last write (${failed})`);
    }
    return;
  }
  try {
    localStorage.setItem(PREFIX + name, text);
    slots.set(name, text);
  } catch (e) {
    // quota is the only realistic failure, and it is worth naming
    throw new Error(`could not save: ${e.name === 'QuotaExceededError'
      ? 'browser storage is full' : e.message}`);
  }
}

export function saveToSlot(name, state) {
  const text = serialize(state);
  writeSlot(name, text);
  return text.length;
}

// MAKE ROOM WITHOUT DELETING ANYBODY'S WORLD. A slot's screenshot is the
// one thing in it that is not a record of play — shedding it costs a
// thumbnail in the load list and nothing else. Called when a save has hit
// the quota even without its own picture: strips shots from other slots,
// oldest first, and reports how many it freed. It never touches edits,
// ledgers or anything somebody did. With the database this is never needed
// and never asked for.
export function shedShots(except = null) {
  let freed = 0;
  for (const [name, text] of [...slots]) {
    if (name === except) continue;
    try {
      const d = JSON.parse(text);
      if (!d?.shot) continue;
      d.shot = null;
      writeSlot(name, JSON.stringify(d));
      freed++;
    } catch { /* a corrupt slot is not this function's problem */ }
  }
  return freed;
}

export function loadFromSlot(name) {
  const text = slots.get(name);
  if (text === undefined) throw new Error(`no save named "${name}"`);
  return deserialize(text);
}

// Give a world a different name. A save is keyed by its name, so this is a
// move rather than an edit — and the name is written INSIDE the file too (see
// serialize), so both have to change together or an exported world arrives
// still calling itself the old thing.
//
// It refuses to land on a slot that already exists. Silently overwriting one
// world with another because two of them ended up called "hillside" is the
// kind of loss a save system does not get to cause.
export function renameSlot(from, to) {
  const name = String(to ?? '').trim();
  if (!name) throw new Error('a world needs a name');
  if (name.length > 40) throw new Error('that name is too long');
  if (name === from) return false;
  const text = slots.get(from);
  if (text === undefined) throw new Error(`no save named "${from}"`);
  if (slots.has(name)) throw new Error(`there is already a world called "${name}"`);
  let out = text;
  try {
    const o = JSON.parse(text);
    o.name = name;
    out = JSON.stringify(o);
  } catch { /* a slot too corrupt to reparse still deserves its new name */ }
  try {
    writeSlot(name, out);
  } catch (e) {
    throw new Error(`could not rename: ${e.message.replace(/^could not save: /, '')}`);
  }
  // Only once the new one is safely written — an interrupted rename that has
  // already dropped the old key is a world that no longer exists.
  deleteSlot(from);
  return true;
}

export function deleteSlot(name) {
  slots.delete(name);
  dbDelete(name);
  legacyRemove(name);
}

// download as a file, so a world can be moved between machines
export function exportFile(state, name = 'world') {
  const blob = new Blob([serialize(state)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.planetcraft.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function importFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error('no file chosen'));
      const fr = new FileReader();
      fr.onload = () => {
        try { resolve(deserialize(String(fr.result))); }
        catch (e) { reject(e); }
      };
      fr.onerror = () => reject(new Error('could not read the file'));
      fr.readAsText(file);
    };
    input.click();
  });
}
