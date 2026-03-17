
Objetivo: corrigir definitivamente a renderização de variáveis no Inspetor (especialmente no Group #5) e deixar a leitura mais confiável em diferentes formatos de bloco Typebot.

### Diagnóstico (baseado no fluxo real)
- O fluxo salvo usa majoritariamente `options` (não `content`) para vários blocos.
- No Group #5, o bloco **Set variable** vem como:
  - `options.variableId`
  - `options.expressionToEvaluate`
- O inspetor atual lê Set variable por `content`, então mostra variável/expressão erradas (ou vazias).
- Existem variáveis em formatos diferentes:
  1) `inline-variable` com `variableId` direto
  2) `inline-variable` com `children[0].variableId`
  3) texto com `{{nomeDaVariavel}}` dentro de strings (OpenAI/texto)

### Plano de implementação

1) Padronizar resolução de variável no `FunnelInspector.tsx`
- Criar helpers:
  - `resolveVarName(ref)` (aceita id ou nome; com `trim`)
  - `extractMustacheParts(text)` (quebra texto e `{{...}}` para renderizar chips)
  - `getInlineVariableId(node)` (suporta os 2 formatos de `inline-variable`)

2) Corrigir render dos blocos que ainda falham
- **Set variable**:
  - Priorizar `options.variableId`, `options.expressionToEvaluate`, `options.type`, `options.isCode`
  - Fallback para `content.*`
  - Exibir expressão com chips de variável quando houver `{{...}}`
- **Text/Bubble text**:
  - Continuar renderizando richText
  - Suportar variável inline nos dois formatos
  - Se vier `{{...}}` em texto comum, renderizar chip de variável no meio do texto
- **OpenAI**:
  - Em `messages[].content`, destacar variáveis `{{...}}` como chips
  - Em `responseMapping`, quando não houver `valueToExtract`, exibir fallback claro (ex: `response`) para não parecer “vazio”

3) Melhoria de legibilidade para debug de variável
- Quando referência não bater com nenhuma variável do flow, mostrar badge com estilo de alerta (`variável não encontrada`) em vez de sumir.
- Manter layout atual, mas com consistência visual em todos os badges de variável.

### Arquivo a alterar
- `src/components/admin/FunnelInspector.tsx`

### Critérios de validação
- No Group #5, o bloco Set variable deve mostrar corretamente algo como:
  - `RespostaDesabafoGPT = {{RespostaDesabafoGPT}}`
- Blocos OpenAI devem exibir variáveis do prompt em chips (ex: `{{DesabafoGPT}}`).
- Nenhum bloco com variável deve aparecer “vazio” quando há referência válida no JSON.
- Wait/inputs continuam renderizando como já corrigido.
