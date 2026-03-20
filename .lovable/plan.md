

## Remover totalmente o prefixo `/f/` — funis servidos direto em `/:slug`

### Abordagem

Em vez de ter duas rotas (`/:slug` para OG + redirect e `/f/:slug` para o SPA), tudo vai funcionar em `/:slug` diretamente. O modo robusto no `api-server.js` vai **injetar as OG tags dentro do próprio `index.html`** do SPA e servir tudo numa única resposta — sem redirect, sem meta-refresh, sem `/f/`.

Crawlers leem as OG tags do `<head>`. Navegadores carregam o React normalmente. Zero redirecionamento.

### Mudanças

**1. `self-host/api-server.js`**
- `handleShareRobust`: em vez de gerar HTML separado com meta-refresh, ler o `index.html` do SPA e injetar as OG tags (`og:title`, `og:description`, `og:image`, etc.) no `<head>` antes de servir. Remover o meta-refresh e o script de redirect
- Remover `f` da lista RESERVED
- Remover referências a `/f/` em `handleShare` e `handleShareRobust` (as variáveis `spaUrl` que apontavam para `/f/slug`)
- O catch-all de slug continua com a regex `^\/([a-zA-Z0-9_-]+)\/?$` interceptando `/:slug`, mas agora serve o SPA com OG injetado em vez de HTML separado

**2. `src/App.tsx`**
- Remover as rotas `<Route path="/f/:slug">` (ambos os blocos, público e dashboard)
- Manter apenas `<Route path="/:slug" element={<Funnel />} />`

**3. `src/pages/Admin.tsx`**
- Trocar todas as referências visuais `/f/slug` por `/slug` (labels, toasts, inputs)

**4. `supabase/functions/share/index.ts`**
- Mudar `redirectUrl` de `${appOrigin}/f/${slug}` para `${appOrigin}/${slug}`

**5. `self-host/nginx.conf.template`**
- No domínio público, remover o redirect para `/f/$1` — redirecionar direto para `/__DASHBOARD_DOMAIN__/$1`

### Fluxo resultante

```text
Visitante → GET /meu-slug
  api-server:
    1. Match regex → slug = "meu-slug"
    2. Query DB → título, descrição, imagem
    3. Lê index.html, injeta OG tags no <head>
    4. Serve HTML completo (SPA + OG tags)
    5. Crawler lê OG tags ✓
    6. Navegador executa React, renderiza funil ✓
    7. Zero redirect ✓
```

