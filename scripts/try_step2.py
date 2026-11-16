"""Essai rapide de l'étape 2 sur les trois personas. Lancer : PYTHONPATH=. .venv/Scripts/python scripts/try_step2.py"""
import sys
import warnings

import alphaforge as af
from alphaforge import decide as d
from alphaforge import questionnaire as q

warnings.filterwarnings("ignore")
sys.stdout.reconfigure(encoding="utf-8")
px, u = af.load_starter()
meta = af.starter_metadata(u)
for name in q.PERSONAS:
    p, _ = q.to_profile(q.build_declared(q.PERSONAS[name]["answers"]), name)
    opts = d.options(px, p, meta)
    print("\n==", name, "niveau", p.effective_risk())
    for o in opts:
        s = o["result"]["stats"]
        print("  ", o["title"], o["level"], "vol", round(s["vol"], 3), "mdd", round(s["max_drawdown"], 3), "cagr", round(s["cagr"], 3),
              "croissance", round(o["growth_share"], 2), "dans profil", o["within_profile"])
    base = next(o for o in opts if o["key"] == "aligned")["result"]["weights"]
    for tk, wt in (("TSLA", 0.20), ("NVDA", 0.05), ("BTC-USD", 0.05)):
        r = d.check_intention(px, p, base, tk, wt, meta, u)
        print("  >", tk, wt, r["verdict"], "| max dans le profil :", r["max_weight_within_profile"])
        for c in r["checks"]:
            if c["status"] != "ok":
                print("      -", c["status"], c["message"])
for t in ("Je veux mettre 20 % dans Tesla", "10% bitcoin et nvidia", "un peu d'or", "5 pour cent dans NVDA"):
    print(t, "->", d.parse_intention(t, u))
