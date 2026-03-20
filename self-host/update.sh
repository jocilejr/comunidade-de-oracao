#!/usr/bin/env bash
set -euo pipefail

# ╔══════════════════════════════════════════════════════════════╗
# ║  Update Self-Host — Funil App                                ║
# ║  Lê config de /opt/funnel-app/.env — zero perguntas          ║
# ║  Detecta Traefik vs Nginx e atualiza automaticamente         ║
# ╚══════════════════════════════════════════════════════════════╝

APP_DIR="/opt/funnel-app"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$APP_DIR/.env"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}[i]${NC} $1"; }

# ── 1. Verificações ──────────────────────────────────────
[ "$EUID" -ne 0 ] && err "Execute como root: sudo bash update.sh"
[ ! -f "$ENV_FILE" ] && err "Arquivo $ENV_FILE não encontrado. Rode install.sh primeiro."

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║         Update Self-Host — Funil App              ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ── 2. Carregar variáveis ────────────────────────────────
set -a; source "$ENV_FILE"; set +a
log "Variáveis carregadas de $ENV_FILE"
log "  Público: ${PUBLIC_DOMAIN:-?}  |  Dashboard: ${DASHBOARD_DOMAIN:-?}"

# ── 3. Auto-heal: detectar porta real do PostgreSQL ──────
log "Verificando conexão com o banco de dados..."

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-funnel_app}"
DB_USER="${DB_USER:-funnel_user}"
DB_PASS="${DB_PASS:-}"

if PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" >/dev/null 2>&1; then
  log "Conexão com banco OK (${DB_HOST}:${DB_PORT})"
else
  warn "Conexão falhou em ${DB_HOST}:${DB_PORT}. Detectando porta real..."

  REAL_PORT=$(sudo -u postgres psql -tAc "SHOW port;" 2>/dev/null | tr -d '[:space:]')
  [ -z "$REAL_PORT" ] && err "Não foi possível detectar a porta do PostgreSQL."

  log "Porta real detectada: ${REAL_PORT}"
  sudo -u postgres psql -c "ALTER ROLE ${DB_USER} WITH PASSWORD '${DB_PASS}';" >/dev/null 2>&1
  sudo systemctl reload postgresql 2>/dev/null || true

  if PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$REAL_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" >/dev/null 2>&1; then
    log "Conexão OK com porta ${REAL_PORT}. Atualizando configurações..."

    if grep -q "^DB_PORT=" "$ENV_FILE"; then
      sed -i "s/^DB_PORT=.*/DB_PORT=${REAL_PORT}/" "$ENV_FILE"
    else
      echo "DB_PORT=${REAL_PORT}" >> "$ENV_FILE"
    fi
    sed -i "s|^PGRST_DB_URI=.*|PGRST_DB_URI=postgres://${DB_USER}:${DB_PASS}@${DB_HOST}:${REAL_PORT}/${DB_NAME}|" "$ENV_FILE"

    if [ -f "$APP_DIR/postgrest.conf" ]; then
      sed -i "s|^db-uri = .*|db-uri = \"postgres://${DB_USER}:${DB_PASS}@${DB_HOST}:${REAL_PORT}/${DB_NAME}\"|" "$APP_DIR/postgrest.conf"
    fi

    DB_PORT="$REAL_PORT"
    set -a; source "$ENV_FILE"; set +a
    log "Configurações corrigidas: DB_PORT=${REAL_PORT}"
  else
    err "Conexão falhou mesmo com porta ${REAL_PORT}. Verifique DB_HOST, DB_USER e DB_PASS."
  fi
fi

# ── 4. Atualizar código do repositório ───────────────────
log "Atualizando repositório..."
cd "$REPO_DIR"
git pull --ff-only 2>/dev/null || git pull || warn "git pull falhou — continuando com código local"
log "Repositório atualizado"

# ── 5. Copiar arquivos do backend ────────────────────────
log "Copiando arquivos do backend..."
cp "$REPO_DIR/self-host/api-server.js" "$APP_DIR/"
cp "$REPO_DIR/self-host/ecosystem.config.js" "$APP_DIR/"
log "Arquivos copiados para $APP_DIR"

# ── 6. Atualizar auth.uid() para versão resiliente ──────
log "Atualizando função auth.uid()..."
sudo -u postgres psql -d "${DB_NAME}" -c "
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID LANGUAGE sql STABLE
AS \$\$ SELECT CASE WHEN NULLIF(current_setting('request.jwt.claims', true), '') IS NULL THEN NULL ELSE NULLIF((current_setting('request.jwt.claims', true)::jsonb->>'sub'), '')::uuid END \$\$;
" 2>/dev/null
log "auth.uid() atualizada"

# ── 6b. Garantir grants diretos para funnel_user ────────
log "Aplicando grants e BYPASSRLS para funnel_user..."
sudo -u postgres psql -d "${DB_NAME}" -c "
ALTER ROLE funnel_user BYPASSRLS;
GRANT USAGE ON SCHEMA public TO funnel_user;
GRANT SELECT, INSERT, UPDATE ON public.user_settings TO funnel_user;
GRANT ALL ON ALL TABLES IN SCHEMA public TO funnel_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO funnel_user;
" 2>/dev/null
log "Grants e BYPASSRLS aplicados"

# ── 7. Migrations incrementais ──────────────────────────
log "Verificando migrations..."

sudo -u postgres psql -d "${DB_NAME}" -c "
CREATE TABLE IF NOT EXISTS public.migrations_applied (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT now()
);
" 2>/dev/null

APPLIED=0
for migration in "$REPO_DIR"/supabase/migrations/*.sql; do
  [ ! -f "$migration" ] && continue
  filename=$(basename "$migration")

  already=$(sudo -u postgres psql -d "${DB_NAME}" -tAc \
    "SELECT 1 FROM public.migrations_applied WHERE filename='${filename}';" 2>/dev/null || echo "")

  if [ "$already" = "1" ]; then continue; fi

  FILTERED=$(sed '/pg_cron/d; /pg_net/d' "$migration")
  echo "$FILTERED" | sudo -u postgres psql -d "${DB_NAME}" -v ON_ERROR_STOP=0 2>/dev/null || true

  sudo -u postgres psql -d "${DB_NAME}" -c \
    "INSERT INTO public.migrations_applied (filename) VALUES ('${filename}') ON CONFLICT DO NOTHING;" 2>/dev/null

  log "  Migration aplicada: $filename"
  APPLIED=$((APPLIED + 1))
done

[ "$APPLIED" -eq 0 ] && log "Nenhuma migration nova" || log "$APPLIED migration(s) aplicada(s)"

# ── 7. Rebuild do frontend ──────────────────────────────
log "Buildando frontend..."
cd "$REPO_DIR"

set -a; source "$ENV_FILE"; set +a

cat > "$REPO_DIR/.env.local" <<BUILDENV
VITE_SUPABASE_URL=https://${DASHBOARD_DOMAIN}
VITE_SUPABASE_PUBLISHABLE_KEY=${ANON_KEY:-self-host-anon-key}
VITE_SUPABASE_PROJECT_ID=self-hosted
VITE_PUBLIC_DOMAIN=https://${PUBLIC_DOMAIN}
BUILDENV

npm ci --prefer-offline 2>/dev/null || npm install 2>/dev/null
npm run build
log "Frontend buildado"

rm -rf "$APP_DIR/dist"
cp -r "$REPO_DIR/dist" "$APP_DIR/dist"
log "Frontend copiado para $APP_DIR/dist"

# ── 7b. Garantir cron de rotação de imagens ─────────────
log "Verificando cron de rotação de imagens..."
CRON_CMD='0 * * * * curl -sf -X POST http://127.0.0.1:4000/rotate-preview-images >> /var/log/funnel-rotate.log 2>&1'
(crontab -l 2>/dev/null | grep -v "rotate-preview-images"; echo "$CRON_CMD") | crontab -
systemctl enable cron 2>/dev/null || true
systemctl start cron 2>/dev/null || true
log "Cron de rotação configurado (a cada hora, log em /var/log/funnel-rotate.log)"

# ── 8. Reiniciar serviços PM2 ───────────────────────────
log "Reiniciando serviços..."
cd "$APP_DIR"
set -a; source "$ENV_FILE"; set +a
pm2 restart funnel-api --update-env 2>/dev/null || true
pm2 restart funnel-postgrest --update-env 2>/dev/null || true
pm2 save 2>/dev/null
log "Serviços reiniciados"

# ── 9. Validação pós-restart ────────────────────────────
log "Validando serviços..."
sleep 2

HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4000/health 2>/dev/null || echo "000")
if [ "$HEALTH" = "200" ]; then
  log "API respondendo (HTTP 200) ✅"
else
  warn "API não respondeu ao health check (HTTP ${HEALTH}). Verifique: pm2 logs funnel-api"
fi

# ── 10. Detectar proxy e atualizar ──────────────────────
TRAEFIK_OWNS_443=$(ss -ltnp 2>/dev/null | grep ':443' | grep -c 'docker-proxy' || true)

if [ "$TRAEFIK_OWNS_443" -gt 0 ]; then
  # ════════════════════════════════════════════════════════
  # MODO TRAEFIK — atualizar containers
  # ════════════════════════════════════════════════════════
  info "Traefik detectado — atualizando containers..."

  ROUTER_PREFIX="funnel-$(echo "$DASHBOARD_DOMAIN" | sed 's/[^a-zA-Z0-9]/-/g' | tr '[:upper:]' '[:lower:]')"

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
  [ -z "$TRAEFIK_NETWORK" ] && TRAEFIK_NETWORK="traefik-net"
  log "Rede Traefik: ${TRAEFIK_NETWORK}"

  # Remover containers antigos
  for c in funnel-nginx-proxy funnel-spa funnel-api-proxy funnel-rest-proxy; do
    if docker ps -a --format '{{.Names}}' | grep -q "^${c}$"; then
      docker stop "$c" 2>/dev/null || true
      docker rm "$c" 2>/dev/null || true
    fi
  done

  # Gerar e subir docker-compose
  COMPOSE_FILE="$APP_DIR/docker-compose.yml"
  sed -e "s/__DASHBOARD_DOMAIN__/${DASHBOARD_DOMAIN}/g" \
      -e "s/__PUBLIC_DOMAIN__/${PUBLIC_DOMAIN}/g" \
      -e "s/__ROUTER_PREFIX__/${ROUTER_PREFIX}/g" \
      "$REPO_DIR/self-host/docker-compose.traefik.yml.template" > "$COMPOSE_FILE"
  if [ "$TRAEFIK_NETWORK" != "traefik-net" ]; then
    sed -i "s/traefik-net/${TRAEFIK_NETWORK}/g" "$COMPOSE_FILE"
  fi

  cd "$APP_DIR"
  docker compose up -d --force-recreate 2>/dev/null || docker-compose up -d --force-recreate 2>/dev/null
  log "Containers atualizados"

  # ── Smoke tests ────────────────────────────────────────
  sleep 4
  info "Smoke tests..."
  echo ""

  SMOKE_OK=true

  test_route() {
    local label="$1" url="$2" expected="$3"
    shift 3
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" "$@" "$url" 2>/dev/null || echo "000")
    if echo "$expected" | grep -qw "$code"; then
      echo -e "  ${GREEN}✅${NC} ${label} → HTTP ${code}"
      return 0
    else
      echo -e "  ${RED}❌${NC} ${label} → HTTP ${code} (esperado: ${expected})"
      return 1
    fi
  }

  test_route "GET  /"                    "https://${DASHBOARD_DOMAIN}/"       "200"         || SMOKE_OK=false
  test_route "GET  /login"               "https://${DASHBOARD_DOMAIN}/login"  "200"         || SMOKE_OK=false
  test_route "GET  /admin"               "https://${DASHBOARD_DOMAIN}/admin"  "200"         || SMOKE_OK=false
  test_route "POST /functions/v1/proxy"  "https://${DASHBOARD_DOMAIN}/functions/v1/typebot-proxy" "400 401" \
    -X POST -H "Content-Type: application/json" -d '{"action":"list"}'                      || SMOKE_OK=false
  test_route "GET  /rest/v1/"            "https://${DASHBOARD_DOMAIN}/rest/v1/user_settings?select=id&limit=1" "200 401 406" || SMOKE_OK=false

  echo ""

  if [ "$SMOKE_OK" = true ]; then
    echo -e "${GREEN}  ✅ Todas as rotas OK${NC}"
  else
    warn "Algumas rotas falharam. Diagnóstico:"
    echo ""

    # ── Diagnóstico inline ───────────────────────────────
    info "Status dos containers:"
    for c in funnel-spa funnel-api-proxy funnel-rest-proxy; do
      if docker ps --format '{{.Names}}' | grep -q "^${c}$"; then
        log "  $c ✅"
      else
        warn "  $c ❌ NÃO rodando"
      fi
    done

    if docker ps --format '{{.Names}}' | grep -q "^funnel-nginx-proxy$"; then
      warn "  Container ANTIGO funnel-nginx-proxy ainda existe! Remova-o."
    fi

    echo ""
    info "Rede dos containers:"
    if [ -n "$TRAEFIK_CONTAINER" ]; then
      TRAEFIK_NETS=$(docker inspect "$TRAEFIK_CONTAINER" \
        --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null || true)
      echo -e "  Traefik: ${TRAEFIK_NETS}"
      for c in funnel-spa funnel-api-proxy funnel-rest-proxy; do
        if docker ps --format '{{.Names}}' | grep -q "^${c}$"; then
          NETS=$(docker inspect "$c" \
            --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null || true)
          echo -e "  $c: ${NETS}"
        fi
      done
    fi

    echo ""
    info "Conflitos de host-rule para ${DASHBOARD_DOMAIN}:"
    CONFLICTS=0
    for cid in $(docker ps -q); do
      name=$(docker inspect --format '{{.Name}}' "$cid" | sed 's/^\///')
      case "$name" in funnel-spa|funnel-api-proxy|funnel-rest-proxy) continue;; esac
      labels=$(docker inspect --format '{{json .Config.Labels}}' "$cid" 2>/dev/null)
      if echo "$labels" | grep -qi "$DASHBOARD_DOMAIN"; then
        echo -e "  ${RED}⚠ CONFLITO:${NC} ${name}"
        CONFLICTS=$((CONFLICTS + 1))
      fi
    done
    [ "$CONFLICTS" -eq 0 ] && log "  Nenhum conflito ✅"
    echo ""
  fi

else
  # ════════════════════════════════════════════════════════
  # MODO NGINX — atualizar config
  # ════════════════════════════════════════════════════════
  if [ -f "$REPO_DIR/self-host/nginx.conf.template" ]; then
    if [ -f "/etc/letsencrypt/live/${PUBLIC_DOMAIN}/fullchain.pem" ] && \
       [ -f "/etc/letsencrypt/live/${DASHBOARD_DOMAIN}/fullchain.pem" ]; then
      sed -e "s/__PUBLIC_DOMAIN__/${PUBLIC_DOMAIN}/g" \
          -e "s/__DASHBOARD_DOMAIN__/${DASHBOARD_DOMAIN}/g" \
          "$REPO_DIR/self-host/nginx.conf.template" > /etc/nginx/sites-available/funnel-app

      ln -sf /etc/nginx/sites-available/funnel-app /etc/nginx/sites-enabled/funnel-app

      if nginx -t 2>/dev/null; then
        systemctl reload nginx 2>/dev/null || nginx -s reload 2>/dev/null || true
        log "Nginx atualizado e recarregado"
      else
        warn "Nginx config inválida — não recarregado"
      fi
    else
      warn "Certificados SSL não encontrados — Nginx não atualizado"
    fi
  fi
  log "Nginx do host controla a porta 443"
fi

# ── 11. Resumo ──────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          ✅ Update concluído!                    ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}Público:${NC}     https://${PUBLIC_DOMAIN}"
echo -e "  ${CYAN}Dashboard:${NC}  https://${DASHBOARD_DOMAIN}"
echo -e "  ${CYAN}DB:${NC}         ${DB_HOST}:${DB_PORT}"
echo -e "  ${CYAN}Serviços:${NC}   pm2 status | pm2 logs"
if [ "$TRAEFIK_OWNS_443" -gt 0 ]; then
  echo -e "  ${CYAN}Proxy:${NC}      Traefik → containers (sem Nginx)"
else
  echo -e "  ${CYAN}Proxy:${NC}      Nginx + SSL"
fi
echo ""
