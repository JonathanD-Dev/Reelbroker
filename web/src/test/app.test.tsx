import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { PRODUCTS } from '../data/products';
import { computeProjections } from '../lib/projections';
import { formatUsd } from '../lib/format';
import { bncdViewUrl } from '../lib/bncd';
import { activateIndex, articles, names } from './feedTestUtils';

const squash = (s: string | null) => (s ?? '').replace(/\s/g, '');

const card = (index = 0) => articles()[index];
const productOf = (index = 0) => PRODUCTS.find((p) => p.name === names()[index])!;

async function openMenu(user: ReturnType<typeof userEvent.setup>, index = 0) {
  await user.click(within(card(index)).getByRole('button', { name: "Plus d'actions" }));
}

describe('App – parcours utilisateur', () => {
  it('(1) initial screen shows a full feed card: Buy, Pourquoi :, ticker, See more data', () => {
    render(<App />);
    const first = card();
    const p = productOf();
    expect(within(first).getByRole('heading', { name: 'Buy' })).toBeInTheDocument();
    expect(within(first).getByText('Pourquoi :')).toBeInTheDocument();
    expect(within(first).getByText(p.ticker)).toBeInTheDocument();
    expect(within(first).getByRole('button', { name: 'See more data' })).toBeInTheDocument();
    expect(screen.queryByText(/\d+ \/ \d+/)).not.toBeInTheDocument();
    expect(screen.getByText(/Données fictives/)).toBeInTheDocument();
    expect(screen.queryByText('Historique du produit')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Simuler l’achat' })).not.toBeInTheDocument();
  });

  it('(2) detailed view with the "Voir sur BNCD" link, then back to summary', async () => {
    const user = userEvent.setup();
    render(<App />);
    const first = card();
    await user.click(within(first).getByRole('button', { name: 'See more data' }));
    expect(screen.getByText('Historique du produit')).toBeInTheDocument();
    expect(screen.getByText('Impacts prévus sur le portefeuille (données fictives)')).toBeInTheDocument();
    expect(screen.getByLabelText('Si j’achetais')).toHaveValue(10);
    expect(within(first).getByRole('button', { name: 'See less data' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(within(first).queryByText('Pourquoi :')).not.toBeInTheDocument();
    expect(document.querySelectorAll('polyline[data-scenario]')).toHaveLength(3);
    // price chart (periods, axes, cursor) + projection chart
    expect(within(first).getAllByRole('img').length).toBeGreaterThanOrEqual(2);
    expect(within(first).getByTestId('price-chart')).toBeInTheDocument();
    expect(within(first).getByRole('link', { name: 'Voir sur BNCD (nouvel onglet)' })).toBeInTheDocument();
    expect(within(first).queryByRole('button', { name: 'Simuler l’achat' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Simuler l’achat/i })).not.toBeInTheDocument();

    await openMenu(user);
    expect(screen.getByRole('menuitem', { name: /Voir sur BNCD/ })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(within(first).getByRole('button', { name: 'See less data' }));
    expect(within(first).getByRole('heading', { name: 'Buy' })).toBeInTheDocument();
    expect(within(first).getByText('Pourquoi :')).toBeInTheDocument();
    expect(screen.queryByText('Historique du produit')).not.toBeInTheDocument();
    expect(within(first).queryByRole('link', { name: /Voir sur BNCD/ })).not.toBeInTheDocument();
  });

  it('(3) changing the quantity updates the projection summary', async () => {
    const user = userEvent.setup();
    render(<App />);
    const p = productOf();
    await user.click(within(card()).getByRole('button', { name: 'See more data' }));
    const expected = (q: number) => {
      const proj = computeProjections(p.price, q, p.rates);
      return [
        squash(formatUsd(p.price * q)),
        squash(formatUsd(proj.median[proj.median.length - 1].value)),
      ];
    };
    const before = squash(screen.getByTestId('projection-summary').textContent);
    for (const part of expected(10)) expect(before).toContain(part);

    const input = screen.getByLabelText('Si j’achetais');
    await user.clear(input);
    await user.type(input, '20');
    const after = squash(screen.getByTestId('projection-summary').textContent);
    expect(after).not.toBe(before);
    for (const part of expected(20)) expect(after).toContain(part);
  });

  it('(3b) quantity 0 hides the summary and shows the empty-quantity message', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(card()).getByRole('button', { name: 'See more data' }));
    await user.clear(screen.getByLabelText('Si j’achetais'));
    expect(screen.queryByTestId('projection-summary')).not.toBeInTheDocument();
    expect(screen.getByText(/Saisissez une quantité/)).toBeInTheDocument();
  });

  it('(3c) quantity is kept when toggling the view of the same card', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(card()).getByRole('button', { name: 'See more data' }));
    const input = screen.getByLabelText('Si j’achetais');
    await user.clear(input);
    await user.type(input, '5');
    await user.click(within(card()).getByRole('button', { name: 'See less data' }));
    await user.click(within(card()).getByRole('button', { name: 'See more data' }));
    expect(screen.getByLabelText('Si j’achetais')).toHaveValue(5);
  });

  it('(4) "Don\'t show me again" hides every occurrence, persists, and survives remount', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    const hiddenName = productOf().name;
    const hiddenTicker = productOf().ticker;
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: "Don't show me again" }));
    expect(names()).not.toContain(hiddenName);
    expect(names().length).toBeGreaterThan(0);
    expect(JSON.parse(localStorage.getItem('buy-demo:hidden:demo-retirement')!)).toEqual([hiddenTicker]);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    unmount();
    render(<App />);
    expect(names()).not.toContain(hiddenName);
  });

  it('(5) bookmark toggles aria-pressed and persists in buy-demo:favorites', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    const ticker = productOf().ticker;
    const btn = within(card()).getByRole('button', { name: 'Ajouter aux favoris' });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    await user.click(btn);
    const pressed = within(card()).getByRole('button', { name: 'Retirer des favoris' });
    expect(pressed).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.parse(localStorage.getItem('buy-demo:favorites:demo-retirement')!)).toEqual([ticker]);
    unmount();
    render(<App />);
    expect(within(card()).getByRole('button', { name: 'Retirer des favoris' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(card()).getByRole('button', { name: 'Retirer des favoris' }));
    expect(JSON.parse(localStorage.getItem('buy-demo:favorites:demo-retirement')!)).toEqual([]);
  });

  // Product decision: purchase is simulated inside the app (cart page), never the real broker.
  it('(6) menu "Voir sur BNCD" is a link to the quote page (new tab): nothing is bought, the feed stays in place', async () => {
    const user = userEvent.setup();
    render(<App />);
    const p = productOf();
    const hashBefore = window.location.hash;
    const accountBefore = localStorage.getItem('buy-demo:account');
    await openMenu(user);
    expect(screen.queryByRole('menuitem', { name: /Simuler l’achat/ })).not.toBeInTheDocument();
    const link = screen.getByRole('menuitem', { name: /^Voir sur BNCD\s*\(nouvel onglet\)$/ });
    expect(link).toHaveAttribute('href', bncdViewUrl(p));
    expect(link.getAttribute('href')).toContain('client.bnc.ca');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await user.click(link);
    expect(window.open).not.toHaveBeenCalled();
    expect(localStorage.getItem('buy-demo:account')).toBe(accountBefore); // no position added
    expect(window.location.hash).toBe(hashBefore);
    expect(screen.queryByRole('heading', { name: 'Panier' })).not.toBeInTheDocument();
  });

  it('(6b) in detailed view, the rail link "Voir sur BNCD" opens the quote page (new tab): nothing is bought', async () => {
    const user = userEvent.setup();
    render(<App />);
    const p = productOf();
    const accountBefore = localStorage.getItem('buy-demo:account');
    await user.click(within(card()).getByRole('button', { name: 'See more data' }));
    const link = within(card()).getByRole('link', { name: 'Voir sur BNCD (nouvel onglet)' });
    expect(link).toHaveAttribute('href', bncdViewUrl(p));
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await user.click(link);
    expect(window.open).not.toHaveBeenCalled();
    expect(localStorage.getItem('buy-demo:account')).toBe(accountBefore);
    expect(screen.queryByRole('heading', { name: 'Panier' })).not.toBeInTheDocument();
  });

  it('(6c) unknown ticker in the hash shows a not-found message with a back button', async () => {
    window.location.hash = '#/buy/ZZZZ';
    render(<App />);
    expect(await screen.findByText('Produit introuvable.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '← Retour' })).toBeInTheDocument();
  });

  it('(7) hiding every product shows EmptyState and the reset button restores them', async () => {
    const user = userEvent.setup();
    render(<App />);
    for (let i = 0; i < PRODUCTS.length; i++) {
      await openMenu(user);
      await user.click(screen.getByRole('menuitem', { name: "Don't show me again" }));
    }
    expect(screen.getByRole('heading', { name: 'Plus aucun produit à afficher' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('buy-demo:hidden:demo-retirement')!).sort()).toEqual(
      PRODUCTS.map((p) => p.ticker).sort(),
    );
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Réafficher les produits masqués' }));
    expect(screen.queryByText('Plus aucun produit à afficher')).not.toBeInTheDocument();
    expect(articles()).toHaveLength(8);
    expect(JSON.parse(localStorage.getItem('buy-demo:hidden:demo-retirement')!)).toEqual([]);
  });

  it('has no previous/next buttons and no "n / total" indicator', () => {
    render(<App />);
    expect(screen.queryByRole('button', { name: 'Produit précédent' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Produit suivant' })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\d+ \/ \d+/);
  });

  it('a card leaving the screen goes back to its summary view', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(card()).getByRole('button', { name: 'See more data' }));
    expect(screen.getByText('Historique du produit')).toBeInTheDocument();
    activateIndex(1);
    expect(screen.queryByText('Historique du produit')).not.toBeInTheDocument();
    expect(within(card()).getByRole('button', { name: 'See more data' })).toBeInTheDocument();
  });

  it('ignores unknown tickers and corrupted values in storage', () => {
    localStorage.setItem('buy-demo:hidden:demo-retirement', JSON.stringify(['ZZZZ', 5]));
    localStorage.setItem('buy-demo:favorites:demo-retirement', '{broken');
    render(<App />);
    expect(articles()).toHaveLength(8);
    expect(within(card()).getByRole('button', { name: 'Ajouter aux favoris' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('menu sheet closes on backdrop click and Escape, and exposes aria-expanded', async () => {
    const user = userEvent.setup();
    render(<App />);
    const trigger = within(card()).getByRole('button', { name: "Plus d'actions" });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
    await user.click(document.querySelector('.sheet-backdrop')!);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
