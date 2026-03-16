

## Problema

No formato richText do Typebot, variáveis são armazenadas como nós filhos especiais com `type: 'inline-variable'` e uma propriedade `variableId` — **não** como texto `{{nome}}`. O código atual em `richTextChildToHtml` não reconhece esse tipo de nó, então a variável é ignorada e resulta em bolha vazia.

Exemplo de nó de variável no JSON:
```json
{ "type": "inline-variable", "children": [{ "text": "" }], "variableId": "abc123" }
```

## Plano

### 1. Atualizar o tipo `RichTextChild` em `typebot-types.ts`
Adicionar a propriedade opcional `variableId` à interface:
```ts
export interface RichTextChild {
  text?: string;
  bold?: boolean;
  // ...existente
  variableId?: string;  // ← novo
}
```

### 2. Tratar nós `inline-variable` em `richTextChildToHtml` (`typebot-engine.ts`, linha 657)
Antes da lógica existente, adicionar verificação:
```ts
if (child.type === 'inline-variable' && child.variableId) {
  return this.getVariableValue(child.variableId);
}
```

Isso resolve a variável no momento da renderização, usando o valor atual armazenado no engine.

### 3. Manter a proteção contra bolhas vazias
Após o `richTextToHtml` gerar o texto (linha ~594), verificar se o resultado é vazio após strip de tags HTML. Se vazio, retornar `null` em vez de criar mensagem — protege contra casos onde a variável ainda não tem valor definido.

