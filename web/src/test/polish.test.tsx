import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CardDetails } from '../components/CardDetails';
import { CardSummary } from '../components/CardSummary';
import { ActionRail } from '../components/ActionRail';
import { ProfileRefProvider } from '../hooks/useProfileId';
import { cardToProduct } from '../lib/catalog';
import { setDisplayCurrency } from '../lib/format';
import { card, detail, installBackend } from './backendFixtures';

let restore = () => {};
beforeEach(() => vi.stubEnv('VITE_USE_API', 'true'));
afterEach(() => {
  restore();
  vi.unstubAllEnvs();
  setDisplayCurrency('USD');
});

const details = (negative: boolean) => {
  const f = installBackend();
  restore = f.restore;
  if (negative) {
    const orig = globalThis.fetch;
    globalThis.fetch = (async (u: RequestInfo | URL, i?: RequestInit) => {
      if (!String(u).startsWith('/api/card/')) return orig(u, i);
      const d = detail('AAA', 1);
      d.outlook.scenarios.central.annual = -0.03;
      return new Response(JSON.stringify(d), { status: 200 });
    }) as typeof fetch;
  }
  render(
    <ProfileRefProvider value={{ profileId: 'p1' }}>
      <CardDetails product={cardToProduct(card('AAA'))} quantity={10} onQuantityChange={() => {}} />
    </ProfileRefProvider>,
  );
};

describe('UI polish batch 2', () => {
  it('the summary lists every reason (they fill the card; the overflow is cut on screen); "Voir plus" lists them all', async () => {
    const p = cardToProduct(card('AAA'));
    const { container, unmount } = render(<CardSummary product={p} />);
    expect(container.querySelectorAll('ul.reasons--fit li')).toHaveLength(3);
    expect(screen.getByText('Raison 3 issue du code')).toBeInTheDocument();
    restore = () => {};
    unmount(); // the details below list the reasons again
    details(false);
    expect(await screen.findByText('Raison 3 issue du code')).toBeInTheDocument();
  });

  it('explains volatility drag only when the central scenario is negative', async () => {
    details(true);
    expect(await screen.findByTestId('vol-drag-note')).toHaveTextContent('la valeur médiane peut baisser même si la moyenne monte');
  });

  it('no volatility note for a positive central scenario; beta and sensitivity are shown', async () => {
    details(false);
    await screen.findByTestId('scenario-best');
    expect(screen.queryByTestId('vol-drag-note')).toBeNull();
    expect(screen.getByText(/Bêta vs SPY : 2,10/)).toBeInTheDocument();
    expect(screen.getByTestId('sensitivity')).toBeInTheDocument();
  });

  it('the action rail (favori, notes, menu) is rendered for a real card', () => {
    render(<ActionRail product={cardToProduct(card('AAA'))} expanded={false} isFavorite={false} onToggleFavorite={() => {}} onBuy={() => {}} onHide={() => {}} />);
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(2); // bookmark and menu (ratings need their provider)
  });
});
