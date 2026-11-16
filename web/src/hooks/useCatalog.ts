import { useCallback, useEffect, useRef, useState } from 'react';
import type { Product } from '../types';
import { apiEnabled, loadFeed, loadFeedPage } from '../lib/api';
import type { ProfileRef } from '../lib/api';
import { CATALOG } from '../data/products';
import { cardToProduct, setCatalog, setCatalogMeta } from '../lib/catalog';
import type { CatalogSource } from '../lib/catalog';

export interface CatalogState {
  status: 'loading' | 'ready';
  source: CatalogSource;
  /** Products received so far, in the backend ranking order, each ticker once. */
  products: Product[];
  /** True while the API still has cards this client has not received. */
  hasMore: boolean;
  /** Asks the next page (5 cards). Does nothing while a request is running or when everything was received. */
  loadMore: () => void;
  /** Asks every remaining card at once (Saved and Profile pages need all saved products). */
  loadAll: () => void;
  reload: () => void;
}

const RETRY_MS = 3000;
const MAX_RETRY_MS = 30000;

/**
 * Products of the feed: live API page by page (docs/api-contract.md, "Progressive feed"), else
 * /snapshot.json, else the built-in mock data (flagged "Données fictives" by the caller). With
 * VITE_USE_API=false the mock data is used at once, without network.
 */
export function useCatalog(ref: ProfileRef, loggedIn = false, expectProfile = false): CatalogState {
  const offlineMode = !apiEnabled();
  const [state, setState] = useState<{ status: 'loading' | 'ready'; source: CatalogSource; products: Product[]; hasMore: boolean }>(() => ({
    status: offlineMode ? 'ready' : 'loading',
    source: 'mock',
    products: offlineMode ? CATALOG : [],
    hasMore: false,
  }));
  const { profileId, persona } = ref;
  const [nonce, setNonce] = useState(0);
  // Loading state at once (same render as the caller's own updates): the previous cards never flash in between.
  const reload = useCallback(() => {
    setNonce((n) => n + 1);
    if (!offlineMode) setState((s) => ({ ...s, status: 'loading', hasMore: false }));
  }, [offlineMode]);

  // Latest values for the stable loaders; `gen` drops answers that belong to a previous profile.
  const live = useRef({ products: [] as Product[], hasMore: false, busy: false, wantAll: false, retries: 0, gen: 0, profileId: null as string | null });

  useEffect(() => {
    if (offlineMode) {
      setCatalogMeta({ loggedIn, failed: false });
      return;
    }
    let cancelled = false;
    const gen = ++live.current.gen;
    live.current = { products: [], hasMore: false, busy: false, wantAll: false, retries: 0, gen, profileId };
    setState((s) => ({ ...s, status: 'loading', hasMore: false }));
    setCatalogMeta({ loading: true });
    loadFeed({ profileId, persona }).then((r) => {
      if (cancelled) return;
      if (r) {
        const products = unique(r.items.map(cardToProduct));
        const hasMore = Boolean(r.more && profileId);
        live.current = { ...live.current, products, hasMore };
        setCatalog(products, r.source);
        setCatalogMeta({ failed: false, loggedIn });
        setState({ status: 'ready', source: r.source, products, hasMore });
      } else {
        setCatalog(CATALOG, 'mock');
        setCatalogMeta({ failed: Boolean(profileId || persona || expectProfile), loggedIn });
        setState({ status: 'ready', source: 'mock', products: CATALOG, hasMore: false });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [profileId, persona, offlineMode, nonce, loggedIn, expectProfile]);

  const fetchMore = useCallback((all: boolean) => {
    const cur = live.current;
    if (!cur.hasMore || !cur.profileId) return;
    if (cur.busy) {
      if (all) cur.wantAll = true; // asked again once the running page is in
      return;
    }
    cur.busy = true;
    const gen = cur.gen;
    loadFeedPage(cur.profileId, cur.products.map((p) => p.ticker), all).then(
      (r) => {
        if (live.current.gen !== gen) return;
        const known = new Set(live.current.products.map((p) => p.ticker));
        const fresh = r.items.map(cardToProduct).filter((p) => !known.has(p.ticker));
        const products = fresh.length ? [...live.current.products, ...fresh] : live.current.products;
        // A server that ignores `exclude` sends the same cards again: stop instead of asking forever.
        const hasMore = r.more && fresh.length > 0;
        live.current = { ...live.current, products, hasMore, busy: false, retries: 0 };
        if (fresh.length) setCatalog(products, 'api');
        setState((s) => ({ ...s, products, hasMore }));
        if (live.current.wantAll) {
          live.current.wantAll = false;
          fetchMore(true);
        }
      },
      () => {
        if (live.current.gen !== gen) return;
        live.current.busy = false;
        // Network hiccup: try again, more and more slowly (3 s, 6 s, 12 s, then every 30 s). The feed
        // never falls back to replaying the few cards it has while the server still has others.
        const n = ++live.current.retries;
        setTimeout(() => fetchMore(all), Math.min(RETRY_MS * 2 ** (n - 1), MAX_RETRY_MS));
      },
    );
  }, []);
  const loadMore = useCallback(() => fetchMore(false), [fetchMore]);
  const loadAll = useCallback(() => fetchMore(true), [fetchMore]);

  return { ...state, loadMore, loadAll, reload };
}

function unique(products: Product[]): Product[] {
  const seen = new Set<string>();
  return products.filter((p) => !seen.has(p.ticker) && (seen.add(p.ticker), true));
}
