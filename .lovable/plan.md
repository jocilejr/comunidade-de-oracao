

# Fix: Funil não encontrado no domínio público + Typebot proxy 400

## Diagnóstico

### Problema 1 — Funil não encontrado na URL pública
O SPA no domínio público (`comunidade.origemdavida.online`) usa o Supabase client configurado com `VITE_SUPABASE_URL=https://dash.origemdavida.online`. Isso gera uma requisição **cross-origin** para o PostgREST. O PostgREST na VPS não retorna headers CORS, e o browser bloqueia a resposta silenciosamente. O `getFunnelBySlug` recebe erro e retorna "Funil não encontrado".

**Solução:** Quando o SPA detecta que está no domínio público, usar `fetch()` direto para `/rest/v1/funnels` (same-origin), já que o Traefik já roteia `/rest/v1/*` no domínio público para o PostgREST. Isso elimina o problema de CORS.

### Problema 2 — Typebot proxy 400
O edge function funciona no Lovable Cloud (testei e retornou 200 com lista de bots). O problema é na VPS — o api-server retorna 400. Possíveis causas: JWT inválido, user_settings vazio, ou o `saveUserSettings` falha silenciosamente antes da chamada. O erro genérico "Edge Function returned a non-2xx status code" esconde a mensagem real do servidor.

**Solução:** Melhorar o tratamento de erro para extrair e exibir a mensagem real do servidor (já presente no JSON de resposta), em vez da mensagem genérica do Supabase client.

## Alterações

### 1. `src/lib/funnel-storage.ts` — `getFunnelBySlug`
Adicionar detecção de domínio público com fetch same-origin:

```ts
export async function getFunnelBySlug(slug: string): Promise<StoredFunnel | undefined> {
  // On public domain, use same-origin fetch to avoid CORS with dashboard API
  const publicDomain = import.meta.env.VITE_PUBLIC_DOMAIN;
  if (publicDomain) {
    try {
      const publicOrigin = new URL(publicDomain).origin;
      if (window.location.origin === publicOrigin) {
        const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const res = await fetch(
          `/rest/v1/funnels?slug=eq.${encodeURIComponent(slug)}&limit=1`,
          {
            headers: {
              'apikey': apiKey,
              'Authorization': `Bearer ${apiKey}`,
              'Accept': 'application/json',
              'Accept-Profile': 'public',
            },
          }
        );
        if (!res.ok) return undefined;
        const rows = await res.json();
        if (!rows.length) return undefined;
        const data = rows[0];
        return { /* map columns to StoredFunnel */ };
      }
    } catch { /* fall through to Supabase client */ }
  }

  // Default: use Supabase client (Lovable Cloud or dashboard domain)
  const { data, error } = await supabase.from('funnels')...
}
```

### 2. `src/pages/Admin.tsx` — Melhorar erro do typebot proxy
Nas 2 chamadas ao `supabase.functions.invoke('typebot-proxy')`, extrair a mensagem real do response body ao invés de usar a mensagem genérica:

```ts
const { data, error } = await supabase.functions.invoke('typebot-proxy', {
  body: { action: 'list' },
});
if (error) {
  // data contains the server's JSON response with the actual error
  const serverMsg = data?.error || error?.message || 'Erro desconhecido';
  throw new Error(serverMsg);
}
```

Isso já está parcialmente implementado, mas vou garantir que funcione em ambas as chamadas (list e get).

## Resultado
- URL pública na VPS carrega o funil via same-origin (sem CORS)
- Lovable Cloud não é afetado (VITE_PUBLIC_DOMAIN não existe)
- Erros do typebot proxy mostram a mensagem real do servidor para diagnóstico

