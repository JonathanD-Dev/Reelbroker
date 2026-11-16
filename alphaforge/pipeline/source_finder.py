"""Agent 1 — Chercheur de sources.

Cœur déterministe : un REGISTRE de sources publiques réelles et des règles (marché de cotation, classe d'actif...) qui
choisissent les sources pertinentes pour un titre, chacune avec `chosen_because`. Couche Bedrock facultative : elle peut
seulement classer / justifier des entrées du registre ; tout identifiant hors registre est écarté et journalisé.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from . import _trace

REGISTRY: dict[str, dict] = {
    "starter": {"id": "starter", "name": "Données de départ du datathon (Yahoo Finance, CSV)", "url": "https://finance.yahoo.com", "kind": "prices",
                "license": "Libre dans le cadre du datathon ; conditions de Yahoo : https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html",
                "provides": "Cours quotidiens ajustés (adj_close), 2021-11-12 au 2026-11-12, 31 actifs", "as_of": "2026-11-12"},
    "extended": {"id": "extended", "name": "Univers étendu ReelBroker (Yahoo Finance via yfinance, téléchargé par notre script)", "url": "https://finance.yahoo.com", "kind": "prices",
                 "license": "Usage personnel / recherche ; conditions de Yahoo, données non certifiées par les bourses. Notre propre téléchargement, pas un fichier des organisateurs",
                 "provides": "Cours quotidiens ajustés (Adj Close), même fenêtre que le jeu de départ (2021-11-12 au 2026-11-12), 60 titres ajoutés (scripts/build_extended_universe.py, provenance.json)",
                 "as_of": "2026-11-12"},
    "yfinance": {"id": "yfinance", "name": "Yahoo Finance (bibliothèque yfinance)", "url": "https://finance.yahoo.com", "kind": "prices",
                 "license": "Usage personnel / recherche ; conditions de Yahoo, données non certifiées par les bourses",
                 "provides": "Cours quotidiens ajustés (auto_adjust), 5 ans, tout titre coté", "as_of": "à la requête"},
    "boc_valet": {"id": "boc_valet", "name": "Banque du Canada — API Valet (taux de change USD/CAD, taux directeur)",
                  "url": "https://www.bankofcanada.ca/valet/docs", "kind": "macro", "license": "Licence d'utilisation de la Banque du Canada (données ouvertes)",
                  "provides": "Taux USD/CAD quotidien (FXUSDCAD) et taux directeur (V39079)", "as_of": "2026-11-12"},
    "sec_edgar": {"id": "sec_edgar", "name": "SEC EDGAR — Company Facts", "url": "https://data.sec.gov/api/xbrl/companyfacts/", "kind": "fundamentals",
                  "license": "Domaine public (États-Unis)", "provides": "États financiers XBRL des sociétés américaines, avec date de dépôt", "as_of": "à la requête"},
    "sedar_plus": {"id": "sedar_plus", "name": "SEDAR+ (documents d'émetteurs canadiens)", "url": "https://www.sedarplus.ca", "kind": "filings",
                   "license": "Consultation publique ; pas d'API : lien documentaire seulement", "provides": "Rapports annuels et déclarations des émetteurs canadiens", "as_of": "à la requête"},
    "issuer_esg_esgv": {"id": "issuer_esg_esgv", "name": "Vanguard — page de méthodologie ESGV (indice FTSE US All Cap Choice)",
                        "url": "https://investor.vanguard.com/investment-products/etfs/profile/esgv", "kind": "esg",
                        "license": "Page publique de l'émetteur", "provides": "Méthodologie de filtrage ESG du fonds (description de l'émetteur)", "as_of": "à la requête"},
}

PRIMARY_PRICE_SOURCES = ("starter", "extended")  # sources de prix locales et reproductibles : toujours avant les sources secondaires
US_MARKETS = ("NYSE", "NASDAQ", "US", "NYSE/NASDAQ")
DEFAULT_NEEDS = ["prices", "fx", "risk_free", "fundamentals", "esg"]


@lru_cache(maxsize=1)
def _universe() -> dict[str, dict]:
    import pandas as pd

    root = Path(__file__).resolve().parents[2]
    out: dict[str, dict] = {}
    try:
        st = pd.read_csv(root / "data/raw/datathon2026/Datathon2026/alphaforge_starter/assets_universe.csv").set_index("ticker").to_dict("index")
        out = {t: {**r, "source": "starter"} for t, r in st.items()}
    except FileNotFoundError:
        pass
    try:  # univers étendu : le jeu de départ gagne en cas de doublon
        ext = pd.read_csv(root / "data/processed/extended/assets_universe.csv").set_index("ticker").to_dict("index")
        out.update({t: {**r, "source": "extended"} for t, r in ext.items() if t not in out})
    except (FileNotFoundError, ValueError):
        pass
    return out


def describe_ticker(ticker: str) -> dict:
    """Marché, classe d'actif et devise : depuis l'univers de départ, sinon déduits du suffixe (règle documentée)."""
    row = _universe().get(ticker)
    if row:
        return {"in_starter": row["source"] == "starter", "in_extended": row["source"] == "extended", "asset_class": row["asset_class"],
                "market": row["market"], "currency": row["currency"]}
    if ticker.endswith("-USD"):
        return {"in_starter": False, "in_extended": False, "asset_class": "crypto", "market": "crypto", "currency": "USD"}
    if ticker.endswith((".TO", ".V")):
        return {"in_starter": False, "in_extended": False, "asset_class": "equity", "market": "TSX", "currency": "CAD"}
    if "." in ticker or "-" in ticker:  # .NE, .L, .PA, -CAD... : devise non déductible du suffixe, à lire dans les métadonnées Yahoo ou refuser
        return {"in_starter": False, "in_extended": False, "asset_class": "equity", "market": "inconnu", "currency": None}
    return {"in_starter": False, "in_extended": False, "asset_class": "equity", "market": "US", "currency": "USD"}


def _pick(sid: str, why: str) -> dict:
    return {**REGISTRY[sid], "chosen_because": why}


def find_sources(ticker: str, needs: list[str] | None = None, rank_fn=None, trace: list | None = None) -> list[dict]:
    """Sources choisies par règles, dans l'ordre de préférence. `rank_fn(candidates) -> [{"id", "why"}]` (couche Bedrock) peut
    réordonner/justifier ; tout id hors registre est écarté et journalisé."""
    t0 = _trace.now()
    needs = needs or DEFAULT_NEEDS
    d = describe_ticker(ticker)
    out: list[dict] = []
    if "prices" in needs:
        if d["in_starter"]:
            out.append(_pick("starter", f"{ticker} fait partie de l'univers de départ : cours ajustés déjà documentés, reproductibles hors ligne."))
        elif d["in_extended"]:
            out.append(_pick("extended", f"{ticker} fait partie de l'univers étendu : cours ajustés téléchargés par ReelBroker sur Yahoo Finance (pas un fichier des "
                                         "organisateurs), fenêtre identique, reproductibles hors ligne."))
        if d["in_extended"]:
            out.append(_pick("yfinance", "Même fournisseur (Yahoo Finance) que l'univers étendu : un nouveau téléchargement ne constitue pas un recoupement indépendant, "
                                         "seulement un rafraîchissement."))
        else:
            out.append(_pick("yfinance", "Source primaire (titre hors univers de départ)." if not d["in_starter"]
                             else "Source de recoupement : permet de vérifier que les cours de départ concordent."))
    if "fx" in needs and d["currency"] == "USD":
        out.append(_pick("boc_valet", f"{ticker} est coté en {d['currency']} : conversion en CAD avec le taux USD/CAD officiel de la Banque du Canada."))
    elif "risk_free" in needs:
        out.append(_pick("boc_valet", "Taux directeur de la Banque du Canada : taux sans risque du ratio de Sharpe et de la dérive prudente."))
    if "fundamentals" in needs and d["asset_class"] == "equity":
        if d["market"] in US_MARKETS:
            out.append(_pick("sec_edgar", "Société américaine : états financiers publiés à la SEC (utilisables à partir de la date de dépôt)."))
        elif d["market"] in ("TSX", "TSXV"):
            out.append(_pick("sedar_plus", "Société canadienne : documents d'émetteur sur SEDAR+ (lien documentaire, pas d'API)."))
    if "esg" in needs and ticker == "ESGV":
        out.append(_pick("issuer_esg_esgv", "Fonds ESG : la méthodologie de filtrage décrite par l'émetteur est la seule preuve ESG documentée."))
    dropped: list[str] = []
    mode, ranking, why_by_id = "offline", [], {}
    if rank_fn is not None:
        try:
            ranked = rank_fn([dict(s) for s in out]) or []
            ranking = [r for r in ranked if isinstance(r, dict)]
            by_id = {s["id"]: s for s in out}
            new: list[dict] = []
            for r in ranking:
                sid = r.get("id")
                if sid in by_id and sid not in {n["id"] for n in new}:
                    s = dict(by_id[sid])
                    if r.get("why"):
                        why_by_id[sid] = r["why"]
                        s["chosen_because"] = f"{s['chosen_because']} (modèle : {r['why']})"
                    new.append(s)
                else:
                    dropped.append(str(sid))
            new += [s for s in out if s["id"] not in {n["id"] for n in new}]  # le modèle ne peut pas retirer une source
            out = new
            mode = "bedrock"
        except Exception as exc:  # noqa: BLE001
            dropped.append(f"erreur du modèle : {type(exc).__name__}")
            mode = "bedrock_error"
        # Les données officielles du datathon restent la source primaire de prix : le modèle ne réordonne que les sources secondaires.
        out = [s for s in out if s["id"] in PRIMARY_PRICE_SOURCES] + [s for s in out if s["id"] not in PRIMARY_PRICE_SOURCES]
    _trace.record(trace, "source_finder", "find_sources", "source_finder.find_sources", {"ticker": ticker, "needs": needs},
                  {"mode": mode, "sources": [s["id"] for s in out], "ranking": ranking, "justifications": why_by_id,
                   "ignored_outside_registry": dropped, "market": d["market"], "asset_class": d["asset_class"]}, t0)
    return out


def bedrock_ranker(ticker: str):
    """Fabrique un `rank_fn` Bedrock (Strands). Le modèle ne reçoit que des entrées du registre et ne peut qu'ordonner."""
    def rank(cands: list[dict]) -> list[dict]:
        from strands import Agent

        from .. import agents

        agent = Agent(model=agents.make_model(), callback_handler=None, system_prompt=(
            "Tu classes des sources de données publiques pour un titre. Réponds UNIQUEMENT par un tableau JSON "
            "[{\"id\": \"...\", \"why\": \"une phrase\"}] en utilisant seulement les id fournis, du plus au moins utile. "
            "Règle : le fichier officiel du datathon (id starter) est la source primaire des prix quand il est présent ; yfinance n'est alors qu'un "
            "recoupement, jamais la source primaire ; justifie les sources secondaires par leur rôle (devise, taux, états financiers)."))
        from ._timeout import call_with_timeout

        txt = str(call_with_timeout(agent, f"Titre : {ticker}\nSources : " + json.dumps([{k: c[k] for k in ("id", "name", "kind", "provides")} for c in cands], ensure_ascii=False)))
        i, j = txt.find("["), txt.rfind("]")
        return json.loads(txt[i:j + 1])
    return rank
