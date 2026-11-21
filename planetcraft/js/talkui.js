// talkui.js — asking somebody something, and being answered.
//
// The village has always TOLD you things — a line of flash text off a worker
// you pointed at — but nothing in the world could be ASKED. The priest is the
// first person who can: he stands at the altar all day, he is the one villager
// with nothing else to do, and what he knows is what the chronicle knows.
//
// The rule the chief is held to holds here too: he has no private information.
// Every answer below is worked out from the same numbers the almanac draws its
// plots from, so a priest cannot tell you anything you could not have counted
// by walking there yourself. What he saves you is the walk.
//
// AND YOU CAN JUST TALK. The question card is what works with no key, no
// network and no model — rule 4 — but a chief you can only ask seven fixed
// questions is a menu, not a person. So a speaker may also be given a line to
// type into: what you write goes to whoever is running that village (see
// chief_ai.py), the answer comes back into the same panel, and it is a
// CONVERSATION — the card keeps both halves of it, in order, and scrolls.
//
// The card never waits on an answer. It shows the line you sent, marks it
// pending, and carries on being a card; if nothing comes back the chief says
// so in his own voice and the game has not stopped for a second.

const CSS = `
.talk-root { position: fixed; inset: 0; z-index: 43; display: none;
  align-items: flex-end; justify-content: center; padding-bottom: 8vh;
  background: rgba(6,8,12,.45); font: 13px/1.55 system-ui, sans-serif;
  color: #e8e4da; }
.talk-root.talk-open { display: flex; }
.talk-root, .talk-root * { box-sizing: border-box; }
.talk-panel { width: min(680px, 94vw); background: #1b1d22;
  border: 2px solid #3a3128; border-radius: 9px;
  box-shadow: 0 20px 54px rgba(0,0,0,.6); overflow: hidden; }
.talk-head { display: flex; align-items: baseline; gap: 10px; padding: 11px 16px;
  background: #221d17; border-bottom: 1px solid #322a21; }
.talk-head b { font-size: 15px; letter-spacing: .02em; color: #efe7d6; }
.talk-head span { color: #9a9083; font-size: 12px; }
.talk-head .talk-x { margin-left: auto; font-size: 11px; color: #7e766b; }
.talk-say { padding: 14px 16px; font-size: 14px; color: #efe9dc;
  border-bottom: 1px solid #2b2f36; min-height: 74px;
  max-height: 42vh; overflow-y: auto; }
.talk-say i { font-style: normal; color: #c8bfa8; }
.talk-line { margin: 0 0 9px; }
.talk-line:last-child { margin-bottom: 0; }
.talk-line.talk-you { color: #9fb6c8; }
.talk-line.talk-you b { color: #7f96a8; font-weight: 400; margin-right: 6px; }
.talk-line.talk-wait i { color: #857d70; }
.talk-write { display: flex; gap: 8px; padding: 11px 16px 0; }
.talk-write input { flex: 1; font: inherit; font-size: 13.5px; color: #efe9dc;
  background: #14161a; border: 1px solid #383d46; border-radius: 7px;
  padding: 8px 11px; outline: none; }
.talk-write input:focus { border-color: #c8a45a; }
.talk-write button { font: inherit; font-size: 12.5px; color: #efe6d2;
  background: #3a3128; border: 1px solid #5a4c39; border-radius: 7px;
  padding: 8px 15px; cursor: pointer; }
.talk-write button:hover { background: #4a3f31; }
.talk-foot { display: flex; gap: 8px; padding: 0 16px 13px; }
.talk-foot button { font: inherit; font-size: 12.5px; color: #e7ddc4;
  background: #2b2f36; border: 1px solid #4a5260; border-radius: 999px;
  padding: 7px 15px; cursor: pointer; }
.talk-foot button:hover { background: #353b45; }
.talk-foot .talk-act { color: #f2e6c8; border-color: #c8a45a; }
.talk-foot .talk-end { margin-left: auto; }
.talk-ask { display: flex; flex-wrap: wrap; gap: 7px; padding: 12px 16px 14px; }
.talk-ask button { font: inherit; font-size: 12.5px; color: #ddd6c4;
  background: #24272d; border: 1px solid #363b43; border-radius: 999px;
  padding: 6px 13px; cursor: pointer; }
.talk-ask button:hover { background: #2d3138; border-color: #58606d; }
.talk-ask button.talk-on { border-color: #c8a45a; color: #f2e6c8; }
`;

const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};

export class TalkUI {
  constructor({ onClose } = {}) {
    this.onClose = onClose;
    this.open_ = false;
    this.who = null;

    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.root = el('div', 'talk-root');
    const panel = el('div', 'talk-panel');
    this.head = el('div', 'talk-head');
    this.say = el('div', 'talk-say');
    this.write = el('div', 'talk-write');
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.maxLength = 300;
    this.input.placeholder = 'say something to him';
    this.sendBtn = el('button', null, 'say');
    this.write.append(this.input, this.sendBtn);
    this.ask = el('div', 'talk-ask');
    // The counter, and the door. A card with a text field in it swallows
    // Escape often enough that "how do I get out of this" is a real question,
    // and a shopkeeper you can talk to but not buy from is half a shopkeeper.
    this.foot = el('div', 'talk-foot');
    this.actBtn = el('button', 'talk-act', '');
    this.endBtn = el('button', 'talk-end', 'that will be all');
    this.foot.append(this.actBtn, this.endBtn);
    this.endBtn.addEventListener('click', () => this.close());
    this.actBtn.addEventListener('click', () => {
      const act = this.speaker?.act;
      if (act) act();
    });
    panel.append(this.head, this.say, this.write, this.ask, this.foot);
    this.sendBtn.addEventListener('click', () => this._send());
    this.input.addEventListener('keydown', (e) => {
      // The panel's own 1-9 shortcuts are a keystroke away from every sentence
      // anybody would type, so the input swallows its keys and only Enter and
      // Escape mean anything to the card.
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); this._send(); }
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    });
    this.root.appendChild(panel);
    document.body.appendChild(this.root);

    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root) this.close();
    });
    this._onKey = (e) => {
      if (!this.open_) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); }
      // 1..9 pick a question, so a conversation can be held without the mouse
      if (document.activeElement === this.input) return;
      const n = Number(e.key);
      if (n >= 1 && n <= this.topics.length) {
        e.preventDefault(); e.stopPropagation();
        this._pick(n - 1);
      }
    };
  }

  // `speaker` is { name, title, opener, onSay }, `topics` a list of
  // { q, a } where `a` is a function returning the answer as a string.
  //
  // `onSay(text)` is what makes it a conversation rather than a menu: given
  // one, the card grows a line to type into and hands whatever is typed to it.
  // Whoever takes it answers by calling `said()` — later, from the wire, or
  // straight away out of its own head. A speaker without one is the old card.
  open(speaker, topics) {
    this.speaker = speaker;
    this.topics = topics ?? [];
    this.chosen = -1;
    this.open_ = true;
    this.waiting = null;
    this.head.textContent = '';
    this.head.append(el('b', null, speaker.name),
      el('span', null, speaker.title ?? ''),
      el('span', 'talk-x', speaker.onSay
        ? 'escape ends it · 1-9 asks · or just type'
        : 'escape ends it · 1-9 asks'));
    this.say.textContent = '';
    this._answer(speaker.opener ?? '');
    this._buttons();
    this.write.style.display = speaker.onSay ? 'flex' : 'none';
    this.actBtn.style.display = speaker.act ? '' : 'none';
    this.actBtn.textContent = speaker.actName ?? 'do it';
    this.input.value = '';
    this.root.classList.add('talk-open');
    document.addEventListener('keydown', this._onKey, true);
    if (speaker.onSay) setTimeout(() => this.input.focus(), 30);
    return true;
  }

  // What the player typed goes out; the card shows it straight away and marks
  // the answer pending, because a panel that freezes while a model thinks is
  // a panel that has stopped being part of the game.
  _send() {
    const text = this.input.value.trim();
    if (!text || !this.speaker?.onSay) return;
    this.input.value = '';
    const line = el('p', 'talk-line talk-you');
    line.append(el('b', null, 'you'), document.createTextNode(text));
    this.say.appendChild(line);
    this._wait('…');
    try { this.speaker.onSay(text); } catch (err) { this.said('I did not catch that.'); }
  }

  // The line that stands where the answer will go. It COUNTS, because three
  // dots that might mean "a model is working on it" and might mean "nothing
  // is listening" are the same three dots — and after five seconds of them
  // everybody assumes the second one and stops using the thing.
  _wait(label) {
    this._stopTick();
    this.waiting = el('p', 'talk-line talk-wait');
    this.waiting.appendChild(el('i', null, label));
    this.say.appendChild(this.waiting);
    this.say.scrollTop = this.say.scrollHeight;
    this.waitFrom = Date.now();
    this.waitLabel = label;
    this.tick = setInterval(() => {
      if (!this.waiting) return this._stopTick();
      const secs = Math.round((Date.now() - this.waitFrom) / 1000);
      this.waiting.textContent = '';
      this.waiting.appendChild(el('i', null,
        this.waitLabel === '…' ? '…' : `${this.waitLabel} — ${secs}s`));
    }, 1000);
  }

  _stopTick() {
    if (this.tick) { clearInterval(this.tick); this.tick = null; }
  }

  // Somebody IS working on it, and this is who. Called when the answer is
  // still coming but the card can at least stop looking dead.
  thinking(who) {
    if (!this.open_ || !this.waiting) return false;
    this.waitLabel = `${who} is thinking`;
    this.waitFrom = this.waitFrom ?? Date.now();
    return true;
  }

  // An answer, from wherever it came from. Replaces the pending mark if one is
  // standing, or simply lands at the bottom of the card if the answer arrived
  // out of the blue.
  said(text) {
    if (!this.open_) return false;
    this._stopTick();
    if (this.waiting) { this.waiting.remove(); this.waiting = null; }
    this._answer(text);
    return true;
  }

  // Is this card still the one that asked? Answers arrive late and the player
  // may have walked off and opened another one in the meantime.
  isTalkingTo(tag) { return this.open_ && this.speaker?.tag === tag; }

  _buttons() {
    this.ask.textContent = '';
    this.topics.forEach((t, i) => {
      const b = el('button', i === this.chosen ? 'talk-on' : null,
        `${i + 1}. ${t.q}`);
      b.addEventListener('click', () => this._pick(i));
      this.ask.appendChild(b);
    });
  }

  _pick(i) {
    const t = this.topics[i];
    if (!t) return;
    this.chosen = i;
    // A picked question is a thing you said, and it belongs in the record of
    // the conversation the same as a typed one.
    if (this.speaker?.onSay) {
      const line = el('p', 'talk-line talk-you');
      line.append(el('b', null, 'you'), document.createTextNode(t.q));
      this.say.appendChild(line);
    }
    let said;
    try { said = t.a(); } catch (err) { said = 'I could not tell you.'; }
    this._answer(said);
    this._buttons();
  }

  // One line of his, at the bottom. The card is a conversation now, so
  // answers ACCUMULATE — and it is capped, because a long chat in a fixed
  // panel is a memory leak with quotation marks round it.
  _answer(text) {
    if (!this.speaker?.onSay) this.say.textContent = '';
    const line = el('p', 'talk-line');
    line.appendChild(el('i', null, `"${text}"`));
    this.say.appendChild(line);
    while (this.say.childElementCount > 40) this.say.firstElementChild.remove();
    this.say.scrollTop = this.say.scrollHeight;
  }

  close() {
    if (!this.open_) return;
    this._stopTick();
    this.waiting = null;
    this.open_ = false;
    // the line you were typing into must not keep the keyboard once the
    // card is gone — it stops propagation, and the game would go deaf
    if (this.root.contains(document.activeElement)) document.activeElement.blur();
    this.root.classList.remove('talk-open');
    document.removeEventListener('keydown', this._onKey, true);
    this.onClose?.();
  }

  isOpen() { return this.open_; }
}

export default TalkUI;
