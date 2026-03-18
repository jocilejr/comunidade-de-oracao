

## Problema: Preview image (OG) nao funciona

### Causa raiz

O campo `preview_image` armazena imagens como **base64 data URLs** (ex: `data:image/png;base64,...`). Crawlers de redes sociais (WhatsApp, Facebook, Twitter) nao conseguem renderizar data URLs no `og:image` — eles exigem uma URL HTTPS publica apontando para um arquivo de imagem real.

### Problema secundario

O link de compartilhamento usa a URL do app publicado (`comunidade-de-oracao.lovable.app`), mas no preview da Lovable a URL e diferente (`*.lovableproject.com`). Isso nao afeta o OG image em producao, apenas no teste.

### Solucao

Criar uma edge function `preview-image` que serve a imagem diretamente do banco de dados como resposta binaria com `Content-Type: image/png`. O `og:image` no `share` function apontara para essa edge function.

### Mudancas

1. **Nova edge function `supabase/functions/preview-image/index.ts`**
   - Recebe `?slug=xxx` como parametro
   - Busca o `preview_image` (base64) da tabela `funnels`
   - Decodifica o base64 e retorna como resposta binaria com headers corretos (`Content-Type`, `Cache-Control`)

2. **Atualizar `supabase/functions/share/index.ts`**
   - Em vez de usar o base64 diretamente no `og:image`, construir a URL da edge function `preview-image?slug=xxx`
   - Isso garante que crawlers recebam uma URL HTTPS valida

