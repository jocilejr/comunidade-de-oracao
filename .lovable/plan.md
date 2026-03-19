

# Fix: Performance + Public Share URL

## Problem 1: Share URL uses wrong domain
The "Compartilhar" button builds URLs using `VITE_SUPABASE_URL` (the backend URL), not the public domain. This means shared links point to `exvfzbkhdclukfrhkvtf.supabase.co` instead of `comunidade.dominio.com`.

**Fix**: Use `VITE_PUBLIC_DOMAIN` env var for share links. On Lovable Cloud, fall back to `VITE_SUPABASE_URL` if not set.

### Changes in `src/pages/Admin.tsx`
- Line 593: Change `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/share?slug=...` → use a helper that reads `VITE_PUBLIC_DOMAIN` first
- Line 1088: Same fix for the second share button in the profile dialog
- The share URL format becomes: `https://comunidade.seudominio.com/{slug}` (clean URL, not the edge function path)

### Changes in `.env` (via environment)
- No file edit needed — but you'll need to set `VITE_PUBLIC_DOMAIN` in project settings. For the VPS, it's already in `.env.template`.

## Problem 2: Performance — heavy base64 images in list
The `preview_image` column contains full base64 data URLs (can be 500KB+ each). Loading 10+ funnels fetches megabytes of image data just for thumbnails.

**Fix**: 
- `getAllFunnelsMeta()` already excludes `flow` but still fetches `preview_image` — keep it for thumbnail display but this is inherent to the current architecture (base64 stored in DB). No change needed here unless we move to storage buckets later.
- The **stats tab** calls `f.flow.groups.length` and `g.blocks.length` on meta objects that have empty stub flows → always shows 0. Remove these stats or fetch actual counts from the DB.

### Changes in `src/pages/Admin.tsx` (Stats tab)
- Remove "Total de grupos" and "Total de blocos" stats since they require full flow data
- Or replace with a count query from the DB (simpler: just remove them, keep "Total de funis")

## Summary of file changes
1. **`src/pages/Admin.tsx`** — Fix share URL to use `VITE_PUBLIC_DOMAIN`, fix stats tab
2. **Add secret** `VITE_PUBLIC_DOMAIN` with value like `https://comunidade.seudominio.com`

## For VPS
After deploy, the `.env` already has `VITE_PUBLIC_DOMAIN` configured — no extra action needed.

