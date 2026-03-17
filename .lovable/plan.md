

## Plano: Suporte a blocos OpenAI no motor do Typebot

### Contexto

Encontrei no JSON do funil blocos com `type: "openai"` que contêm:
- `action`: "Create chat completion"
- `model`: "gpt-4.1"  
- `messages`: array com `role` (system/user) e `content` (com variáveis como `{{mensagemusuario}}`)
- `responseMapping`: array mapeando a resposta para variáveis (ex: `mensagemgpt`, `forma_pagamento`)
- `tools`: funções customizadas (ex: `interpretarFormaPagamento`)

O fluxo funciona assim:
1. Usuário digita desabafo → salvo na variável `DesabafoGPT`
2. Bloco `Set variable` copia `{{RespostaDesabafoGPT}}` (que ainda está vazia)
3. Bloco `openai` deveria chamar o GPT com o texto do usuário e salvar a resposta na variável `mensagemgpt`
4. Bloco `text` exibe `{{mensagemgpt}}` — mas como o bloco openai é ignorado, a variável fica vazia → mensagem em branco

### Etapas

1. **Criar edge function `openai-proxy`** que recebe o system prompt, mensagens do usuário e modelo, e chama a API do Lovable AI (que já está disponível via `LOVABLE_API_KEY`) para gerar a resposta. Isso evita expor chaves de API no cliente.

2. **Adicionar tipo `OpenAIBlock` em `typebot-types.ts`** com a estrutura:
   ```
   type: 'openai'
   options: { action, model, messages[], responseMapping[], tools[] }
   ```

3. **Implementar suporte no `typebot-engine.ts`**:
   - Reconhecer `openai` no `normalizeBlockType`
   - Tratar como bloco lógico (não bubble, não input)
   - No `processLogicBlock`, fazer fetch para a edge function com as mensagens (substituindo variáveis)
   - Mapear a resposta para as variáveis configuradas em `responseMapping`

4. **Mapear modelo do Typebot para modelo Lovable AI**: `gpt-4.1` → `openai/gpt-5` (ou equivalente disponível)

### Detalhes técnicos

- A edge function usa `LOVABLE_API_KEY` (já configurada) para chamar o endpoint de IA
- As variáveis nas mensagens (ex: `{{DesabafoGPT}}`) são resolvidas pelo `replaceVariables` antes de enviar
- O `responseMapping[0]` recebe o texto da resposta, mapeamentos adicionais recebem resultados de tools
- Blocos `Set variable` com `{{RespostaDesabafoGPT}}` vão funcionar naturalmente depois que a variável for preenchida pelo bloco openai

