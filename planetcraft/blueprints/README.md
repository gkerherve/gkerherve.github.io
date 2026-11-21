# Blueprints

Buildings you designed, saved out of the world, and stamped back into every
village the game generates. This directory is the one part of the world that is
authored by a person rather than by code — everything else comes out of a seed.

## Making one

1. Build the house you want, anywhere. Creative mode is easiest (`M` for
   fullscreen, the mode is chosen on the menu).
2. Press **P** — the planner opens.
3. Look at one bottom corner of the building and press **C**. Look at the
   opposite top corner and press **C** again. A blue box shows the selection,
   and the HUD gives its size.
4. **Stand on the side that should face the street**, and press **V**. Name it.

That last step is the only thing the file cannot work out for itself. A person
knows which side is the front; a heuristic looking for the biggest wall or the
most windows gets it wrong on exactly the buildings that matter.

## What to select

* **Start the box at the floor course**, not at the ground under it. Layer 0 of
  a blueprint is "the floor" — villages level a plot and put layer 0 on it.
* **Include the air around the roof.** Everything in the box is written, air
  included, so anything you leave out stays as whatever was there before.
* **Keep it small.** A 9×9 footprint is a large building for a village street,
  and plots that big fail their survey on any slope — you get fewer houses. 5×7
  to 7×9 sits well.
* Stairs and ladders are turned with the building. Everything else has no
  orientation, so it does not need to.

## How they are used

Save one and every house in every village is that house. Save six and the
village picks between them. Delete them all and the game falls back to the ten
coded archetypes in `village.js` — which is also what a fresh clone does, so
the generator still works with this directory empty.

The doorway is found rather than marked: a gap you can walk through in the
front wall, standing on the floor, with something solid either side. If your
building has no such gap the middle of the front is used, which is what you
want for a barn with a cart opening.

## The file

```json
{
  "version": 1,
  "name": "cottage-01",
  "size": [w, d, hgt],
  "front": 0,               // 0..3 = +u, -u, +v, -v
  "door": { "u": 8, "v": 3, "h": 1 },
  "runs": [[blockId, count], ...]   // u-major, then v, then h
}
```

Run-length encoded because a building is mostly air and mostly repeated wall,
and pairs rather than a packed string so a diff shows what actually changed.
`index.json` is rewritten by the server every time one is saved; the game reads
it instead of asking for a directory listing.
