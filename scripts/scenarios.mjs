// Shared scenario runner + declarative expectation checker (used by tests and proof script).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SCEN_DIR = join(ROOT, 'scenarios');
export const scenarios = JSON.parse(readFileSync(join(SCEN_DIR, 'index.json'), 'utf8'));

export function headless(args) {
  const r = spawnSync(process.execPath, [join(ROOT, 'src/headless.js'), ...args], { encoding: 'utf8' });
  return { code: r.status, stderr: r.stderr };
}

export function argsFor(s, out) {
  const args = ['--seed', String(s.seed), '--night', '1', '--ticks', String(s.ticks), '--out', out];
  const sc = join(SCEN_DIR, `${s.name}.scenario.json`);
  const inp = join(SCEN_DIR, `${s.name}.inputs.json`);
  if (s.scenario !== false && existsSync(sc)) args.push('--scenario', sc);
  if (s.inputs !== false && existsSync(inp)) args.push('--inputs', inp);
  return args;
}

export function runScenario(s, outDir) {
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, `${s.name}.jsonl`);
  const r = headless(argsFor(s, out));
  if (r.code !== 0) throw new Error(`${s.name}: exit ${r.code}: ${r.stderr}`);
  const text = readFileSync(out, 'utf8');
  return { out, text, lines: text.trimEnd().split('\n').map((l) => JSON.parse(l)) };
}

const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const deq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const partial = (obj, want) => obj && Object.entries(want).every(([k, v]) => deq(obj[k], v));

/** Returns a list of {check, ok, detail}. */
export function checkExpectations(s, lines) {
  const events = lines.filter((l) => l.type === 'event');
  const snaps = lines.filter((l) => l.type === 'snapshot');
  const end = lines[lines.length - 1];
  return s.expect.map((e) => {
    let ok;
    let detail;
    if (e.event) {
      const hit = events.find((ev) => ev.name === e.event && partial(ev.data, e.data || {}) && (e.tick == null || ev.tick === e.tick));
      ok = !!hit;
      detail = hit ? `found at tick ${hit.tick}` : `events: ${JSON.stringify(events.filter((ev) => ev.name === e.event))}`;
    } else if (e.count) {
      const n = events.filter((ev) => ev.name === e.count).length;
      ok = n === e.equals;
      detail = `count=${n}`;
    } else if ('snapshot' in e) {
      const sn = snaps.find((x) => x.tick === e.snapshot);
      const v = sn ? get(sn, e.path) : '(no snapshot)';
      ok = deq(v, e.equals);
      detail = `actual=${JSON.stringify(v)}`;
    } else if (e.end) {
      ok = end.type === 'end' && partial(end, e.end);
      detail = `end=${JSON.stringify(end)}`;
    } else if (e.min_dist) {
      let min = Infinity;
      for (const sn of snaps) {
        const a = sn.shades.find((x) => x.id === e.min_dist.shade);
        const b = sn.lanterns.find((x) => x.id === e.min_dist.lantern);
        if (a && b) min = Math.min(min, Math.hypot(a.pos[0] - b.pos[0], a.pos[2] - b.pos[2]));
      }
      ok = min > e.gt;
      detail = `min=${min.toFixed(3)}`;
    } else {
      ok = false;
      detail = 'unknown check';
    }
    return { check: JSON.stringify(e), ok, detail };
  });
}
