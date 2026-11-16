# Buy demo

Prototype web mobile-first issu d'un croquis manuscrit : une carte produit « Buy » (exemple : NVDA) avec une vue résumé et une vue détaillée, un menu ⋮ (`Buy now` / `Don't show me again`), des favoris et des projections « If I buy ».

L'application est 100 % front (Vite + React + TypeScript), sans backend ni API. Toutes les données sont fictives.

> **Avertissement : ce prototype n'est pas un conseil financier.** Les cours, historiques, raisons d'achat et projections sont inventés à des fins de démonstration. Aucun achat réel n'est effectué.

## Fonctionnalités

- **Page d'accueil et comptes** : à l'arrivée, on se connecte avec le **nom du compte**, sans mot de passe dans cette démo. Les majuscules et les accents sont ignorés, et les comptes de l'appareil sont proposés en raccourcis. La session dure le temps de l'onglet ; l'icône « Se déconnecter », en haut du Profil, ramène à l'accueil. « Créer un compte » ouvre un questionnaire, une question par écran : le nom (unique sur l'appareil), puis le profil investisseur partagé. **Les comptes existants sont conservés** : chacun a ses portefeuilles, sauvegardés et notes. Ensuite, « Premier portefeuille », que « Créer plus tard » permet de passer pour arriver dans Profil → Portefeuilles. Le compte de démonstration s'appelle « Alex Tremblay ».

- Fil vertical infini façon TikTok / Shorts / Reels : une carte = un écran, défilement aimanté (doigt, molette, ↑ / ↓, PageUp / PageDown, j / k), 16 produits fictifs remélangés à chaque nouvelle page, jamais deux fois le même d'affilée.
- Vue résumé : titre `Buy`, « Pourquoi : » avec les raisons, logo + ticker + nom en bas à gauche, lien `See more data`, rail d'actions à droite (signet, ⋮).
- Vue détaillée : « Historique du produit » (2 mini-graphes), « Impacts prévus sur le portefeuille » (3 courbes : optimiste en vert, médiane en noir, pessimiste en rouge), champ `If I buy`, panier, lien `See less data`.
- Menu ⋮ (panneau du bas) : `Buy now` (ouvre directement la page du titre sur BNCD, nouvel onglet) et `Don't show me again` (produit retiré du fil durablement).
- Double-tap sur une carte = sauvegarde ; message « Ajouté aux sauvegardés · Voir ».
- **Note « Pour » / « Contre »** (doubles chevrons, sous le signet dans le rail) : une simple note personnelle sur l'action, sans sauvegarde ni effet sur le fil. Les deux s'excluent ; retoucher la note active l'annule. La note s'affiche à côté du ticker sur la carte et sur la ligne des Sauvegardés. Elle est propre à chaque portefeuille (`buy-demo:ratings:<id du portefeuille>`).
- Barre d'onglets « Fil » / « Sauvegardés » / « Profil ».
- **Un fil et des sauvegardés par portefeuille** : chaque portefeuille garde ses produits sauvegardés, ses produits masqués et sa position dans le fil. Un sélecteur en haut du fil et de la page Sauvegardés change le portefeuille actif.
- Page **Profil** (un compte local, plusieurs portefeuilles) :
  - onglet *Portefeuilles* : une carte par portefeuille (objectif, valeur totale répartie entre **Encaisse** et **Actifs (actions)**, liste compacte des positions façon Sauvegardés triée par plus forte variation sur 12 mois ; la page tient dans l'écran du téléphone sans défiler : la carte affiche autant de positions que la place le permet, et « Voir toutes les positions (n) » ouvre la liste complète dans un panneau du bas, projection médiane, horizon, risque, mise initiale, retraits), à faire glisser horizontalement, avec « Modifier ». **Toucher une carte la rend active** (au clavier : Tab jusqu'au nom du portefeuille, puis Entrée). À chaque retour sur la page, le portefeuille actif est en premier, puis les autres du plus récemment utilisé au plus ancien (même ordre dans le sélecteur). **Un portefeuille créé devient le portefeuille actif** ;
  - encaisse : l'argent non investi. Elle vaut la mise initiale à la création, diminue à chaque achat simulé (achat refusé si elle est insuffisante) et suit les changements de mise initiale ;
  - onglet *Profil investisseur* : informations partagées par tous les portefeuilles (situation financière, obligations, expérience, préférences et exclusions ESG) ;
  - chaque portefeuille a une icône, choisie parmi 12 à la 1re étape du questionnaire (proposée selon l'objectif tant qu'on n'en a pas choisi). L'onglet « Profil » de la barre du bas affiche l'icône du portefeuille actif, dans sa couleur ; le sélecteur et les cartes l'affichent aussi ;
  - questionnaire en 4 étapes pour créer ou modifier un portefeuille ; la tolérance au risque proposée est plafonnée selon l'horizon et le profil partagé.
- **Achat** : `Buy now` et l'icône panier ouvrent **directement** la page du titre sur Banque Nationale Courtage direct (nouvel onglet, connexion BNCD requise), sans écran intermédiaire. L'ordre se passe sur BNCD : l'application n'achète rien. En ouvrant BNCD, elle ajoute la quantité « If I buy » de la carte (10 par défaut) au **portefeuille actif**, payée sur son encaisse et marquée « achat BNCD non confirmé », puisque rien ne garantit que l'achat a été passé. Un message « … ajoutées à « Retraite » · Annuler » permet de revenir en arrière. Si l'encaisse est insuffisante, BNCD s'ouvre sans rien ajouter. Seules les 3 sociétés fictives, absentes de BNCD, gardent le panier simulé (`#/buy/<ticker>`). La vue détaillée d'une carte indique le poids de l'achat dans le portefeuille actif.
- ⚠️ Cette redirection vers la plateforme de courtage réelle va à l'encontre du cadre « simulation uniquement » du Datathon : voir [`docs/conformite-datathon.md`](docs/conformite-datathon.md).
- Lien BNCD : `https://client.bnc.ca/cdbn/markets/quote/STOCK/{symbole}/USA/overview/chart` (constante `BNCD_QUOTE_URL` dans `src/lib/bncd.ts`). Les 3 sociétés fictives n'ont pas de lien.
- Les secteurs exclus retirent les produits concernés du fil et des sauvegardés (démontré avec 3 sociétés **fictives**, exclues par défaut).
- Page **Sauvegardés** (liste « watchlist ») : logo, ticker, mini-courbe 12 mois, prix et variation ; recherche ; tris Récents / Variation / Nom ; toucher une ligne ouvre la page du titre sur BNCD (nouvel onglet ; une société fictive s'ouvre dans le fil) ; glisser à gauche pour retirer, avec « Annuler ». Un second onglet, **« Bloqués »**, liste les titres masqués avec « Don't show me again », avec un bouton « Débloquer » (le titre revient dans le fil ; « Annuler » possible).
- Sauvegardes et produits masqués conservés dans le `localStorage`.

## Prérequis

- Node.js 20 ou plus récent (testé avec Node 24.22.3 et npm 11.19.1).
- npm.

## Installation

```bash
npm ci        # installation reproductible depuis package-lock.json
# ou : npm install
```

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement Vite, http://localhost:5173 |
| `npm run build` | Vérification des types (`tsc --noEmit`) puis build de production dans `dist/` |
| `npm run preview` | Sert le build de `dist/`, http://localhost:4173 (lancer `npm run build` d'abord) |
| `npm test` | Lance les tests une fois (Vitest, jsdom) |
| `npm run test:watch` | Tests en mode watch |
| `npm run check:theme` | Vérifie que le thème de couleurs BNC (`src/styles/theme-bnc.css`) ne contient que des couleurs |

**Dans l'IDE distant (code-server / Kiro web)** : `localhost` n'est pas joignable depuis votre navigateur. Ouvrez `https://<hôte>/absproxy/5173/` (ici `https://d354khjfji7lcp.cloudfront.net/absproxy/5173/`). La config Vite détecte `VSCODE_PROXY_URI` et sert l'application sous ce chemin. N'utilisez pas `/proxy/5173/` : ce préfixe est retiré par le proxy et donne une page blanche.

Pour changer le port : `npm run dev -- --port 3000` ou `npm run preview -- --port 3000`.

## Structure du projet

```
index.html
vite.config.ts          # config Vite + Vitest
src/
├── main.tsx            # point d'entrée
├── App.tsx             # routage (hash) et état global (favoris, masqués)
├── types.ts            # modèle de données
├── data/               # produits mock et génération déterministe des séries
├── lib/                # projections, maths des graphes, localStorage, formatage
├── hooks/              # routage, persistance, fil infini, carte active, clavier
├── components/         # Reel, carte, rail d'actions, graphiques SVG, bottom sheet, TabBar, SavedRow…
├── pages/              # FeedPage, SavedPage, ProfilePage, PortfolioWizard, BuyPage
├── styles/global.css
└── test/               # tests Vitest + Testing Library
docs/
├── architecture.md     # choix techniques et contrat des composants (§13 fil, §14 sauvegardés)
├── PLAN.md             # plan et statut des tâches
├── mockups/saved-page/ # maquettes PNG de la page Sauvegardés (option A retenue)
└── mockups/profile/    # maquettes PNG du profil (option B retenue)
```

Routes (hash) : page d'accueil à l'arrivée, `#/signup` création de compte, `#/` fil, `#/saved` sauvegardés, `#/profile` profil, `#/profile/new`, `#/profile/first` (premier portefeuille, après la création de compte) et `#/profile/edit/<id>` questionnaire de portefeuille, `#/buy/<ticker>` panier simulé (sociétés fictives).

## Persistance (localStorage)

| Clé | Contenu |
|---|---|
| `buy-demo:favorites:<id du portefeuille>` | tableau JSON des tickers sauvegardés **dans ce portefeuille**, dans l'ordre d'ajout, ex. `["NVDA","TSLA"]` |
| `buy-demo:hidden:<id du portefeuille>` | tableau JSON des tickers masqués via `Don't show me again` **dans ce portefeuille** |
| `buy-demo:ratings:<id du portefeuille>` | objet JSON des notes, ex. `{"NVDA":"up","TSLA":"down"}` (`up` = Pour, `down` = Contre) |
| `buy-demo:session` (sessionStorage) | identifiant du compte connecté dans l'onglet en cours |
| `buy-demo:hint-seen` | `"1"` quand l'indice « Glisser vers le haut » a été vu |
| `buy-demo:accounts` | liste des comptes de l'appareil `[{ id, name }]` |
| `buy-demo:account` / `buy-demo:account:<id>` | compte de démonstration / autres comptes : nom, profil investisseur partagé, portefeuilles (paramètres et positions), portefeuille actif. Absent au premier lancement : un compte de démonstration (« Alex Tremblay », 3 portefeuilles) est utilisé jusqu'à la première modification |

Chaque portefeuille a donc son propre fil (produits masqués et position) et ses propres sauvegardés ; les produits proposés et les exclusions ESG sont communs au compte. Sans portefeuille, l'identifiant `default` est utilisé. Les clés sans suffixe des versions précédentes (`buy-demo:favorites`, `buy-demo:hidden`, `buy-demo:feed-session`) sont déplacées une fois vers le portefeuille actif ; supprimer un portefeuille efface ses listes.

La position dans le fil est gardée pour la session (`sessionStorage`, clé `buy-demo:feed-session:<id du portefeuille>`) afin de revenir au même endroit après la page d'achat ou un changement de portefeuille. La quantité `If I buy`, la recherche et le tri de la page Sauvegardés ne sont pas persistés. Un produit masqué n'apparaît pas dans les sauvegardés, même s'il y avait été ajouté.

Pour réinitialiser :

- dans l'application, quand toutes les cartes sont masquées, le bouton « Réafficher les produits masqués » vide la liste des masqués du portefeuille actif ;
- ou dans la console du navigateur (efface toutes les données de la démo) :

```js
Object.keys(localStorage).filter((k) => k.startsWith('buy-demo:')).forEach((k) => localStorage.removeItem(k));
Object.keys(sessionStorage).filter((k) => k.startsWith('buy-demo:')).forEach((k) => sessionStorage.removeItem(k));
location.reload();
```

## Parcours de démo

1. `npm run dev`, ouvrir http://localhost:5173 (idéalement en affichage mobile dans les outils de développement).
2. La page d'accueil s'affiche : « Se connecter » entre dans l'application. Ensuite, une carte plein écran s'affiche en vue résumé (`Buy`, « Pourquoi : ») avec l'indice « Glisser vers le haut ».
3. Faire défiler vers le haut (doigt, molette ou ↓) : la carte suivante s'aimante ; le fil ne se termine jamais.
4. Cliquer `See more data` : historique, projections et champ `If I buy` (10 par défaut). Changer la quantité (ex. 50) : les 3 courbes sont recalculées.
5. Toucher le signet (ou double-taper la carte) : message « Ajouté aux sauvegardés · Voir ». Sauvegarder 3 ou 4 produits.
6. Onglet **Sauvegardés** : la liste montre les produits, le plus récent en haut. Essayer la recherche (ex. « coca ») et les tris Variation / Nom.
7. Glisser une ligne vers la gauche, toucher « Retirer », puis « Annuler » : la ligne revient à sa place.
8. Toucher une ligne : la page du titre s'ouvre sur BNCD dans un nouvel onglet (se connecter à BNCD si demandé).
9. Menu ⋮ puis `Buy now` (ou le panier en vue détaillée) : la page du titre s'ouvre sur BNCD dans un nouvel onglet, le fil reste sur la même carte, et 10 actions (ou la quantité « If I buy ») sont ajoutées au portefeuille actif, « non confirmées ». « Annuler » dans le message les retire.
10. Menu ⋮ puis `Don't show me again` : le produit disparaît du fil et des sauvegardés. Une fois tout masqué, « Réafficher les produits masqués ».
11. Onglet **Profil** : faire glisser les cartes de portefeuilles, « Définir comme actif » sur « Mise de fonds maison ». Dans le fil, `See more data` affiche maintenant ce portefeuille actif (et un avertissement pour un produit volatil).
12. « + Nouveau » (en haut du Profil) : nom, objectif, horizon de 2 ans, réponse « J'en profite pour acheter davantage » : le profil retenu est plafonné à *Prudent* à cause de l'horizon. Terminer avec la mise initiale et les retraits.
13. Une société fictive (après avoir retiré les exclusions, étape 14) : `Buy now` ouvre le panier simulé ; choisir la quantité et le portefeuille, « Ajouter au portefeuille » ; la position apparaît sur la carte du portefeuille.
14. Profil investisseur → *Préférences et exclusions* : décocher Tabac, Énergies fossiles et Jeux d'argent, enregistrer : les 3 sociétés fictives apparaissent dans le fil.
15. En haut du fil (ou sous le titre des Sauvegardés), changer de portefeuille dans le sélecteur : le fil et les sauvegardés sont ceux de ce portefeuille. Sauvegarder un produit dans « Retraite », passer à « Mise de fonds maison » : il n'y est pas ; revenir à « Retraite » : il est là, et le fil reprend à la même carte.

## Hypothèses

- Les données (produits, cours, historiques, raisons, taux de projection) sont fictives ; les séries sont générées de façon déterministe.
- La quantité de `If I buy` est un nombre d'actions (entier ≥ 0, défaut 10). Les projections donnent la valeur de la position en USD sur 12 mois, à taux annuel composé fixe par scénario.
- « Impacts prévus sur le projet » (croquis) est interprété en « Impacts prévus sur le portefeuille ».
- Le logo est un placeholder (cercle coloré + initiales), sans ressource de marque.
- L'achat est simulé : aucune transaction, aucune API, aucun backend.
- Dans le fil, le bouton signet garde le libellé « Favori » / « Ajouter aux favoris » ; la page qui les regroupe s'appelle « Sauvegardés ».
- Profil : un seul compte local, sans authentification. Les règles de suggestion du risque et les rendements des projections (3 / 5 / 7 % par an) sont fictifs et simplifiés ; ce n'est pas une évaluation de convenance réglementaire.
- La valeur totale d'un portefeuille = actifs (positions au prix d'achat, les cours étant fixes dans la démo) + encaisse. Les versements mensuels ne sont pas ajoutés automatiquement à l'encaisse (pas d'écoulement du temps dans la démo). Les achats lancés vers BNCD sont enregistrés au moment du clic, sans confirmation réelle (mention « achat BNCD non confirmé ») ; une vente ou une annulation faite sur BNCD n'est pas répercutée.
- Les sociétés PétroNord, Tabacorp et Lotoplus sont fictives ; elles existent uniquement pour démontrer les exclusions sans attribuer de secteur controversé à des entreprises réelles.

Détails : [`docs/architecture.md`](docs/architecture.md).
