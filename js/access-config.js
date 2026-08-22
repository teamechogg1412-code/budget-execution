(function () {
  // 기본은 비어 있음(fail-closed). 로컬/테스트는 access-config.local.js 또는
  // 테스트 러너에서 AppAccessConfig.password를 주입한다.
  // 운영 비밀번호를 이 파일에 커밋하지 말 것.
  // 한계: 클라이언트 비밀번호는 sessionStorage 토큰 우회를 막지만, 완전한 비공개는 서버 인증이 필요하다.
  window.AppAccessConfig = window.AppAccessConfig || {
    password: "",
    publicMode: false
  };
})();
