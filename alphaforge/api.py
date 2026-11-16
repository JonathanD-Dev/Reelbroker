"""API HTTP de ReelBroker (FastAPI) : sert l'interface React de `web/`. Contrat : docs/api-contract.md.

Règles : le code calcule, le modèle explique ; simulation seulement (aucun ordre n'est transmis, `simulated: true`) ; jamais d'erreur 500
sur une entrée utilisateur (404 inconnu, 422 invalide). Les profils sont fictifs, gardés en mémoire et dans outputs/profiles.json
(chemin modifiable par la variable ALPHAFORGE_PROFILES).
"""
from __future__ import annotations

import colorsys
import hashlib
import json
import logging
import os
import threading
import time
import uuid
from concurrent.futures import Future
from contextlib import asynccontextmanager
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import agents, decide, feed, learn
from . import card_extras as cx
from . import metrics as m
from . import questionnaire as q
from .allocate import allocate
from .data import load_universe, starter_metadata
from .profile import LEVEL_FR
from .ui_feed import json_safe

log = logging.getLogger("alphaforge.api")
ROOT = Path(__file__).resolve().parent.parent
VERSION = "0.1.0"
SOURCE = "alphaforge_starter (Yahoo Finance adj_close, BoC FX)"
SOURCE_EXTENDED = "univers étendu ReelBroker (Yahoo Finance via yfinance, Adj Close, téléchargé par notre script ; BoC FX)"
DISCLAIMER = "Scénarios hypothétiques, pas une prévision ni un conseil financier. Les rendements passés ne garantissent pas les rendements futurs."
DEFAULT_WEIGHT = 0.05
PROFILES_ENV = "ALPHAFORGE_PROFILES"
_COMPUTE = threading.RLock()  # un seul gros calcul à la fois (allocation, fil, scénarios)
# Calcul du fil d'un profil (~2,5 s, lectures seules des prix) : verrou à part, pour ne pas attendre derrière un appel
# Bedrock du pipeline (~17 s) qui tient `_COMPUTE` pendant le préchauffage des détails.
_FEED_COMPUTE = threading.Lock()


# ---------------------------------------------------------------------------------------------------------------------
# Données (chargées une fois)
# ---------------------------------------------------------------------------------------------------------------------
class _Data:
    def __init__(self):
        from .data import EXTENDED_DIR, STARTER_DIR
        # jeu de départ + univers étendu (le jeu de départ gagne en cas de doublon ; repli silencieux sur le jeu de départ seul)
        self.prices, self.universe = load_universe(ROOT / STARTER_DIR, extended_folder=ROOT / EXTENDED_DIR)
        self.meta = starter_metadata(self.universe)
        self.scenarios = q.load_scenarios(ROOT / q.SCENARIOS_FILE)
        self.as_of = str(self.prices.index[-1].date())
        self.window = [str(self.prices.index[0].date()), self.as_of]


_DATA: _Data | None = None


def data() -> _Data:
    global _DATA
    if _DATA is not None:  # read-only once loaded: no lock, so the feed never waits behind a Bedrock call holding `_COMPUTE`
        return _DATA
    with _COMPUTE:
        if _DATA is None:
            _DATA = _Data()
        return _DATA


# ---------------------------------------------------------------------------------------------------------------------
# Profils (mémoire + fichier)
# ---------------------------------------------------------------------------------------------------------------------
class _Rec:
    """Un profil : réponses, profil du moteur, état du fil, journal des décisions."""

    def __init__(self, pid: str, name: str, answers: dict, persona: str | None = None, state: dict | None = None, journal: list | None = None, tol_override: int | None = None, decision_ids: list | None = None):
        self.id, self.name, self.answers, self.persona = pid, name, answers, persona
        self.state = state or feed.new_state()
        self.journal = journal or []
        d = data()
        self.declared = q.build_declared(answers, scenarios=d.scenarios)
        self.profile, self.notes = q.to_profile(self.declared, name)
        self.tol_override = tol_override
        self.decision_ids: list[str] = list(decision_ids or [])
        if tol_override:
            self.notes.append(f"Tolérance déclarée mise à jour par vous à {tol_override} sur 5. L'objectif, l'horizon et la capacité n'ont pas changé.")
            self.profile = learn.with_tolerance(self.profile, tol_override)
        self.amount = float(self.declared["portfolio"]["risk_tolerance"]["illustration_amount"]["value"])

    def dump(self) -> dict:
        return {"id": self.id, "name": self.name, "persona": self.persona, "answers": self.answers,
                "state": json_safe({k: list(v) for k, v in list(self.state.items())}), "journal": json_safe(list(self.journal)), "tol_override": self.tol_override, "decision_ids": list(self.decision_ids)}


_PROFILES: dict[str, _Rec] = {}
_LOADED = False


def profiles_path() -> Path:
    env = os.environ.get(PROFILES_ENV)
    return Path(env) if env else ROOT / "outputs" / "profiles.json"


_PERSIST_LOCK = threading.Lock()


def _persist() -> None:
    try:
        with _PERSIST_LOCK:
            p = profiles_path()
            p.parent.mkdir(parents=True, exist_ok=True)
            payload = {"note": "Profils fictifs ReelBroker (simulation seulement).", "profiles": [r.dump() for r in list(_PROFILES.values())]}
            tmp = p.with_name(f"{p.name}.{uuid.uuid4().hex[:8]}.tmp")
            tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
            os.replace(tmp, p)
    except OSError as e:  # l'écriture est un confort : on continue en mémoire
        log.warning("profiles.json non écrit : %s", e)


def _load_profiles() -> None:
    global _LOADED
    if _LOADED:
        return
    _LOADED = True
    try:
        raw = json.loads(profiles_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return
    for e in raw.get("profiles", []) if isinstance(raw, dict) else []:
        try:
            st = feed.new_state()
            for k in st:
                if isinstance(e.get("state", {}).get(k), list):
                    st[k] = e["state"][k]
            _PROFILES[e["id"]] = _Rec(e["id"], e["name"], e["answers"], e.get("persona"), st, e.get("journal") or [], e.get("tol_override"), e.get("decision_ids"))
        except Exception as ex:  # profil illisible : on l'ignore
            log.warning("profil ignoré : %s", ex)


def get_rec(pid: str) -> _Rec:
    _load_profiles()
    rec = _PROFILES.get(pid)
    if rec is None:
        raise HTTPException(404, f"Profil inconnu : {pid}")
    return rec


# ---------------------------------------------------------------------------------------------------------------------
# Calculs par profil (cache partagé entre profils identiques)
# ---------------------------------------------------------------------------------------------------------------------
_FUTURES: dict[str, Future] = {}
_FUT_LOCK = threading.Lock()
_DETAILS: dict[tuple, dict] = {}
_WARM_DONE: set[str] = set()
WARM_CARDS = 8
# Génération du cache de chaque profil : `_evict` l'incrémente, et un calcul commencé avant (préchauffage, fiche) n'écrit
# plus rien dans les caches en mémoire et s'arrête au lieu d'appeler Bedrock pour un profil périmé.
_GEN: dict[str, int] = {}


def _snap(rec: _Rec) -> dict:
    """Instantané immuable du profil au moment de l'appel : profil du moteur, montant, clé de cache (profil + montant + identifiant)."""
    prof, amount = rec.profile, rec.amount
    return {"rec": rec, "profile": prof, "amount": amount, "gen": _GEN.get(rec.id, 0),
            "key": json.dumps([rec.id, amount, prof.__dict__], sort_keys=True, default=str)}


def _fingerprint(snap: dict) -> str:
    """Empreinte courte des paramètres du profil (clé du cache disque des textes Bedrock personnalisés)."""
    return hashlib.sha1(snap["key"].encode("utf-8")).hexdigest()[:16]


def _pid_of_key(key: str) -> str | None:
    try:
        return json.loads(key)[0]
    except (ValueError, TypeError, IndexError):
        return None


def _stale(snap: dict) -> bool:
    return _GEN.get(snap["rec"].id, 0) != snap["gen"]


def _evict(pid: str, disk: bool) -> dict:
    """Vide les caches d'un profil : fil et fiches en mémoire, et avec `disk` ses textes Bedrock personnalisés sur disque.
    Sans verrou de calcul (une fiche peut tenir `_COMPUTE` pendant un appel Bedrock) : les opérations sur les dict sont atomiques,
    et la génération empêche un calcul en cours de réécrire une entrée périmée."""
    with _FUT_LOCK:
        _GEN[pid] = _GEN.get(pid, 0) + 1
        futures = [k for k in list(_FUTURES) if _pid_of_key(k) == pid]
        for k in futures:
            _FUTURES.pop(k, None)
        for k in [k for k in list(_WARM_DONE) if _pid_of_key(k) == pid]:
            _WARM_DONE.discard(k)
    details = [k for k in list(_DETAILS) if _pid_of_key(k[0]) == pid]
    for k in details:
        _DETAILS.pop(k, None)
    files = 0
    if disk:
        from . import pipeline
        files = pipeline.clear_profile_cache(pid)
    log.info("cache du profil %s vidé : %d fil(s), %d fiche(s), %d texte(s) Bedrock", pid, len(futures), len(details), files)
    return {"feeds": len(futures), "cards": len(details), "texts": files}


def _ctx_key(rec: _Rec) -> str:
    return _snap(rec)["key"]


def _compute_ctx(profile, amount: float) -> dict:
    d = data()
    with _FEED_COMPUTE:
        try:  # seulement le scénario aligné (les deux autres options de `decide.options` ne servent pas ici) : même résultat, 3 fois moins de calcul
            base = allocate(d.prices, profile, objective="max_diversification", level=profile.effective_risk(), **d.meta)["weights"]
        except Exception as e:
            raise HTTPException(422, f"Aucun scénario ne respecte toutes les contraintes de ce profil ({type(e).__name__}).")
        cards = feed.build_feed(d.prices, d.universe, d.meta, profile, base, feed.new_state(), amount=amount, weight=DEFAULT_WEIGHT, include_seen=True)
        return {"base": base, "cards": {c["ticker"]: c for c in cards}, "fctx": feed._Ctx(d.prices, base)}


def _warm(snap: dict, fut: Future) -> None:
    """Thread d'arrière-plan : fil complet, puis détails des premières cartes. Travaille sur l'instantané, jamais sur le profil vivant."""
    try:
        fut.set_result(_compute_ctx(snap["profile"], snap["amount"]))
    except BaseException as e:  # noqa: BLE001
        fut.set_exception(e)
        return
    try:
        c = fut.result()
        order = [x["ticker"] for x in feed.rerank(list(c["cards"].values()), c["fctx"], data().universe, feed.new_state(), include_seen=True)]
        for t in order[:WARM_CARDS]:
            if _stale(snap):  # profil modifié ou fil rafraîchi pendant le préchauffage : un nouveau préchauffage a pris le relais
                return
            _details(snap["rec"], t, 10, DEFAULT_WEIGHT, snap)
        if not _stale(snap):
            _WARM_DONE.add(snap["key"])
    except Exception as e:  # le préchauffage est un confort
        log.info("préchauffage des détails interrompu : %s", e)


def _start_warm(rec: _Rec, snap: dict | None = None) -> Future:
    snap = snap or _snap(rec)
    with _FUT_LOCK:
        fut = _FUTURES.get(snap["key"])
        if fut is None or (fut.done() and fut.exception() is not None):
            fut = _FUTURES[snap["key"]] = Future()
            threading.Thread(target=_warm, args=(snap, fut), daemon=True, name="af-warm").start()
        return fut


def _ctx(rec: _Rec, snap: dict | None = None) -> dict:
    """Portefeuille de départ et fil complet pour l'instantané donné (attend le calcul en cours s'il y en a un).
    Ne JAMAIS appeler en tenant `_COMPUTE` : on attendrait un thread qui attend ce verrou."""
    return _start_warm(rec, snap).result()


def source_of(ticker: str) -> str:
    """Source des prix d'un titre : jeu de départ des organisateurs, ou notre propre téléchargement (univers étendu)."""
    u = data().universe
    return SOURCE_EXTENDED if "source" in u.columns and u.loc[ticker, "source"] == "extended" else SOURCE


def brand_color(ticker: str) -> str:
    h = int(hashlib.md5(ticker.encode()).hexdigest()[:8], 16)
    r, g, b = colorsys.hls_to_rgb((h % 360) / 360, 0.42, 0.62)
    return f"#{int(r * 255):02x}{int(g * 255):02x}{int(b * 255):02x}"


@lru_cache(maxsize=256)  # whole universe (91 tickers): a full pass must not evict
def _ticker_series(ticker: str) -> dict:
    """Prix, historique 12 mois, valeur de 10 000 $ et mesures d'un titre (indépendants du profil)."""
    d = data()
    p = d.prices[ticker].dropna()
    last12 = p[p.index >= p.index[-1] - pd.DateOffset(months=12)]
    lab = lambda s, n: [{"label": str(s.index[i].date()), "value": round(float(s.iloc[i]), 2)}  # noqa: E731
                        for i in np.unique(np.linspace(0, len(s) - 1, n).round().astype(int))]
    growth = p / float(p.iloc[0]) * 10000.0
    return {"price": round(float(p.iloc[-1]), 2), "h12": lab(last12, 52), "h5": lab(growth, 60),
            "sharpe": float(m.sharpe(m.returns(p))), "window": [str(p.index[0].date()), str(p.index[-1].date())]}


def to_api_card(c: dict) -> dict:
    t = c["ticker"]
    s = _ticker_series(t)
    h = c["history"]
    reasons = list(c["reasons"]) + ([c["similarity_note"]] if c.get("similarity_note") else [])
    tags = [x for x in dict.fromkeys([c.get("sector") or "", c.get("asset_class_label") or ""] + (data().meta["tags"].get(t) or [])) if x]
    return json_safe({
        "ticker": t, "name": c["name"], "sector": c.get("sector") or "", "asset_class": c.get("asset_class") or "", "currency": "CAD",
        "price": s["price"], "as_of": data().as_of, "brandColor": brand_color(t),
        "fit": {"verdict": c["fit"]["verdict"], "label": c["fit"]["label"], "weight": c["fit"]["weight"]},
        "reasons": reasons,
        "history": [{"title": "Cours (12 mois)", "points": s["h12"]}, {"title": "Valeur de 10 000 $ sur 5 ans", "points": s["h5"]}],
        "stats": {"cagr": h["cagr"], "vol": h["vol"], "max_drawdown": h["max_drawdown"], "sharpe": s["sharpe"], "worst_1y": h["worst_1y"], "window": s["window"]},
        "tags": tags, "source": source_of(t),
        "extras": _card_extras(t, round(float(h["vol"]), 6)),
    })


@lru_cache(maxsize=256)
def _card_extras(t: str, vol: float) -> dict:
    """Profile-independent facts of a card (card_extras.py): price / dividend split, risk tags, sources.
    `vol` is the card's own annualised volatility, so the "Marché" tag matches the figure shown."""
    d = data()
    u = d.universe.loc[t] if t in d.universe.index else None
    p = d.prices[t].dropna()
    window = [str(p.index[0].date()), str(p.index[-1].date())]
    currency = str(u["currency"]) if u is not None else "CAD"
    asset_class = str(u["asset_class"]) if u is not None else ""
    extended = u is not None and "source" in d.universe.columns and u["source"] == "extended"
    return {
        "income": cx.income_split(str(ROOT), t),
        "risk_tags": cx.risk_tags(asset_class, str(u["sector"]) if u is not None else "", currency, vol, window),
        "sources": cx.sources(t, currency, bool(extended), int(len(p)), window),
    }


def _state_out(state: dict) -> dict:
    return {k: list(state[k]) for k in ("liked", "disliked", "neutral", "hidden", "saved")}


# ---------------------------------------------------------------------------------------------------------------------
# Scénarios et pipeline (outlook)
# ---------------------------------------------------------------------------------------------------------------------
@lru_cache(maxsize=64)
def _scen(ticker: str, amount: float) -> dict:
    return feed.scenarios_5y(data().prices, ticker, amount)


def _fallback_outlook(ticker: str, quantity: float) -> dict:
    """Scénarios de `feed.scenarios_5y` (rééchantillonnage par blocs) mis au format `outlook` : 61 points mensuels interpolés."""
    price = _ticker_series(ticker)["price"]
    start = round(price * quantity, 2)
    sc = _scen(ticker, start)
    years = np.array([f["year"] for f in sc["fan"]]) * 12
    months = np.arange(0, 61)

    def path(key: str) -> list[dict]:
        vals = np.interp(months, years, [f[key] for f in sc["fan"]])
        return [{"month": int(mo), "value": round(float(v), 2)} for mo, v in zip(months, vals)]

    def block(label: str, key: str, ann: str, fin: str) -> dict:
        return {"label": label, "annual": sc[ann], "final": sc[fin], "path": path(key)}

    return {
        "horizon_years": 5, "start_value": start, "quantity": quantity, "currency": "CAD",
        "scenarios": {"best": block("Scénario favorable", "p90", "p90_annualized", "p90"),
                      "central": block("Notre scénario central", "p50", "p50_annualized", "p50"),
                      "worst": block("Scénario défavorable", "p10", "p10_annualized", "p10")},
        "share_below_start": sc["share_below_start"], "method": sc["method"],
        "assumptions": [f"Rendements quotidiens réels rejoués par blocs de {sc['block_days']} jours de bourse ({sc['n_sims']} trajectoires, graine {sc['seed']}).",
                        f"Fenêtre de données : {sc['data_window'][0]} au {sc['data_window'][1]} ({sc['n_obs']} observations), en dollars canadiens.",
                        "Cas favorable = 90e centile, central = médiane, défavorable = 10e centile (comme le pipeline à quatre agents) ; courbes mensuelles interpolées entre points annuels."],
        "limits": ["Environ cinq ans d'historique seulement, sur un univers choisi en 2026 (biais du survivant).",
                   "Le passé est rejoué : un titre qui a bien fait donne un scénario central élevé, ce qui ne dit rien de son avenir.",
                   "Des pertes supérieures au cas défavorable sont possibles."],
        "disclaimer": DISCLAIMER,
    }


def _outlook_ok(o: Any) -> bool:
    try:
        sc = o["scenarios"]
        return all(len(sc[k]["path"]) == 61 for k in ("best", "central", "worst")) and bool(o.get("disclaimer"))
    except Exception:
        return False


def _offline() -> bool:
    return not agents.bedrock_available()


def _fallback_explanation(card: dict | None, profile, ticker: str, quantity: float, force_offline: bool) -> dict:
    try:
        if card is None or profile is None:
            raise ValueError("pas de profil")
        c = dict(card)
        c["scenarios"] = _scen(ticker, round(_ticker_series(ticker)["price"] * quantity, 2))  # montant = quantité x prix, comme l'outlook
        out = agents.explain_card(c, profile, force_offline=force_offline)
        return {"mode": out["mode"], "short": out["short"], "long": out["long"], "governance": out["governance"]}
    except Exception as e:
        return {"mode": "offline", "short": "", "long": "",
                "governance": {"passed": False, "issues": [f"Explication non produite ({type(e).__name__}) : {str(e)[:120]}"]}}


def run_pipeline(ticker: str, quantity: float = 10, force_offline: bool = False, use_network: bool = False, card: dict | None = None, profile=None,
                 scope: tuple[str, str] | None = None) -> dict:
    """`alphaforge.pipeline.run` si disponible ; sinon repli (scénarios du fil, pipeline vide avec une note). Ne lève jamais.
    Avec `scope` = (identifiant du profil, empreinte) : texte Bedrock adapté à `profile`, en cache par profil."""
    d = data()
    try:
        from . import pipeline  # écrit par un autre module : import tardif
        personal = {"profile": profile, "scope": scope} if scope and profile is not None else {}
        out = pipeline.run(ticker, quantity=quantity, force_offline=force_offline, use_network=use_network, **personal)
        if _outlook_ok(out.get("outlook")) and isinstance(out.get("pipeline"), dict):
            return {"outlook": out["outlook"], "pipeline": out["pipeline"]}
        log.warning("pipeline.run : forme inattendue, repli")
    except Exception as e:
        log.info("pipeline indisponible (%s) : repli sur feed.scenarios_5y", type(e).__name__)
    s = _ticker_series(ticker)
    return {
        "outlook": _fallback_outlook(ticker, quantity),
        "pipeline": {
            "sources": [], "fact_check": {"passed": False, "checks": [{"name": "pipeline_disponible", "ok": False,
                                                                       "detail": "Le pipeline à quatre agents n'est pas disponible : aucune vérification externe n'a été faite."}]},
            "data": {"source_id": "extended" if source_of(ticker) == SOURCE_EXTENDED else "alphaforge_starter", "currency": "CAD", "start": s["window"][0], "end": s["window"][1],
                     "n_obs": int(d.prices[ticker].dropna().shape[0]), "missing_days": int(d.prices[ticker].isna().sum()),
                     "notes": [("Repli : données de l'univers étendu seulement (notre téléchargement Yahoo Finance, Adj Close ; taux de change Banque du Canada du jeu de départ)." if source_of(ticker) == SOURCE_EXTENDED
                                else "Repli : données du jeu de départ seulement (Yahoo Finance adj_close, taux de change Banque du Canada)."),
                               "Le pipeline à quatre agents (sources, collecte, vérification, scénarios) n'a pas été exécuté."]},
            "explanation": _fallback_explanation(card, profile, ticker, quantity, force_offline or _offline()),
            "trace": [{"agent": "Prédicteur (repli)", "step": "feed.scenarios_5y", "tool": "feed.scenarios_5y",
                       "inputs": {"ticker": ticker, "quantity": quantity}, "outputs": {"scenarios": "best/central/worst"}, "ms": 0}],
        },
    }


def _details(rec: _Rec, t: str, quantity: float, weight: float, snap: dict | None = None) -> dict:
    d = data()
    snap = snap or _snap(rec)
    profile, amount = snap["profile"], snap["amount"]
    key = (snap["key"], t, float(quantity), float(weight))
    with _COMPUTE:
        if key in _DETAILS:
            return _DETAILS[key]
    c = _ctx(rec, snap)  # hors verrou
    with _COMPUTE:
        imp = feed.impact_for_weight(d.prices, d.universe, d.meta, profile, c["base"], t, weight, amount)
        extra = run_pipeline(t, quantity, force_offline=_offline(), card=c["cards"][t], profile=profile, scope=(rec.id, _fingerprint(snap)))
        blk = imp["impact"]
        side = lambda s: {**s, "vol": s["ex_ante_vol"]}  # noqa: E731
        out = json_safe({
            "card": to_api_card(c["cards"][t]),
            "impact": {"weight": weight, "fit": {k: imp["fit"][k] for k in ("verdict", "label", "weight", "max_weight_within_profile", "checks")},
                       "before": side(blk["before"]), "after": side(blk["after"]), "limits": blk["limits"], "amount": blk["amount"], "notes": [blk["note"]]},
            **extra,
        })
        if not _stale(snap):
            _DETAILS[key] = out
        return out


# ---------------------------------------------------------------------------------------------------------------------
# Modèles d'entrée
# ---------------------------------------------------------------------------------------------------------------------
Action = Literal["like", "dislike", "neutral", "save", "unsave", "hide", "unhide"]


class ProfileIn(BaseModel):
    answers: dict[str, Any] | None = None
    name: str | None = Field(default=None, max_length=60)
    persona: str | None = Field(default=None, max_length=20)
    reset: bool = False


class ReactIn(BaseModel):
    profile_id: str
    ticker: str = Field(max_length=20)
    action: Action


class PipelineIn(BaseModel):
    ticker: str = Field(max_length=20)
    quantity: float = Field(default=10, gt=0, le=1_000_000)
    force_offline: bool = False
    use_network: bool = False


class CheckIn(BaseModel):
    profile_id: str
    text: str | None = Field(default=None, max_length=500)
    ticker: str | None = Field(default=None, max_length=20)
    weight: float | None = Field(default=None, gt=0, le=1, description="part du portefeuille, fraction de 0 à 1")
    choice: Literal["keep", "adjust", "drop"] | None = Field(default=None, description="optionnel : décision prise après la vérification (journal)")
    record_only: bool = Field(default=False, description="avec ticker, weight et choice : enregistre la décision sans explication (rapide)")
    decision_id: str | None = Field(default=None, max_length=64, description="identifiant fourni par le client : un même identifiant n'est enregistré qu'une fois")
    adjusted_weight: float | None = Field(default=None, gt=0, le=1, description="pour choice=adjust : part retenue ; par défaut la part maximale compatible avec le profil")


class PurchaseIn(BaseModel):
    profile_id: str
    tickers: list[str] = Field(min_length=1, max_length=10)
    weight: float = Field(default=DEFAULT_WEIGHT, gt=0, le=0.5, description="part de chaque actif, fraction de 0 à 0,5")


def _check_ticker(t: str) -> str:
    t = t.strip().upper()
    if t not in data().prices.columns:
        raise HTTPException(404, f"Titre inconnu : {t}")
    return t


# ---------------------------------------------------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(_app: FastAPI):
    data()
    _load_profiles()
    for k, v in q.PERSONAS.items():  # les trois personas sont créés et préchauffés au démarrage : la démo n'attend jamais
        if k.lower() not in _PROFILES:
            try:
                _PROFILES[k.lower()] = _Rec(k.lower(), k, dict(v["answers"]), k.lower())
            except Exception as e:
                log.warning("persona %s non créé : %s", k, e)
    _persist()
    for r in list(_PROFILES.values()):
        _start_warm(r)
    yield


app = FastAPI(title="ReelBroker API", version=VERSION, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_methods=["*"], allow_headers=["*"])


@app.get("/api/health")
def health():
    aws = agents.aws_summary()
    return {"ok": True, "data_as_of": data().as_of, "bedrock": {"connected": bool(aws["connecte"]), "region": aws["region"], "model": aws["modele"]}, "version": VERSION,
            "warm": {k.lower(): ("ready" if k.lower() in _PROFILES and _snap(_PROFILES[k.lower()])["key"] in _WARM_DONE else "building") for k in q.PERSONAS}}


@app.get("/api/personas")
def personas():
    return [{"id": k.lower(), "name": k, "summary": v["summary"]} for k, v in q.PERSONAS.items()]


@app.get("/api/questionnaire/next")
def questionnaire_next(answers: str = "{}", scope: Literal["account", "portfolio"] | None = None):
    try:
        a = json.loads(answers)
    except ValueError:
        raise HTTPException(422, "`answers` doit être un objet JSON.")
    if not isinstance(a, dict) or any(k not in q.QUESTIONS for k in a):
        raise HTTPException(422, "`answers` doit être un objet JSON dont les clés sont des identifiants de question connus.")
    order = {"account": q.ACCOUNT_ORDER, "portfolio": q.PORTFOLIO_ORDER}.get(scope or "")
    qid = q.next_question(a, order)
    if qid is None:
        return {"done": True}
    spec = q.QUESTIONS[qid]
    question = {"id": qid, "level": spec["level"], "type": spec["type"], "element": spec["element"],
                "text": q.question_text(qid, a, data().scenarios), "choices": [{"code": c, "label": lbl} for c, lbl in q.choices_for(qid, a)]}
    if spec.get("help"):
        question["help"] = spec["help"]
    return {"done": False, "question": question}


def _profile_out(rec: _Rec) -> dict:
    p = rec.profile
    lvl = p.effective_risk()
    return json_safe({
        "profile_id": rec.id, "name": rec.name, "declared": rec.declared,
        "profile": {"objective": p.objective, "horizon_years": p.horizon_years, "risk_tolerance": p.risk_tolerance, "risk_capacity": p.risk_capacity,
                    "level": lvl, "level_label": LEVEL_FR[lvl], "excluded": p.excluded, "preferred": p.preferred, "avoided": p.avoided},
        "reasoning": p.reasoning(), "contradictions": rec.declared["contradictions"], "notes": rec.notes,
    })


@app.post("/api/profile")
def create_profile(body: ProfileIn):
    _load_profiles()
    persona, pid = None, None
    if body.persona:
        key = next((k for k in q.PERSONAS if k.lower() == body.persona.strip().lower()), None)
        if key is None:
            raise HTTPException(422, f"Persona inconnue : {body.persona}")
        pid = key.lower()
        if pid in _PROFILES and not body.reset:
            _start_warm(_PROFILES[pid])
            return _profile_out(_PROFILES[pid])
        answers, name, persona = dict(q.PERSONAS[key]["answers"]), body.name or key, pid
    elif body.answers is not None:
        answers, name = body.answers, body.name or "Investisseur"
        _check_answers(answers)
    else:
        raise HTTPException(422, "Fournir `answers` ou `persona`.")
    try:
        rec = _Rec(pid or uuid.uuid4().hex[:10], name, answers, persona)
    except Exception as e:
        raise HTTPException(422, f"Profil impossible à construire : {type(e).__name__}: {str(e)[:150]}")
    replaced = rec.id in _PROFILES
    _PROFILES[rec.id] = rec
    if replaced:  # persona réinitialisée : ses anciens caches (fil, fiches, textes Bedrock) ne valent plus
        _evict(rec.id, disk=True)
    _persist()
    _start_warm(rec)
    return _profile_out(rec)


def _check_answers(answers: dict) -> None:
    bad = [k for k in answers if k not in q.QUESTIONS and not k.endswith(("_text", "_exact"))]
    if bad or not all(isinstance(v, (str, int, float, list)) for v in answers.values()):
        raise HTTPException(422, f"Réponses invalides : {bad or 'type de valeur'}")


class ProfileUpdateIn(BaseModel):
    answers: dict[str, Any]
    name: str | None = Field(default=None, max_length=60)


@app.put("/api/profile/{pid}")
def update_profile(pid: str, body: ProfileUpdateIn):
    """Nouveaux paramètres d'un profil existant (portefeuille ou compte modifié) : même identifiant, même fil (réactions, journal),
    tolérance mise à jour conservée. Tous les caches du profil sont vidés, y compris ses textes Bedrock personnalisés."""
    rec = get_rec(pid)
    _check_answers(body.answers)
    try:
        new = _Rec(rec.id, body.name or rec.name, body.answers, rec.persona, rec.state, rec.journal, rec.tol_override, rec.decision_ids)
    except Exception as e:
        raise HTTPException(422, f"Profil impossible à construire : {type(e).__name__}: {str(e)[:150]}")
    _PROFILES[pid] = new
    cleared = _evict(pid, disk=True)
    _persist()
    _start_warm(new)
    return {**_profile_out(new), "cleared": cleared}


@app.post("/api/profile/{pid}/refresh")
def refresh_profile(pid: str):
    """Rafraîchissement du fil (onglet Fil touché de nouveau, ou défilement vers le haut sur la première carte) : le fil et les
    fiches du profil sont recalculés. Les textes Bedrock gardés sur disque sont conservés (aucun paramètre n'a changé)."""
    rec = get_rec(pid)
    cleared = _evict(pid, disk=False)
    _start_warm(rec)
    return {"ok": True, "cleared": cleared}


@app.get("/api/profile/{pid}")
def read_profile(pid: str):
    return _profile_out(get_rec(pid))


_NO_STORE = {"Cache-Control": "no-store"}  # une page du fil dépend de l'état du profil : aucun proxy ne doit la garder


def _feed_page(profile_id: str, limit: int, include_seen: bool, skip: set[str]) -> JSONResponse:
    """Page du fil. Le client demande quelques cartes à la fois en excluant celles qu'il a déjà : chaque page est reclassée
    avec l'état courant (Pour / Contre), donc les cartes suivantes tiennent compte des réactions. `remaining` = cartes encore
    disponibles après cette page."""
    rec = get_rec(profile_id)
    c = _ctx(rec)
    ranked = feed.rerank(list(c["cards"].values()), c["fctx"], data().universe, rec.state, include_seen=include_seen, saved_is_seen=False)
    ranked = [x for x in ranked if x["ticker"] not in skip]
    body = {"items": [to_api_card(x) for x in ranked[:limit]], "remaining": max(len(ranked) - limit, 0), "state": _state_out(rec.state)}
    return JSONResponse(json_safe(body), headers=_NO_STORE)


@app.get("/api/feed")
def get_feed(profile_id: str, limit: int = Query(20, ge=1, le=100), include_seen: bool = False,
             exclude: str = Query("", max_length=4000, description="Tickers déjà reçus par le client, séparés par des virgules")):
    return _feed_page(profile_id, limit, include_seen, {t.strip().upper() for t in exclude.split(",") if t.strip()})


class FeedPageIn(BaseModel):
    profile_id: str
    limit: int = Field(5, ge=1, le=100)
    include_seen: bool = False
    exclude: list[str] = Field(default_factory=list, max_length=5000)


@app.post("/api/feed/page")
def post_feed_page(body: FeedPageIn):
    """Même page que GET /api/feed, la liste à exclure dans le corps : l'adresse reste courte et la réponse n'est jamais mise en cache."""
    return _feed_page(body.profile_id, body.limit, body.include_seen, {t.strip().upper() for t in body.exclude if t and t.strip()})


@app.post("/api/feed/react")
def react(body: ReactIn):
    rec = get_rec(body.profile_id)
    t = _check_ticker(body.ticker)
    if body.action == "unhide":
        if t in rec.state["hidden"]:
            rec.state["hidden"].remove(t)
    else:
        feed.react(rec.state, t, body.action)
    _persist()
    return {"state": _state_out(rec.state)}


@app.get("/api/card/{ticker}")
def card_details(ticker: str, profile_id: str, quantity: float = Query(10, gt=0, le=1_000_000), weight: float = Query(DEFAULT_WEIGHT, gt=0, le=1)):
    rec = get_rec(profile_id)
    return _details(rec, _check_ticker(ticker), quantity, weight)


def _data_ready() -> _Data:
    """Données déjà chargées, sans attendre `_COMPUTE` (tenu pendant les calculs longs : préchauffage, pipeline).
    Lecture seule : les prix ne changent plus après le chargement."""
    return _DATA if _DATA is not None else data()


@lru_cache(maxsize=128)
def _daily_prices(ticker: str) -> dict:
    """Série quotidienne complète d'un titre (adj_close en CAD, comme les cartes), pour le graphique de la fiche."""
    d = _data_ready()
    p = d.prices[ticker].dropna()
    return json_safe({
        "ticker": ticker, "currency": "CAD", "as_of": str(p.index[-1].date()),
        "source": SOURCE_EXTENDED if "source" in d.universe.columns and d.universe.loc[ticker, "source"] == "extended" else SOURCE,
        "frequency": "daily",
        "note": "Cours de clôture quotidiens ajustés (dividendes et fractionnements), convertis en CAD. Aucun cours intrajournalier.",
        "points": [{"date": str(ix.date()), "value": round(float(v), 4)} for ix, v in p.items()],
    })


@app.get("/api/prices/{ticker}")
def daily_prices(ticker: str):
    """Lecture seule, indépendante du profil : n'appelle ni les agents ni le pipeline."""
    t = ticker.strip().upper()
    if t not in _data_ready().prices.columns:
        raise HTTPException(404, f"Titre inconnu : {t}")
    return _daily_prices(t)


@app.post("/api/pipeline/run")
def pipeline_run(body: PipelineIn):
    t = _check_ticker(body.ticker)
    with _COMPUTE:
        return json_safe(run_pipeline(t, body.quantity, body.force_offline or _offline(), body.use_network))


def _check_explanation(rec: _Rec, snap: dict, base: dict, text: str, result: dict) -> dict:
    """Message d'explication d'une vérification : agents.run (Bedrock si disponible), sinon texte du code ; toujours contrôlé."""
    d = data()
    ctx = agents.Context(d.prices, d.universe, d.meta, snap["profile"], base, snap["amount"])
    ctx.profil()
    ctx.verifier_idee(result["ticker"], result["weight"] * 100)
    if not _offline():
        try:
            out = agents.run(text, agents.Context(d.prices, d.universe, d.meta, snap["profile"], base, snap["amount"]), force_offline=False)
            if out.get("message") and out.get("governance"):
                msg = out["message"]
                return {"mode": out["mode"], "short": msg.split("\n")[0], "long": msg, "governance": out["governance"]}
        except Exception as e:
            log.warning("agents.run a échoué (%s)", type(e).__name__)
    msg = agents.deterministic_message(ctx)
    gov = agents.validate_explanation(msg, ctx.trace)
    return {"mode": "offline", "short": msg.split("\n")[0], "long": msg, "governance": {"passed": gov["passed"], "issues": gov["issues"]}}


def _record_only(rec: _Rec, body: CheckIn) -> dict:
    """Enregistre la décision prise après une vérification : calcul du verdict par le code, aucune explication, idempotent."""
    if body.ticker is None or body.weight is None or body.choice is None:
        raise HTTPException(422, "`record_only` exige `ticker`, `weight` et `choice`.")
    t = _check_ticker(body.ticker)
    d = data()
    snap = _snap(rec)
    base = _ctx(rec, snap)["base"]
    with _COMPUTE:
        if body.decision_id and body.decision_id in rec.decision_ids:
            return {"recorded": False, "duplicate": True, "learn": json_safe(learn.compare(rec.profile, rec.journal))}
        res = decide.check_intention(d.prices, snap["profile"], base, t, body.weight, d.meta, d.universe)
        if body.choice == "adjust":
            w = body.adjusted_weight if body.adjusted_weight is not None else res["max_weight_within_profile"]
            if w and abs(w - body.weight) > 1e-9:
                res = decide.check_intention(d.prices, snap["profile"], base, t, float(w), d.meta, d.universe)
        entry = learn.idea_decision(res, body.choice)
        rec.journal.append(entry)
        if body.decision_id:
            rec.decision_ids.append(body.decision_id)
        _persist()
        return {"recorded": True, "duplicate": False, "entry": json_safe(entry), "learn": json_safe(learn.compare(rec.profile, rec.journal))}


@app.post("/api/check")
def check(body: CheckIn):
    rec = get_rec(body.profile_id)
    d = data()
    if body.record_only:
        return _record_only(rec, body)
    if body.ticker is not None:
        if body.weight is None:
            raise HTTPException(422, "`weight` est requis avec `ticker`.")
        t, w, parsed, text = _check_ticker(body.ticker), body.weight, None, body.text or f"{body.weight * 100:g} % dans {body.ticker}"
    elif body.text:
        parsed = decide.parse_intention(body.text, d.universe)
        text = body.text
        if not parsed["ok"]:
            msg = ("Je n'ai pas reconnu avec certitude un titre et une part du portefeuille dans cette phrase. Précisez-les, par exemple « 10 % dans Apple ».")
            return {"ok": False, "parsed": json_safe(parsed), "message": msg}
        t, w = parsed["tickers"][0], min(float(parsed["weight"]), 1.0)
    else:
        raise HTTPException(422, "Fournir `text` ou `ticker` et `weight`.")
    snap = _snap(rec)
    base = _ctx(rec, snap)["base"]  # avant le verrou : un recalcul concurrent du profil ne peut pas nous bloquer
    with _COMPUTE:
        res = decide.check_intention(d.prices, snap["profile"], base, t, w, d.meta, d.universe)
        explanation = _check_explanation(rec, snap, base, text, res)
        if body.choice:
            rec.journal.append(learn.idea_decision(res, body.choice))
            _persist()
    return {**json_safe(res), "ok": True, "parsed": json_safe(parsed), "explanation": json_safe(explanation)}


@app.post("/api/purchase")
def purchase(body: PurchaseIn):
    rec = get_rec(body.profile_id)
    d = data()
    tickers = [_check_ticker(t) for t in body.tickers]
    snap = _snap(rec)
    base = _ctx(rec, snap)["base"]
    with _COMPUTE:
        try:
            res = feed.simulate_purchase(d.prices, d.universe, d.meta, snap["profile"], base, rec.state, tickers, body.weight, snap["amount"])
        except ValueError as e:
            raise HTTPException(422, str(e))
        rec.journal.extend(res.get("journal", []))
        _persist()
    return {**json_safe(res), "simulated": True}


@app.get("/api/profile/{pid}/learn")
def learn_view(pid: str):
    rec = get_rec(pid)
    return json_safe(learn.compare(rec.profile, rec.journal))


class ToleranceIn(BaseModel):
    level: int = Field(ge=1, le=5)
    confirm: bool = False


@app.post("/api/profile/{pid}/tolerance")
def update_tolerance(pid: str, body: ToleranceIn):
    """Met à jour la SEULE tolérance déclarée (jamais l'objectif, l'horizon ni la capacité) ; le niveau retenu reste plafonné par ceux-ci."""
    rec = get_rec(pid)
    cmp_ = learn.compare(rec.profile, rec.journal)
    if not body.confirm and body.level != cmp_["update_to"]:
        raise HTTPException(409, "Cette mise à jour n'est pas celle que vos décisions justifient. Elle n'est permise que si vous la confirmez explicitement (`confirm: true`).")
    rec.tol_override = body.level
    rec.profile = learn.with_tolerance(rec.profile, body.level)
    rec.notes = [n for n in rec.notes if not n.startswith("Tolérance déclarée mise à jour")] + [
        f"Tolérance déclarée mise à jour par vous à {body.level} sur 5. L'objectif, l'horizon et la capacité n'ont pas changé."]
    _evict(pid, disk=True)  # paramètre du profil modifié : anciens fil, fiches et textes Bedrock supprimés
    _persist()
    _start_warm(rec)  # nouvelle clé de profil : le fil est recalculé en arrière-plan
    return {"learn": json_safe(learn.compare(rec.profile, rec.journal)), **_profile_out(rec)}


@app.get("/api/hypotheses")
def hypotheses():
    """Toutes nos hypothèses, lues dans les constantes du code."""
    from . import hypotheses as hyp
    return json_safe(hyp.build(data().window))
