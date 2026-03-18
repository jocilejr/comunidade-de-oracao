

## Plano: Múltiplos Previews com Rotação Automática

### Resumo
Criar uma tabela separada `funnel_preview_images` para armazenar múltiplas imagens de preview por funil. A cada 1 hora, o sistema alterna automaticamente qual imagem está ativa (exibida como `preview_image` na tabela `funnels`).

### Mudanças

**1. Banco de dados — Nova tabela + migration**
- Criar tabela `funnel_preview_images` com colunas: `id`, `funnel_id` (FK para funnels), `user_id`, `data_url` (text), `position` (int), `created_at`.
- RLS: owner pode CRUD, leitura pública para exibição.

**2. Backend function — Rotação automática**
- Criar edge function `rotate-preview-images` que, ao ser chamada, percorre todos os funis com múltiplas imagens e atualiza `funnels.preview_image` para a próxima imagem da lista (baseado na hora atual e quantidade de imagens: `hour % count`).
- Configurar um cron job (`pg_cron`) para invocar essa function a cada hora.

**3. Storage (`src/lib/funnel-storage.ts`)**
- Novas funções: `getFunnelPreviewImages(funnelId)`, `addFunnelPreviewImage(funnelId, dataUrl)`, `removeFunnelPreviewImage(imageId)`.
- Manter `updateFunnelPreviewImage` para compatibilidade.

**4. Admin UI (`src/pages/Admin.tsx`)**
- Substituir o upload único por uma galeria de previews no card do funil.
- Ao clicar na área de preview, abrir um dialog/painel mostrando todas as imagens do funil com opções de adicionar e remover.
- Indicador visual de qual imagem está ativa no momento.

### Arquivos afetados
| Arquivo | Ação |
|---|---|
| Migration SQL | Criar tabela `funnel_preview_images` |
| `supabase/functions/rotate-preview-images/index.ts` | Edge function de rotação |
| Cron job SQL | Agendar execução a cada hora |
| `src/lib/funnel-storage.ts` | Funções CRUD para múltiplas imagens |
| `src/pages/Admin.tsx` | UI de galeria de previews por funil |

