"""Risk/return metrics. Pure functions: the code calculates, the model only explains.

Everything is computed from adjusted prices. Annualisation assumes 252 trading days.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

TRADING_DAYS = 252
# Taux sans risque annuel utilisé par défaut pour Sharpe et Sortino. `data.load_starter` le règle sur la moyenne du taux
# directeur de la Banque du Canada sur la fenêtre des données ; 0 tant qu'aucune donnée n'est chargée.
RISK_FREE = 0.0


def returns(prices: pd.DataFrame | pd.Series) -> pd.DataFrame | pd.Series:
    return prices.pct_change(fill_method=None).dropna(how="all")


def cagr(prices: pd.Series) -> float:
    p = prices.dropna()
    if len(p) < 2:
        return np.nan
    years = (p.index[-1] - p.index[0]).days / 365.25
    return float((p.iloc[-1] / p.iloc[0]) ** (1 / years) - 1) if years > 0 else np.nan


def volatility(rets: pd.Series) -> float:
    return float(rets.dropna().std(ddof=1) * np.sqrt(TRADING_DAYS))


def max_drawdown(prices: pd.Series) -> float:
    p = prices.dropna()
    return float((p / p.cummax() - 1).min()) if len(p) else np.nan


def drawdown_series(prices: pd.Series) -> pd.Series:
    p = prices.dropna()
    return p / p.cummax() - 1


def sharpe(rets: pd.Series, rf: float | None = None) -> float:
    rf = RISK_FREE if rf is None else rf
    r = rets.dropna()
    vol = r.std(ddof=1)
    return float((r.mean() - rf / TRADING_DAYS) / vol * np.sqrt(TRADING_DAYS)) if vol > 0 else np.nan


def sortino(rets: pd.Series, rf: float | None = None) -> float:
    rf = RISK_FREE if rf is None else rf
    r = rets.dropna() - rf / TRADING_DAYS
    down = np.sqrt((np.minimum(r, 0) ** 2).mean())
    return float(r.mean() / down * np.sqrt(TRADING_DAYS)) if down > 0 else np.nan


def var_cvar(rets: pd.Series, level: float = 0.95) -> tuple[float, float]:
    """Historical 1-day VaR and CVaR, returned as negative numbers (losses)."""
    r = rets.dropna()
    q = r.quantile(1 - level)
    return float(q), float(r[r <= q].mean())


def worst_rolling(prices: pd.Series, window_days: int = TRADING_DAYS) -> float:
    """Worst return over any rolling window: 'how bad was the worst year you could have picked?'"""
    p = prices.dropna()
    return float((p / p.shift(window_days) - 1).min()) if len(p) > window_days else np.nan


def summary(prices: pd.DataFrame, rf: float | None = None) -> pd.DataFrame:
    """Per-asset table of the metrics that matter. Returns are fractions, not percent."""
    rets = returns(prices)
    rows = {}
    for s in prices.columns:
        r, p = rets[s].dropna(), prices[s].dropna()
        if len(p) < 30:
            continue
        var, cvar = var_cvar(r)
        rows[s] = {
            "cagr": cagr(p),
            "vol": volatility(r),
            "sharpe": sharpe(r, rf),
            "sortino": sortino(r, rf),
            "max_drawdown": max_drawdown(p),
            "worst_1y": worst_rolling(p),
            "var_95_1d": var,
            "cvar_95_1d": cvar,
            "n_obs": len(p),
            "start": p.index[0].date(),
            "end": p.index[-1].date(),
        }
    return pd.DataFrame(rows).T


def cov_matrix(rets: pd.DataFrame, shrink: float = 0.1) -> pd.DataFrame:
    """Annualised covariance, shrunk toward its diagonal for stability."""
    c = rets.cov() * TRADING_DAYS
    return (1 - shrink) * c + shrink * pd.DataFrame(np.diag(np.diag(c)), index=c.index, columns=c.columns)


def portfolio_value(prices: pd.DataFrame, weights: dict[str, float], rebalance: str | None = "Q") -> pd.Series:
    """Growth of 1 unit for a weighted portfolio, rebalanced to target at each period end.

    rebalance is a pandas period code: "M" monthly, "Q" quarterly, "Y" yearly, None = buy & hold.
    """
    w = pd.Series(weights, dtype=float)
    w = w[w > 0] / w[w > 0].sum()
    px = prices[w.index].dropna()
    if rebalance is None:
        return (px / px.iloc[0] * w).sum(axis=1).rename("portfolio")
    rets = px.pct_change().fillna(0)
    period = rets.index.to_period(rebalance)
    within = ((1 + rets).groupby(period).cumprod() * w).sum(axis=1)  # value relative to the start of its period
    at_period_end = within.groupby(period).last().cumprod()  # value at each period end, after rebalancing back to target
    start = at_period_end.shift(1).fillna(1.0)
    return (within * start.reindex(period).to_numpy()).rename("portfolio")


def portfolio_stats(prices: pd.DataFrame, weights: dict[str, float], rf: float | None = None) -> dict:
    v = portfolio_value(prices, weights)
    r = v.pct_change().dropna()
    var, cvar = var_cvar(r)
    return {
        "cagr": cagr(v),
        "vol": volatility(r),
        "sharpe": sharpe(r, rf),
        "max_drawdown": max_drawdown(v),
        "worst_1y": worst_rolling(v),
        "var_95_1d": var,
        "cvar_95_1d": cvar,
        "start": v.index[0].date(),
        "end": v.index[-1].date(),
    }


def concentration(weights: dict[str, float]) -> dict:
    """HHI and effective number of positions (1/HHI). 10 equal weights -> 10."""
    w = np.array([x for x in weights.values() if x > 0], dtype=float)
    w = w / w.sum()
    hhi = float((w**2).sum())
    return {"hhi": hhi, "effective_n": 1 / hhi, "max_weight": float(w.max()), "n_positions": int(len(w))}


def risk_contributions(weights: dict[str, float], cov: pd.DataFrame) -> pd.Series:
    """Share of portfolio variance coming from each asset (sums to 1)."""
    w = pd.Series(weights, dtype=float).reindex(cov.index).fillna(0)
    marginal = cov.values @ w.values
    total = float(w.values @ marginal)
    return pd.Series(w.values * marginal / total, index=cov.index) if total > 0 else w * 0


def diversification_ratio(weights: dict[str, float], cov: pd.DataFrame) -> float:
    """Weighted avg vol / portfolio vol. 1 = no diversification benefit; higher is better."""
    w = pd.Series(weights, dtype=float).reindex(cov.index).fillna(0).values
    port_vol = np.sqrt(w @ cov.values @ w)
    return float(w @ np.sqrt(np.diag(cov.values)) / port_vol) if port_vol > 0 else np.nan


def exposure(weights: dict[str, float], mapping: dict[str, str]) -> pd.Series:
    """Aggregate weights by any dimension (asset class, region, sector, currency...)."""
    s = pd.Series(weights, dtype=float)
    return s.groupby(s.index.map(lambda k: mapping.get(k, "unknown"))).sum().sort_values(ascending=False)


def lookthrough(weights: dict[str, float], holdings: dict[str, dict[str, float]]) -> pd.Series:
    """Expand funds/ETFs into their underlying holdings to reveal overlap (e.g. ZEQT vs XSP).

    holdings maps a fund symbol to {underlying: weight}. Symbols without an entry count as themselves.
    """
    out: dict[str, float] = {}
    for sym, w in weights.items():
        for under, uw in holdings.get(sym, {sym: 1.0}).items():
            out[under] = out.get(under, 0.0) + w * uw
    return pd.Series(out).sort_values(ascending=False)
