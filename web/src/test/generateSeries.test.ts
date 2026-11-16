import { describe, expect, it } from 'vitest';
import { generateSeries, hashString, mulberry32 } from '../data/generateSeries';
import { PRODUCTS } from '../data/products';

const base = { seed: 42, start: 100, volatility: 0.03, title: 't' };

describe('mulberry32 / hashString', () => {
  it('PRNG is deterministic and within [0,1)', () => {
    const a = mulberry32(1);
    const b = mulberry32(1);
    for (let i = 0; i < 50; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('hashString is stable and differs between inputs', () => {
    expect(hashString('NVDA0')).toBe(hashString('NVDA0'));
    expect(hashString('NVDA0')).not.toBe(hashString('NVDA1'));
  });
});

describe('generateSeries', () => {
  it('is deterministic', () => {
    expect(generateSeries({ ...base, drift: 0.3 })).toEqual(generateSeries({ ...base, drift: 0.3 }));
  });
  it('differs for another seed', () => {
    expect(generateSeries({ ...base, drift: 0.3 })).not.toEqual(
      generateSeries({ ...base, seed: 43, drift: 0.3 }),
    );
  });
  it('has 12 points by default with labels M-11..M0', () => {
    const s = generateSeries({ ...base, drift: 0 });
    expect(s.points).toHaveLength(12);
    expect(s.points[0].label).toBe('M-11');
    expect(s.points[11].label).toBe('M0');
    expect(s.title).toBe('t');
  });
  it('honors count', () => {
    expect(generateSeries({ ...base, drift: 0, count: 5 }).points).toHaveLength(5);
  });
  it('first and last points are exact', () => {
    const s = generateSeries({ ...base, drift: 0.3 });
    expect(s.points[0].value).toBe(100);
    expect(s.points[11].value).toBe(130);
  });
  it('bullish: last > first', () => {
    const s = generateSeries({ ...base, drift: 0.3 });
    expect(s.points[11].value).toBeGreaterThan(s.points[0].value);
  });
  it('bearish: last < first', () => {
    const s = generateSeries({ ...base, drift: -0.15 });
    expect(s.points[11].value).toBeLessThan(s.points[0].value);
    expect(s.points[11].value).toBe(85);
  });
  it('flat: last equals first', () => {
    const s = generateSeries({ ...base, drift: 0, volatility: 0.02 });
    expect(s.points[11].value).toBe(s.points[0].value);
  });
  it('values stay positive and rounded to 2 decimals', () => {
    const s = generateSeries({ ...base, start: 1, drift: -0.5, volatility: 0.9 });
    for (const p of s.points) {
      expect(p.value).toBeGreaterThan(0);
      expect(Math.round(p.value * 100) / 100).toBe(p.value);
    }
  });
});

describe('PRODUCTS mock data', () => {
  it('has 16 products starting with NVDA, unique tickers', () => {
    expect(PRODUCTS).toHaveLength(16);
    expect(PRODUCTS[0].ticker).toBe('NVDA');
    expect(new Set(PRODUCTS.map((p) => p.ticker)).size).toBe(16);
  });
  it('has valid prices, rates ordering, reasons and series', () => {
    for (const p of PRODUCTS) {
      expect(p.price).toBeGreaterThan(0);
      expect(p.rates.optimistic).toBeGreaterThan(p.rates.median);
      expect(p.rates.median).toBeGreaterThan(p.rates.pessimistic);
      expect(p.reasons.length).toBeGreaterThanOrEqual(3);
      expect(p.reasons.length).toBeLessThanOrEqual(4);
      expect(p.history).toHaveLength(2);
      for (const s of p.history) expect(s.points.length).toBeGreaterThanOrEqual(2);
    }
  });
});
