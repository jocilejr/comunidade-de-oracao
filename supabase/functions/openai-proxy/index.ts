import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, model, tools, userId } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "User ID not provided." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the user's OpenAI API key from user_settings using service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: settings, error: settingsError } = await supabase
      .from("user_settings")
      .select("openai_api_key")
      .eq("user_id", userId)
      .maybeSingle();

    if (settingsError) {
      console.error("Error fetching settings:", settingsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch API key settings." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = settings?.openai_api_key;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured. Go to Admin > Settings to add your key." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: Record<string, unknown> = {
      model: model || "gpt-4",
      messages,
      stream: false,
    };

    if (tools && Array.isArray(tools) && tools.length > 0) {
      // Normalize all tools to valid OpenAI format (do NOT skip code tools — client handles execution)
      body.tools = tools
        .map((tool: any) => {
          // Already valid OpenAI format
          if (tool.type === "function" && tool.function?.name) {
            const params = tool.function.parameters;
            if (!params || Array.isArray(params)) {
              tool.function.parameters = { type: "object", properties: {} };
            }
            // Strip non-OpenAI fields
            const { code, ...cleanFn } = tool.function;
            return { type: "function", function: cleanFn };
          }
          // Typebot format or other: normalize
          const name = tool.name || tool.function?.name;
          if (!name) return null;
          const rawParams = tool.parameters || tool.function?.parameters;
          return {
            type: "function",
            function: {
              name,
              description: tool.description || tool.function?.description || "",
              parameters: (rawParams && typeof rawParams === "object" && !Array.isArray(rawParams))
                ? rawParams
                : { type: "object", properties: {} },
            },
          };
        })
        .filter(Boolean);

      if ((body.tools as any[]).length > 0) {
        body.tool_choice = "auto";
      } else {
        delete body.tools;
      }
    }

    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI API error:", response.status, errText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 401) {
        return new Response(
          JSON.stringify({ error: "Invalid API key. Check your OpenAI key in Settings." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "OpenAI API error", details: errText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("openai-proxy error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
