import type { Series } from '../types';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function generateSeries(opts: {
  seed: number;
  start: number;
  drift: number;
  volatility: number;
  count?: number;
  title: string;
}): Series {
  const { seed, start, drift, volatility, title } = opts;
  const count = Math.max(2, opts.count ?? 12);
  const rand = mulberry32(seed);
  const points = [];
  for (let i = 0; i < count; i++) {
    const trend = start * (1 + (drift * i) / (count - 1));
    const isEdge = i === 0 || i === count - 1;
    const noise = isEdge ? 0 : (rand() - 0.5) * 2 * volatility * start;
    // keep the random stream aligned regardless of edge handling
    if (isEdge) rand();
    const value = isEdge ? trend : Math.max(0.01, trend + noise);
    points.push({ label: `M${i - (count - 1)}`, value: round2(value) });
  }
  return { title, points };
}
