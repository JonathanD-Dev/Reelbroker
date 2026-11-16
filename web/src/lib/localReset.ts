/**
 * One-time reset of the data this app keeps in the browser (accounts, portfolios, saved lists, feed
 * position, session). Bump DATA_VERSION when the server profiles are reset: accounts stored by an
 * earlier version point to profiles that no longer exist, so every browser starts again from an
 * empty welcome page (no account shortcut), with only the three personas of the case.
 */
export const DATA_VERSION = '2026-11-16-personas';
const VERSION_KEY = 'buy-demo:data-version';
const PREFIX = 'buy-demo:';

function clearPrefixed(storage: Storage): void {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k !== null && k.startsWith(PREFIX)) keys.push(k);
  }
  keys.forEach((k) => storage.removeItem(k));
}

/** Clears the app's local data once per DATA_VERSION. Returns true when something was reset. */
export function resetLocalDataIfOutdated(local: Storage = localStorage, session: Storage = sessionStorage): boolean {
  try {
    if (local.getItem(VERSION_KEY) === DATA_VERSION) return false;
    clearPrefixed(local);
    clearPrefixed(session);
    local.setItem(VERSION_KEY, DATA_VERSION);
    return true;
  } catch {
    return false; // storage unavailable: nothing to reset
  }
}
