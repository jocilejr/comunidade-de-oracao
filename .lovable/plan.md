

## Por que os funis somem

O problema **não é um bug no código** — é uma limitação arquitetural. Toda a persistência dos funis está no `localStorage` do navegador, que é volátil:

- **No ambiente Lovable**: cada vez que o código é atualizado e o preview reconstrói, o iframe pode receber uma nova origem ou ter o localStorage limpo. Isso apaga todos os funis instantaneamente.
- **No navegador em geral**: o localStorage pode ser limpo pelo usuário, por modo privado, por pressão de armazenamento, ou por políticas do navegador (Safari é especialmente agressivo).

O backup (`typebot-funnels-backup`) também está no localStorage, então é apagado junto.

## Solução: migrar para Supabase

Substituir localStorage por um banco de dados persistente (Supabase) para armazenar os funis. Isso garante que os dados sobrevivam a rebuilds, limpezas de cache e troca de dispositivo.

### Etapas

1. **Conectar Supabase ao projeto** (Lovable Cloud ou projeto externo)

2. **Criar tabela `funnels`** via migração SQL:
   - `id` (uuid, PK)
   - `slug` (text, unique)
   - `name` (text)
   - `flow` (jsonb) — o JSON do Typebot
   - `bot_name` (text, nullable)
   - `bot_avatar` (text, nullable)
   - `created_at` (timestamptz)
   - `user_id` (uuid, FK para auth.users)
   - RLS: cada usuário só vê seus próprios funis

3. **Criar tabela `avatar_gallery`** para a galeria de avatares

4. **Refatorar `funnel-storage.ts`** para usar o cliente Supabase em vez de localStorage:
   - `getAllFunnels()` → `supabase.from('funnels').select('*')`
   - `saveFunnel()` → `supabase.from('funnels').upsert(...)`
   - `deleteFunnel()` → `supabase.from('funnels').delete()`
   - Manter as mesmas interfaces (`StoredFunnel`) para não quebrar o resto do código

5. **Atualizar `Admin.tsx`** para usar chamadas assíncronas (as funções passam a retornar `Promise`)

6. **Manter localStorage como cache local** (opcional) para carregamento instantâneo, mas sempre sincronizar com Supabase como fonte de verdade

### Benefícios
- Funis nunca mais desaparecem
- Funciona entre dispositivos
- Dados sobrevivem a rebuilds, limpeza de cache, etc.
- Autenticação real (substituindo o login hardcoded atual)

