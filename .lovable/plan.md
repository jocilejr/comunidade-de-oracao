

## Correções: Modal não mostra imagem ativa + Preview WhatsApp não full-screen

### Problema 1: Modal não reflete a imagem ativa após rotação

**Causa raiz**: `getAllFunnelsMeta()` foi otimizado para NÃO carregar `preview_image` (retorna `previewImage: ''`). Porém `handleRotateNow` usa essa função para obter a imagem ativa após rotação — recebe sempre vazio.

**Correção**:
- Em `handleRotateNow` (Admin.tsx): após rotação, buscar a imagem ativa diretamente do banco via query individual (`getFunnelById`) em vez de `getAllFunnelsMeta`
- Alternativa mais leve: criar função `getActiveFunnelPreview(funnelId)` em `funnel-storage.ts` que faz `SELECT preview_image FROM funnels WHERE id = $1` — retorna apenas o campo necessário sem carregar o flow inteiro

### Problema 2: WhatsApp mostra preview pequeno (não full-screen)

**Causa raiz**: As OG tags declaram `og:image:width=1200` e `og:image:height=630` fixos, mas a imagem real tem proporções diferentes. O WhatsApp detecta a inconsistência e renderiza como thumbnail pequeno em vez de card grande.

**Correções em `self-host/api-server.js`**:
1. **Remover `og:image:width` e `og:image:height` fixos** — quando ausentes, o WhatsApp usa as dimensões reais da imagem e renderiza como card grande automaticamente (desde que a imagem seja ≥ 300x200)
2. **Remover `Cache-Control: public, max-age=300`** do endpoint `/preview-image` — usar `no-cache` para que o WhatsApp sempre busque a versão atualizada (importante para rotação)
3. **Adicionar meta `<meta http-equiv="refresh" content="0; url=...">`** no HTML do share para garantir redirect mais rápido para crawlers lentos

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/lib/funnel-storage.ts` | Nova função `getActiveFunnelPreview(funnelId)` — query leve só do `preview_image` |
| `src/pages/Admin.tsx` | `handleRotateNow` usa nova função para atualizar `activePreviewUrl` corretamente |
| `self-host/api-server.js` | Remover `og:image:width/height` fixos; mudar cache do `/preview-image` para `no-cache` |

