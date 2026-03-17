

## Plano: Corrigir Wait e evitar reset da pagina no preview

### Diagnóstico

Encontrei **duas causas reais** analisando o banco de dados e os logs:

**1. Wait blocks: dados estão em `options`, mas o engine lê de `content`**

O JSON do Typebot armazena `secondsToWaitFor` em `options`, não em `content`:
```text
DB:  options: { secondsToWaitFor: 3 }   ← onde o dado realmente está
Log: content: undefined                  ← o que o engine tenta ler
```
Resultado: todos os waits caem no fallback de 1 segundo, ignorando os valores reais (3s, 4s, 6s, 55s, etc.).

**2. Redirect blocks: mesmo problema + causa do reset**

Os blocos Redirect também têm a URL em `options.url`, não em `content.url`. Além disso, no preview do admin, o ChatRenderer roda diretamente na página (sem iframe). Quando um redirect com `isNewTab: false` dispara, ele faz `window.location.href = url`, o que navega a página inteira para fora do /admin.

### Solução

#### `src/lib/typebot-engine.ts`

1. **Fix Wait**: ler `secondsToWaitFor` de `options` como fallback:
```typescript
case 'wait': {
  const waitBlock = block as WaitBlock;
  const opts = (waitBlock as any).options || {};
  const raw = waitBlock.content?.secondsToWaitFor 
    ?? opts.secondsToWaitFor 
    ?? opts.seconds 
    ?? opts.delay;
  // ...processar normalmente
}
```

2. **Fix Redirect**: ler `url` e `isNewTab` de `options` como fallback:
```typescript
case 'redirect': {
  const rdBlock = block as RedirectBlock;
  const opts = (rdBlock as any).options || {};
  const url = rdBlock.content?.url || opts.url;
  const isNewTab = rdBlock.content?.isNewTab ?? opts.isNewTab ?? false;
  // ...
}
```

3. **Remover os console.log de debug** adicionados anteriormente.

#### `src/components/chat/ChatRenderer.tsx`

4. **Forçar redirect em nova aba no preview do admin**: adicionar prop `forceNewTab` ao ChatRenderer. Quando ativada (no preview do admin), todos os redirects abrem em nova aba em vez de navegar a página.

#### `src/pages/Admin.tsx`

5. Passar `forceNewTab` ao ChatRenderer no preview.

### Resumo

| Arquivo | Acao |
|---|---|
| `src/lib/typebot-engine.ts` | Fix Wait (ler `options`), Fix Redirect (ler `options`), remover logs |
| `src/components/chat/ChatRenderer.tsx` | Adicionar prop `forceNewTab`, usar no redirect |
| `src/pages/Admin.tsx` | Passar `forceNewTab` ao ChatRenderer |

