/**
 * Toutes nos hypothèses, en un seul endroit.
 * À garder synchronisé avec alphaforge/ (profile.py RISK_BUDGET, data.py SINGLE_CAPS / SECTOR_CAP,
 * allocate.py PREF_FLOOR, pipeline/predictor.py, learn.py, metrics.py). Il n'existe pas encore
 * d'endpoint API qui les expose : écart de contrat signalé.
 */
export interface RiskLevelRow {
  level: number;
  label: string;
  maxVol: number;
  maxGrowth: number;
}

export const RISK_LEVELS: RiskLevelRow[] = [
  { level: 1, label: 'très faible', maxVol: 0.04, maxGrowth: 0.2 },
  { level: 2, label: 'faible', maxVol: 0.07, maxGrowth: 0.4 },
  { level: 3, label: 'modéré', maxVol: 0.1, maxGrowth: 0.6 },
  { level: 4, label: 'élevé', maxVol: 0.14, maxGrowth: 0.85 },
  { level: 5, label: 'très élevé', maxVol: 0.18, maxGrowth: 1 },
];

export interface HypothesisGroup {
  title: string;
  items: string[];
}

export const HYPOTHESIS_GROUPS: HypothesisGroup[] = [
  {
    title: 'Plafonds par titre',
    items: [
      '10 % du portefeuille au plus dans une même société.',
      '5 % au plus dans un même cryptoactif.',
      '35 % au plus dans un fonds diversifié (ou le plafond du profil s’il est plus bas).',
      '20 % au plus pour l’ensemble des actions individuelles d’un même secteur.',
    ],
  },
  {
    title: 'Construction du portefeuille',
    items: [
      'On vise une bande de volatilité de 85 % à 100 % du plafond du niveau de risque, pas seulement un plafond.',
      'Les actifs correspondant à vos centres d’intérêt reçoivent un plancher combiné de 15 %, quand les plafonds et le budget de risque le permettent.',
      'Taux sans risque du ratio de Sharpe : moyenne du taux directeur de la Banque du Canada sur la fenêtre, 3,19 %.',
    ],
  },
  {
    title: 'Scénarios sur 5 ans (hypothétiques, jamais une prévision)',
    items: [
      'Rééchantillonnage par blocs circulaires de 3 mois des rendements historiques, 2 000 trajectoires.',
      'Dérive réduite : 75 % d’un prior de type MEDAF (taux sans risque + bêta × prime de risque) et 25 % de l’historique.',
      'Prime de risque actions : 5 % par an, hypothèse déclarée et non un fait sourcé (testée à 3 % et 7 %).',
      'Scénario défavorable = 10e centile, central = médiane (50e), favorable = 90e centile, à chaque mois.',
    ],
  },
  {
    title: 'Apprentissage du profil',
    items: [
      'Tolérance révélée = médiane des 5 dernières décisions, au moins 3 décisions avant toute conclusion.',
      'Les décisions ne changent jamais l’objectif, l’horizon ni la capacité : la tolérance retenue reste plafonnée par eux.',
    ],
  },
  {
    title: 'Données et limites',
    items: [
      'Fenêtre de données : 12 novembre 2021 au 12 novembre 2026 (récupérée le 13 novembre 2026), cours ajustés (adj_close).',
      'Les cours cotés en USD sont convertis en CAD avec le taux USD/CAD quotidien de la Banque du Canada.',
      'CNQ.TO : le « fractionnement » de 1,021 du 22 août 2022 est probablement une distribution spéciale ; nous le signalons sans le corriger.',
      'Biais du survivant : l’univers de 31 actifs a été choisi en 2026, il favorise donc des titres qui ont bien traversé la période.',
      'Aucune donnée ESG, de nouvelles ni de fondamentaux dans les données de départ : aucun titre n’est jamais déclaré conforme à un critère ESG, seulement « donnée insuffisante ».',
      'Le rendement passé ne garantit pas le rendement futur. Simulation seulement : ce n’est pas un conseil financier.',
    ],
  },
];
