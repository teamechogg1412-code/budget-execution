(function () {
  window.App = window.App || {};

  function assert(results, name, cond, detail) {
    results.push({ name: name, ok: !!cond, detail: cond ? "" : String(detail || "") });
  }

  function eq(results, name, actual, expected) {
    var ok = actual === expected;
    results.push({
      name: name,
      ok: ok,
      detail: ok ? "" : ("expected " + expected + " got " + actual)
    });
  }

  function runPulseCases(results) {
    results = results || [];
    if (!App.PulseEngine) {
      assert(results, "PulseEngine 로드", false, "pulse-engine.js 미로드");
      return results;
    }

    try {
      eq(results, "P1 문항 6개", App.PulseEngine.QUESTIONS.length, 6);
      assert(results, "P1 MAX_SCORE > 0", App.PulseEngine.MAX_SCORE > 0);

      var incomplete = App.PulseEngine.evaluate({});
      eq(results, "P2 미응답 ok=false", incomplete.ok, false);
      assert(results, "P2 missing 존재", incomplete.missing && incomplete.missing.length > 0);

      var explore = App.PulseEngine.evaluate({
        revenue: "over10",
        rate: "under50",
        covered: "none",
        staff: "zero",
        intent: "preparing",
        renewal: "soon"
      });
      eq(results, "P3 고점수 ok", explore.ok, true);
      eq(results, "P3 band explore", explore.band, "explore");
      assert(results, "P3 disclaimer 명시", /contract/.test(explore.disclaimer));
      assert(results, "P3 CTA contract", explore.copy.ctaPrimaryHref.indexOf("contract") >= 0);

      var stay = App.PulseEngine.evaluate({
        revenue: "under1",
        rate: "over85",
        covered: "heavy",
        staff: "threePlus",
        intent: "notNow",
        renewal: "far"
      });
      eq(results, "P4 저점수 band stay", stay.band, "stay");
      assert(results, "P4 CTA contract", stay.copy.ctaPrimaryHref.indexOf("contract") >= 0);

      var watchMid = App.PulseEngine.bandForScore(70);
      eq(results, "P5 mid band watch", watchMid, "watch");

      assert(results, "P6 금액 필드 없음",
        !("annualRevenue" in (App.PulseEngine.QUESTIONS[0] || {})));
    } catch (e) {
      assert(results, "pulse-cases 예외", false, e && (e.stack || e.message || String(e)));
    }
    return results;
  }

  App.Tests = App.Tests || {};
  App.Tests.runPulseCases = runPulseCases;
  var prevRun = App.Tests.run;
  App.Tests.run = function () {
    var base = prevRun ? prevRun() : { results: [], passed: 0, failed: 0 };
    var merged = (base.results || []).slice();
    runPulseCases(merged);
    return {
      results: merged,
      passed: merged.filter(function (r) { return r.ok; }).length,
      failed: merged.filter(function (r) { return !r.ok; }).length
    };
  };
})();
