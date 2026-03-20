

## Correções: OpenAI nos funis + Preview image largura máxima

### Problema 1: OpenAI não funciona nos funis (VPS)

**Causa raiz:** `typebot-engine.ts` (linha 799) chama `${VITE_SUPABASE_URL}/functions/v1/openai-proxy`. Na VPS, esse URL aponta para o Supabase Cloud (ou para o dash), não para o api-server local. Além disso, o `handleOpenaiProxy` no api-server exige JWT válido (`jwt.verify`), mas o frontend envia o anon key, cujo `sub` não é um userId real.

**Correção em `src/lib/typebot-engine.ts` (linha ~799):**
- Detectar se está no domínio público VPS (`VITE_PUBLIC_DOMAIN`) ou no dash VPS (`VITE_DASHBOARD_ORIGIN`)
- Se `window.location.origin` bater com algum deles, usar `${window.location.origin}/openai-proxy` (api-server local)
- Senão, manter o URL atual do Supabase (para preview no Lovable)

**Correção em `self-host/api-server.js` — `handleOpenaiProxy` (linhas 168-228):**
- Tornar JWT opcional: tentar `jwt.verify` primeiro; se falhar, aceitar `body.userId` como fallback
- Isso permite funis públicos (sem JWT de usuário) funcionarem usando o `ownerUserId` passado no body — exatamente como a edge function faz

```text
Fluxo corrigido (VPS - domínio público):
  Browser → comunidade.dominio.com/openai-proxy → api-server:4000 → busca key com body.userId → OpenAI

Fluxo corrigido (VPS - dashboard):
  Browser → dash.dominio.com/openai-proxy → api-server:4000 → mesma lógica

Fluxo Lovable preview (inalterado):
  Browser → supabase.co/functions/v1/openai-proxy → edge function → OpenAI
```

---

### Problema 2: Preview image sem largura máxima (VPS)

**Causa raiz:** No `api-server.js`, o `handlePreviewImage` (linha 162) ainda tem `Cache-Control: public, max-age=300` — diferente da edge function que já foi corrigida. Além disso, faltam os headers `og:image:secure_url` e `og:image:type` no HTML do `handleShare`.

**Correção em `self-host/api-server.js`:**

1. **`handlePreviewImage` (linha 162):** Mudar para `Cache-Control: no-cache, no-store, must-revalidate` e adicionar `Content-Length`

2. **`handleShare` (linhas 112-119):** Adicionar as meta tags que faltam:
   - `og:image:secure_url`
   - `og:image:type` = `image/png`
   
   (As tags `og:image:width=1200`, `og:image:height=630` e `twitter:card=summary_large_image` já estão presentes)

---

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/lib/typebot-engine.ts` | URL dinâmico do proxy OpenAI (VPS vs Cloud) |
| `self-host/api-server.js` | JWT opcional no openai-proxy + cache headers da preview-image + OG tags completas no share |

