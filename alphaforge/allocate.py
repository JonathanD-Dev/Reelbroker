"""Constrained allocation that deliberately does NOT chase the best historical return.

Expected returns are the weakest input in any optimiser, so the default objective maximises
diversification under the profile's risk budget. Return estimates, when used, are shrunk
heavily toward a risk-proportional prior.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.optimize import minimize

from . import metrics as m
from .profile import InvestorProfile

GROWTH_CLASSES = {"equity", "stock", "stocks", "reit", "real_estate", "commodity", "crypto", "alternative"}
CASH_CLASSES = {"cash", "gic", "money_market"}
# Soft criteria, in units of the objective (the diversification ratio is around 1.5 to 2.5). Hypotheses.
PREF_TILT = 0.6  # pull toward what the investor said interests them; still bounded by every cap and the risk budget
AVOID_TILT = 0.5  # push away from what they would rather avoid; never a ban
PREF_FLOOR = 0.15  # minimum combined share for preferred assets when the caps and the risk budget allow it


def expected_returns(prices: pd.DataFrame, shrink: float = 0.75, risk_premium_per_vol: float = 0.35, rf: float = 0.03) -> pd.Series:
    """Blend of history and a 'return proportional to risk' prior. shrink=1 ignores history entirely."""
    rets = m.returns(prices)
    hist = rets.mean() * m.TRADING_DAYS
    prior = rf + risk_premium_per_vol * rets.std() * np.sqrt(m.TRADING_DAYS)
    return shrink * prior + (1 - shrink) * hist


def allocate(
    prices: pd.DataFrame,
    profile: InvestorProfile,
    asset_class: dict[str, str] | None = None,
    tags: dict[str, list[str]] | None = None,
    objective: str = "max_diversification",  # or "min_variance", "max_utility"
    group_caps: dict[str, dict[str, float]] | None = None,  # {"region": {"Canada": 0.4}} with matching maps in group_maps
    group_maps: dict[str, dict[str, str]] | None = None,
    min_weight: float = 0.02,
    vol_floor_ratio: float = 0.85,  # aim for at least 85% of the volatility ceiling
    level: int | None = None,  # force a risk level (used to build comparison options)
    single_caps: dict[str, float] | None = None,  # per-symbol cap, e.g. 10% for one company, 5% for one cryptoasset
) -> dict:
    """Return {"weights", "stats", "binding", "universe", "dropped"} for the profile."""
    asset_class = {k: v.lower() for k, v in (asset_class or {}).items()}
    tags = tags or {}
    budget = profile.budget(level)

    # 1. Constraints define the universe: hard exclusions and unusable histories go first.
    def labels_of(s):
        return {s.lower(), asset_class.get(s, "")} | {t.lower() for t in tags.get(s, [])}

    excl = {e.lower() for e in profile.excluded}
    dropped = {}
    universe = []
    for s in prices.columns:
        if labels_of(s) & excl:
            dropped[s] = ("aucune preuve ESG documentée, règle stricte de l'investisseur" if labels_of(s) & excl == {"esg_unverified"}
                          else "exclu à la demande de l'investisseur")
        elif prices[s].dropna().shape[0] < m.TRADING_DAYS:
            dropped[s] = "moins d'un an d'historique"
        else:
            universe.append(s)
    if not universe:
        raise ValueError("No investable asset left after exclusions.")

    px = prices[universe].dropna()
    rets = m.returns(px)
    cov = m.cov_matrix(rets)
    C = cov.values
    vols = np.sqrt(np.diag(C))
    mu = expected_returns(px).values
    n = len(universe)

    is_growth = np.array([asset_class.get(s, "equity") in GROWTH_CLASSES for s in universe], dtype=float)
    is_cash = np.array([asset_class.get(s, "") in CASH_CLASSES for s in universe], dtype=float)
    pref = np.array([1.0 if labels_of(s) & {p.lower() for p in profile.preferred} else 0.0 for s in universe])

    avoid = np.array([1.0 if labels_of(s) & {p.lower() for p in profile.avoided} else 0.0 for s in universe])

    def port_vol(w):
        return np.sqrt(max(w @ C @ w, 1e-12))

    def neg_obj(w):
        # Preferences are soft: a nudge toward "preferred", a strong discouragement of "avoided", never a ban.
        tilt = PREF_TILT * (pref @ w) - AVOID_TILT * (avoid @ w)
        if objective == "min_variance":
            return w @ C @ w - tilt
        if objective == "max_utility":
            risk_aversion = {1: 12, 2: 8, 3: 5, 4: 3, 5: 2}[budget["level"]]
            return -(mu @ w - 0.5 * risk_aversion * (w @ C @ w)) - tilt
        return -(w @ vols) / port_vol(w) - tilt

    # Exact gradients (same problem, far fewer evaluations than finite differences: matters with ~90 assets).
    tilt_grad = PREF_TILT * pref - AVOID_TILT * avoid

    def port_vol_grad(w):
        return (C @ w) / port_vol(w)

    def neg_obj_grad(w):
        if objective == "min_variance":
            return 2 * (C @ w) - tilt_grad
        if objective == "max_utility":
            risk_aversion = {1: 12, 2: 8, 3: 5, 4: 3, 5: 2}[budget["level"]]
            return -(mu - risk_aversion * (C @ w)) - tilt_grad
        pv = port_vol(w)
        return -(vols / pv - (w @ vols) * (C @ w) / pv**3) - tilt_grad

    ones = np.ones(n)
    cons = [
        {"type": "eq", "fun": lambda w: w.sum() - 1, "jac": lambda w: ones},
        {"type": "ineq", "fun": lambda w: budget["max_vol"] - port_vol(w), "jac": lambda w: -port_vol_grad(w)},
        {"type": "ineq", "fun": lambda w: budget["max_growth_assets"] - is_growth @ w, "jac": lambda w: -is_growth},
    ]
    if budget["min_cash"] > 0 and is_cash.sum() > 0:
        cons.append({"type": "ineq", "fun": lambda w: is_cash @ w - budget["min_cash"], "jac": lambda w: is_cash})
    for dim, caps in (group_caps or {}).items():
        gmap = (group_maps or {}).get(dim, {})
        for grp, cap in caps.items():
            mask = np.array([1.0 if gmap.get(s) == grp else 0.0 for s in universe])
            cons.append({"type": "ineq", "fun": lambda w, mask=mask, cap=cap: cap - mask @ w, "jac": lambda w, mask=mask: -mask})

    # Cash-like assets may exceed the single-position cap (holding 60% cash is not concentration risk).
    ub = np.array([1.0 if is_cash[i] else min(budget["max_single_weight"], (single_caps or {}).get(s, 1.0)) for i, s in enumerate(universe)])
    bounds = [(0.0, float(x)) for x in ub]
    # A risk budget is a target band, not only a ceiling: without a floor, a high-risk profile gets a
    # timid portfolio. Try with the floor first; drop it if the universe cannot reach it.
    floor = {"type": "ineq", "fun": lambda w: port_vol(w) - vol_floor_ratio * budget["max_vol"], "jac": port_vol_grad}
    # Declared interests and documented ESG screens get a real, bounded place: a minimum combined share when it is feasible.
    pref_room = float((ub * pref).sum())
    pref_floor = [{"type": "ineq", "fun": lambda w: pref @ w - min(PREF_FLOOR, pref_room), "jac": lambda w: pref}] if pref.any() else []
    best, floor_used, extra_used = None, False, []
    starts = [np.full(n, 1 / n), (1 / vols) / (1 / vols).sum(), vols / vols.sum()]
    # The problem is not convex: also start from portfolios that already respect the investor's soft criteria.
    if avoid.any() and (1 - avoid).sum() > 0:
        starts.append((1 - avoid) / (1 - avoid).sum())
    if pref.any():
        starts.append(np.minimum(ub, 0.5 * pref / pref.sum() + 0.5 * (1 - avoid) / max((1 - avoid).sum(), 1)))
    for extra in ([floor] + pref_floor, [floor], pref_floor, []):
        for w0 in starts:
            res = minimize(neg_obj, w0, jac=neg_obj_grad, method="SLSQP", bounds=bounds, constraints=cons + extra, options={"maxiter": 500, "ftol": 1e-10})
            if res.success and (best is None or res.fun < best.fun):
                best = res
        if best is not None:
            floor_used, extra_used = floor in extra, extra
            break
    if best is None:
        raise RuntimeError("Optimiser found no feasible portfolio: the constraints conflict (e.g. risk budget too low for this universe).")

    w = np.where(best.x < min_weight, 0, best.x)
    w = w / w.sum()
    for _ in range(20):  # dropping dust positions must not push the others above their caps
        over = w > ub + 1e-9
        if not over.any():
            break
        excess = (w[over] - ub[over]).sum()
        w[over] = ub[over]
        room = (w > 0) & ~over & (w < ub)
        w[room] += excess * w[room] / w[room].sum()
    # Second pass: removing the dust positions changes the risk (they are often the most volatile ones), so
    # re-optimise on the surviving assets only. Without this the result can fall below the announced band.
    keep = w > 0
    bounds2 = [(min(min_weight, float(ub[i])), float(ub[i])) if keep[i] else (0.0, 0.0) for i in range(n)]
    res2 = minimize(neg_obj, w, jac=neg_obj_grad, method="SLSQP", bounds=bounds2, constraints=cons + extra_used,
                    options={"maxiter": 500, "ftol": 1e-10})
    if res2.success and abs(res2.x.sum() - 1) < 1e-6:
        w = np.where(keep, res2.x, 0.0)
        w = w / w.sum()
    weights = {s: round(float(x), 4) for s, x in zip(universe, w) if x > 0}

    def fr(x, d=0):
        return f"{x * 100:.{d}f}".replace(".", ",") + " %"

    binding = []
    if floor_used and port_vol(w) < vol_floor_ratio * budget["max_vol"] + 2e-3:
        binding.append(f"cible minimale de volatilité ({fr(vol_floor_ratio * budget['max_vol'], 1)})")
    if port_vol(w) > budget["max_vol"] - 2e-3:
        binding.append(f"plafond de volatilité ({fr(budget['max_vol'])})")
    if is_growth @ w > budget["max_growth_assets"] - 5e-3:
        binding.append(f"plafond d'actifs de croissance ({fr(budget['max_growth_assets'])})")
    for dim, caps in (group_caps or {}).items():
        gmap = (group_maps or {}).get(dim, {})
        for grp, cap in caps.items():
            share = sum(x for s, x in zip(universe, w) if gmap.get(s) == grp)
            if share > cap - 5e-3:
                binding.append(f"plafond par secteur atteint pour {grp} ({fr(cap)})")
    for s, x in weights.items():
        if not is_cash[universe.index(s)] and x > ub[universe.index(s)] - 5e-3:
            binding.append(f"plafond par titre atteint pour {s}")

    return {
        "weights": weights,
        "stats": m.portfolio_stats(px, weights),
        "ex_ante_vol": float(port_vol(w)),
        "risk_contributions": m.risk_contributions(weights, cov).round(4).to_dict(),
        "diversification_ratio": m.diversification_ratio(weights, cov),
        "concentration": m.concentration(weights),
        "binding": binding,
        "universe": universe,
        "dropped": dropped,
        "objective": objective,
        "data_window": (px.index[0].date(), px.index[-1].date()),
    }


def compare(prices: pd.DataFrame, before: dict[str, float], after: dict[str, float]) -> pd.DataFrame:
    """Side-by-side 'what does this change add?' (the XSP question from the workshop)."""
    cols = sorted(set(before) | set(after))
    px = prices[cols].dropna()
    cov = m.cov_matrix(m.returns(px))
    rows = {}
    for name, w in (("before", before), ("after", after)):
        st = m.portfolio_stats(px, w)
        rows[name] = {
            **{k: st[k] for k in ("cagr", "vol", "sharpe", "max_drawdown", "worst_1y")},
            "diversification_ratio": m.diversification_ratio(w, cov),
            **m.concentration(w),
        }
    df = pd.DataFrame(rows)
    df["change"] = df["after"] - df["before"]
    return df
