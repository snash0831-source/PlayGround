import * as THREE from 'three';
import { glowTexture } from './world.js';
import { ELEMENTS } from './config.js';
import { toonMaterial } from './toon.js';

const TAU = Math.PI * 2;

function canvas2d(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function ringTexture() {
  if (ringTexture._t) return ringTexture._t;
  const [c, ctx] = canvas2d(128, 128);
  ctx.translate(64, 64);
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.shadowColor = 'rgba(255,255,255,0.9)';
  ctx.shadowBlur = 10;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, 46, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 56, 0, TAU);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  ringTexture._t = tex;
  return tex;
}

/* ------------------------------ particles -------------------------------- */

const PARTICLE_CAP = 2200;

class ParticleField {
  constructor(scene) {
    const positions = new Float32Array(PARTICLE_CAP * 3);
    const colors = new Float32Array(PARTICLE_CAP * 3);
    const sizes = new Float32Array(PARTICLE_CAP);
    const alphas = new Float32Array(PARTICLE_CAP);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {},
      vertexShader: `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (340.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          float a = smoothstep(0.5, 0.05, d);
          a *= a;
          gl_FragColor = vec4(vColor, a * vAlpha);
        }
      `
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    scene.add(this.points);
    this.geo = geo;
    this.positions = positions;
    this.colors = colors;
    this.sizes = sizes;
    this.alphas = alphas;
    this.pool = [];
    for (let i = 0; i < PARTICLE_CAP; i++) this.pool.push({ active: false });
    this.cursor = 0;
  }

  spawn(opts) {
    let p;
    for (let i = 0; i < 40; i++) {
      const cand = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % PARTICLE_CAP;
      if (!cand.active) { p = cand; break; }
    }
    if (!p) {
      p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % PARTICLE_CAP;
    }
    p.active = true;
    p.x = opts.x; p.y = opts.y; p.z = opts.z;
    p.vx = opts.vx || 0; p.vy = opts.vy || 0; p.vz = opts.vz || 0;
    p.life = opts.life || 1;
    p.maxLife = p.life;
    p.size = opts.size || 1;
    p.shrink = opts.shrink ?? 0.7;
    p.gravity = opts.gravity ?? 0;
    p.drag = opts.drag ?? 1.8;
    p.color = opts.color;
    p.fadeIn = opts.fadeIn ?? 0;
    p.turb = opts.turb || 0;
    p.phase = Math.random() * TAU;
    return p;
  }

  update(dt, time) {
    const pos = this.positions;
    const col = this.colors;
    const sz = this.sizes;
    const al = this.alphas;
    for (let i = 0; i < PARTICLE_CAP; i++) {
      const p = this.pool[i];
      if (!p.active) {
        sz[i] = 0;
        al[i] = 0;
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        sz[i] = 0;
        al[i] = 0;
        continue;
      }
      const k = Math.max(0, Math.min(1, dt * p.drag));
      p.vx -= p.vx * k;
      p.vy -= p.vy * k;
      p.vz -= p.vz * k;
      p.vy += p.gravity * dt;
      if (p.turb) {
        p.x += Math.sin(time * 3 + p.phase) * p.turb * dt;
        p.z += Math.cos(time * 2.4 + p.phase) * p.turb * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const lifeK = p.life / p.maxLife;
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;
      col[i * 3] = p.color.r;
      col[i * 3 + 1] = p.color.g;
      col[i * 3 + 2] = p.color.b;
      sz[i] = p.size * (p.shrink + (1 - p.shrink) * lifeK);
      const fade = p.fadeIn > 0 ? Math.min(1, (1 - lifeK) / p.fadeIn) : 1;
      al[i] = Math.min(1, lifeK * 1.5) * fade;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }
}

/* ---------------------------------- FX ----------------------------------- */

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'fx';
    scene.add(this.group);
    this.glow = glowTexture();
    this.particles = new ParticleField(scene);
    this.rings = [];
    this.texts = [];
    this.debrisBursts = [];
    this.meteors = [];
    this.telegraphs = [];
    this.cyclones = [];
    this.ringTex = ringTexture();
    this._color = new THREE.Color();
  }

  /* ------------------------------- teardown -------------------------------- */

  clear() {
    for (const r of this.rings) {
      this.group.remove(r.mesh);
      r.mesh.material.dispose();
      if (r.kind === 'wave') r.mesh.geometry.dispose();
    }
    this.rings.length = 0;

    for (const t of this.texts) {
      this.group.remove(t.sprite);
      t.sprite.material.dispose();
      t.tex.dispose();
    }
    this.texts.length = 0;

    for (const d of this.debrisBursts) {
      this.group.remove(d.group);
      d.group.traverse((child) => { if (child.geometry) child.geometry.dispose(); });
      d.mat.dispose();
    }
    this.debrisBursts.length = 0;

    for (const m of this.meteors) {
      this.group.remove(m.group);
      m.group.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    }
    this.meteors.length = 0;

    for (const t of this.telegraphs) {
      this.group.remove(t.ring);
      this.group.remove(t.inner);
      t.mat.dispose();
      t.innerMat.dispose();
      t.ring.geometry.dispose();
      t.inner.geometry.dispose();
    }
    this.telegraphs.length = 0;

    for (const c of this.cyclones) {
      this.group.remove(c.group);
      c.rings.forEach((r) => { r.mesh.geometry.dispose(); r.mesh.material.dispose(); });
      c.glow.material.dispose();
    }
    this.cyclones.length = 0;

    for (const p of this.particles.pool) p.active = false;
    const attrs = this.particles.geo.attributes;
    attrs.aSize.array.fill(0);
    attrs.aAlpha.array.fill(0);
    attrs.aSize.needsUpdate = true;
    attrs.aAlpha.needsUpdate = true;
  }

  /* --------------------------- primitive effects -------------------------- */

  burst(x, y, z, color, count = 20, opts = {}) {
    const c = this._color.set(color);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const up = (Math.random() - 0.24) * (opts.up ?? 1.2);
      const speed = (opts.speed ?? 5) * (0.25 + Math.random());
      const radial = Math.cos(up) * speed;
      const spread = opts.spread ?? 1;
      this.particles.spawn({
        x: x + (Math.random() - 0.5) * (opts.radius ?? 0.4),
        y: y + (Math.random() - 0.5) * (opts.radius ?? 0.4),
        z: z + (Math.random() - 0.5) * (opts.radius ?? 0.4),
        vx: Math.cos(a) * radial * spread,
        vy: Math.sin(up) * speed * 1.4 + (opts.lift ?? 0),
        vz: Math.sin(a) * radial * spread,
        life: (opts.life ?? 0.85) * (0.55 + Math.random() * 0.85),
        size: (opts.size ?? 0.5) * (0.5 + Math.random()),
        shrink: opts.shrink ?? 0.25,
        gravity: opts.gravity ?? 0,
        drag: opts.drag ?? 2.0,
        color: this._color.set(color).clone(),
        turb: opts.turb ?? 0
      });
    }
    if (opts.flash !== false) this.flash(x, y, z, color, opts.flashSize ?? 4.2, opts.flashLife ?? 0.28);
  }

  trail(x, y, z, color, size = 0.32, life = 0.36) {
    this.particles.spawn({
      x: x + (Math.random() - 0.5) * 0.16,
      y: y + (Math.random() - 0.5) * 0.16,
      z: z + (Math.random() - 0.5) * 0.16,
      vx: (Math.random() - 0.5) * 1.6,
      vy: 0.3 + Math.random() * 0.5,
      vz: (Math.random() - 0.5) * 1.6,
      life: life * (0.6 + Math.random() * 0.6),
      size: size * (0.6 + Math.random() * 0.7),
      shrink: 0.5,
      drag: 2,
      color: this._color.set(color).clone()
    });
  }

  flash(x, y, z, color, size = 5, life = 0.3) {
    const mat = new THREE.SpriteMaterial({ map: this.glow, color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    const s = new THREE.Sprite(mat);
    s.position.set(x, y, z);
    s.scale.set(size, size, 1);
    s.renderOrder = 5;
    this.group.add(s);
    this.rings.push({ kind: 'flash', mesh: s, life, maxLife: life, size });
  }

  ring(x, y, z, color, radius = 3, life = 0.55, opts = {}) {
    const mat = new THREE.SpriteMaterial({ map: this.ringTex, color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    const s = new THREE.Sprite(mat);
    s.position.set(x, y, z);
    s.scale.set(radius * 0.3, radius * 0.3, 1);
    s.renderOrder = 6;
    this.group.add(s);
    this.rings.push({ kind: 'ring', mesh: s, life, maxLife: life, radius, start: opts.start ?? 0.25, flat: false });
  }

  shockwave(x, y, z, color, radius = 6, life = 0.8, opts = {}) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: opts.opacity ?? 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.84, 1, 72), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y, z);
    ring.scale.setScalar(1);
    this.group.add(ring);
    this.rings.push({ kind: 'wave', mesh: ring, life, maxLife: life, radius, start: opts.start ?? 1 });
    return ring;
  }

  text(x, y, z, str, color = '#ffffff', opts = {}) {
    const [c, ctx] = canvas2d(256, 96);
    ctx.font = `700 ${opts.size ?? 56}px Rajdhani, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(3,5,12,0.85)';
    ctx.strokeText(str, 128, 48);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.fillText(str, 128, 48);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, opacity: 1 });
    const s = new THREE.Sprite(mat);
    const scale = opts.scale ?? 1;
    s.scale.set(3.4 * scale, 1.28 * scale, 1);
    s.position.set(x + (Math.random() - 0.5) * 0.7, y, z + (Math.random() - 0.5) * 0.7);
    s.renderOrder = 25;
    this.group.add(s);
    this.texts.push({ sprite: s, life: opts.life ?? 1.05, maxLife: opts.life ?? 1.05, vy: opts.vy ?? 1.8, tex });
  }

  debris(x, y, z, color, count = 18, opts = {}) {
    const mat = toonMaterial({
      color: opts.dark ? 0x2a2630 : color,
      emissive: color,
      emissiveIntensity: opts.emissive ?? 0.35,
      roughness: 0.7,
      metalness: 0.25,
      flatShading: true,
      transparent: true
    });
    const group = new THREE.Group();
    const geos = [
      new THREE.TetrahedronGeometry(0.28, 0),
      new THREE.OctahedronGeometry(0.25, 0),
      new THREE.DodecahedronGeometry(0.22, 0),
      new THREE.BoxGeometry(0.3, 0.18, 0.42)
    ];
    const items = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geos[i % geos.length], mat);
      const a = Math.random() * TAU;
      const speed = (opts.speed ?? 8) * (0.3 + Math.random());
      m.position.set(x, y + Math.random() * 1.2, z);
      m.scale.setScalar((opts.scale ?? 1) * (0.5 + Math.random() * 1.4));
      m.rotation.set(Math.random() * TAU, Math.random() * TAU, Math.random() * TAU);
      m.castShadow = false;
      group.add(m);
      items.push({ mesh: m, vx: Math.cos(a) * speed, vy: 3 + Math.random() * (opts.lift ?? 6), vz: Math.sin(a) * speed, spin: (Math.random() - 0.5) * 12 });
    }
    this.group.add(group);
    this.debrisBursts.push({ group, items, mat, life: opts.life ?? 2.2, maxLife: opts.life ?? 2.2 });
  }

  /* ------------------------------- projectiles ---------------------------- */

  createProjectileMesh(id, opts = {}) {
    const el = ELEMENTS[id];
    const group = new THREE.Group();
    const glow = this.glow;
    const small = opts.small;
    const coreMat = new THREE.MeshBasicMaterial({ color: el.bright, toneMapped: false });
    const color = opts.color ?? el.color;
    let core;
    if (id === 'fire') {
      core = new THREE.Mesh(new THREE.IcosahedronGeometry(small ? 0.17 : 0.27, 0), coreMat);
      core.scale.set(1, 1.1, 1.5);
    } else if (id === 'water') {
      core = new THREE.Mesh(new THREE.SphereGeometry(small ? 0.2 : 0.3, 10, 8), new THREE.MeshBasicMaterial({ color: el.bright, transparent: true, opacity: 0.92, toneMapped: false }));
      const halo = new THREE.Mesh(new THREE.TorusGeometry(small ? 0.28 : 0.42, 0.025, 4, 24), new THREE.MeshBasicMaterial({ color: el.color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      halo.rotation.x = Math.PI / 2;
      group.add(halo);
      group.userData.halo = halo;
    } else if (id === 'earth') {
      core = new THREE.Mesh(new THREE.DodecahedronGeometry(small ? 0.24 : 0.38, 0), toonMaterial({ color: 0x655f4b, emissive: el.color, emissiveIntensity: 0.5, roughness: 0.9, flatShading: true }));
    } else {
      core = new THREE.Mesh(new THREE.OctahedronGeometry(small ? 0.15 : 0.22, 0), coreMat);
      core.scale.set(0.55, 0.55, 2.4);
    }
    group.add(core);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, transparent: true, opacity: opts.small ? 0.65 : 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    sprite.scale.setScalar(small ? 1.1 : id === 'earth' ? 1.5 : 2.0);
    group.add(sprite);
    group.userData.core = core;
    group.userData.sprite = sprite;
    return group;
  }

  /* -------------------------------- meteors ------------------------------- */

  meteor(x, z, color, opts = {}) {
    const height = opts.height ?? 34;
    const duration = opts.duration ?? 0.85;
    const group = new THREE.Group();
    const mat = toonMaterial({ color: 0x352018, emissive: color, emissiveIntensity: 1.4, roughness: 0.8, flatShading: true });
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9, 0), mat);
    group.add(rock);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(5, 5, 1);
    group.add(glow);
    const tail = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    tail.scale.set(2.4, 8, 1);
    tail.position.y = 2.4;
    group.add(tail);
    group.position.set(x + (Math.random() - 0.5) * 2, height, z + (Math.random() - 0.5) * 2);
    group.scale.setScalar(opts.scale ?? 1);
    this.group.add(group);
    this.meteors.push({
      group, rock, glow, color, x, z, height, duration, t: 0,
      onImpact: opts.onImpact, trail: 0
    });
  }

  /* ------------------------------- telegraphs ----------------------------- */

  telegraph(x, y, z, color, radius, duration = 1) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.9, radius, 64), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y + 0.05, z);
    this.group.add(ring);
    const innerMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const inner = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.9, 48), innerMat);
    inner.rotation.x = -Math.PI / 2;
    inner.position.set(x, y + 0.045, z);
    this.group.add(inner);
    const item = { ring, inner, mat, innerMat, life: duration, maxLife: duration, radius };
    this.telegraphs.push(item);
    return item;
  }

  /* -------------------------------- cyclones ------------------------------ */

  cyclone(x, z, color, duration = 4.5) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const rings = [];
    for (let i = 0; i < 7; i++) {
      const r = 0.6 + (1 - i / 7) * 2.6;
      const torus = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.055 + i * 0.01, 4, 40),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.26 + i * 0.035, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      torus.rotation.x = Math.PI / 2;
      torus.position.y = 0.5 + i * 0.9;
      group.add(torus);
      rings.push({ mesh: torus, speed: (i % 2 ? -1 : 1) * (0.6 + i * 0.18), phase: i });
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.y = 3.4;
    glow.scale.set(7, 10, 1);
    group.add(glow);
    this.group.add(group);
    const item = { group, rings, glow, life: duration, maxLife: duration, emit: 0 };
    this.cyclones.push(item);
    return item;
  }

  /* -------------------------------- helpers ------------------------------- */

  muzzle(x, y, z, color) {
    this.burst(x, y, z, color, 8, { speed: 3.4, size: 0.32, life: 0.34, radius: 0.14, flashSize: 2.2, flashLife: 0.16, gravity: -1 });
  }

  impact(x, y, z, color, opts = {}) {
    this.burst(x, y, z, color, opts.count ?? 18, {
      speed: opts.speed ?? 6.5,
      size: opts.size ?? 0.5,
      life: opts.life ?? 0.7,
      gravity: opts.gravity ?? -3,
      radius: 0.35,
      flashSize: opts.flashSize ?? 3.6,
      flashLife: 0.24
    });
    this.ring(x, y + 0.2, z, color, opts.ring ?? 2.4, 0.42);
    if (opts.ground) {
      this.burst(x, 0.15, z, 0x6a5a44, 8, { speed: 3, size: 0.42, life: 0.8, gravity: 0.5, lift: 1.2 });
    }
  }

  death(x, y, z, color) {
    this.burst(x, y, z, color, 46, { speed: 9, size: 0.7, life: 1.2, gravity: -2.5, radius: 0.7, flashSize: 7, flashLife: 0.4 });
    this.ring(x, y + 0.3, z, color, 5.5, 0.7);
    this.shockwave(x, 0.08, z, color, 7, 0.8);
    this.debris(x, y + 1, z, color, 14, { speed: 7, emissive: 1.2, scale: 0.7, life: 1.6 });
    this.text(x, y + 3.6, z, 'SHATTERED', color, { size: 38, scale: 0.85, life: 1.2 });
  }

  towerExplosion(x, z, color) {
    this.burst(x, 6, z, color, 80, { speed: 13, size: 0.9, life: 1.6, gravity: -2, radius: 1.6, flashSize: 12, flashLife: 0.7 });
    this.burst(x, 5, z, 0xffe6b8, 40, { speed: 10, size: 0.6, life: 0.9, gravity: -1, radius: 1.2, flashSize: 0 });
    this.ring(x, 8, z, color, 14, 1.2);
    this.shockwave(x, 0.1, z, color, 22, 1.4, { start: 2, opacity: 0.55 });
    this.debris(x, 8, z, color, 34, { speed: 13, emissive: 1.1, scale: 1.5, lift: 9, life: 3 });
    this.flash(x, 8, z, color, 22, 0.9);
    this.text(x, 12, z, 'NEXUS BROKEN', color, { size: 42, scale: 1.25, life: 2.0, vy: 1.2 });
  }

  /* --------------------------------- update -------------------------------- */

  update(dt, time) {
    this.particles.update(dt, time);

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      const k = 1 - Math.max(0, r.life) / r.maxLife;
      if (r.life <= 0) {
        this.group.remove(r.mesh);
        r.mesh.material.dispose();
        if (r.kind === 'wave') r.mesh.geometry.dispose();
        this.rings.splice(i, 1);
        continue;
      }
      if (r.kind === 'flash') {
        const s = r.size * (0.6 + k * 0.8);
        r.mesh.scale.set(s, s, 1);
        r.mesh.material.opacity = 0.9 * (1 - k);
      } else if (r.kind === 'ring') {
        const s = r.radius * (r.start + (1 - r.start) * k);
        r.mesh.scale.set(s, s, 1);
        r.mesh.material.opacity = 0.9 * (1 - k) ** 1.4;
      } else {
        const s = r.radius * (r.start + (1 - r.start) * k);
        r.mesh.scale.set(s, s, s);
        r.mesh.material.opacity = (0.7) * (1 - k) ** 1.5;
      }
    }

    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.group.remove(t.sprite);
        t.sprite.material.dispose();
        t.tex.dispose();
        this.texts.splice(i, 1);
        continue;
      }
      const k = t.life / t.maxLife;
      t.sprite.position.y += t.vy * dt;
      t.sprite.material.opacity = Math.min(1, k * 2.4);
    }

    for (let i = this.debrisBursts.length - 1; i >= 0; i--) {
      const d = this.debrisBursts[i];
      d.life -= dt;
      if (d.life <= 0) {
        this.group.remove(d.group);
        d.mat.dispose();
        d.group.traverse((child) => { if (child.geometry) child.geometry.dispose(); });
        this.debrisBursts.splice(i, 1);
        continue;
      }
      const k = d.life / d.maxLife;
      d.mat.opacity = Math.min(1, k * 2);
      for (const it of d.items) {
        it.vy -= 22 * dt;
        it.mesh.position.x += it.vx * dt;
        it.mesh.position.y += it.vy * dt;
        it.mesh.position.z += it.vz * dt;
        if (it.mesh.position.y < 0.2) {
          it.mesh.position.y = 0.2;
          it.vy *= -0.35;
          it.vx *= 0.7;
          it.vz *= 0.7;
        }
        it.mesh.rotation.x += it.spin * dt;
        it.mesh.rotation.y += it.spin * 0.7 * dt;
      }
    }

    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.t += dt;
      const k = Math.min(1, m.t / m.duration);
      const ease = k * k;
      m.group.position.y = m.height * (1 - ease) + 0.4;
      m.group.position.x = m.x + (1 - ease) * (m.startX ?? 0);
      m.rock.rotation.x += dt * 7;
      m.rock.rotation.y += dt * 5;
      m.trail -= dt;
      if (m.trail <= 0 && k < 1) {
        m.trail = 0.02;
        for (let n = 0; n < 4; n++) {
          this.particles.spawn({
            x: m.group.position.x + (Math.random() - 0.5) * 1.2,
            y: m.group.position.y + (Math.random() - 0.5) * 1.6,
            z: m.group.position.z + (Math.random() - 0.5) * 1.2,
            vx: (Math.random() - 0.5) * 2,
            vy: 1 + Math.random() * 2,
            vz: (Math.random() - 0.5) * 2,
            life: 0.5 + Math.random() * 0.4,
            size: 1.1 + Math.random() * 0.8,
            shrink: 0.2,
            drag: 1.4,
            color: this._color.set(m.color).clone()
          });
        }
      }
      if (k >= 1) {
        const x = m.group.position.x;
        const z = m.group.position.z;
        this.group.remove(m.group);
        this.impact(x, 0.4, z, m.color, { count: 30, speed: 10, size: 0.8, ring: 5, flashSize: 7, ground: true });
        this.shockwave(x, 0.1, z, m.color, 6.5, 0.65);
        if (m.onImpact) m.onImpact(x, z);
        this.meteors.splice(i, 1);
      }
    }

    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const t = this.telegraphs[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.group.remove(t.ring);
        this.group.remove(t.inner);
        t.mat.dispose();
        t.innerMat.dispose();
        t.ring.geometry.dispose();
        t.inner.geometry.dispose();
        this.telegraphs.splice(i, 1);
        continue;
      }
      const pulse = 0.7 + Math.sin((1 - t.life / t.maxLife) * Math.PI * 8) * 0.3;
      t.mat.opacity = 0.25 + pulse * 0.35;
      t.innerMat.opacity = 0.04 + pulse * 0.07;
      t.ring.rotation.z += dt * 0.6;
    }

    for (let i = this.cyclones.length - 1; i >= 0; i--) {
      const c = this.cyclones[i];
      c.life -= dt;
      if (c.life <= 0) {
        this.group.remove(c.group);
        c.rings.forEach((r) => { r.mesh.geometry.dispose(); r.mesh.material.dispose(); });
        this.cyclones.splice(i, 1);
        continue;
      }
      const k = c.life / c.maxLife;
      for (const r of c.rings) {
        r.mesh.rotation.z += dt * r.speed;
        r.mesh.material.opacity = (0.18 + Math.sin(time * 2 + r.phase) * 0.08) * Math.min(1, k * 3);
      }
      c.glow.material.opacity = 0.22 + Math.sin(time * 2.4) * 0.08;
      c.emit -= dt;
      if (c.emit <= 0) {
        c.emit = 0.045;
        const a = Math.random() * TAU;
        const rad = 2.6 + Math.random() * 0.5;
        this.particles.spawn({
          x: c.group.position.x + Math.cos(a) * rad,
          y: 0.5 + Math.random() * 1.2,
          z: c.group.position.z + Math.sin(a) * rad,
          vx: -Math.cos(a) * 2.2,
          vy: 4.5 + Math.random() * 4,
          vz: -Math.sin(a) * 2.2,
          life: 0.9 + Math.random() * 0.5,
          size: 0.55 + Math.random() * 0.5,
          shrink: 0.25,
          drag: 0.7,
          color: this._color.set(c.glow.material.color).clone()
        });
      }
    }
  }
}
