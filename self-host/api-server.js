/**
 * API Server — substitui as Edge Functions do Supabase.
 * Roda em http://127.0.0.1:4000
 *
 * Endpoints:
 *   GET  /share?slug=...          → HTML com OG tags (crawlers)
 *   GET  /preview-image?slug=...  → imagem binária
 *   POST /openai-proxy            → proxy OpenAI
 *   POST /typebot-proxy           → proxy Typebot
 *   POST /rotate-preview-images   → rotação de imagens
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

// ── Helpers ───────────────────────────────────────────────
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
// Helper removed — api-server queries pool directly with WHERE user_id = $1

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
  });
}

// ── Route: /share ─────────────────────────────────────────
async function handleShare(req, res, slug, format) {
  // JSON format: return full funnel data (used by SPA on public domain)
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
    `SELECT name, slug, page_title, page_description, preview_image, bot_name, bot_avatar
     FROM funnels WHERE slug = $1 LIMIT 1`,
    [slug]
  );

  // URL canônica: domínio público com slug limpo
  const canonicalUrl = `${PUBLIC_ORIGIN}/${slug}`;
  // Redirect humanos para o SPA no dashboard
  const spaUrl = `${DASHBOARD_ORIGIN}/f/${slug}`;

  if (!rows.length) {
    res.writeHead(302, { Location: spaUrl });
    return res.end();
  }

  const funnel = rows[0];
  const title = escapeHtml(funnel.page_title || funnel.name || "Funil");
  const description = escapeHtml(funnel.page_description || "Aperte aqui e Receba");

  const v = Date.now().toString();
  // Imagem servida pelo domínio público para crawlers
  const imageUrl = funnel.preview_image
    ? `${PUBLIC_ORIGIN}/preview-image?slug=${encodeURIComponent(slug)}&v=${v}`
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
  ${imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}" />` : ""}
  ${imageUrl ? `<meta property="og:image:width" content="1200" />` : ""}
  ${imageUrl ? `<meta property="og:image:height" content="630" />` : ""}
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  ${imageUrl ? `<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />` : ""}
  <meta http-equiv="refresh" content="0;url=${escapeHtml(spaUrl)}" />
</head>
<body>
  <p>Redirecionando para <a href="${escapeHtml(spaUrl)}">${title}</a>...</p>
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
async function handlePreviewImage(req, res, slug) {
  const { rows } = await pool.query(
    `SELECT preview_image FROM funnels WHERE slug = $1 LIMIT 1`,
    [slug]
  );

  if (!rows.length || !rows[0].preview_image) {
    return json(res, { error: "No image found" }, 404);
  }

  const dataUrl = rows[0].preview_image;
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

  res.writeHead(200, {
    ...corsHeaders,
    "Content-Type": mimeType,
    "Cache-Control": "public, max-age=300, s-maxage=60",
  });
  res.end(buffer);
}

// ── Route: /openai-proxy ──────────────────────────────────
async function handleOpenaiProxy(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer "))
    return json(res, { error: "Missing authorization" }, 401);

  let userId;
  try {
    const decoded = jwt.verify(authHeader.replace("Bearer ", ""), JWT_SECRET, { algorithms: ["HS256"] });
    userId = decoded.sub;
  } catch (e) {
    return json(res, { error: "Invalid token" }, 401);
  }

  const body = JSON.parse(await readBody(req));
  const { messages, model, tools } = body;

  const { rows } = await pool.query(
    `SELECT openai_api_key FROM user_settings WHERE user_id = $1 LIMIT 1`,
    [userId]
  );

  const apiKey = rows[0]?.openai_api_key;
  if (!apiKey) return json(res, { error: "OpenAI API key not configured." }, 400);

  const payload = { model: model || "gpt-4", messages, stream: false };

  if (tools && Array.isArray(tools) && tools.length > 0) {
    payload.tools = tools
      .map((tool) => {
        if (tool.type === "function" && tool.function?.name) {
          const params = tool.function.parameters;
          if (!params || Array.isArray(params)) tool.function.parameters = { type: "object", properties: {} };
          const { code, ...cleanFn } = tool.function;
          return { type: "function", function: cleanFn };
        }
        const name = tool.name || tool.function?.name;
        if (!name) return null;
        const rawParams = tool.parameters || tool.function?.parameters;
        return {
          type: "function",
          function: {
            name,
            description: tool.description || tool.function?.description || "",
            parameters: rawParams && typeof rawParams === "object" && !Array.isArray(rawParams) ? rawParams : { type: "object", properties: {} },
          },
        };
      })
      .filter(Boolean);
    if (payload.tools.length > 0) payload.tool_choice = "auto";
    else delete payload.tools;
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  json(res, data, response.status);
}

// ── Route: /typebot-proxy ─────────────────────────────────
async function handleTypebotProxy(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer "))
    return json(res, { error: "Missing authorization" }, 401);

  let userId;
  try {
    const decoded = jwt.verify(authHeader.replace("Bearer ", ""), JWT_SECRET, { algorithms: ["HS256"] });
    userId = decoded.sub;
  } catch (e) {
    return json(res, { error: "Invalid token" }, 401);
  }

  const body = JSON.parse(await readBody(req));
  const { action, typebotId } = body;

  const { rows } = await pool.query(
    `SELECT typebot_api_token, typebot_workspace_id, typebot_base_url
     FROM user_settings WHERE user_id = $1 LIMIT 1`,
    [userId]
  );

  const settings = rows[0];
  if (!settings?.typebot_api_token) return json(res, { error: "Token do Typebot não configurado." }, 400);

  const baseUrl = (settings.typebot_base_url || "https://typebot.io").replace(/\/+$/, "");

  if (action === "list") {
    if (!settings.typebot_workspace_id) return json(res, { error: "Workspace ID do Typebot não configurado." }, 400);
    const r = await fetch(`${baseUrl}/api/v1/typebots?workspaceId=${encodeURIComponent(settings.typebot_workspace_id)}`, {
      headers: { Authorization: `Bearer ${settings.typebot_api_token}`, Accept: "application/json" },
    });
    return json(res, await r.json(), r.status);
  }

  if (action === "get" && typebotId) {
    const r = await fetch(`${baseUrl}/api/v1/typebots/${encodeURIComponent(typebotId)}`, {
      headers: { Authorization: `Bearer ${settings.typebot_api_token}`, Accept: "application/json" },
    });
    return json(res, await r.json(), r.status);
  }

  json(res, { error: "Ação inválida. Use 'list' ou 'get'." }, 400);
}

// ── Route: /rotate-preview-images ─────────────────────────
async function handleRotateImages(req, res) {
  const { rows: images } = await pool.query(
    `SELECT id, funnel_id, data_url, position FROM funnel_preview_images ORDER BY position ASC`
  );

  if (!images.length) return json(res, { message: "No preview images to rotate" });

  const byFunnel = {};
  for (const img of images) {
    if (!byFunnel[img.funnel_id]) byFunnel[img.funnel_id] = [];
    byFunnel[img.funnel_id].push(img);
  }

  const currentHour = new Date().getUTCHours();
  let updated = 0;

  for (const [funnelId, funnelImages] of Object.entries(byFunnel)) {
    if (funnelImages.length <= 1) continue;
    const idx = currentHour % funnelImages.length;
    await pool.query(`UPDATE funnels SET preview_image = $1 WHERE id = $2`, [funnelImages[idx].data_url, funnelId]);
    updated++;
  }

  json(res, { message: `Rotated ${updated} funnels`, hour: currentHour });
}

// ── Auth: signup ──────────────────────────────────────────
async function handleSignup(req, res) {
  const body = JSON.parse(await readBody(req));
  const { email, password } = body;
  if (!email || !password) return json(res, { error: "email and password required" }, 400);
  if (password.length < 8) return json(res, { error: "Password must be at least 8 characters" }, 400);

  try {
    const { rows: existing } = await pool.query("SELECT id FROM auth.users WHERE email = $1", [email]);
    if (existing.length) return json(res, { error: "User already registered" }, 400);

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      "INSERT INTO auth.users (email, encrypted_password) VALUES ($1, $2) RETURNING id, email, created_at",
      [email, hash]
    );
    const user = rows[0];
    const token = generateToken(user);
    json(res, { access_token: token, token_type: "bearer", expires_in: JWT_EXP, user: { id: user.id, email: user.email } });
  } catch (dbErr) {
    console.error("DB auth error (signup):", dbErr.message);
    return json(res, { error: "Database error - check funnel_user permissions on auth schema" }, 500);
  }
}

// ── Auth: login (token) ──────────────────────────────────
async function handleToken(req, res) {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);
  const body = JSON.parse(await readBody(req));
  const grant_type = body.grant_type || reqUrl.searchParams.get("grant_type");
  const { email, password } = body;

  if (grant_type === "refresh_token") {
    try {
      const decoded = jwt.verify(body.refresh_token || "", JWT_SECRET, { algorithms: ["HS256"] });
      const { rows } = await pool.query("SELECT id, email FROM auth.users WHERE id = $1", [decoded.sub]);
      if (!rows.length) return json(res, { error: "User not found" }, 404);
      const token = generateToken(rows[0]);
      return json(res, { access_token: token, token_type: "bearer", expires_in: JWT_EXP, user: { id: rows[0].id, email: rows[0].email } });
    } catch (e) {
      if (e.code === 'XX000' || e.severity === 'FATAL') {
        console.error("DB auth error (refresh):", e.message);
        return json(res, { error: "Database error - check funnel_user permissions on auth schema" }, 500);
      }
      return json(res, { error: "Invalid refresh token" }, 401);
    }
  }

  if (!email || !password) return json(res, { error: "email and password required" }, 400);

  try {
    const { rows } = await pool.query("SELECT id, email, encrypted_password FROM auth.users WHERE email = $1", [email]);
    if (!rows.length) return json(res, { error: "Invalid login credentials" }, 401);

    const valid = await bcrypt.compare(password, rows[0].encrypted_password);
    if (!valid) return json(res, { error: "Invalid login credentials" }, 401);

    const user = rows[0];
    const token = generateToken(user);
    json(res, { access_token: token, token_type: "bearer", expires_in: JWT_EXP, refresh_token: token, user: { id: user.id, email: user.email } });
  } catch (dbErr) {
    console.error("DB auth error (login):", dbErr.message);
    return json(res, { error: "Database error - check funnel_user permissions on auth schema" }, 500);
  }
}

// ── Auth: get user ───────────────────────────────────────
async function handleGetUser(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return json(res, { error: "Missing token" }, 401);
  try {
    const decoded = jwt.verify(authHeader.replace("Bearer ", ""), JWT_SECRET, { algorithms: ["HS256"] });
    const { rows } = await pool.query("SELECT id, email, created_at FROM auth.users WHERE id = $1", [decoded.sub]);
    if (!rows.length) return json(res, { error: "User not found" }, 404);
    json(res, { id: rows[0].id, email: rows[0].email, created_at: rows[0].created_at, role: "authenticated", aud: "authenticated" });
  } catch (e) {
    if (e.code === 'XX000' || e.severity === 'FATAL') {
      console.error("DB auth error (getUser):", e.message);
      return json(res, { error: "Database error - check funnel_user permissions on auth schema" }, 500);
    }
    json(res, { error: "Invalid token" }, 401);
  }
}

// ── Auth: logout (no-op, client just discards token) ─────
async function handleLogout(req, res) {
  json(res, {});
}

function generateToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: "authenticated", aud: "authenticated" },
    JWT_SECRET,
    { algorithm: "HS256", expiresIn: JWT_EXP }
  );
}

// ── Router ────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    return res.end();
  }

  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let path = url.pathname;

    // Compatibilidade com supabase.functions.invoke()
    if (path.startsWith('/functions/v1/')) {
      path = '/' + path.slice('/functions/v1/'.length);
    }

    // Auth endpoints (GoTrue-compatible)
    if (path === "/auth/v1/signup" && req.method === "POST") return await handleSignup(req, res);
    if (path === "/auth/v1/token" && req.method === "POST") return await handleToken(req, res);
    if (path === "/auth/v1/user" && req.method === "GET") return await handleGetUser(req, res);
    if (path === "/auth/v1/logout" && req.method === "POST") return await handleLogout(req, res);

    if (path === "/share" || path === "/share/") {
      const slug = url.searchParams.get("slug");
      const format = url.searchParams.get("format");
      if (!slug) return json(res, { error: "Missing slug" }, 400);
      return await handleShare(req, res, slug, format);
    }

    if (path === "/preview-image" || path === "/preview-image/") {
      const slug = url.searchParams.get("slug");
      if (!slug) return json(res, { error: "Missing slug" }, 400);
      return await handlePreviewImage(req, res, slug);
    }

    if (path === "/openai-proxy" && req.method === "POST") return await handleOpenaiProxy(req, res);
    if (path === "/typebot-proxy" && req.method === "POST") return await handleTypebotProxy(req, res);
    if (path === "/rotate-preview-images" && req.method === "POST") return await handleRotateImages(req, res);
    if ((path === "/user-settings" || path === "/user-settings/") && (req.method === "GET" || req.method === "POST")) return await handleUserSettings(req, res);
    if (path === "/health") return json(res, { status: "ok", timestamp: new Date().toISOString() });

    // ── Static file serving (for public domain SPA) ──────────
    const DIST_DIR = process.env.DIST_DIR || "/opt/funnel-app/dist";
    const MIME_TYPES = {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
      ".woff": "font/woff",
      ".woff2": "font/woff2",
      ".ttf": "font/ttf",
      ".mp3": "audio/mpeg",
      ".webp": "image/webp",
    };

    // Serve static assets (/assets/*, /favicon.ico, etc.)
    if (path.startsWith("/assets/") || path === "/favicon.ico" || path === "/robots.txt" || path.startsWith("/images/") || path.startsWith("/sounds/")) {
      const filePath = nodePath.join(DIST_DIR, path);
      const safePath = nodePath.resolve(filePath);
      if (!safePath.startsWith(nodePath.resolve(DIST_DIR))) return json(res, { error: "Forbidden" }, 403);
      try {
        const data = fs.readFileSync(safePath);
        const ext = nodePath.extname(safePath).toLowerCase();
        const mime = MIME_TYPES[ext] || "application/octet-stream";
        res.writeHead(200, { "Content-Type": mime, "Cache-Control": "public, max-age=31536000, immutable" });
        return res.end(data);
      } catch {
        return json(res, { error: "Not found" }, 404);
      }
    }

    // ── Public domain catch-all: /{slug} with bot detection ──
    const BOT_UA = /whatsapp|facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|telegrambot|discordbot|googlebot|bingbot|yandex|pinterest|snapchat/i;
    const slugMatch = path.match(/^\/([a-zA-Z0-9_-]+)\/?$/);
    if (slugMatch && req.method === "GET") {
      const slug = slugMatch[1];
      const ua = req.headers["user-agent"] || "";

      if (BOT_UA.test(ua)) {
        // Crawler: retornar HTML com OG tags
        return await handleShare(req, res, slug, null);
      }

      // Humano: servir index.html (SPA client-side routing)
      try {
        const indexHtml = fs.readFileSync(nodePath.join(DIST_DIR, "index.html"), "utf-8");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(indexHtml);
      } catch {
        // fallback: redirect para dashboard
        res.writeHead(302, { Location: `${DASHBOARD_ORIGIN}/f/${slug}` });
        return res.end();
      }
    }

    json(res, { error: "Not found" }, 404);
  } catch (err) {
    console.error("API Error:", err);
    json(res, { error: err.message || "Internal server error" }, 500);
  }
});

// ── Startup: DB ping + log ────────────────────────────────
async function startServer() {
  const dbTarget = `${pool.options.host || '127.0.0.1'}:${pool.options.port || 5432}/${pool.options.database || '?'}@${pool.options.user || '?'}`;
  console.log(`🔌 DB target: ${dbTarget}`);

  try {
    await pool.query("SELECT 1");
    console.log("✅ DB connection OK");
  } catch (err) {
    console.error(`❌ DB connection FAILED: ${err.message}`);
    console.error(`   Hint: verifique DB_HOST, DB_PORT, DB_USER, DB_PASS no .env`);
    console.error(`   Target: ${dbTarget}`);
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ API server running on http://127.0.0.1:${PORT}`);
    console.log(`   Public domain:    https://${PUBLIC_DOMAIN}`);
    console.log(`   Dashboard domain: https://${DASHBOARD_DOMAIN}`);
  });
}

startServer();
