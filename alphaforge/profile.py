"""Investor profile -> explicit, auditable risk budget.

Follows the workshop's five dimensions: objective, horizon, risk (tolerance AND capacity),
constraints, preferences. Constraints set the boundaries; preferences guide choices inside them.
Every number below is a stated assumption that can be shown to the judges and tuned.
"""
from __future__ import annotations

from dataclasses import dataclass, field

OBJECTIVES = ("emergency", "preserve", "project", "income", "balanced", "retirement", "legacy", "growth")

# Assumption table: effective risk level (1-5) -> portfolio volatility ceiling and max loss we plan around.
RISK_BUDGET = {
    1: {"label": "very low", "max_vol": 0.04, "max_growth_assets": 0.20},
    2: {"label": "low", "max_vol": 0.07, "max_growth_assets": 0.40},
    3: {"label": "medium", "max_vol": 0.10, "max_growth_assets": 0.60},
    4: {"label": "high", "max_vol": 0.14, "max_growth_assets": 0.85},
    5: {"label": "very high", "max_vol": 0.18, "max_growth_assets": 1.00},
}


LEVEL_FR = {1: "très faible", 2: "faible", 3: "modéré", 4: "élevé", 5: "très élevé"}
OBJECTIVE_FR = {"preserve": "préserver le capital", "income": "générer un revenu", "balanced": "équilibrer croissance et stabilité",
                "growth": "faire croître le capital", "emergency": "fonds d'urgence", "project": "projet", "retirement": "retraite",
                "legacy": "transmission"}


@dataclass
class InvestorProfile:
    name: str = "Investor"
    objective: str = "retirement"
    horizon_years: float = 15
    risk_tolerance: int = 3  # willingness, 1-5
    risk_capacity: int = 3  # financial ability to absorb a loss, 1-5
    liquidity_need: float = 0.0  # share of the portfolio that must stay readily available
    base_currency: str = "CAD"
    max_single_weight: float = 0.35
    excluded: list[str] = field(default_factory=list)  # symbols, sectors or tags to exclude (hard)
    preferred: list[str] = field(default_factory=list)  # tags to tilt toward (soft)
    avoided: list[str] = field(default_factory=list)  # tags to tilt away from (soft): "avoid if possible"
    existing_holdings: dict[str, float] = field(default_factory=dict)
    notes: str = ""

    def horizon_cap(self) -> int:
        """Short horizons cap risk no matter how brave the investor feels (horizon != tolerance)."""
        h = self.horizon_years
        return 1 if h < 1 else 2 if h < 3 else 3 if h < 5 else 4 if h < 10 else 5

    def objective_cap(self) -> int:
        return {"emergency": 1, "preserve": 2, "project": 3, "income": 4, "balanced": 4}.get(self.objective, 5)

    def effective_risk(self) -> int:
        """The binding (lowest) of tolerance, capacity, horizon and objective."""
        return max(1, min(self.risk_tolerance, self.risk_capacity, self.horizon_cap(), self.objective_cap()))

    def budget(self, level: int | None = None) -> dict:
        """Limites du niveau de risque retenu (ou d'un niveau imposé, pour comparer des options)."""
        lvl = level or self.effective_risk()
        b = dict(RISK_BUDGET[lvl])
        b["level"] = lvl
        b["min_cash"] = self.liquidity_need
        b["max_single_weight"] = self.max_single_weight
        return b

    def reasoning(self) -> list[str]:
        """Comment le niveau de risque a été obtenu, en clair."""
        caps = {
            f"tolérance déclarée (volonté) : {self.risk_tolerance} sur 5": self.risk_tolerance,
            f"capacité à absorber une perte : {self.risk_capacity} sur 5": self.risk_capacity,
            f"horizon d'environ {self.horizon_years:g} ans : plafond de {self.horizon_cap()} sur 5": self.horizon_cap(),
            f"objectif « {OBJECTIVE_FR.get(self.objective, self.objective)} » : plafond de {self.objective_cap()} sur 5": self.objective_cap(),
        }
        lvl = self.effective_risk()
        out = [f"Niveau de risque retenu : {lvl} sur 5 ({LEVEL_FR[lvl]}). C'est le plus restrictif de :"]
        out += [f"  - {k}{'  ← limite active' if v == lvl else ''}" for k, v in caps.items()]
        if self.risk_tolerance > self.risk_capacity:
            out.append("La tolérance dépasse la capacité : accepter une baisse ne veut pas dire pouvoir en assumer les conséquences. La capacité l'emporte.")
        if self.liquidity_need:
            out.append(f"Besoin de liquidité : au moins {self.liquidity_need:.0%} en placements très stables.")
        if self.excluded:
            out.append(f"Exclusions strictes : {', '.join(self.excluded)}.")
        if self.avoided:
            out.append(f"À éviter si possible (critère souple) : {', '.join(self.avoided)}.")
        if self.preferred:
            out.append(f"Préférences (critère souple, ne passe jamais avant une contrainte) : {', '.join(self.preferred)}.")
        return out
