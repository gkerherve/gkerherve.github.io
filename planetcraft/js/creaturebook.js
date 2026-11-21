// creaturebook.js — opens the Creatures book (creatures.html) over the game.
//
// "Is there a location that we could have, or another button, for monster
// visualisation? So they go somewhere, and we can see that they are in."
// This is the somewhere: menu ▸ Creatures, a frame filling the window with
// every creature KherveCAD has sent, walking on a stand, and a button that
// brings one into the world in front of you. The frame asks the game for
// what it needs by message (see the creatures: handler in main.js); the one
// thing it asks of THIS file is to be closed — by Escape inside it, or once
// it has brought something here, so the first thing you see is what you
// made.

const panel = document.getElementById('creatureBook');
const frame = document.getElementById('creatureBookFrame');
const openBtn = document.getElementById('creatureBookBtn');
const closeBtn = document.getElementById('creatureBookClose');

if (panel && frame && openBtn) {
  function show(on) {
    // loaded on the first press: nobody who never opens it builds a stand
    if (on && !frame.getAttribute('src')) frame.setAttribute('src', 'creatures.html');
    panel.hidden = !on;
    if (on) {
      frame.focus();
      // the world may have changed since the book was last open: it asks
      // the game again when it hears it has been shown
      frame.contentWindow?.postMessage?.('creaturebook:shown', location.origin);
    } else {
      // back to the world the menu was opened over, if there is one
      document.getElementById('menuClose')?.click();
    }
  }

  openBtn.addEventListener('click', () => show(true));
  closeBtn?.addEventListener('click', () => show(false));
  addEventListener('message', (e) => {
    if (e.origin === location.origin && e.data === 'creaturebook:close') show(false);
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) show(false);
  });
}
