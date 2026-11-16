"""Écrit web/public/snapshot.json : pour chaque persona, {profile, feed (20 cartes), details de toutes les cartes du feed}.

Permet à l'interface React de fonctionner sans le serveur (démo hors ligne). Usage : python scripts/export_snapshot.py
"""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ.setdefault("ALPHAFORGE_PROFILES", str(ROOT / "outputs" / "snapshot_profiles.json"))

from fastapi.testclient import TestClient  # noqa: E402

from alphaforge.api import app  # noqa: E402

STRIP_TRACE = "--strip-trace" in sys.argv
OUT = ROOT / "web" / "public" / "snapshot.json"


def main() -> None:
    snap = {"note": "Instantané ReelBroker : profils fictifs, simulation seulement.", "personas": {}}
    with TestClient(app) as c:
        snap["hypotheses"] = c.get("/api/hypotheses").json()
        for p in c.get("/api/personas").json():
            prof = c.post("/api/profile", json={"persona": p["id"], "reset": True}).json()
            pid = prof["profile_id"]
            items = c.get("/api/feed", params={"profile_id": pid, "limit": 20}).json()["items"]
            details = {}
            for it in items:
                r = c.get(f"/api/card/{it['ticker']}", params={"profile_id": pid})
                if r.status_code == 200:
                    det = r.json()
                    det["pipeline"].pop("trace", None) if STRIP_TRACE else None
                    details[it["ticker"]] = det
            snap["personas"][p["id"]] = {"profile": prof, "feed": items, "details": details}
            print(p["id"], len(items), "cartes,", len(details), "détails")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(snap, ensure_ascii=False), encoding="utf-8")
    print("écrit", OUT, f"{OUT.stat().st_size / 1e6:.1f} Mo")


if __name__ == "__main__":
    main()
