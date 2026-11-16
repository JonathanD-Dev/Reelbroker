"""Download one logo per ticker into web/public/logos/<TICKER>.png (run once; the files are committed).

For each company website we try, in order, its apple-touch-icon (usually 180 px) and the Google
favicon service (https://www.google.com/s2/favicons?domain=<domain>&sz=128), keep the largest image,
and save it as a 128 px PNG. Images under 32 px are dropped: the app then shows the initials.
ETFs show their issuer (iShares, Vanguard, BMO...). Logos are trademarks of their owners and are used
only to identify the product in this datathon demo.

Usage: .venv/bin/python scripts/fetch_logos.py [--force] [TICKER ...]
"""
from __future__ import annotations

import io
import sys
import urllib.request
from pathlib import Path

from PIL import Image

DOMAINS = {
    # Canada
    "RY.TO": "rbc.com", "TD.TO": "td.com", "MFC.TO": "manulife.com", "ENB.TO": "enbridge.com",
    "CNQ.TO": "cnrl.com", "CNR.TO": "cn.ca", "FTS.TO": "fortisinc.com", "ATD.TO": "couche-tard.com",
    "SHOP.TO": "shopify.com", "CSU.TO": "csisoftware.com", "BMO.TO": "bmo.com", "BNS.TO": "scotiabank.com",
    "CM.TO": "cibc.com", "NA.TO": "nbc.ca", "SU.TO": "suncor.com", "CP.TO": "cpkcr.com", "BCE.TO": "bce.ca",
    "T.TO": "telus.com", "SLF.TO": "sunlife.com", "TRI.TO": "thomsonreuters.com",
    "WCN.TO": "wasteconnections.com", "NTR.TO": "nutrien.com", "AEM.TO": "agnicoeagle.com",
    "ABX.TO": "barrick.com", "L.TO": "loblaw.ca", "DOL.TO": "dollarama.com", "QSR.TO": "rbi.com",
    "GIB-A.TO": "cgi.com", "POW.TO": "powercorporation.com", "IFC.TO": "intact.ca",
    # United States
    "AAPL": "apple.com", "MSFT": "microsoft.com", "NVDA": "nvidia.com", "GOOGL": "google.com",
    "AMZN": "amazon.com", "TSLA": "tesla.com", "JPM": "jpmorganchase.com", "JNJ": "jnj.com", "PG": "pg.com",
    "XOM": "exxon.com", "V": "visa.com", "MA": "mastercard.com", "UNH": "uhc.com",
    "HD": "homedepot.com", "KO": "coca-cola.com", "PEP": "pepsico.com", "COST": "costco.com",
    "WMT": "walmart.com", "LLY": "lilly.com", "ABBV": "abbvie.com", "MRK": "merck.com",
    "AVGO": "broadcom.com", "ORCL": "oracle.com", "CRM": "salesforce.com", "META": "meta.com",
    "NFLX": "netflix.com", "AMD": "amd.com", "DIS": "disney.com", "MCD": "mcdonalds.com",
    "BRK-B": "berkshirehathaway.com", "CAT": "caterpillar.com", "NEE": "nexteraenergy.com",
    "LIN": "linde.com", "UNP": "up.com", "ADBE": "adobe.com",
    # ETFs (issuer)
    "XIU.TO": "ishares.com", "XBB.TO": "ishares.com", "XEQT.TO": "ishares.com", "XEF.TO": "ishares.com",
    "XRE.TO": "ishares.com", "AGG": "ishares.com", "TLT": "ishares.com", "IEFA": "ishares.com",
    "EEM": "ishares.com", "ICLN": "ishares.com", "SHY": "ishares.com", "IEF": "ishares.com",
    "ZST.TO": "bmo.com", "ZAG.TO": "bmo.com",
    "SPY": "ssga.com", "GLD": "spdrgoldshares.com", "QQQ": "invesco.com", "SCHD": "schwab.com",
    "ESGV": "vanguard.com", "VFV.TO": "vanguard.com", "VCN.TO": "vanguard.com", "VNQ": "vanguard.com",
    "VIG": "vanguard.com", "BND": "vanguard.com",
    # Crypto
    "BTC-USD": "bitcoin.org", "ETH-USD": "ethereum.org",
}

# Made by hand, never overwritten: the coca-cola.com favicon is a black ribbon nobody recognises, so
# KO.png is the Wikimedia Commons "Coca-Cola_logo.svg" wordmark drawn in white on Coca-Cola red (128 px).
MANUAL = {"KO"}

OUT = Path(__file__).resolve().parent.parent / "web" / "public" / "logos"
SIZE = 128
MIN_SIZE = 32
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"


def _get(url: str) -> Image.Image | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=10) as r:
            data = r.read()
        img = Image.open(io.BytesIO(data))
        img.load()
        return img
    except Exception:
        return None


def candidates(domain: str) -> list[str]:
    hosts = [f"www.{domain}", domain]
    urls = [f"https://{h}/{name}" for h in hosts for name in ("apple-touch-icon.png", "apple-touch-icon-precomposed.png")]
    urls += [f"https://www.google.com/s2/favicons?domain={h}&sz=128" for h in hosts]
    urls += [f"https://icons.duckduckgo.com/ip3/{domain}.ico"] + [f"https://{h}/favicon.ico" for h in hosts]
    return urls


def best_logo(domain: str) -> tuple[Image.Image, str] | None:
    best: tuple[Image.Image, str] | None = None
    for url in candidates(domain):
        img = _get(url)
        if img is None:
            continue
        if best is None or min(img.size) > min(best[0].size):
            best = (img, url)
        if min(img.size) >= SIZE:
            break
    if best is None or min(best[0].size) < MIN_SIZE:
        return None
    return best


def main(argv: list[str]) -> int:
    force = "--force" in argv
    only = [a for a in argv if not a.startswith("--")]
    OUT.mkdir(parents=True, exist_ok=True)
    missing = []
    for ticker, domain in DOMAINS.items():
        if ticker in MANUAL or (only and ticker not in only):
            continue
        path = OUT / f"{ticker}.png"
        if path.exists() and not force:
            continue
        found = best_logo(domain)
        if found is None:
            missing.append(f"{ticker} ({domain})")
            path.unlink(missing_ok=True)
            continue
        img, url = found
        src = min(img.size)
        img = img.convert("RGBA")
        scale = SIZE / max(img.size)  # up or down, so small icons fill the circle too
        img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)
        canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        canvas.paste(img, ((SIZE - img.width) // 2, (SIZE - img.height) // 2), img)
        canvas.save(path, "PNG", optimize=True)
        print(f"{ticker:9} {src:>3}px  {url}")
    have = len(list(OUT.glob("*.png")))
    print(f"\n{have}/{len(DOMAINS)} logos in {OUT}")
    if missing:
        print("No usable logo (initials shown instead): " + ", ".join(missing))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
