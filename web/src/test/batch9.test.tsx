import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardDetails } from '../components/CardDetails';
import { OutlookChart, formatMonths } from '../components/OutlookChart';
import { ProfileRefProvider } from '../hooks/useProfileId';
import { cardToProduct } from '../lib/catalog';
import { setDisplayCurrency } from '../lib/format';
import type { CardDetail } from '../lib/api';
import { card, detail } from './backendFixtures';

let original: typeof fetch;
let handler: (url: string) => unknown;
const urls: string[] = [];
beforeEach(() => {
  vi.stubEnv('VITE_USE_API', 'true');
  original = globalThis.fetch;
  urls.length = 0;
  globalThis.fetch = vi.fn(async (u: RequestInfo | URL) => {
    urls.push(String(u));
    return new Response(JSON.stringify(handler(String(u))), { status: 200 });
  }) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = original;
  vi.unstubAllEnvs();
  setDisplayCurrency('USD');
});

const withSens = (d: CardDetail): CardDetail => {
  const grid = [];
  for (const shrink of [0.5, 0.75, 1])
    for (const erp of [0.03, 0.05, 0.07])
      grid.push({ shrink, erp, central_annual: Math.round((0.01 + shrink * 0.02 + erp * 0.8) * 1e4) / 1e4 });
  // base pair = (0.75, 0.05): equal to the central scenario annual rate
  d.outlook.scenarios.central.annual = grid.find((g) => g.shrink === 0.75 && g.erp === 0.05)!.central_annual;
  d.outlook.sensitivity = grid;
  d.impact = {
    weight: 0.05,
    fit: { verdict: 'compatible', label: 'ok', max_weight_within_profile: 0.12 },
    before: { vol: 0.1, max_drawdown: -0.2 },
    after: { vol: 0.11, max_drawdown: -0.22 },
    notes: ['Poids de 5 %.'],
  };
  return d;
};

const renderDetails = (d: CardDetail, q = 10) => {
  handler = () => d;
  return render(
    <ProfileRefProvider value={{ profileId: 'p1', persona: 'amira' }}>
      <CardDetails product={cardToProduct(card('AAA'))} quantity={q} onQuantityChange={() => {}} />
    </ProfileRefProvider>,
  );
};

describe('interactive outlook chart', () => {
  it('formats months', () => {
    expect(formatMonths(0)).toBe('aujourd’hui');
    expect(formatMonths(27)).toBe('2 ans 3 mois');
    expect(formatMonths(12)).toBe('1 an');
  });

  it('arrow keys scrub the chart and the readout lists the three scenarios of that month', async () => {
    const user = userEvent.setup();
    render(<OutlookChart outlook={detail('AAA', 10).outlook} />);
    expect(screen.queryByTestId('scrub-cursor')).not.toBeInTheDocument();
    screen.getByTestId('outlook-svg').focus();
    await user.keyboard('{End}');
    const readout = screen.getByTestId('scrub-readout');
    expect(readout).toHaveTextContent('5 ans');
    expect(readout).toHaveTextContent(/Favorable/);
    expect(readout).toHaveTextContent(/Central/);
    expect(readout).toHaveTextContent(/Défavorable/);
    await user.keyboard('{PageDown}');
    expect(readout).toHaveTextContent('4 ans');
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('scrub-cursor')).not.toBeInTheDocument();
  });

  it('toggles scenarios but always keeps at least two visible (never the central alone)', async () => {
    const user = userEvent.setup();
    const { container } = render(<OutlookChart outlook={detail('AAA', 10).outlook} />);
    const line = (k: string) => container.querySelector<SVGPolylineElement>(`polyline[data-scenario="${k}"]`)!;
    const btn = (k: string) => within(screen.getByTestId(`scenario-${k}`)).getByRole('button');
    await user.click(btn('best'));
    expect(line('best').style.display).toBe('none');
    expect(btn('best')).toHaveAttribute('aria-pressed', 'false');
    // a second hide is refused: the central scenario must never stay alone
    await user.click(btn('worst'));
    expect(line('worst').style.display).not.toBe('none');
    await user.click(btn('best'));
    expect(line('best').style.display).not.toBe('none');
  });

});

describe('sensitivity control', () => {
  it('switching the assumptions shows the API central rate (no path drawn in the UI); base restores', async () => {
    const user = userEvent.setup();
    renderDetails(withSens(detail('AAA', 10)));
    const ctl = await screen.findByTestId('sensitivity-control');
    expect(within(ctl).getByTestId('sensitivity-result')).toHaveTextContent('hypothèses de base');
    expect(screen.queryByTestId('alt-central-line')).not.toBeInTheDocument();
    await user.click(within(ctl).getByRole('button', { name: '7 %' }));
    expect(within(ctl).getByTestId('sensitivity-result')).toHaveTextContent('point par rapport à la base');
    expect(screen.queryByTestId('alt-central-line')).not.toBeInTheDocument();
    // the favourable and unfavourable scenarios stay on screen
    expect(screen.getByTestId('scenario-best')).toBeInTheDocument();
    expect(screen.getByTestId('scenario-worst')).toBeInTheDocument();
    await user.click(within(ctl).getByRole('button', { name: 'Revenir aux hypothèses de base' }));
    expect(screen.queryByTestId('alt-central-line')).not.toBeInTheDocument();
  });

  it('renders nothing when the API sends no sensitivity grid', async () => {
    renderDetails(detail('AAA', 10));
    await screen.findByTestId('scenario-best');
    expect(screen.queryByTestId('sensitivity-control')).not.toBeInTheDocument();
  });
});

describe('weight slider', () => {
  it('asks the API for the chosen weight and shows before/after volatility and the verdict', async () => {
    const d = withSens(detail('AAA', 10));
    renderDetails(d);
    const box = await screen.findByTestId('impact-slider');
    expect(within(box).getByTestId('impact-grid')).toHaveTextContent('10,0 % → 11,0 %');
    expect(box).toHaveTextContent('Compatible');
    expect(box).toHaveTextContent('maximum dans votre profil : 12 %');
    const slider = within(box).getByRole('slider');
    fireEvent.change(slider, { target: { value: '3' } }); // 10 %
    fireEvent.blur(slider);
    await waitFor(() => expect(urls.some((u) => u.includes('weight=0.1'))).toBe(true));
    expect(box).toHaveTextContent('Si j’achetais 10 % du portefeuille');
  });
});

describe('pipeline timeline', () => {
  it('shows six steps in order, each expandable, with the trace entries returned by the API', async () => {
    const user = userEvent.setup();
    const d = detail('AAA', 10);
    d.pipeline.trace = [
      { agent: 'data_collector', step: 'fetch', tool: 'data_collector.fetch_starter', inputs: { ticker: 'AAA' }, outputs: { n_obs: 1282 }, ms: 12 },
      { agent: 'predictor', step: 'outlook', tool: 'predictor.outlook', inputs: { n_sims: 2000, seed: 7 }, outputs: {}, ms: 40 },
    ];
    renderDetails(d);
    const panel = await screen.findByTestId('pipeline-panel');
    await user.click(within(panel).getByText('Comment ces chiffres ont été obtenus'));
    const ids = Array.from(panel.querySelectorAll('[data-testid^="step-"]')).map((e) => e.getAttribute('data-testid'));
    expect(ids).toEqual(['step-finder', 'step-collector', 'step-checker', 'step-predictor', 'step-explainer', 'step-governance']);
    const predictor = within(panel).getByTestId('step-predictor');
    const head = within(predictor).getAllByRole('button')[0];
    expect(head).toHaveAttribute('aria-expanded', 'false');
    await user.click(head);
    expect(head).toHaveAttribute('aria-expanded', 'true');
    expect(predictor).toHaveTextContent('predictor.outlook');
    expect(predictor).toHaveTextContent('n_sims');
    expect(predictor).toHaveTextContent('2000');
    expect(predictor).toHaveTextContent('40 ms');
    expect(within(panel).getByTestId('step-governance')).toHaveTextContent('conforme');
    await user.click(within(panel).getByRole('button', { name: 'Tout déplier' }));
    expect(within(panel).getByRole('button', { name: 'Tout replier' })).toBeInTheDocument();
    expect(within(panel).getByTestId('step-collector')).toHaveTextContent('data_collector.fetch_starter');
  });

  it('marks a failed fact-check step with a warning', async () => {
    renderDetails(detail('AAA', 10)); // fixture has one failed check
    const panel = await screen.findByTestId('pipeline-panel');
    expect(within(panel).getByTestId('step-checker')).toHaveClass('tl__step--warn');
    expect(within(panel).getByTestId('step-checker')).toHaveTextContent('1 / 2 vérifications passées');
  });
});
