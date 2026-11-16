import { api, apiEnabled, ApiError } from './api';
import type { Answers, ProfileResponse } from './api';
import { readJson, writeJson } from './storage';
import type { PortfolioDraft, SharedProfile } from './account';
import { accountAnswersAfterEdit, portfolioAnswersAfterEdit } from './profileAnswers';

/**
 * Investor profiles computed by the backend, kept on this device (fictional data only).
 * One profile per account (answers C*) and one per portfolio (answers C* + P*). The feed uses
 * the active portfolio's profile, else the account's.
 */
export interface StoredProfile {
  /** null when the backend was unreachable: answers are kept, the profile is computed later. */
  profileId: string | null;
  /** Persona id (amira, mateo, robert) when the account was created in one click. */
  persona?: string;
  answers: Answers;
  profile?: ProfileResponse['profile'];
  reasoning?: string[];
  /** The answers changed locally but the server has not received them yet (sent again by `syncProfiles`). */
  pending?: boolean;
}

const accountKey = (id: string) => `buy-demo:apiprofile:${id}`;
const portfolioKey = (id: string) => `buy-demo:apiprofile:pf:${id}`;

export const readAccountProfile = (id: string) => readJson<StoredProfile>(accountKey(id));
export const writeAccountProfile = (id: string, p: StoredProfile) => writeJson(accountKey(id), p);
export const readPortfolioProfile = (id: string) => readJson<StoredProfile>(portfolioKey(id));
export const writePortfolioProfile = (id: string, p: StoredProfile) => writeJson(portfolioKey(id), p);

/**
 * Account-level answers (C*) of a stored account profile. A persona account stores the whole persona
 * (C* and P*): its P* answers belong to its first portfolio and must not be reused for another one.
 */
export function accountAnswersOf(id: string): Answers {
  const all = readAccountProfile(id)?.answers ?? {};
  return Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith('C')));
}

/** POST /api/profile; never throws (a failed call returns a profile without id). */
export async function submitProfile(body: { answers?: Answers; name?: string; persona?: string }): Promise<StoredProfile> {
  try {
    const r = await api.postProfile(body);
    return {
      profileId: r.profile_id,
      answers: body.answers ?? {},
      ...(body.persona ? { persona: body.persona } : {}),
      profile: r.profile,
      reasoning: r.reasoning,
    };
  } catch {
    return { profileId: null, answers: body.answers ?? {}, ...(body.persona ? { persona: body.persona } : {}) };
  }
}

/**
 * Accounts or portfolios created while the server was down keep their answers but no profile id.
 * When the API answers again, the saved answers are posted once more. Returns true if something was synced.
 */
export async function syncProfiles(accountId: string, accountName: string, portfolioIds: string[]): Promise<boolean> {
  if (!apiEnabled()) return false;
  let changed = false;
  if ([accountId, ...portfolioIds].some((id, i) => (i === 0 ? readAccountProfile(id) : readPortfolioProfile(id))?.pending)) {
    // Edits the server has not received yet. Names are not sent again: the server keeps the last one it received.
    changed = (await pushEdits(accountId, undefined, portfolioIds.map((id) => ({ id })), true)) || changed;
  }
  const acc = readAccountProfile(accountId);
  if (acc && !acc.profileId) {
    const r = await submitProfile(acc.persona ? { persona: acc.persona } : { answers: acc.answers, name: accountName });
    if (r.profileId) {
      writeAccountProfile(accountId, { ...r, answers: acc.answers });
      changed = true;
    }
  }
  const accountAnswers = accountAnswersOf(accountId);
  for (const id of portfolioIds) {
    const pf = readPortfolioProfile(id);
    if (!pf || pf.profileId) continue;
    const r = await submitProfile({ answers: { ...accountAnswers, ...pf.answers }, name: accountName });
    if (r.profileId) {
      writePortfolioProfile(id, { ...r, answers: pf.answers });
      changed = true;
    }
  }
  return changed;
}

// ---- edits of an existing account or portfolio ------------------------------------------------

/** Event sent when the server accepted new parameters for some profiles (their caches were cleared). */
export const PROFILES_CHANGED_EVENT = 'alphaforge:profiles-changed';

export function onProfilesChanged(listener: (profileIds: string[]) => void): () => void {
  const handler = (e: Event) => listener((e as CustomEvent<string[]>).detail ?? []);
  window.addEventListener(PROFILES_CHANGED_EVENT, handler);
  return () => window.removeEventListener(PROFILES_CHANGED_EVENT, handler);
}

type Outcome = { ok: ProfileResponse } | 'failed' | 'gone';
interface Target {
  answers: Answers;
  name?: string;
  write: ((o: Outcome) => void)[];
}

/** Result of a PUT merged into a stored profile (the local answers stay as they are). */
function settle(stored: StoredProfile | null, o: Outcome): StoredProfile | null {
  if (!stored) return null;
  if (o === 'failed') return { ...stored, pending: true };
  // The server no longer knows this profile: `syncProfiles` creates it again from the saved answers.
  if (o === 'gone') return { ...stored, profileId: null, pending: false };
  return { ...stored, profile: o.ok.profile, reasoning: o.ok.reasoning, pending: false };
}

/**
 * Sends the saved answers of the account and of the given portfolios to the server (PUT, same profile
 * id). With `onlyPending`, only the profiles marked `pending` are sent. A portfolio profile holds the
 * account answers (C*) plus its own (P*). A persona account shares its profile id with its portfolio:
 * that profile is sent once, with the portfolio answers.
 */
async function pushEdits(accountId: string, accountName: string | undefined, portfolios: { id: string; name?: string }[], onlyPending: boolean): Promise<boolean> {
  if (!apiEnabled()) return false;
  const acc = readAccountProfile(accountId);
  const accountAnswers = accountAnswersOf(accountId);
  const targets = new Map<string, Target>();
  const add = (pid: string, answers: Answers, name: string | undefined, write: (o: Outcome) => void) => {
    const t = targets.get(pid);
    if (t) {
      t.answers = answers;
      t.name = name ?? t.name;
      t.write.push(write);
    } else targets.set(pid, { answers, name, write: [write] });
  };
  if (acc?.profileId && (!onlyPending || acc.pending)) {
    add(acc.profileId, acc.answers, accountName, (o) => {
      const next = settle(readAccountProfile(accountId), o);
      if (next) writeAccountProfile(accountId, next);
    });
  }
  for (const pf of portfolios) {
    const stored = readPortfolioProfile(pf.id);
    if (!stored?.profileId || (onlyPending && !stored.pending && !targets.has(stored.profileId))) continue;
    add(stored.profileId, { ...accountAnswers, ...stored.answers }, pf.name, (o) => {
      const next = settle(readPortfolioProfile(pf.id), o);
      if (next) writePortfolioProfile(pf.id, next);
    });
  }
  const changed: string[] = [];
  for (const [pid, t] of targets) {
    let o: Outcome;
    try {
      o = { ok: await api.updateProfile(pid, { answers: t.answers, ...(t.name ? { name: t.name.slice(0, 60) } : {}) }) };
      changed.push(pid);
    } catch (e) {
      o = e instanceof ApiError && e.status === 404 ? 'gone' : 'failed';
    }
    t.write.forEach((w) => w(o));
  }
  if (changed.length) window.dispatchEvent(new CustomEvent(PROFILES_CHANGED_EVENT, { detail: changed }));
  return changed.length > 0;
}

const DRAFT_KEYS: (keyof PortfolioDraft)[] = ['name', 'icon', 'goal', 'horizonYears', 'risk', 'initialAmount', 'monthlyContribution', 'withdrawal'];

/**
 * A portfolio was edited (wizard): its answers follow the new parameters and the server profile is
 * updated, which clears every cache of this portfolio (feed, cards, Bedrock texts). Nothing is sent
 * when no parameter changed. Returns true when the server accepted the change.
 */
export async function pushPortfolioEdit(accountId: string, portfolioId: string, before: PortfolioDraft, after: PortfolioDraft): Promise<boolean> {
  if (DRAFT_KEYS.every((k) => before[k] === after[k])) return false;
  const stored = readPortfolioProfile(portfolioId);
  if (!stored) return false;
  writePortfolioProfile(portfolioId, { ...stored, answers: portfolioAnswersAfterEdit(stored.answers, before, after), pending: Boolean(stored.profileId) });
  return pushEdits(accountId, undefined, [{ id: portfolioId, name: after.name }], true);
}

/**
 * A section of the account profile was edited: the account answers follow it, and since every
 * portfolio profile holds the account answers, the account profile and all its portfolio profiles
 * are updated (their caches are cleared).
 */
export async function pushAccountEdit<K extends keyof SharedProfile>(
  accountId: string,
  accountName: string,
  portfolios: { id: string; name: string }[],
  key: K,
  value: SharedProfile[K],
): Promise<boolean> {
  const acc = readAccountProfile(accountId);
  if (!acc) return false;
  writeAccountProfile(accountId, { ...acc, answers: accountAnswersAfterEdit(acc.answers, key, value), pending: Boolean(acc.profileId) });
  for (const p of portfolios) {
    const stored = readPortfolioProfile(p.id);
    if (stored?.profileId) writePortfolioProfile(p.id, { ...stored, pending: true });
  }
  return pushEdits(accountId, accountName, portfolios, true);
}

/** The account was renamed: the account profile takes the new name (its caches are cleared). */
export async function pushAccountRename(accountId: string, name: string): Promise<boolean> {
  const acc = readAccountProfile(accountId);
  if (!acc?.profileId) return false;
  writeAccountProfile(accountId, { ...acc, pending: true });
  return pushEdits(accountId, name, [], true);
}
