

## Problema encontrado: API escuta apenas em `127.0.0.1`

No `self-host/api-server.js` linha 426:
```js
server.listen(PORT, "127.0.0.1", () => {
```

Isso significa que a API **só aceita conexoes de localhost**. Quando o container Docker tenta conectar via `host.docker.internal` (que resolve para o IP da bridge, ex: `172.17.0.1`), a conexao e recusada porque nao e `127.0.0.1`.

## Correcao

**1 arquivo, 1 linha:**

Alterar `self-host/api-server.js` linha 426 de:
```js
server.listen(PORT, "127.0.0.1", () => {
```
para:
```js
server.listen(PORT, "0.0.0.0", () => {
```

Isso faz a API aceitar conexoes de qualquer interface (localhost + Docker bridge). A seguranca e mantida pelo firewall do host (ufw/iptables) que ja bloqueia acesso externo direto a porta 4000 -- o acesso publico continua passando pelo Traefik.

## Apos deploy

Na VPS:
```bash
cd ~/comunidade-de-oracao && git pull
pm2 restart funnel-api
# Validar:
docker exec funnel-nginx-proxy curl -s http://host.docker.internal:4000/health
# Esperado: HTTP 200
curl -s -X POST https://dash.origemdavida.online/functions/v1/typebot-proxy \
  -H 'Content-Type: application/json' -d '{"action":"list"}'
# Esperado: JSON {"error":"Missing authorization"} (nao mais 405/502)
```

