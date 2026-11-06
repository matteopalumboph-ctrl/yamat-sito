/* Yamat · il bosco in 3D, cartoon, scritto tutto da codice (4/11).
   Niente modelli scaricati né immagini generate: alberi, sentiero, ruscello, lucciole, luna e le cinque candele sono
   geometria costruita qui, con un'ombreggiatura a gradini e il contorno d'inchiostro dei cartoni.
   Lo scorrimento porta la camera lungo il sentiero; a ogni candela si ferma e compare il suo capitolo, come nel film della home.
   Per le prove: bosco3d.html?debug espone window.__B; ?t=3.4 mette la camera in quel punto del percorso. */
import * as THREE from 'three';
import {mergeVertices, mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const Q = new URLSearchParams(location.search);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const PORT = () => innerWidth < innerHeight * .9;
const LOW = PORT() || (navigator.hardwareConcurrency || 8) <= 4;

/* ---------- numeri a caso ma sempre uguali: il bosco è lo stesso a ogni visita ---------- */
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

/* ---------- il terreno: il sentiero serpeggia verso -z, il ruscello lo taglia, finisce nella radura ---------- */
const px = z => 1.8 * Math.sin(z * .085) + .9 * Math.sin(z * .21 + 1.3);          // x del sentiero alla profondità z
const sz = x => -36 + 1.6 * Math.sin(x * .11 + .5);                                 // z del ruscello alla x
const CL = {x: px(-68), z: -68, r: 10};                                             // la radura
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

/* ---------- materiali: luce a gradini e contorno d'inchiostro ---------- */
const gm = new THREE.DataTexture(new Uint8Array([70, 70, 70, 255, 140, 140, 140, 255, 205, 205, 205, 255, 255, 255, 255, 255]), 4, 1);
gm.minFilter = gm.magFilter = THREE.NearestFilter; gm.needsUpdate = true;
/* le candele hanno gradini morbidi: sul cemento scanalato i gradini netti facevano colature */
const gmS = new THREE.DataTexture(new Uint8Array([88, 88, 88, 255, 150, 150, 150, 255, 200, 200, 200, 255, 236, 236, 236, 255, 255, 255, 255, 255]), 5, 1);
gmS.minFilter = gmS.magFilter = THREE.LinearFilter; gmS.needsUpdate = true;
let PROD = false;
const toon = (c, o = {}) => new THREE.MeshToonMaterial({color: col(c), gradientMap: PROD ? gmS : gm, ...o});
const INK = 0x07100c;
function inkMat(w) {
  const m = new THREE.MeshBasicMaterial({color: INK, side: THREE.BackSide});
  m.onBeforeCompile = s => { s.uniforms.uO = {value: w}; s.vertexShader = 'uniform float uO;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normal * uO;'); };
  m.customProgramCacheKey = () => 'ink';
  return m;
}
/* il guscio del contorno ha le normali morbide anche sugli spigoli, così la linea non si apre */
function hull(geo) {
  let g = geo.clone(); for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  g = mergeVertices(g, 1e-4); g.computeVertexNormals(); return g;
}
function mesh(geo, mat, w, parent) {
  const m = new THREE.Mesh(geo, mat);
  if (w) { const o = new THREE.Mesh(hull(geo), inkMat(w)); m.add(o); }
  if (parent) parent.add(m);
  return m;
}
function inst(geo, mat, n, w) {
  const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false;
  let o = null;
  if (w) { o = new THREE.InstancedMesh(hull(geo), inkMat(w), n); o.instanceMatrix = m.instanceMatrix; o.frustumCulled = false; }
  return {m, o, i: 0};
}

/* ---------- geometrie: tutto a colori di vertice, così un albero intero è un solo disegno ---------- */
function paint(g, c) {
  g = g.index ? g.toNonIndexed() : g;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const n = g.attributes.position.count, a = new Float32Array(n * 3), p = g.attributes.position, nr = g.attributes.normal;
  const C = new THREE.Color();
  for (let i = 0; i < n; i++) {
    if (typeof c === 'function') C.copy(c(p.getX(i), p.getY(i), p.getZ(i), nr ? nr.getY(i) : 0)); else C.set(c);
    a[i * 3] = C.r; a[i * 3 + 1] = C.g; a[i * 3 + 2] = C.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const merge = gs => mergeGeometries(gs, false);
function smoothen(g) { for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k); g = mergeVertices(g, 1e-4); return g; }
function wobble(g, amp, f, so = 0) {
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = (vnoise(v.x * f + so, v.y * f + v.z * .7 * f) + vnoise(v.z * f - so, v.x * f * .8 + v.y * .5 * f) - 1);
    v.multiplyScalar(1 + amp * n); p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals(); return g;
}
const lath = (pts, seg = 12, ph = 0) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg, ph);
function blob(r, amp, so, det = 1) { return wobble(smoothen(new THREE.IcosahedronGeometry(r, det)), amp, 1.6 / r, so); }

function conifer(so) {
  const parts = [paint(new THREE.CylinderGeometry(.15, .24, 1.7, 7).translate(0, .85, 0), '#4a3527')];
  const tiers = [[.85, 2.5, 1.6, '#1d4635'], [2.15, 2.2, 1.22, '#22503c'], [3.25, 1.95, .86, '#2a5b44']];
  tiers.forEach(([y0, h, r, c], k) => {
    let g = lath([[0, h * .1], [r * .55, h * .05], [r, 0], [r * .82, h * .2], [r * .42, h * .62], [0, h]], 11);
    g = smoothen(g);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), y = p.getY(i), a = Math.atan2(x, z);
      const f = 1 + .13 * (vnoise(a * 1.6 + so * 3 + k * 5, k) - .5) * 2 * (y < h * .3 ? 1 : .5);
      p.setXYZ(i, x * f, y - (y < h * .25 ? .12 * vnoise(a * 2 + so, k * 3) : 0), z * f);
    }
    g.computeVertexNormals(); g.translate(0, y0, 0);
    const top = col(c).offsetHSL(0, 0, .05);
    parts.push(paint(g, (x, y, z, ny) => col(c).lerp(top, sstep(-.2, .8, ny))));
  });
  return merge(parts);
}
function leafy(c1, c2, so) {
  const parts = [paint(new THREE.CylinderGeometry(.16, .27, 2.6, 7).translate(0, 1.3, 0), '#4b3828')];
  parts.push(paint(new THREE.CylinderGeometry(.06, .1, 1.2, 5).rotateZ(.7).translate(.45, 2.4, 0), '#4b3828'));
  const B = [[0, 3.6, 0, 1.55], [.95, 3.15, .3, 1.15], [-.85, 3.25, -.25, 1.2], [.2, 4.5, -.2, 1.15], [-.3, 3.0, .85, 1.0]];
  B.forEach(([x, y, z, r], k) => {
    const g = blob(r, .16, so + k * 2.3).translate(x, y, z);
    parts.push(paint(g, (X, Y, Z, ny) => col(c1).lerp(col(c2), sstep(-.3, .9, ny))));
  });
  return merge(parts);
}
function bush(so) {
  const B = [[0, .35, 0, .62], [.55, .28, .15, .48], [-.5, .3, -.1, .5], [.1, .62, -.2, .42]];
  return merge(B.map(([x, y, z, r], k) => paint(blob(r, .18, so + k).translate(x, y, z), (X, Y, Z, ny) => col('#1f4532').lerp(col('#356a45'), sstep(-.2, .9, ny)))));
}
function rockGeo(so) {
  const g = wobble(smoothen(new THREE.DodecahedronGeometry(.6, 1)), .22, 2.2, so); g.scale(1, .62, .9);
  g.computeVertexNormals();
  return paint(g, (x, y, z, ny) => col('#58625d').lerp(col('#466b39'), sstep(.45, .75, ny)));
}
function tuft() {
  const gs = [];
  for (let k = 0; k < 5; k++) {
    const h = R(.22, .42), g = new THREE.ConeGeometry(.028, h, 3).translate(0, h / 2, 0).rotateZ(R(-.35, .35)).rotateX(R(-.3, .3)).rotateY(k * 1.3).translate(R(-.05, .05), 0, R(-.05, .05));
    gs.push(paint(g, (x, y) => col('#1d3b27').lerp(col('#5f8a48'), Math.min(1, y / .4))));
  }
  return merge(gs);
}
function mushroomGeo(cap) {
  const st = paint(new THREE.CylinderGeometry(.03, .04, .14, 8).translate(0, .07, 0), '#e2d5bb');
  const cp = new THREE.SphereGeometry(.085, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2); cp.scale(1, .7, 1); cp.translate(0, .13, 0);
  const un = new THREE.CircleGeometry(.084, 14).rotateX(Math.PI / 2).translate(0, .131, 0);
  return merge([st, paint(cp, cap), paint(un, '#c8b392')]);
}
function flowerGeo() {
  const gs = [paint(new THREE.CylinderGeometry(.006, .008, .26, 4).translate(0, .13, 0), '#2c4a2a')];
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; gs.push(paint(new THREE.SphereGeometry(.03, 5, 3).scale(1, .3, .55).translate(.034, 0, 0).rotateY(a).translate(0, .265, 0), '#ffffff')); }
  gs.push(paint(new THREE.SphereGeometry(.02, 5, 3).scale(1, .6, 1).translate(0, .272, 0), '#f0c64a'));
  return merge(gs);
}
function leafShape() {
  const s = new THREE.Shape(); s.moveTo(0, -.06); s.quadraticCurveTo(.05, -.01, 0, .07); s.quadraticCurveTo(-.05, -.01, 0, -.06);
  return new THREE.ShapeGeometry(s, 4);
}

/* ---------- texture disegnate in pagina ---------- */
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
const glowTex = canvasTex(128, 128, (x, w) => {
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,236,190,1)'); g.addColorStop(.18, 'rgba(255,196,110,.55)'); g.addColorStop(.5, 'rgba(255,150,60,.14)'); g.addColorStop(1, 'rgba(255,120,40,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
});
const shadowTex = canvasTex(64, 64, x => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(0,0,0,.75)'); g.addColorStop(.6, 'rgba(0,0,0,.3)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); });
const speckle = canvasTex(256, 256, (x) => {
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) { x.globalAlpha = R(.08, .32); x.fillStyle = rnd() < .7 ? '#8c8c8c' : '#ffffff'; x.beginPath(); x.arc(R(0, 256), R(0, 256), R(.4, 1.5), 0, 7); x.fill(); }
});
speckle.wrapS = speckle.wrapT = THREE.RepeatWrapping; speckle.repeat.set(3, 2);
const moonTex = canvasTex(256, 256, x => {
  const g = x.createRadialGradient(128, 128, 60, 128, 128, 128); g.addColorStop(0, 'rgba(255,240,205,.32)'); g.addColorStop(1, 'rgba(255,240,205,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  x.fillStyle = '#f6ecd4'; x.beginPath(); x.arc(128, 128, 62, 0, 7); x.fill();
  x.fillStyle = 'rgba(190,170,140,.45)';
  [[108, 110, 13], [150, 140, 9], [122, 158, 7], [146, 104, 6], [98, 142, 5]].forEach(([a, b, r]) => { x.beginPath(); x.arc(a, b, r, 0, 7); x.fill(); });
  x.strokeStyle = 'rgba(7,16,12,.55)'; x.lineWidth = 3; x.beginPath(); x.arc(128, 128, 62, 0, 7); x.stroke();
});
const ringsTex = canvasTex(256, 256, x => {
  x.fillStyle = '#b48d5e'; x.fillRect(0, 0, 256, 256);
  for (let r = 6; r < 128; r += R(6, 11)) { x.strokeStyle = `rgba(90,60,35,${R(.25, .5)})`; x.lineWidth = R(1.5, 3); x.beginPath(); x.ellipse(128 + R(-3, 3), 128 + R(-3, 3), r, r * R(.95, 1.03), 0, 0, 7); x.stroke(); }
  x.strokeStyle = 'rgba(60,40,25,.6)'; x.lineWidth = 3; x.beginPath(); x.moveTo(128, 128); x.lineTo(240, 150); x.stroke();
});
function labelTex(logo) {
  return canvasTex(512, 512, (x) => {
    x.fillStyle = '#f6f3ec'; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 5000; i++) { x.fillStyle = `rgba(60,50,40,${R(0, .04)})`; x.fillRect(R(0, 512), R(0, 512), 1.5, 1.5); }
    x.strokeStyle = 'rgba(120,120,120,.55)'; x.lineWidth = 3; x.beginPath(); x.moveTo(256, 150); x.bezierCurveTo(232, 120, 268, 100, 250, 70); x.bezierCurveTo(282, 100, 270, 128, 256, 150); x.stroke();
    if (logo) { const w = 380, h = w * logo.height / logo.width, t = document.createElement('canvas'); t.width = w; t.height = Math.ceil(h); const tx = t.getContext('2d'); tx.drawImage(logo, 0, 0, w, h); tx.globalCompositeOperation = 'source-in'; tx.fillStyle = '#1b1916'; tx.fillRect(0, 0, w, h); x.drawImage(t, (512 - w) / 2, 180); }
    else { x.fillStyle = '#1b1916'; x.textAlign = 'center'; x.font = '400 92px Fraunces, Georgia, serif'; x.fillText('YAMÂT', 256, 250); }
    x.fillStyle = '#3a3631'; x.textAlign = 'center'; x.font = '400 30px Fraunces, Georgia, serif'; x.fillText('C A L L   of   W O O D', 256, 320);
    x.font = '600 16px Figtree, Arial, sans-serif'; x.fillText('P R I V A T E   C O L L E C T I O N', 256, 420);
  });
}

let LABEL = null;
/* ---------- prima il logo vero e il sigillo: servono alle etichette ---------- */
let SEAL = null;
const carica = src => new Promise(ok => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = src; });
await Promise.all([carica('logo_yamat_light.png'), document.fonts ? document.fonts.ready : 0]).then(([logo]) => { LABEL = labelTex(logo); });
SEAL = await new THREE.TextureLoader().loadAsync('3d/kora_sigillo.png').catch(() => null); if (SEAL) SEAL.colorSpace = THREE.SRGBColorSpace;

/* ---------- la scena ---------- */
const sec = document.getElementById('film'), cv = document.getElementById('fc');
const renderer = new THREE.WebGLRenderer({canvas: cv, antialias: true, powerPreference: 'high-performance'});
let DPR = Math.min(devicePixelRatio || 1, LOW ? 1.6 : 2);
renderer.setPixelRatio(DPR);
const scene = new THREE.Scene();
const FOG = col('#22393b');
scene.fog = new THREE.FogExp2(FOG, .021);
renderer.setClearColor(FOG);
const camera = new THREE.PerspectiveCamera(40, 1, .04, 700);

scene.add(new THREE.HemisphereLight(col('#9cbfd0'), col('#1c2b20'), 1.5));
const moonL = new THREE.DirectionalLight(col('#c4d4ff'), 1.25); moonL.position.set(-30, 60, -50); scene.add(moonL);
const fill = new THREE.DirectionalLight(col('#ffcf9a'), .25); fill.position.set(20, 10, 40); scene.add(fill);

/* il cielo dell'imbrunire: notte in alto, un bagliore caldo in fondo al sentiero, le stelle che pulsano */
const SUN = new THREE.Vector3(.08, .02, -1).normalize(), MOON = new THREE.Vector3(-.35, .47, -1).normalize();
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: {t: {value: 0}, cTop: {value: col('#08131d')}, cMid: {value: col('#1a3443')}, cHor: {value: FOG.clone()}, cWarm: {value: col('#d99a63')}, sun: {value: SUN}, moon: {value: MOON}},
  vertexShader: `varying vec3 vD;void main(){vD=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}`,
  fragmentShader: `uniform float t;uniform vec3 cTop,cMid,cHor,cWarm,sun,moon;varying vec3 vD;
    void main(){vec3 d=normalize(vD);float y=d.y;
      vec3 c=mix(cHor,cMid,smoothstep(-.02,.2,y));c=mix(c,cTop,smoothstep(.2,.75,y));
      float w=pow(max(dot(d,sun),0.),4.)*(1.-smoothstep(-.05,.32,y));c=mix(c,cWarm,w*.85);
      c+=vec3(.9,.85,.7)*pow(max(dot(d,moon),0.),28.)*.18;
      vec3 p=d*230.;vec3 ip=floor(p);float h=fract(sin(dot(ip,vec3(12.9898,78.233,37.719)))*43758.5453);
      float s=step(.9972,h)*smoothstep(.06,.3,y)*smoothstep(.5,.05,length(fract(p)-.5));
      c+=vec3(1.,.94,.82)*s*(.55+.45*sin(t*1.7+h*91.));
      gl_FragColor=vec4(c,1.);
      #include <colorspace_fragment>
    }`
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), skyMat); sky.renderOrder = -2; scene.add(sky);
const moon = new THREE.Sprite(new THREE.SpriteMaterial({map: moonTex, fog: false, depthWrite: false, transparent: true})); moon.scale.setScalar(64); moon.renderOrder = -1; scene.add(moon);

/* terreno */
{
  const S = 300, N = LOW ? 170 : 240, g = new THREE.PlaneGeometry(S, S, N, N); g.rotateX(-Math.PI / 2); g.translate(0, 0, -45);
  const p = g.attributes.position, c = new Float32Array(p.count * 3), C = new THREE.Color();
  const G1 = col('#1f3b29'), G2 = col('#2c5233'), MO = col('#3d6435'), PA = col('#937a55'), PE = col('#66543c'), CLR = col('#3a6a3c'), MUD = col('#3b3226');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = terrain(x, z); p.setY(i, y);
    C.copy(G1).lerp(G2, fbm(x * .07, z * .07)); C.lerp(MO, sstep(.6, .75, fbm(x * .23 + 4, z * .23)) * .7);
    const dc = Math.hypot(x - CL.x, z - CL.z); C.lerp(CLR, (1 - sstep(CL.r * .5, CL.r * 1.2, dc)) * .6);
    const ds = Math.abs(z - sz(x)); C.lerp(MUD, (1 - sstep(1.2, 2.6, ds)) * .9);
    const dp = Math.abs(x - px(z)) + (vnoise(x * .9, z * .9) - .5) * .5, endP = sstep(CL.z - 1, CL.z + 3, z);
    C.lerp(PE, (1 - sstep(1.05, 1.5, dp)) * endP); C.lerp(PA, (1 - sstep(.55, 1.05, dp)) * endP);
    C.lerp(PA, (1 - sstep(1.2, 3.2, dc)) * .55);
    c[i * 3] = C.r; c[i * 3 + 1] = C.g; c[i * 3 + 2] = C.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, toon('#ffffff', {vertexColors: true})));
}

/* il ruscello: acqua a strisce che scorrono, schiuma sulle rive */
const waterMat = new THREE.ShaderMaterial({
  fog: true,
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {t: {value: 0}, c1: {value: col('#163f47')}, c2: {value: col('#2f6f74')}, cf: {value: col('#cfe8e0')}}]),
  vertexShader: `#include <common>
    #include <fog_pars_vertex>
    varying vec2 vU;varying vec3 vW;void main(){vU=uv;vW=(modelMatrix*vec4(position,1.)).xyz;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
    #include <fog_vertex>
    }`,
  fragmentShader: `#include <common>
    #include <fog_pars_fragment>
    uniform float t;uniform vec3 c1,c2,cf;varying vec2 vU;varying vec3 vW;
    void main(){float s=sin(vW.x*1.25-t*1.5+sin(vW.x*.37+vU.y*5.)*1.4+vU.y*2.5);float band=smoothstep(.86,.93,s);
      float s2=sin(vW.x*2.1-t*2.2+vU.y*9.+1.7);band=max(band,smoothstep(.93,.97,s2)*.7);
      float edge=smoothstep(.33,.46,abs(vU.y-.5)+.03*sin(vW.x*3.+t*2.));
      vec3 c=mix(c1,c2,.35+.35*sin(vW.x*.4+t*.2)*sin(vU.y*3.14));
      c=mix(c,cf,max(band*.5,edge*.8));gl_FragColor=vec4(c,1.);
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`
});
{
  const pos = [], uv = [], idx = []; const W = 1.75;
  for (let i = 0, x = -110; x <= 110; x += 1, i++) {
    const z = sz(x), dz = (sz(x + .5) - sz(x - .5)), n = new THREE.Vector2(-dz, 1).normalize();
    pos.push(x - n.x * W, -.42, z - n.y * W, x + n.x * W, -.42, z + n.y * W); uv.push(x, 0, x, 1);
    if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  const w = new THREE.Mesh(g, waterMat); w.material.side = THREE.DoubleSide; scene.add(w);
}
/* il ponticello dove il sentiero attraversa il ruscello */
const ZC = (() => { let z = -36; for (let k = 0; k < 6; k++) z = sz(px(z)); return z; })(), XC = px(ZC);
{
  const deck = Math.max(terrain(XC, ZC + 2.7), terrain(XC, ZC - 2.7)) + .06, wood = toon('#6e4d33'), dark = toon('#4f3826');
  const br = new THREE.Group(); br.position.set(XC, deck, ZC); br.rotation.y = Math.atan2(px(ZC - 1) - px(ZC + 1), -2) + Math.PI; scene.add(br);
  for (let k = -7; k <= 7; k++) mesh(new THREE.BoxGeometry(1.5 + R(-.06, .06), .07, .27).rotateY(R(-.04, .04)), wood, .012, br).position.set(R(-.03, .03), R(-.01, .01), k * .32);
  for (const s of [-1, 1]) {
    mesh(new THREE.CylinderGeometry(.1, .1, 5.2, 8).rotateX(Math.PI / 2), dark, .015, br).position.set(s * .6, -.12, 0);
    for (const k of [-2, 0, 2]) mesh(new THREE.CylinderGeometry(.05, .06, .75, 6), dark, .01, br).position.set(s * .74, .33, k);
    mesh(new THREE.CylinderGeometry(.045, .045, 4.4, 6).rotateX(Math.PI / 2), wood, .01, br).position.set(s * .74, .68, 0);
  }
}

/* ---------- la vegetazione, sparsa con regole: mai sul sentiero, mai nel ruscello, mai addosso alle candele ---------- */
const STOP_POS = [];   // riempito più giù, prima dello spargimento
function libero(x, z, dPath, dStop = 3.2) {
  if (Math.abs(x - px(z)) < dPath + (vnoise(x * .4, z * .4) - .5) * 1.2) return false;
  if (Math.abs(z - sz(x)) < 2.4) return false;
  if (Math.hypot(x - CL.x, z - CL.z) < CL.r + 1) return false;
  for (const s of STOP_POS) if (Math.hypot(x - s.x, z - s.z) < dStop) return false;
  return true;
}
const D = new THREE.Object3D();
function place(set, x, z, s, ry = R(0, 6.28), sy = 1, tint = null, y = null, tilt = .06) {
  if (set.i >= set.m.count) return;
  D.position.set(x, y ?? terrain(x, z) - .05 * s, z); D.rotation.set(R(-tilt, tilt), ry, R(-tilt, tilt)); D.scale.set(s, s * sy, s); D.updateMatrix();
  set.m.setMatrixAt(set.i, D.matrix);
  if (tint) set.m.setColorAt(set.i, tint);
  set.i++;
}
function done(set) { set.m.count = set.i; if (set.o) set.o.count = set.i; set.m.instanceMatrix.needsUpdate = true; if (set.m.instanceColor) set.m.instanceColor.needsUpdate = true; scene.add(set.m); if (set.o) scene.add(set.o); }
const tint = (l, h = 0) => new THREE.Color().setHSL(.28 + h, .0, 1).multiplyScalar(l);

/* ---------- le candele ---------- */
const P = 2.2;                       // le candele sono più grandi del vero, come nei cartoni: si leggono anche nel bosco
const FLAMES = [], LIGHTS = [], BEACONS = [];
const flameGeo = (() => { const pts = []; for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push(new THREE.Vector2(Math.sin(Math.PI * Math.pow(t, .62)) * .5, t)); } return new THREE.LatheGeometry(pts, 16); })();
const flOut = new THREE.MeshBasicMaterial({color: col('#ffae45'), transparent: true, opacity: .95, depthWrite: false});
const flIn = new THREE.MeshBasicMaterial({color: col('#fff6d8')});
const glowMat = new THREE.SpriteMaterial({map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .85});
const beaconMat = new THREE.SpriteMaterial({map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false});
const wickMat = toon('#2b221b');
function fiamma(parent, x, y, z) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  mesh(new THREE.CylinderGeometry(.0012, .0016, .012, 5).translate(0, .006, 0), wickMat, 0, g);
  const o = new THREE.Mesh(flameGeo, flOut); o.scale.set(.017, .034, .017); o.position.y = .007; g.add(o);
  const i = new THREE.Mesh(flameGeo, flIn); i.scale.set(.008, .017, .008); i.position.y = .0075; g.add(i);
  const s = new THREE.Sprite(glowMat); s.scale.setScalar(.15); s.position.y = .022; g.add(s);
  FLAMES.push({o, i, s, ph: R(0, 20)});
  return g;
}
const concrete = c => toon(c, {map: speckle});
function vaso({r0, r1, h, seg: seg0 = 72, th = .005, wax = .01, cWall, cWax = '#f2ead8', flN = 0, flA = 0, sx = 1, grad = null}) {
  const seg = flN ? flN * 10 : seg0;   // le scanalature vogliono dieci spicchi l'una, se no la luce le sbriciola
  const piece = (pts, color, flute) => {
    let g = lath(pts, seg, Math.PI); g.scale(sx, 1, 1);   // la cucitura del tornio sta dietro
    if (flute) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(x, z), f = 1 + flA * (Math.pow(Math.abs(Math.cos(flN * a / 2)), .7) - .6); p.setX(i, x * f); p.setZ(i, z * f); } }
    g.computeVertexNormals();
    const uv = g.attributes.uv; g = g.toNonIndexed();
    const n = g.attributes.position.count, cc = new Float32Array(n * 3), C = new THREE.Color(), pp = g.attributes.position;
    for (let i = 0; i < n; i++) { C.set(typeof color === 'function' ? color(pp.getY(i), pp.getX(i), pp.getZ(i)) : color); cc.set([C.r, C.g, C.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    return g;
  };
  const wall = [...Array(13)].map((_, i) => [r0 + (r1 - r0) * i / 12, h * i / 12]);
  const g = merge([
    piece(wall, grad || cWall, flN > 0),
    piece([[r1, h], [r1 - th, h]], grad ? grad(h) : cWall),
    piece([[r1 - th, h], [r1 - th, h - wax]], grad ? grad(h) : cWall),
    piece([[r1 - th, h - wax], [0, h - wax]], cWax),
    piece([[0, 0], [r0, 0]], cWall)]);
  return mesh(g, toon('#ffffff', {map: speckle, vertexColors: true}), .0022);
}
/* l'etichetta bianca col marchio, appoggiata sulla curva del vaso */
function etichetta(parent, rA, rB, y0, y1, w, sx = 1) {
  const r = (rA + rB) / 2, th = w / r, g = new THREE.CylinderGeometry(rB + .0007, rA + .0007, y1 - y0, 24, 1, true, -th / 2, th);
  g.translate(0, (y0 + y1) / 2, 0); g.scale(sx, 1, 1);
  const m = new THREE.Mesh(g, toon('#ffffff', {map: LABEL})); parent.add(m); return m;
}
function ombra(parent, x, z, r, y = .004) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({map: shadowTex, transparent: true, depthWrite: false, opacity: .8}));
  m.position.set(x, y, z); parent.add(m); return m;
}
function pozza(x, y, z, r, o = .35) {   // la luce calda della fiamma posata per terra
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: o}));
  m.position.set(x, y, z); scene.add(m); return m;
}
function luce(x, y, z, k = 1, side = 0) {
  /* la luce calda sta davanti alla candela, dal lato di chi guarda: illumina il vaso di fronte, mai solo dall'alto */
  const d = new THREE.Vector3(-side * .8, 0, 1).normalize();
  const l = new THREE.PointLight(col('#ffc890'), .7 * k, 7, 2); l.position.set(x + d.x * .6, y + .28, z + d.z * .6); scene.add(l); LIGHTS.push({l, base: .55 * k, ph: R(0, 9)});
  const b = new THREE.Sprite(beaconMat); b.position.set(x, y, z); b.scale.setScalar(2.6); scene.add(b); BEACONS.push(b);
}

function kora(g) {
  const v = vaso({r0: .045, r1: .045, h: .095, cWall: '#efece4', flN: 24, flA: .085, wax: .013}); g.add(v);
  fiamma(g, 0, .082, 0);
  /* il coperchio di metallo appoggiato di lato, con il sigillo di ceralacca */
  const lid = new THREE.Group(); lid.position.set(.05, .049, .042); lid.rotation.set(Math.PI / 2 - .3, .55, 0); g.add(lid);
  mesh(new THREE.CylinderGeometry(.049, .049, .011, 48), toon('#9c9d99', {map: speckle}), .0018, lid);
  mesh(new THREE.CylinderGeometry(.044, .044, .004, 48).translate(0, .0065, 0), toon('#8a8b87'), 0, lid);
  const seal = new THREE.Mesh(new THREE.CylinderGeometry(.021, .022, .005, 32).translate(0, .009, 0), [toon('#2e2a26'), toon('#ffffff', {map: SEAL}), toon('#2e2a26')]);
  lid.add(seal);
}
function c01(g) {
  const v = vaso({r0: .058, r1: .05, h: .078, cWall: '#a3b29a', wax: .011}); g.add(v);
  etichetta(g, .0565, .0515, .016, .062, .05);
  fiamma(g, 0, .067, 0);
  const lid = new THREE.Group(); lid.position.set(.075, .03, -.05); lid.rotation.set(Math.PI / 2 - .3, .7, 0); g.add(lid);
  mesh(new THREE.CylinderGeometry(.054, .054, .018, 48), concrete('#a3b29a'), .002, lid);
}
function c02d(g) {
  const b0 = .052, b1 = .046, h = .076;
  let geo = new THREE.CylinderGeometry(b1 * Math.SQRT2, b0 * Math.SQRT2, h, 4, 1).rotateY(Math.PI / 4).translate(0, h / 2, 0); geo = geo.toNonIndexed(); geo.computeVertexNormals();
  mesh(geo, concrete('#55585a'), .0022, g);
  mesh(new THREE.PlaneGeometry(b1 * 1.72, b1 * 1.72).rotateX(-Math.PI / 2).translate(0, h + .0006, 0), toon('#efe5d0'), 0, g);
  const a = Math.atan((b0 - b1) / h), lab = new THREE.Mesh(new THREE.PlaneGeometry(.05, .05), toon('#ffffff', {map: LABEL}));
  lab.position.set(0, .038, (b0 + b1) / 2 + .0008); lab.rotation.x = -a; g.add(lab);
  fiamma(g, 0, h, 0);
  const lid = mesh(new THREE.BoxGeometry(.108, .016, .108), toon('#7d4b2b'), .002, g); lid.position.set(-.07, .05, -.035); lid.rotation.set(.1, -.4, -1.25);
}
function trilogy(g) {
  const one = (r, x, z, ry) => {
    let s = new THREE.SphereGeometry(r, 72, 40); const p = s.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let X = p.getX(i), Y = p.getY(i), Z = p.getZ(i); const yy = Y / r, a = Math.atan2(X, Z), f = 1 + .075 * Math.cos(9 * a + 5.5 * yy) * Math.sqrt(Math.max(0, 1 - yy * yy));
      X *= f; Z *= f; if (Y > .74 * r) { const k = Math.sqrt(1 - .74 * .74) / Math.max(1e-3, Math.sqrt(1 - Math.min(.999, yy * yy))); X *= Math.min(1, k * .98); Z *= Math.min(1, k * .98); Y = .74 * r; } if (Y < -.86 * r) Y = -.86 * r;
      p.setXYZ(i, X, Y, Z);
    }
    s.computeVertexNormals(); s.translate(0, .86 * r, 0);
    const m = mesh(s, toon('#a6dccd', {emissive: col('#1d5a50'), emissiveIntensity: .55}), .0022, g); m.position.set(x, 0, z); m.rotation.y = ry;
    fiamma(g, x, 1.6 * r, z);
  };
  one(.05, -.06, .02, 0); one(.042, .055, -.045, 1); one(.037, .07, .07, 2);
}
function rosa(c) {
  const gs = [paint(new THREE.SphereGeometry(.011, 8, 6).scale(1, .9, 1), c)];
  for (let ring = 0; ring < 2; ring++) for (let k = 0; k < 5; k++) { const a = k / 5 * 6.283 + ring * .6, r = .011 + ring * .007; gs.push(paint(new THREE.SphereGeometry(.011 + ring * .003, 8, 5).scale(.75, .9, .35).translate(0, 0, r).rotateY(a).translate(0, -.002 * ring, 0), c)); }
  return merge(gs);
}
function margherita() {
  const gs = [paint(new THREE.SphereGeometry(.007, 8, 5).scale(1, .55, 1).translate(0, .002, 0), '#e8d9a6')];
  for (let k = 0; k < 11; k++) gs.push(paint(new THREE.SphereGeometry(.009, 6, 4).scale(.42, .18, 1).translate(0, 0, .014).rotateY(k / 11 * 6.283), '#f7f1e3'));
  return merge(gs);
}
function fioritura(g) {
  const R0 = .088, H = .072;
  mesh(new THREE.CylinderGeometry(R0, R0, H, 48).translate(0, H / 2, 0), toon('#e7d6b4'), .002, g);
  mesh(new THREE.CylinderGeometry(R0 + .0015, R0 + .0015, .013, 48).translate(0, .012, 0), toon('#e7c13f'), 0, g);
  const lab = etichetta(g, R0, R0, .026, .056, .03); lab.rotation.y = .1;
  const fm = toon('#ffffff', {vertexColors: true}), RO = rosa('#f2e8d4'), MA = margherita();
  const pos = [[0, .03, 0, 0], [.045, .022, .02, 1], [-.04, .024, .03, 0], [.02, .02, -.05, 1], [-.035, .02, -.035, 0], [.058, .012, -.03, 0], [-.062, .012, -.01, 1], [.01, .016, .062, 1], [-.02, .03, .03, 1], [.03, .028, -.012, 0], [-.012, .026, -.022, 1], [.066, .01, .035, 0], [-.05, .012, .055, 0], [.038, .01, .062, 0], [-.067, .01, -.045, 1], [.0, .01, -.072, 0], [.06, .01, .0, 1], [-.03, .02, .065, 0]];
  pos.forEach(([x, y, z, t], k) => {
    const m = new THREE.Mesh(t ? MA : RO, fm); m.position.set(x, H + y, z);
    m.lookAt(x * 3, H + y + .08, z * 3); m.rotateX(Math.PI / 2); m.scale.setScalar(t ? 1.25 : 1.15); g.add(m);
  });
}
function scrigno(g) {
  const W = .16, H = .07, Dd = .115;
  mesh(new THREE.BoxGeometry(W, H * .78, Dd).translate(0, H * .39, 0), toon('#efe6d4'), .002, g);
  mesh(new THREE.BoxGeometry(W + .004, H * .3, Dd + .004).translate(0, H * .85, 0), toon('#f3ebdb'), .002, g);
  const rib = toon('#7d2233');
  mesh(new THREE.BoxGeometry(.016, H + .006, Dd + .008).translate(-.02, H / 2, 0), rib, 0, g);
  mesh(new THREE.BoxGeometry(W + .008, H + .006, .016).translate(0, H / 2, .005), rib, 0, g);
  for (const s of [-1, 1]) { const l = mesh(new THREE.TorusGeometry(.017, .005, 8, 20), rib, .0015, g); l.position.set(-.02 + s * .018, H + .01, .005); l.rotation.set(Math.PI / 2 - .35, 0, s * .5); l.scale.set(1, 1, .55); }
  mesh(new THREE.CylinderGeometry(.013, .014, .005, 24), toon('#a8282c'), .0012, g).position.set(-.02, H + .006, .005);
}
function ovale(g) {
  const sx = 1.55, r = .058, h = .088;
  const grad = y => { const k = sstep(.3, .45, y / h); return col('#d3a04a').lerp(col('#ead0c5'), k); };
  const v = vaso({r0: r, r1: r * .98, h, cWall: '#ffffff', sx, wax: .012, grad}); g.add(v);
  etichetta(g, r, r * .985, .03, .074, .046, sx).position.z = .0004;
  fiamma(g, -.042, h - .012, 0); fiamma(g, .042, h - .012, 0);
}

/* ---------- le cinque tappe: dove stanno le candele e su cosa poggiano ---------- */
const bark = toon('#5a4231', {map: speckle}), moss = toon('#466f37');
function tappa(i, x, z, build, base) {
  let y = terrain(x, z); for (let a = 0; a < 6.28; a += .8) y = Math.max(y, terrain(x + Math.sin(a) * .45, z + Math.cos(a) * .45));
  STOP_POS.push({x, z});
  const root = new THREE.Group(); root.position.set(x, y, z); scene.add(root);
  const top = base ? base(root) : 0;
  const g = new THREE.Group(); g.position.y = top; g.scale.setScalar(P); root.add(g);
  PROD = true; build(g); PROD = false;
  ombra(g, 0, 0, .12, .0015);
  return {root, g, top, x, y, z};
}
const STOPS = [];
/* I · Kora sul ceppo coperto di muschio */
STOPS.push(tappa(0, px(-9) + 1.75, -9, kora, root => {
  const s = mesh(wobble(smoothen(new THREE.CylinderGeometry(.33, .4, .5, 16, 3)).translate(0, .25, 0), .05, 3, 2), bark, .012, root);
  const t = new THREE.Mesh(new THREE.CircleGeometry(.325, 32).rotateX(-Math.PI / 2).translate(0, .501, 0), toon('#ffffff', {map: ringsTex})); root.add(t);
  mesh(blob(.2, .25, 4).scale(1.2, .35, 1).translate(-.2, .5, -.12), moss, .01, root);
  mesh(blob(.16, .25, 7).scale(1, .5, 1).translate(.3, .1, -.2), moss, .01, root);
  ombra(root, 0, 0, .8, .02);
  return .5;
}));
/* II · .01 e .02D tra le radici del faggio */
STOPS.push(tappa(1, px(-23) - 1.65, -23, g => {
  const a = new THREE.Group(); a.position.x = .085; g.add(a); c01(a);
  const b = new THREE.Group(); b.position.set(-.1, 0, -.02); b.rotation.y = .3; g.add(b); c02d(b);
}, root => {
  const T = new THREE.Group(); T.position.set(-1.9, 0, -1.3); root.add(T);
  mesh(wobble(smoothen(new THREE.CylinderGeometry(.62, .95, 10, 18, 6)).translate(0, 4.6, 0), .04, .8, 9), toon('#7a7068', {map: speckle}), .03, T);
  for (let k = 0; k < 7; k++) {
    const a = k / 7 * 6.28 + .4, len = R(1.4, 2.2), rt = mesh(new THREE.ConeGeometry(.3, len, 8).translate(0, -len / 2, 0), toon('#6f655d', {map: speckle}), .02, T);
    rt.position.set(Math.sin(a) * .7, .55, Math.cos(a) * .7); rt.rotation.set(Math.cos(a) * 1.15, 0, -Math.sin(a) * 1.15);
  }
  const crown = [[0, 10.5, 0, 3], [2.2, 9.6, .8, 2.3], [-2, 9.8, -.6, 2.4], [.6, 12, -.8, 2.2], [-1, 8.8, 1.8, 2]];
  crown.forEach(([x, y, z, r], k) => mesh(blob(r, .14, 20 + k).translate(x, y, z), toon(k % 2 ? '#c4892f' : '#b57628'), .05, T));
  mesh(wobble(smoothen(new THREE.CylinderGeometry(.55, .62, .1, 18, 1)).translate(0, -.03, 0), .06, 3, 4), toon('#4a3a29'), .01, root);
  ombra(root, 0, 0, .7, .025);
  return .02;
}));
/* III · Trilogy Flames sul sasso piatto, sulla riva del ruscello */
{
  const xr = XC + 1.55, zr = sz(xr) + 2.35;
  STOPS.push(tappa(2, xr, zr, trilogy, root => {
    mesh(wobble(smoothen(new THREE.CylinderGeometry(.33, .42, .3, 14, 2)).translate(0, .14, 0), .08, 3, 5), toon('#6f7a6c', {map: speckle}), .012, root);
    mesh(blob(.15, .3, 12).scale(1.3, .4, 1).translate(.25, .3, -.2), moss, .008, root);
    return .3;
  }));
}
/* IV · Fioritura Eterna e lo Scrigno nel sottobosco in fiore */
STOPS.push(tappa(3, px(-51) - 1.7, -51, g => {
  const a = new THREE.Group(); a.position.set(-.07, 0, 0); g.add(a); fioritura(a);
  const b = new THREE.Group(); b.position.set(.16, 0, .03); b.rotation.y = -.35; g.add(b); scrigno(b);
}, root => {
  mesh(wobble(smoothen(new THREE.CylinderGeometry(.46, .52, .14, 18, 1)).translate(0, .07, 0), .05, 2, 8), toon('#77786a', {map: speckle}), .012, root);
  mesh(blob(.2, .25, 3).scale(1.4, .3, 1).translate(.3, .14, -.26), moss, .01, root);
  return .14;
}));
/* V · l'Ovale nella radura, sulla pietra, sotto la luna */
STOPS.push(tappa(4, CL.x, CL.z, ovale, root => {
  mesh(wobble(smoothen(new THREE.CylinderGeometry(.38, .46, .2, 18, 1)).translate(0, .1, 0), .05, 2, 3), toon('#7a7d70', {map: speckle}), .012, root);
  mesh(blob(.18, .25, 6).scale(1.5, .3, 1).translate(-.3, .2, -.16), moss, .01, root);
  for (let k = 0; k < 11; k++) { const a = k / 11 * 6.28, r = 2.2 + R(-.2, .2), s = mesh(rockGeo(k), toon('#ffffff', {vertexColors: true}), .012, root); s.position.set(Math.sin(a) * r, 0, Math.cos(a) * r); s.scale.setScalar(R(.25, .42)); s.rotation.y = R(0, 6); }
  return .2;
}));
/* le luci: una per tappa, sopra la fiamma; nel sottobosco la luce viene dalle lucciole */
STOPS.forEach((s, k) => {
  const fy = s.y + s.top + (k === 3 ? .5 : .19 * P);
  luce(s.x + (k === 3 ? .2 : 0), fy + .1, s.z + (k === 3 ? .3 : .05), k === 3 ? .8 : k === 2 ? 1.25 : 1, Math.sign(s.x - px(s.z)) || 0);
  if (k !== 3) pozza(s.x, s.y + .03 + (k === 0 ? .48 : 0), s.z, k === 0 ? 1.1 : 1.6, k === 0 ? .25 : .32);
});
STOPS[3].lume = true;

/* un tronco caduto vicino al ceppo e qualche tronco lungo il sentiero */
for (const [z, s, r] of [[-12.5, 1, .25], [-29, -1, .2], [-58, 1, .22]]) {
  const x = px(z) + s * 3.2, l = new THREE.Group(); l.position.set(x, terrain(x, z) + r * .8, z); l.rotation.set(0, R(.3, 1.2), Math.PI / 2); scene.add(l);
  mesh(wobble(smoothen(new THREE.CylinderGeometry(r, r * 1.1, 3.4, 12, 4)), .05, 2, z), bark, .015, l);
  const e = new THREE.Mesh(new THREE.CircleGeometry(r * 1.08, 16).rotateX(-Math.PI / 2).translate(0, 1.701, 0), toon('#ffffff', {map: ringsTex})); l.add(e);
  mesh(blob(r * .9, .3, z).scale(1.6, .6, 1).translate(r * .6, .4, 0), moss, .01, l);
}

/* ---------- lo spargimento ---------- */
const vMat = () => toon('#ffffff', {vertexColors: true});
const K = LOW ? .5 : 1;
{
  const cA = inst(conifer(1), vMat(), Math.round(900 * K), .045), cB = inst(conifer(5), vMat(), Math.round(700 * K), .045);
  const lG = inst(leafy('#2f5532', '#4d7a3d', 2), vMat(), Math.round(240 * K), .045), lA = inst(leafy('#a8652a', '#d7a13f', 6), vMat(), Math.round(110 * K), .045);
  const bu = inst(bush(3), vMat(), Math.round(520 * K), .02), ro = inst(rockGeo(9), vMat(), Math.round(170 * K), .015);
  const gr = inst(tuft(), vMat(), Math.round(6500 * K), 0), mu = inst(mushroomGeo('#a9452f'), vMat(), 90, .006), mb = inst(mushroomGeo('#8b5d3c'), vMat(), 60, .006);
  const fl = inst(flowerGeo(), vMat(), Math.round(1300 * K), 0);
  /* alberi: fitti vicino al sentiero, poi radi verso la nebbia */
  for (let n = 0; n < 9000 && (cA.i < cA.m.count || cB.i < cB.m.count || lG.i < lG.m.count || lA.i < lA.m.count); n++) {
    const z = R(-150, 46), dx = (rnd() < .55 ? R(3, 22) : R(3, 80)) * (rnd() < .5 ? -1 : 1), x = px(z) + dx;
    if (!libero(x, z, 4.3, 7.5)) continue;
    const r = rnd(), s = R(.75, 1.6) * (Math.abs(dx) > 30 ? 1.25 : 1);
    if (r < .42) place(cA, x, z, s, R(0, 6.28), R(.9, 1.25), tint(R(.85, 1.1)));
    else if (r < .78) place(cB, x, z, s, R(0, 6.28), R(.9, 1.3), tint(R(.85, 1.1)));
    else if (r < .92) place(lG, x, z, s * .85, R(0, 6.28), 1, tint(R(.85, 1.1)));
    else place(lA, x, z, s * .85, R(0, 6.28), 1, tint(R(.85, 1.15)));
  }
  for (let n = 0; n < 8000 && bu.i < bu.m.count; n++) { const z = R(-110, 30), x = px(z) + R(1.7, 14) * (rnd() < .5 ? -1 : 1); if (libero(x, z, 1.7, 3.4)) place(bu, x, z, R(.6, 1.3), R(0, 6.28), R(.7, 1.1), tint(R(.8, 1.15))); }
  for (let n = 0; n < 5000 && ro.i < ro.m.count; n++) { const z = R(-110, 30), x = px(z) + R(1.4, 18) * (rnd() < .5 ? -1 : 1); if (libero(x, z, 1.4, 3)) place(ro, x, z, R(.35, 1.2), R(0, 6.28), 1, tint(R(.85, 1.1)), null, .3); }
  /* erba: ai bordi del sentiero, nella radura, lungo le rive */
  for (let n = 0; n < 40000 && gr.i < gr.m.count; n++) {
    const z = R(-84, 22), x = px(z) + R(.75, 12) * (rnd() < .5 ? -1 : 1);
    if (Math.abs(z - sz(x)) < 1.3) continue;
    let ok = true; for (const s of STOP_POS) if (Math.hypot(x - s.x, z - s.z) < 1.5) ok = false; if (!ok) continue;
    place(gr, x, z, R(.7, 1.5), R(0, 6.28), R(.7, 1.3), tint(R(.75, 1.2)), terrain(x, z) - .02, .15);
  }
  /* fiori: un letto attorno alla quarta candela, cerchi nella radura, sparsi lungo il sentiero */
  const FC = ['#f3ead8', '#e9b7c3', '#f0cf6a', '#c9b6e4', '#f6f2e8', '#e98f7a'].map(col);
  const s3 = STOPS[3];
  for (let n = 0; n < 3000 && fl.i < fl.m.count * .4; n++) { const a = R(0, 6.28), r = Math.sqrt(rnd()) * 4.2, x = s3.x + Math.sin(a) * r, z = s3.z + Math.cos(a) * r; if (r < .8 || Math.abs(x - px(z)) < Math.abs(s3.x - px(s3.z)) + .2) continue; place(fl, x, z, R(.8, 1.4), R(0, 6.28), R(.7, 1.3), FC[Math.floor(rnd() * FC.length)], null, .2); }
  for (let n = 0; n < 3000 && fl.i < fl.m.count * .7; n++) { const a = R(0, 6.28), r = R(1.2, CL.r), x = CL.x + Math.sin(a) * r, z = CL.z + Math.cos(a) * r; if (Math.abs(x - px(z)) < .6 && z > CL.z) continue; place(fl, x, z, R(.8, 1.3), R(0, 6.28), R(.7, 1.3), FC[Math.floor(rnd() * FC.length)], null, .2); }
  for (let n = 0; n < 6000 && fl.i < fl.m.count; n++) { const z = R(-80, 15), x = px(z) + R(1, 6) * (rnd() < .5 ? -1 : 1); if (libero(x, z, 1, 2.6)) place(fl, x, z, R(.7, 1.2), R(0, 6.28), 1, FC[Math.floor(rnd() * FC.length)], null, .2); }
  /* funghi a gruppetti, vicino ai ceppi e ai bordi */
  for (let n = 0; n < 400 && mu.i < mu.m.count - 4; n++) {
    const z = R(-80, 10), x = px(z) + R(1.3, 5) * (rnd() < .5 ? -1 : 1); if (!libero(x, z, 1.3, 1)) continue;
    const k = 2 + Math.floor(rnd() * 3), set = rnd() < .6 ? mu : mb; for (let j = 0; j < k; j++) place(set, x + R(-.25, .25), z + R(-.25, .25), R(.5, 1), R(0, 6.28), R(.8, 1.2), null, null, .2);
  }
  [[1.0, .3], [-.5, -.45], [.75, -.55]].forEach(([dx, dz], j) => place(mu, STOPS[0].x + dx, STOPS[0].z + dz, R(.7, 1)));
  [cA, cB, lG, lA, bu, ro, gr, mu, mb, fl].forEach(done);
}

/* ---------- lucciole ---------- */
const flyMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: {t: {value: 0}, sc: {value: 600}},
  vertexShader: `uniform float t,sc;attribute float ph;varying float vA;void main(){vec3 p=position;
    p.x+=sin(t*.45+ph*6.)*.7+sin(t*1.3+ph)*.12;p.y+=sin(t*.7+ph*9.)*.35;p.z+=cos(t*.38+ph*4.)*.7;
    vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
    float b=.5+.5*sin(t*(1.6+fract(ph*7.)*1.5)+ph*20.);vA=b*b*(1.-smoothstep(25.,60.,-mv.z));
    gl_PointSize=clamp(.09*sc/max(.1,-mv.z),1.5,46.);}`,
  fragmentShader: `varying float vA;void main(){float d=length(gl_PointCoord-.5);float a=smoothstep(.5,.0,d);float c=smoothstep(.16,.0,d);
    gl_FragColor=vec4(vec3(1.,.93,.55)*(a*.55+c*1.2)*vA,1.);}`
});
{
  const N = Math.round(700 * K), pos = new Float32Array(N * 3), ph = new Float32Array(N), s3 = STOPS[3];
  for (let i = 0; i < N; i++) {
    let x, y, z;
    if (i < N * .22) { const a = R(0, 6.28), r = R(.2, 2.4); x = s3.x + Math.sin(a) * r; z = s3.z + Math.cos(a) * r; y = s3.y + R(.25, 1.8); }
    else if (i < N * .4) { const a = R(0, 6.28), r = R(1, CL.r); x = CL.x + Math.sin(a) * r; z = CL.z + Math.cos(a) * r; y = R(.4, 3); }
    else { z = R(-90, 20); x = px(z) + R(-10, 10); y = gy(x, z) + R(.4, 3.4); }
    pos.set([x, y, z], i * 3); ph[i] = rnd() * 10;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('ph', new THREE.BufferAttribute(ph, 1));
  const pts = new THREE.Points(g, flyMat); pts.frustumCulled = false; scene.add(pts);
}

/* ---------- foglie che cadono attorno alla camera ---------- */
const LEAVES = [];
const leafSet = new THREE.InstancedMesh(leafShape(), toon('#ffffff', {side: THREE.DoubleSide}), LOW ? 50 : 90); leafSet.frustumCulled = false; scene.add(leafSet);
{ const LC = ['#d39a3a', '#b5592d', '#8e8a3a', '#e0b45a'].map(col); for (let i = 0; i < leafSet.count; i++) { leafSet.setColorAt(i, LC[i % 4]); LEAVES.push({p: new THREE.Vector3(R(-6, 6), R(-1, 6), R(-11, -2.8)), v: R(.25, .5), ph: R(0, 9), s: R(.6, 1.1)}); } }

/* ---------- il percorso della camera ---------- */
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const KEYS = [];   // {p, l, sx, sy, len, stop?, hero?}
const port = PORT();
function camAt(s, ang, Dd, lift) {
  const side = Math.sign(s.x - px(s.z)) || 0, d = V3(-side * .8, 0, 1).normalize().applyAxisAngle(V3(0, 1, 0), ang);
  const c = V3(s.x, s.y + s.top + .07 * P, s.z);
  return {p: c.clone().add(d.multiplyScalar(Dd * (port ? 1.5 : 1))).add(V3(0, lift, 0)), l: c};
}
const SX = [.36, .64, .34, .62, .64], DS = [.78, 1, 1, 1, 1];   // DS: quanto sta lontana la camera da ogni candela (GIANNI §20.2: la Kora era piccola nell'angolo)
{
  const s0 = STOPS[0];
  KEYS.push({p: V3(px(34), 19, 36), l: V3(px(-24), -1, -22), len: 110, hero: 1});
  KEYS.push({p: V3(px(22), 12.5, 24), l: V3(px(-12), .4, -12), len: 120});
  KEYS.push({p: V3(px(7), 2.4, 7), l: V3(px(-6), .9, -6), len: 90});
  STOPS.forEach((s, k) => {
    const side = Math.sign(s.x - px(s.z)) || 1;
    const A = camAt(s, .2 * side, 1.85 * DS[k], .32 * DS[k]), B = camAt(s, -.08 * side, 1.5 * DS[k], .24 * DS[k]);
    KEYS.push({...A, sx: SX[k], len: 160, stop: k});
    if (k < 4) {
      const n = STOPS[k + 1];
      const fl = k === 2 ? 48 : 65;   // GIANNI §22: dopo il ponte il prato vuoto durava troppo
      KEYS.push({...B, sx: SX[k], len: fl});
      for (const f of [.3, .66]) { const z = s.z + (n.z - s.z) * f; KEYS.push({p: V3(px(z), gy(px(z), z) + 1.45, z), l: V3(px(z - 6), gy(px(z - 6), z - 6) + .85, z - 6), len: fl}); }
    } else {
      KEYS.push({...B, sx: SX[k], len: 130});
      { const e = V3(s.x + .8, s.y + 4.6, s.z + 7.5); KEYS.push({p: e, l: e.clone().addScaledVector(V3(MOON.x, .18, MOON.z).normalize(), 12), len: 0}); }
    }
  });
}
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
  const y = Math.max(0, -sec.getBoundingClientRect().top / VHP);
  if (!(y >= 0)) return 0;
  for (const s of SEG) if (y < s.y1) return s.i + (y - s.y0) / (s.y1 - s.y0);
  return NK - 1;
}

/* ---------- testi sovrapposti ---------- */
const fine = document.getElementById('uscita'), chaps = [...document.querySelectorAll('.chap')], pathBtns = [...document.querySelectorAll('.path button')], hero = document.getElementById('hero'), pathEl = document.getElementById('path');
pathBtns.forEach(b => b.addEventListener('click', () => {
  const k = +b.dataset.g, i = KEYS.findIndex(x => x.stop === k), s = SEG[i];
  scrollTo({top: sec.offsetTop + (s.y0 + (s.y1 - s.y0) * .25) * VHP, behavior: 'smooth'});
}));

/* ---------- ciclo ---------- */
function size() {
  const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = PORT() ? 52 : 40; camera.updateProjectionMatrix();
  flyMat.uniforms.sc.value = h * renderer.getPixelRatio() / (2 * Math.tan(camera.fov * Math.PI / 360));
}
let cur = Q.has('t') ? +Q.get('t') : 0, active = -2, last = performance.now(), T0 = last, frames = 0, slow = 0;
const tmpP = new THREE.Vector3(), tmpL = new THREE.Vector3(), tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  const r = sec.getBoundingClientRect(); if (r.bottom < -50) { last = now; return; }
  const dt = Math.min(.05, (now - last) / 1000); last = now; const t = (now - T0) / 1000;
  const target = Q.has('t') ? cur : scrollT();
  cur = reduce ? target : cur + (target - cur) * (1 - Math.exp(-dt * 7));
  if (Math.abs(target - cur) < 1e-4) cur = target;
  if (!Number.isFinite(cur)) cur = 0;
  const u = Math.min(1, Math.max(0, cur / (NK - 1)));
  posC.getPoint(u, tmpP); lookC.getPoint(u, tmpL);
  camera.position.copy(tmpP); camera.lookAt(tmpL);
  /* inquadratura: sul computer la candela sta dal lato opposto al testo, sul telefono in alto */
  const i0 = Math.min(NK - 2, Math.floor(cur)), f = cur - i0, k0 = KEYS[i0], k1 = KEYS[i0 + 1];
  const sxv = PORT() ? .5 : (k0.sx ?? .5) + ((k1.sx ?? .5) - (k0.sx ?? .5)) * sstep(0, 1, f);
  const W = cv.width, H = cv.height;
  const syP = PORT() ? .5 + ((k0.sx ? -.16 : 0) + ((k1.sx ? -.16 : 0) - (k0.sx ? -.16 : 0)) * sstep(0, 1, f)) : .5;
  camera.setViewOffset(W, H, (.5 - sxv) * W, (.5 - syP) * H, W, H);
  sky.position.copy(camera.position);
  moon.position.copy(camera.position).addScaledVector(MOON, 420);
  /* la vita del bosco */
  if (!reduce) {
    skyMat.uniforms.t.value = t; waterMat.uniforms.t.value = t; flyMat.uniforms.t.value = t;
    FLAMES.forEach((F, k) => { const a = 1 + .1 * Math.sin(t * 11 + F.ph) + .05 * Math.sin(t * 27 + F.ph * 2); F.o.scale.y = .034 * a; F.o.scale.x = F.o.scale.z = .017 / Math.sqrt(a); F.o.rotation.z = .08 * Math.sin(t * 6 + F.ph); F.i.scale.y = .017 * a; F.s.material.opacity = .85; });
    LIGHTS.forEach(L => L.l.intensity = L.base * (1 + .09 * Math.sin(t * 9 + L.ph) + .05 * Math.sin(t * 23 + L.ph * 3)));
    LEAVES.forEach((L, i) => {
      L.p.y -= L.v * dt; L.p.x += Math.sin(t * .9 + L.ph) * .3 * dt;
      const wp = tmpS.copy(L.p).applyMatrix4(camera.matrixWorld);
      if (L.p.y < -2.5) { L.p.set(R(-5, 5), R(3, 5), R(-11, -2.8)); }
      tmpE.set(t * .8 + L.ph, t * .6 + L.ph * 2, Math.sin(t + L.ph) * .8); tmpQ.setFromEuler(tmpE);
      tmpM.compose(wp, tmpQ, tmpP.set(L.s, L.s, L.s)); leafSet.setMatrixAt(i, tmpM);
    });
    leafSet.instanceMatrix.needsUpdate = true;
  }
  /* i fari: da lontano ogni candela è un punto caldo nel bosco, da vicino si spegne e resta la fiamma */
  BEACONS.forEach(b => { const d = b.position.distanceTo(camera.position); b.material.opacity = sstep(3, 14, d) * .95; b.scale.setScalar(2 + d * .075); });
  renderer.render(scene, camera);
  /* testi */
  const ti = Math.min(NK - 2, Math.floor(cur)), tu = cur - ti, kk = KEYS[ti];
  const inHero = ti === 0 && tu < .6;
  hero.classList.toggle('off', !inHero);
  const act = kk.stop !== undefined && tu > .02 && tu < .96 ? kk.stop : -1;
  if (act !== active) { active = act; chaps.forEach((el, k) => el.classList.toggle('on', k === act)); sec.classList.toggle('parla', act >= 0); }
  if (fine) fine.classList.toggle('on', cur > NK - 2 + .45);
  if (act >= 0) chaps[act].style.setProperty('--u', tu.toFixed(3));
  const y = Math.max(0, -r.top / VHP); pathEl.style.setProperty('--p', Math.min(1, y / TOT).toFixed(4));
  let lastStop = -1; for (let i = 0; i <= ti; i++) if (KEYS[i].stop !== undefined) lastStop = KEYS[i].stop;
  pathBtns.forEach((b, k) => b.classList.toggle('on', k === Math.max(0, lastStop) && !inHero));
  /* qualità: se il telefono fatica si abbassa la risoluzione, una volta sola per gradino */
  frames++; if (dt > .028) slow++;
  if (frames === 90) { if (slow > 40 && DPR > 1) { DPR = Math.max(1, DPR - .4); renderer.setPixelRatio(DPR); size(); } frames = 0; slow = 0; }
}


/* ---------- via ---------- */
layout(); size();
addEventListener('resize', () => { layout(); size(); });
requestAnimationFrame(t => { frame(t); document.getElementById('load').classList.add('done'); const n = document.getElementById('loadN'); if (n) n.textContent = '100%'; });
if (Q.has('debug')) window.__B = {scene, camera, renderer, KEYS, STOPS, SEG, get cur() { return cur; }, set cur(v) { cur = v; }};
