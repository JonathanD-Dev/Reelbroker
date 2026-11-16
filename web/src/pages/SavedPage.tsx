import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import type { Product, Ticker } from '../types';
import type { PersistentSet } from '../hooks/usePersistentSet';
import { filterAndSort, savedProducts } from '../lib/saved';
import type { SavedSort } from '../lib/saved';
import { SavedRow } from '../components/SavedRow';
import { BlockedRow } from '../components/BlockedRow';
import { SearchIcon } from '../components/Icons';

const UNDO_MS = 5000;

const SORTS: { value: SavedSort; label: string }[] = [
  { value: 'recent', label: 'Récents' },
  { value: 'change', label: 'Variation' },
  { value: 'name', label: 'Nom' },
];

type SavedTab = 'saved' | 'blocked';

interface SavedPageProps {
  /** Products of the feed (after the investor-profile exclusions). */
  products: readonly Product[];
  /** Every known product: blocked ones are listed even if an exclusion hides them. */
  catalog?: readonly Product[];
  favorites: PersistentSet;
  hidden: PersistentSet;
  onOpen: (t: Ticker) => void;
  onGoToFeed: () => void;
  /** Rendered under the title (active portfolio selector). */
  header?: ReactNode;
}

interface Undo {
  list: SavedTab;
  previous: readonly string[];
  text: string;
}

const countLabel = (n: number, blocked: boolean) => {
  const s = n > 1 ? 's' : '';
  return blocked ? `${n} produit${s} bloqué${s}` : `${n} produit${s}`;
};

export function SavedPage({ products, catalog = products, favorites, hidden, onOpen, onGoToFeed, header }: SavedPageProps) {
  const uid = useId();
  const searchId = useId();
  const [tab, setTab] = useState<SavedTab>('saved');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SavedSort>('recent');
  const [undo, setUndo] = useState<Undo | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saved = useMemo(
    () => savedProducts(products, favorites.values, hidden.has),
    [products, favorites.values, hidden.has],
  );
  // "Don't show me again" products of the active portfolio, most recently blocked first.
  const blocked = useMemo(() => savedProducts(catalog, hidden.values, () => false), [catalog, hidden.values]);
  const all = tab === 'saved' ? saved : blocked;
  const shown = useMemo(() => filterAndSort(all, query, sort), [all, query, sort]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const offerUndo = (u: Undo, message: string) => {
    setUndo(u);
    setAnnouncement(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setUndo(null), UNDO_MS);
  };

  const remove = (product: Product) => {
    const previous = favorites.values;
    favorites.toggle(product.ticker);
    offerUndo({ list: 'saved', previous, text: `${product.name} retiré` }, `${product.name} retiré des sauvegardés`);
  };

  const unblock = (product: Product) => {
    const previous = hidden.values;
    hidden.toggle(product.ticker);
    offerUndo(
      { list: 'blocked', previous, text: `${product.name} débloqué` },
      `${product.name} débloqué : il réapparaîtra dans le fil`,
    );
  };

  const cancel = () => {
    if (!undo) return;
    (undo.list === 'saved' ? favorites : hidden).replace(undo.previous);
    setAnnouncement(undo.list === 'saved' ? `${undo.text.replace(/ retiré$/, '')} remis dans les sauvegardés` : `${undo.text.replace(/ débloqué$/, '')} bloqué de nouveau`);
    setUndo(null);
    if (timer.current) clearTimeout(timer.current);
  };

  const selectTab = (next: SavedTab) => {
    setTab(next);
    setQuery('');
  };
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next: SavedTab = tab === 'saved' ? 'blocked' : 'saved';
    selectTab(next);
    document.getElementById(`${uid}-tab-${next}`)?.focus();
  };

  const count = all.length;

  return (
    <main className="saved-page">
      <header className="saved-page__header">
        <h1 className="saved-page__title">Sauvegardés</h1>
        <p className="saved-page__count">{countLabel(count, tab === 'blocked')}</p>
        {header}
      </header>

      <div className="segmented" role="tablist" aria-label="Listes">
        {(
          [
            ['saved', `Sauvegardés (${saved.length})`],
            ['blocked', `Bloqués (${blocked.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            id={`${uid}-tab-${key}`}
            type="button"
            role="tab"
            aria-selected={tab === key}
            aria-controls={`${uid}-panel`}
            tabIndex={tab === key ? 0 : -1}
            className={'segmented__tab' + (tab === key ? ' segmented__tab--on' : '')}
            onClick={() => selectTab(key)}
            onKeyDown={onTabKey}
          >
            {label}
          </button>
        ))}
      </div>

      <section id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-tab-${tab}`}>
        {count > 0 ? (
          <>
            <div className="saved-search">
              <label htmlFor={searchId} className="sr-only">
                Rechercher un produit
              </label>
              <SearchIcon />
              <input
                id={searchId}
                type="search"
                placeholder="Rechercher un produit"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
              />
            </div>

            <div className="saved-sorts" role="group" aria-label="Trier par">
              {SORTS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className={'chip' + (sort === s.value ? ' chip--active' : '')}
                  aria-pressed={sort === s.value}
                  onClick={() => setSort(s.value)}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {shown.length > 0 ? (
              tab === 'saved' ? (
                <>
                  <ul className="saved-list" aria-label="Produits sauvegardés">
                    {shown.map((p) => (
                      <SavedRow key={p.ticker} product={p} onOpen={() => onOpen(p.ticker)} onRemove={() => remove(p)} />
                    ))}
                  </ul>
                  <p className="saved-page__hint">Toucher : voir le titre sur BNCD · Glisser à gauche : retirer</p>
                </>
              ) : (
                <>
                  <ul className="saved-list" aria-label="Produits bloqués">
                    {shown.map((p) => (
                      <BlockedRow key={p.ticker} product={p} onUnblock={() => unblock(p)} />
                    ))}
                  </ul>
                  <p className="saved-page__hint">Titres masqués avec « Don't show me again ». Débloquer : il réapparaît dans le fil.</p>
                </>
              )
            ) : (
              <p className="saved-page__empty-search">Aucun résultat pour « {query.trim()} »</p>
            )}
          </>
        ) : tab === 'saved' ? (
          <div className="saved-empty">
            <h2>Aucun produit sauvegardé</h2>
            <p>Touchez le signet d'un produit dans le fil pour le retrouver ici.</p>
            <button type="button" className="primary-btn saved-empty__cta" onClick={onGoToFeed}>
              Découvrir le fil
            </button>
          </div>
        ) : (
          <div className="saved-empty">
            <h2>Aucun titre bloqué</h2>
            <p>Les titres masqués avec « Don't show me again » (menu ⋮ du fil) apparaissent ici.</p>
          </div>
        )}
      </section>

      {undo && (
        <div className="toast">
          <span>{undo.text}</span>
          <button type="button" className="toast__action" onClick={cancel}>
            Annuler
          </button>
        </div>
      )}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </main>
  );
}
