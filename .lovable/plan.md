

## Problema

Atualmente, as mensagens estão **sempre** ancoradas na parte inferior do chat (via `mt-auto`), o que cria um espaço vazio no topo quando há poucas mensagens. O comportamento correto do WhatsApp é: mensagens fluem do topo para baixo naturalmente, e só ficam "coladas ao rodapé" quando o conteúdo já preenche a tela.

## Solução

Trocar a ancoragem condicional: remover o `mt-auto` fixo e aplicá-lo **apenas quando há um input de texto ativo** (`inputBlock` presente). Quando só há mensagens do bot ou botões de escolha, as mensagens fluem do topo normalmente.

### Mudança em `src/components/chat/ChatRenderer.tsx`

**Linha 242-243** — tornar `mt-auto` condicional:

```tsx
// De:
<div className="min-h-full px-3 py-3 flex">
  <div className="max-w-[600px] w-full mx-auto space-y-[3px] mt-auto">

// Para:
<div className={`min-h-full px-3 py-3 flex${inputBlock ? '' : ' flex-col'}`}>
  <div className={`max-w-[600px] w-full mx-auto space-y-[3px]${inputBlock ? ' mt-auto' : ''}`}>
```

Quando `inputBlock` está ativo → `mt-auto` empurra mensagens para baixo (coladas ao input).  
Quando não há input → mensagens começam do topo, sem espaço artificial.

