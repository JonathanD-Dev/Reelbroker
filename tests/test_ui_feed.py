"""Aide de l'interface du fil : événements, persistance, charges utiles pour le composant, logique JavaScript (via Node)."""
import json
import math
import re
import shutil
import subprocess
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

import alphaforge as af
from alphaforge import agents as ag
from alphaforge import decide as d
from alphaforge import feed
from alphaforge import questionnaire as q
from alphaforge import ui_feed as ui

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parent.parent
NODE = shutil.which("node") or ("/c/Program Files/nodejs/node" if Path("C:/Program Files/nodejs/node.exe").exists() else None)
needs_data = pytest.mark.skipif(not af.data.STARTER_DIR.exists(), reason="jeu de départ absent")


def store():
    return {"feed_state": feed.new_state(), "feed_ui": ui.new_ui()}


def ev(n, typ, ticker="AAPL", **kw):
    return {"nonce": f"s:{n}", "type": typ, "ticker": ticker, **kw}


# ---------------------------------------------------------------- json_safe
def test_json_safe_removes_numpy_nan_and_timestamps():
    obj = {"a": np.float64(1.5), "b": np.int64(3), "c": float("nan"), "d": np.inf, "e": [np.float32(2.0), (1, 2)], "f": pd.Timestamp("2026-01-02"),
           "g": np.bool_(True), "h": {"x": np.array([1.0, np.nan])}, "i": {"b", "a"}, 5: "cle"}
    out = ui.json_safe(obj)
    text = json.dumps(out, allow_nan=False)  # lève une erreur si NaN ou inf subsiste
    assert out["a"] == 1.5 and out["c"] is None and out["d"] is None and out["f"] == "2026-01-02" and out["g"] is True
    assert out["h"]["x"] == [1.0, None] and out["i"] == ["a", "b"] and out["5"] == "cle" and isinstance(text, str)


# ---------------------------------------------------------------- événements
def test_each_event_type_effect_on_state():
    s = store()
    st, u = s["feed_state"], s["feed_ui"]
    assert ui.handle_event(s, ev(1, "like"))["status"] == "ok" and st["liked"] == ["AAPL"]
    ui.handle_event(s, ev(2, "dislike"))
    assert st["liked"] == [] and st["disliked"] == ["AAPL"]
    ui.handle_event(s, ev(3, "neutral"))
    assert st["disliked"] == [] and st["neutral"] == ["AAPL"]
    ui.handle_event(s, ev(4, "save"))
    assert st["saved"] == ["AAPL"]
    ui.handle_event(s, ev(5, "unsave"))
    assert st["saved"] == []
    r = ui.handle_event(s, ev(6, "hide", "MSFT"))
    assert st["hidden"] == ["MSFT"] and r["persist"] is True
    r = ui.handle_event(s, ev(7, "expand", "NVDA"))
    assert u["expanded"] == "NVDA" and r["need"] == "detail" and r["persist"] is False
    ui.handle_event(s, ev(8, "like", "NVDA"))
    assert u["expanded"] is None  # une réaction referme la carte
    r = ui.handle_event(s, ev(9, "simulate_purchase", "TSLA"))
    assert r["navigate"] == "Ma liste" and st["saved"] == ["TSLA"] and u["selection"] == ["TSLA"]
    assert u["last_nonce"] == "s:9"


def test_nonce_deduplication():
    s = store()
    e = ev(1, "like")
    assert ui.handle_event(s, e)["status"] == "ok"
    assert ui.handle_event(s, e)["status"] == "duplicate"
    ui.handle_event(s, ev(2, "dislike"))
    r = ui.handle_event(s, e)  # l'ancien « J'aime » rejoué ne doit pas défaire le « Je n'aime pas »
    assert r["status"] == "duplicate" and s["feed_state"]["disliked"] == ["AAPL"] and s["feed_state"]["liked"] == []
    # la valeur persistante du composant, relue à chaque exécution, ne change rien
    value = {"events": [ev(1, "like"), ev(2, "dislike")]}
    out = ui.process_events(s, value)
    assert out["changed"] is False and out["results"][0]["status"] == "duplicate"


def test_process_events_batch_order_and_acks():
    s = store()
    value = {"events": [ev(1, "like", "AAPL"), ev(2, "save", "AAPL"), ev(3, "expand", "NVDA"), ev(4, "set_weight", "NVDA", weight=10),
                        ev(5, "simulate_purchase", "XOM"), {"nonce": "s:6", "type": "teleport", "ticker": "AAPL"}]}
    out = ui.process_events(s, value)
    assert out["changed"] and out["persist"] and out["navigate"] == "Ma liste"
    assert out["needs"] == [("detail", "NVDA"), ("impact", "NVDA")]
    assert s["feed_state"]["liked"] == ["AAPL"] and s["feed_state"]["saved"] == ["AAPL", "XOM"]
    assert s["feed_ui"]["weights"]["NVDA"] == 0.10
    assert "s:6" in s["feed_ui"]["acked"] and "s:6" not in s["feed_ui"]["nonces"]  # événement ignoré mais accusé de réception


def test_invalid_events_are_ignored_without_error():
    s = store()
    for bad in (None, 3, {}, {"nonce": "x"}, {"nonce": "x", "type": "like"}, {"nonce": "", "type": "like", "ticker": "A"}, {"nonce": "x", "type": "boom", "ticker": "A"},
                {"nonce": "x", "type": "like", "ticker": 5}, ev(1, "set_weight", weight="abc"), ev(2, "set_weight", weight=float("nan"))):
        assert ui.handle_event(s, bad)["status"] == "invalid"
    assert ui.handle_event(s, ev(3, "like", "ZZZZ"), valid_tickers={"AAPL"})["status"] == "invalid"
    assert s["feed_state"] == feed.new_state()
    for v in (None, {}, {"events": "x"}, "texte", 3):
        assert ui.process_events(s, v)["changed"] is False


def test_weight_is_clamped_to_1_50():
    s = store()
    for n, (given, want) in enumerate([(0, 1), (-5, 1), (7.4, 7), (10, 10), (999, 50), ("12", 12)], start=1):
        ui.handle_event(s, ev(n, "set_weight", "AAPL", weight=given))
        assert s["feed_ui"]["weights"]["AAPL"] == want / 100
    assert ui.clamp_weight_pct(None) is None and ui.clamp_weight_pct(float("inf")) is None


def test_reactions_never_touch_limits():
    """Les réactions ne changent que les listes du fil : aucun champ de profil n'existe dans l'état."""
    s = store()
    ui.handle_event(s, ev(1, "like", "NVDA"))
    assert set(s["feed_state"]) == {"liked", "disliked", "neutral", "hidden", "saved", "purchases"}


# ---------------------------------------------------------------- persistance
def test_persistence_round_trip_and_profile_keys(tmp_path):
    p = tmp_path / "out" / "feed_state.json"
    st = feed.new_state()
    feed.react(st, "NVDA", "like")
    feed.react(st, "XOM", "dislike")
    feed.react(st, "AAPL", "save")
    st["purchases"].append({"date": "2026-11-14", "tickers": ["AAPL"], "weight_each": np.float64(0.05), "verdict": "compatible", "simulated": True})
    ui.save_state("Amira", st, p)
    st2 = feed.new_state()
    feed.react(st2, "GLD", "hide")
    ui.save_state("Robert", st2, p)
    back = ui.load_state("Amira", p)
    assert back["liked"] == ["NVDA"] and back["disliked"] == ["XOM"] and back["saved"] == ["AAPL"] and back["purchases"][0]["weight_each"] == 0.05
    assert ui.load_state("Robert", p)["hidden"] == ["GLD"]
    assert ui.load_state("Inconnu", p) == feed.new_state()
    raw = json.loads(p.read_text(encoding="utf-8"))
    assert set(raw["profiles"]) == {"Amira", "Robert"}
    ui.clear_state("Amira", p)
    assert ui.load_state("Amira", p) == feed.new_state() and ui.load_state("Robert", p)["hidden"] == ["GLD"]


def test_load_state_tolerates_corrupt_or_missing_file(tmp_path):
    p = tmp_path / "x.json"
    assert ui.load_state("A", p) == feed.new_state()
    p.write_text("{pas du json", encoding="utf-8")
    assert ui.load_state("A", p) == feed.new_state()
    p.write_text(json.dumps({"profiles": {"A": {"liked": "oups", "saved": [1, "AAPL"]}}}), encoding="utf-8")
    s = ui.load_state("A", p)
    assert s["liked"] == [] and s["saved"] == ["AAPL"]
    ui.save_state("A", s, p)  # un fichier corrompu se récupère à l'écriture
    p.write_text("[]", encoding="utf-8")
    ui.save_state("B", s, p)
    assert ui.load_state("B", p)["saved"] == ["AAPL"]


def test_state_file_env_override(monkeypatch, tmp_path):
    monkeypatch.setenv(ui.STATE_ENV, str(tmp_path / "e.json"))
    assert ui.state_file() == tmp_path / "e.json"
    monkeypatch.delenv(ui.STATE_ENV)
    assert ui.state_file() == ROOT / "outputs" / "feed_state.json"


# ---------------------------------------------------------------- charges utiles sur de vraies cartes
@pytest.fixture(scope="module")
def world():
    if not af.data.STARTER_DIR.exists():
        pytest.skip("jeu de départ absent")
    px, u = af.load_starter()
    meta = af.starter_metadata(u)
    out = {"px": px, "u": u, "meta": meta}
    for name in ("Amira", "Robert"):
        profile, _ = q.to_profile(q.build_declared(q.PERSONAS[name]["answers"]), name)
        base = next(o for o in d.options(px, profile, meta) if o["key"] == "aligned")["result"]["weights"]
        out[name] = (profile, base, ui.make_deck(px, u, meta, profile, base, 10000.0))
    return out


def strict_json(obj):
    return json.dumps(obj, allow_nan=False)


@needs_data
def test_deck_ranking_is_cheap_and_orders_by_verdict(world):
    import time

    px, u = world["px"], world["u"]
    prof, base, deck = world["Robert"]
    s = store()
    t0 = time.time()
    r = ui.ranked(deck, u, s["feed_state"], s["feed_ui"])
    assert time.time() - t0 < 1.5
    ranks = [feed.VERDICT_RANK[c["fit"]["verdict"]] for c in r]
    assert ranks == sorted(ranks) and len(r) == len(deck["cards"])
    top = r[0]["ticker"]
    ui.handle_event(s, ev(1, "like", top))
    after = ui.ranked(deck, u, s["feed_state"], s["feed_ui"])
    assert top not in [c["ticker"] for c in after]  # vu : sorti du fil
    assert all(a["fit"]["verdict"] == deck["cards"][a["ticker"]]["fit"]["verdict"] for a in after)  # verdicts intacts
    ui.handle_event(s, ev(2, "save", after[0]["ticker"]))
    assert after[0]["ticker"] in [c["ticker"] for c in ui.ranked(deck, u, s["feed_state"], s["feed_ui"])]  # un signet n'avance pas la carte
    s["feed_ui"]["include_seen"] = True
    assert top in [c["ticker"] for c in ui.ranked(deck, u, s["feed_state"], s["feed_ui"])]


@needs_data
@pytest.mark.parametrize("persona", ["Amira", "Robert"])
def test_front_payload_is_strict_json_and_french(world, persona):
    prof, base, deck = world[persona]
    for c in deck["cards"].values():
        p = ui.front_payload(c, "Texte court.", saved=True)
        strict_json(p)
        assert p["verdict_text"] in ui.VERDICT_TEXT.values() and "Achetez" not in strict_json(p)
        assert len(p["spark"]) >= 40 and all(isinstance(x, float) for x in p["spark"])
        assert all(re.search(r"\d\.\d", s["value"]) is None for s in p["stats"])  # virgule décimale
        assert p["impact"]["bars"][0]["before_label"].endswith("%") and p["impact"]["verdict"] == c["fit"]["verdict"]


@needs_data
def test_robert_conflict_card_is_unmistakably_labelled(world):
    prof, base, deck = world["Robert"]
    conflict = [c for c in deck["cards"].values() if c["fit"]["verdict"] == "conflict"]
    assert conflict, "Robert doit avoir au moins une carte en conflit (titre à la mode)"
    p = ui.front_payload(conflict[0], "x")
    assert p["verdict"] == "conflict" and "conflit" in p["verdict_text"].lower() and "recommandation" in p["verdict_sub"]


@needs_data
def test_scenario_payload_headlines_range_and_keeps_disclaimer(world):
    px = world["px"]
    sc = feed.scenarios_5y(px, "NVDA", 10000.0)
    p = ui.scenario_payload(sc)
    strict_json(p)
    assert p["p5_label"] in p["headline"] and p["p95_label"] in p["headline"] and p["disclaimer"] == feed.SCENARIO_DISCLAIMER
    assert p["p5"] < p["p50"] < p["p95"] and p["share_below"].endswith("%")
    assert "prévision" in p["disclaimer"].lower() and len(p["fan"]) >= 10
    assert not any(math.isnan(v) for f in p["fan"] for v in f.values())


@needs_data
def test_detail_and_impact_payloads_and_explanations(world):
    px, u, meta = world["px"], world["u"], world["meta"]
    prof, base, deck = world["Amira"]
    c = dict(deck["cards"]["NVDA"])
    c["scenarios"] = feed.scenarios_5y(px, "NVDA", 10000.0)
    expl = ag.explain_card(c, prof, level="standard", force_offline=True) if hasattr(ag, "explain_card") else None
    det = ui.detail_payload(c, expl)
    strict_json(det)
    assert det["scenarios"] and det["explanation"]["long"] and det["explanation"]["mode_label"]
    if expl:
        assert det["explanation"]["governance"] is not None
    # explication absente : repli sur les raisons calculées
    fb = ui.detail_payload(c, None)
    assert fb["explanation"]["long"] == "\n\n".join(c["reasons"]) and fb["explanation"]["governance"] is None
    imp = feed.impact_for_weight(px, u, meta, prof, base, "NVDA", 0.12, 10000.0)
    ip = ui.impact_payload(imp["impact"], imp["fit"], 0.12)
    strict_json(ip)
    assert ip["weight_pct"] == 12 and len(ip["bars"]) == 3 and ip["verdict"] in ui.VERDICT_TEXT
    args = ui.build_args([ui.front_payload(c, "t")], {"NVDA": det}, ["a:1"], ["AAPL"])
    strict_json(args)
    assert args["labels"]["like"] == "J'aime" and set(args) >= {"queue", "details", "acked", "saved", "labels"}


@needs_data
def test_saved_list_export(world):
    prof, base, deck = world["Amira"]
    st = feed.new_state()
    feed.react(st, "NVDA", "save")
    out = ui.saved_list_export("Amira", st, world["u"], deck["cards"])
    strict_json(out)
    assert out["saved"][0]["ticker"] == "NVDA" and out["simulation_only"] is True


# ---------------------------------------------------------------- JavaScript (Node)
@pytest.mark.skipif(NODE is None, reason="Node absent")
def test_js_logic():
    r = subprocess.run([NODE, str(ROOT / "tests" / "js" / "test_logic.js")], capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stdout + r.stderr


@pytest.mark.skipif(NODE is None, reason="Node absent")
def test_js_syntax():
    for f in ("logic.js", "app.js"):
        r = subprocess.run([NODE, "--check", str(ui.COMPONENT_DIR / f)], capture_output=True, text=True, timeout=60)
        assert r.returncode == 0, r.stderr
    assert (ui.COMPONENT_DIR / "index.html").exists() and "streamlit:componentReady" in (ui.COMPONENT_DIR / "app.js").read_text(encoding="utf-8")


@needs_data
@pytest.mark.skipif(NODE is None, reason="Node absent")
def test_js_component_smoke_with_real_payloads(world, tmp_path):
    px, u, meta = world["px"], world["u"], world["meta"]
    prof, base, deck = world["Robert"]
    s = store()
    queue = ui.ranked(deck, u, s["feed_state"], s["feed_ui"], n=5)
    fronts = [ui.front_payload(c, "Texte court de la carte.", False) for c in queue]
    c = dict(queue[0])
    c["scenarios"] = feed.scenarios_5y(px, c["ticker"], 10000.0)
    expl = ag.explain_card(c, prof, force_offline=True) if hasattr(ag, "explain_card") else None
    payload = ui.build_args(fronts, {}, [], [])
    payload["details_for_first"] = ui.detail_payload(c, expl)
    f = tmp_path / "payload.json"
    f.write_text(json.dumps(payload, allow_nan=False), encoding="utf-8")
    r = subprocess.run([NODE, str(ROOT / "tests" / "js" / "smoke_component.js"), str(f)], capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stdout + r.stderr
