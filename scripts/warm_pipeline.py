"""Précalcule le pipeline (Bedrock compris) pour les 31 titres de départ : data/cache/pipeline/<ticker>.json.

Usage : .venv\Scripts\python scripts\warm_pipeline.py [TICKER ...]  (--fresh pour ignorer le cache existant)
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from alphaforge import agents, pipeline  # noqa: E402
from alphaforge.pipeline import source_finder  # noqa: E402


def main(argv: list[str]) -> None:
    agents.load_env()
    fresh = "--fresh" in argv
    tickers = [a for a in argv if not a.startswith("--")] or sorted(source_finder._universe())
    print(f"Bedrock disponible : {agents.bedrock_available()} ; {len(tickers)} titres")
    t0, ok = time.time(), 0
    for t in tickers:
        t1 = time.time()
        try:
            r = pipeline.run(t, use_cache=not fresh)
        except Exception as exc:  # noqa: BLE001
            print(f"{t:10s} ERREUR {type(exc).__name__}: {exc}")
            continue
        e = r["pipeline"]["explanation"]
        ok += e["mode"] == "bedrock"
        print(f"{t:10s} {e['mode']:8s} tentatives={e['governance']['attempts']} gouvernance={e['governance']['passed']} cache={e['governance']['from_cache']} {time.time() - t1:5.1f}s")
    print(f"Terminé : {ok}/{len(tickers)} textes Bedrock validés en {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main(sys.argv[1:])
