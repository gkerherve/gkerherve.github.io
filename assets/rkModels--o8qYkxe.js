import{r as e}from"./rolldown-runtime-B0Z9INg1.js";import{Er as t,K as n,Tt as r,Ut as i,_ as a,c as o,f as s,i as c,jt as l,rr as u,s as d,vt as f,w as p,wt as m,xt as h,y as g}from"./three.core-DBU-FUoe.js";import{n as _,t as v}from"./GLTFLoader-KAx6m15j.js";function y(e){let t=e.name.toLowerCase();if(/skin/.test(t))return`skin`;if(/visor|glass|lens/.test(t))return`visor`;let n=e.color,r=.2126*n.r+.7152*n.g+.0722*n.b;return/^gear|black|dark/.test(t)||r<.035?`gear`:`uniform`}var b={uniform:0,gear:1,skin:2,visor:3},x=`
float dHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float dNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dHash(i), dHash(i + vec3(1,0,0)), f.x), mix(dHash(i + vec3(0,1,0)), dHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(dHash(i + vec3(0,0,1)), dHash(i + vec3(1,0,1)), f.x), mix(dHash(i + vec3(0,1,1)), dHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float dFbm(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * dNoise(p); p *= 2.07; a *= 0.5; } return v; }
// a fine pattern fades out when it gets smaller than a pixel (no shimmering)
float dFade(vec3 p, float freq) { return clamp(1.5 - length(fwidth(p)) * freq * 1.5, 0.0, 1.0); }
`;function S(e,t,n){if(t===`visor`){e.roughness=.05,e.metalness=.85,e.envMapIntensity=1.5;return}e.roughness=t===`skin`?.55:t===`gear`?.7:.85,e.metalness=0;let r={uDetailScale:{value:n},uDetailKind:{value:b[t]},uDetailBump:{value:t===`skin`?.35:.8}};e.userData.detail=t,e.customProgramCacheKey=()=>`rk-detail-${t}`,e.onBeforeCompile=e=>{Object.assign(e.uniforms,r),e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
uniform float uDetailScale;
varying vec3 vDetailPos;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
vDetailPos = position * uDetailScale;`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>\nuniform int uDetailKind;\nuniform float uDetailBump;\nvarying vec3 vDetailPos;\n${x}`).replace(`#include <map_fragment>`,`#include <map_fragment>
        vec3 dp = vDetailPos;
        float detailH = 0.0;
        if (uDetailKind == 0) {
          // digital camo: blocky 3 cm cells of three tones, the urban kind
          vec3 cell = floor(dp * 33.0) / 33.0;
          float c = dFbm(cell * 3.1 + 7.0);
          float tone = c < 0.42 ? 0.62 : c < 0.55 ? 1.0 : 1.55;
          diffuseColor.rgb *= mix(1.0, tone, 0.85);
          // fabric weave and wrinkles
          float wf = dFade(dp, 900.0);
          float weave = (sin(dp.x * 900.0) * sin(dp.y * 900.0 + dp.z * 900.0)) * 0.5 + 0.5;
          float folds = 1.0 - abs(dFbm(vec3(dp.x * 9.0, dp.y * 3.5, dp.z * 9.0)) * 2.0 - 1.0);
          detailH = folds * 0.9 + weave * 0.12 * wf;
          diffuseColor.rgb *= 0.88 + 0.12 * weave * wf + 0.1 * folds;
          // dust and wear, heavier towards the boots
          float dirt = dFbm(dp * 6.0) * smoothstep(0.7, 0.0, dp.y);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.14, 0.11), dirt * 0.45);
        } else if (uDetailKind == 1) {
          // webbing: horizontal rows every 2.5 cm, nylon weave, scuffed edges
          float rowsF = dFade(dp, 40.0);
          float row = smoothstep(0.32, 0.48, abs(fract(dp.y * 40.0) - 0.5)) * rowsF;
          float wf = dFade(dp, 700.0);
          float weave = (sin(dp.x * 700.0 + dp.z * 700.0) * 0.5 + 0.5) * wf;
          float scuff = smoothstep(0.62, 0.78, dFbm(dp * 28.0));
          detailH = row * 0.8 + weave * 0.15;
          diffuseColor.rgb *= 1.0 - row * 0.35;
          diffuseColor.rgb += vec3(0.05, 0.05, 0.045) * scuff + 0.012 * weave;
        } else {
          // skin: mottling, a warm and a cool tint, pores and fine creases
          float m = dFbm(dp * 14.0);
          diffuseColor.rgb *= mix(vec3(0.92, 0.9, 0.95), vec3(1.08, 0.98, 0.92), m);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 0.86, 0.84), smoothstep(0.55, 0.8, dFbm(dp * 5.0 + 3.0)) * 0.35);
          float pf = dFade(dp, 500.0);
          float pores = (1.0 - smoothstep(0.0, 0.35, dNoise(dp * 500.0))) * pf;
          float crease = 1.0 - abs(dNoise(dp * vec3(40.0, 90.0, 40.0)) * 2.0 - 1.0);
          detailH = -pores * 0.6 + crease * 0.25 * dFade(dp, 90.0);
          diffuseColor.rgb *= 1.0 - pores * 0.08;
        }`).replace(`#include <normal_fragment_maps>`,`#include <normal_fragment_maps>
        {
          // bump the normal with the detail height (screen-space derivatives)
          vec3 dpdx = dFdx(-vViewPosition);
          vec3 dpdy = dFdy(-vViewPosition);
          float hx = dFdx(detailH);
          float hy = dFdy(detailH);
          vec3 r1 = cross(dpdy, normal);
          vec3 r2 = cross(normal, dpdx);
          float det = dot(dpdx, r1);
          vec3 grad = sign(det) * (hx * r1 + hy * r2);
          normal = normalize(abs(det) * normal - grad * uDetailBump * 0.004 / max(1e-6, length(dpdx) + length(dpdy)) * length(dpdx));
        }`)},e.needsUpdate=!0}var C=e({hasModel:()=>A,instanceModel:()=>P,loadModels:()=>k}),w={grunt:[{file:`soldier-cad`,height:1.8,weapon:`shotgun`,detail:!0},{file:`soldier2`,height:1.8,detail:!0,prefer:{idle:[`Idle`],shoot:[`Idle_Shoot`],attack:[`Idle_Shoot`],run:[`Run_Gun`,`Run`],walk:[`Run_Gun`,`Walk`]},props:{among:[`Sniper`,`SMG`,`RocketLauncher`,`Revolver`,`Revolver_Small`,`Pistol`,`GrenadeLauncher`,`ShortCannon`,`Shotgun`,`Sniper_2`,`Shovel`,`Knife_2`,`AK`,`Knife_1`],keep:[`AK`,`SMG`,`Shotgun`]}}],knight:[{file:`soldier2`,height:1.8,detail:!0,prefer:{idle:[`Idle`],run:[`Run`],walk:[`Walk`,`Run`],attack:[`Punch`,`Idle_Shoot`]},props:{among:[`Sniper`,`SMG`,`RocketLauncher`,`Revolver`,`Revolver_Small`,`Pistol`,`GrenadeLauncher`,`ShortCannon`,`Shotgun`,`Sniper_2`,`Shovel`,`Knife_2`,`AK`,`Knife_1`],keep:[`Knife_1`,`Knife_2`]}}],brute:[{file:`soldier2`,height:2.25,detail:!0,prefer:{idle:[`Idle`],shoot:[`Idle_Shoot`],attack:[`Idle_Shoot`],run:[`Run_Gun`,`Run`],walk:[`Run_Gun`,`Walk`]},props:{among:[`Sniper`,`SMG`,`RocketLauncher`,`Revolver`,`Revolver_Small`,`Pistol`,`GrenadeLauncher`,`ShortCannon`,`Shotgun`,`Sniper_2`,`Shovel`,`Knife_2`,`AK`,`Knife_1`],keep:[`GrenadeLauncher`,`RocketLauncher`,`ShortCannon`]}}],ravager:[{file:`soldier-cad`,height:1.95,prefer:{run:[`Run`],attack:[`Punch`,`Idle_Shoot`]}}],hound:[{file:`wolf`,height:1.05}],wraith:[],core:[],zombie:[{file:`zombie`,height:1.8,prefer:{run:[`Run_Arms`,`Run`],attack:[`Punch`,`Idle_Attack`]}},{file:`zombie2`,height:1.8}]},T={idle:[`Idle_Gun`,`Idle_Sword`,`Idle`,`Flying_Idle`,`Skeleton_Idle`],walk:[`Walk`,`Fast_Flying`,`Skeleton_Running`,`Run`],run:[`Run_Shoot`,`Run`,`Gallop`,`Fast_Flying`,`Skeleton_Running`,`Walk`],attack:[`Sword_Slash`,`Attack`,`Bite_Front`,`Headbutt`,`Punch`,`Weapon`,`Skeleton_Attack`],shoot:[`Gun_Shoot`,`Punch`,`Weapon`,`Attack`,`Headbutt`,`Bite_Front`,`Skeleton_Attack`],leap:[`Gallop_Jump`,`Jump`,`Roll`,`Fast_Flying`],hit:[`HitRecieve`,`HitReact`,`Idle_HitReact_Left`],death:[`Death`,`Skeleton_Death`]},E=new Map,D=new Map,O=e=>e.split(`|`).pop()??e;function k(e){let t=new v,n=e.flatMap(e=>w[e]);return Promise.all(n.map(e=>{if(E.has(e.file))return Promise.resolve();let n=D.get(e.file);return n||(n=t.loadAsync(`/models/quaternius/${e.file}.glb`).then(t=>{t.scene.updateMatrixWorld(!0);let n=new d().setFromObject(t.scene),r=Math.max(.01,n.max.y-n.min.y),i=e.height/r,a=new Map;for(let e of t.animations)a.set(O(e.name),e);let o=Math.max(n.max.x-n.min.x,n.max.z-n.min.z)*i/2;E.set(e.file,{gltf:t,scale:i,lift:-n.min.y*i,radius:o,clips:a})}),D.set(e.file,n)),n})).then(()=>void 0)}var A=e=>e in w&&w[e].some(e=>E.has(e.file)),j=[`attack`,`shoot`,`leap`,`hit`,`death`],M=null;function N(e){if(!M){let e=document.createElement(`canvas`);e.width=e.height=128;let t=e.getContext(`2d`),n=t.createRadialGradient(64,64,0,64,64,64);n.addColorStop(0,`rgba(0,0,0,0.6)`),n.addColorStop(.55,`rgba(0,0,0,0.3)`),n.addColorStop(1,`rgba(0,0,0,0)`),t.fillStyle=n,t.fillRect(0,0,128,128),M=new s(e)}let t=new m(new i(1,1),new r({map:M,transparent:!0,depthWrite:!1,polygonOffset:!0,polygonOffsetFactor:-2}));return t.rotation.x=-Math.PI/2,t.position.y=.02,t.scale.setScalar(Math.max(.7,e*2.4)),t.renderOrder=-1,t}function P(e){let r=w[e].filter(e=>E.has(e.file)),i=r[Math.floor(Math.random()*r.length)],o=E.get(i.file),s=new n,l=_(o.gltf.scene);l.scale.setScalar(o.scale),l.position.y=o.lift,s.add(l),s.add(N(o.radius));let u=(Math.random()-.5)*.06,d=.9+Math.random()*.2,p=[],m=[],g=new Map;if(l.traverse(t=>{let n=t;if(!n.isMesh)return;n.frustumCulled=!1;let r=t=>{let n=g.get(t);if(!n){n=t.clone();let r=t.name.toLowerCase();/^eye(_black)?$|pupil|iris/.test(r)&&e!==`grunt`?(n.emissive=new a(e===`wraith`?6332671:16723984),n.emissiveIntensity=2.5,n.userData.glow=!0):n.userData.glow=!1,n.color.offsetHSL(u,0,0).multiplyScalar(d),n.roughness=Math.min(1,Math.max(.35,n.roughness)),n.userData.base=n.color.clone(),g.set(t,n),p.push(n)}return n};n.material=Array.isArray(n.material)?n.material.map(r):r(n.material),m.push(n)}),i.props){let e=i.props.keep[Math.floor(Math.random()*i.props.keep.length)];for(let t of i.props.among){let n=l.getObjectByName(t);n&&(n.visible=t===e)}}if(i.detail){let e=new Set;for(let n of m){let r=n.isSkinnedMesh?n.bindMatrix:n.matrixWorld,i=o.scale*new t().setFromMatrixScale(r).x;for(let t of Array.isArray(n.material)?n.material:[n.material])e.has(t)||(e.add(t),S(t,y(t),i))}}let v=i.weapon&&l.getObjectByName(`Wrist.R`);if(v&&i.weapon){let e=i.weapon===`shotgun`?L(p):R(p);e.scale.setScalar(1/o.scale),v.add(e)}let b=new c(l),x=new Map;for(let e of Object.keys(T)){let t=[...i.prefer?.[e]??[],...T[e]].map(e=>o.clips.get(e)).find(Boolean);if(!t)continue;let n=b.clipAction(t);j.includes(e)&&(n.setLoop(f,1),n.clampWhenFinished=!0),x.set(e,n)}let C={root:s,mixer:b,mats:p,meshes:m,variant:i.file,height:i.height,current:null,play(e,t){let n=x.get(e)??x.get(`idle`);if(!n)return;let r=C.current?x.get(C.current):void 0,i=j.includes(e)&&e!==`death`&&t!==void 0&&!n.isRunning();(C.current!==e||i)&&(C.current=e,n.reset(),n.timeScale=1,t&&j.includes(e)&&n.setDuration(t),n.enabled=!0,n.setEffectiveWeight(1),n.play(),r&&r!==n&&r.crossFadeTo(n,e===`death`?.1:.18,!1))},pace(e){if(C.current!==`walk`&&C.current!==`run`)return;let t=x.get(C.current);t&&(t.timeScale=h.clamp(e,.5,1.8))}};return C.play(`idle`),b.update(Math.random()*2),C}function F(e,t){let n=new l(t);return n.userData.base=n.color.clone(),n.userData.glow=!1,e.push(n),n}function I(e,t,n,r,i=[0,0,0]){let a=new m(t,n);return a.position.set(...r),a.rotation.set(...i),a.frustumCulled=!1,e.add(a),a}function L(e){let t=new n,r=F(e,{color:2895408,roughness:.4,metalness:.8}),i=F(e,{color:5913120,roughness:.6});I(t,new o(.05,.07,.22),r,[0,0,.04]),I(t,new p(.013,.013,.5,12),r,[0,.025,.38],[Math.PI/2,0,0]),I(t,new p(.012,.012,.36,10),r,[0,-.008,.32],[Math.PI/2,0,0]),I(t,new p(.023,.023,.13,12),i,[0,-.008,.28],[Math.PI/2,0,0]),I(t,new o(.04,.07,.26),i,[0,-.025,-.18],[.15,0,0]),I(t,new o(.035,.09,.04),i,[0,-.06,0],[.4,0,0]);let a=new n;return a.add(t),t.rotation.x=-Math.PI/2,t.position.set(0,.06,.02),a}function R(e){let t=new n,r=F(e,{color:14212320,roughness:.2,metalness:1}),i=F(e,{color:12095530,roughness:.35,metalness:.9});I(t,new o(.05,.85,.01),r,[0,.55,0]),I(t,new g(.025,.08,4),r,[0,1.01,0],[0,Math.PI/4,0]),I(t,new o(.24,.03,.035),i,[0,.11,0]),I(t,new p(.017,.017,.16,10),F(e,{color:3810324,roughness:.8}),[0,.02,0]),I(t,new u(.028,12,10),i,[0,-.07,0]);let a=new n;return a.add(t),t.position.set(0,.05,.03),t.rotation.x=Math.PI/2,a}export{P as n,C as r,A as t};