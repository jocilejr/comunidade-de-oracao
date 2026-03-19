
Objetivo: eliminar de vez o erro `{"error":"invalid input syntax for type json"}` no `POST /typebot-proxy` no ambiente self-host.

Diagnóstico provável:
- O contexto de RLS (claims/role) ainda não está consistente durante a query.
- `queryWithRLS` usa `set_config(..., true)` + `SET LOCAL ROLE`, mas sem transação explícita a aplicação pode perder esse contexto entre statements.
- A função `auth.uid()` criada no self-host é frágil: faz cast para JSON antes de proteger contra string vazia/inválida.

Plano de implementação:
1) Fortalecer `queryWithRLS` em `self-host/api-server.js`
   - Executar tudo na mesma conexão **e** na mesma transação:
     - `BEGIN`
     - `set_config('request.jwt.claims', $1::text, true)` com JSON completo (`sub`, `role`, `aud`)
     - `SET LOCAL ROLE authenticated`
     - query alvo
     - `COMMIT` (ou `ROLLBACK` no catch)
2) Tornar `auth.uid()` resiliente no self-host
   - Atualizar SQL no `self-host/install.sh` para `auth.uid()` retornar `NULL` quando claims estiverem ausentes/vazias/inválidas (sem explodir cast JSON).
3) Garantir correção para instalações já existentes
   - Incluir no `self-host/update.sh` um bloco idempotente que executa `CREATE OR REPLACE FUNCTION auth.uid()` com a versão resiliente antes de reiniciar serviços.
4) Publicar na VPS pelo fluxo oficial
   - `cd /root/comunidade-de-oracao && git pull && sudo bash self-host/update.sh`
5) Validar ponta a ponta
   - `curl http://127.0.0.1:4000/health`
   - Reexecutar o curl com JWT para `/typebot-proxy` e confirmar que não retorna mais erro JSON.
   - Se persistir: coletar `pm2 logs funnel-api --lines 120` + `SELECT pg_get_functiondef('auth.uid()'::regprocedure);`.

Detalhes técnicos (referência da função robusta):
`CASE WHEN nullif(current_setting('request.jwt.claims', true), '') IS NULL THEN NULL ELSE nullif((current_setting('request.jwt.claims', true)::jsonb->>'sub'),'')::uuid END`
