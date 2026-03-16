

## Diagnóstico

A proteção contra bolhas vazias (linhas 596-597 do `typebot-engine.ts`) está filtrando mensagens que contêm variáveis `inline-variable` ainda sem valor definido. Se vários blocos de texto do funil usam variáveis, todas essas mensagens são descartadas — fazendo o funil parecer "vazio" ou "sumido".

```ts
// Linha 596-597 — filtro atual (muito agressivo)
const stripped = text.replace(/<[^>]*>/g, '').trim();
if (!stripped) return null;  // ← descarta a mensagem inteira
```

## Plano

### 1. Remover o filtro agressivo de mensagens vazias em `blockToMessage`

Em `src/lib/typebot-engine.ts` (linha 596-597), remover a verificação `stripped`. Mensagens com variáveis ainda não definidas devem ser exibidas (com o valor vazio inline), não descartadas. A única exceção será blocos onde `text` é literalmente uma string vazia (sem nenhum HTML).

```ts
// De:
const stripped = text.replace(/<[^>]*>/g, '').trim();
if (!stripped) return null;

// Para:
if (!text) return null;  // só descarta se não gerou HTML nenhum
```

### 2. Proteger apenas no BotBubble (cosmético)

Em `src/components/chat/BotBubble.tsx`, no início do componente de texto, não renderizar se `content` é completamente vazio E não há `mediaType`. Isso evita bolhas visuais vazias sem quebrar o fluxo do engine.

```ts
if (!message.mediaType && !message.content) return null;
```

Isso mantém o fluxo do funil intacto enquanto esconde bolhas puramente cosméticas sem conteúdo algum.

