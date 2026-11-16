import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuestionFlow } from '../components/QuestionFlow';
import { PortfolioCard } from '../components/PortfolioCard';
import { demoAccount } from '../lib/account';
import { writePortfolioProfile } from '../lib/apiProfile';

describe('batch 7', () => {
  beforeEach(() => localStorage.clear());

  it('portfolio card uses the API objective label for backend portfolios', () => {
    const pf = { ...demoAccount().portfolios[0], goal: 'other' as const };
    writePortfolioProfile(pf.id, { profileId: 'x', answers: {}, profile: { objective: 'balanced', level: 3, level_label: 'modéré' } });
    render(
      <ul>
        <PortfolioCard portfolio={pf} active index={0} total={1} onSetActive={() => {}} onEdit={() => {}} />
      </ul>,
    );
    expect(screen.getByText('Objectif : équilibrer croissance et stabilité')).toBeInTheDocument();
  });

  it('answer chips show the answer without the internal code; the progress bar never goes backwards', async () => {
    const user = userEvent.setup();
    render(<QuestionFlow scope="account" title="Créer un compte" onExit={() => {}} onFinish={() => {}} />);
    const bar = () => Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'));
    await user.click(await screen.findByLabelText('Emploi permanent, revenu régulier'));
    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    // C2 with "less than 1 month" makes C2a (obligations) appear: the estimated total grows
    await user.click(await screen.findByLabelText('Moins de 1 mois'));
    const before = bar();
    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    await screen.findByText('Lesquelles de ces obligations s\'appliquent à vous ?');
    expect(bar()).toBeGreaterThanOrEqual(before);
    const chips = screen.getByRole('list', { name: 'Réponses précédentes' });
    expect(chips).toHaveTextContent('Emploi permanent');
    expect(chips.textContent).not.toMatch(/\bC\d+a? ·/);
    expect(screen.getByText('Question 3')).toBeInTheDocument();
  });
});
