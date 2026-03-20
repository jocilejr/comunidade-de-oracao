import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const BOT_UA_REGEX =
  /whatsapp|facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|telegrambot|discordbot|googlebot|bingbot|yandex|pinterest|snapchat/i;

function isCrawler(ua: string | null): boolean {
  return !!ua && BOT_UA_REGEX.test(ua);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");

  if (!slug) {
    return new Response("Missing slug", { status: 400, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: funnel } = await supabase
    .from("funnels")
    .select("name, slug, page_title, page_description, preview_image, bot_name, bot_avatar")
    .eq("slug", slug)
    .maybeSingle();

  const appOrigin = Deno.env.get("APP_ORIGIN") || "https://comunidade-de-oracao.lovable.app";
  const redirectUrl = `${appOrigin}/${slug}`;

  if (!funnel) {
    return Response.redirect(redirectUrl, 302);
  }

  const ua = req.headers.get("user-agent");

  // For regular browsers, redirect immediately
  if (!isCrawler(ua)) {
    return Response.redirect(redirectUrl, 302);
  }

  // For crawlers: serve full HTML with OG tags, NO redirect
  const title = escapeHtml(funnel.page_title || funnel.name || "Funil");
  const description = escapeHtml(funnel.page_description || "Aperte aqui e Receba");

  // Use cache-buster v param for image URL too
  const v = url.searchParams.get("v") || Date.now().toString();
  const imageUrl = funnel.preview_image
    ? `${supabaseUrl}/functions/v1/preview-image?slug=${encodeURIComponent(slug)}&v=${v}`
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
  ${imageUrl ? `<meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}" />` : ""}
  ${imageUrl ? `<meta property="og:image:type" content="image/png" />` : ""}
  <meta property="og:url" content="${escapeHtml(redirectUrl)}" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  ${imageUrl ? `<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />` : ""}
</head>
<body>
  <p>Redirecionando para <a href="${escapeHtml(redirectUrl)}">${title}</a>...</p>
</body>
</html>`;

  return new Response(html, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
    },
  });
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
