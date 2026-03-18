

## Problema

O Nginx ja esta rodando na VPS (servindo a outra app "zapmanager"). O script tenta `systemctl reload nginx` mas o systemd diz que o servico esta "inactive" — provavelmente o Nginx foi iniciado fora do systemd ou o servico foi parado mas o processo master continua rodando. Resultado: `reload` falha porque "inactive", `start` falha porque portas 80/443 ja estao ocupadas.

## Correcao

### Arquivo: `self-host/install.sh` (linhas 323-329 e 355-356)

Substituir a logica de reload/start por uma deteccao inteligente:

1. Verificar se o Nginx ja esta rodando (`pidof nginx` ou `systemctl is-active`)
2. Se esta rodando via systemd (`is-active = active`): usar `systemctl reload nginx`
3. Se esta rodando fora do systemd (processo existe mas servico inactive): enviar sinal de reload diretamente com `nginx -s reload`
4. Se nao esta rodando: usar `systemctl start nginx`

```text
if systemctl is-active --quiet nginx; then
    systemctl reload nginx
elif pidof nginx > /dev/null 2>&1; then
    nginx -s reload
else
    systemctl start nginx
fi
```

Aplicar essa mesma logica nos dois pontos do script (linha ~325 e linha ~356).

### Resumo

| Arquivo | Mudanca |
|---------|---------|
| `self-host/install.sh` | Substituir `systemctl reload \|\| start` por deteccao de estado do Nginx (systemd vs processo direto) nos dois pontos de reload |

