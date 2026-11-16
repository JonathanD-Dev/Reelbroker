# Résumé du matin : mise à jour du 15 novembre

Ce résumé a été mis à jour après la journée du 15 novembre. Diaporama du pitch : lien dans la conversation.

## Ce qui est fait et vérifié

- **Interface React de l'équipe branchée sur le vrai backend.** Elle est dans `web/`, avec votre fil à défilement : Reel, signet, menu ⋮, Sauvegardés, notes, sélecteur de portefeuille.
  - Le questionnaire est le nôtre : adaptatif, avec un scénario de baisse réelle. Je l'ai testé en direct de bout en bout.
  - Trois boutons de l'accueil créent directement les personas Amira, Mateo et Robert.
- **API FastAPI** (`alphaforge/api.py`, contrat dans `docs/api-contract.md`) : profils, fil, fiche détaillée, vérification d'une idée, achat simulé, profil révélé, mise à jour de la tolérance et liste des hypothèses.
  - Les trois personas sont préchargés au démarrage : leur fil s'affiche en moins de 0,1 s. L'univers compte maintenant **91 actifs** (31 des organisateurs et 60 ajoutés par nous, même méthode et même fenêtre). Fils : Amira 90 titres, Mateo 24, Robert 91 ; chaque titre apparaît une fois, avec une carte de fin.
- **Les 4 agents** (`alphaforge/pipeline/`) :
  - **Source Finder** : choisit les sources dans un registre de sources réelles ; Bedrock classe et justifie, mais les données du datathon restent la source principale.
  - **Fact-Checker** : code pur. Il contrôle les prix, les trous, la devise, et la concordance du niveau de prix et des rendements avec Yahoo.
  - **Data Collector** : données du datathon converties en CAD, Yahoo en option, avec cache.
  - **Predictor** : trois scénarios hypothétiques à 5 ans (favorable, central, défavorable) avec méthode, limites, grille de sensibilité et avertissement. Ce n'est pas une prévision.
- **AWS Bedrock en direct**, en us-east-1 avec Claude Sonnet 4.6.
  - Les 91 explications sont validées par la gouvernance dès la 1re tentative.
  - Le test de Robert passe en direct : « 20 % dans Tesla » est déclaré **en conflit**, avec une part maximale compatible de 7 % (la volatilité passerait de 6,0 % à 13,0 %, Tesla pèserait 84 % du risque).
  - Le badge « Amazon Bedrock » et les tentatives de gouvernance sont visibles dans l'interface.
- **Deux revues de code par Opus** (backend, puis interface) : 20 défauts trouvés. tous sont maintenant corrigés (le dernier, les libellés « Acheter » et « Buy now », l'est avec `DIRECT_BNCD = false` et les nouveaux libellés).
- **Tests :** 169 tests Python passent et 336 tests d'interface passent (plus 1 échec attendu). La compilation est propre. L'installation du README a été testée dans une copie vierge.
- **Brouillons des livrables :**
  - `docs/technical.md` : documentation technique ;
  - `docs/one-pager.md` : résumé d'une page ;
  - `docs/video-script.md` : script vidéo de 5 min ;
  - `docs/compliance-checklist.md` : 26 règles et audit.

## Ce que vous devez fournir ou décider

1. **La clé Bedrock expire 12 h après sa création.** Avant toute démo et avant l'enregistrement de la vidéo :
   - console AWS → Bedrock → **API keys** → **Generate short-term key**, en restant dans la région **us-east-1** ;
   - collez la clé dans `.env` à la ligne `AWS_BEARER_TOKEN_BEDROCK=`.

   Les explications déjà en cache fonctionnent sans clé, mais « Vérifier une idée » en direct en a besoin.
2. **Mettre le code sur GitHub avant lundi soir**, quand le compte AWS sera supprimé. Le dossier n'est pas encore un dépôt git. Dites-moi si je fais `git init` et le premier commit, et donnez-moi l'adresse du dépôt. `.env` est déjà exclu.
3. **Décision réglée : BNCD et libellés.** `DIRECT_BNCD = false` : l'achat est simulé dans l'application, jamais vers le vrai courtier. Les libellés sont « Simuler l'achat » et « Si j'achetais ». Rien à décider.
4. **Facultatif, pour la note AWS :** créer un **garde-fou** (Bedrock → Guardrails, sujet refusé : conseil financier personnalisé) et me donner son identifiant. Le code le prend déjà en charge avec `BEDROCK_GUARDRAIL_ID`.
5. **La date limite de remise** et le nombre de personnes dans l'équipe.

## Ce qui reste à faire

- Enregistrer la vidéo en suivant `docs/video-script.md`.
- Renouveler la clé Bedrock (12 h) avant la vidéo.
- Relire les trois documents des livrables.
- Le premier calcul du fil pour un nouvel utilisateur prend environ 4 s. Les personas sont instantanés. Les requêtes envoyées pendant le préchauffage de l'API peuvent attendre environ 30 s : démarrer l'API une minute avant une démonstration.
- « Vérifier une idée » n'est pas mis en cache (appel réel à Bedrock).
- La volatilité de TSLA vaut 58,3 % dans « Vérifier une idée » et 57,7 % dans la fiche, parce que les deux fenêtres de calcul diffèrent légèrement. C'est mineur et c'est documenté.

## Liste des changements

**Backend (Python)**
- Nouveaux fichiers :
  - `alphaforge/api.py` : l'API ;
  - `alphaforge/hypotheses.py` : les hypothèses lues depuis le code ;
  - `alphaforge/pipeline/` : `source_finder`, `fact_checker`, `data_collector`, `predictor`, `_trace`, `_timeout`.
- `alphaforge/agents.py` : la gouvernance rejette aussi les affirmations de probabilité, et les nombres autorisés ne sont plus multipliés par 100.
- `alphaforge/feed.py` et `decide.py` : mises en cache, plus de 3 fois plus rapides, résultats identiques ; ajout des centiles 10 et 90.
- Scripts :
  - `serve_api.py` : charge `.env`, option `--port` ;
  - `export_snapshot.py` : copie de secours de l'interface ;
  - `warm_pipeline.py` : précalcul des titres sur Bedrock (91 aujourd'hui).
- Tests ajoutés : `test_api.py`, `test_pipeline.py`, `test_hypotheses_api.py`. `requirements.txt` gagne fastapi, uvicorn et httpx.

**Interface (`web/`)**
- Client d'API avec repli : API, puis `public/snapshot.json`, puis données fictives signalées.
- Nouvelles pages et composants :
  - questionnaire adaptatif : `QuestionFlow`, `SignupPage`, `NewPortfolioFlow` ;
  - « Voir plus » sur données réelles : historique, statistiques, 3 scénarios, panneau des 4 agents, badge Bedrock ;
  - `IdeaCheck`, `LearnBlock`, `DeclaredProfile`, `Hypotheses`, `AgentProgress`, `Markdown`.
- Conformité :
  - bandeau permanent « Simulation — pas un conseil financier » ;
  - verdict d'adéquation à la place de « Buy » ;
  - « Scénario central (hypothétique) » ;
  - projection fictive retirée.
- Les « Pour », « Contre », signets et masquages sont envoyés au serveur, qui réordonne le fil.
- Tests ajoutés : `backend`, `polish`, `batch3` à `batch8`.

**Documentation :** `docs/api-contract.md`, `compliance-checklist.md`, `technical.md`, `one-pager.md`, `video-script.md`, ce résumé. Mises à jour : `README.md` (« Lancer la démo », architecture) et `CLAUDE.md`.

**Lancer la démo :** `.venv\Scripts\python scripts\serve_api.py` puis, dans `web/`, `npm run dev`. Ouvrir http://localhost:5173.
