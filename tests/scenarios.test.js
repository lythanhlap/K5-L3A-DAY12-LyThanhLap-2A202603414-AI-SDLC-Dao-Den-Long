import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scenarios, runScenario, checkExpectations, headless, argsFor } from '../scripts/scenarios.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'ddl-'));

for (const s of scenarios) {
  test(`scenario ${s.name} (${s.ac})`, () => {
    const { lines } = runScenario(s, join(tmp, 'a'));
    for (const r of checkExpectations(s, lines)) assert.ok(r.ok, `${r.check} -> ${r.detail}`);
  });

  test(`determinism ${s.name}: two runs byte-identical`, () => {
    const a = runScenario(s, join(tmp, 'd1')).text;
    const b = runScenario(s, join(tmp, 'd2')).text;
    assert.equal(a, b);
  });
}

test('output format: snapshot cadence, tick 0 first, end line last', () => {
  const s = scenarios.find((x) => x.name === 'random_seed42');
  const { lines } = runScenario(s, join(tmp, 'f'));
  assert.equal(lines[0].type, 'snapshot');
  assert.equal(lines[0].tick, 0);
  assert.equal(lines.at(-1).type, 'end');
  assert.equal(lines.filter((l) => l.type === 'end').length, 1);
  const snapTicks = lines.filter((l) => l.type === 'snapshot').map((l) => l.tick);
  const endTick = lines.at(-1).ticks;
  assert.deepEqual(snapTicks, Array.from({ length: Math.floor(endTick / 10) + 1 }, (_, i) => i * 10));
  for (const l of lines.filter((x) => x.type === 'snapshot')) {
    assert.equal(l.sim_tick, l.tick);
    for (const sh of l.shades) assert.ok(['chase', 'stunned'].includes(sh.state));
  }
});

test('--snapshot-every is honoured', () => {
  const out = join(tmp, 'every.jsonl');
  assert.equal(headless(['--seed', '3', '--night', '1', '--ticks', '50', '--out', out, '--snapshot-every', '25']).code, 0);
  const ticks = readFileSync(out, 'utf8').trim().split('\n').map(JSON.parse).filter((l) => l.type === 'snapshot').map((l) => l.tick);
  assert.deepEqual(ticks, [0, 25, 50]);
});

test('different seeds give different random worlds', () => {
  const s = scenarios.find((x) => x.name === 'random_seed42');
  const a = runScenario(s, join(tmp, 's1')).lines[0];
  const b = runScenario({ ...s, seed: 43 }, join(tmp, 's2')).lines[0];
  assert.notDeepEqual(a.motes, b.motes);
});

const bad = {
  'broken JSON': '{"frames": [',
  'frames missing': '{}',
  'ticks not increasing': '{"frames":[{"tick":5},{"tick":5}]}',
  'move wrong type': '{"frames":[{"tick":0,"move":"up"}]}',
  'button not boolean': '{"frames":[{"tick":0,"pulse":1}]}',
};
for (const [name, body] of Object.entries(bad)) {
  test(`malformed inputs (${name}) -> exit 2`, () => {
    const f = join(tmp, `bad-${name.replace(/\W/g, '_')}.json`);
    writeFileSync(f, body);
    const r = headless(['--seed', '1', '--night', '1', '--ticks', '5', '--inputs', f, '--out', join(tmp, 'x.jsonl')]);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /error/);
  });
}

test('malformed scenario (unknown lantern id) -> exit 2', () => {
  const f = join(tmp, 'bad-scn.json');
  writeFileSync(f, '{"lanterns":[{"id":"L9"}]}');
  const r = headless(['--seed', '1', '--night', '1', '--ticks', '5', '--scenario', f, '--out', join(tmp, 'y.jsonl')]);
  assert.equal(r.code, 2);
});

test('missing required args -> non-zero exit with stderr', () => {
  const r = headless(['--seed', '1', '--night', '1']);
  assert.notEqual(r.code, 0);
  assert.ok(r.stderr.length > 0);
});

test('every scenario file referenced exists', () => {
  for (const s of scenarios) for (const a of argsFor(s, 'o')) if (a.endsWith('.json')) assert.ok(existsSync(a), a);
});
