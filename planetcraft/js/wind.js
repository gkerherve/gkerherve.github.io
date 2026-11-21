// wind.js — the air made visible: grass, flowers, wheat and leaves move.
//
// Nothing here changes the world, only the drawing of it, and only by
// fractions of a block: the geometry in memory stays exactly where the mesher
// put it, and a vertex leans in the vertex shader the same way the flat
// horizon bends there (see flatten.js for why the shader is the right place).
// Collision, raycasts and the ghost are all unaffected — you cannot miss a
// flower because it happened to be leaning.
//
// Two different kinds of thing move, through two different doors:
//
//   * CROSS-PLANE PLANTS (tufts, flowers, wheat, saplings, mushrooms) carry a
//     per-vertex `sway` attribute the mesher writes: 0 at the root, up to 1 at
//     the tip, scaled per species — wheat rolls, a mushroom barely nods. The
//     root staying put is what keeps a plant planted.
//
//   * LEAVES are ordinary cubes inside the big solid mesh, so they cannot
//     carry an attribute of their own without a second mesh pass. But every
//     face's UVs live inside its own atlas tile, so "is this vertex a leaf" is
//     a rectangle test on the UV — the leaf tile's corner coordinates go in as
//     a uniform and only those faces move. The amplitude is small enough that
//     a canopy shimmers rather than tears where it meets its trunk.
//
// The gust itself is three sines at unrelated frequencies, phased by world
// position, so waves of movement travel across a meadow instead of every
// blade metronoming in step. Direction is the wind's fixed heading projected
// onto the local ground plane — on a sphere "sideways" is a different way
// everywhere, and without the projection plants at the poles would pump
// straight up and down.

import * as THREE from 'three';

// Shared by every material that opts in, so one write a frame moves the
// whole planet's foliage at once — the same trick flatten.js uses.
export const uniforms = {
  uWindTime: { value: 0 },
  // the leaf tile's [uMin, vMin, uMax, vMax] in the atlas; set by main.js
  // from tileUV so it survives the atlas growing more rows
  uLeafRect: { value: new THREE.Vector4(-1, -1, -1, -1) },
  // 1 on a sphere, 0 on the drafting table, where "up" is simply +y
  uWindSphere: { value: 1 },
};

const GUST = `
uniform float uWindTime;
uniform float uWindSphere;

// how hard the wind is blowing at this point, right now: three sines at
// unrelated frequencies, phased by position so gusts travel
float windGust(vec3 P) {
  float ph = dot(P, vec3(0.61, 0.53, 0.47));
  return sin(uWindTime * 1.5 + ph)
       + 0.55 * sin(uWindTime * 3.1 + ph * 1.7)
       + 0.25 * sin(uWindTime * 5.7 + ph * 2.6);
}

// the wind's heading, flattened onto the ground the vertex stands on
vec3 windDir(vec3 P) {
  vec3 dir = vec3(0.74, 0.12, 0.66);
  vec3 up = uWindSphere > 0.5 ? normalize(P) : vec3(0.0, 1.0, 0.0);
  vec3 t = dir - up * dot(dir, up);
  float tl = length(t);
  return tl > 1e-4 ? t / tl : vec3(0.0);
}
`;

// Wrap a material the way flattenMaterial does, composing with whatever was
// hooked on before — flatten included, in either order. The injection point
// is the same <begin_vertex> line flatten appends to; because a replace lands
// BEFORE anything appended earlier, wind applied after flatten runs first in
// the shader, which is the order that matters: lean in sphere space, then
// project the leaning world flat.
function hook(material, glsl, line, cacheKey) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', `${glsl}\nvoid main() {`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${line}`);
  };
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey =
    () => `${prevKey ? prevKey() : ''}-${cacheKey}`;
  material.needsUpdate = true;
  return material;
}

/** The cross-plane pass: plants lean by their own `sway` attribute. */
export function windPlantMaterial(material) {
  return hook(material, `${GUST}
attribute float sway;
vec3 windPlant(vec3 P) {
  if (sway <= 0.0) return P;
  return P + windDir(P) * (windGust(P) * 0.075 * sway);
}`, '  transformed = windPlant(transformed);', 'windplant');
}

/** The solid pass: only faces wearing the leaf tile move, and gently. */
export function windLeafMaterial(material) {
  return hook(material, `${GUST}
uniform vec4 uLeafRect;
vec3 windLeaf(vec3 P, vec2 tuv) {
  if (tuv.x < uLeafRect.x || tuv.x > uLeafRect.z
    || tuv.y < uLeafRect.y || tuv.y > uLeafRect.w) return P;
  return P + windDir(P) * (windGust(P) * 0.035);
}`, '  transformed = windLeaf(transformed, uv);', 'windleaf');
}

/** Point the leaf test at the leaf tile. Call once, after the atlas exists. */
export function setLeafRect(a, b) {
  uniforms.uLeafRect.value.set(
    Math.min(a[0], b[0]), Math.min(a[1], b[1]),
    Math.max(a[0], b[0]), Math.max(a[1], b[1]));
}

export function setSphere(on) { uniforms.uWindSphere.value = on ? 1 : 0; }

/** Advance the wind. Call once a frame, in or out of play. */
export function update(dt) { uniforms.uWindTime.value += dt; }
