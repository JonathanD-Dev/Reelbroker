"""Étape 3 — Apprendre : profil déclaré et profil révélé, côte à côte.

Le profil déclaré vient du questionnaire. Le profil révélé vient des décisions prises dans l'application.
Règles, toutes vérifiées par les tests :

- Les décisions ne font bouger QUE la tolérance révélée. L'objectif, l'horizon et la capacité restent ceux déclarés.
- Les deux profils ne sont jamais fusionnés en silence. Un écart est montré, et c'est la personne qui décide de mettre
  à jour sa tolérance déclarée.
- Même mise à jour, la tolérance reste plafonnée par la capacité, l'horizon et l'objectif : une suite de décisions
  risquées ne « débloque » jamais plus de risque que la situation ne le permet.
- En dessous de MIN_DECISIONS décisions, on dit qu'on ne peut rien conclure.

Chaque décision porte un « signal » : le niveau de risque (1 à 5) qu'elle révèle, ou None si elle est simplement
conforme au profil (elle compte alors comme une confirmation de la tolérance déclarée).
"""
from __future__ import annotations

from dataclasses import replace
from datetime import date
from statistics import median

import pandas as pd

from .profile import LEVEL_FR, RISK_BUDGET, InvestorProfile

MIN_DECISIONS = 3  # hypothèse : en dessous, pas de conclusion
WINDOW = 5  # hypothèse : on regarde les cinq dernières décisions
CHOICES_IDEA = {"keep": "Idée gardée telle quelle", "adjust": "Idée ramenée dans les limites", "drop": "Idée abandonnée"}
REACTIONS = {"sell_all": "Tout vendre", "sell_part": "Vendre une partie", "hold": "Ne rien changer", "add": "Ajouter de l'argent"}


def level_for_vol(vol: float) -> int:
    """Plus petit niveau de risque dont le plafond de volatilité couvre cette volatilité (5 au-delà)."""
    for lvl in sorted(RISK_BUDGET):
        if vol <= RISK_BUDGET[lvl]["max_vol"] + 2e-3:
            return lvl
    return 5


def _entry(kind: str, label: str, signal: int | None, note: str, when: str | None = None, fictional: bool = False) -> dict:
    return {"date": when or str(date.today()), "type": kind, "decision": label, "signal": signal, "lecture": note, "fictif": fictional}


def idea_decision(check: dict, choice: str, **kw) -> dict:
    """Décision prise après la vérification d'une idée (`decide.check_intention`)."""
    what = f"{check['weight'] * 100:.0f} % dans {check['name']}"
    if choice == "keep" and check["verdict"] != "compatible":
        implied = max(level_for_vol(check["after"]["ex_ante_vol"]), min(5, check["limits"]["level"] + 1))
        return _entry("idea", f"{CHOICES_IDEA[choice]} : {what}", implied,
                      f"Gardée malgré un verdict « {check['verdict_label'].lower()} » : le portefeuille obtenu correspond à un niveau {implied} sur 5.", **kw)
    note = {"keep": "Idée compatible avec le profil : confirme la tolérance déclarée.",
            "adjust": "Ramenée dans les limites après la vérification : confirme la tolérance déclarée.",
            "drop": "Abandonnée après la vérification : confirme la tolérance déclarée."}[choice]
    return _entry("idea", f"{CHOICES_IDEA[choice]} : {what}", None, note, **kw)


def option_decision(option: dict, declared_tolerance: int, **kw) -> dict:
    """Choix d'un des scénarios comparés (`decide.options`)."""
    lvl = option["level"]
    if option["key"] == "beyond":
        return _entry("option", f"Scénario retenu : {option['title']}", lvl, f"Scénario hors profil, de niveau {lvl} sur 5.", **kw)
    if option["key"] == "prudent" and lvl < declared_tolerance:
        return _entry("option", f"Scénario retenu : {option['title']}", lvl, f"Scénario plus prudent que le profil, de niveau {lvl} sur 5.", **kw)
    return _entry("option", f"Scénario retenu : {option['title']}", None, "Scénario dans le profil : confirme la tolérance déclarée.", **kw)


def episode_decision(episode: dict, reaction: str, scenario_level: int, declared_tolerance: int, **kw) -> dict:
    """Réaction devant un épisode de baisse réel du scénario (`worst_episodes`)."""
    label = f"{REACTIONS[reaction]} devant une baisse de {abs(episode['drop']) * 100:.1f} %".replace(".", ",")
    if reaction == "sell_all":
        return _entry("episode", label, 1, "Vendre au creux transforme la baisse en perte : signal de tolérance très faible.", **kw)
    if reaction == "sell_part":
        lvl = max(1, min(scenario_level, declared_tolerance) - 1)
        return _entry("episode", label, lvl, f"Réduction du risque pendant la baisse : signal de niveau {lvl} sur 5.", **kw)
    if reaction == "add":
        lvl = min(5, scenario_level + 1)
        return _entry("episode", label, lvl, f"Ajout pendant la baisse : signal de niveau {lvl} sur 5.", **kw)
    return _entry("episode", label, None, "Baisse traversée sans changement : confirme la tolérance déclarée.", **kw)


def worst_episodes(value: pd.Series, k: int = 2, min_drop: float = 0.02) -> list[dict]:
    """Les k pires baisses, sans chevauchement, d'une série de valeur de portefeuille (sommet, creux, retour)."""
    v = value.dropna().copy()
    out = []
    free = pd.Series(True, index=v.index)
    for _ in range(k):
        dd = (v / v.cummax() - 1).where(free)
        if dd.dropna().empty or dd.min() > -min_drop:
            break
        trough = dd.idxmin()
        peak = v[:trough].idxmax()
        after = v[trough:]
        rec = after[after >= v[peak]]
        end = rec.index[0] if len(rec) else v.index[-1]
        out.append({"drop": float(dd.min()), "peak": str(peak.date()), "trough": str(trough.date()),
                    "recovered": str(rec.index[0].date()) if len(rec) else None, "days_down": int((trough - peak).days)})
        free[peak:end] = False
    return out


def revealed(journal: list[dict], declared_tolerance: int) -> dict:
    """Tolérance révélée : médiane des dernières décisions, les décisions conformes comptant pour la tolérance déclarée."""
    recent = journal[-WINDOW:]
    if len(journal) < MIN_DECISIONS:
        return {"established": False, "level": None, "n": len(journal), "needed": MIN_DECISIONS, "informative": sum(d["signal"] is not None for d in recent)}
    values = [d["signal"] if d["signal"] is not None else declared_tolerance for d in recent]
    level = int(median(values))  # en cas d'égalité, on retient le niveau le plus prudent
    signals = [d["signal"] for d in recent if d["signal"] is not None]
    return {"established": True, "level": level, "contradictory": bool(signals) and max(signals) - min(signals) >= 3, "n": len(journal), "needed": MIN_DECISIONS, "informative": sum(d["signal"] is not None for d in recent),
            "values": values}


def with_tolerance(profile: InvestorProfile, tolerance: int) -> InvestorProfile:
    """Copie du profil avec une autre tolérance. Rien d'autre ne change : ni objectif, ni horizon, ni capacité."""
    return replace(profile, risk_tolerance=int(max(1, min(5, tolerance))))


def compare(profile: InvestorProfile, journal: list[dict]) -> dict:
    """Écart entre déclaré et révélé, et ce qu'une mise à jour changerait réellement."""
    declared, retained = profile.risk_tolerance, profile.effective_risk()
    rev = revealed(journal, declared)
    out = {"declared": declared, "retained_level": retained, "revealed": rev, "status": "insufficient", "gap": None,
           "messages": [], "update_to": None, "retained_if_updated": None,
           "fixed": {"objectif": profile.objective, "horizon_ans_minimum": profile.horizon_years, "capacite_sur_5": profile.risk_capacity}}
    if not rev["established"]:
        out["messages"].append(f"{rev['n']} décision(s) enregistrée(s) sur les {rev['needed']} nécessaires : pas assez pour conclure quoi que ce soit.")
        return out
    lvl = rev["level"]
    out["gap"] = lvl - declared
    if rev["contradictory"]:
        out["messages"].append("Vos décisions récentes vont dans des sens opposés (certaines très prudentes, d'autres très risquées) : "
                               "la tolérance révélée ci-dessous est peu fiable.")
    if lvl > declared:
        out["status"] = "riskier"
        out["messages"].append(f"Vos décisions récentes correspondent à une tolérance de {lvl} sur 5 ({LEVEL_FR[lvl]}), plus élevée que celle que vous "
                               f"avez déclarée ({declared} sur 5).")
    elif lvl < declared:
        out["status"] = "more_cautious"
        out["messages"].append(f"Vos décisions récentes correspondent à une tolérance de {lvl} sur 5 ({LEVEL_FR[lvl]}), plus prudente que celle que vous "
                               f"avez déclarée ({declared} sur 5).")
    else:
        out["status"] = "aligned"
        out["messages"].append(f"Vos décisions récentes concordent avec la tolérance que vous avez déclarée ({declared} sur 5).")
    if lvl > retained:
        out["status"] = "exceeds_limits"  # l'alerte qui compte : les décisions dépassent ce que la situation permet
        caps ={"votre capacité à absorber une perte": profile.risk_capacity, "votre horizon": profile.horizon_cap(), "votre objectif": profile.objective_cap()}
        binding = [k for k, v in caps.items() if v == min(caps.values()) and v < lvl]
        out["messages"].append(f"Elles prennent aussi plus de risque que le niveau retenu pour ce portefeuille ({retained} sur 5), limité par "
                               f"{' et '.join(binding) or 'votre tolérance déclarée'}. Vos décisions ne changent pas ces limites.")
    if lvl != declared:
        after = with_tolerance(profile, lvl).effective_risk()
        out["update_to"], out["retained_if_updated"] = lvl, after
        if after == retained:
            out["messages"].append(f"Mettre à jour votre tolérance déclarée à {lvl} sur 5 ne changerait pas le niveau retenu, qui resterait à {retained} sur 5.")
        else:
            out["messages"].append(f"Mettre à jour votre tolérance déclarée à {lvl} sur 5 ferait passer le niveau retenu de {retained} à {after} sur 5.")
    return out
