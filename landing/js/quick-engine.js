(function () {
  window.App = window.App || {};

  // Quick Simulation 전용 경량 계산. 상세 엔진(js/engine/*)은 입력 항목이 수십 개라
  // 7개 입력만 받는 이 화면에는 맞지 않는다. 세율 데이터(corporate-tax.js, personal-tax.js)와
  // 엔진의 세금 계산 함수(engine/tax.js, engine/personal-tax.js)만 그대로 재사용한다.
  //
  // 가정치(ASSUMPTIONS)는 "직원 1인당 예상 연봉"처럼 Quick 화면에 없는 항목을 메우기 위한
  // 대략치다. 정확한 값이 필요하면 상세 계산(직원별 급여 입력)으로 넘어가야 한다 — 이 화면은
  // 방향성만 보여주는 용도.
  var ASSUMPTIONS = {
    taxYear: 2027,
    annualSalaryPerEmployee: 36000000, // 직원 1인당 예상 연봉(관리자 등, 대략치). 상세 계산에서는 직접 입력
    employerInsuranceRate: 0.10,       // 4대보험 회사부담분 근사치(인건비의 약 10%)
    actorBusinessExpenseSimpleRate: 0.29 // 배우 사업소득 단순경비율 근사치 (personal-tax.js 참고)
  };

  function num(v) {
    return App.Money.roundWon(v);
  }

  function ratio(v) {
    return App.Money.toRatio(v);
  }

  function calculate(input) {
    input = input || {};
    var year = ASSUMPTIONS.taxYear;

    var annualWorkIncome = num(input.annualWorkIncome);
    var annualAdIncome = num(input.annualAdIncome);
    var currentAgencyRate = ratio(input.currentAgencyRate);       // 배우가 가져가는 정산 비율
    var currentAgencyCoveredCost = num(input.currentAgencyCoveredCost);
    var employeeCount = Math.max(0, num(input.employeeCount));
    var ownerSalaryMonthly = num(input.ownerSalary);
    var otherOpCost = num(input.otherOpCost);

    var grossRevenue = num(annualWorkIncome + annualAdIncome);

    // ---- 현재 전속계약 ----
    var actorGrossShare = num(grossRevenue * currentAgencyRate);
    var actorNecessaryExpenses = num(actorGrossShare * ASSUMPTIONS.actorBusinessExpenseSimpleRate);
    var actorTax = App.Engine.calculatePersonalTaxDetail(actorGrossShare, {
      year: year,
      incomeType: "business",
      necessaryExpenses: actorNecessaryExpenses
    });
    var currentContractNet = num(actorGrossShare - actorTax.totalPersonalTax);

    // ---- 1인 기획사 ----
    var ownerSalaryAnnual = num(ownerSalaryMonthly * 12);
    var employeePayroll = num(employeeCount * ASSUMPTIONS.annualSalaryPerEmployee);
    var payrollTotal = num(ownerSalaryAnnual + employeePayroll);
    var insuranceCost = num(payrollTotal * ASSUMPTIONS.employerInsuranceRate);
    var totalOpCost = num(payrollTotal + insuranceCost + otherOpCost);
    var corporateProfit = Math.max(0, num(grossRevenue - totalOpCost));
    var corporateResult = App.Engine.calculateEstimatedTax(
      { revenue: grossRevenue, pnlExpense: totalOpCost },
      {},
      year
    );
    var netRetained = num(corporateProfit - corporateResult.total);
    var ownerTax = App.Engine.calculatePersonalTaxDetail(ownerSalaryAnnual, {
      year: year,
      incomeType: "earned"
    });
    var ownerTakeHome = num(ownerSalaryAnnual - ownerTax.totalPersonalTax);
    var soloAgencyNet = num(ownerTakeHome + netRetained);

    var difference = num(soloAgencyNet - currentContractNet);

    return {
      currentContractNet: currentContractNet,
      soloAgencyNet: soloAgencyNet,
      difference: difference,
      favorable: difference >= 0 ? "solo" : "current",
      detail: {
        grossRevenue: grossRevenue,
        actorGrossShare: actorGrossShare,
        actorPersonalTax: actorTax.totalPersonalTax,
        currentAgencyCoveredCost: currentAgencyCoveredCost,
        payrollTotal: payrollTotal,
        insuranceCost: insuranceCost,
        otherOpCost: otherOpCost,
        totalOpCost: totalOpCost,
        corporateProfit: corporateProfit,
        corporateTax: corporateResult.total,
        netRetained: netRetained,
        ownerSalaryAnnual: ownerSalaryAnnual,
        ownerPersonalTax: ownerTax.totalPersonalTax,
        ownerTakeHome: ownerTakeHome
      }
    };
  }

  App.QuickEngine = {
    ASSUMPTIONS: ASSUMPTIONS,
    calculate: calculate
  };
})();
