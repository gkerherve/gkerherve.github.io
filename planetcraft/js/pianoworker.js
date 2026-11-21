// pianoworker.js — renders the piano (piano.js) off the page's thread.
//
// Twenty notes of additive synthesis is about a second of arithmetic, and a
// second on the main thread is a second of the game not drawing. Here it is
// nobody's frame. Each note goes back the moment it is done, its samples
// transferred rather than copied.

import { renderPianoNote, PIANO_SR } from './piano.js';

self.onmessage = (e) => {
  const { keys, sr = PIANO_SR } = e.data ?? {};
  for (const m of keys ?? []) {
    const data = renderPianoNote(m, sr);
    self.postMessage({ m, sr, data }, [data.buffer]);
  }
  self.postMessage({ done: true });
};
