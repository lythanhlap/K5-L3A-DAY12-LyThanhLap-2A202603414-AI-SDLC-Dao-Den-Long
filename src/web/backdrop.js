// Background scenery (visual only, never touches the sim): gradient sky dome, stars, moon with halo,
// a rolling sea of clouds around the islands, and far-off floating islands with tiny lanterns.
// Colours follow the standard palette (sky #0E1430, fog #1B2350, sea of clouds #12384A, lantern #FFB347).
import * as THREE from 'three';
import { PAL } from './palette.js';

// small deterministic RNG so the backdrop looks the same every run (per night)
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CENTERS = { 1: [0, 0], 2: [35, 0], 3: [0, 0] }; // map centres (night 2 spans two islands)

function skyDome() {
  const geo = new THREE.SphereGeometry(300, 32, 16);
  const top = new THREE.Color('#070b1f');
  const mid = new THREE.Color(PAL.sky);
  const horizon = new THREE.Color(PAL.fog);
  const below = new THREE.Color(PAL.sea);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) / 300; // -1..1
    if (h > 0.35) c.copy(mid).lerp(top, (h - 0.35) / 0.65);
    else if (h > 0) c.copy(horizon).lerp(mid, h / 0.35);
    else c.copy(horizon).lerp(below, Math.min(1, -h * 4));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  mesh.renderOrder = -10;
  return mesh;
}

function stars() {
  const r = rng(7);
  const N = 1400;
  const arr = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = 0.08 + r() * 0.92; // upper hemisphere only
    const th = r() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    arr.set([Math.cos(th) * s * 280, u * 280, Math.sin(th) * s * 280], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mat = new THREE.PointsMaterial({ color: PAL.uiText, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.85, fog: false, depthWrite: false });
  return new THREE.Points(geo, mat);
}

function moon() {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.SphereGeometry(9, 24, 16), new THREE.MeshBasicMaterial({ color: '#FFF3D6', fog: false }));
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(26, 24, 16),
    new THREE.MeshBasicMaterial({ color: PAL.moteHalo, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, fog: false, depthWrite: false }),
  );
  g.add(disc, halo);
  g.position.set(-150, 42, -200); // low over the horizon so the third-person camera can see it
  return g;
}

function cloudSea(night) {
  const r = rng(100 + night);
  const N = 260;
  const geo = new THREE.SphereGeometry(1, 10, 8);
  const mat = new THREE.MeshLambertMaterial({ color: '#2a3a6e', emissive: PAL.sea, emissiveIntensity: 0.6, fog: false });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const ang = r() * Math.PI * 2;
    const rad = 58 + Math.pow(r(), 0.7) * 170;
    const size = 6 + r() * 14;
    p.set(Math.cos(ang) * rad, -7.5 + r() * 3.5, Math.sin(ang) * rad); // above the flat sea plane (y = -8)
    s.set(size * (1 + r()), size * 0.35, size);
    q.setFromEuler(new THREE.Euler(0, r() * Math.PI, 0));
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  }
  return mesh;
}

function farIslands(night) {
  const r = rng(300 + night);
  const g = new THREE.Group();
  const rock = new THREE.MeshLambertMaterial({ color: '#141d38', emissive: '#0b1230', emissiveIntensity: 0.5, fog: false });
  const top = new THREE.MeshLambertMaterial({ color: '#1d3a3a', emissive: '#0e2026', emissiveIntensity: 0.5, fog: false });
  const lamp = new THREE.MeshBasicMaterial({ color: PAL.lanternLit, fog: false });
  const glow = new THREE.MeshBasicMaterial({ color: PAL.lanternLit, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, fog: false, depthWrite: false });
  const count = 10;
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + r() * 0.4;
    const rad = 130 + r() * 90;
    const w = 8 + r() * 16;
    const isl = new THREE.Group();
    const base = new THREE.Mesh(new THREE.ConeGeometry(w, w * (1.2 + r()), 7), rock);
    base.rotation.x = Math.PI; // point down: floating rock
    base.position.y = -w * 0.6;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(w, w * 0.95, 1.2, 7), top);
    isl.add(base, cap);
    // a few tiny lanterns + a pagoda-ish silhouette on some islands
    const lamps = 1 + Math.floor(r() * 3);
    for (let k = 0; k < lamps; k++) {
      const a = r() * Math.PI * 2;
      const d = r() * w * 0.6;
      const L = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), lamp);
      L.position.set(Math.cos(a) * d, 2.8, Math.sin(a) * d);
      const G = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 6), glow);
      G.position.copy(L.position);
      isl.add(L, G);
    }
    if (r() < 0.5) {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 6, 6), rock);
      tower.position.y = 3.6;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2, 6), rock);
      roof.position.y = 7.4;
      isl.add(tower, roof);
    }
    isl.position.set(Math.cos(ang) * rad, -4 + r() * 22, Math.sin(ang) * rad);
    isl.userData.bob = r() * Math.PI * 2;
    g.add(isl);
  }
  return g;
}

export function createBackdrop(scene) {
  const follow = new THREE.Group(); // sky things follow the player so they look infinitely far
  const dome = skyDome();
  const starField = stars();
  const moonG = moon();
  follow.add(dome, starField, moonG);
  scene.add(follow);
  let world = null;
  let builtFor = 0;
  return {
    update(t, playerPos, night) {
      follow.position.set(playerPos[0], 0, playerPos[2]);
      starField.material.opacity = 0.7 + 0.15 * Math.sin(t * 1.3);
      if (builtFor !== night) {
        if (world) scene.remove(world);
        world = new THREE.Group();
        const [cx, cz] = CENTERS[night] || [0, 0];
        world.position.set(cx, 0, cz);
        world.add(cloudSea(night), farIslands(night));
        scene.add(world);
        builtFor = night;
      }
      // slow drift: clouds turn around the islands, far islands bob gently
      world.children[0].rotation.y = t * 0.004;
      for (const isl of world.children[1].children) isl.position.y += Math.sin(t * 0.4 + isl.userData.bob) * 0.004;
    },
  };
}
