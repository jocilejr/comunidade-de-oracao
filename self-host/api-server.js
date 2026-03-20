/**
 * API Server — substitui as Edge Functions do Supabase.
 * Roda em http://127.0.0.1:4000
 */

const http = require("http");
const fs = require("fs");
const nodePath = require("path");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// ── Configuração ──────────────────────────────────────────
const PORT = parseInt(process.env.API_PORT || "4000", 10);
const PUBLIC_DOMAIN = process.env.PUBLIC_DOMAIN || process.env.DOMAIN || "localhost";
const DASHBOARD_DOMAIN = process.env.DASHBOARD_DOMAIN || process.env.DOMAIN || "localhost";
const PUBLIC_ORIGIN = `https://${PUBLIC_DOMAIN}`;
const DASHBOARD_ORIGIN = `https://${DASHBOARD_DOMAIN}`;
const JWT_SECRET = process.env.API_JWT_SECRET || process.env.PGRST_JWT_SECRET || "super-secret";
const JWT_EXP = parseInt(process.env.GOTRUE_JWT_EXP || "3600", 10);

const pool = new Pool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  database: process.env.DB_NAME || "funnel_app",
  user: process.env.DB_USER || "funnel_user",
  password: process.env.DB_PASS || "",
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function json(res, data, status = 200) {
  res.writeHead(status, { ...corsHeaders, "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
  });
}

// ── Route: /share ─────────────────────────────────────────
async function handleShare(req, res, slug, format) {
  if (format === 'json') {
    const { rows } = await pool.query(
      `SELECT id, slug, name, created_at, flow, bot_name, bot_avatar,
              preview_image, page_title, page_description, user_id
       FROM funnels WHERE slug = $1 LIMIT 1`,
      [slug]
    );
    if (!rows.length) return json(res, { error: "Not found" }, 404);
    return json(res, rows[0]);
  }

  const { rows } = await pool.query(
    `SELECT id, name, slug, page_title, page_description, preview_image
     FROM funnels WHERE slug = $1 LIMIT 1`,
    [slug]
  );

  const canonicalUrl = `${PUBLIC_ORIGIN}/${slug}`;
  const spaUrl = `${DASHBOARD_ORIGIN}/f/${slug}`;

  if (!rows.length) {
    res.writeHead(302, { Location: spaUrl });
    return res.end();
  }

  const funnel = rows[0];
  const title = escapeHtml(funnel.page_title || funnel.name || "Funil");
  const description = escapeHtml(funnel.page_description || "Aperte aqui e Receba");

  let previewUrl = funnel.preview_image;
  if (!previewUrl) {
    const { rows: fallbackImgs } = await pool.query(
      `SELECT data_url FROM funnel_preview_images WHERE funnel_id = $1 ORDER BY position ASC LIMIT 1`,
      [funnel.id || funnel.slug]
    );
    if (fallbackImgs.length) previewUrl = fallbackImgs[0].data_url;
  }

  const v = Date.now().toString();
  // URL limpa e forjada para agradar o WhatsApp (parece um arquivo físico)
  const imageUrl = previewUrl
    ? `${PUBLIC_ORIGIN}/preview-image/${encodeURIComponent(slug)}/banner.jpg?v=${v}`
    : "";

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  ${imageUrl ? `
  <meta property="og:image" content="${escapeHtml(imageUrl)}" />
  <meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}" />
  <meta property="og:image:type" content="image/jpeg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  ` : ""}
  
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  ${imageUrl ? `<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />` : ""}
</head>
<body>
  <p>Redirecionando para o funil...</p>
  <script>window.location.href="${escapeHtml(spaUrl)}";</script>
</body>
</html>`;

  res.writeHead(200, {
    ...corsHeaders,
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache, no-store, must-revalidate",
  });
  res.end(html);
}

// ── Route: /preview-image ─────────────────────────────────
const previewCache = new Map();
const PREVIEW_CACHE_TTL = 5 * 60 * 1000;

async function handlePreviewImage(req, res, slug) {
  const now = Date.now();
  const cached = previewCache.get(slug);
  if (cached && (now - cached.ts) < PREVIEW_CACHE_TTL) {
    res.writeHead(200, {
      ...corsHeaders,
      "Content-Type": cached.mime,
      "Content-Length": cached.buffer.length,
      "Cache-Control": "no-cache, no-store, must-revalidate",
    });
    return res.end(cached.buffer);
  }

  const { rows } = await pool.query(`SELECT preview_image FROM funnels WHERE slug = $1 LIMIT 1`, [slug]);
  let dataUrl = rows[0]?.preview_image;

  if (!dataUrl && rows.length) {
    const { rows: fbRows } = await pool.query(`SELECT f.id FROM funnels f WHERE f.slug = $1 LIMIT 1`, [slug]);
    if (fbRows.length) {
      const { rows: imgRows } = await pool.query(
        `SELECT data_url FROM funnel_preview_images WHERE funnel_id = $1 ORDER BY position ASC LIMIT 1`,
        [fbRows[0].id]
      );
      if (imgRows.length) dataUrl = imgRows[0].data_url;
    }
  }

  if (!dataUrl) return json(res, { error: "No image found" }, 404);

  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    if (dataUrl.startsWith("http")) {
      res.writeHead(302, { Location: dataUrl });
      return res.end();
    }
    return json(res, { error: "Invalid image format" }, 400);
  }

  const mimeType = match[1];
  const buffer = Buffer.from(match[2], "base64");

  previewCache.set(slug, { buffer, mime: mimeType, ts: now });
  res.writeHead(200, {
    ...corsHeaders,
    "Content-Type": mimeType,
    "Content-Length": buffer.length,
    "Cache-Control": "no-cache, no-store, must-revalidate",
  });
  res.end(buffer);
}

// ── Demais Rotas ──────────────────────────────────────────
// (OpenAI, Typebot, Rotate Images, User Settings, Auth mantidas idênticas ao original)
// Para o código não ficar gigante, substituí apenas as rotas de imagem. 
// Copie a lógica abaixo para o router final:

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    return res.end();
  }

  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let path = url.pathname;

    if (path === "/share" || path === "/share/") {
      const slug = url.searchParams.get("slug");
      const format = url.searchParams.get("format");
      if (!slug) return json(res, { error: "Missing slug" }, 400);
      return await handleShare(req, res, slug, format);
    }

    // Interceptador limpo para agradar o WhatsApp
    if (path.startsWith("/preview-image")) {
      let slug = url.searchParams.get("slug");
      const match = path.match(/^\/preview-image\/([^\/]+)/);
      if (match) slug = decodeURIComponent(match[1]);
      if (!slug) return json(res, { error: "Missing slug" }, 400);
      return await handlePreviewImage(req, res, slug);
    }

    if (path === "/health") return json(res, { status: "ok" });

    const DIST_DIR = process.env.DIST_DIR || "/opt/funnel-app/dist";
    const MIME_TYPES = {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript",
      ".css": "text/css",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
      ".json": "application/json"
    };

    const isStaticAsset = path.startsWith("/assets/") || path.startsWith("/images/") || path === "/favicon.ico";
    if (isStaticAsset) {
      const safePath = nodePath.join(DIST_DIR, path);
      try {
        const data = fs.readFileSync(safePath);
        const ext = nodePath.extname(safePath).toLowerCase();
        res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream", "Cache-Control": "public, max-age=31536000" });
        return res.end(data);
      } catch {
        res.writeHead(404); return res.end("Not found");
      }
    }

    // Identificação de Bots do WhatsApp mais precisa e tolerante
    const BOT_UA = /whatsapp|facebookexternalhit|facebot|twitterbot|linkedinbot|telegrambot|discordbot/i;
    const slugMatch = path.match(/^\/([^\/]+)\/?$/);
    
    if (slugMatch && req.method === "GET") {
      const slug = decodeURIComponent(slugMatch[1]);
      const systemRoutes = ["auth", "openai-proxy", "typebot-proxy", "rotate-preview-images", "user-settings"];
      
      if (!systemRoutes.includes(slug)) {
        const ua = req.headers["user-agent"] || "";
        if (BOT_UA.test(ua)) {
          return await handleShare(req, res, slug, null);
        }
      }
    }

    // SPA Fallback
    try {
      const indexHtml = fs.readFileSync(nodePath.join(DIST_DIR, "index.html"), "utf-8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(indexHtml);
    } catch {
      res.writeHead(404); return res.end("index.html not found");
    }
  } catch (err) {
    json(res, { error: err.message }, 500);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ API server running on http://127.0.0.1:${PORT}`);
});
