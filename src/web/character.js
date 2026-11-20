// Mây as a panda warrior (visual only, built from primitives; reference: game_charactor/*.png).
// Model faces +Z, feet at y = 0. Carries a small lantern on the sash (no hat, by owner decision).
import * as THREE from 'three';
import { PAL } from './palette.js';

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
const M = {
  fur: std('#f2efe6'),
  black: std('#1b1b1f'),
  teal: std(PAL.robe), // Áo Mây (standard palette)
  red: std(PAL.scarf), // khăn Mây (standard palette)
  cream: std('#e9dfbf'),
  leather: std('#5a3b22'),
  bronze: std('#a37a3c', { metalness: 0.6, roughness: 0.45 }),
  gold: std(PAL.gold, { metalness: 0.7, roughness: 0.35 }),
};

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

export function makePlayer() {
  const root = new THREE.Group();

  // legs (pivot at hip so they can swing)
  const legs = [-1, 1].map((s) => {
    const hip = new THREE.Group();
    hip.position.set(0.2 * s, 0.48, 0);
    hip.add(mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.42, 12), M.black, 0, -0.22, 0));
    hip.add(mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.12, 12), M.leather, 0, -0.33, 0)); // leg wrap
    const knee = mesh(new THREE.SphereGeometry(0.13, 10, 8), M.bronze, 0, -0.14, 0.1);
    knee.scale.set(1, 1, 0.6);
    hip.add(knee);
    hip.add(mesh(new THREE.BoxGeometry(0.22, 0.08, 0.3), M.black, 0, -0.44, 0.04)); // paw/foot
    root.add(hip);
    return hip;
  });

  // robe skirt: teal fading to a red frayed hem
  root.add(mesh(new THREE.CylinderGeometry(0.44, 0.52, 0.3, 16, 1, true), M.teal, 0, 0.66, 0));
  const hem = mesh(new THREE.CylinderGeometry(0.52, 0.6, 0.24, 9, 1, true), M.red, 0, 0.4, 0);
  hem.material = M.red.clone();
  hem.material.side = THREE.DoubleSide;
  hem.material.flatShading = true;
  root.add(hem);

  // torso
  root.add(mesh(new THREE.CylinderGeometry(0.43, 0.46, 0.6, 16), M.teal, 0, 1.05, 0));
  const belly = mesh(new THREE.SphereGeometry(0.3, 16, 12), M.cream, 0, 0.98, 0.3);
  belly.scale.set(0.95, 0.6, 0.55);
  root.add(belly);
  // sash + front cloth + knot
  const sash = mesh(new THREE.TorusGeometry(0.46, 0.06, 8, 24), M.red, 0, 0.8, 0);
  sash.rotation.x = Math.PI / 2;
  root.add(sash);
  root.add(mesh(new THREE.BoxGeometry(0.22, 0.42, 0.04), M.red, 0, 0.56, 0.52));
  root.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), M.red, 0.14, 0.8, 0.49));
  // crossed chest straps + medallion
  for (const s of [-1, 1]) {
    const strap = mesh(new THREE.BoxGeometry(0.08, 0.78, 0.04), M.leather, 0, 1.08, 0.43);
    strap.rotation.z = 0.62 * s;
    root.add(strap);
  }
  const medal = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 16), M.gold, 0, 1.12, 0.46);
  medal.rotation.x = Math.PI / 2;
  root.add(medal);
  // collar
  const collar = mesh(new THREE.TorusGeometry(0.3, 0.08, 8, 20), M.red, 0, 1.36, 0); // scarf
  root.add(mesh(new THREE.BoxGeometry(0.12, 0.35, 0.05), M.red, 0.18, 1.18, 0.4)); // scarf tail
  collar.rotation.x = Math.PI / 2;
  root.add(collar);

  // shoulders + arms (pivot at shoulder)
  const arms = [-1, 1].map((s) => {
    const pad = mesh(new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.bronze, 0.5 * s, 1.24, 0);
    pad.scale.set(1.15, 0.8, 1.1);
    pad.rotation.z = -0.35 * s;
    root.add(pad);
    const sh = new THREE.Group();
    sh.position.set(0.56 * s, 1.2, 0);
    sh.add(mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.4, 10), M.teal, 0, -0.2, 0));
    const band = mesh(new THREE.TorusGeometry(0.125, 0.035, 6, 14), M.red, 0, -0.3, 0);
    band.rotation.x = Math.PI / 2;
    sh.add(band);
    sh.add(mesh(new THREE.CylinderGeometry(0.15, 0.14, 0.22, 10), M.bronze, 0, -0.46, 0));
    sh.add(mesh(new THREE.SphereGeometry(0.13, 10, 8), M.black, 0, -0.62, 0.02));
    sh.rotation.z = 0.15 * s;
    root.add(sh);
    return sh;
  });

  // head
  const head = new THREE.Group();
  head.position.y = 1.62;
  head.add(mesh(new THREE.SphereGeometry(0.3, 20, 16), M.fur));
  const muzzle = mesh(new THREE.SphereGeometry(0.13, 12, 10), M.fur, 0, -0.07, 0.24);
  muzzle.scale.set(1.1, 0.8, 0.8);
  head.add(muzzle);
  head.add(mesh(new THREE.SphereGeometry(0.045, 8, 6), M.black, 0, -0.03, 0.34)); // nose
  for (const s of [-1, 1]) {
    head.add(mesh(new THREE.SphereGeometry(0.09, 10, 8), M.black, 0.21 * s, 0.22, -0.02)); // ear
    const patch = mesh(new THREE.SphereGeometry(0.075, 10, 8), M.black, 0.11 * s, 0.04, 0.25);
    patch.scale.set(0.9, 1.3, 0.5);
    patch.rotation.z = -0.5 * s;
    head.add(patch);
    head.add(mesh(new THREE.SphereGeometry(0.02, 6, 4), M.fur, 0.11 * s, 0.06, 0.29)); // eye shine
  }
  root.add(head);

  // small lantern hanging from the sash (hat removed by owner decision, see docs/notes/phase-1.md)
  root.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 4), M.black, 0.36, 0.73, 0.36));
  const lamp = mesh(
    new THREE.SphereGeometry(0.09, 12, 8),
    std('#ffb347', { emissive: '#ff9a2e', emissiveIntensity: 1.6 }),
    0.36, 0.6, 0.36,
  );
  lamp.scale.set(1, 1.25, 1);
  root.add(lamp);
  const glow = new THREE.PointLight('#ffb050', 4, 9, 1.5);
  glow.position.set(0.36, 0.6, 0.45);
  root.add(glow);

  // sheathed sword on the back (decoration, never drawn)
  const sword = new THREE.Group();
  sword.position.set(0, 1.05, -0.47);
  sword.rotation.z = -0.6;
  sword.add(mesh(new THREE.CylinderGeometry(0.035, 0.03, 1.0, 8), M.leather, 0, -0.1, 0));
  sword.add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.025, 14), M.bronze, 0, 0.41, 0));
  sword.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.32, 8), M.gold, 0, 0.58, 0));
  root.add(sword);

  root.userData = { glow, lamp, legs, arms, head, walk: 0 };
  return root;
}

/** Simple walk cycle driven by horizontal speed (m/s). */
export function animatePlayer(root, speed, dt) {
  const u = root.userData;
  const moving = speed > 0.5;
  u.walk += dt * (moving ? 10 : 0);
  const a = moving ? Math.sin(u.walk) * 0.6 : 0;
  u.legs[0].rotation.x += (a - u.legs[0].rotation.x) * 0.3;
  u.legs[1].rotation.x += (-a - u.legs[1].rotation.x) * 0.3;
  u.arms[0].rotation.x += (-a * 0.7 - u.arms[0].rotation.x) * 0.3;
  u.arms[1].rotation.x += (a * 0.7 - u.arms[1].rotation.x) * 0.3;
  u.head.position.y = 1.62 + (moving ? Math.abs(Math.sin(u.walk)) * 0.04 : 0);
}
