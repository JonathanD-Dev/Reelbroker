# Déploiement sur AWS : une instance EC2 derrière CloudFront

```
Navigateur ──HTTPS──> CloudFront ──HTTP──> EC2 (nginx :80) ─┬─ /       -> web/dist (interface)
                                                            └─ /api/  -> uvicorn 127.0.0.1:8000 (FastAPI) -> Amazon Bedrock
```

- **Une seule instance.** L'API garde ses caches en mémoire, et les profils (`outputs/profiles.json`) et les textes Bedrock (`data/cache/`) sur disque. Deux instances auraient chacune leurs propres profils.
- **Aucune clé Bedrock sur le serveur.** L'API appelle Bedrock avec le rôle IAM de l'instance (`BEDROCK_USE_IAM_ROLE=true`). Ne copiez jamais `.env` sur l'instance.
- **HTTPS par CloudFront**, avec l'adresse `https://dxxxx.cloudfront.net` et sans nom de domaine. Le port 80 de l'instance n'accepte que les serveurs de CloudFront.
- **Plafonds de coût dans nginx**, pour tous les visiteurs ensemble :
  - créations et modifications de profil : 6 par minute (pointe de 10) ;
  - fiches, vérification d'une idée et pipeline : 30 par minute (pointe de 20) ;
  - au-delà, l'API répond 429.

| Fichier | Rôle |
|---|---|
| `package.sh` | Sur votre poste : build de l'interface et archive `alphaforge-deploy.tar.gz`. L'archive exclut `.env`, les profils et le cache. |
| `install.sh` | Sur l'instance : installation, puis mises à jour. Garde les profils et le cache. |
| `nginx.conf` | Interface, redirection de `/api/`, plafonds, mot de passe facultatif |
| `alphaforge-api.service` | Service systemd de l'API (utilisateur dédié, système en lecture seule sauf `outputs/` et `data/cache/`) |
| `iam/*.json` | Rôle de l'instance : appel du modèle Bedrock choisi uniquement |
| `cloudfront.json` | Distribution CloudFront (cache désactivé, en-têtes transmis à nginx) |

**Coût indicatif** (us-east-1, à la demande) :
- t3.small : environ 15 $ par mois ;
- disque gp3 de 20 Go : environ 1,60 $ par mois ;
- adresse IPv4 publique : environ 3,65 $ par mois ;
- CloudFront : dans l'offre gratuite pour ce trafic ;
- Bedrock : selon l'usage.

Arrêter l'instance supprime le coût de calcul, mais pas celui du disque ni de l'adresse IP.

## Prérequis

- AWS CLI v2 connectée au compte, par exemple avec `aws login` ou `aws sso login`, et des droits sur IAM, EC2 et CloudFront.
- L'accès au modèle Bedrock déjà activé dans le compte. Si `scripts/check_aws.py` fonctionne avec la clé d'équipe, c'est le cas.
- Commandes écrites pour bash, lancées depuis la racine du projet.

```bash
export AWS_REGION=us-east-1
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
MODEL_ID=global.anthropic.claude-sonnet-4-6   # modèle par défaut de Strands, fixé explicitement
MODEL_NAME=${MODEL_ID#global.}
```

## 1. Rôle IAM de l'instance

```bash
aws iam create-role --role-name alphaforge-ec2 \
  --assume-role-policy-document file://deploy/ec2/iam/trust-policy.json
sed -e "s/__REGION__/$AWS_REGION/g" -e "s/__ACCOUNT_ID__/$ACCOUNT_ID/g" -e "s/__MODEL_NAME__/$MODEL_NAME/g" \
  deploy/ec2/iam/bedrock-policy.json > /tmp/alphaforge-bedrock-policy.json
aws iam put-role-policy --role-name alphaforge-ec2 --policy-name bedrock-invoke \
  --policy-document file:///tmp/alphaforge-bedrock-policy.json
aws iam create-instance-profile --instance-profile-name alphaforge-ec2
aws iam add-role-to-instance-profile --instance-profile-name alphaforge-ec2 --role-name alphaforge-ec2
sleep 15   # le temps que le profil d'instance soit visible par EC2
```

La politique suit l'exemple d'AWS pour l'inférence inter-régions « global ». Elle ne permet d'appeler que ce modèle, depuis cette région.

## 2. Groupe de sécurité, clé SSH, instance, adresse fixe

```bash
VPC_ID=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)
SG_ID=$(aws ec2 create-security-group --group-name alphaforge-web --description "ReelBroker" \
  --vpc-id "$VPC_ID" --query GroupId --output text)
# Port 80 : CloudFront seulement
CF_PL=$(aws ec2 describe-managed-prefix-lists \
  --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing \
  --query 'PrefixLists[0].PrefixListId' --output text)
aws ec2 authorize-security-group-ingress --group-id "$SG_ID" \
  --ip-permissions "IpProtocol=tcp,FromPort=80,ToPort=80,PrefixListIds=[{PrefixListId=$CF_PL}]"
# Port 22 : votre adresse seulement
MY_IP=$(curl -s https://checkip.amazonaws.com)
aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --protocol tcp --port 22 --cidr "$MY_IP/32"

# Clé SSH, hors du projet
aws ec2 create-key-pair --key-name alphaforge --query KeyMaterial --output text > ~/.ssh/alphaforge.pem
chmod 400 ~/.ssh/alphaforge.pem

INSTANCE_ID=$(aws ec2 run-instances \
  --image-id resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --instance-type t3.small --key-name alphaforge --security-group-ids "$SG_ID" \
  --iam-instance-profile Name=alphaforge-ec2 --metadata-options HttpTokens=required \
  --block-device-mappings 'DeviceName=/dev/xvda,Ebs={VolumeSize=20,VolumeType=gp3,Encrypted=true}' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=alphaforge}]' \
  --query 'Instances[0].InstanceId' --output text)
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID"

# Adresse fixe : CloudFront pointe vers son nom DNS, qui ne change plus si l'instance redémarre
ALLOC_ID=$(aws ec2 allocate-address --domain vpc --query AllocationId --output text)
aws ec2 associate-address --instance-id "$INSTANCE_ID" --allocation-id "$ALLOC_ID"
HOST=$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PublicDnsName' --output text)
echo "$HOST"
```

## 3. Envoi du code et installation

```bash
bash deploy/ec2/package.sh
scp -i ~/.ssh/alphaforge.pem deploy/ec2/alphaforge-deploy.tar.gz ec2-user@"$HOST":
ssh -i ~/.ssh/alphaforge.pem ec2-user@"$HOST" \
  "rm -rf alphaforge-app && tar -xzf alphaforge-deploy.tar.gz && sudo AWS_REGION=$AWS_REGION BEDROCK_MODEL_ID=$MODEL_ID bash alphaforge-app/deploy/ec2/install.sh"
```

Le script se termine par un appel d'essai à Bedrock avec le rôle de l'instance. Si cet appel échoue, le site fonctionne quand même, sans les textes du modèle. Vérifiez alors la politique IAM et `BEDROCK_MODEL_ID`.

Pour protéger tout le site par un mot de passe, ajoutez `SITE_USER=demo` après `sudo`. Le mot de passe vous est alors demandé au clavier : utilisez `ssh -t`. Pour le retirer, ajoutez `SITE_AUTH=off`.

## 4. CloudFront (HTTPS)

```bash
sed -e "s/__ORIGIN_DOMAIN__/$HOST/" -e "s/__CALLER_REFERENCE__/alphaforge-$(date +%s)/" \
  deploy/ec2/cloudfront.json > /tmp/alphaforge-cloudfront.json
aws cloudfront create-distribution --distribution-config file:///tmp/alphaforge-cloudfront.json \
  --query 'Distribution.[Id,DomainName]' --output text
```

Comptez environ 5 minutes pour le déploiement. Le site est ensuite sur `https://<DomainName>`. Vérifiez à l'adresse `https://<DomainName>/api/health`, qui doit indiquer `"connected":true`.

## Mise à jour

Relancez l'étape 3 : `package.sh`, puis `scp` et `install.sh`. Le cache de CloudFront est désactivé, donc aucune invalidation n'est nécessaire.

## Exploitation

```bash
ssh -i ~/.ssh/alphaforge.pem ec2-user@"$HOST"
sudo journalctl -u alphaforge-api -f          # journal de l'API
sudo systemctl restart alphaforge-api         # redémarrage (caches en mémoire vidés)
sudo tail -f /var/log/nginx/access.log        # requêtes (les 429 = plafond atteint)
```

Pour vider les textes Bedrock de l'instance, déplacez `/opt/alphaforge/data/cache` ailleurs, recréez le dossier vide (propriétaire `alphaforge`), puis redémarrez l'API.

## Limites connues

- Entre CloudFront et l'instance, le trafic passe en HTTP sur Internet, mot de passe du site compris. Pour aller plus loin : origine VPC CloudFront, avec l'instance dans un sous-réseau privé.
- Les plafonds limitent le coût, mais un visiteur peut occuper tout le plafond. Pour un site public : AWS WAF (règle de débit par adresse) et une alerte AWS Budgets.
- Aucune sauvegarde automatique de `outputs/profiles.json`. Un instantané EBS régulier (Data Lifecycle Manager) suffit.

## Tout supprimer

```bash
aws cloudfront get-distribution-config --id <ID> > /tmp/cf.json   # désactiver, attendre, puis supprimer (console : plus simple)
aws ec2 terminate-instances --instance-ids "$INSTANCE_ID" && aws ec2 wait instance-terminated --instance-ids "$INSTANCE_ID"
aws ec2 release-address --allocation-id "$ALLOC_ID"
aws ec2 delete-security-group --group-id "$SG_ID"
aws ec2 delete-key-pair --key-name alphaforge
aws iam remove-role-from-instance-profile --instance-profile-name alphaforge-ec2 --role-name alphaforge-ec2
aws iam delete-instance-profile --instance-profile-name alphaforge-ec2
aws iam delete-role-policy --role-name alphaforge-ec2 --policy-name bedrock-invoke
aws iam delete-role --role-name alphaforge-ec2
```
