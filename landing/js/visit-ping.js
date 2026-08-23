(function () {
  window.App = window.App || {};

  function config() {
    return window.LandingVisitPingConfig || { enabled: false };
  }

  function notify(pageName) {
    var cfg = config();
    if (!cfg.enabled || !cfg.notifyUrl) return;
    var ref = (App.LinkGate && App.LinkGate.getRef()) || "(없음)";
    if (typeof fetch === "function") {
      try {
        var campaign = window.LandingCampaignConfig || {};
        fetch(cfg.notifyUrl, {
          method: "POST",
          mode: "cors",
          cache: "no-store",
          keepalive: true,
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + String(campaign.anonKey || ""),
            "apikey": String(campaign.anonKey || "")
          },
          body: JSON.stringify({ page: String(pageName || "unknown"), ref: ref })
        }).catch(function () {});
      } catch (err2) {}
    }
  }

  App.VisitPing = { notify: notify };
})();
