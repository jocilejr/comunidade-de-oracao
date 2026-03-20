
Objetivo: eliminar a tela branca na VPS (erro de MIME em módulo JS) e estabilizar o carregamento do dashboard.

Diagnóstico confirmado (pelo console):
- Erro: “Failed to load module script… server responded with text/html”.
- Isso indica que um arquivo JS de módulo está recebendo HTML (fallback SPA), típico de roteamento estático incorreto para `/assets/*` ou chunk inexistente sendo respondido com `index.html`.

Plano de implementação

1) Corrigir arquitetura de entrega do frontend no modo Traefik
- Parar de depender do fallback global do `static-web-server` para o dashboard.
- Rotear o dashboard (catch-all) também para o `api-server` (via `funnel-api-proxy`), mantendo rotas de API (`/functions/v1`, `/auth/v1`, `/api`, `/rest/v1`) com prioridade maior.
- Arquivo: `self-host/docker-compose.traefik.yml.template`.

2) Endurecer fallback no `api-server` para evitar MIME errado
- Em `self-host/api-server.js`, manter entrega estática com MIME correto por extensão.
- Para arquivos estáticos inexistentes (`.js`, `.css`, etc.), retornar 404 (nunca `index.html`).
- Servir `index.html` apenas para navegação SPA (GET HTML), incluindo `/`, `/login`, `/admin`, `/f/:slug` e rotas internas.
- Resultado: módulo JS nunca recebe `text/html`.

3) Ajustar headers de cache para evitar chunk antigo em navegador
- `index.html`: `Cache-Control: no-store`.
- assets versionados (`/assets/*`): `Cache-Control: public, max-age=31536000, immutable`.
- Isso evita cenário de HTML novo apontando para chunk antigo (ou vice-versa).

4) Fortalecer validação no deploy (para não regressar)
- Em `self-host/update.sh`, adicionar smoke test de frontend:
  - baixar `/` do dashboard,
  - extrair `src` do script módulo,
  - validar que esse arquivo responde `200` e `Content-Type` JavaScript (não HTML).
- Se falhar, imprimir diagnóstico claro no final do script.

5) Verificação final após update
- Testar: `/`, `/login`, `/admin`, `/f/<slug>` no dashboard.
- Confirmar no DevTools Network que `*.js` vem com MIME JS.
- Hard refresh uma vez (Ctrl+F5) para limpar cache local de chunks.
- Revalidar que preview/rotação continuam funcionando no domínio público.

Detalhes técnicos (resumo)
- Causa raiz provável: fallback SPA respondendo HTML para requisições de módulo JS.
- Correção estrutural: unificar fallback de SPA no `api-server` + regra explícita de 404 para assets faltantes.
- Arquivos a alterar: `self-host/api-server.js`, `self-host/docker-compose.traefik.yml.template`, `self-host/update.sh` (e `self-host/install.sh` para manter consistência da instalação nova).
