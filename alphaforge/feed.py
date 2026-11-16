"""Fil de découverte : une carte par actif de l'univers, comparé au profil déclaré.

Ce module ne dit jamais quoi acheter. Une carte décrit comment un actif S'AJUSTE ou ENTRE EN TENSION avec le profil,
chiffres à l'appui ; la personne décide. Tout est simulé : aucun ordre n'est transmis.

Règles de conception (vérifiées par les tests) :
- Les règles de risque viennent de `decide.check_intention` ; rien n'est réimplémenté ici.
- Les J'aime / Je n'aime pas ne font que RÉORDONNER le fil. Ils ne changent ni un plafond, ni un verdict.
- Les exclusions strictes du profil sortent l'actif du fil ; les préférences « à éviter » le font descendre.
- Les scénarios à 5 ans sont des scénarios HYPOTHÉTIQUES (rééchantillonnage par blocs de l'historique), pas une prévision.
- Aucun nombre n'est écrit par un modèle de langage : chaque chiffre sort d'une fonction et porte sa `trace`.
"""
from __future__ import annotations

import math
import threading
from datetime import date

import numpy as np
import pandas as pd

from . import decide as d
from . import learn
from . import metrics as m
from .allocate import GROWTH_CLASSES
from .decide import VERDICTS, pct
from .profile import InvestorProfile

ACTIONS = ("like", "dislike", "neutral", "save", "unsave", "hide")
VERDICT_RANK = {"compatible": 0, "tension": 1, "conflict": 2}
CLASS_FR = {"equity": "Action", "etf_equity": "FNB actions", "etf_bond": "FNB obligations", "etf_commodity": "FNB matières premières",
            "crypto": "Cryptoactif"}

SIM_NOTICE = "Simulation : aucun ordre n'est transmis et aucun argent réel n'est engagé."
SCENARIO_DISCLAIMER = (
    "Scénarios hypothétiques construits à partir de seulement cinq ans d'historique d'un univers d'actifs choisi en 2026 "
    "(biais du survivant). Ils ne prédisent pas l'avenir : ce n'est ni une prévision ni une promesse de rendement, "
    "et des pertes supérieures au cas pessimiste sont possibles."
)
BLOCK_DAYS = 21  # environ un mois de bourse : conserve un peu d'autocorrélation
PEER_THRESHOLD = 0.3  # similarité minimale (sur 1) avant qu'un J'aime / Je n'aime pas influence un autre actif


# --------------------------------------------------------------------------------------------------------------------
# État de la session
# --------------------------------------------------------------------------------------------------------------------
def new_state() -> dict:
    return {"liked": [], "disliked": [], "neutral": [], "hidden": [], "saved": [], "purchases": []}


def _drop(lst: list, ticker: str) -> None:
    while ticker in lst:
        lst.remove(ticker)


def _add(lst: list, ticker: str) -> None:
    if ticker not in lst:
        lst.append(ticker)


def react(state: dict, ticker: str, action: str) -> dict:
    """Applique une réaction. Un actif n'est jamais à la fois aimé et non aimé ; « masquer » est définitif ;
    « sauvegarder » est indépendant des J'aime. `neutral` remplace un J'aime / Je n'aime pas précédent."""
    if action not in ACTIONS:
        raise ValueError(f"Action inconnue : {action!r}. Actions permises : {', '.join(ACTIONS)}.")
    if action == "like":
        _drop(state["disliked"], ticker); _drop(state["neutral"], ticker); _add(state["liked"], ticker)
    elif action == "dislike":
        _drop(state["liked"], ticker); _drop(state["neutral"], ticker); _add(state["disliked"], ticker)
    elif action == "neutral":
        _drop(state["liked"], ticker); _drop(state["disliked"], ticker); _add(state["neutral"], ticker)
    elif action == "save":
        _add(state["saved"], ticker)
    elif action == "unsave":
        _drop(state["saved"], ticker)
    elif action == "hide":
        _add(state["hidden"], ticker)
    return state


# --------------------------------------------------------------------------------------------------------------------
# Vitesse : `metrics.portfolio_value` boucle ligne par ligne (~0,3 s par appel) et `check_intention` l'appelle deux fois.
# On branche temporairement une version vectorisée au résultat identique (vérifié par un test) et on met en cache le
# portefeuille de départ, qui est le même pour toutes les cartes d'un fil.
# --------------------------------------------------------------------------------------------------------------------
_orig_portfolio_value = m.portfolio_value
_PV_CACHE: dict = {}
_LOCK = threading.RLock()


def fast_portfolio_value(prices: pd.DataFrame, weights: dict[str, float], rebalance: str | None = "Q") -> pd.Series:
    """Même résultat que `metrics.portfolio_value`, sans boucle sur les jours."""
    if rebalance is None:
        return _orig_portfolio_value(prices, weights, rebalance)
    w = pd.Series(weights, dtype=float)
    w = w[w > 0] / w[w > 0].sum()
    px = prices[w.index].dropna()
    key = (tuple(sorted(w.round(12).items())), len(px), str(px.index[0]), str(px.index[-1]), float(px.iloc[-1].sum()), rebalance)
    hit = _PV_CACHE.get(key)
    if hit is not None:
        return hit.copy()
    rets = px.pct_change().fillna(0)
    gross = (1 + rets.values)
    wv = w.values
    out = np.empty(len(rets))
    value = 1.0
    for _, pos in pd.Series(np.arange(len(rets))).groupby(rets.index.to_period(rebalance).astype(str).to_numpy()):
        sl = pos.values
        path = np.cumprod(gross[sl], axis=0) * wv
        total = path.sum(axis=1)
        out[sl] = value * total
        value *= total[-1]
    res = pd.Series(out, index=rets.index, name="portfolio")
    if len(_PV_CACHE) > 256:
        _PV_CACHE.clear()
    _PV_CACHE[key] = res
    return res.copy()


def _check(prices, profile, base_weights, ticker, weight, meta, universe) -> dict:
    """`decide.check_intention`, exécuté avec la valeur de portefeuille vectorisée."""
    with _LOCK:
        m.portfolio_value = fast_portfolio_value
        try:
            return d.check_intention(prices, profile, base_weights, ticker, weight, meta, universe)
        finally:
            m.portfolio_value = _orig_portfolio_value


# --------------------------------------------------------------------------------------------------------------------
# Outils internes
# --------------------------------------------------------------------------------------------------------------------
def _fr(x: float, nd: int = 2) -> str:
    return f"{x:.{nd}f}".replace(".", ",")


def _money(x: float) -> str:
    return f"{abs(x):,.0f}".replace(",", " ") + " $"


def _labels(ticker: str, meta: dict) -> set[str]:
    """Mêmes étiquettes que `allocate` et `decide` : symbole, classe d'actif, étiquettes."""
    return {ticker.lower(), meta["asset_class"].get(ticker, "").lower()} | {t.lower() for t in meta["tags"].get(ticker, [])}


def is_excluded(ticker: str, profile: InvestorProfile, meta: dict) -> bool:
    return bool(_labels(ticker, meta) & {e.lower() for e in profile.excluded})


def is_interest(ticker: str, profile: InvestorProfile, meta: dict) -> bool:
    """Le titre correspond-il à un thème d'intérêt déclaré (profile.preferred) ? Sert à l'ordre du fil, jamais au verdict."""
    labels = {ticker.lower(), meta["asset_class"].get(ticker, "")} | {t.lower() for t in meta["tags"].get(ticker, [])}
    return bool(labels & {p.lower() for p in profile.preferred})


def is_avoided(ticker: str, profile: InvestorProfile, meta: dict) -> bool:
    return bool(_labels(ticker, meta) & {e.lower() for e in profile.avoided})


def _downsample(series: pd.Series, n: int) -> list[dict]:
    idx = np.unique(np.linspace(0, len(series) - 1, n).round().astype(int))
    base = float(series.iloc[0])
    return [{"date": str(series.index[i].date()), "value": round(float(series.iloc[i]) / base * 100, 2)} for i in idx]


def _base_returns(prices: pd.DataFrame, base_weights: dict[str, float]) -> pd.Series:
    w = pd.Series({t: x for t, x in base_weights.items() if x > 0 and t in prices.columns})
    r = m.returns(prices[list(w.index)].dropna())
    return (r * (w / w.sum())).sum(axis=1)


class _Ctx:
    """Calculs partagés par toutes les cartes d'un même fil (corrélations, portefeuille de départ)."""

    def __init__(self, prices: pd.DataFrame, base_weights: dict[str, float]):
        self.prices = prices
        self.rets = m.returns(prices)
        self.base_ret = _base_returns(prices, base_weights)
        self._corr = None

    def corr_base(self, ticker: str) -> float:
        r = self.rets[ticker].dropna()
        both = pd.concat([r, self.base_ret], axis=1, join="inner").dropna()
        return float(both.corr().iloc[0, 1]) if len(both) > 30 else float("nan")

    def corr(self) -> pd.DataFrame:
        if self._corr is None:
            self._corr = self.rets.corr(min_periods=60)
        return self._corr


def _fit_block(chk: dict) -> dict:
    return {"verdict": chk["verdict"], "label": chk["verdict_label"], "weight": chk["weight"],
            "max_weight_within_profile": chk["max_weight_within_profile"],
            "checks": [{"code": c["code"], "status": c["status"], "message": c["message"]} for c in chk["checks"]]}


def _impact_block(prices: pd.DataFrame, chk: dict, base_weights: dict[str, float], meta: dict, amount: float) -> dict:
    cls = meta["asset_class"]

    def side(stats: dict, weights: dict[str, float]) -> dict:
        total = sum(weights.values())
        growth = sum(x for t, x in weights.items() if cls.get(t, "equity") in GROWTH_CLASSES) / total
        return {"ex_ante_vol": float(stats["ex_ante_vol"]), "hist_vol": float(stats["vol"]), "max_drawdown": float(stats["max_drawdown"]),
                "max_drawdown_amount": float(stats["max_drawdown"] * amount), "worst_1y": float(stats["worst_1y"]),
                "growth_share": float(growth), "effective_n": float(stats["effective_n"]), "max_weight": float(stats["max_weight"])}

    return {"before": side(chk["before"], base_weights), "after": side(chk["after"], chk["after_weights"]), "amount": amount,
            "limits": chk["limits"], "weights_after": chk["after_weights"],
            "window": list(chk["data_window"]),
            "note": "Volatilité estimée (covariance de l'historique) ; pire baisse = historique du portefeuille rééquilibré chaque trimestre."}


# --------------------------------------------------------------------------------------------------------------------
# Scénarios hypothétiques à 5 ans
# --------------------------------------------------------------------------------------------------------------------
def scenarios_5y(prices: pd.DataFrame, ticker: str, amount: float = 10000.0, years: int = 5, n_sims: int = 2000, seed: int = 0) -> dict:
    """Fourchette de scénarios HYPOTHÉTIQUES, pas une prévision.

    Rééchantillonnage par blocs (21 jours de bourse) des rendements quotidiens réels de l'actif, `n_sims` trajectoires de
    `years` ans, graine fixe. Les rendements passés sont rejoués : les gagnants du passé donnent donc un scénario médian élevé,
    ce qui ne dit rien de leur avenir.
    """
    r = m.returns(prices[ticker]).dropna().values
    if len(r) < 2 * BLOCK_DAYS * 6:
        raise ValueError(f"Historique trop court pour {ticker} : impossible de bâtir des scénarios.")
    window = (str(prices[ticker].dropna().index[0].date()), str(prices[ticker].dropna().index[-1].date()))
    n_days = int(round(years * m.TRADING_DAYS))
    n_blocks = math.ceil(n_days / BLOCK_DAYS)
    rng = np.random.default_rng(seed)
    starts = rng.integers(0, len(r) - BLOCK_DAYS + 1, size=(n_sims, n_blocks))
    idx = (starts[:, :, None] + np.arange(BLOCK_DAYS)[None, None, :]).reshape(n_sims, -1)[:, :n_days]
    paths = np.cumprod(1.0 + r[idx], axis=1) * amount
    terminal = paths[:, -1]
    p5, p50, p95 = (float(x) for x in np.percentile(terminal, [5, 50, 95]))
    p10, p90 = (float(x) for x in np.percentile(terminal, [10, 90]))
    pts = np.unique(np.linspace(0, n_days, 21).round().astype(int))
    fan = [{"year": round(float(k) / m.TRADING_DAYS, 2), "p5": float(amount), "p10": float(amount), "p50": float(amount), "p90": float(amount), "p95": float(amount)} if k == 0 else
           {"year": round(float(k) / m.TRADING_DAYS, 2), **dict(zip(("p5", "p10", "p50", "p90", "p95"), (float(x) for x in np.percentile(paths[:, k - 1], [5, 10, 50, 90, 95]))))}
           for k in pts]
    ann = lambda v: float((v / amount) ** (1 / years) - 1)  # noqa: E731
    return {
        "ticker": ticker, "method": f"Rééchantillonnage par blocs de {BLOCK_DAYS} jours de bourse des rendements quotidiens historiques de l'actif",
        "method_key": "block_bootstrap", "block_days": BLOCK_DAYS, "data_window": list(window), "n_obs": int(len(r)),
        "n_sims": int(n_sims), "years": years, "seed": seed, "amount": float(amount), "currency": "CAD",
        "p5": p5, "p50": p50, "p95": p95, "p10": p10, "p90": p90, "p10_annualized": ann(p10), "p90_annualized": ann(p90),
        "p5_annualized": ann(p5), "p50_annualized": ann(p50), "p95_annualized": ann(p95),
        "share_below_start": float((terminal < amount).mean()),
        "worst_simulated": float(terminal.min()), "best_simulated": float(terminal.max()),
        "labels": {"p5": "Cas pessimiste (5e centile)", "p50": "Cas central (médiane)", "p95": "Cas optimiste (95e centile)"},
        "fan": fan, "disclaimer": SCENARIO_DISCLAIMER,
        "trace": [{"calcul": "feed.scenarios_5y", "entrees": {"ticker": ticker, "montant": amount, "annees": years, "simulations": n_sims,
                                                            "graine": seed, "bloc_jours": BLOCK_DAYS},
                   "fenetre": window, "produit": "5e, 50e et 95e centiles de la valeur finale, part des trajectoires sous la mise de départ"}],
    }


# --------------------------------------------------------------------------------------------------------------------
# Impact et cartes
# --------------------------------------------------------------------------------------------------------------------
def impact_for_weight(prices: pd.DataFrame, universe: pd.DataFrame, meta: dict, profile: InvestorProfile, base_weights: dict[str, float],
                      ticker: str, weight: float, amount: float = 10000.0) -> dict:
    """Verdict et impact sur le portefeuille pour une part arbitraire (la boîte « Si j'en achète [10] % »)."""
    chk = _check(prices, profile, base_weights, ticker, weight, meta, universe)
    return {"ticker": ticker, "name": chk["name"], "weight": weight, "fit": _fit_block(chk),
            "impact": _impact_block(prices, chk, base_weights, meta, amount), "trace": chk["trace"], "data_window": list(chk["data_window"])}


def _reasons(chk: dict, ctx: _Ctx, ticker: str, profile: InvestorProfile, base_weights: dict[str, float], avoided: bool) -> tuple[list[str], dict]:
    name, a, w = chk["name"], chk["asset"], chk["weight"]
    win = chk["data_window"]
    out: list[str] = []
    if avoided:
        out.append(f"{name} fait partie de ce que vous préférez éviter : il reste visible, mais classé plus bas.")
    uw_years = a["underwater"]["days"] / 365.25
    sticky = (f"sa plus longue période sous un sommet a duré {_fr(uw_years, 1)} an(s)" + ("" if a["underwater"]["recovered"] else " et n'était pas terminée"))
    out.append(f"Du {win[0]} au {win[1]}, {name} a connu une baisse maximale de {pct(a['max_drawdown'])} et {sticky} ; "
               f"votre horizon est d'au moins {profile.horizon_years:g} ans.")
    c = ctx.corr_base(ticker)
    held = base_weights.get(ticker, 0.0)
    if not math.isnan(c):
        kind = ("une exposition plutôt différente" if c < 0.4 else "une exposition en partie différente" if c < 0.7
                else "une exposition qui ressemble beaucoup à ce que le portefeuille de départ contient déjà")
        out.append(f"Corrélation de {_fr(c)} avec le portefeuille de départ sur la période : {kind}"
                   + (f" ({pct(held, 0)} déjà détenu)." if held > 0 else "."))
    rs = chk["after"]["risk_share_of_ticker"]
    if rs > 1.5 * w and rs > 0.10:
        out.append(f"À {pct(w, 0)} de l'argent, il compterait pour environ {pct(rs, 0)} du risque total du portefeuille.")
    else:
        out.append(f"La volatilité estimée du portefeuille passerait de {pct(chk['before']['ex_ante_vol'])} à {pct(chk['after']['ex_ante_vol'])} "
                   f"(plafond du profil : {pct(chk['limits']['max_vol'], 0)}).")
    return out[:4], {"correlation_with_base": None if math.isnan(c) else c, "risk_share": rs}


def card(prices: pd.DataFrame, universe: pd.DataFrame, meta: dict, profile: InvestorProfile, base_weights: dict[str, float], ticker: str,
         weight: float = 0.05, amount: float = 10000.0, with_scenarios: bool = False, _ctx: _Ctx | None = None) -> dict:
    """Une carte. `with_scenarios=True` ajoute la fourchette hypothétique à 5 ans (plus lent : ouvrir « en savoir plus »)."""
    ctx = _ctx or _Ctx(prices, base_weights)
    # Un titre déjà détenu dans le scénario de départ est évalué à sa part actuelle (arrondie au point supérieur), pas à une
    # part plus petite : sinon « tester 5 % » d'un titre détenu à 19 % reviendrait à en vendre, et fausserait le verdict.
    weight = max(weight, np.ceil(float(base_weights.get(ticker, 0.0)) * 100 - 1e-9) / 100)
    chk = _check(prices, profile, base_weights, ticker, weight, meta, universe)
    p = prices[ticker].dropna()
    avoided = is_avoided(ticker, profile, meta)
    reasons, facts = _reasons(chk, ctx, ticker, profile, base_weights, avoided)
    a = chk["asset"]
    raw_class = universe.loc[ticker, "asset_class"] if ticker in universe.index else meta["asset_class"].get(ticker, "")
    window = chk["data_window"]
    out = {
        "ticker": ticker, "name": chk["name"], "sector": universe.loc[ticker, "sector"] if ticker in universe.index else "",
        "asset_class": raw_class, "asset_class_label": CLASS_FR.get(raw_class, raw_class),
        "fit": _fit_block(chk), "avoided": avoided, "interest": is_interest(ticker, profile, meta), "in_base_weight": float(base_weights.get(ticker, 0.0)),
        "reasons": reasons,
        "history": {"window": [str(p.index[0].date()), str(p.index[-1].date())], "cagr": a["cagr"], "vol": a["vol"],
                    "max_drawdown": a["max_drawdown"], "worst_1y": a["worst_1y"], "years_underwater": a["underwater"]["days"] / 365.25,
                    "underwater": a["underwater"], "currency": "CAD", "series": _downsample(p, 60)},
        "impact": _impact_block(prices, chk, base_weights, meta, amount),
        "scenarios": None, "similarity_note": None, "facts": facts,
        "disclaimer": "Outil d'analyse en simulation, pas un conseil de placement personnalisé. Les rendements passés ne garantissent pas les rendements futurs.",
        "trace": chk["trace"] + [
            {"calcul": "feed.corr_base", "entrees": [ticker, "portefeuille de départ"], "fenetre": window,
             "produit": "corrélation des rendements quotidiens avec le portefeuille de départ"},
            {"calcul": "feed._reasons", "entrees": [ticker], "fenetre": window, "produit": "phrases tirées des chiffres de la carte"}],
    }
    if with_scenarios:
        out["scenarios"] = scenarios_5y(prices, ticker, amount)
        out["trace"].append(out["scenarios"]["trace"][0])
    return out


# --------------------------------------------------------------------------------------------------------------------
# Fil
# --------------------------------------------------------------------------------------------------------------------
def similarity(ctx: _Ctx, universe: pd.DataFrame, a: str, b: str) -> dict:
    """Similarité entre deux actifs, à partir des données seulement : secteur, type d'actif, corrélation des rendements."""
    same_sector = bool(universe.loc[a, "sector"] == universe.loc[b, "sector"])
    same_class = bool(universe.loc[a, "asset_class"] == universe.loc[b, "asset_class"])
    c = ctx.corr().loc[a, b] if a in ctx.corr().index and b in ctx.corr().columns else float("nan")
    c = 0.0 if math.isnan(c) else float(c)
    raw = 0.35 * same_sector + 0.15 * same_class + 0.5 * max(0.0, c)
    return {"score": max(0.0, raw - PEER_THRESHOLD) / (1 - PEER_THRESHOLD), "same_sector": same_sector, "same_class": same_class, "corr": c}


def _sim_note(kind: str, other_name: str, s: dict) -> str:
    why = "même secteur" if s["same_sector"] else "même type d'actif" if s["same_class"] else "comportement proche"
    verb = "Remonté parce que vous avez aimé" if kind == "up" else "Descendu parce que vous n'avez pas aimé"
    return f"{verb} {other_name} ({why}, corrélation {_fr(s['corr'])})"


# Un titre seul est plus volatil qu'un portefeuille : on tolère jusqu'au double du plafond de volatilité du profil avant de le faire
# descendre (hypothèse de classement, jamais un verdict ni une limite).
RISK_TOLERANCE_MULT = 2.0
# Excès arrondi par paliers de 5 points de volatilité, pour que la diversification départage encore les titres de risque voisin.
RISK_GAP_STEP = 0.05


def risk_gap(c: dict) -> float:
    """Excès de volatilité historique du titre au-delà de `RISK_TOLERANCE_MULT` fois le plafond du profil, par paliers de 5 points.
    À verdict égal, un titre plus volatil que ce que le profil supporte descend, d'autant plus qu'il l'est : chez Robert (plafond 7 %),
    Tesla ou le bitcoin passent après les banques et les obligations ; chez Amira, seuls les titres les plus extrêmes descendent."""
    max_vol = (((c.get("impact") or {}).get("limits")) or {}).get("max_vol")
    vol = (c.get("history") or {}).get("vol")
    if not max_vol or vol is None:
        return 0.0
    excess = max(0.0, vol - RISK_TOLERANCE_MULT * max_vol)
    return round(excess / RISK_GAP_STEP) * RISK_GAP_STEP


# Au plus ce nombre de titres du même secteur d'affilée dans le fil (à verdict égal) : un profil à risque élevé qui aime la
# technologie voit quand même autre chose que de la technologie (« risque élevé » ne veut pas dire « un seul secteur »).
MAX_SAME_SECTOR_RUN = 2


def _sector_key(c: dict) -> str:
    return c.get("sector") or c.get("asset_class") or ""


def spread_sectors(cards: list[dict], max_run: int = MAX_SAME_SECTOR_RUN) -> list[dict]:
    """Réordonne légèrement : quand `max_run` cartes du même secteur se suivent, la prochaine carte d'un autre secteur, du même
    verdict et du même statut « déjà vu », remonte d'une place. Ne fait jamais passer un titre devant un meilleur verdict."""
    rest, out = list(cards), []
    while rest:
        pick = 0
        if len(out) >= max_run:
            last = _sector_key(out[-1])
            if last and all(_sector_key(c) == last for c in out[-max_run:]) and _sector_key(rest[0]) == last:
                group = (rest[0]["seen"], VERDICT_RANK[rest[0]["fit"]["verdict"]])
                for i, c in enumerate(rest):
                    if (c["seen"], VERDICT_RANK[c["fit"]["verdict"]]) != group:
                        break
                    if _sector_key(c) != last:
                        pick = i
                        break
        out.append(rest.pop(pick))
    return out


def build_feed(prices: pd.DataFrame, universe: pd.DataFrame, meta: dict, profile: InvestorProfile, base_weights: dict[str, float], state: dict,
               amount: float = 10000.0, limit: int | None = None, weight: float = 0.05, include_seen: bool = False, candidates: list[str] | None = None) -> list[dict]:
    """Cartes ordonnées, sans les scénarios lourds.

    Exclus : actifs masqués, actifs touchés par une exclusion stricte du profil. Les actifs déjà vus (aimés, non aimés, neutres ou
    sauvegardés) sont OMIS pour que le fil avance (`include_seen=True` les remet à la fin).

    Ordre : (1) verdict à `weight` (5 % par défaut) : compatible, puis tension, puis conflit ; (2) les actifs « à éviter » après les autres ;
    (3) score appris des J'aime / Je n'aime pas (similarité secteur + type d'actif + corrélation) ; (4) risque du titre pour ce profil
    (`risk_gap` : un titre dont la volatilité dépasse le double du plafond du profil descend, d'autant plus qu'il la dépasse) ; (5) diversification,
    c'est-à-dire la plus faible corrélation avec le portefeuille de départ d'abord.
    Les cartes en conflit ARE affichées (en dernier, étiquetées) : un profil prudent doit pouvoir voir pourquoi un titre à la mode ne lui
    convient pas ; le sujet de l'énoncé est justement de ne pas simplement acquiescer.
    `candidates` restreint le fil à une liste d'actifs (utile pour les tests et pour un fil par thème).
    Les préférences ne touchent jamais un verdict ni un plafond : elles ne font que trier.
    """
    ctx = _Ctx(prices, base_weights)
    seen = set(state["liked"]) | set(state["disliked"]) | set(state["neutral"]) | set(state["saved"])
    hidden = set(state["hidden"])
    cards = []
    for t in (candidates if candidates is not None else prices.columns):
        if t in hidden or is_excluded(t, profile, meta):
            continue
        if t in seen and not include_seen:
            continue
        c = card(prices, universe, meta, profile, base_weights, t, weight, amount, _ctx=ctx)
        c["seen"] = t in seen
        cards.append(c)

    def pref(c: dict) -> tuple[float, tuple | None]:
        score, top = 0.0, None
        for sign, lst in ((1, state["liked"]), (-1, state["disliked"])):
            for o in lst:
                if o == c["ticker"] or o not in universe.index or o not in ctx.rets.columns:
                    continue
                s = similarity(ctx, universe, c["ticker"], o)
                score += sign * s["score"]
                if s["score"] > 0 and (top is None or s["score"] > top[0]):
                    top = (s["score"], sign, o, s)
        return score, top

    for c in cards:
        c["pref_score"], c["_top"] = pref(c)
        cb = c["facts"]["correlation_with_base"]
        c["_div"] = 0.0 if cb is None else cb
    base_key = lambda c: (c["seen"], VERDICT_RANK[c["fit"]["verdict"]], c["avoided"], not c.get("interest", False), risk_gap(c), c["_div"])  # noqa: E731
    full_key = lambda c: (c["seen"], VERDICT_RANK[c["fit"]["verdict"]], c["avoided"], not c.get("interest", False), -round(c["pref_score"], 6), risk_gap(c), c["_div"])  # noqa: E731
    before = {c["ticker"]: i for i, c in enumerate(sorted(cards, key=base_key))}
    cards.sort(key=full_key)
    for i, c in enumerate(cards):
        if c["pref_score"] != 0 and c["_top"] and before[c["ticker"]] != i:
            sign, o, s = c["_top"][1], c["_top"][2], c["_top"][3]
            moved_up = i < before[c["ticker"]]
            if moved_up == (sign > 0):  # la note n'est donnée que si le mouvement va dans le sens de la réaction
                c["similarity_note"] = _sim_note("up" if sign > 0 else "down", universe.loc[o, "name"], s)
        del c["_top"], c["_div"]
    cards = spread_sectors(cards)
    return cards[:limit] if limit else cards


def rerank(cards: list[dict], ctx: _Ctx, universe: pd.DataFrame, state: dict, include_seen: bool = False, saved_is_seen: bool = True) -> list[dict]:
    """Réordonne des cartes DÉJÀ calculées (issues de `build_feed` avec un état vide et `include_seen=True`), sans rien recalculer
    de lourd : même ordre et mêmes notes de similarité que `build_feed(..., state)`, en quelques millisecondes.

    `saved_is_seen=False` laisse les actifs sauvegardés dans le fil (utile pour une interface où le signet n'avance pas la carte).
    Les cartes d'entrée ne sont pas modifiées (copies superficielles)."""
    seen = set(state["liked"]) | set(state["disliked"]) | set(state["neutral"]) | (set(state["saved"]) if saved_is_seen else set())
    hidden = set(state["hidden"])
    work = []
    for c0 in cards:
        t = c0["ticker"]
        if t in hidden or (t in seen and not include_seen):
            continue
        c = dict(c0)
        c["seen"] = t in seen
        score, top = 0.0, None
        for sign, lst in ((1, state["liked"]), (-1, state["disliked"])):
            for o in lst:
                if o == t or o not in universe.index or o not in ctx.rets.columns:
                    continue
                s = similarity(ctx, universe, t, o)
                score += sign * s["score"]
                if s["score"] > 0 and (top is None or s["score"] > top[0]):
                    top = (s["score"], sign, o, s)
        c["pref_score"], c["similarity_note"] = score, None
        cb = c["facts"]["correlation_with_base"]
        c["_div"], c["_top"] = (0.0 if cb is None else cb), top
        work.append(c)
    base_key = lambda c: (c["seen"], VERDICT_RANK[c["fit"]["verdict"]], c["avoided"], not c.get("interest", False), risk_gap(c), c["_div"])  # noqa: E731
    full_key = lambda c: (c["seen"], VERDICT_RANK[c["fit"]["verdict"]], c["avoided"], not c.get("interest", False), -round(c["pref_score"], 6), risk_gap(c), c["_div"])  # noqa: E731
    before = {c["ticker"]: i for i, c in enumerate(sorted(work, key=base_key))}
    work.sort(key=full_key)
    for i, c in enumerate(work):
        if c["pref_score"] != 0 and c["_top"] and before[c["ticker"]] != i:
            sign, o, s = c["_top"][1], c["_top"][2], c["_top"][3]
            if (i < before[c["ticker"]]) == (sign > 0):
                c["similarity_note"] = _sim_note("up" if sign > 0 else "down", universe.loc[o, "name"], s)
        del c["_top"], c["_div"]
    return spread_sectors(work)


# --------------------------------------------------------------------------------------------------------------------
# Achat simulé
# --------------------------------------------------------------------------------------------------------------------
def _target(base: dict[str, float], tickers: list[str], w: float) -> dict[str, float]:
    """Chaque actif ajouté à exactement `w`, le reste du portefeuille réduit proportionnellement."""
    rest = {t: x for t, x in base.items() if t not in tickers and x > 0}
    tot = sum(rest.values())
    out = {t: x / tot * (1 - w * len(tickers)) for t, x in rest.items()} if tot > 0 else {}
    out.update({t: w for t in tickers})
    return out


def _breaches(prices: pd.DataFrame, profile: InvestorProfile, meta: dict, weights: dict[str, float], added: list[str]) -> tuple[list[dict], dict]:
    budget, cls = profile.budget(), meta["asset_class"]
    vol = d._vol_only(prices, weights)
    growth = sum(x for t, x in weights.items() if cls.get(t, "equity") in GROWTH_CLASSES)
    out = []
    if vol > budget["max_vol"] + 2e-3:
        out.append({"code": "risk_budget", "status": "conflict", "value": vol, "limit": budget["max_vol"],
                    "message": f"Volatilité estimée de {pct(vol)}, au-dessus du plafond de {pct(budget['max_vol'], 0)} de votre niveau de risque ({budget['level']} sur 5)."})
    if growth > budget["max_growth_assets"] + 5e-3:
        out.append({"code": "growth_share", "status": "warn", "value": growth, "limit": budget["max_growth_assets"],
                    "message": f"Actifs de croissance à {pct(growth, 0)} du portefeuille, pour une limite de {pct(budget['max_growth_assets'], 0)}."})
    for t in added:
        cap = min(budget["max_single_weight"], meta.get("single_caps", {}).get(t, 1.0))
        if weights[t] > cap + 1e-9:
            out.append({"code": "concentration", "status": "conflict", "value": weights[t], "limit": cap,
                        "message": f"{t} à {pct(weights[t], 0)} dépasse le plafond de {pct(cap, 0)} par titre."})
        if is_excluded(t, profile, meta):
            out.append({"code": "exclusion", "status": "conflict", "value": None, "limit": None, "message": f"{t} fait partie de vos exclusions."})
    return out, {"ex_ante_vol": vol, "growth_share": float(growth)}


def simulate_purchase(prices: pd.DataFrame, universe: pd.DataFrame, meta: dict, profile: InvestorProfile, base_weights: dict[str, float],
                      state: dict, tickers: list[str], weight_each: float = 0.05, amount: float = 10000.0) -> dict:
    """Achat SIMULÉ d'un ou plusieurs actifs, chacun à `weight_each`, le reste du portefeuille étant réduit proportionnellement.

    Ne bloque jamais : si les limites du profil sont dépassées, le dit et propose la plus grande part égale qui reste dans les limites.
    Ajoute un enregistrement à `state["purchases"]` ; ne touche pas à `state["saved"]` (l'interface décide de retirer les actifs achetés).
    """
    tickers = list(dict.fromkeys(tickers))
    if not tickers:
        raise ValueError("Aucun actif à acheter.")
    if weight_each * len(tickers) >= 1:
        raise ValueError("La somme des parts dépasse 100 % du portefeuille.")
    for t in tickers:
        if t not in prices.columns:
            raise ValueError(f"{t} n'est pas dans les données.")
    window = (str(prices.index[0].date()), str(prices.index[-1].date()))
    per, journal = [], []
    for k, t in enumerate(tickers, start=1):
        target_k = _target(base_weights, tickers[:k], weight_each)
        before_k = {x: v for x, v in target_k.items() if x != t}  # `_blend` le renormalise : la cible reste exacte
        chk = _check(prices, profile, before_k, t, weight_each, meta, universe)
        per.append({"ticker": t, "name": chk["name"], "step": k, "fit": _fit_block(chk), "ex_ante_vol_after": chk["after"]["ex_ante_vol"]})
        journal.append(learn.idea_decision(chk, "keep"))
    final = _target(base_weights, tickers, weight_each)
    breaches, stats = _breaches(prices, profile, meta, final, tickers)
    sev = max([d.SEVERITY[b["status"]] for b in breaches] + [0])
    verdict, label = VERDICTS[sev]
    budget = profile.budget()
    # Plus grande part égale qui reste dans les limites (pas de 1 %, comme `check_intention`).
    cap = min([min(budget["max_single_weight"], meta.get("single_caps", {}).get(t, 1.0)) for t in tickers])
    max_equal = 0.0
    if not any(is_excluded(t, profile, meta) for t in tickers):
        for x in np.arange(0.01, min(cap, 0.999 / len(tickers)) + 1e-9, 0.01):
            if not _breaches(prices, profile, meta, _target(base_weights, tickers, float(x)), tickers)[0]:
                max_equal = float(round(x, 2))
    names = ", ".join(per_["name"] for per_ in per)
    if breaches:
        msg = (f"Simulation : {names} à {pct(weight_each, 0)} chacun. Le portefeuille obtenu dépasse les limites du profil : "
               + " ".join(b["message"] for b in breaches)
               + (f" La plus grande part égale qui resterait dans les limites est {pct(max_equal, 0)} par actif." if max_equal > 0
                  else " Aucune part égale, même de 1 %, ne reste dans les limites avec cette sélection.")
               + " Rien n'est bloqué : la décision vous appartient.")
    else:
        msg = (f"Simulation : {names} à {pct(weight_each, 0)} chacun. Le portefeuille obtenu reste dans les limites du profil "
               f"(volatilité estimée {pct(stats['ex_ante_vol'])}, plafond {pct(budget['max_vol'], 0)}).")
    record = {"date": str(date.today()), "tickers": tickers, "weight_each": weight_each, "amount": amount,
              "amounts": {t: float(final[t] * amount) for t in tickers}, "weights": final, "verdict": verdict, "simulated": True,
              "breaches": [b["code"] for b in breaches]}
    state["purchases"].append(record)
    return {
        "simulated": True, "notice": SIM_NOTICE, "tickers": tickers, "weight_each": weight_each, "amount": amount,
        "weights": final, "per_asset": per, "overall": {"verdict": verdict, "label": label, "breaches": breaches, "within_limits": not breaches,
                                                         "ex_ante_vol": stats["ex_ante_vol"], "max_vol": budget["max_vol"],
                                                         "growth_share": stats["growth_share"], "max_growth_assets": budget["max_growth_assets"],
                                                         "max_weight": max(final.values())},
        "max_equal_weight": max_equal, "summary": msg, "journal": journal, "record": record,
        "trace": [{"calcul": "decide.check_intention", "entrees": tickers, "fenetre": window, "produit": "verdict par actif, ajouté un à un"},
                  {"calcul": "feed._breaches", "entrees": sorted(final), "fenetre": window, "produit": "volatilité, part de croissance, plafonds par titre"},
                  {"calcul": "learn.idea_decision", "entrees": tickers, "fenetre": None, "produit": "entrées du journal du profil révélé"}],
    }
