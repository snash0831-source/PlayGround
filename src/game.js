import * as THREE from 'three';
import {
  ELEMENTS, ELEMENT_IDS, TOWER_HP, TOWER_RADIUS, PLAY_RADIUS,
  AVATAR_RADIUS, towerPos, spawnPos
} from './config.js';
import { createTower } from './world.js';
import { createAvatar } from './avatars.js';

const TAU = Math.PI * 2;

function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

function angleLerp(from, to, t) {
  return from + wrapAngle(to - from) * Math.min(1, t);
}

function segDistSq2D(ax, az, bx, bz, px, pz) {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  const len = abx * abx + abz * abz;
  let t = len > 1e-6 ? (apx * abx + apz * abz) / len : 0;
  t = Math.max(0, Math.min(1, t));
  const dx = ax + abx * t - px;
  const dz = az + abz * t - pz;
  return dx * dx + dz * dz;
}

export class Game {
  constructor({ scene, camera, fx, ui, audio }) {
    this.scene = scene;
    this.camera = camera;
    this.fx = fx;
    this.ui = ui;
    this.audio = audio;

    this.state = 'menu';
    this.prevState = 'playing';
    this.elapsed = 0;
    this.time = 0;
    this.zoom = 1;
    this.shake = 0;
    this.player = null;
    this.factions = [];
    this.byId = {};
    this.projectiles = [];
    this.scheduled = [];
    this.zones = [];
    this.stats = { damage: 0, kills: 0, towers: 0, deaths: 0 };
    this.input = {
      firing: false,
      aimNDC: new THREE.Vector2(0, 0),
      pointerActive: false,
      moveX: 0,
      moveZ: 0,
      touchAim: { x: 0, y: 0, active: false }
    };
    this.aimPoint = new THREE.Vector3(0, 1.4, 0);
    this.aimDir = new THREE.Vector3(0, 0, 1);
    this.screenAim = { x: 0, y: 0, visible: false };
    this.raycaster = new THREE.Raycaster();
    this.aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.4);
    this.tmpVec = new THREE.Vector3();
    this.tmpVec2 = new THREE.Vector3();
    this.camPos = new THREE.Vector3(0, 27, 54);
    this.camLook = new THREE.Vector3(0, 4, 0);
    this.camTarget = new THREE.Vector3();
    this.camDesired = new THREE.Vector3();
    this.camLookTarget = new THREE.Vector3();
    this.menuAngle = 0.7;
    this.endResult = null;
    this.endWinner = null;
    this.endTimer = 0;
    this.endTime = 0;
    this.towerAlertCd = 0;

    this.projectileGroup = new THREE.Group();
    this.projectileGroup.name = 'projectiles';
    scene.add(this.projectileGroup);

    this.buildFactions();
    this.resetAll(true);
    this.updateCamera(0.016, 0);
  }

  /* ------------------------------ setup ---------------------------------- */

  buildFactions() {
    for (const id of ELEMENT_IDS) {
      const el = ELEMENTS[id];
      const tower = createTower(id);
      const tp = towerPos(id);
      tower.group.position.set(tp.x, 0, tp.z);
      this.scene.add(tower.group);

      const avatar = createAvatar(id);
      this.scene.add(avatar.root);

      const faction = {
        id,
        el,
        tower,
        avatar,
        isPlayer: false,
        towerHp: TOWER_HP,
        towerMax: TOWER_HP,
        towerAlive: true,
        towerDeath: null,
        towerCd: 0.6 + Math.random() * 0.5,
        alertCd: 0,
        hp: el.health,
        maxHp: el.health,
        alive: true,
        respawn: 0,
        attackCd: 0,
        dashCd: 0,
        dashTime: 0,
        dashDir: new THREE.Vector3(0, 0, 1),
        ult: 0,
        castAnim: 0,
        slowTime: 0,
        stunTime: 0,
        invuln: 0,
        burn: null,
        pushX: 0,
        pushZ: 0,
        lastHit: 99,
        kills: 0,
        deaths: 0,
        damage: 0,
        towers: 0,
        home: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        lastPos: new THREE.Vector3(),
        moved: 0,
        ai: { think: Math.random() * 0.4, target: null, mode: 'fight', strafe: Math.random() < 0.5 ? 1 : -1, strafeT: 0 }
      };

      this.factions.push(faction);
      this.byId[id] = faction;
    }
  }

  resetFaction(f, initial = false) {
    const el = f.el;
    const tp = towerPos(f.id);
    const sp = spawnPos(f.id);

    f.towerHp = TOWER_HP;
    f.towerMax = TOWER_HP;
    f.towerAlive = true;
    f.towerDeath = null;
    f.towerCd = 0.8 + Math.random() * 0.6;
    f.alertCd = 0;
    f.tower.barSprite.visible = false;
    f.tower.group.visible = true;
    f.tower.group.position.set(tp.x, 0, tp.z);
    f.tower.group.rotation.set(0, 0, 0);
    f.tower.group.scale.setScalar(1);
    f.tower.setHealth(1);

    f.hp = el.health;
    f.maxHp = el.health;
    f.alive = true;
    f.respawn = 0;
    f.attackCd = 0.5 + Math.random() * 0.5;
    f.dashCd = 0;
    f.dashTime = 0;
    f.castAnim = 0;
    f.slowTime = 0;
    f.stunTime = 0;
    f.invuln = 0;
    f.burn = null;
    f.pushX = 0;
    f.pushZ = 0;
    f.lastHit = 99;
    f.kills = 0;
    f.deaths = 0;
    f.damage = 0;
    f.towers = 0;
    f.moved = 0;
    f.vel.set(0, 0, 0);

    f.home.set(sp.x, 0, sp.z);
    f.avatar.root.position.set(sp.x, 0, sp.z);
    const dirToCenter = new THREE.Vector3(-sp.x, 0, -sp.z).normalize();
    f.avatar.root.rotation.y = Math.atan2(dirToCenter.x, dirToCenter.z);
    f.avatar.reset();
    f.avatar.setHealth(1);
    f.avatar.healthSprite.visible = true;
    f.lastPos.copy(f.avatar.root.position);

    f.ai.think = 0.1 + Math.random() * 0.5;
    f.ai.target = null;
    f.ai.mode = 'fight';
    f.ai.strafe = Math.random() < 0.5 ? 1 : -1;
    f.ai.strafeT = 0;

    if (!initial) {
      this.fx.ring(sp.x, 0.2, sp.z, el.color, 3.5, 0.5);
    }
  }

  resetAll(initial = false) {
    for (const f of this.factions) this.resetFaction(f, initial);
    this.elapsed = 0;
    this.stats = { damage: 0, kills: 0, towers: 0, deaths: 0 };
    this.towerAlertCd = 0;
    this.clearProjectiles();
    this.scheduled.length = 0;
    this.zones.length = 0;
    this.shake = 0;
    this.zoom = 1;
    this.endResult = null;
    this.endWinner = null;
    this.endTimer = 0;
    this.endTime = 0;
  }

  startBattle(playerId) {
    if (this.fx.clear) this.fx.clear();
    this.resetAll(false);
    this.player = this.byId[playerId];
    if (!this.player) this.player = this.byId.fire;
    for (const f of this.factions) {
      f.isPlayer = f === this.player;
      f.ult = f.isPlayer ? 22 : 8 + Math.random() * 16;
    }
    const rivals = this.factions.filter((f) => !f.isPlayer);
    rivals.forEach((f, i) => { f.ai.rival = rivals[(i + 1) % rivals.length]; });
    this.state = 'playing';
    this.time = 0;
    this.elapsed = 0;
    this.camPos.set(0, 27, 54);
    this.updateCamera(0.016, 0);
    this.computeAim(this.input);
    this.ui.prepareBattle(this);
    this.ui.feed(`<b>${this.player.el.avatar.toUpperCase()}</b> enters the Nexus`, this.player.el.css);
    this.ui.banner('THE NEXUS AWAKENS', 'WAR OF THE FOUR', '#e8c88a');
    for (const f of this.factions) {
      const p = f.avatar.root.position;
      this.fx.ring(p.x, 0.15, p.z, f.el.color, 4.5, 0.7);
      this.fx.burst(p.x, 1.2, p.z, f.el.color, 18, { speed: 4.5, size: 0.55, life: 0.8, gravity: 1 });
    }
    this.audio.startAmbient();
    this.audio.ui();
    this.ui.update(this, 0);
  }

  toMenu() {
    if (this.fx.clear) this.fx.clear();
    this.resetAll(true);
    this.player = null;
    for (const f of this.factions) f.isPlayer = false;
    this.state = 'menu';
    this.ui.hideHud();
    this.ui.showMenu();
    this.ui.setSound(this.audio.muted);
    this.audio.ensure();
    this.menuAngle = 0.7;
  }

  pause() {
    if (this.state !== 'playing' && this.state !== 'ending') return;
    this.prevState = this.state;
    this.state = 'paused';
    this.ui.showPause();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = this.prevState || 'playing';
    this.ui.hidePause();
  }

  /* ------------------------------- updating ------------------------------- */

  update(dt, time, input) {
    this.time = time;
    this.input = input || this.input;

    if (this.state === 'menu') {
      this.updateMenu(dt, time);
    } else if (this.state === 'playing') {
      this.updateBattle(dt, time);
    } else if (this.state === 'ending') {
      this.updateEnding(dt, time);
    } else if (this.state === 'over') {
      this.updateOver(dt, time);
    }

    this.updateCamera(dt, time);
    if (this.state !== 'menu') {
      this.updateScreenAim();
      this.ui.update(this, dt);
    }
  }

  updateMenu(dt, time) {
    this.menuAngle += dt * 0.045;
    for (const f of this.factions) {
      const p = f.avatar.root.position;
      const face = Math.atan2(-p.x, -p.z);
      f.avatar.root.rotation.y = angleLerp(f.avatar.root.rotation.y, face, dt * 2);
      f.avatar.update(dt, time + f.el.angle, { moving: false, casting: false });
      f.avatar.setHealth(1);
      f.tower.update(time + f.el.angle, dt);
      f.tower.setHealth(1);
    }
  }

  updateBattle(dt, time) {
    this.elapsed += dt;
    if (this.towerAlertCd > 0) this.towerAlertCd -= dt;
    this.updateScheduled(dt);

    this.computeAim(this.input);
    for (const f of this.factions) this.updateTimers(f, dt);
    if (this.player && this.player.alive && this.player.stunTime <= 0) this.updatePlayer(dt);
    for (const f of this.factions) if (!f.isPlayer) this.updateAI(f, dt);

    this.resolveCollisions();
    this.updateProjectiles(dt);

    for (const f of this.factions) {
      this.updateTower(f, dt);
      if (f.alive) {
        f.avatar.update(dt, time + f.el.angle, { moving: f.moved > 0.001, casting: f.castAnim > 0.1 });
        f.avatar.setHealth(f.hp / f.maxHp);
      }
    }

    this.updateZones(dt);
    this.updateVelocities(dt);
  }

  updateTimers(f, dt) {
    if (f.attackCd > 0) f.attackCd -= dt;
    if (f.dashCd > 0) f.dashCd -= dt;
    if (f.dashTime > 0) f.dashTime -= dt;
    if (f.slowTime > 0) f.slowTime -= dt;
    if (f.stunTime > 0) f.stunTime -= dt;
    if (f.invuln > 0) f.invuln -= dt;
    if (f.castAnim > 0) f.castAnim -= dt;
    if (f.alertCd > 0) f.alertCd -= dt;
    f.lastHit += dt;

    if (f.alive) {
      f.ult = Math.min(100, f.ult + (f.isPlayer ? 1.15 : 0.85) * dt);

      /* out-of-combat & home regeneration */
      if (f.lastHit > 6.5) {
        this.heal(f, (f.isPlayer ? 4.5 : 3.2) * dt);
      }
      if (f.towerAlive) {
        const d = Math.hypot(f.avatar.root.position.x - f.home.x, f.avatar.root.position.z - f.home.z);
        if (d < 11) this.heal(f, (f.isPlayer ? 10 : 6.5) * dt);
      }

      if (f.burn && f.burn.time > 0) {
        f.burn.time -= dt;
        f.burn.tick -= dt;
        if (f.burn.tick <= 0) {
          f.burn.tick += 0.5;
          this.damageAvatar(f, f.burn.dps * 0.5, f.burn.source, { dot: true });
        }
        if (f.burn.time <= 0) f.burn = null;
      }
    } else if (f.towerAlive && this.state === 'playing') {
      f.respawn -= dt;
      if (f.respawn <= 0) this.respawnAvatar(f);
    }
  }

  updatePlayer(dt) {
    const f = this.player;
    const el = f.el;
    const input = this.input;
    const pos = f.avatar.root.position;

    let mx = input.moveX || 0;
    let mz = -(input.moveZ || 0);
    const mlen = Math.hypot(mx, mz);
    if (mlen > 1) { mx /= mlen; mz /= mlen; }
    const speed = el.moveSpeed * (f.slowTime > 0 ? 0.62 : 1);

    let dx = mx * speed * dt;
    let dz = mz * speed * dt;
    if (f.dashTime > 0) {
      dx += f.dashDir.x * 47 * dt;
      dz += f.dashDir.z * 47 * dt;
      if (Math.random() < 0.9) {
        this.fx.trail(pos.x, 0.5 + Math.random() * 2.6, pos.z, el.color, 0.85, 0.5);
      }
    }
    pos.x += dx;
    pos.z += dz;
    this.constrainAvatar(f);

    /* face aim */
    if (this.aimDir.lengthSq() > 0.01) {
      const targetRot = Math.atan2(this.aimDir.x, this.aimDir.z);
      f.avatar.root.rotation.y = angleLerp(f.avatar.root.rotation.y, targetRot, dt * 16);
    }

    if (input.firing && f.attackCd <= 0 && f.stunTime <= 0) {
      this.spawnBasic(f, this.aimDir);
      f.attackCd = el.attackCd;
    }
  }

  tryDash() {
    const f = this.player;
    if (!f || this.state !== 'playing' || !f.alive || f.dashCd > 0 || f.stunTime > 0) return;
    let dx = this.input.moveX || 0;
    let dz = -(this.input.moveZ || 0);
    if (Math.hypot(dx, dz) < 0.1) { dx = this.aimDir.x; dz = this.aimDir.z; }
    const len = Math.hypot(dx, dz) || 1;
    f.dashDir.set(dx / len, 0, dz / len);
    f.dashTime = 0.18;
    f.dashCd = 4.1;
    f.invuln = Math.max(f.invuln, 0.36);
    this.fx.burst(f.avatar.root.position.x, 1.4, f.avatar.root.position.z, f.el.color, 24, { speed: 6, size: 0.7, life: 0.55, lift: 1.4 });
    this.fx.ring(f.avatar.root.position.x, 0.2, f.avatar.root.position.z, f.el.color, 3.5, 0.4);
    this.audio.cast(f.id);
    this.shake = Math.max(this.shake, 0.14);
  }

  tryUlt() {
    const f = this.player;
    if (!f || this.state !== 'playing' || !f.alive) return;
    if (f.ult < 100) {
      this.ui.hint('Your ultimate is not yet charged');
      this.audio.ui();
      return;
    }
    f.ult = 0;
    this.castUlt(f, this.aimPoint.clone());
    this.ui.flashAbility('ult');
  }

  /* --------------------------------- AI ---------------------------------- */

  updateAI(f, dt) {
    if (!f.alive) return;
    const p = f.avatar.root.position;
    const el = f.el;
    f.ai.think -= dt;
    if (f.ai.think <= 0) {
      f.ai.think = 0.32 + Math.random() * 0.45;
      this.chooseAITarget(f);
    }

    let target = f.ai.target;
    if (target && target.type === 'avatar' && (!target.faction.alive || !target.faction.towerAlive)) target = null;
    if (target && target.type === 'tower' && !target.faction.towerAlive) target = null;
    if (!target) { this.chooseAITarget(f); target = f.ai.target; }

    /* movement destination */
    let tx = p.x;
    let tz = p.z;
    let desiredRange = 11;
    if (f.ai.mode === 'retreat') {
      tx = f.home.x;
      tz = f.home.z;
    } else if (target) {
      if (target.type === 'avatar') {
        tx = target.faction.avatar.root.position.x;
        tz = target.faction.avatar.root.position.z;
        desiredRange = 10.5;
      } else if (target.type === 'tower') {
        tx = target.faction.tower.group.position.x;
        tz = target.faction.tower.group.position.z;
        desiredRange = 16.4;
      }
    }

    const dx = tx - p.x;
    const dz = tz - p.z;
    const dist = Math.hypot(dx, dz) || 1;
    let ix = 0;
    let iz = 0;
    if (f.ai.mode === 'retreat') {
      if (dist > 3) { ix = dx / dist; iz = dz / dist; }
    } else if (dist > desiredRange + 1.3) {
      ix = dx / dist;
      iz = dz / dist;
    } else if (dist < desiredRange - 3.2) {
      ix = -dx / dist;
      iz = -dz / dist;
    } else {
      f.ai.strafeT -= dt;
      if (f.ai.strafeT <= 0) {
        f.ai.strafeT = 1.2 + Math.random() * 1.4;
        f.ai.strafe *= -1;
      }
      ix = (-dz / dist) * f.ai.strafe * 0.7;
      iz = (dx / dist) * f.ai.strafe * 0.7;
    }

    /* arena edge and own tower avoidance */
    const rad = Math.hypot(p.x, p.z);
    if (rad > PLAY_RADIUS - 3) {
      ix += (-p.x / rad) * 1.8;
      iz += (-p.z / rad) * 1.8;
    }

    /* retreat from melee pressure */
    if (f.ai.mode === 'retreat' && target && target.type === 'avatar') {
      const nd = Math.hypot(target.faction.avatar.root.position.x - p.x, target.faction.avatar.root.position.z - p.z);
      if (nd < 9) {
        ix += (p.x - target.faction.avatar.root.position.x) / (nd || 1) * 0.8;
        iz += (p.z - target.faction.avatar.root.position.z) / (nd || 1) * 0.8;
      }
    }

    const ilen = Math.hypot(ix, iz);
    if (ilen > 1e-4) {
      ix /= ilen;
      iz /= ilen;
      const speed = el.moveSpeed * (f.slowTime > 0 ? 0.62 : 1);
      p.x += ix * speed * dt;
      p.z += iz * speed * dt;
      this.constrainAvatar(f);
    }

    /* aim & attack */
    if (target && (target.type === 'avatar' || target.type === 'tower')) {
      const tp = target.type === 'avatar'
        ? target.faction.avatar.root.position
        : target.faction.tower.group.position;
      const td = Math.hypot(tp.x - p.x, tp.z - p.z);
      const targetRot = Math.atan2(tp.x - p.x, tp.z - p.z);
      f.avatar.root.rotation.y = angleLerp(f.avatar.root.rotation.y, targetRot, dt * 7);

      let aimX = tp.x;
      let aimZ = tp.z;
      if (target.type === 'avatar') {
        const lead = Math.min(0.65, td / (el.projectileSpeed * 2.4));
        aimX += target.faction.vel.x * lead * 8;
        aimZ += target.faction.vel.z * lead * 8;
      }
      const aimDist = Math.hypot(aimX - p.x, aimZ - p.z) || 1;
      let dirX = (aimX - p.x) / aimDist;
      let dirZ = (aimZ - p.z) / aimDist;
      const jitter = (Math.random() - 0.5) * (target.type === 'tower' ? 0.045 : 0.11);
      const cs = Math.cos(jitter);
      const sn = Math.sin(jitter);
      const jx = dirX * cs - dirZ * sn;
      const jz = dirX * sn + dirZ * cs;

      if (f.attackCd <= 0 && f.stunTime <= 0 && td < (target.type === 'tower' ? 32 : 27)) {
        this.spawnBasic(f, this.tmpVec2.set(jx, 0, jz).clone());
        f.attackCd = el.attackCd * (0.92 + Math.random() * 0.22);
      }

      if (f.ult >= 100 && f.stunTime <= 0 && td < 30 && Math.random() < 0.5) {
        f.ult = 0;
        const at = new THREE.Vector3(aimX, 0, aimZ);
        if (f.id === 'water') at.set(p.x, 0, p.z);
        this.castUlt(f, at);
      }
    }

    /* desperate dodge */
    if (f.hp / f.maxHp < 0.38 && f.dashCd <= 0 && Math.random() < 0.35) {
      let nearest = null;
      let nd = 9;
      for (const o of this.factions) {
        if (o === f || !o.alive) continue;
        const d = Math.hypot(o.avatar.root.position.x - p.x, o.avatar.root.position.z - p.z);
        if (d < nd) { nd = d; nearest = o; }
      }
      if (nearest) {
        const ax = p.x - nearest.avatar.root.position.x;
        const az = p.z - nearest.avatar.root.position.z;
        const al = Math.hypot(ax, az) || 1;
        f.dashDir.set(ax / al, 0, az / al);
        f.dashTime = 0.18;
        f.dashCd = 5;
        f.invuln = Math.max(f.invuln, 0.3);
        this.fx.burst(p.x, 1.2, p.z, el.color, 16, { speed: 5, size: 0.6, life: 0.5 });
      }
    }

    if (f.dashTime > 0) {
      p.x += f.dashDir.x * 47 * dt;
      p.z += f.dashDir.z * 47 * dt;
      this.constrainAvatar(f);
    }
  }

  chooseAITarget(f) {
    const p = f.avatar.root.position;
    const enemies = this.factions.filter((o) => o !== f && o.towerAlive);
    const armed = enemies.filter((o) => o.alive);
    const hpFrac = f.hp / f.maxHp;

    if (hpFrac < 0.3 && f.towerAlive) {
      f.ai.mode = 'retreat';
      f.ai.target = { type: 'home' };
      return;
    }
    if (f.ai.mode === 'retreat' && hpFrac < 0.66) {
      f.ai.target = { type: 'home' };
      return;
    }
    f.ai.mode = 'fight';

    let nearest = null;
    let nearestD = Infinity;
    for (const o of armed) {
      const d = Math.hypot(o.avatar.root.position.x - p.x, o.avatar.root.position.z - p.z);
      if (d < nearestD) { nearestD = d; nearest = o; }
    }

    /* defend the home nexus */
    let defender = null;
    for (const o of armed) {
      const dt = Math.hypot(o.avatar.root.position.x - f.home.x, o.avatar.root.position.z - f.home.z);
      if (dt < 11 && Math.hypot(o.avatar.root.position.x - p.x, o.avatar.root.position.z - p.z) < 24) {
        defender = o;
        break;
      }
    }

    if (defender) {
      f.ai.target = { type: 'avatar', faction: defender };
      return;
    }
    if (nearest && nearestD < 15 && Math.random() < 0.55) {
      f.ai.target = { type: 'avatar', faction: nearest };
      return;
    }

    const towers = enemies.filter((o) => o.towerAlive);
    if (!towers.length) {
      if (nearest) f.ai.target = { type: 'avatar', faction: nearest };
      else f.ai.target = { type: 'home' };
      return;
    }
    /* spread pressure across the arena; each AI keeps a personal rival */
    let pick = null;
    let bestScore = -Infinity;
    for (const o of towers) {
      const tp = o.tower.group.position;
      const dist = Math.hypot(tp.x - p.x, tp.z - p.z);
      let score = Math.random() * 26;
      score += Math.max(0, 30 - dist * 0.42);
      score += (1 - o.towerHp / o.towerMax) * 24;
      if (o === nearest) score += 6;
      if (o === f.ai.rival) score += 20;
      if (o.isPlayer) score += 5;
      if (o.isPlayer && this.elapsed < 8) score -= 18;
      if (score > bestScore) { bestScore = score; pick = o; }
    }
    f.ai.target = { type: 'tower', faction: pick };
  }

  /* ------------------------------ collisions ------------------------------ */

  constrainAvatar(f) {
    const p = f.avatar.root.position;
    const rad = Math.hypot(p.x, p.z);
    const maxR = PLAY_RADIUS - 0.6;
    if (rad > maxR) {
      p.x = (p.x / rad) * maxR;
      p.z = (p.z / rad) * maxR;
    }
    for (const o of this.factions) {
      if (!o.towerAlive) continue;
      const tp = o.tower.group.position;
      const dx = p.x - tp.x;
      const dz = p.z - tp.z;
      const d = Math.hypot(dx, dz);
      const min = TOWER_RADIUS + AVATAR_RADIUS - 0.2;
      if (d < min && d > 0.001) {
        p.x = tp.x + (dx / d) * min;
        p.z = tp.z + (dz / d) * min;
      }
    }
  }

  resolveCollisions() {
    for (let i = 0; i < this.factions.length; i++) {
      const a = this.factions[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < this.factions.length; j++) {
        const b = this.factions[j];
        if (!b.alive) continue;
        const pa = a.avatar.root.position;
        const pb = b.avatar.root.position;
        const dx = pb.x - pa.x;
        const dz = pb.z - pa.z;
        const d = Math.hypot(dx, dz);
        const min = AVATAR_RADIUS * 2 + 0.15;
        if (d < min && d > 0.001) {
          const push = (min - d) * 0.5;
          pa.x -= (dx / d) * push;
          pa.z -= (dz / d) * push;
          pb.x += (dx / d) * push;
          pb.z += (dz / d) * push;
          this.constrainAvatar(a);
          this.constrainAvatar(b);
        }
      }
    }
  }

  updateVelocities(dt) {
    for (const f of this.factions) {
      const p = f.avatar.root.position;
      f.vel.set((p.x - f.lastPos.x) / Math.max(dt, 0.0001), 0, (p.z - f.lastPos.z) / Math.max(dt, 0.0001));
      f.moved = Math.hypot(p.x - f.lastPos.x, p.z - f.lastPos.z);
      f.lastPos.copy(p);
    }
  }
  /* -------------------------------- towers -------------------------------- */

  updateTower(f, dt) {
    f.tower.barSprite.visible = f.towerAlive && f.towerHp < f.towerMax - 0.01;
    f.tower.update(this.time + f.el.angle, dt);

    if (f.towerAlive) {
      f.towerCd -= dt;
      if (f.towerCd <= 0) {
        const tp = f.tower.group.position;
        let target = null;
        let best = 21.5 * 21.5;
        for (const o of this.factions) {
          if (o === f || !o.alive || !o.towerAlive) continue;
          const p = o.avatar.root.position;
          const d = (p.x - tp.x) ** 2 + (p.z - tp.z) ** 2;
          if (d < best) { best = d; target = o; }
        }
        if (target) {
          this.spawnTowerBolt(f, target);
          f.towerCd = 1.35 + Math.random() * 0.35;
        } else {
          f.towerCd = 0.35;
        }
      }
    } else if (f.towerDeath !== null) {
      f.towerDeath += dt;
      const k = Math.min(1, f.towerDeath / 2.5);
      f.tower.group.position.y = -k * 13;
      f.tower.group.rotation.z = k * 0.26;
      f.tower.group.rotation.x = k * 0.09;
      f.tower.beamMat.opacity = (1 - k) * 0.18;
      f.tower.beamWide.material.opacity = (1 - k) * 0.04;
      f.tower.topGlow.material.opacity = (1 - k) * 0.3;
      f.tower.coreGlow.material.opacity = (1 - k) * 0.5;
      f.tower.light.intensity = (1 - k) * 10;
      if (k >= 1) {
        f.tower.group.visible = false;
        f.towerDeath = null;
      }
    }
  }

  spawnTowerBolt(f, target) {
    const tp = f.tower.group.position;
    const from = new THREE.Vector3(tp.x, 8.6, tp.z);
    const to = target.avatar.root.position;
    const dir = new THREE.Vector3(to.x - from.x, 2.0 - from.y, to.z - from.z).normalize();
    const p = this.spawnProjectile({
      element: f.id,
      owner: f,
      from,
      vel: dir.multiplyScalar(29),
      damage: 21,
      towerDamage: 0,
      splash: 0,
      canHitTower: false,
      isTower: true,
      life: 1.5
    });
    this.fx.flash(from.x, from.y, from.z, f.el.color, 2.4, 0.16);
    return p;
  }

  /* ------------------------------ projectiles ----------------------------- */

  spawnBasic(f, dir) {
    const el = f.el;
    const speed = el.projectileSpeed;
    const origin = f.avatar.root.position.clone();
    origin.y += 2.2;
    origin.x += dir.x * 0.85;
    origin.z += dir.z * 0.85;

    for (let i = 0; i < el.shots; i++) {
      const offset = el.shots > 1 ? (i - (el.shots - 1) / 2) * el.spread : 0;
      const cs = Math.cos(offset);
      const sn = Math.sin(offset);
      const vx = dir.x * cs - dir.z * sn;
      const vz = dir.x * sn + dir.z * cs;
      const effect = {};
      if (f.id === 'fire') { effect.burnDps = 7; effect.burnTime = 3; }
      if (f.id === 'water') { effect.slow = 1.9; effect.heal = 4; }
      if (f.id === 'earth') { effect.knock = 4.2; }
      this.spawnProjectile({
        element: f.id,
        owner: f,
        from: origin,
        vel: new THREE.Vector3(vx * speed, 0, vz * speed),
        damage: el.damage,
        towerDamage: el.damage * el.towerMult,
        splash: el.splash,
        canHitTower: true,
        isTower: false,
        life: 32 / speed,
        effect
      });
    }
    f.castAnim = 0.32;
    this.fx.muzzle(origin.x, origin.y, origin.z, el.color);
    if (f.isPlayer) this.audio.cast(f.id);
  }

  spawnProjectile(cfg) {
    const mesh = this.fx.createProjectileMesh(cfg.element, { small: cfg.isTower });
    mesh.position.copy(cfg.from);
    this.projectileGroup.add(mesh);
    const p = {
      element: cfg.element,
      owner: cfg.owner,
      pos: cfg.from.clone(),
      prev: cfg.from.clone(),
      vel: cfg.vel.clone(),
      damage: cfg.damage,
      towerDamage: cfg.towerDamage,
      splash: cfg.splash,
      canHitTower: cfg.canHitTower,
      isTower: cfg.isTower,
      life: cfg.life,
      maxLife: cfg.life,
      mesh,
      effect: cfg.effect || {},
      trail: 0,
      dead: false
    };
    this.projectiles.push(p);
    return p;
  }

  removeProjectile(p) {
    if (p.dead) return;
    p.dead = true;
    this.projectileGroup.remove(p.mesh);
    p.mesh.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const m of mats) m.dispose();
      }
    });
    const idx = this.projectiles.indexOf(p);
    if (idx >= 0) this.projectiles.splice(idx, 1);
  }

  clearProjectiles() {
    for (const p of [...this.projectiles]) this.removeProjectile(p);
    this.projectiles.length = 0;
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.prev.copy(p.pos);
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);

      if (p.element === 'earth') {
        p.mesh.rotation.x += dt * 7;
        p.mesh.rotation.y += dt * 5;
      } else if (p.element === 'air') {
        p.mesh.rotation.y = Math.atan2(p.vel.x, p.vel.z);
      }
      if (p.mesh.userData.halo) p.mesh.userData.halo.rotation.z += dt * 9;

      p.trail -= dt;
      if (p.trail <= 0) {
        p.trail = 0.024;
        this.fx.trail(p.pos.x, p.pos.y, p.pos.z, ELEMENTS[p.element].color, p.isTower ? 0.32 : 0.44, 0.3);
      }

      let exploded = false;
      let directAvatar = null;
      let directTower = null;

      if (p.pos.y < 5.2) {
        for (const o of this.factions) {
          if (o === p.owner || !o.alive || !o.towerAlive) continue;
          const ap = o.avatar.root.position;
          const d2 = segDistSq2D(p.prev.x, p.prev.z, p.pos.x, p.pos.z, ap.x, ap.z);
          const r = AVATAR_RADIUS + (p.isTower ? 0.28 : 0.38);
          if (d2 < r * r && p.pos.y > 0.4) {
            directAvatar = o;
            exploded = true;
            this.hitAvatar(p, o);
            break;
          }
        }
      }

      if (!exploded && p.canHitTower && p.pos.y < 16.5) {
        for (const o of this.factions) {
          if (o === p.owner || !o.towerAlive) continue;
          const tp = o.tower.group.position;
          const d2 = segDistSq2D(p.prev.x, p.prev.z, p.pos.x, p.pos.z, tp.x, tp.z);
          if (d2 < (TOWER_RADIUS - 0.15) ** 2) {
            directTower = o;
            exploded = true;
            this.damageTower(o, p.towerDamage, p.owner, { projectile: p });
            break;
          }
        }
      }

      if (!exploded && (p.pos.y < 0.25)) {
        exploded = true;
      }

      if (exploded) {
        this.explodeProjectile(p, p.pos.x, Math.max(0.35, p.pos.y), p.pos.z, directAvatar, directTower);
      } else if (p.life <= 0) {
        this.removeProjectile(p);
      }
    }
  }

  hitAvatar(p, target) {
    const e = p.effect;
    this.damageAvatar(target, p.damage, p.owner, {
      slow: e.slow,
      burnDps: e.burnDps,
      burnTime: e.burnTime,
      knock: e.knock,
      knockFrom: p.owner ? p.owner.avatar.root.position : null
    });
    if (e.heal && p.owner && p.owner.alive) {
      this.heal(p.owner, e.heal);
      this.fx.trail(p.owner.avatar.root.position.x, 2.4, p.owner.avatar.root.position.z, ELEMENTS[p.owner.id].bright, 0.5, 0.35);
    }
  }

  explodeProjectile(p, x, y, z, directAvatar, directTower) {
    if (p.dead) return;
    const el = ELEMENTS[p.element];
    this.fx.impact(x, y, z, el.color, {
      count: p.isTower ? 8 : 16,
      speed: p.isTower ? 4 : 6,
      size: p.isTower ? 0.32 : 0.46,
      ring: p.splash > 1 ? p.splash + 1 : 2,
      ground: y < 0.9,
      flashSize: p.isTower ? 2.6 : 3.4
    });

    if (p.splash > 0.9 && !p.isTower) {
      const radius = p.splash + 1.05;
      for (const o of this.factions) {
        if (o === p.owner || !o.towerAlive) continue;
        if (o.alive && o !== directAvatar) {
          const ap = o.avatar.root.position;
          const d = Math.hypot(ap.x - x, ap.z - z);
          if (d < radius) {
            const falloff = Math.max(0.4, 1 - d / radius);
            this.damageAvatar(o, p.damage * falloff, p.owner, {
              slow: p.effect.slow,
              burnDps: p.effect.burnDps,
              burnTime: p.effect.burnTime,
              knock: p.effect.knock,
              knockFrom: p.owner ? p.owner.avatar.root.position : null
            });
          }
        }
        if (o.towerAlive && o !== directTower) {
          const tp = o.tower.group.position;
          const d = Math.hypot(tp.x - x, tp.z - z);
          if (d < radius + TOWER_RADIUS * 0.7) {
            const falloff = Math.max(0.3, 1 - d / (radius + TOWER_RADIUS));
            this.damageTower(o, p.towerDamage * 0.5 * falloff, p.owner, {});
          }
        }
      }
    }

    this.audio.impact(p.element, p.isTower ? 0.7 : 1);
    if (p.owner && p.owner.isPlayer) this.shake = Math.max(this.shake, p.splash > 2 ? 0.13 : 0.06);
    if (this.player && this.player.alive) {
      const pp = this.player.avatar.root.position;
      if (Math.hypot(pp.x - x, pp.z - z) < 4) this.shake = Math.max(this.shake, 0.16);
    }
    this.removeProjectile(p);
  }

  /* -------------------------------- damage -------------------------------- */

  damageAvatar(target, amount, source, opts = {}) {
    if (!target.alive || amount <= 0 || this.state === 'over') return 0;
    if (target.invuln > 0 && !opts.dot) {
      if (target.isPlayer && Math.random() < 0.4) this.fx.text(target.avatar.root.position.x, 3.4, target.avatar.root.position.z, 'IMMUNE', '#bfe4ff', { size: 30, scale: 0.65, life: 0.6 });
      return 0;
    }
    const dealt = Math.min(target.hp, amount);
    target.hp -= amount;
    target.lastHit = 0;
    target.avatar.hit();

    if (source) {
      source.ult = Math.min(100, source.ult + dealt * (opts.dot ? 0.04 : 0.12));
      if (source.isPlayer) {
        this.stats.damage += dealt;
        source.damage += dealt;
      }
    }

    const p = target.avatar.root.position;
    const color = target.el.color;
    if (!opts.dot) {
      this.fx.burst(p.x, 2.1, p.z, color, 7, { speed: 4.2, size: 0.4, life: 0.45, radius: 0.5, flash: false });
    }

    if (source && source.isPlayer) {
      this.fx.text(p.x, 3.5, p.z, `${Math.round(amount)}`, target.el.brightCss, {
        size: opts.dot ? 32 : 48,
        scale: opts.dot ? 0.7 : 0.9,
        life: 0.75
      });
    } else if (target.isPlayer && !opts.dot) {
      this.fx.text(p.x, 3.4, p.z, `-${Math.round(amount)}`, '#ff9d86', { size: 42, scale: 0.8, life: 0.7 });
    }

    if (target.isPlayer) {
      this.ui.flashDamage();
      this.shake = Math.max(this.shake, 0.34);
      this.audio.hurt();
    } else if (source && source.isPlayer) {
      this.audio.impact(target.id, 0.8);
    }

    if (opts.slow) target.slowTime = Math.max(target.slowTime, opts.slow);
    if (opts.burnDps) this.applyBurn(target, opts.burnDps, opts.burnTime || 3, source);
    if (opts.knock) {
      const from = opts.knockFrom || (source ? source.avatar.root.position : null);
      if (from) {
        const dx = p.x - from.x;
        const dz = p.z - from.z;
        const d = Math.hypot(dx, dz) || 1;
        target.pushX += (dx / d) * opts.knock;
        target.pushZ += (dz / d) * opts.knock;
      }
    }

    if (target.hp <= 0) this.killAvatar(target, source, { dot: opts.dot });
    return dealt;
  }

  applyBurn(target, dps, duration, source) {
    if (!target.burn) target.burn = { dps, time: duration, source, tick: 0 };
    else {
      target.burn.dps = Math.max(target.burn.dps, dps);
      target.burn.time = Math.max(target.burn.time, duration);
      target.burn.source = source || target.burn.source;
    }
  }

  killAvatar(target, source, opts = {}) {
    if (!target.alive) return;
    target.alive = false;
    target.hp = 0;
    target.respawn = 5.5;
    target.avatar.setVisible(false);
    target.avatar.healthSprite.visible = false;
    target.burn = null;
    target.vel.set(0, 0, 0);
    target.deaths++;
    if (source) {
      source.kills++;
      if (source.isPlayer) this.stats.kills++;
    }
    if (target.isPlayer) this.stats.deaths++;

    const p = target.avatar.root.position;
    this.fx.death(p.x, 2.1, p.z, target.el.color);
    this.audio.explosion();
    this.shake = Math.max(this.shake, target.isPlayer ? 0.75 : 0.32);

    if (source) {
      this.ui.feed(`<b>${source.el.avatar.toUpperCase()}</b> shattered <em>${target.el.avatar.toUpperCase()}</em>`, target.el.css);
    } else {
      this.ui.feed(`<em>${target.el.avatar.toUpperCase()}</em> was shattered`, target.el.css);
    }

    if (target.isPlayer) {
      this.ui.respawn(5.5);
      this.ui.banner('YOU HAVE FALLEN', 'REFORM AT YOUR NEXUS', '#ff8a70');
    }
    if (target.towerAlive && this.state === 'playing' && target.isPlayer) {
      // camera follows the corpse for a beat; respawn restores it
    }
  }

  respawnAvatar(f) {
    if (!f.towerAlive) return;
    f.alive = true;
    f.hp = f.maxHp;
    f.attackCd = 0.35;
    f.invuln = 1.6;
    f.slowTime = 0;
    f.stunTime = 0;
    f.pushX = 0;
    f.pushZ = 0;
    const sp = spawnPos(f.id);
    f.avatar.root.position.set(sp.x, 0, sp.z);
    f.lastPos.copy(f.avatar.root.position);
    f.avatar.reset();
    f.avatar.setHealth(1);
    f.avatar.healthSprite.visible = true;
    const dir = new THREE.Vector3(-sp.x, 0, -sp.z).normalize();
    f.avatar.root.rotation.y = Math.atan2(dir.x, dir.z);
    this.fx.ring(sp.x, 0.2, sp.z, f.el.color, 5, 0.7);
    this.fx.burst(sp.x, 1.6, sp.z, f.el.color, 26, { speed: 6, size: 0.6, life: 0.8, lift: 2 });
    if (f.isPlayer) {
      this.ui.respawn(null);
      this.audio.respawn();
      this.shake = Math.max(this.shake, 0.25);
    }
    this.ui.feed(`<b>${f.el.avatar.toUpperCase()}</b> reformed at the ${f.el.name} nexus`, f.el.css);
  }

  heal(f, amount) {
    if (!f.alive || amount <= 0) return;
    f.hp = Math.min(f.maxHp, f.hp + amount);
    f.avatar.setHealth(f.hp / f.maxHp);
  }

  damageTower(target, amount, source, opts = {}) {
    if (!target.towerAlive || amount <= 0 || this.state === 'over') return;
    target.towerHp = Math.max(0, target.towerHp - amount);
    target.tower.setHealth(target.towerHp / target.towerMax);
    target.tower.hit();
    if (source) {
      source.ult = Math.min(100, source.ult + amount * 0.1);
      if (source.isPlayer) {
        this.stats.damage += amount;
        source.damage += amount;
      }
    }
    const tp = target.tower.group.position;
    const y = 3 + Math.random() * 6;
    this.fx.burst(tp.x + (Math.random() - 0.5) * 2, y, tp.z + (Math.random() - 0.5) * 2, target.el.color, 8, {
      speed: 4.5,
      size: 0.42,
      life: 0.6,
      gravity: -2
    });
    if (source && source.isPlayer) {
      this.fx.text(tp.x, 9 + Math.random() * 2, tp.z, `${Math.round(amount)}`, target.el.brightCss, { size: 44, scale: 0.9, life: 0.8 });
      this.audio.impact(target.id, 1);
      this.shake = Math.max(this.shake, 0.08);
    }
    if (target.isPlayer) {
      this.shake = Math.max(this.shake, 0.16);
      this.ui.towerAlert();
      if (target.alertCd <= 0) {
        target.alertCd = 9;
        this.ui.feed(`<em>YOUR NEXUS</em> is under attack`, '#ff8a70');
      }
    }
    if (target.towerHp <= 0) this.destroyTower(target, source);
  }

  destroyTower(target, source) {
    if (!target.towerAlive) return;
    target.towerAlive = false;
    target.towerHp = 0;
    target.tower.setHealth(0);
    target.tower.barSprite.visible = false;
    target.towerDeath = 0;
    target.tower.hit();
    if (source) {
      source.towers++;
      if (source.isPlayer) this.stats.towers++;
    }
    if (target.avatar.alive) this.killAvatar(target, source, { noRespawn: true });
    target.avatar.healthSprite.visible = false;

    const tp = target.tower.group.position;
    this.fx.towerExplosion(tp.x, tp.z, target.el.color);
    this.audio.towerDown();
    this.shake = Math.max(this.shake, 0.95);

    if (source) this.ui.feed(`<b>${source.el.avatar.toUpperCase()}</b> destroyed the <em>${target.el.name.toUpperCase()}</em> nexus`, target.el.css);
    else this.ui.feed(`The <em>${target.el.name.toUpperCase()}</em> nexus has fallen`, target.el.css);

    if (source && source.isPlayer) {
      this.ui.banner('NEXUS SHATTERED', `${target.el.name.toUpperCase()} HAS FALLEN`, target.el.css);
    } else if (target.isPlayer) {
      this.ui.banner('YOUR NEXUS IS LOST', 'THE FOURTH AGE ENDS', '#ff6a4a');
    }
    this.checkOutcome();
  }

  checkOutcome() {
    if (this.state !== 'playing') return;
    const player = this.player;
    if (!player) return;
    if (!player.towerAlive) {
      const alive = this.factions.filter((f) => f.towerAlive);
      let winner = null;
      for (const f of alive) if (!winner || f.towerHp > winner.towerHp) winner = f;
      this.beginEnding('defeat', winner);
      return;
    }
    const rivals = this.factions.filter((f) => f !== player);
    if (rivals.every((f) => !f.towerAlive)) {
      this.beginEnding('victory', player);
    }
  }

  /* --------------------------------- ults --------------------------------- */

  castUlt(f, at) {
    const el = f.el;
    const center = at.clone();
    center.y = 0;
    this.ui.feed(`<b>${el.avatar.toUpperCase()}</b> unleashes <em>${el.ultName}</em>`, el.css);
    if (f.isPlayer) this.ui.banner('ULTIMATE', el.ultName.toUpperCase(), el.css);
    this.audio.ult(f.id);
    this.shake = Math.max(this.shake, f.isPlayer ? 0.4 : 0.2);
    this.fx.flash(f.avatar.root.position.x, 2.6, f.avatar.root.position.z, el.color, 9, 0.45);

    if (f.id === 'fire') {
      for (let i = 0; i < 9; i++) {
        const ang = Math.random() * TAU;
        const rad = Math.random() * 7;
        const x = center.x + Math.cos(ang) * rad;
        const z = center.z + Math.sin(ang) * rad;
        const delay = i * 0.17 + Math.random() * 0.2;
        this.schedule(delay, () => {
          this.fx.telegraph(x, 0, z, el.color, 3.4, 0.85);
          this.fx.meteor(x, z, el.color, {
            duration: 0.85,
            height: 34,
            onImpact: (ix, iz) => this.meteorImpact(f, ix, iz)
          });
        });
      }
    } else if (f.id === 'water') {
      center.set(f.avatar.root.position.x, 0, f.avatar.root.position.z);
      const healAmt = 130;
      this.heal(f, healAmt);
      if (f.towerAlive) {
        f.towerHp = Math.min(f.towerMax, f.towerHp + 110);
        f.tower.setHealth(f.towerHp / f.towerMax);
      }
      this.fx.text(center.x, 4.2, center.z, `+${healAmt}`, '#a8f2ff', { size: 48, scale: 0.95, life: 1.2 });
      this.fx.shockwave(center.x, 0.1, center.z, el.color, 9, 1.2);
      this.fx.ring(center.x, 1.2, center.z, el.color, 9, 0.9);
      for (let i = 0; i < 6; i++) {
        this.schedule(0.25 + i * 0.42, () => {
          const c = center;
          this.fx.shockwave(c.x, 0.1, c.z, el.color, 7.5 + i * 0.5, 0.8, { start: 0.6, opacity: 0.5 });
          this.fx.burst(c.x, 1.2, c.z, el.color, 16, { speed: 7, size: 0.5, life: 0.8, radius: 2, turb: 2 });
          for (const o of this.factions) {
            if (o === f || !o.towerAlive || !o.alive) continue;
            const op = o.avatar.root.position;
            if (Math.hypot(op.x - c.x, op.z - c.z) < 8.6) {
              this.damageAvatar(o, 24, f, { slow: 2.2 });
            }
          }
          for (const o of this.factions) {
            if (o === f || !o.towerAlive) continue;
            const tp = o.tower.group.position;
            if (Math.hypot(tp.x - c.x, tp.z - c.z) < 8.6 + TOWER_RADIUS) {
              this.damageTower(o, 16, f, {});
            }
          }
        });
      }
    } else if (f.id === 'earth') {
      for (let i = 0; i < 3; i++) {
        this.schedule(i * 0.4, () => {
          this.fx.shockwave(center.x, 0.08, center.z, el.color, 7.5, 0.95, { start: 0.5, opacity: 0.7 });
          this.fx.ring(center.x, 0.4, center.z, el.color, 7.5, 0.75);
          this.fx.burst(center.x, 0.5, center.z, 0x9c8b5c, 22, { speed: 8, size: 0.6, life: 0.9, lift: 3, gravity: -6, radius: 2.5 });
          this.fx.debris(center.x, 0.5, center.z, el.color, 8, { speed: 5, emissive: 0.8, scale: 0.7, life: 1.4 });
          this.shake = Math.max(this.shake, f.isPlayer ? 0.6 : 0.3);
          for (const o of this.factions) {
            if (o === f || !o.towerAlive || !o.alive) continue;
            const op = o.avatar.root.position;
            if (Math.hypot(op.x - center.x, op.z - center.z) < 6.5) {
              this.damageAvatar(o, 62, f, { knock: 3, knockFrom: center });
              o.stunTime = Math.max(o.stunTime, 0.9);
            }
          }
          for (const o of this.factions) {
            if (o === f || !o.towerAlive) continue;
            const tp = o.tower.group.position;
            if (Math.hypot(tp.x - center.x, tp.z - center.z) < 6.5 + TOWER_RADIUS) {
              this.damageTower(o, 58, f, {});
            }
          }
        });
      }
    } else if (f.id === 'air') {
      center.set(f.avatar.root.position.x, 0, f.avatar.root.position.z).lerp(center, 0.5);
      const visual = this.fx.cyclone(center.x, center.z, el.color, 4.8);
      const zone = {
        type: 'cyclone',
        owner: f,
        center: center.clone(),
        visual,
        life: 4.8,
        maxLife: 4.8,
        tick: 0,
        towerTick: 0
      };
      this.zones.push(zone);
      this.fx.ring(center.x, 0.2, center.z, el.color, 6.5, 0.8);
    }
  }

  meteorImpact(owner, x, z) {
    for (const o of this.factions) {
      if (o === owner || !o.towerAlive) continue;
      if (o.alive) {
        const p = o.avatar.root.position;
        if (Math.hypot(p.x - x, p.z - z) < 3.9) {
          this.damageAvatar(o, 72, owner, { burnDps: 8, burnTime: 2.5, knock: 2.5, knockFrom: new THREE.Vector3(x, 0, z) });
        }
      }
      const tp = o.tower.group.position;
      if (Math.hypot(tp.x - x, tp.z - z) < 3.9 + TOWER_RADIUS) {
        this.damageTower(o, 58, owner, {});
      }
    }
    if (this.player && this.player.alive) {
      const pp = this.player.avatar.root.position;
      if (Math.hypot(pp.x - x, pp.z - z) < 9) this.shake = Math.max(this.shake, 0.45);
    }
  }

  updateZones(dt) {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.life -= dt;
      if (z.life <= 0) {
        this.zones.splice(i, 1);
        continue;
      }
      if (z.type !== 'cyclone') continue;
      const owner = z.owner;

      /* drift toward the nearest living victim */
      let victim = null;
      let vd = 30;
      for (const o of this.factions) {
        if (o === owner || !o.alive || !o.towerAlive) continue;
        const p = o.avatar.root.position;
        const d = Math.hypot(p.x - z.center.x, p.z - z.center.z);
        if (d < vd) { vd = d; victim = p; }
      }
      if (victim) {
        const dx = victim.x - z.center.x;
        const dz = victim.z - z.center.z;
        const d = Math.hypot(dx, dz) || 1;
        z.center.x += (dx / d) * 2.0 * dt;
        z.center.z += (dz / d) * 2.0 * dt;
      }
      const rad = Math.hypot(z.center.x, z.center.z);
      if (rad > PLAY_RADIUS - 3) {
        z.center.x = (z.center.x / rad) * (PLAY_RADIUS - 3);
        z.center.z = (z.center.z / rad) * (PLAY_RADIUS - 3);
      }
      z.visual.group.position.set(z.center.x, 0, z.center.z);

      /* pull + damage */
      for (const o of this.factions) {
        if (o === owner || !o.alive || !o.towerAlive) continue;
        const p = o.avatar.root.position;
        const dx = z.center.x - p.x;
        const dz = z.center.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 9 && d > 0.5) {
          p.x += (dx / d) * 3.6 * dt;
          p.z += (dz / d) * 3.6 * dt;
          this.constrainAvatar(o);
        }
      }
      z.tick -= dt;
      if (z.tick <= 0) {
        z.tick += 0.4;
        for (const o of this.factions) {
          if (o === owner || !o.alive || !o.towerAlive) continue;
          const p = o.avatar.root.position;
          if (Math.hypot(p.x - z.center.x, p.z - z.center.z) < 8.8) {
            this.damageAvatar(o, 14, owner, { slow: 1.4 });
          }
        }
        z.towerTick -= 0.4;
        if (z.towerTick <= 0) {
          z.towerTick += 0.8;
          for (const o of this.factions) {
            if (o === owner || !o.towerAlive) continue;
            const tp = o.tower.group.position;
            if (Math.hypot(tp.x - z.center.x, tp.z - z.center.z) < 8.8 + TOWER_RADIUS) {
              this.damageTower(o, 11, owner, {});
            }
          }
        }
      }
    }
  }

  schedule(delay, fn) {
    this.scheduled.push({ t: delay, fn });
  }

  updateScheduled(dt) {
    for (let i = this.scheduled.length - 1; i >= 0; i--) {
      const s = this.scheduled[i];
      s.t -= dt;
      if (s.t <= 0) {
        this.scheduled.splice(i, 1);
        try { s.fn(); } catch (err) { console.error(err); }
      }
    }
  }
  /* --------------------------------- aim ---------------------------------- */

  computeAim(input) {
    const f = this.player;
    if (!f) return;
    const p = f.avatar.root.position;
    const target = this.tmpVec.set(0, 1.4, 0);
    let found = false;

    if (input.touchAim && input.touchAim.active) {
      const len = Math.hypot(input.touchAim.x, input.touchAim.y);
      if (len > 0.12) {
        target.set(p.x + input.touchAim.x * 20, 1.4, p.z - input.touchAim.y * 20);
        found = true;
      }
    } else if (input.pointerActive) {
      this.raycaster.setFromCamera(input.aimNDC, this.camera);
      const hit = this.raycaster.ray.intersectPlane(this.aimPlane, target);
      if (hit) found = true;
    }

    if (!found) {
      target.set(0, 1.4, 0);
      if (Math.hypot(p.x, p.z) < 2.5) target.set(0, 1.4, 12);
    }

    target.y = 1.4;
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const len = Math.hypot(dx, dz);

    if (len > 0.6) {
      this.aimDir.set(dx / len, 0, dz / len);
      this.aimPoint.copy(target);
    }

    /* subtle touch aim assist */
    if (input.touchAim && input.touchAim.active) {
      let best = null;
      let bestD = 24;
      for (const o of this.factions) {
        if (o === f || !o.towerAlive) continue;
        if (o.alive) {
          const op = o.avatar.root.position;
          const d = Math.hypot(op.x - p.x, op.z - p.z);
          if (d < bestD) { bestD = d; best = op; }
        }
      }
      if (best) {
        const ex = best.x - p.x;
        const ez = best.z - p.z;
        const el = Math.hypot(ex, ez) || 1;
        const dot = (ex / el) * this.aimDir.x + (ez / el) * this.aimDir.z;
        if (dot > 0.25) {
          this.aimDir.x = this.aimDir.x * 0.45 + (ex / el) * 0.55;
          this.aimDir.z = this.aimDir.z * 0.45 + (ez / el) * 0.55;
          this.aimDir.normalize();
          this.aimPoint.set(best.x, 1.4, best.z);
        }
      }
    }
  }

  updateScreenAim() {
    const v = this.tmpVec2.copy(this.aimPoint).project(this.camera);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.screenAim.x = (v.x * 0.5 + 0.5) * w;
    this.screenAim.y = (-v.y * 0.5 + 0.5) * h;
    this.screenAim.visible = v.z < 1 && v.x > -1.4 && v.x < 1.4 && v.y > -1.4 && v.y < 1.4 && this.state === 'playing' && this.player && this.player.alive && !this.player.stunTime;
  }

  /* -------------------------------- camera -------------------------------- */

  updateCamera(dt, time) {
    const aspectScale = this.camera.aspect < 1 ? 1.24 : 1;

    if (this.state === 'menu') {
      const a = this.menuAngle;
      const radius = 53;
      this.camDesired.set(Math.sin(a) * radius, 27 + Math.sin(a * 1.3) * 2, Math.cos(a) * radius);
      this.camPos.lerp(this.camDesired, 1 - Math.exp(-2.2 * Math.min(dt, 0.08)));
      this.camLook.lerp(this.tmpVec.set(0, 4.2, 0), 1 - Math.exp(-2 * Math.min(dt, 0.08)));
    } else if (this.state === 'playing' || this.state === 'ending') {
      const f = this.player;
      if (f) {
        const p = f.avatar.root.position;
        const z = this.zoom * aspectScale;
        this.camDesired.set(p.x, 30.5 * z, p.z + 29.5 * z);
        this.camTarget.set(
          p.x + this.aimDir.x * 4.6,
          1.8 + Math.min(2.5, Math.hypot(p.x, p.z) * 0.02),
          p.z + this.aimDir.z * 4.6
        );
        this.camPos.lerp(this.camDesired, 1 - Math.exp(-5.5 * Math.min(dt, 0.08)));
        this.camLook.lerp(this.camTarget, 1 - Math.exp(-6.5 * Math.min(dt, 0.08)));
      }
    } else if (this.state === 'over') {
      this.endTime += dt;
      const a = 0.7 + this.endTime * 0.07;
      this.camDesired.set(Math.sin(a) * 51, 24, Math.cos(a) * 51);
      this.camPos.lerp(this.camDesired, 1 - Math.exp(-1.4 * Math.min(dt, 0.08)));
      this.camLook.lerp(this.tmpVec.set(0, 4.5, 0), 1 - Math.exp(-1.6 * Math.min(dt, 0.08)));
    }

    this.camera.position.copy(this.camPos);
    if (this.shake > 0.002) {
      const s = this.shake;
      this.camera.position.x += (Math.random() - 0.5) * s * 1.8;
      this.camera.position.y += (Math.random() - 0.5) * s * 1.4;
      this.camera.position.z += (Math.random() - 0.5) * s * 1.4;
      this.shake *= Math.exp(-7.5 * Math.min(dt, 0.08));
    }
    this.camera.position.y = Math.max(6, this.camera.position.y);
    this.camera.lookAt(this.camLook);
  }

  /* -------------------------------- endings ------------------------------- */

  beginEnding(result, winner) {
    if (this.state !== 'playing') return;
    this.state = 'ending';
    this.endResult = result;
    this.endWinner = winner;
    this.endTimer = 1.35;
    this.endTime = 0;
    this.input.firing = false;
    this.ui.respawn(null);
    if (result === 'victory') {
      this.ui.banner('THE NEXUS IS SILENT', 'VICTORY', this.player.el.css);
    } else {
      this.ui.banner('YOUR NEXUS IS LOST', 'DEFEAT', '#ff6a4a');
    }
  }

  updateEnding(dt, time) {
    this.endTimer -= dt;
    for (const f of this.factions) {
      this.updateTower(f, dt);
      if (f.alive) {
        f.avatar.update(dt, time + f.el.angle, { moving: false, casting: false });
      }
    }
    if (this.endTimer <= 0) this.finishBattle();
  }

  finishBattle() {
    if (this.state === 'over') return;
    this.state = 'over';
    this.endTime = 0;
    this.ui.respawn(null);
    this.ui.showEnd({
      result: this.endResult,
      winner: this.endWinner,
      damage: this.stats.damage,
      kills: this.stats.kills,
      towers: this.stats.towers,
      deaths: this.stats.deaths,
      time: this.elapsed,
      player: this.player
    });
    if (this.endResult === 'victory') {
      this.audio.victory();
      if (this.player) {
        const p = this.player.avatar.root.position;
        this.fx.burst(p.x, 2, p.z, 0xffd98a, 60, { speed: 11, size: 0.75, life: 1.8, lift: 6, gravity: -3 });
        this.fx.ring(p.x, 0.5, p.z, 0xffd98a, 10, 1.1);
      }
    } else {
      this.audio.defeat();
    }
  }

  updateOver(dt, time) {
    for (const f of this.factions) {
      this.updateTower(f, dt);
      if (f.alive) f.avatar.update(dt, time + f.el.angle, { moving: false, casting: false });
    }
  }
}



