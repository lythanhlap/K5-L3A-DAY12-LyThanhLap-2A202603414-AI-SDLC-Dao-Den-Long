// Ticket-02 standard palette (tolerance 10% per RGB channel).
export const PAL = {
  sky: '#0E1430',
  fog: '#1B2350',
  grass: '#2F5D50',
  sand: '#C9B48A',
  wood: '#6B4A2F',
  sea: '#12384A',
  lanternLit: '#FFB347',
  lanternCore: '#FFE9B0',
  lanternOff: '#5B5F6E',
  moteCore: '#FFF6C2',
  moteHalo: '#FFE58A',
  shadeBody: '#120A1A',
  shadeEdge: '#7A3CFF',
  shadeStunned: '#3A3450',
  robe: '#E8E2D0',
  scarf: '#C8102E', // also Bùa Gió
  gold: '#F2C14E', // gold trim, score
  drifter: '#8FA3B8',
  uiDanger: '#FF5A5F',
  uiText: '#F5F1E6',
};

/** Ambient intensity from progress (Ticket-02): 0.15 + 0.55 × lit/total. */
export const ambientFor = (lit, total) => 0.15 + 0.55 * (lit / total);
