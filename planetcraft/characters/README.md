# Characters

People made in the character maker (`avatar.html`), and offered on the main
menu next to Man, Woman and Kid.

## Making one

Open `avatar.html`. The three on the left are the bases; **the one on the right
is yours**. Pick which base it is built on, then move the shape sliders and the
colour swatches until it is the person you want. Name it and save.

## What is in the file

Only what you CHANGED:

```json
{
  "version": 1,
  "name": "gwilherm",
  "character": "man",          // the base it is built on
  "skin": "tan",               // the complexion it starts from
  "colors": { "shirt": "#a03028", "hair": "#e0c060" },
  "build":  { "width": 1.55, "height": 1.06 }
}
```

That is deliberate. A character that repeated the whole palette would be frozen
against the base it was made from — a better mouth, or a shorter kid, would
never reach it again. Anything it does not mention it inherits, for ever.

The skin row on the main menu still applies to a made character: it is right
there, and clicking it should do something.
