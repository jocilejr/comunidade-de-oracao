

## Problema

O Nginx esta rodando mas o PID file (`/run/nginx.pid`) esta vazio ou corrompido. `nginx -s reload` precisa do PID para enviar o sinal ao processo master, e falha com "invalid PID number". O `systemctl` reporta o servico como inactive, entao o script cai no branch `pidof nginx` → `nginx -s reload` que falha.

## Correcao

### Arquivo: `self-host/install.sh` (funcao `reload_nginx`, linhas 324-335)

Adicionar um terceiro caso: quando o PID file esta invalido mas o processo existe, obter o PID real via `pidof` e enviar `HUP` diretamente (que e o que `nginx -s reload` faz internamente). Tambem corrigir o PID file para futuras operacoes.

```bash
reload_nginx() {
  if ! nginx -t 2>/dev/null; then
    err "Configuração Nginx inválida! Verifique /etc/nginx/sites-available/funnel-app"
  fi
  if systemctl is-active --quiet nginx; then
    systemctl reload nginx
  elif pidof nginx > /dev/null 2>&1; then
    # Nginx rodando fora do systemd ou com PID file corrompido
    NGINX_PID=$(pidof -s nginx)
    echo "$NGINX_PID" > /run/nginx.pid
    kill -HUP "$NGINX_PID"
  else
    systemctl start nginx
  fi
}
```

| Arquivo | Mudanca |
|---------|---------|
| `self-host/install.sh` | Na funcao `reload_nginx`: usar `kill -HUP` com PID real obtido via `pidof` quando `nginx -s reload` nao funciona, e corrigir o PID file |

