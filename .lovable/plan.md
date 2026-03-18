
Diagnóstico confirmado (com base no seu retorno “falha até com pix/boleto/cartão exatos” e no JSON do fluxo):
1) O bloco OpenAI depende de `responseMapping[1] -> forma_pagamento`, mas essa variável não está sendo preenchida de forma confiável.
2) O engine está separando `code tools` e não envia essas tools para o modelo (`apiTools` apenas). Sem tool call útil, a variável de condição fica vazia e o fluxo cai em finalização.
3) Mesmo quando vier `cartao`, a condição compara com `cartão` e hoje o `Equal to` não normaliza acentos.

Plano de correção (implementação):
1) `src/lib/typebot-engine.ts` — corrigir envio de tools ao modelo
- Montar `tools` para API a partir de **todas** as tools (inclusive as que têm `code`), removendo apenas campos não suportados e normalizando `parameters`.
- Manter em paralelo o mapa de `code tools` para execução local após `tool_calls`.
- Resultado: o modelo passa a poder chamar `interpretarFormaPagamento` e o engine continua executando o JS local.

2) `src/lib/typebot-engine.ts` — robustecer `responseMapping`
- Para mappings sem `valueToExtract`:
  - 1º mapping: manter `assistantContent`.
  - Próximos: priorizar resultado de tool call/code tool; se não houver, fallback para `assistantContent`.
- Garantir que a variável de decisão (`forma_pagamento`) nunca fique vazia quando houver saída válida da IA.

3) `src/lib/typebot-engine.ts` — normalização de comparação
- Criar normalizador para comparação textual (`trim + lowercase + remoção de acentos`).
- Aplicar em `Equal to`, `Contains`, `Starts with`, `Ends with`.
- Isso resolve `cartao` vs `cartão` sem exigir ajuste manual no funil.

4) `supabase/functions/openai-proxy/index.ts` — normalização defensiva de tools
- Não descartar tools só por terem `code`.
- Sempre transformar para schema OpenAI válido (`type:function`, `function.name`, `function.parameters` objeto).
- Corrigir `parameters: []` para `{ type: "object", properties: {} }` em qualquer formato de entrada.

Arquivos que serão alterados:
- `src/lib/typebot-engine.ts`
- `supabase/functions/openai-proxy/index.ts`

Validação pós-implementação:
1) Testar no `/admin` e no `/f/:slug` com entradas exatas: `pix`, `boleto`, `cartão`.
2) Confirmar que cada uma segue para a conexão correta (sem “Conversa finalizada” prematura).
3) Validar caso sem match (ex.: texto fora do contexto) para garantir que o fluxo retorna ao próximo passo configurado, sem quebrar a conversa.
