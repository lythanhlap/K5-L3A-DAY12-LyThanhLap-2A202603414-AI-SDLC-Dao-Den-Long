// Pure, deterministic simulation of Đảo Đèn Lồng (Contract v1.2, nights 1-3).
// No DOM / Three.js imports: used by both the headless CLI and the web renderer.
// Step order follows Ticket-02 "Thứ tự xử lý trong một tick" (numbered comments below).
import { TICK_RATE, TUNING, RULES as R } from './tuning.js';
import { NIGHTS } from './maps.js';

export { NIGHTS };

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

export const r3 = (x) => {
  const v = Math.round(x * 1000) / 1000;
  return v === 0 ? 0 : v; // avoid -0
};
const r3v = (p) => [r3(p[0]), r3(p[1]), r3(p[2])];
const hdist = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const ticksOf = (s) => Math.round(s * TICK_RATE);
const DASH_TICKS = ticksOf(TUNING.dash_duration_s);
// Fuel is stored as integer units of 1/60 (Ticket-03: avoid float drift); 6000 = 100.0
const FUEL_MAX_U = TUNING.fuel_max * TICK_RATE;
const FUEL_LOW_U = TUNING.low_fuel_threshold * TICK_RATE;
const FUEL_PER_MOTE_U = TUNING.fuel_per_mote * TICK_RATE;
const DECAY_U = Math.round(TUNING.fuel_decay_per_s); // per tick, in 1/60 units
const DRAIN_U = Math.round(TUNING.drain_per_s); // per tick per draining shade
const r1 = (x) => Math.round(x * 10) / 10;
export const fuelOf = (l) => l.fuelU / TICK_RATE;
export const lightCost = (l) => (l.everLit ? TUNING.relight_cost : TUNING.lantern_cost);
export const capacityOf = (g) => Math.min(TUNING.capacity_max, TUNING.carry_capacity + R.capacityPerLight * g.successfulLights);
export const winThreshold = (g) => Math.ceil(TUNING.win_ratio * g.lanterns.length - 1e-9);
export const isWeak = (l) => l.lit && l.fuelU < FUEL_LOW_U;

export class ScenarioError extends Error {}

// ---------------------------------------------------------------- setup
/**
 * Opt-in "easy mode" for the playable game only (Settings → Chế độ dễ). OFF by default and never used
 * by the headless CLI, so the Ticket-02 standard numbers (20 motes, cap 30, +1 every 240 ticks) and the
 * hidden tests are unaffected. Extra motes are scattered 1.5-4 m around the standard spawn points.
 */
export const ASSIST = Object.freeze({ extraInitial: 25, cap: 60, spawnEvery: 120, spawnBatch: 2 });

export function createGame({ seed = 1, night = 1, scenario = null, bench = false, assist = false } = {}) {
  const map = NIGHTS[night];
  if (!map) throw new ScenarioError(`unknown night ${night}`);
  const T = TUNING;
  const g = {
    night,
    map,
    bench, // Ticket-04 bench scene: no spawns, damage, pickup, fuel decay or night end
    assist, // easy mode (web only): more motes
    rand: mulberry32(seed),
    tick: 0,
    simTick: 0,
    state: 'playing',
    paused: false,
    result: null,
    score: 0,
    t0: map.duration,
    player: {
      pos: [...map.start],
      vel: [0, 0, 0],
      grounded: true,
      facing: 0, // atan2(x, z): 0 = +Z
      flames: T.flames,
      carried: 0,
      invuln: 0,
      dashCd: 0,
      pulseCd: 0,
      charm: 0,
      dashTicks: 0,
      dashDir: [0, 1],
      launch: null,
      respawn: 0,
    },
    prev: { jump: false, interact: false, pulse: false, dash: false, pause: false },
    lanterns: map.lanterns.map((pos, i) => ({ id: `L${i + 1}`, pos: [...pos], lit: false, deposited: 0, fuelU: 0, everLit: false, relitCount: 0 })),
    successfulLights: 0,
    motes: [],
    shades: [],
    drifters: [],
    charms: map.charms.map((pos, i) => ({ id: `C${i + 1}`, pos: [...pos], available: true, respawn: 0 })),
    nextMote: 1,
    nextShade: 1,
    nextDrifter: 1,
    randomMotes: true,
    randomShades: true,
    randomDrifters: map.drifters,
    windEnabled: map.wind,
    wind: { active: false, dir: 0, t: 0 },
    events: [],
  };

  const sc = scenario || {};
  if (sc.random_motes === false) g.randomMotes = false;
  if (sc.random_shades === false) g.randomShades = false;
  if (sc.random_drifters === false) g.randomDrifters = false;
  if (sc.random_drifters === true) g.randomDrifters = true;
  if (sc.wind_enabled != null) g.windEnabled = !!sc.wind_enabled;
  const p = g.player;
  if (sc.player) {
    const sp = sc.player;
    if (sp.pos) p.pos = [...sp.pos];
    if (sp.carried != null) p.carried = sp.carried;
    if (sp.flames != null) p.flames = sp.flames;
    if (sp.invuln_ticks != null) p.invuln = sp.invuln_ticks;
    if (sp.dash_cd_ticks != null) p.dashCd = sp.dash_cd_ticks;
    if (sp.pulse_cd_ticks != null) p.pulseCd = sp.pulse_cd_ticks;
    if (sp.charm_ticks != null) p.charm = sp.charm_ticks;
    if (sp.successful_lights != null) g.successfulLights = sp.successful_lights;
  }
  const gh = map.ground(p.pos[0], p.pos[2]);
  p.grounded = gh != null && Math.abs(p.pos[1] - gh) <= 1e-6;
  if (sc.time_left_s != null) g.t0 = sc.time_left_s;

  for (const l of sc.lanterns || []) {
    const target = g.lanterns.find((x) => x.id === l.id);
    if (!target) throw new ScenarioError(`unknown lantern id ${l.id} for night ${night}`);
    if (l.pos) target.pos = [...l.pos];
    if (l.deposited != null) target.deposited = l.deposited;
    if (l.ever_lit != null) target.everLit = !!l.ever_lit;
    if (l.lit != null) target.lit = !!l.lit;
    else if (l.fuel != null) target.lit = l.fuel > 0;
    if (!target.lit && target.deposited >= lightCost(target)) target.lit = true;
    if (target.lit) {
      target.everLit = true;
      target.fuelU = l.fuel != null ? Math.round(Math.min(T.fuel_max, l.fuel) * TICK_RATE) : FUEL_MAX_U;
    } else target.fuelU = 0;
  }

  if (sc.motes) {
    for (const m of sc.motes) {
      const pos = Array.isArray(m) ? m : m.pos;
      const kind = (!Array.isArray(m) && m.kind) || 'random';
      const ttl = !Array.isArray(m) && m.ttl_ticks != null ? m.ttl_ticks : kind === 'dropped' ? R.droppedTtl : null;
      addMote(g, pos, kind, ttl, -1, -1);
    }
  } else if (g.randomMotes) {
    const idx = map.moteSpawns.map((_, i) => i);
    shuffle(g, idx);
    for (const i of idx.slice(0, R.moteInitial)) addMote(g, map.moteSpawns[i], 'random', null, i, -1);
    if (assist) for (let i = 0; i < ASSIST.extraInitial; i++) addAssistMote(g, -1);
  }

  if (sc.shades) {
    const used = new Set(sc.shades.filter((s) => s.id).map((s) => s.id));
    for (const s of sc.shades) {
      let id = s.id;
      if (!id) {
        while (used.has(`S${g.nextShade}`)) g.nextShade++;
        id = `S${g.nextShade++}`;
        used.add(id);
      }
      const sh = makeShade(g, id, s.pos);
      if (s.target_lantern_id) sh.targetLantern = s.target_lantern_id;
      if (s.state) {
        sh.state = s.state;
        sh.t = s.state_ticks_left ?? defaultStateTicks(s.state);
      } else sh.state = hdist(sh.pos, p.pos) <= R.shadeDetect ? 'chase' : 'wander';
      g.shades.push(sh);
    }
    while (used.has(`S${g.nextShade}`)) g.nextShade++;
  }

  if (sc.drifters) {
    for (const d of sc.drifters) {
      const id = d.id || `D${g.nextDrifter}`;
      g.nextDrifter = Math.max(g.nextDrifter, Number(id.slice(1)) + 1 || g.nextDrifter + 1);
      const dr = makeDrifter(g, id, d.pos);
      if (d.state) dr.state = d.state;
      if (d.stolen != null) {
        dr.stolen = d.stolen;
        dr.hasStolen = d.stolen > 0;
      }
      if (dr.state === 'flee') dr.t = d.state_ticks_left ?? R.drifterFleeTicks;
      g.drifters.push(dr);
    }
  }
  if (sc.charms) {
    g.charms = sc.charms.map((c, i) => ({
      id: c.id || `C${i + 1}`,
      pos: [...(c.pos || map.charms[i] || [0, 0, 0])],
      available: c.available ?? true,
      respawn: c.respawn_ticks ?? (c.available === false ? R.charmRespawn : 0),
    }));
  }
  return g;
}

function defaultStateTicks(state) {
  return { spawning: R.spawningTicks, stunned: ticksOf(TUNING.pulse_stun_s), recoil: R.recoilTicks }[state] ?? 0;
}

function shuffle(g, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(g.rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function addMote(g, pos, kind, ttl, spawnIdx, born) {
  const m = { id: `M${g.nextMote++}`, pos: [pos[0], pos[1] ?? 0, pos[2]], kind, ttl, spawnIdx, born };
  g.motes.push(m);
  return m;
}

/** Easy mode: a mote 1.5-4 m from a random standard spawn point, on walkable ground. */
function addAssistMote(g, born) {
  for (let k = 0; k < 6; k++) {
    const base = g.map.moteSpawns[Math.floor(g.rand() * g.map.moteSpawns.length)];
    const a = g.rand() * 2 * Math.PI;
    const r = 1.5 + g.rand() * 2.5;
    const x = r3(base[0] + r * Math.cos(a));
    const z = r3(base[2] + r * Math.sin(a));
    const gh = g.map.ground(x, z);
    if (gh == null || g.map.solid(x, z, gh)) continue;
    addMote(g, [x, gh, z], 'random', null, -1, born);
    return;
  }
}

function makeShade(g, id, pos) {
  const gh = g.map.ground(pos[0], pos[2]) ?? 0;
  return { id, pos: [...pos], hoff: pos[1] - gh, state: 'wander', t: 0, push: null, pushLeft: 0, evict: 0, recoilDir: null, target: null, targetLantern: null, drainTicks: 0 };
}

function makeDrifter(g, id, pos) {
  return { id, pos: [...pos], state: 'idle', stolen: 0, hasStolen: false, t: 0 };
}

// ---------------------------------------------------------------- helpers
export function timeLeft(g) {
  return g.t0 - g.simTick / TICK_RATE;
}

function emit(g, name, data) {
  g.events.push({ type: 'event', tick: g.tick, name, data });
}

function inSafeZone(g, x, z) {
  for (const l of g.lanterns) if (l.lit && l.fuelU >= FUEL_LOW_U && Math.hypot(x - l.pos[0], z - l.pos[2]) < TUNING.safe_radius + 0.0005) return l; // inclusive edge + margin so rounded output stays >= r + 0.001
  return null;
}

/** Try to move a shade-like entity horizontally; safe zones clamp to the edge, void/tower block. */
function moveShade(g, s, dx, dz) {
  let nx = s.pos[0] + dx;
  let nz = s.pos[2] + dz;
  const l = inSafeZone(g, nx, nz);
  if (l) {
    const ux = nx - l.pos[0];
    const uz = nz - l.pos[2];
    const d = Math.hypot(ux, uz) || 1;
    nx = l.pos[0] + (ux / d) * (TUNING.safe_radius + 0.001);
    nz = l.pos[2] + (uz / d) * (TUNING.safe_radius + 0.001);
    if (inSafeZone(g, nx, nz)) return false;
  }
  const gh = g.map.ground(nx, nz);
  if (gh == null || g.map.solid(nx, nz, gh)) return false;
  s.pos[0] = nx;
  s.pos[2] = nz;
  s.pos[1] = gh + s.hoff;
  return true;
}

function resolveShadeState(g, s) {
  s.state = hdist(s.pos, g.player.pos) <= R.shadeDetect ? 'chase' : 'wander';
}

function nearestLantern(g, s, pred) {
  let best = null;
  let bd = Infinity;
  for (const l of g.lanterns) {
    if (!pred(l)) continue;
    const d = hdist(s.pos, l.pos);
    if (d < bd) {
      bd = d;
      best = l;
    }
  }
  return best;
}

/** Ticket-03: a wandering shade heads for the nearest weak lit lantern, else the nearest unlit one. */
function wanderLantern(g, s) {
  const cur = s.targetLantern && g.lanterns.find((x) => x.id === s.targetLantern);
  if (cur && isWeak(cur)) return cur;
  return nearestLantern(g, s, isWeak) || nearestLantern(g, s, (l) => !l.lit);
}

function startEviction(g, l) {
  for (const s of g.shades) {
    if (hdist(s.pos, l.pos) >= TUNING.safe_radius + 0.0005) continue;
    s.evict = R.safeEvictTicks;
    if (s.state === 'drain') {
      s.state = 'wander'; // fuel back to >= 30: draining stops (Ticket-03)
      s.drainTicks = 0;
    }
  }
}

function playerBlocked(g, x, z, y) {
  if (g.map.solid(x, z, y)) return true;
  const gh = g.map.ground(x, z);
  return gh != null && gh > y + R.stepUp;
}

function respawnPlayer(g) {
  const p = g.player;
  p.pos = [...g.map.start];
  p.vel = [0, 0, 0];
  p.grounded = true;
  p.launch = null;
  p.dashTicks = 0;
  p.facing = 0;
  p.invuln = ticksOf(TUNING.invuln_s);
}

function dropMotes(g, n, center, born) {
  for (let i = 0; i < n; i++) {
    const a = g.rand() * 2 * Math.PI;
    const r = R.dropRingMin + g.rand() * (R.dropRingMax - R.dropRingMin);
    const x = r3(center[0] + r * Math.cos(a));
    const z = r3(center[2] + r * Math.sin(a));
    const gh = g.map.ground(x, z);
    addMote(g, [x, gh ?? center[1], z], 'dropped', R.droppedTtl, -1, born);
  }
}

function endGame(g, result, reason) {
  g.state = result;
  g.result = { result, reason };
  if (result === 'won') {
    for (const l of g.lanterns) if (l.lit) g.score += R.dawnPerLantern + Math.floor(fuelOf(l) + 1e-9);
    g.score += g.player.flames * TUNING.score.per_flame_left;
  }
  emit(g, 'game_over', { result, reason });
}

// ---------------------------------------------------------------- step
/**
 * Advance one tick. `input` holds current levels:
 * {move:[x,z], cam_yaw_deg, jump, interact, pulse, dash, pause}. Returns this step's events.
 */
export function step(g, input) {
  g.events = [];
  if (g.state === 'won' || g.state === 'lost') return g.events;
  const T = TUNING;
  const p = g.player;
  g.tick += 1;

  // 1. input (pause first)
  const edge = (k) => !!input[k] && !g.prev[k];
  const E = { jump: edge('jump'), interact: edge('interact'), pulse: edge('pulse'), dash: edge('dash'), pause: edge('pause') };
  for (const k of Object.keys(g.prev)) g.prev[k] = !!input[k];
  if (E.pause) {
    g.paused = !g.paused;
    emit(g, g.paused ? 'paused' : 'resumed', {});
    if (g.paused) return g.events;
  } else if (g.paused) return g.events;
  g.simTick += 1;

  // 2. timers
  if (p.invuln > 0) p.invuln--;
  if (p.dashCd > 0) p.dashCd--;
  if (p.pulseCd > 0) p.pulseCd--;
  if (p.charm > 0) p.charm--;
  for (const s of g.shades) {
    // recoil counts down in step 8 after moving, so it moves exactly recoilTicks times (2.000 m)
    if ((s.state === 'spawning' || s.state === 'stunned') && s.t > 0) {
      s.t--;
      if (s.t === 0) {
        if (s.state === 'stunned') s.state = 'wander'; // Ticket-03: stun always ends in wander
        else resolveShadeState(g, s);
      }
    }
  }
  for (let i = g.motes.length - 1; i >= 0; i--) {
    const m = g.motes[i];
    if (m.ttl != null && --m.ttl <= 0) g.motes.splice(i, 1);
  }
  for (const c of g.charms) if (!c.available && c.respawn > 0 && --c.respawn === 0) c.available = true;
  for (const d of g.drifters) {
    if (d.state === 'flee' && --d.t <= 0) {
      d.state = 'removed';
      d.stolen = 0;
    }
  }
  // Ticket-03: fuel decay + drain (step 2), then lanterns at fuel <= 0 go out (off in the bench scene)
  if (!g.bench) for (const l of g.lanterns) if (l.lit) l.fuelU -= DECAY_U;
  for (const s of g.shades) {
    if (s.state !== 'drain' || g.bench) continue;
    const l = g.lanterns.find((x) => x.id === s.targetLantern);
    if (!l || !l.lit) continue;
    l.fuelU -= DRAIN_U;
    s.drainTicks++;
    if (s.drainTicks % R.fuelDrainEventEvery === 0) emit(g, 'fuel_drain', { lantern_id: l.id, shade_id: s.id, fuel: r1(Math.max(0, fuelOf(l))) });
  }
  for (const l of g.lanterns) {
    if (l.lit && l.fuelU <= 0) {
      l.lit = false;
      l.fuelU = 0;
      l.deposited = 0;
      l.everLit = true;
      emit(g, 'lantern_out', { lantern_id: l.id });
    }
  }
  let waiting = false;
  if (p.respawn > 0) {
    waiting = true;
    if (--p.respawn === 0) respawnPlayer(g);
  }

  // 3. move player (jump, dash, pads, wind) then fall check
  let hitThisTick = false;
  if (!waiting) {
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
    const moving = wx !== 0 || wz !== 0;

    if (E.dash && p.dashTicks === 0 && (p.dashCd === 0 || p.charm > 0)) {
      const wl = Math.hypot(wx, wz);
      p.dashDir = moving ? [wx / wl, wz / wl] : [Math.sin(p.facing), Math.cos(p.facing)];
      p.dashTicks = DASH_TICKS;
      p.dashCd = p.charm > 0 ? 0 : ticksOf(T.dash_cooldown_s);
      emit(g, 'dash', {});
    }
    if (E.jump && p.grounded) {
      p.vel[1] = R.jumpSpeed;
      p.grounded = false;
    }

    let hx;
    let hz;
    const dashing = p.dashTicks > 0;
    if (dashing) {
      hx = p.dashDir[0] * T.dash_speed;
      hz = p.dashDir[1] * T.dash_speed;
      p.dashTicks--;
    } else if (p.launch) {
      [hx, hz] = p.launch;
    } else {
      const sp = p.charm > 0 ? R.charmSpeed : T.player_speed;
      hx = wx * sp;
      hz = wz * sp;
    }
    if (moving && !dashing && !p.launch) p.facing = Math.atan2(wx, wz);
    if (g.wind.active) {
      const a = (g.wind.dir * Math.PI) / 180;
      hx += Math.cos(a) * R.windSpeed;
      hz += Math.sin(a) * R.windSpeed;
    }

    // horizontal with wall/tower collision (axis-separated slide)
    const ox = p.pos[0];
    const oz = p.pos[2];
    const nx = ox + hx / TICK_RATE;
    const nz = oz + hz / TICK_RATE;
    if (!playerBlocked(g, nx, nz, p.pos[1])) {
      p.pos[0] = nx;
      p.pos[2] = nz;
    } else if (!playerBlocked(g, nx, oz, p.pos[1])) p.pos[0] = nx;
    else if (!playerBlocked(g, ox, nz, p.pos[1])) p.pos[2] = nz;

    // vertical
    const gh = g.map.ground(p.pos[0], p.pos[2]);
    if (p.grounded) {
      if (gh == null || gh < p.pos[1] - R.stepUp) {
        p.grounded = false;
        p.vel[1] = 0;
      } else p.pos[1] = gh;
    }
    if (!p.grounded) {
      if (dashing) p.vel[1] = 0; // dash keeps height
      else {
        p.pos[1] += p.vel[1] / TICK_RATE;
        p.vel[1] -= R.gravity / TICK_RATE;
        const gh2 = g.map.ground(p.pos[0], p.pos[2]);
        if (gh2 != null && p.pos[1] <= gh2 && p.pos[1] >= gh2 - 1) {
          p.pos[1] = gh2;
          p.vel[1] = 0;
          p.grounded = true;
          p.launch = null;
        }
      }
    }
    p.vel[0] = (p.pos[0] - ox) * TICK_RATE;
    p.vel[2] = (p.pos[2] - oz) * TICK_RATE;
    if (p.grounded) p.vel[1] = 0;

    // jump pads
    if (p.grounded) {
      for (const pad of g.map.pads) {
        if (Math.hypot(p.pos[0] - pad.pos[0], p.pos[2] - pad.pos[2]) <= pad.r && Math.abs(p.pos[1] - pad.pos[1]) < 0.05) {
          let dx;
          let dz;
          if (pad.target) {
            dx = pad.target[0] - p.pos[0];
            dz = pad.target[1] - p.pos[2];
          } else [dx, dz] = pad.dir;
          const dl = Math.hypot(dx, dz) || 1;
          p.launch = [(dx / dl) * pad.vh, (dz / dl) * pad.vh];
          p.vel[1] = pad.vy;
          p.grounded = false;
          break;
        }
      }
    }

    if (p.pos[1] < R.fallY) {
      p.flames -= 1;
      const lost = p.carried;
      p.carried = 0;
      p.respawn = R.respawnWait;
      p.vel = [0, 0, 0];
      p.dashTicks = 0;
      p.launch = null;
      hitThisTick = true;
      waiting = true;
      emit(g, 'player_hit', { by: 'fall', flames: p.flames, dropped: 0, lost });
    }
  }

  // the gust counts down after pushing, so it pushes for exactly windTicks steps (2 m/s × 5 s = 10 m)
  if (g.wind.active && --g.wind.t <= 0) g.wind.active = false;

  // 4. pickup motes + charms
  if (!waiting && !g.bench) {
    const cap = capacityOf(g);
    for (let i = 0; i < g.motes.length && p.carried < cap; ) {
      const m = g.motes[i];
      if (m.born < g.simTick && hdist(m.pos, p.pos) <= T.pickup_radius && Math.abs(p.pos[1] - m.pos[1]) <= R.pickupMaxDy) {
        g.motes.splice(i, 1);
        p.carried++;
        emit(g, 'mote_picked', { carried: p.carried });
      } else i++;
    }
    for (const c of g.charms) {
      if (c.available && hdist(c.pos, p.pos) <= T.pickup_radius && Math.abs(p.pos[1] - c.pos[1]) <= R.pickupMaxDy) {
        c.available = false;
        c.respawn = R.charmRespawn;
        p.charm = R.charmTicks;
        emit(g, 'charm_picked', { charm_id: c.id, charm_ticks: R.charmTicks });
      }
    }
  }

  // 5. interact with lanterns: light / relight an unlit one, or refuel a lit one that is not full
  if (!waiting && E.interact && p.carried > 0) {
    let best = null;
    let bestD = Infinity;
    for (const l of g.lanterns) {
      if (l.lit && l.fuelU >= FUEL_MAX_U) continue; // full: not selectable
      const d = hdist(l.pos, p.pos);
      if (d <= T.interact_radius && d < bestD) {
        best = l;
        bestD = d;
      }
    }
    if (best && best.lit) {
      const used = Math.min(p.carried, Math.ceil((FUEL_MAX_U - best.fuelU) / FUEL_PER_MOTE_U));
      const wasWeak = best.fuelU < FUEL_LOW_U;
      p.carried -= used;
      best.fuelU = Math.min(FUEL_MAX_U, best.fuelU + FUEL_PER_MOTE_U * used);
      g.score += used * T.score.per_mote;
      emit(g, 'refuel', { lantern_id: best.id, amount: used, fuel: r1(fuelOf(best)) });
      if (wasWeak && best.fuelU >= FUEL_LOW_U) startEviction(g, best);
    } else if (best) {
      const cost = lightCost(best);
      const amount = Math.min(p.carried, cost - best.deposited);
      p.carried -= amount;
      best.deposited += amount;
      g.score += amount * T.score.per_mote;
      emit(g, 'deposit', { lantern_id: best.id, amount, deposited: best.deposited });
      if (best.deposited >= cost) {
        const relight = best.everLit;
        best.lit = true;
        best.everLit = true;
        best.fuelU = FUEL_MAX_U;
        if (relight) best.relitCount++;
        g.successfulLights++;
        g.score += relight ? R.relightScore : T.score.per_lantern;
        emit(g, 'lantern_lit', { lantern_id: best.id, relight });
        startEviction(g, best);
      }
    }
  }

  // 6. safe zones: shades caught inside a newly lit zone are pushed out within <= 30 ticks
  for (const s of g.shades) {
    if (s.evict <= 0) continue;
    const l = inSafeZone(g, s.pos[0], s.pos[2]);
    if (!l) {
      s.evict = 0;
      continue;
    }
    let ux = s.pos[0] - l.pos[0];
    let uz = s.pos[2] - l.pos[2];
    const d = Math.hypot(ux, uz);
    if (d < 1e-9) [ux, uz] = [1, 0];
    else [ux, uz] = [ux / d, uz / d];
    const stepLen = (T.safe_radius + 0.001 - d) / s.evict;
    s.pos[0] += ux * stepLen;
    s.pos[2] += uz * stepLen;
    const gh = g.map.ground(s.pos[0], s.pos[2]);
    if (gh != null) s.pos[1] = gh + s.hoff;
    s.evict--;
  }

  // 7. pulse
  if (!waiting && E.pulse && p.pulseCd === 0 && p.carried >= T.pulse_cost) {
    p.carried -= T.pulse_cost;
    p.pulseCd = ticksOf(T.pulse_cooldown_s);
    const c = [p.pos[0], p.pos[1] + R.pulseCenterDy, p.pos[2]];
    const d3 = (q) => Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2]);
    const ids = [];
    for (const s of g.shades) {
      if (d3(s.pos) > T.pulse_radius) continue;
      let ux = s.pos[0] - p.pos[0];
      let uz = s.pos[2] - p.pos[2];
      const d = Math.hypot(ux, uz);
      if (d < 1e-9) [ux, uz] = [1, 0];
      else [ux, uz] = [ux / d, uz / d];
      g.score += s.state === 'drain' ? R.drainStunScore : T.score.per_stun;
      s.drainTicks = 0;
      s.state = 'stunned';
      s.t = ticksOf(T.pulse_stun_s);
      s.push = [ux, uz];
      s.pushLeft = R.pulsePushTicks; // keep s.evict: a shade being evicted stays harmless until it is out
      ids.push(s.id);
    }
    emit(g, 'pulse', { stunned_ids: ids });
    for (const d of g.drifters) {
      if (d3(d.pos) > T.pulse_radius) continue;
      if (d.state === 'chase') {
        d.state = 'flee';
        d.t = R.drifterFleeTicks;
      } else if (d.state === 'flee' && d.stolen > 0) {
        const amount = d.stolen;
        for (let i = 0; i < amount; i++) {
          const gh = g.map.ground(d.pos[0], d.pos[2]);
          addMote(g, [r3(d.pos[0]), gh ?? p.pos[1], r3(d.pos[2])], 'dropped', R.droppedTtl, -1, g.simTick);
        }
        d.stolen = 0;
        d.t = Math.min(d.t, R.drifterDropVanish);
        emit(g, 'drifter_drop', { drifter_id: d.id, amount });
      }
    }
  }

  // 8. move shades + drifters
  const speed = g.map.shadeSpeed / TICK_RATE;
  for (const s of g.shades) {
    if (s.evict > 0) continue;
    const dp = hdist(s.pos, p.pos);
    if (s.state === 'stunned') {
      if (s.pushLeft > 0) {
        const k = T.pulse_push_m / R.pulsePushTicks;
        if (!moveShade(g, s, s.push[0] * k, s.push[1] * k)) s.pushLeft = 0;
        else s.pushLeft--;
      }
      continue;
    }
    if (s.state === 'spawning') continue;
    if (s.state === 'recoil') {
      if (!s.recoilDir) s.recoilDir = dp > 1e-9 ? [(s.pos[0] - p.pos[0]) / dp, (s.pos[2] - p.pos[2]) / dp] : [1, 0];
      const k = R.recoilDist / R.recoilTicks;
      moveShade(g, s, s.recoilDir[0] * k, s.recoilDir[1] * k);
      if (--s.t <= 0) resolveShadeState(g, s);
      continue;
    }
    if (s.state === 'drain') {
      const l = g.lanterns.find((x) => x.id === s.targetLantern);
      if (dp <= R.drainChaseRange) s.state = 'chase';
      else if (!l || !isWeak(l) || hdist(s.pos, l.pos) > R.drainRange) s.state = 'wander';
      else continue; // keeps draining, does not move
      s.drainTicks = 0;
    }
    if (s.state === 'wander' && dp <= R.shadeDetect && !g.bench) s.state = 'chase'; // bench: shades keep wandering
    else if (s.state === 'chase' && dp > R.shadeLose) s.state = 'wander';
    if (s.state === 'chase') {
      if (dp > 1e-9) {
        const m = Math.min(speed, dp);
        moveShade(g, s, ((p.pos[0] - s.pos[0]) / dp) * m, ((p.pos[2] - s.pos[2]) / dp) * m);
      }
      continue;
    }
    // wander (Ticket-03): head for a weak lantern (then drain) or an unlit one; otherwise drift
    const lt = wanderLantern(g, s);
    if (lt) {
      s.targetLantern = lt.id;
      const dl = hdist(s.pos, lt.pos);
      if (dl > 1e-9 && !(isWeak(lt) && dl <= R.drainRange)) {
        const m = Math.min(speed, dl);
        moveShade(g, s, ((lt.pos[0] - s.pos[0]) / dl) * m, ((lt.pos[2] - s.pos[2]) / dl) * m);
      }
      if (isWeak(lt) && hdist(s.pos, lt.pos) <= R.drainRange) {
        s.state = 'drain';
        s.drainTicks = 0;
      }
    } else {
      s.targetLantern = null;
      if (!s.target || hdist(s.pos, s.target) < 0.5) s.target = g.map.moteSpawns[Math.floor(g.rand() * g.map.moteSpawns.length)];
      const dt = hdist(s.pos, s.target);
      const m = Math.min(R.wanderSpeed / TICK_RATE, dt);
      if (dt > 1e-9 && !moveShade(g, s, ((s.target[0] - s.pos[0]) / dt) * m, ((s.target[2] - s.pos[2]) / dt) * m)) s.target = null;
    }
  }
  for (const d of g.drifters) {
    if (d.state === 'removed') continue;
    const dp = hdist(d.pos, p.pos);
    if (d.state === 'idle' || d.state === 'chase') {
      const want = !d.hasStolen && !waiting && p.carried >= R.drifterChaseCarry && dp <= R.drifterChaseDist;
      d.state = want ? 'chase' : 'idle';
    }
    let dx = 0;
    let dz = 0;
    if (d.state === 'chase' && dp > 1e-9) {
      const m = Math.min(R.drifterSpeed / TICK_RATE, dp);
      dx = ((p.pos[0] - d.pos[0]) / dp) * m;
      dz = ((p.pos[2] - d.pos[2]) / dp) * m;
    } else if (d.state === 'flee') {
      const m = R.drifterSpeed / TICK_RATE;
      dx = dp > 1e-9 ? ((d.pos[0] - p.pos[0]) / dp) * m : m;
      dz = dp > 1e-9 ? ((d.pos[2] - p.pos[2]) / dp) * m : 0;
    } else if (d.state === 'idle') {
      const c = g.map.centers.reduce((a, b) => (Math.hypot(d.pos[0] - b[0], d.pos[2] - b[1]) < Math.hypot(d.pos[0] - a[0], d.pos[2] - a[1]) ? b : a));
      const rx = d.pos[0] - c[0];
      const rz = d.pos[2] - c[1];
      const rl = Math.hypot(rx, rz) || 1;
      const m = R.drifterIdleSpeed / TICK_RATE;
      dx = (-rz / rl) * m;
      dz = (rx / rl) * m;
    }
    d.pos[0] += dx;
    d.pos[2] += dz;
    const gh = g.map.ground(d.pos[0], d.pos[2]);
    if (gh != null) d.pos[1] = gh + R.drifterY;
  }

  // 9. touch: drifters steal first, then shade hits (ascending id)
  if (!waiting && !g.bench) {
    const byId = (a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1));
    for (const d of [...g.drifters].sort(byId)) {
      if ((d.state === 'idle' || d.state === 'chase') && !d.hasStolen && p.carried > 0 && hdist(d.pos, p.pos) <= R.drifterTouch) {
        const amount = Math.min(R.drifterStealMax, p.carried);
        p.carried -= amount;
        d.stolen = amount;
        d.hasStolen = true;
        d.state = 'flee';
        d.t = R.drifterFleeTicks;
        emit(g, 'drifter_steal', { drifter_id: d.id, amount, carried: p.carried });
      }
    }
    for (const s of [...g.shades].sort(byId)) {
      if (hitThisTick) break;
      if (s.evict > 0 || (s.state !== 'chase' && s.state !== 'wander')) continue;
      if (hdist(s.pos, p.pos) > T.shade_hit_radius || Math.abs(s.pos[1] - p.pos[1]) > R.shadeHitMaxDy) continue;
      if (p.invuln > 0) continue; // touching an invulnerable Mây does nothing
      const dropped = Math.floor(p.carried * T.hit_drop_ratio);
      p.carried -= dropped;
      p.flames -= 1;
      p.invuln = ticksOf(T.invuln_s);
      dropMotes(g, dropped, p.pos, g.simTick);
      let ux = s.pos[0] - p.pos[0];
      let uz = s.pos[2] - p.pos[2];
      const dl = Math.hypot(ux, uz);
      s.recoilDir = dl > 1e-9 ? [ux / dl, uz / dl] : [1, 0];
      s.state = 'recoil';
      s.t = R.recoilTicks;
      hitThisTick = true;
      emit(g, 'player_hit', { by: 'shade', flames: p.flames, dropped });
    }
  }

  // 10. scheduled spawns (new entities interact from the next tick)
  const st = g.simTick;
  if (g.bench) return g.events; // bench: no scheduled spawns, no win/lose
  if (g.assist && g.randomMotes && st % ASSIST.spawnEvery === 0) {
    for (let n = 0; n < ASSIST.spawnBatch && g.motes.length < ASSIST.cap; n++) addAssistMote(g, st);
  }
  if (!g.assist && g.randomMotes && st % R.moteSpawnEvery === 0 && g.motes.length < R.moteCap) {
    const used = new Set(g.motes.map((m) => m.spawnIdx));
    const free = g.map.moteSpawns.map((_, i) => i).filter((i) => !used.has(i));
    if (free.length) {
      const i = free[Math.floor(g.rand() * free.length)];
      addMote(g, g.map.moteSpawns[i], 'random', null, i, st);
    }
  }
  if (g.randomShades && st >= R.shadeFirstSpawnTick && (st - R.shadeFirstSpawnTick) % g.map.shadeEvery === 0) {
    const count = st === R.shadeFirstSpawnTick ? 2 : 1;
    for (let n = 0; n < count && g.shades.length < g.map.shadeMax; n++) {
      const cands = g.map.shadeSpawns.filter((q) => hdist(q, p.pos) >= R.shadeSpawnMinDist && !inSafeZone(g, q[0], q[2]));
      if (!cands.length) break;
      const q = cands[Math.floor(g.rand() * cands.length)];
      const s = makeShade(g, `S${g.nextShade++}`, [q[0], (g.map.ground(q[0], q[2]) ?? 0) + 1, q[2]]);
      s.state = 'spawning';
      s.t = R.spawningTicks;
      g.shades.push(s);
      emit(g, 'shade_spawned', { id: s.id });
    }
  }
  if (g.randomDrifters && st % R.drifterSpawnEvery === 0) {
    const active = g.drifters.filter((d) => d.state !== 'removed').length;
    if (active < R.drifterMax) {
      const q = g.map.shadeSpawns[Math.floor(g.rand() * g.map.shadeSpawns.length)];
      g.drifters.push(makeDrifter(g, `D${g.nextDrifter++}`, [q[0], (g.map.ground(q[0], q[2]) ?? 0) + R.drifterY, q[2]]));
    }
  }
  if (g.windEnabled) {
    if ((st + R.windWarn) % R.windEvery === 0) g.wind.dir = r3(g.rand() * 360);
    if (st % R.windEvery === 0) {
      g.wind.active = true;
      g.wind.t = R.windTicks;
    }
  }

  // 11. win / lose
  if (p.flames <= 0) endGame(g, 'lost', 'no_flames');
  else if (timeLeft(g) <= 1e-9) {
    const lit = g.lanterns.filter((l) => l.lit).length;
    if (lit >= winThreshold(g)) endGame(g, 'won', 'dawn_survived');
    else endGame(g, 'lost', 'dawn');
  }
  return g.events;
}

/** Wind warning (renderer only): true during the 2 s before a gust. */
export function windWarning(g) {
  if (!g.windEnabled || g.wind.active) return false;
  const left = R.windEvery - (g.simTick % R.windEvery);
  return left <= R.windWarn;
}

// ---------------------------------------------------------------- output
export function snapshot(g) {
  const p = g.player;
  const s2 = (t) => r3(Math.max(0, t) / TICK_RATE);
  return {
    type: 'snapshot',
    tick: g.tick,
    sim_tick: g.simTick,
    night: g.night,
    state: g.paused && g.state === 'playing' ? 'paused' : g.state,
    time_left_s: r3(Math.max(0, timeLeft(g))),
    score: g.score,
    wind: { active: g.wind.active, dir_deg: r3(g.wind.dir) },
    player: {
      pos: r3v(p.pos),
      vel: r3v(p.vel),
      grounded: p.grounded,
      flames: p.flames,
      carried: p.carried,
      invuln: p.invuln > 0,
      dash_cd_s: s2(p.dashCd),
      pulse_cd_s: s2(p.pulseCd),
      charm_s: s2(p.charm),
      capacity: capacityOf(g),
    },
    lanterns: g.lanterns.map((l) => ({ id: l.id, pos: r3v(l.pos), lit: l.lit, deposited: l.deposited, fuel: r1(Math.max(0, fuelOf(l))), ever_lit: l.everLit, relit_count: l.relitCount })),
    shades: g.shades.map((s) => ({ id: s.id, pos: r3v(s.pos), state: s.state })),
    motes_active: g.motes.length,
    motes: g.motes.map((m) => ({ id: m.id, pos: r3v(m.pos), kind: m.kind, ttl_s: m.ttl == null ? null : s2(m.ttl) })),
    drifters: g.drifters.map((d) => ({ id: d.id, pos: r3v(d.pos), state: d.state, stolen: d.stolen })),
    charms: g.charms.map((c) => ({ id: c.id, pos: r3v(c.pos), available: c.available, respawn_s: s2(c.available ? 0 : c.respawn) })),
  };
}

/**
 * Ticket-04 benchmark scene (same for every submission): Night 1 with exactly 200 wandering shades
 * spread over the island and 100 motes (seeded), L1-L3 lit at fuel 100, Mây idle at (0,0,0).
 */
export function createBenchGame(seed = 42) {
  const g = createGame({
    seed,
    night: 1,
    bench: true,
    scenario: { random_motes: false, random_shades: false, random_drifters: false, motes: [], shades: [], lanterns: [{ id: 'L1', lit: true }, { id: 'L2', lit: true }, { id: 'L3', lit: true }] },
  });
  const spread = (rMin, rMax) => {
    const r = Math.sqrt(rMin * rMin + g.rand() * (rMax * rMax - rMin * rMin));
    const a = g.rand() * 2 * Math.PI;
    return [r3(r * Math.cos(a)), r3(r * Math.sin(a))];
  };
  for (let i = 0; i < 200; i++) {
    const [x, z] = spread(3, 38);
    const s = makeShade(g, `S${g.nextShade++}`, [x, 1, z]);
    s.state = 'wander';
    g.shades.push(s);
  }
  for (let i = 0; i < 100; i++) {
    const [x, z] = spread(1, 38);
    addMote(g, [x, 0, z], 'random', null, -1, -1);
  }
  return g;
}
