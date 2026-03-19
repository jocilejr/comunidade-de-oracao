

## Correção do smoke test no setup-traefik.sh

O problema é apenas cosmético: o `curl` retorna `000` porque o script não está capturando o HTTP status corretamente quando há body na resposta. O endpoint `/functions/v1/typebot-proxy` retornou 401 (correto), mas o teste marcou como falha.

### Mudança

**Arquivo: `self-host/setup-traefik.sh`**

Ajustar a função `test_url` para:
1. Usar `curl -s -o /dev/null -w "%{http_code}"` corretamente (garantir que o body não interfere no status code)
2. Aceitar 401 como sucesso para rotas de API (já que sem token é esperado)

Isso é uma correção de ~5 linhas no script de smoke test. Nenhuma mudança de arquitetura necessária — tudo já funciona.

