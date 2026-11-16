import { DEMO_ACCOUNT_ID } from './account';
import { accountExists } from './accounts';

/**
 * Demo "login" by account name (no password). The logged-in account id is kept for the browser
 * tab (sessionStorage), so a new arrival (new tab) shows the welcome page again.
 * The historical value "1" means the demo account.
 */
export const SESSION_KEY = 'buy-demo:session';

/** Id of the logged-in account, or null on the welcome page. */
export function readSession(): string | null {
  try {
    const v = sessionStorage.getItem(SESSION_KEY);
    if (v === null) return null;
    const id = v === '1' ? DEMO_ACCOUNT_ID : v;
    return accountExists(id) ? id : null;
  } catch {
    return null;
  }
}

export function writeSession(accountId: string): void {
  try {
    sessionStorage.setItem(SESSION_KEY, accountId);
  } catch {
    // storage unavailable: the user stays in for this page load only
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // storage unavailable: nothing stored
  }
}
