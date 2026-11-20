#!/usr/bin/env node
// Ticket-04 benchmark: opens a real 1280x720 browser window (not fullscreen) with the standard
// bench scene, 3 s warm-up, then measures exactly --duration seconds and exits 0.
// Usage: node scripts/bench.mjs --seed 42 --duration 30 --out bench.json  [--headless]
// Requires `npm run build` first (part of build_cmd).
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import os from 'node:os';
import puppeteer from 'puppeteer';
import { startServer } from './serve.mjs';

// process start (epoch ms) = now - time since this Node process started
const processStartEpoch = Date.now() - process.uptime() * 1000;

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}
const seed = Number(arg('seed', 42));
const duration = Number(arg('duration', 30));
const out = arg('out', 'bench.json');
const headless = process.argv.includes('--headless'); // only for machines without a display
const round1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

// Peak memory = largest sum of resident memory (RSS / Windows working set) over the whole browser
// process tree (browser + GPU + renderer + utility processes), sampled every 2 s during the run.
import { execFile } from 'node:child_process';
function processTable() {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      execFile('powershell', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) $($_.WorkingSetSize)" }'], { maxBuffer: 1 << 24 }, (err, stdout) =>
        resolve(err ? [] : stdout.trim().split(/\r?\n/).map((l) => l.trim().split(/\s+/).map(Number)).map(([pid, ppid, bytes]) => ({ pid, ppid, bytes }))),
      );
    } else {
      execFile('ps', ['-A', '-o', 'pid=,ppid=,rss='], { maxBuffer: 1 << 24 }, (err, stdout) =>
        resolve(err ? [] : stdout.trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number)).map(([pid, ppid, kb]) => ({ pid, ppid, bytes: kb * 1024 }))),
      );
    }
  });
}
async function treeRssMb(rootPid) {
  const table = await processTable();
  const kids = new Map();
  for (const p of table) (kids.get(p.ppid) || kids.set(p.ppid, []).get(p.ppid)).push(p);
  let total = 0;
  const stack = table.filter((p) => p.pid === rootPid);
  const seen = new Set();
  while (stack.length) {
    const p = stack.pop();
    if (seen.has(p.pid)) continue;
    seen.add(p.pid);
    total += p.bytes || 0;
    stack.push(...(kids.get(p.pid) || []));
  }
  return total / 1048576;
}

const W = 1280;
const H = 720;
const { server, url } = await startServer(0);
const browser = await puppeteer.launch({
  headless,
  defaultViewport: { width: W, height: H },
  args: [
    `--window-size=${W},${H + 140}`, // a normal window whose page area is exactly 1280x720
    '--disable-gpu-vsync', // vsync off
    '--disable-frame-rate-limit',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--enable-precise-memory-info',
  ],
});
let code = 0;
try {
  const page = await browser.newPage();
  await page.bringToFront();
  await page.goto(`${url}?bench=1&seed=${seed}&duration=${duration}`, { waitUntil: 'load' });
  const rootPid = browser.process()?.pid;
  let peakMem = null;
  let sampling = true;
  const sampler = (async () => {
    while (sampling && rootPid) {
      const mb = await treeRssMb(rootPid);
      if (mb > 0) peakMem = Math.max(peakMem ?? 0, mb);
      await new Promise((r) => setTimeout(r, 2000));
    }
  })();
  await page.waitForFunction('window.__benchResult', { timeout: (duration + 120) * 1000, polling: 500 });
  sampling = false;
  await sampler;
  const r = await page.evaluate('window.__benchResult');
  const firstFrameEpoch = await page.evaluate('window.__benchFirstFrameEpoch');
  const version = await browser.version();
  const report = {
    contract_version: '1.3',
    avg_fps: round1(r.avg_fps),
    p1_low_fps: round1(r.p1_low_fps),
    frame_ms_p95: round1(r.frame_ms_p95),
    frames: r.frames,
    load_ms: Math.round(firstFrameEpoch - processStartEpoch),
    peak_mem_mb: round1(peakMem), // sum over the browser process tree, sampled every 2 s (null if sampling failed)
    vsync_off: true,
    renderer: `${r.renderer}; ${version}${headless ? ' (headless)' : ''}`,
    os: `${os.type()} ${os.release()} ${os.arch()}; ${os.cpus()[0]?.model?.trim()}; ${Math.round(os.totalmem() / 1073741824)} GB RAM; Node ${process.version}`,
    // extra fields (not in the contract): what was actually measured
    js_heap_peak_mb: round1(r.js_heap_peak_mb),
    viewport: `${r.width}x${r.height}`,
    scene: { shades: r.shades, motes: r.motes, seed, duration_s: duration },
  };
  mkdirSync(dirname(out) || '.', { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify(report) + '\n');
} catch (e) {
  process.stderr.write(`bench failed: ${e.stack || e}\n`);
  code = 1;
} finally {
  await browser.close();
  server.close();
}
process.exit(code);
