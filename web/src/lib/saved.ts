import type { Product, Ticker } from '../types';

export type SavedSort = 'recent' | 'change' | 'name';
export type Trend = 'up' | 'down' | 'flat';

/** Relative price change over the 12-month history (first -> last point). */
export function changeOf(product: Product): number {
  const points = product.history[0].points;
  const first = points[0]?.value ?? 0;
  const last = points[points.length - 1]?.value ?? 0;
  return first ? (last - first) / first : 0;
}

/** Same 2 % "stable" threshold as the feed mini-charts. */
export function trendOf(change: number): Trend {
  if (Math.abs(change) < 0.02) return 'flat';
  return change > 0 ? 'up' : 'down';
}

const percent = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});

export function formatChange(change: number): string {
  return percent.format(change);
}

const normalize = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/** Case- and accent-insensitive match on ticker or name. */
export function matchesQuery(product: Product, query: string): boolean {
  const q = normalize(query);
  return q === '' || normalize(product.ticker).includes(q) || normalize(product.name).includes(q);
}

/**
 * Saved products, most recently saved first (`savedTickers` is in insertion order),
 * without hidden or unknown tickers.
 */
export function savedProducts(
  products: readonly Product[],
  savedTickers: readonly Ticker[],
  isHidden: (t: Ticker) => boolean,
): Product[] {
  const byTicker = new Map(products.map((p) => [p.ticker, p]));
  const list: Product[] = [];
  for (let i = savedTickers.length - 1; i >= 0; i--) {
    const product = byTicker.get(savedTickers[i]);
    if (product && !isHidden(product.ticker)) list.push(product);
  }
  return list;
}

/** Filters by query then sorts. Input order is kept for 'recent'. */
export function filterAndSort(list: readonly Product[], query: string, sort: SavedSort): Product[] {
  const out = list.filter((p) => matchesQuery(p, query));
  if (sort === 'change') out.sort((a, b) => changeOf(b) - changeOf(a));
  if (sort === 'name') out.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
  return out;
}
