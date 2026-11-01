import * as THREE from 'three';
import { ARENA_RADIUS, TOWER_RADIUS, PLAY_RADIUS, ELEMENTS, ELEMENT_IDS, CENTER_RADIUS } from './config.js';
import { toonMaterial, addInkOutlines } from './toon.js';

const TAU = Math.PI * 2;

/* ---------------------------------- utils --------------------------------- */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas2d(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

let _glow = null;
export function glowTexture() {
  if (_glow) return _glow;
  const [c, ctx] = canvas2d(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.92)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.32)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  _glow = new THREE.CanvasTexture(c);
  _glow.colorSpace = THREE.SRGBColorSpace;
  return _glow;
}

function makeRuneTexture(size = 512, seed = 7, rings = 3) {
  const [c, ctx] = canvas2d(size, size);
  const rand = mulberry32(seed);
  const r = size / 2;
  ctx.translate(r, r);
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.shadowColor = 'rgba(255,255,255,0.9)';
  ctx.shadowBlur = 12;
  ctx.lineWidth = 2.2;
  for (let ring = 0; ring < rings; ring++) {
    const rad = r * (0.3 + ring * 0.21);
    ctx.globalAlpha = 1 - ring * 0.2;
    ctx.beginPath();
    ctx.arc(0, 0, rad, 0, TAU);
    ctx.stroke();
    const count = 12 + ring * 8;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + rand() * 0.1;
      const rr = rad + (ring % 2 === 0 ? -13 : 13);
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.beginPath();
      const s = 4 + rand() * 4;
      const kind = Math.floor(rand() * 4);
      if (kind === 0) { ctx.moveTo(-s, -s); ctx.lineTo(s, s); ctx.moveTo(s, -s); ctx.lineTo(-s, s); }
      if (kind === 1) { ctx.moveTo(0, -s); ctx.lineTo(0, s); ctx.moveTo(-s, 0); ctx.lineTo(s, 0); }
      if (kind === 2) { ctx.moveTo(-s, 0); ctx.lineTo(0, -s); ctx.lineTo(s, 0); }
      if (kind === 3) { ctx.arc(0, 0, s * 0.7, 0, TAU); }
      ctx.stroke();
      ctx.restore();
    }
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function colorForQuadrant(angle, palette) {
  // smooth angular weights over four cardinal directions
  let total = 0;
  const weights = {};
  for (const id of ELEMENT_IDS) {
    const w = Math.pow(Math.max(0, Math.cos(angle - ELEMENTS[id].angle)), 3.2);
    weights[id] = w;
    total += w;
  }
  if (total < 1e-5) return palette.neutral;
  const out = palette.neutral.clone();
  for (const id of ELEMENT_IDS) out.lerp(palette[id], (weights[id] / total) * 0.88);
  return out;
}

/* --------------------------------- world ---------------------------------- */

export function createWorld(scene) {
  const group = new THREE.Group();
  group.name = 'world';
  scene.add(group);

  const glow = glowTexture();
  const updaters = [];
  const timeState = { t: 0 };
  const rand = mulberry32(1337);

  /* sky */
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vDir;
      uniform float uTime;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y * 0.68 + 0.46, 0.0, 1.0);
        vec3 low = vec3(1.0, 0.86, 0.64);
        vec3 mid = vec3(0.64, 0.83, 0.96);
        vec3 top = vec3(0.24, 0.51, 0.87);
        vec3 col = mix(low, mid, smoothstep(0.02, 0.4, h));
        col = mix(col, top, smoothstep(0.4, 0.96, h));

        /* painterly sun */
        vec3 sunDir = normalize(vec3(-0.4, 0.28, -0.65));
        float sun = pow(max(0.0, dot(d, sunDir)), 28.0);
        float sunGlow = pow(max(0.0, dot(d, sunDir)), 5.0);
        col += vec3(1.0, 0.86, 0.55) * sun * 0.5;
        col += vec3(1.0, 0.92, 0.72) * sunGlow * 0.16;

        /* wide, soft cloud bands */
        float band = sin(d.x * 4.6 + d.z * 2.4 + uTime * 0.008) * sin(d.z * 5.4 - d.x * 1.8 - uTime * 0.006);
        float cloud = smoothstep(0.28, 0.82, band) * smoothstep(0.04, 0.5, h) * (1.0 - smoothstep(0.72, 1.0, h));
        col = mix(col, vec3(1.0, 0.98, 0.92), cloud * 0.34);
        float wisp = smoothstep(0.58, 0.95, sin(d.x * 9.0 - d.z * 3.2 + uTime * 0.01));
        col = mix(col, vec3(1.0, 0.99, 0.95), wisp * 0.1 * smoothstep(0.08, 0.4, h));
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(250, 32, 20), skyMat);
  sky.frustumCulled = false;
  group.add(sky);
  updaters.push((t) => { skyMat.uniforms.uTime.value = t; });

  /* stars */
  const starCount = 1100;
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(starCount * 3);
  const starCol = new Float32Array(starCount * 3);
  const starPalette = [new THREE.Color(0xdfe8ff), new THREE.Color(0xbcd4ff), new THREE.Color(0xffe8c0), new THREE.Color(0xcdb8ff)];
  for (let i = 0; i < starCount; i++) {
    const u = rand() * TAU;
    const v = Math.acos(2 * rand() - 1);
    const r = 150 + rand() * 70;
    starPos[i * 3] = Math.sin(v) * Math.cos(u) * r;
    starPos[i * 3 + 1] = Math.cos(v) * r * 0.8 + 28;
    starPos[i * 3 + 2] = Math.sin(v) * Math.sin(u) * r;
    const c = starPalette[Math.floor(rand() * starPalette.length)];
    starCol[i * 3] = c.r;
    starCol[i * 3 + 1] = c.g;
    starCol[i * 3 + 2] = c.b;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
  const starMat = new THREE.PointsMaterial({
    size: 1.35,
    map: glow,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    fog: false
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  stars.visible = false;
  group.add(stars);

  /* lights */
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0xb08a5e, 1.9);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff2cf, 2.35);
  key.position.set(-30, 46, 20);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -48;
  key.shadow.camera.right = 48;
  key.shadow.camera.top = 48;
  key.shadow.camera.bottom = -48;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 130;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x86b5ff, 0.42);
  rim.position.set(26, 18, -38);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffc48d, 0.3);
  fill.position.set(10, 8, 30);
  scene.add(fill);

  /* arena base */
  const rockMat = toonMaterial({ color: 0x8c785d });
  const rockMat2 = toonMaterial({ color: 0xa38e6d });
  const rockMat3 = toonMaterial({ color: 0x79684f });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(ARENA_RADIUS + 0.5, ARENA_RADIUS - 3.5, 4.2, 72, 1), rockMat);
  base.position.y = -2.1;
  base.receiveShadow = true;
  group.add(base);

  const under = new THREE.Mesh(new THREE.CylinderGeometry(ARENA_RADIUS - 3, 16, 16, 9, 1), rockMat);
  under.position.y = -12.2;
  under.rotation.y = 0.2;
  group.add(under);

  /* arena top vertex-coloured disc */
  const palette = {
    neutral: new THREE.Color(0xc8b48d),
    fire: new THREE.Color(0xc36a46),
    water: new THREE.Color(0x4c96a8),
    earth: new THREE.Color(0x7d8c4b),
    air: new THREE.Color(0x8c7eb9)
  };
  const discGeo = new THREE.CircleGeometry(ARENA_RADIUS, 224);
  discGeo.rotateX(-Math.PI / 2);
  const dpos = discGeo.attributes.position;
  const dcol = new Float32Array(dpos.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < dpos.count; i++) {
    const x = dpos.getX(i);
    const z = dpos.getZ(i);
    const r = Math.hypot(x, z);
    const a = Math.atan2(z, x);
    tmp.copy(colorForQuadrant(a, palette));
    const outer = THREE.MathUtils.smoothstep(r, 6, 33);
    tmp.lerp(palette.neutral, (1 - outer) * 0.55);
    const n = Math.sin(x * 1.7 + z * 2.3) * Math.cos(x * 0.7 - z * 1.1);
    tmp.multiplyScalar(0.94 + n * 0.05);
    if (r > ARENA_RADIUS - 1.5) tmp.multiplyScalar(0.82);
    dcol[i * 3] = tmp.r;
    dcol[i * 3 + 1] = tmp.g;
    dcol[i * 3 + 2] = tmp.b;
  }
  discGeo.setAttribute('color', new THREE.BufferAttribute(dcol, 3));
  const discMat = toonMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.1 });
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.position.y = 0.02;
  disc.receiveShadow = true;
  group.add(disc);

  /* rim */
  const rimMat = toonMaterial({ color: 0x9a7a4f, emissive: 0x4a3214, emissiveIntensity: 0.2 });
  const rimRing = new THREE.Mesh(new THREE.TorusGeometry(ARENA_RADIUS - 0.5, 0.28, 6, 120), rimMat);
  rimRing.rotation.x = Math.PI / 2;
  rimRing.position.y = 0.12;
  group.add(rimRing);

  const innerRingMat = new THREE.MeshBasicMaterial({ color: 0xe7c583, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false });
  const innerRing = new THREE.Mesh(new THREE.RingGeometry(PLAY_RADIUS - 0.18, PLAY_RADIUS, 128), innerRingMat);
  innerRing.rotation.x = -Math.PI / 2;
  innerRing.position.y = 0.045;
  group.add(innerRing);

  /* boundary runes */
  const tickMat = new THREE.MeshBasicMaterial({ color: 0xd8b978, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false });
  const tickGeo = new THREE.BoxGeometry(0.1, 0.02, 0.85);
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * TAU;
    const m = new THREE.Mesh(tickGeo, tickMat);
    m.position.set(Math.cos(a) * (PLAY_RADIUS - 0.2), 0.06, Math.sin(a) * (PLAY_RADIUS - 0.2));
    m.rotation.y = -a;
    m.scale.z = i % 4 === 0 ? 1.5 : 0.8;
    group.add(m);
  }

  /* central dais */
  const daisMat = toonMaterial({ color: 0xb9a27b });
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(CENTER_RADIUS, CENTER_RADIUS + 0.6, 0.55, 64), daisMat);
  dais.position.y = 0.275;
  dais.receiveShadow = true;
  dais.castShadow = true;
  group.add(dais);
  const daisRingMat = new THREE.MeshBasicMaterial({ color: 0xe9ca8b, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const rad of [CENTER_RADIUS - 0.4, 6.4, 3.2]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(rad, rad > 8 ? 0.1 : 0.06, 4, 96), daisRingMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.58;
    group.add(ring);
  }

  const runeTex = makeRuneTexture(512, 11, 3);
  const runeMat = new THREE.MeshBasicMaterial({ map: runeTex, color: 0xffdcaa, transparent: true, opacity: 0.62, blending: THREE.AdditiveBlending, depthWrite: false });
  const runePlane = new THREE.Mesh(new THREE.PlaneGeometry(CENTER_RADIUS * 1.86, CENTER_RADIUS * 1.86), runeMat);
  runePlane.rotation.x = -Math.PI / 2;
  runePlane.position.y = 0.585;
  group.add(runePlane);
  const runeTex2 = makeRuneTexture(512, 23, 2);
  const runeMat2 = new THREE.MeshBasicMaterial({ map: runeTex2, color: 0x9fdcff, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false });
  const runePlane2 = new THREE.Mesh(new THREE.PlaneGeometry(12.5, 12.5), runeMat2);
  runePlane2.rotation.x = -Math.PI / 2;
  runePlane2.position.y = 0.592;
  group.add(runePlane2);
  updaters.push((t, dt) => {
    runePlane.rotation.z -= dt * 0.045;
    runePlane2.rotation.z += dt * 0.075;
    runeMat.opacity = 0.52 + Math.sin(t * 1.25) * 0.1;
    runeMat2.opacity = 0.26 + Math.sin(t * 1.7 + 2) * 0.08;
  });

  /* centre crystal */
  const coreMat = toonMaterial({ color: 0xeafaff, emissive: 0x86d7ff, emissiveIntensity: 1.15 });
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.85, 0), coreMat);
  core.position.y = 2.1;
  core.castShadow = true;
  group.add(core);
  const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0x9adfff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
  coreGlow.scale.set(4.5, 4.5, 1);
  coreGlow.position.y = 2.1;
  group.add(coreGlow);
  const coreLight = new THREE.PointLight(0x8fdcff, 14, 22, 2);
  coreLight.position.y = 2.4;
  group.add(coreLight);
  updaters.push((t, dt) => {
    core.rotation.y += dt * 0.7;
    core.rotation.x = Math.sin(t * 0.8) * 0.22;
    core.position.y = 2.1 + Math.sin(t * 1.4) * 0.14;
    coreGlow.position.y = core.position.y;
    coreGlow.material.opacity = 0.62 + Math.sin(t * 2) * 0.12;
    coreLight.intensity = 12 + Math.sin(t * 2.2) * 3;
  });

  /* energy spokes from centre to each tower */
  for (const id of ELEMENT_IDS) {
    const el = ELEMENTS[id];
    const dir = new THREE.Vector3(Math.cos(el.angle), 0, Math.sin(el.angle));
    const len = 12.5;
    const mat = new THREE.MeshBasicMaterial({ color: el.color, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false });
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.03, len), mat);
    spoke.position.copy(dir).multiplyScalar(10.8 + len / 2);
    spoke.position.y = 0.05;
    spoke.rotation.y = Math.atan2(dir.x, dir.z);
    group.add(spoke);
    const rune = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.55, 32), new THREE.MeshBasicMaterial({ color: el.color, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }));
    rune.rotation.x = -Math.PI / 2;
    rune.position.copy(dir).multiplyScalar(10.5);
    rune.position.y = 0.07;
    group.add(rune);
    updaters.push((t) => {
      mat.opacity = 0.09 + Math.sin(t * 1.3 + el.angle) * 0.045;
      rune.scale.setScalar(1 + Math.sin(t * 1.6 + el.angle) * 0.08);
    });
  }

  /* rocks and crystals */
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const crystalGeo = new THREE.OctahedronGeometry(1, 0);
  const mossMat = toonMaterial({ color: 0x6f8e42 });
  const rockMaterials = [rockMat2, rockMat3];
  const sectorStart = -Math.PI / 2;

  function safeSpot(r, a, minCenter = 11.6) {
    if (r < minCenter) return false;
    for (const id of ELEMENT_IDS) {
      const el = ELEMENTS[id];
      const tx = Math.cos(el.angle) * 26;
      const tz = Math.sin(el.angle) * 26;
      if (Math.hypot(Math.cos(a) * r - tx, Math.sin(a) * r - tz) < 7.5) return false;
    }
    return true;
  }

  for (let i = 0; i < 38; i++) {
    let a, r;
    do { a = rand() * TAU; r = 12 + rand() * 23; } while (!safeSpot(r, a, 12.5));
    const s = 0.5 + rand() * 1.9;
    const rock = new THREE.Mesh(rockGeo, rockMaterials[i % 2]);
    rock.position.set(Math.cos(a) * r, 0.16 + s * 0.24, Math.sin(a) * r);
    rock.scale.set(s * (0.8 + rand() * 0.7), s * (0.5 + rand() * 0.65), s * (0.8 + rand() * 0.7));
    rock.rotation.set(rand() * 0.4, rand() * TAU, rand() * 0.4);
    rock.castShadow = s > 1.2;
    rock.receiveShadow = true;
    group.add(rock);
    if (rand() > 0.55) {
      const moss = new THREE.Mesh(rockGeo, mossMat);
      moss.position.copy(rock.position).add(new THREE.Vector3(0, s * 0.28, 0));
      moss.scale.copy(rock.scale).multiplyScalar(0.82);
      moss.rotation.copy(rock.rotation);
      group.add(moss);
    }
  }

  /* outer jagged rim */
  for (let i = 0; i < 56; i++) {
    const a = (i / 56) * TAU + (rand() - 0.5) * 0.08;
    const r = 38.4 + rand() * 2.8;
    const s = 0.9 + rand() * 2.6;
    const rock = new THREE.Mesh(rockGeo, i % 3 === 0 ? rockMat3 : rockMat);
    rock.position.set(Math.cos(a) * r, -0.4 + rand() * 1.4, Math.sin(a) * r);
    rock.scale.set(s, s * (0.7 + rand() * 0.9), s);
    rock.rotation.set(rand() * TAU, rand() * TAU, rand() * TAU);
    group.add(rock);
  }

  /* quadrant decoration props */
  const props = { fire: [], water: [], earth: [], air: [] };

  // FIRE — lava cracks, obsidian spikes, embers
  {
    const lavaMat = new THREE.MeshBasicMaterial({ color: 0xff5a18, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let k = 0; k < 5; k++) {
      const baseA = ELEMENTS.fire.angle + (rand() - 0.5) * 1.2;
      const startR = 13 + rand() * 5;
      const pts = [];
      let a = baseA;
      let r = startR;
      for (let i = 0; i < 5; i++) {
        a += (rand() - 0.5) * 0.16;
        r += 2.2 + rand() * 2.2;
        pts.push(new THREE.Vector3(Math.cos(a) * r, 0.07, Math.sin(a) * r));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.09 + rand() * 0.09, 4, false), lavaMat);
      group.add(tube);
      props.fire.push({ mesh: tube, base: 0.55 + rand() * 0.4, speed: 0.8 + rand() });
    }
    for (let k = 0; k < 7; k++) {
      const a = ELEMENTS.fire.angle + (rand() - 0.5) * 1.25;
      const r = 19 + rand() * 14;
      const h = 1.5 + rand() * 4.2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.55 + rand() * 0.7, h, 5), rockMat);
      spike.position.set(Math.cos(a) * r, h / 2 - 0.1, Math.sin(a) * r);
      spike.rotation.z = (rand() - 0.5) * 0.35;
      spike.castShadow = true;
      group.add(spike);
    }
  }

  // WATER — tide pool, ice crystals, ripples
  {
    const poolA = ELEMENTS.water.angle - 0.5;
    const poolR = 21;
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(5.2, 48),
      toonMaterial({ color: 0x3d9cb6, emissive: 0x1b6d83, emissiveIntensity: 0.28, transparent: true, opacity: 0.8 })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(Math.cos(poolA) * poolR, 0.08, Math.sin(poolA) * poolR);
    group.add(pool);
    for (let k = 0; k < 3; k++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.4, 1.52, 48),
        new THREE.MeshBasicMaterial({ color: 0x9fefff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(pool.position).setY(0.1);
      group.add(ring);
      props.water.push({ mesh: ring, phase: k / 3 });
    }
    for (let k = 0; k < 8; k++) {
      const a = ELEMENTS.water.angle + (rand() - 0.5) * 1.3;
      const r = 17 + rand() * 15;
      const h = 0.8 + rand() * 2.6;
      const ice = new THREE.Mesh(new THREE.OctahedronGeometry(h * 0.45, 0), toonMaterial({ color: 0xc4f5ff, emissive: 0x2b9fc4, emissiveIntensity: 0.35, transparent: true, opacity: 0.88 }));
      ice.position.set(Math.cos(a) * r, h * 0.36, Math.sin(a) * r);
      ice.scale.y = 1.6 + rand() * 1.4;
      ice.rotation.y = rand() * TAU;
      ice.castShadow = true;
      group.add(ice);
    }
  }

  // EARTH — mossy standing stones, green crystals
  {
    for (let k = 0; k < 6; k++) {
      const a = ELEMENTS.earth.angle + (rand() - 0.5) * 1.2;
      const r = 18 + rand() * 14;
      const h = 2.2 + rand() * 3.6;
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.6 + rand() * 0.5, 1.1 + rand() * 0.7, h, 6), rockMat3);
      stone.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
      stone.rotation.y = rand() * TAU;
      stone.rotation.z = (rand() - 0.5) * 0.16;
      stone.castShadow = true;
      group.add(stone);
      const moss = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 0), mossMat);
      moss.position.copy(stone.position).add(new THREE.Vector3(0, h * 0.38, 0));
      moss.scale.set(1.1, 0.4, 1.1);
      group.add(moss);
    }
    for (let k = 0; k < 6; k++) {
      const a = ELEMENTS.earth.angle + (rand() - 0.5) * 1.3;
      const r = 15 + rand() * 16;
      const crystal = new THREE.Mesh(crystalGeo, toonMaterial({ color: 0xc8ee89, emissive: 0x74c22e, emissiveIntensity: 0.55 }));
      crystal.position.set(Math.cos(a) * r, 0.6 + rand() * 0.8, Math.sin(a) * r);
      crystal.scale.set(0.35, 1.4 + rand(), 0.35);
      crystal.rotation.z = (rand() - 0.5) * 0.7;
      crystal.castShadow = true;
      group.add(crystal);
      const glowS = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0x9ee85a, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }));
      glowS.position.copy(crystal.position);
      glowS.scale.set(2.4, 2.4, 1);
      group.add(glowS);
    }
  }

  // AIR — floating stones, wind arcs
  {
    for (let k = 0; k < 8; k++) {
      const a = ELEMENTS.air.angle + (rand() - 0.5) * 1.35;
      const r = 15 + rand() * 16;
      const s = 0.5 + rand() * 1.3;
      const stone = new THREE.Mesh(rockGeo, rockMat3);
      stone.position.set(Math.cos(a) * r, 2 + rand() * 7, Math.sin(a) * r);
      stone.scale.set(s, s * 0.7, s);
      stone.rotation.set(rand() * TAU, rand() * TAU, rand() * TAU);
      group.add(stone);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xcbb4ff, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.position.copy(stone.position);
      halo.scale.set(2 + s * 2, 2 + s * 2, 1);
      group.add(halo);
      props.air.push({ mesh: stone, halo, baseY: stone.position.y, phase: rand() * TAU, amp: 0.4 + rand() * 0.9, spin: (rand() - 0.5) * 0.5 });
    }
    for (let k = 0; k < 3; k++) {
      const a = ELEMENTS.air.angle + (rand() - 0.5) * 1.1;
      const r = 20 + rand() * 8;
      const wind = new THREE.Mesh(
        new THREE.TorusGeometry(3 + rand() * 2, 0.045, 4, 48, Math.PI * 1.25),
        new THREE.MeshBasicMaterial({ color: 0xd8c9ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      );
      wind.position.set(Math.cos(a) * r, 4 + rand() * 4, Math.sin(a) * r);
      wind.rotation.set(rand() * TAU, rand() * TAU, rand() * TAU);
      group.add(wind);
      props.air.push({ mesh: wind, wind: true, phase: rand() * TAU, spin: 0.25 + rand() * 0.35 });
    }
  }

  /* floating outer islands */
  const islands = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + rand() * 0.5;
    const r = 52 + rand() * 38;
    const island = new THREE.Group();
    const body = new THREE.Mesh(new THREE.ConeGeometry(3.4 + rand() * 3, 6 + rand() * 7, 5, 1), rockMat);
    body.rotation.x = Math.PI;
    island.add(body);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(3.5 + rand() * 2.5, 2.4, 1.2, 6), rockMat2);
    cap.position.y = 1.2;
    island.add(cap);
    const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.55 + rand() * 0.6, 0), toonMaterial({ color: 0xcfe8ff, emissive: ELEMENTS[ELEMENT_IDS[i % 4]].color, emissiveIntensity: 1.4, flatShading: true }));
    shard.position.y = 2.1;
    island.add(shard);
    island.position.set(Math.cos(a) * r, -7 - rand() * 17, Math.sin(a) * r);
    island.rotation.y = rand() * TAU;
    island.scale.setScalar(0.8 + rand() * 1.2);
    group.add(island);
    islands.push({ group: island, baseY: island.position.y, phase: rand() * TAU, shard });
  }

  /* ambient element motes */
  const moteLayers = [];
  for (const id of ELEMENT_IDS) {
    const el = ELEMENTS[id];
    const count = 90;
    const positions = new Float32Array(count * 3);
    const data = [];
    for (let i = 0; i < count; i++) {
      const a = el.angle + (rand() - 0.5) * 1.35;
      const r = 13 + rand() * 21;
      const y = rand() * 10;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(a) * r;
      data.push({ a, r, y, speed: 0.35 + rand() * 0.9, swirl: (rand() - 0.5) * 0.12, drift: (rand() - 0.5) * 0.1 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      size: id === 'earth' ? 0.42 : 0.52,
      color: el.color,
      map: glow,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    group.add(points);
    moteLayers.push({ id, points, data, positions, count, mat });
  }

  /* distant drifting cloud veils */
  const cloudMat = new THREE.SpriteMaterial({ map: glow, color: 0x394b7e, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Sprite(cloudMat.clone());
    s.position.set((rand() - 0.5) * 180, -14 + rand() * 16, (rand() - 0.5) * 180);
    s.scale.set(30 + rand() * 50, 10 + rand() * 16, 1);
    s.material.opacity = 0.05 + rand() * 0.07;
    group.add(s);
    islands.push({ group: s, baseY: s.position.y, phase: rand() * TAU, cloud: true });
  }

  /* update loop */
  function update(time, dt) {
    timeState.t = time;
    for (const fn of updaters) fn(time, dt);

    for (const p of props.fire) {
      const s = 0.75 + Math.sin(time * p.speed * 1.8 + p.base * 7) * 0.22;
      p.mesh.material.opacity = 0.58 + s * 0.22;
    }
    for (const p of props.water) {
      const k = ((time * 0.22 + p.phase) % 1);
      p.mesh.scale.setScalar(0.55 + k * 3.2);
      p.mesh.material.opacity = 0.45 * (1 - k);
    }
    for (const p of props.air) {
      if (p.wind) {
        p.mesh.rotation.z += dt * p.spin;
        p.mesh.rotation.y += dt * p.spin * 0.5;
        p.mesh.material.opacity = 0.12 + (Math.sin(time * 0.7 + p.phase) * 0.5 + 0.5) * 0.18;
      } else {
        p.mesh.position.y = p.baseY + Math.sin(time * 0.5 + p.phase) * p.amp;
        p.mesh.rotation.y += dt * p.spin;
        p.halo.position.y = p.mesh.position.y;
        p.halo.material.opacity = 0.14 + (Math.sin(time * 0.9 + p.phase) * 0.5 + 0.5) * 0.12;
      }
    }
    for (const isl of islands) {
      isl.group.position.y = isl.baseY + Math.sin(time * 0.28 + isl.phase) * (isl.cloud ? 0.8 : 1.4);
      if (isl.shard) isl.shard.rotation.y += dt * 0.6;
      if (isl.cloud) isl.group.position.x += Math.sin(time * 0.05 + isl.phase) * dt * 0.3;
    }
    for (const layer of moteLayers) {
      const arr = layer.positions;
      for (let i = 0; i < layer.count; i++) {
        const d = layer.data[i];
        d.y += d.speed * dt;
        d.a += d.swirl * dt;
        d.r += d.drift * dt * 4;
        if (d.y > 11.5) { d.y = 0.4; d.a = ELEMENTS[layer.id].angle + (rand() - 0.5) * 1.35; d.r = 13 + rand() * 21; }
        if (d.r < 11) d.r = 11;
        if (d.r > 34) d.r = 34;
        arr[i * 3] = Math.cos(d.a) * d.r;
        arr[i * 3 + 1] = d.y;
        arr[i * 3 + 2] = Math.sin(d.a) * d.r;
      }
      layer.points.geometry.attributes.position.needsUpdate = true;
      layer.mat.opacity = 0.5 + Math.sin(time * 1.1 + ELEMENTS[layer.id].angle) * 0.12;
    }
  }

  addInkOutlines(group, { thickness: 0.055, color: 0x2a231c, minRadius: 0.95, maxRadius: 12.5 });

  return { group, update, glowTexture: glow };
}

/* --------------------------------- towers --------------------------------- */

export function createTower(id) {
  const el = ELEMENTS[id];
  const group = new THREE.Group();
  group.name = `tower-${id}`;
  const glow = glowTexture();
  const updaters = [];

  const stoneColor = new THREE.Color(el.color).lerp(new THREE.Color(0xd9c5a0), 0.54);
  const midColor = new THREE.Color(el.color).lerp(new THREE.Color(0xf0e0bd), 0.4);
  const stone = toonMaterial({ color: stoneColor });
  const stoneMid = toonMaterial({ color: midColor });
  const crystalMat = toonMaterial({
    color: el.color,
    emissive: el.deep,
    emissiveIntensity: 0.4
  });
  const coreMat = toonMaterial({ color: 0xfff8e6, emissive: el.color, emissiveIntensity: 1.35 });
  const energyMat = new THREE.MeshBasicMaterial({ color: el.color, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false });

  /* base */
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.9, 0.9, 8), stone);
  plinth.position.y = 0.45;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  group.add(plinth);
  const plinthRing = new THREE.Mesh(new THREE.TorusGeometry(5.15, 0.12, 5, 48), energyMat);
  plinthRing.rotation.x = Math.PI / 2;
  plinthRing.position.y = 0.92;
  group.add(plinthRing);

  const tier1 = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 4.6, 2.1, 8), stoneMid);
  tier1.position.y = 1.95;
  tier1.castShadow = true;
  tier1.receiveShadow = true;
  group.add(tier1);

  const tier2 = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3.4, 3.4, 6), stone);
  tier2.position.y = 4.7;
  tier2.castShadow = true;
  group.add(tier2);

  /* pylons */
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.55, 5.2, 0.55), stoneMid);
    pylon.position.set(Math.cos(a) * 3.4, 3.0, Math.sin(a) * 3.4);
    pylon.rotation.z = Math.cos(a) * 0.17;
    pylon.rotation.x = -Math.sin(a) * 0.17;
    pylon.castShadow = true;
    group.add(pylon);
    const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), crystalMat);
    tip.position.set(Math.cos(a) * 3.75, 5.7, Math.sin(a) * 3.75);
    group.add(tip);
  }

  /* crystal body */
  const crystal = new THREE.Mesh(new THREE.IcosahedronGeometry(2.15, 0), crystalMat);
  crystal.position.y = 8.7;
  crystal.scale.set(1, 1.85, 1);
  crystal.castShadow = true;
  group.add(crystal);

  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.72, 0), coreMat);
  core.position.y = 8.8;
  group.add(core);

  const spire = new THREE.Mesh(new THREE.ConeGeometry(1.25, 4.4, 5), crystalMat);
  spire.position.y = 13.15;
  spire.castShadow = true;
  group.add(spire);

  const spireTip = new THREE.Mesh(new THREE.OctahedronGeometry(0.48, 0), coreMat);
  spireTip.position.y = 15.5;
  group.add(spireTip);

  /* rings and shards */
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(3.9, 0.1, 5, 64), energyMat);
  ring1.rotation.x = Math.PI / 2;
  ring1.position.y = 6.4;
  group.add(ring1);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(3.15, 0.08, 5, 64), energyMat);
  ring2.rotation.set(Math.PI / 2.4, 0, 0.2);
  ring2.position.y = 10.5;
  group.add(ring2);

  const shards = [];
  const shardGeo = new THREE.OctahedronGeometry(0.48, 0);
  for (let i = 0; i < 5; i++) {
    const shard = new THREE.Mesh(shardGeo, crystalMat);
    shard.userData.a = (i / 5) * TAU;
    shard.userData.r = 4.1 + (i % 2) * 0.9;
    shard.userData.y = 7.2 + (i % 3) * 1.15;
    shard.userData.spin = 0.35 + i * 0.07;
    group.add(shard);
    shards.push(shard);
  }

  /* glow sprites */
  const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: el.color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  coreGlow.position.y = 8.8;
  coreGlow.scale.set(11, 11, 1);
  group.add(coreGlow);
  const topGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: el.bright, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  topGlow.position.y = 15.4;
  topGlow.scale.set(6, 6, 1);
  group.add(topGlow);

  /* light beam */
  const beamMat = new THREE.MeshBasicMaterial({ color: el.color, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 32, 8, 1, true), beamMat);
  beam.position.y = 31.4;
  group.add(beam);
  const beamWideMat = new THREE.MeshBasicMaterial({ color: el.color, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beamWide = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.6, 32, 12, 1, true), beamWideMat);
  beamWide.position.y = 31.4;
  group.add(beamWide);
  const beamGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: el.color, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
  beamGlow.position.y = 46.5;
  beamGlow.scale.set(12, 12, 1);
  group.add(beamGlow);

  const light = new THREE.PointLight(el.color, 15, 26, 2);
  light.position.y = 8.8;
  group.add(light);

  /* element-specific flourishes */
  const extras = [];
  if (id === 'fire') {
    for (let i = 0; i < 4; i++) {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.6, 2.2, 5), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffc45c : 0xff5a18, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      const a = (i / 4) * TAU + 0.4;
      flame.position.set(Math.cos(a) * 4.2, 2.6 + (i % 2) * 1.5, Math.sin(a) * 4.2);
      group.add(flame);
      extras.push({ mesh: flame, phase: i * 1.6, baseY: flame.position.y });
    }
  }
  if (id === 'water') {
    const waterRing = new THREE.Mesh(new THREE.TorusGeometry(2.9, 0.08, 5, 64), new THREE.MeshBasicMaterial({ color: 0xbdf6ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    waterRing.rotation.x = Math.PI / 2;
    waterRing.position.y = 9.4;
    group.add(waterRing);
    extras.push({ mesh: waterRing, spin: 0.5 });
    const bubbles = [];
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.1 + Math.random() * 0.13, 6, 5), new THREE.MeshBasicMaterial({ color: 0xc7f8ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      const a = Math.random() * TAU;
      const r = 2.6 + Math.random() * 2.2;
      b.position.set(Math.cos(a) * r, 1 + Math.random() * 8, Math.sin(a) * r);
      b.userData = { a, r, y: b.position.y, speed: 0.35 + Math.random() * 0.6 };
      group.add(b);
      bubbles.push(b);
    }
    extras.push({ bubbles });
  }
  if (id === 'earth') {
    for (let i = 0; i < 4; i++) {
      const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55 + i * 0.08, 0), stoneMid);
      const a = (i / 4) * TAU;
      boulder.position.set(Math.cos(a) * 5.1, 1.2 + (i % 2) * 1.2, Math.sin(a) * 5.1);
      boulder.userData = { a, y: boulder.position.y, phase: i * 1.2 };
      group.add(boulder);
      extras.push({ boulder });
    }
    const vineMat = new THREE.MeshBasicMaterial({ color: 0x6db93a, transparent: true, opacity: 0.55 });
    for (let i = 0; i < 2; i++) {
      const vine = new THREE.Mesh(new THREE.TorusGeometry(3.9 + i * 0.4, 0.07, 4, 40, Math.PI * 1.2), vineMat);
      vine.rotation.set(Math.PI / 2, 0, i * 2.1);
      vine.position.y = 2.2 + i * 2.6;
      group.add(vine);
    }
  }
  if (id === 'air') {
    for (let i = 0; i < 3; i++) {
      const wind = new THREE.Mesh(new THREE.TorusGeometry(3.6 + i * 0.55, 0.06, 4, 56, Math.PI * 1.5), new THREE.MeshBasicMaterial({ color: 0xdcd0ff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      wind.rotation.set(Math.PI / 2.2 + i * 0.5, i * 1.3, 0.4);
      wind.position.y = 5.4 + i * 2.4;
      group.add(wind);
      extras.push({ mesh: wind, spin: 0.2 + i * 0.13 });
    }
  }

  /* health bar */
  const [hc, hctx] = canvas2d(320, 52);
  const barTex = new THREE.CanvasTexture(hc);
  barTex.colorSpace = THREE.SRGBColorSpace;
  const barSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: barTex, transparent: true, depthTest: false, depthWrite: false }));
  barSprite.position.y = 18.2;
  barSprite.scale.set(9.2, 1.5, 1);
  barSprite.renderOrder = 20;
  group.add(barSprite);
  let lastFrac = -1;
  function setHealth(frac) {
    frac = Math.max(0, Math.min(1, frac));
    if (Math.abs(frac - lastFrac) < 0.002) return;
    lastFrac = frac;
    const w = hc.width;
    const h = hc.height;
    hctx.clearRect(0, 0, w, h);
    hctx.font = '700 13px Rajdhani, sans-serif';
    hctx.fillStyle = 'rgba(238,244,255,0.82)';
    hctx.textBaseline = 'middle';
    hctx.fillText('NEXUS', 10, 12);
    hctx.textAlign = 'right';
    hctx.fillStyle = el.brightCss;
    hctx.fillText(`${Math.ceil(frac * 100)}%`, w - 10, 12);
    hctx.textAlign = 'left';
    hctx.fillStyle = 'rgba(0,0,0,0.6)';
    hctx.fillRect(8, 26, w - 16, 15);
    hctx.fillStyle = 'rgba(255,255,255,0.1)';
    hctx.fillRect(8, 26, w - 16, 15);
    const grad = hctx.createLinearGradient(8, 0, w - 8, 0);
    grad.addColorStop(0, el.deep ? `#${el.deep.toString(16).padStart(6, '0')}` : el.css);
    grad.addColorStop(1, el.brightCss);
    hctx.fillStyle = grad;
    hctx.fillRect(8, 26, (w - 16) * frac, 15);
    hctx.strokeStyle = 'rgba(5,8,16,0.85)';
    hctx.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      const x = 8 + ((w - 16) * i) / 10;
      hctx.beginPath();
      hctx.moveTo(x, 26);
      hctx.lineTo(x, 41);
      hctx.stroke();
    }
    hctx.strokeStyle = `rgba(${((el.color >> 16) & 255)},${((el.color >> 8) & 255)},${el.color & 255},0.55)`;
    hctx.strokeRect(8.5, 26.5, w - 17, 14);
    barTex.needsUpdate = true;
  }
  setHealth(1);

  let hitFlash = 0;
  function hit() { hitFlash = 1; }

  function update(time, dt) {
    ring1.rotation.z += dt * 0.4;
    ring2.rotation.z -= dt * 0.55;
    crystal.rotation.y += dt * 0.24;
    crystalMat.emissiveIntensity = 1.3 + Math.sin(time * 1.7) * 0.22 + hitFlash * 3.2;
    core.scale.setScalar(0.9 + Math.sin(time * 2.4) * 0.1 + hitFlash * 0.4);
    coreMat.emissiveIntensity = 2.2 + Math.sin(time * 2.8) * 0.5 + hitFlash * 4;
    spireTip.rotation.y += dt * 0.8;
    coreGlow.material.opacity = 0.66 + Math.sin(time * 1.9) * 0.14 + hitFlash * 0.3;
    coreGlow.scale.setScalar(10.6 + Math.sin(time * 1.4) * 0.9);
    topGlow.material.opacity = 0.42 + Math.sin(time * 2.1) * 0.12;
    beam.material.opacity = 0.14 + Math.sin(time * 1.1) * 0.05 + hitFlash * 0.2;
    beamWide.material.opacity = 0.035 + Math.sin(time * 0.8) * 0.015;
    light.intensity = 13 + Math.sin(time * 1.9) * 4 + hitFlash * 18;

    for (const shard of shards) {
      shard.userData.a += dt * shard.userData.spin;
      shard.position.set(
        Math.cos(shard.userData.a) * shard.userData.r,
        shard.userData.y + Math.sin(time * 1.2 + shard.userData.a) * 0.55,
        Math.sin(shard.userData.a) * shard.userData.r
      );
      shard.rotation.x += dt * 0.9;
      shard.rotation.y += dt * 0.7;
    }

    for (const ex of extras) {
      if (ex.mesh) {
        if (ex.spin) {
          ex.mesh.rotation.z += dt * ex.spin;
          ex.mesh.rotation.y += dt * ex.spin * 0.6;
        } else {
          const s = 0.72 + Math.sin(time * 2.4 + ex.phase) * 0.28;
          ex.mesh.scale.set(1, s, 1);
          ex.mesh.position.y = ex.baseY + Math.sin(time * 1.7 + ex.phase) * 0.22;
          ex.mesh.material.opacity = 0.38 + s * 0.24;
          ex.mesh.rotation.y += dt * 0.4;
        }
      }
      if (ex.bubbles) {
        for (const b of ex.bubbles) {
          b.userData.y += b.userData.speed * dt;
          if (b.userData.y > 10.5) b.userData.y = 0.9;
          b.userData.a += dt * 0.22;
          b.position.set(Math.cos(b.userData.a) * b.userData.r, b.userData.y, Math.sin(b.userData.a) * b.userData.r);
        }
      }
      if (ex.boulder) {
        const d = ex.boulder.userData;
        d.a += dt * 0.18;
        ex.boulder.position.set(Math.cos(d.a) * 5.1, d.y + Math.sin(time * 0.9 + d.phase) * 0.55, Math.sin(d.a) * 5.1);
        ex.boulder.rotation.x += dt * 0.2;
        ex.boulder.rotation.y += dt * 0.16;
      }
    }

    hitFlash = Math.max(0, hitFlash - dt * 3.4);
  }

  addInkOutlines(group, { thickness: 0.075, color: 0x2b241e, minRadius: 0.3 });

  return {
    id,
    element: el,
    group,
    update,
    setHealth,
    hit,
    core,
    crystal,
    crystalMat,
    coreMat,
    beam,
    beamMat,
    beamWide,
    beamGlow,
    coreGlow,
    topGlow,
    light,
    barSprite,
    barTex,
    setVisible(v) { group.visible = v; }
  };
}
