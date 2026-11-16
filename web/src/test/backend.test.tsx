import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { CardDetails } from '../components/CardDetails';
import { QuestionFlow } from '../components/QuestionFlow';
import { WelcomePage } from '../pages/WelcomePage';
import { ProfileRefProvider } from '../hooks/useProfileId';
import { cardToProduct } from '../lib/catalog';
import { bncdQuoteUrl } from '../lib/bncd';
import { loadCard, loadFeed, scaleOutlook } from '../lib/api';
import { submitProfile } from '../lib/apiProfile';
import { SESSION_KEY } from '../lib/session';
import { setDisplayCurrency, formatUsd } from '../lib/format';
import { card, detail, installBackend } from './backendFixtures';

// These tests opt in to the API (vite.config sets VITE_USE_API=false for the others) and mock fetch.
let restore: () => void = () => {};
beforeEach(() => vi.stubEnv('VITE_USE_API', 'true'));
afterEach(() => {
  restore();
  vi.unstubAllEnvs();
  setDisplayCurrency('USD');
});
const backend = (opts?: Parameters<typeof installBackend>[0]) => {
  const b = installBackend(opts);
  restore = b.restore;
  return b.fetch;
};
const snapshot = (tickers: string[]) => ({
  personas: {
    amira: {
      profile: { profile_id: 'old-id' },
      feed: tickers.map((t) => card(t)),
      details: { [tickers[0]]: detail(tickers[0], 10) },
    },
  },
});

describe('api client: live API, then /snapshot.json, then nothing', () => {
  it('uses the live API when it answers', async () => {
    backend();
    const r = await loadFeed({ profileId: 'p1' });
    expect(r?.source).toBe('api');
    expect(r?.items.map((c) => c.ticker)).toEqual(['AAA', 'BBB', 'CCC']);
  });

  it('falls back to the snapshot when the API is down (feed and card details)', async () => {
    backend({ down: true, snapshot: snapshot(['SNAP1', 'SNAP2']) });
    const feed = await loadFeed({ profileId: null, persona: 'amira' });
    expect(feed?.source).toBe('snapshot');
    expect(feed?.items.map((c) => c.ticker)).toEqual(['SNAP1', 'SNAP2']);
    const d = await loadCard('SNAP1', { profileId: null, persona: 'amira' });
    expect(d?.source).toBe('snapshot');
    expect(await loadCard('SNAP2', { profileId: null, persona: 'amira' })).toBeNull(); // not in the 8 exported details
  });

  it('returns null when both the API and the snapshot are missing (caller shows the mock data)', async () => {
    backend({ down: true });
    expect(await loadFeed({ profileId: null })).toBeNull();
  });

  it('does not ask the API for a feed without a profile (the backend requires profile_id)', async () => {
    const f = backend();
    expect(await loadFeed({ profileId: null })).toBeNull();
    expect(f.mock.calls.some(([u]) => String(u).startsWith('/api/feed'))).toBe(false);
  });

  it('never calls the network when VITE_USE_API=false', async () => {
    vi.stubEnv('VITE_USE_API', 'false');
    const f = backend();
    expect(await loadFeed({ profileId: null })).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('scenario paths are linear in the quantity', () => {
    const o = detail('AAA', 10).outlook;
    const doubled = scaleOutlook(o, 20);
    expect(doubled.scenarios.central.final).toBeCloseTo(o.scenarios.central.final * 2, 6);
    expect(doubled.scenarios.worst.path[60].value).toBeCloseTo(o.scenarios.worst.path[60].value * 2, 6);
    expect(doubled.start_value).toBe(2000);
  });

  it('submitProfile posts the answers or the persona, and never throws when the server is down', async () => {
    const f = backend();
    const stored = await submitProfile({ persona: 'robert' });
    expect(stored).toMatchObject({ profileId: 'pid-1', persona: 'robert' });
    const [url, init] = f.mock.calls.find(([u]) => String(u).startsWith('/api/profile'))!;
    expect(String(url)).toBe('/api/profile');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ persona: 'robert' });
    restore();
    backend({ down: true });
    expect(await submitProfile({ answers: { C1: 'permanent' }, name: 'Zoé' })).toMatchObject({ profileId: null, answers: { C1: 'permanent' } });
  });
});

describe('CardDetails with backend data', () => {
  const renderDetails = (quantity: number) => {
    const product = cardToProduct(card('AAA'));
    const ui = (q: number) => (
      <ProfileRefProvider value={{ profileId: 'p1', persona: 'amira' }}>
        <CardDetails product={product} quantity={q} onQuantityChange={() => {}} />
      </ProfileRefProvider>
    );
    const view = render(ui(quantity));
    return { ...view, again: (q: number) => view.rerender(ui(q)) };
  };

  it('shows the stats line, the three scenarios, the share below start, the method and the permanent disclaimer', async () => {
    backend();
    setDisplayCurrency('CAD');
    renderDetails(10);
    // stats line: annual return, volatility, worst drop, period, source, date
    expect(screen.getByText('Rendement annuel')).toBeInTheDocument();
    expect(screen.getByText('+8,4 %')).toBeInTheDocument();
    expect(screen.getByText('Volatilité')).toBeInTheDocument();
    expect(screen.getByText('Pire baisse')).toBeInTheDocument();
    expect(screen.getByText(/alphaforge_starter \(Yahoo Finance adj_close, BoC FX\)/)).toBeInTheDocument();
    // skeleton while the API answers
    expect(screen.getByTestId('agent-progress')).toBeInTheDocument();
    // three scenarios
    const best = await screen.findByTestId('scenario-best');
    expect(best).toHaveTextContent('Scénario favorable');
    expect(screen.getByTestId('scenario-central')).toHaveTextContent('Scénario central (hypothétique)');
    expect(screen.getByTestId('scenario-worst')).toHaveTextContent('Scénario défavorable');
    expect(document.querySelectorAll('polyline[data-scenario]')).toHaveLength(3);
    expect(screen.queryByText(/prédiction/i)).toBeNull();
    // share below start, method, assumptions, limits, sensitivity
    expect(screen.getByTestId('outlook-summary')).toHaveTextContent('Environ 31 % des scénarios simulés finissent sous cette valeur');
    expect(screen.getByText('Méthode, hypothèses et limites')).toBeInTheDocument();
    expect(screen.getByTestId('sensitivity')).toHaveTextContent('3,0 % à 8,9 %');
    // permanent disclaimer from the API
    expect(screen.getByTestId('outlook-disclaimer')).toHaveTextContent('Scénarios hypothétiques, pas une prévision ni un conseil financier.');
  });

  it('the quantity scales the scenario values (paths are linear in quantity)', async () => {
    backend();
    setDisplayCurrency('CAD');
    const { again } = renderDetails(10);
    const central = async () => (await screen.findByTestId('scenario-central')).textContent;
    expect(await central()).toContain(formatUsd(1500)); // 100 $ x 10 x 1.5
    expect(screen.getByTestId('scenario-best').textContent).toContain(formatUsd(3000));
    again(20);
    await waitFor(() => expect(screen.getByTestId('scenario-central').textContent).toContain(formatUsd(3000)));
    expect(screen.getByTestId('scenario-worst').textContent).toContain(formatUsd(1000));
    expect(screen.getByTestId('outlook-summary').textContent).toContain(formatUsd(2000)); // start value 100 x 20
  });

  it('the collapsible "Comment ces chiffres ont été obtenus" shows the four agents', async () => {
    const user = userEvent.setup();
    backend();
    renderDetails(10);
    const panel = await screen.findByTestId('pipeline-panel');
    expect(panel).not.toHaveAttribute('open');
    await user.click(within(panel).getByText('Comment ces chiffres ont été obtenus'));
    expect(panel).toHaveAttribute('open');
    expect(within(panel).getByRole('link', { name: 'Données de départ du datathon' })).toHaveAttribute('href', 'https://finance.yahoo.com');
    expect(within(panel).getByText(/1 282 observations/)).toBeInTheDocument();
    // fact-checker: one passed, one failed
    expect(within(panel).getByText('Réussi :', { exact: false })).toBeInTheDocument();
    expect(within(panel).getByText('Échoué :', { exact: false })).toBeInTheDocument();
    expect(within(panel).getByText('à revoir')).toBeInTheDocument();
    // explanation: mode + governance badge
    expect(within(panel).getByText('Texte de secours (hors ligne)')).toBeInTheDocument();
    expect(within(panel).getByText('Gouvernance : conforme')).toBeInTheDocument();
  });

  it('shows an error state with a retry button when neither the API nor a snapshot answers', async () => {
    const user = userEvent.setup();
    backend({ down: true });
    renderDetails(10);
    expect(await screen.findByRole('alert')).toHaveTextContent('Les scénarios de ce titre ne sont pas disponibles');
    restore();
    backend();
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByTestId('scenario-best')).toBeInTheDocument();
  });

  it('uses the local snapshot copy and says so', async () => {
    backend({ down: true, snapshot: snapshot(['AAA']) });
    renderDetails(10);
    expect(await screen.findByTestId('scenario-best')).toBeInTheDocument();
    expect(screen.getByText('Copie locale des données (le serveur ne répond pas).')).toBeInTheDocument();
  });
});

describe('questionnaire screens on the API', () => {
  it('renders the question given by the API, then posts the answers (onFinish) when the API says done', async () => {
    const user = userEvent.setup();
    const f = backend();
    const onFinish = vi.fn();
    render(<QuestionFlow scope="account" title="Créer un compte" onExit={() => {}} onFinish={onFinish} />);
    expect(screen.getByRole('status', { name: 'Chargement de la question' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: /Question venue du serveur/ })).toBeInTheDocument();
    expect(screen.queryByText(/Mode hors ligne/)).toBeNull();
    const call = String(f.mock.calls.find(([u]) => String(u).startsWith('/api/questionnaire/next'))![0]);
    expect(call).toContain('scope=account');
    await user.click(screen.getByLabelText('Emploi permanent'));
    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    await waitFor(() => expect(onFinish).toHaveBeenCalledWith({ C1: 'permanent' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
    // the second request carried the answer
    const last = decodeURIComponent(String(f.mock.calls.filter(([u]) => String(u).includes('questionnaire'))[1][0]));
    expect(last).toContain('{"C1":"permanent"}');
  });

  it('falls back to the static copy of the questions when the API is down', async () => {
    backend({ down: true });
    render(<QuestionFlow scope="portfolio" title="Premier portefeuille" onExit={() => {}} onFinish={() => {}} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'À quoi cet argent doit-il servir en priorité ?' })).toBeInTheDocument();
    expect(screen.getByText(/Mode hors ligne/)).toBeInTheDocument();
  });
});

describe('persona accounts (one click)', () => {
  it('the welcome page offers Amira, Mateo and Robert', async () => {
    const user = userEvent.setup();
    const onPersona = vi.fn().mockResolvedValue(undefined);
    render(<WelcomePage accountNames={[]} onLogin={() => true} onSignup={() => {}} onPersona={onPersona} />);
    const group = screen.getByRole('region', { name: 'Essayer avec un profil type' });
    expect(within(group).getAllByRole('button').map((b) => b.querySelector('strong')?.textContent)).toEqual(['Amira', 'Mateo', 'Robert']);
    await user.click(within(group).getByRole('button', { name: /Robert/ }));
    expect(onPersona).toHaveBeenCalledWith('robert');
  });

  it('Robert: POST /api/profile {persona}, the account is created with a portfolio, and the feed shows the fit verdict', async () => {
    const user = userEvent.setup();
    const f = backend();
    sessionStorage.removeItem(SESSION_KEY);
    render(<App />);
    // permanent banner on the welcome page
    expect(screen.getByText('Simulation — pas un conseil financier')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Robert/ }));
    const post = f.mock.calls.find(([u, i]) => String(u) === '/api/profile' && (i as RequestInit)?.method === 'POST')!;
    expect(JSON.parse(String((post[1] as RequestInit).body))).toEqual({ persona: 'robert' });
    // loading skeleton, then the feed with the verdict of the profile
    expect(await screen.findByRole('feed')).toBeInTheDocument();
    expect(screen.getAllByTestId('fit-badge')[0]).toHaveTextContent('Compatible avec le profil déclaré');
    const id = sessionStorage.getItem(SESSION_KEY)!;
    const account = JSON.parse(localStorage.getItem('buy-demo:account:' + id)!);
    expect(account.name).toBe('Robert');
    expect(account.portfolios).toHaveLength(1);
    expect(account.portfolios[0]).toMatchObject({ goal: 'safety', risk: 'prudent' }); // level 2 of the mocked profile
    expect(JSON.parse(localStorage.getItem('buy-demo:apiprofile:' + id)!)).toMatchObject({ profileId: 'pid-1', persona: 'robert' });
    // the feed was requested for this profile
    await waitFor(() => expect(f.mock.calls.some(([u]) => String(u).includes('/api/feed') && String(u).includes('profile_id=pid-1'))).toBe(true));
    // no "Données fictives" banner: the data is real
    expect(screen.queryByText(/Données fictives/)).toBeNull();
  });
});

describe('data banners and Buy now switch', () => {
  it('shows "Données fictives" only when the built-in mock data is used', async () => {
    localStorage.setItem('buy-demo:apiprofile:demo', JSON.stringify({ profileId: 'x', answers: {} }));
    backend({ down: true });
    render(<App />);
    expect(await screen.findByText(/Données fictives : le serveur d’analyse n’est pas joignable/)).toBeInTheDocument();
    expect(screen.getByText('Simulation — pas un conseil financier')).toBeInTheDocument();
  });

  it('shows the snapshot banner when the data comes from the local copy', async () => {
    localStorage.setItem('buy-demo:apiprofile:demo', JSON.stringify({ profileId: null, persona: 'amira', answers: {} }));
    backend({ down: true, snapshot: snapshot(['SNAP1', 'SNAP2']) });
    render(<App />);
    expect(await screen.findByText(/Copie locale des données/)).toBeInTheDocument();
    expect(screen.getByRole('feed')).toBeInTheDocument();
  });

  it('DIRECT_BNCD: quote page when true; null (simulated cart) when false; crypto never has a BNCD page', () => {
    const tsx = cardToProduct({ ...card('XIU.TO') });
    expect(bncdQuoteUrl(tsx, true)).toBe('https://client.bnc.ca/cdbn/markets/quote/STOCK/XIU/CAN/overview/chart');
    expect(bncdQuoteUrl(tsx, false)).toBeNull();
    expect(bncdQuoteUrl(tsx)).toBeNull(); // DIRECT_BNCD = false by default
    expect(bncdQuoteUrl(cardToProduct({ ...card('BTC-USD'), asset_class: 'crypto' }), true)).toBeNull();
  });
});
