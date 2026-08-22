(function () {
  window.App = window.App || {};

  // Quick Simulation 중립성 회귀 테스트 (§5 구현계획서).
  // 목적: 결과가 항상 "1인 기획사가 유리"로 나오도록 하드코딩되지 않았는지 확인한다.
  // 반대 조건을 넣으면 "현재 전속계약 유지가 유리"가 실제로 나와야 한다.

  function runQuickTests() {
    var results = [];
    function pass(name) { results.push({ name: name, ok: true }); }
    function fail(name, detail) { results.push({ name: name, ok: false, detail: String(detail) }); }
    function assert(name, cond, detail) {
      if (cond) pass(name); else fail(name, detail || "");
    }
    function eq(name, actual, expected) {
      if (actual === expected) pass(name);
      else fail(name, "expected " + expected + " got " + actual);
    }

    try {
      // Case A: 현재 소속사 정산비율이 매우 높고(90%), 1인 기획사 운영비가 매출을 넘어설 만큼 큼
      // → 현재 전속계약 유지가 유리해야 한다.
      var currentFavorable = App.QuickEngine.calculate({
        annualWorkIncome: 200000000,
        annualAdIncome: 0,
        currentAgencyRate: 0.9,
        currentAgencyCoveredCost: 0,
        employeeCount: 3,
        ownerSalary: 10000000,
        otherOpCost: 50000000
      });
      assert("CaseA 예외 없음", !!currentFavorable);
      eq("CaseA 판정 = 현재 전속계약 유리", currentFavorable.favorable, "current");
      assert("CaseA 현재계약 순액 > 0", currentFavorable.currentContractNet > 0, currentFavorable.currentContractNet);
      assert("CaseA 차이 < 0 (솔로 - 현재)", currentFavorable.difference < 0, currentFavorable.difference);
    } catch (e) { fail("CaseA 예외", e.message || e); }

    try {
      // Case B: 현재 소속사 정산비율이 낮고(50%), 매출이 크고 1인 기획사 운영비는 상대적으로 작음
      // → 1인 법인 운영이 유리해야 한다.
      var soloFavorable = App.QuickEngine.calculate({
        annualWorkIncome: 500000000,
        annualAdIncome: 200000000,
        currentAgencyRate: 0.5,
        currentAgencyCoveredCost: 0,
        employeeCount: 1,
        ownerSalary: 8000000,
        otherOpCost: 30000000
      });
      assert("CaseB 예외 없음", !!soloFavorable);
      eq("CaseB 판정 = 1인 기획사 유리", soloFavorable.favorable, "solo");
      assert("CaseB 차이 > 0 (솔로 - 현재)", soloFavorable.difference > 0, soloFavorable.difference);
    } catch (e) { fail("CaseB 예외", e.message || e); }

    try {
      // Case C: 빈 입력이어도 예외 없이 0으로 수렴해야 한다 (실수로 하드코딩된 favorable이 없는지 재확인 포함)
      var blank = App.QuickEngine.calculate({});
      assert("CaseC 예외 없음", !!blank);
      eq("CaseC 현재계약 순액 = 0", blank.currentContractNet, 0);
      assert("CaseC NaN 없음", Number.isFinite(blank.soloAgencyNet) && Number.isFinite(blank.currentContractNet));
    } catch (e) { fail("CaseC 예외", e.message || e); }

    var passed = results.filter(function (r) { return r.ok; }).length;
    var failed = results.length - passed;
    return { results: results, passed: passed, failed: failed };
  }

  App.QuickTests = { run: runQuickTests };
})();
