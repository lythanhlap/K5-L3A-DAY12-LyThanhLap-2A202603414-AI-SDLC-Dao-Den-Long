// Standard maps from Ticket-02 Part 2. Angles: measured from +X, point = (r cos θ, y, r sin θ).
import { TUNING } from './tuning.js';

const ring = (r, n, startDeg = 0, y = 0, stepDeg = 360 / n) =>
  Array.from({ length: n }, (_, i) => {
    const a = ((startDeg + i * stepDeg) * Math.PI) / 180;
    return [round3(r * Math.cos(a)), y, round3(r * Math.sin(a))];
  });
const round3 = (x) => {
  const v = Math.round(x * 1000) / 1000;
  return v === 0 ? 0 : v;
};
const offset = (pts, dx) => pts.map(([x, y, z]) => [round3(x + dx), y, z]);

// Ground height at (x, z), or null over the sea of clouds. `solid` = blocks movement (tower).
const night1Ground = (x, z) => (Math.hypot(x, z) <= 40 ? 0 : null);

const night2Ground = (x, z) => {
  if (Math.hypot(x, z) <= 28 || Math.hypot(x - 70, z) <= 28) return 0;
  if (x >= 26 && x <= 44 && z >= -2 && z <= 2) return 0;
  return null;
};

const RAMP_ANGLES = [30, 150].map((d) => (d * Math.PI) / 180);
function night3Ground(x, z) {
  const r = Math.hypot(x, z);
  if (r > 45) return null;
  if (r <= 8) return 6; // tier 2 (tower handled as solid)
  if (z > 0 && r >= 12 && r <= 24) return 3; // tier 1 half-annulus
  for (const a of RAMP_ANGLES) {
    const ux = Math.cos(a);
    const uz = Math.sin(a);
    const along = x * ux + z * uz;
    const side = Math.abs(-x * uz + z * ux);
    if (side <= 1.5 && along >= 24 && along <= 30) return (3 * (30 - along)) / 6;
  }
  return 0;
}

export const NIGHTS = {
  1: {
    name: 'Đảo Bến',
    duration: TUNING.night1_duration_s,
    start: [0, 0, 0],
    ground: night1Ground,
    solid: () => false,
    lanterns: [
      [0, 0, 25],
      [23.8, 0, 7.7],
      [14.7, 0, -20.2],
      [-14.7, 0, -20.2],
      [-23.8, 0, 7.7],
    ],
    moteSpawns: [...ring(12, 8), ...ring(33, 16)],
    shadeSpawns: ring(37, 12, 15),
    shadeEvery: 480,
    shadeMax: 6,
    shadeSpeed: TUNING.shade_speed,
    pads: [],
    charms: [],
    drifters: false,
    wind: false,
    centers: [[0, 0]],
  },
  2: {
    name: 'Đảo Cau',
    duration: TUNING.night2_duration_s,
    start: [0, 0, 0],
    ground: night2Ground,
    solid: () => false,
    lanterns: [
      [0, 0, 20],
      [17, 0, -10],
      [-17, 0, -10],
      [70, 0, 20],
      [87, 0, -10],
      [53, 0, -10],
    ],
    moteSpawns: [...ring(10, 4), ...ring(22, 8), ...offset(ring(10, 4), 70), ...offset(ring(22, 8), 70)],
    shadeSpawns: [...ring(26, 8, 22.5), ...offset(ring(26, 8, 22.5), 70)],
    shadeEvery: 420,
    shadeMax: 8,
    shadeSpeed: TUNING.shade_speed,
    pads: [
      { pos: [20, 0, 18], r: 1, vy: 14, vh: 24, target: [70, 0] },
      { pos: [50, 0, -18], r: 1, vy: 14, vh: 24, target: [0, 0] },
    ],
    charms: [[35, 0, 0]],
    drifters: true,
    wind: false,
    centers: [[0, 0], [70, 0]],
  },
  3: {
    name: 'Đảo Chuông',
    duration: TUNING.night3_duration_s,
    start: [0, 0, -30],
    ground: night3Ground,
    solid: (x, z, y) => Math.hypot(x, z) <= 2 && y < 14,
    lanterns: [
      [0, 6, 6],
      [18, 3, 10],
      [-18, 3, 10],
      [35, 0, -10],
      [-35, 0, -10],
      [20, 0, -35],
      [-20, 0, -35],
    ],
    moteSpawns: [...ring(34, 18, 0, 0), ...ring(18, 8, 20, 3, 20), ...ring(5, 4, 45, 6)],
    shadeSpawns: ring(43, 16, 0),
    shadeEvery: 360,
    shadeMax: 10,
    shadeSpeed: 4.5,
    pads: [{ pos: [0, 3, 13], r: 1, vy: 12, vh: 8, dir: [0, -1] }],
    charms: [
      [30, 0, 25],
      [-30, 0, 25],
    ],
    drifters: true,
    wind: true,
    centers: [[0, 0]],
  },
};
