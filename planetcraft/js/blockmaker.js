// blockmaker.js — opens the block maker inside the game window.
//
// blocks.html is a page of its own and used to be reached as one: a link that
// opened a second browser window, address bar and all, over a game that had
// gone quiet behind it. Nothing about painting a block wants a second window,
// so it is now a frame filling this one — the same page, no browser furniture,
// and the world still running behind it when you close it.
//
// Same origin and no build step, so the frame is the whole mechanism. The one
// thing crossing the boundary is Escape, which the page inside posts out
// because a key pressed in a frame is that frame's to hear, not ours.

const panel = document.getElementById('blockMaker');
const frame = document.getElementById('blockMakerFrame');
const openBtn = document.getElementById('blockMakerBtn');
const closeBtn = document.getElementById('blockMakerClose');

if (panel && frame && openBtn) {
  function show(on) {
    // Loaded on the first press rather than at startup: the block maker
    // generates an atlas for every style it lists, which is real work to do
    // for somebody who never opens it.
    if (on && !frame.getAttribute('src')) frame.setAttribute('src', 'blocks.html');
    panel.hidden = !on;
    if (on) frame.focus();
    else openBtn.focus();
  }

  openBtn.addEventListener('click', () => show(true));
  closeBtn?.addEventListener('click', () => show(false));

  // Escape from inside the frame. Its own document gets that keypress, so it
  // says so rather than us reaching across into it.
  addEventListener('message', (e) => {
    if (e.origin === location.origin && e.data === 'blockmaker:close') show(false);
  });

  // ...and Escape out here, for when the bar rather than the page has focus
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) show(false);
  });
}
