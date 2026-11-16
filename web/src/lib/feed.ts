import type { FeedItem, Product, Ticker } from '../types';

export const PAGE_SIZE = 8;
export const RENDER_RADIUS = 2;
export const AHEAD_MIN = 8;
/** The first page of a new round skips the last cards shown, so a card is never seen twice in a row. */
export const NEW_ROUND_GAP = 3;

/**
 * Next page of the feed: the next PAGE_SIZE products not shown yet, in the order of `visible`.
 * `visible` is the backend ranking (fit to the profile, then learned likes, then diversification),
 * so a round of the feed follows it and never repeats a product. Once every product was shown, the
 * reducer starts a new round when asked to cycle (infinite feed).
 */
export function buildPage(visible: readonly Product[], shown: ReadonlySet<Ticker>): Product[] {
  return visible.filter((p) => !shown.has(p.ticker)).slice(0, PAGE_SIZE);
}

/** Tickers shown since the start of the current round (`roundStart` = index of its first item). */
export function shownInRound(items: readonly FeedItem[], roundStart = 0): Set<Ticker> {
  return new Set(items.slice(roundStart).map((i) => i.product.ticker));
}

/** True while some visible product has not been shown in the current round yet. */
export function hasUnshown(visible: readonly Product[], items: readonly FeedItem[], roundStart = 0): boolean {
  const shown = shownInRound(items, roundStart);
  return visible.some((p) => !shown.has(p.ticker));
}

/** Number of visible products not shown yet in the current round. */
export function countUnshown(visible: readonly Product[], items: readonly FeedItem[], roundStart = 0): number {
  const shown = shownInRound(items, roundStart);
  return visible.filter((p) => !shown.has(p.ticker)).length;
}

export function toItems(products: readonly Product[], startSeq: number): FeedItem[] {
  return products.map((product, i) => ({ key: `${product.ticker}#${startSeq + i}`, product }));
}

export function tickerOfKey(key: string): Ticker {
  const i = key.lastIndexOf('#');
  return i < 0 ? key : key.slice(0, i);
}

export function seqOfKey(key: string): number {
  const n = Number(key.slice(key.lastIndexOf('#') + 1));
  return Number.isInteger(n) && n >= 0 ? n : -1;
}

/** Drops hidden products, then collapses adjacent duplicates (keeps the first). */
export function sanitizeItems(
  items: readonly FeedItem[],
  isHidden: (t: Ticker) => boolean,
): FeedItem[] {
  const out: FeedItem[] = [];
  for (const item of items) {
    if (isHidden(item.product.ticker)) continue;
    if (out.length > 0 && out[out.length - 1].product.ticker === item.product.ticker) continue;
    out.push(item);
  }
  return out;
}

export function isHeavy(index: number, activeIndex: number): boolean {
  return Math.abs(index - activeIndex) <= RENDER_RADIUS;
}

/** Scroll offset that keeps the card following a removed one exactly in place. */
export function computeScrollTopAfterPrune(
  oldActiveIndex: number,
  removedAbove: number,
  height: number,
): number {
  return Math.max(oldActiveIndex - removedAbove, 0) * height;
}
