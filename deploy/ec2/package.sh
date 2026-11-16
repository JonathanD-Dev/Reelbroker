#!/usr/bin/env bash
# À lancer sur votre poste, depuis n'importe où : construit l'interface et crée l'archive à envoyer sur l'instance.
#   bash deploy/ec2/package.sh            -> deploy/ec2/alphaforge-deploy.tar.gz
# L'archive contient seulement ce qui sert à l'exécution. Jamais : .env, .venv, node_modules, outputs/ (profils),
# data/cache/ (textes Bedrock), les sauvegardes. Les profils et le cache de l'instance ne sont donc jamais écrasés.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="$ROOT/deploy/ec2/alphaforge-deploy.tar.gz"
cd "$ROOT"

echo "1/3 Build de l'interface (web/dist)"
(cd web && npm run build)
grep -q '"/assets/' web/dist/index.html || { echo "web/dist/index.html ne pointe pas vers /assets/ : build inattendu" >&2; exit 1; }

echo "2/3 Archive"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/alphaforge-app/web" "$STAGE/alphaforge-app/data" "$STAGE/alphaforge-app/deploy"
cp -r alphaforge scripts requirements.txt "$STAGE/alphaforge-app/"
cp -r web/dist "$STAGE/alphaforge-app/web/"
cp -r data/raw data/processed "$STAGE/alphaforge-app/data/"
cp -r deploy/ec2 "$STAGE/alphaforge-app/deploy/"
# Nettoyage : caches Python, archive précédente, tout fichier de secrets.
find "$STAGE" -name '__pycache__' -type d -prune -exec rm -rf {} +
find "$STAGE" \( -name '*.pyc' -o -name '.env' -o -name '.env.*' -o -name '*.key' -o -name '*.pem' -o -name 'alphaforge-deploy.tar.gz' \) -delete
if grep -rIl --exclude-dir=web "AWS_BEARER_TOKEN_BEDROCK=[A-Za-z0-9]" "$STAGE" >/dev/null 2>&1; then
  echo "Une clé Bedrock semble présente dans l'archive : arrêt." >&2
  exit 1
fi
tar -czf "$OUT" -C "$STAGE" alphaforge-app

echo "3/3 Prêt : $OUT ($(du -h "$OUT" | cut -f1))"
