"""Pipeline à quatre agents : hors ligne uniquement (pas d'AWS, pas de réseau ; yfinance simulé)."""
import re

import numpy as np
import pandas as pd
import pytest

from alphaforge import agents, pipeline
from alphaforge.pipeline import data_collector, fact_checker, predictor, source_finder


@pytest.fixture(autouse=True)
def no_aws(monkeypatch, tmp_path):
    monkeypatch.setattr(pipeline, "CACHE_DIR", tmp_path / "pcache")
    monkeypatch.setattr(data_collector, "CACHE_DIR", tmp_path / "cache")  # isole du cache réel
    for k in ("AWS_BEARER_TOKEN_BEDROCK", "AWS_ACCESS_KEY_ID", "AWS_PROFILE", "AWS_WEB_IDENTITY_TOKEN_FILE"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setattr(agents, "load_env", lambda *a, **k: None)
    monkeypatch.setattr(data_collector, "_download_yf", lambda t: None)  # aucun réseau, jamais
    monkeypatch.setattr(data_collector, "_yf_currency", lambda t: None)


def _series(n=1000, seed=1, start="2022-01-03"):
    idx = pd.bdate_range(start, periods=n)
    return pd.Series(100 * np.exp(np.cumsum(np.random.default_rng(seed).normal(0.0003, 0.01, n))), index=idx)


def test_registry_sanity():
    for sid, s in source_finder.REGISTRY.items():
        assert s["id"] == sid
        assert fact_checker._url_ok(s["url"])
        assert all(s.get(k) for k in ("name", "kind", "license", "provides"))
    ids = lambda t: [s["id"] for s in source_finder.find_sources(t)]  # noqa: E731
    assert ids("NVDA")[0] == "starter" and "sec_edgar" in ids("NVDA") and "boc_valet" in ids("NVDA")
    assert "sec_edgar" not in ids("BTC-USD") and "sedar_plus" not in ids("BTC-USD")
    assert "sedar_plus" in ids("RY.TO") and "sec_edgar" not in ids("RY.TO")
    assert "issuer_esg_esgv" in ids("ESGV") and "issuer_esg_esgv" not in ids("SPY")
    assert all(s["chosen_because"] for s in source_finder.find_sources("AAPL"))


def test_llm_ranker_cannot_leave_registry():
    trace = []
    rank = lambda cands: [{"id": "made_up_source", "why": "x"}, {"id": "yfinance", "why": "recoupement"}]  # noqa: E731
    out = source_finder.find_sources("NVDA", rank_fn=rank, trace=trace)
    assert all(s["id"] in source_finder.REGISTRY for s in out)
    assert out[0]["id"] == "starter" and out[1]["id"] == "yfinance" and {s["id"] for s in out} >= {"starter", "boc_valet"}
    assert "made_up_source" in trace[-1]["outputs"]["ignored_outside_registry"]


def test_fact_checker_flags_bad_source_and_url():
    good = source_finder.REGISTRY["starter"]
    assert fact_checker.check_source(good, "NVDA")["passed"]
    assert not fact_checker.check_source({**good, "url": "pas une url"}, "NVDA")["passed"]
    bad = fact_checker.check_source({"id": "inconnue", "url": "https://x.org"}, "NVDA")
    assert not bad["passed"] and not bad["checks"][0]["ok"]
    assert not fact_checker.check_source(good, "ZZZZ")["passed"]  # inconnu de l'univers, réseau coupé


def test_fact_checker_data_checks():
    s = _series(300)
    meta = {"source_id": "starter", "start": "a", "end": "b", "currency": "CAD", "price_field": "adj_close"}
    assert fact_checker.check_data(s, meta)["passed"]
    neg = s.copy()
    neg.iloc[10] = -1.0
    r = fact_checker.check_data(neg, meta)
    assert not r["passed"] and not next(c for c in r["checks"] if c["name"] == "aucun_prix_non_positif")["ok"]
    gap = s.drop(s.index[100:120])
    assert not next(c for c in fact_checker.check_data(gap, meta)["checks"] if c["name"] == "aucun_trou_inexplique")["ok"]
    assert not fact_checker.check_data(s, {**meta, "price_field": "close"})["passed"]
    assert not fact_checker.check_data(s, {**meta, "currency": None})["passed"]
    other = s * (1 + np.random.default_rng(3).normal(0, 0.05, len(s)))  # deuxième source qui diverge
    r = fact_checker.check_data(s, meta, other=other)
    assert not r["passed"] and "écart absolu médian" in r["checks"][-1]["detail"]
    assert fact_checker.check_data(s, meta, other=s * 1.0001)["passed"]


def test_collector_falls_back_offline():
    srcs = source_finder.find_sources("NVDA")
    series, meta = data_collector.collect("NVDA", srcs, use_network=False)
    assert meta["source_id"] == "starter" and meta["currency"] == "CAD" and meta["n_obs"] == len(series) > 1000
    assert meta["fact_check"]["passed"] and any(b["source_id"] == "yfinance" for b in meta["blocked"])
    # réseau demandé mais en panne (_download_yf -> None) : repli sur le départ, sans exception
    series2, meta2 = data_collector.collect("NVDA", srcs, use_network=True)
    assert meta2["source_id"] == "starter" and meta2["blocked"][0]["source_id"] == "yfinance"
    with pytest.raises(ValueError):  # ticker inconnu, hors ligne : erreur claire, pas de plantage obscur
        data_collector.collect("ZZZZ", source_finder.find_sources("ZZZZ"), use_network=False)


def test_collector_with_mocked_yfinance(tmp_path, monkeypatch):
    monkeypatch.setattr(data_collector, "CACHE_DIR", tmp_path)
    base, _ = data_collector._starter()
    s = base["RY.TO"].dropna()
    df = pd.DataFrame({"Close": s.values}, index=s.index)  # mêmes cours : la concordance doit passer
    monkeypatch.setattr(data_collector, "_download_yf", lambda t: df)
    series, meta = data_collector.collect("RY.TO", source_finder.find_sources("RY.TO"), use_network=True)
    assert meta["source_id"] == "starter" and (tmp_path / "RY.TO.csv").exists()
    cross = [c for c in meta["fact_check"]["checks"] if c["name"] == "concordance_deux_sources"]
    assert cross and cross[0]["ok"]
    # titre hors univers : yfinance devient la source primaire, USD converti en CAD
    usd = pd.DataFrame({"Close": _series(900, start="2023-01-02").values}, index=_series(900, start="2023-01-02").index)
    monkeypatch.setattr(data_collector, "_download_yf", lambda t: usd)
    s2, m2 = data_collector.collect("NEWCO", source_finder.find_sources("NEWCO"), use_network=True)
    assert m2["source_id"] == "yfinance" and m2["currency"] == "CAD" and any("USD" in n for n in m2["notes"])


def test_predictor_ordering_points_determinism():
    s, _ = data_collector.collect("NVDA", source_finder.find_sources("NVDA"))
    o = predictor.outlook(s, quantity=10)
    sc = o["scenarios"]
    assert all(len(sc[k]["path"]) == 61 for k in sc)
    for i in range(61):
        assert sc["worst"]["path"][i]["value"] <= sc["central"]["path"][i]["value"] <= sc["best"]["path"][i]["value"]
    assert sc["worst"]["path"][0]["value"] == sc["best"]["path"][0]["value"] == o["start_value"]
    assert sc["central"]["label"] == "Notre scénario central"
    assert predictor.outlook(s, quantity=10) == o  # déterministe
    assert predictor.outlook(s, quantity=10, seed=1) != o
    assert 0 <= o["share_below_start"] <= 1 and o["assumptions"] and o["limits"] and o["method"]


def test_predictor_shrinks_past_winners():
    s, _ = data_collector.collect("NVDA", source_finder.find_sources("NVDA"))
    o = predictor.outlook(s, ticker="NVDA")
    assert o["history"]["cagr"] > 0.35
    assert o["scenarios"]["central"]["annual"] < o["history"]["cagr"] - 0.15
    assert o["scenarios"]["central"]["annual"] < 0.165  # ancien prior proportionnel à la volatilité
    assert o["history"]["beta"] > 1.2


def test_beta_and_sensitivity():
    spy, _ = data_collector.collect("SPY", source_finder.find_sources("SPY"))
    o = predictor.outlook(spy, ticker="SPY")
    assert o["history"]["beta"] == 1.0 and o["history"]["beta_proxy"] == "SPY"
    rets = predictor.market_proxy("RY.TO")
    assert rets[0] == "XIU.TO"
    ry, _ = data_collector.collect("RY.TO", source_finder.find_sources("RY.TO"))
    assert 0.5 < predictor.outlook(ry, ticker="RY.TO")["history"]["beta"] < 1.3
    sens = o["sensitivity"]
    assert len(sens) == 9 and {(x["shrink"], x["erp"]) for x in sens} == {(a, b) for a in (0.5, 0.75, 1.0) for b in (0.03, 0.05, 0.07)}
    for sh in (0.5, 0.75, 1.0):
        row = [x["central_annual"] for x in sens if x["shrink"] == sh]
        assert row == sorted(row)  # croissant avec la prime de risque (bêta > 0)
    mid = next(x for x in sens if x["shrink"] == 0.75 and x["erp"] == 0.05)
    assert abs(mid["central_annual"] - o["scenarios"]["central"]["annual"]) < 1e-3
    assert o["sensitivity_summary"] and any("prime de risque" in a and "hypothèse" in a for a in o["assumptions"])


def test_predictor_short_history_and_disclaimer():
    o = predictor.outlook(_series(400), quantity=5)
    assert any("Historique court" in x for x in o["limits"])
    assert "pas une prévision" in o["disclaimer"] and "ne garantissent pas" in o["disclaimer"]
    text = " ".join([o["method"], o["disclaimer"]] + o["assumptions"] + o["limits"]).lower()
    for m in re.finditer(r"pr[ée]vision|pr[ée]diction", text):
        assert re.search(r"(pas une|ne .{0,12}pas|aucune)\s*$", text[max(0, m.start() - 20):m.start()]), text[max(0, m.start() - 30):m.end()]
    with pytest.raises(ValueError):
        predictor.outlook(_series(100))


def test_run_shape_and_governance():
    r = pipeline.run("NVDA", force_offline=True)
    assert set(r) == {"outlook", "pipeline"}
    o = r["outlook"]
    assert {"horizon_years", "start_value", "quantity", "currency", "scenarios", "share_below_start", "method", "assumptions", "limits", "disclaimer"} <= set(o)
    assert set(o["scenarios"]) == {"best", "central", "worst"} and set(o["scenarios"]["best"]) == {"label", "annual", "final", "path"}
    p = r["pipeline"]
    assert set(p) == {"sources", "fact_check", "data", "explanation", "trace"}
    assert {"id", "name", "url", "kind", "license", "as_of", "chosen_because"} <= set(p["sources"][0])
    assert p["fact_check"]["passed"] and all({"name", "ok", "detail"} == set(c) for c in p["fact_check"]["checks"])
    assert {"source_id", "currency", "start", "end", "n_obs", "missing_days", "notes"} <= set(p["data"])
    e = p["explanation"]
    assert e["mode"] == "offline" and e["governance"]["passed"] and e["short"] and e["long"]
    assert all({"agent", "step", "tool", "inputs", "outputs", "ms"} <= set(t) for t in p["trace"])
    assert {t["agent"] for t in p["trace"]} >= {"source_finder", "fact_checker", "data_collector", "predictor", "explainer"}


def test_run_all_personas_assets_pass_governance():
    for t in ("RY.TO", "XBB.TO", "BTC-USD", "ESGV", "ETH-USD"):
        r = pipeline.run(t, quantity=3, force_offline=True)
        assert r["pipeline"]["explanation"]["governance"]["passed"], (t, r["pipeline"]["explanation"]["governance"])


def test_explanation_governance_rejects_bad_model_text():
    r = pipeline.run("NVDA", force_offline=True)
    p, o = r["pipeline"], r["outlook"]
    bad = {"short": "Achetez NVDA, il va doubler : +123 % garantis.", "long": "Le rendement attendu est de 87,4 %."}
    calls = []

    def fn(fb):
        calls.append(fb)
        return bad

    e = pipeline.explain_outlook("NVDA", o, p["data"], p["fact_check"], list(p["trace"]), text_fn=fn)
    assert len(calls) == 2 and calls[1]  # une reprise avec le motif du rejet, pas plus
    assert e["mode"] == "offline" and e["governance"]["passed"] and e["governance"]["fell_back_to_deterministic"]
    good = pipeline.explain_outlook("NVDA", o, p["data"], p["fact_check"], list(p["trace"]), text_fn=lambda fb: {"short": "Résumé sans chiffre.", "long": "Ce sont des scénarios hypothétiques."})
    assert good["mode"] == "bedrock" and good["governance"]["passed"]


def test_level_check_catches_currency_error_and_shift():
    s = _series(300)
    meta = {"source_id": "starter", "start": "a", "end": "b", "currency": "CAD", "price_field": "adj_close"}
    usd = s / 1.35  # même titre en USD comparé à du CAD : les rendements concordent, pas les niveaux
    r = fact_checker.check_data(s, meta, other=usd)
    names = {c["name"]: c for c in r["checks"]}
    assert names["concordance_deux_sources"]["ok"] and not names["niveau_de_prix_concordant"]["ok"] and not r["passed"]
    assert "%" in names["niveau_de_prix_concordant"]["detail"]
    assert fact_checker.check_data(s, meta, other=s.copy())["passed"]
    shifted = s.shift(1).dropna()  # décalage d'un jour : niveaux proches, rendements différents
    names = {c["name"]: c for c in fact_checker.check_data(s, meta, other=shifted)["checks"]}
    assert not names["concordance_deux_sources"]["ok"]


def test_unknown_suffix_refused_and_metadata_used(monkeypatch):
    for t in ("ABC.L", "XYZ.NE", "FOO-CAD"):
        assert source_finder.describe_ticker(t)["currency"] is None
    df = pd.DataFrame({"Close": _series(900).values}, index=_series(900).index)
    monkeypatch.setattr(data_collector, "_download_yf", lambda t: df)
    with pytest.raises(ValueError, match="non gérée"):
        data_collector.collect("ABC.L", source_finder.find_sources("ABC.L"), use_network=True)
    monkeypatch.setattr(data_collector, "_yf_currency", lambda t: "USD")
    s, meta = data_collector.collect("ABC.L", source_finder.find_sources("ABC.L"), use_network=True)
    assert meta["currency"] == "CAD" and any("Converti de USD" in n for n in meta["notes"])
    monkeypatch.setattr(data_collector, "_yf_currency", lambda t: "GBP")
    with pytest.raises(ValueError):
        data_collector.collect("ABC.L", source_finder.find_sources("ABC.L"), use_network=True)


def test_governance_extras_not_scaled_and_probability_claims():
    tr = [{"outputs": {"x": 0.5}}]
    assert agents.validate_explanation("Résultat : 50 %.", tr)["passed"]
    assert not agents.validate_explanation("Résultat : 90 % de chances.", tr, extra_allowed=[0.9])["passed"]
    assert not agents.validate_explanation("Valeur : 5 000 $.", tr, extra_allowed=[50])["passed"]  # 50 n'est plus multiplié par 100
    assert agents.validate_explanation("Centile 90.", tr, extra_allowed=[90])["passed"]
    for bad in ("Vous avez de bonnes chances de gagner.", "C'est probable.", "La probabilité est élevée.", "Soyez certain de gagner."):
        assert not agents.validate_explanation(bad, tr)["passed"], bad
    assert agents.validate_explanation("Ce n'est pas probable ni une garantie ; aucune probabilité n'est donnée.", tr)["passed"]


def test_incomplete_last_month_dropped_and_disclosures():
    idx = pd.bdate_range("2023-01-02", "2025-06-30")
    s = pd.Series(np.linspace(100, 150, len(idx)), index=idx)
    full = predictor.monthly_log_returns(s)
    part = predictor.monthly_log_returns(s[: s.index.get_loc(pd.Timestamp("2025-06-12")) + 1])
    assert len(part) == len(full) - 1 and part.index[-1] == pd.Period("2025-05")
    o = predictor.outlook(s)
    assert any("bêta élevé" in a for a in o["assumptions"])
    assert re.search(r"Historique court \(\d,\d an\(s\) < 3 ans\) : la", " ".join(predictor.outlook(_series(400))["limits"]))


def test_attempts_traced_and_cache_roundtrip(monkeypatch):
    monkeypatch.setattr(agents, "bedrock_available", lambda: True)
    monkeypatch.setattr(source_finder, "bedrock_ranker", lambda t: (lambda c: [{"id": "yfinance", "why": "x"}, {"id": "boc_valet", "why": "y"}, {"id": "starter", "why": "z"}]))
    calls = []

    def fake(ticker, facts, outlook, allowed, feedback=None):
        calls.append(feedback)
        if not feedback:
            return {"short": "Achetez maintenant, 87,4 % de chances.", "long": "Rendement attendu énorme."}
        assert "conseil" in feedback or "introuvables" in feedback  # les motifs du rejet sont renvoyés au modèle
        return {"short": "Trois scénarios hypothétiques.", "long": "Ce ne sont pas des prévisions ; la méthode est détaillée plus bas."}

    monkeypatch.setattr(pipeline, "_bedrock_text", fake)
    r = pipeline.run("NVDA")
    e, tr = r["pipeline"]["explanation"], r["pipeline"]["trace"]
    assert e["mode"] == "bedrock" and len(calls) == 2 and e["governance"]["attempts"] == 2
    att = [t for t in tr if t["step"].startswith("tentative_")]
    assert [a["outputs"]["passed"] for a in att] == [False, True] and att[0]["outputs"]["issues"] and att[0]["outputs"]["text_head"]
    sf = next(t for t in tr if t["agent"] == "source_finder")["outputs"]
    assert sf["mode"] == "bedrock" and sf["sources"][0] == "starter" and sf["justifications"]  # starter reste la source primaire
    assert pipeline._cache_path("NVDA").exists()
    r2 = pipeline.run("NVDA", quantity=3)  # cache : aucun nouvel appel au modèle, texte indépendant de la quantité
    assert len(calls) == 2 and r2["pipeline"]["explanation"]["governance"]["from_cache"] and r2["pipeline"]["explanation"]["mode"] == "bedrock"
    r3 = pipeline.run("NVDA", force_offline=True)
    assert r3["pipeline"]["explanation"]["mode"] == "offline"


def test_allowed_numbers_cover_method_and_pass_governance():
    r = pipeline.run("NVDA", force_offline=True)
    o, d = r["outlook"], r["pipeline"]["data"]
    allowed = pipeline._allowed(o, d)
    assert any("75 %" in a for a in allowed) and any("bêta" in a for a in allowed)
    text = {"short": "Scénarios hypothétiques.", "long": "Réduction de 75 % vers le prior, prime de 5 % par an, blocs de 3 mois, 2 000 trajectoires, centiles 10, 50 et 90."}
    e = pipeline.explain_outlook("NVDA", o, d, r["pipeline"]["fact_check"], list(r["pipeline"]["trace"]), text_fn=lambda fb: text)
    assert e["mode"] == "bedrock" and e["governance"]["passed"]


def test_model_call_timeout_falls_back_and_is_traced(monkeypatch):
    import time

    from alphaforge.pipeline import _timeout

    monkeypatch.setattr(_timeout, "TIMEOUT_S", 0.2)
    r = pipeline.run("NVDA", force_offline=True)
    p, o = r["pipeline"], r["outlook"]
    trace = list(p["trace"])
    e = pipeline.explain_outlook("NVDA", o, p["data"], p["fact_check"], trace, text_fn=lambda fb: time.sleep(2) or {"short": "x", "long": "y"})
    assert e["mode"] == "offline" and e["governance"]["passed"] and e["governance"]["fell_back_to_deterministic"]
    att = [t for t in trace if t["step"].startswith("tentative_")]
    assert att and "délai" in att[-1]["outputs"]["issues"][0]
    # ranker : un appel qui dépasse le délai laisse l'ordre des règles et le signale
    tr2 = []
    out = source_finder.find_sources("NVDA", rank_fn=lambda c: _timeout.call_with_timeout(lambda: time.sleep(2)), trace=tr2)
    assert tr2[-1]["outputs"]["mode"] == "bedrock_error" and out[0]["id"] == "starter"
