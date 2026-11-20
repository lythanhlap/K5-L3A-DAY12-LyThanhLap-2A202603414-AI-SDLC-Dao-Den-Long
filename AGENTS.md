# AGENTS.md: Đảo Đèn Lồng

3D third-person game (Three.js + Vite) with a deterministic headless mode graded by **Test Contract v1.2** (3 nights, lantern fuel; see `docs/adr/`).
Requirements live on the lab board. Per-phase spec and assumptions live in `docs/notes/phase-N.md`. **Read the latest one first.**

## Commands
- Install: `npm ci` · Play: `npm start` (Vite, http://localhost:5173; `?seed=N` fixed world, `?fps` FPS overlay)
- Test (must be green before you stop): `npm test`
- Headless: `node src/headless.js --seed 1 --night <1|2|3> --ticks 600 --out out/run.jsonl [--scenario f] [--inputs f]`
- Evidence: `npm run proof -- phase-N` → `docs/proof/phase-N/RESULTS.md` + `runs/*.jsonl`
- Release run: `npm run build && node scripts/serve.mjs` · Bench: `node scripts/bench.mjs --seed 42 --duration 30 --out bench.json` · Soak: `node --expose-gc scripts/soak.mjs --seed 7 --nights 10 --out soak.json`

## Layout
- `src/sim/`: pure game logic. **No DOM/Three imports.** It is the only place gameplay rules live.
  - `tuning.js`: contract `TUNING` (mirrored by `game.contract.json`, a test enforces it) + other standard numbers in `RULES`.
  - `maps.js`: standard maps for nights 1–3 (ground height function, spawn points, lanterns, pads).
  - `game.js`: `step()` follows the ticket's 12-step tick order. Keep the numbered comments in sync.
- `src/headless.js`: CLI + input/scenario validation (malformed input → exit 2).
- `src/web/`: renderer, UI, audio, palette. It only reads sim state and feeds input; it never changes rules.
- `scenarios/`: `<name>.scenario.json`, `<name>.inputs.json`, and `index.json` (night, seed, ticks, expectations).

## Rules
- Determinism: all randomness goes through the seeded `g.rand`. No `Math.random`, `Date`, or object-key-order tricks in `src/sim`.
- Contract output: coordinates rounded with `r3`; events use `tick = k+1` (`night_start` uses tick 0); the `end` line is always last.
- Boundaries are inclusive ("within r" means ≤ r). Keep a 0.001 margin so rounded output never sits on an edge.
- Timers decrement in step 2. An action set in step k is first visible in the snapshot at k+1. Count this when computing expectations by hand.
- Creative extras must not change headless output: keep them in `src/web/`.
- Never hand-edit files in `docs/proof/` (a hook blocks it). Regenerate them with `npm run proof`.
- Lantern fuel is integer 1/60 units (`fuelU`); never store fuel as a float. Safe zone = lit and fuel >= 30 (`inSafeZone`).
- Rule replaced by a ticket → write an ADR in `docs/adr/` and a CHANGELOG entry, and delete or update old tests with the reason written next to them.
- When patching code with scripts, anchor each replacement to a unique string and assert it matched exactly once.
- Measure FPS only in a foreground tab (background tabs are throttled to ~30 FPS).
- Bench/soak numbers are recorded exactly as produced, failures included. Never tune flags or rerun just to pass a threshold; analyse and document instead.
- Never weaken a test to make it pass. If a ticket replaces a rule, update the test and write the reason in the phase notes ("Thay đổi so với…" table).
- The renderer feeds edge-triggered buttons. While paused it must still deliver the button release (see `togglePause`).
- Small commits, one concern each. Don't commit `node_modules`, `dist`, `.env`, or `game_charactor/` (licence unknown).
