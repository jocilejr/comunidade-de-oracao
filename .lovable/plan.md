

## Mudar porta do PostgREST de 3000 para 3100

A porta 3000 ja esta em uso pelo PostgREST de outra instalacao. Vamos mudar para 3100 em todos os arquivos.

### Arquivos e mudancas

| Arquivo | Mudanca |
|---------|---------|
| `self-host/install.sh` | Trocar `3000` por `3100` em: PGRST_SERVER_PORT, server-port no postgrest.conf, e na lista de portas verificadas |
| `self-host/nginx.conf.template` | Trocar `proxy_pass http://127.0.0.1:3000/` por `3100` |
| `self-host/.env.template` | Trocar `PGRST_SERVER_PORT=3000` por `3100` |

