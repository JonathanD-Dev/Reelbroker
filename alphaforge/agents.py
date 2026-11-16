"""Agents sur Amazon Bedrock (Strands Agents) pour l'étape « Vérifier une idée ».

Trois agents et un contrôle, chacun avec une raison d'exister :

1. Interprète    — transforme la phrase de l'utilisateur en intention structurée, ou pose une question.
                   Un modèle de langage est nécessaire : le texte libre ne se lit pas avec des règles.
2. Analyste      — choisit quels calculs lancer pour cette intention et ce profil, et les lance.
                   Il n'a que des outils-calculatrices : il ne produit aucun chiffre lui-même.
3. Explicateur   — rédige l'explication à partir des SEULS résultats d'outils enregistrés. Sans outil,
                   sans accès aux données : il ne peut citer que ce qui a été calculé.
4. Gouvernance   — du code, pas un modèle : vérifie que chaque chiffre du texte existe dans la trace
                   des outils et qu'aucune formule de conseil n'apparaît. Sinon, une reprise, puis repli
                   sur le texte déterministe.

AWS : Amazon Bedrock fournit les modèles ; Strands Agents orchestre la boucle d'outils ; un garde-fou
Bedrock (Guardrails) s'ajoute avec BEDROCK_GUARDRAIL_ID. Sans identifiants AWS, `run` passe en mode
hors ligne (mêmes calculs, sans rédaction par modèle) et l'indique.

Configuration (fichier .env, voir .env.example) :
    AWS_BEARER_TOKEN_BEDROCK   clé d'API Bedrock du compte d'équipe
    BEDROCK_USE_IAM_ROLE       true sur une instance EC2 : le rôle IAM de l'instance remplace la clé (deploy/ec2)
    AWS_REGION                 région Bedrock (ex. ca-central-1 ou us-west-2)
    BEDROCK_MODEL_ID           facultatif ; sinon le modèle par défaut de Strands
    BEDROCK_GUARDRAIL_ID / BEDROCK_GUARDRAIL_VERSION   facultatifs
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Literal

import pandas as pd
from pydantic import BaseModel, Field

from . import decide
from . import metrics as m
from .profile import LEVEL_FR, OBJECTIVE_FR, InvestorProfile


# ---------- configuration ----------
def load_env(path: str | Path = ".env") -> None:
    """Charge un fichier .env simple (CLE=valeur) sans écraser l'environnement existant."""
    p = Path(path)
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_CREDENTIAL_VARS = ("AWS_BEARER_TOKEN_BEDROCK", "AWS_ACCESS_KEY_ID", "AWS_PROFILE", "AWS_WEB_IDENTITY_TOKEN_FILE",
                    # rôle de tâche ECS / Fargate : identifiants servis par le conteneur
                    "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI", "AWS_CONTAINER_CREDENTIALS_FULL_URI")


def bedrock_available() -> bool:
    """Des identifiants AWS sont configurés. Le rôle d'une instance EC2 ne laisse aucune variable d'environnement :
    BEDROCK_USE_IAM_ROLE=true le déclare (déploiement EC2 ; boto3 lit alors le rôle sur le service de métadonnées)."""
    if any(os.environ.get(k) for k in _CREDENTIAL_VARS):
        return True
    return os.environ.get("BEDROCK_USE_IAM_ROLE", "").strip().lower() in ("1", "true", "yes", "oui")


def aws_summary() -> dict:
    """Ce qui est configuré, sans jamais exposer de secret."""
    return {"connecte": bedrock_available(), "region": os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "par défaut de Strands",
            "modele": os.environ.get("BEDROCK_MODEL_ID") or "par défaut de Strands", "garde_fou": bool(os.environ.get("BEDROCK_GUARDRAIL_ID"))}


def make_model():
    from strands.models import BedrockModel

    cfg: dict = {}
    if os.environ.get("BEDROCK_MODEL_ID"):
        cfg["model_id"] = os.environ["BEDROCK_MODEL_ID"]
    if os.environ.get("BEDROCK_GUARDRAIL_ID"):
        cfg.update(guardrail_id=os.environ["BEDROCK_GUARDRAIL_ID"], guardrail_version=os.environ.get("BEDROCK_GUARDRAIL_VERSION", "DRAFT"), guardrail_trace="enabled")
    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION")
    return BedrockModel(**({"region_name": region} if region else {}), **cfg)


# ---------- contexte et outils-calculatrices ----------
class Context:
    """Tout ce dont les outils ont besoin, plus la trace des appels (le reçu de décision)."""

    def __init__(self, prices: pd.DataFrame, universe: pd.DataFrame, meta: dict, profile: InvestorProfile, base_weights: dict[str, float],
                 amount: float = 10000.0, options: list[dict] | None = None):
        self.prices, self.universe, self.meta, self.profile = prices, universe, meta, profile
        self.base_weights, self.amount, self.options = base_weights, amount, options or []
        self.window = [str(prices.index[0].date()), str(prices.index[-1].date())]
        self.trace: list[dict] = []
        self.last_check: dict | None = None

    def record(self, outil: str, entrees: dict, sortie: dict) -> str:
        self.trace.append({"outil": outil, "entrees": entrees, "sortie": sortie, "fenetre": self.window})
        return json.dumps(sortie, ensure_ascii=False, default=str)

    # Les calculs eux-mêmes : appelés par les outils Strands et par le mode hors ligne.
    def profil(self) -> str:
        p, b = self.profile, self.profile.budget()
        return self.record("profil", {}, {
            "objectif": OBJECTIVE_FR.get(p.objective, p.objective), "horizon_ans_minimum": p.horizon_years,
            "tolerance_declaree_sur_5": p.risk_tolerance, "capacite_calculee_sur_5": p.risk_capacity,
            "niveau_de_risque_retenu_sur_5": b["level"], "niveau_libelle": LEVEL_FR[b["level"]],
            "plafond_volatilite": b["max_vol"], "plafond_actifs_de_croissance": b["max_growth_assets"],
            "exclusions_strictes": p.excluded, "a_eviter_si_possible": p.avoided, "montant_illustration_cad": self.amount,
            "raisonnement": p.reasoning()})

    def lister_titres(self) -> str:
        u = self.universe
        return self.record("lister_titres", {}, {"titres": [{"ticker": t, "nom": u.loc[t, "name"], "categorie": u.loc[t, "sector"]} for t in u.index]})

    def verifier_idee(self, ticker: str, part_pct: float) -> str:
        ticker = ticker.strip().upper()
        if ticker not in self.prices.columns:
            return self.record("verifier_idee", {"ticker": ticker, "part_pct": part_pct},
                               {"erreur": f"{ticker} n'est pas dans les données disponibles ; aucune vérification possible."})
        r = decide.check_intention(self.prices, self.profile, self.base_weights, ticker, part_pct / 100, self.meta, self.universe)
        self.last_check = r
        b, a = r["before"], r["after"]
        return self.record("verifier_idee", {"ticker": ticker, "part_pct": part_pct}, {
            "titre": r["name"], "verdict": r["verdict_label"],
            "verifications": [{"statut": c["status"], "constat": c["message"]} for c in r["checks"]],
            "part_maximale_dans_les_limites_pct": round(r["max_weight_within_profile"] * 100),
            "titre_seul": {"volatilite": r["asset"]["vol"], "pire_baisse": r["asset"]["max_drawdown"], "pires_12_mois": r["asset"]["worst_1y"],
                           "rendement_annuel_passe": r["asset"]["cagr"], "annees_sous_le_sommet": round(r["asset"]["underwater"]["days"] / 365.25, 1)},
            "portefeuille_avant": {"volatilite_estimee": b["ex_ante_vol"], "pire_baisse": b["max_drawdown"],
                                   "pire_baisse_en_dollars": round(self.amount * abs(b["max_drawdown"]))},
            "portefeuille_apres": {"volatilite_estimee": a["ex_ante_vol"], "pire_baisse": a["max_drawdown"],
                                   "pire_baisse_en_dollars": round(self.amount * abs(a["max_drawdown"])),
                                   "part_du_risque_du_titre": a["risk_share_of_ticker"], "actifs_de_croissance": a["growth_share"]},
            "limites_du_profil": r["limits"]})

    def mesures_titres(self, tickers: list[str]) -> str:
        ok = [t.strip().upper() for t in tickers if t.strip().upper() in self.prices.columns]
        s = m.summary(self.prices[ok]) if ok else pd.DataFrame()
        out = {t: {"volatilite": float(s.loc[t, "vol"]), "pire_baisse": float(s.loc[t, "max_drawdown"]), "pires_12_mois": float(s.loc[t, "worst_1y"]),
                   "rendement_annuel_passe": float(s.loc[t, "cagr"])} for t in s.index}
        return self.record("mesures_titres", {"tickers": tickers}, {"mesures": out, "introuvables": [t for t in tickers if t.strip().upper() not in ok]})

    def correlations(self, tickers: list[str]) -> str:
        ok = [t.strip().upper() for t in tickers if t.strip().upper() in self.prices.columns]
        c = m.returns(self.prices[ok]).corr().round(2) if len(ok) > 1 else pd.DataFrame()
        return self.record("correlations", {"tickers": tickers}, {"correlations": c.to_dict()})

    def comparer_options(self) -> str:
        out = []
        for o in self.options:
            if "result" not in o:
                continue
            s = o["result"]["stats"]
            out.append({"option": o["title"], "niveau_sur_5": o["level"], "dans_le_profil": o["within_profile"], "volatilite": s["vol"],
                        "pire_baisse": s["max_drawdown"], "pire_baisse_en_dollars": round(self.amount * abs(s["max_drawdown"])),
                        "pires_12_mois": s["worst_1y"], "rendement_annuel_passe": s["cagr"], "actifs_de_croissance": o["growth_share"]})
        return self.record("comparer_options", {}, {"options": out})


def build_tools(ctx: Context) -> list:
    """Outils Strands. La docstring est ce que le modèle lit pour choisir : elle doit être précise."""
    from strands import tool

    @tool
    def profil() -> str:
        """Profil déclaré de l'investisseur et limites retenues : objectif, horizon, tolérance, capacité, niveau de risque sur 5,
        plafonds de volatilité et d'actifs de croissance, exclusions. À consulter avant toute analyse."""
        return ctx.profil()

    @tool
    def lister_titres() -> str:
        """Liste des titres disponibles dans les données (ticker, nom, catégorie). Sert à retrouver le ticker exact d'un nom."""
        return ctx.lister_titres()

    @tool
    def verifier_idee(ticker: str, part_pct: float) -> str:
        """Confronte l'idée « mettre part_pct % du portefeuille dans ce titre » au profil de l'investisseur.
        Retourne le verdict, chaque vérification (exclusion, concentration, budget de risque, horizon, objectif), le portefeuille
        avant et après, et la plus grande part qui reste dans les limites. Les taux sont des fractions (0,12 = 12 %).
        ticker : symbole exact, par exemple TSLA ou SHOP.TO. part_pct : pourcentage du portefeuille, par exemple 20."""
        return ctx.verifier_idee(ticker, part_pct)

    @tool
    def mesures_titres(tickers: list[str]) -> str:
        """Risque et rendement passés d'un ou de plusieurs titres pris seuls, en dollars canadiens : volatilité annuelle, pire baisse,
        pires 12 mois, rendement annuel passé. Les valeurs sont des fractions (0,12 = 12 %)."""
        return ctx.mesures_titres(tickers)

    @tool
    def correlations(tickers: list[str]) -> str:
        """Corrélations des rendements quotidiens entre plusieurs titres. Proche de 1 : ils bougent ensemble, donc peu de diversification."""
        return ctx.correlations(tickers)

    @tool
    def comparer_options() -> str:
        """Les scénarios fictifs déjà calculés pour ce profil (plus prudent, aligné, plus exposé), avec leur risque et leur rendement passé."""
        return ctx.comparer_options()

    return [profil, lister_titres, verifier_idee, mesures_titres, correlations, comparer_options]


# ---------- 1. interprète ----------
class Intention(BaseModel):
    """Ce que l'utilisateur demande, sous forme exploitable par le code."""
    type: Literal["verifier_idee", "question_generale", "hors_perimetre", "a_preciser"] = Field(
        description="verifier_idee : il veut mettre une part de son portefeuille dans un titre. question_generale : il demande une information "
                    "sur des titres ou sur ses options. hors_perimetre : sans rapport avec l'analyse de placements. a_preciser : il manque le titre ou la part.")
    tickers: list[str] = Field(default_factory=list, description="Tickers exacts tirés de la liste fournie. Vide si aucun titre reconnu.")
    part_pct: float | None = Field(default=None, description="Part du portefeuille en pourcentage, si elle est donnée. Ne jamais l'inventer.")
    question_de_clarification: str | None = Field(default=None, description="Une seule question courte, si type vaut a_preciser.")


INTERPRETE_PROMPT = """Tu lis la phrase d'un investisseur particulier dans une application de simulation et tu la traduis en intention structurée.
L'application ne traite que les titres de la liste fournie. Si le titre nommé n'y est pas, réponds a_preciser et dis-le dans la question.
Tu ne donnes aucun avis et tu n'ajoutes rien que la personne n'a pas dit : si la part n'est pas indiquée, laisse-la vide et demande-la."""


def interpret(text: str, ctx: Context, model=None) -> Intention:
    from strands import Agent

    listing = "\n".join(f"- {t} : {ctx.universe.loc[t, 'name']}" for t in ctx.universe.index)
    agent = Agent(model=model or make_model(), system_prompt=INTERPRETE_PROMPT, callback_handler=None)
    res = agent(f"Titres disponibles :\n{listing}\n\nPhrase de l'investisseur : « {text} »", structured_output_model=Intention)
    intent = res.structured_output
    intent.tickers = [t for t in (x.strip().upper() for x in intent.tickers) if t in ctx.universe.index]
    return intent


# ---------- 2. analyste ----------
ANALYSTE_PROMPT = """Tu es l'analyste d'une application de simulation pour investisseurs particuliers au Canada. On te donne une intention ou une question.
Ton rôle est de choisir quels calculs lancer et de les lancer avec tes outils. Les outils sont les seules sources de chiffres : tu ne calcules
rien de tête et tu ne cites aucun chiffre de mémoire, parce que chaque chiffre montré à l'utilisateur doit pouvoir être retracé jusqu'à un outil.
Commence par consulter le profil. Pour une idée de placement, lance la vérification de l'idée ; ajoute les mesures du titre ou les corrélations
seulement si elles aident à comprendre le résultat. Quand tu as ce qu'il faut, termine par une ligne : « Analyse terminée. »
Tu ne rédiges pas l'explication : un autre agent s'en charge à partir de tes résultats."""


def analyse(intent: Intention, text: str, ctx: Context, model=None) -> None:
    from strands import Agent

    agent = Agent(model=model or make_model(), system_prompt=ANALYSTE_PROMPT, tools=build_tools(ctx), callback_handler=None)
    agent(f"Demande de l'investisseur : « {text} »\nIntention structurée : {intent.model_dump_json()}")


# ---------- 3. explicateur ----------
EXPLICATEUR_PROMPT = """Tu rédiges, en français, l'explication montrée à un investisseur particulier dans une application de simulation.
Tu reçois sa demande et les résultats des calculs déjà faits (la trace des outils). C'est ta seule source : tout chiffre que tu écris doit
figurer dans cette trace, parce qu'un contrôle automatique rejette le texte au moindre chiffre introuvable. Les taux y sont des fractions :
écris 0,129 comme « 12,9 % ». N'additionne pas, ne soustrais pas, n'arrondis pas autrement qu'à une décimale.

L'application n'est pas un conseiller. Tu n'écris jamais qu'il faut acheter, vendre ou conserver un titre, et tu ne dis pas ce que la personne
« devrait » faire. Tu montres ce que l'idée change par rapport à son profil déclaré, tu nommes clairement les conflits, et tu la laisses décider.
Si son idée contredit son profil, dis-le sans détour et sans la flatter : c'est le service qu'elle attend.

Structure, en phrases simples :
1. Le constat en une phrase (compatible, tensions, ou conflit avec le profil, et pourquoi en quelques mots).
2. Ce que les données montrent : les deux ou trois chiffres qui comptent, chacun avec la période.
3. Ce que cela change pour ce profil précis (objectif, horizon, limites).
4. Les limites de l'analyse : données passées sur une seule période, univers de titres choisi après coup, pas un conseil personnalisé.
5. Ce qui changerait la réponse.
Adapte la longueur au niveau d'explication demandé. Si la trace contient une erreur ou ne suffit pas pour conclure, dis-le au lieu de combler."""

DETAIL = {"brief": "L'essentiel en quatre ou cinq phrases, sans titres.", "standard": "Les points clés avec les chiffres principaux, environ 150 mots.",
          "detailed": "Le détail complet avec les sources et les hypothèses, environ 300 mots."}


def explain(text: str, ctx: Context, level: str = "standard", vocabulary_help: bool = False, feedback: str | None = None, model=None) -> str:
    from strands import Agent

    agent = Agent(model=model or make_model(), system_prompt=EXPLICATEUR_PROMPT, callback_handler=None)
    prompt = (f"Demande de l'investisseur : « {text} »\nNiveau d'explication demandé : {DETAIL.get(level, DETAIL['standard'])}\n"
              + ("La personne débute : définis en quelques mots tout terme technique.\n" if vocabulary_help else "")
              + f"Période des données : du {ctx.window[0]} au {ctx.window[1]}, en dollars canadiens.\n\nTrace des outils :\n"
              + json.dumps(ctx.trace, ensure_ascii=False, default=str))
    if feedback:
        prompt += f"\n\nTa version précédente a été rejetée par le contrôle : {feedback}\nRéécris en ne gardant que des chiffres présents dans la trace."
    return str(agent(prompt)).strip()


# ---------- 4. gouvernance (code, pas modèle) ----------
# Conseil : le texte dit à la personne quoi faire. Prévision : le texte affirme ce que le prix fera.
ADVICE_PATTERNS = [r"\bje (?:vous |te )?(?:recommande|conseille|suggère)", r"\bnous (?:vous )?(?:recommandons|conseillons|suggérons)",
                   r"\b(?:vous devriez|tu devrais|vous devez|tu dois)\b", r"\bil (?:faut|vaut mieux)\s+(?:acheter|vendre|conserver|investir)",
                   r"\bachetez\b", r"\bvendez\b", r"\bn'achetez pas\b", r"\b(?:conservez|investissez|foncez|profitez)\b",
                   r"\b(?:rendement|gain) (?:assuré|certain)", r"\bje vous invite à (?:acheter|vendre|investir)"]
FORECAST_PATTERNS = [r"\bva (?:atteindre|rapporter|monter|grimper|chuter|doubler|rebondir|exploser|gagner|générer|baisser|perdre)\b",
                     r"\b(?:devrait|devraient|devrions) (?:atteindre|rapporter|monter|grimper|générer|doubler|rebondir|gagner|augmenter|rendre|valoir|baisser|chuter)\b",
                     r"\b(?:atteindra|rapportera|montera|grimpera|doublera|vaudra|baissera|chutera|rebondira|gagnera)\b",
                     r"\bvous allez (?:gagner|perdre|doubler|toucher|obtenir)\b",
                     r"\brendements? (?:attendus?|escomptés?|espérés?|prévus?|probables?)\b", r"\bà (?:coup sûr|tout coup)\b",
                     r"\b(?:sûrement|certainement|assurément|infailliblement)\b", r"\bsans danger\b", r"\b(?:cours|prix) cible\b", r"\bpotentiel de hausse\b"]
# Ces formules sont légitimes quand elles sont niées (« ne garantit pas », « n'est pas une prévision », « pas sans risque »).
NEGATABLE_PATTERNS = [r"\bgaranti(?:e|es|s)?\b", r"\bsans (?:aucun )?risques?\b", r"\bprévisions?\b", r"\bprédictions?\b", r"\bprévoi(?:t|r)\b", r"\bprédi(?:t|re)\b",
                      r"\bchances?\b", r"\bprobabilités?\b", r"\bprobables?\b", r"\bcertain(?:e|s|es)? de\b"]
_NEGATION = re.compile(r"(?:\bne\b|\bn'|\bpas\b|\baucune?\b|\bsans\b|\bnon\b|\bjamais\b|\bni\b)", re.I)
NUMBER = re.compile(r"(?<![\w.,])(\d{1,3}(?:[ \u00a0\u202f\u2009]\d{3})+|\d+)(?:[.,](\d+))?")
_GROUP_SEP = re.compile(r"[ \u00a0\u202f\u2009]")
_MINUS = "\u2212-"


def _value(mt) -> float:
    return float(_GROUP_SEP.sub("", mt.group(1)) + ("." + mt.group(2) if mt.group(2) else ""))


def _numbers_in(obj, out: set) -> set:
    if isinstance(obj, bool) or obj is None:
        return out
    if isinstance(obj, (int, float)):
        out.add(float(obj))
    elif isinstance(obj, str):
        for mt in NUMBER.finditer(obj):
            out.add(_value(mt))
    elif isinstance(obj, dict):
        for v in obj.values():
            _numbers_in(v, out)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            _numbers_in(v, out)
    return out


def _is_negated(text: str, start: int) -> bool:
    """Une négation dans la même phrase, juste avant la formule (« ne garantit pas », « n'est pas une prévision »)."""
    sentence_start = max(text.rfind(c, 0, start) for c in ".!?;:\n") + 1
    return bool(_NEGATION.search(text[max(sentence_start, start - 60):start]))


def _wording_hits(text: str) -> tuple[list[str], list[str]]:
    advice = [m.group(0) for p in ADVICE_PATTERNS for m in re.finditer(p, text, flags=re.I)]
    forecast = [m.group(0) for p in FORECAST_PATTERNS for m in re.finditer(p, text, flags=re.I)]
    for p in NEGATABLE_PATTERNS:
        for m in re.finditer(p, text, flags=re.I):
            if not _is_negated(text, m.start()):
                (advice if "garanti" in p or "risque" in p else forecast).append(m.group(0))
    return advice, forecast


def validate_explanation(text: str, trace: list[dict], extra_allowed: list[float] | None = None) -> dict:
    """Contrôle déterministe d'un texte rédigé par un modèle.

    1. Chaque nombre du texte doit exister dans la trace, tel quel ou en pourcentage (x100), à l'arrondi du texte près
       (formats français acceptés : « 1 944 $ », « 12,9 % », « −6,0 % », « 2,9 ans »). Un signe moins explicite exige
       une valeur négative dans la trace. Les petits entiers (<= 5) et les années ne sont exemptés que s'ils ne sont pas
       des pourcentages ou des montants.
    2. Aucune formule de conseil (« achetez », « vous devriez ») ni de prévision ou de certitude (« va atteindre »,
       « rendement attendu », « à coup sûr »). Les formules niées (« ne garantit pas », « pas une prévision ») sont permises.
    Limite connue : on vérifie qu'un nombre existe, pas qu'il est dans la bonne phrase (voir docs/ai-notes.md)."""
    known = _numbers_in(trace, set())
    candidates = known | {v * 100 for v in known} | set(extra_allowed or [])  # extras autorisés tels quels, jamais multipliés par 100
    unknown = []
    checked = 0
    for mt in NUMBER.finditer(text):
        checked += 1
        raw, decimals, n = mt.group(0), len(mt.group(2) or ""), _value(mt)
        is_amount = bool(re.match(r"\s*(?:%|\$|CAD\b)", text[mt.end():mt.end() + 6]))
        grouped = bool(_GROUP_SEP.search(mt.group(1)))
        if decimals == 0 and not is_amount and (n == 0 or n <= 5 or (not grouped and 1990 <= n <= 2100)):  # puces, « sur 5 », années
            continue
        tol = 0.5 * 10 ** -decimals + 1e-9
        i = mt.start()
        negative = i > 0 and text[i - 1] in _MINUS and (i < 2 or not re.match(r"[\w.,)]", text[i - 2]))
        target = -n if negative else n
        if not any((abs(c - target) if negative else abs(abs(c) - target)) <= tol for c in candidates):
            unknown.append(("−" if negative else "") + raw)
    advice, forecast = _wording_hits(text)
    issues = []
    if not text.strip():
        issues.append("texte vide")
    if unknown:
        issues.append("chiffres introuvables dans la trace des outils : " + ", ".join(dict.fromkeys(unknown)))
    if advice:
        issues.append("formulation de conseil ou de promesse détectée : " + ", ".join(dict.fromkeys(advice)))
    if forecast:
        issues.append("formulation de prévision ou de certitude détectée (parler de scénarios hypothétiques) : " + ", ".join(dict.fromkeys(forecast)))
    return {"passed": not issues, "issues": issues, "unknown_numbers": list(dict.fromkeys(unknown)), "numbers_checked": checked,
            "flagged_phrases": list(dict.fromkeys(advice + forecast))}


# ---------- texte déterministe (repli et mode hors ligne) ----------
def deterministic_message(ctx: Context) -> str:
    r = ctx.last_check
    if not r:
        return "Je n'ai pas reconnu un titre et une part du portefeuille dans cette demande. Précisez-les pour que l'idée soit vérifiée."
    icon = {"ok": "✅", "info": "ℹ️", "warn": "⚠️", "conflict": "⛔"}
    lines = [f"**{r['verdict_label']}** : {decide.pct(r['weight'], 0)} dans {r['name']}, comparé au scénario aligné sur le profil.", ""]
    lines += [f"- {icon[c['status']]} {c['message']}" for c in r["checks"]]
    if r["verdict"] != "compatible" and r["max_weight_within_profile"] > 0:
        lines += ["", f"Jusqu'à {decide.pct(r['max_weight_within_profile'], 0)} de ce titre resterait dans les limites du profil. C'est une borne calculée, pas une suggestion d'achat."]
    lines += ["", f"Chiffres historiques du {ctx.window[0]} au {ctx.window[1]}, en dollars canadiens. Le rendement passé ne garantit pas le rendement futur. "
                  "Simulation seulement, pas un conseil financier personnalisé."]
    return "\n".join(lines)


# ---------- orchestration ----------
def run(text: str, ctx: Context, level: str = "standard", vocabulary_help: bool = False, force_offline: bool = False) -> dict:
    """Interprète -> analyste -> explicateur -> gouvernance. Retourne le message, la trace et le journal des étapes."""
    steps: list[dict] = []
    out = {"mode": "offline", "steps": steps, "trace": ctx.trace, "check": None, "message": "", "governance": None, "intention": None}

    def step(name, role, status, detail=""):
        steps.append({"agent": name, "role": role, "statut": status, "detail": detail})

    if force_offline or not bedrock_available():
        p = decide.parse_intention(text, ctx.universe)
        out["intention"] = {"type": "verifier_idee" if p["ok"] else "a_preciser", "tickers": p["tickers"], "part_pct": (p["weight"] or 0) * 100 or None}
        step("Interprète", "lecture par mots-clés (hors ligne)", "ok" if p["ok"] else "à préciser", json.dumps(out["intention"], ensure_ascii=False))
        ctx.profil()
        if p["ok"]:
            ctx.verifier_idee(p["tickers"][0], p["weight"] * 100)
        step("Analyste", "calculs lancés par le code (hors ligne)", "ok", f"{len(ctx.trace)} calcul(s)")
        out["message"] = deterministic_message(ctx)
        out["governance"] = validate_explanation(out["message"], ctx.trace)
        step("Gouvernance", "contrôle des chiffres et du ton", "ok" if out["governance"]["passed"] else "rejeté", "; ".join(out["governance"]["issues"]))
        out["check"] = ctx.last_check
        return out

    out["mode"] = "bedrock"
    try:
        model = make_model()
        intent = interpret(text, ctx, model)
        out["intention"] = intent.model_dump()
        step("Interprète", "traduit la phrase en intention structurée", "ok" if intent.type != "a_preciser" else "à préciser", intent.model_dump_json())
        if intent.type == "hors_perimetre":
            out["message"] = "Cette demande sort du cadre de l'application, qui analyse des idées de placement en simulation."
            return out
        if intent.type == "a_preciser":
            out["message"] = intent.question_de_clarification or "Quel titre, et quelle part du portefeuille ?"
            return out

        analyse(intent, text, ctx, model)
        step("Analyste", "choisit et lance les calculs", "ok", ", ".join(t["outil"] for t in ctx.trace) or "aucun outil appelé")
        out["check"] = ctx.last_check
        if not ctx.trace:
            out["message"] = "Aucun calcul n'a pu être lancé pour cette demande ; je ne peux donc rien affirmer."
            return out

        allowed = [intent.part_pct] if intent.part_pct else []
        message = explain(text, ctx, level, vocabulary_help, model=model)
        gov = validate_explanation(message, ctx.trace, allowed)
        step("Explicateur", "rédige à partir de la trace seulement", "ok", f"{len(message)} caractères")
        step("Gouvernance", "contrôle des chiffres et du ton", "ok" if gov["passed"] else "rejeté", "; ".join(gov["issues"]))
        if not gov["passed"]:
            message = explain(text, ctx, level, vocabulary_help, feedback=" ; ".join(gov["issues"]), model=model)
            gov = validate_explanation(message, ctx.trace, allowed)
            step("Explicateur", "deuxième rédaction après rejet", "ok", f"{len(message)} caractères")
            step("Gouvernance", "second contrôle", "ok" if gov["passed"] else "rejeté", "; ".join(gov["issues"]))
        if not gov["passed"]:
            message = deterministic_message(ctx)
            gov = {**validate_explanation(message, ctx.trace, allowed), "fallback": True}
            step("Gouvernance", "repli sur le texte produit par le code", "ok", "le texte du modèle a été écarté")
        out["message"], out["governance"] = message, gov
        return out
    except Exception as e:  # panne AWS, modèle indisponible, quota : on le dit et on retombe sur les calculs seuls
        step("AWS", "appel à Amazon Bedrock", "erreur", f"{type(e).__name__}: {str(e)[:300]}")
        fallback = run(text, Context(ctx.prices, ctx.universe, ctx.meta, ctx.profile, ctx.base_weights, ctx.amount, ctx.options), level, vocabulary_help, force_offline=True)
        fallback["steps"] = steps + fallback["steps"]
        fallback["mode"] = "offline_after_error"
        return fallback


# ======================================================================================================
# Fil de découverte : texte « Pourquoi » d'une carte (explain_card) et résumé des préférences
# ======================================================================================================
NBSP = " "
_BULKY_KEYS = {"series", "paths", "trace", "dates", "values"}


def _clean_card(obj):
    """Retire les tableaux volumineux (séries, trajectoires, trace d'interface) avant d'envoyer la carte au modèle."""
    if isinstance(obj, dict):
        return {k: _clean_card(v) for k, v in obj.items() if k not in _BULKY_KEYS}
    if isinstance(obj, (list, tuple)):
        return [_clean_card(v) for v in obj][:40]
    return obj


def _profile_summary(p: InvestorProfile) -> dict:
    b = p.budget()
    return {"objectif": OBJECTIVE_FR.get(p.objective, p.objective), "horizon_ans_minimum": p.horizon_years,
            "tolerance_declaree_sur_5": p.risk_tolerance, "niveau_de_risque_retenu_sur_5": b["level"], "niveau_libelle": LEVEL_FR[b["level"]],
            "plafond_volatilite": b["max_vol"], "plafond_actifs_de_croissance": b["max_growth_assets"],
            "exclusions_strictes": p.excluded, "a_eviter_si_possible": p.avoided}


def _card_trace(card: dict, profile: InvestorProfile) -> list[dict]:
    """La « trace » d'une carte, au même format que celle des outils : ce que le contrôle de gouvernance reconnaît comme source."""
    return [{"outil": "fiche_titre", "sortie": _clean_card(card)}, {"outil": "profil", "sortie": _profile_summary(profile)}]


def _num(d, *keys):
    for k in keys:
        v = (d or {}).get(k)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            return float(v)
    return None


def _pc(x: float, d: int = 1) -> str:
    """12,9 % ; le signe de la valeur source est conservé (« −6,0 % ») pour que le contrôle puisse le vérifier."""
    body = f"{abs(x) * 100:.{d}f}".replace(".", ",")
    return ("−" if x < 0 and float(f"{abs(x) * 100:.{d}f}") != 0 else "") + body + NBSP + "%"


def _scenario_value(x: float, unit: str) -> str:
    if unit == "multiple":
        return "×" + f"{x:.2f}".replace(".", ",")
    if unit == "cad":
        return f"{x:,.0f}".replace(",", NBSP) + NBSP + "$"
    return _pc(x)


def _name(card: dict) -> str:
    return str(card.get("name") or card.get("ticker") or "Ce titre")


def _sentence(s: str) -> str:
    s = " ".join(str(s).split()).rstrip(" .")
    return s + "." if s else ""


VERDICT_FR = {"compatible": "reste dans les limites de votre profil", "tension": "crée des tensions avec votre profil",
              "conflict": "est en conflit avec votre profil"}


def _offline_card_text(card: dict, profile: InvestorProfile, level: str = "standard", vocabulary_help: bool = False, extras: bool = True) -> dict:
    """Texte déterministe d'une carte. `extras` ajoute les phrases produites par le feed (raisons, similarité) : à retirer si le contrôle les rejette."""
    name, fit, hist, scen = _name(card), card.get("fit") or {}, card.get("history") or {}, card.get("scenarios") or {}
    verdict = fit.get("verdict")
    summ = _profile_summary(profile)
    vol, mdd = _num(hist, "vol"), _num(hist, "max_drawdown")
    cagr, w1y, under = _num(hist, "cagr"), _num(hist, "worst_1y"), _num(hist, "years_underwater")
    win = hist.get("window")
    window = win if isinstance(win, (list, tuple)) and len(win) == 2 else None
    reasons = [r for r in (card.get("reasons") or []) if isinstance(r, str) and r.strip()] if extras else []

    # --- face de la carte : deux phrases au plus ---
    if verdict in VERDICT_FR:
        s1 = f"{name} {VERDICT_FR[verdict]}"
        if verdict != "compatible" and reasons and len(reasons[0]) <= 140:
            s1 += " : " + reasons[0].rstrip(" .")
    else:
        s1 = f"L'adéquation de {name} à votre profil n'a pas pu être évaluée : la vérification manque"
    if vol is not None and mdd is not None and window:
        s2 = f"Du {window[0]} au {window[1]}, volatilité annuelle de {_pc(vol)} et pire baisse de {_pc(mdd)}"
    else:
        s2 = "Les données disponibles ne permettent pas de chiffrer le risque historique de ce titre"
    short = _sentence(s1) + " " + _sentence(s2)

    # --- vue détaillée ---
    L: list[str] = []
    head = fit.get("label") or ("Adéquation non évaluée" if verdict not in VERDICT_FR else name)
    L += [f"**{head}**", ""]
    L.append("**Ce que disent les données**" + (f" (du {window[0]} au {window[1]}, rendements convertis en dollars canadiens)" if window else ""))
    facts = []
    if cagr is not None:
        facts.append(f"- Rendement annuel passé : {_pc(cagr)}")
    if vol is not None:
        facts.append(f"- Volatilité annuelle : {_pc(vol)}")
    if mdd is not None:
        facts.append(f"- Pire baisse entre un sommet et un creux : {_pc(mdd)}")
    if w1y is not None and level != "brief":
        facts.append(f"- Pires 12 mois : {_pc(w1y)}")
    if under is not None and 0 <= under <= 40 and level != "brief":
        facts.append(f"- Plus longue période sous le sommet : {under:.1f} ans".replace(".", ","))
    L += facts or ["- Les données historiques de ce titre sont absentes ou insuffisantes : aucune conclusion chiffrée n'est possible."]
    L += ["", "**Pour votre profil**",
          f"- Niveau de risque retenu : {summ['niveau_de_risque_retenu_sur_5']} sur 5 ({summ['niveau_libelle']}), plafond de volatilité du portefeuille "
          f"{_pc(summ['plafond_volatilite'])}, horizon d'au moins {profile.horizon_years:g} ans."]
    checks = [c for c in (fit.get("checks") or []) if isinstance(c, dict) and c.get("message")]
    checks.sort(key=lambda c: {"conflict": 0, "warn": 1}.get(c.get("status"), 2))
    icon = {"ok": "✅", "info": "ℹ️", "warn": "⚠️", "conflict": "⛔"}
    for c in checks[: 2 if level == "brief" else 6]:
        L.append(f"- {icon.get(c.get('status'), 'ℹ️')} {_sentence(c['message'])}")
    for r in (reasons[:3] if level != "brief" else []):
        L.append(f"- {_sentence(r)}")
    mx = _num(fit, "max_weight_within_profile")
    if mx is not None and verdict in ("tension", "conflict"):
        L.append(f"- Part maximale restant dans les limites du profil : {_pc(mx, 0)}. C'est une borne calculée, pas une suggestion d'achat."
                 if mx > 0 else "- Aucune part de ce titre ne reste dans les limites du profil.")
    imp = card.get("impact") or {}
    bv = _num(imp.get("before"), "ex_ante_vol", "vol", "volatilite_estimee")
    av = _num(imp.get("after"), "ex_ante_vol", "vol", "volatilite_estimee")
    if bv is not None and av is not None and level != "brief":
        L.append(f"- Effet sur le portefeuille de référence : volatilité estimée de {_pc(bv)} à {_pc(av)}.")
    if extras and card.get("similarity_note") and level != "brief":
        L.append(f"- {_sentence(card['similarity_note'])}")
    p5, p50, p95 = _num(scen, "p5"), _num(scen, "p50"), _num(scen, "p95")
    if p5 is not None and p95 is not None:
        # alphaforge.feed.scenarios_5y donne des montants en dollars pour une mise de départ `amount` et l'horizon dans `years`.
        start = _num(scen, "amount")
        unit = scen.get("unit") or ("cad" if start is not None else "return")
        n, hz, below = _num(scen, "n_sims"), _num(scen, "horizon_years", "years"), _num(scen, "share_below_start")
        what = ((f"{int(n):,}".replace(",", NBSP) + " simulations" if n else "Des simulations") + (f" sur {hz:g} ans" if hz else "")
                + (f" pour une mise de départ de {_scenario_value(start, 'cad')}" if unit == "cad" and start is not None else "")
                + ", tirées au hasard dans l'historique récent")
        rng = f"{what} : le cas défavorable (5{NBSP}% des simulations) donne {_scenario_value(p5, unit)}, "
        rng += (f"le cas médian {_scenario_value(p50, unit)}, " if p50 is not None else "") + f"le cas favorable (5{NBSP}% des simulations) {_scenario_value(p95, unit)}."
        L += ["", "**Scénarios hypothétiques**", rng]
        if below is not None:
            L.append(f"{_pc(below, 0)} des simulations finissent sous la mise de départ.")
        L.append("Ce sont des scénarios hypothétiques, pas une prévision : l'avenir peut sortir de cette fourchette.")
    else:
        L += ["", "Les données ne permettent pas de produire de scénarios hypothétiques fiables pour ce titre."]
    L += ["", "**Ce qui changerait la lecture**",
          "Une part plus petite dans le portefeuille, un profil, un horizon ou des exclusions modifiés, ou une autre période de données (celle-ci est une seule période historique).",
          "", "**Limites**",
          "Données passées sur une seule période, univers de titres choisi après coup (biais du survivant). Le rendement passé ne garantit pas le rendement futur. "
          "Simulation seulement : ceci n'est pas un conseil financier personnalisé."]
    if vocabulary_help:
        L += ["", "*Volatilité : l'ampleur habituelle des variations sur un an. Pire baisse : la plus forte chute entre un sommet et le creux suivant. "
                  "Pires 12 mois : la pire année glissante observée.*"]
    return {"short": short, "long": "\n".join(L)}


class CarteTexte(BaseModel):
    """Les deux textes d'une carte, rédigés par le modèle."""
    court: str = Field(description="Face de la carte : une ou deux phrases en français, 300 caractères au plus. Dit comment le titre s'accorde au profil et cite un ou deux chiffres avec leur période.")
    long: str = Field(description="Vue détaillée en markdown, en français : constat, chiffres clés avec la période, effet pour ce profil, scénarios hypothétiques s'il y en a, limites, ce qui changerait la lecture.")


CARTE_PROMPT = """Tu écris le texte « Pourquoi » d'une carte dans un fil de découverte de titres. La personne qui le lit est un investisseur particulier qui joue avec
une simulation : il fait défiler des titres un à un et veut comprendre, en quelques secondes puis en détail, comment chacun s'accorde à SON profil.
Tu reçois une fiche de calculs faite par le code (adéquation au profil, chiffres historiques, scénarios hypothétiques) et un résumé de son profil. Ce sont tes seules sources.

Tout nombre que tu écris doit venir de la fiche ou du profil, parce que le texte est contrôlé automatiquement avant d'être affiché : un seul chiffre introuvable le fait rejeter,
et la personne verrait alors le texte plus sec produit par le code. Les taux sont des fractions : écris 0,129 comme « 12,9 % ». Ne calcule rien toi-même (pas de somme, de différence ni de
conversion) et n'arrondis pas autrement qu'à une décimale. Cite la période des données avec les chiffres, car un rendement sans sa période ne veut rien dire.

Ce service n'est pas un conseiller : la personne décide. Le même contrôle rejette donc toute formule qui dit quoi faire (acheter, vendre, conserver, « vous devriez ») et toute formule
qui affirme l'avenir (« va atteindre », « rendement attendu », « à coup sûr », « garanti »). Les scénarios de la fiche sont des tirages hypothétiques dans l'historique, pas des prévisions :
présente-les comme des scénarios hypothétiques et rappelle qu'ils ne sont pas une prévision. Dis aussi ce qui changerait la lecture (une part plus petite, un autre profil ou une autre période de données).

Si le verdict est « conflict », écris-le clairement avec le mot « conflit » dès la première phrase, sans l'adoucir : un investisseur prudent près de la retraite qui regarde un titre très volatil
doit se faire contredire, pas flatter. Si la fiche manque de données pour conclure, dis-le au lieu de combler. Termine la vue détaillée en rappelant que ce n'est pas un conseil financier personnalisé.
Écris en phrases simples, sans jargon inutile."""

CARD_DETAIL = {"brief": "Vue détaillée très courte : environ 80 mots.", "standard": "Vue détaillée d'environ 150 à 200 mots.", "detailed": "Vue détaillée complète d'environ 300 mots."}


def _call_card_model(prompt: str, model=None) -> CarteTexte:
    """Seul point d'appel au modèle pour les cartes : les tests le remplacent."""
    from strands import Agent

    agent = Agent(model=model or make_model(), system_prompt=CARTE_PROMPT, callback_handler=None)
    res = agent(prompt, structured_output_model=CarteTexte)
    return res.structured_output


def _card_prompt(card: dict, profile: InvestorProfile, level: str, vocabulary_help: bool, feedback: str | None = None) -> str:
    p = (f"Fiche du titre (calculée par le code) :\n{json.dumps(_clean_card(card), ensure_ascii=False, default=str)}\n\n"
         f"Profil de l'investisseur :\n{json.dumps(_profile_summary(profile), ensure_ascii=False, default=str)}\n\n"
         f"Niveau demandé : {CARD_DETAIL.get(level, CARD_DETAIL['standard'])}\n"
         + ("La personne débute : définis en quelques mots tout terme technique.\n" if vocabulary_help else ""))
    if feedback:
        p += f"\nTa version précédente a été rejetée par le contrôle : {feedback}\nRéécris en corrigeant ces points."
    return p


_NOT_A_FORECAST = re.compile(r"(?:\bpas (?:une |des )?(?:prévisions?|prédictions?)|\bne (?:prédit|prévoit|prédisent|prévoient) pas)", re.I)
_NOT_ADVICE = re.compile(r"\b(?:pas|aucun) (?:un )?conseil", re.I)


def _govern_card(short: str, long: str, card: dict, trace: list[dict]) -> dict:
    """Gouvernance d'une carte : contrôle des chiffres et du ton sur les deux textes, plus quatre règles propres à la carte."""
    gs, gl = validate_explanation(short, trace), validate_explanation(long, trace)
    issues = [("face de la carte : " + i) for i in gs["issues"]] + [("vue détaillée : " + i) for i in gl["issues"]]
    if len(short) > 420:
        issues.append("face de la carte trop longue (deux phrases au plus)")
    if (card.get("fit") or {}).get("verdict") == "conflict" and not re.search(r"\bconflit\b", short, re.I):
        issues.append("verdict en conflit : le mot « conflit » doit figurer dès la face de la carte")
    if (card.get("scenarios") or {}).get("p5") is not None and not _NOT_A_FORECAST.search(long):
        issues.append("scénarios présents : la vue détaillée doit rappeler qu'ils ne sont pas une prévision")
    if not _NOT_ADVICE.search(long):
        issues.append("la vue détaillée doit rappeler que ce n'est pas un conseil financier personnalisé")
    return {"passed": not issues, "issues": issues, "unknown_numbers": list(dict.fromkeys(gs["unknown_numbers"] + gl["unknown_numbers"])),
            "numbers_checked": gs["numbers_checked"] + gl["numbers_checked"], "flagged_phrases": list(dict.fromkeys(gs["flagged_phrases"] + gl["flagged_phrases"]))}


def _offline_card(card: dict, profile: InvestorProfile, trace: list[dict], level: str, vocabulary_help: bool) -> tuple[dict, dict]:
    """Texte déterministe et son contrôle ; si une phrase produite par le feed fait échouer le contrôle, on la retire plutôt que d'afficher un texte rejeté."""
    txt = _offline_card_text(card, profile, level, vocabulary_help)
    gov = _govern_card(txt["short"], txt["long"], card, trace)
    if not gov["passed"]:
        txt = _offline_card_text(card, profile, level, vocabulary_help, extras=False)
        gov = {**_govern_card(txt["short"], txt["long"], card, trace), "extras_dropped": True}
    return txt, gov


def explain_card(card: dict, profile: InvestorProfile, level: str = "standard", vocabulary_help: bool = False, force_offline: bool = False) -> dict:
    """Texte « Pourquoi » d'une carte du fil. Retourne {mode, short, long, governance, steps}.

    mode : "bedrock" (texte du modèle accepté, ou repli sur le texte du code après deux rejets : voir governance["fallback"]),
           "offline" (aucun identifiant AWS ou force_offline), "offline_after_error" (l'appel à Bedrock a échoué)."""
    steps: list[dict] = []

    def step(name, role, status, detail=""):
        steps.append({"agent": name, "role": role, "statut": status, "detail": detail})

    trace = _card_trace(card, profile)
    txt, gov = _offline_card(card, profile, trace, level, vocabulary_help)
    base_out = {"short": txt["short"], "long": txt["long"], "governance": gov, "steps": steps}

    if force_offline or not bedrock_available():
        step("Explicateur", "texte déterministe produit par le code (hors ligne)", "ok")
        step("Gouvernance", "contrôle des chiffres et du ton", "ok" if gov["passed"] else "rejeté", "; ".join(gov["issues"]))
        return {"mode": "offline", **base_out}

    try:
        out = _call_card_model(_card_prompt(card, profile, level, vocabulary_help))
        g = _govern_card(out.court, out.long, card, trace)
        step("Explicateur", "rédige la face et la vue détaillée à partir de la fiche seulement", "ok", f"{len(out.court)} + {len(out.long)} caractères")
        step("Gouvernance", "contrôle des chiffres et du ton", "ok" if g["passed"] else "rejeté", "; ".join(g["issues"]))
        if not g["passed"]:
            out = _call_card_model(_card_prompt(card, profile, level, vocabulary_help, feedback=" ; ".join(g["issues"])))
            g = _govern_card(out.court, out.long, card, trace)
            step("Explicateur", "deuxième rédaction après rejet", "ok", f"{len(out.court)} + {len(out.long)} caractères")
            step("Gouvernance", "second contrôle", "ok" if g["passed"] else "rejeté", "; ".join(g["issues"]))
        if g["passed"]:
            return {"mode": "bedrock", "short": out.court.strip(), "long": out.long.strip(), "governance": g, "steps": steps}
        step("Gouvernance", "repli sur le texte produit par le code", "ok", "le texte du modèle a été écarté")
        return {"mode": "bedrock", **base_out, "governance": {**gov, "fallback": True}}
    except Exception as e:  # panne AWS, modèle indisponible, quota
        step("AWS", "appel à Amazon Bedrock", "erreur", f"{type(e).__name__}: {str(e)[:300]}")
        step("Gouvernance", "contrôle du texte hors ligne", "ok" if gov["passed"] else "rejeté", "; ".join(gov["issues"]))
        return {"mode": "offline_after_error", **base_out}


# ---------- préférences révélées par le fil ----------
PREFERENCE_NOTE = "Ces préférences réordonnent le fil, mais ne modifient jamais les limites de risque de votre profil."


def _vol_word(v: float) -> str:
    return "très variables" if v > 0.30 else "assez variables" if v > 0.18 else "plutôt stables"


def _group_stats(tickers: list[str], cards: dict) -> dict:
    found = [cards[t] for t in tickers if t in cards]
    sectors: dict[str, int] = {}
    classes: dict[str, int] = {}
    vols = []
    for c in found:
        sec, cls = str(c.get("sector") or "autre"), str(c.get("asset_class") or "autre")
        sectors[sec] = sectors.get(sec, 0) + 1
        classes[cls] = classes.get(cls, 0) + 1
        v = _num(c.get("history"), "vol")
        if v is not None:
            vols.append(v)
    top = max(sectors.items(), key=lambda kv: (kv[1], kv[0])) if sectors else None
    return {"n": len(found), "n_demandes": len(tickers), "secteurs": sectors, "classes": classes, "secteur_dominant": top[0] if top else None,
            "secteur_dominant_n": top[1] if top else 0, "volatilite_moyenne": sum(vols) / len(vols) if vols else None, "n_avec_volatilite": len(vols)}


def summarize_preferences(state: dict, cards_by_ticker: dict, force_offline: bool = False) -> dict:
    """Une ou deux phrases sur ce que les réactions de l'utilisateur révèlent, calculées par le code (comptes par secteur et classe d'actif,
    volatilité moyenne des titres aimés et écartés). Retourne {mode, text, stats, governance}. Il n'y a pas de réécriture par modèle :
    le texte reste celui du code (`force_offline` est accepté pour une signature homogène)."""
    liked, disliked = _group_stats(list(state.get("liked") or []), cards_by_ticker), _group_stats(list(state.get("disliked") or []), cards_by_ticker)
    stats = {"aime": liked, "ecarte": disliked, "enregistres": len(state.get("saved") or []), "achats_simules": len(state.get("purchases") or []),
             "masques": len(state.get("hidden") or []), "neutres": len(state.get("neutral") or [])}
    parts = []
    for label, g in (("Vous avez aimé surtout des titres du secteur", liked), ("Vous avez écarté surtout des titres du secteur", disliked)):
        if g["n"] >= 1:
            s = f"{label} « {g['secteur_dominant']} » ({g['secteur_dominant_n']} sur {g['n']})"
            if g["volatilite_moyenne"] is not None:
                s += f", {_vol_word(g['volatilite_moyenne'])} (volatilité moyenne de {_pc(g['volatilite_moyenne'])})"
            parts.append(s + ".")
    lv, dv = liked["volatilite_moyenne"], disliked["volatilite_moyenne"]
    if lv is not None and dv is not None and abs(lv - dv) > 0.05:
        parts.append("Vous gardez plus volontiers des titres " + ("plus variables" if lv > dv else "plus stables") + " que ceux que vous écartez.")
    lead = " ".join(parts) if parts else "Pas encore assez de réactions pour dégager une tendance : aimez ou écartez quelques titres."
    text = lead + " " + PREFERENCE_NOTE
    return {"mode": "offline", "text": text, "stats": stats, "governance": validate_explanation(text, [stats])}
