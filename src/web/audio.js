// Tiny WebAudio synth: night music pad + SFX. No external assets (all generated in code).
let ctx = null;
let master = null;
let musicGain = null;
let volume = 0.6;

export function initAudio() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);
  // night pad: two detuned low triangles through a slow tremolo
  musicGain = ctx.createGain();
  musicGain.gain.value = 0.05;
  musicGain.connect(master);
  for (const f of [110, 164.8, 220.5]) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = 0.33;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.1 + f / 2000;
    const lg = ctx.createGain();
    lg.gain.value = 0.25;
    lfo.connect(lg).connect(g.gain);
    o.connect(g).connect(musicGain);
    o.start();
    lfo.start();
  }
}

export function setVolume(v) {
  volume = v;
  if (master) master.gain.value = v;
}

function tone(freq, dur, { type = 'sine', gain = 0.25, slide = 0, delay = 0 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, { gain = 0.2, freq = 800 } = {}) {
  if (!ctx) return;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(master);
  src.start();
}

export const sfx = {
  pickup: () => tone(1320, 0.12, { gain: 0.15, slide: 400 }),
  deposit: () => tone(660, 0.15, { gain: 0.15 }),
  lit: () => [523, 659, 784].forEach((f, i) => tone(f, 0.6, { gain: 0.15, delay: i * 0.08 })),
  pulse: () => tone(300, 0.45, { type: 'sawtooth', gain: 0.12, slide: 900 }),
  hit: () => tone(120, 0.35, { type: 'square', gain: 0.2, slide: -60 }),
  jump: () => tone(400, 0.15, { gain: 0.12, slide: 300 }),
  dash: () => noise(0.2, { gain: 0.25, freq: 1800 }),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.5, { gain: 0.18, delay: i * 0.15 })),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.6, { type: 'triangle', gain: 0.18, delay: i * 0.2 })),
  shade: () => tone(70, 0.6, { type: 'sawtooth', gain: 0.1, slide: -20 }),
  tick: () => tone(1000, 0.05, { type: 'square', gain: 0.08 }),
  wind: () => noise(1.5, { gain: 0.15, freq: 500 }),
  steal: () => tone(900, 0.3, { type: 'triangle', gain: 0.15, slide: -600 }),
  charm: () => [880, 1320].forEach((f, i) => tone(f, 0.2, { gain: 0.12, delay: i * 0.06 })),
};
