// Creatures sent from KherveCAD.
//
// KherveCAD's "Send to PlanetCraft" (File menu, or its MCP tools
// `build_creature` and `send_to_planetcraft`) writes one JSON file per
// creature into creatures/ and lists it in creatures/index.json (the same
// index contract as blueprints/ and characters/). This module reads them and
// registers each as an animal kind — see registerCustomCreature in
// entities.js — so from then on it is a species like any other: it roams in
// the wild herds of every new world, and the first time a world is entered
// with a creature it has never had in it, a pair is put down near the player
// so the thing just made can be seen at once.
//
// And WHILE the game runs: `checkCreatures` asks the folder again every few
// seconds (main.js), so a creature sent from KherveCAD walks up to you
// without a reload, and one sent again under the same name — which is how a
// model is made, a send at a time — comes back as the new one. The book of
// them is creatures.html (menu ▸ Creatures).
//
// File format (version 1), all lengths in blocks, +Y up, -Z the front:
//   { "format": "kherveCAD-creature", "version": 1,
//     "kind": "kc_dragon", "label": "Dragon", "height": 2.4,
//     "speed": 1.0, "health": 14, "wild": true,
//     "nature": "animal" | "person" | "monster",   // optional; see natureOf
//     "damage": 4,                                   // optional, monsters
//     "plan": "quadruped",               // optional: what KherveCAD built
//     "parts": [ { "name": "Body", "role": "body" | "head" | "legFL" |
//                  "legFR" | "legBL" | "legBR" | "tail" | "wingL" | "wingR",
//                  "pivot": [x, y, z],          // the joint, rig space
//                  "size": [w, h, d],           // the part's box
//                  "positions": [x, y, z, ...], // triangles about the pivot
//                  "colors": [r, g, b, ...] } ] }  // 0..1 per vertex

import * as THREE from 'three';
import { registerCustomCreature, customCreatureKinds, customCreature,
  spawnAnimal } from './entities.js';

export let creaturesReady = Promise.resolve([]);

// What each file was when it was last read — its date and its length — so a
// creature sent again under the same name is read again, and one that has
// not changed costs a HEAD and nothing more.
const stamps = new Map();         // file name -> stamp
const files = new Map();          // file name -> the definition, as read
const stampOf = (res) => `${res.headers.get('last-modified') ?? ''}|${
  res.headers.get('content-length') ?? ''}`;
const urlOf = (name) => `creatures/${encodeURIComponent(name)}.json`;

function register(name, def, res) {
  if (res) stamps.set(name, stampOf(res));
  if (!def || def.format !== 'kherveCAD-creature') return null;
  // what the file said it was, before natureOf overwrites it with what the
  // game decided — the book says which of the two it was
  def.sentNature = def.nature ?? 'auto';
  try {
    if (!registerCustomCreature(def)) return null;
  } catch (err) {
    console.warn('creature', def.kind, 'could not be registered', err);
    return null;
  }
  files.set(name, def);
  return def.kind;
}

async function readIndex() {
  const names = await fetch('creatures/index.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => null);
  return Array.isArray(names) ? names : null;
}

export function loadCreatures() {
  creaturesReady = readIndex()
    .then((names) => Promise.all((names ?? []).map((name) =>
      fetch(urlOf(name), { cache: 'no-store' })
        .then(async (r) => (r.ok ? register(name, await r.json(), r) : null))
        .catch(() => null))))
    .then((kinds) => {
      const got = kinds.filter(Boolean);
      if (got.length) console.info('KherveCAD creatures:', got.join(', '));
      return got;
    });
  return creaturesReady;
}

// The folder again: what has ARRIVED since it was last read (a file nobody
// had seen), what was SENT AGAIN (a file whose date or length moved), and
// what has GONE from the index. A creature that has gone stays a species for
// the rest of the session — there may be one walking about — but it is no
// longer in the book.
let checking = null;
export function checkCreatures() {
  if (checking) return checking;
  checking = (async () => {
    const out = { added: [], updated: [], removed: [] };
    const names = await readIndex();
    if (!names) return out;
    for (const name of names) {
      let res;
      try {
        res = await fetch(urlOf(name), { method: 'HEAD', cache: 'no-store' });
      } catch { continue; }
      if (!res.ok || stamps.get(name) === stampOf(res)) continue;
      const known = files.has(name);
      const def = await fetch(urlOf(name), { cache: 'no-store' })
        .then(async (r) => (r.ok ? { def: await r.json(), r } : null))
        .catch(() => null);
      const kind = def ? register(name, def.def, def.r) : null;
      if (kind) (known ? out.updated : out.added).push(kind);
    }
    for (const name of [...files.keys()]) {
      if (names.includes(name)) continue;
      out.removed.push(files.get(name).kind);
      files.delete(name);
      stamps.delete(name);
    }
    return out;
  })().finally(() => { checking = null; });
  return checking;
}

// Every creature the folder holds right now, file name and definition.
export const creatureFiles = () => [...files.entries()]
  .map(([name, def]) => ({ name, def,
    sent: (stamps.get(name) ?? '').split('|')[0] || null }));

// A pair of every creature this world has none of, near the player. Returns
// the new entities for the caller to keep.
//
// A MONSTER is the exception: one, and down the road rather than at your
// elbow — close enough to see what you made the moment you arrive, far
// enough that the first thing it does is come for you across open ground
// rather than land a blow before the world has finished drawing.
export function introduceCreatures(planet, scene, entities, near) {
  const made = [];
  if (!planet || !near || planet.preset?.empty) return made;
  for (const kind of customCreatureKinds()) {
    if (entities.some((e) => e.kind === kind && !e.dead)) continue;
    const monster = customCreature(kind)?.nature === 'monster';
    for (let i = 0; i < (monster ? 1 : 2); i++) {
      const e = spawnAnimal(planet, scene, near, kind,
        monster ? { near: 14, spread: 6 } : { spread: 5 });
      if (e) made.push(e);
    }
  }
  return made;
}

// ONE of a creature where you are looking — for a creature that has just
// arrived, or the book's "bring one here". In front rather than round about,
// so it is the first thing you see: a monster a dozen paces off, so it has
// to cross open ground to get to you, anything else a few.
const _ahead = new THREE.Vector3();
export function putCreatureAhead(planet, scene, pos, look, kind) {
  if (!planet || !pos || !customCreature(kind)) return null;
  const monster = customCreature(kind).nature === 'monster';
  const up = _ahead.copy(pos).normalize();
  const flat = look.clone().addScaledVector(up, -look.dot(up));
  if (flat.lengthSq() < 1e-6) flat.set(up.y, -up.x, 0);
  flat.normalize().multiplyScalar(monster ? 11 : 4.5);
  const dir = pos.clone().add(flat).normalize();
  return spawnAnimal(planet, scene, dir, kind, { near: 0, spread: 2.5 });
}

export const creatureLabel = (kind) => customCreature(kind)?.label ?? kind;
// ...and what it is: 'animal', 'person' or 'monster' (see natureOf)
export const creatureNature = (kind) => customCreature(kind)?.nature ?? null;
