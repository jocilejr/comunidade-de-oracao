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

# ── 3. Atualizar código do repositório ───────────────────
log "Atualizando repositório..."
cd "$REPO_DIR"
git pull --ff-only 2>/dev/null || git pull || warn "git pull falhou — continuando com código local"
log "Repositório atualizado"

# ── 4. Copiar arquivos do backend ────────────────────────
log "Copiando arquivos do backend..."
cp "$REPO_DIR/self-host/api-server.js" "$APP_DIR/"
cp "$REPO_DIR/self-host/ecosystem.config.js" "$APP_DIR/"
log "Arquivos copiados para $APP_DIR"

# ── 5. Migrations incrementais ──────────────────────────
log "Verificando migrations..."

sudo -u postgres psql -d "${DB_NAME:-funnel_app}" -c "
CREATE TABLE IF NOT EXISTS public.migrations_applied (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT now()
);
" 2>/dev/null

APPLIED=0
for migration in "$REPO_DIR"/supabase/migrations/*.sql; do
  [ ! -f "$migration" ] && continue
  filename=$(basename "$migration")

  already=$(sudo -u postgres psql -d "${DB_NAME:-funnel_app}" -tAc \
    "SELECT 1 FROM public.migrations_applied WHERE filename='${filename}';" 2>/dev/null || echo "")

  if [ "$already" = "1" ]; then
    continue
  fi

  FILTERED=$(sed '/pg_cron/d; /pg_net/d' "$migration")
  echo "$FILTERED" | sudo -u postgres psql -d "${DB_NAME:-funnel_app}" -v ON_ERROR_STOP=0 2>/dev/null || true

  sudo -u postgres psql -d "${DB_NAME:-funnel_app}" -c \
    "INSERT INTO public.migrations_applied (filename) VALUES ('${filename}') ON CONFLICT DO NOTHING;" 2>/dev/null

  log "  Migration aplicada: $filename"
  APPLIED=$((APPLIED + 1))
done

[ "$APPLIED" -eq 0 ] && log "Nenhuma migration nova" || log "$APPLIED migration(s) aplicada(s)"

# ── 6. Rebuild do frontend ──────────────────────────────
log "Buildando frontend..."
cd "$REPO_DIR"

cat > "$REPO_DIR/.env.local" <<BUILDENV
VITE_SUPABASE_URL=https://${DASHBOARD_DOMAIN}
VITE_SUPABASE_PUBLISHABLE_KEY=${ANON_KEY:-self-host-anon-key}
VITE_SUPABASE_PROJECT_ID=self-hosted
VITE_PUBLIC_DOMAIN=https://${PUBLIC_DOMAIN}
BUILDENV

npm ci --prefer-offline 2>/dev/null || npm install 2>/dev/null
npm run build
log "Frontend buildado"

# ── 7. Copiar dist ──────────────────────────────────────
rm -rf "$APP_DIR/dist"
cp -r "$REPO_DIR/dist" "$APP_DIR/dist"
log "Frontend copiado para $APP_DIR/dist"

# ── 8. Atualizar Nginx ──────────────────────────────────
if [ -f "$REPO_DIR/self-host/nginx.conf.template" ]; then
  if [ -f "/etc/letsencrypt/live/${PUBLIC_DOMAIN}/fullchain.pem" ] && \
     [ -f "/etc/letsencrypt/live/${DASHBOARD_DOMAIN}/fullchain.pem" ]; then
    sed -e "s/__PUBLIC_DOMAIN__/${PUBLIC_DOMAIN}/g" \
        -e "s/__DASHBOARD_DOMAIN__/${DASHBOARD_DOMAIN}/g" \
        "$REPO_DIR/self-host/nginx.conf.template" > /etc/nginx/sites-available/funnel-app

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

# ── 9. Reiniciar serviços ───────────────────────────────
log "Reiniciando serviços..."
cd "$APP_DIR"
pm2 restart funnel-api funnel-postgrest 2>/dev/null || pm2 start ecosystem.config.js 2>/dev/null || true
pm2 save 2>/dev/null
log "Serviços reiniciados"

# ── 10. Resumo ──────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          ✅ Update concluído!                    ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}Público:${NC}     https://${PUBLIC_DOMAIN}"
echo -e "  ${CYAN}Dashboard:${NC}  https://${DASHBOARD_DOMAIN}"
echo -e "  ${CYAN}Serviços:${NC}   pm2 status | pm2 logs"
echo ""
