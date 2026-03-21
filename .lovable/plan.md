

## Corrigir logs de sessão no domínio público

### Problema raiz

Na otimização de performance anterior, o `createSessionAsync()` foi tornado "fire-and-forget" (linha 193 do `typebot-engine.ts`). O problema é que `logEvent()` verifica `if (!this.sessionId) return;` na linha 234. Como a criação da sessão é assíncrona e não aguardada, o `sessionId` ainda é `null` quando os primeiros eventos (mensagens do bot, inputs do usuário) tentam ser registrados — todos os logs são silenciosamente descartados.

### Solução

Manter a renderização instantânea da primeira mensagem, mas garantir que os logs aguardem a sessão estar pronta.

**1. `src/lib/typebot-engine.ts`** — Adicionar uma Promise de "session ready" que os métodos de log aguardam:

- Criar uma propriedade `sessionReady: Promise<void>` + seu `resolve`
- No `start()`, continuar o fire-and-forget mas resolver a promise quando o `sessionId` for obtido
- No `logEvent()` e `updateSession()`, fazer `await this.sessionReady` antes de verificar `sessionId`

Isso garante que:
- A primeira mensagem continua aparecendo instantaneamente (nenhum `await` no fluxo de renderização)
- Os logs enfileiram e aguardam o `sessionId` ficar disponível antes de serem enviados
- Nenhum evento é perdido

### Arquivos modificados

1. **`src/lib/typebot-engine.ts`** — Adicionar mecanismo de Promise para sincronizar session creation com logging

### Impacto

- Zero impacto na velocidade de renderização
- Todos os eventos voltam a ser registrados corretamente no domínio público
- Dashboard volta a exibir sessões e timeline de conversas

