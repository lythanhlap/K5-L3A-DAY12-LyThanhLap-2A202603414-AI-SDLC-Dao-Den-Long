// Browser renderer + UI flow. Drives the deterministic sim (src/sim/game.js) at a fixed 60 Hz.
// Rules never live here: this file only reads sim state and feeds input.
import * as THREE from 'three';
import { createGame, createBenchGame, step, timeLeft, windWarning, NIGHTS, fuelOf, lightCost, capacityOf, winThreshold } from '../sim/game.js';
import { addEntry, isValidName, isoWithOffset, sortEntries } from '../leaderboard.js';
import { TICK_RATE, TUNING, RULES } from '../sim/tuning.js';
import { makePlayer, animatePlayer } from './character.js';
import { buildWorld } from './world.js';
import { PAL, ambientFor } from './palette.js';
import { initAudio, setVolume, sfx } from './audio.js';
import { createBackdrop } from './backdrop.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

// ---------------------------------------------------------------- settings (persisted)
const SETTINGS_KEY = 'ddl-settings';
// Ticket-04: every action can be rebound (saved); arrows ← → stay reserved for the camera.
const DEFAULT_KEYS = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', dash: 'ShiftLeft', interact: 'KeyE', pulse: 'KeyF', pause: 'Escape' };
const KEY_LABELS = { up: 'Đi lên', down: 'Đi xuống', left: 'Sang trái', right: 'Sang phải', jump: 'Nhảy', dash: 'Lướt', interact: 'Tương tác (nạp / châm dầu)', pulse: 'Tỏa sáng', pause: 'Tạm dừng' };
const RESERVED = { ArrowLeft: 'xoay camera trái', ArrowRight: 'xoay camera phải', F3: 'bộ đếm FPS' };
const settings = { volume: 0.6, sens: 0.5, gamma: 1, colorblind: false, captions: true, reduceMotion: false, largeText: false, keys: { ...DEFAULT_KEYS } };
try {
  const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  Object.assign(settings, saved, { keys: { ...DEFAULT_KEYS, ...(saved.keys || {}) } });
} catch {}
const saveSettings = () => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
};
$('set-volume').value = settings.volume;
$('set-sens').value = settings.sens;
$('set-volume').addEventListener('input', (e) => {
  settings.volume = Number(e.target.value);
  setVolume(settings.volume);
  saveSettings();
});
$('set-sens').addEventListener('input', (e) => {
  settings.sens = Number(e.target.value);
  saveSettings();
});
// Gamma: output = input^(1/gamma). 1.0 = standard palette; > 1 brightens dark night scenes.
function applyGamma() {
  const g = settings.gamma;
  for (const f of document.querySelectorAll('#gamma feFuncR, #gamma feFuncG, #gamma feFuncB')) f.setAttribute('exponent', String(1 / g));
  renderer.domElement.style.filter = Math.abs(g - 1) < 1e-3 ? 'none' : 'url(#gamma)';
  $('gamma-val').textContent = g.toFixed(2);
}
$('set-gamma').value = settings.gamma;
// Ticket-03 colour-blind palette: shade rim/eyes #7A3CFF -> #00B3FF, UI danger #FF5A5F -> #FFFFFF (+ ⚠ icon)
const CB = { shadeEdge: '#00B3FF', uiDanger: '#FFFFFF' };
const shadeEdge = () => (settings.colorblind ? CB.shadeEdge : PAL.shadeEdge);
function applyColorblind() {
  document.documentElement.style.setProperty('--danger', settings.colorblind ? CB.uiDanger : PAL.uiDanger);
  eyeMat.color.set(shadeEdge());
  for (const m of shadeMeshes.values()) {
    m.userData.rimMat.color.set(shadeEdge());
    m.userData.mat.emissive.set(shadeEdge());
  }
}
$('set-cb').checked = settings.colorblind;
// accessibility toggles (Ticket-04)
function applyAccessibility() {
  document.documentElement.classList.toggle('large', settings.largeText);
  $('captions').classList.toggle('hidden', !settings.captions);
}
for (const [id, key] of [['set-captions', 'captions'], ['set-motion', 'reduceMotion'], ['set-large', 'largeText']]) {
  $(id).checked = settings[key];
  $(id).addEventListener('change', (e) => {
    settings[key] = e.target.checked;
    applyAccessibility();
    saveSettings();
  });
}
applyAccessibility();
const keyName = (code) =>
  ({ Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'Shift phải', Escape: 'Esc', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: 'Enter', Tab: 'Tab', ControlLeft: 'Ctrl' })[code] ||
  code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
let capturing = null;
function keyConflicts() {
  const byCode = {};
  for (const [a, c] of Object.entries(settings.keys)) (byCode[c] ||= []).push(a);
  return Object.values(byCode).filter((list) => list.length > 1).flat();
}
function renderKeys() {
  const box = $('keys');
  box.innerHTML = '';
  const bad = new Set(keyConflicts());
  for (const a of Object.keys(DEFAULT_KEYS)) {
    const label = document.createElement('span');
    label.textContent = KEY_LABELS[a];
    const b = document.createElement('button');
    b.className = 'alt' + (bad.has(a) ? ' conflict' : '');
    b.textContent = capturing === a ? 'Nhấn phím…' : keyName(settings.keys[a]);
    b.addEventListener('click', () => {
      capturing = a;
      renderKeys();
    });
    box.append(label, b);
  }
  const dup = keyConflicts();
  $('keys-note').textContent = dup.length ? `⚠ Trùng phím: ${dup.map((a) => KEY_LABELS[a]).join(', ')}` : '';
  const k = settings.keys;
  $('menu-keys').innerHTML =
    `<kbd>${keyName(k.up)}${keyName(k.left)}${keyName(k.down)}${keyName(k.right)}</kbd> đi · <kbd>${keyName(k.jump)}</kbd> nhảy · <kbd>${keyName(k.dash)}</kbd> lướt · <kbd>${keyName(k.interact)}</kbd> nạp / châm dầu<br/>` +
    `<kbd>${keyName(k.pulse)}</kbd>/click: tỏa sáng · kéo chuột/<kbd>←</kbd><kbd>→</kbd>: camera · <kbd>${keyName(k.pause)}</kbd>: tạm dừng`;
  document.querySelector('#cd-dash span').textContent = `Lướt ${keyName(k.dash)}`;
  document.querySelector('#cd-pulse span').textContent = `Sáng ${keyName(k.pulse)}`;
}
renderKeys();
$('set-cb').addEventListener('change', (e) => {
  settings.colorblind = e.target.checked;
  applyColorblind();
  saveSettings();
});
$('set-gamma').addEventListener('input', (e) => {
  settings.gamma = Number(e.target.value);
  applyGamma();
  saveSettings();
});

// ---------------------------------------------------------------- renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
applyGamma();
const scene = new THREE.Scene();
scene.background = new THREE.Color(PAL.sky);
scene.fog = new THREE.FogExp2(PAL.fog, 0.012);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 400);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
const hemi = new THREE.HemisphereLight('#c9d4ff', PAL.sea, 0.15);
scene.add(hemi);
const moon = new THREE.DirectionalLight('#9aa8ff', 0.5);
moon.position.set(-30, 50, -20);
scene.add(moon);

const backdrop = new URLSearchParams(location.search).has('bench') ? { update() {} } : createBackdrop(scene);
const playerMesh = makePlayer();
window.__render = { playerMesh, camera }; // debug/verification hook (read-only use)
scene.add(playerMesh);

// entity visuals
const moteGeo = new THREE.SphereGeometry(0.12, 8, 6);
const moteMat = new THREE.MeshBasicMaterial({ color: PAL.moteCore });
const haloGeo = new THREE.SphereGeometry(0.35, 8, 6);
const haloMat = new THREE.MeshBasicMaterial({ color: PAL.moteHalo, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
const shadeGeo = new THREE.SphereGeometry(0.75, 20, 14);
const rimGeo = new THREE.SphereGeometry(0.85, 20, 14);
const eyeGeo = new THREE.SphereGeometry(0.1, 8, 6);
const eyeMat = new THREE.MeshBasicMaterial({ color: PAL.shadeEdge }); // Ticket-03: rim + eyes share the edge colour

function makeShade() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: PAL.shadeBody, emissive: shadeEdge(), emissiveIntensity: 0.15 });
  const rimMat = new THREE.MeshBasicMaterial({ color: shadeEdge(), side: THREE.BackSide, transparent: true, opacity: 0.6 });
  const body = new THREE.Mesh(shadeGeo, mat);
  const rim = new THREE.Mesh(rimGeo, rimMat);
  const e1 = new THREE.Mesh(eyeGeo, eyeMat);
  const e2 = new THREE.Mesh(eyeGeo, eyeMat);
  e1.position.set(0.25, 0.15, 0.68);
  e2.position.set(-0.25, 0.15, 0.68);
  g.add(body, rim, e1, e2);
  g.userData = { mat, rimMat, body, rim };
  return g;
}
function makeLantern() {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 3, 8), new THREE.MeshStandardMaterial({ color: PAL.wood }));
  post.position.y = 1.5;
  const mat = new THREE.MeshStandardMaterial({ color: PAL.lanternOff, emissive: PAL.lanternLit, emissiveIntensity: 0 });
  const paper = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), mat);
  paper.scale.set(1, 1.25, 1);
  paper.position.y = 3.4;
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), new THREE.MeshBasicMaterial({ color: PAL.lanternCore }));
  core.position.y = 3.4;
  const light = new THREE.PointLight(PAL.lanternLit, 0, 20, 1.3);
  light.position.y = 3.6;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(TUNING.safe_radius - 0.12, TUNING.safe_radius, 64),
    new THREE.MeshBasicMaterial({ color: PAL.lanternLit, transparent: true, opacity: 0, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  g.add(post, paper, core, light, ring);
  // tear in the paper (only shown when unlit, so lit/unlit differ without colour)
  const tear = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.05), new THREE.MeshBasicMaterial({ color: '#1a1424' }));
  tear.position.set(0.15, 3.4, 0.58);
  tear.rotation.z = 0.5;
  // fuel bar (billboard)
  const bar = new THREE.Group();
  bar.position.y = 4.6;
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.16), new THREE.MeshBasicMaterial({ color: '#1B2350', transparent: true, opacity: 0.8, depthTest: false }));
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(1.32, 0.1), new THREE.MeshBasicMaterial({ color: PAL.lanternLit, depthTest: false }));
  fill.position.z = 0.001;
  fill.geometry.translate(0.66, 0, 0);
  fill.position.x = -0.66;
  bar.add(bg, fill);
  bar.renderOrder = 10;
  g.add(tear, bar);
  g.userData = { mat, light, ring, core, paper, tear, bar, fill };
  return g;
}
function makeDrifter() {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: PAL.drifter, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 1.8, 1, 6), m);
    r.position.x = (i - 1) * 0.25;
    r.rotation.x = Math.PI / 2;
    g.add(r);
  }
  return g;
}
function makeCharm() {
  const g = new THREE.Group();
  const border = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.92), new THREE.MeshBasicMaterial({ color: PAL.gold, side: THREE.DoubleSide }));
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.8), new THREE.MeshBasicMaterial({ color: PAL.scarf, side: THREE.DoubleSide }));
  paper.position.z = 0.01;
  g.add(border, paper);
  return g;
}
const pulseRing = new THREE.Mesh(
  new THREE.RingGeometry(0.85, 1, 64),
  new THREE.MeshBasicMaterial({ color: PAL.lanternCore, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
);
pulseRing.rotation.x = -Math.PI / 2;
scene.add(pulseRing);
let pulseFx = 0;

// wind leaves
const LEAVES = 120;
const leafGeo = new THREE.BufferGeometry();
leafGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LEAVES * 3), 3));
const leaves = new THREE.Points(leafGeo, new THREE.PointsMaterial({ color: '#9bc47a', size: 0.25, transparent: true, opacity: 0 }));
scene.add(leaves);

// ---------------------------------------------------------------- input
const keys = new Set();
let camYaw = 0;
let mouseDown = false;
let mousePulse = false;
let lastMouseX = 0;
let dragged = 0;
let pauseQueued = false;
addEventListener('keydown', (e) => {
  if (capturing) {
    e.preventDefault();
    if (RESERVED[e.code]) {
      $('keys-note').textContent = `⚠ ${keyName(e.code)} đang dùng cho ${RESERVED[e.code]}`;
    } else {
      settings.keys[capturing] = e.code;
      saveSettings();
    }
    capturing = null;
    renderKeys();
    return;
  }
  keys.add(e.code);
  if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab') e.preventDefault();
  if (e.code === settings.keys.pause && (phase === 'playing' || phase === 'paused')) togglePause();
  if (e.code === 'F3') $('fps').classList.toggle('hidden');
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
renderer.domElement.addEventListener('mousedown', (e) => {
  mouseDown = true;
  dragged = 0;
  lastMouseX = e.clientX;
});
addEventListener('mouseup', () => {
  if (mouseDown && dragged < 6 && phase === 'playing') mousePulse = true;
  mouseDown = false;
});
addEventListener('mousemove', (e) => {
  if (!mouseDown) return;
  const dx = e.clientX - lastMouseX;
  lastMouseX = e.clientX;
  dragged += Math.abs(dx);
  camYaw -= dx * settings.sens * 0.6;
});

function sampleInput() {
  if (keys.has('ArrowLeft')) camYaw += 2;
  if (keys.has('ArrowRight')) camYaw -= 2;
  let x = 0;
  let z = 0;
  const k = settings.keys;
  if (keys.has(k.up)) z += 1;
  if (keys.has(k.down)) z -= 1;
  if (keys.has(k.right)) x -= 1; // screen-right = input x -1 (contract rotation, camera looks along +forward)
  if (keys.has(k.left)) x += 1;
  const input = {
    move: [x, z],
    cam_yaw_deg: camYaw,
    jump: keys.has(k.jump),
    interact: keys.has(k.interact),
    pulse: keys.has(k.pulse) || mousePulse,
    dash: keys.has(k.dash),
    pause: pauseQueued,
  };
  mousePulse = false;
  pauseQueued = false;
  return input;
}

// ---------------------------------------------------------------- game flow
const INTRO = {
  1: 'Ông Đăng: "Đảo Bến là nơi đèn lồng đầu tiên được thắp. Bắt đầu từ đây nhé, Mây."',
  2: 'Ông Đăng: "Đảo Cau có hai nửa, nối bằng cầu tre. Coi chừng Gió Lạc. Chúng thích đồ sáng lấp lánh."',
  3: 'Ông Đăng: "Đảo Chuông cao và lộng gió. Lên tới tháp chuông thì cả biển mây sẽ thấy ánh sáng của con."',
};
let phase = 'menu'; // menu | intro | playing | paused | result | dawn
let settingsReturn = 'menu';
let night = 1;
let totalScore = 0;
let nightsWon = 0;
const BENCH = params.has('bench');
let game = null;
let world = null;
const baseSeed = params.get('seed') != null ? Number(params.get('seed')) : BENCH ? 42 : Date.now() & 0x7fffffff;
const lanternMeshes = new Map();
const moteMeshes = new Map();
const shadeMeshes = new Map();
const drifterMeshes = new Map();
const charmMeshes = new Map();

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id);
  $('hudroot').classList.toggle('hidden', !(phase === 'playing' || phase === 'paused'));
}

function clearMap(map) {
  for (const m of map.values()) scene.remove(m);
  map.clear();
}

function loadNight(n, prebuilt = null) {
  night = n;
  game = prebuilt || createGame({ seed: baseSeed + n, night: n });
  window.__game = game;
  if (world) scene.remove(world);
  world = buildWorld(n);
  scene.add(world);
  for (const m of [moteMeshes, shadeMeshes, lanternMeshes, drifterMeshes, charmMeshes]) clearMap(m);
  for (const l of game.lanterns) {
    const m = makeLantern();
    m.position.set(...l.pos);
    scene.add(m);
    lanternMeshes.set(l.id, m);
  }
  for (const c of game.charms) {
    const m = makeCharm();
    scene.add(m);
    charmMeshes.set(c.id, m);
  }
  camYaw = 0;
  lastSecond = null;
  prevPos.clear();
  shownFacing = 0;
}

function startIntro(n) {
  loadNight(n);
  phase = 'intro';
  $('intro-title').textContent = `Đêm ${n}: ${NIGHTS[n].name}`;
  $('intro-quote').textContent = INTRO[n];
  show('scr-intro');
}

function togglePause() {
  pauseQueued = true;
  if (phase === 'paused') {
    // the sim only toggles on a false->true edge: deliver the release first (a no-op step while paused)
    step(game, { move: [0, 0], cam_yaw_deg: camYaw, pause: false });
    phase = 'playing';
    show(null);
  }
}

const actions = {
  play: () => {
    initAudio();
    setVolume(settings.volume);
    totalScore = 0;
    nightsWon = 0;
    startIntro(1);
  },
  'start-night': () => {
    phase = 'playing';
    show(null);
  },
  resume: () => togglePause(),
  restart: () => startIntro(night),
  menu: () => {
    phase = 'menu';
    show('scr-menu');
  },
  settings: () => {
    settingsReturn = phase === 'paused' ? 'scr-pause' : 'scr-menu';
    show('scr-settings');
  },
  'settings-back': () => {
    capturing = null;
    show(settingsReturn);
  },
  'keys-reset': () => {
    settings.keys = { ...DEFAULT_KEYS };
    capturing = null;
    saveSettings();
    renderKeys();
  },
  board: async () => {
    const prev = phase;
    phase = 'board';
    show('scr-board');
    const list = await fetchBoard();
    $('board-rows').innerHTML = list.length
      ? list.map((e, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(e.name)}</td><td>${e.score}</td><td>${e.nights_won}/3</td><td>${e.achieved_at.slice(0, 10)}</td></tr>`).join('')
      : '<tr><td colspan="5">Chưa có điểm nào.</td></tr>';
    if (prev === 'dawn') phase = 'board';
  },
  next: () => {
    if (game.state === 'won') {
      if (night < 3) startIntro(night + 1);
      else {
        phase = 'dawn';
        $('dawn-score').textContent = totalScore;
        mountSaveForm('scr-dawn');
        show('scr-dawn');
      }
    } else startIntro(night);
  },
};
for (const b of document.querySelectorAll('[data-act]')) b.addEventListener('click', () => actions[b.dataset.act]());
addEventListener('keydown', (e) => {
  if (e.code !== 'Enter') return;
  const visible = [...document.querySelectorAll('.screen')].find((s) => !s.classList.contains('hidden'));
  visible?.querySelector('button')?.click();
});

// ---------------------------------------------------------------- captions / visual cues (Ticket-04)
const captions = [];
let shadeCue = null;
let shakeT = 0;
const warnedLow = new Set();
let windCaptioned = false;
let tenCaptioned = false;
function addCaption(text, warn = false, ms = 3000) {
  captions.push({ text, warn, until: performance.now() + ms });
}
function renderCaptions() {
  const now = performance.now();
  while (captions.length && captions[0].until < now) captions.shift();
  const live = captions.slice(-3).map((c) => `<div class="${c.warn ? 'warn' : ''}">${settings.colorblind && c.warn ? '⚠ ' : ''}${escapeHtml(c.text)}</div>`);
  if (game.player.charm > 0) live.push(`<div>Bùa Gió ${Math.ceil(game.player.charm / 60)} s</div>`);
  if (game.wind.active) live.push('<div class="warn">Gió mạnh!</div>');
  const html = live.join('');
  if ($('captions').innerHTML !== html) $('captions').innerHTML = html;
}
function updateCues(tl) {
  if (windWarning(game) && !windCaptioned) addCaption('Gió sắp thổi!', true);
  windCaptioned = windWarning(game);
  if (tl <= 10 && tl > 0 && !tenCaptioned) addCaption('10 giây cuối!', true, 4000);
  tenCaptioned = tl <= 10;
  for (const l of game.lanterns) {
    const low = l.lit && fuelOf(l) < TUNING.low_fuel_threshold;
    if (low && !warnedLow.has(l.id)) addCaption(`Đèn ${l.id} sắp cạn dầu (dưới 30)!`, true, 4000);
    if (low) warnedLow.add(l.id);
    else warnedLow.delete(l.id);
  }
}
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------------------------------------------------------------- leaderboard (Ticket-04)
const LOCAL_BOARD = 'ddl-leaderboard';
function localBoard() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_BOARD) || '[]');
  } catch {
    return [];
  }
}
function saveLocalBoard(list) {
  try {
    localStorage.setItem(LOCAL_BOARD, JSON.stringify(list));
  } catch {}
}
async function fetchBoard() {
  try {
    const r = await fetch('/api/leaderboard');
    if (r.ok) return (await r.json()).entries;
  } catch {}
  return sortEntries(localBoard());
}
async function submitScore(entry) {
  try {
    const r = await fetch('/api/leaderboard', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(entry) });
    if (r.ok) {
      saveLocalBoard((await r.json()).entries);
      return 'disk';
    }
  } catch {}
  saveLocalBoard(addEntry(localBoard(), entry)); // static hosting without the server: browser storage
  return 'local';
}
function mountSaveForm(screenId) {
  const box = document.querySelector(`#${screenId} .save-score`);
  box.innerHTML = '';
  box.append($('tpl-save').content.cloneNode(true));
  const input = box.querySelector('.save-name');
  const note = box.querySelector('.save-note');
  const btn = box.querySelector('.save-btn');
  input.addEventListener('keydown', (e) => e.stopPropagation()); // typing a name must not trigger game keys
  btn.addEventListener('click', async () => {
    if (!isValidName(input.value)) {
      note.textContent = 'Tên cần 3–12 ký tự: chữ, số hoặc _';
      return;
    }
    const entry = { name: input.value, score: totalScore, nights_won: nightsWon, achieved_at: isoWithOffset(), seed: baseSeed };
    const where = await submitScore(entry);
    box.innerHTML = `<p>Đã lưu điểm ${totalScore} (${where === 'disk' ? 'trên đĩa' : 'trong trình duyệt'}).</p>`;
  });
}

let lastSecond = null;
function handleEvents(events) {
  for (const e of events) {
    switch (e.name) {
      case 'mote_picked':
        sfx.pickup();
        break;
      case 'deposit':
        sfx.deposit();
        break;
      case 'lantern_lit':
        sfx.lit();
        break;
      case 'pulse':
        sfx.pulse();
        pulseFx = 1;
        break;
      case 'player_hit':
        sfx.hit();
        if (!settings.reduceMotion) {
          shakeT = 0.35;
          $('flash').style.opacity = 1;
          setTimeout(() => ($('flash').style.opacity = 0), 120);
        }
        break;
      case 'dash':
        sfx.dash();
        break;
      case 'shade_spawned':
        sfx.shade();
        addCaption('Bóng Mực xuất hiện!', true);
        shadeCue = { id: e.data.id, until: performance.now() + 3000 };
        break;
      case 'drifter_steal':
        sfx.steal();
        break;
      case 'charm_picked':
        sfx.charm();
        break;
      case 'paused':
        phase = 'paused';
        show('scr-pause');
        break;
      case 'game_over': {
        const won = e.data.result === 'won';
        if (won) {
          totalScore += game.score;
          nightsWon++;
        }
        (won ? sfx.win : sfx.lose)();
        phase = 'result';
        const need = winThreshold(game);
        const reason = { dawn_survived: `Đảo còn sáng tới bình minh! (${game.lanterns.filter((l) => l.lit).length}/${game.lanterns.length} đèn)`, dawn: `Bình minh tới mà đảo chưa đủ sáng (cần ${need} đèn).`, no_flames: 'Mây đã mất hết Ngọn Lửa.' }[e.data.reason];
        $('res-title').textContent = won ? `Đêm ${night} đã sáng!` : `Đêm ${night} chưa qua…`;
        $('res-body').innerHTML = `${reason}<br/>Điểm đêm: <b>${game.score}</b> · Tổng: <b>${totalScore}</b>`;
        $('res-next').textContent = won ? (night < 3 ? 'Đêm tiếp theo' : 'Đón bình minh') : 'Chơi lại Đêm';
        if (!won) mountSaveForm('scr-result');
        else document.querySelector('#scr-result .save-score').innerHTML = '';
        setTimeout(() => show('scr-result'), 700);
        break;
      }
    }
  }
}

// ---------------------------------------------------------------- per-frame visuals
let lastT = 0;
// Render interpolation: the sim ticks at 60 Hz but the screen refreshes faster (e.g. 144 Hz).
// Draw entities between their previous and current tick positions so motion is smooth.
const prevPos = new Map(); // id -> [x,y,z] at the previous sim tick
let alpha = 1;
function rememberPositions() {
  prevPos.set('player', [...game.player.pos]);
  for (const s of game.shades) prevPos.set(s.id, [...s.pos]);
  for (const d of game.drifters) prevPos.set(d.id, [...d.pos]);
}
function lerpPos(id, cur) {
  const a = prevPos.get(id);
  if (!a || Math.hypot(cur[0] - a[0], cur[1] - a[1], cur[2] - a[2]) > 3) return cur; // teleport/respawn: snap
  return [a[0] + (cur[0] - a[0]) * alpha, a[1] + (cur[1] - a[1]) * alpha, a[2] + (cur[2] - a[2]) * alpha];
}
let shownFacing = 0;
function syncEntities(t, dt) {
  const p = game.player;
  const pp = lerpPos('player', p.pos);
  const speed = Math.hypot(pp[0] - playerMesh.position.x, pp[2] - playerMesh.position.z) / Math.max(dt, 1e-3);
  animatePlayer(playerMesh, phase === 'playing' && p.grounded ? speed : 0, dt);
  playerMesh.position.set(...pp);
  // turn smoothly along the shortest arc (~0.1 s for a half turn)
  let dA = p.facing - shownFacing;
  dA = Math.atan2(Math.sin(dA), Math.cos(dA));
  shownFacing += dA * Math.min(1, dt * 18);
  playerMesh.rotation.y = shownFacing;
  playerMesh.visible = p.respawn === 0 && (p.invuln === 0 || settings.reduceMotion || Math.floor(t * 12) % 2 === 0);
  playerMesh.userData.glow.intensity = 2 + p.carried;

  const seen = new Set();
  for (const m of game.motes) {
    seen.add(m.id);
    let mesh = moteMeshes.get(m.id);
    if (!mesh) {
      mesh = new THREE.Group();
      mesh.add(new THREE.Mesh(moteGeo, moteMat), new THREE.Mesh(haloGeo, haloMat));
      scene.add(mesh);
      moteMeshes.set(m.id, mesh);
    }
    mesh.position.set(m.pos[0], m.pos[1] + 0.7 + 0.2 * Math.sin(t * 2 + Number(m.id.slice(1))), m.pos[2]);
    mesh.visible = m.ttl == null || m.ttl > 120 || Math.floor(t * 8) % 2 === 0;
  }
  for (const [id, mesh] of moteMeshes) if (!seen.has(id)) (scene.remove(mesh), moteMeshes.delete(id));

  seen.clear();
  for (const s of game.shades) {
    seen.add(s.id);
    let mesh = shadeMeshes.get(s.id);
    if (!mesh) {
      mesh = makeShade();
      scene.add(mesh);
      shadeMeshes.set(s.id, mesh);
    }
    const sp = lerpPos(s.id, s.pos);
    mesh.position.set(sp[0], sp[1] + 0.1 * Math.sin(t * 3), sp[2]);
    mesh.lookAt(p.pos[0], s.pos[1], p.pos[2]);
    const u = mesh.userData;
    const stunned = s.state === 'stunned';
    u.mat.color.set(stunned ? PAL.shadeStunned : PAL.shadeBody);
    u.rimMat.opacity = stunned ? 0.2 : 0.6;
    const k = s.state === 'spawning' ? 1 - s.t / RULES.spawningTicks : 1;
    mesh.scale.setScalar(Math.max(0.05, k));
    u.body.scale.y = stunned ? 0.6 : 1;
  }
  for (const [id, mesh] of shadeMeshes) if (!seen.has(id)) (scene.remove(mesh), shadeMeshes.delete(id));

  seen.clear();
  for (const d of game.drifters) {
    seen.add(d.id);
    let mesh = drifterMeshes.get(d.id);
    if (!mesh) {
      mesh = makeDrifter();
      scene.add(mesh);
      drifterMeshes.set(d.id, mesh);
    }
    mesh.visible = d.state !== 'removed';
    const dpos = lerpPos(d.id, d.pos);
    mesh.position.set(dpos[0], dpos[1] + 0.2 * Math.sin(t * 4), dpos[2]);
    mesh.rotation.y = t * 2;
    mesh.children.forEach((r, i) => (r.rotation.z = Math.sin(t * 6 + i) * 0.5));
  }
  for (const [id, mesh] of drifterMeshes) if (!seen.has(id)) (scene.remove(mesh), drifterMeshes.delete(id));

  for (const c of game.charms) {
    const mesh = charmMeshes.get(c.id);
    mesh.visible = c.available;
    mesh.position.set(c.pos[0], c.pos[1] + 1 + 0.15 * Math.sin(t * 2), c.pos[2]);
    mesh.rotation.y = t * 1.5;
  }

  let lit = 0;
  for (const l of game.lanterns) {
    const u = lanternMeshes.get(l.id).userData;
    const fuel = fuelOf(l);
    const low = l.lit && fuel < TUNING.low_fuel_threshold;
    const blinkOff = low && Math.floor(t * 2) % 2 === 1; // 1 Hz blink below 30
    const f = l.lit ? Math.max(0.25, fuel / TUNING.fuel_max) : l.deposited / lightCost(l);
    u.mat.color.set(l.lit ? PAL.lanternLit : PAL.lanternOff);
    u.mat.emissiveIntensity = l.lit ? (blinkOff ? 0.3 : 1.6 * f) : f * 0.5;
    u.core.visible = l.lit && !blinkOff;
    u.light.intensity = l.lit ? (blinkOff ? 15 : 80 * f) : f * 8;
    u.ring.material.opacity = l.lit && !low ? 0.35 : 0; // weak lanterns have no safe zone
    // unlit: crumpled 20% + torn paper (distinguishable without colour)
    u.paper.scale.set(l.lit ? 1 : 0.8, l.lit ? 1.25 : 1.0, l.lit ? 1 : 0.8);
    u.paper.rotation.z = l.lit ? 0 : 0.25;
    u.tear.visible = !l.lit;
    u.bar.visible = l.lit && !blinkOff;
    u.fill.scale.x = Math.max(0.001, fuel / TUNING.fuel_max);
    u.fill.material.color.set(low ? (settings.colorblind ? CB.uiDanger : PAL.uiDanger) : PAL.lanternLit);
    u.bar.quaternion.copy(camera.quaternion);
    if (l.lit) lit++;
  }
  hemi.intensity = ambientFor(lit, game.lanterns.length);

  if (pulseFx > 0) {
    const s = (1 - pulseFx) * TUNING.pulse_radius + 0.5;
    pulseRing.scale.set(s, s, s);
    pulseRing.position.set(p.pos[0], p.pos[1] + 0.1, p.pos[2]);
    pulseRing.material.opacity = pulseFx;
  } else pulseRing.material.opacity = 0;

  // wind leaves (warning 2 s before + during gust)
  const warn = windWarning(game);
  const active = game.wind.active;
  leaves.material.opacity = active ? 0.9 : warn ? 0.5 : 0;
  if (warn || active) {
    const a = (game.wind.dir * Math.PI) / 180;
    const arr = leafGeo.attributes.position.array;
    for (let i = 0; i < LEAVES; i++) {
      const ph = (t * (active ? 0.6 : 0.3) + i / LEAVES) % 1;
      const side = ((i * 37) % 30) - 15;
      const along = (ph - 0.5) * 40;
      arr[i * 3] = p.pos[0] + Math.cos(a) * along - Math.sin(a) * side;
      arr[i * 3 + 1] = p.pos[1] + 0.5 + ((i * 13) % 5);
      arr[i * 3 + 2] = p.pos[2] + Math.sin(a) * along + Math.cos(a) * side;
    }
    leafGeo.attributes.position.needsUpdate = true;
    if (warn && !windWasWarning) sfx.wind();
  }
  windWasWarning = warn;
}
let windWasWarning = false;

function updateCamera() {
  const p = game ? lerpPos('player', game.player.pos) : [0, 0, 0];
  const th = (camYaw * Math.PI) / 180;
  const f = [Math.sin(th), Math.cos(th)];
  const y = Math.max(p[1], -4);
  camera.position.set(p[0] - f[0] * 9, y + 5.5, p[2] - f[1] * 9);
  if (shakeT > 0 && !settings.reduceMotion) {
    const k = shakeT * 0.6;
    camera.position.x += Math.sin(performance.now() * 0.09) * k;
    camera.position.y += Math.cos(performance.now() * 0.11) * k;
  }
  camera.lookAt(p[0] + f[0] * 2, y + 1.2, p[2] + f[1] * 2);
}

const v3 = new THREE.Vector3();
function updateHud() {
  const p = game.player;
  $('flames').textContent = '🔥'.repeat(Math.max(0, p.flames)) + '·'.repeat(Math.max(0, TUNING.flames - p.flames));
  const tl = Math.max(0, timeLeft(game));
  const clock = $('clock');
  clock.textContent = `${String(Math.floor(tl / 60)).padStart(2, '0')}:${String(Math.floor(tl % 60)).padStart(2, '0')}`;
  clock.classList.toggle('danger', tl <= 30);
  if (tl <= 30 && settings.colorblind) clock.textContent = `⚠ ${clock.textContent}`;
  const sec = Math.ceil(tl);
  if (phase === 'playing' && sec <= 10 && sec !== lastSecond && sec > 0) sfx.tick();
  lastSecond = sec;
  const lit = game.lanterns.filter((l) => l.lit).length;
  const need = winThreshold(game);
  $('topright').innerHTML = `Đèn <b>${lit}/${game.lanterns.length}</b> <small>(cần ${need} lúc bình minh)</small><br/>Điểm <b>${game.score}</b><br/><small>Tổng ${totalScore}</small>`;
  const cap = capacityOf(game);
  const bar = $('motebar');
  if (bar.children.length !== cap + 1) bar.innerHTML = '<i></i>'.repeat(cap) + '<span></span>';
  [...bar.querySelectorAll('i')].forEach((c, i) => c.classList.toggle('on', i < p.carried));
  bar.querySelector('span').textContent = `${p.carried} / ${cap}`;
  const cd = (id, left, total, ready) => {
    const el = $(id);
    el.querySelector('.fill').style.height = `${Math.min(1, left / total) * 100}%`;
    el.classList.toggle('ready', ready);
  };
  cd('cd-dash', p.charm > 0 ? 0 : p.dashCd, TUNING.dash_cooldown_s * TICK_RATE, p.dashCd === 0 || p.charm > 0);
  cd('cd-pulse', p.pulseCd, TUNING.pulse_cooldown_s * TICK_RATE, p.pulseCd === 0 && p.carried >= TUNING.pulse_cost);
  updateCues(tl);
  renderCaptions();
  const cueShade = shadeCue && performance.now() < shadeCue.until && settings.captions ? game.shades.find((s) => s.id === shadeCue.id) : null;
  edgeArrow($('shade-arrow'), cueShade ? cueShade.pos : null, true);

  let near = null;
  let nd = Infinity;
  for (const l of game.lanterns) {
    const d = Math.hypot(l.pos[0] - p.pos[0], l.pos[2] - p.pos[2]);
    if (d <= TUNING.interact_radius && d < nd && !(l.lit && fuelOf(l) >= TUNING.fuel_max)) {
      near = l;
      nd = d;
    }
  }
  const pr = $('prompt');
  pr.classList.toggle('hidden', !near);
  if (near) pr.textContent = near.lit ? `E — Châm dầu (${Math.floor(fuelOf(near))}/${TUNING.fuel_max})` : `E — Nạp ánh sáng (${near.deposited}/${lightCost(near)})`;

  // arrow to nearest unlit lantern when off-screen
  let target = null;
  let best = Infinity;
  for (const l of game.lanterns) {
    if (l.lit && fuelOf(l) >= TUNING.low_fuel_threshold) continue; // point at unlit or weak lanterns
    const d = Math.hypot(l.pos[0] - p.pos[0], l.pos[2] - p.pos[2]);
    if (d < best) {
      best = d;
      target = l;
    }
  }
  edgeArrow($('arrow'), target ? [target.pos[0], target.pos[1] + 3, target.pos[2]] : null);
}

/** Show `el` at the screen edge pointing toward world `pos` when it is off-screen (hidden otherwise). */
function edgeArrow(el, pos) {
  if (!pos) return el.classList.add('hidden');
  v3.set(pos[0], pos[1], pos[2]).project(camera);
  const behind = v3.z > 1;
  const on = !behind && Math.abs(v3.x) < 0.95 && Math.abs(v3.y) < 0.95;
  el.classList.toggle('hidden', on);
  if (on) return;
  let x = behind ? -v3.x : v3.x;
  let y = behind ? -v3.y : v3.y;
  const m = Math.max(Math.abs(x), Math.abs(y)) / 0.88;
  x /= m;
  y /= m;
  el.style.left = `${((x + 1) / 2) * innerWidth - 14}px`;
  el.style.top = `${((1 - y) / 2) * innerHeight - 14}px`;
  el.style.transform = `rotate(${Math.atan2(x, y)}rad)`;
}

// ---------------------------------------------------------------- main loop (fixed 60 Hz)
let acc = 0;
let last = performance.now();
const DT = 1 / TICK_RATE;
const fps = { frames: 0, t0: performance.now(), avg: 0, samples: [] };
window.__fps = fps;
if (params.has('fps')) $('fps').classList.remove('hidden');
// ---------------------------------------------------------------- Ticket-04 benchmark scene
const bench = { t0: null, measureFrom: null, last: null, dts: [], heapPeak: 0, done: false, duration: Number(params.get('duration') || 30) };
const IDLE = { move: [0, 0], cam_yaw_deg: 0 };
function startBench() {
  loadNight(1, createBenchGame(baseSeed));
  phase = 'bench';
  show(null);
}
function rendererInfo() {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  return `three.js r${THREE.REVISION} WebGL${renderer.capabilities.isWebGL2 ? '2' : '1'}; ${gpu}; ${navigator.userAgent.match(/(Chrome|Firefox|Safari)\/[\d.]+/)?.[0] || navigator.userAgent}`;
}
function benchFrame(now, dt) {
  acc += dt;
  while (acc >= DT) {
    rememberPositions();
    step(game, IDLE);
    acc -= DT;
  }
  alpha = Math.min(1, acc / DT);
  if (bench.t0 === null) bench.t0 = now;
  const tb = (now - bench.t0) / 1000;
  // camera: circle radius 30 at Y = 15 around (0,0,0), start at 0° = (30,15,0), counter-clockwise, 15 s per lap
  const th = (2 * Math.PI * tb) / 15;
  camera.position.set(30 * Math.cos(th), 15, 30 * Math.sin(th));
  camera.lookAt(0, 0, 0);
  syncEntities(now / 1000, dt);
  renderer.render(scene, camera);
  if (window.__benchFirstFrameEpoch === undefined) window.__benchFirstFrameEpoch = Date.now();
  if (bench.done) return;
  if (performance.memory) bench.heapPeak = Math.max(bench.heapPeak, performance.memory.usedJSHeapSize);
  if (tb >= 3) {
    // 3 s warm-up is not measured; then exactly `duration` seconds of frame times
    if (bench.measureFrom === null) bench.measureFrom = now;
    else bench.dts.push(now - bench.last);
    bench.last = now;
    if (now - bench.measureFrom >= bench.duration * 1000) finishBench();
  }
}
function finishBench() {
  bench.done = true;
  const d = bench.dts;
  const N = d.length;
  const sum = d.reduce((a, b) => a + b, 0);
  const sorted = [...d].sort((a, b) => a - b);
  const k = Math.max(1, Math.ceil(0.01 * N));
  const worst = sorted.slice(-k);
  const p95 = sorted[Math.min(N - 1, Math.ceil(0.95 * N) - 1)];
  window.__benchResult = {
    frames: N,
    avg_fps: (1000 * N) / sum,
    p1_low_fps: 1000 / (worst.reduce((a, b) => a + b, 0) / k),
    frame_ms_p95: p95,
    js_heap_peak_mb: performance.memory ? bench.heapPeak / 1048576 : null,
    renderer: rendererInfo(),
    shades: game.shades.length,
    motes: game.motes.length,
    width: innerWidth,
    height: innerHeight,
  };
  $('fps').classList.remove('hidden');
  $('fps').textContent = `BENCH done: ${N} frames, avg ${window.__benchResult.avg_fps.toFixed(1)} FPS`;
}

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (phase === 'bench') {
    benchFrame(now, dt);
    requestAnimationFrame(frame);
    return;
  }
  if (shakeT > 0) shakeT = Math.max(0, shakeT - dt);
  if (game && (phase === 'playing' || pauseQueued)) {
    acc += dt;
    if (pauseQueued) acc = Math.max(acc, DT);
    while (acc >= DT && (phase === 'playing' || pauseQueued)) {
      rememberPositions();
      handleEvents(step(game, sampleInput()));
      acc -= DT;
    }
    alpha = phase === 'playing' ? Math.min(1, acc / DT) : 1;
  } else {
    acc = 0;
    alpha = 1;
  }
  if (game) backdrop.update(now / 1000, lerpPos('player', game.player.pos), night);
  if (pulseFx > 0) pulseFx = Math.max(0, pulseFx - dt / 0.35);
  if (game) {
    syncEntities(now / 1000, now / 1000 - lastT);
    lastT = now / 1000;
    if (phase === 'playing' || phase === 'paused') updateHud();
  }
  updateCamera();
  renderer.render(scene, camera);
  fps.frames++;
  if (now - fps.t0 >= 1000) {
    fps.samples.push((fps.frames * 1000) / (now - fps.t0));
    if (fps.samples.length > 60) fps.samples.shift();
    fps.avg = fps.samples.reduce((a, b) => a + b, 0) / fps.samples.length;
    $('fps').textContent = `${fps.samples.at(-1).toFixed(0)} FPS (avg ${fps.avg.toFixed(1)}) ${innerWidth}×${innerHeight}`;
    fps.frames = 0;
    fps.t0 = now;
  }
  requestAnimationFrame(frame);
}
applyColorblind();
if (BENCH) startBench();
else {
  loadNight(1);
  show('scr-menu');
}
requestAnimationFrame(frame);
