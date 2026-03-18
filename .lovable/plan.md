

## Diagnóstico

O problema está claro agora. O fluxo funciona assim:

```text
text input → OpenAI (GPT + code tool) → Condition (forma_pagamento) → ramos
```

O prompt do GPT diz: *"retorne em uma única palavra: pix, boleto ou cartão"*. Ou seja, o **GPT deve interpretar** a intenção do usuário e devolver a forma de pagamento.

**Porém**, o engine está enviando o code tool `interpretarFormaPagamento` para o GPT como uma tool da API. O GPT, ao ver a tool disponível, **chama a tool em vez de responder com texto**. O engine então executa o JS localmente, que faz matching de strings (`texto.includes("pix")`) — e falha em variações como "quero no piques", "no pix por favor", etc.

O resultado: a variável `forma_pagamento` fica vazia ou "nenhum", a condição não faz match, e o fluxo morre.

## Correção

**Não enviar code tools para o GPT.** Code tools devem ser executadas **apenas localmente como pós-processamento** da resposta do GPT — não como tools da API OpenAI.

### Mudanças em `src/lib/typebot-engine.ts`

1. **Separar code tools dos apiTools**: Tools que possuem campo `code` NÃO são enviadas à OpenAI. Apenas tools sem `code` vão para a API.

2. **Executar code tools localmente sobre a resposta do GPT**: Após receber a resposta do GPT, o engine executa cada code tool passando `assistantContent` como `input`. O resultado é salvo para uso no responseMapping.

3. **Ajustar responseMapping**: 
   - mapping[0]: conteúdo do assistente (resposta textual do GPT)
   - mapping[1+]: resultado do code tool (se houver), senão fallback para assistantContent

### Resultado esperado

- Usuário digita "quero no piques" → GPT interpreta e responde "pix"
- Code tool recebe "pix" como input → retorna `{ forma_pagamento: "pix" }`
- Variável `forma_pagamento` = "pix"
- Condição `Equal to "pix"` → match → segue para ramo PIX

Se GPT responder com texto mais longo (ex: "A forma escolhida é pix"), o code tool ainda faz o matching local e extrai "pix" corretamente.

### Arquivo afetado
- `src/lib/typebot-engine.ts`

