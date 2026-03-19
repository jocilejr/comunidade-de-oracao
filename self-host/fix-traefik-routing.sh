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

# ── 0. Sincronizar backend (mesma lógica do setup-traefik) ─
info "Verificando se backend em $APP_DIR está atualizado..."
SYNCED=0
for f in api-server.js ecosystem.config.js; do
  if [ -f "$REPO_DIR/self-host/$f" ]; then
    if ! diff -q "$REPO_DIR/self-host/$f" "$APP_DIR/$f" >/dev/null 2>&1; then
      cp "$REPO_DIR/self-host/$f" "$APP_DIR/$f"
      log "Atualizado: $f"
      SYNCED=$((SYNCED + 1))
    fi
  fi
done
if [ "$SYNCED" -gt 0 ]; then
  pm2 restart funnel-api --update-env 2>/dev/null || warn "PM2 restart falhou"
  sleep 2
  log "Backend sincronizado e reiniciado"
fi

# ── 1. Verificar como a API está escutando ───────────────
info "Verificando bind da API na porta 4000:"
API_BIND=$(ss -ltnp | grep ":4000" || true)
if [ -z "$API_BIND" ]; then
  warn "API NÃO está escutando na porta 4000!"
  info "Tentando: pm2 restart funnel-api"
  pm2 restart funnel-api --update-env 2>/dev/null || true
  sleep 3
  API_BIND=$(ss -ltnp | grep ":4000" || true)
fi

if echo "$API_BIND" | grep -q "0.0.0.0:4000"; then
  log "API escuta em 0.0.0.0:4000 ✅"
elif echo "$API_BIND" | grep -q "127.0.0.1:4000"; then
  err "API escuta em 127.0.0.1 — Docker NÃO alcança!\n   Corrija server.listen() em $APP_DIR/api-server.js para '0.0.0.0'"
else
  echo "  $API_BIND"
fi
echo ""

# ── 2. Detectar quem controla a porta 443 ────────────────
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

# ── 3. Listar containers e labels relevantes ─────────────
info "Containers Docker ativos:"
docker ps --format 'table {{.Names}}\t{{.Ports}}\t{{.Image}}' | head -20
echo ""

# ── 4. Detectar TODOS os routers Traefik (conflitos) ─────
info "Buscando TODOS os routers Traefik configurados em containers ativos..."
echo ""

ROUTER_NAMES_FILE=$(mktemp)
for cid in $(docker ps -q); do
  name=$(docker inspect --format '{{.Name}}' "$cid" | sed 's/^\///')
  labels=$(docker inspect --format '{{json .Config.Labels}}' "$cid" 2>/dev/null)

  # Extrair nomes de routers
  ROUTERS=$(echo "$labels" | grep -oP '"traefik\.http\.routers\.([^.]+)\.rule"' | sed 's/"traefik\.http\.routers\.//;s/\.rule"//' || true)

  if [ -n "$ROUTERS" ]; then
    for router in $ROUTERS; do
      RULE=$(echo "$labels" | grep -oP "\"traefik\.http\.routers\.${router}\.rule\":\s*\"[^\"]+\"" | sed 's/.*: *"//;s/"$//' || true)
      echo "$router|$name|$RULE" >> "$ROUTER_NAMES_FILE"

      # Destacar se toca nosso domínio
      if echo "$RULE" | grep -qi "$DASHBOARD_DOMAIN"; then
        echo -e "  ${CYAN}${name}${NC} → router ${YELLOW}${router}${NC} → ${RULE}"
      fi
    done
  fi
done
echo ""

# Detectar nomes de routers duplicados
info "Verificando routers duplicados..."
DUPES=$(cut -d'|' -f1 "$ROUTER_NAMES_FILE" | sort | uniq -d)
if [ -n "$DUPES" ]; then
  echo ""
  echo -e "  ${RED}⚠ ROUTERS DUPLICADOS DETECTADOS:${NC}"
  for dup in $DUPES; do
    echo -e "    ${RED}${dup}${NC} — definido em:"
    grep "^${dup}|" "$ROUTER_NAMES_FILE" | while IFS='|' read -r _ container rule; do
      echo -e "      → container ${CYAN}${container}${NC}: ${rule}"
    done
  done
  echo ""
  warn "Routers duplicados causam conflito! O Traefik pode rotear para o container errado."
  warn "Solução: rode setup-traefik.sh para usar nomes únicos por domínio."
else
  log "Nenhum router duplicado detectado ✅"
fi
rm -f "$ROUTER_NAMES_FILE"
echo ""

# ── 5. Verificar se funnel-nginx-proxy existe ────────────
if docker ps --format '{{.Names}}' | grep -q "funnel-nginx-proxy"; then
  log "Container funnel-nginx-proxy está rodando"

  info "Resolvendo host.docker.internal dentro do container:"
  docker exec funnel-nginx-proxy sh -c "getent hosts host.docker.internal 2>/dev/null || echo 'FALHOU: não resolve'" || true
  echo ""

  info "Testando roteamento interno do funnel-nginx-proxy:"
  INTERNAL_TEST=$(docker exec funnel-nginx-proxy curl -s -o /dev/null -w "%{http_code}" \
    http://host.docker.internal:4000/health 2>/dev/null || echo "000")

  if [ "$INTERNAL_TEST" = "200" ]; then
    log "Container alcança a API (HTTP ${INTERNAL_TEST}) ✅"
  else
    warn "Container NÃO alcança a API (HTTP ${INTERNAL_TEST})"
    if [ "$INTERNAL_TEST" = "000" ]; then
      info "Causa: DNS falha ou porta inacessível. Verifique extra_hosts no docker-compose.yml"
    fi
  fi

  # Testar SPA dentro do container
  info "Testando SPA dentro do container:"
  SPA_INTERNAL=$(docker exec funnel-nginx-proxy curl -s -o /dev/null -w "%{http_code}" \
    http://localhost:8080/ 2>/dev/null || echo "000")
  if [ "$SPA_INTERNAL" = "200" ]; then
    log "SPA servindo index.html dentro do container (HTTP 200) ✅"
  else
    warn "SPA retornou HTTP ${SPA_INTERNAL} dentro do container"
  fi
else
  warn "Container funnel-nginx-proxy NÃO está rodando"
  info "Execute: sudo bash self-host/setup-traefik.sh"
fi
echo ""

# ── 6. Testes completos via URL pública ──────────────────
info "Testando URLs públicas..."
echo ""

test_url() {
  local label="$1"
  local method="$2"
  local url="$3"
  local expected="$4"
  local extra_args="${5:-}"

  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" $extra_args "$url" 2>/dev/null || echo "000")

  if echo "$expected" | grep -qw "$code"; then
    echo -e "  ${GREEN}✅${NC} ${label} → HTTP ${code}"
  else
    echo -e "  ${RED}❌${NC} ${label} → HTTP ${code} (esperado: ${expected})"
  fi
}

test_url "GET  https://${DASHBOARD_DOMAIN}/"       GET  "https://${DASHBOARD_DOMAIN}/"       "200"
test_url "GET  https://${DASHBOARD_DOMAIN}/login"   GET  "https://${DASHBOARD_DOMAIN}/login"   "200"
test_url "GET  https://${DASHBOARD_DOMAIN}/admin"   GET  "https://${DASHBOARD_DOMAIN}/admin"   "200"
test_url "POST /functions/v1/typebot-proxy"          POST "https://${DASHBOARD_DOMAIN}/functions/v1/typebot-proxy" "400 401" "-X POST -H 'Content-Type: application/json' -d '{\"action\":\"list\"}'"
test_url "GET  /rest/v1/user_settings"               GET  "https://${DASHBOARD_DOMAIN}/rest/v1/user_settings?select=id&limit=1" "200 401 406"

echo ""

# ── 7. Resultado e sugestão de ação ──────────────────────
# Re-test critical SPA route
FINAL_SPA=$(curl -s -o /dev/null -w "%{http_code}" "https://${DASHBOARD_DOMAIN}/" 2>/dev/null || echo "000")
FINAL_ADMIN=$(curl -s -o /dev/null -w "%{http_code}" "https://${DASHBOARD_DOMAIN}/admin" 2>/dev/null || echo "000")

if [ "$FINAL_SPA" = "200" ] && [ "$FINAL_ADMIN" = "200" ]; then
  echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  ✅ Roteamento OK!                                ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
  exit 0
fi

echo -e "${RED}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║  ❌ Roteamento com problemas                      ║${NC}"
echo -e "${RED}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ── 8. Auto-fix: oferecer recriar com prefixo único ─────
echo -e "${YELLOW}═══ CORREÇÃO AUTOMÁTICA ═══${NC}"
echo ""
echo -e "O setup-traefik.sh agora usa nomes de routers únicos por domínio,"
echo -e "eliminando conflitos com outros containers na VPS."
echo ""
echo -e "  ${CYAN}Execute:${NC}"
echo -e "    sudo bash self-host/setup-traefik.sh"
echo ""
echo -e "  Isso vai:"
echo -e "    1. Gerar labels com prefixo único (baseado no domínio)"
echo -e "    2. Recriar o container funnel-nginx-proxy"
echo -e "    3. Validar conectividade interna e pública"
echo ""
echo -e "${YELLOW}Se o problema persistir após setup-traefik.sh:${NC}"
echo ""
echo -e "  1. Verifique se outro container tem labels Traefik para ${DASHBOARD_DOMAIN}"
echo -e "     → docker inspect <container> | grep traefik"
echo ""
echo -e "  2. Verifique a rede compartilhada com o Traefik"
echo -e "     → docker network inspect \$(docker inspect \$(docker ps --format '{{.Names}}' | grep traefik | head -1) --format '{{range \$k, \$v := .NetworkSettings.Networks}}{{\$k}} {{end}}')"
echo ""
echo -e "  3. Reinicie o Traefik para limpar cache de routers"
echo -e "     → docker restart \$(docker ps --format '{{.Names}}' | grep traefik | head -1)"
echo ""
