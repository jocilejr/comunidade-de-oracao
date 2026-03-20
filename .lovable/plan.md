
Objetivo: corrigir o preview social e a rotação no ambiente VPS (sem depender de dados da Cloud), e eliminar de vez o “fragmento” da bolha do usuário.

1) Corrigir rotação no backend VPS (causa provável do “sempre primeira imagem”)
- Arquivos: `self-host/update.sh` e `self-host/install.sh`
- Ajustes:
  - Garantir/recriar o cron da rotação também no `update.sh` (hoje só existe no `install.sh`).
  - Garantir serviço de cron ativo no servidor (enable/start).
  - Trocar cron silencioso por cron com log (ex.: `/var/log/funnel-rotate.log`) para diagnosticar execução real.
- Resultado: cada hora o endpoint `/rotate-preview-images` é chamado de forma confiável após updates.

2) Fortalecer endpoint de rotação e observabilidade
- Arquivo: `self-host/api-server.js`
- Ajustes:
  - Em `handleRotateImages`, manter ordenação determinística por `funnel_id, position`.
  - Validar `data_url` antes de atualizar `funnels.preview_image`.
  - Retornar payload de debug por funil (quantas imagens, índice escolhido, id da imagem ativa) para facilitar verificação.
- Resultado: rotação previsível e fácil de auditar quando houver dúvida.

3) Corrigir preview social (WhatsApp/Facebook) no VPS
- Arquivo: `self-host/api-server.js` (e compatibilidade em `self-host/nginx.conf.template`)
- Ajustes:
  - `handleShare`: se `funnels.preview_image` estiver vazio, usar fallback da primeira imagem de `funnel_preview_images`.
  - `og:image:type` dinâmico conforme MIME real do `data_url` (não fixo em PNG).
  - Suportar ambos caminhos de imagem (`/preview-image` e `/api/preview-image`) para evitar quebra por modo de proxy.
- Resultado: OG tags sempre têm imagem válida e estável para crawler.

4) Mostrar “imagem ativa agora” corretamente no modal (sem estado stale)
- Arquivo: `src/pages/Admin.tsx`
- Ajustes:
  - Hoje o modal usa `previewGalleryDialog?.previewImage` (snapshot antigo). Substituir por estado “activePreviewUrl” atualizado via leitura periódica do funil (polling curto enquanto modal aberto).
  - Recalcular badge de ativa/próxima com base no estado atualizado.
  - Exibir aviso explícito quando houver `< 2` imagens (“com 1 imagem não há alternância”).
  - Adicionar botão “Rotacionar agora” no modal para teste imediato e refresh automático da lista/cards.
- Resultado: o modal reflete a imagem realmente ativa no backend, sem impressão falsa de “travado na primeira”.

5) Remover definitivamente o fragmento visual da bolha do usuário
- Arquivo: `src/components/chat/UserBubble.tsx`
- Ajustes:
  - Remover o SVG final (checks azuis) e qualquer elemento decorativo residual na bolha do usuário.
  - Manter apenas texto + horário, sem cauda/fragmentos.
- Resultado: bolha limpa, sem detalhe visual extra.

Validação final (VPS)
- Rodar `bash update.sh`.
- Verificar cron instalado e logs de execução.
- No admin: abrir modal com 3 imagens, usar “Rotacionar agora”, confirmar troca de ativa.
- Testar crawler:
  - `curl -A "WhatsApp/2.24" https://SEU_DOMINIO_PUBLICO/SEU_SLUG`
  - Confirmar presença de `og:image`, `og:image:secure_url`, `og:image:type`.
