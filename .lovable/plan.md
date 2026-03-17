

## Plano: Corrigir e redesenhar o Inspetor de Funil

### Bugs encontrados

1. **Wait** — O inspector busca `block.content.secondsToWaitFor` mas os dados reais estão em `block.options.secondsToWaitFor`
2. **OpenAI** — O bloco está sendo detectado mas os `tools` do Typebot têm uma estrutura diferente (campo `code` + `name` + `parameters` como array), não está renderizando corretamente
3. **Text Input** — O placeholder e variableId estão em `block.options.labels.placeholder` e `block.options.variableId`, o inspector já cobre parcialmente mas precisa priorizar `options` sobre `content`
4. **Design confuso** — Muita informação visual competindo, ícones pequenos, pouco contraste entre categorias

### Correções no `FunnelInspector.tsx`

**Wait block**: Buscar de `b.options?.secondsToWaitFor || b.content?.secondsToWaitFor`

**OpenAI block**: 
- Renderizar `tools` com nome, descrição e código (campo `code`)
- Mostrar `credentialsId` se existir
- Melhorar a exibição dos prompts system/user em cards separados

**Text Input block**: 
- Priorizar `b.options?.labels?.placeholder` e `b.options?.variableId`
- Mostrar caixa visual representando o input com placeholder e nome da variável em destaque

### Redesign visual

Inspirado na screenshot de referência (dark, clean, espaçado):

- **Grupos**: Header mais robusto com fundo escuro, ícone colorido, contagem de blocos
- **Blocos**: Cards individuais com borda lateral colorida por categoria (verde=bubble, azul=input, laranja=lógica, roxo=IA)
- **Wait**: Badge compacto com ícone de relógio e tempo em destaque (ex: `⏱ 7s`)
- **Audio**: Player com URL abaixo, similar à referência
- **OpenAI**: Card com fundo roxo escuro, prompts em `<pre>` scrolláveis, tools listadas
- **Text Input**: Caixa simulando um input com placeholder + badge da variável
- **Variáveis**: Badges com nome da variável em destaque (cor cyan/sky)
- Remover o grid de resumo (Grupos/Blocos/Variáveis/Edges) que polui o topo — mover para um header compacto inline
- Tipografia mais limpa, menos `uppercase tracking-wider`, mais legibilidade

### Arquivos alterados

1. **`src/components/admin/FunnelInspector.tsx`** — Reescrever com as correções de dados e novo design

