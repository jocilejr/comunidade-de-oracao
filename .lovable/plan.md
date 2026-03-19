

# Fix: Link preview (OG tags) não funciona na URL pública com Traefik

## Problema
Quando o WhatsApp (ou outro crawler) acessa `https://comunidade.origemdavida.online/pagamento`, o Traefik envia a requisição para o container SPA estático, que retorna o `index.html` genérico sem OG tags dinâmicas. Crawlers não executam JavaScript, então nunca veem os metadados do funil.

O Nginx config tem detecção de bot por User-Agent (`$is_crawler`), mas o Traefik não tem equivalente nativo.

## Solução
Rotear o tráfego catch-all do domínio público pelo api-server em vez do SPA estático. O api-server faz detecção de User-Agent: bots recebem HTML com OG tags, humanos recebem o `index.html` do SPA.

## Alterações

### 1. `self-host/api-server.js` — Catch-all com bot detection

Adicionar no final do router, antes do 404:

```js
// Public-domain catch-all: /{slug}
const slugMatch = path.match(/^\/([a-zA-Z0-9_-]+)\/?$/);
if (slugMatch && req.method === 'GET') {
  const slug = slugMatch[1];
  const ua = req.headers['user-agent'] || '';
  const isCrawler = /whatsapp|facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|telegrambot|discordbot|googlebot|bingbot|yandex|pinterest|snapchat/i.test(ua);
  
  if (isCrawler) {
    return await handleShare(req, res, slug, null); // retorna HTML com OG tags
  }
  
  // Humano: servir index.html (SPA takeover)
  const fs = require('fs');
  const indexPath = '/opt/funnel-app/dist/index.html';
  try {
    const html = fs.readFileSync(indexPath, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  } catch {
    // fallback: redirect para o SPA
    res.writeHead(302, { Location: `${DASHBOARD_ORIGIN}/f/${slug}` });
    return res.end();
  }
}
```

Adicionar também handler para servir assets estáticos (`/assets/*`, favicon, etc.) do dist:

```js
if (path.startsWith('/assets/') || path === '/favicon.ico' || path.endsWith('.js') || path.endsWith('.css')) {
  // servir arquivo estático de /opt/funnel-app/dist/
}
```

### 2. `self-host/docker-compose.traefik.yml.template` — Rotear público para api-server

Mudar o catch-all do domínio público (priority 1) para apontar ao api-server em vez do SPA:

```yaml
# Antes: public catch-all → SPA
# Depois: public catch-all → api-server
- "traefik.http.routers.__ROUTER_PREFIX__-pub.rule=Host(`__PUBLIC_DOMAIN__`)"
- "traefik.http.routers.__ROUTER_PREFIX__-pub.service=__ROUTER_PREFIX__-api-svc"
```

Remover o router pub do serviço funnel-spa e adicioná-lo ao funnel-api-proxy.

### 3. Resultado
- `comunidade.origemdavida.online/pagamento` + WhatsApp crawler → HTML com OG tags corretas (título, descrição, imagem do funil)
- `comunidade.origemdavida.online/pagamento` + navegador humano → SPA carrega e renderiza o funil
- Assets estáticos (JS, CSS) continuam sendo servidos pelo api-server do dist
- Dashboard não é afetado (continua roteando para SPA)

### 4. Deploy na VPS
Após aprovar, será necessário:
1. Atualizar `api-server.js` e `docker-compose.traefik.yml` na VPS
2. `docker compose down && docker compose up -d`
3. `pm2 restart all`

