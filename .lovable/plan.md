

## Correção definitiva: Rotação + Preview WhatsApp

### Problema 1: Rotação não funciona ("Rotacionar Agora" não muda nada)

A lógica usa `currentHour % totalImages`. Cada chamada na mesma hora UTC retorna o mesmo índice. O botão "Rotacionar Agora" chama o mesmo endpoint, mas como a hora não mudou, seleciona a mesma imagem.

**Correção em `self-host/api-server.js`**:
- Adicionar lógica de rotação incremental: em vez de calcular pelo relógio, o endpoint lê qual imagem está ativa (`funnels.preview_image`), encontra o índice dela na galeria e avança para a próxima (round-robin)
- O cron continua chamando a cada hora, mas agora cada chamada avança a imagem
- O botão "Rotacionar Agora" funciona imediatamente

### Problema 2: Preview WhatsApp pequeno (não full-screen)

As imagens são armazenadas como `data:image/...;base64,...` e servidas via `/preview-image?slug=`. O WhatsApp exige resposta rápida e imagem com dimensões adequadas. Dois problemas:
- Base64 de ~500KB vira ~700KB no banco → decodificação lenta
- Sem conversão para JPEG otimizado, a imagem pode ser PNG pesado

**Correção em `self-host/api-server.js`**:
- No `handlePreviewImage`, adicionar cache em memória (Map com TTL de 5 min) para evitar query + decode a cada requisição do crawler
- Servir com `Content-Type` correto já existente

**Correção no upload (frontend)**:
- Em `src/pages/Admin.tsx` e `src/lib/funnel-storage.ts`: ao fazer upload de preview, converter para JPEG otimizado (quality 0.85) usando Canvas, mantendo proporção original mas limitando a 1200px de largura
- Isso reduz o tamanho do base64 armazenado e acelera a entrega

### Problema 3: `getAllFunnelsMeta` carrega base64 de todas as imagens

A query seleciona `preview_image` (que contém megabytes de base64) para todos os funis. Isso torna a listagem lenta.

**Correção em `src/lib/funnel-storage.ts`**:
- Remover `preview_image` da query de `getAllFunnelsMeta` — o card do admin não precisa exibir a imagem inline
- Ou adicionar um campo `has_preview` boolean derivado

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `self-host/api-server.js` | Rotação round-robin (não baseada em hora); cache de imagem em memória |
| `src/pages/Admin.tsx` | Upload converte para JPEG otimizado via Canvas; ajustar "Rotacionar Agora" para funcionar sem depender da hora UTC |
| `src/lib/funnel-storage.ts` | Função `compressPreviewImage()` para otimizar antes de salvar; remover `preview_image` de `getAllFunnelsMeta` |

### Validação pós-deploy
1. `sudo bash self-host/update.sh`
2. Testar: `curl -I https://PUBLIC_DOMAIN/preview-image?slug=SEU_SLUG` → deve retornar `Content-Type: image/jpeg`
3. Botão "Rotacionar Agora" → imagem muda imediatamente no modal
4. Compartilhar link no WhatsApp → preview com imagem grande

