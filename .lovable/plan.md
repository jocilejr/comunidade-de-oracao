

# Fix: 404 na URL pública (Traefik)

## Problema
A URL `comunidade.origemdavida.online/pagamento` chega ao SPA via Traefik, mas o React Router só tem a rota `/f/:slug`. Não existe rota para `/:slug` na raiz, resultando em 404.

O Nginx config tem lógica de redirect `/{slug}` → `/f/{slug}`, mas o Traefik não tem equivalente — ele serve o SPA diretamente.

## Solução
Adicionar uma rota catch-all `/:slug` no React Router que renderiza o componente Funnel. Essa rota fica com prioridade baixa (antes do `*` NotFound) e tenta carregar o funil pelo slug. Se não encontrar, mostra a mensagem "Funil não encontrado".

## Alterações

### 1. `src/App.tsx`
Adicionar rota `/:slug` antes do `*`:

```tsx
<Route path="/f/:slug" element={<Funnel />} />
<Route path="/:slug" element={<Funnel />} />
<Route path="*" element={<NotFound />} />
```

### 2. `src/pages/Funnel.tsx`
O componente já usa `useParams<{ slug: string }>()` — funciona tanto com `/f/:slug` quanto `/:slug` sem alteração.

## Resultado
- `comunidade.origemdavida.online/pagamento` → carrega o funil "pagamento"
- `comunidade.origemdavida.online/f/pagamento` → continua funcionando
- Rotas fixas (`/`, `/login`, `/admin`) têm prioridade por serem mais específicas
- URLs inválidas que não correspondem a funis mostram "Funil não encontrado"

## Impacto
- 1 arquivo alterado (`src/App.tsx` — 1 linha adicionada)
- Zero impacto no Lovable Cloud ou Nginx setup

