import { FEED_SESSION_KEY, feedSessionKey } from './feedSession';

/**
 * Each portfolio has its own saved products, its own "Don't show me again" list and its own
 * feed position. Storage keys are suffixed with the portfolio id ("scope").
 */
export const FAVORITES_KEY = 'buy-demo:favorites';
export const HIDDEN_KEY = 'buy-demo:hidden';

/** Scope used when the account has no portfolio. */
export const NO_PORTFOLIO_SCOPE = 'default';

/**
 * Scope of the lists. Portfolio ids are unique across accounts; without portfolio, each account
 * has its own scope (the demo account keeps the historical "default").
 */
export const scopeOf = (portfolioId: string | null, accountId = 'demo'): string =>
  portfolioId ?? (accountId === 'demo' ? NO_PORTFOLIO_SCOPE : `${NO_PORTFOLIO_SCOPE}-${accountId}`);
export const favoritesKey = (scope: string) => `${FAVORITES_KEY}:${scope}`;
export const hiddenKey = (scope: string) => `${HIDDEN_KEY}:${scope}`;
export const RATINGS_KEY = 'buy-demo:ratings';
export const ratingsKey = (scope: string) => `${RATINGS_KEY}:${scope}`;

function move(storage: Storage, from: string, to: string): void {
  const legacy = storage.getItem(from);
  if (legacy === null) return;
  if (storage.getItem(to) === null) storage.setItem(to, legacy);
  storage.removeItem(from);
}

/**
 * One-time migration from the single, unscoped lists of earlier versions: they now belong to
 * the active portfolio. Idempotent (does nothing once the legacy keys are gone).
 */
export function migrateLegacyLists(scope: string): void {
  try {
    move(localStorage, FAVORITES_KEY, favoritesKey(scope));
    move(localStorage, HIDDEN_KEY, hiddenKey(scope));
    move(sessionStorage, FEED_SESSION_KEY, feedSessionKey(scope));
  } catch {
    // storage unavailable: nothing to migrate
  }
}

/** Removes the lists of a deleted portfolio. */
export function clearScope(scope: string): void {
  try {
    localStorage.removeItem(favoritesKey(scope));
    localStorage.removeItem(hiddenKey(scope));
    localStorage.removeItem(ratingsKey(scope));
    sessionStorage.removeItem(feedSessionKey(scope));
  } catch {
    // storage unavailable: ignore
  }
}
