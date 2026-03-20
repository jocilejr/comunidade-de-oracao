
Objetivo: resolver o loop de “MIME text/html em index-*.js” com diagnóstico determinístico (sem chute).

Diagnóstico consolidado:
- Erro persiste após vários deploys.
- Você confirmou: **sem CDN** e no Network **não aparece `X-Funnel-Served-By`**.
- Do I know what the issue is? **Sim**: o tráfego real do domínio não está passando pelo caminho que foi corrigido (api-server/nginx template esperado), ou está passando por um roteador/vhost concorrente que continua devolvendo HTML para JS.

Plano de implementação

1) Tornar a origem da resposta inequívoca (fingerprint obrigatório)
- Arquivos: `self-host/api-server.js`, `self-host/nginx.conf.template`
- Garantir headers de debug em **todas** as respostas relevantes (`200/404`) com `always` no Nginx.
- Adicionar endpoint técnico `GET /__funnel_diag` no `api-server` (versão, domínio, dist path, timestamp) para provar qual stack está atendendo.

2) Corrigir detecção de modo proxy (auto-detecção atual é frágil)
- Arquivos: `self-host/update.sh`, `self-host/install.sh`
- Substituir heurística “porta 443 com docker-proxy” por validação real:
  - Traefik: container Traefik + routers com `Host(DASHBOARD_DOMAIN)`
  - Nginx: `nginx -T` contendo `server_name` do dashboard
- Adicionar override explícito (`PROXY_MODE=traefik|nginx|auto`) para evitar falso positivo.

3) Transformar smoke test em bloqueio real de deploy
- Arquivo: `self-host/update.sh`
- Validar `/` e `/admin` (não só `/`):
  - extrair `src` do módulo;
  - checar `HTTP 200`, `Content-Type` JavaScript, corpo não iniciando com HTML;
  - checar presença de `X-Funnel-Served-By` ou assinatura equivalente.
- Se falhar: encerrar update com erro claro e comandos de diagnóstico (conflito de router/vhost).

4) Detectar e bloquear conflitos de roteamento por domínio
- Arquivo: `self-host/update.sh`
- Traefik: listar containers com labels contendo o mesmo host e falhar se houver concorrência.
- Nginx: validar qual arquivo efetivamente responde pelo `server_name` do dashboard e alertar conflito.

5) Proteção extra contra cache/stale entrypoint
- Arquivo: `self-host/update.sh`
- Pós-build: validar que o `index.html` gerado usa `src="/assets/..."` (absoluto).
- Se necessário, aplicar cache-buster de deploy no entry module para evitar reutilização de resposta HTML antiga em intermediários.

Detalhes técnicos (resumo)
- Causa provável não é o React/Vite em si; é **rota efetiva em produção divergente da rota planejada**.
- O próximo fix vai priorizar “provar quem respondeu” e “falhar o deploy quando JS vier errado”, para impedir nova tela branca silenciosa.
- Arquivos alvo: `self-host/api-server.js`, `self-host/nginx.conf.template`, `self-host/update.sh`, `self-host/install.sh`.
