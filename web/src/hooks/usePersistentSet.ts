import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readList, writeList } from '../lib/storage';

export interface PersistentSet {
  has: (ticker: string) => boolean;
  toggle: (ticker: string) => void;
  add: (ticker: string) => void;
  clear: () => void;
  /** Entries in insertion order (oldest first). */
  values: readonly string[];
  /** Replaces all entries, keeping the given order (used to undo a removal). */
  replace: (list: readonly string[]) => void;
}

interface Loaded {
  key: string;
  items: Set<string>;
}

/**
 * A Set of strings mirrored in localStorage under `key`. When `key` changes (another
 * portfolio becomes active), the set is reloaded from the new key without writing anything.
 */
export function usePersistentSet(key: string): PersistentSet {
  const [loaded, setLoaded] = useState<Loaded>(() => ({ key, items: new Set(readList(key)) }));
  const lastWritten = useRef(loaded.items);

  let current = loaded;
  if (loaded.key !== key) {
    // Render-phase reset on key change (React re-renders immediately with the new state).
    current = { key, items: new Set(readList(key)) };
    lastWritten.current = current.items;
    setLoaded(current);
  }
  const { items } = current;

  // Persist after each change; never on mount or on a key switch.
  useEffect(() => {
    if (lastWritten.current === loaded.items) return;
    lastWritten.current = loaded.items;
    writeList(loaded.key, [...loaded.items]);
  }, [loaded]);

  const update = useCallback((fn: (prev: Set<string>) => Set<string>) => {
    setLoaded((prev) => ({ key: prev.key, items: fn(prev.items) }));
  }, []);

  const has = useCallback((t: string) => items.has(t), [items]);
  const toggle = useCallback(
    (t: string) =>
      update((prev) => {
        const next = new Set(prev);
        if (next.has(t)) next.delete(t);
        else next.add(t);
        return next;
      }),
    [update],
  );
  const add = useCallback(
    (t: string) => update((prev) => (prev.has(t) ? prev : new Set(prev).add(t))),
    [update],
  );
  const clear = useCallback(() => update(() => new Set()), [update]);
  const replace = useCallback(
    (list: readonly string[]) => update(() => new Set(list)),
    [update],
  );
  const values = useMemo(() => [...items], [items]);

  return useMemo(
    () => ({ has, toggle, add, clear, values, replace }),
    [has, toggle, add, clear, values, replace],
  );
}
