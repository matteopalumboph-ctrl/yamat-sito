/* Yamat · il bosco, seconda versione: un film d'animazione con dentro le candele vere (4/11).
   Matteo: «mescolato tra reale e questo… effetto camera drone cinematic… animali che corrono… fatto dal miglior designer Pixar».
   - Il mondo è scritto da codice, in stile animazione: forme morbide, luce della luna con ombre, raggi tra gli alberi,
     foschia bassa, vento sulle fronde, lepri, scoiattolo, gufo, cervi, farfalle, un pesce nel ruscello.
   - Le candele sono il vero: la Kora è il modello ricostruito dalla foto (3d/kora.glb) con il sigillo vero,
     le altre portano l'etichetta vera ritagliata dalla foto e il cemento con la sua grana.
   - La camera vola come un drone: parte alta sul bosco al tramonto, si tuffa, corre rasoterra piegandosi in curva,
     gira attorno a ogni candela mettendola a fuoco come un obiettivo vero (sfocato dietro, bagliore sulle fiamme).
   Prove: bosco3d.html?debug espone window.__B; ?t=3.4 mette la camera in quel punto del percorso. */
import * as THREE from 'three';
import {mergeVertices, mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';

const Q = new URLSearchParams(location.search);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const PORT = () => innerWidth < innerHeight * .9;
const LOW = PORT() || (navigator.hardwareConcurrency || 8) <= 4 || Q.has('low');

/* ---------- la foschia sta bassa: la nebbia di three diventa più densa vicino al terreno ---------- */
THREE.ShaderChunk.fog_pars_vertex = '#ifdef USE_FOG\nvarying float vFogDepth;varying float vFogH;\n#endif';
THREE.ShaderChunk.fog_vertex = '#ifdef USE_FOG\nvFogDepth=-mvPosition.z;vFogH=((mvPosition.xyz-viewMatrix[3].xyz)*mat3(viewMatrix)).y;\n#endif';
THREE.ShaderChunk.fog_pars_fragment = '#ifdef USE_FOG\nuniform vec3 fogColor;varying float vFogDepth;varying float vFogH;\n#ifdef FOG_EXP2\nuniform float fogDensity;\n#else\nuniform float fogNear;uniform float fogFar;\n#endif\n#endif';
THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
#ifdef FOG_EXP2
float fogFactor=1.-exp(-fogDensity*fogDensity*vFogDepth*vFogDepth);
#else
float fogFactor=smoothstep(fogNear,fogFar,vFogDepth);
#endif
float mist=(1.-exp(-vFogDepth*.08))*exp(-max(vFogH+.3,0.)*.75)*.6;
gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,clamp(fogFactor+mist,0.,1.));
#endif`;

/* ---------- numeri a caso ma sempre uguali ---------- */
let seed = 11;
const rnd = () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const R = (a, b) => a + (b - a) * rnd();
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y) => vnoise(x, y) * .55 + vnoise(x * 2.1 + 7, y * 2.1) * .3 + vnoise(x * 4.3, y * 4.3 + 3) * .15;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const col = c => new THREE.Color(c);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

/* ---------- il terreno (come nella prima versione): sentiero verso -z, ruscello, radura ---------- */
const px = z => 1.8 * Math.sin(z * .085) + .9 * Math.sin(z * .21 + 1.3);
const sz = x => -36 + 1.6 * Math.sin(x * .11 + .5);
const CL = {x: px(-68), z: -68, r: 10};
function terrain(x, z) {
  const dp = Math.abs(x - px(z));
  let h = (fbm(x * .045, z * .045) - .5) * 5.2 + (fbm(x * .2, z * .2) - .5) * .5;
  h *= .22 + .78 * sstep(1.2, 5, dp);
  h += Math.max(0, dp - 9) * .07;
  const dc = Math.hypot(x - CL.x, z - CL.z), fc = sstep(CL.r * .55, CL.r * 1.5, dc);
  h = h * fc + (1 - fc) * (fbm(x * .3, z * .3) - .5) * .25;
  if (z < CL.z - 2) h += Math.max(0, CL.z - 2 - z) * .05 * sstep(2, 6, dc - CL.r);
  const k = 1 - sstep(.7, 2.7, Math.abs(z - sz(x)));
  return h * (1 - k) - .8 * k;
}
const gy = (x, z) => Math.max(terrain(x, z), -.1);
const ZC = (() => { let z = -36; for (let k = 0; k < 6; k++) z = sz(px(z)); return z; })(), XC = px(ZC);

/* ---------- geometrie ---------- */
const merge = gs => mergeGeometries(gs, false);
function smoothen(g) { for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k); return mergeVertices(g, 1e-4); }
function wobble(g, amp, f, so = 0) {
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = vnoise(v.x * f + so, v.y * f + v.z * .7 * f) + vnoise(v.z * f - so, v.x * f * .8 + v.y * .5 * f) - 1;
    v.multiplyScalar(1 + amp * n); p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals(); return g;
}
function paint(g, c) {
  g = g.index ? g.toNonIndexed() : g;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const n = g.attributes.position.count, a = new Float32Array(n * 3), p = g.attributes.position, nr = g.attributes.normal, C = new THREE.Color();
  for (let i = 0; i < n; i++) { if (typeof c === 'function') C.copy(c(p.getX(i), p.getY(i), p.getZ(i), nr ? nr.getY(i) : 0)); else C.set(c); a[i * 3] = C.r; a[i * 3 + 1] = C.g; a[i * 3 + 2] = C.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
const lath = (pts, seg = 12, ph = 0) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg, ph);
function blob(r, amp, so, det = 1) { return wobble(smoothen(new THREE.IcosahedronGeometry(r, det)), amp, 1.6 / r, so); }

/* ---------- materiali ---------- */
const WIND = {value: 0};
function sway(m, amt) {   // il vento: più si sale sulla pianta, più si muove
  m.onBeforeCompile = s => {
    s.uniforms.uT = WIND;
    s.vertexShader = 'uniform float uT;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 ip=vec3(0.);
      #ifdef USE_INSTANCING
      ip=instanceMatrix[3].xyz;
      #endif
      float sw=sin(uT*1.1+ip.x*.27+ip.z*.19)+.45*sin(uT*2.3+ip.z*.5+ip.x*.1);float hh=max(position.y,0.);
      transformed.xz+=vec2(sw,sw*.6)*${amt.toFixed(4)}*hh*hh;`);
  };
  m.customProgramCacheKey = () => 'sway' + amt; return m;
}
const veg = (amt = 0) => { const m = new THREE.MeshLambertMaterial({vertexColors: true}); return amt ? sway(m, amt) : m; };
const lam = c => new THREE.MeshLambertMaterial({color: col(c)});
function canvasTex(w, h, draw, srgb = true) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
/* grana del cemento: una mappa di rilievo fatta di granelli */
const grain = (() => {
  const n = 256, hgt = new Float32Array(n * n); for (let i = 0; i < n * n; i++) hgt[i] = Math.random() * .6 + (Math.random() < .03 ? -1.2 : 0);
  return canvasTex(n, n, (x) => { const d = x.createImageData(n, n);
    for (let y = 0; y < n; y++) for (let X = 0; X < n; X++) { const i = y * n + X, dx = hgt[y * n + (X + 1) % n] - hgt[y * n + (X + n - 1) % n], dy = hgt[((y + 1) % n) * n + X] - hgt[((y + n - 1) % n) * n + X];
      const l = Math.hypot(dx, dy, 1); d.data[i * 4] = (-dx / l * .5 + .5) * 255; d.data[i * 4 + 1] = (-dy / l * .5 + .5) * 255; d.data[i * 4 + 2] = (1 / l * .5 + .5) * 255; d.data[i * 4 + 3] = 255; }
    x.putImageData(d, 0, 0); }, false);
})();
grain.wrapS = grain.wrapT = THREE.RepeatWrapping; grain.repeat.set(5, 3);
const glowTex = canvasTex(128, 128, x => { const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,236,190,1)'); g.addColorStop(.2, 'rgba(255,196,110,.5)'); g.addColorStop(.55, 'rgba(255,150,60,.12)'); g.addColorStop(1, 'rgba(255,120,40,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); });
const shadowTex = canvasTex(64, 64, x => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(0,0,0,.8)'); g.addColorStop(.6, 'rgba(0,0,0,.3)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); });
const moonTex = canvasTex(256, 256, x => {
  const g = x.createRadialGradient(128, 128, 56, 128, 128, 128); g.addColorStop(0, 'rgba(255,240,215,.4)'); g.addColorStop(1, 'rgba(255,240,215,0)'); x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  const m = x.createRadialGradient(118, 118, 10, 128, 128, 60); m.addColorStop(0, '#fffaf0'); m.addColorStop(1, '#efe2c6'); x.fillStyle = m; x.beginPath(); x.arc(128, 128, 58, 0, 7); x.fill();
  x.fillStyle = 'rgba(180,160,135,.35)'; [[108, 112, 12], [150, 138, 9], [124, 156, 7], [146, 104, 6], [100, 142, 5]].forEach(([a, b, r]) => { x.beginPath(); x.arc(a, b, r, 0, 7); x.fill(); });
});
const ringsTex = canvasTex(256, 256, x => {
  x.fillStyle = '#b48d5e'; x.fillRect(0, 0, 256, 256);
  for (let r = 6; r < 128; r += R(6, 11)) { x.strokeStyle = `rgba(90,60,35,${R(.25, .5)})`; x.lineWidth = R(1.5, 3); x.beginPath(); x.ellipse(128 + R(-3, 3), 128 + R(-3, 3), r, r * R(.95, 1.03), 0, 0, 7); x.stroke(); }
});
const wingTex = canvasTex(128, 128, x => {
  const g = x.createRadialGradient(40, 64, 4, 64, 64, 64); g.addColorStop(0, '#fff6c8'); g.addColorStop(.35, '#ffc95a'); g.addColorStop(.75, '#e0702a'); g.addColorStop(1, 'rgba(120,40,20,0)');
  x.fillStyle = g; x.beginPath(); x.ellipse(64, 60, 58, 44, -.3, 0, 7); x.fill(); x.fillStyle = 'rgba(40,20,10,.55)'; x.beginPath(); x.arc(86, 46, 7, 0, 7); x.fill();
});

/* ---------- prima le immagini vere dei prodotti: cemento con i pori, teak, lino, sigilli con la Y, etichetta ---------- */
const TL = new THREE.TextureLoader(), TEX = {};
await Promise.all(['cemento_colore', 'cemento_rilievo', 'teak_colore', 'teak_rilievo', 'lino_colore', 'lino_rilievo', 'sigillo_verde', 'sigillo_rosso', 'sigillo_rilievo', 'etichetta_quadra'].map(async n => {
  const t = await TL.loadAsync(`bosco3d/vero/${n}.webp`).catch(() => null); if (!t) return;
  t.anisotropy = 8; if (/teak_colore|sigillo_(verde|rosso)|etichetta/.test(n)) t.colorSpace = THREE.SRGBColorSpace;
  if (!/sigillo|etichetta/.test(n)) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  TEX[n] = t;
}));

/* ---------- il bosco vero: scansioni e animali CC0 (Poly Haven, Quaternius), vedi bosco3d/vero/CREDITI.txt ---------- */
const VERO = {};
{
  const L = new GLTFLoader(); L.setMeshoptDecoder(MeshoptDecoder);
  await Promise.all(['ceppo', 'rocce', 'tronco', 'felci', 'cerva', 'cervo', 'volpe'].map(async n => { VERO[n] = Q.has('finto') ? null : await L.loadAsync(`bosco3d/vero/${n}.glb`).catch(() => null); }));
  const T = await Promise.all(['erba_colore', 'foglie_colore', 'terra_colore', 'terra_rilievo'].map(n => Q.has('finto') ? null : TL.loadAsync(`bosco3d/vero/${n}.webp`).catch(() => null)));
  if (T.every(Boolean)) { T.forEach((t, k) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (k < 3) t.colorSpace = THREE.SRGBColorSpace; }); VERO.suolo = T; }
}
/* tutte le mesh di un glb in una geometria sola, in metri e in float */
function piatto(gl) {
  gl.scene.updateMatrixWorld(true); const gs = []; let mat = null;
  gl.scene.traverse(o => {
    if (!o.isMesh) return; mat = mat || o.material; const g = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'uv']) {
      const a = o.geometry.attributes[k]; if (!a) continue; const n = a.itemSize, f = new Float32Array(a.count * n), get = ['getX', 'getY', 'getZ', 'getW'];
      for (let i = 0; i < a.count; i++) for (let j = 0; j < n; j++) f[i * n + j] = a[get[j]](i);
      g.setAttribute(k, new THREE.BufferAttribute(f, n));
    }
    g.setIndex(Array.from(o.geometry.index.array)); g.applyMatrix4(o.matrixWorld); gs.push(g);
  });
  return {g: gs.length > 1 ? merge(gs) : gs[0], mat};
}
/* una scansione con più pezzi staccati (le rocce, le felci): un pezzo per geometria, il più grande per primo */
function isole(g, min = 240) {
  const p = g.attributes.position, ix = g.index.array, par = new Int32Array(p.count).map((_, i) => i);
  const f = i => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; }, u = (a, b) => { a = f(a); b = f(b); if (a !== b) par[a] = b; };
  const seen = new Map(); for (let i = 0; i < p.count; i++) { const k = `${Math.round(p.getX(i) * 1e3)},${Math.round(p.getY(i) * 1e3)},${Math.round(p.getZ(i) * 1e3)}`; if (seen.has(k)) u(i, seen.get(k)); else seen.set(k, i); }
  for (let i = 0; i < ix.length; i += 3) { u(ix[i], ix[i + 1]); u(ix[i], ix[i + 2]); }
  const grp = new Map(); for (let i = 0; i < ix.length; i += 3) { const r = f(ix[i]); if (!grp.has(r)) grp.set(r, []); grp.get(r).push(ix[i], ix[i + 1], ix[i + 2]); }
  return [...grp.values()].filter(a => a.length >= min).sort((a, b) => b.length - a.length).map(a => {
    const map = new Map(), ni = a.map(i => { if (!map.has(i)) map.set(i, map.size); return map.get(i); }), h = new THREE.BufferGeometry();
    for (const [k, at] of Object.entries(g.attributes)) { const s = at.itemSize, out = new Float32Array(map.size * s); for (const [o, m] of map) for (let j = 0; j < s; j++) out[m * s + j] = at.array[o * s + j]; h.setAttribute(k, new THREE.BufferAttribute(out, s)); }
    h.setIndex(ni); return h;
  });
}
/* un pezzo appoggiato a terra: centrato, largo w (o alto h), la base un po' sotto terra */
function aTerra(g, {w = 0, h = 0, sy = 1, aff = .12} = {}) {
  g = g.clone(); g.computeBoundingBox(); let b = g.boundingBox, c = b.getCenter(V3()), d = b.getSize(V3());
  const s = w ? w / Math.max(d.x, d.z) : h / d.y; g.translate(-c.x, -b.min.y, -c.z); g.scale(s, s * sy, s); g.translate(0, -aff * d.y * s * sy, 0);
  g.computeBoundingBox(); g.computeBoundingSphere(); return g;
}
/* la cima piana dove sta la candela: il centro va sulla parte più alta, poi un taglio netto nel raggio rc */
function tavola(g, rc) {
  const p = g.attributes.position, n = g.attributes.normal; let ymax = -1e9;
  for (let i = 0; i < p.count; i++) ymax = Math.max(ymax, p.getY(i));
  let cx = 0, cz = 0, cn = 0; for (let i = 0; i < p.count; i++) if (p.getY(i) > ymax - .06) { cx += p.getX(i); cz += p.getZ(i); cn++; }
  g.translate(-cx / cn, 0, -cz / cn);
  let top = 1e9; for (let i = 0; i < p.count; i++) if (Math.hypot(p.getX(i), p.getZ(i)) < rc && n.getY(i) > .25 && p.getY(i) > ymax * .4) top = Math.min(top, p.getY(i));
  if (top > 1e8) top = ymax;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > top) { p.setY(i, top); n.setXYZ(i, 0, 1, 0); }
  /* via i triangoli schiacciati dal taglio: senza area la mappa del rilievo dà NaN e il bagliore fa un quadrato nero */
  const ix = g.index.array, keep = [], A = V3(), B = V3(), C = V3();
  for (let i = 0; i < ix.length; i += 3) { A.fromBufferAttribute(p, ix[i]); B.fromBufferAttribute(p, ix[i + 1]).sub(A); C.fromBufferAttribute(p, ix[i + 2]).sub(A); if (B.cross(C).length() > 1e-6) keep.push(ix[i], ix[i + 1], ix[i + 2]); }
  g.setIndex(keep);
  p.needsUpdate = n.needsUpdate = true; g.computeBoundingBox(); g.computeBoundingSphere(); return top;
}
const VPEZZI = {};
if (VERO.rocce) { const {g, mat} = piatto(VERO.rocce); VPEZZI.rocce = isole(g, 600); VPEZZI.roccia = mat; mat.roughness = 1; }
if (VERO.felci) { const {g, mat} = piatto(VERO.felci); VPEZZI.felci = isole(g, 300).map(f => aTerra(f, {h: 1, aff: .02})); VPEZZI.felce = sway(mat, .2); mat.side = THREE.DoubleSide; }
if (Q.has('debug')) console.log('vero', Object.keys(VERO).filter(k => VERO[k]), 'rocce', VPEZZI.rocce?.map(r => { r.computeBoundingBox(); const d = r.boundingBox.getSize(V3()); return [r.index.count / 3, d.x.toFixed(2), d.y.toFixed(2), d.z.toFixed(2)].join(' '); }), 'felci', VPEZZI.felci?.length);

/* ---------- motore ---------- */
const sec = document.getElementById('film'), cv = document.getElementById('fc');
const renderer = new THREE.WebGLRenderer({canvas: cv, antialias: false, powerPreference: 'high-performance'});
let DPR = Math.min(devicePixelRatio || 1, LOW ? 1.5 : 1.75);
renderer.setPixelRatio(DPR);
renderer.shadowMap.enabled = !LOW; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const FOG = col('#2a3a52');
scene.fog = new THREE.FogExp2(FOG, .02);
const camera = new THREE.PerspectiveCamera(50, 1, .05, 600);

/* luci: la luna fredda con le ombre, il cielo che riempie, le candele calde */
const hemi = new THREE.HemisphereLight(col('#7d93c4'), col('#2a2a22'), 1.1); scene.add(hemi);
const MOON = V3(-.35, .47, -1).normalize(), SUN = V3(.12, .03, -1).normalize();
const moonL = new THREE.DirectionalLight(col('#b9c8ff'), 1.7); scene.add(moonL); scene.add(moonL.target);
if (!LOW) { moonL.castShadow = true; moonL.shadow.mapSize.set(2048, 2048); const c = moonL.shadow.camera; c.left = c.bottom = -16; c.right = c.top = 16; c.near = 1; c.far = 140; moonL.shadow.bias = -.0006; moonL.shadow.normalBias = .03; moonL.shadow.radius = 4; }
const warm = new THREE.DirectionalLight(col('#ffb37a'), .45); warm.position.copy(SUN).multiplyScalar(80); scene.add(warm);

/* il cielo: notte blu in alto, una fascia rosa, il tramonto oro in fondo al sentiero, nuvole dipinte, stelle */
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: {t: {value: 0}, sun: {value: SUN}, moon: {value: MOON}},
  vertexShader: `varying vec3 vD;void main(){vD=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}`,
  fragmentShader: `uniform float t;uniform vec3 sun,moon;varying vec3 vD;
    float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
    float fb(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*n2(p);p*=2.03;a*=.5;}return s;}
    void main(){vec3 d=normalize(vD);float y=d.y;float ds=max(dot(d,sun),0.);
      vec3 top=vec3(.012,.025,.07),mid=vec3(.06,.07,.2),rose=vec3(.42,.16,.2),gold=vec3(1.3,.62,.22),hor=vec3(.16,.2,.3);
      vec3 c=mix(hor,mid,smoothstep(-.02,.25,y));c=mix(c,top,smoothstep(.25,.8,y));
      float band=(1.-smoothstep(-.02,.3,y))*pow(ds,1.6);c=mix(c,rose,band*.75);c+=gold*pow(ds,10.)*(1.-smoothstep(-.03,.16,y))*1.3;
      c+=vec3(.9,.85,.75)*pow(max(dot(d,moon),0.),40.)*.25;
      vec2 cp=d.xz/(y+.18);float cl=smoothstep(.52,.78,fb(cp*1.6+vec2(t*.004,0.)))*smoothstep(.0,.08,y)*(1.-smoothstep(.25,.6,y));
      vec3 cc=mix(vec3(.09,.09,.17),mix(vec3(.75,.33,.3),vec3(1.4,.8,.45),pow(ds,6.)),pow(ds,2.)*.9+.05);
      c=mix(c,cc,cl*.85);
      vec3 p=d*230.;vec3 ip=floor(p);float hs=fract(sin(dot(ip,vec3(12.9898,78.233,37.719)))*43758.5453);
      float s=step(.9968,hs)*smoothstep(.12,.4,y)*smoothstep(.5,.05,length(fract(p)-.5))*(1.-cl);
      c+=vec3(1.,.95,.85)*s*(.8+.6*sin(t*1.7+hs*91.))*1.6;
      gl_FragColor=vec4(c,1.);}`
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), skyMat); sky.renderOrder = -2; scene.add(sky);
const moon = new THREE.Sprite(new THREE.SpriteMaterial({map: moonTex, color: new THREE.Color(2.6, 2.5, 2.3), fog: false, depthWrite: false, transparent: true})); moon.scale.setScalar(70); moon.renderOrder = -1; scene.add(moon);
/* l'ambiente per i riflessi morbidi delle candele: lo stesso cielo */
{ const pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene(); es.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMat)); scene.environment = pm.fromScene(es, .02).texture; scene.environmentIntensity = 1.4; }

/* terreno */
{
  const S = 300, N = LOW ? 170 : 260, g = new THREE.PlaneGeometry(S, S, N, N); g.rotateX(-Math.PI / 2); g.translate(0, 0, -45);
  const p = g.attributes.position, c = new Float32Array(p.count * 3), C = new THREE.Color(), uv = g.attributes.uv, sp = new Float32Array(p.count * 2);
  const G1 = col('#1d3a22'), G2 = col('#33582a'), MO = col('#4d6e2c'), PA = col('#8c6f4a'), PE = col('#5e4a33'), CLR = col('#3f6b31'), MUD = col('#3a2f24'), LEAF = col('#7a4a22');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = terrain(x, z); p.setY(i, y);
    C.copy(G1).lerp(G2, fbm(x * .07, z * .07)); C.lerp(MO, sstep(.6, .75, fbm(x * .23 + 4, z * .23)) * .7);
    C.lerp(LEAF, sstep(.62, .8, fbm(x * .5 + 9, z * .5)) * .55);
    const dc = Math.hypot(x - CL.x, z - CL.z); C.lerp(CLR, (1 - sstep(CL.r * .5, CL.r * 1.2, dc)) * .6);
    const ds = Math.abs(z - sz(x)); C.lerp(MUD, (1 - sstep(1.2, 2.6, ds)) * .9);
    const dp = Math.abs(x - px(z)) + (vnoise(x * .9, z * .9) - .5) * .5, endP = sstep(CL.z - 1, CL.z + 3, z);
    C.lerp(PE, (1 - sstep(1.05, 1.5, dp)) * endP); C.lerp(PA, (1 - sstep(.55, 1.05, dp)) * endP * (.8 + .2 * vnoise(x * 3, z * 3)));
    C.lerp(PA, (1 - sstep(1.2, 3.2, dc)) * .55);
    c[i * 3] = C.r; c[i * 3 + 1] = C.g; c[i * 3 + 2] = C.b;
    /* quanto è terra battuta (sentiero, fango, centro della radura) e quanto è foglie secche: guida le foto del suolo */
    sp[i * 2] = Math.max((1 - sstep(1.2, 2.6, ds)) * .9, (1 - sstep(.9, 1.45, dp)) * endP, (1 - sstep(1.2, 3.2, dc)) * .7);
    sp[i * 2 + 1] = sstep(.5, .72, fbm(x * .5 + 9, z * .5)) * .85; uv.setXY(i, x / 2.2, z / 2.2);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.setAttribute('sp', new THREE.BufferAttribute(sp, 2)); g.computeVertexNormals();
  let mt = veg();
  if (VERO.suolo) {   /* il suolo vero: tre foto di sottobosco mescolate, il colore resta quello disegnato, la foto dà la materia */
    const [tG, tL, tD, nD] = VERO.suolo;
    mt = new THREE.MeshStandardMaterial({vertexColors: true, map: tG, normalMap: nD, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 1, metalness: 0});
    mt.onBeforeCompile = s => {
      s.uniforms.tL = {value: tL}; s.uniforms.tD = {value: tD};
      s.vertexShader = 'attribute vec2 sp;varying vec2 vSp;\n' + s.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvSp=sp;');
      s.fragmentShader = 'uniform sampler2D tL,tD;varying vec2 vSp;\n' + s.fragmentShader.replace('#include <map_fragment>', `
        vec2 uA=vMapUv,uB=vMapUv*.31+vec2(.37,.11);
        vec3 g=texture2D(map,uA).rgb*.6+texture2D(map,uB).rgb*.4,l=texture2D(tL,uA*.9).rgb,d=texture2D(tD,uA*1.2).rgb*.65+texture2D(tD,uB).rgb*.35;
        g/=vec3(.2766,.2401,.1088);l/=vec3(.2732,.1661,.0452);d/=vec3(.1409,.1011,.0556);
        vec3 det=mix(mix(g,l,vSp.y),d,vSp.x);float lu=dot(det,vec3(.3,.59,.11));
        diffuseColor.rgb*=clamp(mix(vec3(lu),det,.45),.12,2.4);`);
    };
  }
  const m = new THREE.Mesh(g, mt); m.receiveShadow = true; scene.add(m);
}

/* il ruscello */
const waterMat = new THREE.ShaderMaterial({
  fog: true, transparent: false,
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {t: {value: 0}, sun: {value: SUN}}]),
  vertexShader: `#include <common>
    #include <fog_pars_vertex>
    varying vec2 vU;varying vec3 vW;void main(){vU=uv;vW=(modelMatrix*vec4(position,1.)).xyz;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
    #include <fog_vertex>
    }`,
  fragmentShader: `#include <common>
    #include <fog_pars_fragment>
    uniform float t;varying vec2 vU;varying vec3 vW;
    void main(){float s=sin(vW.x*1.4-t*1.7+sin(vW.x*.37+vU.y*5.)*1.4+vU.y*2.5);float s2=sin(vW.x*2.3-t*2.4+vU.y*9.+1.7);
      float rip=smoothstep(.8,.98,s)*.6+smoothstep(.9,.99,s2)*.5;
      float edge=smoothstep(.43,.5,abs(vU.y-.5)+.02*sin(vW.x*3.+t*2.));
      vec3 deep=vec3(.015,.035,.06),shal=vec3(.03,.08,.1),foam=vec3(.5,.6,.7);
      vec3 c=mix(deep,shal,smoothstep(.0,.5,abs(vU.y-.5))+.2*sin(vW.x*.4+t*.3));
      vec3 V=normalize(cameraPosition-vW);float fr=pow(1.-max(V.y,0.),4.);
      c+=vec3(.12,.15,.3)*fr*.5;c+=vec3(1.,.7,.45)*rip*.18;c=mix(c,foam*.5,edge*.45);
      gl_FragColor=vec4(c,1.);
      #include <fog_fragment>
    }`
});
{
  const pos = [], uv = [], idx = []; const W = 1.75;
  for (let i = 0, x = -110; x <= 110; x += 1, i++) {
    const z = sz(x), dz = sz(x + .5) - sz(x - .5), n = new THREE.Vector2(-dz, 1).normalize();
    pos.push(x - n.x * W, -.42, z - n.y * W, x + n.x * W, -.42, z + n.y * W); uv.push(x, 0, x, 1);
    if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  const w = new THREE.Mesh(g, waterMat); w.material.side = THREE.DoubleSide; scene.add(w);
}
/* il ponticello */
const SHADOWED = [];
function obj(geo, mat, parent, cast = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast && !LOW; m.receiveShadow = !LOW; if (parent) parent.add(m); return m; }
{
  const deck = Math.max(terrain(XC, ZC + 2.7), terrain(XC, ZC - 2.7)) + .06, wood = lam('#7a5434'), dark = lam('#4f3826');
  const br = new THREE.Group(); br.position.set(XC, deck, ZC); br.rotation.y = Math.atan2(px(ZC - 1) - px(ZC + 1), -2) + Math.PI; scene.add(br);
  for (let k = -7; k <= 7; k++) obj(new THREE.BoxGeometry(1.5 + R(-.06, .06), .07, .27).rotateY(R(-.04, .04)), wood, br).position.set(R(-.03, .03), R(-.01, .01), k * .32);
  for (const s of [-1, 1]) {
    obj(new THREE.CylinderGeometry(.1, .1, 5.2, 10).rotateX(Math.PI / 2), dark, br).position.set(s * .6, -.12, 0);
    for (const k of [-2, 0, 2]) obj(new THREE.CylinderGeometry(.05, .06, .75, 8), dark, br).position.set(s * .74, .33, k);
    obj(new THREE.CylinderGeometry(.045, .045, 4.4, 8).rotateX(Math.PI / 2), wood, br).position.set(s * .74, .68, 0);
  }
}

/* ---------- vegetazione in stile animazione: forme piene e morbide, colori caldi sui bordi ---------- */
function conifer(so) {
  const parts = [paint(new THREE.CylinderGeometry(.13, .24, 2.2, 8).translate(0, 1.1, 0), '#4d3624')];
  const T = [[1.2, 2.2, 1.75], [2.35, 2.0, 1.42], [3.35, 1.85, 1.1], [4.25, 1.75, .78]];
  T.forEach(([y0, h, r], k) => {
    let g = smoothen(lath([[0, h * .12], [r * .55, h * .06], [r, 0], [r * 1.04, h * .07], [r * .8, h * .22], [r * .42, h * .64], [0, h]], 12));
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), y = p.getY(i), a = Math.atan2(x, z), rim = y < h * .25 ? 1 : .35;
      const f = 1 + (.09 * Math.sin(7 * a + so + k) + .1 * (vnoise(a * 1.6 + so * 3 + k * 5, k) - .5)) * rim;
      p.setXYZ(i, x * f, y - (y < h * .2 ? .1 * vnoise(a * 2 + so, k * 3) : 0), z * f);
    }
    g.computeVertexNormals(); g.translate(0, y0, 0);
    parts.push(paint(g, (x, y, z, ny) => col('#123a2a').lerp(col('#2f6a45'), sstep(-.4, .9, ny)).lerp(col('#5a8a4c'), sstep(.6, 1, ny) * .35)));
  });
  return merge(parts);
}
function leafy(c1, c2, so) {
  const parts = [paint(new THREE.CylinderGeometry(.15, .28, 2.8, 8).translate(0, 1.4, 0), '#5a4130')];
  parts.push(paint(new THREE.CylinderGeometry(.06, .11, 1.4, 6).rotateZ(.75).translate(.5, 2.5, 0), '#5a4130'));
  parts.push(paint(new THREE.CylinderGeometry(.05, .1, 1.2, 6).rotateZ(-.7).translate(-.45, 2.6, .1), '#5a4130'));
  const B = [[0, 3.9, 0, 1.4], [1.05, 3.4, .35, 1.05], [-.95, 3.5, -.3, 1.1], [.25, 4.85, -.2, 1.05], [-.35, 3.25, .95, .95], [.55, 3.3, -.95, .9], [-.6, 4.5, .45, .85]];
  B.forEach(([x, y, z, r], k) => { const g = blob(r, .2, so + k * 2.3).translate(x, y, z); parts.push(paint(g, (X, Y, Z, ny) => col(c1).lerp(col(c2), sstep(-.4, .95, ny)))); });
  return merge(parts);
}
function bush(so) {
  const B = [[0, .35, 0, .6], [.55, .28, .15, .46], [-.5, .3, -.1, .5], [.1, .62, -.2, .4]];
  return merge(B.map(([x, y, z, r], k) => paint(blob(r, .2, so + k).translate(x, y, z), (X, Y, Z, ny) => col('#1d4228').lerp(col('#4c7d3a'), sstep(-.3, .9, ny)))));
}
function fern() {
  const gs = [];
  for (let k = 0; k < 7; k++) {
    const s = new THREE.Shape(); s.moveTo(0, 0); for (let i = 1; i <= 8; i++) { const y = i * .07, w = .07 * Math.sin(Math.PI * i / 9); s.lineTo(w, y - .02); s.lineTo(w * .4, y); } s.lineTo(0, .6); for (let i = 8; i >= 1; i--) { const y = i * .07, w = .07 * Math.sin(Math.PI * i / 9); s.lineTo(-w * .4, y); s.lineTo(-w, y - .02); }
    const g = new THREE.ShapeGeometry(s, 1); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, -y * y * .9); }
    g.rotateX(-.55).rotateY(k / 7 * 6.283 + R(-.2, .2)); g.computeVertexNormals();
    gs.push(paint(g, (x, y) => col('#24532c').lerp(col('#6a9a42'), Math.min(1, y / .5))));
  }
  return merge(gs);
}
function rockGeo(so) {
  const g = wobble(smoothen(new THREE.DodecahedronGeometry(.6, 2)), .2, 2.2, so); g.scale(1, .62, .9); g.computeVertexNormals();
  return paint(g, (x, y, z, ny) => col('#5a5f5e').lerp(col('#4f7a33'), sstep(.45, .75, ny)));
}
function tuft() {
  const gs = [];
  for (let k = 0; k < 7; k++) { const h = R(.2, .45), g = new THREE.ConeGeometry(.026, h, 3).translate(0, h / 2, 0).rotateZ(R(-.4, .4)).rotateX(R(-.35, .35)).rotateY(k * 1.3).translate(R(-.06, .06), 0, R(-.06, .06)); gs.push(paint(g, (x, y) => col('#1b3a20').lerp(col('#7aa24e'), Math.min(1, y / .42)))); }
  return merge(gs);
}
function mushroomGeo(cap, spots) {
  const st = paint(new THREE.CylinderGeometry(.028, .04, .14, 10).translate(0, .07, 0), '#efe3c8');
  const cp = new THREE.SphereGeometry(.085, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2); cp.scale(1, .72, 1); cp.translate(0, .13, 0);
  const un = new THREE.CircleGeometry(.084, 20).rotateX(Math.PI / 2).translate(0, .131, 0);
  return merge([st, paint(cp, (x, y, z) => spots && vnoise(x * 60 + 3, z * 60 + y * 40) > .72 ? col('#fff4e0') : col(cap)), paint(un, '#d8c3a0')]);
}
function flowerGeo() {
  const gs = [paint(new THREE.CylinderGeometry(.006, .008, .26, 4).translate(0, .13, 0), '#2c4a2a')];
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; gs.push(paint(new THREE.SphereGeometry(.03, 6, 4).scale(1, .3, .55).translate(.034, 0, 0).rotateY(a).translate(0, .265, 0), '#ffffff')); }
  gs.push(paint(new THREE.SphereGeometry(.02, 6, 4).scale(1, .6, 1).translate(0, .272, 0), '#f0c64a'));
  return merge(gs);
}

/* ---------- spargimento ---------- */
const STOP_POS = [];
function libero(x, z, dPath, dStop = 3.2) {
  if (Math.abs(x - px(z)) < dPath + (vnoise(x * .4, z * .4) - .5) * 1.2) return false;
  if (Math.abs(z - sz(x)) < 2.4) return false;
  if (Math.hypot(x - CL.x, z - CL.z) < CL.r + 1) return false;
  for (const s of STOP_POS) if (Math.hypot(x - s.x, z - s.z) < dStop) return false;
  return true;
}
function inst(geo, mat, n, cast = false) { const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; m.castShadow = cast && !LOW; m.receiveShadow = !LOW; return {m, i: 0}; }
const D = new THREE.Object3D();
function place(set, x, z, s, ry = R(0, 6.28), sy = 1, tint = null, y = null, tilt = .06) {
  if (set.i >= set.m.count) return;
  D.position.set(x, y ?? terrain(x, z) - .05 * s, z); D.rotation.set(R(-tilt, tilt), ry, R(-tilt, tilt)); D.scale.set(s, s * sy, s); D.updateMatrix();
  set.m.setMatrixAt(set.i, D.matrix); if (tint) set.m.setColorAt(set.i, tint); set.i++;
}
function done(set) { set.m.count = set.i; set.m.instanceMatrix.needsUpdate = true; if (set.m.instanceColor) set.m.instanceColor.needsUpdate = true; scene.add(set.m); }
const tint = l => new THREE.Color(l, l, l);

/* ---------- le candele vere ---------- */
const P = 2.2;
const FLAMES = [], LIGHTS = [], BEACONS = [];
const flameMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, uniforms: {t: {value: 0}, k: {value: 5}},
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `uniform float t,k;varying vec2 vUv;
    void main(){float y=vUv.y;float x=vUv.x-.5;x+=sin(t*6.1+y*4.)*.03*y*y+sin(t*11.3+1.7)*.012*y;
      float hgt=.92+.06*sin(t*8.7)+.04*sin(t*17.3);float yy=y/hgt;
      float w=.30*pow(clamp(yy*4.,0.,1.),.5)*pow(clamp(1.-yy,0.,1.),1.15);
      float shape=smoothstep(w,w*.25,abs(x))*step(yy,1.);
      float core=smoothstep(w*.55,0.,abs(x))*smoothstep(.04,.16,yy)*smoothstep(.62,.25,yy);
      vec3 c=mix(vec3(1.,.42,.06),vec3(1.,.78,.38),smoothstep(.0,.7,shape))+core*vec3(.9,.85,.7);
      float blue=smoothstep(.12,.0,yy)*smoothstep(w*1.3,0.,abs(x));c=mix(c,vec3(.25,.4,1.),blue*.75);
      float a=shape*(1.-.55*blue);gl_FragColor=vec4(c*a*k,a);}`});
const haloMat = new THREE.SpriteMaterial({map: glowTex, color: new THREE.Color(1.6, 1.2, .8), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .2});
const beaconMat = new THREE.SpriteMaterial({map: glowTex, color: new THREE.Color(1.5, 1, .55), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false});
const woodMat = new THREE.MeshStandardMaterial({color: col('#4a3322'), roughness: .85}), burnt = new THREE.MeshStandardMaterial({color: col('#120c08'), roughness: 1});
/* fiamma con stoppino di legno a croce: s è la scala dello stoppino nelle coordinate del vaso */
function fiamma(parent, x, y, z, s) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  const w1 = new THREE.Mesh(new THREE.BoxGeometry(.055 * s, .06 * s, .007 * s), woodMat), w2 = w1.clone(); w2.rotation.y = Math.PI / 2;
  const t1 = new THREE.Mesh(new THREE.BoxGeometry(.056 * s, .012 * s, .0072 * s), burnt); t1.position.y = .03 * s; const t2 = t1.clone(); t2.rotation.y = Math.PI / 2;
  g.add(w1, w2, t1, t2);
  const f = new THREE.Mesh(new THREE.PlaneGeometry(.13 * s, .2 * s), flameMat); f.position.y = .13 * s; g.add(f);
  const h = new THREE.Sprite(haloMat); h.scale.setScalar(.7 * s); h.position.y = .11 * s; g.add(h);
  FLAMES.push(f); return g;
}

/* I prodotti come in uno scatto di prodotto: materiali veri (cemento con i pori, teak, lino, cera), una luce chiave calda
   e un controluce agganciati alla camera, i riflessi di uno studio, il blu della notte smorzato solo su di loro.
   La cera si accende vicino agli stoppini; l'Ovale ha la base ocra con il bordo strappato. */
const FLK = {value: 1};
const STUDIO = (() => {
  const pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene();
  es.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({side: THREE.BackSide,
    vertexShader: 'varying vec3 vD;void main(){vD=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec3 vD;void main(){vec3 d=normalize(vD);gl_FragColor=vec4(mix(vec3(.05,.04,.035),vec3(.3,.26,.22),smoothstep(-.3,.6,d.y)),1.);}'})));
  const pan = (w, h, x, y, z, c) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(c, c * .92, c * .82), side: THREE.DoubleSide})); m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m); };
  pan(5, 4, -6, 5, 5, 3); pan(2, 7, 7, 2, -3, 1.3); pan(9, 2, 0, 8, 0, .9);
  const t = pm.fromScene(es, .04).texture; pm.dispose(); return t;
})();
const V2 = (x, y) => new THREE.Vector2(x, y);
function mprod(o = {}, {key = 1, wick = null, glow = null, banda = null, phys = false, pori = 0, sporco = false} = {}) {
  const m = new (phys ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial)({envMap: STUDIO, envMapIntensity: .6, ...o});
  m.onBeforeCompile = s => {
    s.uniforms.uK = {value: key}; s.uniforms.uF = FLK;
    s.vertexShader = 'varying vec3 vPL;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPL=position;');
    let f = 'uniform float uK,uF;varying vec3 vPL;\n' + s.fragmentShader;
    if (wick) {
      s.uniforms.uW = {value: wick}; s.uniforms.uG = {value: glow}; f = `uniform vec3 uW[${wick.length}];uniform vec4 uG;\n` + f;
      f = f.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {float gs=0.;for(int i=0;i<${wick.length};i++){vec3 d=vPL-uW[i];gs+=exp(-dot(d,d)/(uG.w*uG.w));}totalEmissiveRadiance+=uG.rgb*gs*uF;}`);
    }
    if (pori) {   /* pori a spillo del cemento colato, macchie di impasto, ruvidità che cambia; sporco di terra alla base */
      f = `float hP(vec3 c){return fract(sin(dot(c,vec3(12.9898,78.233,37.719)))*43758.5453);}
        float vnP(vec3 p){vec3 i=floor(p),u=fract(p);u=u*u*(3.-2.*u);return mix(mix(mix(hP(i),hP(i+vec3(1,0,0)),u.x),mix(hP(i+vec3(0,1,0)),hP(i+vec3(1,1,0)),u.x),u.y),mix(mix(hP(i+vec3(0,0,1)),hP(i+vec3(1,0,1)),u.x),mix(hP(i+vec3(0,1,1)),hP(i+vec3(1,1,1)),u.x),u.y),u.z);}
        float poro(vec3 p,float k,float q){vec3 c=floor(p*k),u=fract(p*k)-.5;return step(q,hP(c))*smoothstep(.45,.1,length(u));}
` + f;
      f = f.replace('#include <map_fragment>', `#include <map_fragment>
        {float pp=max(poro(vPL,800.,.93),max(poro(vPL+.37,1900.,.86)*.75,poro(vPL+.71,3600.,.8)*.45));
         diffuseColor.rgb*=(1.-${(.6 * pori).toFixed(3)}*pp)*(.95+.1*vnP(vPL*70.));
         ${sporco ? 'diffuseColor.rgb*=mix(vec3(.6,.55,.48),vec3(1.),smoothstep(.0,.011+.006*vnP(vPL*260.),vPL.y));' : ''}}`);
      f = f.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor*(.86+.28*vnP(vPL*150.)),.05,1.);');
    }
    if (banda) {
      s.uniforms.uB = {value: banda.y}; s.uniforms.uBc = {value: banda.c}; f = 'uniform float uB;uniform vec3 uBc;\n' + f;
      f = f.replace('#include <map_fragment>', `#include <map_fragment>
        {float n=texture2D(map,vMapUv*.045+.31).r*.6+texture2D(map,vMapUv*.13+.7).r*.4;float k=smoothstep(-.001,.001,vPL.y-uB-(n-.78)*.12);
         diffuseColor.rgb=mix(uBc*sampledDiffuseColor.rgb,diffuseColor.rgb,k);}`);
    }
    f = f.replace('#include <lights_fragment_end>', `
      irradiance=mix(irradiance,vec3(dot(irradiance,vec3(.3,.45,.25)))*vec3(1.,.9,.78),.75);
      reflectedLight.directDiffuse=mix(reflectedLight.directDiffuse,vec3(dot(reflectedLight.directDiffuse,vec3(.3,.45,.25)))*vec3(1.,.92,.82),.7)*.8;
      reflectedLight.directSpecular=mix(reflectedLight.directSpecular,vec3(dot(reflectedLight.directSpecular,vec3(.3,.45,.25))),.7)*.8;
      {IncidentLight kl;kl.visible=true;
       kl.direction=normalize(vec3(-.55,.62,.56));kl.color=vec3(1.,.88,.74)*2.2*uK;RE_Direct(kl,geometryPosition,geometryNormal,geometryViewDir,geometryClearcoatNormal,material,reflectedLight);
       kl.direction=normalize(vec3(.8,.3,-.5));kl.color=vec3(.9,.87,.84)*1.1*uK;RE_Direct(kl,geometryPosition,geometryNormal,geometryViewDir,geometryClearcoatNormal,material,reflectedLight);}
      #include <lights_fragment_end>`);
    s.fragmentShader = f;
  };
  m.customProgramCacheKey = () => 'prod' + (wick ? wick.length : 0) + (banda ? 'b' : '') + (pori ? 'p' + pori + (sporco ? 's' : '') : '');
  return m;
}
const cemento = (c, o = {}, x = {}) => mprod({color: col(c).multiplyScalar(1 / .78), map: TEX.cemento_colore, normalMap: TEX.cemento_rilievo, normalScale: V2(.7, .7), roughness: .9, ...o}, {pori: 1, ...x});
const lino = (c, o = {}) => mprod({color: col(c).multiplyScalar(1 / .86), map: TEX.lino_colore, normalMap: TEX.lino_rilievo, normalScale: V2(.6, .6), roughness: .88, ...o});
const cera = (c, wick, r, k = 1, o = {}) => mprod({color: col(c), roughness: .5, sheen: .4, sheenRoughness: .5, sheenColor: col('#fff3e0'), ...o}, {phys: true, wick: wick.map(w => V3(...w)), glow: new THREE.Vector4(1 * k, .5 * k, .2 * k, r)});
const carta = () => mprod({map: TEX.etichetta_quadra, roughness: .82, color: new THREE.Color(.94, .94, .94)});

/* un solido a sezione: contorno chiuso sez(a) di raggio ~1, righe [scala, y] dal basso, '|' = spigolo vivo; uv in superficie / tile */
function loft(sez, righe, {n = 128, tile = .06, a0 = 0, a1 = Math.PI * 2, unit = false} = {}) {
  const O = [...Array(n + 1)].map((_, i) => sez(a0 + (a1 - a0) * i / n)), L = [0];
  for (let i = 1; i <= n; i++) L.push(L[i - 1] + Math.hypot(O[i][0] - O[i - 1][0], O[i][1] - O[i - 1][1]));
  const R = [], brk = new Set(); righe.forEach(r => { if (r === '|') brk.add(R.length); else R.push(r); });
  const pos = [], uv = [], idx = []; let v = 0;
  R.forEach(([s, y], j) => {
    if (j) v += Math.hypot(s - R[j - 1][0], y - R[j - 1][1]);
    for (let i = 0; i <= n; i++) { pos.push(O[i][0] * s, y, O[i][1] * s); uv.push(unit ? L[i] / L[n] : L[i] * s / tile, unit ? j / (R.length - 1) : v / tile); }
  });
  for (let j = 0; j < R.length - 1; j++) { if (brk.has(j + 1)) continue; for (let i = 0; i < n; i++) { const a = j * (n + 1) + i, b = a + n + 1; idx.push(a, a + 1, b, b + 1, b, a + 1); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const nn = g.attributes.normal, U = g.attributes.uv;
  if (a1 - a0 > 6.28) for (let j = 0; j < R.length; j++) { const a = j * (n + 1), b = a + n, t = V3(nn.getX(a) + nn.getX(b), nn.getY(a) + nn.getY(b), nn.getZ(a) + nn.getZ(b)).normalize(); nn.setXYZ(a, t.x, t.y, t.z); nn.setXYZ(b, t.x, t.y, t.z); }
  if (!unit) for (let i = 0; i < nn.count; i++) if (Math.abs(nn.getY(i)) > .7) U.setXY(i, pos[i * 3] / tile, pos[i * 3 + 2] / tile);   // fondi e coperchi: grana piana, non a cerchi
  return g;
}
const CERCHIO = a => [Math.sin(a), Math.cos(a)];
const SUPER = (p, sx = 1) => a => { const s = Math.sin(a), c = Math.cos(a); return [sx * Math.sign(s) * Math.abs(s) ** (2 / p), Math.sign(c) * Math.abs(c) ** (2 / p)]; };
/* rettangolo smussato (mezza larghezza sx, mezza profondità 1, raggio c): punti a passo costante lungo il bordo, partendo dal centro davanti */
const RETT = (c, sx = 1) => { const hx = sx - c, hz = 1 - c, segs = [[hx, 0], [Math.PI / 2 * c, 1], [2 * hz, 0], [Math.PI / 2 * c, 1], [2 * hx, 0], [Math.PI / 2 * c, 1], [2 * hz, 0], [Math.PI / 2 * c, 1], [hx, 0]], tot = segs.reduce((q, x) => q + x[0], 0);
  return a => { let d = (a / (Math.PI * 2)) % 1 * tot; const P = [[0, 1, 1, 0], [hx, hz, 0, -1], [sx, hz, 0, -1], [hx, -hz, 0, -1], [hx, -1, -1, 0], [-hx, -hz, 0, -1], [-sx, -hz, 0, 1], [-hx, hz, 0, 1], [-hx, 1, 1, 0]];
    for (let k = 0; k < 9; k++) { const [L, arc] = segs[k]; if (d <= L || k === 8) { const t = Math.min(d, L);
      if (!arc) { const st = [[0, 1], [sx, hz], [hx, -1], [-sx, -hz], [-hx, 1]][[0, 2, 4, 6, 8].indexOf(k)], dir = [[1, 0], [0, -1], [-1, 0], [0, 1], [1, 0]][[0, 2, 4, 6, 8].indexOf(k)]; return [st[0] + dir[0] * t, st[1] + dir[1] * t]; }
      const cc = [[hx, hz], [hx, -hz], [-hx, -hz], [-hx, hz]][[1, 3, 5, 7].indexOf(k)], a0 = [Math.PI / 2, 0, -Math.PI / 2, Math.PI][[1, 3, 5, 7].indexOf(k)], th = a0 - t / c;
      return [cc[0] + c * Math.cos(th), cc[1] + c * Math.sin(th)]; }
      d -= L; } }; };
const ONDE = (n, A) => a => { const f = 1 + A * (Math.sqrt(Math.abs(Math.sin(n * a / 2))) - .65); return [Math.sin(a) * f, Math.cos(a) * f]; };
/* il profilo di un vaso: parete da r0 a r1, bordo arrotondato, spessore th, poi giù dentro fino alla cera */
function righeVaso(r0, r1, h, th, b = .0025, giu = .6) {
  const r = y => r0 + (r1 - r0) * y / h, o = [[r0 - .0006, 0], [r0, .0015], [r(h * .5), h * .5], [r(h - 3 * b), h - 3 * b]];
  for (let k = 0; k <= 4; k++) { const t = k / 4 * Math.PI / 2; o.push([r1 - b + b * Math.cos(t), h - b + b * Math.sin(t)]); }
  for (let k = 0; k <= 4; k++) { const t = Math.PI / 2 + k / 4 * Math.PI / 2; o.push([r1 - th + b + b * Math.cos(t), h - b + b * Math.sin(t)]); }
  o.push([r1 - th, h - 3 * b], [r1 - th, h * giu]); return o;
}
/* un coperchio pieno con lo smusso e il tappo che entra nel vaso; asse y, centrato */
function righeCoperchio(rl, t, rp = 0, pd = 0, b = .002) {
  const o = []; if (rp) o.push([.0001, -t / 2 - pd], [rp, -t / 2 - pd], [rp, -t / 2], '|', [rp, -t / 2]); else o.push([.0001, -t / 2]);
  for (let k = 0; k <= 3; k++) { const a = -Math.PI / 2 + k / 3 * Math.PI / 2; o.push([rl - b + b * Math.cos(a), -t / 2 + b + b * Math.sin(a)]); }
  for (let k = 0; k <= 3; k++) { const a = k / 3 * Math.PI / 2; o.push([rl - b + b * Math.cos(a), t / 2 - b + b * Math.sin(a)]); }
  o.push([.0001, t / 2]); return o;
}
/* la cera: piana al bordo, la pozza fusa che scende verso lo stoppino */
const righeCera = (s, y) => [[s, y], [s * .99, y - .0004], [s * .7, y - .0011], [s * .35, y - .002], [.0001, y - .0024]];
/* l'etichetta di carta incollata sulla parete, centrata davanti (+z), larga w */
function etichetta(parent, sez, sOf, y0, y1, w, a = 0) {
  let lo = 0, hi = Math.PI / 2; for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (sez(m)[0] * sOf((y0 + y1) / 2) < w / 2) lo = m; else hi = m; }
  const g = loft(sez, [[sOf(y0) + .0007, y0], [sOf(y1) + .0007, y1]], {a0: -lo, a1: lo, n: 24, unit: true}), m = obj(g, carta(), parent, false); m.rotation.y = a; return m;
}
/* un coperchio appoggiato di taglio contro il vaso, nella direzione ang (0 = +x) */
function appoggia(parent, m, ang, r, D, th, beta = .2) {
  const L = new THREE.Group(); L.rotation.y = ang; parent.add(L);
  const Pv = new THREE.Group(); Pv.position.x = r + D * Math.sin(beta) + th / 2 * Math.cos(beta) + .0015; Pv.rotation.z = beta; L.add(Pv);
  m.rotation.z = -Math.PI / 2; m.position.y = D / 2; Pv.add(m); return m;
}
/* il sigillo di ceralacca con la Y, sopra una faccia (asse y) */
function sigillo(parent, y, r, c, tex) {
  const s = new THREE.Group(); s.position.y = y; parent.add(s);
  obj(loft(ONDE(9, .04), [[r * .97, 0], [r, .0012], [r * .98, .0028], [r * .9, .0034], [.0001, .0036]], {n: 72}), mprod({color: col(c), roughness: .32}, {phys: true}), s, false);
  const top = obj(new THREE.CircleGeometry(r * .93, 48).rotateX(-Math.PI / 2).translate(0, .00375, 0), mprod({map: tex, alphaTest: .5, bumpMap: TEX.sigillo_rilievo, bumpScale: 3, roughness: .3}), s, false);
  return s;
}
/* petali secchi sulla cera */
function petali(parent, y, rr, n, cs) {
  const m = mprod({color: col('#ffffff'), roughness: .7, vertexColors: true}), gs = [];
  for (let k = 0; k < n; k++) { const a = R(0, 6.28), d = Math.sqrt(R(.08, 1)) * rr; gs.push(paint(new THREE.SphereGeometry(.0028, 8, 4).scale(R(.6, 1.3), .14, R(.7, 1.6)).rotateY(R(0, 3)).translate(Math.sin(a) * d, y, Math.cos(a) * d), cs[k % cs.length])); }
  obj(merge(gs), m, parent, false);
}

/* Kora: vaso bianco scanalato, cera bianca con i petali, coperchio di cemento sabbia con il sigillo verde petrolio */
function kora(g) {
  const r = .047, h = .1, th = .006, sez = ONDE(24, .07), wy = h - .009;
  obj(loft(sez, righeVaso(r, r, h, th), {n: 240}), cemento('#ece7dd', {roughness: .86, normalScale: V2(.35, .35)}, {pori: .45, sporco: true}), g);
  obj(loft(CERCHIO, righeCera(r - th + .0003, wy), {n: 96}), cera('#f3efe6', [[0, wy, 0]], .028, 1.3), g, false);
  petali(g, wy - .0004, r - th - .006, 9, ['#c8753e', '#a8402f', '#d9a35a']);
  fiamma(g, 0, wy, 0, .2);
  const D = 2 * r + .002, t = .011, lid = obj(loft(ONDE(26, .025), righeCoperchio(D / 2, t, r - th - .0008, .005), {n: 160}), cemento('#86827a', {roughness: .78, metalness: .08}, {pori: 1.4}));
  sigillo(lid, t / 2, .016, '#163b39', TEX.sigillo_verde);
  appoggia(g, lid, -.75, r * 1.03, D, t, .2);
}
/* Candela .01: cemento salvia appena rastremato, cera turchese, etichetta, il coperchio appoggiato */
function c01(g) {
  const r0 = .056, r1 = .052, h = .098, th = .0065, wy = h - .009;
  obj(loft(CERCHIO, righeVaso(r0, r1, h, th)), cemento('#a6b09b', {}, {pori: 1.2, sporco: true}), g);
  obj(loft(CERCHIO, righeCera(r1 - th + .0003, wy), {n: 96}), cera('#36b3bf', [[0, wy, 0]], .028, 1.1, {roughness: .4}), g, false);
  petali(g, wy - .0004, r1 - th - .008, 4, ['#d9b25a']);
  etichetta(g, CERCHIO, y => r0 + (r1 - r0) * y / h, .022, .088, .07);
  fiamma(g, 0, wy, 0, .19);
  const D = 2 * r1 - .002, t = .013, lid = obj(loft(CERCHIO, righeCoperchio(D / 2, t, r1 - th - .0008, .006)), cemento('#a6b09b'));
  appoggia(g, lid, .85, r1, D, t, .19);
}
/* Candela .02D: tronco di piramide grigio scuro, cera turchese quadrata, blocco di teak come coperchio */
function c02d(g) {
  const b0 = .052, b1 = .045, h = .08, th = .0065, wy = h - .008, sez = RETT(.07);
  obj(loft(sez, righeVaso(b0, b1, h, th), {n: 360}), cemento('#5f6163', {}, {pori: .9, sporco: true}), g);
  obj(loft(sez, righeCera(b1 - th + .0003, wy), {n: 240}), cera('#36b3bf', [[0, wy, 0]], .03, 1.1, {roughness: .4}), g, false);
  /* etichetta sulla faccia davanti, inclinata come la parete */
  const a = Math.atan((b0 - b1) / h), lab = obj(new THREE.PlaneGeometry(.058, .058 * 391 / 407), carta(), g, false);
  lab.position.set(0, .043, b0 + (b1 - b0) * .043 / h + .0009); lab.rotation.x = -a;
  fiamma(g, 0, wy, 0, .19);
  const t = .014, lid = obj(loft(RETT(.06), righeCoperchio(b1 + .001, t, b1 - th - .0008, .005, .0025), {n: 360, tile: .09}), mprod({map: TEX.teak_colore, normalMap: TEX.teak_rilievo, normalScale: V2(.6, .6), roughness: .42, clearcoat: .2, clearcoatRoughness: .55, color: new THREE.Color(.5, .3, .25)}, {phys: true}));
  g.add(lid); lid.position.set(-.111, t / 2 + .005, .05); lid.rotation.y = .15;   // Matteo 6/11: il teak non entra nel fondo del vaso (spigolo a 1 cm dalla parete)
}
/* Trilogy: tre sfere di cera avorio a spirale, cima tagliata piana, la cera si accende sotto la fiamma */
function trilogy(g) {
  const one = (r, x, z, ry) => {
    let s = new THREE.SphereGeometry(r, 160, 80); const p = s.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let X = p.getX(i), Y = p.getY(i), Z = p.getZ(i); const yy = Y / r, a = Math.atan2(X, Z), rib = Math.pow(Math.abs(Math.cos(8 * a + 4.6 * yy)), .45);
      const f = 1 + (.21 * rib - .13) * Math.sqrt(Math.max(0, 1 - yy * yy)); X *= f; Z *= f;
      if (Y > .74 * r) { const k = Math.sqrt(1 - .74 * .74) / Math.max(1e-3, Math.sqrt(1 - Math.min(.999, yy * yy))); X *= Math.min(1, k * .98); Z *= Math.min(1, k * .98); Y = .74 * r; } if (Y < -.86 * r) Y = -.86 * r;
      p.setXYZ(i, X, Y, Z);
    }
    s.computeVertexNormals(); s.translate(0, .86 * r, 0);
    const m = obj(s, cera('#c47f78', [[0, 1.6 * r, 0]], r * .45, .45, {roughness: .62, sheen: .2}), g); m.position.set(x, 0, z); m.rotation.y = ry;
    fiamma(g, x, 1.6 * r, z, .17);
  };
  one(.05, -.06, .02, 0); one(.042, .055, -.045, 1); one(.037, .07, .07, 2);
}
/* fiori di cera: rose a petali a spirale e margherite scolpite */
const ceraOmbra = (lo, hi) => (x, y, z) => col('#dcb984').lerp(col('#fff2d4'), sstep(lo, hi, y));
/* un petalo di cera grosso: un ovale spesso, largo w e alto h, piegato a coppa verso il centro (c), punta che si apre in fuori (fl) */
function petalo(w, h, c, fl) {
  const g = new THREE.SphereGeometry(1, 18, 12).deleteAttribute('uv').scale(w / 2, h / 2, w * .09).translate(0, h / 2, 0), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), u = x / (w / 2), v = y / h; p.setXYZ(i, x * (.75 + .3 * v), y, p.getZ(i) - c * u * u * w * .5 + fl * v * v * h); }
  g.computeVertexNormals(); return g;
}
function rosa(rr) {   // strati di petali a spirale: dentro chiusi sul bocciolo, fuori aperti e piegati in fuori
  const gs = [new THREE.SphereGeometry(rr * .16, 16, 12).scale(1, 1.4, 1).translate(0, rr * .42, 0).deleteAttribute('uv'), new THREE.SphereGeometry(rr * .46, 20, 12).scale(1, .75, 1).translate(0, rr * .2, 0).deleteAttribute('uv')];
  [[3, .08, .5, .62, .7, 0, .02, .16], [5, .22, .66, .64, .55, .06, .2, .1], [6, .38, .8, .62, .45, .12, .42, .03], [7, .53, .9, .58, .36, .18, .66, -.03]].forEach(([n, ri, w, h, c, fl, tl, y0], l) => {
    for (let k = 0; k < n; k++) gs.push(petalo(w * rr, h * rr, c, fl).rotateX(tl).translate(0, y0 * rr, ri * rr).rotateY(k / n * 6.283 + l * .7));
  });
  return paint(merge(gs), ceraOmbra(-rr * .2, rr * .6));
}
function margherita(rr) {   // petali grossi e tondi di cera, alzati a coppa, bottone a cupola
  const gs = [new THREE.SphereGeometry(rr * .26, 24, 12).scale(1, .62, 1).translate(0, rr * .14, 0)];
  for (let l = 0; l < 2; l++) for (let k = 0; k < 12; k++) gs.push(new THREE.SphereGeometry(rr * (.5 - l * .1), 22, 14).scale(.58, .42, 1).translate(0, l * rr * .09, rr * (.56 - l * .16)).rotateX(-.48 - l * .45).rotateY((k + l * .5) / 12 * 6.283));
  return paint(merge(gs), (x, y, z) => { const d = Math.hypot(x, z) / rr; return col('#c4a77a').lerp(col('#fffaf0'), Math.min(1, sstep(-.04, .16, y / rr) * .6 + sstep(.2, .8, d) * .5)); });
}
/* Fioritura Eterna: scatola tonda di cartone kraft, nastro giallo, organza, rose e margherite di cera, gypsophila secca */
function fioritura(g) {
  const R0 = .085, H = .08, kraft = lino('#b88d5d', {roughness: .9});
  obj(loft(CERCHIO, [[R0 - .0005, 0], [R0, .002], [R0, H - .002], [R0 - .0015, H], [.0001, H - .002]], {n: 160}), kraft, g);
  const sat = mprod({color: col('#e6b92e'), roughness: .3, sheen: .7, sheenColor: col('#fff1b0')}, {phys: true});
  obj(loft(CERCHIO, [[R0 + .0016, .0012], [R0 + .002, .0035], [R0 + .002, .0125], [R0 + .0016, .0145]], {n: 160}), sat, g, false);
  obj(loft(CERCHIO, [[R0 + .0014, H - .0075], [R0 + .0017, H - .006], [R0 + .0017, H - .0022], [R0 + .0012, H - .001]], {n: 160}), sat, g, false);
  etichetta(g, CERCHIO, () => R0, .022, .062, .042, .12);
  /* l'organza: tre strati di volant con le pieghe che salgono attorno ai fiori, e un nodo davanti a destra */
  const org = mprod({color: col('#fffaf2'), roughness: .3, sheen: .7, sheenColor: col('#ffffff'), transparent: true, opacity: .2, side: THREE.DoubleSide, depthWrite: false}, {phys: true});
  for (let L = 0; L < 3; L++) { const n = 480, rows = 10, pos = [], idx = [], q = L * 1.7;
    for (let j = 0; j < rows; j++) { const t = j / (rows - 1); for (let i = 0; i <= n; i++) { const a = i / n * 6.283, pl = Math.sin((9 + 2 * L) * a + q) + .5 * Math.sin((23 + L) * a + 2 * q),
      r = (R0 - .003 + t * (.014 + .006 * L)) * (1 + .07 * pl * t + .025 * Math.sin(3 * a + q) * t), y = H - .008 + t * (.026 + .006 * L) + .009 * Math.sin((4 + L) * a + q) * t * t; pos.push(Math.sin(a) * r, y, Math.cos(a) * r); } }
    for (let j = 0; j < rows - 1; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i, b = a + n + 1; idx.push(a, a + 1, b, b + 1, b, a + 1); }
    const og = new THREE.BufferGeometry(); og.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); og.setIndex(idx); og.computeVertexNormals(); obj(og, org, g, false); }
  { const ka = .75, F = fiocco(g, V3(Math.sin(ka) * (R0 + .007), H - .002, Math.cos(ka) * (R0 + .007)), ka, mprod({color: col('#fffaf2'), roughness: .3, sheen: .7, sheenColor: col('#ffffff'), transparent: true, opacity: .42, side: THREE.DoubleSide, depthWrite: false}, {phys: true}), 1.15, .02);
    for (const sg of [-1, 1]) { const tp = []; for (let k = 0; k <= 10; k++) { const t = k / 10; tp.push(V3(sg * (.004 + .008 * t), -.022 * t, .001 + .003 * Math.sin(t * 5))); } obj(nastro(tp, .016, () => V3(1, 0, 0)), F.children[0].material, F, false); } }
  const fm = mprod({color: col('#f7ead0'), vertexColors: true, roughness: .55, sheen: .35, sheenRoughness: .6, sheenColor: col('#fff3dc'), envMapIntensity: .35, side: THREE.DoubleSide}, {phys: true}), RO = rosa(.019), MA = margherita(.021);
  const cup = d => H + .002 + .032 * (1 - d * d / (R0 * R0));
  /* il letto di carta velina avorio sotto i fiori, così non restano sospesi */
  obj(loft(CERCHIO, [...Array(9)].map((_, k) => { const d = (R0 - .002) * (1 - k / 8) + .0001; return [d, cup(d) - .013 - .004 * (1 - k / 8)]; }), {n: 96}), lino('#efe3c9', {roughness: .95}), g, false);
  const pos = [[0, 0, 1]]; for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283 + .3, b = a + .52; pos.push([Math.sin(a) * .042, Math.cos(a) * .042, k % 2], [Math.sin(b) * .066, Math.cos(b) * .066, (k + 1) % 2]); }
  /* Matteo 6/11: qualche fiore colorato, come le rose rosa antico del packshot */
  const fmC = c => mprod({color: col(c), vertexColors: true, roughness: .55, sheen: .35, sheenRoughness: .6, sheenColor: col(c).lerp(col('#ffffff'), .4), envMapIntensity: .35, side: THREE.DoubleSide}, {phys: true}), tinte = {2: fmC('#e2a2a0'), 5: fmC('#f2c0a2'), 9: fmC('#d99595'), 12: fmC('#e8b3ae')};
  pos.forEach(([x, z, t], i) => { const d = Math.hypot(x, z), m = obj(t ? MA : RO, tinte[i] || fm, g); m.position.set(x, cup(d) - .009, z); m.lookAt(x * 1.4, cup(d) + .14, z * 1.4); m.rotateX(Math.PI / 2); m.rotateY(R(0, 6)); });
  /* gypsophila secca: rametti con il gambo, lunghi diversi, che si aprono a ombrella di fiorellini dorati */
  const gy = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.00085, 1), mprod({color: col('#d9b36c'), roughness: .9, emissive: col('#ffcf80'), emissiveIntensity: .05}), 2600), ste = []; let ni = 0;
  const asta = (a, b) => { const v = b.clone().sub(a), q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), v.clone().normalize()); return new THREE.CylinderGeometry(.00028, .00035, v.length(), 4, 1, true).translate(0, v.length() / 2, 0).applyQuaternion(q).translate(a.x, a.y, a.z); };
  for (let c = 0; c < 30; c++) { const a = c / 30 * 6.283 + R(-.2, .2), d = R(.015, .072), b0 = V3(Math.sin(a) * d, cup(d) - .008, Math.cos(a) * d), len = R(.008, .026);
    const tip = b0.clone().add(V3(Math.sin(a) * len * R(.2, .5), len, Math.cos(a) * len * R(.2, .5))); ste.push(asta(b0, tip));
    const nb = 4 + (c % 4); for (let k = 0; k < nb; k++) { const st = tip.clone().add(V3(R(-.007, .007), R(.001, .006), R(-.007, .007))); ste.push(asta(tip, st));
      for (let m = 0; m < 12 && ni < 2600; m++) { D.position.set(st.x + R(-.003, .003), st.y + R(-.0015, .002), st.z + R(-.003, .003)); D.rotation.set(0, 0, 0); D.scale.setScalar(R(.6, 1.25)); D.updateMatrix(); gy.setMatrixAt(ni++, D.matrix); } } }
  obj(merge(ste), mprod({color: col('#c2a46a'), roughness: .9}), g, false);
  gy.count = ni; gy.castShadow = !LOW; g.add(gy);
}
/* un nastro piatto lungo una fila di punti; w = larghezza, dir(i, p) = verso della larghezza */
function nastro(pts, w, dir) {
  const pos = [], uv = [], idx = [];
  pts.forEach((p, i) => { const d = dir(i, p); pos.push(p.x - d.x * w / 2, p.y - d.y * w / 2, p.z - d.z * w / 2, p.x + d.x * w / 2, p.y + d.y * w / 2, p.z + d.z * w / 2); uv.push(0, i / (pts.length - 1), 1, i / (pts.length - 1)); if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
/* un fiocco a due asole piene, in un gruppo messo in K e girato di rotY: le asole lungo x locale, salgono un poco, la fascia è larga lungo z */
function fiocco(g, K, rotY, mat, s = 1, w = .017) {
  const F = new THREE.Group(); F.position.copy(K); F.rotation.y = rotY; g.add(F);
  for (const sg of [-1, 1]) {
    const dv = V3(sg * Math.cos(.38), Math.sin(.38), 0), pts = [];
    for (let k = 0; k <= 32; k++) { const t = k / 32 * Math.PI * 2; pts.push(V3(0, 0, 0).addScaledVector(dv, .028 * s * (1 - Math.cos(t)) * .5 * (1 + .22 * Math.sin(t))).add(V3(0, .013 * s * Math.sin(t) * (t < Math.PI ? 1 : .45), 0))); }
    obj(nastro(pts, w * s, i => V3(0, 0, 1).applyAxisAngle(dv, .18 * sg * Math.sin(i / 32 * Math.PI * 2))), mat, F, false);
  }
  obj(new THREE.SphereGeometry(.0072 * s, 20, 12).scale(1, .8, 1.25), mat, F, false);
  return F;
}
/* Scrigno Fiorito: scatola di cartoncino avorio telato, organza bordeaux con il fiocco, sigillo rosso con la Y, il bigliettino */
function scrigno(g) {
  const W = .16, Dd = .115, H = .07, hl = .026, ov = .0022, box = lino('#ede4d2');
  const sez = RETT(.03, W / Dd), s0 = Dd / 2, s1 = s0 + ov;
  obj(loft(sez, [[s0 - .0005, 0], [s0, .0015], [s0, H - hl + .001]], {n: 400}), box, g);
  obj(loft(sez, [[s1 - .0005, H - hl], [s1, H - hl + .0012], [s1, H - .0018], [s1 - .0006, H - .0003], [s1 - .0018, H], [.0001, H]], {n: 400}), box, g);
  const rib = mprod({color: col('#64101f'), roughness: .55, envMapIntensity: .15, specularIntensity: .35, sheen: .45, sheenRoughness: .5, sheenColor: col('#b8324a'), side: THREE.DoubleSide}, {phys: true});
  const kx = -.025, kz = .012, e = .0007, X = s1 * W / Dd + e, Z = s1 + e, yl = H - hl;
  /* due fasce che girano attorno alla scatola e si incrociano sul nodo */
  const fx = [[-X, .0005], [-X, H - .0015], [-X + .0015, H + e]].map(([x, y]) => V3(x, y, kz));
  obj(nastro([...fx, ...fx.slice().reverse().map(p => V3(-p.x, p.y, kz))], .02, () => V3(0, 0, 1)), rib, g, false);
  const fz = [[-Z, .0005], [-Z, H - .0015], [-Z + .0015, H + e]].map(([z, y]) => V3(kx, y, z));
  obj(nastro([...fz, ...fz.slice().reverse().map(p => V3(kx, p.y, -p.z))], .02, () => V3(1, 0, 0)), rib, g, false);
  /* il fiocco: due asole piene sul nodo e due code che corrono sul coperchio e scendono dal bordo davanti */
  const K = V3(kx, H + .003, kz);
  fiocco(g, K, .35, rib);
  for (const sg of [-1, 1]) {
    const tv = V3(Math.sin(.42 * sg), 0, Math.cos(.42 * sg)), ts = V3(tv.z, 0, -tv.x), L1 = (Z - kz) / tv.z, tp = [];
    for (let k = 0; k <= 14; k++) { const t = k / 14; tp.push(V3(kx, H + .0011 + .0006 * Math.sin(t * 8 + sg), kz).addScaledVector(tv, L1 * t)); }
    for (let k = 1; k <= 8; k++) { const a = k / 8 * Math.PI / 2, P0 = tp[14]; tp.push(V3(P0.x + tv.x * .0016 * Math.sin(a), H + .0011 - .0016 * (1 - Math.cos(a)), Z + .0016 * Math.sin(a) - .0003)); }
    const P1 = tp[tp.length - 1]; for (let k = 1; k <= 8; k++) tp.push(V3(P1.x + tv.x * .001 * k, P1.y - .028 * k / 8, Z + e + .0004));
    obj(nastro(tp, .015, () => ts), rib, g, false);
  }
  sigillo(g, H + .0002, .0135, '#8e1c22', TEX.sigillo_rosso).position.set(-.064, H + .0002, .038);
  const card = obj(new THREE.PlaneGeometry(.036, .036 * 391 / 407).rotateX(-Math.PI / 2), carta(), g, false); card.position.set(.045, H + .0004, -.028); card.rotation.y = .25;
}
/* Ovale Double .04: stadio di cemento rosa con la base ocra strappata, cera rosa con i petali, due stoppini */
function ovale(g) {
  const r = .056, h = .1, th = .006, sx = 1.62, sez = SUPER(3.2, sx), wy = h - .009;
  obj(loft(sez, righeVaso(r, r * .985, h, th), {n: 240}), cemento('#e2b4a8', {}, {pori: .9, sporco: true, banda: {y: .032, c: col('#c48a3a').multiplyScalar(1 / .78)}}), g);
  obj(loft(sez, righeCera(r * .985 - th + .0003, wy), {n: 160}), cera('#efc6bf', [[-.045, wy, 0], [.045, wy, 0]], .03, 1.1, {roughness: .45}), g, false);
  petali(g, wy - .0005, .04, 14, ['#c9473f', '#e08a4a', '#8a3a5a']);
  etichetta(g, sez, y => r + (r * .985 - r) * y / h, .028, .088, .068);
  fiamma(g, -.045, wy, 0, .17); fiamma(g, .045, wy, 0, .17);
}
function ombra(parent, r, y = .002) { const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({map: shadowTex, transparent: true, depthWrite: false, opacity: .7})); m.position.y = y; parent.add(m); return m; }
function pozza(x, y, z, r, o = .3) { const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({map: glowTex, color: new THREE.Color(1.3, 1, .7), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: o, fog: false})); m.position.set(x, y, z); scene.add(m); }
function luce(x, y, z, k, side) {
  const d = V3(-side * .8, 0, 1).normalize();
  const l = new THREE.PointLight(col('#ffbb78'), .32 * k, 6, 2); l.position.set(x + d.x * .7, y + .35, z + d.z * .7); scene.add(l); LIGHTS.push({l, base: .32 * k, ph: R(0, 9)});
  const b = new THREE.Sprite(beaconMat); b.position.set(x, y, z); b.scale.setScalar(2); scene.add(b); BEACONS.push(b);
}

/* ---------- le cinque tappe ---------- */
const bark = lam('#5a4231'), moss = new THREE.MeshLambertMaterial({color: col('#4f7a36')}), stone = c => new THREE.MeshStandardMaterial({color: col(c), roughness: .95, normalMap: grain, normalScale: new THREE.Vector2(.5, .5)});
/* pietre e ceppi: muschio sopra, pietra ai lati, più scura alla base */
const rocc = c => new THREE.MeshStandardMaterial({vertexColors: true, roughness: .95, normalMap: grain, normalScale: new THREE.Vector2(.6, .6)});
const pietra = (g, c, h) => paint(g, (x, y, z, ny) => col(c).multiplyScalar(.55 + .45 * sstep(0, h, y)).lerp(col('#5d7f34'), sstep(.55, .9, ny) * .85).lerp(col('#7f8a52'), sstep(.6, .9, ny) * vnoise(x * 9, z * 9) * .5));
/* una roccia vera come piedistallo, con la cima piana dove stanno le candele */
function sasso(root, k, w, rc, sy = .7, aff = .25) { const G = aTerra(VPEZZI.rocce[k % VPEZZI.rocce.length], {w, sy, aff}), top = tavola(G, rc); obj(G, VPEZZI.roccia, root); return top; }
function tappa(x, z, build, base) {
  let y = terrain(x, z); for (let a = 0; a < 6.28; a += .8) y = Math.max(y, terrain(x + Math.sin(a) * .45, z + Math.cos(a) * .45));
  STOP_POS.push({x, z});
  const root = new THREE.Group(); root.position.set(x, y, z); scene.add(root);
  const top = base ? base(root) : 0;
  const g = new THREE.Group(); g.position.y = top; g.scale.setScalar(P); root.add(g); build(g); ombra(g, .12, .0015);
  return {root, g, top, x, y, z};
}
const STOPS = [];
STOPS.push(tappa(px(-9) + 1.75, -9, kora, root => {   // GIANNI §25.2: ceppo con corteccia, radici, muschio, scena più ricca
  if (VERO.ceppo) {   /* il ceppo vero, scansionato: radici, corteccia e muschio veri; la Kora sul taglio */
    const {g, mat} = piatto(VERO.ceppo), G = aTerra(g, {w: 1.75, aff: .06}), top = tavola(G, .14);
    obj(G, mat, root); mat.roughness = 1;
    if (VPEZZI.felci) [[-1.05, .2, .6, 0], [.95, -.75, .7, 1], [-.8, -.85, .65, 2]].forEach(([x, z, sc, k]) => { const f = obj(VPEZZI.felci[k % VPEZZI.felci.length], VPEZZI.felce, root, false); f.position.set(x, terrain(root.position.x + x, root.position.z + z) - root.position.y, z); f.scale.setScalar(sc); f.rotation.y = k * 1.9; });
    const rim = new THREE.SpotLight(col('#a9bcff'), 9, 9, .55, 1, 2); rim.position.set(-1.8, 3, -2.6); rim.target.position.set(0, top, 0); root.add(rim, rim.target);
    return top;
  }
  let st = new THREE.CylinderGeometry(.34, .44, .5, 64, 10, true).translate(0, .25, 0); st = smoothen(st);
  { const p = st.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(x, z), r = Math.hypot(x, z);
      const g = Math.pow(Math.abs(Math.sin(a * 11 + vnoise(y * 3, a) * 2.2)), .35), f = 1 - .045 * g + .02 * vnoise(a * 4, y * 6) + .14 * sstep(.18, 0, y) * (.5 + .5 * Math.sin(a * 5 + 1));
      p.setXYZ(i, x * f, y, z * f); } st.computeVertexNormals(); }
  obj(paint(st, (x, y, z) => { const a = Math.atan2(x, z), g = Math.pow(Math.abs(Math.sin(a * 11 + vnoise(y * 3, a) * 2.2)), .35);
    return col('#2c1f16').lerp(col('#7b5a3e'), g * .85).lerp(col('#4f7a2e'), sstep(.12, 0, y) * vnoise(a * 3, 1) * .9); }), rocc(), root);
  obj(new THREE.CircleGeometry(.345, 64).rotateX(-Math.PI / 2).translate(0, .5, 0), new THREE.MeshStandardMaterial({map: ringsTex, roughness: .85, normalMap: grain, normalScale: new THREE.Vector2(.4, .4)}), root, false);
  for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28 + .3, len = R(.5, .8), rt = obj(paint(new THREE.ConeGeometry(.11, len, 10).translate(0, -len / 2, 0), (x, y) => col('#3a291c').lerp(col('#6e5038'), sstep(-len, 0, y))), rocc(), root); rt.position.set(Math.sin(a) * .36, .14, Math.cos(a) * .36); rt.rotation.set(Math.cos(a) * 1.25, 0, -Math.sin(a) * 1.25); }
  const mm = veg(); [[-.24, .5, -.1, .08], [-.17, .5, -.2, .065], [-.06, .5, -.26, .055], [-.28, .49, .04, .05], [.36, .08, -.22, .17], [-.4, .05, .18, .15], [.12, .03, .42, .12]].forEach(([x, y, z, r], k) => obj(paint(blob(r, .3, 30 + k).scale(1.3, r < .1 ? .6 : .35, 1.1).translate(x, y, z), (X, Y, Z, ny) => col('#2f5a22').lerp(col('#8cb04c'), sstep(-.2, 1, ny))), mm, root));
  const fm = fern(); [[-.75, .2, .7], [.7, -.5, 1.1], [-.55, -.6, .9]].forEach(([x, z, sc]) => { const f = obj(fm, veg(.5), root, false); f.position.set(x, terrain(root.position.x + x, root.position.z + z) - root.position.y, z); f.scale.setScalar(sc); });
  /* una luce fredda di contorno da dietro, come la luna che sfiora il ceppo */
  const rim = new THREE.SpotLight(col('#a9bcff'), 9, 9, .55, 1, 2); rim.position.set(-1.8, 3, -2.6); rim.target.position.set(0, .5, 0); root.add(rim, rim.target);
  return .5;
}));
let OWL_AT = null;
STOPS.push(tappa(px(-23) - 1.65, -23, g => {
  const a = new THREE.Group(); a.position.x = .085; g.add(a); c01(a);
  const b = new THREE.Group(); b.position.set(-.1, 0, -.02); b.rotation.y = .3; g.add(b); c02d(b);
}, root => {
  const T = new THREE.Group(); T.position.set(-2.5, 0, -2.1); root.add(T);
  const tex = new THREE.MeshStandardMaterial({color: col('#4a3d33'), roughness: .9, normalMap: grain, normalScale: new THREE.Vector2(.8, .8)});
  obj(wobble(smoothen(new THREE.CylinderGeometry(.62, .95, 10, 20, 8)).translate(0, 4.6, 0), .04, .8, 9), tex, T);
  for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28 + .4, len = R(1.4, 2.2), rt = obj(new THREE.ConeGeometry(.3, len, 10).translate(0, -len / 2, 0), tex, T); rt.position.set(Math.sin(a) * .7, .55, Math.cos(a) * .7); rt.rotation.set(Math.cos(a) * 1.15, 0, -Math.sin(a) * 1.15); }
  /* un ramo basso per il gufo */
  const br = obj(new THREE.CylinderGeometry(.06, .13, 2.2, 8).translate(0, 1.1, 0), tex, T); br.position.set(.5, 2.3, .4); br.rotation.set(.9, .3, -.6);
  OWL_AT = {T, p: V3(1.05, 2.95, 1.25)};
  [[0, 10.5, 0, 3], [2.2, 9.6, .8, 2.3], [-2, 9.8, -.6, 2.4], [.6, 12, -.8, 2.2], [-1, 8.8, 1.8, 2]].forEach(([x, y, z, r], k) => obj(paint(blob(r, .16, 20 + k).translate(x, y, z), (X, Y, Z, ny) => col('#a5601f').lerp(col('#e2a33c'), sstep(-.3, .9, ny))), veg(), T));
  obj(wobble(smoothen(new THREE.CylinderGeometry(.55, .62, .1, 20, 1)).translate(0, -.03, 0), .06, 3, 4), lam('#4a3a29'), root);
  return .02;
}));
{ const xr = XC + 1.55, zr = sz(xr) + 2.35;
  STOPS.push(tappa(xr, zr, trilogy, root => { if (VPEZZI.rocce) return sasso(root, 2, 1.1, .24); obj(pietra(wobble(smoothen(new THREE.CylinderGeometry(.33, .42, .3, 18, 2)).translate(0, .14, 0), .08, 3, 5), '#8a8f86', .3), rocc(), root); obj(blob(.15, .3, 12).scale(1.3, .4, 1).translate(.25, .3, -.2), moss, root); return .3; })); }
STOPS.push(tappa(px(-51) - 1.7, -51, g => {
  const a = new THREE.Group(); a.position.set(-.07, 0, 0); g.add(a); fioritura(a);
  const b = new THREE.Group(); b.position.set(.16, 0, .03); b.rotation.y = -.35; g.add(b); scrigno(b);
}, root => { if (VPEZZI.rocce) return sasso(root, 0, 1.6, .5, .55); obj(pietra(wobble(smoothen(new THREE.CylinderGeometry(.46, .52, .14, 20, 2)).translate(0, .07, 0), .07, 2, 8), '#8d8a7c', .14), rocc(), root); obj(blob(.2, .25, 3).scale(1.4, .3, 1).translate(.3, .14, -.26), moss, root); return .14; }));
STOPS.push(tappa(CL.x, CL.z, ovale, root => {
  if (VPEZZI.rocce) { const top = sasso(root, 4, 1.15, .24, .85, .5); /* GIANNI §35.1: la base terrosa della scansione sotto terra */ for (let k = 0; k < 11; k++) { const a = k / 11 * 6.28, r = 2.2 + R(-.2, .2), x = Math.sin(a) * r, z = Math.cos(a) * r, G = aTerra(VPEZZI.rocce[(k + 3) % VPEZZI.rocce.length], {w: R(.4, .7), sy: R(.6, .9), aff: .2}), m = obj(G, VPEZZI.roccia, root); m.position.set(x, terrain(root.position.x + x, root.position.z + z) - root.position.y, z); m.rotation.y = R(0, 6); } return top; }
  obj(pietra(wobble(smoothen(new THREE.CylinderGeometry(.38, .46, .2, 20, 2)).translate(0, .1, 0), .07, 2, 3), '#8f907f', .2), rocc(), root);
  obj(blob(.18, .25, 6).scale(1.5, .3, 1).translate(-.3, .2, -.16), moss, root);
  const rm = veg(); for (let k = 0; k < 11; k++) { const a = k / 11 * 6.28, r = 2.2 + R(-.2, .2), s = obj(rockGeo(k), rm, root); s.position.set(Math.sin(a) * r, 0, Math.cos(a) * r); s.scale.setScalar(R(.25, .42)); s.rotation.y = R(0, 6); }
  return .2;
}));
STOPS.forEach((s, k) => {
  const fy = s.y + s.top + (k === 3 ? .5 : .19 * P);
  luce(s.x + (k === 3 ? .2 : 0), fy + .1, s.z + (k === 3 ? .3 : .05), k === 3 ? .9 : k === 2 ? 1.25 : 1, Math.sign(s.x - px(s.z)) || 0);
  if (k < 3) pozza(s.x, s.y + .03 + (k === 0 ? s.top - .02 : 0), s.z, k === 0 ? 1.1 : 1.6, k === 0 ? .1 : k === 1 ? .06 : .14);
});

/* tronchi caduti: su quello vicino alla Kora corre lo scoiattolo */
const LOGS = [];
const TRONCO = VERO.tronco ? (() => {
  const {g, mat} = piatto(VERO.tronco); g.computeBoundingBox(); const d = g.boundingBox.getSize(V3());
  if (d.z > d.x) g.rotateY(Math.PI / 2);   // lungo l'asse x, come il vecchio
  const G = aTerra(g, {w: 3.4, aff: .05}), p = G.attributes.position, H = [];
  for (let k = 0; k <= 34; k++) { const x0 = -1.7 + k * .1; let h = 0; for (let i = 0; i < p.count; i++) if (Math.abs(p.getX(i) - x0) < .08 && Math.abs(p.getZ(i)) < .12) h = Math.max(h, p.getY(i)); H.push(h); }
  return {g: G, mat, cima: o => { const f = Math.min(34, Math.max(0, (o + 1.7) * 10)), k = Math.floor(f), e = f - k; return H[k] * (1 - e) + H[Math.min(34, k + 1)] * e; }};
})() : null;
for (const [z, s, r] of [[-13.5, -1, .25], [-29, -1, .2], [-58, 1, .22]]) {
  const x = px(z) + s * 3.0, l = new THREE.Group(), ry = R(.3, .7);
  if (TRONCO) {   /* il tronco vero, scansionato: lo scoiattolo corre sulla sua schiena */
    const t = obj(TRONCO.g, TRONCO.mat, null); l.add(t); l.position.set(x, terrain(x, z) - .04, z); l.rotation.y = ry; scene.add(l);
    LOGS.push({x, z, r, ry, y: l.position.y, h: o => l.position.y + TRONCO.cima(o)}); continue;
  }
  l.position.set(x, terrain(x, z) + r * .8, z); l.rotation.set(0, ry, Math.PI / 2); scene.add(l);
  obj(wobble(smoothen(new THREE.CylinderGeometry(r, r * 1.1, 3.4, 14, 4)), .05, 2, z), bark, l);
  obj(new THREE.CircleGeometry(r * 1.08, 20).rotateX(-Math.PI / 2).translate(0, 1.701, 0), new THREE.MeshStandardMaterial({map: ringsTex, roughness: .9}), l, false);
  obj(blob(r * .9, .3, z).scale(1.6, .6, 1).translate(r * .6, .4, 0), moss, l);
  LOGS.push({x, z, r, ry, y: terrain(x, z) + r * .8});
}

/* ---------- spargimento ---------- */
const K = LOW ? .5 : 1;
{
  const cA = inst(conifer(1), veg(.0016), Math.round(800 * K), true), cB = inst(conifer(5), veg(.0016), Math.round(600 * K), true);
  const lG = inst(leafy('#24502c', '#6a9a46', 2), veg(.004), Math.round(230 * K), true), lA = inst(leafy('#9c4a1c', '#f0b440', 6), veg(.004), Math.round(120 * K), true);
  const bu = inst(bush(3), veg(.03), Math.round(520 * K), true), ro = inst(rockGeo(9), veg(), Math.round(170 * K), true), fe = inst(fern(), veg(.5), Math.round(900 * K));
  const gr = inst(tuft(), veg(1.6), Math.round(6500 * K)), mu = inst(mushroomGeo('#c2422a', true), new THREE.MeshStandardMaterial({vertexColors: true, roughness: .35}), 90), mb = inst(mushroomGeo('#8b5d3c', false), new THREE.MeshStandardMaterial({vertexColors: true, roughness: .45}), 60);
  const glo = inst(mushroomGeo('#6fe9d8', false), new THREE.MeshStandardMaterial({vertexColors: true, roughness: .4, emissive: col('#3fe0c8'), emissiveIntensity: 2.2}), 70);
  const fl = inst(flowerGeo(), veg(.6), Math.round(1300 * K));
  /* rocce e felci vere al posto di quelle disegnate */
  const ROv = VPEZZI.rocce ? VPEZZI.rocce.map(r => inst(aTerra(r, {w: 1, sy: .8, aff: .22}), VPEZZI.roccia, Math.ceil(170 * K / VPEZZI.rocce.length), true)) : null;
  const FEv = VPEZZI.felci ? VPEZZI.felci.map(f => inst(f, VPEZZI.felce, Math.ceil(700 * K / VPEZZI.felci.length))) : null;
  for (let n = 0; n < 9000 && (cA.i < cA.m.count || cB.i < cB.m.count || lG.i < lG.m.count || lA.i < lA.m.count); n++) {
    const z = R(-150, 70), dx = (rnd() < .55 ? R(3, 22) : R(3, 80)) * (rnd() < .5 ? -1 : 1), x = px(z) + dx;
    if (!libero(x, z, 4.3, 7.5)) continue;
    const r = rnd(), s = R(.75, 1.6) * (Math.abs(dx) > 30 ? 1.25 : 1);
    if (r < .42) place(cA, x, z, s, R(0, 6.28), R(.9, 1.25), tint(R(.85, 1.1)));
    else if (r < .76) place(cB, x, z, s, R(0, 6.28), R(.9, 1.3), tint(R(.85, 1.1)));
    else if (r < .9) place(lG, x, z, s * .85, R(0, 6.28), 1, tint(R(.85, 1.1)));
    else place(lA, x, z, s * .85, R(0, 6.28), 1, tint(R(.85, 1.15)));
  }
  for (let n = 0; n < 8000 && bu.i < bu.m.count; n++) { const z = R(-110, 30), x = px(z) + R(1.7, 14) * (rnd() < .5 ? -1 : 1); if (libero(x, z, 1.7, 3.4)) place(bu, x, z, R(.6, 1.3), R(0, 6.28), R(.7, 1.1), tint(R(.8, 1.15))); }
  for (let n = 0, c = 0; n < 5000 && c < ro.m.count; n++) { const z = R(-110, 30), x = px(z) + R(1.4, 18) * (rnd() < .5 ? -1 : 1); if (libero(x, z, 1.4, 3)) { place(ROv ? ROv[c % ROv.length] : ro, x, z, ROv ? R(.3, 1.15) : R(.35, 1.2), R(0, 6.28), 1, tint(R(.85, 1.1)), null, .3); c++; } }
  for (let n = 0, c = 0; n < 9000 && c < (FEv ? Math.round(700 * K) : fe.m.count); n++) { const z = R(-95, 20), x = px(z) + R(1.2, 9) * (rnd() < .5 ? -1 : 1); if (libero(x, z, 1.2, 2.2)) { place(FEv ? FEv[c % FEv.length] : fe, x, z, FEv ? R(.45, .95) : R(.8, 1.7), R(0, 6.28), R(.8, 1.2), tint(R(.8, 1.15)), null, .15); c++; } }
  for (let n = 0; n < 40000 && gr.i < gr.m.count; n++) {
    const z = R(-84, 22), x = px(z) + R(.75, 12) * (rnd() < .5 ? -1 : 1);
    if (Math.abs(z - sz(x)) < 1.3) continue; let ok = true; for (const s of STOP_POS) if (Math.hypot(x - s.x, z - s.z) < 1.5) ok = false; if (!ok) continue;
    place(gr, x, z, R(.7, 1.5), R(0, 6.28), R(.7, 1.3), tint(R(.75, 1.2)), terrain(x, z) - .02, .15);
  }
  const FC = ['#f3ead8', '#f0a7bd', '#ffd25e', '#c7b0f0', '#fff6ea', '#ff8f6e'].map(col), s3 = STOPS[3];
  for (let n = 0; n < 3000 && fl.i < fl.m.count * .4; n++) { const a = R(0, 6.28), r = Math.sqrt(rnd()) * 4.2, x = s3.x + Math.sin(a) * r, z = s3.z + Math.cos(a) * r; if (r < .8 || Math.abs(x - px(z)) < Math.abs(s3.x - px(s3.z)) + .2) continue; place(fl, x, z, R(.8, 1.4), R(0, 6.28), R(.7, 1.3), FC[Math.floor(rnd() * FC.length)], null, .2); }
  for (let n = 0; n < 3000 && fl.i < fl.m.count * .7; n++) { const a = R(0, 6.28), r = R(1.2, CL.r), x = CL.x + Math.sin(a) * r, z = CL.z + Math.cos(a) * r; if (Math.abs(x - px(z)) < .6 && z > CL.z) continue; place(fl, x, z, R(.8, 1.3), R(0, 6.28), R(.7, 1.3), FC[Math.floor(rnd() * FC.length)], null, .2); }
  for (let n = 0; n < 6000 && fl.i < fl.m.count; n++) { const z = R(-80, 15), x = px(z) + R(1, 6) * (rnd() < .5 ? -1 : 1); if (libero(x, z, 1, 2.6)) place(fl, x, z, R(.7, 1.2), R(0, 6.28), 1, FC[Math.floor(rnd() * FC.length)], null, .2); }
  for (let n = 0; n < 400 && mu.i < mu.m.count - 4; n++) { const z = R(-80, 10), x = px(z) + R(1.3, 5) * (rnd() < .5 ? -1 : 1); if (!libero(x, z, 1.3, 1)) continue; const k = 2 + Math.floor(rnd() * 3), set = rnd() < .6 ? mu : mb; for (let j = 0; j < k; j++) place(set, x + R(-.25, .25), z + R(-.25, .25), R(.5, 1), R(0, 6.28), R(.8, 1.2), null, null, .2); }
  /* funghi luminosi lungo le rive del ruscello e nella radura: la magia */
  for (let n = 0; n < 800 && glo.i < glo.m.count - 4; n++) { const x = R(-14, 14) + XC, z = sz(x) + (rnd() < .5 ? -1 : 1) * R(2.1, 3.2); if (Math.abs(x - px(z)) < 1.4) continue; for (let j = 0; j < 3; j++) place(glo, x + R(-.2, .2), z + R(-.2, .2), R(.35, .7), R(0, 6.28), R(.8, 1.3), null, null, .2); }
  for (let j = 0; j < 14; j++) { const a = R(0, 6.28), r = R(.9, 2.6), s0 = STOPS[0]; if (Math.cos(a) > .5) continue; place(glo, s0.x + Math.sin(a) * r, s0.z + Math.cos(a) * r, R(.45, .8)); }
  for (let j = 0; j < 12; j++) { const a = R(0, 6.28), r = R(2.6, 4); place(glo, CL.x + Math.sin(a) * r, CL.z + Math.cos(a) * r, R(.4, .8)); }
  [[1.0, .3], [-.5, -.45], [.75, -.55]].forEach(([dx, dz]) => place(mu, STOPS[0].x + dx, STOPS[0].z + dz, R(.7, 1)));
  [cA, cB, lG, lA, bu, gr, mu, mb, glo, fl, ...(ROv || [ro]), ...(FEv || [fe])].forEach(done);
}

/* ---------- raggi di luna tra gli alberi e pulviscolo ---------- */
const rayMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide, uniforms: {t: {value: 0}},
  vertexShader: `varying vec2 vU;varying float vD;void main(){vU=uv;vec4 mv=modelViewMatrix*vec4(position,1.);vD=-mv.z;gl_Position=projectionMatrix*mv;}`,
  fragmentShader: `uniform float t;varying vec2 vU;varying float vD;void main(){float x=abs(vU.x-.5)*2.;float a=(1.-x*x)*smoothstep(0.,.35,vU.y)*smoothstep(1.,.55,vU.y);
    a*=.55+.45*sin(vU.x*23.+t*.4)*sin(vU.x*9.-t*.25);a*=smoothstep(2.,9.,vD)*(1.-smoothstep(45.,80.,vD));gl_FragColor=vec4(vec3(.55,.62,.9)*a*.085,a);}`});
const RAYS = [];
{ const dirUp = MOON.clone(); for (let k = 0; k < (LOW ? 10 : 24); k++) {
  const z = R(-85, 20), x = px(z) + R(-7, 7), h = R(10, 15), w = R(2, 4.5), g = new THREE.PlaneGeometry(w, h); g.translate(0, h / 2, 0);
  const m = new THREE.Mesh(g, rayMat); m.position.set(x, terrain(x, z) - .5, z); m.quaternion.setFromUnitVectors(V3(0, 1, 0), dirUp); scene.add(m); RAYS.push(m); } }

/* ---------- lucciole ---------- */
const flyMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: {t: {value: 0}, sc: {value: 600}},
  vertexShader: `uniform float t,sc;attribute float ph;varying float vA;void main(){vec3 p=position;
    p.x+=sin(t*.45+ph*6.)*.7+sin(t*1.3+ph)*.12;p.y+=sin(t*.7+ph*9.)*.35;p.z+=cos(t*.38+ph*4.)*.7;
    vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;float b=.5+.5*sin(t*(1.6+fract(ph*7.)*1.5)+ph*20.);vA=b*b*(1.-smoothstep(25.,60.,-mv.z));
    gl_PointSize=clamp(.07*sc/max(.1,-mv.z),1.5,22.);}`,
  fragmentShader: `varying float vA;void main(){float d=length(gl_PointCoord-.5);float a=smoothstep(.5,.0,d);float c=smoothstep(.14,.0,d);gl_FragColor=vec4(vec3(1.,.9,.45)*(a*.5+c*3.)*vA,1.);}`});
{
  const N = Math.round(800 * K), pos = new Float32Array(N * 3), ph = new Float32Array(N), s3 = STOPS[3];
  for (let i = 0; i < N; i++) {
    let x, y, z;
    if (i < N * .22) { const a = R(0, 6.28), r = R(.2, 2.4); x = s3.x + Math.sin(a) * r; z = s3.z + Math.cos(a) * r; y = s3.y + R(.25, 1.8); }
    else if (i < N * .3) { const s0 = STOPS[0], a = R(0, 6.28), r = R(.8, 3.5); x = s0.x + Math.sin(a) * r; z = s0.z - Math.abs(Math.cos(a)) * r; y = s0.y + R(.3, 2.2); }
    else if (i < N * .45) { const a = R(0, 6.28), r = R(1, CL.r); x = CL.x + Math.sin(a) * r; z = CL.z + Math.cos(a) * r; y = R(.4, 3); }
    else { z = R(-90, 30); x = px(z) + R(-10, 10); y = gy(x, z) + R(.4, 3.4); }
    pos.set([x, y, z], i * 3); ph[i] = rnd() * 10;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('ph', new THREE.BufferAttribute(ph, 1));
  const pts = new THREE.Points(g, flyMat); pts.frustumCulled = false; scene.add(pts);
}
/* foglie che cadono attorno alla camera */
const LEAVES = [];
const leafGeo = (() => { const s = new THREE.Shape(); s.moveTo(0, -.06); s.quadraticCurveTo(.05, -.01, 0, .07); s.quadraticCurveTo(-.05, -.01, 0, -.06); return new THREE.ShapeGeometry(s, 4); })();
const leafSet = new THREE.InstancedMesh(leafGeo, new THREE.MeshLambertMaterial({side: THREE.DoubleSide}), LOW ? 50 : 90); leafSet.frustumCulled = false; scene.add(leafSet);
{ const LC = ['#e0a03a', '#c2592a', '#9a8a36', '#f0c060'].map(col); for (let i = 0; i < leafSet.count; i++) { leafSet.setColorAt(i, LC[i % 4]); LEAVES.push({p: V3(R(-6, 6), R(-1, 6), R(-11, -2.8)), v: R(.25, .5), ph: R(0, 9), s: R(.6, 1.1)}); } }

/* ---------- gli animali: forme tonde, pelo morbido (sheen), occhi lucidi con il punto di luce ---------- */
const fur = (c, sh = '#fff1de') => new THREE.MeshPhysicalMaterial({color: col(c), roughness: .8, sheen: .35, sheenRoughness: .5, sheenColor: col(sh)});
const eyeMat = new THREE.MeshPhysicalMaterial({color: col('#0b0806'), roughness: .08, clearcoat: 1, clearcoatRoughness: .05});
const glintMat = new THREE.MeshBasicMaterial({color: new THREE.Color(1.2, 1.2, 1.2)});
const S = (r, ws = 24, hs = 16) => new THREE.SphereGeometry(r, ws, hs);
function occhio(parent, x, y, z, r) { const e = obj(S(r, 16, 12), eyeMat, parent, false); e.position.set(x, y, z); const g = new THREE.Mesh(S(r * .2, 8, 6), glintMat); g.position.set(r * .3, r * .4, r * .82); e.add(g); return e; }
function part(geo, mat, parent, x, y, z, sx = 1, sy = 1, sz2 = 1) { const m = obj(geo, mat, parent); m.position.set(x, y, z); m.scale.set(sx, sy, sz2); return m; }
const ANIMALS = [];

function lepre(c = '#9a7a5e') {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const F = fur(c), B = fur('#efe3cf'), PK = fur('#e9a9a4');
  part(S(.12), F, body, 0, .13, 0, .95, .85, 1.2); part(S(.09), B, body, 0, .1, .07, .8, .7, .8);
  part(S(.07), F, body, .07, .09, -.07, .8, 1, 1.1); part(S(.07), F, body, -.07, .09, -.07, .8, 1, 1.1);
  const head = new THREE.Group(); head.position.set(0, .25, .12); body.add(head);
  part(S(.075), F, head, 0, 0, 0, 1, .95, 1.05); part(S(.04), B, head, .03, -.025, .05); part(S(.04), B, head, -.03, -.025, .05);
  part(S(.012, 10, 8), PK, head, 0, -.005, .078);
  occhio(head, .045, .02, .045, .017); occhio(head, -.045, .02, .045, .017);
  const ears = [];
  for (const s of [-1, 1]) { const e = new THREE.Group(); e.position.set(s * .025, .05, -.01); head.add(e); part(new THREE.CapsuleGeometry(.02, .12, 6, 12), F, e, 0, .08, 0, 1, 1, .55); part(new THREE.CapsuleGeometry(.012, .1, 6, 10), PK, e, 0, .08, .008, 1, 1, .3); e.rotation.set(-.2, 0, s * .18); ears.push(e); }
  part(S(.035), B, body, 0, .15, -.15);
  for (const s of [-1, 1]) part(new THREE.CapsuleGeometry(.018, .05, 4, 8), F, body, s * .04, .03, .1);
  return {root, body, head, ears};
}
function scoiattolo() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const F = fur('#b9582a', '#ffd0a0'), B = fur('#f2dcc0');
  part(S(.05), F, body, 0, .06, 0, .9, .9, 1.35); part(S(.035), B, body, 0, .05, .03, .8, .8, .9);
  const head = new THREE.Group(); head.position.set(0, .1, .06); body.add(head);
  part(S(.038), F, head, 0, 0, 0, 1, .95, 1.1); part(S(.02), B, head, 0, -.012, .03);
  occhio(head, .022, .01, .026, .009); occhio(head, -.022, .01, .026, .009);
  for (const s of [-1, 1]) { const e = part(new THREE.ConeGeometry(.012, .03, 8), F, head, s * .02, .038, -.005); e.rotation.z = -s * .25; }
  const tail = new THREE.Group(); tail.position.set(0, .06, -.06); body.add(tail); const segs = [];
  let parent = tail; for (let k = 0; k < 7; k++) { const g = new THREE.Group(); g.position.set(0, k ? .028 : 0, k ? -.012 : 0); parent.add(g); part(S(.024 + .012 * Math.sin(k / 6 * Math.PI)), F, g, 0, 0, 0, 1, 1.15, 1); segs.push(g); parent = g; }
  return {root, body, head, tail: segs};
}
function cervo(scale = 1, spots = false) {   // GIANNI §25.1: collo, spalle, cosce, ginocchia, coda; cammina davvero
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); root.scale.setScalar(scale);
  const F = fur('#a8714a', '#ffd9b0'), B = fur('#efe0c8'), DK = fur('#2a1d14'), PK = fur('#c98a7c');
  /* il tronco tornito: petto alto, vita stretta, groppa tonda */
  const tor = lath([[0, -.42], [.1, -.4], [.16, -.3], [.175, -.15], [.16, 0], [.165, .14], [.19, .27], [.17, .36], [.1, .42], [0, .44]], 28);
  tor.rotateX(Math.PI / 2); part(tor, F, body, 0, .96, 0, 1, 1.05, 1).scale.set(.95, 1.1, 1);
  part(S(.15), B, body, 0, .86, .02, .8, .55, 1.9);
  if (spots) for (let k = 0; k < 16; k++) part(S(.022, 8, 6), B, body, R(-.12, .12), R(1.08, 1.13), R(-.3, .25), 1, .35, 1);
  const legs = [];
  for (const [x, z, front] of [[.1, .26, 1], [-.1, .26, 1], [.1, -.27, 0], [-.1, -.27, 0]]) {
    const hip = new THREE.Group(); hip.position.set(x, .97, z); body.add(hip);
    part(S(front ? .085 : .11), F, hip, 0, -.05, front ? 0 : -.02, .8, 1.5, 1.05);            // spalla o coscia
    part(new THREE.CylinderGeometry(.03, front ? .06 : .075, .4, 12).translate(0, -.2, 0), F, hip, 0, -.02, 0);
    const knee = new THREE.Group(); knee.position.y = -.42; hip.add(knee);
    part(S(.034, 10, 8), F, knee, 0, 0, 0);
    part(new THREE.CylinderGeometry(.022, .03, .42, 10).translate(0, -.21, 0), F, knee, 0, 0, 0);
    part(new THREE.CylinderGeometry(.03, .026, .06, 10).translate(0, -.45, 0), DK, knee, 0, 0, front ? .006 : -.006);
    legs.push({hip, knee, front, x, z});
  }
  const neck = new THREE.Group(); neck.position.set(0, 1.1, .33); body.add(neck);
  part(new THREE.CylinderGeometry(.06, .11, .44, 16).translate(0, .2, 0), F, neck, 0, 0, 0).rotation.x = .5;
  part(S(.06), B, neck, 0, .12, .1, .8, 1.6, .5).rotation.x = .5;
  const head = new THREE.Group(); head.position.set(0, .37, .2); neck.add(head);
  part(S(.09), F, head, 0, 0, 0, .9, .88, 1.05);
  const snout = part(new THREE.CylinderGeometry(.038, .07, .17, 14).rotateX(Math.PI / 2), F, head, 0, -.035, .12); snout.rotation.x = .25;
  part(S(.03, 10, 8), DK, head, 0, -.055, .2, 1, .8, .8); part(S(.035), B, head, 0, -.075, .14, 1, .6, 1.2);
  occhio(head, .058, .022, .055, .02); occhio(head, -.058, .022, .055, .02);
  const ears = []; for (const s of [-1, 1]) { const e = new THREE.Group(); e.position.set(s * .06, .06, -.03); head.add(e); part(S(.07), F, e, s * .05, .03, 0, .5, 1.25, .2); part(S(.05), PK, e, s * .052, .03, .012, .4, 1.05, .1); e.rotation.z = -s * .75; ears.push(e); }
  const tail = new THREE.Group(); tail.position.set(0, 1.13, -.43); body.add(tail); part(S(.04), F, tail, 0, -.045, -.02, .7, 1.5, .5).rotation.x = -.35;
  return {root, body, neck, head, ears, legs, tail};
}
function gufo() {
  const root = new THREE.Group(), F = fur('#6e5440', '#ffe2c0'), FACE = fur('#d8c2a0'), Y = new THREE.MeshPhysicalMaterial({color: col('#f0a92a'), roughness: .2, clearcoat: 1, emissive: col('#a05a00'), emissiveIntensity: .4});
  part(S(.12), F, root, 0, .12, 0, 1, 1.25, .95);
  const head = new THREE.Group(); head.position.set(0, .3, 0); root.add(head);
  part(S(.105), F, head, 0, 0, 0, 1.08, .92, .95); part(S(.075), FACE, head, 0, -.005, .045, 1.45, 1, .6);
  const lids = [];
  for (const s of [-1, 1]) { const e = part(S(.032, 16, 12), Y, head, s * .043, .005, .088); const p = part(S(.017, 12, 8), eyeMat, head, s * .043, .005, .112); const g = new THREE.Mesh(S(.005, 8, 6), glintMat); g.position.set(s * .036, .016, .124); head.add(g);
    const lid = part(S(.034, 16, 10, 0, 6.283, 0, 1.6), F, head, s * .043, .01, .09); lid.scale.set(1, .05, 1); lids.push(lid);
    const tuftE = part(new THREE.ConeGeometry(.025, .07, 8), F, head, s * .07, .085, 0); tuftE.rotation.z = -s * .35; }
  part(new THREE.ConeGeometry(.014, .03, 8).rotateX(Math.PI), fur('#3a2c20'), head, 0, -.025, .12);
  return {root, head, lids};
}
function farfalla() {
  const root = new THREE.Group(), wm = new THREE.MeshBasicMaterial({map: wingTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, color: new THREE.Color(2.2, 2, 1.6), fog: false});
  const wings = [];
  for (const s of [-1, 1]) { const w = new THREE.Group(); root.add(w); const m = new THREE.Mesh(new THREE.PlaneGeometry(.07, .06).translate(.035, 0, 0), wm); m.rotation.x = -Math.PI / 2; m.scale.x = s; w.add(m); wings.push({w, s}); }
  return {root, wings};
}
function pesce() {
  const root = new THREE.Group(), M = new THREE.MeshPhysicalMaterial({color: col('#e7894a'), roughness: .25, clearcoat: 1, sheen: .5, sheenColor: col('#fff0d0')});
  part(S(.06), M, root, 0, 0, 0, .45, .6, 1.3); const t = part(new THREE.ConeGeometry(.045, .07, 10).rotateX(-Math.PI / 2), M, root, 0, 0, -.1, .25, 1, 1); t.rotation.z = Math.PI / 2;
  occhio(root, .022, .015, .045, .008); occhio(root, -.022, .015, .045, .008);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.1, .14, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({color: new THREE.Color(1.4, 1.5, 1.7), transparent: true, opacity: 0, depthWrite: false})); scene.add(ring);
  return {root, ring};
}

/* gli animali veri (Quaternius, CC0): scheletro e passi veri; pelo morbido al posto delle faccette */
function vivo(gl, h, tinte = {}) {
  const o = SkeletonUtils.clone(gl.scene), root = new THREE.Group(), pivot = new THREE.Group(); root.add(pivot); pivot.add(o);
  const mats = new Map();
  o.traverse(m => {
    if (!m.isMesh) return; m.castShadow = !LOW; m.receiveShadow = !LOW; m.frustumCulled = false;
    const g = m.geometry.clone(); g.deleteAttribute('normal'); g.computeVertexNormals(); m.geometry = g;
    { const p = g.attributes.position, n = g.attributes.normal, acc = new Map(), kk = i => `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
      for (let i = 0; i < p.count; i++) { const k = kk(i), v = acc.get(k) || acc.set(k, V3(0, 0, 0)).get(k); v.x += n.getX(i); v.y += n.getY(i); v.z += n.getZ(i); }
      for (let i = 0; i < p.count; i++) { const v = acc.get(kk(i)); if (v.lengthSq() > 1e-8) { const w = v.clone().normalize(); n.setXYZ(i, w.x, w.y, w.z); } } }   // le facce doppie (corna, orecchie) si annullano: lì resta la normale piatta, mai zero
    const q = m.material; if (!mats.has(q)) { const c = q.color.clone().multiplyScalar(tinte[q.name] || 1);
      mats.set(q, /eye/i.test(q.name) ? new THREE.MeshPhysicalMaterial({color: c, roughness: .1, clearcoat: 1}) : new THREE.MeshPhysicalMaterial({color: c, roughness: .85, sheen: .45, sheenRoughness: .5, sheenColor: col('#ffe2c0')})); }
    m.material = mats.get(q);
  });
  o.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(o, true), d = b.getSize(V3()), c = b.getCenter(V3()), sc = h / d.y;
  pivot.scale.setScalar(sc); pivot.position.set(-c.x * sc, -b.min.y * sc, -c.z * sc);
  const mx = new THREE.AnimationMixer(o), acts = {};
  for (const cl of gl.animations) if (!cl.name.includes('|')) acts[cl.name] = mx.clipAction(cl);
  const V = {root, pivot, mx, acts, cur: null, len: d.z * sc,
    play(n, fade = .5, ts = 1) { const a = acts[n]; if (!a) return; a.timeScale = ts; if (a === V.cur) return; a.reset().play(); if (V.cur) V.cur.crossFadeTo(a, fade, false); V.cur = a; }};
  V.play('Idle', 0); return V;
}

/* dove stanno e cosa fanno */
const routeHop = (pts, speed) => { const c = new THREE.CatmullRomCurve3(pts, true, 'centripetal'); return {c, len: c.getLength(), speed}; };
{ /* lepre che attraversa il sentiero tra la Kora e le radici, a balzi, poi si ferma ad annusare */
  const z = -15.5, L = lepre(); L.root.scale.setScalar(1.35); scene.add(L.root);
  const pts = [V3(px(z) - 5, 0, z + 1), V3(px(z) - 1, 0, z - .6), V3(px(z) + 3.5, 0, z + .4), V3(px(z) + 6, 0, z - 1.5), V3(px(z) + 2, 0, z - 3.2), V3(px(z) - 3, 0, z - 2)];
  ANIMALS.push({k: 'hop', a: L, r: routeHop(pts, 2.2), pause: 1.6, ph: 0});
  const L2 = lepre('#8c7058'); L2.root.scale.setScalar(1.35); scene.add(L2.root);
  { const s3 = STOPS[3]; /* GIANNI §27.1: una lepre grande che salta tra i fiori dietro la Fioritura */
  ANIMALS.push({k: 'hop', a: L2, r: routeHop([V3(s3.x - 2.6, 0, s3.z - 3), V3(s3.x - .4, 0, s3.z - 3.6), V3(s3.x + 2.2, 0, s3.z - 3.1), V3(s3.x + 1.4, 0, s3.z - 4.6), V3(s3.x - 1.8, 0, s3.z - 4.5)], 1.9), pause: 2.2, ph: 3}); L2.root.scale.setScalar(1.45); }
  /* lepre seduta accanto al ceppo della Kora: muove naso e orecchie */
  const L3 = lepre('#a58565'); const s0 = STOPS[0]; L3.root.position.set(s0.x + .75, terrain(s0.x + .75, s0.z + .55), s0.z + .55); L3.root.rotation.y = .6; L3.root.scale.setScalar(1.15); scene.add(L3.root);
  ANIMALS.push({k: 'sit', a: L3, ph: 1});
}
{ /* scoiattolo sul tronco caduto: corre avanti e indietro, si ferma ritto, la coda frusta */
  const lg = LOGS[0], A = scoiattolo(); scene.add(A.root); A.root.scale.setScalar(1.6);
  ANIMALS.push({k: 'squirrel', a: A, log: lg});
}
{ /* il gufo sul ramo del faggio: gira la testa verso la camera e sbatte le palpebre */
  const O = gufo(); OWL_AT.T.add(O.root); O.root.position.copy(OWL_AT.p); O.root.scale.setScalar(1.6); ANIMALS.push({k: 'owl', a: O});
}
{ /* cerva e cerbiatto nella radura, dietro l'Ovale: camminano, si fermano a brucare, alzano la testa quando arrivi */
  if (VERO.cerva) {
    const C1 = vivo(VERO.cerva, PORT() ? 1.7 : 1.4); scene.add(C1.root); ANIMALS.push({k: 'cerva', a: C1, ph: 0, a0: Math.PI * .86, a1: Math.PI * 1.14, rad: PORT() ? 9.6 : 6.4, passo: PORT() ? 1.15 : .95});
    const C2 = vivo(VERO.cerva, PORT() ? 1.05 : .88, {Main: 1.3, Main_Light: 1.15}); scene.add(C2.root); ANIMALS.push({k: 'cerva', a: C2, ph: .9, a0: Math.PI * .9, a1: Math.PI * 1.16, rad: PORT() ? 8.4 : 5.4, passo: PORT() ? .72 : .6});
  } else {
  const C1 = cervo(PORT() ? 1.15 : .95, false); scene.add(C1.root); ANIMALS.push({k: 'deer', a: C1, ph: 0, a0: Math.PI * .86, a1: Math.PI * 1.14, rad: PORT() ? 9.6 : 6.4});
  const C2 = cervo(PORT() ? .72 : .6, true); scene.add(C2.root); ANIMALS.push({k: 'deer', a: C2, ph: .9, a0: Math.PI * .9, a1: Math.PI * 1.16, rad: PORT() ? 8.4 : 5.4});
  }
  /* una lepre che attraversa la radura davanti alla cerva, a balzi veloci */
  const L4 = lepre('#9b7b5c'); L4.root.scale.setScalar(1.35); scene.add(L4.root);
  ANIMALS.push({k: 'hop', a: L4, r: routeHop([[-3, -1.5], [-.6, -2.2], [1.8, -1.5], [1.4, -3.2], [-1.8, -3.4]].map(([x, z]) => PORT() ? V3(CL.x + x * 1.6, 0, CL.z + z * 2.4 - 1.5) : V3(CL.x + 1.75 + x * .2, 0, CL.z + z * 1.1 - .7)), 2.2), pause: 1.8, ph: 1.3});
}
if (VERO.cervo) { /* il cervo sul poggio prima della radura: bruca, alza la testa e ti guarda passare */
  const z = -61.5, x = px(z) - 5.2, C = vivo(VERO.cervo, 2.05); C.root.position.set(x, terrain(x, z), z); scene.add(C.root);
  ANIMALS.push({k: 'cervo', a: C, yaw0: Math.PI * .5 + .35});
}
if (VERO.volpe) { /* la volpe che taglia il sentiero di corsa davanti alla camera, tra il faggio e il ponte */
  const V = vivo(VERO.volpe, .8, {Main: 1.5}); V.root.visible = false; scene.add(V.root);
  const lun = new THREE.PointLight(col('#c4d2ff'), 7, 3, 2); lun.position.set(0, 1.3, -.6); V.root.add(lun);   // la luna che le accende il pelo
  ANIMALS.push({k: 'volpe', a: V, r: null, t0: -99});   // GIANNI §33: attraversa il sentiero pochi metri davanti alla camera
}
for (let k = 0; k < (LOW ? 8 : 16); k++) { const f = farfalla(); scene.add(f.root); const c = k < 9 ? STOPS[3] : {x: CL.x, y: 0, z: CL.z}; ANIMALS.push({k: 'fly', a: f, c: V3(c.x, (c.y || terrain(c.x, c.z)) + R(.6, 1.6), c.z), r: R(.6, 2.2), ph: R(0, 9), sp: R(.3, .7)}); }
{ const f = pesce(); scene.add(f.root); ANIMALS.push({k: 'fish', a: f, x0: XC - 2.6, ph: 0}); } /* GIANNI §35.2: il cerchio nell acqua lontano dalle candele */

function anima(t, dt) {
  for (const A of ANIMALS) {
    const a = A.a;
    if (A.k === 'hop') {
      const cyc = A.r.len / A.r.speed + A.pause * 2, tt = (t + A.ph * 5) % cyc;
      const moving = tt < A.r.len / A.r.speed * .5 || (tt > A.r.len / A.r.speed * .5 + A.pause && tt < A.r.len / A.r.speed + A.pause);
      const along = tt < A.r.len / A.r.speed * .5 + A.pause ? Math.min(tt, A.r.len / A.r.speed * .5) : Math.min(tt - A.pause, A.r.len / A.r.speed);
      const u = (along * A.r.speed / A.r.len) % 1, p = A.r.c.getPointAt(u), tg = A.r.c.getTangentAt(u);
      const hp = moving ? (t * 3.1 + A.ph) % 1 : 0, hop = Math.sin(hp * Math.PI);
      a.root.position.set(p.x, terrain(p.x, p.z) + hop * .22, p.z); a.root.rotation.y = Math.atan2(tg.x, tg.z);
      a.body.rotation.x = moving ? -.35 * Math.cos(hp * Math.PI) : 0; a.body.scale.set(1, 1 + .12 * (hop - .3) * (moving ? 1 : 0), 1);
      a.ears.forEach((e, i) => e.rotation.x = moving ? -.2 - hop * .55 : -.2 + .1 * Math.sin(t * 3 + i));
      a.head.rotation.x = moving ? 0 : .35 + .08 * Math.sin(t * 9);
    } else if (A.k === 'sit') {
      a.head.rotation.set(.05 * Math.sin(t * 1.3), .5 * Math.sin(t * .35 + A.ph), 0); a.head.children[5] && (a.head.children[5].scale.y = 1 + .25 * Math.max(0, Math.sin(t * 14)));
      a.ears.forEach((e, i) => e.rotation.x = -.15 + (Math.sin(t * .7 + i * 2) > .93 ? -.5 : 0)); a.body.scale.y = 1 + .015 * Math.sin(t * 3);
    } else if (A.k === 'squirrel') {
      const lg = A.log, cyc = 7, tt = t % cyc, run = tt < 1.4 ? tt / 1.4 : tt < 3.5 ? 1 : tt < 4.9 ? 1 - (tt - 3.5) / 1.4 : 0, up = (tt > 1.4 && tt < 3.5) || tt > 4.9;
      const ax = V3(Math.cos(lg.ry) * 0, 0, 0), dir = V3(-Math.sin(lg.ry - Math.PI / 2), 0, -Math.cos(lg.ry - Math.PI / 2));
      const off = (run - .5) * 2.6; a.root.position.set(lg.x + dir.x * off, lg.h ? lg.h(off) : lg.y + lg.r * .92, lg.z + dir.z * off);
      const going = tt < 1.4 ? 1 : tt > 3.5 && tt < 4.9 ? -1 : 0, f = going > 0 ? 0 : Math.PI;
      a.root.rotation.y = Math.atan2(dir.x, dir.z) + (going < 0 || (tt > 3.5) ? Math.PI : 0);
      const gal = going ? Math.sin(t * 22) : 0; a.body.position.y = going ? Math.abs(gal) * .025 : 0; a.body.rotation.x = up ? -.9 : -.15 * gal;
      a.tail.forEach((s, i) => { s.rotation.x = (up ? .35 : .5) + .25 * Math.sin(t * (up ? 4 : 18) - i * .6); });
      a.head.rotation.y = up ? .6 * Math.sin(t * 1.7) : 0;
    } else if (A.k === 'owl') {
      const wp = new THREE.Vector3(); a.root.getWorldPosition(wp); const d = camera.position.clone().sub(wp);
      const yaw = Math.atan2(d.x, d.z) - a.root.parent.rotation.y; a.head.rotation.y += (Math.max(-1.6, Math.min(1.6, yaw)) - a.head.rotation.y) * Math.min(1, dt * 2.5);
      const bl = (t % 4.2) < .14 ? 1 : .05; a.lids.forEach(l => l.scale.y += (bl - l.scale.y) * .6);
    } else if (A.k === 'deer') {
      /* avanti e indietro su un arco dietro l'Ovale: 7 s di passo, 5 s a brucare */
      const cyc = 24, tt = (t + A.ph) % cyc, seg = tt < 7 ? [0, tt / 7] : tt < 12 ? [1, 1] : tt < 19 ? [2, (tt - 12) / 7] : [3, 0];
      const walking = seg[0] === 0 || seg[0] === 2, u = seg[0] === 0 ? seg[1] : seg[0] === 1 ? 1 : seg[0] === 2 ? 1 - seg[1] : 0;
      const ue = u * u * (3 - 2 * u), ang = A.a0 + (A.a1 - A.a0) * ue, x = CL.x + Math.sin(ang) * A.rad, z = CL.z + Math.cos(ang) * A.rad;
      const near = Math.max(0, 1 - camera.position.distanceTo(a.root.position) / 10);
      a.root.position.set(x, terrain(x, z), z);
      const dir = (seg[0] === 2 ? -1 : 1) * Math.sign(A.a1 - A.a0), yaw = ang + dir * Math.PI / 2;
      a.root.rotation.y += (Math.atan2(Math.sin(yaw - a.root.rotation.y), Math.cos(yaw - a.root.rotation.y))) * Math.min(1, dt * 3);
      const sp = walking ? (A.a1 - A.a0) * A.rad / 7 * 6 * u * (1 - u) : 0, gait = A.g = (A.g || 0) + Math.abs(sp) * dt * 4.2 / (a.root.scale.x);
      a.legs.forEach(L => { const off = (L.front ? 0 : Math.PI) + (L.x > 0 ? 0 : Math.PI), w = Math.min(1, Math.abs(sp) * 2), ph = gait + off;
        L.hip.rotation.x = .38 * w * Math.sin(ph); L.knee.rotation.x = (L.front ? 1 : -1) * .75 * w * Math.max(0, Math.sin(ph + 1.2)); });
      a.body.position.y = .018 * Math.min(1, Math.abs(sp) * 2) * Math.abs(Math.sin(gait)); a.body.rotation.z = .02 * Math.sin(gait) * Math.min(1, Math.abs(sp) * 2);
      const graze = (walking ? 0 : 1) * (1 - near);
      a.neck.rotation.x += ((graze * 1.35 - .05 * Math.sin(gait)) - a.neck.rotation.x) * Math.min(1, dt * 2.2);
      a.head.rotation.x += (graze * .35 - a.head.rotation.x) * Math.min(1, dt * 2.2);
      const d = camera.position.clone().sub(a.root.position); const look = Math.atan2(d.x, d.z) - a.root.rotation.y;
      a.neck.rotation.y += (near * Math.max(-.9, Math.min(.9, Math.atan2(Math.sin(look), Math.cos(look)))) * .7 - a.neck.rotation.y) * Math.min(1, dt * 2);
      a.ears.forEach((e, i) => e.rotation.x = (Math.sin(t * .9 + i * 2 + A.ph) > .9 ? .5 : 0) + (near ? -.2 : 0));
      a.tail.rotation.x = Math.sin(t * 11 + A.ph) > .6 ? .6 * Math.sin(t * 30) : 0;
    } else if (A.k === 'cerva') {
      const cyc = 24, tt = (t + A.ph) % cyc, seg = tt < 7 ? [0, tt / 7] : tt < 12 ? [1, 1] : tt < 19 ? [2, (tt - 12) / 7] : [3, 0];
      const walking = seg[0] === 0 || seg[0] === 2, u = seg[0] === 0 ? seg[1] : seg[0] === 1 ? 1 : seg[0] === 2 ? 1 - seg[1] : 0;
      const ue = u * u * (3 - 2 * u), ang = A.a0 + (A.a1 - A.a0) * ue, x = CL.x + Math.sin(ang) * A.rad, z = CL.z + Math.cos(ang) * A.rad;
      const near = Math.max(0, 1 - camera.position.distanceTo(a.root.position) / 10);
      a.root.position.set(x, terrain(x, z), z);
      const dir = (seg[0] === 2 ? -1 : 1) * Math.sign(A.a1 - A.a0), yaw = ang + dir * Math.PI / 2;
      a.root.rotation.y += (Math.atan2(Math.sin(yaw - a.root.rotation.y), Math.cos(yaw - a.root.rotation.y))) * Math.min(1, dt * 3);
      const sp = walking ? Math.abs((A.a1 - A.a0) * A.rad / 7 * 6 * u * (1 - u)) : 0;
      if (sp > .1) a.play('Walk', .5, Math.max(.45, sp / A.passo)); else a.play(near > .12 ? 'Idle' : 'Eating', .7);
      a.mx.update(dt);
    } else if (A.k === 'cervo') {
      const d = camera.position.clone().sub(a.root.position), dist = d.length(), look = Math.atan2(d.x, d.z);
      const alert = dist < 16, tt = t % 17, want = alert ? Math.max(-.6, Math.min(.6, Math.atan2(Math.sin(look - A.yaw0), Math.cos(look - A.yaw0)))) : 0;
      a.root.rotation.y += (A.yaw0 + want - a.root.rotation.y) * Math.min(1, dt * .8);
      a.play(alert ? (dist < 9 ? 'Idle' : 'Idle_2') : tt < 9 ? 'Eating' : tt < 13 ? 'Idle_Headlow' : 'Idle', .8);
      a.mx.update(dt);
    } else if (A.k === 'volpe') {
      const cz = camera.position.z, fw = new THREE.Vector3(); camera.getWorldDirection(fw);
      /* dopo la .02D, quando la camera riparte verso il ponte e guarda avanti: la volpe taglia il sentiero 6 m davanti */
      if ((t - A.t0 > 8 && cz < -24 && cz > -29 && fw.z < -.85) || (Q.has('volpe') && !A.r)) {
        A.t0 = t; const z = cz - 4.5; A.r = new THREE.CatmullRomCurve3([V3(px(z + .5) - 3.6, 0, z + .5), V3(px(z - 1) - .6, 0, z - 1), V3(px(z - 3.2) + .3, 0, z - 3.2), V3(px(z - 5.2) + 1.2, 0, z - 5.2), V3(px(z - 6.6) + 4.2, 0, z - 6.6)], false, 'centripetal');
      }
      const run = Q.has('volpe') ? t % 2.4 / 2.4 : (t - A.t0) / 2.4;   // sbuca a sinistra, corre sulla terra battuta davanti a te, sparisce a destra
      if (run >= 0 && run <= 1) {
        const p = A.r.getPointAt(run), tg = A.r.getTangentAt(run);
        a.root.visible = true; a.root.position.set(p.x, terrain(p.x, p.z), p.z); a.root.rotation.y = Math.atan2(tg.x, tg.z);
        a.play('Gallop', .1, 1.8); a.mx.update(dt);
      } else a.root.visible = false;
    } else if (A.k === 'fly') {
      const tt = t * A.sp + A.ph; a.root.position.set(A.c.x + Math.sin(tt) * A.r, A.c.y + Math.sin(tt * 2.3) * .3, A.c.z + Math.cos(tt * .8) * A.r);
      a.root.rotation.y = tt; const fl = Math.sin(t * 22 + A.ph) * .9; a.wings.forEach(({w, s}) => w.rotation.z = s * fl);
    } else if (A.k === 'fish') {
      const cyc = 5.5, tt = (t % cyc) / .9;
      if (tt <= 1) { const x = A.x0 + (tt - .5) * 1.4, z = sz(x); a.root.visible = true; a.root.position.set(x, -.42 + Math.sin(tt * Math.PI) * .55, z); a.root.rotation.set(0, Math.PI / 2, -(tt - .5) * 2.2); }
      else a.root.visible = false;
      const st = (t % cyc) - .9; a.ring.position.set(A.x0 + .7, -.41, sz(A.x0 + .7)); a.ring.material.opacity = st > 0 && st < 1.2 ? .32 * (1 - st / 1.2) : 0; a.ring.scale.setScalar(1 + Math.max(0, st) * 3);
    }
  }
}

/* ---------- il volo: drone alto al tramonto, tuffo, corsa rasoterra, giri attorno alle candele, salita alla luna ---------- */
const KEYS = [];
const port = PORT();
const SX = [.36, .64, .34, .62, .64], DS = [.8, 1, 1, 1, 1];
function camAt(s, ang, Dd, lift) {
  const side = Math.sign(s.x - px(s.z)) || 0, d = V3(-side * .8, 0, 1).normalize().applyAxisAngle(V3(0, 1, 0), ang);
  const c = V3(s.x, s.y + s.top + .07 * P, s.z);
  return {p: c.clone().add(d.multiplyScalar(Dd * (port ? 1.5 : 1))).add(V3(0, lift, 0)), l: c};
}
const key = (p, l, len, o = {}) => KEYS.push({p, l, len, fov: o.fov ?? 52, ap: o.ap ?? 0, sx: o.sx, stop: o.stop});
key(V3(px(78) + 8, 36, 78), V3(px(10), 9, -30), 100, {fov: 46});
key(V3(px(56) + 4, 29, 54), V3(px(0), 4, -16), 70, {fov: 48});
key(V3(px(26) + 1, 13, 24), V3(px(8), 0, 4), 55, {fov: 56});
key(V3(px(9), 2.4, 9), V3(px(-4), 1.1, -6), 45, {fov: 60});
key(V3(px(1), 1.25, 1), V3(px(-8), .9, -9), 40, {fov: 58});
STOPS.forEach((s, k) => {
  const side = Math.sign(s.x - px(s.z)) || 1, A = camAt(s, .55 * side, 2.7 * DS[k], .5 * DS[k]), B = camAt(s, -.18 * side, 2.15 * DS[k], .34 * DS[k]);
  key(A.p, A.l, 150, {fov: 36, ap: 1, sx: SX[k], stop: k});
  if (k < 4) {
    const n = STOPS[k + 1];
    key(B.p, B.l, 38, {fov: 38, ap: .6, sx: SX[k]});
    if (k === 2) {   // dopo Trilogy: il drone scende sull'acqua, passa accanto al ponte e risale sul sentiero
      key(V3(XC + 6, .55, sz(XC + 6) + .3), V3(XC - 1, .2, ZC), 40, {fov: 60});
      key(V3(XC + .2, 1.5, ZC - 3.4), V3(px(ZC - 10), .8, ZC - 10), 40, {fov: 58});
      key(V3(px(-45), 2.3, -45), V3(px(-51), .8, -51), 40, {fov: 56});
    } else {
      const z1 = s.z + (n.z - s.z) * .3, z2 = s.z + (n.z - s.z) * .66;
      key(V3(px(z1) + .3, gy(px(z1), z1) + 1.15, z1), V3(px(z1 - 7), gy(px(z1 - 7), z1 - 7) + .8, z1 - 7), 42, {fov: 60});
      key(V3(px(z2) - .3, gy(px(z2), z2) + 2.4, z2), V3(px(z2 - 6), gy(px(z2 - 6), z2 - 6) + .6, z2 - 6), 42, {fov: 56});
    }
  } else {
    key(B.p, B.l, 70, {fov: 38, ap: .6, sx: SX[k]});
    key(V3(s.x + .6, s.y + 3.2, s.z + 5.5), V3(s.x - 1, s.y + 1.4, s.z - 8), 70, {fov: 46});
    const e = V3(s.x + 1.2, s.y + 13, s.z + 12); key(e, e.clone().addScaledVector(V3(MOON.x, .3, MOON.z).normalize(), 20), 0, {fov: 48});
  }
});
const posC = new THREE.CatmullRomCurve3(KEYS.map(k => k.p), false, 'centripetal'), lookC = new THREE.CatmullRomCurve3(KEYS.map(k => k.l), false, 'centripetal');
const NK = KEYS.length;
let SEG = [], TOT = 0;
const sonda = document.createElement('div'); sonda.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:100vh;visibility:hidden;pointer-events:none'; document.body.appendChild(sonda);
let VHP = sonda.offsetHeight / 100 || innerHeight / 100 || 8;
function layout() {
  VHP = sonda.offsetHeight / 100 || innerHeight / 100 || 8;
  let y = 0; SEG = KEYS.slice(0, -1).map((k, i) => { const len = k.len * (port ? .85 : 1), o = {i, y0: y, y1: y + len}; y += len; return o; }); TOT = y;
  sec.style.height = (TOT + 100) * VHP + 'px';
}
function scrollT() {
  const y = Math.max(0, -sec.getBoundingClientRect().top / VHP); if (!(y >= 0)) return 0;
  for (const s of SEG) if (y < s.y1) return s.i + (y - s.y0) / (s.y1 - s.y0);
  return NK - 1;
}

/* ---------- la pellicola: bagliore, messa a fuoco, colore, grana ---------- */
let W = 2, H = 2;
const rt = new THREE.WebGLRenderTarget(2, 2, {type: THREE.HalfFloatType, samples: LOW ? 0 : 4});
rt.depthTexture = new THREE.DepthTexture(2, 2); rt.depthTexture.type = THREE.FloatType;
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), LOW ? .4 : .5, .5, 1.05);
const finMat = new THREE.ShaderMaterial({
  uniforms: {tCol: {value: rt.texture}, tDep: {value: rt.depthTexture}, res: {value: new THREE.Vector2()}, near: {value: camera.near}, far: {value: camera.far}, focus: {value: 10}, aper: {value: 0}, t: {value: 0}, expo: {value: 1}},
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader: `#include <packing>
    uniform sampler2D tCol,tDep;uniform vec2 res;uniform float near,far,focus,aper,t,expo;varying vec2 vUv;
    float vz(vec2 uv){return -perspectiveDepthToViewZ(texture2D(tDep,uv).x,near,far);}
    float coc(float z){return clamp(abs(z-focus)/max(z,.001)*aper,0.,1.)*${LOW ? '0.' : '13.'};}
    vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
    float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
    void main(){vec2 uv=vUv;float z=vz(uv);float c0=coc(z);vec3 col;
      if(c0<.6)col=texture2D(tCol,uv).rgb;
      else{vec3 acc=vec3(0.);float w=0.;for(int i=0;i<28;i++){float fi=float(i);float r=sqrt((fi+.5)/28.);float a=fi*2.39996;vec2 su=uv+vec2(cos(a),sin(a))*r*c0/res;
        float cs=coc(vz(su));float ww=smoothstep(r*c0-1.5,r*c0+.5,max(cs,c0*.85));vec3 s=texture2D(tCol,su).rgb;acc+=s*ww;w+=ww;}
        col=acc/max(w,.001);}
      vec2 dc=uv-.5;float r2=dot(dc,dc);
      col.r=mix(col.r,texture2D(tCol,uv-dc*r2*.004).r,.4);col.b=mix(col.b,texture2D(tCol,uv+dc*r2*.004).b,.4);
      col*=expo;float l=dot(col,vec3(.2126,.7152,.0722));
      col*=mix(vec3(.9,1.,1.12),vec3(1.08,1.,.9),smoothstep(.05,.6,l));
      col=aces(col);col=pow(col,vec3(1./2.2));
      col*=1.-${PORT() ? '.16' : '.3'}*pow(r2*1.9,1.35);
      col+=(h(uv*res+fract(t)*91.)-.5)*.045;
      gl_FragColor=vec4(col,1.);}`
});
const fin = new FullScreenQuad(finMat);
function size() {
  const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h, false); W = Math.round(w * renderer.getPixelRatio()); H = Math.round(h * renderer.getPixelRatio());
  rt.setSize(W, H); bloom.setSize(Math.round(W / (LOW ? 2 : 1)), Math.round(H / (LOW ? 2 : 1))); finMat.uniforms.res.value.set(W, H);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  flyMat.uniforms.sc.value = H / (2 * Math.tan(camera.fov * Math.PI / 360));
}

/* ---------- testi ---------- */
const fine = document.getElementById('uscita'), chaps = [...document.querySelectorAll('.chap')], pathBtns = [...document.querySelectorAll('.path button')], hero = document.getElementById('hero'), pathEl = document.getElementById('path');
pathBtns.forEach(b => b.addEventListener('click', () => { const k = +b.dataset.g, i = KEYS.findIndex(x => x.stop === k), s = SEG[i]; scrollTo({top: sec.offsetTop + (s.y0 + (s.y1 - s.y0) * .25) * VHP, behavior: 'smooth'}); }));

/* ---------- ciclo ---------- */
const REC = Q.has('rec'); let recN = 0;
let cur = Q.has('t') ? +Q.get('t') : 0, active = -2, last = performance.now(), T0 = last, frames = 0, slow = 0, roll = 0, fovS = 50, apS = 0;
const tP = new THREE.Vector3(), tL = new THREE.Vector3(), tA = new THREE.Vector3(), tB = new THREE.Vector3(), tM = new THREE.Matrix4(), tQ = new THREE.Quaternion(), tE = new THREE.Euler(), tS = new THREE.Vector3(), cw = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  const r = sec.getBoundingClientRect(); if (r.bottom < -50) { last = now; return; }
  let dt = Math.min(.05, Math.max(0, (now - last) / 1000)); last = now; let t = (now - T0) / 1000;
  if (REC) { recN++; dt = 1 / 60; t = recN / 60; }   // registrazione: tempo finto, 60 passi al secondo
  const target = Q.has('t') ? cur : scrollT();
  cur = reduce ? target : cur + (target - cur) * (1 - Math.exp(-dt * 6));
  if (Math.abs(target - cur) < 1e-4) cur = target; if (!Number.isFinite(cur)) cur = 0;
  const u = Math.min(1, Math.max(0, cur / (NK - 1)));
  posC.getPoint(u, tP); lookC.getPoint(u, tL);
  if (Q.has('cam')) { const c = Q.get('cam').split(',').map(Number); tP.set(c[0], c[1], c[2]); tL.set(c[3], c[4], c[5]); }
  camera.position.copy(tP); camera.lookAt(tL);
  /* il drone si piega in curva: rollio dalla curvatura del percorso */
  posC.getPoint(Math.max(0, u - .004), tA); posC.getPoint(Math.min(1, u + .004), tB);
  const d1 = tP.clone().sub(tA), d2 = tB.clone().sub(tP); const turn = d1.x * d2.z - d1.z * d2.x, sp = d1.length() + d2.length();
  const rollT = Math.max(-.22, Math.min(.22, -turn / Math.max(.02, sp * sp) * 1.4));
  roll += (rollT - roll) * Math.min(1, dt * 3); camera.rotateZ(roll);
  const i0 = Math.min(NK - 2, Math.floor(cur)), f = cur - i0, k0 = KEYS[i0], k1 = KEYS[i0 + 1], e = sstep(0, 1, f);
  const fovT = k0.fov + (k1.fov - k0.fov) * e; fovS += (fovT - fovS) * Math.min(1, dt * 4);
  if (Math.abs(camera.fov - fovS) > .01) { camera.fov = fovS; camera.updateProjectionMatrix(); flyMat.uniforms.sc.value = H / (2 * Math.tan(camera.fov * Math.PI / 360)); }
  const sxv = PORT() ? .5 : (k0.sx ?? .5) + ((k1.sx ?? .5) - (k0.sx ?? .5)) * e;
  const syP = PORT() ? .5 + ((k0.sx ? -.16 : 0) + ((k1.sx ? -.16 : 0) - (k0.sx ? -.16 : 0)) * e) : .5;
  camera.setViewOffset(W, H, (.5 - sxv) * W, (.5 - syP) * H, W, H);
  /* messa a fuoco: sulla candela quando ci si ferma, all'infinito in volo */
  apS += ((k0.ap + (k1.ap - k0.ap) * e) - apS) * Math.min(1, dt * 3);
  finMat.uniforms.focus.value = camera.position.distanceTo(tL); finMat.uniforms.aper.value = apS * .9; finMat.uniforms.t.value = t;
  sky.position.copy(camera.position); moon.position.copy(camera.position).addScaledVector(MOON, 430);
  /* l'ombra della luna segue la camera */
  camera.getWorldDirection(cw); const fc = tL.clone(); moonL.target.position.copy(fc); moonL.position.copy(fc).addScaledVector(MOON, 70);
  if (!reduce) {
    WIND.value = t; skyMat.uniforms.t.value = t; waterMat.uniforms.t.value = t; flyMat.uniforms.t.value = t; flameMat.uniforms.t.value = t; rayMat.uniforms.t.value = t;
    FLK.value = 1 + .1 * Math.sin(t * 9.3) + .06 * Math.sin(t * 23.1);
    LIGHTS.forEach(L => L.l.intensity = L.base * (1 + .08 * Math.sin(t * 9 + L.ph) + .05 * Math.sin(t * 23 + L.ph * 3)));
    LEAVES.forEach((L, i) => {
      L.p.y -= L.v * dt; L.p.x += Math.sin(t * .9 + L.ph) * .3 * dt; if (L.p.y < -2.5) L.p.set(R(-5, 5), R(3, 5), R(-11, -2.8));
      const wp = tS.copy(L.p).applyMatrix4(camera.matrixWorld); tE.set(t * .8 + L.ph, t * .6 + L.ph * 2, Math.sin(t + L.ph) * .8); tQ.setFromEuler(tE);
      tM.compose(wp, tQ, tA.set(L.s, L.s, L.s)); leafSet.setMatrixAt(i, tM);
    });
    leafSet.instanceMatrix.needsUpdate = true;
    anima(t, dt);
  }
  /* le fiamme guardano sempre la camera; i fari si vedono da lontano */
  FLAMES.forEach(fm => { fm.getWorldPosition(tA); fm.parent.worldToLocal(tB.set(camera.position.x, tA.y, camera.position.z)); fm.lookAt(camera.position.x, tA.y, camera.position.z); });
  BEACONS.forEach(b => { const d = b.position.distanceTo(camera.position); b.material.opacity = sstep(7, 20, d) * .75 * (1 - Math.min(1, apS * 1.4)); b.scale.setScalar(1.1 + d * .035); });
  RAYS.forEach(m => { /* il raggio gira sul proprio asse per mostrarsi di piatto */ });
  renderer.setRenderTarget(rt); renderer.render(scene, camera);
  bloom.render(renderer, null, rt, dt, false);
  renderer.setRenderTarget(null); fin.render(renderer);
  /* testi */
  const ti = i0, tu = f, kk = KEYS[ti];
  const inHero = ti === 0 && tu < .7;
  hero.classList.toggle('off', !inHero);
  const act = kk.stop !== undefined && tu > .02 && tu < .96 ? kk.stop : -1;
  if (act !== active) { active = act; chaps.forEach((el, k) => el.classList.toggle('on', k === act)); sec.classList.toggle('parla', act >= 0); }
  if (fine) fine.classList.toggle('on', cur > NK - 2 + .4);
  if (act >= 0) chaps[act].style.setProperty('--u', tu.toFixed(3));
  const y = Math.max(0, -r.top / VHP); pathEl.style.setProperty('--p', Math.min(1, y / TOT).toFixed(4));
  let lastStop = -1; for (let i = 0; i <= ti; i++) if (KEYS[i].stop !== undefined) lastStop = KEYS[i].stop;
  pathBtns.forEach((b, k) => b.classList.toggle('on', k === Math.max(0, lastStop) && !inHero));
  frames++; if (dt > .028) slow++;
  if (frames === 90) { if (slow > 40 && DPR > 1) { DPR = Math.max(1, DPR - .35); renderer.setPixelRatio(DPR); size(); } frames = 0; slow = 0; }
}

/* ---------- via ---------- */
layout(); size();
addEventListener('resize', () => { layout(); size(); });
if (renderer.compileAsync) await renderer.compileAsync(scene, camera).catch(() => {});
requestAnimationFrame(t => { frame(t); document.getElementById('load').classList.add('done'); const n = document.getElementById('loadN'); if (n) n.textContent = '100%'; });
if (Q.has('debug')) window.__B = {scene, camera, renderer, KEYS, STOPS, SEG, ANIMALS, get cur() { return cur; }, set cur(v) { cur = v; }};
