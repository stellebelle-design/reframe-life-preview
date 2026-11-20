import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("PROJECT_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_DRIVE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_DRIVE_CLIENT_SECRET")!;
const GOOGLE_PICKER_API_KEY = Deno.env.get("GOOGLE_PICKER_API_KEY")!;
const GOOGLE_CLOUD_PROJECT_NUMBER = Deno.env.get("GOOGLE_CLOUD_PROJECT_NUMBER")!;
const REDIRECT_URI = "https://mzzujnceyspsvlbllzst.supabase.co/functions/v1/google-drive-oauth";
const APP_RETURN_URL = "https://stellebelle-design.github.io/reframe-life-preview/client-hub.html";
const MASTER_SPREADSHEET_ID = "1Llt5o78wC7RX1fzu-HpWRMqLf7yU9N16NqfoI2W-gL8";
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

    let body: { action?: string; onboarding_id?: string } = {};
    try { body = await req.json(); } catch { /* OAuth start may send an empty body. */ }

    if (body.action === "get-client-copy") {
      const onboardingId = typeof body.onboarding_id === "string" ? body.onboarding_id : "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(onboardingId)) {
        return reply("A valid questionnaire reference is required.", 400);
      }
      const { data: copy, error: copyError } = await admin.from("client_programme_copies")
        .select("drive_file_url,spreadsheet_name").eq("onboarding_id", onboardingId).maybeSingle();
      if (copyError) return reply("Could not load the client's programme link.", 500);
      return json({ copy: copy || null });
    }

    if (body.action === "create-client-copy") {
      const onboardingId = typeof body.onboarding_id === "string" ? body.onboarding_id : "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(onboardingId)) {
        return reply("A valid questionnaire reference is required.", 400);
      }
      const { data: existing, error: existingError } = await admin.from("client_programme_copies")
        .select("drive_file_id,drive_file_url,spreadsheet_name,created_at").eq("onboarding_id", onboardingId).maybeSingle();
      if (existingError) return reply("Could not check whether this client already has a programme copy.", 500);
      const { data: submission, error: submissionError } = await admin.from("client_onboarding")
        .select("id,purchase_id,user_id,product_key,responses").eq("id", onboardingId).maybeSingle();
      if (submissionError || !submission) return reply("The client questionnaire could not be found.", 404);
      const { data: master, error: masterError } = await admin.from("google_drive_master_templates")
        .select("spreadsheet_id,spreadsheet_name").eq("id", 1).maybeSingle();
      if (masterError || !master?.spreadsheet_id) return reply("Please connect your master programme spreadsheet first.", 409);
      const { data: connection, error: connectionError } = await admin.from("google_drive_connections")
        .select("refresh_token,access_token,access_token_expires_at").eq("id", 1).maybeSingle();
      if (connectionError || !connection?.refresh_token) return reply("Connect Google Drive first.", 409);
      let accessToken = connection.access_token;
      const expiresAt = connection.access_token_expires_at ? new Date(connection.access_token_expires_at).getTime() : 0;
      if (!accessToken || expiresAt < Date.now() + 60000) {
        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
            refresh_token: connection.refresh_token, grant_type: "refresh_token",
          }),
        });
        const tokens = await tokenResponse.json();
        if (!tokenResponse.ok || !tokens.access_token) {
          console.error("Google access-token refresh failed:", tokens.error || tokenResponse.status);
          return reply("Google access needs reconnecting. Please reconnect Google Drive.", 401);
        }
        accessToken = tokens.access_token;
        await admin.from("google_drive_connections").update({
          access_token: accessToken,
          access_token_expires_at: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString(),
        }).eq("id", 1);
      }
      const { data: clientAuth, error: clientAuthError } = await admin.auth.admin.getUserById(submission.user_id);
      if (clientAuthError) console.error("Could not read client profile name:", clientAuthError);
      const metadata = clientAuth?.user?.user_metadata || {};
      const metadataName = metadata.full_name || metadata.name || metadata.display_name;
      const responseName = submission.responses?.name;
      const clientName = (typeof metadataName === "string" && metadataName.trim())
        ? metadataName.trim()
        : (typeof responseName === "string" && responseName.trim()) ? responseName.trim() : "Client";
      const safeName = clientName.replace(/[\\/:*?"<>|#%{}~&]/g, " ").replace(/\\s+/g, " ").trim().slice(0, 80) || "Client";
      const programmeName = "Reframe Life - " + safeName + " - Programme";
      let fileId = existing?.drive_file_id || "";
      let fileUrl = existing?.drive_file_url || "";
      let finalFileName = programmeName;

      if (fileId) {
        const renameResponse = await fetch("https://www.googleapis.com/drive/v3/files/" + fileId + "?fields=id,name,webViewLink", {
          method: "PATCH",
          headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
          body: JSON.stringify({ name: programmeName }),
        });
        const renamed = await renameResponse.json();
        if (!renameResponse.ok) return reply("The existing client spreadsheet could not be renamed: " + (renamed.error?.message || renameResponse.status), 500);
        finalFileName = renamed.name || programmeName;
        fileUrl = renamed.webViewLink || fileUrl;
      } else {
        const copyResponse = await fetch(
          "https://www.googleapis.com/drive/v3/files/" + master.spreadsheet_id + "/copy?fields=id,name,mimeType,webViewLink",
          {
            method: "POST",
            headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
            body: JSON.stringify({ name: programmeName }),
          },
        );
        const copied = await copyResponse.json();
        if (!copyResponse.ok || !copied.id) {
          const googleMessage = copied.error?.message || ("HTTP " + copyResponse.status);
          console.error("Google Drive copy failed:", copied.error?.code, googleMessage);
          if (copyResponse.status === 403) return reply("Google Drive could not copy the template. Please reconnect Google Drive and approve file access, then try again. Google said: " + googleMessage, 403);
          return reply("Google Drive could not create this client's programme copy: " + googleMessage, copyResponse.status || 500);
        }
        fileId = copied.id;
        fileUrl = copied.webViewLink || ("https://docs.google.com/spreadsheets/d/" + fileId + "/edit");
        finalFileName = copied.name || programmeName;
      }

      const nameCellResponse = await fetch(
        "https://sheets.googleapis.com/v4/spreadsheets/" + fileId + "/values/" + encodeURIComponent("'Programme'!B5") + "?valueInputOption=USER_ENTERED",
        {
          method: "PUT",
          headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
          body: JSON.stringify({ range: "'Programme'!B5", majorDimension: "ROWS", values: [[clientName]] }),
        },
      );
      const nameCellResult = await nameCellResponse.json();
      if (!nameCellResponse.ok) {
        console.error("Could not write client name into Programme!B5:", nameCellResult.error?.message || nameCellResponse.status);
        return reply("The spreadsheet was created, but the client name could not be added to Programme!B5: " + (nameCellResult.error?.message || nameCellResponse.status), 500);
      }

      if (!existing?.drive_file_id) {
        const { error: saveCopyError } = await admin.from("client_programme_copies").insert({
          onboarding_id: submission.id, user_id: submission.user_id, purchase_id: submission.purchase_id,
          product_key: submission.product_key, client_name: clientName, spreadsheet_name: finalFileName,
          drive_file_id: fileId, drive_file_url: fileUrl, created_by: userData.user.id,
        });
        if (saveCopyError) {
          console.error("Could not save client programme copy record:", saveCopyError);
          return reply("The spreadsheet copy was created, but its client link could not be saved. Please contact support before trying again.", 500);
        }
      } else {
        await admin.from("client_programme_copies").update({
          client_name: clientName, spreadsheet_name: finalFileName, drive_file_url: fileUrl,
        }).eq("onboarding_id", onboardingId);
      }
      return json({ created: !existing?.drive_file_id, existing: !!existing?.drive_file_id, file: { id: fileId, name: finalFileName, url: fileUrl } });
    }

    if (body.action === "master-status") {
      const { data: master, error } = await admin.from("google_drive_master_templates")
        .select("spreadsheet_id,spreadsheet_name,tab_names,connected_at").eq("id", 1).maybeSingle();
      if (error) return reply("Could not check the master spreadsheet.", 500);
      return json({ configured: !!master?.spreadsheet_id, master: master || null });
    }

    if (body.action === "set-master") {
      const { data: connection, error: connectionError } = await admin.from("google_drive_connections")
        .select("refresh_token,access_token,access_token_expires_at").eq("id", 1).maybeSingle();
      if (connectionError || !connection?.refresh_token) return reply("Connect Google Drive first.", 409);
      let accessToken = connection.access_token;
      const expiresAt = connection.access_token_expires_at ? new Date(connection.access_token_expires_at).getTime() : 0;
      if (!accessToken || expiresAt < Date.now() + 60000) {
        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
            refresh_token: connection.refresh_token, grant_type: "refresh_token",
          }),
        });
        const tokens = await tokenResponse.json();
        if (!tokenResponse.ok || !tokens.access_token) {
          console.error("Google access-token refresh failed:", tokens.error || tokenResponse.status);
          return reply("Google access needs reconnecting. Please reconnect Google Drive.", 401);
        }
        accessToken = tokens.access_token;
        await admin.from("google_drive_connections").update({
          access_token: accessToken,
          access_token_expires_at: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString(),
        }).eq("id", 1);
      }
      const sheetResponse = await fetch(
        "https://sheets.googleapis.com/v4/spreadsheets/" + MASTER_SPREADSHEET_ID +
        "?fields=spreadsheetId,properties(title),sheets.properties(title)",
        { headers: { Authorization: "Bearer " + accessToken } },
      );
      const sheet = await sheetResponse.json();
      if (!sheetResponse.ok || !sheet.spreadsheetId) {
        const googleMessage = sheet.error?.message || ("HTTP " + sheetResponse.status);
        console.error("Master spreadsheet verification failed:", sheet.error?.code, googleMessage, sheet.error?.status);
        return reply("Google Sheets API error (" + (sheet.error?.code || sheetResponse.status) + "): " + googleMessage, 403);
      }
      const tabNames = (sheet.sheets || []).map((item: { properties?: { title?: string } }) => item.properties?.title).filter(Boolean);
      const { error: saveError } = await admin.from("google_drive_master_templates").upsert({
        id: 1, spreadsheet_id: sheet.spreadsheetId, spreadsheet_name: sheet.properties?.title || "Master programme",
        tab_names: tabNames, connected_at: new Date().toISOString(),
      }, { onConflict: "id" });
      if (saveError) {
        console.error("Could not save master spreadsheet:", saveError);
        return reply("The master spreadsheet was verified, but Reframe Life could not save its details.", 500);
      }
      return json({ configured: true, master: { spreadsheet_id: sheet.spreadsheetId, spreadsheet_name: sheet.properties?.title || "Master programme", tab_names: tabNames } });
    }

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
      scope: "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets",
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
