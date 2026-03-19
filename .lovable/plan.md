

## Corrigir SSL: adicionar `default_server` ao bloco Nginx temporário

### Problema confirmado

O diagnóstico mostrou que o Nginx retorna 404 para os dois domínios porque o site `zapmanager` tem `default_server` na porta 80. O Nginx roteia todas as requisições para lá, ignorando o bloco do funnel-app — mesmo com `server_name` correto e `^~`.

Sem `default_server` explícito no bloco do funnel-app E sem match exato de `server_name`, o Nginx usa o `default_server` definido pelo `zapmanager`.

### Solução

Adicionar `default_server` ao bloco temporário do funnel-app durante a emissão do certificado, e removê-lo na configuração final (que já tem `server_name` explícito e SSL).

### Mudança no `self-host/install.sh`

**Linha 286** — mudar de:
```nginx
listen 80;
```
para:
```nginx
listen 80 default_server;
```

Isso garante que durante a fase de obtenção do SSL, o Nginx direcione as requisições ACME para o bloco correto. A configuração final do Nginx (gerada pelo template) não usa `default_server`, então o `zapmanager` volta ao normal após a instalação.

Também vou adicionar uma nota informando que o `default_server` é temporário e será substituído pela config final.

