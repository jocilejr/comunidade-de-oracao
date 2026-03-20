

## Correções: Link Preview + Card Admin + Bubble do Usuário

### 1. Link preview sumiu — remover meta-refresh para crawlers

**Problema**: No `handleShare` (api-server.js, linha 122), o HTML servido aos crawlers contém `<meta http-equiv="refresh" content="0;url=...">`. O WhatsApp segue este redirect imediatamente antes de processar as OG tags, resultando em preview vazio.

**Correção em `self-host/api-server.js`**:
- Remover a linha `<meta http-equiv="refresh" content="0;url=${escapeHtml(spaUrl)}" />` do HTML servido aos crawlers
- O HTML já contém um link `<a>` no body para humanos que eventualmente acessem essa URL — isso é suficiente

### 2. Card do funil — mostrar preview ativa (já funciona)

O card já exibe `funnel.previewImage` (que é `funnels.preview_image` do DB) — linha 515-516 do Admin.tsx. Como a rotação do cron atualiza essa coluna, o card já mostra a imagem ativa. Se a primeira imagem está aparecendo sempre, é porque só há 1 imagem na galeria (confirmado: `funnel_preview_images` tem só 1 registro para esse funil) ou o cron não está alternando (com 1 imagem, não alterna).

### 3. Countdown no modal de previews

**Correção em `src/pages/Admin.tsx`** — no dialog de Preview Gallery:
- Calcular: `nextRotation = próxima hora UTC cheia`
- Mostrar countdown "Próxima rotação em XX min" abaixo do texto explicativo
- Usar `setInterval` de 60s para atualizar o countdown
- Indicar claramente qual imagem está ativa (já tem a estrela) e qual será a próxima (calculada com `(currentHour + 1) % total`)

### 4. Remover cauda da bubble do usuário

**Correção em `src/components/chat/UserBubble.tsx`**:
- Remover completamente o SVG da cauda (linhas 12-23)
- Remover `rounded-tr-none` do div da bubble (linha 10) — fica com cantos uniformes
- Resultado: bubble verde retangular arredondada sem qualquer fragmento

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `self-host/api-server.js` | Remover meta-refresh do HTML de crawlers |
| `src/components/chat/UserBubble.tsx` | Remover SVG da cauda completamente |
| `src/pages/Admin.tsx` | Adicionar countdown de rotação no modal de previews + indicar próxima imagem |

