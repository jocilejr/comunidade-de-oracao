
Objetivo: fechar o erro 405 com evidência de console antes de qualquer nova alteração de código.

Diagnóstico já confirmado pelos seus comandos:
- `POST http://127.0.0.1:4000/typebot-proxy` responde `{"error":"Missing authorization"}` → API local está viva.
- `POST https://dash.../functions/v1/typebot-proxy` responde `405` → a URL pública não está chegando na API.
- `grep "functions" /etc/nginx/sites-enabled/funnel-app` sem resultado → o Nginx ativo não tem o bloco `/functions/v1/`.

Plano de execução (operacional, passo a passo)

1) Confirmar qual arquivo Nginx está realmente ativo
```bash
sudo ls -l /etc/nginx/sites-enabled/funnel-app /etc/nginx/sites-available/funnel-app
sudo readlink -f /etc/nginx/sites-enabled/funnel-app
sudo nginx -T 2>/dev/null | grep -nE "server_name|functions/v1|try_files .*index.html" | grep -E "origemdavida|functions/v1|index.html"
```
Resultado esperado: identificar o server block do `dash.origemdavida.online` e provar que `/functions/v1/` não está nele.

2) Regerar e aplicar a config correta do Nginx (sem mexer no frontend)
```bash
cd ~/comunidade-de-oracao
set -a; source /opt/funnel-app/.env; set +a

sudo sed -e "s/__PUBLIC_DOMAIN__/${PUBLIC_DOMAIN}/g" \
         -e "s/__DASHBOARD_DOMAIN__/${DASHBOARD_DOMAIN}/g" \
         self-host/nginx.conf.template > /etc/nginx/sites-available/funnel-app

sudo ln -sf /etc/nginx/sites-available/funnel-app /etc/nginx/sites-enabled/funnel-app
sudo nginx -t && sudo systemctl reload nginx
```

3) Validar imediatamente no console
```bash
grep -n "functions/v1" /etc/nginx/sites-enabled/funnel-app
curl -i -X POST https://dash.origemdavida.online/functions/v1/typebot-proxy \
  -H 'Content-Type: application/json' \
  -d '{"action":"list"}'
```
Resultado esperado: sair de `405` para `401` JSON (`Missing authorization`) ou `400` JSON (erro funcional do proxy). Qualquer JSON já prova que o roteamento foi corrigido.

4) Só se ainda der 405: checar proxy externo (Traefik/Cloudflare Tunnel) na frente do Nginx
```bash
sudo ss -ltnp | grep ':443'
docker ps --format '{{.Names}} {{.Ports}}' | grep -Ei 'traefik|nginx|funnel'
```
Se houver proxy externo, o ajuste precisa ser nele (não apenas no Nginx local).

5) Hardening definitivo (depois de estabilizar)
- Atualizar `self-host/update.sh` para:
  - sempre recriar symlink `sites-enabled/funnel-app -> sites-available/funnel-app`;
  - validar pós-reload que `/functions/v1/` existe no `nginx -T`;
  - falhar com mensagem clara se não existir (evita voltar ao estado quebrado no próximo update).

Critério de sucesso final
- Console: `POST /functions/v1/typebot-proxy` não retorna mais 405.
- App: importação do Typebot passa da etapa de chamada da função (eventual erro restante deve ser apenas de credencial/token/workspace, não de roteamento).

Detalhe técnico (resumo)
- Hoje a API está correta, mas o caminho público `/functions/v1/*` não está mapeado no Nginx ativo; por isso cai em rota de SPA e volta 405.
- Corrigindo o roteamento, o backend recebe a requisição e responde em JSON (401/400/200), eliminando o bloqueio principal.
