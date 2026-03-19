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

```bash
cd /tmp/funnel-app && git pull
sudo bash self-host/update.sh
```

## Traefik (proxy externo)

Se a sua VPS já usa **Traefik** para gerenciar SSL/portas 80+443, o Nginx do host não recebe tráfego externo diretamente. Nesse caso:

1. O container `funnel-nginx-proxy` faz proxy para a API local (porta 4000) e serve o frontend.
2. O Traefik precisa rotear os paths de backend (`/functions/v1/`, `/auth/v1/`, `/rest/v1/`, `/api/`) com **prioridade maior** que o fallback SPA.

### Diagnóstico

```bash
sudo bash self-host/fix-traefik-routing.sh
```

### Labels do Traefik (exemplo)

No seu `docker-compose.yml`, o serviço que aponta para o Nginx interno (porta 8080) precisa de **dois routers**:

```yaml
labels:
  # API paths — prioridade alta
  - "traefik.http.routers.funnel-api.rule=Host(`dash.seudominio.com`) && (PathPrefix(`/functions/v1`) || PathPrefix(`/auth/v1`) || PathPrefix(`/rest/v1`) || PathPrefix(`/api`))"
  - "traefik.http.routers.funnel-api.priority=100"
  - "traefik.http.routers.funnel-api.entrypoints=websecure"
  - "traefik.http.routers.funnel-api.tls.certresolver=letsencrypt"

  # SPA fallback — prioridade baixa
  - "traefik.http.routers.funnel-spa.rule=Host(`dash.seudominio.com`)"
  - "traefik.http.routers.funnel-spa.priority=1"
  - "traefik.http.routers.funnel-spa.entrypoints=websecure"
  - "traefik.http.routers.funnel-spa.tls.certresolver=letsencrypt"
```

**Importante**: Ambos os routers apontam para o **mesmo serviço** (o container Nginx interno). A diferença é que o router de API tem prioridade `100`, garantindo que paths como `/functions/v1/typebot-proxy` cheguem no proxy correto em vez de cair no SPA fallback (que retorna `405`).
