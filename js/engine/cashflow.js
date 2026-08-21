(function () {
  window.App = window.App || {};
  App.Engine = App.Engine || {};

  function monthTotal(map, month) {
    return (map[month] && App.Money.roundWon(map[month].total)) || 0;
  }

  function calculateMonthlyCashFlow(state, parts) {
    var months = parts.months;
    var flows = [];
    var opening = App.Money.roundWon(state.profile.initialCash);
    months.forEach(function (month) {
      var inflow = monthTotal(parts.revenue.byMonth, month) +
        monthTotal((parts.planInflows && parts.planInflows.byMonth) || {}, month);
      var otherInflow = monthTotal(parts.otherInflows.byMonth, month);
      var payroll = monthTotal(parts.payroll.byMonth, month);
      var insurance = (parts.insurance.byMonth[month] && parts.insurance.byMonth[month].total) || 0;
      var severance = monthTotal(parts.severance.byMonth, month);
      var meal = (parts.meals[month] && parts.meals[month].welfareAmount) || 0;
      var recurring = monthTotal(parts.recurring.byMonth, month);
      var support = monthTotal(parts.support || {}, month);
      var dayBased = monthTotal(parts.dayBased.byMonth, month);
      var projectDirect = monthTotal(parts.direct.byMonth, month);
      var projectExpense = monthTotal((parts.projectExpense && parts.projectExpense.byMonth) || {}, month);
      var lunchTruck = monthTotal(parts.lunchTruck || {}, month);
      var fees = monthTotal(parts.fees.byMonth, month);
      var revenueFeeItems = ((parts.revenueFees && parts.revenueFees.byMonth[month]) || {}).items || [];
      var revenueFeeSga = 0;
      var revenueFeeProject = 0;
      var revenueFeeAgency = 0;
      revenueFeeItems.forEach(function (it) {
        if (it.category === "agency") revenueFeeAgency += it.amount;
        else if (it.category === "project") revenueFeeProject += it.amount;
        else revenueFeeSga += it.amount;
      });
      revenueFeeSga = App.Money.roundWon(revenueFeeSga);
      revenueFeeProject = App.Money.roundWon(revenueFeeProject);
      revenueFeeAgency = App.Money.roundWon(revenueFeeAgency);
      var revenueFees = App.Money.roundWon(revenueFeeSga + revenueFeeProject + revenueFeeAgency);
      var oneTimeOpEx = monthTotal(parts.startup.byMonth, month) + monthTotal(parts.otherOneTime.byMonth, month);
      var startupCost = monthTotal(parts.startup.byMonth, month);
      var capex = monthTotal(parts.assets.byMonth, month);
      var deposits = monthTotal(parts.deposits.byMonth, month);
      var taxCashOut = 0;
      var corporateTaxCashOut = 0;
      var localIncomeTaxCashOut = 0;
      var vat = parts.vat || {};
      var vatOutput = App.Money.roundWon((vat.outputByMonth && vat.outputByMonth[month]) || 0);
      var vatSettlement = App.Money.roundWon((vat.settlementByMonth && vat.settlementByMonth[month]) || 0);

      var pnlExpense = payroll + insurance + severance + meal + recurring + support + dayBased +
        projectDirect + projectExpense + lunchTruck + fees + revenueFees + oneTimeOpEx;
      var cashOut = pnlExpense + deposits + capex + taxCashOut + vatSettlement;
      var closing = opening + inflow + otherInflow + vatOutput - cashOut;

      flows.push({
        month: month,
        opening: opening,
        inflow: inflow,
        inflowItems: ((parts.revenue.byMonth[month] && parts.revenue.byMonth[month].items) || []).concat(
          ((parts.planInflows && parts.planInflows.byMonth[month] && parts.planInflows.byMonth[month].items) || [])
        ),
        otherInflow: otherInflow,
        otherInflowItems: (parts.otherInflows.byMonth[month] && parts.otherInflows.byMonth[month].items) || [],
        payroll: payroll,
        insurance: insurance,
        insuranceDetail: parts.insurance.byMonth[month] || {},
        severance: severance,
        meal: meal,
        mealBreakdown: (parts.meals[month] && parts.meals[month].breakdown) || {},
        mealHeadcount: (parts.meals[month] && parts.meals[month].headcount) || 0,
        mealDailyRate: (parts.meals[month] && parts.meals[month].dailyRate) || 0,
        mealBaseAmount: (parts.meals[month] && parts.meals[month].amount) || 0,
        mealExtraRate: (parts.meals[month] && parts.meals[month].extraRate) || 0,
        mealExtraAmount: (parts.meals[month] && parts.meals[month].extraAmount) || 0,
        welfareMultiplier: (parts.meals[month] && parts.meals[month].welfareMultiplier) || 1,
        recurring: recurring,
        support: support,
        supportItems: (parts.support && parts.support[month] && parts.support[month].items) || [],
        dayBased: dayBased,
        projectDirect: projectDirect,
        projectExpense: projectExpense,
        lunchTruck: lunchTruck,
        lunchTruckItems: (parts.lunchTruck && parts.lunchTruck[month] && parts.lunchTruck[month].items) || [],
        fees: fees,
        revenueFees: revenueFees,
        revenueFeeSga: revenueFeeSga,
        revenueFeeProject: revenueFeeProject,
        revenueFeeAgency: revenueFeeAgency,
        revenueFeeItems: revenueFeeItems,
        oneTimeOpEx: oneTimeOpEx,
        startupCost: startupCost,
        capex: capex,
        deposits: deposits,
        taxCashOut: taxCashOut,
        corporateTaxCashOut: corporateTaxCashOut,
        localIncomeTaxCashOut: localIncomeTaxCashOut,
        vatOutput: vatOutput,
        vatSettlement: vatSettlement,
        vatBalance: App.Money.roundWon((vat.byMonth && vat.byMonth[month] && vat.byMonth[month].balance) || 0),
        cashOut: cashOut,
        pnlExpense: pnlExpense,
        closing: closing,
        belowZero: closing < 0,
        belowSafety: closing < App.Money.roundWon(state.profile.safetyCash)
      });
      opening = closing;
    });
    return flows;
  }

  function taxCashEntry(entry) {
    if (entry && typeof entry === "object") {
      var corporate = App.Money.roundWon(entry.corporate || 0);
      var local = App.Money.roundWon(entry.local || 0);
      var total = entry.total != null
        ? App.Money.roundWon(entry.total)
        : App.Money.roundWon(corporate + local);
      return { total: total, corporate: corporate, local: local };
    }
    var n = App.Money.roundWon(entry || 0);
    return { total: n, corporate: n, local: 0 };
  }

  function applyTaxCashOut(flows, taxTotal, cashOutMonth) {
    if (!cashOutMonth || !taxTotal) return flows;
    var map = {};
    map[cashOutMonth] = App.Money.roundWon(taxTotal);
    return applyTaxCashOutMap(flows, map);
  }

  function applyTaxCashOutMap(flows, byMonth) {
    byMonth = byMonth || {};
    var firstIdx = -1;
    var i;
    for (i = 0; i < (flows || []).length; i++) {
      if (byMonth[flows[i].month]) { firstIdx = i; break; }
    }
    if (firstIdx < 0) return flows;
    var nextOpening = null;
    for (var j = firstIdx; j < flows.length; j++) {
      var row = flows[j];
      if (nextOpening !== null) row.opening = nextOpening;
      var parts = taxCashEntry(byMonth[row.month]);
      row.taxCashOut = parts.total;
      row.corporateTaxCashOut = parts.corporate;
      row.localIncomeTaxCashOut = parts.local;
      row.cashOut = row.pnlExpense + row.deposits + row.capex + row.taxCashOut + (row.vatSettlement || 0);
      row.closing = row.opening + row.inflow + row.otherInflow + (row.vatOutput || 0) - row.cashOut;
      row.belowZero = row.closing < 0;
      nextOpening = row.closing;
    }
    return flows;
  }

  function applyCorporateTaxCashOut(flows, tax, taxSettings) {
    taxSettings = taxSettings || {};
    if (taxSettings.cashOutMonth) {
      var lump = App.Money.roundWon(tax && tax.total);
      if (!lump) return flows;
      var lumpMap = {};
      lumpMap[taxSettings.cashOutMonth] = {
        total: lump,
        corporate: App.Money.roundWon(tax && tax.corporate),
        local: App.Money.roundWon(tax && tax.local)
      };
      return applyTaxCashOutMap(flows, lumpMap);
    }
    if (taxSettings.cashOutMode !== "nextMarch" || !tax || !tax.byYear) return flows;
    var map = {};
    Object.keys(tax.byYear).forEach(function (year) {
      var y = tax.byYear[year] || {};
      var amount = App.Money.roundWon(y.totalTax);
      if (!amount) return;
      var month = String(Number(year) + 1) + "-03";
      var prev = taxCashEntry(map[month]);
      map[month] = {
        total: App.Money.roundWon(prev.total + amount),
        corporate: App.Money.roundWon(prev.corporate + App.Money.roundWon(y.corporateTax)),
        local: App.Money.roundWon(prev.local + App.Money.roundWon(y.localIncomeTax))
      };
    });
    return applyTaxCashOutMap(flows, map);
  }

  function calculateMinimumCashBalance(flows) {
    if (!flows.length) return { min: 0, month: "" };
    var min = flows[0].closing;
    var month = flows[0].month;
    flows.forEach(function (row) {
      if (row.closing < min) {
        min = row.closing;
        month = row.month;
      }
    });
    return { min: min, month: month };
  }

  function calculateRequiredWorkingCapital(minClosing, safety) {
    var s = App.Money.roundWon(safety);
    return {
      deficitCover: Math.max(0, -minClosing),
      recommended: Math.max(0, s - minClosing)
    };
  }

  function calculateBurnRate(flows) {
    if (!flows.length) return 0;
    var sum = 0;
    flows.forEach(function (row) {
      sum += row.payroll + row.insurance + row.severance + row.meal + row.recurring + row.support + row.dayBased;
    });
    return App.Money.roundWon(sum / flows.length);
  }

  function calculateProfit(flows, projects, revenueMeta) {
    var revenue = App.Money.sumBy(flows, function (r) { return r.inflow; });
    var pnlExpense = App.Money.sumBy(flows, function (r) { return r.pnlExpense; });
    var operating = revenue - pnlExpense;
    var contractTotal = 0;
    (projects || []).forEach(function (p) {
      if (p.status !== "cancelled") contractTotal += App.Money.roundWon(p.contractAmount);
    });
    return {
      revenue: revenue,
      pnlExpense: pnlExpense,
      operatingProfit: operating,
      margin: revenue === 0 ? null : operating / revenue,
      contractTotal: contractTotal,
      inflowBeforePeriod: revenueMeta.before || 0,
      inflowAfterPeriod: revenueMeta.after || 0
    };
  }

  App.Engine.calculateMonthlyCashFlow = calculateMonthlyCashFlow;
  App.Engine.applyTaxCashOut = applyTaxCashOut;
  App.Engine.applyCorporateTaxCashOut = applyCorporateTaxCashOut;
  App.Engine.calculateMinimumCashBalance = calculateMinimumCashBalance;
  App.Engine.calculateRequiredWorkingCapital = calculateRequiredWorkingCapital;
  App.Engine.calculateBurnRate = calculateBurnRate;
  App.Engine.calculateProfit = calculateProfit;
})();
