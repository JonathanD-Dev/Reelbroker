import type { Answers } from './api';
import type { Goal, PortfolioDraft, Risk, SharedProfile, Withdrawal } from './account';

/**
 * Local edits (portfolio wizard, "Profil investisseur" forms) turned back into questionnaire answers,
 * so the backend profile follows them (PUT /api/profile/{id}). Inverse of `draftFromAnswers` and
 * `sharedFromAnswers` (lib/questionnaire.ts). Only the fields that changed are rewritten: the other
 * answers, often more precise than the local fields, are kept as they are.
 */

const GOAL_ANSWER: Record<Goal, string> = {
  retirement: 'growth',
  safety: 'preserve',
  home: 'balanced',
  education: 'balanced',
  travel: 'balanced',
  other: 'balanced',
};

/** Horizon class of the questionnaire; round trip with HORIZON_YEARS of lib/questionnaire.ts. */
export function horizonAnswer(years: number): string {
  if (years <= 1) return 'lt_1y';
  if (years < 3) return '1_3y';
  if (years < 5) return '3_5y';
  if (years < 10) return '5_10y';
  if (years < 15) return '10_15y';
  return 'gt_15y';
}

export function amountAnswer(amount: number): string {
  if (amount < 1000) return 'lt_1k';
  if (amount < 10000) return '1k_10k';
  if (amount < 50000) return '10k_50k';
  if (amount < 250000) return '50k_250k';
  return 'gt_250k';
}

/** Reaction to a 15 % loss (P5): the question behind the local risk class. */
const RISK_ANSWER: Record<Risk, string> = { prudent: 'sell_part', balanced: 'hold', dynamic: 'add' };

const WITHDRAWAL_ANSWER: Record<Withdrawal, string> = { none: 'none', partial: 'regular', total: 'lump_sum' };

function drop(a: Answers, ...keys: string[]): Answers {
  const out = { ...a };
  for (const k of keys) delete out[k];
  return out;
}

/** Portfolio answers (P*) after an edit of the portfolio parameters. */
export function portfolioAnswersAfterEdit(prev: Answers, before: PortfolioDraft, after: PortfolioDraft): Answers {
  let a: Answers = { ...prev };
  if (after.goal !== before.goal) a.P1 = GOAL_ANSWER[after.goal];
  if (after.horizonYears !== before.horizonYears) a.P2 = horizonAnswer(after.horizonYears);
  if (after.initialAmount !== before.initialAmount) {
    a.P3 = amountAnswer(after.initialAmount);
    a.P3_exact = String(after.initialAmount);
  }
  if (after.withdrawal !== before.withdrawal) {
    // "partial" covers regular and occasional withdrawals: an occasional one stays as declared.
    const keep = after.withdrawal === 'partial' && (prev.P4 === 'regular' || prev.P4 === 'contingent');
    if (!keep) a.P4 = WITHDRAWAL_ANSWER[after.withdrawal];
    if (a.P4 !== 'regular') a = drop(a, 'P4f');
    if (a.P4 !== 'lump_sum') a = drop(a, 'P4a_when', 'P4a_share');
  }
  if (after.risk !== before.risk) {
    a.P5 = RISK_ANSWER[after.risk];
    if (a.P5 !== 'hold' && a.P5 !== 'add') a = drop(a, 'P5a');
  }
  return a;
}

const SIN = ['tobacco', 'gambling', 'alcohol'];

/** Account answers (C*, plus any P* of a persona account) after an edit of one "Profil investisseur" section. */
export function accountAnswersAfterEdit<K extends keyof SharedProfile>(prev: Answers, key: K, value: SharedProfile[K]): Answers {
  let a: Answers = { ...prev };
  if (key === 'financial') {
    const v = value as SharedProfile['financial'];
    if (!v) return a;
    const c1 = prev.C1 as string | undefined;
    if (v.income === 'stable') a.C1 = c1 === 'permanent' || c1 === 'pension' ? c1 : 'permanent';
    else if (v.income === 'precarious') a.C1 = 'none_regular';
    else a.C1 = c1 === 'contract' || c1 === 'self_employed' || c1 === 'other' ? c1 : 'contract';
    if (a.C1 !== 'self_employed' && a.C1 !== 'other') a = drop(a, 'C1a');
    const c2 = prev.C2 as string | undefined;
    a.C2 =
      v.emergencyFund === 'gt6' ? 'gt_6m' : v.emergencyFund === '3to6' ? '3_6m' : v.emergencyFund === 'none' ? 'lt_1m' : c2 === 'lt_1m' || c2 === '1_3m' ? c2 : '1_3m';
  } else if (key === 'obligations') {
    const v = value as SharedProfile['obligations'];
    if (!v) return a;
    const prevList = Array.isArray(prev.C2a) ? (prev.C2a as string[]) : [];
    const list: string[] = [];
    if (v.dependents > 0) list.push('dependents');
    if (v.debts.includes('mortgage')) list.push('housing');
    if (v.debts.some((d) => d !== 'mortgage')) list.push('debt');
    if (prevList.includes('family_support')) list.push('family_support');
    a.C2a = list.length ? list : ['none'];
  } else if (key === 'experience') {
    const v = value as SharedProfile['experience'];
    if (!v) return a;
    a.C3 = v.level === 'beginner' && prev.C3 === 'none' ? 'none' : v.level;
  } else if (key === 'preferences') {
    const v = value as SharedProfile['preferences'];
    if (!v) return a;
    const prevList = Array.isArray(prev.C4) ? (prev.C4 as string[]) : [];
    const list: string[] = [];
    if (v.exclusions.includes('fossil')) list.push('fossil_fuels');
    if (v.exclusions.includes('weapons')) list.push('weapons');
    if (v.exclusions.some((t) => SIN.includes(t))) list.push('sin');
    if (v.esg) list.push('controversies');
    // Choices without a local field (crypto, other) are kept.
    for (const k of ['crypto', 'other']) if (prevList.includes(k)) list.push(k);
    a.C4 = list.length ? list : ['none'];
    if (!list.length) a = drop(a, 'C4a', 'C4_text');
  }
  return a;
}
