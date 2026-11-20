// Leaderboard persisted on local disk (data/leaderboard.json, survives restarts) + HTTP handler.
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addEntry, exportDoc } from '../src/leaderboard.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const STORE = process.env.DDL_LEADERBOARD || join(ROOT, 'data', 'leaderboard.json');

export function load(file = STORE) {
  try {
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(doc.entries) ? doc.entries : [];
  } catch {
    return [];
  }
}

export function save(list, file = STORE) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(exportDoc(list), null, 2) + '\n');
  renameSync(tmp, file); // atomic replace
}

export function exportTo(out, file = STORE) {
  mkdirSync(dirname(out) || '.', { recursive: true });
  writeFileSync(out, JSON.stringify(exportDoc(load(file)), null, 2) + '\n');
}

/** Connect/Node-style middleware for /api/leaderboard (GET list, POST {entry}). */
export function leaderboardHandler(req, res, next) {
  if (!req.url.startsWith('/api/leaderboard')) return next ? next() : false;
  const send = (code, body) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
    return true;
  };
  if (req.method === 'GET') return send(200, exportDoc(load()));
  if (req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const list = addEntry(load(), JSON.parse(body));
        save(list);
        send(200, exportDoc(list));
      } catch (e) {
        send(400, { error: e.message });
      }
    });
    return true;
  }
  return send(405, { error: 'method not allowed' });
}
