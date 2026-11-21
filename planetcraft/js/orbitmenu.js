// orbitmenu.js — the overview's menu, as buttons down the left.
//
// From orbit the screen is a planet, and everything you might want to do to it
// was a row of small underlined words in the top corner, printed over the top
// of the globe. This puts those actions down the left instead, vertically
// centred and in the same buttons the front door uses, so the middle of the
// screen stays the world.
//
// NOTHING HERE IMPLEMENTS AN ACTION. Every button names a control that already
// exists in the HUD and opens it by clicking it, which is why the markup says
// data-click="saveBtn" rather than calling a save function. "Save world" then
// means exactly what the HUD's "save" means — including everything main.js
// does around it — and there is one implementation of each action instead of
// two that quietly drift apart. It is also what keeps this file out of
// main.js's way entirely.

const panel = document.getElementById('orbitMenu');
const menu = document.getElementById('menu');
const hud = document.getElementById('hud');
const resumeBtn = document.getElementById('resumeBtn');

if (panel && menu) {
  for (const b of panel.querySelectorAll('[data-click]')) {
    b.addEventListener('click', () => {
      document.getElementById(b.dataset.click)?.click();
      // The buttons that open the menu card leave the pressed one focused
      // behind it, and a focused button takes the next Enter or Space. Both
      // do something in this game.
      b.blur();
    });
  }

  // --- the styles ---------------------------------------------------------
  // Style used to step to the next one on every press, which is fine for
  // comparing two and hopeless for finding one: a dozen styles means up to
  // eleven presses and a repaint each time. This lists them instead, still
  // applying as you click so the planet in front of you is what you judge by.
  //
  // The list is a mirror of the buttons the settings screen already builds
  // from the style catalogue — same trick as the rest of this file. Clicking
  // one clicks its original, so choosing a style here goes through exactly the
  // code that chooses it there, and the catalogue is only ever written down
  // once. Built on first open, so it does not care what order the modules ran
  // in.
  const picker = document.getElementById('stylePicker');
  const styleBtn = panel.querySelector('[data-opens="stylePicker"]');
  const source = () => document.querySelectorAll('#styles .style');

  function buildPicker() {
    if (picker.childElementCount) return true;
    const from = source();
    if (!from.length) return false;
    const head = document.createElement('div');
    head.className = 'head';
    head.innerHTML = 'Style<small>click one to see it on the world</small>';
    picker.appendChild(head);
    for (const src of from) {
      const b = document.createElement('button');
      b.className = 'stylePick';
      b.textContent = src.textContent;
      b.title = src.title;                 // the catalogue's own blurb
      b.dataset.s = src.dataset.s;
      b.addEventListener('click', () => src.click());
      picker.appendChild(b);
    }
    const close = document.createElement('button');
    close.className = 'close';
    close.textContent = '← back';
    close.addEventListener('click', () => showPicker(false));
    picker.appendChild(close);
    // Y still steps through them, and the marked row has to follow it.
    new MutationObserver(markCurrent).observe(document.getElementById('styles'),
      { subtree: true, attributes: true, attributeFilter: ['class'] });
    markCurrent();
    return true;
  }

  function markCurrent() {
    for (const src of source()) {
      picker.querySelector(`.stylePick[data-s="${src.dataset.s}"]`)
        ?.classList.toggle('sel', src.classList.contains('sel'));
    }
  }

  function showPicker(on) {
    if (on && !buildPicker()) return;
    if (on) markCurrent();
    picker.classList.toggle('shown', on);
    styleBtn?.classList.toggle('on', on);
  }

  styleBtn?.addEventListener('click', () => {
    showPicker(!picker.classList.contains('shown'));
    styleBtn.blur();
  });

  // Is there a world to go back to? The overview only ever appears once one
  // exists — the front door cannot be dismissed before that, which is the
  // whole reason it never had a way out — so the first time this panel is on
  // screen is exactly the moment "back to your world" starts to mean
  // something.
  let hasWorld = false;

  const playing = () => document.body.classList.contains('playing');
  const menuOpen = () => getComputedStyle(menu).display !== 'none';

  function sync() {
    // The overview is the state where neither the card nor the world is in
    // front of you: not walking, and no menu over the top. The solar system
    // counts, and should — it is the view with the most planets in it.
    const show = !playing() && !menuOpen();
    if (show) hasWorld = true;
    panel.classList.toggle('shown', show);
    if (!show) showPicker(false);   // the list belongs to the panel it opened from
    // The HUD's own copies of these actions are for walking about, where there
    // is no room for a panel down the side. Everywhere else something better
    // is already offering them — these buttons in the overview, the card's own
    // when the card is open — and a second set printed over the top of it is
    // just two doors to the same room.
    hud?.classList.toggle('quiet', !playing());
    if (resumeBtn) resumeBtn.hidden = !hasWorld;
  }

  // Both signals are attributes somebody else owns: main.js adds .playing to
  // the body on entering play, and sets the card's display inline. Watching
  // them beats polling and beats asking main.js to tell us.
  new MutationObserver(sync).observe(document.body,
    { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(sync).observe(menu,
    { attributes: true, attributeFilter: ['style'] });

  resumeBtn?.addEventListener('click', () => {
    menu.style.display = 'none';   // the world is still there, behind the card
  });

  // M fills the screen from the overview too. main.js binds it in play mode
  // only, and rightly: the card has a text field in it, and a world called
  // "Mercury" should not go fullscreen twice on the way in. Same rule here —
  // not while typing, and not while the card is open.
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyM' || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
    if (playing() || menuOpen()) return;
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'
      || el.isContentEditable)) return;
    document.getElementById('fullBtn')?.click();
  });

  sync();
}
