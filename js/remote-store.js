(function () {
  window.App = window.App || {};

  var client = null;
  var scriptPromise = null;
  var PINNED_CLIENT_URL =
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/dist/umd/supabase.min.js";
  var PINNED_CLIENT_INTEGRITY =
    "sha384-z2hqtpr/vSDZ8zSjLOiNgnR/mpU799AD93s6rvkNJLI6Hl0YlKXEhDtREzNT749S";

  function config() {
    return window.AppSupabaseConfig || {};
  }

  function isEnabled() {
    var cfg = config();
    return !!(cfg.enabled && cfg.url && cfg.anonKey);
  }

  function loadSupabaseScript() {
    if (window.supabase && typeof window.supabase.createClient === "function") return Promise.resolve();
    if (typeof document === "undefined") return Promise.resolve();
    if (scriptPromise) return scriptPromise;
    var cfg = config();
    var url = cfg.clientUrl || PINNED_CLIENT_URL;
    var integrity = cfg.clientIntegrity || PINNED_CLIENT_INTEGRITY;
    if (!url || !integrity) {
      return Promise.reject(new Error("missing_sri"));
    }
    if (url !== PINNED_CLIENT_URL || integrity !== PINNED_CLIENT_INTEGRITY) {
      return Promise.reject(new Error("unapproved_sdk"));
    }
    scriptPromise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = url;
      script.integrity = integrity;
      script.crossOrigin = "anonymous";
      script.onload = resolve;
      script.onerror = function () {
        reject(new Error("sdk_load_failed"));
      };
      document.head.appendChild(script);
    });
    return scriptPromise;
  }

  async function getClient() {
    if (!isEnabled()) return null;
    await loadSupabaseScript();
    if (!window.supabase || typeof window.supabase.createClient !== "function") return null;
    if (!client) {
      var cfg = config();
      client = window.supabase.createClient(cfg.url, cfg.anonKey);
    }
    return client;
  }

  function uuid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  async function getUserId(db) {
    if (!db || !db.auth || typeof db.auth.getUser !== "function") return null;
    var res = await db.auth.getUser();
    return res && res.data && res.data.user && res.data.user.id ? res.data.user.id : null;
  }

  function stateTitle(state) {
    if (App.Defaults && App.Defaults.budgetDisplayTitle) return App.Defaults.budgetDisplayTitle(state);
    return (state.meta && state.meta.title) ||
      (state.profile && state.profile.companyName) ||
      "배우";
  }

  function tableName() {
    return config().table || "budget_states";
  }

  async function save(state) {
    if (!isEnabled()) return { ok: false, skipped: true, reason: "disabled" };
    var db = await getClient();
    if (!db) return { ok: false, skipped: true, reason: "client_unavailable" };
    var userId = await getUserId(db);
    if (!userId) return { ok: false, skipped: true, reason: "no_user" };
    App.Defaults.ensureState(state);
    var now = new Date().toISOString();
    state.meta.budgetId = state.meta.budgetId || uuid();
    state.meta.actorId = state.meta.actorId || uuid();
    state.meta.ownerUserId = userId;
    state.meta.storageMode = "remote";
    state.meta.updatedAt = now;
    if (!state.meta.createdAt) state.meta.createdAt = now;
    var payload = {
      id: state.meta.budgetId,
      user_id: userId,
      actor_id: state.meta.actorId || null,
      title: stateTitle(state),
      actor_name: (state.profile && state.profile.actorName) || null,
      company_name: (state.profile && state.profile.companyName) || null,
      schema_version: state.version || 1,
      state: state,
      updated_at: now
    };
    var res = await db.from(tableName()).upsert(payload, { onConflict: "id" });
    if (res.error) return { ok: false, error: res.error };
    return { ok: true, id: state.meta.budgetId };
  }

  async function loadLatest() {
    if (!isEnabled()) return { ok: false, skipped: true, reason: "disabled" };
    var db = await getClient();
    if (!db) return { ok: false, skipped: true, reason: "client_unavailable" };
    var userId = await getUserId(db);
    if (!userId) return { ok: false, skipped: true, reason: "no_user" };
    var res = await db.from(tableName())
      .select("id,title,state,updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (res.error) return { ok: false, error: res.error };
    if (!res.data || !res.data.state) return { ok: false, skipped: true, reason: "empty" };
    return { ok: true, state: res.data.state, id: res.data.id };
  }

  App.RemoteStore = {
    isEnabled: isEnabled,
    save: save,
    loadLatest: loadLatest,
    PINNED_CLIENT_URL: PINNED_CLIENT_URL,
    PINNED_CLIENT_INTEGRITY: PINNED_CLIENT_INTEGRITY
  };
})();
