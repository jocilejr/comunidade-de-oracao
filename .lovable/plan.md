

# Fix: Funil não encontrado no domínio público (401 no PostgREST)

## Problema
O fetch same-origin para `/rest/v1/funnels` no domínio público retorna 401. O PostgREST na VPS rejeita o JWT anon. Isso é um problema de configuração do PostgREST, mas podemos contornar no código.

## Solução
Usar o api-server (que já está disponível no domínio público via `/functions/v1/`) em vez do PostgREST. Adicionar suporte a `format=json` no endpoint `/share` do api-server, e usar esse endpoint no frontend.

## Alterações

### 1. `self-host/api-server.js` — Adicionar `format=json` ao `/share`
Na função `handleShare`, verificar se `format=json` está nos query params. Se sim, retornar os dados do funil como JSON (incluindo `flow`) em vez de HTML com redirect.

```js
async function handleShare(req, res, slug, format) {
  // Se format=json, buscar dados completos incluindo flow
  if (format === 'json') {
    const { rows } = await pool.query(
      `SELECT id, slug, name, created_at, flow, bot_name, bot_avatar, 
              preview_image, page_title, page_description, user_id
       FROM funnels WHERE slug = $1 LIMIT 1`, [slug]
    );
    if (!rows.length) return json(res, { error: "Not found" }, 404);
    return json(res, rows[0]);
  }
  // ... resto do código existente (HTML para crawlers)
}
```

Atualizar o router para passar `format`:
```js
if (path === "/share" || path === "/share/") {
  const slug = url.searchParams.get("slug");
  const format = url.searchParams.get("format");
  if (!slug) return json(res, { error: "Missing slug" }, 400);
  return await handleShare(req, res, slug, format);
}
```

### 2. `src/lib/funnel-storage.ts` — Usar `/functions/v1/share` no domínio público
Substituir o fetch para `/rest/v1/funnels` por `/functions/v1/share?slug=xxx&format=json`:

```ts
const res = await fetch(
  `/functions/v1/share?slug=${encodeURIComponent(slug)}&format=json`
);
```

Isso funciona porque no Traefik, `/functions/v1/*` no domínio público já é roteado para o api-server (com StripPrefix), e o api-server não requer JWT para o endpoint `/share`.

## Resultado
- Domínio público carrega funis via api-server (sem JWT, sem CORS)
- Lovable Cloud continua usando Supabase client normalmente
- Zero dependência do PostgREST no domínio público

