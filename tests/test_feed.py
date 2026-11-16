import warnings

import numpy as np
import pytest

import alphaforge as af
from alphaforge import decide as d
from alphaforge import feed
from alphaforge import metrics as m
from alphaforge import questionnaire as q

warnings.filterwarnings("ignore")
pytestmark = pytest.mark.skipif(not af.data.STARTER_DIR.exists(), reason="jeu de départ absent")


@pytest.fixture(scope="module")
def ctx():
    px, u = af.load_starter()
    meta = af.starter_metadata(u)
    out = {"px": px, "u": u, "meta": meta}
    for name in ("Amira", "Robert"):
        profile, _ = q.to_profile(q.build_declared(q.PERSONAS[name]["answers"]), name)
        opts = d.options(px, profile, meta)
        out[name] = (profile, next(o for o in opts if o["key"] == "aligned")["result"]["weights"])
    return out


def feed_for(ctx, name, state=None, profile=None, **kw):
    prof, base = ctx[name]
    return feed.build_feed(ctx["px"], ctx["u"], ctx["meta"], profile or prof, base, state or feed.new_state(), **kw)


@pytest.fixture(scope="module")
def amira_feed(ctx):
    return feed_for(ctx, "Amira")


@pytest.fixture(scope="module")
def robert_feed(ctx):
    return feed_for(ctx, "Robert")


# ---------------------------------------------------------------- état
def test_state_transitions():
    s = feed.new_state()
    assert set(s) == {"liked", "disliked", "neutral", "hidden", "saved", "purchases"}
    feed.react(s, "NVDA", "like")
    feed.react(s, "NVDA", "dislike")
    assert s["liked"] == [] and s["disliked"] == ["NVDA"]
    feed.react(s, "NVDA", "like")
    assert s["liked"] == ["NVDA"] and s["disliked"] == []
    feed.react(s, "NVDA", "save")
    feed.react(s, "NVDA", "save")
    assert s["saved"] == ["NVDA"] and s["liked"] == ["NVDA"]  # sauvegarder est indépendant
    feed.react(s, "NVDA", "unsave")
    assert s["saved"] == []
    feed.react(s, "NVDA", "neutral")
    assert s["liked"] == [] and s["neutral"] == ["NVDA"]
    feed.react(s, "TSLA", "hide")
    feed.react(s, "TSLA", "like")  # masquer reste définitif
    assert s["hidden"] == ["TSLA"]
    with pytest.raises(ValueError):
        feed.react(s, "TSLA", "buy")


# ---------------------------------------------------------------- vitesse : même résultat que l'original
def test_fast_portfolio_value_matches_metrics(ctx):
    _, base = ctx["Robert"]
    px = ctx["px"][list(base)].dropna()
    a, b = feed._orig_portfolio_value(px, base), feed.fast_portfolio_value(px, base)
    assert a.index.equals(b.index) and np.allclose(a.values, b.values, rtol=0, atol=1e-10)
    assert m.portfolio_value is feed._orig_portfolio_value  # le branchement temporaire est toujours retiré


# ---------------------------------------------------------------- exclusions et masquage
def test_feed_never_contains_hidden_or_excluded(ctx):
    profile, _ = ctx["Robert"]
    strict = af.InvestorProfile(**{**profile.__dict__, "excluded": ["crypto"], "avoided": []})
    s = feed.new_state()
    feed.react(s, "TSLA", "hide")
    pool = ["TSLA", "BTC-USD", "ETH-USD", "XBB.TO", "SPY", "GLD"]
    tickers = [c["ticker"] for c in feed_for(ctx, "Robert", s, profile=strict, candidates=pool)]
    assert sorted(tickers) == ["GLD", "SPY", "XBB.TO"]


def test_soft_avoidance_stays_but_is_flagged_and_ranked_lower(ctx, robert_feed):
    by = {c["ticker"]: c for c in robert_feed}
    assert by["BTC-USD"]["avoided"] and "préférez éviter" in " ".join(by["BTC-USD"]["reasons"])
    verdicts = [c["fit"]["verdict"] for c in robert_feed]
    assert verdicts == sorted(verdicts, key=lambda v: feed.VERDICT_RANK[v])  # compatible, tension, conflit
    t = [c for c in robert_feed if c["fit"]["verdict"] == "tension"]
    assert [c["avoided"] for c in t] == sorted(c["avoided"] for c in t)


# ---------------------------------------------------------------- profils contrastés
def test_robert_tsla_not_compatible_amira_has_growth_compatible(robert_feed, amira_feed):
    assert next(c for c in robert_feed if c["ticker"] == "TSLA")["fit"]["verdict"] != "compatible"
    compat = {c["ticker"] for c in amira_feed if c["fit"]["verdict"] == "compatible"}
    assert compat & {"NVDA", "SHOP.TO", "CSU.TO", "BTC-USD"}
    assert robert_feed[-1]["fit"]["verdict"] == "conflict"  # un conflit étiqueté est montré, en dernier


# ---------------------------------------------------------------- apprentissage des préférences
POOL = ["NVDA", "MSFT", "AAPL", "SHOP.TO", "CSU.TO", "GOOGL", "PG", "JNJ", "XOM", "ENB.TO", "GLD", "TLT", "XBB.TO", "SPY", "BTC-USD", "ETH-USD", "RY.TO", "TD.TO"]


def test_like_and_dislike_reorder_without_changing_verdicts(ctx):
    def run(action):
        s = feed.new_state()
        feed.react(s, "NVDA", action)
        return feed_for(ctx, "Amira", s, candidates=POOL)

    neutral, liked, disliked = run("neutral"), run("like"), run("dislike")
    pos = lambda f, t: [c["ticker"] for c in f].index(t)  # noqa: E731
    verdict = lambda f: {c["ticker"]: c["fit"]["verdict"] for c in f}  # noqa: E731
    assert verdict(neutral) == verdict(liked) == verdict(disliked)
    for c0, c1 in zip(sorted(neutral, key=lambda c: c["ticker"]), sorted(liked, key=lambda c: c["ticker"])):
        assert c0["fit"]["checks"] == c1["fit"]["checks"] and c0["fit"]["max_weight_within_profile"] == c1["fit"]["max_weight_within_profile"]
    peers = [t for t in ("MSFT", "AAPL", "SHOP.TO", "CSU.TO") if t in verdict(neutral)]
    assert any(pos(liked, t) < pos(neutral, t) for t in peers)
    assert any(pos(disliked, t) > pos(neutral, t) for t in peers)
    assert any(c["similarity_note"] and c["similarity_note"].startswith("Remonté parce que vous avez aimé NVIDIA") for c in liked)
    assert any(c["similarity_note"] and c["similarity_note"].startswith("Descendu parce que vous n'avez pas aimé NVIDIA") for c in disliked)
    assert all(c["similarity_note"] is None for c in neutral)
    assert "NVDA" not in [c["ticker"] for c in liked]  # déjà vu : omis
    full = feed_for(ctx, "Amira", feed.new_state(), candidates=POOL)
    assert full[0]["similarity_note"] is None and len(full) == len(POOL)  # sans réaction, aucune note


def test_seen_assets_are_omitted_unless_requested(ctx):
    s = feed.new_state()
    feed.react(s, "GLD", "neutral")
    feed.react(s, "XOM", "save")
    assert not {"GLD", "XOM"} & {c["ticker"] for c in feed_for(ctx, "Amira", s, candidates=POOL)}
    f = feed_for(ctx, "Amira", s, include_seen=True, candidates=POOL)
    assert [c["ticker"] for c in f[-2:]] and {c["ticker"] for c in f[-2:]} == {"GLD", "XOM"}


# ---------------------------------------------------------------- carte
def test_card_structure_and_reasons(ctx):
    profile, base = ctx["Amira"]
    c = feed.card(ctx["px"], ctx["u"], ctx["meta"], profile, base, "NVDA", with_scenarios=True)
    assert {"ticker", "name", "sector", "asset_class", "fit", "reasons", "history", "impact", "scenarios", "trace"} <= set(c)
    assert {"verdict", "label", "weight", "max_weight_within_profile", "checks"} <= set(c["fit"])
    assert 2 <= len(c["reasons"]) <= 4
    h = c["history"]
    assert {"window", "cagr", "vol", "max_drawdown", "worst_1y", "years_underwater", "series"} <= set(h)
    assert h["series"][0]["value"] == 100 and 40 <= len(h["series"]) <= 61
    assert c["impact"]["after"]["max_drawdown_amount"] < 0
    # Ajouter un titre très variable QUI N'EST PAS DÉJÀ DÉTENU augmente la volatilité estimée (un titre déjà détenu peut la laisser inchangée).
    new = next(t for t in ("AMZN", "GOOGL", "AAPL", "TSLA") if t not in base)
    c2 = feed.card(ctx["px"], ctx["u"], ctx["meta"], profile, base, new, weight=0.10)
    assert c2["impact"]["after"]["ex_ante_vol"] > c2["impact"]["before"]["ex_ante_vol"]
    assert all("calcul" in t for t in c["trace"]) and len(c["trace"]) >= 6
    assert feed.card(ctx["px"], ctx["u"], ctx["meta"], profile, base, "NVDA")["scenarios"] is None


# ---------------------------------------------------------------- scénarios
def test_scenarios_reproducible_ordered_and_labelled(ctx):
    a = feed.scenarios_5y(ctx["px"], "NVDA", 10000, seed=3)
    b = feed.scenarios_5y(ctx["px"], "NVDA", 10000, seed=3)
    c = feed.scenarios_5y(ctx["px"], "NVDA", 10000, seed=4)
    assert a == b and a["p50"] != c["p50"]
    assert a["p5"] <= a["p50"] <= a["p95"] and 0 <= a["share_below_start"] <= 1
    assert a["n_sims"] == 2000 and a["data_window"] == [str(ctx["px"].index[0].date()), str(ctx["px"].index[-1].date())]
    assert "ne prédisent pas l'avenir" in a["disclaimer"] and "biais du survivant" in a["disclaimer"] and "cinq ans" in a["disclaimer"]
    assert "blocs" in a["method"]
    assert 18 <= len(a["fan"]) <= 22 and a["fan"][0]["p50"] == 10000 and all(f["p5"] <= f["p50"] <= f["p95"] for f in a["fan"])
    assert a["fan"][-1]["p50"] == pytest.approx(a["p50"], rel=0.05)
    # un obligataire à faible volatilité a une fourchette plus étroite qu'un cryptoactif
    z = feed.scenarios_5y(ctx["px"], "ZST.TO")
    e = feed.scenarios_5y(ctx["px"], "ETH-USD")
    assert (z["p95"] - z["p5"]) / z["p50"] < (e["p95"] - e["p5"]) / e["p50"]


# ---------------------------------------------------------------- impact
def test_impact_for_weight_monotonic_and_fast(ctx):
    import time
    profile, base = ctx["Amira"]
    vols, t0 = [], time.time()
    for w in (0.02, 0.05, 0.10, 0.20):
        r = feed.impact_for_weight(ctx["px"], ctx["u"], ctx["meta"], profile, base, "AMZN", w)  # AMZN : titre volatil absent du portefeuille de départ
        vols.append(r["impact"]["after"]["ex_ante_vol"])
        assert r["fit"]["weight"] == w and r["impact"]["before"]["ex_ante_vol"] < vols[-1]
    assert vols == sorted(vols) and len(set(vols)) == 4
    assert (time.time() - t0) / 4 < 1.0
    assert r["fit"]["verdict"] == "conflict"  # 20 % dans un seul titre dépasse le plafond par titre


# ---------------------------------------------------------------- achat simulé
def test_simulate_purchase_breach_for_robert(ctx):
    profile, base = ctx["Robert"]
    s = feed.new_state()
    picks = ["TSLA", "NVDA", "SHOP.TO", "ETH-USD"]
    for t in picks:
        feed.react(s, t, "save")
    r = feed.simulate_purchase(ctx["px"], ctx["u"], ctx["meta"], profile, base, s, s["saved"], weight_each=0.05)
    assert r["simulated"] and "aucun ordre" in r["notice"].lower() and "Simulation" in r["summary"]
    assert sum(r["weights"].values()) == pytest.approx(1) and all(r["weights"][t] == pytest.approx(0.05) for t in picks)
    assert not r["overall"]["within_limits"] and r["overall"]["verdict"] == "conflict"
    assert "risk_budget" in {b["code"] for b in r["overall"]["breaches"]}
    assert 0 <= r["max_equal_weight"] < 0.05
    assert len(r["journal"]) == 4 and all(j["type"] == "idea" and "Idée gardée" in j["decision"] for j in r["journal"])
    assert any(j["signal"] is not None for j in r["journal"])
    assert len(s["purchases"]) == 1 and s["purchases"][0]["simulated"] and s["purchases"][0]["tickers"] == picks
    assert s["saved"] == picks  # l'achat simulé ne vide pas la liste ; l'interface décide
    # la limite proposée est réellement respectée
    if r["max_equal_weight"] > 0:
        ok = feed.simulate_purchase(ctx["px"], ctx["u"], ctx["meta"], profile, base, feed.new_state(), picks, weight_each=r["max_equal_weight"])
        assert ok["overall"]["within_limits"]


def test_simulate_purchase_single_compatible_asset_stays_within_limits(ctx):
    profile, base = ctx["Amira"]
    r = feed.simulate_purchase(ctx["px"], ctx["u"], ctx["meta"], profile, base, feed.new_state(), ["GLD"], weight_each=0.03)
    assert r["overall"]["within_limits"] and r["per_asset"][0]["fit"]["verdict"] == "compatible"
    assert r["journal"][0]["signal"] is None


def test_rerank_matches_build_feed(ctx):
    """`rerank` sur des cartes précalculées donne le même ordre et les mêmes notes que `build_feed` avec l'état."""
    prof, base = ctx["Amira"]
    cards = feed.build_feed(ctx["px"], ctx["u"], ctx["meta"], prof, base, feed.new_state(), include_seen=True)
    rctx = feed._Ctx(ctx["px"], base)
    state = feed.new_state()
    feed.react(state, "NVDA", "like")
    feed.react(state, "XOM", "dislike")
    feed.react(state, "GLD", "hide")
    want = feed.build_feed(ctx["px"], ctx["u"], ctx["meta"], prof, base, state)
    got = feed.rerank(cards, rctx, ctx["u"], state)
    assert [c["ticker"] for c in got] == [c["ticker"] for c in want]
    assert [c["similarity_note"] for c in got] == [c["similarity_note"] for c in want]
    assert all(c["fit"]["verdict"] == w["fit"]["verdict"] for c, w in zip(got, want))
    assert all(c["seen"] is False for c in cards)  # entrées intactes
    kept = feed.rerank(cards, rctx, ctx["u"], {**state, "saved": ["AAPL"]}, saved_is_seen=False)
    assert "AAPL" in [c["ticker"] for c in kept]


# ---------------------------------------------------------------- risque du titre pour le profil (à verdict égal)
def test_volatile_titles_sink_within_a_verdict_for_a_cautious_profile(robert_feed):
    order = [c["ticker"] for c in robert_feed]
    tension = [c for c in robert_feed if c["fit"]["verdict"] == "tension" and not c["avoided"] and not c.get("interest")]
    gaps = [feed.risk_gap(c) for c in tension]
    assert gaps == sorted(gaps)  # sans Pour ni Contre, l'excès de volatilité est croissant à l'intérieur du verdict
    # Tesla (volatilité bien au-dessus du double du plafond de Robert) passe après les banques et les services publics.
    for calm in ("RY.TO", "FTS.TO", "TD.TO"):
        assert order.index(calm) < order.index("TSLA")


def test_risk_gap_counts_only_volatility_above_twice_the_ceiling():
    card = lambda vol: {"history": {"vol": vol}, "impact": {"limits": {"max_vol": 0.07}}}  # noqa: E731
    assert feed.risk_gap(card(0.10)) == 0.0
    assert feed.risk_gap(card(0.14)) == 0.0
    assert feed.risk_gap(card(0.60)) == pytest.approx(0.45)
    assert feed.risk_gap({"history": {}}) == 0.0


def test_feed_never_shows_more_than_two_of_a_sector_in_a_row_when_another_is_available(amira_feed):
    for i in range(2, len(amira_feed)):
        a, b, c = amira_feed[i - 2], amira_feed[i - 1], amira_feed[i]
        same = feed._sector_key(a) == feed._sector_key(b) == feed._sector_key(c)
        if same:  # permis seulement si aucune carte d'un autre secteur n'existe plus loin dans le même verdict
            group = (c["seen"], feed.VERDICT_RANK[c["fit"]["verdict"]])
            later = [x for x in amira_feed[i:] if (x["seen"], feed.VERDICT_RANK[x["fit"]["verdict"]]) == group]
            assert all(feed._sector_key(x) == feed._sector_key(c) for x in later)
    verdicts = [feed.VERDICT_RANK[c["fit"]["verdict"]] for c in amira_feed]
    assert verdicts == sorted(verdicts)  # l'étalement ne fait jamais passer un titre devant un meilleur verdict
