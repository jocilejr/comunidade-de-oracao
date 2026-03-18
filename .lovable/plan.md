

## Plano: Adicionar contexto das últimas 5 mensagens à chamada OpenAI

### Problema
O bloco OpenAI atualmente não tem visibilidade do histórico da conversa. Ele só envia as mensagens configuradas no próprio bloco (system prompt + template). Isso impede que o GPT tenha contexto sobre o que já foi discutido.

### Solução
Manter um histórico de conversa no `TypebotEngine` e injetá-lo nas mensagens enviadas ao GPT.

### Mudanças em `src/lib/typebot-engine.ts`

1. **Nova propriedade `conversationHistory`**: Array de `{ role: 'assistant' | 'user', content: string }` no engine, limitado às últimas 5 entradas.

2. **Registrar mensagens no histórico**:
   - Quando o engine emite mensagens de bot (texto), registrar como `{ role: 'assistant', content }`.
   - Quando o usuário responde via `continueAfterInput` ou `continueAfterChoice`, registrar como `{ role: 'user', content }`.

3. **Injetar histórico no `executeOpenAI`**: Antes das mensagens configuradas do bloco, inserir as últimas 5 entradas do `conversationHistory` entre o system prompt e a mensagem final do usuário. Estrutura:
   ```text
   [system] → [últimas 5 mensagens do histórico] → [user message do bloco]
   ```

4. **Limite de 5**: Usar um buffer circular simples — ao adicionar, se `length > 5`, remover a mais antiga.

### Arquivo afetado
| Arquivo | Ação |
|---|---|
| `src/lib/typebot-engine.ts` | Adicionar tracking de histórico + injeção no executeOpenAI |

