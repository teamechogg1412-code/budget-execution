(function () {
  window.App = window.App || {};
  App.Engine = App.Engine || {};

  function won(value) {
    return App.Money.roundWon(value);
  }

  function payoutOf(state) {
    return ((((state || {}).settings || {}).scenarios || {}).soloAgency || {}).ownerPayout || {};
  }

  function flowSum(result, key) {
    return won(App.Money.sumBy((result && result.months) || [], function (row) {
      return row && row[key];
    }));
  }

  function ledgerAmount(result, id) {
    var row = App.Engine.ledgerRowById ? App.Engine.ledgerRowById(result, id) : null;
    return row ? won(-row.total) : 0;
  }

  function ownerSalaryParts(result, ownerEmp) {
    var id = ownerEmp && ownerEmp.id;
    var salary = 0;
    var incentive = 0;
    var rows = App.Engine.ownerPayrollRowsFromLedger
      ? App.Engine.ownerPayrollRowsFromLedger(result, ownerEmp && ownerEmp.id)
      : [];
    (rows || []).forEach(function (row) {
      var amt = won(-(row && row.total));
      if (String((row && row.id) || "").indexOf("-incentive") >= 0) incentive = won(incentive + amt);
      else salary = won(salary + amt);
    });
    if (!rows.length && result && result.ledger && result.ledger.ceoSalary) {
      salary = won(result.ledger.ceoSalary);
    }
    return { salary: won(salary), incentive: won(incentive) };
  }

  function allocateOwnerOncost(state, result, ownerEmp) {
    var insTotal = flowSum(result, "insurance");
    var sevTotal = flowSum(result, "severance");
    var ownerId = ownerEmp && ownerEmp.id;
    var insuredPay = 0;
    var ownerInsuredPay = 0;
    var sevBase = 0;
    var ownerSevBase = 0;
    ((state && state.employees) || []).forEach(function (emp) {
      if (!emp || emp.include === false) return;
      var salary = ledgerAmount(result, "emp-" + emp.id);
      var incentive = ledgerAmount(result, "emp-" + emp.id + "-incentive");
      var pay = won(salary + incentive);
      if (emp.insure) {
        insuredPay = won(insuredPay + pay);
        if (ownerId && emp.id === ownerId) ownerInsuredPay = won(ownerInsuredPay + pay);
      }
      if (emp.severance) {
        sevBase = won(sevBase + salary);
        if (ownerId && emp.id === ownerId) ownerSevBase = won(ownerSevBase + salary);
      }
    });
    return {
      insurance: insuredPay ? won(insTotal * ownerInsuredPay / insuredPay) : 0,
      severance: sevBase ? won(sevTotal * ownerSevBase / sevBase) : 0
    };
  }

  function blendedRate(amount, revenue) {
    if (!revenue) return 0;
    return amount / revenue;
  }

  function packageAt(salInc, currentSalInc, insurance, severance) {
    var f = currentSalInc > 0 ? salInc / currentSalInc : 0;
    var ins = won(insurance * f);
    var sev = won(severance * f);
    return {
      salaryInc: won(salInc),
      insurance: ins,
      severance: sev,
      total: won(salInc + ins + sev)
    };
  }

  function splitSalary(salInc, currentSalary, currentIncentive) {
    var orig = won(currentSalary + currentIncentive);
    if (orig <= 0 || salInc <= 0) return { salary: 0, incentive: 0 };
    var salary = won(currentSalary * salInc / orig);
    return { salary: salary, incentive: won(salInc - salary) };
  }

  function estimateTaxTotal(revenue, pnlExpense, taxSettings, engineTax, enginePnl) {
    if (pnlExpense === enginePnl) return won(engineTax);
    if (!App.Engine.calculateEstimatedTax) return won(engineTax);
    return won(App.Engine.calculateEstimatedTax({
      revenue: revenue,
      pnlExpense: pnlExpense
    }, taxSettings).total);
  }

  function dividendCapAt(revenue, pnlExpense, currentPkg, currentSettle, recPkg, recSettle, taxSettings, engineTax) {
    var newPnl = won(pnlExpense - (currentPkg - recPkg) - (currentSettle - recSettle));
    var taxTotal = estimateTaxTotal(revenue, newPnl, taxSettings, engineTax, pnlExpense);
    var pretax = won(revenue - newPnl);
    return Math.max(0, won(pretax - taxTotal));
  }

  function recommendMix(pool, current, revenue, pnlExpense, taxSettings, engineTax) {
    var limit = Math.max(0, won(pool));
    var salInc = won(current.salary + current.incentive);
    var settle = won(current.profitSettle);
    var div = won(current.dividend);
    var ins = won(current.insurance);
    var sev = won(current.severance);

    function pkg(s) {
      return packageAt(s, won(current.salary + current.incentive), ins, sev);
    }

    function cost(s, st, d) {
      return won(pkg(s).total + st + d);
    }

    function cap(s, st) {
      return dividendCapAt(revenue, pnlExpense, pkg(salInc).total, current.profitSettle, pkg(s).total, st, taxSettings, engineTax);
    }

    var overBefore = won(current.ownerCompanyCost - limit);
    var reasonKey = "ok";
    if (overBefore > 0) {
      reasonKey = "over";
      var over = overBefore;
      var cutDiv = Math.min(div, over);
      div = won(div - cutDiv);
      over = won(over - cutDiv);
      if (over > 0) {
        var cutSettle = Math.min(settle, over);
        settle = won(settle - cutSettle);
        over = won(over - cutSettle);
      }
      if (over > 0) {
        var targetPkg = Math.max(0, won(limit - settle - div));
        var curPkg = pkg(salInc).total;
        var next = curPkg > 0 ? won(salInc * targetPkg / curPkg) : 0;
        if (next < 0) next = 0;
        while (next > 0 && cost(next, settle, div) > limit) next -= 1;
        if (cost(next, settle, div) > limit) next = 0;
        salInc = next;
      }
    } else {
      var currentCap = cap(salInc, settle);
      if (div > currentCap) {
        div = currentCap;
        reasonKey = "dividend-cap";
      }
    }

    var recCap = cap(salInc, settle);
    if (div > recCap) div = recCap;

    var split = splitSalary(salInc, current.salary, current.incentive);
    var recPkg = pkg(salInc);
    return {
      salary: split.salary,
      incentive: split.incentive,
      insurance: recPkg.insurance,
      severance: recPkg.severance,
      profitSettle: settle,
      profitSettleRate: blendedRate(settle, revenue),
      dividend: div,
      ownerCompanyCost: won(recPkg.total + settle + div),
      reasonKey: reasonKey
    };
  }

  function yearOf(month) {
    return App.TaxYear && App.TaxYear.yearOf
      ? App.TaxYear.yearOf(month)
      : Number(String(month || "").slice(0, 4));
  }

  function buildYearSlices(result) {
    var rows = (result && result.months) || [];
    var buckets = {};
    var order = [];
    rows.forEach(function (row) {
      var y = yearOf(row && row.month);
      if (!y) return;
      if (!buckets[y]) {
        buckets[y] = { year: y, monthCount: 0, revenue: 0, profitSettle: 0, pnlExpense: 0, dividend: 0 };
        order.push(y);
      }
      buckets[y].monthCount += 1;
      buckets[y].revenue = won(buckets[y].revenue + won(row.inflow));
      buckets[y].profitSettle = won(buckets[y].profitSettle + won(row.profitSettle));
      buckets[y].pnlExpense = won(buckets[y].pnlExpense + won(row.pnlExpense));
      buckets[y].dividend = won(buckets[y].dividend + won(row.dividend));
    });
    return order.map(function (y) {
      var b = buckets[y];
      b.operatingProfit = won(b.revenue - b.pnlExpense);
      return b;
    });
  }

  function salaryByYearFromLedger(result, ownerEmp) {
    var out = {};
    var rows = App.Engine.ownerPayrollRowsFromLedger
      ? App.Engine.ownerPayrollRowsFromLedger(result, ownerEmp && ownerEmp.id)
      : [];
    (rows || []).forEach(function (row) {
      if (!row || !row.values) return;
      Object.keys(row.values).forEach(function (month) {
        var y = yearOf(month);
        if (!y) return;
        out[y] = won((out[y] || 0) + won(-row.values[month]));
      });
    });
    return out;
  }

  function defaultDividendRate() {
    return (App.Defaults && App.Defaults.defaultOwnerDividendRate) || 0.10;
  }

  function allocateByKey(years, amount, key) {
    var total = won(App.Money.sumBy(years, function (y) { return y[key]; }));
    var leftover = won(amount);
    return (years || []).map(function (y, i) {
      var share = 0;
      if (i === years.length - 1) share = leftover;
      else if (total) share = won(amount * y[key] / total);
      leftover = won(leftover - share);
      return share;
    });
  }

  function allocateByRevenue(years, amount) {
    return allocateByKey(years, amount, "revenue");
  }

  function hasYearMap(map) {
    if (!map || typeof map !== "object") return false;
    return Object.keys(map).some(function (k) {
      return map[k] != null && map[k] !== "";
    });
  }

  function yearMapGet(map, year, fallback) {
    if (!map || typeof map !== "object") return fallback;
    var v = map[year];
    if (v == null) v = map[String(year)];
    if (v == null || v === "") return fallback;
    return v;
  }

  function yearMapWon(map, year, fallback) {
    var v = yearMapGet(map, year, null);
    if (v == null) return Math.max(0, won(fallback));
    return Math.max(0, won(v));
  }

  function yearMapRatio(map, year, fallback) {
    var v = yearMapGet(map, year, null);
    if (v == null) return Math.max(0, App.Money.toRatio(fallback));
    return Math.max(0, App.Money.toRatio(v));
  }

  function normalizeWonYearMap(map) {
    if (!hasYearMap(map)) return null;
    var out = {};
    Object.keys(map).forEach(function (k) {
      if (map[k] == null || map[k] === "") return;
      out[String(k)] = Math.max(0, won(map[k]));
    });
    return Object.keys(out).length ? out : null;
  }

  function normalizeRatioYearMap(map) {
    if (!hasYearMap(map)) return null;
    var out = {};
    Object.keys(map).forEach(function (k) {
      if (map[k] == null || map[k] === "") return;
      out[String(k)] = Math.max(0, App.Money.toRatio(map[k]));
    });
    return Object.keys(out).length ? out : null;
  }

  function trialYears(fit, yearSalaries, yearSettles, dividendParts, opParts, dividendPreviewParts) {
    var slices = fit.years || [];
    return slices.map(function (y, i) {
      var div = (dividendParts && dividendParts[i]) || 0;
      var preview = dividendPreviewParts && dividendPreviewParts[i] != null
        ? dividendPreviewParts[i]
        : div;
      return {
        year: y.year,
        monthCount: y.monthCount,
        revenue: y.revenue,
        salary: yearSalaries[i] != null ? won(yearSalaries[i]) : 0,
        profitSettle: (yearSettles && yearSettles[i]) || 0,
        dividend: div,
        dividendPreview: preview,
        operatingProfit: (opParts && opParts[i] != null) ? opParts[i] : y.operatingProfit
      };
    });
  }

  function analyzeOwnerPayoutFit(state, result) {
    var kpis = (result && result.kpis) || {};
    var monthRows = (result && result.months) || [];
    var months = monthRows.map(function (row) { return row.month; });
    var years = buildYearSlices(result);
    var monthCount = monthRows.length;
    var payout = payoutOf(state);
    var ownerEmp = App.Engine.findOwnerEmployee
      ? App.Engine.findOwnerEmployee(state, payout.salaryEmployeeId)
      : null;
    var parts = ownerSalaryParts(result, ownerEmp);
    var oncost = allocateOwnerOncost(state, result, ownerEmp);
    var salaryPackage = won(parts.salary + parts.incentive + oncost.insurance + oncost.severance);
    var profitSettle = won(kpis.profitShare);
    var dividend = won(kpis.dividend);
    var revenue = won(kpis.revenue);
    var pnlExpense = won(kpis.pnlExpense);
    var operatingCost = won(pnlExpense - salaryPackage - profitSettle);
    var pool = won(revenue - operatingCost);
    var ownerGross = won(parts.salary + parts.incentive + profitSettle + dividend);
    var ownerCompanyCost = won(salaryPackage + profitSettle + dividend);
    var slack = won(pool - ownerCompanyCost);
    var monthlySalary = ownerEmp
      ? won(ownerEmp.monthlySalary)
      : (monthCount ? won(parts.salary / monthCount) : 0);
    var ledgerYearSalary = salaryByYearFromLedger(result, ownerEmp);
    var currentYears = years.map(function (y) {
      return {
        year: y.year,
        monthCount: y.monthCount,
        revenue: y.revenue,
        salary: ledgerYearSalary[y.year] != null ? ledgerYearSalary[y.year] : won(monthlySalary * y.monthCount),
        profitSettle: y.profitSettle,
        dividend: y.dividend,
        operatingProfit: y.operatingProfit
      };
    });
    var dividendOn = App.Defaults.isDividendOn ? !!App.Defaults.isDividendOn(payout) : payout.dividendOn !== false;
    var dividendRate = App.Money.toRatio(payout.dividendRate);
    if (dividendOn && !dividendRate) dividendRate = defaultDividendRate();
    var current = {
      salary: parts.salary,
      incentive: parts.incentive,
      insurance: oncost.insurance,
      severance: oncost.severance,
      salaryPackage: salaryPackage,
      monthlySalary: monthlySalary,
      annualSalary: won(monthlySalary * 12),
      profitSettle: profitSettle,
      profitSettleRate: blendedRate(profitSettle, revenue),
      profitSettleOn: App.Defaults.isProfitShareOn
        ? App.Defaults.isProfitShareOn(payout)
        : (profitSettle > 0
          || App.Money.toRatio(payout.profitShareWorkRate) > 0
          || App.Money.toRatio(payout.profitShareSalesRate) > 0),
      dividend: dividend,
      dividendOn: dividendOn,
      dividendRate: dividendRate,
      ownerCompanyCost: ownerCompanyCost,
      ownerGross: ownerGross,
      years: currentYears
    };
    var taxSettings = (state && state.settings && state.settings.tax) || {};
    var recommended = recommendMix(
      pool,
      current,
      revenue,
      pnlExpense,
      taxSettings,
      kpis.tax
    );
    var verdict = recommended.reasonKey === "ok" ? "ok"
      : (recommended.reasonKey === "dividend-cap" ? "dividend-cap" : "over");
    return {
      period: {
        start: months[0] || null,
        end: months.length ? months[months.length - 1] : null
      },
      revenue: revenue,
      operatingCost: operatingCost,
      pool: pool,
      poolLimit: Math.max(0, pool),
      pnlExpense: pnlExpense,
      taxTotal: won(kpis.tax),
      taxSettings: taxSettings,
      years: years,
      monthCount: monthCount,
      monthlySalary: monthlySalary,
      current: current,
      slack: slack,
      verdict: verdict,
      recommended: recommended,
      notes: {
        minClosing: won(kpis.minClosing),
        endClosing: won(kpis.endClosing)
      }
    };
  }

  function resolveTrialMonthly(fit, trial) {
    var n = fit.monthCount || 0;
    if (trial && trial.monthlySalary != null) return Math.max(0, won(trial.monthlySalary));
    if (trial && trial.salaryInc != null && n) return Math.max(0, won(trial.salaryInc / n));
    return won(fit.monthlySalary);
  }

  function resolveTrialSettleOn(trial) {
    if (!trial) return false;
    if (trial.profitSettleOn === false) return false;
    if (trial.profitSettleOn === true) return true;
    return won(trial.profitSettle) > 0 || App.Money.toRatio(trial.profitSettleRate) > 0;
  }

  function trialOperatingByYear(fit, pkg, yearSettles) {
    var years = fit.years || [];
    var current = fit.current || {};
    var currentYears = current.years || [];
    var pkgDelta = won(won(current.salaryPackage) - pkg.total);
    var salaryKeyYears = currentYears.length === years.length ? currentYears : years;
    var hasSalary = salaryKeyYears.some(function (y) { return won(y && y.salary) > 0; });
    var pkgParts = hasSalary
      ? allocateByKey(salaryKeyYears, pkgDelta, "salary")
      : allocateByKey(years, pkgDelta, "monthCount");
    var parts = years.map(function (y, i) {
      var curSettle = won((currentYears[i] && currentYears[i].profitSettle) || y.profitSettle || 0);
      var newSettle = won((yearSettles && yearSettles[i]) || 0);
      return won(won(y.operatingProfit) + (pkgParts[i] || 0) + (curSettle - newSettle));
    });
    return {
      period: won(App.Money.sumBy(parts, function (v) { return v; })),
      parts: parts
    };
  }

  function resolveTrialDividendOn(trial) {
    if (!trial) return false;
    if (trial.dividendOn === false) return false;
    if (trial.dividendOn === true) return true;
    return won(trial.dividend) > 0;
  }

  function resolveTrialDividend(fit, trial, pkg, yearSettles, opInfo) {
    var on = trial.dividendOn;
    var years = fit.years || [];
    if (on == null && trial.dividendRate == null && !hasYearMap(trial.dividendRateByYear)) {
      return {
        on: won(trial.dividend) > 0,
        rate: 0,
        mode: "amount",
        amount: Math.max(0, won(trial.dividend)),
        parts: years.map(function () { return 0; }),
        previewParts: years.map(function () { return 0; }),
        previewAmount: Math.max(0, won(trial.dividend))
      };
    }
    on = resolveTrialDividendOn(trial);
    var rate = trial.dividendRate != null ? Math.max(0, App.Money.toRatio(trial.dividendRate)) : defaultDividendRate();
    if (!rate && !hasYearMap(trial.dividendRateByYear)) rate = defaultDividendRate();
    var op = opInfo || trialOperatingByYear(fit, pkg, yearSettles);
    var previewParts = (op.parts || []).map(function (yearOp, i) {
      var y = years[i];
      var mode = yearMapGet(trial.dividendModeByYear, y && y.year, "rate");
      if (mode === "amount") {
        return yearOp > 0 ? yearMapWon(trial.dividendByYear, y.year, 0) : 0;
      }
      var yearRate = yearMapRatio(trial.dividendRateByYear, y && y.year, rate);
      if (!yearRate && !hasYearMap(trial.dividendRateByYear)) yearRate = defaultDividendRate();
      return yearOp > 0 ? won(yearOp * yearRate) : 0;
    });
    var previewAmount = won(App.Money.sumBy(previewParts, function (v) { return v; }));
    if (!on) {
      return {
        on: false,
        rate: rate,
        mode: "rate",
        amount: 0,
        parts: years.map(function () { return 0; }),
        previewParts: previewParts,
        previewAmount: previewAmount
      };
    }
    return {
      on: true,
      rate: rate,
      mode: "rate",
      amount: previewAmount,
      parts: previewParts,
      previewParts: previewParts,
      previewAmount: previewAmount
    };
  }

  function earnedIncomeTaxParts(amount, year) {
    var empty = { national: 0, local: 0, total: 0 };
    if (!App.Engine.calculatePersonalTaxDetail) return empty;
    var gross = Math.max(0, won(amount));
    if (!gross) return empty;
    var detail = App.Engine.calculatePersonalTaxDetail(gross, {
      mode: "auto",
      year: year || 2026,
      incomeType: "earned",
      useLinkedIncome: true
    });
    var national = won(detail.determinedTax);
    var local = won(detail.localIncomeTax);
    return { national: national, local: local, total: won(national + local) };
  }

  function withholdingParts(fn, amount, nationalRate) {
    var empty = { national: 0, local: 0, total: 0 };
    var gross = Math.max(0, won(amount));
    if (!gross) return empty;
    if (typeof fn === "function") {
      var parts = fn(gross);
      return {
        national: won(parts.national),
        local: won(parts.local),
        total: won(parts.total)
      };
    }
    var national = won(gross * (nationalRate || 0));
    var local = won(national * 0.10);
    return { national: national, local: local, total: won(national + local) };
  }

  function taxKindRow(gross, parts) {
    return {
      gross: won(gross),
      national: won(parts.national),
      local: won(parts.local),
      tax: won(parts.total),
      net: won(gross - parts.total)
    };
  }

  function yearPayoutPersonalTax(y) {
    var salaryGross = Math.max(0, won(y && y.salary));
    var salaryParts = earnedIncomeTaxParts(salaryGross, y && y.year);
    var settleGross = Math.max(0, won(y && y.profitSettle));
    var settleParts = withholdingParts(
      App.Defaults && App.Defaults.ownerProfitShareWithholding,
      settleGross,
      0.03
    );
    var divGross = Math.max(0, won(y && y.dividend));
    var threshold = (App.Defaults && App.Defaults.financialIncomeComprehensiveThreshold)
      ? App.Defaults.financialIncomeComprehensiveThreshold()
      : 20000000;
    var divParts;
    if (divGross <= threshold) {
      divParts = withholdingParts(
        App.Defaults && App.Defaults.ownerDividendWithholding,
        divGross,
        0.14
      );
    } else {
      var year = Number(y && y.year) || 2026;
      var baseTax = App.Engine.calculatePersonalTaxDetail(salaryGross, {
        mode: "auto",
        year: year,
        useLinkedIncome: true,
        incomeType: "earned",
        incomeSplit: { earnedGross: salaryGross, businessIncome: 0, otherIncome: 0 }
      });
      var withDiv = App.Engine.calculatePersonalTaxDetail(App.Money.roundWon(salaryGross + divGross), {
        mode: "auto",
        year: year,
        useLinkedIncome: true,
        incomeType: "earned",
        incomeSplit: { earnedGross: salaryGross, businessIncome: 0, otherIncome: divGross }
      });
      var incr = won(Math.max(0, withDiv.totalPersonalTax - baseTax.totalPersonalTax));
      var national = won(incr / 1.1);
      divParts = { national: national, local: won(incr - national), total: incr };
    }
    var salary = taxKindRow(salaryGross, salaryParts);
    var profitSettle = taxKindRow(settleGross, settleParts);
    var dividend = taxKindRow(divGross, divParts);
    return {
      year: y && y.year,
      salary: salary,
      profitSettle: profitSettle,
      dividend: dividend,
      dividendTaxMode: divGross > threshold ? "comprehensive" : (divGross ? "separate" : "none"),
      gross: won(salary.gross + profitSettle.gross + dividend.gross),
      tax: won(salary.tax + profitSettle.tax + dividend.tax),
      national: won(salary.national + profitSettle.national + dividend.national),
      local: won(salary.local + profitSettle.local + dividend.local),
      net: won(salary.net + profitSettle.net + dividend.net)
    };
  }

  function summarizePayoutPersonalTax(yearRows, salaryInc, settle, dividendPreview) {
    var years = (yearRows && yearRows.length)
      ? yearRows.map(yearPayoutPersonalTax)
      : [yearPayoutPersonalTax({
        year: 2026,
        salary: salaryInc,
        profitSettle: settle,
        dividendPreview: dividendPreview
      })];
    function sumKind(kind) {
      return {
        gross: won(App.Money.sumBy(years, function (y) { return y[kind].gross; })),
        national: won(App.Money.sumBy(years, function (y) { return y[kind].national; })),
        local: won(App.Money.sumBy(years, function (y) { return y[kind].local; })),
        tax: won(App.Money.sumBy(years, function (y) { return y[kind].tax; })),
        net: won(App.Money.sumBy(years, function (y) { return y[kind].net; }))
      };
    }
    var salary = sumKind("salary");
    var profitSettle = sumKind("profitSettle");
    var dividend = sumKind("dividend");
    return {
      salary: salary,
      profitSettle: profitSettle,
      dividend: dividend,
      gross: won(App.Money.sumBy(years, function (y) { return y.gross; })),
      tax: won(App.Money.sumBy(years, function (y) { return y.tax; })),
      national: won(App.Money.sumBy(years, function (y) { return y.national; })),
      local: won(App.Money.sumBy(years, function (y) { return y.local; })),
      net: won(App.Money.sumBy(years, function (y) { return y.net; })),
      years: years
    };
  }

  function evaluateOwnerPayoutTrial(fit, trial) {
    fit = fit || {};
    var current = fit.current || {};
    var revenue = won(fit.revenue);
    var monthCount = fit.monthCount || 0;
    trial = trial || {};
    var years = fit.years || [];
    var monthly = resolveTrialMonthly(fit, trial);
    var yearSalaries = years.map(function (y) {
      return won(yearMapWon(trial.monthlySalaryByYear, y.year, monthly) * y.monthCount);
    });
    var salInc = years.length
      ? won(App.Money.sumBy(yearSalaries, function (v) { return v; }))
      : won(monthly * monthCount);
    var settleOn = resolveTrialSettleOn(trial);
    var settle = 0;
    var rate = 0;
    var yearSettles = years.map(function () { return 0; });
    var fallbackSettleRate = trial.profitSettleRate != null
      ? Math.max(0, App.Money.toRatio(trial.profitSettleRate))
      : 0;
    if (settleOn) {
      if (hasYearMap(trial.profitSettleRateByYear)) {
        yearSettles = years.map(function (y) {
          return won(y.revenue * yearMapRatio(trial.profitSettleRateByYear, y.year, fallbackSettleRate));
        });
        settle = won(App.Money.sumBy(yearSettles, function (v) { return v; }));
        rate = blendedRate(settle, revenue);
      } else if (trial.profitSettle != null) {
        settle = Math.max(0, won(trial.profitSettle));
        rate = blendedRate(settle, revenue);
        yearSettles = allocateByRevenue(years, settle);
      } else {
        rate = fallbackSettleRate;
        settle = won(revenue * rate);
        yearSettles = allocateByRevenue(years, settle);
      }
    } else if (trial.profitSettleRate != null) {
      rate = fallbackSettleRate;
    }
    var curSal = won(current.salary + current.incentive);
    var pkg = packageAt(salInc, curSal, current.insurance, current.severance);
    var opInfo = trialOperatingByYear(fit, pkg, yearSettles);
    var divInfo = resolveTrialDividend(fit, trial, pkg, yearSettles, opInfo);
    var div = divInfo.amount;
    var ownerCompanyCost = won(pkg.total + settle + div);
    var ownerGross = won(salInc + settle + div);
    var slack = won(fit.pool - ownerCompanyCost);
    var cap = dividendCapAt(
      revenue,
      won(fit.pnlExpense),
      won(current.salaryPackage),
      won(current.profitSettle),
      pkg.total,
      settle,
      fit.taxSettings,
      fit.taxTotal
    );
    var poolLimit = fit.poolLimit != null ? won(fit.poolLimit) : Math.max(0, won(fit.pool));
    var verdict = "ok";
    if (ownerCompanyCost > poolLimit) verdict = "over";
    else if (div > cap) verdict = "dividend-cap";
    var out = {
      monthlySalary: monthly,
      annualSalary: won(monthly * 12),
      salaryInc: salInc,
      insurance: pkg.insurance,
      severance: pkg.severance,
      salaryPackage: pkg.total,
      profitSettle: settle,
      profitSettleRate: rate,
      profitSettleOn: settleOn,
      operatingProfit: opInfo.period,
      dividend: div,
      dividendPreview: divInfo.previewAmount != null ? divInfo.previewAmount : div,
      dividendOn: divInfo.on,
      dividendRate: divInfo.rate,
      dividendMode: divInfo.mode,
      dividendCap: cap,
      ownerCompanyCost: ownerCompanyCost,
      ownerGross: ownerGross,
      slack: slack,
      verdict: verdict,
      years: trialYears(fit, yearSalaries, yearSettles, divInfo.parts, opInfo.parts, divInfo.previewParts)
    };
    out.payoutTax = summarizePayoutPersonalTax(
      out.years,
      salInc,
      settle,
      out.dividendPreview
    );
    var salaryMap = normalizeWonYearMap(trial.monthlySalaryByYear);
    if (salaryMap) out.monthlySalaryByYear = salaryMap;
    var settleMap = normalizeRatioYearMap(trial.profitSettleRateByYear);
    if (settleMap) out.profitSettleRateByYear = settleMap;
    var divMap = normalizeRatioYearMap(trial.dividendRateByYear);
    if (divMap) out.dividendRateByYear = divMap;
    var divAmtMap = normalizeWonYearMap(trial.dividendByYear);
    if (divAmtMap) out.dividendByYear = divAmtMap;
    if (trial.dividendModeByYear && typeof trial.dividendModeByYear === "object") {
      out.dividendModeByYear = trial.dividendModeByYear;
    }
    return out;
  }

  function applyOwnerPayoutTrialToState(state, trial) {
    var clone = JSON.parse(JSON.stringify(state || {}));
    if (App.Defaults.ensureScenarioSettings) App.Defaults.ensureScenarioSettings(clone);
    var payout = ((((clone.settings || {}).scenarios || {}).soloAgency || {}).ownerPayout) || {};
    var monthly = trial && trial.monthlySalary != null ? Math.max(0, won(trial.monthlySalary)) : null;
    var emp = App.Engine.findOwnerEmployee
      ? App.Engine.findOwnerEmployee(clone, payout.salaryEmployeeId)
      : null;
    if (emp && monthly != null) emp.monthlySalary = monthly;
    var salaryByYear = trial && normalizeWonYearMap(trial.monthlySalaryByYear);
    if (emp && salaryByYear) emp.monthlySalaryByYear = salaryByYear;
    var months = [];
    if (App.Month.getSimulationMonths && clone.profile) {
      months = App.Month.getSimulationMonths(clone.profile.startMonth, clone.profile.endMonth) || [];
    }
    var projectRev = 0;
    if (App.Defaults.resolveOwnerProfitShare && months.length) {
      var share = App.Defaults.resolveOwnerProfitShare(clone, months);
      projectRev = won((share.workRevenue || 0) + (share.salesRevenue || 0));
    }
    var settle = 0;
    var rate = 0;
    var settleMap = trial && normalizeRatioYearMap(trial.profitSettleRateByYear);
    var settleOn = trial && trial.profitSettleOn !== false
      && (trial.profitSettleOn === true
        || won(trial.profitSettle) > 0
        || App.Money.toRatio(trial.profitSettleRate) > 0
        || !!(settleMap && Object.keys(settleMap).length));
    if (settleOn) {
      settle = Math.max(0, won(trial.profitSettle));
      if (projectRev) rate = settle / projectRev;
      else if (trial.profitSettleRate != null) rate = Math.max(0, App.Money.toRatio(trial.profitSettleRate));
      payout.profitShareOn = true;
      payout.profitShareWorkRate = rate;
      payout.profitShareSalesRate = rate;
    } else {
      payout.profitShareOn = false;
    }
    if (settleMap && settleOn) {
      var yearProj = {};
      if (App.Defaults.workSalesRevenueByYear && months.length) {
        var rawYearRev = App.Defaults.workSalesRevenueByYear(clone, months);
        Object.keys(rawYearRev || {}).forEach(function (y) {
          yearProj[String(y)] = won((rawYearRev[y].work || 0) + (rawYearRev[y].sales || 0));
        });
      }
      var applied = {};
      (trial.years || []).forEach(function (y) {
        var key = String(y.year);
        var proj = yearProj[key] || 0;
        var desired = won(y.profitSettle);
        applied[key] = proj > 0 ? desired / proj : yearMapRatio(settleMap, y.year, rate);
      });
      Object.keys(settleMap).forEach(function (k) {
        if (applied[k] == null) applied[k] = settleMap[k];
      });
      payout.profitShareRateByYear = applied;
    } else if (!settleOn) {
      delete payout.profitShareRateByYear;
    }
    var divOn = trial && trial.dividendOn;
    if (divOn == null) divOn = won(trial && trial.dividend) > 0;
    var divMap = trial && normalizeRatioYearMap(trial.dividendRateByYear);
    if (!divOn) {
      payout.dividendOn = false;
    } else if ((trial.dividendMode || "rate") === "amount") {
      payout.dividendOn = true;
      payout.dividendMode = "amount";
      payout.dividendAmount = Math.max(0, won(trial.dividend));
    } else {
      payout.dividendOn = true;
      payout.dividendMode = "rate";
      payout.dividendRate = trial.dividendRate != null
        ? Math.max(0, App.Money.toRatio(trial.dividendRate))
        : defaultDividendRate();
      if (!payout.dividendRate) payout.dividendRate = defaultDividendRate();
      var appliedDiv = {};
      (trial.years || []).forEach(function (y) {
        var op = won(y.operatingProfit);
        appliedDiv[String(y.year)] = op > 0
          ? won(y.dividend) / op
          : yearMapRatio(divMap, y.year, payout.dividendRate);
      });
      if (Object.keys(appliedDiv).length) payout.dividendRateByYear = appliedDiv;
      else if (divMap) payout.dividendRateByYear = divMap;
    }
    if (clone.settings && clone.settings.scenarios && clone.settings.scenarios.soloAgency) {
      clone.settings.scenarios.soloAgency.ownerPayout = payout;
    }
    return clone;
  }

  function trialMatchesCurrent(fit, trial) {
    var cur = (fit && fit.current) || {};
    var years = (cur.years && cur.years.length) ? cur.years : ((fit && fit.years) || []);
    var divOn = trial.dividendOn != null ? !!trial.dividendOn : won(trial.dividend) > 0;
    var settleOn = resolveTrialSettleOn(trial);
    if (hasYearMap(trial.monthlySalaryByYear) && years.length) {
      for (var i = 0; i < years.length; i++) {
        var y = years[i];
        var curM = y.monthCount ? won(y.salary / y.monthCount) : won(cur.monthlySalary);
        var trM = yearMapWon(trial.monthlySalaryByYear, y.year, trial.monthlySalary);
        if (Math.abs(trM - curM) > 1) return false;
      }
    } else if (Math.abs(won(trial.monthlySalary) - won(cur.monthlySalary)) > 1) {
      return false;
    }
    if (settleOn !== !!cur.profitSettleOn) return false;
    if (settleOn) {
      if (hasYearMap(trial.profitSettleRateByYear) && years.length) {
        for (var s = 0; s < years.length; s++) {
          var ys = years[s];
          var exp = won(ys.revenue * yearMapRatio(trial.profitSettleRateByYear, ys.year, trial.profitSettleRate));
          if (Math.abs(exp - won(ys.profitSettle)) > 1) return false;
        }
      } else if (Math.abs(won(trial.profitSettle) - won(cur.profitSettle)) > 1) {
        return false;
      }
    }
    if (divOn !== !!cur.dividendOn) return false;
    if (!divOn) return true;
    if (hasYearMap(trial.dividendRateByYear) && years.length) {
      var curRate = App.Money.toRatio(cur.dividendRate);
      for (var d = 0; d < years.length; d++) {
        if (Math.abs(yearMapRatio(trial.dividendRateByYear, years[d].year, trial.dividendRate) - curRate) > 0.0000005) {
          return false;
        }
      }
      return true;
    }
    return Math.abs(App.Money.toRatio(trial.dividendRate) - App.Money.toRatio(cur.dividendRate)) < 0.0000005;
  }

  function previewOwnerPayoutTrial(state, result, trialIn) {
    if (!state || !trialIn) return null;
    var fit = analyzeOwnerPayoutFit(state, result);
    var trial = evaluateOwnerPayoutTrial(fit, trialIn);
    if (trialMatchesCurrent(fit, trial)) return null;
    var sandbox = applyOwnerPayoutTrialToState(state, trial);
    return {
      state: sandbox,
      result: App.Engine.runSimulation(sandbox),
      trial: trial
    };
  }

  App.Engine.analyzeOwnerPayoutFit = analyzeOwnerPayoutFit;
  App.Engine.evaluateOwnerPayoutTrial = evaluateOwnerPayoutTrial;
  App.Engine.applyOwnerPayoutTrialToState = applyOwnerPayoutTrialToState;
  App.Engine.previewOwnerPayoutTrial = previewOwnerPayoutTrial;
})();
