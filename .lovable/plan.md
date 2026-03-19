

# Fix: Preview image not loading in link previews

## Problem
In `handleShare` (line 99), the OG image URL is:
```
${PUBLIC_ORIGIN}/api/preview-image?slug=...
```
But the api-server route handler is at `/preview-image` (line 429), not `/api/preview-image`. Since the public domain now routes directly to the api-server (no prefix stripping), the `/api/preview-image` path returns 404.

## Fix
**`self-host/api-server.js` line 99** — Remove the `/api` prefix:
```js
// Before:
? `${PUBLIC_ORIGIN}/api/preview-image?slug=${encodeURIComponent(slug)}&v=${v}`

// After:
? `${PUBLIC_ORIGIN}/preview-image?slug=${encodeURIComponent(slug)}&v=${v}`
```

One line change. After updating, restart with `pm2 restart all`.

