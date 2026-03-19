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

# ── 3. Detectar rede do Traefik ──────────────────────────
info "Detectando rede do Traefik..."

TRAEFIK_NETWORK=""

# Tentar encontrar a rede que o container Traefik usa
TRAEFIK_CONTAINER=$(docker ps --format '{{.Names}}' | grep -i traefik | head -1 || true)
if [ -n "$TRAEFIK_CONTAINER" ]; then
  TRAEFIK_NETWORK=$(docker inspect "$TRAEFIK_CONTAINER" \
    --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null \
    | tr ' ' '\n' | grep -v '^bridge$' | grep -v '^$' | head -1 || true)
fi

if [ -z "$TRAEFIK_NETWORK" ]; then
  # Fallback: procurar redes comuns
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

# ── 4. Parar container antigo (se existir) ───────────────
if docker ps -a --format '{{.Names}}' | grep -q "^funnel-nginx-proxy$"; then
  info "Parando container funnel-nginx-proxy antigo..."
  docker stop funnel-nginx-proxy 2>/dev/null || true
  docker rm funnel-nginx-proxy 2>/dev/null || true
  log "Container antigo removido"
fi

# ── 5. Gerar config Nginx do container ───────────────────
info "Gerando config Nginx interna..."
cp "$REPO_DIR/self-host/nginx-proxy.conf.template" "$APP_DIR/nginx-proxy.conf"
log "Config Nginx salva em $APP_DIR/nginx-proxy.conf"

# ── 6. Gerar docker-compose.yml ──────────────────────────
info "Gerando docker-compose.yml..."

COMPOSE_FILE="$APP_DIR/docker-compose.yml"

sed -e "s/__DASHBOARD_DOMAIN__/${DASHBOARD_DOMAIN}/g" \
    -e "s/__PUBLIC_DOMAIN__/${PUBLIC_DOMAIN}/g" \
    "$REPO_DIR/self-host/docker-compose.traefik.yml.template" > "$COMPOSE_FILE"

# Substituir nome da rede se diferente de traefik-net
if [ "$TRAEFIK_NETWORK" != "traefik-net" ]; then
  sed -i "s/traefik-net/${TRAEFIK_NETWORK}/g" "$COMPOSE_FILE"
fi

log "docker-compose.yml gerado em $COMPOSE_FILE"

# ── 7. Verificar que o frontend existe ───────────────────
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

# ── 8. Subir container ──────────────────────────────────
info "Subindo container..."
cd "$APP_DIR"
docker compose up -d --force-recreate 2>/dev/null || docker-compose up -d --force-recreate 2>/dev/null
log "Container funnel-nginx-proxy iniciado"

# ── 9. Aguardar e validar ───────────────────────────────
info "Aguardando container iniciar..."
sleep 3

# Teste interno (container → host)
INTERNAL_TEST=$(docker exec funnel-nginx-proxy \
  curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://host.docker.internal:4000/typebot-proxy \
  -H 'Content-Type: application/json' -d '{"action":"list"}' 2>/dev/null || echo "000")

if [ "$INTERNAL_TEST" = "401" ] || [ "$INTERNAL_TEST" = "400" ]; then
  log "Container alcança a API local (HTTP ${INTERNAL_TEST})"
else
  warn "Container não alcança a API (HTTP ${INTERNAL_TEST})"
  warn "Verificando se a API está rodando..."
  API_LOCAL=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4000/health 2>/dev/null || echo "000")
  if [ "$API_LOCAL" != "200" ]; then
    warn "API não está respondendo na porta 4000. Execute: pm2 restart funnel-api"
  else
    warn "API local OK, mas container não alcança. Verifique: docker logs funnel-nginx-proxy"
  fi
fi

# Teste via URL pública (depende de propagação DNS + Traefik)
info "Testando rota pública..."
sleep 2
PUBLIC_TEST=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "https://${DASHBOARD_DOMAIN}/functions/v1/typebot-proxy" \
  -H 'Content-Type: application/json' -d '{"action":"list"}' 2>/dev/null || echo "000")

echo ""
if [ "$PUBLIC_TEST" = "401" ] || [ "$PUBLIC_TEST" = "400" ]; then
  echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  ✅ Roteamento OK! (HTTP ${PUBLIC_TEST})                   ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "  ${CYAN}Dashboard:${NC}  https://${DASHBOARD_DOMAIN}"
  echo -e "  ${CYAN}Público:${NC}    https://${PUBLIC_DOMAIN}"
  echo -e "  ${CYAN}Container:${NC}  docker logs funnel-nginx-proxy"
  echo ""
else
  echo -e "${YELLOW}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${YELLOW}║  ⚠ Rota pública retornou HTTP ${PUBLIC_TEST}               ║${NC}"
  echo -e "${YELLOW}╚══════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "O container foi configurado. Possíveis causas do HTTP ${PUBLIC_TEST}:"
  echo ""
  echo -e "  1. ${CYAN}Conflito de routers${NC}: outro container já tem regras para ${DASHBOARD_DOMAIN}"
  echo -e "     → Remova labels de Traefik duplicadas nos outros containers"
  echo ""
  echo -e "  2. ${CYAN}Rede diferente${NC}: o Traefik e o funnel-nginx-proxy precisam compartilhar a rede"
  echo -e "     → Verifique: docker network inspect ${TRAEFIK_NETWORK}"
  echo ""
  echo -e "  3. ${CYAN}Cache do Traefik${NC}: pode levar alguns segundos para atualizar"
  echo -e "     → Aguarde 30s e teste novamente:"
  echo -e "     curl -s -X POST https://${DASHBOARD_DOMAIN}/functions/v1/typebot-proxy \\"
  echo -e "       -H 'Content-Type: application/json' -d '{\"action\":\"list\"}'"
  echo ""
  echo -e "  ${CYAN}Debug:${NC}"
  echo -e "     docker logs funnel-nginx-proxy"
  echo -e "     docker exec funnel-nginx-proxy curl -s http://host.docker.internal:4000/health"
  echo ""
fi
