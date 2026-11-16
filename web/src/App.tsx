import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Ticker } from './types';
import { useHashRoute } from './hooks/useHashRoute';
import { usePersistentSet } from './hooks/usePersistentSet';
import { AccountProvider, useAccountState } from './hooks/useAccount';
import { DEMO_ACCOUNT_ID, isExcluded } from './lib/account';
import { FeedPage } from './pages/FeedPage';
import { BuyPage } from './pages/BuyPage';
import { SavedPage } from './pages/SavedPage';
import { ProfilePage } from './pages/ProfilePage';
import { PortfolioWizard } from './pages/PortfolioWizard';
import { TabBar } from './components/TabBar';
import { PortfolioSwitcher } from './components/PortfolioSwitcher';
import { favoritesKey, hiddenKey, ratingsKey, scopeOf } from './lib/portfolioScope';
import { RatingsProvider, useRatingsState } from './hooks/useRatings';
import { feedSessionKey } from './lib/feedSession';
import { bncdQuoteUrl, DIRECT_BNCD } from './lib/bncd';
import { formatUsd } from './lib/format';
import { clearSession, readSession, writeSession } from './lib/session';
import { addPortfolioToAccount, createAccount, findAccountByName, readRegistry } from './lib/accounts';
import { useCatalog } from './hooks/useCatalog';
import { useBackendReactions } from './hooks/useBackendReactions';
import { ProfileRefProvider } from './hooks/useProfileId';
import { AppBanner } from './components/AppBanner';
import { FeedSkeleton } from './components/Skeletons';
import { NoProfileState } from './components/NoProfileState';
import { api, apiEnabled } from './lib/api';
import { draftFromAnswers, sharedFromAnswers, STATIC_PERSONAS } from './lib/questionnaire';
import {
  onProfilesChanged,
  readAccountProfile,
  readPortfolioProfile,
  submitProfile,
  syncProfiles,
  writeAccountProfile,
  writePortfolioProfile,
} from './lib/apiProfile';
import type { Answers } from './lib/api';
import { WelcomePage } from './pages/WelcomePage';
import { SignupPage } from './pages/SignupPage';

const PURCHASE_TOAST_MS = 6000;

function AppInner() {
  const { route, navigate } = useHashRoute();
  // Logged-in account (null = welcome page). Several local accounts can exist on the device.
  const [sessionId, setSessionId] = useState<string | null>(readSession);
  const accountId = sessionId ?? DEMO_ACCOUNT_ID;
  const account = useAccountState(accountId);
  // Saved products, hidden products and feed position belong to the active portfolio.
  const scope = scopeOf(account.account.activeId, accountId);
  const favorites = usePersistentSet(favoritesKey(scope));
  const hidden = usePersistentSet(hiddenKey(scope));
  const ratings = useRatingsState(ratingsKey(scope));
  // Product to show first when the feed is opened from the saved page.
  const [startTicker, setStartTicker] = useState<Ticker | null>(null);
  const clearStart = useCallback(() => setStartTicker(null), []);
  // Portfolio to bring into view when returning to the profile.
  const [focusPortfolio, setFocusPortfolio] = useState<string | null>(null);

  // Investor-profile exclusions (ESG) remove products from the feed and the saved list.
  const shared = account.account.shared;
  // Backend profile of the active portfolio (else of the account) drives the feed.
  const profileId = (account.account.activeId ? readPortfolioProfile(account.account.activeId)?.profileId : null) ?? readAccountProfile(accountId)?.profileId ?? null;
  const persona = readAccountProfile(accountId)?.persona ?? null;
  // Account created offline: its answers are saved but it has no backend profile yet (the banner then says the server is unreachable).
  const expectProfile = sessionId !== null && !profileId && Boolean(readAccountProfile(accountId));
  useBackendReactions(sessionId ? profileId : null, scope, favorites.values, hidden.values, ratings.all);
  const catalog = useCatalog({ profileId: sessionId ? profileId : null, persona: sessionId ? persona : null }, sessionId !== null, expectProfile);
  // The feed loads its cards page by page; Saved, Profile (positions) and Buy look products up by
  // ticker, so they ask every remaining card once (a single quick request).
  const needsAll = route.name === 'saved' || route.name === 'profile' || route.name === 'buy';
  const { hasMore: catalogHasMore, loadAll: loadAllCards, status: catalogStatus } = catalog;
  useEffect(() => {
    if (needsAll && catalogHasMore && catalogStatus === 'ready') loadAllCards();
  }, [needsAll, catalogHasMore, catalogStatus, loadAllCards]);
  const [, setSyncTick] = useState(0);
  // Bumped to rebuild the feed from scratch (refresh, or new parameters of the active profile).
  const [feedGen, setFeedGen] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const { reload: reloadCatalog } = catalog;
  const restartFeed = useCallback(() => {
    try {
      sessionStorage.removeItem(feedSessionKey(scope)); // position and cards already seen: forgotten
    } catch {
      // storage unavailable: the remount alone starts a new feed
    }
    setStartTicker(null);
    setFeedGen((g) => g + 1);
    reloadCatalog();
  }, [scope, reloadCatalog]);
  // "Fil" tapped again, or scrolled up on the first card: the server recomputes this profile's feed
  // and cards (its Bedrock texts are kept), then the feed starts again from the top.
  const refreshFeed = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    if (profileId && apiEnabled()) await api.refreshProfile(profileId).catch(() => undefined);
    setRefreshing(false);
    restartFeed();
  }, [refreshing, profileId, restartFeed]);
  // New parameters accepted by the server (portfolio or account edited): their caches were cleared.
  useEffect(
    () =>
      onProfilesChanged((ids) => {
        setSyncTick((n) => n + 1);
        if (profileId && ids.includes(profileId)) restartFeed();
      }),
    [profileId, restartFeed],
  );
  const portfolioKeys = account.account.portfolios.map((p) => p.id).join(',');
  useEffect(() => {
    if (!sessionId) return;
    void syncProfiles(accountId, account.account.name, portfolioKeys ? portfolioKeys.split(',') : []).then((changed) => changed && setSyncTick((n) => n + 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, accountId, portfolioKeys]);
  const declared = (account.account.activeId ? readPortfolioProfile(account.account.activeId)?.profile : null) ?? readAccountProfile(accountId)?.profile ?? null;
  const declaredKey = JSON.stringify(declared);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const profileRef = useMemo(() => ({ profileId, persona, declared: profileId ? declared : null }), [profileId, persona, declaredKey]);
  const CATALOG = catalog.products;
  // Logged-in account with no backend profile at all: never show the fictional sketch cards.
  const noProfile =
    sessionId !== null && apiEnabled() && catalog.status === 'ready' && catalog.source === 'mock' && !profileId && !persona && !expectProfile;
  const noProfilePage = (
    <NoProfileState
      onQuestionnaire={() => navigate('/profile/new')}
      onPersona={() => logout()}
    />
  );
  const products = useMemo(() => CATALOG.filter((p) => !isExcluded(p, shared)), [CATALOG, shared]);

  // "Buy now" and the cart go straight to the product's BNCD quote page (new tab, no
  // intermediate screen). Called synchronously from the click, so the tab is not blocked.
  // Fictional companies have no BNCD page: they keep the simulated cart.
  //
  // Opening BNCD also adds the shares to the active portfolio (paid from its cash), marked
  // "unconfirmed" since the real purchase is not certain. The toast offers "Annuler".
  const buy = (ticker: Ticker, quantity: number) => {
    const product = CATALOG.find((p) => p.ticker === ticker);
    const url = product ? bncdQuoteUrl(product) : null;
    if (!product || !url) {
      navigate('/buy/' + encodeURIComponent(ticker));
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    const pf = account.active;
    if (!pf || quantity <= 0) return;
    const cost = Math.round(product.price * quantity * 100) / 100;
    if (cost > pf.cash) {
      showPurchase({
        text: `Encaisse insuffisante dans « ${pf.name} » (${formatUsd(pf.cash)} pour ${formatUsd(cost)}) : rien n’a été ajouté.`,
      });
      return;
    }
    const before = { id: pf.id, positions: pf.positions, cash: pf.cash };
    account.buy(pf.id, ticker, quantity, product.price, { unconfirmed: true });
    showPurchase({
      text: `${quantity} ${ticker} ajoutée${quantity > 1 ? 's' : ''} à « ${pf.name} »${DIRECT_BNCD ? ' (achat BNCD non confirmé)' : ''}`,
      undo: () => account.restoreHoldings(before.id, before.positions, before.cash),
    });
  };

  const [purchase, setPurchase] = useState<{ text: string; undo?: () => void } | null>(null);
  const purchaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showPurchase = (p: { text: string; undo?: () => void }) => {
    setPurchase(p);
    if (purchaseTimer.current) clearTimeout(purchaseTimer.current);
    purchaseTimer.current = setTimeout(() => setPurchase(null), PURCHASE_TOAST_MS);
  };
  useEffect(
    () => () => {
      if (purchaseTimer.current) clearTimeout(purchaseTimer.current);
    },
    [],
  );

  const backToProfile = (id: string | null) => {
    setFocusPortfolio(id);
    navigate('/profile');
  };

  // Arrival: welcome page until the user enters the app ("Se connecter", no credentials in
  // this demo). The choice lasts for the browser tab (sessionStorage).
  // Demo login by account name (no password). Returns false when no account has this name.
  const login = (name: string) => {
    const entry = findAccountByName(name);
    if (!entry) return false;
    writeSession(entry.id);
    setSessionId(entry.id);
    if (route.name === 'signup') navigate('/');
    return true;
  };
  const logout = () => {
    clearSession();
    setSessionId(null);
    navigate('/');
  };
  // One-click persona account (demo video): profile from the backend, one ready-made portfolio.
  const startPersona = async (personaId: string) => {
    const info = STATIC_PERSONAS.find((p) => p.id === personaId);
    if (!info) return;
    if (login(info.name)) return;
    const stored = await submitProfile({ persona: personaId });
    const answers: Answers = info.answers;
    const id = createAccount(info.name, sharedFromAnswers(answers));
    writeAccountProfile(id, { ...stored, answers });
    const pfAnswers = Object.fromEntries(Object.entries(answers).filter(([k]) => k.startsWith('P')));
    const pfId = addPortfolioToAccount(id, draftFromAnswers('Portefeuille ' + info.name, answers, stored.profile));
    writePortfolioProfile(pfId, { ...stored, answers: pfAnswers });
    writeSession(id);
    setSessionId(id);
    navigate('/');
  };
  if (route.name === 'signup') {
    return (
      <SignupPage
        isNameTaken={(name) => findAccountByName(name) !== null}
        onCancel={() => navigate(sessionId ? '/profile' : '/')}
        onCreate={async (name, answers) => {
          // The backend computes the account profile; a new local account is added (existing ones are kept).
          const stored = await submitProfile({ answers, name });
          const id = createAccount(name, sharedFromAnswers(answers));
          writeAccountProfile(id, stored);
          writeSession(id);
          setSessionId(id);
          navigate('/profile/first');
        }}
      />
    );
  }
  if (!sessionId) {
    return (
      <WelcomePage
        accountNames={readRegistry().map((e) => e.name)}
        onLogin={login}
        onSignup={() => navigate('/signup')}
        onPersona={startPersona}
      />
    );
  }

  let page;
  let tab: 'feed' | 'saved' | 'profile' | null = null;
  switch (route.name) {
    case 'buy':
      page = (
        <BuyPage
          ticker={route.ticker}
          onBack={() => navigate('/')}
          onCreatePortfolio={() => navigate('/profile/new')}
        />
      );
      break;
    case 'portfolio-new':
      // The very first portfolio of the account is titled "Premier portefeuille" wherever it
      // is created from (e.g. from Profil after "Créer plus tard").
      page = (
        <PortfolioWizard
          api={account}
          accountId={accountId}
          title={account.account.portfolios.length === 0 ? 'Premier portefeuille' : 'Nouveau portefeuille'}
          onDone={backToProfile}
        />
      );
      break;
    case 'portfolio-first':
      // Right after account creation: same questionnaire, can be skipped ("Créer plus tard").
      page = (
        <PortfolioWizard
          api={account}
          accountId={accountId}
          title="Premier portefeuille"
          onDone={backToProfile}
          // "Créer plus tard": Profil → Portefeuilles (empty state with "+ Créer un portefeuille").
          onSkip={() => navigate('/profile')}
        />
      );
      break;
    case 'portfolio-edit':
      page = <PortfolioWizard key={route.id} api={account} accountId={accountId} editId={route.id} onDone={backToProfile} />;
      break;
    case 'profile':
      tab = 'profile';
      page = (
        <ProfilePage
          api={account}
          catalog={CATALOG}
          focusId={focusPortfolio}
          onFocusConsumed={() => setFocusPortfolio(null)}
          onCreate={() => navigate('/profile/new')}
          onEdit={(id) => navigate('/profile/edit/' + id)}
          onLogout={logout}
        />
      );
      break;
    case 'saved':
      tab = 'saved';
      page = catalog.status === 'loading' ? (
        <FeedSkeleton />
      ) : noProfile ? (
        noProfilePage
      ) : (
        <SavedPage
          key={scope}
          header={<PortfolioSwitcher variant="inline" />}
          products={products}
          catalog={CATALOG}
          favorites={favorites}
          hidden={hidden}
          onOpen={(t) => {
            setStartTicker(t);
            navigate('/');
          }}
          onGoToFeed={() => navigate('/')}
        />
      );
      break;
    default:
      tab = 'feed';
      page = refreshing || catalog.status === 'loading' ? (
        <FeedSkeleton />
      ) : noProfile ? (
        noProfilePage
      ) : (
        <FeedPage
          showDisclaimer={false}
          key={`${scope}:${feedGen}`}
          onRefresh={() => void refreshFeed()}
          sessionKey={feedSessionKey(scope)}
          header={<PortfolioSwitcher variant="overlay" />}
          products={products}
          favorites={favorites}
          hidden={hidden}
          startTicker={startTicker}
          onStartConsumed={clearStart}
          onBuy={buy}
          onOpenSaved={() => navigate('/saved')}
          moreAvailable={catalog.hasMore}
          onNeedMore={catalog.loadMore}
        />
      );
  }

  return (
    <AccountProvider value={account}>
      <ProfileRefProvider value={profileRef}>
      <RatingsProvider value={ratings}>
        {tab ? (
          <div className="app-shell">
            <div className="app-view">{page}</div>
            <TabBar current={tab} onReselect={(t) => t === 'feed' && void refreshFeed()} />
          </div>
        ) : (
          page
        )}
        {/* Purchase feedback (no role: the feed keeps its own status region). */}
        <div className="purchase-live" aria-live="polite">
          {purchase && (
            <div className="toast toast--purchase">
              <span>{purchase.text}</span>
              {purchase.undo && (
                <button
                  type="button"
                  className="toast__action"
                  onClick={() => {
                    purchase.undo?.();
                    setPurchase(null);
                  }}
                >
                  Annuler
                </button>
              )}
            </div>
          )}
        </div>
      </RatingsProvider>
      </ProfileRefProvider>
    </AccountProvider>
  );
}

/** Phone frame (centred on desktop) with the permanent "simulation" banner above every page. */
export default function App() {
  return (
    <div className="frame">
      <AppBanner />
      <div className="frame__body">
        <AppInner />
      </div>
    </div>
  );
}
