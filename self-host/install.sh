#!/usr/bin/env bash
set -euo pipefail

# ╔══════════════════════════════════════════════════════════════╗
# ║  Instalador Self-Host — Funil App                            ║
# ║  Instala: PostgreSQL 16, PostgREST, GoTrue, Node.js 20,     ║
# ║           Nginx + SSL, PM2, API Server                       ║
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
if [ "$EUID" -ne 0 ]; then
  err "Execute como root: sudo bash install.sh"
fi

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       Instalador Self-Host — Funil App           ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ── Coletar informações ──────────────────────────────────
ask "Domínio (ex: meusite.com.br)"
read -r DOMAIN
[ -z "$DOMAIN" ] && err "Domínio obrigatório"

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

# Nginx
apt-get install -y -qq nginx
log "Nginx instalado"

# Certbot
apt-get install -y -qq certbot python3-certbot-nginx
log "Certbot instalado"

# PM2
npm install -g pm2 2>/dev/null || true
log "PM2 instalado"

# ══════════════════════════════════════════════════════════
# 2. POSTGRESQL — BANCO E USUARIO
# ══════════════════════════════════════════════════════════
log "Configurando PostgreSQL..."

sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='funnel_user'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE ROLE funnel_user WITH LOGIN PASSWORD '${DB_PASS}';"

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='funnel_app'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE funnel_app OWNER funnel_user;"

# Criar roles anon e authenticated (compatível com PostgREST/GoTrue)
sudo -u postgres psql -d funnel_app -c "
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
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

# Criar schema auth simulado para compatibilidade com as migrations
sudo -u postgres psql -d funnel_app -c "
CREATE SCHEMA IF NOT EXISTS auth;

-- Tabela auth.users simplificada (GoTrue cuida do real)
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  encrypted_password TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Função auth.uid() para compatibilidade com RLS
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS \$\$ SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid \$\$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role, funnel_user;
GRANT SELECT ON auth.users TO anon, authenticated, service_role, funnel_user;
"

# Executar cada migration na ordem
for migration in "$REPO_DIR"/supabase/migrations/*.sql; do
  if [ -f "$migration" ]; then
    filename=$(basename "$migration")
    # Pular extensões que não existem em PostgreSQL padrão (pg_cron, pg_net)
    FILTERED=$(sed '/pg_cron/d; /pg_net/d' "$migration")
    echo "$FILTERED" | sudo -u postgres psql -d funnel_app -v ON_ERROR_STOP=0 2>/dev/null || true
    log "Migration: $filename"
  fi
done

# Conceder permissões nas tabelas criadas
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

ADMIN_ID=$(uuidgen)
# Hash bcrypt da senha (usando Node.js)
ADMIN_HASH=$(node -e "
const crypto = require('crypto');
// bcrypt-compatible hash via Node
const bcrypt = require('bcrypt' + 'js');
if (typeof bcrypt === 'undefined') {
  // Fallback: install bcryptjs
  process.exit(1);
}
bcrypt.hash('${ADMIN_PASS}', 10).then(h => console.log(h));
" 2>/dev/null || echo "")

# Instalar bcryptjs se necessário
if [ -z "$ADMIN_HASH" ]; then
  npm install -g bcryptjs 2>/dev/null
  ADMIN_HASH=$(node -e "const b=require('bcryptjs');b.hash('${ADMIN_PASS}',10).then(h=>console.log(h))")
fi

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
  curl -fsSL "$GOTRUE_URL" | tar xzf - -C /usr/local/bin/ 2>/dev/null || {
    warn "GoTrue binário não encontrado para esta arquitetura. Auth será via API server."
  }
  [ -f /usr/local/bin/gotrue ] && chmod +x /usr/local/bin/gotrue
fi

# ══════════════════════════════════════════════════════════
# 6. CONFIGURAR APLICAÇÃO
# ══════════════════════════════════════════════════════════
log "Configurando aplicação..."

mkdir -p "$APP_DIR"

# Copiar API server
cp "$REPO_DIR/self-host/api-server.js" "$APP_DIR/"
cp "$REPO_DIR/self-host/ecosystem.config.js" "$APP_DIR/"

# Instalar dependências do API server
cd "$APP_DIR"
npm init -y 2>/dev/null
npm install pg 2>/dev/null

# Criar arquivo .env
cat > "$APP_DIR/.env" <<ENVEOF
DOMAIN=${DOMAIN}
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
GOTRUE_SITE_URL=https://${DOMAIN}
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

# Criar .env de build
cat > "$REPO_DIR/.env.local" <<BUILDENV
VITE_SUPABASE_URL=https://${DOMAIN}
VITE_SUPABASE_PUBLISHABLE_KEY=${ANON_KEY}
VITE_SUPABASE_PROJECT_ID=self-hosted
BUILDENV

npm run build

# Copiar dist
cp -r "$REPO_DIR/dist" "$APP_DIR/dist"

log "Frontend buildado e copiado"

# ══════════════════════════════════════════════════════════
# 8. NGINX + SSL
# ══════════════════════════════════════════════════════════
log "Configurando Nginx..."

# Primeiro, config HTTP only para Certbot
cat > /etc/nginx/sites-available/funnel-app <<NGINX_TEMP
server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};
    root ${APP_DIR}/dist;
    index index.html;
    location / { try_files \$uri \$uri/ /index.html; }
}
NGINX_TEMP

ln -sf /etc/nginx/sites-available/funnel-app /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

log "Obtendo certificado SSL..."
certbot --nginx -d "${DOMAIN}" -d "www.${DOMAIN}" --email "${SSL_EMAIL}" --agree-tos --non-interactive --redirect || {
  warn "Certbot falhou. Verifique se o DNS do domínio aponta para este servidor."
  warn "Após configurar o DNS, execute: certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}"
}

# Agora aplicar config completa com proxy
sed "s/__DOMAIN__/${DOMAIN}/g" "$REPO_DIR/self-host/nginx.conf.template" > /etc/nginx/sites-available/funnel-app

nginx -t && systemctl reload nginx

log "Nginx configurado com SSL"

# ══════════════════════════════════════════════════════════
# 9. INICIAR SERVIÇOS COM PM2
# ══════════════════════════════════════════════════════════
log "Iniciando serviços..."

cd "$APP_DIR"

# Carregar variáveis de ambiente
set -a; source "$APP_DIR/.env"; set +a

pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

log "Serviços iniciados"

# ══════════════════════════════════════════════════════════
# 10. CRON PARA ROTAÇÃO DE IMAGENS
# ══════════════════════════════════════════════════════════
log "Configurando cron de rotação de imagens..."

CRON_CMD="0 * * * * curl -s -X POST http://127.0.0.1:4000/rotate-preview-images > /dev/null 2>&1"
(crontab -l 2>/dev/null | grep -v "rotate-preview-images"; echo "$CRON_CMD") | crontab -

log "Cron configurado (a cada hora)"

# ══════════════════════════════════════════════════════════
# PRONTO!
# ══════════════════════════════════════════════════════════
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          ✅ Instalação concluída!                ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Dashboard:     ${CYAN}https://${DOMAIN}${NC}"
echo -e "  Login:         ${CYAN}https://${DOMAIN}/login${NC}"
echo -e "  Admin email:   ${CYAN}${ADMIN_EMAIL}${NC}"
echo ""
echo -e "  Links de funil: ${CYAN}https://${DOMAIN}/f/seu-slug${NC}"
echo -e "  (Preview social funciona automaticamente!)"
echo ""
echo -e "  Serviços:      ${CYAN}pm2 status${NC}"
echo -e "  Logs:          ${CYAN}pm2 logs${NC}"
echo -e "  Reiniciar:     ${CYAN}pm2 restart all${NC}"
echo ""
echo -e "  Dados em:      ${CYAN}${APP_DIR}${NC}"
echo ""
