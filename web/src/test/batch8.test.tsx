import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardDetails } from '../components/CardDetails';
import { HypothesesButton } from '../components/Hypotheses';
import { IdeaCheck } from '../components/IdeaCheck';
import { LearnBlock } from '../components/LearnBlock';
import { QuestionFlow } from '../components/QuestionFlow';
import { AccountProvider } from '../hooks/useAccount';
import type { AccountApi } from '../hooks/useAccount';
import { useBackendReactions } from '../hooks/useBackendReactions';
import { ProfileRefProvider } from '../hooks/useProfileId';
import { demoAccount, portfolioValue } from '../lib/account';
import { readAccountProfile, syncProfiles, writeAccountProfile } from '../lib/apiProfile';
import { cardToProduct } from '../lib/catalog';
import { setDisplayCurrency } from '../lib/format';
import { card, detail } from './backendFixtures';

let original: typeof fetch;
let handler: (url: string, body: Record<string, unknown> | null) => unknown;
const calls = () => (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit?][];
const bodies = () => calls().filter(([, i]) => i?.body).map(([u, i]) => [u, JSON.parse(String(i!.body))] as [string, Record<string, unknown>]);
beforeEach(() => {
  vi.stubEnv('VITE_USE_API', 'true');
  original = globalThis.fetch;
  globalThis.fetch = vi.fn(async (u: RequestInfo | URL, i?: RequestInit) => {
    const out = handler(String(u), i?.body ? JSON.parse(String(i.body)) : null);
    if (out instanceof Error) throw out;
    return new Response(JSON.stringify(out), { status: 200 });
  }) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = original;
  vi.unstubAllEnvs();
  setDisplayCurrency('USD');
  localStorage.clear();
});
const withProfile = (ui: React.ReactNode) => <ProfileRefProvider value={{ profileId: 'robert' }}>{ui}</ProfileRefProvider>;
const learn = (n: number) => ({ declared: 2, retained_level: 2, revealed: { established: false, level: null, n, needed: 3 }, status: 'insufficient', messages: [], update_to: null, retained_if_updated: null });
const CHECK = { ok: true, ticker: 'TSLA', name: 'Tesla', weight: 0.2, verdict: 'conflict', verdict_label: 'En conflit avec le profil déclaré', checks: [], max_weight_within_profile: 0.05, explanation: { mode: 'offline', short: 'x', governance: { passed: true } } };

describe('batch 8', () => {
  it('back keeps the previous choice preselected', async () => {
    const user = userEvent.setup();
    handler = () => new Error('down'); // static questions
    render(<QuestionFlow scope="account" title="Créer un compte" onExit={() => {}} onFinish={() => {}} />);
    await user.click(await screen.findByLabelText('Emploi permanent, revenu régulier'));
    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    await screen.findByLabelText('Plus de 6 mois');
    await user.click(screen.getByRole('button', { name: 'Question précédente' }));
    expect(await screen.findByLabelText('Emploi permanent, revenu régulier')).toBeChecked();
  });

  it('a choice is recorded with record_only + decision_id, refreshes the learn block, and re-clicking after a failure reuses the id', async () => {
    const user = userEvent.setup();
    let failNext = true;
    let n = 0;
    handler = (url, body) => {
      if (url.includes('/learn')) return learn(n);
      if (body?.record_only) {
        if (failNext) {
          failNext = false;
          return new Error('boom');
        }
        n = 1;
        return { recorded: true, learn: learn(1) };
      }
      return CHECK;
    };
    render(withProfile(<><LearnBlock /><IdeaCheck /></>));
    expect(await screen.findByTestId('learn-insufficient')).toHaveTextContent('0 / 3');
    await user.type(screen.getByLabelText('Votre idée, avec vos mots'), '20 % tesla');
    await user.click(screen.getByRole('button', { name: 'Vérifier cette idée' }));
    await user.click(await screen.findByRole('button', { name: 'J’abandonne' }));
    expect(await screen.findByText(/n’a pas pu être enregistré/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'J’abandonne' }));
    await waitFor(() => expect(screen.getByTestId('learn-insufficient')).toHaveTextContent('1 / 3'));
    const rec = bodies().filter(([, b]) => b.record_only);
    expect(rec).toHaveLength(2);
    expect(rec[0][1].decision_id).toBe(rec[1][1].decision_id);
    expect(bodies().filter(([, b]) => !b.record_only && b.text)).toHaveLength(1); // the 17 s check ran once
  });

  it('syncProfiles re-posts the saved answers of an account created offline', async () => {
    writeAccountProfile('acc-1', { profileId: null, answers: { C1: 'permanent' } });
    handler = () => ({ profile_id: 'pid-9', profile: { level: 3 } });
    expect(await syncProfiles('acc-1', 'Zoé', [])).toBe(true);
    expect(readAccountProfile('acc-1')?.profileId).toBe('pid-9');
    expect(bodies()[0][1]).toEqual({ answers: { C1: 'permanent' }, name: 'Zoé' });
    expect(await syncProfiles('acc-1', 'Zoé', [])).toBe(false); // nothing left to sync
  });

  it('the card impact weight is quantity x price / portfolio value', async () => {
    const acc = demoAccount();
    const active = acc.portfolios[0];
    const api = { account: acc, active } as unknown as AccountApi;
    handler = () => detail('AAA', 1);
    render(
      <AccountProvider value={api}>
        {withProfile(<CardDetails product={cardToProduct(card('AAA'))} quantity={10} onQuantityChange={() => {}} />)}
      </AccountProvider>,
    );
    await screen.findByTestId('scenario-best');
    const url = calls().map(([u]) => u).find((u) => u.startsWith('/api/card/'))!;
    expect(Number(/weight=([\d.]+)/.exec(url)![1])).toBeCloseTo(1000 / portfolioValue(active), 6);
  });

  it('without a portfolio value the impact is labelled as a 5 % hypothesis', async () => {
    handler = () => detail('AAA', 1);
    render(withProfile(<CardDetails product={cardToProduct(card('AAA'))} quantity={10} onQuantityChange={() => {}} />));
    expect(await screen.findByText(/\(hypothèse : 5 %\)/)).toBeInTheDocument();
    expect(calls().map(([u]) => u).find((u) => u.startsWith('/api/card/'))).not.toContain('weight=');
  });

  it('gestures are mirrored to /api/feed/react (save, hide, like, undo), never on mount', async () => {
    handler = () => ({ state: {} });
    type P = { saved: string[]; hidden: string[]; ratings: Record<string, 'up' | 'down'> };
    const { rerender } = renderHook((p: P) => useBackendReactions('robert', 'pf1', p.saved, p.hidden, p.ratings), {
      initialProps: { saved: [], hidden: [], ratings: {} } as P,
    });
    expect(calls()).toHaveLength(0);
    rerender({ saved: ['AAA'], hidden: [], ratings: {} });
    rerender({ saved: ['AAA'], hidden: ['BBB'], ratings: { CCC: 'up' } });
    rerender({ saved: [], hidden: ['BBB'], ratings: { CCC: 'down' } });
    rerender({ saved: [], hidden: [], ratings: {} });
    await waitFor(() => expect(calls().length).toBeGreaterThanOrEqual(7));
    expect(bodies().map(([, b]) => `${b.ticker}:${b.action}`)).toEqual(['AAA:save', 'BBB:hide', 'CCC:like', 'AAA:unsave', 'CCC:dislike', 'BBB:unhide', 'CCC:neutral']);
    expect(calls()[0][0]).toBe('/api/feed/react');
  });

  it('a bottom sheet focuses its first enabled control and gives the focus back on close', async () => {
    const user = userEvent.setup();
    render(<HypothesesButton />);
    const trigger = screen.getByRole('button', { name: 'Toutes nos hypothèses' });
    await user.click(trigger);
    expect(screen.getByRole('button', { name: 'Fermer' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
