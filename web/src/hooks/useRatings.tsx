import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Ticker } from '../types';

/**
 * Personal note on a product ("Pour" / "Contre"). It is only a note: it neither saves the
 * product nor changes the feed. Stored per portfolio, like the saved products.
 */
export type Rating = 'up' | 'down';

export const RATING_LABEL: Record<Rating, string> = { up: 'Pour', down: 'Contre' };

export interface RatingsApi {
  get: (ticker: Ticker) => Rating | null;
  /** Sets the note, or clears it when the same note is chosen again. */
  rate: (ticker: Ticker, rating: Rating) => void;
  /** All notes of the active portfolio. */
  all: Record<Ticker, Rating>;
}

type Ratings = Record<Ticker, Rating>;

function readRatings(key: string): Ratings {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return {};
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return {};
    const out: Ratings = {};
    for (const [t, r] of Object.entries(v)) if (r === 'up' || r === 'down') out[t] = r;
    return out;
  } catch {
    return {};
  }
}

function writeRatings(key: string, ratings: Ratings): void {
  try {
    localStorage.setItem(key, JSON.stringify(ratings));
  } catch {
    // storage unavailable or full: ignore silently
  }
}

interface Loaded {
  key: string;
  ratings: Ratings;
}

/** Same reload-on-key-change behaviour as `usePersistentSet` (no write on mount or switch). */
export function useRatingsState(key: string): RatingsApi {
  const [loaded, setLoaded] = useState<Loaded>(() => ({ key, ratings: readRatings(key) }));
  const lastWritten = useRef(loaded.ratings);

  let current = loaded;
  if (loaded.key !== key) {
    current = { key, ratings: readRatings(key) };
    lastWritten.current = current.ratings;
    setLoaded(current);
  }
  const { ratings } = current;

  useEffect(() => {
    if (lastWritten.current === loaded.ratings) return;
    lastWritten.current = loaded.ratings;
    writeRatings(loaded.key, loaded.ratings);
  }, [loaded]);

  const get = useCallback((t: Ticker) => ratings[t] ?? null, [ratings]);
  const rate = useCallback((t: Ticker, rating: Rating) => {
    setLoaded((prev) => {
      const next = { ...prev.ratings };
      if (next[t] === rating) delete next[t];
      else next[t] = rating;
      return { key: prev.key, ratings: next };
    });
  }, []);

  return useMemo(() => ({ get, rate, all: ratings }), [get, rate, ratings]);
}

const RatingsContext = createContext<RatingsApi | null>(null);

export function RatingsProvider({ value, children }: { value: RatingsApi; children: ReactNode }) {
  return <RatingsContext.Provider value={value}>{children}</RatingsContext.Provider>;
}

/** Ratings API, or `null` outside the provider (components rendered alone in tests). */
export function useRatings(): RatingsApi | null {
  return useContext(RatingsContext);
}
