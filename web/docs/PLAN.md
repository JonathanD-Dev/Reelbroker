# Plan — Prototype "Buy" (carte produit avec recommandation d'achat)

## Contexte
Prototype démo web mobile-first à partir d'un croquis manuscrit. Deux vues d'une carte
produit (résumé / détail), un menu ⋮ avec deux actions, navigation entre plusieurs
cartes (fil), favori (signet) et "Don't show me again" persistés en localStorage.
Données simulées (mock). Pas de vraie API boursière ni de vrai achat.

## Décisions de cadrage (hypothèses, non bloquantes)
- Stack à trancher par l'architect, recommandation: Vite + React + TypeScript, graphiques SVG maison (léger) ou recharts.
- Persistance localStorage uniquement, pas de backend.
- Logo NVIDIA = placeholder stylisé vert (cercle + initiales), pas de ressource de marque.
- Libellé du croquis "Impacts prévus sur le projet" interprété comme "portefeuille" → libellé affiché: "Impacts prévus sur le portefeuille" (hypothèse signalée).
- Libellés anglais conservés: "Buy", "See more data", "See less data", "If I buy", "Buy now", "Don't show me again".

## Tâches

| # | Tâche | Agent | Dépend de | Statut |
|---|-------|-------|-----------|--------|
| 1 | Architecture, stack, structure, modèle de données mock, contrat des composants | architect | — | done |
| 2 | Implémentation frontend (cartes, vues résumé/détail, menu, graphiques, persistance, page d'achat) | frontend-dev | 1 | done |
| 3 | Tests (unitaires logique mock/persistance + build) | tester | 2 | done |
| 4 | Revue de code (qualité, cohérence design) | reviewer | 2,3 | done |
| 5 | Corrections éventuelles | frontend-dev | 3,4 | done |
| 6 | Build, README, doc de lancement | devops-docs | 2-5 | done |

## Critères d'acceptation
- Vue résumé: titre "Buy", "Pourquoi :" + justification, logo NVDA + "See more data", signet + menu ⋮.
- Vue détail: "Historique du produit" (2 mini-graphes), "Impacts prévus sur le portefeuille" (3 courbes vert/noir/rouge), "If I buy" + champ numérique qui met à l'échelle les projections, signet + panier, "See less data".
- Menu ⋮: "Buy now" (→ page d'achat) et "Don't show me again" (persisté).
- Navigation entre plusieurs cartes; favori persisté; carte masquée non réaffichée.
- Mobile-first. Build OK, tests exécutés et verts, README vérifié.

---

# v2 — Refonte « fil infini » façon TikTok / Shorts / Reels

Demande : « Le logiciel est censé être comme les applications de défilement infini. Améliorer le tout. »
Spécification : `docs/architecture.md` §13 (prime sur §1–§12 en cas de conflit).

| # | Tâche | Agent | Dépend de | Statut |
|---|-------|-------|-----------|--------|
| 7 | Design v2 (fil snap, fenêtre de rendu, masquage sans saut, restauration) | architect | — | done |
| 8 | Implémentation (données 16 produits, fil infini, layout immersif, bottom sheet, double-tap, hint, restauration) + mise à jour des tests | frontend-dev | 7 | done |
| 9 | Tests complémentaires + exécution `npm test` / `npm run build` | tester | 8 | done (12 fichiers, 254 passés + 2 « expected fail ») |
| 10 | Revue de code | reviewer | 8,9 | non faite (session interrompue) |
| 11 | Corrections (max 3 cycles) | frontend-dev | 9,10 | en attente de la revue |
| 12 | README (parcours de démo) + cohérence docs | devops-docs | 8-11 | done (avec la v3) |

## Critères d'acceptation v2
- Une carte = un écran (100dvh), scroll-snap mandatory, clavier ↑/↓/PageUp/PageDown/j/k ; plus de ‹ › ni « n / total ».
- Fil infini : ≥ 15 produits, pages ajoutées via sentinelle, clés uniques, jamais le même produit deux fois d'affilée, DOM borné.
- « Don't show me again » : retrait de toutes les occurrences, sans saut ; état vide plein écran + « Réafficher les produits masqués ».
- Layout immersif (logo+ticker+nom+See more data en bas à gauche, rail d'actions à droite ≥ 44 px), détail avec scroll interne contenu.
- Double-tap = favori, indice « Glisser vers le haut », `prefers-reduced-motion`, ⋮ en bottom sheet accessible.
- Retour de la page d'achat à la même position. Accessibilité (`article` + `aria-label`, focus visible).
- `vite.config.ts` inchangé ; `npm test` et `npm run build` verts.

# v3 — Page « Sauvegardés » (option A : liste « watchlist »)

Demande : ajouter une page pour voir les produits sauvegardés. Trois maquettes PNG proposées
(`docs/mockups/saved-page/`), l'utilisateur a choisi l'option A. Spécification : `docs/architecture.md` §14.

| # | Tâche | Statut |
|---|-------|--------|
| 13 | Maquettes PNG (A liste, B grille, C panier) + accès depuis le fil | done |
| 14 | Implémentation option A + barre d'onglets + message « Ajouté aux sauvegardés · Voir » | done |
| 15 | Vérification : build, suite existante, parcours de la page (test temporaire, non conservé) | done |
| 16 | Revue de code | non faite |

## Critères d'acceptation v3
- Barre d'onglets « Fil » / « Sauvegardés » sur le fil et la page (pas sur la page d'achat), route `#/saved`.
- Liste : logo, ticker, nom, mini-courbe 12 mois, prix, variation colorée ; compteur « n produits ».
- Recherche (insensible à la casse et aux accents) ; tris Récents / Variation / Nom.
- Toucher une ligne ouvre le fil sur ce produit ; glisser à gauche (ou Tab au clavier) révèle « Retirer » ; « Annuler » rétablit l'ordre.
- État vide avec « Découvrir le fil ». Produits masqués exclus de la liste.

# v4 — Profil et portefeuilles (option B : onglets + cartes)

Demande : un compte contient plusieurs portefeuilles. Infos partagées : situation financière et stabilité des revenus, obligations, expérience, préférences et exclusions (ESG). Paramètres propres à chaque portefeuille : objectif, horizon, tolérance au risque, mise initiale et besoins de retrait. Maquettes : `docs/mockups/profile/`, option B choisie. Spécification : `docs/architecture.md` §15.

| # | Tâche | Statut |
|---|-------|--------|
| 17 | Maquettes PNG (A page unique, B onglets + cartes, C tableau de bord) + écrans communs | done |
| 18 | Modèle, persistance validée, compte de démonstration | done |
| 19 | Page Profil (onglets, carrousel), profil investisseur, questionnaire de portefeuille | done |
| 20 | Intégration : achat dans un portefeuille, portefeuille actif dans la vue détaillée, exclusions dans le fil et les sauvegardés | done |
| 21 | Vérification : build, suite existante, parcours du profil (test temporaire, non conservé) | done |
| 22 | Revue de code | non faite |

Hypothèses retenues sans réponse explicite : « Buy now » demande le portefeuille ; l'impact affiché utilise le portefeuille actif ; un seul compte local ; les exclusions filtrent le fil (comme sur la maquette).

# v5 — Un fil et des sauvegardés par portefeuille

Demande : « chaque profil doit avoir son feed et ses éléments favoris ». Réponses : 1a (profil = portefeuille), 2a (listes propres, mêmes produits). Point 3 non tranché : les listes existantes sont rattachées au portefeuille actif. Spécification : `docs/architecture.md` §16.

| # | Tâche | Statut |
|---|-------|--------|
| 23 | Clés par portefeuille, migration des anciennes clés, nettoyage à la suppression | done |
| 24 | Rechargement des listes au changement de portefeuille, fil reconstruit par portefeuille | done |
| 25 | Sélecteur de portefeuille actif dans le fil et les Sauvegardés | done |
| 26 | Tests existants adaptés aux nouvelles clés ; vérification (test temporaire, non conservé) | done |
| 27 | Revue de code | non faite |

# v6 — Portefeuilles triés par utilisation récente

Demande : au retour sur le menu des portefeuilles, le portefeuille sélectionné passe en premier, puis l'ordre suit l'utilisation la plus récente. Spécification : `docs/architecture.md` §17.

| # | Tâche | Statut |
|---|-------|--------|
| 28 | Historique `recent` (modèle, migration, actions) | done |
| 29 | Carrousel du Profil (ordre figé à l'arrivée) et sélecteur dans le même ordre | done |
| 30 | Vérification (test temporaire, non conservé) | done |
