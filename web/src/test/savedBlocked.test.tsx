import { describe, expect, it } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

const HIDDEN = 'buy-demo:hidden:demo-retirement';
const goSaved = () =>
  act(() => {
    window.location.hash = '#/saved';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
const tickers = (list: HTMLElement) =>
  within(list).getAllByRole('listitem').map((li) => li.querySelector('.saved-row__ticker')!.textContent);

describe('Sauvegardés → onglet « Bloqués » (v27)', () => {
  it('lists the products hidden with "Don\'t show me again", most recent first, with counts', async () => {
    const user = userEvent.setup();
    localStorage.setItem('buy-demo:favorites:demo-retirement', JSON.stringify(['NVDA']));
    localStorage.setItem(HIDDEN, JSON.stringify(['KO', 'TSLA', 'ZZZZ']));
    window.location.hash = '#/saved';
    render(<App />);
    expect(screen.getByRole('tab', { name: 'Sauvegardés (1)' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Bloqués (2)' }));
    expect(screen.getByText('2 produits bloqués')).toBeInTheDocument();
    expect(tickers(screen.getByRole('list', { name: 'Produits bloqués' }))).toEqual(['TSLA', 'KO']);
  });

  it('"Débloquer" removes it from the blocked list (back in the feed); "Annuler" restores it', async () => {
    const user = userEvent.setup();
    localStorage.setItem(HIDDEN, JSON.stringify(['KO', 'TSLA']));
    window.location.hash = '#/saved';
    render(<App />);
    await user.click(screen.getByRole('tab', { name: 'Bloqués (2)' }));
    await user.click(screen.getByRole('button', { name: 'Débloquer Tesla' }));
    expect(JSON.parse(localStorage.getItem(HIDDEN)!)).toEqual(['KO']);
    expect(screen.getByRole('tab', { name: 'Bloqués (1)' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Tesla débloqué : il réapparaîtra dans le fil');
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(JSON.parse(localStorage.getItem(HIDDEN)!)).toEqual(['KO', 'TSLA']);
    expect(screen.getByRole('status')).toHaveTextContent('Tesla bloqué de nouveau');
  });

  it('a product hidden from the feed menu appears in "Bloqués"; empty state when none', async () => {
    const user = userEvent.setup();
    render(<App />);
    const first = screen.getAllByRole('article')[0];
    const name = first.getAttribute('aria-label')!;
    await user.click(within(first).getByRole('button', { name: "Plus d'actions" }));
    await user.click(screen.getByRole('menuitem', { name: "Don't show me again" }));
    goSaved();
    await user.click(screen.getByRole('tab', { name: 'Bloqués (1)' }));
    expect(screen.getByRole('button', { name: `Débloquer ${name}` })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: `Débloquer ${name}` }));
    expect(screen.getByRole('heading', { name: 'Aucun titre bloqué' })).toBeInTheDocument();
  });

  it('search applies to the active tab; keyboard arrows switch tabs', async () => {
    const user = userEvent.setup();
    localStorage.setItem(HIDDEN, JSON.stringify(['KO', 'TSLA']));
    window.location.hash = '#/saved';
    render(<App />);
    screen.getByRole('tab', { name: /Sauvegardés/ }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Bloqués (2)' })).toHaveFocus();
    await user.type(screen.getByRole('searchbox', { name: 'Rechercher un produit' }), 'coca');
    expect(tickers(screen.getByRole('list', { name: 'Produits bloqués' }))).toEqual(['KO']);
  });
});
