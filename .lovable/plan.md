

## Plano: Eliminar Nginx, rotear tudo via Traefik

Você tem razão — o Nginx intermediário é a fonte dos problemas. O Traefik já funciona e gerencia SSL. O Nginx dentro do container `funnel-nginx-proxy` faz duas coisas:

1. **Proxy reverso** para API (host:4000) e PostgREST (host:3100)
2. **Servidor de arquivos estáticos** (SPA com fallback `try_files`)

O Traefik pode fazer o item 1 diretamente. Para o item 2, ainda precisamos de algo que sirva os arquivos estáticos — mas sem nenhuma regra de proxy.

### Arquitetura nova

```text
Internet → Traefik (SSL, routers por path)
              │
              ├─ /functions/v1/*  → funnel-api-proxy (socat → host:4000, strip prefix)
              ├─ /auth/v1/*       → funnel-api-proxy (socat → host:4000, passthrough)
              ├─ /rest/v1/*       → funnel-rest-proxy (socat → host:3100, strip prefix)
              ├─ /api/*           → funnel-api-proxy (socat → host:4000, strip prefix)
              │
              └─ /* (catch-all)   → funnel-spa (servidor estático, SPA fallback)
```

### Mudanças por arquivo

**1. `self-host/docker-compose.traefik.yml.template`** — Reescrever com 3 serviços:

- **funnel-spa**: container leve (`joseluisq/static-web-server:2` — 5MB, suporta SPA mode nativo) ou nginx:alpine com config mínima (só `try_files`, zero proxy). Monta `/opt/funnel-app/dist`. Labels Traefik: catch-all para dashboard e public domain, prioridade baixa (1).

- **funnel-api-proxy**: `alpine/socat` fazendo TCP forward para `host.docker.internal:4000`. Labels Traefik: routers para `/functions/v1`, `/auth/v1`, `/api` com middlewares `StripPrefix` onde necessário, prioridade alta (100).

- **funnel-rest-proxy**: `alpine/socat` fazendo TCP forward para `host.docker.internal:3100`. Labels Traefik: router para `/rest/v1` com `StripPrefix`, prioridade alta (100).

Todos na rede `traefik-net`, com `extra_hosts: host.docker.internal:host-gateway`.

**2. `self-host/nginx-proxy.conf.template`** — Simplificar para APENAS servir estáticos (se manter nginx) ou deletar (se usar static-web-server).

**3. `self-host/setup-traefik.sh`** — Simplificar: não precisa mais gerar config nginx de proxy. Apenas gera o docker-compose, faz `docker compose up -d`, e valida.

**4. `self-host/update.sh`** — Adaptar referências ao novo compose (3 containers em vez de 1).

**5. `self-host/fix-traefik-routing.sh`** — Adaptar diagnóstico para os 3 serviços.

### Detalhes técnicos

- `StripPrefix` middleware do Traefik substitui os `rewrite` do Nginx:
  - `/functions/v1/typebot-proxy` → strip `/functions/v1` → socat entrega `/typebot-proxy` na porta 4000
  - `/rest/v1/user_settings` → strip `/rest/v1` → socat entrega `/user_settings` na porta 3100

- `socat` é um binário de ~100KB que faz TCP forwarding puro, sem config files, sem bugs de proxy reverso.

- Para SPA fallback, `joseluisq/static-web-server` tem flag `--page-fallback /index.html` que substitui o `try_files` do Nginx. Alternativa: manter nginx:alpine com config de 3 linhas (sem proxy).

### Vantagens

- Zero proxy-dentro-de-proxy (causa raiz dos 500)
- Cada serviço tem labels Traefik próprias — sem conflito de routers
- Debug simples: cada container faz UMA coisa
- Menor superfície de erro

