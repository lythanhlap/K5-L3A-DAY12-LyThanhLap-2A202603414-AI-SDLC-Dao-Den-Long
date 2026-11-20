import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, step, snapshot, NIGHTS } from '../src/sim/game.js';
import { TUNING } from '../src/sim/tuning.js';

const empty = (extra = {}) => ({ random_motes: false, random_shades: false, random_drifters: false, motes: [], shades: [], ...extra });
const idle = { move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false, dash: false, pause: false };
const run = (g, n, input = idle) => {
  const ev = [];
  for (let i = 0; i < n; i++) ev.push(...step(g, input));
  return ev;
};

test('game.contract.json is v1.1 and its tuning mirrors src/sim/tuning.js (standard numbers)', () => {
  const c = JSON.parse(readFileSync(new URL('../game.contract.json', import.meta.url), 'utf8'));
  assert.equal(c.contract_version, '1.1');
  assert.deepEqual(c.tuning, JSON.parse(JSON.stringify(TUNING)));
  for (const k of ['team', 'build_cmd', 'run_cmd', 'headless_cmd']) assert.ok(c[k] && !/lệnh/.test(c[k]), k);
  // Ticket-02 Part 1 standard numbers (guards against accidental edits)
  const want = { carry_capacity: 10, lantern_cost: 10, interact_radius: 2, pulse_cost: 3, pulse_radius: 5, pulse_cooldown_s: 3, safe_radius: 6, shade_speed: 4, dash_speed: 14, dash_duration_s: 0.2, dash_cooldown_s: 1.5, night2_duration_s: 330, night3_duration_s: 360, fall_enabled: true };
  for (const [k, v] of Object.entries(want)) assert.equal(c.tuning[k], v, k);
  assert.deepEqual(c.tuning.score, { per_mote: 10, per_lantern: 100, per_stun: 5, per_second_left: 2, per_flame_left: 50 });
});

test('standard maps: lantern counts, starts, spawn point counts', () => {
  assert.equal(NIGHTS[1].lanterns.length, 5);
  assert.equal(NIGHTS[2].lanterns.length, 6);
  assert.equal(NIGHTS[3].lanterns.length, 7);
  assert.equal(NIGHTS[1].moteSpawns.length, 24);
  assert.equal(NIGHTS[2].moteSpawns.length, 24);
  assert.equal(NIGHTS[3].moteSpawns.length, 30);
  assert.equal(NIGHTS[1].shadeSpawns.length, 12);
  assert.equal(NIGHTS[3].shadeSpawns.length, 16);
  // angle convention: tier-1 points (20°..160°) must be at z > 0 and Y = 3
  for (const p of NIGHTS[3].moteSpawns.filter((q) => q[1] === 3)) assert.ok(p[2] > 0, String(p));
});

test('night 3 terrain: tiers, ramp, tower, sea', () => {
  const gr = NIGHTS[3].ground;
  assert.equal(gr(0, 5), 6);
  assert.equal(gr(0, 18), 3);
  assert.equal(gr(0, -18), 0);
  assert.equal(gr(0, 10), 0);
  assert.equal(gr(27 * Math.cos(Math.PI / 6), 27 * Math.sin(Math.PI / 6)), 1.5);
  assert.equal(gr(50, 0), null);
  assert.ok(NIGHTS[3].solid(0, 1, 6));
  assert.equal(NIGHTS[2].ground(35, 0), 0, 'bridge');
  assert.equal(NIGHTS[2].ground(35, 3), null, 'no railing: off the bridge is sea');
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

test('jump: 7 m/s, gravity 20, only from the ground', () => {
  const g = createGame({ scenario: empty() });
  step(g, { ...idle, jump: true });
  assert.equal(g.player.grounded, false);
  let peak = 0;
  for (let i = 0; i < 60; i++) {
    step(g, { ...idle, jump: i < 30 && i % 2 === 0 }); // mid-air presses are ignored
    peak = Math.max(peak, g.player.pos[1]);
  }
  assert.ok(peak > 1.1 && peak < 1.35, `peak ${peak}`); // v²/2g = 1.225
  assert.equal(g.player.grounded, true);
});

test('pickup radius is inclusive and needs height difference <= 1.5', () => {
  const g = createGame({ scenario: empty({ motes: [[1, 0, 0], [0, 2, 0.5]] }) });
  const ev = run(g, 1);
  assert.deepEqual(ev.map((e) => e.name), ['mote_picked']);
  assert.equal(g.motes.length, 1);
});

test('carry capacity is 10', () => {
  const motes = Array.from({ length: 14 }, () => [0, 0, 0.5]);
  const g = createGame({ scenario: empty({ motes }) });
  run(g, 1);
  assert.equal(g.player.carried, 10);
});

test('deposit picks nearest unlit lantern, fills only up to 10, scores +10 per mote', () => {
  const g = createGame({ scenario: empty({ player: { carried: 10 }, lanterns: [{ id: 'L1', pos: [1.5, 0, 0], deposited: 4 }, { id: 'L2', pos: [0, 0, 1] }] }) });
  const ev = run(g, 1, { ...idle, interact: true });
  assert.deepEqual(ev[0].data, { lantern_id: 'L2', amount: 10, deposited: 10 });
  assert.equal(g.score, 100 + 100);
  run(g, 1);
  assert.equal(run(g, 1, { ...idle, interact: true }).length, 0, 'nothing left to deposit');
});

test('pulse needs 3 motes', () => {
  const g = createGame({ scenario: empty({ player: { carried: 2 }, shades: [{ pos: [3, 1, 0] }] }) });
  assert.equal(run(g, 1, { ...idle, pulse: true }).filter((e) => e.name === 'pulse').length, 0);
});

test('pulse cooldown 3 s from activation', () => {
  const g = createGame({ scenario: empty({ player: { carried: 10 } }) });
  const ticks = [];
  for (let k = 0; k < 400; k++) for (const e of step(g, { ...idle, pulse: k % 2 === 0 })) if (e.name === 'pulse') ticks.push(e.tick);
  assert.deepEqual(ticks, [1, 181, 361]);
});

test('pulse uses 3D distance from foot + 0.8 m', () => {
  const g = createGame({
    scenario: empty({ player: { carried: 3 }, shades: [{ id: 'HI', pos: [3, 5.8, 0] }, { id: 'IN', pos: [0, 0.8, 5] }] }),
  });
  const ev = run(g, 1, { ...idle, pulse: true });
  assert.deepEqual(ev.find((e) => e.name === 'pulse').data, { stunned_ids: ['IN'] });
});

test('shade detect 12 m / lose 18 m; chase speed 4 m/s (night 3: 4.5)', () => {
  const g = createGame({ scenario: empty({ shades: [{ id: 'S1', pos: [11, 1, 0] }, { id: 'S2', pos: [13, 1, 5] }] }) });
  assert.equal(snapshot(g).shades[0].state, 'chase');
  assert.equal(snapshot(g).shades[1].state, 'wander');
  run(g, 60);
  assert.deepEqual(snapshot(g).shades[0].pos, [7, 1, 0]);
  const g3 = createGame({ night: 3, scenario: empty({ wind_enabled: false, shades: [{ id: 'S1', pos: [10, 1, -30] }] }) });
  run(g3, 60);
  assert.deepEqual(snapshot(g3).shades[0].pos, [5.5, 1, -30]);
});

test('touching an invulnerable Mây does nothing; max one flame per tick', () => {
  const g = createGame({ scenario: empty({ player: { invuln_ticks: 30 }, shades: [{ id: 'S1', pos: [0.3, 1, 0] }, { id: 'S2', pos: [-0.3, 1, 0] }] }) });
  assert.equal(run(g, 29).length, 0);
  const ev = run(g, 2).filter((e) => e.name === 'player_hit');
  assert.equal(ev.length, 1);
  assert.equal(g.player.flames, 2);
});

test('setup with pre-lit lanterns awards no score and emits no events', () => {
  const g = createGame({ scenario: empty({ lanterns: [{ id: 'L1', lit: true }] }) });
  assert.equal(g.score, 0);
  assert.equal(g.events.length, 0);
});

test('all lanterns lit on the exact dawn tick counts as a win', () => {
  const lanterns = ['L1', 'L2', 'L3', 'L4'].map((id) => ({ id, lit: true }));
  lanterns.push({ id: 'L5', pos: [0, 0, 1], deposited: 9 });
  const g = createGame({ scenario: empty({ time_left_s: 1 / 60, player: { carried: 1 }, lanterns }) });
  const ev = run(g, 1, { ...idle, interact: true });
  assert.deepEqual(ev.at(-1).data, { result: 'won', reason: 'all_lit' });
});

test('random mote top-up every 240 ticks, cap 30', () => {
  const g = createGame({ seed: 3, scenario: { random_shades: false } });
  assert.equal(g.motes.length, 20);
  run(g, 240);
  assert.equal(g.motes.length, 21);
});

test('snapshot has every v1.1 field', () => {
  const s = snapshot(createGame({ night: 2 }));
  for (const k of ['tick', 'sim_tick', 'night', 'state', 'time_left_s', 'score', 'wind', 'player', 'lanterns', 'shades', 'motes_active', 'motes', 'drifters', 'charms']) assert.ok(k in s, k);
  for (const k of ['pos', 'vel', 'grounded', 'flames', 'carried', 'invuln', 'dash_cd_s', 'pulse_cd_s', 'charm_s']) assert.ok(k in s.player, k);
  assert.deepEqual(Object.keys(s.wind), ['active', 'dir_deg']);
  assert.deepEqual(Object.keys(s.motes[0]), ['id', 'pos', 'kind', 'ttl_s']);
  assert.deepEqual(Object.keys(s.charms[0]), ['id', 'pos', 'available', 'respawn_s']);
});
