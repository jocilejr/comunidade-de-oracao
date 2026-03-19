

## Diagnóstico Final

Os logs revelaram a causa raiz real:

```
FATAL XX000: Tenant or user not found
at handleToken (api-server.js:310)
at handleSignup (api-server.js:277)
```

**O que acontece:**
1. O `api-server.js` conecta no banco como `funnel_user` — `SELECT 1` funciona (startup OK)
2. Mas ao acessar `auth.users` (login/signup/refresh), o PostgreSQL rejeita com erro FATAL
3. Isso mata a conexão, o processo crasha, PM2 reinicia (15+ restarts)
4. O frontend não consegue fazer login/refresh → token inválido → typebot-proxy falha com "Missing authorization"

**A API do Typebot funciona perfeitamente** — o curl direto retornou todos os bots. O problema é 100% na autenticação local.

**Causa raiz:** O role `funnel_user` não tem permissão para acessar o schema `auth` e a tabela `auth.users`.

---

## Plano de Correção

### 1. Criar migration para conceder permissões ao `funnel_user`

Nova migration SQL:
```sql
GRANT USAGE ON SCHEMA auth TO funnel_user;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA auth TO funnel_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA auth TO funnel_user;
```

### 2. Melhorar tratamento de erros no `api-server.js`

Atualmente, um erro FATAL do PostgreSQL crasha o processo inteiro. Adicionar try/catch específico nos handlers de auth para retornar erro HTTP 500 em vez de crashar:

```js
// Em handleToken e handleSignup, envolver queries em try/catch
try {
  const { rows } = await pool.query("SELECT ... FROM auth.users ...", [...]);
} catch (dbErr) {
  console.error("DB auth error:", dbErr.message);
  return json(res, { error: "Database error - check funnel_user permissions on auth schema" }, 500);
}
```

### 3. Instruções de deploy

Após aprovar, o usuário roda no VPS:
```bash
# Conceder permissões
sudo -u postgres psql -d funnel_app -c "
  GRANT USAGE ON SCHEMA auth TO funnel_user;
  GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA auth TO funnel_user;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA auth TO funnel_user;
"

# Copiar e reiniciar
sudo cp /root/comunidade-de-oracao/self-host/api-server.js /opt/funnel-app/api-server.js
pm2 restart funnel-api
```

### Arquivos editados
- `self-host/api-server.js` — error handling robusto nos handlers de auth

