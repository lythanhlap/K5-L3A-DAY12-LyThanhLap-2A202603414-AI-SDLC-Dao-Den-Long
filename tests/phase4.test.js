import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isValidName, addEntry, sortEntries, exportDoc, isoWithOffset } from '../src/leaderboard.js';
import { createBenchGame, step } from '../src/sim/game.js';

const tmp = mkdtempSync(join(tmpdir(), 'ddl4-'));
// fileURLToPath (not URL.pathname): paths with spaces must not stay percent-encoded (found in a clean clone under "PC ACER")
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const e = (name, score, at, extra = {}) => ({ name, score, nights_won: 1, achieved_at: at, seed: 1, ...extra });

test('leaderboard names: 3-12 of [A-Za-z0-9_], Vietnamese letters accepted', () => {
  for (const ok of ['abc', 'May_01', 'A23456789012', 'Mây', 'Đèn_Lồng']) assert.ok(isValidName(ok), ok);
  for (const bad of ['ab', 'A234567890123', 'has space', 'semi;colon', '', null, 'a-b']) assert.ok(!isValidName(bad), String(bad));
});

test('leaderboard: score desc, ties -> earlier first, top 10 only', () => {
  let list = [];
  for (let i = 0; i < 12; i++) list = addEntry(list, e(`p${i}xx`, i * 10, `2026-11-20T10:00:${String(i).padStart(2, '0')}+07:00`));
  assert.equal(list.length, 10);
  assert.deepEqual(list.map((x) => x.score), [110, 100, 90, 80, 70, 60, 50, 40, 30, 20]);
  const tie = sortEntries([e('late', 5, '2026-11-20T10:00:09+07:00'), e('early', 5, '2026-11-20T03:00:01Z')]);
  assert.deepEqual(tie.map((x) => x.name), ['early', 'late']); // 03:00:01Z is before 10:00:09+07:00 (03:00:09Z)
});

test('leaderboard entry fields and ISO 8601 timestamp with offset', () => {
  assert.match(isoWithOffset(new Date()), /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/);
  assert.throws(() => addEntry([], e('ok_name', 1, 'not a date')));
  assert.throws(() => addEntry([], { ...e('ok_name', 1, isoWithOffset()), nights_won: 4 }));
  const doc = exportDoc([e('abc', 3, isoWithOffset())]);
  assert.deepEqual(Object.keys(doc.entries[0]), ['name', 'score', 'nights_won', 'achieved_at', 'seed']);
});

test('--export-leaderboard reads the on-disk store and writes {"entries": [...]} in order', () => {
  const store = join(tmp, 'lb.json');
  writeFileSync(store, JSON.stringify({ entries: [e('second', 10, '2026-11-20T10:00:00+07:00'), e('first', 20, '2026-11-20T11:00:00+07:00')] }));
  const out = join(tmp, 'out.json');
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/serve.mjs'), '--export-leaderboard', out], { encoding: 'utf8', env: { ...process.env, DDL_LEADERBOARD: store } });
  assert.equal(r.status, 0, r.stderr);
  const doc = JSON.parse(readFileSync(out, 'utf8'));
  assert.deepEqual(doc.entries.map((x) => x.name), ['first', 'second']);
});

test('bench scene: exactly 200 wandering shades + 100 motes, L1-L3 at fuel 100, nothing spawns/ends', () => {
  const g = createBenchGame(42);
  assert.equal(g.shades.length, 200);
  assert.equal(g.motes.length, 100);
  for (let i = 0; i < 60 * 60; i++) step(g, { move: [0, 0] });
  assert.equal(g.shades.length, 200);
  assert.ok(g.shades.every((s) => s.state === 'wander'));
  assert.equal(g.motes.length, 100);
  assert.deepEqual(g.lanterns.slice(0, 3).map((l) => [l.lit, l.fuelU / 60]), [[true, 100], [true, 100], [true, 100]]);
  assert.equal(g.state, 'playing');
  assert.equal(g.player.flames, 3);
});

test('soak: runs N nights in one process and writes the contract fields', () => {
  const out = join(tmp, 'soak.json');
  const r = spawnSync(process.execPath, ['--expose-gc', join(ROOT, 'scripts/soak.mjs'), '--seed', '7', '--nights', '4', '--out', out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const s = JSON.parse(readFileSync(out, 'utf8'));
  assert.deepEqual(Object.keys(s), ['nights', 'crashes', 'results', 'mem_start_mb', 'mem_end_mb', 'duration_s']);
  assert.equal(s.nights, 4);
  assert.equal(s.crashes, 0);
  assert.equal(s.results.length, 4);
  assert.ok(s.results.every((x) => x === 'won' || x === 'lost'));
});
