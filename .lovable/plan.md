

## Otimização de Performance — Login e Carregamento

### Problemas identificados

1. **Chamadas redundantes a `supabase.auth.getUser()`**: Quase toda função em `funnel-storage.ts` faz `await supabase.auth.getUser()` individualmente. Quando o Admin carrega, `getAllFunnelsMeta()`, `getAvatarGallery()` e `getUserSettings()` são chamados em paralelo, resultando em 3+ roundtrips ao endpoint `/auth/v1/user` (visível nos network logs — 4 chamadas GET /user simultâneas). Isso causa lentidão e "failed to fetch" em conexões instáveis.

2. **AuthProvider inicializa com `loading: true`**: O `onAuthStateChange` + `getSession()` já resolvem a sessão, mas toda a app fica bloqueada até isso completar. No domínio público (funis), o AuthProvider é montado desnecessariamente, adicionando latência ao carregar um funil público.

3. **QueryClient sem configuração de cache**: O `QueryClient` é criado com defaults, sem `staleTime` ou `retry` configurados, causando re-fetches desnecessários.

4. **Admin carrega tudo no mount**: Funis, galeria de avatares e settings são carregados simultaneamente no `useEffect`, mas a galeria e settings só são necessários quando o usuário acessa essas abas.

### Plano de implementação

**1. `src/lib/auth-context.tsx` — Eliminar bloqueio no domínio público**
- Detectar `isPublicDomain()` dentro do AuthProvider
- Se domínio público, setar `loading: false` e `user: null` imediatamente sem consultar auth
- Mantém o comportamento atual para dashboard/admin

**2. `src/lib/funnel-storage.ts` — Cache de userId e redução de roundtrips**
- Criar helper `getCachedUserId()` que usa `supabase.auth.getSession()` (leitura local, sem roundtrip) em vez de `supabase.auth.getUser()` (roundtrip ao servidor)
- `getSession()` retorna a sessão do cache local, resolve instantaneamente
- Substituir todas as ~12 chamadas de `getUser()` por `getSession().user` no arquivo
- Isso elimina os 3-4 roundtrips redundantes ao `/auth/v1/user` por carregamento de página

**3. `src/App.tsx` — QueryClient com retry e staleTime**
- Configurar `defaultOptions.queries.staleTime: 30_000` (30s)
- Configurar `retry: 1` para evitar loops de retry em "failed to fetch"
- Configurar `refetchOnWindowFocus: false`

**4. `src/pages/Admin.tsx` — Lazy-load de dados por aba**
- Carregar apenas `getAllFunnelsMeta()` no mount inicial
- Mover `getAvatarGallery()` para ser carregado apenas quando a aba "Avatares" é selecionada
- Mover `getUserSettings()` para ser carregado apenas quando a aba "Configurações" é selecionada
- Usar flags `loaded` para evitar re-fetch ao revisitar a aba

**5. `src/lib/auth-context.tsx` — Login mais resiliente**
- Adicionar timeout de 10s no login com mensagem amigável de erro
- Tratar `TypeError: Failed to fetch` com mensagem "Verifique sua conexão"

### Arquivos modificados

1. `src/lib/auth-context.tsx`
2. `src/lib/funnel-storage.ts`
3. `src/App.tsx`
4. `src/pages/Admin.tsx`

### Impacto esperado

- Eliminação de 3-4 roundtrips desnecessários ao `/auth/v1/user` por pageload
- Página pública carrega sem esperar auth resolver
- Admin carrega ~50% mais rápido (menos dados iniciais)
- "Failed to fetch" tratado com mensagem amigável em vez de erro genérico
- Zero funcionalidades removidas

