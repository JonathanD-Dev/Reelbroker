import warnings

import pandas as pd
import pytest

import alphaforge as af
from alphaforge import decide as d
from alphaforge import learn as L
from alphaforge import metrics as m
from alphaforge import questionnaire as q

warnings.filterwarnings("ignore")
pytestmark = pytest.mark.skipif(not af.data.STARTER_DIR.exists(), reason="jeu de départ absent")


@pytest.fixture(scope="module")
def ctx():
    px, u = af.load_starter()
    meta = af.starter_metadata(u)
    out = {"px": px, "u": u, "meta": meta}
    for name in q.PERSONAS:
        profile, _ = q.to_profile(q.build_declared(q.PERSONAS[name]["answers"]), name)
        opts = d.options(px, profile, meta)
        out[name] = (profile, opts, next(o for o in opts if o["key"] == "aligned"))
    return out


def risky_journal(ctx, name):
    profile, opts, aligned = ctx[name]
    w = aligned["result"]["weights"]
    chk = d.check_intention(ctx["px"], profile, w, "TSLA", 0.20, ctx["meta"], ctx["u"])
    beyond = next(o for o in opts if o["key"] == "beyond")
    value = m.portfolio_value(ctx["px"][list(w)].dropna(), w)
    ep = L.worst_episodes(value)[0]
    return [L.idea_decision(chk, "keep"), L.option_decision(beyond, profile.risk_tolerance),
            L.episode_decision(ep, "add", aligned["level"], profile.risk_tolerance)]


def test_level_for_vol():
    assert [L.level_for_vol(v) for v in (0.03, 0.07, 0.071, 0.10, 0.14, 0.18, 0.40)] == [1, 2, 2, 3, 4, 5, 5]


def test_not_enough_decisions_means_no_conclusion(ctx):
    profile = ctx["Robert"][0]
    c = L.compare(profile, risky_journal(ctx, "Robert")[:2])
    assert c["status"] == "insufficient" and c["update_to"] is None and "pas assez" in c["messages"][0]


def test_robert_risky_decisions_never_unlock_more_risk(ctx):
    """Le cœur de l'étape 3 : Robert accumule des décisions risquées, le niveau retenu ne bouge pas."""
    profile = ctx["Robert"][0]
    mixed = L.compare(profile, risky_journal(ctx, "Robert"))
    # Décisions au niveau de sa tolérance déclarée (3), mais au-dessus du niveau retenu (2) : alerte, sans mise à jour à proposer.
    assert mixed["status"] == "exceeds_limits" and mixed["revealed"]["level"] == profile.risk_tolerance == 3 and mixed["update_to"] is None
    journal = [risky_journal(ctx, "Robert")[0]] * 3  # trois fois « je garde 20 % dans Tesla »
    c = L.compare(profile, journal)
    assert c["status"] == "exceeds_limits" and c["revealed"]["level"] > profile.risk_tolerance
    assert c["retained_level"] == 2 and c["retained_if_updated"] == 2
    assert any("ne changerait pas le niveau retenu" in msg for msg in c["messages"])
    assert any("votre objectif" in msg for msg in c["messages"])
    updated = L.with_tolerance(profile, c["update_to"])
    assert (updated.objective, updated.horizon_years, updated.risk_capacity) == (profile.objective, profile.horizon_years, profile.risk_capacity)
    assert updated.effective_risk() == profile.effective_risk() == 2


def test_conforming_decisions_confirm_the_declared_profile(ctx):
    profile, opts, aligned = ctx["Mateo"]
    chk = d.check_intention(ctx["px"], profile, aligned["result"]["weights"], "TSLA", 0.20, ctx["meta"], ctx["u"])
    journal = [L.idea_decision(chk, "drop"), L.idea_decision(chk, "adjust"), L.option_decision(aligned, profile.risk_tolerance)]
    assert all(e["signal"] is None for e in journal)
    c = L.compare(profile, journal)
    assert c["status"] == "aligned" and c["gap"] == 0 and c["update_to"] is None


def test_one_risky_decision_among_conforming_ones_does_not_flip(ctx):
    profile, opts, aligned = ctx["Mateo"]
    journal = risky_journal(ctx, "Mateo")[:1] + [L.option_decision(aligned, profile.risk_tolerance)] * 4
    assert L.compare(profile, journal)["status"] == "aligned"


def test_panic_selling_reveals_lower_tolerance_and_lowers_the_level(ctx):
    profile, opts, aligned = ctx["Amira"]
    w = aligned["result"]["weights"]
    ep = L.worst_episodes(m.portfolio_value(ctx["px"][list(w)].dropna(), w))[0]
    journal = [L.episode_decision(ep, "sell_all", aligned["level"], profile.risk_tolerance)] * 3
    c = L.compare(profile, journal)
    assert c["status"] == "more_cautious" and c["update_to"] == 1 and c["retained_if_updated"] == 1 < c["retained_level"]


def test_worst_episodes_are_real_and_do_not_overlap(ctx):
    w = ctx["Amira"][2]["result"]["weights"]
    value = m.portfolio_value(ctx["px"][list(w)].dropna(), w)
    eps = L.worst_episodes(value, k=2)
    assert len(eps) == 2 and eps[0]["drop"] == pytest.approx(m.max_drawdown(value)) and eps[0]["drop"] < eps[1]["drop"] < 0
    a, b = eps
    assert b["trough"] < a["peak"] or b["peak"] > (a["recovered"] or a["trough"])
    assert L.worst_episodes(pd.Series([1.0, 1.01, 1.02], index=pd.bdate_range("2024-01-01", periods=3))) == []
