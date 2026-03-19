
Objetivo: remover o 502 no `/functions/v1/typebot-proxy` e confirmar se as chaves “sumidas” são indisponibilidade de backend (não perda real de dados).

Diagnóstico consolidado (com base no código + seus testes):
1) O tráfego já chega no `funnel-nginx-proxy` (resposta `502 nginx/1.29.5`), então o problema atual é upstream.
2) O `funnel-nginx-proxy` não alcança `host.docker.internal:4000` (`HTTP 000`).
3) O processo PM2 usa `/opt/funnel-app/api-server.js` (não o arquivo no repo em `~/comunidade-de-oracao`), então `git pull + pm2 restart` pode reiniciar código antigo.
4) As configurações (OpenAI/Typebot) parecem “sumidas” porque `user_settings` não carrega quando `/rest/v1` também está quebrado; primeiro corrigimos conectividade.

Plano de implementação:
1) Fortalecer o deploy para evitar “código atualizado no repo, mas não em /opt”
- Ajustar `self-host/setup-traefik.sh` para sempre sincronizar backend (`api-server.js` e `ecosystem.config.js`) para `/opt/funnel-app` antes dos testes.
- Reiniciar `funnel-api` com `--update-env` dentro do fluxo do script.
- Validar explicitamente que a API está escutando em `0.0.0.0:4000` (não só `127.0.0.1`).

2) Melhorar diagnóstico de conectividade container → host
- Ajustar `self-host/setup-traefik.sh` e `self-host/fix-traefik-routing.sh` para não depender cegamente de `curl` no container.
- Se teste interno falhar, mostrar causa clara (DNS/host.docker.internal, porta fechada, processo não escutando) em vez de `000000`.

3) Endurecer validação pública pós-setup
- No `setup-traefik.sh`, validar 3 rotas após subir stack:
  - `POST /functions/v1/typebot-proxy` (esperado 401/400 JSON)
  - `GET /auth/v1/user` sem token (esperado 401 JSON)
  - `GET /rest/v1/user_settings?select=id&limit=1` (esperado resposta JSON/erro auth, não 502 HTML)
- Se qualquer uma falhar, script encerra com instrução objetiva do próximo passo.

4) Evitar confusão de “dados sumiram”
- Em `src/lib/funnel-storage.ts` e `src/pages/Admin.tsx`, tratar erro de conexão de `getUserSettings()` separadamente de “sem dados”.
- Exibir aviso de backend indisponível (sem limpar visualmente campos como se estivessem apagados).

5) Documentar procedimento correto de atualização em VPS
- Atualizar `self-host/README.md` para deixar explícito:
  - Em produção self-host, atualização correta é `sudo bash self-host/update.sh` (não só `git pull + pm2 restart`).
  - Explicar por que `/opt/funnel-app` é a fonte executada pelo PM2.

Critérios de sucesso:
- `docker exec funnel-nginx-proxy ... /health` retorna HTTP 200.
- URL pública `/functions/v1/typebot-proxy` sai de 502/405 para JSON 401/400.
- Admin volta a carregar `user_settings`; chaves reaparecem sem necessidade de recadastro (salvo se realmente não existirem no banco).
