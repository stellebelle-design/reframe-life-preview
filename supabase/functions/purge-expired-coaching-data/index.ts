import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("PROJECT_URL")!;
const serviceRoleKey = Deno.env.get("PROJECT_SERVICE_ROLE_KEY")!;
const purgeSecret = Deno.env.get("RETENTION_PURGE_SECRET");

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!purgeSecret || req.headers.get("x-retention-secret") !== purgeSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Retention purge is missing Supabase configuration.");
    return new Response("Server configuration error", { status: 500 });
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.rpc("purge_expired_client_coaching_data");
    if (error) throw error;

    console.log("Scheduled coaching-data retention purge completed.", data);
    return Response.json({ success: true, result: data });
  } catch (error) {
    console.error("Scheduled coaching-data retention purge failed:", error);
    return new Response("Retention purge failed", { status: 500 });
  }
});
