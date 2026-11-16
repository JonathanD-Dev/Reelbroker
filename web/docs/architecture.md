# Architecture — Prototype "Buy"

Prototype démo mobile-first, 100 % front, sans backend. Interface en français (sauf les libellés anglais imposés), code et identifiants en anglais.

> **Version courante : v2 (fil infini plein écran, style TikTok / Shorts / Reels).** Les §1 à §12 décrivent l'application avec les corrections v2 déjà appliquées. Le §13 « v2 – fil infini » est la spécification exécutable du nouveau fil. En cas de conflit, le §13 prime.

## 1. Stack et justification

| Choix | Retenu | Alternatives écartées | Raison |
|---|---|---|---|
| Build / dev | **Vite** | Next.js, CRA | Démarrage immédiat, zéro SSR utile ici, CRA abandonné. |
| UI | **React 19 + TypeScript** | Svelte, Vue | Recommandation du plan, typage strict du modèle de données. |
| Graphiques | **SVG maison** (`<polyline>`/`<path>`) | recharts, Chart.js | 3 types de tracés très simples. Évite ~100 ko de dépendance et se teste facilement (fonctions pures de mise à l'échelle). |
| Routage | **Hash router maison** (~30 lignes, hook `useHashRoute`) | react-router | 2 routes seulement. Le hash fonctionne sans config serveur (`vite preview`, fichier statique). |
| État | `useState` / `useReducer` + 2 hooks de persistance | Redux, Zustand | Deux listes de tickers à persister, un état de fil local. |
| Fil infini (v2) | **CSS scroll-snap + IntersectionObserver natifs** | react-window, swiper, framer-motion | Aucune dépendance runtime. Le snap natif donne le swipe tactile, la molette et l'inertie gratuitement. Voir §13. |
| Style | **CSS simple** (un fichier global + CSS variables, classes BEM-like) | Tailwind, CSS-in-JS | Pas de dépendance, mobile-first par `min-width` media queries. |
| Tests | **Vitest + @testing-library/react + jsdom** | Jest | Intégré à Vite, même config. |

Dépendances runtime : `react`, `react-dom` (inchangé en v2, `createPortal` vient de `react-dom`). Dev : `vite`, `@vitejs/plugin-react`, `typescript`, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `@types/react`, `@types/react-dom`.

## 2. Scripts npm attendus

| Script | Commande |
|---|---|
| `dev` | `vite` |
| `build` | `tsc --noEmit && vite build` |
| `preview` | `vite preview` |
| `test` | `vitest run` |
| `test:watch` | `vitest` |

TypeScript en mode `strict`. Le fichier `vite.config.ts` contient aussi la config Vitest (`environment: 'jsdom'`, `setupFiles: ['src/test/setup.ts']`, `globals: false`). **`vite.config.ts` n'est pas modifié en v2.**

## 3. Arborescence (état cible v2)

Légende : `[N]` nouveau, `[M]` modifié, `[D]` supprimé.

```
/workshop
├── index.html                      # [M] <meta viewport> + viewport-fit=cover (safe areas)
├── package.json
├── tsconfig.json
├── vite.config.ts                  # NON modifié
├── src/
│   ├── main.tsx
│   ├── App.tsx                     # [M] inchangé fonctionnellement; BuyPage dans un wrapper clair (§13.12)
│   ├── types.ts                    # [M] + FeedItem (§13.2)
│   ├── data/
│   │   ├── products.ts             # [M] 16 produits (§4)
│   │   └── generateSeries.ts       # inchangé
│   ├── lib/
│   │   ├── projections.ts, chartMath.ts, format.ts   # inchangés
│   │   ├── storage.ts              # [M] + readFlag / writeFlag (§5)
│   │   ├── feed.ts                 # [N] buildPage, toItems, sanitizeItems, isHeavy (§13.2-13.4)
│   │   ├── feedSession.ts          # [N] snapshot du fil en sessionStorage (§13.9)
│   │   └── color.ts                # [N] mixWithBlack, contrastRatio (§13.5)
│   ├── hooks/
│   │   ├── useHashRoute.ts         # inchangé
│   │   ├── usePersistentSet.ts     # inchangé
│   │   ├── useInfiniteFeed.ts      # [N] reducer du fil (items, nextPage, nextSeq)
│   │   ├── useActiveReel.ts        # [N] IntersectionObserver de carte active + sentinelle
│   │   ├── useFeedKeyboard.ts      # [N] ↑/↓ PageUp/PageDown j/k
│   │   ├── useDoubleTap.ts         # [N] double-tap / double-clic
│   │   └── useReducedMotion.ts     # [N] matchMedia('(prefers-reduced-motion: reduce)')
│   ├── components/
│   │   ├── Reel.tsx                # [N] <article> d'un item : fond, placeholder ou ProductCard, double-tap
│   │   ├── ProductCard.tsx         # [M] contenu lourd (plus d'<article>), porte `expanded` et `quantity`
│   │   ├── CardMeta.tsx            # [N] bas-gauche : logo + ticker + nom + See more/less data
│   │   ├── ActionRail.tsx          # [N] rail vertical droit : signet, panier (détail), ⋮
│   │   ├── BottomSheet.tsx         # [N] portail + backdrop + focus trap
│   │   ├── SwipeHint.tsx           # [N] « Glisser vers le haut »
│   │   ├── FavoriteBurst.tsx       # [N] animation signet au double-tap
│   │   ├── CardFooter.tsx          # [D] remplacé par CardMeta + ActionRail
│   │   ├── CardNav.tsx             # [D] supprimé (plus de « 2 / 5 », plus de ‹ ›)
│   │   ├── CardSummary.tsx         # [M] styles sur fond sombre
│   │   ├── CardDetails.tsx         # [M] contenu dans un panneau clair
│   │   ├── OverflowMenu.tsx        # [M] bouton ⋮ + BottomSheet
│   │   ├── BookmarkButton.tsx      # [M] prop `label`
│   │   ├── CartButton.tsx          # [M] prop `label`
│   │   ├── EmptyState.tsx          # [M] plein écran + prop `focusOnMount`
│   │   ├── TickerLogo.tsx, MiniChart.tsx, ProjectionChart.tsx, QuantityInput.tsx, Icons.tsx   # inchangés
│   ├── pages/
│   │   ├── FeedPage.tsx            # [M] réécrit (§13)
│   │   └── BuyPage.tsx             # [M] wrapper `page-light` seulement
│   ├── styles/global.css           # [M] (§13.11)
│   └── test/
│       ├── setup.ts                # [M] mocks jsdom (§13.10)
│       ├── feedTestUtils.ts        # [N] helpers IO / activation
│       ├── app.test.tsx            # [M] parcours adaptés au fil
│       ├── a11y.test.tsx           # [M] menu → bottom sheet, focus après masquage
│       ├── storage.test.ts         # [M] + flags
│       ├── feed.test.ts            # [N]
│       ├── feedSession.test.ts     # [N]
│       ├── color.test.ts           # [N]
│       ├── products.test.ts        # [N]
│       ├── feedApp.test.tsx        # [N] comportements du fil (§13.10)
│       └── projections / generateSeries / chartMath .test.ts   # inchangés
```

## 4. Modèle de données (`src/types.ts`)

```ts
export type Ticker = string; // "NVDA", identifiant unique du produit

export interface SeriesPoint { label: string; value: number }   // label: "M-11"…"M0" ou "Jan"…

export interface Series {
  title: string;            // ex. "Cours (12 mois)"
  points: SeriesPoint[];    // >= 2 points, ordre chronologique
}

export interface ScenarioRates {
  optimistic: number;       // rendement annuel, ex. 0.35 = +35 %
  median: number;           // ex. 0.12
  pessimistic: number;      // ex. -0.20
}

export interface Product {
  ticker: Ticker;
  name: string;             // "NVIDIA"
  brandColor: string;       // couleur du fond et du logo, "#rrggbb" (6 chiffres)
  price: number;            // cours actuel en USD, > 0
  reasons: string[];        // puces « Pourquoi : » (3, en français)
  history: [Series, Series]; // [haussière, baissière/plate]
  rates: ScenarioRates;     // optimistic > median > pessimistic
}

export type ScenarioKey = 'optimistic' | 'median' | 'pessimistic';

export interface ProjectionPoint { month: number; value: number } // month 0..12
export type Projections = Record<ScenarioKey, ProjectionPoint[]>;

// v2
export interface FeedItem { key: string; product: Product }  // key = `${ticker}#${seq}`, unique dans une session de fil
```

### Données mock (`products.ts`)

**16 produits** (≥ 15), tableau statique ordonné ; NVDA en premier. Les séries sont produites au chargement du module par `build()` existant (`generateSeries`, seed `hashString(ticker + index)`, drifts `up +0.30 / down −0.15 / flat 0`), mêmes conventions que v1.

| ticker | name | price | brandColor | rates (opt / med / pes) | history[0] | history[1] |
|---|---|---|---|---|---|---|
| NVDA | NVIDIA | 118.50 | #76b900 | +0.40 / +0.15 / −0.20 | up | flat |
| AAPL | Apple | 227.00 | #555555 | +0.25 / +0.10 / −0.12 | up | flat |
| MSFT | Microsoft | 415.00 | #00a4ef | +0.25 / +0.12 / −0.10 | up | down |
| TSLA | Tesla | 250.00 | #cc0000 | +0.60 / +0.08 / −0.35 | down | up |
| AMZN | Amazon | 185.00 | #ff9900 | +0.30 / +0.14 / −0.15 | up | flat |
| GOOGL | Alphabet | 172.00 | #4285f4 | +0.30 / +0.13 / −0.14 | up | flat |
| META | Meta | 505.00 | #0866ff | +0.35 / +0.14 / −0.18 | up | down |
| NFLX | Netflix | 640.00 | #e50914 | +0.30 / +0.11 / −0.20 | up | flat |
| AMD | AMD | 160.00 | #ed1c24 | +0.50 / +0.16 / −0.28 | down | up |
| DIS | Disney | 105.00 | #3b5bdb | +0.22 / +0.07 / −0.15 | flat | down |
| KO | Coca-Cola | 63.00 | #f40009 | +0.12 / +0.06 / −0.07 | flat | flat |
| NKE | Nike | 92.00 | #f36f21 | +0.25 / +0.08 / −0.18 | down | flat |
| JPM | JPMorgan | 205.00 | #8a6d3b | +0.20 / +0.10 / −0.10 | up | up |
| V | Visa | 275.00 | #1a1f71 | +0.18 / +0.10 / −0.08 | up | flat |
| SBUX | Starbucks | 78.00 | #00704a | +0.28 / +0.09 / −0.18 | down | flat |
| UBER | Uber | 70.00 | #276ef1 | +0.45 / +0.15 / −0.25 | up | up |

Contraintes pour tout produit (testées, §13.10) : tickers uniques, `reasons` = 3 puces françaises factices, `rates.optimistic > median > pessimistic`, `brandColor` en `#rrggbb`, contraste blanc / `mixWithBlack(brandColor, 0.55)` ≥ 4.5 (§13.5). Titres de séries : `"Cours (12 mois)"` et `"Volume relatif (12 mois)"`. Aucune de ces valeurs n'est un conseil financier : mention « Données fictives, à but de démonstration » toujours visible (§13.11).

### Génération déterministe (`generateSeries.ts`) — inchangée

```ts
export function mulberry32(seed: number): () => number;      // PRNG [0,1)
export function hashString(s: string): number;               // seed depuis une chaîne
export function generateSeries(opts: {
  seed: number; start: number; drift: number; volatility: number; count?: number; title: string;
}): Series;
```

Premier point exactement `start`, dernier exactement `start * (1 + drift)`, bruit sur les points intermédiaires, arrondi 2 décimales, mêmes entrées → même sortie.

## 5. Persistance

| Stockage | Clé | Format | Sens |
|---|---|---|---|
| localStorage | `buy-demo:favorites` | JSON `string[]` de tickers | signets |
| localStorage | `buy-demo:hidden` | JSON `string[]` de tickers | « Don't show me again » |
| localStorage | `buy-demo:hint-seen` | `"1"` | indice « Glisser vers le haut » déjà vu (v2) |
| sessionStorage | `buy-demo:feed-session` | JSON `{keys:string[], activeKey:string\|null, nextPage:number, nextSeq:number}` | snapshot du fil pour restaurer la position au retour de la page d'achat (v2, §13.9) |

- `storage.ts` : `readList(key): string[]` (retourne `[]` si clé absente, JSON invalide, valeur non-tableau ou erreur d'accès ; filtre les non-strings) et `writeList(key, list)` (try/catch silencieux). **v2** : `readFlag(key): boolean` (vrai si la valeur est `"1"`, faux en cas d'erreur) et `writeFlag(key): void` (écrit `"1"`, try/catch silencieux).
- `feedSession.ts` (sessionStorage) : `readFeedSession(): FeedSession | null` (valide la forme, `null` si invalide) et `writeFeedSession(s)` (try/catch silencieux).
- `usePersistentSet(key)` retourne `{ has(t), toggle(t), add(t), clear() }`. Initialisation paresseuse depuis `readList`, écriture à chaque changement.
- Le panier n'est pas persisté. La quantité « If I buy » n'est pas persistée (état local de la carte, défaut 10 ; perdue quand la carte sort de la fenêtre de rendu, §13.4).
- Les tickers inconnus en storage sont ignorés à l'affichage.

## 6. Règles de calcul des projections (`lib/projections.ts`) — inchangées

Unité de « If I buy » : **nombre d'actions** (hypothèse). Entier ≥ 0, défaut 10.

```ts
export const DEFAULT_QUANTITY = 10;
export const MAX_QUANTITY = 100000;
export const HORIZON_MONTHS = 12;
export function parseQuantity(raw: string): number;   // "" ou invalide -> 0, négatif -> 0, décimal -> floor, > MAX -> MAX
export function computeProjections(price: number, quantity: number, rates: ScenarioRates, months = HORIZON_MONTHS): Projections;
```

`start = price * quantity`; `value(s, m) = start * (1 + rates[s]) ^ (m / 12)`, arrondi 2 décimales. Propriétés : même départ aux 3 courbes, ordre `optimistic >= median >= pessimistic`, linéarité en `quantity`, `quantity = 0` → message « Saisissez une quantité > 0 ».

### Tracé SVG (`lib/chartMath.ts`) — inchangé

`getRange(values, padding = 0.05)`, `toPoints(values, width, height, range, margin?)`. `MiniChart` : viewBox `0 0 120 60`, vert `#2e9e4f` si hausse, rouge `#d33a3a` sinon, `role="img"` + `aria-label`. `ProjectionChart` : viewBox `0 0 300 160`, 3 `polyline[data-scenario]` (optimiste `#2e9e4f`, médiane `#111111`, pessimiste `#d33a3a`), cercle de départ, légende. **Ces graphes restent dans un panneau clair** (§13.5), car la médiane noire est illisible sur fond sombre.

## 7. Routage et navigation

`useHashRoute()` lit `window.location.hash`, écoute `hashchange`, retourne `{ route, navigate }`.

| Hash | Route | Page |
|---|---|---|
| `#/` (ou vide / inconnu) | `{ name: 'feed' }` | `FeedPage` |
| `#/buy/NVDA` | `{ name: 'buy', ticker: 'NVDA' }` | `BuyPage` (ticker inconnu → message + « ← Retour ») |

- **Fil (v2)** : `FeedPage` ne calcule plus `visible[index]`. Elle possède la liste d'items du fil (§13.2), le défilement est natif (scroll-snap), la carte active est détectée par IntersectionObserver (§13.3). Il n'y a plus d'index ni de « n / total » (`CardNav` supprimé).
- Quand une carte n'est plus active, sa vue repasse en résumé (§13.5).
- « Don't show me again » : retire toutes les occurrences du produit avec sortie animée et sans saut de scroll (§13.6). Plus rien à afficher → `EmptyState` plein écran avec « Réafficher les produits masqués ».
- « Buy now » (feuille ⋮) et l'icône panier (vue détaillée) appellent `navigate('/buy/' + ticker)`. **Au retour (« ← Retour » → `navigate('/')`), le fil est reconstruit à l'identique et recalé sur la carte qui était active** (§13.9). `App` rend `FeedPage` *ou* `BuyPage`, donc `FeedPage` est démontée pendant l'achat. D'où le snapshot en sessionStorage.

## 8. Composants et props

Toutes les props sont typées dans le fichier du composant. Callbacks nommés `onXxx`. Seuls les composants modifiés ou nouveaux sont détaillés ; les autres sont inchangés par rapport à v1 (`CardSummary {product}`, `CardDetails {product, quantity, onQuantityChange}`, `TickerLogo {name, color, size?}`, `MiniChart {series}`, `ProjectionChart {projections, quantity}`, `QuantityInput {value, onChange}`, `BuyPage {ticker, onBack}`, `Icons`).

- `App` : sans props ; `useHashRoute`, `usePersistentSet('buy-demo:favorites')`, `usePersistentSet('buy-demo:hidden')`. Rend `FeedPage` ou `BuyPage`.
- `FeedPage { products: Product[]; favorites: PersistentSet; hidden: PersistentSet; onBuy: (t: Ticker) => void }` (props inchangées). Détail §13.
- `Reel { item: FeedItem; index: number; heavy: boolean; active: boolean; leaving: boolean; isFavorite: boolean; onToggleFavorite; onFavoriteOnly: () => void; onBuy; onHide }` → `<article>` (§13.4).
- `ProductCard { product: Product; active: boolean; isFavorite: boolean; onToggleFavorite; onBuy; onHide }`. État local `expanded` (faux) et `quantity` (10). `active` passant à `false` force `expanded = false`. Rend `CardSummary` ou `CardDetails` dans `.reel__content`, puis `CardMeta` et `ActionRail`. N'est **pas** un `<article>`.
- `CardMeta { product: Product; expanded: boolean; onToggleExpanded: () => void }` : `TickerLogo` + ticker + nom, et dessous le bouton-lien « See more data » / « See less data » (`aria-expanded`).
- `ActionRail { product: Product; expanded: boolean; isFavorite: boolean; onToggleFavorite; onBuy; onHide }` : colonne verticale `BookmarkButton` (label « Favori »), `CartButton` (label « Acheter », seulement en vue détaillée), `OverflowMenu` (label « Plus »).
- `BookmarkButton { active; onToggle; label?: string }`, `CartButton { onClick; label?: string }` : `aria-label` inchangés (« Ajouter aux favoris » / « Retirer des favoris » / « Acheter »). Le `label` est un `<span aria-hidden="true">` visible sous l'icône.
- `OverflowMenu { productName: string; onBuyNow; onHide }` : bouton ⋮ (`aria-label="Plus d'actions"`, `aria-haspopup="menu"`, `aria-expanded`) + `BottomSheet` (§13.8).
- `BottomSheet { open: boolean; label: string; onClose: () => void; children }` : portail dans `document.body`, backdrop, focus trap, Échap, retour de focus.
- `SwipeHint {}` et `FavoriteBurst { burstKey: number }` : décoratifs, `aria-hidden`.
- `EmptyState { onReset: () => void; focusOnMount?: boolean }` : plein écran, `<h2 tabIndex={-1}>Plus aucun produit à afficher</h2>` (focalisé si `focusOnMount`) + bouton « Réafficher les produits masqués ».

## 9. Interface et style (v2)

Spécification détaillée en §13.5 et §13.11. Résumé : fil plein écran sur fond sombre, cartes de 100 dvh avec fond dégradé par `brandColor`, texte blanc, rail d'actions à droite, identité du produit en bas à gauche, cibles tactiles ≥ 44 px, `prefers-reduced-motion` respecté, focus visible clair sur fond sombre. La page d'achat reste claire (`page-light`).

## 10. Plan de tests

Stratégie jsdom et liste complète des tests : §13.10. Tests inchangés : `projections`, `generateSeries`, `chartMath`. Tests à adapter : `app.test.tsx` (suppression de `« 1 / 5 »`, `CardNav`, navigation ‹ ›, focus sur `<main>` ; masquage → focus sur l'article suivant), `a11y.test.tsx` (menu devenu bottom sheet : Tab piégé au lieu de fermer le menu ; focus après masquage), `storage.test.ts` (+ flags).

## 11. Hypothèses et questions ouvertes

Hypothèses (à signaler à l'orchestrator) :
1. « Impacts prévus sur le projet » du croquis est affiché « Impacts prévus sur le portefeuille » (déjà acté dans PLAN.md).
2. « If I buy » = nombre d'actions (défaut 10). Projections à taux annuel composé fixe par scénario.
3. Le panier (vue détaillée) et « Buy now » mènent à la même page d'achat simulée.
4. Les 15 produits autres que NVDA sont des choix libres (tickers réels, données inventées).
5. **v2** : le défilement est natif (swipe, molette) + clavier. Pas de boutons ‹ › ni d'indicateur de position (supprimés à la demande).
6. **v2** : avec un seul produit visible, le fil est fini (une seule carte, pas de répétition). Voir §13.2.
7. **v2** : la quantité « If I buy » est perdue quand la carte sort de la fenêtre de rendu (≥ 3 cartes d'écart).
8. **v2** : le double-tap ajoute toujours aux favoris (n'enlève jamais), comme un « like » ; on retire via le bouton signet.
9. **v2** : la restauration de position survit au rechargement dans le même onglet (sessionStorage). C'est voulu et inoffensif.
10. Le bouton « Réafficher les produits masqués » est un ajout minimal pour rendre la démo rejouable.

Questions ouvertes : aucune bloquante. À arbitrer plus tard (hors périmètre) : boutons ↑/↓ visibles sur desktop pour les utilisateurs sans clavier ni molette.

## 12. Résumé

Vite + React + TypeScript, SVG maison, hash router, favoris et masqués en localStorage, 16 produits mock déterministes. Le fil v2 est un conteneur `role="feed"` à scroll-snap vertical natif, alimenté par `buildPage` (pseudo-aléatoire déterministe, jamais deux fois le même produit d'affilée), avec contenu lourd limité à la carte active ±2 et position restaurée après la page d'achat.

---

# 13. v2 – fil infini

## 13.1 Vue d'ensemble

```
<main class="app-main">                      # hauteur 100dvh, fond sombre, centre la colonne
  <h1 class="sr-only">Recommandations d'achat</h1>
  <p class="disclaimer">Données fictives, à but de démonstration</p>   # superposé en haut de la colonne
  <div class="feed" role="feed" aria-label="Recommandations d'achat" ref=feedRef>   # SEUL conteneur scrollable
     <article class="reel" …/> × N                   # 100dvh chacun
     <div class="feed__sentinel" aria-hidden="true"/>
  </div>
  <div role="status" class="sr-only" aria-live="polite"/>   # annonces (masquage, favori)
  <SwipeHint/>                                              # seulement sur la 1re carte
</main>
```

`body, html, #root { height: 100%; overflow: hidden }`. Le scroll vit uniquement dans `.feed`. Si aucun produit n'est visible, `.feed` est remplacé par `<EmptyState>`.

## 13.2 Données du fil (`lib/feed.ts`, pur, sans React)

```ts
export const PAGE_SIZE = 8;
export const RENDER_RADIUS = 2;   // §13.4
export const AHEAD_MIN = 8;       // cartes minimum après la carte qu'on masque (§13.6)

// Page pseudo-aléatoire déterministe.
export function buildPage(visible: readonly Product[], pageIndex: number, prevTicker: Ticker | null): Product[];
export function toItems(products: readonly Product[], startSeq: number): FeedItem[]; // key `${ticker}#${startSeq+i}`
export function tickerOfKey(key: string): Ticker;                                     // avant le dernier '#'
export function sanitizeItems(items: readonly FeedItem[], isHidden: (t: Ticker) => boolean): FeedItem[];
export function isHeavy(index: number, activeIndex: number): boolean;                 // |index − activeIndex| ≤ RENDER_RADIUS
```

**`buildPage`** :
1. `visible.length === 0` → `[]`.
2. `visible.length === 1` : renvoie `[visible[0]]` si `prevTicker !== visible[0].ticker`, sinon `[]`. **Le fil est alors fini** (1 carte) plutôt que de répéter le même produit. `hasMore = visible.length >= 2`, pas de sentinelle sinon.
3. Sinon `rand = mulberry32(hashString('feed:' + pageIndex))`. Pour chacun des `PAGE_SIZE` emplacements : `candidates = visible.filter(p => p.ticker !== prev)`, `pick = candidates[Math.floor(rand() * candidates.length)]`, `prev = pick.ticker`. `prev` démarre à `prevTicker`. **Un seul appel à `rand()` par emplacement.** Le résultat est donc identique pour les mêmes entrées, y compris à la frontière de pages.
4. Les produits restent dans l'ordre de `PRODUCTS` (ordre de `visible`), ce qui fait partie du contrat de déterminisme.

**Clés** : `key = ${ticker}#${seq}`, `seq` est un compteur monotone `nextSeq` (jamais `items.length`, car le masquage raccourcit la liste). Une clé n'est jamais réutilisée dans une session de fil.

**`sanitizeItems`** : retire les items dont le ticker est masqué, puis supprime tout item dont le ticker égale celui de l'item précédent conservé (on garde le premier). Garantit l'invariant « pas deux fois le même produit d'affilée » après masquage (ex. A B A, B masqué → A A → A).

**`useInfiniteFeed(visible)`** : `useReducer` avec `{ items: FeedItem[]; nextPage: number; nextSeq: number }`. Reducer **pur** (compatible StrictMode).

| Action | Effet |
|---|---|
| `append` | `buildPage(visible, nextPage, last?.ticker ?? null)` → `toItems` → concaténer ; `nextPage++`, `nextSeq += n`. Sans effet si `visible.length < 2` et que la page est vide. |
| `ensureAhead {fromKey, visible}` | `append` tant que le nombre d'items après `fromKey` < `AHEAD_MIN` (max 3 itérations, seulement si `visible.length ≥ 2`). |
| `prune {isHidden}` | `items = sanitizeItems(items, isHidden)`. |
| `reset {visible}` | `items = []`, `nextPage = 0`, `nextSeq = 0`, puis `append` (page 0). |

Initialisation paresseuse : session valide (§13.9) → items restaurés ; sinon `reset`. Le fil est **stateful** : il n'est pas recalculé depuis `visible` à chaque rendu (sinon masquer un produit changerait toutes les clés et provoquerait des sauts). Retourne aussi `hasMore = visible.length >= 2`.

## 13.3 Défilement, détection de la carte active, chargement

CSS clé (valeurs normatives) :

```css
.feed { height: 100dvh; overflow-y: auto; scroll-snap-type: y mandatory;
        overscroll-behavior-y: contain; overflow-anchor: none; scrollbar-width: none; }
.reel { height: 100dvh; scroll-snap-align: start; scroll-snap-stop: always;
        touch-action: manipulation; contain: layout paint; position: relative; overflow: hidden; }
```

- **Swipe et molette** : natifs. **`overflow-anchor: none`** : on gère nous-mêmes la compensation (§13.6) pour avoir le même comportement sur tous les navigateurs (Safari n'a pas d'ancrage).
- **Carte active** (`useActiveReel(feedRef)`) : un seul `IntersectionObserver` `{ root: feed, threshold: [0.6] }`. Chaque `Reel` s'enregistre via un callback ref (`observe` au montage, `unobserve` au démontage). Callback : pour les entrées `isIntersecting && intersectionRatio >= 0.6`, `setActiveKey(entry.target.dataset.key)`. Retourne `{ activeKey, registerReel }`. `activeIndex = items.findIndex(i => i.key === activeKey)`, repli sur `0`. Initialement `activeKey` = clé restaurée ou `items[0].key`.
- **Focus clavier dans une carte non active** : `onFocusCapture` sur l'`<article>` appelle `setActiveKey` (la carte se montre déjà via le scroll natif du focus).
- **Sentinelle** : `<div class="feed__sentinel" aria-hidden>` après le dernier `<article>`, rendue seulement si `hasMore`. Un second `IntersectionObserver` `{ root: feed, rootMargin: '0px 0px 200% 0px' }` déclenche `dispatch({type:'append'})` quand elle devient visible. Un `useEffect([items.length])` fait `unobserve` puis `observe` de la sentinelle pour forcer un callback initial si elle est encore dans la marge après un ajout. Le déclenchement se produit environ 2 cartes avant la fin, donc l'utilisateur ne voit jamais de fin de fil. Aucun état de chargement (calcul synchrone), donc pas de `aria-busy`.
- **Navigation programmatique** (`goTo(index)`) : `items[i]` → `el.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })` puis `el.focus({ preventScroll: true })`. Index borné à `[0, items.length-1]`.
- **Clavier** (`useFeedKeyboard`, listener `keydown` sur `document` tant que `FeedPage` est montée) :
  - `ArrowDown`, `PageDown`, `j` → carte suivante ; `ArrowUp`, `PageUp`, `k` → précédente.
  - Ignorer si `e.defaultPrevented`, si une touche modificatrice est pressée (Ctrl/Alt/Meta), si `e.target` est `input`, `textarea`, `select` ou `[contenteditable]`, si une bottom sheet est ouverte (`document.querySelector('[aria-modal="true"]')`), ou si un masquage est en cours.
  - En vue détaillée, `ArrowUp`/`ArrowDown` ne sont **pas** interceptées quand la cible est dans `.reel__content` et que ce conteneur peut encore défiler dans cette direction (`scrollTop > 0` pour ↑, `scrollTop + clientHeight < scrollHeight` pour ↓). `PageUp`/`PageDown`/`j`/`k` navigent toujours.
  - `preventDefault()` seulement quand la touche est traitée.
  - Pas de `Space` : reste le comportement natif des boutons.

## 13.4 Fenêtre de rendu (virtualisation simple)

Choix : **tous les `<article>` restent dans le DOM** (coquilles de hauteur fixe 100dvh), mais **le contenu lourd n'est monté que pour `isHeavy(index, activeIndex)`**, soit la carte active ±2 (5 cartes). Ailleurs : placeholder.

- `Reel` rend toujours `<article class="reel" data-key tabIndex={-1} aria-label={product.name} aria-posinset={index+1} aria-setsize={-1} style={{'--brand': brandColor}}>`.
- `heavy` → `<ProductCard …/>` ; sinon `<div class="reel__placeholder" aria-hidden="true"/>` (rien d'autre). Le fond dégradé est porté par `.reel` (CSS variable `--brand`), donc un swipe rapide ne montre jamais de blanc.
- **Stabilité du scroll et du snap** : coquille et contenu ont la même hauteur (100dvh, `contain: layout paint`), donc monter ou démonter le contenu ne change aucune position. Aucune carte n'est supprimée de la tête du fil : une troncature décalerait `scrollTop` et casserait le snap. Coût mémoire : une coquille ≈ 1 nœud ; 50 pages ≈ 400 nœuds, acceptable pour une démo.
- **État local perdu** à ≥ 3 cartes d'écart : `expanded` (voulu, §13.5) et `quantity` (acceptable, hypothèse 7).
- `React.memo(Reel)` avec des callbacks stables (`useCallback`) pour que le changement de carte active ne re-rende que les cartes dont `heavy` ou `active` change.

## 13.5 Layout d'une carte et vue détaillée

**Fond** : `.reel { background: linear-gradient(165deg, color-mix(in srgb, var(--brand) 55%, #000) 0%, color-mix(in srgb, var(--brand) 22%, #000) 60%, #07080a 100%); color: #fff; }` plus un voile bas `.reel::after { background: linear-gradient(to top, rgba(0,0,0,.6), transparent 40%); pointer-events: none }`.

**Contraste** : texte toujours blanc. Le point le plus clair du dégradé est `brand × 0.55`. `lib/color.ts` expose `mixWithBlack(hex, ratio): string`, `contrastRatio(hexA, hexB): number` (formule WCAG 2.x). Contrainte testée sur tous les produits : `contrastRatio('#ffffff', mixWithBlack(brandColor, 0.55)) >= 4.5`.

**Disposition** (tout en `position: absolute` dans `.reel`, `padding` avec `env(safe-area-inset-*)`) :
- `.reel__content` : `inset: 48px 80px calc(140px + safe-bottom) 16px`, flex colonne, centré verticalement en résumé. Contenu : `CardSummary` (« Buy », « Pourquoi : », puces) ou `CardDetails`.
- `CardMeta` en bas à gauche : `left: 16px; right: 88px; bottom: calc(24px + safe-bottom)`. `TickerLogo` (cercle + initiales), ticker en gras, nom, puis lien « See more data » / « See less data » (blanc, souligné, ≥ 44 px de haut).
- `ActionRail` à droite : `right: 8px; bottom: calc(24px + safe-bottom)`, colonne, `gap: 12px`. Chaque bouton `.rail-btn` : colonne icône (28 px) + libellé 0,7 rem blanc, `min-width: 48px; min-height: 56px` (≥ 44 px), ombre portée de texte pour lisibilité.
- Rail en vue résumé : Favori, Plus. En vue détaillée : Favori, Acheter, Plus (ordre du croquis : signet, panier, ⋮).

**Choix détail : dans la carte** (et non en bottom sheet).
- Justification : (1) « See more / less data » + `aria-expanded` existent déjà dans la carte et le croquis les place dans la carte ; (2) une feuille détail s'ajouterait à la feuille ⋮ (deux calques modaux, deux focus traps, geste « fermer » ambigu avec le swipe) ; (3) garder le rail visible permet signet et panier en vue détaillée sans changer de contexte.
- Implémentation : `CardDetails` est rendu dans un panneau clair `.reel__panel` (fond `rgba(255,255,255,.94)`, `color: var(--ink)`, rayon 16 px, padding 12 px) pour garder les couleurs de courbes (la médiane noire reste lisible). `.reel__content` devient scrollable en vue détaillée : `overflow-y: auto; overscroll-behavior: contain; scrollbar-width: none`. Ce conteneur n'est pas un snap container, donc le snap du `.feed` est intact. Conséquence assumée : en vue détaillée, un swipe qui atteint le bout du contenu ne change pas de carte (pas de chaînage) ; on change de carte avec `j`/`k`/PageUp/PageDown, ou on repasse en résumé.
- **Retour en résumé** : `ProductCard` reçoit `active`. `useEffect(() => { if (!active) setExpanded(false) }, [active])`. Le changement de carte active vient de l'IO (≥ 60 % visible), donc le résumé est restauré quand la carte quitte l'écran.

## 13.6 « Don't show me again » : masquage sans saut

Constante `EXIT_MS = 220` (0 si `prefers-reduced-motion`).

Séquence dans `FeedPage.handleHide(item)` (la carte porte `item.key`) :
1. Fermer la feuille ⋮ (déjà fait par `select`). `hidden.add(item.ticker)` (persistance immédiate). `setLeavingKey(item.key)`. `dispatch({type:'ensureAhead', fromKey: item.key, visible: visibleSansTicker})`. Mémoriser `oldActiveIndex = index de item.key`.
2. `Reel` avec `leaving` reçoit la classe `reel--leaving` : `@keyframes reel-leave` 220 ms (`opacity 1→0`, `transform: translateY(-24px) scale(.96)`, uniquement transform et opacity), `pointer-events: none`. Pendant cette fenêtre le clavier est ignoré (flag `busy`). La hauteur **n'est pas animée** : la carte garde sa place, le fond reste, donc aucun reflow ni saut.
3. `setTimeout(EXIT_MS)` (nettoyé au démontage ; pas d'`animationend`, non déclenché en jsdom) :
   - `prunedItems = sanitizeItems(items, t => hidden.has(t) || t === item.ticker)`. `removedAbove = nombre d'items retirés dont l'ancien index < oldActiveIndex` (l'item masqué lui-même n'est pas compté : son emplacement est repris par la carte suivante).
   - `dispatch({type:'prune', …})`, `setLeavingKey(null)`.
   - `pendingScrollTop.current = (oldActiveIndex - removedAbove) * feed.clientHeight`.
4. `useLayoutEffect` sur `items` : si `pendingScrollTop.current != null`, `feed.scrollTo({ top: min(pendingScrollTop, scrollHeight - clientHeight), behavior: 'instant' })`, puis remise à `null`. Toutes les cartes ayant la même hauteur et `overflow-anchor: none`, la carte qui suit prend exactement la position de la carte retirée : **aucun saut visible**. Les occurrences hors écran situées au-dessus sont compensées par `removedAbove`, celles en dessous n'affectent pas le scroll.
5. **Focus** : après la mise à jour, `newIndex = min(oldActiveIndex - removedAbove, items.length - 1)`, `articles[newIndex].focus({ preventScroll: true })`, `setActiveKey(items[newIndex].key)`. Annonce dans le live region : « {nom} masqué. Affichage de {nom suivant}. » Si `items.length === 0` : `EmptyState` avec `focusOnMount` (le `<h2 tabIndex={-1}>` reçoit le focus) et annonce « Plus aucun produit à afficher ».
6. Cas limites : (a) carte masquée = dernière du fil → `ensureAhead` de l'étape 1 a déjà ajouté ≥ `AHEAD_MIN` cartes ; avec ≥ 3 produits visibles au moins 4 d'entre elles survivent ; (b) 2 produits visibles, on en masque 1 → il reste un seul produit : fil fini (§13.2), `sanitizeItems` réduit à 1 carte, le scroll est borné ; (c) deux masquages rapprochés : le flag `busy` ignore le second tant que le premier n'est pas terminé.
7. **Réafficher** (`EmptyState.onReset`) : `hidden.clear()`, `dispatch({type:'reset', visible: PRODUCTS})`, `feed.scrollTo({top: 0, behavior: 'instant'})`, focus sur le premier article, session effacée puis réécrite.

## 13.7 Double-tap, indice, animations

- **`useDoubleTap(onDouble)`** retourne `{ onPointerDown, onPointerUp }` à poser sur `.reel`. Un double-tap = deux `pointerup` à ≤ 300 ms d'intervalle, chacun avec un déplacement `pointerdown→pointerup` < 10 px, et distance entre les deux taps < 30 px. Ignorer si `e.target.closest('button, a, input, [role="menu"], [role="dialog"]')`. Fonctionne pour souris et tactile (un seul chemin ; pas d'`onDoubleClick` natif pour éviter un double déclenchement). `touch-action: manipulation` supprime le zoom au double-tap sans bloquer le pincement.
- **Effet** : `onFavoriteOnly()` appelle `favorites.add(ticker)` (jamais de retrait). `FavoriteBurst` s'affiche au centre de la carte : `BookmarkIcon` plein 96 px, `@keyframes burst` 600 ms (scale 0.6 → 1.2 → 1, opacity 1 → 0) ; `burstKey` incrémenté à chaque double-tap relance l'animation. `aria-hidden`. Annonce dans le live region : « {nom} ajouté aux favoris ». Si déjà favori, l'animation est rejouée et l'annonce devient « {nom} est déjà dans les favoris ».
- **Indice** (`SwipeHint`) : texte « Glisser vers le haut » + chevron animé (rebond vertical 1,2 s), positionné au-dessus du bas de la 1re carte. Affiché si `!readFlag('buy-demo:hint-seen')` et `activeIndex === 0`. `aria-hidden` (geste tactile). Marquer comme vu (`writeFlag` + état local) dès que `activeIndex > 0`, ou à la première navigation clavier réussie. Un simple affichage ne marque pas « vu » (un rechargement avant tout scroll réaffiche l'indice).
- **`prefers-reduced-motion`** (`useReducedMotion`, via `matchMedia`, abonné à `change`) : en JS, `behavior: 'auto'` au lieu de `'smooth'`, `EXIT_MS = 0`. En CSS, `@media (prefers-reduced-motion: reduce)` : `animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important`, rebond de l'indice supprimé (chevron statique), `burst` réduit à un fondu.

## 13.8 Menu ⋮ en bottom sheet (`BottomSheet`, `OverflowMenu`)

- Le bouton ⋮ (rail, libellé « Plus ») ouvre la feuille. Rendu dans un `createPortal(…, document.body)` (échappe à `contain` et `overflow: hidden` de la carte).
- Structure : `<div class="sheet-backdrop" onPointerDown=close>` + `<div class="sheet" role="dialog" aria-modal="true" aria-label={'Actions pour ' + productName}>` contenant `<div role="menu">` avec deux `role="menuitem"` : « Buy now » (icône panier), « Don't show me again » (icône interdit), puis un bouton « Annuler ». Cibles ≥ 48 px, glisse depuis le bas 200 ms (désactivé en reduced motion).
- Clavier : à l'ouverture, focus sur le 1er `menuitem`. `ArrowUp`/`ArrowDown` (avec rebouclage), `Home`/`End` parmi les `menuitem`. **`Tab` / `Shift+Tab` bouclent entre `menuitem`, `menuitem`, « Annuler »** (focus trap, `preventDefault`). `Échap` ferme. Clic ou `pointerdown` sur le backdrop ferme.
- **Retour de focus** : à la fermeture sans action (Échap, backdrop, Annuler) → bouton ⋮ (`triggerRef.focus()`). Après « Buy now » : navigation. Après « Don't show me again » : gestion de §13.6 (focus sur l'article suivant).
- Pendant l'ouverture : `.feed` reçoit l'attribut `inert` (React 19 : `inert` booléen) et le clavier du fil est désactivé (§13.3).
- Le `pointerdown` externe de v1 (listener `document`) disparaît au profit du backdrop.

## 13.9 Retour de la page d'achat : restauration de la position

**Principe** : on mémorise la **liste exacte des clés** du fil plutôt que de rejouer `buildPage`. Le fil étant modifié par les masquages, seule la liste de clés garantit une reconstruction identique.

- `feedSession.ts` : `FeedSession = { keys: string[]; activeKey: string | null; nextPage: number; nextSeq: number }`, clé `buy-demo:feed-session` (sessionStorage).
- **Écriture** : `useEffect([items, activeKey, nextPage, nextSeq])` dans `FeedPage` (hors premier rendu non modifié si inutile). Taille attendue : quelques ko.
- **Lecture à l'initialisation** (`useInfiniteFeed` + `useActiveReel`) : session valide ⇒ `items = keys.map(key => ({ key, product: byTicker[tickerOfKey(key)] }))`, en ignorant les clés dont le ticker est inconnu, puis `sanitizeItems(items, hidden.has)`. `nextPage` et `nextSeq` repris (`nextSeq = max(nextSeq, max(seq)+1)`). Session absente ou invalide ⇒ `reset`.
- **Position** : `activeKey` initial = clé mémorisée si elle existe encore dans `items`, sinon l'item au même rang borné (`min(indexMémorisé, items.length-1)`), sinon `items[0]`. Un `useLayoutEffect([])` fait `articles[index].scrollIntoView({ block: 'start', behavior: 'instant' })` **avant le premier paint**. Les coquilles ont toutes 100dvh, donc la position est exacte sans attendre le contenu lourd. La carte restaurée et ses voisins ±2 sont rendus lourds dès le premier rendu (`activeKey` initial).
- La vue détaillée et la quantité ne sont pas restaurées (état de carte). Le signet et les masqués viennent de localStorage, donc cohérents.
- Même mécanisme pour le bouton « Retour » du navigateur.

## 13.10 Accessibilité

- `<div class="feed" role="feed" aria-label="Recommandations d'achat">` ; chaque item `<article aria-label={name} aria-posinset={index+1} aria-setsize={-1} tabIndex={-1}>`. `-1` est la valeur ARIA pour une taille inconnue (fil infini). Les `posinset` sont recalculés après un masquage. Pas de `aria-busy` (pas de chargement asynchrone). La sentinelle est `aria-hidden`.
- Les placeholders restent des `<article>` avec leur `aria-label`, donc un lecteur d'écran peut parcourir le fil en mode navigation ; leur contenu est monté dès que le focus y entre (`onFocusCapture`) ou que l'IO les rend actifs.
- Clavier complet : `j/k/↑/↓/PageUp/PageDown`, Tab dans la carte active (signet, panier, ⋮, lien See more data, champ If I buy), Entrée/Espace sur les boutons. Après navigation clavier, le focus est donné à l'`<article>` cible (annonce du nom).
- Focus visible sur fond sombre : `:focus-visible { outline: 3px solid #fff; outline-offset: 2px; box-shadow: 0 0 0 5px rgba(0,0,0,.65) }` pour boutons, liens, `input`. Liens et textes en blanc ; plus de bleu `#1a56c4` sur fond sombre.
- Live region unique `role="status"` (sr-only) pour : masquage, favori, vide. Le `<h1 class="sr-only">` est conservé.
- `.feed:focus { outline: none }` n'est plus nécessaire (`<main>` n'est plus la cible de focus ; l'ancien `tabIndex={-1}` de `<main>` est supprimé).

## 13.11 Styles, desktop, divers

- Desktop (≥ 768 px) : `.feed { width: min(100vw, calc(100dvh * 9 / 16), 480px); margin: 0 auto }`, hors de la colonne fond `#0b0d10`. Mobile : colonne pleine largeur. Cartes toujours 100dvh.
- `disclaimer` : `position: absolute; top: 8px; left: 0; right: 0; z-index: 2; text-align: center; font-size: .7rem; opacity: .85`, texte blanc, `pointer-events: none`.
- `body { background: #0b0d10; margin: 0 }`. `.page-light` (BuyPage) : `min-height: 100dvh; max-width: 420px; margin: 0 auto; padding: 16px; background: var(--bg); color: var(--ink); overflow-y: auto`. Comme `body` est en `overflow: hidden`, `.page-light` doit scroller lui-même (`height: 100dvh; overflow-y: auto`).
- Supprimer de `global.css` : `.card`, `.card__footer`, `.card__actions`, `.card-nav`, `.feed { max-width/padding }`, `.overflow-menu__popup`. Conserver : `.icon-btn`, `.primary-btn`, `.history-grid`, `.mini-chart`, `.impact`, `.projection-chart`, `.legend`, `.quantity`, `.sr-only`, `.empty-state` (passe en plein écran, texte blanc).

## 13.12 Tests

**Stratégie jsdom (`src/test/setup.ts`)** : en plus de l'existant (jest-dom, `cleanup`, `localStorage.clear()`, `hash = ''`), ajouter `sessionStorage.clear()` dans `afterEach` et ces stubs globaux :
- `IntersectionObserver` : classe `MockIntersectionObserver` qui enregistre ses instances (`observers[]`, avec `root`, `options`, éléments observés). Helper exporté depuis `feedTestUtils.ts` : `intersect(el, { isIntersecting, ratio })` invoque les callbacks des observers concernés (enveloppé dans `act`). `activate(key)` = `intersect(article[data-key=key], {isIntersecting: true, ratio: 0.8})`. `reachSentinel()` déclenche l'observer de la sentinelle.
- `Element.prototype.scrollIntoView = vi.fn()` ; `Element.prototype.scrollTo = vi.fn()` (jsdom n'a ni l'un ni l'autre sur les éléments). Remis à zéro dans `afterEach`.
- `window.matchMedia` : stub renvoyant `{ matches, media, addEventListener, removeEventListener, addListener, removeListener }`. **Par défaut `reduce` = `true`** (masquage immédiat, `behavior: 'auto'`, tests déterministes). Helper `setReducedMotion(false)` pour les tests qui vérifient l'animation avec `vi.useFakeTimers()`.
- `HTMLElement.prototype.focus` : natif jsdom suffit. `clientHeight` vaut 0 en jsdom : la **logique de compensation est donc testée en pur** (fonction `computeScrollTopAfterPrune(oldActiveIndex, removedAbove, height)` exportée de `lib/feed.ts`) et dans les tests d'intégration on se contente de vérifier l'appel à `scrollTo`.
- Aucune dépendance de test ajoutée.

**Tests à écrire** :
- `feed.test.ts` : `buildPage` déterministe (mêmes entrées → même sortie) ; taille `PAGE_SIZE` ; aucun doublon consécutif sur 50 pages enchaînées avec 2, 3 et 16 produits visibles, **y compris à la frontière de pages** ; `prevTicker` respecté en 1er emplacement ; 1 seul produit visible : `[p]` si `prevTicker !== p.ticker`, `[]` sinon ; 0 produit → `[]` ; `toItems` produit des clés uniques et `tickerOfKey` inverse la clé ; `sanitizeItems` retire un ticker et supprime les doublons adjacents créés (A B A, B masqué → A) ; `isHeavy` (rayon 2) ; `computeScrollTopAfterPrune`.
- `products.test.ts` : ≥ 15 produits, tickers uniques, `brandColor` `#rrggbb`, 3 raisons, ordre des taux, contraste ≥ 4.5 (`color.test.ts` couvre les fonctions).
- `color.test.ts` : `mixWithBlack`, `contrastRatio('#000','#fff') ≈ 21`.
- `storage.test.ts` : `readFlag`/`writeFlag` (absent, `"1"`, `setItem` qui lève). `feedSession.test.ts` : aller-retour, JSON invalide, forme invalide → `null`.
- `feedApp.test.tsx` (rendu de `<App/>` avec les stubs) :
  1. **Rendu initial** : `role="feed"`, 8 `article`, `aria-posinset` 1..8, `aria-setsize="-1"`, seule la fenêtre active ±2 contient « Pourquoi : », plus d'élément « 1 / 5 » ni de bouton « Produit suivant ».
  2. **Ajout de pages** : `reachSentinel()` → 16 articles ; à nouveau → 24 ; les clés `data-key` sont toutes uniques.
  3. **Pas de doublon consécutif** : sur 5 pages ajoutées, aucun `aria-label` identique pour deux articles consécutifs.
  4. **Fenêtre de rendu** : `activate(clé de l'item 6)` → l'item 6 et ses voisins ±2 montent leur contenu, l'item 0 redevient placeholder.
  5. **Clavier** : `j`, `ArrowDown`, `PageDown` appellent `scrollIntoView` sur l'item suivant et lui donnent le focus ; `k`, `ArrowUp`, `PageUp` sur le précédent ; sans effet avant le 1er / après le dernier ; ignoré si le focus est dans `If I buy` (taper `j`), si une feuille est ouverte, ou avec Ctrl.
  6. **Masquage** : feuille ⋮ → « Don't show me again » → plus aucun `article` ne porte le nom du produit (toutes occurrences, y compris après ajout de pages), `localStorage['buy-demo:hidden']` mis à jour, focus sur l'article qui prend la place, live region annonce le masquage, `scrollTo` appelé ; pas de doublon consécutif après masquage ; avec `setReducedMotion(false)` et timers factices, `reel--leaving` est posé puis l'article disparaît après 220 ms.
  7. **Masquer tout** : après avoir masqué les 16 produits, `EmptyState` « Plus aucun produit à afficher » est plein écran, `h2` focalisé ; « Réafficher les produits masqués » vide `hidden`, rend un fil de 8 cartes, focus sur le 1er.
  8. **Fil fini à 1 produit** : 15 masqués dans `localStorage` → 1 article, pas de sentinelle.
  9. **Indice** : « Glisser vers le haut » visible au premier lancement ; disparaît et `localStorage['buy-demo:hint-seen'] === '1'` après `activate(clé de l'item 1)` ; absent si le flag est déjà posé.
  10. **Double-clic favori** : `user.dblClick(article)` → `aria-pressed="true"` sur le signet, `favorites` persisté, `FavoriteBurst` présent ; un second double-clic ne retire pas le favori ; double-clic sur un bouton du rail ne déclenche rien.
  11. **Vue détaillée** : « See more data » affiche « Historique du produit », « Impacts prévus sur le portefeuille », « If I buy » = 10 ; `activate` d'une autre carte puis retour → résumé.
  12. **Feuille ⋮** : `role="dialog"` `aria-modal`, focus sur « Buy now », flèches, Tab/Shift+Tab bouclent (3 arrêts), Échap rend le focus au ⋮, clic sur le backdrop ferme, `.feed` a `inert` pendant l'ouverture.
  13. **Restauration** : `activate(clé de l'item 3)`, ⋮ → « Buy now » (`#/buy/…`), clic « ← Retour » → le fil se remonte avec les **mêmes clés**, `scrollIntoView` a été appelé sur l'item 3 (`behavior: 'instant'`) et son contenu est lourd. Variante : la clé mémorisée a disparu (ticker masqué entre-temps) → repli sur le rang borné ; session corrompue → fil neuf.
- Tests existants à adapter : `app.test.tsx` (1 « 1 / 5 », 4 « 1 / 4 », 7 « 5 produits », navigation ‹ ›), `a11y.test.tsx` (« Tab » du menu, `<main>` focalisé après masquage, « 1 / 1 »).

## 13.13 Liste des fichiers

**Créer** (17) : `src/lib/feed.ts`, `src/lib/feedSession.ts`, `src/lib/color.ts`, `src/hooks/useInfiniteFeed.ts`, `src/hooks/useActiveReel.ts`, `src/hooks/useFeedKeyboard.ts`, `src/hooks/useDoubleTap.ts`, `src/hooks/useReducedMotion.ts`, `src/components/Reel.tsx`, `src/components/CardMeta.tsx`, `src/components/ActionRail.tsx`, `src/components/BottomSheet.tsx`, `src/components/SwipeHint.tsx`, `src/components/FavoriteBurst.tsx`, `src/test/feedTestUtils.ts`, `src/test/feed.test.ts`, `src/test/feedApp.test.tsx`, plus `src/test/feedSession.test.ts`, `src/test/color.test.ts`, `src/test/products.test.ts`.

**Modifier** : `src/types.ts` (+ `FeedItem`), `src/data/products.ts` (16 produits), `src/lib/storage.ts` (+ flags), `src/pages/FeedPage.tsx`, `src/pages/BuyPage.tsx` (wrapper `page-light`), `src/App.tsx` (aucun changement de logique attendu), `src/components/ProductCard.tsx`, `CardSummary.tsx`, `CardDetails.tsx`, `OverflowMenu.tsx`, `BookmarkButton.tsx`, `CartButton.tsx`, `EmptyState.tsx`, `src/styles/global.css`, `index.html` (`viewport-fit=cover`), `src/test/setup.ts`, `src/test/app.test.tsx`, `src/test/a11y.test.tsx`, `src/test/storage.test.ts`. Hors `docs/` : `README.md` et `docs/PLAN.md` seront à mettre à jour par devops-docs (fonctionnalités, « Pas de balayage tactile », « boutons ‹ / › »).

**Supprimer** : `src/components/CardNav.tsx`, `src/components/CardFooter.tsx`.

**Ne pas toucher** : `vite.config.ts`, `package.json` (aucune dépendance), `generateSeries.ts`, `projections.ts`, `chartMath.ts`, `format.ts`, `useHashRoute.ts`, `usePersistentSet.ts`, `TickerLogo`, `MiniChart`, `ProjectionChart`, `QuantityInput`, `Icons`.

## 14. Page « Sauvegardés » (v3, option A)

Maquette retenue : `docs/mockups/saved-page/option-a-liste.png` (comparatif dans `comparatif.png`).

### 14.1 Navigation
- Route hash `#/saved` (`parseHash` → `{ name: 'saved' }`). `App` rend `FeedPage` ou `SavedPage` dans `.app-shell`, suivis de `TabBar` (liens `#/` et `#/saved`, `aria-current="page"`). La page d'achat n'a pas de barre d'onglets.
- La barre est fixe en bas (`--tabbar-h: 56px + safe-area`). Le fil, les cartes, l'état vide et la page utilisent `--view-h = 100dvh - --tabbar-h`.
- Toucher une ligne : `App` mémorise `startTicker` puis navigue vers `#/`. `FeedPage` construit alors le fil avec `createFeedStartingWith(visible, product)` (le produit en tête, nouvelle clé unique, jamais deux fois d'affilée), ignore l'instantané de session, puis appelle `onStartConsumed`.
- Dans le fil, sauvegarder un produit (signet ou double-tap, uniquement à l'ajout) affiche 3 s le message « Ajouté aux sauvegardés · Voir » ; « Voir » ouvre `#/saved`.

### 14.2 Données (`lib/saved.ts`, pur)
- `savedProducts(products, favorites.values, hidden.has)` : ordre « plus récent d'abord » (inverse de l'ordre d'insertion du `Set` persisté), tickers inconnus et produits masqués exclus.
- `filterAndSort(list, query, sort)` : recherche sur ticker et nom, insensible à la casse et aux accents (NFD) ; tri `recent` (ordre d'entrée), `change` (variation décroissante), `name` (`localeCompare` fr).
- `changeOf(product)` : variation entre le premier et le dernier point de `history[0]` ; `trendOf` : stable si |variation| < 2 % (même seuil que `MiniChart`) ; `formatChange` : `Intl` fr-FR, signe affiché.
- `PersistentSet` gagne `values` (ordre d'insertion) et `replace(list)` (annulation d'un retrait en conservant la position).

### 14.3 Composants
- `SavedPage { products, favorites, hidden, onOpen(t), onGoToFeed }` : titre, compteur, recherche (`type="search"`, label masqué), groupe de tris (`aria-pressed`), `ul` de `SavedRow`, aide « Toucher : ouvrir dans le fil · Glisser à gauche : retirer », état vide, message « X retiré · Annuler » (5 s), région `role="status"`.
- `SavedRow { product, onOpen, onRemove }` : bouton principal (nom accessible complet : nom, ticker, prix, variation, tendance) et bouton « Retirer » (96 px) placé derrière. Glissement horizontal par Pointer Events (seuil 8 px, `touch-action: pan-y` pour laisser défiler verticalement), aimantation ouverte si > 48 px ; le clic qui suit un glissement est ignoré ; un toucher sur une ligne ouverte la referme. Au clavier, le focus sur « Retirer » (après la ligne dans l'ordre de tabulation) fait glisser la ligne.
- `Sparkline { series, trend }` : décoratif (`aria-hidden`), la tendance est donnée en texte. `TabBar { current }`. Icônes `HomeIcon`, `SearchIcon`.

### 14.4 Hypothèses
- Les libellés existants « Ajouter aux favoris » / « Favori » sont conservés dans le fil (tests existants) ; la page s'appelle « Sauvegardés » comme sur la maquette.
- Un produit masqué (« Don't show me again ») reste dans `buy-demo:favorites` mais n'apparaît pas dans la liste ; il revient si on réaffiche les produits masqués.
- Les tris et la recherche ne sont pas persistés.

## 15. Profil et portefeuilles (v4, option B)

Maquettes : `docs/mockups/profile/` (option B retenue : `option-b-onglets-cartes.png`, écrans communs dans `ecrans-communs.png`).

### 15.1 Modèle (`lib/account.ts`)
- `Account { name, shared: SharedProfile, portfolios: Portfolio[], activeId }`, un seul compte local.
- `SharedProfile` (partagé par tous les portefeuilles) : `financial { income, emergencyFund }`, `obligations { debts[], dependents }`, `experience { level, instruments[] }`, `preferences { esg, exclusions: ExclusionTag[] }`. Chaque section vaut `null` tant qu'elle n'est pas remplie (« À compléter », « profil à compléter (n/4) »).
- `Portfolio` (paramètres propres) : `name, goal, horizonYears (1–40), risk (prudent | balanced | dynamic), initialAmount, monthlyContribution, withdrawal (none | partial | total), color, positions[] { ticker, quantity, price }`.
- Persistance `buy-demo:account` (JSON). `parseAccount` valide chaque champ (listes fermées, bornes numériques, ids uniques, `activeId` existant) ; une valeur illisible retombe sur `demoAccount()`. Écriture après chaque changement, jamais au montage.
- `suggestRisk(answer, horizon, shared)` : la réponse au questionnaire est plafonnée à Prudent si l'horizon < 3 ans, à Équilibré si < 7 ans, si revenus précaires ou aucun fonds d'urgence, si expérience débutante, ou si 3 personnes à charge ou plus. Les raisons sont affichées.
- `projectPortfolio` : capitalisation annuelle au taux médian fictif du risque (3 / 5 / 7 %) + versements mensuels × 12.
- `riskWarning(product, portfolio)` : scénario pessimiste ≤ −15 % pour un portefeuille prudent, ≤ −30 % pour un équilibré.

### 15.2 État et routes
- `useAccountState()` (dans `App`) expose `account`, `active` et les actions `rename`, `updateShared`, `createPortfolio`, `updatePortfolio`, `deletePortfolio`, `setActive`, `buy` (fusion des positions au prix moyen pondéré). `AccountProvider` / `useAccount()` donnent l'accès aux composants profonds (`CardDetails`, `BuyPage`) sans passer par le `Reel` mémoïsé.
- Routes : `#/profile` (onglet Profil de la barre), `#/profile/new`, `#/profile/edit/<id>` (questionnaire plein écran, sans barre d'onglets). Au retour, `App` passe `focusId` pour faire défiler la carte créée ou modifiée.
- Exclusions : `App` calcule `products = CATALOG.filter(!isExcluded)` pour le fil et les sauvegardés. `CATALOG = PRODUCTS (16) + FICTIONAL_PRODUCTS (3, champ `exclusion`)` ; le compte de démonstration exclut les 3 secteurs concernés, donc le fil par défaut est inchangé. La page d'achat cherche dans `CATALOG`.

### 15.3 Écrans
- `ProfilePage` : avatar (initiales), nom, « n portefeuilles · profil complet », bouton « + Nouveau » (§25), onglets `role="tablist"` (flèches gauche/droite), carrousel `ul` en `scroll-snap-type: x` de `PortfolioCard`, points de pagination (boutons), « + Créer un portefeuille » quand il n'y a aucun portefeuille.
- `PortfolioCard` : badge « Actif » ou bouton « Définir comme actif », « Modifier », objectif, valeur des positions, liste des positions, projection médiane (SVG décoratif + texte), grille Horizon / Risque (`RiskDots`) / Mise initiale / Retraits.
- `InvestorProfile` : accordéon (nom du compte + 4 sections). Formulaires en radios et cases natives stylées en pastilles, compteur de personnes à charge, interrupteur ESG `role="switch"`, nombre de produits du fil exclus en direct.
- `PortfolioWizard` : 4 étapes (objectif et nom, horizon par curseur ou raccourcis, réaction à une baisse de 20 % puis profil retenu, mise initiale, versement mensuel et retraits avec projection). Focus sur le titre à chaque étape, récapitulatif des réponses précédentes. En modification : suppression en deux clics.
- `BuyPage` : quantité, choix du portefeuille (actif par défaut), avertissement de volatilité, mention si le produit fait partie des exclusions ; le message de confirmation précise le portefeuille.
- `CardDetails` : « Portefeuille actif « X » (risque) : cet achat représenterait n % de la mise initiale prévue », avec l'avertissement éventuel.

## 16. Un fil et des sauvegardés par portefeuille (v5)

Décision utilisateur : « profil » = portefeuille (1a) ; chaque portefeuille a ses propres listes, avec les mêmes produits proposés (2a). Les exclusions ESG restent au niveau du compte.

- **Portée (`lib/portfolioScope.ts`)** : `scope = activeId ?? 'default'`. Clés : `buy-demo:favorites:<scope>`, `buy-demo:hidden:<scope>` (localStorage), `buy-demo:feed-session:<scope>` (sessionStorage, `feedSessionKey`).
- **Migration** : à l'initialisation du compte (`useAccountState`), `migrateLegacyLists(scope actif)` déplace les anciennes clés sans suffixe vers le portefeuille actif, sans écraser une liste existante, puis les supprime. Idempotente.
- **Suppression** : `deletePortfolio` appelle `clearScope(id)`.
- **Changement de portefeuille** : `usePersistentSet(key)` recharge l'ensemble quand la clé change (réinitialisation pendant le rendu), sans rien écrire. `FeedPage` et `SavedPage` reçoivent `key={scope}` : le fil est reconstruit depuis la session du portefeuille (`restoreFeed(..., sessionKey)`), ou neuf. La page Profil n'est pas remontée (le carrousel garde sa position).
- **Sélecteur** : `PortfolioSwitcher` (`<select>` natif étiqueté « Portefeuille actif »), en surimpression en haut du fil et sous le titre des Sauvegardés ; masqué s'il n'y a aucun portefeuille. Le contenu des cartes et le message « Ajouté aux sauvegardés » sont décalés de 72 px pour lui laisser la place.
- **Tests existants** : les clés littérales ont été renommées vers la portée du compte de démonstration (`demo-retirement`) ; aucune assertion n'a changé.

## 17. Ordre des portefeuilles : le plus récemment utilisé d'abord (v6)

- « Utilisé » = défini comme portefeuille actif (carrousel du Profil, sélecteur du fil ou des Sauvegardés).
- `Account.recent: string[]` : ids du plus récent au plus ancien, chaque portefeuille une fois. `touchRecent` met un id en tête ; `normalizeRecent` retire les ids inconnus et les doublons, ajoute les portefeuilles jamais utilisés (ordre de création) et force l'actif en tête. Les comptes enregistrés avant cette version sont migrés à la lecture (actif, puis ordre de création).
- `setActive` met l'id en tête (aucune écriture s'il y est déjà) ; supprimer l'actif active le plus récent des restants. ~~Un portefeuille créé va en dernier tant qu'il n'est pas utilisé.~~ Depuis la v11 (§22), un portefeuille créé devient actif et passe en tête.
- `ProfilePage` fige l'ordre (`portfoliosByRecent`) à son arrivée : « Définir comme actif » ne déplace pas les cartes, le nouvel ordre s'applique à la visite suivante. Le carrousel commence donc sur le portefeuille actif. `focusId` (retour du questionnaire) n'est utilisé qu'une fois (`onFocusConsumed`).
- `PortfolioSwitcher` liste les options dans le même ordre.

## 18. Icône de portefeuille (v7)

- `Portfolio.icon: PortfolioIcon` parmi 12 (`ICONS`, libellés accessibles `ICON_LABEL`). `GOAL_ICON` donne l'icône par défaut d'un objectif ; les portefeuilles enregistrés sans icône (ou avec une valeur inconnue) reçoivent celle de leur objectif à la lecture.
- `PortfolioGlyph` (`components/PortfolioIcons.tsx`) : icônes au trait 24×24, décoratives (`aria-hidden`), le sens est toujours donné par le texte voisin. Le tracé de l'avion vient de Lucide (licence ISC).
- Questionnaire, étape 1 : groupe de radios « Icône » (grille 6 × 2). L'icône suit l'objectif tant que l'utilisateur n'en a pas choisi une ; en modification, elle est considérée comme choisie.
- `TabBar` : l'onglet « Profil » affiche l'icône du portefeuille actif dans une pastille de sa couleur (personne si aucun portefeuille). `PortfolioSwitcher` et `PortfolioCard` l'affichent aussi.

## 19. Liens vers BNCD (v8)

Le croquis prévoyait « Buy now → page du produit sur BNCD ». URL fournie par l'utilisateur : `https://client.bnc.ca/cdbn/markets/quote/STOCK/NVDA/USA/overview/chart` (page de cote de la plateforme, connexion requise).

- `lib/bncd.ts` : `BNCD_QUOTE_URL` avec `{symbol}` et `{market}` (encodés), `bncdQuoteUrl(product)` ; `null` pour `product.fictional`. Marché par défaut `USA` (les 16 sociétés réelles sont cotées aux États-Unis ; champ `Product.market` pour un autre marché).
- Sauvegardés : la ligne est un lien `<a target="_blank" rel="noopener noreferrer">` vers BNCD. Après un glissement, ou quand la ligne est ouverte sur « Retirer », le clic est annulé (`preventDefault`). Une société fictive garde le bouton « ouvrir dans le fil ».
- Panier (ex-« Achat simulé », route `#/buy/<ticker>`, ouvert par `Buy now` et l'icône panier) : quantité et portefeuille ; « Continuer sur BNCD » est un lien (pas de `window.open`, donc pas de blocage de fenêtre) dont le clic enregistre la position puis ouvre BNCD dans un nouvel onglet. Quantité nulle : `aria-disabled` et clic annulé. Société fictive : bouton « Ajouter au portefeuille » sans lien.
- Tests existants adaptés : titre « Panier », lien et `href` BNCD vérifiés dans le parcours (6).

## 20. Redirection directe vers BNCD (v9)

Décision de l'utilisateur, prise après l'audit de conformité (`docs/conformite-datathon.md`) : supprimer l'écran intermédiaire entre l'action et l'achat.

- `App.buy(ticker)` : si `bncdQuoteUrl(product)` existe, `window.open(url, '_blank', 'noopener,noreferrer')` est appelé **dans le clic**, ce qui évite le blocage des fenêtres surgissantes. Le menu ⋮ appelle son action de façon synchrone. Sinon (société fictive), navigation vers le panier simulé `#/buy/<ticker>`.
- Le fil ne change pas de route : la carte, la position et les produits masqués restent tels quels.
- Accessibilité : l'élément de menu se nomme « Buy now (Ouvre BNCD dans un nouvel onglet) », avec un repère visuel « ↗ BNCD » masqué aux lecteurs d'écran. Le panier du rail garde le nom « Acheter » et reçoit la description « Ouvre BNCD dans un nouvel onglet ».
- Conséquence : les achats de sociétés réelles ne créent plus de position dans les portefeuilles de la démo.
- Tests : `window.open` est simulé dans `src/test/setup.ts`. Les tests du parcours (6) et (6b) vérifient l'URL exacte et l'absence de navigation. Les tests de restauration de position font l'aller-retour par l'onglet Sauvegardés.

## 21. Note « Pour » / « Contre » (v10)

Maquettes : `docs/mockups/rating/comparatif-like-dislike.png` (4 familles), puis `variantes-chevrons.png` (6 variantes à chevrons). **Choix final : B1, doubles chevrons**, sans cœur ni pouce.

- Nature : une note personnelle sur l'action. Elle n'ajoute pas aux Sauvegardés et ne modifie ni le fil ni les recommandations.
- `hooks/useRatings.tsx` : `Rating = 'up' | 'down'`, libellés `Pour` / `Contre`. `useRatingsState(key)` gère une table `{ ticker: rating }` en localStorage. Elle est rechargée sans écriture quand la clé change, comme `usePersistentSet`. Les valeurs inconnues sont ignorées à la lecture. `rate(t, r)` pose la note, ou l'annule si `r` est déjà la note.
- Portée : `ratingsKey(scope)` = `buy-demo:ratings:<id du portefeuille>`. `clearScope` l'efface à la suppression du portefeuille.
- Accès : `RatingsProvider` dans `App`, `useRatings()` dans les composants. Le `Reel` mémoïsé n'a pas besoin de nouvelles props.
- `components/Rating.tsx` :
  - `RatingIcon` : les tracés des chevrons, à un seul endroit.
  - `RatingButtons` : groupe « Votre note sur X », deux boutons `aria-pressed` dans le rail, sous le signet. Actif : pastille verte (Pour) ou rouge (Contre).
  - `RatingBadge` : pastille à côté du ticker de la carte et sur la ligne des Sauvegardés, avec le texte masqué « Votre note : ». Sur la ligne des Sauvegardés, la note est aussi ajoutée au nom accessible du lien.

## 22. Portefeuille actif à la création ; actifs et encaisse (v11)

- `createPortfolio` : le nouveau portefeuille devient actif (`activeId = id`, `touchRecent`). Il apparaît donc en premier dans le carrousel et dans le sélecteur, et l'onglet Profil prend son icône. Le fil et les Sauvegardés passent à ses listes, vides au départ.
- `Portfolio.cash` (USD) = **Encaisse**, l'argent non investi. **Actifs (actions)** = `investedValue` = Σ quantité × prix d'achat. `portfolioValue` = actifs + encaisse.
  - Création : `cash = initialAmount`.
  - Achat simulé (`buy`) : `cash -= prix × quantité`. L'achat est refusé si l'encaisse est insuffisante ; le panier affiche « Encaisse insuffisante » et désactive le bouton.
  - Modification de la mise initiale (`updatePortfolio`) : l'encaisse varie de la même différence, sans descendre sous 0 (`cashAfterInitialChange`).
  - Portefeuilles enregistrés avant la v11, sans `cash` : `initialCash` = mise initiale − montant investi, minimum 0. Dans la démo, Retraite a 7 985 $ d'encaisse et 2 015 $ d'actifs.
  - Non modélisé : versements mensuels versés à l'encaisse, ventes, évolution des cours. Les achats faits sur BNCD ne sont pas enregistrés (§20).
- `PortfolioCard` : valeur totale, barre de répartition (actifs en blanc, encaisse en translucide), légende « Actifs (actions) » et « Encaisse » avec montant et pourcentage, puis la liste des positions.

## 23. Achat vers BNCD enregistré dans le portefeuille actif (v12)

Demande : « lorsque j'achète (que je vais sur un lien) […] ajouter des actions à mon portefeuille, même s'il n'est pas certain que l'achat soit fait ».

- Déclencheurs : `Buy now` (menu ⋮) et l'icône panier de la vue détaillée. Toucher une ligne des Sauvegardés reste une consultation et n'ajoute rien.
- Quantité : la valeur « If I buy » de la carte (état local de `ProductCard`, 10 par défaut), transmise par `onBuy(quantity)` → `Reel` → `FeedPage` → `App.buy(ticker, quantity)`.
- `App.buy` :
  1. `window.open` (dans le clic) ;
  2. si un portefeuille est actif, que la quantité est > 0 et que l'encaisse couvre prix × quantité : `account.buy(..., { unconfirmed: true })`, puis un message « n TICKER ajoutées à « Nom » (achat BNCD non confirmé) · Annuler » pendant 6 s ;
  3. sinon, BNCD s'ouvre quand même. En cas d'encaisse insuffisante, un message l'indique et rien n'est ajouté.
- `Position.unconfirmed?: true` : une position fusionnée avec une part non confirmée devient non confirmée. La carte du portefeuille l'affiche : « NVDA ×13 (achat BNCD non confirmé) ».
- « Annuler » : `restoreHoldings(id, positions, cash)` remet l'instantané pris juste avant l'achat.
- Le message n'a pas de rôle ARIA, seulement `aria-live="polite"` sur son conteneur, pour ne pas créer une seconde région `role="status"` à côté de celle du fil.
- Limites : rien ne vérifie l'exécution réelle sur BNCD ; les ventes et les annulations faites sur BNCD ne sont pas répercutées.

## 24. Carte de portefeuille : encaisse d'abord, liste des positions (v13)

- Répartition : la barre a deux segments, encaisse (translucide) puis actifs (blanc). La légende suit le même ordre : « Encaisse », puis « Actifs (actions) ».
- `components/PositionList.tsx` remplace la liste des positions en texte. Il reprend la présentation des Sauvegardés en plus compact : grille `28px 1fr 48px auto`, avec le logo, « TICKER ×quantité », le nom ou « Achat BNCD non confirmé », une mini-courbe sur 12 mois, la valeur de la position (quantité × prix d'achat) et une pastille de variation (`changeOf`, couleurs de `saved-row__pill`).
- Tri par |variation sur 12 mois| décroissante. Les 3 premières lignes sont affichées (`VISIBLE_POSITIONS`), puis un bouton `aria-expanded` « Voir les n autres positions de X » ou « Afficher moins ». Un ticker inconnu du catalogue est affiché sans logo, sans courbe et sans variation.
- La liste est étiquetée par son titre « Positions (n) · plus fortes variations ». La pastille porte un texte masqué « sur 12 mois ».
- v13b : ordre des blocs de la carte = répartition Encaisse / Actifs (barre + légende), **puis** la valeur totale, présentée comme une ligne de somme (trait fin au-dessus), puis la liste des positions.
- v13c : l'encaisse et les actifs sont les chiffres principaux de la carte (`.pf-split__amount`, 1,25 rem en gras, pourcentage en dessous ; 1,05 rem sous 360 px). La valeur totale est réduite à une petite ligne « Valeur totale … » sous la répartition (`.pf-card__total`, 0,8 rem).

## 25. Barres de défilement masquées, Profil compact (v14)

Demande : faire disparaître la barre de défilement, très visible, et idéalement voir le menu en entier d'un coup.

- Décision : masquer les barres (`scrollbar-width: none` et `::-webkit-scrollbar { display: none }`) sur `.profile-page`, `.saved-page`, `.wizard`, `.page-light` et `.investor`. Le fil les masquait déjà. Le défilement reste possible en secours : le contenu varie (nombre de positions, « Voir les autres »), et une hauteur figée couperait le contenu sur un petit écran ou avec un zoom ou un texte agrandi (WCAG 1.4.10, reflow). Le questionnaire et le profil investisseur sont plus longs qu'un écran par nature.
- Profil compacté pour tenir d'un coup sur environ 390 × 844 :
  - en-tête sur une ligne (avatar de 44 px, nom et état du profil, bouton « + Nouveau » avec le nom accessible « Créer un portefeuille ») ;
  - onglets plus bas ;
  - carte resserrée (titre de 1,2 rem, lignes de positions de 40 px, courbe de 30 px, grille de paramètres plus dense) ;
  - le grand bouton « + Créer un portefeuille » ne s'affiche que s'il n'y a aucun portefeuille.
- Estimation, faute de navigateur pour mesurer : environ 610 px pour Retraite (2 positions) et environ 690 px avec 3 positions et « Voir les autres », pour environ 788 px disponibles (844 − barre d'onglets). Dans Safari avec ses barres visibles, il reste environ 610 px : le dernier cas peut défiler un peu.

## 26. Profil sur toute la hauteur de l'écran (v15)

Demande : « utiliser plus de verticalité pour avoir plus d'espace ».

- Mise en page : `.profile-page` est une colonne flex. Le panneau Portefeuilles (`.profile-panel`) et le carrousel (`.pf-track`) prennent la hauteur restante (`flex: 1 0 auto`, jamais moins que leur contenu). Chaque carte s'étire à cette hauteur. La projection et la grille des paramètres sont poussées en bas de la carte (`margin-top: auto`), et la place gagnée revient à la liste des positions. La carte suivante dépasse de 40 px au lieu de 52.
- Positions visibles selon la hauteur de l'écran : 3, puis 5 dès 880 px, 7 dès 1 000 px, 10 dès 1 150 px (`VISIBLE_BY_HEIGHT` et media queries `min-height` dans `global.css`). Toutes les lignes sont rendues ; le CSS masque celles au-delà du seuil tant que la liste n'est pas ouverte (`.pos-list--open`).
- Les classes `pos-list--gtN` indiquent s'il reste des lignes cachées à chaque seuil. Le bouton unique « Voir toutes les positions (n) » / « Afficher moins » (`aria-expanded`) n'est affiché que dans ce cas.
- Non vérifié dans un vrai navigateur, faute de bibliothèques système pour en lancer un sans interface (§25).

## 27. Profil sans défilement sur téléphone (v16, remplace §26)

Demande : « sur téléphone je souhaite ne pas avoir à dérouler ».

- La page Profil est une colonne flex : en-tête, onglets, puis le panneau Portefeuilles (`flex: 1 1 0`), qui prend exactement la hauteur restante (`--view-h`, en `dvh`, donc juste aussi dans Safari quand ses barres s'affichent ou se cachent). Chaque carte s'étire à cette hauteur.
- Dans la carte, tous les blocs gardent leur hauteur naturelle, sauf la liste des positions (`flex: 1 1 0; min-height: 0`), qui reçoit le reste.
- `PositionList` mesure la zone de ses lignes (`clientHeight`, et `ResizeObserver` quand on tourne le téléphone ou change la taille de la fenêtre), puis affiche seulement `floor(hauteur / hauteur d'une ligne)` lignes, triées par plus forte variation. Les seuils fixes de la v15 sont supprimés. Sans mise en page mesurable (tests jsdom), il en affiche 3.
- « Voir toutes les positions (n) » apparaît s'il reste des lignes cachées. Il ouvre un `BottomSheet` (« Positions de X », focus sur « Fermer », Échap et clic à l'extérieur pour fermer) au lieu d'agrandir la carte, ce qui ferait défiler la page. Ce panneau a son propre défilement, sans barre, s'il y a beaucoup de positions.
- Garde-fou : `min-height: min-content` sur le panneau et le carrousel. Si même les blocs fixes ne tiennent pas (zoom, texte agrandi, écran très petit), la page défile au lieu de couper du contenu (WCAG 1.4.10).
- Estimation sur un iPhone SE (375 × 667, le plus petit cas courant) : environ 370 px de blocs fixes dans la carte, ce qui laisse environ 90 px, soit 2 lignes de positions. Retraite (2 positions) tient donc sans bouton. Sur 390 × 844 : environ 6 lignes. Non vérifié dans un vrai navigateur.
- Hors périmètre : l'onglet « Profil investisseur » une fois une section ouverte, et le questionnaire de portefeuille, restent plus longs qu'un écran et défilent (sans barre).

## 28. Correctif mobile : page Profil qui défilait, barre d'onglets qui disparaissait (v17)

Symptômes signalés sur téléphone : la page Profil défile encore, et la barre d'onglets (pied de page) disparaît.

- **Cause 1, la page défile** : en v16, `min-height: min-content` sur le panneau et le carrousel comptait la hauteur de toutes les lignes de positions affichées. La carte ne pouvait donc pas descendre sous 3 lignes, la valeur de départ, et `PositionList` mesurait alors toujours au moins 3 lignes. Correctif : `contain: size` sur `.pos-list__rows`. Les lignes ne comptent plus dans la hauteur minimale, la carte se réduit à l'écran et la mesure donne le vrai nombre de lignes qui tiennent. Le minimum `min-content` ne couvre plus que les blocs fixes, et reste le garde-fou en cas de zoom.
- **Cause 2, la barre disparaît** : la barre d'onglets était en `position: fixed; bottom: 0`. Sur mobile, elle suit le bas de la zone d'affichage théorique (`100vh`, plus haute que l'écran visible quand les barres du navigateur sont affichées) et peut passer sous la barre de Safari.
- **Nouvelle structure** :
  - `html`, `body` et `#root` mesurent `100dvh`, soit l'écran visible, avec repli sur 100 %.
  - `.app-shell` est une colonne flex : `.app-view` (`flex: 1 1 0; min-height: 0; overflow: hidden`) contient la page, et la barre d'onglets est **dans le flux** (`position: relative; flex-shrink: 0`).
  - `--view-h` vaut désormais `100%`, la hauteur de `.app-view` ; le fil, les cartes, les Sauvegardés, le Profil et l'état vide l'utilisent. Une page ne peut plus repousser la barre hors de l'écran.
  - Les messages (toasts) restent en `fixed`, au-dessus de la barre (`--tabbar-h`).
- Non vérifié dans un vrai navigateur ni sur téléphone (aucun navigateur sans interface ne fonctionne dans cet environnement, §25).

## 29. Thème « Blanc et rouge BNC » (v18)

Choix de l'utilisateur : la palette 1 de `docs/mockups/palettes-bncd/`, sans aucune modification de la position des éléments.

- Couleurs : jetons du site BNC Courtage direct (feuille de style de nbc.ca/fr/courtage-direct, variables `--idt__color-*`, consultée le 2026-11-14).
  - rouge #DE161D (action, onglet actif, cadre du portefeuille actif, badge « Actif ») ;
  - noir #000 (texte, éléments sélectionnés : filtres, onglet « Portefeuilles », choix) ;
  - texte secondaire #585858 ;
  - surfaces #F6F6F6, sable #F7F4F0 (encadrés d'information) ;
  - bordures #B5B5B5 et #DADADA ;
  - hausses en vert #3E6246, baisses et erreurs en #BA1218 ;
  - fil : fond blanc teinté à 20 % de la couleur du produit.
- Mise en œuvre : `src/styles/theme-bnc.css`, importé après `global.css` dans `main.tsx`. Il ne contient que des propriétés de couleur. `global.css` n'est pas modifié (vérifié octet pour octet contre la version précédente). En TSX, seules trois valeurs de couleur changent : les courbes optimiste et pessimiste de `ProjectionChart`, et la tendance stable de `Sparkline`.
- Garde-fou : `npm run check:theme` (`scripts/check-theme-colors-only.mjs`) échoue si le thème contient autre chose qu'une propriété de couleur, une variable de couleur autorisée ou un raccourci `background` purement pictural. `global.css` n'utilise aucun `background-size` ou `background-position`, donc le raccourci ne remet rien à zéro.
- Contraste : les paires principales sont ≥ 4,5:1 (WCAG AA). Les deux paires grises qui étaient à 4,12:1 (onglets inactifs, pastille « stable ») utilisent #585858, à 7,11:1.
- Non modifié : les couleurs des produits (logos) et des portefeuilles (données de l'utilisateur, par exemple le bleu de « Retraite »), visibles dans la pastille de l'onglet Profil et dans le sélecteur.
- Retour en arrière : retirer `theme-bnc.css` et son import dans `main.tsx`.

## 30. Activer un portefeuille en touchant sa carte (v19)

- `PortfolioCard` : un clic n'importe où sur une carte inactive appelle `onSetActive`. Les clics sur les contrôles de la carte sont ignorés (`closest('button, a, input, select, [role="dialog"]')`), donc « Modifier », « Voir toutes les positions » et le panneau des positions gardent leur action.
- ~~Le bouton « Définir comme actif » est conservé pour le clavier.~~ Retiré en v20 (§31).
- `.pf-card--selectable { cursor: pointer }` sur les cartes inactives, une règle sans effet sur la mise en page.
- L'ordre du carrousel reste figé pendant la visite (§17) : la carte touchée devient active sans se déplacer.

## 31. Bouton « Définir comme actif » retiré (v20)

- La carte inactive n'affiche plus ce bouton. Un `<span aria-hidden>` vide prend sa place, pour que « Modifier » reste à droite comme sur la carte active.
- Accès au clavier et aux lecteurs d'écran : sur une carte inactive, le nom du portefeuille est un bouton sans style visible (`.pf-card__name-btn`, même apparence que le texte), nommé « Définir X comme portefeuille actif ». Tab l'atteint, Entrée active le portefeuille. Le toucher n'importe où sur la carte (§30) reste le geste principal.

## 32. Ordre des portefeuilles recalculé au retour de « Profil investisseur » (v21)

- `ProfilePage` : l'ordre du carrousel (`order`) reste figé tant que le carrousel est affiché, pour que la carte touchée ne bouge pas (§17, §30). Il est maintenant recalculé (`portfoliosByRecent`) chaque fois qu'on revient sur l'onglet « Portefeuilles » depuis « Profil investisseur », au clic comme au clavier (`selectTab`). Le portefeuille actif passe donc en premier, comme au retour depuis le fil.
- Le carrousel est remonté à ce moment, donc il repart sur la première carte (`current = 0`). Un clic sur l'onglet déjà sélectionné ne change rien.

## 33. Page d'accueil et création de compte (v22)

- À l'arrivée, `App` affiche `WelcomePage` tant que la session de démonstration n'est pas ouverte (`lib/session.ts` : `sessionStorage['buy-demo:session'] = '1'`, propre à l'onglet du navigateur).
  - « Se connecter » ouvre la session et affiche l'application actuelle, sans identifiant dans cette démo. Le lien demandé est conservé : arriver sur `#/saved` mène aux Sauvegardés après la connexion.
  - « Créer un compte » mène à `#/signup` (`SignupPage`), une page vide pour l'instant, avec seulement le titre et « ← Retour ».
  - Un nouvel onglet repasse par l'accueil ; un rechargement dans le même onglet n'y repasse pas.
- Aucun champ d'identifiant ni de mot de passe : le règlement du datathon interdit les comptes réels et les données bancaires confidentielles.
- Styles : `.welcome` et `.signup` dans `global.css`, aux couleurs BNC (rouge pour « Se connecter », contour noir pour « Créer un compte »). Aucune barre d'onglets sur ces pages.
- Tests : `setup.ts` ouvre la session avant chaque test (`beforeEach`), donc les tests existants démarrent dans l'application. Le test « rechargement » ne retire plus que la position du fil. `src/test/welcome.test.tsx` (5 tests, conservé) couvre :
  - l'arrivée sur l'accueil ;
  - la connexion, et son maintien après un rechargement ;
  - le lien demandé conservé après la connexion ;
  - la page de création de compte, et le retour ;
  - l'accès direct à `#/signup`.

## 34. Création de compte par questions (v23)

Demande : reprendre, pour la création de compte, le fonctionnement par question du dossier de référence (`nouveau dossier/generate-mockups (1).mjs`, écran « Nouveau portefeuille » : une question par écran, progression « n / N », récapitulatif des réponses, « Continuer »).

- `SignupPage` (`#/signup`) reprend la structure et les classes du questionnaire de portefeuille (`.wizard`) : barre avec retour (« Annuler » à l'étape 1), étape « n / 5 », barre de progression, récapitulatif, sur-titre, question (focalisée à chaque étape), puis « Continuer » ou « Créer le compte ».
- Étapes, toutes alimentant le profil investisseur partagé (§15.1) :
  1. nom affiché, obligatoire ;
  2. situation financière : stabilité des revenus et fonds d'urgence, les deux obligatoires ;
  3. obligations : dettes et personnes à charge, facultatives ;
  4. expérience : niveau obligatoire, produits facultatifs ;
  5. préférences et exclusions : ESG et secteurs, facultatives.
  Les choix et leurs libellés sont ceux du profil investisseur (`ChoiceGroup` et `MultiChoice`, exportés de `InvestorProfile`).
- « Créer le compte » appelle `replaceAccount(name, shared)` : un seul compte local, qui remplace le précédent, sans portefeuille. Les listes des anciens portefeuilles (sauvegardés, masqués, notes, position du fil) et celles de la portée `default` sont effacées. Un avertissement le signale à la dernière étape quand des portefeuilles existent. Ensuite : session ouverte, puis `#/profile/new` (questionnaire du premier portefeuille, qui devient actif).
- Aucun identifiant ni mot de passe (règlement du datathon).
- Tests : `welcome.test.tsx` (6 tests) couvre le parcours complet. Il vérifie les réponses obligatoires, le récapitulatif, l'avertissement, le compte enregistré, les anciennes listes effacées et l'arrivée sur « Nouveau portefeuille ».

## 35. Se déconnecter (v24)

- Profil : bouton icône « Se déconnecter » (36 px, `aria-label` et infobulle) dans l'en-tête, après « + Nouveau ». Il appelle `App.logout`, qui fait `clearSession()`, `entered = false` et `#/`, puis affiche la page d'accueil.
- Les données (compte, portefeuilles, sauvegardés, notes) sont conservées ; « Se connecter » les retrouve.
- Test : `welcome.test.tsx`, « Se déconnecter … keeps the data ».

## 36. « Premier portefeuille », facultatif (v25)

- Après « Créer le compte » (§34), `App` ouvre `#/profile/first`, une nouvelle route. Elle utilise le même `PortfolioWizard`, avec `title="Premier portefeuille"` et `onSkip`.
- `onSkip` ajoute un lien « Créer plus tard » sous le bouton principal, à toutes les étapes. La flèche de retour de l'étape 1 fait la même chose (nom accessible « Créer plus tard »). Les deux mènent au fil (`#/`) sans créer de portefeuille. Terminer le questionnaire crée le portefeuille, qui devient actif, puis ouvre le Profil.
- `#/profile/new` (depuis le Profil) ne change pas : titre « Nouveau portefeuille », sans « Créer plus tard ».
- Tests : `welcome.test.tsx` vérifie le titre, « Créer plus tard » vers le fil sans portefeuille, la création, la flèche de l'étape 1 et le questionnaire du Profil inchangé.
- v25b : `#/profile/new` est aussi intitulé « Premier portefeuille » tant que le compte n'a aucun portefeuille (création depuis le Profil après « Créer plus tard »). Ensuite, le titre redevient « Nouveau portefeuille ».
- v25c : « Créer plus tard » mène à Profil → Portefeuilles (`#/profile` : « Aucun portefeuille pour l'instant… » et « + Créer un portefeuille », qui ouvre « Premier portefeuille »), et non plus au fil.

## 37. Plusieurs comptes, connexion par le nom (v26)

Demande : garder les comptes quand on en crée un nouveau, et se connecter à un compte avec son nom.

- `lib/accounts.ts` : registre `buy-demo:accounts` = `[{ id, name }]`. Le compte de démonstration (`id "demo"`, « Alex Tremblay ») y figure toujours, sous la clé historique `buy-demo:account`. Les autres comptes sont enregistrés sous `buy-demo:account:<id>`, avec `id = acc-<horodatage>-<aléa>`.
  - `findAccountByName` : comparaison sans tenir compte des majuscules, des accents ni des espaces (`normalizeName`).
  - `createAccount(name, shared)` ajoute un compte sans portefeuille, sans toucher aux autres.
  - `renameInRegistry` garde le nom du registre à jour quand le compte est renommé dans le Profil.
- `lib/account.ts` : `readAccount(id)` et `writeAccount(account, id)` lisent et écrivent sous `accountKey(id)`. Un compte illisible retombe sur la démo (compte démo) ou sur un compte vide.
- Session : `sessionStorage['buy-demo:session']` contient l'identifiant du compte connecté. La valeur historique `"1"` correspond à la démo. Un identifiant inconnu du registre est traité comme une déconnexion.
- `useAccountState(accountId)` recharge le compte quand l'identifiant change, sans rien écrire (réinitialisation pendant le rendu, comme `usePersistentSet`). Les modifications sont enregistrées sous ce compte seulement.
- Séparation des données : les sauvegardés, masqués, notes et positions du fil restent rangés par portefeuille, et les identifiants de portefeuille sont uniques entre comptes. Sans portefeuille, la portée est `default-<idCompte>` ; elle reste `default` pour la démo (`scopeOf(activeId, accountId)`).
- Accueil (`WelcomePage`) : champ « Nom du compte », erreur `role="alert"` si le nom est vide ou inconnu, raccourcis vers les comptes de l'appareil (ils remplissent le champ), puis « Se connecter » et « Créer un compte ». Pas de mot de passe : démonstration seulement, conformément au règlement du datathon. Un nom ne protège pas l'accès.
- Création (`SignupPage`) : le nom doit être unique (vérifié à l'étape 1). L'avertissement de remplacement (§34) est supprimé, puisqu'il n'y a plus de remplacement. `replaceAccount` est retiré.
- Tests : `welcome.test.tsx` (12 tests) couvre la connexion par le nom (casse, erreurs, raccourcis), la conservation des comptes, l'unicité des noms, les données séparées entre deux comptes, ainsi que la déconnexion et la reconnexion.

## 38. Sauvegardés : onglet « Bloqués » (v27)

- `SavedPage` a deux onglets (`role="tablist"`, flèches gauche et droite, même style que le Profil) : « Sauvegardés (n) » et « Bloqués (n) ». La recherche et les tris s'appliquent à l'onglet affiché. Changer d'onglet efface la recherche.
- Bloqués = la liste `hidden` du portefeuille actif (« Don't show me again »), du plus récemment bloqué au plus ancien. Elle utilise le catalogue complet, donc un titre bloqué reste visible même si une exclusion ESG le retire aussi du fil.
- `BlockedRow` : logo, ticker, nom, prix, variation sur 12 mois et bouton « Débloquer » (`aria-label` « Débloquer X »). Le déblocage retire le titre de `hidden` : il revient dans le fil. Le message « X débloqué · Annuler » remet la liste précédente.
- État vide : « Aucun titre bloqué ».
- Tests : `src/test/savedBlocked.test.tsx` (4 tests).
