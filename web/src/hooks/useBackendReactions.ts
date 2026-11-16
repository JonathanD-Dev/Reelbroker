import { useEffect, useRef } from 'react';
import { api, apiEnabled } from '../lib/api';

type Rating = 'up' | 'down';

/**
 * Mirrors the investor's gestures to the backend so its learned reordering works:
 * bookmark -> save/unsave, "Don't show me again" -> hide/unhide, Pour/Contre -> like/dislike (cleared -> neutral).
 * Fire and forget: the UI never waits for, nor fails because of, these calls. Nothing is sent on a scope
 * change (another portfolio) or on mount, only on real changes.
 */
export function useBackendReactions(
  profileId: string | null,
  scope: string,
  saved: readonly string[],
  hidden: readonly string[],
  ratings: Record<string, Rating>,
) {
  const prev = useRef<{ scope: string; saved: Set<string>; hidden: Set<string>; ratings: Record<string, Rating> } | null>(null);
  useEffect(() => {
    const now = { scope, saved: new Set(saved), hidden: new Set(hidden), ratings };
    const before = prev.current;
    prev.current = now;
    if (!before || before.scope !== scope || !profileId || !apiEnabled()) return;
    const send = (ticker: string, action: string) => void api.react(profileId, ticker, action).catch(() => undefined);
    for (const t of now.saved) if (!before.saved.has(t)) send(t, 'save');
    for (const t of before.saved) if (!now.saved.has(t)) send(t, 'unsave');
    for (const t of now.hidden) if (!before.hidden.has(t)) send(t, 'hide');
    for (const t of before.hidden) if (!now.hidden.has(t)) send(t, 'unhide');
    for (const t of new Set([...Object.keys(now.ratings), ...Object.keys(before.ratings)])) {
      if (now.ratings[t] === before.ratings[t]) continue;
      send(t, now.ratings[t] === 'up' ? 'like' : now.ratings[t] === 'down' ? 'dislike' : 'neutral');
    }
  }, [profileId, scope, saved, hidden, ratings]);
}
