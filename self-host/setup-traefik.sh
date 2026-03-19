#!/usr/bin/env bash
set -euo pipefail

# ╔══════════════════════════════════════════════════════════════╗
# ║  Setup Traefik — Funil App                                   ║
# ║  Arquitetura: 3 containers (SPA + API proxy + REST proxy)    ║
# ║  Sem Nginx intermediário — Traefik roteia direto              ║
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
echo -e "${CYAN}║   Arquitetura: SPA + API proxy + REST proxy       ║${NC}"
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

# ── 3. Gerar ROUTER_PREFIX único (derivado do domínio) ───
ROUTER_PREFIX="funnel-$(echo "$DASHBOARD_DOMAIN" | sed 's/[^a-zA-Z0-9]/-/g' | tr '[:upper:]' '[:lower:]')"
log "Router prefix: ${ROUTER_PREFIX}"

# ── 4. Sincronizar backend do repo → /opt ────────────────
info "Sincronizando backend..."
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
  pm2 restart funnel-api --update-env 2>/dev/null || warn "PM2 restart falhou"
  sleep 2
  log "$SYNCED_FILES arquivo(s) sincronizado(s)"
else
  log "Backend já está atualizado"
fi

# ── 5. Validar que a API está escutando ──────────────────
info "Verificando API na porta 4000..."
sleep 1
API_LISTEN=$(ss -ltnp | grep ":4000" || true)
if echo "$API_LISTEN" | grep -q "0.0.0.0:4000"; then
  log "API escutando em 0.0.0.0:4000 ✅"
elif echo "$API_LISTEN" | grep -q "127.0.0.1:4000"; then
  err "API escutando em 127.0.0.1:4000 (NÃO acessível pelo Docker!)\n   Corrija server.listen() para '0.0.0.0' em $APP_DIR/api-server.js"
elif [ -z "$API_LISTEN" ]; then
  warn "API não está na porta 4000. Aguardando 5s..."
  sleep 5
  API_LISTEN=$(ss -ltnp | grep ":4000" || true)
  [ -z "$API_LISTEN" ] && err "API não iniciou na porta 4000. Verifique: pm2 logs funnel-api"
  log "API iniciou: $API_LISTEN"
fi

# ── 6. Detectar rede do Traefik ──────────────────────────
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

# ── 7. Parar containers antigos ──────────────────────────
info "Removendo containers antigos..."
for c in funnel-nginx-proxy funnel-spa funnel-api-proxy funnel-rest-proxy; do
  if docker ps -a --format '{{.Names}}' | grep -q "^${c}$"; then
    docker stop "$c" 2>/dev/null || true
    docker rm "$c" 2>/dev/null || true
    log "Removido: $c"
  fi
done

# ── 8. Verificar que o frontend existe ───────────────────
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

# ── 9. Gerar docker-compose.yml ──────────────────────────
info "Gerando docker-compose.yml..."
COMPOSE_FILE="$APP_DIR/docker-compose.yml"

sed -e "s/__DASHBOARD_DOMAIN__/${DASHBOARD_DOMAIN}/g" \
    -e "s/__PUBLIC_DOMAIN__/${PUBLIC_DOMAIN}/g" \
    -e "s/__ROUTER_PREFIX__/${ROUTER_PREFIX}/g" \
    "$REPO_DIR/self-host/docker-compose.traefik.yml.template" > "$COMPOSE_FILE"

if [ "$TRAEFIK_NETWORK" != "traefik-net" ]; then
  sed -i "s/traefik-net/${TRAEFIK_NETWORK}/g" "$COMPOSE_FILE"
fi

log "docker-compose.yml gerado"

# ── 10. Subir containers ────────────────────────────────
info "Subindo 3 containers..."
cd "$APP_DIR"
docker compose up -d --force-recreate 2>/dev/null || docker-compose up -d --force-recreate 2>/dev/null
log "Containers iniciados"

# ── 11. Aguardar e validar ──────────────────────────────
info "Aguardando containers..."
sleep 5

echo ""
echo -e "${CYAN}═══ Diagnóstico ═══${NC}"
echo ""

# Verificar containers rodando
ALL_UP=true
for c in funnel-spa funnel-api-proxy funnel-rest-proxy; do
  if docker ps --format '{{.Names}}' | grep -q "^${c}$"; then
    log "$c rodando ✅"
  else
    warn "$c NÃO está rodando ❌"
    ALL_UP=false
  fi
done
echo ""

if [ "$ALL_UP" = false ]; then
  err "Nem todos os containers subiram. Verifique: docker compose logs"
fi

# Teste: API via socat
info "Teste: funnel-api-proxy → host:4000"
API_TEST=$(docker exec funnel-api-proxy sh -c \
  "wget -q -O /dev/null -S http://host.docker.internal:4000/health 2>&1 | grep 'HTTP/' | awk '{print \$2}'" 2>/dev/null || echo "000")
# socat não tem curl/wget, testar de outra forma
API_TEST=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4000/health 2>/dev/null || echo "000")
if [ "$API_TEST" = "200" ]; then
  log "API respondendo (HTTP 200) ✅"
else
  warn "API health: HTTP ${API_TEST}"
fi

# Teste: SPA via static-web-server
info "Teste: funnel-spa servindo index.html"
# Encontrar IP do container SPA na rede traefik
SPA_IP=$(docker inspect funnel-spa --format "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" 2>/dev/null || true)
if [ -n "$SPA_IP" ]; then
  SPA_TEST=$(curl -s -o /dev/null -w "%{http_code}" "http://${SPA_IP}:8080/" 2>/dev/null || echo "000")
  if [ "$SPA_TEST" = "200" ]; then
    log "SPA servindo index.html (HTTP 200) ✅"
  else
    warn "SPA retornou HTTP ${SPA_TEST}"
  fi
else
  warn "Não conseguiu IP do funnel-spa"
fi

echo ""

# ── 12. Teste via URL pública ───────────────────────────
info "Testando rotas públicas via Traefik..."
sleep 2

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

echo ""
ROUTES_OK=true

test_route "GET  /"                    "https://${DASHBOARD_DOMAIN}/"       "200"         || ROUTES_OK=false
test_route "GET  /login"               "https://${DASHBOARD_DOMAIN}/login"  "200"         || ROUTES_OK=false
test_route "GET  /admin"               "https://${DASHBOARD_DOMAIN}/admin"  "200"         || ROUTES_OK=false
test_route "POST /functions/v1/proxy"  "https://${DASHBOARD_DOMAIN}/functions/v1/typebot-proxy" "400 401" \
  -X POST -H "Content-Type: application/json" -d '{"action":"list"}'                      || ROUTES_OK=false
test_route "GET  /rest/v1/"            "https://${DASHBOARD_DOMAIN}/rest/v1/user_settings?select=id&limit=1" "200 401 406" || ROUTES_OK=false

echo ""

if [ "$ROUTES_OK" = true ]; then
  echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  ✅ Tudo funcionando!                              ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "  ${CYAN}Dashboard:${NC}  https://${DASHBOARD_DOMAIN}"
  echo -e "  ${CYAN}Público:${NC}    https://${PUBLIC_DOMAIN}"
  echo -e "  ${CYAN}Containers:${NC} docker compose logs -f"
  echo ""
else
  echo -e "${YELLOW}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${YELLOW}║  ⚠ Algumas rotas falharam                        ║${NC}"
  echo -e "${YELLOW}╚══════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "  Diagnóstico: sudo bash self-host/fix-traefik-routing.sh"
  echo ""
fi
