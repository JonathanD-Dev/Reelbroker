import type { Product, Series } from '../types';
import { generateSeries, hashString } from './generateSeries';

type Trend = 'up' | 'down' | 'flat';

const DRIFT: Record<Trend, number> = { up: 0.3, down: -0.15, flat: 0 };
const VOLATILITY: Record<Trend, number> = { up: 0.03, down: 0.03, flat: 0.02 };

function build(
  ticker: string,
  price: number,
  trends: [Trend, Trend],
): [Series, Series] {
  const make = (index: 0 | 1): Series => {
    const trend = trends[index];
    const drift = DRIFT[trend];
    return generateSeries({
      seed: hashString(ticker + index),
      start: index === 0 ? price / (1 + drift) : 100,
      drift,
      volatility: VOLATILITY[trend],
      title: index === 0 ? 'Cours (12 mois)' : 'Volume relatif (12 mois)',
    });
  };
  return [make(0), make(1)];
}

/**
 * Clearly fictional companies, each in an excludable sector, so that the investor-profile
 * exclusions (ESG) have a visible effect without labelling real companies.
 * The demo account excludes all three by default, so the default feed is `PRODUCTS`.
 */
export const FICTIONAL_PRODUCTS: Product[] = [
  {
    ticker: 'PTRN',
    name: 'PétroNord (fictif)',
    brandColor: '#8a5a00',
    exclusion: 'fossil',
    fictional: true,
    price: 48,
    reasons: [
      'Société fictive : forte génération de trésorerie',
      'Dividende élevé',
      'Exposée à la transition énergétique',
    ],
    history: build('PTRN', 48, ['flat', 'down']),
    rates: { optimistic: 0.2, median: 0.06, pessimistic: -0.22 },
  },
  {
    ticker: 'TBCO',
    name: 'Tabacorp (fictif)',
    brandColor: '#7a4a2a',
    exclusion: 'tobacco',
    fictional: true,
    price: 36,
    reasons: [
      'Société fictive : marges très stables',
      'Rachats d’actions réguliers',
      'Volumes en déclin structurel',
    ],
    history: build('TBCO', 36, ['down', 'flat']),
    rates: { optimistic: 0.15, median: 0.04, pessimistic: -0.18 },
  },
  {
    ticker: 'LOTO',
    name: 'Lotoplus (fictif)',
    brandColor: '#8e2bb0',
    exclusion: 'gambling',
    fictional: true,
    price: 22,
    reasons: [
      'Société fictive : croissance des paris en ligne',
      'Forte saisonnalité des revenus',
      'Risque réglementaire élevé',
    ],
    history: build('LOTO', 22, ['up', 'down']),
    rates: { optimistic: 0.45, median: 0.1, pessimistic: -0.3 },
  },
];

export const PRODUCTS: Product[] = [
  {
    ticker: 'NVDA',
    name: 'NVIDIA',
    brandColor: '#76b900',
    price: 118.5,
    reasons: [
      "Demande soutenue pour les puces d'IA",
      'Marges élevées',
      'Valorisation à surveiller',
    ],
    history: build('NVDA', 118.5, ['up', 'flat']),
    rates: { optimistic: 0.4, median: 0.15, pessimistic: -0.2 },
  },
  {
    ticker: 'AAPL',
    name: 'Apple',
    brandColor: '#555555',
    price: 227,
    reasons: [
      'Base installée très fidèle',
      'Revenus de services en croissance',
      'Renouvellement des appareils plus lent',
    ],
    history: build('AAPL', 227, ['up', 'flat']),
    rates: { optimistic: 0.25, median: 0.1, pessimistic: -0.12 },
  },
  {
    ticker: 'MSFT',
    name: 'Microsoft',
    brandColor: '#00a4ef',
    price: 415,
    reasons: [
      "Croissance du cloud et de l'IA intégrée",
      'Revenus récurrents stables',
      'Investissements lourds en infrastructure',
    ],
    history: build('MSFT', 415, ['up', 'down']),
    rates: { optimistic: 0.25, median: 0.12, pessimistic: -0.1 },
  },
  {
    ticker: 'TSLA',
    name: 'Tesla',
    brandColor: '#cc0000',
    price: 250,
    reasons: [
      "Potentiel dans l'énergie et l'autonomie",
      'Concurrence accrue sur les véhicules électriques',
      'Volatilité élevée du titre',
    ],
    history: build('TSLA', 250, ['down', 'up']),
    rates: { optimistic: 0.6, median: 0.08, pessimistic: -0.35 },
  },
  {
    ticker: 'AMZN',
    name: 'Amazon',
    brandColor: '#ff9900',
    price: 185,
    reasons: [
      'Leadership du cloud (AWS)',
      'Amélioration des marges du commerce en ligne',
      'Dépenses publicitaires sensibles à la conjoncture',
    ],
    history: build('AMZN', 185, ['up', 'flat']),
    rates: { optimistic: 0.3, median: 0.14, pessimistic: -0.15 },
  },
  {
    ticker: 'GOOGL',
    name: 'Alphabet',
    brandColor: '#4285f4',
    price: 172,
    reasons: [
      'Domination de la recherche en ligne',
      'Cloud et IA en accélération',
      'Risque réglementaire persistant',
    ],
    history: build('GOOGL', 172, ['up', 'flat']),
    rates: { optimistic: 0.3, median: 0.13, pessimistic: -0.14 },
  },
  {
    ticker: 'META',
    name: 'Meta',
    brandColor: '#0866ff',
    price: 505,
    reasons: [
      'Audience publicitaire massive',
      'Efficacité des coûts améliorée',
      'Dépenses élevées dans la réalité virtuelle',
    ],
    history: build('META', 505, ['up', 'down']),
    rates: { optimistic: 0.35, median: 0.14, pessimistic: -0.18 },
  },
  {
    ticker: 'NFLX',
    name: 'Netflix',
    brandColor: '#e50914',
    price: 640,
    reasons: [
      'Croissance des abonnés et de la publicité',
      'Contenus originaux très suivis',
      'Concurrence forte des plateformes rivales',
    ],
    history: build('NFLX', 640, ['up', 'flat']),
    rates: { optimistic: 0.3, median: 0.11, pessimistic: -0.2 },
  },
  {
    ticker: 'AMD',
    name: 'AMD',
    brandColor: '#ed1c24',
    price: 160,
    reasons: [
      'Gains de parts de marché sur les serveurs',
      "Gamme de puces d'IA en développement",
      'Cycle des semi-conducteurs irrégulier',
    ],
    history: build('AMD', 160, ['down', 'up']),
    rates: { optimistic: 0.5, median: 0.16, pessimistic: -0.28 },
  },
  {
    ticker: 'DIS',
    name: 'Disney',
    brandColor: '#3b5bdb',
    price: 105,
    reasons: [
      'Parcs et divertissement résilients',
      'Streaming en voie de rentabilité',
      'Télévision traditionnelle en déclin',
    ],
    history: build('DIS', 105, ['flat', 'down']),
    rates: { optimistic: 0.22, median: 0.07, pessimistic: -0.15 },
  },
  {
    ticker: 'KO',
    name: 'Coca-Cola',
    brandColor: '#f40009',
    price: 63,
    reasons: [
      'Marque mondiale très stable',
      'Dividende régulier',
      'Croissance limitée des volumes',
    ],
    history: build('KO', 63, ['flat', 'flat']),
    rates: { optimistic: 0.12, median: 0.06, pessimistic: -0.07 },
  },
  {
    ticker: 'NKE',
    name: 'Nike',
    brandColor: '#f36f21',
    price: 92,
    reasons: [
      'Marque sportive de référence',
      "Stocks en cours d'assainissement",
      'Demande chinoise incertaine',
    ],
    history: build('NKE', 92, ['down', 'flat']),
    rates: { optimistic: 0.25, median: 0.08, pessimistic: -0.18 },
  },
  {
    ticker: 'JPM',
    name: 'JPMorgan',
    brandColor: '#8a6d3b',
    price: 205,
    reasons: [
      'Bilan solide et diversifié',
      "Revenus d'intérêts élevés",
      'Sensibilité aux cycles de crédit',
    ],
    history: build('JPM', 205, ['up', 'up']),
    rates: { optimistic: 0.2, median: 0.1, pessimistic: -0.1 },
  },
  {
    ticker: 'V',
    name: 'Visa',
    brandColor: '#1a1f71',
    price: 275,
    reasons: [
      'Volume de paiements en hausse',
      'Modèle peu gourmand en capital',
      'Pression réglementaire sur les frais',
    ],
    history: build('V', 275, ['up', 'flat']),
    rates: { optimistic: 0.18, median: 0.1, pessimistic: -0.08 },
  },
  {
    ticker: 'SBUX',
    name: 'Starbucks',
    brandColor: '#00704a',
    price: 78,
    reasons: [
      'Fidélité forte des clients',
      'Plan de redressement des ventes',
      'Consommation prudente aux États-Unis',
    ],
    history: build('SBUX', 78, ['down', 'flat']),
    rates: { optimistic: 0.28, median: 0.09, pessimistic: -0.18 },
  },
  {
    ticker: 'UBER',
    name: 'Uber',
    brandColor: '#276ef1',
    price: 70,
    reasons: [
      'Rentabilité en nette amélioration',
      'Livraison et mobilité complémentaires',
      'Dépendance aux conducteurs indépendants',
    ],
    history: build('UBER', 70, ['up', 'up']),
    rates: { optimistic: 0.45, median: 0.15, pessimistic: -0.25 },
  },
];

/** Every product the app knows (feed candidates before exclusions, buy page lookup). */
export const CATALOG: Product[] = [...PRODUCTS, ...FICTIONAL_PRODUCTS];
