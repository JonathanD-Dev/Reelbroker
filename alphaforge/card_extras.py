"""Extra facts of a feed card, independent of the profile: where the gain came from (price or
dividends), risk categories, and the sources behind the card's figures.

Code only (no language model, not part of the agent pipeline). Every value comes from the CSV
files of the dataset; every risk tag carries the rule or the figure it comes from, so it can be
shown and checked. Risk categories follow the workshop "Comprendre l'investisseur" (slide 8:
marché, crédit, liquidité, taux et inflation, devise, concentration).
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import pandas as pd

from .data import EXTENDED_DIR, STARTER_DIR

YAHOO_URL = "https://finance.yahoo.com"
BOC_FX_URL = "https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json"

SECTOR_FR = {
    "Information Technology": "Technologie", "Communication Services": "Communications", "Consumer Discretionary": "Consommation discrétionnaire",
    "Consumer Staples": "Consommation de base", "Energy": "Énergie", "Financials": "Finance", "Health Care": "Santé",
    "Industrials": "Industrie", "Materials": "Matériaux", "Utilities": "Services publics",
    "Real estate (Canada)": "Immobilier", "Real estate (U.S.)": "Immobilier", "Thematic (Clean energy)": "Énergies propres",
    "Gold": "Or", "Crypto asset": "Cryptoactif",
}

# Thresholds of the "Marché" tag, on the annualised volatility of daily returns over the window.
VOL_HIGH = 0.30
VOL_MEDIUM = 0.15
# The price / dividend split is shown only when dividends are a meaningful part of the gain.
MIN_DIVIDEND_SHARE = 0.10


@lru_cache(maxsize=1)
def _raw(root: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Close and adjusted close in listing currency (starter + extended), and the starter's dividends."""
    base = Path(root)
    cols = ["date", "ticker", "close", "adj_close", "currency"]
    frames = [pd.read_csv(base / STARTER_DIR / "prices_daily.csv", usecols=cols, parse_dates=["date"])]
    ext = base / EXTENDED_DIR / "prices_daily.csv"
    if ext.exists():
        e = pd.read_csv(ext, usecols=cols, parse_dates=["date"])
        frames.append(e[~e["ticker"].isin(frames[0]["ticker"].unique())])  # the starter wins on duplicates
    prices = pd.concat(frames, ignore_index=True).sort_values(["ticker", "date"])
    ca = pd.read_csv(base / STARTER_DIR / "corporate_actions.csv", parse_dates=["ex_date"])
    return prices, ca[ca["action"] == "dividend"]


def income_split(root: str, ticker: str, years: int = 5) -> dict | None:
    """Gain over the window split between the price change and the dividends (reinvested).

    total = adj_close change (dividends and splits reinvested); price = close change;
    dividends = total - price. Listing currency: the split does not depend on the CAD conversion.
    """
    prices, ca = _raw(root)
    s = prices[prices["ticker"] == ticker].dropna(subset=["close", "adj_close"])
    if len(s) < 2:
        return None
    start = s["date"].iloc[-1] - pd.DateOffset(years=years)
    s = s[s["date"] >= start]
    a, b = s.iloc[0], s.iloc[-1]
    if a["close"] <= 0 or a["adj_close"] <= 0:
        return None
    price = float(b["close"] / a["close"] - 1)
    total = float(b["adj_close"] / a["adj_close"] - 1)
    div = total - price
    gain = max(price, 0.0) + max(div, 0.0)
    share = (max(div, 0.0) / gain) if gain > 0 else (1.0 if div > 0 else 0.0)
    events = ca[(ca["ticker"] == ticker) & (ca["ex_date"] > a["date"])]
    last12 = ca[(ca["ticker"] == ticker) & (ca["ex_date"] > b["date"] - pd.DateOffset(years=1))]
    has_events = ticker in set(ca["ticker"])
    return {
        "window": [str(a["date"].date()), str(b["date"].date())],
        "currency": str(b["currency"]),
        "total": round(total, 4), "price": round(price, 4), "dividends": round(div, 4),
        "dividend_share": round(share, 4),
        "show": bool(div > 0 and share >= MIN_DIVIDEND_SHARE),
        "n_payments": int(len(events)) if has_events else None,
        "per_share": round(float(events["value"].sum()), 2) if has_events else None,
        "yield_12m": round(float(last12["value"].sum() / b["close"]), 4) if has_events and b["close"] > 0 else None,
        "method": "Clôture ajustée (dividendes et fractionnements réinvestis) comparée à la clôture seule, en devise de cotation.",
    }


def _pct(x: float) -> str:
    """0.0055 -> "0,6 %", 0.506 -> "51 %" (same rounding as the card)."""
    v = f"{x * 100:.1f}" if abs(x) < 0.1 else f"{x * 100:.0f}"
    return v.replace(".", ",") + " %"


def _tag(code: str, label: str, level: str, basis: str) -> dict:
    """level: high | medium | low | info."""
    return {"code": code, "label": label, "level": level, "basis": basis}


def risk_tags(asset_class: str, sector: str, currency: str, vol: float, window: list[str]) -> list[dict]:
    """Risk categories of a product, each with the figure or the rule it comes from."""
    tags: list[dict] = []
    period = f"{window[0]} → {window[1]}"
    lvl = "high" if vol >= VOL_HIGH else "medium" if vol >= VOL_MEDIUM else "low"
    word = {"high": "élevé", "medium": "modéré", "low": "faible"}[lvl]
    tags.append(_tag("market", f"Marché {word}", lvl,
                     f"Volatilité annualisée de {_pct(vol)} ({period}). Seuils : {VOL_MEDIUM * 100:.0f} % et {VOL_HIGH * 100:.0f} %."))
    s = sector or ""
    if asset_class == "equity":
        tags.append(_tag("concentration", "Une seule société", "medium", "Règle : une action dépend d’une seule société (risque propre à l’entreprise)."))
        if s in SECTOR_FR:
            tags.append(_tag("sector", SECTOR_FR[s], "info", f"Secteur : {SECTOR_FR[s]} (étiquette GICS de l’univers d’actifs). Plusieurs titres du même secteur réagissent souvent ensemble."))
    elif asset_class in ("etf_equity", "etf_bond"):
        tags.append(_tag("concentration", "Diversifié", "low", "Règle : un FNB détient de nombreux titres (concentration faible)."))
    elif asset_class == "etf_commodity":
        tags.append(_tag("concentration", f"Une matière : {SECTOR_FR.get(s, s)}", "medium", "Règle : le fonds suit une seule matière première."))
    if asset_class == "etf_bond":
        short = "ultra short" in s or "short Treasury" in s
        tags.append(_tag("rates", f"Taux {'faible' if short else 'élevé'}", "low" if short else "high",
                         "Règle : le prix d’une obligation baisse quand les taux montent ; l’effet est faible à très court terme."))
        gov = "Treasury" in s
        tags.append(_tag("credit", f"Crédit {'faible' if gov else 'modéré'}", "low" if gov else "medium",
                         "Règle : obligations d’État (faible) ou panier incluant des sociétés (modéré)."))
    if asset_class == "crypto":
        tags.append(_tag("custody", "Garde et techno", "high", "Règle : actif numérique (garde, plateforme, technologie)."))
    if currency == "USD":
        tags.append(_tag("currency", "Devise USD", "medium", "Coté en USD, montré en CAD : le taux de change fait partie du résultat."))
    else:
        tags.append(_tag("currency", "Devise CAD", "low", "Coté en CAD : pas de risque de change pour un investisseur canadien."))
    return tags


def sources(ticker: str, currency: str, extended: bool, n_obs: int, window: list[str]) -> list[dict]:
    """Sources of the card's figures, numbered as on the card (① prices, ② exchange rate)."""
    out = [{
        "id": "prices", "label": "Yahoo Finance · cours ajustés",
        "detail": (f"{'Univers étendu ReelBroker, téléchargé par notre script (yfinance)' if extended else 'Jeu de départ des organisateurs (yfinance)'} : "
                   f"{n_obs} cours quotidiens du {window[0]} au {window[1]}, clôture ajustée des dividendes et fractionnements."),
        "url": YAHOO_URL,
    }]
    if currency == "USD":
        out.append({"id": "fx", "label": "Banque du Canada · USD → CAD",
                    "detail": "Taux de change quotidien USD/CAD (série FXUSDCAD, API Valet), dernier taux connu reporté les jours fériés.",
                    "url": BOC_FX_URL})
    return out
