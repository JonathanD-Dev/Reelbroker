import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Product } from '../types';
import type { AccountApi } from '../hooks/useAccount';
import { completedSections, portfoliosByRecent } from '../lib/account';
import { PortfolioCard } from '../components/PortfolioCard';
import { InvestorProfile } from '../components/InvestorProfile';
import { LogoutIcon } from '../components/Icons';

type ProfileTab = 'portfolios' | 'investor';

interface ProfilePageProps {
  api: AccountApi;
  catalog: readonly Product[];
  /** Portfolio to bring into view on mount (just created or edited). */
  focusId?: string | null;
  /** Called once `focusId` has been used, so later visits start on the active portfolio. */
  onFocusConsumed?: () => void;
  onCreate: () => void;
  onEdit: (id: string) => void;
  /** Ends the demo session and goes back to the welcome page (data is kept). */
  onLogout?: () => void;
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';

export function ProfilePage({
  api,
  catalog,
  focusId = null,
  onFocusConsumed,
  onCreate,
  onEdit,
  onLogout,
}: ProfilePageProps) {
  const { account } = api;
  const uid = useId();
  const [tab, setTab] = useState<ProfileTab>('portfolios');
  const [announcement, setAnnouncement] = useState('');
  const [current, setCurrent] = useState(0);
  const trackRef = useRef<HTMLUListElement>(null);
  const cardRefs = useRef<(HTMLLIElement | null)[]>([]);

  // Order frozen while the carousel is shown: active first, then most recently used. Making
  // another portfolio active does not move the cards; the new order applies when the
  // carousel is shown again (next visit, or back from the "Profil investisseur" tab).
  const [order, setOrder] = useState(() => portfoliosByRecent(account).map((p) => p.id));
  const selectTab = (next: ProfileTab) => {
    if (next === 'portfolios' && tab !== 'portfolios') {
      setOrder(portfoliosByRecent(account).map((p) => p.id));
      setCurrent(0); // the carousel is mounted again, scrolled to the first (active) card
    }
    setTab(next);
  };
  const portfolios = useMemo(() => {
    const byId = new Map(account.portfolios.map((p) => [p.id, p]));
    const known = order.flatMap((id) => {
      const p = byId.get(id);
      return p ? [p] : [];
    });
    return [...known, ...account.portfolios.filter((p) => !order.includes(p.id))];
  }, [account.portfolios, order]);
  const done = completedSections(account.shared);
  const count = portfolios.length;

  const scrollToCard = (i: number, smooth = true) => {
    const card = cardRefs.current[i];
    const track = trackRef.current;
    if (!card || !track) return;
    track.scrollTo?.({ left: card.offsetLeft - track.offsetLeft, behavior: smooth ? 'smooth' : 'auto' });
    setCurrent(i);
  };

  // Bring the created / edited portfolio into view.
  useEffect(() => {
    const i = focusId ? portfolios.findIndex((p) => p.id === focusId) : -1;
    if (i >= 0) scrollToCard(i, false);
    if (focusId) onFocusConsumed?.();
  }, []);

  const onScroll = () => {
    const track = trackRef.current;
    const first = cardRefs.current[0];
    if (!track || !first) return;
    const step = first.offsetWidth + 12;
    setCurrent(Math.min(Math.max(Math.round(track.scrollLeft / step), 0), count - 1));
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next: ProfileTab = tab === 'portfolios' ? 'investor' : 'portfolios';
    selectTab(next);
    document.getElementById(`${uid}-tab-${next}`)?.focus();
  };

  return (
    <main className="profile-page">
      <header className="profile-head">
        <span className="profile-head__avatar" aria-hidden="true">
          {initialsOf(account.name)}
        </span>
        <div className="profile-head__text">
          <h1 className="profile-head__name">{account.name}</h1>
          <p className="profile-head__meta">
            {count} portefeuille{count > 1 ? 's' : ''} · {done === 4 ? 'profil complet' : `profil à compléter (${done}/4)`}
          </p>
        </div>
        {/* Compact entry point so the page fits on one phone screen (the big button is kept when empty). */}
        {count > 0 && (
          <button type="button" className="profile-head__new" aria-label="Créer un portefeuille" onClick={onCreate}>
            + Nouveau
          </button>
        )}
        {onLogout && (
          <button type="button" className="profile-head__logout" aria-label="Se déconnecter" title="Se déconnecter" onClick={onLogout}>
            <LogoutIcon />
          </button>
        )}
      </header>

      <div className="segmented" role="tablist" aria-label="Sections du profil">
        {(
          [
            ['portfolios', 'Portefeuilles'],
            ['investor', 'Profil investisseur'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            id={`${uid}-tab-${key}`}
            type="button"
            role="tab"
            aria-selected={tab === key}
            aria-controls={`${uid}-panel-${key}`}
            tabIndex={tab === key ? 0 : -1}
            className={'segmented__tab' + (tab === key ? ' segmented__tab--on' : '')}
            onClick={() => selectTab(key)}
            onKeyDown={onTabKey}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'portfolios' ? (
        <section
          id={`${uid}-panel-portfolios`}
          className="profile-panel"
          role="tabpanel"
          aria-labelledby={`${uid}-tab-portfolios`}
        >
          {count > 0 ? (
            <>
              <ul className="pf-track" ref={trackRef} onScroll={onScroll} aria-label="Mes portefeuilles">
                {portfolios.map((p, i) => (
                  <PortfolioCard
                    key={p.id}
                    ref={(el) => {
                      cardRefs.current[i] = el;
                    }}
                    portfolio={p}
                    index={i}
                    total={count}
                    active={p.id === account.activeId}
                    onSetActive={() => {
                      api.setActive(p.id);
                      setAnnouncement(`${p.name} est maintenant le portefeuille actif`);
                    }}
                    onEdit={() => onEdit(p.id)}
                  />
                ))}
              </ul>
              {count > 1 && (
                <div className="pf-dots">
                  {portfolios.map((p, i) => (
                    <button
                      key={p.id}
                      type="button"
                      className={'pf-dots__dot' + (i === current ? ' pf-dots__dot--on' : '')}
                      aria-label={`Afficher ${p.name}`}
                      aria-current={i === current ? 'true' : undefined}
                      onClick={() => scrollToCard(i)}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="profile-empty">
              Aucun portefeuille pour l’instant. Créez-en un pour chaque projet : retraite, maison, voyage…
            </p>
          )}
          {count === 0 && (
            <button type="button" className="dashed-btn" onClick={onCreate}>
              + Créer un portefeuille
            </button>
          )}
        </section>
      ) : (
        <section id={`${uid}-panel-investor`} role="tabpanel" aria-labelledby={`${uid}-tab-investor`}>
          <InvestorProfile api={api} catalog={catalog} onSaved={setAnnouncement} />
        </section>
      )}

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </main>
  );
}
