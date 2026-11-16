#!/usr/bin/env bash
# À lancer SUR l'instance EC2 (Amazon Linux 2023), après avoir décompressé l'archive de package.sh :
#   rm -rf alphaforge-app && tar -xzf alphaforge-deploy.tar.gz
#   sudo AWS_REGION=us-east-1 bash alphaforge-app/deploy/ec2/install.sh
# Variables facultatives :
#   BEDROCK_MODEL_ID   modèle (défaut : global.anthropic.claude-sonnet-4-6, celui de Strands ; doit correspondre à la politique IAM)
#   SITE_USER          active un mot de passe sur tout le site pour cet utilisateur (le mot de passe est demandé au clavier)
#   SITE_AUTH=off      retire le mot de passe du site
# Sert aussi aux mises à jour : relancer avec une nouvelle archive. Les profils (outputs/) et les textes Bedrock en cache
# (data/cache/) de l'instance sont conservés.
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "À lancer avec sudo." >&2; exit 1; }
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
[ -f "$SRC/scripts/serve_api.py" ] && [ -f "$SRC/web/dist/index.html" ] || { echo "Archive incomplète dans $SRC (scripts/serve_api.py, web/dist)." >&2; exit 1; }
HERE="$SRC/deploy/ec2"
APP=/opt/alphaforge
REGION="${AWS_REGION:-}"
[ -n "$REGION" ] || { echo "AWS_REGION est requis (ex. sudo AWS_REGION=us-east-1 bash install.sh)." >&2; exit 1; }
MODEL="${BEDROCK_MODEL_ID:-global.anthropic.claude-sonnet-4-6}"

echo "== 1/6 Paquets"
dnf install -y -q python3.11 nginx rsync
dnf install -y -q python3.11-pip || true  # facultatif : l'environnement virtuel apporte son propre pip
[ -n "${SITE_USER:-}" ] && dnf install -y -q httpd-tools

echo "== 2/6 Utilisateur et code ($APP)"
id alphaforge >/dev/null 2>&1 || useradd --system --home-dir /var/lib/alphaforge --shell /sbin/nologin alphaforge
mkdir -p "$APP"
# Le code est remplacé ; outputs/, data/cache/ et .venv/ ne sont ni écrasés ni supprimés.
rsync -a --delete --exclude '/outputs/' --exclude '/data/cache/' --exclude '/.venv/' "$SRC/" "$APP/"
mkdir -p "$APP/outputs" "$APP/data/cache"
chown -R root:root "$APP"
chown -R alphaforge:alphaforge "$APP/outputs" "$APP/data/cache"
chmod -R a+rX "$APP"

echo "== 3/6 Environnement Python"
[ -x "$APP/.venv/bin/python" ] || python3.11 -m venv "$APP/.venv"
"$APP/.venv/bin/python" -m pip install -q --upgrade pip
"$APP/.venv/bin/python" -m pip install -q -r "$APP/requirements.txt"
# Le service ne peut pas écrire dans le code (ProtectSystem) : on compile les .pyc ici.
"$APP/.venv/bin/python" -m compileall -q "$APP/alphaforge" "$APP/scripts" || true

echo "== 4/6 Configuration (/etc/alphaforge/alphaforge.env)"
mkdir -p /etc/alphaforge
cat > /etc/alphaforge/alphaforge.env <<EOF
# Aucune clé ici : Bedrock est appelé avec le rôle IAM de l'instance.
AWS_REGION=$REGION
AWS_DEFAULT_REGION=$REGION
BEDROCK_USE_IAM_ROLE=true
BEDROCK_MODEL_ID=$MODEL
EOF
[ -n "${BEDROCK_GUARDRAIL_ID:-}" ] && printf 'BEDROCK_GUARDRAIL_ID=%s\nBEDROCK_GUARDRAIL_VERSION=%s\n' "$BEDROCK_GUARDRAIL_ID" "${BEDROCK_GUARDRAIL_VERSION:-DRAFT}" >> /etc/alphaforge/alphaforge.env
chown root:alphaforge /etc/alphaforge/alphaforge.env
chmod 640 /etc/alphaforge/alphaforge.env

echo "== 5/6 nginx"
[ -f /etc/nginx/nginx.conf.orig-alphaforge ] || cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.orig-alphaforge
install -m 644 "$HERE/nginx.conf" /etc/nginx/nginx.conf
AUTH=/etc/nginx/alphaforge-auth.conf
if [ -n "${SITE_USER:-}" ]; then
  echo "Mot de passe du site pour « $SITE_USER » :"
  htpasswd -c -B /etc/nginx/alphaforge.htpasswd "$SITE_USER"
  chown root:nginx /etc/nginx/alphaforge.htpasswd
  chmod 640 /etc/nginx/alphaforge.htpasswd
  printf 'auth_basic "ReelBroker";\nauth_basic_user_file /etc/nginx/alphaforge.htpasswd;\n' > "$AUTH"
elif [ "${SITE_AUTH:-}" = "off" ] || [ ! -f "$AUTH" ]; then
  : > "$AUTH"  # pas de mot de passe (ou mot de passe retiré) ; une mise à jour simple garde le réglage existant
fi
nginx -t
systemctl enable -q nginx
systemctl restart nginx

echo "== 6/6 Service de l'API"
install -m 644 "$HERE/alphaforge-api.service" /etc/systemd/system/alphaforge-api.service
systemctl daemon-reload
systemctl enable -q alphaforge-api
systemctl restart alphaforge-api

echo "Attente de l'API..."
for _ in $(seq 1 90); do
  if curl -fsS http://127.0.0.1:8000/api/health >/tmp/af-health.json 2>/dev/null; then
    echo "API prête : $(cat /tmp/af-health.json)"
    break
  fi
  sleep 2
done
curl -fsS http://127.0.0.1:8000/api/health >/dev/null || { echo "L'API ne répond pas. Journal : sudo journalctl -u alphaforge-api -n 80" >&2; exit 1; }
grep -q '"connected":true' /tmp/af-health.json || echo "ATTENTION : l'API ne voit pas d'identifiants AWS (mode hors ligne)." >&2

echo "Vérification de Bedrock avec le rôle de l'instance (un appel minuscule au modèle)..."
if sudo -u alphaforge env $(grep -v '^#' /etc/alphaforge/alphaforge.env | xargs) HOME=/var/lib/alphaforge \
     bash -c "cd $APP && .venv/bin/python scripts/check_aws.py"; then
  echo "Installation terminée."
else
  echo "ATTENTION : l'appel d'essai à Bedrock a échoué (rôle IAM, politique ou BEDROCK_MODEL_ID). Le site fonctionne en mode hors ligne." >&2
fi
