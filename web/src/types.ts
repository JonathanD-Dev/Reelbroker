import type { CardExtras, CardStats, Fit } from './lib/api';
export type Ticker = string;

export interface SeriesPoint {
  label: string;
  value: number;
}

export interface Series {
  title: string;
  points: SeriesPoint[];
}

export interface ScenarioRates {
  optimistic: number;
  median: number;
  pessimistic: number;
}

/** Sectors the investor profile can exclude (ESG preferences). */
export type ExclusionTag =
  | 'tobacco'
  | 'weapons'
  | 'fossil'
  | 'gambling'
  | 'alcohol'
  | 'nuclear'
  | 'animal-testing';

/** Extra facts of a product that comes from the backend (absent on mock data). */
export interface LiveInfo {
  assetClass?: string;
  sector?: string;
  currency: string;
  asOf: string;
  source: string;
  fit: Fit;
  stats: CardStats;
  tags: string[];
  /** Price / dividend split, risk tags, sources (absent in older snapshots). */
  extras?: CardExtras;
}

export interface Product {
  /** Present when the product comes from the Python API or its snapshot. */
  live?: LiveInfo;
  /** No BNCD quote page (crypto, indices...). */
  noQuote?: boolean;
  /** Symbol on BNCD when it differs from the ticker. */
  bncdSymbol?: string;
  /** Set only on fictional companies that belong to an excludable sector. */
  exclusion?: ExclusionTag;
  /** Fictional company: no real quote page (no BNCD link). */
  fictional?: boolean;
  /** Listing market in BNCD quote URLs. Defaults to "USA". */
  market?: string;
  ticker: Ticker;
  name: string;
  brandColor: string;
  price: number;
  reasons: string[];
  history: [Series, Series];
  rates: ScenarioRates;
}

export type ScenarioKey = 'optimistic' | 'median' | 'pessimistic';

export interface ProjectionPoint {
  month: number;
  value: number;
}
export type Projections = Record<ScenarioKey, ProjectionPoint[]>;

// v2: one entry of the infinite feed. `key` is `${ticker}#${seq}` and is unique within a feed session.
export interface FeedItem {
  key: string;
  product: Product;
}
