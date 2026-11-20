// Island decoration + ambient effects (visual only: no collision, never read by the sim).
// Trees, rocks, rim boulders, grass tufts and flowers are placed with a fixed per-night RNG and kept
// clear of gameplay spots (lanterns, mote/shade spawn points, start, pads, bridge, ramps, tier edges).
// Everything heavy is an InstancedMesh, so the whole island costs a handful of draw calls.
import * as THREE from 'three';
import { PAL } from './palette.js';
import { NIGHTS } from '../sim/maps.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ISLANDS = { 1: [[0, 0, 40]], 2: [[0, 0, 28], [70, 0, 28]], 3: [[0, 0, 45]] }; // cx, cz, radius

/** Is (x, z) a good spot for decoration with clearance `r`? Returns ground height or null. */
function spotOk(map, night, x, z, r) {
  const gh = map.ground(x, z);
  if (gh == null || map.solid(x, z, gh)) return null;
  // the whole footprint must be on the same flat level (no hanging over tier edges / island rim)
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    if (map.ground(x + Math.cos(a) * r, z + Math.sin(a) * r) !== gh) return null;
  }
  const near = (p, d) => Math.hypot(x - p[0], z - p[2]) < d;
  if (map.lanterns.some((p) => near(p, 4.5 + r))) return null; // keep lantern plazas open
  if (map.moteSpawns.some((p) => near(p, 2.2 + r))) return null; // motes must stay visible
  if (near(map.start, 4 + r)) return null;
  if (map.pads.some((p) => near(p.pos, 3 + r))) return null;
  if (map.charms.some((p) => near(p, 2.5 + r))) return null;
  if (night === 2 && x > 22 && x < 48 && Math.abs(z) < 5) return null; // bridge approaches
  if (night === 3) {
    const rr = Math.hypot(x, z);
    if (rr < 11) return null; // tower plaza / tier-2 surroundings
    for (const deg of [30, 150]) {
      const a = (deg * Math.PI) / 180;
      const along = x * Math.cos(a) + z * Math.sin(a);
      const side = Math.abs(-x * Math.sin(a) + z * Math.cos(a));
      if (side < 3.5 && along > 21 && along < 33) return null; // ramps
    }
  }
  return gh;
}

function scatter(map, night, rnd, count, r, { ring = [0, 1], tries = 40 } = {}) {
  const out = [];
  for (const [cx, cz, R] of ISLANDS[night]) {
    let placed = 0;
    for (let i = 0; i < count * tries && placed < count; i++) {
      const rad = R * Math.sqrt(ring[0] ** 2 + rnd() * (ring[1] ** 2 - ring[0] ** 2));
      const a = rnd() * Math.PI * 2;
      const x = cx + rad * Math.cos(a);
      const z = cz + rad * Math.sin(a);
      const gh = spotOk(map, night, x, z, r);
      if (gh == null) continue;
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < r * 2)) continue;
      out.push({ x, y: gh, z, s: 0.75 + rnd() * 0.6, rot: rnd() * Math.PI * 2 });
      placed++;
    }
  }
  return out;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
function instanced(geo, mat, items, place) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  mesh.count = items.length;
  items.forEach((it, i) => {
    const { pos, rot = [0, 0, 0], scale = [1, 1, 1] } = place(it, i);
    _p.set(...pos);
    _q.setFromEuler(_e.set(...rot));
    _s.set(...scale);
    mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}
// Lambert (not PBR): decor is matte anyway and this is much cheaper per pixel with several point lights
const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

function pines(items, rnd) {
  const g = new THREE.Group();
  const trunk = instanced(new THREE.CylinderGeometry(0.16, 0.24, 1.6, 6), mat(PAL.wood), items, (t) => ({ pos: [t.x, t.y + 0.8 * t.s, t.z], scale: [t.s, t.s, t.s] }));
  const shades = ['#24503f', '#2F5D50', '#356b55'];
  for (let layer = 0; layer < 3; layer++) {
    const cone = new THREE.ConeGeometry(1.5 - layer * 0.38, 1.7, 7);
    g.add(instanced(cone, mat(shades[layer]), items, (t) => ({ pos: [t.x, t.y + (1.7 + layer * 0.9) * t.s, t.z], rot: [0, t.rot + layer, 0], scale: [t.s, t.s * (1 + 0.15 * Math.sin(t.rot)), t.s] })));
  }
  g.add(trunk);
  return g;
}

function arecaPalms(items) {
  // "cau" palms for Đảo Cau: tall slim trunk + fan of drooping fronds + a cluster of nuts
  const g = new THREE.Group();
  g.add(instanced(new THREE.CylinderGeometry(0.1, 0.16, 5, 6), mat('#7d6a4f'), items, (t) => ({ pos: [t.x, t.y + 2.5 * t.s, t.z], rot: [0.06 * Math.sin(t.rot), 0, 0.06 * Math.cos(t.rot)], scale: [t.s, t.s, t.s] })));
  const frond = new THREE.BoxGeometry(0.28, 0.04, 2.2);
  frond.translate(0, 0, 1.1);
  const fronds = [];
  for (const t of items) for (let k = 0; k < 7; k++) fronds.push({ t, k });
  g.add(instanced(frond, mat('#3b7a52'), fronds, ({ t, k }) => ({ pos: [t.x, t.y + 5 * t.s, t.z], rot: [0.55, t.rot + (k / 7) * Math.PI * 2, 0], scale: [t.s, t.s, t.s] })));
  g.add(instanced(new THREE.IcosahedronGeometry(0.22, 0), mat('#c96a2b'), items, (t) => ({ pos: [t.x + 0.18 * t.s, t.y + 4.6 * t.s, t.z], scale: [t.s, t.s, t.s] })));
  return g;
}

function bushes(items) {
  return instanced(new THREE.IcosahedronGeometry(0.8, 0), mat('#2a5848'), items, (t) => ({ pos: [t.x, t.y + 0.45 * t.s, t.z], rot: [t.rot, t.rot * 2, 0], scale: [t.s * 1.2, t.s * 0.75, t.s] }));
}

function rocks(items, color = '#55607a') {
  return instanced(new THREE.DodecahedronGeometry(0.7, 0), mat(color), items, (t) => ({ pos: [t.x, t.y + 0.25 * t.s, t.z], rot: [t.rot, t.rot * 1.7, t.rot * 0.5], scale: [t.s * 1.3, t.s * 0.8, t.s] }));
}

function stonePillars(items) {
  // weathered stone lantern-posts (thạch đăng) for Đảo Chuông: base, shaft, cap
  const g = new THREE.Group();
  const stone = mat('#6b7287');
  g.add(instanced(new THREE.BoxGeometry(0.8, 0.3, 0.8), stone, items, (t) => ({ pos: [t.x, t.y + 0.15, t.z], rot: [0, t.rot, 0] })));
  g.add(instanced(new THREE.CylinderGeometry(0.18, 0.22, 1.3, 6), stone, items, (t) => ({ pos: [t.x, t.y + 0.95, t.z], rot: [0, t.rot, 0] })));
  g.add(instanced(new THREE.ConeGeometry(0.6, 0.45, 4), stone, items, (t) => ({ pos: [t.x, t.y + 1.85, t.z], rot: [0, t.rot + Math.PI / 4, 0] })));
  return g;
}

function rimBoulders(night, rnd) {
  // irregular rocks hugging the cliff rim (just outside the walkable disc, purely scenic)
  const items = [];
  for (const [cx, cz, R] of ISLANDS[night]) {
    const n = Math.round(R * 1.4);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.1;
      if (night === 2 && Math.abs(Math.sin(a)) < 0.12) continue; // leave the bridge ends free
      const r = R + 0.2 + rnd() * 0.6;
      items.push({ x: cx + r * Math.cos(a), y: -0.6 - rnd() * 0.8, z: cz + r * Math.sin(a), s: 0.9 + rnd() * 1.4, rot: rnd() * 6 });
    }
  }
  return rocks(items, '#3f4a63');
}

function grassAndFlowers(map, night, rnd) {
  const g = new THREE.Group();
  const tufts = [];
  const flowers = [];
  for (const [cx, cz, R] of ISLANDS[night]) {
    const n = Math.round(R * R * 0.45);
    for (let i = 0; i < n; i++) {
      const rad = R * 0.97 * Math.sqrt(rnd());
      const a = rnd() * Math.PI * 2;
      const x = cx + rad * Math.cos(a);
      const z = cz + rad * Math.sin(a);
      const gh = map.ground(x, z);
      if (gh == null || map.solid(x, z, gh)) continue;
      const it = { x, y: gh, z, s: 0.6 + rnd() * 0.8, rot: rnd() * 6 };
      if (rnd() < 0.12) flowers.push({ ...it, c: rnd() });
      else tufts.push(it);
    }
  }
  const blade = new THREE.ConeGeometry(0.07, 0.5, 3);
  blade.translate(0, 0.25, 0);
  const grassMat = mat('#3d7a5c');
  for (const tilt of [-0.35, 0, 0.35]) {
    g.add(instanced(blade, grassMat, tufts, (t) => ({ pos: [t.x + tilt * 0.12, t.y, t.z], rot: [tilt, t.rot, tilt * 0.5], scale: [t.s, t.s, t.s] })));
  }
  const petal = new THREE.IcosahedronGeometry(0.09, 0);
  for (const [color, lo, hi] of [['#f6c6d8', 0, 0.45], ['#F5F1E6', 0.45, 0.75], ['#c9b6ff', 0.75, 1.01]]) {
    const set = flowers.filter((f) => f.c >= lo && f.c < hi);
    g.add(instanced(petal, mat(color, { emissive: color, emissiveIntensity: 0.35 }), set, (t) => ({ pos: [t.x, t.y + 0.22 * t.s, t.z], scale: [t.s, t.s * 0.7, t.s] })));
  }
  return g;
}

export function buildDecor(night) {
  const map = NIGHTS[night];
  const rnd = rng(1000 + night * 77);
  const g = new THREE.Group();
  const treeSpots = scatter(map, night, rnd, night === 3 ? 22 : 14, 1.6, { ring: [0.45, 0.93] });
  g.add(night === 2 ? arecaPalms(treeSpots) : pines(treeSpots, rnd));
  g.add(bushes(scatter(map, night, rnd, 12, 1.0, { ring: [0.3, 0.95] })));
  g.add(rocks(scatter(map, night, rnd, 14, 0.9, { ring: [0.2, 0.95] })));
  if (night === 3) g.add(stonePillars(scatter(map, night, rnd, 8, 0.8, { ring: [0.3, 0.75] })));
  g.add(rimBoulders(night, rnd));
  g.add(grassAndFlowers(map, night, rnd));
  return g;
}

// ---------------------------------------------------------------- ambient effects
const softTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

/** Low drifting mist wisps over the island + pink petals floating around the player. */
export function createAmbient(scene) {
  const MIST = 24; // big soft sprites are fill-rate heavy: measured 140 -> 114 FPS with 46 x size 9, so keep it small
  const mistGeo = new THREE.BufferGeometry();
  mistGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MIST * 3), 3));
  const mist = new THREE.Points(mistGeo, new THREE.PointsMaterial({ map: softTex, color: '#8a7fc0', size: 5, transparent: true, opacity: 0.2, depthWrite: false, fog: false }));
  const PETALS = 90;
  const petalGeo = new THREE.BufferGeometry();
  petalGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PETALS * 3), 3));
  const petals = new THREE.Points(petalGeo, new THREE.PointsMaterial({ map: softTex, color: '#f3a6c8', size: 0.22, transparent: true, opacity: 0.85, depthWrite: false }));
  scene.add(mist, petals);
  const r = rng(4242);
  const seedsM = Array.from({ length: MIST }, () => [r(), r(), r()]);
  const seedsP = Array.from({ length: PETALS }, () => [r(), r(), r(), r()]);
  return {
    setVisible(v) {
      mist.visible = v;
      petals.visible = v;
    },
    update(t, center, night, reduceMotion) {
      const isl = ISLANDS[night] || ISLANDS[1];
      const a1 = mistGeo.attributes.position.array;
      seedsM.forEach(([u, v, w], i) => {
        const [cx, cz, R] = isl[i % isl.length];
        const ang = u * Math.PI * 2 + (reduceMotion ? 0 : t * 0.02 * (0.5 + w));
        const rad = R * (0.25 + 0.75 * Math.sqrt(v));
        a1[i * 3] = cx + rad * Math.cos(ang);
        a1[i * 3 + 1] = 0.6 + w * 1.2;
        a1[i * 3 + 2] = cz + rad * Math.sin(ang);
      });
      mistGeo.attributes.position.needsUpdate = true;
      const a2 = petalGeo.attributes.position.array;
      seedsP.forEach(([u, v, w, k], i) => {
        // petals live in a 30 m box around the player and fall slowly while swirling
        const fall = reduceMotion ? 0 : (t * (0.25 + 0.3 * k) + w * 10) % 10;
        const sway = reduceMotion ? 0 : Math.sin(t * (0.8 + k) + i) * 0.8;
        a2[i * 3] = center[0] + (u - 0.5) * 30 + sway;
        a2[i * 3 + 1] = center[1] + 9 - fall;
        a2[i * 3 + 2] = center[2] + (v - 0.5) * 30 + Math.cos(t * 0.7 + i) * 0.6;
      });
      petalGeo.attributes.position.needsUpdate = true;
    },
  };
}
