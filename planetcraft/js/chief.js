// chief.js — the scoreboard, and the steward that reads it.
//
// This is the seam the AI chief will eventually sit in. Everything here is
// deliberately built so that the model can be dropped in without anything else
// moving: `survey` gathers the numbers, `report` turns them into a scoreboard
// with the deltas that make progress legible, `brief` renders that as the text
// a model would be shown, and `steward` is a plain rule-based chief that reads
// the same report and answers with the same order list.
//
// A chief that cannot beat its own steward is not finished — so the steward
// exists first, and it is the thing the model is measured against.
//
// It knows nothing about blocks, entities or the DOM. main.js hands it a
// context of plain accessors and gets a decision back; that is what makes it
// testable, and what will let it run on the server later without dragging the
// renderer along. See "Where this is going: the chief" in CLAUDE.md.

// The chronicle's own reader. The row shape is ledger.js's business, so the
// harvest is asked for rather than dug out of element seven — and it is the
// SAME call the almanac makes, which is how a chief and the book the player
// reads are held to one set of numbers.
import { harvestTotals } from './ledger.js';

// ---------------------------------------------------------------------------
// the muster
//
// A chief meets its workers twice a day: at dawn it sets the labour, at dusk
// it counts the takings and posts the watch. Two different decisions, which is
// why it is two and not one.

export const MUSTER = {
  dawn: 6,          // local solar hour
  dusk: 18,
  // How near the player a village has to be to hold one at all. A planet of
  // forty settlements mustering out of sight is a lot of arithmetic nobody is
  // looking at — and worse, it would run every village on the planet while you
  // stood in one of them.
  range: 320,
  // Never twice inside this many seconds, whatever the clock says. The sun can
  // be dragged about by a test hook or by somebody sleeping, and a muster is
  // the one thing that must not fire in a burst.
  cooldown: 90,
};

// Is it muster time for this village? `hour` is its LOCAL solar hour, so two
// settlements on opposite sides of the planet muster at different real moments
// and the calls spread themselves out with no queue and no scheduler.
export function musterDue(rec, hour, day, now) {
  if (!rec) return null;
  const which = hour >= MUSTER.dawn && hour < MUSTER.dusk ? 'dawn' : 'dusk';
  // dusk runs into the small hours, so its "day" is the evening it began on
  const stamp = `${day}:${which}`;
  if (rec.mustered === stamp) return null;
  if (rec.musterAt != null && now - rec.musterAt < MUSTER.cooldown) return null;
  return which;
}

// How many days old the last word from a neighbour has to be before it is
// worth sending somebody again. Two: a village's numbers move by the day, so
// yesterday's news is still news and this morning's is not worth a journey.
export const ENVOY_EVERY = 2;

// ---------------------------------------------------------------------------
// the scoreboard

// How many kinds of goods the scoreboard names. THREE, and the argument for
// the number is the whole argument for naming any: "we gathered 147 things" is
// not an order anybody can carry out, and "the timber is coming in and the
// stone is not" is. Three is what a village with a woodcutter, a miner and a
// farmhand out at once actually brings in — and the ceiling matters as much as
// the floor, because this page is read every ten minutes for every village
// near the player and a line listing everything a village ever picked up would
// be the biggest thing on it.
const HARVEST_SHOWN = 3;

// The kinds worth naming: the biggest few over the village's whole life, plus
// whatever came in TODAY however small.
//
// That second half is not tidiness. A chief that put three hands on the mine
// this morning is asking exactly one question at dusk — did any ore come? — and
// a list ranked on the whole life of the village answers it with last week's
// timber, for as many musters as it takes the ore to out-total the wood. So
// today's work gets a place whatever its lifetime total, which is the cheapest
// way to make a NEW order legible on the very muster after it was given.
//
// The value is always the LIFETIME count, never today's, so that report() can
// difference it against the last muster the same way it differences everything
// else. Four ids at most, and each is a short string and a small number.
function topKinds(totals, today) {
  const out = {};
  for (const r of totals.slice(0, HARVEST_SHOWN)) out[r.id] = r.count;
  const fresh = Object.entries(today ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, z) => z[1] - a[1])[0];
  if (fresh && out[fresh[0]] == null) {
    out[fresh[0]] = totals.find((r) => r.id === fresh[0])?.count ?? fresh[1];
  }
  return out;
}

// The numbers, taken now. `ctx` supplies them; this only decides what a chief
// is allowed to count, which is exactly what the player can also see.
export function survey(site, ctx) {
  const beds = site.beds?.length ?? 0;
  const souls = ctx.souls(site);
  // WHAT CAME IN, off the chronicle rows the almanac plots and off nothing
  // else. Takings only move when something is SOLD, so a village that gathered
  // a hundred logs and sold none reads on the rest of this board as a village
  // that did nothing — which is precisely the wrong thing to tell a chief
  // about the day it spent three hands on the timber. Feedback is what
  // separates a chief with a plan from a random order generator, and this is
  // the only row that says whether the LABOUR worked rather than the counter.
  //
  // A lifetime total rather than a since-figure, because that is the shape
  // every other row here has: report() and the almanac difference it against
  // the last muster and against founding, and one column of arithmetic that
  // works for everything is worth more than one row with a rule of its own.
  const rec = ctx.book?.(site) ?? null;
  const totals = harvestTotals(rec?.hist);
  return {
    souls,
    beds,
    free: Math.max(0, beds - souls),
    roofs: ctx.roofs(site),
    purse: ctx.purse(site),
    // filled in by report(), which is the only thing allowed to reset the
    // running total — a counter two callers clear reads zero whenever you look
    takings: 0,
    got: totals.reduce((n, r) => n + r.count, 0),
    gotTop: topKinds(totals, rec?.got),
    standing: ctx.neighbours(site),
  };
}

// now / at the last muster / at founding, plus what came of the last orders
// and the one line that says which aim is furthest behind.
// `sweep` is the one thing in here with a side effect: the takings counter is
// the MUSTER'S, and reading it clears it. Anything that wants the same page of
// numbers without taking the muster's reading off it — a player standing in
// front of the chief asking him a question — passes { sweep: false }. Asking a
// man how he is doing must not change how he is doing.
export function report(site, ctx, which = 'dawn', { sweep = true } = {}) {
  const rec = ctx.book(site);
  const now = survey(site, ctx);
  const swept = sweep ? ctx.sweep(site) : (ctx.peek?.(site) ?? { in: 0, out: 0 });
  now.takings = swept.in - swept.out;

  const last = rec?.last ?? null;
  const found = rec?.found ?? null;
  const rep = {
    name: site.name ?? 'the village',
    culture: site.culture ?? null,
    day: ctx.day(),
    which,
    now,
    last,
    found,
    // Every order given at the last muster and what became of it. The game
    // already knows: work.js writes off a job a worker could not reach and
    // remembers the spot, and updateVillageLife writes off a match that could
    // not walk home. Those are not failures to hide from a chief — they are
    // the only error signal it gets.
    outcomes: ctx.outcomes(site),
    people: ctx.people(site),
    building: ctx.building?.(site) ?? { plot: null, hands: 0, shortOf: null },
    shelves: ctx.shelves(site),
    musters: rec?.musters ?? 0,
    // What the rules in the system prompt are ABOUT. A chief told that raids
    // cost people and that a village hunts whoever wrongs it, and then handed
    // a page with neither its garrison nor its own temper on it, is a chief
    // asked to reason about things it cannot see.
    garrison: ctx.garrison?.(site) ?? 0,
    realm: ctx.realm?.(site) ?? null,
    // ...and what that garrison is currently able to do. Without this a
    // chief cannot tell "I have five men" from "I have five men and three of
    // them are two valleys away", which is the difference between ordering a
    // raid and ordering the same raid twice.
    war: ctx.war?.(site) ?? null,
    mood: ctx.mood?.(site) ?? null,
    mine: ctx.mine?.(site) ?? false,
    exports: ctx.exports?.() ?? null,
  };
  rep.behind = furthestBehind(rep);
  return rep;
}

// Which of the four aims is doing worst, in one word. Arithmetic off the table
// above and it costs nothing — and it is most of the difference between a
// chief with a plan and a chief that drifts.
export function furthestBehind(rep) {
  const n = rep.now, l = rep.last;
  // Nowhere to sleep beats everything: a village at its bed cap cannot grow
  // at all, whatever else is going well.
  if (n.free <= 0) return 'beds';
  // A till that cannot buy anything is a village that has stopped trading,
  // which is the same thing as having stopped earning.
  if (n.purse < 25) return 'gold';
  if (!l) return 'people';
  const d = {
    people: n.souls - l.souls,
    gold: n.purse - l.purse,
    roofs: n.roofs - l.roofs,
  };
  // whichever moved least since last time — ties go to people, because a
  // village is people and the rest is what they need
  let worst = 'people', best = Infinity;
  for (const [k, v] of Object.entries(d)) {
    if (v < best) { best = v; worst = k; }
  }
  return worst;
}

// The report as the page of text a model would be shown. Kept here so the
// steward and the model read the same thing and neither can quietly get a
// better view of the village than the other.
export function brief(rep) {
  const n = rep.now, l = rep.last, f = rep.found;
  const col = (key) => {
    const a = n[key], b = l?.[key], c = f?.[key];
    const move = b == null ? '' : ` (${a - b >= 0 ? '+' : ''}${a - b} since)`;
    const from = c == null ? '' : `, ${c} at founding`;
    return `${a}${move}${from}`;
  };
  // The kinds by name, each with its own since-figure. A total says whether
  // anybody worked; the names say which of the orders worked, and those are
  // two different questions with two different answers.
  const kinds = Object.entries(n.gotTop ?? {}).map(([id, c]) => {
    const b = l?.gotTop?.[id];
    return `${id} ${c}${b == null ? '' : ` (${c - b >= 0 ? '+' : ''}${c - b})`}`;
  });
  const lines = [
    `${rep.name} — ${rep.culture ?? 'terran'}, day ${rep.day}, ${rep.which} muster`,
    `this is muster ${rep.musters + 1}`,
    '',
    `souls    ${col('souls')}`,
    `beds     ${col('beds')} — ${n.free} free`,
    `roofs    ${col('roofs')}`,
    `purse    ${col('purse')}`,
    `takings  ${n.takings} since the last muster`,
    `gathered ${col('got')}${kinds.length ? ` — ${kinds.join(', ')}` : ''}`,
    `behind   ${rep.behind}`,
    '',
    // who cannot be given work says so — a chief told the barman's name with
    // nothing beside it sent the barman for timber, and he cannot leave his bar
    `people   ${rep.people.map((p) => `${p.name} (${p.sex}, ${p.job}${p.order ? `, ${p.order}` : ''}${p.canWork || p.job === 'chief' || p.job === 'soldier' ? '' : ', at a post — cannot be set to work'})`).join('; ') || 'nobody'}`,
    `building ${rep.building?.plot
      ? `a ${rep.building.plot}, ${rep.building.hands} on it`
        + (rep.building.shortOf ? ` — SHORT OF ${rep.building.shortOf}` : '')
      : (rep.building?.shortOf
        ? `nothing yet — short of ${rep.building.shortOf}` : 'nothing')}`,
    `shelves  ${rep.shelves.slice(0, 8).map((r) => `${r.count} ${r.id} @${r.price}`).join(', ') || 'bare'}`,
    `garrison ${rep.garrison} soldier${rep.garrison === 1 ? '' : 's'} on the walls and the doors`
      + (rep.war ? (rep.war.out
        ? ` — ${rep.war.out.toUpperCase()} IS BEING RAIDED BY US RIGHT NOW`
        : rep.war.besieged
          ? ' — SOMEBODY ELSE\'S MEN ARE IN OUR FIELDS'
          : rep.war.canSend > 0 && rep.war.rested
            ? `; ${rep.war.canSend} of them could march and the walls would still be held`
            : '; none of them can be spared') : ''),
    `mine     ${rep.mine ? 'one, cut and open' : 'none cut yet'}`,
    `export   ${rep.exports ?? 'nothing this world is known for'}`,
    `temper   ${rep.mood?.outlaw > 0
      ? `WE ARE HUNTING SOMEBODY — ${Math.round(rep.mood.outlaw)}s of it left, `
        + `${rep.mood.crimes} offence${rep.mood.crimes === 1 ? '' : 's'} against us`
      : (rep.mood?.crimes
        ? `quiet, but ${rep.mood.crimes} offences have been done to us`
        : 'quiet — nobody has wronged us')}`,
  ];
  // `rep.now.standing`, not `rep.standing`. survey() hangs the neighbours off
  // the scoreboard and report() never copied them up, so this row has been
  // silently absent from every brief a chief was ever shown — which is a fine
  // way to have an aim nobody can pursue.
  if (rep.now.standing?.length) {
    // A distance is not a standing. Until somebody has walked there and back
    // this row said only how far away a village was, which is geography — so
    // it now carries what the last envoy actually brought home, and when. That
    // is the one row on the scoreboard that ring 3 can move.
    lines.push(`neighbours ${rep.now.standing.map((x) => `${x.name} ${x.away} away`
      + (x.kin ? ' (of our realm)' : '')
      + (x.road === 'shut' ? ' — no road through that we could find'
        : x.heard ? ` — day ${x.heardDay}: ${x.heard}` : ' — never heard from'))
      .join('; ')}`);
  }
  // the realm: who we answer to and who answers to us — see js/realm.js
  if (rep.realm) lines.push(`realm     ${rep.realm}`);
  if (rep.outcomes?.length) {
    // The outcomes below say who did what; this says whether any of it reached
    // the village. A gang all "still at chop" with nothing gathered behind it
    // is a different report from the same gang with sixty logs behind it, and
    // only one of the two wants new orders — so the two halves of "what came
    // of the last orders" go on the same line.
    const moved = l?.got == null ? null : n.got - l.got;
    lines.push('', `since the last muster${moved == null ? ''
      : moved > 0 ? ` — ${moved} gathered` : ' — NOTHING gathered'}:`);
    for (const o of rep.outcomes) lines.push(`  ${o}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// the steward
//
// The rule-based chief of rule 4 — what runs when there is no key, no network
// or no answer, and the bar every model chief has to clear. It is deliberately
// simple and deliberately readable: if you cannot say in one line why it did
// what it did, it is too clever for a fallback.
//
// THREE LEVELS, chosen on the settings card (menu → settings → "who runs the
// villages?"). One steward runs every settlement on the planet, so the level
// is really about how sharp a RIVAL every other chief is: easy makes a world
// of slow neighbours, hard a world of chiefs who read their own error signal
// and correct. Medium is the steward exactly as it has always been — it is
// the baseline the model chief is measured against, and a baseline that
// drifts under a difficulty knob is no baseline at all.

export const STEWARD_LEVELS = {
  // EASY: a chief who keeps the village alive and never presses. At most one
  // hand on the timber unless the till is nearly empty, nobody at the mine or
  // after the honey, no envoys on the road, one builder on a plot — and it
  // never replants, so an easy neighbour slowly eats its own forest, which is
  // the polite way of losing.
  easy: {
    wood: (purse) => (purse < 40 ? 2 : 1),
    replant: false, mine: false, honey: false,
    bedAhead: 0, buildHands: 1, envoy: false, adapt: false, duskOut: true,
    // ...and it never marches on anybody. An easy neighbour is one you can
    // turn your back on, which is most of what easy means.
    war: 0, raidOdds: 0,
  },
  // MEDIUM: the standing steward, untouched.
  medium: {
    wood: (purse) => (purse < 80 ? 3 : purse < 200 ? 2 : 1),
    replant: true, mine: true, honey: true,
    bedAhead: 0, buildHands: 2, envoy: true, adapt: false, duskOut: true,
    // Cautious: it sends its men when the money is the thing it is furthest
    // behind on — and, one dawn in eight, because it has a man to spare and
    // a neighbour it has heard of. See `itch` in the steward.
    war: 1, raidOdds: 1 / 8,
  },
  // HARD: the same rules with the corrections a good player would make. It
  // builds a bed BEFORE the last one is taken, puts a third pair of hands on
  // a rising plot, reads what came of the last orders — a trade everybody
  // gave up on is redirected rather than re-issued, which is the whole point
  // of the outcome lines — and at dusk it keeps people near the lanterns
  // instead of sending them out into the dark for meat and honey.
  hard: {
    wood: (purse) => (purse < 80 ? 3 : purse < 200 ? 2 : 1),
    replant: true, mine: true, honey: true,
    bedAhead: 1, buildHands: 3, envoy: true, adapt: true, duskOut: false,
    // Ready: a hard neighbour raids for coin or for room, and it only needs
    // one man to spare. This is the setting that makes the planet dangerous.
    war: 2, raidOdds: 1 / 5,
  },
};

// Where a written-off trade goes instead, on hard. A woodcutter who gave up
// on every tree he tried is not sent back to the trees; the money moves to
// the mine, the mine's failure moves to the trees, and the walking trades
// fall back to the fields, which are inside the village and cannot be
// unreachable.
const REDIRECT = { chop: 'mine', mine: 'chop', hunt: 'farm', honey: 'farm',
  plant: 'farm', farm: 'haul', haul: 'farm' };

export function steward(rep, ctx, level = 'medium') {
  const L = STEWARD_LEVELS[level] ?? STEWARD_LEVELS.medium;
  const n = rep.now;
  const hands = rep.people.filter((p) => p.canWork);
  const orders = [];
  const say = [];
  if (!hands.length) return { orders, speech: null };

  // Long walks — the mine, the hunt, the hives, the road — are for the dawn
  // muster on a chief that minds the dark; dusk keeps everybody near the
  // lamps. Easy and medium send people out whenever, as they always did.
  const outing = L.duskOut || rep.which === 'dawn';

  // What went WRONG last time, read off the same outcome lines the brief
  // shows a model. A steward that ignores its own error signal re-sends
  // three hands at a bank they cannot climb for ever — told "gave up on
  // three spots it could not reach", a hard chief sends them elsewhere.
  const noGo = new Set();
  if (L.adapt) {
    for (const o of rep.outcomes ?? []) {
      const m = /was set to (\w+) and gave up/.exec(String(o));
      if (m && REDIRECT[m[1]]) noGo.add(m[1]);
    }
  }

  const pool = hands.slice();
  // Taken from a preferred list first, then from anybody. Nobody is picked
  // twice, so a village of three does three jobs and not one job three times.
  const take = (pref = null) => {
    let i = pref ? pool.findIndex(pref) : -1;
    if (i < 0) i = pool.length ? 0 : -1;
    return i < 0 ? null : pool.splice(i, 1)[0];
  };
  const woman = (p) => p.sex === 'woman';
  const man = (p) => p.sex === 'man';
  const set = (p, order, line, extra = null) => {
    if (!p) return false;
    let o = order;
    if (noGo.has(o)) {
      const swap = REDIRECT[o];
      if (swap && !noGo.has(swap)
        && !(swap === 'mine' && !L.mine)) {
        line = `the ${o} went nowhere yesterday — ${swap} instead`;
        o = swap;
      }
    }
    orders.push({ who: p.id, order: o, line, ...(extra ?? {}) });
    return true;
  };

  // 1. Nowhere to sleep is the end of everything. A village at its bed cap
  //    cannot take another soul however well the rest is going, so this comes
  //    before the money and before the food. A hard chief starts the bed one
  //    free bed EARLY — a pair walks to an empty one the day it is made, and
  //    a village that builds at the cap has already spent a day not growing.
  if (n.free <= L.bedAhead) {
    if (set(take(woman), 'bed', 'we have nowhere to put anybody')) {
      say.push(n.free <= 0
        ? 'every bed is full — I have set someone to building'
        : 'the beds are nearly full — one more is being made');
    }
  }

  // 1b. THE HOUSE BEFORE THE TRADES. Building and the bench were step six,
  //     after two woodcutters, a planter, two on the rows, a cook and the
  //     mine — so a village of six never reached either. Measured: Wyedean
  //     with 59 logs on its shelf, nobody at the bench, no plank made all
  //     day, and no house ever marked out. A plot whose materials are in is
  //     the most valuable order there is; and a shelf already holding the
  //     raw stuff the house is short of wants one pair of hands turning it,
  //     not a third pair cutting more of it.
  const b = rep.building ?? {};
  if (b.plot && !b.shortOf) {
    let on = 0;
    for (let i = 0; i < L.buildHands; i++) {
      if (!set(take(), 'build', `the ${b.plot} wants building`)) break;
      on++;
    }
    if (on) say.push(`${on} on the new ${b.plot}`);
  }
  const RAW = { plank: 'log', brick: 'clay', thatch: 'wheat',
    cobblestone: 'stone' };
  const raw = RAW[b.shortOf];
  // any timber saws into plank (MATERIALS in work.js), not only oak
  const feeds = (id) => id === raw || (raw === 'log' && /(^|_)log$/.test(id)
    && id !== 'stripped_log');
  const fed = raw && (rep.shelves ?? []).some((r) => feeds(r.id) && r.count > 0);
  let benchEarly = false;
  if (fed && set(take(), 'make', `we have the ${raw} — the house wants ${b.shortOf}`)) {
    benchEarly = true;
    say.push(`short of ${b.shortOf} and the ${raw} is in — one at the bench`);
  }

  // 2. Somebody is always earning.
  //
  //    This is the rule that took a correction: the first steward only cut
  //    timber when the till was nearly empty, which meant a village that
  //    started comfortable never earned a coin in its life. The aim is to
  //    GROW the purse, not to stop it reaching zero — so there is always at
  //    least one hand on the timber, and more when the money is short.
  //    On hard, a chief whose furthest-behind aim is the gold presses one
  //    hand harder than the till alone would ask for.
  let woodcutters = L.wood(n.purse);
  if (L.adapt && rep.behind === 'gold') woodcutters += 1;
  let cutting = 0;
  for (let i = 0; i < woodcutters; i++) {
    if (!set(take(man), 'chop', 'timber sells')) break;
    cutting++;
  }
  if (cutting) {
    say.push(n.purse < 80
      ? `the till is down to ${n.purse} — ${cutting} on the timber`
      : `${cutting} on the timber`);
  }

  //    ...and somebody puts the wood back. A gang left cutting clears a
  //    forest, and a forest is the thing this village earns off — so from
  //    the second woodcutter on, one hand is a planter. It is the cheapest
  //    rule in here and it is the difference between a village with a wood
  //    and a village with a clearing. An easy chief skips it, and pays in a
  //    fortnight.
  if (L.replant && cutting > 1
    && set(take(man), 'plant', 'put back what we are cutting')) {
    say.push('one on the saplings');
  }

  // 3. Food. A village that only cuts wood is a village that starves in a
  //    good market, and the rows want working whatever the purse says.
  //
  //    TWO, where there are hands to spare. One was the number when a farmhand
  //    could not harvest anything — see findField in work.js, where the ripe
  //    branch could never fire — so a second hand on the land would have been
  //    a second person standing in a field. Now that a hand pulls a crop and
  //    puts one back every second or so, the fields are the fastest visible
  //    work a village does, and a settlement of eight can afford a pair on
  //    them: it is the food, and it is the thing the player walks past.
  //
  //    Counted off the WHOLE workforce and not off what is left in the pool:
  //    by the time the fields come round the timber and the saplings have
  //    already taken their hands, so "is anybody spare" answers no in a
  //    village that has six people and could plainly spare one.
  let onLand = 0;
  for (let i = 0; i < (hands.length >= 6 ? 2 : 1); i++) {
    if (!set(take(), 'farm', 'the rows want working')) break;
    onLand++;
  }
  if (onLand) {
    say.push(onLand > 1 ? `${onLand} on the rows` : 'the rows are being worked');
  }

  // 4. A cook, once there is somebody spare and a fire to stand at. She
  //    turns what the fields brought in into something worth more.
  if (pool.length > 1) set(take(woman), 'cook', 'somebody should be cooking');

  // 5. The mine, when there is somebody to spare for it. Ore is the best
  //    money in the ground and it is also the slowest — a stair takes a day
  //    to sink — so it goes after the trades that pay the same afternoon.
  //    Not on easy: an easy neighbour never gets at the best money in the
  //    ground, which is most of what makes it easy.
  if (L.mine && outing && pool.length > 1
    && set(take(man), 'mine', 'there is coal and iron out there')) {
    say.push('one at the mine');
  }

  // 6. The bench, and then the plot. These two together are the whole of how
  //    a settlement gets bigger: somebody turns what has been brought in into
  //    planks and bricks, and somebody else stands on the ground and builds
  //    with them. A plot with nobody on it does not rise at all.
  //    (The plot's builders went first — see 1b — and so did the bench if
  //    there was anything on the shelf for it.) A hard chief that is behind
  //    on roofs and short of materials doubles the bench rather than the
  //    fields: the house is the bottleneck, not the bread.
  const benchHands = ((L.adapt && rep.behind === 'roofs' && b.shortOf) ? 2 : 1)
    - (benchEarly ? 1 : 0);
  for (let i = 0; i < benchHands; i++) {
    if (pool.length > 1 && set(take(), 'make', b.shortOf
      ? `we are short of ${b.shortOf}` : 'timber is not a roof yet')) {
      if (i === 0) {
        say.push(b.shortOf ? `short of ${b.shortOf} — one at the bench`
          : 'one at the bench');
      }
    } else break;
  }

  // 7. Meat, and then honey. Both are somebody walking a long way for one
  //    good load, which is exactly what a village with hands to spare should
  //    be doing with them — in the morning, on a chief that minds the dark.
  if (outing && pool.length > 1) {
    set(take(man), 'hunt', 'we could do with the meat');
  }
  if (L.honey && outing && pool.length > 1) {
    set(take(), 'honey', 'the comb sells better than it keeps');
  }

  // 8. Word to the neighbours. This is the only order in here that scores the
  //    fourth aim, and it is deliberately the LAST thing a village spends a
  //    person on: an envoy is a pair of hands gone for the length of a
  //    journey, and a settlement that cannot feed itself has no business
  //    keeping up a correspondence. So every trade above gets its hand first,
  //    and this takes whoever is left — which is the man rule 9 would
  //    otherwise put on the road to watch it. It wants the morning, too,
  //    because a man sent out at dusk walks the whole way in the dark.
  //
  //    FOUR HANDS is the floor. It was "more than two still in the pool after
  //    everything", which on a village of fifteen souls — seven of whom can
  //    work, the rest being the chief, the counter, the altar and the walls —
  //    left nobody, every muster, for ever: a rule that reads as prudence and
  //    behaves as never. A settlement with four working hands can spare one
  //    for a morning every second day; one with three cannot.
  //
  //    One at a time, never down a road the last one could not find a way
  //    through, and never to a village we heard from within ENVOY_EVERY days:
  //    an envoy is for finding out what CHANGED, and nothing changes in an
  //    afternoon. The stalest neighbour goes first, which over a week is the
  //    cheapest possible round of everybody.
  //
  //    Not on easy: an easy neighbour never learns how anybody else stands,
  //    which keeps its fourth aim at zero and its people at home.
  const outAlready = rep.people.some((p) => p.order === 'envoy');
  const stale = (n.standing ?? [])
    .filter((x) => x.road !== 'shut'
      && (x.heardDay == null || rep.day - x.heardDay >= ENVOY_EVERY))
    .sort((a, z) => (a.heardDay ?? -1e9) - (z.heardDay ?? -1e9))[0];
  if (L.envoy && rep.which === 'dawn' && !outAlready && stale
    && hands.length >= 4 && pool.length >= 1
    && set(take(man), 'envoy', `go and tell ${stale.name} how we stand`,
      { to: stale.name })) {
    // not "on the road" — that is what rule 9 says about the watch, and two
    // lines a muster apart that mean opposite things is one line too many
    say.push(`one away to ${stale.name} with word of us`);
  }

  // 8b. THE OTHER ROAD TO A VILLAGE THAT IS NOT YOURS.
  //
  //    A raid is the fast road and the envoy above is the slow one, and this
  //    is deliberately the LAST thing considered and the first thing a chief
  //    is judged on: it costs the men it sends, it makes an enemy of a
  //    neighbour for a good while, and it pays in one lump of somebody
  //    else's money. So it is asked for only when the money is what is
  //    furthest behind — a village raiding while it is short of BEDS is a
  //    village that has misunderstood its own scoreboard.
  //
  //    `war` is the level's appetite: never on easy, only-for-coin on
  //    medium, coin-or-room on hard. The game refuses it anyway if the men
  //    are already out, if the walls cannot spare them, or if the last raid
  //    was too recent — see startWar — so this only has to want it.
  //
  //    ...OR SIMPLY BECAUSE IT CAN. A garrison that only ever marched when
  //    the purse was the worst of the four numbers marched never: with two
  //    or three men to a village and two of them kept for the walls,
  //    `canSend` was nought on most of the planet and the fast road to a
  //    neighbour was a road nobody walked. So a rested chief with a man to
  //    spare rolls for it every dawn — one morning in eight on medium, one
  //    in five on hard — off a hash of the day and the village rather than
  //    off Math.random, so that every machine in a shared world rolls the
  //    same and the raid one client sees is the raid the others see.
  const W = rep.war;
  const itch = (L.raidOdds ?? 0) > 0 && rep.which === 'dawn'
    && hashRoll(`${rep.name}|${rep.day}|raid`) < L.raidOdds;
  const wantsWar = L.war > 0 && W && !W.out && !W.besieged && W.rested
    && W.canSend >= 1
    && (itch || rep.behind === 'gold'
      || (L.war > 1 && rep.behind === 'roofs'));
  if (wantsWar) {
    // Who: the neighbour we have actually HEARD of, oldest news first, and
    // the nearest if we have heard from nobody. A chief may only march on a
    // village it knows is there — which is the envoy's whole job, and the
    // reason ring 3 is walked before it is fought.
    const known = (n.standing ?? []).filter((x) => x.road !== 'shut' && !x.kin);
    const mark = known.find((x) => x.heard) ?? known[0] ?? null;
    orders.push({ who: -1, order: 'raid', to: mark?.name ?? null,
      line: `we take what we are short of` });
    say.push(mark?.name
      ? `the money is not coming in — the men are marching on ${mark.name}`
      : 'the money is not coming in — the men are marching');
  }

  // 9. Anybody still spare keeps the road. Not idleness — a village with
  //    nobody watching is a village the night walks into. A hard chief at
  //    dusk posts an extra pair of eyes: the hands it kept home from the
  //    hunt are exactly the hands the night wants on the lanterns.
  let watching = 0;
  const posts = (!L.duskOut && rep.which === 'dusk') ? 3 : 2;
  for (const p of pool.slice(0, posts)) {
    if (set(p, 'guard', 'somebody should be watching')) watching++;
  }
  if (watching) say.push(`${watching} on the road`);

  // A chief says something every muster, even a quiet one. A voice that only
  // speaks when there is a crisis is an alarm, not a chief — and the line is
  // how the player finds out what it is trying to do.
  const aim = {
    beds: 'we need somewhere to sleep before we need anything else',
    gold: 'the money is what I am short of',
    people: 'we are not growing — I want more hands',
    roofs: 'we could do with another roof',
  }[rep.behind] ?? null;
  if (aim) say.unshift(aim);

  return { orders, speech: say.join('; ') || null };
}

// A roll every machine agrees on: a string hashed to [0, 1). The steward
// runs on every client of a shared world, so anything it decides by chance
// has to be chance off the same numbers everywhere — the day, the village —
// or two machines land different orders on the same people.
export function hashRoll(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export default { survey, report, brief, steward, musterDue, MUSTER,
  STEWARD_LEVELS, hashRoll };
