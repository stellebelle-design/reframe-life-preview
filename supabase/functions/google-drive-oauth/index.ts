import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("PROJECT_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_DRIVE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_DRIVE_CLIENT_SECRET")!;
const GOOGLE_PICKER_API_KEY = Deno.env.get("GOOGLE_PICKER_API_KEY")!;
const GOOGLE_CLOUD_PROJECT_NUMBER = Deno.env.get("GOOGLE_CLOUD_PROJECT_NUMBER")!;
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
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
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
    const { data: adminRow, error: adminError } = await admin.from("admin_users")
      .select("user_id").eq("user_id", userData.user.id).maybeSingle();
    if (adminError || !adminRow) return reply("Administrator access required.", 403);

    let body: { action?: string } = {};
    try { body = await req.json(); } catch { /* OAuth start may send an empty body. */ }

    if (body.action === "connection-status") {
      const { data: connection, error } = await admin.from("google_drive_connections").select("connected_at").eq("id", 1).maybeSingle();
      if (error) return reply("Could not check Google Drive connection.", 500);
      return json({ connected: !!connection?.connected_at });
    }

    if (body.action === "picker-token") {
      if (!GOOGLE_PICKER_API_KEY || !GOOGLE_CLOUD_PROJECT_NUMBER) {
        return reply("Google Picker settings are not configured yet.", 503);
      }
      const { data: connection, error: connectionError } = await admin.from("google_drive_connections")
        .select("refresh_token,access_token,access_token_expires_at").eq("id", 1).maybeSingle();
      if (connectionError || !connection?.refresh_token) return reply("Connect Google Drive first.", 409);
      let accessToken = connection.access_token;
      const expiresAt = connection.access_token_expires_at ? new Date(connection.access_token_expires_at).getTime() : 0;
      if (!accessToken || expiresAt < Date.now() + 60000) {
        const response = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
            refresh_token: connection.refresh_token, grant_type: "refresh_token",
          }),
        });
        const tokens = await response.json();
        if (!response.ok || !tokens.access_token) {
          console.error("Google access-token refresh failed:", tokens.error || response.status);
          return reply("Google access needs reconnecting. Please reconnect Google Drive.", 401);
        }
        accessToken = tokens.access_token;
        await admin.from("google_drive_connections").update({
          access_token: accessToken,
          access_token_expires_at: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString(),
        }).eq("id", 1);
      }
      return json({
        access_token: accessToken,
        developer_key: GOOGLE_PICKER_API_KEY,
        app_id: GOOGLE_CLOUD_PROJECT_NUMBER,
      });
    }

    const state = crypto.randomUUID() + crypto.randomUUID();
    const { error: stateError } = await admin.from("google_drive_oauth_states").insert({
      state, user_id: userData.user.id,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (stateError) {
      console.error("Could not create Google OAuth state:", stateError);
      return reply("Could not start the secure Google connection.", 500);
    }
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: "code",
      scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets",
      access_type: "offline", prompt: "select_account consent", state,
    });
    return json({ authorization_url: "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString() });
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const googleError = url.searchParams.get("error");
    if (googleError) return Response.redirect(APP_RETURN_URL + "?google_drive=denied", 303);
    if (!code || !state) return reply("Missing Google authorisation details.");
    const { data: stateRow, error: stateError } = await admin.from("google_drive_oauth_states")
      .select("state,user_id,expires_at").eq("state", state).maybeSingle();
    if (stateError || !stateRow || new Date(stateRow.expires_at).getTime() < Date.now()) {
      return reply("This Google sign-in request has expired. Please try again.", 400);
    }
    await admin.from("google_drive_oauth_states").delete().eq("state", state);
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI, grant_type: "authorization_code",
      }),
    });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || !tokens.access_token) {
      console.error("Google token exchange failed:", tokens.error || tokenResponse.status);
      return reply("Google authorisation could not be completed. Please try again.", 400);
    }
    const { data: previous } = await admin.from("google_drive_connections")
      .select("refresh_token").eq("id", 1).maybeSingle();
    const refreshToken = tokens.refresh_token || previous?.refresh_token;
    if (!refreshToken) return reply("Google did not provide ongoing access. Please reconnect and approve access.", 400);
    const { error: saveError } = await admin.from("google_drive_connections").upsert({
      id: 1, connected_by: stateRow.user_id, refresh_token: refreshToken,
      access_token: tokens.access_token,
      access_token_expires_at: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString(),
      scope: tokens.scope || "", connected_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (saveError) {
      console.error("Could not save Google connection:", saveError);
      return reply("Google connected, but Reframe Life could not save the connection.", 500);
    }
    return Response.redirect(APP_RETURN_URL + "?google_drive=connected", 303);
  }
  return reply("Method not allowed.", 405);
});
