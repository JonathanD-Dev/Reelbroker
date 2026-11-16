"""Loading and sanity-checking price data.

Expected shape (from the AWS workshop example): a long CSV such as prices_daily.csv
with columns date, symbol, adj_close (plus maybe close, volume...). Column names are
auto-detected so a slightly different file still loads.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

DATE_NAMES = ["date", "datetime", "timestamp", "as_of", "asof", "day"]
SYMBOL_NAMES = ["symbol", "ticker", "asset", "security", "instrument", "ric", "isin"]
# Order matters: always prefer the adjusted price (splits/dividends) over the raw close.
PRICE_NAMES = ["adj_close", "adjclose", "adj close", "adjusted_close", "close_adj", "price", "close", "nav", "last"]


def _find(cols, candidates):
    low = {c.lower().strip(): c for c in cols}
    for cand in candidates:
        if cand in low:
            return low[cand]
    return None


def read_any(path: str | Path) -> pd.DataFrame:
    path = Path(path)
    suf = path.suffix.lower()
    if suf in (".parquet", ".pq"):
        return pd.read_parquet(path)
    if suf in (".xlsx", ".xls"):
        return pd.read_excel(path)
    if suf == ".json":
        return pd.read_json(path)
    return pd.read_csv(path, sep=None, engine="python")


def load_prices(path: str | Path, price_col: str | None = None) -> pd.DataFrame:
    """Return a wide DataFrame: index = date, columns = symbols, values = (adjusted) price."""
    raw = read_any(path)
    date_col = _find(raw.columns, DATE_NAMES)
    sym_col = _find(raw.columns, SYMBOL_NAMES)
    if date_col is None:
        raise ValueError(f"No date column found in {list(raw.columns)}")
    raw[date_col] = pd.to_datetime(raw[date_col])
    if sym_col is not None:  # long format
        price_col = price_col or _find(raw.columns, PRICE_NAMES)
        if price_col is None:
            raise ValueError(f"No price column found in {list(raw.columns)}")
        wide = raw.pivot_table(index=date_col, columns=sym_col, values=price_col, aggfunc="last")
    else:  # already wide
        wide = raw.set_index(date_col).select_dtypes("number")
    wide = wide.sort_index()
    wide.index.name = "date"
    wide.attrs["price_col"] = price_col or "wide"
    wide.attrs["source"] = str(path)
    return wide


def quality_report(prices: pd.DataFrame) -> pd.DataFrame:
    """One row per symbol: coverage, gaps and suspicious moves. Read this before any analysis."""
    rets = prices.pct_change(fill_method=None)
    rows = []
    for s in prices.columns:
        p = prices[s].dropna()
        r = rets[s].dropna()
        rows.append(
            {
                "symbol": s,
                "first": p.index.min().date() if len(p) else None,
                "last": p.index.max().date() if len(p) else None,
                "n_obs": len(p),
                "pct_missing": round(100 * prices[s].isna().mean(), 2),
                "non_positive": int((p <= 0).sum()),
                "max_gap_days": int(p.index.to_series().diff().dt.days.max()) if len(p) > 1 else 0,
                # A -50% / +100% day on a raw price is usually an unadjusted split, not a real move.
                "suspect_split_days": int(((r < -0.45) | (r > 0.9)).sum()),
                "stale_days": int((r == 0).sum()),
            }
        )
    return pd.DataFrame(rows).set_index("symbol")


def make_synthetic(n_days: int = 252 * 6, seed: int = 7) -> pd.DataFrame:
    """Fake multi-asset prices (long format) so the pipeline can be tested before the real data lands."""
    rng = np.random.default_rng(seed)
    specs = {  # symbol: (annual drift, annual vol, loading on equity factor)
        "CASH.TO": (0.03, 0.005, 0.0),
        "BOND.TO": (0.035, 0.06, 0.1),
        "CDN.TO": (0.07, 0.15, 0.9),
        "USA.TO": (0.09, 0.17, 1.0),
        "INTL.TO": (0.06, 0.16, 0.9),
        "EM.TO": (0.07, 0.21, 1.1),
        "TECH.TO": (0.12, 0.28, 1.4),
        "GOLD.TO": (0.05, 0.16, 0.0),
        "REIT.TO": (0.06, 0.18, 0.8),
    }
    dates = pd.bdate_range(end="2026-11-13", periods=n_days)
    factor = rng.normal(0, 0.16 / np.sqrt(252), n_days)
    frames = []
    for sym, (mu, vol, beta) in specs.items():
        idio_vol = np.sqrt(max(vol**2 - (beta * 0.16) ** 2, 1e-6))
        r = mu / 252 + beta * factor + rng.normal(0, idio_vol / np.sqrt(252), n_days)
        px = 100 * np.exp(np.cumsum(r - 0.5 * (vol**2) / 252))
        frames.append(pd.DataFrame({"date": dates, "symbol": sym, "adj_close": px.round(4)}))
    return pd.concat(frames, ignore_index=True)


STARTER_DIR = Path("data/raw/datathon2026/Datathon2026/alphaforge_starter")


def _assemble(raw: pd.DataFrame, universe: pd.DataFrame, folder: Path, base_currency: str | None) -> pd.DataFrame:
    """Format long (date, ticker, adj_close) -> prix larges sur le calendrier commun, convertis en `base_currency` (taux BoC du jeu de départ)."""
    wide = raw.pivot(index="date", columns="ticker", values="adj_close").sort_index()
    wide = wide[[t for t in universe.index if t in wide.columns]]
    equity_like = universe.index[universe["asset_class"] != "crypto"]
    # Keep days where at least one exchange was open, so crypto weekends do not distort correlations.
    wide = wide[wide[equity_like].notna().any(axis=1)].ffill(limit=3)
    if base_currency:
        fx = pd.read_csv(folder / "fx_usdcad_daily.csv", parse_dates=["date"]).set_index("date")["usdcad"]
        fx = fx.reindex(wide.index.union(fx.index)).ffill().bfill().reindex(wide.index)
        for t in wide.columns:
            cur = universe.loc[t, "currency"]
            if cur == base_currency:
                continue
            if {cur, base_currency} != {"USD", "CAD"}:
                raise ValueError(f"No FX series for {cur}->{base_currency}")
            wide[t] = wide[t] * fx if cur == "USD" else wide[t] / fx
    wide.index.name = "date"
    try:  # taux sans risque : moyenne du taux directeur de la Banque du Canada sur la fenêtre (série V39079, en %)
        macro = pd.read_csv(folder / "macro_rates.csv", parse_dates=["date"])
        rate = macro.loc[macro["series_id"] == "V39079", "value"]
        if len(rate):
            from . import metrics as _m

            _m.RISK_FREE = round(float(rate.mean()) / 100, 4)
            wide.attrs["risk_free"] = _m.RISK_FREE
    except FileNotFoundError:
        pass
    return wide


def load_starter(folder: str | Path = STARTER_DIR, base_currency: str | None = "CAD") -> tuple[pd.DataFrame, pd.DataFrame]:
    """Official starter pack -> (prices, universe).

    prices: wide adj_close, one column per ticker, on the common business-day calendar
    (weekend crypto rows dropped; an asset's holiday gap is filled with its last price, max 3 days),
    converted to base_currency with the Bank of Canada USD/CAD rate (last rate carried over holidays).
    Pass base_currency=None to keep listing currencies. universe: assets_universe.csv indexed by ticker.
    """
    folder = Path(folder)
    universe = pd.read_csv(folder / "assets_universe.csv").set_index("ticker")
    raw = pd.read_csv(folder / "prices_daily.csv", parse_dates=["date"])
    wide = _assemble(raw, universe, folder, base_currency)
    wide.attrs.update(price_col="adj_close", base_currency=base_currency or "listing",
                      source="PolyFinances starter pack: Yahoo Finance via yfinance, FX Bank of Canada Valet, retrieved 2026-11-13")
    return wide, universe


EXTENDED_DIR = Path("data/processed/extended")


def load_extended_raw(folder: str | Path = EXTENDED_DIR) -> tuple[pd.DataFrame, pd.DataFrame, dict] | None:
    """Fichiers de l'univers étendu (`scripts/build_extended_universe.py`) -> (prix longs, univers, provenance), ou None s'ils manquent ou sont illisibles."""
    folder = Path(folder)
    try:
        raw = pd.read_csv(folder / "prices_daily.csv", parse_dates=["date"])
        uni = pd.read_csv(folder / "assets_universe.csv").set_index("ticker")
        prov = json.loads((folder / "provenance.json").read_text(encoding="utf-8"))
    except (OSError, ValueError, pd.errors.ParserError):
        return None
    if raw.empty or uni.empty or not {"date", "ticker", "adj_close"} <= set(raw.columns):
        return None
    return raw, uni, prov


def load_universe(folder: str | Path = STARTER_DIR, base_currency: str | None = "CAD", extended: bool = True,
                  extended_folder: str | Path = EXTENDED_DIR) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Jeu de départ + univers étendu, même format que `load_starter` : (prix larges en CAD, univers indexé par ticker).

    Le jeu de départ reste la source primaire : sur un ticker présent dans les deux, ses prix et sa fiche gagnent. Si les fichiers
    de l'univers étendu sont absents, illisibles ou si `extended=False`, le résultat est celui de `load_starter`.
    `universe["source"]` vaut « starter » ou « extended » ; `prices.attrs["extended"]` compte les tickers ajoutés (un nombre, pas une liste : pandas recopie `attrs` à chaque opération).
    """
    folder = Path(folder)
    prices, universe = load_starter(folder, base_currency)
    universe = universe.assign(source="starter")
    prices.attrs["extended"] = 0
    ext = load_extended_raw(extended_folder) if extended else None
    if ext is None:
        return prices, universe
    e_raw, e_uni, prov = ext
    e_uni = e_uni[~e_uni.index.isin(universe.index)]
    if e_uni.empty:
        return prices, universe
    e_raw = e_raw[e_raw["ticker"].isin(e_uni.index)]
    s_raw = pd.read_csv(folder / "prices_daily.csv", parse_dates=["date"])
    keep = ["date", "ticker", "adj_close"]
    raw = pd.concat([s_raw[keep], e_raw[keep]], ignore_index=True)
    uni = pd.concat([universe.drop(columns="source"), e_uni[universe.drop(columns="source").columns]]).assign(
        source=["starter"] * len(universe) + ["extended"] * len(e_uni))
    wide = _assemble(raw, uni, folder, base_currency)
    wide.attrs.update(price_col="adj_close", base_currency=base_currency or "listing", extended=len(e_uni),
                      source="Jeu de départ PolyFinances (Yahoo Finance via yfinance, taux Banque du Canada, extrait le 2026-11-13) + univers étendu "
                             f"ReelBroker ({prov.get('source', 'Yahoo Finance via yfinance')}, extrait le {str(prov.get('retrieved_at', ''))[:10]})")
    return wide, uni


def load_macro(folder: str | Path = STARTER_DIR) -> pd.DataFrame:
    """Macro series as wide DataFrame (columns = series_id). Monthly series are dated to the
    reference month, NOT the release date: lag them before using them in any simulation."""
    raw = pd.read_csv(Path(folder) / "macro_rates.csv", parse_dates=["date"])
    return raw.pivot_table(index="date", columns="series_id", values="value").sort_index()


# Hypothèses de classement pour le jeu de départ (affichées dans l'application).
CASH_LIKE = {"ZST.TO"}  # FNB d'obligations à très court terme : traité comme quasi-liquidités
SINGLE_CAPS = {"equity": 0.10, "crypto": 0.05}  # plafond par société et par cryptoactif ; les fonds diversifiés suivent le plafond du profil
SECTOR_CAP = 0.20  # plafond pour l'ensemble des actions individuelles d'un même secteur : évite d'empiler les gagnants passés d'un secteur

# Preuves ESG. Le jeu de départ ne contient aucune cote ESG, nouvelle ni donnée fondamentale. La seule information
# documentée est qu'un fonds de l'univers est présenté par son émetteur comme filtré selon des critères ESG. Pour tout le
# reste, on ne sait pas : « donnée insuffisante », jamais « conforme ».
ESG_EVIDENCE = {
    "ESGV": {"statut": "filtre_documente",
             "note": "Vanguard ESG U.S. Stock ETF : réplique l'indice FTSE US All Cap Choice. Selon l'émetteur, l'indice exclut les sociétés "
                     "liées au divertissement pour adultes, à l'alcool, au tabac, au cannabis, aux jeux d'argent, aux armes (chimiques, "
                     "biologiques, nucléaires, à sous-munitions, mines antipersonnel, armes militaires et armes à feu civiles), au nucléaire "
                     "civil, au charbon, au pétrole et au gaz ; il exclut aussi les sociétés que FTSE juge non conformes à certaines normes "
                     "de travail, de droits de la personne, d'environnement et d'anticorruption, en tenant compte de la gravité des "
                     "controverses, ainsi que celles qui ne remplissent pas deux de trois critères de diversité. Ces jugements sont ceux de "
                     "FTSE, selon ses méthodes internes : un filtre de fonds n'est pas une garantie sur chaque société détenue.",
             "source": "Vanguard, page du fonds ESGV, section stratégie et méthodologie de l'indice "
                       "(https://investor.vanguard.com/investment-products/etfs/profile/esgv), consultée le 2026-11-15."},
}
ESG_UNKNOWN = {"statut": "donnee_insuffisante", "note": "Aucune preuve ESG documentée dans nos données pour cet actif.", "source": None}


def esg_evidence(ticker: str) -> dict:
    return ESG_EVIDENCE.get(ticker, ESG_UNKNOWN)


def starter_metadata(universe: pd.DataFrame) -> dict:
    """(Aussi valable pour l'univers fusionné de `load_universe`.) Classes, étiquettes et plafonds pour `allocate`, dérivés de assets_universe.csv.

    Étiquettes ESG : `esg_screened` (filtre documenté) ; `esg_unverified` pour les sociétés individuelles sans preuve ; `esg_unscreened_fund` pour les fonds d'actions non filtrés,
    qui détiennent des sociétés non vérifiées. Le critère vise des sociétés : les cryptoactifs ne portent pas d'étiquette.
    Les obligations, l'or et les cryptoactifs ne portent aucune étiquette ESG : le critère « controverses d'entreprise » ne s'y applique pas tel quel.
    """
    raw = universe["asset_class"]
    classes = {t: ("cash" if t in CASH_LIKE else raw[t].replace("etf_", "")) for t in universe.index}
    tags = {}
    for t in universe.index:
        tags[t] = [universe.loc[t, "sector"], raw[t]]
        if esg_evidence(t)["statut"] == "filtre_documente":
            tags[t].append("esg_screened")
        elif raw[t] == "equity":
            tags[t].append("esg_unverified")
        elif raw[t] == "etf_equity":
            tags[t].append("esg_unscreened_fund")
        sec = str(universe.loc[t, "sector"]).lower()
        if sec.startswith("real estate"):
            tags[t].append("real_estate")  # FNB immobiliers (XRE.TO, VNQ) : actions de fonds de placement immobilier, classe « equity »
        if sec.startswith("thematic"):
            tags[t].append("thematic")  # ex. ICLN (énergies propres) : fonds thématique non filtré ESG, donc `esg_unscreened_fund`, jamais « ESG vérifié »
    caps = {t: SINGLE_CAPS[raw[t]] for t in universe.index if raw[t] in SINGLE_CAPS}
    sector_of = {t: universe.loc[t, "sector"] for t in universe.index if raw[t] == "equity"}
    return {"asset_class": classes, "tags": tags, "single_caps": caps,
            "group_maps": {"sector": sector_of}, "group_caps": {"sector": {sec: SECTOR_CAP for sec in sorted(set(sector_of.values()))}}}
