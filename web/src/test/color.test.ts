import { describe, expect, it } from 'vitest';
import { contrastRatio, mixWithBlack } from '../lib/color';

describe('mixWithBlack', () => {
  it('returns the same color for ratio 1 and black for ratio 0', () => {
    expect(mixWithBlack('#76b900', 1)).toBe('#76b900');
    expect(mixWithBlack('#76b900', 0)).toBe('#000000');
  });

  it('scales each channel', () => {
    expect(mixWithBlack('#ffffff', 0.5)).toBe('#808080');
    expect(mixWithBlack('#ff0000', 0.55)).toBe('#8c0000');
  });

  it('clamps the ratio and rejects invalid colors', () => {
    expect(mixWithBlack('#102030', 2)).toBe('#102030');
    expect(mixWithBlack('#102030', -1)).toBe('#000000');
    expect(() => mixWithBlack('red', 0.5)).toThrow();
    expect(() => mixWithBlack('#fff', 0.5)).toThrow();
  });
});

describe('contrastRatio', () => {
  it('is about 21 for black on white, symmetric, and 1 for identical colors', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#336699', '#336699')).toBeCloseTo(1, 5);
  });

  it('matches a known WCAG value (#767676 on white is ~4.54)', () => {
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 1);
  });
});
