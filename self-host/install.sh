#!/usr/bin/env bash
set -euo pipefail

# ╔══════════════════════════════════════════════════════════════╗
# ║  Instalador Self-Host — Funil App                            ║
# ║  Dois domínios: público (links) + dashboard (admin/API)      ║
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

# Nginx + Certbot + PM2
apt-get install -y -qq nginx certbot python3-certbot-nginx uuid-runtime
npm install -g pm2 2>/dev/null || true
log "Nginx, Certbot, PM2 instalados"

# ══════════════════════════════════════════════════════════
# 2. POSTGRESQL — BANCO E USUARIO
# ══════════════════════════════════════════════════════════
log "Configurando PostgreSQL..."

sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='funnel_user'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE ROLE funnel_user WITH LOGIN PASSWORD '${DB_PASS}';"

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
AS \$\$ SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid \$\$;
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
GRANT ALL ON ALL TABLES IN SCHEMA public TO funnel_user, authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT INSERT ON public.funnel_sessions, public.funnel_session_events TO anon;
GRANT UPDATE ON public.funnel_sessions TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO funnel_user, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO funnel_user;
"
log "Migrations executadas"

# ══════════════════════════════════════════════════════════
# 4. CRIAR USUÁRIO ADMIN
# ══════════════════════════════════════════════════════════
log "Criando usuário administrador..."

# Instalar bcryptjs localmente no APP_DIR
mkdir -p "$APP_DIR"
cd "$APP_DIR"
npm init -y 2>/dev/null || true
npm install bcryptjs pg 2>/dev/null

ADMIN_ID=$(uuidgen)
ADMIN_HASH=$(node -e "const b=require('$APP_DIR/node_modules/bcryptjs');b.hash(process.argv[1],10).then(h=>console.log(h))" "$ADMIN_PASS")

sudo -u postgres psql -d funnel_app -c "
INSERT INTO auth.users (id, email, encrypted_password)
VALUES ('${ADMIN_ID}', '${ADMIN_EMAIL}', '${ADMIN_HASH}')
ON CONFLICT (email) DO UPDATE SET encrypted_password = EXCLUDED.encrypted_password;
"
log "Admin criado: ${ADMIN_EMAIL}"

# ══════════════════════════════════════════════════════════
# 5. INSTALAR PostgREST + GoTrue
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

log "Instalando GoTrue..."
GOTRUE_VERSION="v2.158.1"
if [ ! -f /usr/local/bin/gotrue ]; then
  if [ "$ARCH" = "amd64" ]; then
    GOTRUE_URL="https://github.com/supabase/auth/releases/download/${GOTRUE_VERSION}/auth-${GOTRUE_VERSION}-x86_64-unknown-linux-gnu.tar.gz"
  else
    GOTRUE_URL="https://github.com/supabase/auth/releases/download/${GOTRUE_VERSION}/auth-${GOTRUE_VERSION}-aarch64-unknown-linux-gnu.tar.gz"
  fi
  curl -fsSL "$GOTRUE_URL" | tar xzf - -C /usr/local/bin/ 2>/dev/null || \
    warn "GoTrue binário não encontrado. Auth será via API server."
  [ -f /usr/local/bin/gotrue ] && chmod +x /usr/local/bin/gotrue
fi

# ══════════════════════════════════════════════════════════
# 6. CONFIGURAR APLICAÇÃO
# ══════════════════════════════════════════════════════════
log "Configurando aplicação..."

cp "$REPO_DIR/self-host/api-server.js" "$APP_DIR/"
cp "$REPO_DIR/self-host/ecosystem.config.js" "$APP_DIR/"

# Criar .env
cat > "$APP_DIR/.env" <<ENVEOF
PUBLIC_DOMAIN=${PUBLIC_DOMAIN}
DASHBOARD_DOMAIN=${DASHBOARD_DOMAIN}
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=funnel_app
DB_USER=funnel_user
DB_PASS=${DB_PASS}
API_PORT=4000
API_JWT_SECRET=${JWT_SECRET}
PGRST_DB_URI=postgres://funnel_user:${DB_PASS}@127.0.0.1:5432/funnel_app
PGRST_DB_SCHEMAS=public
PGRST_DB_ANON_ROLE=anon
PGRST_JWT_SECRET=${JWT_SECRET}
PGRST_SERVER_PORT=3000
GOTRUE_DB_DATABASE_URL=postgres://funnel_user:${DB_PASS}@127.0.0.1:5432/funnel_app
GOTRUE_JWT_SECRET=${JWT_SECRET}
GOTRUE_JWT_EXP=3600
GOTRUE_JWT_AUD=authenticated
GOTRUE_SITE_URL=https://${DASHBOARD_DOMAIN}
GOTRUE_API_HOST=0.0.0.0
GOTRUE_PORT=9999
GOTRUE_MAILER_AUTOCONFIRM=true
ENVEOF

# PostgREST config
cat > "$APP_DIR/postgrest.conf" <<PGCONF
db-uri = "postgres://funnel_user:${DB_PASS}@127.0.0.1:5432/funnel_app"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "${JWT_SECRET}"
server-port = 3000
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
# 8. NGINX + SSL
# ══════════════════════════════════════════════════════════
log "Configurando Nginx..."

# Config HTTP temporária para Certbot
cat > /etc/nginx/sites-available/funnel-app <<NGINX_TEMP
server {
    listen 80;
    server_name ${PUBLIC_DOMAIN} www.${PUBLIC_DOMAIN} ${DASHBOARD_DOMAIN};
    root ${APP_DIR}/dist;
    index index.html;
    location / { try_files \$uri \$uri/ /index.html; }
}
NGINX_TEMP

ln -sf /etc/nginx/sites-available/funnel-app /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

log "Obtendo certificados SSL..."
certbot --nginx -d "${PUBLIC_DOMAIN}" -d "www.${PUBLIC_DOMAIN}" -d "${DASHBOARD_DOMAIN}" \
  --email "${SSL_EMAIL}" --agree-tos --non-interactive --redirect || {
  warn "Certbot falhou. Verifique se o DNS dos domínios aponta para este servidor."
  warn "Após configurar o DNS, execute:"
  warn "  certbot --nginx -d ${PUBLIC_DOMAIN} -d www.${PUBLIC_DOMAIN} -d ${DASHBOARD_DOMAIN}"
}

# Aplicar config completa com dois domínios
sed -e "s/__PUBLIC_DOMAIN__/${PUBLIC_DOMAIN}/g" \
    -e "s/__DASHBOARD_DOMAIN__/${DASHBOARD_DOMAIN}/g" \
    "$REPO_DIR/self-host/nginx.conf.template" > /etc/nginx/sites-available/funnel-app

nginx -t && systemctl reload nginx
log "Nginx configurado com SSL"

# ══════════════════════════════════════════════════════════
# 9. INICIAR SERVIÇOS COM PM2
# ══════════════════════════════════════════════════════════
log "Iniciando serviços..."

cd "$APP_DIR"
set -a; source "$APP_DIR/.env"; set +a

pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true
log "Serviços iniciados"

# ══════════════════════════════════════════════════════════
# 10. CRON PARA ROTAÇÃO DE IMAGENS
# ══════════════════════════════════════════════════════════
CRON_CMD="0 * * * * curl -s -X POST http://127.0.0.1:4000/rotate-preview-images > /dev/null 2>&1"
(crontab -l 2>/dev/null | grep -v "rotate-preview-images"; echo "$CRON_CMD") | crontab -
log "Cron de rotação configurado (a cada hora)"

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
echo -e "  (Preview social funciona automaticamente!)"
echo ""
echo -e "  ${CYAN}Serviços:${NC}  pm2 status | pm2 logs | pm2 restart all"
echo -e "  ${CYAN}Dados em:${NC}  ${APP_DIR}"
echo ""
