import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActionRail } from '../components/ActionRail';
import { IdeaCheck } from '../components/IdeaCheck';
import { LearnBlock } from '../components/LearnBlock';
import { BuyPage } from '../pages/BuyPage';
import { ProfileRefProvider } from '../hooks/useProfileId';
import { cardToProduct, setCatalog } from '../lib/catalog';
import { setDisplayCurrency } from '../lib/format';
import { card } from './backendFixtures';

const CHECK = {
  ok: true,
  ticker: 'TSLA',
  name: 'Tesla',
  weight: 0.2,
  verdict: 'conflict',
  verdict_label: 'En conflit avec le profil déclaré',
  checks: [
    { code: 'exclusion', status: 'ok', message: 'Aucune de vos exclusions ne vise ce titre.' },
    { code: 'concentration', status: 'conflict', message: '20 % dépasse le plafond de 5 % par titre.' },
    { code: 'objective', status: 'warn', message: 'Titre très volatil pour votre objectif.' },
  ],
  max_weight_within_profile: 0.05,
  explanation: { mode: 'offline', short: 'Conflit.', long: 'Explication de la vérification issue du code.', governance: { passed: true, issues: [] } },
};
const LEARN = (over: object = {}) => ({
  declared: 2,
  retained_level: 2,
  revealed: { established: false, level: null, n: 1, needed: 3 },
  status: 'insufficient',
  messages: ['1 décision(s) enregistrée(s) sur les 3 nécessaires.'],
  update_to: null,
  retained_if_updated: null,
  ...over,
});

let original: typeof fetch;
let handler: (url: string, init?: RequestInit) => unknown;
const calls = () => (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit?][];
beforeEach(() => {
  vi.stubEnv('VITE_USE_API', 'true');
  original = globalThis.fetch;
  globalThis.fetch = vi.fn(async (u: RequestInfo | URL, i?: RequestInit) => new Response(JSON.stringify(handler(String(u), i)), { status: 200 })) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = original;
  vi.unstubAllEnvs();
  setDisplayCurrency('USD');
});
const withProfile = (ui: React.ReactNode) => <ProfileRefProvider value={{ profileId: 'robert' }}>{ui}</ProfileRefProvider>;
const body = (i: number) => JSON.parse(String(calls()[i][1]!.body));

describe('Vérifier une idée', () => {
  it('free text (Robert, 20 % Tesla): conflict badge, every check with its icon, max compatible share, explanation, governance', async () => {
    const user = userEvent.setup();
    handler = () => CHECK;
    render(withProfile(<IdeaCheck />));
    await user.type(screen.getByLabelText('Votre idée, avec vos mots'), 'je veux mettre 20 % dans Tesla');
    await user.click(screen.getByRole('button', { name: 'Vérifier cette idée' }));
    expect(body(0)).toEqual({ profile_id: 'robert', text: 'je veux mettre 20 % dans Tesla' });
    const res = await screen.findByTestId('idea-result');
    expect(within(res).getByTestId('fit-badge')).toHaveTextContent('En conflit avec le profil déclaré');
    expect(within(res).getByTestId('fit-badge')).toHaveClass('fit-badge--conflict');
    const items = within(res).getAllByRole('listitem');
    expect(items.map((li) => li.textContent?.[0])).toEqual(['✓', '✗', '⚠']);
    expect(items[1]).toHaveTextContent('20 % dépasse le plafond de 5 % par titre.');
    expect(within(res).getByTestId('idea-max')).toHaveTextContent('La plus grande part compatible avec votre profil : 5 %');
    expect(within(res).getByText('Explication de la vérification issue du code.')).toBeInTheDocument();
    expect(within(res).getByText('Gouvernance : conforme')).toBeInTheDocument();
  });

  it('the three choices post the decision (choice) and are then recorded', async () => {
    const user = userEvent.setup();
    handler = () => CHECK;
    render(withProfile(<IdeaCheck />));
    await user.type(screen.getByLabelText('Votre idée, avec vos mots'), 'je veux mettre 20 % dans Tesla');
    await user.click(screen.getByRole('button', { name: 'Vérifier cette idée' }));
    const group = await screen.findByRole('group', { name: 'Que décidez-vous ?' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Je garde l’idée telle quelle', 'Je la ramène dans les limites', 'J’abandonne']);
    await user.click(within(group).getByRole('button', { name: 'Je la ramène dans les limites' }));
    await waitFor(() => expect(body(1)).toMatchObject({ choice: 'adjust', record_only: true, ticker: 'TSLA', weight: 0.2, max_weight_within_profile: 0.05 }));
    expect(typeof body(1).decision_id).toBe('string');
    expect(await screen.findByText(/Choix enregistré dans votre journal/)).toBeInTheDocument();
  });

  it('an unparseable sentence shows the API message', async () => {
    const user = userEvent.setup();
    handler = () => ({ ok: false, message: 'Précisez un titre et une part, par exemple « 10 % dans Apple ».' });
    render(withProfile(<IdeaCheck />));
    await user.type(screen.getByLabelText('Votre idée, avec vos mots'), 'bof');
    await user.click(screen.getByRole('button', { name: 'Vérifier cette idée' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Précisez un titre et une part');
  });

  it('from the menu of a card: prefilled ticker and 5 %, posted as ticker + weight 0.05', async () => {
    const user = userEvent.setup();
    handler = () => CHECK;
    render(withProfile(<ActionRail product={cardToProduct(card('TSLA'))} expanded={false} isFavorite={false} onToggleFavorite={() => {}} onBuy={() => {}} onHide={() => {}} />));
    await user.click(screen.getByRole('button', { name: /Plus d.actions/ }));
    await user.click(screen.getByRole('menuitem', { name: /Vérifier cette idée/ }));
    expect(screen.getByLabelText(/Part de TSLA/)).toHaveValue(5);
    await user.click(screen.getByRole('button', { name: 'Vérifier cette idée' }));
    await waitFor(() => expect(body(0)).toEqual({ profile_id: 'robert', ticker: 'TSLA', weight: 0.05 }));
    expect(await screen.findByTestId('idea-result')).toBeInTheDocument();
  });
});

describe('Déclaré / révélé', () => {
  it('shows "pas assez de décisions : n / 3" and the API messages, no update button', async () => {
    handler = () => LEARN();
    render(withProfile(<LearnBlock />));
    expect(await screen.findByTestId('learn-insufficient')).toHaveTextContent('Pas assez de décisions : 1 / 3');
    expect(screen.getByText(/1 décision\(s\) enregistrée\(s\)/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mettre à jour/ })).toBeNull();
  });

  it('shows revealed and retained levels, and the possible update from the API', async () => {
    handler = () => LEARN({ revealed: { established: true, level: 4, n: 5, needed: 3 }, status: 'riskier', update_to: 4, retained_if_updated: 2, messages: ['Vos décisions correspondent à 4 sur 5.'] });
    render(withProfile(<LearnBlock />));
    const block = await screen.findByTestId('learn-block');
    await within(block).findByText('Vos décisions correspondent à 4 sur 5.');
    expect(within(block).getByText('4 / 5')).toBeInTheDocument();
    expect(within(block).getByText(/Mise à jour possible de la tolérance déclarée à 4 sur 5/)).toBeInTheDocument();
  });
});

describe('simulated cart (no BNCD page)', () => {
  it('posts /api/purchase and shows the verdict and the no-order notice', async () => {
    const user = userEvent.setup();
    handler = () => ({
      simulated: true,
      tickers: ['BTC-USD'],
      weight_each: 0.05,
      max_equal_weight: 0,
      overall: { verdict: 'conflict', label: 'En conflit avec le profil déclaré', within_limits: false },
      summary: 'Simulation : BTC à 5 % chacun. Le portefeuille dépasse les limites du profil.',
    });
    setCatalog([cardToProduct({ ...card('BTC-USD'), asset_class: 'crypto' })], 'api');
    render(withProfile(<BuyPage ticker="BTC-USD" onBack={() => {}} onCreatePortfolio={() => {}} />));
    await user.click(screen.getByRole('button', { name: 'Ajouter au portefeuille' }));
    const res = await screen.findByTestId('purchase-result');
    expect(body(0)).toEqual({ profile_id: 'robert', tickers: ['BTC-USD'], weight: 0.05 });
    expect(calls()[0][0]).toBe('/api/purchase');
    expect(within(res).getByTestId('fit-badge')).toHaveClass('fit-badge--conflict');
    expect(res).toHaveTextContent('Simulation : BTC à 5 % chacun.');
    expect(res).toHaveTextContent('Simulation : aucun ordre n’est transmis.');
  });
});
