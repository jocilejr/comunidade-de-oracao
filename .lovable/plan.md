

## Plano: Imagem de Preview por Funil

### O que será feito
Cada funil terá uma imagem de preview/thumbnail que aparece no card do admin. O usuário poderá fazer upload de uma imagem personalizada para cada funil.

### Mudanças

**1. Banco de dados (Migration)**
- Adicionar coluna `preview_image text` na tabela `funnels` (nullable, armazena data URL ou URL de imagem).

**2. Tipos (`src/lib/typebot-types.ts`)**
- Adicionar `previewImage?: string` ao `StoredFunnel`.

**3. Storage (`src/lib/funnel-storage.ts`)**
- Incluir `preview_image` nas queries de leitura e mapeamento.
- Nova função `updateFunnelPreviewImage(slug, imageDataUrl)` para salvar a imagem.

**4. Admin (`src/pages/Admin.tsx`)**
- No card de cada funil, exibir a `previewImage` como thumbnail (ou um placeholder genérico se não tiver).
- Adicionar botão de upload de imagem no card (ícone de câmera/imagem) que abre um file input, converte para data URL e salva via `updateFunnelPreviewImage`.

### Arquivos afetados
| Arquivo | Ação |
|---|---|
| Migration SQL | Adicionar coluna `preview_image` |
| `src/lib/typebot-types.ts` | Adicionar campo ao StoredFunnel |
| `src/lib/funnel-storage.ts` | Incluir nas queries + nova função de update |
| `src/pages/Admin.tsx` | Exibir thumbnail + botão de upload |

