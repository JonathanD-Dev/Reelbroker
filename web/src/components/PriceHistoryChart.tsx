import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import type { Series } from '../types';
import { apiEnabled, loadPrices } from '../lib/api';
import type { PriceHistory } from '../lib/api';
import { formatDate, formatUsd } from '../lib/format';
import {
  DEFAULT_RANGE,
  RANGES,
  axisDate,
  changeOf,
  decimalsFor,
  niceTicks,
  readoutDate,
  sliceRange,
  spread,
} from '../lib/priceRanges';
import type { DatedPoint, RangeId } from '../lib/priceRanges';

interface PriceHistoryChartProps {
  /** Ticker whose full daily series is asked to the API (real products). Absent: only `fallback`. */
  ticker?: string;
  /** Series of the card (52 weekly points over 12 months, or the invented series of the mock data). */
  fallback: Series;
  /** ISO currency code of the amounts (CAD for the backend data). */
  currency: string;
  /** Invented data: said on the chart. */
  fictional?: boolean;
}

const W = 340;
const H = 200;
const L = 6;
const R = 54;
const T = 10;
const B = 22;
const PW = W - L - R;
const PH = H - T - B;
const UP = '#3e6246';
const DOWN = '#ba1218';
const ISO = /^\d{4}-\d{2}-\d{2}$/;

type Load = { status: 'loading' } | { status: 'ready'; data: PriceHistory } | { status: 'fallback' };

const pct = (x: number) =>
  `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x * 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;

/**
 * Price chart of the detailed view: periods from 1 day to the whole dataset, value and date axes,
 * and a cursor moved by touch, mouse or keyboard. The data is daily (no intraday prices).
 */
export function PriceHistoryChart({ ticker, fallback, currency, fictional = false }: PriceHistoryChartProps) {
  const uid = useId().replace(/:/g, '');
  const svgRef = useRef<SVGSVGElement>(null);
  const [load, setLoad] = useState<Load>(() => (ticker && apiEnabled() ? { status: 'loading' } : { status: 'fallback' }));
  const [range, setRange] = useState<RangeId>(DEFAULT_RANGE);
  const [cursor, setCursor] = useState<number | null>(null);

  useEffect(() => {
    if (!ticker || !apiEnabled()) {
      setLoad({ status: 'fallback' });
      return;
    }
    let cancelled = false;
    setLoad({ status: 'loading' });
    loadPrices(ticker).then((r) => {
      if (!cancelled) setLoad(r ? { status: 'ready', data: r } : { status: 'fallback' });
    });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  // Daily series from the API; else the card series (dated weekly points, or undated invented points).
  const daily = load.status === 'ready';
  const dated = useMemo<DatedPoint[] | null>(() => {
    if (load.status === 'ready') return load.data.points;
    const pts = fallback.points;
    return pts.length >= 2 && pts.every((p) => ISO.test(p.label)) ? pts.map((p) => ({ date: p.label, value: p.value })) : null;
  }, [load, fallback]);

  // Weekly points cannot show one day or one week.
  const available = useMemo(() => {
    const out = new Map<RangeId, DatedPoint[]>();
    if (!dated) return out;
    for (const r of RANGES) {
      if (!daily && (r.id === '1d' || r.id === '1w')) continue;
      const s = sliceRange(dated, r.id);
      if (s) out.set(r.id, s);
    }
    return out;
  }, [dated, daily]);

  // The chosen period may not exist for this series (e.g. fallback data): use the longest one available.
  const activeRange: RangeId | null = dated
    ? available.has(range)
      ? range
      : ([...RANGES].reverse().find((r) => available.has(r.id))?.id ?? null)
    : null;
  const points: DatedPoint[] = useMemo(() => {
    if (activeRange) return available.get(activeRange)!;
    return fallback.points.map((p, i) => ({ date: p.label || String(i), value: p.value }));
  }, [activeRange, available, fallback]);

  useEffect(() => setCursor(null), [activeRange, load.status]);

  const n = points.length;
  if (load.status === 'loading') {
    return (
      <figure className="price-chart" aria-busy="true" data-testid="price-chart">
        <div className="skeleton skeleton--chart" aria-hidden="true" />
        <figcaption className="price-chart__note">Chargement de l’historique des cours…</figcaption>
      </figure>
    );
  }
  if (n < 2) return null;

  const values = points.map((p) => p.value);
  const { ticks, step, lo, hi } = niceTicks(Math.min(...values), Math.max(...values), 4);
  const span = hi - lo || 1;
  const x = (i: number) => L + (n > 1 ? (i / (n - 1)) * PW : PW / 2);
  const y = (v: number) => T + (1 - (v - lo) / span) * PH;

  const shown = cursor ?? n - 1;
  const first = points[0];
  const current = points[shown];
  const change = changeOf([first, current]);
  const periodChange = changeOf(points);
  const color = periodChange.abs >= 0 ? UP : DOWN;
  const nowColor = change.abs >= 0 ? UP : DOWN;
  const rangeDef = RANGES.find((r) => r.id === activeRange);

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(n - 1).toFixed(1)},${(T + PH).toFixed(1)} L${x(0).toFixed(1)},${(T + PH).toFixed(1)} Z`;

  const tickFmt = new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    ...(hi >= 10000 ? { notation: 'compact', maximumFractionDigits: 1 } : { minimumFractionDigits: decimalsFor(step), maximumFractionDigits: decimalsFor(step) }),
  });
  const xTicks = spread(n, activeRange === '1d' ? 2 : 4);
  const xLabel = (i: number) => (activeRange ? axisDate(points[i].date, activeRange) : i === n - 1 ? 'auj.' : `−${n - 1 - i} m`);
  const dateLabel = (i: number) =>
    activeRange ? readoutDate(points[i].date) : i === n - 1 ? 'Aujourd’hui (fictif)' : `Il y a ${n - 1 - i} mois (fictif)`;

  // ---- interaction ----------------------------------------------------------------------------
  const indexAt = (clientX: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return null;
    const vx = ((clientX - r.left) / r.width) * W;
    return Math.min(n - 1, Math.max(0, Math.round(((vx - L) / PW) * (n - 1))));
  };
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    const i = indexAt(e.clientX);
    if (i !== null) setCursor(i);
    // Keep following the finger even when it leaves the chart while dragging.
    if (e.pointerType !== 'mouse') svgRef.current?.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== 'mouse' && e.buttons === 0) return;
    const i = indexAt(e.clientX);
    if (i !== null) setCursor(i);
  };
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const big = Math.max(1, Math.round(n / 10));
    const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, PageUp: big, PageDown: -big };
    let next: number | null | undefined;
    if (e.key in moves) next = Math.min(n - 1, Math.max(0, (cursor ?? n - 1) + moves[e.key]));
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    else if (e.key === 'Escape') next = null;
    if (next === undefined) return;
    e.preventDefault();
    e.stopPropagation(); // the feed must not scroll while reading the chart
    setCursor(next);
  };

  const readoutId = `${uid}-readout`;
  const summary = `${fallback.title || 'Cours'}${rangeDef ? `, ${rangeDef.long}` : ''} : de ${formatUsd(first.value)} à ${formatUsd(points[n - 1].value)} (${pct(periodChange.pct)}).`;

  return (
    <figure className="price-chart" data-testid="price-chart" data-chart="">
      <div className="price-chart__head">
        <p className="price-chart__title">{daily ? 'Cours de clôture' : fallback.title || 'Cours'}</p>
        <p id={readoutId} className="price-chart__readout" role="status" aria-live="polite" data-testid="price-readout">
          <strong className="price-chart__value">{formatUsd(current.value)}</strong>
          <span className="price-chart__change" style={{ color: nowColor }}>
            {change.abs >= 0 ? '+' : '−'}
            {formatUsd(Math.abs(change.abs))} ({pct(change.pct)})
          </span>
          <span className="price-chart__date">
            {cursor === null ? (rangeDef ? rangeDef.phrase : 'sur la période') : `${dateLabel(shown)} · depuis le début de la période`}
          </span>
        </p>
      </div>

      {activeRange && (
        <div className="price-chart__ranges" role="group" aria-label="Période du graphique">
          {RANGES.map((r) => {
            const ok = available.has(r.id);
            return (
              <button
                key={r.id}
                type="button"
                className={'range-btn' + (r.id === activeRange ? ' range-btn--on' : '')}
                aria-pressed={r.id === activeRange}
                aria-label={r.long}
                disabled={!ok}
                title={ok ? r.long : `${r.long} : pas assez de données pour cette période`}
                onClick={() => setRange(r.id)}
              >
                {r.short}
              </button>
            );
          })}
        </div>
      )}

      <svg
        ref={svgRef}
        className="price-chart__svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        tabIndex={0}
        aria-label={`${summary} Touchez, glissez ou utilisez les flèches gauche et droite pour lire un cours.`}
        aria-describedby={readoutId}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') setCursor(null);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setCursor(null)}
        data-testid="price-svg"
      >
        <defs>
          <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={L + PW} y1={y(t)} y2={y(t)} stroke="#dadada" strokeWidth="0.7" />
            <text x={W - 2} y={y(t) + 3} textAnchor="end" fontSize="9" fill="#585858" data-testid="y-tick">
              {tickFmt.format(t)}
            </text>
          </g>
        ))}
        <line x1={L} x2={L + PW} y1={y(first.value)} y2={y(first.value)} stroke="#9a9a9a" strokeWidth="0.8" strokeDasharray="3 3" />
        <path d={area} fill={`url(#${uid}-fill)`} />
        <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" data-testid="price-line" />
        {xTicks.map((i, k) => (
          <text
            key={i}
            x={x(i)}
            y={H - 6}
            textAnchor={k === 0 ? 'start' : k === xTicks.length - 1 ? 'end' : 'middle'}
            fontSize="9"
            fill="#585858"
            data-testid="x-tick"
          >
            {xLabel(i)}
          </text>
        ))}
        {cursor !== null && (
          <g pointerEvents="none" data-testid="price-cursor">
            <line x1={x(shown)} x2={x(shown)} y1={T} y2={T + PH} stroke="#585858" strokeWidth="0.8" />
            <circle cx={x(shown)} cy={y(current.value)} r="4" fill={nowColor} stroke="#fff" strokeWidth="1.5" />
          </g>
        )}
        {cursor === null && <circle cx={x(n - 1)} cy={y(points[n - 1].value)} r="3.5" fill={color} stroke="#fff" strokeWidth="1.5" />}
      </svg>

      <figcaption className="price-chart__note">
        {cursor === null && <span className="price-chart__hint">Touchez ou glissez sur le graphique pour lire un cours. </span>}
        {load.status === 'ready' ? (
          <>
            Cours quotidiens ajustés (dividendes et fractionnements), en {load.data.currency}, du {formatDate(load.data.points[0].date)} au{' '}
            {formatDate(load.data.as_of)}. Source : {load.data.source}. Pas de cours intrajournaliers : « 1 J » compare les deux dernières clôtures.
          </>
        ) : fictional || !dated ? (
          <>Données fictives, sans dates.</>
        ) : (
          <>Historique résumé (un point par semaine sur 12 mois) : le serveur ne donne pas la série complète pour l’instant.</>
        )}
      </figcaption>
    </figure>
  );
}
