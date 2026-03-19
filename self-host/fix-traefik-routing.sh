#!/usr/bin/env bash
set -euo pipefail

# ╔══════════════════════════════════════════════════════════════╗
# ║  Fix Traefik Routing — Funil App                            ║
# ║  Diagnóstico para arquitetura de 3 containers               ║
# ║  (funnel-spa, funnel-api-proxy, funnel-rest-proxy)           ║
# ╚══════════════════════════════════════════════════════════════╝

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}[i]${NC} $1"; }

APP_DIR="/opt/funnel-app"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$APP_DIR/.env"

[ "$EUID" -ne 0 ] && err "Execute como root: sudo bash fix-traefik-routing.sh"
[ ! -f "$ENV_FILE" ] && err "$ENV_FILE não encontrado. Rode install.sh primeiro."

set -a; source "$ENV_FILE"; set +a

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     Diagnóstico Traefik — Funil App               ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""

DASHBOARD_DOMAIN="${DASHBOARD_DOMAIN:-}"
[ -z "$DASHBOARD_DOMAIN" ] && err "DASHBOARD_DOMAIN não definido no .env"

# ── 1. Verificar API ────────────────────────────────────
info "API na porta 4000:"
API_BIND=$(ss -ltnp | grep ":4000" || true)
if echo "$API_BIND" | grep -q "0.0.0.0:4000"; then
  log "API escuta em 0.0.0.0:4000 ✅"
elif echo "$API_BIND" | grep -q "127.0.0.1:4000"; then
  err "API escuta em 127.0.0.1 — Docker NÃO alcança!"
elif [ -z "$API_BIND" ]; then
  warn "API NÃO escutando na porta 4000"
fi
echo ""

# ── 2. Verificar containers ─────────────────────────────
info "Status dos containers:"
for c in funnel-spa funnel-api-proxy funnel-rest-proxy; do
  if docker ps --format '{{.Names}}' | grep -q "^${c}$"; then
    log "$c ✅ rodando"
  else
    warn "$c ❌ NÃO rodando"
  fi
done

# Container antigo (deve ter sido removido)
if docker ps --format '{{.Names}}' | grep -q "^funnel-nginx-proxy$"; then
  warn "⚠ Container ANTIGO funnel-nginx-proxy ainda existe! Remova-o:"
  echo -e "    docker stop funnel-nginx-proxy && docker rm funnel-nginx-proxy"
fi
echo ""

# ── 3. Verificar rede ───────────────────────────────────
info "Rede dos containers vs Traefik:"
TRAEFIK_CONTAINER=$(docker ps --format '{{.Names}}' | grep -i traefik | head -1 || true)
if [ -n "$TRAEFIK_CONTAINER" ]; then
  TRAEFIK_NETS=$(docker inspect "$TRAEFIK_CONTAINER" \
    --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null || true)
  echo -e "  Traefik ($TRAEFIK_CONTAINER): ${TRAEFIK_NETS}"

  for c in funnel-spa funnel-api-proxy funnel-rest-proxy; do
    if docker ps --format '{{.Names}}' | grep -q "^${c}$"; then
      NETS=$(docker inspect "$c" \
        --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null || true)
      echo -e "  $c: ${NETS}"
    fi
  done
else
  warn "Traefik não encontrado!"
fi
echo ""

# ── 4. Detectar conflitos de host-rule ───────────────────
info "Buscando conflitos de host-rule para ${DASHBOARD_DOMAIN}..."
CONFLICTS=0
for cid in $(docker ps -q); do
  name=$(docker inspect --format '{{.Name}}' "$cid" | sed 's/^\///')
  labels=$(docker inspect --format '{{json .Config.Labels}}' "$cid" 2>/dev/null)

  # Pular nossos próprios containers
  case "$name" in funnel-spa|funnel-api-proxy|funnel-rest-proxy) continue;; esac

  if echo "$labels" | grep -qi "$DASHBOARD_DOMAIN"; then
    echo -e "  ${RED}⚠ CONFLITO:${NC} container ${CYAN}${name}${NC} tem labels para ${DASHBOARD_DOMAIN}"
    CONFLICTS=$((CONFLICTS + 1))
  fi
done

if [ "$CONFLICTS" -eq 0 ]; then
  log "Nenhum conflito de host-rule detectado ✅"
else
  warn "$CONFLICTS container(s) externo(s) com regras para ${DASHBOARD_DOMAIN}!"
  echo -e "  ${YELLOW}Remova as labels Traefik desses containers ou pare-os.${NC}"
fi
echo ""

# ── 5. Testar headers de resposta ────────────────────────
info "Identificando quem responde cada rota (via headers)..."
echo ""

for route in "/" "/login" "/admin"; do
  HEADERS=$(curl -sI "https://${DASHBOARD_DOMAIN}${route}" 2>/dev/null | head -5)
  STATUS=$(echo "$HEADERS" | head -1)
  SERVER=$(echo "$HEADERS" | grep -i "^server:" || echo "  server: (não informado)")
  echo -e "  ${CYAN}${route}${NC}: ${STATUS}"
  echo -e "    ${SERVER}"
done
echo ""

# ── 6. Testes completos ─────────────────────────────────
info "Testes de rota:"
echo ""

test_url() {
  local label="$1" url="$2" expected="$3" extra="${4:-}"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" $extra "$url" 2>/dev/null || echo "000")
  if echo "$expected" | grep -qw "$code"; then
    echo -e "  ${GREEN}✅${NC} ${label} → HTTP ${code}"
  else
    echo -e "  ${RED}❌${NC} ${label} → HTTP ${code} (esperado: ${expected})"
  fi
}

test_url "GET  /"                    "https://${DASHBOARD_DOMAIN}/"       "200"
test_url "GET  /login"               "https://${DASHBOARD_DOMAIN}/login"  "200"
test_url "GET  /admin"               "https://${DASHBOARD_DOMAIN}/admin"  "200"
test_url "POST /functions/v1/proxy"  "https://${DASHBOARD_DOMAIN}/functions/v1/typebot-proxy" "400 401" \
  "-X POST -H 'Content-Type: application/json' -d '{\"action\":\"list\"}'"
test_url "GET  /rest/v1/"            "https://${DASHBOARD_DOMAIN}/rest/v1/user_settings?select=id&limit=1" "200 401 406"

echo ""

# ── 7. Resultado ────────────────────────────────────────
FINAL_SPA=$(curl -s -o /dev/null -w "%{http_code}" "https://${DASHBOARD_DOMAIN}/" 2>/dev/null || echo "000")
if [ "$FINAL_SPA" = "200" ]; then
  echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  ✅ Roteamento OK!                                ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
  exit 0
fi

echo -e "${RED}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║  ❌ Roteamento com problemas                      ║${NC}"
echo -e "${RED}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}Correção:${NC} sudo bash self-host/setup-traefik.sh"
echo -e "  ${CYAN}Logs:${NC}     docker compose -f $APP_DIR/docker-compose.yml logs"
echo ""
