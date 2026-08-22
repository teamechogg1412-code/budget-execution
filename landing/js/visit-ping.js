(function () {
  window.App = window.App || {};

  function config() {
    return window.LandingVisitPingConfig || { enabled: false };
  }

  function notify(pageName) {
    var cfg = config();
    if (!cfg.enabled || !cfg.notifyUrl) return;
    var ref = (App.LinkGate && App.LinkGate.getRef()) || "(없음)";
    var when = new Date().toLocaleString("ko-KR");
    var text = "[배우 계약·독립 시뮬레이터] 방문\n페이지: " + pageName + "\nref: " + ref + "\n시간: " + when;
    var sep = cfg.notifyUrl.indexOf("?") >= 0 ? "&" : "?";
    var url = cfg.notifyUrl + sep + "text=" + encodeURIComponent(text);
    try {
      var img = new Image();
      img.src = url;
    } catch (err) {}
    if (typeof fetch === "function") {
      try {
        fetch(url, { mode: "no-cors", cache: "no-store" }).catch(function () {});
      } catch (err2) {}
    }
  }

  App.VisitPing = { notify: notify };
})();
