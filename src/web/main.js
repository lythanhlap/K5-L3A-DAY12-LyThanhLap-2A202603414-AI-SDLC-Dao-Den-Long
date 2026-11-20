// Browser renderer: drives the same deterministic sim (src/sim/game.js) at a fixed 60 Hz.
import * as THREE from 'three';
import { createGame, step, timeLeft } from '../sim/game.js';
import { TICK_RATE, TUNING, WORLD } from '../sim/tuning.js';
import { makePlayer, animatePlayer } from './character.js';

const $ = (id) => document.getElementById(id);

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const NIGHT = new THREE.Color('#120a1f');
const DAWNISH = new THREE.Color('#3b2a4f');
scene.background = NIGHT.clone();
scene.fog = new THREE.FogExp2(NIGHT.clone(), 0.035);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 300);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const hemi = new THREE.HemisphereLight('#7a6aaa', '#1a1028', 0.9);
scene.add(hemi);
const moon = new THREE.DirectionalLight('#9aa8ff', 0.35);
moon.position.set(-20, 30, -10);
scene.add(moon);

// island + sea of clouds
const island = new THREE.Mesh(
  new THREE.CylinderGeometry(WORLD.islandRadius, WORLD.islandRadius - 3, 3, 64),
  new THREE.MeshStandardMaterial({ color: '#2f3d3a', roughness: 1 }),
);
island.position.y = -1.5;
scene.add(island);
const clouds = new THREE.Mesh(
  new THREE.CircleGeometry(200, 48),
  new THREE.MeshStandardMaterial({ color: '#4b3b6b', roughness: 1 }),
);
clouds.rotation.x = -Math.PI / 2;
clouds.position.y = -6;
scene.add(clouds);
// a few rocks/bushes for depth (decorative, fixed layout)
const deco = new THREE.MeshStandardMaterial({ color: '#25302e', roughness: 1 });
for (let i = 0; i < 24; i++) {
  const a = i * 2.39996;
  const r = 6 + ((i * 7) % 22);
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + (i % 3) * 0.3), deco);
  m.position.set(r * Math.sin(a), 0.2, r * Math.cos(a));
  scene.add(m);
}

// ---------- entity meshes ----------
const playerMesh = makePlayer();
scene.add(playerMesh);

const lanternMeshes = new Map();
function makeLantern() {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 3, 8), new THREE.MeshStandardMaterial({ color: '#4a3020' }));
  post.position.y = 1.5;
  const mat = new THREE.MeshStandardMaterial({ color: '#5a3a5e', emissive: '#ff8a2a', emissiveIntensity: 0 });
  const paper = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), mat);
  paper.scale.set(1, 1.25, 1);
  paper.position.y = 3.4;
  const light = new THREE.PointLight('#ffa040', 0, 16, 1.4);
  light.position.y = 3.4;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(TUNING.safe_radius - 0.12, TUNING.safe_radius, 64),
    new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  g.add(post, paper, light, ring);
  g.userData = { mat, light, ring };
  return g;
}

const moteGeo = new THREE.SphereGeometry(0.12, 8, 6);
const moteMat = new THREE.MeshBasicMaterial({ color: '#fff3a0' });
const haloGeo = new THREE.SphereGeometry(0.35, 8, 6);
const haloMat = new THREE.MeshBasicMaterial({ color: '#ffd24a', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false });
const moteMeshes = new Map();

const shadeGeo = new THREE.SphereGeometry(0.75, 20, 14);
const eyeGeo = new THREE.SphereGeometry(0.1, 8, 6);
const eyeMat = new THREE.MeshBasicMaterial({ color: '#e8d8ff' });
const shadeMeshes = new Map();
function makeShade() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#1a0d2a', emissive: '#5b1f8a', emissiveIntensity: 0.6, transparent: true, opacity: 0.92 });
  const body = new THREE.Mesh(shadeGeo, mat);
  const e1 = new THREE.Mesh(eyeGeo, eyeMat);
  const e2 = new THREE.Mesh(eyeGeo, eyeMat);
  e1.position.set(0.25, 0.15, 0.65);
  e2.position.set(-0.25, 0.15, 0.65);
  g.add(body, e1, e2);
  g.userData = { mat, body };
  return g;
}

const pulseRing = new THREE.Mesh(
  new THREE.RingGeometry(0.85, 1, 64),
  new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
);
pulseRing.rotation.x = -Math.PI / 2;
pulseRing.position.y = 0.1;
scene.add(pulseRing);
let pulseFx = 0;

// ---------- input ----------
const keys = new Set();
const buttons = { jump: false, interact: false, pulse: false };
let camYaw = 0; // degrees, contract convention
let mouseDown = false;
let mousePulse = false;
let lastMouseX = 0;
let dragged = 0;

addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Space') e.preventDefault();
  if (phase !== 'playing' && (e.code === 'Enter' || e.code === 'KeyR')) startGame();
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
  camYaw -= dx * 0.3;
});
$('overlay').addEventListener('click', () => phase !== 'playing' && startGame());

function sampleInput() {
  if (keys.has('ArrowLeft')) camYaw += 2;
  if (keys.has('ArrowRight')) camYaw -= 2;
  // Camera looks along +forward; screen-right corresponds to input x = -1 (see contract rotation).
  let x = 0;
  let z = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) z += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) z -= 1;
  if (keys.has('KeyD')) x -= 1;
  if (keys.has('KeyA')) x += 1;
  const pulse = keys.has('KeyF') || mousePulse;
  mousePulse = false;
  return {
    move: [x, z],
    cam_yaw_deg: camYaw,
    jump: keys.has('Space'),
    interact: keys.has('KeyE'),
    pulse,
  };
}

// ---------- game lifecycle ----------
let game = null;
let phase = 'menu'; // menu | playing | over
const seedParam = new URLSearchParams(location.search).get('seed');

function clearMap(map) {
  for (const m of map.values()) scene.remove(m);
  map.clear();
}

function startGame() {
  const seed = seedParam != null ? Number(seedParam) : (Date.now() & 0x7fffffff);
  game = createGame({ seed });
  window.__game = game;
  clearMap(moteMeshes);
  clearMap(shadeMeshes);
  clearMap(lanternMeshes);
  for (const l of game.lanterns) {
    const m = makeLantern();
    m.position.set(l.pos[0], l.pos[1], l.pos[2]);
    scene.add(m);
    lanternMeshes.set(l.id, m);
  }
  camYaw = 0;
  phase = 'playing';
  $('overlay').classList.add('hidden');
}

function handleEvents(events) {
  for (const e of events) {
    if (e.name === 'pulse') pulseFx = 1;
    if (e.name === 'game_over') {
      phase = 'over';
      const won = e.data.result === 'won';
      const reason = { all_lit: 'Mọi Đèn Lồng Lớn đã sáng!', dawn: 'Bình minh đã tới khi đảo còn tối.', no_flames: 'Mây đã mất hết lửa.' }[e.data.reason];
      $('ov-title').textContent = won ? 'Đảo đã sáng lại!' : 'Đêm chưa qua…';
      $('ov-body').innerHTML = `${reason}<br/>Điểm: <b>${game.score}</b>`;
      $('overlay').querySelector('p').innerHTML = '<b>Nhấn R / Enter hoặc click để chơi lại</b>';
      setTimeout(() => $('overlay').classList.remove('hidden'), 600);
    }
  }
}

// ---------- sync visuals ----------
let lastT = 0;
function syncEntities(t) {
  const p = game.player;
  const dt = Math.min(0.1, Math.max(1e-3, t - lastT));
  lastT = t;
  const speed = Math.hypot(p.pos[0] - playerMesh.position.x, p.pos[2] - playerMesh.position.z) / dt;
  animatePlayer(playerMesh, phase === 'playing' ? speed : 0, dt);
  playerMesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
  playerMesh.rotation.y = p.facing;
  playerMesh.visible = p.invuln === 0 || Math.floor(t * 12) % 2 === 0;
  playerMesh.userData.glow.intensity = 2 + p.carried * 2;

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
    const ph = Number(m.id.slice(1));
    mesh.position.set(m.pos[0], 0.7 + 0.2 * Math.sin(t * 2 + ph), m.pos[2]);
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
    mesh.position.set(s.pos[0], s.pos[1] + 0.1 * Math.sin(t * 3), s.pos[2]);
    mesh.lookAt(p.pos[0], s.pos[1], p.pos[2]);
    const stunned = s.state === 'stunned';
    mesh.userData.body.scale.set(1, stunned ? 0.55 : 1, 1);
    mesh.userData.mat.emissive.set(stunned ? '#b9a0ff' : '#5b1f8a');
    mesh.userData.mat.opacity = stunned ? 0.5 : 0.92;
  }
  for (const [id, mesh] of shadeMeshes) if (!seen.has(id)) (scene.remove(mesh), shadeMeshes.delete(id));

  let lit = 0;
  for (const l of game.lanterns) {
    const u = lanternMeshes.get(l.id).userData;
    const f = l.lit ? 1 : l.deposited / TUNING.lantern_cost;
    u.mat.emissiveIntensity = l.lit ? 2.2 : f * 0.6;
    u.mat.color.set(l.lit ? '#ff9a3a' : '#5a3a5e');
    u.light.intensity = l.lit ? 60 : f * 6;
    u.ring.material.opacity = l.lit ? 0.35 : 0;
    if (l.lit) lit++;
  }
  // island brightens as lanterns are lit
  const k = lit / game.lanterns.length;
  scene.background.copy(NIGHT).lerp(DAWNISH, k);
  scene.fog.color.copy(scene.background);
  scene.fog.density = 0.035 - 0.02 * k;
  hemi.intensity = 0.9 + 1.2 * k;

  if (pulseFx > 0) {
    const s = (1 - pulseFx) * TUNING.pulse_radius + 0.5;
    pulseRing.scale.set(s, s, s);
    pulseRing.position.x = p.pos[0];
    pulseRing.position.z = p.pos[2];
    pulseRing.material.opacity = pulseFx;
  } else pulseRing.material.opacity = 0;
}

function updateCamera() {
  const p = game ? game.player.pos : [0, 0, 0];
  const th = (camYaw * Math.PI) / 180;
  const f = [Math.sin(th), Math.cos(th)];
  camera.position.set(p[0] - f[0] * 9, p[1] + 5.5, p[2] - f[1] * 9);
  camera.lookAt(p[0] + f[0] * 2, p[1] + 1.2, p[2] + f[1] * 2);
}

function updateHud() {
  const p = game.player;
  $('flames').textContent = '●'.repeat(Math.max(0, p.flames)) + '○'.repeat(Math.max(0, TUNING.flames - p.flames));
  $('carried').textContent = `${p.carried} / ${TUNING.carry_capacity}`;
  $('lanterns').innerHTML = game.lanterns
    .map((l) => `<span class="${l.lit ? 'lit' : ''}">${l.id} ${l.lit ? '✓' : `${l.deposited}/${TUNING.lantern_cost}`}</span>`)
    .join('');
  const tl = Math.max(0, timeLeft(game));
  $('time').textContent = `${Math.floor(tl / 60)}:${String(Math.floor(tl % 60)).padStart(2, '0')}`;
  $('score').textContent = game.score;
  $('pulse').textContent = p.pulseCd > 0 ? 'đang hồi…' : p.carried >= TUNING.pulse_cost ? 'sẵn sàng (F)' : 'cần đom đóm';
  const near = game.lanterns.find((l) => !l.lit && Math.hypot(l.pos[0] - p.pos[0], l.pos[2] - p.pos[2]) <= TUNING.interact_radius);
  $('hint').textContent = near ? (p.carried > 0 ? `E: nạp ánh sáng vào ${near.id}` : `${near.id} cần đom đóm`) : '';
}

// ---------- main loop (fixed 60 Hz) ----------
let acc = 0;
let last = performance.now();
const DT = 1 / TICK_RATE;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (phase === 'playing') {
    acc += dt;
    while (acc >= DT && phase === 'playing') {
      handleEvents(step(game, sampleInput()));
      acc -= DT;
    }
  } else acc = 0;
  if (pulseFx > 0) pulseFx = Math.max(0, pulseFx - dt / 0.35);
  if (game) {
    syncEntities(now / 1000);
    updateHud();
  }
  updateCamera();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
