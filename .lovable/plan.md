

## Tres problemas no log — diagnostico e correcoes

### 1. Certbot 404 — webroot nao esta sendo servido pelo Nginx

**Causa**: A config temporaria do Nginx usa `root /var/www/acme-challenge` no location `/.well-known/acme-challenge/`. Mas quando o Nginx recebe `GET /.well-known/acme-challenge/TOKEN`, ele procura o arquivo em `/var/www/acme-challenge/.well-known/acme-challenge/TOKEN` (root + URI). O Certbot cria o arquivo em `/var/www/acme-challenge/.well-known/acme-challenge/TOKEN` usando o `-w` flag, entao isso deveria funcionar.

Porem, o problema real e que o outro site Nginx (`zapmanager`) provavelmente tambem escuta na porta 80 e captura o request antes do `funnel-app`. O Nginx serve o primeiro `server` block que faz match na porta 80, e se `zapmanager` tem um `default_server` ou um catch-all, ele responde primeiro.

**Correcao no `install.sh`**: Adicionar `location /.well-known/acme-challenge/` tambem no nginx.conf.template final (para apos SSL). Mas o problema imediato e que o challenge nao chega ao server block certo.

**Acao pratica**: O script deve tentar `certbot certonly --standalone --pre-hook "..." --post-hook "..."` como fallback quando webroot falha. Ou, mais simples: adicionar o location acme-challenge diretamente no site `zapmanager` existente apontando para `/var/www/acme-challenge`, ja que e apenas um location compartilhado.

**Solucao mais segura (sem tocar no zapmanager)**: Usar certbot `--standalone` com `--preferred-challenges http` e pausar brevemente o Nginx apenas se webroot falhar.

### 2. `www.comunidade.origemdavida.online` — NXDOMAIN

**Causa**: Nao existe registro DNS para `www.comunidade.origemdavida.online`. So o dominio raiz esta configurado.

**Correcao no `install.sh`**: Remover `www.${PUBLIC_DOMAIN}` do certbot se o DNS nao resolver. Adicionar verificacao DNS antes de pedir cert.

### 3. GoTrue binario nao encontrado

**Causa**: O release `v2.158.1` nao existe ou o formato do nome do arquivo mudou. O curl retornou 404.

**Correcao no `install.sh`**: Atualizar para uma versao valida, e implementar auth via API server como fallback (o script ja avisa mas o PM2 tenta iniciar mesmo assim).

---

### Mudancas no `install.sh`

| Mudanca | Detalhe |
|---------|---------|
| **Certbot fallback** | Se webroot falhar, tentar `--standalone` pausando Nginx momentaneamente |
| **Verificar DNS antes de incluir www** | Usar `dig +short` para verificar se `www` resolve antes de inclui-lo no certbot |
| **GoTrue version fix** | Verificar a versao correta no GitHub. Se nao disponivel, nao adicionar ao PM2 |
| **PM2 condicional** | So adicionar `funnel-gotrue` ao PM2 se `/usr/local/bin/gotrue` existir |

### Mudancas no `self-host/ecosystem.config.js`

| Mudanca | Detalhe |
|---------|---------|
| **GoTrue condicional** | Mover GoTrue para um script separado ou remover do ecosystem se binario nao existe |

### Mudancas no `self-host/api-server.js`

| Mudanca | Detalhe |
|---------|---------|
| **Auth fallback** | Implementar endpoints `/auth/v1/token` e `/auth/v1/signup` no api-server usando bcryptjs + JWT, ja que GoTrue nao esta disponivel |

