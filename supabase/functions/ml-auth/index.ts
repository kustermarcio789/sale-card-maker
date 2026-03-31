import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const clientId = Deno.env.get("ML_CLIENT_ID");
  const clientSecret = Deno.env.get("ML_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: "ML credentials not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json();
    const {
      action,
      code,
      redirect_uri,
      state,
      connection_id,
      code_verifier,
      code_challenge,
      code_challenge_method,
    } = body;

    // Generate OAuth URL
    if (action === "get_auth_url") {
      if (!redirect_uri || !state) {
        return new Response(JSON.stringify({ error: "redirect_uri and state are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const authParams = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri,
        state,
      });

      if (code_challenge) {
        authParams.set("code_challenge", code_challenge);
        authParams.set("code_challenge_method", code_challenge_method || "S256");
      }

      const authUrl = `https://auth.mercadolivre.com.br/authorization?${authParams.toString()}`;
      return new Response(JSON.stringify({ url: authUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Exchange code for tokens
    if (action === "exchange_code") {
      if (!code || !redirect_uri) {
        return new Response(JSON.stringify({ error: "code and redirect_uri are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const tokenBody = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri,
      });

      if (code_verifier) {
        tokenBody.set("code_verifier", code_verifier);
      }

      const tokenRes = await fetch("https://api.mercadolibre.com/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: tokenBody.toString(),
      });

      if (!tokenRes.ok) {
        const errBody = await tokenRes.text();
        console.error("ML token exchange failed:", tokenRes.status, errBody);
        return new Response(JSON.stringify({ error: "Token exchange failed", details: errBody }), {
          status: tokenRes.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const tokenData = await tokenRes.json();
      const { access_token, refresh_token, expires_in, user_id } = tokenData;

      // Fetch seller info
      const userRes = await fetch(`https://api.mercadolibre.com/users/${user_id}`, {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      const userData = userRes.ok ? await userRes.json() : { nickname: null };

      const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

      // Upsert connection
      const { data, error } = await supabase
        .from("ml_connections")
        .upsert(
          {
            seller_id: String(user_id),
            seller_nickname: userData.nickname,
            access_token,
            refresh_token,
            token_expires_at: expiresAt,
          },
          { onConflict: "seller_id" }
        )
        .select()
        .single();

      if (error) {
        console.error("DB upsert error:", error);
        return new Response(JSON.stringify({ error: "Failed to save connection" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          connection: {
            id: data.id,
            seller_id: data.seller_id,
            seller_nickname: data.seller_nickname,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Refresh token
    if (action === "refresh_token") {
      if (!connection_id) {
        return new Response(JSON.stringify({ error: "connection_id is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: conn } = await supabase
        .from("ml_connections")
        .select("*")
        .eq("id", connection_id)
        .single();

      if (!conn) {
        return new Response(JSON.stringify({ error: "Connection not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const tokenRes = await fetch("https://api.mercadolibre.com/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: conn.refresh_token,
        }).toString(),
      });

      if (!tokenRes.ok) {
        const errBody = await tokenRes.text();
        return new Response(JSON.stringify({ error: "Refresh failed", details: errBody }), {
          status: tokenRes.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const tokenData = await tokenRes.json();
      const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

      await supabase
        .from("ml_connections")
        .update({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_expires_at: expiresAt,
        })
        .eq("id", connection_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get connection status
    if (action === "status") {
      const { data: connections } = await supabase
        .from("ml_connections")
        .select("id, seller_id, seller_nickname, last_sync_at, token_expires_at, created_at")
        .limit(1);

      return new Response(
        JSON.stringify({ connection: connections?.[0] ?? null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ml-auth error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
