// raycast.js — block targeting on the cube-sphere.
//
// The grid is curved, so the straight-line DDA used for an axis-aligned grid
// does not apply. Reach is only a few blocks, so marching in small steps and
// noting each new cell entered is both simple and accurate to well under a
// block. Water is see-through for targeting, as in Minecraft.

import { BLOCK, cellAtWorld } from './cubesphere.js';

const STEP = 0.04;

export function raycastVoxel(planet, origin, dir, maxDist = 6) {
  let prev = null;
  for (let t = 0; t <= maxDist; t += STEP) {
    const x = origin.x + dir.x * t;
    const y = origin.y + dir.y * t;
    const z = origin.z + dir.z * t;
    const cell = cellAtWorld(x, y, z);
    if (!cell) { prev = null; continue; }
    if (prev && cell[0] === prev[0] && cell[1] === prev[1]
        && cell[2] === prev[2] && cell[3] === prev[3]) continue;

    const b = planet.get(cell[0], cell[1], cell[2], cell[3]);
    if (b !== BLOCK.AIR && b !== BLOCK.WATER) return { hit: cell, prev };
    prev = cell;
  }
  return null;
}
