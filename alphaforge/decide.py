"""Étape 2 — Décider : options à comparer et vérification d'une intention de l'utilisateur.

Rien ici ne dit quoi acheter ou vendre. `options` présente des scénarios fictifs et leurs compromis ;
`check_intention` confronte une idée de l'utilisateur à son profil et nomme les tensions.
Chaque résultat porte une `trace` : calcul, entrées et fenêtre de données, pour le reçu de décision.
"""
from __future__ import annotations

import re
import unicodedata

import numpy as np
import pandas as pd

from . import metrics as m
from .allocate import GROWTH_CLASSES, allocate
from .profile import RISK_BUDGET, InvestorProfile

LEVEL_FR = {1: "très faible", 2: "faible", 3: "modéré", 4: "élevé", 5: "très élevé"}
SEVERITY = {"ok": 0, "info": 0, "warn": 1, "conflict": 2}
# Hypothèse : un dépassement de moins de deux points du plafond d'actifs de croissance n'est pas signalé (le scénario de
# départ est construit au plafond ; une petite position nouvelle le dépasse mécaniquement de quelques dixièmes de point).
GROWTH_TOLERANCE = 0.02
VERDICTS = {0: ("compatible", "Compatible avec le profil déclaré"),
            1: ("tension", "Des tensions avec le profil déclaré"),
            2: ("conflict", "En conflit avec le profil déclaré")}


def pct(x: float, d: int = 1) -> str:
    return f"{abs(x) * 100:.{d}f}".replace(".", ",") + " %"


def options(prices: pd.DataFrame, profile: InvestorProfile, meta: dict, objective: str = "max_diversification") -> list[dict]:
    """Deux ou trois scénarios fictifs : un cran plus prudent, aligné sur le profil, un cran plus exposé (hors profil)."""
    level = profile.effective_risk()
    out = []
    for lvl, key, title in ((level - 1, "prudent", "Plus prudent"), (level, "aligned", "Aligné sur le profil"), (level + 1, "beyond", "Plus exposé")):
        if not 1 <= lvl <= 5:
            continue
        try:
            res = allocate(prices, profile, objective=objective, level=lvl, **meta)
        except Exception as e:  # un scénario infaisable est une information, pas une panne
            out.append({"key": key, "title": title, "level": lvl, "error": str(e)})
            continue
        cls = meta["asset_class"]
        out.append({
            "key": key, "title": title, "level": lvl, "level_label": LEVEL_FR[lvl],
            "within_profile": lvl <= level,
            "note": {"prudent": "Moins de variations, moins d'exposition aux actifs de croissance.",
                     "aligned": "Correspond au niveau de risque retenu pour ce profil.",
                     "beyond": "Hors profil : dépasse le niveau de risque retenu. Montré pour comparaison seulement."}[key],
            "growth_share": float(sum(x for t, x in res["weights"].items() if cls.get(t, "equity") in GROWTH_CLASSES)),
            "result": res,
        })
    return out


def _longest_underwater(prices: pd.Series) -> dict:
    """Plus longue période passée sous un sommet précédent."""
    p = prices.dropna()
    under = p < p.cummax()
    best_days, best_start, best_end, start = 0, None, None, None
    for dt, u in under.items():
        if u and start is None:
            start = dt
        if (not u) and start is not None:
            if (dt - start).days > best_days:
                best_days, best_start, best_end = (dt - start).days, start, dt
            start = None
    ongoing = start is not None
    if ongoing and (p.index[-1] - start).days > best_days:
        best_days, best_start, best_end = (p.index[-1] - start).days, start, None
    return {"days": int(best_days), "start": str(best_start.date()) if best_start is not None else None,
            "end": str(best_end.date()) if best_end is not None else None, "recovered": best_end is not None or best_days == 0}


def _blend(base: dict[str, float], ticker: str, weight: float) -> dict[str, float]:
    rest = {t: x for t, x in base.items() if t != ticker}
    total = sum(rest.values())
    out = {t: x / total * (1 - weight) for t, x in rest.items()} if total > 0 else {}
    out[ticker] = weight
    return out


_COV_CACHE: dict = {}


def _cov_for(prices: pd.DataFrame, cols: tuple) -> pd.DataFrame:
    """Covariance annualisée et rétrécie des `cols`, sur leur fenêtre commune. Mise en cache : `check_intention` la redemande des centaines
    de fois avec les mêmes titres et des parts différentes (même résultat, aucun calcul répété)."""
    key = (id(prices), prices.shape, str(prices.index[-1]), float(prices.iloc[-1].sum()), cols)
    hit = _COV_CACHE.get(key)
    if hit is None:
        if len(_COV_CACHE) > 512:
            _COV_CACHE.clear()
        px = prices[list(cols)].dropna()
        hit = _COV_CACHE[key] = m.cov_matrix(m.returns(px))
    return hit


def _vol_only(prices: pd.DataFrame, weights: dict[str, float]) -> float:
    cov = _cov_for(prices, tuple(weights))
    w = np.array([weights[t] for t in cov.index], dtype=float)
    return float(np.sqrt(w @ cov.values @ w))


def _ex_ante_vol(prices: pd.DataFrame, weights: dict[str, float]) -> tuple[float, pd.Series]:
    cov = _cov_for(prices, tuple(weights))
    w = pd.Series(weights).reindex(cov.index).values
    return float(np.sqrt(w @ cov.values @ w)), m.risk_contributions(weights, cov)


def check_intention(prices: pd.DataFrame, profile: InvestorProfile, base_weights: dict[str, float], ticker: str,
                    weight: float, meta: dict, universe: pd.DataFrame | None = None, additive: bool = False) -> dict:
    """Confronte « mettre `weight` du portefeuille dans `ticker` » au profil. Ne dit ni oui ni non : nomme les écarts.

    Par défaut `weight` est la position visée au total (« je veux 20 % dans Tesla »). Avec `additive=True`, c'est un AJOUT à ce
    qui est déjà détenu dans le portefeuille de départ (« si j'ajoute 5 % ») : la position testée devient détenu + ajout.
    """
    held, added = float(base_weights.get(ticker, 0.0)), float(weight)
    if additive:
        weight = min(1.0, held + added)
    if ticker not in prices.columns:
        raise ValueError(f"{ticker} n'est pas dans les données : impossible de vérifier cette idée.")
    budget, cls, tags = profile.budget(), meta["asset_class"], meta["tags"]
    name = universe.loc[ticker, "name"] if universe is not None and ticker in universe.index else ticker
    labels = {ticker.lower(), cls.get(ticker, "")} | {t.lower() for t in tags.get(ticker, [])}
    window = (str(prices.index[0].date()), str(prices.index[-1].date()))

    a = m.summary(prices[[ticker]]).loc[ticker]
    uw = _longest_underwater(prices[ticker])
    after_w = _blend(base_weights, ticker, weight)
    before = m.portfolio_stats(prices[list(base_weights)].dropna(), base_weights)
    after = m.portfolio_stats(prices[list(after_w)].dropna(), after_w)
    vol_before = _vol_only(prices, base_weights)
    vol_after, rc = _ex_ante_vol(prices, after_w)
    risk_share = float(rc[ticker])
    growth_after = sum(x for t, x in after_w.items() if cls.get(t, "equity") in GROWTH_CLASSES)
    cap = min(budget["max_single_weight"], meta.get("single_caps", {}).get(ticker, 1.0))

    checks = []

    def add(code, status, message):
        checks.append({"code": code, "status": status, "message": message})

    avoided = {e.lower() for e in profile.avoided}
    if "esg_unverified" in avoided and "esg_unverified" in labels:  # critère ESG déclaré, aucune preuve pour ce titre
        add("esg", "warn", f"Aucune preuve ESG documentée pour {name} dans nos données : impossible de confirmer qu'il respecte votre critère "
                           "sur les controverses environnementales ou sociales. Donnée insuffisante.")
    elif "esg_screened" in {p.lower() for p in profile.preferred} and "esg_screened" in labels:
        add("esg", "info", f"{name} est présenté par son émetteur comme filtré selon des critères ESG : son indice (FTSE US All Cap Choice) "
                           "exclut notamment le charbon, le pétrole et le gaz, les armes et le tabac, ainsi que les sociétés que FTSE juge non "
                           "conformes à des normes de travail, de droits de la personne, d'environnement et d'anticorruption, selon la gravité "
                           "des controverses (source : page du fonds chez Vanguard, consultée le 2026-11-15). Un filtre de fonds n'est pas une "
                           "garantie sur chaque société détenue.")
    if "esg_unscreened_fund" in avoided and "esg_unscreened_fund" in labels:
        add("esg", "warn", f"{name} est un fonds non filtré : il détient des sociétés pour lesquelles nous n'avons aucune preuve ESG. "
                           "Il ne répond donc qu'en partie à votre critère sur les controverses.")
    avoided -= {"esg_unverified", "esg_unscreened_fund"}
    excluded = {e.lower() for e in profile.excluded}
    if "esg_unverified" in excluded and "esg_unverified" in labels:
        add("esg", "conflict", f"Aucune preuve ESG documentée pour {name} dans nos données : votre règle stricte sur les controverses "
                               "environnementales ou sociales ne permet pas de l'inclure tant que la preuve manque. Donnée insuffisante.")
        excluded -= {"esg_unverified"}
    if labels & excluded:
        add("exclusion", "conflict", f"{name} fait partie de ce que vous avez demandé de ne jamais inclure.")
    elif labels & avoided:
        add("preference", "warn", f"{name} fait partie de ce que vous préférez éviter.")
    else:
        add("exclusion", "ok", "Aucune de vos autres exclusions ne vise ce titre." if any(c["code"] == "esg" for c in checks)
            else "Aucune de vos exclusions ne vise ce titre.")

    if additive and held > 0:
        add("held", "info", f"Le scénario de départ contient déjà {pct(held)} de ce titre : l'ajout porterait la position à {pct(weight)}.")
    if weight > cap + 1e-9:
        add("concentration", "conflict", f"{pct(weight, 0)} dans un seul titre dépasse le plafond de {pct(cap, 0)} retenu pour ce type d'actif.")
    else:
        add("concentration", "ok", f"{pct(weight, 0)} reste sous le plafond de {pct(cap, 0)} par titre.")

    if vol_after > budget["max_vol"] + 2e-3:
        add("risk_budget", "conflict", f"La volatilité estimée du portefeuille passerait de {pct(vol_before)} à {pct(vol_after)}, "
                                       f"au-dessus du plafond de {pct(budget['max_vol'], 0)} de votre niveau de risque ({budget['level']} sur 5).")
    else:
        add("risk_budget", "ok", f"La volatilité estimée passerait de {pct(vol_before)} à {pct(vol_after)}, sous le plafond de {pct(budget['max_vol'], 0)}.")

    if growth_after > budget["max_growth_assets"] + GROWTH_TOLERANCE:
        add("growth_share", "warn", f"Les actifs de croissance atteindraient {pct(growth_after, 0)} du portefeuille ; la limite retenue est {pct(budget['max_growth_assets'], 0)}.")

    if risk_share > 2 * weight and risk_share > 0.15:
        add("risk_share", "warn", f"Ce titre pèserait {pct(weight, 0)} de l'argent, mais {pct(risk_share, 0)} du risque total.")

    years = uw["days"] / 365.25
    if a["max_drawdown"] < -0.30 and profile.horizon_years < 5:
        tail = (f"et a mis {years:.1f} an(s) à retrouver son sommet".replace(".", ",") if uw["recovered"]
                else f"et n'avait pas retrouvé son sommet après {years:.1f} an(s)".replace(".", ","))
        add("horizon", "conflict" if profile.horizon_years < 3 or not uw["recovered"] or years > profile.horizon_years else "warn",
            f"{name} a déjà perdu {pct(a['max_drawdown'], 0)} dans les données {tail}. Vous prévoyez utiliser cet argent dans {profile.horizon_years:g} ans au plus tôt.")
    elif a["max_drawdown"] < -0.30:
        add("horizon", "info", f"{name} a déjà perdu {pct(a['max_drawdown'], 0)} dans les données. Votre horizon d'au moins {profile.horizon_years:g} ans laisse du temps pour traverser une telle baisse, sans garantie.")

    if profile.objective == "preserve" and a["vol"] > 2 * budget["max_vol"]:
        add("objective", "warn", f"Votre objectif est de préserver le capital ; ce titre varie environ {a['vol'] / budget['max_vol']:.0f} fois plus que le plafond de votre profil.")

    # Plus grande part de ce titre qui respecte encore le plafond par titre et le plafond de volatilité.
    fit = 0.0
    if not any(c["code"] == "exclusion" and c["status"] == "conflict" for c in checks):
        for x in ([] if any(c["code"] == "esg" and c["status"] == "conflict" for c in checks) else np.arange(0.01, cap + 1e-9, 0.01)):
            if _vol_only(prices, _blend(base_weights, ticker, float(x))) <= budget["max_vol"] + 2e-3:
                fit = float(x)

    worst = max(SEVERITY[c["status"]] for c in checks)
    return {
        "ticker": ticker, "name": name, "weight": weight, "added_weight": added if additive else weight - held, "held_weight": held, "verdict": VERDICTS[worst][0], "verdict_label": VERDICTS[worst][1],
        "checks": checks, "max_weight_within_profile": round(fit, 2),
        "asset": {"vol": float(a["vol"]), "max_drawdown": float(a["max_drawdown"]), "worst_1y": float(a["worst_1y"]),
                  "cagr": float(a["cagr"]), "underwater": uw},
        "before": {**before, "ex_ante_vol": vol_before, **m.concentration(base_weights)},
        "after": {**after, "ex_ante_vol": vol_after, **m.concentration(after_w), "risk_share_of_ticker": risk_share, "growth_share": float(growth_after)},
        "after_weights": after_w,
        "limits": {"level": budget["level"], "max_vol": budget["max_vol"], "single_cap": cap, "max_growth_assets": budget["max_growth_assets"]},
        "trace": [
            {"calcul": "metrics.summary", "entrees": [ticker], "fenetre": window, "produit": "volatilité, pire baisse, pires 12 mois du titre"},
            {"calcul": "decide._longest_underwater", "entrees": [ticker], "fenetre": window, "produit": "plus longue période sous un sommet"},
            {"calcul": "metrics.portfolio_stats", "entrees": ["portefeuille avant", "portefeuille après"], "fenetre": window, "produit": "pire baisse et pires 12 mois, rééquilibrage trimestriel"},
            {"calcul": "metrics.cov_matrix + risk_contributions", "entrees": sorted(after_w), "fenetre": window, "produit": "volatilité estimée et part du risque"},
            {"calcul": "profile.budget", "entrees": {"niveau": budget["level"]}, "fenetre": None, "produit": "plafonds du profil (hypothèses déclarées)"},
        ],
        "data_window": window,
    }


def _plain(s: str) -> str:
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()


ALIASES = {"tesla": "TSLA", "nvidia": "NVDA", "apple": "AAPL", "microsoft": "MSFT", "google": "GOOGL", "alphabet": "GOOGL",
           "amazon": "AMZN", "bitcoin": "BTC-USD", "btc": "BTC-USD", "ether": "ETH-USD", "ethereum": "ETH-USD", "eth": "ETH-USD",
           "shopify": "SHOP.TO", "l'or": "GLD", "d'or": "GLD", "gold": "GLD", "exxon": "XOM", "jpmorgan": "JPM", "couche-tard": "ATD.TO",
           "enbridge": "ENB.TO", "royale": "RY.TO", "td": "TD.TO", "manuvie": "MFC.TO", "manulife": "MFC.TO", "fortis": "FTS.TO",
           "constellation": "CSU.TO", "nasdaq": "QQQ", "s&p 500": "SPY", "s&p": "SPY"}


def parse_intention(text: str, universe: pd.DataFrame) -> dict:
    """Repère un titre et un pourcentage dans une phrase simple. Sans modèle de langage : si c'est ambigu, on le dit."""
    t = _plain(text)
    found = []
    for tk in universe.index:
        if re.search(rf"(?<![a-z0-9]){re.escape(_plain(tk.split('.')[0].split('-')[0]))}(?![a-z0-9])", t) and len(tk.split(".")[0]) > 2:
            found.append(tk)
    for alias, tk in ALIASES.items():
        if re.search(rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])", t) and tk in universe.index:
            found.append(tk)
    found = list(dict.fromkeys(found))
    mt = re.search(r"(\d+(?:[.,]\d+)?)\s*(?:%|pour ?cent|pourcent)", t)
    weight = float(mt.group(1).replace(",", ".")) / 100 if mt else None
    return {"tickers": found, "weight": weight, "ok": len(found) == 1 and weight is not None and 0 < weight <= 1}
