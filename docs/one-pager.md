# ReelBroker — One-pager

*PolyFinances Datathon 2026 · Simulation seulement, pas un conseil financier personnalisé.*

## Problème

Un investisseur reçoit des listes de « meilleurs rendements passés » ou des conseils opaques. Or un bon point de départ dépend de l'objectif de l'argent, de l'horizon, de la **capacité** (pas seulement de la tolérance) et de préférences comme l'ESG, et personne ne lui montre **pourquoi** un chiffre est ce qu'il est.

## Approche agentique

Trois temps : **Connaître** (questionnaire adaptatif), **Décider** (portefeuilles fictifs, vérification de sa propre idée, fiche d'un titre), **Apprendre** (profil déclaré et révélé côte à côte). Règle d'or : **le code calcule, le modèle explique** ; aucun chiffre n'est écrit par un modèle.

- Fiche d'un titre : **Source Finder** (registre fermé de sources publiques) → **Fact-Checker** (100 % code, bloque une source douteuse) → **Data Collector** → **Predictor** (trois scénarios hypothétiques, jamais une prévision) → explication par Claude sur Amazon Bedrock.
- « Vérifier une idée » : **Interpréteur** → **Analyste** (outils-calculatrices) → **Explicateur** (trace seulement).
- **Gouvernance en code** : chaque nombre doit exister dans la trace, tout conseil ou prévision est rejeté ; deux essais, puis texte écrit par le code.

## Originalité

- Le système **conteste** : Robert (59 ans, préserver son capital) veut 20 % dans Tesla → « en conflit », 7 % au plus resteraient dans ses limites.
- Le risque est une **bande visée**, pas seulement un plafond : Amira, à risque élevé, n'est ni bridée ni libre de tout (plafonds par titre, secteur, cryptoactif).
- Quand la donnée manque, il le dit : aucune cote ESG, donc rien n'est « conforme » pour Mateo (« donnée insuffisante »).
- Le profil révélé ne bouge que la tolérance, jamais la capacité, l'horizon ni l'objectif.

## Sources de données

Jeu de départ des organisateurs (2021-11-12 → 2026-11-12, 31 actifs) et 60 actifs ajoutés par nos soins avec la même méthode (Yahoo Finance, `adj_close`), soit 91 actifs ; Banque du Canada (USD/CAD, taux directeur), FRED. Conversion en CAD, biais du survivant (liste choisie en 2026) et artefact CNQ.TO documentés. Registre : SEC EDGAR, SEDAR+, méthodologie ESG de l'émetteur.

## Explicabilité

Chaque réponse dit quelles données (fenêtre, source, devise), pourquoi (liste de contrôles), quelles limites, et ce qui changerait la réponse (borne de 7 %, grille de sensibilité : le scénario central de TSLA varie de −7,0 % à 1,7 % par an selon les hypothèses). Un reçu de décision relie chaque phrase à une entrée de la trace ; l'interface affiche le mode (Bedrock ou texte de secours) et le verdict de gouvernance.

## Bénéfices

- Le risque en dollars (pire baisse sur 10 000 $), pas seulement en pourcentage.
- Tester une idée **avant** d'agir, en simulation, avec une borne claire.
- Voir l'écart entre ce qu'on dit et ce qu'on fait.
- Des textes fidèles : **91 explications sur 91 validées du premier coup** sur Bedrock.

## AWS et validation

Amazon Bedrock (Claude Sonnet 4.6, Strands Agents) lit les phrases libres, classe les sources et rédige ; sans lui, retour à des mots-clés et un texte fixe. 169 tests Python, 336 tests d'interface réussis.

*Les rendements passés ne garantissent pas les rendements futurs ; les scénarios à 5 ans sont hypothétiques.*
