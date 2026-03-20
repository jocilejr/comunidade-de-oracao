

## Diagnóstico confirmado

O output do `__funnel_diag` local revelou **duas causas-raiz**:

### Causa 1: PM2 não carrega variáveis de ambiente
O `ecosystem.config.js` usa `env_file: "/opt/funnel-app/.env"` — mas **PM2 não suporta `env_file`**. Por isso `publicDomain` e `dashboardDomain` aparecem como `"localhost"`. O api-server roda sem saber qual domínio ele serve.

### Causa 2: HTTPS não chega ao api-server
O `curl -sf https://dash.origemdavida.online/__funnel_diag` retorna vazio, mas `http://127.0.0.1:4000/__funnel_diag` funciona. Algo (container antigo ou outro serviço) está interceptando o tráfego HTTPS antes de chegar ao api-server via Traefik. Provavelmente um container `funnel-spa` ou `funnel-nginx-proxy` antigo ainda com labels Traefik ativas.

---

## Plano de implementação

### 1. Corrigir `ecosystem.config.js` — carregar env vars corretamente

Remover `env_file` (não suportado pelo PM2). Em vez disso, o `update.sh` vai exportar todas as variáveis do `.env` antes de chamar `pm2 start`, e o `ecosystem.config.js` vai usar `cwd` para garantir o diretório correto.

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "funnel-api",
      script: "/opt/funnel-app/api-server.js",
      cwd: "/opt/funnel-app",
      watch: false,
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      // env vars are inherited from shell (set -a; source .env; set +a)
    },
    ...
  ]
};
```

### 2. Corrigir `update.sh` — garantir env vars no PM2

No bloco de restart do PM2:
- Fazer `set -a; source /opt/funnel-app/.env; set +a` antes do `pm2 start`
- Usar `pm2 delete all` + `pm2 start ecosystem.config.js` (não `pm2 restart`)
- Validar que `__funnel_diag` responde com `servedBy` e com os domínios corretos (não `localhost`)

### 3. Corrigir `update.sh` — limpar containers antigos agressivamente

Antes de subir o docker-compose novo:
- Parar e remover QUALQUER container com labels Traefik que referenciem o `DASHBOARD_DOMAIN` (exceto os novos `funnel-api-proxy` e `funnel-rest-proxy`)
- Isso mata containers fantasma (`funnel-spa`, `funnel-nginx-proxy`, etc.) que interceptam o tráfego

### 4. Validação pós-restart

Após restart, o update.sh vai:
- Testar `http://127.0.0.1:4000/__funnel_diag` e verificar que `dashboardDomain` NÃO é `localhost`
- Se for `localhost`, falhar com erro claro: "env vars não carregadas"

---

### Arquivos modificados
- `self-host/ecosystem.config.js` — remover `env_file`
- `self-host/update.sh` — exportar env antes do PM2, limpar containers antigos, validar domínios no diag

