# Lancer ReelBroker en local

ReelBroker est le nom du projet. Le cas du Datathon PolyFinances 2026 s'appelle « AlphaForge AI » : c'est pourquoi le module Python, les variables `ALPHAFORGE_*` et certains chemins gardent le nom technique `alphaforge`.

Ce guide s'adresse à une personne qui découvre le dépôt. Il explique comment lancer l'application complète sur votre ordinateur, sous Windows, macOS ou Linux. Comptez environ 10 minutes, une fois le jeu de données en place.

L'application a deux parties, qui tournent dans deux terminaux :

```
Navigateur ──> Interface React (Vite, port 5173) ──/api──> API Python FastAPI (port 8000) ──> moteur de calcul
                                                                                   └──> Amazon Bedrock (facultatif)
```

- **L'API** (`alphaforge/`, lancée par `scripts/serve_api.py`) fait tous les calculs : profil, fil de titres, scénarios, vérifications. Elle écoute sur `127.0.0.1:8000`.
- **L'interface** (`web/`) est servie par Vite sur `http://localhost:5173`. Vite redirige les appels `/api/...` vers l'API : il n'y a rien à configurer entre les deux.
- **Amazon Bedrock est facultatif.** Sans identifiants AWS, tout fonctionne en mode hors ligne : mêmes calculs, mais les textes d'explication sont rédigés par le code au lieu d'un modèle de langage.

Les montants affichés sont des simulations. Rien dans l'application n'est un conseil financier.

---

## 1. Prérequis

| Outil | Version | Vérifier |
|---|---|---|
| Python | **3.11** (testé avec 3.11.18) | `python --version` (Windows : `py -3.11 --version`) |
| Node.js | **22 LTS ou 24** (testé avec 24.22.3 ; minimum de Vite : 20.19) | `node --version` |
| npm | fourni avec Node.js (testé avec 11.19) | `npm --version` |
| Git | toute version récente | `git --version` |

Python 3.9 ou 3.10 ne suffisent pas : certaines dépendances (pandas 3.1, numpy 2.4) demandent 3.11 ou plus.

Installation si besoin :
- Python : https://www.python.org/downloads/ (Windows : cochez « Add python.exe to PATH »). Sous macOS, `brew install python@3.11` fonctionne aussi.
- Node.js : https://nodejs.org/ (version LTS).

---

## 2. Récupérer le code

```bash
git clone <adresse-du-dépôt> alphaforge
cd alphaforge
```

**Toutes les commandes de ce guide se lancent depuis la racine du dépôt** (le dossier qui contient `README.md`, `requirements.txt` et `web/`), sauf indication contraire. L'API lit ses données et son fichier `.env` par chemins relatifs : lancée depuis un autre dossier, elle ne trouve rien.

---

## 3. Mettre en place le jeu de données (obligatoire)

L'API a besoin du jeu de données de départ fourni par les organisateurs du Datathon PolyFinances 2026 (« AlphaForge AI starter dataset »). **Il n'est pas dans le dépôt** : le dossier `data/raw/` est exclu de Git, parce que les cours viennent de Yahoo Finance, dont les conditions d'utilisation ne permettent pas de les republier.

Placez les fichiers exactement ici :

```
data/raw/datathon2026/Datathon2026/alphaforge_starter/
├── assets_universe.csv
├── prices_daily.csv
├── corporate_actions.csv
├── fx_usdcad_daily.csv
├── macro_rates.csv
├── sources_metadata.csv
├── data_quality_warnings.txt
├── build_dataset.py
└── README.md
```

L'API lit au minimum `assets_universe.csv`, `prices_daily.csv` et `fx_usdcad_daily.csv`. `macro_rates.csv` sert au taux de référence de la Banque du Canada. Fenêtre attendue : du 12 novembre 2021 au 12 novembre 2026.

Sans ces fichiers, l'API s'arrête au démarrage avec :

```
FileNotFoundError: [Errno 2] No such file or directory: '.../data/raw/datathon2026/Datathon2026/alphaforge_starter/assets_universe.csv'
ERROR:    Application startup failed. Exiting.
```

**Ce qui est déjà dans le dépôt :** l'univers étendu (`data/processed/extended/`, 60 titres de plus, avec leur provenance dans `provenance.json`) et les chiffres des mises en situation du questionnaire (`data/processed/risk_scenarios.json`).

**Si vous n'avez pas le paquet des organisateurs :** le script `build_dataset.py` du paquet le régénère depuis Yahoo Finance, la Banque du Canada et FRED. Il demande un accès Internet et la bibliothèque `yfinance`, qui n'est pas dans `requirements.txt` (voir le `README.md` du paquet). Les valeurs peuvent différer légèrement de l'original : Yahoo recalcule les cours ajustés à chaque téléchargement.

---

## 4. Installer l'environnement Python (une seule fois)

macOS et Linux :

```bash
python3.11 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements.txt
```

Windows (PowerShell ou invite de commandes) :

```bat
py -3.11 -m venv .venv
.venv\Scripts\python -m pip install --upgrade pip
.venv\Scripts\python -m pip install -r requirements.txt
```

L'installation prend environ une demi-minute avec une bonne connexion. Les versions sont épinglées dans `requirements.txt` : moteur de calcul (numpy, pandas, scipy), API (fastapi, uvicorn), agents (strands-agents, boto3), plus Streamlit et pytest.

Vérification :

```bash
.venv/bin/python -c "import fastapi, pandas, strands; print('dépendances OK')"
```

(Windows : `.venv\Scripts\python -c "..."`.)

Il n'est pas nécessaire d'« activer » l'environnement : les commandes de ce guide appellent directement `.venv/bin/python` (ou `.venv\Scripts\python`).

---

## 5. Configurer Amazon Bedrock (facultatif)

Sautez cette étape pour un essai hors ligne.

1. Copiez le modèle de configuration :
   - macOS et Linux : `cp .env.example .env`
   - Windows : `copy .env.example .env`
2. Remplissez **une** des deux méthodes d'authentification dans `.env` :
   - `AWS_BEARER_TOKEN_BEDROCK` : une clé d'API Amazon Bedrock (console AWS, Amazon Bedrock, « API keys ») ;
   - ou `AWS_PROFILE` : un profil de l'AWS CLI déjà connecté (`aws configure sso`, `aws login`...).
3. Indiquez `AWS_REGION`, la région où le modèle est activé (par exemple `us-east-1`).
4. Facultatif : `BEDROCK_MODEL_ID`. Par défaut, c'est le modèle de Strands Agents, `global.anthropic.claude-sonnet-4-6`. L'accès à ce modèle doit être activé dans votre compte AWS.
5. Vérifiez la connexion, avec un appel minuscule au modèle :

   ```bash
   .venv/bin/python scripts/check_aws.py
   ```

   Le résultat attendu se termine par `Appel d'essai réussi. Réponse du modèle : Prêt`. Pour tester toute la chaîne d'agents sur un cas d'essai (Robert et « 20 % dans Tesla ») : `.venv/bin/python scripts/check_aws.py --agents`.

**Ne committez jamais `.env`.** Il est déjà dans `.gitignore`, et le script n'affiche jamais la clé.

**Coût.** Avec Bedrock, des appels sont facturés :
- au démarrage, l'API prépare en arrière-plan les 8 premières fiches de chaque profil, soit au moins 24 fiches pour les trois personas ;
- ensuite, chaque fiche jamais ouverte demande un ou deux appels.

Les textes produits sont gardés dans `data/cache/pipeline/`. Ils ne sont pas redemandés aux démarrages suivants, tant que les paramètres du profil ne changent pas.

L'API lit `.env` **une seule fois, au démarrage** : après une modification, redémarrez-la.

---

## 6. Lancer l'API (terminal 1)

macOS et Linux :

```bash
.venv/bin/python scripts/serve_api.py
```

Windows :

```bat
.venv\Scripts\python scripts\serve_api.py
```

Laissez ce terminal ouvert. Le démarrage est terminé quand s'affiche :

```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

Vérifiez dans le navigateur : http://127.0.0.1:8000/api/health. La réponse ressemble à :

```json
{"ok":true,"data_as_of":"2026-11-12","bedrock":{"connected":false,...},"warm":{"amira":"building","mateo":"building","robert":"building"}}
```

- `"connected": true` veut dire que des identifiants AWS ont été trouvés. Cela ne garantit pas qu'ils sont valides : `scripts/check_aws.py` le vérifie vraiment.
- `"warm"` passe de `building` à `ready` en moins d'une minute environ : l'API prépare le fil et les premières fiches des trois personas. L'application est utilisable pendant ce temps.

Au premier démarrage, l'API crée `outputs/profiles.json` avec les trois personas de l'énoncé (Amira, Mateo, Robert). Les profils créés ensuite dans l'application y sont ajoutés.

---

## 7. Lancer l'interface (terminal 2)

Ouvrez un second terminal, à la racine du dépôt :

```bash
cd web
npm ci
npm run dev
```

`npm ci` installe exactement les versions de `web/package-lock.json` (quelques secondes). Il n'est utile qu'au premier lancement, ou après un changement de `package-lock.json`.

Vite affiche :

```
  VITE v8.x  ready in ... ms
  ➜  Local:   http://localhost:5173/
```

Ouvrez **http://localhost:5173/**.

---

## 8. Utiliser l'application

Sur la page d'accueil :

- **« Essayer avec un profil type »** : un clic sur Amira, Mateo ou Robert crée un compte prêt à l'emploi et ouvre son fil. C'est le plus rapide pour une démonstration.
  - **Amira** : 26 ans, ingénieure, croissance, horizon de 15 ans et plus, risque élevé.
  - **Mateo** : 41 ans, deux enfants, équilibré, préférences ESG, risque modéré.
  - **Robert** : 59 ans, retraite proche, préservation du capital, horizon de 3 à 5 ans, risque faible à modéré.

  Les réponses que l'énoncé ne donne pas sont inventées pour la démonstration et marquées comme telles (clé `assumed` dans `alphaforge/questionnaire.py`).
- **« Créer un compte »** : le questionnaire complet. Il pose les questions sur votre situation, puis celles du premier portefeuille.
- **« Se connecter »** : par le nom d'un compte déjà créé **dans ce navigateur**, sans mot de passe (prototype de démonstration).

Dans l'application :

- **Fil** : une carte par titre, classée selon le profil. Faites défiler vers le haut ou vers le bas. Le bouton « Voir plus de données » ouvre la fiche détaillée : scénarios sur 5 ans, explication, sources.
  - Toucher l'onglet Fil quand on y est déjà, ou faire défiler vers le haut sur la première carte, recalcule le fil.
- **Sauvegardés** : les titres mis de côté.
- **Profil** : portefeuilles, profil investisseur, « Vérifier une idée » (par exemple « je veux mettre 20 % dans Tesla »), profil révélé et hypothèses.

La première ouverture d'une fiche peut prendre de 7 à 17 secondes avec Bedrock (rédaction, puis contrôle des chiffres), et quelques secondes hors ligne. Ensuite, la fiche sort du cache.

**Où sont les données :**
- les profils (réponses, réactions, journal des décisions) sont sur le serveur, dans `outputs/profiles.json` ;
- les comptes, les portefeuilles, les sauvegardés et la position dans le fil sont dans le navigateur (`localStorage`).

Au tout premier chargement, l'application efface une fois les anciennes données qu'une version précédente aurait laissées dans ce navigateur. C'est voulu.

---

## 9. Lancer les tests (facultatif)

Depuis la racine du dépôt :

```bash
.venv/bin/python -m pytest -q          # 169 tests Python, environ 1 minute
cd web
npx vitest run                         # 336 tests de l'interface (+ 1 échec attendu, marqué comme tel)
npm run build                          # vérification des types TypeScript et build de production
```

Les tests n'appellent jamais Amazon Bedrock : ils ignorent `.env` et n'utilisent pas le vrai cache. Les tests qui ont besoin du jeu de départ sautent automatiquement s'il est absent.

---

## 10. Arrêter et remettre à zéro

- **Arrêter** : `Ctrl+C` dans chacun des deux terminaux.
- **Repartir des trois personas seulement** : arrêtez l'API, supprimez `outputs/profiles.json`, puis relancez-la. Elle recrée Amira, Mateo et Robert.
- **Faire rédiger de nouveau les textes Bedrock** : arrêtez l'API, déplacez ou supprimez le dossier `data/cache/`, puis relancez-la. Les textes seront régénérés, et facturés.
- **Effacer les comptes du navigateur** : outils de développement du navigateur, onglet Application (Chrome, Edge) ou Stockage (Firefox), puis « Clear site data » pour `localhost:5173`.

---

## 11. Variante : l'application Streamlit

Le dépôt contient aussi une version Streamlit plus ancienne, sans l'interface React. Elle n'a pas besoin de l'API :

```bash
.venv/bin/python -m streamlit run app.py
```

Elle s'ouvre sur http://localhost:8501. Les boutons « Charger Amira », « Charger Mateo » et « Charger Robert » sont dans la barre latérale.

---

## 12. Variables utiles

| Variable | Où | Effet |
|---|---|---|
| `AWS_BEARER_TOKEN_BEDROCK`, `AWS_PROFILE`, `AWS_REGION`, `BEDROCK_MODEL_ID` | `.env` (racine) | Accès à Amazon Bedrock (étape 5) |
| `BEDROCK_GUARDRAIL_ID`, `BEDROCK_GUARDRAIL_VERSION` | `.env` | Garde-fou Bedrock Guardrails, en plus du contrôle par le code |
| `ALPHAFORGE_PROFILES` | environnement de l'API | Autre emplacement pour le fichier des profils (par défaut `outputs/profiles.json`) |
| `VITE_USE_API=false` | `web/.env.local` ou environnement de `npm run dev` | Interface sans aucun appel réseau, avec des données fictives intégrées (démonstration sans API) |
| `VITE_API_BASE` | `web/.env.local` | Autre adresse pour l'API. Elle contourne le proxy de Vite : l'API doit alors autoriser cette origine (CORS) |

Les variables de `web/` (préfixe `VITE_`) sont lues au démarrage de Vite : redémarrez `npm run dev` après un changement. Le `.env` de la racine n'est jamais lu par l'interface, donc la clé AWS n'arrive jamais dans le navigateur.

---

## 13. Problèmes fréquents

| Symptôme | Cause | Solution |
|---|---|---|
| `FileNotFoundError: ... alphaforge_starter/assets_universe.csv` au démarrage de l'API | Jeu de données absent ou mal placé | Étape 3 : vérifiez le chemin exact, qui contient deux fois « Datathon2026 » |
| `can't open file '.../scripts/serve_api.py'`, ou `FileNotFoundError` sur `data/raw/...` alors que les fichiers sont en place | Commande lancée hors de la racine du dépôt (par exemple depuis `web/`) | Revenez à la racine du dépôt, puis relancez la commande |
| `pip` refuse d'installer `pandas==3.1.1` (ou numpy, scipy) : « No matching distribution found » | Python plus ancien que 3.11 | Supprimez `.venv` et recréez-le avec Python 3.11 (étape 4) |
| `error while attempting to bind on address ('127.0.0.1', 8000): address already in use` | Une autre API (ou un autre programme) occupe le port 8000 | Arrêtez-la. Sinon, lancez `scripts/serve_api.py --port 8001` **et** changez `API_TARGET` dans `web/vite.config.ts` en `http://127.0.0.1:8001` |
| `Port 5173 is already in use` | Un autre serveur Vite tourne déjà | Arrêtez-le, ou lancez `npx vite --port 5174` dans `web/` puis ouvrez ce port |
| Bannière « Données fictives : le serveur d'analyse n'est pas joignable » | L'API ne tourne pas ou ne répond pas sur le port 8000 | Vérifiez le terminal 1 et http://127.0.0.1:8000/api/health |
| Bannière « Profil d'investisseur manquant : répondez au questionnaire » | Compte du navigateur sans profil sur le serveur (par exemple après une suppression de `outputs/profiles.json`) | Répondez au questionnaire, ou utilisez un bouton de persona |
| `scripts/check_aws.py` : `AccessDeniedException ... Authentication failed` | Clé Bedrock expirée ou invalide | Générez une nouvelle clé, mettez `.env` à jour, puis redémarrez l'API |
| `check_aws.py` : `AccessDeniedException` sans « Authentication failed », ou modèle introuvable | Modèle non activé dans ce compte ou cette région | Activez l'accès au modèle dans la console Bedrock, ou changez `AWS_REGION` ou `BEDROCK_MODEL_ID` |
| Les explications restent identiques et rien n'apparaît dans les coûts AWS | Textes servis depuis `data/cache/pipeline/` | C'est voulu (étape 10 pour les régénérer). La facturation AWS apparaît aussi avec 8 à 24 h de retard |
| `npm ci` affiche `EBADENGINE` | Node.js plus ancien que la version demandée par une dépendance | Sans blocage en général. Installez Node 22 LTS ou 24 pour le faire disparaître |
| Page blanche à `http://localhost:5173/` dans un éditeur en ligne (code-server, Kiro) | La variable `VSCODE_PROXY_URI` change l'adresse de base de Vite | Utilisez l'adresse affichée par Vite, du type `.../absproxy/5173/` |

---

## Pour aller plus loin

- `README.md` : fonctionnement, architecture, sources des données, limites.
- `docs/questionnaire.md` : les questions, leurs règles d'affichage et le calcul du profil.
- `docs/aws.md` : rôle de chaque service AWS.
- `deploy/ec2/README.md` : hébergement sur AWS (EC2 derrière CloudFront).
