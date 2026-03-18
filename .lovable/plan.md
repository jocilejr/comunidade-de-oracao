

## Problema: script destrutivo para VPS com outras aplicacoes

O `install.sh` atual faz varias coisas perigosas para uma VPS compartilhada:

1. **`rm -f /etc/nginx/sites-enabled/default`** (linha 286) — remove o site default, pode derrubar outras apps
2. **`systemctl start/restart nginx`** sem cautela — recarrega TODA a config, pode quebrar outros vhosts se a syntax do template falhar
3. **Nginx config temporaria sobrescreve sem verificar** — cria um server block na porta 80 que captura todos os dominios listados, mas nao verifica conflitos com sites existentes
4. **PostgreSQL roles globais** (`anon`, `authenticated`, `service_role`) — cria roles no cluster inteiro, pode colidir com outra app que use Supabase/PostgREST
5. **PM2 global com `pm2 startup`** — pode conflitar com PM2 ja configurado por outro usuario/app
6. **Certbot `--nginx`** modifica configs existentes do Nginx automaticamente

### Correcoes necessarias

| Problema | Correcao |
|----------|----------|
| Remove `default` site | **Nao remover**. Apenas criar/linkar o arquivo proprio |
| Nginx restart cego | Usar `nginx -t` antes, e `systemctl reload nginx` (nao restart) para nao derrubar conexoes ativas de outras apps |
| Config temporaria captura dominios | Criar config minima apenas para os dominios da app, sem tocar em nada existente |
| Roles globais do PostgreSQL | Prefixar roles (`funnel_anon`, `funnel_authenticated`, etc.) OU verificar se ja existem antes de criar (ja faz parcialmente, manter) |
| PM2 startup | Verificar se PM2 ja tem startup configurado antes de sobrescrever |
| Certbot modifica outros sites | Usar `--webroot` em vez de `--nginx` para nao tocar em configs existentes. Criar location `/.well-known/acme-challenge/` manualmente |

### Mudancas no install.sh

1. **Remover `rm -f /etc/nginx/sites-enabled/default`** — nunca tocar no default
2. **Trocar Certbot `--nginx` por `--webroot`** — mais seguro, nao altera configs existentes
3. **Config temporaria Nginx**: criar apenas um location `/.well-known` para validacao SSL, sem sobrescrever nada
4. **Usar `nginx -t && systemctl reload nginx`** em vez de restart (reload nao derruba conexoes)
5. **Verificar conflito de portas** (3000, 4000, 9999) antes de iniciar servicos
6. **PM2**: usar `pm2 start` com `--name` prefixado, verificar se startup ja existe
7. **Aviso no inicio**: detectar se Nginx ja tem sites configurados e avisar o usuario

### Arquivos alterados

| Arquivo | Mudanca |
|---------|---------|
| `self-host/install.sh` | Todas as correcoes acima |
| `self-host/nginx.conf.template` | Sem mudanca (ja esta isolado por server_name) |

