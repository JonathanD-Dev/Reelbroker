import { describe, expect, it } from 'vitest';
import { PRODUCTS } from '../data/products';
import { contrastRatio, mixWithBlack } from '../lib/color';

describe('PRODUCTS', () => {
  it('has at least 15 products, NVDA first', () => {
    expect(PRODUCTS.length).toBeGreaterThanOrEqual(15);
    expect(PRODUCTS).toHaveLength(16);
    expect(PRODUCTS[0].ticker).toBe('NVDA');
  });

  it('has unique tickers', () => {
    const tickers = PRODUCTS.map((p) => p.ticker);
    expect(new Set(tickers).size).toBe(tickers.length);
  });

  it.each(PRODUCTS.map((p) => [p.ticker, p] as const))('%s is well formed', (_t, p) => {
    expect(p.reasons).toHaveLength(3);
    p.reasons.forEach((r) => expect(r.trim()).not.toBe(''));
    expect(p.brandColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(p.price).toBeGreaterThan(0);
    expect(p.rates.optimistic).toBeGreaterThan(p.rates.median);
    expect(p.rates.median).toBeGreaterThan(p.rates.pessimistic);
    expect(p.history).toHaveLength(2);
    p.history.forEach((s) => expect(s.points.length).toBeGreaterThanOrEqual(2));
    expect(p.history[0].title).toBe('Cours (12 mois)');
    expect(p.history[1].title).toBe('Volume relatif (12 mois)');
  });

  it.each(PRODUCTS.map((p) => [p.ticker, p.brandColor] as const))(
    'white text on the lightest gradient stop of %s has contrast >= 4.5',
    (_t, color) => {
      expect(contrastRatio('#ffffff', mixWithBlack(color, 0.55))).toBeGreaterThanOrEqual(4.5);
    },
  );
});
