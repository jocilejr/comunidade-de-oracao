

## Plano: Corrigir typebot-proxy no api-server.js

### Problema
O frontend chama `supabase.functions.invoke('typebot-proxy', { body: { action: 'list' } })` — sem `userId`.
A Edge Function original extrai o userId do JWT automaticamente. O `api-server.js` exige `userId` no body, causando `"Missing userId"`.

### Solução
Atualizar `handleTypebotProxy` no `api-server.js` para extrair o `userId` do JWT (header Authorization), igual à Edge Function faz — eliminando a necessidade de `userId` no body.

### Alteração única: `self-host/api-server.js`

Substituir o início de `handleTypebotProxy`:

```javascript
async function handleTypebotProxy(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer "))
    return json(res, { error: "Missing authorization" }, 401);

  // Extract userId from JWT (same as Edge Function)
  let userId;
  try {
    const decoded = jwt.verify(authHeader.replace("Bearer ", ""), JWT_SECRET, { algorithms: ["HS256"] });
    userId = decoded.sub;
  } catch (e) {
    return json(res, { error: "Invalid token" }, 401);
  }

  const body = JSON.parse(await readBody(req));
  const { action, typebotId } = body;
  // userId now comes from JWT, not body

  const { rows } = await pool.query(
    `SELECT typebot_api_token, typebot_workspace_id, typebot_base_url
     FROM user_settings WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  // ... rest unchanged
```

Mesma correção deve ser aplicada ao `handleOpenaiProxy` (também depende de `userId` no body).

### Resultado
- Frontend funciona sem alterações
- Comportamento idêntico à Edge Function do Supabase
- Mais seguro (userId vem do token, não do body manipulável pelo cliente)

