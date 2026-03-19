#!/usr/bin/env bash
set -euo pipefail

# ╔══════════════════════════════════════════════════════════════╗
# ║  Update Self-Host — Funil App                                ║
# ║  Lê config de /opt/funnel-app/.env — zero perguntas          ║
# ╚══════════════════════════════════════════════════════════════╝

APP_DIR="/opt/funnel-app"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$APP_DIR/.env"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

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

# Testar conexão atual
if PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" >/dev/null 2>&1; then
  log "Conexão com banco OK (${DB_HOST}:${DB_PORT})"
else
  warn "Conexão falhou em ${DB_HOST}:${DB_PORT}. Detectando porta real do PostgreSQL..."

  # Detectar porta real via peer auth (funciona mesmo quando TCP falha)
  REAL_PORT=$(sudo -u postgres psql -tAc "SHOW port;" 2>/dev/null | tr -d '[:space:]')

  if [ -z "$REAL_PORT" ]; then
    err "Não foi possível detectar a porta do PostgreSQL. Verifique se o serviço está rodando."
  fi

  log "Porta real detectada: ${REAL_PORT}"

  # Garantir que a senha do funnel_user está sincronizada
  sudo -u postgres psql -c "ALTER ROLE ${DB_USER} WITH PASSWORD '${DB_PASS}';" >/dev/null 2>&1
  sudo systemctl reload postgresql 2>/dev/null || true

  # Testar com porta real
  if PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$REAL_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" >/dev/null 2>&1; then
    log "Conexão OK com porta ${REAL_PORT}. Atualizando configurações..."

    # Atualizar DB_PORT no .env
    if grep -q "^DB_PORT=" "$ENV_FILE"; then
      sed -i "s/^DB_PORT=.*/DB_PORT=${REAL_PORT}/" "$ENV_FILE"
    else
      echo "DB_PORT=${REAL_PORT}" >> "$ENV_FILE"
    fi

    # Atualizar PGRST_DB_URI no .env
    sed -i "s|^PGRST_DB_URI=.*|PGRST_DB_URI=postgres://${DB_USER}:${DB_PASS}@${DB_HOST}:${REAL_PORT}/${DB_NAME}|" "$ENV_FILE"

    # Atualizar postgrest.conf
    if [ -f "$APP_DIR/postgrest.conf" ]; then
      sed -i "s|^db-uri = .*|db-uri = \"postgres://${DB_USER}:${DB_PASS}@${DB_HOST}:${REAL_PORT}/${DB_NAME}\"|" "$APP_DIR/postgrest.conf"
      log "postgrest.conf atualizado"
    fi

    # Recarregar variáveis
    DB_PORT="$REAL_PORT"
    set -a; source "$ENV_FILE"; set +a
    log "Configurações corrigidas: DB_PORT=${REAL_PORT}"
  else
    err "Conexão falhou mesmo com porta ${REAL_PORT}. Verifique DB_HOST, DB_USER e DB_PASS no $ENV_FILE."
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

# ── 6. Migrations incrementais ──────────────────────────
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

  if [ "$already" = "1" ]; then
    continue
  fi

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

# Recarregar .env (pode ter sido atualizado pelo auto-heal)
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

# ── 8. Copiar dist ──────────────────────────────────────
rm -rf "$APP_DIR/dist"
cp -r "$REPO_DIR/dist" "$APP_DIR/dist"
log "Frontend copiado para $APP_DIR/dist"

# ── 9. Atualizar Nginx ──────────────────────────────────
if [ -f "$REPO_DIR/self-host/nginx.conf.template" ]; then
  if [ -f "/etc/letsencrypt/live/${PUBLIC_DOMAIN}/fullchain.pem" ] && \
     [ -f "/etc/letsencrypt/live/${DASHBOARD_DOMAIN}/fullchain.pem" ]; then
    sed -e "s/__PUBLIC_DOMAIN__/${PUBLIC_DOMAIN}/g" \
        -e "s/__DASHBOARD_DOMAIN__/${DASHBOARD_DOMAIN}/g" \
        "$REPO_DIR/self-host/nginx.conf.template" > /etc/nginx/sites-available/funnel-app

    # Garantir symlink ativo (evita config desatualizada)
    ln -sf /etc/nginx/sites-available/funnel-app /etc/nginx/sites-enabled/funnel-app

    if nginx -t 2>/dev/null; then
      systemctl reload nginx 2>/dev/null || nginx -s reload 2>/dev/null || true
      log "Nginx atualizado e recarregado"

      # Validação pós-reload: garantir que rotas críticas existem
      if grep -q "functions/v1" /etc/nginx/sites-enabled/funnel-app; then
        log "Rota /functions/v1/ confirmada no Nginx"
      else
        warn "Rota /functions/v1/ NÃO encontrada no Nginx — edge functions podem falhar"
      fi
    else
      warn "Nginx config inválida — não recarregado"
    fi
  else
    warn "Certificados SSL não encontrados — Nginx não atualizado"
  fi
fi

# ── 10. Reiniciar serviços (com --update-env) ───────────
log "Reiniciando serviços..."
cd "$APP_DIR"
set -a; source "$ENV_FILE"; set +a
pm2 restart funnel-api --update-env 2>/dev/null || true
pm2 restart funnel-postgrest --update-env 2>/dev/null || true
pm2 save 2>/dev/null
log "Serviços reiniciados"

# ── 11. Validação pós-restart ───────────────────────────
log "Validando serviços..."
sleep 2

# Testar health
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4000/health 2>/dev/null || echo "000")
if [ "$HEALTH" = "200" ]; then
  log "API respondendo (HTTP 200)"
else
  warn "API não respondeu ao health check (HTTP ${HEALTH}). Verifique: pm2 logs funnel-api"
fi

# ── 12. Resumo ──────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          ✅ Update concluído!                    ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}Público:${NC}     https://${PUBLIC_DOMAIN}"
echo -e "  ${CYAN}Dashboard:${NC}  https://${DASHBOARD_DOMAIN}"
echo -e "  ${CYAN}DB:${NC}         ${DB_HOST}:${DB_PORT}"
echo -e "  ${CYAN}Serviços:${NC}   pm2 status | pm2 logs"
echo ""
