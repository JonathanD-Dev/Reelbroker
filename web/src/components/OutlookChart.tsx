import { useId, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import type { Outlook } from '../lib/api';
import { formatUsd } from '../lib/format';
import { decimalsFor, niceTicks, spread } from '../lib/priceRanges';

// ---- 5-year view from the backend: three hypothetical scenarios (never a forecast) ------------
// Interactive: scrub with the pointer or the arrow keys to read every scenario at a date, toggle scenarios
// (at least two stay visible: the range matters, never one value alone), compare with another pair of assumptions.
// Same reading aids as the price chart (PriceHistoryChart): round value axis, dated time axis, readout above.

const W = 340;
const H = 210;
const L = 6;
const R = 58;
const T = 10;
const B = 22;
const PW = W - L - R;
const PH = H - T - B;

export type OutlookKey = 'best' | 'central' | 'worst';

const OUTLOOK: { key: OutlookKey; fallback: string; short: string; color: string }[] = [
  { key: 'best', fallback: 'Scénario favorable', short: 'Favorable', color: '#3e6246' },
  { key: 'central', fallback: 'Notre scénario central', short: 'Central', color: '#111111' },
  { key: 'worst', fallback: 'Scénario défavorable', short: 'Défavorable', color: '#ba1218' },
];
export const MIN_VISIBLE = 2;

/** Months -> "2 ans 3 mois". */
export function formatMonths(m: number): string {
  if (m === 0) return 'aujourd’hui';
  const y = Math.floor(m / 12);
  const r = m % 12;
  const parts: string[] = [];
  if (y > 0) parts.push(`${y} an${y > 1 ? 's' : ''}`);
  if (r > 0) parts.push(`${r} mois`);
  return parts.join(' ');
}

const monthYear = new Intl.DateTimeFormat('fr-CA', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const monthOnly = new Intl.DateTimeFormat('fr-CA', { month: 'short', timeZone: 'UTC' });
/** "nov. 27": the yearly ticks fall on the start month, not on January. */
const tickDate = (d: Date) => `${monthOnly.format(d)} ${String(d.getUTCFullYear()).slice(2)}`;

/** Date `months` after `iso` (YYYY-MM-DD), as a UTC Date. */
function addMonths(iso: string, months: number): Date {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

interface OutlookChartProps {
  outlook: Outlook;
  /** Date of the data the scenarios start from (YYYY-MM-DD): dates the time axis. Absent: "dans N ans". */
  startDate?: string;
}

export function OutlookChart({ outlook, startDate }: OutlookChartProps) {
  const uid = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hidden, setHidden] = useState<Set<OutlookKey>>(new Set());
  const [cursor, setCursor] = useState<number | null>(null);

  if (outlook.quantity === 0) {
    return <p className="projection-empty">Saisissez une quantité &gt; 0</p>;
  }
  const shown = OUTLOOK.filter((s) => !hidden.has(s.key));
  const n = outlook.scenarios.central.path.length;
  const last = Math.max(0, n - 1);
  const start = outlook.scenarios.central.path[0]?.value ?? outlook.start_value;
  // The axis follows the visible scenarios (hiding one zooms on the others).
  const values = shown.flatMap((s) => outlook.scenarios[s.key].path.map((p) => p.value)).concat(start);
  const { ticks, step, lo, hi } = niceTicks(Math.min(...values), Math.max(...values), 4);
  const span = hi - lo || 1;
  const xOf = (i: number) => L + (last > 0 ? (i / last) * PW : 0);
  const yOf = (v: number) => T + (1 - (v - lo) / span) * PH;
  const months = outlook.horizon_years * 12;
  const monthAt = (i: number) => outlook.scenarios.central.path[i]?.month ?? i;
  const valueAt = (k: OutlookKey, i: number) => outlook.scenarios[k].path[i]?.value ?? start;

  const dateAt = (i: number) => (startDate ? monthYear.format(addMonths(startDate, monthAt(i))) : null);
  const whenAt = (i: number) => {
    const m = monthAt(i);
    const d = dateAt(i);
    if (m === 0) return d ? `Aujourd’hui (${d})` : 'Aujourd’hui';
    return d ? `${d} · dans ${formatMonths(m)}` : `Dans ${formatMonths(m)}`;
  };

  const visibleCount = OUTLOOK.length - hidden.size;
  const toggle = (key: OutlookKey) =>
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(key)) next.delete(key);
      else if (OUTLOOK.length - next.size > MIN_VISIBLE) next.add(key);
      return next;
    });

  const indexAt = (clientX: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return null;
    const x = ((clientX - r.left) / r.width) * W;
    return Math.min(last, Math.max(0, Math.round(((x - L) / PW) * last)));
  };
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    const i = indexAt(e.clientX);
    if (i !== null) setCursor(i);
    if (e.pointerType !== 'mouse') svgRef.current?.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== 'mouse' && e.buttons === 0) return;
    const i = indexAt(e.clientX);
    if (i !== null) setCursor(i);
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, PageUp: 12, PageDown: -12 };
    let next: number | null | undefined;
    if (e.key in moves) next = Math.min(last, Math.max(0, (cursor ?? 0) + moves[e.key]));
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    else if (e.key === 'Escape') next = null;
    if (next === undefined) return;
    e.preventDefault();
    e.stopPropagation(); // the feed must not scroll while reading the chart
    setCursor(next);
  };

  const readoutId = `${uid}-readout`;
  const big = hi >= 10000;
  const tickFmt = new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: outlook.currency || 'CAD',
    currencyDisplay: 'narrowSymbol',
    ...(big ? { notation: 'compact', maximumFractionDigits: 1 } : { minimumFractionDigits: decimalsFor(step), maximumFractionDigits: decimalsFor(step) }),
  });

  const pts = (k: OutlookKey) => outlook.scenarios[k].path.map((p, i) => `${xOf(i).toFixed(1)},${yOf(p.value).toFixed(1)}`).join(' ');
  // Band between the favourable and the unfavourable scenarios, when both are shown.
  const band =
    !hidden.has('best') && !hidden.has('worst')
      ? outlook.scenarios.best.path.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(p.value).toFixed(1)}`).join(' ') +
        ' ' +
        [...outlook.scenarios.worst.path]
          .map((p, i) => ({ p, i }))
          .reverse()
          .map(({ p, i }) => `L${xOf(i).toFixed(1)},${yOf(p.value).toFixed(1)}`)
          .join(' ') +
        ' Z'
      : null;

  // One tick per year (0 to 5 years).
  const yearTicks = spread(n, outlook.horizon_years + 1).filter((i) => monthAt(i) % 12 === 0 || i === last);
  const xLabel = (i: number) => {
    const m = monthAt(i);
    if (startDate) return tickDate(addMonths(startDate, m));
    return m === 0 ? 'auj.' : `${m / 12} an${m >= 24 ? 's' : ''}`;
  };
  const at = cursor ?? last;

  return (
    <div className="projection-chart projection-chart--interactive outlook-chart" data-chart="">
      <div id={readoutId} className="scrub-readout outlook-chart__readout" data-testid="scrub-readout" role="status" aria-live="polite">
        <strong className="outlook-chart__when">{cursor === null ? `Dans ${formatMonths(months)}${dateAt(last) ? ` (${dateAt(last)})` : ''}` : whenAt(cursor)}</strong>
        <span className="scrub-readout__vals">
          {shown.map((s) => (
            <span key={s.key} style={{ color: s.color }}>
              {s.short} {formatUsd(valueAt(s.key, at))}
            </span>
          ))}
        </span>
        {cursor === null && (
          <span className="scrub-readout__hint">Touchez, glissez ou utilisez les flèches pour lire chaque scénario à une date.</span>
        )}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        tabIndex={0}
        aria-label={`Valeur de la position sur ${outlook.horizon_years} ans : trois scénarios hypothétiques, favorable, central et défavorable. Flèches gauche et droite pour lire une date.`}
        aria-describedby={readoutId}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') setCursor(null);
        }}
        onKeyDown={onKey}
        onBlur={() => setCursor(null)}
        data-testid="outlook-svg"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={L + PW} y1={yOf(t)} y2={yOf(t)} stroke="#dadada" strokeWidth="0.7" />
            <text data-testid="y-tick" x={W - 2} y={yOf(t) + 3} textAnchor="end" fontSize="9" fill="#585858">
              {tickFmt.format(t)}
            </text>
          </g>
        ))}
        {yearTicks.map((i) => (
          <line key={`v${i}`} x1={xOf(i)} x2={xOf(i)} y1={T} y2={T + PH} stroke="#ececec" strokeWidth="0.7" />
        ))}
        {band && <path d={band} fill="rgba(0, 0, 0, 0.06)" data-testid="outlook-band" />}
        <line x1={L} x2={L + PW} y1={yOf(start)} y2={yOf(start)} stroke="#9a9a9a" strokeDasharray="3 3" strokeWidth="0.8" />
        {OUTLOOK.map((s) => (
          <polyline
            key={s.key}
            data-scenario={s.key}
            className="scenario-line"
            style={{ display: hidden.has(s.key) ? 'none' : undefined }}
            points={pts(s.key)}
            fill="none"
            stroke={s.color}
            strokeWidth={s.key === 'central' ? 2.4 : 1.8}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        <circle cx={xOf(0)} cy={yOf(start)} r="3.5" fill="#111111" stroke="#fff" strokeWidth="1.5" />
        {yearTicks.map((i, k) => (
          <text
            key={`x${i}`}
            x={xOf(i)}
            y={H - 6}
            textAnchor={k === 0 ? 'start' : k === yearTicks.length - 1 ? 'end' : 'middle'}
            fontSize="9"
            fill="#585858"
            data-testid="x-tick"
          >
            {xLabel(i)}
          </text>
        ))}
        {cursor !== null && (
          <g data-testid="scrub-cursor" pointerEvents="none">
            <line x1={xOf(cursor)} x2={xOf(cursor)} y1={T} y2={T + PH} stroke="#585858" strokeWidth="0.8" />
            {shown.map((s) => (
              <circle key={s.key} cx={xOf(cursor)} cy={yOf(valueAt(s.key, cursor))} r="4" fill={s.color} stroke="#fff" strokeWidth="1.5" />
            ))}
          </g>
        )}
      </svg>
      <ul className="legend legend--values">
        {OUTLOOK.map((s) => {
          const sc = outlook.scenarios[s.key];
          const off = hidden.has(s.key);
          const locked = !off && visibleCount <= MIN_VISIBLE;
          return (
            <li key={s.key} data-testid={`scenario-${s.key}`} className={off ? 'is-off' : undefined}>
              <button
                type="button"
                className="legend__toggle"
                aria-pressed={!off}
                aria-disabled={locked}
                title={locked ? 'Au moins deux scénarios restent affichés : la fourchette compte, pas une valeur seule.' : undefined}
                onClick={() => toggle(s.key)}
              >
                <span
                  className="legend__dot"
                  style={{ background: off ? 'transparent' : s.color, boxShadow: `inset 0 0 0 2px ${s.color}` }}
                  aria-hidden="true"
                />
                <span>{s.key === 'central' ? 'Scénario central (hypothétique)' : sc.label || s.fallback}</span>
                <strong>{formatUsd(sc.final)}</strong>
              </button>
            </li>
          );
        })}
        <li className="outlook-chart__band-note" aria-hidden={!band}>
          {band ? 'Zone grisée : entre le scénario défavorable (10e centile) et le favorable (90e centile).' : '\u00a0'}
        </li>
      </ul>
    </div>
  );
}
