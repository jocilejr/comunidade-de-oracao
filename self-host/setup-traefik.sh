#!/usr/bin/env bash
set -euo pipefail

# ╔══════════════════════════════════════════════════════════════╗
# ║  Setup Traefik — Funil App                                   ║
# ║  Configura container com labels Traefik + proxy para API      ║
# ║  Lê config de /opt/funnel-app/.env — zero perguntas           ║
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
[ "$EUID" -ne 0 ] && err "Execute como root: sudo bash self-host/setup-traefik.sh"
[ ! -f "$ENV_FILE" ] && err "$ENV_FILE não encontrado. Rode install.sh primeiro."

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       Setup Traefik — Funil App                   ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ── 2. Carregar variáveis ────────────────────────────────
set -a; source "$ENV_FILE"; set +a
DASHBOARD_DOMAIN="${DASHBOARD_DOMAIN:-}"
PUBLIC_DOMAIN="${PUBLIC_DOMAIN:-}"
[ -z "$DASHBOARD_DOMAIN" ] && err "DASHBOARD_DOMAIN não definido no .env"
[ -z "$PUBLIC_DOMAIN" ] && err "PUBLIC_DOMAIN não definido no .env"

log "Dashboard: ${DASHBOARD_DOMAIN}"
log "Público:   ${PUBLIC_DOMAIN}"

# ── 2b. Gerar ROUTER_PREFIX único (derivado do domínio) ──
# Transforma "dash.origemdavida.online" → "funnel-dash-origemdavida-online"
ROUTER_PREFIX="funnel-$(echo "$DASHBOARD_DOMAIN" | sed 's/[^a-zA-Z0-9]/-/g' | tr '[:upper:]' '[:lower:]')"
log "Router prefix: ${ROUTER_PREFIX}"

# ── 3. Sincronizar backend do repo → /opt ────────────────
info "Sincronizando backend do repositório para $APP_DIR..."

SYNCED_FILES=0
for f in api-server.js ecosystem.config.js; do
  if [ -f "$REPO_DIR/self-host/$f" ]; then
    if ! diff -q "$REPO_DIR/self-host/$f" "$APP_DIR/$f" >/dev/null 2>&1; then
      cp "$REPO_DIR/self-host/$f" "$APP_DIR/$f"
      log "Atualizado: $f"
      SYNCED_FILES=$((SYNCED_FILES + 1))
    fi
  fi
done

if [ "$SYNCED_FILES" -gt 0 ]; then
  info "Reiniciando funnel-api com código atualizado..."
  pm2 restart funnel-api --update-env 2>/dev/null || warn "PM2 restart falhou — verifique pm2 logs funnel-api"
  sleep 2
  log "$SYNCED_FILES arquivo(s) sincronizado(s) e API reiniciada"
else
  log "Backend já está atualizado em $APP_DIR"
fi

# ── 4. Validar que a API está escutando em 0.0.0.0 ──────
info "Verificando se a API escuta em 0.0.0.0:4000..."
sleep 1
API_LISTEN=$(ss -ltnp | grep ":4000" || true)
if echo "$API_LISTEN" | grep -q "0.0.0.0:4000"; then
  log "API escutando em 0.0.0.0:4000 (acessível pelo Docker)"
elif echo "$API_LISTEN" | grep -q "127.0.0.1:4000"; then
  err "API escutando em 127.0.0.1:4000 (NÃO acessível pelo Docker!)\n   O arquivo $APP_DIR/api-server.js precisa ter server.listen(PORT, \"0.0.0.0\", ...)\n   Corrija e rode novamente: pm2 restart funnel-api && sudo bash self-host/setup-traefik.sh"
elif [ -z "$API_LISTEN" ]; then
  warn "API NÃO está escutando na porta 4000. Aguardando 5s..."
  sleep 5
  API_LISTEN=$(ss -ltnp | grep ":4000" || true)
  if [ -z "$API_LISTEN" ]; then
    err "API não iniciou na porta 4000 após 7s.\n   Verifique: pm2 logs funnel-api"
  fi
  log "API iniciou: $API_LISTEN"
fi

# ── 5. Detectar rede do Traefik ──────────────────────────
info "Detectando rede do Traefik..."

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
      TRAEFIK_NETWORK="$net"
      break
    fi
  done
fi

if [ -z "$TRAEFIK_NETWORK" ]; then
  warn "Rede do Traefik não encontrada. Criando 'traefik-net'..."
  docker network create traefik-net 2>/dev/null || true
  TRAEFIK_NETWORK="traefik-net"
fi

log "Rede do Traefik: ${TRAEFIK_NETWORK}"

# ── 6. Parar container antigo (se existir) ───────────────
if docker ps -a --format '{{.Names}}' | grep -q "^funnel-nginx-proxy$"; then
  info "Parando container funnel-nginx-proxy antigo..."
  docker stop funnel-nginx-proxy 2>/dev/null || true
  docker rm funnel-nginx-proxy 2>/dev/null || true
  log "Container antigo removido"
fi

# ── 7. Gerar config Nginx do container ───────────────────
info "Gerando config Nginx interna..."
cp "$REPO_DIR/self-host/nginx-proxy.conf.template" "$APP_DIR/nginx-proxy.conf"
log "Config Nginx salva em $APP_DIR/nginx-proxy.conf"

# ── 8. Gerar docker-compose.yml com prefixo único ───────
info "Gerando docker-compose.yml com prefixo ${ROUTER_PREFIX}..."

COMPOSE_FILE="$APP_DIR/docker-compose.yml"

sed -e "s/__DASHBOARD_DOMAIN__/${DASHBOARD_DOMAIN}/g" \
    -e "s/__PUBLIC_DOMAIN__/${PUBLIC_DOMAIN}/g" \
    -e "s/__ROUTER_PREFIX__/${ROUTER_PREFIX}/g" \
    "$REPO_DIR/self-host/docker-compose.traefik.yml.template" > "$COMPOSE_FILE"

if [ "$TRAEFIK_NETWORK" != "traefik-net" ]; then
  sed -i "s/traefik-net/${TRAEFIK_NETWORK}/g" "$COMPOSE_FILE"
fi

log "docker-compose.yml gerado em $COMPOSE_FILE"

# ── 9. Verificar que o frontend existe ───────────────────
if [ ! -d "$APP_DIR/dist" ] || [ ! -f "$APP_DIR/dist/index.html" ]; then
  warn "Frontend não encontrado em $APP_DIR/dist. Buildando..."
  cd "$REPO_DIR"

  cat > "$REPO_DIR/.env.local" <<BUILDENV
VITE_SUPABASE_URL=https://${DASHBOARD_DOMAIN}
VITE_SUPABASE_PUBLISHABLE_KEY=${ANON_KEY:-self-host-anon-key}
VITE_SUPABASE_PROJECT_ID=self-hosted
VITE_PUBLIC_DOMAIN=https://${PUBLIC_DOMAIN}
BUILDENV

  npm ci --prefer-offline 2>/dev/null || npm install 2>/dev/null
  npm run build
  rm -rf "$APP_DIR/dist"
  cp -r "$REPO_DIR/dist" "$APP_DIR/dist"
  log "Frontend buildado e copiado"
fi

# ── 10. Subir container ─────────────────────────────────
info "Subindo container..."
cd "$APP_DIR"
docker compose up -d --force-recreate 2>/dev/null || docker-compose up -d --force-recreate 2>/dev/null
log "Container funnel-nginx-proxy iniciado"

# ── 11. Aguardar e validar conectividade ────────────────
info "Aguardando container iniciar..."
sleep 3

echo ""
echo -e "${CYAN}═══ Diagnóstico de Conectividade ═══${NC}"
echo ""

# Test 1: Container → API health
info "Teste 1: Container → API (host.docker.internal:4000/health)"
HEALTH_TEST=$(docker exec funnel-nginx-proxy \
  curl -s -o /dev/null -w "%{http_code}" \
  http://host.docker.internal:4000/health 2>/dev/null || echo "000")

if [ "$HEALTH_TEST" = "200" ]; then
  log "✅ Container alcança a API (HTTP 200)"
else
  echo ""
  warn "❌ Container NÃO alcança a API (HTTP ${HEALTH_TEST})"
  echo ""
  if [ "$HEALTH_TEST" = "000" ]; then
    info "Causa provável: host.docker.internal não resolve ou porta 4000 inacessível"
    echo ""
    echo -e "  ${CYAN}Verificações:${NC}"
    echo -e "  1. DNS interno do container:"
    docker exec funnel-nginx-proxy sh -c "getent hosts host.docker.internal 2>/dev/null || echo '  FALHOU: host.docker.internal não resolve'" || true
    echo -e "  2. API escutando no host:"
    ss -ltnp | grep ":4000" || echo "     NENHUM processo na porta 4000!"
    echo -e "  3. Teste direto do host:"
    LOCAL_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4000/health 2>/dev/null || echo "000")
    echo "     curl http://127.0.0.1:4000/health → HTTP ${LOCAL_HEALTH}"
  fi
  echo ""
  err "Container não alcança a API. Corrija o problema acima antes de continuar."
fi

# Test 2: Container → API proxy route
info "Teste 2: Container → API proxy (/functions/v1/typebot-proxy)"
PROXY_TEST=$(docker exec funnel-nginx-proxy \
  curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:8080/functions/v1/typebot-proxy \
  -H 'Content-Type: application/json' -d '{"action":"list"}' 2>/dev/null || echo "000")

if [ "$PROXY_TEST" = "401" ] || [ "$PROXY_TEST" = "400" ]; then
  log "✅ Proxy /functions/v1/ funciona (HTTP ${PROXY_TEST})"
else
  warn "⚠ Proxy /functions/v1/ retornou HTTP ${PROXY_TEST} (esperado 401 ou 400)"
fi

# Test 3: Container → PostgREST
info "Teste 3: Container → PostgREST (/rest/v1/)"
REST_TEST=$(docker exec funnel-nginx-proxy \
  curl -s -o /dev/null -w "%{http_code}" \
  http://localhost:8080/rest/v1/ 2>/dev/null || echo "000")

if [ "$REST_TEST" != "000" ] && [ "$REST_TEST" != "502" ] && [ "$REST_TEST" != "503" ]; then
  log "✅ PostgREST acessível (HTTP ${REST_TEST})"
else
  warn "⚠ PostgREST inacessível (HTTP ${REST_TEST}) — user_settings não carregará no frontend"
fi

# Test 4: Container → SPA (index.html)
info "Teste 4: Container → SPA (/)"
SPA_TEST=$(docker exec funnel-nginx-proxy \
  curl -s -o /dev/null -w "%{http_code}" \
  http://localhost:8080/ 2>/dev/null || echo "000")

if [ "$SPA_TEST" = "200" ]; then
  log "✅ SPA servindo index.html (HTTP 200)"
else
  warn "⚠ SPA retornou HTTP ${SPA_TEST} (esperado 200)"
fi

echo ""

# ── 12. Teste via URL pública ───────────────────────────
info "Testando rotas públicas via Traefik..."
sleep 2

PUBLIC_PROXY=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "https://${DASHBOARD_DOMAIN}/functions/v1/typebot-proxy" \
  -H 'Content-Type: application/json' -d '{"action":"list"}' 2>/dev/null || echo "000")

PUBLIC_REST=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://${DASHBOARD_DOMAIN}/rest/v1/user_settings?select=id&limit=1" 2>/dev/null || echo "000")

PUBLIC_SPA=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://${DASHBOARD_DOMAIN}/" 2>/dev/null || echo "000")

PUBLIC_ADMIN=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://${DASHBOARD_DOMAIN}/admin" 2>/dev/null || echo "000")

echo ""
ROUTES_OK=true

echo -e "  ${CYAN}POST /functions/v1/typebot-proxy${NC} → HTTP ${PUBLIC_PROXY}"
if [ "$PUBLIC_PROXY" = "502" ] || [ "$PUBLIC_PROXY" = "405" ] || [ "$PUBLIC_PROXY" = "000" ] || [ "$PUBLIC_PROXY" = "500" ]; then
  ROUTES_OK=false
fi

echo -e "  ${CYAN}GET  /rest/v1/user_settings${NC}      → HTTP ${PUBLIC_REST}"
if [ "$PUBLIC_REST" = "502" ] || [ "$PUBLIC_REST" = "405" ] || [ "$PUBLIC_REST" = "000" ] || [ "$PUBLIC_REST" = "500" ]; then
  ROUTES_OK=false
fi

echo -e "  ${CYAN}GET  / (SPA)${NC}                     → HTTP ${PUBLIC_SPA}"
if [ "$PUBLIC_SPA" = "404" ] || [ "$PUBLIC_SPA" = "500" ] || [ "$PUBLIC_SPA" = "502" ] || [ "$PUBLIC_SPA" = "000" ]; then
  ROUTES_OK=false
fi

echo -e "  ${CYAN}GET  /admin${NC}                      → HTTP ${PUBLIC_ADMIN}"
if [ "$PUBLIC_ADMIN" = "500" ] || [ "$PUBLIC_ADMIN" = "502" ] || [ "$PUBLIC_ADMIN" = "000" ]; then
  ROUTES_OK=false
fi

echo ""

if [ "$ROUTES_OK" = true ]; then
  echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  ✅ Tudo funcionando!                              ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "  ${CYAN}Dashboard:${NC}  https://${DASHBOARD_DOMAIN}"
  echo -e "  ${CYAN}Público:${NC}    https://${PUBLIC_DOMAIN}"
  echo -e "  ${CYAN}Container:${NC}  docker logs funnel-nginx-proxy"
  echo ""
else
  echo -e "${YELLOW}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${YELLOW}║  ⚠ Algumas rotas públicas falharam                ║${NC}"
  echo -e "${YELLOW}╚══════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "O container está configurado e alcança a API internamente."
  echo -e "O problema está no roteamento do Traefik. Possíveis causas:"
  echo ""
  echo -e "  1. ${CYAN}Conflito de routers${NC}: outro container já tem regras para ${DASHBOARD_DOMAIN}"
  echo -e "     → Remova labels de Traefik duplicadas nos outros containers"
  echo ""
  echo -e "  2. ${CYAN}Rede diferente${NC}: verifique se o Traefik e funnel-nginx-proxy compartilham a rede"
  echo -e "     → docker network inspect ${TRAEFIK_NETWORK}"
  echo ""
  echo -e "  3. ${CYAN}Cache do Traefik${NC}: aguarde 30s e teste novamente"
  echo ""
  echo -e "  ${CYAN}Debug:${NC}"
  echo -e "     docker logs funnel-nginx-proxy"
  echo -e "     docker logs \$(docker ps --format '{{.Names}}' | grep traefik | head -1)"
  echo ""
  echo -e "  ${CYAN}Diagnóstico completo:${NC}"
  echo -e "     sudo bash self-host/fix-traefik-routing.sh"
  echo ""
fi
