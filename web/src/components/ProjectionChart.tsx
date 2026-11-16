import type { Projections, ScenarioKey } from '../types';

import { getRange, toPoints } from '../lib/chartMath';

interface ProjectionChartProps {
  projections: Projections;
  quantity: number;
}

const W = 300;
const H = 160;
const MARGIN = 6;

const SCENARIOS: { key: ScenarioKey; label: string; color: string }[] = [
  { key: 'optimistic', label: 'Optimiste', color: '#3e6246' },
  { key: 'median', label: 'Médian', color: '#111111' },
  { key: 'pessimistic', label: 'Pessimiste', color: '#ba1218' },
];

export function ProjectionChart({ projections, quantity }: ProjectionChartProps) {
  if (quantity === 0) {
    return <p className="projection-empty">Saisissez une quantité &gt; 0</p>;
  }

  const all = SCENARIOS.flatMap((s) => projections[s.key].map((p) => p.value));
  const range = getRange(all);
  const startValue = projections.median[0].value;
  const startPoint = toPoints([startValue], W, H, range, MARGIN);
  // toPoints centers a single value horizontally; the start sits at the left edge.
  const startY = startPoint.split(',')[1];

  return (
    <div className="projection-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Projection de la valeur de la position sur 12 mois : scénarios optimiste, médian et pessimiste"
      >
        {SCENARIOS.map((s) => (
          <polyline
            key={s.key}
            data-scenario={s.key}
            points={toPoints(
              projections[s.key].map((p) => p.value),
              W,
              H,
              range,
              MARGIN,
            )}
            fill="none"
            stroke={s.color}
            strokeWidth="2"
            strokeLinejoin="round"
          />
        ))}
        <circle cx={MARGIN} cy={startY} r="3.5" fill="#111111" />
      </svg>
      <ul className="legend">
        {SCENARIOS.map((s) => (
          <li key={s.key}>
            <span className="legend__dot" style={{ background: s.color }} aria-hidden="true" />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
