/* Yamat · la candela in 3D, da girare tra le mani.
   Modello ricostruito dalla foto vera del prodotto (TRELLIS.2), poi corretto qui: cemento opaco, cera nel colore scelto,
   stoppino di legno con la fiamma che si accende, sigillo vero della foto proiettato sul coperchio.
   Serve la mappa degli import di three (vedi IMPORTMAP in fondo a prodotto.html).
   Uso: import {mount} from './v3d.js'; mount(sezione, 'kora')  — la sezione contiene <canvas> e i comandi. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';

/* misure prese sul modello (vedi sito-prototipo/3d/LEGGIMI.md) */
/* mat: cemento | cera | carta.  vaso: cera dentro un vaso (centro, raggio interno, bordo, profondità della cera).
   stoppini: dove nasce la fiamma (legno a croce o cotone).  decal: immagini vere proiettate dalla direzione della foto
   (sigillo, etichetta).  cera: colori della cera tra cui scegliere (solo dentro un vaso). */
export const MODELLI = {
  kora: {
    glb: '3d/kora.glb', mat: 'cemento', bottom: -0.3548,
    vaso: { c: [-0.1244, -0.0062], rIn: 0.2387, top: 0.3535, prof: 0.075 },
    stoppini: [{ tipo: 'legno' }],
    decal: [{ img: '3d/kora_sigillo.png', pos: [0.2841, 0.0168, 0.1984], size: 0.30, rot: 0, lucido: true }],
    cera: { 'Caffè': '#5e4130', 'Grigio blu notte': '#3a4250' },
    az: [-55, 125], start: 20,
  },
};

const lerp = (a, b, t) => a + (b - a) * t;

export function mount(root, id, opts = {}) {
  const M = MODELLI[id]; if (!M) return null;
  const cv = root.querySelector('canvas');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touch = matchMedia('(hover: none)').matches;
  const R = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.shot });
  R.setPixelRatio(Math.min(devicePixelRatio || 1, touch ? 1.75 : 2));
  R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.0;
  R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
  const S = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(R); S.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; S.environmentIntensity = 0.32;
  const cam = new THREE.PerspectiveCamera(28, 1, 0.05, 50);

  /* luci: una chiave calda da sinistra, un controluce freddo, il bagliore della fiamma */
  const key = new THREE.DirectionalLight(0xffe2c4, 1.5); key.position.set(-2.2, 3.2, 2.4); key.castShadow = true;
  key.shadow.mapSize.set(touch ? 1024 : 2048, touch ? 1024 : 2048); key.shadow.camera.left = key.shadow.camera.bottom = -1.2; key.shadow.camera.right = key.shadow.camera.top = 1.2; key.shadow.radius = 6; key.shadow.bias = -0.0004;
  S.add(key);
  const rimL = new THREE.DirectionalLight(0x9fb4c8, 0.9); rimL.position.set(2.5, 1.5, -3); S.add(rimL);
  const fire = new THREE.PointLight(0xffa04a, 0, 1.6, 2); fire.castShadow = false; S.add(fire);

  /* pavimento che prende solo l'ombra */
  const fade = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, '#fff'); gr.addColorStop(.55, '#fff'); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c) })();
  const table = new THREE.Mesh(new THREE.CircleGeometry(2.4, 96), new THREE.MeshStandardMaterial({ color: 0x090d0b, roughness: 1, metalness: 0, transparent: true, alphaMap: fade }));
  table.rotation.x = -Math.PI / 2; table.position.y = M.bottom + 0.028; table.receiveShadow = true; S.add(table);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(2.4, 96), new THREE.ShadowMaterial({ opacity: 0.55 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = M.bottom + 0.029; floor.receiveShadow = true; S.add(floor);

  /* granulosità del cemento: rugosità e rilievo da rumore */
  const noiseTex = (() => { const n = 256, c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d'), d = g.createImageData(n, n);
    for (let i = 0; i < n * n; i++) { const v = 128 + (Math.random() - 0.5) * 70; d.data[i * 4] = v; d.data[i * 4 + 1] = v; d.data[i * 4 + 2] = 255; d.data[i * 4 + 3] = 255 }
    g.putImageData(d, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6); return t })();

  const group = new THREE.Group(); S.add(group);
  let waxMat, flameMat, haloMat, bodyMat, lit = false, litK = 0; const flames = [], halos = [];

  const ready = new Promise((res, rej) => {
    const L = new GLTFLoader(); L.setMeshoptDecoder(MeshoptDecoder);
    L.load(M.glb, g => {
      let mesh; g.scene.traverse(o => { if (o.isMesh) mesh = o });
      const old = mesh.material;
      bodyMat = M.mat === 'cera'
        ? new THREE.MeshPhysicalMaterial({ map: old.map, roughness: 0.58, metalness: 0, sheen: 0.7, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xfff1dc), clearcoat: 0.12, clearcoatRoughness: 0.6 })
        : new THREE.MeshStandardMaterial({ map: old.map, roughness: M.mat === 'carta' ? 0.82 : 0.92, metalness: 0, normalMap: noiseTex, normalScale: new THREE.Vector2(M.mat === 'carta' ? 0.06 : 0.18, M.mat === 'carta' ? 0.06 : 0.18), envMapIntensity: 0.9 });
      mesh.material = bodyMat; mesh.castShadow = true; mesh.receiveShadow = true; group.add(g.scene); g.scene.updateMatrixWorld(true);

      /* cera dentro il vaso */
      let waxY = null;
      if (M.vaso) { const V = M.vaso, r = V.rIn * 0.985; waxY = V.top - V.prof;
        waxMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(M.cera ? Object.values(M.cera)[0] : '#efe6d2'), roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.5, sheen: 0.4, sheenRoughness: 0.6 });
        const wax = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.03, 128), waxMat); wax.position.set(V.c[0], waxY - 0.015, V.c[1]); wax.receiveShadow = true; group.add(wax) }

      /* stoppini e fiamme */
      const wood = new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.85 }), burnt = new THREE.MeshStandardMaterial({ color: 0x120c08, roughness: 1 }),
        cotton = new THREE.MeshStandardMaterial({ color: 0xe9e2d4, roughness: 0.9 });
      flameMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { t: { value: 0 }, k: { value: 0 } },
        vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: `uniform float t,k;varying vec2 vUv;
          void main(){float y=vUv.y;float x=vUv.x-.5;
            x+=sin(t*6.1+y*4.)*.03*y*y+sin(t*11.3+1.7)*.012*y;          // la punta ondeggia, la base resta ferma
            float hgt=.92+.06*sin(t*8.7)+.04*sin(t*17.3);
            float yy=y/hgt;
            float w=.30*pow(clamp(yy*4.,0.,1.),.5)*pow(clamp(1.-yy,0.,1.),1.15);   // goccia: larga in basso, a punta in alto
            float shape=smoothstep(w,w*.25,abs(x))*step(yy,1.);
            float core=smoothstep(w*.55,0.,abs(x))*smoothstep(.04,.16,yy)*smoothstep(.62,.25,yy);
            vec3 c=mix(vec3(1.,.42,.06),vec3(1.,.78,.38),smoothstep(.0,.7,shape))+core*vec3(.9,.85,.7);
            float blue=smoothstep(.12,.0,yy)*smoothstep(w*1.3,0.,abs(x));c=mix(c,vec3(.25,.4,1.),blue*.75);
            float a=shape*(1.-.55*blue);
            gl_FragColor=vec4(c*a,a*k);}` });
      haloMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { k: { value: 0 } },
        vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: 'uniform float k;varying vec2 vUv;void main(){float d=length(vUv-.5)*2.;float a=pow(max(0.,1.-d),2.6)*.35*k;gl_FragColor=vec4(vec3(1.,.62,.25)*a,a);}' });
      const fp = new THREE.Vector3();
      (M.stoppini || []).forEach(W => {
        const x = W.x ?? M.vaso.c[0], z = W.z ?? M.vaso.c[1], y = W.y ?? waxY, k = W.scala || 1;
        const wick = new THREE.Group();
        if (W.tipo === 'legno') { const w1 = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.06, 0.007), wood), w2 = w1.clone(); w2.rotation.y = Math.PI / 2;
          const tip = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.012, 0.0072), burnt); tip.position.y = 0.03; const tip2 = tip.clone(); tip2.rotation.y = Math.PI / 2; wick.add(w1, w2, tip, tip2); wick.position.set(x, y + 0.03, z) }
        else { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.05, 8), cotton), tip = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.012, 8), burnt); tip.position.y = 0.025; c.add(tip); c.rotation.z = 0.12; wick.add(c); wick.position.set(x, y + 0.025, z) }
        wick.scale.setScalar(k); wick.traverse(o => { if (o.isMesh) o.castShadow = true }); if (!W.nascosto) group.add(wick);
        const fy = y + (W.tipo === 'legno' ? 0.058 : 0.05) * k + 0.1 * k;
        const f = new THREE.Mesh(new THREE.PlaneGeometry(0.13 * k, 0.2 * k), flameMat); f.position.set(x, fy, z); group.add(f); flames.push(f);
        const h = new THREE.Mesh(new THREE.PlaneGeometry(0.7 * k, 0.7 * k), haloMat); h.position.set(x, fy - 0.02 * k, z); group.add(h); halos.push(h);
        fp.add(new THREE.Vector3(x, fy, z)) });
      if (flames.length) { fp.divideScalar(flames.length); fire.position.copy(fp) }

      /* immagini vere (sigillo, etichetta) proiettate dalla stessa direzione della foto */
      (M.decal || []).forEach(D => new THREE.TextureLoader().load(D.img, tx => { tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8;
        const dm = new THREE.MeshStandardMaterial({ map: tx, transparent: true, roughness: D.lucido ? 0.38 : 0.8, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
        const sz = Array.isArray(D.size) ? new THREE.Vector3(...D.size) : new THREE.Vector3(D.size, D.size, 0.22);
        const dg = new DecalGeometry(mesh, new THREE.Vector3(...D.pos), new THREE.Euler(0, 0, D.rot || 0), sz);
        const d = new THREE.Mesh(dg, dm); d.receiveShadow = true; group.add(d); draw() }));
      res(); draw();
    }, undefined, rej);
  });

  /* camera: lo scorrimento gira la candela, il dito o il mouse la girano ancora */
  let prog = 0, drag = 0, dragT = 0, az = M.start, el = 14, dist = 2.6, raf = 0, running = false, t0 = performance.now();
  const size = () => { const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return; R.setSize(w, h, false); cam.aspect = w / h;
    /* distanza: la candela (con coperchio e fiamma) deve stare tutta nello schermo, sia in altezza sia in larghezza */
    const th = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    dist = Math.max(0.74 / th, (cam.aspect < 0.8 ? 0.6 : 0.62) / (th * cam.aspect));
    /* sul computer la candela sta a destra del testo; sul telefono sale nella metà alta */
    if (cam.aspect > 1.1) cam.setViewOffset(w, h, -w * 0.16, 0, w, h); else if (cam.aspect < 0.8) cam.setViewOffset(w, h, 0, h * 0.17, w, h); else cam.clearViewOffset();
    cam.updateProjectionMatrix(); draw() };
  const place = () => { const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
    cam.position.set(Math.sin(a) * Math.cos(e) * dist, Math.sin(e) * dist + 0.02, Math.cos(a) * Math.cos(e) * dist); cam.lookAt(0, -0.02, 0) };
  function frame(now) {
    const t = (now - t0) / 1000;
    const tgtAz = THREE.MathUtils.clamp(lerp(M.az[0] + 40, M.az[1] - 20, prog) + dragT, M.az[0], M.az[1]);
    az = lerp(az, tgtAz, reduce ? 1 : 0.075); el = lerp(el, lerp(15, 28, prog), 0.06);
    litK = lerp(litK, lit ? 1 : 0, 0.06);
    if (flames.length) { flameMat.uniforms.t.value = t; flameMat.uniforms.k.value = litK; haloMat.uniforms.k.value = litK;
      flames.forEach(f => { f.visible = litK > 0.01; f.quaternion.copy(cam.quaternion) }); halos.forEach(h => { h.visible = litK > 0.01; h.quaternion.copy(cam.quaternion) }); // la fiamma guarda sempre chi la guarda
      const fl = 1 + Math.sin(t * 9.1) * 0.07 + Math.sin(t * 15.7) * 0.05 + Math.sin(t * 3.3) * 0.05;
      fire.intensity = litK * 0.75 * fl * Math.sqrt(flames.length);
      if (waxMat) waxMat.emissive.setRGB(0.55, 0.3, 0.12).multiplyScalar(litK * 0.1 * fl);
      if (M.mat === 'cera') bodyMat.emissive.setRGB(0.5, 0.26, 0.08).multiplyScalar(litK * 0.06 * fl);
      R.toneMappingExposure = 1 - litK * 0.08 }
    place(); R.render(S, cam);
    const moving = Math.abs(az - tgtAz) > 0.02 || litK > 0.005 && litK < 0.995 || lit;
    if (running && (moving || !reduce && lit)) raf = requestAnimationFrame(frame); else raf = 0;
  }
  const draw = () => { if (!raf) raf = requestAnimationFrame(frame) };
  addEventListener('resize', size); size();

  /* trascinare per girarla (in orizzontale: lo scorrimento della pagina resta libero) */
  let sx = null;
  cv.addEventListener('pointerdown', e => { sx = e.clientX; cv.setPointerCapture(e.pointerId); root.classList.add('grab') });
  cv.addEventListener('pointermove', e => { if (sx === null) return; dragT += (e.clientX - sx) * -0.35; sx = e.clientX; dragT = THREE.MathUtils.clamp(dragT, -120, 120); draw() });
  const up = () => { sx = null; root.classList.remove('grab') }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

  const api = {
    ready,
    setProgress(p) { prog = THREE.MathUtils.clamp(p, 0, 1); draw() },
    setLit(v) { lit = v; draw() },
    setWax(name) { if (waxMat && M.cera && M.cera[name]) { waxMat.color.set(M.cera[name]); draw() } },
    hasFire: () => !!(M.stoppini && M.stoppini.length),
    setRunning(v) { running = v; if (v) draw() },
    view(a, e, l) { az = a; el = e; dragT = 0; prog = 0; M.az = [a, a]; if (l !== undefined) { lit = l; litK = l ? 1 : 0 } frame(performance.now()) },
    renderer: R,
  };
  return api;
}
