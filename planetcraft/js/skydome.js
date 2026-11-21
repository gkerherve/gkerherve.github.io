// THE SKY, as a sky.
//
// It was one colour: `scene.background`, the same blue from the ground under
// your boots to the point straight overhead, and the fog was that colour too.
// Every outdoor picture in the game was a village cut out and laid on a sheet
// of blue card. A real sky is three things that flat colour is not, and all
// three are cheap:
//
//   * DEEPER OVERHEAD, PALER AT THE HORIZON. You look through far more air
//     sideways than upward, and air scatters — so the zenith is the darkest,
//     most saturated blue in the picture and the horizon is washed toward
//     white. That gradient is most of what makes a view read as having
//     distance in it.
//   * A GLOW ROUND THE SUN. The disc is a sprite; the light it throws into
//     the air around it was missing, so it sat in the sky like a coin.
//   * A WARM BAND AT DUSK, low and on the sun's side only. The whole sky
//     going orange at once is a filter; the west going orange while the east
//     is already blue is a sunset.
//
// It is one sphere drawn first, at no depth, with the camera's rotation and
// none of its position — a skybox — and its colours are made from the sky
// colour the game already works out each frame (the preset's day, sunset and
// night, the storm's gloom, the lightning), so an ash world's noon is still
// an ash world's noon. `horizonOf` is the same arithmetic the shader does at
// the horizon, for the fog: far ground fades into the band of sky it is seen
// against, which is what haze is.
//
// A PICTURE ONLY. Nothing reads the sky back: the daylight, the shadows and
// the hour are all still the sun's angle, exactly as they were.

import * as THREE from 'three';

const VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = position;
    // the camera's rotation and none of its position, pinned to the far plane
    vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
    gl_Position = p.xyww;
  }
`;

const FRAG = /* glsl */`
  uniform vec3 uSky;      // the game's own sky colour, this frame
  uniform vec3 uUp;       // up, where the player stands
  uniform vec3 uSun;      // toward the sun
  uniform vec3 uWarm;     // the preset's sunset colour
  uniform float uDay;     // 0 at night, 1 with the sun well up
  uniform float uDusk;    // 1 with the sun on the horizon, 0 away from it
  varying vec3 vDir;

  void main() {
    vec3 d = normalize(vDir);
    float h = dot(d, uUp);
    float s = max(dot(d, uSun), 0.0);
    // overhead: darker and bluer, by day; at night the sky is its own dark
    vec3 zen = uSky * mix(vec3(1.0), vec3(0.46, 0.60, 0.90), uDay);
    // the horizon: washed toward white, by day
    vec3 hor = mix(uSky, vec3(1.0), 0.34 * uDay);
    float up = pow(clamp(h, 0.0, 1.0), 0.48);
    vec3 col = mix(hor, zen, up);
    // dusk: warm, low, and on the sun's side of the sky
    float low = 1.0 - smoothstep(0.0, 0.42, h);
    float side = 0.25 + 0.75 * pow(s, 2.0);
    col = mix(col, uWarm, uDusk * low * side * 0.78);
    // ...and the far side goes violet as the warm side goes gold
    col = mix(col, col * vec3(0.80, 0.78, 1.12), uDusk * (1.0 - s) * up * 0.5);
    // the air round the sun
    vec3 glow = mix(vec3(1.0, 0.96, 0.86), uWarm, uDusk);
    col += glow * (pow(s, 220.0) * 0.40 + pow(s, 18.0) * 0.09) * max(uDay, uDusk);
    // below the horizon there is only ground and haze; keep it the haze
    if (h < 0.0) col = mix(col, hor, clamp(-h * 6.0, 0.0, 1.0) * (1.0 - uDusk * 0.5));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
    // A HAIR OF NOISE, after the screen's own curve. A slow gradient in
    // eight bits a channel draws itself as contour lines across the sky —
    // measured in the first render of this: two clean arcs over a village —
    // and half a level of noise a pixel is what turns the steps back into a
    // slope. It is under anything an eye can see as grain.
    float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    gl_FragColor.rgb += (n - 0.5) / 160.0;
  }
`;

export function createSkyDome(scene) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: {
      uSky: { value: new THREE.Color(0x7fc3ec) },
      uUp: { value: new THREE.Vector3(0, 1, 0) },
      uSun: { value: new THREE.Vector3(1, 0, 0) },
      uWarm: { value: new THREE.Color(0xff8c4a) },
      uDay: { value: 1 }, uDusk: { value: 0 },
    },
    side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;         // before everything: it is behind everything
  mesh.matrixAutoUpdate = false;
  mesh.visible = false;
  mesh.name = 'sky';
  scene.add(mesh);
  return { mesh, uniforms: mat.uniforms };
}

// How far the day and the dusk have got, off the sun's elevation where the
// player stands — the two numbers the shader and the fog both turn on.
export function skyPhase(elev) {
  const day = THREE.MathUtils.clamp((elev + 0.05) / 0.30, 0, 1);
  const dusk = Math.max(0, 1 - Math.abs(elev - 0.02) / 0.26);
  return { day, dusk: dusk * dusk };
}

// The colour of the sky AT THE HORIZON, for the fog — the same sum the
// shader does there, so the far ground fades into what it is seen against.
const _white = new THREE.Color(1, 1, 1);
export function horizonOf(sky, warm, phase, out) {
  out.copy(sky).lerp(_white, 0.34 * phase.day);
  return out.lerp(warm, phase.dusk * 0.30);
}
