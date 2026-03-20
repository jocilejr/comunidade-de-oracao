

## Otimizar desempenho da página de funil

### Diagnóstico (baseado no PageSpeed Insights)

- **FCP 5.7s / LCP 16.5s**: Causados por CSS render-blocking (75.8KB) e Google Fonts bloqueando renderização
- **LCP element**: O container `.wa-wallpaper` com o chat — demora 3.36s no "atraso na renderização do elemento"
- **Google Fonts render-blocking**: `@import url(...)` no CSS bloqueia toda a renderização até carregar
- **Sem code-splitting**: Todo o app (Admin, Login, Index, Funnel) é carregado num único bundle, mesmo quando o visitante só precisa do funil
- **Notification sound**: Clona Audio DOM nodes repetidamente a cada mensagem

### Plano de otimização

**1. Google Fonts — de render-blocking para assíncrono**
- Remover o `@import url(...)` do `index.css`
- Adicionar `<link rel="preconnect">` e `<link rel="stylesheet" media="print" onload="this.media='all'">` no `index.html` para carregar as fontes sem bloquear

**2. Code-splitting com React.lazy**
- No `App.tsx`, usar `React.lazy()` para importar `Admin`, `Login`, `Index` e `Funnel` dinamicamente
- Envolver as rotas com `<Suspense>` com fallback mínimo
- Isso reduz drasticamente o JS inicial — visitantes do funil não carregam o código do Admin/Login

**3. Otimizar notification sound**
- Parar de clonar o Audio DOM node a cada mensagem
- Reutilizar o mesmo elemento, fazendo `audio.currentTime = 0` antes de `play()`

**4. Preload do CSS crítico**
- Adicionar `<link rel="preload" as="style">` para o CSS principal no `index.html`

### Arquivos modificados

1. **`index.html`** — preconnect Google Fonts + carregamento assíncrono
2. **`src/index.css`** — remover `@import url(...)` da linha 1
3. **`src/App.tsx`** — lazy imports + Suspense
4. **`src/lib/notification-sound.ts`** — reutilizar Audio element

### Impacto esperado

- FCP: ~5.7s → ~2-3s (sem font blocking)
- LCP: ~16.5s → ~5-8s (bundle menor + fonts async)
- Bundle do funil: ~50-60% menor (sem código Admin/Login)

