# Checklist de conformité — Datathon AlphaForge AI 2026

Premier audit : 14 nov. 2026. Sources : Case officiel FR (« Énoncé », pages .NN), présentation participants (« Diapo N »), `CLAUDE.md`, `web/docs/conformite-datathon.md` (audit UI), demandes du product owner (« PO »).
Sévérité : **B** = bloquant (inadmissible ou contraire au cadre responsable), **I** = important (points de grille), **M** = mineur.
Les zones `alphaforge/api.py`, `alphaforge/pipeline/` et `web/` sont en cours de modification : marquées **EC** (en cours, à réauditer).

## 1. Règles et exigences

| id | Règle | Source | Vérifier dans CE dépôt | Sév. |
|---|---|---|---|---|
| R01 | AWS contribue réellement et de façon démontrable ; sinon projet non évalué | Diapo 7 ; Énoncé (grille) | `python scripts/check_aws.py` retourne « connecté » ; une trace d'appel Bedrock réelle visible dans l'UI ; `docs/aws.md` justifie chaque service ; une capture/vidéo montre l'appel | B |
| R02 | Chaque service AWS est justifié (pas d'empilement) | CLAUDE.md ; Diapo 7 | Tableau « service → rôle → preuve » dans la doc technique | I |
| R03 | Solution agentique auto-explicative : rôles clairs, outils, coordination, points de contrôle | Énoncé .08 ; Diapo 5 | `alphaforge/agents.py` : un rôle par agent, outils listés, trace de chaque appel ; schéma dans la doc technique | B |
| R04 | Explications fidèles aux données et aux actions observables, sans justification inventée ni raisonnement interne détaillé | Énoncé .17 | `validate_explanation` (chaque nombre existe dans la trace) ; `tests/test_agents.py` ; ne pas afficher de chaîne de raisonnement brute du modèle | B |
| R05 | Simulation uniquement : aucune transaction réelle | Énoncé .10, .17 ; Diapo 11 | grep `bnc.ca\|bncd` dans `web/src`, `alphaforge`, `app.py` : aucun lien menant à un achat réel dans le parcours ; libellé « Simuler l'achat » | B |
| R06 | Ne pas se présenter comme conseil financier personnalisé | Énoncé .17 ; Diapo 11 | grep `\bBuy\b\|Acheter\|recommand` dans l'UI : aucun ; mention permanente « Simulation, pas un conseil » visible sur chaque écran ; `ADVICE_PATTERNS` dans `agents.py` | B |
| R07 | Aucun compte client réel ni donnée bancaire confidentielle ; profils fictifs | Énoncé .14 ; Diapo 11 | Aucun champ identifiant bancaire ; personas seuls ; pas de lien « connexion BNCD » | B |
| R08 | Distinguer faits, hypothèses, scénarios fictifs | Énoncé .17 | Étiquettes « Fait (source) / Hypothèse / Scénario » sur chaque chiffre ; panneau « Toutes nos hypothèses » (encore ouvert, `docs/review.md`) | I |
| R09 | Présenter les incertitudes importantes de façon compréhensible | Énoncé .17 | Fourchettes (p5–p95), part sous le capital initial, « données insuffisantes » affiché quand c'est le cas | I |
| R10 | Ne pas prédire les rendements futurs à partir du passé ; expliquer indicateurs et limites | Énoncé .18 | Voir T1 ; aucune médiane seule ; `_wording_hits` rejette « va atteindre » ; texte de limites présent | B |
| R11 | Rendement toujours accompagné de période, volatilité, drawdown, Sharpe | Énoncé .18 ; CLAUDE.md | Chaque affichage de rendement : période + vol + drawdown ; test sur `metrics.py` | I |
| R12 | Données publiques ; source, date, devise, traitements documentés | Énoncé .10, .14 | Chaque jeu : source + as-of + devise + définition (README « Sources de données ») ; `quality_report()` sur tout nouveau fichier | B |
| R13 | Aucun chiffre inventé : tout nombre vient d'une fonction de `alphaforge/` ; pas de prix fictifs pour de vraies sociétés | CLAUDE.md ; audit UI n°6 | Comparer un prix affiché à `prices_daily.csv` (ex. NVDA 166,19 $ au 2026-11-12) ; `web/src/data` sans valeurs codées en dur (EC) | B |
| R14 | Cohérence temporelle : pas de look-ahead ; date de publication ≠ date d'observation | Énoncé .14 | Macro datée à la publication ; backtest séparé dans le temps ; test dédié | I |
| R15 | Comparabilité : `adj_close`, split/dividendes, conversion CAD/USD, biais de sélection, données manquantes | Énoncé .14 | `data.load_starter`, `quality_report`; CNQ.TO 2022-08-22 et biais de survie annoncés dans l'UI (pas encore) | I |
| R16 | Licences et conditions de réutilisation documentées ; ne pas republier les CSV bruts | Énoncé .10, .13, .14 | Section licences dans README ; `data/raw/` ignoré par `.gitignore` | I |
| R17 | Personas Amira, Mateo, Robert servent de tests de pertinence | Énoncé .04–.07 | `tests/test_app.py` (histoire de Robert) ; Amira : pas « tout est acceptable » ; Mateo : ESG au-delà du rendement | I |
| R18 | Robert : le système conteste une demande incohérente avec le profil, explique, n'acquiesce pas | Énoncé .07 | `decide.check_intention` verdict tension/conflit ; test headless | B |
| R19 | Mettre les résultats à l'épreuve (sensibilité aux hypothèses/scénarios) | Énoncé .08 | Au moins une analyse de sensibilité visible (volatilité cible, horizon, scénario) | I |
| R20 | Gouvernance : vérifie contraintes + limite simulation, signale conflits et infos manquantes, contrôles visibles | Énoncé .09 | Panneau de contrôles dans l'UI ; `decide.py` trace ; `validate_explanation` | I |
| R21 | Pas de secrets en dur ; variables d'environnement | PO ; CLAUDE.md | Voir § 4 (scan) ; `.env` ignoré ; `.env.example` sans valeur | B |
| R22 | Mode simulé (stub) pour poursuivre sans AWS | PO | Sans clé : `bedrock_available()` faux, repli déterministe ; le dire à l'écran (« mode hors ligne ») pour ne pas faire passer un stub pour AWS | I |
| R23 | Le code est poussé sur GitHub avant l'expiration du compte AWS (lun. 16 nov., fin de journée) | CLAUDE.md | `git remote -v` — **le dossier n'est PAS un dépôt git à ce jour** (`git rev-parse` échoue) | B |
| R24 | UX/UI intuitive, ergonomique, claire (10 %) | Diapo 10 | Parcours des 3 personas sans aide ; textes en français cohérents | M |
| R25 | Pitch : présentation, valeur d'affaires, marketing (15 %) | Diapo 10 | Support de pitch ; hors dépôt | M |
| R26 | Date limite et plateforme de dépôt : à confirmer (ne pas inventer) | Énoncé .16 | Demander aux organisateurs ; noter ici la valeur confirmée | I |

## 2. Livrables

| id | Livrable | Contenu exigé | Source | Vérifier | Sév. |
|---|---|---|---|---|---|
| L1 | Prototype + code + README | Cas d'usage complet, explication accessible (sources, hypothèses, facteurs, limites). README : dépendances, sources de données, configuration, démarrage/reproduction | Énoncé .15 | `README.md` a ces sections (présentes) ; **étapes d'installation jamais exécutées de bout en bout** : tester sur une machine propre | B |
| L2 | Vidéo ≈ 5 min | Exemple de bout en bout : problème, rôle des agents, données et outils, résultat, explication. ≥ 2 situations contrastées (ex. Amira vs Robert) | Énoncé .15 | Durée ≤ ~5 min ; deux personas ; l'appel AWS visible ; disclaimer visible | B |
| L3 | Documentation technique | (a) méthodes/modèles/technos + justification ; (b) sources, actifs, traitements, hypothèses ; (c) mécanisme d'explicabilité + exemple reliant une conclusion aux données/traces ; (d) validations des résultats et des explications, limites, améliorations. Aussi : rôles et interactions des agents, contrôles/gouvernance | Énoncé .15 ; CLAUDE.md | Fichier à créer (absent) ; chaque section présente | B |
| L4 | One pager (1 page max) | Problématique, approche agentique, originalité, sources de données, capacité d'explication, bénéfices pour l'utilisateur | Énoncé .16 | Fichier à créer (absent) ; compter 1 page | B |

## 3. Tensions entre la demande et le règlement

| id | Demande | Conflit avec | Formulation conforme à utiliser |
|---|---|---|---|
| T1 | Prédicteur « notre prédiction » sur 5 ans (meilleur/pire/prédiction) | Énoncé .18 : le défi ne demande pas de prédire les rendements futurs à partir du passé ; R10 | Appeler « **Scénario central (hypothétique)** », jamais « notre prédiction ». Afficher les trois comme **scénarios illustratifs** : « pire cas plausible (p5) / scénario central (médiane) / meilleur cas plausible (p95) ». Chaque scénario : méthode (bootstrap des rendements passés, période X–Y), hypothèses, limites, part sous le capital initial. Jamais la médiane seule. Mention : « Ce n'est pas une prévision. Les rendements passés ne garantissent pas les résultats futurs. » Si « réaliste et justifié » : justifier par la méthode et les données, pas par une conviction du modèle |
| T2 | Redirection directe vers BNCD à l'achat (décision du 14 nov., close le 15 nov. : `DIRECT_BNCD = false`) | R05, R07, Énoncé .10/.17 ; audit UI règles 3-5 | Bouton « **Simuler l'achat** » (dans l'app). Si lien BNCD conservé : « Consulter la cote sur BNCD (site externe, hors simulation) », séparé du parcours d'achat, sans pré-remplissage, jamais « Buy now ». Retirer le marquage « achat BNCD non confirmé » qui laisse croire à un achat réel |
| T3 | En-tête « Buy » sur les cartes | R06 | « **Adéquation au profil : compatible / en tension / en conflit** » ; « Analyse », jamais impératif « achetez/vendez » |
| T4 | « Fact-Checker » qui valide des affirmations | R04 | Le vérificateur ne certifie pas : il rapporte « confirmé par la source X (date) / non vérifiable / contredit » et dit « donnée insuffisante » quand c'est le cas |
| T5 | « Source Finder » et « Data Collector » sur le web | R12, R16 | Uniquement sources publiques et licences respectées ; journaliser URL, date d'accès, traitement ; ne pas republier les données brutes ; pas de contenu protégé |
| T6 | Quatre agents « pour l'effet » | Énoncé .08 : le nombre d'agents n'est pas un but | Documenter le rôle et le contrôle de chacun ; fusionner si un agent n'a pas de raison d'être |
| T7 | Stub AWS pour continuer à travailler | R01 | Le stub est un outil de développement ; la démo et la vidéo doivent utiliser le vrai Bedrock ; l'UI indique le mode actif |

## 4. Scan de secrets (14 nov.)

- Motifs cherchés : `AKIA…`, `aws_secret_access_key`, `AWS_SECRET`, `Bearer <jeton>`, `ABSK…`, `sk-…` dans tout le dépôt hors `node_modules`, `.venv`, `data/raw` : **aucun résultat**.
- `.env` : **absent** ; seul `.env.example` existe, **sans valeurs** (clé vide). `.gitignore` ignore `.env` et `*.key`.
- La clé n'est lue que par `os.environ` (`alphaforge/agents.py`). Les tests utilisent des faux jetons (`faux-jeton-de-test`).
- Risque restant : le dossier n'est pas un dépôt git ; au moment de créer le dépôt, vérifier que `.gitignore` est en place avant le premier commit. Aucun `web/.env` ni variable `VITE_*` secrète trouvée (à revérifier : `web/` est en cours).

## 5. Réaudit (15 nov.) — pipeline, API, web câblé, Bedrock réel (us-east-1)

Légende : ✅ conforme, ⚠ partiel, ❌ non conforme.

| Règle | État | Preuve / reste à faire |
|---|---|---|
| R01 AWS réel | ✅ | Bedrock tourne en direct (annonce de l'équipe). Reste : capture/trace visible dans l'UI et dans la vidéo |
| R02 Services justifiés | ⚠ | Justification dans `docs/aws.md` ; tableau dans la doc technique à écrire |
| R03 Agentique | ✅ | `alphaforge/pipeline/` : `source_finder.py`, `fact_checker.py`, `data_collector.py`, `predictor.py` + `_trace.py`. Reste : doc de leurs rôles |
| R04 Explications fidèles | ✅ | `pipeline/__init__.py:107-135` rejoue `agents.validate_explanation` ; `api.py:565` |
| R05 Simulation seulement | ✅ | Mis à jour le 15 nov. : `DIRECT_BNCD = false` (`web/src/lib/bncd.ts`), l'achat est simulé dans l'application, jamais vers le vrai courtier ; `BuyPage.tsx` « aucun ordre n'est transmis ». Décision close |
| R06 Pas de conseil | ✅ | Bandeau permanent (`AppBanner.tsx` « Simulation — pas un conseil financier ») ; libellés « Simuler l'achat » et « Si j'achetais » ; verdict d'adéquation à la place de « Buy ». À rejouer : grep des libellés avant la remise |
| R07 Pas de compte réel | ✅ | Profils fictifs ; achat simulé (`DIRECT_BNCD = false`), plus de lien vers une connexion BNCD. Reste à vérifier : le marquage « Achat BNCD non confirmé » de `PositionList.tsx` |
| R08 Faits/hypothèses/scénarios | ⚠ | Scénarios et hypothèses étiquetés (`CardDetails.tsx:100,144-151`) ; pas d'étiquette « Fait / Hypothèse » sur chaque chiffre ; pas de panneau global d'hypothèses |
| R09 Incertitudes | ✅ | `CardDetails.tsx:121-132` (part sous la mise, volatilité) ; `predictor.py:138` limites |
| R10 Pas de prévision | ⚠ | Prédicteur : « Scénario favorable / Notre scénario central / défavorable » (`predictor.py:24`, `api.py:278`) + `disclaimer` (`api.py:287`, `predictor.py:138`) : acceptable, mais « Notre » suggère une prévision. Ancienne vue mock : `CardDetails.tsx:299` « Valeur médiane à 12 mois » sans fourchette |
| R11 Rendement + vol + drawdown | ⚠ | Non revérifié dans tous les écrans web ; vue live OK (`CardDetails.tsx:84`) |
| R12 Source, date, devise | ⚠ | Vue live : période, source, date, devise (`CardDetails.tsx:84-85,202,217`). Cartes du fil et vue mock : pas de source/date visibles |
| R13 Pas de chiffre inventé | ⚠ | Repli mock : `web/src/data/products.ts` génère des historiques fictifs de vraies sociétés ; bandeau « Données fictives : le serveur d'analyse n'est pas joignable » (`AppBanner.tsx:12-16`) mais pas sur chaque chiffre. Repli snapshot : `web/public/snapshot.json` libellé « Copie locale » |
| R14 Look-ahead | ⚠ | Non revérifié (macro non utilisée dans l'UI) |
| R15 Comparabilité | ⚠ | Devise affichée ; artefact CNQ.TO et biais de survie toujours absents de l'UI |
| R16 Licences | ⚠ | `src.license` affiché (`CardDetails.tsx:202`) ; section licences du README à confirmer |
| R17-R18 Personas / Robert | ✅ | `tests/test_app.py`, `decide.check_intention` ; non retesté dans le web |
| R19 Sensibilité | ✅ | `CardDetails.tsx:148` `sensitivity_summary` |
| R20 Gouvernance visible | ✅ | `api.py:565` ; `IdeaCheck.tsx` |
| R21 Secrets | ✅ | Voir § 4 |
| R22 Stub | ✅ | Bandeaux mock/snapshot dans `AppBanner.tsx` : le mode est dit à l'écran |
| R23 GitHub | ❌ | Toujours pas de dépôt git. Compte AWS expire lun. 16 nov. |
| R24 UX | ⚠ | Libellés alignés en français (« Simuler l'achat », « Si j'achetais ») ; relecture finale à faire |
| L1 README | ⚠ | Présent ; installation jamais exécutée sur machine propre |
| L2 Vidéo, L3 Doc technique, L4 One-pager | ⚠ | Doc technique, one-pager et script vidéo rédigés ; vidéo à enregistrer |
| T1-T3 | ✅ | T1 appliqué (3 scénarios + disclaimer) ; T2 (achat simulé) et T3 (verdict d'adéquation) appliqués le 15 nov. |
| A11 Divulgations (hypothèses globales, CNQ.TO, fenêtres courtes) | ❌ | Toujours absentes de l'UI |
| CORS | ✅ | `api.py:435` limité à localhost:5173 |

### Scan de secrets (réaudit, inclut `web/` et `data/cache/`)
- Motifs AKIA/aws_secret/Bearer/ABSK/sk- : aucun résultat dans le code, `web/`, `data/cache/`, `outputs/`, `web/public/snapshot.json`.
- `.env` existe maintenant ; il est listé dans `.gitignore` (ligne 5). Aucune référence à `.env`, `BEARER` ou `AKIA` dans `snapshot.json` ni `outputs/snapshot_profiles.json`. Le début de la clé n'apparaît que dans `.env` et dans un PDF de l'atelier (`docs/given/Atelier_AWS_PolyFinances _ aide-mémoire.pdf`) : à vérifier à la main que ce PDF ne contient pas la clé d'équipe avant de pousser sur GitHub (ne pas l'afficher).
- Les `.pyc` mentionnent seulement des mots (« prédiction », « Bearer ») dans les regex de contrôle ; sans danger, à ignorer via `.gitignore`.
