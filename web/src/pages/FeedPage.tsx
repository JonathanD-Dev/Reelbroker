import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { FeedItem, Product, Ticker } from '../types';
import type { PersistentSet } from '../hooks/usePersistentSet';
import {
  useInfiniteFeed,
  createFeed,
  createFeedStartingWith,
  restoreFeed,
} from '../hooks/useInfiniteFeed';
import { useActiveReel, useSentinel } from '../hooks/useActiveReel';
import { useFeedKeyboard } from '../hooks/useFeedKeyboard';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { computeScrollTopAfterPrune, countUnshown, isHeavy, sanitizeItems } from '../lib/feed';
import { FEED_PAGE } from '../lib/api';
import { writeFeedSession } from '../lib/feedSession';
import { readFlag, writeFlag } from '../lib/storage';
import { Reel } from '../components/Reel';
import { EmptyState } from '../components/EmptyState';
import { SwipeHint } from '../components/SwipeHint';

const EXIT_MS = 220;
const SAVED_TOAST_MS = 3000;
const HINT_KEY = 'buy-demo:hint-seen';

interface FeedPageProps {
  products: Product[];
  favorites: PersistentSet;
  hidden: PersistentSet;
  /** `quantity` = the card's "If I buy" value. */
  onBuy: (t: Ticker, quantity: number) => void;
  /** Product to show first (opened from the saved page). Overrides the session snapshot. */
  startTicker?: Ticker | null;
  onStartConsumed?: () => void;
  onOpenSaved?: () => void;
  /** sessionStorage key of the feed position (one per portfolio). */
  sessionKey?: string;
  /** Optional element rendered above the feed (active portfolio selector). */
  header?: ReactNode;
  /** Small "données fictives" line over the feed (the app banner replaces it inside the app). */
  showDisclaimer?: boolean;
  /** The server still has cards not in `products`: `onNeedMore` asks the next page. */
  moreAvailable?: boolean;
  onNeedMore?: () => void;
  /** Infinite feed: once every product was shown, start again from the top of the ranking. */
  infinite?: boolean;
  /** Called when the user scrolls up while already on the first card (wheel or pull down). */
  onRefresh?: () => void;
}

/** Wheel events closer than this belong to the same gesture (a momentum scroll that reached the top is not a refresh). */
const WHEEL_GESTURE_GAP_MS = 300;
/** Downward finger travel that triggers a refresh, on the first card. */
const PULL_PX = 70;

interface PendingPrune {
  oldIndex: number;
  removedAbove: number;
  hiddenName: string;
}

export function FeedPage({
  products,
  favorites,
  hidden,
  onBuy,
  startTicker = null,
  onStartConsumed,
  onOpenSaved,
  sessionKey,
  header,
  showDisclaimer = true,
  moreAvailable = false,
  onNeedMore,
  infinite = true,
  onRefresh,
}: FeedPageProps) {
  const reduced = useReducedMotion();
  const visible = useMemo(
    () => products.filter((p) => !hidden.has(p.ticker)),
    [products, hidden],
  );

  // Initial feed: starts on a chosen product (saved page), or is restored from the session
  // snapshot (return from the buy page), or is brand new.
  const [initial] = useState(() => {
    const first = startTicker ? visible.find((p) => p.ticker === startTicker) : undefined;
    if (first) {
      const state = createFeedStartingWith(visible, first);
      return { restored: false, state, activeKey: state.items[0].key };
    }
    const restored = restoreFeed(products, hidden.has, sessionKey);
    return {
      restored: restored !== null,
      state: restored ? restored.state : createFeed(visible),
      activeKey: restored ? restored.activeKey : null,
    };
  });
  const [{ items, nextPage, nextSeq, roundStart = 0 }, dispatch] = useInfiniteFeed(initial.state);
  // A new round starts only once the server has nothing more to send.
  const cycle = infinite && !moreAvailable;

  const feedRef = useRef<HTMLDivElement | null>(null);
  const [feedEl, setFeedEl] = useState<HTMLDivElement | null>(null);
  const [sentinelEl, setSentinelEl] = useState<HTMLDivElement | null>(null);
  const setFeed = useCallback((el: HTMLDivElement | null) => {
    feedRef.current = el;
    setFeedEl(el);
  }, []);

  const { activeKey, setActiveKey, registerReel } = useActiveReel(
    feedEl,
    initial.activeKey ?? initial.state.items[0]?.key ?? null,
  );
  const foundIndex = items.findIndex((i) => i.key === activeKey);
  const activeIndex = Math.max(foundIndex, 0);
  const currentKey = items[activeIndex]?.key ?? null;

  // Latest values for stable callbacks (keeps the memoized reels from re-rendering).
  const latest = useRef({ items, visible, favorites, hidden, onBuy, reduced, cycle });
  useLayoutEffect(() => {
    latest.current = { items, visible, favorites, hidden, onBuy, reduced, cycle };
  });

  const [announcement, setAnnouncement] = useState('');
  const [leavingKey, setLeavingKey] = useState<string | null>(null);
  const [emptyFocus, setEmptyFocus] = useState(false);
  const [hintSeen, setHintSeen] = useState(() => readFlag(HINT_KEY));
  const busyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPrune = useRef<PendingPrune | null>(null);
  const pendingReset = useRef(false);

  // The feed follows the backend ranking; it is infinite (rounds) unless `infinite` is false.
  const unshown = useMemo(() => countUnshown(visible, items, roundStart), [visible, items, roundStart]);
  const hasMore = unshown > 0 || moreAvailable || (cycle && visible.length > 1);
  const shownCount = useMemo(() => new Set(items.map((i) => i.product.ticker)).size, [items]);
  const backToFirst = () => {
    feedRef.current?.scrollTo({ top: 0, behavior: reduced ? 'instant' : 'smooth' });
    feedRef.current?.querySelector<HTMLElement>('article.reel')?.focus({ preventScroll: true });
    if (items[0]) setActiveKey(items[0].key);
  };

  // --- Infinite loading ---------------------------------------------------------------------
  // The observer is recreated when cards are added or received: a sentinel already in view (user at
  // the end, waiting for the next page) then fires again and the new cards are appended.
  useSentinel(feedEl, sentinelEl, items.length * 1000 + visible.length, () =>
    dispatch({ type: 'append', visible: latest.current.visible, cycle: latest.current.cycle }),
  );

  // Prefetch: always at least FEED_PAGE cards received ahead of the card on screen.
  // `products.length` re-runs it after each page, even when the page brought nothing visible.
  const loadedAhead = items.length - 1 - activeIndex + unshown;
  useEffect(() => {
    if (moreAvailable && loadedAhead < FEED_PAGE) onNeedMore?.();
  }, [moreAvailable, loadedAhead, products.length, onNeedMore]);

  // --- Session snapshot (restores the position after the buy page) -----------------------------
  useEffect(() => {
    writeFeedSession(
      { keys: items.map((i) => i.key), activeKey: currentKey, nextPage, nextSeq, ...(roundStart ? { roundStart } : {}) },
      sessionKey,
    );
  }, [items, currentKey, nextPage, nextSeq, roundStart, sessionKey]);

  // Restore the scroll position before the first paint.
  useLayoutEffect(() => {
    if (!initial.restored || !feedRef.current) return;
    const articles = feedRef.current.querySelectorAll<HTMLElement>('article.reel');
    articles[activeIndex]?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, []);

  // --- Hint ----------------------------------------------------------------------------------
  const markHintSeen = useCallback(() => {
    writeFlag(HINT_KEY);
    setHintSeen(true);
  }, []);
  useEffect(() => {
    if (activeIndex > 0 && !hintSeen) markHintSeen();
  }, [activeIndex, hintSeen, markHintSeen]);
  const showHint = !hintSeen && activeIndex === 0 && items.length > 0;

  // --- Navigation ----------------------------------------------------------------------------
  const goTo = useCallback(
    (index: number) => {
      const { items: current, reduced: reduce } = latest.current;
      const i = Math.min(Math.max(index, 0), current.length - 1);
      const el = feedRef.current?.querySelectorAll<HTMLElement>('article.reel')[i];
      if (!el) return;
      el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
      el.focus({ preventScroll: true });
      setActiveKey(current[i].key);
    },
    [setActiveKey],
  );
  const activeIndexRef = useRef(activeIndex);
  useLayoutEffect(() => {
    activeIndexRef.current = activeIndex;
  });
  useFeedKeyboard({
    onNext: () => {
      if (activeIndexRef.current >= latest.current.items.length - 1) return;
      markHintSeen();
      goTo(activeIndexRef.current + 1);
    },
    onPrev: () => {
      if (activeIndexRef.current <= 0) return;
      markHintSeen();
      goTo(activeIndexRef.current - 1);
    },
    isBusy: () => busyRef.current,
  });

  // --- Refresh: scrolling up while already on the first card ---------------------------------
  const onRefreshRef = useRef(onRefresh);
  useLayoutEffect(() => {
    onRefreshRef.current = onRefresh;
  });
  const canRefresh = Boolean(onRefresh);
  useEffect(() => {
    const el = feedEl;
    if (!el || !canRefresh) return;
    const atTop = () => el.scrollTop <= 0 && activeIndexRef.current === 0;
    let lastWheel = -Infinity;
    let gestureAtTop = false;
    let fired = false;
    const fire = () => {
      fired = true;
      onRefreshRef.current?.();
    };
    // A gesture counts only if it started on the first card: scrolling back up from the second card does not refresh.
    const onWheel = (e: WheelEvent) => {
      const now = e.timeStamp || performance.now();
      if (now - lastWheel > WHEEL_GESTURE_GAP_MS) {
        gestureAtTop = atTop();
        fired = false;
      }
      lastWheel = now;
      if (gestureAtTop && !fired && e.deltaY < 0) fire();
    };
    let startY: number | null = null;
    const onTouchStart = (e: TouchEvent) => {
      startY = atTop() && e.touches.length === 1 ? e.touches[0].clientY : null;
      fired = false;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (startY === null || fired) return;
      if (e.touches[0].clientY - startY > PULL_PX) fire();
    };
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
    };
  }, [feedEl, canRefresh]);

  // The start product has been used to build the feed: later mounts use the session again.
  useEffect(() => {
    if (startTicker) onStartConsumed?.();
  }, []);

  // --- "Ajouté aux sauvegardés · Voir" toast ---------------------------------------------------
  const [savedToast, setSavedToast] = useState(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showSavedToast = useCallback(() => {
    setSavedToast((n) => n + 1);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setSavedToast(0), SAVED_TOAST_MS);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  // --- Favorites, purchase -------------------------------------------------------------------
  const handleToggleFavorite = useCallback(
    (ticker: Ticker) => {
      const fav = latest.current.favorites;
      if (!fav.has(ticker)) showSavedToast();
      fav.toggle(ticker);
    },
    [showSavedToast],
  );
  const handleFavoriteOnly = useCallback(
    (ticker: Ticker) => {
      const { favorites: fav, items: current } = latest.current;
      const name = current.find((i) => i.product.ticker === ticker)?.product.name ?? ticker;
      setAnnouncement(
        fav.has(ticker) ? `${name} est déjà dans les favoris` : `${name} ajouté aux favoris`,
      );
      if (!fav.has(ticker)) showSavedToast();
      fav.add(ticker);
    },
    [showSavedToast],
  );
  const handleBuy = useCallback(
    (ticker: Ticker, quantity: number) => latest.current.onBuy(ticker, quantity),
    [],
  );

  // --- "Don't show me again" -----------------------------------------------------------------
  const handleHide = useCallback(
    (item: FeedItem) => {
      if (busyRef.current) return;
      busyRef.current = true;
      const { items: before, visible: vis, hidden: hid, reduced: reduce, cycle: cyc } = latest.current;
      const ticker = item.product.ticker;
      const oldIndex = before.findIndex((i) => i.key === item.key);
      const isGone = (t: Ticker) => t === ticker || hid.has(t);

      hid.add(ticker);
      setLeavingKey(item.key);
      dispatch({
        type: 'ensureAhead',
        fromKey: item.key,
        visible: vis.filter((p) => p.ticker !== ticker),
        cycle: cyc,
      });

      const finish = () => {
        timerRef.current = null;
        const keptKeys = new Set(sanitizeItems(before, isGone).map((i) => i.key));
        const removedAbove = before.filter(
          (it, idx) => idx < oldIndex && !keptKeys.has(it.key),
        ).length;
        pendingPrune.current = { oldIndex, removedAbove, hiddenName: item.product.name };
        dispatch({ type: 'prune', isHidden: isGone });
        setLeavingKey(null);
        busyRef.current = false;
      };
      if (reduce) finish();
      else timerRef.current = setTimeout(finish, EXIT_MS);
    },
    [dispatch],
  );

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  // After the list changes: compensate the scroll, move focus, announce.
  useLayoutEffect(() => {
    const feed = feedRef.current;
    const prune = pendingPrune.current;
    if (prune) {
      pendingPrune.current = null;
      if (items.length === 0) {
        setEmptyFocus(true);
        setAnnouncement(`${prune.hiddenName} masqué. Tous les produits sont masqués.`);
        return;
      }
      const newIndex = Math.min(prune.oldIndex - prune.removedAbove, items.length - 1);
      if (feed) {
        const wanted = computeScrollTopAfterPrune(
          prune.oldIndex,
          prune.removedAbove,
          feed.clientHeight,
        );
        const max = Math.max(feed.scrollHeight - feed.clientHeight, 0);
        feed.scrollTo({ top: Math.min(wanted, max), behavior: 'instant' });
        feed.querySelectorAll<HTMLElement>('article.reel')[newIndex]?.focus({
          preventScroll: true,
        });
      }
      setActiveKey(items[newIndex].key);
      setAnnouncement(`${prune.hiddenName} masqué. Affichage de ${items[newIndex].product.name}.`);
    } else if (pendingReset.current && feed && items.length > 0) {
      pendingReset.current = false;
      feed.scrollTo({ top: 0, behavior: 'instant' });
      feed.querySelector<HTMLElement>('article.reel')?.focus({ preventScroll: true });
      setActiveKey(items[0].key);
    }
  }, [items, setActiveKey]);

  const handleReset = () => {
    hidden.clear();
    pendingReset.current = true;
    setEmptyFocus(false);
    setAnnouncement('Produits réaffichés');
    dispatch({ type: 'reset', visible: products });
  };

  return (
    <main className="app-main">
      <h1 className="sr-only">Fil d'analyse</h1>
      {showDisclaimer && <p className="disclaimer">Données fictives, à but de démonstration</p>}
      {header}
      {items.length > 0 ? (
        <div className="feed" role="feed" aria-label="Fil d'analyse" ref={setFeed}>
          {items.map((item, index) => (
            <Reel
              key={item.key}
              item={item}
              index={index}
              heavy={isHeavy(index, activeIndex)}
              active={item.key === currentKey}
              leaving={item.key === leavingKey}
              isFavorite={favorites.has(item.product.ticker)}
              registerReel={registerReel}
              onActivate={setActiveKey}
              onToggleFavorite={handleToggleFavorite}
              onFavoriteOnly={handleFavoriteOnly}
              onBuy={handleBuy}
              onHide={handleHide}
            />
          ))}
          {hasMore ? (
            <div className="feed__sentinel" aria-hidden="true" ref={setSentinelEl} />
          ) : (
            <section className="feed-end" aria-label="Fin du fil">
              <h2>Vous avez vu les {shownCount} titres analysés pour ce profil</h2>
              <p>
                Ils étaient classés selon leur adéquation à votre profil, puis selon vos « Pour » et « Contre »,
                puis selon leur risque pour votre profil et la diversification. Les titres masqués ou exclus par votre profil n’y sont pas.
              </p>
              <button type="button" className="primary-btn" onClick={backToFirst}>
                Revenir au premier titre
              </button>
            </section>
          )}
        </div>
      ) : (
        <EmptyState onReset={handleReset} focusOnMount={emptyFocus} />
      )}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
      {showHint && <SwipeHint />}
      {savedToast > 0 && onOpenSaved && (
        <div className="toast toast--top">
          <span>Ajouté aux sauvegardés</span>
          <button type="button" className="toast__action" onClick={onOpenSaved}>
            Voir
          </button>
        </div>
      )}
    </main>
  );
}
