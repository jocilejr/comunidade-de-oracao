import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get all preview images grouped by funnel
    const { data: images, error } = await supabase
      .from("funnel_preview_images")
      .select("id, funnel_id, data_url, position")
      .order("position", { ascending: true });

    if (error) throw error;
    if (!images || images.length === 0) {
      return new Response(
        JSON.stringify({ message: "No preview images to rotate" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Group by funnel_id
    const byFunnel: Record<string, typeof images> = {};
    for (const img of images) {
      if (!byFunnel[img.funnel_id]) byFunnel[img.funnel_id] = [];
      byFunnel[img.funnel_id].push(img);
    }

    const currentHour = new Date().getUTCHours();
    let updated = 0;

    for (const [funnelId, funnelImages] of Object.entries(byFunnel)) {
      if (funnelImages.length <= 1) continue;
      const idx = currentHour % funnelImages.length;
      const activeImage = funnelImages[idx];

      const { error: updateErr } = await supabase
        .from("funnels")
        .update({ preview_image: activeImage.data_url })
        .eq("id", funnelId);

      if (!updateErr) updated++;
    }

    return new Response(
      JSON.stringify({ message: `Rotated ${updated} funnels`, hour: currentHour }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
