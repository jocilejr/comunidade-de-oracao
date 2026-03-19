

# Reconstrução Completa: Configurações e Conexão (VPS)

## Problema raiz

O `queryWithRLS` no `api-server.js` tenta simular o comportamento do Supabase (RLS via `set_config` + `SET LOCAL ROLE`) mas isso é inerentemente frágil no PostgreSQL puro. O erro `invalid input syntax for type json` persiste porque a interação entre `set_config`, o role `authenticated` e a função `auth.uid()` é instável neste contexto.

## Solução: Eliminar RLS no api-server.js

O `api-server.js` já valida o JWT e extrai o `userId` de forma segura. Ele é o único ponto de acesso ao banco — não existe acesso direto do browser ao PostgreSQL. Portanto, **a filtragem por `user_id` pode ser feita na query SQL diretamente**, sem precisar de RLS.

Isso é seguro porque:
- O JWT é validado antes de qualquer query
- O `userId` vem do token, não do corpo da requisição
- Nenhum cliente acessa o banco diretamente (PostgREST usa RLS separadamente)

## Alterações

### 1. `self-host/api-server.js`
- **Remover** a função `queryWithRLS` completamente
- **Substituir** todas as chamadas `queryWithRLS(userId, query, params)` por `pool.query(query, params)` direto
- As queries já filtram por `WHERE user_id = $1` com o `userId` extraído do JWT — isso é suficiente

Endpoints afetados:
- `handleOpenaiProxy`: `SELECT openai_api_key FROM user_settings WHERE user_id = $1`
- `handleTypebotProxy`: `SELECT typebot_api_token, ... FROM user_settings WHERE user_id = $1`

### 2. `self-host/install.sh`
- Adicionar `GRANT SELECT, INSERT, UPDATE ON public.user_settings TO funnel_user;` explicitamente
- Manter as demais grants existentes

### 3. `self-host/update.sh`
- Adicionar bloco de grants para garantir que `funnel_user` tem acesso direto à `user_settings` (para instalações existentes)
- Manter a função `auth.uid()` resiliente (usada pelo PostgREST, não pelo api-server)

### 4. Nenhuma alteração no frontend
- O `funnel-storage.ts` e `Admin.tsx` continuam iguais — usam o Supabase SDK normalmente (Lovable Cloud) ou PostgREST (VPS)

## Comandos para o VPS após deploy

```bash
cd /root/comunidade-de-oracao && git pull && sudo bash self-host/update.sh
```

Teste:
```bash
cd /opt/funnel-app && set -a && source .env && set +a && \
TOKEN=$(node -e "const jwt=require('jsonwebtoken');console.log(jwt.sign({sub:'618396b3-4ec8-4b91-af9f-214567497eb1',role:'authenticated',aud:'authenticated'},process.env.PGRST_JWT_SECRET,{algorithm:'HS256',expiresIn:3600}))") && \
curl -s -X POST "http://127.0.0.1:4000/typebot-proxy" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"list"}' | head -c 800
```

Resultado esperado: resposta do Typebot ou "Token do Typebot não configurado" (significando que a query funcionou, mas o token ainda não foi salvo).

