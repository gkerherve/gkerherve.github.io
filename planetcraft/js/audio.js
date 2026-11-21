// audio.js — every sound in the game, synthesised at runtime.
//
// There are no audio assets and there will not be any: the world is procedural
// pixel art, so the soundtrack is procedural too — oscillators, one shared
// noise buffer, filters, and a piano made from nothing at start-up
// (piano.js), in a worker, in about a fifth of a second.
//
// Three rules shape the design:
//
// 1. Browsers will not start an AudioContext without a user gesture, so
//    nothing is created until unlock() is called from a click or a keypress.
//    Every entry point is a no-op before that, so main.js can call play()
//    freely from the first frame.
// 2. The music has to MEAN something. It used to be made up a beat at a time
//    — a melody random-walking a pentatonic scale over a chord that also
//    wandered — and however carefully a walk is weighted it is not a tune:
//    nothing came back, no phrase asked a question or answered one, and the
//    player's verdict was "no meaning whatsoever". So the pieces are now
//    COMPOSED (music.js) and only the performance is generated — the key,
//    the tempo and its rubato, how the left hand breaks the chords, what a
//    repeat does differently. A piece plays; the world is left to its own
//    sounds for half a minute or so; another begins. That is also what lets
//    it survive twenty minutes, which a loop never does.
// 3. It has to be worth listening to, which is a question about timbre rather
//    than about notes. The rule that earns its keep everywhere below: a real
//    sound does not hold still. Its high partials die before its low ones
//    (PARTIALS, and the piano's own), its pitch drifts a few cents per note,
//    its level varies stroke to stroke, and its reflections never arrive in
//    step. Skip those and you get something that is technically the right
//    note and unmistakably a synthesiser — which is what "strange" usually
//    means when a generated soundtrack is described that way.
//
// Cost: the pad is five oscillators that are started once and never stopped
// — chords are frequency glides, not new voices. The piano is twenty samples
// (about seven megabytes, shared by every context that plays them) and one
// buffer source per note. The music has a hall of its own, a convolver; the
// effects keep the three cross-coupled delay lines, which are a fraction of
// the CPU and, unlike the single delay they replaced, do not repeat in time
// with themselves.

import { PIECES, perform } from './music.js';
import { PIANO_SR, pianoKeys, pianoKeyFor, renderPianoNote } from './piano.js';

const LOOKAHEAD = 0.5;          // seconds of music scheduled ahead of the clock
const MAX_VOICES = 32;          // hard cap on concurrent short-lived effect voices
const PIANO_VOICES = 72;        // ...and on piano notes, which ring for seconds
// The silence between two pieces, in seconds. The world has sounds of its own
// — birds, water, footsteps, rain — and a soundtrack that never stops is one
// you stop hearing. Night leaves longer gaps. `first` is the wait after the
// game first makes a sound, `back` after the music has been off (orbit).
const GAP = { day: [18, 45], night: [26, 60], first: 1.6, back: 3 };
// The first piece of a session is one of these: the ones that say, in their
// first two bars, that this is a friendly place.
const WELCOME = { day: ['first-light', 'hearth', 'meadow-waltz'], night: ['lanterns', 'snowfall'] };
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

// The melody instrument, as [frequency ratio, level, how long it rings].
//
// This table is the whole difference between an instrument and a ding, and
// the important column is the last one. On a real struck string the high
// partials die away in a fraction of the time the fundamental takes, so the
// note is bright at the instant it is hit and mellows to a pure tone as it
// rings — that decay is what the ear identifies as "struck". Hold every
// partial for the same length and you get an organ; hold one alone and you
// get a test tone. The old voice was a sine plus one loud partial held at a
// fixed inharmonic ratio, which is why it read as electronic whatever notes
// it played.
//
// The ratios are stretched very slightly sharp, the way a real string's are
// (stiffness makes each partial a little higher than a whole multiple). It
// is far too small an offset to hear as tuning, and it is what stops the
// partials fusing into one flat buzz.
// The even partials (2, 4) are louder than the odd ones (3, 5), which is what
// makes this warm rather than hollow — strong odd harmonics are the clarinet
// end of the scale, and a woody honk is not what anyone wants to hear for
// twenty minutes.
//
// Measured, rendering one note offline and tracking its brightness relative
// to a pure sine at the same pitch: this voice starts at 1.30x and settles
// through 1.11x and 1.03x to 1.00x over about a second. The voice it replaced
// measured 1.02x at its brightest — which is to say it was a sine wave, all
// the way down, and no arrangement of notes was ever going to fix that.
const PARTIALS = [
  [1.000, 1.00, 1.00],
  [2.002, 0.55, 0.42],
  [3.006, 0.18, 0.24],
  [4.013, 0.12, 0.14],
  [5.025, 0.04, 0.08],
];

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const pick = (a) => a[(Math.random() * a.length) | 0];
const rnd = (a, b) => a + Math.random() * (b - a);

// how a footstep sounds per block underfoot: [filter, freq, Q, dur, gain]
const STEP_MATERIALS = {
  grass: { type: 'bandpass', f: 1500, q: 0.9, dur: 0.09, gain: 0.30 },
  dirt: { type: 'lowpass', f: 900, q: 1.0, dur: 0.09, gain: 0.34 },
  sand: { type: 'highpass', f: 2200, q: 0.7, dur: 0.13, gain: 0.26 },
  stone: { type: 'bandpass', f: 2600, q: 2.6, dur: 0.05, gain: 0.30, thud: 150 },
  wood: { type: 'bandpass', f: 900, q: 4.5, dur: 0.07, gain: 0.34, thud: 190 },
  snow: { type: 'highpass', f: 3200, q: 0.8, dur: 0.11, gain: 0.22 },
  leaf: { type: 'highpass', f: 3800, q: 0.6, dur: 0.10, gain: 0.20 },
  water: { type: 'bandpass', f: 700, q: 1.2, dur: 0.26, gain: 0.34 },
  metal: { type: 'bandpass', f: 3400, q: 8, dur: 0.06, gain: 0.24, thud: 260 },
};

// gunshots differ mostly in body and length, not in kind
const GUNS = {
  pistol: { crack: 0.55, body: 0.20, dur: 0.16, lp: 4200, boom: 190 },
  rifle: { crack: 0.70, body: 0.16, dur: 0.13, lp: 6000, boom: 240 },
  shotgun: { crack: 0.85, body: 0.34, dur: 0.30, lp: 3000, boom: 120 },
  // the launch, not the landing — the landing is explosion() below
  bazooka: { crack: 0.5, body: 0.5, dur: 0.42, lp: 1800, boom: 80 },
  launcher: { crack: 0.45, body: 0.4, dur: 0.34, lp: 2200, boom: 95 },
};

// minimum seconds between two plays of the same sound, so a held trigger or a
// run across gravel cannot spawn a hundred voices a second
const THROTTLE = {
  footstep: 0.14, impact: 0.03, entityHurt: 0.06, zombieHurt: 0.06,
  water: 0.25, bird: 0.4, horn: 0.5, bark: 0.35, swing: 0.12,
  // A call to prayer is not a footstep: it comes twice a day and it is long,
  // so the throttle is what stops two villages within earshot ringing over
  // each other into one clang.
  bell: 1.2, adhan: 6,
};

// The piano's samples, rendered once a page (piano.js) and shared by every
// context that plays them — the game's own and a preview's. An AudioBuffer is
// not tied to the context that made it, so one copy serves both.
const PIANO = { bufs: new Map(), started: false, ready: false, waiting: [] };

function pianoBuffer(ctx, data, sr) {
  let buf = null;
  try {
    buf = new AudioBuffer({ length: data.length, numberOfChannels: 1, sampleRate: sr });
  } catch {
    buf = ctx.createBuffer(1, data.length, sr);
  }
  buf.getChannelData(0).set(data);
  return buf;
}

// Render the piano, in a worker where there is one. Twenty notes of additive
// synthesis is about a fifth of a second of arithmetic, and on the page that
// is a fifth of a second the game does not draw; in a worker it is nobody's
// frame. Without one (an old engine, a page opened from a file) the notes
// are made on the page one at a time, a few frames apart.
function loadPiano(ctx) {
  if (PIANO.started) return;
  PIANO.started = true;
  const keys = pianoKeys();
  const take = (m, data, sr) => {
    if (PIANO.bufs.has(m) || !data?.length) return;
    PIANO.bufs.set(m, pianoBuffer(ctx, data, sr));
    if (PIANO.bufs.size === keys.length && !PIANO.ready) {
      PIANO.ready = true;
      for (const f of PIANO.waiting.splice(0)) f();
    }
  };
  let fell = false;
  const onPage = () => {
    if (fell) return;
    fell = true;
    const left = keys.filter((k) => !PIANO.bufs.has(k));
    const step = () => {
      const m = left.shift();
      if (m == null) return;
      take(m, renderPianoNote(m, PIANO_SR), PIANO_SR);
      setTimeout(step, 60);
    };
    step();
  };
  try {
    const w = new Worker(new URL('./pianoworker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => {
      const d = e.data ?? {};
      if (d.done) { w.terminate(); if (!PIANO.ready) onPage(); return; }
      take(d.m, d.data, d.sr);
    };
    w.onerror = () => { w.terminate(); onPage(); };
    w.postMessage({ keys, sr: PIANO_SR });
  } catch {
    onPage();
  }
}

const pianoReady = () => (PIANO.ready ? Promise.resolve()
  : new Promise((res) => PIANO.waiting.push(res)));

// A rendered preview as a 16-bit WAV, so a piece can be listened to outside
// the game — and checked by a machine that cannot listen at all.
function wavOf(buf) {
  const ch = buf.numberOfChannels;
  const n = buf.length;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o, t) => { for (let i = 0; i < t.length; i++) out.setUint8(o + i, t.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE');
  w(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true);
  out.setUint16(22, ch, true); out.setUint32(24, buf.sampleRate, true);
  out.setUint32(28, buf.sampleRate * ch * 2, true); out.setUint16(32, ch * 2, true);
  out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * ch * 2, true);
  const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]));
      out.setInt16(o, v < 0 ? v * 32768 : v * 32767, true);
      o += 2;
    }
  }
  return new Blob([out.buffer], { type: 'audio/wav' });
}

export class GameAudio {
  constructor(opts = {}) {
    this.ctx = null;
    this.musicVol = opts.musicVolume ?? 0.5;
    this.sfxVol = opts.sfxVolume ?? 0.8;
    this.daylight = 1;
    this.enabled = opts.enabled ?? true;
    this.rainLevel = 0;                  // set by setRain, applied on unlock
    this.musicOn = true;                 // walking the planet; orbit is quiet
    this._voices = 0;
    this._last = Object.create(null);
    this._envTimer = 0;
    this.m = null;                       // music state, built on unlock
  }

  get ready() { return !!this.ctx && this.ctx.state === 'running'; }

  // --- setup -------------------------------------------------------------

  // Safe to call on every click: it creates the graph once and thereafter
  // only nudges a suspended context back to life (which browsers also demand
  // a gesture for, after a tab switch).
  unlock() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') this.ctx.resume?.();
      return this.ready;
    }
    const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AC) return false;
    this._attach(new AC());
    // a storm that started before the first click still has its level waiting
    if (this.rainLevel > 0) this.setRain(this.rainLevel);
    return this.ready;
  }

  // The whole graph, on `ctx`: the game's own context, or an offline one that
  // renders a preview (see renderPreview) and is never heard live. Offline,
  // nothing is scheduled by the clock and no voice budget applies — the whole
  // piece is laid down at once and rendered faster than real time.
  _attach(ctx, { offline = false } = {}) {
    this.ctx = ctx;
    this._offline = offline;
    this._pv = 0;

    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 1 : 0;
    this.master.connect(ctx.destination);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVol;
    this.musicBus.connect(this.master);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxVol;
    this.sfxBus.connect(this.master);

    this._buildSpace();
    this._buildNoise();
    this._buildMusic();
    this._buildPad();
    if (!offline) {
      loadPiano(ctx);
      this._startMusic();
    }
  }

  // --- rain ----------------------------------------------------------------
  //
  // Rain is the one sound in the game that never stops, so it is not an effect
  // at all: one looping noise source, built once and left running, with a gain
  // the world fades in and out. Retriggering a shower every few hundred
  // milliseconds would cost a voice each time and still comb-filter audibly at
  // the seams.
  //
  // Two bands, because rain is two sounds: the hiss of it falling and the
  // patter of it landing, and either one alone reads as static.
  _buildRain() {
    const ctx = this.ctx;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0.0001;
    this.rainGain.connect(this.sfxBus);
    const send = ctx.createGain();
    send.gain.value = 0.25;
    this.rainGain.connect(send);
    send.connect(this.send);

    this.rainSrc = [];
    for (const [type, f, q, gain] of [['highpass', 2600, 0.6, 0.5],
      ['bandpass', 620, 0.5, 0.85]]) {
      const s = ctx.createBufferSource();
      s.buffer = this.noiseBuf;
      s.loop = true;
      // the two layers run at different rates, so the two-second buffer does
      // not repeat as one recognisable pattern
      s.playbackRate.value = type === 'highpass' ? 1 : 0.73;
      const b = ctx.createBiquadFilter();
      b.type = type; b.frequency.value = f; b.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain;
      s.connect(b); b.connect(g); g.connect(this.rainGain);
      s.start();
      this.rainSrc.push(s);
    }
  }

  /** 0 = dry, 1 = downpour. Safe before unlock(); the level is remembered. */
  setRain(level = 0) {
    this.rainLevel = Math.max(0, level);
    if (!this.ready) return false;
    if (!this.rainGain) {
      if (this.rainLevel <= 0) return false;   // never built on a dry world
      this._buildRain();
    }
    // a couple of seconds to arrive: stepping the gain clicks, and a storm
    // ought to come up under you rather than switch on
    this.rainGain.gain.setTargetAtTime(
      this._rainTarget(), this.ctx.currentTime, 1.2);
    return true;
  }

  // The sense of space. This used to be ONE delay line at 0.34s with heavy
  // feedback, and one tap repeating at a fixed interval is not a room — it is
  // an echo. Every footstep came back at you a third of a second later, in
  // time with itself, and because both buses send here that single tap was
  // colouring every sound in the game.
  //
  // What replaces it is five SHORT taps. Short is the part that matters and
  // the part that is easy to get wrong: a room's character comes from early
  // reflections arriving within about a tenth of a second, densely enough
  // that no single one is audible on its own. Long taps stay audible as
  // separate events however many you use — measured on the tail's crest
  // factor (peak over mean, so higher means peakier), the old single delay
  // scores 61, three long taps still score 22, and these five score 8.
  //
  // Under ~30ms they would ring instead: a short delay fed back is a comb
  // filter, and it sings at 1/delay. 40-133ms is the usable window, and the
  // spacings are irrational-ish so no two reflections ever coincide.
  _buildSpace() {
    const ctx = this.ctx;
    this.send = ctx.createGain();
    this.send.gain.value = 1;

    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 1400;   // darker than the source: distance eats highs
    // a highpass too, so the tail never muddies the low end it sits under
    const cut = ctx.createBiquadFilter();
    cut.type = 'highpass';
    cut.frequency.value = 300;

    const times = [0.0397, 0.0611, 0.0829, 0.1063, 0.1327];
    const taps = times.map((time) => {
      const d = ctx.createDelay(0.5);
      d.delayTime.value = time;
      this.send.connect(d);
      d.connect(damp);
      return d;
    });

    // THE important line. All five taps sum into `damp`, so the gain going
    // round the loop is five times whatever is set here — at face value 0.66
    // the reverb would grow by half again on every pass and reach a billion
    // within a second. (It did; that is how this constant was found.) Divide
    // by the tap count and the loop gain is what it says it is: 0.66, giving
    // a tail that takes about 1.9 seconds to fall away.
    const LOOP_GAIN = 0.66;
    const fb = ctx.createGain();
    fb.gain.value = LOOP_GAIN / taps.length;
    damp.connect(cut);
    cut.connect(fb);
    // cross-coupled: the mix returns to a DIFFERENT tap than it came from, so
    // one hit scatters into more and more reflections the way a room's does
    taps.forEach((d, i) => fb.connect(taps[(i + 1) % taps.length]));

    const wet = ctx.createGain();
    wet.gain.value = 0.32;         // was 0.5 — a wash sits behind, not on top
    cut.connect(wet);
    wet.connect(this.master);
    this.wet = wet;
  }

  // two seconds of white noise, shared by every noise-based effect
  _buildNoise() {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
  }

  // Everything the soundtrack plays goes through ONE gate, and the gate is
  // what music-off closes. It has to be the last thing before the bus: a
  // piano note rings for seconds after it is struck, so stopping the
  // scheduler alone would leave a chord hanging in the air all the way out
  // to orbit. Nothing modulates the gate, so zero here really is zero.
  _buildMusic() {
    const ctx = this.ctx;
    this.musicGate = ctx.createGain();
    this.musicGate.gain.value = this.musicOn ? 1 : 0;
    this.musicGate.connect(this.musicBus);

    // A hall for the music alone. The effects keep the short room above —
    // a footstep in a cathedral is wrong — but a piano played dry sounds
    // like a practice room, and the long soft tail is half of what makes
    // this kind of music sound like somewhere.
    const hall = ctx.createConvolver();
    hall.buffer = this._hallImpulse();
    this.hallSend = ctx.createGain();
    this.hallSend.gain.value = 0.5;
    this.musicGate.connect(this.hallSend);
    // nothing under 180 Hz goes into the hall: a bass note's reverb is the
    // mud a room makes of a piano, not the air round it
    const cut = ctx.createBiquadFilter();
    cut.type = 'highpass';
    cut.frequency.value = 180;
    cut.Q.value = 0.7;
    this.hallSend.connect(cut);
    cut.connect(hall);
    hall.connect(this.musicBus);

    // The piano: a gentle top cut that closes at night, then three buses
    // panned by register, the way a piano sits in front of you — the bass
    // a little left, the treble a little right. Three panners rather than
    // one per note.
    this.pianoTone = ctx.createBiquadFilter();
    this.pianoTone.type = 'lowpass';
    this.pianoTone.frequency.value = 6500;
    this.pianoTone.Q.value = 0.5;
    this.pianoTone.connect(this.musicGate);
    this.pianoPan = [-0.26, 0, 0.26].map((pan) => {
      const g = ctx.createGain();
      if (ctx.createStereoPanner) {
        const sp = ctx.createStereoPanner();
        sp.pan.value = pan;
        g.connect(sp);
        sp.connect(this.pianoTone);
      } else {
        g.connect(this.pianoTone);
      }
      return g;
    });
  }

  // The hall's impulse: two seconds and a half of decaying noise, a
  // different noise in each ear so the tail is wide, with the high end dying
  // twice as fast as the low — which is what air and soft walls do, and why
  // a synthetic reverb without it sounds like a tin can.
  _hallImpulse() {
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const n = Math.floor(sr * 2.6);
    const ir = ctx.createBuffer(2, n, sr);
    const pre = Math.floor(0.02 * sr);
    const kLo = 1 - Math.exp(-2 * Math.PI * 800 / sr);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let lo = 0;
      for (let i = pre; i < n; i++) {
        const t = (i - pre) / sr;
        const w = Math.random() * 2 - 1;
        lo += kLo * (w - lo);
        const hi = w - lo;
        const env = Math.min(1, t / 0.05);
        d[i] = env * (lo * 1.8 * Math.exp(-6.9 * t / 2.4) + hi * 0.5 * Math.exp(-6.9 * t / 1.1));
      }
    }
    return ir;
  }

  // The pad: five oscillators started once and never stopped. A chord change
  // is a glide on their frequencies, which costs nothing and sounds better
  // than retriggering — the harmony moves under you without an attack. A
  // piece says how much pad it wants under it (music.js); most want none by
  // day and some by night.
  _buildPad() {
    const ctx = this.ctx;
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 1500;
    this.padFilter.Q.value = 0.7;

    // The breath rides on this one: lfoB swings it ten per cent either side
    // of one...
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 1;
    this.padFilter.connect(this.padGain);

    // ...and the level a piece asks for rides on this one, which nothing
    // modulates. A connection into an AudioParam is ADDED to its value, so
    // an LFO wired into the only gain a pad has keeps it breathing at the
    // LFO's own depth however far that gain is turned down — which is how
    // the old pad went on sounding in orbit. A piece with no pad is a pad at
    // zero here, and zero here is silence.
    this.padLevel = ctx.createGain();
    this.padLevel.gain.value = 0;
    this.padGain.connect(this.padLevel);
    this.padLevel.connect(this.musicGate);
    this._padLive = false;

    this.padOsc = [];
    // One voice per chord tone, index-matched to the notes music.js hands
    // over: root, fifth, third an octave up, the colour.
    //
    // There is no sawtooth here, and that is the point. A saw is every
    // harmonic at once; two of them detuned is the sound of a cheap synth
    // patch, and under a lowpass it just buzzes. Sines and triangles carry a
    // chord without a timbre of their own, which is what a pad under a piano
    // wants — you should notice the harmony, not the oscillator. The small
    // detunes make the voices beat slowly against each other, and that slow
    // beating is the only thing keeping this alive.
    for (const [type, det, gain] of [['triangle', -5, 0.20],
      ['sine', 4, 0.24], ['sine', -3, 0.20], ['sine', 8, 0.13]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.detune.value = det;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g);
      g.connect(this.padFilter);
      o.start();
      this.padOsc.push(o);
    }
    // Sub, an octave below the root; sine so it never muddies. Quiet, and
    // deliberately so: a sustained tone down here is the sound every film
    // uses to tell you something is wrong.
    this.padSub = ctx.createOscillator();
    this.padSub.type = 'sine';
    const sg = ctx.createGain();
    sg.gain.value = 0.15;
    this.padSub.connect(sg);
    sg.connect(this.padFilter);
    this.padSub.start();

    // Two very slow LFOs — one opens the filter, one breathes the level. A
    // pad should breathe, not pump.
    this.lfoA = this._lfo(0.031, 90, this.padFilter.frequency);
    this.lfoB = this._lfo(0.019, 0.1, this.padGain.gain);
  }

  _lfo(rate, depth, param) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = rate;
    const g = ctx.createGain();
    g.gain.value = depth;
    o.connect(g);
    g.connect(param);
    o.start();
    return o;
  }

  // --- volume ------------------------------------------------------------

  setMusicVolume(v) {
    this.musicVol = clamp(v, 0, 1);
    if (this.musicBus) this._ramp(this.musicBus.gain, this.musicVol, 0.15);
  }

  setSfxVolume(v) {
    this.sfxVol = clamp(v, 0, 1);
    if (this.sfxBus) this._ramp(this.sfxBus.gain, this.sfxVol, 0.05);
  }

  setEnabled(on) {
    this.enabled = !!on;
    if (this.master) this._ramp(this.master.gain, on ? 1 : 0, 0.2);
  }

  _ramp(param, v, t) {
    const now = this.ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(v, now + t);
  }

  suspend() { this.ctx?.suspend?.(); }
  resume() { this.ctx?.resume?.(); }

  // --- the music, on and off ----------------------------------------------
  //
  // Orbit is not a place with a soundtrack: you are looking at the planet
  // rather than standing on it, so main.js turns the music off on the way out
  // of play and back on the way in. Effects are untouched — birds and thunder
  // still belong to the world you are looking at.
  //
  // Off is the gate closing (a fade, because five oscillators and a dozen
  // ringing strings stopping together is a click) and the scheduler
  // stopping, so nothing is queued while nobody is listening. A piece cut
  // off in the middle is not resumed in the middle: coming back, a new one
  // begins a few seconds later, from its first bar.
  setMusicOn(on, fade = 1.2) {
    on = !!on;
    if (on === this.musicOn) return this.musicOn;
    this.musicOn = on;
    this._gateMusic(fade);
    return this.musicOn;
  }

  // Apply `musicOn` to the graph.
  //
  // Split out from the setter because the flag can be set before there is a
  // graph to apply it to, and because this must NOT bail out on `!ready`,
  // which is false whenever the context is SUSPENDED: leaving play while the
  // tab was hidden used to set the flag and touch nothing, so the music came
  // back up on resume with the game insisting it was off. Scheduled values
  // are perfectly legal on a suspended context; they simply take effect when
  // it resumes. So the only thing worth checking is whether the nodes exist.
  _gateMusic(fade = 1.2) {
    if (!this.ctx || !this.musicGate) return;
    const now = this.ctx.currentTime;
    const M = this.m;
    if (this.musicOn) {
      this._ramp(this.musicGate.gain, 1, Math.min(0.4, fade));
      if (M && !M.piece) M.until = now + GAP.back;
    } else {
      this._ramp(this.musicGate.gain, 0, fade);
      if (M) {
        M.piece = null;
        M.until = now + GAP.back;
        this._padTo(null, now, fade);
      }
    }
    // Rain is the other sound in the game that never stops by itself: one
    // looping noise source, built once and left running, with only a gain to
    // control it. From orbit you are not in the world.
    if (this.rainGain) {
      this._ramp(this.rainGain.gain, this._rainTarget(), fade);
    }
  }

  _rainTarget() {
    return this.musicOn ? Math.max(0.0001, this.rainLevel * 0.16) : 0;
  }

  // --- music -------------------------------------------------------------

  _startMusic() {
    this.m = {
      night: this.daylight < 0.3,
      piece: null,          // the performance playing, from music.js
      t0: 0,                // the context time its first downbeat is at
      i: 0, pi: 0,          // the next note, the next pad change
      until: this.ctx.currentTime + GAP.first,   // no piece before this
      bag: { day: [], night: [] },
      last: null,
      played: 0,
    };
    this._envTimer = 0.5;
  }

  // Which piece next: every piece of the mood once, in a shuffled order,
  // before any of them again — and never the one that has just finished.
  _nextPiece(mood) {
    const M = this.m;
    if (M.played === 0) {
      const ids = WELCOME[mood];
      const first = PIECES.find((p) => p.id === ids[(Math.random() * ids.length) | 0]);
      if (first) { M.last = first.id; return first; }
    }
    const bag = M.bag[mood];
    if (!bag.length) {
      const pool = PIECES.filter((p) => p.mood === mood || p.mood === 'any');
      for (let i = pool.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      if (pool.length > 1 && pool[0].id === M.last) pool.push(pool.shift());
      bag.push(...pool);
    }
    const p = bag.shift();
    M.last = p.id;
    return p;
  }

  _beginPiece(t) {
    const M = this.m;
    const mood = M.night ? 'night' : 'day';
    let perf = null;
    for (let tries = 0; tries < 3 && !perf; tries++) {
      // A piece that will not play is skipped, never thrown: this runs in
      // the frame, and audio is a leaf that must never take a frame down.
      try { perf = perform(this._nextPiece(mood)); } catch (err) {
        console.warn('music: a piece would not play', err);
      }
    }
    if (!perf) { M.until = t + 60; return false; }
    M.piece = perf;
    M.t0 = t;
    M.i = 0;
    M.pi = 0;
    M.played++;
    return true;
  }

  // The scheduler: keep the next half second of the piece queued on the
  // audio clock. A stall — a long frame, a hidden tab — is waited out rather
  // than caught up: if the next note is already late, the whole rest of the
  // piece moves later by that much, the way a pianist who lost their place
  // pauses rather than playing the missed bar at double speed.
  _musicTick() {
    const M = this.m;
    if (!M || !PIANO.ready) return;
    const now = this.ctx.currentTime;
    if (!M.piece) {
      if (now < M.until) return;
      if (!this._beginPiece(now + 0.15)) return;
    }
    const P = M.piece;
    const horizon = now + LOOKAHEAD;
    let guard = 400;
    while (M.i < P.events.length && guard-- > 0) {
      const e = P.events[M.i];
      let t = M.t0 + e.t;
      if (t >= horizon) break;
      if (t < now - 0.02) { M.t0 += now + 0.02 - t; t = now + 0.02; }
      this._playEvent(e, t, M.t0);
      M.i++;
    }
    while (M.pi < P.pads.length && M.t0 + P.pads[M.pi].t < horizon) {
      this._padTo(P.pads[M.pi], Math.max(now, M.t0 + P.pads[M.pi].t));
      M.pi++;
    }
    if (M.i >= P.events.length && M.pi >= P.pads.length && now > M.t0 + P.length) {
      M.piece = null;
      const [a, b] = GAP[M.night ? 'night' : 'day'];
      M.until = now + a + Math.random() * (b - a);
    }
  }

  _playEvent(e, t, t0) {
    if (e.kind === 'b') this._note(t, hz(e.midi), e.vel * 2.6);   // a celesta over the piano, not under it
    else this._piano(t, e.midi, e.vel, t0 + e.off);
  }

  // One piano note: the nearest of the rendered keys, played a little fast
  // or slow to land on the pitch, until `off` — when the damper comes down,
  // which takes longer to stop a heavy bass string than a treble one — or
  // until the note has rung itself out, whichever is first.
  _piano(t, midi, vel, off) {
    const k = pianoKeyFor(midi);
    const buf = PIANO.bufs.get(k);
    if (!buf) return false;
    if (!this._offline && this._pv >= PIANO_VOICES) return false;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const rate = 2 ** ((midi - k) / 12);
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    // loud enough that, at the default music volume, the soundtrack sits
    // about where the old one did (-30 dBFS or so) under the effects
    g.gain.value = 2.2 * Math.max(0.05, vel) ** 1.4;
    const end = t + buf.duration / rate;
    const rel = Math.max(t + 0.08, Math.min(off, end));
    const tau = midi < 48 ? 0.14 : midi < 72 ? 0.1 : 0.07;
    if (rel < end) g.gain.setTargetAtTime(0, rel, tau);
    src.connect(g);
    g.connect(this.pianoPan[midi < 52 ? 0 : midi < 70 ? 1 : 2]);
    src.start(t);
    src.stop(Math.min(end, rel + tau * 7) + 0.02);
    this._pv++;
    src.onended = () => {
      this._pv--;
      src.disconnect();
      g.disconnect();
    };
    return true;
  }

  // The pad to a chord (`p.notes`, MIDI: root, fifth, third, colour, sub) at
  // `p.level`, or away (p null, or no notes). From silence the chord is set
  // where it is; under sound it glides there.
  _padTo(p, t, fade = 3) {
    if (!this.padLevel) return;
    const on = !!p?.notes && p.level > 0;
    if (on) {
      for (let i = 0; i < this.padOsc.length; i++) {
        const f = hz(p.notes[i]);
        if (this._padLive) this.padOsc[i].frequency.setTargetAtTime(f, t, 0.6);
        else this.padOsc[i].frequency.setValueAtTime(f, t);
      }
      const fs = hz(p.notes[4]);
      if (this._padLive) this.padSub.frequency.setTargetAtTime(fs, t, 0.6);
      else this.padSub.frequency.setValueAtTime(fs, t);
      this.padLevel.gain.setTargetAtTime(0.07 * p.level, t, 1.2);
    } else {
      this.padLevel.gain.setTargetAtTime(0, t, fade * 0.4);
    }
    this._padLive = on;
  }

  /** What the soundtrack is doing, for a check or a curious player. */
  musicState() {
    const M = this.m;
    if (!M || !this.ctx) return { on: this.musicOn, started: false, pianoReady: PIANO.ready };
    const now = this.ctx.currentTime;
    return {
      on: this.musicOn, started: true, pianoReady: PIANO.ready, night: M.night,
      piece: M.piece?.title ?? null, key: M.piece?.key ?? null, bpm: M.piece?.bpm ?? null,
      at: M.piece ? +(now - M.t0).toFixed(1) : null,
      of: M.piece ? +M.piece.length.toFixed(1) : null,
      nextIn: M.piece ? null : +(M.until - now).toFixed(1),
      played: M.played, voices: this._pv,
    };
  }

  /**
   * One piece rendered offline — the same graph, the same piano, the same
   * hall, just faster than real time — as a WAV blob plus its level. For
   * listening to a piece without walking the planet for twenty minutes to
   * hear it, and for a check that cannot listen at all.
   */
  async renderPreview({ id = null, seed = 1, seconds = null, night = false, rate = 44100 } = {}) {
    const OAC = globalThis.OfflineAudioContext ?? globalThis.webkitOfflineAudioContext;
    if (!OAC) throw new Error('this browser cannot render offline');
    loadPiano(new OAC(1, 1, rate));
    await pianoReady();
    const piece = PIECES.find((p) => p.id === id) ?? PIECES[0];
    const perf = perform(piece, { seed });
    const len = seconds ?? perf.length;
    const ctx = new OAC(2, Math.ceil(len * rate), rate);
    const g = new GameAudio({ musicVolume: this.musicVol, sfxVolume: 0 });
    g.daylight = night ? 0.1 : 1;
    g._attach(ctx, { offline: true });
    g.pianoTone.frequency.value = night ? 3600 : 6500;
    g.padFilter.frequency.value = night ? 780 : 1500;
    const t0 = 0.1;
    for (const p of perf.pads) g._padTo(p, t0 + p.t);
    for (const e of perf.events) if (t0 + e.t < len) g._playEvent(e, t0 + e.t, t0);
    const buf = await ctx.startRendering();
    let peak = 0;
    let e2 = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) { peak = Math.max(peak, Math.abs(d[i])); e2 += d[i] * d[i]; }
    }
    const rms = Math.sqrt(e2 / (buf.length * buf.numberOfChannels));
    return {
      wav: wavOf(buf), id: perf.id, title: perf.title, key: perf.key, bpm: perf.bpm,
      seconds: +len.toFixed(1), sections: perf.sections,
      peakDb: +(20 * Math.log10(peak || 1e-9)).toFixed(1),
      rmsDb: +(20 * Math.log10(rms || 1e-9)).toFixed(1),
    };
  }

  // One bell note, built from PARTIALS: a stack of sines whose upper
  // partials fade out well before the fundamental does, which is what an ear
  // reads as something being struck rather than switched on. The piano's
  // celesta: a repeat of a tune may be doubled on it, and one piece is
  // played on both throughout.
  //
  // Two touches beyond the table. Low notes ring longer than high ones, as
  // real strings do — a fixed decay for every pitch is the thing that makes
  // a sampler sound like a keyboard. And the attack is soft rather than
  // instant: this is a felt mallet, not a hammer, and a few milliseconds of
  // rise is the difference between a note and a click.
  _note(t, freq, level = 1) {
    if (!this._budget(6)) return;
    const ctx = this.ctx;

    // one gain for the whole note; the hall comes with the gate
    const out = ctx.createGain();
    out.gain.value = 0.085 * level;
    out.connect(this.musicGate);

    // ~4.3 s down low, ~2 s up high
    const dur = clamp(3.4 * Math.pow(440 / freq, 0.35), 1.2, 4.6);
    const atk = rnd(0.007, 0.013);

    for (const [ratio, amp, share] of PARTIALS) {
      const f = freq * ratio;
      if (f > 15000) continue;          // nothing audible, so do not pay for it
      const d = dur * share;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0002, t);
      g.gain.exponentialRampToValueAtTime(amp, t + atk);
      g.gain.exponentialRampToValueAtTime(0.0002, t + atk + d);
      g.connect(out);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      // a few cents of drift per note, so two notes at the same pitch are
      // never bit-identical the way a sampled instrument is
      o.detune.value = rnd(-4, 4);
      o.connect(g);
      o.start(t);
      o.stop(t + atk + d + 0.03);
      this._track(o);
    }

    // The strike itself: a very short, very quiet band of noise around the
    // fundamental. You do not hear it as noise — you hear the note acquire a
    // physical onset.
    if (this._budget(1)) {
      const ng = ctx.createGain();
      this._env(ng, t, 0.09, 0.001, 0.05);
      const bp = this._filter('bandpass', clamp(freq * 2, 200, 6000), 0.8);
      this._noise(t, 0.06).connect(bp);
      bp.connect(ng);
      ng.connect(out);
    }
  }

  // --- sfx primitives ----------------------------------------------------

  _track(node) {
    this._voices++;
    node.onended = () => { this._voices--; };
  }

  _budget(n = 1) { return this._offline || this._voices + n <= MAX_VOICES; }

  _noise(t, dur) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.playbackRate.value = rnd(0.85, 1.15);
    // a random window into the shared buffer, so repeats are not identical
    const off = Math.random() * Math.max(0.01, 2 - dur - 0.05);
    s.start(t, off, dur);
    this._track(s);
    return s;
  }

  _osc(type, t, dur, f0, f1) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) {
      o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    }
    o.start(t); o.stop(t + dur + 0.02);
    this._track(o);
    return o;
  }

  _filter(type, f, q = 1) {
    const b = this.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  }

  _env(g, t, peak, a, d, hold = 0) {
    const p = g.gain;
    const top = Math.max(0.0004, peak);
    p.setValueAtTime(0.0002, t);
    p.exponentialRampToValueAtTime(top, t + Math.max(0.002, a));
    if (hold > 0) p.setValueAtTime(top, t + a + hold);
    p.exponentialRampToValueAtTime(0.0002, t + a + hold + d);
    return g;
  }

  // destination for one effect: sfx bus, optional pan, optional wet send
  _out(gain = 1, opts = {}) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = gain;
    let node = g;
    if (opts.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(opts.pan, -1, 1);
      g.connect(p);
      node = p;
    }
    node.connect(this.sfxBus);
    if (opts.send) {
      const s = ctx.createGain();
      s.gain.value = opts.send;
      node.connect(s);
      s.connect(this.send);
    }
    return g;
  }

  // --- sfx ---------------------------------------------------------------

  // play(name, opts). opts: gain, pan (-1..1), dist (blocks, attenuates),
  // delay (seconds), block (footstep/impact material), weapon (gunshot),
  // kind ('zombie' | 'villager').
  play(name, opts = {}) {
    if (!this.ready || !this.enabled) return false;
    const fn = this._sfx[name];
    if (!fn) return false;
    const now = this.ctx.currentTime;
    const gap = THROTTLE[name] ?? 0.02;
    if (now - (this._last[name] ?? -99) < gap) return false;
    this._last[name] = now;
    if (!this._budget(2)) return false;

    let gain = opts.gain ?? 1;
    if (opts.dist != null) {
      // NOT `dist > 70`: a NaN distance fails every comparison, so the old
      // test let it straight through and the non-finite gain it produced
      // threw out of an AudioParam — inside the render loop, which then
      // stopped drawing for the rest of the frame and every frame after it.
      // A sound whose distance is not a number cannot be placed, so it
      // cannot be played. Audio is a leaf: it must never take a frame down.
      if (!(opts.dist <= 70)) return false;
      gain *= 1 / (1 + opts.dist / 9);
    }
    if (!Number.isFinite(gain)) return false;
    fn.call(this, now + (opts.delay ?? 0), gain, opts);
    return true;
  }

  get _sfx() { return SFX; }

  // --- per frame ---------------------------------------------------------

  // dt in seconds; ctx.daylight is 0..1 exactly as main.js already computes it
  update(dt, ctx = {}) {
    if (!this.ready) return;
    if (ctx.daylight != null) this.daylight = ctx.daylight;
    const M = this.m;
    if (!M) return;

    // Read at the start of each piece, never in the middle of one: a piece
    // that began by day finishes as it began, however fast the sun goes down.
    M.night = this.daylight < 0.3;

    this._envTimer -= dt;
    if (this._envTimer <= 0) {
      this._envTimer = 0.5;
      const now = this.ctx.currentTime;
      // night is darker: the pad's filter closes, the piano softens, and
      // the effects' room grows
      this.padFilter.frequency.setTargetAtTime(M.night ? 780 : 1500, now, 4);
      this.pianoTone.frequency.setTargetAtTime(M.night ? 3600 : 6500, now, 4);
      this.wet.gain.setTargetAtTime(M.night ? 0.62 : 0.42, now, 4);
    }
    if (this.musicOn && this.musicVol > 0) this._musicTick();
  }

  dispose() {
    if (!this.ctx) return;
    for (const s of this.rainSrc ?? []) s.stop();
    this.rainSrc = null;
    this.rainGain = null;
    for (const o of this.padOsc) o.stop();
    this.padSub.stop();
    this.lfoA.stop(); this.lfoB.stop();
    this.ctx.close?.();
    this.ctx = null;
    this.m = null;
  }
}

// ---------------------------------------------------------------------------
// the effect table. `this` is the GameAudio instance; t is an absolute
// AudioContext time, g a gain multiplier already including distance.

const SFX = {
  // Footsteps carry most of the world's texture, so they are the one effect
  // that is fully parameterised by the block underfoot.
  footstep(t, g, o) {
    const m = STEP_MATERIALS[o.block] ?? STEP_MATERIALS.grass;
    const out = this._out(g * m.gain * rnd(0.75, 1.1), o);
    const env = this.ctx.createGain();
    this._env(env, t, 1, 0.004, m.dur);
    const f = this._filter(m.type, m.f * rnd(0.9, 1.12), m.q);
    this._noise(t, m.dur + 0.05).connect(f);
    f.connect(env); env.connect(out);
    if (m.thud) {
      const tg = this.ctx.createGain();
      this._env(tg, t, 0.5, 0.004, 0.07);
      this._osc('sine', t, 0.09, m.thud, m.thud * 0.6).connect(tg);
      tg.connect(out);
    }
  },

  blockBreak(t, g, o) {
    const out = this._out(g * 0.5, { ...o, send: 0.12 });
    const env = this.ctx.createGain();
    this._env(env, t, 1, 0.004, 0.22);
    const f = this._filter('bandpass', 1400, 1.1);
    f.frequency.setValueAtTime(1800, t);
    f.frequency.exponentialRampToValueAtTime(420, t + 0.22);
    this._noise(t, 0.26).connect(f);
    f.connect(env); env.connect(out);
    // a low knock underneath, so it lands rather than just hisses
    const kg = this.ctx.createGain();
    this._env(kg, t, 0.45, 0.003, 0.12);
    this._osc('triangle', t, 0.14, 220, 90).connect(kg);
    kg.connect(out);
  },

  blockPlace(t, g, o) {
    const out = this._out(g * 0.5, o);
    const kg = this.ctx.createGain();
    this._env(kg, t, 0.8, 0.003, 0.09);
    this._osc('sine', t, 0.1, rnd(150, 200), 95).connect(kg);
    kg.connect(out);
    const cg = this.ctx.createGain();
    this._env(cg, t, 0.25, 0.002, 0.04);
    const f = this._filter('bandpass', 2200, 1.4);
    this._noise(t, 0.05).connect(f);
    f.connect(cg); cg.connect(out);
  },

  // crack, body and a tail through the delay — outdoors, a shot answers you
  gunshot(t, g, o) {
    const w = GUNS[o.weapon] ?? GUNS.pistol;
    const out = this._out(g * 0.5, { ...o, send: 0.5 });
    const cg = this.ctx.createGain();
    this._env(cg, t, w.crack, 0.001, w.dur);
    const lp = this._filter('lowpass', w.lp, 0.9);
    const hp = this._filter('highpass', 400, 0.7);
    this._noise(t, w.dur + 0.08).connect(hp);
    hp.connect(lp); lp.connect(cg); cg.connect(out);

    const bg = this.ctx.createGain();
    this._env(bg, t, w.body, 0.002, w.dur * 1.6);
    this._osc('sine', t, w.dur * 1.7, w.boom, w.boom * 0.35).connect(bg);
    bg.connect(out);
  },

  // the landing: a deep sweep and a long rumble, felt more than heard.
  // dist comes in like every combat sound, so a far blast is a distant thud.
  explosion(t, g, o) {
    const out = this._out(g * 0.7, { ...o, send: 0.7 });
    const bg = this.ctx.createGain();
    this._env(bg, t, 1.0, 0.002, 0.6);
    this._osc('sine', t, 0.65, 120, 34).connect(bg);
    bg.connect(out);
    const rg = this.ctx.createGain();
    this._env(rg, t, 0.6, 0.004, 0.8);
    const lp = this._filter('lowpass', 900, 0.7);
    this._noise(t, 0.85).connect(lp);
    lp.connect(rg); rg.connect(out);
    const cg = this.ctx.createGain();
    this._env(cg, t, 0.5, 0.001, 0.08);
    const hp = this._filter('highpass', 1200, 0.8);
    this._noise(t, 0.1).connect(hp);
    hp.connect(cg); cg.connect(out);
  },

  bowshot(t, g, o) {
    const out = this._out(g * 0.5, o);
    const env = this.ctx.createGain();
    this._env(env, t, 0.5, 0.003, 0.13);
    const f = this._filter('bandpass', 1800, 1.6);
    f.frequency.setValueAtTime(2600, t);
    f.frequency.exponentialRampToValueAtTime(900, t + 0.13);
    this._noise(t, 0.16).connect(f);
    f.connect(env); env.connect(out);
  },

  dryfire(t, g, o) {
    const out = this._out(g * 0.4, o);
    for (const d of [0, 0.045]) {
      const env = this.ctx.createGain();
      this._env(env, t + d, 0.6, 0.001, 0.025);
      const f = this._filter('bandpass', 3000 - d * 8000, 6);
      this._noise(t + d, 0.03).connect(f);
      f.connect(env); env.connect(out);
    }
  },

  // magazine out, magazine in, bolt: three transients with a gap you can hear
  reload(t, g, o) {
    const out = this._out(g * 0.45, o);
    const hits = [
      [0.00, 2400, 0.5, 0.05],
      [0.18, 1500, 0.7, 0.07],
      [0.40, 3600, 0.55, 0.04],
    ];
    for (const [d, f0, lvl, dur] of hits) {
      const env = this.ctx.createGain();
      this._env(env, t + d, lvl, 0.002, dur);
      const f = this._filter('bandpass', f0, 5);
      this._noise(t + d, dur + 0.02).connect(f);
      f.connect(env); env.connect(out);
    }
    // a faint metallic ring on the last click
    const rg = this.ctx.createGain();
    this._env(rg, t + 0.4, 0.12, 0.002, 0.3);
    this._osc('sine', t + 0.4, 0.32, 3100, 2900).connect(rg);
    rg.connect(out);
  },

  impact(t, g, o) {
    const m = STEP_MATERIALS[o.block] ?? STEP_MATERIALS.stone;
    const out = this._out(g * 0.42, o);
    const env = this.ctx.createGain();
    this._env(env, t, 0.8, 0.001, 0.06);
    const f = this._filter('bandpass', m.f * rnd(0.8, 1.3), 3);
    this._noise(t, 0.08).connect(f);
    f.connect(env); env.connect(out);
    const tg = this.ctx.createGain();
    this._env(tg, t, 0.3, 0.002, 0.08);
    this._osc('triangle', t, 0.1, 300, 120).connect(tg);
    tg.connect(out);
  },

  entityHurt(t, g, o) {
    // a PERSON cries out; the blip below is for everything else
    if (o.kind === 'villager') return SFX.cry.call(this, t, g, o);
    const out = this._out(g * 0.5, o);
    const env = this.ctx.createGain();
    this._env(env, t, 0.6, 0.006, 0.18);
    const base = o.kind === 'zombie' ? 150 : 300;
    this._osc('triangle', t, 0.2, base * rnd(0.9, 1.15), base * 0.6)
      .connect(env);
    env.connect(out);
    const ng = this.ctx.createGain();
    this._env(ng, t, 0.25, 0.004, 0.12);
    const f = this._filter('bandpass', 900, 1.2);
    this._noise(t, 0.14).connect(f);
    f.connect(ng); ng.connect(out);
  },

  // A CRY. A voice is a buzz shaped by the throat: a sawtooth at the pitch of
  // somebody speaking, through the three resonances of an open "ah", its
  // pitch jumping up and falling away — which is what makes it a yelp of
  // pain rather than a note on a horn — and a little breath under it. It is
  // what shooting a man sounds like now; it used to be the same blip a sheep
  // made.
  cry(t, g, o) {
    if (!this._budget(6)) return;
    const out = this._out(g * 0.6, { ...o, send: 0.18 });
    const f0 = (o.high ? 250 : 145) * rnd(0.85, 1.2);
    const dur = rnd(0.26, 0.38);
    const src = this.ctx.createOscillator();
    src.type = 'sawtooth';
    src.frequency.setValueAtTime(f0 * 1.1, t);
    src.frequency.linearRampToValueAtTime(f0 * 1.5, t + 0.05);
    src.frequency.exponentialRampToValueAtTime(f0 * 0.75, t + dur);
    src.start(t);
    src.stop(t + dur + 0.05);
    this._track(src);
    const env = this.ctx.createGain();
    this._env(env, t, 0.9, 0.012, dur * 0.85);
    for (const [f, q, level] of [[780, 7, 1], [1180, 9, 0.55], [2450, 11, 0.22]]) {
      const bp = this._filter('bandpass', f * rnd(0.94, 1.06), q);
      const lg = this.ctx.createGain();
      lg.gain.value = level * 2.2;
      src.connect(bp);
      bp.connect(lg);
      lg.connect(env);
    }
    env.connect(out);
    const ng = this.ctx.createGain();
    this._env(ng, t, 0.1, 0.01, dur * 0.6);
    const nf = this._filter('bandpass', 1400, 0.9);
    this._noise(t, dur).connect(nf);
    nf.connect(ng);
    ng.connect(out);
  },

  zombieHurt(t, g, o) {
    SFX.groanLike.call(this, t, g * 0.9, 0.45, 0.6, o);
  },

  zombieGroan(t, g, o) {
    SFX.groanLike.call(this, t, g, rnd(0.7, 1.4), 0.35, o);
  },

  // two detuned saws through a closing lowpass, gliding down: the wobble is
  // the tremolo, and it is what makes it read as a voice and not a synth
  groanLike(t, g, dur, level, o) {
    if (!this._budget(3)) return;
    const out = this._out(g * level, { ...o, send: 0.3 });
    const env = this.ctx.createGain();
    this._env(env, t, 0.8, dur * 0.25, dur * 0.8);
    const f = this._filter('lowpass', 700, 3);
    f.frequency.setValueAtTime(rnd(600, 900), t);
    f.frequency.exponentialRampToValueAtTime(220, t + dur);
    const f0 = rnd(96, 136);
    for (const det of [-11, 9]) {
      const osc = this._osc('sawtooth', t, dur, f0, f0 * rnd(0.6, 0.78));
      osc.detune.value = det;
      osc.connect(f);
    }
    // slow wobble on the level, roughly a breath
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = rnd(3.5, 6.5);
    const lg = this.ctx.createGain();
    lg.gain.value = 0.25;
    lfo.connect(lg); lg.connect(env.gain);
    lfo.start(t); lfo.stop(t + dur + 0.05);
    this._track(lfo);
    f.connect(env); env.connect(out);
  },

  playerHurt(t, g, o) {
    const out = this._out(g * 0.7, { ...o, send: 0.2 });
    const env = this.ctx.createGain();
    this._env(env, t, 0.7, 0.005, 0.3);
    this._osc('triangle', t, 0.32, 210, 120).connect(env);
    env.connect(out);
    const ng = this.ctx.createGain();
    this._env(ng, t, 0.35, 0.003, 0.22);
    const f = this._filter('lowpass', 800, 1);
    f.frequency.exponentialRampToValueAtTime(220, t + 0.25);
    this._noise(t, 0.26).connect(f);
    f.connect(ng); ng.connect(out);
  },

  // three to five chirps, each a fast glide up then a shorter one down
  bird(t, g, o) {
    const out = this._out(g * 0.22, { ...o, send: 0.45 });
    const n = 3 + ((Math.random() * 3) | 0);
    const base = rnd(1900, 3100);
    for (let i = 0; i < n; i++) {
      if (!this._budget(1)) return;
      const d = t + i * rnd(0.08, 0.16);
      const env = this.ctx.createGain();
      this._env(env, d, 0.6, 0.006, 0.05);
      const up = i % 2 === 0;
      this._osc('sine', d, 0.06,
        base * (up ? 0.8 : 1.15), base * (up ? 1.25 : 0.85)).connect(env);
      env.connect(out);
    }
  },

  water(t, g, o) {
    const out = this._out(g * 0.4, { ...o, send: 0.25 });
    const env = this.ctx.createGain();
    this._env(env, t, 0.8, 0.05, 0.45);
    const f = this._filter('bandpass', 600, 0.9);
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(2200, t + 0.4);
    this._noise(t, 0.55).connect(f);
    f.connect(env); env.connect(out);
  },

  // The swing: a short rush of air, brightest at the start and falling as the
  // arm slows. Noise through a bandpass that sweeps DOWN is the whole trick —
  // sweeping up sounds like a whistle, sweeping down sounds like something
  // heavy going past you.
  swing(t, g, o) {
    const out = this._out(g * 0.32, { ...o, send: 0.15 });
    const env = this.ctx.createGain();
    this._env(env, t, 1, 0.02, 0.16);
    const f = this._filter('bandpass', 1600, 1.4);
    f.frequency.setValueAtTime(rnd(1900, 2400), t);
    f.frequency.exponentialRampToValueAtTime(420, t + 0.18);
    this._noise(t, 0.22).connect(f);
    f.connect(env); env.connect(out);
  },

  // A car horn: two sawtooth tones a minor third apart, which is what makes
  // it read as a horn rather than as a beep. A bus leans on it longer.
  horn(t, g, o) {
    const out = this._out(g * 0.22, { ...o, send: 0.3 });
    const dur = o.gain > 0.8 ? 0.55 : 0.3;
    const f = rnd(300, 420);
    const env = this.ctx.createGain();
    this._env(env, t, 0.7, 0.012, 0.07, dur);
    const lp = this._filter('lowpass', 2400, 0.8);
    this._osc('sawtooth', t, dur + 0.1, f, f).connect(lp);
    this._osc('sawtooth', t, dur + 0.1, f * 1.19, f * 1.19).connect(lp);
    lp.connect(env); env.connect(out);
  },

  // THE BELL. A struck bronze bell is not a note: it is a hum, a strike tone,
  // and a stack of partials that are deliberately NOT harmonic — the minor
  // third at 1.2 is what makes a bell sound like a bell and a bell-shaped
  // sawtooth sound like a horn. Each partial decays at its own rate, the high
  // ones fastest, which is the whole of the "clang then ring".
  bell(t, g, o) {
    const out = this._out(g * 0.30, { ...o, send: 0.55 });
    const f0 = o.pitch ?? 196;              // a low G: a village bell, not a chime
    // hum, prime, minor third, fifth, nominal, and two above it
    const parts = [
      [0.5, 0.34, 5.0], [1.0, 1.00, 3.6], [1.2, 0.55, 2.2],
      [1.5, 0.34, 1.6], [2.0, 0.42, 1.2], [2.5, 0.16, 0.7], [3.0, 0.12, 0.5],
    ];
    for (const [mul, amp, dec] of parts) {
      if (!this._budget(2)) break;
      const env = this.ctx.createGain();
      this._env(env, t, amp, 0.004, dec);
      this._osc('sine', t, dec + 0.1, f0 * mul, f0 * mul).connect(env);
      env.connect(out);
    }
    // the clapper: a short bright knock, so the ring has something to start
    if (this._budget(2)) {
      const knock = this.ctx.createGain();
      this._env(knock, t, 0.5, 0.001, 0.08);
      const bp = this._filter('bandpass', 2600, 3);
      this._noise(t, 0.1).connect(bp);
      bp.connect(knock); knock.connect(out);
    }
  },

  // THE CALL. A mosque has no bell: the call is a VOICE, and what makes it one
  // is that it bends. A filtered sawtooth through a formant band, sliding
  // between the notes of a phrase rather than stepping, with vibrato on the
  // held ones — sung, not rung, which is the whole difference between the two
  // buildings made audible.
  adhan(t, g, o) {
    const out = this._out(g * 0.16, { ...o, send: 0.6 });
    const root = o.pitch ?? 233;            // B flat, roughly a man's range
    // scale degrees of a maqam-ish phrase: up to the fourth, back, and a long
    // held note at the end
    const phrase = [
      [0, 0.55], [2, 0.35], [3, 0.9], [2, 0.3], [0, 0.5], [-2, 1.4],
    ];
    const STEP = 1.05946;
    let at = t;
    for (const [deg, dur] of phrase) {
      if (!this._budget(3)) break;
      const f = root * STEP ** deg;
      const env = this.ctx.createGain();
      this._env(env, at, 0.9, 0.06, 0.16, Math.max(0.05, dur - 0.22));
      // the formant: a voice is a buzz with two bands on it, and one band with
      // a slow sweep is enough to read as one at this size
      const bp = this._filter('bandpass', 700, 2.2);
      bp.frequency.setValueAtTime(620, at);
      bp.frequency.linearRampToValueAtTime(980, at + dur * 0.6);
      const osc = this._osc('sawtooth', at, dur + 0.12, f, f);
      // vibrato, but only on the long notes: a wobble on a passing note is a
      // broken oscillator, and on a held one it is a singer
      if (dur > 0.6 && this._budget(2)) {
        const lfo = this._osc('sine', at, dur + 0.12, 5.2, 5.2);
        const depth = this.ctx.createGain();
        depth.gain.value = f * 0.012;
        lfo.connect(depth);
        depth.connect(osc.frequency);
      }
      osc.connect(bp);
      bp.connect(env); env.connect(out);
      at += dur;
    }
  },

  // A bark: a noise burst shaped by a falling band, with a tone under it.
  // Two or three of them, because one bark is a cough.
  bark(t, g, o) {
    const out = this._out(g * 0.4, { ...o, send: 0.35 });
    const n = 2 + ((Math.random() * 2) | 0);
    const base = rnd(220, 420);
    for (let i = 0; i < n; i++) {
      if (!this._budget(2)) return;
      const d = t + i * rnd(0.13, 0.22);
      const env = this.ctx.createGain();
      this._env(env, d, 0.8, 0.006, 0.13);
      const bp = this._filter('bandpass', 1100, 1.2);
      bp.frequency.setValueAtTime(1600, d);
      bp.frequency.exponentialRampToValueAtTime(500, d + 0.14);
      this._noise(d, 0.18).connect(bp);
      bp.connect(env); env.connect(out);
      const tg = this.ctx.createGain();
      this._env(tg, d, 0.45, 0.006, 0.11);
      this._osc('square', d, 0.14, base * 1.3, base * 0.7).connect(tg);
      tg.connect(out);
    }
  },

  // Thunder is two sounds, and which one you get is the whole difference
  // between a distant storm and one overhead: a crack (broadband, fast) that
  // only survives close by, and a rumble (lowpassed, seconds long, wobbling)
  // that is all that is left at a distance. `g` already carries the strike's
  // distance, so it decides the mix.
  thunder(t, g, o) {
    const near = clamp(g, 0, 1);
    const out = this._out(0.9, { ...o, send: 0.6 });
    const dur = 2.2 + Math.random() * 1.8;

    const rg = this.ctx.createGain();
    this._env(rg, t, 0.55 * (0.4 + 0.6 * near), 0.09, dur, 0.25);
    const lp = this._filter('lowpass', 190 + 260 * near, 0.8);
    lp.frequency.exponentialRampToValueAtTime(70, t + dur);
    this._noise(t, dur + 0.3).connect(lp);
    lp.connect(rg); rg.connect(out);

    // the roll: a slow tremolo on the rumble, so it breaks up instead of
    // sitting there as one flat hiss
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = rnd(1.4, 3.2);
    const lg = this.ctx.createGain();
    lg.gain.value = 0.3;
    lfo.connect(lg); lg.connect(rg.gain);
    lfo.start(t); lfo.stop(t + dur + 0.3);
    this._track(lfo);

    // the sub thump you feel rather than hear
    const sg = this.ctx.createGain();
    this._env(sg, t, 0.5 * near, 0.02, 0.9);
    this._osc('sine', t, 1, 58, 28).connect(sg);
    sg.connect(out);

    if (near > 0.45 && this._budget(2)) {
      const cg = this.ctx.createGain();
      this._env(cg, t, 0.8 * near, 0.002, 0.22);
      const hp = this._filter('highpass', 900, 0.7);
      this._noise(t, 0.3).connect(hp);
      hp.connect(cg); cg.connect(out);
    }
  },
};

// one instance is what a game needs; the class is exported for tests
export const audio = new GameAudio();
export default audio;
