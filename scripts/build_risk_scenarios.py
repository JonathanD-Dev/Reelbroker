"""Chiffres vérifiés pour la mise en situation de risque du questionnaire (P5 / P5a).

Sortie : data/processed/risk_scenarios.json. Relancer si les données ou les mélanges changent.
"""
import json
import warnings

import alphaforge as af
from alphaforge import metrics as m

warnings.filterwarnings("ignore")
MIXES = {
    "reference_equilibre": {"label": "60 % actions, 40 % obligations", "weights": {"XIU.TO": 0.30, "SPY": 0.30, "XBB.TO": 0.40}},
    "actions": {"label": "100 % actions", "weights": {"XIU.TO": 0.40, "SPY": 0.40, "QQQ": 0.20}},
}
px, _ = af.load_starter()
out = {"source": px.attrs["source"], "devise": "CAD", "fenetre": [str(px.index[0].date()), str(px.index[-1].date())],
       "methode": "adj_close converti en CAD, rééquilibrage trimestriel, baisse maximale du sommet au creux", "scenarios": {}}
for key, mix in MIXES.items():
    v = m.portfolio_value(px, mix["weights"])
    dd = v / v.cummax() - 1
    trough = dd.idxmin()
    peak = v[:trough].idxmax()
    after = v[trough:]
    rec = after[after >= v[peak]]
    out["scenarios"][key] = {
        **mix,
        "baisse_max": round(float(dd.min()), 4),
        "sommet": str(peak.date()), "creux": str(trough.date()),
        "duree_baisse_jours": int((trough - peak).days),
        "retour_au_sommet": str(rec.index[0].date()) if len(rec) else None,
        "duree_totale_sous_le_sommet_jours": int((rec.index[0] - peak).days) if len(rec) else None,
        "perte_sur_10000": round(10000 * float(-dd.min())),
    }
json.dump(out, open("data/processed/risk_scenarios.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(json.dumps(out, ensure_ascii=False, indent=2))
