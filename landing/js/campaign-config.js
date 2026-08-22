(function () {
  // 개인별 링크(ref) 24시간 만료.
  // 운영: enabled:true 로 켠 뒤, campaign_links 행은 SQL/service role로만 INSERT.
  // 클라이언트는 claim_campaign_link RPC만 호출 (테이블 직접 조회·수정 금지).
  // clientUrl/clientIntegrity 생략 시 link-gate 내장 고정값 사용. 다른 CDN·해시는 거부.
  window.LandingCampaignConfig = window.LandingCampaignConfig || {
    enabled: true,
    url: "https://hapgatumhlwkyiycfcny.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhcGdhdHVtaGx3a3lpeWNmY255Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MzQ3NjMsImV4cCI6MjA4NzUxMDc2M30.B2y7PHr0bV1j54ktjuAiMlF7bB2d0wQrPVtf8qwZWPA",
    clientUrl: "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/dist/umd/supabase.min.js",
    clientIntegrity: "sha384-z2hqtpr/vSDZ8zSjLOiNgnR/mpU799AD93s6rvkNJLI6Hl0YlKXEhDtREzNT749S",
    claimRpc: "claim_campaign_link",
    table: "campaign_links",
    expiryHours: 24
  };
})();
