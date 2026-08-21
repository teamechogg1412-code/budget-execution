(function () {
  window.App = window.App || {};
  App.Engine = App.Engine || {};

  function emptyTaxResult() {
    return {
      mode: "auto",
      year: 2026,
      source: App.PersonalTax.SOURCE,
      incomeType: "other",
      attributedIncome: 0,
      earnedGross: 0,
      earnedIncomeDeduction: 0,
      earnedIncomeAmount: 0,
      businessIncome: 0,
      otherIncome: 0,
      additionalIncome: 0,
      necessaryExpenses: 0,
      otherAdjustment: 0,
      autoIncomeDeduction: 0,
      userIncomeDeduction: 0,
      incomeDeduction: 0,
      comprehensiveIncome: 0,
      taxableBase: 0,
      bracketRate: 0,
      progressiveDeduction: 0,
      assessedTax: 0,
      incomeTax: 0,
      autoTaxCredit: 0,
      userTaxCredit: 0,
      taxCredit: 0,
      determinedTax: 0,
      localIncomeTax: 0,
      prepaidTax: 0,
      withholdingTax: 0,
      prepaidTotal: 0,
      totalPersonalTax: 0,
      additionalIncomeTax: 0,
      additionalPayment: 0,
      refund: 0,
      afterTaxIncome: 0
    };
  }

  function pickPersonalBracket(base, brackets) {
    var n = App.Money.roundWon(base);
    if (n <= 0) return { tax: 0, rate: 0, deduction: 0 };
    var list = brackets || [];
    var chosen = null;
    var i;
    for (i = 0; i < list.length; i++) {
      var cap = list[i].upTo;
      if (cap == null || cap === Infinity || !isFinite(Number(cap)) || n <= cap) {
        chosen = list[i];
        break;
      }
    }
    if (!chosen) chosen = list[list.length - 1] || { rate: 0, deduction: 0 };
    return {
      tax: Math.max(0, App.Money.roundWon(n * chosen.rate - chosen.deduction)),
      rate: chosen.rate,
      deduction: chosen.deduction
    };
  }

  function calculatePersonalIncomeTax(taxableBase, year) {
    var table = App.PersonalTax.resolveTable(year);
    var picked = pickPersonalBracket(taxableBase, table.brackets);
    return {
      year: table.year,
      source: table.source,
      taxableBase: Math.max(0, App.Money.roundWon(taxableBase)),
      tax: picked.tax,
      rate: picked.rate,
      deduction: picked.deduction
    };
  }

  function calculateLocalIncomeTax(incomeTax, year) {
    var table = App.PersonalTax.resolveTable(year);
    return App.Money.roundWon(App.Money.roundWon(incomeTax) * App.Money.toSafeNumber(table.localRate));
  }

  function resolveAttributedIncome(linkedIncome, settings) {
    settings = settings && typeof settings === "object" ? settings : {};
    if (settings.useLinkedIncome === false) return App.Money.roundWon(settings.attributedIncome);
    return App.Money.roundWon(linkedIncome);
  }

  function resolveIncomeBuckets(linkedIncome, settings) {
    settings = settings && typeof settings === "object" ? settings : {};
    var split = settings.incomeSplit && typeof settings.incomeSplit === "object" ? settings.incomeSplit : null;
    var earnedGross = 0;
    var businessIncome = 0;
    var otherIncome = 0;
    var linked = resolveAttributedIncome(linkedIncome, settings);
    if (split && settings.useLinkedIncome !== false) {
      earnedGross = App.Money.roundWon(split.earnedGross);
      businessIncome = App.Money.roundWon(split.businessIncome);
      otherIncome = App.Money.roundWon(split.otherIncome);
    } else {
      var type = settings.incomeType || "other";
      if (type === "business") businessIncome = linked;
      else if (type === "earned") earnedGross = linked;
      else otherIncome = linked;
    }
    otherIncome = App.Money.roundWon(otherIncome + App.Money.roundWon(settings.additionalIncome));
    return {
      linked: linked,
      earnedGross: earnedGross,
      businessIncome: businessIncome,
      otherIncome: otherIncome
    };
  }

  function copyTaxSettings(settings, split) {
    settings = settings && typeof settings === "object" ? settings : {};
    var out = {};
    Object.keys(settings).forEach(function (k) { out[k] = settings[k]; });
    if (split) {
      out.incomeSplit = {
        earnedGross: App.Money.roundWon(split.earnedGross),
        businessIncome: App.Money.roundWon(split.businessIncome),
        otherIncome: App.Money.roundWon(split.otherIncome)
      };
    }
    return out;
  }

  function calculatePersonalTaxDetail(linkedIncome, settings) {
    settings = settings && typeof settings === "object" ? settings : {};
    var out = emptyTaxResult();
    var year = settings.year || 2026;
    var table = App.PersonalTax.resolveTable(year);
    var buckets = resolveIncomeBuckets(linkedIncome, settings);
    var expenses = App.Money.roundWon(settings.necessaryExpenses);
    var otherAdj = App.Money.roundWon(settings.otherAdjustment);
    var userDeduction = App.Money.roundWon(settings.incomeDeduction);
    var userCredit = App.Money.roundWon(settings.taxCredit);
    var prepaid = App.Money.roundWon(settings.prepaidTax);
    var withholding = App.Money.roundWon(settings.withholdingTax);

    var earnedDeduction = App.PersonalTax.calculateEarnedIncomeDeduction(buckets.earnedGross);
    var earnedAmount = App.Money.roundWon(buckets.earnedGross - earnedDeduction);
    if (earnedAmount < 0) earnedAmount = 0;
    var businessAmount = App.Money.roundWon(buckets.businessIncome - expenses);
    if (businessAmount < 0) businessAmount = 0;
    var otherAmount = App.Money.roundWon(buckets.otherIncome);
    var comprehensive = App.Money.roundWon(earnedAmount + businessAmount + otherAmount - otherAdj);
    if (comprehensive < 0) comprehensive = 0;
    var taxable = App.Money.roundWon(comprehensive - userDeduction);
    if (taxable < 0) taxable = 0;

    var national = calculatePersonalIncomeTax(taxable, year);
    var autoCredit = App.PersonalTax.calculateEarnedIncomeTaxCredit(national.tax, buckets.earnedGross);
    var credit = App.Money.roundWon(autoCredit + userCredit);
    if (credit > national.tax) credit = national.tax;
    var determined = Math.max(0, App.Money.roundWon(national.tax - credit));
    var local = calculateLocalIncomeTax(determined, year);
    var total = App.Money.roundWon(determined + local);
    var prepaidTotal = App.Money.roundWon(prepaid + withholding);
    var additionalIncomeTax = App.Money.roundWon(determined - prepaidTotal);
    var extra = App.Money.roundWon(total - prepaidTotal);
    var grossIncome = App.Money.roundWon(buckets.earnedGross + buckets.businessIncome + buckets.otherIncome);
    var linkedGross = App.Money.roundWon(grossIncome - App.Money.roundWon(settings.additionalIncome));

    out.mode = "auto";
    out.year = table.year;
    out.source = table.source;
    out.incomeType = settings.incomeType || "other";
    out.attributedIncome = settings.useLinkedIncome === false ? resolveAttributedIncome(0, settings) : linkedGross;
    out.earnedGross = buckets.earnedGross;
    out.earnedIncomeDeduction = earnedDeduction;
    out.earnedIncomeAmount = earnedAmount;
    out.businessIncome = App.Money.roundWon(buckets.businessIncome);
    out.otherIncome = App.Money.roundWon(buckets.otherIncome);
    out.additionalIncome = App.Money.roundWon(settings.additionalIncome);
    out.necessaryExpenses = expenses;
    out.otherAdjustment = otherAdj;
    out.autoIncomeDeduction = earnedDeduction;
    out.userIncomeDeduction = userDeduction;
    out.incomeDeduction = App.Money.roundWon(earnedDeduction + userDeduction);
    out.comprehensiveIncome = comprehensive;
    out.taxableBase = taxable;
    out.bracketRate = national.rate;
    out.progressiveDeduction = national.deduction;
    out.assessedTax = national.tax;
    out.incomeTax = national.tax;
    out.autoTaxCredit = autoCredit;
    out.userTaxCredit = userCredit;
    out.taxCredit = credit;
    out.determinedTax = determined;
    out.localIncomeTax = local;
    out.prepaidTax = prepaid;
    out.withholdingTax = withholding;
    out.prepaidTotal = prepaidTotal;
    out.totalPersonalTax = total;
    out.additionalIncomeTax = additionalIncomeTax;
    out.additionalPayment = extra;
    out.refund = extra < 0 ? -extra : 0;
    out.afterTaxIncome = App.Money.roundWon(grossIncome - total);
    return out;
  }

  function calculateScenarioPersonalTaxDetail(income, settings) {
    settings = settings && typeof settings === "object" ? settings : {};
    var mode = settings.mode === "rate" || settings.mode === "manual" || settings.mode === "auto"
      ? settings.mode
      : "manual";
    var buckets = resolveIncomeBuckets(income, settings);
    var gross = App.Money.roundWon(buckets.earnedGross + buckets.businessIncome + buckets.otherIncome);
    if (mode === "rate") {
      var outRate = emptyTaxResult();
      outRate.mode = "rate";
      outRate.year = settings.year || 2026;
      outRate.incomeType = settings.incomeType || "other";
      outRate.attributedIncome = resolveAttributedIncome(income, settings);
      outRate.earnedGross = buckets.earnedGross;
      outRate.businessIncome = buckets.businessIncome;
      outRate.otherIncome = buckets.otherIncome;
      outRate.totalPersonalTax = App.Money.roundWon(gross * App.Money.toRatio(settings.effectiveRate));
      outRate.incomeTax = outRate.totalPersonalTax;
      outRate.assessedTax = outRate.totalPersonalTax;
      outRate.determinedTax = outRate.totalPersonalTax;
      outRate.additionalPayment = outRate.totalPersonalTax;
      outRate.additionalIncomeTax = outRate.totalPersonalTax;
      outRate.afterTaxIncome = App.Money.roundWon(gross - outRate.totalPersonalTax);
      outRate.source = "유효세율 적용 (누진세율 미사용)";
      return outRate;
    }
    if (mode === "manual") {
      var outMan = emptyTaxResult();
      outMan.mode = "manual";
      outMan.year = settings.year || 2026;
      outMan.incomeType = settings.incomeType || "other";
      outMan.attributedIncome = resolveAttributedIncome(income, settings);
      outMan.earnedGross = buckets.earnedGross;
      outMan.businessIncome = buckets.businessIncome;
      outMan.otherIncome = buckets.otherIncome;
      outMan.totalPersonalTax = App.Money.roundWon(settings.manualTaxAmount);
      outMan.incomeTax = outMan.totalPersonalTax;
      outMan.assessedTax = outMan.totalPersonalTax;
      outMan.determinedTax = outMan.totalPersonalTax;
      outMan.additionalPayment = outMan.totalPersonalTax;
      outMan.additionalIncomeTax = outMan.totalPersonalTax;
      outMan.afterTaxIncome = App.Money.roundWon(gross - outMan.totalPersonalTax);
      outMan.source = "수동 세액 (세무사 예상세액 등)";
      return outMan;
    }
    return calculatePersonalTaxDetail(income, settings);
  }

  function calculateScenarioPersonalTax(income, settings) {
    return calculateScenarioPersonalTaxDetail(income, settings).totalPersonalTax;
  }

  App.Engine.pickPersonalBracket = pickPersonalBracket;
  App.Engine.calculatePersonalIncomeTax = calculatePersonalIncomeTax;
  App.Engine.calculateLocalIncomeTax = calculateLocalIncomeTax;
  App.Engine.calculatePersonalTaxDetail = calculatePersonalTaxDetail;
  App.Engine.calculateScenarioPersonalTaxDetail = calculateScenarioPersonalTaxDetail;
  App.Engine.calculateScenarioPersonalTax = calculateScenarioPersonalTax;
  App.Engine.copyTaxSettings = copyTaxSettings;
  App.Engine.calculateEarnedIncomeDeduction = App.PersonalTax.calculateEarnedIncomeDeduction;
  App.Engine.calculateEarnedIncomeTaxCredit = App.PersonalTax.calculateEarnedIncomeTaxCredit;
})();
