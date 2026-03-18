
Objetivo: corrigir o problema de preview social (WhatsApp/Facebook) quando o usuário compartilha e abre links do funil, evitando comportamento “parece que não mudou”.

Diagnóstico (com base no código atual):
1) O link direto `/f/:slug` é uma rota SPA (frontend). Crawlers sociais geralmente não executam JS para ler metas dinâmicas; então eles não “enxergam” o `og:image` atualizado do funil.
2) O endpoint de compartilhamento existe (`share`) e o de imagem também (`preview-image`), mas ainda há 3 pontos que podem manter o problema:
   - cache agressivo dos crawlers para a mesma URL;
   - redirecionamento imediato no `share` pode fazer alguns crawlers priorizarem a URL final `/f/:slug`;
   - UX no admin permite o usuário copiar/usar o link direto do funil (que não é o ideal para preview social).

Plano de implementação

1) Tornar o endpoint de compartilhamento “crawler-safe”
- Arquivo: `supabase/functions/share/index.ts`
- Ajustes:
  - adicionar suporte a `v` (cache-buster) no query string;
  - incluir `og:image`, `og:image:secure_url`, `twitter:image`, e manter título/descrição;
  - para user-agents de bots (WhatsApp/Facebook/Twitter/LinkedIn/Slack/Telegram), retornar HTML com metas sem redirecionamento imediato;
  - para navegador comum, manter redirecionamento rápido para `/f/:slug`;
  - ajustar headers de cache para reduzir stale preview.

2) Fortalecer entrega da imagem de preview
- Arquivo: `supabase/functions/preview-image/index.ts`
- Ajustes:
  - aceitar `v` sem impacto funcional (só para bust de cache na URL);
  - ajustar `Cache-Control` para comportamento mais previsível em atualização de imagem;
  - manter fallback para URL externa e resposta de erro clara quando não houver imagem.

3) Forçar uso do link correto no painel admin
- Arquivo: `src/pages/Admin.tsx`
- Ajustes:
  - no botão “Copiar link de compartilhamento”, sempre gerar URL com `?slug=...&v=<timestamp>`;
  - tornar explícito no texto/tooltip que este é o link para WhatsApp (com preview), enquanto `/f/:slug` é link de navegação do app;
  - reduzir chance de o usuário compartilhar o `/f/:slug` por engano.

4) Validar fim a fim (obrigatório)
- Teste técnico:
  - abrir `.../functions/v1/share?slug=...&v=...` e confirmar metas OG/Twitter presentes;
  - abrir `.../functions/v1/preview-image?slug=...&v=...` e confirmar imagem binária com `Content-Type` correto.
- Teste real:
  - compartilhar um link novo (com `v` diferente) no WhatsApp e verificar preview;
  - repetir com outra imagem para confirmar atualização sem “cache fantasma”.

Diagrama de fluxo após correção
```text
Admin (copiar link share com v)
   -> /functions/v1/share?slug=abc&v=123
      -> crawler social lê OG tags e og:image
      -> usuário humano é redirecionado para /f/abc
```

Detalhes técnicos (para implementação)
- Sem mudança de banco e sem migração SQL.
- Arquivos impactados:
  - `supabase/functions/share/index.ts`
  - `supabase/functions/preview-image/index.ts`
  - `src/pages/Admin.tsx`
- Sem alteração em autenticação.
- Segurança:
  - manter validações de `slug`;
  - evitar aceitar redirecionamento arbitrário via query para não abrir brecha de open redirect.

Observação importante de arquitetura
- Preview dinâmico por slug no URL direto `/f/:slug` (sem usar endpoint de share) é limitado em SPA estática.
- Para funcionar de forma nativa no próprio `/f/:slug` para crawlers, seria necessário renderização server-side/edge para essa rota.
- Neste ciclo, a solução mais confiável é padronizar o link de compartilhamento via endpoint `share` com cache-buster.
