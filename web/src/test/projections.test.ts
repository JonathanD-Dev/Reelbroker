import { describe, expect, it } from 'vitest';
import {
  computeProjections,
  parseQuantity,
  DEFAULT_QUANTITY,
  MAX_QUANTITY,
} from '../lib/projections';

const rates = { optimistic: 0.4, median: 0.15, pessimistic: -0.2 };

describe('parseQuantity', () => {
  it.each([
    ['', 0],
    ['abc', 0],
    ['-3', 0],
    ['2.9', 2],
    ['999999', MAX_QUANTITY],
    ['10', 10],
    ['0', 0],
    ['100000', MAX_QUANTITY],
    ['Infinity', 0],
  ])('parseQuantity(%j) = %d', (raw, expected) => {
    expect(parseQuantity(raw)).toBe(expected);
  });
  it('default quantity is 10', () => {
    expect(DEFAULT_QUANTITY).toBe(10);
  });
});

describe('computeProjections', () => {
  const p = computeProjections(100, 10, rates);

  it('has 13 points (months 0..12) per scenario', () => {
    for (const k of ['optimistic', 'median', 'pessimistic'] as const) {
      expect(p[k]).toHaveLength(13);
      expect(p[k][0].month).toBe(0);
      expect(p[k][12].month).toBe(12);
    }
  });
  it('all scenarios start at price * quantity', () => {
    expect(p.optimistic[0].value).toBe(1000);
    expect(p.median[0].value).toBe(1000);
    expect(p.pessimistic[0].value).toBe(1000);
  });
  it('ends at start * (1 + rate) after 12 months', () => {
    expect(p.optimistic[12].value).toBeCloseTo(1400, 2);
    expect(p.median[12].value).toBeCloseTo(1150, 2);
    expect(p.pessimistic[12].value).toBeCloseTo(800, 2);
  });
  it('keeps optimistic >= median >= pessimistic at every month', () => {
    for (let m = 0; m <= 12; m++) {
      expect(p.optimistic[m].value).toBeGreaterThanOrEqual(p.median[m].value);
      expect(p.median[m].value).toBeGreaterThanOrEqual(p.pessimistic[m].value);
    }
  });
  it('is linear in quantity (within rounding)', () => {
    const p2 = computeProjections(100, 20, rates);
    for (const k of ['optimistic', 'median', 'pessimistic'] as const) {
      p[k].forEach((pt, i) => {
        expect(Math.abs(p2[k][i].value - 2 * pt.value)).toBeLessThanOrEqual(0.011);
      });
    }
  });
  it('returns all zeros for quantity 0', () => {
    const z = computeProjections(100, 0, rates);
    for (const k of ['optimistic', 'median', 'pessimistic'] as const) {
      expect(z[k].every((pt) => pt.value === 0)).toBe(true);
    }
  });
  it('rounds values to 2 decimals', () => {
    const r = computeProjections(118.5, 7, rates);
    for (const pt of r.median) {
      expect(Math.round(pt.value * 100) / 100).toBe(pt.value);
    }
  });
  it('honors a custom horizon', () => {
    expect(computeProjections(100, 1, rates, 6).median).toHaveLength(7);
  });
});
