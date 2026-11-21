// flatten.js — a round planet that looks flat from the ground.
//
// The world really is a sphere: the physics, the cell mapping, the terrain and
// every test in tests.html stay exactly as they are. This file changes only
// what the GPU draws, and only in first person, by unrolling the globe about
// wherever the player is standing.
//
// The mapping is an azimuthal equidistant projection centred on the player —
// which is a long name for two rules that are easy to check:
//
//   * a point's ARC distance along the surface becomes its straight-line
//     distance on the flat map, so nothing moves nearer or further away;
//   * a point's HEIGHT above the mean radius is kept exactly, so a hill is
//     still as tall as it was and the ground under your feet does not move.
//
// The player's own position maps to itself, so there is no seam at the eye.
// The horizon stops falling away and becomes the flat line it is in a game
// with no curvature at all, and everything in between rises to meet it.
//
// --- why a shader ------------------------------------------------------------
//
// Bending the world on the CPU would mean rewriting every chunk's vertices
// every time the player moved — hundreds of thousands of them, several times
// a second. In the vertex shader it is one acos and one normalize per vertex,
// paid only for what is actually on screen, and the geometry in memory is
// never touched. The uniforms are SHARED between every material that opts in,
// so one write a frame updates the whole world at once.
//
// --- what has to opt in ------------------------------------------------------
//
// Anything drawn in world space, or it will not agree with the ground:
// terrain, water, lava and grass tufts go through the shader; entities,
// vehicles and other small movable things are re-placed on the CPU by
// flattenPoint/flattenObject, since bending a villager's own half-metre of
// geometry is invisible and only where he stands matters.

import * as THREE from 'three';

// The uniforms every opted-in material shares. They are the SAME objects in
// every shader, so `update()` writes them once and the whole world follows.
export const uniforms = {
  uFlatOrigin: { value: new THREE.Vector3() },
  uFlatUp: { value: new THREE.Vector3(0, 1, 0) },
  uFlatR: { value: 1 },
  uFlatOn: { value: 0 },
};

// GLSL, injected above main() in every vertex shader that opts in.
export const GLSL = `
uniform vec3 uFlatOrigin;
uniform vec3 uFlatUp;
uniform float uFlatR;
uniform float uFlatOn;

vec3 flattenWorld(vec3 P) {
  if (uFlatOn < 0.5) return P;
  float r = length(P);
  if (r < 1e-3) return P;
  // the angle from the player's own up, and the arc it stands for
  float c = clamp(dot(P / r, uFlatUp), -1.0, 1.0);
  float arc = acos(c) * uFlatR;
  // the direction to walk that arc in, in the plane through the player
  vec3 t = P - uFlatUp * dot(P, uFlatUp);
  float tl = length(t);
  vec3 td = tl > 1e-4 ? t / tl : vec3(0.0);
  // height above the sphere is carried straight across
  return uFlatOrigin + td * arc + uFlatUp * (r - length(uFlatOrigin));
}
`;

// Hook a stock three.js material up to the projection. Safe to call twice.
export function flattenMaterial(material) {
  if (!material || material.userData.flattened) return material;
  material.userData.flattened = true;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', `${GLSL}\nvoid main() {`)
      .replace('#include <begin_vertex>',
        '#include <begin_vertex>\n  transformed = flattenWorld(transformed);');
  };
  // three caches compiled programs by this key, so two materials that differ
  // only in whether they were flattened must not share one
  material.customProgramCacheKey = () => 'flat';
  material.needsUpdate = true;
  return material;
}

// Hook up a material whose geometry is NOT already in world space.
//
// flattenMaterial above bends `transformed`, which is OBJECT space, and that
// is only the world position when the mesh sits at the origin under identity
// parents. The chunks do, which is why it works for them and why the village
// boards go to the trouble of baking world coordinates into their vertices.
//
// The clouds cannot: they are instanced slabs — one unit box, a thousand
// instance matrices — under a group the wind turns. Their world position is
// not known until after `instanceMatrix` and `modelMatrix`, so the bend has
// to happen there instead, which means replacing project_vertex rather than
// adding to begin_vertex.
export function flattenMaterialWorld(material) {
  if (!material || material.userData.flattened) return material;
  material.userData.flattened = true;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', `${GLSL}\nvoid main() {`)
      .replace('#include <project_vertex>', `
  vec4 flatWorld = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    flatWorld = batchingMatrix * flatWorld;
  #endif
  #ifdef USE_INSTANCING
    flatWorld = instanceMatrix * flatWorld;
  #endif
  flatWorld = modelMatrix * flatWorld;
  flatWorld.xyz = flattenWorld(flatWorld.xyz);
  vec4 mvPosition = viewMatrix * flatWorld;
  gl_Position = projectionMatrix * mvPosition;
`);
  };
  material.customProgramCacheKey = () => 'flatWorld';
  material.needsUpdate = true;
  return material;
}

/** Turn the projection on or off. Off is the true globe. */
export function setFlatten(on) {
  uniforms.uFlatOn.value = on ? 1 : 0;
  return !!on;
}

export const isFlat = () => uniforms.uFlatOn.value > 0.5;

/**
 * Point the projection at wherever the player is standing. Call once a frame,
 * before anything is drawn or any object is re-placed.
 */
export function update(playerPos, radius) {
  uniforms.uFlatOrigin.value.copy(playerPos);
  uniforms.uFlatUp.value.copy(playerPos).normalize();
  uniforms.uFlatR.value = radius;
}

// --- the same maths on the CPU -----------------------------------------------

const _t = new THREE.Vector3();
const _td = new THREE.Vector3();

/** Where a world point is drawn. Returns `out` (or a new vector). */
export function flattenPoint(p, out = new THREE.Vector3()) {
  if (!isFlat()) return out.copy(p);
  const origin = uniforms.uFlatOrigin.value;
  const up = uniforms.uFlatUp.value;
  const r = p.length();
  if (r < 1e-3) return out.copy(p);
  const c = THREE.MathUtils.clamp(p.dot(up) / r, -1, 1);
  const arc = Math.acos(c) * uniforms.uFlatR.value;
  _t.copy(p).addScaledVector(up, -p.dot(up));
  const tl = _t.length();
  _td.copy(tl > 1e-4 ? _t.divideScalar(tl) : _t.set(0, 0, 0));
  return out.copy(origin).addScaledVector(_td, arc)
    .addScaledVector(up, r - origin.length());
}

const _q = new THREE.Quaternion();
const _objUp = new THREE.Vector3();

/**
 * Re-place a small world-anchored object: an entity, a vehicle, a boat.
 *
 * Its geometry is left alone — half a metre of villager does not curve
 * measurably — so only two things change: where it stands, and the fact that
 * on the flat map everything stands along the PLAYER's up rather than its
 * own. The second is a swing rotation from one up to the other, which keeps
 * whatever heading the object had already worked out for itself.
 */
export function flattenObject(obj, worldPos = obj.position) {
  if (!isFlat() || !obj) return obj;
  _objUp.copy(worldPos).normalize();
  _q.setFromUnitVectors(_objUp, uniforms.uFlatUp.value);
  obj.quaternion.premultiply(_q);
  flattenPoint(worldPos, obj.position);
  return obj;
}
