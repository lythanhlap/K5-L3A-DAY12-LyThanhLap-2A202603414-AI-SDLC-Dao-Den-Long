#!/usr/bin/env node
// Headless runner per Test Contract v1.0.
// Usage: node src/headless.js --seed <int> --night 1 [--scenario f] [--inputs f] --ticks <int> --out <f.jsonl> [--snapshot-every 10]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createGame, step, snapshot, ScenarioError } from './sim/game.js';

class FormatError extends Error {}

function fail(code, msg) {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) fail(1, `unexpected argument ${k}`);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) fail(1, `missing value for ${k}`);
    a[k.slice(2)] = v;
    i++;
  }
  return a;
}

function intArg(a, name, { required = false, def, min = -Infinity } = {}) {
  if (a[name] === undefined) {
    if (required) fail(1, `--${name} is required`);
    return def;
  }
  const n = Number(a[name]);
  if (!Number.isInteger(n) || n < min) fail(1, `--${name} must be an integer >= ${min}`);
  return n;
}

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const isVec = (x, n) => Array.isArray(x) && x.length === n && x.every(isNum);
const isBool = (x) => typeof x === 'boolean';
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isCount = (x) => Number.isInteger(x) && x >= 0;
function need(cond, msg) {
  if (!cond) throw new FormatError(msg);
}

function readJson(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    throw new FormatError(`cannot read ${path}: ${e.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new FormatError(`invalid JSON in ${path}: ${e.message}`);
  }
}

export function validateInputs(doc) {
  need(isObj(doc) && Array.isArray(doc.frames), 'inputs: "frames" array required');
  let last = -1;
  for (const [i, f] of doc.frames.entries()) {
    need(isObj(f), `inputs: frame ${i} must be an object`);
    need(Number.isInteger(f.tick) && f.tick >= 0, `inputs: frame ${i} tick must be a non-negative integer`);
    need(f.tick > last, `inputs: frame ticks must strictly increase (frame ${i})`);
    last = f.tick;
    if ('move' in f) need(isVec(f.move, 2), `inputs: frame ${i} move must be [x, z]`);
    if ('cam_yaw_deg' in f) need(isNum(f.cam_yaw_deg), `inputs: frame ${i} cam_yaw_deg must be a number`);
    for (const b of ['jump', 'interact', 'pulse', 'dash']) {
      if (b in f) need(isBool(f[b]), `inputs: frame ${i} ${b} must be boolean`);
    }
  }
  return doc;
}

export function validateScenario(doc) {
  need(isObj(doc), 'scenario: must be an object');
  if ('player' in doc) {
    const p = doc.player;
    need(isObj(p), 'scenario: player must be an object');
    if ('pos' in p) need(isVec(p.pos, 3), 'scenario: player.pos must be [x,y,z]');
    if ('carried' in p) need(isCount(p.carried), 'scenario: player.carried must be a non-negative integer');
    if ('flames' in p) need(isCount(p.flames), 'scenario: player.flames must be a non-negative integer');
  }
  for (const k of ['random_motes', 'random_shades']) if (k in doc) need(isBool(doc[k]), `scenario: ${k} must be boolean`);
  if ('motes' in doc) {
    need(Array.isArray(doc.motes), 'scenario: motes must be an array');
    doc.motes.forEach((m, i) => need(isVec(m, 3), `scenario: motes[${i}] must be [x,y,z]`));
  }
  if ('shades' in doc) {
    need(Array.isArray(doc.shades), 'scenario: shades must be an array');
    doc.shades.forEach((s, i) => {
      need(isObj(s) && isVec(s.pos, 3), `scenario: shades[${i}].pos must be [x,y,z]`);
      if ('id' in s) need(typeof s.id === 'string' && s.id.length > 0, `scenario: shades[${i}].id must be a string`);
    });
    const ids = doc.shades.filter((s) => s.id).map((s) => s.id);
    need(new Set(ids).size === ids.length, 'scenario: duplicate shade ids');
  }
  if ('lanterns' in doc) {
    need(Array.isArray(doc.lanterns), 'scenario: lanterns must be an array');
    doc.lanterns.forEach((l, i) => {
      need(isObj(l) && typeof l.id === 'string', `scenario: lanterns[${i}].id required`);
      if ('pos' in l) need(isVec(l.pos, 3), `scenario: lanterns[${i}].pos must be [x,y,z]`);
      if ('deposited' in l) need(isCount(l.deposited), `scenario: lanterns[${i}].deposited must be a non-negative integer`);
      if ('lit' in l) need(isBool(l.lit), `scenario: lanterns[${i}].lit must be boolean`);
    });
  }
  if ('time_left_s' in doc) need(isNum(doc.time_left_s) && doc.time_left_s > 0, 'scenario: time_left_s must be > 0');
  return doc;
}

export function run({ seed, scenario, inputs, ticks, snapshotEvery }) {
  const g = createGame({ seed, scenario });
  const frames = inputs ? inputs.frames : [];
  const cur = { move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false, dash: false };
  const lines = [JSON.stringify(snapshot(g))];
  let fi = 0;
  for (let k = 0; k < ticks && g.state === 'playing'; k++) {
    while (fi < frames.length && frames[fi].tick <= k) {
      const f = frames[fi++];
      for (const key of Object.keys(cur)) if (key in f) cur[key] = f[key];
    }
    for (const e of step(g, cur)) lines.push(JSON.stringify(e));
    if (g.tick % snapshotEvery === 0) lines.push(JSON.stringify(snapshot(g)));
  }
  lines.push(JSON.stringify({ type: 'end', ticks: g.tick, state: g.state, score: g.score }));
  return lines.join('\n') + '\n';
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  const seed = intArg(a, 'seed', { required: true });
  const night = intArg(a, 'night', { def: 1 });
  if (night !== 1) fail(1, `night ${night} not available (only 1)`);
  const ticks = intArg(a, 'ticks', { required: true, min: 0 });
  const snapshotEvery = intArg(a, 'snapshot-every', { def: 10, min: 1 });
  if (!a.out) fail(1, '--out is required');
  let scenario = null;
  let inputs = null;
  try {
    if (a.scenario) scenario = validateScenario(readJson(a.scenario));
    if (a.inputs) inputs = validateInputs(readJson(a.inputs));
    const text = run({ seed, scenario, inputs, ticks, snapshotEvery });
    mkdirSync(dirname(a.out), { recursive: true });
    writeFileSync(a.out, text);
  } catch (e) {
    if (e instanceof FormatError || e instanceof ScenarioError) fail(2, e.message);
    fail(1, e.stack || String(e));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
