import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, step, snapshot, NIGHTS, winThreshold } from '../src/sim/game.js';
import { TUNING } from '../src/sim/tuning.js';

const empty = (extra = {}) => ({ random_motes: false, random_shades: false, random_drifters: false, motes: [], shades: [], ...extra });
const idle = { move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false, dash: false, pause: false };
const run = (g, n, input = idle) => {
  const ev = [];
  for (let i = 0; i < n; i++) ev.push(...step(g, input));
  return ev;
};

test('game.contract.json is v1.3 and its tuning mirrors src/sim/tuning.js (standard numbers)', () => {
  const c = JSON.parse(readFileSync(new URL('../game.contract.json', import.meta.url), 'utf8'));
  assert.equal(c.contract_version, '1.3');
  assert.ok(c.bench_cmd && c.soak_cmd, 'v1.3 adds bench_cmd and soak_cmd');
  assert.deepEqual(c.tuning, JSON.parse(JSON.stringify(TUNING)));
  for (const k of ['team', 'build_cmd', 'run_cmd', 'headless_cmd']) assert.ok(c[k] && !/lệnh/.test(c[k]), k);
  // Ticket-02 Part 1 standard numbers (guards against accidental edits)
  const want = { carry_capacity: 10, lantern_cost: 10, interact_radius: 2, pulse_cost: 3, pulse_radius: 5, pulse_cooldown_s: 3, safe_radius: 6, shade_speed: 4, dash_speed: 14, dash_duration_s: 0.2, dash_cooldown_s: 1.5, fall_enabled: true,
    // Ticket-03 (v1.2): shorter nights + fuel keys
    night1_duration_s: 240, night2_duration_s: 270, night3_duration_s: 300, fuel_max: 100, fuel_decay_per_s: 1, fuel_per_mote: 10, relight_cost: 5, win_ratio: 0.6, drain_per_s: 5, low_fuel_threshold: 30, capacity_max: 20 };
  for (const [k, v] of Object.entries(want)) assert.equal(c.tuning[k], v, k);
  // Ticket-03 replaced the score formula: +5 per deposited mote, time bonus removed
  assert.deepEqual(c.tuning.score, { per_mote: 5, per_lantern: 100, per_stun: 5, per_second_left: 0, per_flame_left: 50 });
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

// Updated in Phase 3: +5 per deposited mote (was +10)
test('deposit picks nearest unlit lantern, fills only up to 10, scores +5 per mote', () => {
  const g = createGame({ scenario: empty({ player: { carried: 10 }, lanterns: [{ id: 'L1', pos: [1.5, 0, 0], deposited: 4 }, { id: 'L2', pos: [0, 0, 1] }] }) });
  const ev = run(g, 1, { ...idle, interact: true });
  assert.deepEqual(ev[0].data, { lantern_id: 'L2', amount: 10, deposited: 10 });
  assert.equal(g.score, 50 + 100);
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

// Phase 3: the Phase 2 test "all lanterns lit on the exact dawn tick counts as a win" was REMOVED:
// Ticket-03 replaced "win when all lit" with "survive to dawn with >= ceil(0.6 n) lit". Replaced by:
test('lighting every lantern no longer ends the night', () => {
  const lanterns = ['L1', 'L2', 'L3', 'L4'].map((id) => ({ id, lit: true }));
  lanterns.push({ id: 'L5', pos: [0, 0, 1], deposited: 9 });
  const g = createGame({ scenario: empty({ player: { carried: 1 }, lanterns }) });
  run(g, 1, { ...idle, interact: true });
  assert.ok(g.lanterns.every((l) => l.lit));
  assert.equal(g.state, 'playing');
});

test('dawn: lit count is taken after the step-2 fuel update of the last tick', () => {
  // L3 runs out exactly on the dawn tick -> only 2/5 lit -> lost
  const g = createGame({ scenario: empty({ time_left_s: 1, lanterns: [{ id: 'L1', lit: true }, { id: 'L2', lit: true }, { id: 'L3', lit: true, fuel: 1 }] }) });
  const ev = run(g, 60);
  assert.deepEqual(ev.map((e) => e.name), ['lantern_out', 'game_over']);
  assert.deepEqual(ev[1].data, { result: 'lost', reason: 'dawn' });
});

test('no flames beats dawn on the last tick', () => {
  const g = createGame({ scenario: empty({ time_left_s: 1 / 60, player: { flames: 1 }, shades: [{ pos: [0.3, 1, 0] }], lanterns: [{ id: 'L1', lit: true }, { id: 'L2', lit: true }, { id: 'L3', lit: true }] }) });
  const ev = run(g, 1);
  assert.deepEqual(ev.at(-1).data, { result: 'lost', reason: 'no_flames' });
});

test('win thresholds: 3/5, 4/6, 5/7', () => {
  for (const [night, n] of [[1, 3], [2, 4], [3, 5]]) assert.equal(winThreshold(createGame({ night })), n);
});

test('refuel: nearest selectable lantern, used = ceil(missing/10) capped by carried', () => {
  const g = createGame({ scenario: empty({ player: { carried: 20 }, lanterns: [{ id: 'L1', pos: [0, 0, 0.5], lit: true }, { id: 'L2', pos: [0, 0, 1.5], lit: true, fuel: 55 }] }) });
  const ev = run(g, 1, { ...idle, interact: true });
  // L1 is 100 at setup and 99.983 after the step-2 decay -> not full, nearest -> used = ceil(0.0167/10) = 1
  assert.deepEqual(ev[0], { type: 'event', tick: 1, name: 'refuel', data: { lantern_id: 'L1', amount: 1, fuel: 100 } });
  assert.equal(g.player.carried, 19);
});

test('a full lantern is not selectable: the next one in range is refuelled instead', () => {
  const g = createGame({ scenario: empty({ player: { carried: 20 }, lanterns: [{ id: 'L1', pos: [0, 0, 0.5], lit: true }, { id: 'L2', pos: [0, 0, 1.5], lit: true, fuel: 55 }] }) });
  run(g, 1, { ...idle, interact: true }); // tops up L1 to exactly 100
  // two more step-2 decays happen (release tick + interact tick) before step 5: 6002 -> 6000 = full
  g.lanterns[0].fuelU = 6002;
  run(g, 1);
  const ev = run(g, 1, { ...idle, interact: true });
  assert.equal(ev[0].data.lantern_id, 'L2');
});

test('fuel is exact over a whole lantern life (integer 1/60 units, no drift)', () => {
  const g = createGame({ scenario: empty({ lanterns: [{ id: 'L1', lit: true }] }) });
  run(g, 5999);
  assert.equal(g.lanterns[0].fuelU, 1);
  assert.equal(g.lanterns[0].lit, true);
  assert.deepEqual(run(g, 1).map((e) => e.name), ['lantern_out']);
});

test('weak lantern (< 30) has no safe zone; at or above 30 it still has one', () => {
  // 150 ticks: the chasing shade covers 10 m; fuel 35 is still 32.5 (>= 30) at the end
  for (const [fuel, blocked] of [[29.9, false], [35, true]]) {
    const g = createGame({ scenario: empty({ player: { pos: [0, 0, 7] }, shades: [{ id: 'S1', pos: [0, 1, 18] }], lanterns: [{ id: 'L1', pos: [0, 0, 8], lit: true, fuel }] }) });
    run(g, 150);
    const d = Math.hypot(g.shades[0].pos[0], g.shades[0].pos[2] - 8);
    assert.equal(d > 6, blocked, `fuel ${fuel}: shade at ${d.toFixed(2)} m`);
  }
});

test('several draining shades stack (5/s each) on top of the 1/s decay', () => {
  const shades = [{ id: 'S1', pos: [1.5, 1, 10], state: 'drain', target_lantern_id: 'L1' }, { id: 'S2', pos: [-1.5, 1, 10], state: 'drain', target_lantern_id: 'L1' }];
  const g = createGame({ scenario: empty({ player: { pos: [0, 0, -20] }, shades, lanterns: [{ id: 'L1', pos: [0, 0, 10], lit: true, fuel: 20 }] }) });
  run(g, 60);
  assert.equal(g.lanterns[0].fuelU, 1200 - 60 - 2 * 5 * 60);
});

test('a chasing shade does not switch to draining', () => {
  const g = createGame({ scenario: empty({ player: { pos: [0, 0, 18] }, shades: [{ id: 'S1', pos: [0, 1, 11] }], lanterns: [{ id: 'L1', pos: [0, 0, 10], lit: true, fuel: 20 }] }) });
  assert.equal(g.shades[0].state, 'chase');
  run(g, 5);
  assert.equal(g.shades[0].state, 'chase');
});

test('capacity = 10 + 2 x successful_lights, max 20; pre-lit lanterns do not count', () => {
  const g = createGame({ scenario: empty({ player: { successful_lights: 9 }, lanterns: [{ id: 'L1', lit: true }] }) });
  assert.equal(snapshot(g).player.capacity, 20);
  const g2 = createGame({ scenario: empty({ lanterns: [{ id: 'L1', lit: true }, { id: 'L2', lit: true }] }) });
  assert.equal(snapshot(g2).player.capacity, 10);
});

test('stun ends in wander (Ticket-03)', () => {
  const g = createGame({ scenario: empty({ player: { pos: [0, 0, -30] }, shades: [{ id: 'S1', pos: [0, 1, 0], state: 'stunned', state_ticks_left: 3 }] }) });
  run(g, 3);
  assert.equal(g.shades[0].state, 'wander');
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
  for (const k of ['pos', 'vel', 'grounded', 'flames', 'carried', 'invuln', 'dash_cd_s', 'pulse_cd_s', 'charm_s', 'capacity']) assert.ok(k in s.player, k);
  assert.deepEqual(Object.keys(s.lanterns[0]), ['id', 'pos', 'lit', 'deposited', 'fuel', 'ever_lit', 'relit_count']);
  assert.deepEqual(Object.keys(s.wind), ['active', 'dir_deg']);
  assert.deepEqual(Object.keys(s.motes[0]), ['id', 'pos', 'kind', 'ttl_s']);
  assert.deepEqual(Object.keys(s.charms[0]), ['id', 'pos', 'available', 'respawn_s']);
});

// ---- added after independent review (contract-reviewer, Phase 2) ----

test('recoil: shade backs off exactly 2.000 m over 60 ticks, then resumes', () => {
  const g = createGame({ scenario: empty({ shades: [{ id: 'S1', pos: [0.5, 1, 0] }] }) });
  run(g, 1); // chases 4/60 to 0.4333, hits on tick 1
  assert.equal(g.shades[0].state, 'recoil');
  run(g, 59);
  assert.equal(snapshot(g).shades[0].pos[0], 2.4); // 59 recoil moves so far
  assert.equal(g.shades[0].state, 'recoil');
  run(g, 1);
  assert.equal(snapshot(g).shades[0].pos[0], 2.433); // 60th move: 0.4333 + 2.000
  assert.equal(g.shades[0].state, 'chase');
});

test('wind gust pushes for the full 5 s: 2 m/s x 300 ticks = 10 m', () => {
  const g = createGame({ night: 3, scenario: empty({ wind_enabled: true }) });
  run(g, 2400);
  const p = g.player.pos;
  assert.ok(Math.abs(Math.hypot(p[0], p[2] + 30) - 10) < 1e-6, String(p));
  assert.equal(g.wind.active, false);
});

test('pulse on a shade being evicted from a newly lit zone keeps it harmless (evict kept)', () => {
  const g = createGame({ scenario: empty({ player: { pos: [0, 0, 7], carried: 4 }, shades: [{ id: 'S1', pos: [1, 1, 8] }], lanterns: [{ id: 'L1', pos: [0, 0, 8], deposited: 9 }] }) });
  const ev = run(g, 1, { ...idle, interact: true, pulse: true });
  assert.deepEqual(ev.map((e) => e.name), ['deposit', 'lantern_lit', 'pulse']);
  assert.ok(g.shades[0].evict > 0, 'still being evicted');
  const later = run(g, 300);
  assert.equal(later.filter((e) => e.name === 'player_hit').length, 0);
  const s = g.shades[0].pos;
  assert.ok(Math.hypot(s[0], s[2] - 8) >= 6, String(s));
});

test('shade schedule: 2 at tick 300, then every 480/420/360 ticks, max 6/8/10', () => {
  const expected = { 1: [300, 300, 780, 1260, 1740, 2220], 2: [300, 300, 720, 1140, 1560, 1980, 2400, 2820], 3: [300, 300, 660, 1020, 1380, 1740, 2100, 2460, 2820, 3180] };
  for (const night of [1, 2, 3]) {
    const g = createGame({ seed: 7, night, scenario: { random_motes: false, random_drifters: false, wind_enabled: false, player: { flames: 999, invuln_ticks: 99999 } } });
    const ticks = run(g, 4000).filter((e) => e.name === 'shade_spawned').map((e) => e.tick);
    assert.deepEqual(ticks, expected[night], `night ${night}`);
  }
});

test('shades never spawn within 15 m of Mây', () => {
  const g = createGame({ seed: 3, scenario: { random_motes: false, player: { pos: [37, 0, 0], flames: 99, invuln_ticks: 99999 } } });
  for (let k = 0; k < 2300; k++) {
    for (const e of step(g, idle)) {
      if (e.name !== 'shade_spawned') continue;
      const s = g.shades.find((x) => x.id === e.data.id);
      assert.ok(Math.hypot(s.pos[0] - 37, s.pos[2]) >= 15, `${e.data.id} at ${s.pos}`);
    }
  }
});

test('drifter: idle below 5 motes, chases at >= 5 within 15 m, back to idle when that stops', () => {
  const g = createGame({ night: 2, scenario: empty({ player: { carried: 4 }, drifters: [{ id: 'D1', pos: [10, 1.5, 0] }] }) });
  run(g, 5);
  assert.equal(g.drifters[0].state, 'idle');
  g.player.carried = 5;
  run(g, 1);
  assert.equal(g.drifters[0].state, 'chase');
  g.player.carried = 4;
  run(g, 1);
  assert.equal(g.drifters[0].state, 'idle');
});

test('charm: 600 ticks, unavailable for 2700 ticks, then can be picked again', () => {
  const g = createGame({ night: 2, scenario: empty({ player: { pos: [35, 0, 0] } }) });
  const ev = run(g, 2710).filter((e) => e.name === 'charm_picked');
  assert.deepEqual(ev.map((e) => e.tick), [1, 2701]);
  assert.deepEqual(ev[0].data, { charm_id: 'C1', charm_ticks: 600 });
});

test('fall ignores invulnerability, happens once, respawn after 60 ticks with 90 ticks invuln', () => {
  const g = createGame({ scenario: empty({ player: { pos: [39.95, 0, 0], carried: 3, invuln_ticks: 1000 } }) });
  const ev = [];
  for (let k = 0; k < 300; k++) ev.push(...step(g, { ...idle, move: k < 5 ? [1, 0] : [0, 0] }));
  const falls = ev.filter((e) => e.name === 'player_hit');
  assert.equal(falls.length, 1);
  assert.deepEqual(falls[0].data, { by: 'fall', flames: 2, dropped: 0, lost: 3 });
  assert.deepEqual(snapshot(g).player.pos, [0, 0, 0]);
});

test('dropped motes land on a 1.5-2.5 m ring around Mây', () => {
  const g = createGame({ seed: 5, scenario: empty({ player: { carried: 10 }, shades: [{ id: 'S1', pos: [0.5, 1, 0] }] }) });
  const ev = run(g, 1);
  assert.equal(ev[0].data.dropped, 5);
  for (const m of g.motes) {
    const d = Math.hypot(m.pos[0], m.pos[2]);
    assert.ok(m.kind === 'dropped' && d >= 1.5 - 1e-3 && d <= 2.5 + 1e-3, `${m.id} at ${d}`);
  }
});

test('pause freezes dropped-mote TTL and time', () => {
  const g = createGame({ scenario: empty({ motes: [{ pos: [5, 0, 5], kind: 'dropped', ttl_ticks: 50 }] }) });
  step(g, { ...idle, pause: true });
  run(g, 200); // still paused (no new edge)
  assert.equal(g.motes.length, 1);
  assert.equal(g.simTick, 0);
  assert.equal(g.tick, 201);
});
