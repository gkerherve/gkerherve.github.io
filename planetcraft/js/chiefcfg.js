// chiefcfg.js — who runs the villages, and how to reach them.
//
// The chief is the game (see CLAUDE.md), and there are two of them: a PROGRAM
// that plays by rules you can read, and a MODEL that plays by whatever it
// thinks. This is the card that chooses, and the plumbing that lets the model
// half be any of half a dozen services rather than only one.
//
// Two things are load-bearing here and both come from rule 4:
//
//   1. THE PROGRAM IS THE FLOOR, and it is not a degraded mode. The default is
//      the game's own AI — a small model on this machine, no key and no
//      network — and whenever it cannot answer (still waking, still
//      downloading, not installed) every village is run by the steward in
//      js/chief.js, which is a complete game. Nothing below is required.
//
//   2. THE KEY NEVER GOES IN THE REPOSITORY and never goes anywhere but the
//      server that is already running your world. It is kept in this browser's
//      localStorage and sent to your own machine over your own network.
//
// The provider list is deliberately wide. Anthropic, OpenAI and Mistral are
// hosted services with keys; Ollama and "local" are something already running
// on your own machine and want a URL rather than a key. All five speak one of
// two wire formats, which is what makes this a list and not five integrations.
//
// Two fields on the local ones earn their place, and both were learned the
// hard way against a real Ollama:
//
//   `key: 'maybe'`  A model on this machine wants no key. The SAME service on
//      ollama.com does — and so does a box on the network that somebody put a
//      proxy in front of. Offering no key box at all meant the address field
//      could be pointed at either of those and there was no way to say who you
//      were. Optional, not absent.
//
//   `wait`  How long anybody will wait for one answer. Forty-five seconds is
//      right for a datacentre and hopeless for a 7B on your own CPU: measured,
//      a local Ollama took over three minutes over the same page a hosted
//      model answers in five seconds, so every call was cut off before a token
//      of it came back and the whole thing looked broken when it was working.

export const PROVIDERS = [
  {
    // THE GAME'S OWN MIND, and the default. Publish or Perish showed what it
    // is worth: a game that carries its own small model has people who think
    // for every player, not only for the ones with an account and a card on
    // file. Ollama runs it on this machine (ai_engine.py, local_ai.py); the
    // server starts it with the game and an installed game fetches the model
    // by itself the first time. Until it answers, the program does — rule 4.
    id: 'builtin', name: 'the game’s own AI', wire: 'builtin',
    local: true, builtin: true, wait: 600,
    blurb: 'a small model the game carries and runs on this machine — '
      + 'Granite 4.2 unless you choose another. No key, no bill, nothing '
      + 'leaves the house, and every chief on the planet thinks with it.',
  },
  {
    id: 'program', name: 'a program', wire: null,
    blurb: 'the steward in js/chief.js — rules you can read, no key, no '
      + 'network, and the bar every model chief is measured against',
  },
  {
    id: 'anthropic', name: 'Anthropic', wire: 'anthropic',
    base: 'https://api.anthropic.com',
    models: ['claude-opus-5', 'claude-sonnet-5', 'claude-fable-5',
      'claude-haiku-4-5'],
    key: true, wait: 45,
    blurb: 'Claude. The one the game was designed against.',
  },
  {
    id: 'openai', name: 'OpenAI', wire: 'openai',
    base: 'https://api.openai.com/v1',
    models: [], key: true, wait: 45,
    blurb: 'anything on the OpenAI chat-completions endpoint',
  },
  {
    id: 'mistral', name: 'Mistral', wire: 'openai',
    base: 'https://api.mistral.ai/v1',
    models: [], key: true, wait: 45,
    blurb: 'Mistral, on the same wire format as OpenAI',
  },
  {
    id: 'ollama', name: 'Ollama', wire: 'openai',
    base: 'http://127.0.0.1:11434/v1',
    models: [], key: 'maybe', local: true, wait: 600,
    blurb: 'a model already running on this machine — nothing leaves the '
      + 'house and it wants no key. The address below is where Ollama '
      + 'answers by default; leave it alone unless the model is on another '
      + 'machine, and pick "Ollama cloud" above for the ones it runs for you.',
  },
  {
    // ITS OWN ROW, because the alternative was a sentence telling somebody to
    // retype the address by hand — and somebody did the other half of it,
    // pasted the key against the local address, and got a card that looked
    // broken. An address you have to know is an address you get wrong.
    id: 'ollamacloud', name: 'Ollama cloud', wire: 'openai',
    base: 'https://ollama.com/v1',
    models: [], key: true, wait: 90, keyHint: 'from ollama.com → keys',
    blurb: 'the big models Ollama runs for you rather than on your machine. '
      + 'Sign in at ollama.com, make a key there, and paste it below — '
      + 'nothing else to fill in.',
  },
  {
    id: 'local', name: 'something local', wire: 'openai',
    base: 'http://127.0.0.1:8080/v1',
    models: [], key: 'maybe', local: true, wait: 600,
    blurb: 'llama.cpp, LM Studio, vLLM, anything else that answers on the '
      + 'OpenAI wire format — give it the base URL',
  },
];

export const providerOf = (id) => PROVIDERS.find((p) => p.id === id)
  ?? PROVIDERS[0];

const KEY = 'planetcraft.chief';

// What the game does with no settings at all: the game's own AI, with the
// program behind it for whenever the AI cannot answer — which is a whole game
// on its own.
export const DEFAULTS = {
  provider: 'builtin',
  // which version of these defaults the setting was saved under: '' is from
  // before the game carried its own AI, when 'program' was the default and
  // so was saved by everybody who never chose — see loadCfg
  v: '2',
  model: '',
  key: '',
  base: '',
  effort: 'low',
  // seconds to wait for one answer; '' means "whatever this provider needs"
  wait: '',
  // how sharp the program plays — see STEWARD_LEVELS in js/chief.js. One
  // steward runs every settlement, so this is really the difficulty of the
  // planet's other chiefs; it also sets the fallback when a model cannot
  // answer.
  level: 'medium',
};

// ONE SLOT PER SERVICE, and the key half of it is not a nicety.
//
// There was a single `key` shared by the whole card, so choosing another
// service and typing its key wrote over the one before it — silently, in a
// password box showing dots, with nothing on screen to say that anything had
// been lost. A key is generally shown to you ONCE by whoever issued it, so
// what that costs is not a setting: it is going back to an account page and
// making a new one, and finding out that the old one is unrecoverable.
//
// The model and the address had the same shape of bug and a smaller bill —
// glance at another service and the one you were using forgot which model you
// had picked. So all three are kept per service in `per`, and the three fields
// beside it are only ever THE ONES IN FORCE: the copies handed to the rest of
// the game and to the server, swapped in as you change service and written
// back whenever you type.
export const slotOf = (cfg, id = cfg?.provider) => {
  const all = (cfg?.per && typeof cfg.per === 'object') ? cfg.per : {};
  const one = all[id];
  return (one && typeof one === 'object') ? one : {};
};
export const keyFor = (cfg, id) => slotOf(cfg, id).key ?? '';

// Change something about the service in force, in both places at once.
export function remember(cfg, patch) {
  Object.assign(cfg, patch);
  cfg.per = { ...(cfg.per ?? {}),
    [cfg.provider]: { ...slotOf(cfg), ...patch } };
  return cfg;
}

// Bring a service's own settings forward when it is chosen.
export function recall(cfg, id) {
  const one = slotOf(cfg, id);
  cfg.provider = id;
  cfg.key = one.key ?? '';
  cfg.model = one.model ?? '';
  cfg.base = one.base ?? '';
  return cfg;
}

export function loadCfg() {
  const out = { ...DEFAULTS, per: {} };
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || '{}');
    for (const k of Object.keys(DEFAULTS)) {
      if (typeof o[k] === 'string') out[k] = o[k];
    }
    for (const [id, one] of Object.entries(
      (o.per && typeof o.per === 'object') ? o.per : {})) {
      if (one && typeof one === 'object') {
        out.per[id] = {};
        for (const f of ['key', 'model', 'base']) {
          if (typeof one[f] === 'string') out.per[id][f] = one[f];
        }
      }
    }
    // A setting saved before the game carried its own AI says 'program'
    // because that was the default, not because anybody chose it — the
    // card had nothing else that worked without a key. It is read as the
    // old default, as a save from before Realistic was the default is.
    if (!o.v && (o.provider ?? 'program') === 'program') out.provider = 'builtin';
  } catch { /* a corrupt setting is not worth a broken game */ }
  out.v = DEFAULTS.v;
  if (!PROVIDERS.some((p) => p.id === out.provider)) out.provider = 'builtin';
  if (!['easy', 'medium', 'hard'].includes(out.level)) out.level = 'medium';
  // A config written before this was kept apart has one of each, and they
  // belong to the service it was last chosen with. Nothing is thrown away by
  // the change; it stops being the only slot there is.
  if (!out.per[out.provider] && (out.key || out.model || out.base)) {
    out.per[out.provider] = { key: out.key, model: out.model, base: out.base };
  }
  return recall(out, out.provider);
}

export function saveCfg(cfg) {
  try { localStorage.setItem(KEY, JSON.stringify(cfg)); }
  catch { /* private mode; it still holds for this session */ }
}

// The base URL actually in force: what was typed, or the provider's own.
export const baseFor = (cfg) => (cfg.base || providerOf(cfg.provider).base || '');

// ...and the patience actually in force, in seconds. The server bounds its own
// call with this and the talk card sizes its own giving-up on it, so both ends
// give a slow model the same rope. See `wait` in the table above.
export const waitFor = (cfg) => Number(cfg.wait)
  || providerOf(cfg.provider).wait || 45;

// --- asking a service what it can run ----------------------------------------
//
// The refresh button. Every one of these services will list its own models,
// and asking is better than a list baked into this file that goes stale the
// week after it is written — which is exactly what happened to every such list
// ever written.
//
// It is a request from the BROWSER, straight to the service. That is the right
// place for it: the key is already here and the answer is only ever shown here.
//
// ...and it is not always POSSIBLE, which is the second half of this function.
// Ollama answers a page served from the machine it is running on and refuses
// every other one — a 403 with no CORS headers on it, which a browser turns
// into a fetch that simply fails. So a player on a laptop, playing a world
// hosted on the desktop that is running the model, cannot ask it anything from
// here however right the address is. The game server can: it is on that
// machine, it has no origin to be judged on, and it already holds the key it
// would use to CALL the thing. So the service is asked first and the server is
// asked second, and `ask` is how the card reaches it.
export async function listModels(cfg, ask = null) {
  const p = providerOf(cfg.provider);
  if (!p.wire) return { models: [], note: 'the program has no models' };
  const base = baseFor(cfg).replace(/\/+$/, '');
  if (!base) return { models: [], note: 'no address to ask' };
  // A service that CANNOT answer without a key is not worth asking FROM HERE
  // without one — but the server may hold one this page has never seen:
  // ANTHROPIC_API_KEY in the environment it was started in, which is the right
  // place to keep a key and the one place the game cannot lose it. So ask it.
  // (A service that merely takes a key if you have one — Ollama on this
  // machine — is asked normally: `maybe` is not the same as `true` here.)
  if (p.key === true && !cfg.key) {
    const got = await (ask ? ask(cfg).catch(() => null) : null);
    return got?.models?.length ? { models: got.models, note: '' }
      : { models: p.models, note: 'no key yet' };
  }

  const headers = { 'content-type': 'application/json' };
  if (p.wire === 'anthropic') {
    headers['x-api-key'] = cfg.key;
    headers['anthropic-version'] = '2023-06-01';
    // The browser is a browser: without this the request is blocked before it
    // is sent, and the button looks broken rather than unauthorised.
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  } else if (cfg.key) {
    headers.authorization = `Bearer ${cfg.key}`;
  }

  // Anthropic answers {data:[{id}]}, OpenAI answers {data:[{id}]}, Ollama
  // answers {data:[{id}]} on its /v1 shim and {models:[{name}]} on its own.
  const idsIn = (body) => {
    const out = [];
    for (const m of (body.data ?? body.models ?? [])) {
      const id = m.id ?? m.name ?? m.model;
      if (typeof id === 'string') out.push(id);
    }
    return out;
  };

  // WHERE TO ASK. One url for a hosted service, and up to three for a local
  // one, because Ollama has two of its own and people type the address without
  // the shim on the end of it — which is exactly what its own page tells you
  // the address is. A 404 that teaches nothing is worse than a second request.
  const tries = p.wire === 'anthropic' ? [`${base}/v1/models?limit=1000`]
    : base.endsWith('/v1') ? [`${base}/models`, `${base.slice(0, -3)}/api/tags`]
      : [`${base}/models`, `${base}/v1/models`, `${base}/api/tags`];

  // What the SERVER found, when this browser could not look for itself.
  // Ollama refuses a page served from anywhere but the machine it is on, so a
  // player on a laptop playing a world hosted on the desktop that runs the
  // model has no way through from here at all. The server is on that machine
  // and has no origin to be judged on — see `chiefmodels` in server.py.
  const overThere = async (why) => {
    if (!ask) return { models: p.models, note: why };
    const got = await ask(cfg).catch(() => null);
    if (got?.models?.length) return { models: got.models, note: '' };
    return { models: p.models, note: got?.note || why };
  };

  let why = 'nothing listed';
  for (const first of tries) {
    // Anthropic pages its answer and the page is TWENTY unless you ask for
    // more, so a service with thirty models hands back twenty and looks like
    // the whole shelf. Follow `has_more` until it stops, because "all of them"
    // is the only useful answer here.
    const out = [];
    let url = first;
    for (let page = 0; page < 10 && url; page++) {
      let res;
      try {
        res = await fetch(url, { headers });
      } catch {
        // A refused fetch from a browser is nearly always CORS or a service
        // that is not running, and both look identical from here. It is also
        // the one case the server can answer when we cannot.
        return overThere('could not reach it — is it running, and does it '
          + 'allow this page?');
      }
      if (!res.ok) {
        if (out.length) break;                 // a part answer beats none
        why = `${res.status} ${res.statusText}`;
        break;
      }
      const body = await res.json().catch(() => null);
      if (!body) break;
      out.push(...idsIn(body));
      url = (body.has_more && body.last_id)
        ? `${base}/v1/models?limit=1000&after_id=${encodeURIComponent(body.last_id)}`
        : null;
    }
    // NOT sorted. Anthropic hands them back newest first and that is the order
    // a player wants to read; alphabetical puts haiku above opus and buries
    // the model you were looking for under the year it was released.
    if (out.length) return { models: [...new Set(out)], note: '' };
  }
  // Reached it and it said nothing useful. The key may still be wrong, or the
  // shim may not be there — either way the server is worth one ask.
  return overThere(why);
}

// --- asking the machine that served this page --------------------------------
//
// Both of these are the card asking the server to do something a browser
// cannot: reach a service that refuses pages served from anywhere but its own
// machine, and CALL a model to find out whether it answers at all. Plain HTTP
// on the same origin as the game, which means they work from the menu, before
// a world exists — which is when somebody who has just pasted a key is
// standing there wanting to know whether it was the right one.
//
// A server too old to know these routes answers 404, and both say so plainly
// rather than looking like a service that is down.
const post = async (route, body) => {
  const res = await fetch(route, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
};

// "Go and list that service's models." Used when this browser could not.
export async function serverModels(cfg) {
  return post('/chief-models', {
    wire: providerOf(cfg.provider).wire,
    base: baseFor(cfg),
    key: cfg.key,
  });
}

// "Go and ASK it something, and tell me what happened."
//
// The answer is not the reply to this request: a model on your own machine
// takes minutes, and an HTTP request held open that long is one something in
// between will cut. So the server starts the call and this watches
// `/chief-state` until the mark on it moves. `onWait` is called with the
// seconds gone by, so the card can count rather than show three dots.
export async function testChief(cfg, onWait = null) {
  let started;
  try {
    started = await post('/chief-test', { ...cfg, ...wireOf(cfg) });
  } catch {
    return { ok: false, note: 'this server cannot be asked — it is older '
      + 'than this card, or it is not PlanetCraft’s own' };
  }
  if (!started.asking) return { ok: null, note: started.note || 'nothing to ask' };
  const t0 = Date.now();
  const until = t0 + (waitFor(cfg) + 60) * 1000;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 2000));
    let st = null;
    try { st = await (await fetch('/chief-state')).json(); } catch { /* again */ }
    if (st && st.at && st.at !== started.at) return st;
    onWait?.(Math.round((Date.now() - t0) / 1000), started.who);
  }
  return { ok: false, note: 'it did not answer in time' };
}

// What the server needs to reach a service, out of what the card holds.
export const wireOf = (cfg) => ({
  provider: cfg.provider,
  wire: providerOf(cfg.provider).wire,
  base: baseFor(cfg),
  key: cfg.key,
  model: cfg.model,
  effort: cfg.effort,
  wait: waitFor(cfg),
});

// What each service last said it could run, for as long as the page is open.
// The card rebuilds itself whenever anything on it moves — press `high` and it
// is built again — and without this the fifty models you just fetched would go
// back to the four names baked into the file above.
const found = new Map();

// --- the game's own AI ------------------------------------------------------
//
// The panel Publish or Perish calls its 🧠 window, on the card it belongs on.
// Everything it shows is the server's word (/api/ai/status in server.py,
// local_ai.status): is the engine running, where it came from, which model
// runs the musters and which writes the night's dispatch, what is coming
// down the wire. Every button is one request and the panel redraws from
// whatever came back — nothing on it is remembered by the browser except
// which provider is chosen, because which model a machine runs is a fact
// about that machine and belongs in ~/.planetcraft/ai.json beside it.

const ai = async (route, body = null) => {
  try {
    const res = body
      ? await fetch(route, { method: 'POST', headers:
        { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch(route);
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } catch {
    return { error: 'this server cannot be asked — it is older than the '
      + 'card, or it is not PlanetCraft’s own', unreachable: true };
  }
};
export const aiStatus = () => ai('/api/ai/status');

const mb = (n) => `${Math.round((n || 0) / 2 ** 20)} MB`;

function builtinPanel(box, { el, row, note }, cfg, push) {
  const host = el('div', 'aipanel');
  box.appendChild(host);
  let st = null, msg = '', pollT = 0, testing = false;

  const draw = () => {
    host.textContent = '';
    if (!st) { host.appendChild(el('div', 'cnote', 'asking the engine…')); return; }
    const line = (label, text, cls = '') => {
      const r = el('div', 'crow');
      r.appendChild(el('span', null, label));
      r.appendChild(el('span', 'cstat ' + cls, text));
      host.appendChild(r);
      return r;
    };
    if (st.unreachable) { line('the AI', st.error, 'bad'); return; }
    line('the engine', st.version
      ? `Ollama ${st.version} — ${st.engine_where || 'running'}`
        + (st.ours ? ', started by the game' : '')
      : (st.engine ? 'not running' : 'not on this machine yet'),
    st.version ? 'good' : 'bad');
    line('running the villages', st.available
      ? `${st.model} — ready` : `${st.model} — ${st.reason}`,
    st.available ? 'good' : '');
    if (st.night_model && st.night_model !== st.model) {
      line('writing the night', st.night_model);
    }

    // anything downloading, with a bar
    const job = st.pack?.stage && !st.pack.done ? st.pack
      : st.pull?.model && !st.pull.done ? { note: `downloading ${st.pull.model}`,
        got: st.pull.completed, total: st.pull.total } : null;
    if (job) {
      const r = line('downloading', job.note || job.stage || '…');
      if (job.total) {
        const bar = el('div', 'aibar');
        const fill = el('div');
        fill.style.width = `${Math.round(100 * job.got / job.total)}%`;
        bar.appendChild(fill);
        r.appendChild(bar);
        r.appendChild(el('span', 'cstat', `${mb(job.got)} of ${mb(job.total)}`));
      }
    }
    const err = msg || (st.pack?.done && st.pack.error) || (st.pull?.done && st.pull.error);
    if (err) line('', err, 'bad');

    // the one button most players ever need
    const acts = el('div', 'crow');
    acts.appendChild(el('span', null, ''));
    if (!st.available && !job) {
      const b = el('button', 'cbtn', st.version ? `download ${st.model}`
        : 'install the AI');
      b.title = 'the engine (about 70 MB) if there is none, then the model '
        + '(Granite 4.2 3B is 2.2 GB) — once, and the game plays meanwhile';
      b.addEventListener('click', () => act('/api/ai/pack', { which: 'recommended' }));
      acts.appendChild(b);
    }
    if (st.engine && !st.version) {
      const b = el('button', 'cbtn', 'start the engine');
      b.addEventListener('click', () => act('/api/ai/start', {}));
      acts.appendChild(b);
    }
    if (st.available) {
      // the model running the villages, timed in place
      acts.appendChild(timer(st.model));
      const t = timed(st.model);
      if (t) acts.appendChild(t);
    }
    if (acts.childNodes.length > 1) host.appendChild(acts);

    // the shelf of models
    const list = el('div', 'ailist');
    for (const m of st.suggested ?? []) {
      const r = el('div', 'aimodel' + (m.fits ? '' : ' big'));
      const head = el('div');
      head.appendChild(el('b', null, m.tag));
      head.appendChild(el('span', 'cstat', ` ${m.gb} GB · ${m.maker}`
        + (m.fits ? '' : ` · wants ${m.ram} GB of memory`)));
      r.appendChild(head);
      r.appendChild(el('div', 'cnote', m.note));
      const bs = el('div');
      const inUse = st.model === m.tag || st.model === `${m.tag}:latest`;
      const night = st.night_choice && st.night_model === m.tag;
      if (m.installed) {
        const day = el('button', 'vopt' + (inUse ? ' sel' : ''), 'run the villages');
        day.addEventListener('click', () => act('/api/ai/config', { model: m.tag }));
        bs.appendChild(day);
        const nt = el('button', 'vopt' + (night ? ' sel' : ''), 'write the night');
        nt.title = 'the dispatch the almanac prints every dawn — a bigger '
          + 'model writes it better and nobody waits for it';
        nt.addEventListener('click', () => act('/api/ai/config',
          { night_model: night ? '' : m.tag }));
        bs.appendChild(nt);
        bs.appendChild(timer(m.tag));
        if (!inUse && !night) {
          const rm = el('button', 'cbtn', 'remove');
          rm.title = `free its ${m.gb} GB`;
          rm.addEventListener('click', () => act('/api/ai/remove', { model: m.tag }));
          bs.appendChild(rm);
        }
        const t = timed(m.tag);
        if (t) bs.appendChild(t);
      } else if (st.version) {
        const dl = el('button', 'cbtn', 'download');
        dl.disabled = !!job;
        dl.addEventListener('click', () => act('/api/ai/pull', { model: m.tag }));
        bs.appendChild(dl);
      }
      r.appendChild(bs);
      list.appendChild(r);
    }
    // ...everything else on this engine, pulled by name or put there by
    // another program: run it, write the night with it, or take it off
    for (const m of st.others ?? []) {
      const r = el('div', 'aimodel');
      const head = el('div');
      head.appendChild(el('b', null, m.tag));
      head.appendChild(el('span', 'cstat', ` ${m.gb} GB`
        + [m.family, m.params, m.quant].filter(Boolean).map((x) => ` · ${x}`).join('')
        + ' · installed by name'));
      r.appendChild(head);
      const bs = el('div');
      const inUse = st.model === m.tag;
      const night = st.night_choice && st.night_model === m.tag;
      const day = el('button', 'vopt' + (inUse ? ' sel' : ''), 'run the villages');
      day.addEventListener('click', () => act('/api/ai/config', { model: m.tag }));
      const nt = el('button', 'vopt' + (night ? ' sel' : ''), 'write the night');
      nt.addEventListener('click', () => act('/api/ai/config',
        { night_model: night ? '' : m.tag }));
      bs.append(day, nt, timer(m.tag));
      if (!inUse && !night) {
        const rm = el('button', 'cbtn', 'remove');
        rm.addEventListener('click', () => act('/api/ai/remove', { model: m.tag }));
        bs.appendChild(rm);
      }
      const t = timed(m.tag);
      if (t) bs.appendChild(t);
      r.appendChild(bs);
      list.appendChild(r);
    }
    host.appendChild(list);

    // ANY MODEL BY NAME. The shelf above is advice, not a fence: whatever
    // Ollama can pull — ollama.com/library, or a GGUF on Hugging Face as
    // hf.co/user/repo:quant — can be downloaded here and set to run the
    // villages. A model that is no good at JSON will say so the first time
    // it is timed on a muster.
    if (st.version) {
      const r = el('div', 'crow');
      r.appendChild(el('span', null, 'another model'));
      const name = el('input');
      name.placeholder = 'e.g. llama3.2:3b, mistral, hf.co/user/model:Q4_K_M';
      const go = el('button', 'cbtn', 'download');
      go.disabled = !!job;
      const pull = () => {
        const tag = name.value.trim();
        if (tag) act('/api/ai/pull', { model: tag });
      };
      go.addEventListener('click', pull);
      name.addEventListener('keydown', (e) => {
        e.stopPropagation();          // typing a name must not walk you about
        if (e.key === 'Enter') pull();
      });
      r.append(name, go);
      host.appendChild(r);
      host.appendChild(el('div', 'cnote', 'any name from ollama.com/library, '
        + 'or a GGUF on Hugging Face as hf.co/user/repo:quant. Once it is '
        + 'down, “time it” says whether it can run a village.'));
    }
    host.appendChild(el('div', 'cnote', `this machine has ${st.ram_gb || '?'} GB `
      + 'of memory. ' + (st.carried
      ? 'The game carries its own engine and Granite came inside it; the '
        + 'engine keeps its models in a folder of its own, so nothing else '
        + 'on this machine is touched.'
      : 'Models are kept where Ollama keeps them, so a machine that already '
        + 'has one — or has Publish or Perish — downloads nothing twice.')));
  };

  // time any installed model on three musters, without switching to it
  const timer = (tag) => {
    const b = el('button', 'cbtn', testing === tag ? 'timing…' : 'time it');
    b.disabled = !!testing;
    b.title = 'three real musters: how long each takes, and whether the '
      + 'orders went to people who are actually in the village';
    b.addEventListener('click', async () => {
      testing = tag; msg = ''; draw();
      const r = await ai('/api/ai/test', { model: tag });
      testing = false;
      if (r.error) msg = `${tag}: ${r.error}`;
      else (st.times ??= {})[tag] = r;
      draw();
    });
    return b;
  };
  const timed = (tag) => {
    const t = st.times?.[tag];
    if (!t) return null;
    return el('span', 'cstat ' + (t.valid === t.n ? 'good' : 'bad'),
      `${t.secs}s a muster, ${t.valid} of ${t.n} sound`
      + (t.why ? ` — ${t.why}` : ''));
  };

  const act = async (route, body) => {
    msg = '';
    const r = await ai(route, body);
    if (r.error) msg = r.error;
    if (!r.unreachable && r.suggested) st = { ...r, timed: st?.timed, times: st?.times };
    draw();
    poll();
  };

  // poll while the card is on screen: quickly while something is moving
  const poll = () => {
    clearTimeout(pollT);
    pollT = setTimeout(async () => {
      if (!host.isConnected) return;
      const r = await aiStatus();
      st = { ...r, timed: st?.timed, times: st?.times };
      draw();
      poll();
    }, (st?.pack?.stage && !st.pack.done) || (st?.pull?.model && !st.pull.done)
      || st?.wake?.state === 'starting' ? 1500 : 6000);
  };

  draw();
  aiStatus().then((r) => { st = r; draw(); poll(); });
  // the card's own model field means nothing here: the machine chooses
  if (cfg.model) { cfg.model = ''; push(); }
}

// --- the card ----------------------------------------------------------------

// Build the settings card into `box`. `onChange` is handed the whole config
// every time anything in it moves, so main.js can tell the server.
// `hooks` is the little the card cannot know on its own. Asking a model
// whether it works is NOT in here any more — that is `testChief` above, over
// plain HTTP to the machine that served this page, so it works with no world
// running. What is left is what the rest of the game holds:
//
//   hooks.state()   what the last ask did, or null for "nobody has asked".
//                   The server's word about the chief RUNNING the villages
//                   arrives this way too, and outranks anything on this card
//   hooks.saw(st)   what the card's own test found, so the front screen and
//                   this row cannot disagree about it
//   hooks.built(h)  the card rebuilt itself; here is the new handle
//
// Returns { showState } so an answer arriving seconds later can be dropped
// into the card without rebuilding it under the player's cursor.
export function buildChiefUI(box, cfg, onChange, hooks = null) {
  if (!box) return null;
  box.textContent = '';
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const row = (label) => {
    const r = el('div', 'crow');
    r.appendChild(el('span', null, label));
    box.appendChild(r);
    return r;
  };
  const note = (text) => box.appendChild(el('div', 'cnote', text));

  const p = providerOf(cfg.provider);
  const push = () => { saveCfg(cfg); onChange?.(cfg); };
  // WITH THE HOOKS. Without them the card that came back had no way to ask the
  // server anything — so changing the provider, which is the first thing
  // anybody does here, replaced a working card with one whose "test it" button
  // said "start or join a world first" in the middle of a world. The handle
  // goes back to whoever built us, too, or they are holding a card that is no
  // longer on the screen.
  const rebuild = () => {
    const handle = buildChiefUI(box, cfg, onChange, hooks);
    hooks?.built?.(handle);
    return handle;
  };

  // The last two rows, which every chief that is a model shares.
  const testRow = () => {
    // DOES IT WORK? The one thing the card could not say, and the first thing
    // anybody wants from it. `refresh` above proves the key can LIST models,
    // which is a different question from whether this model will answer in the
    // dialect the game asks in — a model can be on the list and refuse the ask.
    //
    // FROM THE MENU, with no world running. It used to answer "start or join a
    // world first", which is the wrong way round: the moment somebody wants to
    // know whether their key works is the moment they have just pasted it, in
    // the menu, before there is a world at all. The server makes the call either
    // way — see `/chief-test` in server.py — it just does not need a game
    // running to be asked.
    const r6 = row('is it working');
    const tbtn = el('button', 'cbtn', 'test it');
    const tstat = el('span', 'cstat');
    const show = (st) => {
      // ...but not somebody else's answer. The state is one place for the whole
      // game, so switching the card from one service to another used to leave
      // the last one's tick sitting under the new one's name.
      if (st && st.model && cfg.model && st.model !== cfg.model) st = null;
      if (!st || st.ok == null) {
        tstat.className = 'cstat';
        tstat.textContent = st?.note ?? 'nobody has asked yet';
        return;
      }
      tstat.className = 'cstat ' + (st.ok ? 'good' : 'bad');
      tstat.textContent = st.ok
        ? `${st.model ?? 'it'} — ${st.note}${st.ms ? `, ${(st.ms / 1000).toFixed(1)}s` : ''}`
        : `${st.note}. The program is running the villages.`;
    };
    let testing = false;
    tbtn.addEventListener('click', async () => {
      if (testing) return;
      testing = true;
      tbtn.disabled = true;
      tstat.className = 'cstat';
      tstat.textContent = 'asking it…';
      // COUNTING, not three dots. A model on your own machine takes minutes over
      // this, and a card that says nothing for four of them is a card everybody
      // gives up on at thirty seconds — which is precisely what makes a working
      // chief look broken.
      const st = await testChief(cfg, (secs, who) => {
        tstat.textContent = `asking ${who || 'it'}… ${secs}s`;
      });
      show(st);
      hooks?.saw?.(st);
      tbtn.disabled = false;
      testing = false;
    });
    r6.appendChild(tbtn);
    r6.appendChild(tstat);
    show(hooks?.state?.());

    note('a muster is one page in and a dozen lines out, twice an in-game day '
      + 'per village — about every ten real minutes. If anything here is wrong, '
      + 'or the answer is late, the village runs its own program instead and '
      + 'the game plays on.');
    return { showState: show };
  };

  // who
  const r1 = row('runs the village');
  const sel = el('select');
  for (const q of PROVIDERS) {
    const o = el('option', null, q.name);
    o.value = q.id;
    if (q.id === cfg.provider) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => {
    // ITS OWN key, model and address come forward with it — see `recall`.
    // The last service's meant nothing to this one, and wiping them was the
    // half of that which cost people keys.
    recall(cfg, sel.value);
    push();
    rebuild();
  });
  r1.appendChild(sel);
  note(p.blurb);

  // HOW SHARP THE PROGRAM PLAYS. One steward runs every settlement on the
  // planet, so this dial is really the difficulty of your rivals: on easy the
  // other chiefs never mine, never send envoys and eat their own forests; on
  // hard they build ahead of the bed cap, put more hands on a rising house,
  // and read what went wrong yesterday instead of ordering it again. It stays
  // visible with a model chosen too, because the program is what answers for
  // every village the model does not.
  const rl = row('level');
  for (const [name, value, hint] of [
    ['easy', 'easy', 'slow neighbours: no mine, no envoys, no replanting'],
    ['medium', 'medium', 'the standing steward — the measured baseline'],
    ['hard', 'hard', 'rivals that correct: build ahead, redirect failed work, '
      + 'keep people near the lamps after dark'],
  ]) {
    const b = el('button', 'vopt' + ((cfg.level ?? 'medium') === value ? ' sel' : ''), name);
    b.title = hint;
    b.addEventListener('click', () => { cfg.level = value; push(); rebuild(); });
    rl.appendChild(b);
  }

  if (p.builtin) {
    builtinPanel(box, { el, row, note }, cfg, push);
    return testRow();
  }

  if (!p.wire) {
    note('nothing else to fill in. The program wants no key and no network, '
      + 'and it is what runs whenever anything else cannot answer.');
    return { showState: () => {} };
  }

  // where
  //
  // FILLED IN, not hinted at. It was a grey placeholder over an empty box,
  // which reads as a question — and "I do not know what to put in the
  // address" is the one thing nobody should ever have to work out here. Every
  // service on this list knows its own address; the box shows it, and typing
  // over it is for the player whose model is somewhere else. Emptying it puts
  // the service's own address back rather than leaving nothing.
  const r2 = row('address');
  const base = el('input');
  base.type = 'url';
  base.placeholder = p.base;
  base.value = cfg.base || p.base;
  base.addEventListener('change', () => {
    const typed = base.value.trim();
    remember(cfg, { base: (typed === p.base) ? '' : typed });
    base.value = cfg.base || p.base;
    push();
  });
  r2.appendChild(base);
  if (p.local) {
    note('this is where ' + p.name + ' answers on the machine it is running '
      + 'on. Leave it as it is unless the model is on another machine, and '
      + 'then put that machine in place of 127.0.0.1.');
  }

  // the key, for the ones that take one — and the ones that MIGHT
  //
  // `maybe` is Ollama and anything else local. A model on this machine wants
  // no key at all; the same service on ollama.com wants one, and so does a box
  // somebody has put a proxy in front of. The address field can be pointed at
  // either, so the key box has to be there for both — empty, and no worse
  // for being empty.
  if (p.key) {
    const r3 = row('key');
    const key = el('input');
    key.type = 'password';
    key.autocomplete = 'off';
    key.placeholder = p.keyHint
      || (p.key === true ? 'sk-…' : 'none needed on this machine');
    key.value = keyFor(cfg);
    key.addEventListener('change', () => {
      remember(cfg, { key: key.value.trim() });
      push();
    });
    r3.appendChild(key);
    // A WAY TO READ IT BACK. A password box of dots cannot tell you whether
    // the key behind it is the right one, or let you copy a key you have
    // since lost the only other copy of — and the thing being hidden is
    // yours, on your own machine, in your own browser. It starts hidden and
    // it is one press either way.
    const eye = el('button', 'cbtn', 'show');
    eye.title = 'show the key, to check it or to copy it';
    eye.addEventListener('click', () => {
      const hidden = key.type === 'password';
      key.type = hidden ? 'text' : 'password';
      eye.textContent = hidden ? 'hide' : 'show';
    });
    r3.appendChild(eye);
    note(p.key === true
      ? 'kept in this browser, one per service — picking another service '
        + 'above does not touch this one — and sent to the game server you '
        + 'are already playing on. It is never written into the world or the '
        + 'save. You may also leave it empty and set ANTHROPIC_API_KEY where '
        + 'the server runs, which is the one place the game cannot lose it.'
      : 'leave it empty. A model on this machine does not ask who you are — '
        + 'this box is here for a box on the network that does. Anything you '
        + 'do put in is kept in this browser, one per service, and sent to '
        + 'your own game server; it is never written into the world or the '
        + 'save.');
  }

  // which model, and the button that goes and asks
  //
  // A LIST, not a text box with a datalist hung off it. That was the first
  // shape and it is a trap: a browser filters a datalist by whatever is
  // already typed, so the moment the box said `claude-opus-5` the only thing
  // it would offer was claude-opus-5 — the other forty were fetched, held, and
  // never shown. A select shows what it holds, always, whatever is chosen.
  const r4 = row('model');
  const sel2 = el('select');
  const custom = el('input');
  custom.placeholder = 'name one yourself';
  custom.style.display = 'none';

  const OTHER = ' other';
  const fill = (models) => {
    sel2.textContent = '';
    // Whatever is chosen stays on the list even if the service never mentioned
    // it — a model you typed by hand, or one retired since you picked it.
    const all = [...new Set([...(cfg.model ? [cfg.model] : []), ...models])];
    if (!all.length) {
      const o = el('option', null, 'nothing yet — press refresh');
      o.value = '';
      sel2.appendChild(o);
    }
    for (const m of all) {
      const o = el('option', null, m);
      o.value = m;
      if (m === cfg.model) o.selected = true;
      sel2.appendChild(o);
    }
    const o = el('option', null, 'name one yourself…');
    o.value = OTHER;
    sel2.appendChild(o);
  };
  fill(found.get(p.id) ?? p.models);

  sel2.addEventListener('change', () => {
    if (sel2.value === OTHER) {
      custom.style.display = '';
      custom.value = cfg.model;
      custom.focus();
      return;
    }
    custom.style.display = 'none';
    remember(cfg, { model: sel2.value });
    push();
  });
  custom.addEventListener('change', () => {
    remember(cfg, { model: custom.value.trim() });
    fill(found.get(p.id) ?? p.models);
    custom.style.display = 'none';
    push();
  });
  r4.appendChild(sel2);

  const btn = el('button', 'cbtn', 'refresh');
  const stat = el('span', 'cstat');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    stat.className = 'cstat';
    stat.textContent = 'asking…';
    try {
      const { models, note: why } = await listModels(cfg, serverModels);
      // WHAT WENT WRONG WINS over what is on the list. When nobody could be
      // asked, the answer is the handful of names baked into the file above —
      // and reporting "4 to choose from" over the top of `no key yet` is the
      // card telling you it worked when it did not.
      if (!why && models.length) found.set(p.id, models);
      fill(models.length ? models : (found.get(p.id) ?? p.models));
      stat.className = 'cstat' + (why ? ' bad' : ' good');
      stat.textContent = why
        || (models.length ? `${models.length} to choose from` : 'nothing listed');
      if (!why && models.length && !cfg.model) {
        remember(cfg, { model: models.find((m) => m.includes('opus')) ?? models[0] });
        fill(models);
        push();
      }
    } catch (e) {
      // A refused fetch from a browser is nearly always CORS or a service that
      // is not running, and both look identical from here. Say the true thing.
      stat.className = 'cstat bad';
      stat.textContent = 'could not reach it — is it running, and does it '
        + 'allow this page?';
    }
    btn.disabled = false;
  });
  r4.appendChild(btn);
  r4.appendChild(stat);
  r4.appendChild(custom);

  // how hard it should think
  const r5 = row('effort');
  for (const [name, value, hint] of [
    ['low', 'low', 'an ordinary muster wants no deliberation'],
    ['high', 'high', 'for pacts, raids and prices that stand all day'],
    ['max', 'max', 'slowest and dearest'],
  ]) {
    const b = el('button', 'vopt' + (cfg.effort === value ? ' sel' : ''), name);
    b.title = hint;
    b.addEventListener('click', () => { cfg.effort = value; push(); rebuild(); });
    r5.appendChild(b);
  }
  // ...and it is an Anthropic dial. Nothing on the chat-completions wire has
  // an effort to set, so a card that offered one there and said nothing was
  // offering a knob attached to nothing.
  if (p.wire !== 'anthropic') {
    note('the setting is a Claude one — this service has no effort dial, '
      + 'and it is left here for when you point the card back at one.');
  }

  // HOW LONG TO WAIT, and only for a model on your own machine.
  //
  // A hosted service answers a muster in seconds and there is nothing here to
  // decide. A 7B on your own CPU took over three minutes over the same page,
  // every time — so with the hosted bound in force it was cut off before a
  // token came back and the card said it was not answering, which was true and
  // useless. This is the number both ends give it: the server bounds its call
  // with it, and the talk card waits it out before it gives up.
  if (p.local) {
    const rw = row('patience');
    const now = String(waitFor(cfg));
    for (const [name, value, hint] of [
      ['a minute', '60', 'a small model on a fast machine'],
      ['five', '300', 'a 7B with a graphics card behind it'],
      ['ten', '600', 'measured: a 7B on an ordinary CPU took 292 seconds'],
      ['a quarter hour', '900', 'something big, or a machine with no GPU'],
    ]) {
      const b = el('button', 'vopt' + (now === value ? ' sel' : ''), name);
      b.title = hint;
      b.addEventListener('click', () => { cfg.wait = value; push(); rebuild(); });
      rw.appendChild(b);
    }
    note('a muster is ten real minutes apart, so a chief may take minutes over '
      + 'one and cost nothing — the village works to the orders the program '
      + 'already gave until the answer lands. It is a conversation that feels it.');
  }

  return testRow();
}
