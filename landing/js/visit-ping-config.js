(function () {
  // 방문 알림. 봇 토큰·chatId는 브라우저에 두지 않는다.
  // enabled:true 시 서버 프록시 notifyUrl만 사용.
  window.LandingVisitPingConfig = window.LandingVisitPingConfig || {
    enabled: true,
    notifyUrl: "https://hapgatumhlwkyiycfcny.supabase.co/functions/v1/notify-visit"
  };
})();
