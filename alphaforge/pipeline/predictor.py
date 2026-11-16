"""Agent 4 — Scénarios (nommé « predictor » pour des raisons historiques ; il ne prédit rien).

Trois scénarios HYPOTHÉTIQUES, jamais une prévision : bootstrap par blocs des rendements mensuels historiques (logarithmiques,
recentrés), dont la dérive est remplacée par une dérive RÉDUITE (mélange historique / prior proportionnel au risque, comme
`allocate.expected_returns`) pour ne pas extrapoler les gagnants du passé.
favorable = 90e centile, central = médiane, défavorable = 10e centile, à chaque mois.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

from .. import metrics as m
from . import _trace

DISCLAIMER = "Scénarios hypothétiques, pas une prévision ni un conseil financier. Les rendements passés ne garantissent pas les rendements futurs."
SHRINK = 0.75
ERP = 0.05  # prime de risque actions, par an : hypothèse déclarée, pas un fait sourcé
SHRINK_GRID = (0.5, 0.75, 1.0)
ERP_GRID = (0.03, 0.05, 0.07)
BLOCK_MONTHS = 3
LABELS = {"best": "Scénario favorable", "central": "Notre scénario central", "worst": "Scénario défavorable"}


def _fr(x: float, nd: int = 2) -> str:
    return f"{x:.{nd}f}".replace(".", ",")


def monthly_log_returns(prices: pd.Series) -> pd.Series:
    s = prices.dropna()
    s = s[s > 0]
    mo = s.groupby(s.index.to_period("M")).last()
    last = s.index[-1]
    if last < pd.bdate_range(last.replace(day=1), last + pd.offsets.MonthEnd(0))[-1]:  # dernier mois incomplet : écarté, jamais compté comme un mois entier
        mo = mo.iloc[:-1]
    return np.log(mo).diff().dropna()


def market_proxy(ticker: str | None) -> tuple[str, pd.Series] | None:
    """Indice de référence en CAD : XIU.TO pour les titres cotés à Toronto, SPY pour le reste (actions, FNB, cryptos)."""
    from . import data_collector

    prices, _ = data_collector._starter()
    name = "XIU.TO" if (ticker or "").endswith((".TO", ".V")) else "SPY"
    return (name, prices[name].dropna()) if name in prices.columns else None


def estimate_beta(prices: pd.Series, ticker: str | None, market: tuple[str, pd.Series] | None) -> tuple[float, str, int]:
    """Bêta sur rendements quotidiens CAD superposés ; l'indice lui-même a un bêta de 1. Repli : 1 si pas assez de données."""
    if market is None:
        return 1.0, "aucun indice : bêta fixé à 1", 0
    name, mk = market
    if ticker == name:
        return 1.0, name, int(len(mk))
    j = pd.concat([prices, mk], axis=1, join="inner").dropna().pct_change().dropna()
    if len(j) < 60 or j.iloc[:, 1].var() == 0:
        return 1.0, f"{name} (trop peu de dates communes : bêta fixé à 1)", len(j)
    return float(j.iloc[:, 0].cov(j.iloc[:, 1]) / j.iloc[:, 1].var()), name, int(len(j))


def shrunk_drift(lr: pd.Series, beta: float = 1.0, shrink: float = SHRINK, erp: float = ERP, rf: float | None = None) -> dict:
    """Dérive annuelle arithmétique = shrink × prior de type MEDAF (rf + bêta × prime de risque) + (1 - shrink) × historique."""
    rf = m.RISK_FREE if rf is None else rf
    vol = float(lr.std() * math.sqrt(12))
    hist = float(np.expm1(lr).mean() * 12)
    prior = rf + beta * erp
    mu = shrink * prior + (1 - shrink) * hist
    return {"vol_annual": vol, "hist_annual": hist, "prior_annual": prior, "mu_annual": mu, "mu_log_monthly": (mu - 0.5 * vol ** 2) / 12, "rf": rf}


def outlook(prices: pd.Series, quantity: float = 10, price: float | None = None, horizon_years: int = 5, n_sims: int = 2000, seed: int = 0,
            trace: list | None = None, ticker: str | None = None, market: tuple[str, pd.Series] | None = None) -> dict:
    t0 = _trace.now()
    s = prices.dropna()
    lr = monthly_log_returns(s)
    if len(lr) < 12:
        raise ValueError("Historique trop court (moins de 12 mois de rendements) : impossible de bâtir des scénarios.")
    years_hist = (s.index[-1] - s.index[0]).days / 365.25
    price = float(s.iloc[-1] if price is None else price)
    start_value = float(quantity) * price
    n_months = int(round(horizon_years * 12))
    if market is None and ticker is not None:
        market = market_proxy(ticker)
    beta, proxy_name, n_beta = estimate_beta(s, ticker, market)
    d = shrunk_drift(lr, beta=beta)
    demeaned = (lr - lr.mean()).values
    rng = np.random.default_rng(seed)
    n_blocks = math.ceil(n_months / BLOCK_MONTHS)
    starts = rng.integers(0, len(demeaned), size=(n_sims, n_blocks))  # blocs circulaires : chaque mois a le même poids
    idx = ((starts[:, :, None] + np.arange(BLOCK_MONTHS)[None, None, :]) % len(demeaned)).reshape(n_sims, -1)[:, :n_months]
    draws = demeaned[idx]
    cum = np.cumsum(draws + d["mu_log_monthly"], axis=1)
    sum_draws = draws.sum(axis=1)
    paths = np.concatenate([np.full((n_sims, 1), start_value), start_value * np.exp(cum)], axis=1)  # (n_sims, n_months + 1)
    pct = {k: np.percentile(paths, q, axis=0) for k, q in (("best", 90), ("central", 50), ("worst", 10), ("p5", 5), ("p95", 95))}
    terminal = paths[:, -1]
    ann = lambda v: float((v / start_value) ** (1 / horizon_years) - 1)  # noqa: E731
    scen = {}
    for k in ("best", "central", "worst"):
        path = [{"month": i, "value": round(float(v), 2)} for i, v in enumerate(pct[k])]
        scen[k] = {"label": LABELS[k], "annual": round(ann(path[-1]["value"]), 4), "final": path[-1]["value"], "path": path}
    hist_cagr = float((s.iloc[-1] / s.iloc[0]) ** (1 / years_hist) - 1) if years_hist > 0 else float("nan")
    short = years_hist < 3
    window = (str(s.index[0].date()), str(s.index[-1].date()))
    assumptions = [
        f"Dérive réduite : {int(SHRINK * 100)} % d'un prior de type MEDAF (taux sans risque {_fr(d['rf'] * 100)} % + bêta {_fr(beta)} × prime de risque {_fr(ERP * 100, 0)} % par an), "
        f"{int((1 - SHRINK) * 100)} % de l'historique ; les gagnants du passé ne sont pas extrapolés. La prime de risque est une hypothèse déclarée, pas un fait sourcé.",
        "Limite du prior MEDAF : un titre à bêta élevé dont l'historique est plat (par exemple un bêta de 2,7) reçoit tout de même une dérive élevée ; le prior ne tient pas compte de la qualité de l'entreprise.",
        f"Bêta estimé sur {n_beta} rendements quotidiens superposés en CAD contre {proxy_name}.",
        f"Rééchantillonnage par blocs circulaires de {BLOCK_MONTHS} mois des rendements mensuels logarithmiques historiques (recentrés ; le dernier mois est écarté s'il est incomplet), {n_sims} trajectoires, graine {seed}.",
        f"Fenêtre historique : du {window[0]} au {window[1]} ({len(lr)} rendements mensuels), en CAD, cours ajustés.",
        "Favorable = 90e centile, central = médiane, défavorable = 10e centile de la valeur à chaque mois ; ce ne sont pas des bornes absolues.",
        "Frais de gestion, impôts, commissions et dividendes non réinvestis ignorés ; taux de change et valeur réelle (inflation) non modélisés au-delà de l'historique.",
        "Biais du survivant : l'univers de titres a été choisi en 2026, parmi des actifs qui existent encore.",
    ]
    limits = ["Le passé ne se répète pas : un rééchantillonnage ne contient aucun événement qui n'a pas déjà eu lieu dans la fenêtre.",
              "Les trois scénarios sont des points d'une distribution, pas une probabilité de résultat ; la perte réelle peut dépasser le scénario défavorable."]
    if short:
        limits.insert(0, f"Historique court ({_fr(years_hist, 1)} an(s) < 3 ans) : la distribution est mal estimée ; aucun élargissement n'a été appliqué, lisez la fourchette avec prudence.")
    sens = []
    for sh in SHRINK_GRID:
        for e in ERP_GRID:
            dd = shrunk_drift(lr, beta=beta, shrink=sh, erp=e)
            fin = start_value * np.exp(sum_draws + n_months * dd["mu_log_monthly"])
            sens.append({"shrink": sh, "erp": e, "central_annual": round(ann(float(np.median(fin))), 4)})
    ca = [x["central_annual"] for x in sens]
    sens_text = (f"Selon la réduction (50 à 100 %) et la prime de risque (3 à 7 % par an), le scénario central varie de {_fr(min(ca) * 100, 1)} % à "
                 f"{_fr(max(ca) * 100, 1)} % par an : il dépend surtout de ces hypothèses, pas seulement des données.")
    out = {"horizon_years": horizon_years, "start_value": round(start_value, 2), "quantity": float(quantity), "currency": "CAD", "scenarios": scen,
           "share_below_start": round(float((terminal < start_value).mean()), 4),
           "p5_final": round(float(pct["p5"][-1]), 2), "p95_final": round(float(pct["p95"][-1]), 2),
           "history": {"cagr": round(hist_cagr, 4), "vol_annual": round(m.volatility(m.returns(s)), 4), "years": round(years_hist, 2), "window": list(window),
                       "shrunk_mu_annual": round(d["mu_annual"], 4), "beta": round(beta, 3), "beta_proxy": proxy_name, "erp": ERP, "rf": round(d["rf"], 4)},
           "method": f"Rééchantillonnage par blocs de {BLOCK_MONTHS} mois des rendements historiques, dérive réduite vers un prior de type MEDAF (taux sans risque + bêta × prime de risque) "
                     f"(coefficient de réduction {int(SHRINK * 100)} %) ; scénarios = 90e, 50e et 10e centiles de {n_sims} trajectoires.",
           "assumptions": assumptions, "limits": limits, "disclaimer": DISCLAIMER, "sensitivity": sens, "sensitivity_summary": sens_text}
    _trace.record(trace, "predictor", "outlook", "predictor.outlook", {"quantity": quantity, "price": round(price, 4), "horizon_years": horizon_years, "n_sims": n_sims, "seed": seed},
                  {"best_annual": scen["best"]["annual"], "central_annual": scen["central"]["annual"], "worst_annual": scen["worst"]["annual"],
                   "best_final": scen["best"]["final"], "central_final": scen["central"]["final"], "worst_final": scen["worst"]["final"],
                   "start_value": out["start_value"], "share_below_start": out["share_below_start"], "historical_cagr": out["history"]["cagr"],
                   "volatility": out["history"]["vol_annual"]}, t0)
    return out
