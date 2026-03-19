

# Fix: RLS bloqueia funnel_user na tabela user_settings

## Causa raiz
O `api-server.js` conecta como `funnel_user` via `pool.query`. A tabela `user_settings` tem RLS ativo com políticas que verificam `auth.uid() = user_id`. Como o pool não define claims JWT, `auth.uid()` = NULL → RLS bloqueia INSERT e UPDATE.

## Solução
Conceder `BYPASSRLS` ao role `funnel_user`. O api-server já valida o JWT e filtra por `user_id` explicitamente em todas as queries — o RLS é redundante nesse contexto.

### Arquivos alterados

**1. `self-host/install.sh`** — Na criação do role, adicionar BYPASSRLS:
```sql
CREATE ROLE funnel_user WITH LOGIN PASSWORD '...' BYPASSRLS;
```
E para instalações existentes, adicionar após a criação:
```sql
ALTER ROLE funnel_user BYPASSRLS;
```

**2. `self-host/update.sh`** — Adicionar no bloco de grants (seção 6b):
```sql
ALTER ROLE funnel_user BYPASSRLS;
```

### Deploy
1. Rodar `update.sh` na VPS (aplica o ALTER ROLE)
2. `pm2 restart funnel-api`
3. Testar salvar configurações

