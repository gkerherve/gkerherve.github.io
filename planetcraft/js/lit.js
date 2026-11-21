// lit.js — the one material in this game that knows about light.
//
// For most of this project's life nothing was lit. Every surface was a flat
// MeshBasicMaterial wearing the shade the mesher baked into it, and for every
// style but one that is still what the art IS — there is no diffuse term in
// the ordinary path below, and there must not be: put one on 16-texel blocks
// and every flat face starts sliding through a gradient as the day turns,
// which is the look those styles exist to avoid.
//
// What a surface does get in that path is three things that are all the same
// shape — a number that scales what was already there:
//
//   * the day/night dim, which used to be `solidMaterial.color.setScalar`
//   * the sun's shadow, 1 in the light and `uShadow` in it
//   * the lamps, a warm pool ADDED on top, because a lamp puts light INTO the
//     dark and can only ever make a surface brighter than the night left it
//
// The terrain, the grass and every body in the world go through here, which
// is the point of the file. They were three separate material systems before
// and only the terrain ever heard about any of it: a villager standing under
// a lantern stayed the colour of midnight, and one standing in the shadow of
// a house was as bright as one in the sun.
//
// --- the Realistic style, which IS lit -----------------------------------------
//
// The exception, and a deliberate one: the Realistic style draws its blocks
// with photographs, and a photograph under flat light looks like a photograph
// of a wall stuck onto a box. So under LIT_REAL a block is lit the way a real
// surface is — the sun (or the moon) through its normal map, so a mortar joint
// is dark on the side away from the light and a bark ridge catches it; the sky
// filling in the shadows from above and the ground from below; a specular
// highlight off anything glossy; soft-edged shadows; and the lamps falling on
// the faces that face them. The face shading the mesher bakes is switched off
// for that style (see its `shade` in textures.js) because the light does it
// now, and does it properly.
//
// Only the TERRAIN takes LIT_REAL — the chunks and the cross-plane plants, see
// `terrain` in makeLit. Bodies keep the ordinary path: their colours carry
// baked shading of their own, and lighting them again would shade them twice.
//
// --- what is shared and what is not -----------------------------------------
//
// `shared` holds ONE object per uniform, assigned into every material this
// file makes, so a single write drives the whole world. The fog and lights
// blocks cannot be shared — three clones and refreshes those per material —
// so they are merged in fresh each time and only our own uniforms are aliased.

import * as THREE from 'three';

// How many lamps a fragment will consider. A fixed-size array walked per
// pixel: past a dozen on screen the far ones contribute a texel of brightness
// each and nobody could name which lamp went out.
export const LAMP_SLOTS = 16;

// ...and how many of them THROW A SHADOW.
//
// This is the expensive number in the whole renderer and it is small on
// purpose. A point light shadows in every direction at once, so three.js
// renders it as a CUBE — six depth passes over every caster in range, per
// light, per frame. The sun costs one. Two lamps cost twelve.
//
// So the NEAREST ONE casts and the rest only light. It was two, and two is
// twelve depth passes over every caster in range every frame — measured at
// twenty-five thousand draw calls a frame on a large world, which is a frame
// rate low enough that the camera's own smoothing reads as a shake. One is
// six, and the second lamp was never the one you were standing under. That is not a compromise
// anybody has to squint at: a shadow you can read is one thrown by a lamp you
// are standing under, and the fourteen further off are contributing a wash
// you could not trace to a source anyway. `updateLampLight` sorts by distance,
// so the two that cast are always the two nearest your eye.
export const LAMP_CASTERS = 1;

export const shared = {
  // the day/night dim. Named `diffuse` because that is what it replaced.
  diffuse: { value: new THREE.Color(1, 1, 1) },
  uShadow: { value: 0.55 },
  uLamp: { value: Array.from({ length: LAMP_SLOTS }, () => new THREE.Vector4()) },
  uLampN: { value: 0 },
  // one gain per lamp, NOT one for all of them. A lantern on a post is only
  // worth drawing after dark; a lamp in your fist has to work at noon four
  // hundred blocks down a mine, where the sun is as high as it ever gets and
  // means nothing at all. One global fade could serve the first or the second
  // and never both.
  uLampGain: { value: new Float32Array(LAMP_SLOTS) },
  uLampTint: { value: new THREE.Color(1.0, 0.74, 0.42) },
  uLampBright: { value: 0 },
};

// The Realistic style's own uniforms, filled by realism.js. Shared the same
// way: one object each, aliased into every terrain material.
export const realShared = {
  uRealAlb: { value: null },         // the photographs' colour, one layer a block
  uRealMat: { value: null },         // normal.xy, roughness, height
  uRealProps: { value: null },       // per tile: which layer, how it behaves
  uRealReady: { value: 0 },          // 0 until the photographs are up
  uRealGrid: { value: new THREE.Vector2(4, 78) },
  uRealInset: { value: 0.5 / 32 },
  uKeyDir: { value: new THREE.Vector3(0, 1, 0) },     // the sun, or the moon
  uKeyColor: { value: new THREE.Color(1, 1, 1) },
  uSkyAmb: { value: new THREE.Color(0.3, 0.35, 0.45) },
  uGroundAmb: { value: new THREE.Color(0.12, 0.1, 0.08) },
  uRealUp: { value: new THREE.Vector3(0, 1, 0) },
  uRealUpMode: { value: 0 },         // 1: up is away from the planet's centre
  uExposure: { value: 1 },
  uShadowTexel: { value: 0.05 },     // world size of one shadow-map texel
  uRealLampGain: { value: 2.2 },
  uRealN: { value: 256 },            // texels a block in the arrays
  uShadowTaps: { value: 12 },        // taps in the soft shadow; fewer is lighter
};

const VERT = `
  #include <common>
  #include <fog_pars_vertex>
  #include <shadowmap_pars_vertex>
  #ifdef LIT_VCOL
    varying vec3 vCol;
  #endif
  #ifdef LIT_MAP
    varying vec2 vUv;
  #endif
  varying vec3 vWorld;
  #ifdef LIT_REAL
    // Where the vertex REALLY is, before the wind leans it or the flat
    // horizon unrolls it: the one position that does not move when the
    // player does, which is what a pattern laid across the world has to be
    // measured in or it swims.
    varying vec3 vTrue;
    // The UV again, CENTROID-sampled: always taken from inside the triangle.
    // With antialiasing on, a pixel on a face's edge is shaded at its centre
    // even when only a corner of it is covered, and the ordinary UV there is
    // extrapolated off the face — off the TILE, into its neighbour in the
    // atlas, which is as often as not an icon with a transparent ground. The
    // cut-out test then threw the pixel away and the sky showed through in
    // a fine dotted grid along every block edge. Which tile, and where in it,
    // comes from this; only the gradients come from vUv.
    centroid varying vec2 vUvC;
  #endif
  #ifdef LIT_BODY
    varying vec3 vObjN;
  #endif
  void main() {
    #ifdef LIT_MAP
      vUv = uv;
    #endif
    #ifdef LIT_VCOL
      vCol = color;
    #endif
    #ifdef LIT_REAL
      vTrue = (modelMatrix * vec4(position, 1.0)).xyz;
      vUvC = uv;
    #endif
    #ifdef LIT_BODY
      vObjN = normal;
    #endif
    // The include, and NOT a hand-written "vec3 transformed = position", even
    // though that is all it expands to. flatten.js draws the round planet flat
    // from the ground by REPLACING this chunk, and it patches by string match,
    // so spelling the line out by hand silently opts the surface out of the
    // projection and the horizon curves away again.
    #include <begin_vertex>
    vec3 objectNormal = vec3(0.0, 1.0, 0.0);
    vec3 transformedNormal = objectNormal;
    // Everything is measured in the FLATTENED world, including the shadow.
    //
    // That is not the obvious choice and it is the only consistent one. The
    // terrain is bent here in the vertex shader; a body is bent on the CPU
    // before it is drawn, so its modelMatrix already carries the bent
    // position. Neither knows about the other. If the shadow were looked up
    // in true spherical space the terrain could do it and a villager could
    // not, and the lamps would light the ground in one place and the man
    // standing on it in another. So the depth pass is bent too (see the
    // flattened customDepthMaterial in main.js) and the lamp positions are
    // bent before they are uploaded. With the flat horizon off, flattenWorld
    // is the identity and all of this is the plain world again.
    vec4 worldPosition = modelMatrix * vec4( transformed, 1.0 );
    vWorld = worldPosition.xyz;
    #include <shadowmap_vertex>
    vec4 mvPosition = modelViewMatrix * vec4( transformed, 1.0 );
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

// The Realistic style's light, as functions the fragment shader calls — the
// same for the ground and for everything standing on it.
const REAL_LIGHT_PARS = `
  uniform vec3 uKeyDir;
  uniform vec3 uKeyColor;
  uniform vec3 uSkyAmb;
  uniform vec3 uGroundAmb;
  uniform vec3 uRealUp;
  uniform float uRealUpMode;
  uniform float uExposure;
  uniform float uShadowTexel;
  uniform float uRealLampGain;
  uniform float uShadowTaps;
  #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
    // the same matrix the vertex shader has, declared here so the lookup can
    // be made per fragment from a position nudged off the surface along the
    // fragment's own normal — which the vertex shader never has
    uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
  #endif

  // a disc of taps for the soft shadow, turned per pixel so its pattern
  // never shows as a pattern
  const vec2 PDISK[12] = vec2[12](
    vec2(-0.326, -0.406), vec2(-0.840, -0.074), vec2(-0.696, 0.457),
    vec2(-0.203, 0.621), vec2(0.962, -0.195), vec2(0.473, -0.480),
    vec2(0.519, 0.767), vec2(0.185, -0.893), vec2(0.507, 0.064),
    vec2(0.896, 0.412), vec2(-0.322, -0.933), vec2(-0.792, -0.598));
  float realIGN(vec2 p) {
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
  }

  // How much of the key light reaches this point: a soft-edged lookup in the
  // sun's shadow map, taken from a point stood a little off the surface along
  // its normal — the offset the vertex shader could never make, because the
  // chunks carry no normals — so a lit face does not shadow itself.
  float realShadow(vec3 P, vec3 Ng) {
    #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
      DirectionalLightShadow s = directionalLightShadows[ 0 ];
      vec3 Pb = P + Ng * uShadowTexel * 1.6 + uKeyDir * uShadowTexel * 0.6;
      vec4 sc = directionalShadowMatrix[ 0 ] * vec4(Pb, 1.0);
      sc.xyz /= sc.w;
      if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) return 1.0;
      float z = sc.z + s.shadowBias;
      vec2 ts = 1.6 / s.shadowMapSize;
      float a = realIGN(gl_FragCoord.xy) * 6.2831853;
      mat2 rot = mat2(cos(a), sin(a), -sin(a), cos(a));
      float sum = 0.0;
      // a lower detail takes fewer (REAL_DETAIL): four is the same soft
      // edge a little grainier, one is a plain hard shadow
      for (int i = 0; i < 12; i++) {
        if (float(i) >= uShadowTaps) break;
        sum += texture2DCompare(directionalShadowMap[ 0 ], sc.xy + rot * PDISK[i] * ts, z);
      }
      return sum / max(uShadowTaps, 1.0);
    #else
      return 1.0;
    #endif
  }

  // Khronos PBR Neutral: a photograph's colours come through as they are in
  // ordinary light, and only what is brighter than white — the sun off a wet
  // stone, a glint on ore — is rolled off instead of clipped.
  vec3 realTone(vec3 color) {
    const float startCompression = 0.8 - 0.04;
    const float desaturation = 0.15;
    float x = min(color.r, min(color.g, color.b));
    float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
    color -= offset;
    float peak = max(color.r, max(color.g, color.b));
    if (peak < startCompression) return color;
    const float d = 1.0 - startCompression;
    float newPeak = 1.0 - d * d / (peak + d - startCompression);
    color *= newPeak / peak;
    float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
    return mix(color, newPeak * vec3(1.0), g);
  }

  // A normal from a tangent-space one, through a frame built from screen
  // derivatives of the position and of the texture coordinate — so nothing
  // has to be stored per vertex.
  vec3 realPerturb(vec3 Ng, vec3 dpx, vec3 dpy, vec2 gdx, vec2 gdy, vec3 nT) {
    vec3 dp2perp = cross(dpy, Ng), dp1perp = cross(Ng, dpx);
    vec3 T = dp2perp * gdx.x + dp1perp * gdy.x;
    vec3 B = dp2perp * gdx.y + dp1perp * gdy.y;
    float im = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-24));
    return normalize(T * im * nT.x + B * im * nT.y + Ng * nT.z);
  }

  // The light on a surface: the key light through its normal, soft-shadowed;
  // the sky and the ground filling in from above and below; a GGX highlight
  // and the sky reflected in anything glossy; and the lamps, each on the
  // faces that face it. The albedo in linear light, the result before tone.
  vec3 realShade(vec3 albedo, vec3 N, vec3 Ng, float rough, float metal,
                 float foliage, vec3 up) {
    vec3 L = uKeyDir;
    float NdL = dot(N, L);
    // the face as a whole must face the light before its bumps can catch it,
    // or a wall in shadow glitters with texels whose normals tip sunward
    float facing = smoothstep(-0.04, 0.12, dot(Ng, L));
    float sh = realShadow(vWorld, Ng);
    float direct;
    if (foliage > 0.5) {
      // light through a leaf as well as off it
      direct = (max(NdL, 0.0) * 0.7 + 0.3) * mix(facing, 1.0, 0.65);
    } else {
      direct = max(NdL, 0.0) * facing;
    }
    direct *= sh;
    float hemi = dot(N, up) * 0.5 + 0.5;
    vec3 amb = mix(uGroundAmb, uSkyAmb, hemi);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 H = normalize(L + V);
    float a2 = max(rough * rough, 0.003);
    a2 *= a2;
    float NdH = max(dot(N, H), 0.0);
    float NdV = max(dot(N, V), 1e-3);
    float nl = max(NdL, 0.0);
    float dd = NdH * NdH * (a2 - 1.0) + 1.0;
    float D = a2 / (3.14159265 * dd * dd);
    float kk = rough * rough * 0.5 + 0.0001;
    float Vis = 0.25 / ((nl * (1.0 - kk) + kk) * (NdV * (1.0 - kk) + kk));
    vec3 F0 = mix(vec3(0.04), albedo, metal);
    float LdH = max(dot(L, H), 0.0);
    vec3 F = F0 + (1.0 - F0) * pow(1.0 - LdH, 5.0);
    vec3 spec = min(D * Vis, 60.0) * F * nl * facing * sh * uKeyColor;
    // the world reflected by anything glossy, strongest at a glancing angle:
    // the sky above the reflection's horizon and the ground below it. The sky
    // as SEEN is brighter than the light it sheds on a wall, which is what
    // uSkyAmb is — metal reflecting only that came out a dark navy blue, a
    // pickaxe that looked painted. A rough surface still reflects, blurred.
    // The Fresnel term is the rough-surface one: a rough surface does not
    // turn to a mirror at a glancing angle, it only gets as glossy as its
    // roughness lets it — without that a canopy of leaves seen edge on came
    // up frosted white. And a rough non-metal spreads its reflection so thin
    // it is next to nothing; it is metal that has to keep it.
    vec3 Fv = F0 + (max(vec3(1.0 - rough), F0) - F0) * pow(1.0 - NdV, 5.0);
    vec3 Rv = reflect(-V, N);
    float hemiR = smoothstep(0.3, 0.7, dot(Rv, up) * 0.5 + 0.5);
    vec3 world = mix(uGroundAmb * 1.5, uSkyAmb * 2.4, hemiR);
    float spread = mix((1.0 - rough) * (1.0 - rough), mix(1.0, 0.35, rough), metal);
    vec3 env = world * Fv * spread;
    vec3 col = albedo * (1.0 - metal) * (uKeyColor * direct + amb) + spec + env;
    // the lamps, each lighting the faces that face it
    if (uLampBright > 0.001) {
      float vis0 = 1.0;
      #if NUM_POINT_LIGHT_SHADOWS > 0
        vis0 = getPointShadow(pointShadowMap[0], pointLightShadows[0].shadowMapSize,
          pointLightShadows[0].shadowBias, pointLightShadows[0].shadowRadius,
          vPointShadowCoord[0], pointLightShadows[0].shadowCameraNear,
          pointLightShadows[0].shadowCameraFar);
      #endif
      float pool = 0.0;
      for (int i = 0; i < ${LAMP_SLOTS}; i++) {
        if (i >= uLampN) break;
        vec4 Lp = uLamp[i];
        if (Lp.w <= 0.0) continue;
        vec3 lv = Lp.xyz - vWorld;
        float d = length(lv);
        float k = clamp(1.0 - d / Lp.w, 0.0, 1.0);
        float ndl = max(dot(N, lv / max(d, 1e-3)), 0.0) * 0.8 + 0.2;
        float v = i == 0 ? vis0 : 1.0;
        pool += k * k * uLampGain[i] * ndl * v;
      }
      col += albedo * uLampTint * min(pool, 1.6) * uLampBright * uRealLampGain;
    }
    return col;
  }
`;

// ...and what only the terrain needs: the photographs' arrays and which tile
// is which.
const REAL_TILE_PARS = `
  uniform highp sampler2DArray uRealAlb;
  uniform highp sampler2DArray uRealMat;
  uniform highp sampler2D uRealProps;
  uniform float uRealReady;
  uniform vec2 uRealGrid;
  uniform float uRealInset;
  uniform float uRealN;
  varying vec3 vTrue;
  centroid varying vec2 vUvC;

  // Slow tone variation laid across the world itself, so a meadow or a cliff
  // of one block does not print the same photograph in a grid. Measured in
  // the TRUE position, which is still when the player moves.
  float realHash(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }
  float realNoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(realHash(i), realHash(i + vec3(1, 0, 0)), f.x),
                   mix(realHash(i + vec3(0, 1, 0)), realHash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(realHash(i + vec3(0, 0, 1)), realHash(i + vec3(1, 0, 1)), f.x),
                   mix(realHash(i + vec3(0, 1, 1)), realHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
`;

const FRAG = `
  #include <common>
  #include <packing>
  #include <fog_pars_fragment>
  #include <bsdfs>
  #include <lights_pars_begin>
  #include <shadowmap_pars_fragment>
  #include <shadowmask_pars_fragment>
  uniform vec3 diffuse;
  uniform vec3 uTint;
  uniform float uShadow;
  uniform vec4 uLamp[${LAMP_SLOTS}];
  uniform int uLampN;
  uniform float uLampGain[${LAMP_SLOTS}];
  uniform vec3 uLampTint;
  uniform float uLampBright;
  #ifdef LIT_MAP
    uniform sampler2D map;
    varying vec2 vUv;
  #endif
  #ifdef LIT_VCOL
    varying vec3 vCol;
  #endif
  varying vec3 vWorld;
  #if defined( LIT_REAL ) || defined( LIT_BODY )
    ${REAL_LIGHT_PARS}
  #endif
  #ifdef LIT_REAL
    ${REAL_TILE_PARS}
  #endif
  #ifdef LIT_BODY
    uniform sampler2D uBodyNR;       // normal.xy, roughness, metal — or flat
    varying vec3 vObjN;
  #endif
  // How much of lamp i's pool this fragment does NOT get, because something
  // is between it and the lamp. 'vis' is 1 in the light and 0 in shadow.
  float lampBlocked(int i, vec4 L, float gain, float vis) {
    if (L.w <= 0.0 || i >= uLampN) return 0.0;
    float d = distance(vWorld, L.xyz);
    float k = clamp(1.0 - d / L.w, 0.0, 1.0);
    return k * k * gain * (1.0 - vis);
  }
  void main() {
  #if defined( LIT_REAL ) && defined( LIT_MAP )
    // --- the Realistic style -------------------------------------------------
    //
    // Every derivative first, before anything can discard: a derivative taken
    // after a neighbour in the pixel quad has gone is undefined.
    vec3 dpx = dFdx(vWorld), dpy = dFdy(vWorld);
    // Which tile this is, and where in it. The mesher writes the atlas UV of
    // the tile's own cell; a whole number added to u is the quarter of a
    // two-block photograph this block wears (see the macro variant in
    // cubemesher.js), and an atlas sampler with repeat wrapping never sees it.
    float variant = floor(vUvC.x);
    vec2 g = vec2(vUvC.x - variant, vUvC.y) * uRealGrid;
    vec2 cell = floor(g);
    float inv = 1.0 / (1.0 - 2.0 * uRealInset);
    vec2 st = clamp((g - cell - uRealInset) * inv, 0.0, 1.0);
    // Gradients from the ordinary UV, scaled to the tile: smooth across the
    // whole triangle, and the whole number that picks the quarter is the same
    // at all three corners, so it never shows up in one.
    vec2 gdx = dFdx(vUv * uRealGrid) * inv, gdy = dFdy(vUv * uRealGrid) * inv;
    int tile = int((uRealGrid.y - 1.0 - cell.y) * uRealGrid.x + cell.x + 0.5);
    vec4 P0 = texelFetch(uRealProps, ivec2(tile, 0), 0);
    vec4 P1 = texelFetch(uRealProps, ivec2(tile, 1), 0);
    vec4 P2 = texelFetch(uRealProps, ivec2(tile, 2), 0);
    vec3 albedo;
    float alpha;
    vec3 nT = vec3(0.0, 0.0, 1.0);
    float rough = P1.z;
    float metal = P0.z;
    float glowK = 1.0;
    bool photo = uRealReady > 0.5 && P0.x >= 0.0;
    if (photo) {
      float layer = P0.x + (P0.y > 1.5 ? variant : 0.0);
      vec4 a = textureGrad(uRealAlb, vec3(st, layer), gdx, gdy);
      #ifndef LIT_FAST
        vec4 mt = textureGrad(uRealMat, vec3(st, layer), gdx, gdy);
      #endif
      albedo = a.rgb * P2.rgb;
      alpha = a.a;
      #ifdef LIT_CUTOUT
        // A cut-out keeps its coverage at a distance: the mip chain averages
        // alpha down, and a canopy whose holes average to 0.4 would vanish
        // from the far side of a valley. The threshold falls as the texture
        // shrinks, so what shrinks is the holes.
        float lod = 0.5 * log2(max(dot(gdx, gdx), dot(gdy, gdy)) * uRealN * uRealN);
        float cut = 0.5 - clamp(lod * 0.06, 0.0, 0.3);
        if ((P0.w < 0.5 || P0.w > 1.5) && alpha < cut) discard;
      #endif
      // the colour's alpha is metal (1), or the fourth channel of the
      // normal map is how much of this texel glows (2) — a torch's head
      #ifdef LIT_FAST
        // the lowest detail reads no normal map at all: one texture fetch a
        // fragment instead of two, the surface lit flat by the same sun
        if (P0.w > 1.5) glowK = 0.5;
        else if (P0.w > 0.5) { metal = (1.0 - alpha) * 2.0; alpha = 1.0; }
      #else
        if (P0.w > 1.5) glowK = mt.a;
        else if (P0.w > 0.5) { metal = (1.0 - alpha) * 2.0; alpha = 1.0; }
        nT = vec3(mt.rg * 2.0 - 1.0, 0.0);
        nT.z = sqrt(max(0.0, 1.0 - dot(nT.xy, nT.xy)));
        rough = mt.b;
      #endif
    } else {
      vec4 a = texture2D(map, vec2(vUvC.x - variant, vUvC.y));
      #ifdef LIT_CUTOUT
        if (a.a < 0.5) discard;
      #endif
      albedo = a.rgb;
      alpha = a.a;
    }
    vec3 tint = uTint;
    #ifdef LIT_VCOL
      tint *= vCol;
    #endif
    // the world-scale tone that breaks the repeat, on the tiles that ask
    #ifndef LIT_FAST
      if (P1.w > 0.0) {
        float mv = realNoise(vTrue * 0.13) * 0.6 + realNoise(vTrue * 0.037 + 17.0) * 0.4;
        albedo *= 1.0 + (mv - 0.5) * 0.28 * P1.w;
      }
    #endif
    albedo *= tint;

    // the face's own normal, turned to face the eye — the chunks carry no
    // normals, and a cross-plane is seen from both sides
    vec3 Ng = normalize(cross(dpx, dpy));
    if (dot(Ng, cameraPosition - vWorld) < 0.0) Ng = -Ng;
    // ...and the photograph's normal in it
    #ifdef LIT_FAST
      vec3 N = Ng;
    #else
      vec3 N = realPerturb(Ng, dpx, dpy, gdx, gdy, nT);
    #endif
    vec3 up = uRealUpMode > 0.5 ? normalize(vWorld) : uRealUp;
    float foliage = P1.x;
    if (foliage > 0.5) N = normalize(mix(N, up, 0.5));
    #ifdef LIT_GLASS
      // --- a pane of stained glass ----------------------------------------------
      //
      // Less a surface the light lands on than one it comes through. From
      // inside a church, the sun on the far side of a window lights it up in
      // its own colour; from the street it is mostly the sky reflected, with
      // the colour dark behind it — and the whole of it thicker to the eye
      // at a glancing angle, as glass is.
      vec3 Vg = normalize(cameraPosition - vWorld);
      float Fg = 0.04 + 0.96 * pow(1.0 - clamp(dot(Ng, Vg), 0.0, 1.0), 5.0);
      float behind = max(0.0, -dot(Ng, uKeyDir));
      float front = max(0.0, dot(Ng, uKeyDir));
      float shFront = realShadow(vWorld, Ng);
      vec3 through = albedo * (uKeyColor * behind * (behind > 0.0 ? realShadow(vWorld, -Ng) : 0.0) * 2.2
        + uSkyAmb * 0.8);
      vec3 onIt = albedo * (uKeyColor * front * shFront * 0.3 + uSkyAmb * 0.3);
      vec3 Rg = reflect(-Vg, N);
      vec3 skyR = mix(uGroundAmb, uSkyAmb * 1.8, clamp(dot(Rg, up) * 0.5 + 0.5, 0.0, 1.0));
      float glint = pow(max(dot(Rg, uKeyDir), 0.0), 400.0) * shFront * step(0.0, front);
      vec3 gcol = through + onIt + skyR * Fg + uKeyColor * glint * 6.0;
      gl_FragColor = vec4(realTone(gcol * uExposure), clamp(alpha + Fg * 0.4, 0.0, 1.0));
      return;
    #endif
    vec3 col = realShade(albedo, N, Ng, rough, metal, foliage, up);
    // what glows: a flame, a lamp's glass, lava — or only the texels of a
    // tile that say so
    col += albedo * P1.y * glowK * 2.4;

    gl_FragColor = vec4(realTone(col * uExposure), 1.0);
  #elif defined( LIT_BODY )
    // --- a body, under the Realistic style -------------------------------------
    //
    // The people and the animals in the same light as the ground they stand
    // on, and in materials of their own: realism.js repaints each body
    // canvas at a higher resolution with cloth, skin, hair, fur or metal in
    // it, and hands this material the normal and roughness to go with it.
    vec3 dpx = dFdx(vWorld), dpy = dFdy(vWorld);
    vec3 albedo = uTint;
    vec2 gdx = vec2(1.0, 0.0), gdy = vec2(0.0, 1.0);
    vec4 nr = vec4(0.5, 0.5, 0.7, 0.0);
    #ifdef LIT_MAP
      gdx = dFdx(vUv); gdy = dFdy(vUv);
      vec4 a = texture2D(map, vUv);
      #ifdef LIT_CUTOUT
        if (a.a < 0.5) discard;
      #endif
      albedo *= a.rgb;
      #ifndef LIT_FAST
        nr = texture2D(uBodyNR, vUv);
      #endif
    #endif
    #ifdef LIT_VCOL
      albedo *= vCol;
    #endif
    #ifdef LIT_FACESHADE
      // Take the face shade the body was built with back out: it was there to
      // draw a box's corners under flat light, and the real light does that
      // now. Which shade a face got follows from which way the box's own face
      // points — the order FACE_SHADES was always applied in.
      vec3 an = abs(vObjN);
      float fs = an.y > 0.5 ? (vObjN.y > 0.0 ? 1.0 : 0.55) : an.x > 0.5 ? 0.82 : 0.68;
      albedo /= fs;
    #endif
    vec3 nT = vec3(nr.rg * 2.0 - 1.0, 0.0);
    nT.z = sqrt(max(0.0, 1.0 - dot(nT.xy, nT.xy)));
    vec3 Ng = normalize(cross(dpx, dpy));
    if (dot(Ng, cameraPosition - vWorld) < 0.0) Ng = -Ng;
    #ifdef LIT_FAST
      vec3 N = Ng;
    #else
      vec3 N = realPerturb(Ng, dpx, dpy, gdx, gdy, nT);
    #endif
    vec3 up = uRealUpMode > 0.5 ? normalize(vWorld) : uRealUp;
    vec3 col = realShade(albedo, N, Ng, nr.b, nr.a, 0.0, up);
    gl_FragColor = vec4(realTone(col * uExposure), 1.0);
  #else
    vec3 base = uTint;
    #ifdef LIT_MAP
      vec4 tex = texture2D(map, vUv);
      #ifdef LIT_CUTOUT
        if (tex.a < 0.5) discard;      // the old alphaTest, by hand
      #endif
      base *= tex.rgb;
    #endif
    #ifdef LIT_VCOL
      base *= vCol;
    #endif
    vec3 lit = base * diffuse * mix(uShadow, 1.0, getShadowMask());
    if (uLampBright > 0.001) {
      float pool = 0.0;
      for (int i = 0; i < ${LAMP_SLOTS}; i++) {
        if (i >= uLampN) break;
        vec4 L = uLamp[i];
        if (L.w <= 0.0) continue;
        float d = distance(vWorld, L.xyz);
        float k = clamp(1.0 - d / L.w, 0.0, 1.0);
        pool += k * k * uLampGain[i];  // squared: a tight pool, not a haze
      }
      // ...and take back whatever a wall is standing in the way of.
      //
      // The first LAMP_CASTERS lamps in the table are the ones that have a
      // real three.js PointLight behind them, so each has a cube shadow map
      // to ask. Their own contribution is recomputed and scaled by how much
      // of the lamp the fragment can actually see.
      //
      // Spelled out rather than looped because a sampler array cannot be
      // indexed by a running variable in GLSL — three's own chunks unroll for
      // the same reason — and because there are only ever two of them.
      #if NUM_POINT_LIGHT_SHADOWS > 0
        pool -= lampBlocked(0, uLamp[0], uLampGain[0],
          getPointShadow(pointShadowMap[0], pointLightShadows[0].shadowMapSize,
            pointLightShadows[0].shadowBias, pointLightShadows[0].shadowRadius,
            vPointShadowCoord[0], pointLightShadows[0].shadowCameraNear,
            pointLightShadows[0].shadowCameraFar));
      #endif
      #if NUM_POINT_LIGHT_SHADOWS > 1
        pool -= lampBlocked(1, uLamp[1], uLampGain[1],
          getPointShadow(pointShadowMap[1], pointLightShadows[1].shadowMapSize,
            pointLightShadows[1].shadowBias, pointLightShadows[1].shadowRadius,
            vPointShadowCoord[1], pointLightShadows[1].shadowCameraNear,
            pointLightShadows[1].shadowCameraFar));
      #endif
      pool = max(pool, 0.0);
      lit += base * uLampTint * min(pool, 1.6) * uLampBright;
    }
    gl_FragColor = vec4(lit, 1.0);
  #endif
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

// Every material that takes the Realistic style's light when it is on — the
// terrain and the plants. Kept so the style can be switched both ways without
// anybody having to find them again; forgotten when a material is disposed.
const terrainMats = new Set();
// ...and every body: the people, the animals, the dead. Kept for the same
// reason, and so realism.js can hand each its repainted canvas.
const bodyMats = new Set();
export const bodyMaterials = () => bodyMats;
let realOn = false;

// Switch the Realistic lighting on or off for the whole terrain. A define, so
// it recompiles once rather than branching per fragment for ever: the other
// styles pay nothing for this existing.
export function setLitReal(on) {
  on = !!on;
  if (on === realOn) return;
  realOn = on;
  for (const m of terrainMats) {
    if (on) m.defines.LIT_REAL = ''; else delete m.defines.LIT_REAL;
    m.needsUpdate = true;
  }
  for (const m of bodyMats) {
    if (on) m.defines.LIT_BODY = ''; else delete m.defines.LIT_BODY;
    m.needsUpdate = true;
  }
}

// The lowest detail's cheaper light (LIT_FAST): no normal maps, no
// world-scale tone. A define like LIT_REAL, so it recompiles once when the
// detail changes and costs nothing in between.
let fastOn = false;
export function setLitFast(on) {
  on = !!on;
  if (on === fastOn) return;
  fastOn = on;
  for (const m of [...terrainMats, ...bodyMats]) {
    if (on) m.defines.LIT_FAST = ''; else delete m.defines.LIT_FAST;
    m.needsUpdate = true;
  }
}

// a flat normal and a middling roughness, for a body with no repainted canvas
export const FLAT_NR = new THREE.DataTexture(new Uint8Array([128, 128, 178, 0]), 1, 1);
FLAT_NR.needsUpdate = true;
export const litRealOn = () => realOn;

// One surface that takes the light.
//
//   map        an atlas texture, or null for a flat colour
//   color      the surface's own colour, multiplied under everything
//   cutout     alphaTest by discard — for anything with holes in it
//   terrain    takes the Realistic style's light when that style is on
//   vertexColors / side  as three's own
export function makeLit({
  map = null, color = 0xffffff, cutout = false, terrain = false,
  body = false, faceShade = false,
  vertexColors = false, side = THREE.FrontSide, glass = false,
} = {}) {
  const u = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog, THREE.UniformsLib.lights,
  ]);
  // ...and now the aliases: the SAME objects in every material, so one write
  // a frame moves the whole world. Assigned after the merge because merge
  // deep-clones, which is exactly what we do not want here.
  Object.assign(u, shared);
  if (terrain) Object.assign(u, realShared);
  if (body) {
    // the light's uniforms only — a body never samples the terrain's arrays
    for (const k of ['uKeyDir', 'uKeyColor', 'uSkyAmb', 'uGroundAmb', 'uRealUp',
      'uRealUpMode', 'uExposure', 'uShadowTexel', 'uRealLampGain', 'uShadowTaps']) u[k] = realShared[k];
    u.uBodyNR = { value: FLAT_NR };
  }
  u.map = { value: map };
  u.uTint = { value: new THREE.Color(color) };
  const defines = {};
  if (map) defines.LIT_MAP = '';
  if (cutout) defines.LIT_CUTOUT = '';
  if (vertexColors) defines.LIT_VCOL = '';
  if (terrain && realOn) defines.LIT_REAL = '';
  if (body && realOn) defines.LIT_BODY = '';
  if (body && faceShade) defines.LIT_FACESHADE = '';
  if (glass) defines.LIT_GLASS = '';
  if ((terrain || body) && fastOn) defines.LIT_FAST = '';
  const m = new THREE.ShaderMaterial({
    uniforms: u, vertexShader: VERT, fragmentShader: FRAG,
    defines, vertexColors, side, lights: true, fog: true,
  });
  // a pane is seen through: blended, and it does not stamp the depth of the
  // world it is a window onto
  if (glass) { m.transparent = true; m.depthWrite = false; }
  if (terrain) {
    terrainMats.add(m);
    m.addEventListener('dispose', () => terrainMats.delete(m));
  }
  if (body) {
    bodyMats.add(m);
    m.addEventListener('dispose', () => bodyMats.delete(m));
  }
  // Everything outside reaches for `.color` — a body's tint is read and
  // written through it, and the old MeshBasicMaterials all had one. It points
  // at this material's OWN tint, never at the shared dim.
  Object.defineProperty(m, 'color', {
    get: () => u.uTint.value,
    set: (c) => u.uTint.value.copy(c),
  });
  // ...and cloning has to come back through here.
  //
  // ShaderMaterial.clone() deep-copies the uniform block, which is precisely
  // wrong for this material: the clone would get its own private copy of the
  // day/night dim and the lamp table and then never hear about either again,
  // so a hurt villager would freeze at whatever the light happened to be when
  // somebody hit him. It also loses the `color` property above, because that
  // is defined on the instance and not on the prototype — which is how this
  // announced itself, as `m.color.clone()` throwing on a fresh clone.
  //
  // entities.js clones a body's materials the first time it is struck, to
  // flash it red without touching the herd it shares a material set with. So:
  // a clone is a NEW material off the same recipe — its own tint, everybody
  // else's light.
  m.clone = () => {
    const c = makeLit({ map, color, cutout, terrain, body, faceShade, vertexColors, side, glass });
    c.color.copy(u.uTint.value);
    // whatever the body is wearing NOW, which under the Realistic style is
    // not the canvas it was made with — see realism.js
    c.uniforms.map.value = u.map.value;
    if (body) c.uniforms.uBodyNR.value = u.uBodyNR.value;
    c.userData.pixelMap = m.userData.pixelMap;
    return c;
  };
  return m;
}
