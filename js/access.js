(function () {
  window.App = window.App || {};

  // 비밀번호는 소스에 하드코딩하지 않는다.
  // 배포 시 access-config.js(또는 서버 주입)에서 AppAccessConfig.password를 설정한다.
  // 비어 있으면 모든 입력을 거부(fail-closed).
  //
  // 한계: 클라이언트에 검증 로직이 있으면 완전한 비공개가 아니다.
  // sessionStorage에 "1"을 넣는 우회는 막고, 실제 비공개는 서버 인증이 필요하다.
  var SESSION_KEY = "solo-agency-budget:gate-token";

  function configuredPassword() {
    var cfg = window.AppAccessConfig || {};
    return cfg.password == null ? "" : String(cfg.password);
  }

  function isPublicMode() {
    if (window.AppPublicMode === true) return true;
    var cfg = window.AppAccessConfig || {};
    return cfg.publicMode === true;
  }

  // 비밀번호를 모르는 채 sessionStorage="1" 만으로는 통과하지 못하게 하는 세션 토큰.
  function sessionTokenFor(password) {
    var pw = String(password || "");
    if (!pw) return "";
    var s = "gate-v2|" + pw;
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return "v2_" + (h >>> 0).toString(16);
  }

  function expectedSessionToken() {
    return sessionTokenFor(configuredPassword());
  }

  function persistUnlockSession() {
    var token = expectedSessionToken();
    if (!token) return false;
    try {
      sessionStorage.setItem(SESSION_KEY, token);
      sessionStorage.removeItem("solo-agency-budget:gate-ok");
      return true;
    } catch (err) {
      return false;
    }
  }

  function clearUnlockSession() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem("solo-agency-budget:gate-ok");
    } catch (err) {}
  }

  function hasValidSession() {
    if (isPublicMode()) return true;
    var expected = expectedSessionToken();
    if (!expected) return false;
    try {
      return sessionStorage.getItem(SESSION_KEY) === expected;
    } catch (err) {
      return false;
    }
  }

  App.Access = {
    SESSION_KEY: SESSION_KEY,
    check: function (value) {
      var expected = configuredPassword();
      if (!expected) return false;
      return String(value == null ? "" : value) === expected;
    },
    isConfigured: function () {
      return !!configuredPassword();
    },
    isPublicMode: isPublicMode,
    hasValidSession: hasValidSession,
    persistUnlockSession: persistUnlockSession,
    clearUnlockSession: clearUnlockSession,
    // 테스트·진단용
    sessionTokenFor: sessionTokenFor
  };
})();
