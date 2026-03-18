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

# Rebuild frontend
npm ci && npm run build
cp -r dist /opt/funnel-app/dist

# Atualizar API
cp self-host/api-server.js /opt/funnel-app/
pm2 restart api-server

# Novas migrations
for f in supabase/migrations/*.sql; do
  sudo -u postgres psql -d funnel_app -f "$f" 2>/dev/null
done
```
