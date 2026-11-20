---
name: headless-proof
description: Add a headless scenario for a requirement, run the game headless, and regenerate evidence for a phase. Use when verifying a requirement or before tagging a phase.
---

# Headless proof

Use this when you need to prove a requirement works, or before tagging `phase-N`.

1. **Write the scenario.** Add `scenarios/<name>.scenario.json` (and `<name>.inputs.json` if the player acts). Use `random_motes:false` / `random_shades:false` so only the listed entities exist.
2. **Add an entry** to `scenarios/index.json`: `name`, `ac` (the acceptance-criterion id from `docs/notes/phase-N.md`), `seed`, `ticks`, `why`, and `expect`. Check types:
   - `{"event": name, "data": {partial}, "tick"?: n}`: the event exists
   - `{"count": name, "equals": n}`
   - `{"snapshot": tick, "path": "player.pos", "equals": v}`: needs `tick % 10 == 0`
   - `{"end": {partial}}`
   - `{"min_dist": {"shade": id, "lantern": id}, "gt": r}`
   Work out expected numbers **by hand from the tuning** before running. Never copy them from the output.
3. **Run** `npm test`. Every scenario is checked and also run twice for byte-identical determinism.
4. **Regenerate evidence** with `npm run proof -- phase-N`. This writes `docs/proof/phase-N/RESULTS.md` and `runs/*.jsonl` (hand edits are blocked by a hook).
5. If a check fails, decide whether the code or the expectation is wrong. Write the reasoning in `docs/notes/phase-N.md`. Don't just change the number.

For visual requirements (HUD, lighting), take a screenshot in the browser (`npm start`) and save it to `docs/proof/phase-N/screens/`. Say which requirement it shows.
