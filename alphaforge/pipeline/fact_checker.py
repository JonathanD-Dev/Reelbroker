"""Agent 2 — Vérificateur de faits. Entièrement en code : aucune décision n'est laissée à un modèle.

`check_source` s'exécute avant la collecte (la source existe-t-elle, l'URL est-elle valide, le titre est-il connu ?),
`check_data` après (fenêtre et devise déclarées, trous, prix positifs, adj_close, concordance avec une seconde source).
Une vérification échouée BLOQUE la source : le collecteur passe à la suivante.
"""
from __future__ import annotations

import re
from urllib.parse import urlparse

import numpy as np
import pandas as pd

from . import _trace
from .source_finder import REGISTRY, describe_ticker

MAX_GAP_TRADING_DAYS = 7
LEVEL_TOLERANCE = 0.01
OVERLAP_TOLERANCE = 0.005  # écart absolu médian des rendements quotidiens


def _check(name: str, ok: bool, detail: str) -> dict:
    return {"name": name, "ok": bool(ok), "detail": detail}


def _url_ok(url: str) -> bool:
    p = urlparse(url or "")
    return p.scheme in ("http", "https") and bool(p.netloc) and "." in p.netloc and not re.search(r"\s", url)


def check_source(source: dict, ticker: str, use_network: bool = False, trace: list | None = None, resolver=None) -> dict:
    """`resolver(ticker) -> bool` interroge réellement la source (ex. Yahoo) ; sans lui, l'existence n'est vérifiable que via l'univers de départ."""
    t0 = _trace.now()
    sid = source.get("id")
    checks = []
    in_reg = sid in REGISTRY
    checks.append(_check("source_dans_registre", in_reg, f"{sid} {'figure' if in_reg else 'ne figure pas'} dans le registre des sources"))
    url = source.get("url", "")
    reg_host = urlparse(REGISTRY[sid]["url"]).netloc if in_reg else None
    host_ok = _url_ok(url) and (reg_host is None or urlparse(url).netloc == reg_host)
    checks.append(_check("url_conforme_au_registre", host_ok, f"URL : {url or 'absente'} ; domaine attendu : {reg_host or 'n. d.'}"))
    if in_reg and REGISTRY[sid]["kind"] == "prices":
        dsc = describe_ticker(ticker)
        known = dsc["in_starter"] or dsc.get("in_extended", False)
        if sid in ("starter", "extended"):
            own = dsc["in_starter"] if sid == "starter" else dsc.get("in_extended", False)
            nom = "l'univers de départ" if sid == "starter" else "l'univers étendu"
            est = "est" if own else "n'est pas"
            checks.append(_check("titre_existe", own, f"{ticker} {est} dans {nom}"))
        elif use_network and resolver is not None:
            ok = bool(resolver(ticker))
            checks.append(_check("titre_existe", ok, f"requête à Yahoo Finance : {ticker} {'résolu' if ok else 'introuvable'}"))
        elif not use_network:
            checks.append(_check("titre_existe", known, f"réseau désactivé : {ticker} {'figure' if known else 'ne figure pas'} dans nos univers locaux, départ ou étendu (seule vérification possible)"))
    res = {"passed": all(c["ok"] for c in checks), "checks": checks}
    _trace.record(trace, "fact_checker", "check_source", "fact_checker.check_source", {"source": sid, "ticker": ticker}, {"passed": res["passed"]}, t0)
    return res


def _bdays(a: pd.Timestamp, b: pd.Timestamp) -> int:
    return int(np.busday_count(a.date(), b.date()))


def overlap_diff(a: pd.Series, b: pd.Series) -> tuple[float, int]:
    """Écart absolu médian des rendements quotidiens sur les dates communes, et nombre de dates communes."""
    j = pd.concat([a, b], axis=1, join="inner").dropna()
    if len(j) < 20:
        return float("nan"), len(j)
    r = j.pct_change().dropna()
    return float((r.iloc[:, 0] - r.iloc[:, 1]).abs().median()), len(j)


def level_diff(a: pd.Series, b: pd.Series) -> tuple[float, int]:
    j = pd.concat([a, b], axis=1, join="inner").dropna()
    j = j[(j > 0).all(axis=1)]
    if len(j) < 20:
        return float("nan"), len(j)
    return float(np.log(j.iloc[:, 0] / j.iloc[:, 1]).abs().median()), len(j)


def check_data(series: pd.Series, meta: dict, other: pd.Series | None = None, trace: list | None = None) -> dict:
    t0 = _trace.now()
    checks = []
    s = series.dropna()
    checks.append(_check("fenetre_et_devise_declarees", bool(meta.get("start") and meta.get("end") and meta.get("currency")),
                         f"fenêtre {meta.get('start')} → {meta.get('end')}, devise {meta.get('currency')}"))
    checks.append(_check("adj_close_utilise", str(meta.get("price_field", "")).startswith("adj_close"), f"champ de prix : {meta.get('price_field')}"))
    neg = int((s <= 0).sum())
    checks.append(_check("aucun_prix_non_positif", neg == 0, f"{neg} prix ≤ 0 sur {len(s)} observations"))
    if len(s) > 1:
        gaps = [(_bdays(a, b), a, b) for a, b in zip(s.index[:-1], s.index[1:])]
        worst = max(gaps, key=lambda g: g[0])
        bad = [g for g in gaps if g[0] > MAX_GAP_TRADING_DAYS]
        checks.append(_check("aucun_trou_inexplique", not bad,
                             f"plus grand trou : {worst[0]} jours de bourse ({worst[1].date()} → {worst[2].date()}) ; seuil {MAX_GAP_TRADING_DAYS}"))
    else:
        checks.append(_check("aucun_trou_inexplique", False, "moins de 2 observations"))
    if other is not None:
        lv, _ = level_diff(s, other)
        checks.append(_check("niveau_de_prix_concordant", lv == lv and lv < LEVEL_TOLERANCE,
                             f"écart médian |log(a/b)| des niveaux de prix : {lv * 100:.3f} % (seuil {LEVEL_TOLERANCE * 100:.0f} %) ; détecte une devise ou une échelle erronée"
                             if lv == lv else "trop peu de dates communes"))
        d, n = overlap_diff(s, other)
        ok = d == d and d <= OVERLAP_TOLERANCE
        checks.append(_check("concordance_deux_sources", ok, f"écart absolu médian des rendements quotidiens : {d:.5f} sur {n} dates communes (seuil {OVERLAP_TOLERANCE})"
                             if d == d else f"trop peu de dates communes ({n}) pour comparer"))
    res = {"passed": all(c["ok"] for c in checks), "checks": checks}
    _trace.record(trace, "fact_checker", "check_data", "fact_checker.check_data", {"source": meta.get("source_id"), "n_obs": int(len(s))},
                  {"passed": res["passed"], "failed": [c["name"] for c in checks if not c["ok"]]}, t0)
    return res


def merge(*results: dict) -> dict:
    checks = [c for r in results for c in r["checks"]]
    return {"passed": all(c["ok"] for c in checks), "checks": checks}
