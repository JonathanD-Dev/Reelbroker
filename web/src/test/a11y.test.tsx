import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, renderHook, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { OverflowMenu } from '../components/OverflowMenu';
import { QuantityInput } from '../components/QuantityInput';
import { usePersistentSet } from '../hooks/usePersistentSet';
import { PRODUCTS } from '../data/products';
import { articles, names } from './feedTestUtils';

const trigger = () => screen.getByRole('button', { name: "Plus d'actions" });
const items = () => screen.getAllByRole('menuitem');

function setup() {
  const onBuyNow = vi.fn();
  const onHide = vi.fn();
  const user = userEvent.setup();
  render(
    <div>
      <button type="button">before</button>
      <div className="feed" data-testid="feed">
        <OverflowMenu productName="Apple" onBuyNow={onBuyNow} onHide={onHide} />
      </div>
      <button type="button">after</button>
      <p data-testid="outside">outside</p>
    </div>,
  );
  return { user, onBuyNow, onHide };
}

describe('OverflowMenu (bottom sheet) – clavier et focus', () => {
  it('exposes closed state on the trigger', () => {
    setup();
    expect(trigger()).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens a modal dialog labelled with the product name and focuses the first item', async () => {
    const { user } = setup();
    await user.click(trigger());
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Actions pour Apple');
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(items()).toHaveLength(2);
    expect(items()[0]).toHaveFocus();
  });

  it('opens with Enter from the keyboard and focuses the first item', async () => {
    const { user } = setup();
    trigger().focus();
    await user.keyboard('{Enter}');
    expect(items()[0]).toHaveFocus();
  });

  it('ArrowDown moves to next item and wraps to the first', async () => {
    const { user } = setup();
    await user.click(trigger());
    await user.keyboard('{ArrowDown}');
    expect(items()[1]).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(items()[0]).toHaveFocus();
  });

  it('ArrowUp moves to previous item and wraps to the last', async () => {
    const { user } = setup();
    await user.click(trigger());
    await user.keyboard('{ArrowUp}');
    expect(items()[1]).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(items()[0]).toHaveFocus();
  });

  it('End goes to the last item and Home to the first', async () => {
    const { user } = setup();
    await user.click(trigger());
    await user.keyboard('{End}');
    expect(items()[1]).toHaveFocus();
    await user.keyboard('{Home}');
    expect(items()[0]).toHaveFocus();
  });

  it('prevents default scrolling on arrow/Home/End keys', async () => {
    const { user } = setup();
    await user.click(trigger());
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
      const notCancelled = fireEvent.keyDown(document.activeElement as Element, { key });
      expect(notCancelled, key).toBe(false);
    }
  });

  it('Escape closes the sheet and returns focus to the trigger', async () => {
    const { user } = setup();
    await user.click(trigger());
    await user.keyboard('{ArrowDown}{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(trigger()).toHaveFocus();
  });

  it('Tab and Shift+Tab loop over Buy now, Don\'t show me again and Annuler (focus trap)', async () => {
    const { user } = setup();
    const cancel = () => screen.getByRole('button', { name: 'Annuler' });
    await user.click(trigger());
    expect(items()[0]).toHaveFocus();
    await user.tab();
    expect(items()[1]).toHaveFocus();
    await user.tab();
    expect(cancel()).toHaveFocus();
    await user.tab();
    expect(items()[0]).toHaveFocus();
    await user.tab({ shift: true });
    expect(cancel()).toHaveFocus();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('Tab keydown is default-prevented so focus never leaves the sheet', async () => {
    const { user } = setup();
    await user.click(trigger());
    expect(fireEvent.keyDown(items()[0], { key: 'Tab' })).toBe(false);
  });

  it('closes on backdrop pointerdown and returns focus to the trigger', async () => {
    const { user } = setup();
    await user.click(trigger());
    fireEvent.pointerDown(screen.getByRole('dialog'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.pointerDown(document.querySelector('.sheet-backdrop')!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it('closes with the Annuler button without calling any action', async () => {
    const { user, onBuyNow, onHide } = setup();
    await user.click(trigger());
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onBuyNow).not.toHaveBeenCalled();
    expect(onHide).not.toHaveBeenCalled();
    expect(trigger()).toHaveFocus();
  });

  it('selecting an item closes the sheet and calls its action once', async () => {
    const { user, onBuyNow, onHide } = setup();
    await user.click(trigger());
    await user.click(screen.getByRole('menuitem', { name: /Simuler l’achat/ }));
    expect(onBuyNow).toHaveBeenCalledTimes(1);
    expect(onHide).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Enter on the focused first item triggers Buy now', async () => {
    const { user, onBuyNow } = setup();
    await user.click(trigger());
    await user.keyboard('{Enter}');
    expect(onBuyNow).toHaveBeenCalledTimes(1);
  });

  it('removes document listeners after closing (Escape no longer steals focus)', async () => {
    const { user } = setup();
    await user.click(trigger());
    await user.keyboard('{Escape}');
    screen.getByRole('button', { name: 'after' }).focus();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus();
  });

  it('marks the feed as inert only while the sheet is open', async () => {
    const { user } = setup();
    const feed = screen.getByTestId('feed');
    await user.click(trigger());
    expect(feed).toHaveAttribute('inert');
    await user.keyboard('{Escape}');
    expect(feed).not.toHaveAttribute('inert');
  });
});

describe('FeedPage – titre et focus après masquage', () => {
  it('has a single level-1 heading "Fil d\'analyse" with sr-only class', () => {
    render(<App />);
    const h1s = screen.getAllByRole('heading', { level: 1 });
    const h = h1s.find((e) => e.textContent === "Fil d'analyse");
    expect(h).toBeDefined();
    expect(h).toHaveClass('sr-only');
  });

  it('exposes a labelled feed whose articles have position and unknown set size', () => {
    render(<App />);
    expect(screen.getByRole('feed', { name: "Fil d'analyse" })).toBeInTheDocument();
    articles().forEach((a, i) => {
      expect(a).toHaveAttribute('aria-label');
      expect(a).toHaveAttribute('aria-posinset', String(i + 1));
      expect(a).toHaveAttribute('aria-setsize', '-1');
      expect(a).toHaveAttribute('tabindex', '-1');
    });
  });

  it('no longer makes <main> programmatically focusable', () => {
    render(<App />);
    expect(screen.getByRole('main')).not.toHaveAttribute('tabindex');
  });

  it('moves focus to the article that takes the place of the hidden one', async () => {
    const user = userEvent.setup();
    render(<App />);
    const hiddenName = names()[0];
    await user.click(within(articles()[0]).getByRole('button', { name: "Plus d'actions" }));
    await user.click(screen.getByRole('menuitem', { name: /Don't show me again/ }));
    expect(names()).not.toContain(hiddenName);
    expect(articles()[0]).toHaveFocus();
    expect(document.body).not.toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent(`${hiddenName} masqué.`);
  });

  it('keeps focus on an article after hiding via keyboard only', async () => {
    const user = userEvent.setup();
    render(<App />);
    within(articles()[0]).getByRole('button', { name: "Plus d'actions" }).focus();
    await user.keyboard('{Enter}{ArrowDown}{Enter}');
    expect(articles()[0]).toHaveFocus();
  });

  it('moves focus to the empty-state heading when hiding the last remaining product', async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      'buy-demo:hidden:demo-retirement',
      JSON.stringify(PRODUCTS.slice(1).map((p) => p.ticker)),
    );
    render(<App />);
    expect(articles()).toHaveLength(1);
    await user.click(trigger());
    await user.click(screen.getByRole('menuitem', { name: /Don't show me again/ }));
    expect(screen.getByRole('heading', { name: 'Plus aucun produit à afficher' })).toHaveFocus();
  });
});

describe('usePersistentSet – écriture via useEffect', () => {
  it('does not write to storage on mount', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    renderHook(() => usePersistentSet('k'));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('persists after add, toggle and clear', () => {
    const { result } = renderHook(() => usePersistentSet('k'));
    act(() => result.current.add('A'));
    expect(JSON.parse(localStorage.getItem('k')!)).toEqual(['A']);
    act(() => result.current.toggle('B'));
    expect(JSON.parse(localStorage.getItem('k')!)).toEqual(['A', 'B']);
    act(() => result.current.toggle('A'));
    expect(JSON.parse(localStorage.getItem('k')!)).toEqual(['B']);
    act(() => result.current.clear());
    expect(JSON.parse(localStorage.getItem('k')!)).toEqual([]);
    expect(result.current.has('B')).toBe(false);
  });

  it('adding an existing item does not rewrite storage', () => {
    localStorage.setItem('k', JSON.stringify(['A']));
    const { result } = renderHook(() => usePersistentSet('k'));
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    act(() => result.current.add('A'));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('writes once per change even in StrictMode-like double updates', () => {
    const { result } = renderHook(() => usePersistentSet('k'));
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    act(() => {
      result.current.add('A');
      result.current.add('B');
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem('k')!)).toEqual(['A', 'B']);
    spy.mockRestore();
  });

  it('reads initial state from storage and keeps has() stable semantic', () => {
    localStorage.setItem('k', JSON.stringify(['X']));
    const { result } = renderHook(() => usePersistentSet('k'));
    expect(result.current.has('X')).toBe(true);
    expect(result.current.has('Y')).toBe(false);
  });
});

describe('QuantityInput – useId', () => {
  it('associates the label with its input', () => {
    render(<QuantityInput value={10} onChange={() => {}} />);
    const input = screen.getByLabelText('Si j’achetais');
    expect(input).toHaveValue(10);
    expect(input.id).not.toBe('');
  });

  it('gives distinct ids to several instances and each label targets its own input', () => {
    render(
      <>
        <QuantityInput value={1} onChange={() => {}} />
        <QuantityInput value={2} onChange={() => {}} />
      </>,
    );
    const inputs = screen.getAllByLabelText('Si j’achetais');
    expect(inputs).toHaveLength(2);
    expect(inputs[0].id).not.toBe(inputs[1].id);
    expect(inputs[0]).toHaveValue(1);
    expect(inputs[1]).toHaveValue(2);
  });
});
