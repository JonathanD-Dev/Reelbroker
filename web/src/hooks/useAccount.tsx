import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Ticker } from '../types';
import {
  DEMO_ACCOUNT_ID,
  PORTFOLIO_COLORS,
  cashAfterInitialChange,
  normalizeRecent,
  readAccount,
  touchRecent,
  writeAccount,
} from '../lib/account';
import type { Account, Portfolio, PortfolioDraft, Position, SharedProfile } from '../lib/account';
import { clearScope, migrateLegacyLists, scopeOf } from '../lib/portfolioScope';
import { renameInRegistry } from '../lib/accounts';

export interface AccountApi {
  /** Id of the account (absent in some test doubles). */
  id?: string;
  account: Account;
  active: Portfolio | null;
  rename: (name: string) => void;
  updateShared: <K extends keyof SharedProfile>(key: K, value: SharedProfile[K]) => void;
  createPortfolio: (draft: PortfolioDraft) => string;
  updatePortfolio: (id: string, draft: PortfolioDraft) => void;
  deletePortfolio: (id: string) => void;
  setActive: (id: string) => void;
  /**
   * Adds a purchase paid from the portfolio's cash; merges with an existing position (weighted
   * average price). `unconfirmed`: added when opening BNCD, the real purchase is not certain.
   */
  buy: (portfolioId: string, ticker: Ticker, quantity: number, price: number, opts?: { unconfirmed?: boolean }) => void;
  /** Puts back the positions and cash saved before a purchase ("Annuler"). */
  restoreHoldings: (portfolioId: string, positions: Position[], cash: number) => void;
}

const AccountContext = createContext<AccountApi | null>(null);

let idSeq = 0;
const newId = () => `pf-${Date.now().toString(36)}-${(idSeq++).toString(36)}`;

interface Loaded {
  id: string;
  account: Account;
}

function load(id: string): Loaded {
  const account = readAccount(id);
  // Lists saved before portfolios existed belong to the demo account's active portfolio.
  if (id === DEMO_ACCOUNT_ID) migrateLegacyLists(scopeOf(account.activeId, id));
  return { id, account };
}

/**
 * State of the logged-in account (`accountId`). Switching account reloads it from storage
 * without writing anything; changes are saved under that account only.
 */
export function useAccountState(accountId: string = DEMO_ACCOUNT_ID): AccountApi {
  const [loaded, setLoaded] = useState<Loaded>(() => load(accountId));
  const lastWritten = useRef(loaded.account);

  let current = loaded;
  if (loaded.id !== accountId) {
    // Render-phase reset on account change (React re-renders immediately with the new state).
    current = load(accountId);
    lastWritten.current = current.account;
    setLoaded(current);
  }
  const { account } = current;

  const setAccount = useCallback((fn: (a: Account) => Account) => {
    setLoaded((prev) => ({ id: prev.id, account: fn(prev.account) }));
  }, []);

  // Persist after each change, never on mount or on an account switch.
  useEffect(() => {
    if (lastWritten.current === loaded.account) return;
    lastWritten.current = loaded.account;
    writeAccount(loaded.account, loaded.id);
    renameInRegistry(loaded.id, loaded.account.name);
  }, [loaded]);

  const rename = useCallback((name: string) => {
    const clean = name.trim().slice(0, 40);
    if (clean) setAccount((a) => ({ ...a, name: clean }));
  }, []);

  const updateShared = useCallback(
    <K extends keyof SharedProfile>(key: K, value: SharedProfile[K]) =>
      setAccount((a) => ({ ...a, shared: { ...a.shared, [key]: value } })),
    [],
  );

  const createPortfolio = useCallback((draft: PortfolioDraft) => {
    const id = newId();
    // A new portfolio becomes the active one; its cash starts at the initial amount.
    setAccount((a) => ({
      ...a,
      portfolios: [
        ...a.portfolios,
        {
          ...draft,
          id,
          color: PORTFOLIO_COLORS[a.portfolios.length % PORTFOLIO_COLORS.length],
          positions: [],
          cash: draft.initialAmount,
        },
      ],
      activeId: id,
      recent: touchRecent(a.recent, id),
    }));
    return id;
  }, []);

  const updatePortfolio = useCallback((id: string, draft: PortfolioDraft) => {
    setAccount((a) => ({
      ...a,
      portfolios: a.portfolios.map((p) =>
        p.id === id
          ? { ...p, ...draft, cash: cashAfterInitialChange(p.cash, p.initialAmount, draft.initialAmount) }
          : p,
      ),
    }));
  }, []);

  const deletePortfolio = useCallback((id: string) => {
    clearScope(id);
    setAccount((a) => {
      const portfolios = a.portfolios.filter((p) => p.id !== id);
      const recent = a.recent.filter((r) => r !== id);
      // Deleting the active portfolio activates the most recently used remaining one.
      const activeId = a.activeId === id ? recent[0] ?? portfolios[0]?.id ?? null : a.activeId;
      return { ...a, portfolios, activeId, recent: normalizeRecent(recent, portfolios, activeId) };
    });
  }, []);

  const setActive = useCallback((id: string) => {
    setAccount((a) =>
      !a.portfolios.some((p) => p.id === id) || (a.activeId === id && a.recent[0] === id)
        ? a
        : { ...a, activeId: id, recent: touchRecent(a.recent, id) },
    );
  }, []);

  const buy = useCallback((
    portfolioId: string,
    ticker: Ticker,
    quantity: number,
    price: number,
    opts?: { unconfirmed?: boolean },
  ) => {
    if (quantity <= 0) return;
    const unconfirmed = opts?.unconfirmed === true;
    setAccount((a) => ({
      ...a,
      portfolios: a.portfolios.map((p) => {
        if (p.id !== portfolioId) return p;
        // A simulated purchase is paid from the portfolio's cash (refused if insufficient).
        const cost = Math.round(price * quantity * 100) / 100;
        if (cost > p.cash) return p;
        const existing = p.positions.find((pos) => pos.ticker === ticker);
        const positions = existing
          ? p.positions.map((pos) =>
              pos.ticker === ticker
                ? {
                    ticker,
                    quantity: pos.quantity + quantity,
                    price:
                      Math.round(
                        ((pos.price * pos.quantity + price * quantity) / (pos.quantity + quantity)) * 100,
                      ) / 100,
                    // Any unconfirmed part makes the whole position unconfirmed.
                    ...(pos.unconfirmed || unconfirmed ? { unconfirmed: true } : {}),
                  }
                : pos,
            )
          : [...p.positions, { ticker, quantity, price, ...(unconfirmed ? { unconfirmed: true } : {}) }];
        return { ...p, positions, cash: Math.round((p.cash - cost) * 100) / 100 };
      }),
    }));
  }, []);

  const restoreHoldings = useCallback((portfolioId: string, positions: Position[], cash: number) => {
    setAccount((a) => ({
      ...a,
      portfolios: a.portfolios.map((p) => (p.id === portfolioId ? { ...p, positions, cash } : p)),
    }));
  }, []);

  const active = account.portfolios.find((p) => p.id === account.activeId) ?? null;

  const id = current.id;
  return useMemo(
    () => ({
      id,
      account,
      active,
      rename,
      updateShared,
      createPortfolio,
      updatePortfolio,
      deletePortfolio,
      setActive,
      buy,
      restoreHoldings,
    }),
    [id, account, active, rename, updateShared, createPortfolio, updatePortfolio, deletePortfolio, setActive, buy, restoreHoldings],
  );
}

export function AccountProvider({ value, children }: { value: AccountApi; children: ReactNode }) {
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

/** Account API, or `null` outside the provider (components rendered alone in tests). */
export function useAccount(): AccountApi | null {
  return useContext(AccountContext);
}
