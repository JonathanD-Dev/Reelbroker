import { vi } from 'vitest';
import type { ApiCard, CardDetail, Question } from '../lib/api';
import { resetSnapshotCache } from '../lib/api';

/** Minimal backend answers (shape of docs/api-contract.md) and a fetch mock that never reaches the network. */
export const card = (ticker: string, verdict: ApiCard['fit']['verdict'] = 'compatible'): ApiCard => ({
  ticker,
  name: `${ticker} Corp`,
  sector: 'Technologie',
  asset_class: 'equity',
  currency: 'CAD',
  price: 100,
  as_of: '2026-11-12',
  brandColor: '#28ada0',
  fit: {
    verdict,
    label: verdict === 'compatible' ? 'Compatible avec le profil déclaré' : verdict === 'tension' ? 'Tensions avec le profil' : 'En conflit avec le profil',
    weight: 0.05,
  },
  reasons: ['Raison 1 issue du code', 'Raison 2 issue du code', 'Raison 3 issue du code'],
  history: [
    { title: 'Cours (12 mois)', points: [{ label: '2025-11-12', value: 90 }, { label: '2026-11-12', value: 100 }] },
    { title: 'Valeur de 10 000 $ sur 5 ans', points: [{ label: '2021-11-12', value: 10000 }, { label: '2026-11-12', value: 15000 }] },
  ],
  stats: { cagr: 0.0842, vol: 0.2, max_drawdown: -0.35, sharpe: 0.3, worst_1y: -0.2, window: ['2021-11-12', '2026-11-12'] },
  tags: [],
  source: 'alphaforge_starter (Yahoo Finance adj_close, BoC FX)',
});

const path = (k: number, quantity: number) =>
  Array.from({ length: 61 }, (_, m) => ({ month: m, value: Math.round(100 * quantity * Math.pow(1 + k, m / 12) * 100) / 100 }));

export const detail = (ticker: string, quantity = 10): CardDetail => ({
  card: card(ticker),
  impact: { weight: 0.05, notes: ['Poids de 5 % dans le portefeuille simulé.'] },
  outlook: {
    horizon_years: 5,
    start_value: 100 * quantity,
    quantity,
    currency: 'CAD',
    scenarios: {
      best: { label: 'Scénario favorable', annual: 0.24, final: 100 * quantity * 3, path: path(0.24, quantity) },
      central: { label: 'Notre scénario central', annual: 0.06, final: 100 * quantity * 1.5, path: path(0.06, quantity) },
      worst: { label: 'Scénario défavorable', annual: -0.1, final: 100 * quantity * 0.5, path: path(-0.1, quantity) },
    },
    share_below_start: 0.31,
    method: 'Simulation de 5 ans par rééchantillonnage des rendements.',
    assumptions: ['Rendement ramené vers une prime de risque de 5 %.'],
    limits: ['Le passé ne garantit pas le futur.'],
    disclaimer: 'Scénarios hypothétiques, pas une prévision ni un conseil financier. Les rendements passés ne garantissent pas les rendements futurs.',
    history: { beta: 2.1, beta_proxy: 'SPY' },
    sensitivity_summary: 'Le scénario central varie de 3,0 % à 8,9 % par an selon les hypothèses.',
  },
  pipeline: {
    sources: [
      { id: 'starter', name: 'Données de départ du datathon', url: 'https://finance.yahoo.com', kind: 'prices', as_of: '2026-11-12', chosen_because: 'Univers de départ documenté.' },
    ],
    fact_check: {
      passed: false,
      checks: [
        { name: 'source_dans_registre', ok: true, detail: 'starter figure dans le registre des sources' },
        { name: 'aucun_prix_non_positif', ok: false, detail: '1 prix nul' },
      ],
    },
    data: { source_id: 'starter', currency: 'CAD', start: '2021-11-12', end: '2026-11-12', n_obs: 1282, missing_days: 23, notes: ['Cours ajustés (adj_close) convertis en CAD.'] },
    explanation: { mode: 'offline', short: 'Trois scénarios hypothétiques sur 5 ans.', long: 'Explication longue déterministe.', governance: { passed: true, issues: [] } },
  },
});

export const QUESTION_C1: Question = {
  id: 'C1',
  level: 'compte',
  type: 'single',
  element: 'Type de revenu et stabilité',
  text: 'Question venue du serveur : votre source de revenu ?',
  choices: [
    { code: 'permanent', label: 'Emploi permanent' },
    { code: 'unknown', label: 'Je ne sais pas' },
  ],
};

export interface BackendOptions {
  /** Makes every /api call fail (server down). */
  down?: boolean;
  /** Content of /snapshot.json (404 when undefined). */
  snapshot?: unknown;
  cards?: ApiCard[];
}

/** Installs a fetch mock; returns it (calls are inspectable) and a restore function. */
export function installBackend(opts: BackendOptions = {}) {
  resetSnapshotCache();
  const original = globalThis.fetch;
  const cards = opts.cards ?? [card('AAA'), card('BBB', 'tension'), card('CCC', 'conflict')];
  const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
  const mock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('/snapshot.json')) return opts.snapshot ? json(opts.snapshot) : json({}, 404);
    if (opts.down) return Promise.reject(new TypeError('Failed to fetch'));
    if (url.startsWith('/api/feed')) return json({ items: cards, state: { liked: [], disliked: [], neutral: [], hidden: [], saved: [] } });
    const m = /^\/api\/card\/([^?]+)/.exec(url);
    if (m) return json(detail(decodeURIComponent(m[1]), Number(/quantity=(\d+)/.exec(url)?.[1] ?? 10)));
    if (url.startsWith('/api/questionnaire/next')) {
      const answers = JSON.parse(decodeURIComponent(/answers=([^&]*)/.exec(url)![1]));
      return json('C1' in answers ? { done: true } : { done: false, question: QUESTION_C1 });
    }
    if (url.startsWith('/api/profile') && init?.method === 'POST') {
      return json({ profile_id: 'pid-1', name: 'x', profile: { level: 2, horizon_years: 4, objective: 'preserve' }, reasoning: [] });
    }
    return json({}, 404);
  });
  globalThis.fetch = mock as unknown as typeof fetch;
  return { fetch: mock, restore: () => (globalThis.fetch = original) };
}
