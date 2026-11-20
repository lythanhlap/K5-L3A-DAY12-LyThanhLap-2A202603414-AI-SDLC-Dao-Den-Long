// Pure, deterministic simulation of Đảo Đèn Lồng (Night 1).
// No DOM / Three.js imports: used by both the headless CLI and the web renderer.
import { TICK_RATE, TUNING, WORLD } from './tuning.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hdist = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
export const r3 = (x) => {
  const v = Math.round(x * 1000) / 1000;
  return v === 0 ? 0 : v; // avoid -0
};
const r3v = (p) => [r3(p[0]), r3(p[1]), r3(p[2])];

function defaultLanterns(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i * 2 * Math.PI) / n;
    out.push({
      id: `L${i + 1}`,
      pos: [r3(WORLD.lanternRingRadius * Math.sin(a)), 0, r3(WORLD.lanternRingRadius * Math.cos(a))],
      lit: false,
      deposited: 0,
    });
  }
  return out;
}

const ticksOf = (seconds) => Math.round(seconds * TICK_RATE);

/**
 * @param {{seed?: number, scenario?: object|null, tuning?: object}} opts
 */
export function createGame({ seed = 1, scenario = null, tuning = TUNING } = {}) {
  const g = {
    tuning,
    rand: mulberry32(seed),
    tick: 0,
    state: 'playing',
    result: null,
    score: 0,
    t0: tuning.night1_duration_s,
    player: { pos: [0, 0, 0], vy: 0, flames: tuning.flames, carried: 0, invuln: 0, pulseCd: 0, facing: 0 },
    prev: { jump: false, interact: false, pulse: false },
    lanterns: defaultLanterns(tuning.lantern_count_night1),
    motes: [],
    shades: [],
    nextMote: 1,
    nextShade: 1,
    randomMotes: true,
    randomShades: true,
    moteTimer: 0,
    shadeTimer: 0,
    events: [],
  };

  const sc = scenario || {};
  if (sc.random_motes === false) g.randomMotes = false;
  if (sc.random_shades === false) g.randomShades = false;
  if (sc.player) {
    if (sc.player.pos) g.player.pos = [...sc.player.pos];
    if (sc.player.carried != null) g.player.carried = sc.player.carried;
    if (sc.player.flames != null) g.player.flames = sc.player.flames;
  }
  if (sc.time_left_s != null) g.t0 = sc.time_left_s;
  for (const l of sc.lanterns || []) {
    const target = g.lanterns.find((x) => x.id === l.id);
    if (!target) throw new ScenarioError(`unknown lantern id ${l.id}`);
    if (l.pos) target.pos = [...l.pos];
    if (l.deposited != null) target.deposited = l.deposited;
    if (l.lit != null) target.lit = !!l.lit;
    if (target.deposited >= tuning.lantern_cost) target.lit = true;
  }

  if (sc.motes) for (const p of sc.motes) addMote(g, p);
  else if (g.randomMotes) for (let i = 0; i < WORLD.moteInitial; i++) addMote(g, randomMotePos(g));

  if (sc.shades) {
    const used = new Set(sc.shades.filter((s) => s.id).map((s) => s.id));
    for (const s of sc.shades) {
      let id = s.id;
      if (!id) {
        while (used.has(`S${g.nextShade}`)) g.nextShade++;
        id = `S${g.nextShade++}`;
        used.add(id);
      }
      g.shades.push(makeShade(id, s.pos));
    }
    while (used.has(`S${g.nextShade}`)) g.nextShade++;
  } else if (g.randomShades) {
    for (let i = 0; i < WORLD.shadeInitial; i++) g.shades.push(makeShade(`S${g.nextShade++}`, randomShadePos(g)));
  }
  for (const s of g.shades) keepOutOfSafeZones(g, s);
  return g;
}

export class ScenarioError extends Error {}

function makeShade(id, pos) {
  return { id, pos: [...pos], state: 'chase', stun: 0 };
}

function addMote(g, pos) {
  g.motes.push({ id: `M${g.nextMote++}`, pos: [pos[0], pos[1] ?? 0, pos[2]] });
}

function randomMotePos(g) {
  const r = WORLD.moteSpawnRadius * Math.sqrt(g.rand());
  const a = g.rand() * 2 * Math.PI;
  return [r3(r * Math.sin(a)), 0, r3(r * Math.cos(a))];
}

function randomShadePos(g) {
  let pos = null;
  for (let i = 0; i < 10; i++) {
    const r = WORLD.shadeRingMin + g.rand() * (WORLD.shadeRingMax - WORLD.shadeRingMin);
    const a = g.rand() * 2 * Math.PI;
    pos = [r3(r * Math.sin(a)), WORLD.shadeY, r3(r * Math.cos(a))];
    if (hdist(pos, g.player.pos) >= WORLD.shadeMinDistFromPlayer) break;
  }
  return pos;
}

function clampToIsland(p) {
  const d = Math.hypot(p[0], p[2]);
  if (d > WORLD.islandRadius) {
    p[0] *= WORLD.islandRadius / d;
    p[2] *= WORLD.islandRadius / d;
  }
}

function keepOutOfSafeZones(g, s) {
  const R = g.tuning.safe_radius;
  for (const l of g.lanterns) {
    if (!l.lit) continue;
    const dx = s.pos[0] - l.pos[0];
    const dz = s.pos[2] - l.pos[2];
    const d = Math.hypot(dx, dz);
    if (d <= R) {
      const ux = d > 1e-9 ? dx / d : 1;
      const uz = d > 1e-9 ? dz / d : 0;
      s.pos[0] = l.pos[0] + ux * (R + 0.001);
      s.pos[2] = l.pos[2] + uz * (R + 0.001);
    }
  }
}

export function timeLeft(g) {
  return g.t0 - g.tick / TICK_RATE;
}

function emit(g, name, data) {
  g.events.push({ type: 'event', tick: g.tick, name, data });
}

function endGame(g, result, reason) {
  g.state = result;
  g.result = { result, reason };
  if (result === 'won') {
    const sc = g.tuning.score;
    g.score += Math.floor(Math.max(0, timeLeft(g)) + 1e-9) * sc.per_second_left + g.player.flames * sc.per_flame_left;
  }
  emit(g, 'game_over', { result, reason });
}

/**
 * Advance one tick. `input` holds current levels: {move:[x,z], cam_yaw_deg, jump, interact, pulse}.
 * Returns the events produced in this step.
 */
export function step(g, input) {
  g.events = [];
  if (g.state !== 'playing') return g.events;
  const T = g.tuning;
  const p = g.player;
  g.tick += 1;

  // timers
  if (p.invuln > 0) p.invuln--;
  if (p.pulseCd > 0) p.pulseCd--;
  for (const s of g.shades) {
    if (s.stun > 0) {
      s.stun--;
      if (s.stun === 0) s.state = 'chase';
    }
  }

  const edge = (k) => !!input[k] && !g.prev[k];
  const jumpE = edge('jump');
  const interactE = edge('interact');
  const pulseE = edge('pulse');
  g.prev = { jump: !!input.jump, interact: !!input.interact, pulse: !!input.pulse };

  // movement
  let mx = Math.max(-1, Math.min(1, input.move?.[0] ?? 0));
  let mz = Math.max(-1, Math.min(1, input.move?.[1] ?? 0));
  const len = Math.hypot(mx, mz);
  if (len > 1) {
    mx /= len;
    mz /= len;
  }
  const th = ((input.cam_yaw_deg ?? 0) * Math.PI) / 180;
  const wx = mx * Math.cos(th) + mz * Math.sin(th);
  const wz = -mx * Math.sin(th) + mz * Math.cos(th);
  const v = T.player_speed / TICK_RATE;
  p.pos[0] += wx * v;
  p.pos[2] += wz * v;
  if (wx !== 0 || wz !== 0) p.facing = Math.atan2(wx, wz);
  clampToIsland(p.pos);
  if (jumpE && p.pos[1] <= 0) p.vy = WORLD.jumpSpeed;
  if (p.pos[1] > 0 || p.vy > 0) {
    p.pos[1] += p.vy / TICK_RATE;
    p.vy -= WORLD.gravity / TICK_RATE;
    if (p.pos[1] <= 0) {
      p.pos[1] = 0;
      p.vy = 0;
    }
  }

  // pickup
  for (let i = 0; i < g.motes.length && p.carried < T.carry_capacity; ) {
    if (hdist(g.motes[i].pos, p.pos) <= T.pickup_radius) {
      g.motes.splice(i, 1);
      p.carried++;
      g.score += T.score.per_mote;
      emit(g, 'mote_picked', { carried: p.carried });
    } else i++;
  }

  // interact / deposit
  if (interactE && p.carried > 0) {
    let best = null;
    let bestD = Infinity;
    for (const l of g.lanterns) {
      if (l.lit) continue;
      const d = hdist(l.pos, p.pos);
      if (d <= T.interact_radius && d < bestD) {
        best = l;
        bestD = d;
      }
    }
    if (best) {
      const amount = Math.min(p.carried, T.lantern_cost - best.deposited);
      p.carried -= amount;
      best.deposited += amount;
      emit(g, 'deposit', { lantern_id: best.id, amount, deposited: best.deposited });
      if (best.deposited >= T.lantern_cost) {
        best.lit = true;
        g.score += T.score.per_lantern;
        emit(g, 'lantern_lit', { lantern_id: best.id });
        for (const s of g.shades) keepOutOfSafeZones(g, s);
        if (g.lanterns.every((l) => l.lit)) {
          endGame(g, 'won', 'all_lit');
          return g.events;
        }
      }
    }
  }

  // shades chase
  const sv = T.shade_speed / TICK_RATE;
  for (const s of g.shades) {
    if (s.stun > 0) continue;
    const dx = p.pos[0] - s.pos[0];
    const dz = p.pos[2] - s.pos[2];
    const d = Math.hypot(dx, dz);
    if (d > 1e-9) {
      const m = Math.min(sv, d);
      s.pos[0] += (dx / d) * m;
      s.pos[2] += (dz / d) * m;
    }
    clampToIsland(s.pos);
    keepOutOfSafeZones(g, s);
  }

  // pulse
  if (pulseE && p.pulseCd === 0 && p.carried >= T.pulse_cost) {
    p.carried -= T.pulse_cost;
    p.pulseCd = ticksOf(T.pulse_cooldown_s);
    const ids = [];
    for (const s of g.shades) {
      const dx = s.pos[0] - p.pos[0];
      const dz = s.pos[2] - p.pos[2];
      const d = Math.hypot(dx, dz);
      if (d > T.pulse_radius) continue;
      const ux = d > 1e-9 ? dx / d : 1;
      const uz = d > 1e-9 ? dz / d : 0;
      s.pos[0] += ux * T.pulse_push_m;
      s.pos[2] += uz * T.pulse_push_m;
      clampToIsland(s.pos);
      keepOutOfSafeZones(g, s);
      s.stun = ticksOf(T.pulse_stun_s);
      s.state = 'stunned';
      g.score += T.score.per_stun;
      ids.push(s.id);
    }
    emit(g, 'pulse', { stunned_ids: ids });
  }

  // hit
  if (p.invuln === 0) {
    const hitter = g.shades.find((s) => s.stun === 0 && hdist(s.pos, p.pos) <= T.shade_hit_radius);
    if (hitter) {
      const dropped = Math.floor(p.carried * T.hit_drop_ratio);
      p.carried -= dropped;
      p.flames -= 1;
      p.invuln = ticksOf(T.invuln_s);
      emit(g, 'player_hit', { by: 'shade', flames: p.flames, dropped });
      if (p.flames <= 0) {
        endGame(g, 'lost', 'no_flames');
        return g.events;
      }
    }
  }

  // spawning
  if (g.randomMotes) {
    if (++g.moteTimer >= ticksOf(WORLD.moteRespawnS)) {
      g.moteTimer = 0;
      if (g.motes.length < WORLD.moteMin) addMote(g, randomMotePos(g));
    }
  }
  if (g.randomShades) {
    if (++g.shadeTimer >= ticksOf(WORLD.shadeSpawnS)) {
      g.shadeTimer = 0;
      if (g.shades.length < WORLD.shadeMax) {
        const s = makeShade(`S${g.nextShade++}`, randomShadePos(g));
        keepOutOfSafeZones(g, s);
        g.shades.push(s);
        emit(g, 'shade_spawned', { id: s.id });
      }
    }
  }

  // dawn
  if (timeLeft(g) <= 1e-9) endGame(g, 'lost', 'dawn');
  return g.events;
}

export function snapshot(g) {
  return {
    type: 'snapshot',
    tick: g.tick,
    sim_tick: g.tick,
    state: g.state,
    time_left_s: r3(Math.max(0, timeLeft(g))),
    score: g.score,
    player: { pos: r3v(g.player.pos), flames: g.player.flames, carried: g.player.carried },
    lanterns: g.lanterns.map((l) => ({ id: l.id, pos: r3v(l.pos), lit: l.lit, deposited: l.deposited })),
    shades: g.shades.map((s) => ({ id: s.id, pos: r3v(s.pos), state: s.state })),
    motes_active: g.motes.length,
    motes: g.motes.map((m) => ({ id: m.id, pos: r3v(m.pos) })),
  };
}
