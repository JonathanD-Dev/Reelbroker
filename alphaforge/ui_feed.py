"""Aide pour l'interface du fil « Découvrir » : événements, persistance, mise en forme des cartes pour le composant.

Tout ici est du Python pur, testable sans navigateur. Règles :
- aucun chiffre n'est calculé ici : on met en forme (français canadien) ce que `feed` et `agents` ont calculé ;
- tout ce qui part vers le composant JavaScript passe par `json_safe` (pas de numpy, pas de NaN) ;
- les J'aime / Je n'aime pas ne font que réordonner le fil ; ils ne touchent jamais une limite de risque.

Contrat des événements (composant -> Python). La valeur du composant est `{"events": [e1, e2, ...]}` (les 20 derniers
événements envoyés, du plus ancien au plus récent) ; chaque événement est `{"nonce": "<sid>:<n>", "type": ..., "ticker": ..., "weight": ...}`.
Python traite chaque nonce une seule fois (`handle_event`) et renvoie la liste `acked` des nonces traités dans les arguments du composant.
Types : like, dislike, neutral, save, unsave, hide, simulate_purchase, expand, collapse, set_weight (`weight` en %, borné de 1 à 50).
"""
from __future__ import annotations

import json
import math
import os
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from . import feed
from . import questionnaire as q

ROOT = Path(__file__).resolve().parent.parent
COMPONENT_DIR = Path(__file__).resolve().parent / "components" / "swipe_card"
STATE_ENV = "ALPHAFORGE_FEED_STATE"
NB = " "

REACTION_EVENTS = ("like", "dislike", "neutral", "hide")  # font avancer la carte
EVENT_TYPES = REACTION_EVENTS + ("save", "unsave", "simulate_purchase", "expand", "collapse", "set_weight")
MIN_WEIGHT_PCT, MAX_WEIGHT_PCT = 1, 50
DEFAULT_WEIGHT = 0.05
QUEUE_SIZE = 6
MAX_NONCES = 300
PERSISTED_KEYS = ("liked", "disliked", "neutral", "hidden", "saved", "purchases")

VERDICT_TEXT = {"compatible": "Compatible avec le profil déclaré", "tension": "Tensions avec le profil déclaré",
                "conflict": "En conflit avec le profil déclaré"}
EXPLANATION_LEVELS = ("brief", "standard", "detailed")

LABELS = {
    "like": "J'aime", "dislike": "Je n'aime pas", "neutral": "Neutre", "like_hint": "Plus comme ça", "dislike_hint": "Moins comme ça",
    "neutral_hint": "Suivant", "more": "Voir plus", "less": "Voir moins", "why": "Pourquoi", "save": "Enregistrer dans Ma liste",
    "saved": "Enregistré dans Ma liste", "menu": "Plus d'options", "buy": "Simuler l'achat", "hide": "Ne plus me montrer cet actif",
    "loading": "Calcul en cours…", "history": "Prix passé", "stats": "Chiffres clés", "impact": "Effet sur le portefeuille de départ",
    "scenarios": "Scénarios hypothétiques sur 5 ans", "more_text": "Explication détaillée", "weight_prefix": "Si la position est de", "weight_suffix": "% du portefeuille",
    "before": "Avant", "after": "Après", "limit": "Limite du profil", "empty_title": "Vous avez parcouru tous les actifs du fil",
    "empty_text": "Les actifs enregistrés sont dans Ma liste. Vous pouvez remettre dans le fil ceux que vous avez déjà vus.",
    "kbd": "Flèches : ← J'aime · → Je n'aime pas · ↑ Neutre", "toast_saved": "Ajouté à Ma liste", "toast_unsaved": "Retiré de Ma liste",
    "toast_buy": "Ouverture de Ma liste (simulation)…", "toast_hide": "Cet actif ne sera plus montré", "pessimistic": "Cas pessimiste",
    "optimistic": "Cas optimiste", "central": "Médiane des scénarios (simple repère)", "range_title": "Fourchette sur 5 ans", "below_start": "des trajectoires simulées finissent sous la mise de départ",
    "mode_prefix": "Texte rédigé par", "governance_ok": "Contrôle de gouvernance réussi", "governance_ko": "Contrôle de gouvernance échoué", "at_weight": "Résultat pour",
    "simulation": "Simulation : aucun ordre n'est transmis.", "no_data": "Pas assez de données pour conclure.", "avoided": "À éviter si possible selon vos préférences",
    "log_scale": "échelle logarithmique", "start_amount": "Mise de départ", "year": "an", "years": "ans", "swipe_hint": "Glissez la carte ou utilisez les boutons",
}


# --------------------------------------------------------------------------------------------------------------------
# JSON sûr
# --------------------------------------------------------------------------------------------------------------------
def json_safe(obj):
    """Convertit récursivement en types JSON stricts : numpy -> Python, NaN/inf -> None, Timestamp -> texte, tuple/set -> liste."""
    if obj is None or isinstance(obj, (str, bool)):
        return obj
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if isinstance(obj, (int, np.integer)):
        return int(obj)
    if isinstance(obj, (float, np.floating)):
        f = float(obj)
        return f if math.isfinite(f) else None
    if isinstance(obj, (pd.Timestamp, date)):
        return str(obj)[:10]
    if isinstance(obj, dict):
        return {str(k): json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [json_safe(v) for v in obj]
    if isinstance(obj, (set, frozenset)):
        return [json_safe(v) for v in sorted(obj, key=str)]
    if isinstance(obj, np.ndarray):
        return json_safe(obj.tolist())
    if isinstance(obj, pd.Series):
        return json_safe(obj.to_dict())
    try:
        if pd.isna(obj):
            return None
    except (TypeError, ValueError):
        pass
    return str(obj)


# --------------------------------------------------------------------------------------------------------------------
# Mise en forme (français canadien)
# --------------------------------------------------------------------------------------------------------------------
def _nb(s: str) -> str:
    return s.replace(" ", NB)


def pct(x: float, d: int = 1) -> str:
    return _nb(q.fr_pct(x, d))


def spct(x: float, d: int = 1) -> str:
    """Pourcentage avec signe : −6,0 % ou +46,0 %."""
    return ("−" if x < 0 else "+") + pct(x, d)


def money(x: float) -> str:
    return _nb(q.fr_money(x))


def dec(x: float, d: int = 1) -> str:
    return f"{x:.{d}f}".replace(".", ",")


def short_date(iso: str) -> str:
    return q.fr_date(iso)


def initials(name: str, ticker: str) -> str:
    words = [w for w in name.replace("-", " ").split() if w and w[0].isalpha()]
    out = "".join(w[0] for w in words[:2]).upper()
    return out or ticker[:2].upper()


def hue_for(ticker: str) -> int:
    return sum((i + 1) * ord(ch) for i, ch in enumerate(ticker)) % 360


# --------------------------------------------------------------------------------------------------------------------
# Persistance : outputs/feed_state.json, clé = nom du profil (fictif)
# --------------------------------------------------------------------------------------------------------------------
def state_file() -> Path:
    env = os.environ.get(STATE_ENV)
    return Path(env) if env else ROOT / "outputs" / "feed_state.json"


def _read_all(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def load_state(name: str, path: Path | None = None) -> dict:
    """État du fil pour ce profil (listes de tickers, achats simulés), ou un état vide. Un fichier illisible donne un état vide."""
    state = feed.new_state()
    entry = _read_all(Path(path) if path else state_file()).get("profiles", {}).get(name, {})
    for k in PERSISTED_KEYS:
        v = entry.get(k)
        if isinstance(v, list):
            state[k] = [x for x in v if (isinstance(x, str) if k != "purchases" else isinstance(x, dict))]
    return state


def save_state(name: str, state: dict, path: Path | None = None) -> Path:
    """Écrit l'état de ce profil dans le fichier (les autres profils sont conservés). Aucune donnée personnelle hors du nom fictif."""
    p = Path(path) if path else state_file()
    data = _read_all(p)
    profiles = data.get("profiles") if isinstance(data.get("profiles"), dict) else {}
    profiles[name] = {**{k: json_safe(state.get(k, [])) for k in PERSISTED_KEYS}, "updated": str(date.today())}
    out = {"note": "Fil de découverte ReelBroker : réactions, liste enregistrée et achats SIMULÉS (aucune transaction réelle).", "profiles": profiles}
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(p)
    return p


def clear_state(name: str, path: Path | None = None) -> None:
    p = Path(path) if path else state_file()
    data = _read_all(p)
    if isinstance(data.get("profiles"), dict) and name in data["profiles"]:
        del data["profiles"][name]
        p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def saved_list_export(name: str, state: dict, universe: pd.DataFrame, cards: dict | None = None) -> dict:
    """Contenu du bouton « Télécharger la liste » : actifs enregistrés avec leur verdict à la date du jour."""
    rows = []
    for t in state["saved"]:
        c = (cards or {}).get(t)
        rows.append({"ticker": t, "name": str(universe.loc[t, "name"]) if t in universe.index else t,
                     "verdict_at_5pct": c["fit"]["verdict"] if c else None})
    return json_safe({"profile": name, "date": str(date.today()), "simulation_only": True, "saved": rows, "simulated_purchases": state["purchases"]})


# --------------------------------------------------------------------------------------------------------------------
# État d'interface (nonces, poids choisis, carte ouverte) et événements
# --------------------------------------------------------------------------------------------------------------------
def new_ui() -> dict:
    return {"nonces": [], "acked": [], "last_nonce": None, "weights": {}, "expanded": None, "include_seen": False, "selection": []}


def clamp_weight_pct(v) -> int | None:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(f):
        return None
    return int(max(MIN_WEIGHT_PCT, min(MAX_WEIGHT_PCT, round(f))))


def handle_event(store, event, valid_tickers=None) -> dict:
    """Applique un événement du composant à `store["feed_state"]` et `store["feed_ui"]` (un dict ou `st.session_state`).

    Retourne {"status": "ok"|"duplicate"|"invalid", "navigate": nom de vue ou None, "persist": bool, "need": None|"detail"|"impact", "ticker": ...}.
    Un nonce déjà vu est ignoré ; un événement mal formé, d'un type inconnu ou d'un ticker inconnu est ignoré sans erreur."""
    res = {"status": "invalid", "navigate": None, "persist": False, "need": None, "ticker": None, "type": None}
    if not isinstance(event, dict):
        return res
    nonce, typ, ticker = event.get("nonce"), event.get("type"), event.get("ticker")
    if not isinstance(nonce, str) or not nonce or typ not in EVENT_TYPES or not isinstance(ticker, str):
        return res
    if valid_tickers is not None and ticker not in valid_tickers:
        return res
    ui, state = store["feed_ui"], store["feed_state"]
    if nonce in ui["nonces"]:
        return {**res, "status": "duplicate", "ticker": ticker, "type": typ}
    if typ == "set_weight":
        w = clamp_weight_pct(event.get("weight"))
        if w is None:
            return res
        ui["weights"][ticker] = w / 100
        res["need"] = "impact"
    ui["nonces"] = (ui["nonces"] + [nonce])[-MAX_NONCES:]
    ui["last_nonce"] = nonce
    res.update(status="ok", ticker=ticker, type=typ)
    if typ in ("like", "dislike", "neutral", "hide", "save", "unsave"):
        feed.react(state, ticker, typ)
        res["persist"] = True
        if typ in REACTION_EVENTS and ui["expanded"] == ticker:
            ui["expanded"] = None
    elif typ == "simulate_purchase":
        feed.react(state, ticker, "save")
        ui["selection"], ui["expanded"] = [ticker], None
        res.update(navigate="Ma liste", persist=True)
    elif typ == "expand":
        ui["expanded"], res["need"] = ticker, "detail"
    elif typ == "collapse":
        ui["expanded"] = None
    return res


def process_events(store, value, valid_tickers=None) -> dict:
    """Traite la valeur brute du composant (`{"events": [...]}` ou None). Retourne le résumé : changed, navigate, persist, needs."""
    out = {"changed": False, "navigate": None, "persist": False, "needs": [], "results": []}
    events = value.get("events") if isinstance(value, dict) else None
    if not isinstance(events, list):
        return out
    ui = store["feed_ui"]
    for ev in events:
        r = handle_event(store, ev, valid_tickers)
        if isinstance(ev, dict) and isinstance(ev.get("nonce"), str) and ev["nonce"] not in ui["acked"]:
            ui["acked"] = (ui["acked"] + [ev["nonce"]])[-MAX_NONCES:]  # accusé de réception, même pour un événement ignoré
        out["results"].append(r)
        if r["status"] != "ok":
            continue
        out["changed"] = True
        out["persist"] = out["persist"] or r["persist"]
        out["navigate"] = r["navigate"] or out["navigate"]
        if r["need"]:
            out["needs"].append((r["need"], r["ticker"]))
    return out


# --------------------------------------------------------------------------------------------------------------------
# Fil : cartes calculées une fois, réordonnées à chaque réaction
# --------------------------------------------------------------------------------------------------------------------
def make_deck(prices, universe, meta, profile, base_weights: dict, amount: float) -> dict:
    """Toutes les cartes du fil, calculées une seule fois (environ 4 s), plus le contexte de réordonnancement."""
    cards = feed.build_feed(prices, universe, meta, profile, base_weights, feed.new_state(), amount=amount, weight=DEFAULT_WEIGHT, include_seen=True)
    return {"cards": {c["ticker"]: c for c in cards}, "order": [c["ticker"] for c in cards], "ctx": feed._Ctx(prices, base_weights), "amount": amount}


def ranked(deck: dict, universe, state: dict, ui: dict, n: int | None = None) -> list[dict]:
    out = feed.rerank(list(deck["cards"].values()), deck["ctx"], universe, state, include_seen=ui["include_seen"], saved_is_seen=False)
    return out[:n] if n else out


# --------------------------------------------------------------------------------------------------------------------
# Mise en forme des charges utiles
# --------------------------------------------------------------------------------------------------------------------
def impact_payload(block: dict, fit: dict, weight: float) -> dict:
    """Barres « avant / après » pour une part donnée. `block` vient de `card["impact"]` ou de `impact_for_weight(...)["impact"]`."""
    b, a, lim = block["before"], block["after"], block["limits"]
    amount = block["amount"]
    bars = [
        {"key": "vol", "label": "Volatilité estimée", "before": b["ex_ante_vol"], "after": a["ex_ante_vol"], "limit": lim.get("max_vol"),
         "before_label": pct(b["ex_ante_vol"]), "after_label": pct(a["ex_ante_vol"]), "limit_label": pct(lim["max_vol"], 0) if lim.get("max_vol") else None},
        {"key": "dd", "label": "Pire baisse historique", "before": abs(b["max_drawdown"]), "after": abs(a["max_drawdown"]), "limit": None,
         "before_label": "−" + pct(b["max_drawdown"]), "after_label": "−" + pct(a["max_drawdown"]),
         "sub_after": f"environ −{money(abs(a['max_drawdown_amount']))} sur {money(amount)}", "limit_label": None},
        {"key": "growth", "label": "Part des actifs de croissance", "before": b["growth_share"], "after": a["growth_share"], "limit": None,
         "before_label": pct(b["growth_share"], 0), "after_label": pct(a["growth_share"], 0), "limit_label": None},
    ]
    sev = {"ok": "ok", "info": "info", "warn": "warn", "conflict": "conflict"}
    checks = [{"status": sev.get(c["status"], "info"), "message": c["message"]} for c in fit["checks"]]
    return json_safe({
        "weight_pct": int(round(weight * 100)), "verdict": fit["verdict"], "verdict_text": VERDICT_TEXT[fit["verdict"]], "bars": bars, "checks": checks,
        "max_fit": (f"Jusqu'à {pct(fit['max_weight_within_profile'], 0)} de cet actif reste dans les limites du profil (borne calculée, pas une suggestion)."
                    if fit["verdict"] != "compatible" and fit["max_weight_within_profile"] > 0 else
                    "Aucune part de cet actif ne respecte toutes les limites du profil." if fit["max_weight_within_profile"] <= 0 else None),
        "window": f"Données du {short_date(block['window'][0])} au {short_date(block['window'][1])}, en dollars canadiens.", "note": block["note"],
    })


def front_payload(card: dict, short: str, saved: bool = False) -> dict:
    """Face de la carte et ce qui sert à la vue détaillée sans calcul supplémentaire."""
    h, fit = card["history"], card["fit"]
    series = [p["value"] for p in card["history"]["series"]]
    dates = [p["date"] for p in card["history"]["series"]]
    window = f"Du {short_date(h['window'][0])} au {short_date(h['window'][1])}"
    under = h["underwater"]
    stats = [
        {"label": "Rendement annuel passé", "value": spct(h["cagr"]), "hint": window},
        {"label": "Volatilité annuelle", "value": pct(h["vol"]), "hint": window},
        {"label": "Pire baisse", "value": "−" + pct(h["max_drawdown"]), "hint": window},
        {"label": "Pires 12 mois", "value": spct(h["worst_1y"]), "hint": window},
        {"label": "Plus longue période sous un sommet", "value": f"{dec(h['years_underwater'], 1)} an(s)" + ("" if under.get("recovered") else " (non terminée)"), "hint": window},
    ]
    return json_safe({
        "ticker": card["ticker"], "name": card["name"], "sector": card.get("sector") or "", "class_label": card["asset_class_label"],
        "initials": initials(card["name"], card["ticker"]), "hue": hue_for(card["ticker"]),
        "verdict": fit["verdict"], "verdict_text": VERDICT_TEXT[fit["verdict"]],
        "verdict_sub": f"à {pct(fit['weight'], 0)} du portefeuille de départ · simulation, pas une recommandation",
        "avoided": bool(card["avoided"]), "short": short, "reasons": list(card["reasons"]), "similarity_note": card.get("similarity_note"),
        "spark": series, "spark_dates": [short_date(dates[0]), short_date(dates[-1])], "window": window + ", en dollars canadiens",
        "chips": [{"label": "Volatilité", "value": pct(h["vol"])}, {"label": "Pire baisse", "value": "−" + pct(h["max_drawdown"])}],
        "stats": stats, "impact": impact_payload(card["impact"], fit, fit["weight"]), "saved": bool(saved),
    })


def scenario_payload(sc: dict) -> dict:
    """Vue des scénarios : pessimiste et optimiste mis à égalité, jamais la médiane seule ; l'avertissement est un champ à part entière."""
    amount, years = sc["amount"], sc["years"]
    ratio = sc["p95"] / max(sc["p5"], 1e-9)
    return json_safe({
        "amount_label": money(amount), "years": years, "window": f"Historique du {short_date(sc['data_window'][0])} au {short_date(sc['data_window'][1])}",
        "headline": f"Entre {money(sc['p5'])} et {money(sc['p95'])} après {years} ans pour {money(amount)} investis (du 5e au 95e centile des scénarios).",
        "p5": sc["p5"], "p50": sc["p50"], "p95": sc["p95"], "amount": amount,
        "p5_label": money(sc["p5"]), "p50_label": money(sc["p50"]), "p95_label": money(sc["p95"]),
        "p5_ann": spct(sc["p5_annualized"]) + " par an", "p95_ann": spct(sc["p95_annualized"]) + " par an", "p50_ann": spct(sc["p50_annualized"]) + " par an",
        "share_below": pct(sc["share_below_start"], 0), "share_below_value": sc["share_below_start"],
        "worst_label": money(sc["worst_simulated"]), "best_label": money(sc["best_simulated"]),
        "fan": [{"year": f["year"], "p5": f["p5"], "p50": f["p50"], "p95": f["p95"]} for f in sc["fan"]], "log_scale": bool(ratio > 5),
        "disclaimer": sc["disclaimer"], "method": f"{sc['method']} ; {sc['n_sims']} trajectoires, graine {sc['seed']}.", "labels": sc["labels"],
    })


def explanation_payload(expl: dict | None, fallback_reasons: list[str]) -> dict:
    """Texte détaillé, mode de rédaction et résultat de la gouvernance. Sans explication, on retombe sur les raisons calculées."""
    if not expl:
        return {"long": "\n\n".join(fallback_reasons), "mode": "offline", "mode_label": "texte du code (hors ligne)", "governance": None, "steps": []}
    mode = expl.get("mode", "offline")
    mode_label = {"bedrock": "Amazon Bedrock", "offline": "hors ligne", "offline_after_error": "hors ligne après une erreur AWS"}.get(mode, str(mode))
    g = expl.get("governance")
    gov = None
    if g:
        note = ("texte du modèle écarté, remplacé par le texte du code" if g.get("fallback")
                else f"{g.get('numbers_checked', 0)} chiffre(s) vérifié(s) contre les calculs de la carte")
        gov = {"passed": bool(g.get("passed")), "text": f"{'Réussi' if g.get('passed') else 'Échoué'} : {note}.", "issues": list(g.get("issues") or [])}
    return json_safe({"long": expl.get("long") or "\n\n".join(fallback_reasons), "mode": mode, "mode_label": mode_label, "governance": gov, "steps": expl.get("steps") or []})


def detail_payload(card_with_scenarios: dict, expl: dict | None, impact: dict | None = None) -> dict:
    out = {"ticker": card_with_scenarios["ticker"], "explanation": explanation_payload(expl, card_with_scenarios["reasons"])}
    sc = card_with_scenarios.get("scenarios")
    out["scenarios"] = scenario_payload(sc) if sc else None
    if impact is not None:
        out["impact"] = impact
    return json_safe(out)


def build_args(front_cards: list[dict], details: dict, acked: list[str], saved: list[str], theme_hint: str | None = None) -> dict:
    """Arguments passés au composant (déjà sûrs pour JSON)."""
    return json_safe({"queue": front_cards, "details": details, "acked": acked[-80:], "saved": list(saved), "labels": LABELS, "theme_hint": theme_hint,
                      "version": 1})


# --------------------------------------------------------------------------------------------------------------------
# Composant Streamlit
# --------------------------------------------------------------------------------------------------------------------
_component = None


def swipe_card(**kwargs):
    """Appelle le composant `swipe_card` (déclaré à la première utilisation)."""
    global _component
    if _component is None:
        import streamlit.components.v1 as components

        _component = components.declare_component("swipe_card", path=str(COMPONENT_DIR))
    return _component(**kwargs)


def level_for(acc: dict) -> str:
    v = (acc or {}).get("explanation_level")
    return v if v in EXPLANATION_LEVELS else "standard"
