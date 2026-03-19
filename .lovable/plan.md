

## Plano: Corrigir importação do Typebot no self-host

### Problema
No self-host, `supabase.functions.invoke('typebot-proxy')` chama `https://dash.origemdavida.online/functions/v1/typebot-proxy`, mas o Nginx **não tem rota para `/functions/v1/`** -- só tem `/api/`, `/auth/v1/` e `/rest/v1/`. O mesmo problema afeta `openai-proxy` e `share`.

### Solução
Adicionar no Nginx um bloco `location /functions/v1/` que redireciona para o api-server, e garantir que o api-server aceite os paths com prefixo `/functions/v1/`.

### Alterações

**1. `self-host/nginx.conf.template`** -- Adicionar location no bloco do dashboard (entre `/api/` e `/rest/v1/`):
```nginx
# Edge Functions compatibility (Supabase SDK calls)
location /functions/v1/ {
    proxy_pass http://127.0.0.1:4000/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

**2. `self-host/api-server.js`** -- No router, normalizar paths removendo o prefixo `/functions/v1` antes do matching:
```javascript
let path = url.pathname;
// Compatibilidade com supabase.functions.invoke()
if (path.startsWith('/functions/v1/')) {
  path = '/' + path.slice('/functions/v1/'.length);
}
```

### Resultado
- `supabase.functions.invoke('typebot-proxy')` vai funcionar no self-host sem alterar nenhum código do frontend
- `openai-proxy`, `share`, `rotate-preview-images` e `preview-image` também ficam compatíveis automaticamente

### Detalhes técnicos
- Nenhuma alteração no frontend (`Admin.tsx`, `typebot-engine.ts`)
- Após aplicar, executar `sudo bash self-host/update.sh` para atualizar Nginx e api-server

