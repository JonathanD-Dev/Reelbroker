import type { Product } from '../types';
import { useSyncExternalStore } from 'react';
import { apiEnabled } from './api';
import type { ApiCard } from './api';
import { CATALOG } from '../data/products';
import { setDisplayCurrency } from './format';

/** Where the products on screen come from. */
export type CatalogSource = 'api' | 'snapshot' | 'mock';

let current: Product[] = CATALOG;

/** Products currently loaded (mock until the backend answers). Used by pages that look up by ticker. */
export function getCatalog(): Product[] {
  return current;
}
export function setCatalog(products: Product[], source: CatalogSource): void {
  current = products;
  setDisplayCurrency(source === 'mock' ? 'USD' : (products[0]?.live?.currency ?? 'CAD'));
  setCatalogMeta({ source, loading: false });
}

/** BNCD symbol and market for a Yahoo-style ticker ("XIU.TO" -> XIU / CAN). Crypto has no quote page. */
export function bncdTarget(ticker: string, assetClass?: string): Pick<Product, 'noQuote' | 'bncdSymbol' | 'market'> {
  if (assetClass === 'crypto' || /-USD$/.test(ticker)) return { noQuote: true };
  if (ticker.endsWith('.TO')) return { bncdSymbol: ticker.slice(0, -3), market: 'CAN' };
  return {};
}

/** Backend card -> UI product. `rates` only feeds the legacy risk warning (worst year, central CAGR). */
export function cardToProduct(c: ApiCard): Product {
  const hist = c.history.slice(0, 2);
  const series = (i: number) => hist[i] ?? { title: '', points: [{ label: '', value: c.price }] };
  const cagr = c.stats.cagr;
  return {
    ticker: c.ticker,
    name: c.name,
    brandColor: c.brandColor,
    price: c.price,
    reasons: c.reasons,
    history: [series(0), series(1)],
    rates: {
      optimistic: cagr + c.stats.vol,
      median: cagr,
      pessimistic: c.stats.worst_1y ?? cagr - c.stats.vol,
    },
    ...bncdTarget(c.ticker, c.asset_class),
    live: {
      assetClass: c.asset_class,
      sector: c.sector,
      currency: c.currency,
      asOf: c.as_of,
      source: c.source,
      fit: c.fit,
      stats: c.stats,
      tags: c.tags ?? [],
      ...(c.extras ? { extras: c.extras } : {}),
    },
  };
}

// ---- tiny store: the permanent banner shows where the data comes from --------------------------
export interface CatalogMeta {
  source: CatalogSource;
  loading: boolean;
  /** A request for the data really failed (server down); never set for an account without profile. */
  failed: boolean;
  /** Logged in (false on the welcome page). */
  loggedIn: boolean;
}
let meta: CatalogMeta = { source: 'mock', loading: apiEnabled(), failed: false, loggedIn: false };
const listeners = new Set<() => void>();

export function setCatalogMeta(patch: Partial<CatalogMeta>): void {
  meta = { ...meta, ...patch };
  listeners.forEach((l) => l());
}
export function useCatalogMeta(): CatalogMeta {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => meta,
  );
}
