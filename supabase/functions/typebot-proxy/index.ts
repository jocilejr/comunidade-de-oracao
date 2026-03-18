import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Validate JWT
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's Typebot credentials
    const { data: settings, error: settingsError } = await supabase
      .from("user_settings")
      .select("typebot_api_token, typebot_workspace_id, typebot_base_url")
      .eq("user_id", user.id)
      .maybeSingle();

    if (settingsError || !settings?.typebot_api_token) {
      return new Response(
        JSON.stringify({ error: "Token do Typebot não configurado. Vá em Configurações." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { typebot_api_token, typebot_workspace_id } = settings;
    const body = await req.json();
    const { action, typebotId } = body;

    if (action === "list") {
      if (!typebot_workspace_id) {
        return new Response(
          JSON.stringify({ error: "Workspace ID do Typebot não configurado." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const res = await fetch(
        `https://typebot.io/api/v1/typebots?workspaceId=${encodeURIComponent(typebot_workspace_id)}`,
        {
          headers: {
            Authorization: `Bearer ${typebot_api_token}`,
            Accept: "application/json",
          },
        }
      );

      if (!res.ok) {
        const text = await res.text();
        return new Response(
          JSON.stringify({ error: `Typebot API error: ${res.status} - ${text}` }),
          { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get" && typebotId) {
      const res = await fetch(
        `https://typebot.io/api/v1/typebots/${encodeURIComponent(typebotId)}`,
        {
          headers: {
            Authorization: `Bearer ${typebot_api_token}`,
            Accept: "application/json",
          },
        }
      );

      if (!res.ok) {
        const text = await res.text();
        return new Response(
          JSON.stringify({ error: `Typebot API error: ${res.status} - ${text}` }),
          { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Ação inválida. Use 'list' ou 'get'." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
