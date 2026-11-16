/**
 * Client of the Python backend (see docs/api-contract.md). Every figure shown in the UI comes from
 * here ("code calculates"). Order of preference: live API -> /snapshot.json -> mock data.
 * Network calls are skipped when VITE_USE_API=false (tests, offline demos).
 */

export type Verdict = 'compatible' | 'tension' | 'conflict';
export interface Fit {
  verdict: Verdict;
  label: string;
  weight?: number;
}
export interface CardStats {
  cagr: number;
  vol: number;
  max_drawdown: number;
  sharpe?: number;
  worst_1y?: number;
  window: [string, string];
}
export interface ApiSeries {
  title: string;
  points: { label: string; value: number }[];
}
/** Gain over the window split between price and dividends (backend card_extras.income_split). */
export interface IncomeSplit {
  window: [string, string];
  /** Listing currency of the split (CAD or USD). */
  currency: string;
  total: number;
  price: number;
  dividends: number;
  /** Share of the (positive) gain that came from dividends, 0 to 1. */
  dividend_share: number;
  /** False when dividends are too small a part of the gain to be worth a bar. */
  show: boolean;
  /** Starter dataset only (corporate_actions.csv); null for the extended universe. */
  n_payments: number | null;
  per_share: number | null;
  yield_12m: number | null;
  method: string;
}
export type RiskLevel = 'high' | 'medium' | 'low' | 'info';
export interface RiskTag {
  code: string;
  label: string;
  level: RiskLevel;
  /** Figure or rule the tag comes from (shown to the user). */
  basis: string;
}
export interface CardSource {
  id: string;
  label: string;
  detail: string;
  url?: string;
}
/** Profile-independent facts of a card (backend alphaforge/card_extras.py). */
export interface CardExtras {
  income: IncomeSplit | null;
  risk_tags: RiskTag[];
  sources: CardSource[];
}

export interface ApiCard {
  ticker: string;
  name: string;
  sector?: string;
  asset_class?: string;
  currency: string;
  price: number;
  as_of: string;
  brandColor: string;
  fit: Fit;
  reasons: string[];
  history: ApiSeries[];
  stats: CardStats;
  tags?: string[];
  source: string;
  /** Absent in snapshots made before it existed. */
  extras?: CardExtras;
}
export interface FeedState {
  liked: string[];
  disliked: string[];
  neutral: string[];
  hidden: string[];
  saved: string[];
}
export interface Scenario {
  label: string;
  annual: number;
  final: number;
  path: { month: number; value: number }[];
}
export interface SensitivityPoint {
  shrink: number;
  erp: number;
  central_annual: number;
}
export interface Outlook {
  horizon_years: number;
  start_value: number;
  quantity: number;
  currency: string;
  scenarios: { best: Scenario; central: Scenario; worst: Scenario };
  share_below_start: number;
  method: string;
  assumptions: string[];
  limits: string[];
  disclaimer: string;
  /** How much the central scenario moves with the assumptions (sensitivity test). */
  sensitivity_summary?: string;
  /** Central annual rate for each pair (shrink toward the market prior, equity risk premium). */
  sensitivity?: SensitivityPoint[];
  /** Fitted model facts; beta is the sensitivity to the market proxy. */
  history?: { beta?: number; beta_proxy?: string };
}
export interface Source {
  id: string;
  name: string;
  url?: string;
  kind?: string;
  license?: string;
  as_of?: string;
  chosen_because?: string;
}
export interface FactCheck {
  passed: boolean;
  checks: { name: string; ok: boolean; detail?: string }[];
}
export interface Governance {
  passed: boolean;
  issues?: string[];
  numbers_checked?: number;
  attempts?: number;
  attempts_log?: { attempt: number; passed: boolean; issues?: string[] }[];
  fell_back_to_deterministic?: boolean;
}
export interface TraceEntry {
  agent: string;
  step: string;
  tool?: string;
  ms?: number;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
}
export interface Pipeline {
  sources: Source[];
  fact_check: FactCheck;
  data: {
    source_id?: string;
    currency?: string;
    start?: string;
    end?: string;
    n_obs?: number;
    missing_days?: number;
    notes?: string[];
  };
  explanation: {
    mode: 'bedrock' | 'offline';
    short: string;
    long?: string;
    governance: Governance;
  };
  trace?: TraceEntry[];
}
/** Portfolio-level risk before/after adding the security at `weight` (ex-ante, computed by code). */
export interface ImpactSide {
  vol?: number;
  ex_ante_vol?: number;
  max_drawdown?: number;
  [k: string]: unknown;
}
export interface Impact {
  weight?: number;
  fit?: Fit & { max_weight_within_profile?: number };
  before?: ImpactSide;
  after?: ImpactSide;
  notes?: string[];
}
/** GET /api/prices/{ticker}: every daily close of the dataset (adjusted, CAD). */
export interface PriceHistory {
  ticker: string;
  currency: string;
  as_of: string;
  source: string;
  frequency: 'daily';
  note?: string;
  points: { date: string; value: number }[];
}

export interface CardDetail {
  card: ApiCard;
  impact?: Impact;
  outlook: Outlook;
  pipeline: Pipeline;
}

export interface QuestionChoice {
  code: string;
  label: string;
}
export interface Question {
  id: string;
  level: string;
  type: 'single' | 'multi' | 'number' | 'text' | 'amount';
  element?: string;
  text: string;
  choices: QuestionChoice[];
  help?: string;
}
export type Answers = Record<string, string | string[]>;
export type NextQuestion = { done: true } | { done: false; question: Question };
export interface PersonaInfo {
  id: string;
  name: string;
  summary: string;
}
export interface ProfileResponse {
  profile_id: string;
  name?: string;
  profile?: {
    objective?: string;
    horizon_years?: number;
    risk_tolerance?: number;
    risk_capacity?: number;
    level?: number;
    level_label?: string;
    excluded?: string[];
    preferred?: string[];
    avoided?: string[];
  };
  reasoning?: string[];
  contradictions?: unknown[];
  notes?: string[];
}

export type CheckStatus = 'ok' | 'info' | 'warn' | 'conflict';
export interface IdeaCheck {
  ok: true;
  ticker: string;
  name: string;
  weight: number;
  verdict: Verdict;
  verdict_label: string;
  checks: { code: string; status: CheckStatus; message: string }[];
  max_weight_within_profile: number;
  explanation: { mode: 'bedrock' | 'offline'; short: string; long?: string; governance: Governance };
}
export type CheckResponse = IdeaCheck | { ok: false; message: string };
export type IdeaChoice = 'keep' | 'adjust' | 'drop';
export interface LearnView {
  declared: number;
  retained_level: number;
  revealed: { established: boolean; level: number | null; n: number; needed: number };
  status: string;
  messages: string[];
  update_to: number | null;
  retained_if_updated: number | null;
}
export interface PurchaseResult {
  simulated: true;
  notice?: string;
  tickers: string[];
  weight_each: number;
  overall: { verdict: Verdict; label: string; within_limits: boolean };
  max_equal_weight: number;
  summary: string;
}

/** One line of GET /api/hypotheses (built from the code constants). */
export interface HypothesisItem {
  group: string;
  label: string;
  value?: unknown;
  value_fr: string;
  source: 'hypothèse' | 'donnée' | 'règle';
  code_ref: string;
}

export type DataSource = 'api' | 'snapshot';
/** web/public/snapshot.json (scripts/export_snapshot.py): per persona, its profile, 20 cards and 8 card details. */
export interface SnapshotPersona {
  profile: ProfileResponse;
  feed: ApiCard[];
  details: Record<string, CardDetail>;
}
export interface Snapshot {
  personas: Record<string, SnapshotPersona>;
}
/** Which profile the data is for: backend id and/or persona id (used to choose a snapshot entry offline). */
export interface ProfileRef {
  profileId: string | null;
  persona?: string | null;
  /** Declared profile computed by the backend (absent for accounts without one, e.g. the demo account). */
  declared?: ProfileResponse['profile'] | null;
}

const TIMEOUT_MS = 6000;
/** Bedrock answers take about 17 s: /api/check and uncached /api/card get 60 s. */
export const SLOW_TIMEOUT_MS = 60000;
/** Cards asked per feed request; the feed keeps at least this many loaded ahead of the card on screen. */
export const FEED_PAGE = 5;
/** The first page of a new profile waits for its feed computation (about 3 s, more on a cold server). */
const FEED_TIMEOUT_MS = 30000;
// BASE_URL is "/" locally and "/absproxy/5173/" behind the code-server proxy: the API must be
// called under the same prefix, otherwise the browser asks the proxy host itself and fails.
const BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? `${import.meta.env.BASE_URL}api`;

/** False when VITE_USE_API=false: no network at all (mock data). Read at call time. */
export function apiEnabled(): boolean {
  return import.meta.env.VITE_USE_API !== 'false';
}

export class ApiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

/** fetch + timeout + JSON + typed error. */
export async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = TIMEOUT_MS): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctl.signal,
      headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
    });
    if (!res.ok) throw new ApiError(`HTTP ${res.status}`, res.status);
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(e instanceof Error ? e.message : 'Réseau indisponible');
  } finally {
    clearTimeout(timer);
  }
}

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });
function guard<T>(run: () => Promise<T>): Promise<T> {
  return apiEnabled() ? run() : Promise.reject(new ApiError('API désactivée'));
}

export const api = {
  health: () => guard(() => fetchJson<{ ok: boolean; data_as_of?: string; bedrock?: { connected: boolean } }>(`${BASE}/health`)),
  personas: () => guard(() => fetchJson<PersonaInfo[]>(`${BASE}/personas`)),
  nextQuestion: (answers: Answers, scope: 'account' | 'portfolio') =>
    guard(() =>
      fetchJson<NextQuestion>(
        `${BASE}/questionnaire/next?scope=${scope}&answers=${encodeURIComponent(JSON.stringify(answers))}`,
      ),
    ),
  postProfile: (body: { answers?: Answers; name?: string; persona?: string }) =>
    guard(() => fetchJson<ProfileResponse>(`${BASE}/profile`, post(body))),
  /** New answers for an existing profile (same id): the server clears every cache of this profile, Bedrock texts included. */
  updateProfile: (profileId: string, body: { answers: Answers; name?: string }) =>
    guard(() =>
      fetchJson<ProfileResponse>(`${BASE}/profile/${encodeURIComponent(profileId)}`, { method: 'PUT', body: JSON.stringify(body) }, SLOW_TIMEOUT_MS),
    ),
  /** Feed refresh: the server recomputes the feed and cards of this profile (its Bedrock texts are kept). */
  refreshProfile: (profileId: string) =>
    guard(() => fetchJson<{ ok: boolean }>(`${BASE}/profile/${encodeURIComponent(profileId)}/refresh`, post({}))),
  /** One page of the ranked feed, without the tickers in `exclude` (already received). */
  feed: (profileId: string | null, limit = FEED_PAGE, opts: { exclude?: readonly string[]; includeSeen?: boolean } = {}) =>
    guard(() =>
      fetchJson<{ items: ApiCard[]; remaining?: number; state?: FeedState }>(
        `${BASE}/feed?limit=${limit}${profileId ? `&profile_id=${encodeURIComponent(profileId)}` : ''}` +
          (opts.exclude?.length ? `&exclude=${encodeURIComponent(opts.exclude.join(','))}` : '') +
          (opts.includeSeen ? '&include_seen=true' : ''),
        { cache: 'no-store' },
        FEED_TIMEOUT_MS,
      ),
    ),
  /** Next pages: POST, the tickers to skip in the body (short URL, never cached by a proxy). */
  feedPage: (body: { profile_id: string; limit: number; exclude: string[]; include_seen: boolean }) =>
    guard(() =>
      fetchJson<{ items: ApiCard[]; remaining?: number; state?: FeedState }>(`${BASE}/feed/page`, { ...post(body), cache: 'no-store' }, FEED_TIMEOUT_MS),
    ),
  card: (ticker: string, profileId: string | null, quantity = 1, weight?: number) =>
    guard(() =>
      fetchJson<CardDetail>(
        `${BASE}/card/${encodeURIComponent(ticker)}?quantity=${quantity}${weight ? `&weight=${weight}` : ''}${profileId ? `&profile_id=${encodeURIComponent(profileId)}` : ''}`,
        undefined,
        SLOW_TIMEOUT_MS,
      ),
    ),
  check: (body: { profile_id: string; text?: string; ticker?: string; weight?: number; choice?: IdeaChoice }) =>
    guard(() => fetchJson<CheckResponse>(`${BASE}/check`, post(body), SLOW_TIMEOUT_MS)),
  /** Records the investor's choice only (no recomputation): idempotent thanks to decision_id. */
  recordChoice: (body: { profile_id: string; ticker: string; weight: number; choice: IdeaChoice; decision_id: string; max_weight_within_profile?: number }) =>
    guard(() => fetchJson<{ recorded: boolean; learn: LearnView }>(`${BASE}/check`, post({ ...body, record_only: true }))),
  learn: (profileId: string) => guard(() => fetchJson<LearnView>(`${BASE}/profile/${encodeURIComponent(profileId)}/learn`)),
  purchase: (body: { profile_id: string; tickers: string[]; weight: number }) =>
    guard(() => fetchJson<PurchaseResult>(`${BASE}/purchase`, post(body))),
  /** Full daily series of a ticker (price chart of the detailed view). No profile needed. */
  prices: (ticker: string) => guard(() => fetchJson<PriceHistory>(`${BASE}/prices/${encodeURIComponent(ticker)}`)),
  react: (profileId: string, ticker: string, action: string) =>
    guard(() => fetchJson<{ state: FeedState }>(`${BASE}/feed/react`, post({ profile_id: profileId, ticker, action }))),
};

/** Valid list of hypothesis items, else null. */
export function parseHypotheses(raw: unknown): HypothesisItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const ok = raw.every((x) => x && typeof x.group === 'string' && typeof x.label === 'string' && typeof x.value_fr === 'string');
  return ok ? (raw as HypothesisItem[]) : null;
}
/** GET /api/hypotheses, else snapshot.hypotheses, else null (the caller uses src/data/hypotheses.ts). */
export async function loadHypotheses(): Promise<HypothesisItem[] | null> {
  try {
    const parsed = parseHypotheses(await guard(() => fetchJson<unknown>(`${BASE}/hypotheses`)));
    if (parsed) return parsed;
  } catch {
    /* fall through */
  }
  if (!apiEnabled()) return null;
  const snap = (await loadSnapshot()) as (Snapshot & { hypotheses?: unknown }) | null;
  return parseHypotheses(snap?.hypotheses);
}

// ---- snapshot fallback ----------------------------------------------------------------------
let snapshotCache: Promise<Snapshot | null> | null = null;

/** Static copy of the API answers (web/public/snapshot.json), or null when missing. */
export function loadSnapshot(): Promise<Snapshot | null> {
  snapshotCache ??= fetchJson<Partial<Snapshot>>(`${import.meta.env.BASE_URL}snapshot.json`, undefined, 4000)
    .then((raw) => (raw.personas && Object.keys(raw.personas).length > 0 ? (raw as Snapshot) : null))
    .catch(() => null);
  return snapshotCache;
}
export function resetSnapshotCache() {
  snapshotCache = null;
}

function pickPersona(snap: Snapshot, ref: ProfileRef): SnapshotPersona | null {
  const all = Object.entries(snap.personas);
  return (
    all.find(([, p]) => ref.profileId && p.profile?.profile_id === ref.profileId)?.[1] ??
    (ref.persona ? snap.personas[ref.persona] : undefined) ??
    null
  );
}

/** Feed cards: API first, then snapshot, else null (caller falls back to mock data). */
/**
 * First page of the feed. `more` is true when the API has more cards (ask them with `loadFeedPage`);
 * the snapshot answers everything at once.
 */
export async function loadFeed(ref: ProfileRef): Promise<{ items: ApiCard[]; source: DataSource; more?: boolean } | null> {
  // The backend feed needs a profile (docs/api-contract.md); without one, only a persona snapshot can answer.
  if (ref.profileId) {
    try {
      const r = await api.feed(ref.profileId, FEED_PAGE);
      if (r.items.length > 0) return { items: r.items, source: 'api', more: hasMorePages(r) };
    } catch {
      /* fall through to the snapshot */
    }
  }
  if (!apiEnabled()) return null;
  const snap = await loadSnapshot();
  const p = snap ? pickPersona(snap, ref) : null;
  return p && p.feed.length > 0 ? { items: p.feed, source: 'snapshot' } : null;
}

// An older server without `remaining` answers everything in one page.
const hasMorePages = (r: { remaining?: number }) => typeof r.remaining === 'number' && r.remaining > 0;

/** Next feed page (API only): cards not in `exclude`; `all` asks every remaining card, liked or not. */
export async function loadFeedPage(
  profileId: string,
  exclude: readonly string[],
  all = false,
): Promise<{ items: ApiCard[]; more: boolean }> {
  const limit = all ? 100 : FEED_PAGE;
  const r = await api.feedPage({ profile_id: profileId, limit, exclude: [...exclude], include_seen: all });
  return { items: r.items, more: !all && hasMorePages(r) };
}

/** Card details: API first, then snapshot (paths are scaled by quantity afterwards). */
export async function loadCard(
  ticker: string,
  ref: ProfileRef,
  weight?: number,
): Promise<{ detail: CardDetail; source: DataSource } | null> {
  try {
    return { detail: await api.card(ticker, ref.profileId, 1, weight), source: 'api' };
  } catch {
    /* fall through */
  }
  if (!apiEnabled()) return null;
  const snap = await loadSnapshot();
  const detail = snap ? pickPersona(snap, ref)?.details[ticker] : undefined;
  return detail ? { detail, source: 'snapshot' } : null;
}

const priceCache = new Map<string, Promise<PriceHistory | null>>();

/** Daily series from the API (kept for the session), or null when the server cannot give it. */
export function loadPrices(ticker: string): Promise<PriceHistory | null> {
  let hit = priceCache.get(ticker);
  if (!hit) {
    hit = api.prices(ticker).then(
      (r) => (Array.isArray(r.points) && r.points.length >= 2 ? r : null),
      () => null,
    );
    // A failure is not kept: the next opening of the card asks again.
    hit.then((r) => r === null && priceCache.delete(ticker));
    priceCache.set(ticker, hit);
  }
  return hit;
}
export function resetPriceCache() {
  priceCache.clear();
}

/** Scales a scenario set by the quantity (paths are linear in quantity). */
export function scaleOutlook(o: Outlook, quantity: number): Outlook {
  const k = o.quantity > 0 ? quantity / o.quantity : 0;
  const sc = (s: Scenario): Scenario => ({
    ...s,
    final: s.final * k,
    path: s.path.map((p) => ({ month: p.month, value: p.value * k })),
  });
  return {
    ...o,
    quantity,
    start_value: o.start_value * k,
    scenarios: { best: sc(o.scenarios.best), central: sc(o.scenarios.central), worst: sc(o.scenarios.worst) },
  };
}
