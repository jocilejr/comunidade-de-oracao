

## Plano: Respeitar Wait entre grupos no preview

### Diagnóstico

O problema tem duas causas:

1. **O `collectEvents` coleta todos os eventos do generator antes de chamar `processEvents`** — isso significa que o generator roda sem pausa real. Embora o `processEvents` faça `await delay()` corretamente, o generator já terminou de produzir tudo instantaneamente. Isso é correto para wait events (que são só marcadores), mas pode causar timing issues.

2. **O verdadeiro problema: entre grupos (caixas) não há pausa automática.** O motor segue edges de um grupo para outro sem nenhum delay. A pausa só existe dentro do `ChatRenderer` no typing indicator por mensagem. Se não houver um bloco `Wait` explícito no fluxo, não há nenhuma espera entre caixas.

### Solução

#### 1. `src/lib/typebot-engine.ts` — Emitir wait automático entre grupos

Na função `processFromEdge` (ou ao final de `processGroup` antes de seguir para o próximo grupo), emitir automaticamente um evento `wait` com um delay curto (ex: 0.5s) entre grupos. Isso simula a pausa natural de digitação entre blocos de conversa.

- Ao final de `processGroup`, antes de chamar `processFromEdge` para o próximo grupo, fazer `yield { type: 'wait', seconds: 0.5 }` como pausa padrão entre caixas.
- Se já existir um Wait block explícito, não adicionar pausa extra.

#### 2. `src/components/chat/ChatRenderer.tsx` — Garantir que o wait funciona corretamente

O handling atual do `case 'wait'` já está correto (mostra typing, aguarda delay, remove typing). Nenhuma mudança necessária aqui.

### Resumo de arquivos

| Arquivo | Ação |
|---|---|
| `src/lib/typebot-engine.ts` | Editar — emitir wait automático entre grupos ao seguir edges |

