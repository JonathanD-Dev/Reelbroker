import warnings

import pytest

import alphaforge as af
from alphaforge import questionnaire as q

warnings.filterwarnings("ignore")


def walk(answers):
    """Rejoue le parcours et retourne les questions posées, dans l'ordre."""
    a, asked = {}, []
    while (qid := q.next_question(a)) is not None:
        asked.append(qid)
        a[qid] = answers.get(qid, "skipped")
    return asked


def test_minimal_path_is_ten_questions():
    asked = walk({"C1": "permanent", "C2": "gt_6m", "C4": ["none"], "P4": "none", "P5": "sell_all"})
    assert asked == ["C1", "C2", "C3", "C4", "C6", "C5", "P1", "P2", "P3", "P4", "P5"]


def test_adaptive_branches():
    asked = walk({"C1": "self_employed", "C2": "lt_1m", "C4": ["crypto"], "P4": "lump_sum", "P5": "hold"})
    assert {"C1a", "C2a", "C4a", "P4a_when", "P4a_share", "P5a"} <= set(asked)
    assert "P4f" not in asked and asked.index("P3") < asked.index("P5")


def test_second_portfolio_skips_account():
    a = dict(q.PERSONAS["Robert"]["answers"])
    for k in q.PORTFOLIO_ORDER:
        a.pop(k, None)
    assert q.next_question(a) == "P1"


def test_withdrawal_date_limited_to_horizon():
    codes = [c for c, _ in q.choices_for("P4a_when", {"P2": "3_5y"})]
    assert codes == ["lt_1y", "1_3y", "3_5y", "unknown"]


def test_tolerance_table():
    t = q.declared_tolerance
    assert [t("sell_all", None), t("sell_part", None), t("hold", "sell_part"), t("hold", "hold"), t("add", "add"), t("add", "sell_all"), t("unknown", None)] == \
        ["low", "low_to_moderate", "moderate", "moderate_to_high", "high", "moderate", None]


def test_scenario_text_uses_real_numbers_or_says_fictional():
    sc = q.load_scenarios()
    if sc:
        s = sc["scenarios"]["reference_equilibre"]
        text = q.question_text("P5", {"P3": "10k_50k"}, sc)
        assert q.fr_pct(s["baisse_max"]) in text and q.fr_money(30000 * abs(s["baisse_max"])) in text
    assert q.question_text("P5", {}, None).startswith("Scénario fictif")
    assert "montant d'illustration" in q.question_text("P5", {}, None)


def test_contradictions_and_missing():
    a = {"C1": "permanent", "C2": "lt_1m", "C2a": ["none"], "C3": "unknown", "C4": ["none"], "C5": "brief",
         "P1": "preserve", "P2": "1_3y", "P3": "skipped", "P4": "none", "P5": "add", "P5a": "sell_part"}
    d = q.build_declared(a)
    assert {c["code"] for c in d["contradictions"]} == {"cushion_vs_withdrawals", "staircase_inconsistent"}
    assert {m["question"] for m in d["missing"]} == {"C3", "P3"} and d["status"] == "complete"
    a.update(P5="hold", P5a="hold")
    assert {"tolerance_vs_horizon", "tolerance_vs_objective"} <= {c["code"] for c in q.build_declared(a)["contradictions"]}


def test_high_tolerance_never_overrides_low_capacity():
    a = {"C1": "none_regular", "C2": "lt_1m", "C2a": ["debt"], "C3": "advanced", "C4": ["none"], "C5": "brief",
         "P1": "growth", "P2": "gt_15y", "P3": "skipped", "P4": "none", "P5": "add", "P5a": "add"}
    profile, notes = q.to_profile(q.build_declared(a))
    assert profile.risk_tolerance == 5 and profile.risk_capacity == 1 and profile.effective_risk() == 1


@pytest.mark.parametrize("name,level", [("Amira", 4), ("Mateo", 3), ("Robert", 2)])
def test_personas_reach_expected_risk_level(name, level):
    d = q.build_declared(q.PERSONAS[name]["answers"])
    profile, _ = q.to_profile(d, name)
    assert d["status"] == "complete" and profile.effective_risk() == level


def test_personas_on_real_data():
    if not af.data.STARTER_DIR.exists():
        pytest.skip("jeu de départ absent")
    px, u = af.load_starter()
    meta = af.starter_metadata(u)
    vols = {}
    for name in q.PERSONAS:
        profile, _ = q.to_profile(q.build_declared(q.PERSONAS[name]["answers"]), name)
        res = af.allocate(px, profile, **meta)
        b, w = profile.budget(), res["weights"]
        vols[name] = res["ex_ante_vol"]
        assert 0.85 * b["max_vol"] - 0.01 <= res["ex_ante_vol"] <= b["max_vol"] + 5e-3
        assert all(x <= meta["single_caps"].get(t, 1) + 1e-6 for t, x in w.items())
        assert all(x <= b["max_single_weight"] + 1e-6 for t, x in w.items() if meta["asset_class"][t] != "cash")
    assert vols["Robert"] < vols["Mateo"] < vols["Amira"]
