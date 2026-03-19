

# Fix: Typebot proxy retorna 400 na VPS

## Diagnóstico
O erro 400 significa "Token do Typebot não configurado" — o `api-server.js` não encontra `typebot_api_token` na tabela `user_settings` do PostgreSQL local da VPS.

**Causa raiz**: `saveUserSettings()` usa o Supabase client → PostgREST. Se o PostgREST na VPS está rejeitando requests (problema de JWT/auth que já vimos), o save falha silenciosamente e as credenciais nunca são gravadas no banco local.

## Solução
Fazer o save de configurações passar pelo `api-server.js` em vez do PostgREST, assim como já fizemos com o `/share`. Criar um endpoint `/user-settings` no api-server que faz upsert direto via `pool.query`.

### 1. `self-host/api-server.js` — Novo endpoint `/user-settings`

```js
// GET /user-settings — retorna settings do user autenticado
// POST /user-settings — salva/atualiza settings
async function handleUserSettings(req, res) {
  // Validar JWT, extrair userId
  // GET: SELECT from user_settings WHERE user_id = $1
  // POST: UPSERT into user_settings
}
```

Adicionar no router:
```js
if (path === "/user-settings" && req.method === "GET") return await handleUserSettings(req, res);
if (path === "/user-settings" && req.method === "POST") return await handleUserSettings(req, res);
```

### 2. `src/lib/funnel-storage.ts` — Detectar VPS e usar api-server

Na `saveUserSettings()` e `getUserSettings()`, quando `VITE_PUBLIC_DOMAIN` está definido (ambiente VPS), fazer fetch para `/functions/v1/user-settings` em vez de usar o Supabase client. Isso segue o mesmo padrão do `getFunnelBySlug`.

```ts
export async function saveUserSettings(settings: {...}): Promise<boolean> {
  // Se estiver na VPS, usa o api-server via /functions/v1/user-settings
  const isVPS = !!import.meta.env.VITE_PUBLIC_DOMAIN;
  if (isVPS) {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const res = await fetch('/functions/v1/user-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(settings),
    });
    return res.ok;
  }
  // ... código existente do Supabase client
}
```

Mesma lógica para `getUserSettings()`.

### 3. Resultado
- Settings são salvos diretamente no PostgreSQL da VPS via api-server
- Typebot proxy encontra as credenciais e funciona
- Lovable Cloud continua usando Supabase client normalmente
- Zero dependência do PostgREST para operações autenticadas na VPS

### 4. Deploy na VPS
1. Atualizar `api-server.js` e rebuild do frontend
2. `pm2 restart all`

