

## Corrigir fallback standalone do Certbot

### Problema
O `--standalone` falha silenciosamente porque:
1. `nginx -s stop` nao libera a porta 80 de forma confiavel
2. `2>/dev/null` esconde o erro real do Certbot

### Mudanca

**Arquivo: `self-host/install.sh`** (funcao `obtain_cert`, linhas 324-357)

Substituir o bloco de fallback standalone para:
- Usar `systemctl stop nginx` em vez de `nginx -s stop`
- Esperar 2s e verificar se porta 80 esta livre com `lsof`
- Remover `2>/dev/null` do comando certbot standalone para mostrar erros
- Usar `systemctl start nginx` para reiniciar

