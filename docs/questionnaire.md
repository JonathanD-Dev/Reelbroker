# ReelBroker — Questionnaire du profil déclaré

Dix questions : cinq pour le compte (posées une seule fois), cinq pour chaque portefeuille (reposées à chaque nouveau
portefeuille). Une question à la fois. Chaque question offre « Je ne sais pas » et « Passer ».
Simulation seulement : le questionnaire ne recommande aucun actif.

## Questions

Les choix sont séparés par « / ». Les valeurs entre crochets sont les codes transmis au code de l'application.

| Identifiant | Niveau | Texte exact de la question | Type de réponse | Choix de réponse | Élément du profil identifié | Règle d'adaptation éventuelle | Interprétation à transmettre au code |
|---|---|---|---|---|---|---|---|
| C1 | Compte | Comment décririez-vous votre principale source de revenu ? | Choix unique | Emploi permanent, revenu régulier [`permanent`] / Emploi contractuel ou temporaire [`contract`] / Travail autonome ou à la commission [`self_employed`] / Retraite ou pension [`pension`] / Études ou pas de revenu régulier [`none_regular`] / Autre [`other`] / Je ne sais pas ou je préfère ne pas répondre [`unknown`] | Type de revenu et stabilité | Si `self_employed` ou `other`, afficher la précision C1a. | `account.income_type` = code choisi. `account.income_stability` : `permanent` et `pension` → `stable` ; `contract` → `variable` ; `none_regular` → `low` ; `self_employed` et `other` → valeur de C1a ; `unknown` → `null`. |
| C1a | Compte (précision) | Vos revenus sont-ils semblables d'un mois à l'autre ? | Choix unique | Oui, assez semblables [`stable`] / Ils varient un peu [`variable`] / Ils varient beaucoup [`low`] / Je ne sais pas [`unknown`] | Stabilité du revenu | Affichée seulement après `self_employed` ou `other` en C1. | `account.income_stability` = code choisi. |
| C2 | Compte | En comptant vos obligations (logement, dettes, personnes à charge), pendant combien de temps pourriez-vous payer vos dépenses sans revenu et sans toucher à vos placements ? | Fourchette | Moins de 1 mois [`lt_1m`] / De 1 à 3 mois [`1_3m`] / De 3 à 6 mois [`3_6m`] / Plus de 6 mois [`gt_6m`] / Je ne sais pas [`unknown`] | Marge de manœuvre (coussin de sécurité) | Si `lt_1m`, `1_3m` ou `unknown`, afficher la précision C2a. | `account.emergency_cushion` = code choisi. Entrée de la capacité à prendre du risque (calculée par le code). |
| C2a | Compte (précision) | Lesquelles de ces obligations s'appliquent à vous ? | Choix multiples | Personnes à charge [`dependents`] / Loyer ou hypothèque [`housing`] / Dettes autres que l'hypothèque [`debt`] / Soutien financier à un proche [`family_support`] / Aucune de ces obligations [`none`] / Je préfère ne pas répondre [`unknown`] | Obligations financières | Affichée seulement si le coussin est de moins de 3 mois ou inconnu. | `account.obligations` = liste des codes. Liste vide et non posée → `null` (non demandé), à distinguer de `["none"]`. |
| C3 | Compte | Quelle est votre expérience des placements ? | Choix unique | Aucune, je débute [`none`] / J'ai des placements, mais quelqu'un d'autre les choisit [`beginner`] / J'ai déjà choisi moi-même des actions ou des fonds [`intermediate`] / J'investis moi-même régulièrement depuis plusieurs années [`advanced`] / Je ne sais pas [`unknown`] | Expérience et familiarité | Si `none`, `beginner` ou `unknown` : afficher une définition courte à côté de chaque terme technique dans la suite (FNB, obligation, volatilité). | `account.investment_experience` = code choisi. Sert au vocabulaire et aux mises en garde, jamais à augmenter le risque permis. |
| C4 | Compte | Y a-t-il des types de placements que vous souhaitez éviter pour des raisons personnelles ? | Choix multiples + texte facultatif | Énergies fossiles [`fossil_fuels`] / Armement [`weapons`] / Tabac, alcool ou jeux de hasard [`sin`] / Entreprises visées par des controverses environnementales ou sociales importantes [`controversies`] / Cryptoactifs [`crypto`] / Autre, à préciser [`other` + texte] / Non, aucune exclusion [`none`] / Je ne sais pas [`unknown`] | Valeurs et critères d'exclusion | Si au moins une exclusion est choisie, afficher la précision C4a. « Aucune exclusion » désélectionne les autres choix. | `account.values_preferences.exclusions` = liste des codes ; `other_text` = texte saisi. `controversies` exige une preuve externe documentée : sans preuve, le code affiche « donnée insuffisante » au lieu de trancher. |
| C4a | Compte (précision) | Ces exclusions sont-elles une règle stricte ou une préférence ? | Choix unique | Une règle stricte : à ne jamais inclure [`strict`] / Une préférence : à éviter si possible [`preference`] / Je ne sais pas [`unknown`] | Poids des critères autres que le rendement | Affichée seulement si C4 contient au moins une exclusion. | `account.values_preferences.strictness`. `strict` → contrainte ferme (retirée de l'univers). `preference` → critère souple. `unknown` → traiter comme préférence et le signaler comme hypothèse. |
| C5 | Compte | Quel niveau d'explication souhaitez-vous recevoir ? | Choix unique | L'essentiel en quelques lignes [`brief`] / Les points clés avec les chiffres principaux [`standard`] / Le détail complet, avec sources et hypothèses [`detailed`] / Je ne sais pas [`unknown`] | Préférences de décision | Aucune. | `account.explanation_level`. `unknown` → `standard`, signalé comme valeur par défaut. Les sources et limites restent accessibles à tous les niveaux. |
| P1 | Portefeuille | À quoi cet argent doit-il servir en priorité ? | Choix unique + texte facultatif | Préserver le capital [`preserve`] / Générer un revenu régulier [`income`] / Équilibrer croissance et stabilité [`balanced`] / Faire croître le capital à long terme [`growth`] / Je ne sais pas [`unknown`]. Texte facultatif : « Nom du projet (ex. mise de fonds, retraite) ». | Objectif principal | Si `unknown` : afficher une phrase d'aide décrivant chaque objectif, puis reposer une fois. Si toujours inconnu, continuer et inscrire la réponse comme manquante. | `portfolio.objective` = code choisi ; `portfolio.label` = texte saisi. |
| P2 | Portefeuille | Dans combien de temps prévoyez-vous utiliser une part importante de cet argent ? | Fourchette | Moins de 1 an [`lt_1y`] / De 1 à 3 ans [`1_3y`] / De 3 à 5 ans [`3_5y`] / De 5 à 10 ans [`5_10y`] / De 10 à 15 ans [`10_15y`] / Plus de 15 ans [`gt_15y`] / Je ne sais pas [`unknown`] | Horizon de placement | Aucune sur les choix. La réponse fixe la borne des choix de date en P4a. | `portfolio.horizon` = `{category, min_years, max_years}`. L'horizon ne se déduit jamais de l'âge. |
| P3 | Portefeuille | Quel montant prévoyez-vous placer au départ dans ce portefeuille ? | Fourchette + montant facultatif | Moins de 1 000 $ [`lt_1k`] / De 1 000 $ à 10 000 $ [`1k_10k`] / De 10 000 $ à 50 000 $ [`10k_50k`] / De 50 000 $ à 250 000 $ [`50k_250k`] / Plus de 250 000 $ [`gt_250k`] / Montant exact, facultatif [nombre] / Je préfère ne pas répondre [`unknown`] | Mise initiale | La réponse sert à afficher la baisse de P5 en dollars. Si `unknown` : P5 utilise 10 000 $ et l'indique comme montant d'illustration. | `portfolio.initial_amount` = `{range, exact, currency: "CAD"}`. Sans montant exact, le code utilise le milieu de la fourchette pour l'illustration seulement et le marque `assumed: true`. |
| P4 | Portefeuille | Prévoyez-vous retirer de l'argent de ce portefeuille avant la fin de cette période ? | Choix unique | Non, aucun retrait prévu [`none`] / Oui, des retraits réguliers [`regular`] / Oui, un retrait important à une date connue [`lump_sum`] / Peut-être, en cas d'imprévu [`contingent`] / Je ne sais pas [`unknown`] | Besoins de liquidité ou de retrait | Si `lump_sum` : afficher la précision P4a. Si `regular` : demander la fréquence (mensuelle, trimestrielle, annuelle). | `portfolio.liquidity_needs.type` = code choisi ; `frequency` si `regular`. Entrée de la capacité à prendre du risque. |
| P4a | Portefeuille (précision) | Quand prévoyez-vous ce retrait, et quelle part du portefeuille représente-t-il ? | Deux fourchettes | Quand : mêmes catégories que P2, limitées à l'horizon déclaré. Part : Moins du quart [`lt_25`] / Environ la moitié [`about_50`] / Presque tout [`most`] / Je ne sais pas [`unknown`] | Date et taille du retrait | Affichée seulement si `lump_sum` en P4. | `portfolio.liquidity_needs.when` et `.share`. |
| P5 | Portefeuille | Voici une baisse réelle. Un portefeuille composé de 60 % d'actions et de 40 % d'obligations a perdu 14,9 % entre le 29 décembre 2021 et le 16 juin 2022. Sur {montant}, cela représente une baisse d'environ {perte} $. Il a retrouvé sa valeur de départ le 13 décembre 2023. Si cela arrivait à ce portefeuille, que feriez-vous ? | Choix unique (mise en situation) | Je vendrais tout pour éviter d'autres pertes [`sell_all`] / Je vendrais une partie [`sell_part`] / Je ne changerais rien et j'attendrais [`hold`] / J'ajouterais de l'argent [`add`] / Je ne sais pas [`unknown`] | Tolérance au risque (volonté) | {montant} et {perte} viennent de P3. Si `hold` ou `add` : afficher la précision P5a. Si `sell_all` ou `sell_part` : ne pas afficher P5a. Mention fixe sous la question : « Une baisse passée ne prédit pas les résultats futurs. » | `portfolio.risk_tolerance.reaction_reference` = code choisi. Le code détermine le niveau de risque ; le questionnaire ne transmet que la réaction. |
| P5a | Portefeuille (précision) | Voici une baisse plus forte, sur la même période. Un portefeuille composé à 100 % d'actions a perdu 19,4 % entre le 29 décembre 2021 et le 16 juin 2022. Sur {montant}, cela représente une baisse d'environ {perte} $. Il a retrouvé sa valeur de départ le 18 juillet 2023. Que feriez-vous ? | Choix unique (mise en situation) | Mêmes choix qu'en P5. | Tolérance au risque (volonté), palier supérieur | Affichée seulement après `hold` ou `add` en P5. Même mention fixe qu'en P5. | `portfolio.risk_tolerance.reaction_deeper` = code choisi ; `null` si non posée. |

### Source des chiffres de P5 et P5a

- **Données :** jeu de départ PolyFinances (Yahoo Finance via `yfinance`, taux de change Banque du Canada), extraction du
  13 novembre 2026, fenêtre du 12 novembre 2021 au 12 novembre 2026.
- **Calcul :** `scripts/build_risk_scenarios.py`, résultat dans `data/processed/risk_scenarios.json`. Cours ajustés
  (`adj_close`) convertis en dollars canadiens, rééquilibrage trimestriel, baisse maximale du sommet au creux.
- **Mélanges :** 60/40 = 30 % XIU.TO, 30 % SPY, 40 % XBB.TO. Actions = 40 % XIU.TO, 40 % SPY, 20 % QQQ.
- **Limites :** la fenêtre ne compte que cinq ans et un seul épisode de baisse ; des baisses plus fortes ont existé
  avant 2021 et ne sont pas dans ces données. Les mélanges sont des illustrations, pas des propositions.
- **Si ces données ne sont pas disponibles :** remplacer le texte par « Scénario fictif : imaginez que ce portefeuille
  perde 15 % en six mois » et marquer `scenario_basis: "fictional"`.

## A. Parcours adaptatif

**Ordre.** Compte : C1 → C2 → C3 → C4 → C5. Portefeuille : P1 → P2 → P3 → P4 → P5. Le montant (P3) passe avant la
mise en situation (P5) pour que la baisse soit affichée en dollars. Pour un deuxième portefeuille, le parcours
commence directement à P1.

| Réponse | Effet sur la suite |
|---|---|
| C1 = travail autonome ou autre | Affiche C1a (régularité des revenus). |
| C2 = moins de 3 mois, ou « Je ne sais pas » | Affiche C2a (liste des obligations). |
| C3 = aucune, débutant ou inconnu | Ajoute une définition courte aux termes techniques pour tout le reste du parcours et des résultats. |
| C4 = au moins une exclusion | Affiche C4a (règle stricte ou préférence). |
| C4 = controverses | Avertit que cette exclusion dépend de preuves externes et qu'un titre sans preuve sera marqué « donnée insuffisante ». |
| P1 = « Je ne sais pas » | Affiche une aide décrivant les quatre objectifs, puis repose P1 une seule fois. |
| P2 | Limite les dates proposées en P4a à l'horizon déclaré. |
| P3 = montant ou fourchette | P5 et P5a affichent la baisse en dollars. |
| P3 = non répondu | P5 et P5a utilisent 10 000 $, présenté comme un montant d'illustration. |
| P4 = retraits réguliers | Demande la fréquence. |
| P4 = retrait important | Affiche P4a (date et part). |
| P5 = ne rien changer ou ajouter | Affiche P5a (baisse plus forte). |
| P5 = vendre tout ou une partie | N'affiche pas P5a. |

Aucune règle d'adaptation ne retire un choix de réponse ni ne présélectionne une réponse. L'adaptation ajoute des
précisions ; elle n'oriente pas.

## B. Correspondance entre réponses et champs de profil

Le questionnaire transmet des catégories. Le code calcule la capacité, le niveau de risque et tout chiffre.

| Champ | Vient de | Valeurs possibles |
|---|---|---|
| `account.income_type` | C1 | `permanent`, `contract`, `self_employed`, `pension`, `none_regular`, `other`, `null` |
| `account.income_stability` | C1, C1a | `stable`, `variable`, `low`, `null` |
| `account.emergency_cushion` | C2 | `lt_1m`, `1_3m`, `3_6m`, `gt_6m`, `null` |
| `account.obligations` | C2a | liste parmi `dependents`, `housing`, `debt`, `family_support`, `none` ; `null` si non demandé |
| `account.investment_experience` | C3 | `none`, `beginner`, `intermediate`, `advanced`, `null` |
| `account.values_preferences.exclusions` | C4 | liste parmi `fossil_fuels`, `weapons`, `sin`, `controversies`, `crypto`, `other` ; `[]` si aucune ; `null` si inconnu |
| `account.values_preferences.other_text` | C4 | texte libre ou `null` |
| `account.values_preferences.strictness` | C4a | `strict`, `preference`, `null` |
| `account.explanation_level` | C5 | `brief`, `standard`, `detailed` |
| `portfolio.objective` | P1 | `preserve`, `income`, `balanced`, `growth`, `null` |
| `portfolio.label` | P1 | texte libre ou `null` |
| `portfolio.horizon` | P2 | `{category, min_years, max_years}` ou `null` |
| `portfolio.initial_amount` | P3 | `{range, exact, currency, assumed}` |
| `portfolio.liquidity_needs` | P4, P4a | `{type, frequency, when, share}` |
| `portfolio.risk_tolerance.reaction_reference` | P5 | `sell_all`, `sell_part`, `hold`, `add`, `null` |
| `portfolio.risk_tolerance.reaction_deeper` | P5a | mêmes valeurs ; `null` si non posée |
| `portfolio.risk_tolerance.declared` | P5 + P5a | voir le tableau ci-dessous |
| `portfolio.risk_tolerance.scenario_basis` | — | `historical` (avec source et fenêtre) ou `fictional` |

**Tolérance déclarée (catégorie, pas un score).**

| P5 | P5a | `declared` |
|---|---|---|
| Vendre tout | non posée | `low` |
| Vendre une partie | non posée | `low_to_moderate` |
| Ne rien changer | Vendre tout ou une partie | `moderate` |
| Ne rien changer | Ne rien changer ou ajouter | `moderate_to_high` |
| Ajouter | Vendre tout ou une partie | `moderate`, avec contradiction à clarifier |
| Ajouter | Ne rien changer ou ajouter | `high` |
| Je ne sais pas | — | `null` (réponse manquante) |

**Ce que le code doit faire avec ces champs (rappel, hors questionnaire).**
- La capacité à prendre du risque se calcule à partir de `income_stability`, `emergency_cushion`, `obligations`,
  `horizon` et `liquidity_needs`. Elle n'est jamais demandée directement.
- Le niveau de risque retenu est le plus restrictif entre tolérance déclarée, capacité, horizon et objectif.
  Une tolérance élevée n'annule jamais une capacité faible, un horizon court ou un objectif de préservation.
- Une réponse manquante n'est jamais remplacée en silence. Toute valeur par défaut est marquée comme hypothèse.

**Contradictions à signaler (à clarifier avec la personne, sans deviner).**

| Code | Condition | Question de clarification |
|---|---|---|
| `tolerance_vs_horizon` | Tolérance `moderate_to_high` ou `high` et horizon de moins de 3 ans | « Vous accepteriez une forte baisse, mais vous prévoyez utiliser cet argent bientôt. Lequel décrit le mieux ce portefeuille ? » |
| `tolerance_vs_objective` | Objectif `preserve` et tolérance `moderate_to_high` ou `high` | « Vous souhaitez préserver le capital, mais vous resteriez investi pendant une forte baisse. Souhaitez-vous revoir l'objectif ou confirmer ? » |
| `objective_vs_reaction` | Objectif `growth` et P5 = `sell_all` | « Vous visez la croissance à long terme, mais vous vendriez tout après une baisse de 15 %. Souhaitez-vous revoir l'objectif ? » |
| `cushion_vs_withdrawals` | Coussin `lt_1m` et P4 = `none` | « Votre coussin couvre moins d'un mois. Se peut-il que vous deviez retirer de l'argent en cas d'imprévu ? » |
| `income_vs_withdrawals` | Objectif `income` et P4 = `none` | « Vous souhaitez un revenu régulier, mais aucun retrait n'est prévu. Le revenu doit-il être retiré ou réinvesti ? » |
| `withdrawal_vs_horizon` | Retrait `most` prévu bien avant la fin de l'horizon | « Presque tout serait retiré avant la fin de la période. L'horizon de ce portefeuille est-il plutôt la date du retrait ? » |
| `staircase_inconsistent` | P5 = `add` et P5a = `sell_all` ou `sell_part` | « Vous ajouteriez de l'argent après une baisse de 15 %, mais vous vendriez après 19 %. Où se situe votre limite ? » |

## C. Exemple de profil déclaré

Exemple fictif, inspiré du persona Robert de l'énoncé. Les réponses qui ne figurent pas dans l'énoncé ont été
inventées pour l'illustration.

**Informations du compte (partagées par tous les portefeuilles)**
- Source de revenu : emploi permanent, revenu régulier. Stabilité : stable.
- Coussin de sécurité : plus de 6 mois. Obligations : non demandées (coussin suffisant).
- Expérience : investit lui-même régulièrement depuis plusieurs années.
- Exclusions : cryptoactifs, à titre de préférence (pas une règle stricte).
- Niveau d'explication : détail complet, avec sources et hypothèses.

**Paramètres du portefeuille « Retraite »**
- Objectif : préserver le capital.
- Horizon : de 3 à 5 ans.
- Mise initiale : non répondue. Montant d'illustration de 10 000 $ utilisé pour la mise en situation (hypothèse).
- Tolérance déclarée : modérée à élevée. Devant une baisse de 14,9 % (1 489 $ sur 10 000 $), il ne changerait rien.
  Devant une baisse de 19,4 % (1 944 $ sur 10 000 $), il ne changerait rien non plus.
  Base : données historiques, du 12 novembre 2021 au 12 novembre 2026.

**Réponses manquantes**
- Mise initiale (P3) : passée.
- Besoins de retrait (P4) : « Je ne sais pas ».

**Contradictions à clarifier**
- `tolerance_vs_objective` : objectif de préservation du capital, mais tolérance déclarée modérée à élevée.
- `tolerance_vs_horizon` : non déclenchée (horizon de 3 à 5 ans, seuil à moins de 3 ans), mais l'horizon reste court
  et limitera le niveau de risque calculé par le code, quelle que soit la tolérance.

**Statut :** profil incomplet. Les besoins de retrait doivent être précisés avant de présenter des scénarios.

## D. Données JSON correspondantes

```json
{
  "schema_version": "1.0",
  "profile_type": "declared",
  "created_on": "2026-11-14",
  "account": {
    "income_type": "permanent",
    "income_stability": "stable",
    "emergency_cushion": "gt_6m",
    "obligations": null,
    "investment_experience": "advanced",
    "values_preferences": {
      "exclusions": ["crypto"],
      "other_text": null,
      "strictness": "preference"
    },
    "explanation_level": "detailed"
  },
  "portfolio": {
    "portfolio_id": "pf_001",
    "label": "Retraite",
    "objective": "preserve",
    "horizon": { "category": "3_5y", "min_years": 3, "max_years": 5 },
    "initial_amount": { "range": null, "exact": null, "currency": "CAD", "assumed": false },
    "liquidity_needs": { "type": null, "frequency": null, "when": null, "share": null },
    "risk_tolerance": {
      "reaction_reference": "hold",
      "reaction_deeper": "hold",
      "declared": "moderate_to_high",
      "scenario_basis": "historical",
      "scenario_source": "data/processed/risk_scenarios.json",
      "scenario_window": ["2021-11-12", "2026-11-12"],
      "illustration_amount": { "value": 10000, "currency": "CAD", "assumed": true }
    }
  },
  "missing": [
    { "field": "portfolio.initial_amount", "question": "P3", "reason": "skipped" },
    { "field": "portfolio.liquidity_needs", "question": "P4", "reason": "dont_know" }
  ],
  "not_asked": [
    { "field": "account.obligations", "question": "C2a", "reason": "condition_not_met" }
  ],
  "assumptions": [
    { "field": "portfolio.risk_tolerance.illustration_amount", "value": 10000, "reason": "P3 non répondue" }
  ],
  "contradictions": [
    {
      "code": "tolerance_vs_objective",
      "fields": ["portfolio.objective", "portfolio.risk_tolerance.declared"],
      "status": "to_clarify"
    }
  ],
  "status": "incomplete"
}
```

## E. Message à l'utilisateur

> Vos réponses décrivent votre **profil déclaré** : ce que vous nous avez dit de votre situation, de vos objectifs et
> de votre réaction devant une baisse. Elles servent à préparer des scénarios de portefeuille fictifs dans un cadre de
> simulation. Elles ne constituent ni un conseil financier personnalisé ni une promesse de rendement. Les baisses
> présentées sont des faits passés, calculés sur une période précise ; elles ne prédisent pas l'avenir. Vous pouvez
> modifier vos réponses en tout temps.
