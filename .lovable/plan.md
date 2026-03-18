

## Diagnóstico Final — Causa Raiz Encontrada

Analisei o JSON real do funil e o código do engine linha por linha. O fluxo no **Group #6** é:

```text
text input (mensagemusuario) → openai (GPT + tool) → Condition (forma_pagamento) → text fallback (loop)
```

### A causa raiz real: **O tool `interpretarFormaPagamento` não tem parâmetros no schema**

O JSON do funil define o tool assim:
```json
{ "name": "interpretarFormaPagamento", "parameters": [], "code": "const texto = input.toLowerCase(); ..." }
```

O engine normaliza `parameters: []` para `{ type: "object", properties: {} }` e envia isso para a OpenAI. Resultado:

1. O GPT **não sabe** que deve passar o texto do usuário como `input` — o schema diz que a função não recebe nada
2. GPT chama a tool com `arguments: "{}"` (vazio)
3. O código executa `var input = args["input"]` → `input = undefined`
4. `input.toLowerCase()` → **TypeError** → cai no catch → `codeToolResults` fica vazio
5. `responseMapping[1]` (forma_pagamento) fica vazio
6. Condition não faz match → fallback text → loop (na melhor hipótese) ou, se o GPT **não chamar a tool** de todo, o segundo mapping simplesmente não é preenchido

### Há 2 bugs para corrigir

**Bug 1: Tool schema sem parâmetros → GPT não passa `input`**
Quando um code tool tem `parameters` vazio/array e o código referencia variáveis como `input`, o engine precisa:
- Adicionar `input` como parâmetro no schema enviado à OpenAI (com descrição "User's message to analyze")
- Como fallback na execução: se `args.input` não existir, injetar a última mensagem do usuário (extraída do array `messages` enviado ao GPT)

**Bug 2: responseMapping[1] sem fallback quando não há tool call**
Se o GPT responder apenas com texto (sem tool_call), o segundo mapping com `valueToExtract === ''` não entra em nenhum branch → variável nunca é preenchida. Precisa de fallback para `assistantContent`.

### Plano de correção — `src/lib/typebot-engine.ts`

**1. Auto-detectar parâmetros usados no código e adicionar ao schema:**
```typescript
// Para code tools com parameters vazio, analisar o código
// e adicionar variáveis referenciadas como parâmetros
if (codeToolMap.has(name) && Object.keys(params.properties || {}).length === 0) {
  // Detectar variáveis simples usadas no código (ex: input, texto, mensagem)
  const code = codeToolMap.get(name);
  const commonArgs = ['input', 'text', 'message', 'mensagem', 'texto'];
  const usedArgs = commonArgs.filter(arg => code?.includes(arg));
  if (usedArgs.length > 0) {
    params = { type: 'object', properties: {} };
    for (const arg of usedArgs) {
      params.properties[arg] = { type: 'string', description: `The ${arg} to process` };
    }
  }
}
```

**2. Fallback na execução do code tool:**
Quando `args.input` é undefined, injetar o conteúdo da última mensagem "user" do array `messages`:
```typescript
if (args.input === undefined) {
  const lastUserMsg = messages.filter(m => m.role === 'user').pop();
  args.input = lastUserMsg?.content || '';
}
```

**3. Fallback no responseMapping quando não há tool calls:**
Para mappings subsequentes sem `valueToExtract` e sem tool calls, usar `assistantContent` como fallback:
```typescript
// Após o check de tool calls:
else if (extract === '' && idx > 0) {
  // Fallback: use assistant content (GPT may have responded with just text)
  this.setVariable(mapping.variableId, assistantContent);
}
```

### Arquivo afetado

| Arquivo | Ação |
|---|---|
| `src/lib/typebot-engine.ts` | Fix tool schema, fix code tool fallback, fix responseMapping fallback |

### Resultado esperado
- GPT recebe tool com `input` no schema → passa o texto do usuário
- Code tool executa com `input` disponível → retorna `{ forma_pagamento: "pix" }`
- responseMapping[1] recebe `"pix"` extraído do resultado
- Condition `Equal to "pix"` → match → segue para ramo correto
- Se GPT não chamar tool: responseMapping[1] recebe texto do assistente como fallback

