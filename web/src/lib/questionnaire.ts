import data from '../data/questions.json';
import { api } from './api';
import type { Answers, ProfileResponse, Question } from './api';
import { GOAL_ICON } from './account';
import type { Debt, Goal, Instrument, PortfolioDraft, Risk, SharedProfile, Withdrawal } from './account';
import type { ExclusionTag } from '../types';

/**
 * Questionnaire of the team (alphaforge/questionnaire.py). The next question comes from the API
 * (`GET /api/questionnaire/next`); `src/data/questions.json` is a static export used when the
 * API is down (same order, same visibility rules).
 */
export type Scope = 'account' | 'portfolio';

interface StaticData {
  account_order: string[];
  portfolio_order: string[];
  questions: Record<string, Question>;
  personas: Record<string, { id: string; name: string; summary: string; answers: Answers }>;
}
const STATIC = data as unknown as StaticData;
export const STATIC_PERSONAS = Object.values(STATIC.personas);

const exclusions = (a: Answers): string[] => {
  const v = a.C4;
  return Array.isArray(v) && !v.includes('unknown') ? v.filter((x) => x !== 'none') : [];
};

/** Mirror of questionnaire.visible(). */
function visible(qid: string, a: Answers): boolean {
  switch (qid) {
    case 'C1a':
      return a.C1 === 'self_employed' || a.C1 === 'other';
    case 'C2a':
      return ['lt_1m', '1_3m', 'unknown', 'skipped'].includes(a.C2 as string);
    case 'C4a':
      return exclusions(a).length > 0;
    case 'P4f':
      return a.P4 === 'regular';
    case 'P4a_when':
    case 'P4a_share':
      return a.P4 === 'lump_sum';
    case 'P5a':
      return a.P5 === 'hold' || a.P5 === 'add';
    default:
      return true;
  }
}

const HORIZON_ORDER = ['lt_1y', '1_3y', '3_5y', '5_10y', '10_15y', 'gt_15y'];

/** Static next question (offline mode), or null when the scope is finished. */
export function staticNext(a: Answers, scope: Scope): Question | null {
  const order = scope === 'account' ? STATIC.account_order : STATIC.portfolio_order;
  const qid = order.find((id) => !(id in a) && visible(id, a));
  if (!qid) return null;
  const q = STATIC.questions[qid];
  if (qid === 'P4a_when' && typeof a.P2 === 'string' && HORIZON_ORDER.includes(a.P2)) {
    // A withdrawal cannot be planned after the declared horizon.
    const keep = new Set([...HORIZON_ORDER.slice(0, HORIZON_ORDER.indexOf(a.P2) + 1), 'unknown']);
    return { ...q, choices: q.choices.filter((c) => keep.has(c.code)) };
  }
  return q;
}

export type NextResult = { question: Question | null; offline: boolean };

/** Next question from the API, else from the static copy. */
export async function fetchNext(a: Answers, scope: Scope): Promise<NextResult> {
  try {
    const r = await api.nextQuestion(a, scope);
    return { question: r.done ? null : r.question, offline: false };
  } catch {
    return { question: staticNext(a, scope), offline: true };
  }
}

/** Rough count of questions still to come (progress bar of an adaptive flow). */
export function remainingEstimate(a: Answers, scope: Scope): number {
  const order = scope === 'account' ? STATIC.account_order : STATIC.portfolio_order;
  return order.filter((id) => !(id in a) && visible(id, a)).length;
}

export function questionLabel(q: Question, code: string): string {
  return q.choices.find((c) => c.code === code)?.label ?? code;
}

// ---- answers -> local account / portfolio -----------------------------------------------------

/** Local "Profil investisseur" tab, filled from the account answers (C*). */
export function sharedFromAnswers(a: Answers): SharedProfile {
  const c1 = a.C1 as string | undefined;
  const c2 = a.C2 as string | undefined;
  const income = c1 === 'permanent' || c1 === 'pension' ? 'stable' : c1 === 'none_regular' ? 'precarious' : c1 ? 'variable' : null;
  const fund = c2 === 'gt_6m' ? 'gt6' : c2 === '3_6m' ? '3to6' : c2 === 'lt_1m' || c2 === '1_3m' ? 'lt3' : null;
  const obl = Array.isArray(a.C2a) ? a.C2a : [];
  const debts: Debt[] = [];
  if (obl.includes('housing')) debts.push('mortgage');
  if (obl.includes('debt')) debts.push('consumer');
  const c3 = a.C3 as string | undefined;
  const level = c3 === 'advanced' ? 'advanced' : c3 === 'intermediate' ? 'intermediate' : c3 ? 'beginner' : null;
  const ex = exclusions(a);
  const tags: ExclusionTag[] = [];
  if (ex.includes('fossil_fuels')) tags.push('fossil');
  if (ex.includes('weapons')) tags.push('weapons');
  if (ex.includes('sin')) tags.push('tobacco', 'gambling', 'alcohol');
  const instruments: Instrument[] = level && level !== 'beginner' ? ['stocks', 'etf'] : [];
  return {
    financial: income && fund ? { income, emergencyFund: fund } : null,
    obligations: { debts, dependents: obl.includes('dependents') ? 1 : 0 },
    experience: level ? { level, instruments } : null,
    preferences: { esg: ex.includes('controversies'), exclusions: tags },
  };
}

const HORIZON_YEARS: Record<string, number> = { lt_1y: 1, '1_3y': 2, '3_5y': 4, '5_10y': 8, '10_15y': 12, gt_15y: 20 };
const AMOUNT_MID: Record<string, number> = { lt_1k: 500, '1k_10k': 5000, '10k_50k': 30000, '50k_250k': 150000, gt_250k: 250000 };
const GOAL_OF: Record<string, Goal> = { preserve: 'safety', income: 'retirement', balanced: 'other', growth: 'retirement' };
const RISK_OF_OBJECTIVE: Record<string, Risk> = { preserve: 'prudent', income: 'prudent', balanced: 'balanced', growth: 'dynamic' };

/** Local risk class from the backend level (1-5), else from the declared objective. */
export function riskOf(level: number | undefined, a: Answers): Risk {
  if (typeof level === 'number') return level <= 2 ? 'prudent' : level === 3 ? 'balanced' : 'dynamic';
  return RISK_OF_OBJECTIVE[a.P1 as string] ?? 'balanced';
}

/** Local portfolio parameters filled from the portfolio answers (P*) and the backend profile. */
export function draftFromAnswers(
  name: string,
  a: Answers,
  profile?: ProfileResponse['profile'],
  icon?: PortfolioDraft['icon'],
): PortfolioDraft {
  const goal = GOAL_OF[a.P1 as string] ?? 'other';
  const p4 = a.P4 as string | undefined;
  const withdrawal: Withdrawal = p4 === 'lump_sum' ? 'total' : p4 === 'regular' || p4 === 'contingent' ? 'partial' : 'none';
  return {
    name,
    icon: icon ?? GOAL_ICON[goal],
    goal,
    horizonYears: profile?.horizon_years ? Math.max(1, Math.round(profile.horizon_years)) : (HORIZON_YEARS[a.P2 as string] ?? 10),
    risk: riskOf(profile?.level, a),
    initialAmount: AMOUNT_MID[a.P3 as string] ?? 10000,
    monthlyContribution: 0,
    withdrawal,
  };
}
