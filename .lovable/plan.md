
Objetivo: impedir o encerramento imediato da conversa após envio de texto no bloco de input.

Diagnóstico confirmado (runtime + dados do funil):
- O input onde você digita “Quero no piques” está no início do grupo (`text input`), sem `outgoingEdgeId` e sem edge saindo do bloco.
- No engine atual, `continueAfterInput` faz:
  1) tenta edge explícita do bloco  
  2) se não houver, encerra (`end`)
- Resultado: o fluxo nunca chega ao bloco OpenAI/Condition seguinte no mesmo grupo, então a conversa finaliza instantaneamente.

Plano de implementação

1) Corrigir retomada de fluxo após input/choice no mesmo grupo
- Arquivo: `src/lib/typebot-engine.ts`
- Criar estado interno de “pausa” (ex.: bloco atual, grupo atual e próximo índice).
- Quando `processGroup` encontrar um bloco de input/choice e pausar, salvar esse contexto.
- Em `continueAfterInput` e `continueAfterChoice`, usar esta ordem:
  - edge do item escolhido (choice)
  - `outgoingEdgeId` do bloco
  - edge saindo do bloco no grafo
  - se não houver nada acima: continuar no próximo bloco do mesmo grupo (com contexto salvo)
  - só encerrar se realmente não existir próximo passo possível

2) Manter compatibilidade com fluxos que já usam edges explícitas
- Não quebrar comportamento atual de funis que dependem de `item.outgoingEdgeId` / `block.outgoingEdgeId`.
- A retomada “linear” só entra como fallback quando não há conexão explícita.

3) Hardening adicional no OpenAI mapping (prevenção de novo falso-negative)
- Ainda em `typebot-engine.ts`, para `responseMapping` sem `valueToExtract` em mappings subsequentes:
  - priorizar resultado de tool call
  - se não houver tool call, usar fallback com conteúdo do assistente
- Isso evita variável de condição vazia em fluxos com tool call opcional.

Validação (obrigatória)
- Testar no `/admin` e no `/f/:slug`:
  - `pix`
  - `boleto`
  - `cartão`
  - `quero no piques`
- Critérios de sucesso:
  - não aparecer “Conversa finalizada ✓” imediatamente após enviar input
  - fluxo segue para os ramos corretos nos casos exatos
  - em variações/typos, o fluxo continua (repergunta/orienta), sem encerrar abruptamente

Arquivos que serão alterados
- `src/lib/typebot-engine.ts`

Detalhes técnicos (resumo)
- Problema principal não é comparação de condição: é controle de fluxo pós-input.
- O engine pausava corretamente no input, mas não sabia “retomar no próximo bloco” quando não havia edge explícita.
- A correção reintroduz comportamento linear esperado em fluxos Typebot com blocos sequenciais no mesmo grupo.

<lov-actions>
<lov-suggestion message="Teste o funil de ponta a ponta no /admin e no /f/:slug com pix, boleto, cartão e 'quero no piques' para validar que não finaliza mais">Verificar end-to-end</lov-suggestion>
<lov-suggestion message="Adicionar logs de debug temporários no engine para registrar o bloco atual, próximo bloco e motivo da transição após cada input">Adicionar logs de transição</lov-suggestion>
</lov-actions>
