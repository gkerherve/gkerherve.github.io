import{d as e,l as t}from"./GameShell-7ar_1ZK1.js";import{Ar as n,Er as r,Ot as i,Pn as a,Q as o,Rt as s,Tr as c,Tt as l,Wt as u,Xn as d,Yn as f,_ as p,c as m,dr as h,gr as g,jt as _,q as v,u as y,v as b,wt as x,z as S,zt as C}from"./three.core-DBU-FUoe.js";var w={name:`CopyShader`,uniforms:{tDiffuse:{value:null},opacity:{value:1}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform float opacity;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = opacity * texel;


		}`},T=class{constructor(){this.isPass=!0,this.enabled=!0,this.needsSwap=!0,this.clear=!1,this.renderToScreen=!1}setSize(){}render(){console.error(`THREE.Pass: .render() must be implemented in derived pass.`)}dispose(){}},E=new C(-1,1,1,-1,0,1),D=new class extends y{constructor(){super(),this.setAttribute(`position`,new S([-1,3,0,-1,-1,0,3,-1,0],3)),this.setAttribute(`uv`,new S([0,2,0,0,2,0],2))}},O=class{constructor(e){this._mesh=new x(D,e)}dispose(){this._mesh.geometry.dispose()}render(e){e.render(this._mesh,E)}get material(){return this._mesh.material}set material(e){this._mesh.material=e}},k=class extends T{constructor(e,t=`tDiffuse`){super(),this.textureID=t,this.uniforms=null,this.material=null,e instanceof d?(this.uniforms=e.uniforms,this.material=e):e&&(this.uniforms=g.clone(e.uniforms),this.material=new d({name:e.name===void 0?`unspecified`:e.name,defines:Object.assign({},e.defines),uniforms:this.uniforms,vertexShader:e.vertexShader,fragmentShader:e.fragmentShader})),this._fsQuad=new O(this.material)}render(e,t,n){this.uniforms[this.textureID]&&(this.uniforms[this.textureID].value=n.texture),this._fsQuad.material=this.material,this.renderToScreen?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this._fsQuad.render(e))}dispose(){this.material.dispose(),this._fsQuad.dispose()}},A=class extends T{constructor(e,t){super(),this.scene=e,this.camera=t,this.clear=!0,this.needsSwap=!1,this.inverse=!1}render(e,t,n){let r=e.getContext(),i=e.state;i.buffers.color.setMask(!1),i.buffers.depth.setMask(!1),i.buffers.color.setLocked(!0),i.buffers.depth.setLocked(!0);let a,o;this.inverse?(a=0,o=1):(a=1,o=0),i.buffers.stencil.setTest(!0),i.buffers.stencil.setOp(r.REPLACE,r.REPLACE,r.REPLACE),i.buffers.stencil.setFunc(r.ALWAYS,a,4294967295),i.buffers.stencil.setClear(o),i.buffers.stencil.setLocked(!0),e.setRenderTarget(n),this.clear&&e.clear(),e.render(this.scene,this.camera),e.setRenderTarget(t),this.clear&&e.clear(),e.render(this.scene,this.camera),i.buffers.color.setLocked(!1),i.buffers.depth.setLocked(!1),i.buffers.color.setMask(!0),i.buffers.depth.setMask(!0),i.buffers.stencil.setLocked(!1),i.buffers.stencil.setFunc(r.EQUAL,1,4294967295),i.buffers.stencil.setOp(r.KEEP,r.KEEP,r.KEEP),i.buffers.stencil.setLocked(!0)}},j=class extends T{constructor(){super(),this.needsSwap=!1}render(e){e.state.buffers.stencil.setLocked(!1),e.state.buffers.stencil.setTest(!1)}},M=class{constructor(e,t){if(this.renderer=e,this._pixelRatio=e.getPixelRatio(),t===void 0){let r=e.getSize(new c);this._width=r.width,this._height=r.height,t=new n(this._width*this._pixelRatio,this._height*this._pixelRatio,{type:v}),t.texture.name=`EffectComposer.rt1`}else this._width=t.width,this._height=t.height;this.renderTarget1=t,this.renderTarget2=t.clone(),this.renderTarget2.texture.name=`EffectComposer.rt2`,this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2,this.renderToScreen=!0,this.passes=[],this.copyPass=new k(w),this.copyPass.material.blending=0,this.timer=new h}swapBuffers(){let e=this.readBuffer;this.readBuffer=this.writeBuffer,this.writeBuffer=e}addPass(e){this.passes.push(e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}insertPass(e,t){this.passes.splice(t,0,e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}removePass(e){let t=this.passes.indexOf(e);t!==-1&&this.passes.splice(t,1)}isLastEnabledPass(e){for(let t=e+1;t<this.passes.length;t++)if(this.passes[t].enabled)return!1;return!0}render(e){this.timer.update(),e===void 0&&(e=this.timer.getDelta());let t=this.renderer.getRenderTarget(),n=!1;for(let t=0,r=this.passes.length;t<r;t++){let r=this.passes[t];if(r.enabled!==!1){if(r.renderToScreen=this.renderToScreen&&this.isLastEnabledPass(t),r.render(this.renderer,this.writeBuffer,this.readBuffer,e,n),r.needsSwap){if(n){let t=this.renderer.getContext(),n=this.renderer.state.buffers.stencil;n.setFunc(t.NOTEQUAL,1,4294967295),this.copyPass.render(this.renderer,this.writeBuffer,this.readBuffer,e),n.setFunc(t.EQUAL,1,4294967295)}this.swapBuffers()}A!==void 0&&(r instanceof A?n=!0:r instanceof j&&(n=!1))}}this.renderer.setRenderTarget(t)}reset(e){if(e===void 0){let t=this.renderer.getSize(new c);this._pixelRatio=this.renderer.getPixelRatio(),this._width=t.width,this._height=t.height,e=this.renderTarget1.clone(),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.renderTarget1=e,this.renderTarget2=e.clone(),this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2}setSize(e,t){this._width=e,this._height=t;let n=this._width*this._pixelRatio,r=this._height*this._pixelRatio;this.renderTarget1.setSize(n,r),this.renderTarget2.setSize(n,r);for(let e=0;e<this.passes.length;e++)this.passes[e].setSize(n,r)}setPixelRatio(e){this._pixelRatio=e,this.setSize(this._width,this._height)}dispose(){this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.copyPass.dispose()}},N=class extends T{constructor(e,t,n=null,r=null,i=null){super(),this.scene=e,this.camera=t,this.overrideMaterial=n,this.clearColor=r,this.clearAlpha=i,this.clear=!0,this.clearDepth=!1,this.needsSwap=!1,this.isRenderPass=!0,this._oldClearColor=new p}render(e,t,n){let r=e.autoClear;e.autoClear=!1;let i,a;this.overrideMaterial!==null&&(a=this.scene.overrideMaterial,this.scene.overrideMaterial=this.overrideMaterial),this.clearColor!==null&&(e.getClearColor(this._oldClearColor),e.setClearColor(this.clearColor,e.getClearAlpha())),this.clearAlpha!==null&&(i=e.getClearAlpha(),e.setClearAlpha(this.clearAlpha)),this.clearDepth==1&&e.clearDepth(),e.setRenderTarget(this.renderToScreen?null:n),this.clear===!0&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),e.render(this.scene,this.camera),this.clearColor!==null&&e.setClearColor(this._oldClearColor),this.clearAlpha!==null&&e.setClearAlpha(i),this.overrideMaterial!==null&&(this.scene.overrideMaterial=a),e.autoClear=r}},P={name:`LuminosityHighPassShader`,uniforms:{tDiffuse:{value:null},luminosityThreshold:{value:1},smoothWidth:{value:1},defaultColor:{value:new p(0)},defaultOpacity:{value:0}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform sampler2D tDiffuse;
		uniform vec3 defaultColor;
		uniform float defaultOpacity;
		uniform float luminosityThreshold;
		uniform float smoothWidth;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );

			float v = luminance( texel.xyz );

			vec4 outputColor = vec4( defaultColor.rgb, defaultOpacity );

			float alpha = smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v );

			gl_FragColor = mix( outputColor, texel, alpha );

		}`},F=class e extends T{constructor(e,t=1,i,a){super(),this.strength=t,this.radius=i,this.threshold=a,this.resolution=e===void 0?new c(256,256):new c(e.x,e.y),this.clearColor=new p(0,0,0),this.needsSwap=!1,this.renderTargetsHorizontal=[],this.renderTargetsVertical=[],this.nMips=5;let o=Math.round(this.resolution.x/2),s=Math.round(this.resolution.y/2);this.renderTargetBright=new n(o,s,{type:v,depthBuffer:!1}),this.renderTargetBright.texture.name=`UnrealBloomPass.bright`,this.renderTargetBright.texture.generateMipmaps=!1;for(let e=0;e<this.nMips;e++){let t=new n(o,s,{type:v,depthBuffer:!1});t.texture.name=`UnrealBloomPass.h`+e,t.texture.generateMipmaps=!1,this.renderTargetsHorizontal.push(t);let r=new n(o,s,{type:v,depthBuffer:!1});r.texture.name=`UnrealBloomPass.v`+e,r.texture.generateMipmaps=!1,this.renderTargetsVertical.push(r),o=Math.round(o/2),s=Math.round(s/2)}let u=P;this.highPassUniforms=g.clone(u.uniforms),this.highPassUniforms.luminosityThreshold.value=a,this.highPassUniforms.smoothWidth.value=.01,this.materialHighPassFilter=new d({uniforms:this.highPassUniforms,vertexShader:u.vertexShader,fragmentShader:u.fragmentShader}),this.separableBlurMaterials=[];let f=[6,10,14,18,22];o=Math.round(this.resolution.x/2),s=Math.round(this.resolution.y/2);for(let e=0;e<this.nMips;e++)this.separableBlurMaterials.push(this._getSeparableBlurMaterial(f[e])),this.separableBlurMaterials[e].uniforms.invSize.value=new c(1/o,1/s),o=Math.round(o/2),s=Math.round(s/2);this.compositeMaterial=this._getCompositeMaterial(this.nMips),this.compositeMaterial.uniforms.blurTexture1.value=this.renderTargetsVertical[0].texture,this.compositeMaterial.uniforms.blurTexture2.value=this.renderTargetsVertical[1].texture,this.compositeMaterial.uniforms.blurTexture3.value=this.renderTargetsVertical[2].texture,this.compositeMaterial.uniforms.blurTexture4.value=this.renderTargetsVertical[3].texture,this.compositeMaterial.uniforms.blurTexture5.value=this.renderTargetsVertical[4].texture,this.compositeMaterial.uniforms.bloomStrength.value=t,this.compositeMaterial.uniforms.bloomRadius.value=.1;let m=[1,.8,.6,.4,.2];this.compositeMaterial.uniforms.bloomFactors.value=m,this.bloomTintColors=[new r(1,1,1),new r(1,1,1),new r(1,1,1),new r(1,1,1),new r(1,1,1)],this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,this.copyUniforms=g.clone(w.uniforms),this.blendMaterial=new d({uniforms:this.copyUniforms,vertexShader:w.vertexShader,fragmentShader:w.fragmentShader,premultipliedAlpha:!0,blending:2,depthTest:!1,depthWrite:!1,transparent:!0}),this._oldClearColor=new p,this._oldClearAlpha=1,this._basic=new l,this._fsQuad=new O(null)}dispose(){for(let e=0;e<this.renderTargetsHorizontal.length;e++)this.renderTargetsHorizontal[e].dispose();for(let e=0;e<this.renderTargetsVertical.length;e++)this.renderTargetsVertical[e].dispose();this.renderTargetBright.dispose();for(let e=0;e<this.separableBlurMaterials.length;e++)this.separableBlurMaterials[e].dispose();this.compositeMaterial.dispose(),this.blendMaterial.dispose(),this._basic.dispose(),this._fsQuad.dispose()}setSize(e,t){let n=Math.round(e/2),r=Math.round(t/2);this.renderTargetBright.setSize(n,r);for(let e=0;e<this.nMips;e++)this.renderTargetsHorizontal[e].setSize(n,r),this.renderTargetsVertical[e].setSize(n,r),this.separableBlurMaterials[e].uniforms.invSize.value=new c(1/n,1/r),n=Math.round(n/2),r=Math.round(r/2)}render(t,n,r,i,a){t.getClearColor(this._oldClearColor),this._oldClearAlpha=t.getClearAlpha();let o=t.autoClear;t.autoClear=!1,t.setClearColor(this.clearColor,0),a&&t.state.buffers.stencil.setTest(!1),this.renderToScreen&&(this._fsQuad.material=this._basic,this._basic.map=r.texture,t.setRenderTarget(null),t.clear(),this._fsQuad.render(t)),this.highPassUniforms.tDiffuse.value=r.texture,this.highPassUniforms.luminosityThreshold.value=this.threshold,this._fsQuad.material=this.materialHighPassFilter,t.setRenderTarget(this.renderTargetBright),t.clear(),this._fsQuad.render(t);let s=this.renderTargetBright;for(let n=0;n<this.nMips;n++)this._fsQuad.material=this.separableBlurMaterials[n],this.separableBlurMaterials[n].uniforms.colorTexture.value=s.texture,this.separableBlurMaterials[n].uniforms.direction.value=e.BlurDirectionX,t.setRenderTarget(this.renderTargetsHorizontal[n]),t.clear(),this._fsQuad.render(t),this.separableBlurMaterials[n].uniforms.colorTexture.value=this.renderTargetsHorizontal[n].texture,this.separableBlurMaterials[n].uniforms.direction.value=e.BlurDirectionY,t.setRenderTarget(this.renderTargetsVertical[n]),t.clear(),this._fsQuad.render(t),s=this.renderTargetsVertical[n];this._fsQuad.material=this.compositeMaterial,this.compositeMaterial.uniforms.bloomStrength.value=this.strength,this.compositeMaterial.uniforms.bloomRadius.value=this.radius,this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,t.setRenderTarget(this.renderTargetsHorizontal[0]),t.clear(),this._fsQuad.render(t),this._fsQuad.material=this.blendMaterial,this.copyUniforms.tDiffuse.value=this.renderTargetsHorizontal[0].texture,a&&t.state.buffers.stencil.setTest(!0),this.renderToScreen?(t.setRenderTarget(null),this._fsQuad.render(t)):(t.setRenderTarget(r),this._fsQuad.render(t)),t.setClearColor(this._oldClearColor,this._oldClearAlpha),t.autoClear=o}_getSeparableBlurMaterial(e){let t=[],n=e/3;for(let r=0;r<e;r++)t.push(.39894*Math.exp(-.5*r*r/(n*n))/n);let r=[],i=[];for(let n=1;n<e;n+=2){let a=t[n],o=n+1<e?t[n+1]:0,s=a+o;r.push((n*a+(n+1)*o)/s),i.push(s)}return new d({defines:{KERNEL_PAIRS:r.length},uniforms:{colorTexture:{value:null},invSize:{value:new c(.5,.5)},direction:{value:new c(.5,.5)},centerWeight:{value:t[0]},gaussianOffsets:{value:r},gaussianWeights:{value:i}},vertexShader:`

				varying vec2 vUv;

				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}`,fragmentShader:`

				#include <common>

				varying vec2 vUv;

				uniform sampler2D colorTexture;
				uniform vec2 invSize;
				uniform vec2 direction;
				uniform float centerWeight;
				uniform float gaussianOffsets[KERNEL_PAIRS];
				uniform float gaussianWeights[KERNEL_PAIRS];

				void main() {

					vec3 diffuseSum = texture2D( colorTexture, vUv ).rgb * centerWeight;

					for ( int i = 0; i < KERNEL_PAIRS; i ++ ) {

						vec2 uvOffset = direction * invSize * gaussianOffsets[ i ];
						vec3 sample1 = texture2D( colorTexture, vUv + uvOffset ).rgb;
						vec3 sample2 = texture2D( colorTexture, vUv - uvOffset ).rgb;
						diffuseSum += ( sample1 + sample2 ) * gaussianWeights[ i ];

					}

					gl_FragColor = vec4( diffuseSum, 1.0 );

				}`})}_getCompositeMaterial(e){return new d({defines:{NUM_MIPS:e},uniforms:{blurTexture1:{value:null},blurTexture2:{value:null},blurTexture3:{value:null},blurTexture4:{value:null},blurTexture5:{value:null},bloomStrength:{value:1},bloomFactors:{value:null},bloomTintColors:{value:null},bloomRadius:{value:0}},vertexShader:`

				varying vec2 vUv;

				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}`,fragmentShader:`

				varying vec2 vUv;

				uniform sampler2D blurTexture1;
				uniform sampler2D blurTexture2;
				uniform sampler2D blurTexture3;
				uniform sampler2D blurTexture4;
				uniform sampler2D blurTexture5;
				uniform float bloomStrength;
				uniform float bloomRadius;
				uniform float bloomFactors[NUM_MIPS];
				uniform vec3 bloomTintColors[NUM_MIPS];

				float lerpBloomFactor( const in float factor ) {

					float mirrorFactor = 1.2 - factor;
					return mix( factor, mirrorFactor, bloomRadius );

				}

				void main() {

					// 3.0 for backwards compatibility with previous alpha-based intensity
					vec3 bloom = 3.0 * bloomStrength * (
						lerpBloomFactor( bloomFactors[ 0 ] ) * bloomTintColors[ 0 ] * texture2D( blurTexture1, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 1 ] ) * bloomTintColors[ 1 ] * texture2D( blurTexture2, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 2 ] ) * bloomTintColors[ 2 ] * texture2D( blurTexture3, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 3 ] ) * bloomTintColors[ 3 ] * texture2D( blurTexture4, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 4 ] ) * bloomTintColors[ 4 ] * texture2D( blurTexture5, vUv ).rgb
					);

					float bloomAlpha = max( bloom.r, max( bloom.g, bloom.b ) );
					gl_FragColor = vec4( bloom, bloomAlpha );

				}`})}};F.BlurDirectionX=new c(1,0),F.BlurDirectionY=new c(0,1);var I={name:`OutputShader`,uniforms:{tDiffuse:{value:null},toneMappingExposure:{value:1}},vertexShader:`
		precision highp float;

		uniform mat4 modelViewMatrix;
		uniform mat4 projectionMatrix;

		attribute vec3 position;
		attribute vec2 uv;

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		precision highp float;

		uniform sampler2D tDiffuse;

		#include <tonemapping_pars_fragment>
		#include <colorspace_pars_fragment>

		varying vec2 vUv;

		void main() {

			gl_FragColor = texture2D( tDiffuse, vUv );

			// tone mapping

			#ifdef LINEAR_TONE_MAPPING

				gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );

			#elif defined( REINHARD_TONE_MAPPING )

				gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );

			#elif defined( CINEON_TONE_MAPPING )

				gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );

			#elif defined( ACES_FILMIC_TONE_MAPPING )

				gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );

			#elif defined( AGX_TONE_MAPPING )

				gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );

			#elif defined( NEUTRAL_TONE_MAPPING )

				gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );

			#elif defined( CUSTOM_TONE_MAPPING )

				gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );

			#endif

			// color space

			#ifdef SRGB_TRANSFER

				gl_FragColor = sRGBTransferOETF( gl_FragColor );

			#endif

		}`},L=class extends T{constructor(){super(),this.isOutputPass=!0,this.uniforms=g.clone(I.uniforms),this.material=new a({name:I.name,uniforms:this.uniforms,vertexShader:I.vertexShader,fragmentShader:I.fragmentShader}),this._fsQuad=new O(this.material),this._outputColorSpace=null,this._toneMapping=null}render(e,t,n){this.uniforms.tDiffuse.value=n.texture,this.uniforms.toneMappingExposure.value=e.toneMappingExposure,(this._outputColorSpace!==e.outputColorSpace||this._toneMapping!==e.toneMapping)&&(this._outputColorSpace=e.outputColorSpace,this._toneMapping=e.toneMapping,this.material.defines={},b.getTransfer(this._outputColorSpace)===`srgb`&&(this.material.defines.SRGB_TRANSFER=``),this._toneMapping===1?this.material.defines.LINEAR_TONE_MAPPING=``:this._toneMapping===2?this.material.defines.REINHARD_TONE_MAPPING=``:this._toneMapping===3?this.material.defines.CINEON_TONE_MAPPING=``:this._toneMapping===4?this.material.defines.ACES_FILMIC_TONE_MAPPING=``:this._toneMapping===6?this.material.defines.AGX_TONE_MAPPING=``:this._toneMapping===7?this.material.defines.NEUTRAL_TONE_MAPPING=``:this._toneMapping===5&&(this.material.defines.CUSTOM_TONE_MAPPING=``),this.material.needsUpdate=!0),this.renderToScreen===!0?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this._fsQuad.render(e))}dispose(){this.material.dispose(),this._fsQuad.dispose()}},R=class extends f{constructor(){super(),this.name=`RoomEnvironment`,this.position.y=-3.5;let e=new m;e.deleteAttribute(`uv`);let t=new _({side:1}),n=new _,r=new u(16777215,900,28,2);r.position.set(.418,16.199,.3),this.add(r);let i=new x(e,t);i.position.set(-.757,13.219,.717),i.scale.set(31.713,28.305,28.591),this.add(i);let a=new o(e,n,6),c=new s;c.position.set(-10.906,2.009,1.846),c.rotation.set(0,-.195,0),c.scale.set(2.328,7.905,4.651),c.updateMatrix(),a.setMatrixAt(0,c.matrix),c.position.set(-5.607,-.754,-.758),c.rotation.set(0,.994,0),c.scale.set(1.97,1.534,3.955),c.updateMatrix(),a.setMatrixAt(1,c.matrix),c.position.set(6.167,.857,7.803),c.rotation.set(0,.561,0),c.scale.set(3.927,6.285,3.687),c.updateMatrix(),a.setMatrixAt(2,c.matrix),c.position.set(-2.017,.018,6.124),c.rotation.set(0,.333,0),c.scale.set(2.002,4.566,2.064),c.updateMatrix(),a.setMatrixAt(3,c.matrix),c.position.set(2.291,-.756,-2.621),c.rotation.set(0,-.286,0),c.scale.set(1.546,1.552,1.496),c.updateMatrix(),a.setMatrixAt(4,c.matrix),c.position.set(-2.193,-.369,-5.547),c.rotation.set(0,.516,0),c.scale.set(3.875,3.487,2.986),c.updateMatrix(),a.setMatrixAt(5,c.matrix),this.add(a);let l=new x(e,z(50));l.position.set(-16.116,14.37,8.208),l.scale.set(.1,2.428,2.739),this.add(l);let d=new x(e,z(50));d.position.set(-16.109,18.021,-8.207),d.scale.set(.1,2.425,2.751),this.add(d);let f=new x(e,z(17));f.position.set(14.904,12.198,-1.832),f.scale.set(.15,4.265,6.331),this.add(f);let p=new x(e,z(43));p.position.set(-.462,8.89,14.52),p.scale.set(4.38,5.441,.088),this.add(p);let h=new x(e,z(20));h.position.set(3.235,11.486,-12.541),h.scale.set(2.5,2,.1),this.add(h);let g=new x(e,z(100));g.position.set(0,20,0),g.scale.set(1,.1,1),this.add(g)}dispose(){let e=new Set;this.traverse(t=>{t.isMesh&&(e.add(t.geometry),e.add(t.material))});for(let t of e)t.dispose()}};function z(e){return new i({color:0,emissive:16777215,emissiveIntensity:e})}var B=(e,t)=>e+Math.random()*(t-e),V=[[45,46,52,57],[44,50,51,56],[43,49,55,56],[41,47,48,53],[45,51,52,58],[46,52,53,57]],H=[76,72,69,72,76,75,76,72,71,68,69,64],U=class{ac=null;bus=null;verb=null;nodes=[];pad=null;padF=null;tremolo=null;drone=null;wind=null;whistle=null;whistleF=null;noiseBuf=null;chord=0;nextChord=0;nextLull=4;lullStep=-1;nextLullNote=0;nextWhisper=7;nextScrape=10;nextShriek=18;nextBraam=9;nextBeat=0;nextDrum=0;drumStep=0;t=0;level=0;intensity=0;windLevel=.3;on=!0;opts;constructor(e={}){this.opts=e}tick(n){let r=t();if(!r){this.ac&&this.teardown();return}r.ac!==this.ac&&this.build(r.ac,r.dest);let i=this.ac.currentTime;this.t+=n,this.level+=(+!!this.on-this.level)*Math.min(1,n*.5),this.bus.gain.setTargetAtTime((this.opts.volume??1)*this.level,i,.15);let a=this.intensity;if(this.drone.gain.setTargetAtTime(.11+a*.06,i,.6),this.pad.gain.gain.setTargetAtTime((.022+.018*(.5+.5*Math.sin(this.t*.31)))*(.7+a*.8),i,.8),this.padF.frequency.setTargetAtTime(700+a*1600,i,1),this.tremolo.gain.setTargetAtTime(Math.max(0,a-.4)*.09,i,.6),this.wind&&(this.wind.gain.setTargetAtTime(.05+this.windLevel*.22,i,.3),this.whistle.gain.setTargetAtTime(this.windLevel*this.windLevel*.035,i,.3),this.whistleF.frequency.setTargetAtTime(900+this.windLevel*900,i,.5)),!(this.level<.05)){if(this.nextChord-=n,this.nextChord<=0){this.nextChord=B(7,11)*(1.1-a*.5),this.chord=(this.chord+1+Math.floor(Math.random()*3))%V.length;let t=V[this.chord];this.pad.oscs.forEach((n,r)=>{let a=t[Math.floor(r/2)%t.length];n.frequency.setTargetAtTime(e(a)*(r%2?1.004:.996),i,1.2)})}if(a<.55){if(this.lullStep<0)this.nextLull-=n,this.nextLull<=0&&(this.lullStep=0);else if(this.nextLullNote-=n,this.nextLullNote<=0){let e=H[this.lullStep]+(Math.random()<.12?Math.random()<.5?-1:1:0);this.bell(e,.09),this.nextLullNote=this.lullStep%4==3?1.1:.55+Math.random()*.08,++this.lullStep>=H.length&&(this.lullStep=-1,this.nextLull=B(10,18))}}if(this.nextWhisper-=n,this.nextWhisper<=0&&(this.nextWhisper=B(8,16)*(1.2-a*.6),this.whisper()),this.nextScrape-=n,this.nextScrape<=0&&(this.nextScrape=B(10,20),this.scrape()),this.nextShriek-=n,this.nextShriek<=0&&(this.nextShriek=B(16,30)*(1.2-a*.6),this.shriek(.6+a*.6)),this.nextBraam-=n,this.nextBraam<=0&&(this.nextBraam=B(18,32),this.braam(.8+a*.4)),this.nextBeat-=n,a>.2&&this.nextBeat<=0&&(this.nextBeat=60/(60+a*70),this.heart(0,.4*a),this.heart(.17,.26*a)),this.nextDrum-=n,a>.55&&this.nextDrum<=0){let e=[1,0,.6,0,1,.5,.7,0];this.nextDrum=.3;let t=e[this.drumStep++%e.length];t&&this.drum(.35*t*(a-.4))}}}stinger(n=1){if(!t()||!this.ac||!this.bus)return;let r=this.ac,i=r.currentTime;for(let t of[45,46,51,52,57,58,63,64]){let a=r.createOscillator();a.type=`sawtooth`,a.frequency.value=e(t)*(1+(Math.random()-.5)*.012);let o=r.createBiquadFilter();o.type=`lowpass`,o.frequency.setValueAtTime(5e3,i),o.frequency.exponentialRampToValueAtTime(500,i+2.2);let s=this.env(i,.015,2.6,.06*n);a.connect(o).connect(s),s.connect(this.bus),s.connect(this.verb),a.start(i),a.stop(i+2.7)}this.shriek(1.2*n),this.drum(.7*n),this.braam(.8*n)}flicker(e){let n=t();if(!n||!this.ac||!this.bus)return;let r=this.ac,i=r.currentTime,a=r.createOscillator();a.type=`square`,a.frequency.value=e?120:100;let o=r.createBiquadFilter();o.type=`bandpass`,o.frequency.value=e?2400:900;let s=this.env(i,.003,e?.18:.3,e?.06:.05);a.connect(o).connect(s).connect(n.dest),a.start(i),a.stop(i+.35)}dispose(){this.teardown()}build(t,n){this.teardown(),this.ac=t;let r=t.sampleRate*2;this.noiseBuf=t.createBuffer(1,r,t.sampleRate);let i=this.noiseBuf.getChannelData(0),a=0;for(let e=0;e<r;e++)a=(a+(Math.random()*2-1)*.12)*.985,i[e]=a*3+(Math.random()*2-1)*.15;this.bus=t.createGain(),this.bus.gain.value=0,this.bus.connect(n);let o=t.createConvolver(),s=t.createBuffer(2,Math.floor(t.sampleRate*4.5),t.sampleRate);for(let e=0;e<2;e++){let t=s.getChannelData(e),n=0;for(let e=0;e<t.length;e++)n+=(Math.random()*2-1-n)*.35,t[e]=n*(1-e/t.length)**2.2}o.buffer=s,this.verb=t.createGain(),this.verb.gain.value=.7,this.verb.connect(o),o.connect(this.bus);let c=t.createBiquadFilter();c.type=`lowpass`,c.frequency.value=420,c.Q.value=5,this.drone=t.createGain(),this.drone.gain.value=0,c.connect(this.drone).connect(this.bus);for(let[e,n]of[[55,`sawtooth`],[58.27,`sawtooth`],[110.3,`sawtooth`],[27.5,`sine`]]){let r=t.createOscillator();r.type=n,r.frequency.value=e,r.connect(c),this.start(r)}this.lfo(.05,260,c.frequency),this.padF=t.createBiquadFilter(),this.padF.type=`lowpass`,this.padF.frequency.value=900,this.padF.Q.value=.7;let l=t.createGain();l.gain.value=0,this.padF.connect(l),l.connect(this.bus),l.connect(this.verb);let u=t.createOscillator();u.frequency.value=4.6;let d=t.createGain();d.gain.value=1.6,u.connect(d),this.start(u);let f=[];for(let n=0;n<8;n++){let r=t.createOscillator();r.type=`sawtooth`,r.frequency.value=e(V[0][Math.floor(n/2)])*(n%2?1.004:.996),d.connect(r.detune),r.connect(this.padF),this.start(r),f.push(r)}this.pad={oscs:f,gain:l},this.tremolo=t.createGain(),this.tremolo.gain.value=0;let p=t.createGain();p.gain.value=.5,this.lfo(11,.5,p.gain),this.tremolo.connect(p),p.connect(this.bus),p.connect(this.verb);for(let n of[81,82,87,88]){let r=t.createOscillator();r.type=`sawtooth`,r.frequency.value=e(n);let i=t.createBiquadFilter();i.type=`lowpass`,i.frequency.value=3e3,r.connect(i).connect(this.tremolo),this.start(r)}if(this.opts.wind){let e=t.createBufferSource();e.buffer=this.noiseBuf,e.loop=!0;let r=t.createBiquadFilter();r.type=`lowpass`,r.frequency.value=520,this.wind=t.createGain(),this.wind.gain.value=0,e.connect(r).connect(this.wind).connect(n),this.lfo(.13,160,r.frequency),this.start(e);let i=t.createBufferSource();i.buffer=this.noiseBuf,i.loop=!0,this.whistleF=t.createBiquadFilter(),this.whistleF.type=`bandpass`,this.whistleF.Q.value=9,this.whistleF.frequency.value=1200,this.whistle=t.createGain(),this.whistle.gain.value=0,i.connect(this.whistleF).connect(this.whistle).connect(n),i.start(0,.7),this.nodes.push(i)}this.nextChord=0}teardown(){for(let e of this.nodes)try{e.stop(),e.disconnect()}catch{}this.nodes=[];try{this.bus?.disconnect(),this.wind?.disconnect(),this.whistle?.disconnect()}catch{}this.ac=null,this.bus=this.verb=this.tremolo=this.drone=this.wind=this.whistle=null,this.pad=null,this.padF=this.whistleF=null}start(e){e.start(),this.nodes.push(e)}lfo(e,t,n){let r=this.ac,i=r.createOscillator();i.frequency.value=e;let a=r.createGain();a.gain.value=t,i.connect(a).connect(n),this.start(i)}env(e,t,n,r){let i=this.ac.createGain();return i.gain.setValueAtTime(1e-4,e),i.gain.exponentialRampToValueAtTime(Math.max(2e-4,r),e+t),i.gain.exponentialRampToValueAtTime(1e-4,e+n),i}pan(){let e=this.ac.createStereoPanner();return e.pan.value=B(-.9,.9),e}bell(t,n,r=0){let i=this.ac,a=i.currentTime+r,o=e(t)*(1+(Math.random()-.5)*.014);for(let[e,t,r]of[[1,1,`sine`],[2.01,.4,`triangle`],[3.98,.15,`sine`],[5.4,.06,`sine`]]){let s=i.createOscillator();s.type=r,s.frequency.value=o*e;let c=this.env(a,.003,3.4/e,n*t);s.connect(c),c.connect(this.bus),c.connect(this.verb),s.start(a),s.stop(a+3.5)}}whisper(){let e=this.ac,t=e.currentTime,n=B(1.2,2.4),r=e.createBufferSource();r.buffer=this.noiseBuf;let i=e.createBiquadFilter();i.type=`highpass`,i.frequency.value=500;let a=this.env(t,.25,n,.5),o=e.createGain();o.gain.value=.5;let s=e.createOscillator();s.frequency.value=B(3,6);let c=e.createGain();c.gain.value=.5,s.connect(c).connect(o.gain),s.start(t),s.stop(t+n);for(let[r,a]of[[B(600,900),B(300,700)],[B(1800,2600),B(1100,2200)]]){let s=e.createBiquadFilter();s.type=`bandpass`,s.Q.value=8,s.frequency.setValueAtTime(r,t),s.frequency.linearRampToValueAtTime(a,t+n),i.connect(s).connect(o)}let l=this.pan();r.connect(i),o.connect(a).connect(l),l.connect(this.bus),l.connect(this.verb),r.start(t,Math.random()),r.stop(t+n+.05)}scrape(){let e=this.ac,t=e.currentTime,n=e.createBufferSource();n.buffer=this.noiseBuf;let r=e.createBiquadFilter();r.type=`bandpass`,r.Q.value=16,r.frequency.setValueAtTime(B(1800,3200),t),r.frequency.linearRampToValueAtTime(B(1100,2200),t+2.4);let i=this.env(t,1,3.2,.9),a=this.pan();n.connect(r).connect(i).connect(a),a.connect(this.verb),a.connect(this.bus),n.start(t,Math.random()),n.stop(t+3.3)}shriek(e){let t=this.ac,n=t.currentTime,r=B(1100,1500);for(let i=0;i<3;i++){let a=t.createOscillator();a.type=`sawtooth`,a.frequency.setValueAtTime(r*(1+i*.06),n),a.frequency.exponentialRampToValueAtTime(r*(1.9+i*.07),n+1.6);let o=t.createOscillator();o.frequency.value=7+i;let s=t.createGain();s.gain.value=25,o.connect(s).connect(a.frequency);let c=t.createBiquadFilter();c.type=`bandpass`,c.frequency.value=2400,c.Q.value=.8;let l=this.env(n,.5,2.2,.025*e);a.connect(c).connect(l),l.connect(this.bus),l.connect(this.verb);for(let e of[a,o])e.start(n),e.stop(n+2.3)}}braam(t){let n=this.ac,r=n.currentTime,i=n.createBiquadFilter();i.type=`lowpass`,i.Q.value=3,i.frequency.setValueAtTime(150,r),i.frequency.exponentialRampToValueAtTime(1700,r+.5),i.frequency.exponentialRampToValueAtTime(220,r+3);let a=this.env(r,.25,3.4,.11*t);i.connect(a),a.connect(this.bus),a.connect(this.verb);for(let t of[33,33.1,40,45,46]){let a=n.createOscillator();a.type=`sawtooth`,a.frequency.value=e(t),a.connect(i),a.start(r),a.stop(r+3.5)}}heart(e,t){let n=this.ac,r=n.currentTime+e;for(let[e,i,a]of[[58,`sine`,1],[116,`triangle`,.5]]){let o=n.createOscillator();o.type=i,o.frequency.setValueAtTime(e,r),o.frequency.exponentialRampToValueAtTime(e*.6,r+.15);let s=this.env(r,.006,.18,t*a);o.connect(s).connect(this.bus),o.start(r),o.stop(r+.22)}}drum(e){let t=this.ac,n=t.currentTime,r=t.createOscillator();r.type=`sine`,r.frequency.setValueAtTime(110,n),r.frequency.exponentialRampToValueAtTime(45,n+.35);let i=this.env(n,.004,.45,e);r.connect(i),i.connect(this.bus),i.connect(this.verb),r.start(n),r.stop(n+.5);let a=t.createBufferSource();a.buffer=this.noiseBuf;let o=t.createBiquadFilter();o.type=`bandpass`,o.frequency.value=350;let s=this.env(n,.002,.12,e*.8);a.connect(o).connect(s).connect(this.bus),a.start(n,Math.random()),a.stop(n+.15)}},W={pistol:{crack:.9,crackF:3500,crackDur:.014,body:.9,bodyF:1300,bodyQ:.8,bodyDur:.09,punch:1,f0:150,f1:55,punchDur:.09,room:.5,rumble:.25,click:.25},magnum:{crack:1.1,crackF:3e3,crackDur:.02,body:1.1,bodyF:950,bodyQ:.7,bodyDur:.16,punch:1.35,f0:110,f1:38,punchDur:.2,room:.75,rumble:.45,click:.15},rifle:{crack:1,crackF:4500,crackDur:.011,body:.95,bodyF:1700,bodyQ:.75,bodyDur:.075,punch:.95,f0:125,f1:48,punchDur:.08,room:.45,rumble:.3,click:.12},smg:{crack:.75,crackF:4200,crackDur:.009,body:.75,bodyF:2100,bodyQ:.8,bodyDur:.055,punch:.65,f0:160,f1:70,punchDur:.055,room:.35,rumble:.15,click:.1},dmr:{crack:1.25,crackF:4e3,crackDur:.016,body:1.1,bodyF:1150,bodyQ:.7,bodyDur:.14,punch:1.35,f0:95,f1:34,punchDur:.22,room:.9,rumble:.55,click:.3},shotgun:{crack:.85,crackF:2600,crackDur:.02,body:1.3,bodyF:700,bodyQ:.5,bodyDur:.22,punch:1.55,f0:80,f1:30,punchDur:.3,room:.85,rumble:.6,click:0},autoshotgun:{crack:.8,crackF:2700,crackDur:.018,body:1.2,bodyF:760,bodyQ:.5,bodyDur:.17,punch:1.35,f0:85,f1:32,punchDur:.22,room:.6,rumble:.4,click:.1},minigun:{crack:.6,crackF:4800,crackDur:.008,body:.7,bodyF:2500,bodyQ:.9,bodyDur:.045,punch:.6,f0:150,f1:70,punchDur:.045,room:.25,rumble:.1,click:0},launcher:{crack:.2,crackF:2e3,crackDur:.02,body:.7,bodyF:450,bodyQ:.8,bodyDur:.1,punch:1.2,f0:130,f1:60,punchDur:.14,room:.4,rumble:.2,click:.3},rocket:{crack:.3,crackF:2e3,crackDur:.03,body:.9,bodyF:600,bodyQ:.6,bodyDur:.35,punch:1.1,f0:90,f1:40,punchDur:.25,room:.6,rumble:.5,click:0},rail:{crack:1.2,crackF:5e3,crackDur:.03,body:.8,bodyF:2400,bodyQ:1.5,bodyDur:.3,punch:1.4,f0:80,f1:28,punchDur:.35,room:.9,rumble:.5,click:0},arc:{crack:.5,crackF:6e3,crackDur:.04,body:.35,bodyF:3200,bodyQ:3,bodyDur:.09,punch:.3,f0:60,f1:50,punchDur:.1,room:.25,rumble:0,click:0},explosion:{crack:.6,crackF:1800,crackDur:.05,body:1.5,bodyF:500,bodyQ:.4,bodyDur:.9,punch:1.8,f0:65,f1:22,punchDur:.85,room:1,rumble:1,click:0}},G=null,K=.7;function q(e){K=Math.max(0,Math.min(1,e))}function J(e){let t=1024,n=new Float32Array(new ArrayBuffer(t*4));for(let r=0;r<t;r++){let t=r/1023*2-1;n[r]=Math.tanh(t*e)/Math.tanh(e)}return n}function Y(){let e=t();if(!e)return null;if(G?.ac===e.ac)return G;let{ac:n,dest:r}=e,i=n.createDynamicsCompressor();i.threshold.value=-20,i.knee.value=8,i.ratio.value=6,i.attack.value=.002,i.release.value=.18;let a=n.createGain();a.gain.value=1.9,i.connect(a).connect(r);let o=n.createGain();o.connect(i);let s=n.createConvolver(),c=Math.floor(n.sampleRate*2.4),l=n.createBuffer(2,c,n.sampleRate);for(let e=0;e<2;e++){let t=l.getChannelData(e);for(let e=0;e<c;e++)t[e]=(Math.random()*2-1)*(1-e/c)**3.2*.6;for(let e=0;e<14;e++){let r=Math.floor(n.sampleRate*(.008+Math.random()*.09));t[r]+=(Math.random()<.5?-1:1)*(.9-e*.05)}}s.buffer=l;let u=n.createGain();u.connect(s);let d=n.createGain();d.gain.value=.55,s.connect(d).connect(i);let f=n.createBuffer(1,n.sampleRate,n.sampleRate),p=f.getChannelData(0);for(let e=0;e<p.length;e++)p[e]=Math.random()*2-1;let m=n.createBuffer(1,n.sampleRate,n.sampleRate),h=m.getChannelData(0),g=0;for(let e=0;e<h.length;e++)g=(g+(Math.random()*2-1)*.1)*.99,h[e]=g*3.2;let _=n.createWaveShaper();return _.curve=J(3),_.connect(o),G={ac:n,input:o,send:u,white:f,brown:m,clip:_,soft:J(2)},G}function X(e,t,n,r,i=.0015){let a=e.createGain();return a.gain.setValueAtTime(1e-4,t),a.gain.exponentialRampToValueAtTime(Math.max(2e-4,n),t+i),a.gain.exponentialRampToValueAtTime(1e-4,t+r),a}function Z(e,t,n,r){let i=e.ac.createBufferSource();return i.buffer=t,i.loop=!0,i.start(n,Math.random()*.8),i.stop(n+r+.05),i}function Q(e,t=1,n=K){let r=Y();if(!r||t<=.01)return;let i=W[e],{ac:a}=r,o=a.currentTime+.001,s=()=>.9+Math.random()*.2,c=1-Math.min(1,t),l=(e,t)=>{let i=a.createGain();i.gain.value=t*n*(.6+c),e.connect(i).connect(r.send)};if(i.crack>0){let e=Z(r,r.white,o,i.crackDur),n=a.createBiquadFilter();n.type=`highpass`,n.frequency.value=i.crackF*s()*(1-c*.6);let u=X(a,o,.55*i.crack*t*(1-c*.7),i.crackDur,6e-4);e.connect(n).connect(u).connect(r.clip),l(u,.4)}{let e=Z(r,r.white,o,i.bodyDur*1.3),n=a.createBiquadFilter();n.type=`bandpass`,n.frequency.setValueAtTime(i.bodyF*s(),o),n.frequency.exponentialRampToValueAtTime(Math.max(80,i.bodyF*.35),o+i.bodyDur),n.Q.value=i.bodyQ;let u=a.createBiquadFilter();u.type=`lowpass`,u.frequency.value=9e3*(1-c*.8);let d=X(a,o,.7*i.body*t,i.bodyDur*1.3,.001);e.connect(n).connect(u).connect(d).connect(r.clip),l(d,1)}{let e=a.createOscillator();e.type=`sine`,e.frequency.setValueAtTime(i.f0*s(),o),e.frequency.exponentialRampToValueAtTime(i.f1,o+i.punchDur);let n=a.createWaveShaper();n.curve=r.soft;let c=X(a,o,.8*i.punch*t,i.punchDur*1.4,.002);e.connect(n).connect(c).connect(r.input),l(c,.3),e.start(o),e.stop(o+i.punchDur*1.4+.05)}if(i.rumble>0){let e=Z(r,r.brown,o,.3+i.rumble*1.2),s=a.createBiquadFilter();s.type=`lowpass`,s.frequency.setValueAtTime(900,o),s.frequency.exponentialRampToValueAtTime(120,o+.3+i.rumble);let c=X(a,o+.01,.35*i.rumble*t*(.4+n),.3+i.rumble*1.2,.02);e.connect(s).connect(c).connect(r.input)}if(i.click>0&&t>.5)for(let[e,n]of[[.035,3800],[.06,2600]]){let c=Z(r,r.white,o+e,.012),l=a.createBiquadFilter();l.type=`bandpass`,l.frequency.value=n*s(),l.Q.value=9;let u=X(a,o+e,.5*i.click*t,.014,5e-4);c.connect(l).connect(u).connect(r.input)}if(e===`rocket`){let e=Z(r,r.white,o,.9),n=a.createBiquadFilter();n.type=`bandpass`,n.Q.value=2,n.frequency.setValueAtTime(700,o),n.frequency.exponentialRampToValueAtTime(2600,o+.8);let i=X(a,o,.35*t,.9,.05);e.connect(n).connect(i).connect(r.input)}else if(e===`rail`||e===`arc`){let n=a.createOscillator();n.type=`sawtooth`,n.frequency.setValueAtTime(e===`rail`?3200:120,o),n.frequency.exponentialRampToValueAtTime(e===`rail`?260:90,o+(e===`rail`?.6:.1));let i=X(a,o,(e===`rail`?.14:.12)*t,e===`rail`?.6:.11);n.connect(i).connect(r.input),l(i,.6),n.start(o),n.stop(o+.65)}}export{L as a,M as c,R as i,q as n,F as o,U as r,N as s,Q as t};