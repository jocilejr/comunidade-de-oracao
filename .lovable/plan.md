

## Plano

Há dois problemas separados para resolver:

### 1. Build errors (TypeScript) — rápido
Os edge functions `rotate-preview-images` e `typebot-proxy` usam `err.message` sem type-cast. Em TypeScript strict, `catch (err)` é `unknown`.

**Correção**: Trocar `err.message` por `(err instanceof Error ? err.message : String(err))` em ambos os arquivos.

### 2. Link preview não funciona (problema principal)

O screenshot do WhatsApp mostra "Typebot Runtime" como título — isso significa que o crawler está recebendo o `index.html` do SPA (fallback) em vez do HTML com OG tags do `handleShare`.

**Causa raiz**: O `__funnel_diag` mostrou `publicDomain: "localhost"` — as env vars não estão carregadas no PM2. O update.sh já foi corrigido para fazer `set -a; source .env; set +a` antes do PM2 start, mas o usuário precisa rodar o update novamente.

Porém, mesmo com env vars corretas, há um problema no fluxo de bot detection do api-server:

- Linha 726-736: o bot detection só funciona para URLs `/{slug}` — mas o Traefik roteia TODO o tráfego do domínio público para o api-server
- O bot check usa `slugMatch = path.match(/^\/([a-zA-Z0-9_-]+)\/?$/)` — isso funciona para slugs simples
- O fluxo está correto: crawler → detecta UA → chama `handleShare` → retorna HTML com OG tags
- O problema é que com `PUBLIC_DOMAIN=localhost`, as URLs de imagem nas OG tags apontam para `https://localhost/preview-image?slug=...` — inacessível para crawlers

**Nenhuma mudança adicional necessária no api-server** — o fix do PM2 env vars (já implementado no update.sh) resolve o problema. O usuário só precisa rodar `git pull && sudo bash self-host/update.sh` novamente.

### Arquivos a modificar
- `supabase/functions/rotate-preview-images/index.ts` — fix `err.message` type cast
- `supabase/functions/typebot-proxy/index.ts` — fix `err.message` type cast

