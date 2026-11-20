// Claude Code Stop hook: refuse to finish while `npm test` is red.
// Exit 2 + stderr => Claude is told why and keeps working. stop_hook_active guards against loops.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

let payload = {};
try {
  payload = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {}
if (payload.stop_hook_active) process.exit(0);

const r = spawnSync(process.execPath, ['--test', 'tests/*.test.js'], { encoding: 'utf8', cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd() });
if (r.status === 0) process.exit(0);
const out = (r.stdout + r.stderr).split('\n');
const fails = out.filter((l) => /^not ok|^# fail|error|expected|actual/i.test(l)).slice(0, 25).join('\n');
process.stderr.write(`Tests are failing. Fix them before finishing (do not weaken tests):\n${fails}\n`);
process.exit(2);
