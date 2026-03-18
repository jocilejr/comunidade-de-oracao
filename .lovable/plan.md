

## Plano: Importação de Fluxos via API do Typebot

### Resumo
Adicionar uma opção no admin para conectar à API do Typebot, listar os fluxos disponíveis e importá-los diretamente, sem precisar exportar/importar JSON manualmente.

### Mudanças

**1. Armazenar API Token do Typebot**
- Adicionar campo `typebot_api_token` na tabela `user_settings` (migration).
- Atualizar `getUserSettings` / `saveUserSettings` em `funnel-storage.ts`.

**2. Edge Function `typebot-proxy`**
- Nova edge function que faz proxy das chamadas à API do Typebot (evita expor o token no client-side).
- Endpoints:
  - `POST /list` → lista typebots do workspace (requer `workspaceId`).
  - `POST /get` → busca um typebot específico por ID.
- Lê o token do Typebot da tabela `user_settings` (autenticado via JWT do usuário).

**3. Admin UI — Configurações**
- No dialog de configurações (onde já tem a chave OpenAI), adicionar campos para:
  - **API Token do Typebot**
  - **Workspace ID do Typebot**

**4. Admin UI — Botão "Importar do Typebot"**
- Novo botão ao lado do "Upload JSON" existente.
- Ao clicar, chama a edge function para listar os typebots do workspace.
- Exibe um dialog com a lista de fluxos (nome + data de criação).
- Ao selecionar um, busca o fluxo completo e salva como funil usando `saveFunnel`.

### Arquivos afetados
| Arquivo | Ação |
|---|---|
| Migration SQL | Adicionar `typebot_api_token` e `typebot_workspace_id` em `user_settings` |
| `supabase/functions/typebot-proxy/index.ts` | Nova edge function |
| `supabase/config.toml` | Registrar nova function |
| `src/lib/funnel-storage.ts` | Atualizar settings CRUD |
| `src/pages/Admin.tsx` | UI de configuração + botão importar + dialog de listagem |

### Fluxo do usuário
1. Vai em Configurações → cola o API Token e Workspace ID do Typebot
2. Clica em "Importar do Typebot"
3. Vê a lista de fluxos → seleciona um → importado automaticamente

### Segurança
- O token nunca é exposto no frontend (proxy via edge function).
- A edge function valida o JWT do usuário antes de processar.

