import { describe, expect, it } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { SESSION_KEY } from '../lib/session';

// setup.ts starts every test "logged in"; these tests start from a new arrival.
const arrive = () => sessionStorage.removeItem(SESSION_KEY);
/** Logs in from the welcome page with an account name. */
async function loginAs(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.type(screen.getByLabelText('Nom du compte'), name);
  await user.click(screen.getByRole('button', { name: 'Se connecter' }));
}

describe('welcome page (v22)', () => {
  it('a new arrival lands on the welcome page, not in the app', () => {
    arrive();
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Bienvenue' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Créer un compte' })).toBeInTheDocument();
    expect(screen.queryByRole('feed')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('"Se connecter" enters the current app and is remembered for the tab', async () => {
    const user = userEvent.setup();
    arrive();
    const first = render(<App />);
    await loginAs(user, 'alex tremblay'); // case-insensitive
    expect(screen.getByRole('feed')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Navigation principale' })).toBeInTheDocument();
    expect(sessionStorage.getItem(SESSION_KEY)).toBe('demo');
    first.unmount();
    render(<App />); // reload in the same tab
    expect(screen.getByRole('feed')).toBeInTheDocument();
  });

  it('a deep link is kept: after "Se connecter" the requested page opens', async () => {
    const user = userEvent.setup();
    arrive();
    window.location.hash = '#/saved';
    render(<App />);
    await loginAs(user, 'Alex Tremblay');
    expect(screen.getByRole('heading', { level: 1, name: 'Sauvegardés' })).toBeInTheDocument();
  });

  it('"Créer un compte" opens the question-by-question account creation; Annuler goes back', async () => {
    const user = userEvent.setup();
    arrive();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Créer un compte' }));
    expect(window.location.hash).toBe('#/signup');
    expect(screen.getByRole('heading', { level: 1, name: 'Comment souhaitez-vous être appelé ?' })).toHaveFocus();
    expect(screen.getByText('Étape 1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(window.location.hash).toBe('#/');
    expect(screen.getByRole('heading', { level: 1, name: 'Bienvenue' })).toBeInTheDocument();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('account creation: name, then the account questionnaire (C*) one question per screen, then the account is created', async () => {
    const user = userEvent.setup();
    arrive();
    localStorage.setItem('buy-demo:favorites:demo-retirement', JSON.stringify(['NVDA']));
    window.location.hash = '#/signup';
    render(<App />);
    const next = () => user.click(screen.getByRole('button', { name: 'Continuer' }));
    // 1. name is required
    await next();
    expect(screen.getByText('Indiquez un nom.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Nom affiché'), 'Mateo Roy');
    await next();
    // 2. C1: an answer is required (or "Passer")
    expect(await screen.findByRole('heading', { level: 1, name: /principale source de revenu/ })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeDisabled();
    await user.click(screen.getByLabelText('Emploi permanent, revenu régulier'));
    await next();
    // 3. C2 (marge de manœuvre): "plus de 6 mois" skips the obligations question C2a
    await user.click(await screen.findByLabelText('Plus de 6 mois'));
    expect(screen.getByRole('list', { name: 'Réponses précédentes' })).toHaveTextContent('Emploi permanent');
    await next();
    // 4. C3 experience
    await user.click(await screen.findByLabelText(/choisi moi-même/));
    await next();
    // 5. C4 exclusions (multi) -> C4a strict/preference appears
    await user.click(await screen.findByLabelText('Énergies fossiles'));
    await user.click(screen.getByLabelText(/Cryptoactifs/));
    await next();
    await user.click(await screen.findByLabelText(/règle stricte/));
    await next();
    // 6. C6 themes, C5 explanation level, then the account is created
    await user.click(await screen.findByLabelText(/Technologies et intelligence/));
    await next();
    await user.click(await screen.findByLabelText(/Les points clés/));
    await next();
    await waitFor(() => expect(window.location.hash).toBe('#/profile/first'));

    const id = sessionStorage.getItem(SESSION_KEY)!;
    expect(id).toMatch(/^acc-/);
    const stored = JSON.parse(localStorage.getItem('buy-demo:account:' + id)!);
    expect(stored).toMatchObject({ name: 'Mateo Roy', portfolios: [], activeId: null });
    expect(stored.shared).toEqual({
      financial: { income: 'stable', emergencyFund: 'gt6' },
      obligations: { debts: [], dependents: 0 },
      experience: { level: 'intermediate', instruments: ['stocks', 'etf'] },
      preferences: { esg: false, exclusions: ['fossil'] },
    });
    // the answers are kept for the portfolio questionnaire (backend unreachable: no profile id)
    const profile = JSON.parse(localStorage.getItem('buy-demo:apiprofile:' + id)!);
    expect(profile.profileId).toBeNull();
    expect(profile.answers).toMatchObject({ C1: 'permanent', C2: 'gt_6m', C4: ['fossil_fuels', 'crypto'], C4a: 'strict', C6: ['tech'], C5: 'standard' });
    // the other accounts are kept
    expect(localStorage.getItem('buy-demo:favorites:demo-retirement')).toBe('["NVDA"]');
    expect(JSON.parse(localStorage.getItem('buy-demo:accounts')!).map((e: { name: string }) => e.name)).toEqual(['Alex Tremblay', 'Mateo Roy']);
    expect(screen.getByText('Premier portefeuille')).toBeInTheDocument();
    // "Créer plus tard": to Profil → Portefeuilles, where a portfolio can be created later
    await user.click(screen.getByText('Créer plus tard'));
    expect(window.location.hash).toBe('#/profile');
    expect(screen.getByRole('tab', { name: 'Portefeuilles' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: '+ Créer un portefeuille' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('buy-demo:account:' + id)!).portfolios).toEqual([]);
  });

  it('"Premier portefeuille": name, then the portfolio questions (P*); completing it creates the active portfolio', async () => {
    const user = userEvent.setup();
    // "#/profile/first" follows account creation: the account already has its answers (C*).
    // (An account without them is asked the account questions first: see NewPortfolioFlow.)
    localStorage.setItem('buy-demo:apiprofile:demo', JSON.stringify({ profileId: null, answers: { C1: 'permanent' } }));
    window.location.hash = '#/profile/first';
    const first = render(<App />);
    expect(screen.getByText('Créer plus tard')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Nom du portefeuille'), 'Retraite');
    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    const next = () => user.click(screen.getByRole('button', { name: 'Continuer' }));
    await user.click(await screen.findByLabelText('Préserver le capital')); // P1
    await next();
    await user.click(await screen.findByLabelText('De 3 à 5 ans')); // P2
    await next();
    await user.click(await screen.findByLabelText(/De 10 000 \$ à 50 000 \$/)); // P3
    await next();
    await user.click(await screen.findByLabelText(/aucun retrait prévu/)); // P4
    await next();
    await user.click(await screen.findByLabelText(/Je vendrais une partie/)); // P5 (no P5a after a sell answer)
    await next();
    await waitFor(() => expect(window.location.hash).toBe('#/profile'));
    const acc = JSON.parse(localStorage.getItem('buy-demo:account')!);
    const pf = acc.portfolios.at(-1);
    expect(acc.activeId).toBe(pf.id);
    expect(pf).toMatchObject({ name: 'Retraite', goal: 'safety', risk: 'prudent', initialAmount: 30000, horizonYears: 4 });
    expect(JSON.parse(localStorage.getItem('buy-demo:apiprofile:pf:' + pf.id)!).answers).toMatchObject({ P1: 'preserve', P2: '3_5y', P3: '10k_50k' });
    first.unmount();
    window.location.hash = '#/profile/first';
    render(<App />);
    // step 1: the back arrow is "Créer plus tard" too
    const arrows = screen.getAllByRole('button', { name: 'Créer plus tard' });
    expect(arrows).toHaveLength(2);
    await user.click(arrows[0]);
    expect(window.location.hash).toBe('#/profile');
  });

  it('after "Créer plus tard", creating from Profil is still titled "Premier portefeuille"', async () => {
    const user = userEvent.setup();
    localStorage.setItem('buy-demo:account', JSON.stringify({ name: 'Mateo', shared: {}, portfolios: [], activeId: null }));
    window.location.hash = '#/profile';
    render(<App />);
    await user.click(screen.getByRole('button', { name: '+ Créer un portefeuille' }));
    expect(window.location.hash).toBe('#/profile/new');
    expect(screen.getByText('Premier portefeuille')).toBeInTheDocument();
    expect(screen.queryByText('Nouveau portefeuille')).toBeNull();
  });

  it('the portfolio questionnaire from Profil keeps its title and has no "Créer plus tard"', () => {
    window.location.hash = '#/profile/new';
    render(<App />);
    expect(screen.getByText('Nouveau portefeuille')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Créer plus tard' })).toBeNull();
  });

  it('"Se déconnecter" in Profil goes back to the welcome page and keeps the data', async () => {
    const user = userEvent.setup();
    localStorage.setItem('buy-demo:favorites:demo-retirement', JSON.stringify(['NVDA']));
    window.location.hash = '#/profile';
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Se déconnecter' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Bienvenue' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/');
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(localStorage.getItem('buy-demo:favorites:demo-retirement')).toBe('["NVDA"]');
    await loginAs(user, 'Alex Tremblay');
    expect(screen.getByRole('feed')).toBeInTheDocument();
  });

  it('login by name: unknown or empty name shows an error; account shortcuts fill the field', async () => {
    const user = userEvent.setup();
    arrive();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Indiquez le nom de votre compte.');
    await loginAs(user, 'Robert');
    expect(screen.getByRole('alert')).toHaveTextContent('Aucun compte ne porte le nom « Robert » sur cet appareil.');
    expect(screen.getByLabelText('Nom du compte')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('feed')).toBeNull();
    const shortcuts = screen.getByRole('group', { name: 'Comptes sur cet appareil' });
    await user.click(within(shortcuts).getByRole('button', { name: 'Alex Tremblay' }));
    expect(screen.getByLabelText('Nom du compte')).toHaveValue('Alex Tremblay');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(screen.getByRole('feed')).toBeInTheDocument();
  });

  it('several accounts are kept, each with its own data; names are unique', async () => {
    const user = userEvent.setup();
    arrive();
    localStorage.setItem('buy-demo:favorites:demo-retirement', JSON.stringify(['NVDA']));
    window.location.hash = '#/signup';
    const view = render(<App />);
    // a taken name is refused at step 1 (accent/case-insensitive)
    await user.type(screen.getByLabelText('Nom affiché'), 'ALEX TREMBLAY');
    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(screen.getByText(/Un compte porte déjà ce nom/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Nom affiché'));
    await user.type(screen.getByLabelText('Nom affiché'), 'Amira');
    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    // every account question can be skipped
    for (let i = 0; i < 8; i++) {
      const skip = await screen.findByRole('button', { name: 'Passer cette question' }, { timeout: 400 }).catch(() => null);
      if (!skip) break;
      await user.click(skip);
    }
    await user.click(await screen.findByText('Créer plus tard'));
    // Amira's profile: her name, no portfolio, nothing from the demo account
    expect(screen.getByRole('heading', { level: 1, name: 'Amira' })).toBeInTheDocument();
    expect(screen.getByText(/^0 portefeuille/)).toBeInTheDocument();
    // log out, log in as Alex: his data is intact
    await user.click(screen.getByRole('button', { name: 'Se déconnecter' }));
    expect(within(screen.getByRole('group', { name: 'Comptes sur cet appareil' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['Alex Tremblay', 'Amira']);
    await loginAs(user, 'Alex Tremblay');
    act(() => {
      window.location.hash = '#/profile';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Alex Tremblay' })).toBeInTheDocument();
    expect(screen.getByText(/3 portefeuilles/)).toBeInTheDocument();
    expect(localStorage.getItem('buy-demo:favorites:demo-retirement')).toBe('["NVDA"]');
    // log back in as Amira (another tab arrival): still her account
    view.unmount();
    arrive();
    render(<App />);
    await loginAs(user, 'amira');
    act(() => {
      window.location.hash = '#/profile';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Amira' })).toBeInTheDocument();
  });

  it('opening #/signup directly shows the account creation', () => {
    arrive();
    window.location.hash = '#/signup';
    render(<App />);
    expect(screen.getByText('Créer un compte')).toBeInTheDocument();
    act(() => {
      window.location.hash = '#/';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Bienvenue' })).toBeInTheDocument();
  });
});
