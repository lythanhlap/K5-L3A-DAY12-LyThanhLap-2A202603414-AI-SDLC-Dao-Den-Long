// Single source of truth for gameplay numbers. game.contract.json must mirror TUNING
// (enforced by tests/contract.test.js).
export const TICK_RATE = 60;

export const TUNING = Object.freeze({
  player_speed: 6,
  carry_capacity: 5,
  lantern_cost: 5,
  lantern_count_night1: 5,
  pickup_radius: 1,
  interact_radius: 2.5,
  pulse_cost: 1,
  pulse_radius: 6,
  night1_duration_s: 300,
  flames: 3,
  invuln_s: 1.5,
  hit_drop_ratio: 0.5,
  pulse_stun_s: 2,
  pulse_push_m: 4,
  pulse_cooldown_s: 1,
  safe_radius: 5,
  shade_speed: 3.5,
  shade_hit_radius: 1,
  fall_enabled: false,
  score: Object.freeze({
    per_mote: 10,
    per_lantern: 100,
    per_stun: 20,
    per_second_left: 1,
    per_flame_left: 50,
  }),
});

// World constants that are not part of the contract tuning.
export const WORLD = Object.freeze({
  islandRadius: 30,
  lanternRingRadius: 18,
  moteSpawnRadius: 28,
  moteInitial: 30,
  moteMin: 20,
  moteRespawnS: 5,
  shadeInitial: 3,
  shadeMax: 6,
  shadeSpawnS: 30,
  shadeRingMin: 22,
  shadeRingMax: 29,
  shadeMinDistFromPlayer: 12,
  shadeY: 1,
  jumpSpeed: 7,
  gravity: 20,
});
