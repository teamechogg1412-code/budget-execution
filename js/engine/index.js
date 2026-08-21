(function () {
  window.App = window.App || {};
  App.Engine = App.Engine || {};

  function uniqueWarnings(list) {
    var seen = {};
    var out = [];
    (list || []).forEach(function (w) {
      var key = w.code + "|" + (w.projectId || "") + "|" + w.message;
      if (seen[key]) return;
      seen[key] = true;
      out.push(w);
    });
    return out;
  }

  function runSimulation(state) {
    var warnings = [];
    var period = App.Month.resolveSimulationPeriod(state);
    var start = period.startMonth;
    var end = period.endMonth;
    var months = period.months;
    warnings = warnings.concat(period.warnings || []);

    var pay = App.Engine.calculateProjectPayments(state.projects || []);
    warnings = warnings.concat(pay.warnings);

    var revenue = App.Engine.calculateMonthlyRevenue(state.projects || [], months, start, end);
    warnings = warnings.concat(revenue.warnings);

    var fees = App.Engine.calculateRevenueLinkedFees(state.projects || [], revenue.byMonth, months);
    warnings = warnings.concat(fees.warnings);

    var planInflows = App.Engine.calculatePlanInflows(state.salesPlans || [], months, start, end);

    var totalRevenueByMonth = {};
    var revenueBaseByScope = {};
    function addRevenueBase(scope, month, amount) {
      if (!revenueBaseByScope[scope]) revenueBaseByScope[scope] = {};
      revenueBaseByScope[scope][month] = App.Money.roundWon((revenueBaseByScope[scope][month] || 0) + App.Money.roundWon(amount));
    }
    months.forEach(function (m) {
      var items = (((revenue.byMonth[m] || {}).items) || []).concat(((planInflows.byMonth[m] || {}).items) || []);
      items.forEach(function (it) {
        var amount = App.Money.roundWon(it.amount);
        var cat = it.category || "other";
        addRevenueBase("totalRevenue", m, amount);
        addRevenueBase("category:" + cat, m, amount);
        if ((App.WorkCategories || []).some(function (c) { return c.id === cat; })) addRevenueBase("workRevenue", m, amount);
        if ((App.SalesCategories || []).some(function (c) { return c.id === cat; })) addRevenueBase("salesRevenue", m, amount);
      });
      totalRevenueByMonth[m] = App.Money.roundWon((revenueBaseByScope.totalRevenue || {})[m]);
    });
    var revenueFees = App.Engine.calculateRevenueFees(state.revenueFees || [], revenueBaseByScope, months);
    warnings = warnings.concat(revenueFees.warnings);

    var payroll = App.Engine.calculatePayroll(state.employees || [], months);
    var insurance = App.Engine.calculateInsurance(payroll.byMonth, months, state.settings.insuranceRates);
    var severance = App.Engine.calculateSeverance(
      state.employees || [],
      months,
      payroll.byMonth,
      state.settings.severance,
      state.severanceManual || {}
    );
    if (severance.mode === "manual" && severance.allZero) {
      var hasSev = (state.employees || []).some(function (e) { return e.severance && e.include !== false; });
      if (hasSev) {
        warnings.push({
          code: "severance_manual_empty",
          message: "퇴직급여가 직접 입력이고 전 기간 0원입니다."
        });
      }
    }

    var dayMap = {};
    var missingHolidayYears = {};
    months.forEach(function (m) {
      var parsed = App.Month.parseMonth(m);
      var breakdown = App.Calendar.calculateWorkingDays(
        m,
        state.settings.meal,
        state.customHolidays,
        state.forcedWorkdays
      );
      dayMap[m] = breakdown;
      if (breakdown.missingHolidayYear && parsed) missingHolidayYears[parsed.year] = true;
    });
    Object.keys(missingHolidayYears).forEach(function (year) {
      warnings.push({
        code: "holiday_year_missing",
        message: year + "년 공휴일 데이터가 없어 요일만으로 식대 일수를 계산합니다."
      });
    });

    var meals = {};
    var extra = state.mealExtraHeadcount;
    var welfareMultiplier = (App.Defaults && App.Defaults.welfareMultiplier) ? App.Defaults.welfareMultiplier(state) : 2;
    var extraRate = (App.Defaults && App.Defaults.mealExtraRate) ? App.Defaults.mealExtraRate(state) : 0.5;
    months.forEach(function (m) {
      var headcount = App.Engine.calculateMealHeadcount(state.employees || [], extra, m, months[months.length - 1], months[0]);
      var days = dayMap[m].workingDays;
      var dailyRate = App.Money.roundWon(state.settings.meal && state.settings.meal.dailyRate);
      var mealAmount = App.Money.roundWon(dailyRate * headcount * days);
      var extraAmount = App.Defaults && App.Defaults.mealExtraAmount
        ? App.Defaults.mealExtraAmount(mealAmount, state)
        : App.Money.roundWon(mealAmount * extraRate);
      var welfareAmount = App.Defaults && App.Defaults.welfareAmountFromMealBase
        ? App.Defaults.welfareAmountFromMealBase(mealAmount, state)
        : App.Money.roundWon((mealAmount + extraAmount) * welfareMultiplier);
      meals[m] = {
        headcount: headcount,
        dailyRate: dailyRate,
        breakdown: dayMap[m],
        amount: mealAmount,
        extraRate: extraRate,
        extraAmount: extraAmount,
        welfareMultiplier: welfareMultiplier,
        welfareAmount: welfareAmount
      };
    });

    var timing = state.settings.initialCashTiming || "beforeOutflows";
    var startup = App.Engine.calculateOneTimeByMonth(state.startupExpenses, months, start, timing, "startup", {
      corporateStatus: state.settings.corporateStatus || "new"
    });
    var deposits = App.Engine.calculateOneTimeByMonth(
      App.Engine.depositsForSimulation(state),
      months,
      start,
      timing,
      "deposit"
    );
    var assets = App.Engine.calculateOneTimeByMonth(state.assets, months, start, timing, "capex");
    var otherOneTime = App.Engine.calculateOneTimeByMonth(state.otherOneTimeExpenses, months, start, timing, "opex");
    var skipped = startup.skippedStart.concat(deposits.skippedStart, assets.skippedStart);
    if (skipped.length) {
      warnings.push({
        code: "startup_already_in_opening",
        message: "최초 보유현금이 설립·보증금·자산 지출 후 잔액입니다. 시작월 해당 지출은 현금흐름에서 빼지 않습니다."
      });
    }

    var recurring = App.Engine.calculateRecurringExpenses(state.recurringExpenses, months);
    var headcountByMonth = {};
    months.forEach(function (m) { headcountByMonth[m] = meals[m].headcount; });
    var dayBased = App.Engine.calculateDayBasedExpense(state.dayBasedExpenses, months, dayMap, headcountByMonth);
    var direct = App.Engine.calculateProjectDirectExpenses(state.projects, months);
    var projectExpense = App.Engine.calculateProjectExpenses(state.projects, months, state);
    warnings = warnings.concat(projectExpense.warnings);
    var otherInflows = App.Engine.calculateOtherInflows(state.otherInflows, months);
    var support = App.Engine.mergeSupportResults(
      App.Engine.calculateSupportPolicies(state, months),
      App.Engine.calculateVehicleSupport(state.vehicles || [], months),
      months
    );
    var lunchTruck = App.Engine.calculateLunchTruckSupport(state, months);

    var parts = {
      months: months,
      revenue: revenue,
      otherInflows: otherInflows,
      planInflows: planInflows,
      payroll: payroll,
      insurance: insurance,
      severance: severance,
      meals: meals,
      recurring: recurring,
      dayBased: dayBased,
      direct: direct,
      projectExpense: projectExpense,
      fees: fees,
      revenueFees: revenueFees,
      startup: startup,
      otherOneTime: otherOneTime,
      assets: assets,
      deposits: deposits,
      support: support.soloByMonth,
      lunchTruck: lunchTruck.byMonth
    };
    var vat = App.Engine.calculateVatCashFlow(state, parts, months);
    parts.vat = vat;

    var flows = App.Engine.calculateMonthlyCashFlow(state, parts);
    var profit = App.Engine.calculateProfit(flows, state.projects, revenue);
    var tax = App.Engine.calculateCorporateTaxByYears(flows, state.settings.tax);
    flows = App.Engine.applyCorporateTaxCashOut(flows, tax, state.settings.tax);
    if (App.Engine.applyOwnerDividend) {
      flows = App.Engine.applyOwnerDividend(state, flows, {
        afterTaxNet: tax.afterTaxNet,
        operatingProfit: profit.operatingProfit,
        byYear: tax.byYear,
        revenue: profit.revenue
      });
    }
    if (App.Engine.applyOwnerProfitShare) {
      flows = App.Engine.applyOwnerProfitShare(state, flows);
    }
    if (App.Engine.applyCorporateTaxPending) {
      flows = App.Engine.applyCorporateTaxPending(flows, tax, state.settings.tax);
    }
    flows.forEach(function (row) {
      if (row.closingAfterTax == null) row.closingAfterTax = row.closing;
      row.belowSafety = row.closing < App.Money.roundWon(state.profile.safetyCash);
    });

    var minCash = App.Engine.calculateMinimumCashBalance(flows);
    var capital = App.Engine.calculateRequiredWorkingCapital(minCash.min, state.profile.safetyCash);
    var burn = App.Engine.calculateBurnRate(flows);
    var endRow = flows[flows.length - 1];

    var corporateTaxAccrued = 0;
    var localTaxAccrued = 0;
    Object.keys(tax.byYear || {}).forEach(function (y) {
      corporateTaxAccrued = App.Money.roundWon(corporateTaxAccrued + App.Money.roundWon(tax.byYear[y].corporateTax));
      localTaxAccrued = App.Money.roundWon(localTaxAccrued + App.Money.roundWon(tax.byYear[y].localIncomeTax));
    });
    var corporateTaxCashPaid = App.Money.sumBy(flows, function (r) { return r.corporateTaxCashOut || 0; });
    var localTaxCashPaid = App.Money.sumBy(flows, function (r) { return r.localIncomeTaxCashOut || 0; });
    var corporateTaxPending = Math.max(0, App.Money.roundWon(corporateTaxAccrued - corporateTaxCashPaid));
    var localTaxPending = Math.max(0, App.Money.roundWon(localTaxAccrued - localTaxCashPaid));

    var kpis = {
      contractTotal: profit.contractTotal,
      inflowInPeriod: profit.revenue,
      inflowBeforePeriod: profit.inflowBeforePeriod,
      inflowAfterPeriod: profit.inflowAfterPeriod,
      startup: App.Money.sumBy(flows, function (r) { return r.oneTimeOpEx; }),
      startupCost: App.Money.sumBy(flows, function (r) { return r.startupCost || 0; }),
      payroll: App.Money.sumBy(flows, function (r) { return r.payroll + r.insurance + r.severance; }),
      opex: App.Money.sumBy(flows, function (r) { return r.recurring + r.meal + r.dayBased + r.revenueFeeSga + r.support; }),
      supportSga: App.Money.sumBy(flows, function (r) { return r.support; }),
      opexPnl: App.Money.sumBy(flows, function (r) { return r.pnlExpense - (r.startupCost || 0); }),
      projectDirect: App.Money.sumBy(flows, function (r) { return r.projectDirect + r.projectExpense + r.revenueFeeProject + r.lunchTruck; }),
      projectExpense: App.Money.sumBy(flows, function (r) { return r.projectExpense; }),
      lunchTruck: App.Money.sumBy(flows, function (r) { return r.lunchTruck; }),
      agencyFees: App.Money.sumBy(flows, function (r) { return r.fees + r.revenueFeeAgency; }),
      revenueLinkedFeesTotal: App.Money.sumBy(flows, function (r) { return r.revenueFees; }),
      deposits: App.Money.sumBy(flows, function (r) { return r.deposits; }),
      capex: App.Money.sumBy(flows, function (r) { return r.capex; }),
      fundingOut: App.Money.sumBy(flows, function (r) { return r.deposits + r.capex; }),
      dividend: App.Money.sumBy(flows, function (r) { return r.dividend; }),
      profitShare: App.Money.sumBy(flows, function (r) { return r.profitShare; }),
      revenue: profit.revenue,
      pnlExpense: profit.pnlExpense,
      operatingProfit: profit.operatingProfit,
      margin: profit.margin,
      tax: tax.total,
      taxDetail: tax,
      profitAfterTax: profit.operatingProfit - tax.total,
      initialCash: App.Money.roundWon(state.profile.initialCash),
      minClosing: minCash.min,
      minMonth: minCash.month,
      endClosing: endRow ? endRow.closing : App.Money.roundWon(state.profile.initialCash),
      endClosingAfterTax: endRow
        ? App.Money.roundWon(endRow.closingAfterTax != null ? endRow.closingAfterTax : endRow.closing)
        : App.Money.roundWon(state.profile.initialCash),
      deficitCover: capital.deficitCover,
      recommended: capital.recommended,
      burnRate: burn,
      safetyCash: App.Money.roundWon(state.profile.safetyCash),
      vatPendingLiability: vat.pendingLiability,
      availableCashExVat: App.Money.roundWon((endRow ? endRow.closing : App.Money.roundWon(state.profile.initialCash)) - vat.pendingLiability),
      corporateTaxPending: corporateTaxPending,
      localTaxPending: localTaxPending
    };

    var projectSummaries = (state.projects || []).map(function (p) {
      var contract = p.status === "cancelled" ? 0 : App.Engine.projectContractAmount(p);
      var manualDirect = 0;
      (p.directExpenses || []).forEach(function (e) {
        if (App.Engine.isLegacyProjectDirectExpense && App.Engine.isLegacyProjectDirectExpense(p, e)) return;
        if (e.include !== false) manualDirect += App.Money.roundWon(e.amount);
      });
      var autoExpense = p.expenseInclude === false ? 0 : App.Engine.calculateProjectExpenseDetail(p, state).total;
      var totalDirect = App.Money.roundWon(manualDirect + autoExpense);
      return {
        id: p.id,
        name: p.name,
        contractAmount: contract,
        manualDirectExpenses: manualDirect,
        projectExpense: autoExpense,
        directExpenses: totalDirect,
        contribution: contract - totalDirect
      };
    });

    var ledger = App.Engine.buildBudgetLedger(state, parts, flows);
    var revenueGap = App.Engine.explainRevenueGap(state, start, end);
    var projectExpenseGap = App.Engine.explainProjectExpenseGap(state, start, end);

    return {
      months: flows,
      kpis: kpis,
      warnings: uniqueWarnings(warnings),
      projectSummaries: projectSummaries,
      dayMap: dayMap,
      ledger: ledger,
      revenueFees: revenueFees,
      support: support,
      lunchTruck: lunchTruck,
      vat: vat,
      revenueGap: revenueGap,
      projectExpenseGap: projectExpenseGap
    };
  }

  App.Engine.runSimulation = runSimulation;
  App.Engine.getSimulationMonths = App.Month.getSimulationMonths;
  App.Engine.resolveSimulationPeriod = App.Month.resolveSimulationPeriod;
})();
