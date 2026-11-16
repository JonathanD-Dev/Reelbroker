"""Liste des hypothèses, lue dans les constantes du code (jamais recopiée). Servie par GET /api/hypotheses."""
from __future__ import annotations

import inspect

from .allocate import PREF_FLOOR, allocate as _allocate
from . import data as dt
from . import feed as fd
from . import learn
from . import metrics as mt
from .pipeline import predictor as pr
from .profile import LEVEL_FR, RISK_BUDGET, InvestorProfile


def _pc(x: float, d: int = 0) -> str:
    return f"{x * 100:.{d}f}".replace(".", ",") + " %"


def build(window: list[str]) -> list[dict]:
    out: list[dict] = []

    def add(group: str, label: str, value, value_fr: str, source: str, code_ref: str) -> None:
        out.append({"group": group, "label": label, "value": value, "value_fr": value_fr, "source": source, "code_ref": code_ref})

    g = "Niveaux de risque"
    for lvl, b in RISK_BUDGET.items():
        add(g, f"Niveau {lvl} ({LEVEL_FR[lvl]}) : plafond de volatilité", b["max_vol"], _pc(b["max_vol"]), "hypothèse", "alphaforge/profile.py:RISK_BUDGET")
        add(g, f"Niveau {lvl} ({LEVEL_FR[lvl]}) : plafond d'actifs de croissance", b["max_growth_assets"], _pc(b["max_growth_assets"]), "hypothèse", "alphaforge/profile.py:RISK_BUDGET")
    g = "Plafonds"
    add(g, "Plafond par société", dt.SINGLE_CAPS["equity"], _pc(dt.SINGLE_CAPS["equity"]), "règle", "alphaforge/data.py:SINGLE_CAPS")
    add(g, "Plafond par cryptoactif", dt.SINGLE_CAPS["crypto"], _pc(dt.SINGLE_CAPS["crypto"]), "règle", "alphaforge/data.py:SINGLE_CAPS")
    add(g, "Plafond par secteur (actions individuelles)", dt.SECTOR_CAP, _pc(dt.SECTOR_CAP), "règle", "alphaforge/data.py:SECTOR_CAP")
    cap = InvestorProfile.__dataclass_fields__["max_single_weight"].default
    add(g, "Plafond par fonds diversifié", cap, _pc(cap), "règle", "alphaforge/profile.py:InvestorProfile.max_single_weight")
    g = "Allocation"
    floor = inspect.signature(_allocate).parameters["vol_floor_ratio"].default
    add(g, "Volatilité visée : au moins cette part du plafond", floor, _pc(floor), "hypothèse", "alphaforge/allocate.py:allocate.vol_floor_ratio")
    add(g, "Plancher combiné des actifs qui vous intéressent (si faisable)", PREF_FLOOR, _pc(PREF_FLOOR), "hypothèse", "alphaforge/allocate.py:PREF_FLOOR")
    g = "Ordre du fil"
    add(g, "À verdict égal, un titre descend si sa volatilité dépasse ce multiple du plafond du profil", fd.RISK_TOLERANCE_MULT,
        f"{fd.RISK_TOLERANCE_MULT:g} ×".replace(".", ","), "hypothèse", "alphaforge/feed.py:RISK_TOLERANCE_MULT")
    add(g, "Paliers de cet excès de volatilité (la diversification départage à l'intérieur d'un palier)", fd.RISK_GAP_STEP,
        _pc(fd.RISK_GAP_STEP), "hypothèse", "alphaforge/feed.py:RISK_GAP_STEP")
    g = "Mesures"
    add(g, "Taux sans risque (moyenne du taux directeur de la Banque du Canada sur la période)", mt.RISK_FREE, _pc(mt.RISK_FREE, 2), "donnée", "alphaforge/metrics.py:RISK_FREE")
    g = "Scénarios à cinq ans"
    n_sims = inspect.signature(pr.outlook).parameters["n_sims"].default
    add(g, "Prime de risque actions, par an", pr.ERP, _pc(pr.ERP), "hypothèse", "alphaforge/pipeline/predictor.py:ERP")
    add(g, "Coefficient de réduction de la dérive", pr.SHRINK, _pc(pr.SHRINK), "hypothèse", "alphaforge/pipeline/predictor.py:SHRINK")
    add(g, "Longueur des blocs de rééchantillonnage (mois)", pr.BLOCK_MONTHS, f"{pr.BLOCK_MONTHS} mois", "hypothèse", "alphaforge/pipeline/predictor.py:BLOCK_MONTHS")
    add(g, "Nombre de trajectoires simulées", n_sims, str(n_sims), "hypothèse", "alphaforge/pipeline/predictor.py:outlook.n_sims")
    add(g, "Centiles des scénarios (favorable, central, défavorable)", [90, 50, 10], "90e, 50e, 10e", "hypothèse", "alphaforge/pipeline/predictor.py:outlook")
    add(g, "Grille de sensibilité : réduction", list(pr.SHRINK_GRID), ", ".join(_pc(x) for x in pr.SHRINK_GRID), "hypothèse", "alphaforge/pipeline/predictor.py:SHRINK_GRID")
    add(g, "Grille de sensibilité : prime de risque", list(pr.ERP_GRID), ", ".join(_pc(x) for x in pr.ERP_GRID), "hypothèse", "alphaforge/pipeline/predictor.py:ERP_GRID")
    g = "Apprentissage du profil"
    add(g, "Décisions minimales avant toute conclusion", learn.MIN_DECISIONS, str(learn.MIN_DECISIONS), "règle", "alphaforge/learn.py:MIN_DECISIONS")
    add(g, "Fenêtre : dernières décisions retenues", learn.WINDOW, str(learn.WINDOW), "règle", "alphaforge/learn.py:WINDOW")
    g = "Données"
    add(g, "Fenêtre des données (jeu de départ et univers étendu)", list(window), f"du {window[0]} au {window[1]}", "donnée", "alphaforge/data.py:load_universe")
    add(g, "Conversion en dollars canadiens", "BoC USD/CAD", "taux USD/CAD quotidien de la Banque du Canada, dernier taux reporté sur les jours fériés", "donnée", "alphaforge/data.py:load_starter")
    add(g, "Rendements : prix ajustés (adj_close)", "adj_close", "dividendes et fractionnements déjà intégrés", "donnée", "alphaforge/data.py:load_starter")
    add(g, "CNQ.TO, 2022-08-22 : « fractionnement » de 1,021", 1.021, "probablement une distribution spéciale, pas un fractionnement ; non corrigé", "donnée", "alphaforge/data.py:load_starter")
    add(g, "Biais du survivant", True, "l'univers (31 actifs du jeu de départ, plus 60 titres de notre univers étendu) a été choisi en 2026 : les perdants disparus n'y figurent pas", "donnée", "alphaforge/data.py:load_universe")
    add(g, "Univers étendu : 60 titres téléchargés par nous", 60, "cours ajustés (Adj Close) Yahoo Finance via yfinance, même fenêtre, titres à historique complet seulement ; ce ne sont pas des données des organisateurs", "donnée", "scripts/build_extended_universe.py")
    add(g, "Données ESG", None, "aucune cote ESG : aucun titre n'est jamais déclaré conforme ; « donnée insuffisante », sauf le filtre publié de l'ESGV (indice FTSE US All Cap Choice, page Vanguard consultée le 2026-11-15, voir docs/esg-evidence.md)", "donnée", "alphaforge/data.py:ESG_EVIDENCE")
    return out
