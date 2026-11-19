import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("PROJECT_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_DRIVE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_DRIVE_CLIENT_SECRET")!;
const REDIRECT_URI = "https://mzzujnceyspsvlbllzst.supabase.co/functions/v1/google-drive-oauth";
const APP_RETURN_URL = "https://stellebelle-design.github.io/reframe-life-preview/client-hub.html";

const cors = {
  "Access-Control-Allow-Origin": "https://stellebelle-design.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(message: string, status = 400) {
  return new Response(message, { status, headers: { ...cors, "Content-Type": "text/plain; charset=utf-8" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return reply("Google Drive connection is not configured yet.", 503);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (req.method === "POST") {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return reply("Sign-in required.", 401);

    const { data: userData, error: userError } = await admin.auth.getUser(jwt);
    if (userError || !userData.user) return reply("Sign-in required.", 401);

    const { data: adminRow, error: adminError } = await admin
      .from("admin_users").select("user_id").eq("user_id", userData.user.id).maybeSingle();
    if (adminError || !adminRow) return reply("Administrator access required.", 403);

    const state = crypto.randomUUID() + crypto.randomUUID();
    const { error: stateError } = await admin.from("google_drive_oauth_states").insert({
      state,
      user_id: userData.user.id,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (stateError) {
      console.error("Could not create Google OAuth state:", stateError);
      return reply("Could not start the secure Google connection.", 500);
    }

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets",
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return Response.json({ authorization_url: "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString() }, { headers: cors });
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const googleError = url.searchParams.get("error");
    if (googleError) return Response.redirect(APP_RETURN_URL + "?google_drive=denied", 303);
    if (!code || !state) return reply("Missing Google authorisation details.");

    const { data: stateRow, error: stateError } = await admin
      .from("google_drive_oauth_states").select("state,user_id,expires_at")
      .eq("state", state).maybeSingle();
    if (stateError || !stateRow || new Date(stateRow.expires_at).getTime() < Date.now()) {
      return reply("This Google sign-in request has expired. Please try again.", 400);
    }
    await admin.from("google_drive_oauth_states").delete().eq("state", state);

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || !tokens.refresh_token) {
      console.error("Google token exchange failed:", tokens.error || tokenResponse.status);
      return reply("Google did not provide ongoing access. Please try connecting again and approve the requested access.", 400);
    }

    const { error: saveError } = await admin.from("google_drive_connections").upsert({
      id: 1,
      connected_by: stateRow.user_id,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      access_token_expires_at: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString(),
      scope: tokens.scope || "",
      connected_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (saveError) {
      console.error("Could not save Google connection:", saveError);
      return reply("Google connected, but Reframe Life could not save the connection. Please contact support.", 500);
    }
    return Response.redirect(APP_RETURN_URL + "?google_drive=connected", 303);
  }

  return reply("Method not allowed.", 405);
});
