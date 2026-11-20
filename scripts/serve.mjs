#!/usr/bin/env node
// Runs the built game (dist/) on http://localhost:<port> with the on-disk leaderboard API.
//   node scripts/serve.mjs [--port 8080] [--no-open]
//   node scripts/serve.mjs --export-leaderboard out.json     (writes {"entries":[...]} sorted, then exits)
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { leaderboardHandler, exportTo } from './leaderboard-store.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

export function startServer(port = 8080, host = '127.0.0.1') {
  if (!existsSync(join(DIST, 'index.html'))) {
    throw new Error('dist/ not found: run "npm run build" first');
  }
  const server = createServer((req, res) => {
    if (leaderboardHandler(req, res)) return;
    const urlPath = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    let file = normalize(join(DIST, urlPath === '/' ? 'index.html' : urlPath));
    if (!file.startsWith(DIST)) {
      res.writeHead(403).end();
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve({ server, url: `http://${host === '127.0.0.1' ? 'localhost' : host}:${server.address().port}/` }));
  });
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref();
  } catch {}
}

async function main() {
  const args = process.argv.slice(2);
  const ei = args.indexOf('--export-leaderboard');
  if (ei >= 0) {
    const out = args[ei + 1];
    if (!out) {
      process.stderr.write('error: --export-leaderboard needs an output file\n');
      process.exit(1);
    }
    exportTo(out);
    process.stdout.write(`wrote ${out}\n`);
    return;
  }
  const pi = args.indexOf('--port');
  const port = pi >= 0 ? Number(args[pi + 1]) : 8080;
  try {
    const { url } = await startServer(port);
    process.stdout.write(`Đảo Đèn Lồng running at ${url}  (Ctrl+C to stop)\n`);
    if (!args.includes('--no-open')) openBrowser(url);
  } catch (e) {
    process.stderr.write(`error: ${e.message}\n`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
