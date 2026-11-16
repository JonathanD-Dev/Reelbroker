/** Base key; the feed position is stored per portfolio under `feedSessionKey(scope)`. */
// v2: the feed follows the backend ranking; positions saved by the old random feed are ignored.
export const FEED_SESSION_KEY = 'buy-demo:feed-session-v2';

export const feedSessionKey = (scope: string) => `${FEED_SESSION_KEY}:${scope}`;

export interface FeedSession {
  keys: string[];
  activeKey: string | null;
  nextPage: number;
  nextSeq: number;
  /** Index in `keys` of the first card of the current round (infinite feed); absent = 0. */
  roundStart?: number;
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

export function readFeedSession(key: string = FEED_SESSION_KEY): FeedSession | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return null;
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return null;
    const o = v as Record<string, unknown>;
    if (!Array.isArray(o.keys) || !o.keys.every((k) => typeof k === 'string')) return null;
    if (o.activeKey !== null && typeof o.activeKey !== 'string') return null;
    if (!isCount(o.nextPage) || !isCount(o.nextSeq)) return null;
    return {
      keys: o.keys as string[],
      activeKey: o.activeKey as string | null,
      nextPage: o.nextPage,
      nextSeq: o.nextSeq,
      ...(isCount(o.roundStart) && o.roundStart > 0 ? { roundStart: o.roundStart } : {}),
    };
  } catch {
    return null;
  }
}

export function writeFeedSession(session: FeedSession, key: string = FEED_SESSION_KEY): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(session));
  } catch {
    // storage unavailable or full: ignore silently
  }
}
