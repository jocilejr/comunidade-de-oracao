

## Plano: Corrigir execução de code tools e mapeamento de variáveis do GPT

### Diagnóstico

Analisei os dados reais do banco. O fluxo faz:
1. OpenAI bloco chama GPT → GPT faz tool_call para `interpretarFormaPagamento`
2. Code tool executa: `const texto = input.toLowerCase(); if (texto.includes("cartão")...) return { forma_pagamento: "cartao" }`
3. Condition block verifica se variável == "boleto" / "pix" / "cartão"

**Há 2 bugs críticos:**

**Bug 1: Variável `input` não existe no escopo do code tool**
O código usa `input.toLowerCase()`, mas o engine executa com `new Function('args', code)`. A variável `input` nunca é definida — o parâmetro é `args`. Resultado: `input` é `undefined`, `.toLowerCase()` lança TypeError, cai no catch, variável nunca é setada.

**Bug 2: `String()` de objeto retorna `[object Object]`**
Mesmo corrigindo o bug 1, o code tool retorna `{ forma_pagamento: "cartao" }` (um objeto). O engine faz `String(result)` → `"[object Object]"`. A condition compara `"[object Object]"` com `"cartão"` → falha → nenhuma condição match → conversa finalizada.

### Solução — `src/lib/typebot-engine.ts`

**1. Corrigir passagem de argumentos nos code tools:**
Em vez de `new Function('args', code)`, injetar os argumentos do tool_call como variáveis locais no escopo do código:
```typescript
const argDeclarations = Object.keys(args)
  .map(k => `var ${k} = args[${JSON.stringify(k)}];`)
  .join('\n');
const fn = new Function('args', argDeclarations + '\n' + code);
const result = fn(args);
```
Assim `input` fica disponível como variável local.

**2. Serializar resultado do code tool corretamente:**
Se o resultado for um objeto, usar `JSON.stringify` em vez de `String`:
```typescript
codeToolResults[fnName] = typeof result === 'object' 
  ? JSON.stringify(result) 
  : String(result);
```

**3. Extrair campo do objeto no responseMapping:**
No mapeamento do segundo responseMapping (sem `valueToExtract`), se o code tool result for um JSON com um único campo, extrair o valor desse campo diretamente:
```typescript
// Se codeToolResult é '{"forma_pagamento":"cartao"}', extrair "cartao"
try {
  const parsed = JSON.parse(codeToolResults[fnName]);
  const values = Object.values(parsed);
  if (values.length === 1) {
    variable = String(values[0]);  // "cartao"
  }
} catch { /* use raw string */ }
```

### Resultado esperado
- GPT responde com tool_call → code tool executa corretamente com `input` disponível
- Resultado `{ forma_pagamento: "cartao" }` → variável recebe `"cartao"`
- Condition `Equal to "cartão"` vs `"cartao"` → match (comparação case-insensitive já existe)
- Fluxo segue para o grupo correto em vez de finalizar

### Arquivo afetado

| Arquivo | Ação |
|---|---|
| `src/lib/typebot-engine.ts` | Fix arg passing, fix serialização, fix responseMapping extraction |

