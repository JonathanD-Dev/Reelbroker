import type { ExclusionTag, Product, Ticker } from '../types';

// ---------------------------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------------------------

export type Risk = 'prudent' | 'balanced' | 'dynamic';
export type IncomeStability = 'stable' | 'variable' | 'precarious';
export type EmergencyFund = 'none' | 'lt3' | '3to6' | 'gt6';
export type Debt = 'mortgage' | 'student' | 'car' | 'consumer';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type Instrument = 'stocks' | 'etf' | 'bonds' | 'crypto';
export type Goal = 'retirement' | 'home' | 'education' | 'travel' | 'safety' | 'other';
export type Withdrawal = 'none' | 'partial' | 'total';

/** Shared by every portfolio of the account. `null` = section not filled in yet. */
export interface SharedProfile {
  financial: { income: IncomeStability; emergencyFund: EmergencyFund } | null;
  obligations: { debts: Debt[]; dependents: number } | null;
  experience: { level: ExperienceLevel; instruments: Instrument[] } | null;
  preferences: { esg: boolean; exclusions: ExclusionTag[] } | null;
}

export interface Position {
  ticker: Ticker;
  quantity: number;
  /** Simulated purchase price (USD). */
  price: number;
  /** Added when opening BNCD: the real purchase is not confirmed. */
  unconfirmed?: boolean;
}

export type PortfolioIcon =
  | 'sunset'
  | 'home'
  | 'plane'
  | 'school'
  | 'shield'
  | 'wallet'
  | 'car'
  | 'heart'
  | 'growth'
  | 'briefcase'
  | 'gift'
  | 'star';

/** Accessible names of the icons (also shown as tooltips in the picker). */
export const ICON_LABEL: Record<PortfolioIcon, string> = {
  sunset: 'Soleil couchant',
  home: 'Maison',
  plane: 'Avion',
  school: 'Diplôme',
  shield: 'Bouclier',
  wallet: 'Portefeuille',
  car: 'Voiture',
  heart: 'Cœur',
  growth: 'Croissance',
  briefcase: 'Mallette',
  gift: 'Cadeau',
  star: 'Étoile',
};

/** Own parameters of one portfolio / investment project. */
export interface Portfolio {
  id: string;
  /** Chosen in the portfolio questionnaire; shown on the Profile tab when active. */
  icon: PortfolioIcon;
  name: string;
  goal: Goal;
  horizonYears: number;
  risk: Risk;
  initialAmount: number;
  monthlyContribution: number;
  withdrawal: Withdrawal;
  color: string;
  positions: Position[];
  /** Uninvested money (USD). Starts at the initial amount; simulated purchases draw on it. */
  cash: number;
}

export interface Account {
  name: string;
  shared: SharedProfile;
  portfolios: Portfolio[];
  activeId: string | null;
  /** Portfolio ids, most recently used (made active) first. Contains every portfolio once. */
  recent: string[];
}

/** Puts `id` first in the most-recently-used list. */
export function touchRecent(recent: readonly string[], id: string): string[] {
  return [id, ...recent.filter((r) => r !== id)];
}

/**
 * Keeps known ids in their recent order, appends portfolios never used (creation order),
 * and makes sure the active portfolio comes first.
 */
export function normalizeRecent(
  recent: readonly string[],
  portfolios: readonly Portfolio[],
  activeId: string | null,
): string[] {
  const ids = new Set(portfolios.map((p) => p.id));
  const ordered = [...new Set(recent)].filter((id) => ids.has(id));
  for (const p of portfolios) if (!ordered.includes(p.id)) ordered.push(p.id);
  return activeId && ids.has(activeId) ? touchRecent(ordered, activeId) : ordered;
}

/** Portfolios in most-recently-used order (active first). */
export function portfoliosByRecent(account: Account): Portfolio[] {
  const byId = new Map(account.portfolios.map((p) => [p.id, p]));
  return normalizeRecent(account.recent, account.portfolios, account.activeId).flatMap((id) => {
    const p = byId.get(id);
    return p ? [p] : [];
  });
}

export type PortfolioDraft = Omit<Portfolio, 'id' | 'color' | 'positions' | 'cash'>;

const cents = (n: number) => Math.round(n * 100) / 100;

/** Cost of the positions at their purchase price ("Actifs (actions)"). */
export function investedValue(p: Pick<Portfolio, 'positions'>): number {
  return cents(p.positions.reduce((sum, pos) => sum + pos.quantity * pos.price, 0));
}

/** Cash of a portfolio saved before cash existed: initial amount minus what was invested. */
export function initialCash(initialAmount: number, positions: Position[]): number {
  return Math.max(0, cents(initialAmount - investedValue({ positions })));
}

/** Editing the initial amount moves the cash by the same difference (never below 0). */
export function cashAfterInitialChange(cash: number, oldInitial: number, newInitial: number): number {
  return Math.max(0, cents(cash + newInitial - oldInitial));
}

// ---------------------------------------------------------------------------------------------
// Labels (French UI)
// ---------------------------------------------------------------------------------------------

export const RISK_LABEL: Record<Risk, string> = {
  prudent: 'Prudent',
  balanced: 'Équilibré',
  dynamic: 'Dynamique',
};
export const RISK_LEVEL: Record<Risk, 1 | 2 | 3> = { prudent: 1, balanced: 2, dynamic: 3 };
const RISK_BY_LEVEL: Risk[] = ['prudent', 'balanced', 'dynamic'];

export const INCOME_LABEL: Record<IncomeStability, string> = {
  stable: 'Revenus stables',
  variable: 'Revenus variables',
  precarious: 'Revenus précaires',
};
export const FUND_LABEL: Record<EmergencyFund, string> = {
  none: 'aucun fonds d’urgence',
  lt3: 'fonds d’urgence < 3 mois',
  '3to6': 'fonds d’urgence 3 à 6 mois',
  gt6: 'fonds d’urgence > 6 mois',
};
export const DEBT_LABEL: Record<Debt, string> = {
  mortgage: 'Hypothèque',
  student: 'Prêt étudiant',
  car: 'Prêt auto',
  consumer: 'Crédit à la consommation',
};
export const EXPERIENCE_LABEL: Record<ExperienceLevel, string> = {
  beginner: 'Débutant',
  intermediate: 'Intermédiaire',
  advanced: 'Avancé',
};
export const INSTRUMENT_LABEL: Record<Instrument, string> = {
  stocks: 'actions',
  etf: 'FNB',
  bonds: 'obligations',
  crypto: 'cryptoactifs',
};
export const EXCLUSION_LABEL: Record<ExclusionTag, string> = {
  tobacco: 'Tabac',
  weapons: 'Armes',
  fossil: 'Énergies fossiles',
  gambling: 'Jeux d’argent',
  alcohol: 'Alcool',
  nuclear: 'Nucléaire',
  'animal-testing': 'Tests sur animaux',
};
export const GOAL_LABEL: Record<Goal, string> = {
  retirement: 'Préparer la retraite',
  home: 'Acheter une maison',
  education: 'Financer des études',
  travel: 'Voyager',
  safety: 'Épargne de précaution',
  other: 'Autre projet',
};
export const WITHDRAWAL_LABEL: Record<Withdrawal, string> = {
  none: 'Aucun retrait prévu',
  partial: 'Retraits partiels possibles',
  total: 'Retrait total à l’échéance',
};

const keysOf = <T extends string>(r: Record<T, unknown>) => Object.keys(r) as T[];
export const RISKS = keysOf(RISK_LABEL);
export const INCOMES = keysOf(INCOME_LABEL);
export const FUNDS = keysOf(FUND_LABEL);
export const DEBTS = keysOf(DEBT_LABEL);
export const LEVELS = keysOf(EXPERIENCE_LABEL);
export const INSTRUMENTS = keysOf(INSTRUMENT_LABEL);
export const EXCLUSIONS = keysOf(EXCLUSION_LABEL);
export const GOALS = keysOf(GOAL_LABEL);
export const WITHDRAWALS = keysOf(WITHDRAWAL_LABEL);
export const ICONS = keysOf(ICON_LABEL);

/** Icon suggested for a goal until the user picks one. */
export const GOAL_ICON: Record<Goal, PortfolioIcon> = {
  retirement: 'sunset',
  home: 'home',
  education: 'school',
  travel: 'plane',
  safety: 'shield',
  other: 'star',
};

export const PORTFOLIO_COLORS = ['#3d7cf5', '#2e9e4f', '#c98a12', '#b5476b', '#6a4fd1', '#1f8a8a'];

export const MIN_HORIZON = 1;
export const MAX_HORIZON = 40;
export const MAX_AMOUNT = 10_000_000;

// ---------------------------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------------------------

export function sharedSummary(shared: SharedProfile): Record<keyof SharedProfile, string | null> {
  const f = shared.financial;
  const o = shared.obligations;
  const e = shared.experience;
  const p = shared.preferences;
  return {
    financial: f ? `${INCOME_LABEL[f.income]} · ${FUND_LABEL[f.emergencyFund]}` : null,
    obligations: o
      ? [
          o.debts.length ? o.debts.map((d) => DEBT_LABEL[d]).join(', ') : 'Aucune dette',
          o.dependents === 0
            ? 'aucune personne à charge'
            : `${o.dependents} personne${o.dependents > 1 ? 's' : ''} à charge`,
        ].join(' · ')
      : null,
    experience: e
      ? [EXPERIENCE_LABEL[e.level], e.instruments.map((i) => INSTRUMENT_LABEL[i]).join(', ')]
          .filter(Boolean)
          .join(' · ')
      : null,
    preferences: p
      ? [
          p.esg ? 'ESG privilégié' : 'Sans préférence ESG',
          p.exclusions.length
            ? 'exclut ' + p.exclusions.map((x) => EXCLUSION_LABEL[x].toLowerCase()).join(', ')
            : 'aucune exclusion',
        ].join(' · ')
      : null,
  };
}

export function completedSections(shared: SharedProfile): number {
  return Object.values(shared).filter((v) => v !== null).length;
}

export function horizonLabel(years: number, from = new Date().getFullYear()): string {
  return `${years} an${years > 1 ? 's' : ''} (${from + years})`;
}

/** Total value: assets (at purchase price) + cash. */
export function portfolioValue(p: Portfolio): number {
  return cents(investedValue(p) + p.cash);
}

export function isExcluded(product: Product, shared: SharedProfile): boolean {
  return Boolean(product.exclusion && shared.preferences?.exclusions.includes(product.exclusion));
}

/** Warning when a product's pessimistic scenario is too deep for the portfolio's risk tolerance. */
export function riskWarning(product: Product, portfolio: Portfolio): string | null {
  const worst = product.rates.pessimistic;
  if (portfolio.risk === 'prudent' && worst <= -0.15) {
    return `Produit volatil pour un portefeuille ${RISK_LABEL.prudent.toLowerCase()} (scénario pessimiste ${Math.round(worst * 100)} %).`;
  }
  if (portfolio.risk === 'balanced' && worst <= -0.3) {
    return `Produit très volatil pour un portefeuille ${RISK_LABEL.balanced.toLowerCase()} (scénario pessimiste ${Math.round(worst * 100)} %).`;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Risk suggestion (questionnaire step 3)
// ---------------------------------------------------------------------------------------------

export interface RiskSuggestion {
  risk: Risk;
  /** Why the answer was capped, or what was taken into account. */
  reasons: string[];
}

export function suggestRisk(answer: Risk, horizonYears: number, shared: SharedProfile): RiskSuggestion {
  let cap = 3;
  const reasons: string[] = [];
  const limit = (level: number, why: string) => {
    if (level < cap) cap = level;
    if (level < RISK_LEVEL[answer]) reasons.push(why);
  };
  if (horizonYears < 3) limit(1, 'Horizon de moins de 3 ans');
  else if (horizonYears < 7) limit(2, 'Horizon de moins de 7 ans');
  const f = shared.financial;
  if (f && (f.income === 'precarious' || f.emergencyFund === 'none')) {
    limit(2, 'Situation financière à consolider (revenus ou fonds d’urgence)');
  }
  if (shared.experience?.level === 'beginner') limit(2, 'Expérience débutante');
  if ((shared.obligations?.dependents ?? 0) >= 3) limit(2, 'Plusieurs personnes à charge');
  const risk = RISK_BY_LEVEL[Math.min(RISK_LEVEL[answer], cap) - 1];
  if (reasons.length === 0 && f?.income === 'stable') reasons.push('Tient compte de vos revenus stables');
  return { risk, reasons };
}

export const RISK_RANGE: Record<Risk, string> = {
  prudent: 'Baisses temporaires de −5 % à −10 % possibles.',
  balanced: 'Baisses temporaires de −15 % à −25 % possibles.',
  dynamic: 'Baisses temporaires de −25 % à −35 % possibles.',
};

// ---------------------------------------------------------------------------------------------
// Projection (median, annual compounding, fictitious rates)
// ---------------------------------------------------------------------------------------------

export const MEDIAN_RATE: Record<Risk, number> = { prudent: 0.03, balanced: 0.05, dynamic: 0.07 };

/** Yearly values from year 0 to the horizon: initial amount + monthly contributions. */
export function projectPortfolio(p: Pick<Portfolio, 'initialAmount' | 'monthlyContribution' | 'horizonYears' | 'risk'>): number[] {
  const r = MEDIAN_RATE[p.risk];
  const yearly = p.monthlyContribution * 12;
  const values = [p.initialAmount];
  for (let y = 1; y <= p.horizonYears; y++) {
    values.push(Math.round((values[y - 1] * (1 + r) + yearly) * 100) / 100);
  }
  return values;
}

// ---------------------------------------------------------------------------------------------
// Persistence: validation of untrusted JSON
// ---------------------------------------------------------------------------------------------

export const ACCOUNT_KEY = 'buy-demo:account';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const oneOf = <T extends string>(v: unknown, list: readonly T[]): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);
const listOf = <T extends string>(v: unknown, list: readonly T[]): T[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is T => oneOf(x, list)))] : [];
const num = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;
const text = (v: unknown, max = 60): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null;

function parseShared(v: unknown): SharedProfile {
  const o = isObj(v) ? v : {};
  const f = isObj(o.financial) ? o.financial : null;
  const ob = isObj(o.obligations) ? o.obligations : null;
  const e = isObj(o.experience) ? o.experience : null;
  const p = isObj(o.preferences) ? o.preferences : null;
  return {
    financial:
      f && oneOf(f.income, INCOMES) && oneOf(f.emergencyFund, FUNDS)
        ? { income: f.income, emergencyFund: f.emergencyFund }
        : null,
    obligations: ob
      ? { debts: listOf(ob.debts, DEBTS), dependents: Math.round(num(ob.dependents, 0, 20) ?? 0) }
      : null,
    experience: e && oneOf(e.level, LEVELS) ? { level: e.level, instruments: listOf(e.instruments, INSTRUMENTS) } : null,
    preferences: p ? { esg: p.esg === true, exclusions: listOf(p.exclusions, EXCLUSIONS) } : null,
  };
}

function parsePortfolio(v: unknown): Portfolio | null {
  if (!isObj(v)) return null;
  const id = text(v.id, 40);
  const name = text(v.name);
  const horizon = num(v.horizonYears, MIN_HORIZON, MAX_HORIZON);
  const initial = num(v.initialAmount, 0, MAX_AMOUNT);
  const monthly = num(v.monthlyContribution, 0, MAX_AMOUNT);
  if (!id || !name || horizon === null || initial === null || monthly === null) return null;
  if (!oneOf(v.goal, GOALS) || !oneOf(v.risk, RISKS) || !oneOf(v.withdrawal, WITHDRAWALS)) return null;
  const positions = Array.isArray(v.positions)
    ? v.positions.flatMap((p): Position[] => {
        if (!isObj(p)) return [];
        const ticker = text(p.ticker, 10);
        const quantity = num(p.quantity, 1, 100_000);
        const price = num(p.price, 0.01, 1_000_000);
        if (!ticker || quantity === null || price === null) return [];
        const pos: Position = { ticker, quantity: Math.floor(quantity), price };
        if (p.unconfirmed === true) pos.unconfirmed = true;
        return [pos];
      })
    : [];
  const cash = num(v.cash, 0, MAX_AMOUNT * 2);
  return {
    id,
    // Saved before cash existed: initial amount minus what was invested.
    cash: cash !== null ? cents(cash) : initialCash(initial, positions),
    // Portfolios saved before icons existed get the icon of their goal.
    icon: oneOf(v.icon, ICONS) ? v.icon : GOAL_ICON[v.goal],
    name,
    goal: v.goal,
    horizonYears: Math.round(horizon),
    risk: v.risk,
    initialAmount: initial,
    monthlyContribution: monthly,
    withdrawal: v.withdrawal,
    color: typeof v.color === 'string' && /^#[0-9a-f]{6}$/i.test(v.color) ? v.color : PORTFOLIO_COLORS[0],
    positions,
  };
}

/** Returns a valid account or `null` when the stored value is unusable. */
export function parseAccount(v: unknown): Account | null {
  if (!isObj(v)) return null;
  const portfolios: Portfolio[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(v.portfolios) ? v.portfolios : []) {
    const p = parsePortfolio(raw);
    if (p && !seen.has(p.id)) {
      seen.add(p.id);
      portfolios.push(p);
    }
  }
  const activeId = typeof v.activeId === 'string' && seen.has(v.activeId) ? v.activeId : portfolios[0]?.id ?? null;
  // Accounts saved before the recent order existed: active first, then creation order.
  const storedRecent = Array.isArray(v.recent) ? v.recent.filter((x): x is string => typeof x === 'string') : [];
  return {
    name: text(v.name, 40) ?? 'Mon compte',
    shared: parseShared(v.shared),
    portfolios,
    activeId,
    recent: normalizeRecent(storedRecent, portfolios, activeId),
  };
}

/**
 * Id of the built-in demo account ("Alex Tremblay"), stored under the historical key. Also the
 * placeholder account id while nobody is logged in.
 */
export const DEMO_ACCOUNT_ID = 'demo';

/**
 * The demo account is removed from the app: only the three personas of the case and the accounts
 * people create exist. The tests keep it as their ready-made logged-in fixture (VITE_DEMO_ACCOUNT=true
 * in vite.config.ts, `test.env`). Read at call time.
 */
export function demoAccountEnabled(): boolean {
  return import.meta.env.VITE_DEMO_ACCOUNT === 'true';
}

/** Storage key of an account. The demo account keeps the historical `buy-demo:account` key. */
export const accountKey = (id: string) => (id === DEMO_ACCOUNT_ID ? ACCOUNT_KEY : `${ACCOUNT_KEY}:${id}`);

/** Reads an account; the demo account falls back to its default content. */
export function readAccount(id: string = DEMO_ACCOUNT_ID): Account {
  try {
    const raw = localStorage.getItem(accountKey(id));
    if (raw !== null) return parseAccount(JSON.parse(raw)) ?? emptyOrDemo(id);
  } catch {
    // corrupted value or storage unavailable: fall back to the default content
  }
  return emptyOrDemo(id);
}

function emptyOrDemo(id: string): Account {
  return id === DEMO_ACCOUNT_ID && demoAccountEnabled()
    ? demoAccount()
    : { name: 'Mon compte', shared: { financial: null, obligations: null, experience: null, preferences: null }, portfolios: [], activeId: null, recent: [] };
}

export function writeAccount(account: Account, id: string = DEMO_ACCOUNT_ID): void {
  try {
    localStorage.setItem(accountKey(id), JSON.stringify(account));
  } catch {
    // storage unavailable or full: ignore silently
  }
}

// ---------------------------------------------------------------------------------------------
// Demo account (first launch). The three default exclusions hide the fictional companies.
// ---------------------------------------------------------------------------------------------

export function demoAccount(): Account {
  return {
    name: 'Alex Tremblay',
    shared: {
      financial: { income: 'stable', emergencyFund: '3to6' },
      obligations: { debts: ['mortgage'], dependents: 1 },
      experience: { level: 'intermediate', instruments: ['stocks', 'etf'] },
      preferences: { esg: true, exclusions: ['tobacco', 'fossil', 'gambling'] },
    },
    portfolios: [
      {
        id: 'demo-retirement',
        icon: 'sunset',
        name: 'Retraite',
        goal: 'retirement',
        horizonYears: 25,
        risk: 'dynamic',
        initialAmount: 10_000,
        monthlyContribution: 300,
        withdrawal: 'none',
        color: PORTFOLIO_COLORS[0],
        positions: [
          { ticker: 'NVDA', quantity: 10, price: 118.5 },
          { ticker: 'MSFT', quantity: 2, price: 415 },
        ],
        cash: 7_985, // 10 000 − 1 185 (NVDA) − 830 (MSFT)
      },
      {
        id: 'demo-home',
        icon: 'home',
        name: 'Mise de fonds maison',
        goal: 'home',
        horizonYears: 5,
        risk: 'prudent',
        initialAmount: 20_000,
        monthlyContribution: 500,
        withdrawal: 'total',
        color: PORTFOLIO_COLORS[1],
        positions: [{ ticker: 'KO', quantity: 20, price: 63 }],
        cash: 18_740, // 20 000 − 1 260 (KO)
      },
      {
        id: 'demo-travel',
        icon: 'plane',
        name: 'Projet voyage',
        goal: 'travel',
        horizonYears: 3,
        risk: 'balanced',
        initialAmount: 3_000,
        monthlyContribution: 0,
        withdrawal: 'partial',
        color: PORTFOLIO_COLORS[2],
        positions: [],
        cash: 3_000,
      },
    ],
    activeId: 'demo-retirement',
    recent: ['demo-retirement', 'demo-home', 'demo-travel'],
  };
}

export function emptyDraft(): PortfolioDraft {
  return {
    name: '',
    icon: GOAL_ICON.retirement,
    goal: 'retirement',
    horizonYears: 10,
    risk: 'balanced',
    initialAmount: 1_000,
    monthlyContribution: 0,
    withdrawal: 'none',
  };
}
