// THE REALM — what the five rings add up to, as numbers somebody can watch.
//
// CLAUDE.md says what the game is for: a village, coin, the neighbours, the
// planet, the other planets. Until this file the last two were sentences.
// Nothing counted the villages you held, nothing happened when you held them
// all, a won raid moved a quarter of a purse and changed nobody's allegiance,
// the "slow road" of trade and goodwill led nowhere, and the only way to make
// a village yours was to take its bell down — which empties it: you were left
// the houses and none of the people.
//
// So a village can now SWEAR. It keeps its bell, its people and its chief,
// and it is held by whoever it swore to: you, or another chief. That one
// record — `lord` on the village's row in the ledger, beside the purse, and a
// record for the reason the purse is one: no machine given the world's name
// could work out who beat whom — is what ring 3 turns into ring 4.
//
// TWO ROADS TO AN OATH, the two CLAUDE.md has always named:
//   the fast one   your company holds its fields at the end of a raid
//   the slow one   coin buys trade, trade buys goodwill (`favour`, also on
//                  the row), and goodwill and a purse of coin buy the oath
// ...and the other chiefs walk the fast one against each other, so the planet
// is not waiting for you: a rival who wins a raid takes the loser's oath, and
// realms grow. Beat the head of one and everything sworn to it comes with it.
//
// This file is the arithmetic and the words. main.js owns the villages, the
// books and the people, as it does for everything else.

export const REALM = {
  // GOODWILL, nought to a hundred, a village's opinion of YOU.
  floor: 40,          // below this a chief will not hear of an oath
  oathAt: 60,         // what the steward asks for — the plain rule
  sure: 80,           // at this no chief refuses: the game's rule, not his
  perCoin: 0.25,      // favour per coin across its counter, either way
  dayCap: 18,         // ...and the most one day's trade can buy
  gift: 25,           // coin in a gift to the chest
  giftFavour: 8,      // ...and what it buys, past the day's cap
  wrong: 6,           // favour lost per point of offence (see offend)
  raided: 45,         // ...and to marching on them
  // THE OATH PRICE: a purse into their chest, by their size. A pact is
  // bought — that is what "goodwill buys a pact" has always said.
  price: (souls) => 40 + 6 * Math.max(0, souls | 0),
  // TRIBUTE: the share of a day's takings a sworn village sends its lord at
  // dawn. Small on purpose — it is a realm, not a mine.
  tribute: 0.12,
  // what a whole planet held sends after you to another world, per village
  crownPerVillage: 6,
};

// Which ring somebody is ON, and the line that says so. `s` is main.js's
// count: { mine, total, coin, name, crowned, planets: { held, total },
// next: { name, favour, price } | null, rival: { name, n } | null }.
export function ringOf(s) {
  if (!s || !s.total) return 0;
  if (s.planets && s.planets.total > 1 && s.planets.held >= s.planets.total) return 6;
  if (s.crowned || s.mine >= s.total) return 5;
  if (s.mine >= 2) return 4;
  if (s.mine >= 1) return 3;
  return 1;
}

const RING_NAMES = ['', 'a village', 'coin', 'the neighbours', 'the planet',
  'the other planets', 'the system'];

// The one line under the clock. Short: it is read at a glance, every day.
export function roadLine(s) {
  const ring = ringOf(s);
  if (!ring) return '';
  const world = s.name ?? 'this world';
  if (ring === 6) return `every world in the system is yours`;
  if (ring === 5) {
    const p = s.planets;
    return p && p.total > 1
      ? `${world} is yours — ${p.held} of ${p.total} worlds held · L for the next`
      : `${world} is yours`;
  }
  if (ring === 1) {
    return 'ring 1 · a village — hang a bell to found one, or win one over';
  }
  const head = `ring ${ring} · ${RING_NAMES[ring]} — ${s.mine} of ${s.total} `
    + `villages on ${world}`;
  const next = s.next
    ? ` · ${s.next.name}: goodwill ${Math.round(s.next.favour)}/${REALM.oathAt}`
    : '';
  const rival = s.rival && s.rival.n > 1 ? ` · ${s.rival.name} holds ${s.rival.n}` : '';
  return head + next + rival;
}

// The five rings as rows, for the almanac's page: each with whether it is
// done and one sentence of where it stands.
export function ringRows(s) {
  const ring = ringOf(s);
  const p = s.planets ?? { held: 0, total: 1 };
  return [
    { n: 1, name: 'A village', done: s.mine >= 1,
      line: s.mine >= 1 ? `You are chief of ${s.mine}.`
        : 'Found one with a bell or a gate, or win one over: by the sword '
          + '(a raid your company wins) or by goodwill and a purse of coin.' },
    { n: 2, name: 'Coin', done: s.coin >= 100,
      line: `${s.coin} coin to your name${s.tribute
        ? `, and ${s.tribute} a day in tribute` : ''}. Coin hires the hands, `
        + 'arms them, and buys the oath of a village that thinks well of you.' },
    { n: 3, name: 'The neighbours', done: s.mine >= 2,
      line: s.mine >= 2 ? `${s.mine - 1} sworn or taken beside your own.`
        : 'Trade at a village\'s counter and its goodwill rises; at '
          + `${REALM.oathAt} its chief will take a purse for his oath. Or march.` },
    { n: 4, name: 'The planet', done: ring >= 5,
      line: ring >= 5 ? `Every settlement on ${s.name} answers to you.`
        : `${s.mine} of ${s.total} on ${s.name}.`
          + (s.rival && s.rival.n > 1
            ? ` ${s.rival.name} holds ${s.rival.n} — take the head of a realm `
              + 'and what is sworn to it comes with it.' : '') },
    { n: 5, name: 'The other planets', done: p.total > 1 && p.held >= p.total,
      line: p.total > 1
        ? `${p.held} of ${p.total} worlds held. L opens the way; the hands `
          + 'standing with you at the pad come too, and a world you hold '
          + 'sends its tribute after you.'
        : 'This world stands alone.' },
  ];
}

// The steward's answer to "will you swear?", which is also the brief a model
// is handed — the same numbers, so a chief has no private ones (rule 2).
//   'never'  below the floor, or nothing behind the asker
//   'ask'    his own judgement: a model decides; the steward says yes at oathAt
//   'yes'    at `sure`, or already beaten
export function oathVerdict(t) {
  // (It used to refuse anybody who was not a chief already — "found a
  // village first" — and the only way to found one was to smelt bronze for
  // a bell. So the first rung of the whole game was a crafting recipe
  // nobody could find. A village will swear to a stranger it thinks well
  // of: that IS how you become a chief.)
  if (t.favour < REALM.floor) {
    return { v: 'never', why: `we hardly know you — goodwill ${Math.round(t.favour)} of the ${REALM.floor} I would even listen at` };
  }
  if (t.coin < t.price) {
    return { v: 'never', why: `an oath is ${t.price} coin into our chest, and you have ${t.coin}` };
  }
  if (t.favour >= REALM.sure) return { v: 'yes', why: 'you have been a friend to this place' };
  return { v: 'ask', steward: t.favour >= REALM.oathAt,
    why: t.favour >= REALM.oathAt ? 'you have traded fairly with us'
      : `not yet — goodwill ${Math.round(t.favour)} of ${REALM.oathAt}` };
}


// ---- THE GUIDE ---------------------------------------------------------------
//
// "At the moment, I do not know what I need to do." The five rings say what
// the game is FOR; they do not say what to press. This is the other half:
// ONE next step at a time, each a thing you can do in the next few minutes,
// with how to do it in a sentence and how far along you are — and, when the
// step is somewhere, which way and how far.
//
// It is worked out from the same count everything else here reads, plus two
// things only the player's own hands can have done (`met` a chief, given a
// `word`), so it can never ask for something already done and never needs
// "completing": do the thing and the step moves on by itself.
//
// `g` is { coin, mine, total, world, planets, met, word, near: { name, dist,
// favour, price, mine } | null, next: { name, favour, price } | null,
// armed, hands }.
export function guideStep(g) {
  const near = g.near;
  const oath = REALM.oathAt;
  if (g.planets && g.planets.total > 1 && g.planets.held >= g.planets.total) {
    return { n: 9, of: 9, title: 'Every world is yours',
      how: 'There is nothing left to take. Build, and rule.', prog: '' };
  }
  if (g.crowned) {
    return { n: 8, of: 9, title: 'Fly to the next world',
      how: 'Press L and choose a world. Stand your hired hands beside you first — they come too.',
      prog: `${g.planets.held} of ${g.planets.total} worlds held` };
  }
  if (g.mine >= 1) {
    if (!g.word) {
      return { n: 5, of: 9, title: 'Set your people to work',
        how: 'You are a chief. Point at one of your villagers, press Z, and pick a job — cut wood, farm, build.',
        prog: '', to: g.home ?? null };
    }
    const t = g.next;
    if (g.mine >= g.total) return guideStep({ ...g, crowned: true });
    if (g.mine === 1) {
      return { n: 6, of: 9, title: `Win a second village${t ? `: ${t.name}` : ''}`,
        how: t && t.favour >= oath
          ? `${t.name} thinks well of you. Right-click its chief and say “Swear to me” — ${t.price} coin.`
          : 'Two ways. TRADE at its shop until its goodwill reaches '
            + `${oath}, then ask its chief to swear. Or hire men (right-click a villager), `
            + 'arm them, and press Z → raid.',
        prog: t ? `goodwill ${Math.round(t.favour)}/${oath} · you have ${g.coin} coin` : '',
        to: t ?? null };
    }
    return { n: 7, of: 9, title: `Take the whole of ${g.world}`,
      how: 'Every village must answer to you: by goodwill and a purse, or by a raid. '
        + 'J → “the road” shows who holds each one.',
      prog: `${g.mine} of ${g.total} villages`, to: t ?? null };
  }
  // not a chief yet
  if (!near) {
    return { n: 1, of: 9, title: 'Find a village',
      how: 'Walk until you see roofs. The round map in the corner shows villages as dark patches.',
      prog: '' };
  }
  if (near.dist > 45 && !g.met) {
    return { n: 1, of: 9, title: `Walk to ${near.name}`,
      how: 'Follow the arrow. Hold W to walk; Space jumps.',
      prog: `${Math.round(near.dist)} blocks away`, to: near };
  }
  if (!g.met) {
    return { n: 2, of: 9, title: `Meet the chief of ${near.name}`,
      how: 'He sits in the biggest hall, on the green. Walk up to him and right-click.',
      prog: '', to: near };
  }
  if (near.favour < oath) {
    return { n: 3, of: 9, title: `Earn ${near.name}'s goodwill`,
      how: 'Sell to its shop: hold the left button on a tree to cut logs, then right-click the '
        + 'shopkeeper and sell them. Every coin traded counts, and so does a gift to the chief.',
      prog: `goodwill ${Math.round(near.favour)}/${oath} · you have ${g.coin} coin`, to: near };
  }
  return { n: 4, of: 9, title: `Ask ${near.name}'s chief to swear to you`,
    how: g.coin >= near.price
      ? 'Right-click the chief and choose “Swear to me”. The village becomes yours.'
      : `It costs ${near.price} coin and you have ${g.coin}. Sell more at the shop first.`,
    prog: `goodwill ${Math.round(near.favour)}/${oath} · ${g.coin}/${near.price} coin`, to: near };
}

// Which way, as an arrow: `angle` is radians clockwise from straight ahead.
export function arrowFor(angle) {
  const A = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
  const k = Math.round((((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 4)) % 8;
  return A[k];
}
