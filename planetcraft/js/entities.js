// entities.js — villagers, zombies, animals and birds on the planet.
//
// Entities use the surface height field rather than full 3D collision: they
// only ever walk on open ground, so following the column top is enough and
// costs a single lookup per step. Their "up" is radial like the player's, and
// the body frame is rebuilt from up + a tangent heading, so they stand
// straight wherever they are on the globe.
//
// Bodies are built the same way as the avatar in player.js: blocky boxes with
// SIX materials each, one per face, drawn onto tiny 16x16 canvases. Flat
// colours read as untextured plastic next to the pixel-art world; a 16x16
// canvas costs nothing and gives faces, seams, aprons and rips for free.
// Materials are cached per kind, so all farmers share one set.
//
// Animals (pig, cow, sheep, chicken) are the same machinery with four legs
// and a neck joint. Birds are NOT entities: a flock is one instanced mesh and
// a handful of trigonometry, because a hundred of them must cost about what
// one villager costs.

import * as THREE from 'three';
import { makeLit } from './lit.js';
import { dressBody, classMaterial } from './realbody.js';
import { BLOCK, R, R0, dirFromCell } from './cubesphere.js';
// Namespace import for the families that are arithmetic over a base id —
// the wool colours a sheep can be. A *named* import of a missing export is
// a link-time error that would take the whole game down with it.
import * as CS from './cubesphere.js';
import { ITEMS } from './items.js';
import { findPath, floorAt, cellOnFace, NAV } from './pathfind.js';

const GRAVITY = 22;
const _nc = [0, 0, 0], _ng = [0, 0], _nd = [0, 0, 0];
const _nw = new THREE.Vector3(), _nt = new THREE.Vector3(), _nl = new THREE.Vector3();
const STEP_UP = 1.15;
// Radians a second a body turns aside while it is up against something it
// cannot walk through and cannot see a way round — see the blocked case in
// update(). Comfortably above the 2.6 rad/s the brains steer back at, because
// the two run against each other and a body that turns aside no faster than it
// is aimed never gets round anything at all.
const VEER_RATE = 4.5;
// ...and the bearings it tries first, off its own heading, before it settles
// for turning blind. A man stopped by a bank looks along it before he stands
// there — thirty degrees, sixty, ninety, a hundred and twenty — and takes the
// first way on he can see. It is four height lookups, paid only by a body that
// is actually stuck, and it is the difference between a woodcutter who walks
// round a crag and one who stands under it for eighteen seconds and writes the
// wood off. Measured before it existed: three in five of every walking worker's
// frames ended with the worker exactly where it started.
//
// This is not a path: he looks one step and has no memory of where he has
// been. It is what a body does when it bumps into something BETWEEN the cells
// of a route — the walks that have to arrive follow one now (see navTo, and
// js/pathfind.js), and this is the nudge that keeps a walker moving when the
// route and the world disagree by half a block.
const EDGE_FAN = [0.52, 1.05, 1.57, 2.09];
// The last resort of a long walk across open country: how tall a bank a man
// will haul himself up when no way round it has been found. See tryMove.
const SCRAMBLE = { up: 3.2, bank: 16 };
// What a bank is made of. A man with no way round climbs GROUND — a terrace,
// a cliff, the side of a quarry — and never somebody's wall or roof: a
// climber who went over the houses would be a ghost with extra steps.
const GROUND_BLOCKS = new Set([BLOCK.STONE, BLOCK.DIRT, BLOCK.GRASS, BLOCK.SAND,
  BLOCK.GRAVEL, BLOCK.CLAY, BLOCK.SNOW, BLOCK.ICE, BLOCK.SAND_ORANGE,
  BLOCK.COAL, BLOCK.IRON, BLOCK.PATH].filter((b) => b !== undefined));
// How far below where it was born a mountain animal will let itself drift
// before it turns round and climbs. See the tail of thinkAnimal.
const GOAT_DROP = 3;
const HURT_TIME = 0.35;     // how long a flinch shows for

// How being hit reads. All live-editable; see the "taking a hit" section for
// what each one does and why it costs nothing until something is actually hit.
export const HURT_TUNING = {
  flash: 0.3,          // seconds of red tint on the body
  tint: 0.8,           // how far toward red the tint goes, 0..1
  knockTime: 0.22,     // seconds of shove
  knockSpeed: 6,       // blocks/s of shove, scaled by the damage
  stagger: 0.5,        // seconds the gait is broken for
  blood: 10,           // particles per hit
  dust: 14,            // particles when something dies
  numbers: true,       // floating damage numbers
  death: 0.62,         // seconds to topple, sink and fade
  corpses: 10,         // bodies animating at once before the oldest is cut
};

// scratch — kept separate per use so a helper cannot clobber its caller
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();
const _tgt = new THREE.Vector3();
const _ax = new THREE.Vector3();
const _kd = new THREE.Vector3();
const _hp = new THREE.Vector3();
const _fv = new THREE.Vector3();
const _ev = new THREE.Vector3();      // the envoy's bearing, cast off or not
const _ed = new THREE.Vector3();      // ...and a blocked body's way round
const _m = new THREE.Matrix4();
// birds keep their own set: a flock updates inside an entity update loop
const _bc = new THREE.Vector3();
const _bf = new THREE.Vector3();
const _br = new THREE.Vector3();
const _bz = new THREE.Vector3();
const _bp = new THREE.Vector3();
const _bs = new THREE.Vector3();
const _bu = new THREE.Vector3();
const _bm = new THREE.Matrix4();
const _bi = new THREE.Matrix4();
// ...and the terrain survey (goat siting, flower hunting) keeps a third set.
// It runs inside populate, where the bird vectors above are also live, and
// borrowing one of those quietly moved every flock on the planet.
const _sf = new THREE.Vector3();
const _sr = new THREE.Vector3();
const _sz = new THREE.Vector3();
const _sp = new THREE.Vector3();

// ---------------------------------------------------------------------------
// spawn tuning
//
// Zombies used to arrive every 3s up to 12 alive, which turned every night
// into a conga line. These are live-editable from main.js: the point is a
// handful of them, arriving far off and out of shot, so you notice a silhouette
// on the ridge rather than a queue at the door.
export const ZOMBIE_TUNING = {
  max: 4,             // hard cap on live zombies
  interval: 14,       // seconds between spawn attempts (jittered +/-40%)
  minArc: 45,         // blocks of surface distance from the player, minimum
  maxArc: 85,         // ...and maximum, so they still eventually reach you
  minSeparation: 22,  // blocks between two zombies at spawn: no clumps
  viewDot: 0.15,      // reject a spot if it is within this cone of the gaze
  attempts: 12,       // candidate directions tried before giving up
  nightLevel: 0.25,   // daylight below this counts as night
  burnLevel: 0.55,    // daylight above this sets them alight
  // ...and then it TAKES A WHILE. A zombie that vanished the instant the sun
  // cleared the ridge was a thing the game deleted; one that catches, smokes,
  // staggers on for a few seconds and goes down is a thing that died. Long
  // enough to watch and to outrun, short enough that dawn still clears the
  // field.
  burnTime: 7,        // seconds in the sun before it goes out
  burnRun: 1.35,      // ...and it moves this much faster while it is alight
  // Shade puts it out, but slowly: a zombie that stepped under an eave and
  // was instantly fine would make every porch a shelter. Half speed back.
  burnCool: 0.5,
  // How close one will come to a lit cell. A lamp is a wall to them, which is
  // what makes a lit street worth the coal it cost — see lightCells.
  lightKeep: 7.5,
  chaseArc: 75,       // they lock on from a long way out: relentless
  // What one of them IS, as opposed to how many arrive. A world sets these
  // from its preset (see cubesphere.js), which is how the storm world gets
  // something twice your size that runs you down: `speed` in blocks/second —
  // the player walks at about 4.5 — `scale` as a multiple of a normal body,
  // and reach and hit box follow the scale so a bigger one is genuinely
  // harder to miss and genuinely gets you sooner.
  scale: 1,
  speed: 1.85,
  health: 12,
  reach: 1.3,         // blocks of surface distance a swing lands from
  // combat.js owns what a swing costs you; main.js copies this into
  // combat.zombieDamage when it builds a world, so the number a world wants
  // still lives with the rest of its zombie block
  damage: 3,
};

// The defaults above, kept so a world with no zombie block in its preset can
// put them back — otherwise the storm world's horde would follow you home.
export const ZOMBIE_DEFAULTS = { ...ZOMBIE_TUNING };

/** Apply a preset's `zombies` block, restoring the defaults for anything it
 *  does not mention. Pass null on a world that has no opinion. */
export function setZombieTuning(over = null) {
  Object.assign(ZOMBIE_TUNING, ZOMBIE_DEFAULTS, over || {});
  return ZOMBIE_TUNING;
}

let _spawnTimer = 0;   // owned by tickZombies, reset by populate

// ---------------------------------------------------------------------------
// the skeleton
//
// The other undead, and deliberately not a re-skinned zombie. A zombie is a
// wall of meat that walks at you and never stops; a skeleton is thin, quick
// and keeps its distance, and the threat is the arrow rather than the body.
// It has half a zombie's health because you are meant to close on it — and
// closing is the counter, since inside `retreat` blocks it gives ground
// instead of shooting, which is what turns a fight into footwork.
//
// The bow is combat.js's bow: combat wires `shoot` onto every skeleton the
// same way it wires `hitPlayer` onto every zombie, and the arrow that comes
// out is one of its own projectiles with its own ballistics. There is exactly
// one projectile system in this game and this is not a second one.
export const SKELETON_TUNING = {
  health: 8,          // half a zombie: you are meant to be able to close
  speed: 2.35,        // ...and it is quicker than one, so closing costs you
  reach: 34,          // blocks it will loose an arrow from
  retreat: 7,         // ...and inside this it backs away instead
  cooldown: 2.2,      // seconds between arrows
  draw: 0.55,         // seconds of nocking before one leaves the string
  damage: 4,          // per arrow; combat.js owns what it does to you
  chase: 46,          // blocks it will follow you from
  melee: 2,           // a shove with the bow, point blank
};

// The leash on a bound guard, in blocks of surface distance from where it was
// raised. See Entity.homeward for why one exists at all.
const BOUND_CHASE = 34;   // ...it will come at you from this far inside it
const BOUND_LEASH = 30;   // hard limit: past this it turns round, whatever
const BOUND_HOME = 12;    // ...and with nobody about it drifts back to here

// ---------------------------------------------------------------------------
// the garrison
//
// Soldiers are villagers with a job the spawner never rolls: a couple per
// village, walking the palisade gate to gate and standing a long watch at
// each. They are the one villager a zombie should be worried about.
export const SOLDIER_TUNING = {
  min: 2, extra: 2,   // per village: min + floor(rand * extra) -> 2-3
  health: 30,         // three times a villager, comfortably above a zombie
  damage: 5,          // one sword swing, through the ordinary damage() path
  cooldown: 0.9,      // seconds between swings
  alertArc: 14,       // blocks: how far off a soldier notices a foe
  // ...and further when they are the only ones awake and looking for it
  watchArc: 22,
  // ...and further again after an OUTLAW, who is not something that wandered
  // in out of the dark but somebody the village watched pull its walls down.
  // A guard you can walk twenty paces away from is not a deterrent, and the
  // whole point of the peace is that breaking it has to cost something.
  huntArc: 34,
  nightPause: 3,      // the watch pauses briefly and moves on, all night
  reach: 1.6,         // blocks: how close before the swing lands
  chaseMul: 1.5,      // speed multiplier with a foe in sight: guards can catch
  pause: 8,           // seconds stood at a gate, plus up to pauseVar more
  pauseVar: 7,
};
const SWING_TIME = 0.3;   // seconds the sword arm takes to come down

// HOW A MAN ANSWERS YOU. The player's own words: a guard you hit once
// "should not go crazy — he should give me one hit as well, and that's it";
// hit him twice and he fights; and he has to FORGET. So a struck guard keeps a
// grudge (`wrong`), not a warrant: one blow owed for one blow, a fight for
// two, and all of it gone `memory` seconds after the last. The village's own
// temper — how many of the garrison come — is main.js's (see TEMPER there).
// And a SHOT is noise: a man near it runs, a guard who hears it comes to
// within watching distance and stands ready, and nobody lays a hand on you
// for it until you give them a reason.
export const TEMPER_TUNING = {
  memory: 20,       // seconds a struck guard remembers the blow
  scared: 6,        // seconds a man you hit runs for
  startled: 2.5,    // ...and one who only heard the shot
  hear: 28,         // blocks a gunshot carries to a villager
  flinch: 12,       // ...inside this he runs from it; further off he looks
  ready: 14,        // seconds a guard who heard it stands ready
  watchAt: 7,       // how close a ready guard comes, in blocks
  run: 1.9,         // how fast a frightened man goes, against his walk
};

// --- what the garrison carries ---------------------------------------------
//
// The guards looked the part — iron tunic, steel baldric, kettle helmet — and
// then went at a zombie with their bare hands, which read as a model that had
// been finished and a fight that had not.
//
// Three arms, one per soldier, and the weapon is not a decoration: each one
// changes what that soldier DOES. The spearman fights at nearly twice the
// swordsman's reach and hits softer for it; the hammer is slow and heavy; the
// archer opens at twenty paces and only draws a knife when something is
// already on top of him. So a gate detail with one of each fights in three
// different ways, which is most of what stops it reading as three copies.
//
//   reach     blocks of surface distance the blow lands from
//   damage    per hit, through the ordinary damage() path
//   cooldown  seconds between blows
//   range     archers only: blocks it will loose an arrow from
export const SOLDIER_ARMS = {
  sword: { reach: 1.6, damage: 5, cooldown: 0.9 },
  spear: { reach: 2.9, damage: 4.5, cooldown: 1.0 },
  hammer: { reach: 1.5, damage: 8, cooldown: 1.5 },
  bow: { reach: 1.4, damage: 3, cooldown: 1.1, range: 22, draw: 0.5, arrow: 5 },
};
export const SOLDIER_ARM_LIST = ['sword', 'spear', 'bow', 'hammer'];

// What a WORKER carries. Same slot as a guard's weapon and drawn by the same
// code — parented to the right arm, so it walks with the gait and comes over
// in the swing for free. A hand set to cut wood with an axe in it is the
// difference between a woodcutter and somebody miming one, and it is the
// whole of what the player meant by "or by having a wood cutter".
export const TOOL_ARMS = {
  axe: { reach: 1.7, damage: 4, cooldown: 1.0 },
  hoe: { reach: 1.5, damage: 2, cooldown: 1.1 },
  pickaxe: { reach: 1.6, damage: 3, cooldown: 1.0 },
  shovel: { reach: 1.5, damage: 2, cooldown: 1.0 },
};
export const ANY_ARMS = { ...SOLDIER_ARMS, ...TOOL_ARMS };

// The live entity list, restated every frame by tickZombies (and seeded by
// populate), so a soldier can look for zombies without main.js having to
// pass anything new. main.js rebuilds its array when something dies; the
// next tick hands us the fresh one, and dead entries are skipped anyway.
let _watch = null;

// What the garrison is FOR. The undead, and anything with teeth that is not
// somebody's: a wolf at the edge of the fields is exactly the thing a village
// keeps soldiers for, and until now three armed men would watch one walk
// through the green because it was not a zombie.
//
// A tamed wolf is not a foe — the dog somebody walked in with does not get
// speared on the doorstep — and neither is anything a player owns.
export function isFoe(e) {
  if (!e || e.dead) return false;
  if (e.undead) return true;
  if (e.owner || e.tamed || e.hired) return false;
  return !!(e.isAnimal && ANIMAL_BODY[e.kind]?.fights);
}

// ---------------------------------------------------------------------------
// WAR — one village marching on another
//
// Ring 3 of the design, on foot: "there are two roads to a village that is
// not yours, and the one that does not go through the shop starts with the
// first block you pull out of its wall." This is the other road. A chief
// orders a raid, its garrison walks to the neighbour it named, and the two
// sets of soldiers settle it in the fields.
//
// Everything here is deliberately narrow, because a world where any two
// villagers might fight is a world at permanent war:
//
//   * only a SOLDIER fights. A raid is the garrison's; the farmhands of a
//     raided village run for their doors and the chief stays on his throne
//   * hostility exists only while a raid is running, and only between the
//     two settlements in it. Nobody else on the planet is drawn in
//   * nothing kills a chief or a priest — that rule is older than this one
//     and this does not get to break it
export const WAR = {
  // FIVE, and the number is the whole balance of the thing. A defending
  // village fields its garrison AND the pairs posted on the hall arch and the
  // shop door — eight or nine men on their own ground — so a party of three
  // was three funerals every time. Five with two left at home is a raid that
  // can go either way, which is the only version worth ordering.
  party: 6,          // soldiers a village will send, at most
  // ...and how many it will never send: the walls stay held. ONE. It was two,
  // and with two or three men to a garrison that left nought or one to march
  // — a chief that needed two spare to order a raid on medium never did, on
  // any village on the planet, and the fast road to a neighbour was a road
  // nobody walked. One man on the gate and the rest may go.
  keep: 1,
  seeArc: 26,        // blocks: how far a man at war spots the other side
  atTarget: 14,      // ...and how near the green counts as arrived
  // The envoy's own road speed. A war party that walked slower than the man
  // carrying the letter would arrive after its own clock had run out, which
  // is exactly what the first one did: four men, four minutes, one arrival.
  march: 1.7,        // speed multiplier on the road
  // Long enough to WALK there and fight. Two villages are a couple of
  // hundred blocks apart on an ordinary world and the march is most of a
  // raid; four minutes was a party that spent all of it on the road.
  length: 480,       // seconds a raid may last before the party turns for home
  spoil: 0.25,       // share of the loser's purse the winner walks off with
  cool: 900,         // seconds before the same pair may fight again
};

// Are these two on opposite sides of a raid that is actually happening?
//
// It is asked of every pair a soldier can see, so it is two field reads and
// a comparison — and it is the ONLY thing that makes two villagers hostile.
// `war.site` is the settlement a man was sent to break; a defender is at war
// with anybody carrying that against his own village.
// Who fights in a war: the men under arms, and nobody else. The rule at the
// top of this section — "only a SOLDIER fights; the farmhands of a raided
// village run for their doors" — was only half kept: the farmhands ran, but
// a raider who caught one killed him, and a settlement with no garrison of
// its own (a village YOU founded raises none) was emptied to the last soul
// by the first party that walked in. Twelve settlers dead in an afternoon,
// and the book counted them down to nought. A raid takes the purse; it does
// not take the people.
const fighter = (e) => e.job === 'soldier' || e.job === 'constable'
  || !!e.arm;

// WHICH SIDE A MAN IS ON. A defender's side is the village he lives in; a man
// on a march is on the side that SENT him, which for a garrison is the same
// village and for a company of the player's hands is the only answer there
// is — a hand hired out of the very village you are raiding still belongs to
// the company he marched with, and a hand hired from nowhere has no village
// at all. Read off `village` alone, the player's own raid could not happen:
// his men had no side, so nobody was at war with anybody.
export const sideOf = (e) => (e?.war ? (e.war.home ?? e.village) : e?.village);

export function atWar(a, b) {
  if (!a || !b || a.dead || b.dead) return false;
  const av = sideOf(a), bv = sideOf(b);
  if (!av || !bv || av === bv) return false;
  // ...and neither of them is the office nobody may kill
  if (a.job === 'chief' || b.job === 'chief') return false;
  if (a.job === 'priest' || b.job === 'priest') return false;
  // ...and both of them carry something to fight with
  if (!fighter(a) || !fighter(b)) return false;
  if (a.war && a.war.site === bv) return true;      // he is marching on them
  if (b.war && b.war.site === av) return true;      // they are marching on him
  return false;
}

// Send one soldier to war. The march itself is thinkRaider; this is the
// paperwork — where he is going, where home is, and the longer stride every
// villager who leaves his own levelled pad needs (see sendWord, which is the
// same journey with a message instead of a spear).
export function sendToWar(e, from, to) {
  if (!e || e.dead || !from || !to || !to.dir) return false;
  e.war = {
    site: to,
    at: new THREE.Vector3(...to.dir).normalize(),
    home: from,
    homeAt: new THREE.Vector3(...from.dir).normalize(),
    // A raid is over when the clock says so, whoever is left standing. It is
    // the same bound the anger of a wronged village has: a war with no end
    // is a world where nothing else can happen.
    until: WAR.length,
  };
  e.onWatch = false;
  e.buried = false;
  e.post = e.war.at.clone();
  e.order = 'raid';
  e.state = 'walk';
  e.stepUp = Math.max(e.stepUp ?? 1.15, 1.85);
  return true;
}

// ...and home again, alive. Everything set above goes back exactly as it was.
export function marchHome(e) {
  if (!e || !e.war) return;
  e.war = null;
  e.order = 'guard';
  e.post = null;
  e.target = null;
  e.state = 'work';
  e.speedMul = 1;
}

// Somebody to be named. Monotonic per session and never stored — a chief only
// has to be able to say "the same person as last time" inside one run.
let _uid = 0;

// ---------------------------------------------------------------------------
// livestock tuning
//
// Every animal costs a height-field lookup and a matrix rebuild per frame, the
// same as a villager, and a radius-800 world froze outright at 1268 entities.
// So the population is capped hard and the herds are placed where the player
// actually is, near the inhabited villages, rather than spread evenly over a
// sphere whose far side nobody will ever visit.
// Species the countryside seeds herds of. The dog is deliberately NOT here:
// it is an animal by body and brain, but it lives where people do, and
// citylife.js places it rather than the herd scatterer. Foxes, wolves and
// horses are not here either — this array drives the ORIGINAL herd rolls,
// and adding to it would re-deal every herd on every existing world, so the
// new kinds spawn from their own salted passes at the end of populate().
export const SPECIES = ['pig', 'cow', 'sheep', 'chicken'];

export // A monster sent from KherveCAD: how far it sees you from, how far from home
// a chase may take it, how fast it runs you down (in blocks a second — the
// player walks at about four and a half, so it can be outrun, just) and how
// often it swings.
const MONSTER_TUNING = {
  sight: 22,
  leash: 48,
  run: 1.6,
  pace: 2.6,
  cooldown: 1.3,
};

// ...and a person: how close you have to come before he turns to look.
const PERSON_TUNING = {
  greet: 6,
};

const ANIMAL_TUNING = {
  max: 30,            // hard cap on live animals, whatever the world size
  perVillage: 4,      // herd size seeded at each inhabited village
  wildHerds: 4,       // extra herds dropped between the villages
  herdSize: 3,        // animals per wild herd
  spread: 11,         // blocks a herd is scattered over at spawn
  wanderArc: 24,      // blocks they will stray from where they were born
  fleeTime: 5.5,      // seconds of panic after being hit
  fleeSpeed: 1.9,     // multiplier on the walk speed while panicking
  attempts: 8,        // placement tries before a spot is given up on
  bears: 8,           // polar bears, split between the two caps
};

// ---------------------------------------------------------------------------
// the bronze golem
//
// A village's own answer to the night. It is the slowest thing on the planet
// and the hardest to kill, which is the trade the whole design rests on: it
// cannot chase you or anything else down, so it has to be MET, and meeting it
// is what a zombie coming over the wall does.
//
// It never attacks the player. A construct that could turn on the person who
// built it would make building one a gamble rather than a decision, and there
// is nothing in the game that would tell you which you had made.
export const GOLEM_TUNING = {
  // Half again a villager in every direction. The proportions alone were not
  // enough: built at 1.0 it stood exactly a villager's height and read as a
  // stocky man in armour rather than as a thing the village had CAST. Size is
  // the whole first impression of a golem, and one scale on the body group
  // buys it without touching a single pose.
  scale: 1.45,
  speed: 0.95,        // slower than a walking villager, by a lot
  health: 90,         // four times a soldier: it is the wall, not the spear
  damage: 11,         // ...and one blow is most of a zombie
  reach: 2.4,         // long arms, and it does not have to get close
  cooldown: 1.6,      // slow, heavy swings
  alertArc: 30,       // how far it notices the undead
  leash: 40,          // ...and how far from its post it will go to reach them
  home: 10,           // inside this it counts as "at its post"
  knockback: 9,       // blocks/s a swing throws the thing it lands on
  perVillage: 1,      // how many are seeded to guard each village
};

// ---------------------------------------------------------------------------
// tame animals, the hunt, and riding
//
// One table, because all three are the same idea seen from different sides:
// an animal that has a TARGET which is not "somewhere near where I was born".
// How long a shorn sheep takes to grow its wool back, in seconds. A day here
// is 1200 seconds, so this is most of one: long enough that wool comes from
// keeping a flock rather than from one sheep and a lot of patience, short
// enough that a flock you actually keep is worth more than a flock you eat.
export const FLEECE_REGROW = 900;

// The shopkeepers. Capped for the same reason the villagers are: every body
// in this file costs a physics step a frame, and a forty-village planet has
// forty counters on the far side of it that nobody is standing at.
export const SHOP_TUNING = { cap: 12 };

// ---------------------------------------------------------------------------
// orders
//
// One vocabulary for everything that answers to you — a dog, a wolf, a cat, a
// hired hand. That is the whole design decision here: a player who has learnt
// what "guard" means from a dog should not have to learn a second word for it
// from a person, and a single wheel can then command anything you point at.
//
// `for` says which of the two a word belongs to; `both` is most of them,
// because the difference between a dog and a hired villager is what they are
// good at, not what you can ask of them.
//
//   follow   come with me. The default, and where a new pet or hand starts.
//   sit      sit down and do nothing at all. Will not fight, will not move.
//   wait     hold this spot. Still defends itself, and still comes if I am
//            attacked within reach — the difference from `sit` is the whole
//            reason both exist.
//   guard    hold this spot and go for anything hostile that comes near it.
//   hunt     roam near this spot and chase what you hunt (a dog after foxes).
//   patrol   the same, for somebody with no prey: walk a beat around here.
//   attack   go for what I am pointing at, now.
//   haul     pick up what is lying about near me and bring it to me.
//   release  you are your own again.
export const ORDERS = [
  { id: 'follow', name: 'heel', hand: 'follow me', for: 'both',
    blurb: 'stay with me' },
  { id: 'sit', name: 'sit', hand: 'rest', for: 'both',
    blurb: 'sit down and stay out of it' },
  { id: 'wait', name: 'wait', hand: 'hold here', for: 'both',
    blurb: 'hold this spot, come if I am attacked' },
  { id: 'guard', name: 'guard', hand: 'guard here', for: 'both',
    blurb: 'hold this spot and go for anything hostile' },
  // For a dog this is a patrol: range around and see what turns up. For a
  // person it is the meat trade — go and kill something worth eating and
  // carry it back. Same word, and it means the same thing to both of them;
  // only one of them comes home with the dinner.
  { id: 'hunt', name: 'hunt', hand: 'hunt', for: 'both',
    blurb: 'kill something worth eating and bring it in' },
  { id: 'attack', name: 'attack', hand: 'attack', for: 'both',
    blurb: 'go for what I am pointing at' },
  { id: 'haul', name: null, hand: 'fetch', for: 'hand',
    blurb: 'gather what is lying about and bring it to me' },
  // WHAT THE DAY'S WORK IS FOR. Everything a hand you hired collects goes
  // into your store — a chest you laid, see depotOf in main.js — and sits
  // there being timber. This is the order that turns it into money: he loads
  // up out of the store, walks it to a village counter, sells it at that
  // shop's own price against that shop's own till, and carries the coin back
  // to the same box. Ring 2 of the game, done by somebody else's legs.
  { id: 'sell', name: null, hand: 'go and sell', for: 'hand',
    blurb: "take the store's goods to a village counter and bring the coin back" },
  // THE STOREKEEPER. Everybody else carries a load to the store and puts it
  // in whichever box has room; this one lives there. Anything lying on the
  // ground round the store comes in, and the boxes are kept in order — one
  // kind of thing gathered into one box, half stacks merged — so a store of
  // six chests reads as a store and not as six chests.
  { id: 'keep', name: null, hand: 'keep the store', for: 'hand',
    blurb: 'live at the store: bring in what is lying about, keep the boxes in order' },
  // --- the trades ------------------------------------------------------------
  // Work orders. Each one sends somebody off to do a job on the WORLD — fell
  // a tree, pull a crop, cook a dinner, put another bed in a house — and each
  // one is a real edit that gets saved and sent like any block you laid
  // yourself. entities.js only walks them to the spot; main.js owns what
  // happens when they get there, because main.js is what owns the blocks.
  { id: 'chop', name: null, hand: 'cut wood', for: 'hand',
    blurb: 'fell the trees round here — faster with an axe' },
  // The other half of the timber trade. A gang on `cut wood` clears a forest
  // and a woodcutter only replants the stump it is standing on; somebody on
  // `plant trees` puts the wood back faster than it comes down, which is the
  // difference between a village with a wood and a village with a clearing.
  { id: 'plant', name: null, hand: 'plant trees', for: 'hand',
    blurb: 'put saplings in the open ground round here' },
  { id: 'farm', name: null, hand: 'work the land', for: 'hand',
    blurb: 'pull what is ripe, till and sow what is not' },
  // Mining. The village keeps ONE hole — see mineHead in main.js — and
  // everybody sent to dig works the same staircase down into it, because two
  // miners and two shafts is two half-dug holes and no ore.
  { id: 'mine', name: null, hand: 'dig for ore', for: 'hand',
    blurb: 'cut a stair down at the village mine and bring the ore back' },
  { id: 'honey', name: null, hand: 'take the honey', for: 'hand',
    blurb: 'rob the hives round here — the bees will have something to say' },
  // The trade that turns what a village GATHERS into what a village is BUILT
  // from. Timber is not a house; planks are. Everything a settlement puts up
  // comes out of this one.
  { id: 'make', name: null, hand: 'make materials', for: 'hand',
    blurb: 'planks, bricks and thatch, out of what the village has in' },
  // ...and the hands that turn the pile into a building. A plot with nobody
  // on it does not rise: this is the order that makes a village grow.
  { id: 'build', name: null, hand: 'build', for: 'hand',
    blurb: 'get on the plot and put the next house up' },
  // --- the two that make a village look like one ----------------------------
  // Everything above feeds the settlement; these two are what it looks like
  // from the street. Both are ordinary work orders — main.js picks the cell,
  // work.js spends the goods and lays the block — and both build out of the
  // village's OWN store, so a chief that wants a lit street has to have put
  // something on the shelf first. Nothing here is conjured.
  { id: 'pave', name: null, hand: 'lay the paths', for: 'hand',
    blurb: 'a street from every door to the green, out of what the store has' },
  { id: 'light', name: null, hand: 'light the streets', for: 'hand',
    blurb: 'lamp posts round the village, out of what the store has' },
  // The groundwork order. It costs nothing and yields nothing — the cut
  // earth becomes the turf by fiction — because it is about the SHAPE of
  // the ground, and a village on a levelled green is what every other order
  // builds better on.
  { id: 'level', name: null, hand: 'level the land', for: 'hand',
    blurb: 'cut the high ground and turf the hollows, twenty blocks round '
      + 'where I say' },
  // The farm order. One mark, one keeper: he fences the ground, hangs the
  // gate, and then either tills and sows it from your store or walks the
  // beasts in off the hill — which of those it is comes from the KIND picked
  // on the mark, exactly as a plot carries which house.
  { id: 'stead', name: null, hand: 'make a farm', for: 'hand',
    blurb: 'fence the marked farm and stock it — crops sown out of the '
      + 'store, or beasts walked in off the hill' },
  { id: 'cook', name: null, hand: 'cook', for: 'woman',
    blurb: 'find a furnace and put dinner on' },
  { id: 'bed', name: null, hand: 'make a bed', for: 'woman',
    blurb: 'another bed in a house, so the village can grow' },
  { id: 'raid', name: null, hand: 'raid', for: 'hand',
    blurb: 'march on the next village and fight it' },
  // The other road to a village that is not yours. A raid is the fast one and
  // this is the slow one, and they are the SAME order shape on purpose: one
  // person, sent a long way off, to a settlement somebody else runs. He goes
  // with word of how this village is doing, he stands in front of their chief
  // and says it, he hears theirs, and he walks home with it — see ring 3 in
  // CLAUDE.md. It costs the village a pair of hands for the length of the
  // journey, which is the whole reason it is a decision and not a free action.
  { id: 'envoy', name: null, hand: 'carry news', for: 'hand',
    blurb: 'walk to the next village, tell their chief how we are doing, '
      + 'and bring back word of them' },
  // THE ONLY ORDER THAT MAKES MORE PEOPLE. A village's own chief has never
  // had to give it — couples pair on their own at dusk when the beds allow —
  // but a company of hands you hired is not a village and never paired at
  // all, so the only way your household ever grew was to walk up to a
  // stranger with a meal and 24 coin. This is the other way, and it is the
  // one the whole bed ledger was built for: a woman told to raise a family,
  // a man of yours to meet her, a free bed for the child, and a night.
  { id: 'family', name: null, hand: 'raise a family', for: 'woman',
    blurb: 'meet somebody of ours at a bed nobody has been given, and by '
      + 'morning there is one more of us' },
  { id: 'release', name: 'let go', hand: 'pay off', for: 'both',
    blurb: 'you are your own again' },
];

// WHAT A HAND WEARS TO DO IT.
//
// The nine wardrobes in PALETTE are what a village already dresses its own
// people in, and every one of these is one of them — nothing new was painted
// for this. What it buys is the thing you cannot get from a list: you look at
// your village and you can see, from the far end of the street, that two are
// on the timber, one is in the fields and one is on the door.
//
// An order that is not work — heel, rest, hold, let go — puts him back in the
// clothes of his own trade, which is what `null` means here and why most of
// the vocabulary is deliberately absent from this table.
export const ORDER_DRESS = {
  // She is not at work; she is at home. Her own trade's clothes.
  family: null,
  // Every WORK order has its own, and five wardrobes were painted so that no
  // trade has to borrow one — see the palettes above. A trade dressed as
  // another trade is worse than a trade dressed as none: you manage a village
  // by looking at it.
  guard: 'soldier',      // the garrison's slate, baldric and kettle helmet
  attack: 'soldier',
  raid: 'soldier',
  chop: 'woodcutter',    // red check, sleeves rolled, a broad belt
  plant: 'farmer',       // it is the same work as sowing, done to a wood
  farm: 'farmer',        // homespun and a straw brim
  mine: 'miner',         // dark clothes, a steel helmet and a lamp on the brow
  honey: 'beekeeper',    // a pale suit and a veil
  hunt: 'hunter',        // greens, a hood and a quiver
  make: 'smith',         // the bench and the press: apron, headband, soot
  keep: 'trader',        // the storekeeper wears the shopkeeper's apron
  build: 'builder',      // the labourer's apron and head-wrap
  pave: 'builder',       // paving is building, done on your knees
  level: 'builder',      // groundwork is building, done with a spade
  stead: 'farmer',       // a farm is farm work from the first fence post
  light: 'builder',      // ...and a lamp post is building, done standing up
  haul: 'builder',       // a porter is a labourer with a load
  bed: 'builder',        // joinery, and the same apron
  cook: 'cook',          // whites, a paler apron and a soft cap
  sell: 'trader',        // the good coat and the money sash
  envoy: 'librarian',    // a robe, a sash and a pack for the road
};

// Orders that send somebody to a spot main.js has picked out for them. All
// they do in here is walk to `task` and stand there working; the job itself
// happens in main.js, which is the only module that may touch a block.
export const WORK_ORDERS = new Set([
  'haul', 'chop', 'plant', 'farm', 'mine', 'honey', 'hunt', 'make', 'build',
  'cook', 'bed', 'sell', 'pave', 'light', 'level', 'stead', 'keep',
]);
export const ORDER_IDS = new Set(ORDERS.map((o) => o.id));
// What one of these is called to the thing being told. A dog heels; a person
// follows. Same order, and it matters that the word fits who is hearing it.
export const orderLabel = (id, isHand) => {
  const o = ORDERS.find((x) => x.id === id);
  if (!o) return id;
  return (isHand ? o.hand : o.name) ?? o.hand ?? o.name ?? id;
};
// What this one can be told. A dog gets the six words that mean something to
// a dog; a hired hand gets those plus the trades; and the two a woman does —
// the cooking and the bed-making — are hers.
export const ordersFor = (isHand, sex = null) => ORDERS.filter((o) => {
  if (o.for === 'both') return true;
  if (o.for === 'pet') return !isHand;
  if (o.for === 'woman') return isHand && sex === 'woman';
  return isHand;
});

// ---------------------------------------------------------------------------
// the envoy
//
// One villager, walking to a settlement somebody else runs and back again.
//
// THE HONEST PART IS THE ROAD. Everything else in this file that walks a long
// way — a raid — walks at a target and gives up on nothing, because a raiding
// party that arrives late still arrives. An envoy has to actually GET THERE,
// across real terrain, and the terrain does not care: a bay, a scarp or a
// crater wall will hold a man pointed straight at his goal for the rest of the
// world. `tryMove` refuses the step and `update` turns him at random, which
// unsticks a wall in three seconds and a headland never.
//
// So he gets two things nothing else in here has. First, when he stops CLOSING
// on the goal he casts off the bearing by half a right angle and holds that
// for a few seconds — which walks him ALONG whatever is in the way instead of
// into it, and is most of the difference between an envoy who arrives and one
// who paces a shoreline. Second, a give-up clock: patience runs out, he turns
// round, and he comes home saying he could not get through. A messenger who
// stands in the sea for ever is worse than no messenger at all, and the game
// already believes this — see `giveUpOn` in work.js, which writes off a job a
// worker could not reach rather than sending him back to it until the heat
// death of the world.
export const ENVOY_TUNING = {
  speed: 1.7,       // a man with news walks; he does not stroll
  near: 14,         // blocks from the far centre he counts as having arrived
  // ...and from the THRONE ITSELF before he speaks. Three and a half blocks is
  // the length of a hall's floor between the arch and the dais: close enough
  // that he is unmistakably addressing the man, far enough that he is not
  // trying to stand where the chair is. It was 2.6 against a spot two cells in
  // front of the chief, and that pair of numbers had him dithering on the
  // threshold for forty seconds and then giving up in a village he had already
  // walked into — the tolerance has to be looser than the last step is long.
  atChief: 3.6,
  atGate: 4,        // ...and from a village gate before he is through it
  home: 8,          // blocks from his own green he counts as home again
  speak: 10,        // seconds standing in front of the chief, saying it
  cast: 2.5,        // seconds of no progress before he tries going round
  castFor: 5,       // ...and how long he holds the detour...
  straight: 3,      // ...and how long he walks at the goal again before the next
  veer: 0.95,       // radians off the bearing a detour is — a little over 54°
  wide: 1.6,        // ...and the widest it ever opens to, which is a right angle
  gain: 1,          // blocks closer that count as having got anywhere
  // Seconds of no progress at all before he turns for home. A village musters
  // twice a day and a day is 1200 seconds, so anything under about a minute
  // and a half is a man giving up on a headland he would have walked round.
  stall: 75,
  homeStall: 150,   // ...and the longer patience the way back gets
  limit: 900,       // seconds an errand may last before it is simply over
};

// Send one. `plan` is main.js's, because main.js is the only module that knows
// what a settlement IS — this file only knows how to walk to a direction.
//
//   to    the far village's centre
//   hall  where its chief is sitting, or null if it has no throne
//   home  the centre he came from
//   news  the line he is carrying, worked out from the chronicle
export function sendEnvoy(e, plan) {
  if (!e || e.dead || !plan?.to || !plan?.home) return false;
  e.order = 'envoy';
  // ...and dressed for the road. This sets the order directly rather than
  // through setOrder — an envoy needs its errand hung on it first, which is
  // the one thing setOrder refuses to do — so the wardrobe has to be asked
  // for here as well, or the one man in the game who is visibly going
  // somewhere is the one still dressed for the job he left.
  if (e.hired && e.kind === 'villager' && e.wearing !== ORDER_DRESS.envoy) {
    e.wearing = ORDER_DRESS.envoy;
    e.reskin();
  }
  e.post = plan.home.clone().normalize();
  e.chore = null;
  e.fetch = null;
  e.target = null;
  e.court = null;
  // The same longer stride every worker under a chief gets. A village sits on
  // a levelled pad and the road off it is a bank — see landOrders in main.js.
  e.stepUp = Math.max(e.stepUp ?? 1.15, 1.85);
  // AND HE IS NO LONGER PINNED. `buried` means "I know exactly which cell this
  // one stands in" — see CLAUDE.md — and it makes `groundAt` read the floor
  // LOCALLY, one block up and four down, which is right for a man behind a
  // counter and useless for a man crossing a moor. A constable sent with word
  // stood on the green for eighty seconds and got nowhere, because every bank
  // out of his own village was a wall to him. His water sense is set on him
  // separately and survives this, which is the whole reason the two are two.
  e.buried = false;
  e.errand = {
    name: plan.name ?? 'the next village',
    key: plan.key ?? null,
    site: plan.site ?? null,
    to: plan.to.clone().normalize(),
    hall: plan.hall ? plan.hall.clone().normalize() : null,
    home: plan.home.clone().normalize(),
    // The two palisades: theirs, to get in by, and his own, to get back in by.
    // See bestGate — a village with a wall round it is entered at a gate.
    gates: (plan.gates ?? []).map((g) => g.clone().normalize()),
    homeGates: (plan.homeGates ?? []).map((g) => g.clone().normalize()),
    // Where he is walking right now and how near counts as there. Set by
    // legTo at every turn; this is only the first leg's.
    at: plan.to.clone().normalize(),
    within: ENVOY_TUNING.near,
    road: null,                   // the far gate he is making for, if any
    news: plan.news ?? null,      // what he is carrying out...
    day: plan.day ?? null,        // ...and the day that reading was taken
    back: null,                   // ...and what he is bringing home
    backDay: null,
    leg: 'out',
    t: 0,
    best: Infinity,
    stale: 0,
    castT: 0,
    side: 0,
    why: null,
    // ...or he is not coming back at all: a man whose village lost its bell,
    // walking to the next one to live there. main.js settles him in when he
    // arrives — see settleIn — and the road home is never walked.
    leave: !!plan.leave,
  };
  // WHERE THE ROAD ACTUALLY ENDS: the far village's gate, not its fountain.
  // Aiming at the green meant the last twenty blocks of every journey were the
  // pad, the palisade and whatever the settlement was built beside — Wellmoor's
  // man crossed a hundred blocks of open country in fifty seconds and then
  // spent his whole patience on the wrong side of a creek, eleven paces from an
  // open gate he was not aiming at.
  e.errand.road = e.bestGate(e.errand.gates, e.errand.hall ?? e.errand.to);
  // ...and OUT THROUGH HIS OWN GATE FIRST. He is standing on the green when he
  // is told to go, and there is a palisade between the green and the country —
  // his own, not theirs. Without this leg the first thing an envoy did was walk
  // into the back of his own village's wall and spend his patience there, which
  // read exactly like a road that did not exist.
  const gate = e.bestGate(e.errand.homeGates, e.errand.road ?? e.errand.to);
  if (gate) e.legTo('sally', gate, ENVOY_TUNING.atGate);
  else e.legTo('out', e.errand.road ?? e.errand.to,
    e.errand.road ? ENVOY_TUNING.atGate : ENVOY_TUNING.near);
  e.said = plan.news
    ? `word for ${e.errand.name} — ${plan.news}`
    : `carrying word to ${e.errand.name}`;
  return true;
}

export const onErrand = (e) => !!e && !e.dead && !!e.errand;

// What a hired hand costs and how it fights. Wages are in gold coins and are
// paid ONCE, at hiring: a wage bill you have to keep paying would turn a
// companion into a chore, and the thing being bought here is a person's
// loyalty rather than their week.
export const HIRE_TUNING = {
  wage: 24,           // coins, on top of the meal
  damage: 4,          // what a hired hand's swing costs, unarmed
  cooldown: 1.1,      // seconds between swings
  reach: 1.9,         // blocks at which it lands
  alert: 18,          // how far one notices something to fight
  leash: 26,          // ...and how far from its post it will go to reach it
  followNear: 4.0,    // blocks behind you it stops closing in
  followFar: 3.2,
  catchUp: 4.2,       // top speed multiplier while running you down
  teleport: 46,       // this far behind before the rescue is even considered
  // ...and this long getting no NEARER before it fires. See thinkPet: far
  // away is a man walking to you; far away and closing nothing is a man on
  // the wrong side of a cliff.
  strand: 25,
  haulRange: 14,      // how far it will go to pick something up
};


export const PET_TUNING = {
  followNear: 3.2,    // blocks from the owner a pet stops closing in
  followFar: 2.6,     // ...and starts again. Hysteresis, or it jitters on the spot
  catchUp: 4.5,       // top speed multiplier while running you down — see thinkPet
  teleport: 42,       // left this far behind — a cliff, a boat — before the rescue
  strand: 25,         // ...and this long getting no nearer before it fires
  guardArc: 16,       // how far a pet will go to reach whatever hit its owner
  guardMemory: 20,    // seconds it stays angry at that thing
  cooldown: 1.0,      // seconds between a pet's bites
  huntArc: 22,        // how far a dog notices a fox
  huntGiveUp: 34,     // ...and how far it will chase before losing interest
  huntReach: 1.3,     // blocks at which the bite lands
  fleeFrom: 9,        // how close a hunter has to be for its prey to bolt
};

// --- getting in out of the weather ------------------------------------------
//
// Villagers already stopped walking at night, but they stopped WHERE THEY
// WERE — a row of people standing in the road in the dark, which reads as the
// simulation having been switched off rather than as a village going to bed.
//
// They now go to their own door. `weather.js` publishes how much of the
// daylight the cloud deck is eating every frame, so the same rule covers the
// other case for free: when the storm hardens, everybody goes in. On Tempest,
// where the storm never lifts and hardens in waves, that is the whole culture
// argument made visible — the covered walkways are there for a reason and you
// can watch people use them.
//
// Soldiers are deliberately exempt. The watch is what a watch is for, and a
// garrison that goes indoors at dusk is a garrison with no purpose.
export const SHELTER_TUNING = {
  // Cloud eating this much of the light sends them in. Set ABOVE a storm
  // world's lull and below its squall: Tempest's deck runs from about 0.31 to
  // 0.58 over a squall cycle, so 0.50 means its people work through the grey
  // and get in when it hardens — which is the whole argument for the covered
  // walkways they built. A world with fair weather never reaches it at all.
  gloom: 0.5,
  night: 0.2,         // ...and so does daylight below this
  atDoor: 1.8,        // blocks from the door that counts as home
  hurry: 2.3,         // steer rate on the way — you walk faster in the rain
  // ...and the bed at the end of it. Villagers used to walk home and STAND on
  // the doorstep all night, which is a village of people locked out of their
  // own houses. A bed is claimed at dusk, walked to, and slept in.
  inBed: 1.5,         // blocks from the bed that counts as in it
  // The two legs of the walk home — see tryBed. `atDoorway` is close enough to
  // the door to turn and aim at the bed instead; `reDoor` is far enough from
  // the bed to decide he is outside again and start over at the door.
  atDoorway: 1.3,
  reDoor: 9,
  claimEvery: 6,      // seconds between attempts, for one who found none free
  climb: 2.4,         // blocks a second up the ladder to a bed on the floor above
  // WHEN TO TURN IN, on the clock rather than off the light meter.
  //
  // `night: 0.2` meant they set off when the daylight term had fallen that
  // far, and on a fair world that is nineteen hundred hours — the light is
  // already gone. A woodcutter who was sent out to the treeline at dawn then
  // walks home in the dark and is still walking at two in the morning, which
  // is exactly what "the villagers do not go to bed" looks like from a window.
  //
  // The hour is also the only thing that WORKS on a storm world. Tempest's
  // daylight runs from about 0.31 to 0.58 over a squall, so any light level
  // low enough to mean "night" on a fair world means "raining" there, and the
  // village would have gone to bed at three in the afternoon. Weather sends
  // them under a roof — that is `gloom`, above, and it is a different rule.
  abed: 21,           // local solar hour they start for bed — nine o'clock
  wake: 6,            // ...and the earliest they are up again
  // ...AND THE SUN ITSELF, where he stands, which is what the two hours
  // above were standing in for. The sun turns about one axis and the ice
  // caps sit on another, so the same solar hour is a sunset at one latitude
  // and broad daylight at the next: a village turned in at 18:24 with the
  // sun still up, and another lay in bed at 06:00 an hour after dawn. Now
  // bedtime is the disc going under the horizon and morning is the disc
  // clearing it, read off the sun's real elevation over his village (see
  // sunUpAt in main.js) — pure geometry, so a storm world's gloom does not
  // send anybody to bed at three. The hours stay for the few places where
  // the sun never crosses the horizon at all.
  dusk: -0.03,        // sun elevation below which the day is over
  dawn: 0.0,          // ...and above which a sleeper gets up
};

// THE SMALLEST ROOM. Every six hours a villager goes to the nearest toilet
// with nobody on it — see tryLoo, and looFor in main.js for where. Six hours
// of a 1200-second day is five real minutes; the first visit is spread over
// that so a village does not queue at one o'clock. A toilet he cannot reach
// — the far side of a fence, a house whose door is shut on him — is given up
// on after a while and tried again later, because a man stood at a wall for
// the rest of the day is the bug the player sees from a window.
export const LOO_TUNING = {
  every: 6 * (1200 / 24),   // seconds between visits: DAY_LENGTH / 24 * 6
  stay: 6,                  // seconds sat there
  hurry: 1.45,              // he walks with purpose
  retry: 45,                // seconds before asking again when none was free
  giveUp: 25,               // seconds of no progress before he gives it up
  // WAITING IN LINE. He asks again on this clock rather than every frame:
  // the only thing that can change his place is somebody coming out, and
  // `stay` is six seconds, so under a second is plenty to catch it.
  ask: 0.8,                 // seconds between "is it free yet"
  patience: 30,             // ...and how long he will stand there before he
  //                           gives up and finds something else to do
  out: 12,                  // seconds to get out of the door afterwards
};

// THE CAFÉ. Which seat, and whether the hour is on, is main.js's — see the
// café hour there. This only walks in, sits down and, if there is a pipe to
// hand and he is a man, smokes it: the hand comes up to the face, holds,
// and the smoke comes out on the way down. One draw every `period` seconds.
export const CAFE_TUNING = {
  period: 7,      // seconds between draws
  draw: 1.8,      // ...of which the hand is up
  exhale: 1.3,    // ...and then the smoke
  puffEvery: 0.3, // seconds between wisps while exhaling
  seen: 48,       // blocks: no smoke is drawn further from the player than this
};

export const RIDE_TUNING = {
  mountArc: 3.4,      // blocks: how close you must be to get on
  turn: 2.6,          // rad/s the reins can swing the head
  dismount: 1.5,      // blocks to the side you are put down
};

export const BIRD_TUNING = {
  // A flock is only in the sky over a small cap of the planet, so on a big
  // world any one of them is out of sight most of the time. Six is what makes
  // birds a thing you see now and then rather than once an hour, and a hidden
  // flock costs one dot product, so the extras are close to free.
  flocks: 6,          // one instanced mesh each, hidden when over the horizon
  perFlock: 10,
  altitude: 24,       // blocks above the ground UNDER the flock, not above R
  size: 1.0,          // wingspan is about 1.1 * size blocks
  speed: 0.055,       // rad/s around the planet: a slow, lazy transit
  swirl: 0.35,        // rad/s the formation turns about its own centre
  spread: 7,          // blocks from the flock centre to the outer birds
  flap: 9,            // wingbeats per second-ish
  colour: 0x2b2f36,   // near-black: they are read as silhouettes
};

// ---------------------------------------------------------------------------
// drops
//
// Item ids are resolved BY NAME out of the items.js registry at load, so this
// module never edits or hard-codes another module's table. A name that is not
// there degrades to "no drop" and is listed in MISSING_DROPS instead of
// throwing halfway through a kill.
const DROP_NAMES = {
  MEAT_RAW: ['meat_raw', 'raw_meat', 'meat', 'beef', 'porkchop'],
  LEATHER: ['leather', 'hide'],
  FEATHER: ['feather', 'feathers'],
  BONE: ['bone', 'bones'],
  ARROW: ['arrow', 'arrows'],
  // What a broken golem is made of. Resolved by name like everything else
  // here, so this file still adds nothing to items.js.
  BRONZE: ['bronze_ingot', 'bronze_block'],
  // Every fleece, so a killed sheep gives back the colour it was wearing.
  // Resolved by name like everything else here, so this file still adds
  // nothing to items.js.
  ...Object.fromEntries((CS.WOOL_COLOURS ?? []).map(
    (c) => [`WOOL_${c.toUpperCase()}`, [`wool_${c}`]])),
};

export const DROP_ITEMS = {};
export const MISSING_DROPS = [];
for (const [key, names] of Object.entries(DROP_NAMES)) {
  DROP_ITEMS[key] = names.find((n) => ITEMS[n]) ?? null;
  if (!DROP_ITEMS[key]) MISSING_DROPS.push(`${key} (tried: ${names.join(', ')})`);
}
if (MISSING_DROPS.length) {
  console.warn('entities.js: no items.js id for', MISSING_DROPS.join(' | '));
}

// [key, min, max] — inclusive counts. A sheep's wool is not in here: what it
// gives depends on the colour of the animal and on whether it has been shorn
// already, so rollDrops adds it below.
const DROP_TABLE = {
  pig: [['MEAT_RAW', 1, 3]],
  cow: [['MEAT_RAW', 2, 3], ['LEATHER', 1, 2]],
  sheep: [['MEAT_RAW', 1, 2], ['LEATHER', 0, 1]],
  chicken: [['MEAT_RAW', 1, 1], ['FEATHER', 1, 2]],
  zombie: [['BONE', 0, 1]],
  // The one thing a skeleton is made of, and the arrows it did not get to
  // loose. Two to four bones, always: bone is a dye ingredient nothing else
  // gives you a reliable supply of, so a graveyard is where you go for it.
  skeleton: [['BONE', 2, 4], ['ARROW', 0, 3]],
  dog: [['BONE', 1, 2]],
  bear: [['MEAT_RAW', 2, 4], ['LEATHER', 2, 3]],
  fox: [['LEATHER', 0, 1]],
  wolf: [['BONE', 1, 2]],
  horse: [['LEATHER', 1, 2], ['MEAT_RAW', 1, 2]],
  camel: [['LEATHER', 1, 3], ['MEAT_RAW', 1, 2]],
  cat: [['LEATHER', 0, 1]],
  goat: [['MEAT_RAW', 1, 2], ['LEATHER', 1, 2]],
  // A bee is one insect: there is no honey item to give and no wax, so it
  // leaves nothing. Listed anyway, because a kind with no DROP_TABLE row at
  // all returns undefined from rollDrops and `drops` must never be null
  // after a kill — see damage().
  bee: [],
  hive: [],
  // The golem is bronze that was walking about. Killing one gives the metal
  // back, minus what the smelting cost — which is the whole reason the
  // recipe is worth building rather than hoarding.
  golem: [['BRONZE', 2, 4]],
};

function rollDrops(kind, ent = null) {
  const table = DROP_TABLE[kind];
  if (!table) return [];
  const out = [];
  for (const [key, lo, hi] of table) {
    const id = DROP_ITEMS[key];
    if (!id) continue;
    const count = lo + Math.floor(Math.random() * (hi - lo + 1));
    if (count > 0) out.push({ id, count });
  }
  // The fleece off the animal that was actually killed. A sheep already shorn
  // gives nothing extra — that wool is in your bag, not on its back.
  if (kind === 'sheep' && ent && !ent.sheared) {
    const id = DROP_ITEMS[`WOOL_${fleeceName(ent.fleece).toUpperCase()}`];
    if (id) out.push({ id, count: 1 });
  }
  return out;
}

// --- what colour a sheep is ---------------------------------------------------
// One index into cubesphere's WOOL_COLOURS, carried on the animal. Everything
// downstream — the palette, the drop, the shears — reads it, so a sheep's
// colour is decided in exactly one place.
const WOOL_NAMES = CS.WOOL_COLOURS ?? [];
export const fleeceName = (i) => WOOL_NAMES[i] ?? 'white';

// Born white, brown, grey or black, in roughly the proportions a real flock
// keeps them. Takes the caller's random stream, so a world's flock is part of
// that world rather than of the frame it happened to be generated on.
export function rollFleece(rand = Math.random) {
  const cols = CS.FLEECE_COLOURS ?? [0];
  const w = CS.FLEECE_WEIGHTS ?? [1];
  let r = rand();
  for (let i = 0; i < cols.length; i++) {
    r -= w[i] ?? 0;
    if (r <= 0) return cols[i];
  }
  return cols[0];
}

// ---------------------------------------------------------------------------
// pixel textures (same technique as player.js)

const PX = 16;
// BoxGeometry face order: +x, -x, +y, -y, +z, -z
const FACE_SHADES = [0.82, 0.82, 1.0, 0.55, 0.68, 0.68];

// What the canvases being painted right now are painted FROM: the palette and
// the kind of body, set by materialsFor round each spec. The Realistic style
// reads it back to know that a robe-coloured texel is cloth and a
// hide-coloured one is fur — see realbody.js.
let _texCtx = null;

function partTexture(fn, tag = null) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = PX;
  const g = cv.getContext('2d');
  fn(g);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.real = { ctx: _texCtx, tag };
  return t;
}

const fill = (g, color, x = 0, y = 0, w = PX, h = PX) => {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
};

// x,y,w,h quadruples in one call — keeps the pixel art readable at 80 columns
function rects(g, color, q) {
  g.fillStyle = color;
  for (let i = 0; i < q.length; i += 4) g.fillRect(q[i], q[i + 1], q[i + 2], q[i + 3]);
}

// The body quaternion is makeBasis(right, up, -heading), so a model's local
// +Z points BACKWARD. The face therefore belongs on the -Z slot, or the
// villager stares over its own shoulder while walking away from you.
function partMaterials(spec) {
  const pick = ['side', 'side', 'top', 'bottom', 'back', 'front'];
  // Through lit.js like every other part of a body. These are the TEXTURED
  // pieces — the face above all — and they were the last thing on a villager
  // still lit by nothing: a man who walked into a lantern's pool went warm
  // from the neck down and kept a midnight face.
  return pick.map((slot, i) => {
    const map = spec[slot] ?? spec.side;
    const m = makeLit({
      map, color: new THREE.Color().setScalar(FACE_SHADES[i]),
      body: true, faceShade: true,
    });
    // the canvas this face was painted on, kept whatever it is wearing now:
    // the Realistic style dresses it in a repaint and takes it off again
    m.userData.pixelMap = map;
    dressBody(m);
    return m;
  });
}

// untextured parts (nose, hat crown) still want the per-face shading
// --- a body is lit like everything else -------------------------------------
//
// These were flat MeshBasicMaterials with the tunic colour and the face shade
// baked into `.color`, and nothing in the world ever touched them again. Three
// things followed from that and all three were visible: a villager stayed at
// full daylight at midnight, a villager standing under a lantern was the
// colour of one out in the dark, and a villager standing in the shadow of a
// house was as bright as one in the sun.
//
// They go through lit.js now, on exactly the same material the ground and the
// grass use. The day/night dim, the sun's shadow and the lamps are one shared
// set of uniforms across the whole world, so a body cannot fall out of step
// with the street it is standing in — which is what kept happening while this
// was a system of its own.
//
// The face shade stays baked into the tint, because it is not lighting: it is
// which way the box's face points, and it is the same at every hour.
// ONE material for every plain body part in the world, and the colour carried
// in the geometry instead.
//
// It was a material per colour per face shade, which is six per villager
// outfit, six per hide, six per fleece — measured at 1,220 distinct materials
// in one scene. Each of them declares `lights: true`, so three re-uploads the
// whole lights block for every one of them EVERY FRAME: the directional and
// point arrays, and this file's own sixteen lamps and sixteen gains with
// them. That is the cost, it is paid whether or not a single shadow is drawn,
// and it is why turning shadows off did not help — a frame at eleven a second
// with nothing moving in it.
//
// So the tint and the face shade go into the vertex colours, where they cost
// nothing per frame and nothing per draw, and one material serves the lot.
// The shade is the same six numbers as before, applied per FACE rather than
// per material, which is what the six-material array was doing anyway.
// ...and, under the Realistic style, one per MATERIAL rather than one for
// all: a plain part says what it is made of (the second argument to
// solidMaterials), and realbody.js gives the steel its brushing and the ear
// its fur. Under every other style they draw exactly as the one did.
const BODY_MATS = {};
const bodyMatOf = (cls) => (BODY_MATS[cls] ??= classMaterial(cls));
// A creature from KherveCAD carries its own colours, and no face shade was
// ever baked into them — so it is lit on a material that does not take one
// back out.
const CUSTOM_MAT = makeLit({ vertexColors: true, body: true });
// What a hat's crown is made of, by its colour: a soldier's grey one is a
// helmet, a straw-coloured one is straw, anything else felt.
const _armoured = (base) => base === 'soldier' || base === 'constable' || base === 'guard';
function hatClass(hex, armoured) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  if (armoured && hsl.s < 0.18) return 'metal';
  if (hsl.h * 360 >= 30 && hsl.h * 360 <= 62 && hsl.s > 0.3 && hsl.l > 0.35) return 'straw';
  return 'cloth';
}

function solidMaterials(color, cls = 'cloth') {
  // The six entries the callers still expect — the same material six times.
  // Every one of them draws with the colour the geometry carries, so the
  // array is now only about keeping BoxGeometry's per-face groups happy.
  const c = new THREE.Color(color);
  const mat = bodyMatOf(cls);
  const arr = FACE_SHADES.map(() => mat);
  arr.tint = c;              // read by tintBox when the part is built
  return arr;
}

// Paint a box's own colour into its vertices: four per face, six faces, in
// BoxGeometry's order (+x, -x, +y, -y, +z, -z) — the same order FACE_SHADES
// has always been in.
function tintBox(geo, c) {
  const n = geo.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const sh = FACE_SHADES[Math.min(FACE_SHADES.length - 1, (i / 4) | 0)];
    col[i * 3] = c.r * sh; col[i * 3 + 1] = c.g * sh; col[i * 3 + 2] = c.b * sh;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

// ---------------------------------------------------------------------------
// palettes — the villager professions (and the soldier) plus the zombie

const PALETTE = {
  farmer: {
    skin: '#c9a27a', skinDark: '#a8825c', brow: '#7d5c3c', hair: '#5b4128',
    eye: '#f0ece2', iris: '#3b4d6b', mouth: '#7a5240',
    robe: '#8c5a34', robeDark: '#6b4326', sash: '#4e7d3a',
    apron: '#c2a878', boot: '#4a3526',
    hat: '#d9c07a', hatDark: '#ab9152',   // straw, with a brim
  },
  smith: {
    skin: '#b58555', skinDark: '#8f6540', brow: '#4a3524', hair: '#33241a',
    eye: '#f0ece2', iris: '#4a3a2a', mouth: '#6d4436',
    robe: '#4d4d55', robeDark: '#35353c', sash: '#8a3b2c',
    apron: '#6b4a2a', boot: '#2f2c28',
    band: '#a33a2f', soot: '#2a2622',    // headband, and soot on the arms
  },
  librarian: {
    skin: '#d3ac86', skinDark: '#b08a66', brow: '#6a563f', hair: '#6e6157',
    eye: '#f4f2ec', iris: '#2f5c4a', mouth: '#8a5f4c',
    robe: '#e2dac4', robeDark: '#bfb598', sash: '#6a4a8f',
    apron: null, boot: '#4a4038',
    glasses: '#2c2c30', pack: '#7a4f2c', packDark: '#5a3a20',
  },
  // Iron against everyone else's homespun: a dark tunic, a steel baldric
  // where the villagers wear cloth sashes, a breastplate tone on the chest
  // (the apron slot), and the farmer's hat boxes in grey — a kettle helmet,
  // its "weave" reading as banding on metal.
  soldier: {
    skin: '#b9906a', skinDark: '#957049', brow: '#3d332a', hair: '#2f2b27',
    eye: '#ece8da', iris: '#43423e', mouth: '#6d4a3a',
    robe: '#3d424e', robeDark: '#2b2f39', sash: '#8f97a3',
    apron: '#747c89', boot: '#26231f',
    hat: '#8c939e', hatDark: '#656c77',
  },
  // THE CONSTABLE — the chief of the watch. A soldier's colours, worn better:
  // the same slate coat and steel, because he is of the garrison, but a deeper
  // dye, a brass gorget instead of a mail collar and a red sash of office. You
  // are meant to pick him out of a line of his own men from across the green,
  // which is the entire job of what a constable wears.
  constable: {
    skin: '#b8916b', skinDark: '#93704b', brow: '#3a3129', hair: '#2b2724',
    eye: '#ece8da', iris: '#3f4a52', mouth: '#6d4a3a',
    robe: '#2f3a4c', robeDark: '#1f2733', sash: '#a83a34',
    apron: '#8d9099', boot: '#241f1b',
    hat: '#b9a05c', hatDark: '#8a7433',
  },
  // --- the trades that had no clothes ---------------------------------------
  //
  // Five wardrobes invented for five orders that were borrowing somebody
  // else's. A hunter in a straw hat, a miner at the anvil's palette and a cook
  // dressed as a shopkeeper are all the same mistake: you manage a village by
  // looking at it, and a person who is dressed as the wrong trade is worse
  // than one dressed as none.

  // THE WOODCUTTER. A heavy red check, sleeves rolled to the elbow (that is
  // what `soot` draws — a short sleeve and a dirty forearm), a broad leather
  // belt and boots for standing in wet ground all morning. No hat: you do not
  // wear one under a falling tree.
  woodcutter: {
    skin: '#c39268', skinDark: '#9e7248', brow: '#4a3524', hair: '#3f2c1b',
    eye: '#f0ece2', iris: '#3f5a3a', mouth: '#7a5240',
    robe: '#9c3f34', robeDark: '#6f2a22', sash: '#5a4028',
    apron: null, boot: '#33261a',
    soot: '#6b543a',                     // rolled sleeves, sap and bark
  },

  // THE MINER. Everything dark because everything is underground, and the one
  // bright thing on him is the lamp banded to his brow — which is `band`, the
  // slot the smith wears a headband in, doing an honest day's work as brass.
  // The helmet is the farmer's hat slot in steel.
  miner: {
    skin: '#b98f68', skinDark: '#95704a', brow: '#3a2f24', hair: '#2e2620',
    eye: '#efe9dc', iris: '#4a4640', mouth: '#6d4a3a',
    robe: '#4a4a44', robeDark: '#343430', sash: '#6b5a3a',
    apron: '#5c5348', boot: '#282420',
    band: '#e0b64a',                      // the lamp, on the brow
    hat: '#6e747c', hatDark: '#474d55',   // a steel helmet
    soot: '#241f1b',                      // coal on the arms
  },

  // THE HUNTER. Greens and browns because the whole job is not being seen, a
  // hood rather than a brim, a quiver on the back — `pack`, the librarian's
  // satchel slot, in leather — and a knife-belt.
  hunter: {
    skin: '#c09268', skinDark: '#9b7148', brow: '#4a3a26', hair: '#453224',
    eye: '#eee9dd', iris: '#4b6b3f', mouth: '#75503e',
    robe: '#50603c', robeDark: '#39472a', sash: '#6b4a2a',
    apron: null, boot: '#3a2c1e',
    hat: '#3f4d30', hatDark: '#2b3720',   // a hood, not a brim
    pack: '#7a5330', packDark: '#523517', // the quiver
  },

  // THE COOK. Whites, because that is what a kitchen has meant for two hundred
  // years and it reads instantly at sixteen pixels — a pale coat, a paler
  // apron over it, a red sash and a soft white cap.
  cook: {
    skin: '#d0a374', skinDark: '#ad8158', brow: '#5e4630',
    hair: '#4a382a',
    eye: '#f2eee4', iris: '#54402a', mouth: '#7d5342',
    robe: '#e9e5db', robeDark: '#c8c3b6', sash: '#a83a34',
    apron: '#f4f1e8', boot: '#3a332c',
    hat: '#f0ece2', hatDark: '#cdc8bc',   // the cap
  },

  // THE BEEKEEPER. A pale suit so the bees have nothing to take exception to,
  // and the one thing that makes the trade unmistakable: a dark veil across
  // the face. That is `glasses` — the librarian's spectacle slot — drawn wide,
  // which at this size is exactly a mesh over the eyes.
  // A SAGE suit rather than a white one, and that is not taste either: the
  // cook is already in whites, and two pale trades standing in the same street
  // are two people you cannot tell apart at the distance you actually manage a
  // village from. The veil is the thing that names the job; the hue is what
  // lets you see there are two jobs at all.
  beekeeper: {
    skin: '#cda276', skinDark: '#a87f54', brow: '#5b4831', hair: '#4f4034',
    eye: '#efeade', iris: '#4a5a3a', mouth: '#7b5340',
    robe: '#c8d0ae', robeDark: '#a3ac89', sash: '#c8a24a',
    apron: '#d9dfc2', boot: '#4a4238',
    hat: '#b9c2a0', hatDark: '#7d8a6b',   // the broad brim the veil hangs off
    glasses: '#2b3128',                    // the veil
  },

  // The builder. Rough clothes, a leather apron and a head-wrap against the
  // dust — dressed for a day of lifting blocks, which is exactly what one of
  // these is doing every time you see one. Same hammering pose as the smith,
  // because it is the same action.
  builder: {
    skin: '#bd8f60', skinDark: '#996f46', brow: '#4f3a26', hair: '#3a2a1c',
    eye: '#f0ece2', iris: '#4d3a26', mouth: '#744c3a',
    robe: '#7e6a4a', robeDark: '#5d4d34', sash: '#a4632c',
    apron: '#8a6438', boot: '#3a2f24',
    hat: '#c9b48a', hatDark: '#9c8a66',
  },
  // The shopkeeper. Everybody else in a village is dressed for work they do
  // outdoors; a trader is dressed for standing behind a counter all day, so
  // the coat is the good one, the sash is the money colour, and there is an
  // apron over it because they still have to lift the crates themselves.
  trader: {
    skin: '#c49b74', skinDark: '#a07751', brow: '#5e4630', hair: '#43301f',
    eye: '#f2eee4', iris: '#5a4326', mouth: '#7d5342',
    robe: '#5d4a7a', robeDark: '#43355a', sash: '#c8a23f',
    apron: '#d8cdb2', boot: '#3b2f24',
    pack: '#6b4526', packDark: '#4c3019',
  },
  // THE BARTENDER. The trader's job in a different room, and dressed as the
  // near-miss it is: the same long apron, but a WHITE one over a plain shirt
  // with the sleeves rolled, and no coat and no money sash — he is not selling
  // you anything, he is pouring it. A waistcoat rather than a robe, because
  // what has to read from the door of a room full of people sitting down is
  // the one man standing up in an apron.
  barkeep: {
    skin: '#c09468', skinDark: '#9c7247', brow: '#4a3520', hair: '#3a281a',
    eye: '#f2eee4', iris: '#4b3a22', mouth: '#7d5342',
    robe: '#8d5f3c', robeDark: '#6a4529', sash: '#4d3a26',
    apron: '#ece5d4', boot: '#3b2f24',
  },
  // THE OLD MAN IN THE CAFÉ. White hair and a white beard, skin that has
  // been in the sun for seventy years, a plain dark robe and a red cap — the
  // one man in the room who is not dressed for anything, because he is not
  // going anywhere. See spawnElders.
  elder: {
    skin: '#b98a62', skinDark: '#946a45', brow: '#d8d2c6', hair: '#e2ddd3',
    eye: '#f2eee4', iris: '#3f3a34', mouth: '#7d5342',
    robe: '#3b3a44', robeDark: '#27262e', sash: '#6a4a2c',
    apron: null, boot: '#3a2d22',
    hat: '#a3302b', hatDark: '#70201c',   // the cap, no brim to speak of
    beard: '#e6e1d8',
  },
  // THE PRIEST. The one villager who is not dressed for work: an undyed
  // habit, a rope at the waist where everybody else has a woven sash, and no
  // apron at all, because he is not making anything. Pale, indoor, older —
  // grey at the temples and a full beard, so the silhouette reads as somebody
  // who has been standing in that church a long time.
  priest: {
    skin: '#cba887', skinDark: '#a8855f', brow: '#8a8378', hair: '#b7b2a6',
    eye: '#f4f2ec', iris: '#4a5a52', mouth: '#87604d',
    robe: '#e6e0cf', robeDark: '#bdb6a2', sash: '#8a7a52',
    apron: null, boot: '#4a4038',
    beard: '#c3bdb0',
  },
  // THE CHIEF. Not a villager with a bigger hat — the palette says it before
  // the crown does. Everybody else in a village is dressed for work they do
  // outdoors in weather; this one is dressed for sitting in a hall deciding
  // what everybody else does. Deep crimson over black, gold at the throat and
  // the waist, and a gold crown with a red stone in it.
  //
  // No culture wardrobe is laid over this one (see `dressed` below): a chief
  // wears what a chief wears, on every world.
  chief: {
    skin: '#c19a72', skinDark: '#9c7850', brow: '#4a3524', hair: '#2e2620',
    eye: '#f4f2ec', iris: '#3a3f52', mouth: '#7a5240',
    robe: '#7c1f2e', robeDark: '#4a1119', sash: '#d8b04a',
    apron: '#2a2028', boot: '#211a16',
    crown: '#e8c05a', crownDark: '#a8862c', gem: '#c8322e',
    beard: '#4a3d33',
  },
  zombie: {
    skin: '#6f9a52', skinDark: '#537639', rot: '#42602c', bone: '#c9c4a8',
    socket: '#131a12', glint: '#2f4a2a', mouth: '#28331f',
    shirt: '#3f6b78', shirtDark: '#2c4c56', stain: '#26383d',
    legs: '#2f4258', legsDark: '#22334a',
  },
  // Bone, and nothing else. Every colour here is a shade of it — the shape
  // has to do all the work, so the pixels carry the ribs, the sockets and the
  // joints and never a scrap of cloth.
  skeleton: {
    bone: '#ded8c4', boneDark: '#b3ac95', boneDeep: '#8e876f',
    socket: '#121310', glint: '#c6d8d2', grime: '#9a9078',
    bow: '#6b4a2a', string: '#e7e1cc',
  },
};

// --- what the local people wear ---------------------------------------------
//
// A villager on Cinder and a villager on Ferrum wore the same coat, which
// quietly said the whole system was settled by one people who happen to build
// differently. The wardrobe fixes that with the smallest change that works: a
// colour override laid over the job palette above, so a farmer is still
// recognisably a farmer — same hat, same apron, same shape — in the cloth of
// the world they farm on.
//
// CLOTHING only. What a people can weave, dye and afford is a fact about
// where they live: Cinder has no loom and dresses in hides, Thalassa has
// indigo and salt-bleached linen, Rime has the one red dye it uses on
// everything. That reads as culture. Nothing here touches skin or face.
//
// Keyed by preset id, exactly like the building cultures in village.js, so a
// world's people look and build like each other by construction.
const WARDROBE = {
  // Hides and furs, dark and undyed: there is no loom on the ash world.
  coal: {
    robe: '#6b5236', robeDark: '#4b3826', sash: '#8a6a3f',
    apron: '#7a6749', boot: '#3a2d1e', hat: '#6a5740', hatDark: '#463a2a',
  },
  // Workwear. Dark serge and a rust-red neckerchief — the colours of a place
  // where everybody is somebody's employee.
  iron: {
    robe: '#3f4a55', robeDark: '#2b333c', sash: '#9c4030',
    apron: '#6d7079', boot: '#241f1b',
  },
  // Indigo over salt-bleached linen: the two things an island world has in
  // quantity are dye from the shallows and sun to bleach in.
  ocean: {
    robe: '#2f4d7a', robeDark: '#203856', sash: '#efeade',
    apron: '#cfd6dd', boot: '#3a3a3f',
  },
  // Vermilion and cream, the same red the buildings carry — a world that
  // owns one strong dye puts it on everything it has.
  ice: {
    robe: '#8f3128', robeDark: '#6a201a', sash: '#e6dcc3',
    apron: '#cbbb92', boot: '#3f342b',
  },
  // Saffron and white, and lightly worn: it rains here all the time and
  // heavy cloth never dries.
  storm: {
    robe: '#d4822c', robeDark: '#a35c19', sash: '#f2eade',
    apron: '#e0d6bd', boot: '#4a3a2c',
  },
  // Ash grey with one ember stripe. Nothing pale survives a week here.
  volcanic: {
    robe: '#3b3733', robeDark: '#26231f', sash: '#b8481f',
    apron: '#565049', boot: '#211e1b',
  },
  // TAILORING, not homespun: the city asked for civilised clothes. Charcoal
  // coats over waistcoat grey, a burgundy cravat where a villager wears a
  // work sash, polished black boots, and the farmer's straw brim reads as a
  // dark city hat. Same shapes, better cloth — a crowd of these against the
  // grey towers is a street of clerks and shopgoers, not a field crew.
  city: {
    robe: '#3a3f4a', robeDark: '#282c34', sash: '#6e3140',
    apron: '#4a4f5a', boot: '#1f1d1a', hat: '#2e3138', hatDark: '#1f2126',
  },
  // Terran is deliberately absent: home is the baseline every other wardrobe
  // is read against, and a null entry means "wear what you always wore".
};

// The world's people, set by main.js once the planet is built. Module state
// for the same reason cubesphere keeps R and S there: only one planet exists
// at a time, so only one wardrobe can be in use.
let _wardrobe = null;

export function setVillagerCulture(presetId) {
  const next = WARDROBE[presetId] ?? null;
  if (next === _wardrobe) return;
  _wardrobe = next;
}

// ---------------------------------------------------------------------------
// villager face and clothing

// What makes a woman a woman here, laid over whatever job she holds. It is a
// PATCH and not a palette of its own on purpose: a woman smith is a smith —
// same apron, same soot, same hammer — and if her whole palette were written
// separately the two would drift apart the first time anybody tuned one.
//
// Three things carry it, and none of them is a colour trick: hair down past
// the jaw (see villagerSpec's `long`), a lighter brow, and a kirtle over the
// robe. The BODY is narrower in the shoulder and a little shorter — see
// buildBody — and that is what actually reads at twenty paces, because the
// silhouette always does.
const WOMAN = {
  long: true,
  brow: null,          // no heavy shelf over the eyes
  kirtle: '#00000022',  // a darker overskirt, mixed over whatever the robe is
};

function villagerSpec(p) {
  const head = {
    front: partTexture((g) => {
      fill(g, p.skin);
      fill(g, p.hair, 0, 0, PX, 3);
      // Long hair frames the face rather than sitting on top of it: two
      // columns down past the jaw, which is what turns a fringe into a
      // hairstyle at the sixteen pixels this is drawn at.
      if (p.long) {
        fill(g, p.hair, 0, 0, 3, PX);
        fill(g, p.hair, PX - 3, 0, 3, PX);
        fill(g, p.hair, 0, 0, PX, 4);
      }
      if (p.band) fill(g, p.band, 0, 2, PX, 2);
      if (p.brow) rects(g, p.brow, [2, 5, 5, 2, 9, 5, 5, 2]);   // heavy brow
      rects(g, p.eye, [3, 7, 3, 2, 10, 7, 3, 2]);
      rects(g, p.iris, [4, 7, 2, 2, 11, 7, 2, 2]);
      if (p.glasses) {
        rects(g, p.glasses,
          [2, 6, 5, 1, 2, 9, 5, 1, 9, 6, 5, 1, 9, 9, 5, 1,
            2, 7, 1, 2, 6, 7, 1, 2, 9, 7, 1, 2, 13, 7, 1, 2, 7, 7, 2, 1]);
      }
      rects(g, p.skinDark, [6, 10, 4, 2]);                  // under the nose
      fill(g, p.mouth, 6, 13, 4, 1);
    }, 'face'),
    side: partTexture((g) => {
      fill(g, p.skin);
      fill(g, p.hair, 0, 0, PX, p.long ? 11 : 4);
      if (p.band) fill(g, p.band, 0, 2, PX, 2);
      if (!p.long) rects(g, p.skinDark, [6, 7, 3, 3]);      // ear
    }),
    back: partTexture((g) => {
      fill(g, p.skin);
      fill(g, p.hair, 0, 0, PX, p.long ? PX : 8);
      if (p.band) fill(g, p.band, 0, 2, PX, 2);
    }),
    top: partTexture((g) => fill(g, p.hair)),
    bottom: partTexture((g) => fill(g, p.skinDark)),
  };
  const torso = {
    front: partTexture((g) => {
      fill(g, p.robe);
      fill(g, p.skin, 6, 0, 4, 2);                          // neck opening
      fill(g, p.robeDark, 7, 2, 2, PX - 2);                 // centre seam
      if (p.apron) fill(g, p.apron, 3, 7, 10, 9);
      // stepped diagonal sash: the one detail that says "villager" at a glance
      for (let i = 0; i < 7; i++) rects(g, p.sash, [1 + i * 2, 2 + i * 2, 3, 2]);
      // The kirtle: an overskirt from the waist down, in the robe's own dark.
      // It goes on AFTER the sash, so the sash stops at the waist the way a
      // real one does rather than running down into the skirt.
      if (p.long) fill(g, p.robeDark, 0, 9, PX, 7);
      fill(g, p.robeDark, 0, 14, PX, 2);
    }),
    side: partTexture((g) => {
      fill(g, p.robe);
      rects(g, p.robeDark, [0, 14, PX, 2, 0, 6, PX, 1]);
      if (p.long) fill(g, p.robeDark, 0, 9, PX, 7);
      if (p.apron) fill(g, p.apron, 11, 7, 5, 9);
    }),
    back: partTexture((g) => {
      fill(g, p.robe);
      fill(g, p.skin, 6, 0, 4, 2);
      rects(g, p.robeDark, [7, 2, 2, PX - 2, 0, 14, PX, 2]);
      if (p.long) fill(g, p.robeDark, 0, 9, PX, 7);
    }),
    top: partTexture((g) => { fill(g, p.robe); fill(g, p.skin, 5, 5, 6, 6); }),
    bottom: partTexture((g) => fill(g, p.robeDark)),
  };
  const arm = {
    side: partTexture((g) => {
      fill(g, p.skin);
      fill(g, p.robe, 0, 0, PX, p.soot ? 5 : 9);            // sleeve length
      fill(g, p.robeDark, 0, p.soot ? 5 : 9, PX, 1);
      if (p.soot) rects(g, p.soot, [3, 8, 3, 2, 9, 11, 2, 2]);
      fill(g, p.skinDark, 0, 14, PX, 2);                    // hand shadow
    }),
    top: partTexture((g) => fill(g, p.robe)),
    bottom: partTexture((g) => fill(g, p.skin)),            // hand
  };
  const leg = {
    side: partTexture((g) => {
      fill(g, p.robeDark);
      fill(g, p.boot, 0, 11, PX, 5);
      fill(g, p.robe, 0, 0, PX, 3);                         // hem of the robe
    }),
    top: partTexture((g) => fill(g, p.robe)),
    bottom: partTexture((g) => fill(g, p.boot)),            // sole
  };
  const spec = { head, torso, arm, leg };
  if (p.hat) {
    // straw weave: base colour plus dashes, so the brim is not a flat disc
    const weave = partTexture((g) => {
      fill(g, p.hat);
      for (let y = 1; y < PX; y += 3) rects(g, p.hatDark, [0, y, PX, 1]);
    });
    spec.hat = { side: weave, top: weave, bottom: partTexture((g) => fill(g, p.hatDark)) };
  }
  if (p.pack) {
    const flap = partTexture((g) => {
      fill(g, p.pack);
      rects(g, p.packDark, [0, 5, PX, 2, 6, 7, 4, 3]);      // strap + buckle
    });
    spec.pack = { side: flap, top: partTexture((g) => fill(g, p.packDark)) };
  }
  return spec;
}

// ---------------------------------------------------------------------------
// zombie: same silhouette, everything about it decayed

function zombieSpec(p) {
  return {
    head: {
      front: partTexture((g) => {
        fill(g, p.skin);
        rects(g, p.rot, [0, 0, 5, 3, 11, 2, 5, 2, 2, 12, 3, 2]);
        rects(g, p.socket, [3, 6, 4, 3, 9, 6, 4, 3]);       // sunken sockets
        rects(g, p.glint, [4, 7, 2, 1, 10, 7, 2, 1]);       // no whites at all
        rects(g, p.skinDark, [6, 9, 4, 3]);
        rects(g, p.mouth, [5, 12, 6, 2]);
        rects(g, p.bone, [5, 13, 1, 1, 8, 13, 1, 1, 10, 13, 1, 1]);  // teeth
        rects(g, p.skinDark, [12, 5, 1, 7]);                // gash down a cheek
      }),
      side: partTexture((g) => {
        fill(g, p.skin);
        rects(g, p.rot, [2, 1, 6, 4, 10, 9, 5, 4]);
        rects(g, p.socket, [6, 7, 3, 3]);                   // ear hole
      }),
      back: partTexture((g) => {
        fill(g, p.skin);
        rects(g, p.rot, [1, 1, PX - 2, 7]);
        rects(g, p.bone, [6, 3, 4, 3]);                     // skull showing
        rects(g, p.skinDark, [3, 11, 5, 2]);
      }),
      top: partTexture((g) => { fill(g, p.rot); rects(g, p.bone, [5, 5, 5, 4]); }),
      bottom: partTexture((g) => fill(g, p.skinDark)),
    },
    torso: {
      front: partTexture((g) => {
        fill(g, p.shirt);
        fill(g, p.skin, 6, 0, 4, 2);
        rects(g, p.stain, [2, 3, 4, 3, 10, 8, 4, 4]);
        rects(g, p.skin, [3, 8, 4, 5]);                     // ribs through a rip
        rects(g, p.bone, [3, 9, 4, 1, 3, 11, 4, 1]);
        // torn hem: alternating teeth beat a straight cut every time
        for (let x = 0; x < PX; x += 4) rects(g, p.skinDark, [x, 14, 2, 2]);
      }),
      side: partTexture((g) => {
        fill(g, p.shirt);
        rects(g, p.shirtDark, [0, 6, PX, 1]);
        rects(g, p.skin, [9, 9, 5, 4]);
        for (let x = 2; x < PX; x += 4) rects(g, p.skinDark, [x, 14, 2, 2]);
      }),
      back: partTexture((g) => {
        fill(g, p.shirt);
        fill(g, p.skin, 6, 0, 4, 2);
        rects(g, p.stain, [4, 4, 8, 6]);
        for (let x = 0; x < PX; x += 4) rects(g, p.skinDark, [x, 14, 2, 2]);
      }),
      top: partTexture((g) => { fill(g, p.shirt); fill(g, p.skin, 5, 5, 6, 6); }),
      bottom: partTexture((g) => fill(g, p.skinDark)),
    },
    arm: {
      side: partTexture((g) => {
        fill(g, p.skin);
        fill(g, p.shirt, 0, 0, PX, 6);
        for (let x = 0; x < PX; x += 4) rects(g, p.shirtDark, [x, 6, 2, 2]);
        rects(g, p.rot, [2, 9, 4, 3, 10, 12, 4, 3]);
        rects(g, p.bone, [6, 13, 3, 1]);                    // wrist bone
      }),
      top: partTexture((g) => fill(g, p.shirt)),
      bottom: partTexture((g) => fill(g, p.skinDark)),
    },
    leg: {
      side: partTexture((g) => {
        fill(g, p.legs);
        rects(g, p.legsDark, [3, 4, 4, 5, 9, 9, 4, 3]);
        rects(g, p.skin, [0, 13, PX, 3]);                   // bare, torn cuff
        for (let x = 1; x < PX; x += 4) rects(g, p.legsDark, [x, 12, 2, 2]);
      }),
      top: partTexture((g) => fill(g, p.legsDark)),
      bottom: partTexture((g) => fill(g, p.skinDark)),      // bare foot
    },
  };
}

// ---------------------------------------------------------------------------
// skeleton: a skull, a ribcage and four sticks
//
// The zombie above keeps the villager's silhouette and rots it. This does the
// opposite: the silhouette is stripped back, and what is drawn on it is the
// SKELETON — a cranium with two black sockets and a row of teeth on the head,
// a ribcage over a gap over a pelvis on the torso, and a plain shaft with a
// knob at each end on every limb. Nothing here is shaded to look round; the
// only marks are the ones that say "bone" at ten paces.

function skeletonSpec(p) {
  // a limb: pale shaft down the middle of a dark ground, with joint knobs
  const limb = (grime) => partTexture((g) => {
    fill(g, p.boneDeep);
    fill(g, p.bone, 4, 0, 8, PX);
    rects(g, p.boneDark, [4, 0, 8, 2, 4, 14, 8, 2]);      // the joints
    rects(g, p.bone, [3, 0, 10, 2, 3, 14, 10, 2]);
    if (grime) rects(g, p.grime, [5, 6, 2, 3, 9, 9, 2, 2]);
  });
  const shaftTop = partTexture((g) => {
    fill(g, p.boneDeep);
    rects(g, p.bone, [3, 3, 10, 10]);
  });
  return {
    head: {
      front: partTexture((g) => {
        fill(g, p.bone);
        rects(g, p.boneDark, [0, 0, PX, 2, 0, 0, 2, PX, 14, 0, 2, PX]);
        rects(g, p.socket, [3, 5, 4, 4, 9, 5, 4, 4]);      // the sockets
        rects(g, p.glint, [4, 7, 1, 1, 10, 7, 1, 1]);      // one cold spark
        rects(g, p.boneDark, [7, 9, 2, 2]);                // the nasal cavity
        rects(g, p.socket, [7, 10, 2, 1]);
        rects(g, p.boneDark, [3, 12, 10, 4]);              // the jaw
        rects(g, p.bone, [4, 13, 1, 2, 6, 13, 1, 2, 8, 13, 1, 2, 10, 13, 1, 2]);
      }),
      side: partTexture((g) => {
        fill(g, p.bone);
        rects(g, p.boneDark, [0, 0, PX, 2, 2, 12, 12, 4]);  // jaw line
        rects(g, p.socket, [11, 5, 3, 4]);                  // the eye, in profile
        rects(g, p.boneDeep, [4, 6, 3, 3]);                 // the ear canal
        rects(g, p.bone, [3, 13, 1, 2, 5, 13, 1, 2, 7, 13, 1, 2]);
      }),
      back: partTexture((g) => {
        fill(g, p.bone);
        rects(g, p.boneDark, [0, 0, PX, 2, 6, 2, 4, 12]);   // the cranial seam
        rects(g, p.boneDeep, [4, 12, 8, 3]);
      }),
      top: partTexture((g) => {
        fill(g, p.bone);
        rects(g, p.boneDark, [7, 0, 2, PX, 0, 7, PX, 2]);   // the sutures
      }),
      bottom: partTexture((g) => fill(g, p.boneDeep)),
    },
    torso: {
      // ribs, a gap, then the pelvis — the whole read of the body in one tile
      front: partTexture((g) => {
        fill(g, p.socket);                                  // the dark inside
        rects(g, p.bone, [6, 0, 4, 3]);                      // the sternum...
        rects(g, p.bone, [7, 0, 2, 9]);
        for (let y = 1; y < 9; y += 2) {                     // ...and the ribs
          rects(g, p.bone, [2, y, 5, 1, 9, y, 5, 1]);
          rects(g, p.boneDark, [1, y, 1, 1, 14, y, 1, 1]);
        }
        rects(g, p.bone, [2, 11, 12, 2]);                    // the pelvic girdle
        rects(g, p.boneDark, [6, 13, 4, 3]);
        rects(g, p.bone, [7, 9, 2, 3]);                      // the spine between
      }),
      side: partTexture((g) => {
        fill(g, p.boneDeep);
        for (let y = 1; y < 9; y += 2) rects(g, p.bone, [3, y, 10, 1]);
        rects(g, p.boneDark, [11, 0, 3, PX]);                // the spine, in profile
        rects(g, p.bone, [2, 11, 12, 2]);
      }),
      back: partTexture((g) => {
        fill(g, p.boneDeep);
        rects(g, p.bone, [6, 0, 4, 11]);                     // the vertebrae
        for (let y = 1; y < 11; y += 2) rects(g, p.boneDark, [6, y, 4, 1]);
        rects(g, p.bone, [2, 11, 12, 2]);
      }),
      top: partTexture((g) => { fill(g, p.boneDark); rects(g, p.bone, [5, 5, 6, 6]); }),
      bottom: partTexture((g) => fill(g, p.boneDeep)),
    },
    arm: { side: limb(false), top: shaftTop, bottom: shaftTop },
    leg: { side: limb(true), top: shaftTop, bottom: shaftTop },
  };
}

// ---------------------------------------------------------------------------
// the bronze golem
//
// Cast metal, not cloth: the whole texture vocabulary here is PLATE EDGES and
// rivets, because a flat colour at this size reads as plastic. Verdigris
// creeps out of the seams — the streaks are what make it look old, and old is
// what makes it look like it belongs to the village rather than to the player.
function golemSpec(p) {
  const rivets = (g, y) => {
    g.fillStyle = p.dark;
    for (let x = 2; x < PX; x += 4) g.fillRect(x, y, 1, 1);
  };
  // one plate: a lit top edge, a shadowed bottom one, rivets along the seam
  const plate = (seed, moss = 3) => partTexture((g) => {
    fill(g, p.plate);
    fill(g, p.plateDark, 0, PX - 3, PX, 3);      // the shadowed lower edge
    fill(g, p.plateDark, 0, 0, PX, 1);           // the seam above
    rivets(g, 2);
    rivets(g, PX - 5);
    if (moss) dabs(g, p.verdigris, moss, seed, 2);
  });
  const head = {
    front: partTexture((g) => {
      fill(g, p.plate);
      fill(g, p.plateDark, 0, 0, PX, 3);
      // The eyes are the one bright thing on it. Pale green, wide apart and
      // set UNDER the brow plate, so the face has a scowl built into the
      // geometry rather than drawn on.
      rects(g, p.dark, [2, 6, 5, 4, 9, 6, 5, 4]);
      rects(g, p.eye, [3, 7, 3, 2, 10, 7, 3, 2]);
      fill(g, p.plateDark, 6, 11, 4, 5);         // the mouth slot
      dabs(g, p.verdigris, 2, 61, 2);
    }),
    side: partTexture((g) => {
      fill(g, p.plate);
      fill(g, p.plateDark, 0, 0, PX, 3);
      rects(g, p.dark, [10, 6, 4, 4]);
      rects(g, p.eye, [11, 7, 2, 2]);
      rivets(g, 12);
      dabs(g, p.verdigris, 2, 67, 2);
    }),
    back: plate(71, 2),
    top: plate(73, 4),
    bottom: partTexture((g) => fill(g, p.plateDark)),
  };
  // The chest carries the one piece of ornament on the whole body: a cast
  // band across it, the way a bell carries its inscription.
  const torso = {
    front: partTexture((g) => {
      fill(g, p.plate);
      fill(g, p.plateDark, 0, 6, PX, 3);         // the band
      rivets(g, 7);
      fill(g, p.plateDark, 0, PX - 2, PX, 2);
      rects(g, p.verdigris, [1, 9, 2, 5, 13, 9, 2, 4]);   // streaks off the band
      dabs(g, p.verdigris, 3, 11, 2);
    }),
    side: plate(17, 4),
    back: plate(19, 5),
    top: plate(23, 3),
    bottom: partTexture((g) => fill(g, p.plateDark)),
  };
  const limb = plate(29, 3);
  const limbEnd = partTexture((g) => {
    fill(g, p.plateDark);
    rects(g, p.plate, [3, 3, PX - 6, PX - 6]);
  });
  return {
    head, torso,
    arm: { side: limb, top: limbEnd, bottom: limbEnd },
    leg: { side: plate(31, 2), top: limbEnd, bottom: limbEnd },
  };
}

// ---------------------------------------------------------------------------
// animals
//
// Four species off one set of drawing routines: the differences that read at
// ten paces are the silhouette (leg length, body length) and two or three
// marks on the hide, not a bespoke texture each.

const ANIMAL_PALETTE = {
  pig: {
    hide: '#e39aa5', hideDark: '#c4737f', belly: '#efb7bf',
    muzzle: '#d9808f', nostril: '#8c4a56', eye: '#241814', hoof: '#7a464e',
    snout: '#d9808f',
  },
  cow: {
    hide: '#efeade', hideDark: '#cbc4b4', belly: '#e6dfd0',
    muzzle: '#d7a493', nostril: '#7c5548', eye: '#1e1712', hoof: '#39322b',
    patch: '#3b322a', horn: '#ddd2b0',
  },
  sheep: {
    hide: '#efe9dc', hideDark: '#cfc7b5', belly: '#e4dccb',
    muzzle: '#c9a68f', nostril: '#7a5c4c', eye: '#241c16', hoof: '#463d34',
    face: '#3f362c', fleece: true,
  },
  chicken: {
    // White bird, red comb and wattle, yellow beak and legs — the classic.
    // `leg` overrides the dark-hide legs the quadrupeds get; the hoof band
    // is a slightly deeper yellow so the feet still read as feet.
    hide: '#f6f3ea', hideDark: '#d8d2c2', belly: '#ece6d6',
    muzzle: '#e8a92f', nostril: '#b07a22', eye: '#221a14', hoof: '#cf8f26',
    comb: '#cc2f24', beak: '#e8a92f', leg: '#e8a92f',
  },
  // The polar bear. Cream rather than white: a pure-white animal on snow is a
  // silhouette with no shape in it, and the shading the faces already carry
  // needs somewhere to go.
  bear: {
    hide: '#e8e4da', hideDark: '#c9c4b6', belly: '#f2efe7',
    muzzle: '#2a2622', nostril: '#141210', eye: '#1a1714', hoof: '#3a352e',
    snout: '#2a2622',
  },

  // The city dog. Patched rather than plain, because a street full of one
  // solid colour reads as a copy-paste; the patch dabber scatters them.
  dog: {
    hide: '#b07d4a', hideDark: '#8a5f36', belly: '#d8b98a',
    muzzle: '#2e241c', nostril: '#15100c', eye: '#1a1410', hoof: '#3a2f26',
    patch: '#efe6d6', snout: '#2e241c',
  },

  // The fox: orange over a white chest and muzzle, black legs and ears, and
  // a tail nearly the length of the body with a white tip. The black `leg`
  // override is what sells it — an all-orange fox reads as a small odd dog.
  fox: {
    hide: '#d8712a', hideDark: '#a94f1b', belly: '#f2e9d8',
    muzzle: '#f2e9d8', nostril: '#17110d', eye: '#1c130c', hoof: '#221b16',
    leg: '#26201a', chest: '#f2e9d8', tailTip: '#f2e9d8', ear: '#26201a',
    snoutLong: '#f2e9d8',
  },

  // The wolf: grey all through, a shade paler under the belly, amber eyes.
  wolf: {
    hide: '#8b8d92', hideDark: '#5e6066', belly: '#b6b9bd',
    muzzle: '#a7a9ae', nostril: '#141311', eye: '#b5872c', hoof: '#2c2a27',
    chest: '#b6b9bd', snoutLong: '#a7a9ae',
  },

  // The horse: chestnut hide, near-black mane and tail. `mane` also colours
  // the tail, so the two read as the same hair.
  horse: {
    hide: '#96613a', hideDark: '#74492a', belly: '#a87548',
    muzzle: '#5b3d26', nostril: '#241812', eye: '#181009', hoof: '#332921',
    mane: '#2c2118',
  },

  // The camel. Sand-coloured, because that is what it lives on: the hide is
  // the desert's own tone a shade darker, so it reads AGAINST the dunes
  // rather than vanishing into them. `mane` is the shaggy hair — the hump,
  // the crest of the neck and the tuft at the throat — and it is the one
  // thing on the animal darker than the sand.
  camel: {
    hide: '#c39a5f', hideDark: '#9d7742', belly: '#d8b884',
    muzzle: '#8a6a3e', nostril: '#3a2a18', eye: '#1b1309', hoof: '#4a3a26',
    mane: '#7d5c31', snoutLong: '#cbaa74',
  },

  // The cat: a grey tabby with a white bib and white socks, and the one
  // green eye on the planet. `patch` is the tabby striping — the dabber
  // scatters it, so no two cats carry the same coat even though they share
  // one material set. The pale `leg` is the socks; without them a small grey
  // quadruped at ten paces is a small grey nothing.
  cat: {
    hide: '#7d7f85', hideDark: '#5a5c62', belly: '#b9bbc0',
    muzzle: '#c9cbd0', nostril: '#d98c9a', eye: '#7fc24a', hoof: '#4a4c51',
    patch: '#4e5055', leg: '#c6c8cd', chest: '#e2e4e8',
    ear: '#5a5c62', snoutLong: '#c9cbd0', tailTip: '#e2e4e8',
  },

  // The mountain goat: dirty cream, shaggier and greyer than a sheep, with a
  // dark face and dark legs so it still has a shape against snow. `horn` is
  // the whole silhouette — see buildAnimal — and `beard` hangs off the chin.
  goat: {
    hide: '#ddd6c4', hideDark: '#a9a294', belly: '#c9c2b0',
    muzzle: '#5c5348', nostril: '#2a241d', eye: '#241d16', hoof: '#332c24',
    horn: '#3a332b', leg: '#6b6053', face: '#7a6f61', beard: '#4a4238',
    shaggy: true,
  },

  // The bee. Black and amber banding is the entire read at this size, so the
  // hide texture is bands rather than dabs — see hideTex's `stripe` branch.
  bee: {
    hide: '#e8b422', hideDark: '#2a2118', belly: '#f0c94e',
    muzzle: '#2a2118', nostril: '#151109', eye: '#100c07', hoof: '#2a2118',
    stripe: '#2a2118', snout: '#2a2118',
  },

  // The hive: layered wax comb, darker at the seams. It never moves and it
  // never poses, so all it needs is a hide and a mouth.
  hive: {
    hide: '#c98f2e', hideDark: '#96661d', belly: '#b07a24',
    muzzle: '#3b2a12', nostril: '#241804', eye: '#241804', hoof: '#96661d',
  },
};

// The bronze golem's plating. Not in ANIMAL_PALETTE — it is a biped built
// like a villager, so it goes through PALETTE and villagerSpec's slots.
// Weathered bronze rather than bright: a golem that has stood in a village
// green through a few winters, with verdigris in the seams.
const GOLEM_PALETTE = {
  plate: '#a97b3c', plateDark: '#7d5828', verdigris: '#5f8f72',
  eye: '#cfe8a0', vine: '#4f7a45', dark: '#33240f',
};

// A tiny fixed-sequence dabber, so a fleece or a cow's patches look scattered
// but come out identical on every load.
function dabber(seed) {
  let a = seed | 0;
  return () => {
    a = (a * 1664525 + 1013904223) | 0;
    return ((a >>> 8) & 0xffff) / 65536;
  };
}

function dabs(g, colour, n, seed, size = 3) {
  const r = dabber(seed);
  g.fillStyle = colour;
  for (let i = 0; i < n; i++) {
    const w = 1 + Math.floor(r() * size);
    const h = 1 + Math.floor(r() * size);
    g.fillRect(Math.floor(r() * PX), Math.floor(r() * PX), w, h);
  }
}

// hide with the species' surface treatment: cow blotches, sheep fleece, or
// nothing at all for a pig, whose whole charm is being smooth and pink
function hideTex(p, seed, extra = null) {
  return partTexture((g) => {
    fill(g, p.hide);
    // A bee is banded, not blotched: the stripes have to line up across the
    // faces or the abdomen reads as a scattered mess at the two-pixel scale
    // it is actually drawn at, so they are laid down flat rather than dabbed.
    if (p.stripe) {
      for (let y = 2; y < PX; y += 6) fill(g, p.stripe, 0, y, PX, 3);
    }
    if (p.patch) dabs(g, p.patch, 5, seed, 6);
    if (p.fleece) {
      dabs(g, p.hideDark, 22, seed, 3);
      dabs(g, '#ffffff', 12, seed + 7, 2);      // curls catching the light
    }
    // A goat's coat is HANGING hair, not curls: vertical streaks rather than
    // the sheep's scattered dabs, so the two never read as the same animal
    // even at the distance a mountain puts between you.
    if (p.shaggy) {
      const r = dabber(seed + 41);
      g.fillStyle = p.hideDark;
      for (let i = 0; i < 14; i++) {
        g.fillRect(Math.floor(r() * PX), Math.floor(r() * PX * 0.5),
          1, 3 + Math.floor(r() * 6));
      }
    }
    if (extra) extra(g);
  });
}

function animalSpec(p, kind) {
  const head = {
    front: partTexture((g) => {
      fill(g, p.face ?? p.hide);
      if (p.patch) dabs(g, p.patch, 2, 91, 4);
      rects(g, p.eye, [3, 5, 2, 2, 11, 5, 2, 2]);
      if (kind === 'chicken') {
        rects(g, p.comb, [5, 0, 6, 2]);
        fill(g, p.muzzle, 6, 9, 4, 3);      // the beak block sits over this
      } else {
        fill(g, p.muzzle, 4, 9, 8, 6);
        rects(g, p.nostril, [5, 11, 2, 2, 9, 11, 2, 2]);
      }
    }),
    side: partTexture((g) => {
      fill(g, p.face ?? p.hide);
      if (p.patch) dabs(g, p.patch, 2, 13, 5);
      rects(g, p.eye, [3, 5, 2, 2]);
      if (kind !== 'chicken') fill(g, p.muzzle, 10, 9, 6, 6);
    }),
    back: hideTex(p, 27),
    top: partTexture((g) => {
      fill(g, p.face ?? p.hide);
      if (p.comb) rects(g, p.comb, [6, 2, 4, PX - 4]);
    }),
    bottom: partTexture((g) => fill(g, p.muzzle)),
  };
  const body = {
    top: hideTex(p, 3),
    side: hideTex(p, 11),
    // the front face of the body box is the chest: a fox or a wolf carries
    // its white bib there, everyone else keeps plain hide
    front: hideTex(p, 19, p.chest ? (g) => fill(g, p.chest, 3, 6, 10, 10) : null),
    back: hideTex(p, 23, (g) => fill(g, p.hideDark, 6, 0, 4, 4)),  // tail root
    bottom: partTexture((g) => {
      fill(g, p.belly);
      if (p.fleece) dabs(g, p.hideDark, 8, 5, 2);
    }),
  };
  const leg = {
    side: partTexture((g) => {
      fill(g, p.leg ?? p.hideDark);
      if (p.fleece) dabs(g, p.hide, 6, 31, 3);
      fill(g, p.hoof, 0, 11, PX, 5);
    }),
    top: partTexture((g) => fill(g, p.leg ?? p.hideDark)),
    bottom: partTexture((g) => fill(g, p.hoof)),
  };
  return { head, body, leg };
}

// One material set per kind, shared by every entity of that kind: 20-odd
// canvases per world instead of per villager.
const _mats = new Map();
function materialsFor(key) {
  // The cache key carries the wardrobe: without it the first world you load
  // dresses every world after it, because the coats are built once per job
  // name and a job name is the same everywhere.
  const ck = _wardrobe ? `${key}@${_wardrobe.robe}` : key;
  let m = _mats.get(ck);
  if (m) return m;
  m = {};
  // A key may carry a VARIANT after a hash — 'sheep#brown', 'sheep#shorn'.
  // The base palette is looked up under the plain kind and the variant is a
  // patch over its three hide colours, so a coloured sheep is one palette and
  // one drawing routine rather than a second species. Every set is still
  // cached under its full key, so ten fleeces cost ten sets and not ten per
  // animal.
  const hash = key.indexOf('#');
  const base = hash < 0 ? key : key.slice(0, hash);
  const variant = hash < 0 ? '' : key.slice(hash + 1);
  const raw = ANIMAL_PALETTE[base];
  const animal = raw && variant
    ? { ...raw, ...(variant === 'shorn' ? SHORN_PALETTE
      : FLEECE_PALETTE[variant] ?? {}) }
    : raw;
  if (animal) {
    _texCtx = {
      pal: animal, kind: base,
      fleece: !!animal.fleece && variant !== 'shorn',
      bird: base === 'chicken',
      bare: base === 'pig',
      fallback: base === 'pig' ? 'skin' : 'fur',
    };
    const spec = animalSpec(animal, base);
    _texCtx = null;
    // what the plain parts of this beast are: a hen's are feathers, a pig's
    // bare skin, everything else's a coat
    const bodyClass = base === 'chicken' ? 'feather' : base === 'pig' ? 'skin' : 'fur';
    for (const slot of Object.keys(spec)) m[slot] = partMaterials(spec[slot]);
    m.trim = solidMaterials(animal.hideDark, bodyClass);   // ears, tail
    if (animal.snout) m.snout = solidMaterials(animal.snout, 'skin');
    if (animal.horn) m.horn = solidMaterials(animal.horn, 'horn');
    if (animal.beak) m.beak = solidMaterials(animal.beak, 'horn');
    if (animal.comb) m.comb = solidMaterials(animal.comb, 'skin');
    if (animal.ear) m.ear = solidMaterials(animal.ear, bodyClass);
    if (animal.mane) m.mane = solidMaterials(animal.mane, 'hair');
    if (animal.beard) m.beard = solidMaterials(animal.beard, 'hair');
    if (animal.chest) m.chest = solidMaterials(animal.chest, bodyClass);
    if (animal.tailTip) m.tip = solidMaterials(animal.tailTip, bodyClass);
    // A bee's wings are the one thing in this file that is not opaque: a
    // solid white paddle at this size reads as a paper aeroplane. They also
    // beat far faster than the frame rate, so what you actually see is the
    // blur — which is what a translucent quad IS.
    // Six entries like every other set here, because BoxGeometry draws one
    // material group per face and a shorter array leaves five of them blank.
    if (base === 'bee') {
      const c = new THREE.Color(0xdfe8f2);
      m.wing = FACE_SHADES.map((s) => new THREE.MeshBasicMaterial({
        color: new THREE.Color(c.r * s, c.g * s, c.b * s),
        transparent: true, opacity: 0.45, depthWrite: false,
      }));
    }
    if (animal.snoutLong) {
      m.snoutLong = solidMaterials(animal.snoutLong, 'skin');
      m.nose = solidMaterials(animal.nostril, 'skin');
    }
    _mats.set(ck, m);
    return m;
  }
  // The golem is not a villager and has no PALETTE entry — its plating lives
  // in GOLEM_PALETTE, because none of villagerSpec's slots (skin, hair, robe)
  // mean anything on cast metal.
  if (key === 'golem') {
    _texCtx = { pal: GOLEM_PALETTE, kind: 'golem', fallback: 'metal' };
    const spec = golemSpec(GOLEM_PALETTE);
    _texCtx = null;
    for (const slot of Object.keys(spec)) m[slot] = partMaterials(spec[slot]);
    m.trim = solidMaterials(GOLEM_PALETTE.plateDark, 'metal');
    m.moss = solidMaterials(GOLEM_PALETTE.verdigris, 'patina');
    _mats.set(ck, m);
    return m;
  }

  // The undead wear what the grave left them, not what the living dress in:
  // a zombie in this world's saffron would read as a villager having a bad
  // day rather than as something that came up out of the ground.
  // ...and neither does a chief: he is dressed as a chief on every world, so
  // the crimson and the gold read the same in a Cinder camp as in a fen.
  // ...and neither does a priest: the habit is undyed everywhere, which is the
  // point of a habit.
  // ...and neither does a constable: the slate coat and the red sash are what
  // "this one holds the peace here" looks like, and a culture wardrobe laid
  // over it would make him one more man in local colours.
  const dressed = _wardrobe && base !== 'zombie' && base !== 'skeleton'
    && base !== 'chief' && base !== 'priest' && base !== 'constable';
  const p0 = dressed ? { ...PALETTE[base], ..._wardrobe } : PALETTE[base];
  // A woman is the SAME job palette with three things laid over it — see
  // WOMAN. Written as a patch and not as a second table of its own, so a
  // woman smith is a smith: same apron, same soot, same hammer.
  const p = variant === 'woman' ? { ...p0, ...WOMAN } : p0;
  _texCtx = {
    pal: p, kind: base,
    armoured: base === 'soldier' || base === 'constable' || base === 'guard',
  };
  const spec = base === 'zombie' ? zombieSpec(p)
    : base === 'skeleton' ? skeletonSpec(p) : villagerSpec(p);
  _texCtx = null;
  for (const slot of Object.keys(spec)) m[slot] = partMaterials(spec[slot]);
  if (p.hat) m.hatCrown = solidMaterials(p.hat, hatClass(p.hat, _armoured(base)));
  // The crown, as three solids: the band, the points, and the stone in the
  // front of it. Built as blocks rather than painted on the head, because a
  // crown has to break the silhouette — a gold stripe on a texture reads as a
  // headband at any distance at all.
  if (p.crown) {
    m.crown = solidMaterials(p.crown, 'metal');
    m.crownDark = solidMaterials(p.crownDark ?? p.crown, 'metal');
    m.gem = solidMaterials(p.gem ?? '#c8322e', 'gem');
  }
  // the fall of hair down a woman's back is a block of its own — see buildBody
  if (p.hair) m.hair = solidMaterials(p.hair, 'hair');
  if (base !== 'zombie' && base !== 'skeleton') {
    // The metal, the haft and the grip. Built for every trade and not only
    // for the garrison, because a farmhand handed an axe holds it in the same
    // slot a guard holds a sword — see TOOL_ARMS. Four materials shared by
    // every body of that job, so it costs one set per job and not one per
    // person.
    //
    // Brighter than any tunic on purpose: the whole point of steel on
    // somebody in homespun is that it catches the eye first.
    m.steel = solidMaterials('#d6dbe4', 'metal');
    m.haft = solidMaterials('#6b4a2a', 'wood');
    m.grip = solidMaterials('#3b322a', 'leather');
    m.cord = solidMaterials('#e7e1cc', 'cloth');
  }
  if (base === 'skeleton') {
    m.bow = solidMaterials(p.bow, 'wood');
    m.string = solidMaterials(p.string, 'cloth');
  } else if (base !== 'zombie') m.nose = solidMaterials(p.skin, 'skin');
  _mats.set(ck, m);
  return m;
}

// ---------------------------------------------------------------------------
// the mark a body leaves on the ground
//
// The mesher gives every BLOCK a contact shadow against its neighbours, and
// the moment it did, the people and the animals were the only things left in
// the world standing on the picture rather than on the ground. A villager
// with nothing under his feet reads as a sprite pasted over the street, and
// he reads that way most on a paved one, where there is no grass to hide the
// join.
//
// This is not a cast shadow and it is not trying to be: there is no light in
// this game to cast one from — no lamp, no sun object, no shadow map, only
// baked vertex colour. It is the soft dark patch a body puts under itself,
// which is the part of a shadow the eye actually uses to place a thing on a
// surface. One texture and one material for the whole world, one small quad
// each, no depth write and no per-frame work: it hangs off the body group, so
// it goes where the body goes and the walk cycle bobbing — which lives on the
// rig INSIDE that group — leaves it alone. A shadow that bounced with the
// footsteps would be a thing the creature was carrying.
const SHADOW = {
  opacity: 0.34,
  lift: 0.03,        // clear of the ground face, or the two fight over depth
  // Roughly the footprint, not the height: what casts the patch is the belly
  // and the feet. A default for anything not named, so a new creature gets a
  // shadow without anybody having to remember this table.
  r: { chicken: 0.20, cat: 0.22, dog: 0.26, fox: 0.26, wolf: 0.30,
    goat: 0.32, sheep: 0.36, pig: 0.36, cow: 0.44, horse: 0.48, bear: 0.46 },
  person: 0.30,
};
let _shadowGeo = null, _shadowMat = null;

// A soft round patch, drawn once into a small canvas. A hard-edged disc is
// the cheaper thing and it looks like a hole in the floor: the whole reason a
// contact shadow works is that it is darkest under the body and gone by the
// edge, which is a gradient and cannot be faked with a flat circle.
function shadowMaterial() {
  if (_shadowMat) return _shadowMat;
  const N = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  const rad = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  rad.addColorStop(0, 'rgba(0,0,0,1)');
  rad.addColorStop(0.55, 'rgba(0,0,0,0.72)');
  rad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rad;
  g.fillRect(0, 0, N, N);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  _shadowMat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity: SHADOW.opacity,
    // It must not write depth or it hides the ground it is lying on, and it
    // must not be lit by the vertex colours every other material here reads.
    depthWrite: false, color: 0x000000, vertexColors: false,
  });
  return _shadowMat;
}

// One patch, lying in the body's own XZ plane at its feet. The plane is built
// in XY, so it is turned a quarter onto its back once and never again.
function makeShadow(kind, job) {
  if (!_shadowGeo) {
    _shadowGeo = new THREE.PlaneGeometry(1, 1);
    _shadowGeo.rotateX(-Math.PI / 2);
  }
  const r = SHADOW.r[kind] ?? SHADOW.person;
  const m = new THREE.Mesh(_shadowGeo, shadowMaterial());
  m.scale.set(r * 2, 1, r * 2);
  m.position.y = SHADOW.lift;
  m.renderOrder = 1;          // after the ground it is lying on
  return m;
}

// ---------------------------------------------------------------------------
// bodies

export const JOBS = ['farmer', 'smith', 'librarian'];
// ...and the two that are never rolled into a village's ordinary staff,
// because each is placed against something the generator built: a guard on a
// gate, a shopkeeper behind a counter.
export const POSTED_JOBS = ['soldier', 'trader', 'priest'];

// Silhouette is what tells a cow from a sheep at range, so the proportions
// matter more than the pixels: leg length, body length, head size.
// `health` and `speed` live here too, one table per species.
const ANIMAL_BODY = {
  pig: { legH: 0.34, legW: 0.16, bw: 0.48, bh: 0.44, bd: 0.80,
    hw: 0.36, hh: 0.34, hd: 0.34, speed: 1.05, health: 10 },
  cow: { legH: 0.54, legW: 0.20, bw: 0.62, bh: 0.54, bd: 1.06,
    hw: 0.40, hh: 0.40, hd: 0.44, speed: 0.85, health: 16 },
  sheep: { legH: 0.42, legW: 0.16, bw: 0.54, bh: 0.52, bd: 0.86,
    hw: 0.32, hh: 0.34, hd: 0.36, speed: 1.0, health: 12 },
  // The head shrank when the body earned a real neck: a head as wide as the
  // old one now reads as a parrot. Footprint unchanged — it still fits the
  // pens and the fence gaps it always did.
  chicken: { legH: 0.26, legW: 0.07, bw: 0.30, bh: 0.32, bd: 0.38,
    hw: 0.17, hh: 0.18, hd: 0.18, speed: 1.15, health: 6 },
  // Long in the body, short in the leg and quick: the one animal here that
  // moves faster than the player walks, which is what makes a street full of
  // them feel busy rather than decorative.
  dog: { legH: 0.30, legW: 0.10, bw: 0.30, bh: 0.32, bd: 0.62,
    hw: 0.26, hh: 0.24, hd: 0.30, speed: 2.1, health: 8,
    // "dogs do not like foxes." `hunts` is read by huntPrey: a dog that can
    // see one goes for it, and the fox bolts through the same flee state a
    // hit puts it in. `damage` is what a bite costs, and only ever lands on
    // prey or on something that struck this dog's owner — a wild dog on a
    // village green has never bitten anyone and still does not.
    hunts: 'fox', damage: 2, tameWith: 'BONE' },
  // Half again a cow in every direction, and slow. A first pass matched a
  // cow's shoulder height and came out reading as a sheep — the length alone
  // does not say "big", the height off the ground does. Nothing else on the
  // ice is this size, which is the whole of what makes the poles feel
  // inhabited rather than empty.
  bear: { legH: 0.58, legW: 0.26, bw: 0.86, bh: 0.80, bd: 1.55,
    hw: 0.52, hh: 0.46, hd: 0.58, speed: 0.9, health: 30 },
  // Low, long and quick, with a tail that carries half the silhouette.
  // `skittish` is read by thinkAnimal: it bolts from the PLAYER, unhit.
  fox: { legH: 0.30, legW: 0.09, bw: 0.28, bh: 0.30, bd: 0.58,
    hw: 0.24, hh: 0.22, hd: 0.28, speed: 1.9, health: 8, skittish: true },
  // A dog scaled up to mean it. `fights` is read by thinkAnimal and
  // damage(): hit one, or cross one at night, and it comes for you with
  // `damage` a swing through the same hitPlayer path zombies use.
  // A dog scaled up to mean it, and it takes the same bribe — a bone. Taming
  // one is a real decision rather than a free upgrade: a wolf `fights`, so it
  // has to be worn down or caught in the right mood before it will take
  // anything from your hand at all, and what you get is an animal that hits
  // half again as hard as a dog and does not hunt foxes for you.
  wolf: { legH: 0.46, legW: 0.14, bw: 0.42, bh: 0.44, bd: 0.92,
    hw: 0.32, hh: 0.30, hd: 0.42, speed: 1.8, health: 20,
    fights: true, damage: 3, tameWith: 'BONE' },
  // Taller at the shoulder than a cow by a head, and most of the extra is
  // leg — the height off the ground is what says "horse" at range, the neck
  // and mane say it up close.
  horse: { legH: 0.80, legW: 0.15, bw: 0.58, bh: 0.62, bd: 1.32,
    hw: 0.30, hh: 0.34, hd: 0.52, speed: 1.7, health: 26,
    // The one animal here you can get on the back of. Read by main.js's
    // mount check, so that a cow with a similar silhouette is never a
    // near-miss: the flag says it, not the body size.
    // ...and how fast it goes with someone on it. The player walks at 6 and
    // SPRINTS at 8.5, so a ridden horse has to clear 8.5 by a real margin or
    // the answer to "is this faster than running?" is "barely", which is no
    // reason to ever get on one. 12 is half again a sprint.
    rides: true, rideSpeed: 12 },
  // The camel. Taller at the shoulder than a horse and longer in the leg
  // again — a camel's whole shape is height and a hump, and the height is
  // what you see first across open sand. Slower than a horse under saddle,
  // which is the trade: it is the animal that is already where you need one.
  camel: { legH: 0.96, legW: 0.14, bw: 0.50, bh: 0.50, bd: 1.24,
    hw: 0.25, hh: 0.28, hd: 0.44, speed: 1.15, health: 24,
    // A camel's seat is in FRONT of the hump, not behind the withers where a
    // horse's is — which is what the negative sign says. Without it a rider
    // is put down inside the hump, since that is exactly where saddlePoint's
    // default lands on a body this shape.
    rides: true, rideSpeed: 10.5, saddleBack: -0.22 },
  // Smaller than the dog in every direction and shorter in the leg, which is
  // what makes it read as a cat rather than as a puppy: a cat's body is long
  // and LOW, and the head is big for the body. Quick in bursts.
  // The head is WIDER than the body on purpose. On a real cat it very nearly
  // is, and at this scale it is the only thing that stops the head reading as
  // the front end of the body: a first pass matched the two at 0.22 and the
  // animal came out as a furry brick with legs.
  cat: { legH: 0.22, legW: 0.07, bw: 0.22, bh: 0.24, bd: 0.46,
    hw: 0.26, hh: 0.23, hd: 0.24, speed: 1.75, health: 8,
    skittish: true, tameWith: 'MEAT_RAW' },
  // The bee. `flies` takes it out of the ground settle entirely — see
  // update() — and `hover` is how far above the ground it holds station.
  // It is small enough that the body box is most of what you see.
  bee: { legH: 0.03, legW: 0.03, bw: 0.14, bh: 0.14, bd: 0.22,
    hw: 0.11, hh: 0.11, hd: 0.10, speed: 2.6, health: 2,
    flies: true, hover: 1.5, damage: 1 },
  // The mountain goat. Sheep-sized in the body but longer and straighter in
  // the leg, because everything it stands on is at an angle. `climb` is the
  // one number that matters: every other creature here refuses a step over
  // STEP_UP (1.15) and so cannot leave a valley floor by the short way. A
  // goat takes a step nearly twice that, which is the difference between an
  // animal that lives on a mountain and one that lives at the bottom of it.
  goat: { legH: 0.50, legW: 0.13, bw: 0.44, bh: 0.46, bd: 0.86,
    hw: 0.28, hh: 0.30, hd: 0.34, speed: 1.15, health: 12, climb: 2.1 },
  // The hive is furniture with hit points. No legs, no gait, no brain worth
  // the name — it sits where it was put and the bees come home to it.
  hive: { legH: 0.02, legW: 0.02, bw: 0.62, bh: 0.66, bd: 0.62,
    hw: 0.2, hh: 0.2, hd: 0.2, speed: 0, health: 20, still: true },
};

// --- fleece -------------------------------------------------------------------
//
// A sheep is not one colour. Four of these are what a real flock comes in and
// what a sheep is BORN in — white, brown, grey, black — and the other six only
// happen because somebody put a dye to a live animal.
//
// Each entry is the three hide colours animalSpec reads, so a coloured sheep
// is the same drawing routine with a different palette rather than a second
// species. The naturals are deliberately muted: a sheep is a dirty off-colour
// even when it is "white", and a fully saturated fleece has to look dyed or
// the distinction between found and made stops meaning anything.
export const FLEECE_PALETTE = {
  white: { hide: '#efe9dc', hideDark: '#cfc7b5', belly: '#e4dccb' },
  brown: { hide: '#8d6a4a', hideDark: '#6b4e35', belly: '#7d5d40' },
  grey: { hide: '#9a9ba1', hideDark: '#75767c', belly: '#8b8c92' },
  black: { hide: '#3f3f45', hideDark: '#2a2a30', belly: '#37373d' },
  red: { hide: '#b8483c', hideDark: '#8e332a', belly: '#a83f34' },
  orange: { hide: '#cd8437', hideDark: '#a16424', belly: '#bd772e' },
  yellow: { hide: '#d3c246', hideDark: '#a89832', belly: '#c5b33d' },
  green: { hide: '#5b9741', hideDark: '#437030', belly: '#51873a' },
  blue: { hide: '#4a72bd', hideDark: '#355593', belly: '#4265ab' },
  purple: { hide: '#8b53b0', hideDark: '#693c88', belly: '#7d49a0' },
};
// ...and the animal underneath it. A shorn sheep is pink skin with a stubble
// of whatever it was, which is what makes shearing read as something done to
// an animal rather than as a number going up in a bag.
export const SHORN_PALETTE = {
  hide: '#e0bcae', hideDark: '#c39b8d', belly: '#ecd0c4',
};

export const isAnimalKind = (kind) => ANIMAL_BODY[kind] !== undefined;

// ---------------------------------------------------------------------------
// CREATURES MADE IN KHERVECAD
//
// Anything modelled in KherveCAD can be sent here as a creature: a JSON file
// in creatures/ (see js/creatures.js for the format) holding coloured
// triangle parts — body, head, the four legs, a tail, wings — each with the
// joint it turns about. They are registered into ANIMAL_BODY like any other
// species, so they walk, graze, bolt, sit and get tamed through exactly the
// code a cow does; only the body is built differently. Parts the model does
// not have become empty joints, so every pose line still has something to
// write to and a legless statue simply bobs along.
const CUSTOM_CREATURES = new Map();

// WHAT A CREATURE IS. KherveCAD sends a shape, not a temperament, so the game
// reads one off what it was sent. A `nature` in the file wins — 'animal',
// 'person' or 'monster'. Failing that, a name with a monster in it is a
// monster (a troll, a dragon, a zombie, "Monster"), and something that stands
// UPRIGHT on two legs — taller in the body than it is long — is a person.
// Everything else is an animal, which is what every creature used to be:
// a man you had modelled came in grazing.
const MONSTER_WORD = /\b(monsters?|zombies?|trolls?|ogres?|orcs?|goblins?|dragons?|demons?|devils?|ghouls?|ghosts?|skeletons?|golems?|giants?|beasts?|werewol(f|ves)|vampires?|aliens?|mutants?|fiends?|spiders?|kraken|hydras?|cyclops|minotaurs?|yetis?|wraiths?|lich|imps?|gargoyles?|behemoths?|titans?|creepers?|abominations?|horrors?)\b/i;
const NATURES = new Set(['animal', 'person', 'monster']);
function natureOf(def, biped, body) {
  const said = String(def.nature ?? '').toLowerCase();
  if (NATURES.has(said)) return said;
  const name = `${def.label ?? ''} ${String(def.kind ?? '').replace(/^kc_/, '').replace(/_/g, ' ')}`;
  if (MONSTER_WORD.test(name)) return 'monster';
  if (biped && body[1] >= body[2] && (def.height ?? 1) >= 0.9) return 'person';
  return 'animal';
}

// THE LEGS, WHATEVER THEY WERE CALLED. KherveCAD names a leg's joint off the
// words in the part's name — front/back, left/right — and a leg called "Left
// leg", with a side and no end, came out as `legLL`, which is no joint at all:
// the leg was welded to the body and a person you sent walked on stilts. So
// every leg part is looked at again here. Two legs are a biped's pair, the
// front pair by KherveCAD's own convention, sided by where they stand (-x is
// the creature's left, the front being -z); more are dealt out by quadrant;
// a leg with no free joint left rides along with the body.
const LEG_ROLES = ['legFL', 'legFR', 'legBL', 'legBR'];
// A leg sent from KherveCAD may come in two: the leg (thigh) and its SHIN,
// hung on a knee inside the leg's joint (`kneeFL`..) — poseKnees bends it.
const SHIN_ROLES = ['shinFL', 'shinFR', 'shinBL', 'shinBR'];

// Where a part's own triangles are, in the creature's frame: its box.
function partBox(q) {
  const P = q.positions, pv = q.pivot ?? [0, 0, 0];
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < P.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const c = P[i + k] + pv[k];
      if (c < lo[k]) lo[k] = c;
      if (c > hi[k]) hi[k] = c;
    }
  }
  return { lo, hi, mid: [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2) };
}

// Two parts into one, about a new joint at the top of the pair.
function mergeLegs(a, b) {
  const A = partBox(a), Bx = partBox(b);
  const pv = [(A.mid[0] + Bx.mid[0]) / 2, Math.max(A.hi[1], Bx.hi[1]),
    (A.mid[2] + Bx.mid[2]) / 2];
  const pos = [];
  for (const q of [a, b]) {
    const o = q.pivot ?? [0, 0, 0];
    for (let i = 0; i + 2 < q.positions.length; i += 3) {
      pos.push(q.positions[i] + o[0] - pv[0], q.positions[i + 1] + o[1] - pv[1],
        q.positions[i + 2] + o[2] - pv[2]);
    }
  }
  a.positions = pos;
  a.colors = [...(a.colors ?? []), ...(b.colors ?? [])];
  a.pivot = pv;
  const m = partBox(a);
  a.size = [0, 1, 2].map((k) => m.hi[k] - m.lo[k]);
  b.role = 'merged';
  b.positions = [];
}

function fixLegRoles(parts) {
  fixLegRolesOnly(parts);
  fixShinRoles(parts);
}

// SHINS follow their legs. fixLegRoles may rename a leg (a biped's pair
// becomes FL / FR, half legs merge), so each shin is given to the leg it
// hangs under — the nearest leg pivot across the ground — and two shins
// that land on one merged leg are merged too.
function fixShinRoles(parts) {
  const shins = parts.filter((q) => typeof q.role === 'string' && q.role.startsWith('shin'));
  if (!shins.length) return;
  const legs = parts.filter((q) => LEG_ROLES.includes(q.role));
  const mine = new Map();
  for (const s of shins) {
    const sp = s.pivot ?? [0, 0, 0];
    let best = null, bd = Infinity;
    for (const l of legs) {
      const lp = l.pivot ?? [0, 0, 0];
      const d = Math.hypot(lp[0] - sp[0], lp[2] - sp[2]);
      if (d < bd) { bd = d; best = l; }
    }
    const role = best ? `shin${best.role.slice(3)}` : s.role;
    if (mine.has(role)) {
      mergeLegs(mine.get(role), s);
      continue;
    }
    s.role = SHIN_ROLES.includes(role) ? role : 'extra';
    mine.set(role, s);
  }
}

function fixLegRolesOnly(parts) {
  let legs = parts.filter((q) => typeof q.role === 'string' && q.role.startsWith('leg'));
  if (!legs.length) return;
  // HALF LEGS. KherveCAD finds the legs of a model nobody named by cutting
  // what is low down into four by quadrant round the middle — right for a
  // horse, and for a man it cuts each LEG in two, front and back, and the
  // man trotted on four half-legs. Two "legs" on the same side standing a
  // hand's breadth apart under an upright body are one leg: put it back.
  const body = parts.find((q) => q.role === 'body');
  const upright = body?.size ? body.size[1] >= body.size[2] : false;
  if (upright && legs.length === 4) {
    const byRole = Object.fromEntries(legs.map((q) => [q.role, q]));
    const pairs = [['legFL', 'legBL'], ['legFR', 'legBR']];
    if (pairs.every(([f, k]) => byRole[f] && byRole[k])) {
      const near = pairs.every(([f, k]) => {
        const F = partBox(byRole[f]), K = partBox(byRole[k]);
        return Math.abs(F.mid[2] - K.mid[2]) < 0.25 && Math.abs(F.mid[0] - K.mid[0]) < 0.2;
      });
      if (near) {
        for (const [f, k] of pairs) mergeLegs(byRole[f], byRole[k]);
        legs = legs.filter((q) => q.role !== 'merged');
      }
    }
  }
  const x = (q) => q.pivot?.[0] ?? 0, z = (q) => q.pivot?.[2] ?? 0;
  if (legs.length <= 2) {
    const [a, b] = legs.length === 2 && x(legs[0]) > x(legs[1])
      ? [legs[1], legs[0]] : legs;
    if (a) a.role = legs.length === 2 || x(a) <= 0 ? 'legFL' : 'legFR';
    if (b) b.role = 'legFR';
    return;
  }
  const taken = new Set();
  for (const q of legs) {
    let r = LEG_ROLES.includes(q.role) && !taken.has(q.role) ? q.role
      : `leg${z(q) <= 0 ? 'F' : 'B'}${x(q) <= 0 ? 'L' : 'R'}`;
    if (taken.has(r)) r = LEG_ROLES.find((k) => !taken.has(k)) ?? 'extra';
    q.role = r;
    if (r !== 'extra') taken.add(r);
  }
}

export function registerCustomCreature(def) {
  const kind = def.kind;
  if (!kind || !Array.isArray(def.parts)) return false;
  fixLegRoles(def.parts);
  const size = (role) => {
    const p = def.parts.find((q) => q.role === role);
    return p && p.size ? p.size : null;
  };
  const body = size('body') ?? [0.6, 0.5, 0.9];
  const head = size('head') ?? [0.3, 0.3, 0.3];
  const leg = size('legFL') ?? size('legFR') ?? null;
  const legs = def.parts.filter((q) => LEG_ROLES.includes(q.role));
  const biped = legs.length === 2;
  const nature = natureOf(def, biped, body);
  const tall = Math.max(0.3, def.height ?? body[1]);
  ANIMAL_BODY[kind] = {
    legH: leg ? leg[1] : Math.max(0.05, tall * 0.05),
    legW: leg ? Math.max(leg[0], leg[2]) : 0.1,
    bw: body[0], bh: body[1], bd: body[2],
    hw: head[0], hh: head[1], hd: head[2],
    speed: def.speed ?? 1.0, health: def.health ?? 10,
    custom: true, wild: def.wild !== false,
    biped, nature,
    person: nature === 'person',
    // A monster is a fighter from the start — combat.js wires the blow onto
    // anything with `fights` — and it hits as hard as it is big.
    monster: nature === 'monster',
    fights: nature === 'monster',
    damage: nature === 'monster'
      ? (def.damage ?? Math.round(Math.min(8, Math.max(2, 1 + tall * 1.3)))) : undefined,
    reach: Math.min(4, Math.max(1.4, 0.9 + tall * 0.35)),
  };
  def.nature = nature;
  CUSTOM_CREATURES.set(kind, def);
  return true;
}

export const customCreatureKinds = () => [...CUSTOM_CREATURES.keys()];
export const customCreature = (kind) => CUSTOM_CREATURES.get(kind) ?? null;

// A creature on a stand, for the Creatures book (creatures.html): the body
// this file builds for it and the pose code the herd is posed with, with no
// planet under it — so what the book shows walking is what walks in the
// world, and not a second drawing of it. `pose(t, dt, gait)` moves it on:
// 'stand', 'walk', 'run' or 'strike'.
export function creatureModel(kind) {
  if (!ANIMAL_BODY[kind]) return null;
  const parts = buildBody(kind, null);
  const stand = {
    kind, parts, rig: parts.rig, phase: 0, state: 'wander', flee: 0,
    speedMul: 1, swingT: 0, still: !!ANIMAL_BODY[kind].still,
    radialVel: 0, angry: 0, target: null,
  };
  const pose = Entity.prototype.poseAnimal;
  return {
    group: parts.group,
    parts,
    pose(t, dt, gait = 'walk') {
      const moving = gait === 'walk' || gait === 'run';
      stand.speedMul = gait === 'run' ? 1.7 : 1;
      stand.flee = gait === 'run' ? 1 : 0;
      // the phase runs off the ground covered, as it does in the world
      if (moving) stand.phase += (ANIMAL_BODY[kind].speed ?? 1) * stand.speedMul * dt * 5.0;
      stand.swingT = gait === 'strike' ? SWING_TIME * (1 - ((t * 1.4) % 1)) : 0;
      pose.call(stand, t, moving);
      Entity.prototype.poseKnees.call(stand, dt);
    },
  };
}

// A part's triangles into one vertex-coloured geometry, shaded per face the
// way tintBox shades a box: tops full, sides at the box's side shades, bottoms
// darkest — so a KherveCAD model sits in the same light as the herd round it.
function customPartGeometry(part) {
  const pos = new Float32Array(part.positions);
  const n = pos.length / 3;
  const col = new Float32Array(n * 3);
  const src = part.colors;
  for (let t = 0; t + 2 < n; t += 3) {
    const a = t * 3, b = a + 3, c = a + 6;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    const y = ny / len, x = Math.abs(nx / len), z = Math.abs(nz / len);
    const shade = y > 0 ? 0.82 + 0.18 * y : 0.82 + 0.27 * y;
    const sh = shade * (x > z ? 1.0 : 0.93);
    for (let k = 0; k < 3; k++) {
      const i = (t + k) * 3;
      col[i] = (src[i] ?? 0.8) * sh;
      col[i + 1] = (src[i + 1] ?? 0.8) * sh;
      col[i + 2] = (src[i + 2] ?? 0.8) * sh;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

function buildCustomCreature(kind, parts) {
  const def = CUSTOM_CREATURES.get(kind);
  const shins = [];
  const joint = (name, parent, pivot) => {
    const g = new THREE.Group();
    g.name = name;
    if (pivot) g.position.set(pivot[0], pivot[1], pivot[2]);
    parent.add(g);
    return g;
  };
  // the joints every pose writes to, whether or not the model has the part
  parts.neck = joint('neck', parts.rig, null);
  for (const leg of ['legFL', 'legFR', 'legBL', 'legBR']) {
    parts[leg] = joint(leg, parts.rig, null);
  }
  for (const part of def.parts) {
    if (!part.positions || part.positions.length < 9) continue;
    const mesh = new THREE.Mesh(customPartGeometry(part), CUSTOM_MAT);
    const role = part.role;
    if (role === 'body') {
      mesh.position.set(...(part.pivot ?? [0, 0, 0]));
      parts.rig.add(mesh);
      parts.body = parts.body ?? mesh;
    } else if (role === 'head') {
      parts.neck.position.set(...part.pivot);
      parts.neck.add(mesh);
      parts.head = mesh;
    } else if (parts[role] && role.startsWith('leg')) {
      parts[role].position.set(...part.pivot);
      parts[role].add(mesh);
    } else if (role === 'tail' || role === 'wingL' || role === 'wingR') {
      const g = joint(role, parts.rig, part.pivot);
      g.add(mesh);
      parts[role] = g;
    } else if (SHIN_ROLES.includes(role)) {
      shins.push([part, mesh]);          // once every leg has its pivot
    } else {
      mesh.position.set(...(part.pivot ?? [0, 0, 0]));
      parts.rig.add(mesh);
    }
  }
  // the KNEES: each shin hangs on a joint inside its leg's joint, at the
  // shin's top, so the leg's swing carries it and poseKnees bends it
  for (const [part, mesh] of shins) {
    const end = part.role.slice(4);
    const leg = parts[`leg${end}`];
    const lp = leg.position;
    const pv = part.pivot ?? [0, 0, 0];
    const knee = joint(`knee${end}`, leg, [pv[0] - lp.x, pv[1] - lp.y, pv[2] - lp.z]);
    knee.add(mesh);
    parts[`knee${end}`] = knee;
  }
  if (!parts.head) parts.head = parts.body ?? parts.neck;
  return parts;
}

// Four legs, a neck joint so the head can go down into the grass, and the
// species' one distinguishing lump (snout, horns, comb). Local -Z is the
// FRONT — see partMaterials — so everything at the head end has a negative z.
function buildAnimal(kind, mats, parts, box) {
  const D = ANIMAL_BODY[kind];
  const bodyY = D.legH + D.bh / 2;
  const lx = (D.bw - D.legW) / 2;
  const lz = D.bd * 0.32;

  // The hive: three courses of comb, each a little narrower than the one
  // under it, and a dark mouth on the front for the bees to come and go by.
  // It has no head, no neck and no legs — every pose branch below would be
  // writing to parts that do not exist, so it returns before any of them.
  if (kind === 'hive') {
    const tiers = [1.0, 0.86, 0.62];
    let y = 0.05;
    for (let i = 0; i < tiers.length; i++) {
      const s = tiers[i];
      const h = D.bh / tiers.length;
      box(D.bw * s, h, D.bd * s, mats.body, 0, y + h / 2, 0);
      y += h * 0.92;                    // overlapped, so the seams read
    }
    parts.body = box(D.bw * 0.30, 0.12, 0.06, mats.head,
      0, D.bh * 0.30, -D.bd / 2 - 0.02);          // the entrance
    return parts;
  }

  parts.body = box(D.bw, D.bh, D.bd, mats.body, 0, bodyY, 0);

  const neck = new THREE.Group();
  neck.position.set(0, bodyY + D.bh * 0.30, -D.bd / 2 + 0.04);
  parts.rig.add(neck);
  parts.neck = neck;
  parts.head = box(D.hw, D.hh, D.hd, mats.head,
    0, -D.hh * 0.12, -D.hd * 0.42, false, neck);

  // The bee. Banded abdomen, a fuzzy black head with the one pair of
  // antennae that says "insect" from any angle, two wings that beat far too
  // fast to see, and a sting on the tail end. `wingL`/`wingR` go on parts
  // under those names on purpose: the chicken's flutter code already drives
  // that pair, and poseAnimal reuses it.
  if (kind === 'bee') {
    neck.position.set(0, bodyY, -D.bd / 2 + 0.02);
    parts.head.position.set(0, 0, -D.hd * 0.4);
    box(0.015, 0.09, 0.015, mats.trim, -0.035, D.hh / 2 + 0.045, -0.02,
      false, parts.head);
    box(0.015, 0.09, 0.015, mats.trim, 0.035, D.hh / 2 + 0.045, -0.02,
      false, parts.head);
    // pivotTop, so the wings hinge at the back rather than flap about their
    // own middles — the same trick the chicken's shoulders use
    parts.wingL = box(0.02, 0.02, 0.20, mats.wing,
      -(D.bw / 2 - 0.01), bodyY + D.bh / 2 + 0.01, -0.02, true);
    parts.wingR = box(0.02, 0.02, 0.20, mats.wing,
      D.bw / 2 - 0.01, bodyY + D.bh / 2 + 0.01, -0.02, true);
    box(0.02, 0.02, 0.07, mats.trim, 0, bodyY, D.bd / 2 + 0.03);   // the sting
    // Stub legs. Nothing walks on them — a bee never touches the ground —
    // but the legs array the stagger scrambles is built by name, and an
    // empty one means a hit reads as nothing at all happening.
    parts.legFL = box(D.legW, 0.06, D.legW, mats.trim, -lx, D.legH, -lz, true);
    parts.legFR = box(D.legW, 0.06, D.legW, mats.trim, lx, D.legH, -lz, true);
    parts.legBL = box(D.legW, 0.06, D.legW, mats.trim, -lx, D.legH, lz, true);
    parts.legBR = box(D.legW, 0.06, D.legW, mats.trim, lx, D.legH, lz, true);
    return parts;
  }

  if (kind === 'chicken') {
    // The proper bird: white body, a real neck column, a SMALL head carrying
    // the red comb above and the red wattle below the yellow beak, yellow
    // legs with toes-forward feet, wings folded flat on the flanks until
    // they beat, and a tail fan kicked up at the back.
    neck.position.set(0, D.legH + D.bh * 0.92, -D.bd * 0.28);
    // the neck column is part of the neck group, so it pecks with the head
    box(0.12, 0.20, 0.12, mats.body, 0, -0.05, 0, false, neck);
    parts.head.position.set(0, 0.11, -0.01);
    box(0.05, 0.09, 0.12, mats.comb, 0, D.hh / 2 + 0.04, -0.01, false, parts.head);
    box(0.08, 0.05, 0.10, mats.beak, 0, -0.03, -D.hd / 2 - 0.04, false, parts.head);
    box(0.05, 0.08, 0.05, mats.comb, 0, -D.hh / 2 - 0.03, -D.hd / 2 + 0.01,
      false, parts.head);                              // the wattle
    parts.legFL = box(D.legW, D.legH, D.legW, mats.leg, -0.08, D.legH, 0.03, true);
    parts.legFR = box(D.legW, D.legH, D.legW, mats.leg, 0.08, D.legH, 0.03, true);
    // feet: children of the legs so they swing with the stride
    box(0.11, 0.03, 0.12, mats.leg, 0, -D.legH + 0.015, -0.045, false, parts.legFL);
    box(0.11, 0.03, 0.12, mats.leg, 0, -D.legH + 0.015, -0.045, false, parts.legFR);
    // pivotTop so the wings hinge at the shoulder rather than pinwheel about
    // their own middle
    const sy = D.legH + D.bh * 0.90;
    parts.wingL = box(0.045, 0.24, 0.32, mats.body, -(D.bw / 2 + 0.024), sy, 0.02, true);
    parts.wingR = box(0.045, 0.24, 0.32, mats.body, D.bw / 2 + 0.024, sy, 0.02, true);
    const tail = box(0.16, 0.09, 0.16, mats.body, 0, D.legH + D.bh * 0.94,
      D.bd / 2 + 0.01);
    tail.rotation.x = -0.55;                           // fan kicked upward
    return parts;
  }

  parts.legFL = box(D.legW, D.legH, D.legW, mats.leg, -lx, D.legH, -lz, true);
  parts.legFR = box(D.legW, D.legH, D.legW, mats.leg, lx, D.legH, -lz, true);
  parts.legBL = box(D.legW, D.legH, D.legW, mats.leg, -lx, D.legH, lz, true);
  parts.legBR = box(D.legW, D.legH, D.legW, mats.leg, lx, D.legH, lz, true);

  const upright = kind === 'fox' || kind === 'wolf' || kind === 'horse'
    || kind === 'cat' || kind === 'camel';
  if (kind === 'horse') {
    // The neck is the horse: a real slanted column from the shoulders with a
    // mane ridge down the back of it, and a LONG head hung off the top. All
    // of it lives in the neck group, so the grazing dip still works.
    neck.position.set(0, bodyY + D.bh * 0.28, -D.bd / 2 + 0.12);
    const col = box(0.20, 0.52, 0.26, mats.body, 0, 0.17, -0.11, false, neck);
    col.rotation.x = -0.5;
    const mane = box(0.06, 0.50, 0.10, mats.mane, 0, 0.22, 0.03, false, neck);
    mane.rotation.x = -0.5;
    parts.head.position.set(0, 0.44, -0.32);
    parts.head.rotation.x = -0.35;                     // nose dipped
    // muzzle band at the nose end, and a forelock tuft between the ears
    box(0.22, 0.20, 0.10, mats.trim, 0, -0.06, -D.hd / 2 - 0.04, false, parts.head);
    box(0.10, 0.05, 0.16, mats.mane, 0, D.hh / 2 + 0.02, 0.06, false, parts.head);
  }

  if (kind === 'camel') {
    // A camel is a hump, a lot of leg, and a head carried high on an upright
    // neck. Those three are the whole silhouette, and the silhouette is what
    // matters most here — open sand is where you first see one from a very
    // long way off.
    //
    // THE HUMP. Two courses, the upper narrower than the lower, which is the
    // same stepped dome the hive is built from and the cheapest way to get a
    // curve out of boxes. A first pass used one flat slab and it read as a
    // saddle blanket rather than as a hump: it is the HEIGHT that does the
    // work, not the footprint. It is also its own darker material, so the
    // animal has an outline against a bright sky instead of a bulge in the
    // same tan as the rest of it.
    //
    // It sits well back on the barrel, which leaves the dip in front of it
    // for a rider — see `saddleBack` in ANIMAL_BODY and saddlePoint().
    const humpY = bodyY + D.bh / 2;
    box(D.bw * 0.82, 0.24, D.bd * 0.44, mats.mane, 0, humpY + 0.10, 0.24);
    box(D.bw * 0.58, 0.22, D.bd * 0.30, mats.mane, 0, humpY + 0.30, 0.24);
    // THE NECK. Nearly upright, with only enough forward rake to keep it off
    // the vertical: a camel holds its head ABOVE its back, and the horse's
    // long forward-raked neck — which is what this started as — read as a
    // horse with a lump on it. Everything is inside the neck group, so the
    // whole column still swings down when the animal puts its mouth to the
    // ground.
    neck.position.set(0, bodyY + D.bh * 0.36, -D.bd / 2 + 0.06);
    const col = box(0.19, 0.74, 0.22, mats.body, 0, 0.33, -0.05, false, neck);
    col.rotation.x = -0.20;
    const crest = box(0.07, 0.70, 0.09, mats.mane, 0, 0.36, 0.07, false, neck);
    crest.rotation.x = -0.20;
    // ...and the tuft of hair that hangs off the throat, low down the front
    box(0.10, 0.18, 0.07, mats.mane, 0, 0.22, -0.16, true, neck);
    parts.head.position.set(0, 0.76, -0.20);
    parts.head.rotation.x = -0.12;                    // nose barely dipped
    // the long soft muzzle, and the lip on the end of it
    box(0.19, 0.16, 0.15, mats.snoutLong, 0, -0.07, -D.hd / 2 - 0.05,
      false, parts.head);
  }

  // ears sit on the head so they follow it down into the grass — pricked on
  // top for the hunters and the horse, out to the sides for the livestock
  const em = mats.ear ?? mats.trim;
  if (upright) {
    // A cat's ears are the other half of its head — big, wide apart and set
    // right on the corners of the skull. The horse's discreet little tabs,
    // which is what every `upright` kind used to get, vanished entirely at
    // cat scale and left a round-headed rodent.
    // A camel's ears are the smallest thing on it — barely two tabs on a
    // head that is already small for the body, which is half of why the neck
    // reads as long.
    const ew = kind === 'horse' ? 0.055 : kind === 'cat' ? 0.10
      : kind === 'camel' ? 0.05 : 0.07;
    const eh = kind === 'horse' ? 0.11 : kind === 'cat' ? 0.13
      : kind === 'camel' ? 0.07 : 0.12;
    const ex = kind === 'cat' ? D.hw / 2 - 0.045 : D.hw / 2 - 0.05;
    box(ew, eh, 0.05, em, -ex, D.hh / 2 + eh / 2 - 0.01, 0.03, false, parts.head);
    box(ew, eh, 0.05, em, ex, D.hh / 2 + eh / 2 - 0.01, 0.03, false, parts.head);
  } else {
    box(0.06, 0.09, 0.13, em, -(D.hw / 2 + 0.02), D.hh * 0.28, 0.02,
      false, parts.head);
    box(0.06, 0.09, 0.13, em, D.hw / 2 + 0.02, D.hh * 0.28, 0.02,
      false, parts.head);
  }
  if (kind === 'fox' || kind === 'wolf' || kind === 'cat') {
    // the pointed muzzle, with a dark nose on the end of it. A cat's is
    // BLUNT — barely proud of the face — which along with the big round head
    // is most of what separates it from the fox at the same size.
    const snub = kind === 'cat';
    const mz = box(snub ? 0.10 : 0.12, snub ? 0.07 : 0.10, snub ? 0.06 : 0.16,
      mats.snoutLong, 0, -0.05, -D.hd / 2 - (snub ? 0.03 : 0.07),
      false, parts.head);
    box(0.05, 0.05, 0.03, mats.nose, 0, 0.01, snub ? -0.04 : -0.09, false, mz);
    // whiskers, as two pale slivers off the muzzle: three pixels of nothing
    // that read unmistakably as a cat at the range you actually see one
    // Two short sprigs rather than one bar through the muzzle: a single wide
    // box came out as a white rod nailed across the face.
    if (snub) {
      for (const sx of [-1, 1]) {
        const w = box(0.07, 0.011, 0.011, mats.chest ?? mats.trim,
          sx * 0.055, -0.005, -0.015, false, mz);
        w.rotation.y = sx * 0.35;
      }
    }
  }
  if (mats.snout) {
    box(0.17, 0.13, 0.06, mats.snout, 0, -0.03, -D.hd / 2 - 0.03, false, parts.head);
  }
  if (mats.horn && kind === 'goat') {
    // Swept BACK over the neck in two segments, not stuck up like a cow's:
    // the backward sweep is the read from below against the sky, which is
    // the only angle you ever see a goat on a crag from. Each horn is a
    // child of the last so the curve holds when the head goes down to graze.
    // Same sign rule as the tail: a pivotTop limb hangs straight DOWN at zero,
    // and NEGATIVE rotation.x swings it up and back. A first pass used a
    // positive angle and gave the goat two tusks pointing out past its nose.
    for (const sx of [-1, 1]) {
      const h1 = box(0.07, 0.26, 0.07, mats.horn,
        sx * (D.hw / 2 - 0.055), D.hh / 2 + 0.02, 0.01, true, parts.head);
      h1.rotation.x = -2.5;                       // up and back over the poll
      const h2 = box(0.06, 0.22, 0.06, mats.horn, 0, -0.25, 0, true, h1);
      h2.rotation.x = -0.7;                       // then curling down behind
    }
    // the beard: the other half of a goat, and one box
    box(0.07, 0.14, 0.05, mats.beard, 0, -D.hh / 2 - 0.05, -D.hd / 2 + 0.06,
      true, parts.head);
  } else if (mats.horn) {
    box(0.06, 0.13, 0.06, mats.horn, -0.15, D.hh * 0.46, -0.02, false, parts.head);
    box(0.06, 0.13, 0.06, mats.horn, 0.15, D.hh * 0.46, -0.02, false, parts.head);
  }
  // Tail hangs off the rump: pivotTop so it hinges there rather than
  // sticking out. Stored on parts, because the new kinds ANIMATE theirs —
  // the dog wags, the fox carries its brush level, the horse swishes.
  if (kind === 'fox') {
    parts.tail = box(0.13, 0.44, 0.13, mats.body, 0, bodyY + D.bh * 0.30,
      D.bd / 2 + 0.02, true);
    box(0.14, 0.12, 0.14, mats.tip, 0, -0.40, 0, false, parts.tail);  // white tip
  } else if (kind === 'wolf') {
    parts.tail = box(0.10, 0.42, 0.10, mats.trim, 0, bodyY + D.bh * 0.34,
      D.bd / 2 + 0.02, true);
  } else if (kind === 'horse') {
    parts.tail = box(0.09, 0.58, 0.11, mats.mane, 0, bodyY + D.bh * 0.42,
      D.bd / 2 + 0.03, true);
  } else if (kind === 'cat') {
    // Long, thin, and carried STRAIGHT UP — see poseAnimal. A cat with a
    // dog's tail is a small dog; the vertical tail is the whole silhouette.
    parts.tail = box(0.07, 0.40, 0.07, mats.body, 0, bodyY + D.bh * 0.34,
      D.bd / 2 + 0.02, true);
    box(0.075, 0.10, 0.075, mats.tip, 0, -0.36, 0, false, parts.tail);
  } else {
    parts.tail = box(0.06, 0.26, 0.06, mats.trim, 0, bodyY + D.bh * 0.36,
      D.bd / 2 + 0.02, true);
  }
  return parts;
}

// HOW LONG THIS BODY IS LYING DOWN, feet to crown, in the body's own frame.
//
// It used to be one number in main.js — 1.78, a man's head centre plus half
// a head — and every sleeper was laid that far back from the pillow end of
// the bed. A woman is built to 0.94 of that and lay short; a chief is built
// to 1.16 of it and lay with his skull inside the headboard. Read off the
// rig instead, so whoever is put to bed is laid to his own length. The hat
// and the crown are not counted: they come off — see `doff` in buildBody.
export function lyingLength(parts) {
  const head = parts?.head;
  if (!head?.geometry) return 1.76;
  const g = head.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  return head.position.y + g.boundingBox.max.y;
}

// Feet at the group origin, +Y is body up, limbs pivot at their top face.
// Everything hangs off `rig`, an inner group: the outer group carries the
// world transform (rebuilt every frame from the basis) so any lean, bob or
// lurch has to live one level down or it gets overwritten.
function buildBody(kind, job, arm = null, variant = '') {
  // a creature sent from KherveCAD brings its own body and has no palette
  if (CUSTOM_CREATURES.has(kind)) {
    const group = new THREE.Group();
    const rig = new THREE.Group();
    group.add(rig);
    return buildCustomCreature(kind, { group, rig, key: kind });
  }
  const key = isAnimalKind(kind) ? kind
    : (kind === 'zombie' || kind === 'skeleton' || kind === 'golem') ? kind
      : job;
  // A variant repaints the same body — see materialsFor. Only the sheep uses
  // one today (its fleece colour, and whether it still has one).
  const mats = materialsFor(variant ? `${key}#${variant}` : key);
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);
  const parts = { group, rig, key };

  const box = (w, h, d, m, x, y, z, pivotTop = false, parent = rig) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    if (pivotTop) geo.translate(0, -h / 2, 0);
    // a plain part carries its colour; a textured one still has its own maps
    if (m && m.tint) tintBox(geo, m.tint);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };

  if (isAnimalKind(kind)) return buildAnimal(kind, mats, parts, box);

  // The bronze golem. Everything about it is WIDE: a villager's proportions
  // scaled up read as a tall villager, and the thing that makes a golem a
  // golem is that it is broader than a doorway. Short thick legs under a
  // massive chest, arms that hang below the knee, and a small head sunk into
  // the shoulders with no neck at all.
  if (kind === 'golem') {
    parts.legL = box(0.34, 0.64, 0.36, mats.leg, -0.24, 0.64, 0, true);
    parts.legR = box(0.34, 0.64, 0.36, mats.leg, 0.24, 0.64, 0, true);
    parts.torso = box(0.90, 0.86, 0.52, mats.torso, 0, 1.07, 0);
    // the waist, narrower than both the chest and the hips it joins
    box(0.46, 0.22, 0.34, mats.leg, 0, 0.72, 0);
    // Arms hung off the OUTSIDE of the shoulders and long enough to swing
    // past the knee. pivotTop, so they hinge at the shoulder.
    parts.armL = box(0.28, 1.10, 0.30, mats.arm, -0.60, 1.44, 0, true);
    parts.armR = box(0.28, 1.10, 0.30, mats.arm, 0.60, 1.44, 0, true);
    // fists: children of the arms, so they swing with them
    box(0.36, 0.30, 0.38, mats.arm, 0, -1.08, 0, false, parts.armL);
    box(0.36, 0.30, 0.38, mats.arm, 0, -1.08, 0, false, parts.armR);
    parts.head = box(0.42, 0.44, 0.42, mats.head, 0, 1.68, 0);
    // The brow ridge and the nose plate — the head is small and mostly
    // featureless, so the one overhang is what gives it an expression.
    box(0.46, 0.08, 0.10, mats.trim, 0, 1.78, -0.20);
    box(0.12, 0.22, 0.10, mats.trim, 0, 1.62, -0.21);
    // Verdigris on the shoulders, where rain would sit. Two flat caps: this
    // is the one detail that says the metal has been standing out in weather
    // rather than that it came out of a furnace this morning.
    box(0.34, 0.09, 0.36, mats.moss, -0.60, 1.46, 0);
    box(0.34, 0.09, 0.36, mats.moss, 0.60, 1.46, 0);
    return parts;
  }

  if (kind === 'zombie') {
    parts.legL = box(0.21, 0.76, 0.22, mats.leg, -0.12, 0.76, 0, true);
    parts.legR = box(0.21, 0.76, 0.22, mats.leg, 0.12, 0.76, 0, true);
    parts.torso = box(0.46, 0.58, 0.26, mats.torso, 0, 1.05, 0);
    parts.armL = box(0.18, 0.70, 0.20, mats.arm, -0.32, 1.30, 0, true);
    parts.armR = box(0.18, 0.70, 0.20, mats.arm, 0.32, 1.30, 0, true);
    parts.head = box(0.44, 0.44, 0.44, mats.head, 0, 1.56, 0);
    return parts;
  }

  // The skeleton is the same rig with everything narrowed: limbs half a
  // villager's thickness, a shallower torso, and a slightly small skull. That
  // thinness is the whole silhouette — a bone-white villager reads as a
  // villager in a white coat, and only the gaps between the bones say
  // otherwise at any distance.
  if (kind === 'skeleton') {
    parts.legL = box(0.11, 0.76, 0.11, mats.leg, -0.10, 0.76, 0, true);
    parts.legR = box(0.11, 0.76, 0.11, mats.leg, 0.10, 0.76, 0, true);
    parts.torso = box(0.40, 0.58, 0.19, mats.torso, 0, 1.10, 0);
    parts.armL = box(0.10, 0.70, 0.10, mats.arm, -0.27, 1.34, 0, true);
    parts.armR = box(0.10, 0.70, 0.10, mats.arm, 0.27, 1.34, 0, true);
    parts.head = box(0.40, 0.40, 0.40, mats.head, 0, 1.59, 0);
    // The bow, held in the left hand: a stave across the arm with a string
    // behind it. Child of the arm, so it goes wherever the draw pose puts it.
    const grip = box(0.06, 0.62, 0.07, mats.bow, 0, -0.66, -0.06, false, parts.armL);
    box(0.03, 0.58, 0.02, mats.string, 0, 0, 0.06, false, grip);
    parts.bow = grip;
    return parts;
  }

  // A woman is built narrower in the shoulder and a little shorter, and the
  // head sits at the same fraction of the height rather than at the same
  // height — a shorter body with the old head position is a body with its
  // neck stretched. The SILHOUETTE is what tells the two apart at twenty
  // paces; the palette only confirms it once you are close.
  const w = variant === 'woman';
  // A chief is built to be looked up at. Half a head taller than the tallest
  // person in the village and broader across the shoulder — the crown is what
  // you notice second, and the size is what you notice from the door.
  const ch = variant === 'chief';
  const sh = w ? 0.94 : ch ? 1.16 : 1;       // how much of the man's height
  parts.legL = box(0.20 * (w ? 1 : 1.1), 0.70 * sh, 0.23, mats.leg,
    -0.115, 0.70 * sh, 0, true);
  parts.legR = box(0.20 * (w ? 1 : 1.1), 0.70 * sh, 0.23, mats.leg,
    0.115, 0.70 * sh, 0, true);
  parts.torso = box(w ? 0.45 : ch ? 0.62 : 0.52, 0.60 * sh,
    w ? 0.27 : ch ? 0.36 : 0.30, mats.torso, 0, 1.00 * sh, 0);
  const shoulder = w ? 0.315 : ch ? 0.415 : 0.355;
  parts.armL = box(w ? 0.16 : 0.19, 0.66 * sh, w ? 0.19 : 0.22, mats.arm,
    -shoulder, 1.26 * sh, 0, true);
  parts.armR = box(w ? 0.16 : 0.19, 0.66 * sh, w ? 0.19 : 0.22, mats.arm,
    shoulder, 1.26 * sh, 0, true);
  parts.head = box(0.46, 0.46, 0.46, mats.head, 0, 1.53 * sh, 0);
  // HER HAIR, in three pieces rather than one.
  //
  // It used to be a single block behind the head: a fall down the back, and
  // nothing else. From behind that reads; from the front and from either side
  // she was a bald woman with something hanging off the back of her, because
  // the one place hair was not was the whole of the head you can actually see.
  //
  // The fall stays on the BODY — long hair rests on the back and does not
  // swing when she glances sideways — and the two pieces that are on her head
  // are children of the head, so they turn with it. A cap over the crown gives
  // her a hairline; a length down each side past the jaw frames the face. The
  // sides stop short of the front face so they never cover it: they run to
  // z = -0.20 and the nose stands at -0.27.
  if (w) {
    box(0.40, 0.34, 0.16, mats.hair, 0, 1.40 * sh, 0.26);
    // The cap spans 0.15 to 0.25; the sides run from below the jaw UP INTO it
    // rather than stopping just under it, or a band of bare scalp shows round
    // the side of the head between the two. Same trap as the player's hair.
    box(0.50, 0.10, 0.50, mats.hair, 0, 0.20, 0.01, false, parts.head);
    for (const sx of [-1, 1]) {
      box(0.07, 0.46, 0.46, mats.hair, sx * 0.245, -0.03, 0,
        false, parts.head);
    }
  }

  // Children of the head so they follow the idle head turn. Local -Z is the
  // FRONT (see partMaterials), hence the negative z on the nose.
  box(0.12, 0.16, 0.08, mats.nose, 0, -0.03, -0.27, false, parts.head);
  // WHAT COMES OFF AT BEDTIME. A hat and a crown stand up to half a head
  // above the skull, and a sleeper is laid so his SKULL is on the pillow —
  // so worn to bed, a top hat went straight through the headboard and out
  // the other side of the wall, which from the doorway is a man whose head
  // is sticking out of his bed. Nobody sleeps in a hat. `doff` is the list
  // poseVillager hides while he is lying down, and the lying length below is
  // measured without them.
  const doff = (m) => { (parts.doff ??= []).push(m); return m; };
  if (mats.hat) {
    doff(box(0.72, 0.05, 0.72, mats.hat, 0, 0.255, 0, false, parts.head));
    doff(box(0.40, 0.16, 0.40, mats.hatCrown, 0, 0.36, 0, false, parts.head));
  }
  // THE CROWN. A band round the head, five points standing off it, and a
  // stone set in the front. Children of the head, so it turns when he does.
  if (mats.crown) {
    doff(box(0.52, 0.16, 0.52, mats.crown, 0, 0.30, 0, false, parts.head));
    doff(box(0.55, 0.04, 0.55, mats.crownDark, 0, 0.22, 0, false, parts.head));
    const pts = [[0, -0.25], [0.20, -0.16], [-0.20, -0.16],
      [0.19, 0.17], [-0.19, 0.17]];
    for (const [px, pz] of pts) {
      doff(box(0.10, 0.17, 0.10, mats.crown, px, 0.45, pz, false, parts.head));
      doff(box(0.06, 0.05, 0.06, mats.gem, px, 0.56, pz, false, parts.head));
    }
    doff(box(0.11, 0.11, 0.05, mats.gem, 0, 0.31, -0.27, false, parts.head));
  }
  if (mats.pack) box(0.34, 0.36, 0.14, mats.pack, 0, 1.02, 0.22);  // +Z = back

  // --- the guard's weapon ---------------------------------------------------
  //
  // Parented to the RIGHT ARM, which pivots at the shoulder and hangs along
  // -Y, so the hand is at local y = -0.66 and everything below is measured
  // from there. That parenting is the whole point: the weapon walks with the
  // gait and comes over in the swing (see poseVillager's swingT branch) for
  // free, because it is part of the arm rather than an object being kept
  // near one.
  //
  // Everything is carried tilted forward off the arm rather than hanging
  // straight down it — a blade pointing at the guard's own boot is a blade
  // that clips the ground on every step.
  if (arm && mats.steel) {
    const hand = new THREE.Group();
    hand.position.set(0, -0.66, 0);
    // the bow goes in the LEFT hand, because the right one is the arm the
    // swing animation drives and an archer's right hand is on the string
    (arm === 'bow' ? parts.armL : parts.armR).add(hand);
    parts.weapon = hand;
    // Everything here is deliberately CHUNKY. A first pass drew them to
    // scale — a five-centimetre blade, a broom-handle shaft — and at the
    // twenty paces you actually see a guard from, a weapon one pixel wide is
    // a weapon nobody can see. These are the proportions of a toy soldier,
    // and they are the ones that read.
    if (arm === 'sword') {
      hand.rotation.x = 0.5;
      box(0.07, 0.18, 0.07, mats.grip, 0, -0.07, 0, false, hand);
      box(0.32, 0.07, 0.11, mats.steel, 0, -0.18, 0, false, hand);  // crossguard
      box(0.11, 0.62, 0.05, mats.steel, 0, -0.53, 0, false, hand);  // blade
    } else if (arm === 'spear') {
      // Shouldered like a pike: the shaft runs past the hand at both ends and
      // the head stands a clear half-block over the helmet, which is what
      // makes a spearman readable across a village green.
      hand.rotation.x = 0.16;
      box(0.09, 2.00, 0.09, mats.haft, 0, 0.70, 0, false, hand);
      box(0.13, 0.34, 0.13, mats.steel, 0, 1.83, 0, false, hand);   // the head
      box(0.11, 0.08, 0.11, mats.steel, 0, -0.32, 0, false, hand);  // butt cap
    } else if (arm === 'axe') {
      // A felling axe: a long haft with the head set across the top of it,
      // bit forward. The head being OFF-CENTRE is what makes it read as an
      // axe rather than as a hammer at any distance.
      hand.rotation.x = 0.45;
      box(0.07, 0.86, 0.07, mats.haft, 0, -0.34, 0, false, hand);
      box(0.09, 0.26, 0.30, mats.steel, 0, -0.70, -0.12, false, hand);
      box(0.07, 0.16, 0.10, mats.steel, 0, -0.70, -0.30, false, hand);  // the bit
    } else if (arm === 'hoe') {
      // A hoe is a long haft and a small blade at right angles to it, and it
      // is the ANGLE that says hoe: an axe's head is in line with the swing,
      // a hoe's is across it.
      hand.rotation.x = 0.30;
      box(0.06, 0.94, 0.06, mats.haft, 0, -0.38, 0, false, hand);
      box(0.26, 0.07, 0.16, mats.steel, 0, -0.82, -0.09, false, hand);
    } else if (arm === 'pickaxe' || arm === 'shovel') {
      hand.rotation.x = 0.40;
      box(0.06, 0.84, 0.06, mats.haft, 0, -0.33, 0, false, hand);
      if (arm === 'pickaxe') {
        box(0.06, 0.09, 0.52, mats.steel, 0, -0.74, 0, false, hand);
      } else {
        box(0.20, 0.24, 0.06, mats.steel, 0, -0.80, 0, false, hand);
      }
    } else if (arm === 'hammer') {
      hand.rotation.x = 0.55;
      box(0.08, 0.70, 0.08, mats.haft, 0, -0.26, 0, false, hand);
      box(0.20, 0.22, 0.34, mats.steel, 0, -0.58, 0, false, hand);  // the head
    } else if (arm === 'bow') {
      // Carried UPRIGHT at the side, not across the chest: a bow held level
      // reads as a stick, and it is the vertical stave with the string down
      // its inside edge that says archer at a glance. The draw pose swings the
      // whole arm forward, which brings it square to the target for free.
      hand.rotation.x = 0.12;
      const stave = box(0.08, 0.98, 0.09, mats.haft, 0, 0.12, 0, false, hand);
      box(0.04, 0.92, 0.03, mats.cord, 0, 0, 0.07, false, stave);
      // ...and the knife on the belt, for when something is already on him
      box(0.07, 0.28, 0.05, mats.steel, 0.30, 0.92, 0.12, false, rig);
    }
  }

  return parts;
}

// ---------------------------------------------------------------------------
// helpers

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// two unit vectors spanning the tangent plane at `up`; the seed axis is the
// one least aligned with up, so the cross product never degenerates
function tangentBasis(up, t1, t2) {
  if (Math.abs(up.x) < 0.9) _ax.set(1, 0, 0);
  else _ax.set(0, 1, 0);
  t1.crossVectors(_ax, up).normalize();
  t2.crossVectors(up, t1);
}

// surface distance in blocks between two directions on a sphere of radius r
export function arcBetween(a, b, r) {
  return Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1)) * r;
}

// walk `arc` blocks from `up` along the tangent `t`, staying on the sphere
function offsetDir(up, t, arc, r, out) {
  const ang = arc / Math.max(1, r);
  return out.copy(up).multiplyScalar(Math.cos(ang))
    .addScaledVector(t, Math.sin(ang)).normalize();
}

// ---------------------------------------------------------------------------
// hit feedback: red flash, gore, damage numbers, corpses
//
// The problem this section exists to solve: materials are shared by every
// entity of a kind — that is what keeps thirty animals at about twenty-five
// canvases — so tinting one pig red used to tint the whole herd, and the only
// hit reaction available was a pose recoil.
//
// The fix is clone-on-hit. An entity that has never been hit keeps pointing at
// the shared material set and costs exactly what it cost before; the FIRST hit
// clones the set for that one body, and the clones are kept afterwards, so a
// second hit allocates nothing. Between flashes the body is put back on the
// shared materials, so a herd that has been shot at once still renders as one
// species again the moment the red fades.
//
// Everything else here is pooled and module-level: one particle pool, one set
// of damage-number sprites, one corpse list, all built lazily the first time
// something is actually hurt.

const HURT_COLOR = new THREE.Color(0xff2a1c);
// where a burning body's flame and smoke are born. Its own vector, because
// burstFX uses _fv for the VELOCITY and the two would alias.
const _burnAt = new THREE.Vector3();

const FX_COLORS = {
  blood: 0x8c1f1f,
  rot: 0x4c7a2e,        // zombies bleed something else
  dust: 0xb59a6f,
  // what comes off something burning in the sun
  flame: 0xff9a2e,
  ember: 0xffd166,
  smoke: 0x6e6a66,
  // taming: the one FX in this file that is not something going wrong for
  // whatever it came out of
  heal: 0xe86ea8,
};
const FX_PARTICLES = 64;
const FX_NUMBERS = 8;

const _fx = {
  scene: null, geo: null, mats: null,
  parts: [], next: 0,
  nums: [], numNext: 0,
  corpses: [],
  external: false,      // set once someone calls updateEffects() themselves
};

function fxInit(scene) {
  if (!scene) return false;
  if (_fx.scene === scene) return true;
  if (_fx.scene) {
    // a new scene (world rebuilt into a fresh one): carry the pools over
    for (const p of _fx.parts) scene.add(p.mesh);
    for (const n of _fx.nums) scene.add(n.sprite);
    _fx.scene = scene;
    return true;
  }
  _fx.scene = scene;
  _fx.geo = new THREE.BoxGeometry(1, 1, 1);
  _fx.mats = {};
  for (const [k, c] of Object.entries(FX_COLORS)) {
    _fx.mats[k] = new THREE.MeshBasicMaterial({ color: c });
  }
  for (let i = 0; i < FX_PARTICLES; i++) {
    const m = new THREE.Mesh(_fx.geo, _fx.mats.blood);
    m.visible = false;
    m.frustumCulled = false;      // it is nowhere near its own origin
    scene.add(m);
    _fx.parts.push({
      mesh: m, life: 0, max: 1, size: 0.1, grav: 1,
      vel: new THREE.Vector3(),
    });
  }
  return true;
}

// Round-robin, like combat.js's pool: a particle that outlives the pool is
// recycled early, which is invisible, and there is no free list to keep.
function fxSpawn(pos, vel, opts) {
  const p = _fx.parts[_fx.next];
  _fx.next = (_fx.next + 1) % _fx.parts.length;
  p.mesh.material = _fx.mats[opts.color] ?? _fx.mats.blood;
  p.mesh.position.copy(pos);
  p.vel.copy(vel);
  p.size = opts.size ?? 0.08;
  p.max = p.life = opts.life ?? 0.45;
  p.grav = opts.gravity ?? 1;
  p.mesh.scale.setScalar(p.size);
  p.mesh.visible = true;
}

// A burst biased along `dir`, so blood sprays the way the blow was travelling
// rather than puffing out symmetrically like a smoke bomb.
function burstFX(scene, pos, n, opts = {}) {
  if (!n || !fxInit(scene)) return;
  const speed = opts.speed ?? 3.2;
  for (let i = 0; i < n; i++) {
    _fv.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
    if (opts.dir) _fv.addScaledVector(opts.dir, opts.bias ?? 1.1);
    if (_fv.lengthSq() < 1e-8) _fv.set(0, 1, 0);
    _fv.normalize().multiplyScalar(speed * (0.35 + Math.random() * 0.85));
    fxSpawn(pos, _fv, opts);
  }
}

// --- floating damage numbers ------------------------------------------------
// Optional (HURT_TUNING.numbers) and cheap: eight sprites, each with its own
// 64x32 canvas that is redrawn only when that sprite is reused.

function makeNumber() {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 32;
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  const mat = new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: true, depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.visible = false;
  sprite.frustumCulled = false;
  sprite.scale.set(0.85, 0.42, 1);
  return { sprite, mat, tex, cv, g: cv.getContext('2d'), life: 0, max: 0.8,
    up: new THREE.Vector3(), pos: new THREE.Vector3() };
}

function showNumber(scene, pos, amount, up, crit = false) {
  if (!HURT_TUNING.numbers) return;
  // the stub three used by the node tests has no Sprite; nothing here is
  // load-bearing, so drop the numbers rather than throwing
  if (typeof document === 'undefined' || typeof THREE.Sprite !== 'function') return;
  if (!fxInit(scene)) return;
  if (!_fx.nums.length) {
    for (let i = 0; i < FX_NUMBERS; i++) {
      const n = makeNumber();
      scene.add(n.sprite);
      _fx.nums.push(n);
    }
  }
  const n = _fx.nums[_fx.numNext];
  _fx.numNext = (_fx.numNext + 1) % _fx.nums.length;
  const text = String(Math.round(amount * 10) / 10);
  const g = n.g;
  g.clearRect(0, 0, 64, 32);
  g.font = 'bold 24px "Segoe UI", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 5;
  g.strokeStyle = 'rgba(0,0,0,.85)';
  g.strokeText(text, 32, 17);
  g.fillStyle = crit ? '#ffd66a' : '#fff1f1';
  g.fillText(text, 32, 17);
  n.tex.needsUpdate = true;
  n.pos.copy(pos);
  n.up.copy(up);
  n.life = n.max;
  n.mat.opacity = 1;
  n.sprite.position.copy(pos);
  n.sprite.visible = true;
}

// --- per-entity materials ---------------------------------------------------

// Clone the shared set for one body. Called on the FIRST hit only — an entity
// that is never touched keeps the shared materials for its whole life, which
// is the optimisation a radius-800 world depends on.
function ownMaterials(root) {
  const own = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const src = o.material;
    const arr = Array.isArray(src) ? src : [src];
    const clones = arr.map((m) => m.clone());
    own.push({
      obj: o, shared: src, clones,
      base: clones.map((m) => m.color.clone()),
    });
  });
  return own;
}

// Swap between the private clones and the shared originals. Off is what puts
// a herd back on one material set once the red has faded.
function wearOwn(own, on) {
  if (!own) return;
  for (const it of own) {
    it.obj.material = on
      ? (Array.isArray(it.shared) ? it.clones : it.clones[0])
      : it.shared;
  }
}

// The map supplies the colour, so tinting is a multiply on the per-face shade:
// lerping that toward red reads as a creature lit red, not as a red silhouette.
function tintOwn(own, mix) {
  if (!own) return;
  for (const it of own) {
    for (let i = 0; i < it.clones.length; i++) {
      it.clones[i].color.copy(it.base[i]).lerp(HURT_COLOR, mix);
    }
  }
}

function fadeOwn(own, opacity) {
  if (!own) return;
  for (const it of own) {
    for (const m of it.clones) {
      m.transparent = true;
      m.opacity = opacity;
      m.depthWrite = opacity > 0.65;
    }
  }
}

function disposeOwn(own) {
  if (!own) return;
  // the clones share their parent's textures, and material.dispose() does not
  // touch maps, so the species' canvases survive this
  for (const it of own) for (const m of it.clones) m.dispose();
}

// --- corpses ----------------------------------------------------------------
//
// main.js sweeps `dead` entities and removes their mesh on the same frame, so
// a death animation cannot live on the entity. The body is handed to this list
// instead and the entity keeps an empty group for main.js to remove, which is
// why the corpse never blinks out for a frame first.

function addCorpse(entity, scene, side) {
  if (!fxInit(scene)) return null;
  const c = {
    scene, mesh: entity.mesh, rig: entity.rig, own: entity.ownMats,
    up: entity.up.clone(), pos: entity.mesh.position.clone(),
    lean: entity.rig.rotation.x,
    t: 0, dur: HURT_TUNING.death, side,
  };
  _fx.corpses.push(c);
  while (_fx.corpses.length > HURT_TUNING.corpses) endCorpse(_fx.corpses.shift());
  return c;
}

function endCorpse(c) {
  c.mesh.parent?.remove(c.mesh);
  // geometries are built per entity in buildBody, so they are ours to free
  c.mesh.traverse?.((o) => { if (o.isMesh) o.geometry?.dispose?.(); });
  disposeOwn(c.own);
}

// ---------------------------------------------------------------------------
// effects tick
//
// Nothing in main.js knows this exists, so it rides on tickZombies(), which is
// already called once per frame with a dt. Call updateEffects() yourself if you
// would rather drive it explicitly; tickZombies then stops doing it, so the
// corpses cannot be stepped twice in one frame.

export function updateEffects(dt, opts = {}) {
  if (opts.internal !== true) _fx.external = true;
  if (dt > 0.1) dt = 0.1;         // a tab that was backgrounded

  for (const p of _fx.parts) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.mesh.visible = false; continue; }
    if (p.grav) {
      _fv.copy(p.mesh.position).normalize()
        .multiplyScalar(-GRAVITY * p.grav * dt);
      p.vel.add(_fv);
    }
    p.mesh.position.addScaledVector(p.vel, dt);
    // shrink rather than fade: the material is shared by the whole pool
    p.mesh.scale.setScalar(p.size * (p.life / p.max));
  }

  for (const n of _fx.nums) {
    if (n.life <= 0) continue;
    n.life -= dt;
    if (n.life <= 0) { n.sprite.visible = false; continue; }
    const k = 1 - n.life / n.max;
    n.sprite.position.copy(n.pos).addScaledVector(n.up, 0.35 + k * 0.9);
    n.mat.opacity = Math.min(1, (1 - k) * 2.2);
  }

  for (let i = _fx.corpses.length - 1; i >= 0; i--) {
    const c = _fx.corpses[i];
    c.t += dt;
    const k = Math.min(1, c.t / c.dur);
    const e = 1 - (1 - k) * (1 - k);            // ease out: it drops, then settles
    // topple sideways about the body's own long axis, then sink into the
    // ground — a corpse that only faded looked like a bug, a corpse that only
    // fell left a body lying in the field forever
    c.rig.rotation.z = c.side * 1.5708 * e;
    c.rig.rotation.x = c.lean * (1 - e);
    c.mesh.position.copy(c.pos).addScaledVector(c.up, -0.7 * k * k);
    tintOwn(c.own, Math.max(0, 0.55 - k) * HURT_TUNING.tint);
    if (k > 0.45) fadeOwn(c.own, 1 - (k - 0.45) / 0.55);
    if (c.mesh.parent !== c.scene) c.scene.add(c.mesh);
    if (k >= 1) { endCorpse(c); _fx.corpses.splice(i, 1); }
  }
}

// Drop every live effect (world change / teardown). Safe to call twice.
export function clearEffects() {
  for (const c of _fx.corpses) endCorpse(c);
  _fx.corpses.length = 0;
  for (const p of _fx.parts) { p.life = 0; p.mesh.visible = false; }
  for (const n of _fx.nums) { n.life = 0; n.sprite.visible = false; }
}

export const activeCorpses = () => _fx.corpses.length;

// A puff of dust at a spot in the world, for main.js. burstFX itself stays
// private — this is the one opening onto it — and it exists because a block
// that lands with nothing coming off it reads as a block that placed ITSELF.
// A house going up is supposed to look like somebody's afternoon.
export function dustBurst(scene, pos, n = 6, opts = {}) {
  burstFX(scene, pos, n, {
    color: 'dust', size: 0.085, life: 0.55, speed: 2.0, gravity: 1.4, ...opts,
  });
}

// ---------------------------------------------------------------------------

export class Entity {
  constructor(planet, kind, dir, opts = {}) {
    this.planet = planet;
    // 'villager' | 'zombie' | 'skeleton' | 'pig' | 'cow' | 'sheep' | 'chicken'
    this.kind = kind;
    this.isAnimal = isAnimalKind(kind);
    this.undead = kind === 'zombie' || kind === 'skeleton';
    // A construct: a biped like a villager, but it is not one of the folk and
    // it has no trade. It fights the undead on the garrison's terms — see
    // thinkGolem — and nothing about it burns, sleeps or goes home at dusk.
    this.golem = kind === 'golem';
    // A crypt dweller. The height field answers "the top of the planet",
    // which is the roof over a catacomb and not the flagstones under one, so
    // anything down there finds its floor a different way — see groundAt.
    // Everything else about it is an ordinary entity.
    this.buried = !!opts.buried;
    // Bound to one place: a graveyard's guard does not chase you round the
    // world and does not burn off at dawn. Without the second half of that a
    // cemetery is unguarded at exactly the hour you can see well enough to
    // want to explore it.
    this.bound = !!opts.bound;
    // Nothing in this file can swim. Every kind here — villagers, zombies and
    // all four animals — walks on the ground height field, so the sea is a
    // wall to all of them; the flag exists so a future kind that does swim
    // can opt out in one line. Underground there is no sea to avoid and the
    // height field the test uses is the wrong one anyway.
    this.avoidsWater = opts.avoidsWater ?? !this.buried;
    this.job = (this.undead || this.isAnimal || this.golem) ? null
      : (opts.job ?? 'farmer');
    // Man or woman. Only villagers have one, and it decides three things: how
    // the body is built, what work this one can be set to (see ORDERS), and
    // who can pair with whom — a village grows because a man and a woman
    // share a bed, and a village with no women does not grow at all.
    // A chief is not hired, not tamed, not killed and not ordered about by
    // anybody but himself — see canHire, canTameWith and damage.
    // Nothing kills the chief, and nothing kills the priest either. Both are
    // fixtures rather than people — there is one per building and no way to
    // raise another — and a church you walk into to find a body on the floor
    // is a church that has lost the only thing it was for.
    // ...and the shopkeeper with them. "There should be someone there always"
    // is not a nicety: the shop is the village's whole income and the player's
    // only counter, and a zombie that got one through a door at night would
    // take the trade of a settlement out of the world for good — there is no
    // way to raise another.
    this.immortal = opts.job === 'chief' || opts.job === 'priest'
      || opts.job === 'trader' || opts.job === 'barkeep'
      || opts.job === 'constable' || opts.job === 'elder';
    this.sex = (kind === 'villager')
      ? (opts.sex ?? ((opts.rand ?? Math.random)() < 0.5 ? 'woman' : 'man'))
      : null;
    // What a guard is holding, and therefore how it fights — see SOLDIER_ARMS.
    // A soldier with no `arm` given keeps the sword the garrison has always
    // fought with, so nothing that spawns one without asking changes.
    this.arm = this.job === 'soldier'
      ? (SOLDIER_ARMS[opts.arm] ? opts.arm : 'sword')
      : (ANY_ARMS[opts.arm] ? opts.arm : null);
    this.speed = this.isAnimal ? ANIMAL_BODY[kind].speed
      : kind === 'zombie' ? ZOMBIE_TUNING.speed
        : kind === 'skeleton' ? SKELETON_TUNING.speed
          : this.golem ? GOLEM_TUNING.speed : 1.45;
    // A sheep's fleece: its colour, and whether it still has one. Both are
    // set BEFORE the body is built, because the body is what wears them.
    if (kind === 'sheep') {
      this.fleece = opts.fleece ?? rollFleece(opts.rand ?? Math.random);
      this.sheared = false;
      // Seconds of wool left to grow back. Counted down in update(), and a
      // whole in-game day is deliberately too long to farm by standing still:
      // wool comes from keeping a flock, not from one sheep and patience.
      this.woolIn = 0;
    }
    this.parts = buildBody(kind, this.wearing ?? this.job,
      this.arm, this.skin());
    // ...and the patch it puts on the ground. On the group rather than the
    // rig, so the walk does not carry it about — see SHADOW above.
    // The body throws a real shadow too. The patch is the contact mark under
    // the feet and stays whatever the sun is doing; this is the body's own
    // outline laid across the ground, and it swings round with the day. Both,
    // because they do different jobs: the patch is what sits a thing ON a
    // surface, the cast shadow is what says where the light is.
    //
    // BEFORE the patch is added, and that is the whole reason it is in this
    // order: the patch is a flat dark quad, and a flat dark quad that casts a
    // shadow lays a black square on the ground under every villager.
    this.parts.group.traverse((o) => {
      if (!o.isMesh) return;
      // `casts` is the permission, `castShadow` the switch main.js flips by
      // distance every frame. Without the record it could not tell a part it
      // had switched off from the flat patch under the feet, which must never
      // cast whatever happens — a dark quad that casts lays a black square on
      // the ground under every villager.
      o.userData.casts = true;
      o.castShadow = true;
      o.receiveShadow = true;   // ...and stands in the shadow of a house
    });
    this.parts.group.add(makeShadow(kind, this.job));
    // Women are a shade lighter on their feet than men, which is most of what
    // makes a mixed crowd read as a crowd rather than as a rank.
    if (this.sex === 'woman') this.speed *= 1.04;
    this.mesh = this.parts.group;
    // Size is one scale on the body group — every part, every pose and every
    // animation is expressed in the body's own frame, so nothing below has to
    // know how big this one is. syncMesh only ever writes position and
    // quaternion, so the scale survives.
    this.scale = kind === 'zombie' ? (ZOMBIE_TUNING.scale || 1)
      : this.golem ? (GOLEM_TUNING.scale || 1) : 1;
    if (this.scale !== 1) this.mesh.scale.setScalar(this.scale);
    this.rig = this.parts.rig;
    // feet to crown when laid flat — what claimBed in main.js lays a bed out
    // for, so the head lands on the pillow whoever this is
    this.lieLength = lyingLength(this.parts) * this.scale;
    // the limbs the stagger scrambles: two on a villager or a chicken, four
    // on a quadruped, collected once so a hit does not have to look them up
    this.legs = Object.keys(this.parts)
      .filter((k) => k.startsWith('leg'))
      .map((k) => this.parts[k]);

    this.up = dir.clone().normalize();
    // `radius` puts one down at a level the height field cannot describe —
    // a corridor ten courses under a churchyard — and is the only way to
    // stand something below its own sky.
    this.pos = this.up.clone().multiplyScalar(opts.radius
      ?? planet.surfaceRadiusAtDir(this.up.x, this.up.y, this.up.z));
    this.home = this.up.clone();
    // The radius `home` stands at. Only the mountain animals read it — it is
    // what lets a goat notice it has wandered downhill, which an arc tether
    // alone cannot tell it.
    this.homeRadius = this.pos.length();
    // a per-entity tether, in degrees of arc: penned stock stays inside its
    // fences instead of roaming on the species' whole wander range
    this.wanderArc = opts.wanderArc ?? null;
    this.heading = new THREE.Vector3(-this.up.y, this.up.x, 0);
    if (this.heading.lengthSq() < 1e-6) this.heading.set(1, 0, 0);
    this.projectHeading();

    const rnd = opts.rand ?? Math.random;
    this.radialVel = 0;
    // A radius being climbed to, and the one to come back down to in the
    // morning. Both null for everybody who is not on a ladder — see tryBed.
    this.climbTo = null;
    this.climbHold = false;
    this.bedFrom = null;
    this.phase = rnd() * 6.283;
    this.clock = this.phase;            // free-running, drives idle animation
    // staggers everyone's first decision; animals decide sooner, or a herd
    // spends its first twenty seconds walking in one direction together
    this.think = this.isAnimal ? rnd() * 5 : 8 + rnd() * 12;
    this.dead = false;
    this.health = this.isAnimal ? ANIMAL_BODY[kind].health
      : kind === 'zombie' ? ZOMBIE_TUNING.health
        : kind === 'skeleton' ? SKELETON_TUNING.health
          : this.golem ? GOLEM_TUNING.health
            : (this.job === 'soldier' ? SOLDIER_TUNING.health : 10);
    this.maxHealth = this.health;
    this.hitPlayer = null;              // optional cb(entity) — main.js may set it
    this.attackCd = 0;
    this.swingT = 0;                    // soldiers: sword-arm timer, pose only

    // combat: set by damage(), read by main.js / combat.js after `dead`
    this.drops = null;                  // [{ id, count }] once it dies
    this.hurtT = 0;                     // flinch timer, drives the pose
    this.speedMul = 1;
    this.knockT = 0;
    this.knockPush = HURT_TUNING.knockSpeed;
    this.knockDir = new THREE.Vector3();
    this.flee = 0;                      // animals only: seconds left panicking
    this.fleeDir = new THREE.Vector3();
    // hit reaction. `ownMats` stays null until the first hit — that is the
    // whole shared-material optimisation, so do not populate it eagerly.
    this.ownMats = null;
    this.corpse = null;                 // set by die(), read to stay idempotent
    this.flashT = 0;                    // red tint timer
    this.stagger = 0;                   // broken-stride timer
    this.hurtFwd = 1;                   // blow direction in the body's frame:
    this.hurtSide = 0;                  // +fwd leans back, +side tips right
    this.panic = 0;                     // 0..1, how badly an animal is spooked
    // rough body bounds, so combat.js can aim at a chicken and a cow
    // differently instead of assuming everything is villager sized. Nothing
    // reads them yet; combat.js still uses its own constants.
    const A = this.isAnimal ? ANIMAL_BODY[kind] : null;
    // A golem is twice a villager through the shoulders and a head taller.
    // Aiming at one with a villager's box means half the shots you can see
    // land go through it, which reads as a bug rather than as a miss.
    this.hitCentre = (A ? A.legH + A.bh * 0.5 : this.golem ? 1.15 : 0.95)
      * this.scale;
    this.hitRadius = (A ? Math.max(0.32, A.bd * 0.55) : this.golem ? 0.8 : 0.55)
      * this.scale;
    // temperament, straight off the species table: a skittish animal bolts
    // from the player unprovoked, a fighting one turns on them instead of
    // fleeing when hit (and hunts at night). combat.js wires hitPlayer onto
    // anything with `fights`, the same way it does zombies.
    this.skittish = !!(A && A.skittish);
    this.fights = !!(A && A.fights);
    // ...and a creature from KherveCAD says what it is: a person stops to
    // look at you, a monster comes for you (see natureOf)
    this.person = !!(A && A.person);
    this.monster = !!(A && A.monster);
    // What this species chases (a kind name) and what it can be tamed with (a
    // DROP_NAMES key, resolved to a real item id by tameItemFor). Both off
    // the species table, so nothing outside this file has to know either.
    this.hunts = A?.hunts ?? null;
    this.tameWith = A?.tameWith ?? null;
    this.angry = 0;                     // seconds of grudge left, fighters only

    // --- flight, climbing and standing still -------------------------------
    // A bee is the first thing in this file that does not walk. `flies` skips
    // the ground settle in update() entirely and holds it at `hover` blocks
    // over whatever is beneath — the height field is still what it is over,
    // it just does not rest on it.
    this.flies = !!(A && A.flies);
    this.hover = A?.hover ?? 0;
    // A hive does not move at all, ever. Cheaper than giving it a brain that
    // decides to stand still sixty times a second.
    this.still = !!(A && A.still);
    // How tall a step this one will take. Everything here has always used
    // STEP_UP; a goat takes nearly double, which is the only reason it can
    // live somewhere the sheep cannot follow it to.
    this.stepUp = A?.climb ?? STEP_UP;

    // --- tame animals ------------------------------------------------------
    // Set by tame(). An owned animal follows its owner, defends them, and
    // stops answering to the home tether it was born with — see thinkPet.
    // `owner` is a POSITION-BEARING object (main.js passes the player), not a
    // copy of a position: a pet has to follow something that moves.
    this.tamed = false;
    this.owner = null;
    // What it has been told to do, and where it was told to do it. `post` is
    // the spot a wait/guard/hunt order pins it to — set when the order is
    // given, so "guard" always means "guard HERE" and never "guard wherever
    // you happen to have drifted to".
    this.order = 'follow';
    this.post = null;
    // A villager you have paid. It answers the same orders a pet does — see
    // ORDERS — and it fights with its hands.
    this.hired = false;
    // WHAT YOU CALL HIM. A hand you hired is somebody you will be looking at
    // for hours, and "farmer" is what he does, not who he is. Null until you
    // name him, and then it is what the plate over his head says and what
    // every line about him in the book says. `hid` is the roster row he
    // belongs to, so a name survives a save — see the roster in main.js.
    this.title = null;
    this.hid = null;
    // The wardrobe his body is built from. The JOB by default, because that
    // is what buildBody keys the clothes off — but a hand set to guard wears
    // the garrison's slate and steel instead, which is how you tell your
    // watch from your woodcutters across a green.
    this.wearing = null;
    // Which settlement this one belongs to, and the bed it has been sent to
    // if it is courting. Both are main.js's to set: this file has no idea
    // what a village is, and should not.
    this.village = opts.village ?? null;
    this.court = null;
    // Working under the village's own chief rather than for the player. Same
    // orders, same brain, same trades — the difference is only who the load
    // is carried to at the end of it, and that is work.js's business.
    this.forVillage = false;
    // A name a chief can use twice running. Nothing else needs one: every
    // other system in this file holds the object itself.
    this.uid = ++_uid;
    this.collar = null;                 // the mesh that says so
    this.target = null;                 // what it is currently going for
    this.targetT = 0;                   // seconds of interest left in that
    // --- being ridden ------------------------------------------------------
    // Set by mount(). While this is not null the animal's own brain is off and
    // `reins` is the direction the rider is asking for — see thinkRidden.
    this.rider = null;
    this.reins = new THREE.Vector3();
    this.reinsGo = false;
    this.attackDamage = A && A.damage
      ? A.damage : (kind === 'skeleton' ? SKELETON_TUNING.melee : null);
    // Ranged attack, set by combat.js the way hitPlayer is: cb(entity) fires
    // one arrow out of combat's own projectile pool at the player. Null on
    // everything that does not carry a bow, and null until combat wires it,
    // so a skeleton with no combat module simply never shoots.
    this.shoot = null;
    this.drawT = 0;                     // seconds of nock left, pose only

    // villager routine
    this.waypoints = opts.waypoints ?? null;
    // The road, when this one is on it. Null for everybody who is at home,
    // which is everybody — see sendEnvoy.
    this.errand = null;
    this.wp = 0;
    this.state = 'walk';                // 'walk' | 'work'
    // zombie shamble: a slow wander in the steering target, unique per zombie
    this.noise = this.phase;
    this.noiseRate = 0.5 + rnd() * 0.5;
    this.stumble = 0;
    this.limp = this.phase > 3.14 ? 1 : -1;
  }

  projectHeading() {
    this.heading.addScaledVector(this.up, -this.heading.dot(this.up));
    if (this.heading.lengthSq() < 1e-8) this.heading.set(this.up.y, -this.up.x, 0);
    this.heading.normalize();
  }

  // turn towards a target direction on the sphere, at a limited rate
  steerTowards(targetDir, dt, rate = 2.4) {
    _v.copy(targetDir).addScaledVector(this.up, -targetDir.dot(this.up));
    if (_v.lengthSq() < 1e-8) return;
    _v.normalize();
    const angle = Math.acos(THREE.MathUtils.clamp(this.heading.dot(_v), -1, 1));
    if (angle < 1e-4) return;
    const t = Math.min(1, (rate * dt) / angle);
    this.heading.lerp(_v, t);
    this.projectHeading();
  }

  randomTurn(spread = 2.4) {
    const a = (Math.random() - 0.5) * spread;
    this.turnBy(a);
  }

  // Swing the heading by a fixed angle. Everything that turns in this file
  // either picks a new bearing outright or eases toward one at a RATE; this is
  // the second kind with the target taken out, for a body that only knows it
  // cannot go the way it is pointed.
  turnBy(a) {
    _v.copy(this.heading).applyAxisAngle(this.up, a);
    this.heading.copy(_v);
    this.projectHeading();
  }

  // Is the ground in this direction under water?
  //
  // surfaceRadiusAtDir deliberately answers with the BED beneath a fluid — a
  // lake is not something you can stand on — so the water itself is invisible
  // to a height query and has to be looked for in the block just above the
  // bed. Every other water test in the game does the same thing; this is the
  // one entities were missing.
  wetAt(x, y, z) {
    const r = this.planet.surfaceRadiusAtDir(x, y, z) + 0.5;
    return this.planet.blockAtWorld(x * r, y * r, z * r) === BLOCK.WATER;
  }

  // Where the floor is under a direction — the radius something standing
  // there would put its feet at, or null for "there is no floor here".
  //
  // Above ground that is the height field, which is what every creature in
  // this file has always used. UNDERGROUND the height field is the wrong
  // answer: it reports the top of the planet, so a skeleton in a catacomb
  // read the churchyard's grass as its ground and climbed a step a frame
  // until it surfaced among the headstones. A buried creature looks DOWN
  // from where it already is instead, and calls a column with less than two
  // clear cells over its floor a wall rather than a step — which is the only
  // thing stopping it from walking into one.
  groundAt(x, y, z) {
    const p = this.planet;
    if (this.buried) return this.floorNear(x, y, z);
    const g = p.surfaceRadiusAtDir(x, y, z);
    // INDOORS. The height field answers "the top of this column", which for
    // anywhere under a roof is the ridge of that roof — so a body that steps
    // through a doorway is told the ground is eight courses up and is pushed
    // out through the tiles. It is why nothing in this game could go inside a
    // building: the cook stood in the street, the woman sent to make a bed
    // never got to the house, and a chief placed on his throne appeared on
    // top of his own hall.
    //
    // So when the surface is well above the feet, look for a floor LOCALLY
    // first — the same search a crypt dweller uses. A real step up answers
    // with itself and nothing changes; a roof overhead answers with the boards
    // under it, and people can walk indoors.
    if (g - this.pos.length() > this.stepUp) {
      const inside = this.floorNear(x, y, z);
      if (inside !== null) return inside;
    }
    // A FENCE IS NOT A FLOOR. The height field holds a body seven tenths of a
    // block over a fence's top so that a penned pig cannot jump out — but a
    // villager working for a chief is given a longer stride (stepUp 1.85, see
    // landOrders in main.js), and 1.85 clears 1.7, so a worker could step up
    // onto the pen and then stood on the rail with daylight under his boots.
    // Answering "wall" instead is what a fence is FOR, and it costs nothing
    // anywhere else: walking OFF one is a step down, and still allowed.
    if (g > this.pos.length() + 0.05 && onAFence(p, x, y, z, g)) return null;
    return g;
  }

  // The floor at this direction NEAR where the body already is: the highest
  // solid cell within a step up or a short drop, with room to stand on it.
  // Null when there is nothing to stand on, which the caller reads as a wall.
  floorNear(x, y, z) {
    const p = this.planet;
    const r0 = this.pos.length();
    for (let k = 1; k >= -4; k--) {
      const rs = r0 + k - 0.5;              // centre of the cell topping out at r0+k
      if (!p.solidAtWorld(x * rs, y * rs, z * rs)) continue;
      // A RUG IS NOT A FLOOR. solidAtWorld answers "not air, not water, not
      // lava", which is the right question about a wall and the wrong one
      // about a footing — a carpet, a flower, a torch or a painting is a
      // block you stand THROUGH. Taking one for the floor stood everybody on
      // a carpeted hall a block in the air, which is what the player saw. The
      // height field outdoors has always stepped past them; that is the whole
      // point of PASSABLE, and this is the same rule for the indoor search.
      if (CS.PASSABLE.has(p.blockAtWorld(x * rs, y * rs, z * rs))) continue;
      // The TOP OF THAT CELL, and not r0 + k. The two are the same number for
      // a body already standing on a block top, which everything that walks
      // is — and a body that is NOT gets its own error handed straight back to
      // it, for ever. A guard put on his post half a block high asked what the
      // floor was, was told "wherever you are", and stood there with daylight
      // under his boots until the world was reloaded.
      const g = p.R0 + Math.floor(rs - p.R0) + 1;
      // A FENCE IS NOT A FLOOR — indoors either.
      //
      // groundAt has said so about the height field since the pens were
      // built, and floorNear never did. Everything `buried` reads its footing
      // through THIS one — see groundAt — so a rail was a step up of exactly
      // one block to anything standing on a floor the height field cannot
      // describe: the stock on the upper storeys of the city's byre climbed
      // the rail that was keeping it in, walked into the stairwell and went
      // down it, a floor a minute. Stepping OFF a fence is still a step down
      // and still allowed, exactly as it is up there.
      if (g > r0 + 0.05
        && CS.fencelike(p.blockAtWorld(x * rs, y * rs, z * rs))) return null;
      // ...and a flower is not a ceiling either, for the same reason: asking
      // solidAtWorld made a cell with a bloom or a torch on it unstandable,
      // so a villager treated his own flower bed as a wall.
      if (headBlocked(p, x, y, z, g + 0.5)) return null;
      if (headBlocked(p, x, y, z, g + 1.5)) return null;
      return g;
    }
    return null;
  }

  // Slide `dist` blocks along `dir`, but only onto ground we could step up
  // onto. Returns false if something was in the way.
  tryMove(dir, dist) {
    const feetR = this.pos.length();
    _v.copy(this.pos).addScaledVector(dir, dist).setLength(feetR);
    const nx = _v.x / feetR, ny = _v.y / feetR, nz = _v.z / feetR;
    // A flier has no footing to test: it goes where it is pointed, and the
    // only thing that can stop it is rock. Without this a bee crossing a
    // hedge asked whether it could STAND on the hedge and turned back.
    if (this.flies) {
      const p = this.planet;
      if (!p.solidAtWorld(_v.x, _v.y, _v.z)) { this.pos.copy(_v); return true; }
      // Blocked at this height — so go OVER it. A flier that turned round at
      // a wall the way a walker does is a flier in name only: one bee in four
      // spent a whole minute pinned against a hedge two blocks from the
      // flowers it was trying to reach. Two rungs is enough for anything a
      // meadow puts in the way, and failing both still refuses the move, so
      // a bee in a cave cannot swim through the rock.
      for (const lift of [0.7, 1.5]) {
        _v.setLength(feetR + lift);
        if (p.solidAtWorld(_v.x, _v.y, _v.z)) continue;
        this.pos.copy(_v);
        return true;
      }
      return false;
    }
    const ground = this.groundAt(nx, ny, nz);
    // A WALL IS A WALL, for everybody, always. This is where a sleeper whose
    // walk home had stalled used to be let through whatever penned him in,
    // and after him the café, the privy, the load on its way home and the
    // war party: a body carried through masonry at its own height, which is
    // the thing the player saw from the street and asked to have stopped.
    // The walks that needed it find a way now (see navTo, and pathfind.js),
    // and what is left for open country is to CLIMB — see `scramble`.
    if (ground === null) {                   // a wall, not a floor
      // ...UNLESS HE IS NOT LEAVING THE COLUMN HE IS IN. A man sat on a
      // throne under a shelf, or on the pan under a privy's low ceiling, is
      // on a spot the floor search will not call a floor — one cell of air
      // over a seat is no footing — so every step, including the first half
      // of the one that gets him OFF it, was refused: a chief could not
      // leave his own chair except through the wall. Moving about inside a
      // cell he already stands in passes through nothing.
      const a = CS.cellFromDir(nx, ny, nz, _nc);
      const f2 = a[0], u2 = CS.cellIdx(a[1]), v2 = CS.cellIdx(a[2]);
      const b = CS.cellFromDir(this.pos.x / feetR, this.pos.y / feetR,
        this.pos.z / feetR, _nc);
      if (f2 !== b[0] || u2 !== CS.cellIdx(b[1]) || v2 !== CS.cellIdx(b[2])) return false;
      this.pos.copy(_v);
      return true;
    }
    // `stepUp` rather than the constant: a goat takes a step nearly twice as
    // tall as anything else, and that one number is what lets it leave a
    // valley by the crags instead of walking round the mountain.
    if (ground - feetR > this.stepUp) {
      // SCRAMBLING. A man with a long way to go and no way round — a war
      // party under a bank, a woodcutter in a hollow with seventy logs on his
      // back — goes UP it, hand over hand, on the outside of the rock: he
      // rises where he stands until the top is a step away and then takes
      // the step. A bank, never a building: anything taller than SCRAMBLE.up
      // is still a wall, and so is anything with a roof over it (the floor
      // search answered null above).
      //
      // ...AND `climbs` IS THE SAME HANDS ON A TALLER FACE, for a man whose
      // route has said there is no way at all (see walkTo). Villages stand
      // on levelled pads; a worker walks off the edge of one after a tree
      // and the edge is a wall to him from below — measured: two of a
      // village's eight sleepers stood all night nine blocks under their own
      // beds. Up to SCRAMBLE.bank of NATURAL ground and nothing else, and
      // never into water: that part stays the long march's own.
      const gap = ground - feetR;
      const bank = this.climbs && gap <= SCRAMBLE.bank
        && GROUND_BLOCKS.has(this.planet.blockAtWorld(nx * (ground - 0.5),
          ny * (ground - 0.5), nz * (ground - 0.5)));
      if (!bank && (!this.scramble || gap > SCRAMBLE.up)) return false;
      this.climbTo = ground - 0.95;
      this.climbHold = false;
      return true;
    }
    // The shore is a wall. Height alone never stopped anyone walking into the
    // sea — the bed slopes DOWN, so the step-up test above always passed and
    // villagers strolled in, sank under full gravity and carried on working
    // along the bottom.
    //
    // The second half of this matters as much as the first: refuse the step
    // only when the destination is wet and here is NOT. Anything that somehow
    // starts off in water — spawned there, shoved there, or left standing in
    // a lake a player dug around it — can still move, and so can still walk
    // itself back out. Refusing on the destination alone would strand it
    // there for good.
    if (this.avoidsWater && !this.scramble && this.wetAt(nx, ny, nz)) {
      const r = this.pos.length();
      if (!this.wetAt(this.pos.x / r, this.pos.y / r, this.pos.z / r)) {
        return false;
      }
    }
    this.pos.copy(_v);
    return true;
  }

  update(dt, ctx) {
    this._dtDrawn = dt;   // for the far tier's 15Hz pose clock — see syncMesh
    if (this.dead) return;
    this.up.copy(this.pos).normalize();
    this.projectHeading();
    this.clock += dt;
    this.think -= dt;
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.swingT > 0) this.swingT -= dt;
    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.stagger > 0) this.stagger -= dt;
    // the red fades, and the body goes back onto the SHARED materials when it
    // does — so a herd that was shot at once still draws as one species
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) {
        this.flashT = 0;
        tintOwn(this.ownMats, 0);
        wearOwn(this.ownMats, false);
      } else {
        tintOwn(this.ownMats, (this.flashT / HURT_TUNING.flash) * HURT_TUNING.tint);
      }
    }

    // Wool growing back on a shorn sheep. When the count runs out the body is
    // repainted, so the fleece coming back is something you can watch happen
    // to the animal rather than a flag flipping in a bag.
    if (this.woolIn > 0 && (this.woolIn -= dt) <= 0) {
      this.woolIn = 0;
      this.sheared = false;
      this.reskin();
    }

    // Comb filling back up in a hive. The same shape as the fleece: a hive
    // that has been robbed has nothing in it for a while, and then it has
    // something in it again. Without the wait a village on `take the honey`
    // would empty a meadow into its shop in an afternoon.
    if (this.kind === 'hive') {
      this.comb ??= HIVE_TUNING.comb;
      if (this.comb < HIVE_TUNING.comb
        && (this.combT = (this.combT ?? HIVE_TUNING.fill) - dt) <= 0) {
        this.comb++;
        this.combT = HIVE_TUNING.fill;
      }
    }

    if (this.drawT > 0) this.drawT -= dt;
    if (this.targetT > 0 && (this.targetT -= dt) <= 0) this.target = null;
    // A dead target is not a target. Nothing else clears this, and a pet that
    // kept steering at the corpse of the fox it caught never came home.
    if (this.target && this.target.dead) this.target = null;

    // WHERE THE PLAYER IS, kept on the body rather than reached for from the
    // pose. syncMesh takes no ctx — it is called from the frame loop, from
    // window.tick and from placeMesh alike — and the one pose that wants to
    // know is the chief on his throne. One vector a frame is cheaper than
    // threading a context through every poser in this file.
    if (ctx?.playerPos) {
      (this.watch ??= new THREE.Vector3()).copy(ctx.playerPos);
      this.watching = true;
    } else {
      this.watching = false;
    }

    // A hive is scenery with hit points: no brain, no gait, no ground test.
    // It was placed on the ground once and it is still there.
    if (this.still) { this.syncMesh(false); return; }

    const moving = this.isAnimal
      ? this.thinkAnimal(dt, ctx)
      : this.kind === 'zombie' ? this.thinkZombie(dt, ctx)
        : this.kind === 'skeleton' ? this.thinkSkeleton(dt, ctx)
          : this.golem ? this.thinkGolem(dt, ctx)
            : this.thinkVillager(dt, ctx);
    if (this.dead) return;              // burned off at sunrise

    // knockback runs on top of whatever the brain decided, and through the
    // same ground test, so a shove cannot push anything into a hillside
    if (this.knockT > 0) {
      this.knockT -= dt;
      this.tryMove(this.knockDir, this.knockPush * dt);
    }

    // a staggered creature is not walking anywhere useful for half a second
    // ...and one being carried along a ladder by his route (see navTo) is
    // not stepping anywhere on his own account. The hold is navTo's, renewed
    // every think that walks the route: a brain that has turned to something
    // else lets go of the ladder, or he would hang there for good.
    if (this.navHold && this.navSeen !== this.clock) {
      this.navHold = false;
      this.climbHold = false;
      this.climbTo = null;
    }
    const step = moving && !this.navHold
      ? this.speed * this.speedMul * (this.stagger > 0 ? 0.4 : 1) * dt : 0;
    if (step > 0) {
      // BLOCKED: EDGE AROUND — ONE WAY, AT A RATE.
      //
      // This was a fresh random turn of up to seventy degrees, taken EVERY
      // FRAME the body was held up. Two things were wrong with that and both
      // were measured. It is a random walk, so a man in front of a bank was
      // pointing backwards inside three frames and then ran away from his own
      // tree at working pace until the steering dragged him round to be turned
      // off again — the distance to the job went UP while he was walking at
      // it. And it is a jump rather than a rate, so how hard a hedge shoved
      // somebody depended on the frame rate: sixty turns a second in the game
      // and four in a headless check, which is two different creatures.
      //
      // A rate, held to one side until something gives, is what "edges around"
      // always meant: it rubs along the obstacle instead of jittering in front
      // of it. Faster than the 2.6 rad/s the brains steer at, or the two
      // cancel exactly and he stands in the hedge for ever.
      //
      // And before he turns blind he LOOKS along it — see EDGE_FAN. Turning
      // alone is not enough on a crag: whatever is steering him drags him back
      // into the rock the moment he is clear of it, so he stands there
      // oscillating and the job is written off with an open field two steps to
      // his left.
      if (!this.tryMove(this.heading, step)) {
        this.veerSide ??= Math.random() < 0.5 ? 1 : -1;
        let on = false;
        for (const a of EDGE_FAN) {
          _ed.copy(this.heading).applyAxisAngle(this.up, a * this.veerSide);
          if (!this.tryMove(_ed, step)) continue;
          this.heading.copy(_ed);
          this.projectHeading();
          on = true;
          break;
        }
        if (!on) this.turnBy(VEER_RATE * dt * this.veerSide);
      } else this.veerSide = null;
      this.phase += step * (this.isAnimal ? 5.0
        : (this.kind === 'zombie' ? 2.4 : 3.4));
    }

    // A flier settles onto NOTHING. It eases toward its hover height over the
    // ground beneath it instead — which on a cube-sphere is the same height
    // field everything else stands on, read but not landed on. The easing is
    // what lets a bee cross a wall: it climbs over the course of a second
    // rather than being teleported to the new ground height.
    if (this.flies) {
      const fr = this.pos.length();
      const g = this.planet.surfaceRadiusAtDir(
        this.pos.x / fr, this.pos.y / fr, this.pos.z / fr);
      const want = g + this.hover + Math.sin(this.clock * 1.7 + this.phase) * 0.35;
      this.pos.setLength(fr + (want - fr) * Math.min(1, dt * 2.4));
      this.syncMesh(moving);
      return;
    }

    // ON A LADDER. The ground has no say while somebody is climbing: the floor
    // under them is the one they are LEAVING, and the ground test would pull
    // them straight back down onto it. Only tryBed sets this, and only for the
    // last few blocks between a villager and a bed on the floor above.
    if (this.climbTo !== null) {
      const cr = this.pos.length();
      const gap = this.climbTo - cr;
      const rise = Math.sign(gap)
        * Math.min(Math.abs(gap), SHELTER_TUNING.climb * dt);
      this.pos.setLength(cr + rise);
      this.radialVel = 0;
      // ...and once there, HELD, for as long as they are in the bed. The
      // ground test does not merely fail to find an upstairs bed, it answers
      // with the RIDGE: a bed with one cell of headroom over it is not a floor
      // anything may stand on, so floorNear says nothing and the height field
      // has the last word. A sleeper let go of was carried up through his own
      // roof a step at a time.
      if (Math.abs(this.climbTo - this.pos.length()) < 0.02) {
        this.pos.setLength(this.climbTo);
        if (!this.climbHold) this.climbTo = null;
      }
      this.syncMesh(false);
      return;
    }

    // settle onto the ground
    const r = this.pos.length();
    const ground = this.groundAt(this.pos.x / r, this.pos.y / r, this.pos.z / r)
      ?? r;                             // stood in a wall: stay where you are
    let nr = r;
    // ...and the rise is capped by the same per-creature limit tryMove used,
    // or a goat that was ALLOWED a 2-block step would then be dragged up it
    // 1.15 blocks at a time and spend the difference falling.
    if (ground > r) { nr = Math.min(ground, r + this.stepUp); this.radialVel = 0; }
    else if (ground < r - 0.05) {
      this.radialVel -= GRAVITY * dt;
      nr = Math.max(ground, r + this.radialVel * dt);
      if (nr <= ground) this.radialVel = 0;
    } else this.radialVel = 0;
    this.pos.setLength(nr);

    this.syncMesh(moving);
  }

  // --- villagers ---------------------------------------------------------
  // Walk a circuit of the village and stop to work at each stop. The pauses
  // are what sell it: a village where everyone walks forever reads as a crowd
  // of lost tourists.
  // TO BED. At night everybody in a village goes and lies in one — which is
  // what the bed ledger was always for, and what makes a village at its bed
  // cap something you can SEE rather than a number in a brief: the ones with a
  // bed are in it, and the ones without are stood on a doorstep.
  //
  // Returns true when walking to it, false when in it, and NULL when this is
  // not a question — daytime, or somebody the night does not stop.
  // Out of bed: give it up, and come back DOWN the ladder to the floor it was
  // climbed from. He cannot walk down — a hatch is a four-block drop and
  // floorNear calls that a cliff, which is exactly what stops a villager
  // walking off one — so he descends the way he went up.
  leaveBed(ctx) {
    this.bedNear = null;
    this.bedStall = 0;
    this.bedNone = 0;
    if (!this.bed) return;
    this.clearNav();
    ctx.freeBed?.(this);
    this.bed = null;
    this.laid = null;
    this.bedIn = false;               // tomorrow night starts at the door again
    this.climbHold = false;
    this.climbTo = this.bedFrom;      // null for anybody who slept downstairs
    this.bedFrom = null;
  }

  tryBed(dt, ctx) {
    const T = SHELTER_TUNING;
    // The hour where the person is STANDING — a village on the far side of the
    // planet keeps its own evening — and the light only as a fallback for
    // anything that has no clock to ask.
    const hour = ctx.hourAt?.(this);
    const elev = ctx.sunUpAt?.(this);
    // THE CLOCK AND THE SUN, BOTH. Bed is nine o'clock — the player's hour
    // — but not while it is still light, so a summer village near the caps
    // waits for the dark; and morning is six at the earliest, but not while
    // it is still dark, so a winter one lies in till the sun is up. Where
    // the sun never crosses the horizon at all, the clock alone; with no
    // clock to ask, the light alone.
    const late = hour == null ? null : (hour >= T.abed || hour < T.wake);
    let night;
    if (late == null) night = ctx.daylight !== undefined && ctx.daylight < T.night;
    else if (elev == null) night = late;
    else if (this.bed) night = !(!late && elev >= T.dawn);   // up: morning AND light
    else night = late && elev < T.dusk;                       // down: late AND dark
    if (!night) { this.leaveBed(ctx); return null; }
    if (!this.bed && (this.bedLook = (this.bedLook ?? 0) - dt) <= 0) {
      this.bedLook = T.claimEvery;
      this.bed = ctx.claimBed?.(this) ?? null;
    }
    if (!this.bed) return null;        // no bed for them: the doorstep it is
    const arc = arcBetween(this.up, this.bed.dir, this.pos.length());
    // ONCE HE IS DOWN HE IS DOWN. The spot he lies on is a body's length
    // back from the cell the bed is counted at, and `inBed` is measured to
    // that cell — so a long body (a chief, or anybody once the hat-and-crown
    // arithmetic was done properly) lay further from it than the walk-in
    // threshold, and every think got him up to walk a step toward his own
    // pillow before being laid back where he was. `laid` is the bed he was
    // squared up to (see below); it stops the re-measure until he has been
    // knocked clear of the bed altogether — a cell past the walk-in
    // threshold, which no body is long enough to reach lying down — and
    // then he walks back like anybody else rather than being snapped there.
    if (this.laid === this.bed && arc > T.inBed + 1) this.laid = null;
    if (arc > T.inBed && this.laid !== this.bed) {
      // QUICK, AND BY THE DOOR. Bedtime is the one walk in the game that has
      // to arrive: a villager stood at a fence all night is the bug the
      // player sees from a window. It used to arrive by walking through the
      // wall once it had stalled; now it is a route — round the fence, in at
      // the door, up the ladder to a bed on the floor above — and a bed
      // there is truly no way to (walled in, a door bricked up) is given
      // back after a while so that somebody else can try for it, and he
      // stands on a doorstep, which is what a village does with people it
      // has no bed for.
      this.speedMul = 1.5;
      this.fetch = null;
      this.chore = null;
      const way = this.navTo(this.bed.dir, dt, ctx, { reach: 1, anyH: true });
      if (way === 'none') {
        if ((this.bedNone = (this.bedNone ?? 0) + dt) > 20) {
          this.bedNone = 0;
          this.bedLook = T.claimEvery * 5;
          ctx.freeBed?.(this);
          this.bed = null;
          this.clearNav();
          return null;
        }
        // no way round: straight at it, and up any bank in the way
        this.climbs = true;
        this.steerTowards(this.bed.dir, dt, 3);
        this.state = 'walk';
        return true;
      }
      this.bedNone = 0;
      this.climbs = false;
      if (way !== 'there') {
        this.state = 'walk';
        ctx.openDoor?.(this);            // your own front door is still a door
        return true;
      }
      // beside it: the rest is lying down
    }
    // THE LAST OF THE WAY IS UP. A bed on the floor above is a bed up a
    // ladder, and nothing in this game climbs one — floorNear looks a step up
    // and a short drop, and a villager who read a four-block drop as walkable
    // would walk off a cliff. So a man standing at the foot of his own bed
    // climbs the rest of the way to it, which is what the ladder in the room
    // with him is for. Without this the barracks' six upper billets were beds
    // nobody could get into: the man walked to the door and stood there all
    // night, and the village slept six short of its own bed count.
    const bedR = (this.planet.R0 ?? 0) + this.bed.h + 1;
    const climbing = Math.abs(bedR - this.pos.length()) > 0.1;
    if (climbing && this.bedFrom === null) this.bedFrom = this.pos.length();
    this.climbTo = bedR;
    this.climbHold = true;      // and held there till morning — see update()
    this.state = climbing ? 'walk' : 'sleep';
    this.think = climbing ? 0.2 : 4;
    // SQUARE TO THE BED. He arrived from wherever the room's door happens to
    // stand, which has nothing to do with which end the pillow is on — so
    // once he is down, both his footing and the way he is facing are
    // overwritten from the bed's own pivot and along (see bedAxis, main.js)
    // rather than left as whatever the walk in left them. Without this a
    // sleeper lay however he was last facing on the way to the bed: head
    // under the headboard as often as on the pillow.
    if (!climbing) {
      this.pos.copy(this.bed.pivot).setLength(bedR);
      this.heading.copy(this.bed.along).negate();
      this.laid = this.bed;
    }
    return false;               // on a ladder or in a bed: walking nowhere
  }

  // SAT ON A FIXTURE — a chair, a bench, a toilet — square to it. The cell is
  // a solid block to the ground test, so his feet are on top of it and the
  // seated pose (see poseVillager) drops him onto the seat; the footing and
  // the facing are overwritten from the fixture's own cell and the cell in
  // front of it, for the reason the bed gives: he arrived from wherever the
  // door happened to be.
  sitOn(dir, h, look) {
    this.settleAt(dir, (this.planet.R0 ?? 0) + h + 1);
    if (look) {
      this.heading.copy(look).sub(dir);
      this.projectHeading();
    }
    this.state = 'sit';
    this.seated = true;
  }

  // THE WAY THERE. Every walk that has to ARRIVE — home to a bed, in to a
  // seat, to the privy and back out of its door, to the church, to a post,
  // round the village, out to a tree and home with the timber — follows a
  // route found over the cells a body can stand in (js/pathfind.js): round
  // the wall, through the door, up the ladder. It replaced the one answer
  // this file had for a wall it could not steer round, which was to pass
  // through it.
  //
  // Answers what became of the step:
  //   'go'     walking the route (or, with no search to spare this frame,
  //            straight at the goal the way everything used to)
  //   'there'  as near as the route goes — on the cell, or beside a goal
  //            that is a thing (`reach: 1`) and not a place to stand
  //   'none'   there is no way from here. The caller decides what a man who
  //            cannot get there does instead; what he does NOT do is go on
  //            pushing at the wall.
  //   'far'    the goal is over the horizon of this face: plain steering
  //
  // `opts.h` is the cell his feet should end in when the caller knows it (a
  // seat's, a queue's); left out, it is the floor of that column nearest
  // his own height. `anyH` is for a goal that may be on another storey.
  navTo(goal, dt, ctx, opts = {}) {
    if (this.navHold) { this.climbHold = false; this.climbTo = null; }
    this.navHold = false;
    this.navSeen = this.clock;
    if (CS.FLAT || this.flies) { this.steerTowards(goal, dt, 3); return 'far'; }
    const P = this.planet;
    const r = this.pos.length();
    const c = CS.cellFromDir(this.up.x, this.up.y, this.up.z, _nc);
    const f = c[0];
    const su = CS.cellIdx(c[1]), sv = CS.cellIdx(c[2]);
    // A GOAL OVER THE HILL IS WALKED TOWARD IN LEGS. A search is a bounded
    // thing, and a village a hundred and fifty blocks off is not in it — so
    // he looks for a way to a point one stride along the line to it, walks
    // that, and looks again from there. It is also what carries a march
    // across the seam between two faces of the planet: the stride is always
    // near, whatever face the goal is on.
    const far = arcBetween(this.up, goal, r) > NAV.leg;
    let aimAt = goal;
    if (far) {
      _nt.copy(goal).addScaledVector(this.up, -goal.dot(this.up));
      if (_nt.lengthSq() < 1e-10) { this.steerTowards(goal, dt, 3); return 'far'; }
      _nt.normalize();
      const a = NAV.stride / r;
      aimAt = _nl.copy(this.up).multiplyScalar(Math.cos(a))
        .addScaledVector(_nt, Math.sin(a));
    }
    const g = cellOnFace(f, aimAt.x, aimAt.y, aimAt.z, _ng);
    if (!g) { this.steerTowards(goal, dt, 3); return 'far'; }
    let gu = Math.floor(g[0]), gv = Math.floor(g[1]);
    const gh = far ? null : (opts.h ?? null);
    const reach = far ? 3 : (opts.reach ?? 0);
    // THE SAME ERRAND, OR A NEW ONE? A goal that has moved a step — a deer
    // being hunted, a second look at which sapling to plant — is the same
    // errand, and the route in hand is still most of the way to it: he keeps
    // walking it and asks again on `cool`, never more than once or twice a
    // second. Measured before this: a planter whose spot was recomputed every
    // frame searched seventeen times in four seconds, and route-finding was
    // forty per cent of the frame.
    let n = this.nav;
    const same = n && n.f === f && n.gh === (opts.h ?? null)
      && n.reach === (opts.reach ?? 0);
    const drift = same ? arcBetween(goal, n.goal, r) : Infinity;
    if (!same || drift > 24) {
      n = this.nav = { f, goal: (n?.goal ?? new THREE.Vector3()).copy(goal),
        gh: opts.h ?? null, reach: opts.reach ?? 0, path: null, i: 0,
        wait: Math.max(0, n?.wait ?? 0), cool: Math.max(0, n?.cool ?? 0),
        fails: 0, jams: 0, stuck: 0, redo: false,
        near: Infinity, none: false, partial: false, done: null };
    } else if (drift > 0.6) {
      n.goal.copy(goal);
      n.done = null;
      n.redo = true;
    }
    n.wait -= dt;
    n.cool -= dt;
    if (n.redo && n.cool <= 0) { n.redo = false; n.path = null; n.none = false; n.wait = 0; }
    const sh = Math.round(r - CS.R0);
    if (n.done) {
      // still where the route ended? then he is still there
      if (Math.abs(n.done[0] - su) <= 1 && Math.abs(n.done[1] - sv) <= 1
        && Math.abs(n.done[2] - sh) <= 1) return 'there';
      n.done = null;
    }
    if (!n.path) {
      if (n.wait > 0 || n.cool > 0) {
        if (n.none) return 'none';
        this.steerTowards(goal, dt, 3);
        return 'go';
      }
      n.cool = 0.7;
      let th = gh;
      if (th == null && !opts.anyH) th = floorAt(P, f, gu, gv, sh);
      const res = findPath(P, f, { u: su, v: sv, h: sh }, { u: gu, v: gv, h: th }, {
        reach, max: n.fails || n.jams ? NAV.big : NAV.each,
        wade: this.scramble || !this.avoidsWater,
      });
      if (res === undefined) {             // the frame's searches are spent
        if (n.none) return 'none';
        this.steerTowards(goal, dt, 3);
        return 'go';
      }
      if (res === null) {
        n.none = true;
        n.fails++;
        n.wait = 1.5 + Math.min(6, n.fails * 1.5);
        return 'none';
      }
      n.none = false;
      n.path = res.path;
      n.partial = res.partial || far;      // a leg ends in another search
      n.i = 0;
      n.near = Infinity;
      n.stuck = 0;
      if (!res.path.length) {
        n.path = null;
        if (far) { n.wait = 1; this.steerTowards(goal, dt, 3); return 'go'; }
        n.done = [su, sv, sh];
        return 'there';
      }
    }
    const path = n.path;
    let wp = path[n.i];
    const prev = n.i > 0 ? path[n.i - 1] : null;
    const aim = () => {
      const d = CS.dirFromCell(f, wp.u + 0.5, wp.v + 0.5, _nd);
      _nw.set(d[0], d[1], d[2]);
      return arcBetween(this.up, _nw, r);
    };
    let d = aim();
    // ON A LADDER — or stepping on or off the top of one, over the hatch.
    // The ground has no say there (see climbTo in update): the route was
    // found through open cells with rungs in them, so he is carried along
    // it, held at the route's own height, and handed back to the ground
    // test on the first floor he reaches.
    const rung = wp.lad || prev?.lad;
    if (rung) {
      const wantR = CS.R0 + wp.h;
      this.navHold = true;
      this.climbTo = wantR;
      this.climbHold = true;
      if (d > 0.05) {
        const stepLen = Math.min(d, 1.6 * dt);
        _nw.addScaledVector(this.up, -_nw.dot(this.up));
        if (_nw.lengthSq() > 1e-9) {
          _nw.normalize();
          this.heading.copy(_nw);
          this.pos.addScaledVector(_nw, stepLen).setLength(r);
        }
      }
      if (d <= 0.12 && Math.abs(r - wantR) < 0.08) {
        n.i++;
        if (!wp.lad || n.i >= path.length) {
          this.climbHold = false;
          this.climbTo = null;
        }
        if (n.i >= path.length) {
          n.path = null;
          if (n.partial) { n.wait = 0; return 'go'; }
          n.done = [wp.u, wp.v, wp.h];
          return 'there';
        }
      }
      return 'go';
    }
    if (d < 0.38) {
      n.i++;
      n.near = Infinity;
      n.stuck = 0;
      n.jams = 0;
      if (n.i >= path.length) {
        n.path = null;
        if (n.partial) { n.wait = 0; this.steerTowards(goal, dt, 3); return 'go'; }
        n.done = [wp.u, wp.v, wp.h];
        return 'there';
      }
      wp = path[n.i];
      d = aim();
    }
    // knocked off it, or fallen: the route was for somewhere he is not
    if (Math.abs(sh - wp.h) > 3 || d > 4) {
      n.path = null;
      n.wait = 0.1;
      this.steerTowards(goal, dt, 3);
      return 'go';
    }
    if (d < n.near - 0.04) {
      n.near = d;
      n.stuck = 0;
    } else if ((n.stuck += dt) > 1.6) {
      // something the search did not see — a door that would not open,
      // somebody stood in the way, a block laid since. Ask again; and a
      // route that keeps failing under his feet is no route.
      n.path = null;
      n.wait = 0.15;
      if (++n.jams >= 4) {
        n.jams = 0;
        n.none = true;
        n.fails++;
        n.wait = 4;
        return 'none';
      }
      return 'go';
    }
    if (wp.door || path[n.i + 1]?.door) ctx?.openDoor?.(this);
    this.steerTowards(_nw, dt, opts.rate ?? 9);
    return 'go';
  }

  // The same thing for a caller who only wants to WALK there and has its own
  // idea of when it has arrived: a route while there is one, and plain
  // steering for the last step or when no route was found — which is what
  // every one of these walks did before, less the wall.
  walkTo(goal, dt, ctx, opts) {
    const way = this.navTo(goal, dt, ctx, opts);
    if (way === 'there' || way === 'none') {
      this.steerTowards(goal, dt, 3);
      ctx?.openDoor?.(this);
    }
    // no way round is a reason to go UP: a bank of natural ground between
    // him and where he is going is climbed (see `climbs` in tryMove)
    this.climbs = way === 'none';
    return way;
  }

  // The route is forgotten: he has arrived, or has something else to do.
  // (`clearGhost` is the name every caller knew this by, from when the thing
  // being cleared was the licence to walk through a wall.)
  clearNav() {
    this.nav = null;
    this.scramble = false;
    this.climbs = false;
    if (this.navHold) {
      this.navHold = false;
      this.climbHold = false;
      this.climbTo = null;
    }
  }

  clearGhost() { this.clearNav(); }

  // Put him on a spot at a given height. A walk that ghosted in over the
  // roof arrives above the room, and a snap through the tiles is a man who
  // teleported; the ladder's easing (see climbTo in update) brings him down
  // through them at a climbing pace instead, and only the last half block
  // is snapped, which is the same step a stair takes.
  settleAt(dir, wantR) {
    const r = this.pos.length();
    if (Math.abs(r - wantR) > 0.5) {
      this.pos.copy(dir).setLength(r);
      this.climbTo = wantR;
      this.climbHold = false;
    } else {
      this.pos.copy(dir).setLength(wantR);
    }
  }

  // The smoke, on the draw's own clock — see CAFE_TUNING and the smoking arm
  // in poseVillager, which reads the same phase so the wisps leave the face
  // as the hand comes down. A picture only: nothing here reaches the world.
  smoke(dt, ctx) {
    const C = CAFE_TUNING;
    const ph = this.clock % C.period;
    if (ph < C.draw || ph > C.draw + C.exhale) return;
    if ((this.puffCd = (this.puffCd ?? 0) - dt) > 0) return;
    this.puffCd = C.puffEvery;
    if (ctx.playerPos && ctx.playerPos.distanceTo(this.pos) > C.seen) return;
    if (!this.mesh?.parent) return;
    // the mouth: a little above the feet-on-the-chair height once the seated
    // pose has dropped him, and a hand's width forward of the face
    _v2.copy(this.pos).addScaledVector(this.up, 0.32)
      .addScaledVector(this.heading, 0.28);
    burstFX(this.mesh.parent, _v2, 1, {
      color: 'smoke', dir: this.up, bias: 1.6, speed: 0.55,
      size: 0.10 + Math.random() * 0.05, life: 1.5, gravity: -0.25,
    });
  }

  // THE SMALLEST ROOM. A countdown of his own, six hours long, and when it
  // runs out main.js is asked for the nearest free toilet (see looFor). The
  // walk is the walk home to a bed — the door, then the seat — and he sits
  // there for a few seconds and comes back to whatever he was doing, because
  // this returns null and the rest of the brain carries on. Null is also what
  // the countdown answers while it is still running, which is nearly always.
  tryLoo(dt, ctx) {
    const L = LOO_TUNING;
    // OUT OF THE DOOR AGAIN. The walk IN may ghost through the wall when it
    // stalls; nothing walked him OUT — off the pan he was an ordinary walker
    // in a five-by-four hut with one door and two cells of headroom, and the
    // ordinary steering never found the door. Measured: in four simulated
    // minutes the chief, the shopkeeper, the barman and five soldiers of one
    // village were all standing in its privy, and in another world all three
    // woodcutters were, so no timber came in, no planks were made and no
    // house was ever marked out. So the visit ends on the doorstep: walked
    // there with the same ghost the walk in has, and set down there if he
    // still has not made it when `out` runs out.
    if (this.looOut) {
      const o = this.looOut;
      const rr = this.pos.length();
      const a = arcBetween(this.up, o.dir, rr);
      o.t += dt;
      // already well away — the bell, the bed or a march took him: done
      if (a > 6) {
        if (this.looExit) { ctx.freeExit?.(this); this.looExit = null; }
        this.looOut = null; this.clearGhost(); return null;
      }
      if (a < 0.6 || o.t > L.out) {
        // out of the door — or out of time: the pan is the next man's now.
        // He is left where he WALKED to. This used to set him down on the
        // step whatever was between him and it, which was the last yard of
        // the walk through the wall.
        if (this.looExit) { ctx.freeExit?.(this); this.looExit = null; }
        this.looOut = null;
        this.clearGhost();
        this.speedMul = 1;
        return null;
      }
      // out by the door, which is a route like any other: round the pan,
      // through the leaf, onto the step
      this.state = 'walk';
      this.speedMul = 1.2;
      this.fetch = null;
      this.chore = null;
      this.target = null;
      const way = this.walkTo(o.dir, dt, ctx,
        { h: Math.round(o.r - (this.planet.R0 ?? 0)) });
      // no way out is no reason to stand in there holding the door shut on
      // the next man: the visit is over, and the hut's own rule (privyExit)
      // will ask him again
      if (way === 'none' && o.t > 4) o.t = L.out;
      return true;
    }
    // ...AND NOBODY STANDS IN THE PRIVY WHO IS NOT ON THE PAN. A queue that
    // drifted in, a man passing through on his way somewhere: every couple
    // of seconds, anybody not on a visit who finds himself inside a privy hut
    // is walked out of the door (see privyExit in main.js).
    if (!this.loo && (this.privyLook = (this.privyLook ?? 0) - dt) <= 0) {
      this.privyLook = 2;
      const out = ctx.privyExit?.(this);
      if (out) {
        this.looOut = { dir: out.dir, t: 0, r: (this.planet.R0 ?? 0) + out.h };
        return true;
      }
    }
    // a soldier with something to kill puts it off
    if (this.job === 'soldier'
      && this.nearestZombie(this.pos.length(), SOLDIER_TUNING.alertArc)) {
      if (this.loo) this.leaveLoo(ctx, L.retry);
      return null;
    }
    if (!this.loo) {
      if (this.looClock == null) {
        this.looClock = L.every * (0.15 + 0.85 * Math.random());
      }
      if ((this.looClock -= dt) > 0) return null;
      const loo = ctx.loo?.(this) ?? null;
      // nothing free and the line already as long as a line gets: back to
      // the day, and round again in a while (not all of them at once)
      if (!loo) { this.looClock = L.retry * (0.6 + 0.8 * Math.random()); return null; }
      this.loo = loo;
      this.looT = null;
      this.looAsk = 0;
      this.looWait = 0;
      this.looWalk = 0;
      this.looNone = 0;
      this.clearNav();
    }
    // IN THE QUEUE. main.js gave him a place in a line outside an occupied
    // door (see looFor there); the only thing that changes it is somebody
    // coming out, so he asks again on a short clock. Asking must not cost him
    // his place — looFor looks his index up before it appends — and it is the
    // same call that hands him the pan the moment one frees, which is what
    // makes the queue move rather than merely exist.
    if (this.loo.wait) {
      this.looWait = (this.looWait ?? 0) + dt;
      if (this.looWait > L.patience) { this.leaveLoo(ctx, L.retry); return null; }
      if ((this.looAsk = (this.looAsk ?? 0) - dt) <= 0) {
        this.looAsk = L.ask;
        const again = ctx.loo?.(this) ?? null;
        if (!again) { this.leaveLoo(ctx, L.retry); return null; }
        // his turn, or a different door: either way the walk starts over
        if (!again.wait || again.key !== this.loo.key) {
          this.looT = null;
          this.looWalk = 0;
          this.clearNav();
        }
        this.loo = again;
      }
    }
    const rr = this.pos.length();
    const arc = arcBetween(this.up, this.loo.dir, rr);
    // HE IS ONLY ON IT IF HE IS ACTUALLY THERE. `looT` says he sat down; it
    // does not say he is still sitting. Everything above tryLoo in
    // thinkVillager — the bed at dusk, the bell, a march — takes a man away
    // mid-visit with the pan still booked in his name, and the branch at the
    // bottom of this method then put him BACK on it from wherever he had got
    // to, every frame it ran, for as long as the world lasted. That is the
    // man who cannot leave the toilet: he was never stuck, he was being
    // carried back into it. Away from the pan, the visit is simply over.
    if (this.looT != null && arc > 2.5) { this.leaveLoo(ctx, L.retry); return null; }
    // ONLY THE HOLDER GOES IN, AND ONLY THE HOLDER SITS DOWN. A man walking
    // to a pan that is no longer booked in his name — lost on the clock,
    // taken by somebody nearer, freed and re-claimed — asks again, which
    // either hands it back, puts him at the back of the line, or (the line
    // full) sends him back to his day. Checked on the queue's own clock on
    // the way in, and always at the moment he would sit.
    if (this.looT == null) {
      // THE WALK IN IS A ROUTE: to the door, through it, and up to the cell
      // IN FRONT of the pan — or, with the pan somebody else's, to his place
      // in the line outside. It used to be a straight line at the pan with
      // the door as one waypoint, and when that dithered he was passed
      // through the wall of the hut; the last few steps always were.
      const waiting = !!this.loo.wait;
      const goal = waiting ? this.loo.dir : (this.loo.look ?? this.loo.dir);
      const way = this.navTo(goal, dt, ctx, { h: this.loo.h });
      // a place in the line he cannot quite reach is still a place: he
      // waits where he has got to
      const here = way === 'there' || (waiting && way === 'none');
      if (!waiting && ctx.looHeld
        && ((this.looAsk = (this.looAsk ?? 0) - dt) <= 0 || here)) {
        this.looAsk = L.ask;
        if (!ctx.looHeld(this)) {
          const again = ctx.loo?.(this) ?? null;
          if (!again) { this.leaveLoo(ctx, L.retry); return null; }
          this.loo = again;
          this.clearNav();
          return true;                     // to the line, or the other pan
        }
      }
      if (!here) {
        // NO WAY IN — a pan walled up, a hut with no door: he does not
        // stand pushing at it. Given up, and asked again later.
        if (way === 'none') {
          if ((this.looNone = (this.looNone ?? 0) + dt) > 4) {
            this.leaveLoo(ctx, L.retry);
            return null;
          }
          this.state = 'work';
          return false;
        }
        this.looNone = 0;
        if ((this.looWalk = (this.looWalk ?? 0) + dt) > L.giveUp * 2) {
          this.leaveLoo(ctx, L.retry);
          return null;
        }
        this.state = 'walk';
        this.speedMul = L.hurry;
        this.fetch = null;
        this.chore = null;
        this.target = null;
        ctx.openDoor?.(this);
        return true;
      }
      // ...and there he stands, in the line, facing the door he is waiting
      // on. NOT sat down: the pan is somebody else's for another few
      // seconds, and a man sitting in the street outside a privy is a man
      // who has misunderstood the arrangement.
      if (waiting) {
        if (way === 'there') {
          this.settleAt(this.loo.dir, (this.planet.R0 ?? 0) + this.loo.h);
        }
        if (this.loo.look) {
          this.heading.copy(this.loo.look).sub(this.loo.dir);
          this.projectHeading();
        }
        this.state = 'work';
        this.speedMul = 1;
        this.think = 2;
        this.fetch = null;
        this.target = null;
        return false;
      }
    }
    // on it
    if (this.looT == null) this.clearGhost();
    this.looT = (this.looT ?? L.stay) - dt;
    this.sitOn(this.loo.dir, this.loo.h, this.loo.look);
    // ...AND HELD THERE, the bed's rule. A sitter's feet are on TOP of the
    // pan, and the privy has two cells of headroom over its floor — which is
    // one cell over the pan, and floorNear will not call one cell a footing.
    // Left to the ground test he was handed to the height field, whose
    // answer inside a building is the ridge of the roof: everybody sent to
    // the privy ended up standing on the cistern with his head in the
    // tiles. The hold is what keeps a sleeper in an upstairs bed for the
    // same reason, and it is released by leaveLoo — onto the floor in front
    // of the pan, never onto the pan.
    this.climbTo = (this.planet.R0 ?? 0) + this.loo.h + 1;
    this.climbHold = true;
    this.speedMul = 1;
    this.think = 2;
    if (this.looT <= 0) this.leaveLoo(ctx, L.every);
    return false;
  }

  leaveLoo(ctx, next) {
    // OFF THE PAN FIRST, onto the floor in front of it, and only then let
    // go of the hold — see the hold in tryLoo. Released where he sat, the
    // ground test looked at a cell with no headroom, found nothing, and the
    // roof had him. `looT` says he was actually on it and not stood in the
    // queue outside, whose spot is ordinary floor.
    if (this.loo && this.looT != null) {
      // ...and only if he is still THERE. Stepping a man off a pan he is
      // fifty blocks from is a teleport, not a dismount — see the guard in
      // tryLoo, which is what sends most of these here.
      const near = arcBetween(this.up, this.loo.dir, this.pos.length()) < 3;
      if (near) {
        const at = this.loo.look ?? this.loo.dir;
        this.pos.copy(at).setLength((this.planet.R0 ?? 0) + this.loo.h);
        this.up.copy(this.pos).normalize();
        // ...and then out of the door (see the top of tryLoo) — to the
        // doorstep OUTSIDE it, never `via`, which is the step inside
        if (this.loo.out) {
          this.looOut = { dir: this.loo.out.clone(), t: 0,
            r: (this.planet.R0 ?? 0) + this.loo.h };
        }
      }
      this.climbHold = false;
      this.climbTo = null;
      this.seated = false;
      this.state = 'work';           // standing, till the next think
    }
    // ...and out of the line as well as off the pan. freeLoo does both: a man
    // left in a queue he has walked away from is a place nobody can have.
    // Walking OUT, he keeps the booking until he is through the door (see
    // looExit in looFor): one person in the hut at a time.
    const exitKey = this.looOut && this.loo ? this.loo.key : null;
    ctx.freeLoo?.(this, exitKey);
    this.looExit = exitKey;
    this.loo = null;
    this.looT = null;
    this.looAsk = 0;
    this.looWait = 0;
    this.looWalk = 0;
    this.looNone = 0;
    // a visit cut short is owed, and comes round again soon; never all of
    // a turned-away line at the same moment
    this.looClock = next === LOO_TUNING.retry
      ? next * (0.6 + 0.8 * Math.random()) : next;
    this.clearNav();
  }

  // --- the envoy -----------------------------------------------------------
  //
  // Four legs and a clock. `out` is the country between here and there, `hall`
  // is the last dozen blocks to the throne, `speak` is standing in front of it
  // saying the thing, and `home` is the whole walk again backwards. Every leg
  // is the same two lines — steer at the goal, watch whether the gap is
  // closing — and the only difference between them is what the goal is and how
  // long his patience lasts.
  //
  // main.js is told at each turn (`ctx.envoy`) because main.js owns everything
  // an errand actually CHANGES: the news is read off the chronicle there, and
  // what he brings back is written down there. This file walks him and nothing
  // else, which is the same split the trades are on.
  thinkEnvoy(dt, ctx) {
    const q = this.errand;
    const T = ENVOY_TUNING;
    const r = this.pos.length();
    // A man on the road is not in a bed and is not going back to one. His
    // errand is minutes long and the night is hours long, so an envoy who
    // turned in at dusk would still be on the road at the next muster — and a
    // muster is the only thing that would ever send another.
    if (this.bed) this.leaveBed(ctx);
    this.court = null;
    q.t += dt;
    if (q.t > T.limit) {
      return this.endErrand(ctx, `gave the road up short of ${q.name}`);
    }

    // STANDING AND SAYING IT. The one leg with nowhere to walk to.
    if (q.leg === 'speak') {
      // He faces the chief rather than the door: a herald delivering a
      // message to the back of his own head is not one.
      this.steerTowards(q.hall ?? q.to, dt, 3.0);
      this.state = 'work';
      this.speedMul = 1;
      this.think = 2;
      if ((q.stale += dt) < T.speak) return false;
      this.said = q.back ?? q.why ?? `no word came back from ${q.name}`;
      this.turnHome();
      return true;
    }

    const goal = q.at ?? q.to;
    const arc = arcBetween(this.up, goal, r);

    // ARRIVED at whatever this leg was for.
    if (arc <= q.within) {
      // Out of his own gate and onto the road.
      if (q.leg === 'sally') { this.roadOn(); return true; }
      // ...and in at theirs. The rest of the way is a street and not a
      // country, and reachTown gives it a clock of its own — a man who spent
      // his whole allowance crossing a moor must not then give up in somebody
      // else's doorway.
      if (q.leg === 'out' || q.leg === 'gate') { this.reachTown(ctx); return false; }
      if (q.leg === 'hall') { this.speakUp(ctx); return false; }
      if (q.leg === 'back') { this.legTo('home', q.home, T.home); return true; }
      ctx.envoy?.(this, 'home');
      return this.endErrand(ctx, null);
    }

    // IS THE GAP CLOSING? This one number is the whole of the give-up
    // machinery. Distance to the goal is not enough on its own — a man
    // walking a shoreline is a constant sixty blocks away and perfectly busy
    // — so what is watched is the BEST he has ever managed, and how long it
    // has been since he beat it.
    if (arc < q.best - T.gain) {
      q.best = arc;
      q.stale = 0;
      q.side = 0;                  // moving again: forget what we went round
    } else {
      q.stale += dt;
    }

    const homeward = q.leg === 'home' || q.leg === 'back';
    const patience = homeward ? T.homeStall : T.stall;
    if (q.stale > patience) {
      if (q.leg === 'sally') {
        // He cannot find his own gate. That is not a reason to call the road
        // shut — head for the far village and let the country have its go.
        this.roadOn();
        return true;
      }
      if (q.leg === 'back') {
        // He cannot find his own gate. The green itself, then, on a fresh
        // clock — one more try before anybody is written off as lost.
        this.legTo('home', q.home, T.home);
        return true;
      }
      if (q.leg === 'home') {
        // He cannot get back at all. He stops being an envoy where he stands
        // and becomes what he was — a villager a long way from home, who will
        // walk at his own village's stops for the rest of the world. That is
        // not a good outcome and it is not meant to be; it is an honest one,
        // and it is never a body frozen in a bay.
        ctx.envoy?.(this, 'lost');
        return this.endErrand(ctx, `lost on the way back from ${q.name}`);
      }
      // ...and the same mercy on the last twenty blocks of the road. A
      // settlement with no wall and no hall — and this world has two — is a
      // handful of roofs on whatever ground would take them, and the ground
      // that would not is usually the water right beside it. A man who has
      // walked a hundred and ten blocks and is held up on the far bank of a
      // creek has arrived at the village by any reading that matters.
      if (q.leg === 'out' && arc <= T.near * 2) {
        q.why = `said it on the edge of ${q.name} — I could not get closer`;
        this.speakUp(ctx);
        this.said = q.why;
        return false;
      }
      if (q.leg === 'gate' || q.leg === 'hall') {
        // HE IS ALREADY THERE. A gate, a street and a hall floor are three
        // more obstacles after a day's walk, and turning a man back from the
        // last of them would throw the whole journey away over three blocks.
        // So he says it where he is standing. It is a worse delivery and the
        // record says exactly how much worse.
        q.why = q.leg === 'gate'
          ? `said it at the gate of ${q.name} — I could not get in`
          : `said it in the street at ${q.name} — I could not get to the hall`;
        this.speakUp(ctx);
        this.said = q.why;
        return false;
      }
      q.why = `could not get through to ${q.name}`;
      ctx.envoy?.(this, 'gaveup');
      this.said = `${q.why} — turning back`;
      this.turnHome();
      return true;
    }

    // GOING ROUND. The bearing, cast off while a detour is running.
    // steerTowards only ever uses the tangential part of what it is given, so
    // a rotated tangent IS a direction to walk in.
    _ev.copy(goal).addScaledVector(this.up, -goal.dot(this.up));
    if (_ev.lengthSq() > 1e-8) {
      _ev.normalize();
      // CASTING ABOUT. One timer, counting down through zero: positive is a
      // detour running, negative is the straight run between detours. He has
      // to be pointed at the goal again in between, or a detour is just a man
      // walking away from where he is going.
      q.castT -= dt;
      if (q.castT <= -T.straight) {
        if (q.stale > T.cast) {
          // AND THE OTHER WAY NEXT TIME. Holding one side until he is moving
          // again sounded right and was wrong: `stale` never falls while he
          // is stuck, so a man who guessed wrong at a headland guessed wrong
          // for the whole of his patience and walked steadily further from
          // the village he was sent to. Left, right, wider left, wider right
          // is a search; one side held is a mistake with a clock on it.
          q.side = q.side ? -q.side : (Math.random() < 0.5 ? 1 : -1);
          q.castT = T.castFor;
        } else {
          q.castT = 0;              // walking fine: nothing to go round
        }
      }
      // ...and the longer he has been stuck the wider he casts. Fifty-odd
      // degrees walks him along a bank; ninety walks him BACK along a
      // headland, which is the only thing that gets round a bay he has walked
      // into the mouth of. Starting wide would send him round every hedge he
      // met, and going past a right angle is walking home, so it grows with
      // the stall and stops there.
      if (q.castT > 0 && q.side) {
        _ev.applyAxisAngle(this.up, Math.min(T.wide,
          T.veer * (1 + Math.min(1, q.stale / patience))) * q.side);
      }
      this.steerTowards(_ev, dt, 2.6);
    }
    this.state = 'walk';
    this.speedMul = T.speed;
    ctx.openDoor?.(this);            // a hall's arch has no leaf; a gate does
    return true;
  }

  // Set the next leg: what he is walking at, how near counts as there, and a
  // fresh give-up clock for it. EVERY leg change comes through here, so no leg
  // can start with the last one's patience already spent.
  legTo(leg, at, within) {
    const q = this.errand;
    q.leg = leg;
    q.at = at ? at.clone().normalize() : null;
    q.within = within;
    q.best = Infinity;
    q.stale = 0;
    q.side = 0;
    q.castT = 0;
  }

  // Onto the open road: their gate if they have one, their green if they do
  // not. The one leg of an errand that is measured in a hundred blocks.
  roadOn() {
    const q = this.errand;
    this.legTo('out', q.road ?? q.to,
      q.road ? ENVOY_TUNING.atGate : ENVOY_TUNING.near);
  }

  // Inside the walls: the hall if the settlement has a throne, and otherwise
  // the green, which is where you would look for whoever runs a place that has
  // not built one.
  reachTown(ctx) {
    const q = this.errand;
    if (q.hall) this.legTo('hall', q.hall, ENVOY_TUNING.atChief);
    else this.speakUp(ctx);
  }

  // Say it. What he is told in return is main.js's business — it reads the far
  // village's own chronicle, so what he carries home is a fact somebody could
  // have walked there and counted, which is the rule the priest and the
  // almanac are held to.
  speakUp(ctx) {
    const q = this.errand;
    q.leg = 'speak';
    q.stale = 0;
    q.back = ctx.envoy?.(this, 'arrived') ?? null;
    this.said = q.news ? `${q.name}, hear it: ${q.news}` : `word for ${q.name}`;
    this.state = 'work';
    this.speedMul = 1;
  }

  // Turn for home — by his own village's nearest gate, for the same reason he
  // went in by theirs.
  turnHome() {
    const q = this.errand;
    const gate = this.bestGate(q.homeGates, q.home);
    if (gate) this.legTo('back', gate, ENVOY_TUNING.atGate);
    else this.legTo('home', q.home, ENVOY_TUNING.home);
  }

  // The gate of a village that is ON THE WAY to somewhere, or null when it has
  // none.
  //
  // A WALLED SETTLEMENT IS ENTERED AT A GATE. Every village on this planet has
  // a palisade with four of them, and a palisade is a fence — `groundAt`
  // answers "wall" for a fence on purpose, which is what stops a worker
  // standing on the rail. So a man steering straight at the green from outside
  // walks into the paling and stays there, and the same thing happened to him
  // coming home: half of the first run's envoys were written off as lost
  // within sight of their own fountain.
  //
  // ON THE WAY, and not merely nearest. The nearest gate to a man standing on
  // his own green is whichever one he happens to be next to, and going out of
  // that one and then turning for a village on the far side walks him straight
  // back into the wall he had just come through — which is exactly what
  // Wellmoor's envoy did, for the whole of his patience, eleven paces from an
  // open gate. The sum of the two legs is what a gate is worth.
  bestGate(gates, toward) {
    if (!gates?.length) return null;
    let best = null, bestD = Infinity;
    for (const g of gates) {
      const d = (1 - this.up.dot(g)) + (toward ? (1 - g.dot(toward)) : 0);
      if (d < bestD) { bestD = d; best = g; }
    }
    return best;
  }


  // Off the errand, whatever ended it. He goes back to the village round —
  // `follow` with no owner is exactly the plain villager brain — so a man
  // whose errand failed is still a man walking somewhere.
  endErrand(ctx, why) {
    // What he tells the first person who asks. The news he was given beats the
    // reason he has none — and a man who turned back is NOT allowed to say
    // "back from Bramoor" as though he had been there, which is what the first
    // version of this line did.
    const q = this.errand;
    if (q) this.said = why ?? q.back ?? q.why ?? `back from ${q.name}`;
    this.errand = null;
    this.order = 'follow';
    this.post = null;
    this.fetch = null;
    this.chore = null;
    this.state = 'work';
    this.speedMul = 1;
    this.think = 3;
    return false;
  }

  thinkVillager(dt, ctx) {
    // Sat on something, and smoking — set again below by whichever branch
    // puts him on a seat this frame, read by poseVillager. `atCafe` is read
    // by work.js, which otherwise steers a working villager at his job.
    this.seated = false;
    this.smoking = false;
    this.atCafe = false;
    // THE ERRAND BEATS EVERYTHING. Before the bed, before the bell, before the
    // trades: a man carrying word to another chief is not at home to any of
    // them, and every one of those branches is anchored to a village he is
    // currently two hundred blocks from.
    if (this.errand) return this.thinkEnvoy(dt, ctx);

    // ...AND SO DOES A MARCH, for exactly the same reason. A raid is minutes
    // long and the night is hours long: a war party that turned in at dusk
    // would still be asleep in its own barracks when its clock ran out. It
    // sits beside the errand because it IS the errand — the same journey with
    // a spear instead of a message.
    if (this.war) return this.thinkRaider(dt, ctx);

    // STRUCK, OR FRIGHTENED BY A SHOT: he runs — away from it, fast, for a
    // few seconds — and nothing else he was doing matters until it wears off.
    if (this.scared > 0) {
      this.scared -= dt;
      if (this.scared > 0 && this.scareDir) {
        this.leaveBed?.(ctx);
        this.state = 'walk';
        this.speedMul = TEMPER_TUNING.run;
        this.steerTowards(this.scareDir, dt, 3.2);
        if (Math.random() < dt * 1.5) this.randomTurn(0.5);
        return true;
      }
      this.speedMul = 1;
    }

    // THE GUARD'S TEMPER. A grudge beats everything but the march: a man you
    // have just hit does not finish his round first. One blow owed is paid
    // and forgotten the moment it lands; two and he fights until the memory
    // runs out or you are down. A ready guard — one who heard a shot — comes
    // to within watching distance, weapon up, and waits.
    if (this.job === 'soldier' && (this.grudge || this.readyT > 0)) {
      const w = ctx.wanted;
      const g = this.grudge;
      if (g) {
        g.t -= dt;
        if (g.t <= 0 || !w || w.dead || (g.hits < 2 && this.landed)) {
          this.grudge = null;
          this.landed = false;
          this.speedMul = 1;
        } else {
          this.leaveBed?.(ctx);
          this.speedMul = SOLDIER_TUNING.chaseMul;
          return this.engage(w, SOLDIER_ARMS[this.arm] ?? SOLDIER_ARMS.sword, dt,
            this.pos.length());
        }
      }
      if (this.readyT > 0 && this.readyAt) {
        this.readyT -= dt;
        // he watches the player if the player is there, the spot otherwise
        const at = w && !w.dead ? w.pos : this.readyAt;
        const r = this.pos.length();
        _tgt.copy(at).normalize();
        const arc = arcBetween(this.up, _tgt, r);
        this.leaveBed?.(ctx);
        this.steerTowards(_tgt, dt, 2.6);
        if (arc > TEMPER_TUNING.watchAt && arc < TEMPER_TUNING.hear * 1.5) {
          this.state = 'walk';
          this.speedMul = 1.3;
          return true;
        }
        this.state = 'work';
        this.speedMul = 1;
        return false;
      }
    }

    // NIGHT COMES FIRST, before the trades and before the round. The chief's
    // orders are for the DAY: a village whose woodcutters work through the
    // dark is not a village, it is a factory. A hired hand answers to you and
    // works whatever hours you keep them; a soldier stands the watch, which is
    // the whole point of a soldier; and the chief sits in his hall.
    // A soldier on the watch is the one villager the dark does not send home;
    // one off duty goes to bed in the barracks with everybody else.
    // ...and a garrison whose village has an outlaw in it does not go to bed
    // at all. Half the guard sleeping through a break-in is the difference
    // between a village that defends itself and a village with a night shift.
    // ...and neither does one whose village has a war party in its fields.
    const roused = this.job === 'soldier'
      && ((this.village?.outlaw ?? 0) > 0 || (this.village?.besieged ?? 0) > 0);
    // ...and neither the man at the counter nor the man who holds the peace.
    // A shopkeeper who claims a bed across the village walks toward it all
    // night and never arrives — his post pulls him back at every step — so
    // the shop stood empty and its keeper paced the green until dawn. He
    // sleeps behind his counter, where somebody looking for him can find him.
    // The constable is up because it is the watch: the dark is when a village
    // needs the person in charge of it awake.
    // ...and neither does a hand posted to a field or a pen: the same rule
    // as the man behind the counter, for the same reason. A farmer who walked
    // off to a bed at dusk is a byre with nobody in it all night and a bed the
    // village's own people cannot have.
    // A HAND YOU HIRED GOES TO THE BED YOU GAVE HIM, and to no other. He runs
    // the same tryBed everybody else does; what is different is the answer
    // claimBed gives him — his assigned bed or nothing at all (see main.js).
    // With nothing assigned he stands on a doorstep at dusk like anybody a
    // settlement has no room for, which is the bed cap made visible.
    //
    // He used to be skipped here entirely, and a bed claimed the night before
    // you took him on stuck to him for ever — `e.bed` is what updateWork reads
    // as "asleep, do not set him to work", so a woodcutter you had paid for
    // stood in the trees and never lifted the axe with nothing on screen
    // saying why. Running tryBed is what clears it again at dawn.
    if (!this.onWatch && !roused && !this.tends
      && this.job !== 'chief'
      && this.job !== 'priest' && this.job !== 'trader'
      && this.job !== 'barkeep' && this.job !== 'constable'
      && !this.elder) {                // the old man sleeps in his chair
      const abed = this.tryBed(dt, ctx);
      if (abed !== null) return abed;
    }
    if (roused) this.leaveBed(ctx);      // ...and out of it, down the ladder

    // THE BELL BEATS EVERYTHING BUT A FIGHT. When a service is called, the
    // whole village walks to it — the chief off his throne, the men off his
    // door, the woodcutter out of the trees — and they hurry, because a
    // service you arrive at after it has finished is not one. main.js decides
    // WHO stands WHERE (see everybody goes to pray); this only walks them
    // there and stands them still when they arrive.
    //
    // ...except for a man with something to kill. A guard who walked past a
    // zombie on his way to church would be a guard who had stopped being one,
    // and the soldier's own foe check sits further down this function than
    // this does — so it is asked here, with the same call and the same range.
    let pray = ctx.pray?.(this);
    if (pray && this.job === 'soldier'
      && this.nearestZombie(this.pos.length(), SOLDIER_TUNING.alertArc)) {
      pray = null;
    }
    if (pray) {
      const rr = this.pos.length();
      if (arcBetween(this.up, pray.dir, rr) > 1.1) {
        this.state = 'walk';
        this.speedMul = pray.hurry ?? 1.8;
        this.fetch = null;
        this.chore = null;
        this.target = null;
        this.walkTo(pray.dir, dt, ctx);
        ctx.openDoor?.(this);        // the church door is still a door
        return true;
      }
      this.state = this.job === 'chief' ? 'sit' : 'work';
      this.speedMul = 1;
      this.think = 3;
      return false;
    }

    // ...AND THEN THE SMALLEST ROOM. After the bell and before every fixed
    // post, because everybody goes — the priest off his altar, the chief off
    // his throne, the man on the shop door — and comes back to it after.
    const loo = this.tryLoo(dt, ctx);
    if (loo !== null) return loo;

    // THE CAFÉ HOUR. The hour before bed, in company: main.js says whether
    // the doors are open and which seat is his (see the café hour there),
    // and this walks him in — two legs, the door and then the seat, exactly
    // the walk home to a bed is — and sits him down. It stands HERE, above
    // the fixed posts and the trades, for the reason the bell does: a man
    // working under his chief's standing order would otherwise never reach
    // it, and dusk is when the doorstep rule further down would send him
    // home instead. It loses to the bed above it, which is what empties the
    // room at bedtime. Not the garrison, the priest or the shopkeeper: a
    // village in the café with nobody on the walls is a village the dark
    // walks into, and a shop and an altar are places you go to find someone.
    const cafe = (this.job !== 'soldier' && this.job !== 'priest'
      && this.job !== 'trader' && this.job !== 'barkeep' && !this.elder
      && !this.onWatch && !this.postedAt)
      ? ctx.cafe?.(this) : null;
    if (cafe) {
      this.atCafe = true;             // work.js leaves him alone — see updateWork
      this.cafeWalk = true;
      const rr = this.pos.length();
      const arc = arcBetween(this.up, cafe.dir, rr);
      // in at the café's own door and between the tables, by a route (see
      // navTo): up to the chair for a seat, onto the cell for a place on
      // the floor. No way in at all, and he stands where he is, talking in
      // the street — he does not come through the wall for his tea.
      const way = (arc > 0.9 || !cafe.seat)
        ? this.navTo(cafe.dir, dt, ctx, { h: cafe.h, reach: cafe.seat ? 1 : 0 })
        : 'there';
      if (way !== 'there') {
        this.speedMul = cafe.hurry ?? 1.3;
        this.fetch = null;
        this.chore = null;
        this.target = null;
        if (way === 'none') { this.state = 'work'; return false; }
        this.state = 'walk';
        ctx.openDoor?.(this);
        return true;
      }
      this.speedMul = 1;
      this.think = 3;
      if (cafe.seat) {
        this.sitOn(cafe.dir, cafe.h, cafe.look);
        this.smoking = !!cafe.pipe && this.sex === 'man';
        if (this.smoking) this.smoke(dt, ctx);
      } else {
        this.settleAt(cafe.dir, (this.planet.R0 ?? 0) + cafe.h);
        this.state = 'work';          // standing about, talking
      }
      return false;
    }
    if (this.cafeWalk) {              // the evening is over: back to the day
      this.cafeWalk = false;
      this.clearNav();
    }

    // THE OLD MAN WITH THE PIPE. He is in the café all day and all night, on
    // the same chair at the same table with the same pipe, and the smoke is
    // what says the café is open before anybody else has walked in. He is
    // an office like the barman — one per room, put back by spawnElders the
    // moment he is gone — and the only thing that gets him off his seat is
    // the six-hourly walk (tryLoo, above), after which he comes back to it.
    // A short think, because smoke() is called from here and a wisp every
    // three seconds is a pipe that has gone out.
    if (this.elder) {
      const seat = this.seatAt;
      this.target = null;
      this.fetch = null;
      this.chore = null;
      if (seat) {
        const arc = arcBetween(this.up, seat.dir, this.pos.length());
        if (arc > 1.1) {
          this.state = 'walk';
          this.speedMul = 0.8;          // seventy years old
          this.walkTo(seat.dir, dt, ctx, { h: seat.h, reach: 1 });
          ctx.openDoor?.(this);
          this.think = 0.3;
          return true;
        }
        this.speedMul = 1;
        this.sitOn(seat.dir, seat.h, seat.look);
        this.smoking = true;
        this.smoke(dt, ctx);
      } else this.state = 'work';
      this.think = 0.3;
      return false;
    }

    // NEITHER DOES THE PRIEST. He is at the altar, facing the door, and that is
    // where he is when you come up the aisle — day or night, because a church
    // you can find him in is the whole reason he is there.
    if (this.job === 'priest') {
      this.state = 'work';
      this.speedMul = 1;
      this.target = null;
      this.fetch = null;
      this.think = 4;
      return false;
    }

    // THE SHOPKEEPER DOES NOT LEAVE THE COUNTER. He is `bound` to it, which
    // pulls him back when he strays far — and "far" was two blocks and a
    // floor, so he spent the evening drifting round his own shop and standing
    // on top of the counter. A shop with somebody wandering about in it is
    // not the same as a shop with somebody BEHIND THE COUNTER, and the second
    // one is what a player walks in looking for.
    //
    // Same shape as the chief on his throne: walk back if genuinely away, and
    // otherwise stand exactly where the generator put him, at the height of
    // the floor he was raised on.
    // ...AND NEITHER DOES THE BARTENDER, on exactly the trader's argument and
    // through exactly the trader's code. The evening is the one hour his room
    // is full: a barman who walked off to take a seat in it would be a bar
    // with nobody behind it at the only time of day it matters, and he does
    // not go to bed for the same reason the shopkeeper does not — his post
    // pulls him back at every step, so he would walk at a bed all night and
    // never reach one.
    if (this.job === 'trader' || this.job === 'barkeep') {
      const post = this.waypoints?.[0];
      this.speedMul = 1;
      this.target = null;
      this.fetch = null;
      if (post && arcBetween(this.up, post, this.pos.length()) > 1.1) {
        this.state = 'walk';
        this.walkTo(post, dt, ctx);
        ctx.openDoor?.(this);
        return true;
      }
      if (post) {
        const rr = this.homeRadius ?? this.pos.length();
        this.pos.copy(post).setLength(rr);
        this.up.copy(this.pos).normalize();
      }
      this.state = 'work';
      this.think = 3;
      return false;
    }

    // NEITHER DOES THE CONSTABLE. He holds the green, which is where somebody
    // looking for the watch would go — and a constable found by walking into
    // him on a lane two fields away is a constable nobody can report anything
    // to. Same shape as the priest: stand still, face the world, be there.
    if (this.job === 'constable') {
      const post = this.waypoints?.[0];
      if (post && arcBetween(this.up, post, this.pos.length()) > 1.2) {
        this.state = 'walk';
        this.speedMul = 1.4;
        this.walkTo(post, dt, ctx);
        ctx.openDoor?.(this);
        return true;
      }
      this.state = 'work';
      this.speedMul = 1;
      this.target = null;
      this.fetch = null;
      this.think = 3;
      return false;
    }

    // THE CHIEF DOES NOT WALK A ROUND. He is sitting in his hall, and that is
    // where he is when you go and look. Without this he falls through to the
    // ordinary village circuit and the throne is a chair nobody uses.
    if (this.job === 'chief') {
      this.speedMul = 1;
      this.target = null;
      this.fetch = null;
      // ...but he has to be able to GET BACK. He leaves the hall twice a day
      // now — see the prayer branch above — and a chief who set off for church
      // and then simply stopped being told to walk would spend the rest of the
      // world standing in the road with his crown on.
      const seat = this.waypoints?.[0];
      if (seat && arcBetween(this.up, seat, this.pos.length()) > 1.5) {
        this.state = 'walk';
        this.walkTo(seat, dt, ctx, { reach: 1 });
        ctx.openDoor?.(this);
        return true;
      }
      this.state = 'sit';
      // ...and ON the chair, not near it. He is the one entity whose position
      // is a fixture rather than a walk, and half a block off the seat reads
      // as a chief who has missed it. Steering alone lands within a block and
      // stops, which was fine while he never left the hall and is not now.
      if (seat) {
        // The radius FIRST. `pos.copy(seat)` makes pos a unit vector, so
        // reading its length afterwards reads 1 — and the chief goes to the
        // centre of the planet, where he is a metre wide, invisible, and
        // apparently always exactly where he is supposed to be.
        // ...at the SEAT'S OWN HEIGHT, which is where he was put and not
        // where he happens to have walked back from. He crosses the hall
        // floor to get home, so his radius on arrival is the boards — and
        // sitting him down at that reads as a chief who has sat on the floor
        // in front of his throne. `homeRadius` is the radius he was raised
        // at, which for a chief is the top of the chair.
        const rr = this.homeRadius ?? this.pos.length();
        this.pos.copy(seat).setLength(rr);
        this.up.copy(this.pos).normalize();
      }
      return false;
    }
    // A villager you have paid answers to you and not to the village round.
    // Same brain as a pet, because they take the same orders — see ORDERS.
    if (this.hired) return this.thinkPet(dt, ctx);
    // ...and so does one working under its own chief. Same brain, because it
    // is the same order out of the same vocabulary — see rule 2 in CLAUDE.md.
    if (this.forVillage && this.order && this.order !== 'follow') {
      return this.thinkPet(dt, ctx);
    }

    // Courting. main.js pairs a man and a woman off against a free bed and
    // hangs the spot on both of them; all this has to do is walk them there
    // and keep them there. It beats the night round and the shelter rule,
    // because going to bed IS the shelter rule, with somebody else in it.
    if (this.court) {
      const r = this.pos.length();
      const arc = arcBetween(this.up, this.court, r);
      if (arc > 1.3) {
        this.state = 'walk';
        this.speedMul = 1.25;
        this.walkTo(this.court, dt, ctx, { reach: 1, anyH: true });
        return true;
      }
      this.speedMul = 1;
      this.state = 'work';
      this.think = 4;
      return false;
    }

    const r = this.pos.length();
    const night = ctx.daylight !== undefined && ctx.daylight < 0.2;

    // A soldier looks for zombies before anything else: the patrol is what
    // they do when nothing needs killing. This is the zombie's own chase
    // pattern pointed the other way — steerTowards, an attack cooldown, and
    // the ordinary damage() path — so there is no new machinery to go wrong.
    if (this.job === 'soldier') {
      const A = SOLDIER_ARMS[this.arm] ?? SOLDIER_ARMS.sword;
      // THE OUTLAW comes before the undead. A man taking your wall apart in
      // front of you is a more urgent problem than a zombie out in the fields,
      // and once a settlement has anything worth taking, this is most of what
      // a garrison is for. ctx.wanted is the player wearing just enough of an
      // entity to be fought — see the peace of the village in main.js — and it
      // is only worth a look while this soldier's OWN settlement is angry: a
      // village you have never wronged goes on ignoring you while the one next
      // door is hunting you through its fields.
      const w = ctx.wanted;
      const outlaw = w && !w.dead && (this.village?.outlaw ?? 0) > 0
        && arcBetween(this.up, w.up, r) < SOLDIER_TUNING.huntArc ? w : null;
      // A WAR PARTY FROM OVER THE HILL comes before either. Another
      // village's soldiers in your fields is the one thing more urgent than
      // a zombie in them, and it is the whole of ring 3 arriving on foot.
      const raider = this.nearestWarFoe(r, WAR.seeArc);
      const foe = raider ?? outlaw ?? this.nearestZombie(r, this.onWatch && night
        ? SOLDIER_TUNING.watchArc : SOLDIER_TUNING.alertArc);
      this.speedMul = foe ? SOLDIER_TUNING.chaseMul : 1;
      if (foe) return this.engage(foe, A, dt, r);
    }

    // Home, in the dark or in the wet. The stop this villager was born on is
    // its own door — populate assigns one per house — so "go home" is simply
    // "go back to the stop you started on and stay there".
    if (this.doorStop === undefined) this.doorStop = this.wp;
    const T = SHELTER_TUNING;
    const wet = (ctx.gloom ?? 0) >= T.gloom;
    // ...and a raid empties the street exactly the way weather does. The
    // people of a village being fought over are not fighters — one order
    // covers every one of them and it is the order they already have: get
    // indoors. What is left outside is the garrison, which is the picture a
    // raid should make.
    const siege = (this.village?.besieged ?? 0) > 0;
    if ((night || wet || siege) && this.job !== 'soldier'
      && this.waypoints && this.waypoints.length) {
      const door = this.waypoints[this.doorStop % this.waypoints.length];
      if (arcBetween(this.up, door, r) > T.atDoor) {
        this.state = 'walk';
        this.walkTo(door, dt, ctx);
        return true;
      }
      // arrived: stand at the door until it clears. The timer is short so
      // they set off again promptly when the sky lifts, rather than serving
      // out a thirty-second sulk on a morning that has already started.
      this.state = 'work';
      this.think = 2;
      return false;
    }


    if (!this.waypoints || !this.waypoints.length) {
      // no village to orbit: the old wander, tethered near the spawn point
      if (this.think <= 0) {
        this.think = 3 + Math.random() * 4;
        this.state = Math.random() < 0.35 ? 'work' : 'walk';
        this.randomTurn();
      }
      if (arcBetween(this.up, this.home, r) > 22) {
        this.steerTowards(this.home, dt, 1.8);
      }
      return this.state === 'walk';
    }

    const target = this.waypoints[this.wp];
    if (this.state === 'work') {
      // the timer already ticked in update(); at night they stay put — unless
      // they are the watch, who walk the round all night
      if (this.think <= 0 && (!night || this.onWatch)) this.nextStop();
      return false;
    }

    // THE ROUND IS A ROUTE TOO. It is the commonest walk in the game, and
    // the one that brings a man who slept on the floor above back down his
    // ladder in the morning: aimed straight at the next stop from a bedroom,
    // he would pace the boards all day over a hatch he reads as a cliff.
    // A stop nobody can get to is skipped rather than pushed at.
    if (this.walkTo(target, dt, ctx) === 'none'
      && (this.stopNone = (this.stopNone ?? 0) + dt) > 3) {
      this.stopNone = 0;
      this.nextStop();
      return false;
    }
    if (arcBetween(this.up, target, r) < 1.8) {
      this.stopNone = 0;
      this.state = 'work';
      // a soldier STANDS a watch — meaningfully longer than a villager's
      // doorstep errand, which is most of what makes the round read as
      // guarding rather than pacing
      // A watch KEEPS WALKING. Everybody else stands where the dark caught
      // them; a soldier on the night watch does the round, which is the whole
      // difference between a guard and an ornament.
      this.think = this.onWatch
        ? SOLDIER_TUNING.nightPause + Math.random() * SOLDIER_TUNING.pauseVar
        : night ? 30
          : this.job === 'soldier'
            ? SOLDIER_TUNING.pause + Math.random() * SOLDIER_TUNING.pauseVar
            : 3 + Math.random() * 5;
    } else if (this.think <= 0) {
      // never got there: a house wall is probably in the way, so rather than
      // grinding against it forever, head for a different stop
      this.nextStop();
    }
    return true;
  }

  nextStop() {
    this.state = 'walk';
    // mostly move on, occasionally double back: a route, not a carousel.
    // A soldier's round is a round — gate to gate, always the same way —
    // because a guard who wanders back the way he came reads as lost.
    const n = this.waypoints.length;
    const back = this.job !== 'soldier' && Math.random() < 0.25;
    this.wp = (this.wp + (back ? n - 1 : 1)) % n;
    this.think = 18 + Math.random() * 10;   // give-up timer for this leg
  }

  // Nearest live undead within earshot, or null. `_watch` is the entity
  // list tickZombies saw this frame; four zombies is the hard cap, so this
  // scan is a handful of dot products at worst. Skeletons count too — a
  // garrison that walked past one because it was the wrong sort of dead would
  // be a garrison in name only.
  // The nearest thing worth fighting that is NOT on this one's side. Used by
  // the raid order: a raiding party is looking for the other village's people,
  // not for the undead, and "not mine" is the whole of the test — everything
  // owned by the same owner is a comrade.
  // THE MARCH. A soldier sent to war walks to the settlement he was named at,
  // fights whatever of it comes to meet him, and turns for home when the
  // clock runs out — see WAR. It is deliberately the same shape as the
  // envoy's journey (thinkEnvoy): the two are the same trip with a different
  // thing carried, which is the point CLAUDE.md makes about ring 3.
  thinkRaider(dt, ctx) {
    const r = this.pos.length();
    const w = this.war;
    const A = SOLDIER_ARMS[this.arm] ?? SOLDIER_ARMS.sword;
    w.until -= dt;

    // A fight in front of him beats everything, going out or coming back: a
    // party that walked past the garrison to keep an appointment would be a
    // party nobody had to defend against.
    const foe = this.nearestWarFoe(r, WAR.seeArc)
      ?? this.nearestZombie(r, SOLDIER_TUNING.alertArc);
    if (foe) {
      // MEETING THEIR GARRISON IS ARRIVING. A raid that is refereed only on
      // how near the green somebody stood would score a party that was cut
      // down at the gate as a party that never came — and the defenders it
      // fought would disagree. Their soldiers are the village, for this.
      if (foe.village === w.site) w.arrived = true;
      this.speedMul = SOLDIER_TUNING.chaseMul;
      return this.engage(foe, A, dt, r);
    }

    // Time up, or told to come home: walk back and stand down at the gate.
    // main.js takes him off the war when he arrives — it owns the books that
    // have to be settled — so all this does is get him there.
    if (w.until <= 0 || w.recall) {
      if (!w.homing) {                 // a fresh road wants fresh numbers
        w.homing = true; w.best = null; w.stale = 0; w.castT = 0; w.side = 0;
      }
      const arc = this.marchStep(w.homeAt, dt, ctx, w, WAR.march);
      if (arc > WAR.atTarget) return true;
      w.back = true;                 // arrived: main.js settles the rest
      this.state = 'work';
      this.speedMul = 1;
      return false;
    }

    // Otherwise: on to their green, casting round whatever is in the way.
    const arc = this.marchStep(w.at, dt, ctx, w, WAR.march);
    if (arc > WAR.atTarget) return true;
    // Arrived with nothing left to fight: hold the ground he took. A raiding
    // party that wandered off after the last defender fell would never be
    // standing in the village it just beat, which is the only picture of a
    // won raid the player ever gets.
    w.arrived = true;
    this.state = 'work';
    this.speedMul = 1;
    if (this.think <= 0) {
      this.think = 2 + Math.random() * 2;
      this.randomTurn(0.9);
    }
    return false;
  }

  // THE ROAD, for anything that has to cross a COUNTRY rather than a street.
  //
  // This is the envoy's own casting-about (see thinkEnvoy) in a form a war
  // party can use: watch whether the gap to the goal is closing, and when it
  // stops closing, veer to one side and then the other — wider the longer it
  // has been stuck — until it starts closing again. Without it, a marching
  // man walks into the first headland between him and the next village and
  // slides along it until his clock runs out, which is exactly what the
  // first war party did: three soldiers oscillating a hundred blocks out for
  // four minutes and never arriving.
  //
  // `q` is any object that will hold four numbers; the caller owns it, so an
  // errand keeps its own and a war keeps its own. Returns the gap.
  marchStep(goal, dt, ctx, q, speed = 1.25) {
    const T = ENVOY_TUNING;
    const r = this.pos.length();
    const arc = arcBetween(this.up, goal, r);
    if (q.best == null || arc < q.best - T.gain) {
      q.best = arc; q.stale = 0; q.side = 0;
      // moving again: an ordinary walker once more. See the scramble below.
      if (q.scr) { this.scramble = false; q.scr = false; }
    } else {
      q.stale = (q.stale ?? 0) + dt;
      // ...AND WHEN THE ROUTE AND THE CASTING HAVE BOTH FAILED, HE CLIMBS.
      //
      // The route below takes a man round a fence, a copse, a village wall
      // and most of what a country puts in his way, and the veer under it is
      // what he had before there were routes. Neither gets a party past a
      // crater wall or across a bay, and a party held up on one of those
      // spends its whole clock a hundred blocks short of the village it was
      // sent to — which is why so many raids "came to nothing" with no blow
      // struck anywhere.
      //
      // The answer to that used to be to pass THROUGH the bank. Now it is to
      // go over it and to wade: `scramble` lets him haul himself up a bank
      // no taller than three blocks and step into water (see tryMove), and
      // lets his route cross water too. He is on the outside of the ground
      // the whole way, and an ordinary walker again the moment he is closing.
      if (q.stale > T.cast * 6 && !this.scramble) { this.scramble = true; q.scr = true; }
    }
    // BY A ROUTE, a stride at a time (see navTo: a goal over the hill is
    // walked toward in legs). `go` is a man on his way; anything else and the
    // casting below has the heading, as it always did.
    const way = this.navTo(goal, dt, ctx, { reach: 2 });
    if (way === 'go') {
      this.state = 'walk';
      this.speedMul = speed;
      ctx.openDoor?.(this);
      return arc;
    }
    _ev.copy(goal).addScaledVector(this.up, -goal.dot(this.up));
    if (_ev.lengthSq() > 1e-8) {
      _ev.normalize();
      q.castT = (q.castT ?? 0) - dt;
      if (q.castT <= -T.straight) {
        if ((q.stale ?? 0) > T.cast) {
          q.side = q.side ? -q.side : (Math.random() < 0.5 ? 1 : -1);
          q.castT = T.castFor;
        } else {
          q.castT = 0;
        }
      }
      if (q.castT > 0 && q.side) {
        _ev.applyAxisAngle(this.up, Math.min(T.wide,
          T.veer * (1 + Math.min(1, (q.stale ?? 0) / T.stall))) * q.side);
      }
      this.steerTowards(_ev, dt, 2.6);
    }
    this.state = 'walk';
    this.speedMul = speed;
    ctx.openDoor?.(this);
    return arc;
  }

  // ONE FIGHT, wherever it happens. This was the body of the garrison's own
  // branch; a war party needs exactly the same thing pointed at a different
  // enemy, and two copies of a melee would be two copies to get wrong.
  engage(foe, A, dt, r) {
    this.state = 'walk';
    this.steerTowards(foe.up, dt, 3.2);
    const arc = arcBetween(this.up, foe.up, r);
    // The archer holds his ground and shoots. He still carries a knife,
    // so something that closes on him is still a fight and not a mugging.
    if (A.range && arc > A.reach * 1.6) {
      if (arc < A.range && this.attackCd <= 0) {
        this.attackCd = SOLDIER_TUNING.cooldown * 1.8;
        this.drawT = A.draw;
      }
      // A guard's arrow is loosed with `only: undead` on it and would fly
      // straight through the player, so an outlaw is shot at the way a
      // skeleton shoots — the target says which, because the target is
      // the one that knows what it is.
      if (this.drawT > 0 && this.drawT - dt <= 0) {
        if (foe.shootMe) { foe.shootMe(this); this.landed = true; }
        else if (this.shoot) this.shoot(this, foe);
      }
      return arc > A.range * 0.7;      // keep him at his own range
    }
    if (arc < A.reach && this.attackCd <= 0) {
      this.attackCd = A.cooldown;
      this.swingT = SWING_TIME;
      _tgt.copy(foe.pos).sub(this.pos).normalize();
      // The player's health is not an entity's, so he says how he is hit
      // and by whom — which is also what puts the guard on the end of the
      // player's dogs, since combat.js sics them on whoever last swung.
      if (foe.hitMe) { foe.hitMe(this, A.damage); this.landed = true; }
      else foe.damage(A.damage, _tgt);
    }
    // close in, but stop short of standing inside the thing
    return arc > A.reach * 0.6;
  }

  // Whoever is HERE from the other side of a war. A raider looks for the
  // defenders of the village he was sent to; a defender looks for anybody
  // marching on his own. Soldiers weigh heaviest — a raid that walks past
  // the garrison to chase a farmhand is a raid that loses — so a man under
  // arms is seen at twice the distance anybody else is.
  nearestWarFoe(r, arc = WAR.seeArc) {
    // ...off his SIDE and not his village — see sideOf. A hand of the
    // player's may have no village at all, and one that asked for a village
    // walked into somebody else's fields and stood there being hit.
    if (!_watch || !sideOf(this)) return null;
    let found = null, best = Infinity;
    for (const e of _watch) {
      if (e === this || e.dead || !e.up || !atWar(this, e)) continue;
      const a = arcBetween(this.up, e.up, r);
      const weight = e.job === 'soldier' || e.job === 'constable' ? a * 0.5 : a;
      if (a < arc && weight < best) { best = weight; found = e; }
    }
    return found;
  }

  nearestFoe(r, arc = 20) {
    if (!_watch) return null;
    let found = null, best = arc;
    for (const e of _watch) {
      if (e === this || e.dead || !e.up) continue;
      if (e.owner && e.owner === this.owner) continue;   // one of ours
      if (!e.undead && e.kind !== 'villager') continue;
      const a = arcBetween(this.up, e.up, r);
      if (a < best) { best = a; found = e; }
    }
    return found;
  }

  nearestZombie(r, arc = SOLDIER_TUNING.alertArc) {
    if (!_watch) return null;
    let foe = null, best = arc;
    for (const e of _watch) {
      if (e.dead || !e.up || !isFoe(e)) continue;
      const a = arcBetween(this.up, e.up, r);
      if (a < best) { best = a; foe = e; }
    }
    return foe;
  }

  // --- zombies -----------------------------------------------------------
  // Slower than the player by a wide margin, but they never lose interest.
  // The noise term makes them arrive off-line, weaving, instead of tracking
  // you like a missile.
  thinkZombie(dt, ctx) {
    // A bound one does not burn. It stands in a churchyard it was set to
    // guard, or in the dark under one, and neither has a sunrise in it —
    // burning them off would leave the cemetery unguarded at exactly the hour
    // you can see well enough to want to explore it.
    const T0 = ZOMBIE_TUNING;
    if (!this.bound && ctx.daylight > T0.burnLevel) {
      this.burning = (this.burning ?? 0) + dt;
      // Fire off the shoulders and smoke off the top of it, both rising: the
      // whole point of a burn that takes seven seconds is that you can SEE it
      // happening, and one puff of dust at the end is not that.
      this.burnFx = (this.burnFx ?? 0) - dt;
      if (this.burnFx <= 0 && this.mesh) {
        this.burnFx = 0.05;
        const k = this.burning / T0.burnTime;
        // NOT _fv: burstFX writes the velocity into that same scratch, so
        // passing it as the position makes the two the same vector and the
        // particle is born wherever its own velocity points.
        _burnAt.copy(this.pos).addScaledVector(this.up, 0.5 + Math.random() * 1.1);
        _burnAt.x += (Math.random() - 0.5) * 0.55;
        _burnAt.y += (Math.random() - 0.5) * 0.55;
        _burnAt.z += (Math.random() - 0.5) * 0.55;
        burstFX(this.mesh.parent, _burnAt, 1, {
          color: Math.random() < 0.45 ? 'flame' : 'ember',
          dir: this.up, bias: 2.2, speed: 1.6, size: 0.10 + Math.random() * 0.06,
          life: 0.45, gravity: -0.5,
        });
        // ...and the smoke thickens as it goes, so the column says how far
        // through it is without a bar over its head
        if (Math.random() < 0.35 + k * 0.5) {
          burstFX(this.mesh.parent, _burnAt, 1, {
            color: 'smoke', dir: this.up, bias: 3, speed: 1.1,
            size: 0.16 + k * 0.2, life: 1.2 + k * 0.6, gravity: -0.35,
          });
        }
        // and it chars: the same tint the hurt flash uses, held rather than
        // flashed, so the body darkens as the fire takes it
        // wearOwn FIRST. The hurt flash puts a body back on the SHARED
        // materials when it fades, so a tint written without this one is a
        // tint written onto the species and thrown away — which is why the
        // first burning zombie came out exactly the colour of a well one.
        if (!this.ownMats) this.ownMats = ownMaterials(this.mesh);
        wearOwn(this.ownMats, true);
        tintOwn(this.ownMats, Math.min(0.85, 0.25 + k * 0.7));
      }
      if (this.burning >= T0.burnTime) {
        // it topples like anything else, but it went through no damage() so
        // `drops` stays null — burning leaves nothing
        this.die();
        return false;
      }
      // ...and it PANICS. A thing on fire does not shamble.
      this.speedMul = T0.burnRun;
    } else if (this.burning > 0) {
      this.burning = Math.max(0, this.burning - dt * T0.burnCool);
      this.speedMul = 1;
      if (this.burning === 0 && this.ownMats) {
        tintOwn(this.ownMats, 0);
        wearOwn(this.ownMats, false);
      }
    }

    this.noise += dt * this.noiseRate;
    if (this.stumble > 0) { this.stumble -= dt; return false; }

    const r = this.pos.length();

    // OUT OF THE LIGHT. A lamp is a wall: a zombie will not come inside the
    // reach of one, so a lit street is a street they cannot walk down and the
    // coal you burned in the lanterns bought you something.
    //
    // It comes BEFORE the chase, so a player standing under a lamp is a player
    // they mill at the edge of the light for rather than one they walk up to.
    // Nothing about it is a wall in the physics: they simply turn away, which
    // is why they crowd the dark side of a village instead of piling into an
    // invisible barrier.
    const lamp = ctx.litNear?.(this.pos);
    if (lamp) {
      _tgt.copy(this.pos).sub(lamp);
      _tgt.addScaledVector(this.up, -_tgt.dot(this.up));
      if (_tgt.lengthSq() > 1e-8) {
        this.steerTowards(_tgt.normalize(), dt, 3.4);
        return true;
      }
    }
    const toPlayer = _tgt.copy(ctx.playerPos).normalize();
    const arc = arcBetween(toPlayer, this.up, r);
    if (this.bound && this.homeward(dt, r, arc)) return true;

    if (arc < (this.bound ? BOUND_CHASE : ZOMBIE_TUNING.chaseArc)) {
      // great-circle direction to the player, then bent by the shamble noise
      _tgt.addScaledVector(this.up, -toPlayer.dot(this.up));
      if (_tgt.lengthSq() > 1e-8) {
        const wobble = Math.sin(this.noise) * 0.55 + Math.sin(this.noise * 2.3) * 0.2;
        // close in, straighten out — the last few metres should feel decisive
        _tgt.applyAxisAngle(this.up, wobble * Math.min(1, arc / 12));
        this.steerTowards(_tgt, dt, 1.5);
      }
      // reach grows with the body: a thing half again your height should not
      // have to stand on your toes to swing
      if (arc < ZOMBIE_TUNING.reach * this.scale && this.attackCd <= 0) {
        this.attackCd = 1.1;
        if (this.hitPlayer) this.hitPlayer(this);
      }
    } else if (this.think <= 0) {
      this.think = 3 + Math.random() * 4;
      this.randomTurn(1.6);
    }
    // random hitch in the gait, roughly every ten seconds
    if (Math.random() < dt * 0.1) this.stumble = 0.4 + Math.random() * 0.5;
    return true;
  }

  // --- the guard's leash --------------------------------------------------
  //
  // A bound undead belongs to a place. It will come out at you from anywhere
  // in that place, and it will follow you a little way past its edge, but the
  // moment the chase has taken it BOUND_LEASH blocks from where it was raised
  // it turns round and walks back. Without this, one skeleton lured off a
  // churchyard is a churchyard permanently one skeleton short: nothing here
  // respawns, and a guard that wandered to the far side of the planet is a
  // guard nobody will ever meet again.
  //
  // Returns true when it is walking home and the caller should not chase.
  homeward(dt, r, arcToPlayer) {
    const fromHome = arcBetween(this.up, this.home, r);
    if (fromHome > BOUND_LEASH || (fromHome > BOUND_HOME && arcToPlayer > BOUND_CHASE)) {
      this.steerTowards(this.home, dt, 2.2);
      return fromHome > BOUND_HOME * 0.5;
    }
    return false;
  }

  // Is there open air between this creature's chest and a point?
  //
  // Nothing else in this file needs to know: a zombie walks into a wall and
  // edges round it, and a villager's route is a list of places it can already
  // reach. An ARCHER needs it, because a bowman is the first thing here that
  // can act on something it is not standing next to — and without this, the
  // skeletons in a catacomb stood in their own chambers loosing arrows into
  // the partition wall at a player two corridors away, for ever, and never
  // came to find him.
  //
  // Sampled rather than marched, and cached for a quarter of a second: this is
  // a dozen block lookups, and the answer does not change between frames.
  canSee(target, dt) {
    this._seeT = (this._seeT ?? 0) - dt;
    if (this._seeT > 0) return this._sees;
    this._seeT = 0.25;
    const p = this.planet;
    _fv.copy(this.pos).addScaledVector(this.up, this.hitCentre);
    _v2.copy(target).sub(_fv);
    const len = _v2.length();
    const n = Math.min(24, Math.max(2, Math.ceil(len / 1.2)));
    _v2.divideScalar(n);
    this._sees = true;
    for (let i = 1; i < n; i++) {
      _fv.add(_v2);
      if (p.solidAtWorld(_fv.x, _fv.y, _fv.z)) { this._sees = false; break; }
    }
    return this._sees;
  }

  // --- skeletons -----------------------------------------------------------
  //
  // Kiting, from the other side. It opens at range, it will not stand still
  // while you walk up to it, and the arrow is slow enough to dodge — so a
  // fight with one is a fight about DISTANCE, which is the whole point of
  // giving the graveyard a second kind of dead rather than a second zombie.
  //
  // The arrow itself is combat.js's: `shoot` is wired on by combat the way
  // hitPlayer is, and what leaves the string is one of its own projectiles
  // with its own ballistics and its own tracer. Nothing about ballistics
  // lives in this file.
  thinkSkeleton(dt, ctx) {
    const T = SKELETON_TUNING;
    const r = this.pos.length();
    _tgt.copy(ctx.playerPos).normalize();
    const arc = arcBetween(this.up, _tgt, r);
    if (this.bound && this.homeward(dt, r, arc)) return true;

    if (arc > (this.bound ? BOUND_CHASE : T.chase)) {
      // nothing in sight: an idle sentry, turning on the spot now and then
      if (this.think <= 0) {
        this.think = 4 + Math.random() * 5;
        this.randomTurn(2.2);
        this.state = Math.random() < 0.5 ? 'work' : 'walk';
      }
      return this.state === 'walk';
    }

    // face the target whatever else is happening: it aims down its heading
    this.steerTowards(_tgt, dt, 3.4);

    // Nothing to shoot at through a wall. It walks in until it has a line —
    // which underground is most of the time, and is what turns a catacomb
    // from a place where distant bowmen plink at the rock into a place where
    // the dead come and find you.
    _hp.copy(ctx.playerPos).addScaledVector(_tgt, 1.0);   // aim at the chest
    if (arc > T.retreat && !this.canSee(_hp, dt)) return true;

    if (arc < T.retreat) {
      // Too close to shoot. It gives ground — the counter to a bowman is
      // getting inside his bow, and this is what makes that a real move
      // rather than a thing that happens to work.
      _v2.copy(this.up).multiplyScalar(this.up.dot(_tgt)).sub(_tgt);
      if (_v2.lengthSq() > 1e-8) {
        this.fleeDir.copy(_v2.normalize());
        // walking backwards, so it keeps looking at you as it withdraws
        this.tryMove(this.fleeDir, this.speed * 0.75 * dt);
      }
      if (arc < 1.5 && this.attackCd <= 0) {
        this.attackCd = 1.4;                    // a shove with the bow
        if (this.hitPlayer) this.hitPlayer(this);
      }
      this.phase += this.speed * 0.75 * dt * 3.4;
      return false;
    }

    if (arc < T.reach && this.attackCd <= 0) {
      this.attackCd = T.cooldown;
      this.drawT = T.draw;                      // nocking; the arrow follows
    }
    // the arrow leaves at the END of the draw, so the pose and the shot are
    // one action rather than two things that happen at the same moment
    if (this.drawT > 0 && this.drawT - dt <= 0 && this.shoot) this.shoot(this);
    // it closes to its own range and then holds, side-stepping a little
    if (arc > T.reach * 0.8) return true;
    if (this.think <= 0) { this.think = 1.5 + Math.random() * 2; this.randomTurn(0.9); }
    return false;
  }

  // --- animals -----------------------------------------------------------
  // Graze, wander a little, bolt when hit. The grazing is what makes a field
  // look inhabited: animals that only ever walk read as a stampede, and the
  // still ones cost nothing at all beyond the ground lookup.
  thinkAnimal(dt, ctx) {
    const T = ANIMAL_TUNING;

    // Being ridden takes the brain out entirely: the reins say where to go,
    // and nothing about grazing, fleeing or going home applies to an animal
    // with someone on its back.
    if (this.rider) return this.thinkRidden(dt);

    // A bee's whole life is somewhere else in this file — it flies, it works
    // flowers, and it has no interest in the home tether or the grass.
    if (this.kind === 'bee') return this.thinkBee(dt, ctx);

    // An owned animal answers to its owner before anything else, including
    // its own species' temperament: a tamed fox does not bolt from the person
    // holding its lead.
    if (this.tamed) return this.thinkPet(dt, ctx);

    // "dogs do not like foxes." A hunter that has spotted prey is running the
    // same chase a grudge does, at something that is not the player.
    if (this.hunts && this.huntPrey(dt)) return true;

    // A MONSTER hunts you. Not only at night and not only once hit — that is
    // a wolf — but whenever you come inside its sight, day or night, and it
    // keeps coming until the chase has taken it too far from where it lives,
    // when it loses interest and wanders home. A blow does not send it
    // running: it remembers it (`angry`), and sees you from further off for
    // it. It is the wolf's chase with the provocation taken out.
    if (this.monster && ctx.playerPos) {
      const M = MONSTER_TUNING;
      const A = ANIMAL_BODY[this.kind];
      const r = this.pos.length();
      _tgt.copy(ctx.playerPos).normalize();
      const arc = arcBetween(this.up, _tgt, r);
      const fromHome = arcBetween(this.up, this.home, r);
      if (this.angry > 0) this.angry -= dt;
      const sight = this.angry > 0 ? M.sight * 2 : M.sight;
      if (arc < sight && fromHome < M.leash) {
        this.flee = 0;
        this.state = 'walk';
        this.speedMul = Math.max(M.run, M.pace / Math.max(0.2, this.speed));
        this.steerTowards(_tgt, dt, 2.6);
        const reach = A?.reach ?? 1.5;
        if (arc < reach && this.attackCd <= 0) {
          this.attackCd = M.cooldown;
          this.swingT = SWING_TIME;
          if (this.hitPlayer) this.hitPlayer(this);
        }
        return arc > reach * 0.7;      // close in, but not onto your boots
      }
      this.speedMul = 1;
      if (fromHome > M.leash * 0.75) {
        this.state = 'walk';
        this.steerTowards(this.home, dt, 1.8);
        return true;
      }
    }

    // A PERSON stops for you. Inside a few blocks, and not walking anywhere,
    // he turns to face you — which is most of what makes a figure read as
    // somebody rather than as livestock. Hit him and he runs like anything
    // else that has been hit (see damage).
    if (this.person && ctx.playerPos && this.flee <= 0 && this.state !== 'walk') {
      _tgt.copy(ctx.playerPos).normalize();
      if (arcBetween(this.up, _tgt, this.pos.length()) < PERSON_TUNING.greet) {
        this.steerTowards(_tgt, dt, 2.0);
        return false;
      }
    }

    // A fighter with a grudge — hit recently, or crossed at night — is the
    // zombie chase pointed at the same target: steerTowards, a cooldown, and
    // the hitPlayer callback combat.js wires up. By day, unprovoked, it is
    // just another wanderer.
    if (this.fights && !this.monster && ctx.playerPos) {
      if (this.angry > 0) this.angry -= dt;
      const r = this.pos.length();
      _tgt.copy(ctx.playerPos).normalize();
      const arc = arcBetween(this.up, _tgt, r);
      const night = ctx.daylight !== undefined && ctx.daylight < 0.25;
      if ((this.angry > 0 && arc < 55) || (night && arc < 28)) {
        this.flee = 0;
        this.state = 'walk';
        this.speedMul = 1.55;
        this.steerTowards(_tgt, dt, 2.8);
        if (arc < 1.5 && this.attackCd <= 0) {
          this.attackCd = 1.2;
          if (this.hitPlayer) this.hitPlayer(this);
        }
        return arc > 1.1;    // close in, but not into the player's boots
      }
      this.speedMul = 1;
    }

    // The skittish animal treats the player as a predator: inside ten blocks
    // it refreshes a low-grade panic pointed the other way, so it keeps its
    // distance without needing to be hit first.
    if (this.skittish && ctx.playerPos && this.health > 0) {
      const r = this.pos.length();
      _tgt.copy(ctx.playerPos).normalize();
      if (arcBetween(this.up, _tgt, r) < 10) {
        // tangential direction AWAY from the player at our own feet
        _v2.copy(this.up).multiplyScalar(this.up.dot(_tgt)).sub(_tgt);
        if (_v2.lengthSq() > 1e-8) {
          this.fleeDir.copy(_v2.normalize());
          this.flee = Math.max(this.flee, 1.2);
          this.panic = Math.max(this.panic, 0.55);
        }
      }
    }

    if (this.flee > 0) {
      this.flee -= dt;
      this.state = 'walk';
      // Panic is the fright wearing off, floored by how badly hurt it is: an
      // animal on its last hit point never calms down. It is what turns the
      // old constant-speed trot into something that reads as terror — faster,
      // and swerving several times a second instead of once.
      this.panic = Math.max(1 - this.health / Math.max(1, this.maxHealth),
        Math.max(0, this.panic - dt / T.fleeTime));
      const p = this.panic;
      this.speedMul = T.fleeSpeed * (1 + 0.5 * p);
      // keep running the way the hit pushed us, weaving as the panic fades
      this.steerTowards(this.fleeDir, dt, 2.2 + p * 1.6);
      if (Math.random() < dt * (1.5 + 4 * p)) this.randomTurn(0.5 + p * 0.8);
      return true;
    }
    this.speedMul = 1;
    this.panic = 0;

    // DRIVEN. Somebody is walking this one home to a pen — see the farm
    // order. It keeps to the drover's heel: steering at him while he walks,
    // grazing when he stops, and forgetting the whole thing the moment he
    // dies, is paid off, or lets it go. No rope and no teleport — if the
    // drover loses it on a bank, he turns round and it is still coming.
    if (this.drivenBy) {
      const d = this.drivenBy;
      if (d.dead || d.driving !== this) {
        this.drivenBy = null;
      } else {
        const arc = arcBetween(this.up, d.up, this.pos.length());
        if (arc > 2.2) {
          this.state = 'walk';
          this.speedMul = 1.25;
          this.steerTowards(d.up, dt, 2.4);
          return true;
        }
        this.state = 'graze';
        return true;
      }
    }

    if (this.think <= 0) {
      const graze = Math.random() < 0.58;   // more heads down than moving
      // ...but a person or a monster does not put its head in the grass:
      // it stands, and looks about
      this.state = graze ? (this.person || this.monster ? 'idle' : 'graze') : 'walk';
      this.think = graze ? 3 + Math.random() * 6 : 2 + Math.random() * 4;
      if (!graze) this.randomTurn(2.2);
    }
    // a herd that never comes back turns into a thin smear round the planet
    if (arcBetween(this.up, this.home, this.pos.length())
      > (this.wanderArc ?? T.wanderArc)) {
      this.steerTowards(this.home, dt, 1.6);
      this.state = 'walk';
    }

    // A goat's tether is its ALTITUDE, not just its arc. The arc alone was
    // not enough: sixteen blocks of arc on a mountainside is a long way
    // DOWN, and a goat left to the ordinary wander walked off its crag and
    // spent the afternoon in the meadow with the sheep — which is the one
    // thing a goat must not do, since living up there is the whole animal.
    //
    // Uphill is simply "toward home": home is where it was born, and it was
    // born on the summit the siting pass picked. It is the goat's step-up
    // that makes this work rather than merely wish for it — the way back up
    // is over ledges nothing else here can take, which is also why the gate
    // below is the step-up itself and not the kind name: anything that can
    // climb like a goat wants to live like one.
    if (this.stepUp > STEP_UP && this.pos.length() < this.homeRadius - GOAT_DROP) {
      this.steerTowards(this.home, dt, 2.0);
      this.state = 'walk';
      return true;
    }
    return this.state === 'walk';
  }

  // --- the hunt ------------------------------------------------------------
  //
  // "dogs do not like foxes." A dog that can see a fox goes for it, and the
  // fox runs — through the SAME flee state a hit puts it in, rather than a
  // second panic system written for this one case. Everything the fox already
  // does when it bolts from the player (the bound gait, the weaving, the
  // panic decay) therefore happens here for free, and any future predator
  // gets it by putting one word in its species table.
  //
  // Returns true when it is hunting and the caller should not go back to
  // grazing.
  huntPrey(dt) {
    const r = this.pos.length();
    // Re-scan only when there is nothing on the books: a dog re-picking its
    // fox every frame flickers between two of them and reaches neither.
    if (!this.target || this.target.dead
      || arcBetween(this.up, this.target.up, r) > PET_TUNING.huntGiveUp) {
      this.target = this.nearestKind(this.hunts, r, PET_TUNING.huntArc);
      this.targetT = this.target ? 12 : 0;
    }
    const prey = this.target;
    if (!prey) return false;

    const arc = arcBetween(this.up, prey.up, r);
    this.state = 'walk';
    this.speedMul = 1.35;
    this.steerTowards(prey.up, dt, 3.0);

    // Frighten it from a distance. A fox that only ran once it had been
    // bitten would be a fox that never got away, and the chase is the whole
    // point of this — see the flee branch in thinkAnimal, which this is
    // simply reaching over and starting.
    if (arc < PET_TUNING.fleeFrom) prey.spookFrom(this.up);

    if (arc < PET_TUNING.huntReach && this.attackCd <= 0) {
      this.attackCd = PET_TUNING.cooldown;
      this.swingT = SWING_TIME;
      _tgt.copy(prey.pos).sub(this.pos).normalize();
      prey.damage(this.attackDamage ?? 2, _tgt);
      if (prey.dead) { this.target = null; this.targetT = 0; }
    }
    return arc > PET_TUNING.huntReach * 0.7;
  }

  // --- a man's temper -------------------------------------------------------
  //
  // RUN from a point in the world (where the shot came from, or who hit him)
  // for a few seconds. Not a guard — he has his own answer — nor the chief,
  // who fears nothing, nor anybody you have hired: a hand does not bolt from
  // the person paying him.
  startle(from, seconds) {
    if (this.dead || this.kind !== 'villager' || this.job === 'soldier'
      || this.immortal || this.tamed || this.hired || this.war || this.errand) return;
    _v2.copy(from).normalize();
    (this.scareDir ??= new THREE.Vector3())
      .copy(this.up).multiplyScalar(this.up.dot(_v2)).sub(_v2);
    if (this.scareDir.lengthSq() < 1e-8) this.scareDir.copy(this.heading);
    this.scareDir.normalize();
    this.scared = Math.max(this.scared ?? 0, seconds);
  }

  // A GUARD WHO HEARD IT: face it, come to within watching distance with the
  // weapon up, and no further until somebody gives him a reason.
  alarm(at, seconds) {
    if (this.dead || this.job !== 'soldier' || this.war || this.errand || this.tamed) return;
    (this.readyAt ??= new THREE.Vector3()).copy(at);
    this.readyT = Math.max(this.readyT ?? 0, seconds);
  }

  // A GUARD WHO WAS HIT. One blow owed for one blow; a second (or `hits` of
  // them at once, for a guard taking up a fight he watched start) and he
  // fights. Every blow sets the memory going again.
  wrong(hits = 1) {
    if (this.dead || this.job !== 'soldier' || this.tamed) return;
    const g = this.grudge ?? (this.grudge = { hits: 0, t: 0 });
    g.hits += hits;
    g.t = TEMPER_TUNING.memory;
    this.landed = false;
    this.readyT = 0;
  }

  // Bolt away from a direction on the sphere. Pulled out of the skittish
  // branch in thinkAnimal so a dog, a golem or anything else can frighten
  // something without knowing how fleeing works.
  spookFrom(fromUp, seconds = 1.4) {
    if (this.tamed || this.fights || this.still) return;   // a pet holds its ground
    _v2.copy(this.up).multiplyScalar(this.up.dot(fromUp)).sub(fromUp);
    if (_v2.lengthSq() < 1e-8) return;
    this.fleeDir.copy(_v2.normalize());
    this.flee = Math.max(this.flee, seconds);
    this.panic = Math.max(this.panic, 0.7);
    this.state = 'walk';
  }

  // Nearest live entity of a kind within `arc`, out of the list the world
  // last handed tickZombies. Same scan and the same cost as nearestZombie.
  nearestKind(kind, r, arc) {
    if (!_watch) return null;
    let best = arc, found = null;
    for (const e of _watch) {
      if (e === this || e.dead || !e.up || e.kind !== kind) continue;
      const a = arcBetween(this.up, e.up, r);
      if (a < best) { best = a; found = e; }
    }
    return found;
  }

  // --- pets and hired hands --------------------------------------------------
  //
  // Both run on this one brain, because they answer the same orders — see
  // ORDERS. What differs is only what they are good at: a dog hunts and a
  // hired hand can carry, and each of those is one branch below.
  //
  // Every order except `follow` is anchored to a POST — the spot the order was
  // given at. That is the whole difference between "guard" and "guard here",
  // and it is what makes an order something you place rather than something
  // that follows you about.

  // Where this one is meant to be right now: its owner while it is following,
  // its post otherwise. Written into `_hp`, which every branch below steers at.
  anchorDir(owner) {
    if (this.order === 'follow' || !this.post) {
      // no owner and no post is a body with nowhere to be: it holds where it
      // stands rather than steering at undefined
      if (!owner?.pos) { _hp.copy(this.up); return true; }
      _hp.copy(owner.pos).normalize();
      return false;
    }
    _hp.copy(this.post);
    return true;
  }

  // Give an order. `at` is where — the unit direction the thing should hold —
  // and defaults to where it is standing, which is what makes "wait" mean
  // "wait THERE" without the player having to place anything.
  setOrder(id, at = null) {
    if (!ORDER_IDS.has(id)) return false;
    // ANY OTHER WORD RECALLS A MAN ON A MARCH. A war beats every branch below
    // it in thinkVillager — that is what makes a raid survive nightfall — so
    // an order that landed on a raider without this left him marching under
    // a word he was no longer carrying out, for the length of the clock.
    if (this.war && id !== 'raid') { this.war = null; this.speedMul = 1; }
    if (id === 'release' && this.forVillage) {
      // Let go by a chief is not let go by an owner: they simply go back to
      // the village round they were walking before anybody set them working.
      this.forVillage = false;
      // ...and back into his own trade's clothes with it.
      if (this.wearing) { this.wearing = null; this.reskin(); }
      this.order = 'follow';
      this.post = null;
      this.chore = null;
      this.fetch = null;
      this.target = null;
      return true;
    }
    if (id === 'release') {
      this.tamed = false;
      this.hired = false;
      // ...out of the uniform, and out of your book. He is his own again.
      if (this.wearing) { this.wearing = null; this.reskin(); }
      this.title = null;
      this.hid = null;
      this.owner = null;
      this.order = 'follow';
      this.post = null;
      this.target = null;
      return true;
    }
    // `envoy` is the one word in the vocabulary that needs somewhere to GO,
    // and only main.js knows where the villages are. It is refused here on
    // purpose rather than half-set: an entity carrying the order and no errand
    // would fall through to the wild-animal brain and graze.
    if (id === 'envoy' && !this.errand) return false;
    // ...and `raid` is the same word in the same position. A march needs a
    // village to march ON, a home to march back to, a siege clock and a
    // referee, and only main.js has any of them. Set bare it used to mean
    // "walk at the next village and hit whatever comes within twenty
    // blocks" — which killed the farmhands rather than the garrison, and
    // emptied a settlement's book the way nothing else in this game can.
    // See playerRaid in main.js, which is the only door into it now.
    if (id === 'raid' && !this.war) return false;
    this.order = id;
    // A NEW ORDER STARTS WITH A CLEAN SHEET. The status of the last one is
    // about a job he is no longer on, and left standing it reads as the
    // answer to the one you just gave him — see `say` in work.js.
    this.why = 'just told — looking for it';
    this.whyFor = id;
    this.why0 = null;
    this.whyFor0 = null;
    // DRESSED FOR THE JOB. A hand set to guard should look like a guard and a
    // hand set to the fields should look like a farmhand — you manage these
    // people by looking at a village and seeing who is doing what, and a row
    // of identical librarians tells you nothing. ORDER_DRESS is the map, and
    // it names the wardrobes this game already paints (see PALETTE): nothing
    // new was drawn for it, which is why every entry is a job somebody in a
    // village already does.
    //
    // Only a hand you HIRED. A village's own soldier already wears the coat,
    // and putting a uniform on somebody else's farmhand because THEIR chief
    // said "guard" would be dressing a man you do not employ.
    // ...AND SO DOES A VILLAGE'S OWN. A chief who puts three of his people on
    // the timber and two in the fields has made five decisions you cannot see
    // from the street, because the woodcutters are still dressed as whichever
    // trade they were born to — so a librarian in a cream robe planting
    // saplings reads as somebody who has wandered in, and a village at work
    // reads as a crowd milling about.
    //
    // A chief's order is the same kind of thing as yours and gets the same
    // answer. `forVillage` is set before setOrder is called (see landOrders),
    // so it is true by the time this asks.
    if ((this.hired || this.forVillage) && this.kind === 'villager') {
      const want = ORDER_DRESS[id] ?? null;
      if ((this.wearing ?? null) !== want) {
        this.wearing = want;
        this.reskin();
      }
    }
    this.post = id === 'follow' ? null
      : (at ? at.clone().normalize() : this.up.clone());
    // A new order clears the old grudge: told to sit, a dog sits, and does not
    // finish the argument it was having first.
    if (id !== 'attack') this.target = null;
    this.think = 0;
    return true;
  }

  // Point it at something. Used by the `attack` order and by main.js's
  // "everyone, that one" key.
  sic(foe) {
    if (!foe || foe === this || foe.dead) return false;
    this.order = 'attack';
    this.post = this.up.clone();
    this.target = foe;
    this.targetT = PET_TUNING.guardMemory;
    return true;
  }

  thinkPet(dt, ctx) {
    const owner = this.owner;
    // A villager working for its own village has no owner to heel to, and
    // does not need one: every trade is anchored to the POST it was set at,
    // and the only order that wants somebody to walk behind is `follow`.
    const forVillage = !owner && this.forVillage && WORK_ORDERS.has(this.order);
    if ((!owner || !owner.pos) && !forVillage) {
      return this.thinkAnimal_wild(dt, ctx);
    }
    const hand = !!this.hired || forVillage;
    const T = hand ? HIRE_TUNING : PET_TUNING;
    const r = this.pos.length();
    const posted = this.anchorDir(owner);
    const toAnchor = arcBetween(this.up, _hp, r);
    const ord = this.order ?? 'follow';

    // Left behind entirely — a boat, a cliff, a launch pad. Nothing in this
    // game respawns, so one that fell off the world is one you have lost for
    // good; it is put back beside its anchor instead. Only while it is
    // FOLLOWING: something told to wait is meant to be left, and a guard that
    // teleported to you the moment you walked away would be no guard at all.
    //
    // NOBODY IS EVER MOVED TO YOU. There used to be a rescue here: anything
    // following you from more than forty-six blocks off was picked up and put
    // down at your side, on the argument that nothing in this game respawns
    // and a hand behind a cliff is a hand lost for good.
    //
    // It was the wrong trade. What it actually produced was a company that
    // teleports — walk into a village, say heel, and four people who were
    // cutting wood on the far hill are suddenly at your elbow — and a hand
    // who arrives without walking is not somebody you employ, he is a
    // spawn. Somebody a long way off should be a long way off, and should
    // walk. If he cannot get to you, he stays where he is and you go and
    // find him, which is the honest version of the same situation.

    // COURTING. `family` is the one order that is not work and not a post: the
    // two of them have a place to be — the spare bed main.js chose — and
    // everything else about the brain would have them drifting back to the
    // player's heel between frames. main.js owns the pairing, the clock and
    // the child; this is only the walking, which is the one thing it cannot
    // do from outside.
    if (this.famPos) {
      this.state = 'walk';
      this.speedMul = 1;
      this.target = null;
      this.fetch = this.famPos.clone().normalize();
      // ...and STEER at it. This branch used to set the fetch and return
      // 'walking' without ever turning the body, so the pair marched off on
      // whatever heading they last happened to hold — a man called to a bed
      // fifty blocks north walked steadily south saying nothing.
      this.steerTowards(this.fetch, dt, 2.6);
      return arcBetween(this.up, this.fetch, this.pos.length()) > 1.2;
    }

    // SIT. Nothing at all: no fight, no drift, no errand. It is the one order
    // that is genuinely a switch-off, which is exactly what it is for.
    if (ord === 'sit') {
      this.state = 'sit';
      this.speedMul = 1;
      this.target = null;
      return false;
    }

    // A fight, from the grudge or from an explicit order. How far it will
    // carry that fight is the order's business: a guard holds its ground and
    // a dog told to attack goes and does it.
    const foe = this.target;
    if (foe && !foe.dead && foe.up && ord !== 'haul') {
      const arc = arcBetween(this.up, foe.up, r);
      const leash = ord === 'attack' ? (T.leash ?? 34)
        : ord === 'guard' ? (T.alert ?? PET_TUNING.guardArc) * 1.4
          : (T.alert ?? PET_TUNING.guardArc);
      if (arc < leash && toAnchor < leash * 1.5) {
        this.state = 'walk';
        this.speedMul = 1.5;
        this.steerTowards(foe.up, dt, 3.2);
        // A WEAPON IN HIS FIST IS WORTH SOMETHING. main.js writes these three
        // off SOLDIER_ARMS when you hand one over — a spear reaches further
        // and a hammer swings slower — and a hand with nothing falls back on
        // the bare-handed numbers he has always had.
        const reach = this.attackReach ?? T.reach ?? PET_TUNING.huntReach;
        if (arc < reach && this.attackCd <= 0) {
          this.attackCd = this.attackCool ?? T.cooldown ?? PET_TUNING.cooldown;
          this.swingT = SWING_TIME;
          _tgt.copy(foe.pos).sub(this.pos).normalize();
          foe.damage(this.attackDamage ?? T.damage ?? 2, _tgt);
        }
        return arc > reach * 0.7;
      }
      // out of its leash: it lets the thing go and comes back to its post
      if (ord !== 'attack') this.target = null;
    }

    // GUARD picks its own fight. Anything undead within reach of the post is
    // this one's business, which is the difference between guarding a spot
    // and merely standing on it.
    if (ord === 'guard' && !this.target) {
      const seen = this.nearestZombie
        ? this.nearestZombie(r, T.alert ?? 16) : null;
      if (seen) {
        this.target = seen;
        this.targetT = PET_TUNING.guardMemory;
      }
    }

    // THE TRADES. Fetching, felling, farming, cooking, bed-making: every one
    // of them is "go where main.js says and stand there working", because
    // main.js owns the blocks and this file owns the walking. `fetch` is the
    // spot; when it is null there is nothing to do and the branch falls
    // through to standing about at the post, which is exactly right — a
    // woodcutter with no trees left is a person standing in a clearing.
    if (hand && WORK_ORDERS.has(ord)) {
      const want = this.fetch;
      if (want) {
        const arc = arcBetween(this.up, want, r);
        if (arc > 1.0) {
          this.state = 'walk';
          // A MAN ON AN ERRAND WALKS OUT. A villager strolls his own street at
          // 1.45 blocks a second, which is right for a street and wrong for
          // the mile to the treeline and back: at 1.6 the walk was most of the
          // job, and the job is the part worth watching. 2.4 puts a worker at
          // about three and a half blocks a second — still well under the
          // player's six, so you can always catch one up.
          this.speedMul = WORK_PACE;
          // by a route: round the pen, out of the gate, in at the shop door
          // (see navTo). A job is a thing as often as a place — a trunk, a
          // box, a counter — so beside it is there.
          this.walkTo(want, dt, ctx, { reach: 1 });
          return true;
        }
        // arrived: stand and work, facing the job. The `work` state is what
        // drives the trade poses — a woodcutter swings, a cook stoops.
        this.steerTowards(want, dt, 3.0);
        this.state = 'work';
        this.speedMul = 1;
        return false;
      }
    }

    // RAID. The one order that sends somebody a long way off: the post is
    // another village, and everything hostile between here and there is on
    // the way. It gets a leash of its own — a raider that turned back at
    // guard range would never arrive.
    if (ord === 'raid') {
      if (toAnchor > 2.5) {
        this.state = 'walk';
        this.speedMul = 1.35;
        this.steerTowards(_hp, dt, 2.4);
        return true;
      }
      if (!this.target) {
        const foe = this.nearestFoe ? this.nearestFoe(r, 20) : null;
        if (foe) { this.target = foe; this.targetT = PET_TUNING.guardMemory; }
      }
      if (this.think <= 0) {
        this.think = 2 + Math.random() * 2;
        this.randomTurn(1.2);
      }
      return false;
    }

    // HUNT / PATROL. A dog after foxes is the chase it has always run; a hand
    // with no prey walks a beat around the post instead, which is what makes
    // "patrol" read as a person doing a job.
    if (ord === 'hunt') {
      if (this.hunts && toAnchor < (T.leash ?? 34) && this.huntPrey(dt)) {
        return true;
      }
      if (toAnchor > 9) {
        this.state = 'walk';
        this.steerTowards(_hp, dt, 2.2);
        return true;
      }
      if (this.think <= 0) {
        this.think = 2 + Math.random() * 3;
        this.state = Math.random() < 0.6 ? 'walk' : 'work';
        this.randomTurn(1.4);
      }
      return this.state === 'walk';
    }

    // A dog at heel still does not like foxes.
    if (!posted && this.hunts && toAnchor < PET_TUNING.guardArc
      && this.huntPrey(dt)) {
      return true;
    }

    // ...otherwise, go to the anchor and hold there — which is `follow` when
    // the anchor is the owner and `wait` / `attack` when it is the post.
    //
    // The catch-up is scaled by how far behind it is, and the ceiling is high
    // on purpose. A dog trots at 2.1 and the player SPRINTS at 8.5, so a pet
    // on a flat multiplier simply cannot follow anybody: the first version of
    // this held 1.25 and was left forty blocks behind inside six seconds.
    const near = T.followNear ?? PET_TUNING.followNear;
    const far = T.followFar ?? PET_TUNING.followFar;
    this.speedMul = THREE.MathUtils.clamp(
      1 + (toAnchor - near) * 0.5, 1, T.catchUp ?? PET_TUNING.catchUp);
    if (toAnchor > near) {
      this.state = 'walk';
      this.steerTowards(_hp, dt, 2.8);
      this._heeling = true;
      return true;
    }
    if (this._heeling && toAnchor > far) {
      this.steerTowards(_hp, dt, 2.8);
      return true;
    }
    this._heeling = false;
    this.speedMul = 1;
    // At heel it looks at its OWNER and idles — one that grazes with its back
    // to you reads as an animal that has not been tamed at all. Posted, it
    // looks wherever it was left facing, which is what a sentry does.
    if (!posted) {
      _hp.copy(owner.pos).normalize();
      this.steerTowards(_hp, dt, 1.6);
    }
    if (this.think <= 0) {
      this.think = 2 + Math.random() * 3;
      this.state = (!hand && Math.random() < 0.5) ? 'graze' : 'work';
    }
    return false;
  }

  // The ordinary animal brain, for a pet whose owner has gone away. Split out
  // rather than duplicated: an owner that stops existing (a disconnect, a
  // world change) must leave a normal animal behind and not a crash.
  thinkAnimal_wild(dt, ctx) {
    this.tamed = false;
    return this.thinkAnimal(dt, ctx);
  }

  // --- fleece ---------------------------------------------------------------
  //
  // Everything about a sheep's coat, in four short methods. `skin()` is the
  // variant name its body is painted with; `reskin()` rebuilds that body in
  // place; the other two are the two things you can do to a fleece.

  // The variant materialsFor should dress this body in, or '' for the plain
  // species palette. Only the sheep answers with anything.
  skin() {
    if (this.kind === 'sheep') {
      return this.sheared ? 'shorn' : fleeceName(this.fleece);
    }
    // The chief before the sex: his build and his clothes are his office, not
    // his shoulders, and there is exactly one of him in a village.
    if (this.job === 'chief') return 'chief';
    // A woman is the same job in the same clothes, built narrower — see WOMAN
    // and buildBody. Men take the plain palette, which is what every villager
    // in every world built before this one still gets.
    if (this.sex === 'woman') return 'woman';
    return '';
  }

  // Rebuild the body in the palette skin() now asks for, keeping the entity
  // exactly where and how it was. Materials are cached per variant, so this
  // costs geometry and nothing else — which is why a sheep can be shorn, dyed
  // and grown back without anyone counting.
  reskin() {
    if (!this.mesh) return;
    const parent = this.mesh.parent;
    const pos = this.mesh.position.clone();
    const quat = this.mesh.quaternion.clone();
    const scale = this.mesh.scale.clone();
    const vis = this.mesh.visible;
    parent?.remove(this.mesh);
    this.parts = buildBody(this.kind, this.wearing ?? this.job,
      this.arm, this.skin());
    this.mesh = this.parts.group;
    this.rig = this.parts.rig;
    this.lieLength = lyingLength(this.parts) * this.scale;
    this.legs = Object.keys(this.parts)
      .filter((k) => k.startsWith('leg'))
      .map((k) => this.parts[k]);
    // The old body may have been carrying cloned, red-tinted materials from a
    // hit. The new one is on the shared set, so the clone has to go with it or
    // the next fade would write into meshes nothing is drawing.
    this.ownMats = null;
    this.flashT = 0;
    this.mesh.position.copy(pos);
    this.mesh.quaternion.copy(quat);
    this.mesh.scale.copy(scale);
    this.mesh.visible = vis;
    if (this.scale !== 1) this.mesh.scale.setScalar(this.scale);
    parent?.add(this.mesh);
  }

  // Take the fleece off. Returns the item id of the wool, or null if there is
  // nothing to take — a lamb that was shorn this morning, or an animal that is
  // not a sheep at all. main.js owns the shears and the reach; this owns what
  // happens to the animal.
  shear() {
    if (this.kind !== 'sheep' || this.dead || this.sheared) return null;
    const id = DROP_ITEMS[`WOOL_${fleeceName(this.fleece).toUpperCase()}`];
    this.sheared = true;
    this.woolIn = FLEECE_REGROW;
    this.reskin();
    return id ?? null;
  }

  // Dye a live sheep. It keeps the colour for good and every fleece it grows
  // after this one comes off the same animal in the same colour, which is what
  // makes a dyed flock worth keeping rather than a one-off trick.
  dyeFleece(colour) {
    if (this.kind !== 'sheep' || this.dead) return false;
    if (!(colour >= 0) || colour === this.fleece) return false;
    this.fleece = colour;
    if (!this.sheared) this.reskin();
    return true;
  }

  // Put a tool in this one's hands. `arm` decides what is drawn and how hard
  // they hit with it; `tool` is the item id, which work.js reads to know how
  // fast the job goes. The body is rebuilt so you can SEE what they are
  // holding — a woodcutter with an invisible axe is a person waving.
  //
  // Returns the item that came out of their hands, so the caller can put it
  // back in your bag rather than losing it.
  giveTool(itemId, armKind) {
    const had = this.tool ?? null;
    this.tool = itemId ?? null;
    this.arm = (itemId && ANY_ARMS[armKind]) ? armKind : null;
    // An empty fist is worth the bare-handed numbers again, so taking a sword
    // back off somebody actually takes it back off them.
    if (!this.arm) {
      this.attackReach = null;
      this.attackCool = null;
    }
    this.reskin();
    return had;
  }

  // Something attacked this pet's owner. Called by main.js off combat's
  // damage hook, and by damage() when the pet itself is struck.
  avenge(foe) {
    if (!foe || foe === this || foe.dead) return;
    this.target = foe;
    this.targetT = PET_TUNING.guardMemory;
  }

  // --- being ridden ---------------------------------------------------------
  //
  // The rider steers, and that is the whole of it. `reins` is a world-space
  // direction main.js writes each frame off the player's own look and keys;
  // this turns the body toward it at a limited rate so a horse leans into a
  // turn instead of pivoting on the spot, and walks forward when asked.
  //
  // Everything else — the ground settle, the step-up test, the water refusal
  // — is the ordinary update() path below, which is why a ridden horse still
  // cannot walk into the sea or up a cliff.
  thinkRidden(dt) {
    this.flee = 0;
    this.panic = 0;
    this.state = 'walk';
    // A ridden horse moves at RIDE_SPEED, not at its grazing trot: the whole
    // reason to get on one is that it is faster than walking.
    const A = ANIMAL_BODY[this.kind];
    this.speedMul = (A.rideSpeed ?? A.speed) / A.speed;
    if (this.reins.lengthSq() > 1e-8) {
      this.steerTowards(this.reins, dt, RIDE_TUNING.turn);
    }
    return this.reinsGo;
  }

  // --- bees -----------------------------------------------------------------
  //
  // A bee's day is a loop: leave the hive, find a flower, sit on it a moment,
  // find another. It never goes far from the hive it belongs to, which is
  // what makes a hive read as a PLACE rather than as a spawner — the bees
  // around it are visibly the same bees.
  //
  // Stinging is provoked only. A bee that attacked on sight would make a
  // meadow a hazard, and the flowers are the point of the meadow.
  thinkBee(dt, ctx) {
    const r = this.pos.length();

    // Provoked: it goes for the player and stings once. `angry` is set by
    // damage() and by the hive when something disturbs it.
    if (this.angry > 0 && ctx.playerPos) {
      this.angry -= dt;
      _tgt.copy(ctx.playerPos).normalize();
      const arc = arcBetween(this.up, _tgt, r);
      if (arc < 40) {
        this.speedMul = 1.6;
        this.steerTowards(_tgt, dt, 3.4);
        if (arc < 1.4 && this.attackCd <= 0) {
          this.attackCd = 2.2;
          if (this.hitPlayer) this.hitPlayer(this);
          // A bee stings once and is spent. It does not die of it here —
          // that would need a corpse and a drop for something the player may
          // never even see — but it does lose interest completely.
          this.angry = 0;
        }
        return true;
      }
    }
    this.speedMul = 1;

    // Working the flowers. `flowers` is the list the hive gave it at spawn —
    // real block positions, found once, because a per-frame search of the
    // world for petals would cost more than every other animal put together.
    if (this.think <= 0 || !this._bloom) {
      const list = this.flowers;
      if (list && list.length) {
        this._bloom = list[(Math.random() * list.length) | 0];
      }
      this.think = 3 + Math.random() * 4;
    }
    if (this._bloom) {
      _v2.copy(this._bloom).normalize();
      const arc = arcBetween(this.up, _v2, r);
      if (arc > 0.7) {
        this.steerTowards(_v2, dt, 2.0);
        return true;
      }
      // On the flower: hover over it, drifting, until the timer moves it on.
      if (Math.random() < dt * 1.2) this.randomTurn(1.4);
      return Math.random() < 0.4;
    }
    // No flowers were found near this hive: drift about it instead, so the
    // bees are still visibly ITS bees.
    if (this.think <= 0) { this.think = 2 + Math.random() * 3; this.randomTurn(2.4); }
    if (arcBetween(this.up, this.home, r) > 7) this.steerTowards(this.home, dt, 1.8);
    return true;
  }

  // --- the bronze golem -----------------------------------------------------
  //
  // The garrison's brain with the leash of a graveyard guard: it finds the
  // nearest undead, walks it down and hits it very hard, and when there is
  // nothing to kill it goes back to the village it belongs to and stands
  // there. It is deliberately the DUMBEST fighter in the file — no kiting, no
  // ranged attack, no retreat — because what makes it frightening is that it
  // does not stop, and every extra behaviour would give it a way to be
  // distracted from that.
  thinkGolem(dt, ctx) {
    const T = GOLEM_TUNING;
    const r = this.pos.length();
    const foe = this.nearestZombie(r, T.alertArc);

    if (foe) {
      const fromHome = arcBetween(this.up, this.home, r);
      // It will not be lured off its village. A golem walked to the far side
      // of the planet by one zombie is a village with no golem in it, and
      // nothing here respawns.
      if (fromHome < T.leash) {
        this.state = 'walk';
        this.steerTowards(foe.up, dt, 2.0);
        // reach grows with the body, the same rule the zombie uses: a thing
        // this size should not have to stand on your toes to swing
        const reach = T.reach * this.scale;
        const arc = arcBetween(this.up, foe.up, r);
        if (arc < reach && this.attackCd <= 0) {
          this.attackCd = T.cooldown;
          this.swingT = SWING_TIME;
          _tgt.copy(foe.pos).sub(this.pos).normalize();
          foe.damage(T.damage, _tgt);
          // ...and the blow THROWS it. The knockback is most of what a golem
          // is: a zombie that gets up ten blocks away has lost the fight even
          // if it lived through the hit.
          foe.knockPush = T.knockback;
          foe.knockT = HURT_TUNING.knockTime * 1.6;
        }
        return arc > reach * 0.6;
      }
    }

    // Nothing to fight: back to the post, then stand and watch.
    const fromHome = arcBetween(this.up, this.home, r);
    if (fromHome > T.home) {
      this.state = 'walk';
      this.steerTowards(this.home, dt, 1.8);
      return true;
    }
    if (this.think <= 0) {
      this.think = 5 + Math.random() * 6;
      this.state = Math.random() < 0.7 ? 'work' : 'walk';
      if (this.state === 'walk') this.randomTurn(1.8);
    }
    return this.state === 'walk';
  }

  // --- taking a hit -------------------------------------------------------
  //
  //   e.damage(amount, fromDir) -> boolean
  //
  //   amount   number of hit points to remove; <= 0 does nothing.
  //   fromDir  OPTIONAL THREE.Vector3, the UNIT direction the hit was
  //            TRAVELLING in (combat.js passes the projectile velocity,
  //            normalised), so knockback and flight go along +fromDir. Any
  //            other object with .x/.y/.z works; omit it for a hit with no
  //            direction, e.g. fall or fire damage.
  //   returns  true if THIS hit killed it, false otherwise.
  //
  // On death: `dead` is set and `drops` becomes an array of { id, count }
  // with ids from items.js. It is never null after a kill — an empty array
  // means "this species drops nothing", so a caller can do
  // `for (const d of e.drops) ...` without a guard.
  //
  // What a hit now looks like: the body flashes red for HURT_TUNING.flash
  // seconds on its OWN cloned materials (see ownMaterials — an entity that has
  // never been hit still shares the species set), it is shoved along the blow,
  // its gait breaks for half a second, it bleeds, and a wounded animal bolts
  // in a panic rather than ambling off. Dying topples it sideways and sinks it
  // into the ground over HURT_TUNING.death seconds.
  damage(amount, fromDir = null) {
    if (this.dead || !(amount > 0)) return false;
    // NOTHING KILLS THE CHIEF. Not the player, not a zombie, not a raid from
    // the next valley. He is the thing the game is about — a village whose
    // chief can be cut down by a wandering skeleton is a village that stops
    // being anybody's plan halfway through an afternoon — so the blow lands,
    // he flinches, and that is all it ever does.
    if (this.immortal) {
      this.hurtT = HURT_TIME;
      if (!this.ownMats) this.ownMats = ownMaterials(this.mesh);
      tintOwn(this.ownMats, HURT_TUNING.tint);
      this.flashT = HURT_TUNING.flash;
      return false;
    }
    this.health -= amount;
    this.hurtT = HURT_TIME;
    this.stagger = HURT_TUNING.stagger;

    // clone-on-hit: the first hit this body has ever taken pays for the
    // materials, every hit after it is free
    if (!this.ownMats) this.ownMats = ownMaterials(this.mesh);
    wearOwn(this.ownMats, true);
    tintOwn(this.ownMats, HURT_TUNING.tint);
    this.flashT = HURT_TUNING.flash;

    this.hurtFwd = 1;                   // no direction: flinch straight back
    this.hurtSide = 0;
    if (fromDir) {
      _kd.set(fromDir.x, fromDir.y, fromDir.z);
      if (_kd.lengthSq() > 1e-8) {
        _kd.normalize();
        // the blow in the body's own frame. right = heading x up, and the
        // basis is makeBasis(right, up, -heading), so local +Z is BACKWARD —
        // hence the negated dot for the forward component.
        _v2.crossVectors(this.heading, this.up);
        this.hurtSide = _kd.dot(_v2);
        this.hurtFwd = -_kd.dot(this.heading);
        // knockback takes the tangential part only: the radial part would
        // just launch them off the ground, which the settle step undoes
        _kd.addScaledVector(this.up, -_kd.dot(this.up));
        if (_kd.lengthSq() > 1e-8) {
          _kd.normalize();
          this.knockDir.copy(_kd);
          this.knockT = HURT_TUNING.knockTime;
          // a heavier hit shoves harder, so a shotgun reads differently from
          // a punch without either needing its own code path
          this.knockPush = HURT_TUNING.knockSpeed
            * Math.min(2, 0.55 + amount / 9);
          if (this.isAnimal) this.fleeDir.copy(_kd);
        }
      }
    }

    // gore at the body's middle, not at its feet
    const scene = this.mesh.parent;
    _hp.copy(this.pos).addScaledVector(this.up, this.hitCentre);
    burstFX(scene, _hp, HURT_TUNING.blood, {
      // a skeleton has nothing left to bleed: hitting one throws bone dust
      color: this.kind === 'zombie' ? 'rot'
        : this.kind === 'skeleton' ? 'dust' : 'blood',
      dir: fromDir, speed: 3.4, size: 0.075, life: 0.45,
    });
    showNumber(scene, _hp, amount, this.up, amount >= 10);

    // A man who is hurt RUNS — from the player, a zombie, anything — away
    // along the blow.
    if (this.kind === 'villager' && fromDir && this.health > 0) {
      _hp.copy(this.pos).addScaledVector(_kd.set(fromDir.x, fromDir.y, fromDir.z)
        .normalize(), -3);
      this.startle(_hp, TEMPER_TUNING.scared);
    }

    if (this.isAnimal) {
      // A bee that is disturbed stings. This is the ONLY way one ever turns
      // on you — see thinkBee — so a meadow stays a meadow until you swing at
      // it, and the whole hive comes up with it (alertHive).
      if (this.kind === 'bee') {
        this.angry = 12;
        this.flee = 0;
        alertHive(this, 12);
      } else if (this.tamed) {
        // A pet does not run from its owner's enemies, and it does not run
        // from its owner either — there is nowhere for it to go.
        this.flee = 0;
        this.panic = 0;
      } else if (this.fights) {
        // a wolf does not bolt from a hit, it remembers it
        this.angry = 25;
        this.flee = 0;
      } else {
        // even a hit from nowhere sends them running; downwind of the shot
        // if we know it, straight ahead if we do not
        if (!fromDir || this.fleeDir.lengthSq() < 1e-8) this.fleeDir.copy(this.heading);
        this.flee = ANIMAL_TUNING.fleeTime;
        this.panic = 1;
      }
      this.state = 'walk';
      this.think = 0.5;
    }

    if (this.health > 0) return false;
    this.health = 0;
    this.dead = true;
    this.drops = rollDrops(this.kind, this);
    this.die();
    return true;
  }

  // Hand the body to the corpse list and keep an empty group for main.js to
  // remove. main.js sweeps `dead` entities and calls scene.remove(e.mesh) on
  // the same frame, so without the swap the death animation would be removed
  // from the scene before its first frame was ever drawn.
  //
  // Safe to call twice, and safe on an entity that was never added to a scene.
  die() {
    if (this.corpse || !this.mesh) return;
    const scene = this.mesh.parent;
    this.dead = true;
    if (!scene) return;

    _hp.copy(this.pos).addScaledVector(this.up, this.hitCentre * 0.6);
    burstFX(scene, _hp, HURT_TUNING.dust, {
      color: 'dust', speed: 2.1, size: 0.1, life: 0.6, gravity: 0.5,
    });

    if (!this.ownMats) this.ownMats = ownMaterials(this.mesh);
    wearOwn(this.ownMats, true);
    // fall away from the blow; a hit with no direction picks a side
    const side = this.hurtSide > 0.05 ? -1
      : this.hurtSide < -0.05 ? 1 : (Math.random() < 0.5 ? 1 : -1);
    this.corpse = addCorpse(this, scene, side);
    this.mesh = new THREE.Group();      // the decoy main.js removes
  }

  // --- pose ---------------------------------------------------------------
  // Where the mesh belongs, given where the creature is. Split out of
  // syncMesh because main.js has to be able to re-place a creature it is not
  // otherwise touching: the flat-horizon projection moves every mesh off its
  // true position, and something has to put them back when it is switched off.
  placeMesh() {
    this.up.copy(this.pos).normalize();
    _v.crossVectors(this.heading, this.up);
    _m.makeBasis(_v, this.up, _v2.copy(this.heading).negate());
    this.mesh.quaternion.setFromRotationMatrix(_m);
    this.mesh.position.copy(this.pos);
  }

  syncMesh(moving) {
    // The draw tiers main.js assigns by distance (see ENT_LOD there). Tier 2
    // is not drawn at all, so nothing here is owed — the simulation reads
    // e.pos and never the mesh. Tier 1 keeps the mesh MOVING every frame
    // (placeMesh is one basis and a copy) but re-poses the limbs at 15Hz on
    // a per-body accumulator. At that size on screen a 15Hz walk cycle is
    // not a thing anyone has ever noticed; posing four hundred rigs at 60
    // was most of the frame.
    if (this._lod === 2) return;
    this.placeMesh();
    if (this._lod === 1) {
      this._poseDue = (this._poseDue ?? 0) - this._dtDrawn;
      if (this._poseDue > 0) return;
      this._poseDue = 1 / 15;
    }

    const t = this.clock;
    if (this.isAnimal) {
      this.poseAnimal(t, moving);
      this.poseKnees(this._dtDrawn ?? 1 / 60);
    } else if (this.golem) this.poseGolem(t, moving);
    else if (this.kind === 'zombie') this.poseZombie(t);
    else if (this.kind === 'skeleton') this.poseSkeleton(t, moving);
    else this.poseVillager(t, moving);

    // The lurch. Every pose above ASSIGNS rig.rotation.x/z, so adding here
    // cannot accumulate. The body goes the way the blow was travelling —
    // hurtFwd/hurtSide are that direction in the body's own frame — which is
    // what makes a shot in the back read differently from one in the flank.
    if (this.hurtT > 0) {
      const k = this.hurtT / HURT_TIME;
      this.rig.rotation.x += k * 0.55 * this.hurtFwd;
      this.rig.rotation.z -= k * 0.42 * this.hurtSide;
      this.rig.position.y += k * 0.05;
    }
    // ...and the legs lose the beat entirely for half a second. A creature
    // that keeps walking a tidy cycle through a shotgun blast reads as
    // invulnerable however much red you put on it.
    if (this.stagger > 0) {
      const s = (this.stagger / HURT_TUNING.stagger) * 0.55;
      for (let i = 0; i < this.legs.length; i++) {
        this.legs[i].rotation.x +=
          Math.sin(this.clock * 27 + i * 2.1) * s;
        this.legs[i].rotation.z = Math.sin(this.clock * 19 + i) * s * 0.35;
      }
    } else if (this.legs.length && this.legs[0].rotation.z !== 0) {
      for (const l of this.legs) l.rotation.z = 0;    // tidied once, not per frame
    }
  }

  // Lurching gait: one leg swings, the other drags, and the whole rig rocks
  // and dips off-beat. Symmetry is what made the old walk read as a wind-up
  // toy.
  // Signs matter here: a limb hangs along -Y, so a POSITIVE rotation.x swings
  // it toward local -Z, which is the way the body faces. A negative one puts
  // the zombie's arms behind its back.
  poseZombie(t) {
    const P = this.parts;
    const s = Math.sin(this.phase);
    P.legL.rotation.x = s * (this.limp > 0 ? 0.62 : 0.28);
    P.legR.rotation.x = -s * (this.limp > 0 ? 0.28 : 0.62);
    this.rig.rotation.z = s * 0.10;
    this.rig.rotation.x = -0.14 + Math.cos(this.phase * 2) * 0.04;  // stoop
    this.rig.position.y = Math.abs(Math.cos(this.phase)) * 0.05 - 0.03;
    // arms up and forward, uneven, sagging in and out
    const sag = Math.sin(t * 1.3) * 0.12;
    P.armL.rotation.x = 1.35 + sag;
    P.armR.rotation.x = 1.12 - sag;
    P.armL.rotation.z = 0.12 + Math.sin(t * 0.9) * 0.06;
    P.armR.rotation.z = -0.18 + Math.cos(t * 0.7) * 0.06;
    P.head.rotation.z = 0.22;                        // lolling to one side
    P.head.rotation.y = Math.sin(t * 0.6) * 0.18;
    P.head.rotation.x = -0.12;                       // chin down
  }

  // Nothing loose, nothing heavy. Where the zombie lurches off-beat and rocks,
  // this walks with a clean symmetrical stride and a rattle in it — a fast
  // jitter on the limbs at a fixed amplitude, so what moves is the bones and
  // not the weight. The bow arm is held level across the body all the time; on
  // a draw the other hand comes back to the ear and the whole rig leans into
  // it, which is the tell that an arrow is coming.
  poseSkeleton(t, moving) {
    const P = this.parts;
    const swing = moving ? Math.sin(this.phase) * 0.55 : 0;
    const rattle = Math.sin(t * 21) * 0.035;
    P.legL.rotation.x = swing + rattle;
    P.legR.rotation.x = -swing - rattle;
    // out, not across: the left leg is the one at -X, so turning its knee
    // out is a NEGATIVE rotation about z (see the sign rule in player.js)
    P.legL.rotation.z = -0.05;                   // knees turned out: no flesh
    P.legR.rotation.z = 0.05;
    this.rig.rotation.z = 0;
    this.rig.rotation.x = -0.05;
    this.rig.position.y = moving ? Math.abs(Math.cos(this.phase)) * 0.03 : 0;
    // the bow arm, out and level, always: the silhouette of an archer
    P.armL.rotation.x = 1.52;
    P.armL.rotation.z = 0.10 + rattle;
    P.armR.rotation.x = 1.30 - swing * 0.2;
    P.armR.rotation.z = -0.16 + rattle;
    P.head.rotation.y = moving ? Math.sin(t * 0.9) * 0.14 : Math.sin(t * 0.5) * 0.08;
    P.head.rotation.x = 0;
    P.head.rotation.z = 0;
    if (this.drawT > 0) {
      // k runs 0 -> 1 through the nock, so the pull tightens and releases with
      // the shot rather than snapping to it
      const k = 1 - this.drawT / SKELETON_TUNING.draw;
      P.armL.rotation.x = 1.57;
      P.armL.rotation.z = 0.02;
      P.armR.rotation.x = 1.30 - k * 0.35;
      P.armR.rotation.z = -0.35 - k * 0.55;      // drawing hand to the ear
      P.head.rotation.x = -0.10 * k;             // sighting down the shaft
      this.rig.rotation.x = -0.05 - k * 0.06;
    }
  }

  poseVillager(t, moving) {
    const P = this.parts;
    // HAT OFF IN BED — see `doff` in buildBody. Set every frame rather than
    // on the way in and out of the bed, because the pose is the one place
    // that always knows whether he is lying down.
    if (P.doff) {
      const abed = this.state === 'sleep' && !moving;
      for (const m of P.doff) m.visible = !abed;
    }
    const swing = moving ? Math.sin(this.phase) * 0.5 : 0;
    P.legL.rotation.x = swing;
    P.legR.rotation.x = -swing;

    if (moving) {
      P.armL.rotation.x = -swing * 0.8;
      P.armR.rotation.x = swing * 0.8;
      P.armL.rotation.z = 0.05;
      P.armR.rotation.z = -0.05;
      P.head.rotation.y = Math.sin(t * 0.7) * 0.22;   // looking around
      P.head.rotation.x = 0;                          // undo any work stoop
      this.rig.rotation.x = 0;
      this.rig.position.y = 0;
    } else if (this.state === 'sleep') {
      // LYING DOWN. The whole body goes flat: the rig is tipped a quarter
      // turn so the head is on the pillow and the feet are at the other end.
      // The sign matters — tip it the other way and the face ends up pressed
      // into the mattress rather than looking at the ceiling, which is a
      // sleeper you cannot see at all rather than one lying on his back. And
      // the drop is small: what was the body's FRONT-TO-BACK thickness is now
      // its height off the mattress, so a fraction of a block rests him on
      // the blanket rather than burying him in the frame under it. Arms in,
      // legs straight, and the head still.
      P.legL.rotation.x = 0.02;
      P.legR.rotation.x = -0.02;
      P.armL.rotation.x = 0.06;
      P.armR.rotation.x = -0.06;
      P.armL.rotation.z = 0.22;
      P.armR.rotation.z = -0.22;
      this.rig.rotation.x = Math.PI / 2;
      this.rig.rotation.z = 0;
      this.rig.position.y = -0.30;      // into the blanket a little, not on it
      P.head.rotation.x = 0;
      // the slow rise and fall of somebody breathing, and nothing else
      P.head.rotation.y = 0;
      this.rig.position.y += Math.sin(t * 0.9) * 0.012;
    } else if (this.state === 'sit' && this.job === 'chief') {
      // ENTHRONED. Not the same shape as somebody sitting on the ground: the
      // knees go forward over the edge of a seat, the back stays straight,
      // and the hands rest on the arms of the chair. He is sitting UP.
      P.legL.rotation.x = -1.52;
      P.legR.rotation.x = -1.52;
      P.armL.rotation.x = -0.30;
      P.armR.rotation.x = -0.30;
      P.armL.rotation.z = 0.26;      // elbows out, onto the arms of the throne
      P.armR.rotation.z = -0.26;
      this.rig.rotation.x = -0.03;   // if anything, leaning back
      // HOW FAR DOWN. The ground test puts his feet on TOP of the throne
      // block, and the seat of a chair is half a block below that (see
      // CHAIR_COMMON in cubemesher.js — the seat spans 0.36 to 0.5). His hips
      // sit 0.81 up his own body, so the whole rig has to come down by both
      // of those or he is a man standing on a chair, which is what the first
      // pass looked like.
      this.rig.position.y = -1.30;
      P.head.rotation.x = -0.04;     // chin up
      // ...AND HE LOOKS AT YOU.
      //
      // His chair faces the door, which is right and stays right: it is where
      // whoever has come to see him comes from. But a chief who holds that
      // stare while you stand at his elbow is furniture, and from anywhere off
      // the axis of the room he reads as looking away from you — which is
      // exactly what he was doing, because the only thing his head did was a
      // slow idle sway of a third of a radian.
      //
      // So the head turns to whoever is in the room, as far as a neck goes and
      // no further. Past that he does not crane round: a man who will not turn
      // his shoulders can only see so far, and the limit is the tell that he
      // has noticed you rather than that he is mounted on a spindle.
      let yaw = Math.sin(t * 0.28) * 0.30;
      let pitch = -0.04;                                      // idle: chin up
      if (this.watching && this.watch) {
        _v2.copy(this.watch).sub(this.pos);
        const lift = _v2.dot(this.up);                        // above his floor
        _v2.addScaledVector(this.up, -lift);                  // onto his floor
        const flat = _v2.length();
        if (flat > 1e-3 && flat < LOOK.near && Math.abs(lift) < LOOK.storey) {
          _v2.normalize();
          // right = heading x up, and the body basis is makeBasis(right, up,
          // -heading) — so local -Z is his face and a POSITIVE yaw swings it
          // toward -right. Hence the minus: get this backwards and he turns
          // smartly away from you every time you move.
          _v.crossVectors(this.heading, this.up);
          const want = -Math.atan2(_v2.dot(_v), _v2.dot(this.heading));
          if (Math.abs(want) <= LOOK.arc) {
            yaw = want;
            // ...AND HIS CHIN COMES DOWN. `lift` is how far the watcher's own
            // eyes are above his floor, and he is looking from about a head's
            // height above it — so the angle is the rise over the distance
            // ACROSS the floor, which is the piece already measured. Positive
            // rotation.x tips the face down.
            const rise = (lift + LOOK.eye) - LOOK.head;
            const want2 = Math.atan2(-rise, flat);
            pitch = Math.max(-LOOK.up, Math.min(LOOK.down, want2));
          }
        }
      }
      // eased, so he turns his head rather than snapping it. Seeded with the
      // target on the first frame — `undefined + anything` is NaN, and a NaN
      // rotation takes the whole head out of the scene.
      const was = this.headYaw ?? yaw;
      this.headYaw = was + (yaw - was) * LOOK.ease;
      P.head.rotation.y = this.headYaw;
      const wasP = this.headPitch ?? pitch;
      this.headPitch = wasP + (pitch - wasP) * LOOK.ease;
      P.head.rotation.x = this.headPitch;
    } else if (this.state === 'sit' && this.seated) {
      // ON A SEAT. The throne's shape — knees forward over the edge, back
      // straight, the rig dropped so the hips meet the seat half a block
      // below the top of the chair block his feet are stood on (see the
      // chief above for the arithmetic) — without the throne's manner: the
      // hands rest on the knees, and the head turns to the company.
      P.legL.rotation.x = -1.52;
      P.legR.rotation.x = -1.52;
      P.armL.rotation.x = -0.55;
      P.armR.rotation.x = -0.55;
      P.armL.rotation.z = 0.12;
      P.armR.rotation.z = -0.12;
      this.rig.rotation.x = 0.02;
      this.rig.position.y = -1.30;
      P.head.rotation.x = 0.04;
      P.head.rotation.y = Math.sin(t * 0.35) * 0.32;
      // ...AND THE PIPE. The hose hand comes up to the mouth for the draw,
      // holds, and comes down while the smoke leaves — the same clock the
      // wisps are on (see smoke), so the picture and the plume agree. Then
      // it rests on the knee again until the next one.
      if (this.smoking) {
        const C = CAFE_TUNING;
        const ph = this.clock % C.period;
        const up = ph < C.draw ? Math.min(1, ph / 0.5)
          : ph < C.draw + C.exhale
            ? Math.max(0, 1 - (ph - C.draw) / C.exhale) : 0;
        P.armR.rotation.x = -0.55 + up * 2.9;    // knee, up to the face
        P.armR.rotation.z = -0.12 + up * 0.55;   // ...and in toward it
        P.head.rotation.x = 0.04 - up * 0.12;    // chin lifts on the draw
        P.head.rotation.y *= 1 - up;             // and holds still for it
      }
    } else if (this.state === 'sit') {
      // Told to rest. Knees up, arms on them, the whole body dropped by half
      // a thigh — somebody sitting on the ground rather than standing still.
      P.legL.rotation.x = -1.5;
      P.legR.rotation.x = -1.5;
      P.armL.rotation.x = -0.55;
      P.armR.rotation.x = -0.55;
      P.armL.rotation.z = 0.16;
      P.armR.rotation.z = -0.16;
      this.rig.rotation.x = 0.16;
      this.rig.position.y = -0.42;
      P.head.rotation.x = 0.06;
      P.head.rotation.y = Math.sin(t * 0.4) * 0.28;
    } else {
      // "working": each trade gets its own busy little loop
      this.workPose(t);
    }
    // FRIGHTENED: running with his hands in the air, which is the one thing a
    // man running from a gun does that a man running for a door does not.
    if (this.scared > 0 && moving) {
      P.armL.rotation.x = 2.5 + Math.sin(t * 17) * 0.22;
      P.armR.rotation.x = 2.5 + Math.cos(t * 17) * 0.22;
      P.armL.rotation.z = 0.25;
      P.armR.rotation.z = -0.25;
      P.head.rotation.y = 0;
    }
    // READY: a guard who heard the shot, or who owes somebody a blow, holds
    // his weapon up and across and the other hand out — the whole of "I have
    // seen you" in one pose, before anybody has been hit.
    if (this.job === 'soldier' && (this.readyT > 0 || this.grudge)
      && !(this.swingT > 0) && !(this.drawT > 0)) {
      P.armR.rotation.x = this.arm === 'spear' ? 1.2 : 1.4;
      P.armR.rotation.z = -0.14;
      P.armL.rotation.x = 0.7;
      P.armL.rotation.z = 0.12;
      if (!moving) P.head.rotation.y = 0;
    }
    // the blow coming in: overrides whatever the arm was doing, walking or
    // standing, and decays back to it over SWING_TIME. A pike is not chopped
    // with — it comes down level and goes forward, which is the difference
    // between a spearman and a swordsman with a longer sword.
    if (this.swingT > 0) {
      const k = this.swingT / SWING_TIME;
      P.armR.rotation.x = (this.arm === 'spear' ? 1.5 : 2.6) * k;
      P.armR.rotation.z = -0.15 * k;
    }
    // ...and the archer's draw: bow arm out level, string hand to the ear
    if (this.drawT > 0) {
      const k = 1 - this.drawT / (SOLDIER_ARMS.bow.draw || 0.5);
      P.armL.rotation.x = 1.55;
      P.armL.rotation.z = 0.04;
      P.armR.rotation.x = 1.25 - k * 0.3;
      P.armR.rotation.z = -0.3 - k * 0.5;
      P.head.rotation.x = -0.08 * k;
    }
    this.rig.rotation.z = 0;
  }

  // Quadrupeds move their legs in diagonal pairs — front-left with back-right
  // — which is the one thing that stops a four-legged walk looking like a
  // pantomime horse. The neck joint is what sells the grazing.
  poseAnimal(t, moving) {
    const P = this.parts;
    const s = moving ? Math.sin(this.phase) * 0.45 : 0;
    const grazing = this.state === 'graze' && !moving;
    this.rig.rotation.x = 0;
    // Reset here rather than in each branch: only the sit pose and the cat's
    // roll write it, and a body that sat down once and never stood up again
    // is the bug that costs.
    this.rig.position.y = 0;

    const fleeing = this.flee > 0;

    // The hive has no limbs at all — buildAnimal returned before any of them
    // were made, so every line below would be writing to undefined.
    if (this.still) return;

    // The bee. Wings at a blur whatever it is doing, because a bee with still
    // wings is a bee that has fallen out of the sky, and the body tilts NOSE
    // DOWN when it is going somewhere — which is the one cue that says flying
    // rather than floating.
    if (this.kind === 'bee') {
      const beat = Math.sin(t * 47);
      P.wingL.rotation.z = -0.5 - beat * 0.7;
      P.wingR.rotation.z = 0.5 + beat * 0.7;
      P.wingL.rotation.x = beat * 0.25;
      P.wingR.rotation.x = beat * 0.25;
      this.rig.rotation.x = moving ? 0.28 : Math.sin(t * 2.1) * 0.06;
      this.rig.rotation.z = Math.sin(t * 1.3) * 0.10;
      this.rig.position.y = Math.sin(t * 5.3) * 0.03;
      P.neck.rotation.x = 0;
      return;
    }

    // WINGS AND A TAIL on anything sent from KherveCAD. Neither had a line
    // of pose: a dragon walked with its wings held out like a signboard and
    // its tail as stiff as a spar. The wings beat — slowly on the move, hard
    // when it runs or strikes, barely at all at rest — and the tail sways,
    // faster the harder it goes. Set here, before the gaits, so the biped
    // branch that returns early keeps them; a gait that has its own say
    // about the tail (the biped's) says it after.
    const kc = ANIMAL_BODY[this.kind]?.custom;
    if (kc && (P.wingL || P.wingR)) {
      const hard = fleeing || this.speedMul > 1.3 || this.swingT > 0;
      const beat = hard ? 0.15 + Math.sin(t * 9) * 0.55
        : moving ? Math.sin(t * 3.2) * 0.25 : Math.sin(t * 0.8) * 0.05;
      if (P.wingL) P.wingL.rotation.z = beat;
      if (P.wingR) P.wingR.rotation.z = -beat;
    }
    if (kc && P.tail) {
      P.tail.rotation.x = 0;
      P.tail.rotation.y = Math.sin(t * (fleeing ? 7 : moving ? 3.5 : 1.1))
        * (moving ? 0.28 : 0.1);
    }

    // A BIPED sent from KherveCAD — a person, or a monster on two legs. The
    // four-footed gaits below are wrong for it twice over: its bolt is a
    // bound, which on two legs is a hop, and its rest is a head down in the
    // grass. So it WALKS — the pair alternating, a longer stride when it runs
    // and a lean into it — throws its weight forward into its own blow, and
    // keeps its head up.
    if (ANIMAL_BODY[this.kind]?.biped) {
      const run = fleeing || this.speedMul > 1.3;
      const g = moving ? Math.sin(this.phase * 0.85) * (run ? 0.75 : 0.5) : 0;
      P.legFL.rotation.x = g;
      P.legFR.rotation.x = -g;
      P.neck.rotation.x = Math.sin(t * 0.7) * 0.06;
      const k = this.swingT > 0 ? this.swingT / SWING_TIME : 0;
      this.rig.rotation.x = k > 0 ? -Math.sin(k * Math.PI) * 0.35
        : run && moving ? -0.1 : 0;
      this.rig.rotation.z = moving ? Math.sin(this.phase * 0.85) * 0.05
        : Math.sin(t * 0.9) * 0.012;
      this.rig.position.y = moving ? Math.abs(Math.sin(this.phase * 0.85)) * 0.04 : 0;
      if (P.tail) {
        P.tail.rotation.x = 0;
        P.tail.rotation.z = Math.sin(t * (run ? 6 : 1.3)) * 0.12;
      }
      return;
    }

    // SIT. The one pose in this file that exists because a player asked for a
    // word: "sit" has to LOOK like sitting or the order is a flag in a data
    // structure. The hindquarters fold under, the front legs stay straight,
    // the chest tips back, and the whole body drops by most of a leg — which
    // together is the shape of a dog sitting and nothing else.
    if (this.state === 'sit' && !moving && this.kind !== 'chicken') {
      const drop = (ANIMAL_BODY[this.kind]?.legH ?? 0.3) * 0.62;
      P.legFL.rotation.x = 0;
      P.legFR.rotation.x = 0;
      if (P.legBL) P.legBL.rotation.x = 1.45;
      if (P.legBR) P.legBR.rotation.x = 1.45;
      this.rig.rotation.x = -0.34;
      this.rig.rotation.z = 0;
      this.rig.position.y = -drop;
      if (P.neck) P.neck.rotation.x = 0.30;
      if (P.tail) {
        // the tail comes down and sweeps the ground rather than flying: a
        // sitting dog that still wags over its back reads as standing
        P.tail.rotation.x = -2.9;
        P.tail.rotation.z = Math.sin(t * 5) * 0.3;
      }
      return;
    }

    if (this.kind === 'chicken') {
      P.legFL.rotation.x = s;
      P.legFR.rotation.x = -s;
      // Wings folded on the flanks at rest; a working flutter with each
      // stride, and a full useless beating when it panics or the ground
      // goes out from under it — the classic falling chicken.
      const falling = this.radialVel < -2;
      const f = (fleeing || falling) ? 0.5 + Math.abs(Math.sin(t * 17)) * 0.9
        : moving ? Math.abs(Math.sin(this.phase)) * 0.35 : 0;
      P.wingL.rotation.z = -0.12 - f;
      P.wingR.rotation.z = 0.12 + f;
      P.neck.rotation.x = grazing ? -1.15 + Math.sin(t * 3.4) * 0.12
        : fleeing ? 0.30 + Math.sin(t * 12) * 0.16       // head up, jerking
          : Math.sin(t * 1.6) * 0.12;
      this.rig.position.y = moving
        ? Math.abs(Math.sin(this.phase)) * (fleeing ? 0.07 : 0.03) : 0;
      this.rig.rotation.z = 0;
      return;
    }

    // Tails with a mind of their own. Every branch below ASSIGNS the leg and
    // rig channels, so the tail is set here once for all of them. The base
    // carriage is the species: a pivotTop limb hangs straight down at zero,
    // negative rotation.x swings it up and BACK over the rump.
    if (P.tail) {
      if (this.kind === 'dog') {
        P.tail.rotation.x = -2.3;                         // up and over
        P.tail.rotation.z = Math.sin(t * (moving ? 11 : 7)) * 0.55;   // the wag
      } else if (this.kind === 'fox') {
        P.tail.rotation.x = -1.8 + Math.sin(t * 1.4) * 0.08;  // the brush, level
        P.tail.rotation.z = 0;
      } else if (this.kind === 'wolf') {
        // carried low — until it has a grudge, when it comes up like a flag
        P.tail.rotation.x = this.angry > 0 ? -1.7 : -2.85;
        P.tail.rotation.z = 0;
      } else if (this.kind === 'horse') {
        P.tail.rotation.x = -0.35
          + (moving ? Math.abs(Math.sin(this.phase)) * 0.2 : 0);
        P.tail.rotation.z = moving ? 0 : Math.sin(t * 0.8) * 0.1;  // the swish
      } else if (this.kind === 'cat') {
        // Straight UP with a hook at the tip when it is walking about — the
        // question-mark tail, which is the single most cat thing a cat does —
        // and lashing side to side when it is frightened or hunting.
        const cross = fleeing || this.target;
        P.tail.rotation.x = cross ? -2.5 : -3.05;
        P.tail.rotation.z = cross
          ? Math.sin(t * 9) * 0.6                    // lashing
          : Math.sin(t * 1.6) * 0.13;                // an idle curl
      } else if (this.kind === 'goat') {
        // Short, and held up and flat over the rump. A goat's tail is the one
        // thing about it that is not sheep-like at a distance.
        P.tail.rotation.x = -2.6 + Math.sin(t * 2.2) * 0.12;
        P.tail.rotation.z = 0;
      }
    }

    // The cat's walk is a PROWL: a long slow stride with the shoulders
    // rolling, nothing like the dog's busy trot at the same body length. At
    // speed it bounds like everything else — see the flee branch below — so
    // this only covers the amble, which is what a cat is doing 90% of the
    // time you see one.
    if (this.kind === 'cat' && moving && !fleeing) {
      const g = Math.sin(this.phase * 0.8) * 0.5;
      P.legFL.rotation.x = g;
      P.legBR.rotation.x = g * 0.85;
      P.legFR.rotation.x = -g;
      P.legBL.rotation.x = -g * 0.85;
      P.neck.rotation.x = 0.06 + Math.sin(this.phase * 0.8) * 0.07;
      this.rig.rotation.x = 0;
      this.rig.rotation.z = Math.sin(this.phase * 0.8) * 0.07;   // the roll
      this.rig.position.y = Math.abs(Math.sin(this.phase * 0.8)) * 0.015;
      return;
    }

    // The horse at speed is a GALLOP even when nothing is chasing it: front
    // pair reaching together, back pair driving, the body rocking between.
    if (this.kind === 'horse' && moving && !fleeing) {
      const g = Math.sin(this.phase * 0.7) * 0.7;
      P.legFL.rotation.x = g;
      P.legFR.rotation.x = g * 0.9;
      P.legBL.rotation.x = -g;
      P.legBR.rotation.x = -g * 0.9;
      P.neck.rotation.x = Math.sin(this.phase * 0.7) * 0.10;
      this.rig.rotation.x = Math.sin(this.phase * 0.7) * 0.09;
      this.rig.position.y = Math.abs(Math.sin(this.phase * 0.7)) * 0.08;
      this.rig.rotation.z = 0;
      return;
    }

    // Bolting is a BOUND, not a faster walk: front pair together, back pair
    // together, body pitching between them. The diagonal gait below is a
    // trot, and a trotting animal never looks frightened however fast it is.
    if (fleeing) {
      const g = Math.sin(this.phase) * 0.72;
      P.legFL.rotation.x = g;
      P.legFR.rotation.x = g;
      P.legBL.rotation.x = -g;
      P.legBR.rotation.x = -g;
      P.neck.rotation.x = 0.26 + Math.sin(this.phase) * 0.12;   // head thrown up
      this.rig.rotation.x = Math.sin(this.phase) * 0.13;
      this.rig.position.y = Math.abs(Math.sin(this.phase)) * 0.09;
      this.rig.rotation.z = 0;
      return;
    }

    P.legFL.rotation.x = s;
    P.legBR.rotation.x = s;
    P.legFR.rotation.x = -s;
    P.legBL.rotation.x = -s;
    // The head hangs FORWARD of the neck joint, not below it, so the limb
    // sign is inverted here: -x tips it down into the grass, +x throws it up.
    // The neck alone cannot reach the ground — it is only a head's width long
    // — so the body dips at the shoulder as well, which is what a real animal
    // does and what makes the pose read from a distance.
    P.neck.rotation.x = grazing ? -1.05 + Math.sin(t * 2.4) * 0.07
      : Math.sin(t * 0.7) * 0.10;
    if (grazing) this.rig.rotation.x = -0.10;
    this.rig.position.y = moving ? Math.abs(Math.sin(this.phase * 2)) * 0.02 : 0;
    this.rig.rotation.z = moving ? Math.sin(this.phase) * 0.04 : 0;
  }

  // The golem's walk is WEIGHT. The legs barely swing — a stride is a shift
  // of a very heavy thing, not a step — and the whole body rolls from one
  // foot to the other, which is what makes something with short legs read as
  // massive rather than as stubby. The arms hang and swing late, dragging a
  // beat behind the legs, because nothing that heavy moves in time with
  // itself.
  // KNEES on a creature sent from KherveCAD whose legs came with shins.
  // Every gait in poseAnimal swings the legs and returns from a dozen
  // places, so the knees are set after it, from what it did: while a leg
  // swings FORWARD its shin folds back under it — the foot lifted clear —
  // and while it swings back (the foot on the ground, pushing) the knee
  // straightens. The fold eases in and out, so a leg never snaps.
  poseKnees(dt) {
    const P = this.parts;
    if (!P || !(P.kneeFL || P.kneeFR || P.kneeBL || P.kneeBR)) return;
    const prev = this._kneePrev ?? (this._kneePrev = {});
    const step = Math.max(dt, 1 / 240);
    for (const end of ['FL', 'FR', 'BL', 'BR']) {
      const knee = P[`knee${end}`];
      const leg = P[`leg${end}`];
      if (!knee || !leg) continue;
      const a = leg.rotation.x;
      const v = (a - (prev[end] ?? a)) / step;   // radians a second, + forward
      prev[end] = a;
      const want = Math.min(1.1, Math.max(0, v * 0.22));
      const now = -knee.rotation.x;
      const ease = Math.min(1, step * 12);
      knee.rotation.x = -(now + (want - now) * ease);
    }
  }

  poseGolem(t, moving) {
    const P = this.parts;
    const swing = moving ? Math.sin(this.phase) * 0.32 : 0;
    P.legL.rotation.x = swing;
    P.legR.rotation.x = -swing;
    // the lag: a quarter-cycle behind the legs, and shallower
    const lag = moving ? Math.sin(this.phase - 0.8) * 0.22 : 0;
    P.armL.rotation.x = -lag;
    P.armR.rotation.x = lag;
    // Arms held a little away from the body at rest, because a golem's chest
    // is wider than its shoulders and straight-down arms clip through it.
    P.armL.rotation.z = 0.13;
    P.armR.rotation.z = -0.13;
    P.head.rotation.y = Math.sin(t * 0.3) * 0.28;      // a slow scan
    P.head.rotation.x = 0;
    // the roll, and the tread: it drops onto each foot rather than gliding
    this.rig.rotation.z = moving ? Math.sin(this.phase) * 0.10 : 0;
    this.rig.rotation.x = 0;
    this.rig.position.y = moving
      ? -Math.abs(Math.sin(this.phase)) * 0.05 : 0;

    // The blow: both fists come up together and come down together. A golem
    // does not fence — it brings its arms down on something, and the two-arm
    // symmetry is what separates that from a soldier's sword stroke.
    if (this.swingT > 0) {
      const k = this.swingT / SWING_TIME;
      P.armL.rotation.x = 2.5 * k;
      P.armR.rotation.x = 2.5 * k;
      P.armL.rotation.z = 0.13 + 0.2 * k;
      P.armR.rotation.z = -0.13 - 0.2 * k;
      this.rig.rotation.x = -0.16 * k;
    }
  }

  // Standing about: not walking, and nothing in front of them to work at. The
  // shopkeeper behind his counter, the soldier on his watch, the farmer paused
  // on his round. Upright, hands down, and the head turning the way anybody's
  // does when they are waiting — enough motion that they are not statues, and
  // no stoop, because there is nothing to stoop over.
  idlePose(t) {
    const P = this.parts;
    const sway = Math.sin(t * 0.9);
    P.legL.rotation.x = 0;
    P.legR.rotation.x = 0;
    P.armL.rotation.x = 0.06 + sway * 0.05;
    P.armR.rotation.x = 0.06 - sway * 0.05;
    P.armL.rotation.z = 0.07;
    P.armR.rotation.z = -0.07;
    this.rig.rotation.x = -0.02;
    this.rig.rotation.y = 0;
    this.rig.position.y = 0;
    P.head.rotation.x = 0;
    P.head.rotation.y = Math.sin(t * 0.37) * 0.30;
  }

  // Same sign rule as the zombie: +rotation.x on a limb is forward, and on
  // the rig it leans BACK, so a stoop is negative. Heads look down at -x.
  workPose(t) {
    const P = this.parts;

    // AT A JOB, or just standing at a stop? `work` is the state for both, and
    // the trade poses only make sense over the first.
    //
    // A villager's round is walk-to-a-waypoint, stand-and-'work'-a-while,
    // move on — and `state === 'work'` is also what a man sheltering in a
    // doorway is in. None of those has anything to bend over, but every one
    // of them was being bent over it: a farmer standing on the green got the
    // deep stoop of somebody tilling a row, 35 degrees forward with his hands
    // at the ground and nothing under them. Next to the fountain that reads
    // exactly like a man falling into it, which is what the player saw and
    // reported.
    //
    // work.js writes the spot into `fetch` and only clears it when the job is
    // done or given up on, so it is the honest test of "there is something
    // here to work at". Without one, stand.
    if (!this.fetch) { this.idlePose(t); return; }

    // --- the trades ----------------------------------------------------------
    // Somebody working under an order is doing the ORDER, not their old trade:
    // a librarian you set to cutting wood swings an axe. So the order wins
    // here, and the job poses below are what everybody else in the village is
    // still doing.
    if ((this.hired || this.forVillage) && this.order
      && this.order !== 'follow') {
      if (this.order === 'chop') {
        // Two hands on the haft, a long overhead arc, and a twist in the body
        // at the top of it — a felling swing is the whole torso, not the arms.
        const k = Math.sin(t * 3.4);
        const up = Math.max(0, k);
        P.armL.rotation.x = -2.5 + up * 2.2;
        P.armR.rotation.x = -2.5 + up * 2.2;
        P.armL.rotation.z = 0.22;
        P.armR.rotation.z = -0.22;
        this.rig.rotation.x = -0.10 - up * 0.28;
        this.rig.rotation.y = k * 0.18;
        P.head.rotation.x = -0.12;
        return;
      }
      if (this.order === 'build' || this.order === 'light') {
        // Laying a course. Half the cycle is the stoop that picks the block
        // up and half is the lift that sets it on the wall, because a house
        // is made of blocks somebody bent down for — arms that only go up and
        // down are hammering, and there is no anvil on a building plot.
        // Raising a lamp post is the same motion against a shorter wall.
        const c = Math.sin(t * 2.4);
        const lift = Math.max(0, c);
        const stoop = Math.max(0, -c);
        P.armL.rotation.x = -1.30 - lift * 0.95;
        P.armR.rotation.x = -1.30 - lift * 0.95;
        P.armL.rotation.z = 0.16;
        P.armR.rotation.z = -0.16;
        this.rig.rotation.x = -0.08 - stoop * 0.48;
        this.rig.rotation.y = Math.sin(t * 1.2) * 0.10;
        this.rig.position.y = 0;
        P.head.rotation.x = -0.18 + stoop * 0.62;
        return;
      }
      if (this.order === 'farm' || this.order === 'bed'
        || this.order === 'pave') {
        // Bent over the row, hands at the ground, working along it. The same
        // shape covers making up a bed, which is the same job at the same
        // height with different hands — and laying a path, which is that job
        // again with a slab in them.
        const k = Math.sin(t * 2.6);
        P.armL.rotation.x = -1.15 + k * 0.35;
        P.armR.rotation.x = -1.15 - k * 0.35;
        P.armL.rotation.z = 0.14;
        P.armR.rotation.z = -0.14;
        this.rig.rotation.x = -0.62;
        this.rig.rotation.y = 0;
        P.head.rotation.x = 0.34;                 // looking at their hands
        return;
      }
      if (this.order === 'cook') {
        // One hand on the pot, the other stirring in a circle. The circle is
        // the whole of it: an arm going up and down is hammering.
        P.armL.rotation.x = -1.25;
        P.armL.rotation.z = 0.30;
        P.armR.rotation.x = -1.05 + Math.sin(t * 4.2) * 0.28;
        P.armR.rotation.z = -0.24 + Math.cos(t * 4.2) * 0.22;
        this.rig.rotation.x = -0.24;
        this.rig.rotation.y = 0;
        P.head.rotation.x = 0.22;
        return;
      }
      if (this.order === 'haul' && this.carry) {
        // Both arms out in front, holding the thing. It is the one pose that
        // tells you at a glance that the errand worked.
        P.armL.rotation.x = -1.45;
        P.armR.rotation.x = -1.45;
        P.armL.rotation.z = 0.10;
        P.armR.rotation.z = -0.10;
        this.rig.rotation.x = 0.06;
        this.rig.rotation.y = 0;
        P.head.rotation.x = 0;
        return;
      }
    }

    if (this.job === 'smith' || this.job === 'builder') {
      const hammer = Math.max(0, Math.sin(t * 5.5));
      P.armR.rotation.x = 0.45 + hammer * 1.05;   // up, then down on the anvil
      P.armL.rotation.x = 0.9;
      this.rig.rotation.x = -0.18;
      this.rig.position.y = 0;
      P.head.rotation.y = Math.sin(t * 0.5) * 0.08;
      P.head.rotation.x = -0.25;
    } else if (this.job === 'soldier') {
      // standing guard: square shoulders, arms at the sides, and a slow
      // scan of the road — the stillness is what reads as discipline next
      // to everyone else's bustle
      P.armL.rotation.x = 0.05;
      P.armR.rotation.x = 0.05;
      this.rig.rotation.x = 0;
      this.rig.position.y = 0;
      P.head.rotation.x = 0;
      P.head.rotation.y = Math.sin(t * 0.35) * 0.5;
    } else if (this.job === 'librarian') {
      P.armL.rotation.x = 1.25 + Math.sin(t * 0.8) * 0.05;   // holding a book
      P.armR.rotation.x = 1.25 - Math.sin(t * 0.8) * 0.05;
      this.rig.rotation.x = -0.05;
      this.rig.position.y = 0;
      P.head.rotation.x = -0.2 + Math.sin(t * 1.6) * 0.05;   // reading a line
      P.head.rotation.y = Math.sin(t * 0.4) * 0.1;
    } else {
      // farmer: stoops over the row, hands working near the ground
      const dig = Math.sin(t * 2.2);
      P.armL.rotation.x = 0.35 + dig * 0.3;
      P.armR.rotation.x = 0.35 - dig * 0.3;
      this.rig.rotation.x = -0.42;
      this.rig.position.y = -0.05;
      P.head.rotation.x = -0.15;
      P.head.rotation.y = Math.sin(t * 0.5) * 0.12;
    }
  }
}

// ---------------------------------------------------------------------------
// taming, riding and hives — the API main.js drives all of this through
//
// Every function here is a verb the PLAYER performs. Nothing in this block
// runs on its own: main.js decides that a click was a mount or a feed, and
// these do the work and answer whether it took.

// Which item tames a given animal, as a real items.js id — or null if this
// species cannot be tamed, or if the item it wants does not exist in this
// build. Resolved through DROP_ITEMS, which is already the one place in this
// file that turns a name into an id.
//
// There is no fish item and no saddle item in items.js, so a cat is tamed
// with raw meat and a horse is ridden bare-back. Both are stated here rather
// than worked around, so the day either item appears this is the one line
// that changes.
export function tameItemFor(entity) {
  if (!entity || !entity.tameWith) return null;
  return DROP_ITEMS[entity.tameWith] ?? null;
}

// Is `itemId` the thing this animal wants? Case-folded, because the bag and
// the drop table do not have to agree on spelling.
export function canTameWith(entity, itemId) {
  if (!entity || entity.dead || entity.tamed || !itemId) return false;
  const want = tameItemFor(entity);
  return !!want && String(itemId).toLowerCase() === String(want).toLowerCase();
}

// Feed an animal the thing it wants. Returns true if it worked, so the caller
// knows whether to take the item out of the bag.
//
// A tamed animal is marked in the WORLD, not just in a flag: it gets a collar
// — see fitCollar — because a tamed dog that looks exactly like the village's
// dogs is a dog you will lose in the first pack you walk past.
export function tame(entity, owner) {
  if (!entity || entity.dead || entity.tamed || !owner) return false;
  if (!entity.tameWith) return false;
  entity.tamed = true;
  entity.owner = owner;
  entity.order = 'follow';
  entity.post = null;
  entity.flee = 0;
  entity.panic = 0;
  entity.think = 0;
  // It stops answering to where it was born: a pet that kept its home tether
  // would be dragged back to the village green the moment you walked away.
  entity.home.copy(entity.up);
  entity.wanderArc = null;
  fitCollar(entity);
  const scene = entity.mesh?.parent;
  if (scene) {
    _hp.copy(entity.pos).addScaledVector(entity.up, entity.hitCentre);
    burstFX(scene, _hp, 14, {
      color: 'heal', speed: 1.6, size: 0.07, life: 0.8, gravity: -0.4,
    });
  }
  return true;
}

// --- hiring ------------------------------------------------------------------
//
// A villager who has been fed and paid comes with you. It is the same
// machinery the taming is: an `owner`, an `order`, and the pet brain — the
// only real differences are that a person costs coin as well as food, and
// that a person can carry things.
//
// What it is NOT is a purchase of a life. `release` (pay off) hands them back
// their own business, and they walk off and rejoin whatever village they can
// find, which is why the order exists in the list at all.
export function canHire(entity) {
  if (entity?.immortal) return false;       // nobody hires the chief
  return !!entity && !entity.dead && !entity.hired && !entity.undead
    && !entity.golem && entity.kind === 'villager'
    // a shopkeeper is standing behind a counter they are not leaving, and a
    // village whose trader can be walked off is a village with no shop
    && !entity.shop;
}

export function hire(entity, owner) {
  if (!canHire(entity) || !owner) return false;
  entity.hired = true;
  // HE STOPS WORKING FOR HIS OLD CHIEF, and this is the line that was missing.
  // `forVillage` is what says a load goes to that village's shop counter, and
  // hiring never cleared it — so a villager you took on in the middle of a
  // chief's work order went on cutting wood for THEM. You paid 24 coin and a
  // meal to watch somebody carry your timber into somebody else's shop, with
  // nothing to show for the afternoon. Every trade goes through homeOf and
  // homeOf asks this first, so this one flag is the whole difference between
  // a hand of yours and a hand of theirs.
  entity.forVillage = false;
  entity.said = null;            // the chief's line about work he is off
  entity.chore = null;
  entity.fetch = null;
  // Somebody working for you scrambles. A villager on their round steps 1.15
  // and never needs more, because a village is laid out on a levelled pad —
  // but that same pad is a wall to anyone trying to LEAVE it, and a
  // woodcutter who cannot climb out of the village never reaches a tree. A
  // person can get up a bank most of two blocks high; a person on an errand
  // does.
  entity.stepUp = Math.max(entity.stepUp ?? 1.15, 1.85);
  entity.owner = owner;
  entity.order = 'follow';
  entity.post = null;
  entity.think = 0;
  entity.home.copy(entity.up);
  // It stops walking the village round: the waypoints are what would drag it
  // back to somebody else's doorstep the moment you turned your back.
  entity.waypoints = null;
  entity.attackDamage = HIRE_TUNING.damage;
  const scene = entity.mesh?.parent;
  if (scene) {
    _hp.copy(entity.pos).addScaledVector(entity.up, entity.hitCentre);
    burstFX(scene, _hp, 16, {
      color: 'heal', speed: 1.7, size: 0.07, life: 0.9, gravity: -0.4,
    });
  }
  return true;
}

// Everything that answers to this owner, so main.js can give one order to a
// whole company without keeping a list of its own.
export function companyOf(list, owner) {
  return (list ?? []).filter((e) => !e.dead && e.owner === owner
    && (e.tamed || e.hired));
}

// A band of red round the neck with a pale tag hung off it. Built on the
// entity's OWN materials rather than the shared species set — every dog in
// the world sharing one material array is the whole reason that set exists,
// and a collar written onto it would put one on all of them.
function fitCollar(entity) {
  const P = entity.parts;
  if (!P || entity.collar || !P.head) return;
  const D = ANIMAL_BODY[entity.kind];
  if (!D) return;
  // PROUD of the head, in the gap between head and shoulders — which is
  // where a collar goes, and the only place it can be seen. A first pass sat
  // it at 1.15x the head width inside the head's own box and was completely
  // invisible from every angle: a band has to be bigger than the thing it is
  // buckled round or it is just paint.
  const band = new THREE.Mesh(
    // Proud of the head on ALL FOUR sides, so it draws a red rim round the
    // whole head outline from any angle. Sized to the head rather than to the
    // body: it is buckled round the neck, and the neck is the head's width.
    new THREE.BoxGeometry(D.hw + 0.07, D.hh + 0.05, 0.085),
    solidMaterials('#c0392b', 'leather'));
  // A child of the head, so it follows the head down into the grass rather
  // than floating where the neck used to be. Local +Z is BACKWARD, so this
  // sits at the back of the skull — where a collar goes.
  band.position.set(0, -D.hh * 0.05, D.hd / 2 - 0.01);
  P.head.add(band);
  const tag = new THREE.Mesh(
    new THREE.BoxGeometry(D.hw * 0.3, D.hh * 0.34, 0.04),
    solidMaterials('#e8c86a', 'metal'));
  tag.position.set(0, -D.hh * 0.55, D.hd / 2 - 0.02);
  P.head.add(tag);
  entity.collar = band;
}

// --- riding ----------------------------------------------------------------

// Can this be got on? Only a species whose table says `rides` — which is the
// horse and nothing else. A cow is a similar size and a bear is bigger, and
// neither should ever be a near-miss on a click meant for a horse.
export const isRideable = (e) =>
  !!e && !e.dead && !!ANIMAL_BODY[e.kind]?.rides && !e.rider;

// Find the rideable animal nearest a world position, within RIDE_TUNING's
// reach. Returns null if there is nothing to get on.
export function rideableNear(pos, list, reach = RIDE_TUNING.mountArc) {
  if (!pos || !list) return null;
  let best = reach * reach, found = null;
  for (const e of list) {
    if (!isRideable(e) || !e.pos) continue;
    const d = e.pos.distanceToSquared(pos);
    if (d < best) { best = d; found = e; }
  }
  return found;
}

// Get on. `rider` is whatever main.js wants handed back on dismount; the
// entity only ever tests it for null.
export function mount(entity, rider) {
  if (!isRideable(entity) || !rider) return false;
  entity.rider = rider;
  entity.flee = 0;
  entity.panic = 0;
  entity.angry = 0;
  entity.state = 'walk';
  entity.reinsGo = false;
  entity.reins.set(0, 0, 0);
  return true;
}

// Get off, and answer with a world position to stand the rider at: one and a
// half blocks out to the horse's LEFT, on the ground there.
//
// To the side rather than behind, because a horse that is walking forward when
// you step off would otherwise put you down inside its own hindquarters; and
// on the real ground radius rather than the horse's, or dismounting on a slope
// drops you into the hill or leaves you standing in the air.
export function dismount(entity) {
  if (!entity || !entity.rider) return null;
  entity.rider = null;
  entity.reinsGo = false;
  entity.reins.set(0, 0, 0);
  const out = new THREE.Vector3();
  _v.crossVectors(entity.heading, entity.up).normalize();   // the horse's right
  const r = entity.pos.length();
  offsetDir(entity.up, _v.negate(), RIDE_TUNING.dismount, r, out);
  const g = entity.planet.surfaceRadiusAtDir(out.x, out.y, out.z);
  return out.multiplyScalar(g);
}

// What the rider is asking for this frame: a world-space direction to head in,
// and whether to move at all. main.js works `dir` out of the player's own look
// direction, so the horse goes where you are looking — the reins ARE the view.
export function steerRide(entity, dir, go) {
  if (!entity || !entity.rider) return;
  if (dir) entity.reins.copy(dir);
  entity.reinsGo = !!go;
}

// Where a rider's feet belong: on the horse's back, at the saddle line. Used
// by main.js every frame to place the player, so this is the one definition
// of "on a horse" and the camera cannot drift out of step with the body.
// The rider's hip height above their own feet. player.js builds the avatar
// with its origin AT THE FEET, so putting the animal's back under that origin
// stands the rider on the horse instead of sitting them on it — which is
// exactly what the first version did, boots on the spine and the whole body
// hanging in the air above.
const RIDER_HIP = 0.75;

export function saddlePoint(entity, out = new THREE.Vector3()) {
  const D = ANIMAL_BODY[entity.kind];
  // the top of the barrel — where a saddle actually lies — less the hip, so
  // the rider's SEAT lands on the back and the legs hang either side of it
  const back = D ? D.legH + D.bh * 0.98 : 1.4;
  const lift = Math.max(0.1, back - RIDER_HIP);
  out.copy(entity.pos).addScaledVector(entity.up, lift * entity.scale);
  // ...and a little BACK from the shoulders, unless the species says
  // otherwise. `saddleBack` is a fraction of the body length: positive is
  // behind the withers, which is where a saddle sits on a horse, and negative
  // is forward of them, which is where one sits on a camel.
  if (D) {
    out.addScaledVector(entity.heading,
      -D.bd * (D.saddleBack ?? 0.12) * entity.scale);
  }
  return out;
}

// --- hives ------------------------------------------------------------------

// Something disturbed a bee: bring the rest of its hive up with it. A single
// angry bee is a nuisance; the hive coming out is what makes hitting one a
// decision.
function alertHive(bee, seconds) {
  const hive = bee?.hive;
  if (!hive || !hive.bees) return;
  for (const b of hive.bees) {
    if (b.dead) continue;
    b.angry = Math.max(b.angry, seconds);
    b.flee = 0;
  }
}

// Rob a hive of one comb. Returns the stack, or null when there is nothing in
// it — a hive that has just been emptied is a hive worth leaving alone for a
// while, which is what makes it a place you come back to.
//
// The bees come out. That is the price and it is the whole point: honey is the
// one thing in this world you cannot take without something objecting.
export function takeComb(hive) {
  if (!hive || hive.dead || hive.kind !== 'hive') return null;
  hive.comb ??= HIVE_TUNING.comb;
  if (hive.comb <= 0) return null;
  hive.comb--;
  hive.combT = HIVE_TUNING.fill;
  for (const b of hive.bees ?? []) {
    if (b.dead) continue;
    b.angry = Math.max(b.angry ?? 0, HIVE_TUNING.anger);
    b.flee = 0;
  }
  return { id: 'honeycomb', count: 1 };
}

// What is in a hive right now, for anything that wants to know before it
// walks all the way over there.
export const combIn = (hive) => (hive && hive.kind === 'hive' && !hive.dead
  ? (hive.comb ?? HIVE_TUNING.comb) : 0);

// ---------------------------------------------------------------------------
// birds
//
// Decorative, and priced accordingly. A flock is NOT a set of entities: it is
// one InstancedMesh and some trigonometry, so eleven birds cost one draw call
// and eleven matrix composes, and a flock on the far side of the planet costs
// a single dot product because it is switched off entirely.

// A shallow V of two triangles, nose along -Z like every other model in this
// file. Two triangles is enough — at cruising height a bird is a handful of
// pixels and all that reads is the silhouette and the beat.
function birdGeometry() {
  const g = new THREE.BufferGeometry();
  const v = new Float32Array([
    0, 0, -0.30, 0, 0, 0.22, -0.55, 0.16, -0.02,   // left wing
    0, 0, -0.30, 0.55, 0.16, -0.02, 0, 0, 0.22,    // right wing
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  return g;
}

class Flock {
  constructor(planet, geo, mat, n, rand) {
    this.planet = planet;
    this.n = n;
    this.t = rand() * 100;              // no two flocks in step
    // a random great circle to travel along, so their tracks never coincide
    const a = rand() * 6.283, b = Math.acos(2 * rand() - 1);
    this.axis = new THREE.Vector3(
      Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a),
    ).normalize();
    tangentBasis(this.axis, _t1, _t2);
    this.seed = _t1.clone();            // any point on that circle starts it

    this.ang = new Float32Array(n);
    this.rad = new Float32Array(n);
    this.oy = new Float32Array(n);
    this.ph = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.ang[i] = rand() * 6.283;
      this.rad[i] = BIRD_TUNING.spread * (0.25 + rand() * 0.75);
      this.oy[i] = (rand() - 0.5) * 4;
      this.ph[i] = rand() * 6.283;
    }

    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;    // it is nowhere near its own origin
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.q = new THREE.Quaternion();
    this.shell = 0;
  }

  update(dt, playerUp) {
    const F = BIRD_TUNING;
    this.t += dt;
    _bc.copy(this.seed).applyAxisAngle(this.axis, this.t * F.speed).normalize();

    // altitude is measured from the ground UNDER the flock, sampled once for
    // the whole flock, so they ride over a mountain instead of into it
    const g = this.planet.surfaceRadiusAtDir(_bc.x, _bc.y, _bc.z);
    const want = g + F.altitude;
    this.shell = this.shell === 0 ? want
      : this.shell + (want - this.shell) * Math.min(1, dt * 0.8);

    if (playerUp) {
      // under the player's horizon: the planet hides them anyway, and
      // skipping the loop is where "a flock costs nothing" comes from
      const horizon = Math.acos(THREE.MathUtils.clamp(g / this.shell, -1, 1));
      if (_bc.dot(playerUp) < Math.cos(Math.min(Math.PI, horizon + 0.3))) {
        this.mesh.visible = false;
        return;
      }
    }
    this.mesh.visible = true;

    _bf.crossVectors(this.axis, _bc).normalize();     // direction of travel
    _br.crossVectors(_bf, _bc);                       // right = heading x up
    _bm.makeBasis(_br, _bc, _bz.copy(_bf).negate());  // -Z forward, as ever
    this.q.setFromRotationMatrix(_bm);

    // Every bird shares the flock's quaternion. Over a spread of ten blocks
    // on a planet hundreds across the local ups differ by a degree or two,
    // which is not worth a normalise and a basis each.
    const swirl = this.t * F.swirl;
    for (let i = 0; i < this.n; i++) {
      const a = this.ang[i] + swirl;
      const rad = this.rad[i];
      _bp.copy(_bc).multiplyScalar(
        this.shell + this.oy[i] + Math.sin(this.t * 1.6 + this.ph[i]) * 0.7)
        .addScaledVector(_br, Math.cos(a) * rad)
        .addScaledVector(_bf, Math.sin(a) * rad);
      // the beat is a scale on Y: the wingtips swing through the body plane
      // and back, which is a real flap for the price of one sine
      _bs.set(F.size,
        F.size * Math.sin(this.t * F.flap + this.ph[i] * 3) * 1.1, F.size);
      _bi.compose(_bp, this.q, _bs);
      this.mesh.setMatrixAt(i, _bi);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

class Birds {
  constructor(planet, scene, opts = {}) {
    const F = { ...BIRD_TUNING, ...opts };
    this.scene = scene;
    this.geo = birdGeometry();
    // DoubleSide because the flap flips the wing through zero, and fog on
    // because birds are close enough for the world haze to apply to them
    this.mat = new THREE.MeshBasicMaterial({
      color: F.colour, side: THREE.DoubleSide, fog: true,
    });
    this.group = new THREE.Group();
    this.flocks = [];
    const rand = mulberry32(((opts.seed ?? 1) ^ 0xb12d5) | 0);
    for (let i = 0; i < F.flocks; i++) {
      const f = new Flock(planet, this.geo, this.mat, F.perFlock, rand);
      this.flocks.push(f);
      this.group.add(f.mesh);
    }
    scene.add(this.group);
  }

  update(dt, ctx) {
    const up = ctx && ctx.playerPos
      ? _bu.copy(ctx.playerPos).normalize() : null;
    for (const f of this.flocks) f.update(dt, up);
  }

  dispose() {
    this.scene.remove(this.group);
    for (const f of this.flocks) f.mesh.dispose();
    this.geo.dispose();
    this.mat.dispose();
    this.flocks.length = 0;
  }
}

let _birds = null;
export const birdFlocks = () => _birds;

// One pseudo-entity drives the whole sky, so main.js needs no extra call: its
// existing `for (const e of entities) e.update(dt, ctx)` already does it.
// `mesh` is null ON PURPOSE — combat.js skips entities without one, so shots
// pass through a flock instead of ending in a puff of blood a hundred blocks
// up, and `scene.remove(null)` is a no-op. Nothing else in main.js touches
// `mesh` for a live entity.
function birdTicker(birds) {
  return {
    kind: 'birds', mesh: null, dead: false, health: Infinity,
    isAnimal: false, birds,
    update(dt, ctx) { birds.update(dt, ctx); },
    damage() { return false; },
  };
}

// ---------------------------------------------------------------------------
// population

// Waypoints for one village: real doorsteps when village.js gives us any
// (`site.doors[].dir`, or a plain `site.houseDirs` list), otherwise a
// deterministic ring around the centre. Six stops is plenty — a longer
// circuit just means you never see the same villager twice.
function villageWaypoints(planet, site, rand) {
  const centre = new THREE.Vector3(...site.dir).normalize();
  const r = planet.surfaceRadiusAtDir(centre.x, centre.y, centre.z);
  const doors = site.doors ?? site.houseDirs;
  if (Array.isArray(doors) && doors.length) {
    // A malformed entry is SKIPPED, not thrown on. This ran inside populate,
    // which runs once for the whole planet, so one village with a door that
    // had no direction on it took every villager, soldier and chief on the
    // world down with it — and the world still loaded, so it read as a
    // generator that had simply forgotten to put anybody in it.
    const out = [];
    for (const d of doors) {
      const v = Array.isArray(d) ? d : d?.dir;
      if (!v || v.length < 3) continue;
      // THE DOORSTEP, NOT THE DOORWAY.
      //
      // This is where the rooftops came from. A door's own cell is a hole in
      // a wall, and the column over a hole in a wall is the rest of the wall
      // and then the roof — so surfaceRadiusAtDir answers the ridge, and the
      // villager whose stop that is gets put on top of the house they live
      // in. Halls, shops, churches and towers worst, because their walls are
      // the thickest and their roofs the highest: one villager in seven
      // arrived standing on the tiles.
      //
      // One step out along the way the door faces is the street, which is
      // where somebody standing at their own front door actually stands. The
      // doorway itself is the fallback, and a door with neither is dropped —
      // if every door in a village is impossible the ring below still runs.
      // Only the WATER test here, and the height carried on the vector. The
      // roof test cannot help at a front door and would do harm: an eave
      // hangs two cells past the wall, so the surface over a doorstep is
      // tiles and the test throws away the doorstep along with the doorway —
      // which leaves every villager on a ring in the fields instead of on
      // their own street. A door knows the floor it opens onto, so say so and
      // let the spawn stand them at it.
      let stop = null;
      if (!Array.isArray(d) && d.f !== undefined && d.du !== undefined) {
        const s2 = dirFromCell(d.f, d.u + d.du + 0.5, d.v + d.dv + 0.5);
        const cand = new THREE.Vector3(s2[0], s2[1], s2[2]).normalize();
        if (spotIsDry(planet, cand)) stop = cand;
      }
      if (!stop) {
        const cand = new THREE.Vector3(v[0], v[1], v[2]).normalize();
        if (spotIsDry(planet, cand)) stop = cand;
      }
      if (!stop) continue;
      if (d.h !== undefined) stop.h = d.h;
      out.push(stop);
      if (out.length >= 6) break;
    }
    if (out.length) return out;
  }
  tangentBasis(centre, _t1, _t2);
  const n = THREE.MathUtils.clamp(site.houses ?? 3, 2, 5);
  const out = [];
  const spin = rand() * 6.283;
  for (let i = 0; i < n; i++) {
    const a = spin + (i / n) * 6.283;
    // A stop in a lake used to be a stop like any other, and the villager
    // assigned it would walk to the shore and stand there pushing into the
    // water for the rest of the game. Pull the ring in until the stop is on
    // dry land, and drop it entirely if the whole spoke is wet — a circuit
    // with four stops reads no differently from one with five.
    _v.copy(_t1).multiplyScalar(Math.cos(a)).addScaledVector(_t2, Math.sin(a));
    for (let dist = 5 + rand() * 6; dist >= 2; dist -= 1.5) {
      const stop = offsetDir(centre, _v, dist, r, new THREE.Vector3());
      if (!spotIsWalkable(planet, stop)) continue;
      out.push(stop);
      break;
    }
  }
  // ...but never hand back an empty circuit: nextStop would have nothing to
  // walk to. The centre is where the village was surveyed, so it is dry.
  if (!out.length) out.push(centre.clone());
  return out;
}

// The guard round: one stop per palisade gate. village.js hands the gates
// over as [v-, v+, u-, u+]; walked in that order the "patrol" crosses the
// green twice a lap, so re-order to a ring — v-, u+, v+, u- — and the round
// actually goes AROUND. A planet built before palisades existed has no
// `gates`, and a gate can open onto a lake; both fall back to the ordinary
// villager circuit rather than a guard stood in the water.
function guardWaypoints(planet, site, rand) {
  const gates = site.gates;
  if (Array.isArray(gates) && gates.length) {
    const ring = gates.length === 4
      ? [gates[0], gates[3], gates[1], gates[2]] : gates;
    const out = [];
    for (const g of ring) {
      const d = dirFromCell(g.f, g.u + 0.5, g.v + 0.5);
      _v.set(d[0], d[1], d[2]).normalize();
      if (!spotIsWalkable(planet, _v)) continue;
      out.push(_v.clone());
    }
    if (out.length >= 2) return out;
  }
  return villageWaypoints(planet, site, rand);
}

// Put one animal on the ground near `dir`, or return null if there is only
// water and cliff within reach. Exported so a test or a console can drop one
// at your feet: spawnAnimal(planet, scene, player.pos, 'cow').
export function spawnAnimal(planet, scene, dir, kind, opts = {}) {
  if (!isAnimalKind(kind)) return null;
  const rand = opts.rand ?? Math.random;
  const centre = _v2.copy(dir).normalize();
  const r = planet.surfaceRadiusAtDir(centre.x, centre.y, centre.z);
  const spread = opts.spread ?? ANIMAL_TUNING.spread;
  const out = new THREE.Vector3();
  tangentBasis(centre, _t1, _t2);       // own basis: never trust the caller's
  for (let a = 0; a < ANIMAL_TUNING.attempts; a++) {
    const ang = rand() * 6.283;
    const dist = (opts.near ?? 1.5) + rand() * spread;
    _v.copy(_t1).multiplyScalar(Math.cos(ang)).addScaledVector(_t2, Math.sin(ang));
    offsetDir(centre, _v, dist, r, out);
    const late = a >= ANIMAL_TUNING.attempts - 6;
    if (!(late ? spotIsDry(planet, out) : spotIsWalkable(planet, out))) continue;
    const e = new Entity(planet, kind, out, { rand });
    scene.add(e.mesh);
    return e;
  }
  return null;
}

// Put one villager on the ground near `dir`, or null if there is only water
// and cliff within reach. The same search spawnAnimal runs, for the same
// reason: a body dropped on a cliff face is a body that falls off the world.
// Exported because main.js needs to raise a gang of builders on a plot that
// did not exist when the world was populated.
export function spawnVillager(planet, scene, dir, job = 'farmer', opts = {}) {
  const rand = opts.rand ?? Math.random;
  const centre = _v2.copy(dir).normalize();
  const r = planet.surfaceRadiusAtDir(centre.x, centre.y, centre.z);
  const spread = opts.spread ?? 4;
  const out = new THREE.Vector3();
  tangentBasis(centre, _t1, _t2);
  for (let a = 0; a < 24; a++) {
    const ang = rand() * 6.283;
    const dist = (opts.near ?? 1.5) + rand() * spread;
    _v.copy(_t1).multiplyScalar(Math.cos(ang)).addScaledVector(_t2, Math.sin(ang));
    offsetDir(centre, _v, dist, r, out);
    // The last third of the tries drop the roof test and keep the water one.
    // A village hemmed in by its own buildings still has to get its people:
    // somebody on a ridge is a blemish, a village with nobody in it is a bug.
    if (!(a < 16 ? spotIsWalkable(planet, out) : spotIsDry(planet, out))) continue;
    const e = new Entity(planet, 'villager', out, {
      job, rand, bound: !!opts.bound, waypoints: opts.waypoints ?? null,
      sex: opts.sex, village: opts.village ?? null,
    });
    scene.add(e.mesh);
    return e;
  }
  return null;
}

// Raise the chief of one settlement. Exported because villages are not all
// generated at world load — faces come in as the player travels — and a
// village that turned up an hour into a session still has to have somebody in
// charge of it. main.js calls this for any named site that has no chief yet.
export function spawnChief(planet, scene, site, rand = Math.random) {
  if (!site || !site.name || site.serai) return null;
  const seat = site.seat;
  let d = null, radius = null;
  if (seat) {
    const c = dirFromCell(seat.f, seat.u + 0.5, seat.v + 0.5);
    d = new THREE.Vector3(c[0], c[1], c[2]).normalize();
    // THE TOP of the throne's cell, not the middle of it. The enthroned pose
    // (see the 'sit' branch of pose()) drops the whole rig by 1.30 — half a
    // block for the seat, which sits 0.5 up its cell, and 0.81 for where a
    // body's hips are — and that sum is measured from FEET STANDING ON THE
    // BLOCK. Pinning him half a block lower put his hips under the seat, so
    // he sat inside his own throne with its arms across his chest and his
    // legs through the base: a man in a chair rather than on one.
    radius = R0 + seat.h + 1;
  } else {
    const c = new THREE.Vector3(...site.dir).normalize();
    d = c;
    if (!spotIsWalkable(planet, c)) {
      const r0 = planet.surfaceRadiusAtDir(c.x, c.y, c.z);
      tangentBasis(c, _t1, _t2);
      for (let a = 0; a < 40; a++) {
        const ang = rand() * 6.283;
        _v.copy(_t1).multiplyScalar(Math.cos(ang)).addScaledVector(_t2, Math.sin(ang));
        offsetDir(c, _v, 2 + rand() * 8, r0, _v2);
        if (spotIsWalkable(planet, _v2)) { d = _v2.clone(); break; }
      }
    }
  }
  const e = new Entity(planet, 'villager', d, {
    job: 'chief', sex: 'man', rand, village: site,
    bound: true, waypoints: [d.clone()],
    ...(radius === null ? {} : { buried: true, radius }),
  });
  e.wp = 0;
  // FACE THE DOOR. The throne's back is against the far wall, so the man in it
  // should be looking down the length of the room at whoever just walked in.
  // The constructor's default heading is a tangent derived from the world axis
  // and has nothing to do with the building, so half the chiefs held court
  // staring at a side wall with their chair pointed the right way.
  //
  // A village hall is always laid out with its door on the -v side of the
  // throne, so that is the default; a seat that knows better — the city
  // hall's dais can stand against any of the four walls — names the cell it
  // wants looked at in `gaze`, and the man on it turns that way instead.
  if (seat) {
    const g = seat.gaze ?? { u: seat.u, v: seat.v - 1 };
    const a = dirFromCell(seat.f, seat.u + 0.5, seat.v + 0.5);
    const b = dirFromCell(seat.f, g.u + 0.5, g.v + 0.5);
    _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    _v.addScaledVector(e.up, -_v.dot(e.up));
    if (_v.lengthSq() > 1e-8) e.heading.copy(_v).normalize();
    e.placeMesh();
  }
  e.order = 'sit';
  e.state = 'sit';
  e.chief = true;
  site.chief = e;
  scene.add(e.mesh);
  return e;
}

// THE SHOPKEEPERS. One behind every counter village.js recorded, from a salt
// of its own so that adding them moved nothing that was already in a world.
// They are `bound` and their patrol is a single stop — a shopkeeper who
// wanders off is a shop with nobody in it, which is worse than no shop.
//
// AND THEY STAND INSIDE A BUILDING, which is the whole reason there were none.
// This asked `spotIsWalkable` whether the keeper's spot would do, and that
// question is "is this a place to drop somebody who has no business anywhere
// in particular" — not in the water, and NOT ON A ROOF. A man behind a counter
// is under a roof by definition: `surfaceRadiusAtDir` answers the ridge over
// his head, the test said "that is a building", and every shopkeeper on the
// planet was skipped. Ten shops, no keepers, and a player standing in an empty
// room wondering how to buy anything.
//
// The keeper's cell is one the generator worked out exactly, so it takes the
// other door — `buried` pins the radius to the floor he is standing on, and
// `avoidsWater` goes with it, because burying somebody otherwise takes their
// water sense with it. See "Where a person may be PUT" in CLAUDE.md.
//
// Exported because a village that comes alive an hour into a session was never
// in populate's list, and a shop with nobody behind the counter is the thing
// this whole file exists to prevent. main.js calls it as you travel.
export function spawnKeepers(planet, scene, seed, out = [], have = null,
  near = null) {
  const srand = mulberry32(seed ^ 0x5407ee);
  const made = [];
  // A village world has a dozen counters and the cap covers them all. A CITY
  // has a counter per shopfront, planet-wide — so when a position is given,
  // the cap goes to the counters nearest it rather than to whichever face
  // was built first. Keepers already placed stay placed (`have`), so walking
  // the planet staffs it as you go.
  let shops = planet.shopList ?? [];
  if (near && shops.length > SHOP_TUNING.cap) {
    const len = Math.hypot(near.x, near.y, near.z) || 1;
    const nx = near.x / len, ny = near.y / len, nz = near.z / len;
    const dot = (sh) => sh.keeper.dir[0] * nx + sh.keeper.dir[1] * ny
      + sh.keeper.dir[2] * nz;
    shops = shops.slice().sort((a, b) => dot(b) - dot(a));
  }
  for (const sh of shops.slice(0, SHOP_TUNING.cap)) {
    // ...and never twice for the same counter. `have` is whatever is already
    // in the world, so this is idempotent and can be called every few seconds
    // as the player walks.
    if (have && have.some((e) => !e.dead && e.shop === sh)) continue;
    const d = new THREE.Vector3(...sh.keeper.dir).normalize();
    if (!spotIsDry(planet, d)) continue;
    const e = new Entity(planet, 'villager', d, {
      job: 'trader', waypoints: [d.clone()], rand: srand, bound: true,
      buried: true, radius: R0 + (sh.keeper.h ?? 0) + 0.001,
      avoidsWater: true,
    });
    // ...and TURNED TO FACE IT. A spawned villager's heading is whatever
    // tangent the constructor happens to pick, which for a man who never walks
    // anywhere is the heading he keeps all game — so half the shopkeepers on
    // the planet served the back wall, and it read worst in a city kiosk,
    // where the booth is three cells long and there is nothing else in it to
    // look at. `at` is the middle of his own counter; the radial part of the
    // difference is dropped because a heading is tangential by definition.
    if (sh.keeper.at) {
      const c = new THREE.Vector3(...sh.keeper.at);
      c.addScaledVector(d, -c.dot(d));
      if (c.lengthSq() > 1e-10) e.heading.copy(c.normalize());
    }
    // What this one is standing behind. main.js reads it: pointing at the
    // shopkeeper opens the same window the counter does, which is what a
    // player tries first.
    e.shop = sh;
    e.wp = 0;
    scene.add(e.mesh);
    out.push(e);
    made.push(e);
  }
  return made;
}

// THE BARTENDERS. One behind every counter village.js laid in a café or a pub,
// from a salt of its own so that adding them moved nothing that was already in
// a world.
//
// It is the shopkeeper's office in a different room, and it is deliberately
// the shopkeeper's code: `bound` to one stop, `buried` so the radius comes
// from the floor he was raised on rather than from a height field that answers
// the ridge over his head, `avoidsWater` alongside it because burying somebody
// otherwise takes their water sense with them, and turned to face his own
// counter because a spawned villager's heading is whatever tangent the
// constructor happened to pick — which for a man who never walks anywhere is
// the heading he keeps all game. See spawnKeepers above; every line of this
// was paid for there.
//
// The evening is the whole reason he exists. A village walks into its café or
// its pub for the hour before bed, sits down at twelve tables, and until now
// the room they walked into had nobody serving. A bar with a man behind it is
// a bar; a bar with nobody behind it is furniture.
export function spawnBarkeeps(planet, scene, seed, out = [], have = null,
  near = null) {
  const srand = mulberry32(seed ^ 0xba2ee9);
  const made = [];
  let rooms = (planet.cafes ?? []).filter((c) => c.keeper);
  // Same cap and the same reason as the counters: a village world has a dozen
  // rooms and the cap covers the lot, but the nearest ones go first so that
  // walking the planet staffs it as you go.
  if (near && rooms.length > SHOP_TUNING.cap) {
    const len = Math.hypot(near.x, near.y, near.z) || 1;
    const nx = near.x / len, ny = near.y / len, nz = near.z / len;
    const dot = (c) => c.keeper.dir[0] * nx + c.keeper.dir[1] * ny
      + c.keeper.dir[2] * nz;
    rooms = rooms.slice().sort((a, b) => dot(b) - dot(a));
  }
  for (const c of rooms.slice(0, SHOP_TUNING.cap)) {
    // ...and never twice for the same bar. `have` is whatever is already in
    // the world, so this is idempotent and can be called every few seconds as
    // the player walks.
    if (have && have.some((e) => !e.dead && e.bar === c)) continue;
    const d = new THREE.Vector3(...c.keeper.dir).normalize();
    if (!spotIsDry(planet, d)) continue;
    const e = new Entity(planet, 'villager', d, {
      job: 'barkeep', sex: 'man', waypoints: [d.clone()], rand: srand,
      bound: true, buried: true, avoidsWater: true,
      radius: R0 + (c.keeper.h ?? 0) + 0.001,
    });
    if (c.keeper.at) {
      const at = new THREE.Vector3(...c.keeper.at);
      at.addScaledVector(d, -at.dot(d));
      if (at.lengthSq() > 1e-10) e.heading.copy(at.normalize());
    }
    // Which room this one keeps. main.js reads it the way it reads `shop`:
    // it is what says he is an office and not one of the village's own people,
    // so the streaming never empties him out and the head count never counts
    // him twice.
    e.bar = c;
    e.wp = 0;
    e.placeMesh();
    scene.add(e.mesh);
    out.push(e);
    made.push(e);
  }
  return made;
}

// THE OLD MAN IN THE CAFÉ, on the barman's terms exactly: one per café that
// has a pipe in it, bound to his chair, never in bed, never emptied out with
// the rest, put back the moment he is gone. He takes the first seat that has
// a pipe to hand (see markPipes in village.js) and the seat is marked as his,
// so the café hour seats the village round him rather than on him.
//
// A café is a room where somebody is smoking. Before this the pipes were lit
// all day and nobody was on them until the hour before bed, which is a
// tobacconist's window and not a café.
export function spawnElders(planet, scene, seed, out = [], have = null,
  near = null) {
  const srand = mulberry32(seed ^ 0xe1de5);
  const made = [];
  let rooms = (planet.cafes ?? []).filter((c) => c.kind === 'café'
    && (c.seats ?? []).some((s) => s.pipe));
  if (near && rooms.length > SHOP_TUNING.cap) {
    const len = Math.hypot(near.x, near.y, near.z) || 1;
    const nx = near.x / len, ny = near.y / len, nz = near.z / len;
    const dot = (c) => {
      const s = c.seats.find((x) => x.pipe);
      const d = dirFromCell(c.f, s.u + 0.5, s.v + 0.5);
      return d[0] * nx + d[1] * ny + d[2] * nz;
    };
    rooms = rooms.slice().sort((a, b) => dot(b) - dot(a));
  }
  for (const c of rooms.slice(0, SHOP_TUNING.cap)) {
    if (have && have.some((e) => !e.dead && e.elder === c)) continue;
    const s = c.seats.find((x) => x.pipe);
    // still a chair, with the pipe still on the table? somebody may have
    // taken either up
    if (!CS.isChair?.(planet.get(c.f, s.u, s.v, s.h))) continue;
    const d0 = dirFromCell(c.f, s.u + 0.5, s.v + 0.5);
    const d = new THREE.Vector3(d0[0], d0[1], d0[2]).normalize();
    if (!spotIsDry(planet, d)) continue;
    // he faces the table, which is the side his chair's back is not on
    const du = [1, -1, 0, 0][s.facing], dv = [0, 0, 1, -1][s.facing];
    const l0 = dirFromCell(c.f, s.u - du + 0.5, s.v - dv + 0.5);
    const look = new THREE.Vector3(l0[0], l0[1], l0[2]).normalize();
    const e = new Entity(planet, 'villager', d, {
      job: 'elder', sex: 'man', waypoints: [d.clone()], rand: srand,
      bound: true, buried: true, avoidsWater: true,
      radius: R0 + s.h + 1 + 0.001,
    });
    e.elder = c;
    e.seatAt = { dir: d, h: s.h, look };
    s.elder = true;
    e.wp = 0;
    e.heading.copy(look).sub(d).addScaledVector(d, -look.clone().sub(d).dot(d));
    if (e.heading.lengthSq() < 1e-10) e.heading.set(1, 0, 0);
    e.heading.normalize();
    e.placeMesh();
    scene.add(e.mesh);
    out.push(e);
    made.push(e);
  }
  return made;
}

// THE FARMHANDS — one at every field and one at every pen, on every world.
//
// The player's rule, and it is a good one: "each time we have a small field of
// vegetables we should have a farmer, and the same for the animals." A fenced
// plot of ripe wheat with nobody in it is scenery; a woman standing in it with
// a hoe is a village that grows its own food. Same for a fold of pigs — and in
// the city's byre, where a floor IS a pen, that rule is also what puts one
// farmer on every floor of the building.
//
// It is an OFFICE, exactly like the man behind the counter: spawned down a
// path of its own, idempotent, and put straight back the moment it is gone.
// `e.tends` is what it holds — the pen or the field record — and main.js reads
// that to keep them out of the village's own head count, because a hand posted
// to a field is not one of the souls the books are keeping.
//
// Exported and called as the player walks (see ensureFolk in main.js), because
// a planet's worth of fields is far more than a planet's worth of bodies: the
// nearest few dozen get their hands and the rest are hedgerow until you
// arrive.
export const FARM_TUNING = { cap: 28 };

// Everything on this planet that wants somebody standing in it, as one list.
// A pen carries its own `keep` when the generator worked one out — the byre's
// floors do — and a field is stood in just inside its own gate.
function tendable(planet) {
  const out = [];
  for (const pen of planet.penList ?? []) {
    const keep = pen.keep ?? {
      u: pen.u + (pen.w >> 1), v: pen.v + (pen.d >> 1), h: pen.h ?? null,
    };
    out.push({ at: pen, f: pen.f, keep, kind: 'pen' });
  }
  for (const site of planet.villageSites ?? []) {
    for (const fm of site.farms ?? []) {
      if (!fm || fm.base == null) continue;
      // his own gate, standing on the rows: the gate is the one cell of the
      // fence that is air, and the farmland under it is the floor
      const g = fm.gate ?? { u: fm.u0 + (fm.w >> 1), v: fm.v0 };
      out.push({ at: fm, f: fm.f, site,
        keep: { u: g.u, v: g.v, h: fm.base + 1 }, kind: 'field' });
    }
  }
  return out;
}

export function spawnFarmhands(planet, scene, seed, out = [], have = null,
  near = null) {
  const frand = mulberry32(seed ^ 0xfa12b7);
  const made = [];
  let jobs = tendable(planet);
  // The nearest ones first, and only as many as the cap. A city carries a
  // byre every few blocks and a farming world carries a plot every village;
  // either way what matters is the ground the player is standing on.
  if (near && jobs.length > FARM_TUNING.cap) {
    const len = Math.hypot(near.x, near.y, near.z) || 1;
    const nx = near.x / len, ny = near.y / len, nz = near.z / len;
    const dot = (j) => {
      const c = dirFromCell(j.f, j.keep.u + 0.5, j.keep.v + 0.5);
      return c[0] * nx + c[1] * ny + c[2] * nz;
    };
    jobs = jobs.slice().sort((a, b) => dot(b) - dot(a));
  }
  for (const j of jobs.slice(0, FARM_TUNING.cap)) {
    if (have && have.some((e) => !e.dead && e.tends === j.at)) continue;
    const c = dirFromCell(j.f, j.keep.u + 0.5, j.keep.v + 0.5);
    const d = new THREE.Vector3(c[0], c[1], c[2]).normalize();
    // A KNOWN CELL, so it is pinned like the shopkeeper and not dropped by
    // the height field: a farmer at a field is standing on somebody's rows
    // and a farmer on the byre's third floor is under two more floors and a
    // roof. `avoidsWater` goes with `buried` or burying one takes its water
    // sense with it — see CLAUDE.md.
    const pinned = j.keep.h != null;
    if (!pinned && !spotIsWalkable(planet, d)) continue;
    if (pinned && !spotIsDry(planet, d)) continue;
    const e = new Entity(planet, 'villager', d, {
      job: 'farmer', rand: frand, bound: true, waypoints: [d.clone()],
      ...(pinned
        ? { buried: true, radius: R0 + j.keep.h + 0.001, avoidsWater: true }
        : {}),
    });
    // What this one looks after, and the parish it stands in when there is
    // one. `village` is deliberately NOT set: that field is what the village
    // streaming empties a settlement by, and a hand posted to a field is not
    // one of its people — he is an office, kept by plain distance from the
    // player like the byre on the far side of a city that belongs to no
    // settlement at all. See ensureFolk in main.js.
    e.tends = j.at;
    e.parish = j.site ?? null;
    e.wp = 0;
    scene.add(e.mesh);
    out.push(e);
    made.push(e);
  }
  return made;
}

// THE CONSTABLE — the chief of the watch, and the third of the three people
// in a village you can talk to.
//
// He is not a soldier with a better hat: a soldier holds a spot, and this one
// decides which spots are held. He stands on the green where anybody can find
// him, he does not walk the round, and nothing kills him — for the same reason
// nothing kills the chief or the man at the counter: there is one per village
// and no way to raise another, and a village that has lost the only person who
// can answer for its peace has lost a third of what a village IS.
//
// One per settlement, spawned wherever the village is live. `bound` with a
// single waypoint keeps him where he was put.
export function spawnConstable(planet, scene, site, rand = Math.random) {
  if (!site || !site.name || site.serai) return null;
  const c = new THREE.Vector3(...site.dir).normalize();
  let d = c;
  // The middle of the green is the fountain, so he stands a few paces off it —
  // the same ring everything else that is not the fountain stands on.
  const r0 = planet.surfaceRadiusAtDir(c.x, c.y, c.z);
  tangentBasis(c, _t1, _t2);
  let found = false;
  for (let a = 0; a < 40; a++) {
    const ang = rand() * 6.283;
    _v.copy(_t1).multiplyScalar(Math.cos(ang)).addScaledVector(_t2, Math.sin(ang));
    offsetDir(c, _v, 4 + rand() * 4, r0, _v2);
    if (spotIsWalkable(planet, _v2)) { d = _v2.clone(); found = true; break; }
  }
  if (!found && !spotIsWalkable(planet, c)) return null;
  const e = new Entity(planet, 'villager', d, {
    job: 'constable', sex: rand() < 0.5 ? 'woman' : 'man', rand,
    village: site, bound: true, waypoints: [d.clone()],
  });
  e.wp = 0;
  e.order = 'guard';
  e.constable = true;
  site.constable = e;
  scene.add(e.mesh);
  return e;
}

// TWO MEN ON A DOOR. A guard posted rather than patrolling: one waypoint, and
// he goes back to it after every fight, which is what a post IS. He keeps the
// soldier brain whole — he sees the undead and he sees an outlaw at the same
// range everybody else does — so this costs no new behaviour at all.
//
// `onWatch` is set on all of them, and that is the point: a post is not a
// shift. The men on the chief's arch and the men on the shop door are there
// every hour of every day, and the barracks rota is somebody else's problem.
export function spawnPosted(planet, scene, seed = 1, list = [], only = null) {
  const rand = mulberry32(seed ^ 0x70571d);
  const jobs = [];
  const sites = only ? [only] : (planet.villageSites ?? []);
  for (const site of sites) {
    for (const spot of site.posts ?? []) jobs.push([spot, site, 'hall']);
    // ...and the shops that belong to this settlement. They are found by cell
    // rather than carried on the site because village.js writes shopList flat,
    // and the guards have to belong to a VILLAGE or the streaming in main.js
    // cannot tell whether they are near enough to be worth having.
    for (const sh of planet.shopList ?? []) {
      if (sh.f !== site.f) continue;
      if (Math.hypot(sh.u0 - site.u, sh.v0 - site.v) > 60) continue;
      if (sh.postedTo && sh.postedTo !== site) continue;
      sh.postedTo = site;
      for (const spot of sh.posts ?? []) jobs.push([spot, site, 'shop']);
    }
  }
  for (let i = 0; i < jobs.length; i++) {
    const [spot, site, what] = jobs[i];
    const d = new THREE.Vector3(...spot.dir).normalize();
    // NOT spotIsWalkable. That reads the height field, which answers the ridge
    // of a roof for anything standing under an eave — and a man on a door is
    // standing under the eave by definition, so it threw away one of every
    // pair and half the chief's halls had a single guard on them. He is put on
    // the threshold's own course instead and finds his feet from there, the
    // same way the chief and the priest do.
    const arm = SOLDIER_ARM_LIST[i % SOLDIER_ARM_LIST.length];
    const e = new Entity(planet, 'villager', d, {
      job: 'soldier', arm, rand, village: site,
      bound: true, waypoints: [d.clone()],
      // `buried` here means only "I know exactly which cell to stand him in"
      // — it is what pins the radius to the door's own floor instead of to
      // the height field, which over a doorstep is the eave. It is NOT a man
      // underground, and it must not quietly take his water sense with it:
      // avoidsWater defaults to !buried, so a guard who left his post to see
      // off a zombie waded into the sea after it and stood there.
      // ...and he stands ON the threshold's floor, not half a block over it.
      // `spot.h` is the door's own cell, so the boards under it top out at
      // R0 + h: the half block that used to be added here is the daylight the
      // player could see under every guard in the world.
      buried: true, avoidsWater: true, radius: R0 + spot.h,
    });
    e.wp = 0;
    e.onWatch = true;          // a post is not a shift: he is on it all night
    e.postedAt = what;
    if (spot.face) {
      const f = new THREE.Vector3(...spot.face).normalize().sub(d);
      f.addScaledVector(e.up, -f.dot(e.up));
      if (f.lengthSq() > 1e-8) e.heading.copy(f).normalize();
      e.placeMesh();
    }
    scene.add(e.mesh);
    list.push(e);
  }
  return list;
}

// THE PRIEST. One per house of worship, standing in front of the altar or the
// niche and facing the door, so you meet him coming up the aisle. Bound to one
// stop like the shopkeeper is: a priest who wandered off down the lane is a
// church with nobody in it, which is worse than no church.
//
// He is `posted` rather than `forVillage`: no chief gives him orders, he does
// not go out to the fields, and he does not take the shilling. What he does is
// ANSWER — see the talk panel in main.js — and the answers come out of the
// same chronicle the almanac reads, so he cannot tell you anything you could
// not have counted yourself.
export function spawnPriests(planet, scene, seed = 1, list = []) {
  const rand = mulberry32(seed ^ 0x9e1e57);
  for (const spot of planet.priestList ?? []) {
    const d = new THREE.Vector3(...spot.dir).normalize();
    const e = new Entity(planet, 'villager', d, {
      job: 'priest', sex: 'man', rand, bound: true,
      waypoints: [d.clone()],
      // `buried` here means only "I know exactly which cell to stand him in"
      // — it is what pins the radius to the door's own floor instead of to
      // the height field, which over a doorstep is the eave. It is NOT a man
      // underground, and it must not quietly take his water sense with it:
      // avoidsWater defaults to !buried, so a guard who left his post to see
      // off a zombie waded into the sea after it and stood there.
      buried: true, avoidsWater: true, radius: R0 + spot.h + 0.5,
    });
    e.wp = 0;
    // FACE THE ROOM. He stands at the altar end, so "the middle of the
    // building" is down the nave and the door is beyond it — without this his
    // heading is the constructor's default tangent, which knows nothing about
    // the church, and half the priests on a planet preached at a wall.
    const a = dirFromCell(spot.f, spot.u + 0.5, spot.v + 0.5);
    const c = dirFromCell(spot.f, spot.u0 + spot.w / 2, spot.v0 + spot.d / 2);
    _v.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    _v.addScaledVector(e.up, -_v.dot(e.up));
    if (_v.lengthSq() > 1e-8) e.heading.copy(_v).normalize();
    e.placeMesh();
    e.priest = spot;
    e.village = null;      // filled in by main.js, which knows where villages are
    scene.add(e.mesh);
    list.push(e);
  }
  return list;
}

// A herd is one species in one place: mixed animals scattered evenly read as
// a zoo, and it is the clumping that makes a field look farmed.
function spawnHerd(planet, scene, centre, kind, count, rand, list) {
  let made = 0;
  for (let i = 0; i < count; i++) {
    const e = spawnAnimal(planet, scene, centre, kind, { rand });
    if (!e) continue;
    list.push(e);
    made++;
  }
  return made;
}

// Herds near the villages first — livestock belongs where people are — then a
// few wild ones set back, so the countryside between villages is not empty.
// Every herd centre is worked out before any spawning starts, because
// spawnAnimal claims the shared tangent scratch vectors as it goes.
function populateAnimals(planet, scene, sites, rand, list) {
  const T = ANIMAL_TUNING;
  // ...and whatever was sent from KherveCAD to live in the wild
  const pool = [...SPECIES, ...customCreatureKinds()
    .filter((k) => ANIMAL_BODY[k].wild)];
  // A village's herd is its livestock, so a person or a monster from
  // KherveCAD is never one — a field of six identical men beside the green,
  // or a pack of trolls grazing it, is not a village. They are drawn for the
  // wild herds like anything else, and turn up there in ones and twos.
  const tame = pool.filter((k) => !ANIMAL_BODY[k].person && !ANIMAL_BODY[k].monster);
  const pick = () => pool[Math.floor(rand() * pool.length)];
  const pickTame = () => {
    const k = pick();
    return tame.includes(k) ? k : tame[Math.floor(rand() * tame.length)] ?? k;
  };
  const herdOf = (k) => (ANIMAL_BODY[k].monster ? 1 + Math.floor(rand() * 2)
    : ANIMAL_BODY[k].person ? 2 : T.herdSize);
  const village = [];
  const wild = [];

  for (const site of sites) {
    village.push({
      dir: new THREE.Vector3(...site.dir).normalize(),
      kind: pickTame(), count: T.perVillage,
    });
  }

  const anchor = sites.length
    ? new THREE.Vector3(...sites[0].dir).normalize()
    : new THREE.Vector3(0, 1, 0);
  const ar = planet.surfaceRadiusAtDir(anchor.x, anchor.y, anchor.z);
  tangentBasis(anchor, _t1, _t2);
  for (let i = 0; i < T.wildHerds; i++) {
    const ang = rand() * 6.283;
    // scaled to the world: a fixed distance is next door on a big planet and
    // right round the far side on a small one
    const dist = R * (0.2 + rand() * 0.4);
    _v.copy(_t1).multiplyScalar(Math.cos(ang)).addScaledVector(_t2, Math.sin(ang));
    const c = offsetDir(anchor, _v, dist, ar, new THREE.Vector3());
    const kind = pick();
    wild.push({ dir: c, kind, count: herdOf(kind) });
  }

  // Interleaved, because the cap is reached long before the list runs out on
  // a big world: taking all the village herds first would mean the open
  // country never gets any at all.
  let budget = T.max;
  const total = village.length + wild.length;   // both lists shrink as we go
  for (let i = 0; i < total && budget > 0; i++) {
    const src = (i % 2 === 0 ? village : wild);
    const other = (i % 2 === 0 ? wild : village);
    const h = src.shift() ?? other.shift();
    if (!h) break;
    budget -= spawnHerd(planet, scene, h.dir, h.kind,
      Math.min(h.count, budget), rand, list);
  }
}

// The ice caps, and what lives on them.
//
// A cap is a band of latitude, so a spot on one is a direction with a big |y|
// and a random spin about the axis — no search and no rejection sampling. The
// bears are spread over both poles rather than herded: they are the one
// animal here that is placed because of WHERE it is rather than because of
// what it is near.
const POLAR_LAT = 0.86;       // |y| a bear will not come south of
const _pv = new THREE.Vector3();

function populateBears(planet, scene, rand, list, count) {
  let made = 0;
  for (let i = 0; i < count * 6 && made < count; i++) {
    const north = i % 2 === 0;
    const y = POLAR_LAT + rand() * (1 - POLAR_LAT) * 0.92;
    const rr = Math.sqrt(Math.max(0, 1 - y * y));
    const a = rand() * 6.283;
    _pv.set(Math.cos(a) * rr, north ? y : -y, Math.sin(a) * rr).normalize();
    if (!spotIsWalkable(planet, _pv)) continue;   // open water, not pack ice
    const e = new Entity(planet, 'bear', _pv, { rand });
    scene.add(e.mesh);
    list.push(e);
    made++;
  }
  return made;
}

// ---------------------------------------------------------------------------
// the graveyard watch
//
// The undead that are PLACED rather than spawned. Every zombie in this game so
// far has arrived out of the night near the player and burned off at dawn,
// which is a weather system, not a place you can go and find something. These
// belong to a churchyard: they stand in it, or in the dark under it, they do
// not burn, and they do not follow you home (see Entity.homeward).
//
// Numbers are small on purpose. Every one of them costs a physics step per
// frame wherever the player is, and a radius-800 world froze outright at 1268
// entities — so a handful per site, at a handful of sites, and the rest of the
// planet's cemeteries are quiet ground with a stair in them.
export const CRYPT_TUNING = {
  sites: 3,           // graveyards that get a garrison at all
  aboveSkeletons: 1,  // ...on the grass, per site
  aboveZombies: 1,
  belowSkeletons: 2,  // ...and in the corridors below
  belowZombies: 2,
};

// A cell with two clear blocks over its floor, which is what standing in one
// needs. Used both above ground and below: the difference is only which h the
// caller hands in.
function standable(planet, f, u, v, h) {
  return planet.get(f, u, v, h + 1) === BLOCK.AIR
    && planet.get(f, u, v, h + 2) === BLOCK.AIR
    && planet.get(f, u, v, h) !== BLOCK.AIR;
}

function raise(planet, scene, f, u, v, h, kind, rand, list, buried) {
  const c = dirFromCell(f, u + 0.5, v + 0.5);
  const d = new THREE.Vector3(c[0], c[1], c[2]).normalize();
  const e = new Entity(planet, kind, d, {
    rand, bound: true, buried, radius: R0 + h + 1,
  });
  scene.add(e.mesh);
  list.push(e);
  return e;
}

function populateCrypts(planet, scene, rand, list) {
  const T = CRYPT_TUNING;
  const yards = planet.graveyards ?? [];
  for (let i = 0; i < yards.length && i < T.sites; i++) {
    const y = yards[i];
    // Above ground: on the plots, never in the aisle and never inside the
    // chapel — a guard is something you see standing among the stones as you
    // come through the gate, not something already indoors.
    let want = T.aboveSkeletons + T.aboveZombies, made = 0;
    for (let a = 0; a < 40 && made < want; a++) {
      const u = y.u0 + 2 + ((rand() * (y.w - 4)) | 0);
      const v = y.v0 + 2 + ((rand() * (y.d * 0.5)) | 0);
      if (!standable(planet, y.f, u, v, y.g)) continue;
      raise(planet, scene, y.f, u, v, y.g,
        made < T.aboveSkeletons ? 'skeleton' : 'zombie', rand, list, false);
      made++;
    }
    // ...and below, spread over the chambers rather than clumped at the foot
    // of the stair: the crypt should get worse as you go in, not meet you at
    // the door with everything it has.
    const rooms = y.rooms ?? [];
    if (!rooms.length) continue;
    want = T.belowSkeletons + T.belowZombies;
    made = 0;
    for (let a = 0; a < 60 && made < want; a++) {
      const room = rooms[(rand() * rooms.length) | 0];
      const u = room.u + ((rand() * 3) | 0) - 1;
      const v = room.v + ((rand() * 3) | 0) - 1;
      if (!standable(planet, room.f, u, v, room.h)) continue;
      raise(planet, scene, room.f, u, v, room.h,
        made < T.belowSkeletons ? 'skeleton' : 'zombie', rand, list, true);
      made++;
    }
  }
}

// ---------------------------------------------------------------------------
// mountain goats
//
// Every other herd in this file is placed by its distance from something — a
// village, another herd, the pole. A goat is placed by the SHAPE of the
// ground under it, which is the only siting rule here that reads the terrain
// rather than the map.
//
// Two tests, both cheap, both off the height field everything else already
// uses:
//
//   height  the spot has to stand well above the planet's mean radius. The
//           snow line is the world's own idea of "high" when it has one, so
//           goats end up just under the snow on a world with peaks and on the
//           highest ground there is on a world without.
//   slope   the four neighbours a couple of blocks out have to differ from
//           it by a real margin. Flat ground at altitude is a plateau, and a
//           goat on a plateau is a sheep with horns.
const GOAT_TUNING = {
  herds: 3,           // how many bands of them a world gets
  size: 3,            // goats per band
  spread: 7,          // blocks a band is scattered over
  attempts: 400,      // candidate directions tried per herd — see below
  minSlope: 2.6,      // blocks of height change over the sample span
  span: 3,            // ...measured this far out
  band: 9,            // blocks below the world's best ground still counts high
  apart: 30,          // blocks between two bands, so they are not all on one peak
  wanderArc: 16,      // they hold to their crag rather than roaming
};

// How much the ground rises and falls around a direction, in blocks.
function slopeAt(planet, dir, span) {
  const r = planet.surfaceRadiusAtDir(dir.x, dir.y, dir.z);
  tangentBasis(dir, _sf, _sr);
  let lo = Infinity, hi = -Infinity;
  for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    _sz.copy(_sf).multiplyScalar(a).addScaledVector(_sr, b);
    offsetDir(dir, _sz, span, r, _sp);
    const h = planet.surfaceRadiusAtDir(_sp.x, _sp.y, _sp.z);
    if (h < lo) lo = h;
    if (h > hi) hi = h;
  }
  return { r, relief: hi - lo };
}

function populateGoats(planet, scene, rand, list) {
  const T = GOAT_TUNING;

  // SURVEY FIRST, then choose. An earlier pass tested each candidate against
  // a fixed bar taken off the snow line and spawned the first ones that
  // cleared it — which put goats on most worlds and none at all on a world
  // whose peaks happened to top out just under that bar. The mountains of a
  // given seed are whatever that seed grew; the only bar that means anything
  // is one measured against them.
  //
  // Drawing the whole survey up front also keeps this deterministic in the
  // simplest possible way: the number of rand() calls here is fixed at
  // 2 * attempts whatever the terrain does, so nothing downstream shifts
  // because one world had more sea in it than another.
  const found = [];
  for (let i = 0; i < T.attempts; i++) {
    const y = 2 * rand() - 1;
    const a = rand() * 6.283;
    const rr = Math.sqrt(Math.max(0, 1 - y * y));
    _v2.set(Math.cos(a) * rr, y, Math.sin(a) * rr).normalize();
    if (!spotIsWalkable(planet, _v2)) continue;      // sea, or a sheer face
    const { r, relief } = slopeAt(planet, _v2, T.span);
    if (relief < T.minSlope) continue;               // a plateau, not a crag
    found.push({ dir: _v2.clone(), r, relief });
  }
  if (!found.length) return 0;

  // Highest first, and then keep only what is within a band of the best
  // ground this world actually has. `floor` stops a flat world putting
  // "mountain" goats on a hillock: there still has to be some relief above
  // the mean, it just does not have to be THIS world's snow line.
  found.sort((a, b) => b.r - a.r);
  const best = found[0].r;
  const floor = Math.max(R * 1.012, best - T.band);

  let herds = 0;
  for (const spot of found) {
    if (herds >= T.herds) break;
    if (spot.r < floor) break;                       // sorted: nothing better left
    // Keep the bands apart, or three "herds" land on one summit and the rest
    // of the range is empty.
    let clash = false;
    for (const other of found) {
      if (!other.taken) continue;
      if (arcBetween(spot.dir, other.dir, spot.r) < T.apart) { clash = true; break; }
    }
    if (clash) continue;

    let made = 0;
    for (let k = 0; k < T.size; k++) {
      const e = spawnAnimal(planet, scene, spot.dir, 'goat',
        { rand, spread: T.spread });
      if (!e) continue;
      // Tethered tight: the whole point is that they stay on the mountain.
      // A goat on the wander range a cow gets walks down off it in a minute.
      e.wanderArc = T.wanderArc;
      list.push(e);
      made++;
    }
    if (made > 0) { spot.taken = true; herds++; }
  }
  return herds;
}

// ---------------------------------------------------------------------------
// camels
//
// A camel belongs to the DESERT, and cubesphere.js only grows deserts on the
// bigger worlds — so on a small planet this pass finds nothing and there are
// no camels, which is the right answer rather than a gap to paper over.
//
// Siting is by the ground itself, not by latitude or by distance from
// anything: a candidate is kept only if the block under it is desert sand.
// That is the same discipline the goats use (they are sited by altitude and
// steepness), and it is what makes the animal read as belonging to the place
// instead of having been sprinkled near it.
const CAMEL_TUNING = {
  // Deserts are a few per cent of the surface, so a survey has to be wide
  // before it is reliable: at 260 samples a world in twelve found no sand at
  // all and simply had no camels on it, which reads as the feature being
  // broken rather than as the desert being empty. 600 costs six hundred
  // column reads once, against a world build that does millions.
  attempts: 600,   // candidate directions sampled over the whole globe
  herds: 3,        // dune fields that get one
  size: 3,         // camels per herd
  spread: 9,       // blocks a herd is scattered over
  wanderArc: 26,   // ...and how far from there they will stray
  apart: 60,       // keep the herds out of each other's sand
};

// Is this direction standing on desert? The surface radius is the ground, so
// the block AT it is the top of the column — the same read flowersNear does
// one cell higher for the thing growing on it.
function isDesertSpot(planet, dir) {
  const g = planet.surfaceRadiusAtDir(dir.x, dir.y, dir.z);
  return planet.blockAtWorld(dir.x * g, dir.y * g, dir.z * g)
    === BLOCK.SAND_ORANGE;
}

function populateCamels(planet, scene, rand, list) {
  const T = CAMEL_TUNING;
  // Survey first, then choose — the goats' rule, and for the goats' reason:
  // the number of rand() calls here has to be fixed whatever the terrain
  // turns out to be, or a world with more sand in it than another would
  // shift every draw made after this pass.
  const found = [];
  for (let i = 0; i < T.attempts; i++) {
    const y = 2 * rand() - 1;
    const a = rand() * 6.283;
    const rr = Math.sqrt(Math.max(0, 1 - y * y));
    _v2.set(Math.cos(a) * rr, y, Math.sin(a) * rr).normalize();
    if (!spotIsWalkable(planet, _v2)) continue;
    if (!isDesertSpot(planet, _v2)) continue;
    found.push(_v2.clone());
  }
  if (!found.length) return 0;

  let herds = 0;
  const taken = [];
  for (const dir of found) {
    if (herds >= T.herds) break;
    let clash = false;
    for (const other of taken) {
      if (arcBetween(dir, other, R) < T.apart) { clash = true; break; }
    }
    if (clash) continue;
    let made = 0;
    for (let k = 0; k < T.size; k++) {
      const e = spawnAnimal(planet, scene, dir, 'camel',
        { rand, spread: T.spread });
      if (!e) continue;
      e.wanderArc = T.wanderArc;
      list.push(e);
      made++;
    }
    if (made > 0) { taken.push(dir); herds++; }
  }
  return herds;
}

// ---------------------------------------------------------------------------
// bees and hives
//
// A hive is an ENTITY, not a block: cubesphere.js owns the block table and
// nothing here may add to it. That turns out to suit them — a hive that is an
// entity can hold a list of the flowers around it and a list of its own bees,
// which is exactly what makes the bees read as belonging to it.
// How much faster than his own street a man moves when he is on an errand.
// See the trades branch of thinkVillager: it covers the walk out to the job
// and the walk home with the load, which between them are most of a worker's
// day.
const WORK_PACE = 2.4;

// What a seated man can follow with his head alone. `arc` is the neck: 1.15
// radians is about sixty-five degrees, which is roughly as far as anybody
// turns their head without their shoulders going with it, and refusing to go
// past it is what stops the chief spinning his skull round to watch you walk
// behind his throne.
const LOOK = {
  near: 11,          // blocks ACROSS THE FLOOR: past this he watches nobody
  // ...and how far above or below his own floor still counts as the same
  // room. Distance has to be measured in these two pieces rather than as one
  // straight line, or a man standing on the roof of the hall is three blocks
  // from the chief underneath it and the chief sits there staring up at his
  // own ceiling.
  storey: 3,
  arc: 1.15,         // radians off his own facing that a neck will reach
  ease: 0.12,        // per frame, so the head turns instead of snapping
  // ...AND HOW FAR A CHIN GOES DOWN. He sits two steps up on a dais, so
  // anybody who walks up to speak to him is below him and close, and the head
  // only ever turned sideways — chin fixed UP at -0.04. Stand at the foot of
  // his own throne and you were looking at the underside of his jaw and the
  // top of his crown, which is not a face and reads as being ignored by
  // somebody who has just answered you.
  //
  // A neck pitches less than it yaws, and further down than up: you can drop
  // your chin to your chest and you cannot lay your head back nearly as far.
  down: 0.62,        // radians the chin comes down toward somebody below
  up: 0.30,          // ...and back, for somebody standing over him
  // Where the two pairs of eyes are, above their own feet. `watch` is a
  // standing body's position and not its eyes, and a chief measured against
  // somebody's BOOTS looks at the floor in front of them.
  eye: 1.5,          // a standing visitor's eyes, above their feet
  head: 1.45,        // ...and his own, above the seat he is sitting on
};

const HIVE_TUNING = {
  perVillage: 1,      // hives sited near each village
  bees: 4,            // bees per hive
  search: 14,         // blocks around a candidate spot searched for flowers
  samples: 90,        // how many directions in that circle are looked at
  minFlowers: 3,      // fewer than this and the spot is not a meadow
  attempts: 26,       // candidate spots per hive
  // A hive with nothing holding it up reads as a bug, and there is no block
  // here to hang one from — cubesphere.js is not this module's to add to. So
  // it STANDS in the meadow like a skep on a stand, which is what a hive
  // looked like for most of the history of keeping bees.
  lift: 0,
  // How much comb a hive holds, and how long one takes to come back. Four
  // minutes a comb is two of them in a village's day, which is a trickle
  // rather than an industry — honey is a luxury the shop sells dear, not a
  // thing a settlement lives off.
  comb: 3,
  fill: 240,
  // How long the hive stays angry at whoever robbed it. Taking the honey is
  // meant to cost something, and what it costs is being stung.
  anger: 9,
};

const FLOWER_LO = BLOCK.FLOWER_RED ?? 27;
const FLOWER_HI = BLOCK.FLOWER_BLUE ?? 29;

// The flowers within `search` blocks of a direction, as world positions.
// Sampled on a spiral rather than swept: a full search of a 14-block disc is
// six hundred column reads, and this gets the same answer for a tenth of it.
function flowersNear(planet, dir, T) {
  const out = [];
  const r = planet.surfaceRadiusAtDir(dir.x, dir.y, dir.z);
  tangentBasis(dir, _sf, _sr);
  for (let i = 0; i < T.samples; i++) {
    const a = i * 2.399963;                          // the golden angle
    const d = T.search * Math.sqrt((i + 0.5) / T.samples);
    _sz.copy(_sf).multiplyScalar(Math.cos(a)).addScaledVector(_sr, Math.sin(a));
    offsetDir(dir, _sz, d, r, _sp);
    const g = planet.surfaceRadiusAtDir(_sp.x, _sp.y, _sp.z);
    // A flower stands ON the ground, so it is the cell above the surface —
    // the same place wetAt looks for water over a lake bed.
    const rs = g + 0.5;
    const b = planet.blockAtWorld(_sp.x * rs, _sp.y * rs, _sp.z * rs);
    if (b >= FLOWER_LO && b <= FLOWER_HI) {
      out.push(_sp.clone().multiplyScalar(g));
    }
  }
  return out;
}

// WHAT A HIVE MAY STAND ON.
//
// A hive used to pick its spot on two tests — is it walkable, and are there
// flowers near it — and a village's road passes both. It is walkable by
// definition, and the flowers grow on the verge either side of it, so the
// flower test was actively STEERING hives onto the roadside: the player kept
// walking into a skep standing in the middle of the street.
//
// A hive belongs in the meadow. That means grass or the bare earth beside it
// and nothing anybody laid — not the path, not a field, not a floor, not the
// green. Testing the ground block is the whole rule, because every one of
// those is a block somebody put there.
const HIVE_GROUND = new Set([BLOCK.GRASS, BLOCK.DIRT]);
function standsOnMeadow(planet, dir) {
  // the cell topping out at the surface, which is the one being stood on
  const g = planet.surfaceRadiusAtDir(dir.x, dir.y, dir.z) - 0.5;
  return HIVE_GROUND.has(planet.blockAtWorld(dir.x * g, dir.y * g, dir.z * g));
}

function populateHives(planet, scene, sites, rand, list) {
  const T = HIVE_TUNING;
  for (const site of sites) {
    const centre = new THREE.Vector3(...site.dir).normalize();
    const r0 = planet.surfaceRadiusAtDir(centre.x, centre.y, centre.z);
    tangentBasis(centre, _t1, _t2);
    for (let n = 0; n < T.perVillage; n++) {
      let placed = false;
      for (let i = 0; i < T.attempts && !placed; i++) {
        const ang = rand() * 6.283;
        const dist = 10 + rand() * 22;               // outside the houses
        _v.copy(_t1).multiplyScalar(Math.cos(ang)).addScaledVector(_t2, Math.sin(ang));
        offsetDir(centre, _v, dist, r0, _v2);
        if (!spotIsWalkable(planet, _v2)) continue;
        if (!standsOnMeadow(planet, _v2)) continue;
        const blooms = flowersNear(planet, _v2, T);
        // A hive in a field with nothing growing in it is a box on a stick.
        if (blooms.length < T.minFlowers) continue;

        const g = planet.surfaceRadiusAtDir(_v2.x, _v2.y, _v2.z);
        const hive = new Entity(planet, 'hive', _v2, { rand, radius: g + T.lift });
        hive.bees = [];
        hive.flowers = blooms;
        scene.add(hive.mesh);
        list.push(hive);

        for (let b = 0; b < T.bees; b++) {
          const bee = new Entity(planet, 'bee', _v2, { rand });
          bee.hive = hive;
          bee.flowers = blooms;
          bee.home.copy(hive.up);
          scene.add(bee.mesh);
          list.push(bee);
          hive.bees.push(bee);
        }
        placed = true;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// the golem

// Stand a golem somewhere walkable near a direction. Shares spawnAnimal's
// placement loop in spirit but not in code, because a golem is not an animal
// and isAnimalKind would refuse it.
export function spawnGolem(planet, scene, dir, opts = {}) {
  const rand = opts.rand ?? Math.random;
  const centre = _v2.copy(dir).normalize();
  const r = planet.surfaceRadiusAtDir(centre.x, centre.y, centre.z);
  const spread = opts.spread ?? 8;
  const out = new THREE.Vector3();
  tangentBasis(centre, _t1, _t2);
  for (let a = 0; a < 12; a++) {
    const ang = rand() * 6.283;
    const dist = 2 + rand() * spread;
    _v.copy(_t1).multiplyScalar(Math.cos(ang)).addScaledVector(_t2, Math.sin(ang));
    offsetDir(centre, _v, dist, r, out);
    if (!spotIsWalkable(planet, out)) continue;
    const e = new Entity(planet, 'golem', out, { rand });
    // Its post is where it was raised, and it comes back here — see
    // thinkGolem's leash. A golem built by the player takes the spot it was
    // built on as its post, which is how you decide what it guards.
    e.home.copy(e.up);
    scene.add(e.mesh);
    return e;
  }
  return null;
}

// Populate a world: villagers around each village, a herd or two of animals,
// and the birds. Zombies are not seeded here — they arrive at night via
// tickZombies.
// The folk of ONE settlement, and its garrison. Pulled out of populate so that
// a village can be filled when the player walks up to it rather than only at
// world load — see ensureFolk in main.js. Everything about who comes out is
// the streams these take, so populate keeps handing them its own and nothing
// that already exists moves.
// The most people one village will put on the ground however many the caller
// asks for. main.js's ledger caps the recorded count as well; this is the
// belt to that pair of braces, so a book that has somehow been written a
// thousand into cannot ask for a thousand meshes.
const FOLK_MAX = 64;

function spawnVillagers(planet, scene, site, rand, list, souls = null) {
  // A borough's crowds come from citylife.js, streamed round the player —
  // filling it village-style as well would double every street
  if (site.city) return list;
  const stops = villageWaypoints(planet, site, rand);
  // The founding roll is taken WHETHER OR NOT it is used, so a village whose
  // population is on the books comes off the same stream position as one
  // whose is not, and adding the record moved nothing else about the place.
  // Six to nine, up from three to five: the player asked for more hands in a
  // village from the start, and it is still ONE draw off the stream, so
  // everything rolled after it lands where it always did. The ones the beds
  // cannot cover stand on doorsteps at dusk, which is the bed cap doing its
  // job in public.
  const rolled = 6 + Math.floor(rand() * 4);
  // ...and how many actually come out. A village that has been lived in knows
  // how many people live in it — see the souls row in js/ledger.js — and the
  // roll above is only what it was FOUNDED with. Trusting the roll every time
  // is what made every settlement on the planet three-to-five people for ever,
  // however many children had been born in it, because a refill threw the
  // grown ones away and rolled the founding number again.
  const n = souls == null ? rolled
    : Math.max(0, Math.min(FOLK_MAX, Math.round(souls)));
  for (let i = 0; i < n; i++) {
    // one of each trade first, so a village always looks staffed
    const job = JOBS[i < JOBS.length ? i : Math.floor(rand() * JOBS.length)];
    const stop = stops[i % stops.length];
    const d = jitterStop(planet, stop, rand);
    // The first two are one of each, and the rest are rolled. Left purely to
    // the coin, one village in eight would come out all men — and a village
    // with no women is a village that can never grow (see the pairing in
    // main.js), which is a dead settlement by accident rather than by design.
    const sex = i === 0 ? 'woman' : i === 1 ? 'man'
      : (rand() < 0.5 ? 'woman' : 'man');
    // ...and STOOD AT THE DOOR'S OWN FLOOR where the stop knows it. Without
    // this the radius comes from the height field, which over a doorstep is
    // the eave above it, and the villager is put on the tiles. `buried` is
    // deliberately NOT set — that is for a guard who never moves, and it
    // would take this one's water sense away with it.
    const e = new Entity(planet, 'villager', d, {
      job, sex, waypoints: stops, rand, village: site,
      ...(stop.h === undefined ? {} : { radius: R0 + stop.h + 0.5 }),
    });
    e.wp = i % stops.length;
    scene.add(e.mesh);
    list.push(e);
  }
  return list;
}

function spawnGarrison(planet, scene, site, grand, arand, list) {
  // the city's watch walks with the crowds — see citylife.js
  if (site.city) return list;
  const posts = guardWaypoints(planet, site, grand);
  const n = SOLDIER_TUNING.min + Math.floor(grand() * SOLDIER_TUNING.extra);
  // Where in the rack this village starts. A detail is only two or three
  // strong, so walking the list from the top every time would mean the war
  // hammer — last of four — was never issued to anybody on the planet.
  const off = (arand() * SOLDIER_ARM_LIST.length) | 0;
  for (let i = 0; i < n; i++) {
    const d = jitterStop(planet, posts[i % posts.length], grand);
    // ...and then one of each in turn, so no two guards on one gate carry the
    // same thing until the rack has been round once.
    const arm = SOLDIER_ARM_LIST[(off + i) % SOLDIER_ARM_LIST.length];
    const e = new Entity(planet, 'villager', d,
      { job: 'soldier', arm, waypoints: posts, rand: grand, village: site });
    e.wp = i % posts.length;
    // THE WATCH. Half the garrison, and never fewer than one: they are up all
    // night on the gates while the rest sleep in the barracks like everybody
    // else. A village where the whole guard slept would be a village the night
    // walks into; one where none of them ever did would be three men who are
    // never off duty, which is not a rota, it is a curse. The first soldier of
    // every village always has the watch, so there is somebody awake in a
    // garrison of one.
    e.onWatch = i < Math.max(1, Math.ceil(n / 2));
    scene.add(e.mesh);
    list.push(e);
  }
  return list;
}

// Fill one settlement, from ITS OWN cell rather than from a stream shared with
// every other village on the planet. That is the whole point: a village filled
// when you arrive has to come out the same however many others you visited
// first, and a shared stream makes it depend on the order you walked.
//
// `opts.souls` is how many ordinary villagers to put out, for a village that
// has been lived in and has the number written down. It is passed IN rather
// than looked up because the ledger is main.js's — this file walks people
// about and knows nothing about books, and teaching it would be the second
// place in the game that could disagree about how many people live somewhere.
// Left out, or null, the founding roll stands and nothing has changed.
export function spawnFolk(planet, scene, site, seed = 1, opts = {}) {
  const salt = ((site.f * 8191 + site.u * 92837111 + site.v * 689287499)
    ^ Math.imul(seed | 0, 2654435761)) | 0;
  const list = [];
  spawnVillagers(planet, scene, site, mulberry32(salt ^ 0x5eed17), list,
    opts.souls ?? null);
  // A founded village raises no free garrison and posts no free guards:
  // soldiers are a thing a settlement that runs itself is given, and the
  // player's own settlement earns its defence the way it earns everything
  // else. The folk above still come — they are on its book.
  if (site.founded) return list;
  spawnGarrison(planet, scene, site, mulberry32(salt ^ 0x50d1e2),
    mulberry32(salt ^ 0x9a1ba7), list);
  // ...and the pairs on the arch and the shop door, which come and go with
  // the rest of the village: "always on the door" means always when there is
  // anybody there to see them.
  spawnPosted(planet, scene, salt, list, site);
  return list;
}

// THE FOUNDING ROLL ON PAPER. How many ordinary folk this village was founded
// with and how many soldiers it keeps, drawn off exactly the salted streams
// spawnFolk draws them from — the waypoint walk first, because that is what
// spawnFolk does before it rolls, and a stream read from a different place is
// a different number — without putting anybody on the ground. main.js asks
// this for a settlement the player is nowhere near, so that its book can be
// opened and its people set to work before anybody has walked into it; and
// because it is the same draw, the village that fills when the player finally
// arrives is the village the book has been describing all along.
export function foundingRoll(planet, site, seed = 1) {
  const salt = ((site.f * 8191 + site.u * 92837111 + site.v * 689287499)
    ^ Math.imul(seed | 0, 2654435761)) | 0;
  const rand = mulberry32(salt ^ 0x5eed17);
  villageWaypoints(planet, site, rand);
  const folk = 6 + Math.floor(rand() * 4);
  let soldiers = 0;
  if (!site.founded && !site.city) {
    const grand = mulberry32(salt ^ 0x50d1e2);
    guardWaypoints(planet, site, grand);
    soldiers = SOLDIER_TUNING.min + Math.floor(grand() * SOLDIER_TUNING.extra);
  }
  return { folk, soldiers };
}

export function populate(planet, scene, seed = 1) {
  const rand = mulberry32(seed ^ 0x5eed17);
  const list = [];
  const sites = planet.villageSites ?? [];
  _spawnTimer = ZOMBIE_TUNING.interval;   // fresh world, fresh spawn clock
  clearEffects();                         // last world's corpses and gore
  if (_birds) { _birds.dispose(); _birds = null; }   // old world's sky

  for (const site of sites) spawnVillagers(planet, scene, site, rand, list);

  // THE CHIEF. One per settlement, on the throne in his hall, out of a salt of
  // his own so that adding him moved nothing in any world that already
  // existed — the same care the garrison and the shopkeepers were added with.
  //
  // He does not walk a round. He is `bound` with a single waypoint, which is
  // the seat: a chief who wandered off down the lane would be a mayor.
  const chrand = mulberry32(seed ^ 0x0c41ef);
  for (const site of sites) {
    const e = spawnChief(planet, scene, site, chrand);
    if (e) list.push(e);
  }

  // The garrison, from a stream of its own. Drawing soldiers out of `rand`
  // would shift every herd and bear rolled after them — and every machine
  // that generated the world before soldiers existed — so they get their own
  // salt and every villager above comes out exactly as it always did.
  const grand = mulberry32(seed ^ 0x50d1e2);
  // Which weapon each guard carries comes out of a SECOND stream, salted for
  // itself. Taking the roll out of `grand` would have moved every guard's
  // position jitter after the first one, and with it every herd and bear
  // rolled later — so a world that already exists would have found its
  // garrison standing somewhere else the day the weapons arrived.
  const arand = mulberry32(seed ^ 0x9a1ba7);
  for (const site of sites) {
    spawnGarrison(planet, scene, site, grand, arand, list);
  }

  spawnKeepers(planet, scene, seed, list);
  // ...and the man behind the bar, on the same terms and the same salt-of-his-
  // own argument. ensureFolk puts him back as the player walks; this is the
  // first fill.
  spawnBarkeeps(planet, scene, seed, list);
  // ...and the old man on the café's pipe, on the same terms
  spawnElders(planet, scene, seed, list);

  // ...and the man at the altar, and the pairs on the two doors that matter.
  spawnPriests(planet, scene, seed, list);
  spawnPosted(planet, scene, seed, list);

  populateAnimals(planet, scene, sites, rand, list);
  // only where there is a cap to stand on
  if (planet.poles) populateBears(planet, scene, rand, list, ANIMAL_TUNING.bears);

  // The penned stock: the pigs and chickens the villages built fences for.
  // village.js leaves the pens on planet.penList; the fences are full-cell
  // colliders, so an animal dropped inside simply stays there. Own salted
  // stream — the free herds of every existing world graze where they always
  // did.
  const prand = mulberry32(seed ^ 0x9e4a1);
  for (const pen of planet.penList ?? []) {
    for (let i = 0; i < pen.count; i++) {
      const c = dirFromCell(pen.f,
        pen.u + 1.5 + prand() * (pen.w - 3),
        pen.v + 1.5 + prand() * (pen.d - 3));
      const d = new THREE.Vector3(c[0], c[1], c[2]).normalize();
      // A PEN WITH A FLOOR NUMBER ON IT. A village fold is a rectangle of
      // open ground and the height field is the right answer for it; a floor
      // of the city's byre is under three more floors and a roof, and the
      // height field there answers with the ridge — which would put the whole
      // herd on top of the building. `h` is the cell the stock stands in, and
      // it is pinned exactly the way a man behind a counter is: `buried` to
      // read the floor locally, and `avoidsWater` beside it, or burying one
      // takes its water sense with it. See CLAUDE.md, "Where a person may be
      // PUT".
      const e = new Entity(planet, pen.kind, d, {
        rand: prand, wanderArc: 1.2,
        ...(pen.h == null ? {}
          : { buried: true, radius: R0 + pen.h, avoidsWater: true }),
      });
      scene.add(e.mesh);
      list.push(e);
    }
  }

  // ...and somebody to look after them. One hand a field and one a pen, on
  // every world — see spawnFarmhands. Its own salted stream, so adding it
  // moved nothing that was already standing anywhere.
  spawnFarmhands(planet, scene, seed, list);

  // The new countryside — dogs, foxes, wolves and horses. Each species draws
  // from a mulberry32 stream of its OWN, salted with its own constant, for
  // the same reason the garrison and the pens do: pulling these rolls out of
  // any existing stream would move every spawn that comes after them, and
  // two machines on one world name must place every animal identically.

  // Village dogs: a couple per village, wandering the green off the animal
  // brain's home tether — citylife.js still owns the CITY dogs.
  const drand = mulberry32(seed ^ 0xd06f00);
  for (const site of sites) {
    const centre = new THREE.Vector3(...site.dir).normalize();
    for (let i = 0; i < 2; i++) {
      const e = spawnAnimal(planet, scene, centre, 'dog',
        { rand: drand, spread: 7 });
      if (e) list.push(e);
    }
  }

  // Foxes: solitary, anywhere on open land — a fox is something you come
  // across, not something you visit.
  const frand = mulberry32(seed ^ 0xf00f17);
  for (let i = 0, made = 0; i < 36 && made < 6; i++) {
    const y = 2 * frand() - 1;
    const a = frand() * 6.283;
    const rr = Math.sqrt(Math.max(0, 1 - y * y));
    _v2.set(Math.cos(a) * rr, y, Math.sin(a) * rr).normalize();
    if (!spotIsWalkable(planet, _v2)) continue;
    const e = new Entity(planet, 'fox', _v2, { rand: frand });
    scene.add(e.mesh);
    list.push(e);
    made++;
  }

  // Wolf packs: two of them, in the wild — a candidate spot inside 35 blocks
  // of any village is rerolled, so the flocks and the folk stay theirs.
  const wrand = mulberry32(seed ^ 0x201f77);
  for (let p = 0, packs = 0; p < 24 && packs < 2; p++) {
    const y = 2 * wrand() - 1;
    const a = wrand() * 6.283;
    const rr = Math.sqrt(Math.max(0, 1 - y * y));
    _v2.set(Math.cos(a) * rr, y, Math.sin(a) * rr).normalize();
    if (!spotIsWalkable(planet, _v2)) continue;
    let near = false;
    for (const site of sites) {
      _v.set(...site.dir).normalize();
      if (arcBetween(_v, _v2, R) < 35) { near = true; break; }
    }
    if (near) continue;
    if (spawnHerd(planet, scene, _v2, 'wolf', 3, wrand, list) > 0) packs++;
  }

  // Wild horse herds: open ground, same keep-clear of the villages so the
  // herd reads as WILD rather than as someone's escaped stock.
  const hrand = mulberry32(seed ^ 0x40b5e5);
  for (let p = 0, herds = 0; p < 24 && herds < 2; p++) {
    const y = 2 * hrand() - 1;
    const a = hrand() * 6.283;
    const rr = Math.sqrt(Math.max(0, 1 - y * y));
    _v2.set(Math.cos(a) * rr, y, Math.sin(a) * rr).normalize();
    if (!spotIsWalkable(planet, _v2)) continue;
    let near = false;
    for (const site of sites) {
      _v.set(...site.dir).normalize();
      if (arcBetween(_v, _v2, R) < 35) { near = true; break; }
    }
    if (near) continue;
    if (spawnHerd(planet, scene, _v2, 'horse', 3 + Math.floor(hrand() * 2),
      hrand, list) > 0) herds++;
  }

  // The dead who never left. Own salted stream, appended last, for the same
  // reason as every pass above it: a draw taken out of any existing stream
  // would move every spawn after it, and every world that already exists
  // would come out different on the same name.
  populateCrypts(planet, scene, mulberry32(seed ^ 0x5ce1e7), list);

  // --- everything below arrived after the crypts ---------------------------
  //
  // Same rule again, and it is the only rule that matters in this function:
  // each pass gets a mulberry32 stream salted for ITSELF, and nothing above
  // is touched. A world generated before any of these existed still places
  // every villager, herd, wolf, horse and skeleton at exactly the same
  // coordinates — the new creatures are appended to the list, not dealt into
  // the middle of it.

  // Village cats, on the same terms as the village dogs: a couple per
  // village, on the green. A cat belongs where there are people and mice.
  const crand = mulberry32(seed ^ 0xca7501);
  for (const site of sites) {
    const centre = new THREE.Vector3(...site.dir).normalize();
    const n = 1 + Math.floor(crand() * 2);
    for (let i = 0; i < n; i++) {
      const e = spawnAnimal(planet, scene, centre, 'cat',
        { rand: crand, spread: 9 });
      if (e) list.push(e);
    }
  }

  // Mountain goats. Sited by ALTITUDE and STEEPNESS rather than by distance
  // from anything — see populateGoats — which is the whole difference between
  // a goat and a repainted sheep.
  populateGoats(planet, scene, mulberry32(seed ^ 0x60a7ed), list);

  // Bees and their hives, around the villages where the flowers are.
  populateHives(planet, scene, sites, mulberry32(seed ^ 0xbee417), list);

  // Camels, out on the sand. Own salted stream and appended after everything
  // above it, on the same terms as every pass in this function: a world made
  // before camels existed still places every villager, herd and skeleton at
  // exactly the coordinates it always did.
  populateCamels(planet, scene, mulberry32(seed ^ 0xca3e17), list);

  // ...and the ones tied up at the caravanserai. A walled halt on the sand
  // with no animals outside it is a fort; the camels are what make it a stop
  // on a road. Own stream again, and it does nothing at all on a world with
  // no halt on it.
  const serrand = mulberry32(seed ^ 0xca7a5e);
  for (const site of sites) {
    if (!site.serai) continue;
    const centre = new THREE.Vector3(...site.dir).normalize();
    for (let i = 0; i < 4; i++) {
      const e = spawnAnimal(planet, scene, centre, 'camel',
        { rand: serrand, spread: 14 });
      if (!e) continue;
      // tethered tight: these belong to the halt, not to the desert
      e.wanderArc = 16;
      list.push(e);
    }
  }

  // The village golems. One apiece, standing on the green.
  const golrand = mulberry32(seed ^ 0x901e11);
  for (const site of sites) {
    const centre = new THREE.Vector3(...site.dir).normalize();
    for (let i = 0; i < GOLEM_TUNING.perVillage; i++) {
      const e = spawnGolem(planet, scene, centre, { rand: golrand, spread: 8 });
      if (e) list.push(e);
    }
  }

  if (BIRD_TUNING.flocks > 0 && BIRD_TUNING.perFlock > 0) {
    _birds = new Birds(planet, scene, { seed });
    list.push(birdTicker(_birds));
  }
  _watch = list;   // until the first tickZombies restates it
  return list;
}

// ---------------------------------------------------------------------------
// zombie spawning

// Returned instead of an Entity when a spawn is refused. It is born dead, so
// the caller's existing "sweep out the dead" pass removes it on the same
// frame even if main.js pushes it blindly — no null check required.
function refused() {
  return { kind: 'zombie', dead: true, mesh: new THREE.Group(), update() {} };
}

// --- where a person may be PUT -----------------------------------------------
//
// Two ways a spawn goes wrong, and you can see both of them from the street: a
// villager standing in the sea, and a villager standing on somebody's roof.
//
// The sea was already refused. The roof was not, and it is much the commoner
// of the two: surfaceRadiusAtDir answers the top of whatever is IN the column,
// so a candidate that lands inside a building's footprint gets put on its
// ridge. Thirteen people in every hundred arrived that way — on halls, shops,
// churches, towers and smithies — and stood about on the tiles until they
// walked off the edge.
//
// The footprint index is what tells a roof from a street: every cell of every
// building the world has raised, against the floor it was raised on. Standing
// a course over that floor is standing INSIDE the house, which is fine and is
// where the chief sits. Standing eight over it is standing on the roof.
// `inside` — how far over a building's own floor still counts as being in it
// rather than on it. `eave` — how far PAST the footprint the roof hangs: a
// doorstep under an overhanging eave is a cell the plot never claimed and the
// surface over it is still tiles, which is the last handful of rooftops.
const STAND = { inside: 2, eave: 2 };
let _plan = null, _planFor = null, _planAt = -1;
function roofIndex(planet) {
  const list = planet?.houseList ?? [];
  // Rebuilt when the list GROWS, which is what happens as the player walks
  // onto a face that has not been generated yet. Cheap: a village is a couple
  // of thousand cells and it is walked once, not once per spawn.
  if (_planFor === planet && _planAt === list.length) return _plan;
  const m = new Map();
  const pad = STAND.eave;
  for (const h of list) {
    for (let u = h.u0 - pad; u < h.u0 + h.w + pad; u++) {
      for (let v = h.v0 - pad; v < h.v0 + h.d + pad; v++) {
        // The lowest floor wins where two buildings' skirts overlap, so a
        // low porch next to a tall one is still judged against the low one.
        const k = `${h.f},${u},${v}`;
        const was = m.get(k);
        if (was === undefined || h.base < was) m.set(k, h.base);
      }
    }
  }
  _plan = m; _planFor = planet; _planAt = list.length;
  return m;
}

// Is the surface at this direction the top of a building rather than ground?
function onARoof(planet, dir, ground) {
  const idx = roofIndex(planet);
  if (!idx.size) return false;
  const c = CS.cellFromDir(dir.x, dir.y, dir.z);
  const base = idx.get(`${c[0]},${CS.cellIdx(c[1])},${CS.cellIdx(c[2])}`);
  return base !== undefined && ground - R0 > base + STAND.inside;
}

// IS THE TOP OF THIS COLUMN A FENCE? Nobody stands on one.
//
// The height field holds a body FENCE_EXTRA — seven tenths of a block — above
// a fence's own top, and that is deliberate: it is what makes a pen animal
// proof, because the jump cannot clear it (see cubesphere). The side effect is
// that anybody who does end up in a fence column stands with most of a block
// of daylight under their boots, over a post drawn as a thin stick. From the
// street that is a man hovering over a hedge, and it is the "this one is
// flying" every screenshot of it has been.
//
// The fence's own cell is the one FENCE_EXTRA + half a block below where the
// feet would go, so this asks the block itself rather than trusting the
// fraction to stay a fraction.
// Is there something at this radius that a body cannot stand in?
//
// PASSABLE minus the DOORS, and the doors are the whole reason this is not
// simply `PASSABLE.has`. A shut door is in that set — it has to be, or nobody
// could ever walk into the cell one stands in — and it is also the one
// passable thing everything that walks treats as a wall, which is why work.js
// opens one before going through it. So a door still stops a body; a rug, a
// bloom, a torch, a picture and a ladder do not.
//
// ...AND AN OPEN DOOR IS A DOORWAY. This used to answer "blocked" for ANY
// door, on the belief that a shut one was in PASSABLE; it is the OPEN ones
// that are, and a shut one is refused by not being in the set at all. So the
// one cell of every house that a body was supposed to walk through — the
// leaf, swung flat against its jamb — had no headroom, the floor search
// called the doorway a wall, and nobody in this game ever walked through a
// door: every walk indoors ended by passing through the masonry beside it.
// Measured on six doors of one village, every one of them open: the ground
// in the doorway was read as the ridge of the roof.
const headBlocked = (p, x, y, z, rs) => {
  if (!p.solidAtWorld(x * rs, y * rs, z * rs)) return false;
  const b = p.blockAtWorld(x * rs, y * rs, z * rs);
  return !CS.PASSABLE.has(b);
};

function onAFence(planet, x, y, z, ground) {
  const r = ground - CS.FENCE_EXTRA - 0.5;
  return CS.fencelike(planet.blockAtWorld(x * r, y * r, z * r));
}

// `dry` alone is the old test: not in the water. Anything scattering people
// about wants the whole thing; anything placing one on a cell it worked out
// for itself — a throne, a door post — has already done better than this can.
function spotIsDry(planet, dir) {
  const ground = planet.surfaceRadiusAtDir(dir.x, dir.y, dir.z);
  const r = ground + 0.5;
  // surfaceRadius returns the seabed under water, so sample just above it
  return planet.blockAtWorld(dir.x * r, dir.y * r, dir.z * r) !== BLOCK.WATER;
}

function spotIsWalkable(planet, dir) {
  const ground = planet.surfaceRadiusAtDir(dir.x, dir.y, dir.z);
  const r = ground + 0.5;
  if (planet.blockAtWorld(dir.x * r, dir.y * r, dir.z * r) === BLOCK.WATER) {
    return false;
  }
  if (onAFence(planet, dir.x, dir.y, dir.z, ground)) return false;
  return !onARoof(planet, dir, ground);
}

// Nudge somebody off the exact stop they were assigned so a village does not
// come out standing in single file — and put them back on it if the nudge
// landed badly.
//
// This is where most of the rooftops came from, and it is not obvious why: a
// stop is checked, but the jitter is a hundredth added to a UNIT vector, and a
// hundredth of a unit vector at this radius is two or three blocks. Every
// villager was checked onto dry open ground and then moved, unchecked, far
// enough to reach the neighbouring ridge.
const _js = new THREE.Vector3();
function jitterStop(planet, stop, rand, spread = 0.02) {
  const d = stop.clone();
  d.x += (rand() - 0.5) * spread;
  d.y += (rand() - 0.5) * spread;
  d.z += (rand() - 0.5) * spread;
  _js.copy(d).normalize();
  return spotIsWalkable(planet, _js) ? d : stop.clone();
}

// Spawn one zombie away from `nearDir` (a direction or a world position).
// opts: { entities, lookDir, rand }. Always returns an object with `.dead`,
// `.kind` and `.mesh`; check `.dead` to see whether a zombie really arrived.
export function spawnZombie(planet, scene, nearDir, opts = {}) {
  const T = ZOMBIE_TUNING;
  const rand = opts.rand ?? Math.random;
  const list = opts.entities;
  if (list) {
    // The graveyard guards do not count against the night's cap. They belong
    // to a place rather than to the spawn clock, and counting them would mean
    // a world with two cemeteries on it quietly stopped raising zombies
    // anywhere else.
    let live = 0;
    for (const e of list) if (e.kind === 'zombie' && !e.dead && !e.bound) live++;
    if (live >= T.max) return refused();
  }

  const up = _v2.copy(nearDir).normalize();
  const r = planet.surfaceRadiusAtDir(up.x, up.y, up.z);
  tangentBasis(up, _t1, _t2);
  const cand = new THREE.Vector3();
  const eye = up.clone().multiplyScalar(r);   // player-ish point, for the cone

  for (let i = 0; i < T.attempts; i++) {
    const a = rand() * 6.283;
    const lo = opts.minArc ?? T.minArc, hi = opts.maxArc ?? T.maxArc;
    const arc = lo + rand() * (hi - lo);
    _v.copy(_t1).multiplyScalar(Math.cos(a)).addScaledVector(_t2, Math.sin(a));
    offsetDir(up, _v, arc, r, cand);

    // out of shot: reject anything inside the cone the player is looking down
    if (opts.lookDir) {
      const g = planet.surfaceRadiusAtDir(cand.x, cand.y, cand.z);
      _tgt.copy(cand).multiplyScalar(g).sub(eye).normalize();
      if (_tgt.dot(opts.lookDir) > T.viewDot) continue;
    }
    if (!spotIsWalkable(planet, cand)) continue;
    // ...and never in the light. A zombie that appeared inside a village's
    // lamps would then spend its life walking out of them, which reads as one
    // that spawned in the wrong place rather than as one the light turned back.
    if (opts.litNear) {
      const g = planet.surfaceRadiusAtDir(cand.x, cand.y, cand.z);
      _fv.copy(cand).multiplyScalar(g + 1);
      if (opts.litNear(_fv)) continue;
    }
    if (list) {
      let clash = false;
      for (const e of list) {
        if (e.kind !== 'zombie' || e.dead || !e.up) continue;
        if (arcBetween(e.up, cand, r) < T.minSeparation) { clash = true; break; }
      }
      if (clash) continue;
    }
    const e = new Entity(planet, 'zombie', cand);
    scene.add(e.mesh);
    return e;
  }
  return refused();
}

// Recommended entry point: owns the spawn clock, the night check and the cap.
// Call once per frame; it pushes into `entities` itself and returns the new
// zombie or null.
export function tickZombies(dt, planet, scene, entities, ctx) {
  // the soldiers' watch list: main.js swaps its array when something dies,
  // so take the fresh one every frame rather than trusting populate's
  _watch = entities;
  // Corpses, blood and damage numbers ride along here: main.js already calls
  // this once a frame with a dt, and a dying entity is off the entity list
  // before its animation has drawn a single frame. Call updateEffects()
  // yourself and this stops, so nothing is ever stepped twice.
  if (!_fx.external) updateEffects(dt, { internal: true });

  _spawnTimer -= dt;
  if (_spawnTimer > 0) return null;
  const T = ZOMBIE_TUNING;
  // by day, just poll again shortly: the first one should arrive at dusk,
  // not a random fraction of an interval later
  if (ctx.daylight > T.nightLevel) { _spawnTimer = 1.5; return null; }
  // jittered so the arrivals never fall into a rhythm you can count on
  _spawnTimer = T.interval * (0.6 + Math.random() * 0.8);
  const e = spawnZombie(planet, scene, ctx.playerPos, {
    entities, lookDir: ctx.lookDir, litNear: ctx.litNear,
  });
  if (e.dead) return null;
  entities.push(e);
  return e;
}
