import * as THREE from 'three';
import { createWorld } from './world.js';
import { FX } from './fx.js';
import { UI } from './ui.js';
import { AudioEngine } from './audio.js';
import { Game } from './game.js';

/* --------------------------------- setup --------------------------------- */

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa8d0e8);
scene.fog = new THREE.FogExp2(0xd3e4ec, 0.0029);

const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.4, 420);
camera.position.set(0, 27, 54);

const world = createWorld(scene);
const fx = new FX(scene);
const ui = new UI();
const audio = new AudioEngine();
const game = new Game({ scene, camera, fx, ui, audio });

/* --------------------------------- input --------------------------------- */

const input = {
  firing: false,
  aimNDC: new THREE.Vector2(0, 0),
  pointerActive: false,
  moveX: 0,
  moveZ: 0,
  touchAim: { x: 0, y: 0, active: false }
};

const keys = new Set();
let mouseDown = false;
let touchMove = { x: 0, y: 0 };
let touchAimMag = 0;

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

window.addEventListener('keydown', (e) => {
  if (isTypingTarget(e.target)) return;
  if (e.code === 'Escape') {
    e.preventDefault();
    if (!document.getElementById('howModal').classList.contains('hidden')) {
      closeHow();
    } else if (!document.getElementById('pauseScreen').classList.contains('hidden')) {
      game.resume();
      audio.ui();
    } else if (game.state === 'playing' || game.state === 'ending') {
      game.pause();
      audio.ui();
    }
    return;
  }
  if (MOVE_KEYS.has(e.code)) e.preventDefault();
  if (e.code === 'Space') {
    e.preventDefault();
    keys.add(e.code);
    return;
  }
  if (e.repeat) return;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyQ') {
    e.preventDefault();
    if (game.state === 'playing') game.tryDash();
    return;
  }
  if (e.code === 'KeyE') {
    if (game.state === 'playing') game.tryUlt();
    return;
  }
  if (e.code === 'KeyP') {
    if (game.state === 'playing' || game.state === 'ending') game.pause();
    else if (game.state === 'paused') game.resume();
    return;
  }
  if (e.code === 'KeyM' && game.state === 'menu') {
    toggleSound();
    return;
  }
  keys.add(e.code);
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'Space') e.preventDefault();
});

function updateNDC(clientX, clientY) {
  input.aimNDC.x = (clientX / window.innerWidth) * 2 - 1;
  input.aimNDC.y = -(clientY / window.innerHeight) * 2 + 1;
}

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  updateNDC(e.clientX, e.clientY);
  input.pointerActive = true;
});

window.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  updateNDC(e.clientX, e.clientY);
  input.pointerActive = true;
});

window.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch') return;
  if (e.button !== 0) return;
  if (e.target !== canvas) return;
  if (game.state === 'menu') return;
  mouseDown = true;
  input.pointerActive = true;
  updateNDC(e.clientX, e.clientY);
  audio.ensure();
});

window.addEventListener('pointerup', (e) => {
  if (e.button !== 0 && e.pointerType !== 'touch') return;
  mouseDown = false;
});

window.addEventListener('pointercancel', () => {
  mouseDown = false;
});

window.addEventListener('blur', () => {
  mouseDown = false;
  keys.clear();
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function pollKeyboard() {
  const left = keys.has('KeyA') || keys.has('ArrowLeft');
  const right = keys.has('KeyD') || keys.has('ArrowRight');
  const up = keys.has('KeyW') || keys.has('ArrowUp');
  const down = keys.has('KeyS') || keys.has('ArrowDown');
  input.moveX = (right ? 1 : 0) - (left ? 1 : 0) + touchMove.x;
  input.moveZ = (up ? 1 : 0) - (down ? 1 : 0) + touchMove.y;
}

window.addEventListener('wheel', (e) => {
  if (game.state !== 'playing' && game.state !== 'ending') return;
  if (document.getElementById('pauseScreen').classList.contains('hidden') === false) return;
  e.preventDefault();
  game.zoom = Math.max(0.68, Math.min(1.5, game.zoom + e.deltaY * 0.0007));
}, { passive: false });

/* ------------------------------- touch sticks ----------------------------- */

function setupStick(el, radius, onMove, onEnd) {
  let pointerId = null;
  let cx = 0;
  let cy = 0;
  const knob = el.querySelector('.stick-knob');

  function reset() {
    pointerId = null;
    if (knob) knob.style.transform = 'translate(-50%, -50%)';
    el.classList.remove('active');
    onEnd();
  }

  function move(e) {
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const len = Math.hypot(dx, dy);
    if (len > radius) {
      dx = (dx / len) * radius;
      dy = (dy / len) * radius;
    }
    if (knob) knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    onMove(dx / radius, dy / radius);
  }

  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (pointerId !== null) return;
    pointerId = e.pointerId;
    const rect = el.getBoundingClientRect();
    cx = rect.left + rect.width / 2;
    cy = rect.top + rect.height / 2;
    try { el.setPointerCapture(pointerId); } catch { /* synthetic events */ }
    el.classList.add('active');
    move(e);
  });

  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointerId) return;
    e.preventDefault();
    move(e);
  });

  el.addEventListener('pointerup', (e) => {
    if (e.pointerId !== pointerId) return;
    e.preventDefault();
    reset();
  });

  el.addEventListener('pointercancel', (e) => {
    if (e.pointerId !== pointerId) return;
    reset();
  });

  el.addEventListener('lostpointercapture', () => {
    if (pointerId !== null) reset();
  });
}

setupStick(document.getElementById('moveStick'), 46, (x, y) => {
  touchMove.x = x;
  touchMove.y = -y;
}, () => {
  touchMove.x = 0;
  touchMove.y = 0;
});

setupStick(document.getElementById('aimStick'), 46, (x, y) => {
  const len = Math.hypot(x, y);
  touchAimMag = len;
  input.touchAim.x = x;
  input.touchAim.y = -y;
  input.touchAim.active = len > 0.16;
  input.pointerActive = false;
}, () => {
  touchAimMag = 0;
  input.touchAim.x = 0;
  input.touchAim.y = 0;
  input.touchAim.active = false;
});

document.getElementById('touchDash').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  audio.ensure();
  game.tryDash();
});

document.getElementById('touchUlt').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  audio.ensure();
  game.tryUlt();
});

/* --------------------------------- menu ---------------------------------- */

const howModal = document.getElementById('howModal');

function openHow() {
  audio.ensure();
  audio.ui();
  howModal.classList.remove('hidden');
}

function closeHow() {
  howModal.classList.add('hidden');
}

ui.setClickSound(() => {
  audio.ensure();
  audio.ui();
});

function startBattle() {
  audio.ensure();
  game.startBattle(ui.getSelected());
  document.body.classList.add('in-game');
  mouseDown = false;
  keys.clear();
  touchMove.x = 0;
  touchMove.y = 0;
}

function restartBattle() {
  ui.hidePause();
  ui.hideEnd();
  game.startBattle(ui.getSelected());
  document.body.classList.add('in-game');
}

function changeElement() {
  game.toMenu();
  document.body.classList.remove('in-game');
  mouseDown = false;
  keys.clear();
}

function toggleSound() {
  audio.ensure();
  audio.setMuted(!audio.muted);
  ui.setSound(audio.muted);
  if (!audio.muted) audio.ui();
}

document.getElementById('startBtn').addEventListener('click', startBattle);
document.getElementById('howBtn').addEventListener('click', openHow);
document.getElementById('howClose').addEventListener('click', closeHow);
howModal.addEventListener('click', (e) => {
  if (e.target === howModal) closeHow();
});
document.getElementById('soundBtn').addEventListener('click', toggleSound);
document.getElementById('pauseBtn').addEventListener('click', () => {
  if (game.state === 'playing' || game.state === 'ending') game.pause();
  else if (game.state === 'paused') game.resume();
});
document.getElementById('resumeBtn').addEventListener('click', () => game.resume());
document.getElementById('restartBtn').addEventListener('click', restartBattle);
document.getElementById('quitBtn').addEventListener('click', changeElement);
document.getElementById('againBtn').addEventListener('click', restartBattle);
document.getElementById('changeBtn').addEventListener('click', changeElement);

window.addEventListener('keydown', (e) => {
  if (game.state === 'menu' && !howModal.classList.contains('hidden')) return;
  if (e.code === 'Enter' && game.state === 'menu' && document.activeElement === document.body) {
    startBattle();
    return;
  }
  if (game.state === 'menu' && ['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(e.code)) {
    const ids = ['fire', 'water', 'earth', 'air'];
    const idx = Number(e.code.slice(-1)) - 1;
    if (ids[idx]) {
      ui.setSelected(ids[idx]);
      audio.ui();
    }
  }
});

/* ------------------------------ lifecycle -------------------------------- */

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, w < 700 ? 1.75 : 2));
  renderer.setSize(w, h);
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 120));

document.addEventListener('visibilitychange', () => {
  if (document.hidden && (game.state === 'playing' || game.state === 'ending')) game.pause();
});

/* -------------------------------- loop ----------------------------------- */

let lastTime = performance.now();
let elapsed = 0;

const touchDash = document.getElementById('touchDash');
const touchUlt = document.getElementById('touchUlt');
const touchControls = document.getElementById('touchControls');

function updateTouchHud() {
  if (!touchControls) return;
  const touch = document.body.classList.contains('touch');
  const show = touch && (game.state === 'playing' || game.state === 'ending');
  touchControls.classList.toggle('hidden', !show);
  if (!show) return;
  const p = game.player;
  if (!p) return;
  touchDash.style.setProperty('--cd', Math.max(0, Math.min(1, p.dashCd / 4.1)).toFixed(3));
  touchUlt.style.setProperty('--cd', Math.max(0, Math.min(1, 1 - p.ult / 100)).toFixed(3));
  touchUlt.classList.toggle('ready', p.ult >= 100 && p.alive);
}

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  elapsed += dt;

  pollKeyboard();
  input.firing = game.state === 'playing' && (mouseDown || keys.has('Space') || touchAimMag > 0.42);

  world.update(elapsed, dt);
  fx.update(dt, elapsed);
  game.update(dt, elapsed, input);
  updateTouchHud();

  renderer.render(scene, camera);
}

/* -------------------------------- debug ---------------------------------- */

window.__nexus = {
  game,
  renderer,
  scene,
  camera,
  world,
  fx,
  ui,
  audio,
  THREE,
  input,
  startBattle
};

/* ------------------------------- boot ------------------------------------ */

ui.setSound(audio.muted);
document.fonts.ready.then(() => {
  renderer.render(scene, camera);
});
requestAnimationFrame(frame);
