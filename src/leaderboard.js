// Local leaderboard rules (Ticket-04), shared by the browser game and the Node server/CLI.
// Pure functions only: no DOM, no fs.

export const MAX_ENTRIES = 10;
// 3-12 chars of [A-Za-z0-9_]; Vietnamese letters with diacritics are also accepted (bonus).
const NAME_RE = /^[\p{L}\p{M}\p{N}_]+$/u;

export function normalizeName(name) {
  return typeof name === 'string' ? name.normalize('NFC').trim() : '';
}

export function isValidName(name) {
  const n = normalizeName(name);
  const len = [...n].length;
  return len >= 3 && len <= 12 && NAME_RE.test(n);
}

/** ISO 8601 with the local UTC offset, e.g. 2026-11-20T15:04:05+07:00 */
export function isoWithOffset(d = new Date()) {
  const pad = (x) => String(Math.abs(Math.trunc(x))).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(off / 60)}:${pad(off % 60)}`;
}

export function isValidEntry(e) {
  return (
    e !== null &&
    typeof e === 'object' &&
    isValidName(e.name) &&
    Number.isInteger(e.score) &&
    e.score >= 0 &&
    Number.isInteger(e.nights_won) &&
    e.nights_won >= 0 &&
    e.nights_won <= 3 &&
    typeof e.achieved_at === 'string' &&
    !Number.isNaN(Date.parse(e.achieved_at)) &&
    Number.isInteger(e.seed)
  );
}

/** score desc; on a tie, whoever achieved it first ranks higher. Stable for identical entries. */
export function sortEntries(list) {
  return list
    .map((e, i) => [e, i])
    .sort(([a, ia], [b, ib]) => b.score - a.score || Date.parse(a.achieved_at) - Date.parse(b.achieved_at) || ia - ib)
    .map(([e]) => e);
}

export function addEntry(list, entry) {
  if (!isValidEntry(entry)) throw new Error('invalid leaderboard entry');
  const clean = {
    name: normalizeName(entry.name),
    score: entry.score,
    nights_won: entry.nights_won,
    achieved_at: entry.achieved_at,
    seed: entry.seed,
  };
  return sortEntries([...list.filter(isValidEntry), clean]).slice(0, MAX_ENTRIES);
}

export function exportDoc(list) {
  return { entries: sortEntries(list.filter(isValidEntry)).slice(0, MAX_ENTRIES) };
}
