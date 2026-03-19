
Objetivo: corrigir definitivamente o erro 500 global no domínio do dashboard em ambiente com Traefik, tornando o deploy auto-healing e com validação fim-a-fim.

Diagnóstico consolidado (com base no que você enviou):
- Build e serviços locais estão OK (`npm run build`, PM2, `/health`, `/functions/v1/*`).
- `https://dash.../functions/v1/typebot-proxy` responde (401/400), então API routing parcial está funcionando.
- `https://dash.../admin` retorna `500 nginx/1.29.5`.
- `https://dash.../` retorna `404 page not found`.
- Esse padrão indica problema de roteamento Traefik (conflito/precedência/entrypoints), não bug do React/Admin.

Plano de implementação (patch completo)

1) Endurecer o template Traefik para evitar colisões
- Arquivo: `self-host/docker-compose.traefik.yml.template`
- Alterações:
  - Substituir nomes fixos de routers/services (`funnel-api`, `funnel-spa`, `funnel-backend`) por nomes únicos por instalação (prefixo derivado do domínio).
  - Criar router SPA explícito com `PathPrefix(`/`)` + prioridade acima de rotas genéricas de terceiros.
  - Manter router de API com prioridade mais alta que SPA.
  - Adicionar routers para `web` e `websecure` (hoje está só `websecure`), com redirect HTTP→HTTPS.
- Resultado esperado: nenhuma “competição” com outros containers Traefik na VPS.

2) Gerar nomes únicos no setup-traefik
- Arquivo: `self-host/setup-traefik.sh`
- Alterações:
  - Criar `ROUTER_PREFIX` sanitizando `DASHBOARD_DOMAIN` (ex.: `funnel-dash-origemdavida-online`).
  - Injetar placeholders no compose gerado (`__ROUTER_PREFIX__` etc).
  - Recriar container sempre que labels mudarem.
- Resultado esperado: labels sempre consistentes e sem conflito entre stacks.

3) Auto-heal no update
- Arquivo: `self-host/update.sh`
- Alterações:
  - Em modo Traefik detectado, além do teste `/functions/v1`, executar smoke tests públicos:
    - `GET /` (dashboard) → não pode 404/500
    - `GET /login` e `GET /admin` → não pode 500
    - `POST /functions/v1/typebot-proxy` → 400/401 esperado
  - Se algum teste crítico falhar, executar automaticamente `self-host/setup-traefik.sh` e revalidar.
- Resultado esperado: `update.sh` já corrige rota quebrada sem intervenção manual.

4) Diagnóstico mais completo no fix script
- Arquivo: `self-host/fix-traefik-routing.sh`
- Alterações:
  - Listar todos os labels Traefik relevantes (não só os que contêm domínio literal).
  - Detectar e alertar sobre nomes de routers duplicados.
  - Testar também `/`, `/login`, `/admin` (HTTP e HTTPS), além de `/functions/v1`.
  - Ao detectar cenário de conflito, sugerir ação automática (recriar com prefixo único).
- Resultado esperado: troubleshooting objetivo, sem “falso OK” só porque `/functions/v1` respondeu.

5) Documentação operacional
- Arquivo: `self-host/README.md`
- Alterações:
  - Atualizar seção Traefik com nova estratégia de namespacing e prioridades.
  - Adicionar matriz de validação pós-update (status esperados por rota).
  - Incluir fluxo recomendado: `update.sh` → (auto-heal) → validação final.
- Resultado esperado: operação previsível para futuras atualizações.

Detalhes técnicos (resumo)
- Causa provável raiz: conflito de roteadores Traefik + labels genéricas + ausência de cobertura robusta para entrypoint `web` e fallback SPA sob competição.
- Correção arquitetural:
  - nomes únicos por domínio
  - roteador SPA explícito e prioritário
  - redirect HTTP→HTTPS
  - smoke tests completos no deploy
- Isso elimina o cenário “API funciona mas /admin quebra com 500”.

Validação final (após patch)
1. `sudo bash self-host/update.sh`
2. Confirmar:
   - `https://dash.../` abre SPA
   - `https://dash.../login` abre tela de login
   - `https://dash.../admin` não retorna 500
   - `https://dash.../functions/v1/typebot-proxy` sem token retorna 401/400
3. Teste end-to-end:
   - login → abrir admin → salvar credenciais Typebot → importar bot.

Risco e rollback
- Risco baixo (mudança concentrada em scripts/templates self-host).
- Rollback rápido: restaurar versão anterior dos arquivos `self-host/*` e rerodar `setup-traefik.sh`.
