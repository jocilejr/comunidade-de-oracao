

## Plano: Script automático para corrigir roteamento Traefik

### Problema confirmado
O diagnóstico mostrou dois problemas:
1. O container `funnel-nginx-proxy` **não alcança a API** na porta 4000 do host (HTTP 000) -- falta configuração de rede (`extra_hosts` ou `host.docker.internal`)
2. O **Traefik não tem regras** para rotear `/functions/v1/` para o container correto -- tudo cai no SPA (405)

### O que vamos fazer
Criar um script `self-host/setup-traefik.sh` que você executa com **um único comando** e ele faz tudo automaticamente:

1. **Gera um `docker-compose.traefik.yml`** com:
   - Um serviço Nginx que faz proxy para a API local (porta 4000) e serve o frontend
   - Labels do Traefik com prioridade correta: paths de API (`/functions/v1/`, `/auth/v1/`, `/rest/v1/`, `/api/`) com prioridade alta, SPA como fallback
   - Configuração de rede para alcançar o host (`extra_hosts: host.docker.internal`)

2. **Gera a config Nginx interna** do container (diferente da do host) que faz proxy reverso para `host.docker.internal:4000`

3. **Sobe o container** via `docker compose up -d`

4. **Valida automaticamente** que o endpoint público responde JSON em vez de 405

### Arquivos a criar/editar
- **Criar** `self-host/setup-traefik.sh` -- script principal (copiar e colar 1 comando)
- **Criar** `self-host/docker-compose.traefik.yml` -- template do compose com Traefik labels
- **Criar** `self-host/nginx-proxy.conf.template` -- config Nginx interna do container proxy

### Como usar (na VPS)
```bash
cd ~/comunidade-de-oracao && git pull
sudo bash self-host/setup-traefik.sh
```

O script lê automaticamente os domínios do `/opt/funnel-app/.env` e faz todo o resto.

### Critério de sucesso
```bash
curl -s -X POST https://dash.origemdavida.online/functions/v1/typebot-proxy \
  -H 'Content-Type: application/json' -d '{"action":"list"}'
# Retorna JSON: {"error":"Missing authorization"} em vez de HTML 405
```

