

## Corrigir SSL webroot (renovação automática, sem derrubar Nginx)

### Problema
O webroot falhou com 404 porque o `try_files $uri $uri/ /index.html` da SPA captura as requisições do Certbot em `/.well-known/acme-challenge/`, retornando o `index.html` em vez do arquivo de validação.

### Solução
Duas mudanças no `self-host/install.sh`:

**1. Config Nginx temporária** — adicionar `try_files $uri =404;` no bloco ACME para que ele retorne o arquivo real ou 404 limpo, sem cair no fallback da SPA.

**2. Remover o fallback standalone** da função `obtain_cert` — se webroot falhar, apenas avisar o usuário para checar DNS. Isso garante que o Nginx nunca é derrubado e que a renovação automática (`certbot renew`) funciona normalmente via cron.

### Resultado
- SSL obtido e renovado automaticamente via webroot
- Zero downtime para outras aplicações na porta 80
- Sem necessidade de renovação manual

