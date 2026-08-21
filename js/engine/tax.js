(function () {
  window.App = window.App || {};
  App.Engine = App.Engine || {};

  function pickBracket(base, brackets) {
    var n = App.Money.roundWon(base);
    if (n <= 0) return { tax: 0, rate: 0, deduction: 0 };
    var list = brackets || [];
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (n <= b.upTo) {
        return {
          tax: Math.max(0, App.Money.roundWon(n * b.rate - b.deduction)),
          rate: b.rate,
          deduction: b.deduction
        };
      }
    }
    return { tax: 0, rate: 0, deduction: 0 };
  }

  function resolveCorporateRule(year, taxSettings) {
    var settings = taxSettings || {};
    var table = App.CorporateTax && App.CorporateTax.resolveTable
      ? App.CorporateTax.resolveTable(year || settings.year || 2026)
      : { brackets: settings.corporateBrackets, localRate: settings.localTaxRate, source: "" };
    var saved = settings.corporateBrackets;
    var useSaved = Array.isArray(saved) && saved.length &&
      !(App.CorporateTax && App.CorporateTax.isCatalogCorporateBrackets &&
        App.CorporateTax.isCatalogCorporateBrackets(saved));
    var brackets = useSaved ? saved : (table.brackets || saved);
    var localRate = settings.localTaxRate != null ? settings.localTaxRate : table.localRate;
    return {
      year: table.year || Number(year) || 2026,
      brackets: brackets,
      localRate: App.Money.toSafeNumber(localRate),
      source: table.source || ""
    };
  }

  function calculateEstimatedTax(profit, taxSettings, year) {
    var rule = resolveCorporateRule(year || (taxSettings && taxSettings.year), taxSettings);
    var taxable = Math.max(0, App.Money.roundWon(profit && profit.revenue) - App.Money.roundWon(profit && profit.pnlExpense));
    var corp = pickBracket(taxable, rule.brackets);
    var local = App.Money.roundWon(corp.tax * rule.localRate);
    return {
      year: rule.year,
      taxable: taxable,
      corporate: corp.tax,
      local: local,
      total: corp.tax + local,
      rate: corp.rate,
      source: rule.source
    };
  }

  function emptyYearTax(year) {
    return {
      year: Number(year) || 2026,
      months: [],
      revenue: 0,
      pnlExpense: 0,
      preTaxProfit: 0,
      taxAdjustment: 0,
      adjustedProfit: 0,
      nolOpening: 0,
      nolUsed: 0,
      nolIncurred: 0,
      nolClosing: 0,
      taxableIncome: 0,
      corporateTax: 0,
      localIncomeTax: 0,
      totalTax: 0,
      afterTaxNet: 0,
      rate: 0
    };
  }

  function taxAdjustmentForYear(taxSettings, year) {
    var total = 0;
    ((taxSettings && taxSettings.adjustments) || []).forEach(function (item) {
      if (Number(item && item.year) !== Number(year)) return;
      total += App.Money.roundWon(item.amount);
    });
    return App.Money.roundWon(total);
  }

  function lossCarryforwardOptions(taxSettings) {
    var raw = (taxSettings && taxSettings.lossCarryforward) || {};
    var limit = App.Money.toSafeNumber(raw.limitRate);
    if (!Number.isFinite(limit) || limit <= 0) limit = 1;
    if (limit > 1) limit = 1;
    var apply = raw.apply != null ? raw.apply !== false : raw.enabled !== false;
    return {
      apply: apply,
      openingBalance: Math.max(0, App.Money.roundWon(raw.openingBalance)),
      limitRate: limit
    };
  }

  function calculateCorporateTaxByYears(flows, taxSettings) {
    var grouped = App.TaxYear.groupFlowsByYear(flows || []);
    var years = Object.keys(grouped).map(Number).sort(function (a, b) { return a - b; });
    var nol = lossCarryforwardOptions(taxSettings);
    var carry = nol.apply ? nol.openingBalance : 0;
    var byYear = {};
    var corporate = 0;
    var local = 0;
    var taxable = 0;
    years.forEach(function (year) {
      var g = grouped[year];
      var adjustment = taxAdjustmentForYear(taxSettings, year);
      var bookProfit = g.preTaxProfit;
      var adjusted = App.Money.roundWon(bookProfit + adjustment);
      var nolOpening = carry;
      var nolUsed = 0;
      var nolIncurred = 0;
      var taxableIncome = 0;
      if (!nol.apply) {
        taxableIncome = Math.max(0, adjusted);
      } else if (adjusted <= 0) {
        nolIncurred = App.Money.roundWon(-adjusted);
        carry = App.Money.roundWon(carry + nolIncurred);
        taxableIncome = 0;
      } else {
        var cap = nol.limitRate >= 1 ? adjusted : App.Money.roundWon(adjusted * nol.limitRate);
        if (cap < 0) cap = 0;
        nolUsed = Math.min(carry, cap);
        taxableIncome = App.Money.roundWon(adjusted - nolUsed);
        carry = App.Money.roundWon(carry - nolUsed);
      }
      var one = calculateEstimatedTax({ revenue: taxableIncome, pnlExpense: 0 }, taxSettings, year);
      var row = emptyYearTax(year);
      row.months = g.months.slice();
      row.revenue = g.revenue;
      row.pnlExpense = g.pnlExpense;
      row.preTaxProfit = bookProfit;
      row.taxAdjustment = adjustment;
      row.adjustedProfit = adjusted;
      row.nolOpening = nolOpening;
      row.nolUsed = nolUsed;
      row.nolIncurred = nolIncurred;
      row.nolClosing = carry;
      row.taxableIncome = one.taxable;
      row.corporateTax = one.corporate;
      row.localIncomeTax = one.local;
      row.totalTax = one.total;
      row.afterTaxNet = App.Money.roundWon(bookProfit - one.corporate - one.local);
      row.rate = one.rate;
      row.source = one.source;
      byYear[year] = row;
      corporate += one.corporate;
      local += one.local;
      taxable += one.taxable;
    });
    return {
      byYear: byYear,
      years: years,
      taxable: App.Money.roundWon(taxable),
      corporate: App.Money.roundWon(corporate),
      local: App.Money.roundWon(local),
      total: App.Money.roundWon(corporate + local),
      afterTaxNet: App.Money.roundWon(
        years.reduce(function (sum, year) {
          return sum + App.Money.roundWon((byYear[year] && byYear[year].afterTaxNet) || 0);
        }, 0)
      ),
      rate: years.length === 1 && byYear[years[0]] ? byYear[years[0]].rate : 0,
      source: (years[0] && byYear[years[0]] && byYear[years[0]].source) || "",
      lossCarryforward: {
        apply: nol.apply,
        openingBalance: nol.openingBalance,
        closingBalance: carry,
        limitRate: nol.limitRate
      }
    };
  }

  function corporateTaxDueMonth(year, taxSettings) {
    taxSettings = taxSettings || {};
    if (taxSettings.cashOutMonth) return App.Month.normalizeMonth(taxSettings.cashOutMonth);
    return String(Number(year) + 1) + "-03";
  }

  function lastMonthOfTaxYear(year, months) {
    var last = "";
    (months || []).forEach(function (m) {
      if (String(m).slice(0, 4) === String(year) && (!last || m > last)) last = m;
    });
    return last || null;
  }

  function yearTaxCashPaid(year, flows, taxSettings) {
    var due = corporateTaxDueMonth(year, taxSettings);
    if (!due) return false;
    for (var i = 0; i < (flows || []).length; i++) {
      if (flows[i].month !== due) continue;
      return App.Money.roundWon(flows[i].taxCashOut || 0) > 0;
    }
    return false;
  }

  function applyCorporateTaxPending(flows, tax, taxSettings) {
    var months = (flows || []).map(function (row) { return row.month; });
    var lastMonth = months.length ? months[months.length - 1] : "";
    var byYear = (tax && tax.byYear) || {};
    (flows || []).forEach(function (row) {
      var pendingCorp = 0;
      var pendingLocal = 0;
      Object.keys(byYear).forEach(function (year) {
        var y = byYear[year] || {};
        var accrual = lastMonthOfTaxYear(year, months);
        if (!accrual || row.month < accrual) return;
        if (yearTaxCashPaid(year, flows, taxSettings) && row.month >= corporateTaxDueMonth(year, taxSettings)) return;
        pendingCorp += App.Money.roundWon(y.corporateTax);
        pendingLocal += App.Money.roundWon(y.localIncomeTax);
      });
      row.pendingCorporateTax = App.Money.roundWon(pendingCorp);
      row.pendingLocalTax = App.Money.roundWon(pendingLocal);
      row.pendingTax = App.Money.roundWon(pendingCorp + pendingLocal);
      row.closingAfterTax = App.Money.roundWon(row.closing - row.pendingTax);
      row.taxPayDisplay = App.Money.roundWon(
        App.Money.toSafeNumber(row.corporateTaxCashOut) + App.Money.toSafeNumber(row.localIncomeTaxCashOut)
      );
    });
    Object.keys(byYear).forEach(function (year) {
      var y = byYear[year] || {};
      var amount = App.Money.roundWon(y.totalTax);
      if (!amount) return;
      if (yearTaxCashPaid(year, flows, taxSettings)) return;
      var due = corporateTaxDueMonth(year, taxSettings);
      var accrual = lastMonthOfTaxYear(year, months);
      var target = "";
      (flows || []).forEach(function (row) {
        if (row.month === due) target = due;
      });
      if (!target) target = accrual || lastMonth;
      (flows || []).forEach(function (row) {
        if (row.month !== target) return;
        row.taxPayDisplay = App.Money.roundWon(row.taxPayDisplay + amount);
      });
    });
    return flows;
  }

  App.Engine.pickBracket = pickBracket;
  App.Engine.resolveCorporateRule = resolveCorporateRule;
  App.Engine.calculateEstimatedTax = calculateEstimatedTax;
  App.Engine.calculateCorporateTaxByYears = calculateCorporateTaxByYears;
  App.Engine.corporateTaxDueMonth = corporateTaxDueMonth;
  App.Engine.applyCorporateTaxPending = applyCorporateTaxPending;
})();
