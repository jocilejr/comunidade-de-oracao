import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

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
    .select("preview_image")
    .eq("slug", slug)
    .maybeSingle();

  if (!funnel?.preview_image) {
    return new Response("No image found", { status: 404, headers: corsHeaders });
  }

  const dataUrl = funnel.preview_image as string;

  // Parse data URL: data:<mime>;base64,<data>
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    if (dataUrl.startsWith("http")) {
      return Response.redirect(dataUrl, 302);
    }
    return new Response("Invalid image format", { status: 400, headers: corsHeaders });
  }

  const mimeType = match[1];
  const base64Data = match[2];

  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return new Response(bytes, {
    headers: {
      ...corsHeaders,
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=300, s-maxage=60",
    },
  });
});
