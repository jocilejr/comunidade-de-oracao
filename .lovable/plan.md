

## Problema

O script parou na linha 287 porque usa `systemctl reload nginx`, mas o Nginx nao estava rodando ainda (apenas instalado). Com `set -euo pipefail` no topo, qualquer erro encerra o script imediatamente.

## Correcoes

### 1. Nginx: usar `restart` em vez de `reload` (install.sh)
- Linha 287: trocar `systemctl reload nginx` por `systemctl start nginx` (primeiro start)
- Linha 302: trocar `systemctl reload nginx` por `systemctl restart nginx` (apos config final)

### 2. Fix bcryptjs path (install.sh)
O erro anterior de `bcryptjs` pode reaparecer porque o `node -e` roda no diretorio do repo, nao do APP_DIR. Garantir que o require usa caminho absoluto correto — ja esta usando `$APP_DIR/node_modules/bcryptjs`, entao esta ok se o npm install rodou no APP_DIR.

### 3. Certbot: separar certificados por dominio
Se os dois dominios apontam para IPs diferentes ou um ainda nao tem DNS configurado, o certbot falha para ambos. Separar em duas chamadas independentes com `|| true` para cada uma.

### Resumo das mudancas

| Arquivo | Mudanca |
|---------|---------|
| `self-host/install.sh` | `systemctl start nginx` na primeira vez, `systemctl restart nginx` na segunda. Separar certbot em 2 chamadas independentes. |

