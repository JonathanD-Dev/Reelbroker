import warnings

import pytest

import alphaforge as af
from alphaforge import decide as d
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
        out[name] = (profile, opts, next(o for o in opts if o["key"] == "aligned")["result"]["weights"])
    return out


def check(ctx, name, ticker, weight):
    profile, _, base = ctx[name]
    return d.check_intention(ctx["px"], profile, base, ticker, weight, ctx["meta"], ctx["u"])


def test_options_are_ordered_by_risk_and_flag_out_of_profile(ctx):
    for name in q.PERSONAS:
        profile, opts, _ = ctx[name]
        assert [o["key"] for o in opts] == ["prudent", "aligned", "beyond"]
        vols = [o["result"]["ex_ante_vol"] for o in opts]
        assert vols == sorted(vols)
        assert [o["within_profile"] for o in opts] == [True, True, False]
        assert opts[1]["level"] == profile.effective_risk()


def test_same_request_different_answers(ctx):
    """Le test de l'énoncé : la même demande ne reçoit pas la même réponse selon le profil."""
    amira, robert = check(ctx, "Amira", "NVDA", 0.05), check(ctx, "Robert", "NVDA", 0.05)
    assert amira["verdict"] == "compatible" and robert["verdict"] == "tension"
    assert {"horizon", "objective"} <= {c["code"] for c in robert["checks"] if c["status"] == "warn"}


def test_robert_hyped_stock_is_challenged(ctx):
    r = check(ctx, "Robert", "TSLA", 0.20)
    bad = {c["code"] for c in r["checks"] if c["status"] == "conflict"}
    assert r["verdict"] == "conflict" and {"concentration", "risk_budget"} <= bad
    assert r["after"]["ex_ante_vol"] > r["limits"]["max_vol"] > r["before"]["ex_ante_vol"]
    assert 0 < r["max_weight_within_profile"] < 0.20
    assert r["after"]["risk_share_of_ticker"] > 0.5


def test_high_risk_is_not_anything_goes(ctx):
    r = check(ctx, "Amira", "TSLA", 0.20)
    assert r["verdict"] == "conflict" and r["max_weight_within_profile"] == pytest.approx(0.10)
    assert check(ctx, "Amira", "BTC-USD", 0.05)["verdict"] == "compatible"
    assert check(ctx, "Amira", "BTC-USD", 0.10)["verdict"] == "conflict"


def test_preference_and_strict_exclusion(ctx):
    r = check(ctx, "Robert", "BTC-USD", 0.02)
    assert any(c["code"] == "preference" and c["status"] == "warn" for c in r["checks"])
    profile, _, base = ctx["Robert"]
    strict = af.InvestorProfile(**{**profile.__dict__, "excluded": ["crypto"], "avoided": []})
    r2 = d.check_intention(ctx["px"], strict, base, "BTC-USD", 0.02, ctx["meta"], ctx["u"])
    assert r2["verdict"] == "conflict" and r2["max_weight_within_profile"] == 0


def test_blend_keeps_weights_at_one_and_trace_is_present(ctx):
    r = check(ctx, "Mateo", "SPY", 0.15)
    assert sum(r["after_weights"].values()) == pytest.approx(1) and r["after_weights"]["SPY"] == pytest.approx(0.15)
    assert len(r["trace"]) >= 4 and all("calcul" in t for t in r["trace"])


def test_unknown_ticker_is_refused(ctx):
    profile, _, base = ctx["Amira"]
    with pytest.raises(ValueError):
        d.check_intention(ctx["px"], profile, base, "GME", 0.05, ctx["meta"], ctx["u"])


@pytest.mark.parametrize("text,tickers,weight,ok", [
    ("Je veux mettre 20 % dans Tesla", ["TSLA"], 0.20, True),
    ("5 pour cent dans NVDA", ["NVDA"], 0.05, True),
    ("10% bitcoin et nvidia", ["NVDA", "BTC-USD"], 0.10, False),
    ("un peu d'or", ["GLD"], None, False),
    ("je veux quelque chose de bien", [], None, False),
])
def test_parse_intention(ctx, text, tickers, weight, ok):
    p = d.parse_intention(text, ctx["u"])
    assert p["tickers"] == tickers and p["weight"] == weight and p["ok"] is ok
