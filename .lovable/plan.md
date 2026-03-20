

## Diagnóstico do link preview

O problema tem **duas camadas** que precisam ser resolvidas:

### Problema 1: Bot detection não cobre `/f/:slug`
Linha 728 do `api-server.js`:
```javascript
const slugMatch = path.match(/^\/([a-zA-Z0-9_-]+)\/?$/);
```
Essa regex só captura `/:slug`. URLs `/f/:slug` caem direto no SPA fallback (linha 740), que serve o `index.html` estático com metadados genéricos ("Comunidade", "Aperte aqui e Receba", imagem do Lovable R2).

### Problema 2: `index.html` tem OG tags estáticas genéricas
O `index.html` (buildado pelo Vite) contém:
```html
<meta property="og:title" content="Comunidade">
<meta property="og:description" content="Aperte aqui e Receba">
<meta property="og:image" content="https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/...">
```
Quando o crawler **não é interceptado** pelo bot detection, ele recebe esse HTML — que tem título/descrição genéricos e uma imagem do R2 (o screenshot "Typebot Runtime").

### Problema 3: Mesmo para `/:slug`, o `PUBLIC_DOMAIN` pode estar `localhost`
Se o PM2 não herdou as env vars, as OG tags dinâmicas apontam para `https://localhost/preview-image?slug=...` — inacessível.

---

## Plano de correção

### 1. Expandir bot detection para cobrir `/f/:slug` (`api-server.js`, linha 728)

**Antes:**
```javascript
const slugMatch = path.match(/^\/([a-zA-Z0-9_-]+)\/?$/);
```

**Depois:**
```javascript
const slugMatch = path.match(/^\/(?:f\/)?([a-zA-Z0-9_-]+)\/?$/);
```

Isso intercepta crawlers em ambos `/:slug` e `/f/:slug`.

### 2. Adicionar exclusão de rotas reservadas

Para evitar que `/login`, `/admin`, `/assets` etc. sejam tratados como slugs:

```javascript
const RESERVED = /^(login|admin|assets|api|rest|auth|functions|health|__funnel_diag|share|preview-image|rotate-preview-images|openai-proxy|typebot-proxy|user-settings)$/i;
const slugMatch = path.match(/^\/(?:f\/)?([a-zA-Z0-9_-]+)\/?$/);
if (slugMatch && !RESERVED.test(slugMatch[1]) && req.method === "GET") {
```

### 3. Adicionar log de diagnóstico para debug

Adicionar um `console.log` temporário quando um bot é detectado, para que possamos verificar nos logs do PM2 se a interceptação está funcionando.

### Arquivo modificado
- `self-host/api-server.js` (linhas 726-736)

### Validação pós-deploy

Após `git pull && sudo bash self-host/update.sh`, execute estes 3 comandos e me envie a saída:

```bash
# 1. Verificar que env vars estão corretas
curl -sf http://127.0.0.1:4000/__funnel_diag | python3 -m json.tool

# 2. Simular crawler no formato /:slug
curl -sA "WhatsApp/2.24" http://127.0.0.1:4000/a-verdadeira-oracao-de-1-minuto | head -30

# 3. Simular crawler no formato /f/:slug  
curl -sA "WhatsApp/2.24" http://127.0.0.1:4000/f/a-verdadeira-oracao-de-1-minuto | head -30
```

Os comandos 2 e 3 devem retornar HTML com `og:title` contendo o título do funil (não "Comunidade") e `og:image` apontando para o domínio público real (não `localhost` nem R2).

