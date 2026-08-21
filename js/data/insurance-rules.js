(function () {
  window.App = window.App || {};

  var PENSION_BANDS = [
    { from: 202407, to: 202506, min: 390000, max: 6170000 },
    { from: 202507, to: 202606, min: 400000, max: 6370000 },
    { from: 202607, to: 202706, min: 410000, max: 6590000 }
  ];

  var HEALTH_CAP_BY_YEAR = {
    2025: 9008340,
    2026: 9183480,
    2027: 9183480,
    2028: 9183480
  };

  var PENSION_EMPLOYER_PRE_2026 = 0.045;
  var PENSION_EMPLOYER_FROM_2026 = 0.0475;

  var SOURCE = "국민연금 기준소득월액 상·하한은 매년 7월, 건강보험 보수월액 상한은 연 단위. 회사 부담 추정용. 국민연금 회사부담은 2026년부터 4.75%(총 9.5%의 1/2).";

  function monthKey(month) {
    var parsed = App.Month.parseMonth(month);
    if (!parsed) return 0;
    return parsed.year * 100 + parsed.month;
  }

  function isCatalogPensionEmployer(rate) {
    var n = App.Money.toSafeNumber(rate);
    return Math.abs(n - PENSION_EMPLOYER_PRE_2026) < 1e-8 ||
      Math.abs(n - PENSION_EMPLOYER_FROM_2026) < 1e-8;
  }

  function pensionEmployerFor(month) {
    var parsed = App.Month.parseMonth(month);
    var year = parsed ? parsed.year : 2026;
    return year >= 2026 ? PENSION_EMPLOYER_FROM_2026 : PENSION_EMPLOYER_PRE_2026;
  }

  function resolvePensionEmployer(month, rates) {
    var saved = rates && rates.pensionEmployer;
    if (saved == null || saved === "" || isCatalogPensionEmployer(saved)) {
      return pensionEmployerFor(month);
    }
    return App.Money.toSafeNumber(saved);
  }

  function pensionFor(month) {
    var key = monthKey(month);
    var i;
    var last = PENSION_BANDS[PENSION_BANDS.length - 1];
    if (!key) return { min: last.min, max: last.max, source: SOURCE };
    for (i = 0; i < PENSION_BANDS.length; i++) {
      if (key >= PENSION_BANDS[i].from && key <= PENSION_BANDS[i].to) {
        return { min: PENSION_BANDS[i].min, max: PENSION_BANDS[i].max, source: SOURCE };
      }
    }
    if (key < PENSION_BANDS[0].from) {
      return { min: PENSION_BANDS[0].min, max: PENSION_BANDS[0].max, source: SOURCE };
    }
    return { min: last.min, max: last.max, source: SOURCE };
  }

  function healthFor(month) {
    var parsed = App.Month.parseMonth(month);
    var year = parsed ? parsed.year : 2026;
    var max = HEALTH_CAP_BY_YEAR[year];
    if (!max) {
      var years = Object.keys(HEALTH_CAP_BY_YEAR).map(Number).sort(function (a, b) { return a - b; });
      max = year < years[0] ? HEALTH_CAP_BY_YEAR[years[0]] : HEALTH_CAP_BY_YEAR[years[years.length - 1]];
    }
    return { max: max, source: SOURCE };
  }

  function clampPensionBase(amount, month) {
    var n = App.Money.roundWon(amount);
    if (n <= 0) return 0;
    var rule = pensionFor(month);
    if (n < rule.min) return rule.min;
    if (n > rule.max) return rule.max;
    return n;
  }

  function clampHealthBase(amount, month) {
    var n = App.Money.roundWon(amount);
    if (n <= 0) return 0;
    var rule = healthFor(month);
    if (rule.max && n > rule.max) return rule.max;
    return n;
  }

  App.InsuranceRules = {
    SOURCE: SOURCE,
    PENSION_EMPLOYER_PRE_2026: PENSION_EMPLOYER_PRE_2026,
    PENSION_EMPLOYER_FROM_2026: PENSION_EMPLOYER_FROM_2026,
    pensionEmployerFor: pensionEmployerFor,
    resolvePensionEmployer: resolvePensionEmployer,
    isCatalogPensionEmployer: isCatalogPensionEmployer,
    pensionFor: pensionFor,
    healthFor: healthFor,
    clampPensionBase: clampPensionBase,
    clampHealthBase: clampHealthBase
  };
})();
