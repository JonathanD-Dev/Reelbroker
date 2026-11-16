import { useCallback, useEffect, useRef, useState } from 'react';

export const ACTIVE_THRESHOLD = 0.6;

/** Tracks which reel is at least 60 % visible inside the feed scroller. */
export function useActiveReel(root: HTMLElement | null, initialKey: string | null) {
  const [activeKey, setActiveKey] = useState<string | null>(initialKey);
  const elements = useRef(new Set<HTMLElement>());
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= ACTIVE_THRESHOLD) {
            const key = (entry.target as HTMLElement).dataset.key;
            if (key) setActiveKey(key);
          }
        }
      },
      { root, threshold: [ACTIVE_THRESHOLD] },
    );
    observerRef.current = observer;
    elements.current.forEach((el) => observer.observe(el));
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [root]);

  // Callback ref with cleanup: the observer is created after children mount, so elements are queued.
  const registerReel = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    elements.current.add(el);
    observerRef.current?.observe(el);
    return () => {
      elements.current.delete(el);
      observerRef.current?.unobserve(el);
    };
  }, []);

  return { activeKey, setActiveKey, registerReel };
}

/**
 * Calls `onReach` when the sentinel enters the (extended) viewport. The observer is recreated
 * when `itemsCount` changes so a sentinel still inside the margin triggers another callback.
 */
export function useSentinel(
  root: HTMLElement | null,
  sentinel: HTMLElement | null,
  itemsCount: number,
  onReach: () => void,
) {
  const onReachRef = useRef(onReach);
  useEffect(() => {
    onReachRef.current = onReach;
  });
  useEffect(() => {
    if (!root || !sentinel || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onReachRef.current();
      },
      { root, rootMargin: '0px 0px 200% 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [root, sentinel, itemsCount]);
}
