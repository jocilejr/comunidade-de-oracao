#!/usr/bin/env bash
set -euo pipefail

# ╔══════════════════════════════════════════════════════════════╗
# ║  Fix Traefik Routing — Funil App                            ║
# ║  Diagnostica e corrige roteamento quando Traefik gerencia   ║
# ║  as portas 80/443 na frente do Nginx do host.               ║
# ╚══════════════════════════════════════════════════════════════╝

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}[i]${NC} $1"; }

APP_DIR="/opt/funnel-app"
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

# ── 1. Detectar quem controla a porta 443 ────────────────
info "Quem escuta na porta 443:"
ss -ltnp | grep ':443' || true
echo ""

TRAEFIK_OWNS_443=$(ss -ltnp | grep ':443' | grep -c 'docker-proxy' || true)
if [ "$TRAEFIK_OWNS_443" -eq 0 ]; then
  log "Nginx do host controla a porta 443 — este script não é necessário."
  log "Use: sudo bash self-host/update.sh"
  exit 0
fi

warn "docker-proxy controla a porta 443 → Traefik está na frente do Nginx."
echo ""

# ── 2. Listar containers e labels relevantes ─────────────
info "Containers Docker ativos:"
docker ps --format 'table {{.Names}}\t{{.Ports}}\t{{.Image}}' | head -20
echo ""

info "Labels do Traefik para o domínio ${DASHBOARD_DOMAIN}:"
for cid in $(docker ps -q); do
  name=$(docker inspect --format '{{.Name}}' "$cid" | sed 's/^\///')
  labels=$(docker inspect --format '{{json .Config.Labels}}' "$cid" 2>/dev/null)
  
  if echo "$labels" | grep -qi "$DASHBOARD_DOMAIN"; then
    echo ""
    echo -e "  ${CYAN}Container: ${name}${NC}"
    echo "$labels" | python3 -m json.tool 2>/dev/null | grep -i "traefik" | head -20
  fi
done
echo ""

# ── 3. Verificar se funnel-nginx-proxy existe ────────────
if docker ps --format '{{.Names}}' | grep -q "funnel-nginx-proxy"; then
  log "Container funnel-nginx-proxy está rodando"
  
  # Verificar se tem as rotas de backend
  info "Testando roteamento interno do funnel-nginx-proxy:"
  INTERNAL_TEST=$(docker exec funnel-nginx-proxy curl -s -o /dev/null -w "%{http_code}" \
    -X POST http://host.docker.internal:4000/typebot-proxy \
    -H 'Content-Type: application/json' -d '{"action":"list"}' 2>/dev/null || echo "000")
  
  if [ "$INTERNAL_TEST" = "401" ] || [ "$INTERNAL_TEST" = "400" ]; then
    log "funnel-nginx-proxy alcança a API (HTTP ${INTERNAL_TEST})"
  else
    warn "funnel-nginx-proxy não alcança a API (HTTP ${INTERNAL_TEST})"
  fi
else
  warn "Container funnel-nginx-proxy NÃO está rodando"
  info "Verifique o docker-compose que criou este container"
fi

# ── 4. Teste direto via URL pública ──────────────────────
info "Testando URL pública..."
PUBLIC_TEST=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "https://${DASHBOARD_DOMAIN}/functions/v1/typebot-proxy" \
  -H 'Content-Type: application/json' -d '{"action":"list"}' 2>/dev/null || echo "000")

echo ""
if [ "$PUBLIC_TEST" = "401" ] || [ "$PUBLIC_TEST" = "400" ]; then
  echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  ✅ Roteamento OK! (HTTP ${PUBLIC_TEST})                   ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
  exit 0
fi

echo -e "${RED}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║  ❌ Roteamento FALHOU (HTTP ${PUBLIC_TEST})                 ║${NC}"
echo -e "${RED}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ── 5. Instruções de correção ────────────────────────────
echo -e "${YELLOW}═══ COMO CORRIGIR ═══${NC}"
echo ""
echo "O Traefik precisa rotear os paths de backend para o funnel-nginx-proxy."
echo "No seu docker-compose do Traefik, adicione estas labels ao serviço"
echo "funnel-nginx-proxy (ou ao container que faz proxy para a API na porta 4000):"
echo ""
echo -e "${CYAN}labels:${NC}"
echo '  # Router para paths de API (prioridade alta)'
echo "  - \"traefik.http.routers.funnel-api.rule=Host(\`${DASHBOARD_DOMAIN}\`) && (PathPrefix(\`/functions/v1\`) || PathPrefix(\`/auth/v1\`) || PathPrefix(\`/rest/v1\`) || PathPrefix(\`/api\`))\""
echo "  - \"traefik.http.routers.funnel-api.entrypoints=websecure\""
echo "  - \"traefik.http.routers.funnel-api.tls.certresolver=letsencrypt\""
echo "  - \"traefik.http.routers.funnel-api.priority=100\""
echo "  - \"traefik.http.routers.funnel-api.service=funnel-api-svc\""
echo "  - \"traefik.http.services.funnel-api-svc.loadbalancer.server.port=8080\""
echo ""
echo '  # Router para SPA (prioridade baixa — fallback)'
echo "  - \"traefik.http.routers.funnel-spa.rule=Host(\`${DASHBOARD_DOMAIN}\`)\""
echo "  - \"traefik.http.routers.funnel-spa.entrypoints=websecure\""
echo "  - \"traefik.http.routers.funnel-spa.tls.certresolver=letsencrypt\""
echo "  - \"traefik.http.routers.funnel-spa.priority=1\""
echo ""
echo -e "${YELLOW}Depois de editar, reinicie a stack:${NC}"
echo "  docker compose up -d"
echo ""
echo -e "${YELLOW}E valide:${NC}"
echo "  curl -s -X POST https://${DASHBOARD_DOMAIN}/functions/v1/typebot-proxy \\"
echo "    -H 'Content-Type: application/json' -d '{\"action\":\"list\"}'"
echo "  # Esperado: JSON com 'Missing authorization' ou erro de token"
echo ""
