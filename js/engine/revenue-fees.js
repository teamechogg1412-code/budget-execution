(function () {
  window.App = window.App || {};
  App.Engine = App.Engine || {};

  function feeRateForMonth(fee, month) {
    var base = App.Money.toRatio(fee && fee.rate);
    var year = Number(String(month || "").slice(0, 4));
    if (App.Defaults && typeof App.Defaults.yearRatioFromMap === "function") {
      return App.Defaults.yearRatioFromMap(fee && fee.rateByYear, year, base);
    }
    return base;
  }

  function calculateRevenueFees(list, revenueBaseByScope, months) {
    var byMonth = {};
    (months || []).forEach(function (m) { byMonth[m] = { total: 0, items: [] }; });
    var totalsByFee = {};
    var warnings = [];
    (list || []).forEach(function (fee) {
      if (fee && fee.id) totalsByFee[fee.id] = 0;
    });
    (list || []).forEach(function (fee) {
      if (!fee || fee.include === false) return;
      var appliedAny = false;
      (months || []).forEach(function (m) {
        var rate = feeRateForMonth(fee, m);
        if (!rate) return;
        var scope = fee.revenueScope || fee.basis || "totalRevenue";
        var baseMap = (revenueBaseByScope || {})[scope] || {};
        var base = App.Money.roundWon(baseMap[m]);
        if (!base) return;
        var amount = App.Money.roundWon(base * rate);
        if (!amount) return;
        appliedAny = true;
        byMonth[m].total = App.Money.roundWon(byMonth[m].total + amount);
        byMonth[m].items.push({
          feeId: fee.id,
          name: fee.name || "매출 연동 수수료",
          category: (fee.category === "agency" || fee.category === "project") ? "agency" : "sga",
          revenueScope: scope,
          rate: rate,
          amount: amount
        });
        totalsByFee[fee.id] = App.Money.roundWon(totalsByFee[fee.id] + amount);
      });
      if (!appliedAny && !App.Money.toRatio(fee.rate) &&
          !(fee.rateByYear && typeof fee.rateByYear === "object" &&
            Object.keys(fee.rateByYear).some(function (k) {
              return App.Money.toSafeNumber(fee.rateByYear[k]) > 0;
            }))) {
        warnings.push({
          code: "revenue_fee_without_rate",
          message: (fee.name || "매출 연동 수수료") + "에 수수료율이 없습니다."
        });
      }
    });
    return { byMonth: byMonth, totalsByFee: totalsByFee, warnings: warnings };
  }

  App.Engine.calculateRevenueFees = calculateRevenueFees;
  App.Engine.feeRateForMonth = feeRateForMonth;
})();
