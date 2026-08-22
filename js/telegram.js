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
    var agent = (typeof navigator !== "undefined" && navigator.userAgent) ? navigator.userAgent : "unknown";
    var href = "";
    try { href = String((window.location && window.location.href) || ""); } catch (err) {}
    var place = /^file:/i.test(href) ? "로컬 파일" : (href || "-");
    return "[1인 기획사 설립 운영 시뮬레이션] 접속 감지\n" +
      "시간: " + when + "\n" +
      "주소: " + place + "\n" +
      "기기: " + agent;
  }

  function notifyUrl(cfg, text) {
    return "https://api.telegram.org/bot" + cfg.botToken +
      "/sendMessage?chat_id=" + encodeURIComponent(cfg.chatId) +
      "&text=" + encodeURIComponent(text);
  }

  function sendQuiet(url) {
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
    if (!cfg.enabled || !cfg.botToken || !cfg.chatId) return;
    sendQuiet(notifyUrl(cfg, accessMessage()));
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
