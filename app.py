"""ReelBroker — démo. Lancer : .venv\\Scripts\\streamlit run app.py

Parcours : questionnaire (compte puis portefeuille) -> quatre vues choisies dans la barre latérale :
Découvrir (fil de cartes à glisser), Ma liste (actifs enregistrés, achat SIMULÉ), Mon profil, Comparer et vérifier.
Simulation seulement. Aucun chiffre n'est produit par un modèle de langage.
"""
import json
from pathlib import Path

import pandas as pd
import plotly.express as px
import streamlit as st

import alphaforge as af
from alphaforge import agents as ag
from alphaforge import feed
from alphaforge import metrics as m
from alphaforge import questionnaire as q
from alphaforge import ui_feed as ui

ag.load_env()  # identifiants AWS depuis .env, s'il existe
st.set_page_config(page_title="ReelBroker", layout="wide")
ss = st.session_state
ss.setdefault("answers", {})
ss.setdefault("name", "Investisseur")
ss.setdefault("persona", None)
ss.setdefault("p1_help", False)
ss.setdefault("journal", [])  # décisions prises dans ce portefeuille (étape 3)
ss.setdefault("tol_override", None)  # tolérance déclarée mise à jour par la personne elle-même

VIEWS = ["Découvrir", "Ma liste", "Mon profil", "Comparer et vérifier"]
SIM_RULE = ("Les J'aime et les Je n'aime pas ne font que réordonner le fil : ils ne modifient jamais vos limites de risque.")


@st.cache_data
def get_data():
    prices, universe = af.load_starter()
    return prices, universe, prices.attrs["source"]


SCENARIOS = q.load_scenarios()


def reset(keep_account: bool = False):
    ui.clear_state(ss.name)  # le fil de ce profil repart de zéro (fichier compris)
    ss.answers = {k: v for k, v in ss.answers.items() if keep_account and k.startswith("C")}
    ss.p1_help = False
    ss.journal, ss.tol_override = [], None
    ss.feed_for, ss.list_result, ss.nav_request = None, None, "Découvrir"
    if not keep_account:
        ss.persona, ss.name = None, "Investisseur"


# L'interface (composant) demande parfois de changer de vue : on l'applique ici, avant que le widget de navigation n'existe.
if ss.get("nav_request"):
    ss["nav"] = ss.pop("nav_request")

a = ss.answers
qid = q.next_question(a)

# ---------------- barre latérale ----------------
with st.sidebar:
    st.header("ReelBroker")
    st.caption("Simulation seulement. Ni conseil financier personnalisé, ni promesse de rendement.")
    if not qid:
        st.radio("Navigation", VIEWS, key="nav")
    st.subheader("Personas de l'énoncé")
    for pname, p in q.PERSONAS.items():
        if st.button(f"Charger {pname}", help=p["summary"], width="stretch"):
            ss.answers, ss.persona, ss.name, ss.p1_help = dict(p["answers"]), pname, pname, False
            ss.journal, ss.tol_override = [], None
            ss.feed_for, ss.list_result, ss.nav_request = None, None, "Découvrir"
            st.rerun()
    st.divider()
    if st.button("Nouveau portefeuille", help="Garde les réponses du compte", width="stretch"):
        reset(keep_account=True)
        st.rerun()
    if st.button("Recommencer à zéro", width="stretch"):
        reset()
        st.rerun()
    with st.expander("Réglages de la simulation"):
        method = st.selectbox("Méthode", ["max_diversification", "min_variance", "max_utility"],
                              format_func={"max_diversification": "Diversification maximale", "min_variance": "Variance minimale",
                                           "max_utility": "Rendement ajusté au risque (sensible au passé)"}.get)

# ---------------- questionnaire ----------------
if qid:
    spec = q.QUESTIONS[qid]
    done_main = sum(x in a for x in ("C1", "C2", "C3", "C4", "C5", "P1", "P2", "P3", "P4", "P5"))
    st.progress(done_main / 10, text=f"{done_main} question(s) principale(s) sur 10")
    st.caption(("Profil du compte" if spec["level"] == "compte" else "Paramètres du portefeuille") + f" · {spec['element']}")
    st.subheader(q.question_text(qid, a, SCENARIOS))
    if "scenario" in spec:
        st.caption(q.scenario_caption(SCENARIOS))
    if a.get("C3") in ("none", "beginner", "unknown", "skipped") and "scenario" in spec:
        st.info("Action : une part d'une entreprise. Obligation : un prêt à un gouvernement ou à une entreprise, "
                "en général moins variable qu'une action.")
    if qid == "P1" and ss.p1_help:
        st.info(spec["help"])

    choices = q.choices_for(qid, a)
    codes, labels = [c for c, _ in choices], dict(choices)
    extra = {}
    if spec["type"] == "multi":
        picked = [c for c in codes if st.checkbox(labels[c], key=f"{qid}_{c}")]
        if "none" in picked:
            picked = ["none"]
        value = picked or None
        if "other" in picked:
            extra["C4_text"] = st.text_input("Précisez (facultatif)", key=f"{qid}_text")
    else:
        value = st.radio("Votre réponse", codes, format_func=labels.get, index=None, key=f"{qid}_radio", label_visibility="collapsed")
        if spec["type"] == "amount":
            exact = st.number_input("Montant exact en dollars canadiens (facultatif)", min_value=0, value=None, step=500, key="P3_num")
            if exact:
                extra["P3_exact"] = float(exact)
                value = value or next(c for c, hi in (("lt_1k", 1e3), ("1k_10k", 1e4), ("10k_50k", 5e4), ("50k_250k", 2.5e5), ("gt_250k", float("inf"))) if exact < hi)
        if qid == "P1":
            extra["P1_text"] = st.text_input("Nom du projet (facultatif, ex. mise de fonds, retraite)", key="P1_label")

    c1, c2, _ = st.columns([1, 1, 4])
    if c1.button("Suivant", type="primary", disabled=value is None):
        if qid == "P1" and value == "unknown" and not ss.p1_help:
            ss.p1_help = True  # une aide, puis la question est reposée une seule fois
        else:
            a[qid] = value
            a.update({k: v for k, v in extra.items() if v})
        st.rerun()
    if c2.button("Passer"):
        a[qid] = "skipped"
        st.rerun()
    st.caption("Vous pouvez passer une question ou répondre « Je ne sais pas ». Aucune réponse n'est meilleure qu'une autre.")
    st.stop()

# ---------------- profil déclaré et calculs communs à toutes les vues ----------------
declared = q.build_declared(a, scenarios=SCENARIOS)
profile, notes = q.to_profile(declared, ss.name)
questionnaire_tolerance = profile.risk_tolerance
if ss.tol_override:
    profile = af.learn.with_tolerance(profile, ss.tol_override)
    notes.append(f"Tolérance déclarée mise à jour par vous à {ss.tol_override} sur 5 (le questionnaire donnait {questionnaire_tolerance} sur 5). "
                 "L'objectif, l'horizon et la capacité n'ont pas changé.")
acc, pf = declared["account"], declared["portfolio"]
prices, universe, source = get_data()
meta = af.starter_metadata(universe)
amt = pf["risk_tolerance"]["illustration_amount"]


@st.cache_data(show_spinner="Calcul des scénarios…")
def get_options(profile_key: str, method_: str):
    return af.decide.options(prices, profile, meta, objective=method_)


opts = [o for o in get_options(json.dumps(profile.__dict__, sort_keys=True, default=str), method) if "result" in o]
if not opts:
    st.error("Aucun scénario ne respecte toutes les contraintes de ce profil.")
    st.stop()
aligned = next(o for o in opts if o["key"] == "aligned")
base_weights = aligned["result"]["weights"]
AMOUNT = float(amt["value"])
FEED_KEY = json.dumps([json.dumps(profile.__dict__, sort_keys=True, default=str), {k: round(v, 6) for k, v in sorted(base_weights.items())}, AMOUNT])


def show(qid_):
    return q.label(qid_, a[qid_]) if qid_ in a else "Non demandé"


def fr1(x: float) -> str:
    return f"{x:.1f}".replace(".", ",")


def style_fig(fig):
    fig.update_layout(separators=", ")  # virgule décimale, espace entre les milliers
    return fig


def verdict_box(verdict: str):
    """Boîte de couleur pour un verdict d'adéquation. Jamais de vert « feu vert » : un verdict compatible reste informatif."""
    return {"compatible": st.info, "tension": st.warning, "conflict": st.error}.get(verdict, st.info)


# ---------------- fil de découverte : état, cache, calculs lourds à la demande ----------------
@st.cache_resource(show_spinner="Préparation du fil de découverte (quelques secondes, une seule fois par profil)…")
def get_deck(feed_key: str, _prices, _universe, _meta, _profile, _weights, amount):
    return ui.make_deck(_prices, _universe, _meta, _profile, _weights, amount)


def ensure_feed():
    """Charge l'état du fil de ce profil (fichier outputs/feed_state.json) quand le profil change."""
    if ss.get("feed_for") != ss.name or "feed_state" not in ss:
        ss.feed_state, ss.feed_ui, ss.feed_for = ui.load_state(ss.name), ui.new_ui(), ss.name
        ss.feed_epoch = ss.get("feed_epoch", 0) + 1  # nouvelle clé de composant : une valeur d'un autre profil ne peut pas être rejouée
        ss.list_result = None
    if ss.get("feed_cache_key") != FEED_KEY:
        ss.feed_cache, ss.feed_cache_key = {"short": {}, "detail": {}, "impact": {}}, FEED_KEY


def deck_now():
    return get_deck(FEED_KEY, prices, universe, meta, profile, base_weights, AMOUNT)


def persist():
    try:
        ui.save_state(ss.name, ss.feed_state)
    except OSError as e:
        st.warning(f"La liste n'a pas pu être écrite dans {ui.state_file()} ({e}). Elle reste disponible dans cette session.")


def short_text(c: dict) -> str:
    """Texte « Pourquoi » de la face : toujours hors ligne (instantané). Repli sur les raisons calculées."""
    key = (c["ticker"], c.get("similarity_note"))
    cache = ss.feed_cache["short"]
    if key not in cache:
        text = None
        fn = getattr(ag, "explain_card", None)
        if fn:
            try:
                text = fn(c, profile, level="brief", vocabulary_help=False, force_offline=True).get("short")
            except Exception:  # noqa: BLE001 - la face de la carte ne doit jamais casser le fil
                text = None
        cache[key] = text or " ".join(c["reasons"][:2])
    return cache[key]


def compute_detail(ticker: str):
    """Scénarios à 5 ans et explication complète d'un actif (une fois par actif et par profil)."""
    c = dict(deck_now()["cards"][ticker])
    try:
        c["scenarios"] = feed.scenarios_5y(prices, ticker, AMOUNT)
        c["trace"] = c["trace"] + [c["scenarios"]["trace"][0]]
    except ValueError:
        c["scenarios"] = None
    expl = None
    fn = getattr(ag, "explain_card", None)
    if fn:
        try:
            expl = fn(c, profile, level=ui.level_for(acc), vocabulary_help=acc["investment_experience"] in (None, "none", "beginner"), force_offline=False)
        except Exception:  # noqa: BLE001 - repli sur les raisons du code
            expl = None
    ss.feed_cache["detail"][ticker] = ui.detail_payload(c, expl)


def compute_impact(ticker: str, weight: float):
    imp = feed.impact_for_weight(prices, universe, meta, profile, base_weights, ticker, weight, AMOUNT)
    ss.feed_cache["impact"][(ticker, int(round(weight * 100)))] = ui.impact_payload(imp["impact"], imp["fit"], weight)


def view_discover():
    ensure_feed()
    st.title("Découvrir")
    st.caption("Des actifs de l'univers de départ, classés selon leur ajustement à votre profil déclaré. Faites glisser la carte, ou utilisez les boutons ou les flèches du clavier. Simulation : aucun ordre n'est transmis.")
    deck = deck_now()
    state, ui_state, cache = ss.feed_state, ss.feed_ui, ss.feed_cache
    queue = ui.ranked(deck, universe, state, ui_state, n=ui.QUEUE_SIZE)
    fronts = [ui.front_payload(c, short_text(c), c["ticker"] in state["saved"]) for c in queue]
    details = {}
    for c in queue:
        t = c["ticker"]
        if t in cache["detail"]:
            d = dict(cache["detail"][t])
            w = ui_state["weights"].get(t)
            if w is not None and (t, int(round(w * 100))) in cache["impact"]:
                d["impact"] = cache["impact"][(t, int(round(w * 100)))]
            details[t] = d
    args = ui.build_args(fronts, details, ui_state["acked"], state["saved"])

    left, mid, right = st.columns([1, 1.7, 1])
    with left:
        st.markdown("**Comment ça marche**")
        st.markdown("- ← Glisser à gauche : **J'aime** (plus d'actifs comme celui-ci)\n- → Glisser à droite : **Je n'aime pas**\n- ↑ Glisser vers le haut : **Neutre**, carte suivante\n"
                    "- Le signet enregistre l'actif dans **Ma liste**\n- **Voir plus** ouvre les chiffres, l'effet sur le portefeuille et les scénarios")
        st.caption(SIM_RULE)
    with mid:
        value = ui.swipe_card(key=f"swipe_{ss.feed_epoch}", default=None, **args)
        res = ui.process_events(ss, value, valid_tickers=set(deck["cards"]))
        for kind, t in res["needs"]:
            if kind == "detail" and t not in cache["detail"]:
                with st.spinner("Scénarios et explication en cours de préparation…"):
                    compute_detail(t)
            elif kind == "impact":
                w = ui_state["weights"].get(t)
                if w is not None and (t, int(round(w * 100))) not in cache["impact"]:
                    compute_impact(t, w)
        if res["persist"]:
            persist()
        if res["navigate"]:
            ss.nav_request = res["navigate"]
        if res["changed"]:
            st.rerun()
        if not queue:
            if st.button("Remettre dans le fil les actifs déjà vus", width="stretch"):
                ui_state["include_seen"] = True
                st.rerun()
        st.caption(SIM_RULE + " Outil d'analyse en simulation, pas un conseil de placement personnalisé ; le rendement passé ne garantit pas le rendement futur.")
    with right:
        st.markdown("**Ce que vos réactions révèlent**")
        summ = None
        fn = getattr(ag, "summarize_preferences", None)
        if fn:
            try:
                summ = fn(state, deck["cards"], force_offline=True)
            except Exception:  # noqa: BLE001
                summ = None
        st.write(summ["text"] if summ else SIM_RULE)
        k1, k2 = st.columns(2)
        k1.metric("Aimés", len(state["liked"]))
        k2.metric("Écartés", len(state["disliked"]) + len(state["hidden"]))
        k3, k4 = st.columns(2)
        k3.metric("Enregistrés", len(state["saved"]))
        k4.metric("Restants", len(ui.ranked(deck, universe, state, {**ui_state, "include_seen": False})))
        with st.expander("Réglages du fil"):
            if st.button("Réinitialiser mes réactions et ma liste"):
                ui.clear_state(ss.name)
                ss.feed_for, ss.list_result = None, None
                st.rerun()
            st.caption(f"État enregistré dans {ui.state_file()} (nom du profil fictif, réactions, actifs enregistrés, achats simulés).")


def _select_all(options):
    ss["list_pick"] = list(options)


def _remove_selected():
    for t in ss.get("list_pick", []):
        feed.react(ss.feed_state, t, "unsave")
    ss["list_pick"] = []
    persist()


def show_purchase(res: dict):
    st.info(res["notice"])
    ov = res["overall"]
    verdict_box(ov["verdict"])(f"**{ov['label']}** — achat simulé de {', '.join(res['tickers'])} à {q.fr_pct(res['weight_each'], 0)} chacun.")
    for b in ov["breaches"]:
        {"conflict": st.error, "warn": st.warning}.get(b["status"], st.info)(b["message"])
    if ov["breaches"]:
        st.markdown(f"**Plus grande part égale qui resterait dans les limites :** {q.fr_pct(res['max_equal_weight'], 0)} par actif." if res["max_equal_weight"] > 0
                    else "**Aucune part égale, même de 1 %, ne reste dans les limites avec cette sélection.**")
    st.write(res["summary"])
    cols = st.columns(4)
    cols[0].metric("Volatilité estimée", q.fr_pct(ov["ex_ante_vol"]), f"plafond {q.fr_pct(ov['max_vol'], 0)}", delta_color="off")
    cols[1].metric("Actifs de croissance", q.fr_pct(ov["growth_share"], 0), f"limite {q.fr_pct(ov['max_growth_assets'], 0)}", delta_color="off")
    cols[2].metric("Plus grosse position", q.fr_pct(ov["max_weight"], 0))
    cols[3].metric("Montant simulé", q.fr_money(res["amount"]))
    per = pd.DataFrame([{"Actif": f"{p['name']} ({p['ticker']})", "Verdict à l'ajout": p["fit"]["label"]} for p in res["per_asset"]])
    st.dataframe(per, hide_index=True, width="stretch")
    st.caption("Décisions notées dans le journal du profil (Mon profil, section « Profil déclaré et profil révélé »). Rien n'est bloqué : la décision vous appartient.")


def view_list():
    ensure_feed()
    st.title("Ma liste")
    st.info(feed.SIM_NOTICE)
    state = ss.feed_state
    saved = list(state["saved"])
    if not saved:
        st.write("Aucun actif enregistré pour l'instant. Dans **Découvrir**, touchez le signet d'une carte pour l'ajouter ici.")
        if ss.get("list_result"):
            show_purchase(ss.list_result)
        return
    cards = deck_now()["cards"]
    bought = {t for p in state["purchases"] for t in p["tickers"]}
    st.dataframe(pd.DataFrame([{"Actif": cards[t]["name"] if t in cards else t, "Ticker": t, "Type": cards[t]["asset_class_label"] if t in cards else "",
                                "Verdict à 5 %": cards[t]["fit"]["label"] if t in cards else "—", "Achat simulé": "oui" if t in bought else ""} for t in saved]),
                 hide_index=True, width="stretch")
    pre = [t for t in ss.feed_ui.get("selection", []) if t in saved]
    if pre:
        ss["list_pick"], ss.feed_ui["selection"] = pre, []
    ss["list_pick"] = [t for t in ss.get("list_pick", []) if t in saved]
    st.multiselect("Actifs à acheter en simulation (un, plusieurs ou tous)", saved, key="list_pick",
                   format_func=lambda t: f"{cards[t]['name']} ({t})" if t in cards else t)
    b1, b2, _ = st.columns([1, 1, 3])
    b1.button("Tout sélectionner", on_click=_select_all, args=(saved,), width="stretch")
    b2.button("Retirer la sélection de la liste", on_click=_remove_selected, width="stretch", disabled=not ss["list_pick"])
    picks = ss["list_pick"]
    max_pct = max(1, min(50, 99 // max(1, len(picks))))
    ss["list_w"] = int(min(max(ss.get("list_w", 5), 1), max_pct))
    wpct = st.slider("Part de chaque actif dans le portefeuille (%)", 1, max_pct, key="list_w",
                     help="Chaque actif choisi est ajouté à cette part ; le reste du portefeuille de départ est réduit proportionnellement.")
    if st.button("Simuler l'achat", type="primary", disabled=not picks):
        try:
            res = feed.simulate_purchase(prices, universe, meta, profile, base_weights, state, picks, wpct / 100, AMOUNT)
        except ValueError as e:
            st.error(str(e))
        else:
            ss.journal.extend(res["journal"])  # compte pour le profil révélé
            ss.list_result = res
            persist()
            st.rerun()
    if ss.get("list_result"):
        show_purchase(ss.list_result)
    if state["purchases"]:
        with st.expander(f"Achats simulés enregistrés ({len(state['purchases'])})"):
            st.dataframe(pd.DataFrame([{"Date": q.fr_date(p["date"]), "Actifs": ", ".join(p["tickers"]), "Part chacun": q.fr_pct(p["weight_each"], 0),
                                        "Verdict": {"compatible": "Compatible", "tension": "Tensions", "conflict": "En conflit"}.get(p["verdict"], p["verdict"])}
                                       for p in state["purchases"]]), hide_index=True, width="stretch")
    st.download_button("Télécharger la liste (JSON)", data=json.dumps(ui.saved_list_export(ss.name, state, universe, cards), ensure_ascii=False, indent=2),
                       file_name="ma_liste_alphaforge.json", mime="application/json")
    try:
        shown = ui.state_file().relative_to(Path(__file__).resolve().parent)
    except ValueError:
        shown = ui.state_file()
    st.caption(f"La liste est aussi écrite dans {shown} (nom du profil fictif, actifs enregistrés, achats simulés ; aucune autre donnée personnelle).")


def view_profile():
    st.title(f"Profil déclaré : {ss.name}")
    st.info("Vos réponses décrivent votre **profil déclaré** : ce que vous nous avez dit de votre situation, de vos objectifs et de "
            "votre réaction devant une baisse. Elles servent à préparer des scénarios fictifs. Elles ne constituent ni un conseil "
            "financier personnalisé ni une promesse de rendement. Les baisses présentées sont des faits passés ; elles ne prédisent pas l'avenir.")
    if ss.persona:
        assumed = ", ".join(q.QUESTIONS[x]["element"].lower() for x in q.PERSONAS[ss.persona]["assumed"])
        st.caption(f"Persona de l'énoncé. Réponses absentes de l'énoncé et inventées pour la démonstration : {assumed}.")
    left, right = st.columns(2)
    with left:
        st.subheader("Compte")
        st.markdown(f"- **Revenu :** {show('C1')}\n- **Coussin de sécurité :** {show('C2')}\n- **Obligations :** {show('C2a')}\n"
                    f"- **Expérience :** {show('C3')}\n- **À éviter :** {show('C4')}"
                    + (f" ({show('C4a').lower()})" if "C4a" in a else "") + f"\n- **Explications :** {show('C5')}"
                    + (f"\n- **Thèmes d'intérêt :** {show('C6')}" if "C6" in a else ""))
    with right:
        st.subheader("Portefeuille" + (f" « {pf['label']} »" if pf["label"] else ""))
        st.markdown(f"- **Objectif :** {show('P1')}\n- **Horizon :** {show('P2')}\n"
                    f"- **Mise initiale :** {q.fr_money(pf['initial_amount']['exact']) if pf['initial_amount']['exact'] else show('P3')}\n"
                    f"- **Retraits :** {show('P4')}\n- **Devant la première baisse :** {show('P5')}\n"
                    f"- **Devant la baisse plus forte :** {show('P5a')}\n"
                    f"- **Tolérance déclarée :** {q.TOLERANCE_LABELS[pf['risk_tolerance']['declared']]}")

    if declared["contradictions"]:
        st.subheader("À clarifier")
        for c in declared["contradictions"]:
            st.warning(c["question"])
    if declared["missing"]:
        st.subheader("Réponses manquantes")
        st.markdown("\n".join(f"- {q.QUESTIONS[x['question']]['element']} ({'question passée' if x['reason'] == 'skipped' else 'je ne sais pas'})" for x in declared["missing"]))
    if declared["status"] == "incomplete":
        st.error("Profil incomplet : le scénario ci-dessous repose sur des hypothèses prudentes, indiquées plus bas.")

    st.header("Ce que l'application en déduit")
    b = profile.budget()
    k = st.columns(4)
    k[0].metric("Tolérance déclarée", f"{profile.risk_tolerance} / 5")
    k[1].metric("Capacité calculée", f"{profile.risk_capacity} / 5")
    k[2].metric("Plafond lié à l'horizon et à l'objectif", f"{min(profile.horizon_cap(), profile.objective_cap())} / 5")
    k[3].metric("Niveau de risque retenu", f"{b['level']} / 5")
    st.caption("Le niveau retenu est le plus bas des trois. Une tolérance élevée n'annule jamais une capacité faible, "
               "un horizon court ou un objectif de préservation.")
    for n in notes:
        st.markdown(f"- {n}")

    # ---------------- profil déclaré et profil révélé ----------------
    st.header("Profil déclaré et profil révélé")
    st.caption("Le profil déclaré vient de vos réponses. Le profil révélé vient de vos décisions dans l'application. Ils sont montrés côte à côte "
               "et ne sont jamais fusionnés sans vous. Vos décisions ne changent ni votre objectif, ni votre horizon, ni votre capacité.")
    with st.expander("Enregistrer d'autres décisions", expanded=not ss.journal):
        o1, o2 = st.columns([3, 1])
        keep_opt = o1.selectbox("Scénario que vous retiendriez", [o["key"] for o in opts], index=[o["key"] for o in opts].index("aligned"),
                                format_func={o["key"]: f"{o['title']} (niveau {o['level']} sur 5)" for o in opts}.get)
        o2.write("")
        if o2.button("Noter ce choix", width="stretch"):
            ss.journal.append(af.learn.option_decision(next(o for o in opts if o["key"] == keep_opt), profile.risk_tolerance))
            st.rerun()
        w_al = aligned["result"]["weights"]
        episodes = af.learn.worst_episodes(m.portfolio_value(prices[list(w_al)].dropna(), w_al))
        for i_, ep in enumerate(episodes):
            back = f"et a retrouvé sa valeur le {q.fr_date(ep['recovered'])}" if ep["recovered"] else "et n'avait pas retrouvé sa valeur à la fin des données"
            st.markdown(f"**Épisode réel {i_ + 1}.** Le scénario aligné sur votre profil a perdu {q.fr_pct(ep['drop'])} entre le {q.fr_date(ep['peak'])} et le "
                        f"{q.fr_date(ep['trough'])}, soit environ {q.fr_money(amt['value'] * abs(ep['drop']))} sur {q.fr_money(amt['value'])}, {back}. "
                        "Qu'auriez-vous fait au creux ?")
            e_cols = st.columns(4)
            for col_, (code_, lab_) in zip(e_cols, af.learn.REACTIONS.items()):
                if col_.button(lab_, key=f"ep_{i_}_{code_}", width="stretch"):
                    ss.journal.append(af.learn.episode_decision(ep, code_, aligned["level"], profile.risk_tolerance))
                    st.rerun()
        st.caption("Une baisse passée ne prédit pas les résultats futurs.")

    cmp3 = af.learn.compare(profile, ss.journal)
    rev3 = cmp3["revealed"]
    p1_, p2_, p3_ = st.columns(3)
    p1_.metric("Tolérance déclarée", f"{cmp3['declared']} / 5")
    p2_.metric("Tolérance révélée", f"{rev3['level']} / 5" if rev3["established"] else "—",
               f"{rev3['n']} décision(s)" if rev3["established"] else f"{rev3['n']} sur {rev3['needed']} décisions nécessaires", delta_color="off")
    p3_.metric("Niveau retenu pour ce portefeuille", f"{cmp3['retained_level']} / 5")
    show3 = {"insufficient": st.info, "aligned": st.info, "riskier": st.warning, "more_cautious": st.warning, "exceeds_limits": st.error}[cmp3["status"]]
    show3("\n\n".join(cmp3["messages"]))
    if cmp3["update_to"]:
        if st.button(f"Mettre à jour ma tolérance déclarée à {cmp3['update_to']} sur 5"):
            ss.tol_override = cmp3["update_to"]
            ss.journal.append({"date": str(pd.Timestamp.today().date()), "type": "update", "decision": f"Tolérance déclarée mise à jour à {cmp3['update_to']} sur 5",
                               "signal": None, "lecture": "Décision explicite de la personne.", "fictif": False})
            st.rerun()
        st.caption("Rien ne change tant que vous ne cliquez pas. Vous pouvez aussi refaire le questionnaire.")
    if ss.journal:
        jr = pd.DataFrame(ss.journal)[["date", "decision", "signal", "lecture"]].rename(
            columns={"date": "Date", "decision": "Décision", "signal": "Niveau révélé", "lecture": "Lecture"})
        jr["Niveau révélé"] = jr["Niveau révélé"].map(lambda v: "conforme" if pd.isna(v) else f"{int(v)} sur 5")
        st.dataframe(jr, hide_index=True, width="stretch")
        if st.button("Effacer le journal"):
            ss.journal, ss.tol_override = [], None
            st.rerun()
    st.caption(f"Méthode : médiane des {af.learn.WINDOW} dernières décisions ; une décision conforme au profil compte pour la tolérance déclarée ; "
               f"aucune conclusion avant {af.learn.MIN_DECISIONS} décisions. Ce sont des hypothèses déclarées. Le journal vit dans cette session seulement.")

    ensure_feed()
    st.header("Ce que vos réactions dans le fil révèlent")
    fn = getattr(ag, "summarize_preferences", None)
    summ = None
    if fn:
        try:
            summ = fn(ss.feed_state, deck_now()["cards"], force_offline=True)
        except Exception:  # noqa: BLE001
            summ = None
    st.write(summ["text"] if summ else "Aucune synthèse disponible. " + SIM_RULE)
    st.caption(SIM_RULE)
    with st.expander("Profil déclaré (JSON transmis au code)"):
        st.code(json.dumps(declared, ensure_ascii=False, indent=2), language="json")


def view_compare():
    st.title("Comparer et vérifier")
    # ---------------- options à comparer ----------------
    st.header("Options à comparer")
    st.caption("Scénarios fictifs construits à partir des données. Ce ne sont pas des recommandations : ils montrent ce que chaque "
               "niveau de risque change, pour que vous puissiez comparer.")
    cols = st.columns(len(opts))
    for col, o in zip(cols, opts):
        r_ = o["result"]["stats"]
        with col.container(border=True):
            st.markdown(f"**{o['title']}**  \nNiveau {o['level']} sur 5 ({o['level_label']})")
            (st.warning if not o["within_profile"] else st.info)(o["note"])
            st.markdown(
                f"- Pire baisse : **−{q.fr_pct(r_['max_drawdown'])}**, soit −{q.fr_money(amt['value'] * abs(r_['max_drawdown']))} sur {q.fr_money(amt['value'])}\n"
                f"- Pires 12 mois : {'−' if r_['worst_1y'] < 0 else '+'}{q.fr_pct(r_['worst_1y'])}\n"
                f"- Volatilité annuelle : {q.fr_pct(r_['vol'])}\n"
                f"- Rendement annuel passé : {q.fr_pct(r_['cagr'])}\n"
                f"- Actifs de croissance : {q.fr_pct(o['growth_share'], 0)}\n"
                f"- Positions équivalentes : {fr1(o['result']['concentration']['effective_n'])}")
    st.caption(f"Chiffres historiques du {q.fr_date(str(opts[0]['result']['stats']['start']))} au {q.fr_date(str(opts[0]['result']['stats']['end']))}, "
               "en dollars canadiens. Le rendement passé ne garantit pas le rendement futur ; l'univers a été choisi en 2026, ce qui embellit le passé.")

    # ---------------- vérifier une idée ----------------
    st.header("Vérifier une idée")
    st.caption("Vous avez une idée en tête ? L'application la confronte à votre profil. Elle ne dit ni oui ni non : elle montre ce que l'idée change.")
    txt = st.text_input("Décrivez votre idée", placeholder="Exemple : je veux mettre 20 % dans Tesla", key="idea_text")
    aws = ag.aws_summary()
    if aws["connecte"]:
        st.caption(f"🟢 Agents connectés à Amazon Bedrock (région : {aws['region']} ; modèle : {aws['modele']}"
                   + (" ; garde-fou Bedrock actif" if aws["garde_fou"] else "") + ").")
    else:
        st.caption("⚪ Mode hors ligne : aucun identifiant AWS trouvé. Les calculs et les contrôles tournent, mais la lecture de la phrase "
                   "et la rédaction ne passent pas par les agents Bedrock.")
    if st.button("Analyser cette idée", type="primary", disabled=not txt):
        ctx = ag.Context(prices, universe, meta, profile, aligned["result"]["weights"], amt["value"], opts)
        with st.spinner("Interprète, analyste, explicateur et gouvernance au travail…"):
            ss.agent_run = ag.run(txt, ctx, level=acc["explanation_level"], vocabulary_help=acc["investment_experience"] in (None, "none", "beginner"))
        ss.agent_run_for = (txt, ss.name, json.dumps(a, sort_keys=True, default=str))
    run_ = ss.get("agent_run") if ss.get("agent_run_for") == (txt, ss.name, json.dumps(a, sort_keys=True, default=str)) else None
    if run_:
        mode_label = {"bedrock": "Amazon Bedrock", "offline": "hors ligne", "offline_after_error": "hors ligne après une erreur AWS"}[run_["mode"]]
        with st.container(border=True):
            verdict = (run_["check"] or {}).get("verdict")
            verdict_box(verdict)(run_["message"])
            gov = run_["governance"]
            if gov:
                note = "texte du modèle écarté, remplacé par le texte du code" if gov.get("fallback") else f"{gov['numbers_checked']} chiffre(s) vérifié(s) contre la trace des outils"
                st.caption(f"Contrôle de gouvernance : {'réussi' if gov['passed'] else 'échoué'} — {note}. Mode : {mode_label}.")
        with st.expander("Ce que chaque agent a fait"):
            st.dataframe(pd.DataFrame(run_["steps"]), hide_index=True, width="stretch")
        with st.expander("Reçu de décision : les calculs appelés et leurs résultats"):
            for t_ in run_["trace"]:
                st.markdown(f"**{t_['outil']}** — entrées : `{json.dumps(t_['entrees'], ensure_ascii=False)}` — données du {t_['fenetre'][0]} au {t_['fenetre'][1]}")
                st.json(t_["sortie"], expanded=False)
            st.caption(f"Source des données : {source}.")

    st.subheader("Explorer à la main")
    parsed = af.decide.parse_intention(txt, universe) if txt else {"tickers": [], "weight": None, "ok": False}
    if run_ and run_.get("intention") and run_["intention"].get("tickers"):
        parsed = {"tickers": run_["intention"]["tickers"], "weight": (run_["intention"].get("part_pct") or 10) / 100, "ok": True}
    i1, i2 = st.columns([2, 1])
    tickers = list(universe.index)
    default = parsed["tickers"][0] if parsed["tickers"] else None
    tk = i1.selectbox("Titre", tickers, index=tickers.index(default) if default else None,
                      format_func=lambda t: f"{universe.loc[t, 'name']} ({t})", placeholder="Choisir un titre")
    wt = i2.slider("Part du portefeuille (%)", 1, 50, min(50, max(1, int(round((parsed["weight"] or 0.10) * 100)))))
    if tk:
        chk = af.decide.check_intention(prices, profile, aligned["result"]["weights"], tk, wt / 100, meta, universe)
        verdict_box(chk["verdict"])(f"**{chk['verdict_label']}** — {wt} % dans {chk['name']}, comparé au scénario aligné sur le profil.")
        icon = {"ok": "✅", "info": "ℹ️", "warn": "⚠️", "conflict": "⛔"}
        st.markdown("\n".join(f"- {icon[c['status']]} {c['message']}" for c in chk["checks"]))
        if chk["verdict"] != "compatible" and chk["max_weight_within_profile"] > 0:
            st.markdown(f"**Ce qui resterait dans les limites du profil :** jusqu'à {q.fr_pct(chk['max_weight_within_profile'], 0)} de ce titre "
                        "garde la volatilité estimée et la concentration sous les plafonds. C'est une borne calculée, pas une suggestion d'achat.")
        elif chk["max_weight_within_profile"] == 0:
            st.markdown("**Aucune part de ce titre ne respecte toutes les limites du profil.**")
        bf, af_ = chk["before"], chk["after"]
        cmp_ = pd.DataFrame({
            "Mesure": ["Volatilité estimée", "Pire baisse historique", "Pires 12 mois", "Positions équivalentes", "Plus grosse position"],
            "Avant": [q.fr_pct(bf["ex_ante_vol"]), "−" + q.fr_pct(bf["max_drawdown"]), ("−" if bf["worst_1y"] < 0 else "+") + q.fr_pct(bf["worst_1y"]),
                      fr1(bf["effective_n"]), q.fr_pct(bf["max_weight"], 0)],
            "Après": [q.fr_pct(af_["ex_ante_vol"]), "−" + q.fr_pct(af_["max_drawdown"]), ("−" if af_["worst_1y"] < 0 else "+") + q.fr_pct(af_["worst_1y"]),
                      fr1(af_["effective_n"]), q.fr_pct(af_["max_weight"], 0)],
            "Limite du profil": [q.fr_pct(chk["limits"]["max_vol"], 0), "—", "—", "—", q.fr_pct(chk["limits"]["single_cap"], 0)],
        })
        st.dataframe(cmp_, hide_index=True, width="stretch")
        asset = chk["asset"]
        st.caption(f"{chk['name']} seul, du {q.fr_date(chk['data_window'][0])} au {q.fr_date(chk['data_window'][1])} : volatilité {q.fr_pct(asset['vol'])}, "
                   f"pire baisse −{q.fr_pct(asset['max_drawdown'])}, rendement annuel passé {q.fr_pct(asset['cagr'])}. Le rendement passé ne garantit pas le rendement futur.")
        st.markdown("**Que décidez-vous ?** Votre choix est noté dans le journal de ce portefeuille (simulation, aucune transaction).")
        d1, d2, d3 = st.columns(3)
        fit = chk["max_weight_within_profile"]
        for col_, choice_, label_, off_ in ((d1, "keep", "Je garde l'idée telle quelle", False),
                                            (d2, "adjust", f"Je la ramène à {q.fr_pct(fit, 0)}", chk["verdict"] == "compatible" or fit <= 0),
                                            (d3, "drop", "J'abandonne l'idée", False)):
            if col_.button(label_, key=f"dec_{choice_}", disabled=off_, width="stretch"):
                ss.journal.append(af.learn.idea_decision(chk, choice_))
                st.rerun()
        with st.expander("Reçu de décision : d'où vient chaque chiffre"):
            st.dataframe(pd.DataFrame(chk["trace"]).astype(str), hide_index=True, width="stretch")
            st.caption(f"Source des données : {source}.")

    # ---------------- détail d'un scénario ----------------
    st.header("Détail d'un scénario")
    pick = st.radio("Scénario à détailler", [o["key"] for o in opts], index=[o["key"] for o in opts].index("aligned"),
                    format_func={o["key"]: o["title"] for o in opts}.get, horizontal=True)
    chosen = next(o for o in opts if o["key"] == pick)
    res = chosen["result"]
    b = profile.budget(chosen["level"])
    s = res["stats"]
    c = st.columns(5)
    c[0].metric("Volatilité annuelle", q.fr_pct(s["vol"]), f"cible {q.fr_pct(0.85 * b['max_vol'], 0)} à {q.fr_pct(b['max_vol'], 0)}", delta_color="off")
    c[1].metric("Pire baisse", "−" + q.fr_pct(s["max_drawdown"]))
    c[2].metric(f"Pire baisse sur {q.fr_money(amt['value'])}", "−" + q.fr_money(amt["value"] * abs(s["max_drawdown"])))
    c[3].metric("Pires 12 mois", ("−" if s["worst_1y"] < 0 else "+") + q.fr_pct(s["worst_1y"]))
    c[4].metric("Positions équivalentes", fr1(res["concentration"]["effective_n"]))
    st.caption(f"Chiffres historiques du {q.fr_date(str(s['start']))} au {q.fr_date(str(s['end']))}, en dollars canadiens. "
               f"Rendement annuel sur cette période : {q.fr_pct(s['cagr'])}. Le rendement passé ne garantit pas le rendement futur. Source : {source}.")

    w = pd.Series(res["weights"]).sort_values(ascending=False)
    rc = pd.Series(res["risk_contributions"]).reindex(w.index)
    table = pd.DataFrame({"Nom": universe.loc[w.index, "name"], "Catégorie": universe.loc[w.index, "sector"],
                          "Poids": (w * 100).round(1), "Part du risque": (rc * 100).round(1)})
    g1, g2 = st.columns(2)
    g1.plotly_chart(style_fig(px.bar(table.reset_index(names="Titre").melt(id_vars="Titre", value_vars=["Poids", "Part du risque"], var_name="Mesure", value_name="%"),
                                     x="Titre", y="%", color="Mesure", barmode="group", title="Où va l'argent et d'où vient le risque")), width="stretch")
    value = m.portfolio_value(prices[res["universe"]].dropna(), res["weights"]) * amt["value"]
    g2.plotly_chart(style_fig(px.line(value.rename("Valeur ($ CA)"), title=f"Évolution historique de {q.fr_money(amt['value'])}, rééquilibrage trimestriel")), width="stretch")
    shown_table = table.copy()
    shown_table["Poids"] = [q.fr_pct(x / 100) for x in table["Poids"]]  # virgule décimale
    shown_table["Part du risque"] = [q.fr_pct(x / 100) for x in table["Part du risque"]]
    st.dataframe(shown_table, width="stretch")
    if res["binding"]:
        st.caption("Limites qui ont façonné ce scénario : " + " ; ".join(res["binding"]) + ".")
    if res["dropped"]:
        st.caption("Écartés : " + ", ".join(f"{t} ({why})" for t, why in res["dropped"].items()) + ".")

    with st.expander("Explication détaillée", expanded=acc["explanation_level"] == "detailed"):
        st.markdown(af.explain(profile, res, sources=[source], asset_class=meta["asset_class"], level=chosen["level"]))
    with st.expander("Hypothèses de classement"):
        st.markdown("- ZST.TO (obligations à très court terme) est traité comme quasi-liquidités.\n"
                    "- Plafond de 10 % par société et de 5 % par cryptoactif ; les fonds diversifiés suivent le plafond du profil (35 %).\n"
                    "- L'univers a été choisi en 2026 parmi des titres aujourd'hui importants (biais du survivant) : les chiffres passés sont flatteurs.")
    with st.expander("Corrélations"):
        st.plotly_chart(style_fig(px.imshow(m.returns(prices[list(w.index)]).corr().round(2), text_auto=True, zmin=-1, zmax=1, color_continuous_scale="RdBu_r")),
                        width="stretch")
    with st.expander("Qualité des données"):
        st.caption("Rapport produit par le code ; les intitulés de colonnes sont ceux du jeu de données de départ.")
        st.dataframe(af.quality_report(prices))


# ---------------- navigation ----------------
{"Découvrir": view_discover, "Ma liste": view_list, "Mon profil": view_profile, "Comparer et vérifier": view_compare}[ss.get("nav", "Découvrir")]()
