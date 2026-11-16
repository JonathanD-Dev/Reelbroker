import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentProgress, CHECK_STEPS } from '../components/AgentProgress';
import { CardDetails } from '../components/CardDetails';
import { CardSummary } from '../components/CardSummary';
import { HypothesesButton } from '../components/Hypotheses';
import { IdeaCheck } from '../components/IdeaCheck';
import { ProfileRefProvider } from '../hooks/useProfileId';
import { SLOW_TIMEOUT_MS } from '../lib/api';
import { cardToProduct } from '../lib/catalog';
import { setDisplayCurrency } from '../lib/format';
import { card, detail } from './backendFixtures';

let original: typeof fetch;
let handler: (url: string) => unknown | Promise<unknown>;
beforeEach(() => {
  vi.stubEnv('VITE_USE_API', 'true');
  original = globalThis.fetch;
  globalThis.fetch = vi.fn(async (u: RequestInfo | URL) => new Response(JSON.stringify(await handler(String(u))), { status: 200 })) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = original;
  vi.unstubAllEnvs();
  setDisplayCurrency('USD');
});
const withProfile = (ui: React.ReactNode) => <ProfileRefProvider value={{ profileId: 'robert' }}>{ui}</ProfileRefProvider>;

const CHECK = (mode: 'bedrock' | 'offline') => ({
  ok: true,
  ticker: 'TSLA',
  name: 'Tesla',
  weight: 0.2,
  verdict: 'conflict',
  verdict_label: 'En conflit avec le profil déclaré',
  checks: [{ code: 'concentration', status: 'conflict', message: '20 % dépasse le plafond.' }],
  max_weight_within_profile: 0.05,
  explanation: { mode, short: 'Conflit.', long: 'Explication.', governance: { passed: true, issues: [] } },
});

describe('agent progress', () => {
  it('names the four agents in order and advances on a timer', () => {
    vi.useFakeTimers();
    render(<AgentProgress steps={CHECK_STEPS} label="Vérification en cours" stepMs={1000} />);
    const items = () => screen.getAllByRole('listitem');
    expect(items().map((li) => li.textContent?.slice(1))).toEqual([
      'Interprétation de la demande',
      'Calculs (outils)',
      'Rédaction par Claude sur Amazon Bedrock',
      'Contrôle de gouvernance',
    ]);
    expect(items()[0]).toHaveAttribute('aria-current', 'step');
    act(() => vi.advanceTimersByTime(2000));
    expect(items()[2]).toHaveAttribute('aria-current', 'step');
    expect(items()[0].textContent).toContain('✓');
    act(() => vi.advanceTimersByTime(20000));
    expect(items()[3]).toHaveAttribute('aria-current', 'step'); // stays on the last step
  });

  it('is shown while /api/check is pending, then replaced by the result', async () => {
    const user = userEvent.setup();
    let release: (v: unknown) => void = () => {};
    handler = () => new Promise((r) => (release = r));
    render(withProfile(<IdeaCheck />));
    await user.type(screen.getByLabelText('Votre idée, avec vos mots'), 'je veux mettre 20 % dans Tesla');
    await user.click(screen.getByRole('button', { name: 'Vérifier cette idée' }));
    expect(await screen.findByTestId('agent-progress')).toHaveTextContent('Rédaction par Claude sur Amazon Bedrock');
    release(CHECK('bedrock'));
    expect(await screen.findByTestId('idea-result')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-progress')).toBeNull();
  });

  it('the slow endpoints have a 60 s client timeout, and a failure offers a retry', async () => {
    expect(SLOW_TIMEOUT_MS).toBe(60000);
    const user = userEvent.setup();
    handler = () => {
      throw new TypeError('timeout');
    };
    render(withProfile(<IdeaCheck />));
    await user.type(screen.getByLabelText('Votre idée, avec vos mots'), 'x 20 % tesla');
    await user.click(screen.getByRole('button', { name: 'Vérifier cette idée' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('plus de 60 secondes');
    handler = () => CHECK('offline');
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByTestId('idea-result')).toBeInTheDocument();
  });
});

describe('Amazon Bedrock badge and agent work', () => {
  it('shows "Amazon Bedrock" for a Bedrock explanation and the fallback label otherwise', async () => {
    const user = userEvent.setup();
    handler = () => CHECK('bedrock');
    const view = render(withProfile(<IdeaCheck />));
    await user.type(screen.getByLabelText('Votre idée, avec vos mots'), 'x 20 % tesla');
    await user.click(screen.getByRole('button', { name: 'Vérifier cette idée' }));
    expect(await screen.findByTestId('mode-badge')).toHaveTextContent('Amazon Bedrock');
    view.unmount();
    handler = () => CHECK('offline');
    render(withProfile(<IdeaCheck />));
    await user.type(screen.getByLabelText('Votre idée, avec vos mots'), 'x 20 % tesla');
    await user.click(screen.getByRole('button', { name: 'Vérifier cette idée' }));
    expect(await screen.findByTestId('mode-badge')).toHaveTextContent('Texte de secours (hors ligne)');
  });

  it('the pipeline panel shows the Bedrock badge, the attempts and the Source Finder ranking', async () => {
    const user = userEvent.setup();
    const d = detail('AAA', 1);
    d.pipeline.explanation = {
      mode: 'bedrock',
      short: 'Court.',
      governance: { passed: true, issues: [], numbers_checked: 21, attempts: 2, attempts_log: [{ attempt: 1, passed: false, issues: ['nombre absent de la trace'] }, { attempt: 2, passed: true, issues: [] }] },
    };
    d.pipeline.trace = [{ agent: 'source_finder', step: 'find_sources', outputs: { mode: 'bedrock', ranking: [{ id: 'starter', why: 'Source primaire des prix.' }] } }];
    handler = () => d;
    render(
      withProfile(<CardDetails product={cardToProduct(card('AAA'))} quantity={10} onQuantityChange={() => {}} />),
    );
    const panel = await screen.findByTestId('pipeline-panel');
    await user.click(within(panel).getByText('Comment ces chiffres ont été obtenus'));
    expect(within(panel).getAllByTestId('mode-badge').map((b) => b.textContent)).toEqual(['Amazon Bedrock', 'Amazon Bedrock']);
    expect(within(panel).getByTestId('attempts')).toHaveTextContent('Tentative 1 : refusée (nombre absent de la trace)');
    expect(within(panel).getByTestId('attempts')).toHaveTextContent('Tentative 2 : validée');
    expect(within(panel).getByTestId('source-ranking')).toHaveTextContent('Rôle : Source primaire des prix.');
    expect(within(panel).getAllByText(/Données de départ du datathon/)).toHaveLength(1);
  });
});

describe('Toutes nos hypothèses', () => {
  it('opens a sheet with the risk table, caps, method and limits', async () => {
    const user = userEvent.setup();
    render(<HypothesesButton />);
    await user.click(screen.getByRole('button', { name: 'Toutes nos hypothèses' }));
    const sheet = screen.getByTestId('hypotheses');
    const rows = within(sheet).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('1 (très faible)'),
      expect.stringContaining('2 (faible)'),
      expect.stringContaining('3 (modéré)'),
      expect.stringContaining('4 (élevé)'),
      expect.stringContaining('5 (très élevé)'),
    ]);
    expect(within(rows[3]).getAllByRole('cell').map((c) => c.textContent?.replace(/\s/g, ' '))).toEqual(['14 %', '85 %']);
    for (const t of [/5 % au plus dans un même cryptoactif/, /bande de volatilité de 85 % à 100 %/, /plancher combiné de 15 %/, /3,19 %/, /2 000 trajectoires/, /médiane des 5 dernières décisions/, /CNQ\.TO/, /Biais du survivant/, /Aucune donnée ESG/]) {
      expect(within(sheet).getByText(t)).toBeInTheDocument();
    }
  });
});

describe('compliance lines', () => {
  it('a live card shows its source line; a mock card shows fictitious figures and no legacy median line', async () => {
    render(<CardSummary product={cardToProduct(card('AAA'))} />);
    expect(screen.getByTestId('card-source')).toHaveTextContent('Source : alphaforge_starter (Yahoo Finance adj_close, BoC FX) · au 12 nov. 2026 · CAD');
    const { products } = await import('../data/products').then((m) => ({ products: m.CATALOG }));
    render(withProfile(<CardDetails product={products[0]} quantity={10} onQuantityChange={() => {}} />));
    expect(screen.queryByText(/Valeur médiane à 12 mois/)).toBeNull();
    expect(screen.getByTestId('projection-summary')).toHaveTextContent('(fictif)');
  });

  it('the central curve is labelled hypothetical in the legend', async () => {
    handler = () => detail('AAA', 1);
    render(withProfile(<CardDetails product={cardToProduct(card('AAA'))} quantity={10} onQuantityChange={() => {}} />));
    await waitFor(() => expect(screen.getByTestId('scenario-central')).toHaveTextContent('Scénario central (hypothétique)'));
  });
});

describe('Toutes nos hypothèses from GET /api/hypotheses', () => {
  const ITEMS = [
    { group: 'Niveaux de risque', label: 'Niveau 1 (très faible) : plafond de volatilité', value: 0.04, value_fr: '4 %', source: 'hypothèse', code_ref: 'alphaforge/profile.py:RISK_BUDGET' },
    { group: 'Niveaux de risque', label: "Niveau 1 (très faible) : plafond d'actifs de croissance", value: 0.2, value_fr: '20 %', source: 'hypothèse', code_ref: 'alphaforge/profile.py:RISK_BUDGET' },
    { group: 'Plafonds', label: 'Plafond par cryptoactif', value: 0.05, value_fr: '5 %', source: 'règle', code_ref: 'alphaforge/data.py:SINGLE_CAPS' },
  ];

  it('groups by group, shows value_fr, a source tag and code_ref, and builds the risk table', async () => {
    const user = userEvent.setup();
    handler = () => ITEMS;
    render(<HypothesesButton />);
    await user.click(screen.getByRole('button', { name: 'Toutes nos hypothèses' }));
    const sheet = screen.getByTestId('hypotheses');
    await waitFor(() => expect(within(sheet).getAllByRole('row')).toHaveLength(2)); // header + the single API level
    expect(within(sheet).getAllByRole('cell').map((c) => c.textContent)).toEqual(['4 %', '20 %']);
    const item = within(sheet).getByText(/Plafond par cryptoactif/);
    expect(item).toHaveTextContent('5 %');
    expect(item).toHaveTextContent('règle');
    expect(item).toHaveTextContent('alphaforge/data.py:SINGLE_CAPS');
    expect(within(sheet).getByRole('heading', { name: 'Plafonds' })).toBeInTheDocument();
  });
});
