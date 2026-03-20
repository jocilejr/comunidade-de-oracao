
Objetivo: resolver de vez a tela branca na VPS (MIME `text/html` para `index-*.js`) mesmo após deploy.

Diagnóstico consolidado:
- Erro confirmado: `Failed to load module script ... MIME type "text/html"`.
- Do I know what the issue is? Sim: o frontend está recebendo HTML no lugar de JS em `/assets/...`, típico de fallback SPA aplicado indevidamente (principalmente no modo Nginx) e/ou roteamento concorrente no proxy (Traefik).

Plano de implementação

1) Endurecer o modo Nginx para nunca devolver `index.html` em assets
- Arquivo: `self-host/nginx.conf.template`
- Adicionar blocos antes do fallback:
  - `location ^~ /assets/ { try_files $uri =404; ... }`
  - blocos equivalentes para `/images/` e `/sounds/` (se usados)
  - `location ~* \.(js|mjs|css|map|json|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|webp|mp3)$ { try_files $uri =404; }`
- Manter fallback SPA apenas em navegação (`location / { try_files ... /index.html; }`).

2) Corrigir política de cache para evitar referência a chunk antigo
- `index.html`: `Cache-Control: no-store`
- `/assets/*`: `Cache-Control: public, max-age=31536000, immutable`
- Objetivo: impedir cenário “HTML antigo apontando para JS inexistente”.

3) Blindar roteamento no modo Traefik contra conflitos de host-rule
- Arquivo: `self-host/docker-compose.traefik.yml.template`
- Criar routers explícitos e prioritários para estáticos:
  - Dashboard + `PathPrefix('/assets')` (e opcional `/images`, `/sounds`) com prioridade alta.
  - Público idem.
- Ajustar prioridade do catch-all para não competir com rotas de assets/API.

4) Melhorar diagnóstico de origem de resposta (quem serviu o arquivo)
- Arquivo: `self-host/api-server.js`
- Adicionar headers de debug em respostas estáticas/SPA (ex.: `X-Funnel-Served-By: api-server`, `X-Funnel-Route: static|spa`).
- Isso permite confirmar rapidamente se o JS veio do servidor correto.

5) Fortalecer validação no deploy para ambos os modos
- Arquivos: `self-host/update.sh` e `self-host/install.sh`
- Tornar obrigatório no final:
  - detectar e imprimir claramente o modo ativo (`Traefik` ou `Nginx`)
  - baixar `/` do dashboard, extrair `src` do módulo principal, testar:
    - HTTP 200
    - `Content-Type` JavaScript
    - corpo não iniciando com `<!DOCTYPE html>`
- Em falha, mostrar diagnóstico objetivo e próximos comandos (containers/pm2/nginx).

6) Validação final (pós-fix)
- Rodar update.
- Testar `/`, `/login`, `/admin`.
- Confirmar em Network: `index-*.js` com `application/javascript` (não `text/html`).
- Revalidar fluxo de preview/rotação para garantir que não houve regressão.
