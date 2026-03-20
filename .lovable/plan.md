
Objetivo: eliminar a tela branca na VPS (cache/hash mismatch de assets) e evitar recorrência em updates futuros.

1) Confirmar ponto exato da quebra (dashboard vs público)
- Rodar validação de resposta real por domínio (não só arquivo em disco):
  - `curl -s https://SEU_DASHBOARD_DOMAIN/ | grep -o '/assets/index-[^"]*'`
  - `curl -I https://SEU_DASHBOARD_DOMAIN/assets/ARQUIVO_ENCONTRADO.js`
  - `curl -I https://SEU_DASHBOARD_DOMAIN/assets/index-Cxf2Od6W.js` (hash antigo que apareceu no navegador)
- Fazer o mesmo no domínio público para descartar roteamento duplicado por host rule no Traefik.

2) Corrigir estratégia de deploy para não quebrar clientes com HTML em cache
- Arquivo: `self-host/update.sh`
- Alterar o passo de sync do frontend:
  - Em vez de apagar tudo (`rm -rf /opt/funnel-app/dist`), manter `dist/assets` anterior por 1 ciclo de deploy.
  - Copiar novo build por cima, preservando arquivos hash antigos (JS/CSS) temporariamente.
- Resultado esperado: mesmo que algum navegador carregue `index.html` antigo, os bundles antigos ainda existirão e o app abre normalmente.

3) Reduzir chance de cache agressivo no dashboard
- Arquivo: `self-host/docker-compose.traefik.yml.template`
- Ajustar serviço `funnel-spa` para não aplicar cache-control automático agressivo em static-web-server (via env de cache-control).
- Objetivo: reduzir retenção de HTML antigo com hash desatualizado.

4) Adicionar smoke test pós-update focado em hash real em produção
- Arquivo: `self-host/update.sh`
- Após subir containers:
  - Buscar `index.html` do domínio dashboard.
  - Extrair hash JS referenciado.
  - Testar se o arquivo existe e retorna MIME JavaScript.
- Se falhar: mostrar erro explícito de “hash mismatch / asset ausente” no próprio `update.sh`.

5) Ajuste de robustez no gateway público (prevenção secundária)
- Arquivo: `self-host/api-server.js`
- Garantir que respostas de HTML (fallback SPA/slug humano) usem `Cache-Control: no-cache`.
- Manter assets com cache longo apenas quando o arquivo realmente existe (hashado).

6) Validação final (aceite)
- Hard refresh e aba anônima no dashboard e no público.
- Confirmar:
  - Sem erro MIME no console.
  - `/assets/index-*.js` retorna `200` e `Content-Type: application/javascript`.
  - Login/admin/funil abrindo normalmente.
  - Preview/rotação continuam funcionando.

Detalhes técnicos (causa raiz)
- O `dist/index.html` da VPS já está com hash novo (`index-D5BBQz-i.js`), mas navegador pediu hash antigo (`index-Cxf2...`).
- Isso indica HTML antigo em cache em algum ponto (browser/proxy). Como o deploy removeu assets antigos, o request caiu em fallback HTML e gerou erro de MIME → tela branca.
- Preservar assets de versão anterior + smoke test de hash elimina esse tipo de queda durante atualização.

Rollback seguro
- Se qualquer ajuste falhar, voltar temporariamente ao comportamento anterior de headers e manter apenas a correção de deploy “preservar assets anteriores”, que já resolve a indisponibilidade sem alterar lógica de app.
