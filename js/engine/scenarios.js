(function () {
  window.App = window.App || {};
  App.Engine = App.Engine || {};

  function readCommonRevenue(soloResult) {
    var k = (soloResult && soloResult.kpis) || {};
    return {
      total: App.Money.roundWon(k.revenue),
      inflowInPeriod: App.Money.roundWon(k.inflowInPeriod != null ? k.inflowInPeriod : k.revenue),
      byMonth: ((soloResult && soloResult.months) || []).map(function (row) {
        return { month: row.month, inflow: App.Money.roundWon(row.inflow) };
      })
    };
  }

  function ledgerRowById(result, id) {
    var groups = (result && result.ledger && result.ledger.groups) || [];
    for (var i = 0; i < groups.length; i++) {
      var rows = groups[i].rows || [];
      for (var j = 0; j < rows.length; j++) {
        if (rows[j].id === id) return rows[j];
      }
    }
    return null;
  }

  function ownerSalaryRowFromLedger(result, salaryEmployeeId) {
    if (salaryEmployeeId) {
      return ledgerRowById(result, "emp-" + salaryEmployeeId);
    }
    var groups = (result && result.ledger && result.ledger.groups) || [];
    var payroll = groups.filter(function (g) { return g.id === "payroll"; })[0];
    var rows = (payroll && payroll.rows) || [];
    return rows.filter(function (row) {
      return /대표/.test(row.label || "") && String(row.id || "").indexOf("-incentive") === -1;
    })[0] || null;
  }

  function ownerPayrollRowsFromLedger(result, salaryEmployeeId) {
    var salary = ownerSalaryRowFromLedger(result, salaryEmployeeId);
    var incentive = null;
    if (salary && salary.id) incentive = ledgerRowById(result, salary.id + "-incentive");
    else if (salaryEmployeeId) incentive = ledgerRowById(result, "emp-" + salaryEmployeeId + "-incentive");
    var rows = [];
    if (salary) rows.push(salary);
    if (incentive) rows.push(incentive);
    return rows;
  }

  function ownerSalaryFromLedger(result, salaryEmployeeId) {
    var rows = ownerPayrollRowsFromLedger(result, salaryEmployeeId);
    if (rows.length) {
      return App.Money.roundWon(App.Money.sumBy(rows, function (row) { return -row.total; }));
    }
    return App.Money.roundWon(result && result.ledger && result.ledger.ceoSalary);
  }

  function findOwnerEmployee(state, salaryEmployeeId) {
    var list = (state && state.employees) || [];
    if (salaryEmployeeId) {
      var found = list.filter(function (e) { return e && e.id === salaryEmployeeId; })[0];
      if (found) return found;
    }
    return list.filter(function (e) { return e && /대표/.test((e.role || "") + (e.name || "")); })[0] || null;
  }

  function ownerIncentiveAmount(state, salaryEmployeeId, soloResult) {
    var emp = findOwnerEmployee(state, salaryEmployeeId);
    if (!emp) return 0;
    if (soloResult) {
      var salaryRow = ownerSalaryRowFromLedger(soloResult, salaryEmployeeId);
      var incRow = salaryRow && salaryRow.id ? ledgerRowById(soloResult, salaryRow.id + "-incentive") : null;
      if (!incRow && salaryEmployeeId) incRow = ledgerRowById(soloResult, "emp-" + salaryEmployeeId + "-incentive");
      if (incRow) return App.Money.roundWon(-incRow.total);
    }
    return App.Money.roundWon(
      App.Money.toSafeNumber(emp.incentiveSeollal) +
      App.Money.toSafeNumber(emp.incentiveChuseok) +
      App.Money.toSafeNumber(emp.incentiveYearEnd)
    );
  }

  function ownerSalaryByYear(result, salaryEmployeeId) {
    var out = {};
    ownerPayrollRowsFromLedger(result, salaryEmployeeId).forEach(function (row) {
      if (!row || !row.values) return;
      Object.keys(row.values).forEach(function (month) {
        var year = Number(String(month).slice(0, 4));
        if (!year) return;
        out[year] = App.Money.roundWon((out[year] || 0) + App.Money.roundWon(-row.values[month]));
      });
    });
    if (!Object.keys(out).length) {
      var commonYear = (result && result.months && result.months[0] && Number(String(result.months[0].month).slice(0, 4))) || 2026;
      out[commonYear] = ownerSalaryFromLedger(result, salaryEmployeeId);
    }
    return out;
  }

  function ownerCorporateCardValueFromLedger(result) {
    var groups = (result && result.ledger && result.ledger.groups) || [];
    var cardPattern = /법인카드.*대표|대표.*법인카드/;
    var total = 0;
    groups.forEach(function (group) {
      (group.rows || []).forEach(function (row) {
        if (!cardPattern.test(row.label || "")) return;
        total += App.Money.roundWon(-row.total);
      });
    });
    return App.Money.roundWon(total);
  }

  function addToYearBucket(buckets, year, key, amount) {
    year = Number(year) || 2026;
    if (!buckets[year]) buckets[year] = { earnedGross: 0, businessIncome: 0, otherIncome: 0 };
    buckets[year][key] = App.Money.roundWon((buckets[year][key] || 0) + App.Money.roundWon(amount));
  }

  function monthYear(month, fallback) {
    var y = Number(String(month || "").slice(0, 4));
    return y || fallback || 2026;
  }

  function aggregateTaxDetails(details, settings) {
    var out = App.Engine.calculateScenarioPersonalTaxDetail(0, { mode: "auto", year: settings.year || 2026 });
    var numericKeys = [
      "attributedIncome", "earnedGross", "earnedIncomeDeduction", "earnedIncomeAmount",
      "businessIncome", "otherIncome", "additionalIncome", "necessaryExpenses",
      "otherAdjustment", "autoIncomeDeduction", "userIncomeDeduction", "incomeDeduction",
      "comprehensiveIncome", "taxableBase", "assessedTax", "incomeTax", "autoTaxCredit",
      "userTaxCredit", "taxCredit", "determinedTax", "localIncomeTax"
    ];
    numericKeys.forEach(function (key) { out[key] = 0; });
    (details || []).forEach(function (detail) {
      numericKeys.forEach(function (key) {
        out[key] = App.Money.roundWon((out[key] || 0) + App.Money.roundWon(detail[key]));
      });
    });
    out.mode = "auto";
    out.year = settings.year || (details[0] && details[0].year) || 2026;
    out.years = details;
    out.source = (details[0] && details[0].source) || out.source;
    out.incomeType = "earned";
    out.prepaidTax = App.Money.roundWon(settings.prepaidTax);
    out.withholdingTax = App.Money.roundWon(settings.withholdingTax);
    out.prepaidTotal = App.Money.roundWon(out.prepaidTax + out.withholdingTax);
    out.totalPersonalTax = App.Money.roundWon(out.determinedTax + out.localIncomeTax);
    out.additionalIncomeTax = App.Money.roundWon(out.determinedTax - out.prepaidTotal);
    out.additionalPayment = App.Money.roundWon(out.totalPersonalTax - out.prepaidTotal);
    out.refund = out.additionalPayment < 0 ? -out.additionalPayment : 0;
    out.afterTaxIncome = App.Money.roundWon(
      App.Money.roundWon(out.earnedGross + out.businessIncome + out.otherIncome) - out.totalPersonalTax
    );
    return out;
  }

  function calculateSoloPersonalTaxDetail(state, soloResult, salaryEmployeeId, salary, bonus, dividend, actorGross, settings) {
    settings = settings && typeof settings === "object" ? settings : {};
    if (settings.mode !== "auto") return App.Engine.calculateScenarioPersonalTaxDetail(actorGross, settings);
    var fallbackYear = Number(settings.year) || 2026;
    var buckets = {};
    var salaryYears = ownerSalaryByYear(soloResult, salaryEmployeeId);
    Object.keys(salaryYears).forEach(function (year) {
      addToYearBucket(buckets, year, "earnedGross", salaryYears[year]);
    });
    if (!Object.keys(salaryYears).length && salary) addToYearBucket(buckets, fallbackYear, "earnedGross", salary);
    if (bonus) addToYearBucket(buckets, monthYear(state.settings.scenarios.soloAgency.ownerPayout.bonusMonth, fallbackYear), "earnedGross", bonus);
    var details = Object.keys(buckets).sort().map(function (year) {
      var b = buckets[year];
      var gross = App.Money.roundWon(b.earnedGross + b.businessIncome + b.otherIncome);
      var yearSettings = App.Engine.copyTaxSettings(settings, b);
      yearSettings.year = Number(year);
      yearSettings.prepaidTax = 0;
      yearSettings.withholdingTax = 0;
      return App.Engine.calculatePersonalTaxDetail(gross, yearSettings);
    });
    return aggregateTaxDetails(details, settings);
  }

  function calculateSoloAgencyScenario(state, soloResult, common) {
    App.Defaults.ensureScenarioSettings(state);
    var cfg = state.settings.scenarios.soloAgency;
    var k = (soloResult && soloResult.kpis) || {};
    var payout = cfg.ownerPayout || {};
    var salary = ownerSalaryFromLedger(soloResult, payout.salaryEmployeeId);
    var bonus = App.Money.roundWon(payout.bonusAmount);
    var dividendPayout = App.Defaults.resolveOwnerDividend
      ? App.Defaults.resolveOwnerDividend(state, soloResult && soloResult.months, {
          afterTaxNet: (k.taxDetail && k.taxDetail.afterTaxNet) != null ? k.taxDetail.afterTaxNet : k.profitAfterTax,
          operatingProfit: k.operatingProfit,
          byYear: k.taxDetail && k.taxDetail.byYear,
          revenue: k.revenue
        })
      : { amount: App.Money.roundWon(payout.dividendAmount), month: payout.dividendMonth, mode: "amount", rate: 0, payments: [] };
    var dividend = App.Money.roundWon(dividendPayout.amount);
    var dividendPayments = dividendPayout.payments || [];
    var dividendMode = dividendPayout.mode || "amount";
    var dividendTaxParts = App.Defaults.ownerDividendWithholding
      ? App.Defaults.ownerDividendWithholding(dividend)
      : { national: 0, local: 0, total: 0, label: "배당소득세 (15.4%)" };
    var profitSharePayout = App.Defaults.resolveOwnerProfitShare
      ? App.Defaults.resolveOwnerProfitShare(state, soloResult && soloResult.months)
      : { amount: 0, payments: [], tax: { total: 0, label: "사업소득세 (3.3%)" } };
    var profitShare = App.Money.roundWon(profitSharePayout.amount);
    var profitSharePayments = profitSharePayout.payments || [];
    var profitShareTaxParts = profitSharePayout.tax || (
      App.Defaults.ownerProfitShareWithholding
        ? App.Defaults.ownerProfitShareWithholding(profitShare)
        : { national: 0, local: 0, total: 0, label: "사업소득세 (3.3%)" }
    );
    var earnedGross = App.Money.roundWon(salary + bonus);
    var actorGross = App.Money.roundWon(earnedGross + dividend + profitShare);
    var taxSettings = App.Engine.copyTaxSettings(
      App.Defaults.personalTaxForScenario(state, "soloAgency"),
      { earnedGross: earnedGross, businessIncome: 0, otherIncome: 0 }
    );
    var simYears = App.TaxYear && App.TaxYear.yearsFromMonths
      ? App.TaxYear.yearsFromMonths((soloResult && soloResult.months) || [])
      : [];
    if (simYears.length) taxSettings.year = simYears[simYears.length - 1];
    var autoMode = (taxSettings.mode || "auto") === "auto";
    var taxDetail = calculateSoloPersonalTaxDetail(
      state, soloResult, payout.salaryEmployeeId, salary, bonus, 0,
      autoMode ? earnedGross : actorGross, taxSettings
    );
    if (dividend && autoMode) {
      taxDetail.otherIncome = App.Money.roundWon((taxDetail.otherIncome || 0) + dividend);
      taxDetail.payoutTaxLabel = dividendTaxParts.label;
      taxDetail.payoutIncomeLabel = "대표 배당";
      taxDetail.totalPersonalTax = App.Money.roundWon(taxDetail.totalPersonalTax + dividendTaxParts.total);
      taxDetail.afterTaxIncome = App.Money.roundWon(
        App.Money.roundWon(taxDetail.earnedGross + taxDetail.businessIncome + taxDetail.otherIncome) -
        taxDetail.totalPersonalTax
      );
      dividendPayments.forEach(function (p) {
        if (!p.amount) return;
        var parts = App.Defaults.ownerDividendWithholding(p.amount);
        var divYear = monthYear(p.month, Number(taxSettings.year) || 2026);
        var yearRow = ((taxDetail.years || []).filter(function (d) { return Number(d.year) === Number(divYear); })[0]) || null;
        if (!yearRow) {
          yearRow = App.Engine.calculatePersonalTaxDetail(0, {
            mode: "auto", year: divYear, useLinkedIncome: true, incomeType: "earned"
          });
          taxDetail.years = (taxDetail.years || []).concat([yearRow]).sort(function (a, b) {
            return Number(a.year) - Number(b.year);
          });
        }
        yearRow.otherIncome = App.Money.roundWon((yearRow.otherIncome || 0) + p.amount);
        yearRow.dividendTax = App.Money.roundWon((yearRow.dividendTax || 0) + parts.total);
        yearRow.payoutTaxLabel = parts.label;
        yearRow.payoutIncomeLabel = "대표 배당";
        yearRow.totalPersonalTax = App.Money.roundWon(yearRow.totalPersonalTax + parts.total);
        yearRow.afterTaxIncome = App.Money.roundWon(
          App.Money.roundWon(yearRow.earnedGross + yearRow.businessIncome + yearRow.otherIncome) -
          yearRow.totalPersonalTax
        );
      });
    }
    if (profitShare && autoMode) {
      taxDetail.businessIncome = App.Money.roundWon((taxDetail.businessIncome || 0) + profitShare);
      taxDetail.profitShareTaxLabel = profitShareTaxParts.label;
      taxDetail.totalPersonalTax = App.Money.roundWon(taxDetail.totalPersonalTax + profitShareTaxParts.total);
      taxDetail.afterTaxIncome = App.Money.roundWon(
        App.Money.roundWon(taxDetail.earnedGross + taxDetail.businessIncome + taxDetail.otherIncome) -
        taxDetail.totalPersonalTax
      );
      profitSharePayments.forEach(function (p) {
        if (!p.amount) return;
        var parts = App.Defaults.ownerProfitShareWithholding
          ? App.Defaults.ownerProfitShareWithholding(p.amount)
          : { total: 0, label: "사업소득세 (3.3%)" };
        var shareYear = monthYear(p.month, Number(taxSettings.year) || 2026);
        var yearRow = ((taxDetail.years || []).filter(function (d) { return Number(d.year) === Number(shareYear); })[0]) || null;
        if (!yearRow) {
          yearRow = App.Engine.calculatePersonalTaxDetail(0, {
            mode: "auto", year: shareYear, useLinkedIncome: true, incomeType: "earned"
          });
          taxDetail.years = (taxDetail.years || []).concat([yearRow]).sort(function (a, b) {
            return Number(a.year) - Number(b.year);
          });
        }
        yearRow.businessIncome = App.Money.roundWon((yearRow.businessIncome || 0) + p.amount);
        yearRow.profitShareTax = App.Money.roundWon((yearRow.profitShareTax || 0) + parts.total);
        yearRow.profitShareTaxLabel = parts.label;
        yearRow.totalPersonalTax = App.Money.roundWon(yearRow.totalPersonalTax + parts.total);
        yearRow.afterTaxIncome = App.Money.roundWon(
          App.Money.roundWon(yearRow.earnedGross + yearRow.businessIncome + yearRow.otherIncome) -
          yearRow.totalPersonalTax
        );
      });
    }
    if (!autoMode) {
      dividendTaxParts = { national: 0, local: 0, total: 0 };
      profitShareTaxParts = { national: 0, local: 0, total: 0, label: "사업소득세 (3.3%)" };
    }
    var personalTax = taxDetail.totalPersonalTax;
    var actorNet = App.Money.roundWon(actorGross - personalTax);
    var corpCash = App.Money.roundWon(k.endClosing);
    var ownerCorporateCardValue = ownerCorporateCardValueFromLedger(soloResult);
    var actorSupportValue = App.Engine.actorSupportBenefitTotal
      ? App.Engine.actorSupportBenefitTotal(state, soloResult && soloResult.support, "soloCost")
      : 0;
    var supportSplit = App.Engine.actorSupportBenefitSplit
      ? App.Engine.actorSupportBenefitSplit(state, soloResult && soloResult.support)
      : { common: 0, soloUnique: 0, exclusiveUnique: 0 };
    var uniqueBenefitValue = ownerCorporateCardValue;
    var commonActorSupportValue = supportSplit.common;
    var ownerIncentive = ownerIncentiveAmount(state, payout.salaryEmployeeId, soloResult);
    var liquidationTaxRate = App.Money.toRatio(
      (state.settings.tax && state.settings.tax.liquidationTaxRate != null) ? state.settings.tax.liquidationTaxRate : 0.154
    );
    // 기간말 현금(corpCash)에는 아직 신고·납부하지 않은 부가세·법인세·법인지방소득세가
    // 그대로 섞여 있으므로, 즉시 청산 시 배우에게 실제로 귀속 가능한 현금은
    // 그 미납분을 먼저 뺀 금액을 기준으로 계산한다. 이미 현금으로 납부 완료된 세금은
    // kpis.tax/corporateTaxPending 계산에서 이미 제외되어 있어 다시 차감하지 않는다.
    var pendingCorporateLocal = App.Money.roundWon(
      App.Money.toSafeNumber(k.corporateTaxPending) +
      App.Money.toSafeNumber(k.localTaxPending)
    );
    var pendingTaxLiability = App.Money.roundWon(
      App.Money.toSafeNumber(k.vatPendingLiability) + pendingCorporateLocal
    );
    var corpCashAfterPendingTax = App.Money.roundWon(corpCash - pendingTaxLiability);
    var corporateCashForEconomicValue = App.Money.roundWon(corpCash - pendingCorporateLocal);
    var corporateAfterTaxNet = App.Money.roundWon(
      (k.taxDetail && k.taxDetail.afterTaxNet != null)
        ? k.taxDetail.afterTaxNet
        : (App.Money.roundWon(k.operatingProfit) - App.Money.roundWon(k.tax))
    );
    var corporateLiquidationTax = App.Money.roundWon(Math.max(corpCashAfterPendingTax, 0) * liquidationTaxRate);
    var corporateCashAfterLiquidation = App.Money.roundWon(corpCashAfterPendingTax - corporateLiquidationTax);
    var corporateTaxByYear = {};
    var corpYears = (k.taxDetail && k.taxDetail.byYear) || {};
    Object.keys(corpYears).forEach(function (year) {
      corporateTaxByYear[year] = App.Money.roundWon(corpYears[year].totalTax);
    });
    var personalTaxByYear = {};
    (taxDetail.years || []).forEach(function (d) {
      personalTaxByYear[d.year] = App.Money.roundWon(d.totalPersonalTax != null ? d.totalPersonalTax : (d.determinedTax + d.localIncomeTax));
    });
    var months = (soloResult && soloResult.months) || [];
    var lunchTruck = App.Money.roundWon(k.lunchTruck);
    var projectExpense = App.Money.roundWon(k.projectExpense);
    var revenueFeeSga = App.Money.sumBy(months, function (r) { return r.revenueFeeSga; });
    var revenueFeeProject = App.Money.sumBy(months, function (r) { return r.revenueFeeProject; });
    var successFees = App.Money.sumBy(months, function (r) { return r.fees; });
    var projectDirectOther = App.Money.roundWon(k.projectDirect - projectExpense - lunchTruck - revenueFeeProject);
    var projectDirectTotal = App.Money.roundWon(projectExpense + lunchTruck + projectDirectOther);
    var projectDirectOnly = App.Money.roundWon(projectDirectOther + lunchTruck);
    var commissionFees = App.Money.roundWon(k.revenueLinkedFeesTotal + successFees);
    var opexOperating = App.Money.roundWon(k.opex - App.Money.roundWon(k.supportSga) - revenueFeeSga);
    return {
      id: "soloAgency",
      label: cfg.label || "1인 기획사",
      totalRevenue: common.total,
      projectCosts: App.Money.roundWon(k.projectDirect + k.agencyFees - k.projectExpense),
      projectDirectTotal: projectDirectTotal,
      projectDirectOther: projectDirectOther,
      projectDirectOnly: projectDirectOnly,
      projectExpense: projectExpense,
      lunchTruck: lunchTruck,
      commissionFees: commissionFees,
      payroll: App.Money.roundWon(k.payroll),
      opex: App.Money.roundWon(k.opex),
      opexOperating: opexOperating,
      supportCost: App.Money.roundWon(k.supportSga),
      supportBreakdown: ((soloResult && soloResult.support && soloResult.support.byPolicy) || []),
      payrollBreakdown: employeePayrollBreakdown(state, soloResult),
      actorAttributedRevenue: common.total,
      corporatePreTaxProfit: App.Money.roundWon(k.operatingProfit),
      corporateTax: App.Money.roundWon(k.tax),
      corporateTaxByYear: corporateTaxByYear,
      corporateEndingCash: corpCash,
      actorGrossIncome: actorGross,
      earnedGross: taxDetail.earnedGross,
      assessedTax: taxDetail.assessedTax,
      incomeTax: taxDetail.determinedTax,
      determinedTax: taxDetail.determinedTax,
      localIncomeTax: taxDetail.localIncomeTax,
      withholdingTax: taxDetail.withholdingTax,
      additionalIncomeTax: taxDetail.additionalIncomeTax,
      personalTax: personalTax,
      personalTaxByYear: personalTaxByYear,
      totalTaxBurden: App.Money.roundWon(App.Money.roundWon(k.tax) + personalTax),
      personalTaxDetail: taxDetail,
      actorNetIncome: actorNet,
      ownerCorporateCardValue: ownerCorporateCardValue,
      actorSupportValue: actorSupportValue,
      commonActorSupportValue: commonActorSupportValue,
      uniqueBenefitValue: uniqueBenefitValue,
      ownerIncentiveAmount: ownerIncentive,
      ownerDividendAmount: dividend,
      ownerDividendMonth: dividendPayout.month || null,
      ownerDividendPayments: dividendPayments,
      ownerDividendTax: dividendTaxParts.total,
      ownerPayoutTaxLabel: dividendTaxParts.label || "배당소득세 (15.4%)",
      ownerDividendMode: dividendMode,
      ownerDividendRate: dividendPayout.rate || 0,
      ownerProfitShareAmount: profitShare,
      ownerProfitShareTax: profitShareTaxParts.total,
      ownerProfitShareTaxLabel: profitShareTaxParts.label || "사업소득세 (3.3%)",
      ownerProfitShareWorkRate: profitSharePayout.workRate || 0,
      ownerProfitShareSalesRate: profitSharePayout.salesRate || 0,
      pendingCorporateLocal: pendingCorporateLocal,
      corporateCashForEconomicValue: corporateCashForEconomicValue,
      corporateAfterTaxNet: corporateAfterTaxNet,
      controlledEconomicValue: App.Money.roundWon(actorNet + corporateAfterTaxNet - dividend - profitShare + uniqueBenefitValue),
      liquidationTaxRate: liquidationTaxRate,
      pendingTaxLiability: pendingTaxLiability,
      corpCashAfterPendingTax: corpCashAfterPendingTax,
      corporateLiquidationTax: corporateLiquidationTax,
      corporateCashAfterLiquidation: corporateCashAfterLiquidation,
      controlledEconomicValueAfterLiquidation: App.Money.roundWon(actorNet + corporateCashAfterLiquidation + uniqueBenefitValue)
    };
  }

  function exclusiveLineDisplay(rule, amount, companyBadge) {
    var amt = App.Money.roundWon(amount);
    if (rule === "actor") return { kind: "money", value: amt, badge: "배우 부담" };
    if (rule === "deductBeforeSplit") return { kind: "money", value: amt, badge: "배분 전 공제" };
    if (rule === "ignore") return { kind: "text", text: "비교 제외" };
    return { kind: "money", value: amt, badge: companyBadge || "기존 회사 부담" };
  }

  function exclusiveCompanyLine(amount, badge) {
    return exclusiveLineDisplay("company", amount, badge);
  }

  function splitEmployeesByBurden(employees) {
    var companyBorne = [];
    var actorBorne = [];
    var oneOnly = [];
    (employees || []).forEach(function (emp) {
      if (!emp) return;
      var bearer = App.Engine.employeeExclusiveBearer(emp);
      if (bearer === "actor") actorBorne.push(emp);
      else if (bearer === "company") companyBorne.push(emp);
      else oneOnly.push(emp);
    });
    return {
      companyBorne: companyBorne,
      actorBorne: actorBorne,
      oneOnly: oneOnly,
      both: companyBorne.concat(actorBorne)
    };
  }

  function employeeGroupPayrollTotal(state, monthIds, groupEmployees) {
    var payroll = App.Engine.calculatePayroll(groupEmployees, monthIds);
    var insurance = App.Engine.calculateInsurance(payroll.byMonth, monthIds, state.settings.insuranceRates);
    var severance = App.Engine.calculateSeverance(
      groupEmployees, monthIds, payroll.byMonth, state.settings.severance, state.severanceManual || {}
    );
    var total = 0;
    monthIds.forEach(function (m) {
      total += (payroll.byMonth[m] ? payroll.byMonth[m].total : 0) +
        (insurance.byMonth[m] ? insurance.byMonth[m].total : 0) +
        (severance.byMonth[m] ? severance.byMonth[m].total : 0);
    });
    return App.Money.roundWon(total);
  }

  function employeeGroupMealTotal(state, months, groupEmployees) {
    var monthIds = months.map(function (r) { return r.month; });
    var rangeStart = monthIds[0];
    var rangeEnd = monthIds[monthIds.length - 1];
    var extra = App.Money.toSafeNumber(state.mealExtraHeadcount);
    var total = 0;
    months.forEach(function (row) {
      var headcount = App.Engine.calculateMealHeadcount(groupEmployees, extra, row.month, rangeEnd, rangeStart);
      var days = (row.mealBreakdown && row.mealBreakdown.workingDays) || 0;
      total += App.Money.roundWon(App.Money.roundWon(row.mealDailyRate) * headcount * days);
    });
    return App.Money.roundWon(total);
  }

  function employeePayrollBreakdown(state, soloResult) {
    return (state.employees || []).map(function (emp) {
      var row = ledgerRowById(soloResult, "emp-" + emp.id);
      var bearer = App.Engine.employeeExclusiveBearer(emp);
      return {
        id: emp.id,
        name: emp.name || emp.role || "직원",
        role: emp.role || "",
        comparisonBurdenType: App.Defaults.resolveComparisonBurdenType(emp),
        soloMonthlySalary: App.Money.roundWon(emp.monthlySalary),
        soloAmount: row ? App.Money.roundWon(-row.total) : 0,
        exclusiveBorne: bearer !== "notApplicable",
        exclusiveBearer: bearer,
        exclusiveAmount: bearer === "notApplicable" ? 0 : (row ? App.Money.roundWon(-row.total) : 0)
      };
    });
  }

  function exclusiveCostBuckets(state, soloResult, monthRows) {
    var allMonths = (soloResult && soloResult.months) || [];
    var months = monthRows && monthRows.length ? monthRows : allMonths;
    var monthIds = months.map(function (r) { return r.month; });
    var split = splitEmployeesByBurden(state.employees);
    function sumFlow(fn) {
      return App.Money.sumBy(months, fn);
    }
    var lunchTruck = sumFlow(function (r) { return r.lunchTruck || 0; });
    var actorBornePayroll = App.Money.roundWon(
      employeeGroupPayrollTotal(state, monthIds, split.actorBorne) +
      employeeGroupMealTotal(state, months, split.actorBorne)
    );
    var periodPersonal = App.Money.sumBy(
      (state.settings.scenarios.exclusiveContract.actorPersonalCosts || []),
      function (item) {
        return App.Defaults.actorPersonalCostAmount
          ? App.Defaults.actorPersonalCostAmount(item)
          : (item && item.include === false ? 0 : App.Money.roundWon(item.amount));
      }
    );
    var actorPersonalCosts = allMonths.length
      ? App.Money.roundWon(periodPersonal * months.length / allMonths.length)
      : 0;
    return {
      projectDirect: sumFlow(function (r) { return r.projectDirect || 0; }),
      projectExpense: sumFlow(function (r) { return r.projectExpense || 0; }),
      lunchTruck: lunchTruck,
      revenueLinkedFees: App.Money.roundWon(
        sumFlow(function (r) { return r.revenueFees || 0; }) + sumFlow(function (r) { return r.fees || 0; })
      ),
      payroll: employeeGroupPayrollTotal(state, monthIds, split.companyBorne),
      actorBornePayroll: actorBornePayroll,
      opex: sumFlow(function (r) { return (r.recurring || 0) + (r.dayBased || 0); }) +
        employeeGroupMealTotal(state, months, split.companyBorne),
      startup: sumFlow(function (r) { return r.startupCost || 0; }),
      assetsAndDeposits: sumFlow(function (r) { return (r.deposits || 0) + (r.capex || 0); }),
      actorPersonalCosts: actorPersonalCosts
    };
  }

  function exclusiveActorSupportInMonths(soloResult, monthIds) {
    var map = (soloResult && soloResult.support && soloResult.support.exclusiveActorByMonth) || {};
    var total = 0;
    (monthIds || []).forEach(function (m) {
      total += App.Money.roundWon(map[m] && map[m].total);
    });
    return App.Money.roundWon(total);
  }

  function yearRevenueFromCommon(common, monthIds) {
    var byMonth = {};
    ((common && common.byMonth) || []).forEach(function (row) {
      byMonth[row.month] = App.Money.roundWon(row.inflow);
    });
    var total = 0;
    (monthIds || []).forEach(function (m) { total += byMonth[m] || 0; });
    return App.Money.roundWon(total);
  }

  function exclusiveDirectorCost(state, soloResult, monthRows) {
    var months = monthRows && monthRows.length ? monthRows : ((soloResult && soloResult.months) || []);
    var monthIds = months.map(function (r) { return r.month; });
    var actorBorneEmployees = (state.employees || []).filter(function (emp) {
      return App.Engine.employeeExclusiveBearer(emp) === "actor";
    });
    if (!actorBorneEmployees.length) return 0;
    return App.Money.roundWon(
      employeeGroupPayrollTotal(state, monthIds, actorBorneEmployees) +
      employeeGroupMealTotal(state, months, actorBorneEmployees)
    );
  }

  function exclusiveYearSlices(state, soloResult, common) {
    App.Defaults.ensureScenarioSettings(state);
    var cfg = state.settings.scenarios.exclusiveContract;
    var actorRate = App.Money.toRatio(cfg.actorShareRate);
    var companyRate = App.Money.toRatio(cfg.companyShareRate);
    var allMonths = (soloResult && soloResult.months) || [];
    var years = App.TaxYear.yearsFromMonths(allMonths);
    return years.map(function (year) {
      var monthRows = App.TaxYear.monthsInYear(allMonths, year);
      var monthIds = monthRows.map(function (r) { return r.month; });
      var buckets = exclusiveCostBuckets(state, soloResult, monthRows);
      var split = splitCostsByRule(buckets, cfg.costBurdenRules);
      var revenue = yearRevenueFromCommon(common, monthIds);
      var splitBase = App.Money.roundWon(revenue - split.deductibleBeforeSplit);
      if (splitBase < 0) splitBase = 0;
      var actorGross = App.Money.roundWon(splitBase * actorRate);
      var directorCost = exclusiveDirectorCost(state, soloResult, monthRows);
      var actorBorneCosts = directorCost;
      var actorSupport = exclusiveActorSupportInMonths(soloResult, monthIds);
      var taxableIncome = App.Money.roundWon(actorGross - directorCost - actorSupport);
      if (taxableIncome < 0) taxableIncome = 0;
      return {
        year: year,
        months: monthIds,
        revenue: revenue,
        deductibleBeforeSplit: split.deductibleBeforeSplit,
        splitBase: splitBase,
        actorGross: actorGross,
        companyShare: App.Money.roundWon(splitBase * companyRate),
        actorBorneCosts: actorBorneCosts,
        actorSupport: actorSupport,
        directorCost: directorCost,
        taxableIncome: taxableIncome,
        buckets: buckets,
        split: split
      };
    });
  }

  function calculateExclusivePersonalTaxDetail(slices, settings) {
    settings = settings && typeof settings === "object" ? settings : {};
    var actorGross = App.Money.sumBy(slices, function (s) { return s.actorGross; });
    if (settings.mode !== "auto") {
      return App.Engine.calculateScenarioPersonalTaxDetail(actorGross, settings);
    }
    if (!slices.length) return App.Engine.calculateScenarioPersonalTaxDetail(0, settings);
    var details = slices.map(function (slice, idx) {
      var yearSettings = App.Engine.copyTaxSettings(settings, {
        earnedGross: 0,
        businessIncome: slice.taxableIncome,
        otherIncome: 0
      });
      yearSettings.year = slice.year;
      yearSettings.prepaidTax = 0;
      yearSettings.withholdingTax = 0;
      if (idx !== 0) {
        yearSettings.necessaryExpenses = 0;
        yearSettings.otherAdjustment = 0;
        yearSettings.incomeDeduction = 0;
        yearSettings.additionalIncome = 0;
      }
      var detail = App.Engine.calculatePersonalTaxDetail(slice.taxableIncome, yearSettings);
      detail.yearActorGross = slice.actorGross;
      detail.yearRevenue = slice.revenue;
      detail.yearDeductibleBeforeSplit = slice.deductibleBeforeSplit;
      detail.yearActorBorneCosts = slice.actorBorneCosts;
      detail.yearActorSupport = slice.actorSupport;
      detail.yearTaxableIncome = slice.taxableIncome;
      return detail;
    });
    return aggregateTaxDetails(details, settings);
  }

  function splitCostsByRule(buckets, rules) {
    var deduct = 0;
    var actor = 0;
    var company = 0;
    Object.keys(buckets).forEach(function (key) {
      if (key === "actorBornePayroll" || key === "payroll") return;
      var amt = App.Money.roundWon(buckets[key]);
      if (key === "projectExpense" || key === "lunchTruck") {
        company += amt;
        return;
      }
      var rule = (rules && rules[key]) || "company";
      if (rule === "deductBeforeSplit") deduct += amt;
      else if (rule === "actor") actor += amt;
      else if (rule === "ignore") return;
      else company += amt;
    });
    return {
      deductibleBeforeSplit: App.Money.roundWon(deduct),
      actorBorneCosts: App.Money.roundWon(actor),
      companyBorneCosts: App.Money.roundWon(company)
    };
  }

  function calculateExclusiveContractScenario(state, soloResult, common) {
    App.Defaults.ensureScenarioSettings(state);
    var cfg = state.settings.scenarios.exclusiveContract;
    var slices = exclusiveYearSlices(state, soloResult, common);
    var buckets = exclusiveCostBuckets(state, soloResult);
    var split = splitCostsByRule(buckets, cfg.costBurdenRules);
    var actorGross = App.Money.sumBy(slices, function (s) { return s.actorGross; });
    var companyShare = App.Money.sumBy(slices, function (s) { return s.companyShare; });
    var splitBase = App.Money.sumBy(slices, function (s) { return s.splitBase; });
    var deductibleBeforeSplit = App.Money.sumBy(slices, function (s) { return s.deductibleBeforeSplit; });
    var taxSettings = App.Engine.copyTaxSettings(
      App.Defaults.personalTaxForScenario(state, "exclusiveContract"),
      { earnedGross: 0, businessIncome: actorGross, otherIncome: 0 }
    );
    var taxDetail = calculateExclusivePersonalTaxDetail(slices, taxSettings);
    var personalTax = taxDetail.totalPersonalTax;
    var support = (soloResult && soloResult.support) || { exclusiveCompanyValueTotal: 0, exclusiveActorCostTotal: 0, byPolicy: [] };
    var companySupportValue = App.Money.roundWon(support.exclusiveCompanyValueTotal);
    var actorSupportValue = App.Engine.actorSupportBenefitTotal
      ? App.Engine.actorSupportBenefitTotal(state, support, "exclusiveCompanyValue")
      : App.Money.roundWon(companySupportValue);
    var supportSplit = App.Engine.actorSupportBenefitSplit
      ? App.Engine.actorSupportBenefitSplit(state, support)
      : { common: 0, soloUnique: 0, exclusiveUnique: 0 };
    var commonActorSupportValue = supportSplit.common;
    var uniqueBenefitValue = 0;
    var actorBorneSupportCost = App.Money.roundWon(support.exclusiveActorCostTotal);
    var actorBornePayroll = App.Money.roundWon(buckets.actorBornePayroll);
    var directorCost = App.Money.sumBy(slices, function (s) { return s.directorCost; });
    var actorBorneCostsTotal = directorCost;
    var companyBorneCostsTotal = App.Money.roundWon(split.companyBorneCosts + App.Money.roundWon(buckets.payroll));
    var actorNet = App.Money.roundWon(
      actorGross - directorCost - actorBorneSupportCost - personalTax
    );
    var personalTaxByYear = {};
    (taxDetail.years || []).forEach(function (d) {
      personalTaxByYear[d.year] = App.Money.roundWon(d.totalPersonalTax != null ? d.totalPersonalTax : (d.determinedTax + d.localIncomeTax));
    });
    var rules = cfg.costBurdenRules || {};
    var projectDirectTotal = App.Money.roundWon(
      buckets.projectExpense + buckets.lunchTruck + buckets.projectDirect
    );
    return {
      id: "exclusiveContract",
      label: cfg.label || "기존 회사 전속",
      totalRevenue: common.total,
      projectCosts: App.Money.roundWon(buckets.projectDirect + buckets.revenueLinkedFees),
      projectDirectTotal: projectDirectTotal,
      projectDirectOther: App.Money.roundWon(buckets.projectDirect),
      projectExpense: App.Money.roundWon(buckets.projectExpense),
      lunchTruck: App.Money.roundWon(buckets.lunchTruck),
      payroll: App.Money.roundWon(buckets.payroll),
      payrollActorBorne: actorBornePayroll,
      opex: App.Money.roundWon(buckets.opex),
      deductibleBeforeSplit: deductibleBeforeSplit,
      splitBase: splitBase,
      companyShare: companyShare,
      actorAttributedRevenue: actorGross,
      actorGrossIncome: actorGross,
      earnedGross: taxDetail.earnedGross,
      actorBorneCosts: actorBorneCostsTotal,
      directorCost: directorCost,
      companyBorneCosts: companyBorneCostsTotal,
      companySupportValue: companySupportValue,
      actorBorneSupportCost: actorBorneSupportCost,
      actorSupportValue: actorSupportValue,
      commonActorSupportValue: commonActorSupportValue,
      uniqueBenefitValue: uniqueBenefitValue,
      supportBreakdown: support.byPolicy,
      payrollBreakdown: employeePayrollBreakdown(state, soloResult),
      assessedTax: taxDetail.assessedTax,
      incomeTax: taxDetail.determinedTax,
      determinedTax: taxDetail.determinedTax,
      localIncomeTax: taxDetail.localIncomeTax,
      withholdingTax: taxDetail.withholdingTax,
      additionalIncomeTax: taxDetail.additionalIncomeTax,
      personalTax: personalTax,
      personalTaxByYear: personalTaxByYear,
      taxYears: slices,
      totalTaxBurden: personalTax,
      personalTaxDetail: taxDetail,
      actorNetIncome: actorNet,
      controlledEconomicValue: App.Money.roundWon(actorNet),
      lines: {
        projectDirectTotal: { kind: "money", value: projectDirectTotal },
        projectDirect: exclusiveLineDisplay(rules.projectDirect, buckets.projectDirect),
        projectExpense: exclusiveCompanyLine(buckets.projectExpense, "기존 회사 100% 부담"),
        lunchTruck: exclusiveCompanyLine(buckets.lunchTruck, "기존 회사 100% 부담"),
        revenueLinkedFees: exclusiveLineDisplay(rules.revenueLinkedFees, buckets.revenueLinkedFees),
        payroll: exclusiveLineDisplay(rules.payroll, buckets.payroll),
        opex: exclusiveLineDisplay(rules.opex, buckets.opex)
      }
    };
  }

  function buildScenarioComparison(solo, exclusive) {
    return {
      scenarios: {
        soloAgency: solo,
        exclusiveContract: exclusive
      },
      deltas: {
        actorNetIncome: App.Money.roundWon(solo.actorNetIncome - exclusive.actorNetIncome),
        controlledEconomicValue: App.Money.roundWon(solo.controlledEconomicValue - exclusive.controlledEconomicValue),
        controlledEconomicValueAfterLiquidation: App.Money.roundWon(
          (solo.controlledEconomicValueAfterLiquidation != null ? solo.controlledEconomicValueAfterLiquidation : solo.controlledEconomicValue) -
          exclusive.controlledEconomicValue
        )
      }
    };
  }

  function shareRateWarning(state) {
    App.Defaults.ensureScenarioSettings(state);
    var cfg = state.settings.scenarios.exclusiveContract;
    var sum = App.Money.toSafeNumber(cfg.companyShareRate) + App.Money.toSafeNumber(cfg.actorShareRate);
    if (Math.abs(sum - 1) < 0.0005) return null;
    return {
      code: "share_rate_sum",
      message: "회사 배분율과 배우 배분율 합계가 100%가 아닙니다."
    };
  }

  function runScenarioComparison(state, soloResult) {
    App.Defaults.ensureScenarioSettings(state);
    if (!soloResult) soloResult = App.Engine.runSimulation(state);
    var common = readCommonRevenue(soloResult);
    var solo = calculateSoloAgencyScenario(state, soloResult, common);
    var exclusive = calculateExclusiveContractScenario(state, soloResult, common);
    var out = buildScenarioComparison(solo, exclusive);
    out.commonRevenue = common.total;
    out.commonActorSupportValue = App.Money.roundWon(
      (solo && solo.commonActorSupportValue) || (exclusive && exclusive.commonActorSupportValue) || 0
    );
    out.enabledScenarioIds = (state.settings.scenarioComparison.enabledScenarioIds || []).slice();
    out.warnings = [];
    var shareWarn = shareRateWarning(state);
    if (shareWarn) out.warnings.push(shareWarn);
    if (out.scenarios.exclusiveContract.deductibleBeforeSplit > common.total) {
      out.warnings.push({
        code: "split_base_clamped",
        message: "배분 전 공제가 총매출보다 커서 배분 기준금액을 0원으로 둡니다."
      });
    }
    return out;
  }

  App.Engine.exclusiveCostBuckets = exclusiveCostBuckets;
  App.Engine.exclusiveYearSlices = exclusiveYearSlices;
  App.Engine.splitEmployeesByBurden = splitEmployeesByBurden;
  App.Engine.employeePayrollBreakdown = employeePayrollBreakdown;
  App.Engine.exclusiveLineDisplay = exclusiveLineDisplay;
  App.Engine.splitCostsByRule = splitCostsByRule;
  App.Engine.readCommonRevenue = readCommonRevenue;
  App.Engine.ownerCorporateCardValueFromLedger = ownerCorporateCardValueFromLedger;
  App.Engine.calculateSoloAgencyScenario = calculateSoloAgencyScenario;
  App.Engine.calculateExclusiveContractScenario = calculateExclusiveContractScenario;
  App.Engine.buildScenarioComparison = buildScenarioComparison;
  App.Engine.runScenarioComparison = runScenarioComparison;
})();
