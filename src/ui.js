import { ELEMENTS, ELEMENT_IDS, TOWER_HP, PLAY_RADIUS, ARENA_RADIUS } from './config.js';

const $ = (id) => document.getElementById(id);

const BASIC_NAMES = {
  fire: 'Ember Bolt',
  water: 'Tide Shard',
  earth: 'Boulder',
  air: 'Gale'
};

function icon(id) {
  return `<svg class="icon" aria-hidden="true"><use href="#icon-${id}"></use></svg>`;
}

function portrait(id) {
  return `<img class="avatar-portrait" src="assets/portraits/${id}.png" alt="" draggable="false" />`;
}

function roman(n) {
  return ['I', 'II', 'III', 'IV'][n] || 'I';
}

function pct(v) {
  return `${Math.max(0, Math.min(100, v))}%`;
}

function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export class UI {
  constructor() {
    this.menu = $('menu');
    this.hud = $('hud');
    this.startBtn = $('startBtn');
    this.soundBtn = $('soundBtn');
    this.pauseScreen = $('pauseScreen');
    this.endScreen = $('endScreen');
    this.feedEl = $('feed');
    this.bannerEl = $('banner');
    this.bannerKicker = $('bannerKicker');
    this.bannerText = $('bannerText');
    this.respawnEl = $('respawnOverlay');
    this.respawnTimer = $('respawnTimer');
    this.damageEl = $('damageFlash');
    this.crosshair = $('crosshair');
    this.objective = $('objective');
    this.hintEl = $('powerHint');
    this.portrait = $('playerPortrait');
    this.minimap = $('minimap');
    this.mapCtx = this.minimap.getContext('2d');
    this.minimapTowers = $('minimapTowers');
    this.rotateHint = $('rotateHint');

    this.selected = 'fire';
    this.cards = [];
    this.factionRefs = {};
    this.abilityRefs = {};
    this.bannerTimer = 0;
    this.hintTimer = 0;
    this.alertUntil = 0;
    this.mapAcc = 0;
    this.flashTimer = 0;
    this.lastTimer = '';
    this.selectedIndex = 0;

    this.buildElementGrid();
    this.setSelected('fire');
    this.setupMinimap();
    this.detectTouch();
    window.addEventListener('resize', () => this.detectTouch());
  }

  /* ------------------------------ menu ---------------------------------- */

  buildElementGrid() {
    const grid = $('elementGrid');
    grid.innerHTML = '';
    this.cards = ELEMENT_IDS.map((id, i) => {
      const el = ELEMENTS[id];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `element-card card-${id}`;
      btn.dataset.id = id;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', 'false');
      btn.setAttribute('aria-label', `${el.name} — ${el.role}`);
      btn.innerHTML = `
        <span class="card-check">&#10003;</span>
        <span class="card-glyph avatar">
          <span class="glyph-portrait">${portrait(id)}</span>
          <span class="glyph-element">${icon(id)}</span>
        </span>
        <span class="card-name">${el.name.toUpperCase()}</span>
        <span class="card-role">${el.role}</span>
        <span class="card-desc">${el.desc}</span>
        <span class="card-stats">
          ${['Power', 'Speed', 'Control'].map((label, k) => {
            const value = [el.stats.power, el.stats.speed, el.stats.control][k];
            return `<span class="stat-row"><span>${label}</span><i style="--v:${value}%"></i></span>`;
          }).join('')}
        </span>
        <span class="card-ult">${icon('ult')}<span>ULT</span><b>${el.ultName}</b></span>
      `;
      btn.addEventListener('click', () => {
        this.setSelected(id);
        this.clickSound && this.clickSound();
      });
      btn.addEventListener('pointerenter', () => {
        if (window.matchMedia('(hover: hover)').matches) this.previewHover(id);
      });
      grid.appendChild(btn);
      return { id, btn };
    });
  }

  previewHover(id) {
    document.documentElement.style.setProperty('--hover', ELEMENTS[id].css);
  }

  setSelected(id) {
    if (!ELEMENTS[id]) return;
    this.selected = id;
    this.selectedIndex = ELEMENT_IDS.indexOf(id);
    const el = ELEMENTS[id];
    for (const { id: cardId, btn } of this.cards) {
      const on = cardId === id;
      btn.classList.toggle('selected', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    }
    const root = document.documentElement;
    root.style.setProperty('--pick', el.css);
    root.style.setProperty('--pick-bright', el.brightCss);
    root.style.setProperty('--pick-soft', `${el.css}33`);
    if (this.portrait) this.portrait.innerHTML = portrait(id);
  }

  getSelected() {
    return this.selected;
  }

  setClickSound(fn) {
    this.clickSound = fn;
  }

  setSound(muted) {
    if (!this.soundBtn) return;
    const use = this.soundBtn.querySelector('use');
    if (use) use.setAttribute('href', muted ? '#icon-sound-off' : '#icon-sound-on');
    const label = this.soundBtn.querySelector('span');
    if (label) label.textContent = muted ? 'Sound Off' : 'Sound On';
    this.soundBtn.setAttribute('aria-label', muted ? 'Enable sound' : 'Mute sound');
  }

  showMenu() {
    this.menu.classList.remove('hidden');
    this.menu.removeAttribute('aria-hidden');
    this.hidePause();
    this.hideEnd();
    this.hideHud();
  }

  hideMenu() {
    this.menu.classList.add('hidden');
    this.menu.setAttribute('aria-hidden', 'true');
  }

  /* ------------------------------ battle -------------------------------- */

  prepareBattle(game) {
    const player = game.player;
    const el = player.el;
    this.hideMenu();
    this.hud.classList.remove('hidden');
    this.hud.setAttribute('aria-hidden', 'false');
    this.pauseScreen.classList.add('hidden');
    this.endScreen.classList.add('hidden');
    this.feedEl.innerHTML = '';
    this.bannerEl.classList.add('hidden');
    this.respawnEl.classList.add('hidden');
    this.hintEl.classList.add('hidden');
    this.crosshair.classList.remove('hidden');
    this.alertUntil = 0;
    this.lastTimer = '';
    document.documentElement.style.setProperty('--pick', el.css);
    document.documentElement.style.setProperty('--pick-bright', el.brightCss);
    document.documentElement.style.setProperty('--pick-soft', `${el.css}33`);
    this.portrait.innerHTML = portrait(player.id);
    $('playerName').textContent = el.avatar.toUpperCase();
    $('playerRole').textContent = `${el.name.toUpperCase()} AVATAR`;
    $('playerLevel').textContent = roman(this.selectedIndex);
    $('playerHpText').textContent = `${Math.round(player.hp)} / ${Math.round(player.maxHp)}`;

    this.buildFactionStrip(game);
    this.buildAbilities(el);
    this.objective.textContent = 'Destroy the three rival nexuses';
    this.objective.classList.remove('alert');
    this.minimapTowers.textContent = '4 TOWERS';
    this.update(game, 0);
    this.drawMinimap(game);
  }

  buildFactionStrip(game) {
    const strip = $('factionStrip');
    strip.innerHTML = '';
    this.factionRefs = {};
    for (const f of game.factions) {
      const el = f.el;
      const card = document.createElement('div');
      card.className = `faction-card${f.isPlayer ? ' player' : ''}`;
      card.dataset.id = f.id;
      card.innerHTML = `
        <span class="fc-glyph">${icon(f.id)}</span>
        <span class="fc-body">
          <span class="fc-top">
            <span class="fc-name">${el.name.toUpperCase()}${f.isPlayer ? ' <em>YOU</em>' : ''}</span>
            <span class="fc-hp">100%</span>
          </span>
          <span class="bar fc-tower-bar"><i></i></span>
          <span class="fc-avatar-row"><span class="fc-avatar-bar"><i></i></span><span class="fc-avatar-state">READY</span></span>
        </span>
      `;
      strip.appendChild(card);
      this.factionRefs[f.id] = {
        card,
        hpText: card.querySelector('.fc-hp'),
        towerFill: card.querySelector('.fc-tower-bar > i'),
        avatarFill: card.querySelector('.fc-avatar-bar > i'),
        avatarState: card.querySelector('.fc-avatar-state')
      };
    }
  }

  buildAbilities(el) {
    const wrap = $('abilities');
    wrap.innerHTML = '';
    const defs = [
      { kind: 'cast', key: 'LMB', cls: 'main', name: BASIC_NAMES[el.id], icon: 'cast' },
      { kind: 'dash', key: 'SHIFT', cls: '', name: 'Elemental Dash', icon: 'dash' },
      { kind: 'ult', key: 'E', cls: 'ult', name: el.ultName, icon: 'ult' }
    ];
    this.abilityRefs = {};
    for (const d of defs) {
      const b = document.createElement('div');
      b.className = `ability ${d.cls}`;
      b.style.setProperty('--c', el.css);
      b.innerHTML = `
        <span class="ab-flash"></span>
        <span class="ab-key">${d.key}</span>
        <span class="ab-icon">${icon(d.icon)}</span>
        <span class="ab-name">${d.name}</span>
      `;
      wrap.appendChild(b);
      this.abilityRefs[d.kind] = b;
    }
  }

  update(game, dt) {
    if (!game.player) return;
    const player = game.player;
    const el = player.el;

    const timer = formatTime(game.elapsed);
    if (timer !== this.lastTimer) {
      this.lastTimer = timer;
      $('matchTimer').textContent = timer;
    }

    /* faction cards */
    for (const f of game.factions) {
      const ref = this.factionRefs[f.id];
      if (!ref) continue;
      const towerFrac = f.towerHp / f.towerMax;
      const avatarFrac = f.hp / f.maxHp;
      ref.towerFill.style.width = pct(towerFrac * 100);
      ref.hpText.textContent = f.towerAlive ? `${Math.ceil(towerFrac * 100)}%` : '0%';
      ref.avatarFill.style.width = pct(avatarFrac * 100);
      ref.card.classList.toggle('dead', !f.towerAlive);
      let state = f.towerAlive ? (f.alive ? 'ACTIVE' : `REFORM ${Math.max(0, f.respawn).toFixed(0)}s`) : 'LOST';
      if (f.isPlayer && f.alive && f.ult >= 100) state = 'ULT READY';
      ref.avatarState.textContent = state;
    }

    /* player panel */
    const hpFrac = player.hp / player.maxHp;
    $('playerHpFill').style.width = pct(hpFrac * 100);
    $('playerHpFill').parentElement.classList.toggle('low', hpFrac < 0.3);
    $('playerHpText').textContent = `${Math.max(0, Math.ceil(player.hp))} / ${Math.round(player.maxHp)}`;
    let state = 'READY';
    if (!player.alive) state = 'REFORMING';
    else if (player.stunTime > 0) state = 'STUNNED';
    else if (player.dashTime > 0) state = 'DASHING';
    else if (player.slowTime > 0) state = 'CHILLED';
    else if (player.lastHit < 3) state = 'IN COMBAT';
    const stateEl = $('playerState');
    stateEl.textContent = state;
    stateEl.classList.toggle('danger', !player.alive || hpFrac < 0.3);

    const ultFrac = player.ult / 100;
    $('playerUltFill').style.width = pct(ultFrac * 100);
    $('playerUltText').textContent = `${Math.floor(player.ult)}%`;
    $('playerUltFill').closest('.ult-row').classList.toggle('ready', player.ult >= 100);

    /* abilities */
    const cast = this.abilityRefs.cast;
    const dash = this.abilityRefs.dash;
    const ult = this.abilityRefs.ult;
    if (cast) cast.style.setProperty('--cd', Math.max(0, Math.min(1, player.attackCd / el.attackCd)).toFixed(3));
    if (dash) {
      dash.style.setProperty('--cd', Math.max(0, Math.min(1, player.dashCd / 4.1)).toFixed(3));
      dash.classList.toggle('disabled', player.dashCd > 0);
    }
    if (ult) {
      ult.style.setProperty('--cd', Math.max(0, Math.min(1, 1 - ultFrac)).toFixed(3));
      ult.classList.toggle('ready', player.ult >= 100 && player.alive);
    }

    /* respawn overlay */
    if (!player.alive && game.state === 'playing' && player.towerAlive) {
      this.respawnEl.classList.remove('hidden');
      this.respawnTimer.textContent = Math.max(0, player.respawn).toFixed(1);
    } else {
      this.respawnEl.classList.add('hidden');
    }

    /* objective status */
    const alive = game.factions.filter((f) => f.towerAlive).length;
    const now = performance.now();
    if (now < this.alertUntil) {
      this.objective.textContent = 'YOUR NEXUS IS UNDER ATTACK';
      this.objective.classList.add('alert');
    } else {
      this.objective.textContent = player.towerAlive
        ? `${Math.max(0, alive - 1)} RIVAL ${alive - 1 === 1 ? 'NEXUS' : 'NEXUSES'} REMAIN`
        : 'YOUR NEXUS HAS FALLEN';
      this.objective.classList.toggle('alert', !player.towerAlive);
    }

    this.minimapTowers.textContent = `${alive} TOWER${alive === 1 ? '' : 'S'}`;

    /* crosshair */
    if (this.crosshair) {
      if (game.screenAim.visible) {
        this.crosshair.classList.remove('hidden');
        this.crosshair.style.left = `${game.screenAim.x}px`;
        this.crosshair.style.top = `${game.screenAim.y}px`;
      } else {
        this.crosshair.classList.add('hidden');
      }
    }

    this.mapAcc += dt;
    if (this.mapAcc > 0.07) {
      this.mapAcc = 0;
      this.drawMinimap(game);
    }
  }

  /* ----------------------------- feedback ------------------------------- */

  feed(html, color = '#e8c88a') {
    if (!this.feedEl) return;
    const item = document.createElement('div');
    item.className = 'feed-item';
    item.style.setProperty('--fc', color);
    item.innerHTML = html;
    this.feedEl.appendChild(item);
    while (this.feedEl.children.length > 5) this.feedEl.removeChild(this.feedEl.firstChild);
    setTimeout(() => {
      item.classList.add('out');
      setTimeout(() => item.remove(), 750);
    }, 6500);
  }

  banner(kicker, text, color = '#e8c88a') {
    if (!this.bannerEl) return;
    clearTimeout(this.bannerTimer);
    this.bannerKicker.textContent = kicker;
    this.bannerText.textContent = text;
    this.bannerEl.style.setProperty('--bc', color);
    this.bannerEl.classList.add('hidden');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.remove('hidden');
    this.bannerTimer = setTimeout(() => this.bannerEl.classList.add('hidden'), 2600);
  }

  hint(text) {
    clearTimeout(this.hintTimer);
    this.hintEl.textContent = text;
    this.hintEl.classList.remove('hidden');
    this.hintTimer = setTimeout(() => this.hintEl.classList.add('hidden'), 1500);
  }

  flashAbility(kind) {
    const el = this.abilityRefs[kind];
    if (!el) return;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 500);
  }

  flashDamage() {
    clearTimeout(this.flashTimer);
    this.damageEl.classList.add('hit');
    this.flashTimer = setTimeout(() => this.damageEl.classList.remove('hit'), 100);
  }

  towerAlert() {
    this.alertUntil = performance.now() + 2600;
  }

  respawn(seconds) {
    if (seconds === null) {
      this.respawnEl.classList.add('hidden');
    } else {
      this.respawnEl.classList.remove('hidden');
      this.respawnTimer.textContent = seconds.toFixed(1);
    }
  }

  /* ------------------------------- overlays ----------------------------- */

  showPause() {
    this.pauseScreen.classList.remove('hidden');
    this.pauseScreen.removeAttribute('aria-hidden');
  }

  hidePause() {
    this.pauseScreen.classList.add('hidden');
  }

  showEnd(data) {
    const panel = this.endScreen.querySelector('.end-panel');
    panel.classList.toggle('defeat', data.result !== 'victory');
    const title = $('endTitle');
    const kicker = $('endKicker');
    const subtitle = $('endSubtitle');
    const emblem = $('endEmblem');
    title.textContent = data.result === 'victory' ? 'VICTORY' : 'DEFEAT';
    kicker.textContent = data.result === 'victory' ? 'THE NEXUS IS SILENT' : 'THE FOURTH AGE ENDS';
    const playerEl = data.player.el;
    const winnerEl = data.winner ? data.winner.el : playerEl;
    if (data.result === 'victory') {
      subtitle.textContent = `${playerEl.name} stands alone. The rival nexuses are ash.`;
      emblem.innerHTML = icon(playerEl.id);
      document.documentElement.style.setProperty('--pick', playerEl.css);
      document.documentElement.style.setProperty('--pick-bright', playerEl.brightCss);
    } else {
      subtitle.textContent = data.winner
        ? `${winnerEl.name} holds the Nexus. Your tower is rubble.`
        : 'The Nexus has consumed all four.';
      emblem.innerHTML = icon(winnerEl.id);
      document.documentElement.style.setProperty('--pick', winnerEl.css);
      document.documentElement.style.setProperty('--pick-bright', winnerEl.brightCss);
    }
    $('endStats').innerHTML = `
      <div class="end-stat"><strong>${data.towers}/3</strong><span>Nexuses Broken</span></div>
      <div class="end-stat"><strong>${Math.round(data.damage).toLocaleString()}</strong><span>Damage Dealt</span></div>
      <div class="end-stat"><strong>${data.kills}</strong><span>Avatars Fallen</span></div>
      <div class="end-stat"><strong>${formatTime(data.time)}</strong><span>Battle Time</span></div>
    `;
    this.endScreen.classList.remove('hidden');
    this.endScreen.removeAttribute('aria-hidden');
  }

  hideEnd() {
    this.endScreen.classList.add('hidden');
  }

  hideHud() {
    this.hud.classList.add('hidden');
    this.hud.setAttribute('aria-hidden', 'true');
  }

  /* -------------------------------- minimap ------------------------------ */

  setupMinimap() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = 188;
    this.minimap.width = size * dpr;
    this.minimap.height = size * dpr;
    this.mapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.mapSize = size;
  }

  drawMinimap(game) {
    const ctx = this.mapCtx;
    if (!ctx || !game.player) return;
    const size = this.mapSize || 188;
    const c = size / 2;
    const R = size * 0.455;
    const scale = R / (ARENA_RADIUS * 0.96);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, R + 2, 0, Math.PI * 2);
    ctx.clip();

    const bg = ctx.createRadialGradient(c, c, 8, c, c, R);
    bg.addColorStop(0, '#0b1020');
    bg.addColorStop(1, '#050811');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);

    /* quadrant tint */
    for (const id of ELEMENT_IDS) {
      const el = ELEMENTS[id];
      const a0 = el.angle - Math.PI / 4;
      const a1 = el.angle + Math.PI / 4;
      const grad = ctx.createRadialGradient(c, c, 4, c, c, R);
      grad.addColorStop(0, `${el.css}12`);
      grad.addColorStop(1, `${el.css}28`);
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, R, a0, a1);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }

    /* rings */
    ctx.strokeStyle = 'rgba(232,200,138,0.16)';
    ctx.lineWidth = 1;
    for (const rr of [R, R * 0.68, R * 0.3]) {
      ctx.beginPath();
      ctx.arc(c, c, rr, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(232,200,138,0.4)';
    ctx.beginPath();
    ctx.arc(c, c, R, 0, Math.PI * 2);
    ctx.stroke();

    /* center sigil */
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(game.elapsed * 0.12);
    ctx.strokeStyle = 'rgba(232,210,160,0.28)';
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      ctx.moveTo(Math.cos(a) * 3, Math.sin(a) * 3);
      ctx.lineTo(Math.cos(a) * 6, Math.sin(a) * 6);
    }
    ctx.stroke();
    ctx.restore();

    /* towers */
    for (const f of game.factions) {
      const tp = f.tower.group.position;
      const x = c + tp.x * scale;
      const y = c + tp.z * scale;
      const frac = f.towerHp / f.towerMax;
      if (f.towerAlive) {
        ctx.strokeStyle = f.el.css;
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = f.el.css;
        ctx.shadowColor = f.el.css;
        ctx.shadowBlur = 7;
        ctx.fillRect(-2.7, -2.7, 5.4, 5.4);
        ctx.restore();
      } else {
        ctx.strokeStyle = 'rgba(160,120,120,0.55)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x - 3, y - 3);
        ctx.lineTo(x + 3, y + 3);
        ctx.moveTo(x + 3, y - 3);
        ctx.lineTo(x - 3, y + 3);
        ctx.stroke();
      }
    }

    /* cyclone zones */
    for (const z of game.zones) {
      if (z.type !== 'cyclone') continue;
      ctx.beginPath();
      ctx.arc(c + z.center.x * scale, c + z.center.z * scale, 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(177,140,255,0.18)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(220,205,255,0.4)';
      ctx.stroke();
    }

    /* projectiles */
    for (const p of game.projectiles) {
      ctx.fillStyle = ELEMENTS[p.element].css;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(c + p.pos.x * scale, c + p.pos.z * scale, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* avatars */
    for (const f of game.factions) {
      if (!f.alive) continue;
      const p = f.avatar.root.position;
      const x = c + p.x * scale;
      const y = c + p.z * scale;
      const rot = f.avatar.root.rotation.y;
      if (f.isPlayer) {
        const pulse = 1 + Math.sin(game.time * 4) * 0.2;
        ctx.beginPath();
        ctx.arc(x, y, 6.2 * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-rot);
      ctx.beginPath();
      ctx.moveTo(0, -4.2);
      ctx.lineTo(3, 3);
      ctx.lineTo(0, 1.8);
      ctx.lineTo(-3, 3);
      ctx.closePath();
      ctx.fillStyle = f.el.css;
      ctx.shadowColor = f.el.css;
      ctx.shadowBlur = f.isPlayer ? 9 : 4;
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
    ctx.shadowBlur = 0;
  }

  detectTouch() {
    const touch = window.matchMedia('(pointer: coarse)').matches
      || navigator.maxTouchPoints > 0
      || window.innerWidth < 600;
    document.body.classList.toggle('touch', touch);
    if (this.rotateHint) {
      this.rotateHint.classList.toggle('hidden', !(touch && window.innerHeight > window.innerWidth && window.innerWidth < 560));
    }
  }
}
