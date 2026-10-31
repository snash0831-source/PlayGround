import * as THREE from 'three';
import { ELEMENTS, AVATAR_MAX_HP } from './config.js';
import { glowTexture } from './world.js';

const TAU = Math.PI * 2;

function canvas2d(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.62,
    metalness: opts.metalness ?? 0.25,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    flatShading: opts.flatShading ?? true,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide
  });
}

function add(parent, geo, material, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function makeHealthSprite(el) {
  const [c, ctx] = canvas2d(256, 56);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, opacity: 0.95 }));
  sprite.scale.set(3.7, 0.81, 1);
  sprite.position.y = 5.1;
  sprite.renderOrder = 21;
  let frac = 1;
  function draw(next) {
    if (next !== undefined) frac = Math.max(0, Math.min(1, next));
    ctx.clearRect(0, 0, 256, 56);
    ctx.font = '700 13px Rajdhani, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(4,7,15,0.55)';
    ctx.fillRect(38, 27, 180, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    ctx.fillRect(38, 27, 180, 12);
    const g = ctx.createLinearGradient(38, 0, 218, 0);
    g.addColorStop(0, el.css);
    g.addColorStop(1, el.brightCss);
    ctx.fillStyle = g;
    ctx.fillRect(38, 27, 180 * frac, 12);
    ctx.strokeStyle = 'rgba(8,12,24,0.75)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      const x = 38 + (180 * i) / 8;
      ctx.beginPath();
      ctx.moveTo(x, 27);
      ctx.lineTo(x, 39);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(235,242,255,0.86)';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 4;
    ctx.fillText(el.avatar.toUpperCase(), 128, 15);
    ctx.shadowBlur = 0;
    if (frac < 0.28) {
      ctx.fillStyle = '#ff9d86';
      ctx.fillRect(38, 27, 180 * frac, 12);
    }
    tex.needsUpdate = true;
  }
  draw(1);
  return { sprite, draw, tex, setVisible: (v) => { sprite.visible = v; } };
}

/* ------------------------------- base rig -------------------------------- */

function createRig(id) {
  const el = ELEMENTS[id];
  const root = new THREE.Group();
  root.name = `avatar-${id}`;
  const body = new THREE.Group();
  root.add(body);

  const glow = glowTexture();
  const bodyMat = std(el.mid, { roughness: 0.6, metalness: 0.28, emissive: el.color, emissiveIntensity: 0.12, flatShading: true });
  const armorMat = std(el.dark, { roughness: 0.48, metalness: 0.5, emissive: el.deep, emissiveIntensity: 0.15 });
  const accentMat = std(0x0a0a0a, { roughness: 0.2, metalness: 0.1, emissive: el.color, emissiveIntensity: 2.1, flatShading: true });
  const brightMat = std(el.bright, { roughness: 0.3, metalness: 0.3, emissive: el.color, emissiveIntensity: 0.7, flatShading: true });
  const glassMat = new THREE.MeshStandardMaterial({
    color: el.bright,
    roughness: 0.08,
    metalness: 0.15,
    emissive: el.color,
    emissiveIntensity: 0.55,
    transparent: true,
    opacity: 0.55,
    flatShading: true,
    side: THREE.DoubleSide
  });

  /* shadow */
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 2.6),
    new THREE.MeshBasicMaterial({ map: glow, color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.025;
  root.add(shadow);

  /* ground rune ring */
  const ringMat = new THREE.MeshBasicMaterial({ color: el.color, transparent: true, opacity: 0.46, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const groundRing = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.18, 40), ringMat);
  groundRing.rotation.x = -Math.PI / 2;
  groundRing.position.y = 0.035;
  root.add(groundRing);
  const groundRing2 = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.48, 40), ringMat.clone());
  groundRing2.material.opacity = 0.2;
  groundRing2.rotation.x = -Math.PI / 2;
  groundRing2.position.y = 0.03;
  root.add(groundRing2);

  /* aura */
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: el.color, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending, depthWrite: false }));
  aura.position.y = 2.2;
  aura.scale.set(4.4, 5.2, 1);
  body.add(aura);

  /* hips + legs */
  const hipL = new THREE.Group();
  hipL.position.set(-0.31, 1.52, 0);
  body.add(hipL);
  const hipR = new THREE.Group();
  hipR.position.set(0.31, 1.52, 0);
  body.add(hipR);
  add(hipL, new THREE.CapsuleGeometry(0.2, 0.88, 4, 7), bodyMat, [0, -0.56, 0]);
  add(hipR, new THREE.CapsuleGeometry(0.2, 0.88, 4, 7), bodyMat, [0, -0.56, 0]);
  add(hipL, new THREE.BoxGeometry(0.42, 0.22, 0.62), armorMat, [0, -1.07, 0.08]);
  add(hipR, new THREE.BoxGeometry(0.42, 0.22, 0.62), armorMat, [0, -1.07, 0.08]);

  /* torso */
  const torso = new THREE.Group();
  torso.position.y = 2.15;
  body.add(torso);
  const chest = add(torso, new THREE.CapsuleGeometry(0.55, 0.72, 5, 9), bodyMat, [0, 0, 0], [0, 0, 0], [1.08, 1, 0.78]);
  add(torso, new THREE.CylinderGeometry(0.52, 0.42, 0.3, 8), armorMat, [0, -0.58, 0], [0, 0, 0], [1.12, 1, 0.9]);
  add(torso, new THREE.BoxGeometry(0.78, 0.26, 0.55), armorMat, [0, 0.48, -0.04]);
  const chestCore = add(torso, new THREE.IcosahedronGeometry(0.16, 0), accentMat, [0, 0.02, 0.5]);
  const chestGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: el.color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  chestGlow.position.set(0, 0.02, 0.55);
  chestGlow.scale.set(1.4, 1.4, 1);
  torso.add(chestGlow);

  /* shoulders + arms */
  const shoulderL = new THREE.Group();
  shoulderL.position.set(-0.68, 2.65, 0);
  body.add(shoulderL);
  const shoulderR = new THREE.Group();
  shoulderR.position.set(0.68, 2.65, 0);
  body.add(shoulderR);
  add(shoulderL, new THREE.IcosahedronGeometry(0.3, 0), armorMat, [0, 0, 0]);
  add(shoulderR, new THREE.IcosahedronGeometry(0.3, 0), armorMat, [0, 0, 0]);
  add(shoulderL, new THREE.CapsuleGeometry(0.145, 0.72, 4, 7), bodyMat, [0, -0.48, 0]);
  add(shoulderR, new THREE.CapsuleGeometry(0.145, 0.72, 4, 7), bodyMat, [0, -0.48, 0]);
  const handL = add(shoulderL, new THREE.IcosahedronGeometry(0.19, 0), accentMat, [0, -0.92, 0]);
  const handR = add(shoulderR, new THREE.IcosahedronGeometry(0.19, 0), accentMat, [0, -0.92, 0]);

  /* head */
  const headGroup = new THREE.Group();
  headGroup.position.y = 3.3;
  body.add(headGroup);
  add(headGroup, new THREE.IcosahedronGeometry(0.47, 1), bodyMat, [0, 0, 0], [0, 0, 0], [1, 1.05, 0.95]);
  add(headGroup, new THREE.BoxGeometry(0.32, 0.16, 0.16), armorMat, [0, -0.18, 0.36]);
  const eyeMat = new THREE.MeshBasicMaterial({ color: el.bright });
  const eyeL = add(headGroup, new THREE.SphereGeometry(0.052, 6, 5), eyeMat, [-0.16, 0.05, 0.42]);
  const eyeR = add(headGroup, new THREE.SphereGeometry(0.052, 6, 5), eyeMat, [0.16, 0.05, 0.42]);
  eyeL.castShadow = false;
  eyeR.castShadow = false;

  const health = makeHealthSprite(el);
  root.add(health.sprite);

  return {
    el, root, body, torso, headGroup, hipL, hipR, shoulderL, shoulderR, handL, handR,
    chest, chestCore, chestGlow, aura, shadow, groundRing, groundRing2, ringMat,
    bodyMat, armorMat, accentMat, brightMat, glassMat, health, glow,
    eyeMat, extra: {}, baseEmissive: bodyMat.emissiveIntensity
  };
}

/* ------------------------------- fire ------------------------------------ */

function styleFire(rig) {
  const { body, torso, headGroup, shoulderL, shoulderR, accentMat, glassMat, el } = rig;
  rig.bodyMat.color.setHex(0x2a1611);
  rig.bodyMat.emissive.setHex(0xff3a08);
  rig.bodyMat.emissiveIntensity = 0.22;
  rig.armorMat.color.setHex(0x3f1a0f);
  rig.armorMat.emissive.setHex(0xff5a18);
  rig.armorMat.emissiveIntensity = 0.22;
  rig.armorMat.metalness = 0.45;

  /* shoulder spikes */
  add(shoulderL, new THREE.ConeGeometry(0.2, 0.86, 5), rig.armorMat, [-0.08, 0.44, 0], [0.1, 0, 0.3]);
  add(shoulderR, new THREE.ConeGeometry(0.2, 0.86, 5), rig.armorMat, [0.08, 0.44, 0], [0.1, 0, -0.3]);

  /* lava cracks across chest */
  for (let i = 0; i < 3; i++) {
    const crack = add(torso, new THREE.TorusGeometry(0.42 + i * 0.05, 0.028, 3, 24, Math.PI * 0.8), accentMat, [0, -0.2 + i * 0.2, 0.28], [Math.PI / 2.3, 0, i * 1.1]);
    crack.castShadow = false;
  }

  /* flame crest */
  const flameGroup = new THREE.Group();
  flameGroup.position.y = 3.62;
  body.add(flameGroup);
  const flames = [];
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff7a1e, transparent: true, opacity: 0.82, blending: THREE.AdditiveBlending, depthWrite: false });
  const flameMat2 = new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.17 + (i === 2 ? 0.09 : 0), 0.9 + (i % 2) * 0.55, 5), i % 2 ? flameMat : flameMat2);
    f.position.set((i - 2) * 0.17, 0.42 + (i % 2) * 0.12, (i % 2 ? 0.08 : -0.04));
    f.rotation.z = (i - 2) * 0.2;
    f.castShadow = false;
    flameGroup.add(f);
    flames.push(f);
  }
  const flameGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: rig.glow, color: 0xff7a2a, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  flameGlow.position.set(0, 3.85, 0);
  flameGlow.scale.set(2.3, 2.3, 1);
  body.add(flameGlow);

  /* ember orbiters */
  const embers = [];
  for (let i = 0; i < 6; i++) {
    const e = new THREE.Sprite(new THREE.SpriteMaterial({ map: rig.glow, color: i % 2 ? 0xffb347 : 0xff5a18, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
    e.scale.set(0.32, 0.32, 1);
    body.add(e);
    embers.push({ sprite: e, a: (i / 6) * TAU, r: 1.1 + Math.random() * 0.6, y: 1.2 + Math.random() * 2.2, speed: 0.5 + Math.random() * 0.7 });
  }

  rig.extra = { flameGroup, flames, flameGlow, embers };
}

/* ------------------------------- water ----------------------------------- */

function styleWater(rig) {
  const { body, torso, headGroup, shoulderL, shoulderR, accentMat, glassMat } = rig;
  rig.bodyMat.color.setHex(0x0c5875);
  rig.bodyMat.emissive.setHex(0x0c8fbd);
  rig.bodyMat.emissiveIntensity = 0.34;
  rig.bodyMat.transparent = true;
  rig.bodyMat.opacity = 0.9;
  rig.bodyMat.roughness = 0.22;
  rig.bodyMat.metalness = 0.2;
  rig.armorMat.color.setHex(0x0b3347);
  rig.armorMat.emissive.setHex(0x26b9e6);
  rig.armorMat.emissiveIntensity = 0.24;
  rig.armorMat.transparent = true;
  rig.armorMat.opacity = 0.9;

  /* flowing skirt */
  const skirt = add(body, new THREE.CylinderGeometry(0.38, 0.82, 1.45, 8, 1, true), rig.glassMat, [0, 1.25, 0]);
  skirt.castShadow = false;

  /* ice pauldrons */
  add(shoulderL, new THREE.OctahedronGeometry(0.42, 0), rig.brightMat, [-0.04, 0.18, 0], [0, 0, 0.3], [0.8, 1.4, 0.8]);
  add(shoulderR, new THREE.OctahedronGeometry(0.42, 0), rig.brightMat, [0.04, 0.18, 0], [0, 0, -0.3], [0.8, 1.4, 0.8]);

  /* hair tendrils */
  const hair = [];
  for (let i = 0; i < 4; i++) {
    const pts = [];
    const side = i < 2 ? -1 : 1;
    for (let k = 0; k < 5; k++) {
      pts.push(new THREE.Vector3(
        side * (0.18 + k * 0.08) + (i % 2 ? 0.1 : -0.1),
        0.18 - k * 0.1,
        -0.12 - k * 0.16
      ));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.055 - i * 0.006, 4, false), rig.glassMat);
    tube.castShadow = false;
    headGroup.add(tube);
    hair.push(tube);
  }

  /* crescent crown */
  const crown = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 4, 24, Math.PI * 1.1), rig.brightMat);
  crown.position.set(0, 0.5, 0);
  crown.rotation.set(0.2, 0, Math.PI * 0.95);
  headGroup.add(crown);
  rig.extra.crown = crown;

  /* orbit bubbles */
  const bubbles = [];
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.06 + Math.random() * 0.1, 6, 5), new THREE.MeshBasicMaterial({ color: 0xc7f7ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    body.add(b);
    bubbles.push({ mesh: b, a: (i / 7) * TAU, r: 0.9 + Math.random() * 0.8, y: 0.5 + Math.random() * 2.8, speed: 0.5 + Math.random() * 0.5 });
  }

  /* waist tide ring */
  const tide = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.035, 4, 32), new THREE.MeshBasicMaterial({ color: 0x9fefff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  tide.rotation.x = Math.PI / 2;
  tide.position.y = 1.6;
  body.add(tide);
  rig.extra.tide = tide;
  rig.extra.bubbles = bubbles;
  rig.extra.hair = hair;
}

/* ------------------------------- earth ----------------------------------- */

function styleEarth(rig) {
  const { body, torso, headGroup, shoulderL, shoulderR, accentMat } = rig;
  rig.root.scale.setScalar(1.16);
  rig.bodyMat.color.setHex(0x35441f);
  rig.bodyMat.emissive.setHex(0x6cae2c);
  rig.bodyMat.emissiveIntensity = 0.13;
  rig.bodyMat.roughness = 0.9;
  rig.armorMat.color.setHex(0x4d4a3a);
  rig.armorMat.emissive.setHex(0x2d4215);
  rig.armorMat.emissiveIntensity = 0.16;
  rig.armorMat.roughness = 0.92;

  const stone = new THREE.MeshStandardMaterial({ color: 0x55513f, roughness: 0.94, metalness: 0.08, flatShading: true });
  const moss = new THREE.MeshStandardMaterial({ color: 0x486b22, roughness: 0.96, flatShading: true });
  rig.extra.stone = stone;
  rig.extra.moss = moss;

  /* bulky torso plates */
  const plate = add(torso, new THREE.DodecahedronGeometry(0.72, 0), stone, [0, 0.02, 0], [0, 0.4, 0], [1.18, 1.15, 0.82]);
  plate.material = stone;
  add(torso, new THREE.IcosahedronGeometry(0.5, 0), moss, [0, 0.28, -0.18], [0.2, 0, 0.1], [1.1, 0.5, 1.2]);
  add(torso, new THREE.IcosahedronGeometry(0.34, 0), moss, [0.28, -0.34, 0.3], [0, 0, 0.2], [1, 0.35, 1]);

  /* boulder shoulders + fists */
  add(shoulderL, new THREE.DodecahedronGeometry(0.44, 0), stone, [0, 0.02, 0]);
  add(shoulderR, new THREE.DodecahedronGeometry(0.44, 0), stone, [0, 0.02, 0]);
  rig.handL.geometry = new THREE.DodecahedronGeometry(0.3, 0);
  rig.handR.geometry = new THREE.DodecahedronGeometry(0.3, 0);
  rig.handL.material = stone;
  rig.handR.material = stone;
  add(shoulderL, new THREE.IcosahedronGeometry(0.2, 0), moss, [-0.02, 0.32, 0], [0, 0, 0], [1.2, 0.4, 1.2]);
  add(shoulderR, new THREE.IcosahedronGeometry(0.2, 0), moss, [0.02, 0.32, 0], [0, 0, 0], [1.2, 0.4, 1.2]);

  /* heavy jaw */
  add(headGroup, new THREE.BoxGeometry(0.5, 0.22, 0.4), stone, [0, -0.3, 0.12]);

  /* back crystal shards */
  for (let i = 0; i < 3; i++) {
    const shard = add(torso, new THREE.OctahedronGeometry(0.18 + i * 0.03, 0), rig.accentMat, [(i - 1) * 0.26, 0.22 + i * 0.15, -0.42], [0.4, 0, (i - 1) * 0.3], [0.7, 1.8, 0.7]);
    shard.rotation.x = 0.5;
  }

  /* floating pebbles */
  const pebbles = [];
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Mesh(new THREE.DodecahedronGeometry(0.11 + Math.random() * 0.12, 0), stone);
    body.add(p);
    pebbles.push({ mesh: p, a: (i / 5) * TAU, r: 1.1 + Math.random() * 0.5, y: 0.8 + Math.random() * 2.2, speed: 0.35 + Math.random() * 0.4 });
  }
  rig.extra.pebbles = pebbles;

  /* chest crystal */
  const gem = add(torso, new THREE.OctahedronGeometry(0.2, 0), accentMat, [0, 0.02, 0.52], [0, 0, 0], [0.8, 1.4, 0.8]);
  rig.extra.gem = gem;
}

/* -------------------------------- air ------------------------------------ */

function styleAir(rig) {
  const { body, torso, headGroup, shoulderL, shoulderR, accentMat, glassMat } = rig;
  rig.root.scale.setScalar(0.98);
  rig.bodyMat.color.setHex(0x342b61);
  rig.bodyMat.emissive.setHex(0x9a7cff);
  rig.bodyMat.emissiveIntensity = 0.25;
  rig.bodyMat.transparent = true;
  rig.bodyMat.opacity = 0.92;
  rig.armorMat.color.setHex(0x51438a);
  rig.armorMat.emissive.setHex(0x9c86ff);
  rig.armorMat.emissiveIntensity = 0.2;

  /* robe */
  const robe = add(body, new THREE.ConeGeometry(0.78, 1.9, 10, 1, true), new THREE.MeshStandardMaterial({
    color: 0x4b3d84, transparent: true, opacity: 0.5, roughness: 0.3, metalness: 0.1, side: THREE.DoubleSide, emissive: 0x6f55c8, emissiveIntensity: 0.25, flatShading: true
  }), [0, 1.1, 0]);
  robe.castShadow = false;

  /* shoulder crescents */
  for (const [side, grp] of [[-1, shoulderL], [1, shoulderR]]) {
    const crescent = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.055, 4, 24, Math.PI * 1.15), rig.brightMat);
    crescent.position.set(side * 0.02, 0.22, 0);
    crescent.rotation.set(Math.PI / 2.3, 0, side * 0.5);
    grp.add(crescent);
  }

  /* halo */
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 4, 40), rig.accentMat);
  halo.position.y = 0.6;
  halo.rotation.x = Math.PI / 2;
  headGroup.add(halo);
  rig.extra.halo = halo;

  /* scarf ribbons */
  const ribbons = [];
  const ribbonMat = new THREE.MeshStandardMaterial({ color: 0xa38cff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, emissive: 0x8c6cff, emissiveIntensity: 0.5, roughness: 0.4 });
  for (let i = 0; i < 3; i++) {
    const pts = [];
    for (let k = 0; k < 6; k++) {
      pts.push(new THREE.Vector3((i - 1) * 0.28, 2.55 - k * 0.12, -0.2 - k * 0.32));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const ribbon = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.06 - i * 0.008, 3, false), ribbonMat);
    body.add(ribbon);
    ribbons.push({ mesh: ribbon, phase: i * 1.3, base: i });
  }
  rig.extra.ribbons = ribbons;

  /* wind swirl at feet */
  const swirl = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.03, 3, 40, Math.PI * 1.4), new THREE.MeshBasicMaterial({ color: 0xd9ccff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
  swirl.rotation.x = Math.PI / 2;
  swirl.position.y = 0.12;
  body.add(swirl);
  rig.extra.swirl = swirl;

  /* orbiting crescents */
  const crescents = [];
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.024, 3, 18, Math.PI * 1.3), rig.accentMat);
    body.add(c);
    crescents.push({ mesh: c, a: (i / 3) * TAU, r: 1.05 + i * 0.15, y: 1.4 + i * 0.8, speed: 0.7 + i * 0.15 });
  }
  rig.extra.crescents = crescents;
}

/* ------------------------------- factory --------------------------------- */

export function createAvatar(id) {
  const rig = createRig(id);
  if (id === 'fire') styleFire(rig);
  if (id === 'water') styleWater(rig);
  if (id === 'earth') styleEarth(rig);
  if (id === 'air') styleAir(rig);

  const state = {
    time: Math.random() * 10,
    walk: 0,
    flash: 0,
    casting: 0,
    movingBlend: 0,
    spawn: 0
  };

  const baseColors = {
    body: rig.bodyMat.emissiveIntensity,
    armor: rig.armorMat.emissiveIntensity,
    accent: rig.accentMat.emissiveIntensity
  };

  function setHealth(frac) {
    rig.health.draw(frac);
  }

  function hit() {
    state.flash = 1;
  }

  function reset(hp = AVATAR_MAX_HP) {
    state.spawn = 0;
    state.flash = 0;
    state.casting = 0;
    rig.root.visible = true;
    rig.root.scale.setScalar(id === 'earth' ? 1.16 : id === 'air' ? 0.98 : 1);
    setHealth(hp / AVATAR_MAX_HP);
  }

  function update(dt, time, opts = {}) {
    const moving = opts.moving ? 1 : 0;
    const casting = opts.casting ? 1 : 0;
    state.movingBlend += (moving - state.movingBlend) * Math.min(1, dt * 9);
    state.walk += dt * (7.4 + state.movingBlend * 4.6);
    state.time += dt;
    state.flash = Math.max(0, state.flash - dt * 4.2);
    state.casting = Math.max(0, state.casting - dt * 3.8);
    if (opts.casting) state.casting = 1;
    if (state.spawn < 1) state.spawn = Math.min(1, state.spawn + dt * 2.4);

    const t = state.time;
    const wb = state.movingBlend;
    const bob = Math.sin(state.walk * 2) * 0.035 * wb + Math.sin(t * 1.8) * 0.025;
    const hover = id === 'air' ? 0.17 + Math.sin(t * 1.4) * 0.055 : 0;
    rig.body.position.y = bob + hover;
    rig.body.scale.setScalar(0.7 + 0.3 * easeOutBack(state.spawn));

    const swing = Math.sin(state.walk) * 0.7 * wb;
    rig.hipL.rotation.x = swing;
    rig.hipR.rotation.x = -swing;
    rig.hipL.rotation.z = Math.sin(state.walk) * 0.04 * wb;
    rig.hipR.rotation.z = -Math.sin(state.walk) * 0.04 * wb;

    const armSwing = Math.sin(state.walk) * 0.52 * wb;
    rig.shoulderL.rotation.x = -armSwing;
    rig.shoulderR.rotation.x = armSwing;
    rig.shoulderL.rotation.z = -0.06 - Math.sin(t * 1.7) * 0.03;
    rig.shoulderR.rotation.z = 0.06 + Math.sin(t * 1.7 + 1) * 0.03;

    if (state.casting > 0.02) {
      const c = Math.sin(Math.min(1, (1 - state.casting)) * Math.PI);
      rig.shoulderR.rotation.x = -1.5 * c - 0.1;
      rig.shoulderR.rotation.z = 0.3 * c;
      rig.shoulderL.rotation.x = -0.4 * c;
      rig.torso.rotation.y = -0.18 * c;
      rig.headGroup.rotation.x = -0.12 * c;
    } else {
      rig.torso.rotation.y *= 0.9;
      rig.headGroup.rotation.x *= 0.9;
    }

    rig.headGroup.rotation.y = Math.sin(t * 0.55) * 0.12 * (1 - wb * 0.6);
    rig.torso.rotation.z = Math.sin(t * 1.1) * 0.018;

    rig.bodyMat.emissiveIntensity = baseColors.body + state.flash * 2.2 + Math.sin(t * 2.3) * 0.03;
    rig.armorMat.emissiveIntensity = baseColors.armor + state.flash * 1.8;
    rig.accentMat.emissiveIntensity = baseColors.accent + state.flash * 3 + Math.sin(t * 3) * 0.15;
    rig.aura.material.opacity = 0.16 + Math.sin(t * 1.6) * 0.06 + state.casting * 0.12;
    rig.aura.scale.setScalar(4.2 + Math.sin(t * 1.2) * 0.3);
    rig.groundRing.rotation.z += dt * 0.35;
    rig.groundRing2.rotation.z -= dt * 0.2;
    rig.groundRing.material.opacity = 0.32 + Math.sin(t * 2) * 0.12 + state.casting * 0.18;

    rig.chestGlow.material.opacity = 0.36 + Math.sin(t * 2.4) * 0.12 + state.flash * 0.3;
    rig.chestGlow.scale.setScalar(1.2 + Math.sin(t * 2.1) * 0.16);
    rig.chestCore.rotation.y += dt * 1.4;

    /* element flourishes */
    if (id === 'fire') {
      const { flames, flameGlow, embers, flameGroup } = rig.extra;
      flameGroup.position.y = 3.62 - rig.body.position.y;
      flames.forEach((f, i) => {
        const s = 0.8 + Math.sin(t * 3.2 + i * 1.2) * 0.22;
        f.scale.set(0.85 + Math.sin(t * 2 + i) * 0.12, s, 0.85);
        f.rotation.z = (i - 2) * 0.2 + Math.sin(t * 2.4 + i) * 0.08;
        f.material.opacity = 0.62 + Math.sin(t * 3.3 + i) * 0.18;
      });
      flameGlow.position.y = 3.85 - rig.body.position.y;
      flameGlow.material.opacity = 0.55 + Math.sin(t * 2.6) * 0.16;
      for (const e of embers) {
        e.a += dt * e.speed;
        e.sprite.position.set(Math.cos(e.a) * e.r, e.y + Math.sin(t * 1.4 + e.a) * 0.3 - rig.body.position.y, Math.sin(e.a) * e.r);
        e.sprite.material.opacity = 0.35 + Math.sin(t * 3 + e.a) * 0.25;
      }
    }
    if (id === 'water') {
      const { bubbles, tide, crown, hair } = rig.extra;
      for (const b of bubbles) {
        b.a += dt * b.speed * 0.7;
        b.mesh.position.set(Math.cos(b.a) * b.r, b.y + Math.sin(t * 1.2 + b.a) * 0.15 - rig.body.position.y, Math.sin(b.a) * b.r);
        b.mesh.scale.setScalar(0.9 + Math.sin(t * 3 + b.a) * 0.25);
      }
      tide.rotation.z += dt * 0.8;
      tide.position.y = 1.6 + Math.sin(t * 1.5) * 0.08 - rig.body.position.y;
      crown.rotation.z += dt * 0.25;
      hair.forEach((h, i) => { h.rotation.z = Math.sin(t * 1.3 + i) * 0.08; });
    }
    if (id === 'earth') {
      const { pebbles, gem } = rig.extra;
      for (const p of pebbles) {
        p.a += dt * p.speed;
        p.mesh.position.set(Math.cos(p.a) * p.r, p.y + Math.sin(t * 1.1 + p.a) * 0.22 - rig.body.position.y, Math.sin(p.a) * p.r);
        p.mesh.rotation.x += dt * 0.7;
        p.mesh.rotation.y += dt * 0.5;
      }
      gem.rotation.y += dt * 0.9;
      gem.position.y = 0.02 + Math.sin(t * 2) * 0.03;
    }
    if (id === 'air') {
      const { ribbons, halo, swirl, crescents } = rig.extra;
      ribbons.forEach((r, i) => {
        r.mesh.rotation.x = Math.sin(t * 1.4 + r.phase) * 0.08;
        r.mesh.rotation.z = Math.sin(t * 1.1 + r.phase) * 0.12;
      });
      halo.rotation.z += dt * 0.8;
      halo.position.y = 0.6 + Math.sin(t * 1.8) * 0.06;
      swirl.rotation.z -= dt * 0.9;
      swirl.scale.setScalar(1 + Math.sin(t * 1.6) * 0.08);
      for (const c of crescents) {
        c.a += dt * c.speed;
        c.mesh.position.set(Math.cos(c.a) * c.r, c.y + Math.sin(t * 1.3 + c.a) * 0.2 - rig.body.position.y, Math.sin(c.a) * c.r);
        c.mesh.rotation.x += dt * 1.2;
        c.mesh.rotation.y += dt * 0.9;
      }
    }

    rig.health.sprite.position.y = 5.1 - rig.body.position.y;
  }

  function easeOutBack(x) {
    const c = 1.70158;
    const c3 = c + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
  }

  function setVisible(v) { rig.root.visible = v; }

  return {
    id,
    el: rig.el,
    root: rig.root,
    rig,
    state,
    setHealth,
    hit,
    reset,
    update,
    setVisible,
    healthSprite: rig.health.sprite
  };
}
