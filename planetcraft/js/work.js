// work.js — what a hired hand actually does when you set it to a trade.
//
// entities.js owns the WALKING: an order puts a unit direction on `fetch` and
// the brain steers at it and stands there in the working pose. This file owns
// the JOB — finding the tree, felling it, pulling the crop, tilling the row,
// putting the pot on, laying the bed — because every one of those is a block
// changing, and main.js's setBlock is the one door a block change goes
// through (edit diff, remesh, and out over the wire to everybody else).
//
// So: nothing in here reaches into entities.js's brain, and nothing in
// entities.js reaches into the world. The two meet at `fetch` and `carry`.
//
// THE EDITS ARE REAL. A tree a woodcutter fells is felled: it goes into the
// diff, it is saved, and the next player to walk past sees the stump. That is
// deliberate and it is the difference between people who work and people who
// mime working — but it does mean a gang left on "cut wood" in a forest will
// eventually clear it, which is exactly what a gang of woodcutters does.

import * as THREE from 'three';
import * as CS from './cubesphere.js';
import { BLOCK, PLANTS } from './cubesphere.js';
import { dropsFor, toolOf, getItem, isRipe, isCropBlock, blockForItem,
  LOG_ITEMS }
  from './items.js';
import { WORK_ORDERS } from './entities.js';
import { smeltResult } from './crafting.js';

export const WORK = {
  // How far from the spot an order was given a hand will range for work.
  //
  // Wide on purpose. A village clears the woods around itself when it is laid
  // out, so an order given on the green with a radius of twenty finds no
  // trees at all and reads as broken — the nearest timber to a village is
  // exactly as far away as the village is big.
  range: 84,
  // ...and how far round the store a storekeeper will go for something
  // lying on the ground. The store is a yard, not a field.
  keepReach: 14,
  // ...and the raid, which is a different kind of distance entirely
  raidRange: 900,
  // seconds of swinging per block, before the tool multiplier
  chop: 1.4,
  dig: 1.1,
  cook: 6,
  bed: 5,
  // A sapling goes in the ground quickly — the job is walking to the gap, not
  // the planting — and rock comes out of a face slowly, which is what makes a
  // mine a place somebody spends a day at rather than a minute.
  plant: 0.7,
  mine: 1.9,
  // Long, and deliberately. A hive is not a thing you snatch from: robbing one
  // is standing there with your arm in it while the bees decide about you.
  comb: 5,
  // One batch of building material. Slower than a swing and faster than a
  // meal: it is bench work, and a village should be able to watch a pile of
  // timber turn into a pile of planks over a morning.
  make: 4,
  // ...and one stroke of the press, which is nine coins. Slower than the
  // bench, because the whole point of the mint is that money is the one thing
  // in this game that costs something to make — and because a machine you can
  // watch work is worth more than a machine that empties the shelf in a
  // second. It is still the best-paid minute in a village by a long way, which
  // is what makes gold worth digging for.
  strike: 7,
  // A shift on a building plot, and how near counts as being on it. Generous:
  // a plot is nine cells across and a builder anywhere on it is building.
  build: 1.6,
  buildReach: 7.5,
  // One slab of street, and one whole lamp post. Paving is quick — it is a
  // block laid flat on ground that is already there — and a lamp post is four
  // courses and a light, so it is worth about a course of a house each. Both
  // are deliberately short: what makes these orders slow is the WALK between
  // one cell of street and the next, not the laying, and a village should be
  // able to watch its own high street appear over an afternoon.
  pave: 0.8,
  lamp: 3.2,
  // How much one hand carries before it walks it back. A STACK, the same
  // sixty-four the player's own bag counts in.
  //
  // It was ten, on the argument that a first delivery two minutes after you
  // set somebody on reads as broken. That argument was wrong about which way
  // the impatience runs: at ten a woodcutter took a log or two off a tree and
  // set out for the counter, so what you watched was a man walking, the wood
  // never visibly came down, and the whole trade read as somebody carrying
  // one block back and forth. A worker who empties a tree, and the next, and
  // comes back with a stack is a worker you can SEE doing the job.
  load: 64,
  // ...EXCEPT IN A FIELD, where it is a fifth of that.
  //
  // The stack was measured on a woodcutter, and the number is about the WALK:
  // a wood is sixty blocks out, so a man who sets off with two logs is a man
  // you watch walking, and a stack is worth the journey.
  //
  // A field is not sixty blocks out. It is inside the village with the counter
  // at the end of the street — and a crop pays one or two, not four, so a
  // stack is thirty-odd pulls. Two farmhands measured over two and a half
  // in-game minutes were carrying six pumpkins between them and had delivered
  // nothing, which is a village that harvests all day and never puts food on
  // its own shelf. Short enough to see the load come in, long enough that he
  // is not a man walking.
  loadFarm: 14,
  // How close to the drop-off counts as delivered. Generous, and it has to be:
  // the counter is in the middle of a shop with walls round it and a door in
  // one of them, so a worker holding out for arm's length stands in the street
  // with the timber for ever. Anywhere in the shop is at the shop.
  drop: 6,
  // ...or this long carrying anything at all, whichever comes first. A worker
  // in thin woodland can spend five minutes gathering nine logs, and a load
  // that only ever comes home when it is full is a load that never comes home
  // on the day you are watching. It is also simply what a shift is.
  //
  // Not too short, though: a tree is about four logs, so a full load is three
  // of them, and at forty-five seconds a woodcutter walked back to the counter
  // with one stick over and over and the village never earned anything. Long
  // enough to fell a few trees, short enough to see it happen.
  // Raised again, and for the same reason it was raised to 330: the load is a
  // STACK now, and a hand who is sent home before he can fill one is a hand
  // you watch walking instead of working. Ten in-game minutes is half a day —
  // long enough to empty a copse and carry it back in one trip, and still a
  // backstop against a woodcutter in thin woodland staying out for ever.
  shift: 600,
  reach: 1.9,
  // How often a hand that has nothing to do looks again. Searching the world
  // for a tree is the expensive part of all this, and doing it every frame for
  // every idle hand is how a village of workers becomes a slideshow.
  //
  // A search that finds nothing backs off toward `giveUp`, because a hand
  // standing in a desert told to cut wood will never find a tree however
  // often it looks, and the only thing hunting for one costs is frames.
  look: 1.2,
  giveUp: 8,
  // Seconds of pushing at the same job without getting any nearer to it
  // before the job is written off.
  //
  // It was seven, which was long enough to grind and far too short to go
  // ROUND anything: a full cast — out to one side, back at the goal, out to
  // the other — takes sixteen, so at seven a worker was written off before he
  // had finished his first detour. See the casting below.
  stall: 18,
  // ...and the same for a load that is not getting home. Much longer, because
  // the walk back from a hunt is genuinely long and a load put down half way
  // is a load somebody has to go and fetch.
  homeStall: 40,
  homeGhost: 12,            // seconds without two blocks gained, carrying home
  //                           — then through the bank (see the full branch)
  // ...and how long a written-off spot stays written off
  forget: 90,
  // ...and how long a spot written off for being over his HEAD stays written
  // off. Short: it is not a place he could not get to, it is a place he got
  // to and finished, and the tree beside it is fair game in a moment.
  forgetHigh: 20,

  // How far above or below his own feet a worker can put a tool.
  //
  // This number is why villages gathered nothing. A trunk is four to six logs
  // and it is felled from the FOOT UP — see finishJob — so a man standing on
  // the ground next to it reaches higher with every course. The old test was
  // the straight-line distance to the block, which passed for three courses
  // and then failed for ever: entities.js had him stood AT the tree in the
  // working pose, work.js had him three blocks short of it, and after seven
  // seconds of that disagreement the whole tree went on his no-go list for a
  // minute and a half. Measured on ten villages for an in-game day, that one
  // argument was thirty percent of every job given up on the planet.
  //
  // So the walk is measured ROUND the planet and the swing is measured UP it,
  // and six courses is the tallest tree the generator makes.
  swing: 6,

  // --- going round ------------------------------------------------------
  // An envoy has known how to get round a bank since the day the road was
  // built (see walkErrand in entities.js) and a woodcutter never did. Same
  // idea, same numbers: no progress for `cast` seconds and he strikes off the
  // bearing to one side for `castFor`, walks straight at the job again for
  // `straight`, then tries the other side, opening wider the longer he is
  // stuck. It is not a path — nothing in this game finds one — it is a man
  // walking along a bank looking for a way up.
  cast: 2.5,
  castFor: 5,
  straight: 3,
  veer: 0.95,       // radians off the bearing a detour is — a little over 54°
  wide: 1.6,        // ...and the widest it opens to, which is a right angle

  // --- the mine ---------------------------------------------------------
  // How deep the staircase goes. Each step is one cell along the bearing and
  // one cell down, so this is also how far out from the mine head the bottom
  // of the shaft sits — thirty-two is deep enough to be under the iron and
  // well into the coal on every preset.
  shaft: 32,
  // How far a miner will range off the stair for a seam it can see from it.
  // Two cells, which is as far as somebody standing on the tread can chase a
  // vein without the hole stopping being a stair.
  seam: 2,
  // How much rock the cut will take off the top of a tread before the stair is
  // called finished. A stair is dug down INTO the ground, not through a hill:
  // when the ground rises faster than the treads fall, the block that wants
  // taking next is eight courses over the miner's head at the far side of its
  // own trench, and three miners stand at the lip of it for the rest of the
  // day. Four courses is a bank you can cut through; more than that is a hill,
  // and a hill is where a mine ends.
  cut: 4,
  // How close to the working face counts as being at it. Generous, because
  // the face is at the bottom of a hole with a wall of rock round it and a
  // worker holding out for arm's length never gets there.
  // Long, and it has to be. A miner works its own cut from the lip of it —
  // the trench it has just dug is between it and the next block down, and a
  // reach of arm's length means three miners standing on the edge of a hole
  // they cannot get back into. Anywhere on the stair is at the face.
  mineReach: 7.5,
  // ...and how long a miner will push at the face before writing it off. Much
  // longer than the rest, because a mine is ONE place: a woodcutter that gives
  // a tree up has a hundred more behind it, and a miner that gives the shaft
  // up has nowhere else to go.
  mineStall: 26,
  // ...and how long a face stays written off. Short, unlike everything else:
  // a village has one mine and a miner who wrote its whole stair off column by
  // column would never dig again. Ninety seconds of amnesia is right for a
  // tree, where there are a hundred others; here it is fifteen.
  mineForget: 15,

  // --- the hunt ---------------------------------------------------------
  // How far a hunter ranges for something to kill, how close it has to be to
  // swing, and how hard the swing lands. Slower than a soldier's, because
  // this is butchery rather than a fight.
  // Not too far. Everything a hunter kills has to be CARRIED back, and at a
  // hundred and twenty blocks the meat was still in their arms four minutes
  // later on the wrong side of a river. Seventy is a morning's walk out.
  huntRange: 70,
  huntReach: 2.4,
  huntHit: 5,
  huntCd: 1.0,
};

// What a hunter counts as worth killing: an animal that leaves meat or hide,
// not somebody's pet, not a bee, and not the thing standing next to it in the
// village. Bees are exempt on purpose — a hunter who cleared the hives would
// take the honey trade down with them.
// Livestock and nothing else. A bear or a wolf would kill the hunter, a horse
// or a camel is worth more alive than butchered, and a dog or a cat belongs to
// somebody. What is left is what a village eats.
const QUARRY = new Set(['pig', 'cow', 'sheep', 'chicken', 'goat']);

// Spots this worker could not reach, and when they may be tried again. Kept
// per worker rather than globally: one person unable to climb a bank is not
// proof the tree behind it is unreachable to anybody.
// ---- WHAT HE IS UP TO -------------------------------------------------------
//
// An order is what you TOLD him; a status is what is happening about it, and
// until now there was nothing between the two. A hand set to make a bed and
// standing still looked exactly like a hand set to make a bed and walking to
// one, and exactly like a hand who had been told to make a bed in a village
// with no room left for one — three completely different situations with the
// same picture and the same word in the book.
//
// So every branch that decides anything says what it decided. It is one short
// phrase and it costs a string assignment: work.js already knows all of this
// — which job it picked, whether it could reach it, why it found none — and
// was throwing every bit of it away.
//
// main.js reads `e.why` for the book and for the plate over his head.
// STAMPED WITH THE ORDER IT BELONGS TO. A status outlives the job that
// produced it — `why0` deliberately survives until the next search finds
// something — so a hand moved from paving to the timber went on saying "no
// road left to lay round here" while he walked to a tree, and a hand who had
// been on beds went on saying there was nowhere to put one. Every one of them
// reads as the answer to the order you can see in the row next to it, which
// is exactly the wrong answer.
//
// So a status carries the order it was written for, and main.js ignores one
// that does not match what he is on now.
const say = (e, text) => { e.why = text; e.whyFor = e.order; };

function giveUpOn(e, job) {
  const key = `${job.f},${job.u},${job.v}`;
  (e.workNoGo ??= new Map()).set(key, job.forget ?? WORK.forget);
  // ...and a GRUDGE, which outlives the no-go. The no-go stops him taking the
  // job straight back; the grudge changes how he walks at it when he finally
  // does. Every attempt starts with a fresh stall clock, so the wide casts
  // that get round a whole building only ever came out in the last seconds
  // before giving up — a man beaten twice by the same cell now starts casting
  // wide at once and pushes longer, which is the difference between grinding
  // at a house wall and walking round the house. Cleared the moment the cell
  // is actually reached.
  (e.workGrudge ??= new Map()).set(key, (e.workGrudge?.get(key) ?? 0) + 1);
  say(e, 'could not get to it — trying somewhere else');
  e.chore = null;
  e.fetch = null;
  e.workNear = Infinity;
  e.workStall = 0;
}

// GOING ROUND SOMETHING. Hand back the direction this worker should actually
// walk in: the goal, or the goal swung off to one side while a detour runs.
//
// Steering straight at a job is right until something is in the way, and then
// it is the worst thing on the screen — entities.js turns a blocked body aside
// and this file steers it straight back, so a man meets a bank and grinds
// against it until the clock writes the tree off. Measured over an in-game day
// on ten villages, that grind was most of every hour every worker had.
//
// The cure is the envoy's, whole: ONE timer counting down through zero, where
// positive is a detour running and negative is the straight run between two of
// them. He has to be pointed at the job again in between or a detour is just a
// man walking away from his work; and the side ALTERNATES, because `workStall`
// never falls while he is stuck, so a side held is one wrong guess with a
// clock on it and left-right-wider-left-wider-right is a search.
//
// The goal DIRECTION is rotated about the local up rather than a bare tangent
// handed over, so it stays a real place on the sphere and entities.js can go on
// measuring how far off he is the way it always has.
function castRound(e, goal, dt, stall, patience) {
  e.workCast = (e.workCast ?? 0) - dt;
  if (e.workCast <= -WORK.straight) {
    if (stall > WORK.cast) {
      e.workSide = e.workSide ? -e.workSide : (Math.random() < 0.5 ? 1 : -1);
      e.workCast = WORK.castFor;
    } else {
      e.workCast = 0;            // walking fine: nothing to go round
    }
  }
  if (!(e.workCast > 0) || !e.workSide) return goal;
  // ...and the longer he has been stuck the wider he casts. Fifty-odd degrees
  // walks him along a bank; a right angle walks him BACK along a headland,
  // which is the only thing that gets round a bay he has walked into.
  const wide = Math.min(WORK.wide,
    WORK.veer * (1 + Math.min(1, stall / patience)));
  _b.copy(e.pos).normalize();
  return goal.clone().applyAxisAngle(_b, wide * e.workSide);
}

// A fresh job gets a fresh clock. `workNear` is the best he has ever managed
// at the job in hand and nothing ever cleared it between jobs, so a hand who
// walked to within ten blocks of one tree and was then sent home with a full
// load came back, took a tree forty blocks off, and was written off for
// failing to beat a distance he had made to somewhere else entirely. Measured:
// a quarter of everybody holding a job was carrying somebody else's best.
function freshClock(e) {
  e.workNear = Infinity;
  e.workStall = 0;
  e.workCast = 0;
  e.workSide = 0;
}

function forgetOld(e, dt) {
  const m = e.workNoGo;
  if (!m || !m.size) return;
  for (const [k, t] of m) {
    if (t - dt <= 0) m.delete(k); else m.set(k, t - dt);
  }
}

// How much this trade carries before it walks the load home. See WORK.load and
// the note under it: the number is about the distance to the counter, and the
// fields are the one trade that happens inside the village.
// ...and a storekeeper carries home whatever he has the moment he has it:
// the store is three steps away and a load that waits to fill up is a yard
// that stays untidy.
const loadFor = (ord) => (ord === 'farm' ? WORK.loadFarm
  : ord === 'keep' ? 1 : WORK.load);

// An axe in hand doubles a woodcutter, a hoe doubles a farmer. The order is
// what somebody is doing; the tool is how well. That is the whole of "or by
// having a wood cutter" — anyone can cut wood, somebody with an axe is a
// woodcutter.
const TOOL_FOR = { chop: 'axe', farm: 'hoe', mine: 'pickaxe' };
function toolBonus(e, order) {
  const want = TOOL_FOR[order];
  if (!want) return 1;
  const t = toolOf(e.tool ?? null);
  return t && t.type === want ? 2.2 : 1;
}

const _v = new THREE.Vector3();
const _c = new THREE.Vector3();
const _b = new THREE.Vector3();

// The cell a direction stands over, as [f, u, v]. Used to turn "where this
// person is standing" into "which column to start searching from".
function cellOf(dir) {
  const c = CS.cellFromDir(dir.x, dir.y, dir.z);
  return [c[0], Math.floor(c[1]), Math.floor(c[2])];
}

// The world position of a cell's centre, into `out`.
function cellPos(f, u, v, h, out) {
  const p = CS.cellCenterWorld(f, u, v, h);
  return out.set(p[0], p[1], p[2]);
}

// How far apart two points are ROUND the planet, with the climb between them
// taken out. A job on the floor above somebody's head is a job they are stood
// at; a straight line to it says they are three blocks short of it and always
// will be, and a worker three blocks short of a job pushes at the wall until
// he writes it off. Only jobs that ask for it are measured this way.
function arcApart(pos, c) {
  const r = pos.length();
  const d = pos.dot(c) / ((r * c.length()) || 1);
  return Math.acos(Math.max(-1, Math.min(1, d))) * r;
}

// Walk a square spiral of columns out from (u0, v0), calling `fn(u, v)` until
// it answers truthily. A spiral rather than a raster because the answer wanted
// is always the NEAREST one, and a raster finds the top-left corner of the
// search box instead — a woodcutter who walks past four trees to reach a fifth
// reads as broken however good the felling looks when they get there.
function spiral(u0, v0, radius, fn, step = 1) {
  if (fn(u0, v0)) return true;
  for (let ring = step; ring <= radius; ring += step) {
    for (let i = -ring; i <= ring; i += step) {
      if (fn(u0 + i, v0 - ring) || fn(u0 + i, v0 + ring)) return true;
    }
    for (let j = -ring + step; j <= ring - step; j += step) {
      if (fn(u0 - ring, v0 + j) || fn(u0 + ring, v0 + j)) return true;
    }
  }
  return false;
}

// --- finding the job ----------------------------------------------------------

const isTimber = (b) => CS.isLog?.(b) || b === BLOCK.LOG;

// A TREE HAS LEAVES OVER IT. A HOUSE DOES NOT.
//
// This is the whole difference, and without it a woodcutter took his village
// apart. `isTimber` is true of a log wherever it stands, and a timber-framed
// house is a stack of logs with a roof on: every wall in the village answered
// "trunk" to the question below, so hands sent for wood walked to the nearest
// building and felled it, course by course, from the bottom.
//
// A generated tree's crown is centred on its own trunk — see growTree in
// cubesphere.js, which lays leaves within 2.4 of the column at the head of it
// — so a leaf in the three columns around the top of the timber is the test,
// and it costs eighteen lookups. Thatch, tiles and boards are not leaves.
function hasCrown(planet, f, u, v, head) {
  for (let dh = 0; dh <= 2; dh++) {
    for (let du = -1; du <= 1; du++) {
      for (let dv = -1; dv <= 1; dv++) {
        if (planet.get(f, u + du, v + dv, head + dh) === BLOCK.LEAF) return true;
      }
    }
  }
  return false;
}

// A BARE TRUNK IS STILL A TREE. Felling one tree takes the crown of the
// next — leaves spread from leaves, see treeFrom in main.js — so a gang on
// the timber left a wood of naked trunks behind it, and hasCrown then said
// every one of them was a house: a hand sent for wood stood in a forest of
// logs saying there was no tree within reach. The wood is the point of a
// woodcutter, and a trunk with no leaves on it is the easiest wood there is.
//
// What tells a bare trunk from a wall is that it STANDS ALONE: a wall is a
// run of logs with logs beside it on every course, and a trunk has nothing
// but air round it from foot to head. Two courses at least, because a single
// log on the ground is a post, or a dropped one, and not a tree.
//
// ...and it GREW there. A post under a fen hut's deck and a pillar in the
// corner of somebody's house also stand alone; what they do not do is stand
// on grass with sky over them. A tree's foot is on the soil it grew from and
// its head has nothing but air (or its own leaves) above it, so both are
// asked — a post carries a deck and a pillar a roof, and either fails.
// Anything the player laid with their own hands is theirs, whatever it looks
// like: `isYours` is main.js's record of exactly that.
function standsAlone(planet, f, u, v, foot, head, ctx) {
  if (head - foot < 1) return false;
  const under = planet.get(f, u, v, foot - 1);
  if (under !== BLOCK.GRASS && under !== BLOCK.DIRT) return false;
  const over = planet.get(f, u, v, head + 1);
  if (over !== BLOCK.AIR && over !== BLOCK.LEAF) return false;
  for (let h = foot; h <= head; h++) {
    if (ctx?.isYours?.(f, u, v, h)) return false;
    for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (isTimber(planet.get(f, u + du, v + dv, h))) return false;
    }
  }
  return true;
}

// The foot of the trunk in this column, or null. The LOWEST log on purpose:
// felling from the bottom is what brings a tree down, and a woodcutter
// starting at the canopy is a woodcutter up a ladder.
function trunkAt(planet, f, u, v, ctx = null) {
  if (u < 1 || v < 1 || u >= CS.S - 1 || v >= CS.S - 1) return null;
  const top = planet.columnTop(f, u, v);
  if (top < 1) return null;
  for (let h = top; h > top - 3 && h > 1; h--) {
    if (!isTimber(planet.get(f, u, v, h))) continue;
    let foot = h;
    while (foot > 1 && isTimber(planet.get(f, u, v, foot - 1))) foot--;
    // ...and the head of it, which is where a tree keeps its leaves
    let head = foot;
    while (head < top && isTimber(planet.get(f, u, v, head + 1))) head++;
    if (!hasCrown(planet, f, u, v, head)
      && !standsAlone(planet, f, u, v, foot, head, ctx)) return null;
    // ...and never a tree that is somebody's WALL with a hedge over it: a
    // log the player laid is the player's, leaves or no leaves
    if (ctx?.isYours?.(f, u, v, foot)) return null;
    // NO WOOD OUT OF A BUILDING, whichever test let the column through. A
    // house is a rectangle main.js knows (see inHousePlot), and a wall of
    // logs with a tree's crown leaning over its top has always passed the
    // crown test — so the foot of every trunk, crowned or bare, must also
    // stand clear of any house plot and have no log beside it on the
    // ground course: a tree grows on its own, a wall is a run of logs.
    if (ctx?.inHouse?.(f, u, v)) return null;
    for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (isTimber(planet.get(f, u + du, v + dv, foot))) return null;
    }
    // ...and never the village's own timber, whatever is growing on it. The
    // second belt: a house the settlement raised itself stands on ground the
    // planter already refuses to plant in, so the two rules agree about what
    // is somebody's and what is the wood.
    if (inVillageGround(planet, f, u, v, planet.get(f, u, v, foot - 1))) return null;
    return { f, u, v, h: foot };
  }
  return null;
}

// The nearest tree worth walking to.
//
// It hunts the CANOPY first and the trunk second, and that is not an
// optimisation for its own sake — it is what makes the search possible at
// all. A village clears the woods for its own footprint AND for the forest
// pass's margin around it, so the nearest timber to a village green is most
// of a hundred cells away; a column-by-column spiral over that is twenty
// thousand height lookups every time somebody with an axe has nothing to do.
//
// A trunk is one column wide and would fall straight through a coarse sieve.
// A canopy is five or six across and cannot, so the coarse pass looks for
// leaves and the fine pass finds the trunk holding them up.
// Outside the leash. `home` is the worker's POST — see the note in pickJob —
// and it is what lets a search start from where a hand is standing without
// letting him work his way out of the village a cell at a time.
const roams = (home, u, v) => home
  && Math.hypot(u - home.u, v - home.v) > home.r;

function findTree(planet, f, u0, v0, radius, skip = null, home = null,
  ctx = null) {
  let hit = null;
  spiral(u0, v0, radius, (u, v) => {
    if (u < 1 || v < 1 || u >= CS.S - 1 || v >= CS.S - 1) return false;
    if (roams(home, u, v)) return false;
    const top = planet.columnTop(f, u, v);
    if (top < 1) return false;
    // a canopy sits ABOVE the ground the column reports, so the top block of
    // a wooded column is leaf and the ground is somewhere under it
    const b = planet.get(f, u, v, top);
    if (b !== BLOCK.LEAF && !isTimber(b)) return false;
    // WOOD FIRST. A column topped with timber is a bare trunk — the crown is
    // gone and the logs are standing there for the taking — and it is the
    // job before any tree that still has to be hunted through its leaves.
    if (isTimber(b)) {
      const t = trunkAt(planet, f, u, v, ctx);
      if (t && !skip?.has(`${t.f},${t.u},${t.v}`)) { hit = t; return true; }
    }
    // ...and the trunk is within a canopy's radius of here
    for (let ring = 0; ring <= 3 && !hit; ring++) {
      for (let du = -ring; du <= ring && !hit; du++) {
        for (let dv = -ring; dv <= ring && !hit; dv++) {
          if (Math.max(Math.abs(du), Math.abs(dv)) !== ring) continue;
          const t = trunkAt(planet, f, u + du, v + dv, ctx);
          if (t && skip?.has(`${t.f},${t.u},${t.v}`)) continue;
          hit = t;
        }
      }
    }
    return !!hit;
  }, 3);
  return hit;
}

// --- the bench ----------------------------------------------------------------
//
// What a village GATHERS is not what a village is BUILT from. Timber is not a
// house; planks are. Clay is not a wall; bricks are. A gang can fell a forest
// and the settlement is no nearer having another roof on it until somebody
// stands at a bench and turns one into the other.
//
// Every one of these is a recipe the player already has — see js/crafting.js —
// at the same rates. A worker at a bench is doing what you would do at a
// bench, which is rule 2 again: nothing here is a power only a village has.
//
// In order, because the order IS the priority: a village short of everything
// makes planks first, because planks are most of a house.
//
// `at` names the MACHINE. Everything here is bench work except the coin, which
// is struck at the mint — one press per village, in the shop, see `shop` in
// village.js — and `coin` on a recipe says the output is money and belongs in
// the purse rather than on a shelf.
//
// THE COIN GOES FIRST, and it is the one place the priority is not "what is a
// village shortest of". Gold reaches a shop rarely — a seam the miners happen
// to cut, or a bar somebody sold over the counter — and a village that has any
// should strike it the day it arrives. The timber will still be there
// tomorrow; the order that says "make materials" may not be.
//
// NINE COINS TO THE INGOT, which is exactly `shapeless('coin', 9,
// ['gold_ingot'])` in crafting.js and exactly the nine that melt back into a
// bar. The press makes nothing from nothing: it is a rate the player already
// has, and the only thing the machine buys is somebody able to stand at it all
// day. Get this wrong in the village's favour and coin — the one number the
// whole game is scored on — stops meaning anything.
//
// The chunk strikes for the same nine as the bar because a mint MELTS as well
// as strikes: `raw_gold` smelts one-for-one into an ingot at any furnace (see
// SMELT in crafting.js), so nine off the chunk is the player's own two steps
// with the walk between them taken out. Without it the recipe would never fire
// at all — nothing in a village smelts anything that is not dinner, so what
// the mine brings up sits on the shelf as ore for ever.
export const MATERIALS = [
  { out: 'coin', count: 9, need: { gold_ingot: 1 }, name: 'coin',
    at: 'mint', coin: true },
  { out: 'coin', count: 9, need: { raw_gold: 1 }, name: 'coin',
    at: 'mint', coin: true },
  { out: 'plank', count: 4, need: { log: 1 }, name: 'planks' },
  // ...and out of EVERY timber, not only oak. Trees grow by latitude now
  // (treeKindAt in cubesphere.js), so a village in the birch belt brings
  // home birch logs, and a bench that only knew oak left them on the shelf
  // for ever: measured, a village with five birch and two dark-oak logs and
  // no plank to its name. A house is priced in plank (houseCost), so the
  // village bench saws any log into building plank; the player's own
  // crafting still makes each wood its own planks.
  ...LOG_ITEMS.filter((id) => id !== 'log').map((id) => ({
    out: 'plank', count: 4, need: { [id]: 1 }, name: 'planks' })),
  { out: 'brick', count: 1, need: { clay: 4 }, name: 'bricks' },
  { out: 'thatch', count: 1, need: { wheat: 9 }, name: 'thatch for a roof' },
  // The farm's timberwork, so a keeper short of pales has somewhere to send
  // for them. After the house materials on purpose: a store with logs in it
  // saws planks first, and the fences come once the sawing is done.
  // MADE TO ORDER ONLY (`asked`): the farm's woodwork, never touched by a
  // plain `make materials` shift — a village set to make materials would
  // otherwise churn its planks into sticks the moment the sawing was done.
  { out: 'stick', count: 4, need: { plank: 1 }, name: 'sticks', asked: true },
  { out: 'fence', count: 3, need: { plank: 4, stick: 2 }, name: 'fences',
    asked: true },
  { out: 'gate', count: 1, need: { plank: 2, stick: 4 }, name: 'a field gate',
    asked: true },
  // Cobble out of the stone a mine brings up. Last, because a village that
  // has stone has walls already — this is for the fireplaces and the paths.
  { out: 'cobblestone', count: 1, need: { stone: 1 }, name: 'cobble' },
  // THE FURNACE. Fire makes what a bench cannot: ore into metal, sand into
  // glass, clay into brick (four at a time, against the bench's one), cobble
  // back into dressed stone, and a log into coal. A coal lump fires four of
  // anything, which is the furnace's own rate — see the smelting table in
  // crafting.js. Two entries where the raw stuff has two names, so whichever
  // the store holds is the one that is used.
  { out: 'iron_ingot', count: 4, need: { raw_iron: 4, coal: 1 },
    name: 'iron ingots', at: 'furnace' },
  { out: 'iron_ingot', count: 4, need: { iron_ore: 4, coal: 1 },
    name: 'iron ingots', at: 'furnace' },
  { out: 'copper_ingot', count: 4, need: { raw_copper: 4, coal: 1 },
    name: 'copper ingots', at: 'furnace' },
  { out: 'copper_ingot', count: 4, need: { copper_ore: 4, coal: 1 },
    name: 'copper ingots', at: 'furnace' },
  { out: 'gold_ingot', count: 4, need: { raw_gold: 4, coal: 1 },
    name: 'gold ingots', at: 'furnace' },
  { out: 'gold_ingot', count: 4, need: { gold_ore: 4, coal: 1 },
    name: 'gold ingots', at: 'furnace' },
  { out: 'silver_ingot', count: 4, need: { raw_silver: 4, coal: 1 },
    name: 'silver ingots', at: 'furnace' },
  { out: 'glass', count: 4, need: { sand: 4, coal: 1 }, name: 'glass', at: 'furnace' },
  { out: 'glass', count: 4, need: { sand_orange: 4, coal: 1 }, name: 'glass',
    at: 'furnace' },
  { out: 'brick', count: 4, need: { clay: 4, coal: 1 }, name: 'fired bricks',
    at: 'furnace' },
  { out: 'stone', count: 4, need: { cobblestone: 4, coal: 1 }, name: 'dressed stone',
    at: 'furnace' },
  { out: 'coal', count: 3, need: { log: 4 }, name: 'charcoal', at: 'furnace' },
];

// The names the book offers for "what to make": one per name, coin last,
// the bench's before the furnace's, in the order above.
export const makeKinds = () => [...new Set(MATERIALS
  .filter((r) => !r.coin).map((r) => r.name)), 'coin'];

// Can this store pay for this recipe right now?
function canFill(store, r) {
  const have = stockOf(store);
  return Object.entries(r.need).every(([id, n]) => (have[id] ?? 0) >= n);
}

// Where a worker's materials come from and go back to: the shop's shelf for
// one of the village's own, and YOUR STORE for a hand you hired — the chest
// he carries his loads to is the same chest he saws and cooks out of, which
// is what makes a store a place a village works from rather than a pile.
// Your bag only when there is no store anywhere near him, which is exactly
// the behaviour a player who has never laid a chest has always had.
//
// Written down once because three jobs ask the same question, and a fourth
// asking it differently is how a cook ends up emptying a shop into her apron.
const storeOf = (e, ctx) => (e.forVillage ? ctx.villageStore(e)
  : (ctx.handStore?.(e) ?? ctx.inventory));

// The first recipe this store can fill AT THIS MACHINE. `at` is the machine
// the worker is standing at (or about to walk to), so a bench cannot strike
// coin and a press cannot saw planks.
function pickRecipe(store, at = 'bench') {
  if (!store) return null;
  const have = Object.create(null);
  for (const st of store.contents()) have[st.id] = (have[st.id] ?? 0) + st.count;
  for (const r of MATERIALS) {
    if (r.asked) continue;          // made only when a job names it
    if ((r.at ?? 'bench') !== at) continue;
    let ok = true;
    for (const [id, n] of Object.entries(r.need)) {
      if ((have[id] ?? 0) < n) { ok = false; break; }
    }
    if (ok) return r;
  }
  return null;
}

// ---- the street: paving, and the lamp posts down it ---------------------------
//
// The two orders that spend a village's own goods on the LOOK of the place.
// Everything else a hand can be set to feeds a number; these two feed the
// thing you see standing in the middle of it, and they are worth having for
// the same reason the fountain is.
//
// Both are built OUT OF THE STORE and out of nothing else. A chief that wants
// a paved street has to have mined the stone and put somebody on the bench
// first, exactly as it has to for a house — and a village with an empty shelf
// gets a worker who stands in the road with nothing in his hands, which is the
// honest answer and the one the brief can report.
//
// The order of each list is the order the store is asked, best first. Nothing
// is substituted silently: whatever comes off the shelf is the block that goes
// down, so a village paving in gravel has gravel streets and you can see from
// the far end of one what it could afford.
const PAVING = ['path', 'gravel', 'cobblestone', 'stone_brick', 'plank',
  'dirt', 'sand'];

// ...and what may be paved OVER. Ground, and only ground: a village's own
// floor, whatever the preset made it out of. Anything else — a crop, a
// fencepost, a wall, a roof, water — is somebody's work or somebody's house,
// and a path laid through it is a hole in one or the other.
export const PAVEABLE = new Set([
  BLOCK.GRASS, BLOCK.DIRT, BLOCK.SAND, BLOCK.GRAVEL, BLOCK.STONE,
  BLOCK.COBBLE, BLOCK.CLAY, BLOCK.SNOW, BLOCK.PATH,
].filter((b) => b != null));
if (BLOCK.SAND_ORANGE != null) PAVEABLE.add(BLOCK.SAND_ORANGE);

// A lamp post is a mast and a light on top of it, and the two are asked for
// separately: a village with timber and no lamps is a different problem from a
// village with lamps and no timber, and a worker should be able to say which.
const LAMP_MAST = [
  { id: 'post', n: 3 },      // the slim post the generator uses — see lampPost
  { id: 'log', n: 3 },
  { id: 'plank', n: 3 },
  { id: 'cobblestone', n: 3 },
];
const LAMP_HEAD = [
  { id: 'street_lamp', n: 1 },
  { id: 'lantern', n: 1 },
  { id: 'lamp', n: 1 },
  { id: 'torch', n: 1 },
];
// Nothing ready-made on the shelf. A village that has coal and a stick has a
// torch — it is the bench's own recipe (see crafting.js) — and the alternative
// is a worker who walks to the spot, finds no lamp in the store and walks
// back, for ever. Spent HERE rather than at the bench because a lamp post is
// what the coal was fetched for.
const LAMP_KINDLING = { need: { coal: 1, stick: 1 }, head: 'torch' };
const LAMP_HEIGHT = 3;      // courses of mast under the light

function stockOf(store) {
  const have = Object.create(null);
  if (!store) return have;
  for (const st of store.contents()) have[st.id] = (have[st.id] ?? 0) + st.count;
  return have;
}

// The first thing on the list this store can actually pay for, or null.
function pickFrom(list, have) {
  for (const w of list) if ((have[w.id] ?? 0) >= w.n) return w;
  return null;
}

// What a lamp post costs this store right now: a mast, and a head that is
// either on the shelf or can be struck from what is. Null when the village
// cannot afford one, which is a thing worth being told rather than watching a
// man stand under an empty sky.
function lampKit(store) {
  const have = stockOf(store);
  const mast = pickFrom(LAMP_MAST, have);
  if (!mast) return null;
  const head = pickFrom(LAMP_HEAD, have);
  if (head) return { mast, spend: [head], head: head.id };
  const k = LAMP_KINDLING;
  for (const [id, n] of Object.entries(k.need)) {
    if ((have[id] ?? 0) < n) return null;
  }
  return {
    mast,
    spend: Object.entries(k.need).map(([id, n]) => ({ id, n })),
    head: k.head,
  };
}

// A PATH COSTS NOTHING, and that is not a concession — it is what a path IS.
// Gravel, cobble and flags are materials somebody quarried and carried; a path
// is the ground with the grass worn off it, made by walking on it. Nothing in
// the store is spent to lay one and nothing needs to be in the store to start.
//
// So it is the FLOOR of the list rather than a rung on it: the store is asked
// for the best thing it can pay for, and when it can pay for nothing at all
// the answer is still a path. A village with an empty shelf gets beaten earth
// between its houses, which is exactly what a village with an empty shelf
// should have, and the paver is never idle for want of a slab.
const FREE_PAVING = 'path';

// ...and what a cell of street costs: one of whatever the store is paving in,
// or nothing.
function pickPaving(store) {
  const have = stockOf(store);
  for (const id of PAVING) {
    if (id === FREE_PAVING) continue;         // the floor, asked for last
    if ((have[id] ?? 0) >= 1 && blockForItem(id) != null) return id;
  }
  return blockForItem(FREE_PAVING) != null ? FREE_PAVING : null;
}

// Somewhere to do it: a crafting table if the village has one, and failing
// that a furnace or the fire on the green. A bench is where the work looks
// like it is happening, and a village always has one of the three.
const BENCH_DEPTH = 16;
// --- LEVELLING THE LAND ------------------------------------------------------
//
// What a column may be flattened THROUGH. Ground, and everything that GROWS —
// a levelled green is no use with a wood standing in the middle of it, so
// trunks, leaves and flowers come down with the high ground. What stays is
// what somebody BUILT: one laid block in the stack and the column is
// somebody's and is left whole. Water is left strictly alone, because one
// cut into a bank is a flood and the order is a spade, not a sluice.
const LEVEL_GROUND = new Set([
  BLOCK.GRASS, BLOCK.DIRT, BLOCK.SAND, BLOCK.SAND_ORANGE, BLOCK.GRAVEL,
  BLOCK.STONE, BLOCK.CLAY, BLOCK.SNOW,
]);
const LEVEL_CLEAR = new Set([
  ...LEVEL_GROUND, BLOCK.LOG, BLOCK.LEAF, BLOCK.SAPLING, BLOCK.BAMBOO,
]);
const LEVEL_GROWTH = new Set([
  BLOCK.LOG, BLOCK.LEAF, BLOCK.SAPLING, BLOCK.BAMBOO,
]);
const LEVEL_RANGE = 20;   // blocks each way from the mark, as asked for

// The nearest column that is not yet at the mark's own height — or that is,
// but has something growing on it. The SQUARE round the mark is iterated
// directly and the nearest candidate to the worker taken: a spiral wide
// enough to cover the square from anywhere inside it read four times the
// cells, and with a dozen workers that was most of a frame.
function findLevelJob(planet, f, u0, v0, cu, cv, target, taken) {
  let best = null, bd = Infinity;
  for (let du = -LEVEL_RANGE; du <= LEVEL_RANGE; du++) {
    for (let dv = -LEVEL_RANGE; dv <= LEVEL_RANGE; dv++) {
      const u = cu + du, v = cv + dv;
      if (u < 1 || v < 1 || u >= CS.S - 1 || v >= CS.S - 1) continue;
      const d = Math.max(Math.abs(u - u0), Math.abs(v - v0));
      if (d >= bd) continue;
      if (taken?.has(`${f},${u},${v}`)) continue;
      const top = planet.columnTop(f, u, v);
      if (top == null) continue;
      // GROWTH GOES WHEREVER IT STANDS. A tree downhill of the mark is
      // below the target height, so neither the cut nor the fill would ever
      // touch it — and a levelled green with a wood standing in the hollow
      // is not levelled. A TREE is felled at its lowest trunk course, whole,
      // through the same door the woodcutter's axe uses — its crown was
      // eight blocks over the leveller's head, and the swing check rightly
      // refused a man nibbling at a canopy from the ground. A loose plant is
      // simply cut. A pure-leaf column is a neighbouring trunk's crown and
      // is left for that trunk's fall to take.
      const topB = planet.get(f, u, v, top);
      if (LEVEL_GROWTH.has(topB) || PLANTS.has(topB)) {
        let logH = null;
        for (let h = Math.max(2, top - 14); h <= top; h++) {
          const b = planet.get(f, u, v, h);
          if (CS.isLog?.(b) || b === BLOCK.LOG) { logH = h; break; }
        }
        if (logH != null) {
          best = { f, u, v, h: logH, cut: true, fell: true, target,
            time: WORK.chop };
          bd = d;
          continue;
        }
        // A STALK OF BAMBOO comes down like a tree, from its lowest cane.
        // Cut from the top it was a cane seven blocks over the leveller's
        // head, which the swing check rightly refused, and he stood under
        // it for the afternoon: the ground was levelled and the grove was
        // not. See `stalk` in finishJob.
        if (topB === BLOCK.BAMBOO) {
          let low = top;
          while (low > 1 && planet.get(f, u, v, low - 1) === BLOCK.BAMBOO) low--;
          best = { f, u, v, h: low, cut: true, stalk: true, target,
            time: WORK.chop * 0.6 };
          bd = d;
          continue;
        }
        if (topB !== BLOCK.LEAF) {
          best = { f, u, v, h: top, cut: true, target };
          bd = d;
        }
        continue;
      }
      if (top > target || (top === target
        && !LEVEL_GROUND.has(planet.get(f, u, v, top)))) {
        // Coming DOWN — high ground, and anything growing at or above the
        // mark. Every course that comes off must be ground or growth; one
        // built block and the column is somebody's.
        let ok = true;
        const floor = top > target ? target : target - 1;
        for (let h = top; ok && h > floor; h--) {
          const b = planet.get(f, u, v, h);
          if (!LEVEL_CLEAR.has(b) && !PLANTS.has(b)) ok = false;
        }
        if (!ok) continue;
        best = { f, u, v, h: top, cut: true, target };
        bd = d;
        continue;
      }
      if (top >= target) continue;
      // Going UP. The gap must be air (never water), and the ground under
      // it must be ground.
      if (!LEVEL_GROUND.has(planet.get(f, u, v, top))) continue;
      let ok = true;
      for (let h = top + 1; ok && h <= target; h++) {
        if (planet.get(f, u, v, h) !== BLOCK.AIR) ok = false;
      }
      if (!ok) continue;
      best = { f, u, v, h: top + 1, cut: false, target };
      bd = d;
    }
  }
  return best;
}

// --- THE FARM ---------------------------------------------------------------
//
// An eleven-by-eleven under one mark: a fence round the edge, a gate in the
// middle of one side, and then either tilled rows sown out of the store or a
// pen walked full of beasts. Everything is derived from the WORLD each look —
// no stored progress — so a half-built farm resumes after a save exactly
// where its blocks say it stopped.
const STEAD = { r: 5, stock: 4, beastRange: 140 };
const STEAD_CROPS = new Set(['wheat', 'carrot', 'potato', 'pepper', 'salad',
  'pumpkin', 'watermelon']);
const steadSeedItem = (k) => (k === 'wheat' ? 'seeds' : k);
// ground a fence post or a furrow may claim
const STEAD_GROUND = new Set([
  BLOCK.GRASS, BLOCK.DIRT, BLOCK.SAND, BLOCK.SAND_ORANGE, BLOCK.GRAVEL,
  BLOCK.CLAY, BLOCK.SNOW, BLOCK.FARMLAND,
]);

// The next piece of the farm that is missing: the rows centre-outward for a
// crop farm, then the ring in PERIMETER ORDER from the gate — a fencer who
// takes the cells in scan order crosses his own half-built fence a dozen
// times and spends the day going round it.
// What the bench should make NEXT on the way to `want`: the thing itself if
// its makings are in, otherwise the first missing ingredient that can itself
// be made. Resolves fence <- stick <- plank <- log one honest batch at a
// time; null when the store holds nothing the chain can start from.
function benchStepFor(want, have, depth = 0) {
  if (depth > 3) return null;
  const r = MATERIALS.find((x) => x.out === want
    && (x.at ?? 'bench') === 'bench');
  if (!r) return null;
  if (Object.entries(r.need).every(([id, n]) => (have[id] ?? 0) >= n)) {
    return want;
  }
  for (const [id, n] of Object.entries(r.need)) {
    if ((have[id] ?? 0) >= n) continue;
    const sub = benchStepFor(id, have, depth + 1);
    if (sub) return sub;
  }
  return null;
}

function findSteadJob(planet, place, kind, taken, have) {
  const { f } = place;
  const cu = place.u, cv = place.v;
  const gu = cu, gv = cv + STEAD.r;       // the gate, mid of one side
  const crop = STEAD_CROPS.has(kind);
  // A shortage is REMEMBERED, not returned on the spot: a keeper out of
  // seed can still till the next row and drive the next pale. Only when
  // nothing else at all can be done does the shortage become the answer.
  let short = null;
  if (crop) {
    for (let ring = 0; ring < STEAD.r; ring++) {
      for (let du = -ring; du <= ring; du++) {
        for (let dv = -ring; dv <= ring; dv++) {
          if (Math.max(Math.abs(du), Math.abs(dv)) !== ring) continue;
          const u = cu + du, v = cv + dv;
          if (u < 1 || v < 1 || u >= CS.S - 1 || v >= CS.S - 1) continue;
          if (taken?.has(`${f},${u},${v}`)) continue;
          const t = planet.columnTop(f, u, v);
          if (t == null || t < 2) continue;
          const top = planet.get(f, u, v, t);
          if (top === BLOCK.FARMLAND) {
            if (planet.get(f, u, v, t + 1) !== BLOCK.AIR) continue;
            // A HEAD OF WHEAT CARRIES ITS SEED. The store's wheat counts as
            // seed corn — a player whose chest was full of wheat watched the
            // keeper say he was short of seeds, which is a farmer refusing
            // to thresh.
            const seedGot = kind === 'wheat'
              ? (have.seeds ?? 0) + (have.wheat ?? 0)
              : (have[steadSeedItem(kind)] ?? 0);
            if (seedGot < 1) {
              short ??= steadSeedItem(kind);
              continue;
            }
            return { f, u, v, h: t + 1, kind: 'sow', crop: kind,
              time: WORK.plant };
          }
          if (top === BLOCK.GRASS || top === BLOCK.DIRT) {
            return { f, u, v, h: t, kind: 'till', time: WORK.dig };
          }
          if (PLANTS.has(top)
            && (planet.get(f, u, v, t - 1) === BLOCK.GRASS
              || planet.get(f, u, v, t - 1) === BLOCK.DIRT)) {
            // a wildflower in the row is cleared by tilling under it
            return { f, u, v, h: t, kind: 'till', time: WORK.dig };
          }
        }
      }
    }
  }
  const r = STEAD.r;
  const per = [];
  for (let du = 0; du <= r; du++) per.push([cu + du, cv + r]);
  for (let dv = r - 1; dv >= -r; dv--) per.push([cu + r, cv + dv]);
  for (let du = r - 1; du >= -r; du--) per.push([cu + du, cv - r]);
  for (let dv = -r + 1; dv <= r; dv++) per.push([cu - r, cv + dv]);
  for (let du = -r + 1; du < 0; du++) per.push([cu + du, cv + r]);
  for (const [u, v] of per) {
    if (u < 1 || v < 1 || u >= CS.S - 1 || v >= CS.S - 1) continue;
    if (taken?.has(`${f},${u},${v}`)) continue;
    const t = planet.columnTop(f, u, v);
    if (t == null || t < 2) continue;
    const top = planet.get(f, u, v, t);
    // HE STANDS OUTSIDE THE LINE: the walk target is the cell one step OUT
    // from the pale — steering at a cell in your own fence grinds along it.
    // The pale's own cell rides on the job as fu/fv/fh for the finish.
    const su = u + Math.sign(u - cu), sv = v + Math.sign(v - cv);
    const st = planet.columnTop(f, su, sv) ?? t;
    const fh = PLANTS.has(top) ? t : t + 1;
    if (u === gu && v === gv) {
      if (CS.isGate?.(top)) continue;
      if (!STEAD_GROUND.has(top) && !PLANTS.has(top)) continue;
      if ((have.gate ?? 0) < 1) { short ??= 'gate'; continue; }
      return { f, u: su, v: sv, h: st, fu: u, fv: v, fh,
        kind: 'wicket', time: WORK.build, crop, reach: 1.4, flat: true };
    }
    if (top === BLOCK.FENCE || CS.isGate?.(top)) continue;
    if (!STEAD_GROUND.has(top) && !PLANTS.has(top)) continue;
    if ((have.fence ?? 0) < 1) { short ??= 'fence'; continue; }
    return { f, u: su, v: sv, h: st, fu: u, fv: v, fh,
      kind: 'pale', time: WORK.build, reach: 1.4, flat: true };
  }
  return short ? { short } : null;
}

function findBench(planet, f, u0, v0, radius) {
  let hit = null, fallback = null;
  spiral(u0, v0, radius, (u, v) => {
    if (u < 1 || v < 1 || u >= CS.S - 1 || v >= CS.S - 1) return false;
    const top = planet.columnTop(f, u, v);
    if (top < 1) return false;
    for (let h = top; h > top - BENCH_DEPTH && h > 1; h--) {
      const b = planet.get(f, u, v, h);
      if (b === BLOCK.CRAFTING_TABLE) { hit = { f, u, v, h }; return true; }
      if (!fallback && (b === BLOCK.FURNACE || b === BLOCK.CAMPFIRE
        || b === BLOCK.TABLE)) {
        fallback = { f, u, v, h };
      }
    }
    return false;
  });
  return hit ?? fallback;
}

// ...and the press, which has no fallback at all. A bench can be a furnace or
// the fire on the green at a pinch, because what a bench is for is a place to
// stand and work. Coin is struck between two dies or it is not struck, so a
// village with no mint simply does not make money — which is why the generator
// puts one in every shop rather than in most of them.
function findMint(planet, f, u0, v0, radius) {
  let hit = null;
  spiral(u0, v0, radius, (u, v) => {
    if (u < 1 || v < 1 || u >= CS.S - 1 || v >= CS.S - 1) return false;
    const top = planet.columnTop(f, u, v);
    if (top < 1) return false;
    for (let h = top; h > top - BENCH_DEPTH && h > 1; h--) {
      if (planet.get(f, u, v, h) === BLOCK.MINT) { hit = { f, u, v, h }; return true; }
    }
    return false;
  });
  return hit;
}

// --- where the village ends ---------------------------------------------------
//
// A settlement's own ground, and the one question a worker sent out to plant
// has to be able to answer. `reach` is the measured extent of everything the
// generator laid — houses, streets, pens, allotments, the barracks — so the
// square of that radius round the centre is the settlement, and it is the
// cheap half of the test.
//
// The other half is the blocks, because ground goes on being village ground
// after the generator has finished with it: a lane the player paved, a field
// somebody tilled, a house raised on a plot that was grass this morning. A
// path, farmland, a fence and anything standing inside a building's footprint
// are all somebody's, whoever laid them and whenever.
// A house raised since the survey — by the village itself or by the player —
// can stand a little outside the measured reach, so the footprints are worth
// walking. Only just outside, though: this is asked of every column of an
// eighty-four cell spiral and planet.houseList is every building on the
// world, so the scan is fenced off to the ring where a stray plot could be.
const OUTSKIRT = 16;

// HOW WIDE A BERTH A TREE GIVES A VILLAGE.
//
// The reach plus one cell was a hedge, not a margin: a settlement's own
// planter, told to put back what its woodcutters are taking, would come and
// sow saplings along the very edge of the green — and then in a year the
// village is standing in a wood it did not ask for, with trees against its
// walls and its street under a canopy. A village is a clearing. That is most
// of what makes it read as one.
//
// Wider still round a settlement YOU founded, and for a plainer reason: your
// village is where you are building, and a sapling in the middle of the
// ground you were about to lay a house on is somebody else's tree in your
// garden. Nobody plants there at all.
const KEEP_OUT = 26;         // any settlement
const KEEP_OUT_MINE = 48;    // ...and one of yours

function inVillageGround(planet, f, u, v, under) {
  if (under === BLOCK.PATH || under === BLOCK.FARMLAND) return true;
  let outskirt = false;
  for (const s of planet.villageSites ?? []) {
    if (s.f !== f) continue;
    const du = Math.abs(s.u - u), dv = Math.abs(s.v - v);
    const keep = (s.reach ?? 0) + (s.founded ? KEEP_OUT_MINE : KEEP_OUT);
    if (du <= keep && dv <= keep) return true;
    const r = (s.reach ?? 0) + 1;
    if (du <= r && dv <= r) return true;
    if (du <= r + OUTSKIRT && dv <= r + OUTSKIRT) outskirt = true;
    // An allotment is a field wherever it stands, and the ones the hands mark
    // out themselves stand past the surveyed edge — which is how the first
    // hand-laid plot in this world came to have three saplings growing in it
    // before its fence was up. A wood in the middle of somebody's field is
    // the same mistake as a wood in the middle of the green.
    for (const a of s.farms ?? []) {
      if (a.f !== f) continue;
      if (u >= a.u0 - 1 && u < a.u0 + a.w + 1
        && v >= a.v0 - 1 && v < a.v0 + a.d + 1) return true;
    }
  }
  if (!outskirt) return false;
  for (const b of planet.houseList ?? []) {
    if (b.f !== f) continue;
    if (u >= b.u0 - 1 && u < b.u0 + b.w + 1
      && v >= b.v0 - 1 && v < b.v0 + b.d + 1) return true;
  }
  return false;
}

// --- the wood, the other way round --------------------------------------------

// Open ground a sapling would take: grass or dirt with nothing on it, nothing
// overhead, and no tree already within a couple of cells. That last test is
// what makes a planter plant a WOOD rather than a hedge — saplings in a row
// grow into one another and half of them die in the shade.
//
// ...AND OUTSIDE THE VILLAGE. Nothing here knew a settlement existed, so a
// planter set to work on the green planted the green: saplings between the
// houses, down the street, round the fountain, sixty of them inside one
// village's own ground in ten minutes of play. A wood is what a planter is
// for, and the timber a village fells has to come back from somewhere that is
// not its front garden — so he walks out past the last house and plants there.
function findBareGround(planet, f, u0, v0, radius, skip = null, home = null) {
  let hit = null;
  spiral(u0, v0, radius, (u, v) => {
    if (u < 1 || v < 1 || u >= CS.S - 1 || v >= CS.S - 1) return false;
    if (roams(home, u, v)) return false;
    if (skip?.has(`${f},${u},${v}`)) return false;
    const top = planet.columnTop(f, u, v);
    if (top < 1) return false;
    const under = planet.get(f, u, v, top);
    if (under !== BLOCK.GRASS && under !== BLOCK.DIRT) return false;
    if (inVillageGround(planet, f, u, v, under)) return false;
    if (planet.get(f, u, v, top + 1) !== BLOCK.AIR) return false;
    // sky above it, or the sapling is under somebody else's canopy already
    for (let h = top + 2; h <= top + 6; h++) {
      if (planet.get(f, u, v, h) !== BLOCK.AIR) return false;
    }
    // ...and elbow room from anything already growing
    for (let du = -2; du <= 2; du++) {
      for (let dv = -2; dv <= 2; dv++) {
        if (!du && !dv) continue;
        const t = planet.columnTop(f, u + du, v + dv);
        if (t < 1) continue;
        for (let h = t; h >= t - 1 && h > 1; h--) {
          const b = planet.get(f, u + du, v + dv, h);
          if (isTimber(b) || b === BLOCK.LEAF || b === BLOCK.SAPLING) return false;
        }
      }
    }
    hit = { f, u, v, h: top + 1 };
    return true;
  }, 2);
  return hit;
}

// --- the mine -----------------------------------------------------------------
//
// One hole per village, and everybody sent to dig works the same one. That is
// the player's own instruction and it is also the only thing that makes a mine
// READ as a mine: two miners with two shafts is two half-dug holes and no ore,
// where two miners in one hole is a hole that gets deeper twice as fast.
//
// The shape is a staircase — a step forward, a step down, again — because that
// is what you can walk back up carrying something. main.js picks the head and
// the bearing (see mineHead); this walks the steps.

const ORES = new Set([BLOCK.COAL, BLOCK.IRON, BLOCK.GOLD, BLOCK.SILVER,
  BLOCK.DIAMOND, BLOCK.COPPER, BLOCK.TIN, BLOCK.ZINC]);
export const isOre = (b) => ORES.has(b);

// Rock a pick goes through: anything that fills its cell and is not a fluid or
// a plant. Written as a rule rather than a list of materials on purpose — every
// preset lays its own ground down (basalt, ash, ice, sand over sandstone), and
// a list would mean a miner who could not dig on half the worlds in the game.
//
// The shaft head sits outside the village (see mineHead), so the only thing
// this ever meets is ground.
function isDiggable(b) {
  if (b === BLOCK.AIR) return false;
  if (CS.FLUIDS?.has(b)) return false;
  if (CS.PASSABLE?.has(b)) return false;
  return true;
}

// The cell of step `i` of the staircase: one along the bearing and one down
// for every step taken. Step 0 is the mouth, at the surface.
//
// `side` picks which of the two abreast it is. The stair is TWO cells wide and
// that is not decoration: a one-cell shaft with a tread dropping a course a
// step is a hole a person stands at the lip of and cannot get into — the first
// one built here was dug three steps deep and then abandoned by every miner in
// the village, over and over, because there was no way down it. Two wide is
// wide enough to walk, and it is also what a working adit looks like.
function shaftCell(head, i, side = 0) {
  // across the bearing, so the second file runs beside the first
  const pu = head.dv, pv = -head.du;
  return {
    f: head.f,
    u: head.u + head.du * i + pu * side,
    v: head.v + head.dv * i + pv * side,
    h: head.h - i,
  };
}

// The next thing worth swinging at in this village's hole. Ore beside the
// stair first — that is what the hole is FOR — then the stair itself.
//
// AN OPEN CUT, NOT A TUNNEL, and that is not an aesthetic choice. Nothing that
// walks in this game can go underground: settle() in entities.js puts a body
// on top of its column, so a person who walked into a roofed adit would be
// shoved up through the hill and stand on the grass over it. The first mine
// built here was a tunnel and every miner in the village stood at the mouth of
// it for five minutes, five blocks from a face they could not reach.
//
// So the stair is cut open to the sky: everything above the tread comes out,
// and what is left is a stepped trench two wide going down into the ground —
// which is what the player asked for, is walkable by anybody, and is the one
// shape of hole this world's physics allows. A step is finished when there is
// nothing solid left at or above its tread.
function findMineJob(planet, head, skip = null) {
  if (!head) return null;
  for (let i = 0; i <= WORK.shaft; i++) {
    const c = shaftCell(head, i);
    if (c.h < 2 || c.u < 3 || c.v < 3 || c.u >= CS.S - 3 || c.v >= CS.S - 3) break;
    const key = (u, v) => `${c.f},${u},${v}`;
    // A seam in reach of this tread — but only where the cut has actually got
    // to. Ore beside a tread that is still ten courses under a field is ore
    // nobody can reach: without this test three miners walk to the ground over
    // an unopened part of the stair and stand on it, because the vein they
    // were sent for is under their feet with a hill on top of it.
    const open = planet.columnTop(c.f, c.u, c.v) < c.h;
    if (open) for (let du = -WORK.seam; du <= WORK.seam; du++) {
      for (let dv = -WORK.seam; dv <= WORK.seam; dv++) {
        for (let dh = -1; dh <= 1; dh++) {
          if (!du && !dv && !dh) continue;
          const u = c.u + du, v = c.v + dv, h = c.h + dh;
          if (h < 2) continue;
          if (!isOre(planet.get(c.f, u, v, h))) continue;
          if (skip?.has(key(u, v))) continue;
          return { f: c.f, u, v, h, kind: 'seam', time: WORK.mine,
            reach: WORK.mineReach, stall: WORK.mineStall,
            forget: WORK.mineForget, step: i };
        }
      }
    }
    // the tread itself, both files abreast: the topmost block still standing
    // over it, taken from the top down, until the sky reaches the tread
    for (const side of [0, 1]) {
      const w = shaftCell(head, i, side);
      if (skip?.has(key(w.u, w.v))) continue;
      const top = planet.columnTop(w.f, w.u, w.v);
      if (top < w.h) continue;               // this step is already open
      // ...and the ground has closed over the stair faster than it descends.
      // Cutting through that is excavating a hill, not sinking a stair, and it
      // is where the first version of this stopped dead — three miners at the
      // lip of their own trench with eight courses of rock over the next
      // block. So a bank deeper than this is left standing and the cut picks
      // up beyond it: the stair gets a bench in it where the ground rose, the
      // faces past it are still reachable from the surface, and the mine keeps
      // going down instead of ending at step five.
      if (top - w.h > WORK.cut) continue;
      for (let h = top; h >= w.h; h--) {
        if (!isDiggable(planet.get(w.f, w.u, w.v, h))) continue;
        return { f: w.f, u: w.u, v: w.v, h, kind: 'shaft', time: WORK.mine,
          reach: WORK.mineReach, stall: WORK.mineStall,
          forget: WORK.mineForget, step: i };
      }
    }
  }
  return null;
}

// --- the allotment ------------------------------------------------------------
//
// EVERYTHING EDIBLE IS SOWN INSIDE A FENCE. The old rule was "grass or dirt
// beside a field, which is where a field gets bigger", and the trouble with it
// was that nothing in the test said "beside a field": a farmhand tilled the
// green, the verge and the gap between two houses, and a settlement's fields
// spread over its own streets in an afternoon. A field with a boundary is what
// a field IS — it is the one piece of a village that has to keep animals out
// and people to a path — so the hoe only goes in inside a fenced plot with a
// gate, which is exactly the thing village.js's buildFarm already lays.
//
// Pulling a ripe crop is NOT confined that way, and deliberately: a pumpkin
// on open grass is a thing this world grows on its own and picking it is not
// sowing.
const FARM = {
  // A hand-laid allotment. Smaller than the eleven-by-eight the generator
  // surveys, because the generator levels a plot with one call and a farmhand
  // levels it a block at a time — and the smaller the plot, the less of
  // somebody's day the earthworks are.
  w: 9,
  d: 7,
  // How broken the ground may be and still be worth staking out. Perfectly
  // flat is too much to ask: a sweep of five hundred sites round one village
  // turned up ONE patch of ground level to the block and nine within two
  // courses of it, which is the difference between a village that can grow
  // its fields and one that cannot. What the two courses cost is cut and
  // fill, done by hand — see the `cut` and `fill` jobs.
  spread: 2,
  // How far past the settlement's own edge a new one may be marked out. Far
  // enough to find room past the houses, near enough that it is still this
  // village's field and not a smallholding in the woods.
  out: 26,
  // ...and it may not be laid over the top of another one, or on a house
  gap: 2,
};

// Is this cell inside the rows of one of the owner's allotments? The interior
// only: the perimeter is where the fence stands.
function allotmentAt(farms, f, u, v) {
  for (const a of farms) {
    if (a.f !== f) continue;
    if (u > a.u0 && u < a.u0 + a.w - 1 && v > a.v0 && v < a.v0 + a.d - 1) return a;
  }
  return null;
}

// The next post of a fence somebody has started and not finished. Only on a
// plot the hands marked out themselves (`raising`) — mending the generator's
// fences would mean a village quietly undoing a gap the player made on
// purpose, which is a different argument and not this one.
function findFencePost(planet, farms, skip = null) {
  for (const a of farms) {
    if (!a.raising) continue;
    let left = 0, hit = null;
    for (const [u, v] of ringCells(a.u0, a.v0, a.w, a.d)) {
      if (u === a.gate.u && v === a.gate.v) continue;   // the way in
      if (planet.get(a.f, u, v, a.base + 1) === a.fence) continue;
      left++;
      if (hit || skip?.has(`${a.f},${u},${v}`)) continue;
      hit = { f: a.f, u, v, h: a.base + 1, kind: 'fence', block: a.fence };
    }
    // the ring closed: it is an allotment now like any other
    if (!left) { a.raising = false; continue; }
    if (hit) return hit;
  }
  return null;
}

// The next column of a new plot that is not yet at its floor. One course a
// job: a spade of soil off a high corner, or a spade of soil into a low one.
// It is the cut and fill village.js does in a single call, done by somebody
// standing in the field with a shovel — which is the only way a chief is
// allowed to move earth (see rule 1: every block through setBlock).
function findEarthwork(planet, farms, skip = null) {
  for (const a of farms) {
    if (!a.raising) continue;
    for (let u = a.u0; u < a.u0 + a.w; u++) {
      for (let v = a.v0; v < a.v0 + a.d; v++) {
        if (skip?.has(`${a.f},${u},${v}`)) continue;
        // A post already driven in stands a course above the floor, which is
        // exactly what "this column is too high" looks like: without this the
        // gang laid a fence post and then dug it out again, for ever, and got
        // two sides of a fence done in six minutes.
        if (planet.get(a.f, u, v, a.base + 1) === a.fence) continue;
        const t = planet.columnTop(a.f, u, v);
        if (t > a.base) return { f: a.f, u, v, h: t, kind: 'cut' };
        if (t < a.base) return { f: a.f, u, v, h: t + 1, kind: 'fill' };
      }
    }
  }
  return null;
}

function* ringCells(u0, v0, w, d) {
  for (let u = u0; u < u0 + w; u++) { yield [u, v0]; yield [u, v0 + d - 1]; }
  for (let v = v0 + 1; v < v0 + d - 1; v++) { yield [u0, v]; yield [u0 + w - 1, v]; }
}

// The top of the real ground in a column, stepping down past whatever is
// growing on it. columnTop answers with the tuft of grass, and a field
// surveyed off tufts is a field with a two-course fall in it that is not
// there. Same idea as village.js's groundTop, and for the same reason.
function soilTop(planet, f, u, v) {
  let t = planet.columnTop(f, u, v);
  while (t >= 0) {
    const b = planet.get(f, u, v, t);
    if (b === BLOCK.AIR || b === BLOCK.LEAF || isTimber(b)
      || CS.PASSABLE?.has(b) || CS.FLUIDS?.has(b)) { t--; continue; }
    return t;
  }
  return -1;
}

// Ground a farmhand could actually stake out: near enough flat, dry, soil, and
// nobody else's. A fence that steps up a bank is a fence with holes under it,
// so the plot gets ONE floor and anything off it is cut or filled by hand
// before a post goes in. The floor is the mean, which is the level with the
// least digging in it — the same arithmetic village.js's survey does.
function plotIsClear(planet, farms, f, u0, v0, w, d) {
  if (u0 < 3 || v0 < 3 || u0 + w > CS.S - 3 || v0 + d > CS.S - 3) return -1;
  let lo = CS.H, hi = -1, sum = 0;
  for (let u = u0; u < u0 + w; u++) {
    for (let v = v0; v < v0 + d; v++) {
      const t = soilTop(planet, f, u, v);
      if (t < 1 || t >= CS.H - 3) return -1;
      const b = planet.get(f, u, v, t);
      if (b !== BLOCK.GRASS && b !== BLOCK.DIRT) return -1;
      // Meadow flowers and tufts are allowed — the ground under them is what
      // is being surveyed and a farmhand pulls them clearing the plot. Water,
      // timber or anything built is not: a marsh, a wood and a roof are three
      // different reasons this is not a field.
      for (let h = t + 1; h <= t + 3; h++) {
        const o = planet.get(f, u, v, h);
        if (o !== BLOCK.AIR && !CS.PASSABLE?.has(o)) return -1;
      }
      if (t < lo) lo = t;
      if (t > hi) hi = t;
      sum += t;
    }
  }
  if (hi - lo > FARM.spread) return -1;
  const base = Math.round(sum / (w * d));
  for (const b of planet.houseList ?? []) {
    if (b.f !== f) continue;
    if (u0 - FARM.gap < b.u0 + b.w && u0 + w + FARM.gap > b.u0
      && v0 - FARM.gap < b.v0 + b.d && v0 + d + FARM.gap > b.v0) return -1;
  }
  for (const a of farms) {
    if (a.f !== f) continue;
    if (u0 - FARM.gap < a.u0 + a.w && u0 + w + FARM.gap > a.u0
      && v0 - FARM.gap < a.v0 + a.d && v0 + d + FARM.gap > a.v0) return -1;
  }
  return base;
}

// Mark out a NEW allotment when every one the village has is full.
//
// A village whose fields are all sown had no answer before: its farmhands
// stood about, and a chief told to grow the settlement had one fewer thing it
// could grow. So the hands stake out another plot beside the last one and
// build it — and every block of it goes through setBlock like any other work,
// so the fence is really laid by somebody standing there with a mallet and it
// reaches the diff, the save and everybody else in the world.
//
// The SITING is deterministic — a fixed order of candidates off the plots the
// village already has, then off its centre — so two machines watching the same
// village mark out the same rectangle, and three hands set to farm in the same
// empty field all stake out the SAME one and build it together rather than
// three of their own. That is the same reason the mine has one head per
// settlement rather than one per miner.
//
// What is NOT carried across a reload is the list: the blocks are in the diff
// and come back, the record that they are an allotment does not. An orphaned
// field still feeds the village — a ripe crop is pulled wherever it stands and
// `pull` sows the furrow again behind it — it simply stops being extended, and
// the ground it stands on is refused to every later plot because a fence and a
// furrow are not bare soil. That is a village with one field it no longer
// counts, which is a good deal better than a village that tills it twice.
function markOutAllotment(planet, owner) {
  const { farms, f, cu, cv } = owner;
  const { w, d } = FARM;
  const cands = [];
  for (const a of farms) {
    if (a.f !== f) continue;
    cands.push([a.u0 + a.w + FARM.gap, a.v0], [a.u0 - w - FARM.gap, a.v0],
      [a.u0, a.v0 + a.d + FARM.gap], [a.u0, a.v0 - d - FARM.gap]);
  }
  // ...and failing that, a sweep of the ring just outside the settlement.
  // Wide, because ground a fence can stand on is scarce: a village whose
  // fields are all sown and which cannot find anywhere to put another is a
  // village that has stopped, and it is worth reading a few thousand columns
  // once to avoid it. Nothing calls this until every allotment is full.
  const edge = (owner.reach ?? 0) + 4;
  for (let r = edge; r <= edge + FARM.out; r += 3) {
    for (let a = 0; a < 24; a++) {
      const ang = a * Math.PI / 12;
      cands.push([cu + Math.round(Math.cos(ang) * r) - (w >> 1),
        cv + Math.round(Math.sin(ang) * r) - (d >> 1)]);
    }
  }
  const far = (owner.reach ?? 0) + FARM.out;
  for (const [u0, v0] of cands) {
    // Still this village's field. Without a bound the "beside the last one"
    // candidates chain outward for ever and a settlement's allotments walk
    // off over the hill.
    if (Math.abs(u0 + (w >> 1) - cu) > far
      || Math.abs(v0 + (d >> 1) - cv) > far) continue;
    const base = plotIsClear(planet, farms, f, u0, v0, w, d);
    if (base < 0) continue;
    // the gate goes on the side facing the village, so the way in is the way
    // somebody walks up to it
    const gate = gateToward(u0, v0, w, d, cu, cv);
    const plot = { f, u0, v0, w, d, base, gate, chan: -1, raising: true,
      fence: fenceLike(planet, farms, f) };
    farms.push(plot);
    return plot;
  }
  return null;
}

// One cell of the perimeter, on the side nearest the village centre.
function gateToward(u0, v0, w, d, cu, cv) {
  const mu = u0 + (w >> 1), mv = v0 + (d >> 1);
  if (Math.abs(cu - mu) > Math.abs(cv - mv)) {
    return { u: cu < mu ? u0 : u0 + w - 1, v: mv };
  }
  return { u: mu, v: cv < mv ? v0 : v0 + d - 1 };
}

// What this village's fences are made of. Read off an allotment it already
// has rather than assumed, for the reason a villager's new bed is the colour
// of the ones next door: a people with log fences does not suddenly start
// building in palings because the field is new.
function fenceLike(planet, farms, f) {
  for (const a of farms) {
    if (a.f !== f) continue;
    const b = planet.get(a.f, a.u0, a.v0, a.base + 1);
    if (b !== BLOCK.AIR) return b;
  }
  return BLOCK.FENCE;
}

// A FIELD IS FENCED, AND A FENCE HAS ONE WAY OUT.
//
// An allotment is a ring of fence with a single cell knocked out of it, and
// buildFarm has always written that cell down as `gate`. Nothing ever read it.
//
// So a farmhand with a full load steered straight at the counter, met the
// fence on whichever side of the plot he happened to be standing, and cast
// about — and casting is a wedge either side of the goal, which walks a man
// ALONG a fence and never round a rectangle. Forty seconds later WORK.homeStall
// put the load down in the mud and he went back to picking. A village that
// grows its own food and never once gets it to the shop.
//
// While he is inside a plot, then, he is walking to the gate; the moment he is
// through it — or standing on it — allotmentAt stops answering and the walk
// home carries on as it always did. One lookup, and no new machinery: the
// generator already knew where the door was.
const _gate = new THREE.Vector3();
function gateOut(e) {
  const farms = e.village?.farms ?? e.farms;
  if (!farms?.length) return null;
  const [f, u, v] = cellOf(e.up);
  const plot = allotmentAt(farms, f, u, v);
  if (!plot?.gate) return null;
  // Standing in the gateway already: aiming a man at the cell he is on stops
  // him dead, which is a worse fence than the fence.
  if (Math.abs(u - plot.gate.u) <= 1 && Math.abs(v - plot.gate.v) <= 1) {
    return null;
  }
  const d = CS.dirFromCell(plot.f, plot.gate.u + 0.5, plot.gate.v + 0.5);
  return _gate.set(d[0], d[1], d[2]).normalize().clone();
}

// Whose allotments a farmhand is working. His own village's if he has one;
// otherwise the settlement he was set to work in, so a hand you hired and
// pointed at a village's fields works that village's fields rather than
// starting a rival smallholding on its doorstep. Out in open country he keeps
// a plot of his own.
function farmOwner(e, ctx, f, u, v) {
  const { planet } = ctx;
  const site = e.forVillage ? e.village : nearestSite(planet, f, u, v, 90);
  if (site) {
    site.farms ??= [];
    return { farms: site.farms, f: site.f, cu: site.u, cv: site.v,
      reach: site.reach ?? 0 };
  }
  e.farms ??= [];
  return { farms: e.farms, f, cu: u, cv: v, reach: 0 };
}

function nearestSite(planet, f, u, v, range) {
  let best = null, bestD = range * range;
  for (const s of planet.villageSites ?? []) {
    if (s.f !== f) continue;
    const du = s.u - u, dv = s.v - v, d = du * du + dv * dv;
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

// A crop worth pulling, a fence worth finishing, or a row worth sowing. Ripe
// first — food in the ground is worth more than a field with one more furrow
// in it — and then the fence, because an allotment somebody started and left
// open is the one job on the list that is half done.
function findField(planet, owner, f, u0, v0, radius, skip = null,
  home = null) {
  const farms = owner?.farms ?? [];
  // One box round the lot of them, so the common case — a cell nowhere near a
  // field — costs four comparisons instead of a walk of every allotment. The
  // spiral looks at some thirty thousand columns for every hand that wants a
  // job, and that is the difference between a village and a slideshow.
  let bu0 = Infinity, bv0 = Infinity, bu1 = -Infinity, bv1 = -Infinity;
  for (const a of farms) {
    if (a.f !== f) continue;
    bu0 = Math.min(bu0, a.u0); bv0 = Math.min(bv0, a.v0);
    bu1 = Math.max(bu1, a.u0 + a.w - 1); bv1 = Math.max(bv1, a.v0 + a.d - 1);
  }
  let ripe = null, bare = null, soil = null;
  spiral(u0, v0, radius, (u, v) => {
    if (u < 1 || v < 1 || u >= CS.S - 1 || v >= CS.S - 1) return false;
    if (roams(home, u, v)) return false;
    if (skip?.has(`${f},${u},${v}`)) return false;
    // THE TOP OF THE COLUMN IS THE CROP, not the ground under it.
    //
    // This read the ground at `top` and whatever was standing on it at
    // `top + 1` — and columnTop answers the topmost thing that is NOT air, so
    // `top + 1` was air in every column in the world. The whole ripe branch
    // could therefore never fire: a farmhand walked out to a field of a
    // hundred ripe ears, found no crop anywhere in it, and spent his day
    // sowing the few bare squares and tilling the edge. Which is exactly what
    // it looked like from the street — somebody in a field, doing nothing.
    //
    // So the topmost block is what is asked. If it is a crop, that cell is the
    // crop's own cell and the ground is the one below it; if it is not, the
    // topmost block IS the ground and anything sown goes one above.
    const top = planet.columnTop(f, u, v);
    if (top < 1) return false;
    const at = planet.get(f, u, v, top);
    if (isCropBlock(at)) {
      if (isRipe(at)) { ripe = { f, u, v, h: top, kind: 'pull' }; return true; }
      return false;              // still growing — leave it alone
    }
    if (bare && soil) return false;
    if (u < bu0 || u > bu1 || v < bv0 || v > bv1) return false;
    // Inside the fence or nowhere. Everything below this line puts food in
    // the ground, and food goes in an allotment — see the note above.
    const plot = allotmentAt(farms, f, u, v);
    if (!plot) return false;
    // ...except the irrigation channel, which is the row that waters the rest
    if (plot.chan === v) return false;
    // tilled ground with nothing in it: sow it
    if (at === BLOCK.FARMLAND && !bare) {
      bare = { f, u, v, h: top + 1, kind: 'sow' };
    }
    // ...and a row of the allotment nobody has broken yet
    if (!soil && (at === BLOCK.GRASS || at === BLOCK.DIRT)) {
      soil = { f, u, v, h: top, kind: 'till' };
    }
    return false;
  });
  if (ripe) return ripe;
  // A plot the hands have staked out and not finished comes before a furrow:
  // the ground first, then the fence, and only then anything edible.
  const earth = findEarthwork(planet, farms, skip);
  if (earth) return earth;
  const post = findFencePost(planet, farms, skip);
  return post ?? bare ?? soil;
}

// The nearest lit-able furnace. A cook needs one; without one she is a person
// standing in a field holding a rabbit.
// The nearest furnace. A cook needs one; without one she is a person standing
// in a field holding a rabbit.
//
// The scan goes DEEP down the column and not a few courses, because the one
// place a furnace reliably is in this world is the ground floor of a smithy —
// and the top of that column is the ridge of its roof, ten courses up. A
// shallow scan finds every furnace in the open and not one of the ones people
// actually built.
const FURNACE_DEPTH = 16;
function findFurnace(planet, f, u0, v0, radius) {
  let hit = null;
  spiral(u0, v0, radius, (u, v) => {
    if (u < 1 || v < 1 || u >= CS.S - 1 || v >= CS.S - 1) return false;
    const top = planet.columnTop(f, u, v);
    if (top < 1) return false;
    for (let h = top; h > top - FURNACE_DEPTH && h > 1; h--) {
      const b = planet.get(f, u, v, h);
      // A campfire counts. Villages keep a fire pit on the green and a
      // barracks a brazier on its roof, and both are somewhere a cook can
      // actually stand — where a smithy's furnace is behind a door, up a
      // step and in a corner. The open fire is the one that gets used.
      if (b === BLOCK.FURNACE || b === BLOCK.CAMPFIRE) {
        hit = { f, u, v, h };
        return true;
      }
    }
    return false;
  });
  return hit;
}

// --- somewhere in a house to put another bed ---------------------------------
//
// A HOUSE, and not simply a building. This walked every building the generator
// had written down, which is how beds came to be made up along the wall of the
// chief's hall, on the shop floor and down the nave of the church. The
// generator marks the ones somebody actually sleeps in — see `laidBed` in
// village.js — and a room that was never a bedroom does not become one because
// a villager was short of somewhere to put a bed.
//
// A BED IS LAID AT THE END OF A ROW, and a row runs along a wall.
//
// The spot used to be "the first clear cell on the ground floor with a wall at
// its back", walked corner by corner — which is how a house came to have a bed
// in its own doorway, another on the step inside it, and a front room the
// player could not walk into. The capacity was never the problem; the order
// was. So the same beds go in, and they go in like a dormitory:
//
//  * THE ROOM THE HOUSE SLEEPS IN FIRST. bedroom() in village.js puts that
//    upstairs and writes the height down as `sleep`, so a made bed joins the
//    end of the pair already up there — same wall, same way round — before
//    anything at all goes on the ground floor.
//  * TWO RANKS A ROOM, against the two u walls, heads to the wall each rank
//    stands on. Everything between them is aisle. A room only two cells across
//    gets one rank, because beds down both walls with nothing between them is
//    a store cupboard and not a room.
//  * NOTHING ON THE DOORSTEP OR AT THE FOOT OF THE LADDER, nor in the cell
//    beside either. A village writes its doors down — `doors` on the village
//    site, {f,u,v,h,du,dv,dir} with du/dv the way OUT — so the cell inside an
//    opening is one step back the other way, and it is read rather than hunted.
//  * ...and then the spot is WALKED, from one end of the floor that would be
//    left to the other. A bed that seals the doorstep off or cuts the far
//    corner away from the ladder fails there and is not laid. Which is also
//    how a house knows it is FULL: when no candidate passes there is no spot,
//    and the hunt moves on to the next home rather than wedging a bed into the
//    last cell of the walkway.

// Interior cells across before a room can afford a second rank of beds: two
// walls and one cell of aisle between them.
const BED_RANKS_AT = 3;
const bedKey = (u, v) => u * 100003 + v;

// The four walls of a house, one cell in. Everything a room does happens here.
const roomOf = (h) => ({ iu: h.u0 + 1, iv: h.v0 + 1, iw: h.w - 2, id: h.d - 2 });

// The doors that open onto one floor of one building, out of the register the
// village keeps. A village has a door a house and a bed hunt runs about once a
// second, so walking the list is cheaper than any index would be.
//
// The fallback is for a building nobody wrote a door down for — a stamped
// design, mostly. A gap in the wall ring at head height IS a doorway, and a
// doorway missed here is a bed across somebody's front door, so it is worth
// the eight lines.
function doorsOf(planet, house, floor) {
  const out = [];
  const { f, u0, v0, w, d } = house;
  for (const site of planet.villageSites ?? []) {
    // A door belongs to the settlement it stands in, so the far side of the
    // planet is skipped on its centre rather than a door at a time.
    if (site.f !== f) continue;
    if (Math.abs(site.u - u0) > 200 || Math.abs(site.v - v0) > 200) continue;
    for (const dr of site.doors ?? []) {
      if (dr.f !== f || dr.h !== floor) continue;
      if (dr.u < u0 || dr.u >= u0 + w || dr.v < v0 || dr.v >= v0 + d) continue;
      out.push(dr);
    }
  }
  if (out.length) return out;
  for (const [u, v, du, dv] of ringWalk(u0, v0, w, d)) {
    const b = planet.get(f, u, v, floor);
    if (b !== BLOCK.AIR && !CS.isDoorBlock?.(b)) continue;
    out.push({ f, u, v, h: floor, du, dv });
  }
  return out;
}

// Every cell of a building's wall ring, with the way OUT of each.
function* ringWalk(u0, v0, w, d) {
  for (let u = u0 + 1; u < u0 + w - 1; u++) {
    yield [u, v0, 0, -1];
    yield [u, v0 + d - 1, 0, 1];
  }
  for (let v = v0 + 1; v < v0 + d - 1; v++) {
    yield [u0, v, -1, 0];
    yield [u0 + w - 1, v, 1, 0];
  }
}

// The cells of a floor a person needs in order to USE it, and which therefore
// never get a bed on them.
function bedKeepOut(house, doors) {
  const { iu, iv } = roomOf(house);
  const keep = new Set();
  const hold = (u, v) => keep.add(bedKey(u, v));
  // The ladder stands in the near corner of every one of these buildings and
  // the hatch is that same cell one floor up — see loft() in village.js. Both
  // are out, and so is the landing you step onto off the top rung: a bed
  // against a ladder is a bed you climb into, and a bed on a hatch is a bed
  // you fall through.
  hold(iu, iv); hold(iu + 1, iv); hold(iu, iv + 1);
  for (const dr of doors) {
    hold(dr.u, dr.v);                       // the opening itself
    hold(dr.u - dr.du, dr.v - dr.dv);       // the cell inside it
    hold(dr.u + dr.du, dr.v + dr.dv);       // ...and the step outside
  }
  return keep;
}

// Can this cell be stood on and is it empty? The three courses are the floor
// under the feet, the cell the bed goes in and the headroom over it.
function bedClear(planet, f, u, v, floor) {
  return planet.get(f, u, v, floor) === BLOCK.AIR
    && planet.get(f, u, v, floor - 1) !== BLOCK.AIR
    && planet.get(f, u, v, floor + 1) === BLOCK.AIR;
}

// The floor of a room: the cells of it somebody can stand on, minus one the
// bed is about to take.
function roomFloor(planet, house, floor, put) {
  const f = house.f;
  const { iu, iv, iw, id } = roomOf(house);
  const free = new Set();
  // `put` is what is about to go down, and it is a LIST because a bed is two
  // cells. One entry or two, the question is the same: what would the floor be
  // if this were standing on it.
  const puts = put ? (Array.isArray(put) ? put : [put]) : null;
  for (let u = iu; u < iu + iw; u++) {
    for (let v = iv; v < iv + id; v++) {
      if (puts && puts.some((c) => c.u === u && c.v === v)) continue;
      if (planet.get(f, u, v, floor) !== BLOCK.AIR) continue;
      if (planet.get(f, u, v, floor - 1) === BLOCK.AIR) continue;
      free.add(bedKey(u, v));
    }
  }
  return free;
}

// How much of that floor you can actually WALK to from the way in.
function roomReach(free, from) {
  if (!from || !free.has(bedKey(from[0], from[1]))) return 0;
  const seen = new Set([bedKey(from[0], from[1])]);
  const stack = [from];
  while (stack.length) {
    const [u, v] = stack.pop();
    for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = bedKey(u + du, v + dv);
      if (!free.has(k) || seen.has(k)) continue;
      seen.add(k);
      stack.push([u + du, v + dv]);
    }
  }
  return seen.size;
}

// The way in to one floor: the cell inside the front door, or — upstairs,
// where the way in is a hole in the boards — the landing off the ladder.
function roomEntry(house, doors, free) {
  for (const dr of doors) {
    const c = [dr.u - dr.du, dr.v - dr.dv];
    if (free.has(bedKey(c[0], c[1]))) return c;
  }
  const { iu, iv } = roomOf(house);
  for (const c of [[iu, iv], [iu + 1, iv], [iu, iv + 1], [iu + 1, iv + 1]])
    if (free.has(bedKey(c[0], c[1]))) return c;
  return null;
}

// One floor of one house: the next place in its ranks with room for a bed, or
// null when the ranks are full.
//
// The register is read ONCE for the room and not once for every cell in it.
// A bed hunt runs about once a second for every hand set to it, and walking
// every village's door list per candidate cell would be the most expensive
// thing in the trade for no answer that changes.
// Is this still a bed the room can take? Asked twice: once when a spot is
// chosen, and again at the moment the bed actually goes down.
//
// TWO HANDS, ONE ROOM. A spot each, both fine when they were picked, and the
// pair of them together shuts the doorstep in — which is how a hall came to
// have a clear cell inside its own front door with a bed against each side of
// it and nobody having laid a bad one. A bed takes five seconds to make and a
// village puts four women on the job, so the room has to be asked again when
// the block is laid rather than only when it was promised.
function bedFitsRoom(planet, house, floor, put, doors) {
  const dl = doors ?? doorsOf(planet, house, floor);
  const before = roomFloor(planet, house, floor, null);
  const from = roomEntry(house, dl, before);
  const was = roomReach(before, from);
  const cells = Array.isArray(put) ? put : [put];
  // a bed may only cost the room the cells it stands on — two of them now
  if (was < cells.length + 1) return false;
  const after = roomFloor(planet, house, floor, cells);
  return roomReach(after, from) === was - cells.length;
}

// The two cells a bed laid here would take: the head, and the foot one step
// against the way the pillow faces. Nothing calls bedFootCell twice.
function bedCells(u, v, facing) {
  const [fu, fv] = CS.bedFootCell(u, v, facing);
  return [{ u, v }, { u: fu, v: fv }];
}

function bedInRoom(planet, house, floor, noGo) {
  const f = house.f;
  const { iu, iv, iw, id } = roomOf(house);
  if (iw < 2 || id < 2) return null;
  const doors = doorsOf(planet, house, floor);
  const keep = bedKeepOut(house, doors);
  // What the room is before anybody adds to it, and how much of it you can
  // walk to from the way in. A bed may only cost the room the cell it stands
  // on: cut the doorstep off, or take the far corner out of reach of the
  // ladder, and the count comes up short and the spot is refused. That is what
  // "a walkway left down the room" means once you have to check it rather than
  // draw it, and it is also how a house knows it is full.
  const before = roomFloor(planet, house, floor, null);
  const from = roomEntry(house, doors, before);
  const was = roomReach(before, from);
  if (was < 2) return null;       // one cell of walkable floor: nothing to add
  // The far u wall is the one bedroom() lays its pair against, so it is the
  // one a made bed extends — heads to +u, which is facing 0. The wall opposite
  // opens only once there is an aisle to leave between the two ranks.
  const ranks = [{ u: iu + iw - 1, su: 1, facing: 0 }];
  if (iw >= BED_RANKS_AT) ranks.push({ u: iu, su: -1, facing: 1 });
  for (const rank of ranks) {
    for (let v = iv; v < iv + id; v++) {
      if (keep.has(bedKey(rank.u, v))) continue;
      if (noGo?.has(`${f},${rank.u},${v}`)) continue;
      if (!bedClear(planet, f, rank.u, v, floor)) continue;
      // A wall at its back, and not another bed: a head against a bed's foot
      // is two beds nose to tail and not a rank.
      const nb = planet.get(f, rank.u + rank.su, v, floor);
      if (nb === BLOCK.AIR || CS.isBed?.(nb)) continue;
      // ...AND ROOM FOR THE OTHER HALF. A bed is two cells, so the cell the
      // foot would take has to be clear floor too — otherwise the first made
      // bed in a narrow room lands with its foot in the ladder shaft.
      const cells = bedCells(rank.u, v, rank.facing);
      const foot = cells[1];
      if (keep.has(bedKey(foot.u, foot.v))) continue;
      if (!bedClear(planet, f, foot.u, foot.v, floor)) continue;
      const after = roomFloor(planet, house, floor, cells);
      if (roomReach(after, from) !== was - cells.length) continue;
      return { f, u: rank.u, v, h: floor, facing: rank.facing, house };
    }
  }
  return null;
}

// `seen` is filled in with how many homes were within reach at all, so the
// caller can tell "there is no house near where you marked" from "every house
// near where you marked is full". They are completely different problems —
// one is solved by marking somewhere else and the other by building — and
// they had the same three words.
// A building somebody could sleep in. `home` is not that question — it records
// whether the BUILDER happened to lay a bed while putting the house up — so
// testing it meant a hand could only ever add a second bed to a house that
// already had one, and could never make the FIRST bed in a bedless cottage.
// Which is precisely what "make a bed" is for.
//
// What is actually excluded is the public buildings: the chief holds court in
// his hall, the keeper stands behind his counter and nobody sleeps in a
// church. Those carry `home: false` deliberately and `chief` on the hall.
const CAN_SLEEP = (h) => h.home !== false && !h.chief;

function findBedSpot(planet, houses, f, near, noGo, seen = null) {
  for (const h of houses) {
    if (h.f !== f || !CAN_SLEEP(h)) continue;
    const du = h.u0 + h.w / 2 - near[0], dv = h.v0 + h.d / 2 - near[1];
    if (du * du + dv * dv > 60 * 60) continue;
    if (seen) seen.n = (seen.n ?? 0) + 1;
    const ground = h.base + 1;
    // The bedroom first, the ground floor after it. A house with no loft says
    // nothing about where it sleeps and sleeps downstairs, which is the only
    // floor it has.
    const floors = h.sleep && h.sleep !== ground ? [h.sleep, ground] : [ground];
    for (const floor of floors) {
      const spot = bedInRoom(planet, h, floor, noGo);
      if (spot) return { ...spot, up: floor - ground };
    }
  }
  return null;
}

// --- doors --------------------------------------------------------------------
//
// Everything that walks in this game treats a shut door as a wall, which is
// right for a wandering villager and wrong for one on an errand: half the jobs
// worth doing — the furnace in the smithy, the bed in the house — are behind
// one. So a worker walking to a job opens what is in front of it.
//
// It goes through setBlock like any other change, so the door is really open:
// you can see it swing, it is in the diff, and everybody else in the world
// sees it too. Which does mean a gang of workers leaves a village with its
// doors open, and that is exactly what a gang of workers does.
const _dv = new THREE.Vector3();
export function openDoorAhead(e, ctx) {
  const { planet, setBlock } = ctx;
  if ((e.doorCd = (e.doorCd ?? 0) - 0.016) > 0) return;
  const r = e.pos.length();
  // one step along the heading, at the height of the knees and the head
  _dv.copy(e.pos).addScaledVector(e.heading, 0.9);
  const c = CS.cellFromDir(_dv.x / r, _dv.y / r, _dv.z / r);
  const f = c[0], u = Math.floor(c[1]), v = Math.floor(c[2]);
  const h0 = Math.floor(r - CS.R0 + 0.1);
  for (const h of [h0, h0 + 1]) {
    const b = planet.get(f, u, v, h);
    if (!CS.isDoorBlock?.(b) || CS.doorOpen?.(b)) continue;
    setBlock(f, u, v, h, CS.toggleDoorBlock(b));
    // the leaf above or below is the other half of the same door
    for (const k of [-1, 1]) {
      const nb = planet.get(f, u, v, h + k);
      if (CS.isDoorBlock?.(nb) && !CS.doorOpen(nb)) {
        setBlock(f, u, v, h + k, CS.toggleDoorBlock(nb));
      }
    }
    ctx.sound?.('blockPlace', { gain: 0.5 });
    e.doorCd = 1.2;
    return true;
  }
  return false;
}

// --- doing it -----------------------------------------------------------------

// Put a stack in the hand's arms, or straight on the ground if it is already
// carrying something else. Returns true if the hand is now full enough to walk
// it back.
function stow(e, stack, ctx) {
  if (!stack) return false;
  if (e.carry && e.carry.id === stack.id) {
    e.carry.count += stack.count;
  } else if (!e.carry) {
    e.carry = { id: stack.id, count: stack.count };
  } else {
    // A SECOND KIND OF THING GOES IN THE PACK.
    //
    // It used to go on the FLOOR: whichever pile was smaller was put down
    // where they stood, because the arms held exactly one kind. Felling a
    // tree gives logs and a stick out of the leaves, so every woodcutter left
    // a trail of sticks behind him, and a hauler crossing a scatter of mixed
    // drops picked each one up and dropped the last.
    //
    // `carry` is still the armful — it is what they are SHOWN holding and
    // what the "what are you carrying" line reads — and the pack is the rest
    // of the same load. Both go home together and both are handed over.
    const have = (e.pack ??= []).find((p) => p.id === stack.id);
    if (have) have.count += stack.count;
    else e.pack.push({ id: stack.id, count: stack.count });
  }
  return carriedTotal(e) >= WORK.load;
}

// Everything in the arms and the pack together. This is the number the load
// is measured against, so a mixed load fills up exactly as fast as a pure one.
function carriedTotal(e) {
  let n = e.carry ? e.carry.count : 0;
  for (const p of e.pack ?? []) n += p.count;
  return n;
}

// Where a load goes at the end of an errand. Somebody working for you brings
// it to you; somebody working for their own village takes it to the shop,
// where it goes on the shelf and the village can sell it. That second path is
// the whole economy in one line — a chief orders timber cut, a hand carries it
// to the counter, a player buys it, and the purse grows.
function homeOf(e, ctx) {
  // WHO HE WORKS FOR, asked in the order that settles it. A hand you hired is
  // yours even if his old village still has a flag on him — see hire(), which
  // now clears it, and this is the belt to that pair of braces.
  if (e.forVillage && !e.hired) return ctx.counterFor(e);
  // A HAND YOU HIRED HAS SOMEWHERE TO PUT IT.
  //
  // Everything a hand collected used to go straight into the player's own
  // pockets, which is not a business — it is a wheelbarrow, and it fills up.
  // A chest you laid is a STORE: the load goes in it, it is still there when
  // you are somewhere else, and `go and sell` is what turns it into coin.
  // Nothing to put it in and it comes to you exactly as it always did, so a
  // player who has never placed a chest sees no change at all.
  const depot = ctx.depotFor?.(e) ?? null;
  e.depot = depot;
  return depot ? depot.pos : ctx.player.pos;
}

// How near the drop-off counts as arriving. A counter is in the middle of a
// shop and a store chest is usually in a room too, so both get the generous
// number; a player standing in a field is an arm's length.
const dropNear = (e) => ((e.forVillage && !e.hired) || e.depot ? WORK.drop : 2.8);

// Hand the load over. Anything that will not fit goes on the ground at the
// owner's feet rather than into thin air.
function deliver(e, ctx) {
  if (!e.carry) return;
  const load = [e.carry, ...(e.pack ?? [])];
  const total = carriedTotal(e);
  e.delivered = (e.delivered ?? 0) + total;
  e.carryT = 0;
  const named = e.carry.id.replace(/_/g, ' ');
  e.sold = false;
  if (e.forVillage && !e.hired) {
    for (const st of load) ctx.stockShop?.(e, st);
    e.carry = null;
    e.pack = null;
    ctx.sound?.('blockPlace', { gain: 0.4 });
    return;
  }
  // Into your store. Anything that will not fit in the box goes on the ground
  // beside it rather than into thin air — the same rule a full bag is under.
  if (e.depot) {
    const over = ctx.storeIn?.(e, load) ?? load;
    e.carry = null;
    e.pack = null;
    const spare = over.reduce((n, st) => n + st.count, 0);
    for (const st of over) ctx.dropAt?.(e.pos, st);
    ctx.sound?.('blockPlace', { gain: 0.4 });
    if (total > spare) {
      ctx.flash(`${e.job} put ${total - spare} x ${named} in your store`
        + (spare ? ` — ${spare} would not fit` : ''));
    }
    return;
  }
  const left = ctx.inventory.addAll(load);
  for (const st of left) ctx.dropAt?.(ctx.player.pos, st);
  // Named by the biggest part of it, and counted by all of it: "16 x log"
  // when that is all there is, "20 x log and 2 more kinds" when the pack has
  // something in it as well.
  const kinds = load.length;
  ctx.flash(`${e.job} brought you ${total} x ${named}`
    + (kinds > 1 ? ` and ${kinds - 1} more kind${kinds > 2 ? 's' : ''}` : ''));
  ctx.sound?.('blockPlace');
  e.carry = null;
  e.pack = null;
}

// --- the loop ------------------------------------------------------------------

export function updateWork(dt, ctx) {
  const { planet, entities, player } = ctx;
  if (!planet) return;
  for (const e of entities) {
    // Hired by the player, or set to work by their own village's chief. Both
    // hold an order out of the same vocabulary and both do the same job; the
    // only difference is who the load is carried to — see homeOf.
    if ((!e.hired && !e.forVillage) || e.dead || !e.order) continue;
    // Asleep, or on their way to bed. The order stands — it is tomorrow's
    // work, not cancelled — but nobody fells a tree in their sleep, and
    // without this a villager walking home would still be steered at a job
    // by the trade loop and never get there.
    if (e.bed || e.state === 'sleep') continue;
    // ...or off to the toilet, or in the café for the hour before bed. Same
    // argument: the order stands, and the trade loop steering him at a tree
    // while his own brain steers him at a door is a man who reaches neither.
    if (e.loo || e.atCafe) continue;
    const ord = e.order;
    if (WORK_ORDERS.has(ord)) tickTrade(dt, e, ord, ctx);
  }
}

function tickTrade(dt, e, ord, ctx) {
  const { planet, player } = ctx;

  // Carrying a full load — or anything at all, if the order was to fetch —
  // means walking it back to the owner, whatever the order was. A woodcutter
  // with two dozen logs in their arms is a delivery, not a woodcutter, until
  // the arms are empty again.
  if (e.carry) e.carryT = (e.carryT ?? 0) + dt; else e.carryT = 0;
  // `haul` used to come home on the FIRST thing picked up, which is where
  // most of "they fetch one block at a time" came from. It fills up like
  // every other trade now; the shift timer is what stops a hauler with two
  // sticks staying out all afternoon.
  // A HAND ON `go and sell` IS CARRYING ON PURPOSE. Left to the ordinary rule
  // he would load up out of your store and immediately walk the armful back
  // into the box he took it from. His load only comes home when it is money,
  // or when the counter has turned him away — which `sold` says.
  const cash = ord === 'sell' && (e.carry?.id === 'coin' || e.sold);
  const outbound = ord === 'sell' && !cash;
  const full = cash || (!outbound && e.carry
    && (carriedTotal(e) >= loadFor(ord) || e.carryT >= WORK.shift));
  if (full) {
    const home = homeOf(e, ctx);
    if (!home) { e.carry = null; e.pack = null; return; }   // nowhere to take it
    say(e, cash ? 'bringing the money back'
      : `carrying ${carriedTotal(e)} ${e.carry.id.replace(/_/g, ' ')} `
        + (e.depot ? 'to your store' : e.forVillage ? 'to the counter' : 'to you'));
    e.chore = null;
    const back = _v.copy(home).normalize().clone();
    e.fetch = back;
    const gap = e.pos.distanceTo(home);
    const near = dropNear(e);
    if (gap < near) {
      deliver(e, ctx);
      e.homeNear = Infinity;
      e.homeBest = Infinity;
      e.homeSlow = 0;
      if (e.homeGhosting) { e.scramble = false; e.homeGhosting = false; }
      return;
    }
    // ...and the shop's own door is a wall like any other. So is your store's,
    // if you put a roof over it.
    if ((e.forVillage && !e.hired) || e.depot) openDoorAhead(e, ctx);
    // OUT THROUGH THE GATE FIRST — see gateOut. It is a leg of its own and it
    // gets a clock of its own, because the distance to the COUNTER does not
    // fall while a man walks to a gate on the far side of his plot, and the
    // test below would read that as a load going nowhere and put it down.
    //
    // Bounded by the same patience as the walk itself: a gate he cannot reach
    // in forty seconds is a gate that is not going to help him, and he falls
    // back on pushing at the fence — which at least still ends.
    const out = gateOut(e);
    if (!out) {
      e.gateT = 0;
    } else if ((e.gateT = (e.gateT ?? 0) + dt) < WORK.homeStall) {
      e.fetch = out;
      e.homeNear = Infinity;
      e.homeStall = 0;
      return;
    }
    // A hunter can end up a long way out and on the wrong side of a river,
    // and a load that never gets home is a worker lost for the rest of the
    // day. The same rule the jobs are under: no progress for long enough and
    // the load goes down where they stand. It is not gone — it is a carcass
    // in a field, and anybody on `fetch` can bring it in.
    // THE LOAD GETS HOME. A man in a hollow on a hillside sixty blocks out
    // circled it for minutes with seventy logs on his back, gaining half a
    // block now and then — enough to reset the clock below, never enough to
    // arrive — and the village never saw a log or made a plank. So the walk
    // home takes the war march's answer (marchStep in entities.js): no two
    // blocks gained in WORK.homeGhost seconds and he goes THROUGH what is in
    // the way, and he is back on the ground the moment he is closing again.
    if (gap < (e.homeBest ?? Infinity) - 2) {
      e.homeBest = gap;
      e.homeSlow = 0;
      if (e.homeGhosting) { e.scramble = false; e.homeGhosting = false; }
    } else if ((e.homeSlow = (e.homeSlow ?? 0) + dt) > WORK.homeGhost
      && !e.scramble) {
      // not THROUGH it any more: over it. See `scramble` in entities.js.
      e.scramble = true;
      e.homeGhosting = true;
    }
    if (gap < (e.homeNear ?? Infinity) - 0.5) {
      e.homeNear = gap;
      e.homeStall = 0;
    } else if ((e.homeStall = (e.homeStall ?? 0) + dt) > WORK.homeStall) {
      ctx.dropAt?.(e.pos, e.carry);
      for (const st of e.pack ?? []) ctx.dropAt?.(e.pos, st);
      e.carry = null;
      e.pack = null;
      e.carryT = 0;
      e.homeNear = Infinity;
      e.homeStall = 0;
      e.workCast = 0;
      e.workSide = 0;
      return;
    }
    // ...and the same way round a bank on the way back. A day's timber put
    // down in a field because a hedge stood between the wood and the counter
    // is worth less than a day nobody worked at all.
    e.fetch = castRound(e, back, dt, e.homeStall ?? 0, WORK.homeStall);
    return;
  }

  // COURTING BEATS THE TRADE. A man pulled to a spare bed by `raise a
  // family` (see updateFamily in main.js) still carries his work order, and
  // with both loops live the two fought over him — the pairing steering him
  // at the bed, this file re-aiming him at his plot every look — and he
  // stood a hundred blocks from both, walking at nothing. While famPos is
  // set the trade lets him go entirely; endFamily clears it and he picks
  // his chore straight back up.
  if (e.famPos) {
    e.chore = null;
    e.fetch = null;
    return;
  }

  // THE HUNT. The only trade whose job walks away while you are doing it, so
  // it cannot be a cell somebody stands over: it is a body, steered at and
  // swung at until it stops moving, and then the meat goes in their arms.
  if (ord === 'hunt') { tickHunt(dt, e, ctx); return; }

  e.workLook = (e.workLook ?? 0) - dt;
  forgetOld(e, dt);
  const post = e.post ?? e.up;

  // no job in hand: find one, but not more than once a second or so
  if (!e.chore) {
    if (e.workLook > 0) { e.fetch = null; return; }
    e.chore = pickJob(e, ord, post, ctx, dt);
    // ...but not one they have already failed to reach
    if (e.chore && e.workNoGo?.has(`${e.chore.f},${e.chore.u},${e.chore.v}`)) {
      e.chore = null;
    }
    if (!e.chore) {
      say(e, e.whyFor0 === e.order ? (e.why0 ?? 'nothing to do here')
        : 'looking for something to do');
      // Nothing out there. Anything already in their arms comes back to you
      // rather than being held for ever waiting on a full load — a woodcutter
      // stood in a felled clearing holding three logs is a woodcutter who has
      // finished, and should say so by walking over and handing them to you.
      if (e.carry) {
        const home = homeOf(e, ctx);
        if (!home) { e.carry = null; e.pack = null; return; }
        e.fetch = gateOut(e) ?? _v.copy(home).normalize().clone();
        if (e.pos.distanceTo(home) < dropNear(e)) { deliver(e, ctx); return; }
        if ((e.forVillage && !e.hired) || e.depot) openDoorAhead(e, ctx);
        return;
      }
      // look again, but less and less often — see giveUp
      e.workWait = Math.min(WORK.giveUp, (e.workWait ?? WORK.look) * 1.6);
      e.workLook = e.workWait;
      // ...AND HE WAITS WHERE HE WORKS.
      //
      // A field that has just been stripped has nothing ripe in it for the
      // minute the next sowing takes to come on. Left with no target a
      // villager falls back on his idle wander, so what that minute looked
      // like was a farmhand drifting out of his field and back into the
      // village — which is both the thing the player sees and forty blocks
      // from the work the moment it exists again.
      //
      // The last row he worked is where he stands instead. Only the field:
      // a wood is outside the settlement and a woodcutter who has cleared
      // one should come back rather than stand in the stumps all day.
      e.fetch = ord === 'farm' ? (e.workSpot ?? null) : null;
      return;
    }
    e.workWait = WORK.look;
    e.workLook = WORK.look;
    e.workT = 0;
    say(e, 'on the way to it');
    freshClock(e);
    // A cell that has beaten him before is walked at differently: the stall
    // clock starts half spent, so the casts open toward the right angle from
    // the first stumble instead of in the last breath before giving up.
    const g0 = e.workGrudge?.get(`${e.chore.f},${e.chore.u},${e.chore.v}`) ?? 0;
    if (g0) {
      e.workStall = (e.chore.stall ?? WORK.stall)
        * (1 + Math.min(2, g0 * 0.7)) * 0.5;
    }
  }

  const job = e.chore;
  // WALK TO IT — and the walk is ROUND the planet, not through it.
  //
  // Two numbers, because they are two questions and they used to be one. How
  // far he has to WALK is the arc with the climb taken out, which is exactly
  // what entities.js steers by and the only distance it can ever close; how
  // far he has to REACH is the climb on its own. Asking the straight line
  // instead answered "three blocks short" about a man stood at the foot of the
  // tree with his hand on it — see WORK.swing, which is the whole story.
  cellPos(job.f, job.u, job.v, job.h, _c);
  const goal = _c.clone().normalize();
  // where he was last set to work, for the branch above
  e.workSpot = goal;
  const flat = arcApart(e.pos, _c);
  const climb = _c.length() - e.pos.length();
  const grudge = e.workGrudge?.get(`${job.f},${job.u},${job.v}`) ?? 0;
  const patience = (job.stall ?? WORK.stall) * (1 + Math.min(2, grudge * 0.7));
  if (flat > (job.reach ?? WORK.reach + 1.4)) {
    // A shut door is a wall to everything in entities.js, so a cook sent to a
    // furnace inside a smithy stands in the street pushing at the jamb until
    // she writes the job off. Somebody working for you opens the door.
    openDoorAhead(e, ctx);
    // Getting no nearer. A village is laid out on a levelled pad and the
    // world outside it is not, so there are banks a person simply cannot get
    // up however long they push at them — and a worker pushing at one for
    // ever is the most broken thing on the screen. He casts about for a way
    // round first (see castRound); when even that gets him nowhere the job is
    // given up, the spot is put out of mind for a while, and he goes and finds
    // another tree.
    //
    // But a man going ROUND something is not a man getting nowhere, so the
    // clock stops while a detour is running: he is deliberately not walking at
    // the job, and the whole point of the detour is that the gap will not
    // close until he is past whatever he is walking round. Left ticking, the
    // patience is spent on the way out and the job is written off at the far
    // end of a bank he had already got round.
    if (flat < (e.workNear ?? Infinity) - 0.5) {
      e.workNear = flat;
      e.workStall = 0;
    } else if (e.workCast > 0) {
      // going round: hold the clock where it is
    } else if ((e.workStall = (e.workStall ?? 0) + dt) > patience) {
      // A mine nobody can walk to is not a mine. Somebody who cannot even
      // reach the MOUTH of it says so, and main.js goes and prospects
      // somewhere else — see mineFailed. Any deeper into the stair and it is
      // an awkward face rather than a bad site, so it is left alone.
      if (job.kind === 'shaft' && job.step === 0) ctx.mineFailed?.(e);
      giveUpOn(e, job);
      return;
    }
    say(e, e.workCast > 0 ? 'going round something in the way'
      : 'on the way to it');
    e.fetch = castRound(e, goal, dt, e.workStall ?? 0, patience);
    return;
  }
  // HE IS THERE, AND IT IS OVER HIS HEAD. A trunk felled from the foot up runs
  // out of arm before it runs out of logs, and a bed on the floor above is a
  // job you stand under. That is not a spot he could not get to and there is
  // nothing to be gained by pushing at it for another eighteen seconds: he has
  // finished here. Write the column off briefly so the search moves to the
  // next tree rather than handing him this one again, and let him go.
  if (!job.flat && Math.abs(climb) > (job.swing ?? WORK.swing)) {
    giveUpOn(e, { ...job, forget: WORK.forgetHigh });
    return;
  }
  e.fetch = goal;
  freshClock(e);

  // standing over it: put the time in, then do the thing
  e.workGrudge?.delete(`${job.f},${job.u},${job.v}`);
  say(e, 'at it');
  e.workT = (e.workT ?? 0) + dt * toolBonus(e, ord);
  if (e.workT < job.time) return;
  e.workT = 0;
  finishJob(e, ord, job, ctx);
  e.chore = null;
}

// One hunter, one animal. Nothing in here touches a block, so it is the one
// trade that does not need main.js's permission for anything — but it goes in
// this file anyway, because it is a job somebody was set to do and it comes
// home to the same counter the timber does.
function tickHunt(dt, e, ctx) {
  e.workLook = (e.workLook ?? 0) - dt;
  e.huntCd = (e.huntCd ?? 0) - dt;

  // the quarry it is already after, while that is still a thing
  let prey = e.prey;
  if (prey && (prey.dead || !prey.up)) {
    // It went down. Whatever it left is in front of the hunter now — take it
    // and let the carry rule walk it home like any other load.
    for (const st of prey.drops ?? []) stow(e, st, ctx);
    if (!e.forVillage) ctx.flash?.(`${e.job} killed a ${prey.kind}`);
    e.prey = null;
    prey = null;
  }

  if (!prey) {
    if (e.workLook > 0) { e.fetch = null; return; }
    prey = ctx.nearestBeast?.(e.pos, WORK.huntRange, QUARRY) ?? null;
    e.prey = prey;
    if (!prey) {
      say(e, 'looking for something worth killing — nothing within reach');
      e.workWait = Math.min(WORK.giveUp, (e.workWait ?? WORK.look) * 1.6);
      e.workLook = e.workWait;
      e.fetch = null;
      return;
    }
    e.workWait = WORK.look;
    e.workLook = WORK.look;
  }

  e.fetch = _v.copy(prey.up).normalize().clone();
  const gap = e.pos.distanceTo(prey.pos);
  say(e, gap > WORK.huntReach ? `after a ${prey.kind}` : `on a ${prey.kind}`);
  if (gap > WORK.huntReach) {
    // A beast that has run somewhere a person cannot follow is a beast worth
    // giving up on, the same as a tree behind a bank.
    if (gap < (e.workNear ?? Infinity) - 0.5) {
      e.workNear = gap;
      e.workStall = 0;
    } else if ((e.workStall = (e.workStall ?? 0) + dt) > WORK.stall) {
      e.prey = null;
      e.workNear = Infinity;
      e.workStall = 0;
      e.workLook = WORK.look;
    }
    return;
  }
  e.workNear = Infinity;
  e.workStall = 0;
  if (e.huntCd > 0) return;
  e.huntCd = WORK.huntCd;
  e.swingT = 0.25;
  _c.copy(prey.pos).sub(e.pos).normalize();
  prey.damage?.(WORK.huntHit, _c);
  ctx.sound?.('entityHurt', { kind: prey.kind });
}

// TWO HANDS, ONE CELL.
//
// Every finder in here answers "the nearest one", and it answers it to
// whoever asks — so a pair set to the same field were handed the same ear,
// walked to it together, and one of them arrived at a hole. He then asked
// again, got the next nearest, and so did the other one, for ever. It is the
// same waste at a tree and at a bare patch of ground.
//
// A chore somebody already holds is therefore skipped, alongside the spots
// this worker has personally written off. Nothing is stored and nothing has
// to be released: a chore IS the claim, and it goes when the job is done or
// given up on.
function claimed(e, ctx) {
  const out = new Set(e.workNoGo ?? []);
  for (const o of ctx.entities) {
    if (o === e || o.dead || !o.chore) continue;
    out.add(`${o.chore.f},${o.chore.u},${o.chore.v}`);
  }
  return out;
}

// WHY THERE IS NOTHING TO DO. Every trade that comes back empty says so in
// its own words, and the phrase is kept on the worker until he finds
// something — so a hand standing still in the book is a hand with a reason
// beside him. `why0` rather than `why` because the walking and working
// statuses overwrite the live one every frame; this is the one that has to
// survive until the next search.
const none = (e, text) => {
  e.why0 = text;
  e.whyFor0 = e.order;
  return null;
};

// `dt` is only wanted by the build order, whose plot-marking is on a clock
// of its own — see myHousePlot in main.js.
function pickJob(e, ord, post, ctx, dt = 0) {
  const { planet } = ctx;
  // `why0` is NOT cleared here. It used to be, and that quietly wiped every
  // reason written by anything that answers on a clock of its own — the
  // build order marks a plot out once every few seconds, so the frame that
  // set the reason was followed by dozens that erased it before anybody
  // could read it, and a hand who could not build said nothing at all.
  // `none` overwrites it whenever a trade comes back empty, and `whyFor0`
  // is what stops one order's answer showing under another's.
  const [f, u0, v0] = cellOf(post);
  // WHERE A HAND LOOKS FROM, and what keeps him near home. These used to be
  // the same cell — the post — and the trades that hunt for a cell all
  // spiralled out from it, so the job a worker got was always the one nearest
  // the middle of the village rather than the one nearest HIM.
  //
  // That is fine while there is one wood or one field. Give a village two
  // fields at the same distance from its green — which is the ordinary case,
  // because the allotments are laid round the settlement — and it is a
  // catastrophe: pull an ear in one, the other becomes the nearer, and the
  // hand is sent forty blocks across the village. Pull one there and he is
  // sent back. Two farmhands spent a measured two and a half minutes walking
  // between two fields and harvested nothing, which from the street is
  // exactly what the player reported: somebody standing in a field, doing
  // nothing.
  //
  // So the search STARTS where he is standing and is BOUNDED by the post. A
  // worker who has not moved gets precisely the job he got before; one who has
  // walked into a field works the row he is in, and cannot drift out of the
  // village doing it.
  const at = cellOf(e.up);
  const near = at[0] === f ? at : [f, u0, v0];
  const home = { u: u0, v: v0, r: WORK.range };
  if (ord === 'haul') {
    const from = e.forVillage ? e.pos : ctx.player.pos;
    const d = ctx.nearestDrop?.(from, WORK.range);
    return d ? { ...d, kind: 'pick', time: 0.2 }
      : none(e, 'nothing lying about to pick up');
  }
  // THE STOREKEEPER. Three jobs, in order: anything lying about within reach
  // of the store comes in (the pick job, and loadFor brings it straight to
  // the boxes); then the boxes are put in order, one move a job (see
  // tidyStore in main.js); and when there is nothing to do he stands at the
  // store and says so, which is what a keeper with nothing to keep does.
  if (ord === 'keep') {
    const at = ctx.depotJob?.(e);
    if (!at) {
      return none(e, 'no store to keep — lay a chest, or mark one as the store');
    }
    const d = ctx.nearestDrop?.(ctx.depotPos?.(e) ?? e.pos, WORK.keepReach);
    if (d) return { ...d, kind: 'pick', time: 0.2 };
    if (ctx.canTidy?.(e)) {
      return { ...at, kind: 'tidy', time: 1.6, reach: WORK.drop,
        stall: WORK.stall * 2, flat: true };
    }
    return none(e, 'the store is in order — keeping an eye on it');
  }
  // THE SELLING TRIP, which is two legs of one errand and no new machinery.
  // Empty-handed he goes to the store and fills up; holding goods he takes
  // them to a counter; holding coin the carry rule above walks him home with
  // it. `flat` because a chest in a cellar and a counter in a shop are both
  // things you stand beside at a different height, and `stall` is long
  // because the next village is a walk and not a job in the next field.
  if (ord === 'sell') {
    if (!e.carry) {
      const d = ctx.depotJob?.(e);
      return d ? { ...d, kind: 'load', time: 1.4, reach: WORK.drop,
        stall: WORK.stall * 2, flat: true } : null;
    }
    const c = ctx.sellCounter?.(e);
    return c ? { ...c, kind: 'sell', time: 2.4, reach: WORK.drop,
      stall: WORK.stall * 6, flat: true } : null;
  }
  if (ord === 'chop') {
    const t = findTree(planet, near[0], near[1], near[2], WORK.range,
      claimed(e, ctx), home, ctx);
    return t ? { ...t, kind: 'fell', time: WORK.chop }
      : none(e, 'no tree within reach of the wood you marked');
  }
  if (ord === 'level') {
    // The mark is the spirit level: every column within twenty blocks of the
    // spot the order was given is brought to that spot's own height. The
    // height is read once and kept on the hand, so the ground does not chase
    // a target that moves as it is cut.
    if (e.levelH == null || e.levelFor !== `${f},${u0},${v0}`) {
      e.levelH = planet.columnTop(f, u0, v0);
      e.levelFor = `${f},${u0},${v0}`;
    }
    if (e.levelH == null) return none(e, 'no ground under the mark to level to');
    // ...skipping what he has personally written off, or the nearest cell
    // he cannot reach is offered back every look and the whole order stands
    // still behind it
    const avoidL = claimed(e, ctx);
    for (const k of e.workNoGo?.keys() ?? []) avoidL.add(k);
    const t = findLevelJob(planet, f, near[1], near[2], u0, v0, e.levelH,
      avoidL);
    if (!t) {
      return none(e, 'the ground is level for twenty blocks round the mark');
    }
    e.why0 = t.cut ? 'cutting the high ground down level'
      : 'turfing the hollows up to the mark';
    e.whyFor0 = e.order;
    return { ...t, kind: 'flat', time: t.time ?? WORK.dig };
  }
  if (ord === 'stead') {
    const place = ctx.steadFor?.(e);
    if (!place) {
      return none(e, 'no farm marked — mark `the farm` in the book and pick '
        + 'what it keeps');
    }
    const kind = place.kind ?? 'wheat';
    const have = stockOf(storeOf(e, ctx));
    // same rule as the leveller: one unreachable row must not stall the
    // other eighty jobs behind it
    const avoidS = claimed(e, ctx);
    for (const k of e.workNoGo?.keys() ?? []) avoidS.add(k);
    const job = findSteadJob(planet, place, kind, avoidS, have);
    if (job?.short) {
      // A KEEPER SHORT OF WOODWORK MAKES IT. Fences and gates are bench
      // work, and being short is the first half of the job, not the end of
      // it — the same rule the builder got. The chain resolves one step at
      // a time: no fence but sticks and planks, saw the fence; no sticks
      // but planks, cut sticks; no planks but logs, saw planks. Each batch
      // lands in the store and the next look asks again.
      if (job.short === 'fence' || job.short === 'gate') {
        const step = benchStepFor(job.short, have);
        if (step) {
          const t = findBench(planet, f, u0, v0, WORK.range);
          if (t && !e.workNoGo?.has(`${t.f},${t.u},${t.v}`)) {
            const r2 = MATERIALS.find((x) => x.out === step);
            e.why0 = `short of ${job.short}s — making ${r2?.name ?? step} `
              + 'at the bench first';
            e.whyFor0 = e.order;
            return { ...t, kind: 'make', at: 'bench', only: [step],
              time: WORK.make, reach: 4.6 };
          }
        }
      }
      const wants = { fence: 'fences — put planks or logs in the store and '
        + 'he makes them himself',
        gate: 'a field gate — put planks or logs in the store and he makes '
          + 'it himself',
        seeds: 'seeds — put wheat or seeds in the store' }[job.short]
        ?? `${job.short} to sow — pull or buy some first`;
      return none(e, `the store is short of ${wants}`);
    }
    if (job) {
      e.why0 = { pale: 'fencing the farm in',
        wicket: 'hanging the field gate',
        till: 'tilling the rows',
        sow: `sowing the ${kind}` }[job.kind] ?? 'at the farm';
      e.whyFor0 = e.order;
      return job;
    }
    if (STEAD_CROPS.has(kind)) {
      return none(e, 'the farm is fenced, tilled and sown — it wants nothing');
    }
    // A PEN. The woodwork is done; now it is stocked, one beast at a time,
    // walked in off the hill at the drover's heel.
    if ((ctx.penned?.(place, kind) ?? 0) >= STEAD.stock) {
      return none(e, `the ${kind} pen is built and stocked — it wants nothing`);
    }
    if (e.driving && !e.driving.dead) {
      // the walk home, with the beast at his heel
      e.why0 = `walking a ${kind} home to the pen`;
      e.whyFor0 = e.order;
      return { f: place.f, u: place.u, v: place.v + STEAD.r,
        h: planet.columnTop(place.f, place.u, place.v + STEAD.r),
        kind: 'drove', time: 0.3, reach: 3.2, flat: true,
        stall: WORK.stall * 2 };
    }
    const beast = ctx.beastFor?.(place, kind);
    if (!beast) {
      return none(e, `no ${kind} anywhere near to walk in — the hills round `
        + 'the pen are empty');
    }
    const bc = cellOf(beast.up);
    e.why0 = `fetching a ${kind} off the hill`;
    e.whyFor0 = e.order;
    return { f: bc[0], u: bc[1], v: bc[2],
      h: planet.columnTop(bc[0], bc[1], bc[2]), kind: 'lead', beast,
      time: 0.6, reach: 2.4, flat: true, stall: WORK.stall * 2 };
  }
  if (ord === 'plant') {
    const t = findBareGround(planet, near[0], near[1], near[2], WORK.range,
      claimed(e, ctx), home);
    return t ? { ...t, kind: 'plant', time: WORK.plant }
      : none(e, 'no open ground to plant in round here');
  }
  if (ord === 'mine') {
    // The head is the village's, not this worker's — everybody digs the same
    // hole. Somebody working for the player gets one sunk where they stand.
    // ...but not the same FACE as the man beside him, or two miners cut one
    // block and the stair goes down at half speed for twice the hands.
    const job = findMineJob(planet, ctx.mineHead?.(e), claimed(e, ctx));
    // Nothing left in it: the stair has run its length and every seam beside
    // it is out. A worked-out mine is not a reason to stand in a field for the
    // rest of the day, so the village goes and finds another one.
    if (!job) {
      ctx.mineSpent?.(e);
      return none(e, 'the mine is worked out — looking for another');
    }
    return job;
  }
  if (ord === 'build') {
    // The plot main.js has waiting for hands, if this worker's village has
    // one. Nothing to build is not a failure — it is a village that is up to
    // date, and the worker stands about until the chief moves them.
    // A plot the village is raising, or one of YOURS: a hand you hired marks
    // one out at the spot you marked and pays for it out of your store — see
    // myHousePlot in main.js, which also writes the reason when it cannot.
    const plot = ctx.plotFor?.(e, dt);
    if (!plot) {
      // A BUILDER SHORT OF MATERIALS MAKES THEM. Being short is not the end
      // of the job, it is the first half of it: a house is planks, bricks
      // and thatch, and somebody has to stand at the bench turning logs,
      // clay and wheat into those before a single course can go on. So when
      // myHousePlot has left a shortfall on the hand (see buildNeed), he
      // takes bench work — targeted at what the HOUSE wants, not at
      // whatever the store could make (a builder short of thatch who spent
      // the day sawing planks he already had would never finish), and only
      // when the store holds something to make it FROM.
      if (e.hired && e.buildNeed) {
        const store = storeOf(e, ctx);
        // The shopping list is judged against EVERYTHING you own, because his
        // output lands in the box nearest the bench and the plot may be
        // checked against the box nearest the plot. What he can CRAFT is
        // still judged against the store in front of him — a log in a chest
        // across the village is not a log he can saw from here.
        const have = ctx.myStock?.() ?? stockOf(store);
        const craftable = stockOf(store);
        const wanted = Object.entries(e.buildNeed)
          .filter(([wid, n]) => (have[wid] ?? 0) < n).map(([wid]) => wid);
        // Everything made: the shortage is over, and the next look at the
        // plot affords it. Without this he stood at a full store saying he
        // had nothing to make "" from.
        if (!wanted.length) {
          e.buildNeed = null;
          e.why0 = 'the materials are made — marking the plot out';
          e.whyFor0 = e.order;
          return null;
        }
        const r = MATERIALS.find((x) => wanted.includes(x.out)
          && (x.at ?? 'bench') === 'bench'
          && Object.entries(x.need).every(
            ([nid, n]) => (craftable[nid] ?? 0) >= n));
        if (r) {
          const t = findBench(planet, f, u0, v0, WORK.range);
          if (!t) return none(e, 'no bench within reach to make the materials at');
          // The one bench there is may be one he has just failed to walk to.
          // Handing the chore over anyway gets it thrown out on the no-go
          // check with the old status left standing — a man stood doing
          // nothing under a sign that says he is sawing. Say what is true.
          if (e.workNoGo?.has(`${t.f},${t.u},${t.v}`)) {
            return none(e, 'cannot get to the bench from here — '
              + 'he tries again shortly');
          }
          e.why0 = `the store is short — making ${r.name} for the house first`;
          e.whyFor0 = e.order;
          return { ...t, kind: 'make', at: 'bench', only: wanted,
            time: WORK.make, reach: 4.6 };
        }
        const raw = { plank: 'logs', brick: 'clay', thatch: 'wheat' };
        return none(e, 'the store is short and holds nothing to make '
          + `${wanted.join(' or ')} from — it wants `
          + wanted.map((wid) => raw[wid] ?? wid).join(', '));
      }
      // A HAND OF YOURS IS MAIN.JS'S TO EXPLAIN otherwise. myHousePlot knows
      // which of the half-dozen reasons it is — no plot marked, too far to
      // watch, no ground that will take one — and it runs on a clock of its
      // own, so a frame that finds it still counting must not talk over the
      // answer it left last time.
      if (e.hired) return null;
      return none(e, 'no house is going up — a village marks a plot out when '
        + 'its shelf can pay for the materials');
    }
    e.buildNeed = null;                 // a plot exists: the shortage is over
    return { f: plot.f, u: plot.u, v: plot.v, h: plot.h, kind: 'build',
      time: WORK.build, reach: WORK.buildReach, plot };
  }
  if (ord === 'make') {
    // WHICH MACHINE depends on what there is to work. Coin is struck at the
    // mint, fire-work at a furnace and everything else at a bench, so the
    // recipe is chosen first and the walk follows it — and if the village
    // has gold in and a press to strike it on, that is where this worker
    // goes today.
    const store = storeOf(e, ctx);
    const machine = (at) => (at === 'mint' ? findMint(planet, f, u0, v0, WORK.range)
      : at === 'furnace' ? findFurnace(planet, f, u0, v0, WORK.range)
        : findBench(planet, f, u0, v0, WORK.range));
    const timeAt = (at) => (at === 'mint' ? WORK.strike
      : at === 'furnace' ? WORK.cook : WORK.make);
    // WHAT YOU SAID TO MAKE, if you said — the book's bench row. One name,
    // every recipe that makes it (raw ore or ore, either sand), and the
    // machine that name is made at; short of the makings, he says so
    // rather than making something else instead.
    const want = e.hired ? (ctx.makeWant?.(e) ?? null) : null;
    if (want) {
      const rs = MATERIALS.filter((r) => r.name === want
        || (want === 'coin' && r.coin));
      if (!rs.length) return none(e, `nobody knows how to make ${want}`);
      const at = rs[0].at ?? 'bench';
      if (!rs.some((r) => canFill(store, r))) {
        const r0 = rs[0];
        return none(e, `short of what ${want} takes — `
          + Object.entries(r0.need).map(([id, n]) => `${n} ${id.replace(/_/g, ' ')}`)
            .join(' and ') + ' in the store');
      }
      const m = machine(at);
      if (!m) return none(e, `no ${at} within reach to make ${want} at`);
      return { ...m, kind: 'make', at, only: rs.map((r) => r.out),
        time: timeAt(at), reach: 4.6 };
    }
    if (pickRecipe(store, 'mint')) {
      const m = findMint(planet, f, u0, v0, WORK.range);
      if (m) return { ...m, kind: 'make', at: 'mint', time: WORK.strike, reach: 4.6 };
    }
    // ...and with nothing said, the bench if it has anything to work, else
    // the furnace if IT has — fired bricks and glass come out of a store of
    // clay and sand without being asked for — else the bench, standing.
    if (!pickRecipe(store, 'bench') && pickRecipe(store, 'furnace')) {
      const fz = findFurnace(planet, f, u0, v0, WORK.range);
      if (fz) return { ...fz, kind: 'make', at: 'furnace', time: WORK.cook, reach: 4.6 };
    }
    const t = findBench(planet, f, u0, v0, WORK.range);
    if (!t) return none(e, 'no bench within reach to work at');
    // Standing at the bench with nothing to work is still standing at the
    // bench — the same rule the cook is under. A chief that sees nothing
    // coming out of it knows to send somebody for timber.
    return { ...t, kind: 'make', at: 'bench', time: WORK.make, reach: 4.6 };
  }
  if (ord === 'honey') {
    const hive = ctx.nearestHive?.(e.pos, WORK.range);
    if (!hive) return none(e, 'no hive with anything in it round here');
    const c = cellOf(hive.up);
    return { f: c[0], u: c[1], v: c[2],
      h: Math.round(hive.pos.length() - CS.R0 - 0.5),
      kind: 'comb', time: WORK.comb, reach: 3.2, hive };
  }
  if (ord === 'farm') {
    // Whose allotments these are. A village worker farms his village's; a
    // hand you hired and set to work in open country keeps a plot of his own,
    // because "sow it inside a fence" has to mean something to him too — and
    // a hired hand with no field is a man standing in a meadow with a hoe.
    const owner = farmOwner(e, ctx, f, u0, v0);
    const skip = claimed(e, ctx);
    let t = findField(planet, owner, near[0], near[1], near[2], WORK.range,
      skip, home);
    // Every row of every allotment is sown. Rather than stand about, the
    // hands mark out another one and build it — see markOutAllotment. One at
    // a time: a plot already going up is the job, and without this test an
    // idle second would stake out another field every second.
    if (!t && owner && !owner.farms.some((a) => a.raising)
      && markOutAllotment(planet, owner)) {
      t = findField(planet, owner, near[0], near[1], near[2], WORK.range,
        skip, home);
    }
    return t ? { ...t, time: WORK.dig }
      : none(e, owner ? 'every row is sown and none of it is ripe yet'
        : 'no field near the spot you marked, and nowhere to mark one out');
  }
  // THE STREET. main.js owns where the street IS — it is the one module that
  // knows this village's doors, its green and its edge — so both of these ask
  // it for the next cell and do nothing but walk there and pay for it. The
  // store is asked FIRST: a hand sent to pave with an empty shelf should stand
  // about at his post, not walk to a spot he cannot lay anything on.
  if (ord === 'pave') {
    // WHAT the store is paving in decides WHERE there is still work: a village
    // laying gravel has finished the length of road it has already gravelled,
    // and one that has just run out of gravel and started on dirt has not.
    // There is always something to pave with: a path is the ground trodden
    // down and costs nothing (see FREE_PAVING), so a paver is never waiting
    // on the store. What the store HAS decides whether he lays gravel or
    // beaten earth, and that is a thing you can see from the far end of the
    // street rather than a reason to stand about.
    const item = pickPaving(storeOf(e, ctx));
    if (!item) return none(e, 'there is nothing this world can pave with');
    const t = ctx.paveJob?.(e, item, claimed(e, ctx));
    return t ? { ...t, kind: 'pave', time: WORK.pave, reach: WORK.reach + 1.4 }
      : none(e, 'no road left to lay round here — it is all paved');
  }
  if (ord === 'light') {
    if (!lampKit(storeOf(e, ctx))) {
      return none(e, 'nothing to make a lamp from — the store has no post '
        + 'and lantern to put up');
    }
    const t = ctx.lampJob?.(e, claimed(e, ctx));
    return t ? { ...t, kind: 'lamp', time: WORK.lamp, reach: WORK.reach + 2.2 }
      : none(e, 'nowhere dark enough round here to want another lamp');
  }
  if (ord === 'cook') {
    const t = findFurnace(planet, f, u0, v0, WORK.range);
    if (!t) return none(e, 'no furnace within reach to cook at');
    // nothing raw to cook is not a reason to stand somewhere else — she waits
    // at the furnace, which is where a cook waits
    // A generous reach: she is working AT the fire, not standing on it, and
    // a furnace in the corner of a smithy cannot be stood on at all.
    return { ...t, kind: 'cook', time: WORK.cook, reach: 4.6 };
  }
  if (ord === 'bed') {
    // A BED GOES IN A BEDROOM. Not on a hillside and not in a barn: it wants
    // a room with a wall to stand its head against and enough floor left that
    // somebody can still walk past it, which is what bedInRoom measures. So
    // there are two ways to have nowhere to put one, and they want different
    // things done about them.
    const homes = {};
    const t = findBedSpot(planet, ctx.houses(), f, [u0, v0], e.workNoGo, homes);
    if (!t) {
      return none(e, homes.n
        ? `every one of the ${homes.n} house${homes.n === 1 ? '' : 's'} near `
          + 'the spot you marked is full — a bed needs a room with floor to '
          + 'spare'
        : 'no house near the spot you marked — a bed goes in a bedroom, so '
          + 'mark the beds inside one');
    }
    // THE BED UPSTAIRS IS MADE FROM THE ROOM BELOW IT. Nothing in this file
    // can put a man up a ladder: tryBed in entities.js is the only thing in
    // the game that climbs one, and it climbs to a bed rather than to a job.
    // So a spot on the loft floor is measured on the FLAT and he stands under
    // it — which beats the alternative, where the bedroom is a room the beds
    // can only be made in by somebody who can fly.
    return { ...t, kind: 'bed', time: WORK.bed, flat: t.up > 0 };
  }
  return none(e, 'nothing to do about that order here');
}

function finishJob(e, ord, job, ctx) {
  const { planet, setBlock } = ctx;
  const { f, u, v, h } = job;

  if (job.kind === 'pick') {
    const st = ctx.takeDrop?.(job.drop);
    if (st) stow(e, st, ctx);
    return;
  }

  // The two ends of the selling trip. Both are main.js's — one moves goods
  // out of a chest and the other strikes a deal against a village's till, and
  // neither is a block this file is allowed to touch.
  if (job.kind === 'load') { ctx.loadStore?.(e); return; }
  if (job.kind === 'tidy') {
    say(e, 'putting the store in order');
    ctx.tidyStore?.(e);
    return;
  }
  if (job.kind === 'sell') { ctx.sellLoad?.(e, job); return; }

  if (job.kind === 'fell') {
    // THE WHOLE TREE, from this cut up.
    //
    // It used to be one course a swing from the foot, and the leaves were
    // left to rot away on their own — so a woodcutter's afternoon produced a
    // clearing full of floating green boxes standing on nothing, and the
    // canopy was never his: the wood gave him logs and the crown gave
    // somebody else a mess to wait out.
    //
    // Now the cut takes the trunk above it, its branches and the crown they
    // carry, all into his arms, and leaves every course BELOW standing. See
    // fellTree in main.js — the same one the player's own axe calls, because
    // anything you can do a hand you hired can do and the other way round.
    const b = planet.get(f, u, v, h);
    if (!(CS.isLog?.(b) || b === BLOCK.LOG)) return;
    setBlock(f, u, v, h, BLOCK.AIR);
    ctx.sound?.('impact', { block: 'wood' });
    for (const st of dropsFor(b, 'iron_axe')) stow(e, st, ctx);
    const got = ctx.fellTree?.(e, f, u, v, h + 1, 'iron_axe');
    // Into his arms, merged into stacks by fellTree — a crown is three
    // hundred cells and a woodcutter is not carrying three hundred things.
    for (const st of got?.drops ?? []) stow(e, st, ctx);
    // A stump gets a sapling.
    //
    // Without this a village whose chief has put anybody on the timber clears
    // the woods around itself and never stops, because the order stands until
    // the next muster and the next muster gives it again. A woodcutter who
    // replants is both the obvious fix and simply what a woodcutter does — and
    // it makes the forest a renewable thing a settlement lives off rather than
    // a finite one it eats.
    //
    // Only at the FOOT: the cell under this one is ground, which is what says
    // the trunk has come down rather than that a course of it has.
    const under = planet.get(f, u, v, h - 1);
    if (under === BLOCK.GRASS || under === BLOCK.DIRT) ctx.replant?.(f, u, v, h);
    return;
  }

  if (job.kind === 'plant') {
    // Same door a woodcutter's stump goes through — plantSeed decides whether
    // the ground takes it. A planter is a woodcutter run backwards.
    if (planet.get(f, u, v, h) !== BLOCK.AIR) return;
    if (ctx.replant?.(f, u, v, h)) ctx.sound?.('blockPlace', { gain: 0.4 });
    return;
  }

  if (job.kind === 'shaft' || job.kind === 'seam') {
    const b = planet.get(f, u, v, h);
    if (!isDiggable(b)) return;
    setBlock(f, u, v, h, BLOCK.AIR);
    ctx.sound?.('impact', { block: 'stone' });
    // The ore is the whole reason for the hole and it comes home, and so does
    // the clay, which is a wall waiting to be fired. The rest of the spoil
    // does not: a miner who carried every cobble out of a thirty-step stair
    // would fill the shop with rubble and never bring back a lump of coal.
    if (isOre(b) || b === BLOCK.CLAY) {
      for (const st of dropsFor(b, 'iron_pickaxe')) stow(e, st, ctx);
    }
    return;
  }

  if (job.kind === 'build') {
    // A shift on the plot. main.js owns the blocks — the house is a script it
    // plays forward — so all this does is say that somebody was here to do the
    // work, and how much of it they did.
    ctx.buildOn?.(e, job.plot);
    return;
  }

  if (job.kind === 'make') {
    // Out of the village's own store and back onto it: the shop's shelf is
    // both the timber yard and the builder's merchant. A hired hand works out
    // of your bag instead, exactly as the cook does.
    //
    // Asked again at the machine the worker actually reached, not at the one
    // they set out for: the store is shared, and between the walk and the
    // stroke somebody else may have taken the last bar.
    const store = storeOf(e, ctx);
    // `only` is the build order's shopping list: a builder at the bench makes
    // what the HOUSE is short of, never whatever the store happens to be able
    // to make — see the build branch of pickJob, which is the one that sets
    // it.
    const r = job.only
      ? MATERIALS.find((x) => job.only.includes(x.out)
        && (x.at ?? 'bench') === (job.at ?? 'bench')
        && Object.entries(x.need).every(
          ([nid, n]) => (stockOf(store)[nid] ?? 0) >= n))
      : pickRecipe(store, job.at ?? 'bench');
    if (!r) return;
    for (const [id, n] of Object.entries(r.need)) store.remove(id, n);
    // MONEY GOES IN THE PURSE, and everything else goes on the shelf. A shop
    // does not sell coins — the purse IS the shop's coin, see ledger.js — so a
    // village that stocked what it struck would be offering its own money back
    // over the counter at the price of a plank. A hand you hired is paid in
    // goods like any other trade and his strike goes in your bag, which is
    // where the planks he saws go too.
    let left = [];
    if (r.coin && e.forVillage) ctx.mintCoin?.(e, r.count);
    else left = store.addAll([{ id: r.out, count: r.count }]);
    if (!e.forVillage) {
      // Overflow goes down at HIS feet, not at yours: he is standing at the
      // bench and you may be a hundred blocks away, and a stack that fell out
      // of a full chest belongs beside the chest.
      for (const st of left) ctx.dropAt?.(e.pos, st);
      ctx.flash((r.coin ? `struck ${r.count} coin` : `made ${r.count} ${r.name}`)
        + (e.depot ? ' — into your store' : ''));
    }
    ctx.sound?.(r.coin ? 'impact' : 'blockPlace',
      r.coin ? { block: 'stone' } : { gain: 0.45 });
    return;
  }

  if (job.kind === 'comb') {
    const st = ctx.takeComb?.(job.hive);
    if (!st) return;
    stow(e, st, ctx);
    ctx.sound?.('blockPlace', { gain: 0.5 });
    return;
  }

  if (job.kind === 'flat') {
    if (job.fell) {
      // the tree comes down whole; what it drops is left where it falls —
      // levelling yields nothing, and the ground under it is later looks'
      ctx.fellTree?.(e, f, u, v, h, 'iron_axe');
      e.carry = null;
      e.pack = null;
      ctx.sound?.('blockPlace', { gain: 0.5 });
      return;
    }
    // NOTHING IN, NOTHING OUT. Levelling neither yields the spoil nor bills
    // the turf: the cut earth becomes the fill by fiction, which keeps the
    // ledger out of a job that is about the SHAPE of the ground and not its
    // substance. The one nicety is the top: a cut that lands on dirt gets a
    // skin of grass, so a levelled shelf reads as a lawn and not a scar.
    if (job.cut) {
      setBlock(f, u, v, h, BLOCK.AIR);
      // ...and the rest of the stalk over the cut, which has nothing under
      // it now — see the bamboo in findLevelJob
      if (job.stalk) {
        for (let hh = h + 1; hh < CS.H
          && planet.get(f, u, v, hh) === BLOCK.BAMBOO; hh++) {
          setBlock(f, u, v, hh, BLOCK.AIR);
        }
      }
      if (h - 1 === job.target
        && planet.get(f, u, v, job.target) === BLOCK.DIRT) {
        setBlock(f, u, v, job.target, BLOCK.GRASS);
      }
    } else {
      setBlock(f, u, v, h, h === job.target ? BLOCK.GRASS : BLOCK.DIRT);
    }
    ctx.sound?.('blockPlace', { gain: 0.4 });
    return;
  }

  // --- the farm's pieces ---
  if (job.kind === 'pale') {
    const store = storeOf(e, ctx);
    if ((stockOf(store).fence ?? 0) < 1) return;
    store.remove('fence', 1);
    setBlock(f, job.fu, job.fv, job.fh, BLOCK.FENCE);
    ctx.sound?.('blockPlace', { gain: 0.5 });
    return;
  }
  if (job.kind === 'wicket') {
    const store = storeOf(e, ctx);
    if ((stockOf(store).gate ?? 0) < 1) return;
    store.remove('gate', 1);
    // A CROP farm's gate hangs shut — the keeper opens it like any door. A
    // pen's gate is left OPEN, because it is how the beasts get walked in:
    // the fence is the look of the thing and the tether is the truth of it,
    // so nothing escapes through the gap. See the drive in entities.js.
    setBlock(f, job.fu, job.fv, job.fh, job.crop ? BLOCK.GATE : BLOCK.GATE_O);
    ctx.sound?.('blockPlace', { gain: 0.5 });
    return;
  }
  if (job.kind === 'till') {
    const b0 = planet.get(f, u, v, h);
    if (PLANTS.has(b0)) {
      // the wildflower goes, and the ground under it is the next look's job
      setBlock(f, u, v, h, BLOCK.AIR);
    } else {
      setBlock(f, u, v, h, BLOCK.FARMLAND);
    }
    ctx.sound?.('blockPlace', { gain: 0.4 });
    return;
  }
  if (job.kind === 'sow') {
    const store = storeOf(e, ctx);
    const stock = stockOf(store);
    let item = steadSeedItem(job.crop);
    // thresh a head of wheat when the seed sack is empty — see findSteadJob
    if (job.crop === 'wheat' && (stock.seeds ?? 0) < 1
      && (stock.wheat ?? 0) >= 1) item = 'wheat';
    if ((stock[item] ?? 0) < 1) return;
    if (ctx.plantAt?.(f, u, v, h, steadSeedItem(job.crop))) {
      store.remove(item, 1);
      ctx.sound?.('blockPlace', { gain: 0.4 });
    }
    return;
  }
  if (job.kind === 'lead') {
    const b2 = job.beast;
    if (!b2 || b2.dead) return;
    // It may have wandered while he walked. Arriving at where it WAS is not
    // catching it — the next look aims at where it is now.
    if (b2.pos.distanceTo(e.pos) > 6) return;
    ctx.startDrive?.(e, b2);
    return;
  }
  if (job.kind === 'drove') {
    ctx.endDrive?.(e);
    return;
  }

  if (job.kind === 'pull') {
    const b = planet.get(f, u, v, h);
    if (!isRipe(b)) return;
    setBlock(f, u, v, h, BLOCK.AIR);
    ctx.sound?.('blockPlace', { gain: 0.5 });
    for (const st of dropsFor(b, null)) stow(e, st, ctx);
    // sow it again straight away: a field that gets harvested and never
    // replanted is a field that turns into bare dirt in an afternoon
    ctx.sow?.(f, u, v, h);
    return;
  }

  if (job.kind === 'cut' || job.kind === 'fill') {
    // Levelling a new allotment, a spade at a time. The spoil is not carried
    // home — a farmhand shifting a corner of his own field is not a miner —
    // but it is a real edit either way, so the plot really does end up flat
    // for everybody in the world and not only for whoever watched it happen.
    if (job.kind === 'cut') {
      // Anything at all, not just rock and soil. A tuft of grass standing a
      // course above the floor is a column above the floor, and a `cut` that
      // refused to pull plants left three of them on the plot and a farmhand
      // walking back to each one for ever, because the job it kept being
      // given was one it could never finish.
      if (planet.get(f, u, v, h) === BLOCK.AIR) return;
      setBlock(f, u, v, h, BLOCK.AIR);
    } else {
      if (planet.get(f, u, v, h) !== BLOCK.AIR) return;
      setBlock(f, u, v, h, BLOCK.DIRT);
    }
    ctx.sound?.('impact', { block: 'dirt' });
    return;
  }

  if (job.kind === 'fence') {
    // One stake of a new allotment's fence, driven in by somebody standing
    // there. Through setBlock like everything else a worker does, so the plot
    // is really enclosed: it is in the diff, it is saved, and everybody else
    // in the world watches the field go up post by post.
    if (planet.get(f, u, v, h) !== BLOCK.AIR) return;
    setBlock(f, u, v, h, job.block);
    ctx.sound?.('blockPlace', { gain: 0.5 });
    return;
  }

  // ONE CELL OF STREET. Whatever the store is paving in comes off the shelf
  // and goes on the ground, and the block that goes down is the one that came
  // out of the box — see PAVING.
  if (job.kind === 'pave') {
    const store = storeOf(e, ctx);
    // Asked again at the cell he actually reached, not at the one he set out
    // for: the store is shared, and between the walk and the stroke somebody
    // else may have taken the last slab. Same rule the bench is under.
    const id = pickPaving(store);
    if (!id) return;
    const b = blockForItem(id);
    if (b == null) return;
    // A ROAD THAT CLIMBS HAS STEPS IN IT.
    //
    // Paving was flat by definition — one block per cell, whatever the ground
    // did — so a street up a hillside came out as a staircase of full blocks
    // with a one-block riser at every course, which you have to JUMP. A path
    // you cannot walk up is not a path.
    //
    // If the road carries on one course higher on either side of this cell,
    // the cell is a step: the same material, laid as a stair, facing the way
    // the ground rises. Everything else is flat as before. `stairFor` works
    // out both — the block and which way it faces — because only main.js
    // knows what a stair id looks like.
    const step = ctx.stairFor?.(f, u, v, h, id);
    const put = step ?? b;
    const cur = planet.get(f, u, v, h);
    if (cur === put) return;                     // somebody already paved it
    // Only ground, and only ground with nothing standing on it. A path laid
    // through a wall is a hole in somebody's house, and a path laid over a
    // crop is a farmhand's morning thrown away.
    if (!PAVEABLE.has(cur)) return;
    // ...and whatever was growing on it comes up with the paving. See
    // paveJob, which offers these cells on purpose: a road through a meadow
    // that stepped round every daisy would be a road full of holes.
    const over = planet.get(f, u, v, h + 1);
    if (over !== BLOCK.AIR) {
      if (!CS.PLANTS?.has?.(over)) return;
      setBlock(f, u, v, h + 1, BLOCK.AIR);
    }
    // A path is walked into the ground, not taken off a shelf. Everything
    // else is a material and comes out of the store — see FREE_PAVING.
    if (id !== FREE_PAVING) store.remove(id, 1);
    setBlock(f, u, v, h, put);
    ctx.sound?.('blockPlace', { gain: 0.5 });
    return;
  }

  // A LAMP POST: three courses of mast and a light on the top of it, all in
  // one shift, because half a lamp post is a stick in the road. The cell was
  // checked for headroom when it was handed out and it is checked again here,
  // for the same reason the paving is.
  if (job.kind === 'lamp') {
    const store = storeOf(e, ctx);
    const kit = lampKit(store);
    if (!kit) return;
    const mastBlock = blockForItem(kit.mast.id);
    const headBlock = blockForItem(kit.head);
    if (mastBlock == null || headBlock == null) return;
    for (let k = 1; k <= LAMP_HEIGHT + 1; k++) {
      if (planet.get(f, u, v, h + k) !== BLOCK.AIR) return;
    }
    store.remove(kit.mast.id, kit.mast.n);
    for (const w of kit.spend) store.remove(w.id, w.n);
    for (let k = 1; k <= LAMP_HEIGHT; k++) setBlock(f, u, v, h + k, mastBlock);
    setBlock(f, u, v, h + LAMP_HEIGHT + 1, headBlock);
    ctx.sound?.('blockPlace');
    ctx.lit?.(f, u, v, h + LAMP_HEIGHT + 1);
    return;
  }

  if (job.kind === 'till') {
    if (planet.get(f, u, v, h + 1) !== BLOCK.AIR) return;
    setBlock(f, u, v, h, BLOCK.FARMLAND);
    ctx.sound?.('blockPlace', { gain: 0.4 });
    return;
  }

  if (job.kind === 'sow') {
    ctx.sow?.(f, u, v, h);
    return;
  }

  if (job.kind === 'cook') {
    // Whatever raw food the owner is carrying, one at a time. The furnace is
    // hers; the larder is yours. That split is what makes setting somebody to
    // cook a thing you do WITH them rather than at them.
    // Working for you, she cooks out of your bag. Working for the village,
    // she cooks what is on the shop's shelf and puts the dinner back on it —
    // the same trade either way, and in both cases the larder is somebody's
    // and not conjured.
    const store = storeOf(e, ctx);
    if (!store) return;
    const raw = store.contents()
      .find((st) => smeltResult(st.id) && getItem(st.id)?.food);
    if (!raw) return;
    const out = smeltResult(raw.id);
    store.remove(raw.id, 1);
    const left = store.addAll([{ id: out.out, count: out.count }]);
    if (!e.forVillage) {
      for (const st of left) ctx.dropAt?.(e.pos, st);
      ctx.flash(`cooked ${(getItem(out.out)?.name ?? out.out)}`
        + (e.depot ? ' — into your store' : ''));
    }
    ctx.sound?.('blockPlace', { gain: 0.5 });
    return;
  }

  if (job.kind === 'bed') {
    if (planet.get(f, u, v, h) !== BLOCK.AIR) return;
    const cells = bedCells(u, v, job.facing);
    const foot = cells[1];
    if (planet.get(f, foot.u, foot.v, h) !== BLOCK.AIR) return;
    // ...and the room is asked again now the block is going down, because the
    // spot was promised five seconds ago and there are three other women on
    // the same order. See bedFitsRoom.
    if (job.house && !bedFitsRoom(planet, job.house, h, cells)) return;
    const tint = ctx.bedTint?.(f, u, v) ?? 0;
    // Both halves, through setBlock like everything else — so a made bed is in
    // the diff, on the wire and in the save exactly as a laid one is.
    setBlock(f, u, v, h, CS.bedId(tint, job.facing));
    setBlock(f, foot.u, foot.v, h, CS.bedFootId(tint, job.facing));
    ctx.countBed?.(f, u, v, h);
    ctx.sound?.('blockPlace');
    ctx.flash('another bed in the village');
  }
}
