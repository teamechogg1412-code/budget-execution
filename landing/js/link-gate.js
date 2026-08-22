(function () {
  window.App = window.App || {};

  var client = null;
  var scriptPromise = null;
  var PINNED_CLIENT_URL =
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/dist/umd/supabase.min.js";
  var PINNED_CLIENT_INTEGRITY =
    "sha384-z2hqtpr/vSDZ8zSjLOiNgnR/mpU799AD93s6rvkNJLI6Hl0YlKXEhDtREzNT749S";

  function config() {
    return window.LandingCampaignConfig || {};
  }

  function getRef() {
    try {
      var params = new URLSearchParams(window.location.search);
      var ref = params.get("ref");
      return ref ? String(ref).trim() : "";
    } catch (err) {
      return "";
    }
  }

  function appendRef(href) {
    var ref = getRef();
    if (!ref) return href;
    var sep = href.indexOf("?") >= 0 ? "&" : "?";
    return href + sep + "ref=" + encodeURIComponent(ref);
  }

  function wireInternalLinks() {
    var ref = getRef();
    if (!ref) return;
    var links = document.querySelectorAll("a[data-carry-ref]");
    for (var i = 0; i < links.length; i++) {
      links[i].setAttribute("href", appendRef(links[i].getAttribute("href")));
    }
  }

  function loadSupabaseScript() {
    if (window.supabase && typeof window.supabase.createClient === "function") {
      return Promise.resolve();
    }
    if (typeof document === "undefined") {
      return Promise.reject(new Error("no_document"));
    }
    if (scriptPromise) return scriptPromise;
    var cfg = config();
    var url = cfg.clientUrl || PINNED_CLIENT_URL;
    var integrity = cfg.clientIntegrity || PINNED_CLIENT_INTEGRITY;
    if (!url || !integrity) {
      return Promise.reject(new Error("missing_sri"));
    }
    if (url !== PINNED_CLIENT_URL || integrity !== PINNED_CLIENT_INTEGRITY) {
      // 승인된 CDN URL·해시만 허용
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
    var cfg = config();
    if (!cfg.enabled || !cfg.url || !cfg.anonKey) return null;
    await loadSupabaseScript();
    if (!window.supabase || typeof window.supabase.createClient !== "function") return null;
    if (!client) client = window.supabase.createClient(cfg.url, cfg.anonKey);
    return client;
  }

  function requireRefMode(cfg) {
    // requireRef 명시 시 따름. 미지정이면 캠페인 DB 활성(enabled)일 때만 ref 필수.
    if (cfg.requireRef === false) return false;
    if (cfg.requireRef === true) return true;
    return !!cfg.enabled;
  }

  // "no_ref" | "valid" | "expired" | "unavailable"
  async function resolveState() {
    var cfg = config();
    var ref = getRef();
    if (!ref) {
      return requireRefMode(cfg) ? "unavailable" : "no_ref";
    }
    if (!cfg.enabled || !cfg.url || !cfg.anonKey) return "unavailable";
    try {
      var db = await getClient();
      if (!db) return "unavailable";
      // 테이블 직접 select/update 금지 — SECURITY DEFINER RPC만 사용
      var rpcName = cfg.claimRpc || "claim_campaign_link";
      var rpc = await db.rpc(rpcName, {
        p_ref: ref,
        p_expiry_hours: Number(cfg.expiryHours) || 24
      });
      if (rpc.error) return "unavailable";
      var status = rpc.data;
      if (status === "valid" || status === "expired" || status === "unavailable") return status;
      return "unavailable";
    } catch (err) {
      return "unavailable";
    }
  }

  function revealApp() {
    var page = document.querySelector(".page");
    if (page) page.hidden = false;
    var shell = document.getElementById("app-shell");
    if (shell) shell.hidden = false;
    document.documentElement.classList.remove("gate-pending");
    document.documentElement.classList.add("gate-ready");
  }

  function check(options) {
    options = options || {};
    document.documentElement.classList.add("gate-pending");
    return resolveState().then(function (state) {
      wireInternalLinks();
      var block = state === "expired" || state === "unavailable";
      if (block && options.expiredUrl) {
        window.location.replace(appendRef(options.expiredUrl));
        return state;
      }
      if (state === "valid" || state === "no_ref") revealApp();
      return state;
    }).catch(function () {
      if (options.expiredUrl) {
        window.location.replace(appendRef(options.expiredUrl));
      }
      return "unavailable";
    });
  }

  App.LinkGate = {
    getRef: getRef,
    appendRef: appendRef,
    wireInternalLinks: wireInternalLinks,
    check: check,
    revealApp: revealApp
  };
})();
