
Objetivo: eliminar definitivamente o erro `Tenant or user not found` no self-host e deixar o `update.sh` capaz de autocorrigir ambiente sem pedir domínio/senha manualmente.

1) Diagnóstico confirmado (baseado no seu log)
- O `funnel-api` está no ar (`/health` responde), mas falha no primeiro `pool.query`.
- O erro vem da conexão do `pg` (`FATAL XX000 Tenant or user not found`), não da lógica de signup.
- Como `sudo -u postgres psql -d funnel_app` funciona mas `psql -h 127.0.0.1 -U funnel_user ...` falha, o host/porta TCP configurado no app está apontando para um serviço errado (ou porta errada), não para o Postgres local esperado.

2) Correções no `self-host/update.sh` (principal)
- Adicionar etapa “auto-heal de banco” antes de reiniciar serviços:
  - Ler `DB_*` atuais do `/opt/funnel-app/.env`.
  - Testar conexão TCP com `PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1"`.
  - Se falhar com mensagem de tenant/user:
    - Descobrir porta real do cluster local via `sudo -u postgres psql -tAc "SHOW port"`.
    - Regravar `.env` com `DB_HOST=127.0.0.1` e `DB_PORT=<porta_real>`.
    - Regerar `PGRST_DB_URI` e `postgrest.conf` com essa porta.
    - Validar novamente conexão.
- Reiniciar PM2 com atualização de variáveis:
  - trocar `pm2 restart ...` por `pm2 restart ... --update-env` (ou `pm2 startOrRestart ecosystem.config.js --update-env`).
- Fail-fast:
  - se a conexão continuar falhando, abortar update com mensagem clara (sem “concluir com sucesso” falso).

3) Correções no `self-host/install.sh` (prevenção em novas VPS)
- Parar de fixar `5432` hardcoded.
- Detectar porta real do Postgres durante instalação (`SHOW port`) e usar essa porta para:
  - `.env` (`DB_PORT`)
  - `PGRST_DB_URI`
  - `postgrest.conf`
- Manter tudo não-interativo para updates futuros (sem perguntar domínio novamente).

4) Ajustes de observabilidade no `self-host/api-server.js`
- No startup, logar destino de conexão sanitizado (host/port/db/user sem senha).
- Fazer ping de DB no boot (`SELECT 1`) e logar erro detalhado de conexão (com hint “verificar DB_HOST/DB_PORT”).
- Isso reduz tempo de debug em produção.

5) Validação E2E após aplicar
- Rodar `sudo bash self-host/update.sh`.
- Confirmar:
  - `pm2 status` com `funnel-api` e `funnel-postgrest` online.
  - `curl http://127.0.0.1:4000/health` ok.
  - `curl signup` local (`/auth/v1/signup`) retornando token/user (sem tenant error).
  - Teste no domínio dashboard (`https://.../auth/v1/signup`) e login no frontend.
- Critério de aceite: login/signup funcionando via dashboard e via API local após um único `update.sh`.

Seção técnica (resumo de implementação)
- Arquivos a alterar: `self-host/update.sh`, `self-host/install.sh`, `self-host/api-server.js`, `self-host/README.md` (nota curta sobre autodetecção de porta).
- Sem mudanças de schema/tabela para este fix.
- Foco em robustez operacional: autodetecção + reescrita idempotente de `.env` + restart com `--update-env`.
