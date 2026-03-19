
Objetivo: eliminar o `405` no endpoint público `/functions/v1/typebot-proxy` sem mexer no frontend.

Diagnóstico fechado (com base no seu console):
- `127.0.0.1:4000/typebot-proxy` responde JSON (`Missing authorization`) → API local está correta.
- `https://dash.../functions/v1/typebot-proxy` responde `405 Not Allowed` em HTML → requisição não está chegando na API.
- Porta `443` está em `docker-proxy` + containers `deploy-traefik-1` / `deploy-nginx-1` / `funnel-nginx-proxy` → quem manda no tráfego externo é o Traefik, não o Nginx host.
- Portanto: o ajuste precisa ser no roteamento do Traefik (ou no container que ele aponta), não no `sites-enabled/funnel-app` do host.

Plano de execução:

1) Mapear roteamento real do Traefik (fonte da regra)
- Coletar labels dos containers para descobrir qual serviço recebe `Host(dash.origemdavida.online)`.
- Confirmar se hoje está apontando para `deploy-nginx-1` (SPA) em vez de `funnel-nginx-proxy` (proxy para API/rotas backend).

2) Corrigir regra de roteamento do dashboard no Traefik
- Aplicar uma destas estratégias:
  - Estratégia A (mais simples): todo `Host(dash...)` aponta para `funnel-nginx-proxy`.
  - Estratégia B (mais controlada): criar router de alta prioridade para `PathPrefix(/functions/v1,/auth/v1,/rest/v1,/api)` → `funnel-nginx-proxy`, mantendo `/` na SPA.
- Garantir prioridade das rotas para não cair no fallback estático.

3) Recarregar stack Traefik e validar por curl
- Após reload, validar:
  - `POST /functions/v1/typebot-proxy` deve sair de `405` para JSON `401`/`400`.
  - `GET /auth/v1/user` sem token deve retornar JSON `401`.
- Se ainda vier HTML `405`, revisar prioridade dos routers.

4) Validar no app (fim a fim)
- Abrir Admin → importação Typebot.
- Confirmar que o erro muda de “Method Not Allowed” para:
  - sucesso de listagem, ou
  - erro funcional de credencial/token/workspace (que já é camada de negócio, não roteamento).

5) Hardening definitivo no projeto (para não regredir)
- Atualizar `self-host/update.sh` para detectar ambiente com Traefik (`:443` ocupado por `docker-proxy`) e:
  - avisar claramente que o roteamento ativo é externo;
  - rodar validação real via URL pública (`/functions/v1`, `/auth/v1`) e falhar com mensagem objetiva se continuar 405.
- Documentar no `self-host/README.md` o modo “Traefik na frente” com regra de prioridade de paths.

Detalhes técnicos (resumo):
```text
Cliente
  -> https://dash.../functions/v1/typebot-proxy
  -> Traefik (porta 443)
      -> [HOJE] serviço SPA (405)
      -> [CORRETO] serviço proxy/backend (JSON 401/400/200)
           -> API local 127.0.0.1:4000
```

Critério de sucesso:
- Endpoint público `/functions/v1/typebot-proxy` nunca mais retorna HTML 405.
- Fluxo de importação Typebot passa da fase de roteamento e responde como API (JSON).
