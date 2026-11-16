"""Agent 3 — Collecteur de données.

Lit les cours de départ (convertis en CAD par `data.load_starter`) ou, si `use_network=True`, Yahoo Finance via yfinance
(5 ans, auto_adjust), avec cache dans data/cache/<ticker>.csv. Ne plante jamais sur une panne réseau : il se replie sur la source
suivante et le note. Chaque source passe par le Vérificateur de faits avant d'être acceptée.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd

from . import _trace, fact_checker
from .source_finder import describe_ticker

ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = ROOT / "data" / "cache"


@lru_cache(maxsize=1)
def _starter():
    from .. import data

    # jeu de départ + univers étendu (le jeu de départ gagne en cas de doublon) ; repli sur le jeu de départ seul si l'univers étendu est absent
    prices, universe = data.load_universe(ROOT / data.STARTER_DIR, extended_folder=ROOT / data.EXTENDED_DIR)
    return prices, universe


@lru_cache(maxsize=1)
def _fx() -> pd.Series:
    from .. import data

    fx = pd.read_csv(ROOT / data.STARTER_DIR / "fx_usdcad_daily.csv", parse_dates=["date"]).set_index("date")["usdcad"]
    return fx.sort_index()


def _download_yf(ticker: str) -> pd.DataFrame | None:
    """Séparé pour pouvoir être remplacé dans les tests. Renvoie None en cas d'échec."""
    try:
        import yfinance as yf

        df = yf.download(ticker, period="5y", interval="1d", auto_adjust=True, progress=False)
    except Exception:  # noqa: BLE001
        return None
    if df is None or len(df) == 0:
        return None
    return df


def _yf_currency(ticker: str) -> str | None:
    """Devise de cotation selon les métadonnées Yahoo ; None si indisponible (remplaçable dans les tests)."""
    try:
        import yfinance as yf

        cur = yf.Ticker(ticker).fast_info.get("currency")
        return str(cur).upper() if cur else None
    except Exception:  # noqa: BLE001
        return None


def _yf_close(df: pd.DataFrame) -> pd.Series:
    close = df["Close"]
    if isinstance(close, pd.DataFrame):
        close = close.iloc[:, 0]
    s = close.dropna().astype(float)
    s.index = pd.to_datetime(s.index).tz_localize(None).normalize()
    s.name = None
    return s.sort_index()


def _to_cad(s: pd.Series, currency: str) -> pd.Series:
    if currency == "CAD":
        return s
    fx = _fx().reindex(s.index.union(_fx().index)).ffill().bfill().reindex(s.index)
    return s * fx


def _missing_days(s: pd.Series) -> int:
    expected = pd.bdate_range(s.index[0], s.index[-1])
    return int(len(expected.difference(s.index)))


def _meta(s: pd.Series, source_id: str, currency: str, price_field: str, notes: list[str]) -> dict:
    return {"source_id": source_id, "currency": currency, "start": str(s.index[0].date()), "end": str(s.index[-1].date()),
            "n_obs": int(len(s)), "missing_days": _missing_days(s), "price_field": price_field, "notes": notes}


def _fetch_starter(ticker: str) -> tuple[pd.Series | None, dict | None, list[str]]:
    prices, _ = _starter()
    if ticker not in prices.columns:
        return None, None, [f"{ticker} absent des données de départ."]
    s = prices[ticker].dropna()
    notes = ["Cours ajustés (adj_close) convertis en CAD avec le taux USD/CAD de la Banque du Canada (dernier taux reporté les jours fériés)."]
    if ticker == "CNQ.TO":
        notes.append("Artefact connu : un « fractionnement » de 1,021 le 2022-08-22, probablement une distribution spéciale.")
    return s, _meta(s, "starter", "CAD", "adj_close", notes), notes


def _fetch_extended(ticker: str) -> tuple[pd.Series | None, dict | None, list[str]]:
    prices, universe = _starter()
    if ticker not in prices.columns or "source" not in universe.columns or universe.loc[ticker, "source"] != "extended":
        return None, None, [f"{ticker} absent de l'univers étendu."]
    s = prices[ticker].dropna()
    notes = ["Cours ajustés (Adj Close, auto_adjust=False) téléchargés par ReelBroker sur Yahoo Finance via yfinance (scripts/build_extended_universe.py, provenance dans "
             "data/processed/extended/provenance.json), convertis en CAD avec le taux USD/CAD de la Banque du Canada du jeu de départ.",
             "Ces données ne viennent pas des organisateurs : même fournisseur que le jeu de départ, mais notre propre extraction (biais du survivant : liste choisie en 2026)."]
    return s, _meta(s, "extended", "CAD", "adj_close", notes), notes


def _fetch_yfinance(ticker: str, df: pd.DataFrame | None = None) -> tuple[pd.Series | None, dict | None, list[str]]:
    d = describe_ticker(ticker)
    cache = CACHE_DIR / f"{ticker.replace('/', '_')}.csv"
    notes: list[str] = []
    if df is not None:
        s_raw = _yf_close(df)
        try:
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            s_raw.rename("adj_close").to_csv(cache, header=True, index_label="date")
            notes.append(f"Téléchargé depuis Yahoo Finance et mis en cache ({cache.name}).")
        except OSError as exc:
            notes.append(f"Cache non écrit : {type(exc).__name__}.")
    elif cache.exists():
        s_raw = pd.read_csv(cache, parse_dates=["date"]).set_index("date")["adj_close"]
        notes.append("Réseau indisponible : cache local utilisé (non rafraîchi).")
    else:
        return None, None, ["Yahoo Finance injoignable ou titre introuvable, et aucun cache local."]
    currency = d["currency"]
    meta_cur = _yf_currency(ticker) if (df is not None and not d["in_starter"]) else None
    if meta_cur:
        if currency and meta_cur != currency:
            notes.append(f"Devise déduite du suffixe ({currency}) corrigée par les métadonnées Yahoo ({meta_cur}).")
        currency = meta_cur
    if currency not in ("CAD", "USD"):
        return None, None, notes + [f"Devise {currency or 'inconnue'} non gérée (suffixe non reconnu et métadonnées indisponibles ou hors CAD/USD) : conversion refusée plutôt que devinée."]
    s = _to_cad(s_raw, currency).dropna()
    if currency != "CAD":
        notes.append("Converti de USD en CAD avec le taux USD/CAD de départ (Banque du Canada).")
    return s, _meta(s, "yfinance", "CAD", "adj_close (auto_adjust)", notes), notes


_FETCH = {"starter": _fetch_starter, "extended": _fetch_extended, "yfinance": _fetch_yfinance}


def collect(ticker: str, sources: list[dict], use_network: bool = False, trace: list | None = None) -> tuple[pd.Series, dict]:
    """Renvoie (série de cours en CAD, métadonnées). `meta["fact_check"]` contient le verdict du Vérificateur pour la source retenue ;
    `meta["blocked"]` liste les sources essayées puis bloquées. Lève ValueError si aucune source ne passe."""
    candidates = [s for s in sources if s.get("kind") == "prices" or s.get("id") in _FETCH]
    blocked: list[dict] = []
    fetched: dict[str, tuple[pd.Series, dict]] = {}
    chosen = None
    yf_memo: list = []

    def yf_df():
        if not yf_memo:
            yf_memo.append(_download_yf(ticker))
        return yf_memo[0]

    def yf_resolves(_t: str) -> bool:
        return yf_df() is not None or (CACHE_DIR / f"{ticker.replace('/', '_')}.csv").exists()

    for src in candidates:
        t0 = _trace.now()
        sid = src.get("id")
        pre = fact_checker.check_source(src, ticker, use_network, trace, resolver=yf_resolves if sid == "yfinance" else None)
        if not pre["passed"]:
            blocked.append({"source_id": sid, "reason": "; ".join(c["detail"] for c in pre["checks"] if not c["ok"])})
            continue
        if sid == "yfinance" and not use_network:
            blocked.append({"source_id": sid, "reason": "réseau désactivé (use_network=False)"})
            continue
        fetch = _FETCH.get(sid)
        if fetch is None:
            continue
        try:
            s, meta, notes = fetch(ticker, yf_df()) if sid == "yfinance" else fetch(ticker)
        except Exception as exc:  # noqa: BLE001
            s, meta, notes = None, None, [f"Erreur de collecte : {type(exc).__name__}"]
        _trace.record(trace, "data_collector", "fetch", f"data_collector.fetch_{sid}", {"ticker": ticker, "source": sid},
                      {"ok": s is not None, "n_obs": int(len(s)) if s is not None else 0}, t0)
        if s is None:
            blocked.append({"source_id": sid, "reason": " ".join(notes)})
            continue
        fetched[sid] = (s, meta)
        if chosen is None:
            post = fact_checker.check_data(s, meta, trace=trace)
            if post["passed"]:
                chosen = (sid, pre, post)
            else:
                blocked.append({"source_id": sid, "reason": "; ".join(c["detail"] for c in post["checks"] if not c["ok"])})
                fetched.pop(sid)
    if chosen is None:
        raise ValueError(f"Aucune source utilisable pour {ticker} : " + "; ".join(f"{b['source_id']} ({b['reason']})" for b in blocked))
    sid, pre, post = chosen
    series, meta = fetched[sid]
    checks = [pre, post]
    others = [k for k in fetched if k != sid]
    if sid == "extended" and others:  # même fournisseur (Yahoo) : un recoupement ne prouve rien, on le dit au lieu de le faire semblant
        checks.append({"passed": True, "checks": [{"name": "recoupement_independant", "ok": True,
                       "detail": "Non applicable : les cours de l'univers étendu viennent de Yahoo Finance, comme la seule autre source (yfinance). Un accord entre les deux "
                                 "ne serait pas une vérification indépendante ; aucun recoupement n'est compté."}]})
        meta["notes"] = meta["notes"] + ["Recoupement avec yfinance non retenu : même fournisseur (Yahoo Finance), donc non indépendant."]
    elif others:  # recoupement : deux sources disponibles pour le même titre
        o_s, o_meta = fetched[others[0]]
        cross = fact_checker.check_data(series, meta, other=o_s, trace=trace)
        xc = [c for c in cross["checks"] if c["name"] in ("niveau_de_prix_concordant", "concordance_deux_sources")]
        checks.append({"passed": all(c["ok"] for c in xc), "checks": xc})
        meta["notes"] = meta["notes"] + [f"Recoupée avec {others[0]}."]
    meta = {**meta, "fact_check": fact_checker.merge(*checks), "blocked": blocked}
    if blocked:
        meta["notes"] = meta["notes"] + [f"Source {b['source_id']} écartée : {b['reason']}" for b in blocked]
    if meta["n_obs"] < 3 * 252:
        meta["notes"] = meta["notes"] + [f"Historique court : {meta['n_obs']} observations."]
    return series, meta
