/* Admin-only Google Drive connection and fixed master-template setup. */
(function () {
  const client = window.reframeSupabaseClient;
  if (!client) return;

  async function init() {
    const { data: sessionData } = await client.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) return;
    const { data: admin, error } = await client.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
    if (error || !admin) return;

    const panel = document.querySelector("#adminPanel");
    if (!panel || document.querySelector("#googleDriveAdminCard")) return;
    const card = document.createElement("section");
    card.id = "googleDriveAdminCard";
    card.className = "admin-list-wrap";
    card.innerHTML = `
      <div class="admin-submissions-heading">
        <div><h3>Google Drive &amp; programme templates</h3><p class="section-intro">Connect your private Google account and choose the master programme spreadsheet. The master stays unchanged; client copies will be created separately.</p></div>
      </div>
      <div class="admin-actions" style="display:flex;gap:10px;flex-wrap:wrap">
        <button type="button" class="admin-save" id="googleDriveConnect">Connect Google Drive</button>
        <button type="button" class="admin-row-button" id="googleDriveChoose" disabled>Use my master spreadsheet</button>
      </div>
      <p id="googleDriveStatus" class="admin-status" role="status" aria-live="polite">Google Drive is not connected yet.</p>
      <div id="googleDriveSelection" class="submission-answer" hidden></div>`;
    const onboarding = panel.querySelector(".onboarding-admin-wrap");
    if (onboarding) onboarding.parentNode.insertBefore(card, onboarding);
    else panel.append(card);

    const connect = card.querySelector("#googleDriveConnect");
    const choose = card.querySelector("#googleDriveChoose");
    const status = card.querySelector("#googleDriveStatus");
    const selection = card.querySelector("#googleDriveSelection");
    const endpoint = "google-drive-oauth";

    async function invoke(body) {
      const { data, error } = await client.functions.invoke(endpoint, { body });
      if (error) {
        let detail = error.message || "The secure Google Drive request failed.";
        try {
          const response = error.context;
          if (response && typeof response.clone === "function") {
            const contentType = response.headers.get("content-type") || "";
            const payload = contentType.includes("application/json")
              ? await response.clone().json()
              : await response.clone().text();
            if (typeof payload === "string" && payload.trim()) detail = payload;
            else if (payload?.message) detail = payload.message;
            else if (payload?.error) detail = payload.error;
          }
        } catch (_) { /* Keep the original error message. */ }
        throw new Error(detail);
      }
      if (data?.error) throw new Error(data.error);
      return data;
    }
    async function checkConnection() {
      try {
        const data = await invoke({ action: "connection-status" });
        const connected = !!data?.connected;
        choose.disabled = !connected;
        connect.textContent = connected ? "Reconnect Google Drive" : "Connect Google Drive";
        if (connected) {
          const masterData = await invoke({ action: "master-status" });
          if (masterData?.configured && masterData.master) {
            selection.hidden = false;
            selection.textContent = "Master spreadsheet: " + masterData.master.spreadsheet_name +
              " (tabs: " + (masterData.master.tab_names || []).join(", ") + ").";
            choose.textContent = "Refresh master spreadsheet connection";
            status.textContent = "Your master spreadsheet is connected and its details are saved securely.";
          } else {
            status.textContent = "Google Drive is connected. Confirm your master spreadsheet when you're ready.";
          }
        }
      } catch (e) {
        console.error("Could not check Google Drive connection:", e);
        status.textContent = e.message || "We couldn't check the Google Drive connection.";
      }
    }
    connect.addEventListener("click", async () => {
      connect.disabled = true; status.textContent = "Opening secure Google connection…";
      try {
        const data = await invoke({ action: "start" });
        if (!data?.authorization_url) throw new Error("Google did not return an authorisation link.");
        window.location.assign(data.authorization_url);
      } catch (e) {
        console.error("Could not start Google connection:", e);
        status.textContent = e.message || "We couldn't start the Google connection.";
        connect.disabled = false;
      }
    });
    choose.addEventListener("click", async () => {
      choose.disabled = true;
      status.textContent = "Checking your master spreadsheet securely…";
      try {
        const data = await invoke({ action: "set-master" });
        if (!data?.configured || !data.master) throw new Error("The master spreadsheet could not be confirmed.");
        selection.hidden = false;
        selection.textContent = "Master spreadsheet: " + data.master.spreadsheet_name +
          " (tabs: " + (data.master.tab_names || []).join(", ") + ").";
        choose.textContent = "Refresh master spreadsheet connection";
        status.textContent = "Your master spreadsheet is connected and its details are saved securely.";
      } catch (e) {
        console.error("Could not set master spreadsheet:", e);
        status.textContent = e.message || "We couldn't connect the master spreadsheet.";
      } finally {
        choose.disabled = false;
      }
    });
    checkConnection();
  }

  function loadPickerApi() {
    return new Promise((resolve, reject) => {
      if (window.google?.picker) return resolve();
      if (window.gapi?.load) {
        window.gapi.load("picker", { callback: resolve });
        return;
      }
      const script = document.createElement("script");
      script.src = "https://apis.google.com/js/api.js";
      script.onload = () => window.gapi.load("picker", { callback: resolve });
      script.onerror = () => reject(new Error("Google Picker could not be loaded."));
      document.head.append(script);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
