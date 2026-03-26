

## Pixel Global — Configuração Centralizada

### O que muda

Atualmente o pixel é configurado **por funil** (cada funil tem seu próprio Pixel ID). Você quer definir **um ou mais pixels globais** que disparam automaticamente em **todos os funis**.

### Como vai funcionar

1. **Nova tabela `user_pixels`** no banco de dados:
   - `id`, `user_id`, `pixel_id` (o ID do Meta Pixel), `capi_token` (opcional), `created_at`
   - Permite adicionar múltiplos pixels
   - RLS: cada usuário vê/edita apenas os seus

2. **Aba Marketing redesenhada** — em vez de cards por funil, terá:
   - Lista dos seus pixels globais (adicionar/remover)
   - Cada pixel com campo para ID e Token CAPI (opcional)
   - Botão "Adicionar Pixel" para cadastrar novos
   - Todos os pixels cadastrados disparam em todos os funis automaticamente

3. **Página pública (`Funnel.tsx`)** — ao carregar um funil:
   - Busca todos os pixels do dono do funil (`user_id`) na tabela `user_pixels`
   - Injeta o base code do Meta Pixel com `fbq('init', pixelId)` para **cada** pixel cadastrado
   - Dispara `PageView` em todos
   - Os eventos `fbq('track', ...)` nos blocos Script do fluxo já funcionam automaticamente para todos os pixels inicializados

4. **Manter compatibilidade**: os campos `meta_pixel_id` e `meta_capi_token` na tabela `funnels` continuam existindo (não quebra nada), mas a aba Marketing passa a usar a nova tabela global.

5. **Self-host (`api-server.js`)**: atualizar o endpoint do funil público para também retornar os pixels globais do dono.

### Arquivos modificados

| Arquivo | Mudança |
|---------|---------|
| Migration SQL | Criar tabela `user_pixels` com RLS |
| `src/lib/funnel-storage.ts` | CRUD de pixels globais (`getUserPixels`, `addUserPixel`, `removeUserPixel`) |
| `src/pages/Admin.tsx` | Aba Marketing com lista de pixels globais (add/remove) |
| `src/pages/Funnel.tsx` | Buscar pixels do dono e inicializar todos |
| `src/lib/typebot-types.ts` | Tipo `UserPixel` |
| `self-host/api-server.js` | Endpoint retorna pixels do dono |

### Detalhes técnicos

**Tabela `user_pixels`:**
```sql
CREATE TABLE public.user_pixels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  pixel_id text NOT NULL,
  capi_token text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_pixels ENABLE ROW LEVEL SECURITY;
-- Policies: SELECT/INSERT/DELETE para auth.uid() = user_id
-- Policy pública de SELECT para carregar pixels do dono na página do funil
```

**Inicialização múltipla de pixels:**
```javascript
// Para cada pixel: fbq('init', 'PIXEL_1'); fbq('init', 'PIXEL_2');
// Um único fbq('track', 'PageView') dispara em todos os pixels inicializados
```

