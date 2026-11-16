import type { Series } from '../types';
import { getRange, toPoints } from '../lib/chartMath';

interface MiniChartProps {
  series: Series;
}

const W = 120;
const H = 60;

export function MiniChart({ series }: MiniChartProps) {
  const values = series.points.map((p) => p.value);
  const first = values[0];
  const last = values[values.length - 1];
  const change = first ? (last - first) / first : 0;
  const trend = Math.abs(change) < 0.02 ? 'stable' : change > 0 ? 'en hausse' : 'en baisse';
  const color = last >= first ? 'var(--green)' : 'var(--red)';
  const points = toPoints(values, W, H, getRange(values));

  return (
    <figure className="mini-chart">
      <figcaption>{series.title}</figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${series.title} : ${trend}`}
        preserveAspectRatio="none"
      >
        <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </figure>
  );
}
