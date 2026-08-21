(function () {
  window.App = window.App || {};

  var BRACKETS_PRE_2026 = [
    { upTo: 200000000, rate: 0.09, deduction: 0 },
    { upTo: 20000000000, rate: 0.19, deduction: 20000000 },
    { upTo: 300000000000, rate: 0.21, deduction: 420000000 },
    { upTo: Infinity, rate: 0.24, deduction: 9420000000 }
  ];

  var BRACKETS_FROM_2026 = [
    { upTo: 200000000, rate: 0.10, deduction: 0 },
    { upTo: 20000000000, rate: 0.20, deduction: 20000000 },
    { upTo: 300000000000, rate: 0.22, deduction: 420000000 },
    { upTo: Infinity, rate: 0.25, deduction: 9420000000 }
  ];

  var SOURCE_PRE_2026 = "법인세 기본세율 (2025년 이전 개시 사업연도). 시뮬레이션용이며 실제 신고세액과 다를 수 있습니다.";
  var SOURCE_FROM_2026 = "법인세 기본세율 (2026년 1월 1일 이후 개시 사업연도, 전 구간 1%p 인상). 시뮬레이션용이며 실제 신고세액과 다를 수 있습니다.";

  function tableFor(year, brackets, source) {
    return {
      year: year,
      brackets: brackets,
      localRate: 0.10,
      source: source
    };
  }

  var TABLES = {
    2024: tableFor(2024, BRACKETS_PRE_2026, SOURCE_PRE_2026),
    2025: tableFor(2025, BRACKETS_PRE_2026, SOURCE_PRE_2026),
    2026: tableFor(2026, BRACKETS_FROM_2026, SOURCE_FROM_2026),
    2027: tableFor(2027, BRACKETS_FROM_2026, SOURCE_FROM_2026),
    2028: tableFor(2028, BRACKETS_FROM_2026, SOURCE_FROM_2026)
  };

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

  function isCatalogCorporateBrackets(brackets) {
    if (!Array.isArray(brackets) || brackets.length < 2) return false;
    var r0 = Number(brackets[0] && brackets[0].rate);
    var r1 = Number(brackets[1] && brackets[1].rate);
    return (r0 === 0.09 && r1 === 0.19) || (r0 === 0.10 && r1 === 0.20);
  }

  App.CorporateTax = {
    TABLES: TABLES,
    BRACKETS_PRE_2026: BRACKETS_PRE_2026,
    BRACKETS_FROM_2026: BRACKETS_FROM_2026,
    SOURCE: SOURCE_FROM_2026,
    availableYears: availableYears,
    resolveTable: resolveTable,
    isCatalogCorporateBrackets: isCatalogCorporateBrackets
  };
})();
