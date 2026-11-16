"""Piste d'explication : données -> constats -> analyse -> scénario -> explication.

Répond aux quatre questions de l'atelier à partir des chiffres produits par le code :
quelles données, pourquoi ce choix, quelles limites, qu'est-ce qui changerait la réponse.
Aucun modèle de langage n'est requis ; s'il reformule, il ne doit inventer aucun chiffre.
"""
from __future__ import annotations

from . import metrics as _metrics
from .profile import LEVEL_FR, RISK_BUDGET, InvestorProfile


def RISK_FREE_NOW() -> float:
    return _metrics.RISK_FREE

METHOD_FR = {"max_diversification": "diversification maximale", "min_variance": "variance minimale",
             "max_utility": "rendement ajusté au risque (sensible aux rendements passés)"}


def pct(x, d=1):
    if x is None or x != x:
        return "n. d."
    return ("−" if x < 0 else "") + f"{abs(x) * 100:.{d}f}".replace(".", ",") + " %"


def num(x, d=2):
    return f"{x:.{d}f}".replace(".", ",")


def explain(profile: InvestorProfile, result: dict, sources: list[str] | None = None, asset_class: dict[str, str] | None = None,
            level: int | None = None) -> str:
    st, w, budget = result["stats"], result["weights"], profile.budget(level)
    asset_class = asset_class or {}
    start, end = result["data_window"]
    lines = [f"### Scénario fictif pour {profile.name}", "", "| Titre | Classe | Poids | Part du risque |", "|---|---|---|---|"]
    for s, x in sorted(w.items(), key=lambda kv: -kv[1]):
        lines.append(f"| {s} | {asset_class.get(s, '-')} | {pct(x)} | {pct(result['risk_contributions'].get(s))} |")

    lines += ["", "#### 1. Quelles données ?", ""]
    lines.append(f"- Cours quotidiens ajustés du {start} au {end} pour {len(result['universe'])} actifs (fractionnements et distributions inclus), en dollars canadiens.")
    for src in sources or ["Source non documentée"]:
        lines.append(f"- Source : {src}")
    for s, why in result["dropped"].items():
        lines.append(f"- Écarté : {s} ({why}).")

    lines += ["", "#### 2. Pourquoi ce choix ?", ""]
    lines += [f"- {r}" if not r.startswith("  ") else r for r in profile.reasoning()]
    if level and level != profile.effective_risk():
        lines.append(f"- Ce scénario est construit au niveau {level} sur 5, différent du niveau retenu pour le profil : il sert de comparaison.")
    lines.append(f"- Limites de ce niveau (hypothèses) : volatilité jusqu'à {pct(budget['max_vol'], 0)}, actifs de croissance jusqu'à "
                 f"{pct(budget['max_growth_assets'], 0)}, aucun fonds au-dessus de {pct(budget['max_single_weight'], 0)}.")
    lines.append(f"- Méthode : {METHOD_FR.get(result['objective'], result['objective'])}, à l'intérieur de ces limites. Elle répartit le risque "
                 "entre des actifs qui ne bougent pas ensemble, au lieu de choisir les gagnants du passé.")
    if result["binding"]:
        lines.append(f"- Limites qui ont réellement façonné le résultat : {' ; '.join(result['binding'])}.")
    lines.append(f"- Sur la période : volatilité {pct(st['vol'])}, pire baisse du sommet au creux {pct(st['max_drawdown'])}, pires 12 mois "
                 f"{pct(st['worst_1y'])}, rendement historique {pct(st['cagr'])} par an, ratio de Sharpe {num(st['sharpe'])} "
                 f"(taux sans risque de {pct(RISK_FREE_NOW())}, moyenne du taux directeur de la Banque du Canada sur la période).")
    lines.append(f"- Diversification : {result['concentration']['n_positions']} positions qui se comportent comme "
                 f"{num(result['concentration']['effective_n'], 1)} positions égales ; ratio de diversification "
                 f"{num(result['diversification_ratio'])} (1,00 = aucune).")

    lines += ["", "#### 3. Quelles limites ?", ""]
    lines += [
        f"- Tous les chiffres décrivent la période du {start} au {end}. Le rendement passé ne garantit pas le rendement futur, et une période sans crise majeure sous-estime le risque.",
        "- L'univers a été choisi en 2026 parmi des titres aujourd'hui importants (biais du survivant) : les chiffres passés sont flatteurs.",
        "- Les corrélations montent en période de stress : la diversification peut diminuer au moment où elle serait utile.",
        "- Non pris en compte : frais, impôts, type de compte (CELI, REER), coûts de transaction, couverture de change, autres comptes et actifs de la personne.",
        "- Le tableau des niveaux de risque est une hypothèse déclarée, pas une norme réglementaire. Ceci est une aide à l'analyse en simulation, pas un conseil financier personnalisé.",
    ]

    lines += ["", "#### 4. Qu'est-ce qui changerait la réponse ?", ""]
    lvl = budget["level"]
    if lvl > 1:
        lines.append(f"- Un horizon plus court ou une capacité plus faible mènerait au niveau {lvl - 1} ({LEVEL_FR[lvl - 1]}) : plafond de "
                     f"volatilité de {pct(RISK_BUDGET[lvl - 1]['max_vol'], 0)}, davantage d'obligations et de liquidités.")
    if lvl < 5:
        lines.append(f"- Un horizon plus long, avec une capacité ET une tolérance plus élevées, permettrait le niveau {lvl + 1} "
                     f"({LEVEL_FR[lvl + 1]}) : plafond de volatilité de {pct(RISK_BUDGET[lvl + 1]['max_vol'], 0)}.")
    lines += [
        "- Un nouveau besoin de liquidité (mise de fonds, imprévu) réserverait d'abord une part en placements très stables.",
        "- Des avoirs ailleurs (régime de retraite, immobilier, actions de l'employeur) changeraient ce qui compte comme une concentration.",
        "- De nouvelles exclusions ou préférences changent l'univers ; des données différentes (historique plus long, période de crise) changeraient les estimations de risque.",
    ]
    return "\n".join(lines)
