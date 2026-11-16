# Notes techniques : agents, gouvernance, limites

Code : `alphaforge/agents.py`. Tests : `tests/test_agents.py` (sans réseau, sans identifiants AWS).

**État honnête.** Les appels à Amazon Bedrock n'ont jamais été exécutés contre un vrai compte : la machine de développement n'avait pas de clé.
Ce qui est testé : les outils-calculatrices, le contrôle de gouvernance, le mode hors ligne, et le déroulement du mode Bedrock avec un faux modèle
(accepté du premier coup, rejeté puis accepté, rejeté deux fois, exception). Ce qui ne l'est pas : le comportement réel du modèle et du SDK Strands.

## Principe

Le code calcule, le modèle explique. Aucun chiffre n'est produit par un modèle : chacun vient d'une fonction d'`alphaforge/` et se retrouve dans une
« trace » (outil, entrées, sortie, période des données). Les modèles lisent, choisissent des calculs et rédigent ; un contrôle en code vérifie leur texte.

## Les agents

| Agent | Pourquoi il existe | Ce qu'il voit | Ce qu'il ne peut pas faire |
|---|---|---|---|
| Interprète | Une phrase libre ne se lit pas avec des règles | La phrase, la liste des titres disponibles | Aucun outil, aucun chiffre ; sortie structurée (`Intention`) ; ne devine pas la part |
| Analyste | Choisir quels calculs lancer pour cette demande et ce profil | L'intention, ses six outils-calculatrices | Ne calcule rien de tête : seuls les outils produisent des chiffres |
| Explicateur (idée) | Adapter le texte au niveau et au vocabulaire | La demande et la trace des outils, rien d'autre | Aucun outil, aucun accès aux données brutes |
| Explicateur de carte (`explain_card`) | Dire en deux phrases puis en détail pourquoi un titre du fil s'accorde ou non à ce profil | La fiche de la carte sans ses séries ni trajectoires, un résumé du profil | Aucun outil ; ne voit pas les autres cartes ni l'historique brut |
| Gouvernance | Un contrôle vérifiable : un modèle qui se relit ne prouve rien | Le texte et la trace | C'est du code, il ne réécrit pas : il accepte ou rejette |

Les préférences du fil (`summarize_preferences`) sont résumées par le code seul (comptes par secteur et classe d'actif, volatilité moyenne des titres aimés et
écartés). Il n'y a pas de réécriture par modèle : une phrase de plus ne vaut pas une surface de risque de plus. Le texte dit toujours que les préférences
réordonnent le fil sans jamais modifier les limites de risque du profil.

## Gouvernance : règles (`validate_explanation`)

1. **Chaque nombre du texte existe dans la trace**, tel quel ou en pourcentage (×100), à l'arrondi du texte près. Formats acceptés : `1 944 $`
   (espaces, espaces insécables), `12,9 %`, `−6,0 %` (moins Unicode ou trait d'union), `0,62`, `2,9 ans`, dates ISO. Un texte qui donne moins de
   décimales que la source passe (13 pour 12,94) ; plus que la source est rejeté.
2. **Signe explicite** : `−42,4 %` exige une valeur négative dans la trace (un gain présenté comme une perte est rejeté).
3. **Exemptions réduites** : les entiers jusqu'à 5 (puces, « sur 5 ») et les années 1990 à 2100 ne sont exemptés que s'ils ne sont ni un pourcentage ni un
   montant. `3 %` et `2 050 $` sont donc vérifiés.
4. **Conseil** rejeté : « achetez », « vendez », « conservez », « vous devriez », « je recommande », « nous conseillons », etc.
5. **Prévision et certitude** rejetées : « va atteindre », « devrait rapporter », « rendement attendu », « à coup sûr », « sûrement », « prévision »...
6. **Formules niées permises** : « ne garantit pas », « n'est pas une prévision », « ne prédit pas », « pas sans risque ». La négation doit se trouver
   dans la même phrase, dans les 60 caractères qui précèdent.
7. **Règles propres aux cartes** (`_govern_card`) : le mot « conflit » dès la face de la carte quand le verdict est en conflit ; un rappel « pas une prévision »
   quand il y a des scénarios ; un rappel « pas un conseil financier personnalisé » ; face de la carte de 420 caractères au plus.

Un rejet déclenche une reprise avec les motifs ; un second rejet remplace le texte du modèle par le texte déterministe, et la sortie porte `governance["fallback"] = True`.

### Limites connues du contrôle (non corrigées)

- **Valeur correcte, mauvaise phrase.** Le contrôle compare des valeurs, pas leur rôle : « la volatilité est de 6,0 % » passe si 6,0 % est la pire baisse.
- **Tolérance d'arrondi.** Un entier passe s'il est à ±0,5 de n'importe quel nombre de la trace ou de son ×100. Avec une trace riche, un chiffre inventé peut
  tomber à côté d'une vraie valeur. Plus la trace est grosse, plus le contrôle est faible.
- **Signe implicite.** Sans signe explicite, « une baisse de 6,0 % » et « une hausse de 6,0 % » passent tous les deux.
- **Arithmétique cachée.** Une somme ou une différence correcte mais absente de la trace est rejetée (voulu), mais un nombre qui coïncide par hasard passe.
- **Négation trop large.** « Ce titre ne risque rien : rendement garanti » passe, car « ne » précède dans la même phrase. Les formules détectées sont une liste,
  pas une analyse de sens : une tournure imprévue (« vous seriez bien inspiré de... ») n'est pas détectée.
- **Unités des scénarios.** Le texte hors ligne suppose que `p5`, `p50`, `p95` sont des variations en fraction (−0,61 = −61 %), sauf si `scenarios["unit"]` vaut
  `"multiple"` (×0,39) ou `"cad"` (dollars). Une autre convention serait mal libellée sans être rejetée par le contrôle.
- **Durées.** `years_underwater` est lu en années ; une valeur au-dessus de 40 est omise plutôt que mal interprétée.
- **Phrases du feed.** Les `reasons`, `checks` et `similarity_note` viennent du code du feed : on suppose qu'elles sont fidèles. Si le contrôle en rejette une, elle
  est retirée du texte hors ligne (`governance["extras_dropped"]`), jamais réécrite.
- Le contrôle n'empêche pas un texte plat, vague ou répétitif. Il refuse le faux, pas le médiocre.

## Comportement hors ligne

Sans identifiants (`bedrock_available()` faux) ou avec `force_offline=True`, tout fonctionne avec les mêmes calculs : lecture de la demande par mots-clés,
texte de carte et résumé de préférences déterministes, tous passés au même contrôle. Après une erreur Bedrock, le mode est `offline_after_error` et l'erreur
(type et début du message, jamais de secret) figure dans les étapes. L'interface doit afficher le mode : un texte hors ligne est plus sec, pas faux.

## Appels au modèle par action

| Action | Appels | Remarque |
|---|---|---|
| Vérifier une idée (`run`) | 3 à 5 : interprète (1), analyste (1 + un tour par outil, le SDK renvoie les résultats au modèle), explicateur (1, +1 si rejeté) | Quelques secondes à quelques dizaines de secondes selon le modèle |
| Texte d'une carte (`explain_card`) | 1, +1 si rejeté | Un seul appel, sans outil, entrée réduite : fiche sans `series` ni `paths` (quelques centaines de jetons) |
| Résumé des préférences | 0 | Code seul |

Pour un fil fluide : générer le texte d'une carte à l'ouverture de la carte (ou d'avance sur la suivante), le mettre en cache par (ticker, profil, niveau), et
afficher d'abord le texte déterministe, immédiat. Ne pas appeler le modèle à chaque balayage.

## À vérifier au premier vrai lancement Bedrock

1. **Sortie structurée.** `agent(prompt, structured_output_model=...)` renvoie bien `result.structured_output` rempli pour `Intention` et `CarteTexte`, avec le
   modèle choisi (tous les modèles Bedrock ne gèrent pas l'appel d'outil forcé que Strands utilise pour cela). Sinon : demander du JSON dans le prompt et le valider avec pydantic.
2. **Modèle et région.** `AWS_REGION` et `BEDROCK_MODEL_ID` : modèle activé dans « Model access », identifiant d'inférence adapté à la région (certains modèles exigent
   un profil d'inférence préfixé `us.` ou `eu.`). `scripts/check_aws.py` liste ce qui est visible.
3. **Garde-fou.** Avec `BEDROCK_GUARDRAIL_ID`, vérifier qu'un refus du garde-fou est bien traité comme une erreur (repli hors ligne) et non comme un texte valide, et qu'il ne bloque pas
   les rappels légitimes (« pas un conseil financier »).
4. **Taux de rejet.** Lancer les trois personnages (Amira, Mateo, Robert) sur 10 cartes chacun et noter la part de textes rejetés par la gouvernance. Un taux élevé signale un prompt
   à ajuster ; un repli systématique rend le mode Bedrock invisible.
5. **Robert face à un titre très volatil.** Vérifier à l'œil que le texte nomme le conflit sans l'adoucir.
6. **Latence réelle** d'une carte (un appel) et coût en jetons, pour décider du cache et de la précharge.
