

## Plano: Corrigir renderização de variáveis inline nos blocos de texto

### Problema

No `FunnelInspector`, blocos de texto (`Bubble text`) que contêm **variáveis inline** do Typebot (como `{{DesabafoGPT}}`) não são renderizados. Isso acontece porque o código atual (linha 89) só lê `c.text` dos filhos do richText, ignorando completamente filhos do tipo `inline-variable` que possuem `variableId` em vez de `text`.

### Correção em `src/components/admin/FunnelInspector.tsx`

**Bloco de texto (linhas 82-94)**: Ao iterar os `children` do richText, detectar filhos com `type === 'inline-variable'` e renderizar o nome da variável como badge destacado (ex: `{{DesabafoGPT}}`). Para isso:

1. Mudar de `dangerouslySetInnerHTML` para renderização React que percorre o richText recursivamente
2. Para cada child:
   - Se tem `text` → renderizar o texto normal
   - Se tem `type === 'inline-variable'` e `children[0].variableId` → renderizar como badge/span destacado com o nome da variável (resolvido via `getVarName`)
3. Manter formatação (bold, italic, underline) quando presente nos children

Resultado: blocos de texto que contêm variáveis inline mostrarão algo como:
> "Se desejar, você pode se desabafar um pouco meu bem... `{{DesabafoGPT}}`"

### Arquivo alterado
- `src/components/admin/FunnelInspector.tsx` — reescrever o renderer de text bubbles para suportar inline variables

