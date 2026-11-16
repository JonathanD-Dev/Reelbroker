"""GET /api/hypotheses : les valeurs sont exactement les constantes du code."""
import pytest

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402


def test_hypotheses_equal_constants(tmp_path, monkeypatch):
    monkeypatch.setenv("ALPHAFORGE_PROFILES", str(tmp_path / "p.json"))
    from alphaforge import api, data as dt, learn, metrics as mt
    from alphaforge.allocate import PREF_FLOOR
    from alphaforge.pipeline import predictor as pr
    from alphaforge.profile import RISK_BUDGET
    api._LOADED = False
    with TestClient(api.app) as c:
        items = c.get("/api/hypotheses").json()
    assert items and all({"group", "label", "value", "value_fr", "source", "code_ref"} == set(i) for i in items)
    assert all(i["source"] in ("hypothèse", "donnée", "règle") for i in items)
    by = {}
    for i in items:
        by.setdefault(i["code_ref"], []).append(i)
    rb = by["alphaforge/profile.py:RISK_BUDGET"]
    assert [i["value"] for i in rb if "volatilité" in i["label"]] == [b["max_vol"] for b in RISK_BUDGET.values()]
    assert [i["value"] for i in rb if "croissance" in i["label"]] == [b["max_growth_assets"] for b in RISK_BUDGET.values()]
    assert {i["label"]: i["value"] for i in by["alphaforge/data.py:SINGLE_CAPS"]} == {"Plafond par société": dt.SINGLE_CAPS["equity"],
                                                                                      "Plafond par cryptoactif": dt.SINGLE_CAPS["crypto"]}
    one = lambda ref: by[ref][0]["value"]  # noqa: E731
    assert one("alphaforge/data.py:SECTOR_CAP") == dt.SECTOR_CAP and one("alphaforge/allocate.py:PREF_FLOOR") == PREF_FLOOR
    assert one("alphaforge/metrics.py:RISK_FREE") == mt.RISK_FREE
    assert one("alphaforge/learn.py:WINDOW") == learn.WINDOW and one("alphaforge/learn.py:MIN_DECISIONS") == learn.MIN_DECISIONS
    assert one("alphaforge/pipeline/predictor.py:ERP") == pr.ERP and one("alphaforge/pipeline/predictor.py:SHRINK") == pr.SHRINK
    assert one("alphaforge/pipeline/predictor.py:BLOCK_MONTHS") == pr.BLOCK_MONTHS
    assert one("alphaforge/profile.py:InvestorProfile.max_single_weight") == 0.35 and one("alphaforge/allocate.py:allocate.vol_floor_ratio") == 0.85
    labels = " ".join(i["label"] for i in items)
    assert "CNQ.TO" in labels and "survivant" in labels and "ESG" in labels
