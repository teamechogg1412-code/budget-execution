(function () {
  // 봇 토큰·chatId는 클라이언트에 두지 않는다.
  // enabled:true 로 쓰려면 서버 프록시 URL만 넣는다 (예: Edge Function /notify).
  window.AppTelegramConfig = window.AppTelegramConfig || {
    enabled: false,
    notifyUrl: ""
  };
})();
