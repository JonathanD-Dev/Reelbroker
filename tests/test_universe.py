"""Univers étendu : fusion avec le jeu de départ, conversion en CAD, métadonnées, repli, et un nouveau titre de bout en bout dans l'API."""
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from alphaforge import data

ROOT = Path(__file__).resolve().parent.parent
STARTER = ROOT / data.STARTER_DIR
EXT = ROOT / data.EXTENDED_DIR

pytestmark = pytest.mark.skipif(not (STARTER / "prices_daily.csv").exists() or not (EXT / "prices_daily.csv").exists(),
                                reason="jeu de départ ou univers étendu absent")


@pytest.fixture(scope="module")
def merged():
    return data.load_universe(STARTER, extended_folder=EXT)


def test_merge_keeps_starter_identical_and_adds_extended(merged):
    prices, uni = merged
    s_prices, s_uni = data.load_starter(STARTER)
    assert prices.shape[1] == 91 and list(uni["source"].value_counts().sort_index()) == [60, 31]
    assert list(prices.columns[:31]) == list(s_prices.columns)
    pd.testing.assert_frame_equal(prices[s_prices.columns], s_prices, check_freq=False, check_names=False)  # calendrier et valeurs du jeu de départ intacts
    assert prices.attrs["base_currency"] == "CAD" and prices.attrs["extended"] == 60 and "yfinance" in prices.attrs["source"]
    assert prices.isna().mean().max() < 0.01  # historique complet pour tous les titres retenus


def test_usd_ticker_converted_like_starter(merged, tmp_path):
    prices, _ = merged
    raw = pd.read_csv(EXT / "prices_daily.csv", parse_dates=["date"])
    t = "V"  # USD
    usd = raw[raw["ticker"] == t].set_index("date")["adj_close"]
    fx = pd.read_csv(STARTER / "fx_usdcad_daily.csv", parse_dates=["date"]).set_index("date")["usdcad"]
    fx = fx.reindex(prices.index.union(fx.index)).ffill().bfill().reindex(prices.index)
    expected = usd.reindex(prices.index).ffill(limit=3) * fx
    pd.testing.assert_series_equal(prices[t], expected, check_names=False, check_freq=False)
    cad = "BMO.TO"  # CAD : aucune conversion
    cad_raw = raw[raw["ticker"] == cad].set_index("date")["adj_close"].reindex(prices.index).ffill(limit=3)
    assert np.allclose(prices[cad].dropna(), cad_raw.dropna())


def test_starter_wins_on_overlap(tmp_path):
    ext = tmp_path / "ext"
    ext.mkdir()
    s_raw = pd.read_csv(STARTER / "prices_daily.csv", parse_dates=["date"])
    fake = s_raw[s_raw["ticker"] == "AAPL"].copy()
    fake["adj_close"] = 1.0  # un prix absurde pour AAPL dans l'univers étendu
    fake.to_csv(ext / "prices_daily.csv", index=False)
    uni = pd.DataFrame([{"asset_id": "X01", "ticker": "AAPL", "name": "FAKE", "asset_class": "equity", "market": "X", "currency": "USD", "sector": "Financials"}])
    uni.to_csv(ext / "assets_universe.csv", index=False)
    (ext / "provenance.json").write_text("{}", encoding="utf-8")
    prices, universe = data.load_universe(STARTER, extended_folder=ext)
    s_prices, s_uni = data.load_starter(STARTER)
    assert prices.shape[1] == 31 and universe.loc["AAPL", "name"] == s_uni.loc["AAPL", "name"] and universe.loc["AAPL", "source"] == "starter"
    assert np.allclose(prices["AAPL"].dropna(), s_prices["AAPL"].dropna())


def test_missing_or_disabled_extended_returns_starter_only(tmp_path):
    s_prices, _ = data.load_starter(STARTER)
    for kw in ({"extended_folder": tmp_path / "nope"}, {"extended": False}):
        prices, uni = data.load_universe(STARTER, **kw)
        assert prices.shape == s_prices.shape and set(uni["source"]) == {"starter"} and prices.attrs["extended"] == 0
    (tmp_path / "prices_daily.csv").write_text("garbage,,\n1,2", encoding="utf-8")  # fichiers illisibles : même repli silencieux
    assert data.load_universe(STARTER, extended_folder=tmp_path)[0].shape == s_prices.shape


def test_extended_files_quality_and_provenance():
    import json

    prov = json.loads((EXT / "provenance.json").read_text(encoding="utf-8"))
    assert prov["source"].startswith("Yahoo Finance via yfinance") and prov["window"] == ["2021-11-12", "2026-11-12"] and prov["retrieved_at"]
    assert "Adj Close" in prov["adjustment"] and "survivant" in prov["selection"] and prov["n_kept"] == len(prov["kept"]) == 60
    qr = pd.read_csv(EXT / "quality_report.csv").set_index("symbol")
    assert (qr["non_positive"] == 0).all() and (qr["max_gap_days"] <= 7).all() and (qr["n_obs"] >= 1200).all()


def test_metadata_of_new_tickers(merged):
    _, uni = merged
    m = data.starter_metadata(uni)
    for t in ("BMO.TO", "V", "KO", "AVGO"):  # sociétés : plafond de 10 %, plafond sectoriel, ESG non vérifiée
        assert m["single_caps"][t] == 0.10 and "esg_unverified" in m["tags"][t] and t in m["group_maps"]["sector"] and m["asset_class"][t] == "equity"
    assert m["group_caps"]["sector"]["Financials"] == data.SECTOR_CAP
    for t in ("VFV.TO", "XEQT.TO", "EEM", "SCHD", "VNQ", "XRE.TO", "ICLN"):  # fonds d'actions non filtrés
        assert "esg_unscreened_fund" in m["tags"][t] and "esg_screened" not in m["tags"][t] and t not in m["single_caps"] and m["asset_class"][t] == "equity"
    for t in ("ZAG.TO", "BND", "SHY", "IEF"):
        assert m["asset_class"][t] == "bond" and not {"esg_unverified", "esg_unscreened_fund", "esg_screened"} & set(m["tags"][t])
    assert "real_estate" in m["tags"]["XRE.TO"] and "real_estate" in m["tags"]["VNQ"] and "thematic" in m["tags"]["ICLN"]
    assert "esg_screened" in m["tags"]["ESGV"]  # seul fonds avec un filtre documenté
    assert [t for t in m["tags"] if "esg_screened" in m["tags"][t]] == ["ESGV"]
    assert not any(t.endswith("-USD") for t in uni.index[uni["source"] == "extended"])  # aucune nouvelle cryptomonnaie


def test_persona_logic_with_new_tickers(merged):
    from alphaforge import feed, questionnaire as q

    prices, uni = merged
    meta = data.starter_metadata(uni)
    for name in ("Robert", "Mateo", "Amira"):
        declared = q.build_declared(q.PERSONAS[name]["answers"], scenarios=q.load_scenarios(ROOT / q.SCENARIOS_FILE))
        profile, _ = q.to_profile(declared, name)
        if name == "Robert":
            assert feed.is_avoided("BTC-USD", profile, meta) and not feed.is_avoided("V", profile, meta) and not feed.is_excluded("V", profile, meta)
        if name == "Mateo":  # critère strict : toute société individuelle sans preuve est exclue, aussi les nouvelles
            assert all(feed.is_excluded(t, profile, meta) for t in ("V", "BMO.TO", "AVGO")) and not feed.is_excluded("ZAG.TO", profile, meta)
            assert feed.is_avoided("VFV.TO", profile, meta) and not feed.is_excluded("VFV.TO", profile, meta)
        if name == "Amira":  # intérêt « technologies » : les nouveaux titres du secteur comptent
            assert feed.is_interest("AVGO", profile, meta) and feed.is_interest("GIB-A.TO", profile, meta) and not feed.is_interest("KO", profile, meta)


def test_source_finder_and_fact_checker_name_the_right_source():
    from alphaforge.pipeline import data_collector, fact_checker, source_finder

    srcs = source_finder.find_sources("AVGO")
    assert [s["id"] for s in srcs][0] == "extended" and "yfinance" in [s["id"] for s in srcs] and "starter" not in [s["id"] for s in srcs]
    assert "pas un fichier des organisateurs" in srcs[0]["chosen_because"] or "ReelBroker" in srcs[0]["chosen_because"]
    assert next(s for s in srcs if s["id"] == "yfinance")["chosen_because"].startswith("Même fournisseur")
    assert "sec_edgar" in [s["id"] for s in source_finder.find_sources("V")] and "sedar_plus" in [s["id"] for s in source_finder.find_sources("BMO.TO")]
    assert source_finder.find_sources("AAPL")[0]["id"] == "starter"  # le jeu de départ reste primaire
    series, meta = data_collector.collect("AVGO", srcs, use_network=False)
    assert meta["source_id"] == "extended" and meta["currency"] == "CAD" and meta["fact_check"]["passed"] and meta["n_obs"] > 1200
    assert any("notre propre extraction" in n or "pas des organisateurs" in n or "ne viennent pas des organisateurs" in n for n in meta["notes"])
    assert not fact_checker.check_source(source_finder.REGISTRY["starter"], "AVGO")["passed"]  # AVGO n'est pas dans le jeu de départ


def test_extended_and_yfinance_cross_check_is_declared_not_independent(monkeypatch):
    from alphaforge.pipeline import data_collector, source_finder

    s0, _ = data_collector._fetch_extended("AVGO")[0], None
    df = pd.DataFrame({"Close": s0.to_numpy()}, index=s0.index)
    monkeypatch.setattr(data_collector, "_download_yf", lambda t: df)
    monkeypatch.setattr(data_collector, "_yf_currency", lambda t: "CAD")
    monkeypatch.setattr(data_collector, "CACHE_DIR", Path(__file__).parent / "_nocache_tmp")
    _, meta = data_collector.collect("AVGO", source_finder.find_sources("AVGO"), use_network=True)
    names = {c["name"]: c for c in meta["fact_check"]["checks"]}
    assert "recoupement_independant" in names and "Non applicable" in names["recoupement_independant"]["detail"]
    assert "concordance_deux_sources" not in names and meta["source_id"] == "extended"
    import shutil
    shutil.rmtree(Path(__file__).parent / "_nocache_tmp", ignore_errors=True)
