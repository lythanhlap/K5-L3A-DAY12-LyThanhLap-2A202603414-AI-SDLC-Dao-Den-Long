import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Flat spots checked against gameplay clearances (lanterns >= 9 m, mote spawns >= 4.5 m, start ~10 m to the
// side, away from the bridge, charms, pads and cottages) so the stage never hides an objective.
const SITES = { 1: [-9, 4], 2: [-7, 4], 3: [-12, -30] };

export function createDancingCow() {
  const stage = new THREE.Group();
  stage.name = 'cow-stage';
  const orbit = new THREE.Group();
  orbit.name = 'dancing-cow';
  const body = new THREE.Group();
  const head = new THREE.Group();
  const tail = new THREE.Group();
  stage.add(orbit);
  orbit.add(body);
  body.add(head, tail);
  head.position.set(0.68, 2.03, -0.04);
  tail.position.set(0.99, 1.08, 0.27);

  // Batch rigid pieces for each animated joint into one vertex-coloured mesh.
  const batches = new Map();
  const surface = new THREE.MeshLambertMaterial({ vertexColors: true });
  const transform = new THREE.Object3D();
  function piece(joint, shape, color, pos, scale = [1, 1, 1], tilt = 0) {
    transform.position.set(...pos);
    transform.scale.set(...scale);
    transform.rotation.set(0, 0, tilt);
    transform.updateMatrix();
    shape.applyMatrix4(transform.matrix);
    const colors = new Float32Array(shape.attributes.position.count * 3);
    const tint = new THREE.Color(color);
    for (let i = 0; i < colors.length; i += 3) tint.toArray(colors, i);
    shape.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (!batches.has(joint)) batches.set(joint, []);
    batches.get(joint).push(shape);
  }
  const oval = (joint, color, pos, scale, tilt) =>
    piece(joint, new THREE.SphereGeometry(1, 14, 10), color, pos, scale, tilt);
  const ivory = '#fff2d7', ink = '#302d37', rose = '#e99998', brass = '#dfae56';
  piece(stage, new THREE.CylinderGeometry(1.42, 1.28, 0.22, 36), '#834d40', [0, 0, 0]);
  piece(stage, new THREE.CylinderGeometry(1.39, 1.42, 0.045, 36), brass, [0, 0.125, 0]);
  piece(stage, new THREE.CylinderGeometry(0.075, 0.085, 3.6, 14), brass, [0, 1.94, 0]);
  oval(stage, '#ffe3a2', [0, 3.76, 0], [0.115, 0.115, 0.115]);

  oval(body, ivory, [0.72, 1.27, 0], [0.47, 0.68, 0.4], -0.14);
  oval(body, ink, [0.91, 1.22, -0.28], [0.23, 0.3, 0.13], -0.32);
  oval(body, ink, [0.66, 1.46, 0.3], [0.29, 0.21, 0.13], 0.24);
  for (const side of [-1, 1]) {
    const x = 0.72 + side * 0.21;
    oval(orbit, ivory, [x, 0.63, 0], [0.15, 0.46, 0.15], side * 0.09);
    oval(orbit, ink, [x + side * 0.03, 0.28, -0.035], [0.16, 0.135, 0.19]);
    // Forelegs reach across the chest and clasp opposite sides of the pole.
    const y = 1.68 + side * 0.17;
    oval(body, ivory, [0.28, y, side * 0.15], [0.32, 0.115, 0.13], -0.3);
    oval(body, ink, [0.035, y + 0.08, side * 0.095], [0.135, 0.11, 0.10]);
  }
  oval(head, ivory, [0, 0, 0], [0.43, 0.42, 0.37]);
  oval(head, ink, [-0.18, 0.06, -0.27], [0.185, 0.18, 0.085]);
  oval(head, rose, [0, -0.12, -0.32], [0.33, 0.215, 0.18]);
  for (const side of [-1, 1]) {
    oval(head, ink, [side * 0.125, -0.11, -0.485], [0.038, 0.032, 0.018]);
    oval(head, ivory, [side * 0.175, 0.09, -0.325], [0.078, 0.09, 0.042]);
    oval(head, ink, [side * 0.175, 0.085, -0.363], [0.042, 0.052, 0.018]);
    oval(head, ink, [side * 0.43, 0.19, 0], [0.24, 0.105, 0.1], side * 0.26);
    oval(head, rose, [side * 0.46, 0.19, -0.075], [0.14, 0.065, 0.034], side * 0.26);
    piece(head, new THREE.ConeGeometry(0.095, 0.26, 10), '#eacb91',
      [side * 0.245, 0.42, 0.005], [1, 1, 1], -side * 0.32);
  }
  oval(body, '#bb3844', [0.7, 1.82, 0], [0.335, 0.11, 0.31]);
  oval(body, brass, [0.7, 1.7, -0.30], [0.09, 0.1, 0.065]);
  oval(tail, ivory, [0.14, -0.2, 0.02], [0.055, 0.29, 0.055], 0.46);
  oval(tail, ink, [0.26, -0.45, 0.02], [0.087, 0.13, 0.08], 0.46);

  for (const [joint, parts] of batches) joint.add(new THREE.Mesh(mergeGeometries(parts), surface));
  return {
    stage,
    place(night, map) {
      const [x, z] = SITES[night];
      stage.position.set(x, map.ground(x, z) ?? 0, z);
    },
    pose(seconds) {
      const beat = seconds * 3.8;
      orbit.rotation.y = seconds * 0.9 + 0.16 * Math.sin(beat);
      body.position.y = 0.055 * Math.sin(beat);
      body.rotation.z = 0.025 * Math.sin(beat);
      head.rotation.z = 0.13 * Math.sin(beat + 0.3);
      tail.rotation.z = 0.28 * Math.sin(beat * 1.5);
    },
  };
}
