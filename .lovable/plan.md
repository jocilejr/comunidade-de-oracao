

## Diagnóstico e Correção: Erro ao Importar do Typebot

### Problema Real

O código atual descarta a mensagem de erro real do servidor. Quando `supabase.functions.invoke()` recebe uma resposta não-2xx, ele retorna um `error` genérico ("Edge Function returned a non-2xx status code") mas o corpo da resposta com o erro detalhado fica em `data`. O código faz `if (error) throw error`, perdendo a informação útil.

Sem ver o erro real, não sabemos se o problema é:
- **401**: JWT inválido/expirado
- **400**: "Token do Typebot não configurado" (settings não encontrados no DB pelo proxy)
- **4xx/5xx**: Erro na API do Typebot

### Correções

**Arquivo: `src/pages/Admin.tsx`** (linhas ~906-914)

1. **Extrair o erro real da resposta** — quando `supabase.functions.invoke()` retorna erro, ler o `data` que contém a mensagem detalhada do servidor:

```typescript
const { data, error } = await supabase.functions.invoke('typebot-proxy', {
  body: { action: 'list' },
});
// Extrair mensagem real do servidor
if (error) {
  const serverMsg = data?.error || error?.message || 'Erro desconhecido';
  throw new Error(serverMsg);
}
```

2. **Mesmo tratamento no handler de importação individual** (linhas ~1202-1210) — aplicar a mesma lógica de extração de erro.

3. **Auto-save antes de importar** — salvar as configurações no banco automaticamente antes de chamar o proxy, garantindo que o proxy sempre encontre os dados:

```typescript
// Antes de chamar o proxy, salvar as settings
await saveUserSettings({
  typebot_api_token: typebotToken,
  typebot_workspace_id: typebotWorkspaceId,
  typebot_base_url: typebotBaseUrl,
});
```

### Escopo
- 1 arquivo alterado: `src/pages/Admin.tsx`
- ~10 linhas modificadas em 2 handlers (listar e importar)
- Resultado: mensagem de erro precisa + auto-save preventivo

