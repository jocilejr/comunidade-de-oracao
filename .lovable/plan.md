

## Plano: Corrigir auth refresh e typebot-proxy no VPS

### Diagnóstico

A screenshot mostra dois erros encadeados:

1. **`auth/v1/token?grant_type=refresh_token` → 400 "email and password required"**
   - O Supabase JS client envia `grant_type` como query parameter na URL, mas o `api-server.js` lê apenas do body
   - O body do refresh contém `{"refresh_token": "xxx"}` sem `grant_type`
   - Resultado: `grant_type` é `undefined`, o código cai no check da linha 326 (`if (!email || !password)`) e retorna 400

2. **`typebot-proxy` → 400** (consequência)
   - Com o refresh quebrado, `supabase.auth.getUser()` pode falhar
   - O `saveUserSettings()` falha silenciosamente (retorna `false`)
   - O proxy lê do banco e não encontra as credenciais salvas → 400 "Token não configurado"

### Mudanças

**Arquivo: `self-host/api-server.js`**

Na função `handleToken` (linha ~309), ler `grant_type` também da query string:

```js
async function handleToken(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const body = JSON.parse(await readBody(req));
  const grant_type = body.grant_type || url.searchParams.get("grant_type");
  const { email, password } = body;
  
  if (grant_type === "refresh_token") {
    // ... resto igual
  }
  
  if (!email || !password) return json(res, { error: "email and password required" }, 400);
  // ...
}
```

Isso é uma correção de ~3 linhas. Com o refresh funcionando, o `saveUserSettings` vai conseguir autenticar e salvar as credenciais do Typebot, e o proxy vai encontrá-las no banco.

