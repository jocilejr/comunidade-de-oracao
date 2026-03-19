

## Plano: Criar `self-host/update.sh`

Script que lê os domínios e configurações do `.env` já existente em `/opt/funnel-app/.env` (criado pelo `install.sh`), sem perguntar nada ao usuário.

### O que o script faz

1. **Verifica root** e existência de `/opt/funnel-app/.env`
2. **Carrega variáveis** do `.env` existente (domínios, DB, JWT, etc.)
3. **Puxa código atualizado** do repositório (`git pull` no diretório do repo)
4. **Copia arquivos atualizados** (`api-server.js`, `ecosystem.config.js`) para `/opt/funnel-app/`
5. **Executa novas migrations** (apenas as que ainda não foram aplicadas — usa tabela de controle `public.migrations_applied`)
6. **Rebuild do frontend** (`npm ci && npm run build`) com as variáveis corretas em `.env.local`
7. **Copia `dist/`** para `/opt/funnel-app/dist`
8. **Atualiza config Nginx** (re-aplica template com os domínios do `.env`) e faz `nginx reload`
9. **Reinicia serviços** (`pm2 restart funnel-api funnel-postgrest`)
10. **Exibe resumo** com URLs

### Arquivo a criar

- `self-host/update.sh` — ~80 linhas, bash script

### Detalhes técnicos

- Lê `PUBLIC_DOMAIN`, `DASHBOARD_DOMAIN`, `PGRST_JWT_SECRET`, `DB_PASS` etc. de `/opt/funnel-app/.env` via `source`
- Para migrations incrementais: cria tabela `migrations_applied` se não existir, verifica quais `.sql` já foram aplicados pelo nome do arquivo, executa apenas as novas
- Gera `.env.local` no repo com `VITE_SUPABASE_URL=https://$DASHBOARD_DOMAIN` antes do build
- Usa `sed` no `nginx.conf.template` igual ao `install.sh` para gerar a config final

