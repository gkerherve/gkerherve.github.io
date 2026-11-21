# Painted blocks

Tiles painted texel by texel in the block maker (`blocks.html`), used by the
game in place of the ones it generates.

They are **not** a style. They sit ON one, keyed by style and tile, so painting
the stone of Realistic leaves the stone of Classic alone — and a tile you never
touch still comes from the generator, and still improves when the generator
does.

The two styles paint differently, because they are different things:

* **Classic** is pixel art, and its board is the atlas's 32 texels a block.
  What you save is the whole tile.
* **Realistic** is photographs, and its board is the photograph at its own
  256 texels a block. What you save is what you painted **and where** — the
  texels you left alone stay the photograph in the game, relief and shine and
  all. On a photograph that covers two blocks a side (grass, stone, brick,
  most planks) the board is one block of it, and your painting goes on every
  block in the same place while each keeps its own quarter of the photograph
  round it. A tile with no photograph is painted over the style's own pixel
  art, grown to 256.

## Making one

Open `blocks.html`.

* pick a **style** and a **block** on the left
* **left-click** paints, **drag** draws, **right-click** or **alt-click** picks
  up the colour under the cursor
* the swatches on the right are the colours already in that tile, so a repair
  stays in the tile's own palette
* the cube under the grid shows it as a block, at the face shading the game
  uses — a texture is judged as a block, not as a square
* the grid **wraps**: paint off one edge and it comes back on the other, which
  is what makes a tile tile

`revert to generated` drops the override in the page. Delete the file in this
directory to make that permanent.

## The files

Classic (version 1):

```json
{
  "version": 1,
  "style": "classic",
  "tile": 3,
  "tileName": "STONE",
  "palette": ["#8a8f96", "#c02020", null],
  "runs": [[0, 12], [1, 3], ...]
}
```

A palette plus run-length pairs, in row order. `null` in the palette is
transparent, which glass and ladders need. Most tiles are a couple of dozen
colours over a thousand texels, so the palette is short and the runs are long —
and both stay readable in a diff, which a base64 blob would not.

Realistic (version 2):

```json
{
  "version": 2,
  "style": "real",
  "tile": 3,
  "tileName": "STONE",
  "n": 256,
  "painted": 12337,
  "paint": "data:image/png;base64,...",
  "mask": "data:image/png;base64,..."
}
```

Two PNGs the size of the board: `paint` holds the painted texels (the rest
transparent) and `mask` is white wherever something was painted — which is
what tells a texel painted transparent (a hole in a leaf) from one nobody
touched. A photograph in a diff is not readable whichever way it is written,
and a mark on a photograph compresses to a few kilobytes as a PNG where the
palette-and-runs form would be every texel a colour of its own.

A version-1 file saved against `real` (the old 32-texel board) still works: it
counts as painted everywhere and is grown texel for texel over the photograph.

In the game `realism.js` lays each painting over its tile's layers while the
photographs are built, so the ground, the hotbar and the block in your hand
all wear it; saving from the block maker inside the game rebuilds them there
and then.
