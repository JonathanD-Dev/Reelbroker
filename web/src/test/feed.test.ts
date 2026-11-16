import { describe, expect, it } from 'vitest';
import { PRODUCTS } from '../data/products';
import type { FeedItem, Product } from '../types';
import {
  PAGE_SIZE,
  buildPage,
  computeScrollTopAfterPrune,
  hasUnshown,
  isHeavy,
  sanitizeItems,
  tickerOfKey,
  toItems,
} from '../lib/feed';
import { feedReducer, restoreFeed, createFeed, createFeedStartingWith } from '../hooks/useInfiniteFeed';
import { writeFeedSession } from '../lib/feedSession';

const take = (n: number) => PRODUCTS.slice(0, n);
const tickers = (ps: readonly Product[]) => ps.map((p) => p.ticker);

/** All pages of the finite feed, following `visible` order. */
function chain(visible: readonly Product[]): Product[] {
  const all: Product[] = [];
  for (;;) {
    const page = buildPage(visible, new Set(all.map((p) => p.ticker)));
    if (page.length === 0) return all;
    all.push(...page);
  }
}

describe('buildPage', () => {
  it('returns the first PAGE_SIZE products in the order of visible when nothing was shown', () => {
    expect(tickers(buildPage(PRODUCTS, new Set()))).toEqual(tickers(PRODUCTS.slice(0, PAGE_SIZE)));
  });

  it('skips shown tickers and keeps the order of visible', () => {
    const shown = new Set(tickers(PRODUCTS.slice(0, 3)));
    expect(tickers(buildPage(PRODUCTS, shown))).toEqual(tickers(PRODUCTS.slice(3, 3 + PAGE_SIZE)));
  });

  it('has no randomness: same input, same output', () => {
    const shown = new Set(tickers(take(2)));
    expect(tickers(buildPage(PRODUCTS, shown))).toEqual(tickers(buildPage(PRODUCTS, shown)));
  });

  it('pages are 8, 8, 4 for 20 distinct products, then empty', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => ({ ...PRODUCTS[i % PRODUCTS.length], ticker: `T${i}` }));
    const shown = new Set<string>();
    const sizes: number[] = [];
    for (let i = 0; i < 4; i++) {
      const page = buildPage(twenty, shown);
      sizes.push(page.length);
      page.forEach((p) => shown.add(p.ticker));
    }
    expect(sizes).toEqual([8, 8, 4, 0]);
  });

  it('shows each product at most once and follows the visible order', () => {
    const all = chain(PRODUCTS);
    expect(tickers(all)).toEqual(tickers(PRODUCTS));
    expect(new Set(tickers(all)).size).toBe(all.length);
  });

  it('returns fewer than PAGE_SIZE when few products are visible', () => {
    expect(buildPage(take(2), new Set())).toHaveLength(2);
  });

  it('returns [] for no visible product or when everything was shown', () => {
    expect(buildPage([], new Set())).toEqual([]);
    expect(buildPage(take(3), new Set(tickers(take(3))))).toEqual([]);
  });
});

describe('hasUnshown', () => {
  it('is true while a visible product is missing from the items, false once all are shown', () => {
    const items = toItems(take(3), 0);
    expect(hasUnshown(take(4), items)).toBe(true);
    expect(hasUnshown(take(3), items)).toBe(false);
    expect(hasUnshown([], items)).toBe(false);
  });
});

describe('keys and items', () => {
  it('toItems builds unique keys from a monotone sequence and tickerOfKey inverts them', () => {
    const items = [...toItems(chain(PRODUCTS), 0)];
    expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
    items.forEach((i) => expect(tickerOfKey(i.key)).toBe(i.product.ticker));
    const more = toItems(take(2), 100);
    expect(more.map((i) => i.key)).toEqual(['NVDA#100', 'AAPL#101']);
  });

  it('tickerOfKey cuts at the last #', () => {
    expect(tickerOfKey('BRK#B#12')).toBe('BRK#B');
    expect(tickerOfKey('NOSEQ')).toBe('NOSEQ');
  });
});

describe('sanitizeItems', () => {
  const [a, b] = take(2);
  const mk = (...ps: Product[]): FeedItem[] => toItems(ps, 0);

  it('removes hidden tickers (all occurrences)', () => {
    const out = sanitizeItems(mk(a, b, a, b, a), (t) => t === b.ticker);
    expect(out.map((i) => i.product.ticker)).toEqual([a.ticker]);
  });

  it('collapses adjacent duplicates created by the removal (A B A, B hidden -> A)', () => {
    const out = sanitizeItems(mk(a, b, a), (t) => t === b.ticker);
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe('NVDA#0'); // the first one is kept
  });

  it('keeps the list unchanged when nothing is hidden', () => {
    const items = mk(a, b, a, b);
    expect(sanitizeItems(items, () => false)).toEqual(items);
  });

  it('returns [] when everything is hidden', () => {
    expect(sanitizeItems(mk(a, b), () => true)).toEqual([]);
  });
});

describe('isHeavy and computeScrollTopAfterPrune', () => {
  it('isHeavy covers active ± 2 only', () => {
    const heavy = [0, 1, 2, 3, 4, 5, 6, 7].filter((i) => isHeavy(i, 4));
    expect(heavy).toEqual([2, 3, 4, 5, 6]);
  });

  it('computeScrollTopAfterPrune keeps the following card in place', () => {
    expect(computeScrollTopAfterPrune(3, 0, 800)).toBe(2400);
    expect(computeScrollTopAfterPrune(3, 2, 800)).toBe(800);
    expect(computeScrollTopAfterPrune(1, 5, 800)).toBe(0);
  });
});

describe('feedReducer', () => {
  it('reset builds page 0 and append continues sequences without key reuse, in ranked order', () => {
    let s = createFeed(PRODUCTS);
    expect(s.items).toHaveLength(PAGE_SIZE);
    expect(s.nextPage).toBe(1);
    s = feedReducer(s, { type: 'append', visible: PRODUCTS });
    s = feedReducer(s, { type: 'append', visible: PRODUCTS });
    expect(s.items).toHaveLength(PRODUCTS.length);
    expect(new Set(s.items.map((i) => i.key)).size).toBe(s.items.length);
    expect(s.items.map((i) => i.product.ticker)).toEqual(tickers(PRODUCTS));
  });

  it('is finite: once every product was shown, append returns the same state', () => {
    let s = createFeed(PRODUCTS);
    for (let i = 0; i < 5; i++) s = feedReducer(s, { type: 'append', visible: PRODUCTS });
    expect(s.items).toHaveLength(PRODUCTS.length);
    expect(feedReducer(s, { type: 'append', visible: PRODUCTS })).toBe(s);
  });

  it('ensureAhead stops when nothing more can be added', () => {
    let s = createFeed(take(3));
    const last = s.items[s.items.length - 1];
    s = feedReducer(s, { type: 'ensureAhead', fromKey: last.key, visible: take(3) });
    expect(s.items).toHaveLength(3);
  });

  it('createFeedStartingWith puts first first, then the ranked order without it', () => {
    const first = PRODUCTS[5];
    let s = createFeedStartingWith(PRODUCTS, first);
    for (let i = 0; i < 4; i++) s = feedReducer(s, { type: 'append', visible: PRODUCTS });
    expect(tickers(s.items.map((i) => i.product))).toEqual([
      first.ticker,
      ...tickers(PRODUCTS.filter((p) => p.ticker !== first.ticker)),
    ]);
  });

  it('prune keeps keys stable and append after prune never reuses a key', () => {
    let s = createFeed(PRODUCTS);
    const hiddenTicker = s.items[0].product.ticker;
    const before = new Set(s.items.map((i) => i.key));
    s = feedReducer(s, { type: 'prune', isHidden: (t) => t === hiddenTicker });
    s.items.forEach((i) => expect(before.has(i.key)).toBe(true));
    const kept = new Set(s.items.map((i) => i.key));
    s = feedReducer(s, { type: 'append', visible: PRODUCTS });
    const added = s.items.filter((i) => !kept.has(i.key));
    added.forEach((i) => expect(before.has(i.key)).toBe(false));
  });

  it('ensureAhead guarantees enough cards after a given key', () => {
    let s = createFeed(PRODUCTS);
    const last = s.items[s.items.length - 1];
    s = feedReducer(s, { type: 'ensureAhead', fromKey: last.key, visible: PRODUCTS });
    const idx = s.items.findIndex((i) => i.key === last.key);
    expect(s.items.length - idx - 1).toBeGreaterThanOrEqual(8);
  });

  it('single visible product: the feed stays finite', () => {
    let s = createFeed(take(1));
    expect(s.items).toHaveLength(1);
    s = feedReducer(s, { type: 'append', visible: take(1) });
    expect(s.items).toHaveLength(1);
  });
});

describe('restoreFeed', () => {
  it('returns null without session or when nothing usable remains', () => {
    expect(restoreFeed(PRODUCTS, () => false)).toBeNull();
    writeFeedSession({ keys: ['ZZZZ#0'], activeKey: 'ZZZZ#0', nextPage: 1, nextSeq: 1 });
    expect(restoreFeed(PRODUCTS, () => false)).toBeNull();
  });

  it('restores identical keys and active key, and keeps nextSeq above every seq', () => {
    writeFeedSession({
      keys: ['NVDA#0', 'AAPL#1', 'MSFT#9'],
      activeKey: 'AAPL#1',
      nextPage: 1,
      nextSeq: 2,
    });
    const r = restoreFeed(PRODUCTS, () => false)!;
    expect(r.state.items.map((i) => i.key)).toEqual(['NVDA#0', 'AAPL#1', 'MSFT#9']);
    expect(r.activeKey).toBe('AAPL#1');
    expect(r.state.nextSeq).toBe(10);
  });

  it('keeps only the first occurrence of each ticker from an old snapshot', () => {
    writeFeedSession({
      keys: ['NVDA#0', 'AAPL#1', 'NVDA#2', 'AAPL#3', 'MSFT#4'],
      activeKey: 'AAPL#1',
      nextPage: 1,
      nextSeq: 5,
    });
    const r = restoreFeed(PRODUCTS, () => false)!;
    expect(r.state.items.map((i) => i.key)).toEqual(['NVDA#0', 'AAPL#1', 'MSFT#4']);
    expect(r.activeKey).toBe('AAPL#1');
  });

  it('falls back to the bounded rank when the active card was hidden', () => {
    writeFeedSession({
      keys: ['NVDA#0', 'AAPL#1', 'MSFT#2', 'TSLA#3'],
      activeKey: 'MSFT#2',
      nextPage: 1,
      nextSeq: 4,
    });
    const r = restoreFeed(PRODUCTS, (t) => t === 'MSFT')!;
    expect(r.state.items.map((i) => i.key)).toEqual(['NVDA#0', 'AAPL#1', 'TSLA#3']);
    expect(r.activeKey).toBe('TSLA#3');
  });
});
