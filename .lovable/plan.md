

## Duas correções

### 1. Por que o `/f/` existe — e o bug de loop infinito

O prefixo `/f/` serve para separar a **URL de compartilhamento** (`/:slug`) da **URL do SPA** (`/f/:slug`). No modo robusto, quando alguém acessa `/:slug`, o servidor retorna HTML com OG tags e um meta-refresh que redireciona o navegador para `/f/:slug` (onde o SPA carrega o funil).

**Problema atual**: a regex `^\/(?:f\/)?([a-zA-Z0-9_-]+)\/?$` intercepta TAMBÉM `/f/:slug`, criando um loop infinito (OG HTML → redirect para `/f/slug` → OG HTML → redirect...). O navegador fica preso.

**Correção**: Alterar a regex para interceptar APENAS `/:slug` (sem `/f/`):

```javascript
// Só intercepta /:slug, NÃO /f/:slug
const slugMatch = path.match(/^\/([a-zA-Z0-9_-]+)\/?$/);
```

Assim `/f/:slug` cai direto no SPA fallback (index.html) como esperado.

### 2. Logs não aparecem no dashboard

A causa mais provável é que no domínio público (VPS), os visitantes abrem o funil e o `typebot-engine` tenta criar sessões via `supabase.from('funnel_sessions').insert(...)`. Porém, no domínio público, o `VITE_PUBLIC_DOMAIN` está setado, e o `getFunnelBySlug` usa o endpoint `/functions/v1/share?format=json` em vez do Supabase client. **Mas o engine ainda usa o Supabase client diretamente** para criar sessões — e no VPS, esse client aponta para o PostgREST local que pode não estar configurado corretamente para aceitar inserções anônimas.

**Correção**: No `typebot-engine.ts`, quando `VITE_PUBLIC_DOMAIN` está ativo, usar o endpoint do api-server (via fetch) para criar sessões e logar eventos, em vez do Supabase client direto. Alternativamente, garantir que o PostgREST local aceita as inserções.

**Abordagem mais simples**: Criar um endpoint no `api-server.js` para receber sessões e eventos (`POST /functions/v1/session-log`), e adaptar o engine para usá-lo no domínio público.

### Arquivos modificados

1. **`self-host/api-server.js`**:
   - Corrigir regex de `^\/(?:f\/)?` para `^\/` (sem capturar `/f/`)
   - Adicionar endpoint `POST /functions/v1/session-log` para receber dados de sessão

2. **`src/lib/typebot-engine.ts`**:
   - No domínio público, enviar logs de sessão via fetch ao api-server em vez do Supabase client

### Validação

Após deploy na VPS:
```bash
# Deve retornar OG HTML com meta-refresh
curl -s http://127.0.0.1:4000/meu-slug | head -15

# Deve retornar o SPA (index.html normal)
curl -s http://127.0.0.1:4000/f/meu-slug | head -5
```

