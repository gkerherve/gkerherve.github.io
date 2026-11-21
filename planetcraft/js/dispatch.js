// dispatch.js — the planet's news, written up every dawn.
//
// Publish or Perish has a night: the day's events go to a bigger, slower model
// that writes them up while the department sleeps, and the morning opens on
// what happened. PlanetCraft's version is a war dispatch. Every dawn the day
// before is gathered off the books — who marched on whom and who won, which
// settlement grew and which lost souls, who is rich enough to raise a company
// — and written up as a front page: a headline and a few sentences, with you
// in it when you were in it.
//
// TWO WRITERS, the rule the chief is built under. This file writes a plain
// dispatch at once, out of the numbers, on every machine and with no model at
// all (`plainDispatch`). The digest also goes to the server, and if the game's
// own AI is awake its night model rewrites the same facts as a story and the
// rewrite replaces the plain one for everybody. Nothing waits on it and a game
// with no model reads the plain one — rule 4.
//
// NO PRIVATE INFORMATION. Everything in a digest is off the chronicle and the
// war log: what the almanac already shows to anybody who opens it. A dispatch
// that knew something you could not have counted would be the chief's
// cheating in a newspaper's clothes.
//
// It is a PICTURE of the world and never a cause in it: nothing reads a
// dispatch back to decide anything, so a machine whose model wrote a
// different story plays exactly the same planet.

export const KEEP = 30;              // dispatches kept, newest last

// One village's day off its chronicle: the row for `day` against the row
// before it. Rows are [day, souls, beds, roofs, purse, everIn, everOut, got].
function dayOf(hist, day) {
  if (!hist?.length) return null;
  let i = hist.length - 1;
  while (i >= 0 && hist[i][0] > day) i--;
  if (i < 0 || hist[i][0] !== day) return null;
  const now = hist[i];
  const was = hist[i - 1] ?? null;
  const d = (k) => (was && typeof was[k] === 'number' && typeof now[k] === 'number'
    ? now[k] - was[k] : 0);
  return { souls: now[1], roofs: now[3], purse: now[4],
    dSouls: d(1), dRoofs: d(3), dPurse: d(4) };
}

// Everything the writers get. `villages` is [{ name, mine, hist }], `war` the
// war log ([{ day, line, won?, spoil? }]), newest first, as main.js keeps it.
export function digestFor(day, villages, war, world = '') {
  const rows = [];
  for (const v of villages) {
    const one = dayOf(v.hist, day);
    if (one) rows.push({ name: v.name, mine: !!v.mine, ...one });
  }
  const fights = (war ?? []).filter((w) => w.day === day).map((w) => w.line)
    .reverse();
  const mine = rows.filter((r) => r.mine).map((r) => r.name);
  const lines = [`The planet ${world || ''}, day ${day}.`.replace('  ', ' ')];
  lines.push(mine.length ? `The reader's own settlement: ${mine.join(', ')}.`
    : 'The reader has no settlement of their own yet.');
  lines.push('', 'What happened under arms:');
  lines.push(...(fights.length ? fights.map((f) => `  - ${f}`) : ['  - nothing; no company marched']));
  lines.push('', 'Every settlement at nightfall (souls, houses, purse; change over the day):');
  const sign = (n) => (n > 0 ? `+${n}` : String(n));
  for (const r of [...rows].sort((a, z) => z.purse - a.purse)) {
    lines.push(`  - ${r.name}${r.mine ? ' (the reader\'s)' : ''}: ${r.souls} souls (${sign(r.dSouls)}), `
      + `${r.roofs} houses (${sign(r.dRoofs)}), ${r.purse} coin (${sign(r.dPurse)})`);
  }
  return { day, text: lines.join('\n'), rows, fights, mine };
}

// The dispatch with no model behind it: the loudest fact first.
export function plainDispatch(dg) {
  const { rows, fights, mine, day } = dg;
  const by = (k) => [...rows].sort((a, z) => z[k] - a[k]);
  const grew = by('dRoofs')[0];
  const lost = [...rows].sort((a, z) => a.dSouls - z.dSouls)[0];
  const rich = by('purse')[0];
  const story = [];
  let headline;
  if (fights.length) {
    headline = fights[0].replace(/ — .*/, '');
    story.push(fights.join('. ') + '.');
  } else if (grew && grew.dRoofs > 0) {
    headline = `${grew.name} raises ${grew.dRoofs === 1 ? 'a new house' : `${grew.dRoofs} new houses`}`;
  } else {
    headline = `A quiet day ${day === 0 ? 'on a new world' : 'across the planet'}`;
  }
  if (grew && grew.dRoofs > 0 && !headline.startsWith(grew.name)) {
    story.push(`${grew.name} put up ${grew.dRoofs} house${grew.dRoofs > 1 ? 's' : ''}.`);
  }
  if (lost && lost.dSouls < 0) {
    story.push(`${lost.name} is ${-lost.dSouls} soul${lost.dSouls < -1 ? 's' : ''} down on the day before.`);
  }
  if (rich) story.push(`The fattest purse is ${rich.name}'s, ${rich.purse} coin — a purse that size raises a company.`);
  const you = rows.find((r) => r.mine);
  if (you) {
    const place = by('purse').indexOf(you) + 1;
    story.push(`${you.name} stands ${place === 1 ? 'first' : `${place}${['', 'st', 'nd', 'rd'][place] ?? 'th'}`}`
      + ` of ${rows.length} by its purse.`);
  } else if (!mine.length) {
    story.push('Every settlement on the planet still has a chief who is not you.');
  }
  return { headline, story: story.join(' ') };
}

// The books keep the dispatches: [day, headline, story, by], newest last.
export function keepDispatch(list, day, d, by = '') {
  const row = [day, String(d.headline ?? '').slice(0, 140),
    String(d.story ?? '').slice(0, 1200), String(by ?? '')];
  const i = list.findIndex((r) => r[0] === day);
  if (i >= 0) list[i] = row; else list.push(row);
  list.sort((a, z) => a[0] - z[0]);
  if (list.length > KEEP) list.splice(0, list.length - KEEP);
  return row;
}
