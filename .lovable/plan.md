## Correção de 4 Bugs

### 1. Fragmento visual no UserBubble (tail SVG)

**Arquivo:** `src/components/chat/UserBubble.tsx`

- O path SVG do "tail" (linha 20) está gerando um artefato visual ao lado do bubble
- Substituir pelo path correto do WhatsApp que se encaixa sem artefatos: `M1 0v13l2-2c.6-.6 1.3-1 2-1h3V0z` (triangulo simples alinhado ao topo)

### 2. Preview images somem após rotação do cron

**Problema raiz:** A edge function `preview-image` tem `Cache-Control: public, max-age=300, s-maxage=60`. Quando o cron roda e atualiza `funnels.preview_image`, Cloudflare/CDN ainda serve a resposta cacheada. Se a resposta anterior foi um 404 (durante a transição), fica cacheado como 404.  
  
Outro problema é que a imagem fica pequena no link preview. O padrão está sendo a imagem ao lado do titulo e descrição. QUero que seja a imagem ocupando todo o espaço e abaixo o titulo e descrição.

**Arquivo:** `supabase/functions/preview-image/index.ts`

- Remover cache: usar `Cache-Control: no-cache, no-store, must-revalidate` para garantir que cada request busque o dado atual do banco
- Adicionar validação: se `data_url` estiver vazio/inválido, retornar 404 com mensagem clara

**Arquivo:** `supabase/functions/rotate-preview-images/index.ts`

- Adicionar validação: só atualizar `funnels.preview_image` se `data_url` começa com `data:` ou `http`
- Logar qual imagem foi ativada para debug

### 3. Favicon não altera

**Arquivo:** `index.html`

- Copiar `logo-ov.png` (enviada pelo usuário) para `public/favicon.png`
- Adicionar `<link rel="icon" href="/favicon.png" type="image/png">` no `<head>`

### 4. Título e logo do dashboard

**Arquivo:** `src/pages/Admin.tsx` (linhas 357-364)

- Trocar `<Bot>` icon por `<img src="/logo-ov.png">` (34x34px, rounded)
- Trocar "Funil Monitorado" por "Typebot Inteligente"
- Trocar "Origem Viva" (subtítulo) permanece igual

**Arquivo:** `index.html`

- Alterar `<title>` para "Typebot Inteligente Origem Viva"

**Arquivo:** `src/pages/Funnel.tsx` (linha 42)

- Trocar fallback `'Funil Monitorado — Origem Viva'` por `'Typebot Inteligente Origem Viva'`

**Asset:** Copiar `user-uploads://logo-ov.png` para `public/logo-ov.png`