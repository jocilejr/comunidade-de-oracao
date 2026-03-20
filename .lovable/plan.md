

## Corrigir imagem de preview — OG tags duplicadas

### Problema

O `index.html` tem OG tags **hardcoded** (linhas 17-26), incluindo `og:image` apontando para a imagem padrão do R2. O `handleShareRobust` no `api-server.js` apenas **acrescenta** novas OG tags antes do `</head>`, mas **não remove** as existentes. Crawlers (WhatsApp, Facebook) leem a **primeira** `og:image` que encontram — que é a hardcoded.

### Correção

**1. `self-host/api-server.js`** — No `handleShareRobust`, antes de injetar as OG tags dinâmicas, **remover** todas as meta tags existentes de OG e Twitter do HTML original usando regex:
```javascript
// Remover og: e twitter: meta tags existentes
html = html.replace(/<meta\s+(property="og:|name="twitter:)[^>]*>/gi, '');
```

**2. `index.html`** — Remover as meta tags hardcoded de OG e Twitter (linhas 17-26). Manter apenas `<title>`, `<meta name="description">` e as tags estruturais. Isso garante que mesmo sem o api-server (no Lovable Cloud), não haja tags conflitantes.

### Resultado

O `handleShareRobust` vai:
1. Ler o `index.html` (agora limpo)
2. Substituir `<title>` e `<meta description>`
3. Injetar as OG tags dinâmicas com a imagem correta do funil
4. Servir HTML com apenas **uma** `og:image` — a do funil

