(function () {
  window.App = window.App || {};

  var BRACKETS_2023 = [
    { upTo: 14000000, rate: 0.06, deduction: 0 },
    { upTo: 50000000, rate: 0.15, deduction: 1260000 },
    { upTo: 88000000, rate: 0.24, deduction: 5760000 },
    { upTo: 150000000, rate: 0.35, deduction: 15440000 },
    { upTo: 300000000, rate: 0.38, deduction: 19940000 },
    { upTo: 500000000, rate: 0.40, deduction: 25940000 },
    { upTo: 1000000000, rate: 0.42, deduction: 35940000 },
    { upTo: null, rate: 0.45, deduction: 65940000 }
  ];

  var SOURCE_2023 = "국세청 종합소득세 기본세율 (2023년 이후). 시뮬레이션용이며 실제 신고세액과 다를 수 있습니다.";

  // 이자·배당 등 금융소득이 연 2,000만원을 초과하면 금융소득 종합과세 대상 (국세청).
  // 본 시뮬은 배당만 보며, 배당세액공제 등 정밀특례는 1차 미반영.
  var FINANCIAL_INCOME_COMPREHENSIVE_THRESHOLD = 20000000;

  function tableFor(year) {
    return {
      year: year,
      brackets: BRACKETS_2023,
      localRate: 0.10,
      source: SOURCE_2023
    };
  }

  var TABLES = {
    2023: tableFor(2023),
    2024: tableFor(2024),
    2025: tableFor(2025),
    2026: tableFor(2026),
    2027: tableFor(2027)
  };

  var BUSINESS_EXPENSE_RATE_SOURCE_2025 =
    "국세청 2025년 귀속 기준경비율·단순경비율 고시. 시뮬레이션용 참고값이며 실제 단순경비율 적용 가능 여부는 신고 요건에 따라 달라질 수 있습니다.";

  var BUSINESS_EXPENSE_RATES = {
    2025: {
      "940302": {
        businessCode: "940302",
        businessName: "배우·탤런트 등",
        simpleRate: 0.29,
        standardRate: 0.059,
        source: BUSINESS_EXPENSE_RATE_SOURCE_2025
      }
    }
  };

  function getBusinessExpenseRate(year, businessCode) {
    var byYear = BUSINESS_EXPENSE_RATES[Number(year)];
    var rule = byYear && byYear[businessCode];
    if (!rule) return null;
    return {
      taxYear: Number(year),
      businessCode: rule.businessCode,
      businessName: rule.businessName,
      simpleRate: rule.simpleRate,
      standardRate: rule.standardRate,
      source: rule.source
    };
  }

  var INCOME_TYPES = [
    { id: "earned", label: "근로·기타 개인소득 (급여/상여/배당 등)" },
    { id: "business", label: "사업소득 (전속 출연료 등)" },
    { id: "mixed", label: "혼합" },
    { id: "other", label: "기타 (직접 조정)" }
  ];

  function availableYears() {
    return Object.keys(TABLES).map(function (y) { return Number(y); }).sort(function (a, b) { return a - b; });
  }

  function resolveTable(year) {
    var y = Number(year);
    if (TABLES[y]) return TABLES[y];
    var years = availableYears();
    var i;
    var fallback = TABLES[years[years.length - 1]];
    for (i = years.length - 1; i >= 0; i--) {
      if (years[i] <= y) return TABLES[years[i]];
    }
    return TABLES[years[0]] || fallback;
  }

  function calculateEarnedIncomeDeduction(grossPay) {
    var g = App.Money.roundWon(grossPay);
    if (g <= 0) return 0;
    var ded = 0;
    if (g <= 5000000) ded = App.Money.roundWon(g * 0.70);
    else if (g <= 15000000) ded = App.Money.roundWon(3500000 + (g - 5000000) * 0.40);
    else if (g <= 45000000) ded = App.Money.roundWon(7500000 + (g - 15000000) * 0.15);
    else if (g <= 100000000) ded = App.Money.roundWon(12000000 + (g - 45000000) * 0.05);
    else ded = App.Money.roundWon(14750000 + (g - 100000000) * 0.02);
    var cap = 20000000;
    if (ded > cap) ded = cap;
    if (ded > g) ded = g;
    return ded;
  }

  function earnedIncomeTaxCreditLimit(grossPay) {
    var g = App.Money.roundWon(grossPay);
    if (g <= 0) return 0;
    if (g <= 33000000) return 740000;
    if (g <= 70000000) return Math.max(App.Money.roundWon(740000 - (g - 33000000) * 0.008), 660000);
    if (g <= 120000000) return Math.max(App.Money.roundWon(660000 - (g - 70000000) * 0.005), 500000);
    return Math.max(App.Money.roundWon(500000 - (g - 120000000) * 0.005), 200000);
  }

  function calculateEarnedIncomeTaxCredit(assessedTax, earnedGross) {
    var tax = App.Money.roundWon(assessedTax);
    var g = App.Money.roundWon(earnedGross);
    if (tax <= 0 || g <= 0) return 0;
    var credit = tax <= 1300000
      ? App.Money.roundWon(tax * 0.55)
      : App.Money.roundWon(715000 + (tax - 1300000) * 0.30);
    var cap = earnedIncomeTaxCreditLimit(g);
    if (credit > cap) credit = cap;
    if (credit > tax) credit = tax;
    return credit;
  }

  App.PersonalTax = {
    TABLES: TABLES,
    INCOME_TYPES: INCOME_TYPES,
    SOURCE: SOURCE_2023,
    BUSINESS_EXPENSE_RATES: BUSINESS_EXPENSE_RATES,
    FINANCIAL_INCOME_COMPREHENSIVE_THRESHOLD: FINANCIAL_INCOME_COMPREHENSIVE_THRESHOLD,
    availableYears: availableYears,
    resolveTable: resolveTable,
    getBusinessExpenseRate: getBusinessExpenseRate,
    calculateEarnedIncomeDeduction: calculateEarnedIncomeDeduction,
    earnedIncomeTaxCreditLimit: earnedIncomeTaxCreditLimit,
    calculateEarnedIncomeTaxCredit: calculateEarnedIncomeTaxCredit
  };
})();
