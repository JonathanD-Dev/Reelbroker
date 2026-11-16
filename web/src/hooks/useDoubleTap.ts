import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

const MAX_INTERVAL_MS = 300;
const MAX_TAP_MOVE = 10;
const MAX_TAPS_DISTANCE = 30;
// Interactive charts ([data-chart]) are scrubbed with taps: they must not save the product.
const IGNORED = 'button, a, input, [role="menu"], [role="dialog"], [data-chart]';

interface Point {
  x: number;
  y: number;
}

const pointOf = (e: ReactPointerEvent): Point => ({
  x: Number(e.clientX) || 0,
  y: Number(e.clientY) || 0,
});

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Detects two quick taps (mouse or touch) through pointer events only. */
export function useDoubleTap(onDouble: () => void) {
  const down = useRef<Point | null>(null);
  const lastTap = useRef<{ at: number; point: Point } | null>(null);
  const callback = useRef(onDouble);
  callback.current = onDouble;

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    down.current = (e.target as Element).closest(IGNORED) ? null : pointOf(e);
  }, []);

  const onPointerUp = useCallback((e: ReactPointerEvent) => {
    const start = down.current;
    down.current = null;
    if (!start) return;
    const end = pointOf(e);
    if (distance(start, end) >= MAX_TAP_MOVE) {
      lastTap.current = null;
      return;
    }
    const now = Date.now();
    const prev = lastTap.current;
    if (prev && now - prev.at <= MAX_INTERVAL_MS && distance(prev.point, end) < MAX_TAPS_DISTANCE) {
      lastTap.current = null;
      callback.current();
    } else {
      lastTap.current = { at: now, point: end };
    }
  }, []);

  return { onPointerDown, onPointerUp };
}
