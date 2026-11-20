// Builds the static terrain for each standard night map (visual only; rules live in src/sim/maps.js).
import * as THREE from 'three';
import { PAL } from './palette.js';
import { NIGHTS } from '../sim/maps.js';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 1, ...extra });

function island(r, cx = 0, cz = 0) {
  const g = new THREE.Group();
  const side = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, 5, 64), mat(PAL.sand));
  side.position.set(cx, -2.55, cz);
  const top = new THREE.Mesh(new THREE.CircleGeometry(r - 0.6, 64), mat(PAL.grass));
  top.rotation.x = -Math.PI / 2;
  top.position.set(cx, 0.001, cz);
  g.add(side, top);
  return g;
}

function pad(p) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.12, 24), mat(PAL.gold, { emissive: PAL.gold, emissiveIntensity: 0.6 }));
  m.position.set(p[0], p[1] + 0.06, p[2]);
  return m;
}

export function buildWorld(night) {
  const map = NIGHTS[night];
  const g = new THREE.Group();
  const sea = new THREE.Mesh(new THREE.CircleGeometry(400, 48), mat(PAL.sea));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -8;
  g.add(sea);

  if (night === 1) g.add(island(40));
  if (night === 2) {
    g.add(island(28), island(28, 70, 0));
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(18, 0.3, 4), mat(PAL.wood));
    bridge.position.set(35, -0.15, 0);
    g.add(bridge);
    for (const x of [27, 31, 35, 39, 43]) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 4), mat('#5a3d26'));
      plank.position.set(x, 0.02, 0);
      g.add(plank);
    }
  }
  if (night === 3) {
    g.add(island(45));
    const stone = mat('#3f5a55');
    // tier 1: half-annulus r 12..24 at z > 0, Y = 3
    const t1top = new THREE.Mesh(new THREE.RingGeometry(12, 24, 48, 1, Math.PI, Math.PI), mat(PAL.grass));
    t1top.rotation.x = -Math.PI / 2;
    t1top.position.y = 3.001;
    g.add(t1top);
    for (const r of [12, 24]) {
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 3, 48, 1, true, -Math.PI / 2, Math.PI), stone);
      wall.material.side = THREE.DoubleSide;
      wall.position.y = 1.5;
      g.add(wall);
    }
    for (const s of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(12, 3, 0.1), stone);
      cap.position.set(18 * s, 1.5, 0.05);
      g.add(cap);
    }
    // tier 2 disc r 8 at Y = 6 + bell tower r 2, 8 m tall
    const t2 = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 6, 48), stone);
    t2.position.y = 3;
    const t2top = new THREE.Mesh(new THREE.CircleGeometry(7.9, 48), mat(PAL.grass));
    t2top.rotation.x = -Math.PI / 2;
    t2top.position.y = 6.002;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 8, 24), mat(PAL.wood));
    tower.position.y = 10;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.8, 2, 24), mat(PAL.scarf));
    roof.position.y = 15;
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(PAL.gold, { metalness: 0.7, roughness: 0.3 }));
    bell.position.y = 12.5;
    bell.rotation.x = Math.PI;
    g.add(t2, t2top, tower, roof, bell);
    // ramps at 30° and 150°: r 30 (Y 0) -> r 24 (Y 3), 3 m wide
    for (const deg of [30, 150]) {
      const a = (deg * Math.PI) / 180;
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(6, 3), 0.25, 3), mat(PAL.sand));
      ramp.rotation.order = 'YZX';
      ramp.rotation.y = -a;
      ramp.rotation.z = -Math.atan2(3, 6);
      ramp.position.set(27 * Math.cos(a), 1.4, 27 * Math.sin(a));
      g.add(ramp);
    }
  }
  for (const p of map.pads) g.add(pad(p.pos));
  return g;
}
