(function () {
  window.App = window.App || {};

  var client = null;
  var scriptPromise = null;

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
    scriptPromise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = config().clientUrl || "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      script.onload = resolve;
      script.onerror = reject;
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
    state.meta.createdAt = state.meta.createdAt || now;

    var row = {
      id: state.meta.budgetId,
      user_id: userId,
      actor_id: state.meta.actorId,
      title: stateTitle(state),
      actor_name: (App.Defaults && App.Defaults.actorDisplayName) ? App.Defaults.actorDisplayName() : "배우",
      company_name: state.profile.companyName || "",
      schema_version: state.version || 1,
      state: state,
      updated_at: now
    };

    var res = await db.from(tableName()).upsert(row, { onConflict: "id" }).select("id").single();
    if (res && res.error) return { ok: false, error: res.error };
    return { ok: true, id: state.meta.budgetId };
  }

  async function loadLatest() {
    if (!isEnabled()) return { ok: false, skipped: true, reason: "disabled" };
    var db = await getClient();
    if (!db) return { ok: false, skipped: true, reason: "client_unavailable" };
    var userId = await getUserId(db);
    if (!userId) return { ok: false, skipped: true, reason: "no_user" };
    var query = db.from(tableName())
      .select("id,user_id,actor_id,title,state,updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1);
    var res = typeof query.maybeSingle === "function" ? await query.maybeSingle() : await query.single();
    if (res && res.error) return { ok: false, error: res.error };
    if (!res || !res.data || !res.data.state) return { ok: true, state: null };
    var restored = App.Defaults.ensureState(res.data.state);
    restored.meta.budgetId = restored.meta.budgetId || res.data.id;
    restored.meta.actorId = restored.meta.actorId || res.data.actor_id;
    restored.meta.ownerUserId = userId;
    restored.meta.storageMode = "remote";
    restored.meta.updatedAt = res.data.updated_at || restored.meta.updatedAt;
    return { ok: true, state: restored };
  }

  App.RemoteStore = {
    isEnabled: isEnabled,
    save: save,
    loadLatest: loadLatest
  };
})();
