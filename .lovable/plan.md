

## Diagnóstico: SSL webroot ainda retorna 404

### Causa provável

O Nginx tem outro site (`zapmanager`) que pode estar configurado como `default_server` na porta 80. Quando o Certbot faz a requisição HTTP para validar o domínio, o Nginx roteia para o server block errado (zapmanager), que não tem o diretório ACME — resultando em 404.

Além disso, o `location` do ACME pode estar perdendo prioridade para um regex location de outro config. A diretiva `^~` força prioridade absoluta.

### Correção no `self-host/install.sh`

**1. Adicionar `^~` ao location do ACME** para garantir prioridade total sobre qualquer regex location:

```nginx
location ^~ /.well-known/acme-challenge/ {
    root /var/www/acme-challenge;
    allow all;
}
```

**2. Adicionar um teste de diagnóstico antes do Certbot** — criar um arquivo de teste no webroot e verificar via curl local se o Nginx está servindo corretamente:

```bash
# Criar arquivo de teste
echo "acme-test-ok" > "$ACME_ROOT/.well-known/acme-challenge/test-file"

# Verificar se Nginx serve corretamente
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://${DOMAIN}/.well-known/acme-challenge/test-file")
if [ "$HTTP_CODE" != "200" ]; then
  warn "Nginx NÃO está servindo o webroot corretamente (HTTP $HTTP_CODE)."
  warn "Verifique se outro site Nginx (ex: zapmanager) tem 'default_server' na porta 80."
  # Mostrar qual server block está respondendo
  curl -sI "http://${DOMAIN}/.well-known/acme-challenge/test-file" | head -5
fi
rm -f "$ACME_ROOT/.well-known/acme-challenge/test-file"
```

**3. Criar o diretório `.well-known/acme-challenge/` antecipadamente** (atualmente só cria `/var/www/acme-challenge`):

```bash
mkdir -p "$ACME_ROOT/.well-known/acme-challenge"
```

### Mudanças

| Arquivo | Mudança |
|---------|---------|
| `self-host/install.sh` | `mkdir -p` com path completo incluindo `.well-known/acme-challenge` |
| `self-host/install.sh` | `location ^~` no bloco ACME da config Nginx temporária |
| `self-host/install.sh` | Teste de diagnóstico com curl antes de chamar Certbot |

### Ação manual necessária no servidor

Se após a correção o teste de diagnóstico mostrar que o Nginx ainda retorna 404, o problema é que o `zapmanager` tem `default_server`. Nesse caso, será necessário verificar o arquivo `/etc/nginx/sites-available/zapmanager` e remover `default_server` de lá (ou adicionar `default_server` temporariamente no bloco do funnel-app).

