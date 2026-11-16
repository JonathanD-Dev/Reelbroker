import { useReducer } from 'react';
import type { FeedItem, Product, Ticker } from '../types';
import {
  AHEAD_MIN,
  NEW_ROUND_GAP,
  buildPage,
  sanitizeItems,
  seqOfKey,
  shownInRound,
  tickerOfKey,
  toItems,
} from '../lib/feed';
import { readFeedSession } from '../lib/feedSession';

export interface FeedState {
  items: FeedItem[];
  nextPage: number;
  nextSeq: number;
  /** Index in `items` of the first card of the current round (0 until every product was shown once). */
  roundStart?: number;
}

/** `cycle`: when every visible product was shown in this round, start a new round instead of ending. */
export type FeedAction =
  | { type: 'append'; visible: readonly Product[]; cycle?: boolean }
  | { type: 'ensureAhead'; fromKey: string; visible: readonly Product[]; cycle?: boolean }
  | { type: 'prune'; isHidden: (t: Ticker) => boolean }
  | { type: 'reset'; visible: readonly Product[] };

const EMPTY: FeedState = { items: [], nextPage: 0, nextSeq: 0 };

function append(state: FeedState, visible: readonly Product[], cycle = false): FeedState {
  const roundStart = Math.min(state.roundStart ?? 0, state.items.length);
  let page = buildPage(visible, shownInRound(state.items, roundStart));
  let nextRound: number | undefined;
  if (page.length === 0 && cycle && state.items.length > 0 && visible.length > 1) {
    // New round: the ranking again from the top, without the last cards shown.
    // A single product is not repeated forever: the feed then ends.
    const gap = Math.min(NEW_ROUND_GAP, visible.length - 1);
    page = buildPage(visible, new Set(state.items.slice(-gap).map((i) => i.product.ticker)));
    nextRound = state.items.length;
  }
  if (page.length === 0) return state;
  const next: FeedState = {
    items: [...state.items, ...toItems(page, state.nextSeq)],
    nextPage: state.nextPage + 1,
    nextSeq: state.nextSeq + page.length,
  };
  const round = nextRound ?? state.roundStart;
  if (round) next.roundStart = round;
  return next;
}

export function feedReducer(state: FeedState, action: FeedAction): FeedState {
  switch (action.type) {
    case 'append':
      return append(state, action.visible, action.cycle);
    case 'ensureAhead': {
      const index = state.items.findIndex((i) => i.key === action.fromKey);
      let next = state;
      for (let n = 0; n < 3; n++) {
        const ahead = index < 0 ? 0 : next.items.length - index - 1;
        if (ahead >= AHEAD_MIN) break;
        const grown = append(next, action.visible, action.cycle);
        if (grown === next) break;
        next = grown;
      }
      return next;
    }
    case 'prune': {
      const items = sanitizeItems(state.items, action.isHidden);
      if (!state.roundStart) return { ...state, items };
      // Keep the round boundary on the same card: count the kept items before it.
      const kept = new Set(items.map((i) => i.key));
      const roundStart = state.items.slice(0, state.roundStart).filter((i) => kept.has(i.key)).length;
      return { ...state, items, roundStart };
    }
    case 'reset':
      return append({ ...EMPTY }, action.visible);
  }
}

export interface RestoredFeed {
  state: FeedState;
  activeKey: string | null;
}

/** Rebuilds the feed from the sessionStorage snapshot, or returns null if unusable. */
export function restoreFeed(
  products: readonly Product[],
  isHidden: (t: Ticker) => boolean,
  sessionKey?: string,
): RestoredFeed | null {
  const session = readFeedSession(sessionKey);
  if (!session) return null;
  const byTicker = new Map(products.map((p) => [p.ticker, p]));
  const known: FeedItem[] = [];
  const keys = new Set<string>();
  let seen = new Set<Ticker>();
  const boundary = Math.min(session.roundStart ?? 0, session.keys.length);
  let roundAt = 0;
  session.keys.forEach((key, idx) => {
    if (idx === boundary && boundary > 0) {
      seen = new Set();
      roundAt = known.length;
    }
    const product = byTicker.get(tickerOfKey(key));
    // Each product once per round (older snapshots of the random feed could repeat them).
    if (product && !seen.has(product.ticker) && !keys.has(key)) {
      seen.add(product.ticker);
      keys.add(key);
      known.push({ key, product });
    }
  });
  const items = sanitizeItems(known, isHidden);
  if (items.length === 0) return null;
  const maxSeq = items.reduce((m, i) => Math.max(m, seqOfKey(i.key)), -1);
  let activeKey = session.activeKey;
  if (activeKey === null || !items.some((i) => i.key === activeKey)) {
    const rank = Math.max(session.keys.indexOf(activeKey ?? ''), 0);
    activeKey = items[Math.min(rank, items.length - 1)].key;
  }
  const state: FeedState = { items, nextPage: session.nextPage, nextSeq: Math.max(session.nextSeq, maxSeq + 1) };
  if (roundAt > 0) {
    const kept = new Set(items.map((i) => i.key));
    const r = known.slice(0, roundAt).filter((i) => kept.has(i.key)).length;
    if (r > 0) state.roundStart = r;
  }
  return { state, activeKey };
}

export function createFeed(visible: readonly Product[]): FeedState {
  return feedReducer(EMPTY, { type: 'reset', visible });
}

/** New feed whose first card is `first` (opened from the saved page), never twice in a row. */
export function createFeedStartingWith(
  visible: readonly Product[],
  first: Product,
): FeedState {
  const base = createFeed(visible.filter((p) => p.ticker !== first.ticker));
  return {
    ...base,
    items: [{ key: `${first.ticker}#${base.nextSeq}`, product: first }, ...base.items],
    nextSeq: base.nextSeq + 1,
  };
}

export function useInfiniteFeed(initial: FeedState) {
  return useReducer(feedReducer, initial);
}
