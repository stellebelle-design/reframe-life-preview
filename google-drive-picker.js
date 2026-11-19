/* Admin-only Google Drive connection and master-template picker. */
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
        <button type="button" class="admin-row-button" id="googleDriveChoose" disabled>Choose master spreadsheet</button>
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
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    }
    async function checkConnection() {
      try {
        const { data } = await client.from("google_drive_connections").select("connected_at").eq("id", 1).maybeSingle();
        const connected = !!data?.connected_at;
        choose.disabled = !connected;
        connect.textContent = connected ? "Reconnect Google Drive" : "Connect Google Drive";
        if (connected) status.textContent = "Google Drive is connected. Choose your master spreadsheet when you're ready.";
      } catch (e) {
        console.error("Could not check Google Drive connection:", e);
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
      choose.disabled = true; status.textContent = "Preparing your secure file picker…";
      try {
        const settings = await invoke({ action: "picker-token" });
        await loadPickerApi();
        const view = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS)
          .setMimeTypes("application/vnd.google-apps.spreadsheet")
          .setSelectFolderEnabled(false);
        const picker = new google.picker.PickerBuilder()
          .setAppId(settings.app_id)
          .setDeveloperKey(settings.developer_key)
          .setOAuthToken(settings.access_token)
          .addView(view)
          .setOrigin(window.location.origin)
          .setCallback(data => {
            if (data.action === google.picker.Action.PICKED) {
              const file = data.docs?.[0];
              if (!file) return;
              selection.hidden = false;
              selection.textContent = "Selected master spreadsheet: " + file.name + " (ID: " + file.id + ").";
              status.textContent = "Master spreadsheet selected. The next step is enabling creation of private client copies.";
              window.reframeGoogleMasterSpreadsheet = { id: file.id, name: file.name };
            } else if (data.action === google.picker.Action.CANCEL) {
              status.textContent = "No spreadsheet selected. You can choose it whenever you're ready.";
            }
          })
          .build();
        picker.setVisible(true);
      } catch (e) {
        console.error("Google Picker could not open:", e);
        status.textContent = e.message || "We couldn't open Google Picker. Check the Google API settings and try again.";
      } finally { choose.disabled = false; }
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
