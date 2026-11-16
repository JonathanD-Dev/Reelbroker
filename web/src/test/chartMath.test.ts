import { describe, expect, it } from 'vitest';
import { getRange, toPoints } from '../lib/chartMath';

const parse = (s: string) => s.split(' ').map((p) => p.split(',').map(Number) as [number, number]);

describe('getRange', () => {
  it('widens constant values by ±1', () => {
    expect(getRange([5, 5, 5])).toEqual({ min: 4, max: 6 });
  });
  it('applies 5% relative padding by default', () => {
    const r = getRange([0, 100]);
    expect(r.min).toBeCloseTo(-5);
    expect(r.max).toBeCloseTo(105);
  });
  it('honors a custom padding', () => {
    expect(getRange([0, 10], 0)).toEqual({ min: 0, max: 10 });
  });
  it('handles an empty array without throwing', () => {
    const r = getRange([]);
    expect(r.max).toBeGreaterThan(r.min);
  });
});

describe('toPoints', () => {
  const range = { min: 0, max: 10 };
  it('returns one point per value', () => {
    expect(parse(toPoints([1, 2, 3, 4], 100, 50, range))).toHaveLength(4);
  });
  it('spreads x uniformly from margin to width - margin', () => {
    const pts = parse(toPoints([1, 2, 3], 100, 50, range, 4));
    expect(pts[0][0]).toBe(4);
    expect(pts[1][0]).toBe(50);
    expect(pts[2][0]).toBe(96);
  });
  it('inverts y: max at top (margin), min at bottom (height - margin)', () => {
    const pts = parse(toPoints([0, 10], 100, 50, range, 4));
    expect(pts[0][1]).toBe(46);
    expect(pts[1][1]).toBe(4);
  });
  it('larger values give smaller y', () => {
    const pts = parse(toPoints([2, 5, 8], 100, 50, range));
    expect(pts[0][1]).toBeGreaterThan(pts[1][1]);
    expect(pts[1][1]).toBeGreaterThan(pts[2][1]);
  });
  it('centers a single value horizontally', () => {
    expect(parse(toPoints([5], 100, 50, range, 4))[0][0]).toBe(50);
  });
  it('does not produce NaN on a degenerate range', () => {
    expect(toPoints([3, 3], 100, 50, { min: 3, max: 3 })).not.toMatch(/NaN/);
  });
  it('returns an empty string for no values', () => {
    expect(toPoints([], 100, 50, range)).toBe('');
  });
});
