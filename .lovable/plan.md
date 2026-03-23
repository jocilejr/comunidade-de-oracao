

## Corrigir imagens de preview não aparecendo no modal

### Problema raiz

Os funis antigos têm a imagem de preview salva diretamente na coluna `funnels.preview_image`, mas não possuem registros na tabela `funnel_preview_images` (galeria). O modal de previews só consulta a tabela de galeria, então mostra "Nenhuma imagem de preview" mesmo quando a imagem existe e aparece no card do funil.

### Solução

Quando o modal de previews é aberto e `funnel_preview_images` retorna vazio, verificar se o funil tem um `preview_image` definido. Se sim, migrar automaticamente essa imagem para a tabela `funnel_preview_images` como primeiro item da galeria.

### Arquivo modificado

**`src/pages/Admin.tsx`** — No handler que abre o modal de previews (onde `getFunnelPreviewImages` é chamado), adicionar lógica de auto-migração:

1. Se `getFunnelPreviewImages(funnel.id)` retorna array vazio
2. E `funnel.previewImage` existe e não é vazio
3. Então chamar `addFunnelPreviewImage(funnel.id, funnel.previewImage)` para criar o registro na galeria
4. Usar o resultado retornado como lista de imagens do modal

Isso garante compatibilidade retroativa com funis criados antes da galeria, sem perder nenhuma imagem existente.

