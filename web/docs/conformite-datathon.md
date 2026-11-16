# Conformité du prototype au règlement du Datathon AlphaForge AI 2026

Audit réalisé le 14 novembre 2026 sur l'état actuel du code (`src/`).

Règles lues :
- *Datathon - Case Officiel 2026 FR.pdf*, 19 pages. La version EN contient les mêmes règles.
- *Presentation_AlphaForge_AI_Participants.pptx* (FR) et *- EN V2.pptx*.
- `sources_metadata.csv`.

## Verdict

En l'état, le prototype n'est **pas conforme**. Deux points rendent le projet inadmissible ou très faible à l'évaluation :
- il n'y a **aucune intégration AWS**, alors que c'est une condition d'admissibilité ;
- il n'y a **aucun agent ni aucune explicabilité** dans la solution.

Les liens vers BNCD et le cadrage « Buy » vont aussi à l'encontre du **cadre responsable** (simulation uniquement, pas de conseil personnalisé).

## Détail par règle

| # | Règle | Source | État | Constat dans le prototype | Correction proposée |
|---|---|---|---|---|---|
| 1 | AWS doit contribuer réellement et de façon démontrable ; sinon le projet n'est pas admissible | Présentation, diapo 7 (« Absence d'intégration effective = projet non admissible ») | ❌ **Bloquant** | Application 100 % front (Vite/React), données dans le navigateur, aucun service AWS | Exécuter l'agent et les calculs sur AWS (ex. Amazon Bedrock pour l'agent, AWS Lambda + API Gateway, données dans S3) et héberger le front (Amplify ou S3 + CloudFront). Justifier chaque service. |
| 2 | Solution **agentique auto-explicative** : agents qui mobilisent des données, coordonnent, adaptent et expliquent (sources, hypothèses, limites) | Énoncé p. 3, 8, 9, 17 ; diapos 3, 5 | ❌ **Bloquant** | Aucun agent dans la solution : les agents de `.kiro/agents` servent seulement à écrire le code. Les puces « Pourquoi : » sont des textes écrits à la main, sans lien avec des données. | Un agent d'analyse (calculs sur le jeu de données), un agent de gouvernance (contrôle des contraintes du profil) et une explication qui cite les données, la période, les hypothèses et les incertitudes de chaque conclusion. |
| 3 | **Simulation uniquement, aucune transaction réelle** | Énoncé p. 10 et 17 ; diapo 11 | ⚠️ (❌ avec la redirection directe demandée) | Le panier envoie vers `client.bnc.ca`, la plateforme de courtage réelle. L'application n'exécute aucun ordre elle-même, mais elle conduit l'utilisateur à en passer un. | Garder l'achat **simulé** dans l'application. Au besoin, garder un lien BNCD présenté comme « consulter la cote », hors du parcours d'achat, ou le retirer. |
| 4 | **Pas de conseil financier personnalisé** | Énoncé p. 17 ; diapo 11 | ⚠️ | Une carte « Buy » assortie de raisons, rattachée au portefeuille de l'utilisateur, ressemble à une recommandation personnalisée. Aucune mention « pas un conseil » dans l'interface (seulement « Données fictives… » dans le fil). | Reformuler en « Analyse » ou « Adéquation au profil ». Ajouter une mention permanente « Simulation, pas un conseil financier ». |
| 5 | Aucun compte client réel ni donnée bancaire confidentielle | Énoncé p. 14 ; diapo 11 | ⚠️ | Les liens BNCD invitent à se connecter à un compte réel | Même correction que le point 3 |
| 6 | Données **publiques et traçables** : source, date, devise, traitements | Énoncé p. 10, 13, 14 ; diapo 6 | ❌ | Les sociétés sont réelles mais les chiffres sont inventés. Exemple : NVDA à 118,50 $ dans l'application, contre une clôture de 166,19 $ le 2026-11-12 dans `prices_daily.csv`. Les historiques sont générés. 9 des 16 titres (META, NFLX, AMD, DIS, KO, NKE, V, SBUX, UBER) ne figurent pas dans le jeu fourni. | Utiliser `assets_universe.csv` (31 actifs) et `prices_daily.csv`. Afficher la source, la date et la devise de chaque chiffre. |
| 7 | Distinguer **faits, hypothèses et scénarios fictifs** | Énoncé p. 17 ; diapo 11 | ⚠️ | Seul le fil porte le bandeau « Données fictives ». De vraies sociétés y apparaissent avec de faux chiffres. Les projections reposent sur des taux fixes inventés. | Étiqueter chaque élément « Fait (source) », « Hypothèse » ou « Scénario ». |
| 8 | Ne pas prédire à partir des performances passées ; expliquer les indicateurs et leurs limites | Énoncé p. 18 | ⚠️ | La « valeur médiane à 12 mois » et la « projection médiane » sont affichées sans méthode ni source | Rendement et volatilité **historiques** sur une période explicitée. Scénarios présentés comme tels, avec leurs limites. |
| 9 | Cohérence temporelle (date d'observation ≠ date de publication) | Énoncé p. 14 ; `sources_metadata.csv` (IPC publié plusieurs semaines après le mois de référence) | — | Les données macro ne sont pas utilisées pour l'instant | À respecter si l'IPC ou les taux sont intégrés |
| 10 | Comparabilité : dividendes, fractionnements, CAD/USD | Énoncé p. 14 | — | Aucune conversion ; pas de titres canadiens | Utiliser `adj_close` et `fx_usdcad_daily.csv` |
| 11 | Respect des **licences** | Énoncé p. 14 ; `sources_metadata.csv` (conditions de Yahoo pour les prix) | ⚠️ | Les conditions d'utilisation des données ne sont pas documentées | Documenter. Ne pas republier publiquement les CSV bruts de Yahoo. |
| 12 | **Personas** Amira, Mateo et Robert ; au moins 2 situations contrastées | Énoncé p. 4 à 7 ; diapo 4 | ⚠️ partiel | Il y a un seul compte de démonstration (« Alex Tremblay »). Des briques existent : plafond de risque selon l'horizon et le profil, exclusions, avertissement de volatilité. | Créer les 3 personas en comptes. **Robert** : remettre en question un titre médiatisé (ex. TSLA). **Mateo** : exclusions fondées sur les secteurs du jeu (ex. *Energy*) plutôt que sur des sociétés fictives. **Amira** : alerte de concentration sur la technologie malgré son risque élevé. |
| 13 | Livrables : prototype et README (dépendances, sources, configuration, reproduction), vidéo d'environ 5 min, documentation technique, one pager | Énoncé p. 15-16 ; diapo 9 | ⚠️ | Le README et le prototype existent mais n'ont pas de section sur les sources de données. `docs/architecture.md` est une documentation de développement, pas la documentation technique demandée. Il n'y a ni vidéo ni one pager. | À produire une fois la solution conforme |

## Points déjà conformes

- Profils et portefeuilles entièrement fictifs, sans donnée personnelle réelle (énoncé p. 14).
- L'application elle-même n'exécute aucune transaction : les achats sont enregistrés localement, en simulation.
- Le prototype est démontrable, et le README contient les instructions d'installation et de lancement.
- Les briques d'adaptation au profil peuvent servir de base aux tests des personas : plafond de risque, exclusions, avertissement de volatilité, portefeuilles avec objectif, horizon, risque, mise et retraits.

## Demande en conflit : redirection directe vers BNCD

Demande : « plutôt que d'avoir un menu intermédiaire entre l'action et l'achat, envoyer directement sur le site de BNCD ».

Cette redirection supprimerait la dernière étape simulée. Le bouton d'achat mènerait directement à la plateforme de courtage réelle, ce qui contredit :
- les règles 3 et 5 (simulation uniquement, aucun compte réel) ;
- la règle 4 (une carte « Buy » ressemblerait encore plus à un conseil personnalisé).

**Recommandation :** ne pas l'appliquer. Faire l'inverse pour le datathon : achat simulé dans l'application, et lien BNCD facultatif et clairement séparé (« Consulter la cote sur BNCD »), ou supprimé.

**Décision (14 novembre 2026) :** l'utilisateur a choisi d'appliquer la redirection directe. AWS et les agents seront traités ensuite.
- Mise en œuvre : `Buy now` et l'icône panier ouvrent la page BNCD du titre dans un nouvel onglet (voir `docs/architecture.md` §20).
- Statut : les règles 3, 4 et 5 restent **non conformes**. À réévaluer avant le dépôt au jury : le lien peut redevenir un simple « Consulter la cote », séparé d'un achat simulé.
