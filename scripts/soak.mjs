#!/usr/bin/env node
// Ticket-04 soak test: N nights back-to-back in ONE process (night 1 -> 2 -> 3 rotating),
// night i (0-based) uses seed = base + i. Random input from that seed: a new move direction every
// 30 ticks; per tick 5% jump, 3% dash, 2% pulse, 10% interact.
// Usage: node --expose-gc scripts/soak.mjs --seed 7 --nights 10 --out soak.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createGame, step, mulberry32 } from '../src/sim/game.js';
import { TICK_RATE, TUNING } from '../src/sim/tuning.js';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}
const base = Number(arg('seed', 7));
const nights = Number(arg('nights', 10));
const out = arg('out', 'soak.json');
if (!Number.isInteger(base) || !Number.isInteger(nights) || nights < 1) {
  process.stderr.write('error: --seed and --nights must be integers (nights >= 1)\n');
  process.exit(1);
}

const rssMb = () => {
  if (global.gc) global.gc();
  return Math.round((process.memoryUsage().rss / 1048576) * 10) / 10;
};
const durationTicks = (n) => Math.round(TUNING[`night${n}_duration_s`] * TICK_RATE);

const t0 = process.hrtime.bigint();
const results = [];
let crashes = 0;
let memStart = null;
let g = null;
for (let i = 0; i < nights; i++) {
  const night = (i % 3) + 1;
  const seed = base + i;
  try {
    g = createGame({ seed, night });
    if (i === 0) memStart = rssMb(); // RSS after the first night is loaded
    const rnd = mulberry32((seed ^ 0x9e3779b9) >>> 0);
    const input = { move: [0, 0], cam_yaw_deg: 0, jump: false, dash: false, pulse: false, interact: false, pause: false };
    const limit = durationTicks(night);
    while (g.state === 'playing' && g.simTick < limit) {
      if (g.simTick % 30 === 0) {
        const a = rnd() * 2 * Math.PI;
        input.move = [Math.cos(a), Math.sin(a)];
      }
      input.jump = rnd() < 0.05;
      input.dash = rnd() < 0.03;
      input.pulse = rnd() < 0.02;
      input.interact = rnd() < 0.1;
      step(g, input);
    }
    results.push(g.state === 'won' ? 'won' : 'lost');
  } catch (e) {
    crashes++;
    results.push('crash');
    process.stderr.write(`night ${i} (night ${night}, seed ${seed}) crashed: ${e.stack}\n`);
  }
}
g = null; // reset after the last night
const memEnd = rssMb();
const durationS = Number(process.hrtime.bigint() - t0) / 1e9;

const report = {
  nights,
  crashes,
  results,
  mem_start_mb: memStart,
  mem_end_mb: memEnd,
  duration_s: Math.round(durationS * 10) / 10,
};
mkdirSync(dirname(out) || '.', { recursive: true });
writeFileSync(out, JSON.stringify(report) + '\n');
process.stdout.write(JSON.stringify(report) + '\n');
process.exit(0);
