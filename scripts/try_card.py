"""Essai : carte réelle du fil + explication hors ligne, pour vérifier que les deux modules s'emboîtent.
Lancer : PYTHONPATH=. .venv/Scripts/python scripts/try_card.py [Persona] [TICKER]"""
import sys
import warnings

import alphaforge as af
from alphaforge import agents as ag
from alphaforge import decide as d
from alphaforge import feed
from alphaforge import questionnaire as q

warnings.filterwarnings("ignore")
sys.stdout.reconfigure(encoding="utf-8")
name = sys.argv[1] if len(sys.argv) > 1 else "Robert"
ticker = sys.argv[2] if len(sys.argv) > 2 else "TSLA"
px, u = af.load_starter()
meta = af.starter_metadata(u)
profile, _ = q.to_profile(q.build_declared(q.PERSONAS[name]["answers"]), name)
opts = d.options(px, profile, meta)
base = next(o for o in opts if o["key"] == "aligned")["result"]["weights"]
card = feed.card(px, u, meta, profile, base, ticker, with_scenarios=True)
r = ag.explain_card(card, profile, level="detailed", force_offline=True)
print("MODE", r["mode"], "| GOUVERNANCE", {k: v for k, v in r["governance"].items() if k != "flagged_phrases"})
print("\n--- COURT ---\n" + r["short"])
print("\n--- LONG ---\n" + r["long"])
s = card["scenarios"]
print("\nscénarios:", {k: s[k] for k in ("amount", "years", "p5", "p50", "p95", "share_below_start")})
