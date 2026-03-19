

## Diagnóstico

O teste manual confirmou:
- **PATCH** no PostgREST → funciona (200 OK, dados atualizados)
- **POST** (insert) → retorna 409 porque a row já existe
- O frontend usa `supabase.from('user_settings').upsert(...)` que envia um `POST` com header `Prefer: resolution=merge-duplicates`. Para o PostgREST processar isso como upsert, a tabela precisa ter um constraint UNIQUE na coluna do conflito, e o header `Prefer` precisa chegar intacto.

O problema provável: o PostgREST self-hosted pode não estar resolvendo o upsert corretamente (seja por headers sendo removidos pelo nginx, seja por incompatibilidade na versão). A row é criada na primeira vez mas nunca atualizada nas tentativas subsequentes.

## Plano de Correção

### 1. Alterar `saveUserSettings` para usar SELECT + INSERT/UPDATE

Em vez de depender do `upsert` (que pode falhar no PostgREST self-hosted), mudar para um padrão explícito:
1. Fazer `SELECT` para verificar se a row já existe
2. Se existe → `UPDATE`
3. Se não existe → `INSERT`

**Arquivo:** `src/lib/funnel-storage.ts` — função `saveUserSettings`

```typescript
export async function saveUserSettings(settings: { ... }): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  // Check if row exists
  const { data: existing } = await supabase
    .from('user_settings')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing) {
    // UPDATE existing row
    const { error } = await supabase
      .from('user_settings')
      .update(updatePayload)
      .eq('user_id', user.id);
    return !error;
  } else {
    // INSERT new row
    const { error } = await supabase
      .from('user_settings')
      .insert({ user_id: user.id, ...settings });
    return !error;
  }
}
```

### 2. Nenhuma mudança no banco de dados ou nginx necessária

A correção é puramente no frontend — substitui a chamada `upsert` por lógica explícita que funciona igualmente no Supabase Cloud e no PostgREST self-hosted.

---

**Resumo técnico:** Uma única alteração na função `saveUserSettings` em `src/lib/funnel-storage.ts`.

