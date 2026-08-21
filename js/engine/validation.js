(function () {
  window.App = window.App || {};
  App.Engine = App.Engine || {};

  function amt(v) {
    return App.Money.roundWon(v || 0);
  }

  function ledgerGroupById(ledger, id) {
    return ((ledger && ledger.groups) || []).filter(function (g) { return g && g.id === id; })[0] || null;
  }

  function ledgerSubtotal(ledger, id) {
    var g = ledgerGroupById(ledger, id);
    return g && g.subtotal ? amt(g.subtotal.total) : null;
  }

  function ledgerResultRow(ledger, id) {
    return ((ledger && ledger.results) || []).filter(function (r) { return r && r.id === id; })[0] || null;
  }

  function pushCheck(errors, key, label, expected, actual, source, analysisPath, tolerance) {
    if (expected == null || actual == null) return;
    var e = amt(expected);
    var a = amt(actual);
    var tol = tolerance || 0;
    var diff = a - e;
    if (Math.abs(diff) <= tol) return;
    errors.push({
      key: key,
      label: label,
      expected: e,
      actual: a,
      difference: diff,
      source: source,
      analysisPath: analysisPath
    });
  }

  function isLiveProject(p) {
    return !!(p && p.status !== "cancelled");
  }

  function isLivePlan(plan) {
    return !!(plan && plan.includeInBudget !== false && !plan.converted);
  }

  function validateAnalysisConsistency(state, result) {
    var errors = [];
    if (!state || !result) return { valid: true, errors: errors };
    var kpis = result.kpis || {};
    var ledger = result.ledger || { groups: [] };

    var isSalesCategory = (App.Defaults && App.Defaults.isSalesCategory) || function () { return false; };
    var liveProjects = (state.projects || []).filter(isLiveProject);
    var workRevenue = App.Money.sumBy(liveProjects.filter(function (p) { return !isSalesCategory(p.category); }), function (p) {
      return App.Engine.projectContractAmount(p);
    });
    pushCheck(errors, "workRevenue", "작품 수익", workRevenue, ledgerSubtotal(ledger, "revenue-work"),
      "수익 > 작품 수익 합계", "분석 > 월별 분석 > 작품 수입 소계");

    var salesProjectRevenue = App.Money.sumBy(liveProjects.filter(function (p) { return isSalesCategory(p.category); }), function (p) {
      return App.Engine.projectContractAmount(p);
    });
    var salesPlanRevenue = App.Money.sumBy((state.salesPlans || []).filter(isLivePlan), function (p) {
      return amt(p.amount);
    });
    var businessRevenue = amt(salesProjectRevenue + salesPlanRevenue);
    pushCheck(errors, "businessRevenue", "영업 수익", businessRevenue, ledgerSubtotal(ledger, "revenue-sales"),
      "수익 > 영업 수익 합계(영업 카테고리 프로젝트 + 영업계획)", "분석 > 월별 분석 > 영업 수입 소계");

    var totalLedger = ledgerSubtotal(ledger, "revenue-total");
    pushCheck(errors, "totalRevenue", "총 매출", amt(workRevenue + businessRevenue), totalLedger,
      "작품 수익 + 영업 수익", "분석 > 월별 분석 > 총 매출");
    pushCheck(errors, "totalRevenueKpis", "총 매출(엔진 kpis)", kpis.revenue, totalLedger,
      "엔진 kpis.revenue", "분석 > 월별 분석 > 총 매출");

    var cogsLedger = ledgerSubtotal(ledger, "cogs-total");
    if (cogsLedger != null) {
      pushCheck(errors, "costOfSales", "매출원가(프로젝트 진행비+에이전시 수수료)",
        -amt(amt(kpis.projectDirect) + amt(kpis.agencyFees)), cogsLedger,
        "엔진 kpis.projectDirect + kpis.agencyFees", "분석 > 월별 분석 > 매출원가 합계");
    }

    var payrollLedger = ledgerSubtotal(ledger, "payroll");
    if (payrollLedger != null) {
      var payrollSum = App.Money.sumBy(result.months || [], function (r) { return r.payroll || 0; });
      pushCheck(errors, "payroll", "인건비(급여+인센티브)", -amt(payrollSum),
        payrollLedger, "엔진 월별 payroll 합계(급여+인센티브, 4대보험·퇴직급여 제외)", "분석 > 월별 분석 > 인건비 소계", 1);
    }

    var mealLedger = ledgerSubtotal(ledger, "welfare");
    if (mealLedger != null) {
      var mealSum = App.Money.sumBy(result.months || [], function (r) { return r.meal || 0; });
      pushCheck(errors, "mealCost", "식대(복리후생비) 합계", -amt(mealSum), mealLedger,
        "엔진 월별 meal 합계", "분석 > 월별 분석 > 복리후생비 소계");
    }

    var supportActorLedger = ledgerSubtotal(ledger, "support-actor");
    if (supportActorLedger != null) {
      var sgaPolicies = (state.settings && state.settings.supportPolicies || []).filter(function (p) {
        return p && p.include === true && p.costClass === "sga";
      });
      var supportSum = App.Money.sumBy(sgaPolicies, function (p) {
        var share = App.Money.toRatio(p.soloCompanyShareRate != null ? p.soloCompanyShareRate : 1);
        return (App.Engine.supportPolicyMonthlyAmount ? App.Engine.supportPolicyMonthlyAmount(p, state) : 0) * share;
      });
      pushCheck(errors, "companySupport", "회사 지원비(연기수업료·PT·경락·피부관리 등)", -amt(supportSum), supportActorLedger,
        "시뮬레이션 설정 > 회사 지원", "분석 > 월별 분석 > 배우 활동지원 소계", 1);
    }

    var lunchTruckPolicy = ((state.settings && state.settings.supportPolicies) || []).filter(function (p) {
      return p && p.id === "sp-lunch-truck";
    })[0];
    if (lunchTruckPolicy && lunchTruckPolicy.costClass === "sga") {
      errors.push({
        key: "lunchTruckDup",
        label: "밥차 중복 반영 위험",
        expected: "project",
        actual: "sga",
        difference: null,
        source: "시뮬레이션 설정 > 회사 지원 > 밥차(costClass)",
        analysisPath: "분석 > 월별 분석 > 배우 활동지원 / 매출원가"
      });
    }

    var closingRow = ledgerResultRow(ledger, "closing");
    var endClosingLedger = (closingRow && ledger.months && ledger.months.length)
      ? amt(closingRow.values[ledger.months[ledger.months.length - 1]])
      : null;
    if (endClosingLedger != null) {
      var expectedAfterTax = kpis.endClosingAfterTax != null ? kpis.endClosingAfterTax : kpis.endClosing;
      pushCheck(errors, "endClosing", "월말 자금(세후, 마지막 달)", expectedAfterTax, endClosingLedger,
        "엔진 kpis.endClosingAfterTax", "분석 > 월별 분석 > 월말 자금(마지막 달)");
    }

    return { valid: errors.length === 0, errors: errors };
  }

  App.Engine.validateAnalysisConsistency = validateAnalysisConsistency;
})();
