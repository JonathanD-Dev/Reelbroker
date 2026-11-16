import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeclaredProfile } from '../components/DeclaredProfile';
import { IdeaCheck } from '../components/IdeaCheck';
import { Markdown } from '../components/Markdown';
import { PortfolioCard } from '../components/PortfolioCard';
import { ProfileRefProvider } from '../hooks/useProfileId';
import { demoAccount } from '../lib/account';
import { writePortfolioProfile } from '../lib/apiProfile';

describe('Markdown subset', () => {
  it('renders headings, bold, lists and paragraphs as React nodes', () => {
    const { container } = render(<Markdown text={'## Titre\nUn texte **gras** et *nuancé*.\n\n- première\n- seconde\n\n1. un\n2. deux'} />);
    expect(container.querySelector('h5')).toHaveTextContent('Titre');
    expect(container.querySelector('p strong')).toHaveTextContent('gras');
    expect(container.querySelector('p em')).toHaveTextContent('nuancé');
    expect([...container.querySelectorAll('ul li')].map((l) => l.textContent)).toEqual(['première', 'seconde']);
    expect([...container.querySelectorAll('ol li')].map((l) => l.textContent)).toEqual(['un', 'deux']);
    expect(container.textContent).not.toContain('**');
    expect(container.textContent).not.toContain('##');
  });

  it('never injects HTML: tags stay plain text', () => {
    const { container } = render(<Markdown text={'<img src=x onerror=alert(1)> et <script>alert(2)</script>'} />);
    expect(container.querySelector('img, script')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('is used for the Bedrock explanation of an idea check', async () => {
    const user = userEvent.setup();
    const original = globalThis.fetch;
    vi.stubEnv('VITE_USE_API', 'true');
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          ok: true, ticker: 'BTC-USD', name: 'Bitcoin', weight: 0.1, verdict: 'conflict', verdict_label: 'En conflit avec le profil déclaré',
          checks: [], max_weight_within_profile: 0.05,
          explanation: { mode: 'bedrock', short: 'x', long: '## Verdict\nLe **conflit** est net.\n- plafond de 5 %', governance: { passed: true } },
        }),
        { status: 200 },
      )) as typeof fetch;
    render(
      <ProfileRefProvider value={{ profileId: 'amira' }}>
        <IdeaCheck />
      </ProfileRefProvider>,
    );
    await user.type(screen.getByLabelText('Votre idée, avec vos mots'), '10 % bitcoin');
    await user.click(screen.getByRole('button', { name: 'Vérifier cette idée' }));
    const res = await screen.findByTestId('idea-result');
    expect(res.querySelector('.md strong')).toHaveTextContent('conflit');
    expect(res.textContent).not.toContain('##');
    globalThis.fetch = original;
    vi.unstubAllEnvs();
  });
});

describe('declared profile from the backend', () => {
  it('shows objective, horizon, tolerance, capacity, level label and tags', () => {
    render(
      <DeclaredProfile
        profile={{ objective: 'growth', horizon_years: 15, risk_tolerance: 5, risk_capacity: 4, level: 4, level_label: 'élevé', excluded: [], preferred: ['Information Technology', 'crypto'], avoided: [] }}
      />,
    );
    const p = screen.getByTestId('declared-profile');
    expect(p).toHaveTextContent('Faire croître le capital');
    expect(p).toHaveTextContent('15 ans');
    expect(p).toHaveTextContent('Tolérance déclarée5 / 5');
    expect(p).toHaveTextContent('4 / 5 (élevé)');
    expect(p).toHaveTextContent('Technologies de l’information, Cryptoactifs');
  });
});

describe('portfolio card projection', () => {
  const pf = demoAccount().portfolios[0];
  const card = () => render(<ul><PortfolioCard portfolio={pf} active index={0} total={1} onSetActive={() => {}} onEdit={() => {}} /></ul>);
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('demo account: the team projection is labelled fictitious', () => {
    card();
    expect(screen.getByText(/Projection médiane fictive en \d{4}/)).toHaveTextContent('(fictif)');
    expect(screen.getByText('Dynamique', { exact: false })).toBeInTheDocument();
  });

  it('backend-profiled portfolio: no unsourced projection, API level and label instead of the 3-level risk', () => {
    writePortfolioProfile(pf.id, { profileId: 'amira', answers: {}, profile: { level: 4, level_label: 'élevé' } });
    card();
    expect(screen.queryByText(/Projection médiane/)).toBeNull();
    expect(screen.getByText(/Voir les scénarios hypothétiques dans le fil/)).toBeInTheDocument();
    expect(screen.getByText('Niveau 4 / 5 (élevé)')).toBeInTheDocument();
    expect(screen.queryByText('Dynamique', { exact: false })).toBeNull();
  });
});
