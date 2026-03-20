#!/usr/bin/env bash
# Reduzimos a restrição (removido o pipefail) para evitar abortos silenciosos
set -e

# ╔══════════════════════════════════════════════════════════════╗
# ║  Update Self-Host — Funil App (VERSÃO BLINDADA)              ║
# ╚══════════════════════════════════════════════════════════════╝

APP_DIR="/opt/funnel-app"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$APP_DIR/.env"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}[i]${NC} $1"; }

[ "$EUID" -ne 0 ] && err "Execute como root: sudo bash update.sh"
[ ! -f "$ENV_FILE" ] && err "Arquivo $ENV_FILE não encontrado. Rode install.sh primeiro."

echo -e "\n${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║         Update Self-Host — Funil App              ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}\n"

set -a; source "$ENV_FILE"; set +a
log "Variáveis carregadas de $ENV_FILE"

log "Verificando conexão com o banco de dados..."
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-funnel_app}"
DB_USER="${DB_USER:-funnel_user}"
DB_PASS="${DB_PASS:-}"

if PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" >/dev/null 2>&1; then
  log "Conexão com banco OK (${DB_HOST}:${DB_PORT})"
else
  warn "Conexão falhou na porta ${DB_PORT}. Auto-corrigindo..."
  REAL_PORT=$(sudo -u postgres psql -tAc "SHOW port;" 2>/dev/null | tr -d '[:space:]' || echo "5433")
  
  sudo -u postgres psql -c "ALTER ROLE ${DB_USER} WITH PASSWORD '${DB_PASS}';" >/dev/null 2>&1 || true
  
  if grep -q "^DB_PORT=" "$ENV_FILE"; then
    sed -i "s/^DB_PORT=.*/DB_PORT=${REAL_PORT}/" "$ENV_FILE"
  else
    echo "DB_PORT=${REAL_PORT}" >> "$ENV_FILE"
  fi
  sed -i "s|^PGRST_DB_URI=.*|PGRST_DB_URI=postgres://${DB_USER}:${DB_PASS}@${DB_HOST}:${REAL_PORT}/${DB_NAME}|" "$ENV_FILE"
  
  DB_PORT="$REAL_PORT"
  set -a; source "$ENV_FILE"; set +a
  log "Porta atualizada para ${REAL_PORT}"
fi

log "Atualizando repositório..."
cd "$REPO_DIR"
git pull --ff-only 2>/dev/null || git pull || true
log "Repositório atualizado"

log "Copiando arquivos do backend..."
cp "$REPO_DIR/self-host/api-server.js" "$APP_DIR/" || true
cp "$REPO_DIR/self-host/ecosystem.config.js" "$APP_DIR/" || true

log "Aplicando permissões no Banco de Dados..."
sudo -u postgres psql -d "${DB_NAME}" -c "
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS \$\$ SELECT CASE WHEN NULLIF(current_setting('request.jwt.claims', true), '') IS NULL THEN NULL ELSE NULLIF((current_setting('request.jwt.claims', true)::jsonb->>'sub'), '')::uuid END \$\$;
ALTER ROLE funnel_user BYPASSRLS;
GRANT USAGE ON SCHEMA public TO funnel_user;
GRANT ALL ON ALL TABLES IN SCHEMA public TO funnel_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO funnel_user;
GRANT USAGE ON SCHEMA auth TO funnel_user;
GRANT ALL ON ALL TABLES IN SCHEMA auth TO funnel_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA auth TO funnel_user;
" >/dev/null 2>&1 || true

log "Buildando frontend..."
cd "$REPO_DIR"
cat > "$REPO_DIR/.env.local" <<BUILDENV
VITE_SUPABASE_URL=https://${DASHBOARD_DOMAIN}
VITE_SUPABASE_PUBLISHABLE_KEY=${ANON_KEY:-self-host-anon-key}
VITE_SUPABASE_PROJECT_ID=self-hosted
VITE_PUBLIC_DOMAIN=https://${PUBLIC_DOMAIN}
BUILDENV

npm ci --prefer-offline 2>/dev/null || npm install 2>/dev/null || true
npm run build
log "Frontend buildado"

rm -rf "$APP_DIR/dist"
cp -r "$REPO_DIR/dist" "$APP_DIR/dist"

# ── Bloco do Cron 100% blindado ──
log "Verificando cron de rotação de imagens..."
if command -v crontab >/dev/null 2>&1; then
  CRON_CMD='0 * * * * curl -sf -X POST http://127.0.0.1:4000/rotate-preview-images >> /var/log/funnel-rotate.log 2>&1'
  (crontab -l 2>/dev/null | grep -v "rotate-preview-images" || true; echo "$CRON_CMD") | crontab - || true
  systemctl enable cron 2>/dev/null || true
  systemctl start cron 2>/dev/null || true
  log "Cron de rotação configurado"
else
  warn "Serviço cron não encontrado. Ignorando."
fi

log "Reiniciando serviços PM2..."
cd "$APP_DIR"
pm2 delete all 2>/dev/null || true
pm2 start "$APP_DIR/ecosystem.config.js" --update-env >/dev/null 2>&1 || true
pm2 save >/dev/null 2>&1 || true

log "Detectando proxy..."
PROXY_MODE="auto"
TRAEFIK_CONTAINER=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -i traefik | head -1 || true)
if [ -n "$TRAEFIK_CONTAINER" ]; then
  info "Traefik detectado. Reiniciando containers do Docker..."
  ROUTER_PREFIX="funnel-$(echo "$DASHBOARD_DOMAIN" | sed 's/[^a-zA-Z0-9]/-/g' | tr '[:upper:]' '[:lower:]')"
  
  TRAEFIK_NETWORK=$(docker inspect "$TRAEFIK_CONTAINER" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null | tr ' ' '\n' | grep -v '^bridge$' | grep -v '^$' | head -1 || true)
  [ -z "$TRAEFIK_NETWORK" ] && TRAEFIK_NETWORK="traefik-net"
  
  COMPOSE_FILE="$APP_DIR/docker-compose.yml"
  sed -e "s/__DASHBOARD_DOMAIN__/${DASHBOARD_DOMAIN}/g" \
      -e "s/__PUBLIC_DOMAIN__/${PUBLIC_DOMAIN}/g" \
      -e "s/__ROUTER_PREFIX__/${ROUTER_PREFIX}/g" \
      "$REPO_DIR/self-host/docker-compose.traefik.yml.template" > "$COMPOSE_FILE"
  sed -i "s/traefik-net/${TRAEFIK_NETWORK}/g" "$COMPOSE_FILE"

  docker stop funnel-spa funnel-nginx-proxy 2>/dev/null || true
  docker rm funnel-spa funnel-nginx-proxy 2>/dev/null || true
  
  docker compose up -d --force-recreate 2>/dev/null || docker-compose up -d --force-recreate 2>/dev/null || true
else
  info "Traefik não encontrado. Reiniciando Nginx padrão..."
  systemctl reload nginx 2>/dev/null || true
fi

echo -e "\n${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          ✅ Update concluído com sucesso!        ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}\n"
