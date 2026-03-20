#!/usr/bin/env bash
set -euo pipefail

# ╔══════════════════════════════════════════════════════════════╗
# ║  Instalador Self-Host — Funil App                            ║
# ║  Dois domínios: público (links) + dashboard (admin/API)      ║
# ║  Detecta Traefik automaticamente e configura containers      ║
# ╚══════════════════════════════════════════════════════════════╝

APP_DIR="/opt/funnel-app"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
ask()  { echo -en "${CYAN}[?]${NC} $1: "; }
info() { echo -e "${CYAN}[i]${NC} $1"; }

# ── Verificar root ────────────────────────────────────────
[ "$EUID" -ne 0 ] && err "Execute como root: sudo bash install.sh"

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       Instalador Self-Host — Funil App           ║${NC}"
echo -e "${CYAN}║     Dois domínios: público + dashboard           ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ── Coletar informações ──────────────────────────────────
ask "Domínio PÚBLICO (links de compartilhamento, ex: meulink.com.br)"
read -r PUBLIC_DOMAIN
[ -z "$PUBLIC_DOMAIN" ] && err "Domínio público obrigatório"

ask "Domínio do DASHBOARD/API (painel admin, ex: admin.meusite.com.br)"
read -r DASHBOARD_DOMAIN
[ -z "$DASHBOARD_DOMAIN" ] && err "Domínio do dashboard obrigatório"

ask "Email do administrador"
read -r ADMIN_EMAIL
[ -z "$ADMIN_EMAIL" ] && err "Email obrigatório"

ask "Senha do administrador (mín. 8 caracteres)"
read -rs ADMIN_PASS
echo ""
[ ${#ADMIN_PASS} -lt 8 ] && err "Senha deve ter no mínimo 8 caracteres"

ask "Email para SSL (Let's Encrypt)"
read -r SSL_EMAIL
[ -z "$SSL_EMAIL" ] && err "Email SSL obrigatório"

# ── Gerar segredos ───────────────────────────────────────
DB_PASS=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)
JWT_SECRET=$(openssl rand -base64 64 | tr -dc 'a-zA-Z0-9' | head -c 64)
ANON_KEY="self-host-anon-key-$(openssl rand -hex 16)"

PG_PORT="5432"

log "Segredos gerados com sucesso"

# ══════════════════════════════════════════════════════════
# 1. DEPENDÊNCIAS DO SISTEMA
# ══════════════════════════════════════════════════════════
log "Instalando dependências do sistema..."

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq

# Node.js 20
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi
log "Node.js $(node -v)"

# PostgreSQL 16
if ! command -v psql &>/dev/null; then
  sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg
  apt-get update -qq
  apt-get install -y -qq postgresql-16
fi
log "PostgreSQL $(psql --version | head -1)"

# Nginx + Certbot + PM2 + dnsutils
apt-get install -y -qq nginx certbot python3-certbot-nginx uuid-runtime dnsutils
npm install -g pm2 2>/dev/null || true
log "Nginx, Certbot, PM2 instalados"

# ══════════════════════════════════════════════════════════
# 2. POSTGRESQL — BANCO E USUARIO
# ══════════════════════════════════════════════════════════
log "Configurando PostgreSQL..."

PG_PORT=$(sudo -u postgres psql -tAc "SHOW port;" 2>/dev/null | tr -d '[:space:]')
[ -z "$PG_PORT" ] && PG_PORT="5432"
log "Porta do PostgreSQL detectada: ${PG_PORT}"

sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='funnel_user'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE ROLE funnel_user WITH LOGIN PASSWORD '${DB_PASS}' BYPASSRLS;"
sudo -u postgres psql -c "ALTER ROLE funnel_user BYPASSRLS;" 2>/dev/null

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='funnel_app'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE funnel_app OWNER funnel_user;"

sudo -u postgres psql -d funnel_app -c "
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END
\$\$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT anon, authenticated, service_role TO funnel_user;
"
log "Banco de dados configurado"

# ══════════════════════════════════════════════════════════
# 3. EXECUTAR MIGRATIONS
# ══════════════════════════════════════════════════════════
log "Executando migrations..."

sudo -u postgres psql -d funnel_app -c "
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  encrypted_password TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID LANGUAGE sql STABLE
AS \$\$ SELECT CASE WHEN NULLIF(current_setting('request.jwt.claims', true), '') IS NULL THEN NULL ELSE NULLIF((current_setting('request.jwt.claims', true)::jsonb->>'sub'), '')::uuid END \$\$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role, funnel_user;
GRANT SELECT ON auth.users TO anon, authenticated, service_role, funnel_user;
"

for migration in "$REPO_DIR"/supabase/migrations/*.sql; do
  if [ -f "$migration" ]; then
    filename=$(basename "$migration")
    FILTERED=$(sed '/pg_cron/d; /pg_net/d' "$migration")
    echo "$FILTERED" | sudo -u postgres psql -d funnel_app -v ON_ERROR_STOP=0 2>/dev/null || true
    log "Migration: $filename"
  fi
done

sudo -u postgres psql -d funnel_app -c "
GRANT ALL ON ALL TABLES IN SCHEMA public TO funnel_user, service_role;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_settings TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.avatar_gallery TO authenticated;
GRANT ALL ON public.funnels TO authenticated;
GRANT ALL ON public.funnel_preview_images TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.funnel_sessions TO authenticated;
GRANT SELECT, INSERT ON public.funnel_session_events TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON public.funnels TO anon;
GRANT SELECT ON public.funnel_preview_images TO anon;
GRANT SELECT, INSERT, UPDATE ON public.funnel_sessions TO anon;
GRANT SELECT, INSERT ON public.funnel_session_events TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO funnel_user, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO funnel_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
"
log "Migrations executadas"

# ══════════════════════════════════════════════════════════
# 4. CRIAR USUÁRIO ADMIN
# ══════════════════════════════════════════════════════════
log "Criando usuário administrador..."

mkdir -p "$APP_DIR"
cd "$APP_DIR"
npm init -y 2>/dev/null || true
npm install bcryptjs jsonwebtoken pg 2>/dev/null

ADMIN_ID=$(uuidgen)
ADMIN_HASH=$(node -e "const b=require('$APP_DIR/node_modules/bcryptjs');b.hash(process.argv[1],10).then(h=>console.log(h))" "$ADMIN_PASS")

sudo -u postgres psql -d funnel_app -c "
INSERT INTO auth.users (id, email, encrypted_password)
VALUES ('${ADMIN_ID}', '${ADMIN_EMAIL}', '${ADMIN_HASH}')
ON CONFLICT (email) DO UPDATE SET encrypted_password = EXCLUDED.encrypted_password;
"
log "Admin criado: ${ADMIN_EMAIL}"

# ══════════════════════════════════════════════════════════
# 5. INSTALAR PostgREST
# ══════════════════════════════════════════════════════════
log "Instalando PostgREST..."

PGRST_VERSION="v12.2.3"
ARCH=$(dpkg --print-architecture)
if [ "$ARCH" = "amd64" ]; then PGRST_ARCH="linux-static-x64"; else PGRST_ARCH="linux-static-aarch64"; fi

if [ ! -f /usr/local/bin/postgrest ]; then
  curl -fsSL "https://github.com/PostgREST/postgrest/releases/download/${PGRST_VERSION}/postgrest-${PGRST_VERSION}-${PGRST_ARCH}.tar.xz" \
    | tar xJf - -C /usr/local/bin/
  chmod +x /usr/local/bin/postgrest
fi
log "PostgREST instalado"

log "Auth será gerenciado diretamente pelo API server (sem GoTrue)"

# ══════════════════════════════════════════════════════════
# 6. CONFIGURAR APLICAÇÃO
# ══════════════════════════════════════════════════════════
log "Configurando aplicação..."

cp "$REPO_DIR/self-host/api-server.js" "$APP_DIR/"
cp "$REPO_DIR/self-host/ecosystem.config.js" "$APP_DIR/"

cat > "$APP_DIR/.env" <<ENVEOF
PUBLIC_DOMAIN=${PUBLIC_DOMAIN}
DASHBOARD_DOMAIN=${DASHBOARD_DOMAIN}
DB_HOST=127.0.0.1
DB_PORT=${PG_PORT}
DB_NAME=funnel_app
DB_USER=funnel_user
DB_PASS=${DB_PASS}
API_PORT=4000
API_JWT_SECRET=${JWT_SECRET}
ANON_KEY=${ANON_KEY}
PGRST_DB_URI=postgres://funnel_user:${DB_PASS}@127.0.0.1:${PG_PORT}/funnel_app
PGRST_DB_SCHEMAS=public
PGRST_DB_ANON_ROLE=anon
PGRST_JWT_SECRET=${JWT_SECRET}
PGRST_SERVER_PORT=3100
ENVEOF

cat > "$APP_DIR/postgrest.conf" <<PGCONF
db-uri = "postgres://funnel_user:${DB_PASS}@127.0.0.1:${PG_PORT}/funnel_app"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "${JWT_SECRET}"
server-port = 3100
PGCONF

log "Configuração criada"

# ══════════════════════════════════════════════════════════
# 7. BUILD DO FRONTEND
# ══════════════════════════════════════════════════════════
log "Buildando frontend..."

cd "$REPO_DIR"
npm ci 2>/dev/null || npm install 2>/dev/null

cat > "$REPO_DIR/.env.local" <<BUILDENV
VITE_SUPABASE_URL=https://${DASHBOARD_DOMAIN}
VITE_SUPABASE_PUBLISHABLE_KEY=${ANON_KEY}
VITE_SUPABASE_PROJECT_ID=self-hosted
VITE_PUBLIC_DOMAIN=https://${PUBLIC_DOMAIN}
BUILDENV

npm run build
cp -r "$REPO_DIR/dist" "$APP_DIR/dist"
log "Frontend buildado e copiado"

# ══════════════════════════════════════════════════════════
# 8. VERIFICAR CONFLITOS DE PORTAS
# ══════════════════════════════════════════════════════════
log "Verificando portas necessárias..."

for PORT in 3100 4000; do
  PID=$(lsof -ti :"$PORT" 2>/dev/null || true)
  if [ -n "$PID" ]; then
    PROC=$(ps -p "$PID" -o comm= 2>/dev/null || echo "desconhecido")
    warn "Porta $PORT já está em uso pelo processo '$PROC' (PID $PID)."
    ask "Deseja continuar mesmo assim? (s/N)"
    read -r CONFIRM
    [ "$CONFIRM" != "s" ] && [ "$CONFIRM" != "S" ] && err "Instalação cancelada. Libere a porta $PORT primeiro."
  fi
done
log "Portas disponíveis (ou confirmadas pelo usuário)"

# ══════════════════════════════════════════════════════════
# 9. INICIAR SERVIÇOS COM PM2
# ══════════════════════════════════════════════════════════
log "Iniciando serviços..."

cd "$APP_DIR"
set -a; source "$APP_DIR/.env"; set +a

pm2 delete funnel-api 2>/dev/null || true
pm2 delete funnel-postgrest 2>/dev/null || true
pm2 delete funnel-gotrue 2>/dev/null || true

pm2 start ecosystem.config.js
pm2 save

if ! pm2 startup systemd -u root --hp /root 2>&1 | grep -q "already"; then
  pm2 startup systemd -u root --hp /root 2>/dev/null || true
fi
log "Serviços iniciados (API + PostgREST)"

# ══════════════════════════════════════════════════════════
# 10. DETECTAR PROXY REVERSO: TRAEFIK vs NGINX
# ══════════════════════════════════════════════════════════
TRAEFIK_OWNS_443=$(ss -ltnp 2>/dev/null | grep ':443' | grep -c 'docker-proxy' || true)

if [ "$TRAEFIK_OWNS_443" -gt 0 ]; then
  # ── MODO TRAEFIK ────────────────────────────────────────
  info "Traefik detectado na porta 443 — configurando containers..."

  # Gerar ROUTER_PREFIX único
  ROUTER_PREFIX="funnel-$(echo "$DASHBOARD_DOMAIN" | sed 's/[^a-zA-Z0-9]/-/g' | tr '[:upper:]' '[:lower:]')"
  log "Router prefix: ${ROUTER_PREFIX}"

  # Verificar API escutando
  sleep 2
  API_LISTEN=$(ss -ltnp | grep ":4000" || true)
  if echo "$API_LISTEN" | grep -q "127.0.0.1:4000"; then
    warn "API escutando em 127.0.0.1:4000 — Docker NÃO alcança!"
    warn "Corrija server.listen() para '0.0.0.0' em $APP_DIR/api-server.js"
  fi

  # Detectar rede do Traefik
  TRAEFIK_NETWORK=""
  TRAEFIK_CONTAINER=$(docker ps --format '{{.Names}}' | grep -i traefik | head -1 || true)
  if [ -n "$TRAEFIK_CONTAINER" ]; then
    TRAEFIK_NETWORK=$(docker inspect "$TRAEFIK_CONTAINER" \
      --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null \
      | tr ' ' '\n' | grep -v '^bridge$' | grep -v '^$' | head -1 || true)
  fi
  if [ -z "$TRAEFIK_NETWORK" ]; then
    for net in traefik-net traefik proxy web; do
      if docker network inspect "$net" >/dev/null 2>&1; then
        TRAEFIK_NETWORK="$net"; break
      fi
    done
  fi
  if [ -z "$TRAEFIK_NETWORK" ]; then
    docker network create traefik-net 2>/dev/null || true
    TRAEFIK_NETWORK="traefik-net"
  fi
  log "Rede do Traefik: ${TRAEFIK_NETWORK}"

  # Remover containers antigos
  for c in funnel-spa funnel-nginx-proxy funnel-api-proxy funnel-rest-proxy; do
    if docker ps -a --format '{{.Names}}' | grep -q "^${c}$"; then
      docker stop "$c" 2>/dev/null || true
      docker rm "$c" 2>/dev/null || true
    fi
  done

  # Gerar docker-compose.yml
  COMPOSE_FILE="$APP_DIR/docker-compose.yml"
  sed -e "s/__DASHBOARD_DOMAIN__/${DASHBOARD_DOMAIN}/g" \
      -e "s/__PUBLIC_DOMAIN__/${PUBLIC_DOMAIN}/g" \
      -e "s/__ROUTER_PREFIX__/${ROUTER_PREFIX}/g" \
      "$REPO_DIR/self-host/docker-compose.traefik.yml.template" > "$COMPOSE_FILE"
  if [ "$TRAEFIK_NETWORK" != "traefik-net" ]; then
    sed -i "s/traefik-net/${TRAEFIK_NETWORK}/g" "$COMPOSE_FILE"
  fi

  # Subir containers
  cd "$APP_DIR"
  docker compose up -d --force-recreate 2>/dev/null || docker-compose up -d --force-recreate 2>/dev/null
  log "Containers Traefik iniciados (funnel-spa, funnel-api-proxy, funnel-rest-proxy)"

  # Desativar Nginx para evitar conflito
  warn "Traefik gerencia SSL/rotas — Nginx não será usado para este app."

else
  # ── MODO NGINX ──────────────────────────────────────────
  log "Nginx gerenciará SSL e roteamento..."

  EXISTING_SITES=$(ls /etc/nginx/sites-enabled/ 2>/dev/null | grep -v funnel-app || true)
  if [ -n "$EXISTING_SITES" ]; then
    warn "Sites Nginx existentes (NÃO serão modificados):"
    for s in $EXISTING_SITES; do echo "       - $s"; done
  fi

  ACME_ROOT="/var/www/acme-challenge"
  mkdir -p "$ACME_ROOT/.well-known/acme-challenge"
  chown -R www-data:www-data "$ACME_ROOT"
  chmod -R 755 "$ACME_ROOT"

  # Remover default_server de outros sites
  for SITE_FILE in /etc/nginx/sites-enabled/*; do
    [ "$(basename "$SITE_FILE")" = "funnel-app" ] && continue
    [ ! -f "$SITE_FILE" ] && continue
    REAL_FILE=$(readlink -f "$SITE_FILE")
    if grep -q "listen 80.*default_server" "$REAL_FILE" 2>/dev/null; then
      warn "Removendo 'default_server' temporariamente de $(basename "$SITE_FILE")"
      cp "$REAL_FILE" "${REAL_FILE}.bak-funnel"
      sed -i 's/listen 80 default_server;/listen 80;/g' "$REAL_FILE"
    fi
  done

  # Config ACME catch-all
  cat > /etc/nginx/conf.d/000-funnel-acme.conf <<ACME_CONF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    location ^~ /.well-known/acme-challenge/ {
        alias ${ACME_ROOT}/.well-known/acme-challenge/;
        default_type text/plain;
        try_files \$uri =404;
    }

    location / {
        return 444;
    }
}
ACME_CONF

  cat > /etc/nginx/sites-available/funnel-app <<NGINX_TEMP
server {
    listen 80;
    server_name ${PUBLIC_DOMAIN} ${DASHBOARD_DOMAIN};

    location ^~ /.well-known/acme-challenge/ {
        alias ${ACME_ROOT}/.well-known/acme-challenge/;
        default_type text/plain;
        try_files \$uri =404;
    }

    root ${APP_DIR}/dist;
    index index.html;
    location / { try_files \$uri \$uri/ /index.html; }
}
NGINX_TEMP

  ln -sf /etc/nginx/sites-available/funnel-app /etc/nginx/sites-enabled/

  reload_nginx() {
    if ! nginx -t 2>/dev/null; then
      err "Configuração Nginx inválida!"
    fi
    if systemctl is-active --quiet nginx; then
      systemctl reload nginx
    elif pidof nginx > /dev/null 2>&1; then
      kill -HUP "$(pidof -s nginx)"
    else
      systemctl start nginx
    fi
  }

  reload_nginx
  log "Nginx recarregado"

  obtain_cert() {
    local DOMAINS="$1" LABEL="$2"
    if certbot certonly --webroot -w "$ACME_ROOT" \
      $DOMAINS --email "${SSL_EMAIL}" --agree-tos --non-interactive; then
      log "SSL obtido via webroot para ${LABEL}"
      return 0
    fi
    warn "Webroot falhou para ${LABEL}. Tentando standalone..."
    ask "Deseja tentar o modo standalone? (s/N)"
    read -r STANDALONE_CONFIRM
    if [ "$STANDALONE_CONFIRM" = "s" ] || [ "$STANDALONE_CONFIRM" = "S" ]; then
      systemctl stop nginx 2>/dev/null || true
      if certbot certonly --standalone \
        $DOMAINS --email "${SSL_EMAIL}" --agree-tos --non-interactive; then
        log "SSL obtido via standalone para ${LABEL}"
        systemctl start nginx 2>/dev/null || true
        return 0
      fi
      systemctl start nginx 2>/dev/null || true
    fi
    warn "Certbot falhou para ${LABEL}. Verifique DNS."
    return 1
  }

  verify_acme_webroot() {
    local DOMAIN="$1"
    local TEST_TOKEN="lovable-test-$(date +%s)"
    local TEST_FILE="$ACME_ROOT/.well-known/acme-challenge/${TEST_TOKEN}"
    echo "acme-test-ok" > "$TEST_FILE"
    chown www-data:www-data "$TEST_FILE"

    local LOCAL_CODE
    LOCAL_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: ${DOMAIN}" "http://127.0.0.1/.well-known/acme-challenge/${TEST_TOKEN}" 2>/dev/null || echo "000")
    if [ "$LOCAL_CODE" != "200" ]; then
      rm -f "$TEST_FILE"
      warn "Teste LOCAL falhou para ${DOMAIN} (HTTP ${LOCAL_CODE})."
      return 1
    fi
    log "Teste local OK para ${DOMAIN}"

    local PUBLIC_CODE
    PUBLIC_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://${DOMAIN}/.well-known/acme-challenge/${TEST_TOKEN}" 2>/dev/null || echo "000")
    rm -f "$TEST_FILE"
    if [ "$PUBLIC_CODE" != "200" ]; then
      warn "Teste PÚBLICO falhou para ${DOMAIN} (HTTP ${PUBLIC_CODE})."
      return 1
    fi
    log "Webroot OK para ${DOMAIN}"
    return 0
  }

  # Obter certificados SSL
  log "Obtendo certificados SSL para domínio público..."
  PUBLIC_CERT_DOMAINS="-d ${PUBLIC_DOMAIN}"
  if dig +short "www.${PUBLIC_DOMAIN}" A 2>/dev/null | grep -q .; then
    PUBLIC_CERT_DOMAINS="$PUBLIC_CERT_DOMAINS -d www.${PUBLIC_DOMAIN}"
    log "www.${PUBLIC_DOMAIN} encontrado, incluindo no certificado"
  fi
  verify_acme_webroot "${PUBLIC_DOMAIN}" && obtain_cert "$PUBLIC_CERT_DOMAINS" "${PUBLIC_DOMAIN}" || true

  log "Obtendo certificados SSL para dashboard..."
  verify_acme_webroot "${DASHBOARD_DOMAIN}" && obtain_cert "-d ${DASHBOARD_DOMAIN}" "${DASHBOARD_DOMAIN}" || true

  # Limpar config ACME temporária
  rm -f /etc/nginx/conf.d/000-funnel-acme.conf
  for BAK_FILE in /etc/nginx/sites-available/*.bak-funnel; do
    [ ! -f "$BAK_FILE" ] && continue
    ORIG_FILE="${BAK_FILE%.bak-funnel}"
    mv "$BAK_FILE" "$ORIG_FILE"
    log "Restaurado backup: $(basename "$ORIG_FILE")"
  done

  # Aplicar config final com SSL
  if [ -f "/etc/letsencrypt/live/${PUBLIC_DOMAIN}/fullchain.pem" ] && \
     [ -f "/etc/letsencrypt/live/${DASHBOARD_DOMAIN}/fullchain.pem" ]; then
    sed -e "s/__PUBLIC_DOMAIN__/${PUBLIC_DOMAIN}/g" \
        -e "s/__DASHBOARD_DOMAIN__/${DASHBOARD_DOMAIN}/g" \
        "$REPO_DIR/self-host/nginx.conf.template" > /etc/nginx/sites-available/funnel-app
    reload_nginx
    log "Nginx configurado com SSL"
  else
    warn "Certificados SSL incompletos. Nginx rodando apenas em HTTP."
  fi
fi

# ══════════════════════════════════════════════════════════
# 11. CRON PARA ROTAÇÃO DE IMAGENS
# ══════════════════════════════════════════════════════════
CRON_CMD="0 * * * * curl -s -X POST http://127.0.0.1:4000/rotate-preview-images > /dev/null 2>&1"
(crontab -l 2>/dev/null | grep -v "rotate-preview-images"; echo "$CRON_CMD") | crontab -
log "Cron de rotação configurado (a cada hora)"

# ══════════════════════════════════════════════════════════
# 12. SMOKE TESTS
# ══════════════════════════════════════════════════════════
info "Validando serviços..."
sleep 3

HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4000/health 2>/dev/null || echo "000")
if [ "$HEALTH" = "200" ]; then
  log "API respondendo (HTTP 200) ✅"
else
  warn "API health check: HTTP ${HEALTH}. Verifique: pm2 logs funnel-api"
fi

# ══════════════════════════════════════════════════════════
# PRONTO!
# ══════════════════════════════════════════════════════════
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          ✅ Instalação concluída!                ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}Domínio público:${NC}     https://${PUBLIC_DOMAIN}"
echo -e "  ${CYAN}Dashboard:${NC}           https://${DASHBOARD_DOMAIN}"
echo -e "  ${CYAN}Login:${NC}               https://${DASHBOARD_DOMAIN}/login"
echo -e "  ${CYAN}Admin email:${NC}         ${ADMIN_EMAIL}"
echo ""
echo -e "  ${CYAN}Links de funil:${NC}      https://${PUBLIC_DOMAIN}/meu-slug"
if [ "$TRAEFIK_OWNS_443" -gt 0 ]; then
  echo -e "  ${CYAN}Proxy:${NC}              Traefik → containers (sem Nginx)"
else
  echo -e "  ${CYAN}Proxy:${NC}              Nginx + SSL"
fi
echo ""
echo -e "  ${CYAN}Atualizar:${NC}  sudo bash self-host/update.sh"
echo -e "  ${CYAN}Serviços:${NC}   pm2 status | pm2 logs"
echo -e "  ${CYAN}Dados em:${NC}   ${APP_DIR}"
echo ""
