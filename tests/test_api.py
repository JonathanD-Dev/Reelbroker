"""Tests de l'API HTTP (FastAPI TestClient), sans AWS."""
import json

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")
from fastapi.testclient import TestClient  # noqa: E402

CARD_KEYS = {"ticker", "name", "sector", "asset_class", "currency", "price", "as_of", "brandColor", "fit", "reasons", "history", "stats", "tags", "source"}


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    mp = pytest.MonkeyPatch()
    for k in ("AWS_BEARER_TOKEN_BEDROCK", "AWS_ACCESS_KEY_ID", "AWS_PROFILE", "AWS_WEB_IDENTITY_TOKEN_FILE"):
        mp.delenv(k, raising=False)
    mp.setenv("ALPHAFORGE_PROFILES", str(tmp_path_factory.mktemp("api") / "profiles.json"))
    from alphaforge import agents, pipeline
    mp.setattr(agents, "load_env", lambda *a, **k: None)  # .env ignoré : aucun appel réel à Bedrock
    mp.setattr(pipeline, "CACHE_DIR", tmp_path_factory.mktemp("pcache"))  # le vrai cache disque n'est ni lu ni vidé
    from alphaforge import api
    api._LOADED = False
    api._PROFILES.clear()
    with TestClient(api.app) as c:
        yield c
    mp.undo()


@pytest.fixture(scope="module")
def pids(client):
    return {p: client.post("/api/profile", json={"persona": p}).json()["profile_id"] for p in ("amira", "mateo", "robert")}


def test_health(client):
    r = client.get("/api/health").json()
    assert r["ok"] and r["data_as_of"] == "2026-11-12" and r["bedrock"]["connected"] is False and r["version"]


def test_personas(client):
    r = client.get("/api/personas").json()
    assert [p["id"] for p in r] == ["amira", "mateo", "robert"] and all(p["summary"] and p["name"] for p in r)


def test_questionnaire_flow_with_persona_answers(client):
    from alphaforge import questionnaire as q
    answers = {}
    asked = []
    for _ in range(30):
        r = client.get("/api/questionnaire/next", params={"answers": json.dumps(answers)}).json()
        if r["done"]:
            break
        qs = r["question"]
        assert {"id", "level", "type", "element", "text", "choices"} <= set(qs) and qs["text"]
        asked.append(qs["id"])
        answers[qs["id"]] = q.PERSONAS["Robert"]["answers"][qs["id"]]
    assert r["done"] and "P5" in asked and "C1" in asked
    first_portfolio = client.get("/api/questionnaire/next", params={"answers": "{}", "scope": "portfolio"}).json()["question"]["id"]
    assert first_portfolio == "P1"
    # un profil se construit à partir de ces réponses
    p = client.post("/api/profile", json={"answers": answers, "name": "Test"})
    assert p.status_code == 200 and p.json()["profile"]["level"] >= 1


@pytest.mark.parametrize("persona", ["amira", "mateo", "robert"])
def test_create_profile_each_persona(client, persona):
    r = client.post("/api/profile", json={"persona": persona}).json()
    assert r["profile_id"] and r["name"].lower() == persona
    p = r["profile"]
    assert {"objective", "horizon_years", "risk_tolerance", "risk_capacity", "level", "level_label", "excluded", "preferred", "avoided"} <= set(p)
    assert r["reasoning"] and isinstance(r["contradictions"], list) and isinstance(r["notes"], list) and r["declared"]["portfolio"]
    if persona == "robert":
        assert p["level"] == 2


def test_profiles_persisted(client, pids):
    from alphaforge import api
    saved = json.loads(api.profiles_path().read_text(encoding="utf-8"))
    assert {e["id"] for e in saved["profiles"]} >= set(pids.values())


def test_feed_cards_have_contract_keys(client, pids):
    r = client.get("/api/feed", params={"profile_id": pids["amira"], "limit": 20}).json()
    assert len(r["items"]) == 20 and set(r["state"]) == {"liked", "disliked", "neutral", "hidden", "saved"}
    for c in r["items"]:
        assert CARD_KEYS <= set(c)
        assert c["brandColor"].startswith("#") and len(c["brandColor"]) == 7
        assert c["fit"]["verdict"] in ("compatible", "tension", "conflict") and c["reasons"]
        h0, h1 = c["history"]
        assert h0["title"] == "Cours (12 mois)" and 40 <= len(h0["points"]) <= 53 and h1["title"] == "Valeur de 10 000 $ sur 5 ans"
        assert abs(h1["points"][0]["value"] - 10000) < 1
        assert {"cagr", "vol", "max_drawdown", "sharpe", "worst_1y", "window"} <= set(c["stats"])
    assert [c["brandColor"] for c in r["items"]][:2] == [c["brandColor"] for c in client.get("/api/feed", params={"profile_id": pids["amira"], "limit": 2}).json()["items"]]


def test_react_changes_state_and_hides(client, pids):
    pid = pids["mateo"]
    items = client.get("/api/feed", params={"profile_id": pid, "limit": 20}).json()["items"]
    a, b, c = (x["ticker"] for x in items[:3])
    assert a in client.post("/api/feed/react", json={"profile_id": pid, "ticker": a, "action": "like"}).json()["state"]["liked"]
    assert b in client.post("/api/feed/react", json={"profile_id": pid, "ticker": b, "action": "save"}).json()["state"]["saved"]
    st = client.post("/api/feed/react", json={"profile_id": pid, "ticker": c, "action": "hide"}).json()["state"]
    assert c in st["hidden"]
    tickers = [x["ticker"] for x in client.get("/api/feed", params={"profile_id": pid, "limit": 100}).json()["items"]]
    assert c not in tickers and a not in tickers  # masqué et déjà vu : le fil avance
    st = client.post("/api/feed/react", json={"profile_id": pid, "ticker": c, "action": "unhide"}).json()["state"]
    assert c not in st["hidden"]
    tickers = [x["ticker"] for x in client.get("/api/feed", params={"profile_id": pid, "limit": 100}).json()["items"]]
    assert c in tickers


def test_card_details(client, pids):
    pid = pids["robert"]
    t = client.get("/api/feed", params={"profile_id": pid, "limit": 1}).json()["items"][0]["ticker"]
    r = client.get(f"/api/card/{t}", params={"profile_id": pid, "quantity": 10})
    assert r.status_code == 200
    r = r.json()
    assert r["card"]["ticker"] == t and {"weight", "fit", "before", "after", "notes"} <= set(r["impact"])
    o = r["outlook"]
    assert o["horizon_years"] == 5 and o["quantity"] == 10 and o["currency"] == "CAD" and o["disclaimer"] and o["method"] and o["limits"]
    sc = o["scenarios"]
    for k in ("best", "central", "worst"):
        assert len(sc[k]["path"]) == 61 and sc[k]["path"][0]["month"] == 0 and sc[k]["path"][-1]["month"] == 60
    assert sc["worst"]["path"][-1]["value"] <= sc["central"]["path"][-1]["value"] <= sc["best"]["path"][-1]["value"]
    assert abs(sc["central"]["path"][0]["value"] - o["start_value"]) < 0.01 and sc["central"]["label"] == "Notre scénario central"
    pl = r["pipeline"]
    assert {"sources", "fact_check", "data", "explanation", "trace"} <= set(pl) and pl["explanation"]["mode"] in ("offline", "bedrock")
    assert isinstance(pl["fact_check"]["passed"], bool)


def test_pipeline_run(client):
    r = client.post("/api/pipeline/run", json={"ticker": "SPY", "force_offline": True})
    assert r.status_code == 200 and {"outlook", "pipeline"} <= set(r.json())


def test_check_robert_tesla_conflict(client, pids):
    r = client.post("/api/check", json={"profile_id": pids["robert"], "text": "Je veux mettre 20 % dans Tesla"})
    assert r.status_code == 200
    r = r.json()
    assert r["ok"] and r["ticker"] == "TSLA" and r["verdict"] == "conflict"
    assert r["explanation"]["long"] and "passed" in r["explanation"]["governance"] and r["max_weight_within_profile"] < 0.2


def test_check_structured_and_unparseable(client, pids):
    r = client.post("/api/check", json={"profile_id": pids["amira"], "ticker": "SPY", "weight": 0.05, "choice": "keep"})
    assert r.status_code == 200 and r.json()["verdict"] in ("compatible", "tension", "conflict")
    r = client.post("/api/check", json={"profile_id": pids["amira"], "text": "bonjour"}).json()
    assert r["ok"] is False and r["message"]


def test_purchase_simulated_and_learn(client, pids):
    pid = pids["robert"]
    r = client.post("/api/purchase", json={"profile_id": pid, "tickers": ["SPY"], "weight": 0.05})
    assert r.status_code == 200 and r.json()["simulated"] is True and r.json()["notice"]
    lr = client.get(f"/api/profile/{pid}/learn")
    assert lr.status_code == 200
    j = lr.json()
    assert {"declared", "revealed", "status", "messages"} <= set(j) and j["status"] in ("insufficient", "aligned", "riskier", "more_cautious", "exceeds_limits")


def test_errors_404_422(client, pids):
    pid = pids["amira"]
    assert client.get("/api/feed", params={"profile_id": "nope"}).status_code == 404
    assert client.get("/api/card/ZZZZ", params={"profile_id": pid}).status_code == 404
    assert client.get("/api/card/SPY", params={"profile_id": "nope"}).status_code == 404
    assert client.get("/api/profile/nope/learn").status_code == 404
    assert client.post("/api/feed/react", json={"profile_id": pid, "ticker": "ZZZZ", "action": "like"}).status_code == 404
    assert client.post("/api/feed/react", json={"profile_id": pid, "ticker": "SPY", "action": "buy"}).status_code == 422
    assert client.post("/api/profile", json={}).status_code == 422
    assert client.post("/api/profile", json={"persona": "zoe"}).status_code == 422
    assert client.post("/api/profile", json={"answers": {"XX": "a"}}).status_code == 422
    assert client.get("/api/questionnaire/next", params={"answers": "pas du json"}).status_code == 422
    assert client.get("/api/questionnaire/next", params={"answers": '{"ZZ":1}'}).status_code == 422
    assert client.post("/api/check", json={"profile_id": pid}).status_code == 422
    assert client.post("/api/check", json={"profile_id": pid, "ticker": "SPY"}).status_code == 422
    assert client.post("/api/check", json={"profile_id": pid, "ticker": "SPY", "weight": 5}).status_code == 422
    assert client.post("/api/purchase", json={"profile_id": pid, "tickers": [], "weight": 0.05}).status_code == 422
    assert client.post("/api/purchase", json={"profile_id": pid, "tickers": ["ZZZZ"], "weight": 0.05}).status_code == 404
    assert client.get("/api/feed", params={"profile_id": pid, "limit": 0}).status_code == 422


def test_persona_ids_stable_and_idempotent(client, pids):
    assert pids == {"amira": "amira", "mateo": "mateo", "robert": "robert"}
    r = client.post("/api/profile", json={"persona": "robert"}).json()
    assert r["profile_id"] == "robert"
    client.post("/api/feed/react", json={"profile_id": "robert", "ticker": "SPY", "action": "save"})
    assert "SPY" in client.get("/api/feed", params={"profile_id": "robert", "limit": 1}).json()["state"]["saved"]
    client.post("/api/profile", json={"persona": "robert", "reset": True})
    assert client.get("/api/feed", params={"profile_id": "robert", "limit": 1}).json()["state"]["saved"] == []


def test_warmup_feed_fast_and_details_cached(client):
    import time
    from alphaforge import api
    client.post("/api/profile", json={"persona": "amira", "reset": True})
    api._FUTURES[api._ctx_key(api._PROFILES["amira"])].result(timeout=60)
    t0 = time.time()
    items = client.get("/api/feed", params={"profile_id": "amira", "limit": 20}).json()["items"]
    assert time.time() - t0 < 1.0 and len(items) == 20
    t = items[0]["ticker"]
    for _ in range(120):  # détails préchauffés en arrière-plan
        if any(k[1] == t for k in api._DETAILS):
            break
        time.sleep(1)
    t0 = time.time()
    r = client.get(f"/api/card/{t}", params={"profile_id": "amira"}).json()
    assert time.time() - t0 < 0.5 and r["pipeline"]["sources"] and r["pipeline"]["fact_check"]["passed"] is True
    assert r["outlook"].get("sensitivity") and r["outlook"].get("sensitivity_summary") and "beta" in r["outlook"]["history"]


def test_cache_hits_identical_to_uncached(client):
    """Les caches (covariance, scénario aligné seul) ne changent aucun résultat."""
    import numpy as np
    import pandas as pd
    from alphaforge import api, decide, metrics as m
    from alphaforge.allocate import allocate
    d = api.data()
    rec = api._PROFILES["robert"]
    weights = api._ctx(rec)["base"]
    # 1. covariance en cache == covariance recalculée ; volatilité seule == volatilité du calcul complet
    cols = tuple(weights)
    fresh = m.cov_matrix(m.returns(d.prices[list(cols)].dropna()))
    for _ in range(2):  # miss puis hit
        pd.testing.assert_frame_equal(decide._cov_for(d.prices, cols), fresh, rtol=0, atol=1e-15)
    assert decide._vol_only(d.prices, weights) == pytest.approx(decide._ex_ante_vol(d.prices, weights)[0], abs=1e-12)
    # 2. scénario aligné seul == scénario aligné de decide.options
    aligned = next(o for o in decide.options(d.prices, rec.profile, d.meta) if o["key"] == "aligned")
    assert aligned["result"]["weights"] == weights
    # 3. deux lectures du fil (cache chaud) sont identiques
    a = client.get("/api/feed", params={"profile_id": "robert", "limit": 20}).json()
    b = client.get("/api/feed", params={"profile_id": "robert", "limit": 20}).json()
    assert a == b
    # 4. détails en cache == détails recalculés
    t = a["items"][0]["ticker"]
    d1 = client.get(f"/api/card/{t}", params={"profile_id": "robert"}).json()
    api._DETAILS.clear()
    d2 = client.get(f"/api/card/{t}", params={"profile_id": "robert"}).json()
    assert d1["outlook"] == d2["outlook"] and d1["impact"] == d2["impact"] and d1["card"] == d2["card"]


def test_health_reports_warm(client):
    w = client.get("/api/health").json()["warm"]
    assert set(w) == {"amira", "mateo", "robert"} and set(w.values()) <= {"ready", "building"}


def test_tolerance_update_robert(client):
    client.post("/api/profile", json={"persona": "robert", "reset": True})
    assert client.post("/api/profile/robert/tolerance", json={"level": 4}).status_code == 409  # aucun signal : refusé sans confirmation
    for _ in range(3):
        r = client.post("/api/check", json={"profile_id": "robert", "ticker": "TSLA", "weight": 0.2, "choice": "keep"})
        assert r.status_code == 200
    lr = client.get("/api/profile/robert/learn").json()
    assert lr["update_to"] == 4 and lr["declared"] == 3 and lr["retained_level"] == 2
    assert client.post("/api/profile/robert/tolerance", json={"level": 5}).status_code == 409
    assert client.post("/api/profile/robert/tolerance", json={"level": 6}).status_code == 422
    r = client.post("/api/profile/robert/tolerance", json={"level": 4})
    assert r.status_code == 200
    r = r.json()
    assert r["learn"]["declared"] == 4 and r["profile"]["risk_tolerance"] == 4 and r["profile"]["level"] == 2 and r["learn"]["retained_level"] == 2
    assert client.get("/api/profile/robert").json()["profile"]["risk_tolerance"] == 4
    assert len(client.get("/api/feed", params={"profile_id": "robert"}).json()["items"]) > 0  # fil recalculé
    assert client.post("/api/profile/nope/tolerance", json={"level": 3}).status_code == 404
    assert client.post("/api/profile/robert/tolerance", json={"level": 3, "confirm": True}).status_code == 200
    client.post("/api/profile", json={"persona": "robert", "reset": True})


def test_concurrent_check_and_tolerance_no_deadlock(client):
    import threading
    client.post("/api/profile", json={"persona": "robert", "reset": True})
    out, errs = {}, []

    def do_check(i):
        try:
            out[f"c{i}"] = client.post("/api/check", json={"profile_id": "robert", "ticker": "SPY", "weight": 0.05}).status_code
        except Exception as e:  # noqa: BLE001
            errs.append(e)

    def do_tol(level):
        try:
            out[f"t{level}"] = client.post("/api/profile/robert/tolerance", json={"level": level, "confirm": True}).status_code
        except Exception as e:  # noqa: BLE001
            errs.append(e)

    ths = [threading.Thread(target=do_check, args=(i,), daemon=True) for i in range(3)]
    ths += [threading.Thread(target=do_tol, args=(lv,), daemon=True) for lv in (3, 4)]
    ths.append(threading.Thread(target=lambda: client.post("/api/profile", json={"answers": {"P1": "growth"}, "name": "x"}), daemon=True))
    for t in ths:
        t.start()
    for t in ths:
        t.join(timeout=240)
    assert not any(t.is_alive() for t in ths), "blocage (deadlock)"
    assert not errs and all(v == 200 for v in out.values()), out
    client.post("/api/profile", json={"persona": "robert", "reset": True})


def test_record_only_idempotent_fast_and_learns(client):
    import time
    client.post("/api/profile", json={"persona": "robert", "reset": True})
    from alphaforge import api
    api._ctx(api._PROFILES["robert"])  # fil déjà préchauffé, comme en usage réel
    import threading
    for _ in range(240):  # aucun préchauffage en cours : sinon on mesure l'attente du verrou, pas la requête
        if not any(t.name == "af-warm" and t.is_alive() for t in threading.enumerate()):
            break
        time.sleep(1)
    body = {"profile_id": "robert", "ticker": "TSLA", "weight": 0.2, "choice": "keep", "record_only": True}
    t0 = time.time()
    r = client.post("/api/check", json={**body, "decision_id": "d1"}).json()
    assert time.time() - t0 < 1.0 and r["recorded"] is True and "explanation" not in r
    again = client.post("/api/check", json={**body, "decision_id": "d1"}).json()
    assert again["recorded"] is False and again["duplicate"] is True
    assert client.get("/api/profile/robert/learn").json()["revealed"]["n"] == 1
    client.post("/api/check", json={**body, "decision_id": "d2"})
    r = client.post("/api/check", json={**body, "decision_id": "d3"}).json()
    assert r["learn"]["update_to"] == 4 and r["learn"]["declared"] == 3 and r["learn"]["retained_level"] == 2
    # ajustement : sans poids fourni, la part enregistrée est la part maximale compatible avec le profil
    chk = client.post("/api/check", json={"profile_id": "robert", "ticker": "TSLA", "weight": 0.2}).json()
    adj = client.post("/api/check", json={**body, "choice": "adjust", "decision_id": "d4"}).json()
    assert f"{chk['max_weight_within_profile'] * 100:.0f} %" in adj["entry"]["decision"]
    assert client.post("/api/check", json={"profile_id": "robert", "record_only": True, "ticker": "TSLA", "weight": 0.2}).status_code == 422
    client.post("/api/profile", json={"persona": "robert", "reset": True})


# ---------------------------------------------------------------------------------------------------------------------
# Univers étendu : un nouveau titre apparaît dans le fil d'un persona et sa fiche fonctionne (pipeline hors ligne)
# ---------------------------------------------------------------------------------------------------------------------
def test_extended_ticker_in_feed_and_card(client, pids, monkeypatch):
    from alphaforge import api

    if "source" not in api.data().universe.columns or not (api.data().universe["source"] == "extended").any():
        pytest.skip("univers étendu absent")
    monkeypatch.setattr(api, "_offline", lambda: True)  # aucun appel Bedrock dans ce test
    for pid in ("amira", "robert"):
        items = client.get("/api/feed", params={"profile_id": pids[pid], "limit": 100, "include_seen": True}).json()["items"]
        assert len(items) == 91 and {"AVGO", "BMO.TO", "ZAG.TO"} <= {i["ticker"] for i in items}
    mateo = client.get("/api/feed", params={"profile_id": pids["mateo"], "limit": 100, "include_seen": True}).json()["items"]
    mt = {i["ticker"] for i in mateo}
    assert {"ZAG.TO", "SHY"} <= mt and "AVGO" not in mt and "V" not in mt  # sociétés sans preuve ESG exclues pour Mateo, y compris les nouvelles
    r = client.get("/api/card/AVGO", params={"profile_id": pids["amira"], "quantity": 5})
    assert r.status_code == 200
    j = r.json()
    assert CARD_KEYS <= set(j["card"]) and j["card"]["ticker"] == "AVGO" and "univers étendu" in j["card"]["source"] and j["card"]["currency"] == "CAD"
    assert j["pipeline"]["data"]["source_id"] == "extended"
    assert [s["id"] for s in j["pipeline"]["sources"]][0] == "extended" and j["pipeline"]["fact_check"]["passed"]
    assert len(j["outlook"]["scenarios"]["central"]["path"]) == 61
    assert client.get("/api/card/ZZZZ", params={"profile_id": pids["amira"]}).status_code == 404
