(function () {
  window.App = window.App || {};
  App.Engine = App.Engine || {};

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
      var rate = App.Money.toRatio(fee.rate);
      if (!rate) {
        warnings.push({
          code: "revenue_fee_without_rate",
          message: (fee.name || "매출 연동 수수료") + "에 수수료율이 없습니다."
        });
        return;
      }
      (months || []).forEach(function (m) {
        var scope = fee.revenueScope || fee.basis || "totalRevenue";
        var baseMap = (revenueBaseByScope || {})[scope] || {};
        var base = App.Money.roundWon(baseMap[m]);
        if (!base) return;
        var amount = App.Money.roundWon(base * rate);
        if (!amount) return;
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
    });
    return { byMonth: byMonth, totalsByFee: totalsByFee, warnings: warnings };
  }

  App.Engine.calculateRevenueFees = calculateRevenueFees;
})();
