import type { Projections, ScenarioKey, ScenarioRates } from '../types';

export const DEFAULT_QUANTITY = 10;
export const MAX_QUANTITY = 100000;
export const HORIZON_MONTHS = 12;

export function parseQuantity(raw: string): number {
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), MAX_QUANTITY);
}

const SCENARIOS: ScenarioKey[] = ['optimistic', 'median', 'pessimistic'];

export function computeProjections(
  price: number,
  quantity: number,
  rates: ScenarioRates,
  months = HORIZON_MONTHS,
): Projections {
  const start = price * quantity;
  const result = {} as Projections;
  for (const s of SCENARIOS) {
    result[s] = Array.from({ length: months + 1 }, (_, m) => ({
      month: m,
      value: Math.round(start * Math.pow(1 + rates[s], m / 12) * 100) / 100,
    }));
  }
  return result;
}
