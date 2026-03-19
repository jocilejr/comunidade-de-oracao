# Self-Host — Funil App

Instale a aplicação completa na sua VPS com um único comando.

## Requisitos

- **Ubuntu 22.04+** ou Debian 12+ (x86_64 ou ARM64)
- **1 GB RAM** mínimo (2 GB recomendado)
- **2 domínios** com DNS apontando para o IP da VPS:
  - **Domínio público** (ex: `meulink.com.br`) — URLs de compartilhamento com preview
  - **Domínio do dashboard** (ex: `admin.meusite.com.br`) — painel admin + API
- **Portas 80 e 443** abertas no firewall

## Instalação

```bash
# 1. Clone o repositório
git clone <URL_DO_REPO> /tmp/funnel-app
cd /tmp/funnel-app

# 2. Execute o instalador
sudo bash self-host/install.sh
```

O script pedirá:

| Campo | Exemplo |
|-------|---------|
| Domínio público | `meulink.com.br` |
| Domínio dashboard | `admin.meusite.com.br` |
| Email admin | `admin@email.com` |
| Senha admin | `SuaSenhaForte123` |
| Email SSL | `ssl@email.com` |

## Arquitetura

```
Internet
   │
   ├── meulink.com.br (domínio público)
   │     ├── /meu-slug (crawler) → API → HTML com OG tags + preview
   │     ├── /meu-slug (humano)  → redirect → dashboard/f/meu-slug
   │     └── /api/preview-image  → imagem binária
   │
   └── admin.meusite.com.br (dashboard)
         ├── /            → SPA React (painel admin)
         ├── /f/:slug     → SPA React (renderização do funil)
         ├── /login       → SPA React (tela de login)
         ├── /api/*       → API server
         ├── /rest/v1/*   → PostgREST
         └── /auth/v1/*   → GoTrue
```

### Como funciona o preview social

Quando alguém compartilha `https://meulink.com.br/meu-funil` no WhatsApp:

1. **Crawler** (WhatsApp bot) acessa a URL → Nginx detecta o User-Agent → proxy para API → retorna HTML com OG tags (título, descrição, imagem)
2. **Humano** clica no link → Nginx redireciona para `https://admin.meusite.com.br/f/meu-funil` → SPA renderiza o funil

**Resultado**: URLs limpas (`dominio.com/slug`) com preview funcional em todas as redes sociais.

## Gerenciamento

```bash
pm2 status          # Ver status dos serviços
pm2 logs            # Logs em tempo real
pm2 restart all     # Reiniciar tudo
certbot renew       # Renovar SSL (automático via cron)
```

## Atualização

> **Importante**: O PM2 executa o código de `/opt/funnel-app/`, **não** do diretório do repositório.
> Um simples `git pull + pm2 restart` **não** atualiza o código em produção.

Use **sempre** o script de atualização oficial:

```bash
cd /tmp/funnel-app && git pull   # ou ~/comunidade-de-oracao
sudo bash self-host/update.sh    # sincroniza para /opt, rebuild, restart
```

O `update.sh` cuida de:
1. Copiar `api-server.js` e `ecosystem.config.js` para `/opt/funnel-app/`
2. Executar migrations SQL pendentes
3. Rebuild do frontend (se necessário)
4. `pm2 restart` com `--update-env`
5. **Auto-heal Traefik** — se detectar Traefik na porta 443, roda `setup-traefik.sh` e smoke tests

## Traefik (proxy externo)

Se a sua VPS já usa **Traefik** para gerenciar SSL/portas 80+443, o Nginx do host não recebe tráfego externo diretamente.

### Estratégia de namespacing

Para evitar conflitos com outros containers na VPS, o sistema usa **nomes de routers únicos** derivados do domínio:

```
domínio: dash.origemdavida.online
prefixo: funnel-dash-origemdavida-online

routers gerados:
  funnel-dash-origemdavida-online-api     (API, prioridade 100)
  funnel-dash-origemdavida-online-spa     (SPA, prioridade 10)
  funnel-dash-origemdavida-online-pub     (domínio público, prioridade 10)
  funnel-dash-origemdavida-online-dash-http (redirect HTTP→HTTPS)
  funnel-dash-origemdavida-online-pub-http  (redirect HTTP→HTTPS)
```

Isso garante que **nenhum outro container** na VPS colida com os routers do funil.

### Configuração automática

```bash
# Configura ou reconfigura tudo automaticamente
sudo bash self-host/setup-traefik.sh
```

O `setup-traefik.sh`:
1. Gera prefixo único a partir do `DASHBOARD_DOMAIN`
2. Cria `docker-compose.yml` com labels Traefik corretas
3. Sobe container `funnel-nginx-proxy` com `--force-recreate`
4. Valida conectividade interna (container → API) e pública (Traefik → SPA)

### Diagnóstico

```bash
sudo bash self-host/fix-traefik-routing.sh
```

O script de diagnóstico:
- Detecta **routers Traefik duplicados** em todos os containers
- Testa **todas as rotas críticas** (não só `/functions/v1`)
- Sugere correção automática via `setup-traefik.sh`

### Validação pós-update (matriz de status)

| Rota | Método | Status esperado |
|------|--------|----------------|
| `https://dash.../` | GET | 200 |
| `https://dash.../login` | GET | 200 |
| `https://dash.../admin` | GET | 200 |
| `https://dash.../functions/v1/typebot-proxy` | POST | 400 ou 401 |
| `https://dash.../rest/v1/user_settings?select=id&limit=1` | GET | 200, 401 ou 406 |
| `http://dash.../` | GET | 301 (redirect HTTPS) |

### Fluxo recomendado

```
update.sh
  ├── build + deploy + restart
  ├── detecta Traefik?
  │     ├── sim → roda setup-traefik.sh → smoke tests
  │     │         ├── OK → ✅ concluído
  │     │         └── falha → aviso + instruções
  │     └── não → valida Nginx direto
  └── resumo final
```

### Labels do Traefik (referência)

No `docker-compose.yml` gerado, o serviço `funnel-nginx-proxy` (porta 8080) terá routers com **prioridades escalonadas**:

- **Prioridade 100**: paths de API (`/functions/v1`, `/auth/v1`, `/rest/v1`, `/api`)
- **Prioridade 10**: SPA fallback (qualquer path do domínio)
- **Prioridade 1**: redirect HTTP→HTTPS (entrypoint `web`)

**Importante**: Todos os routers apontam para o **mesmo serviço** (Nginx interno). A diferença é a prioridade, garantindo que paths de API nunca caiam no SPA fallback.
