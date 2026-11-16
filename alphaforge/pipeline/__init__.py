"""Pipeline à quatre agents : Chercheur de sources -> Vérificateur de faits -> Collecteur -> Scénarios (+ explication gouvernée).

Chaque agent = cœur déterministe + couche Bedrock facultative qui n'écrit que du texte. Tout fonctionne hors ligne.
Les chiffres viennent du code ; l'explication est contrôlée par `agents.validate_explanation` contre la trace.
"""
from __future__ import annotations

import re

from . import _timeout, _trace, data_collector, fact_checker, predictor, source_finder

__all__ = ["run", "source_finder", "fact_checker", "data_collector", "predictor", "explain_outlook", "clear_profile_cache"]

EXTRA_ALLOWED = [10, 50, 90, 5, 95, 3, 12, 61, 75, 25, 2000]  # centiles et paramètres de méthode cités dans le texte


def _pc(x: float, d: int = 1) -> str:
    return ("−" if x < 0 else "") + f"{abs(x) * 100:.{d}f}".replace(".", ",") + " %"


def _money(x: float) -> str:
    return f"{x:,.0f}".replace(",", " ") + " $"


def _facts(outlook: dict, data: dict) -> dict:
    """Faits numériques pour la validation (trace). Les valeurs par titre rendent le texte indépendant de la quantité choisie."""
    sc, h, q = outlook["scenarios"], outlook["history"], outlook["quantity"] or 1
    return {"quantity": outlook["quantity"], "start_value": outlook["start_value"], "share_below_start": outlook["share_below_start"],
            "annual": {k: sc[k]["annual"] for k in sc}, "final": {k: sc[k]["final"] for k in sc}, "historical_cagr": h["cagr"],
            "volatility": h["vol_annual"], "history_years": h["years"], "beta": h["beta"], "risk_free": h.get("rf"), "n_obs": data["n_obs"],
            "window": [data["start"], data["end"]], "currency": data["currency"],
            "per_share": {"start": outlook["start_value"] / q, **{k: sc[k]["final"] / q for k in sc}}}


def _profile_facts(profile) -> dict:
    """Résumé du profil de l'investisseur (portefeuille + compte) donné au modèle et à la validation."""
    from .. import agents

    return agents._profile_summary(profile)


def _profile_allowed(ps: dict) -> list[str]:
    """Nombres du profil que le modèle peut citer, formatés à la française."""
    h = f"{float(ps['horizon_ans_minimum']):g}".replace(".", ",")
    return [f"horizon de l'investisseur : {h} ans", f"tolérance déclarée : {ps['tolerance_declaree_sur_5']} sur 5",
            f"niveau de risque retenu : {ps['niveau_de_risque_retenu_sur_5']} sur 5 ({ps['niveau_libelle']})",
            f"plafond de volatilité du profil : {_pc(ps['plafond_volatilite'], 0)}",
            f"plafond d'actifs de croissance du profil : {_pc(ps['plafond_actifs_de_croissance'], 0)}"]


def _allowed(outlook: dict, data: dict) -> list[str]:
    """Tous les nombres que le modèle peut citer, déjà formatés à la française."""
    sc, h, q = outlook["scenarios"], outlook["history"], outlook["quantity"] or 1
    fr = lambda x, d=2: f"{x:.{d}f}".replace(".", ",")  # noqa: E731
    out = [f"rendement annuel défavorable : {_pc(sc['worst']['annual'])}", f"rendement annuel central : {_pc(sc['central']['annual'])}",
           f"rendement annuel favorable : {_pc(sc['best']['annual'])}", f"part des trajectoires sous la mise de départ : {_pc(outlook['share_below_start'], 0)}",
           f"rendement annuel historique : {_pc(h['cagr'])}", f"volatilité annuelle historique : {_pc(h['vol_annual'])}", f"bêta : {fr(h['beta'])}",
           f"taux de référence de la Banque du Canada : {_pc(h['rf'], 2)}" if h.get("rf") is not None else "", f"observations : {data['n_obs']}",
           f"valeur d'un titre au départ : {_money(outlook['start_value'] / q)}", f"valeur finale par titre, défavorable : {_money(sc['worst']['final'] / q)}",
           f"valeur finale par titre, central : {_money(sc['central']['final'] / q)}", f"valeur finale par titre, favorable : {_money(sc['best']['final'] / q)}",
           f"horizon : {outlook['horizon_years']} ans", "réduction vers le prior : 75 %", "part de l'historique : 25 %", "prime de risque supposée : 5 % par an",
           "blocs de 3 mois", "2 000 trajectoires simulées", "centiles : 10, 50 et 90"]
    return [x for x in out if x]


def _attempt_entry(n: int, passed: bool, issues: list, text: dict | None) -> dict:
    head = ((text or {}).get("short", "") + " | " + (text or {}).get("long", ""))[:200]
    return {"attempt": n, "passed": passed, "issues": issues, "text_head": head}


def _deterministic(ticker: str, outlook: dict, data: dict, fc: dict) -> dict:
    sc, h = outlook["scenarios"], outlook["history"]
    qty = f"{outlook['quantity']:g}"
    short = (f"Trois scénarios hypothétiques sur {outlook['horizon_years']} ans pour {qty} titre(s) de {ticker} : défavorable {_pc(sc['worst']['annual'])}, "
             f"central {_pc(sc['central']['annual'])}, favorable {_pc(sc['best']['annual'])} par an ; ce n'est pas une prévision.")
    long = (f"Pour {qty} titre(s) de {ticker}, soit {_money(outlook['start_value'])} au départ, nous avons simulé {outlook['horizon_years']} ans de rendements "
            f"à partir de {data['n_obs']} observations (du {data['start'][:4]} au {data['end'][:4]}, en {data['currency']}, cours ajustés). "
            f"Valeur finale : {_money(sc['worst']['final'])} dans le scénario défavorable, {_money(sc['central']['final'])} dans le central, "
            f"{_money(sc['best']['final'])} dans le favorable, soit {_pc(sc['worst']['annual'])}, {_pc(sc['central']['annual'])} et {_pc(sc['best']['annual'])} par an. "
            f"{_pc(outlook['share_below_start'], 0)} des trajectoires simulées finissent sous la mise de départ. "
            f"Sur la fenêtre historique, le titre a rapporté {_pc(h['cagr'])} par an avec une volatilité de {_pc(h['vol_annual'])} ; "
            f"nous avons volontairement ramené cette dérive vers un niveau proportionnel au risque pour ne pas supposer que le passé se répète. "
            f"Limites : {outlook['limits'][0]} "
            f"Vérification des sources : {'toutes les vérifications sont passées' if fc['passed'] else 'au moins une vérification a échoué (voir le détail)'}. "
            f"Ce sont des scénarios hypothétiques, pas une prévision ni un conseil financier.")
    return {"short": short, "long": long}


def _bedrock_text(ticker: str, facts: dict, outlook: dict, allowed: list[str], feedback: str | None = None, profile_summary: dict | None = None) -> dict:
    import json

    from strands import Agent

    from .. import agents

    prompt = ("Tu rédiges en français, pour un investisseur particulier dans une application de SIMULATION, l'explication de trois scénarios "
              "hypothétiques pour UN titre. RÈGLE ABSOLUE : tu ne cites AUCUN nombre qui ne figure pas, tel quel, dans la liste NOMBRES AUTORISÉS "
              "ci-dessous (pas de calcul, pas d'arrondi différent, pas de pourcentage dérivé, pas de nombre de ta mémoire). Les nombres de la liste "
              "peuvent être recopiés avec leur unité. Ne donne aucun conseil, ne dis jamais que le prix « va » monter ou baisser, n'écris jamais l'expression « sans risque » (dis « taux de référence »), n'utilise pas les "
              "mots chances, probabilité, probable, certain ; ne parle de prévision que pour dire qu'il n'y en a pas. "
              "Réponds par deux paragraphes séparés par une ligne vide : un résumé d'une phrase, puis une explication d'environ 120 mots qui mentionne la "
              "méthode, une limite et ce qui changerait la réponse.\n"
              f"Titre : {ticker}\nNOMBRES AUTORISÉS :\n- " + "\n- ".join(allowed) +
              f"\nMéthode : {outlook['method']}\nLimites : {json.dumps(outlook['limits'], ensure_ascii=False)}")
    if profile_summary:
        prompt += ("\nProfil de l'investisseur pour ce portefeuille (calculé par le code) : "
                   f"{json.dumps(profile_summary, ensure_ascii=False, default=str)}\n"
                   "Adapte l'explication à ce profil : situe l'horizon des scénarios par rapport à l'horizon de l'investisseur et la volatilité "
                   "historique du titre par rapport au plafond de volatilité du profil, avec des mots (plus élevée, plus basse, proche), sans "
                   "calculer d'écart. Rappelle que ce n'est pas un conseil financier personnalisé.")
    if feedback:
        prompt += f"\nTa version précédente a été REJETÉE par le contrôle automatique pour : {feedback}. Réécris en corrigeant exactement ces points."
    agent = Agent(model=agents.make_model(), callback_handler=None, system_prompt="Tu es un rédacteur prudent ; le code calcule, tu expliques.")
    parts = [p.strip() for p in str(agent(prompt)).strip().split("\n\n") if p.strip()]
    return {"short": parts[0], "long": "\n\n".join(parts[1:]) or parts[0]}


def explain_outlook(ticker: str, outlook: dict, data: dict, fact_check: dict, trace: list, force_offline: bool = False, text_fn=None,
                    cached: dict | None = None, profile=None) -> dict:
    """Explication + gouvernance. `text_fn(feedback) -> {"short","long"}` remplace Bedrock (tests). Chaque tentative du modèle est
    inscrite dans la trace (acceptée ou rejetée, motifs). Repli déterministe si deux tentatives échouent.
    `cached` : explication Bedrock déjà validée (indépendante de la quantité), revalidée avant réutilisation.
    `profile` : profil de l'investisseur (InvestorProfile) ; le texte du modèle est alors adapté à ce profil."""
    from .. import agents

    t0 = _trace.now()
    facts = _facts(outlook, data)
    ps = _profile_facts(profile) if profile is not None else None
    if ps is not None:
        facts["profile"] = ps  # ses nombres deviennent citables (validation)
    vtrace = [t for t in trace if t.get("agent") != "source_finder"] + [{"outputs": facts}]  # figée AVANT les tentatives : un texte rejeté ne légitime rien
    det = _deterministic(ticker, outlook, data, fact_check)
    use_model = text_fn is not None or (not force_offline and agents.bedrock_available())
    mode, text, issues, attempts, log = "offline", det, [], 0, []
    validate = lambda t: agents.validate_explanation(t["short"] + chr(10) + t["long"], vtrace, extra_allowed=EXTRA_ALLOWED)  # noqa: E731
    from_cache = False
    if cached and not force_offline and validate(cached["text"])["passed"]:
        mode, text, from_cache, log = "bedrock", cached["text"], True, cached.get("attempts", [])
        attempts = len(log)
        for e in log:
            _trace.record(trace, "explainer", f"tentative_{e['attempt']}", "bedrock.explain (cache)", {"attempt": e["attempt"]}, {**e, "from_cache": True})
    elif use_model:
        allowed = _allowed(outlook, data) + (_profile_allowed(ps) if ps is not None else [])
        extra = {"profile_summary": ps} if ps is not None else {}  # signature d'origine conservée sans profil
        fn = text_fn or (lambda fb: _bedrock_text(ticker, facts, outlook, allowed, fb, **extra))
        feedback = None
        for attempts in (1, 2):
            t1 = _trace.now()
            try:
                cand = _timeout.call_with_timeout(fn, feedback)
            except Exception as exc:  # noqa: BLE001
                issues = [f"délai dépassé : {exc}" if isinstance(exc, TimeoutError) else f"erreur du modèle : {type(exc).__name__}"]
                log.append(_attempt_entry(attempts, False, issues, None))
                _trace.record(trace, "explainer", f"tentative_{attempts}", "bedrock.explain", {"attempt": attempts, "feedback": feedback}, log[-1], t1)
                break
            v = validate(cand)
            log.append(_attempt_entry(attempts, v["passed"], v["issues"], cand))
            _trace.record(trace, "explainer", f"tentative_{attempts}", "bedrock.explain", {"attempt": attempts, "feedback": feedback}, log[-1], t1)
            if v["passed"]:
                mode, text, issues = "bedrock", cand, []
                break
            issues = v["issues"]
            feedback = "; ".join(issues)
    final = validate(text)
    gov = {"passed": final["passed"], "issues": [] if final["passed"] and mode == "bedrock" else (issues if not final["passed"] else issues),
           "numbers_checked": final["numbers_checked"], "attempts": attempts, "attempts_log": log, "from_cache": from_cache,
           "fell_back_to_deterministic": use_model and mode == "offline"}
    _trace.record(trace, "explainer", "explain_outlook", "pipeline.explain_outlook", {"mode_requested": "bedrock" if use_model else "offline"},
                  {"mode": mode, "governance_passed": final["passed"], "numbers_checked": final["numbers_checked"]}, t0)
    return {"mode": mode, "short": text["short"], "long": text["long"], "governance": gov}


VERSION = "5"
CACHE_DIR = data_collector.ROOT / "data" / "cache" / "pipeline"


def _model_id() -> str:
    import os

    return os.environ.get("BEDROCK_MODEL_ID") or "default"


def _cache_path(ticker: str):
    return CACHE_DIR / f"{ticker.replace('/', '_')}.json"


def _cache_key(data: dict) -> str:
    return f"{data['end']}|{_model_id()}|v{VERSION}"


def _cache_load(ticker: str, data: dict) -> dict | None:
    import json

    try:
        c = json.loads(_cache_path(ticker).read_text(encoding="utf-8"))
        return c if c.get("key") == _cache_key(data) else None
    except (OSError, ValueError):
        return None


def _write_json(path, payload: dict) -> None:
    """Écriture atomique (fichier temporaire puis remplacement) ; l'échec d'écriture est ignoré : le cache est un confort."""
    import json
    import os
    import uuid

    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(f"{path.name}.{uuid.uuid4().hex[:8]}.tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
        os.replace(tmp, path)
    except OSError:
        pass


def _cache_save(ticker: str, data: dict, entry: dict) -> None:
    _write_json(_cache_path(ticker), {"key": _cache_key(data), **entry})


def _rank_save(ticker: str, data: dict, ranking: list) -> None:
    """Classement des sources (indépendant du profil) dans le fichier partagé du titre, sans effacer le reste d'une entrée valide."""
    entry = _cache_load(ticker, data) or {}
    entry.pop("key", None)
    _cache_save(ticker, data, {**entry, "ranking": ranking})


# ---- textes personnalisés : un dossier par profil (portefeuille ou compte) --------------------------------------------
_SAFE_ID = re.compile(r"[A-Za-z0-9_-]{1,64}")


def profiles_cache_dir():
    return CACHE_DIR / "profiles"


def _profile_dir(pid: str):
    if not _SAFE_ID.fullmatch(pid or ""):
        raise ValueError(f"identifiant de profil invalide : {pid!r}")
    return profiles_cache_dir() / pid


def _profile_path(pid: str, ticker: str):
    return _profile_dir(pid) / f"{ticker.replace('/', '_')}.json"


def _profile_key(data: dict, fingerprint: str) -> str:
    return f"{_cache_key(data)}|{fingerprint}"


def _profile_load(pid: str, ticker: str, data: dict, fingerprint: str) -> dict | None:
    import json

    try:
        c = json.loads(_profile_path(pid, ticker).read_text(encoding="utf-8"))
        return c if c.get("key") == _profile_key(data, fingerprint) else None
    except (OSError, ValueError):
        return None


def _profile_save(pid: str, ticker: str, data: dict, fingerprint: str, entry: dict) -> None:
    try:
        path = _profile_path(pid, ticker)
    except ValueError:
        return
    _write_json(path, {"key": _profile_key(data, fingerprint), **entry})


def clear_profile_cache(pid: str) -> int:
    """Supprime les textes Bedrock en cache d'un profil. Renvoie le nombre de fichiers supprimés."""
    import shutil

    try:
        d = _profile_dir(pid)
    except ValueError:
        return 0
    if not d.is_dir():
        return 0
    n = sum(1 for _ in d.glob("*.json"))
    shutil.rmtree(d, ignore_errors=True)
    return n


def run(ticker: str, quantity: float = 10, force_offline: bool = False, use_network: bool = False, use_cache: bool = True,
        profile=None, scope: tuple[str, str] | None = None) -> dict:
    """Exécute les quatre agents. Renvoie {"outlook": ..., "pipeline": {sources, fact_check, data, explanation, trace}}.
    Le classement des sources est mis en cache par titre (data/cache/pipeline/<titre>.json).
    Sans `profile` : le texte Bedrock validé est aussi mis en cache par titre (un titre n'appelle Bedrock qu'une fois).
    Avec `profile` : le texte est adapté au profil et mis en cache par profil si `scope` = (identifiant du profil, empreinte
    des paramètres) est fourni (data/cache/pipeline/profiles/<id>/<titre>.json ; voir `clear_profile_cache`)."""
    from .. import agents

    agents.load_env()
    trace: list[dict] = []
    live = not force_offline and agents.bedrock_available()
    personal = profile is not None
    # La clé de cache dépend de la fenêtre de données : on la lit d'abord via une première collecte (rapide, locale).
    cache, text_cache = None, None
    if live and use_cache:
        pre_sources = source_finder.find_sources(ticker)
        try:
            _, pre_meta = data_collector.collect(ticker, pre_sources, use_network=use_network)
            cache = _cache_load(ticker, pre_meta)
            text_cache = (_profile_load(scope[0], ticker, pre_meta, scope[1]) if scope else None) if personal else cache
        except ValueError:
            cache, text_cache = None, None
    if cache and cache.get("ranking"):
        rank_fn = lambda cands: cache["ranking"]  # noqa: E731
    else:
        rank_fn = source_finder.bedrock_ranker(ticker) if live else None
    sources = source_finder.find_sources(ticker, rank_fn=rank_fn, trace=trace)
    if cache and cache.get("ranking"):
        trace[-1]["outputs"]["from_cache"] = True
    series, meta = data_collector.collect(ticker, sources, use_network=use_network, trace=trace)
    fc = meta["fact_check"]
    data = {k: meta[k] for k in ("source_id", "currency", "start", "end", "n_obs", "missing_days", "notes")}
    data["blocked"] = meta.get("blocked", [])
    outlook = predictor.outlook(series, quantity=quantity, trace=trace, ticker=ticker)
    tc = text_cache
    explanation = explain_outlook(ticker, outlook, data, fc, trace, force_offline=force_offline, profile=profile,
                                  cached={"text": {"short": tc["short"], "long": tc["long"]}, "attempts": tc.get("attempts", [])} if tc and tc.get("short") else None)
    if live and use_cache:
        rk = next((t["outputs"] for t in trace if t["agent"] == "source_finder"), {})
        ranking = rk.get("ranking", []) if rk.get("mode") == "bedrock" and not rk.get("from_cache") else []
        fresh_text = explanation["mode"] == "bedrock" and not explanation["governance"]["from_cache"]
        if not personal:
            if fresh_text:
                _cache_save(ticker, data, {"ranking": ranking or (cache or {}).get("ranking", []), "short": explanation["short"], "long": explanation["long"],
                                           "attempts": explanation["governance"]["attempts_log"]})
        else:
            if ranking:
                _rank_save(ticker, data, ranking)
            if fresh_text and scope:
                _profile_save(scope[0], ticker, data, scope[1], {"short": explanation["short"], "long": explanation["long"],
                                                                "attempts": explanation["governance"]["attempts_log"]})
    return {"outlook": outlook, "pipeline": {"sources": sources, "fact_check": fc, "data": data, "explanation": explanation, "trace": trace}}
