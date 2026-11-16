# Intégration AWS

## Mise en route (5 minutes)

1. Ouvrir la console AWS du compte d'équipe : catalog.workshops.aws/join, code d'accès reçu par courriel, puis « Open AWS console ».
2. Dans Amazon Bedrock, créer une clé d'API (menu « API keys »). Vérifier dans « Model access » que le modèle voulu est activé.
3. Copier `.env.example` vers `.env` à la racine du projet et y coller la clé après `AWS_BEARER_TOKEN_BEDROCK=`.
   Le fichier `.env` est ignoré par Git : ne jamais le publier.
4. Vérifier la connexion :
   ```
   .venv\Scripts\python scripts\check_aws.py
   ```
   En cas d'échec, le script affiche l'erreur et la liste des modèles visibles dans la région. Les deux réglages à essayer
   sont `AWS_REGION` (ca-central-1, us-west-2, us-east-1) et `BEDROCK_MODEL_ID`.
5. Lancer la chaîne complète sur un cas d'essai (Robert et Tesla) :
   ```
   .venv\Scripts\python scripts\check_aws.py --agents
   ```
6. Redémarrer l'application. La section « Vérifier une idée » doit afficher « Agents connectés à Amazon Bedrock ».

Le compte expire le lundi 16 novembre en fin de journée. Tourner la vidéo de démonstration avant.

## Ce que fait AWS dans la solution

| Service | Rôle réel dans le flux | Pourquoi celui-là |
|---|---|---|
| Amazon Bedrock | Fournit le modèle de langage des trois agents | Un seul point d'accès, modèle interchangeable par une variable |
| Strands Agents (SDK AWS) | Boucle d'outils de l'analyste, sorties structurées de l'interprète | Un agent fonctionnel en quelques lignes ; les outils sont nos fonctions Python |
| Bedrock Guardrails (facultatif) | Deuxième barrière contre le conseil financier et les sujets hors cadre | S'active avec `BEDROCK_GUARDRAIL_ID`, sans changer le code |

Sans Bedrock, l'application ne sait ni lire une phrase libre ni rédiger une explication adaptée au niveau de la
personne : elle retombe sur une lecture par mots-clés et un texte fixe. C'est la contribution démontrable d'AWS.

## Architecture des agents

```
phrase de l'utilisateur
        │
        ▼
1. Interprète (Bedrock) ──► intention structurée : type, titres, part ; ou une question de clarification
        │
        ▼
2. Analyste (Bedrock + outils) ──► choisit et lance les calculs : profil, verifier_idee, mesures_titres,
        │                           correlations, comparer_options. Chaque appel est enregistré dans la trace.
        ▼
3. Explicateur (Bedrock, sans outil) ──► rédige à partir de la trace seulement
        │
        ▼
4. Gouvernance (code) ──► chaque chiffre du texte doit exister dans la trace ; aucune formule de conseil.
        │                  Rejet : une reprise avec le motif. Second rejet : texte produit par le code.
        ▼
message + reçu de décision (outils appelés, entrées, résultats, période des données)
```

Pourquoi chaque composant existe :

- **Interprète.** Le texte libre ne se lit pas avec des règles. Il ne donne aucun avis et n'invente pas la part si elle manque.
- **Analyste.** Il décide quels calculs sont utiles pour cette demande et ce profil. Il n'a que des calculatrices :
  il ne peut pas produire un chiffre lui-même.
- **Explicateur.** Séparé de l'analyste exprès : il n'a ni outils ni données, seulement la trace. Il ne peut donc citer
  que ce qui a été calculé, et il adapte la longueur et le vocabulaire au profil.
- **Gouvernance.** Du code, pas un modèle, pour que le contrôle soit vérifiable : un modèle qui se relit lui-même ne
  prouve rien. Testé dans `tests/test_agents.py` (chiffre inventé rejeté, formules de conseil rejetées).

Les contrôles de profil eux-mêmes (exclusions, concentration, budget de risque, horizon, objectif) sont dans
`alphaforge/decide.py` et s'appliquent que le modèle soit présent ou non.

## Limites connues

- La chaîne Bedrock n'a pas encore été exécutée contre un vrai compte : seuls le mode hors ligne, les outils et le
  contrôle de gouvernance sont testés. Premier lancement à faire avec `scripts/check_aws.py --agents`.
- Le contrôle des chiffres compare des valeurs, pas leur sens : un chiffre réel placé dans la mauvaise phrase passerait.
- Trois appels au modèle par demande : compter quelques secondes de latence.
- Aucune donnée de l'utilisateur n'est stockée sur AWS ; seuls le texte de la demande et les résultats de calcul sont envoyés au modèle.

## Pistes si le temps le permet

- Bedrock Knowledge Bases pour les preuves ESG de Mateo (rapports de durabilité, méthodologies de FNB), avec citations.
- Bedrock Guardrails avec vérification de l'ancrage (contextual grounding) en plus du contrôle par code.
- AgentCore pour héberger les agents et obtenir l'observabilité des appels.
