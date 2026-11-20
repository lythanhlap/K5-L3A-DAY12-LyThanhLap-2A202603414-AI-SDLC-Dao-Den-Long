import * as THREE from 'three';

// Rain tiles in world space so walking or turning the camera does not carry drops along.
export function createWeather(scene, moon, onThunder) {
  const baseLight = moon.intensity;
  const count = 360;
  const span = 36;
  const height = 15;
  const drops = Array.from({ length: count }, () => ({
    x: Math.random() * span, z: Math.random() * span, y: Math.random() * height,
    speed: 10 + Math.random() * 5,
  }));
  const positions = new THREE.BufferAttribute(new Float32Array(count * 6), 3);
  positions.setUsage(THREE.DynamicDrawUsage);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', positions);
  const streaks = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
    color: '#96b7d8', transparent: true, opacity: 0.35, depthWrite: false,
  }));
  streaks.frustumCulled = false;

  // One forked bolt in the distance, lit briefly by the same pulse as the island.
  const boltGeometry = new THREE.BufferGeometry();
  boltGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -2,18,0, 1,12,0,  1,12,0, -1,11,0,  -1,11,0, 2,6,0,  2,6,0, 0,0,0,
    -1,11,0, -4,9,0,  -4,9,0, -5,6,0,
  ], 3));
  const bolt = new THREE.LineSegments(boltGeometry, new THREE.LineBasicMaterial({
    color: '#d5e2ff', transparent: true, depthWrite: false, fog: false,
  }));
  streaks.visible = bolt.visible = false;
  scene.add(streaks, bolt);
  let elapsed = 0;
  let nextStrike = 5;
  let struckAt = -Infinity;
  let thunderPending = false;
  const wrap = THREE.MathUtils.euclideanModulo;

  return {
    reset() {
      elapsed = 0;
      nextStrike = 5;
      struckAt = -Infinity;
      thunderPending = false;
      streaks.visible = bolt.visible = false;
      moon.intensity = baseLight;
    },
    update(dt, center, yaw, night, playing, reduced) {
      streaks.visible = playing && !reduced;
      if (playing) elapsed += dt;
      if (streaks.visible) {
        const n = 120 + night * 80;
        geometry.setDrawRange(0, n * 2);
        for (let i = 0; i < n; i++) {
          const d = drops[i];
          const x = center[0] - span / 2 + wrap(d.x + elapsed * 2 - center[0], span);
          const z = center[2] - span / 2 + wrap(d.z - center[2], span);
          const y = center[1] - 1 + wrap(d.y - elapsed * d.speed - center[1], height);
          positions.setXYZ(2 * i, x, y, z);
          positions.setXYZ(2 * i + 1, x - 0.08, y + d.speed * 0.04, z);
        }
        positions.needsUpdate = true;
      }

      if (playing && elapsed >= nextStrike) {
        struckAt = elapsed;
        nextStrike += 19 - night * 2 + Math.random() * 5;
        thunderPending = true;
        const a = yaw * Math.PI / 180 + (Math.random() - 0.5) * 0.8;
        bolt.position.set(center[0] + Math.sin(a) * 58, center[1] + 1, center[2] + Math.cos(a) * 58);
        bolt.rotation.y = a;
        bolt.scale.x = Math.random() < 0.5 ? -1 : 1;
      }
      const age = elapsed - struckAt;
      const glow = playing && !reduced ? Math.max(0, 1 - age / 0.45) : 0;
      bolt.visible = glow > 0;
      bolt.material.opacity = glow;
      moon.intensity = baseLight + glow * 0.65;
      if (playing && thunderPending && age >= 1.15) {
        thunderPending = false;
        onThunder();
      }
    },
  };
}
