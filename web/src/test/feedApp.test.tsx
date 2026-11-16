import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { PRODUCTS } from '../data/products';
import { feedSessionKey } from '../lib/feedSession';

// App-level tests: the feed position is stored per portfolio (demo account: active = Retraite).
const FEED_SESSION_KEY = feedSessionKey('demo-retirement');
import {
  activateIndex,
  articles,
  keys,
  names,
  reachSentinel,
  scrollIntoViewMock,
  scrollToMock,
  setReducedMotion,
} from './feedTestUtils';

const hasContent = (a: HTMLElement) => within(a).queryByText('Pourquoi :') !== null;
const trigger = (index: number) =>
  within(articles()[index]).getByRole('button', { name: "Plus d'actions" });

function lastScrollTarget(): Element | undefined {
  return scrollIntoViewMock().mock.contexts.at(-1) as Element | undefined;
}

function expectNoConsecutiveDuplicates() {
  const n = names();
  for (let i = 1; i < n.length; i++) expect(n[i], `index ${i}`).not.toBe(n[i - 1]);
}

describe('feed – structure initiale', () => {
  it('renders a feed of 8 articles with positions, unknown set size and a windowed content', () => {
    render(<App />);
    expect(screen.getByRole('feed')).toBeInTheDocument();
    const list = articles();
    expect(list).toHaveLength(8);
    list.forEach((a, i) => {
      expect(a).toHaveAttribute('aria-posinset', String(i + 1));
      expect(a).toHaveAttribute('aria-setsize', '-1');
    });
    // active card (index 0) ± 2 are heavy, the rest are placeholders
    expect(list.map(hasContent)).toEqual([true, true, true, false, false, false, false, false]);
    list.slice(3).forEach((a) => expect(a.querySelector('.reel__placeholder')).not.toBeNull());
    expect(screen.queryByText('1 / 5')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Produit suivant' })).not.toBeInTheDocument();
  });

  it('moves the rendering window when another card becomes active', () => {
    render(<App />);
    activateIndex(6);
    const flags = articles().map(hasContent);
    expect(flags).toEqual([false, false, false, false, true, true, true, true]);
    activateIndex(0);
    expect(articles().map(hasContent).slice(0, 3)).toEqual([true, true, true]);
  });
});

describe('feed – pages infinies', () => {
  it('appends a page each time the sentinel is reached, with unique keys, in ranked order', () => {
    render(<App />);
    expect(articles()).toHaveLength(8);
    reachSentinel();
    expect(articles()).toHaveLength(16);
    expect(new Set(keys()).size).toBe(16);
    expect(names()).toEqual(PRODUCTS.map((p) => p.name));
    articles().forEach((a, i) => expect(a).toHaveAttribute('aria-posinset', String(i + 1)));
  });

  it('shows each product once per round, then starts a new round (infinite feed) without an immediate repeat', () => {
    render(<App />);
    expect(document.querySelector('.feed__sentinel')).not.toBeNull();
    reachSentinel();
    expect(articles()).toHaveLength(PRODUCTS.length);
    expect(new Set(names()).size).toBe(PRODUCTS.length);
    // every product was shown: the feed goes on from the top of the ranking, no end card
    expect(document.querySelector('.feed__sentinel')).not.toBeNull();
    expect(screen.queryByRole('region', { name: 'Fin du fil' })).not.toBeInTheDocument();
    const lastThree = names().slice(-3);
    reachSentinel();
    expect(articles().length).toBeGreaterThan(PRODUCTS.length);
    const round2 = names().slice(PRODUCTS.length);
    expect(lastThree).not.toContain(round2[0]);
    expect(new Set(round2).size).toBe(round2.length);
    expect(new Set(keys()).size).toBe(keys().length);
    for (let i = 1; i < names().length; i++) expect(names()[i]).not.toBe(names()[i - 1]);
  });
  it('is finite with a single visible product: one article and no sentinel', () => {
    localStorage.setItem('buy-demo:hidden:demo-retirement', JSON.stringify(PRODUCTS.slice(1).map((p) => p.ticker)));
    render(<App />);
    expect(articles()).toHaveLength(1);
    expect(document.querySelector('.feed__sentinel')).toBeNull();
  });
});

describe('feed – clavier', () => {
  it.each(['j', '{ArrowDown}', '{PageDown}'])('%s goes to the next card and focuses it', async (key) => {
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard(key);
    expect(lastScrollTarget()).toBe(articles()[1]);
    expect(articles()[1]).toHaveFocus();
    expect(scrollIntoViewMock()).toHaveBeenLastCalledWith({ block: 'start', behavior: 'auto' });
  });

  it.each(['k', '{ArrowUp}', '{PageUp}'])('%s goes back to the previous card', async (key) => {
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard('j');
    await user.keyboard('j');
    expect(articles()[2]).toHaveFocus();
    await user.keyboard(key);
    expect(lastScrollTarget()).toBe(articles()[1]);
    expect(articles()[1]).toHaveFocus();
  });

  it('does nothing before the first card', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard('k{ArrowUp}{PageUp}');
    expect(scrollIntoViewMock()).not.toHaveBeenCalled();
  });

  it('does nothing after the last card (finite feed)', async () => {
    localStorage.setItem('buy-demo:hidden:demo-retirement', JSON.stringify(PRODUCTS.slice(1).map((p) => p.ticker)));
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard('j{ArrowDown}{PageDown}');
    expect(scrollIntoViewMock()).not.toHaveBeenCalled();
  });

  it('is ignored while typing in the quantity input', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(articles()[0]).getByRole('button', { name: 'See more data' }));
    await user.click(screen.getByLabelText('Si j’achetais'));
    await user.keyboard('j{ArrowDown}{PageDown}');
    expect(scrollIntoViewMock()).not.toHaveBeenCalled();
  });

  it('is ignored with a modifier key', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard('{Control>}j{/Control}');
    expect(scrollIntoViewMock()).not.toHaveBeenCalled();
  });

  it('is ignored while the bottom sheet is open', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(trigger(0));
    const feed = screen.getByRole('feed');
    expect(feed).toHaveAttribute('inert');
    expect(screen.getByRole('menuitem', { name: /Voir sur BNCD/ })).toHaveFocus();
    fireEvent.keyDown(document.body, { key: 'j' });
    fireEvent.keyDown(document.body, { key: 'PageDown' });
    expect(scrollIntoViewMock()).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(feed).not.toHaveAttribute('inert');
    await user.keyboard('j');
    expect(scrollIntoViewMock()).toHaveBeenCalledTimes(1);
  });

  it('uses smooth scrolling unless the user prefers reduced motion', async () => {
    setReducedMotion(false);
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard('j');
    expect(scrollIntoViewMock()).toHaveBeenLastCalledWith({ block: 'start', behavior: 'smooth' });
  });

  it('arrows keep scrolling the detail panel instead of changing card when it can scroll', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(articles()[0]).getByRole('button', { name: 'See more data' }));
    const content = articles()[0].querySelector<HTMLElement>('.reel__content')!;
    expect(content).toHaveClass('reel__content--expanded');
    Object.defineProperty(content, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(content, 'clientHeight', { value: 400, configurable: true });
    const down = fireEvent.keyDown(content, { key: 'ArrowDown' });
    expect(down).toBe(true); // not default-prevented: the browser scrolls the panel
    expect(scrollIntoViewMock()).not.toHaveBeenCalled();
    // j always navigates
    fireEvent.keyDown(content, { key: 'j' });
    expect(scrollIntoViewMock()).toHaveBeenCalledTimes(1);
  });
});

describe('feed – masquage', () => {
  it('removes every occurrence of the product, even after pages were added', async () => {
    const user = userEvent.setup();
    render(<App />);
    reachSentinel();
    const name = names()[0];
    expect(names().filter((n) => n === name).length).toBeGreaterThanOrEqual(1);
    await user.click(trigger(0));
    await user.click(screen.getByRole('menuitem', { name: "Don't show me again" }));
    expect(names()).not.toContain(name);
    expect(JSON.parse(localStorage.getItem('buy-demo:hidden:demo-retirement')!)).toEqual([
      PRODUCTS.find((p) => p.name === name)!.ticker,
    ]);
    expectNoConsecutiveDuplicates();
    expect(articles()[0]).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent(`${name} masqué. Affichage de`);
    expect(scrollToMock()).toHaveBeenCalledWith({ top: 0, behavior: 'instant' });
    articles().forEach((a, i) => expect(a).toHaveAttribute('aria-posinset', String(i + 1)));
  });

  it('keeps focus and scroll compensation on the card that replaces a hidden middle card', async () => {
    const user = userEvent.setup();
    render(<App />);
    activateIndex(3);
    await user.click(trigger(3));
    await user.click(screen.getByRole('menuitem', { name: "Don't show me again" }));
    expect(scrollToMock()).toHaveBeenCalled();
    const active = keys().indexOf(
      (document.activeElement as HTMLElement).closest('article')!.dataset.key!,
    );
    expect(active).toBeGreaterThanOrEqual(0);
    expect(articles()[active]).toHaveFocus();
    expectNoConsecutiveDuplicates();
  });

  it('plays the exit animation first, then removes the card after 220 ms', () => {
    setReducedMotion(false);
    // Only timers are faked: RTL async helpers and user-event would hang on faked timers.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    render(<App />);
    const name = names()[0];
    const firstKey = keys()[0];
    fireEvent.click(trigger(0));
    fireEvent.click(screen.getByRole('menuitem', { name: "Don't show me again" }));
    const leaving = articles().find((a) => a.dataset.key === firstKey)!;
    expect(leaving).toHaveClass('reel--leaving');
    expect(names()).toContain(name);
    // keyboard navigation is ignored during the animation
    fireEvent.keyDown(document.body, { key: 'j' });
    expect(scrollIntoViewMock()).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(219);
    });
    expect(keys()).toContain(firstKey);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(keys()).not.toContain(firstKey);
    expect(names()).not.toContain(name);
    expect(articles()[0]).toHaveFocus();
  });

  it('shows a full-screen empty state when everything is hidden, then restores the feed', async () => {
    localStorage.setItem('buy-demo:hidden:demo-retirement', JSON.stringify(PRODUCTS.slice(1).map((p) => p.ticker)));
    const user = userEvent.setup();
    render(<App />);
    await user.click(trigger(0));
    await user.click(screen.getByRole('menuitem', { name: "Don't show me again" }));
    const heading = screen.getByRole('heading', { name: 'Plus aucun produit à afficher' });
    expect(heading).toHaveFocus();
    expect(screen.queryByRole('feed')).not.toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Réafficher les produits masqués' }));
    expect(JSON.parse(localStorage.getItem('buy-demo:hidden:demo-retirement')!)).toEqual([]);
    expect(articles()).toHaveLength(8);
    expect(articles()[0]).toHaveFocus();
    expect(scrollToMock()).toHaveBeenCalledWith({ top: 0, behavior: 'instant' });
    // the feed is alive again: the sentinel still loads pages
    reachSentinel();
    expect(articles()).toHaveLength(16);
  });
});

describe('feed – indice « Glisser vers le haut »', () => {
  it('is shown at first launch, then disappears and is remembered once the user moves on', () => {
    render(<App />);
    expect(screen.getByText('Glisser vers le haut')).toBeInTheDocument();
    expect(localStorage.getItem('buy-demo:hint-seen')).toBeNull();
    activateIndex(1);
    expect(screen.queryByText('Glisser vers le haut')).not.toBeInTheDocument();
    expect(localStorage.getItem('buy-demo:hint-seen')).toBe('1');
  });

  it('is not shown when the flag is already set', () => {
    localStorage.setItem('buy-demo:hint-seen', '1');
    render(<App />);
    expect(screen.queryByText('Glisser vers le haut')).not.toBeInTheDocument();
  });

  it('is marked as seen after a successful keyboard navigation', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard('j');
    expect(localStorage.getItem('buy-demo:hint-seen')).toBe('1');
    expect(screen.queryByText('Glisser vers le haut')).not.toBeInTheDocument();
  });
});

describe('feed – double-clic = favori', () => {
  it('adds the product to favorites, shows the burst and never removes it', async () => {
    const user = userEvent.setup();
    render(<App />);
    const ticker = PRODUCTS.find((p) => p.name === names()[0])!.ticker;
    await user.dblClick(articles()[0]);
    expect(
      within(articles()[0]).getByRole('button', { name: 'Retirer des favoris' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.parse(localStorage.getItem('buy-demo:favorites:demo-retirement')!)).toEqual([ticker]);
    expect(articles()[0].querySelector('.burst')).not.toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('ajouté aux favoris');
    await user.dblClick(articles()[0]);
    expect(JSON.parse(localStorage.getItem('buy-demo:favorites:demo-retirement')!)).toEqual([ticker]);
    expect(screen.getByRole('status')).toHaveTextContent('est déjà dans les favoris');
  });

  it('does nothing when double-clicking a button', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.dblClick(within(articles()[0]).getByRole('button', { name: 'See more data' }));
    expect(articles()[0].querySelector('.burst')).toBeNull();
    expect(localStorage.getItem('buy-demo:favorites:demo-retirement')).toBeNull();
  });

  it('ignores two clicks that are too far apart in time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const user = userEvent.setup();
    render(<App />);
    await user.click(articles()[0]);
    vi.setSystemTime(Date.now() + 500);
    await user.click(articles()[0]);
    expect(localStorage.getItem('buy-demo:favorites:demo-retirement')).toBeNull();
    expect(articles()[0].querySelector('.burst')).toBeNull();
  });
});

describe('feed – restauration après avoir quitté le fil', () => {
  it('rebuilds the same keys and scrolls back to the active card', async () => {
    render(<App />);
    reachSentinel();
    activateIndex(3);
    const before = keys();
    // v9: "Buy now" no longer leaves the feed (BNCD opens in a new tab); leave via the Saved tab.
    act(() => {
      window.location.hash = '#/saved';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.queryByRole('feed')).not.toBeInTheDocument();

    scrollIntoViewMock().mockClear();
    act(() => {
      window.location.hash = '#/';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(await screen.findByRole('feed')).toBeInTheDocument();
    expect(keys()).toEqual(before);
    expect(lastScrollTarget()).toBe(articles()[3]);
    expect(scrollIntoViewMock()).toHaveBeenLastCalledWith({ block: 'start', behavior: 'instant' });
    expect(hasContent(articles()[3])).toBe(true);
    expect(hasContent(articles()[0])).toBe(false);
    // the restored feed is infinite: the sentinel is still there, no end card
    expect(document.querySelector('.feed__sentinel')).not.toBeNull();
    expect(screen.queryByRole('region', { name: 'Fin du fil' })).not.toBeInTheDocument();
    expect(new Set(keys()).size).toBe(keys().length);
  });

  it('restores a snapshot written in sessionStorage', () => {
    sessionStorage.setItem(
      FEED_SESSION_KEY,
      JSON.stringify({
        keys: ['AAPL#0', 'NVDA#1', 'MSFT#2', 'KO#3', 'V#4'],
        activeKey: 'KO#3',
        nextPage: 1,
        nextSeq: 5,
      }),
    );
    render(<App />);
    expect(keys()).toEqual(['AAPL#0', 'NVDA#1', 'MSFT#2', 'KO#3', 'V#4']);
    expect(lastScrollTarget()).toBe(articles()[3]);
  });

  it('falls back to the bounded rank when the active card disappeared', () => {
    localStorage.setItem('buy-demo:hidden:demo-retirement', JSON.stringify(['KO']));
    sessionStorage.setItem(
      FEED_SESSION_KEY,
      JSON.stringify({
        keys: ['AAPL#0', 'NVDA#1', 'MSFT#2', 'KO#3', 'V#4'],
        activeKey: 'KO#3',
        nextPage: 1,
        nextSeq: 5,
      }),
    );
    render(<App />);
    expect(keys()).toEqual(['AAPL#0', 'NVDA#1', 'MSFT#2', 'V#4']);
    expect(lastScrollTarget()).toBe(articles()[3]);
  });

  it('starts a fresh feed when the snapshot is corrupted', () => {
    sessionStorage.setItem(FEED_SESSION_KEY, '{garbage');
    render(<App />);
    expect(articles()).toHaveLength(8);
    expect(scrollIntoViewMock()).not.toHaveBeenCalled();
    expect(keys()[0]).toBe(`${PRODUCTS.find((p) => p.name === names()[0])!.ticker}#0`);
  });
});
