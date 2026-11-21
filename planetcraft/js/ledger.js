// ledger.js — the second thing the world stores.
//
// The terrain is a pure function of (radius, seed, preset) and always will be.
// The record of what PEOPLE DID is not, and it has always been stored: that is
// what the edit diff is. This file is the other half of that record — the
// village's money.
//
// The argument for it, in one line: a shop whose stock is a pure function of
// (cell, seed, day) cannot be earned from. Buying changes nothing, the shelves
// reset at midnight, and a chief told to make money has no lever to pull. So a
// village has a purse, the shelves remember what left them, and the takings
// add up. See rule 5 under "the chief" in CLAUDE.md.
//
// WHAT IS STILL DERIVED. Everything except the deltas. The shelves are still
// `shopStock(cell, seed, day)`; this only records what has been taken off them
// and what has been put on. Two machines given the world's name still agree
// about what the shop stocks — they need the ledger only to agree about what
// has happened to it, which is exactly the same deal the edit diff has.

// What a village has in the till before anybody trades with it. Derived from
// its size, so it is not stored until it changes: a market town can buy what
// you are carrying and a hamlet cannot, which is a real difference between
// them and one you find out by trying.
export const startingPurse = (houses = 0) => 40 + Math.round(houses * 12);

// How much of what a shop bought yesterday is still on the shelf today. It
// moves stock on like any other shop, and without this a player who sells a
// village four hundred cobblestone has changed that shop for the rest of the
// world's life.
const CARRY_OVER = 0.5;

function blank(houses) {
  return {
    purse: startingPurse(houses),
    // HOW MANY PEOPLE LIVE HERE. The same argument as the purse, and it was
    // missed for the same reason the purse was: it looks derived and it is
    // not. spawnFolk rolls a founding three-to-five off the village's own
    // cell, ensureFolk deletes every soul in a village the moment the player
    // walks out of range, and the pairing puts them back one at a time — so a
    // count taken by counting bodies forgets every child born while you were
    // looking, and a village can never grow past the day it was founded.
    //
    // Two machines given only the world's name cannot work out how many
    // people live here after a week of somebody playing. It took people
    // living, so it is a record, and a record has to be kept.
    //
    // null means "nobody has ever filled this village": the founding roll
    // still stands, and a world nobody has walked in is unchanged.
    souls: null,
    // WHAT AN ENVOY BROUGHT HOME. key of the village it is about ->
    // { name, day, word } — the day the reading was taken and the line off
    // that village's own book. The same argument as the purse and the souls:
    // two machines given only the world's name cannot work out which village
    // has heard from which, because it took a man walking. It lived on the
    // site object, which is rebuilt from the seed on every load, so every
    // journey anybody had ever made was thrown away on save.
    heard: {},
    // ...and the roads nobody could get through. key -> THE DAY IT FAILED.
    //
    // A TIMER, not a flag, and stored as the day it happened rather than the
    // days it has left — which is the one thing the peace of the village gets
    // to do differently. `site.outlaw` counts seconds DOWN and does not
    // survive a reload, and that is right for a chase that is happening now:
    // the guard is not still running an hour after you shut the tab. A road
    // written off last Tuesday is not happening now, it is a thing that
    // happened, so it is dated — and a save reloaded three days later comes
    // back with three days of the six still to run rather than six or none.
    roadShut: {},
    // itemId -> how many have been taken OFF the derived shelf today
    sold: {},
    // itemId -> how many have been put ON it, by anybody
    bought: {},
    // itemId -> how many the village's OWN people brought in today. A subset
    // of `bought` and not the same question: `bought` counts everything that
    // reached the shelf, including the four hundred cobblestone a player sold
    // over the counter, and "are we getting anywhere" is a question about
    // what the village gathered by its own hands.
    got: {},
    day: -1,
    // coin in and out since the last muster — the one row on the scoreboard
    // that says whether the last orders earned anything
    inCoin: 0,
    outCoin: 0,
    // lifetime, for the "at founding" column
    everIn: 0,
    everOut: 0,
    // The scoreboard as it stood at the first muster and at the last one.
    // Kept here rather than worked out on the fly because "at founding" is by
    // definition not derivable — the village it describes no longer exists.
    found: null,
    last: null,
    musters: 0,
    // THE CHRONICLE. One row per world day per village, from the first day
    // anybody looked: [day, souls, beds, roofs, purse, everIn, everOut] —
    // and, on a day the village actually gathered something, an eighth
    // element: { itemId: count } for what its own people brought in.
    //
    // It is the same argument the purse is on and it is the reason the
    // almanac can draw a line rather than a number — "the village is doing
    // badly" is a guess, "it has lost four souls in six days and its takings
    // have halved" is a fact, and the second one is only available to somebody
    // who wrote the first six days down. Two machines cannot work this out
    // from the world's name, so it is a record and a record has to be kept.
    //
    // Cumulative coin rather than the daily figure, because the daily figure
    // is the difference of two of these and the cumulative one is not
    // recoverable from a gap. Seven small numbers a day a village: a hundred
    // days of forty villages is about a hundred kilobytes of JSON, which is
    // why it is capped.
    //
    // The harvest is the one variable-length thing in the row, so it is kept
    // to a budget the same way: the biggest HARVEST_KINDS ids only, and the
    // element is simply absent on a day nothing came in — which is most days
    // for most villages, because only eight settlements have anybody living
    // in them at once (see ensureFolk) and nobody else is out gathering.
    // Measured: a bare row is 20 bytes of JSON, a working day of three kinds
    // adds 36, and the fullest possible row adds 79.
    hist: [],
  };
}

// How many days of chronicle a village keeps. A hundred and twenty world days
// is forty hours of play at DAY_LENGTH, and the oldest rows fall off the front
// rather than the file growing without bound.
const HIST_DAYS = 120;

// How many kinds of goods one day's harvest row remembers. Six is what a
// village with a woodcutter, a miner, a farmhand and a hunter all out at once
// actually brings in; the seventh kind on a day is a curiosity, and a row that
// took every id a village ever touched would be the biggest thing in the save.
const HARVEST_KINDS = 6;

// The most souls one village's record will hold. The pairing already stops at
// LIFE.cap in main.js, which is forty; this is the wider bound the FILE keeps,
// because a number that gets saved has to be bounded by the thing saving it
// and not by whichever rule happened to write it last. It is also what stands
// between a corrupt save and a village trying to put a thousand meshes in the
// scene when you walk up to it.
const SOULS_MAX = 64;

// How many neighbours one village's book remembers — of both kinds. THE COST
// IS WHY THERE IS A NUMBER HERE AT ALL. `heard` is one entry per neighbour a
// village has met and `roadShut` one per road it failed on, so both are
// bounded by the settlement count and a forty-village planet would otherwise
// put forty entries on forty records: nine hundred lines of prose in the save
// file to say who had walked where. Six is more than the brief shows (three)
// and about what `envoyReach` in main.js will even let a village write to —
// its own face, inside 200 cells — so the cap bites on a crowded planet and
// never on an ordinary one. Freshest few kept, oldest dropped.
//
// MEASURED, off a saved world rather than guessed: one heard entry — its key,
// the neighbour's name, the day and the line of word — is 140 bytes of JSON,
// and one shut road is 14. Six of each is 924 bytes a village, so the worst
// planet there is, forty settlements that have all corresponded with six
// neighbours apiece, is 36kB. A village that has heard nothing costs 8 bytes
// (`null,null`), and one nobody has ever opened a till in costs nothing at
// all, because it has no record.
const NEWS_KEEP = 6;

// ...and the longest line of news that is worth keeping. `villageWord` in
// main.js writes about 110 characters; this is the bound the FILE keeps, for
// the same reason SOULS_MAX exists — a number that gets saved has to be
// bounded by the thing saving it and not by whichever caller wrote it last.
const WORD_MAX = 200;

// The day's harvest as it goes into a row: the biggest few, nothing empty, and
// null rather than {} so a day nobody worked costs no bytes at all.
function topGot(got) {
  const rows = Object.entries(got ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, z) => z[1] - a[1])
    .slice(0, HARVEST_KINDS);
  return rows.length ? Object.fromEntries(rows) : null;
}

// The news as it goes into the file: the freshest NEWS_KEEP, each a positional
// triple the way a chronicle row is, because the three keys of an object
// written six times a village for forty villages are pure postage.
function packHeard(heard) {
  const rows = Object.entries(heard ?? {})
    .filter(([, h]) => h && h.word)
    .sort((a, z) => (z[1].day ?? -1e9) - (a[1].day ?? -1e9))
    .slice(0, NEWS_KEEP)
    .map(([k, h]) => [k, [h.name ?? null, h.day ?? 0,
      String(h.word).slice(0, WORD_MAX)]]);
  return rows.length ? Object.fromEntries(rows) : null;
}

function unpackHeard(packed) {
  const out = {};
  for (const [k, v] of Object.entries(packed ?? {})) {
    if (!Array.isArray(v)) continue;
    out[k] = { name: v[0] ?? null, day: v[1] ?? 0, word: v[2] ?? '' };
  }
  return out;
}

// ...and the shut roads, which are a day each and need no packing beyond the
// same cap. Freshest first, because the oldest are the ones about to expire
// anyway and losing one early costs a village one wasted journey.
function packShut(shut) {
  const rows = Object.entries(shut ?? {})
    .filter(([, d]) => typeof d === 'number')
    .sort((a, z) => z[1] - a[1])
    .slice(0, NEWS_KEEP);
  return rows.length ? Object.fromEntries(rows) : null;
}

// The dispatches' key in a saved set of books. Not a cell, so it can never be
// a village's: every village key is three numbers and a comma between each.
const NEWS = '~news';

export class Ledger {
  constructor() {
    this.books = new Map();      // "f,u,v" -> record
    // the planet's dispatches, [day, headline, story, by], newest last — see
    // js/dispatch.js. Kept with the books because it is the same kind of
    // thing: a record of what happened, which no machine can re-derive once a
    // model has written it.
    this.news = [];
    this.dirty = false;
  }

  static key(site) {
    return site ? `${site.f},${site.u},${site.v}` : null;
  }

  // The record for a village, made on first use. `site` is an entry off
  // planet.villageSites.
  of(site) {
    const k = Ledger.key(site);
    if (!k) return null;
    let rec = this.books.get(k);
    if (!rec) {
      rec = blank(site.houses ?? 0);
      this.books.set(k, rec);
    }
    this.post(site, rec);
    return rec;
  }

  // THE SITE'S NEWS AND THE BOOK'S NEWS ARE ONE OBJECT.
  //
  // Everything that reads what an envoy learned reads `site.heard` and
  // `site.roadShut` — the chief's brief, the talk card, the flash when he
  // arrives, and the pick of who to send to next. Moving all of them onto the
  // ledger would have been the same amount of storage and a great deal more
  // edit, and it would have put a book lookup in the middle of a per-frame
  // reader; so the shape stays exactly where it was and the site's two fields
  // are simply made to BE the record's two fields. Write through the site and
  // you have written the book, which is why nothing else had to change.
  //
  // The merge is for order: `heardWord` in main.js does `host.heard ??= {}`
  // and can reach a village whose till has never been opened, so anything
  // already on the site is folded in — newest wins, because the site's copy
  // is this session's and the record's is the file's — and then the site is
  // pointed at the record for good.
  post(site, rec) {
    if (!site || !rec) return rec;
    for (const f of ['heard', 'roadShut']) {
      const book = rec[f] ??= {};
      const live = site[f];
      if (live === book) continue;
      if (live) Object.assign(book, live);
      site[f] = book;
      this.dirty = true;
    }
    return rec;
  }

  // Roll the shelves over to a new day: the delivery arrives, so what was sold
  // is back, and what the shop bought is half moved on.
  roll(rec, day) {
    if (!rec || rec.day === day) return rec;
    rec.day = day;
    rec.sold = {};
    // a new day's work starts at nothing; yesterday's is already written into
    // yesterday's row and is not carried over the way stock is
    rec.got = {};
    const kept = {};
    for (const [id, n] of Object.entries(rec.bought)) {
      const left = Math.floor(n * CARRY_OVER);
      if (left > 0) kept[id] = left;
    }
    rec.bought = kept;
    this.dirty = true;
    return rec;
  }

  // --- the chronicle ---------------------------------------------------------

  // Write down where a village stood today, once. Called from a slow pass over
  // every settlement rather than from the muster: a village nobody has ever
  // traded with still has a history, and it is the villages you are NOT
  // standing in that the almanac is for.
  chronicle(rec, day, now) {
    if (!rec || !now) return false;
    const h = rec.hist ??= [];
    const last = h[h.length - 1];
    const row = [day, now.souls, now.beds, now.roofs, now.purse,
      rec.everIn, rec.everOut];
    const got = topGot(rec.got);
    if (got) row.push(got);
    if (last && last[0] === day) {
      // the same day, later on: keep the newest reading rather than the first
      h[h.length - 1] = row;
      return false;
    }
    h.push(row);
    if (h.length > HIST_DAYS) h.splice(0, h.length - HIST_DAYS);
    this.dirty = true;
    return true;
  }

  // A load came in off somebody's back. Written into the day's row as it
  // happens rather than waiting for the next chronicle sweep, because the last
  // sweep of a day can be minutes before the last barrow, and a barrow that
  // arrives after it would otherwise never be written down at all.
  harvest(rec, day, id, n) {
    if (!rec || !id || !(n > 0)) return;
    this.roll(rec, day);
    const got = rec.got ??= {};
    got[id] = (got[id] ?? 0) + n;
    const h = rec.hist;
    const last = h?.[h.length - 1];
    if (last && last[0] === day) {
      const top = topGot(got);
      if (top) last[7] = top;
      else if (last.length > 7) last.length = 7;
    }
    this.dirty = true;
  }

  // --- who lives here --------------------------------------------------------
  //
  // Ordinary villagers only. The garrison is rolled from the site's own cell
  // every time the village fills and comes out the same each time, and the
  // chief, the priest and the man behind the counter are spawned down paths of
  // their own that never empty — so counting any of them here would double
  // them the first time somebody walked away and back.

  // What is written down, or null if nobody has ever filled this village and
  // the founding roll still stands.
  souls(rec) {
    return rec && rec.souls != null ? rec.souls : null;
  }

  // Write the count down as it is. Called when a village is first filled —
  // that is the founding roll being recorded rather than a decision — and
  // never again with a number that came from counting bodies, because bodies
  // are exactly what this exists to stop trusting.
  setSouls(rec, n) {
    if (!rec) return;
    const v = Math.max(0, Math.min(SOULS_MAX, Math.round(n) || 0));
    if (rec.souls === v) return;
    rec.souls = v;
    this.dirty = true;
  }

  // One more, or one fewer: a child born, or somebody buried. Nothing else
  // moves it — a village streaming out of the world as the player walks off is
  // not a plague, and it is the whole reason this number exists.
  addSouls(rec, d = 1) {
    // Nothing to move. A village whose founding roll still stands has no base
    // to add to, and seeding one here off a death would write down a number
    // that came from counting bodies — which is the mistake this file exists
    // to stop making.
    if (!rec || !d || rec.souls == null) return;
    this.setSouls(rec, rec.souls + d);
  }

  // --- the till --------------------------------------------------------------

  // Somebody bought `n` of `id` for `coins`. The coin is the village's now.
  took(rec, id, n, coins) {
    if (!rec) return;
    rec.sold[id] = (rec.sold[id] ?? 0) + n;
    rec.purse += coins;
    rec.inCoin += coins;
    rec.everIn += coins;
    this.dirty = true;
  }

  // The village bought `n` of `id` and paid `coins` for them. It can only do
  // that with money it has — see canAfford — which is the whole reason the
  // purse is worth caring about.
  gave(rec, id, n, coins) {
    if (!rec) return;
    rec.bought[id] = (rec.bought[id] ?? 0) + n;
    rec.purse = Math.max(0, rec.purse - coins);
    rec.outCoin += coins;
    rec.everOut += coins;
    this.dirty = true;
  }

  canAfford(rec, coins) {
    return !!rec && rec.purse >= coins;
  }

  // Read the takings since the last muster and start them again. Called by
  // the scoreboard, and by nothing else — a counter two things reset is a
  // counter that reads zero whenever you look at it.
  sweep(rec) {
    if (!rec) return { in: 0, out: 0 };
    const out = { in: rec.inCoin, out: rec.outCoin };
    rec.inCoin = 0;
    rec.outCoin = 0;
    return out;
  }

  // --- storage ---------------------------------------------------------------
  //
  // Small on purpose: a planet of forty villages that have all been traded
  // with is a few hundred bytes, and one nobody has visited is nothing at all,
  // because a record is only made when somebody first opens a till.

  toJSON() {
    if (!this.books.size) return null;
    const out = {};
    for (const [k, r] of this.books) {
      // souls last, so that a save written before there was such a thing
      // loads with the element simply absent — and one villager is four bytes
      // of JSON a village, which is what a number this load-bearing ought to
      // cost. The news is on the same footing, and capped here rather than
      // where it is written: main.js writes straight through the site into
      // these two objects, so this is the one place that sees them all and
      // the one place that can honestly say what they cost.
      out[k] = [r.purse, r.day, r.sold, r.bought, r.everIn, r.everOut,
        r.found, r.last, r.musters, r.hist, r.souls,
        packHeard(r.heard), packShut(r.roadShut),
        // the game's own AI's plan for its next far muster — see paperMuster
        r.plan ?? null,
        // WHO THIS VILLAGE HAS SWORN TO — 'you', the key of another village,
        // or nobody — and what it thinks of the player. See js/realm.js: the
        // same argument as the purse, because no machine given the world's
        // name could work out who beat whom or who traded fairly with whom.
        r.lord ?? null, Math.round((r.favour ?? 0) * 10) / 10];
    }
    if (this.news.length) out[NEWS] = this.news;
    return out;
  }

  // TAKE SOMEBODY ELSE'S BOOKS WITHOUT LOSING YOUR OWN.
  //
  // `load` replaces, which is right for a save — the file IS the world. It is
  // wrong for a set of books arriving over the wire, and it cost a player
  // their whole village: a settlement you founded is on your books and on
  // nobody else's until something ships it, and the welcome handed the
  // server's copy straight to `load`. Ten rows went in, nine came out, and
  // the missing one was the only village the player actually lived in — its
  // souls came back null, which every reader downstream is entitled to treat
  // as "nobody has ever lived here" and write a nought over.
  //
  // So: a row the sender has never heard of is KEPT, because no row in this
  // file is ever deleted and an absence is not a deletion. And a row it has
  // heard of wins, EXCEPT where it carries an absence of its own — a null
  // count is not a reading of nought, it is no reading at all, and it must
  // never be allowed to overwrite one somebody actually took.
  merge(data) {
    if (!data) return this;
    const mine = this.books;
    const theirs = new Ledger().load(data);
    const incoming = theirs.books;
    // a dispatch a model wrote outranks the plain one for the same day
    for (const n of theirs.news) {
      const i = this.news.findIndex((m) => m[0] === n[0]);
      if (i < 0) this.news.push(n);
      else if (n[3] || !this.news[i][3]) this.news[i] = n;
    }
    this.news.sort((a, z) => a[0] - z[0]);
    for (const [k, row] of incoming) {
      const had = mine.get(k);
      if (had && row.souls == null && had.souls != null) row.souls = had.souls;
      // ...and the same for an oath and for goodwill: a sender who has not
      // heard that a village swore has no reading of it, not a reading of
      // "free", and goodwill is the player's own and only ever earned here
      if (had && row.lord == null && had.lord != null) row.lord = had.lord;
      if (had && !(row.favour > 0) && had.favour > 0) row.favour = had.favour;
      mine.set(k, row);
    }
    this.dirty = true;      // we may know more than the sender does: say so
    return this;
  }

  load(data) {
    this.books.clear();
    this.news = [];
    if (!data) return this;
    for (const [k, v] of Object.entries(data)) {
      if (!Array.isArray(v)) continue;
      if (k === NEWS) {
        this.news = v.filter((n) => Array.isArray(n) && typeof n[0] === 'number');
        continue;
      }
      const hist = Array.isArray(v[9]) ? v[9] : [];
      const day = v[1] ?? -1;
      // The day's harvest is not stored twice. Today's row already holds it,
      // so a save made at noon comes back with the morning's work still on the
      // books and the afternoon's adding to it.
      const tail = hist[hist.length - 1];
      const got = (tail && tail[0] === day && tail[7]) ? { ...tail[7] } : {};
      this.books.set(k, {
        purse: v[0] ?? 0,
        // A save from before the count was kept has no element ten, and comes
        // back with the founding roll still standing — which is exactly what
        // that world has been playing with all along.
        souls: v[10] ?? null,
        day,
        sold: v[2] ?? {},
        bought: v[3] ?? {},
        got,
        inCoin: 0,
        outCoin: 0,
        everIn: v[4] ?? 0,
        everOut: v[5] ?? 0,
        found: v[6] ?? null,
        last: v[7] ?? null,
        musters: v[8] ?? 0,
        hist,
        // A save from before the envoys walked has no elements eleven and
        // twelve and comes back with a village that has heard nothing —
        // which is exactly where that world was.
        heard: unpackHeard(v[11]),
        roadShut: { ...(v[12] ?? {}) },
        plan: (v[13] && typeof v[13] === 'object') ? v[13] : null,
        // absent from a save made before villages could swear: nobody's
        lord: typeof v[14] === 'string' ? v[14] : null,
        favour: Number.isFinite(v[15]) ? v[15] : 0,
      });
    }
    this.dirty = false;
    return this;
  }
}

// What is actually on the shelf: the derived stock, less what has gone off it,
// plus whatever has been sold TO the shop. That last part is the loop worth
// having — sell a village ten iron ingots, walk back in tomorrow, and they are
// on the shelf at the shop's own price.
export function shelves(derived, rec, priceOf, markup = 1) {
  const rows = [];
  const seen = new Set();
  for (const row of derived) {
    seen.add(row.id);
    const left = row.count - (rec?.sold[row.id] ?? 0) + (rec?.bought[row.id] ?? 0);
    if (left > 0) rows.push({ ...row, count: left });
  }
  for (const [id, n] of Object.entries(rec?.bought ?? {})) {
    if (seen.has(id) || n <= 0) continue;
    rows.push({ id, count: n, price: Math.max(1, Math.round(priceOf(id) * markup)) });
  }
  return rows;
}

export default Ledger;

// --- reading a harvest back out ---------------------------------------------
//
// The row shape is this file's business, so anything that wants to know what a
// village gathered asks here rather than knowing that it is element seven.

// Totals by item over the whole chronicle, biggest first.
export function harvestTotals(hist) {
  const sum = {};
  for (const r of hist ?? []) {
    for (const [id, n] of Object.entries(r?.[7] ?? {})) {
      sum[id] = (sum[id] ?? 0) + n;
    }
  }
  return Object.entries(sum).sort((a, z) => z[1] - a[1])
    .map(([id, count]) => ({ id, count }));
}

// One item day by day, as rows a plot can take. The days none of it came in
// are still in the run, because a gap in the work is precisely what the plot
// is for — a line that skipped them would show a village always busy.
export function harvestSeries(hist, id) {
  return (hist ?? []).map((r) => [r[0], r?.[7]?.[id] ?? 0]);
}

// --- per-planet stash --------------------------------------------------------
//
// Only one planet is resident, so the books of the world you fly away from
// have nowhere to live: buildWorld calls `ledger.load(null)` on the way in,
// and a village you had traded with for a week was one nobody had ever walked
// into by the time you came home. That is the same loss rule 5 in CLAUDE.md
// exists to stop, arriving through a different door.
//
// Mirror of travel.js's edit stash and blockentity.js's, deliberately kept
// here so travel.js does not have to learn about purses. The books are keyed
// by CELL, so they only mean anything against the world they were written in
// — which is exactly why the planet has to be regenerated from the seed it
// was built from before these are handed back. See planetSeeds in main.js.

const _stash = new Map();      // planetId -> the ledger's own JSON

export function stashBooks(planetId, ledger) {
  if (!planetId) return 0;
  const json = ledger?.toJSON?.() ?? null;
  if (json) _stash.set(planetId, json);
  else _stash.delete(planetId);        // a planet nobody has traded on is free
  return json ? Object.keys(json).length : 0;
}

export function booksFor(planetId) {
  return _stash.get(planetId) ?? null;
}

export function bookStashState() {
  const out = {};
  for (const [id, json] of _stash) out[id] = json;
  return out;
}

export function loadBookStashState(obj) {
  _stash.clear();
  for (const id of Object.keys(obj ?? {})) {
    if (obj[id]) _stash.set(id, obj[id]);
  }
  return _stash.size;
}
