import type { Series } from '../types';
import { getRange, toPoints } from '../lib/chartMath';
import type { Trend } from '../lib/saved';

const W = 70;
const H = 32;
const COLOR: Record<Trend, string> = { up: 'var(--green)', down: 'var(--red)', flat: '#7d7d7d' };

/** Decorative trend line for list rows (the trend is also given as text). */
export function Sparkline({ series, trend }: { series: Series; trend: Trend }) {
  const values = series.points.map((p) => p.value);
  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="none"
    >
      <polyline
        points={toPoints(values, W, H, getRange(values), 2)}
        fill="none"
        stroke={COLOR[trend]}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
