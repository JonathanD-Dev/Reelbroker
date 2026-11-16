/**
 * Periods of the price chart in the detailed view ("See more data"), and how a daily series is cut
 * for each of them. The data is daily: "1 jour" is the last session (previous close -> last close).
 */
export type RangeId = '1d' | '1w' | '1m' | '3m' | '6m' | '1y' | '5y' | 'max';

export interface RangeDef {
  id: RangeId;
  /** Button text. */
  short: string;
  /** Spoken / long name ("1 mois"). */
  long: string;
  /** Phrase after a change ("sur 1 mois", "depuis le début"). */
  phrase: string;
}

export const RANGES: RangeDef[] = [
  { id: '1d', short: '1 J', long: '1 jour', phrase: 'sur 1 jour (dernière séance)' },
  { id: '1w', short: '1 S', long: '1 semaine', phrase: 'sur 1 semaine' },
  { id: '1m', short: '1 M', long: '1 mois', phrase: 'sur 1 mois' },
  { id: '3m', short: '3 M', long: '3 mois', phrase: 'sur 3 mois' },
  { id: '6m', short: '6 M', long: '6 mois', phrase: 'sur 6 mois' },
  { id: '1y', short: '1 A', long: '1 an', phrase: 'sur 1 an' },
  { id: '5y', short: '5 A', long: '5 ans', phrase: 'sur 5 ans' },
  { id: 'max', short: 'Tout', long: 'depuis le début', phrase: 'depuis le début des données' },
];

export const DEFAULT_RANGE: RangeId = '1y';

export interface DatedPoint {
  /** YYYY-MM-DD */
  date: string;
  value: number;
}

const utc = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** First date of the period that ends on `last`. Null for "1d" and "max" (handled by count / everything). */
export function cutoffOf(id: RangeId, last: string): string | null {
  const d = utc(last);
  switch (id) {
    case '1w':
      d.setUTCDate(d.getUTCDate() - 7);
      return iso(d);
    case '1m':
    case '3m':
    case '6m': {
      const months = id === '1m' ? 1 : id === '3m' ? 3 : 6;
      const day = d.getUTCDate();
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() - months);
      const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      d.setUTCDate(Math.min(day, lastDay));
      return iso(d);
    }
    case '1y':
    case '5y':
      d.setUTCFullYear(d.getUTCFullYear() - (id === '1y' ? 1 : 5));
      return iso(d);
    default:
      return null;
  }
}

/**
 * Points of a period, ascending. The period starts on the last point dated on or before the cutoff
 * (so the change is measured from the close at the start of the period).
 * Returns null when the series does not cover the period (fewer than 2 points, or it starts after the cutoff).
 */
export function sliceRange(points: readonly DatedPoint[], id: RangeId): DatedPoint[] | null {
  const n = points.length;
  if (n < 2) return null;
  if (id === 'max') return points.slice();
  if (id === '1d') return points.slice(n - 2);
  const cutoff = cutoffOf(id, points[n - 1].date)!;
  if (points[0].date > cutoff) return null;
  let start = 0;
  for (let i = 0; i < n; i++) {
    if (points[i].date <= cutoff) start = i;
    else break;
  }
  const out = points.slice(start);
  return out.length >= 2 ? out : null;
}

/** Change between the first and the last point: absolute and relative. */
export function changeOf(points: readonly DatedPoint[]): { abs: number; pct: number } {
  const a = points[0]?.value ?? 0;
  const b = points[points.length - 1]?.value ?? 0;
  return { abs: b - a, pct: a ? b / a - 1 : 0 };
}

// ---- axes -------------------------------------------------------------------------------------

/** Round tick values covering [min, max] (about `count` intervals). */
export function niceTicks(min: number, max: number, count = 4): { ticks: number[]; step: number; lo: number; hi: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { ticks: [0, 1], step: 1, lo: 0, hi: 1 };
  if (min === max) {
    const pad = Math.abs(min) * 0.02 || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  const step = (f <= 1.3 ? 1 : f <= 2.3 ? 2 : f <= 3.2 ? 2.5 : f <= 6 ? 5 : 10) * pow;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return { ticks, step, lo, hi };
}

/** Decimals that show multiples of `step` without noise. */
export function decimalsFor(step: number): number {
  if (step >= 1) return Number.isInteger(step) ? 0 : 1;
  return Math.min(4, Math.ceil(-Math.log10(step) - 1e-9));
}

/** `count` indexes spread over 0..length-1, always with both ends. */
export function spread(length: number, count: number): number[] {
  if (length <= 0) return [];
  if (length === 1) return [0];
  const k = Math.min(count, length);
  const out = new Set<number>();
  for (let i = 0; i < k; i++) out.add(Math.round((i * (length - 1)) / (k - 1)));
  return [...out];
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-CA', { ...opts, timeZone: 'UTC' });
const dayMonth = fmt({ day: 'numeric', month: 'short' });
const monthYear = fmt({ month: 'short', year: 'numeric' });
const yearOnly = fmt({ year: 'numeric' });
const full = fmt({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** Axis label of a date for the period shown ("12 nov.", "nov. 2026", "2024"). */
export function axisDate(d: string, id: RangeId): string {
  const x = utc(d);
  if (id === '5y' || id === 'max') return yearOnly.format(x);
  if (id === '1y') return monthYear.format(x);
  return dayMonth.format(x);
}

/** Readout date: "jeu. 12 nov. 2026". */
export function readoutDate(d: string): string {
  return full.format(utc(d));
}
