# Preuves ESG utilisées (critère de Mateo)

Le jeu de départ ne contient aucune cote ESG, aucune nouvelle ni donnée fondamentale. Le système ne déclare donc **jamais** un titre « conforme ». Il ne s'appuie que sur des documents publics cités ci-dessous ; pour tout le reste, il répond « donnée insuffisante ».

## ESGV — Vanguard ESG U.S. Stock ETF

- **Source :** page du fonds chez l'émetteur, section stratégie et description de l'indice : https://investor.vanguard.com/investment-products/etfs/profile/esgv (consultée le 2026-11-15, contenu chargé dans le navigateur).
- **Indice répliqué :** FTSE US All Cap Choice Index.
- **Exclusions par activité** (selon des seuils d'implication ou de revenus fixés par FTSE) : divertissement pour adultes, alcool, tabac, cannabis, jeux d'argent, armes chimiques et biologiques, armes à sous-munitions, mines antipersonnel, armes nucléaires, armes militaires conventionnelles, armes à feu civiles, énergie nucléaire, réserves et activités liées au charbon, au pétrole et au gaz (dont pipelines, raffinage, production d'électricité au pétrole, au gaz ou au charbon, distribution de gaz).
- **Filtre de conduite :** exclut les sociétés que FTSE juge non conformes à certaines normes de travail, de droits de la personne, d'environnement et d'anticorruption ; FTSE tient compte de la gravité des controverses, selon ses méthodes internes.
- **Diversité :** exclut les sociétés qui ne remplissent pas deux de ces trois critères : au moins une femme au conseil, une politique de diversité, des systèmes de gestion de la diversité.
- **Limites, dites à l'utilisateur :** ces jugements sont ceux de FTSE, avec des seuils qui varient selon l'activité ; un filtre de fonds n'est pas une garantie sur chaque société détenue ; nous n'avons pas vérifié société par société.

## Ce que le système en fait

- ESGV porte l'étiquette `esg_screened` (`alphaforge/data.py`, `ESG_EVIDENCE`) et la source ci-dessus est affichée dans la vérification d'une idée (`decide.check_intention`) et par le Source Finder (`issuer_esg_esgv`).
- Les sociétés individuelles restent `esg_unverified` : avec la règle stricte de Mateo (éviter les controverses importantes), elles sont exclues faute de preuve, et ce choix est expliqué.
- Les fonds non filtrés (XIU, SPY, QQQ, VFV, XEQT, etc.) restent `esg_unscreened_fund` : permis mais classés plus bas, avec un avertissement.

## Prochaine étape

Ajouter des rapports de durabilité ou des documents SEDAR+ / EDGAR d'émetteurs dans une base de connaissances Amazon Bedrock, pour que le système puisse citer une preuve par société au lieu de les exclure toutes.
