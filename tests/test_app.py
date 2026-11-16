"""Parcours de l'application de bout en bout, sans navigateur (outil de test de Streamlit).

Limite connue : AppTest ne pilote pas l'iframe d'un composant personnalisé. Le composant `swipe_card` y renvoie toujours None ;
ses événements sont testés à part (tests/test_ui_feed.py, tests/js/).
"""
import json
import warnings
from pathlib import Path

import pytest

import alphaforge as af
from alphaforge import ui_feed as ui

warnings.filterwarnings("ignore")
pytestmark = pytest.mark.skipif(not af.data.STARTER_DIR.exists(), reason="jeu de départ absent")
ROOT = Path(__file__).resolve().parent.parent
AWS_VARS = ("AWS_BEARER_TOKEN_BEDROCK", "AWS_ACCESS_KEY_ID", "AWS_PROFILE", "AWS_WEB_IDENTITY_TOKEN_FILE")
VIEWS = ["Découvrir", "Ma liste", "Mon profil", "Comparer et vérifier"]


@pytest.fixture
def app(monkeypatch, tmp_path):
    from streamlit.testing.v1 import AppTest

    for k in AWS_VARS:
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv(ui.STATE_ENV, str(tmp_path / "feed_state.json"))  # jamais le vrai fichier outputs/feed_state.json
    monkeypatch.setattr(af.agents, "load_env", lambda *a, **k: None)  # le test ne doit jamais appeler AWS
    monkeypatch.chdir(ROOT)  # l'application lit ses données par chemins relatifs
    return AppTest.from_file(str(ROOT / "app.py"), default_timeout=180).run()


def click(at, label):
    next(b for b in at.button if b.label == label).click()
    return at.run()


def go(at, view):
    at.sidebar.radio(key="nav").set_value(view)
    return at.run()


def texts(at):
    return " ".join(str(getattr(e, "value", "")) for group in (at.markdown, at.caption, at.info, at.warning, at.error, at.success, at.title, at.subheader, at.header) for e in group)


def test_questionnaire_starts_with_first_question(app):
    assert not app.exception
    assert "principale source de revenu" in app.subheader[0].value
    assert not [r for r in app.sidebar.radio if r.key == "nav"]  # pas de navigation avant la fin du questionnaire


def test_robert_end_to_end(app):
    at = click(app, "Charger Robert")
    assert not at.exception
    assert at.sidebar.radio(key="nav").value == "Découvrir"  # le fil est l'écran d'arrivée
    assert at.title[0].value == "Découvrir"
    at = go(at, "Mon profil")
    assert not at.exception
    assert at.title[0].value == "Profil déclaré : Robert"
    metrics = {m_.label: m_.value for m_ in at.metric}
    assert metrics["Niveau de risque retenu"] == "2 / 5" and metrics["Tolérance révélée"] == "—"

    # Étape 2 : l'idée « 20 % dans Tesla » est contestée.
    at = go(at, "Comparer et vérifier")
    at.text_input(key="idea_text").set_value("je veux mettre 20 % dans Tesla").run()
    at = click(at, "Analyser cette idée")
    assert not at.exception
    assert "En conflit avec le profil déclaré" in texts(at) and "Contrôle de gouvernance : réussi" in texts(at)

    # Étape 3 : trois fois « je garde l'idée » ; l'alerte apparaît et le niveau retenu ne bouge pas.
    for _ in range(3):
        at = click(at, "Je garde l'idée telle quelle")
    assert not at.exception
    at = go(at, "Mon profil")
    metrics = {m_.label: m_.value for m_ in at.metric}
    assert metrics["Tolérance révélée"] == "4 / 5" and metrics["Niveau retenu pour ce portefeuille"] == "2 / 5"
    assert "Vos décisions ne changent pas ces limites" in texts(at)
    assert "ne changerait pas le niveau retenu" in texts(at)

    # La personne met elle-même à jour sa tolérance : le niveau retenu reste à 2.
    at = click(at, "Mettre à jour ma tolérance déclarée à 4 sur 5")
    assert not at.exception
    metrics = {m_.label: m_.value for m_ in at.metric}
    assert metrics["Tolérance déclarée"] == "4 / 5" and metrics["Niveau de risque retenu"] == "2 / 5"


def test_amira_same_request_gets_a_different_answer(app):
    at = click(app, "Charger Amira")
    at = go(at, "Comparer et vérifier")
    at.text_input(key="idea_text").set_value("5 % dans NVDA").run()
    at = click(at, "Analyser cette idée")
    assert not at.exception and "Compatible avec le profil déclaré" in texts(at)


@pytest.mark.parametrize("persona", ["Amira", "Mateo", "Robert"])
def test_every_view_renders_for_each_persona(app, persona):
    at = click(app, f"Charger {persona}")
    for view in VIEWS:
        at = go(at, view) if view != "Découvrir" else at
        assert not at.exception, (persona, view, [e.value for e in at.exception])
        assert at.sidebar.radio(key="nav").value == view


def test_discover_does_not_crash_when_component_returns_none(app):
    at = click(app, "Charger Robert")
    assert not at.exception
    assert at.title[0].value == "Découvrir"
    assert "ne modifient jamais vos limites de risque" in texts(at)  # la phrase sur les J'aime / Je n'aime pas est visible
    at = at.run()  # nouvelle exécution : la valeur du composant reste None
    assert not at.exception
    assert at.session_state["feed_state"]["liked"] == []


def test_my_list_simulated_purchase_for_robert(app, tmp_path):
    at = click(app, "Charger Robert")
    at.session_state["feed_state"]["saved"] = ["TSLA", "AAPL"]  # comme si deux signets avaient été touchés
    at = go(at, "Ma liste")
    assert not at.exception
    assert "Simulation : aucun ordre n'est transmis" in texts(at)
    assert [b for b in at.button if b.label == "Simuler l'achat" and b.disabled]  # rien de choisi : désactivé
    at.multiselect(key="list_pick").set_value(["TSLA"]).run()
    at.slider(key="list_w").set_value(20).run()
    at = click(at, "Simuler l'achat")
    assert not at.exception
    body = texts(at)
    assert "Simulation : aucun ordre n'est transmis" in body and "Rien n'est bloqué" in body
    assert at.session_state["feed_state"]["purchases"][0]["verdict"] != "compatible"  # 20 % de Tesla pour Robert : le conflit est dit
    assert len(at.session_state["journal"]) == 1  # compte pour le profil révélé
    assert at.session_state["feed_state"]["purchases"][0]["simulated"] is True
    saved_file = json.loads((tmp_path / "feed_state.json").read_text(encoding="utf-8"))
    assert saved_file["profiles"]["Robert"]["saved"] == ["TSLA", "AAPL"]
    assert saved_file["profiles"]["Robert"]["purchases"][0]["tickers"] == ["TSLA"]
    # tout sélectionner, puis retirer de la liste
    at = click(at, "Tout sélectionner")
    assert at.multiselect(key="list_pick").value == ["TSLA", "AAPL"]
    at = click(at, "Retirer la sélection de la liste")
    assert not at.exception and at.session_state["feed_state"]["saved"] == []


def test_feed_state_reloaded_from_file_when_profile_is_loaded(app, tmp_path):
    ui.save_state("Robert", {**ui.feed.new_state(), "saved": ["GLD"], "hidden": ["TSLA"]}, tmp_path / "feed_state.json")
    at = click(app, "Charger Robert")
    assert not at.exception
    assert at.session_state["feed_state"]["saved"] == ["GLD"] and at.session_state["feed_state"]["hidden"] == ["TSLA"]
    at = click(at, "Charger Amira")
    assert at.session_state["feed_state"]["saved"] == []  # un autre profil, un autre état
