"""Tests sans appel à AWS : outils, contrôle de gouvernance et mode hors ligne."""
import json
import warnings

import pytest

import alphaforge as af
from alphaforge import agents as ag
from alphaforge import decide as d
from alphaforge import questionnaire as q

warnings.filterwarnings("ignore")


@pytest.fixture(scope="module")
def base():
    if not af.data.STARTER_DIR.exists():
        pytest.skip("jeu de départ absent")
    px, u = af.load_starter()
    meta = af.starter_metadata(u)
    profile, _ = q.to_profile(q.build_declared(q.PERSONAS["Robert"]["answers"]), "Robert")
    opts = d.options(px, profile, meta)
    weights = next(o for o in opts if o["key"] == "aligned")["result"]["weights"]
    return px, u, meta, profile, weights, opts


@pytest.fixture
def ctx(base):
    px, u, meta, profile, weights, opts = base
    return ag.Context(px, u, meta, profile, weights, 10000.0, opts)


def test_tools_record_a_trace(ctx):
    out = json.loads(ctx.verifier_idee("tsla", 20))
    assert out["verdict"].startswith("En conflit") and out["portefeuille_apres"]["volatilite_estimee"] > out["limites_du_profil"]["max_vol"]
    ctx.profil(), ctx.mesures_titres(["NVDA", "XXX"]), ctx.comparer_options(), ctx.correlations(["SPY", "QQQ"])
    assert [t["outil"] for t in ctx.trace] == ["verifier_idee", "profil", "mesures_titres", "comparer_options", "correlations"]
    assert all(t["fenetre"] == ["2021-11-12", "2026-11-12"] for t in ctx.trace)
    assert ctx.trace[2]["sortie"]["introuvables"] == ["XXX"]


def test_unknown_ticker_returns_an_error_not_a_guess(ctx):
    assert "erreur" in json.loads(ctx.verifier_idee("GME", 5)) and ctx.last_check is None


def test_strands_tools_are_built(ctx):
    names = {t.tool_name for t in ag.build_tools(ctx)}
    assert names == {"profil", "lister_titres", "verifier_idee", "mesures_titres", "correlations", "comparer_options"}


def test_governance_accepts_numbers_from_the_trace(ctx):
    ctx.verifier_idee("TSLA", 20)
    after = ctx.trace[0]["sortie"]["portefeuille_apres"]
    vol = f"{after['volatilite_estimee'] * 100:.1f}".replace(".", ",")
    ok = ag.validate_explanation(f"Avec 20 % dans Tesla, la volatilité estimée passerait à {vol} %, au-dessus du plafond de 7 %.", ctx.trace)
    assert ok["passed"], ok


def test_governance_rejects_invented_numbers_and_advice(ctx):
    ctx.verifier_idee("TSLA", 20)
    bad = ag.validate_explanation("Tesla devrait rapporter 34,7 % l'an prochain.", ctx.trace)
    assert not bad["passed"] and bad["unknown_numbers"] == ["34,7"]
    for sentence in ("Je vous recommande ce titre.", "Vous devriez acheter Tesla.", "Achetez maintenant.", "Un rendement garanti.", "C'est sans risque."):
        assert not ag.validate_explanation(sentence, ctx.trace)["passed"], sentence
    assert ag.validate_explanation("Le rendement passé ne garantit pas le rendement futur.", ctx.trace)["passed"]


def test_offline_run_is_complete_and_passes_governance(ctx, monkeypatch):
    for k in ("AWS_BEARER_TOKEN_BEDROCK", "AWS_ACCESS_KEY_ID", "AWS_PROFILE", "AWS_WEB_IDENTITY_TOKEN_FILE"):
        monkeypatch.delenv(k, raising=False)
    r = ag.run("je veux mettre 20 % dans Tesla", ctx)
    assert r["mode"] == "offline" and r["check"]["verdict"] == "conflict"
    assert r["governance"]["passed"], r["governance"]
    assert [s["agent"] for s in r["steps"]] == ["Interprète", "Analyste", "Gouvernance"]
    assert "En conflit" in r["message"] and "pas un conseil" in r["message"]


def test_offline_run_asks_when_the_request_is_incomplete(ctx, monkeypatch):
    monkeypatch.delenv("AWS_BEARER_TOKEN_BEDROCK", raising=False)
    r = ag.run("je veux quelque chose de bien", ctx, force_offline=True)
    assert r["check"] is None and "Précisez" in r["message"]


def test_env_loader_does_not_override(tmp_path, monkeypatch):
    f = tmp_path / ".env"
    f.write_text("# commentaire\nAWS_REGION=ca-central-1\nBEDROCK_MODEL_ID='modele-test'\n", encoding="utf-8")
    monkeypatch.setenv("AWS_REGION", "us-west-2")
    monkeypatch.delenv("BEDROCK_MODEL_ID", raising=False)
    ag.load_env(f)
    s = ag.aws_summary()
    assert s["region"] == "us-west-2" and s["modele"] == "modele-test"


# ---------- gouvernance renforcée (sans données ni réseau) ----------
NB = " "
TRACE = [{"outil": "x", "fenetre": ["2021-11-12", "2026-11-12"], "sortie": {"vol": 0.4237, "max_drawdown": -0.0603, "dollars": 1944, "annees": 2.9,
                                                                         "ratio": 0.62, "part": 0.2, "cagr": 0.1294, "n": 1000, "grand": 2000}}]


def ok(text, trace=TRACE):
    return ag.validate_explanation(text, trace)["passed"]


def test_french_number_formats_are_accepted():
    assert ok("La volatilité est de 42,4 % et la pire baisse de −6,0 %.")          # signe moins Unicode
    assert ok("La pire baisse est de -6,0 % (trait d'union).")
    assert ok(f"Perte maximale illustrée : 1{NB}944{NB}$.") and ok("Perte maximale illustrée : 1 944 $.")
    assert ok("Elle a duré 2,9 ans.") and ok("Le ratio est de 0,62.")
    assert ok("Environ 13 % par an.")                  # moins de décimales que la source (12,94)
    assert ok("1 000 simulations du 2021-11-12 au 2026-11-12.")


def test_numbers_with_wrong_precision_or_value_are_rejected():
    assert not ok("Volatilité de 42,5 %.")             # 42,37 arrondi donne 42,4
    assert not ok("Volatilité de 42,371 %.")           # plus précis que la source
    assert ag.validate_explanation("Ratio de 0,63.", TRACE)["unknown_numbers"] == ["0,63"]


def test_sign_flip_is_caught_when_the_minus_is_explicit():
    r = ag.validate_explanation("Le titre a gagné −42,4 % par an.", TRACE)   # la source est +0,4237
    assert not r["passed"] and r["unknown_numbers"] == ["−42,4"]
    assert ok("La baisse est de 6,0 %.")               # sans signe explicite : valeur absolue acceptée
    assert ok("Période du 2021-11-12 au 2026-11-12, pas de faux signe sur un tiret de date.")


def test_dollar_amounts_and_percentages_are_not_exempt_as_small_numbers_or_years():
    assert not ok("Une perte de 2 050 $.") and not ok("Une perte de 2 100 $.")   # nombres « année » : vérifiés si c'est un montant
    assert ok("Une perte de 42,37 %.")
    assert ok("Une perte de 2 000 $.")                 # 2000 est dans la trace
    assert not ok("Une part de 4 % du portefeuille.")  # 4 est <= 5 mais c'est un pourcentage absent de la trace
    assert ok("Niveau 3 sur 5, horizon de 4 ans.")     # puces et « sur 5 » restent exemptés


def test_forecast_wording_is_rejected_but_disclaimers_are_not():
    for s in ("Le titre va atteindre 100 $.", "Il devrait rapporter beaucoup.", "Le rendement attendu est élevé.", "Voici la prévision pour l'an prochain.",
              "Ce titre doublera.", "Vous allez gagner de l'argent.", "Un gain à coup sûr.", "Vous devriez réfléchir.", "Conservez ce titre.", "Cet actif est garanti."):
        assert not ok(s), s
    for s in ("Ce n'est pas une prévision.", "Le modèle ne prédit pas l'avenir.", "Le rendement passé ne garantit pas le rendement futur.", "Un scénario hypothétique.",
              "Aucun rendement n'est garanti.", "Ce placement n'est pas sans risque, sans garantie de rendement.", "Ces scénarios ne constituent pas une prévision."):
        assert ok(s), s


def test_empty_text_is_rejected():
    assert not ok("   ") and "texte vide" in ag.validate_explanation("", TRACE)["issues"]


# ---------- cartes du fil ----------
@pytest.fixture
def robert():
    from alphaforge.profile import InvestorProfile
    return InvestorProfile(name="Robert", objective="preserve", horizon_years=3, risk_tolerance=2, risk_capacity=2)


def make_card(verdict="conflict", scenarios=True):
    card = {"ticker": "NVDA", "name": "NVIDIA", "sector": "Technologie", "asset_class": "Actions américaines",
            "fit": {"verdict": verdict, "label": "En conflit avec le profil déclaré" if verdict == "conflict" else "Compatible avec le profil déclaré", "weight": 0.2,
                    "max_weight_within_profile": 0.03 if verdict == "conflict" else 0.2,
                    "checks": [{"status": "conflict", "message": "La volatilité estimée du portefeuille passerait à 11,3 %, au-dessus du plafond de 7,0 %."},
                               {"status": "info", "message": "Le titre a déjà perdu 64 % dans les données."}]},
            "reasons": ["Le titre est très variable : 52,1 % de volatilité annuelle"],
            "history": {"window": ["2021-11-12", "2026-11-12"], "cagr": 0.4412, "vol": 0.5213, "max_drawdown": -0.6389, "worst_1y": -0.5712, "years_underwater": 2.9,
                        "series": [1.0, 1.1, 0.9] * 400},
            "impact": {"before": {"ex_ante_vol": 0.0612}, "after": {"ex_ante_vol": 0.1134}},
            "similarity_note": None, "trace": [{"x": i} for i in range(500)]}
    if scenarios:
        card["scenarios"] = {"method": "block bootstrap", "window": ["2021-11-12", "2026-11-12"], "n_sims": 1000, "horizon_years": 5, "p5": -0.6123, "p50": 1.3345,
                             "p95": 8.5512, "share_below_start": 0.24, "disclaimer": "Hypothétique, pas une prévision.", "paths": [[1, 2, 3]] * 50}
    return card


def test_offline_card_text_conflict_passes_governance_and_does_not_soften(robert):
    r = ag.explain_card(make_card(), robert, force_offline=True)
    assert r["mode"] == "offline" and r["governance"]["passed"], r["governance"]
    assert "conflit" in r["short"] and len(r["short"]) < 420 and r["short"].count(". ") <= 1
    assert "−63,9" in r["short"] and "2021-11-12" in r["short"]
    for needle in ("pas une prévision", "scénarios hypothétiques", "pas un conseil financier", "Ce qui changerait la lecture", "pas une suggestion d'achat"):
        assert needle in r["long"], needle
    assert [s["agent"] for s in r["steps"]] == ["Explicateur", "Gouvernance"]


def test_offline_card_text_works_for_every_verdict_level_and_missing_data(robert):
    for verdict in ("compatible", "tension", "conflict"):
        for level in ("brief", "standard", "detailed"):
            r = ag.explain_card(make_card(verdict), robert, level=level, vocabulary_help=True, force_offline=True)
            assert r["governance"]["passed"], (verdict, level, r["governance"])
    r = ag.explain_card({"ticker": "ZZZ", "name": "Inconnu"}, robert, force_offline=True)     # carte presque vide : on le dit
    assert r["governance"]["passed"] and "pas pu être évaluée" in r["short"] and "ne permettent pas" in r["long"]
    r = ag.explain_card(make_card(scenarios=False), robert, force_offline=True)
    assert "scénarios hypothétiques fiables" in r["long"] and r["governance"]["passed"]


def test_offline_card_drops_feed_sentences_that_fail_governance(robert):
    card = make_card()
    card["reasons"] = ["Vous devriez acheter ce titre"]
    r = ag.explain_card(card, robert, force_offline=True)
    assert r["governance"]["passed"] and r["governance"].get("extras_dropped") and "acheter" not in r["short"] + r["long"]


def test_card_without_credentials_is_offline(robert, monkeypatch):
    for k in ("AWS_BEARER_TOKEN_BEDROCK", "AWS_ACCESS_KEY_ID", "AWS_PROFILE", "AWS_WEB_IDENTITY_TOKEN_FILE"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setattr(ag, "_call_card_model", lambda *a, **k: pytest.fail("aucun appel au modèle sans identifiants"))
    assert ag.explain_card(make_card(), robert)["mode"] == "offline"


GOOD = ag.CarteTexte(court="NVIDIA est en conflit avec votre profil. Du 2021-11-12 au 2026-11-12, sa pire baisse est de −63,9 %.",
                     long="Conflit avec votre profil : volatilité de 52,1 % du 2021-11-12 au 2026-11-12. Les scénarios hypothétiques ne sont pas une prévision. "
                          "Ce n'est pas un conseil financier personnalisé.")


@pytest.fixture
def bedrock_on(monkeypatch):
    monkeypatch.setenv("AWS_BEARER_TOKEN_BEDROCK", "faux-jeton-de-test")
    calls = []

    def install(*answers):
        seq = list(answers)

        def fake(prompt, model=None):
            calls.append(prompt)
            a = seq.pop(0)
            if isinstance(a, Exception):
                raise a
            return a
        monkeypatch.setattr(ag, "_call_card_model", fake)
        return calls
    return install


def test_card_bedrock_accepted_first_try(robert, bedrock_on):
    calls = bedrock_on(GOOD)
    r = ag.explain_card(make_card(), robert)
    assert r["mode"] == "bedrock" and r["short"] == GOOD.court and r["long"] == GOOD.long and r["governance"]["passed"] and len(calls) == 1
    assert "series" not in calls[0] and "paths" not in calls[0] and "NVIDIA" in calls[0]      # tableaux volumineux retirés du prompt
    assert [s["agent"] for s in r["steps"]] == ["Explicateur", "Gouvernance"]


def test_card_bedrock_rejected_then_accepted(robert, bedrock_on):
    bad = ag.CarteTexte(court="NVIDIA est en conflit avec votre profil.", long="Le titre va atteindre 345 % de rendement. Vous devriez acheter.")
    calls = bedrock_on(bad, GOOD)
    r = ag.explain_card(make_card(), robert)
    assert r["mode"] == "bedrock" and r["long"] == GOOD.long and "fallback" not in r["governance"] and len(calls) == 2
    assert "rejetée par le contrôle" in calls[1] and "345" in calls[1]       # le motif du rejet est renvoyé au modèle
    assert [s["statut"] for s in r["steps"] if s["agent"] == "Gouvernance"] == ["rejeté", "ok"]


def test_card_bedrock_rejected_twice_falls_back_to_code_text(robert, bedrock_on):
    bad = ag.CarteTexte(court="NVIDIA est en conflit avec votre profil.", long="Rendement attendu de 99 %.")
    calls = bedrock_on(bad, bad)
    r = ag.explain_card(make_card(), robert)
    off = ag.explain_card(make_card(), robert, force_offline=True)
    assert r["mode"] == "bedrock" and r["governance"]["fallback"] and r["governance"]["passed"] and len(calls) == 2
    assert (r["short"], r["long"]) == (off["short"], off["long"])


def test_card_rules_specific_to_cards(robert, bedrock_on):
    soft = ag.CarteTexte(court="NVIDIA demande de la prudence avec votre profil.", long=GOOD.long)                     # conflit non nommé
    no_disc = ag.CarteTexte(court=GOOD.court, long="Conflit avec votre profil, volatilité de 52,1 % du 2021-11-12 au 2026-11-12.")   # ni prévision ni conseil
    bedrock_on(soft, no_disc)
    r = ag.explain_card(make_card(), robert)
    assert r["governance"]["fallback"]
    g1 = ag._govern_card(soft.court, soft.long, make_card(), ag._card_trace(make_card(), robert))
    g2 = ag._govern_card(no_disc.court, no_disc.long, make_card(), ag._card_trace(make_card(), robert))
    assert any("conflit" in i for i in g1["issues"]) and any("prévision" in i for i in g2["issues"]) and any("conseil" in i for i in g2["issues"])


def test_card_bedrock_exception_falls_back_to_offline(robert, bedrock_on):
    bedrock_on(RuntimeError("AccessDeniedException: pas de modèle"))
    r = ag.explain_card(make_card(), robert)
    assert r["mode"] == "offline_after_error" and r["governance"]["passed"] and "conflit" in r["short"]
    assert r["steps"][0]["agent"] == "AWS" and r["steps"][0]["statut"] == "erreur"
    assert "faux-jeton" not in json.dumps(r)                                   # aucun secret dans la sortie


def test_card_prompt_mentions_only_clean_data(robert):
    p = ag._card_prompt(make_card(), robert, "brief", True)
    assert '"series"' not in p and '"paths"' not in p and '"trace"' not in p and "plafond_volatilite" in p and "débute" in p


# ---------- préférences ----------
def _pref_cards():
    def c(sec, cls, vol):
        return {"sector": sec, "asset_class": cls, "history": {"vol": vol}}
    return {"NVDA": c("Technologie", "Actions américaines", 0.5213), "TSLA": c("Technologie", "Actions américaines", 0.6011), "AMD": c("Technologie", "Actions américaines", 0.55),
            "XBB.TO": c("Obligations", "Obligations", 0.0612), "AGG": c("Obligations", "Obligations", 0.0701), "XOM": c("Énergie", "Actions américaines", 0.2812)}


def test_preferences_summary_offline():
    state = {"liked": ["NVDA", "TSLA", "AMD"], "disliked": ["XBB.TO", "AGG", "INCONNU"], "neutral": [], "hidden": ["XOM"], "saved": ["NVDA"], "purchases": []}
    r = ag.summarize_preferences(state, _pref_cards())
    assert r["mode"] == "offline" and r["governance"]["passed"], r["governance"]
    assert "Technologie" in r["text"] and "très variables" in r["text"] and "plus variables" in r["text"] and "Obligations" in r["text"]
    assert "ne modifient jamais les limites de risque" in r["text"]
    assert r["stats"]["aime"]["n"] == 3 and r["stats"]["ecarte"]["n"] == 2 and r["stats"]["ecarte"]["n_demandes"] == 3
    assert abs(r["stats"]["aime"]["volatilite_moyenne"] - (0.5213 + 0.6011 + 0.55) / 3) < 1e-12


def test_preferences_summary_with_little_or_no_signal():
    r = ag.summarize_preferences({"liked": [], "disliked": []}, {})
    assert "Pas encore assez" in r["text"] and "ne modifient jamais" in r["text"] and r["governance"]["passed"]
    r = ag.summarize_preferences({"liked": ["XOM"], "disliked": []}, _pref_cards(), force_offline=True)
    assert "Énergie" in r["text"] and r["governance"]["passed"] and "plus variables" not in r["text"]
