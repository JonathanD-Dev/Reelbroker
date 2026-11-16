import { DEMO_ACCOUNT_ID, PORTFOLIO_COLORS, demoAccountEnabled, readAccount, touchRecent, writeAccount } from './account';
import type { Account, PortfolioDraft, SharedProfile } from './account';

/**
 * Several local demo accounts on the device (no password: demo only, see the datathon rules).
 * Registry `buy-demo:accounts` = [{ id, name }]; each account is stored under accountKey(id).
 * The demo account "Alex Tremblay" (id "demo") exists only in the tests (see demoAccountEnabled).
 */
export const ACCOUNTS_KEY = 'buy-demo:accounts';

export interface AccountEntry {
  id: string;
  name: string;
}

/** Case-, accent- and space-insensitive comparison of account names. */
export const normalizeName = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();

export function readRegistry(): AccountEntry[] {
  let list: AccountEntry[] = [];
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    const v: unknown = raw === null ? null : JSON.parse(raw);
    if (Array.isArray(v)) {
      list = v.flatMap((e): AccountEntry[] =>
        e && typeof e === 'object' && typeof e.id === 'string' && /^[\w-]{1,40}$/.test(e.id) && typeof e.name === 'string' && e.name.trim()
          ? [{ id: e.id, name: e.name.trim().slice(0, 40) }]
          : [],
      );
    }
  } catch {
    // corrupted registry: rebuilt below
  }
  if (demoAccountEnabled()) {
    // Tests only: the demo account is always listed, with its current (possibly renamed) name.
    if (!list.some((e) => e.id === DEMO_ACCOUNT_ID)) list.unshift({ id: DEMO_ACCOUNT_ID, name: readAccount(DEMO_ACCOUNT_ID).name });
  } else {
    // The demo account no longer exists: an entry saved by an earlier version is ignored (no login, no shortcut).
    list = list.filter((e) => e.id !== DEMO_ACCOUNT_ID);
  }
  const seen = new Set<string>();
  return list.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
}

function writeRegistry(list: AccountEntry[]): void {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
  } catch {
    // storage unavailable: ignore silently
  }
}

export function findAccountByName(name: string): AccountEntry | null {
  const n = normalizeName(name);
  if (!n) return null;
  return readRegistry().find((e) => normalizeName(e.name) === n) ?? null;
}

export function accountExists(id: string): boolean {
  return readRegistry().some((e) => e.id === id);
}

/** Keeps the registry name in sync when an account is renamed. */
export function renameInRegistry(id: string, name: string): void {
  const list = readRegistry();
  const e = list.find((x) => x.id === id);
  if (!e || e.name === name) return;
  e.name = name;
  writeRegistry(list);
}

/** Creates a new account (other accounts are kept) and returns its id. */
export function createAccount(name: string, shared: SharedProfile): string {
  const id = `acc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const account: Account = { name: name.trim().slice(0, 40), shared, portfolios: [], activeId: null, recent: [] };
  writeAccount(account, id);
  writeRegistry([...readRegistry(), { id, name: account.name }]);
  return id;
}

/** Adds a ready-made portfolio to a stored account (persona accounts); returns its id. */
export function addPortfolioToAccount(accountId: string, draft: PortfolioDraft): string {
  const account = readAccount(accountId);
  const id = `pf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  account.portfolios.push({
    ...draft,
    id,
    color: PORTFOLIO_COLORS[account.portfolios.length % PORTFOLIO_COLORS.length],
    positions: [],
    cash: draft.initialAmount,
  });
  account.activeId = id;
  account.recent = touchRecent(account.recent, id);
  writeAccount(account, accountId);
  return id;
}
