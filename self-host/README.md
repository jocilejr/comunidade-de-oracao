# Self-Host — Funil App

Instale a aplicação completa na sua VPS com um único comando.

## Requisitos

- **Ubuntu 22.04+** ou Debian 12+ (x86_64 ou ARM64)
- **1 GB RAM** mínimo (2 GB recomendado)
- **Domínio** com DNS apontando para o IP da VPS (registros A para `@` e `www`)
- **Portas 80 e 443** abertas no firewall

## Instalação

```bash
# 1. Clone o repositório
git clone <URL_DO_REPO> /tmp/funnel-app
cd /tmp/funnel-app

# 2. Execute o instalador
sudo bash self-host/install.sh
```

O script pedirá interativamente:

| Campo | Exemplo |
|-------|---------|
| Domínio | `meusite.com.br` |
| Email admin | `admin@email.com` |
| Senha admin | `SuaSenhaForte123` |
| Email SSL | `ssl@email.com` |

Tudo mais é automático.

## O que é instalado

- **PostgreSQL 16** — banco de dados
- **PostgREST** — API REST compatível com SDK Supabase
- **GoTrue** — autenticação compatível com SDK Supabase
- **Node.js 20** — API server customizada
- **Nginx** — reverse proxy com SSL automático
- **PM2** — gerenciador de processos
- **Certbot** — SSL Let's Encrypt automático

## Arquitetura

```
Internet → Nginx (SSL)
              │
              ├─ /f/:slug (crawler) → API server → HTML com OG tags
              ├─ /f/:slug (humano)  → SPA React
              ├─ /api/*             → API server
              ├─ /rest/v1/*         → PostgREST
              ├─ /auth/v1/*         → GoTrue
              └─ /*                 → SPA React
```

### Preview social limpo

Quando alguém compartilha `https://meusite.com.br/f/meu-funil` no WhatsApp, Facebook, Twitter etc., o Nginx detecta o User-Agent do crawler e retorna HTML com OG tags (título, descrição, imagem). Para humanos, serve o SPA normalmente.

**Resultado**: URLs limpas com preview funcional, sem URLs estranhas de edge functions.

## Gerenciamento

```bash
# Ver status dos serviços
pm2 status

# Ver logs em tempo real
pm2 logs

# Reiniciar tudo
pm2 restart all

# Reiniciar serviço específico
pm2 restart api-server

# Renovar SSL (automático via cron do Certbot)
certbot renew
```

## Atualização

```bash
cd /tmp/funnel-app
git pull

# Rebuild frontend
npm ci && npm run build
cp -r dist /opt/funnel-app/dist

# Atualizar API
cp self-host/api-server.js /opt/funnel-app/
pm2 restart api-server

# Rodar novas migrations (se houver)
for f in supabase/migrations/*.sql; do
  sudo -u postgres psql -d funnel_app -f "$f" 2>/dev/null
done
```

## Estrutura de arquivos na VPS

```
/opt/funnel-app/
├── .env                  # Variáveis de ambiente
├── api-server.js         # API (preview, proxy OpenAI/Typebot)
├── ecosystem.config.js   # Config PM2
├── postgrest.conf        # Config PostgREST
├── dist/                 # Frontend buildado
└── node_modules/         # Dependências Node
```

## Resolução de problemas

### SSL não funciona
Verifique se o DNS do domínio aponta para o IP da VPS:
```bash
dig +short meusite.com.br
```
Depois rode: `sudo certbot --nginx -d meusite.com.br -d www.meusite.com.br`

### Preview não aparece no WhatsApp
Teste com: `curl -A "WhatsApp" https://meusite.com.br/f/slug`
Deve retornar HTML com tags `og:title`, `og:image` etc.

### Erro de conexão com banco
```bash
sudo -u postgres psql -d funnel_app -c "SELECT 1;"
pm2 restart postgrest
```
