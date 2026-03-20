

## Correção definitiva: modo robusto para link preview

### Problema real

O disparador de links não envia User-Agent de crawler (WhatsApp, facebookexternalhit, etc.). A detecção por UA falha, e o servidor entrega o `index.html` do SPA com metadados genéricos ("Comunidade", "Aperte aqui e Receba", imagem Typebot Runtime). Isso explica por que a ferramenta manual mostra correto (ela lê as OG tags do HTML dinâmico via endpoint /share) mas o WhatsApp real mostra errado.

### Solução: servir OG tags dinâmicas para TODOS os visitantes em rotas de slug

Em vez de depender de User-Agent, o `api-server.js` vai **sempre** retornar HTML com OG tags dinâmicas para rotas `/:slug` e `/f/:slug`. Humanos serão redirecionados via `<meta http-equiv="refresh">` e JavaScript no body, que crawlers ignoram mas navegadores executam.

Isso elimina completamente a dependência de detecção de bot.

### Mudanças

**Arquivo: `self-host/api-server.js`** (linhas 726-738)

Substituir o bloco de bot detection por lógica que sempre serve HTML com OG tags + redirect client-side:

```javascript
// ── Public domain catch-all: /{slug} or /f/{slug} — always serve OG HTML ──
const RESERVED = /^(login|admin|assets|api|rest|auth|functions|health|__funnel_diag|share|preview-image|rotate-preview-images|openai-proxy|typebot-proxy|user-settings)$/i;
const slugMatch = path.match(/^\/(?:f\/)?([a-zA-Z0-9_-]+)\/?$/);
if (slugMatch && !RESERVED.test(slugMatch[1]) && req.method === "GET") {
  const slug = slugMatch[1];
  console.log(`[SHARE] Serving OG HTML for slug="${slug}", path="${path}"`);
  return await handleShareRobust(req, res, slug);
}
```

**Nova função `handleShareRobust`** — semelhante a `handleShare` mas o HTML inclui:
- Todas as OG tags dinâmicas (título, descrição, imagem do funil)
- `<meta http-equiv="refresh" content="0;url=...">` para redirect instantâneo
- `<script>window.location.replace("...")</script>` como fallback
- Crawlers (WhatsApp, Google etc.) ignoram meta refresh e JS, leem apenas as OG tags
- Navegadores humanos são redirecionados imediatamente para o SPA (`/f/slug`)

O redirect para humanos apontará para o próprio domínio público `/f/slug` (que cairá no SPA fallback normalmente), mantendo a experiência atual.

**Importante**: No domínio público com Traefik, toda requisição já vai ao `api-server`. O Nginx template também já roteia tudo para o api-server. Então essa mudança funciona em ambas as configurações.

### Fluxo resultante

```text
Visitante → GET /meu-slug
  api-server:
    1. Match regex → slug = "meu-slug"
    2. Query DB → título, descrição, imagem
    3. Retorna HTML com:
       - <meta og:title="Oração Poderosa">
       - <meta og:image="https://comunidade.../preview-image?slug=...">
       - <meta http-equiv="refresh" content="0;url=/f/meu-slug">
       - <script>window.location.replace("/f/meu-slug")</script>
    4. Crawler lê OG tags ✓
    5. Navegador redireciona instantaneamente para SPA ✓
```

### Arquivos modificados
- `self-host/api-server.js` — nova função + substituição do bloco de bot detection

### Após deploy
```bash
cd /root/comunidade-de-oracao && git pull && sudo bash self-host/update.sh
curl -s http://127.0.0.1:4000/a-verdadeira-oracao-de-1-minuto | head -20
```
O HTML deve conter `og:title` com o título do funil e `meta http-equiv="refresh"`.

