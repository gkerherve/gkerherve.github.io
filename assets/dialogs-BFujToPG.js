import{a as e}from"./rolldown-runtime-B0Z9INg1.js";import{i as t}from"./react-CgaLaEa2.js";import{t as n}from"./jsx-runtime-B74pBk57.js";import{t as r}from"./kernel-JYfTM1Jv.js";var i=`/apps/khervefitting/py/`,a=`/kherveos/khervefitting`,o=`KF-JSON`,s=`/KF-JSON`,c=`kfcore/__init__.py,kfcore/compat.py,kfcore/numberformat.py,kfcore/shirley.py,kfcore/peak_functions.py,kfcore/backgrounds.py,kfcore/grid.py,kfcore/session.py,kfcore/uncertainty.py,kfcore/fitting.py,kfcore/sheets.py,kfcore/background.py,kfcore/curves.py,kfcore/results.py,kfcore/workbook.py,kfcore/importers.py,kfcore/peaklib.py,kfcore/sheetops.py,kfcore/becorr.py,kfcore/samples.py,kfcore/survey.py,kfcore/dparam.py,kfcore/area.py,kfcore/pca.py,kfcore/fitops.py,kfcore/interact.py,kfweb/__init__.py,kfweb/gridstyle.py,kfweb/tables.py,kfweb/features.py,kfweb/bridge.py,data/library.json,data/autoid.json,data/splittings.json`.split(`,`),l=[`lmfit-1.3.2-py3-none-any.whl`,`asteval-1.0.5-py3-none-any.whl`,`dill-0.4.1-py3-none-any.whl`,`openpyxl-3.1.2-py2.py3-none-any.whl`,`et_xmlfile-1.1.0-py3-none-any.whl`,`vamas-0.1.1-py3-none-any.whl`],u=new Set,d=e=>JSON.stringify(e),f=`def _kf_wheels(wheels, root):
    import base64, io, os, zipfile
    site = root + '/site'
    os.makedirs(site, exist_ok=True)
    for name, b64 in wheels.items():
        mark = site + '/.' + name
        if os.path.exists(mark):
            continue
        zipfile.ZipFile(io.BytesIO(base64.b64decode(b64))).extractall(site)
        open(mark, 'w').close()


def _kf_install(files, root):
    import importlib, os, sys
    for rel, text in files.items():
        path = root + '/' + rel
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(text)
    if root not in sys.path:
        sys.path.insert(0, root)
    site = root + '/site'
    if site not in sys.path:
        sys.path.insert(1, site)
    for name in [m for m in sys.modules if m.split('.')[0] in ('kfweb', 'kfcore')]:
        del sys.modules[name]
    importlib.invalidate_caches()
`,p=class{kernel;onProgress=()=>{};onBusy=()=>{};onLost=()=>{};queue=[];running=!1;installedFor=null;installs=0;files=null;wheels=null;waiters=[];unsub;disposed=!1;config;constructor(e,t){this.config=t??{install:()=>this.kfInstall(),run:e=>`await __import__('kfweb.bridge', fromlist=['run']).run(${d(JSON.stringify(e))})`,parse:e=>{let t=e.lastIndexOf(o),n=t>=0?e.indexOf(s,t):-1;return t>=0&&n>t?JSON.parse(e.slice(t+9,n)):null}},this.kernel=new r(e),this.unsub=this.kernel.onStatus(e=>{(e===`off`||e===`dead`)&&(this.installedFor=null)})}get status(){return this.kernel.status}get pending(){return this.queue.length+ +!!this.running}call(e,t={}){return new Promise((n,r)=>{this.queue.push({op:e,args:t,resolve:n,reject:r}),this.onBusy(this.pending),this.pump()})}idle(){return!this.running&&!this.queue.length?Promise.resolve():new Promise(e=>this.waiters.push(e))}dispose(){this.disposed=!0,this.unsub();for(let e of this.queue)e.reject(Error(`${this.config.name??`KherveFitting`} was closed.`));this.queue=[],this.kernel.dispose()}loadFiles(){return this.files??=Promise.all(c.map(async e=>{let t=await fetch(i+e,{cache:`no-cache`});if(!t.ok){if(u.has(e))return null;throw Error(`${e}: HTTP ${t.status}`)}return[e,await t.text()]})).then(e=>Object.fromEntries(e.filter(e=>e!==null))).catch(e=>{throw this.files=null,e}),this.files}loadWheels(){return this.wheels??=Promise.all(l.map(async e=>{let t=await fetch(`${i}wheels/${e}`);if(!t.ok)throw Error(`wheels/${e}: HTTP ${t.status}`);return[e,m(new Uint8Array(await t.arrayBuffer()))]})).then(e=>Object.fromEntries(e)).catch(e=>{throw this.wheels=null,e}),this.wheels}async kfInstall(){let[e,t]=await Promise.all([this.loadFiles(),this.loadWheels()]);return`${f}_kf_wheels(__import__('json').loads(${d(JSON.stringify(t))}), ${d(a)})\n_kf_install(__import__('json').loads(${d(JSON.stringify(e))}), ${d(a)})\ndel _kf_install, _kf_wheels`}async install(){let e=await this.config.install();await this.kernel.start();let t=await this.kernel.runCell(e);if(!t.ok)throw Error(t.error?.message??`The fitting engine could not be installed.`);this.installedFor=this.kernel,this.installs++}async pump(){if(!(this.running||this.disposed)){this.running=!0;try{for(;this.queue.length&&!this.disposed;){if(this.installedFor!==this.kernel||this.kernel.status===`off`||this.kernel.status===`dead`){let e=this.installs>0;try{await this.install()}catch(e){let t=e instanceof Error?e:Error(String(e));for(let e of this.queue.splice(0))e.reject(t);break}e&&this.onLost()}await this.runBatch(this.queue.splice(0))}}finally{if(this.running=!1,this.onBusy(this.pending),this.queue.length)this.pump();else for(let e of this.waiters.splice(0))e()}}}async runBatch(e){let t=e.map(e=>({op:e.op,args:e.args})),n=this.config.run(t),r=``,i=null,a=null;try{let e=await this.kernel.runCell(n,{onStdout:e=>r+=e,onStatus:e=>this.onProgress(e)});i=this.config.parse(r),i||(a=Error(e.error?`${e.error.type}: ${e.error.message}`:`Python gave no answer.`))}catch(e){a=e instanceof Error?e:Error(String(e))}finally{this.onProgress(null)}if(!i||i.length!==e.length){let t=a??Error(`Python answered the wrong number of requests.`);for(let n of e)n.reject(t);return}e.forEach((e,t)=>e.resolve(i[t]))}};function m(e){let t=``;for(let n=0;n<e.length;n+=32768)t+=String.fromCharCode(...e.subarray(n,n+32768));return btoa(t)}function h(e){let t=atob(e),n=new Uint8Array(t.length);for(let e=0;e<t.length;e++)n[e]=t.charCodeAt(e);return n}var g=e(t(),1),ee=100/72,_=[1,2,2.5,5,10],v=[..._.slice(0,-1).map(e=>.1*e),..._,10*_[1]];function te(e,t,n,r=100){let i=Math.abs(t-e),a=(t+e)/2,o=0;return Math.abs(a)/i<r||(o=Math.sign(a)*10**Math.floor(Math.log10(Math.abs(a)))),{scale:10**Math.floor(Math.log10(i/n)),offset:o}}function y(e,t){let n=Math.floor(e/t);return[n,e-n*t]}function b(e,t){let n=(n,r)=>{let i=1e-10;if(t>0){let n=Math.log10(t/e);i=Math.min(.4999,Math.max(1e-10,10**(n-12)))}return Math.abs(n-r)<i};return{le(t){let[r,i]=y(t,e);return n(i/e,1)?r+1:r},ge(t){let[r,i]=y(t,e);return n(i/e,0)?r:r+1}}}function x(e,t,n,r=2){if(!Number.isFinite(e)||!Number.isFinite(t))return[];if(t<e&&([e,t]=[t,e]),t===e){let n=e===0?1:Math.abs(e)*.001;e-=n,t+=n}let{scale:i,offset:a}=te(e,t,n),o=e-a,s=t-a,c=v.map(e=>e*i),l=(s-o)/n,u=c.findIndex(e=>e>=l);u<0&&(u=c.length-1);let d=[];for(let e=u;e>=0;e--){let t=c[e],n=Math.floor(o/t)*t,i=b(t,a),l=i.le(o-n),u=i.ge(s-n);d=[];for(let e=l;e<=u;e++)d.push(e*t+n);if(d.filter(e=>e<=s&&e>=o).length>=r)break}return d.map(e=>e+a)}function ne(e,t,n){let r=e/ee,i=t*(n===`x`?3:2);return Math.floor(r/i)}function re(e,t,n,r,i){return x(e,t,Math.max(1,Math.min(9,ne(n,r,i))))}function ie(e,t,n,r){if(e.length<2||r<2)return[];n<t&&([t,n]=[n,t]);let i=(e[1]-e[0])/r,a=e[0],o=Math.round((t-a)/i),s=Math.round((n-a)/i)+1,c=[];for(let e=o;e<s;e++){if(e%r===0)continue;let o=e*i+a;o>=t-i*1e-9&&o<=n+i*1e-9&&c.push(o)}return c}var S=`−`,ae=e=>e.startsWith(`-`)?S+e.slice(1):e;function oe(e,t,n,r){n<t&&([t,n]=[n,t]);let i=e.filter(e=>e>=t&&e<=n),a=0;if(i.length){let e=Math.min(...i),t=Math.max(...i);if(!(e===t||e<=0&&0<=t)){let[n,r]=[Math.abs(e),Math.abs(t)].sort((e,t)=>e-t),i=Math.sign(e)||1,o=Math.ceil(Math.log10(r)),s=o;for(;Math.floor(n/10**s)===Math.floor(r/10**s)&&s>-30;)s--;if(s+=1,(r-n)/10**s<=.01){for(s=o;!(r-n>=10**s)&&s>-30;)s--;s+=1}a=Math.floor(r/10**s)>=1e3?i*Math.floor(r/10**s)*10**s:0}}let o=0;if(i.length){let e=i.map(Math.abs),s;if(a)s=Math.floor(Math.log10(n-t));else{let t=Math.max(...e);s=t===0?0:Math.floor(Math.log10(t))}let[c,l]=r?[0,0]:[-5,6];(s<=c||s>=l)&&(o=s)}let s=(e.length<2?[...e,t,n]:e).map(e=>(e-a)/10**o),c=s.length?Math.max(...s)-Math.min(...s):0;c===0&&(c=Math.max(0,...s.map(Math.abs))),c===0&&(c=1);let l=Math.floor(Math.log10(c)),u=Math.max(0,3-l),d=.001*10**l;for(;u>=0;){let e=u;if(Math.max(...s.map(t=>Math.abs(t-C(t,e))))<d)--u;else break}return u+=1,{labels:e.map(e=>{let t=(e-a)/10**o;return Math.abs(t)<10**-(u+1)&&(t=0),ae(t.toFixed(u))}),order:o,offset:a}}function C(e,t){let n=10**t;return Math.round(e*n)/n}function se(e){let t=/^(Survey|SURVEY|survey|Wide|WIDE|wide)(\d+)/.exec(e);if(t)return t[1].charAt(0).toUpperCase()+t[1].slice(1).toLowerCase();let n=/^([A-Z][a-z]*)(\d+[spdfg])/.exec(e);return n?`${n[1]} ${n[2]}`:e}function w(e){let t=/^([A-Z][a-z]?\d+[spdf])/.exec(e);return t?t[1]:null}function T(e,t){if(!t)return e;let n=e.split(/\s+/).filter(Boolean);if(t.endsWith(`s`))return n.length>=2&&n[0]===t?n.slice(1).join(` `):e;if(`pdf`.includes(t.slice(-1))){let r=t.replace(/[.*+?^${}()|[\]\\]/g,`\\$&`),i=RegExp(`^${r}(?:\\d+/\\d+|\\$_\\{[\\d/]+\\}\\$)\\s+(.+)$`).exec(e);if(i)return i[1];if(n.length>=2&&n[0]===t)return n.slice(1).join(` `)}return e}function E(e){return e.replace(/(\d+\/\d+)/g,`$_{$1}$`)}function D(e){let t=[],n=/\$_\{([^}]*)\}\$/g,r=0;for(let i=n.exec(e);i;i=n.exec(e))i.index>r&&t.push({text:e.slice(r,i.index),sub:!1}),t.push({text:i[1],sub:!0}),r=i.index+i[0].length;return r<e.length&&t.push({text:e.slice(r),sub:!1}),t}function ce(e,t){let n=w(t),r=[];return e.forEach((e,t)=>{let i=E(e),a=i.replace(/\$.*?\$/g,``),o=a.split(/\s+/).filter(Boolean);a.trim().split(/\s+/).length>1&&o[1]&&r.push({index:t,text:T(i,n)})}),r}function O(e,t){let n=e.split(/\s+/).filter(Boolean),r=t.split(/\s+/).filter(Boolean);if(!n.length||!r.length)return!1;let i=e=>/^([A-Za-z]+\d+[spdf])/.exec(e)?.[1]??e,a=i(n[0]);if(a!==i(r[0]))return!1;let o=/\d([spdf])/.exec(a)?.[1],s=(e,t)=>e.some(e=>e.includes(t));return o===`p`?s(n,`3/2`)&&s(r,`1/2`):o===`d`?s(n,`5/2`)&&s(r,`3/2`):o===`f`&&s(n,`7/2`)&&s(r,`5/2`)}function le(e,t,n){let r=[];for(let t=0;t<e.length-1;t++)O(e[t],e[t+1])&&r.push(t,t+1);return e.map((e,i)=>{let a=r.indexOf(i);return a>=0&&a%2==1?{colour:t[(i-1)%t.length],alpha:n*.99,styleOf:i-1}:{colour:t[i%t.length],alpha:n,styleOf:i}})}var k={scatterSize:3,scatterColor:`#000000`,backgroundColor:`#804000`,backgroundAlpha:.8,envelopeColor:`#000000`,envelopeAlpha:.7,residualColor:`#0FF0D5`,residualAlpha:.4,peakColors:[`#0080C0`,`#FF0080`,`#FF8000`,`#8080C0`,`#FF0000`,`#00FFFF`,`#800000`,`#008000`,`#000080`,`#808000`,`#800080`,`#008080`,`#C0C0C0`,`#808080`,`#9B30FF`],peakAlpha:.7,peakLineColor:`black`,peakLineAlpha:.4,hatchDensity:3,font:`Calibri, Carlito, "Segoe UI", Arial, sans-serif`,axisTitleSize:11,axisNumberSize:11,xSublines:4,ySublines:1,legendFontSize:10,coreLevelTextSize:17};function A(e,t){let n=1/0,r=-1/0,i=1/0,a=-1/0;for(let o=0;o<e.length;o++){let s=e[o],c=t[o];s!==null&&Number.isFinite(s)&&(n=Math.min(n,s),r=Math.max(r,s)),c!=null&&Number.isFinite(c)&&(i=Math.min(i,c),a=Math.max(a,c))}if(!(n<r)||!(i<=a))return null;let o=i-.015*a,s=a*1.2;return s>o||(s=o+Math.abs(o||1)*.1),{xmin:n,xmax:r,ymin:o,ymax:s}}var j=[[`ID`,20],[`Peak
Label`,90],[`Position
(eV)`,80],[`Height
(CPS)`,60],[`FWHM
(eV)`,60],[`σ/γ (%)
L/G 
`,50],[`Area
(CPS.eV)`,70],[`σ
W_g`,45],[`γ
W_l`,45],[`W_g
Skew`,50],[`Conc.
(%)`,40],[`A/Aᴀ`,40],[`Split
(eV)`,40],[`Fitting Model`,130],[`Bkg Type`,130],[`Bkg Low
(eV)`,80],[`Bkg High
(eV)`,80],[`Bkg Offset Low
(CPS)`,100],[`Bkg Offset High
(CPS)`,100]].map(([e,t])=>({label:e,width:t})),M=[13,14,15,16,17,18],ue=[[`Peak
Label`,100],[`Position
(eV)`,55],[`Height
(CPS)`,55],[`FWHM
(eV)`,50],[`L/G 
σ/γ (%)`,50],[`Area
(CPS.eV)`,80],[`Atomic
(%)`,50],[` `,20],[`RSF`,30],[`TXFN`,30],[`ECF`,50],[`Instr.`,80],[`Fitting Model`,120],[`Corr. Area
(a.u.)`,60],[`σ or α
W_g`,80],[`γ or β
W_l`,70],[`Bkg Type`,70],[`Bkg Low
(eV)`,100],[`Bkg High
(eV)`,100],[`Bkg Offset Low
(CPS)`,80],[`Bkg Offset High
(CPS)`,80],[`Sheetname`,80],[`Position
Constraint`,120],[`Height
Constraint`,120],[`FWHM
Constraint`,120],[`L/G
Constraint`,70],[`Area
Constraint`,70],[`σ
Constraint`,70],[`γ
Constraint`,50],[`Weight
(%)`,45],[`Mass
(amu)`,40],[`± Position
(eV)`,60],[`± Height
(CPS)`,60],[`± FWHM
(eV)`,55],[`± L/G
(%)`,55],[`± Area
(CPS.eV)`,70],[`± Atomic
(%)`,60],[`Error
from`,110]].map(([e,t])=>({label:e,width:t})),de=(()=>{let e={1:31,2:32,3:33,4:34,5:35,6:36},t=new Set([31,32,33,34,35,36,37]),n=[];for(let r=0;r<ue.length;r++)t.has(r)||(n.push(r),r in e&&(n.push(e[r]),r===6&&n.push(37)));return n})(),fe=[2,4,12,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,32,34],pe=[31,32,33,34,35,36,37],me=[6,13,29];function he(e,t){return e%2==0?t===1||t>=2&&t<=9||t===13:t>=2&&t<=9}var N=[`GL (Area)`,`SGL (Area)`,`Voigt (Area)`,`Voigt (Area, L/G, S)`,`LA (Area, σ/γ, γ)`,`Voigt (Area, L/G, σ)`,`Voigt (Area, σ, γ)`,`Voigt (Area, L/G, σ, S)`,`LA (Area, σ, γ)`,`LA*G (Area, σ/γ, γ)`,`Pseudo-Voigt (Area)`,`ExpGauss.(Area, σ, γ)`,`GL (Height)`,`SGL (Height)`,`A*GL (Area, a, b)`,`A*SGL (Area, a, b)`,`LF (Area, σ, γ, w)`,`DL (A, σ, γ, aDL)`,`TLA (A, σ, γ, Wg)`,`SB (Height)`,`BWF Fano (Area, 1/q)`,`Pearson VII (Area, m)`],ge=[{name:`Best Models`,models:[`SGL (Area)`,`GL (Area)`,`LA (Area, σ/γ, γ)`,`Voigt (Area, L/G, σ)`]},{name:`Asymmetric`,models:[`LA (Area, σ, γ)`,`DL (A, σ, γ, aDL)`,`TLA (A, σ, γ, Wg)`,`DS*G (A, σ, γ, S)`,`DS (A, σ, γ)`,`ExpGauss.(Area, σ, γ)`]},{name:`Voigt`,models:[`Voigt (Area)`,`Voigt (Area, L/G, S)`,`Voigt (Area, L/G, σ)`,`Voigt (Area, σ, γ)`,`Voigt (Area, L/G, σ, S)`]},{name:`LA`,models:[`LA (Area, σ/γ, γ)`,`LA (Area, σ, γ)`,`LA*G (Area, σ/γ, γ)`,`LF (Area, σ, γ, w)`]},{name:`Others`,models:[`Pseudo-Voigt (Area)`,`GL (Height)`,`SGL (Height)`,`A*GL (Area, a, b)`,`A*SGL (Area, a, b)`,`SB (Height)`]},{name:`Raman / FTIR`,models:[`BWF Fano (Area, 1/q)`,`Pearson VII (Area, m)`]},{name:`Beta`,models:[`Voigt (Area, L/G, σ, S)`]}];[...new Set([...ge.flatMap(e=>e.models),...N])];var P=[`Smart`,`Shirley`,`Iterated Shirley`,`Linear`,`Offset`,`U4-Tougaard`,`U2-Tougaard`,`Spline Background------`,`Spline Shirley`,`Spline Tougaard`,`Active Background------`,`Active Shirley`,`Active Tougaard`,`Other Techniques-------`,`Poly-2`,`Poly-3`,`ALS`,`ALS-Raman`,`Arctan-XAS`,`Power-EELS`],_e=[`leastsq`,`least_squares`,`nelder`,`powell`,`cobyla`,`trust-constr`],ve=[`uniform`,`intensity-based`,`statistical-XPS`,`hybrid-XPS`],F=[`TPP-2M`,`Scofield`,`Wagner`,`EAL`,`None`];function ye(e){if(e===void 0||e.trim()===``)return null;let t=Number(e);return Number.isFinite(t)?t:null}function be(e){let t=[];for(let n=0;n<e.length;n+=2){let r=e[n],i=ye(r[2]),a=ye(r[3]);t.push({index:n/2,letter:r[0]||String.fromCharCode(65+n/2),label:r[1]??``,position:i??NaN,height:a??NaN,model:r[13]??``})}return t}function I(e){let t=/(\d+)$/.exec(e);return t?Number(t[1]):0}function xe(e){return!(e.startsWith(`RA`)||e.toUpperCase().includes(`RAMAN`)||e.startsWith(`XAS`))}function Se(e){return e.startsWith(`RA`)||e.toUpperCase().includes(`RAMAN`)?`Wavenumber (cm⁻¹)`:e.startsWith(`XAS`)?`Photon Energy (eV)`:`Binding Energy (eV)`}function L(e,t){let n=-1,r=1/0;for(let i=0;i<e.length;i++){let a=e[i];if(a===null)continue;let o=Math.abs(a-t);o<r&&(r=o,n=i)}return n}function Ce(e,t,n){let r=L(e,n);if(r<0)return null;let i=e[r],a=t[r];if(i===null||a===null||i===n)return a??null;let o=e[r+1]!==null&&e[r+1]!==void 0&&(e[r+1]-n)*(i-n)<0?r+1:r-1,s=e[o],c=t[o];return s==null||c==null||s===i?a:a+(n-i)*(c-a)/(s-i)}var R=n(),z={residuals:2,legend:2,yAxis:0,peakFill:!0,fitResults:!1,showFit:!0,fontDelta:0,fillTypes:[],hatches:[]},B=e=>e*ee,V=k.font,H;function U(e,t,n=!1){if(H===void 0)try{H=typeof document<`u`?document.createElement(`canvas`).getContext(`2d`):null}catch{H=null}if(H)return H.font=`${n?`bold `:``}${t}px ${V}`,H.measureText(e).width;let r=0;for(let t of e)r+=/[ilI.,:;'|!()[\]]/.test(t)?.25:/[mwMW]/.test(t)?.8:/[A-Z]/.test(t)?.6:/\d/.test(t)?.507:.47;return r*t*(n?1.06:1)}var we=e=>`${B(3.7*e).toFixed(2)} ${B(1.6*e).toFixed(2)}`;function W(e,t,n,r){if(!t)return``;let i=``,a=!1;for(let o=0;o<e.length;o++){let s=e[o],c=t[o];if(s===null||c==null||!Number.isFinite(c)){a=!1;continue}i+=`${a?`L`:`M`}${n(s).toFixed(2)} ${r(c).toFixed(2)}`,a=!0}return i}function Te(e,t,n,r,i){let a=``,o=[],s=()=>{if(o.length>1){a+=o.map((t,a)=>`${a?`L`:`M`}${r(e[t]).toFixed(2)} ${i(n[t]).toFixed(2)}`).join(``);for(let n=o.length-1;n>=0;n--)a+=`L${r(e[o[n]]).toFixed(2)} ${i(t[o[n]]).toFixed(2)}`;a+=`Z`}o=[]};for(let r=0;r<e.length;r++)e[r]!==null&&n[r]!==null&&n[r]!==void 0&&t[r]!==null&&t[r]!==void 0&&Number.isFinite(n[r])&&Number.isFinite(t[r])?o.push(r):s();return s(),a}function Ee(e,t,n,r,i){let a=e=>t.split(``).filter(t=>t===e).length*n,o=B(72),s=[],c={stroke:r,strokeOpacity:i,strokeWidth:B(1),fill:`none`},l=a(`/`)+a(`x`)+a(`X`),u=a(`\\`)+a(`x`)+a(`X`),d=a(`|`)+a(`+`),f=a(`-`)+a(`+`),p=a(`.`)+a(`o`)+a(`O`)+a(`*`),m=o/Math.max(l,u,d,f,p,1);return l&&s.push((0,R.jsx)(`path`,{d:`M0 ${m}L${m} 0M${-m} ${m}L${m} ${-m}M0 ${2*m}L${2*m} 0`,...c},`ne`)),u&&s.push((0,R.jsx)(`path`,{d:`M0 0L${m} ${m}M${-m} 0L${m} ${2*m}M0 ${-m}L${2*m} ${m}`,...c},`se`)),d&&s.push((0,R.jsx)(`path`,{d:`M${m/2} 0V${m}`,...c},`v`)),f&&s.push((0,R.jsx)(`path`,{d:`M0 ${m/2}H${m}`,...c},`h`)),p&&s.push((0,R.jsx)(`circle`,{cx:m/2,cy:m/2,r:Math.max(.8,m/6),fill:r,fillOpacity:i},`o`)),(0,R.jsx)(`pattern`,{id:e,patternUnits:`userSpaceOnUse`,width:m,height:m,children:s},e)}function De(e,t,n){let r=-1,i=-1/0;for(let a=0;a<e.length;a++){let o=t[a],s=n[a];o!==null&&s!==null&&e[a]!==null&&o-s>i&&(i=o-s,r=a)}if(r<0||!(i>0))return null;let a=i/2,o=i=>{for(let o=r;o>=0&&o<e.length;o+=i){let r=o+i;if(r<0||r>=e.length)return null;let s=(t[o]??NaN)-(n[o]??NaN),c=(t[r]??NaN)-(n[r]??NaN);if(!Number.isFinite(c))return null;if(s>=a&&c<a)return e[o]+(s-a)/(s-c)*(e[r]-e[o])}return null},s=o(-1),c=o(1);return s!==null&&c!==null?Math.abs(c-s):null}var Oe=(0,g.createContext)(null);function ke(e){let{view:t,limits:n,options:r,selected:i,vlines:a,greenLine:o,mode:s}=e,c=e.interaction??`none`,l=(0,g.useRef)(null),u=(0,g.useRef)(null),d=(0,g.useContext)(Oe),[f,p]=(0,g.useState)({w:800,h:600}),m=e.size??d??f,[h,_]=(0,g.useState)(null);(0,g.useEffect)(()=>{let t=l.current;if(!t||e.size)return;let n=new ResizeObserver(()=>p({w:Math.max(240,t.clientWidth),h:Math.max(200,t.clientHeight)}));return n.observe(t),()=>n.disconnect()},[e.size]);let v=t.x??[],te=t.y??[],y=t.bkg??[],b=be(t.grid),x=xe(t.sheet),ne=/survey|wide/i.test(t.sheet),S=new Set(e.dparam?.hide??[]);e.areaFills&&!e.areaFills.envelope&&(S.add(`envelope`),S.add(`residuals`));let ae=!S.has(`residuals`)&&r.showFit&&r.residuals===2&&!!t.residuals&&t.residuals.some(e=>e!==null),C={tick:k.axisNumberSize+r.fontDelta,title:k.axisTitleSize+r.fontDelta,legend:k.legendFontSize+r.fontDelta,core:k.coreLevelTextSize+r.fontDelta},w=(0,g.useMemo)(()=>{let e=m.w,r=m.h,i=.1*e,a=.95*e,o=.05*r,s=.9*r,c=ae?r*.815:s,l={x0:i,x1:a,y0:o,y1:c},u=ae?{x0:i,x1:a,y0:c,y1:s}:null,[d,f]=x?[n.xmax,n.xmin]:[n.xmin,n.xmax],p=e=>i+(e-d)/(f-d||1)*(a-i),h=e=>d+(e-i)/(a-i)*(f-d),g=e=>c-(e-n.ymin)/(n.ymax-n.ymin||1)*(c-o),ee=e=>n.ymin+(c-e)/(c-o)*(n.ymax-n.ymin),_=null,v=null;if(u&&t.residuals){let e=1/0,n=-1/0;for(let r of t.residuals)r!==null&&Number.isFinite(r)&&(e=Math.min(e,r),n=Math.max(n,r));if(e<=n){let t=n===e?.1:.1*(n-e);v=[e-t,n+t]}else v=[-1,1];let[r,i]=v;_=e=>u.y1-(e-r)/(i-r||1)*(u.y1-u.y0)}return{main:l,resid:u,X:p,iX:h,Y:g,iY:ee,R:_,rlim:v,rev:x}},[m.w,m.h,ae,x,n.xmin,n.xmax,n.ymin,n.ymax,t.residuals]),{main:T,resid:E,X:O,Y:A}=w,j=[n.xmin,n.xmax],M=re(j[0],j[1],T.x1-T.x0,C.tick,`x`),ue=oe(M,j[0],j[1],!1),de=ie(M,j[0],j[1],k.xSublines+1),fe=re(n.ymin,n.ymax,T.y1-T.y0,C.tick,`y`),pe=oe(fe,n.ymin,n.ymax,!0),me=ie(fe,n.ymin,n.ymax,k.ySublines+1),he=E&&w.rlim?re(w.rlim[0],w.rlim[1],E.y1-E.y0,C.tick,`y`):[],N=E&&w.rlim?oe(he,w.rlim[0],w.rlim[1],!0):null,ge=b.map(e=>e.label),P=le(ge,k.peakColors,k.peakAlpha),_e=e=>r.fillTypes[P[e]?.styleOf??e]??`Solid Fill`,ve=e=>r.hatches[P[e]?.styleOf??e]??`/`,F=r.showFit?t.peaks??[]:[],ye=e=>/^Unfitted|^D-parameter|^Fermi|^VBM|^Cut-Off|^SurveyID/.test(b[e]?.model??``),I=(e,t,n)=>e>=t-Math.abs(n-t)*1e-9&&e<=n+Math.abs(n-t)*1e-9,L=e=>{let t=u.current.getBoundingClientRect();return{x:e.clientX-t.left,y:e.clientY-t.top}},z=e=>e.x>=T.x0&&e.x<=T.x1&&e.y>=T.y0&&e.y<=T.y1,H=e=>{let t=b[e];if(!t||!Number.isFinite(t.position)||!Number.isFinite(t.height))return null;if(h?.kind===`peak`&&h.peak===e)return{x:O(h.x),y:A(h.y)};let n=Ce(v,y,t.position)??0;return{x:O(t.position),y:A(t.height+n)}},ke=e=>{if(i===null||!F[i])return-1;let t=H(i);return t&&Math.hypot(t.x-e.x,t.y-e.y)<100?i:-1},Ae=(()=>{let e=1/0,t=-1/0;for(let n of v)n!==null&&(e=Math.min(e,n),t=Math.max(t,n));return t>e?t-e:0})(),je=Math.max(.1,Ae*.02),Me=t=>{if(t.button!==0)return;let r=L(t);if(!z(r))return;if(t.currentTarget.setPointerCapture?.(t.pointerId),s===`zoom`)return _({kind:`box`,x0:r.x,y0:r.y,x1:r.x,y1:r.y});if(s===`drag`)return _({kind:`pan`,px0:r.x,py0:r.y,l:n});let l=w.iX(r.x),u=w.iY(r.y),d=t.ctrlKey||t.metaKey;if((c===`bkg`||c===`lines`)&&a&&d)return _({kind:`both`,ref:l,gap:a[1]-a[0],lo:a[0]});if(c===`bkg`&&a&&t.shiftKey)return e.onOffset?.(l,u,!1),_({kind:`offset`});if(c===`peak`&&t.shiftKey&&i!==null&&ke(r)>=0)return e.onPeakWidth?.(i,l,`start`),_({kind:`width`,peak:i});if(o!==null&&Math.abs(o-l)<=je)return _({kind:`green`});if((c===`bkg`||c===`lines`)&&a){e.onSelect?.(null);let t=Math.abs(l-a[0]),n=Math.abs(l-a[1]),r=t<n?a[1]:a[0];return Math.min(t,n)>je&&e.onVlines?.(Math.min(l,r),Math.max(l,r),!1),_({kind:`vline`,other:r})}if(c===`peak`){let t=ke(r);if(t>=0){_({kind:`peak`,peak:t,x:l,y:u}),e.onPeakDrag?.(t,l,u,`start`);return}}e.onSelect?.(null)},Ne=t=>{let n=L(t),r=z(n)||E&&n.x>=E.x0&&n.x<=E.x1&&n.y>=E.y0&&n.y<=E.y1;if(e.onCursor?.(r?{x:w.iX(n.x),y:w.iY(n.y)}:null),!h)return;let i=w.iX(n.x),a=w.iY(n.y);if(h.kind===`peak`)_({...h,x:i,y:a}),e.onPeakDrag?.(h.peak,i,a,`move`);else if(h.kind===`width`)e.onPeakWidth?.(h.peak,i,`move`);else if(h.kind===`vline`)e.onVlines?.(Math.min(i,h.other),Math.max(i,h.other),!1);else if(h.kind===`both`){let t=h.lo+(i-h.ref);e.onVlines?.(Math.min(t,t+h.gap),Math.max(t,t+h.gap),!1)}else if(h.kind===`offset`)z(n)&&e.onOffset?.(i,a,!1);else if(h.kind===`green`)e.onGreenLine?.(i);else if(h.kind===`box`)_({...h,x1:n.x,y1:n.y});else if(h.kind===`pan`){let t=h.l,r=(t.xmax-t.xmin)/(T.x1-T.x0),i=(t.ymax-t.ymin)/(T.y1-T.y0),a=(n.x-h.px0)*r*(x?1:-1),o=(n.y-h.py0)*i;e.onLimits?.({xmin:t.xmin+a,xmax:t.xmax+a,ymin:t.ymin+o,ymax:t.ymax+o})}},Pe=t=>{let n=h;if(_(null),!n)return;let r=L(t),i=w.iX(r.x),a=w.iY(r.y);if(n.kind===`peak`)e.onPeakDrag?.(n.peak,i,a,`end`);else if(n.kind===`width`)e.onPeakWidth?.(n.peak,i,`end`);else if(n.kind===`vline`)e.onVlines?.(Math.min(i,n.other),Math.max(i,n.other),!0);else if(n.kind===`both`){let t=n.lo+(i-n.ref);e.onVlines?.(Math.min(t,t+n.gap),Math.max(t,t+n.gap),!0)}else if(n.kind===`offset`)e.onOffset?.(i,a,!0);else if(n.kind===`box`){if(Math.abs(n.x1-n.x0)<5||Math.abs(n.y1-n.y0)<5)return;let t=w.iX(n.x0),r=w.iX(n.x1),i=w.iY(n.y0),a=w.iY(n.y1);e.onLimits?.({xmin:Math.min(t,r),xmax:Math.max(t,r),ymin:Math.min(i,a),ymax:Math.max(i,a)}),e.onModeDone?.()}else n.kind===`pan`&&e.onModeDone?.()},Fe=t=>{c===`peak`&&i!==null&&F[i]&&z(L(t))&&e.onPeakWheel?.(i,t.deltaY<0)},Ie=t=>{t.preventDefault();let n=L(t);e.onContextMenu?.(t,{x:w.iX(n.x),y:w.iY(n.y),peak:z(n)?ke(n):-1})},G=`kf-clip-main-${t.sheet.replace(/\W/g,``)}`,K=`${G}-r`,Le=[],q=[],Re=[],J=B(1);if(r.showFit&&F.forEach((t,n)=>{if(!t)return;let i=P[n],a=_e(n);if(ye(n)){if(e.areaFills||e.dparam)return;q.push((0,R.jsx)(`path`,{d:Te(v,y,t,O,A),fill:i.colour,fillOpacity:.5,stroke:`none`},`u${n}`));return}if(r.peakFill&&a===`Solid Fill`)q.push((0,R.jsx)(`path`,{d:Te(v,y,t,O,A),fill:i.colour,fillOpacity:i.alpha,stroke:`none`},`f${n}`));else if(r.peakFill&&a===`Hatch`){let e=`${G}-h${n}`;Le.push(Ee(e,ve(n),k.hatchDensity,i.colour,i.alpha)),q.push((0,R.jsx)(`path`,{d:Te(v,y,t,O,A),fill:`url(#${e})`,stroke:i.colour,strokeOpacity:i.alpha,strokeWidth:J},`f${n}`))}let o=r.peakFill?k.peakLineColor:i.colour,s=r.peakFill?k.peakLineAlpha:Math.min(i.alpha+.1,1);Re.push((0,R.jsx)(`path`,{d:W(v,t,O,A),fill:`none`,stroke:o,strokeOpacity:s,strokeWidth:J},`l${n}`))}),e.areaFills)for(let t of e.areaFills.fills){let e=P[t.peak_index]??{colour:k.peakColors[t.peak_index%k.peakColors.length],alpha:.5};q.push((0,R.jsx)(`path`,{d:Te(t.x,t.bkg,t.y,O,A),fill:e.colour,fillOpacity:.5,stroke:`none`},`a${t.peak_index}`))}e.dparam&&Re.push((0,R.jsx)(`path`,{d:W(e.dparam.x,e.dparam.y,O,A),fill:`none`,stroke:e.dparam.color_after_calculate??`red`,strokeWidth:J},`dparam`));let ze=e=>{let t=P[e],n=_e(e);return r.peakFill?n===`Hatch`?{kind:`hatch`,colour:t.colour,alpha:t.alpha,i:e}:n===`None`?{kind:`line`,colour:k.peakLineColor,alpha:k.peakLineAlpha}:{kind:`solid`,colour:t.colour,alpha:ye(e)?.5:t.alpha}:{kind:`line`,colour:t.colour,alpha:Math.min(t.alpha+.1,1)}},Y=[];if(r.legend&&r.showFit&&!S.has(`legend`)){let e=ce(ge,t.sheet).filter(e=>F[e.index]);if(r.legend===1){ne||Y.push({text:`Raw Data`,h:{kind:`dots`}}),t.background?.type&&Y.push({text:`Background`,h:{kind:`dash`}}),t.envelope&&Y.push({text:`Overall Fit`,h:{kind:`env`}});for(let t of e)Y.push({text:ge[t.index].replace(/(\d+\/\d+)/g,`$_{$1}$`),h:ze(t.index)})}else for(let t of e)Y.push({text:t.text,h:ze(t.index)})}let Be=!!t.background?.type&&y.length>0&&!S.has(`background`),X=Math.sqrt(k.scatterSize)*ee/2+B(.5),Ve=``;for(let e=0;e<v.length;e++){let t=v[e],n=te[e];if(t===null||n===null)continue;let r=O(t),i=A(n);Ve+=`M${(r-X).toFixed(2)} ${i.toFixed(2)}a${X.toFixed(2)} ${X.toFixed(2)} 0 1 0 ${(2*X).toFixed(2)} 0a${X.toFixed(2)} ${X.toFixed(2)} 0 1 0 ${(-2*X).toFixed(2)} 0`}let He=null,Ue=r.yAxis===2?`Intensity (a.u.)`:`Intensity (CPS)`;if(r.showFit&&r.residuals===1&&t.residuals&&!S.has(`residuals`)){let e=te.filter(e=>e!==null),n=Math.max(...e),i=Math.min(...e),a=Math.max(...t.residuals.map(e=>e===null?0:Math.abs(e))),o=a?.05*(n-i)/a:1,s=1.07*n;He=(0,R.jsxs)(`g`,{children:[(0,R.jsx)(`line`,{x1:T.x0,x2:T.x1,y1:A(s),y2:A(s),stroke:`grey`,strokeOpacity:.1,strokeDasharray:`${B(6.4)} ${B(1.6)} ${B(1)} ${B(1.6)}`,strokeWidth:J}),(0,R.jsx)(`path`,{d:W(v,t.residuals.map(e=>e===null?null:e*o+s),O,A),fill:`none`,stroke:k.residualColor,strokeOpacity:k.residualAlpha,strokeWidth:J})]}),r.yAxis!==2&&(Ue=`Intensity (CPS), residual x ${o.toFixed(2)}`)}let We=null;if(c===`bkg`&&a&&e.averagingPoints&&v.length){let t=Math.max(1,Math.round(e.averagingPoints)),r=.1*(n.ymax-n.ymin),i=e=>y[e]??te[e]??0,o=e=>{let t=0,n=1/0;return v.forEach((r,i)=>{r!==null&&Math.abs(r-e)<n&&(n=Math.abs(r-e),t=i)}),t},s=[],c=Math.min(...a),l=Math.max(...a);for(let e of a){let n=Math.round(e*100)/100,a=o(n),u=n>c+(l-c)/2?Math.max(0,a+t-1):Math.min(v.length-1,a-t+1),d=Math.max(0,Math.min(v.length-1,u)),f=Math.floor((a+d)/2);for(let[e,t]of[[a,`red`],[d,`red`],[f,`grey`]]){let n=v[e];n!==null&&s.push((0,R.jsx)(`line`,{x1:O(n),x2:O(n),y1:A(i(e)-r),y2:A(i(e)+r),stroke:t,strokeOpacity:.5,strokeWidth:B(.5),strokeDasharray:we(.5)},`av${s.length}`))}}We=(0,R.jsx)(`g`,{pointerEvents:`none`,children:s})}let Ge=null;if(i!==null&&F[i]&&b[i]){let e=H(i);if(e){let a=B(15)/2,o=b[i],s=Math.abs(A(n.ymax*.02)-A(0)),c=h?.kind===`peak`?null:De(v,F[i],y),l=t.grid[i*2]?.[6]??``;Ge=(0,R.jsxs)(`g`,{pointerEvents:`none`,children:[(0,R.jsx)(`path`,{d:`M${e.x-a} ${e.y-a}L${e.x+a} ${e.y+a}M${e.x-a} ${e.y+a}L${e.x+a} ${e.y-a}`,stroke:`blue`,strokeWidth:B(1)}),(0,R.jsx)(`text`,{x:e.x,y:e.y-s,fontSize:B(12+r.fontDelta),textAnchor:`middle`,fontFamily:V,children:o.letter}),c!==null&&(0,R.jsx)(`text`,{x:O(o.position-c/2),y:e.y-s,fontSize:B(8),fill:`grey`,fontFamily:V,children:[`Model: ${o.model}`,`Position: ${Number(t.grid[i*2]?.[2]??0)} eV`,`FWHM meas.: ${c.toFixed(3)} eV`,`Area: ${l} CPS`,``,`¿ Change width ?`,`Scroll the wheel`].map((e,t)=>(0,R.jsx)(`tspan`,{x:O(o.position-c/2),dy:t?B(8)*1.2:B(8),children:e},t))})]})}}let Z=B(3.5),Ke=B(2),qe=B(.8),Je=B(.6),Q=B(C.tick),Ye=B(C.title),Xe=!E,$=(e,n,r)=>(0,R.jsxs)(`g`,{children:[de.filter(e=>I(e,j[0],j[1])).map((t,n)=>(0,R.jsx)(`line`,{x1:O(t),x2:O(t),y1:e.y1,y2:e.y1+Ke,stroke:`black`,strokeWidth:Je},`m${n}`)),M.map((t,i)=>I(t,j[0],j[1])?(0,R.jsxs)(`g`,{children:[(0,R.jsx)(`line`,{x1:O(t),x2:O(t),y1:e.y1,y2:e.y1+Z,stroke:`black`,strokeWidth:qe}),n&&(0,R.jsx)(`text`,{x:O(t),y:e.y1+Z+B(r)+Q*.78,fontSize:Q,textAnchor:`middle`,fontFamily:V,children:ue.labels[i]})]},i):null),n&&(0,R.jsx)(`text`,{x:(e.x0+e.x1)/2,y:e.y1+Z+B(r)+Q+B(4)+Ye*.8,fontSize:Ye,textAnchor:`middle`,fontFamily:V,children:Se(t.sheet)})]}),Ze=(e,t,n)=>e?(0,R.jsxs)(`text`,{x:t.x0,y:t.y0-B(3),fontSize:n,fontFamily:V,children:[`×10`,(0,R.jsx)(`tspan`,{fontSize:n*.7,dy:-n*.38,children:String(e).replace(`-`,`−`)})]}):null,Qe=Math.max(0,...pe.labels.map(e=>U(e,Q))),$e=(0,R.jsxs)(`g`,{children:[r.yAxis!==1&&me.filter(e=>I(e,n.ymin,n.ymax)).map((e,t)=>(0,R.jsx)(`line`,{x1:T.x0-Ke,x2:T.x0,y1:A(e),y2:A(e),stroke:`black`,strokeWidth:Je},`m${t}`)),r.yAxis!==1&&fe.map((e,t)=>I(e,n.ymin,n.ymax)?(0,R.jsxs)(`g`,{children:[(0,R.jsx)(`line`,{x1:T.x0-Z,x2:T.x0,y1:A(e),y2:A(e),stroke:`black`,strokeWidth:qe}),r.yAxis===0&&(0,R.jsx)(`text`,{x:T.x0-Z-B(3.5),y:A(e)+Q*.35,fontSize:Q,textAnchor:`end`,fontFamily:V,children:pe.labels[t]})]},t):null),r.yAxis===0&&Ze(pe.order,T,Q),r.yAxis!==1&&(0,R.jsx)(`text`,{transform:`translate(${T.x0-Z-B(3.5)-(r.yAxis===0?Qe:0)-B(4)} ${(T.y0+T.y1)/2}) rotate(-90)`,fontSize:Ye,textAnchor:`middle`,fontFamily:V,children:Ue})]}),et=null;if(E&&w.R&&w.rlim&&N&&t.residuals){let i=w.R,[a,o]=w.rlim,s=Math.max(0,...N.labels.map(e=>U(e,Q)));et=(0,R.jsxs)(`g`,{children:[(0,R.jsxs)(`g`,{clipPath:`url(#${K})`,children:[M.filter(e=>I(e,j[0],j[1])).map((e,t)=>(0,R.jsx)(`line`,{x1:O(e),x2:O(e),y1:E.y0,y2:E.y1,stroke:`#b0b0b0`,strokeOpacity:.8,strokeWidth:B(.8)},`gx${t}`)),he.filter(e=>I(e,a,o)).map((e,t)=>(0,R.jsx)(`line`,{x1:E.x0,x2:E.x1,y1:i(e),y2:i(e),stroke:`#b0b0b0`,strokeOpacity:.8,strokeWidth:B(.8)},`gy${t}`)),(0,R.jsx)(`path`,{d:W(v,t.residuals,O,i),fill:`none`,stroke:k.residualColor,strokeOpacity:k.residualAlpha,strokeWidth:J})]}),(0,R.jsx)(`rect`,{x:E.x0,y:E.y0,width:E.x1-E.x0,height:E.y1-E.y0,fill:`none`,stroke:`black`,strokeWidth:B(1)}),r.yAxis!==1&&he.map((e,t)=>I(e,a,o)?(0,R.jsxs)(`g`,{children:[(0,R.jsx)(`line`,{x1:E.x0-Z,x2:E.x0,y1:i(e),y2:i(e),stroke:`black`,strokeWidth:qe}),r.yAxis===0&&(0,R.jsx)(`text`,{x:E.x0-Z-B(3.5),y:i(e)+Q*.35,fontSize:Q,textAnchor:`end`,fontFamily:V,children:N.labels[t]})]},t):null),r.yAxis===0&&Ze(N.order,E,Q),r.yAxis!==1&&(0,R.jsx)(`text`,{transform:`translate(${E.x0-Z-B(3.5)-(r.yAxis===0?s:0)-B(4)} ${(E.y0+E.y1)/2}) rotate(-90)`,fontSize:Ye,textAnchor:`middle`,fontFamily:V,children:`Res.`}),$(E,!0,8),e.chi!==void 0&&e.chi!==null&&(0,R.jsxs)(`text`,{x:O(n.xmin+(x?.2:-.4)),y:(E.y0+E.y1)/2+B(9)*.35,fontSize:B(9),textAnchor:`end`,fontFamily:V,children:[`χ: `,e.chi.toFixed(2)]})]})}let tt=null;if(Y.length){let e=B(C.legend),t=.4*e,n=2*e,r=.7*e,i=.8*e,a=e*1.2,o=.5*e,s=Math.max(...Y.map(t=>D(t.text).reduce((t,n)=>t+U(n.text,n.sub?e*.7:e),0))),c=T.x0+.5*e,l=T.y0+.5*e,u=t*2+n+i+s,d=t*2+Y.length*a+(Y.length-1)*o;tt=(0,R.jsxs)(`g`,{children:[(0,R.jsx)(`rect`,{x:c,y:l,width:u,height:d,rx:.2*e,fill:`white`,fillOpacity:.1,stroke:`gray`,strokeOpacity:.1,strokeWidth:B(1)}),Y.map((s,u)=>{let d=l+t+u*(a+o)+a/2,f=c+t,p=s.h,m;if(p.kind===`solid`)m=(0,R.jsx)(`rect`,{x:f,y:d-r/2,width:n,height:r,fill:p.colour,fillOpacity:p.alpha});else if(p.kind===`hatch`){let e=`${G}-lh${u}`;Le.push(Ee(e,ve(p.i),k.hatchDensity,p.colour,p.alpha)),m=(0,R.jsx)(`rect`,{x:f,y:d-r/2,width:n,height:r,fill:`url(#${e})`,stroke:p.colour,strokeOpacity:p.alpha,strokeWidth:J})}else m=p.kind===`line`?(0,R.jsx)(`line`,{x1:f,x2:f+n,y1:d,y2:d,stroke:p.colour,strokeOpacity:p.alpha,strokeWidth:J}):p.kind===`dots`?(0,R.jsx)(`circle`,{cx:f+n/2,cy:d,r:X,fill:`black`}):p.kind===`dash`?(0,R.jsx)(`line`,{x1:f,x2:f+n,y1:d,y2:d,stroke:k.backgroundColor,strokeOpacity:k.backgroundAlpha,strokeDasharray:we(1),strokeWidth:J}):(0,R.jsx)(`line`,{x1:f,x2:f+n,y1:d,y2:d,stroke:k.envelopeColor,strokeOpacity:k.envelopeAlpha,strokeWidth:J});return(0,R.jsxs)(`g`,{children:[m,(0,R.jsx)(`text`,{x:f+n+i,y:d+e*.33,fontSize:e,fontFamily:V,children:D(s.text).map((t,n)=>t.sub?(0,R.jsx)(`tspan`,{fontSize:e*.7,dy:e*.2,children:t.text},n):(0,R.jsx)(`tspan`,{dy:n&&D(s.text)[n-1].sub?-e*.2:0,children:t.text},n))})]},u)})]})}let nt=null;if(r.fitResults&&t.fit&&t.fit.r2!==null){let n=B(9+r.fontDelta),i=[`R²: ${t.fit.r2.toFixed(5)}`,`χ: ${(e.chi??t.fit.rsd??0).toFixed(2)}`,`Red. χ²: ${t.fit.redChi2.toFixed(2)}`];nt=(0,R.jsx)(`text`,{x:T.x1-.02*(T.x1-T.x0),y:T.y0+.02*(T.y1-T.y0)+B(C.core)*1.3+n,fontSize:n,textAnchor:`end`,fontFamily:V,children:i.map((e,t)=>(0,R.jsx)(`tspan`,{x:T.x1-.02*(T.x1-T.x0),dy:t?n*1.2:0,children:e},t))})}let rt=s===`zoom`?`crosshair`:s===`drag`?`pointer`:`default`,it=m.w,at=m.h;return(0,R.jsx)(`div`,{className:`kf-plot`,ref:l,children:(0,R.jsxs)(`svg`,{ref:u,width:it,height:at,viewBox:`0 0 ${it} ${at}`,xmlns:`http://www.w3.org/2000/svg`,style:{cursor:rt},onPointerDown:Me,onPointerMove:Ne,onPointerUp:Pe,onPointerCancel:()=>_(null),onPointerLeave:()=>!h&&e.onCursor?.(null),onWheel:Fe,onDoubleClick:t=>z(L(t))&&e.onDoubleClick?.(),onContextMenu:Ie,children:[(0,R.jsxs)(`defs`,{children:[(0,R.jsx)(`clipPath`,{id:G,children:(0,R.jsx)(`rect`,{x:T.x0,y:T.y0,width:T.x1-T.x0,height:T.y1-T.y0})}),E&&(0,R.jsx)(`clipPath`,{id:K,children:(0,R.jsx)(`rect`,{x:E.x0,y:E.y0,width:E.x1-E.x0,height:E.y1-E.y0})}),Le]}),(0,R.jsx)(`rect`,{x:0,y:0,width:it,height:at,fill:`white`}),(0,R.jsxs)(`g`,{clipPath:`url(#${G})`,children:[e.logo&&(0,R.jsx)(`g`,{opacity:.07,style:{opacity:.07},children:(0,R.jsx)(`image`,{href:e.logo,x:T.x0,y:T.y0,width:T.x1-T.x0,height:T.y1-T.y0,preserveAspectRatio:`none`})}),q,Re,Be&&(0,R.jsx)(`path`,{d:W(v,y,O,A),fill:`none`,stroke:k.backgroundColor,strokeOpacity:k.backgroundAlpha,strokeWidth:J,strokeDasharray:we(1)}),ne?(0,R.jsx)(`path`,{d:W(v,te,O,A),fill:`none`,stroke:k.scatterColor,strokeOpacity:.7,strokeWidth:J}):(0,R.jsx)(`path`,{d:Ve,fill:k.scatterColor}),r.showFit&&t.envelope&&!S.has(`envelope`)&&(0,R.jsx)(`path`,{d:W(v,t.envelope,O,A),fill:`none`,stroke:k.envelopeColor,strokeOpacity:k.envelopeAlpha,strokeWidth:J}),He,a&&s===`none`&&We,a&&s===`none`&&a.map((e,t)=>{let r=A(n.ymin+(t===1?.9:.8)*(n.ymax-n.ymin)),i=e.toFixed(2),a=U(i,B(10))+B(4);return(0,R.jsxs)(`g`,{children:[(0,R.jsx)(`line`,{x1:O(e),x2:O(e),y1:T.y0,y2:T.y1,stroke:`red`,strokeOpacity:.7,strokeWidth:J,strokeDasharray:we(1)}),(0,R.jsx)(`rect`,{x:O(e)-a/2,y:r-B(10)*.65,width:a,height:B(10)*1.3,rx:B(2),fill:`white`,fillOpacity:.8,stroke:`black`,strokeOpacity:.8,strokeWidth:B(.5)}),(0,R.jsx)(`text`,{x:O(e),y:r+B(10)*.35,fontSize:B(10),fill:`grey`,textAnchor:`middle`,fontFamily:V,children:i})]},`v${t}`)}),o!==null&&(0,R.jsxs)(`g`,{children:[(0,R.jsx)(`line`,{x1:O(o),x2:O(o),y1:T.y0,y2:T.y1,stroke:`green`,strokeOpacity:.7,strokeWidth:J}),(0,R.jsx)(`rect`,{x:O(o)-U(o.toFixed(2),B(10))/2-B(2),y:T.y0+.05*(T.y1-T.y0),width:U(o.toFixed(2),B(10))+B(4),height:B(10)*1.25,rx:B(2),fill:`lightgreen`,fillOpacity:.8,stroke:`black`,strokeOpacity:.8,strokeWidth:B(.5)}),(0,R.jsx)(`text`,{x:O(o),y:T.y0+.05*(T.y1-T.y0)+B(10),fontSize:B(10),fill:`darkgreen`,textAnchor:`middle`,fontFamily:V,children:o.toFixed(2)})]}),(e.idLines??[]).map((e,t)=>{let n=e.frac*(T.y1-T.y0);return(0,R.jsxs)(`g`,{children:[(0,R.jsx)(`line`,{x1:O(e.x),x2:O(e.x),y1:T.y1+n,y2:T.y1-n,stroke:`blue`,strokeWidth:J}),(0,R.jsx)(`text`,{transform:`translate(${O(e.x+(x?.1:-.1))} ${T.y1-.01*(T.y1-T.y0)}) rotate(-90)`,fontSize:B(7),fontFamily:V,children:D(e.text).map((e,t)=>e.sub?(0,R.jsx)(`tspan`,{fontSize:B(5),dy:B(1.5),children:e.text},t):(0,R.jsx)(`tspan`,{children:e.text},t))})]},`id${t}`)}),(e.labels??[]).map((e,t)=>{let n=O(e.x),i=e.y!==null&&e.y!==void 0?A(e.y):T.y0+.1*(T.y1-T.y0),a=B((e.fontsize??10)+r.fontDelta);return(0,R.jsx)(`text`,{transform:`translate(${n} ${i}) rotate(${-(e.rotation??0)})`,fontSize:a,textAnchor:e.rotation?`start`:`middle`,fontFamily:V,children:D(e.text).map((t,n)=>t.sub?(0,R.jsx)(`tspan`,{fontSize:a*.7,dy:a*.2,children:t.text},n):(0,R.jsx)(`tspan`,{dy:n&&D(e.text)[n-1].sub?-a*.2:0,children:t.text},n))},`lb${t}`)}),Ge,h?.kind===`box`&&(0,R.jsx)(`rect`,{x:Math.min(h.x0,h.x1),y:Math.min(h.y0,h.y1),width:Math.abs(h.x1-h.x0),height:Math.abs(h.y1-h.y0),fill:`green`,fillOpacity:.3,stroke:`green`,strokeOpacity:.3})]}),(0,R.jsx)(`rect`,{x:T.x0,y:T.y0,width:T.x1-T.x0,height:T.y1-T.y0,fill:`none`,stroke:`black`,strokeWidth:B(1)}),Xe&&$(T,!0,3.5),$e,t.sheet&&(0,R.jsx)(`text`,{x:T.x1-.02*(T.x1-T.x0),y:T.y0+.02*(T.y1-T.y0)+B(C.core)*.92,fontSize:B(C.core),fontWeight:`bold`,textAnchor:`end`,fontFamily:V,children:se(t.sheet)}),tt,nt,et]})})}var Ae=[{id:`open`,label:`Open File`,icon:`open-folder-3.png`,help:`OPEN FILE

Opens a KherveFitting project: an Excel workbook (.xlsx)
or a KherveFitting HDF5 project (.kfit). All its sheets
(core levels, surveys, other techniques) are loaded and
listed in the sheet selector.

Raw instrument files (VAMAS, Avantage, Kratos, ...) are
not opened here: use File > Import for those.

Shortcut: Ctrl+O`},{id:`quickSave`,label:`Save Data`,icon:`Save_Json-3.png`,help:`QUICK SAVE

Saves all your work (backgrounds, peaks, fits, results,
BE corrections) quickly, without rewriting the Excel
file:
  - .xlsx project: writes the companion .json file
    next to it (same name).
  - .kfit project (or .kfit chosen in Preferences >
    Save): saves the .kfit file.
  - nothing saved yet: asks where to create the project.

Use it often. To write fits into the Excel sheets
themselves, use the Export buttons next to it.

Shortcut: Ctrl+S`},{id:`exportExcel`,label:`Export to Excel`,icon:`Save-excel-3.png`,help:`EXPORT THIS CORE LEVEL

Writes the sheet on screen (data, background, peaks and
fit) to a spreadsheet you can open outside KherveFitting.
A dialog asks for the format:
  - Excel (.xlsx): into the project's workbook (for a
    .kfit project, into the .xlsx of the same name).
  - kSheet (.ksheet): into the .ksheet of the same
    name beside the project; existing sheets are kept.

How to use:
1. Select the sheet in the sheet selector.
2. Click, pick Excel or kSheet, then OK.

For everyday saving use Quick Save (Ctrl+S) instead.`},{id:`exportAll`,label:`Save All Sheets`,icon:`save-Multi-3.png`,help:`EXPORT ALL CORE LEVELS

Same as Export This Core Level, but for every sheet of
the project in one go. A dialog asks for the format:
Excel (.xlsx) or kSheet (.ksheet).

Use it before sending the fitted data to someone or
plotting it in another program.

Can take a long time on big projects: not recommended
for 50+ core levels (export them one by one instead).`},{id:`undo`,label:`Undo`,icon:`undo-3.png`,help:`UNDO

Steps back to the previous snapshot of your work: peak
positions and parameters, the fit, the Results grid and
the BE correction. Snapshots are taken as you edit
(moving or adding peaks, fitting, exporting results...);
the last 50 are kept.

Meant for peak / fit edits. File operations such as
deleting or renaming sheets are not undone on disk.

Shortcut: Ctrl+Z`},{id:`redo`,label:`Redo`,icon:`redo-3.png`,help:`REDO

Re-applies the step you just undid. Only available right
after an Undo: any new edit clears the redo list.

Shortcut: Ctrl+Y`},{id:`sort`,label:`Sort Sheets`,icon:`Sort-3.png`,help:`SORT SHEETS

Reorders the sheets of the project, in the file itself,
so each sample's spectra sit together:
  - grouped by sample number (the number at the end of
    the name: C1s, O1s = sample 0; C1s1, O1s1 = 1 ...);
  - core levels in alphabetical order inside a group,
    then Fermi, VB / Valence and Survey / Wide last.

Useful after importing files in a random order.
The Excel file must not be open in another program.`},{id:`sampleManager`,label:`Sample/Experiment Manager`,icon:`list-view-3.png`,help:`SAMPLE / EXPERIMENT MANAGER

Opens a table of the whole project: one row per sample,
one column per core level, plus each sample's BE
correction. From it you jump between spectra, compare
several on one plot and organise sheets.

How to use:
1. Click to open the manager.
2. Select one or more cells (spectra).
3. Press a plot key while the manager has focus:
   F2 / Ctrl+2  overlay (one sheet: normal view
                with its peak model)
   F3 / Ctrl+3  stacked with an offset
   F4 / Ctrl+4  stacked with the fitted peaks
   F5           heatmap

The ? button in the manager lists all its shortcuts.`},{control:`sheet`},{id:`refresh`,label:`Refresh Excel File`,icon:`Refresh-3.png`,help:`REFRESH PROJECT FROM FILE

Saves your current work, then re-reads the project file
(.xlsx or .kfit) and rebuilds the sheet list and data.

Use it when:
  - you added, removed or edited sheets in Excel while
    the project was open here;
  - the sheet list or plots look out of step with the
    file.

Sheet names are tidied on the way (e.g. 'C 1s Scan'
becomes 'C1s', survey scans become 'Survey'). Your BE
corrections and sample names are kept.`},{id:`deleteSheet`,label:`Delete Core Level/Survey`,icon:`delete-3.png`,help:`DELETE CURRENT SHEET

Permanently removes the sheet shown in the sheet
selector (core level, survey...) from the project and
from the project file, then shows the first sheet.

How to use:
1. Select the sheet to remove.
2. Click and answer Yes to the confirmation.

An automatic backup of the project is made first.
Several sheets at once: use the Sample Manager.`},{id:`renameSheet`,label:`Rename Core Level/Survey`,icon:`rename-3.png`,help:`RENAME CURRENT SHEET

Gives the sheet on screen a new name, in the project and
in the project file. Names drive how KherveFitting reads
the sheet: the element + orbital picks the core level
and the trailing number picks the sample.

How to use:
1. Select the sheet, click this button.
2. Type the new name - one word, no spaces
   (e.g. Fe2p, O1s3, Survey2) - and press OK.

A backup is made first. An open Sample Manager is
closed so it can be refreshed.`},{id:`crop`,label:`Crop`,icon:`Crop-3.png`,help:`CROP TO A NEW SHEET

Cuts a binding-energy range out of the current spectrum
and saves it as a new sheet; the original is untouched.
Use it to split a wide scan into a core-level region, or
to separate two regions recorded in one spectrum.

How to use:
1. Click: two vertical lines appear on the plot.
2. Drag the lines, or type Min BE / Max BE.
3. Set the new sheet name (a free name is suggested).
4. Tick the same core level of other samples to crop
   them all at once, then press Crop.

On an AFM image sheet it crops a rectangle instead.`},{sep:!0},{control:`be`},{id:`autoBE`,label:`Auto BE`,icon:`BEcorrect-3.png`,help:`AUTOMATIC BE CORRECTION

Opens the Binding Energy Correction window. It finds a
fitted reference peak in each sample (by default a peak
whose label contains 'C1s C-C'), compares its position
with the reference BE (default 284.8 eV) and sets the
sample's BE correction to the difference.

How to use:
1. Fit the reference peak (e.g. C 1s adventitious C)
   in each sample.
2. Click, check the peak name and reference BE.
3. 'Correct Current Row' for this sample, or tick
   samples and 'Correct Selected Rows'.
'Reset Selected to 0 eV' removes the correction.`},{sep:!0},{id:`measureArea`,label:`Background`,icon:`BKG-3.png`,help:`MEASURE AREA (BACKGROUND + AREA, NO PEAK MODEL)

Opens the Measure Area window: subtract a background and
measure the area under the curve without fitting peaks.
Quick quantification of surveys or of core levels you do
not need to decompose.

How to use:
1. Drag the two vertical lines on the plot to the ends
   of the peak.
2. Pick a background (Smart, Shirley, Linear, Tougaard,
   polynomial, ALS).
3. Type an Area Name (or use Core Level List) and press
   'Create Background / Area'.
4. Export the result to the Results grid.

TAB / Q switch between measured regions. The Batching
tab repeats the area on other samples.`},{id:`fitting`,label:`Fitting`,icon:`C1s-3.png`,help:`PEAK FITTING (FULL)

Opens the Peak Fitting window, the main tool to build a
peak model: background, peaks, constraints and fit.

Tabs:
  BKG - choose the method (Shirley, Smart,
    Tougaard, Linear, spline, active...) and its range.
  Fitting - add peaks, pick the line shape and
    fitting method, then Fit.
  Adv. Fitting - fit continuously while the regions
    change; auto-tune the background offsets.
  Batch - copy a model to other samples and fit
    many core levels in one go.

How to use:
1. Set the background range with the vertical lines.
2. Create the background, then add peaks and Fit.
Keys: TAB switches region (BKG tab); TAB / Q
select next / previous peak (Fitting tab).

Shortcut: Ctrl+P`},{id:`miniFitting`,label:`Fitting`,icon:`C1sMini-3.png`,help:`MINI PEAK FITTING (SIMPLIFIED)

Opens a compact version of the Peak Fitting window with
only the essential controls: four background methods
(Smart, U2-Tougaard, Active Shirley, Active Tougaard),
no offsets, typed ranges or averaging, no Adv. Fitting
or Batch tab,
and a small button bar for regions.

Good for a first fit or on a small screen. Switch to the
full Peak Fitting button for advanced settings.

Same workflow: set the background range with the lines,
create the background, add peaks, then Fit.`},{id:`monteCarlo`,label:`Monte Carlo`,icon:`MC-3.png`,help:`MONTE CARLO UNCERTAINTIES (±1σ)

Error bars for every peak of the current core level:
Position, FWHM, Height, L/G and Area (and from them the
atomic %).

The spectrum is refitted many times. Each time, synthetic
noise with the same statistics as the fit residuals is put
on the fitted envelope (weighted residual bootstrap). The
standard deviation of each refitted value is its ±1σ.

Works on any peak table - fitted or not. An unfitted table
is used as it is: its values are not changed.

The dialog has a 'How does it work?' button with the full
method, its assumptions and its limits.`},{sep:!0},{id:`dparam`,label:`Differentiate`,icon:`Dpara-3.png`,help:`D-PARAMETER (sp2 / sp3 CARBON)

Opens the D-Parameter Measurement window. It smooths and
differentiates the spectrum, then measures the D-parameter:
the energy gap between the maximum and minimum of the
first derivative. On the C KLL Auger peak this estimates
the sp2 fraction (diamond ~14 eV, graphite ~22.5 eV); the
window reads off the % sp2 on a reference chart.

How to use:
1. Select the C KLL (Auger) sheet.
2. Click, adjust smoothing / differentiation widths.
3. Press Calculate. 'Clear D-para' removes it.`},{id:`plotMod`,label:`Plot Modifications`,icon:`Mod-3.png`,help:`PLOT / DATA MODIFICATIONS

Opens a window of operations applied to the spectrum of
the current sheet:
  - Smoothing (Gaussian, Savitzky-Golay, moving average)
  - Add noise (Gaussian, uniform, Poisson), e.g. to test
    how robust a fit is
  - Differentiation and Integration
  - Constant: multiply, divide, add or subtract a value
  - BE shift of the energy axis
  - Create a synthetic Voigt peak (position, FWHM,
    L/G, height, range)

How to use: select the sheet, click, set the values in
one box and press its Apply / Create button.`},{id:`thickogram`,label:`Thickogram`,icon:`Thicko-3.png`,help:`THICKNESS ANALYSIS (THICKOGRAM / TOUGAARD)

Opens the XPS Thickness Analysis window, used to estimate
the thickness of a thin overlayer on a substrate. Two tabs:
  Thickogram - Cumpson's thickogram method, from the
    overlayer / substrate peak intensity ratio.
  Tougaard Depth Analysis - from the shape of the
    inelastic background below the peaks.

How to use: fit or measure the overlayer and substrate
peaks first, then click, choose a tab and enter the
values it asks for.

Example: 2 nm SiO2 on Si from Si 2p oxide / Si 2p metal.`},{id:`vb`,label:`VB`,icon:`VBM-3.png`,help:`VALENCE BAND / FERMI EDGE MEASUREMENTS

Opens the VB Measurements window for valence band and
Fermi-edge spectra:
  - Fit a Fermi edge (metal reference) and use it to
    correct the binding energy scale.
  - Find the valence band edge (VBM) or a cut-off by
    linear extrapolation of the leading edge, with an
    optional background extrapolation.

How to use:
1. Select the VB (or Fermi) sheet and click.
2. Drag the two vertical lines around the edge.
3. Tick the sample sheets to process in the list.
4. Press Fit Selected Fermi, or Calculate VBM /
   Calculate Cut-Off.
'Show Analysis Results' opens the table of values.`},{id:`pca`,label:`PCA`,icon:`PCA-3.png`,help:`NMF ANALYSIS (NON-NEGATIVE MATRIX FACTORISATION)

Opens the NMF Analysis window. Given a series of spectra
of the same core level (depth profile, temperature or
time series...), it finds a few component spectra and
how much of each is in every spectrum - without a peak
model.

How to use:
1. Tick the core levels of the series.
2. Choose offset (min. value / Smart background) and
   normalisation (none, area, max height).
3. Press Analyse, set how many components to Use,
   then Re-Display.
4. 'Create NMF as Core Levels' saves the components as
   new sheets; 'Export Results' writes them to Excel or
   to a SingleEntity .json for the Peaks Library.`},{id:`denoise`,label:`Denoise`,icon:`Smooth-3.png`,help:`SPECTRAL DENOISING (FFT / WAVELET / VMD)

Opens the Spectral Denoising window to reduce noise in a
spectrum while keeping its peaks. Three methods:
  FFT - low-pass filter in Fourier space (cut-off, slope)
  Wavelet - wavelet shrinkage, good for sharp peaks
  VMD - splits the signal into modes, keeps the lowest

How to use:
1. Select the core level and a method.
2. Press Auto for suggested settings, or tune them and
   press Apply; compare Raw vs Denoised + residual.
3. Tick the spectra and press Create: the denoised data
   go to NEW sheets, the originals are never changed.`},{sep:!0},{id:`profileCreator`,label:`Profile Creator`,icon:`Profile_Create-3.png`,help:`PROFILE CREATOR

Builds a profile: one quantity plotted against the
sample number, e.g. atomic % of each element through
a depth profile or a temperature series. The profile is
saved as a new 'zzProfile' sheet you can plot and edit.

How to use:
1. Fit / export all samples first.
2. Click, tick the core levels to include.
3. Pick the Type: Concentration, Area, Position, FWHM,
   Height, L/G, Corrected Area or Weight (%).
4. Create from the Peak Fitting grid (each sheet's peaks)
   or from the Results grid (exported values).`},{id:`plotCreator`,label:`Plot Creator`,icon:`Profile_Edit-3.png`,help:`PLOT CREATOR

Builds your own plots in books (zzBook sheets): a
workbook whose columns are plotted on the main window.

- Import any core level, survey or data sheet: BE, raw
  data, background, envelope, residuals and each peak,
  linked to the sheet (a refit updates the book).
- Columns X / Y / yErr, formulas (F(x)), show / hide,
  fill between two curves (Fill to), plot style.
- Also edits the profiles of the Profile Creator.`},{sep:!0},{id:`autoId`,label:`Auto ID`,icon:`IDauto-3.png`,help:`AUTOMATIC ELEMENT IDENTIFICATION (SURVEY)

Finds the peaks of a survey (wide) scan and proposes the
element and core level behind each one, with a
confidence score. Saves a lot of time on unknown samples.

How to use:
1. Select a sheet whose name contains 'Survey' or 'Wide'
   (other sheets are refused).
2. Click to open the Auto ID window and run it.
3. Check / untick the proposals, then Create Areas (for
   quantification) or Create Labels (on the plot).

The window's options help on difficult surveys (small
or noisy peaks, elements you know are present).`},{id:`id`,label:`ID`,icon:`ID-3.png`,help:`MANUAL ELEMENT IDENTIFICATION (PERIODIC TABLE)

Opens the Survey Identification / Labelling window: a
periodic table that marks where each element's lines
(core levels, doublets, Auger peaks) fall on your plot.
Use it to confirm or find elements by eye.

How to use:
1. Plot a survey (or any spectrum) and click.
2. Lines by Element tab: click elements to show their
   lines; 'Add Labels' writes them on the plot.
3. Lines by Range tab: list every line in an energy
   window (drag the lines, mouse wheel to resize).

Its own Auto ID button runs the automatic search.`},{id:`nist`,label:`NIST Database`,icon:`NIST-3.png`,help:`KHERVEDB BINDING ENERGY DATABASE

Opens kDB, a searchable library of reference
binding energies (NIST-style) in its own window.
Use it to check which chemical state a peak position
matches.

How to use:
1. Click an element in the periodic table and choose the
   XPS line, or search by formula or compound name.
2. Read the list of compounds and their BE values.
3. 'Plot Results' shows how the values are distributed.

Example: compare a fitted Ti 2p peak with the TiO2,
TiN and Ti metal entries.`},{id:`kherveAI`,label:`NIST Database`,icon:`KherveAI-3.png`,help:`KHERVEAI ASSISTANT

Opens kAI, a chat assistant that knows XPS and
KherveFitting. Ask questions in plain language (peak
positions, fitting advice, how to do something) or ask
it to carry out actions in the program for you.

How to use:
1. Click to open the chat (click again to bring it back
   if it was minimised).
2. Type your request and send it.

The AI provider and key are set in AI > AI
Configuration.`},{stretch:!0},{id:`libOpen`,label:`Open Peaks Library`,icon:`LibOpen-3.png`,help:`OPEN PEAKS LIBRARY

Loads a peak model saved with Save Peaks Library (a .json
file) onto the current core level, so you do not rebuild
the same model by hand. The folder also comes with starter
reference templates.

How to use:
1. Select the sheet you want to fit.
2. Click and pick the .json file.
3. If the sheet already has peaks, choose Overwrite
   existing peaks or Add after existing peaks.
4. Refit so the peaks settle on the new data.`},{id:`libSave`,label:`Save Peaks Library`,icon:`LibSave-3.png`,help:`SAVE PEAKS LIBRARY

Saves the peak model of the current core level to a .json
file (default folder: your Peaks Library), so the same
model can be reused on other spectra or other projects.

How to use:
1. Build and fit the peak model on the current sheet.
2. Click and choose what to save:
   - Individual Peaks: each peak and its constraints.
   - SingleEntity using Peak Model: all the peaks merged
     into one envelope shape (needs peaks).
   - SingleEntity using Raw Data: raw data minus the
     background as one shape (needs a background).
3. Pick a file name. Reload it with Open Peaks Library.`},{id:`settings`,label:`Load Settings`,icon:`Settings-3.png`,help:`PREFERENCES

Opens the Preferences window, where the program's
defaults are set. Tabs:
  XPS Plot - colours, line / marker styles of data,
    background, envelope, residuals and peaks
  Other Plots - styles for the other techniques
  Text/Axis - font sizes of axes, legend and labels
  Save - project file format (.xlsx or .kfit) and the
    size of the plots written into Excel
  Instrument - current instrument, ECF method and the
    sensitivity-factor library used for quantification

Changes are remembered for the next sessions.`},{id:`toggleColumns`,label:`Toggle Residuals`,icon:`HideColumn-3.png`,help:`SHOW / HIDE EXTRA GRID COLUMNS

Switches both grids between a compact view and the full
set of columns.
  Peak Fitting grid: hides / shows Fitting Model and the
    background columns (type, low / high BE, offsets).
  Results grid: hides / shows Height, L/G, Fitting
    Model, widths, background settings, sheet name and
    the constraint columns.

Click once to hide, again to show. Nothing is deleted:
only the display changes.`},{id:`toggleRightPanel`,label:`Toggle Right Panel`,icon:`left-3.png`,help:`COMPACT VIEW (PLOT ONLY)

Hides the grids panel (Peak Fitting and Results) and the
vertical plot toolbar, and shrinks the window to the plot
alone with a reduced toolbar. Handy on a small screen or
to keep a spectrum beside another program.

Click the same arrow button in the reduced toolbar to
bring everything back at the previous window size.`}],je=[{id:`toggles`,label:`Toggles`,icon:`Toggles-3.png`,help:`DISPLAY TOGGLES

Opens a small floating bar, to the right of this toolbar,
with six buttons that change what the plot shows:
  - fit on / off (raw data only)
  - peak fill on / off
  - Y axis: values / hidden / 'a.u.'
  - legend: hidden / full / peaks only
  - fit results box on / off
  - residuals: off / on plot / separate panel

Hover each button for details. Click this button again
to close the bar.`},{id:`zoomIn`,label:`Zoom In`,icon:`ZoomIN-3.png`,help:`ZOOM IN (BOX)

Zooms the plot onto a rectangle you draw, both in energy
and in intensity.

How to use:
1. Click this button.
2. Left-drag a box on the plot around the region.
3. Release: the plot zooms and the tool switches off.
Click the button again before drawing to cancel.

Keyboard: Ctrl+= / Ctrl+- zoom the energy range in / out
step by step. Zoom Out (below) resets the view.`},{id:`zoomOut`,label:`Zoom Out`,icon:`ZoomOUT-3.png`,help:`ZOOM OUT (RESET VIEW)

Returns the plot to its full, original range in energy
and intensity, undoing box zooms, drags and the edge
arrows below. Also cancels a pending Zoom In or Drag.

Keyboard: Ctrl+- zooms out one step at a time instead.`},{id:`drag`,label:`Drag`,icon:`Drag-25.png`,help:`DRAG (PAN) THE PLOT

Moves the visible window over the spectrum without
changing the zoom.

How to use:
1. Click this button (the cursor becomes a hand).
2. Left-drag the plot to where you want it.
3. Release: the new view is kept and the tool switches
   off. Click again to drag once more.

Keyboard: Ctrl+Left / Ctrl+Right shift the energy range.`},{id:`plotLimits`,label:`Plot Limits`,icon:`PlotLimits-3.png`,help:`PLOT LIMITS

Opens the Plot Limits window to set the exact range shown:
  Binding Energy (eV): high and low BE
  Intensity (counts/s): max and min

How to use: type values or move the sliders; the plot
follows as you change them. 'Reset' goes back to the
full range.

Example: show exactly 280-295 eV for every C 1s figure
of a paper.`},{id:`greenLine`,label:`Green Line`,icon:`GreenLine-25.png`,iconOn:`GreenLine-Selected-25.png`,help:`GREEN MARKER LINE (ON / OFF)

Shows a green vertical line in the middle of the plot,
with its energy written at the top. Use it to read a
position precisely or to line up features between
spectra.

How to use:
1. Click: the button stays pressed, the line appears.
2. Left-drag the line; the label updates as it moves.
3. Click the button again to remove the line.

It works in every tab and does not change the data.`},{sep:!0},{id:`highBePlus`,label:`High BE +`,icon:`Right-Red-25g.png`,help:`DECREASE HIGH BE (LEFT EDGE ->)

Moves the left (high binding energy) edge of the plot
to the right, cutting off part of the high-BE side.
Each click moves one step: 2% of the visible range, at
least 0.2 eV.

Red arrows = left edge, blue arrows = right edge; each
arrow moves its edge the way it points.

Keyboard: Shift+Left. Zoom Out resets the range.`},{id:`highBeMinus`,label:`High BE -`,icon:`Left-Red-25g.png`,help:`INCREASE HIGH BE (<- LEFT EDGE)

Moves the left (high binding energy) edge of the plot
further left, showing more of the high-BE side.
Each click moves one step: 2% of the visible range, at
least 0.2 eV.

Example: reveal a satellite just above the main peak.

Keyboard: Shift+Right. Zoom Out resets the range.`},{id:`lowBePlus`,label:`Low BE +`,icon:`Left-blue-25g.png`,help:`INCREASE LOW BE (<- RIGHT EDGE)

Moves the right (low binding energy) edge of the plot
to the left, cutting off part of the low-BE side.
Each click moves one step: 2% of the visible range, at
least 0.2 eV.

Red arrows = left edge, blue arrows = right edge; each
arrow moves its edge the way it points.
Zoom Out resets the range.`},{id:`lowBeMinus`,label:`Low BE -`,icon:`Right-blue-25g.png`,help:`DECREASE LOW BE (RIGHT EDGE ->)

Moves the right (low binding energy) edge of the plot
further right, showing more of the low-BE side.
Each click moves one step: 2% of the visible range, at
least 0.2 eV.

Example: bring back the tail of a peak that is cut off
on the right. Zoom Out resets the range.`},{id:`highIntPlus`,label:`High Int +`,icon:`Up-Red-25g.png`,help:`RAISE TOP OF Y AXIS

Increases the maximum intensity shown, so the spectrum
looks smaller and leaves room above it (e.g. for the
legend or labels). Each click adds about 5% of the
highest data point.

On a heatmap it changes the colour scale instead.

Keyboard: Ctrl+Up. Zoom Out resets the range.`},{id:`highIntMinus`,label:`High Int -`,icon:`Down-Red-25g.png`,help:`LOWER TOP OF Y AXIS

Decreases the maximum intensity shown, so the spectrum
is stretched vertically and small peaks are easier to
see (the top of big peaks may go off the plot). Each
click removes about 5% of the highest data point.

On a heatmap it changes the colour scale instead.

Keyboard: Ctrl+Down. Zoom Out resets the range.`},{id:`lowIntPlus`,label:`Low Int +`,icon:`Up-Blue-25g.png`,help:`RAISE BOTTOM OF Y AXIS

Increases the minimum intensity shown, cutting off the
flat bottom of the plot so the peaks fill more of it.
Each click moves about 2% of the highest data point.

Example: a small peak sitting on a high background.
Zoom Out resets the range.`},{id:`lowIntMinus`,label:`Low Int -`,icon:`Down-Blue-25g.png`,help:`LOWER BOTTOM OF Y AXIS

Decreases the minimum intensity shown, adding empty
space below the spectrum (e.g. room for residuals or
labels). Each click moves about 2% of the highest data
point; it can go below zero.

Zoom Out resets the range.`},{sep:!0},{id:`fontUp`,label:`Increase Font Size`,icon:`A+_25.png`,help:`BIGGER TEXT ON THE PLOT (A+)

Increases by 1 pt every font of the plot at once: axis
titles, axis numbers, legend, core-level name and
labels (up to 40 pt).

Handy before copying a figure into slides. The new
sizes are saved as your default and shown in
Preferences > Text/Axis, where each can be set alone.`},{id:`fontDown`,label:`Decrease Font Size`,icon:`A-_25.png`,help:`SMALLER TEXT ON THE PLOT (A-)

Decreases by 1 pt every font of the plot at once: axis
titles, axis numbers, legend, core-level name and
labels (down to 6-8 pt).

The new sizes are saved as your default and shown in
Preferences > Text/Axis, where each can be set alone.`},{id:`labels`,label:`Labels Manager`,icon:`ListText2-25.png`,help:`LABELS MANAGER (ANNOTATIONS)

Opens the Labels Manager to annotate the plot of the
current sheet. You can add:
  - text labels (e.g. 'Ti4+', 'satellite')
  - drawings: lines, arrows, shapes
  - inset plots and PNG images
  - measurements: energy gap (dE), brackets

How to use:
1. Click, then use the window's Add buttons.
2. Select an item in the list to edit its properties,
   nudge it with the arrow buttons, or remove it.`}],Me=[{id:`exportCurrent`,label:`Export Current Core Level`,icon:`Export-25g.png`,help:`EXPORT CURRENT CORE LEVEL TO RESULTS GRID

Copies every peak of the core level on screen into the
Results grid, as new rows added after the existing ones.
Each row gets its position, height, FWHM, area, RSF and
corrected area, and the atomic % of all ticked rows is
recalculated straight away.

How to use:
1. Fit (or measure) the peaks of the current core level.
2. Click this button: the peaks appear at the bottom.
3. Repeat for each core level of the sample.

Each sample has its own Results grid, chosen by the number
at the end of the sheet name (C1s = sample 0, C1s2 = 2).`},{id:`exportMultiple`,label:`Export Multiple Core Levels`,icon:`Export-3.png`,help:`EXPORT SEVERAL CORE LEVELS TO RESULTS GRID

Opens the 'Export to Results Grid' window, where you tick
the core levels to export in one go instead of clicking
the single-export button on each sheet in turn.

How to use:
1. Click to open the window.
2. Tick core levels, or use Select All / Select This Core
   Level / Select This Row (all sheets of this sample).
3. 'Export to Results Grid' adds them after existing rows;
   'Clean and Export' empties the grid first.`},{sep:!0},{id:`delAll`,label:`Delete All Results`,icon:`DelAll-25.png`,help:`DELETE ALL RESULTS

Removes every row of the Results grid of the current
sample, both on screen and in the saved results table.
Use it to start the quantification of a sample again.

No confirmation is asked: the rows go at once.
Only this sample's grid is cleared (the sample is set by
the number at the end of the sheet name).`},{id:`delFirst`,label:`Delete First Row`,icon:`DelFirst-25.png`,help:`DELETE FIRST ROW

Removes the top row of the Results grid of the current
sample. The remaining rows move up and are renumbered.

Handy when the oldest exported peak is no longer wanted.
No confirmation is asked.`},{id:`delLast`,label:`Delete Last Row`,icon:`DelLast-25.png`,help:`DELETE LAST ROW

Removes the bottom row of the Results grid of the current
sample, i.e. the most recently exported peak.

Example: you exported a core level twice by mistake -
click this once per duplicated peak.
No confirmation is asked.`},{id:`delSelected`,label:`Delete Selected Row`,icon:`DelSelected-25.png`,help:`DELETE SELECTED ROW

Removes one chosen row of the Results grid of the current
sample. The rows below move up and are renumbered.

How to use:
1. Click a row label (or any cell) in the Results grid.
2. Click this button.

If several full rows are selected, only the first one is
deleted. No confirmation is asked.`}],Ne=[{id:`plot`,label:`Toggle Plot`,icon:`scatter-plot-25.png`,help:`SHOW / HIDE THE FIT

Switches the plot between the full view (raw data with
background, peaks and envelope) and the raw data alone.
Click again to bring the fit back. Nothing is deleted.

Example: show the bare spectrum before presenting the
peak model.`},{id:`peakFill`,label:`Toggle Peak Fill`,icon:`STO-25-2.png`,help:`PEAK FILL ON / OFF

Draws the fitted peaks as coloured filled areas, or as
outlines only. Outlines are clearer when many peaks
overlap; filled peaks read better on slides.`},{id:`yAxis`,label:`Toggle Y Axis`,icon:`Y-25.png`,help:`Y AXIS STYLE (3 STATES)

Each click moves to the next style of the intensity axis:
  1. 'Intensity (CPS)' with numbers
  2. Y axis hidden completely
  3. 'Intensity (a.u.)' without numbers

Style 3 is the usual choice for publication figures.`},{id:`legend`,label:`Toggle Legend`,icon:`Legend-25.png`,help:`LEGEND STYLE (3 STATES)

Each click moves to the next legend style:
  - hidden
  - full (raw data, background, envelope and peaks)
  - peaks only (named components)

When a Fermi-edge fit is on the plot the legend always
stays visible. The legend can be dragged with the mouse.`},{id:`fitResults`,label:`Toggle Fit Results`,icon:`ToggleFit-25.png`,help:`FIT RESULTS BOX ON / OFF

Shows or hides the small box of fit results drawn in
the lower-left corner of the plot. Only has an effect
once a fit has produced that box.`},{id:`residuals`,label:`Toggle Residuals`,icon:`Res-25.png`,help:`RESIDUALS DISPLAY (3 STATES)

Residuals = data minus fit; a good fit leaves only
noise. Each click moves to the next display:
  - hidden
  - drawn on the main plot, above the spectrum
  - in a separate panel under the plot`}],Pe=`SHEET SELECTOR

Lists every sheet (core level, survey, other technique)
of the open project. Pick one to plot it and load its
background, peaks and fit into the grids.

Shortcuts: Ctrl+[ or Ctrl+9 = previous sheet,
           Ctrl+] or Ctrl+0 = next sheet.`,Fe=`BINDING ENERGY CORRECTION (eV)

Shift applied to the binding-energy axis of every sheet
of the current sample (charge correction). The sample
is set by the number at the end of the sheet name, so
C1s2, O1s2 and Survey2 all share one value.

How to use: type a value or use the arrows (0.01 eV
steps). Positive values move peaks to higher BE.

Example: C 1s C-C fitted at 285.30 eV, reference
284.80 eV -> enter -0.50.
The Auto BE button next to it computes this for you.`,Ie=`/apps/khervefitting/icons/`;function G({spec:e,state:t,onClick:n}){let r=t?.checked&&e.iconOn?e.iconOn:e.icon;return(0,R.jsx)(`button`,{type:`button`,className:`kf-tool${t?.checked?` kf-checked`:``}`,title:e.help,"aria-label":e.label,disabled:t?.disabled,onClick:t=>n(e.id,t.currentTarget),children:(0,R.jsx)(`img`,{src:Ie+r,width:25,height:25,alt:``,draggable:!1})})}function K({specs:e,vertical:t,states:n,onTool:r,controls:i}){return(0,R.jsx)(R.Fragment,{children:e.map((e,a)=>e.sep?(0,R.jsx)(`span`,{className:t?`kf-hsep`:`kf-vsep`},a):e.stretch?(0,R.jsx)(`span`,{className:`kf-grow`},a):e.control?(0,R.jsx)(`span`,{className:`kf-control`,children:i?.[e.control]},a):(0,R.jsx)(G,{spec:e,state:n[e.id],onClick:r},a))})}function Le({value:e,onChange:t,step:n=.01,digits:r=2,width:i=70,title:a,disabled:o}){let[s,c]=(0,g.useState)(e.toFixed(r));(0,g.useEffect)(()=>c(e.toFixed(r)),[e,r]);let l=i=>{if(!Number.isFinite(i))return c(e.toFixed(r));let a=Math.round(i/n)*n;c(a.toFixed(r)),Math.abs(a-e)>n/10&&t(Number(a.toFixed(r)))};return(0,R.jsxs)(`span`,{className:`kf-spin`,title:a,style:{width:i},children:[(0,R.jsx)(`input`,{value:s,disabled:o,onChange:e=>c(e.target.value),onBlur:()=>l(Number(s)),onKeyDown:t=>{t.stopPropagation(),t.key===`Enter`&&l(Number(s)),t.key===`ArrowUp`&&(t.preventDefault(),l(e+n)),t.key===`ArrowDown`&&(t.preventDefault(),l(e-n))}}),(0,R.jsxs)(`span`,{className:`kf-spin-btns`,children:[(0,R.jsx)(`button`,{type:`button`,tabIndex:-1,disabled:o,onClick:()=>l(e+n),children:`▲`}),(0,R.jsx)(`button`,{type:`button`,tabIndex:-1,disabled:o,onClick:()=>l(e-n),children:`▼`})]})]})}function q({sheets:e,sheet:t,be:n,states:r,onSheet:i,onBe:a,onTool:o}){let s={sheet:(0,R.jsxs)(`select`,{className:`kf-combo`,value:t,title:Pe,onChange:e=>i(e.target.value),disabled:!e.length,"aria-label":`Sheet selector`,children:[!e.length&&(0,R.jsx)(`option`,{value:``}),e.map(e=>(0,R.jsx)(`option`,{children:e},e))]}),be:(0,R.jsx)(Le,{value:n,onChange:a,title:Fe,disabled:!e.length})};return(0,R.jsx)(`div`,{className:`kf-toolbar`,children:(0,R.jsx)(K,{specs:Ae,states:r,onTool:o,controls:s})})}function Re({states:e,onTool:t}){return(0,R.jsx)(`div`,{className:`kf-vtoolbar`,children:(0,R.jsx)(K,{specs:je,vertical:!0,states:e,onTool:t})})}function J({states:e,onTool:t}){return(0,R.jsx)(`div`,{className:`kf-rtoolbar`,children:(0,R.jsx)(K,{specs:Me,states:e,onTool:t})})}function ze({at:e,onTool:t,onClose:n}){let r=(0,g.useRef)(null);return(0,g.useEffect)(()=>{let e=e=>{r.current&&!r.current.contains(e.target)&&n()};return window.addEventListener(`pointerdown`,e,!0),()=>window.removeEventListener(`pointerdown`,e,!0)},[n]),(0,R.jsx)(`div`,{className:`kf-toggles`,ref:r,style:{left:e.x,top:e.y},children:(0,R.jsx)(K,{specs:Ne,states:{},onTool:e=>t(e)})})}function Y(e){return e===`Simple Dark`?[200,203,205]:e===`Simple Darker`?[165,165,168]:e===`Simple Very Dark`?[140,140,142]:[240,240,240]}var Be=(e,t,n)=>e.map((e,r)=>Math.round(e+(t[r]-e)*n)),X=[200,245,228],Ve=[79,190,159],He=Array.from({length:10},(e,t)=>({label:t===0?`Light Green (default)`:t===9?`KherveFitting Green`:`Green ${t+1}`,rgb:Be(X,Ve,t/9)})),Ue=`Simple Darker`,We=[146,221,197],Ge=e=>`rgb(${e[0]}, ${e[1]}, ${e[2]})`,Z=(e,t)=>Ge(e.map(e=>Math.max(0,Math.min(255,e+t))));function Ke(e,t){let n=Y(e);return{"--kf-panel":Ge(n),"--kf-panel-line":Z(n,-45),"--kf-hover":Z(n,-28),"--kf-press":Z(n,-50),"--kf-cons":Ge(t),"--kf-green":`#4FBE9F`}}function qe({title:e,icon:t,initial:n,width:r,height:i,onClose:a,children:o,className:s}){let[c,l]=(0,g.useState)(n),u=(0,g.useRef)(null);return(0,R.jsxs)(`div`,{className:`kf-float ${s??``}`,style:{left:c.x,top:c.y,width:r,height:i},onKeyDown:e=>e.stopPropagation(),role:`dialog`,"aria-label":e,children:[(0,R.jsxs)(`div`,{className:`kf-float-title`,onPointerDown:e=>{e.target.closest(`button`)||(e.currentTarget.setPointerCapture(e.pointerId),u.current={dx:e.clientX-c.x,dy:e.clientY-c.y})},onPointerMove:e=>{if(!u.current)return;let t=e.currentTarget.parentElement?.offsetParent??null,n=t?t.clientWidth-60:4e3,i=t?t.clientHeight-24:4e3;l({x:Math.max(-r+60,Math.min(n,e.clientX-u.current.dx)),y:Math.max(0,Math.min(i,e.clientY-u.current.dy))})},onPointerUp:()=>u.current=null,children:[t&&(0,R.jsx)(`img`,{src:t,width:16,height:16,alt:``}),(0,R.jsx)(`span`,{children:e}),(0,R.jsx)(`button`,{type:`button`,className:`kf-float-close`,title:`Close`,onClick:a,children:`✕`})]}),(0,R.jsx)(`div`,{className:`kf-float-body`,children:o})]})}function Je({tabs:e,active:t,onChange:n,children:r}){return(0,R.jsxs)(`div`,{className:`kf-notebook`,children:[(0,R.jsx)(`div`,{className:`kf-tabs`,role:`tablist`,children:e.map((e,r)=>(0,R.jsx)(`button`,{type:`button`,role:`tab`,"aria-selected":r===t,className:r===t?`kf-tab-on`:``,onClick:()=>n(r),children:e},e))}),(0,R.jsx)(`div`,{className:`kf-page`,children:r})]})}function Q({limits:e,onChange:t,onReset:n,onClose:r}){let[i]=(0,g.useState)(e),[a,o]=(0,g.useState)(e);(0,g.useEffect)(()=>o(e),[e]);let s=e=>{let n={...a,...e};o(n),t(n)},c=Math.max(1,(i.xmax-i.xmin)*2),l=Math.max(1,(i.ymax-i.ymin)*2),u=(e,t,n,r,i)=>(0,R.jsxs)(`div`,{className:`kf-limrow`,children:[(0,R.jsx)(`span`,{className:`kf-limlabel`,children:e}),(0,R.jsx)(`input`,{type:`range`,min:n,max:r,step:(r-n)/1e3,value:a[t],onChange:e=>s({[t]:Number(e.target.value)})}),(0,R.jsx)(Le,{value:a[t],step:i,width:85,onChange:e=>s({[t]:e})})]});return(0,R.jsx)(qe,{title:`Plot Limits`,initial:{x:120,y:120},width:340,onClose:r,children:(0,R.jsxs)(`div`,{className:`kf-limits`,children:[(0,R.jsxs)(`fieldset`,{className:`kf-box`,children:[(0,R.jsx)(`legend`,{children:`Binding Energy (eV)`}),u(`Max:`,`xmax`,i.xmin-c/2,i.xmax+c/2,.1),u(`Min:`,`xmin`,i.xmin-c/2,i.xmax+c/2,.1)]}),(0,R.jsxs)(`fieldset`,{className:`kf-box`,children:[(0,R.jsx)(`legend`,{children:`Intensity (counts/s)`}),u(`Max:`,`ymax`,i.ymin-l/2,i.ymax+l/2,100),u(`Min:`,`ymin`,i.ymin-l/2,i.ymax+l/2,100)]}),(0,R.jsx)(`div`,{className:`kf-limbtns`,children:(0,R.jsx)(`button`,{type:`button`,className:`kf-wxbtn`,onClick:n,children:`Reset`})})]})})}function Ye({report:e,log:t}){return(0,R.jsxs)(`div`,{className:`kf-doc kf-report`,children:[t.length>1&&(0,R.jsxs)(`table`,{className:`kf-log`,children:[(0,R.jsx)(`thead`,{children:(0,R.jsxs)(`tr`,{children:[(0,R.jsx)(`th`,{children:`Fit`}),(0,R.jsx)(`th`,{children:`R²`}),(0,R.jsx)(`th`,{children:`Red. χ²`}),(0,R.jsx)(`th`,{children:`Evaluations`})]})}),(0,R.jsx)(`tbody`,{children:t.map(e=>(0,R.jsxs)(`tr`,{children:[(0,R.jsx)(`td`,{children:e.i}),(0,R.jsx)(`td`,{children:e.r2.toFixed(6)}),(0,R.jsx)(`td`,{children:e.redChi2.toFixed(3)}),(0,R.jsx)(`td`,{children:e.nfev})]},e.i))})]}),(0,R.jsx)(`pre`,{children:e||`No fit report yet: press Fit first.`})]})}function Xe({settings:e,onChange:t}){let[n,r]=(0,g.useState)(e),i=e=>{r({...n,...e}),t(e)};return(0,R.jsxs)(`div`,{className:`kf-doc kf-settings`,children:[(0,R.jsxs)(`label`,{children:[`Photon energy (eV)`,(0,R.jsx)(`input`,{className:`k-input`,defaultValue:n.photons,onBlur:e=>Number(e.target.value)>0&&i({photons:Number(e.target.value)})})]}),(0,R.jsxs)(`label`,{children:[`Sensitivity factors (instrument)`,(0,R.jsxs)(`select`,{className:`k-input`,value:n.instrument,onChange:e=>i({instrument:e.target.value}),children:[!n.instruments.includes(n.instrument)&&(0,R.jsx)(`option`,{children:n.instrument}),n.instruments.map(e=>(0,R.jsx)(`option`,{children:e},e))]})]}),(0,R.jsxs)(`label`,{children:[`Energy compensation (ECF)`,(0,R.jsx)(`select`,{className:`k-input`,value:n.libraryType,onChange:e=>i({libraryType:e.target.value}),children:F.map(e=>(0,R.jsx)(`option`,{children:e},e))})]}),(0,R.jsxs)(`label`,{children:[`Work function for VAMAS imports (eV)`,(0,R.jsx)(`input`,{className:`k-input`,defaultValue:n.workfunction,onBlur:e=>Number.isFinite(Number(e.target.value))&&i({workfunction:Number(e.target.value)})})]}),(0,R.jsx)(`p`,{className:`kf-note`,children:`Atomic % = area / (RSF × TXFN × ECF), normalised over the ticked rows of the results table. RSFs come from KherveFitting's library (KherveFitting_library.parquet); Export picks them for the instrument above.`})]})}var $=/Mac|iPhone|iPad/.test(navigator.userAgent)?`⌘`:`Ctrl+`;function Ze(){let e=[[`Tab`,`Select next peak`],[`Q`,`Select previous peak`],[`${$}Minus (-)`,`Zoom out`],[`${$}Equal (=)`,`Zoom in`],[`${$}Left bracket [`,`Select previous core level`],[`${$}Right bracket ]`,`Select next core level`],[`${$}Up`,`Increase plot intensity`],[`${$}Down`,`Decrease plot intensity`],[`${$}Left`,`Move plot to High BE`],[`${$}Right`,`Move plot to Low BE`],[`SHIFT+Left`,`Decrease High BE`],[`SHIFT+Right`,`Increase High BE`],[`${$}Z`,`Undo up to 50 events`],[`${$}Y`,`Redo`],[`${$}S`,`Save. Only works on the grid and not on the figure canvas`],[`${$}P`,`Open peak fitting window`],[`${$}K`,`Show Keyboard shortcut`],[`Alt+Up`,`Increase peak intensity`],[`Alt+Down`,`Decrease peak intensity`],[`Alt+Left`,`Move peak to High BE`],[`Alt+Right`,`Move peak to Low BE`],[`Alt+SHIFT+Left`,`Decrease FWHM`],[`Alt+SHIFT+Right`,`Increase FWHM`],[`SHIFT+Mouse Left button`,`increase/decrease FWHM in Peak Fitting Tab`],[`SHIFT+Mouse Left button`,`increase/decrease Offset Low or High in the BKG Tab`]];return(0,R.jsxs)(`div`,{className:`kf-doc`,children:[(0,R.jsx)(`p`,{children:`KherveFitting fits X-ray photoelectron spectra with the desktop KherveFitting-AI's own code, running in Python in this window, so a fit gives the same numbers as on the desktop. The toolbar buttons are the desktop's: hover one for its help.`}),(0,R.jsxs)(`ol`,{children:[(0,R.jsx)(`li`,{children:`Open a workbook (File › Open, or File › Open Examples), or import a VAMAS / CSV file (File › Import › XPS).`}),(0,R.jsxs)(`li`,{children:[`Pick the core level in the sheet selector; open the Peak Fitting window (the C1s button, `,$,`P).`]}),(0,R.jsxs)(`li`,{children:[`BKG tab: drag the red lines around the peaks (Ctrl+drag moves both, Shift+click sets the offset), choose the method, press `,(0,R.jsx)(`b`,{children:`Create Region`}),`; dragging a line afterwards redraws the active region.`]}),(0,R.jsxs)(`li`,{children:[`Fitting tab: choose the model, `,(0,R.jsx)(`b`,{children:`Add 1 Peak`}),` / `,(0,R.jsx)(`b`,{children:`Add 2 Peaks Doublet`}),`; select a peak (Tab / Q or its row) and drag its ×, scroll to change its width; then `,(0,R.jsx)(`b`,{children:`Fit Until Stable`}),`.`]}),(0,R.jsxs)(`li`,{children:[`Type constraints in the green rows: `,(0,R.jsx)(`code`,{children:`Fixed`}),`, `,(0,R.jsx)(`code`,{children:`0.5:2`}),`, `,(0,R.jsx)(`code`,{children:`A+1.2#0.2`}),`, `,(0,R.jsx)(`code`,{children:`A*0.5`}),`, `,(0,R.jsx)(`code`,{children:`C1s_A+0.3`}),`.`]}),(0,R.jsx)(`li`,{children:`Export the peaks to the Results grid (its first button) to get the atomic %.`}),(0,R.jsx)(`li`,{children:`Save: the workbook (.xlsx) and its .json are written side by side, as the desktop does.`})]}),(0,R.jsx)(`table`,{className:`kf-keys`,children:(0,R.jsx)(`tbody`,{children:e.map(([e,t],n)=>(0,R.jsxs)(`tr`,{children:[(0,R.jsx)(`td`,{children:(0,R.jsx)(`kbd`,{children:e})}),(0,R.jsx)(`td`,{children:t})]},`${e}${n}`))})})]})}var Qe=[`Adv. Fitting (continuous fit, auto-tune of the background offsets), Tougaard / Raman / XAS model window, Mini fitting toolbar`,`Plot Modifications, Thickness analysis, VB / Fermi / Cut-Off, Spectral denoising, PCA (noise), Multiplet envelope fit, Wagner plot, AR-XPS`,`Profile Creator, Plot Creator (books), Overview, Labels Manager, Preferences other than the instrument / library`,`kAI chat and MCP inside the app (KherveOS has its own AI tools for KherveFitting), kDB opens as its own app`,`Imports other than KherveFitting workbooks, VAMAS, CSV and TXT (Avantage, Kratos, PHI, Scienta, VG, MRS, ASC, Igor, other techniques)`,`The .kfit (HDF5) and .ksheet formats, Word reports, PDF export, Excel plot pictures, auto-backup`];function $e({source:e}){return(0,R.jsxs)(`div`,{className:`kf-doc`,children:[(0,R.jsxs)(`p`,{children:[(0,R.jsx)(`b`,{children:`KherveFitting`}),` — XPS peak fitting. Web edition for KherveOS of the desktop KherveFitting-AI v2.05 (LG4X-V3) by Gwilherm Kerherve, Imperial College London, built on LG4X by Hideki Nakajima and LG4X-V2 by Julian A. Hochhaus.`]}),(0,R.jsxs)(`p`,{children:[`The fitting core (`,e,`) is the desktop's own code without wxPython; it runs on NumPy, SciPy and lmfit in Pyodide. Free software, GPL-3.0.`]}),(0,R.jsx)(`p`,{children:`Not in this edition yet:`}),(0,R.jsx)(`ul`,{children:Qe.map(e=>(0,R.jsx)(`li`,{children:e},e))})]})}export{de as A,oe as B,_e as C,pe as D,ue as E,I as F,p as H,k as I,ee as L,he as M,be as N,fe as O,xe as P,re as R,ge as S,M as T,h as U,ie as V,m as W,z as _,Q as a,P as b,We as c,Ke as d,Ie as f,ze as g,J as h,Xe as i,ve as j,me as k,Ue as l,Re as m,Ze as n,qe as o,q as p,Ye as r,Je as s,$e as t,He as u,ke as v,j as w,N as x,U as y,A as z};