

## Problema: Nginx proxy roteia `/auth/v1/` para porta 9999 (GoTrue inexistente)

O frontend (Supabase JS client) faz autenticação via `/auth/v1/` (login, token refresh, get user). No template Nginx (`nginx-proxy.conf.template`), essa rota é enviada para `host.docker.internal:9999` — mas GoTrue **não existe** neste setup. A autenticação é feita pelo `api-server.js` na porta 4000 (linhas 383-386).

**Consequência**: o Supabase client não consegue autenticar → requisições ao PostgREST (`/rest/v1/`) vão como `anon` → RLS policy `auth.uid() = user_id` retorna vazio → configurações "somem".

## Correção

**1 arquivo:**

### `self-host/nginx-proxy.conf.template`
Alterar o bloco `/auth/v1/` para apontar para porta 4000 (API server) em vez de 9999:

```text
# ANTES:
location /auth/v1/ {
    proxy_pass http://host.docker.internal:9999/;
    ...
}

# DEPOIS:
location /auth/v1/ {
    proxy_pass http://host.docker.internal:4000/auth/v1/;
    ...
}
```

Note que o `proxy_pass` agora inclui `/auth/v1/` no path, porque o API server espera receber o path completo (ele roteia `path === "/auth/v1/signup"`, etc.).

## Após deploy

```bash
cd ~/comunidade-de-oracao && git pull
sudo bash self-host/setup-traefik.sh
# O script vai recriar o container com a config corrigida

# Validar auth funciona:
curl -s -X POST "https://dash.origemdavida.online/auth/v1/token?grant_type=password" \
  -H 'Content-Type: application/json' \
  -d '{"email":"SEU_EMAIL","password":"SUA_SENHA","grant_type":"password"}'
# Esperado: JSON com access_token (não 502)
```

Após isso, fazer login novamente no dashboard — as configurações devem reaparecer.

