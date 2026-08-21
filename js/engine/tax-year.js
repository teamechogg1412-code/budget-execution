(function () {
  window.App = window.App || {};

  function yearOf(month) {
    var y = Number(String(month || "").slice(0, 4));
    return y >= 2000 && y <= 2100 ? y : 0;
  }

  function yearsFromMonths(months) {
    var seen = {};
    var out = [];
    (months || []).forEach(function (m) {
      var key = typeof m === "string" ? m : (m && m.month);
      var y = yearOf(key);
      if (!y || seen[y]) return;
      seen[y] = true;
      out.push(y);
    });
    out.sort(function (a, b) { return a - b; });
    return out;
  }

  function monthsInYear(months, year) {
    year = Number(year);
    return (months || []).filter(function (m) {
      var key = typeof m === "string" ? m : (m && m.month);
      return yearOf(key) === year;
    });
  }

  function groupFlowsByYear(flows) {
    var byYear = {};
    (flows || []).forEach(function (row) {
      var y = yearOf(row && row.month);
      if (!y) return;
      if (!byYear[y]) {
        byYear[y] = { year: y, months: [], revenue: 0, pnlExpense: 0, preTaxProfit: 0 };
      }
      byYear[y].months.push(row.month);
      byYear[y].revenue += App.Money.roundWon(row.inflow);
      byYear[y].pnlExpense += App.Money.roundWon(row.pnlExpense);
    });
    Object.keys(byYear).forEach(function (key) {
      var b = byYear[key];
      b.revenue = App.Money.roundWon(b.revenue);
      b.pnlExpense = App.Money.roundWon(b.pnlExpense);
      b.preTaxProfit = App.Money.roundWon(b.revenue - b.pnlExpense);
    });
    return byYear;
  }

  App.TaxYear = {
    yearOf: yearOf,
    yearsFromMonths: yearsFromMonths,
    monthsInYear: monthsInYear,
    groupFlowsByYear: groupFlowsByYear
  };
})();
