import * as THREE from 'three';
import { ELEMENTS, AVATAR_MAX_HP } from './config.js';
import { glowTexture } from './world.js';
import { toonMaterial, addInkOutlines } from './toon.js';

const TAU = Math.PI * 2;
const SKIN = 0xd49a72;

function canvas2d(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function std(color, opts = {}) {
  return toonMaterial({
    color,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide
  });
}

function soft(color, opts = {}) {
  return std(color, opts);
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

function tube(parent, points, radius, material, segments = 10, radial = 5) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, radial, false), material);
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
  sprite.position.y = 4.75;
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

  /* Materials. Every avatar gets its own copies so the four looks stay distinct. */
  const bodyMat = std(el.mid, { roughness: 0.8, metalness: 0.04, emissive: el.color, emissiveIntensity: 0.12, flatShading: true });
  const armorMat = std(el.dark, { roughness: 0.5, metalness: 0.35, emissive: el.deep, emissiveIntensity: 0.12 });
  const accentMat = std(0x0a0a0a, { roughness: 0.2, metalness: 0.1, emissive: el.color, emissiveIntensity: 2.1 });
  const brightMat = std(el.bright, { roughness: 0.3, metalness: 0.35, emissive: el.color, emissiveIntensity: 0.55 });
  const glassMat = toonMaterial({
    color: el.bright,
    emissive: el.color,
    emissiveIntensity: 0.55,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide
  });
  const skinMat = soft(SKIN, { roughness: 0.82, emissive: 0x2b0f07, emissiveIntensity: 0.1 });
  const hairMat = soft(0x211713, { roughness: 0.9, metalness: 0.02 });
  const pantsMat = std(0x2d2630, { roughness: 0.88, metalness: 0.02 });
  const leatherMat = std(0x4a3224, { roughness: 0.84, metalness: 0.05 });
  const metalMat = std(0xb08c52, { roughness: 0.36, metalness: 0.72, emissive: 0x3a2208, emissiveIntensity: 0.1 });
  const furMat = soft(0xe9e3d4, { roughness: 0.98, metalness: 0 });
  const whiteMat = soft(0xf4efe6, { roughness: 0.5, metalness: 0 });
  const darkMat = soft(0x09111c, { roughness: 0.3, metalness: 0 });
  const mouthMat = soft(0x6b3430, { roughness: 0.7, metalness: 0 });

  /* Contact shadow + elemental rings. */
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 2.6),
    new THREE.MeshBasicMaterial({ map: glow, color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.025;
  root.add(shadow);

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

  const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: el.color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
  aura.position.y = 2.2;
  aura.scale.set(4.4, 5.2, 1);
  body.add(aura);

  /* ------------------------------- legs --------------------------------- */
  const hipL = new THREE.Group();
  hipL.position.set(-0.25, 1.55, 0);
  body.add(hipL);
  const hipR = new THREE.Group();
  hipR.position.set(0.25, 1.55, 0);
  body.add(hipR);

  const thighGeo = new THREE.CapsuleGeometry(0.18, 0.5, 4, 8);
  const shinGeo = new THREE.CapsuleGeometry(0.145, 0.45, 4, 8);
  const upperL = add(hipL, thighGeo, pantsMat, [0, -0.4, 0]);
  const upperR = add(hipR, thighGeo, pantsMat, [0, -0.4, 0]);

  const kneeL = new THREE.Group();
  kneeL.position.set(0, -0.78, 0);
  hipL.add(kneeL);
  const kneeR = new THREE.Group();
  kneeR.position.set(0, -0.78, 0);
  hipR.add(kneeR);
  add(kneeL, shinGeo, pantsMat, [0, -0.35, 0]);
  add(kneeR, shinGeo, pantsMat, [0, -0.35, 0]);
  add(kneeL, new THREE.CylinderGeometry(0.17, 0.195, 0.27, 8), leatherMat, [0, -0.52, 0]);
  add(kneeR, new THREE.CylinderGeometry(0.17, 0.195, 0.27, 8), leatherMat, [0, -0.52, 0]);
  add(kneeL, new THREE.BoxGeometry(0.29, 0.17, 0.5), leatherMat, [0, -0.68, 0.11]);
  add(kneeR, new THREE.BoxGeometry(0.29, 0.17, 0.5), leatherMat, [0, -0.68, 0.11]);
  add(kneeL, new THREE.BoxGeometry(0.3, 0.075, 0.12), metalMat, [0, -0.7, 0.35]);
  add(kneeR, new THREE.BoxGeometry(0.3, 0.075, 0.12), metalMat, [0, -0.7, 0.35]);

  /* ------------------------------- torso -------------------------------- */
  const torso = new THREE.Group();
  torso.position.y = 2.18;
  body.add(torso);
  const chest = add(torso, new THREE.CapsuleGeometry(0.38, 0.5, 5, 10), bodyMat, [0, 0, 0], [0, 0, 0], [1.12, 1, 0.74]);
  const waist = add(torso, new THREE.CylinderGeometry(0.34, 0.38, 0.22, 10), bodyMat, [0, -0.57, 0]);
  const corset = add(torso, new THREE.CylinderGeometry(0.355, 0.37, 0.16, 10), leatherMat, [0, -0.5, 0]);
  corset.scale.z = 0.82;
  waist.scale.z = 0.82;

  /* sash + belt */
  const belt = add(body, new THREE.CylinderGeometry(0.385, 0.4, 0.14, 10), leatherMat, [0, 1.56, 0]);
  belt.scale.z = 0.84;
  const buckle = add(body, new THREE.BoxGeometry(0.19, 0.17, 0.07), metalMat, [0, 1.56, 0.34]);
  const skirt = add(body, new THREE.CylinderGeometry(0.375, 0.5, 0.58, 10, 1, true), bodyMat, [0, 1.28, 0]);
  skirt.castShadow = true;
  skirt.material.side = THREE.DoubleSide;

  /* collar */
  add(body, new THREE.CylinderGeometry(0.23, 0.29, 0.16, 10), bodyMat, [0, 2.82, 0]);

  /* neck */
  add(body, new THREE.CylinderGeometry(0.145, 0.17, 0.25, 8), skinMat, [0, 2.87, 0]);

  /* -------------------------------- arms -------------------------------- */
  const shoulderL = new THREE.Group();
  shoulderL.position.set(-0.56, 2.56, 0);
  body.add(shoulderL);
  const shoulderR = new THREE.Group();
  shoulderR.position.set(0.56, 2.56, 0);
  body.add(shoulderR);

  for (const [grp, side] of [[shoulderL, -1], [shoulderR, 1]]) {
    add(grp, new THREE.SphereGeometry(0.17, 10, 8), bodyMat, [0, -0.02, 0], [0, 0, 0], [1, 0.9, 0.95]);
    add(grp, new THREE.CapsuleGeometry(0.125, 0.38, 4, 8), skinMat, [0, -0.32, 0]);
    add(grp, new THREE.CylinderGeometry(0.16, 0.14, 0.2, 8), bodyMat, [0, -0.1, 0]);
    add(grp, new THREE.SphereGeometry(0.115, 8, 6), skinMat, [0, -0.61, 0], [0, 0, 0], [1, 0.9, 0.9]);
    add(grp, new THREE.CylinderGeometry(0.15, 0.145, 0.08, 8), leatherMat, [0, -0.56, 0]);
    void side;
  }

  const elbowL = new THREE.Group();
  elbowL.position.set(0, -0.62, 0);
  shoulderL.add(elbowL);
  const elbowR = new THREE.Group();
  elbowR.position.set(0, -0.62, 0);
  shoulderR.add(elbowR);

  const foreL = add(elbowL, new THREE.CapsuleGeometry(0.11, 0.34, 4, 8), skinMat, [0, -0.26, 0]);
  const foreR = add(elbowR, new THREE.CapsuleGeometry(0.11, 0.34, 4, 8), skinMat, [0, -0.26, 0]);

  const handL = new THREE.Group();
  handL.position.set(0, -0.55, 0);
  elbowL.add(handL);
  const handR = new THREE.Group();
  handR.position.set(0, -0.55, 0);
  elbowR.add(handR);
  for (const [hand, side] of [[handL, -1], [handR, 1]]) {
    add(hand, new THREE.SphereGeometry(0.115, 8, 6), skinMat, [0, -0.02, 0], [0, 0, 0], [1, 1.12, 0.78]);
    add(hand, new THREE.CapsuleGeometry(0.035, 0.08, 3, 5), skinMat, [side * 0.1, -0.02, 0.04], [0, 0, side * -0.5]);
  }

  /* -------------------------------- head -------------------------------- */
  const headGroup = new THREE.Group();
  headGroup.position.y = 3.27;
  body.add(headGroup);
  add(headGroup, new THREE.SphereGeometry(0.42, 18, 14), skinMat, [0, 0, 0], [0, 0, 0], [0.95, 1.03, 0.96]);
  add(headGroup, new THREE.SphereGeometry(0.19, 10, 8), skinMat, [0, -0.21, 0.15], [0, 0, 0], [1.25, 0.68, 0.9]);
  add(headGroup, new THREE.SphereGeometry(0.075, 8, 6), skinMat, [-0.405, 0.01, 0.015], [0, 0, 0], [0.5, 1, 0.72]);
  add(headGroup, new THREE.SphereGeometry(0.075, 8, 6), skinMat, [0.405, 0.01, 0.015], [0, 0, 0], [0.5, 1, 0.72]);

  /* eyes */
  const eyeWhiteMat = soft(0xf6f1e8, { roughness: 0.32, metalness: 0 });
  const irisMat = std(el.bright, { roughness: 0.3, metalness: 0.05, emissive: el.color, emissiveIntensity: 0.7 });
  const pupilMat = soft(0x0a0c10, { roughness: 0.2, metalness: 0 });
  const eyeGroups = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(side * 0.142, 0.05, 0.374);
    headGroup.add(eye);
    add(eye, new THREE.SphereGeometry(0.067, 10, 8), eyeWhiteMat, [0, 0, 0], [0, 0, 0], [1, 0.7, 0.32]);
    add(eye, new THREE.SphereGeometry(0.033, 8, 6), irisMat, [0, 0, 0.025], [0, 0, 0], [1, 1, 0.4]);
    add(eye, new THREE.SphereGeometry(0.015, 6, 5), pupilMat, [0, 0, 0.041], [0, 0, 0], [1, 1, 0.45]);
    add(eye, new THREE.SphereGeometry(0.006, 5, 4), whiteMat, [-0.01, 0.012, 0.048]);
    add(eye, new THREE.BoxGeometry(0.125, 0.016, 0.022), hairMat, [0, 0.067, 0.006], [0, 0, side * 0.05]);
    eyeGroups.push(eye);
  }

  /* brows, nose, mouth */
  const browL = add(headGroup, new THREE.BoxGeometry(0.155, 0.032, 0.04), hairMat, [-0.145, 0.165, 0.385], [0, 0, -0.12]);
  const browR = add(headGroup, new THREE.BoxGeometry(0.155, 0.032, 0.04), hairMat, [0.145, 0.165, 0.385], [0, 0, 0.12]);
  add(headGroup, new THREE.ConeGeometry(0.05, 0.13, 4), skinMat, [0, -0.035, 0.435], [Math.PI / 2, 0, 0]);
  add(headGroup, new THREE.BoxGeometry(0.075, 0.018, 0.022), mouthMat, [-0.038, -0.185, 0.4], [0, 0, -0.2]);
  add(headGroup, new THREE.BoxGeometry(0.075, 0.018, 0.022), mouthMat, [0.038, -0.185, 0.4], [0, 0, 0.2]);
  add(headGroup, new THREE.BoxGeometry(0.055, 0.014, 0.018), mouthMat, [0, -0.208, 0.398]);

  /* hair cap — full enough to read as hair, high enough to keep the face open */
  const hairCap = add(headGroup, new THREE.SphereGeometry(0.437, 16, 12, 0, TAU, 0, 1.3), hairMat, [0, 0.035, -0.02], [0, 0, 0], [0.99, 1.02, 1.02]);

  /* chest pendant / elemental focus */
  const chestCore = add(torso, new THREE.OctahedronGeometry(0.075, 0), accentMat, [0, 0.18, 0.31], [0, 0, 0], [0.85, 1.3, 0.55]);
  const chestGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: el.color, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }));
  chestGlow.position.set(0, 0.18, 0.36);
  chestGlow.scale.set(0.9, 0.9, 1);
  torso.add(chestGlow);

  const health = makeHealthSprite(el);
  root.add(health.sprite);

  return {
    el, root, body, torso, headGroup, hipL, hipR, kneeL, kneeR,
    shoulderL, shoulderR, elbowL, elbowR, handL, handR,
    chest, chestCore, chestGlow, aura, shadow, groundRing, groundRing2, ringMat,
    bodyMat, armorMat, accentMat, brightMat, glassMat,
    skinMat, hairMat, pantsMat, leatherMat, metalMat, furMat, whiteMat, darkMat, mouthMat,
    sleeveL: shoulderL.children[2], sleeveR: shoulderR.children[2],
    upperL, upperR, foreL, foreR, skirt, belt, buckle, corset, hairCap,
    browL, browR, eyeGroups, irisMat, eyeWhiteMat, pupilMat,
    health, glow, extra: {}, baseEmissive: bodyMat.emissiveIntensity
  };
}

/* ------------------------------- fire ------------------------------------ */

function styleFire(rig) {
  const { body, torso, headGroup, shoulderL, shoulderR, elbowL, elbowR, accentMat, bodyMat } = rig;
  rig.skinMat.color.setHex(0xb97b55);
  rig.hairMat.color.setHex(0x1d1411);
  rig.pantsMat.color.setHex(0x2b1715);
  rig.leatherMat.color.setHex(0x3d2018);
  rig.metalMat.color.setHex(0xd9a34c);
  rig.eyeMat = rig.irisMat;
  rig.irisMat.color.setHex(0xffb347);
  rig.irisMat.emissive.setHex(0xff7a1e);

  bodyMat.color.setHex(0x7c2014);
  bodyMat.emissive.setHex(0xff3a08);
  bodyMat.emissiveIntensity = 0.2;
  rig.armorMat.color.setHex(0x40190f);
  rig.armorMat.emissive.setHex(0xff5a18);
  rig.armorMat.emissiveIntensity = 0.2;
  rig.brightMat.color.setHex(0xf0b45c);
  rig.brightMat.emissive.setHex(0xff7a1e);
  rig.brightMat.emissiveIntensity = 0.45;

  /* sleeveless martial tunic with a wrapped waist */
  rig.sleeveL.visible = false;
  rig.sleeveR.visible = false;
  add(torso, new THREE.BoxGeometry(0.72, 0.075, 0.5), rig.brightMat, [0, 0.37, 0.05], [0.16, 0, 0]);
  add(torso, new THREE.BoxGeometry(0.08, 0.58, 0.06), rig.brightMat, [-0.19, -0.12, 0.3], [0, 0, 0.18]);
  add(torso, new THREE.BoxGeometry(0.08, 0.58, 0.06), rig.brightMat, [0.19, -0.12, 0.3], [0, 0, -0.18]);
  const sash = add(body, new THREE.BoxGeometry(0.52, 0.15, 0.46), std(0x8f2416, { roughness: 0.9 }), [0.02, 1.47, 0.02], [0, 0, 0.32]);
  sash.castShadow = true;

  /* left shoulder guard */
  add(shoulderL, new THREE.DodecahedronGeometry(0.27, 0), rig.armorMat, [-0.06, 0.02, 0], [0, 0.3, 0.2], [1.1, 0.9, 1]);
  add(shoulderL, new THREE.BoxGeometry(0.34, 0.06, 0.38), rig.brightMat, [-0.11, 0.18, 0], [0, 0, 0.24]);
  add(shoulderR, new THREE.TorusGeometry(0.19, 0.035, 4, 16, Math.PI), rig.brightMat, [0, 0.04, 0], [Math.PI / 2, 0, 0.2]);

  /* wrist wraps */
  for (const grp of [elbowL, elbowR]) {
    add(grp, new THREE.CylinderGeometry(0.125, 0.13, 0.16, 8), std(0xd9b38a, { roughness: 0.95 }), [0, -0.42, 0]);
    add(grp, new THREE.CylinderGeometry(0.128, 0.128, 0.035, 8), rig.armorMat, [0, -0.36, 0]);
  }

  /* black hair, side-swept fringe and a high tail */
  add(headGroup, new THREE.SphereGeometry(0.18, 8, 6), rig.hairMat, [-0.17, 0.23, 0.27], [0, 0, 0.28], [1.3, 0.55, 0.7]);
  add(headGroup, new THREE.SphereGeometry(0.15, 8, 6), rig.hairMat, [0.13, 0.26, 0.28], [0, 0, -0.3], [1, 0.45, 0.65]);
  add(headGroup, new THREE.SphereGeometry(0.08, 8, 6), rig.hairMat, [0.25, 0.14, 0.3], [0, 0, -0.3], [0.9, 0.6, 0.7]);
  const tie = add(headGroup, new THREE.TorusGeometry(0.075, 0.025, 4, 10), rig.brightMat, [0, 0.37, -0.19], [Math.PI / 2, 0, 0]);
  tie.castShadow = false;
  const ponytail = tube(headGroup, [
    [0, 0.36, -0.22], [0.02, 0.55, -0.38], [0.03, 0.53, -0.62], [0.01, 0.29, -0.79], [0, 0.04, -0.82]
  ], 0.085, rig.hairMat, 10, 5);

  /* ember fist flames */
  const flameMat = new THREE.SpriteMaterial({ map: rig.glow, color: 0xff8a32, transparent: true, opacity: 0.78, blending: THREE.AdditiveBlending, depthWrite: false });
  const handFlames = [];
  for (const [hand, side] of [[rig.handL, -1], [rig.handR, 1]]) {
    const f = new THREE.Sprite(flameMat.clone());
    f.scale.set(0.6, 0.7, 1);
    f.position.set(side * 0.02, -0.08, 0.2);
    hand.add(f);
    handFlames.push(f);
  }

  const embers = [];
  for (let i = 0; i < 7; i++) {
    const e = new THREE.Sprite(new THREE.SpriteMaterial({ map: rig.glow, color: i % 2 ? 0xffb347 : 0xff5a18, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    e.scale.set(0.24, 0.24, 1);
    body.add(e);
    embers.push({ sprite: e, a: (i / 7) * TAU, r: 1.0 + Math.random() * 0.45, y: 1.1 + Math.random() * 1.8, speed: 0.45 + Math.random() * 0.5 });
  }

  rig.extra = { handFlames, embers, ponytail };
}

/* ------------------------------- water ----------------------------------- */

function styleWater(rig) {
  const { body, torso, headGroup, shoulderL, shoulderR, elbowL, elbowR, accentMat } = rig;
  rig.skinMat.color.setHex(0x8f5c3e);
  rig.hairMat.color.setHex(0x2a1b17);
  rig.pantsMat.color.setHex(0x1b3440);
  rig.leatherMat.color.setHex(0x203a44);
  rig.metalMat.color.setHex(0xbfe8ee);
  rig.irisMat.color.setHex(0x8cecff);
  rig.irisMat.emissive.setHex(0x30c6ff);

  rig.bodyMat.color.setHex(0x1c5a74);
  rig.bodyMat.emissive.setHex(0x0c8fbd);
  rig.bodyMat.emissiveIntensity = 0.26;
  rig.armorMat.color.setHex(0x123746);
  rig.armorMat.emissive.setHex(0x26b9e6);
  rig.armorMat.emissiveIntensity = 0.22;
  rig.brightMat.color.setHex(0xdff6ff);
  rig.brightMat.emissive.setHex(0x30c6ff);
  rig.brightMat.emissiveIntensity = 0.4;

  /* long water-tribe coat */
  rig.skirt.scale.set(1.06, 1.35, 1.06);
  rig.skirt.position.y = 1.16;
  add(body, new THREE.CylinderGeometry(0.46, 0.58, 0.12, 10), rig.furMat, [0, 0.93, 0]);

  /* fur collar and cuffs */
  add(body, new THREE.TorusGeometry(0.29, 0.085, 5, 18), rig.furMat, [0, 2.82, 0], [Math.PI / 2, 0, 0], [1.12, 1, 1]);
  for (const grp of [elbowL, elbowR]) {
    add(grp, new THREE.TorusGeometry(0.135, 0.045, 4, 12), rig.furMat, [0, -0.47, 0], [Math.PI / 2, 0, 0]);
    add(grp, new THREE.CylinderGeometry(0.09, 0.1, 0.12, 7), rig.brightMat, [0, -0.5, 0]);
  }
  rig.sleeveL.scale.set(1.15, 1.2, 1.15);
  rig.sleeveR.scale.set(1.15, 1.2, 1.15);

  /* shoulder capelets */
  add(shoulderL, new THREE.SphereGeometry(0.21, 8, 6), rig.bodyMat, [-0.01, -0.04, 0], [0, 0, 0.2], [1.2, 0.7, 1.1]);
  add(shoulderR, new THREE.SphereGeometry(0.21, 8, 6), rig.bodyMat, [0.01, -0.04, 0], [0, 0, -0.2], [1.2, 0.7, 1.1]);
  add(shoulderL, new THREE.SphereGeometry(0.12, 8, 6), rig.brightMat, [-0.03, 0.12, 0], [0, 0, 0], [0.8, 1.2, 0.85]);
  add(shoulderR, new THREE.SphereGeometry(0.12, 8, 6), rig.brightMat, [0.03, 0.12, 0], [0, 0, 0], [0.8, 1.2, 0.85]);

  /* water flask */
  const flask = add(body, new THREE.CylinderGeometry(0.11, 0.14, 0.3, 8), rig.brightMat, [0.42, 1.45, -0.05], [0, 0, -0.15]);
  flask.castShadow = true;
  add(body, new THREE.TorusGeometry(0.12, 0.018, 4, 12), rig.metalMat, [0.42, 1.31, -0.05], [Math.PI / 2, 0, 0]);

  /* long hair with side loops and beads */
  add(headGroup, new THREE.SphereGeometry(0.4, 12, 10), rig.hairMat, [0, -0.04, -0.19], [0, 0, 0], [0.9, 1.3, 0.55]);
  add(headGroup, new THREE.SphereGeometry(0.17, 8, 6), rig.hairMat, [-0.14, 0.24, 0.27], [0, 0, 0.24], [1.2, 0.52, 0.62]);
  add(headGroup, new THREE.SphereGeometry(0.15, 8, 6), rig.hairMat, [0.15, 0.23, 0.27], [0, 0, -0.2], [1.05, 0.48, 0.6]);
  const hairLocks = [];
  for (const side of [-1, 1]) {
    const lock = tube(headGroup, [
      [side * 0.3, 0.12, 0.1], [side * 0.42, -0.05, 0.16], [side * 0.46, -0.35, 0.1], [side * 0.4, -0.62, -0.02]
    ], 0.055, rig.hairMat, 8, 4);
    hairLocks.push(lock);
    add(headGroup, new THREE.SphereGeometry(0.06, 6, 5), rig.brightMat, [side * 0.42, -0.62, -0.02]);
  }
  add(headGroup, new THREE.SphereGeometry(0.2, 10, 8), rig.hairMat, [0, 0.24, -0.03], [0, 0, 0], [1.05, 0.6, 0.95]);

  /* slim circlet */
  add(headGroup, new THREE.TorusGeometry(0.39, 0.022, 4, 28), rig.metalMat, [0, 0.22, 0], [Math.PI / 2, 0, 0]);
  add(headGroup, new THREE.SphereGeometry(0.06, 8, 6), rig.accentMat, [0, 0.25, 0.36], [0, 0, 0], [1, 1.25, 0.4]);

  const bubbles = [];
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.06 + Math.random() * 0.09, 7, 5), new THREE.MeshBasicMaterial({ color: 0xc7f7ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    body.add(b);
    bubbles.push({ mesh: b, a: (i / 7) * TAU, r: 0.9 + Math.random() * 0.65, y: 0.5 + Math.random() * 2.6, speed: 0.45 + Math.random() * 0.45 });
  }

  const tide = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.028, 4, 32), new THREE.MeshBasicMaterial({ color: 0x9fefff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  tide.rotation.x = Math.PI / 2;
  tide.position.y = 1.6;
  body.add(tide);

  rig.extra = { bubbles, tide, hairLocks };
}

/* ------------------------------- earth ----------------------------------- */

function styleEarth(rig) {
  const { body, torso, headGroup, shoulderL, shoulderR, elbowL, elbowR, accentMat } = rig;
  rig.root.scale.setScalar(1.14);
  rig.skinMat.color.setHex(0x764b34);
  rig.hairMat.color.setHex(0x1f1612);
  rig.pantsMat.color.setHex(0x3a3227);
  rig.leatherMat.color.setHex(0x4a3524);
  rig.metalMat.color.setHex(0x8d8266);
  rig.irisMat.color.setHex(0xa8df63);
  rig.irisMat.emissive.setHex(0x8fce4a);

  rig.bodyMat.color.setHex(0x4b5b29);
  rig.bodyMat.emissive.setHex(0x6cae2c);
  rig.bodyMat.emissiveIntensity = 0.14;
  rig.armorMat.color.setHex(0x5a523c);
  rig.armorMat.emissive.setHex(0x2d4215);
  rig.armorMat.emissiveIntensity = 0.16;

  const stone = std(0x6c6654, { roughness: 0.95, metalness: 0.06 });
  const moss = std(0x4f7126, { roughness: 0.98, metalness: 0 });
  rig.extra.stone = stone;
  rig.extra.moss = moss;

  /* broad, sleeveless earthbender build */
  rig.sleeveL.visible = false;
  rig.sleeveR.visible = false;
  rig.chest.scale.set(1.3, 1, 0.84);
  rig.upperL.scale.set(1.32, 1.04, 1.2);
  rig.upperR.scale.set(1.32, 1.04, 1.2);
  rig.foreL.scale.set(1.22, 1.05, 1.16);
  rig.foreR.scale.set(1.22, 1.05, 1.16);
  rig.skirt.scale.set(1.05, 0.82, 1.05);
  rig.skirt.position.y = 1.32;

  /* wide leather belt and stone buckle */
  rig.belt.scale.set(1.09, 1, 0.9);
  rig.buckle.geometry = new THREE.DodecahedronGeometry(0.13, 0);
  rig.buckle.material = stone;
  rig.buckle.position.z = 0.35;
  add(torso, new THREE.BoxGeometry(0.14, 0.72, 0.08), rig.leatherMat, [-0.12, 0.02, 0.29], [0, 0, 0.32]);
  const pauldron = add(shoulderL, new THREE.DodecahedronGeometry(0.32, 0), stone, [-0.02, 0.04, 0], [0, 0.3, 0.15], [1.1, 0.85, 1.05]);
  pauldron.castShadow = true;
  add(shoulderL, new THREE.IcosahedronGeometry(0.17, 0), moss, [-0.02, 0.24, 0], [0, 0, 0], [1.2, 0.4, 1.1]);
  add(shoulderR, new THREE.SphereGeometry(0.2, 8, 6), rig.bodyMat, [0, 0.04, 0], [0, 0, 0], [1.1, 0.7, 1.05]);

  /* stone bracers */
  for (const grp of [elbowL, elbowR]) {
    add(grp, new THREE.CylinderGeometry(0.155, 0.17, 0.24, 7), stone, [0, -0.38, 0]);
    add(grp, new THREE.BoxGeometry(0.3, 0.06, 0.31), moss, [0, -0.29, 0]);
  }

  /* jaw, thick brows and a short topknot */
  add(headGroup, new THREE.BoxGeometry(0.34, 0.14, 0.28), rig.skinMat, [0, -0.29, 0.16], [0, 0, 0], [1, 1, 0.85]);
  rig.browL.scale.set(1.3, 1.35, 1.1);
  rig.browR.scale.set(1.3, 1.35, 1.1);
  add(headGroup, new THREE.SphereGeometry(0.17, 8, 6), rig.hairMat, [0, 0.38, -0.18], [0, 0, 0], [1, 0.8, 1]);
  add(headGroup, new THREE.TorusGeometry(0.1, 0.025, 4, 12), rig.metalMat, [0, 0.34, -0.18], [Math.PI / 2, 0, 0]);
  add(headGroup, new THREE.BoxGeometry(0.26, 0.075, 0.16), rig.hairMat, [0, -0.3, 0.23], [0, 0, 0]);
  add(headGroup, new THREE.SphereGeometry(0.18, 8, 6), rig.hairMat, [0, -0.12, -0.35], [0, 0, 0], [1.2, 0.9, 0.45]);

  const pebbles = [];
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(new THREE.DodecahedronGeometry(0.1 + Math.random() * 0.1, 0), stone);
    p.castShadow = true;
    body.add(p);
    pebbles.push({ mesh: p, a: (i / 6) * TAU, r: 1.05 + Math.random() * 0.5, y: 0.7 + Math.random() * 2.1, speed: 0.3 + Math.random() * 0.35 });
  }

  const gem = add(torso, new THREE.OctahedronGeometry(0.09, 0), accentMat, [0, 0.06, 0.31], [0, 0, 0], [0.8, 1.3, 0.5]);
  rig.extra.pebbles = pebbles;
  rig.extra.gem = gem;
}

/* -------------------------------- air ------------------------------------ */

function styleAir(rig) {
  const { body, torso, headGroup, shoulderL, shoulderR, elbowL, elbowR, accentMat } = rig;
  rig.root.scale.setScalar(0.98);
  rig.skinMat.color.setHex(0xdda97f);
  rig.hairMat.color.setHex(0xe9e4f4);
  rig.pantsMat.color.setHex(0x4b3f73);
  rig.leatherMat.color.setHex(0x3a3157);
  rig.metalMat.color.setHex(0xc8bced);
  rig.irisMat.color.setHex(0xd9c7ff);
  rig.irisMat.emissive.setHex(0xb18cff);

  rig.bodyMat.color.setHex(0x6a57a6);
  rig.bodyMat.emissive.setHex(0x9a7cff);
  rig.bodyMat.emissiveIntensity = 0.24;
  rig.bodyMat.transparent = true;
  rig.bodyMat.opacity = 0.94;
  rig.armorMat.color.setHex(0x4b3f78);
  rig.armorMat.emissive.setHex(0x9c86ff);
  rig.armorMat.emissiveIntensity = 0.18;
  rig.brightMat.color.setHex(0xede4ff);
  rig.brightMat.emissive.setHex(0xb18cff);
  rig.brightMat.emissiveIntensity = 0.45;

  /* flowing air-nomad robe */
  rig.skirt.scale.set(1.12, 1.5, 1.12);
  rig.skirt.position.y = 1.12;
  rig.skirt.material.transparent = true;
  rig.skirt.material.opacity = 0.94;
  rig.sleeveL.visible = false;
  rig.sleeveR.visible = false;
  rig.sleeveL.scale.set(1, 1, 1);
  rig.sleeveR.scale.set(1, 1, 1);

  /* draped shoulder cloth and high collar */
  add(shoulderL, new THREE.SphereGeometry(0.23, 8, 6), rig.bodyMat, [-0.01, -0.03, 0], [0, 0, 0.16], [1.3, 0.55, 1.15]);
  add(shoulderR, new THREE.SphereGeometry(0.23, 8, 6), rig.bodyMat, [0.01, -0.03, 0], [0, 0, -0.16], [1.3, 0.55, 1.15]);
  add(body, new THREE.TorusGeometry(0.27, 0.05, 4, 18), rig.brightMat, [0, 2.8, 0], [Math.PI / 2, 0, 0]);
  add(torso, new THREE.BoxGeometry(0.58, 0.07, 0.48), rig.brightMat, [0, 0.34, 0.04], [0.12, 0, 0]);

  /* wrapped forearms */
  for (const grp of [elbowL, elbowR]) {
    add(grp, new THREE.CylinderGeometry(0.12, 0.135, 0.22, 8), rig.brightMat, [0, -0.4, 0], [0, 0, 0], [1, 1, 1]);
    add(grp, new THREE.CylinderGeometry(0.125, 0.125, 0.03, 8), rig.bodyMat, [0, -0.34, 0]);
    add(grp, new THREE.CylinderGeometry(0.123, 0.123, 0.03, 8), rig.bodyMat, [0, -0.44, 0]);
  }

  /* short pale hair with a swept fringe */
  add(headGroup, new THREE.SphereGeometry(0.16, 8, 6), rig.hairMat, [-0.18, 0.24, 0.28], [0, 0, 0.3], [1.35, 0.5, 0.65]);
  add(headGroup, new THREE.SphereGeometry(0.14, 8, 6), rig.hairMat, [0.08, 0.27, 0.27], [0, 0, -0.34], [1.2, 0.45, 0.6]);
  add(headGroup, new THREE.SphereGeometry(0.2, 8, 6), rig.hairMat, [0, -0.03, -0.27], [0, 0, 0], [1.05, 0.85, 0.5]);

  /* spiral air sigil on the forehead */
  const sigil = add(headGroup, new THREE.TorusGeometry(0.055, 0.012, 4, 14, Math.PI * 1.45), rig.accentMat, [0, 0.245, 0.392], [0, 0, 0.5]);
  sigil.castShadow = false;
  sigil.userData.noOutline = true;
  add(headGroup, new THREE.SphereGeometry(0.014, 5, 4), rig.accentMat, [0.02, 0.25, 0.398]);

  /* scarf ribbons */
  const ribbons = [];
  const ribbonMat = toonMaterial({ color: 0xc3b0ff, transparent: true, opacity: 0.78, side: THREE.DoubleSide, emissive: 0x8c6cff, emissiveIntensity: 0.4 });
  for (let i = 0; i < 3; i++) {
    const ribbon = tube(body, [
      [(i - 1) * 0.16, 2.78, -0.2], [(i - 1) * 0.22, 2.55, -0.55], [(i - 1) * 0.3, 2.2, -0.9], [(i - 1) * 0.36, 1.8, -1.12]
    ], 0.05 - i * 0.006, ribbonMat, 10, 4);
    ribbons.push({ mesh: ribbon, phase: i * 1.3, base: i });
  }

  /* halo, wind swirl and crescents */
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.03, 4, 40), accentMat);
  halo.position.y = 0.6;
  halo.rotation.x = Math.PI / 2;
  halo.userData.noOutline = true;
  headGroup.add(halo);

  const swirl = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.028, 3, 40, Math.PI * 1.4), new THREE.MeshBasicMaterial({ color: 0xd9ccff, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false }));
  swirl.rotation.x = Math.PI / 2;
  swirl.position.y = 0.12;
  body.add(swirl);
  void swirl;

  const crescents = [];
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.022, 3, 18, Math.PI * 1.3), accentMat);
    body.add(c);
    crescents.push({ mesh: c, a: (i / 3) * TAU, r: 1.05 + i * 0.15, y: 1.4 + i * 0.8, speed: 0.65 + i * 0.15 });
  }

  rig.extra = { ribbons, halo, swirl, crescents };
}

/* ------------------------------- factory --------------------------------- */

export function createAvatar(id) {
  const rig = createRig(id);
  if (id === 'fire') styleFire(rig);
  if (id === 'water') styleWater(rig);
  if (id === 'earth') styleEarth(rig);
  if (id === 'air') styleAir(rig);

  addInkOutlines(rig.root, { thickness: 0.038, color: 0x17141c, minRadius: 0.09 });

  const state = {
    time: Math.random() * 10,
    walk: 0,
    flash: 0,
    casting: 0,
    movingBlend: 0,
    spawn: 0,
    blink: 1.5 + Math.random() * 3,
    blinkPhase: 0
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
    state.blink = 1.5 + Math.random() * 3;
    rig.root.visible = true;
    rig.root.scale.setScalar(id === 'earth' ? 1.14 : id === 'air' ? 0.98 : 1);
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

    /* blink */
    state.blink -= dt;
    if (state.blink <= 0) {
      state.blink = 2.2 + Math.random() * 3.4;
      state.blinkPhase = 0.14;
    }
    if (state.blinkPhase > 0) state.blinkPhase = Math.max(0, state.blinkPhase - dt);
    const blink = state.blinkPhase > 0 ? Math.max(0.08, Math.abs(1 - state.blinkPhase / 0.07)) : 1;
    for (const eye of rig.eyeGroups) eye.scale.y = blink;

    const t = state.time;
    const wb = state.movingBlend;
    const bob = Math.sin(state.walk * 2) * 0.035 * wb + Math.sin(t * 1.8) * 0.025;
    const hover = id === 'air' ? 0.17 + Math.sin(t * 1.4) * 0.055 : 0;
    rig.body.position.y = bob + hover;
    rig.body.scale.setScalar(0.7 + 0.3 * easeOutBack(state.spawn));

    /* legs + knees */
    const swing = Math.sin(state.walk) * 0.7 * wb;
    rig.hipL.rotation.x = swing;
    rig.hipR.rotation.x = -swing;
    rig.hipL.rotation.z = Math.sin(state.walk) * 0.04 * wb;
    rig.hipR.rotation.z = -Math.sin(state.walk) * 0.04 * wb;
    rig.kneeL.rotation.x = Math.max(0, Math.sin(state.walk)) * 0.85 * wb;
    rig.kneeR.rotation.x = Math.max(0, -Math.sin(state.walk)) * 0.85 * wb;

    /* arms + elbows */
    const armSwing = Math.sin(state.walk) * 0.52 * wb;
    rig.shoulderL.rotation.x = -armSwing;
    rig.shoulderR.rotation.x = armSwing;
    rig.shoulderL.rotation.z = -0.06 - Math.sin(t * 1.7) * 0.03;
    rig.shoulderR.rotation.z = 0.06 + Math.sin(t * 1.7 + 1) * 0.03;
    rig.elbowL.rotation.x = -0.14 - Math.max(0, armSwing) * 0.4;
    rig.elbowR.rotation.x = -0.14 - Math.max(0, -armSwing) * 0.4;

    if (state.casting > 0.02) {
      const c = Math.sin(Math.min(1, (1 - state.casting)) * Math.PI);
      rig.shoulderR.rotation.x = -1.62 * c - 0.08;
      rig.shoulderR.rotation.z = 0.24 * c;
      rig.elbowR.rotation.x = -0.5 * c - 0.12;
      rig.shoulderL.rotation.x = -0.38 * c;
      rig.elbowL.rotation.x = -0.35 * c - 0.12;
      rig.torso.rotation.y = -0.2 * c;
      rig.headGroup.rotation.x = -0.12 * c;
    } else {
      rig.torso.rotation.y *= 0.9;
      rig.headGroup.rotation.x *= 0.9;
    }

    rig.headGroup.rotation.y = Math.sin(t * 0.55) * 0.1 * (1 - wb * 0.6);
    rig.torso.rotation.z = Math.sin(t * 1.1) * 0.015;
    rig.torso.scale.set(1 + Math.sin(t * 1.5) * 0.006, 1 + Math.sin(t * 1.5) * 0.008, 1);

    /* material glow */
    rig.bodyMat.emissiveIntensity = baseColors.body + state.flash * 2.2 + Math.sin(t * 2.3) * 0.03;
    rig.armorMat.emissiveIntensity = baseColors.armor + state.flash * 1.8;
    rig.accentMat.emissiveIntensity = baseColors.accent + state.flash * 3 + Math.sin(t * 3) * 0.15;
    rig.aura.material.opacity = 0.14 + Math.sin(t * 1.6) * 0.05 + state.casting * 0.1;
    rig.aura.scale.setScalar(4.2 + Math.sin(t * 1.2) * 0.3);
    rig.groundRing.rotation.z += dt * 0.35;
    rig.groundRing2.rotation.z -= dt * 0.2;
    rig.groundRing.material.opacity = 0.32 + Math.sin(t * 2) * 0.12 + state.casting * 0.18;

    rig.chestGlow.material.opacity = 0.2 + Math.sin(t * 2.4) * 0.08 + state.flash * 0.3;
    rig.chestGlow.scale.setScalar(0.75 + Math.sin(t * 2.1) * 0.1);
    rig.chestCore.rotation.y += dt * 0.8;

    /* element flourishes */
    if (id === 'fire') {
      const { handFlames, embers, ponytail } = rig.extra;
      handFlames.forEach((f, i) => {
        const pulse = 0.86 + Math.sin(t * 5 + i * 2.1) * 0.18;
        f.scale.set(0.55 * pulse, 0.66 * pulse, 1);
        f.material.opacity = 0.55 + Math.sin(t * 4.2 + i) * 0.2;
      });
      ponytail.rotation.z = Math.sin(t * 1.7) * 0.08;
      ponytail.rotation.x = Math.sin(t * 1.2 + 1) * 0.05;
      for (const e of embers) {
        e.a += dt * e.speed;
        e.sprite.position.set(Math.cos(e.a) * e.r, e.y + Math.sin(t * 1.4 + e.a) * 0.3 - rig.body.position.y, Math.sin(e.a) * e.r);
        e.sprite.material.opacity = 0.3 + Math.sin(t * 3 + e.a) * 0.22;
      }
    }
    if (id === 'water') {
      const { bubbles, tide, hairLocks } = rig.extra;
      for (const b of bubbles) {
        b.a += dt * b.speed * 0.7;
        b.mesh.position.set(Math.cos(b.a) * b.r, b.y + Math.sin(t * 1.2 + b.a) * 0.15 - rig.body.position.y, Math.sin(b.a) * b.r);
        b.mesh.scale.setScalar(0.85 + Math.sin(t * 3 + b.a) * 0.22);
      }
      tide.rotation.z += dt * 0.8;
      tide.position.y = 1.6 + Math.sin(t * 1.5) * 0.08 - rig.body.position.y;
      hairLocks.forEach((h, i) => { h.rotation.z = Math.sin(t * 1.3 + i) * 0.06; });
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
      gem.position.y = 0.06 + Math.sin(t * 2) * 0.02;
    }
    if (id === 'air') {
      const { ribbons, halo, swirl, crescents } = rig.extra;
      ribbons.forEach((r) => {
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

    rig.health.sprite.position.y = 4.75 - rig.body.position.y;
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
