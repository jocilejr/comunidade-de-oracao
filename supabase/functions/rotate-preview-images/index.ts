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

    // Get current active preview_image for each funnel
    const funnelIds = Object.keys(byFunnel);
    const { data: funnelRows } = await supabase
      .from("funnels")
      .select("id, preview_image")
      .in("id", funnelIds);

    const activeMap: Record<string, string | null> = {};
    for (const f of funnelRows || []) {
      activeMap[f.id] = f.preview_image;
    }

    let updated = 0;
    const details: any[] = [];

    for (const [funnelId, funnelImages] of Object.entries(byFunnel)) {
      if (funnelImages.length <= 1) {
        // Single image: ensure it's set
        const url = funnelImages[0].data_url;
        if (url && activeMap[funnelId] !== url) {
          await supabase.from("funnels").update({ preview_image: url }).eq("id", funnelId);
        }
        details.push({ funnelId, status: "single_image", totalImages: 1 });
        continue;
      }

      // Find current active index by comparing data_url
      const currentActive = activeMap[funnelId];
      let currentIdx = funnelImages.findIndex(img => img.data_url === currentActive);
      if (currentIdx < 0) currentIdx = 0;

      // Advance to next (round-robin)
      const nextIdx = (currentIdx + 1) % funnelImages.length;
      const nextImage = funnelImages[nextIdx];

      const url = nextImage.data_url;
      if (!url || (!url.startsWith("data:") && !url.startsWith("http"))) {
        console.warn(`Skipping invalid data_url for funnel ${funnelId}, image ${nextImage.id}`);
        details.push({ funnelId, status: "skipped", reason: "invalid data_url" });
        continue;
      }

      console.log(`Rotating funnel ${funnelId}: index ${currentIdx} → ${nextIdx}`);

      const { error: updateErr } = await supabase
        .from("funnels")
        .update({ preview_image: url })
        .eq("id", funnelId);

      if (!updateErr) updated++;
      details.push({
        funnelId,
        status: "rotated",
        totalImages: funnelImages.length,
        fromIndex: currentIdx,
        toIndex: nextIdx,
        activeImageId: nextImage.id,
      });
    }

    return new Response(
      JSON.stringify({ message: `Rotated ${updated} funnels`, details }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
