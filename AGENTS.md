# AGENTS.md: Đảo Đèn Lồng

3D third-person game (Three.js + Vite) with a deterministic headless mode graded by Test Contract v1.0.
Requirements live on the lab board; per-phase assumptions live in `docs/notes/phase-N.md`. Read the current one first.

## Commands
- Install: `npm ci` · Play: `npm start` (Vite, http://localhost:5173, `?seed=N` for a fixed world)
- Test (must be green before you stop): `npm test`
- Headless: `node src/headless.js --seed 1 --night 1 --ticks 600 --out out/run.jsonl [--scenario f] [--inputs f]`
- Evidence: `npm run proof -- phase-N` → `docs/proof/phase-N/RESULTS.md` + `runs/*.jsonl`

## Layout
- `src/sim/`: pure game logic. **No DOM/Three imports.** It is the only place gameplay rules live.
- `src/sim/tuning.js`: the single source of tuning numbers. `game.contract.json` must mirror it (a test enforces this).
- `src/headless.js`: CLI + input/scenario validation (malformed input → exit 2).
- `src/web/`: renderer only. It reads sim state and must never change rules.
- `scenarios/`: `<name>.scenario.json`, `<name>.inputs.json` and `index.json` (declarative expectations).
- `tests/`: `node:test`. `docs/notes/`: assumptions, AI log, retro. `docs/proof/`: generated evidence.

## Rules
- Determinism: all randomness goes through the seeded `g.rand`. No `Math.random`, `Date`, or object-key-order tricks in `src/sim`.
- Contract output: coordinates rounded with `r3`; events use `tick = k+1`; the `end` line is always last.
- Creative extras must not change headless output: keep them in `src/web/` or behind a flag that is off in headless.
- Never hand-edit files in `docs/proof/` (a hook blocks it). Regenerate them with `npm run proof`.
- Never weaken a test to make it pass. If a new ticket changes a rule, update the test and write the reason in `docs/notes/phase-N.md`.
- Unclear requirement → write the assumption in the notes. Don't invent rules silently.
- Small commits, one concern each. Don't commit `node_modules`, `dist`, or `.env`.
