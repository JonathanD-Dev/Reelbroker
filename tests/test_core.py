import numpy as np
import pandas as pd
import pytest

import alphaforge as af
from alphaforge import metrics as m

CLASSES = {"CASH.TO": "cash", "BOND.TO": "bond", "CDN.TO": "equity", "USA.TO": "equity", "INTL.TO": "equity",
           "EM.TO": "equity", "TECH.TO": "equity", "GOLD.TO": "commodity", "REIT.TO": "reit"}


@pytest.fixture(scope="module")
def prices(tmp_path_factory):
    f = tmp_path_factory.mktemp("d") / "prices_daily.csv"
    af.make_synthetic().to_csv(f, index=False)
    return af.load_prices(f)


def test_load_and_quality(prices):
    assert prices.shape[1] == 9 and prices.attrs["price_col"] == "adj_close"
    q = af.quality_report(prices)
    assert (q["pct_missing"] == 0).all() and (q["suspect_split_days"] == 0).all()


def test_known_values():
    idx = pd.bdate_range("2024-01-01", periods=5)
    p = pd.Series([100, 110, 99, 120, 108], index=idx)
    assert m.max_drawdown(p) == pytest.approx(-0.10)
    assert m.concentration({"a": 0.5, "b": 0.5})["effective_n"] == pytest.approx(2)
    flat = pd.Series(100 * 1.0004 ** np.arange(253), index=pd.bdate_range("2024-01-01", periods=253))
    assert m.max_drawdown(flat) == 0


def test_buy_and_hold_matches_single_asset(prices):
    v = m.portfolio_value(prices, {"USA.TO": 1.0})
    assert v.iloc[-1] == pytest.approx(prices["USA.TO"].iloc[-1] / prices["USA.TO"].iloc[0], rel=1e-9)


def test_risk_contributions_sum_to_one(prices):
    cov = m.cov_matrix(m.returns(prices))
    w = {s: 1 / 9 for s in prices.columns}
    assert m.risk_contributions(w, cov).sum() == pytest.approx(1)
    assert m.diversification_ratio(w, cov) > 1


def test_lookthrough_overlap():
    out = m.lookthrough({"ZEQT": 0.5, "XSP": 0.5}, {"ZEQT": {"US": 0.45, "CA": 0.25, "INTL": 0.30}, "XSP": {"US": 1.0}})
    assert out["US"] == pytest.approx(0.725)


@pytest.mark.parametrize("tol,cap,horizon", [(1, 1, 20), (3, 3, 20), (5, 5, 20), (5, 2, 20), (5, 5, 2)])
def test_allocation_respects_budget(prices, tol, cap, horizon):
    prof = af.InvestorProfile(risk_tolerance=tol, risk_capacity=cap, horizon_years=horizon)
    res = af.allocate(prices, prof, asset_class=CLASSES)
    b = prof.budget()
    w = res["weights"]
    assert sum(w.values()) == pytest.approx(1, abs=1e-3)
    assert res["ex_ante_vol"] <= b["max_vol"] + 5e-3
    growth = sum(x for s, x in w.items() if CLASSES[s] in ("equity", "commodity", "reit"))
    assert growth <= b["max_growth_assets"] + 0.03
    assert all(x <= b["max_single_weight"] + 0.03 for s, x in w.items() if CLASSES[s] != "cash")


def test_capacity_and_horizon_bind():
    assert af.InvestorProfile(risk_tolerance=5, risk_capacity=2, horizon_years=20).effective_risk() == 2
    assert af.InvestorProfile(risk_tolerance=5, risk_capacity=5, horizon_years=2).effective_risk() == 2
    assert af.InvestorProfile(risk_tolerance=5, risk_capacity=5, horizon_years=20, objective="emergency").effective_risk() == 1


def test_more_risk_means_more_vol(prices):
    vols = [af.allocate(prices, af.InvestorProfile(risk_tolerance=k, risk_capacity=k), asset_class=CLASSES, objective="max_utility")["ex_ante_vol"] for k in (1, 3, 5)]
    assert vols[0] < vols[1] < vols[2]


def test_exclusion_liquidity_and_explanation(prices):
    prof = af.InvestorProfile(name="Test", excluded=["TECH.TO", "commodity"], liquidity_need=0.10, risk_tolerance=4, risk_capacity=4)
    res = af.allocate(prices, prof, asset_class=CLASSES)
    assert "TECH.TO" not in res["weights"] and "GOLD.TO" not in res["weights"]
    assert res["weights"].get("CASH.TO", 0) >= 0.10 - 1e-3
    text = af.explain(prof, res, sources=["synthetic"], asset_class=CLASSES)
    for heading in ("Quelles données ?", "Pourquoi ce choix ?", "Quelles limites ?", "Qu'est-ce qui changerait la réponse ?"):
        assert heading in text


def test_compare(prices):
    df = af.compare(prices, {"CDN.TO": 1.0}, {"CDN.TO": 0.6, "BOND.TO": 0.4})
    assert df.loc["vol", "change"] < 0 and df.loc["effective_n", "change"] > 0
