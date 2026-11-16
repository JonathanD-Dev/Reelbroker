"""Vérifie l'accès à Amazon Bedrock, puis lance les agents sur une demande d'essai.

    .venv\\Scripts\\python scripts\\check_aws.py            vérifie la connexion (un appel minuscule au modèle)
    .venv\\Scripts\\python scripts\\check_aws.py --agents   lance en plus la chaîne complète sur « 20 % dans Tesla » pour Robert

Lit le fichier .env à la racine. N'affiche jamais la clé.
"""
import sys
import warnings

sys.path.insert(0, ".")
warnings.filterwarnings("ignore")
sys.stdout.reconfigure(encoding="utf-8")

from alphaforge import agents as ag  # noqa: E402

ag.load_env()
s = ag.aws_summary()
print("Identifiants AWS :", "présents" if s["connecte"] else "ABSENTS")
print("Région           :", s["region"])
print("Modèle           :", s["modele"])
print("Garde-fou Bedrock:", "configuré" if s["garde_fou"] else "non configuré (facultatif)")
if not s["connecte"]:
    print("\nAucun identifiant trouvé. Copiez .env.example vers .env et placez-y la clé d'API Bedrock du compte d'équipe.")
    sys.exit(1)

try:
    from strands import Agent

    reply = Agent(model=ag.make_model(), callback_handler=None)("Réponds par le seul mot : prêt")
    print("\nAppel d'essai réussi. Réponse du modèle :", str(reply).strip()[:80])
except Exception as e:
    print(f"\nÉCHEC de l'appel d'essai : {type(e).__name__}: {e}")
    print("Pistes : modèle non activé dans ce compte ou cette région (essayez AWS_REGION=us-west-2 ou un autre BEDROCK_MODEL_ID), clé expirée, quota atteint.")
    try:
        import boto3

        client = boto3.client("bedrock", **({"region_name": s["region"]} if "défaut" not in s["region"] else {}))
        ids = sorted(p["inferenceProfileId"] for p in client.list_inference_profiles().get("inferenceProfileSummaries", []))
        print("Profils d'inférence visibles dans cette région :", *ids[:40], sep="\n  ")
    except Exception as e2:
        print("Impossible de lister les modèles :", type(e2).__name__, str(e2)[:200])
    sys.exit(2)

if "--agents" in sys.argv:
    import alphaforge as af
    from alphaforge import decide as d
    from alphaforge import questionnaire as q

    px, u = af.load_starter()
    meta = af.starter_metadata(u)
    profile, _ = q.to_profile(q.build_declared(q.PERSONAS["Robert"]["answers"]), "Robert")
    opts = d.options(px, profile, meta)
    base = next(o for o in opts if o["key"] == "aligned")["result"]["weights"]
    r = ag.run("J'ai vu passer Tesla partout, je veux y mettre 20 % de mon portefeuille", ag.Context(px, u, meta, profile, base, 10000.0, opts), level="standard")
    print("\nMode :", r["mode"])
    for st in r["steps"]:
        print(f"  [{st['statut']}] {st['agent']} — {st['role']} : {st['detail'][:160]}")
    print("\nOutils appelés :", [t["outil"] for t in r["trace"]])
    print("Gouvernance :", r["governance"])
    print("\n--- Message ---\n" + r["message"])
