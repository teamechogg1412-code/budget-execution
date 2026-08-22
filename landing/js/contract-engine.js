(function () {
  window.App = window.App || {};

  // 공개 「내 전속계약 분석」— 상세 엔진 제한 프리셋 래퍼.
  // quick-engine을 확장하지 않는다.
  var PRESET = {
    taxYear: 2027,
    startMonth: "2027-01",
    endMonth: "2027-12",
    initialCash: 50000000,
    ownerMonthlySalary: 5000000,
    similarThreshold: 0.05,
    smallAbsFloor: 1000000
  };

  function money(v) {
    var n = App.Money.roundWon(v);
    return n < 0 ? 0 : n;
  }

  function clampPercent(v) {
    var n = App.Money.toSafeNumber(v);
    if (!isFinite(n)) n = 0;
    if (n < 0) n = 0;
    if (n > 100) n = 100;
    return n;
  }

  function normalizeInput(raw) {
    raw = raw || {};
    var adFeeOn = raw.adSeparateFeeOn === true || raw.adSeparateFeeOn === "true" || raw.adSeparateFeeOn === 1;
    return {
      annualWorkIncome: money(raw.annualWorkIncome),
      annualAdIncome: money(raw.annualAdIncome),
      actorShareRatePercent: clampPercent(raw.actorShareRatePercent != null ? raw.actorShareRatePercent : raw.currentAgencyRate),
      agencyCoveredCostAnnual: money(raw.agencyCoveredCostAnnual != null ? raw.agencyCoveredCostAnnual : raw.currentAgencyCoveredCost),
      actorPersonalCostAnnual: money(raw.actorPersonalCostAnnual),
      adSeparateFeeOn: adFeeOn,
      adFeeRatePercent: clampPercent(raw.adFeeRatePercent),
      otherFinancialIncome: money(raw.otherFinancialIncome),
      ownerMonthlySalary: money(
        raw.ownerMonthlySalary != null && raw.ownerMonthlySalary !== ""
          ? raw.ownerMonthlySalary
          : PRESET.ownerMonthlySalary
      ),
      dividendOn: raw.dividendOn === true,
      dividendAmount: money(raw.dividendAmount),
      otherOpCostAnnual: money(raw.otherOpCostAnnual)
    };
  }

  function disableNoisePolicies(state) {
    state.settings.supportPolicies = (state.settings.supportPolicies || []).map(function (p) {
      var copy = Object.assign({}, p);
      copy.include = false;
      copy.unitAmount = 0;
      return copy;
    });
    state.settings.scenarios.exclusiveContract.actorPersonalCosts = [];
    state.settings.scenarios.exclusiveContract.actorPersonalCatalogRemoved = [
      "apc-hair", "apc-makeup", "apc-styling"
    ];
    state.revenueFees = [];
    state.recurringExpenses = [];
    state.dayBasedExpenses = [];
    state.startupExpenses = [];
    state.deposits = [];
    state.vehicles = [];
    state.assets = [];
  }

  function addAnnualSupport(state, opts) {
    var annual = money(opts.annual);
    if (annual <= 0) return;
    var monthly = App.Money.roundWon(annual / 12);
    var policy = App.Defaults.newSupportPolicy();
    policy.id = opts.id;
    policy.name = opts.name;
    policy.calcMode = "monthlyFixed";
    policy.unitAmount = monthly;
    policy.quantity = 1;
    policy.include = true;
    policy.costClass = "sga";
    policy.soloPayer = opts.soloPayer || "company";
    policy.exclusivePayer = opts.exclusivePayer || "company";
    policy.soloCompanyShareRate = opts.soloPayer === "actor" ? 0 : 1;
    policy.exclusiveCompanyShareRate = opts.exclusivePayer === "actor" ? 0 : 1;
    state.settings.supportPolicies.push(policy);
  }

  function addProject(state, category, amount, name) {
    amount = money(amount);
    if (amount <= 0) return null;
    var p = App.Defaults.newProject(PRESET.startMonth, category, state);
    p.name = name || category;
    p.status = "confirmed";
    p.contractAmount = amount;
    p.expenseInclude = false;
    p.lunchTruckInclude = false;
    p.payments = [
      Object.assign(App.Defaults.newPayment("2027-06"), {
        amount: amount,
        inputMode: "amount"
      })
    ];
    state.projects.push(p);
    return p;
  }

  function buildState(rawInput) {
    var input = normalizeInput(rawInput);
    var state = App.Defaults.emptyState();
    state.meta.title = "전속계약 분석";
    state.profile.actorName = "배우";
    state.profile.startMonth = PRESET.startMonth;
    state.profile.endMonth = PRESET.endMonth;
    state.profile.initialCash = PRESET.initialCash;
    state.settings.personalTaxCommon.year = PRESET.taxYear;
    state.settings.tax.otherFinancialIncome = input.otherFinancialIncome;

    disableNoisePolicies(state);
    // ensureRevenueFees가 빈 배열을 기본 써니스/메리디안으로 채우지 않게 함
    state.settings.revenueFeesUserCleared = true;
    state.revenueFees = [];

    addProject(state, "drama", input.annualWorkIncome, "연간 작품");
    addProject(state, "ad", input.annualAdIncome, "연간 광고·기타");

    if (input.adSeparateFeeOn && input.adFeeRatePercent > 0 && input.annualAdIncome > 0) {
      state.revenueFees.push({
        id: "rf-contract-ad",
        name: "광고 별도 수수료",
        basis: "salesRevenue",
        revenueScope: "salesRevenue",
        rate: App.Money.toRatio(input.adFeeRatePercent),
        category: "agency",
        include: true
      });
    }

    addAnnualSupport(state, {
      id: "sp-contract-agency-covered",
      name: "소속사 부담 비용(계약분석)",
      annual: input.agencyCoveredCostAnnual,
      exclusivePayer: "company",
      soloPayer: "company"
    });
    // 배우 부담 = 독립 후에도 필요한 비용.
    // 전속: 배우 개인 부담(exclusive actor cost). 1인 기획사: 법인 운영비(solo company).
    // soloPayer:"actor"는 엔진에서 solo 비용 0이 되므로 쓰지 않는다.
    addAnnualSupport(state, {
      id: "sp-contract-actor-personal",
      name: "배우 부담 비용(계약분석)",
      annual: input.actorPersonalCostAnnual,
      exclusivePayer: "actor",
      soloPayer: "company"
    });
    if (input.otherOpCostAnnual > 0) {
      addAnnualSupport(state, {
        id: "sp-contract-other-op",
        name: "기타 운영비(계약분석)",
        annual: input.otherOpCostAnnual,
        exclusivePayer: "company",
        soloPayer: "company"
      });
    }

    var actorRate = App.Money.toRatio(input.actorShareRatePercent);
    state.settings.scenarios.exclusiveContract.actorShareRate = actorRate;
    state.settings.scenarios.exclusiveContract.companyShareRate = App.Money.roundWon
      ? Math.max(0, Math.min(1, 1 - actorRate))
      : Math.max(0, Math.min(1, 1 - actorRate));
    state.settings.scenarios.exclusiveContract.companyShareRate =
      Math.round((1 - actorRate) * 1e8) / 1e8;

    state.employees = [{
      id: "ceo-contract",
      name: "대표",
      role: "대표이사",
      monthlySalary: input.ownerMonthlySalary,
      include: true,
      insure: false,
      meal: false,
      severance: false
    }];
    var op = state.settings.scenarios.soloAgency.ownerPayout;
    op.salaryEmployeeId = "ceo-contract";
    if (App.Defaults.setOwnerDividendOn) {
      App.Defaults.setOwnerDividendOn(state, !!input.dividendOn);
    } else {
      op.dividendOn = !!input.dividendOn;
    }
    op.dividendMode = "amount";
    op.dividendAmount = input.dividendOn ? input.dividendAmount : 0;
    op.dividendRate = 0;

    state.settings.scenarioComparison.enabledScenarioIds = ["soloAgency", "exclusiveContract"];
    App.Defaults.ensureState(state);
    if (App.Defaults.normalizeShareRates) App.Defaults.normalizeShareRates(state);
    // ensureState가 카탈로그 정책을 다시 넣을 수 있어, 계약분석 전용만 남기고 나머지를 끔
    (state.settings.supportPolicies || []).forEach(function (p) {
      if (!p) return;
      if (p.id === "sp-contract-agency-covered" ||
          p.id === "sp-contract-actor-personal" ||
          p.id === "sp-contract-other-op") {
        return;
      }
      p.include = false;
      p.unitAmount = 0;
    });
    state.settings.revenueFeesUserCleared = true;
    if (!(input.adSeparateFeeOn && input.adFeeRatePercent > 0 && input.annualAdIncome > 0)) {
      state.revenueFees = [];
    } else {
      state.revenueFees = (state.revenueFees || []).filter(function (f) {
        return f && f.id === "rf-contract-ad";
      });
    }
    return state;
  }

  function pickSide(scenario) {
    scenario = scenario || {};
    return {
      actorNetIncome: App.Money.roundWon(scenario.actorNetIncome),
      controlledEconomicValue: App.Money.roundWon(scenario.controlledEconomicValue),
      personalTax: App.Money.roundWon(scenario.personalTax),
      actorGrossIncome: App.Money.roundWon(scenario.actorGrossIncome || scenario.actorAttributedRevenue),
      ownerDividendTaxMode: scenario.ownerDividendTaxMode || null,
      companySupportValue: App.Money.roundWon(scenario.companySupportValue),
      corporateAfterTaxNet: App.Money.roundWon(scenario.corporateAfterTaxNet),
      actorBorneSupportCost: App.Money.roundWon(scenario.actorBorneSupportCost)
    };
  }

  function relativeDiff(delta, a, b) {
    var denom = Math.max(Math.abs(a), Math.abs(b), 1);
    return delta / denom;
  }

  function diagnose(presented) {
    presented = presented || {};
    var ex = presented.exclusive || {};
    var solo = presented.soloAgency || {};
    var delta = App.Money.roundWon(
      (presented.deltas && presented.deltas.actorNetIncome != null)
        ? presented.deltas.actorNetIncome
        : (solo.actorNetIncome - ex.actorNetIncome)
    );
    var a = App.Money.roundWon(ex.actorNetIncome);
    var b = App.Money.roundWon(solo.actorNetIncome);
    var r = relativeDiff(delta, a, b);
    var verdict = "similar";
    if (Math.max(Math.abs(a), Math.abs(b)) < PRESET.smallAbsFloor) {
      verdict = "similar";
    } else if (r > PRESET.similarThreshold) {
      verdict = "lean_solo";
    } else if (r < -PRESET.similarThreshold) {
      verdict = "lean_exclusive";
    }

    var headline;
    if (verdict === "lean_solo") {
      headline = "현재 매출·배분에서는 1인 기획사 검토 가치가 있습니다.";
    } else if (verdict === "lean_exclusive") {
      headline = "현재 조건에서는 전속계약 유지가 실수령 기준으로 유리할 수 있습니다.";
    } else if (Math.max(Math.abs(a), Math.abs(b)) < PRESET.smallAbsFloor) {
      headline = "금액 규모가 작아 방향만으로는 판단하기 어렵습니다. 가정을 바꿔 다시 비교해보세요.";
    } else {
      headline = "세후 개인 실수령 기준으로 두 구조의 차이가 크지 않습니다(±5% 이내).";
    }

    return {
      verdict: verdict,
      primaryMetric: "actorNetIncome",
      relativeDiff: Math.round(r * 10000) / 10000,
      headline: headline,
      drivers: (presented.sensitivity || []).slice(0, 3),
      disclaimer: "시뮬레이션 해석이며 법률·세무 자문이 아닙니다."
    };
  }

  function sensitivity(rawInput, basePresented) {
    var base = basePresented || calculate(rawInput, { skipSensitivity: true });
    var input = normalizeInput(rawInput);
    var probes = [
      {
        key: "actorShareRatePercent",
        label: "정산 비율",
        apply: function (src) {
          var next = Object.assign({}, src);
          next.actorShareRatePercent = clampPercent(src.actorShareRatePercent + 5);
          return next;
        }
      },
      {
        key: "agencyCoveredCostAnnual",
        label: "회사 부담 비용",
        apply: function (src) {
          var next = Object.assign({}, src);
          var bump = Math.max(App.Money.roundWon(src.agencyCoveredCostAnnual * 0.2), 1000000);
          next.agencyCoveredCostAnnual = money(src.agencyCoveredCostAnnual + bump);
          return next;
        }
      },
      {
        key: "actorPersonalCostAnnual",
        label: "배우 부담 비용",
        apply: function (src) {
          var next = Object.assign({}, src);
          var bump = Math.max(App.Money.roundWon(src.actorPersonalCostAnnual * 0.2), 1000000);
          next.actorPersonalCostAnnual = money(src.actorPersonalCostAnnual + bump);
          return next;
        }
      },
      {
        key: "annualWorkIncome",
        label: "작품 수익",
        apply: function (src) {
          var next = Object.assign({}, src);
          next.annualWorkIncome = money(src.annualWorkIncome * 1.1);
          return next;
        }
      }
    ];
    var baseDelta = base.deltas.actorNetIncome;
    var rows = probes.map(function (probe) {
      var alt = calculate(probe.apply(input), { skipSensitivity: true });
      var deltaIfChanged = App.Money.roundWon(alt.deltas.actorNetIncome - baseDelta);
      return {
        key: probe.key,
        label: probe.label,
        deltaIfChanged: deltaIfChanged,
        absImpact: Math.abs(deltaIfChanged)
      };
    });
    rows.sort(function (a, b) { return b.absImpact - a.absImpact; });
    return rows.map(function (row, i) {
      return {
        key: row.key,
        label: row.label,
        rank: i + 1,
        deltaIfChanged: row.deltaIfChanged,
        note: row.label + " 가정이 바뀌면 실수령 차이가 가장 크게 움직입니다."
      };
    });
  }

  function calculate(rawInput, opts) {
    opts = opts || {};
    var input = normalizeInput(rawInput);
    var state = buildState(input);
    var run = App.Engine.runSimulation(state);
    var cmp = App.Engine.runScenarioComparison(state, run);
    var exclusive = pickSide(cmp.scenarios.exclusiveContract);
    var soloAgency = pickSide(cmp.scenarios.soloAgency);
    var presented = {
      input: input,
      preset: {
        taxYear: PRESET.taxYear,
        ownerMonthlySalary: input.ownerMonthlySalary,
        dividendOn: input.dividendOn,
        period: PRESET.startMonth + " ~ " + PRESET.endMonth
      },
      exclusive: exclusive,
      soloAgency: soloAgency,
      deltas: {
        actorNetIncome: App.Money.roundWon(soloAgency.actorNetIncome - exclusive.actorNetIncome),
        controlledEconomicValue: App.Money.roundWon(
          soloAgency.controlledEconomicValue - exclusive.controlledEconomicValue
        )
      },
      sensitivity: [],
      diagnosis: null,
      sharePath: buildSharePath()
    };
    if (!opts.skipSensitivity) {
      presented.sensitivity = sensitivity(input, presented);
    }
    presented.diagnosis = diagnose(presented);
    if (presented.sensitivity && presented.sensitivity[0]) {
      presented.diagnosis.drivers = presented.sensitivity.slice(0, 3);
      var top = presented.sensitivity[0];
      presented.diagnosis.sensitivityHint =
        "차이에서 가장 민감한 가정은 " + top.label + "입니다.";
    }
    return presented;
  }

  function buildSharePath(ref) {
    var path = "contract.html";
    if (ref) path += "?ref=" + encodeURIComponent(String(ref));
    return path;
  }

  function buildShareUrl(locationObj, ref) {
    var path = buildSharePath(ref);
    locationObj = locationObj || (typeof location !== "undefined" ? location : null);
    if (!locationObj || !locationObj.href) return path;
    try {
      var base = String(locationObj.href).split("?")[0];
      var dir = base.replace(/[^/]+$/, "");
      return dir + path;
    } catch (err) {
      return path;
    }
  }

  function summaryText(presented) {
    presented = presented || calculate({});
    var d = presented.diagnosis || {};
    return [
      "[전속계약 분석 요약]",
      d.headline || "",
      "전속 실수령: " + App.Format.formatWon(presented.exclusive.actorNetIncome),
      "독립 실수령: " + App.Format.formatWon(presented.soloAgency.actorNetIncome),
      "전속 통제가치: " + App.Format.formatWon(presented.exclusive.controlledEconomicValue),
      "독립 통제가치: " + App.Format.formatWon(presented.soloAgency.controlledEconomicValue),
      "※ 입력 원표·상세 금액은 포함하지 않았습니다."
    ].join("\n");
  }

  App.ContractEngine = {
    PRESET: PRESET,
    normalizeInput: normalizeInput,
    buildState: buildState,
    calculate: calculate,
    diagnose: diagnose,
    sensitivity: sensitivity,
    buildSharePath: buildSharePath,
    buildShareUrl: buildShareUrl,
    summaryText: summaryText
  };
})();
