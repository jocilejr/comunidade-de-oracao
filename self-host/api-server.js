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
    let rows = [];
    try {
      const result = await pool.query(
        `SELECT id, slug, name, created_at, flow, bot_name, bot_avatar,
                preview_image, page_title, page_description, user_id,
                meta_pixel_id, meta_capi_token
         FROM funnels WHERE slug = $1 LIMIT 1`,
        [slug]
      );
      rows = result.rows;
    } catch (err) {
      // Backward compatibility for VPS databases that still don't have legacy pixel columns on funnels
      if (err?.code !== "42703") throw err;
      const legacyResult = await pool.query(
        `SELECT id, slug, name, created_at, flow, bot_name, bot_avatar,
                preview_image, page_title, page_description, user_id
         FROM funnels WHERE slug = $1 LIMIT 1`,
        [slug]
      );
      rows = legacyResult.rows.map((row) => ({
        ...row,
        meta_pixel_id: null,
        meta_capi_token: null,
      }));
    }

    if (!rows.length) return json(res, { error: "Not found" }, 404);

    const funnel = rows[0];

    // Fetch global pixels for the funnel owner
    let globalPixels = [];
    try {
      const { rows: pixelRows } = await pool.query(
        `SELECT id, pixel_id, capi_token FROM user_pixels WHERE user_id = $1 ORDER BY created_at ASC`,
        [funnel.user_id]
      );
      globalPixels = pixelRows.map(r => ({ id: r.id, pixelId: r.pixel_id, capiToken: r.capi_token || '' }));
    } catch (_) { /* table may not exist on older VPS installs */ }

    funnel.global_pixels = globalPixels;
    return json(res, funnel);
  }

  const { rows } = await pool.query(
    `SELECT id, name, slug, page_title, page_description, preview_image, bot_name, bot_avatar
     FROM funnels WHERE slug = $1 LIMIT 1`,
    [slug]
  );

  // URL canônica: domínio público com slug limpo
  const canonicalUrl = `${PUBLIC_ORIGIN}/${slug}`;
  const spaUrl = `${DASHBOARD_ORIGIN}/${slug}`;

  if (!rows.length) {
    res.writeHead(302, { Location: spaUrl });
    return res.end();
  }

  const funnel = rows[0];
  const title = escapeHtml(funnel.page_title || funnel.name || "Funil");
  const description = escapeHtml(funnel.page_description || "Aperte aqui e Receba");

  // Fallback: se preview_image está vazio, buscar da galeria
  let previewUrl = funnel.preview_image;
  if (!previewUrl) {
    const { rows: fallbackImgs } = await pool.query(
      `SELECT data_url FROM funnel_preview_images WHERE funnel_id = $1 ORDER BY position ASC LIMIT 1`,
      [funnel.id || funnel.slug]
    );
    if (fallbackImgs.length) previewUrl = fallbackImgs[0].data_url;
  }

  const v = Date.now().toString();
  // Imagem servida pelo domínio público para crawlers (Com .jpg falso no final para o WhatsApp)
  const imageUrl = previewUrl
    ? `${PUBLIC_ORIGIN}/preview-image?slug=${encodeURIComponent(slug)}&v=${v}&file=banner.jpg`
    : "";

  // Detectar MIME real para og:image:type
  let ogImageType = "image/png";
  if (previewUrl) {
    const mimeMatch = previewUrl.match(/^data:([^;]+);/);
    if (mimeMatch) ogImageType = mimeMatch[1];
    else if (previewUrl.match(/\.jpe?g/i)) ogImageType = "image/jpeg";
    else if (previewUrl.match(/\.webp/i)) ogImageType = "image/webp";
  }

  // Forçamos o card gigante removendo a lógica dinâmica e usando tags explícitas
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
  <meta property="og:image:type" content="${ogImageType}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  ` : ""}
  
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  ${imageUrl ? `<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />` : ""}
  
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

// ── Robust share: OG tags injected into SPA index.html — zero redirect ──
async function handleShareRobust(req, res, slug) {
  const DIST_DIR = process.env.DIST_DIR || "/opt/funnel-app/dist";
  let indexHtml;
  try {
    indexHtml = fs.readFileSync(nodePath.join(DIST_DIR, "index.html"), "utf-8");
  } catch {
    res.writeHead(500, { "Content-Type": "text/plain" });
    return res.end("index.html not found");
  }

  // Fetch funnel + meta in one query
  const { rows } = await pool.query(
    `SELECT id, name, slug, page_title, page_description, preview_image, bot_name, bot_avatar,
            flow, user_id, meta_pixel_id, meta_capi_token, created_at
     FROM funnels WHERE slug = $1 LIMIT 1`,
    [slug]
  );

  if (!rows.length) {
    res.writeHead(200, {
      ...corsHeaders,
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    return res.end(indexHtml);
  }

  const funnel = rows[0];
  const title = escapeHtml(funnel.page_title || funnel.name || "Funil");
  const description = escapeHtml(funnel.page_description || "Aperte aqui e Receba");
  const canonicalUrl = `${PUBLIC_ORIGIN}/${slug}`;

  // Fetch global pixels for this funnel owner
  let globalPixels = [];
  try {
    const { rows: pixelRows } = await pool.query(
      `SELECT id, pixel_id, capi_token FROM user_pixels WHERE user_id = $1 ORDER BY created_at ASC`,
      [funnel.user_id]
    );
    globalPixels = pixelRows.map(r => ({ id: r.id, pixelId: r.pixel_id, capiToken: r.capi_token || "" }));
  } catch (_) { /* ignore if table doesn't exist */ }

  // Fallback preview image from gallery if needed
  let previewUrl = funnel.preview_image;
  if (!previewUrl) {
    const { rows: fallbackImgs } = await pool.query(
      `SELECT data_url FROM funnel_preview_images WHERE funnel_id = $1 ORDER BY position ASC LIMIT 1`,
      [funnel.id]
    );
    if (fallbackImgs.length) previewUrl = fallbackImgs[0].data_url;
  }

  const v = Date.now().toString();
  const imageUrl = previewUrl
    ? `${PUBLIC_ORIGIN}/preview-image?slug=${encodeURIComponent(slug)}&v=${v}&file=banner.jpg`
    : "";

  let ogImageType = "image/png";
  if (previewUrl) {
    const mimeMatch = previewUrl.match(/^data:([^;]+);/);
    if (mimeMatch) ogImageType = mimeMatch[1];
    else if (previewUrl.match(/\.jpe?g/i)) ogImageType = "image/jpeg";
    else if (previewUrl.match(/\.webp/i)) ogImageType = "image/webp";
  }

  // OG meta tags
  const ogTags = `
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  ${imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}" />
  <meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}" />
  <meta property="og:image:type" content="${ogImageType}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />` : ""}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  ${imageUrl ? `<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />` : ""}`;

  // Build prefetched funnel object (same shape as getFunnelBySlug return)
  const prefetchedFunnel = {
    id: funnel.id,
    slug: funnel.slug,
    name: funnel.name,
    uploadedAt: funnel.created_at,
    flow: funnel.flow,
    botName: funnel.bot_name || "",
    botAvatar: funnel.bot_avatar || "",
    previewImage: previewUrl || "",
    pageTitle: funnel.page_title || "",
    pageDescription: funnel.page_description || "",
    userId: funnel.user_id,
    metaPixelId: funnel.meta_pixel_id || "",
    metaCapiToken: funnel.meta_capi_token || "",
    globalPixels,
  };

  // Inline script — available before any React JS runs
  const prefetchScript = `<script id="__prefetched_funnel__">window.__PREFETCHED_FUNNEL__=${JSON.stringify(prefetchedFunnel)};</script>`;

  let html = indexHtml
    .replace(/<meta\s+(property="og:|name="twitter:)[^>]*>/gi, "")
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${description}">`)
    .replace("</head>", `${ogTags}\n${prefetchScript}\n</head>`);

  res.writeHead(200, {
    ...corsHeaders,
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "X-Funnel-Served-By": "api-server",
    "X-Funnel-Route": "robust-og-spa",
  });
  res.end(html);
}



const previewCache = new Map(); // slug -> { buffer, mime, ts }
const PREVIEW_CACHE_TTL = 5 * 60 * 1000; // 5 min

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

  const { rows } = await pool.query(
    `SELECT preview_image FROM funnels WHERE slug = $1 LIMIT 1`,
    [slug]
  );

  // Fallback: if preview_image is empty, try gallery
  let dataUrl = rows[0]?.preview_image;
  if (!dataUrl && rows.length) {
    const { rows: fbRows } = await pool.query(
      `SELECT f.id FROM funnels f WHERE f.slug = $1 LIMIT 1`, [slug]
    );
    if (fbRows.length) {
      const { rows: imgRows } = await pool.query(
        `SELECT data_url FROM funnel_preview_images WHERE funnel_id = $1 ORDER BY position ASC LIMIT 1`,
        [fbRows[0].id]
      );
      if (imgRows.length) dataUrl = imgRows[0].data_url;
    }
  }

  if (!dataUrl) {
    return json(res, { error: "No image found" }, 404);
  }

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

  // Cache it
  previewCache.set(slug, { buffer, mime: mimeType, ts: now });
  // Evict old entries
  if (previewCache.size > 200) {
    for (const [k, v] of previewCache) {
      if (now - v.ts > PREVIEW_CACHE_TTL) previewCache.delete(k);
    }
  }

  res.writeHead(200, {
    ...corsHeaders,
    "Content-Type": mimeType,
    "Content-Length": buffer.length,
    "Cache-Control": "no-cache, no-store, must-revalidate",
  });
  res.end(buffer);
}

// ── Route: /openai-proxy ──────────────────────────────────
async function handleOpenaiProxy(req, res) {
  const authHeader = req.headers.authorization;

  const body = JSON.parse(await readBody(req));
  const { messages, model, tools } = body;

  // Try JWT first; fall back to body.userId (public funnels use anon key)
  let userId;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const decoded = jwt.verify(authHeader.replace("Bearer ", ""), JWT_SECRET, { algorithms: ["HS256"] });
      if (decoded.sub) userId = decoded.sub;
    } catch (_) { /* JWT invalid — try body fallback */ }
  }
  if (!userId && body.userId) userId = body.userId;
  if (!userId) return json(res, { error: "Missing user identification" }, 401);

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

// ── Route: /user-settings ─────────────────────────────────
async function handleUserSettings(req, res) {
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

  if (req.method === "GET") {
    const { rows } = await pool.query(
      `SELECT openai_api_key, typebot_api_token, typebot_workspace_id, typebot_base_url
       FROM user_settings WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    if (!rows.length) return json(res, { status: "empty" });
    return json(res, {
      status: "ok",
      data: {
        openai_api_key: rows[0].openai_api_key || "",
        typebot_api_token: rows[0].typebot_api_token || "",
        typebot_workspace_id: rows[0].typebot_workspace_id || "",
        typebot_base_url: rows[0].typebot_base_url || "",
      },
    });
  }

  // POST: upsert settings
  const body = JSON.parse(await readBody(req));
  const fields = {};
  if (body.openai_api_key !== undefined) fields.openai_api_key = body.openai_api_key;
  if (body.typebot_api_token !== undefined) fields.typebot_api_token = body.typebot_api_token;
  if (body.typebot_workspace_id !== undefined) fields.typebot_workspace_id = body.typebot_workspace_id;
  if (body.typebot_base_url !== undefined) fields.typebot_base_url = body.typebot_base_url;

  const { rows: existing } = await pool.query(
    `SELECT id FROM user_settings WHERE user_id = $1 LIMIT 1`,
    [userId]
  );

  if (existing.length) {
    const setClauses = [];
    const values = [userId];
    let i = 2;
    for (const [key, val] of Object.entries(fields)) {
      setClauses.push(`${key} = $${i}`);
      values.push(val);
      i++;
    }
    if (setClauses.length > 0) {
      await pool.query(
        `UPDATE user_settings SET ${setClauses.join(", ")}, updated_at = now() WHERE user_id = $1`,
        values
      );
    }
  } else {
    const cols = ["user_id", ...Object.keys(fields)];
    const vals = [userId, ...Object.values(fields)];
    const placeholders = vals.map((_, idx) => `$${idx + 1}`).join(", ");
    await pool.query(
      `INSERT INTO user_settings (${cols.join(", ")}) VALUES (${placeholders})`,
      vals
    );
  }

  return json(res, { status: "ok" });
}

// ── Route: /rotate-preview-images (round-robin) ──────────
async function handleRotateImages(req, res) {
  const { rows: images } = await pool.query(
    `SELECT id, funnel_id, data_url, position FROM funnel_preview_images ORDER BY funnel_id, position ASC`
  );

  if (!images.length) return json(res, { message: "No preview images to rotate" });

  const byFunnel = {};
  for (const img of images) {
    if (!byFunnel[img.funnel_id]) byFunnel[img.funnel_id] = [];
    byFunnel[img.funnel_id].push(img);
  }

  // Get current active preview_image for each funnel
  const funnelIds = Object.keys(byFunnel);
  const { rows: funnelRows } = await pool.query(
    `SELECT id, preview_image FROM funnels WHERE id = ANY($1)`,
    [funnelIds]
  );
  const activeMap = {};
  for (const f of funnelRows) activeMap[f.id] = f.preview_image;

  let updated = 0;
  const details = [];

  for (const [funnelId, funnelImages] of Object.entries(byFunnel)) {
    if (funnelImages.length <= 1) {
      // Single image: just ensure it's set
      const url = funnelImages[0].data_url;
      if (url && activeMap[funnelId] !== url) {
        await pool.query(`UPDATE funnels SET preview_image = $1 WHERE id = $2`, [url, funnelId]);
        previewCache.delete(funnelId); // invalidate cache
      }
      details.push({ funnelId, status: "single_image", totalImages: 1 });
      continue;
    }

    // Find current active index by comparing data_url
    const currentActive = activeMap[funnelId];
    let currentIdx = funnelImages.findIndex(img => img.data_url === currentActive);
    if (currentIdx < 0) currentIdx = 0; // fallback to first

    // Advance to next (round-robin)
    const nextIdx = (currentIdx + 1) % funnelImages.length;
    const nextImage = funnelImages[nextIdx];

    const url = nextImage.data_url;
    if (!url || (!url.startsWith("data:") && !url.startsWith("http"))) {
      details.push({ funnelId, status: "skipped", reason: "invalid data_url", imageId: nextImage.id });
      continue;
    }

    await pool.query(`UPDATE funnels SET preview_image = $1 WHERE id = $2`, [url, funnelId]);
    // Invalidate preview cache for all slugs of this funnel
    for (const [k] of previewCache) previewCache.delete(k);
    updated++;
    details.push({
      funnelId,
      status: "rotated",
      totalImages: funnelImages.length,
      fromIndex: currentIdx,
      toIndex: nextIdx,
      activeImageId: nextImage.id,
    });
  }

  console.log(`[rotate] updated=${updated}/${funnelIds.length} funnels`);
  json(res, { message: `Rotated ${updated} funnels`, details });
}

// ── Auth: signup ──────────────────────────────────────────
// ── Route: /user-pixels ───────────────────────────────────
async function handleUserPixels(req, res) {
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

  // Ensure table exists (auto-create for VPS installs that haven't run latest migration)
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS public.user_pixels (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL,
      pixel_id text NOT NULL,
      capi_token text DEFAULT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  } catch (_) { /* ignore if already exists */ }

  if (req.method === "GET") {
    const { rows } = await pool.query(
      `SELECT id, pixel_id, capi_token FROM user_pixels WHERE user_id = $1 ORDER BY created_at ASC`,
      [userId]
    );
    return json(res, { data: rows.map(r => ({ id: r.id, pixelId: r.pixel_id, capiToken: r.capi_token || '' })) });
  }

  if (req.method === "POST") {
    const body = JSON.parse(await readBody(req));
    const { pixelId, capiToken, id: updateId } = body;
    if (!pixelId) return json(res, { error: "pixelId is required" }, 400);

    if (updateId) {
      // Update existing
      await pool.query(
        `UPDATE user_pixels SET pixel_id = $1, capi_token = $2 WHERE id = $3 AND user_id = $4`,
        [pixelId, capiToken || null, updateId, userId]
      );
    } else {
      // Insert new
      await pool.query(
        `INSERT INTO user_pixels (user_id, pixel_id, capi_token) VALUES ($1, $2, $3)`,
        [userId, pixelId, capiToken || null]
      );
    }
    return json(res, { ok: true });
  }

  if (req.method === "DELETE") {
    const body = JSON.parse(await readBody(req));
    const { id: deleteId } = body;
    if (!deleteId) return json(res, { error: "id is required" }, 400);
    await pool.query(`DELETE FROM user_pixels WHERE id = $1 AND user_id = $2`, [deleteId, userId]);
    return json(res, { ok: true });
  }

  return json(res, { error: "Method not allowed" }, 405);
}

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

// ── Session log: receive session/event data from public domain ──
async function handleSessionLog(req, res) {
  const rawBody = await readBody(req);
  let body = {};
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return json(res, { error: "Invalid JSON body" }, 400);
  }

  const { action } = body;

  try {
    if (action === "create_session") {
      const { funnel_id } = body;
      if (!funnel_id) return json(res, { error: "funnel_id required" }, 400);
      const { rows } = await pool.query(
        `INSERT INTO funnel_sessions (funnel_id) VALUES ($1) RETURNING id`,
        [funnel_id]
      );
      return json(res, { id: rows[0].id });
    }

    if (action === "log_event") {
      const { session_id, event_type, block_id, group_title, content, metadata } = body;
      if (!session_id || !event_type) return json(res, { error: "session_id and event_type required" }, 400);
      await pool.query(
        `INSERT INTO funnel_session_events (session_id, event_type, block_id, group_title, content, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [session_id, event_type, block_id || null, group_title || null, content || null, JSON.stringify(metadata || {})]
      );
      return json(res, { ok: true });
    }

    if (action === "update_session") {
      const { session_id, variables, last_group_title, ended_at, completed, last_block_id } = body;
      if (!session_id) return json(res, { error: "session_id required" }, 400);
      const sets = [];
      const params = [];
      let idx = 1;

      if (variables !== undefined) { sets.push(`variables = $${idx}::jsonb`); params.push(JSON.stringify(variables)); idx++; }
      if (last_group_title !== undefined) { sets.push(`last_group_title = $${idx}`); params.push(last_group_title); idx++; }
      if (last_block_id !== undefined) { sets.push(`last_block_id = $${idx}`); params.push(last_block_id); idx++; }
      if (ended_at !== undefined) { sets.push(`ended_at = $${idx}`); params.push(ended_at); idx++; }
      if (completed !== undefined) { sets.push(`completed = $${idx}`); params.push(completed); idx++; }

      if (sets.length === 0) return json(res, { ok: true });
      params.push(session_id);
      await pool.query(`UPDATE funnel_sessions SET ${sets.join(", ")} WHERE id = $${idx}`, params);
      return json(res, { ok: true });
    }

    return json(res, { error: "Unknown action" }, 400);
  } catch (err) {
    console.error("[session-log] Error:", err.message);
    return json(res, { error: err.message }, 500);
  }
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
    if (path === "/rotate-preview-images" && (req.method === "POST" || req.method === "GET")) return await handleRotateImages(req, res);
    if ((path === "/user-settings" || path === "/user-settings/") && (req.method === "GET" || req.method === "POST")) return await handleUserSettings(req, res);
    if ((path === "/session-log" || path === "/session-log/") && req.method === "POST") return await handleSessionLog(req, res);
    if ((path === "/user-pixels" || path === "/user-pixels/") && (req.method === "GET" || req.method === "POST" || req.method === "DELETE")) return await handleUserPixels(req, res);
    if (path === "/health") return json(res, { status: "ok", timestamp: new Date().toISOString() });

    // ── Diagnostic endpoint: prove which stack is responding ──
    if (path === "/__funnel_diag") {
      const DIST_DIR_DIAG = process.env.DIST_DIR || "/opt/funnel-app/dist";
      const distExists = fs.existsSync(DIST_DIR_DIAG);
      const indexExists = distExists && fs.existsSync(nodePath.join(DIST_DIR_DIAG, "index.html"));
      let assetFiles = [];
      try { assetFiles = fs.readdirSync(nodePath.join(DIST_DIR_DIAG, "assets")).filter(f => f.endsWith(".js")); } catch { }
      res.writeHead(200, {
        "Content-Type": "application/json",
        "X-Funnel-Served-By": "api-server",
        "X-Funnel-Route": "diag",
      });
      return res.end(JSON.stringify({
        servedBy: "api-server",
        timestamp: new Date().toISOString(),
        publicDomain: PUBLIC_DOMAIN,
        dashboardDomain: DASHBOARD_DOMAIN,
        distDir: DIST_DIR_DIAG,
        distExists,
        indexExists,
        jsAssets: assetFiles,
        pid: process.pid,
        uptime: process.uptime(),
      }, null, 2));
    }

    // ── Static file serving (dashboard + public domain) ──────
    const DIST_DIR = process.env.DIST_DIR || "/opt/funnel-app/dist";
    const MIME_TYPES = {
      ".html": "text/html; charset=utf-8",
      ".js": "application/javascript",
      ".mjs": "application/javascript",
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
      ".map": "application/json",
    };

    // Known static asset paths — serve file or hard 404 (NEVER index.html)
    const isStaticAsset = path.startsWith("/assets/") || path === "/favicon.ico" || path === "/robots.txt" || path.startsWith("/images/") || path.startsWith("/sounds/");
    if (isStaticAsset) {
      const filePath = nodePath.join(DIST_DIR, path);
      const safePath = nodePath.resolve(filePath);
      if (!safePath.startsWith(nodePath.resolve(DIST_DIR))) {
        res.writeHead(403, { "Content-Type": "text/plain", "X-Funnel-Served-By": "api-server", "X-Funnel-Route": "forbidden" });
        return res.end("Forbidden");
      }
      try {
        const data = fs.readFileSync(safePath);
        const ext = nodePath.extname(safePath).toLowerCase();
        const mime = MIME_TYPES[ext] || "application/octet-stream";
        res.writeHead(200, {
          "Content-Type": mime,
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Funnel-Served-By": "api-server",
          "X-Funnel-Route": "static-asset",
        });
        return res.end(data);
      } catch {
        // CRITICAL: return 404 with text/plain, never fallback to index.html for assets
        console.warn(`[404] Static asset not found: ${path}`);
        res.writeHead(404, { "Content-Type": "text/plain", "X-Funnel-Served-By": "api-server", "X-Funnel-Route": "static-asset-404" });
        return res.end("Not found");
      }
    }

    // ── File with known extension → try serve or 404 (never SPA fallback) ──
    const ext = nodePath.extname(path).toLowerCase();
    if (ext && MIME_TYPES[ext] && ext !== ".html") {
      const filePath = nodePath.join(DIST_DIR, path);
      const safePath = nodePath.resolve(filePath);
      if (!safePath.startsWith(nodePath.resolve(DIST_DIR))) {
        res.writeHead(403, { "Content-Type": "text/plain", "X-Funnel-Served-By": "api-server", "X-Funnel-Route": "forbidden" });
        return res.end("Forbidden");
      }
      try {
        const data = fs.readFileSync(safePath);
        const mime = MIME_TYPES[ext] || "application/octet-stream";
        res.writeHead(200, {
          "Content-Type": mime,
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Funnel-Served-By": "api-server",
          "X-Funnel-Route": "static-ext",
        });
        return res.end(data);
      } catch {
        console.warn(`[404] File not found: ${path}`);
        res.writeHead(404, { "Content-Type": "text/plain", "X-Funnel-Served-By": "api-server", "X-Funnel-Route": "static-ext-404" });
        return res.end("Not found");
      }
    }

    // ── Public domain catch-all: /{slug} — ROBUST MODE ──
    // Serves the SPA index.html with OG tags injected. Zero redirect.
    const RESERVED = /^(login|admin|assets|api|rest|auth|functions|health|__funnel_diag|share|preview-image|rotate-preview-images|openai-proxy|typebot-proxy|user-settings|session-log)$/i;
    const slugMatch = path.match(/^\/([a-zA-Z0-9_-]+)\/?$/);
    if (slugMatch && !RESERVED.test(slugMatch[1]) && req.method === "GET") {
      const slug = slugMatch[1];
      console.log(`[SHARE] Serving OG HTML for slug="${slug}", path="${path}"`);
      return await handleShareRobust(req, res, slug);
    }

    // ── SPA fallback: serve index.html for navigation routes ──
    // This covers: /, /login, /admin, /f/:slug, /:slug (humans)
    try {
      const indexHtml = fs.readFileSync(nodePath.join(DIST_DIR, "index.html"), "utf-8");
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Funnel-Served-By": "api-server",
        "X-Funnel-Route": "spa-fallback",
      });
      return res.end(indexHtml);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain", "X-Funnel-Served-By": "api-server", "X-Funnel-Route": "spa-missing" });
      return res.end("index.html not found — check DIST_DIR");
    }
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
