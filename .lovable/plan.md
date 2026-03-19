
Objetivo: eliminar o 404 do ACME de forma definitiva no instalador self-host, sem reinstalar a VPS.

1) Diagnóstico consolidado (com base nos logs)
- O request chega no Nginx, mas o path `/.well-known/acme-challenge/*` continua respondendo 404.
- Como isso ocorre tanto em `127.0.0.1` quanto no domínio público, o problema está no roteamento/servidor HTTP temporário do instalador (não em DNS externo apenas).
- O ajuste de `default_server` isolado não foi suficiente.

2) Correção de arquitetura no `self-host/install.sh` (principal)
- Substituir o bloco HTTP temporário por um bloco ACME “catch-all” explícito:
  - `listen 80 default_server;`
  - `listen [::]:80 default_server;`
  - `server_name _;`
  - `location ^~ /.well-known/acme-challenge/` com mapeamento de arquivo inequívoco (sem ambiguidade de host).
- Manter app disponível no domínio do dashboard em outro bloco temporário separado (sem disputar o ACME).
- Garantir permissões do webroot antes dos testes:
  - `chown -R www-data:www-data /var/www/acme-challenge`
  - `chmod -R 755 /var/www/acme-challenge`

3) Endurecer a verificação pré-certificado
- Ajustar `verify_acme_webroot()` para validar em 2 camadas:
  - Teste local com Host forçado:
    `curl -s -H "Host: DOMINIO" http://127.0.0.1/.well-known/acme-challenge/ARQUIVO`
  - Teste público:
    `curl -s http://DOMINIO/.well-known/acme-challenge/ARQUIVO`
- Mensagens separadas:
  - Falha local => problema de config Nginx/webroot.
  - Falha pública => DNS/firewall/proxy externo.

4) Garantir renovação futura de SSL no `self-host/nginx.conf.template`
- Incluir `location ^~ /.well-known/acme-challenge/` nos blocos de porta 80 dos dois domínios (público e dashboard), antes do redirect para HTTPS.
- Isso evita regressão no `certbot renew`.

5) Plano de validação após aplicar patch
- Rodar `sudo bash self-host/install.sh` novamente.
- Validar:
  - `curl -v -H "Host: comunidade.origemdavida.online" http://127.0.0.1/.well-known/acme-challenge/teste`
  - `curl -v http://comunidade.origemdavida.online/.well-known/acme-challenge/teste`
  - `curl -v http://dash.origemdavida.online/.well-known/acme-challenge/teste`
- Critério de aceite:
  - ACME retorna 200 nos testes.
  - Certbot emite ambos certificados.
  - Nginx final sobe com HTTPS sem quebrar zapmanager.

6) Fallback controlado (se ainda falhar)
- Adicionar no instalador fallback opcional (com confirmação) para `certbot --standalone` com parada curta do Nginx.
- Só usar quando webroot falhar mesmo com teste local correto.
- Minimiza risco em VPS compartilhada e evita reinstalação.
