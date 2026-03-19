

# Fix: Share URL usa domínio público configurado na instalação

## Contexto
O `VITE_PUBLIC_DOMAIN` já é definido no `.env` da VPS durante a instalação (ex: `https://comunidade.seudominio.com`). O sistema já tem a variável — só falta usá-la no código.

No Lovable Cloud, essa variável não existe, então usamos fallback para a edge function.

## Alteração: `src/pages/Admin.tsx`

Adicionar helper no topo do componente:

```ts
function getShareUrl(slug: string): string {
  const publicDomain = import.meta.env.VITE_PUBLIC_DOMAIN;
  if (publicDomain) {
    // VPS: URL limpa no domínio público
    return `${publicDomain.replace(/\/$/, '')}/${slug}`;
  }
  // Lovable Cloud: fallback para edge function
  const v = Date.now();
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/share?slug=${slug}&v=${v}`;
}
```

Substituir 3 ocorrências:
- **Linha 593**: `getShareUrl(funnel.slug)`
- **Linha 1082**: `getShareUrl(profileDialog?.slug || '')`  (campo readonly)
- **Linha 1088**: `getShareUrl(profileDialog?.slug || '')`  (botão copiar)

## Resultado
- **VPS**: Links geram `https://comunidade.seudominio.com/{slug}` — o Nginx/Traefik já cuida de servir OG tags para crawlers e redirecionar humanos
- **Lovable Cloud**: Continua usando a edge function `/share` como fallback
- **Zero hardcode** — lê da variável de ambiente definida na instalação

