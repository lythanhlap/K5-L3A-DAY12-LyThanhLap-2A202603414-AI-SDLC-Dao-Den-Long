// Claude Code PreToolUse hook (Edit|Write): block hand-editing generated evidence in docs/proof/.
// Evidence must come from `npm run proof`, never from the agent's typing.
import { readFileSync } from 'node:fs';

let p = {};
try {
  p = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {}
const file = String(p.tool_input?.file_path || '').replace(/\\/g, '/');
if (/\/docs\/proof\/.*\.(jsonl|md)$/.test(file)) {
  process.stderr.write('Blocked: docs/proof/ is generated evidence. Regenerate it with `npm run proof -- phase-N` instead of editing it.\n');
  process.exit(2);
}
process.exit(0);
