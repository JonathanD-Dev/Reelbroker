"""Télécharge l'univers étendu (titres supplémentaires) avec yfinance, sur la MÊME fenêtre que le jeu de départ.

Sortie dans data/processed/extended/ :
  prices_daily.csv     format long : date, ticker, close, adj_close, volume, currency  (mêmes noms que le jeu de départ)
  assets_universe.csv  asset_id, ticker, name, asset_class, market, currency, sector   (mêmes colonnes que le jeu de départ)
  provenance.json      source, version, date d'extraction, fenêtre, méthode d'ajustement, titres retenus et écartés (avec raison)
  quality_report.csv   `data.quality_report` sur les prix retenus

Méthode : `auto_adjust=False`, colonne « Adj Close » (dividendes et fractionnements réinvestis), comme `build_dataset.py` du jeu de départ.
Règles de rejet (journalisées) : historique plus court que la fenêtre, trou de plus de 7 jours de bourse consécutifs, prix non positif.
Biais du survivant : cette liste a été choisie en 2026 parmi des titres connus et liquides ; elle ne contient pas les perdants disparus.

Usage : .venv\\Scripts\\python scripts\\build_extended_universe.py
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from alphaforge import data as dt  # noqa: E402

OUT = ROOT / "data" / "processed" / "extended"
START, END_INCL = "2021-11-12", "2026-11-12"
MAX_GAP_BDAYS = 7
GAP_TOLERANCE_DAYS = 5  # début/fin : au plus 5 jours calendaires d'écart avec la fenêtre

# ticker: (nom, classe, marché, devise, secteur) ; classes et secteurs suivent exactement les étiquettes du jeu de départ.
CA, US = ("TSX", "CAD"), ("NYSE", "USD")
EQ = "equity"
SPECS: dict[str, tuple] = {}


def add(rows: str, cls: str, market: str, cur: str) -> None:
    for line in rows.strip().splitlines():
        t, name, sector = [x.strip() for x in line.split("|")]
        SPECS[t] = (name, cls, market, cur, sector)


add("""BMO.TO | Bank of Montreal | Financials
BNS.TO | Bank of Nova Scotia | Financials
CM.TO | Canadian Imperial Bank of Commerce | Financials
NA.TO | National Bank of Canada | Financials
SU.TO | Suncor Energy | Energy
CP.TO | Canadian Pacific Kansas City | Industrials
BCE.TO | BCE | Communication Services
T.TO | TELUS | Communication Services
SLF.TO | Sun Life Financial | Financials
TRI.TO | Thomson Reuters | Industrials
WCN.TO | Waste Connections | Industrials
NTR.TO | Nutrien | Materials
AEM.TO | Agnico Eagle Mines | Materials
ABX.TO | Barrick Mining | Materials
L.TO | Loblaw Companies | Consumer Staples
DOL.TO | Dollarama | Consumer Staples
QSR.TO | Restaurant Brands International | Consumer Discretionary
GIB-A.TO | CGI (Class A) | Information Technology
POW.TO | Power Corporation of Canada | Financials
IFC.TO | Intact Financial | Financials""", EQ, "TSX", "CAD")
add("""V | Visa | Financials
MA | Mastercard | Financials
UNH | UnitedHealth Group | Health Care
HD | Home Depot | Consumer Discretionary
KO | Coca-Cola | Consumer Staples
PEP | PepsiCo | Consumer Staples
COST | Costco Wholesale | Consumer Staples
WMT | Walmart | Consumer Staples
LLY | Eli Lilly | Health Care
ABBV | AbbVie | Health Care
MRK | Merck & Co. | Health Care
AVGO | Broadcom | Information Technology
ORCL | Oracle | Information Technology
CRM | Salesforce | Information Technology
META | Meta Platforms | Communication Services
NFLX | Netflix | Communication Services
AMD | Advanced Micro Devices | Information Technology
DIS | Walt Disney | Communication Services
MCD | McDonald's | Consumer Discretionary
BRK-B | Berkshire Hathaway (Class B) | Financials
CAT | Caterpillar | Industrials
NEE | NextEra Energy | Utilities
LIN | Linde | Materials
UNP | Union Pacific | Industrials
ADBE | Adobe | Information Technology""", EQ, "NYSE/NASDAQ", "USD")
add("""VFV.TO | Vanguard S&P 500 Index ETF (CAD) | Broad market (U.S.)
XEQT.TO | iShares Core Equity ETF Portfolio (global) | Broad market (Global)
VCN.TO | Vanguard FTSE Canada All Cap Index ETF | Broad market (Canada)
XEF.TO | iShares Core MSCI EAFE IMI Index ETF | Broad market (International developed)
XRE.TO | iShares S&P/TSX Capped REIT Index ETF | Real estate (Canada)""", "etf_equity", "TSX", "CAD")
add("""ZAG.TO | BMO Aggregate Bond Index ETF | Bonds (Canada aggregate)""", "etf_bond", "TSX", "CAD")
add("""IEFA | iShares Core MSCI EAFE ETF | Broad market (International developed)
EEM | iShares MSCI Emerging Markets ETF | Broad market (Emerging markets)
VNQ | Vanguard Real Estate ETF | Real estate (U.S.)
SCHD | Schwab U.S. Dividend Equity ETF | Broad market (U.S. dividend)
VIG | Vanguard Dividend Appreciation ETF | Broad market (U.S. dividend growth)
ICLN | iShares Global Clean Energy ETF | Thematic (Clean energy)""", "etf_equity", "NYSE/NASDAQ", "USD")
add("""BND | Vanguard Total Bond Market ETF | Bonds (U.S. aggregate)
SHY | iShares 1-3 Year Treasury Bond ETF | Bonds (U.S. short Treasury)
IEF | iShares 7-10 Year Treasury Bond ETF | Bonds (U.S. intermediate Treasury)""", "etf_bond", "NYSE/NASDAQ", "USD")


def evaluate(ticker: str, s: pd.Series) -> str | None:
    """Raison du rejet, ou None si la série est acceptable."""
    s = s.dropna()
    if len(s) == 0:
        return "aucune donnée téléchargée"
    start, end = pd.Timestamp(START), pd.Timestamp(END_INCL)
    if (s.index[0] - start).days > GAP_TOLERANCE_DAYS:
        return f"historique plus court que la fenêtre (première date {s.index[0].date()})"
    if (end - s.index[-1]).days > GAP_TOLERANCE_DAYS:
        return f"dernière date {s.index[-1].date()} trop ancienne"
    if (s <= 0).any():
        return "prix non positif"
    gaps = np.array([np.busday_count(a.date(), b.date()) for a, b in zip(s.index[:-1], s.index[1:])])
    if len(gaps) and gaps.max() > MAX_GAP_BDAYS:
        i = int(gaps.argmax())
        return f"trou de {gaps.max()} jours de bourse ({s.index[i].date()} -> {s.index[i + 1].date()})"
    return None


def main() -> int:
    import yfinance as yf

    starter_tickers = set(pd.read_csv(ROOT / dt.STARTER_DIR / "assets_universe.csv")["ticker"])
    tickers = [t for t in SPECS if t not in starter_tickers]
    end_excl = (pd.Timestamp(END_INCL) + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    raw = yf.download(tickers, start=START, end=end_excl, auto_adjust=False, actions=True, group_by="ticker", progress=False, threads=True)
    kept, dropped, frames = [], [], []
    for t in tickers:
        try:
            d = raw[t].copy()
        except KeyError:
            dropped.append({"ticker": t, "reason": "absent de la réponse Yahoo"})
            continue
        d.index = pd.to_datetime(d.index).tz_localize(None).normalize()
        d = d[d["Adj Close"].notna()]
        why = evaluate(t, d["Adj Close"])
        if why:
            dropped.append({"ticker": t, "reason": why})
            continue
        kept.append(t)
        frames.append(pd.DataFrame({"date": d.index, "ticker": t, "close": d["Close"].to_numpy(), "adj_close": d["Adj Close"].to_numpy(),
                                    "volume": d["Volume"].fillna(0).astype("int64").to_numpy(), "currency": SPECS[t][3]}))
    if not kept:
        print("Aucun titre retenu.", file=sys.stderr)
        return 1
    prices = pd.concat(frames, ignore_index=True).sort_values(["ticker", "date"])
    prices["date"] = prices["date"].dt.strftime("%Y-%m-%d")
    OUT.mkdir(parents=True, exist_ok=True)
    prices.to_csv(OUT / "prices_daily.csv", index=False)
    uni = pd.DataFrame([{"asset_id": f"X{i + 1:02d}", "ticker": t, "name": SPECS[t][0], "asset_class": SPECS[t][1], "market": SPECS[t][2],
                         "currency": SPECS[t][3], "sector": SPECS[t][4]} for i, t in enumerate(kept)])
    uni.to_csv(OUT / "assets_universe.csv", index=False)
    wide = dt.load_prices(OUT / "prices_daily.csv")
    qr = dt.quality_report(wide)
    qr.to_csv(OUT / "quality_report.csv")
    prov = {
        "source": f"Yahoo Finance via yfinance {yf.__version__}",
        "retrieved_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "window": [START, END_INCL],
        "adjustment": "auto_adjust=False ; colonne « Adj Close » utilisée pour les rendements (dividendes et fractionnements réinvestis), comme le jeu de départ ; "
                      "« Close » conservé pour information. Prix en devise de cotation (conversion en CAD faite au chargement avec le taux USD/CAD de la Banque du Canada du jeu de départ).",
        "currency": "listing currency (CAD or USD)",
        "selection": "Liste constituée à la main en 2026 : titres liquides et connus. Biais du survivant : aucun titre disparu ou déclassé n'y figure.",
        "rejection_rules": f"historique plus court que la fenêtre (tolérance {GAP_TOLERANCE_DAYS} jours calendaires), trou > {MAX_GAP_BDAYS} jours de bourse, prix non positif",
        "kept": kept, "dropped": dropped, "n_kept": len(kept), "n_requested": len(tickers),
        "quality_report_flags": {"suspect_split_days": {k: int(v) for k, v in qr["suspect_split_days"].items() if v}},
    }
    (OUT / "provenance.json").write_text(json.dumps(prov, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Retenus : {len(kept)} / {len(tickers)}")
    for dr in dropped:
        print("  écarté", dr["ticker"], "-", dr["reason"])
    print("Signalements qualité (jours de rendement suspects) :", prov["quality_report_flags"]["suspect_split_days"] or "aucun")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
