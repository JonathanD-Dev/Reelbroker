# Revue critique : ReelBroker (14 novembre 2026)

Périmètre : `alphaforge/data.py, metrics.py, profile.py, allocate.py, explain.py, questionnaire.py, decide.py, learn.py`, `app.py`, `scripts/`, `tests/` (sauf `test_agents.py`). `agents.py`, `feed.py` et leurs tests sont exclus (en cours de modification).

Commande exécutée : `./.venv/Scripts/python -m pytest -q --deselect tests/test_agents.py` -> **48 réussis, 8 désélectionnés, 53,9 s**. Les tests passent ; les problèmes ci-dessous ne sont pas couverts par eux.

Légende : **[V]** = vérifié en exécutant du code ; **[L]** = lecture du code seulement (inférence, non exécuté).

## Les 10 constats qui coûtent le plus de points

| # | Gravité | Constat | Critère touché | Fichier:ligne |
|---|---|---|---|---|
| 1 | bloquant | Mateo (ESG) reçoit 15,5 % d'énergie (XOM, CNQ), TSLA, et 0 % du FNB ESGV ; la vérification d'une idée lui répond « Aucune de vos exclusions ne vise ce titre » pour XOM. Aucune preuve ESG, aucun « donnée insuffisante » au moment de la décision. [V] | Solution, Données, test persona | `decide.py:120`, `questionnaire.py:350`, `data.py:162` |
| 2 | bloquant | La cible de volatilité annoncée n'est pas atteinte aux niveaux 1 à 3, et l'écran l'affiche en toutes lettres (« 5,3 % » à côté de « cible 6 % à 7 % » pour Robert). Le message « cible minimale de volatilité » est présenté comme une limite active alors qu'elle n'est pas respectée. [V] | Données, UX | `allocate.py:108-136`, `app.py:358` |
| 3 | important | Amira : ses centres d'intérêt (IA, techno, crypto) ne sont jamais demandés ; `preferred` existe mais l'effet est nul (changements de poids ≤ 0,1 point). Son portefeuille niveau 4 contient 14 % de techno, 6,5 % de crypto, mais 19,7 % d'énergie (CNQ et XOM au plafond). [V] | Solution, test persona | `questionnaire.py` (absent), `allocate.py:82` |
| 4 | important | Aucun plafond sectoriel : les 3 personas finissent avec 11 à 20 % d'énergie, c'est-à-dire les « gagnants du passé » que l'énoncé met en garde. La diversification affichée (« positions équivalentes ») ne voit pas cette concentration. [V] | Données, Solution | `data.py:157-163` (`group_caps` jamais fourni) |
| 5 | important | Ratio de Sharpe calculé avec taux sans risque = 0 % : Robert affiche 1,59 ; avec 3,5 % il vaut 0,93. Le chiffre n'est pas annoncé comme tel. [V] | Données (rigueur) | `metrics.py:39,117`, `explain.py:51` |
| 6 | important | Le profil révélé arrondit les égalités vers le haut (plus de risque) et compte les décisions « conformes » comme preuves : 3 clics de confirmation suffisent à « établir » un profil révélé. Un journal très contrasté [5,1,conforme,5,1] donne « concordent » sans signaler la dispersion. [V] | Agentique/UX (étape Apprendre) | `learn.py:104-107` |
| 7 | important | Une seule série courte (≥ 252 jours) raccourcit silencieusement la fenêtre de tout le portefeuille : TSLA avec 282 jours -> fenêtre du 2025-10-08 au 2026-11-12, plus de 2022 dans les chiffres. [V] | Données | `allocate.py:56,63` |
| 8 | important | Hypothèses non affichées dans l'interface : tables de capacité, plafonds horizon/objectif, table tolérance -> niveau, signaux du profil révélé (+1, -1), seuil de 2 % de poids. Les tableaux de budget de risque ne sont montrés qu'en partie. [L] | Données, Pitch | `questionnaire.py:313-317,331-333`, `profile.py:14-20,45-51`, `learn.py:57-78` |
| 9 | important | Formulations qui se lisent comme un feu vert : encadré **vert** (`st.success`) sur « Aligné sur le profil », verdict « Possible, mais avec des tensions », bloc « Ce qui resterait dans les limites du profil : jusqu'à X % ». Rendements annuels passés de 18 à 21 % affichés dans les cartes niveaux 4-5, sans taux sans risque ni biais du survivant à proximité. [L] | Pitch, conformité | `app.py:203,266`, `decide.py:21-23,46-48` |
| 10 | mineur | CNQ.TO : le « fractionnement » 1,021 du 2022-08-22 (signalé par le README du jeu de départ) n'est ni traité ni mentionné ; `adj_close` fait +2,8 % ce jour-là contre +0,6 % pour `close`. Le rapport de qualité ne le détecte pas (`suspect_split_days` = 0). [V pour les chiffres ; effet sur les portefeuilles non mesuré] | Données (rigueur) | `data.py:62-83`, absent des notes UI |

---

## 1. Bugs et comportements vérifiés

### 1.1 [bloquant] Cible minimale de volatilité non atteinte et mal décrite (`allocate.py:106-136`, `app.py:358`) [V]

Mesure pour chaque niveau (`allocate(px, profil, level=L, **meta)`, 5 ans, CAD). Bande annoncée = 85 % du plafond à 100 %.

| Niveau | Bande annoncée | Vol. ex ante | Vol. historique affichée | Écart au plancher (historique) |
|---|---|---|---|---|
| 1 | 3,4 % à 4,0 % | 2,6 % | 2,7 % | -0,7 pt |
| 2 | 6,0 % à 7,0 % | 5,1 % | 5,3 % | -0,7 pt (Robert, Amira) |
| 3 | 8,5 % à 10 % | 7,8 % à 8,0 % | 8,0 % à 8,3 % | -0,2 à -0,5 pt (Mateo : 8,2 % contre 8,5 %) |
| 4 | 11,9 % à 14 % | 11,9 % | 12,0 % à 12,1 % | +0,1 à +0,2 pt (atteint) |
| 5 | 15,3 % à 18 % | 15,3 % | 15,4 % à 15,5 % | +0,1 à +0,2 pt (atteint) |

Conséquences observées :
- Robert (niveau 2) voit « Volatilité annuelle 5,3 % » avec le sous-texte « cible 6 % à 7 % » (`app.py:358`, `fr_pct(0.85*0.07, 0)` = « 6 % »). Le jury verra l'écart.
- `binding` contient « cible minimale de volatilité (6,0 %) » (`allocate.py:135-136`) même quand la vol. est sous ce seuil : la condition teste `port_vol(w) < plancher + 2e-3`, donc vraie aussi quand le plancher est **manqué**. L'explication prétend que la cible a façonné le résultat alors qu'elle n'a pas été respectée.
- Cause exacte : **non vérifiée**. Hypothèses : (a) les plafonds `max_growth_assets` (20/40/60 %) et par titre empêchent d'atteindre le plancher aux niveaux bas ; (b) SLSQP rapporte « succès » avec contrainte violée ; (c) la suppression des poids < 2 % puis la redistribution (`allocate.py:122-131`) déplace la vol. après l'optimisation. Mesuré : la vol. avec covariance échantillon (5,25 %) est proche de la vol. avec rétrécissement (5,13 %) et de la vol. historique rééquilibrée (5,30 %), donc le rétrécissement vers la diagonale n'explique pas l'écart.
- Correctif minimal : après optimisation, comparer `port_vol(w)` au plancher ; si manqué, ne pas écrire « cible minimale » dans `binding`, afficher « cible minimale non atteignable avec cet univers et ces plafonds (vol. X %) » ; dans `app.py:358`, afficher la vraie bande atteinte ou n'écrire « cible » que si `ex_ante >= plancher - 2e-3`. Pour le pitch : annoncer « plafond » (pas « bande ») aux niveaux 1-3, ou réduire `vol_floor_ratio` à 0,75.

### 1.2 [important] Fenêtre de données raccourcie en silence (`allocate.py:56,63`) [V]
`px = prices[universe].dropna()` coupe toutes les séries à la plus courte. Test : TSLA réduite à 282 observations -> non écartée (≥ 252) et `data_window` = 2025-10-08 -> 2026-11-12 pour **tout** le portefeuille ; la crise de 2022 disparaît de la pire baisse. Avec le jeu de départ complet, rien ne se produit ; le risque apparaît dès qu'on ajoute un actif récent (le flux de découverte en construction, par exemple). Correctif : écarter ou signaler tout actif dont l'historique est inférieur à 80 % de la fenêtre commune, ou estimer par paires.

### 1.3 [important] Profil révélé : arrondi vers le haut et confirmations comptées (`learn.py:103-109`) [V]
- `int(median(values) + 0.5)` : médiane 3,5 -> 4. Journal [4, 5, conforme, conforme] avec tolérance déclarée 3 -> niveau révélé 4 -> état « exceeds_limits » alors que 2 décisions sur 4 sont neutres. En cas d'égalité, on devrait arrondir vers le plus prudent.
- `len(journal) >= 3` suffit pour « établir », même si 3 décisions sont des confirmations (`signal` = None). Le champ `informative` est calculé mais jamais utilisé comme seuil.
- Signaux contrastés [5, 1, conforme, 5, 1] : résultat « aligned », niveau 3, message « concordent ». Personne ne voit que la personne oscille entre extrêmes. Ajouter une mention de dispersion (écart entre min et max des signaux informatifs >= 3 -> « décisions contradictoires, aucune conclusion »).
- Correctif : exiger `informative >= 2`, arrondir vers le bas, et signaler la dispersion.

### 1.4 [important] Vérification d'idée : exclusion « controverses » invisible (`decide.py:115-120`) [V]
Pour Mateo (`controversies` strict), `check_intention(..., "XOM", 0.05)` retourne `exclusion: ok` « Aucune de vos exclusions ne vise ce titre. » et un verdict « compatible ». C'est faux au sens strict : l'exclusion existe mais n'est pas évaluable. Le message de `questionnaire.py:351` existe seulement dans les notes du profil, une fois, loin du point de décision. Correctif : un contrôle `controversies` qui renvoie `info` ou `warn` « donnée insuffisante : aucune source ESG documentée pour ce titre » tant que le fichier de preuves (voir 4.1) n'a pas d'entrée.

### 1.5 [mineur] Analyse de phrase (`decide.py:183-203`) [V]
- L'alias `or` (`decide.py:186`) correspond au mot français « or » (conjonction) : « je veux acheter de l'or ou du bitcoin » -> GLD et BTC-USD, sans pourcentage -> `ok=False` (sans conséquence ici, mais « Or, je pense que Tesla à 10 % » déclencherait GLD). Le mot `shop` correspond à SHOP.TO.
- « 20 % Tesla et 10 % bitcoin » -> deux titres, `ok=False`, aucun message d'explication dans le parcours manuel (le curseur est préréglé sur le premier titre). Afficher « Une seule idée à la fois ».
- Le curseur plafonne à 50 % (`app.py:258`) : « 100 % Tesla » s'affiche à 50 %.

### 1.6 [mineur] Traitement du calendrier : vérifié, sans distorsion notable (`data.py:125-142`) [V]
Test : BTC-USD sur 7 jours avec √365 : vol. 50,8 % ; sur la grille des jours ouvrables avec √252 (USD) : 50,9 %. ETH : 68,5 % contre 68,0 %. CAGR identique (mêmes extrémités). Pire baisse : BTC -75,9 % (7 jours) contre -75,4 % (jours ouvrables), ETH -78,7 % contre -77,8 % ; l'écart vient des creux de fin de semaine. À noter : annualiser la série à 7 jours avec √252 donnerait 42 % (faux), donc le choix de supprimer les lignes de fin de semaine est justifié et peut être défendu avec ces chiffres.
Réserve : `ffill(limit=3)` crée des rendements nuls les jours fériés (XIU.TO : 4,2 % de jours à rendement 0, RY.TO : 2,5 %). Effet : volatilité légèrement sous-estimée et corrélation intrajour avec les titres américains légèrement réduite. Non mesuré en dollars ; à mentionner dans « limites ».
Les horloges de clôture diffèrent (crypto UTC 24 h, actions 16 h HE, FX Banque du Canada vers 16 h 30 HE) : `adj_close * usdcad` du même jour est approximatif. À documenter, effet probablement faible.

### 1.7 [important] Hypothèses d'exclusion (`questionnaire.py:318,352-354`) [V pour Mateo, L pour le reste]
`EXCLUSION_TAGS` ne couvre que `fossil_fuels` (secteur Energy) et `crypto`. `weapons`, `sin`, `other` -> note « aucun actif de l'univers n'est classé dans cette catégorie ; non vérifiable ». Correct, mais `fossil_fuels` = secteur « Energy » seulement : ENB (pipelines) est exclu comme combustible fossile (défendable), tandis que XOM/CNQ sont exclus, mais le FNB XIU.TO, SPY, etc. contiennent de l'énergie (look-through absent). À dire clairement : « exclusion au niveau du titre, pas de la transparence des FNB ».

### 1.8 [mineur] Arrondis et indicateurs (`metrics.py`, `allocate.py`) [V/L]
- `cov_matrix` (shrink 10 % vers la diagonale) : réduit la corrélation ; sur les portefeuilles mesurés, la vol. ex ante est de 0,1 à 0,2 pt sous la vol. historique rééquilibrée (5,13 % contre 5,30 %). Négligeable, mais « volatilité estimée » (ex ante) et « volatilité annuelle » (historique) coexistent à l'écran avec des valeurs légèrement différentes ; une note les distingue-t-elle ? Non (`app.py:272-279` vs `app.py:358`). [L]
- `worst_rolling` utilise 252 lignes (~12 mois), pas 12 mois civils ; correct, mais le libellé « Pires 12 mois » suffit. [L]
- `max_drawdown`, `cagr`, `volatility` : définitions correctes (somme des rendements simples, √252, jours/365,25). [L]
- GLD classé `commodity` donc « actif de croissance » (`allocate.py:16`). À afficher pour que personne ne s'étonne qu'un portefeuille « 85 % croissance » inclue de l'or. [L]

---

## 2. Rigueur financière et données

1. **Biais du survivant** : divulgué à 3 endroits (`app.py:212,386`, `explain.py:60`). Bon. Il manque un chiffre : combien ça change. Option réaliste : montrer à côté du rendement passé le rendement de XIU.TO/SPY sur la même fenêtre comme repère (pas de promesse, mais le jury verra que 18-21 %/an pour le niveau 4-5 vient de l'univers choisi). [L]
2. **Sharpe à taux sans risque nul** (1.1 ci-dessus). `expected_returns` utilise 3 % (`allocate.py:20`) : incohérence entre module `allocate` et `metrics`. Utiliser la série `V39079` (taux directeur de la Banque du Canada) de `macro_rates.csv`, déjà chargeable via `load_macro`, moyennée sur la fenêtre. [V]
3. **Look-ahead** : la covariance et la répartition utilisent toute la fenêtre 2021-2026, puis les chiffres « historiques » sont calculés sur la même fenêtre : c'est un ajustement dans l'échantillon (in-sample), pas un backtest. Rien n'est dit sur ce point dans l'interface. Formulation honnête à ajouter : « chiffres calculés sur la période d'estimation ; pas un test hors échantillon ». Un split temporel (ex. estimer sur 2021-2024, mesurer sur 2025-2026) est ce que la rubrique « Données : rigueur, validation » cherche. [L]
3b. Les mélanges P5/P5a sont des chiffres vérifiés : -14,89 % et -19,44 %, dates 2021-12-29 -> 2022-06-16, recalculés à l'identique (`data/processed/risk_scenarios.json`). [V]
4. **Devise** : conversion USD->CAD à la date du jour avec ffill/bfill (`data.py:131`) ; un `bfill()` sur le début de série est inoffensif ici (1 247 lignes de taux vs 1 282 jours). Aucune couverture de change ; la part en dollars américains (49 % pour Robert, 66 % Mateo, 71 % Amira, calculée) n'est pas affichée. Un utilisateur canadien voudrait voir « exposition au dollar américain » : `metrics.exposure` existe, il faut juste l'afficher. [V]
5. **Rapport de qualité** (`app.py:392`) : colonnes en anglais (`pct_missing`, `max_gap_days`, `stale_days`, `suspect_split_days`), non traduites ; ZST.TO affiche 333 jours à rendement nul (26 %) sans commentaire (c'est un FNB à très court terme, mais il sert de « quasi-liquidités »). [V]
6. **Calendriers** : voir 1.6.

## 3. Conformité des textes (français affichés à l'écran)

| Fichier:ligne | Texte | Problème | Proposition |
|---|---|---|---|
| `app.py:203` | `st.success` (vert) pour l'option « Aligné sur le profil » | La couleur dit « recommandé » | Même couleur neutre (`st.info`) pour les trois options ; garder `st.warning` seulement pour « hors profil » |
| `decide.py:22` | « Possible, mais avec des tensions à connaître » | « Possible » est un feu vert | « Des tensions avec le profil déclaré, à connaître » |
| `app.py:266-267` | « Ce qui resterait dans les limites du profil : jusqu'à X % de ce titre… » | Se lit comme une cible d'achat, malgré la précision qui suit | « Seuil calculé : au-delà de X %, une limite du profil est dépassée. » |
| `app.py:287` (bouton) | « Je la ramène à X % » | Acceptable (action de la personne), mais le chiffre est préréglé par l'outil | Ajouter « (seuil calculé) » |
| `decide.py:46-47` | « Moins de variations, moins de potentiel de croissance. » | Prévision implicite | « Historiquement : moins de variations et un rendement passé plus faible. » |
| `decide.py:146` | « laisse du temps pour traverser une telle baisse, sans garantie » | Suppose une récupération | « Une baisse de cette taille a duré N ans dans les données ; rien n'assure qu'elle se reproduirait de la même façon. » |
| `app.py:205-210` | « Rendement annuel passé » en 18 à 21 % (niveaux 4-5) | Chiffre élevé sans repère | Ajouter le rendement de référence (SPY, XIU) sur la même fenêtre |
| `explain.py:49-50` | « Limites qui ont réellement façonné le résultat » | Inexact quand la cible de volatilité n'est pas respectée (1.1) | Voir 1.1 |

Points corrects : encadré de l'état du profil `app.py:130-132`, bas de page des scénarios `app.py:211-212`, `explain.py:63`, formulations du questionnaire (conformes à `docs/questionnaire.md`). Les mots « recommandation » ou « conseil » n'apparaissent que dans des négations.

## 4. Hypothèses nôtres à défendre, et où elles sont divulguées

| Hypothèse | Où | Divulguée dans l'interface ? |
|---|---|---|
| Table niveau -> plafond de vol. et part de croissance (4/7/10/14/18 % ; 20/40/60/85/100 %) | `profile.py:14-20` | Partiellement : seuls le plafond du niveau choisi et le plafond de croissance apparaissent dans « Explication détaillée » (`explain.py:45-46`). La table entière n'est affichée nulle part. **Non** pour les autres niveaux. |
| Plafond d'horizon (<1 an : 1 ; <3 : 2 ; <5 : 3 ; <10 : 4 ; sinon 5) | `profile.py:46` | Résultat affiché (« plafond de 3 sur 5 »), règle non affichée |
| Plafond d'objectif (préserver 2, projet 3, revenu/équilibre 4, croissance 5) | `profile.py:51` | Idem |
| Capacité : revenu stable 5 / variable 4 / faible 2 ; coussin >6 mois 5 / 3-6 mois 4 / 1-3 mois 3 / <1 mois 1 ; retraits aucun 5 / imprévu 4 / réguliers 3 / ponctuel 3 ; « presque tout » 2 ; personnes à charge ou dettes 2 | `questionnaire.py:315-317,331-333` | **Non** (seul le résultat et le facteur limitant figurent dans les notes) |
| Tolérance déclarée -> niveau (faible 1, faible-modérée 2, modérée 3, modérée-élevée 4, élevée 5) ; inconnue = 2 | `questionnaire.py:313,325-326` | Inconnue = 2 : oui (note). Le reste : **non** |
| Part gardée en placements stables (20/50/90 % pour retrait ponctuel avant 3 ans ; 5 % pour retraits réguliers/imprévus) | `questionnaire.py:342-347` | Oui (note « hypothèse ») ; la règle des 5 % pour « imprévu » est discutable : Mateo et Robert ont 5 % de liquidités « parce qu'ils ont répondu peut-être ». |
| Plafonds par titre 10 % (société), 5 % (cryptoactif), 35 % (fonds) | `data.py:154`, `profile.py:38` | Oui (`app.py:385`) |
| ZST.TO = quasi-liquidités | `data.py:153` | Oui (`app.py:384`) |
| Plancher = 85 % du plafond, poids minimal 2 %, rétrécissement de covariance 10 %, 252 jours | `allocate.py:36-37`, `metrics.py:89` | Plancher : oui (`app.py:358`, mais non atteint, voir 1.1). Les autres : **non** |
| Méthode d'optimisation (diversification maximale) | `allocate.py:88` | Oui (`explain.py:47-48`) |
| Profil révélé : 3 décisions minimum, fenêtre de 5, médiane, signaux (vendre tout -> 1 ; vendre une partie -> min(niveau, tolérance) - 1 ; ajouter -> niveau + 1 ; garder une idée en conflit -> max(niveau implicite, niveau + 1)) | `learn.py:26-27,57-78` | Minimum, fenêtre, médiane : oui (`app.py:346-347`). **Signaux : non** |
| Montant d'illustration (milieu de la fourchette, sinon 10 000 $) | `questionnaire.py:167-173` | Oui |
| Mélanges 60/40 = 30 XIU, 30 SPY, 40 XBB ; actions = 40 XIU, 40 SPY, 20 QQQ | `scripts/build_risk_scenarios.py:12-13` | Partiel : l'étiquette est visible, les pondérations non (visibles dans le script et `docs/questionnaire.md`) |
| Tolérance révélée plafonnée par capacité/horizon/objectif | `learn.py:117-153` | Oui |

Recommandation : un seul expander « Toutes nos hypothèses » qui lit directement `RISK_BUDGET`, `CAP_*`, `TOL_LEVEL`, `horizon_cap` et `SINGLE_CAPS` (pas de texte copié à la main : le texte et le code ne se désynchronisent plus). 20 minutes de travail, fort effet sur « Données : rigueur » et « Agentique : explicabilité ».

### 4.1 Mateo : l'exclusion ESG n'a aucune preuve (test de persona) [V]
État actuel : `controversies` est une case à cocher (`questionnaire.py:50`) ; `to_profile` écrit une note (`:350-351`) et **ne filtre rien** ; le portefeuille de Mateo contient XOM 7,4 %, CNQ 8,1 %, TSLA 2,5 % ; ESGV pèse 0 %. Le jury a prévu ce piège (README du jeu de départ : « Les équipes ont besoin de preuves externes »).

Plus petit correctif crédible (environ 1 h) :
1. Fichier `data/processed/esg_evidence.csv` : `ticker, critere, statut, source, url, date_consultation, note`. `statut` parmi `signale`, `non_signale`, `donnee_insuffisante` (valeur par défaut pour tout titre absent du fichier). 
2. Remplir seulement ce qu'on peut sourcer en une heure, avec la date de consultation : 
   - ESGV : page « Index methodology / fund fact sheet » de l'émetteur (Vanguard), en citant la règle d'exclusion publiée (à relire et à citer littéralement ; je n'ai pas consulté la page : **non vérifié**). Statut du FNB, pas de chaque société.
   - 3 à 5 titres de l'univers que Mateo risque de recevoir (XOM, CNQ, ENB, TSLA, NVDA) : rapport de durabilité de la société (URL + page) ou dépôt SEC EDGAR / SEDAR+ (facteurs de risque environnementaux). Ne pas tirer de conclusion « controverse oui/non » sans source : écrire le fait cité (ex. « émissions de portée 1 et 2 déclarées : X Mt »), et laisser `donnee_insuffisante` pour le critère « controverse importante ».
3. `allocate` : si `controversies` strict -> écarter `signale` ; garder `donnee_insuffisante` mais le **marquer** dans le tableau (colonne « Preuve ESG »). `check_intention` : ajouter le contrôle de 1.4.
4. Variante sans fichier (30 minutes) : tant qu'il n'y a pas de preuve, traiter « controverses » comme une préférence : pénaliser (via `avoided`) les secteurs à enjeux environnementaux clairs (Energy) et récompenser ESGV, en affichant « critère sectoriel, pas une évaluation de société ». Moins rigoureux mais honnête s'il est étiqueté ainsi.
5. Pour AWS (15 % de la grille) : c'est le cas d'usage naturel de Bedrock Knowledge Bases (documents de durabilité -> citations) ; mentionné dans `docs/aws.md` comme piste. Même un petit corpus de 5 PDF avec citations vaut mieux que la case à cocher.

### 4.2 Amira : intérêts positifs jamais saisis [V]
- Aucune question du questionnaire ne capte « j'aime l'IA, la techno, les marchés émergents, la crypto ».
- `InvestorProfile.preferred` existe (`profile.py:40`) et `allocate` l'utilise via `tilt = 0.01 * pref @ w` (`allocate.py:82`). Test : `preferred=["Information Technology", "crypto"]` à niveau 4 -> variations de poids <= 0,1 point, part techno 14,5 % inchangée. L'effet est négligeable devant la fonction objectif (rapport de diversification de l'ordre de 2 à 3) : la préférence souple est inerte, alors que l'évitement souple (`avoid`, coefficient 0,5) est fort. Asymétrie à corriger.
- Correctif minimal : (a) question de compte **C6** « Y a-t-il des thèmes qui vous attirent ? » (choix multiples : `ai_tech`, `emerging`, `crypto`, `clean_energy`, `none`, `unknown`) -> champ `account.values_preferences.interests` -> `InvestorProfile.preferred` (étiquettes : secteur « Information Technology »/« Communication Services », `crypto`, FNB QQQ) ; (b) dans `allocate`, remplacer le tilt par un plancher de « poche thématique » (ex. au moins 10 % du portefeuille dans les étiquettes préférées, soumis à tous les plafonds de risque, annoncé comme préférence souple « abandonnée si elle viole une contrainte »). Une préférence qui ne peut pas être satisfaite dans les plafonds doit être dite (« thème demandé : 8 % obtenu, 15 % non atteignable sans dépasser le plafond de volatilité »).
- À défendre devant le jury : Amira est à niveau 4/5, pas 5, à cause de l'hypothèse `C2 = 3 à 6 mois` (inventée, signalée en légende persona `app.py:133-135`) : le coussin plafonne la capacité à 4. C'est exactement « haut risque ≠ tout est permis », mais à dire à voix haute, car l'énoncé la décrit comme « risque élevé ».
- Positif : Amira reçoit 14 positions, 71 % en dollars américains, plafonds de 5 % par cryptoactif (6,5 % de crypto au total), plafond de 10 % par titre atteint par 5 titres.

### 4.3 Robert : défi d'une idée à la mode [V]
Fonctionne : « 20 % TSLA » -> `conflict` (concentration 20 % > plafond 10 %, volatilité, horizon, objectif préserver), seuil calculé 8 %. « 1 % TSLA » -> `tension` (horizon, objectif). BTC 5 % -> `tension` (préférence « éviter les cryptos » ; le portefeuille a 0 % de crypto). C'est la meilleure scène de la démo. Deux points faibles : (a) son portefeuille aligné contient NVDA 2,4 % et 11,4 % d'énergie (XOM, CNQ) : « entreprises établies » oui, mais des titres très volatils dans un portefeuille de préservation ; (b) la phrase « Aucune part de ce titre ne respecte toutes les limites du profil » n'apparaît que si le seuil vaut 0.

---

## 5. UX/UI (lecture de `app.py`, pas de vue de l'écran) [L, sauf mention]

1. **Longueur de la page** : après le questionnaire, une seule page enchaîne : encadré, 2 colonnes de profil, contradictions, manquants, 4 indicateurs, notes, 3 cartes d'options, vérifier une idée, explorer à la main, profil révélé (3 mesures + tableau), détail d'un scénario (5 indicateurs, 2 graphiques, tableau), puis 5 expanders. Estimation : 6 à 8 écrans de défilement. Pour une démo de 5 minutes, il faut un ordre de lecture : (1) profil en une phrase, (2) 3 options, (3) idée -> verdict, (4) explication. Le profil révélé (étape 3) et le détail pourraient être dans des onglets (`st.tabs`) : Décider / Apprendre / Détails.
2. **Ordre** : le graphique « Où va l'argent et d'où vient le risque » (différenciateur annoncé par PLAYBOOK) est enfoui à la fin (`app.py:371`). Le monter sous les cartes d'options.
3. **Jargon sans définition** : « volatilité », « positions équivalentes », « part du risque », « ratio de diversification », « Sharpe » (`explain.py:51-55`). Seul le bloc d'aide `app.py:79-81` définit « action » et « obligation » et seulement pendant P5. Ajouter des `help=` sur les `st.metric` (`app.py:171-174,358-362`).
4. **Anglais restant** : colonnes du rapport de qualité (`app.py:392`), clés du JSON (`app.py:390`, acceptable mais à étiqueter), graphiques Plotly : axe « % », info-bulles avec points décimaux, matrice de corrélation (`app.py:388`) ; `st.dataframe` du tableau (`app.py:375`) montre « 15.2 » (point décimal) et non « 15,2 ». Le tableau d'étape 3 mêle « sur 5 » et « conforme ».
5. **Formats** : `q.fr_pct` donne « 6,0 % » (virgule, espace avant %), correct. Mais `"−" + q.fr_pct(...)` (`app.py:359,273`) : `fr_pct` prend la valeur absolue puis on rajoute « − » à la main ; une baisse nulle afficherait « −0,0 % ». Les nombres `.replace(".", ",")` sur une f-string entière (`app.py:210`) sont fragiles : si un texte contient un point (« etc. »), il est modifié.
6. **Parcours** : le questionnaire n'affiche pas le bouton « Retour » ; en cas d'erreur de clic il faut « Recommencer à zéro » (`app.py:59`). Un `Retour` qui supprime la dernière clé de `a` est trivial. [L]
7. **Latence** : 3 optimisations à chaque nouveau profil (mesure : 3 à 6 s par persona pour 5 niveaux ; 3 niveaux ≈ 2-4 s), mises en cache par `st.cache_data`. Acceptable. L'appel aux agents Bedrock ajoute des secondes (3 appels de modèle par demande, `docs/aws.md`) : le message « Interprète, analyste, explicateur et gouvernance au travail… » est bien.
8. **Statut AWS visible** (`app.py:219-225`) : bon pour la rubrique AWS (preuve que ça tourne). Mais la chaîne n'a jamais été exécutée contre un vrai compte (`docs/aws.md`, limites) : le risque numéro un pour l'éligibilité. Planifier un test avec `scripts/check_aws.py --agents` **avant** de tourner la vidéo (compte supprimé lundi soir).

## 6. Tests : ce qu'ils ne couvrent pas

38 fonctions de test (hors `test_agents.py`). Manques utiles, rapides à ajouter :
- `allocate` : l'écart au plancher de volatilité (1.1) ; une assertion « `ex_ante_vol >= 0.85 * max_vol - 0.005` ou `binding` ne contient pas la cible » aurait échoué.
- `allocate` : fenêtre commune (1.2).
- `decide.check_intention` pour Mateo/XOM : message sur les controverses (1.4).
- `learn.revealed` : égalité de médiane (3,5), dispersion (1.3).
- Persona : une assertion « énergie < 10 % pour Mateo » ou un test sur la part sectorielle.
- Doc : `PLAYBOOK.md:49` donne `python -m alphaforge.agent` ; le module s'appelle `agents.py`. Corriger la commande (je n'ai pas modifié PLAYBOOK.md : hors de mon périmètre). `CLAUDE.md` dit aussi « agent.py ».

## 7. Ce que j'ai écarté (non-problèmes vérifiés)

- Questionnaire entièrement « passé » ou entièrement « je ne sais pas » : aucun plantage ; profil `incomplete`, niveau 2, hypothèses étiquetées, 3 scénarios produits. [V]
- Profils de niveau 1 et de niveau 5 : `options` renvoie 2 scénarios (pas de niveau 0 ni 6), sans erreur. [V]
- Exclusions qui retirent presque tout l'univers : `ValueError: No investable asset left after exclusions` si tout est exclu (l'application affiche « Aucun scénario… » si `options` renvoie une erreur ; non testé dans l'interface) ; si seuls obligations et or restent, le résultat est 94 % ZST.TO, vol. 0,9 %, sans avertissement que « niveau 5 » n'est pas atteint. [V pour le code, L pour l'affichage]
- Pourcentages 1 % et 50 % dans `check_intention` : TSLA 1 % -> tension ; 50 % -> conflit ; seuil calculé stable (0,08). [V]
- Les chiffres du questionnaire (P5/P5a) : recalculés, identiques au JSON (-14,89 %, -19,44 %). [V]
- Crypto : suppression des lignes de fin de semaine, voir 1.6 ; défendable.
- `adj_close` : utilisé partout (`data.py:125`, `PRICE_NAMES`). [V]

## 8. Ordre de travail proposé (si 3 heures)

1. (45 min) Preuve ESG minimale + contrôle « controverses » dans `check_intention` + colonne « Preuve ESG » (4.1, 1.4).
2. (30 min) Plancher de volatilité : message honnête et correction de l'affichage (1.1).
3. (30 min) Question C6 + poche thématique pour Amira (4.2).
4. (20 min) Expander « Toutes nos hypothèses » généré depuis le code (4).
5. (15 min) Sharpe avec taux sans risque issu de `macro_rates.csv` (1.1 de la section 2).
6. (15 min) Libellés et couleur (section 3) ; anglais restant (section 5).
7. Puis : test Bedrock réel, avant toute vidéo.
