import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Product } from '../types';
import { apiEnabled, loadPrices } from '../lib/api';
import type { PriceHistory } from '../lib/api';
import { formatDate, formatPct, formatUsd } from '../lib/format';
import { changeOf, sliceRange } from '../lib/priceRanges';
import type { DatedPoint, RangeId } from '../lib/priceRanges';

/**
 * Top of a feed card (option C3 of docs/mockups-fil-propositions-c.png): price, change over the
 * period, the real price curve with landmarks (start level, peak, today) and the three 5-year
 * statistics. Real products only (backend data); the identity stays in the card footer.
 */
const PERIODS: { id: RangeId; short: string; phrase: string }[] = [
  { id: '1w', short: '1 S', phrase: 'sur 1 semaine' },
  { id: '1m', short: '1 M', phrase: 'sur 1 mois' },
  { id: '1y', short: '1 A', phrase: 'sur 1 an' },
  { id: '5y', short: '5 A', phrase: 'sur 5 ans' },
];
const UP = '#3e6246';
const DOWN = '#ba1218';
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const VW = 1000; // viewBox width; the height follows the CSS height (preserveAspectRatio="none")
const VH = 300;

const shortDate = new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayOf = (iso: string) => shortDate.format(new Date(`${iso}T00:00:00Z`));
/** "44 %", "−63 %", but "−0,4 %" below 10 % (a rounded "−0 %" says nothing). */
const pctShort = (x: number, signed = false) => formatPct(x, Math.abs(x) < 0.1 ? 1 : 0, signed).replace('-', '−');

export function CardHero({ product }: { product: Product }) {
  const live = product.live!;
  const [daily, setDaily] = useState<PriceHistory | null>(null);
  const [period, setPeriod] = useState<RangeId>('1y');

  useEffect(() => {
    if (!apiEnabled()) return;
    let cancelled = false;
    loadPrices(product.ticker).then((r) => {
      if (!cancelled) setDaily(r);
    });
    return () => {
      cancelled = true;
    };
  }, [product.ticker]);

  // Full daily series when the server gives it; else the 52 weekly points of the card (12 months).
  const series = useMemo<DatedPoint[]>(() => {
    if (daily) return daily.points;
    return product.history[0].points.filter((p) => ISO.test(p.label)).map((p) => ({ date: p.label, value: p.value }));
  }, [daily, product.history]);

  const available = useMemo(() => {
    const out = new Map<RangeId, DatedPoint[]>();
    for (const p of PERIODS) {
      if (!daily && p.id === '1w') continue; // weekly points cannot show one week
      const s = sliceRange(series, p.id);
      if (s) out.set(p.id, s);
    }
    return out;
  }, [series, daily]);
  const active = available.has(period) ? period : ([...PERIODS].reverse().find((p) => available.has(p.id))?.id ?? null);
  const pts = active ? available.get(active)! : series;
  const n = pts.length;
  if (n < 2) return null;

  const last = pts[n - 1];
  const change = changeOf(pts);
  const color = change.abs >= 0 ? UP : DOWN;
  const values = pts.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.12 || 1;
  const lo = min - pad;
  const hi = max + pad;
  // The curve stops 1,5 % before the right edge so the "today" dot stays whole.
  const xPct = (i: number) => (n > 1 ? (i / (n - 1)) * 98.5 : 50);
  const yPct = (v: number) => (1 - (v - lo) / (hi - lo)) * 100;
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${((xPct(i) / 100) * VW).toFixed(1)},${((yPct(p.value) / 100) * VH).toFixed(1)}`).join(' ');
  // The fill goes on to the right edge at today's level, so no empty strip is left after the dot.
  const lastY = ((yPct(last.value) / 100) * VH).toFixed(1);
  const area = `${line} L${VW},${lastY} L${VW},${VH} L0,${VH} Z`;
  const peak = values.indexOf(max);
  const startY = yPct(pts[0].value);
  const phrase = PERIODS.find((p) => p.id === active)?.phrase ?? '';
  // The peak label goes on the side of the peak that has room.
  const peakLeft = xPct(peak) > 55;
  const s = live.stats;
  const tone = { '--hero-tone': color } as CSSProperties;

  return (
    <section className="card-hero" style={tone} aria-label={`Cours de ${product.name}`} data-testid="card-hero">
      <p className="card-hero__price">
        <strong>{formatUsd(last.value)}</strong>
        <span className="card-hero__change" style={{ color }}>
          {formatPct(change.pct, 1, true).replace('-', '−')} {phrase}
        </span>
      </p>
      <div className="card-hero__chart">
        <svg
          viewBox={`0 0 ${VW} ${VH}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Cours ${phrase} : de ${formatUsd(pts[0].value)} à ${formatUsd(last.value)}, sommet ${formatUsd(max)} le ${formatDate(pts[peak].date)}.`}
        >
          <path d={area} fill={color} opacity="0.12" />
          <line x1="0" x2={VW} y1={(startY / 100) * VH} y2={(startY / 100) * VH} stroke="#9a9a9a" strokeWidth="1" strokeDasharray="6 6" vectorEffect="non-scaling-stroke" />
          <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" data-testid="hero-line" />
        </svg>
        {/* Landmarks in HTML (the SVG is stretched): peak with its label, and today. */}
        <span className="card-hero__dot card-hero__dot--peak" style={{ left: `${xPct(peak)}%`, top: `${yPct(max)}%` }} aria-hidden="true" />
        <span
          className={'card-hero__peak' + (peakLeft ? ' card-hero__peak--left' : '')}
          style={{ left: `${xPct(peak)}%`, top: `${yPct(max)}%` }}
          data-testid="hero-peak"
        >
          Sommet {formatUsd(max)} · {dayOf(pts[peak].date)}
        </span>
        <span className="card-hero__dot card-hero__dot--today" style={{ left: `${xPct(n - 1)}%`, top: `${yPct(last.value)}%`, background: color }} aria-hidden="true" />
      </div>
      <div className="card-hero__periods" role="group" aria-label="Période de la courbe">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={'range-btn' + (p.id === active ? ' range-btn--on' : '')}
            aria-pressed={p.id === active}
            aria-label={p.phrase.replace('sur ', '')}
            disabled={!available.has(p.id)}
            onClick={() => setPeriod(p.id)}
          >
            {p.short}
          </button>
        ))}
      </div>
      <dl className="card-hero__stats" aria-label={`Mesures du ${formatDate(s.window[0])} au ${formatDate(s.window[1])}`}>
        <div>
          <dt>Rendement/an</dt>
          <dd style={{ color: s.cagr >= 0 ? UP : DOWN }}>{pctShort(s.cagr, true)}</dd>
        </div>
        <div>
          <dt>Volatilité</dt>
          <dd>{pctShort(s.vol)}</dd>
        </div>
        <div>
          <dt>Pire baisse</dt>
          <dd style={{ color: DOWN }}>{pctShort(s.max_drawdown)}</dd>
        </div>
      </dl>
    </section>
  );
}
