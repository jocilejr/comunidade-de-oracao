

## Plano: Corrigir integração GPT no motor de funis

### Problemas encontrados

Analisei os dados reais do banco e os logs da edge function. Há 3 problemas:

**1. Tools com `parameters: []` (array vazio) — OpenAI rejeita**
O JSON do Typebot envia tools com `parameters: []`. No proxy, a linha `tool.parameters || { type: "object", properties: {} }` pega o array (truthy) em vez do fallback. O log confirma: `"Invalid type for 'tools[0].function.parameters': expected an object, but got an array instead."`

**2. Tools do Typebot são "code tools", não funções OpenAI**
O tool no JSON tem uma propriedade `code` com JavaScript inline — é uma ferramenta de execução local do Typebot, não uma function call da OpenAI. O proxy tenta enviar isso como OpenAI function tool, o que não faz sentido. Essas tools com `code` devem ser executadas localmente no engine ou ignoradas no envio à OpenAI.

**3. responseMapping sem `valueToExtract`**
Os itens de mapeamento no JSON têm apenas `variableId`, sem `valueToExtract`. O engine assume "Message content" como default (que funciona para o primeiro), mas o segundo mapeamento deveria capturar o resultado do tool call.

### Solução

#### `supabase/functions/openai-proxy/index.ts`
- Corrigir normalização de `parameters`: se for array ou falsy, usar `{ type: "object", properties: {} }`
- Filtrar tools que têm propriedade `code` (são tools locais do Typebot, não OpenAI functions)

#### `src/lib/typebot-engine.ts`  
- No `executeOpenAI`, separar tools com `code` (executar localmente após a resposta da IA) das tools reais (enviar à OpenAI)
- Tratar Typebot code tools: após receber a resposta da IA, se houver tool calls que correspondam a code tools, executar o código JavaScript inline e mapear o resultado para as variáveis
- Melhorar responseMapping: quando `valueToExtract` está ausente, o primeiro mapping recebe o conteúdo da mensagem, os demais recebem valores dos tool call arguments

### Resumo de arquivos

| Arquivo | Ação |
|---|---|
| `supabase/functions/openai-proxy/index.ts` | Fix parameters array→object, filtrar code tools |
| `src/lib/typebot-engine.ts` | Executar code tools localmente, melhorar responseMapping |

