## Plano: Sistema de Logs de Sessões dos Funis

### O que será construído

Um sistema completo de rastreamento dentro do admin que registra cada sessão de usuário nos funis: identificação da pessoa (anônima ou por dados coletados), cada resposta dada, respostas do GPT, e em qual bloco/grupo a pessoa parou.

### 1. Tabela no banco de dados

`**funnel_sessions**` — uma sessão por visitante por funil:


| Coluna           | Tipo              | Descrição                               |
| ---------------- | ----------------- | --------------------------------------- |
| id               | uuid (PK)         | ID da sessão                            |
| funnel_id        | uuid (FK→funnels) | Qual funil                              |
| started_at       | timestamptz       | Início                                  |
| ended_at         | timestamptz       | Quando terminou (null = em andamento)   |
| last_block_id    | text              | Último bloco processado                 |
| last_group_title | text              | Título do último grupo                  |
| variables        | jsonb             | Variáveis coletadas (nome, email, etc.) |
| completed        | boolean           | Se chegou ao fim                        |


`**funnel_session_events**` — cada interação registrada:


| Coluna      | Tipo                      | Descrição                                                                 |
| ----------- | ------------------------- | ------------------------------------------------------------------------- |
| id          | uuid (PK)                 | &nbsp;                                                                    |
| session_id  | uuid (FK→funnel_sessions) | Sessão                                                                    |
| event_type  | text                      | 'user_input', 'bot_message', 'gpt_response', 'choice', 'condition', 'end' |
| block_id    | text                      | Bloco relacionado                                                         |
| group_title | text                      | Grupo do bloco                                                            |
| content     | text                      | Conteúdo (resposta do user, mensagem do bot, resposta GPT)                |
| metadata    | jsonb                     | Dados extras (variável preenchida, opção escolhida, etc.)                 |
| created_at  | timestamptz               | Timestamp                                                                 |


RLS: leitura restrita ao `owner_user_id` do funil (via JOIN). Inserção pública (anon) para que visitantes não-logados possam gerar logs.

### 2. Motor (`typebot-engine.ts`)

- Adicionar propriedade `sessionId` (uuid gerado no construtor) e `funnelId`.
- Novo método `logEvent(type, blockId, groupTitle, content, metadata)` que insere na tabela `funnel_session_events` via Supabase (fire-and-forget, sem bloquear o fluxo).
- Registrar eventos nos pontos-chave:
  - **Bot messages**: ao emitir mensagens de texto
  - **User input**: em `continueAfterInput`
  - **User choice**: em `continueAfterChoice`
  - **GPT response**: em `executeOpenAI` (salvar prompt enviado + resposta)
  - **End**: ao emitir evento `end`
- Ao finalizar ou no último evento, atualizar `funnel_sessions` com `ended_at`, `completed`, `last_block_id`, `variables` (snapshot das variáveis coletadas).

### 3. ChatRenderer

- Passar `funnelId` para o engine (já recebe `flow.id` mas precisa garantir que é o UUID do banco).
- Criar sessão no banco ao inicializar o engine.

### 4. Tela de Logs no Admin

- Nova aba "Logs" no painel admin (ao lado de Funis, Avatares, Estatísticas, Configurações).
- Lista de sessões por funil com: data/hora, variáveis coletadas (nome, telefone se houver), status (completo/abandonado), último grupo.
- Ao clicar numa sessão, exibe timeline com todas as interações em ordem cronológica (mensagens do bot, respostas do user, respostas GPT).

### Arquivos afetados


| Arquivo                                | Ação                                                              |
| -------------------------------------- | ----------------------------------------------------------------- |
| Migration SQL                          | Criar tabelas `funnel_sessions` e `funnel_session_events` com RLS |
| `src/lib/typebot-engine.ts`            | Adicionar logging de eventos                                      |
| `src/components/chat/ChatRenderer.tsx` | Passar funnelId ao engine                                         |
| `src/pages/Funnel.tsx`                 | Passar funnel.id ao ChatRenderer                                  |
| `src/pages/Admin.tsx`                  | Adicionar aba "Logs" com listagem e detalhes                      |
