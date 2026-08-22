(function () {
  window.App = window.App || {};

  var SEEN_KEY = "solo-agency-budget:tg-access";

  function kstNow() {
    var now = new Date();
    var utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + (3600000 * 9));
  }

  function accessMessage() {
    var kst = kstNow();
    var when = kst.toLocaleString("ko-KR");
    return "[1인 기획사 설립 운영 시뮬레이션] 접속 감지\n시간: " + when;
  }

  // 봇 토큰은 브라우저에 두지 않는다. 서버 프록시(notifyUrl)만 호출한다.
  function resolveNotifyEndpoint(cfg, text) {
    if (cfg.notifyUrl) {
      var sep = cfg.notifyUrl.indexOf("?") >= 0 ? "&" : "?";
      return cfg.notifyUrl + sep + "text=" + encodeURIComponent(text);
    }
    return "";
  }

  function sendQuiet(url) {
    if (!url) return;
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

  function notifyAccess() {
    var cfg = window.AppTelegramConfig || {};
    if (!cfg.enabled) return;
    var url = resolveNotifyEndpoint(cfg, accessMessage());
    if (!url) return;
    sendQuiet(url);
  }

  function notifyAccessOnce() {
    try {
      if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(SEEN_KEY) === "1") return;
      if (typeof sessionStorage !== "undefined") sessionStorage.setItem(SEEN_KEY, "1");
    } catch (err) {}
    notifyAccess();
  }

  App.Telegram = {
    accessMessage: accessMessage,
    notifyAccess: notifyAccess,
    notifyAccessOnce: notifyAccessOnce
  };
})();
