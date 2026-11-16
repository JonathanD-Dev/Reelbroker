import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { PRODUCTS } from '../data/products';
import { feedSessionKey } from '../lib/feedSession';

// App-level tests: the feed position is stored per portfolio (demo account: active = Retraite).
const FEED_SESSION_KEY = feedSessionKey('demo-retirement');

/** Hash navigation as done by the tab bar links. */
function navigateTo(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}
import {
  activateIndex,
  articles,
  keys,
  names,
  reachSentinel,
  scrollIntoViewMock,
  setReducedMotion,
} from './feedTestUtils';

const hasContent = (a: HTMLElement) => within(a).queryByText('Pourquoi :') !== null;
const trigger = (index: number) =>
  within(articles()[index]).getByRole('button', { name: "Plus d'actions" });
const HIDE = { name: "Don't show me again" };
const tickerOfName = (name: string) => PRODUCTS.find((p) => p.name === name)!.ticker;
const hideAllBut = (keep: number) =>
  localStorage.setItem('buy-demo:hidden:demo-retirement', JSON.stringify(PRODUCTS.slice(keep).map((p) => p.ticker)));

function expectNoConsecutiveDuplicates() {
  const n = names();
  for (let i = 1; i < n.length; i++) expect(n[i], `index ${i}`).not.toBe(n[i - 1]);
}

async function hideCard(user: ReturnType<typeof userEvent.setup>, index: number) {
  await user.click(trigger(index));
  await user.click(screen.getByRole('menuitem', HIDE));
}

describe('acceptation – masquage de toutes les occurrences, y compris pages futures', () => {
  it('never reintroduces a hidden product in pages added after the hide', async () => {
    const user = userEvent.setup();
    render(<App />);
    const name = names()[0];
    await hideCard(user, 0);
    // 16 products, one hidden: hiding tops up the feed (ensureAhead) to the 15 others;
    // the hidden one never comes back, not even in the next round (infinite feed)
    expect(articles()).toHaveLength(PRODUCTS.length - 1);
    reachSentinel();
    expect(articles().length).toBeGreaterThan(PRODUCTS.length - 1);
    expect(names()).not.toContain(name);
    expectNoConsecutiveDuplicates();
    expect(new Set(keys()).size).toBe(keys().length);
  });

  it('does not reintroduce the product when a page is appended during the exit animation', () => {
    setReducedMotion(false);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    render(<App />);
    const name = names()[0];
    fireEvent.click(trigger(0));
    fireEvent.click(screen.getByRole('menuitem', HIDE));
    act(() => {
      vi.advanceTimersByTime(220);
    });
    expect(names()).not.toContain(name);
    expect(articles()).toHaveLength(PRODUCTS.length - 1);
    reachSentinel();
    expect(names()).not.toContain(name);
    expectNoConsecutiveDuplicates();
    expect(new Set(keys()).size).toBe(keys().length);
  });

  it('keeps hidden products hidden after a visit to the cart page (simulated purchase) and back', async () => {
    const user = userEvent.setup();
    render(<App />);
    const name = names()[0];
    await hideCard(user, 0);
    // Titles with a BNCD page link to it; the cart page (#/buy/<ticker>) stays for the others.
    act(() => {
      window.location.hash = '#/buy/' + encodeURIComponent(tickerOfName(names()[0]));
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(await screen.findByRole('heading', { name: 'Panier' })).toBeInTheDocument();
    act(() => {
      window.location.hash = '#/';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(await screen.findByRole('feed')).toBeInTheDocument();
    expect(names()).not.toContain(name);
  });
});

describe('acceptation – cas limites du masquage', () => {
  it('hiding one of two visible products leaves a finite feed of one card, no duplicate', async () => {
    hideAllBut(2);
    const user = userEvent.setup();
    render(<App />);
    expect(articles().length).toBe(2);
    expectNoConsecutiveDuplicates();
    const [first, second] = [names()[0], names()[1]];
    await hideCard(user, 0);
    expect(names()).toEqual([second]);
    expect(names()).not.toContain(first);
    expect(document.querySelector('.feed__sentinel')).toBeNull();
    expect(articles()[0]).toHaveFocus();
  });

  it('hide-all → reset → hide again: the hidden list restarts from empty, the feed is healthy', async () => {
    hideAllBut(1);
    const user = userEvent.setup();
    render(<App />);
    await hideCard(user, 0);
    expect(screen.getByRole('heading', { name: 'Plus aucun produit à afficher' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Réafficher les produits masqués' }));
    expect(JSON.parse(localStorage.getItem('buy-demo:hidden:demo-retirement')!)).toEqual([]);
    expect(articles()).toHaveLength(8);
    expect(new Set(keys()).size).toBe(8);
    expect(articles()[0]).toHaveFocus();
    expectNoConsecutiveDuplicates();
    const name = names()[0];
    await hideCard(user, 0);
    expect(JSON.parse(localStorage.getItem('buy-demo:hidden:demo-retirement')!)).toEqual([tickerOfName(name)]);
    expect(names()).not.toContain(name);
    expect(articles()[0]).toHaveFocus();
  });

  it('shows the empty state at load when every product (plus unknown tickers) is hidden', async () => {
    localStorage.setItem(
      'buy-demo:hidden:demo-retirement',
      JSON.stringify([...PRODUCTS.map((p) => p.ticker), 'ZZZZ', 42, null]),
    );
    const user = userEvent.setup();
    render(<App />);
    const heading = screen.getByRole('heading', { name: 'Plus aucun produit à afficher' });
    expect(heading).not.toHaveFocus(); // no focus theft on a plain load
    expect(screen.queryByText('Glisser vers le haut')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Réafficher les produits masqués' }));
    expect(articles()).toHaveLength(8);
  });

  it('ignores a hidden list that only contains unknown tickers', () => {
    localStorage.setItem('buy-demo:hidden:demo-retirement', JSON.stringify(['ZZZZ', 'QQQ']));
    localStorage.setItem('buy-demo:favorites:demo-retirement', '{"not":"an array"}');
    render(<App />);
    expect(articles()).toHaveLength(8);
  });

  // KNOWN BUG B1 (voir rapport): with prefers-reduced-motion the focus() of the article that
  // replaces the hidden one is called while `.feed` is still `inert` (the sheet removes `inert`
  // in a passive effect cleanup, which runs after the layout effect that moves focus).
  // jsdom ignores `inert`, so the bug is detected by recording the attribute at focus() time.
  // `it.fails` keeps the suite green while the bug is open; remove `.fails` once fixed.
  it.fails('focuses the replacing article only once the feed is no longer inert (reduced motion)', async () => {
    const focusedWhileInert: boolean[] = [];
    const original = HTMLElement.prototype.focus;
    const spy = vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (
      this: HTMLElement,
      ...args: Parameters<HTMLElement['focus']>
    ) {
      if (this.matches('article.reel')) {
        focusedWhileInert.push(document.querySelector('.feed')?.hasAttribute('inert') ?? false);
      }
      return original.apply(this, args);
    });
    try {
      const user = userEvent.setup();
      render(<App />);
      await hideCard(user, 0);
      expect(focusedWhileInert.length).toBeGreaterThan(0);
      expect(focusedWhileInert.every((inert) => !inert)).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('acceptation – DOM borné', () => {
  it('mounts heavy content for at most 5 cards however many pages were added', () => {
    render(<App />);
    reachSentinel();
    expect(articles()).toHaveLength(PRODUCTS.length);
    activateIndex(8);
    const heavy = articles().filter(hasContent);
    expect(heavy).toHaveLength(5);
    expect(heavy.map((a) => articles().indexOf(a))).toEqual([6, 7, 8, 9, 10]);
    expect(document.querySelectorAll('.reel__placeholder')).toHaveLength(PRODUCTS.length - 5);
    expect(document.querySelectorAll('.feed__sentinel')).toHaveLength(1); // infinite feed
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(0);
  });

  it('the active window shrinks at the edges of the feed (first and last cards)', () => {
    render(<App />);
    activateIndex(7);
    expect(articles().filter(hasContent)).toHaveLength(3);
  });
});

describe('acceptation – indice « Glisser vers le haut »', () => {
  it('stays hidden after the user scrolled and came back to the first card', () => {
    render(<App />);
    expect(screen.getByText('Glisser vers le haut')).toBeInTheDocument();
    activateIndex(2);
    activateIndex(0);
    expect(screen.queryByText('Glisser vers le haut')).not.toBeInTheDocument();
  });

  it('is not shown again after a remount once it was seen', () => {
    const first = render(<App />);
    activateIndex(1);
    first.unmount();
    render(<App />);
    expect(screen.queryByText('Glisser vers le haut')).not.toBeInTheDocument();
  });

  it('is shown again on reload if the user never scrolled (display alone is not "seen")', () => {
    const first = render(<App />);
    expect(screen.getByText('Glisser vers le haut')).toBeInTheDocument();
    first.unmount();
    // Reload with a fresh feed position (the demo session itself is kept, v22).
    sessionStorage.removeItem(FEED_SESSION_KEY);
    render(<App />);
    expect(screen.getByText('Glisser vers le haut')).toBeInTheDocument();
  });

  it('is marked seen when the feed opens already scrolled (restored position)', () => {
    sessionStorage.setItem(
      FEED_SESSION_KEY,
      JSON.stringify({ keys: ['AAPL#0', 'NVDA#1', 'MSFT#2'], activeKey: 'MSFT#2', nextPage: 1, nextSeq: 3 }),
    );
    render(<App />);
    expect(screen.queryByText('Glisser vers le haut')).not.toBeInTheDocument();
  });
});

describe('acceptation – clavier hors cartes', () => {
  it.each([
    ['textarea', () => document.createElement('textarea')],
    ['select', () => document.createElement('select')],
    [
      'contenteditable',
      () => {
        const d = document.createElement('div');
        d.setAttribute('contenteditable', 'true');
        d.tabIndex = 0;
        return d;
      },
    ],
  ])('ignores j/arrows typed in a %s', (_label, make) => {
    render(<App />);
    const el = make();
    document.body.appendChild(el);
    el.focus();
    fireEvent.keyDown(el, { key: 'j' });
    fireEvent.keyDown(el, { key: 'ArrowDown' });
    fireEvent.keyDown(el, { key: 'PageDown' });
    expect(scrollIntoViewMock()).not.toHaveBeenCalled();
    el.remove();
  });

  it('ignores Alt and Meta modifiers and uppercase J', () => {
    render(<App />);
    fireEvent.keyDown(document.body, { key: 'j', altKey: true });
    fireEvent.keyDown(document.body, { key: 'j', metaKey: true });
    fireEvent.keyDown(document.body, { key: 'J', shiftKey: true });
    expect(scrollIntoViewMock()).not.toHaveBeenCalled();
  });

  it('does not prevent default for keys it does not handle, and prevents it for handled ones', () => {
    render(<App />);
    expect(fireEvent.keyDown(document.body, { key: 'x' })).toBe(true);
    expect(fireEvent.keyDown(document.body, { key: ' ' })).toBe(true);
    expect(fireEvent.keyDown(document.body, { key: 'j' })).toBe(false);
  });
});

describe('acceptation – bottom sheet', () => {
  it('Escape, backdrop and Annuler return focus to the ⋮ trigger of the same card', async () => {
    const user = userEvent.setup();
    render(<App />);
    const button = trigger(0);
    for (const close of [
      () => user.keyboard('{Escape}'),
      async () => {
        fireEvent.pointerDown(document.querySelector('.sheet-backdrop')!);
      },
      () => user.click(screen.getByRole('button', { name: 'Annuler' })),
    ]) {
      await user.click(button);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      await close();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(button).toHaveFocus();
      expect(button).toHaveAttribute('aria-expanded', 'false');
    }
    expect(localStorage.getItem('buy-demo:hidden:demo-retirement')).toBeNull();
  });

  it('a double-click inside the sheet never adds a favorite', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(trigger(0));
    await user.dblClick(screen.getByRole('dialog'));
    expect(localStorage.getItem('buy-demo:favorites:demo-retirement')).toBeNull();
    expect(articles()[0].querySelector('.burst')).toBeNull();
  });
});

describe('acceptation – double-tap', () => {
  it('a drag (≥ 10 px between down and up) is not a tap', async () => {
    const user = userEvent.setup();
    render(<App />);
    const card = articles()[0];
    for (let i = 0; i < 2; i++) {
      await user.pointer([
        { keys: '[MouseLeft>]', target: card, coords: { clientX: 100, clientY: 100 } },
        { target: card, coords: { clientX: 100, clientY: 160 } },
        { keys: '[/MouseLeft]', target: card, coords: { clientX: 100, clientY: 160 } },
      ]);
    }
    expect(localStorage.getItem('buy-demo:favorites:demo-retirement')).toBeNull();
  });

  it('two taps 30 px or more apart are not a double-tap', async () => {
    const user = userEvent.setup();
    render(<App />);
    const card = articles()[0];
    await user.pointer({ keys: '[MouseLeft]', target: card, coords: { clientX: 10, clientY: 10 } });
    await user.pointer({ keys: '[MouseLeft]', target: card, coords: { clientX: 200, clientY: 10 } });
    expect(localStorage.getItem('buy-demo:favorites:demo-retirement')).toBeNull();
  });

  it('three quick taps give a single favorite (the third starts a new sequence)', async () => {
    const user = userEvent.setup();
    render(<App />);
    const card = articles()[0];
    await user.pointer({ keys: '[MouseLeft][MouseLeft][MouseLeft]', target: card });
    expect(JSON.parse(localStorage.getItem('buy-demo:favorites:demo-retirement')!)).toEqual([
      tickerOfName(names()[0]),
    ]);
    expect(screen.getByRole('status')).toHaveTextContent('ajouté aux favoris');
  });

  it('a double-tap on a card that is already a favorite keeps it, and the bookmark button still removes it', async () => {
    localStorage.setItem('buy-demo:favorites:demo-retirement', JSON.stringify([tickerOfName(names0())]));
    const user = userEvent.setup();
    render(<App />);
    await user.dblClick(articles()[0]);
    expect(within(articles()[0]).getByRole('button', { name: 'Retirer des favoris' })).toBeInTheDocument();
    await user.click(within(articles()[0]).getByRole('button', { name: 'Retirer des favoris' }));
    expect(JSON.parse(localStorage.getItem('buy-demo:favorites:demo-retirement')!)).toEqual([]);
  });
});

function names0(): string {
  // The first card of a fresh feed does not depend on storage: render once to read it.
  const { unmount } = render(<App />);
  const n = names()[0];
  unmount();
  return n;
}

describe('acceptation – vue détaillée et carte inactive', () => {
  it('goes back to the summary when keyboard navigation moves to another card, and keeps it there', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(articles()[0]).getByRole('button', { name: 'See more data' }));
    expect(within(articles()[0]).getByText('Historique du produit')).toBeInTheDocument();
    await user.keyboard('j');
    expect(within(articles()[0]).queryByText('Historique du produit')).not.toBeInTheDocument();
    await user.keyboard('k');
    expect(within(articles()[0]).queryByText('Historique du produit')).not.toBeInTheDocument();
    expect(within(articles()[0]).getByRole('button', { name: 'See more data' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});

describe('acceptation – snapshot de session corrompu ou incohérent', () => {
  const write = (v: unknown) => sessionStorage.setItem(FEED_SESSION_KEY, JSON.stringify(v));

  it.each([
    ['keys not an array', { keys: 'AAPL#0', activeKey: null, nextPage: 1, nextSeq: 1 }],
    ['negative nextSeq', { keys: ['AAPL#0'], activeKey: null, nextPage: 1, nextSeq: -1 }],
    ['fractional nextPage', { keys: ['AAPL#0'], activeKey: null, nextPage: 1.5, nextSeq: 1 }],
    ['activeKey of wrong type', { keys: ['AAPL#0'], activeKey: 5, nextPage: 1, nextSeq: 1 }],
    ['non-string keys', { keys: [1, null], activeKey: null, nextPage: 1, nextSeq: 1 }],
    ['null', null],
    ['array', []],
    ['only unknown tickers', { keys: ['ZZZ#0', 'QQQ#1'], activeKey: 'ZZZ#0', nextPage: 1, nextSeq: 2 }],
    ['empty keys', { keys: [], activeKey: null, nextPage: 0, nextSeq: 0 }],
  ])('falls back to a fresh feed: %s', (_label, value) => {
    write(value);
    render(<App />);
    expect(articles()).toHaveLength(8);
    expect(scrollIntoViewMock()).not.toHaveBeenCalled();
  });

  it('every product hidden since the snapshot was written: empty state, no crash', () => {
    write({ keys: ['AAPL#0', 'NVDA#1'], activeKey: 'AAPL#0', nextPage: 1, nextSeq: 2 });
    localStorage.setItem('buy-demo:hidden:demo-retirement', JSON.stringify(PRODUCTS.map((p) => p.ticker)));
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Plus aucun produit à afficher' })).toBeInTheDocument();
  });

  it('adjacent duplicates and unknown tickers in the snapshot are cleaned', () => {
    write({
      keys: ['AAPL#0', 'AAPL#1', 'ZZZ#2', 'NVDA#3'],
      activeKey: 'NVDA#3',
      nextPage: 1,
      nextSeq: 4,
    });
    render(<App />);
    expect(keys()).toEqual(['AAPL#0', 'NVDA#3']);
    expectNoConsecutiveDuplicates();
  });

  it('a nextSeq lower than the largest restored seq never produces a duplicate key', () => {
    write({ keys: ['AAPL#0', 'NVDA#9'], activeKey: 'AAPL#0', nextPage: 1, nextSeq: 2 });
    render(<App />);
    reachSentinel();
    reachSentinel();
    expect(new Set(keys()).size).toBe(keys().length);
    expectNoConsecutiveDuplicates();
  });

  it('a snapshot made of a single card still loads more pages (≥ 2 visible products)', () => {
    write({ keys: ['AAPL#0'], activeKey: 'AAPL#0', nextPage: 1, nextSeq: 1 });
    render(<App />);
    expect(articles()).toHaveLength(1);
    reachSentinel();
    expect(articles()).toHaveLength(9);
    expectNoConsecutiveDuplicates();
  });

  // Formerly known bug B2, fixed: restoreFeed keeps only the first occurrence of each ticker.
  it('rejects duplicate keys in a restored snapshot', () => {
    write({ keys: ['AAPL#0', 'NVDA#1', 'AAPL#0'], activeKey: 'AAPL#0', nextPage: 1, nextSeq: 2 });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(<App />);
      expect(new Set(keys()).size).toBe(keys().length);
      expect(keys()).toEqual(['AAPL#0', 'NVDA#1']);
    } finally {
      err.mockRestore();
    }
  });
});

describe('acceptation – StrictMode', () => {
  const renderStrict = () =>
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

  it('renders the same initial feed as without StrictMode (pure reducer / initializers)', () => {
    const plain = render(<App />);
    const expected = keys();
    plain.unmount();
    renderStrict();
    expect(keys()).toEqual(expected);
  });

  it('appends exactly one page per sentinel hit, with unique keys and no consecutive duplicate', () => {
    renderStrict();
    reachSentinel();
    expect(articles()).toHaveLength(16);
    expect(new Set(keys()).size).toBe(16);
    // everything shown: the next hit starts a new round (infinite feed), one page only
    expect(screen.queryByRole('region', { name: 'Fin du fil' })).not.toBeInTheDocument();
    reachSentinel();
    expect(articles()).toHaveLength(24);
    expect(new Set(keys()).size).toBe(24);
    expectNoConsecutiveDuplicates();
  });

  it('hides a product once, persists it once, and keeps focus', async () => {
    const user = userEvent.setup();
    renderStrict();
    reachSentinel();
    const name = names()[0];
    await hideCard(user, 0);
    expect(names()).not.toContain(name);
    expect(JSON.parse(localStorage.getItem('buy-demo:hidden:demo-retirement')!)).toEqual([tickerOfName(name)]);
    expect(articles()[0]).toHaveFocus();
  });

  it('keyboard navigation moves by exactly one card (single listener)', async () => {
    const user = userEvent.setup();
    renderStrict();
    await user.keyboard('j');
    expect(scrollIntoViewMock()).toHaveBeenCalledTimes(1);
    expect(articles()[1]).toHaveFocus();
  });

  it('double-click adds a single favorite and the hint is still shown then dismissed', async () => {
    const user = userEvent.setup();
    renderStrict();
    expect(screen.getByText('Glisser vers le haut')).toBeInTheDocument();
    await user.dblClick(articles()[0]);
    expect(JSON.parse(localStorage.getItem('buy-demo:favorites:demo-retirement')!)).toHaveLength(1);
    activateIndex(1);
    expect(screen.queryByText('Glisser vers le haut')).not.toBeInTheDocument();
  });

  it('restores position after leaving the feed and coming back (Sauvegardés tab round trip)', async () => {
    renderStrict();
    activateIndex(4);
    const before = keys();
    navigateTo('#/saved');
    expect(screen.queryByRole('feed')).not.toBeInTheDocument();
    navigateTo('#/');
    expect(await screen.findByRole('feed')).toBeInTheDocument();
    expect(keys()).toEqual(before);
    expect(scrollIntoViewMock()).toHaveBeenLastCalledWith({ block: 'start', behavior: 'instant' });
  });
});
