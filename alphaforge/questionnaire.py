"""Questionnaire du profil déclaré (spécification : docs/questionnaire.md).

Le questionnaire ne produit que des catégories. Les calculs (capacité, niveau de risque) sont faits
par `to_profile` et `profile.py`, avec des hypothèses écrites en clair.
Réponses spéciales : "unknown" = « Je ne sais pas », "skipped" = question passée.
"""
from __future__ import annotations

import json
from pathlib import Path

from .profile import InvestorProfile

SCENARIOS_FILE = Path("data/processed/risk_scenarios.json")
UNKNOWN = ("unknown", "Je ne sais pas")
HORIZONS = [("lt_1y", "Moins de 1 an", 0.5, 1), ("1_3y", "De 1 à 3 ans", 1, 3), ("3_5y", "De 3 à 5 ans", 3, 5),
            ("5_10y", "De 5 à 10 ans", 5, 10), ("10_15y", "De 10 à 15 ans", 10, 15), ("gt_15y", "Plus de 15 ans", 15, None)]
AMOUNT_MID = {"lt_1k": 500, "1k_10k": 5000, "10k_50k": 30000, "50k_250k": 150000, "gt_250k": 250000}
REACTIONS = [("sell_all", "Je vendrais tout pour éviter d'autres pertes"), ("sell_part", "Je vendrais une partie"),
             ("hold", "Je ne changerais rien et j'attendrais"), ("add", "J'ajouterais de l'argent"), UNKNOWN]

QUESTIONS: dict[str, dict] = {
    "C1": {"level": "compte", "type": "single", "element": "Type de revenu et stabilité",
           "text": "Comment décririez-vous votre principale source de revenu ?",
           "choices": [("permanent", "Emploi permanent, revenu régulier"), ("contract", "Emploi contractuel ou temporaire"),
                       ("self_employed", "Travail autonome ou à la commission"), ("pension", "Retraite ou pension"),
                       ("none_regular", "Études ou pas de revenu régulier"), ("other", "Autre"),
                       ("unknown", "Je ne sais pas ou je préfère ne pas répondre")]},
    "C1a": {"level": "compte", "type": "single", "element": "Stabilité du revenu",
            "text": "Vos revenus sont-ils semblables d'un mois à l'autre ?",
            "choices": [("stable", "Oui, assez semblables"), ("variable", "Ils varient un peu"), ("low", "Ils varient beaucoup"), UNKNOWN]},
    "C2": {"level": "compte", "type": "single", "element": "Marge de manœuvre",
           "text": "En comptant vos obligations (logement, dettes, personnes à charge), pendant combien de temps pourriez-vous "
                   "payer vos dépenses sans revenu et sans toucher à vos placements ?",
           "choices": [("lt_1m", "Moins de 1 mois"), ("1_3m", "De 1 à 3 mois"), ("3_6m", "De 3 à 6 mois"), ("gt_6m", "Plus de 6 mois"), UNKNOWN]},
    "C2a": {"level": "compte", "type": "multi", "element": "Obligations financières",
            "text": "Lesquelles de ces obligations s'appliquent à vous ?",
            "choices": [("dependents", "Personnes à charge"), ("housing", "Loyer ou hypothèque"), ("debt", "Dettes autres que l'hypothèque"),
                        ("family_support", "Soutien financier à un proche"), ("none", "Aucune de ces obligations"),
                        ("unknown", "Je préfère ne pas répondre")]},
    "C3": {"level": "compte", "type": "single", "element": "Expérience en placement",
           "text": "Quelle est votre expérience des placements ?",
           "choices": [("none", "Aucune, je débute"), ("beginner", "J'ai des placements, mais quelqu'un d'autre les choisit"),
                       ("intermediate", "J'ai déjà choisi moi-même des actions ou des fonds"),
                       ("advanced", "J'investis moi-même régulièrement depuis plusieurs années"), UNKNOWN]},
    "C4": {"level": "compte", "type": "multi", "element": "Valeurs et exclusions", "free_text": True,
           "text": "Y a-t-il des types de placements que vous souhaitez éviter pour des raisons personnelles ?",
           "choices": [("fossil_fuels", "Énergies fossiles"), ("weapons", "Armement"), ("sin", "Tabac, alcool ou jeux de hasard"),
                       ("controversies", "Entreprises visées par des controverses environnementales ou sociales importantes"),
                       ("crypto", "Cryptoactifs"), ("other", "Autre (à préciser)"), ("none", "Non, aucune exclusion"), UNKNOWN]},
    "C4a": {"level": "compte", "type": "single", "element": "Poids des critères autres que le rendement",
            "text": "Ces exclusions sont-elles une règle stricte ou une préférence ?",
            "choices": [("strict", "Une règle stricte : à ne jamais inclure"), ("preference", "Une préférence : à éviter si possible"), UNKNOWN]},
    "C6": {"level": "compte", "type": "multi", "element": "Thèmes d'intérêt",
           "text": "Y a-t-il des thèmes qui vous intéressent particulièrement ?",
           "choices": [("tech", "Technologies et intelligence artificielle"), ("crypto", "Cryptoactifs"), ("health", "Santé"),
                       ("finance", "Services financiers"), ("energy", "Énergie"), ("gold", "Or"),
                       ("none", "Aucun thème en particulier"), UNKNOWN]},
    "C5": {"level": "compte", "type": "single", "element": "Préférences de décision",
           "text": "Quel niveau d'explication souhaitez-vous recevoir ?",
           "choices": [("brief", "L'essentiel en quelques lignes"), ("standard", "Les points clés avec les chiffres principaux"),
                       ("detailed", "Le détail complet, avec sources et hypothèses"), UNKNOWN]},
    "P1": {"level": "portefeuille", "type": "single", "element": "Objectif principal", "free_text": True,
           "text": "À quoi cet argent doit-il servir en priorité ?",
           "help": "Préserver : éviter de perdre. Revenu : recevoir des versements réguliers. Équilibrer : croissance modérée avec "
                   "moins de variations. Croissance : viser plus haut à long terme en acceptant des variations plus fortes.",
           "choices": [("preserve", "Préserver le capital"), ("income", "Générer un revenu régulier"),
                       ("balanced", "Équilibrer croissance et stabilité"), ("growth", "Faire croître le capital à long terme"), UNKNOWN]},
    "P2": {"level": "portefeuille", "type": "single", "element": "Horizon de placement",
           "text": "Dans combien de temps prévoyez-vous utiliser une part importante de cet argent ?",
           "choices": [(c, l) for c, l, _, _ in HORIZONS] + [UNKNOWN]},
    "P3": {"level": "portefeuille", "type": "amount", "element": "Mise initiale",
           "text": "Quel montant prévoyez-vous placer au départ dans ce portefeuille ?",
           "choices": [("lt_1k", "Moins de 1 000 $"), ("1k_10k", "De 1 000 $ à 10 000 $"), ("10k_50k", "De 10 000 $ à 50 000 $"),
                       ("50k_250k", "De 50 000 $ à 250 000 $"), ("gt_250k", "Plus de 250 000 $"), ("unknown", "Je préfère ne pas répondre")]},
    "P4": {"level": "portefeuille", "type": "single", "element": "Besoins de retrait",
           "text": "Prévoyez-vous retirer de l'argent de ce portefeuille avant la fin de cette période ?",
           "choices": [("none", "Non, aucun retrait prévu"), ("regular", "Oui, des retraits réguliers"),
                       ("lump_sum", "Oui, un retrait important à une date connue"), ("contingent", "Peut-être, en cas d'imprévu"), UNKNOWN]},
    "P4f": {"level": "portefeuille", "type": "single", "element": "Fréquence des retraits",
            "text": "À quelle fréquence prévoyez-vous ces retraits ?",
            "choices": [("monthly", "Chaque mois"), ("quarterly", "Chaque trimestre"), ("yearly", "Chaque année"), UNKNOWN]},
    "P4a_when": {"level": "portefeuille", "type": "single", "element": "Date du retrait",
                 "text": "Quand prévoyez-vous ce retrait important ?", "choices": [(c, l) for c, l, _, _ in HORIZONS] + [UNKNOWN]},
    "P4a_share": {"level": "portefeuille", "type": "single", "element": "Taille du retrait",
                  "text": "Quelle part du portefeuille ce retrait représente-t-il ?",
                  "choices": [("lt_25", "Moins du quart"), ("about_50", "Environ la moitié"), ("most", "Presque tout"), UNKNOWN]},
    "P5": {"level": "portefeuille", "type": "single", "element": "Tolérance au risque", "scenario": "reference_equilibre", "choices": REACTIONS},
    "P5a": {"level": "portefeuille", "type": "single", "element": "Tolérance au risque, palier supérieur", "scenario": "actions", "choices": REACTIONS},
}
ACCOUNT_ORDER = ["C1", "C1a", "C2", "C2a", "C3", "C4", "C4a", "C6", "C5"]
PORTFOLIO_ORDER = ["P1", "P2", "P3", "P4", "P4f", "P4a_when", "P4a_share", "P5", "P5a"]


def norm(v):
    """Réponse exploitable, ou None si manquante (inconnue, passée, non posée)."""
    if v in (None, "unknown", "skipped"):
        return None
    if isinstance(v, list):
        return None if "unknown" in v else v
    return v


def _exclusions(a) -> list[str]:
    v = norm(a.get("C4"))
    return [x for x in v if x != "none"] if isinstance(v, list) else []


def visible(qid: str, a: dict) -> bool:
    if qid == "C1a":
        return a.get("C1") in ("self_employed", "other")
    if qid == "C2a":
        return a.get("C2") in ("lt_1m", "1_3m", "unknown", "skipped")
    if qid == "C4a":
        return bool(_exclusions(a))
    if qid == "P4f":
        return a.get("P4") == "regular"
    if qid in ("P4a_when", "P4a_share"):
        return a.get("P4") == "lump_sum"
    if qid == "P5a":
        return a.get("P5") in ("hold", "add")
    return True


def next_question(a: dict, order: list[str] | None = None) -> str | None:
    """Prochaine question à poser, ou None si le parcours est terminé."""
    for qid in order or ACCOUNT_ORDER + PORTFOLIO_ORDER:
        if qid not in a and visible(qid, a):
            return qid
    return None


def choices_for(qid: str, a: dict) -> list[tuple[str, str]]:
    ch = QUESTIONS[qid]["choices"]
    if qid == "P4a_when" and norm(a.get("P2")):  # un retrait ne peut pas être prévu après l'horizon déclaré
        codes = [c for c, *_ in HORIZONS]
        keep = set(codes[: codes.index(a["P2"]) + 1]) | {"unknown"}
        ch = [c for c in ch if c[0] in keep]
    return ch


def label(qid: str, code) -> str:
    if code == "skipped":
        return "Question passée"
    if isinstance(code, list):
        return ", ".join(label(qid, c) for c in code) or "—"
    return dict(QUESTIONS[qid]["choices"]).get(code, str(code))


# ---------- mise en situation ----------
MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]


def fr_date(iso: str) -> str:
    y, mth, d = (int(x) for x in iso.split("-"))
    return f"{'1er' if d == 1 else d} {MONTHS[mth - 1]} {y}"


def fr_pct(x: float, d: int = 1) -> str:
    return f"{abs(x) * 100:.{d}f}".replace(".", ",") + " %"


def fr_money(x: float) -> str:
    return f"{x:,.0f}".replace(",", " ") + " $"


def load_scenarios(path: str | Path = SCENARIOS_FILE) -> dict | None:
    path = Path(path)
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def illustration_amount(a: dict) -> tuple[float, bool]:
    """(montant, est_une_hypothèse). Montant exact, sinon milieu de la fourchette, sinon 10 000 $."""
    if a.get("P3_exact"):
        return float(a["P3_exact"]), False
    if norm(a.get("P3")) in AMOUNT_MID:
        return float(AMOUNT_MID[a["P3"]]), True
    return 10000.0, True


def question_text(qid: str, a: dict, scenarios: dict | None = None) -> str:
    q = QUESTIONS[qid]
    if "scenario" not in q:
        return q["text"]
    amount, assumed = illustration_amount(a)
    which = "ce portefeuille" if qid == "P5" else "ce portefeuille, plus exposé aux actions,"
    note = " (montant d'illustration)" if assumed else ""
    s = (scenarios or {}).get("scenarios", {}).get(q["scenario"])
    if not s:  # sans données vérifiées : scénario fictif, annoncé comme tel
        drop = 0.15 if qid == "P5" else 0.25
        return (f"Scénario fictif : imaginez que {which} perde {fr_pct(drop, 0)} en six mois. Sur {fr_money(amount)}{note}, "
                f"cela représente une baisse d'environ {fr_money(amount * drop)}. Que feriez-vous ?")
    intro = "Voici une baisse réelle." if qid == "P5" else "Voici une baisse plus forte, sur la même période."
    back = f" Il a retrouvé sa valeur de départ le {fr_date(s['retour_au_sommet'])}." if s.get("retour_au_sommet") else " Il n'avait pas retrouvé sa valeur de départ à la fin des données."
    return (f"{intro} Un portefeuille composé de {s['label']} a perdu {fr_pct(s['baisse_max'])} entre le {fr_date(s['sommet'])} "
            f"et le {fr_date(s['creux'])}. Sur {fr_money(amount)}{note}, cela représente une baisse d'environ "
            f"{fr_money(amount * abs(s['baisse_max']))}.{back} Si cela arrivait à {which.replace(',', '')}, que feriez-vous ?")


def scenario_caption(scenarios: dict | None) -> str:
    if not scenarios:
        return "Scénario fictif, sans données historiques. Il ne prédit pas les résultats futurs."
    f = scenarios["fenetre"]
    return (f"Source : {scenarios['source']}. Fenêtre du {fr_date(f[0])} au {fr_date(f[1])}, en dollars canadiens. "
            "Une baisse passée ne prédit pas les résultats futurs.")


# ---------- réponses -> profil déclaré ----------
def declared_tolerance(p5, p5a) -> str | None:
    p5, p5a = norm(p5), norm(p5a)
    if p5 == "sell_all":
        return "low"
    if p5 == "sell_part":
        return "low_to_moderate"
    if p5 == "hold":
        return "moderate_to_high" if p5a in ("hold", "add") else "moderate"
    if p5 == "add":
        return "high" if p5a in ("hold", "add") else "moderate"
    return None


TOLERANCE_LABELS = {"low": "faible", "low_to_moderate": "faible à modérée", "moderate": "modérée",
                    "moderate_to_high": "modérée à élevée", "high": "élevée", None: "non déterminée"}

CONTRADICTIONS = {
    "tolerance_vs_horizon": "Vous accepteriez une forte baisse, mais vous prévoyez utiliser cet argent bientôt. Lequel décrit le mieux ce portefeuille ?",
    "tolerance_vs_objective": "Vous souhaitez préserver le capital, mais vous resteriez investi pendant une forte baisse. Souhaitez-vous revoir l'objectif ou confirmer ?",
    "objective_vs_reaction": "Vous visez la croissance à long terme, mais vous vendriez tout après cette baisse. Souhaitez-vous revoir l'objectif ?",
    "cushion_vs_withdrawals": "Votre coussin couvre moins d'un mois. Se peut-il que vous deviez retirer de l'argent en cas d'imprévu ?",
    "income_vs_withdrawals": "Vous souhaitez un revenu régulier, mais aucun retrait n'est prévu. Le revenu doit-il être retiré ou réinvesti ?",
    "withdrawal_vs_horizon": "Presque tout serait retiré avant la fin de la période. L'horizon de ce portefeuille est-il plutôt la date du retrait ?",
    "staircase_inconsistent": "Vous ajouteriez de l'argent après la première baisse, mais vous vendriez après la seconde. Où se situe votre limite ?",
}


def find_contradictions(a: dict) -> list[dict]:
    tol = declared_tolerance(a.get("P5"), a.get("P5a"))
    high = tol in ("moderate_to_high", "high")
    codes = [c for c, _, *_ in HORIZONS]
    hz, obj, p4 = norm(a.get("P2")), norm(a.get("P1")), norm(a.get("P4"))
    found = []
    if high and hz in ("lt_1y", "1_3y"):
        found.append("tolerance_vs_horizon")
    if high and obj == "preserve":
        found.append("tolerance_vs_objective")
    if obj == "growth" and a.get("P5") == "sell_all":
        found.append("objective_vs_reaction")
    if a.get("C2") == "lt_1m" and p4 == "none":
        found.append("cushion_vs_withdrawals")
    if obj == "income" and p4 == "none":
        found.append("income_vs_withdrawals")
    when = norm(a.get("P4a_when"))
    if a.get("P4a_share") == "most" and hz and when and codes.index(when) < codes.index(hz):
        found.append("withdrawal_vs_horizon")
    if a.get("P5") == "add" and a.get("P5a") in ("sell_all", "sell_part"):
        found.append("staircase_inconsistent")
    return [{"code": c, "question": CONTRADICTIONS[c], "status": "to_clarify"} for c in found]


FIELD_OF = {"C1": "account.income_type", "C1a": "account.income_stability", "C2": "account.emergency_cushion",
            "C2a": "account.obligations", "C3": "account.investment_experience", "C4": "account.values_preferences.exclusions",
            "C4a": "account.values_preferences.strictness", "C6": "account.values_preferences.interests", "C5": "account.explanation_level", "P1": "portfolio.objective",
            "P2": "portfolio.horizon", "P3": "portfolio.initial_amount", "P4": "portfolio.liquidity_needs",
            "P4f": "portfolio.liquidity_needs.frequency", "P4a_when": "portfolio.liquidity_needs.when",
            "P4a_share": "portfolio.liquidity_needs.share", "P5": "portfolio.risk_tolerance.reaction_reference",
            "P5a": "portfolio.risk_tolerance.reaction_deeper"}


def build_declared(a: dict, portfolio_id: str = "pf_001", scenarios: dict | None = None) -> dict:
    """Profil déclaré structuré : faits déclarés, réponses manquantes, questions non posées, hypothèses, contradictions."""
    stab = {"permanent": "stable", "pension": "stable", "contract": "variable", "none_regular": "low"}.get(a.get("C1")) or norm(a.get("C1a"))
    hz = next(({"category": c, "min_years": lo, "max_years": hi} for c, _, lo, hi in HORIZONS if c == norm(a.get("P2"))), None)
    amount, assumed = illustration_amount(a)
    excl = norm(a.get("C4"))
    assumptions = []
    if assumed:
        assumptions.append({"field": "portfolio.risk_tolerance.illustration_amount", "value": amount,
                            "reason": "milieu de la fourchette déclarée" if norm(a.get("P3")) else "P3 non répondue"})
    level = norm(a.get("C5"))
    if not level:
        assumptions.append({"field": "account.explanation_level", "value": "standard", "reason": "valeur par défaut"})
    strict = norm(a.get("C4a"))
    if _exclusions(a) and not strict:
        assumptions.append({"field": "account.values_preferences.strictness", "value": "preference", "reason": "non précisé : traité comme une préférence"})
    missing = [{"field": FIELD_OF[q], "question": q, "reason": "skipped" if a[q] == "skipped" else "dont_know"}
               for q in ACCOUNT_ORDER + PORTFOLIO_ORDER if q in a and norm(a[q]) is None and not (q == "P3" and a.get("P3_exact"))]
    not_asked = [{"field": FIELD_OF[q], "question": q, "reason": "condition_not_met"}
                 for q in ("C2a", "C4a", "P5a") if not visible(q, a)]
    essential = [norm(a.get(q)) for q in ("P1", "P2", "P4", "P5")]
    return {
        "schema_version": "1.0", "profile_type": "declared",
        "account": {
            "income_type": norm(a.get("C1")), "income_stability": stab, "emergency_cushion": norm(a.get("C2")),
            "obligations": norm(a.get("C2a")) if visible("C2a", a) else None, "investment_experience": norm(a.get("C3")),
            "values_preferences": {"exclusions": [] if excl == ["none"] else ([x for x in excl if x != "none"] if excl else None),
                                   "other_text": a.get("C4_text") or None, "strictness": strict,
                                   "interests": [x for x in (norm(a.get("C6")) or []) if x != "none"]},
            "explanation_level": level or "standard",
        },
        "portfolio": {
            "portfolio_id": portfolio_id, "label": a.get("P1_text") or None, "objective": norm(a.get("P1")), "horizon": hz,
            "initial_amount": {"range": norm(a.get("P3")), "exact": a.get("P3_exact") or None, "currency": "CAD"},
            "liquidity_needs": {"type": norm(a.get("P4")), "frequency": norm(a.get("P4f")), "when": norm(a.get("P4a_when")), "share": norm(a.get("P4a_share"))},
            "risk_tolerance": {
                "reaction_reference": norm(a.get("P5")), "reaction_deeper": norm(a.get("P5a")),
                "declared": declared_tolerance(a.get("P5"), a.get("P5a")),
                "scenario_basis": "historical" if scenarios else "fictional",
                "scenario_window": scenarios["fenetre"] if scenarios else None,
                "illustration_amount": {"value": amount, "currency": "CAD", "assumed": assumed},
            },
        },
        "missing": missing, "not_asked": not_asked, "assumptions": assumptions,
        "contradictions": find_contradictions(a),
        "status": "complete" if all(essential) else "incomplete",
    }


# ---------- profil déclaré -> paramètres du moteur (c'est ici que le code calcule) ----------
TOL_LEVEL = {"low": 1, "low_to_moderate": 2, "moderate": 3, "moderate_to_high": 4, "high": 5}
# Hypothèses de capacité : chaque facteur plafonne la capacité ; la plus basse l'emporte.
CAP_INCOME = {"stable": 5, "variable": 4, "low": 2, None: 3}
CAP_CUSHION = {"gt_6m": 5, "3_6m": 4, "1_3m": 3, "lt_1m": 1, None: 3}
CAP_LIQUIDITY = {"none": 5, "contingent": 4, "regular": 3, "lump_sum": 3, None: 3}
EXCLUSION_TAGS = {"fossil_fuels": ["Energy"], "crypto": ["crypto"]}  # ce que l'univers de départ permet de filtrer
INTEREST_TAGS = {"tech": ["Information Technology"], "crypto": ["crypto"], "health": ["Health Care"], "finance": ["Financials"],
                 "energy": ["Energy"], "gold": ["Gold"]}


def to_profile(declared: dict, name: str = "Investisseur") -> tuple[InvestorProfile, list[str]]:
    """Traduit le profil déclaré en paramètres du moteur. Retourne aussi les notes à afficher (hypothèses, limites)."""
    acc, pf, notes = declared["account"], declared["portfolio"], []
    tol = pf["risk_tolerance"]["declared"]
    if tol is None:
        notes.append("Tolérance non déterminée : niveau 2 sur 5 utilisé par prudence (hypothèse).")
    liq = pf["liquidity_needs"]
    caps = {
        f"stabilité du revenu ({acc['income_stability'] or 'inconnue'})": CAP_INCOME[acc["income_stability"]],
        f"coussin de sécurité ({acc['emergency_cushion'] or 'inconnu'})": CAP_CUSHION[acc["emergency_cushion"]],
        f"besoins de retrait ({liq['type'] or 'inconnus'})": 2 if liq["share"] == "most" else CAP_LIQUIDITY[liq["type"]],
    }
    if acc["obligations"] and {"dependents", "debt"} & set(acc["obligations"]):
        caps["personnes à charge ou dettes avec un coussin limité"] = 2
    capacity = min(caps.values())
    binding = [k for k, v in caps.items() if v == capacity]
    notes.append(f"Capacité à prendre du risque : {capacity} sur 5, limitée par {', '.join(binding)}.")
    hz = pf["horizon"]
    if hz is None:
        notes.append("Horizon inconnu : 3 ans utilisés par prudence (hypothèse).")
    cash = 0.0
    if liq["type"] == "lump_sum" and liq["when"] in ("lt_1y", "1_3y"):
        cash = {"lt_25": 0.2, "about_50": 0.5, "most": 0.9}.get(liq["share"], 0.2)
    elif liq["type"] in ("regular", "contingent"):
        cash = 0.05
    if cash:
        notes.append(f"Part gardée en placements très stables pour les retraits : {cash:.0%} (hypothèse).")
    excl = acc["values_preferences"]["exclusions"] or []
    tags = sorted({t for e in excl for t in EXCLUSION_TAGS.get(e, [])})
    esg = "controversies" in excl
    if esg:
        if acc["values_preferences"]["strictness"] == "strict":
            notes.append("Controverses environnementales ou sociales, règle stricte : les données ne contiennent aucune preuve par société (donnée "
                         "insuffisante). Les sociétés individuelles sans preuve documentée sont donc écartées ; le fonds dont le filtre ESG est documenté est "
                         "privilégié, et les fonds d'actions non filtrés restent possibles mais défavorisés, car ils détiennent des sociétés non "
                         "vérifiées. Un titre écarté n'est pas déclaré controversé : la preuve manque, c'est tout.")
        else:
            notes.append("Controverses environnementales ou sociales, préférence : les données ne contiennent aucune preuve par société (donnée "
                         "insuffisante). Le fonds dont le filtre ESG est documenté est privilégié et les actifs sans preuve sont défavorisés, sans être interdits.")
    for e in excl:
        if e not in EXCLUSION_TAGS and e != "controversies":
            notes.append(f"Exclusion « {label('C4', e)} » : aucun actif de l'univers n'est classé dans cette catégorie ; non vérifiable avec ces données.")
    strict = acc["values_preferences"]["strictness"] == "strict"
    interests = sorted({t for i in acc["values_preferences"].get("interests") or [] for t in INTEREST_TAGS.get(i, [])})
    profile = InvestorProfile(
        name=name, objective=pf["objective"] or "balanced", horizon_years=hz["min_years"] if hz else 3,
        risk_tolerance=TOL_LEVEL.get(tol, 2), risk_capacity=capacity, liquidity_need=cash,
        excluded=(tags + (["esg_unverified"] if esg else [])) if strict else [],
        avoided=(["esg_unscreened_fund"] if esg else []) if strict else tags + (["esg_unverified", "esg_unscreened_fund"] if esg else []),
        preferred=(["esg_screened"] if esg else []) + interests,
    )
    if interests:
        notes.append("Thèmes d'intérêt pris en compte comme préférence souple : " + ", ".join(label("C6", i) for i in acc["values_preferences"]["interests"] if i in INTEREST_TAGS)
                     + ". Ils orientent les choix à l'intérieur des limites de risque et des plafonds, sans les déplacer.")
    clash = sorted(set(interests) & set(tags)) if strict else []
    if clash:
        notes.append("Un thème d'intérêt est aussi dans vos exclusions strictes : l'exclusion l'emporte.")
    if pf["objective"] is None:
        notes.append("Objectif inconnu : « équilibrer » utilisé (hypothèse).")
    return profile, notes


# ---------- personas de l'énoncé ----------
# "assumed" : réponses absentes de l'énoncé, inventées pour la démonstration.
PERSONAS = {
    "Amira": {"answers": {"C1": "permanent", "C2": "3_6m", "C3": "intermediate", "C4": ["none"], "C6": ["tech", "crypto"], "C5": "standard",
                          "P1": "growth", "P2": "gt_15y", "P3": "skipped", "P4": "none", "P5": "add", "P5a": "hold"},
              "assumed": ["C1", "C2", "C4", "C5", "P4"], "summary": "26 ans, ingénieure logicielle, risque élevé, 15 ans et plus"},
    "Mateo": {"answers": {"C1": "permanent", "C2": "3_6m", "C3": "intermediate", "C4": ["controversies", "crypto"], "C4a": "strict", "C6": ["none"], "C5": "standard",
                          "P1": "balanced", "P2": "5_10y", "P3": "skipped", "P4": "contingent", "P5": "hold", "P5a": "sell_part"},
              "assumed": ["C1", "C2", "C4a", "C5", "P4"], "summary": "41 ans, deux enfants, risque modéré, 8 à 12 ans, ESG"},
    "Robert": {"answers": {"C1": "permanent", "C2": "gt_6m", "C3": "advanced", "C4": ["crypto"], "C4a": "preference", "C6": ["none"], "C5": "detailed",
                           "P1": "preserve", "P2": "3_5y", "P3": "skipped", "P4": "contingent", "P5": "hold", "P5a": "sell_part"},
               "assumed": ["C1", "C2", "C4a", "C5", "P4"], "summary": "59 ans, retraite proche, risque faible à modéré, 3 à 5 ans"},
}
