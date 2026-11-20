import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, step, snapshot } from '../src/sim/game.js';
import { TUNING } from '../src/sim/tuning.js';

const empty = (extra = {}) => ({ random_motes: false, random_shades: false, motes: [], shades: [], ...extra });
const idle = { move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false };
const run = (g, n, input = idle) => {
  const ev = [];
  for (let i = 0; i < n; i++) ev.push(...step(g, input));
  return ev;
};

test('game.contract.json tuning mirrors src/sim/tuning.js', () => {
  const c = JSON.parse(readFileSync(new URL('../game.contract.json', import.meta.url), 'utf8'));
  assert.equal(c.contract_version, '1.0');
  assert.deepEqual(c.tuning, JSON.parse(JSON.stringify(TUNING)));
  for (const k of ['team', 'build_cmd', 'run_cmd', 'headless_cmd']) assert.ok(c[k] && !/lệnh/.test(c[k]), k);
});

test('cam_yaw rotation follows contract formula (yaw 90: move x -> -Z)', () => {
  const g = createGame({ scenario: empty() });
  run(g, 60, { ...idle, move: [1, 0], cam_yaw_deg: 90 });
  assert.deepEqual(snapshot(g).player.pos, [0, 0, -6]);
});

test('out-of-range move components are clamped then normalized', () => {
  const g = createGame({ scenario: empty() });
  run(g, 60, { ...idle, move: [5, 0] });
  assert.deepEqual(snapshot(g).player.pos, [6, 0, 0]);
});

test('player cannot leave the island (fall disabled)', () => {
  const g = createGame({ scenario: empty() });
  run(g, 600, { ...idle, move: [0, 1] });
  assert.ok(Math.hypot(g.player.pos[0], g.player.pos[2]) <= 30 + 1e-9);
  assert.equal(g.state, 'playing');
});

test('pickup radius is inclusive (distance == r picks)', () => {
  const g = createGame({ scenario: empty({ motes: [[TUNING.pickup_radius, 0, 0]] }) });
  const ev = run(g, 1);
  assert.deepEqual(ev[0], { type: 'event', tick: 1, name: 'mote_picked', data: { carried: 1 } });
});

test('carry capacity is respected', () => {
  const motes = Array.from({ length: 8 }, () => [0, 0, 0.5]);
  const g = createGame({ scenario: empty({ motes }) });
  run(g, 1);
  assert.equal(g.player.carried, TUNING.carry_capacity);
  assert.equal(g.motes.length, 8 - TUNING.carry_capacity);
});

test('deposit picks nearest unlit lantern and only fills up to lantern_cost', () => {
  const g = createGame({
    scenario: empty({
      player: { carried: 5 },
      lanterns: [
        { id: 'L1', pos: [2, 0, 0], deposited: 3 },
        { id: 'L2', pos: [0, 0, 1] },
      ],
    }),
  });
  const ev = run(g, 1, { ...idle, interact: true });
  assert.deepEqual(ev[0].data, { lantern_id: 'L2', amount: 5, deposited: 5 });
  assert.equal(ev[1].name, 'lantern_lit');
  run(g, 1); // release
  const ev2 = run(g, 1, { ...idle, interact: true });
  assert.equal(ev2.length, 0, 'nothing left to deposit');
});

test('holding interact does not repeat (edge-triggered)', () => {
  const g = createGame({ scenario: empty({ player: { carried: 2 }, lanterns: [{ id: 'L1', pos: [0, 0, 1] }] }) });
  const ev = run(g, 10, { ...idle, interact: true });
  assert.equal(ev.filter((e) => e.name === 'deposit').length, 1);
});

test('pulse without enough light does nothing', () => {
  const g = createGame({ scenario: empty({ shades: [{ pos: [3, 1, 0] }] }) });
  const ev = run(g, 1, { ...idle, pulse: true });
  assert.equal(ev.filter((e) => e.name === 'pulse').length, 0);
});

test('pulse cooldown: second pulse allowed exactly after pulse_cooldown_s', () => {
  const g = createGame({ scenario: empty({ player: { carried: 3 } }) });
  const ticks = [];
  for (let k = 0; k < 130; k++) {
    for (const e of step(g, { ...idle, pulse: k % 2 === 0 })) if (e.name === 'pulse') ticks.push(e.tick);
  }
  assert.deepEqual(ticks, [1, 61, 121]);
});

test('pulse radius is inclusive and pulse only stuns shades inside it', () => {
  const g = createGame({
    scenario: empty({ player: { carried: 1 }, shades: [{ id: 'A', pos: [0, 1, 20] }, { id: 'B', pos: [-6 - 3.5 / 60, 1, 0] }] }),
  });
  const ev = run(g, 1, { ...idle, pulse: true });
  assert.deepEqual(ev.find((e) => e.name === 'pulse').data, { stunned_ids: ['B'] });
});

test('shade moves at shade_speed', () => {
  const g = createGame({ scenario: empty({ shades: [{ id: 'S1', pos: [20, 1, 0] }] }) });
  run(g, 60);
  assert.deepEqual(snapshot(g).shades[0].pos, [16.5, 1, 0]);
});

test('setup with pre-lit lanterns awards no score and emits no events', () => {
  const g = createGame({ scenario: empty({ lanterns: [{ id: 'L1', lit: true }] }) });
  assert.equal(g.score, 0);
  assert.equal(g.events.length, 0);
});

test('shade_spawned emitted with sequential id in random mode', () => {
  const g = createGame({ seed: 7, scenario: { random_motes: false, player: { flames: 99 } } });
  const ev = run(g, 30 * 60);
  assert.deepEqual(ev.filter((e) => e.name === 'shade_spawned').map((e) => e.data.id), ['S4']);
});
