(function () {
  window.App = window.App || {};
  App.Engine = App.Engine || {};

  function resolvedLineAmount(item) {
    if (!item || item.include === false) return 0;
    if (item.actualAmount !== null && item.actualAmount !== undefined && item.actualAmount !== "") {
      return App.Money.roundWon(item.actualAmount);
    }
    if (item.estimatedAmount !== null && item.estimatedAmount !== undefined && item.estimatedAmount !== "") {
      return App.Money.roundWon(item.estimatedAmount);
    }
    var qty = Math.max(App.Money.toSafeNumber(item.qty), 1);
    return App.Money.roundWon(App.Money.toSafeNumber(item.unitPrice) * qty);
  }

  function isEffectiveLineIncluded(item, corporateStatus) {
    if (!item || item.include === false) return false;
    var setupCostType = App.Defaults && App.Defaults.normalizeSetupCostType
      ? App.Defaults.normalizeSetupCostType(item)
      : item.setupCostType;
    if (corporateStatus === "existing" &&
        setupCostType === "incorporation" &&
        item.forceInclude !== true) {
      return false;
    }
    return true;
  }

  function resolvedEffectiveLineAmount(item, corporateStatus) {
    if (!isEffectiveLineIncluded(item, corporateStatus)) return 0;
    return resolvedLineAmount(item);
  }

  function itemMonth(item, fallback) {
    var parsed = App.Month.normalizeMonth(item && item.month);
    if (parsed) return parsed;
    return App.Month.normalizeMonth(fallback) || fallback;
  }

  function followsSimStartMonth(item) {
    return !item || item.monthMode !== "custom";
  }

  function resolvedOneTimeMonth(item, startMonth, kind) {
    var fallback = itemMonth(item, startMonth);
    if (kind !== "startup" && kind !== "deposit" && kind !== "capex") return fallback;
    if (!followsSimStartMonth(item)) return fallback;
    return App.Month.normalizeMonth(startMonth) || fallback;
  }

  function calculateOneTimeByMonth(list, months, startMonth, timing, kind, options) {
    options = options || {};
    var corporateStatus = options.corporateStatus || "new";
    var byMonth = {};
    (months || []).forEach(function (m) { byMonth[m] = { total: 0, items: [] }; });
    var skippedStart = [];
    (list || []).forEach(function (item) {
      var amount = kind === "startup"
        ? resolvedEffectiveLineAmount(item, corporateStatus)
        : resolvedLineAmount(item);
      if (!amount) return;
      var month = resolvedOneTimeMonth(item, startMonth, kind);
      if (timing === "afterOutflows" && month === startMonth &&
          (kind === "startup" || kind === "deposit" || kind === "capex")) {
        skippedStart.push({ item: item, amount: amount, kind: kind });
        return;
      }
      if (!byMonth[month]) return;
      byMonth[month].total += amount;
      byMonth[month].items.push({
        id: item.id,
        name: item.name || "",
        amount: amount,
        kind: kind,
        setupCostType: item.setupCostType || null
      });
    });
    return { byMonth: byMonth, skippedStart: skippedStart };
  }

  function calculateRecurringExpenses(items, months) {
    var simStart = months && months[0];
    var simEnd = months && months.length ? months[months.length - 1] : simStart;
    var byMonth = {};
    (months || []).forEach(function (m) { byMonth[m] = { total: 0, items: [] }; });
    (items || []).forEach(function (item) {
      if (item.include === false) return;
      if (App.Defaults && App.Defaults.isRetiredRecurringExpense && App.Defaults.isRetiredRecurringExpense(item)) return;
      (months || []).forEach(function (m) {
        if (!App.Month.appliesInMonth(item, m, simStart, simEnd)) return;
        var amount = item.overrides && item.overrides[m] !== undefined && item.overrides[m] !== ""
          ? App.Money.roundWon(item.overrides[m])
          : App.Money.roundWon(item.amount);
        if (!amount) return;
        byMonth[m].total += amount;
        byMonth[m].items.push({ id: item.id, name: item.name || "운영비", amount: amount });
      });
    });
    return { byMonth: byMonth };
  }

  function isSalesProject(project) {
    return !!(App.Defaults && App.Defaults.isSalesCategory &&
      App.Defaults.isSalesCategory(project && project.category));
  }

  function resolvedProjectExpenseRate(project, state) {
    if (App.Defaults && App.Defaults.resolvedExpenseRate) {
      return App.Defaults.resolvedExpenseRate(project, state);
    }
    return App.Money.toRatio(project && project.expenseRate);
  }

  function projectExpenseAmountMode(project) {
    return project && project.expenseAmountMode === "manual" ? "manual" : "auto";
  }

  function appearanceDayMealAmount(state, month) {
    if (!state) return 0;
    var start = state.profile && state.profile.startMonth;
    var end = state.profile && state.profile.endMonth;
    var m = App.Month.normalizeMonth(month) || App.Month.normalizeMonth(start);
    if (!m) return 0;
    var extra = App.Money.toSafeNumber(state.mealExtraHeadcount);
    var head = App.Engine.calculateMealHeadcount
      ? App.Engine.calculateMealHeadcount(state.employees || [], extra, m, end || m, start || m)
      : 0;
    var rate = App.Money.roundWon(state.settings && state.settings.meal && state.settings.meal.dailyRate);
    return App.Money.roundWon(rate * head);
  }

  function calculateAppearanceExpenseDetail(project, state) {
    var session = App.Defaults.appearanceSessionUnitTotal ? App.Defaults.appearanceSessionUnitTotal(state) : 0;
    var period = projectExpensePeriod(project);
    var mealMonth = (period && period.start) || (state && state.profile && state.profile.startMonth);
    var meal = appearanceDayMealAmount(state, mealMonth);
    var base = App.Money.roundWon(session + meal);
    var occurrences = App.Defaults.appearanceOccurrenceCount ? App.Defaults.appearanceOccurrenceCount(project) : 1;
    var multiplier = App.Defaults.appearanceExpenseMultiplier
      ? App.Defaults.appearanceExpenseMultiplier(project && project.category, state)
      : 1;
    return {
      session: session,
      meal: meal,
      mealMonth: mealMonth || "",
      base: base,
      occurrences: occurrences,
      multiplier: multiplier,
      total: App.Money.roundWon(base * occurrences * multiplier)
    };
  }

  function calculateProjectExpenseRegisteredTotal(project, state) {
    if (!project) return 0;
    if (projectExpenseAmountMode(project) === "manual") {
      return App.Money.roundWon(project.expenseManualAmount);
    }
    if (App.Defaults.usesAppearanceExpense && App.Defaults.usesAppearanceExpense(project)) {
      return calculateAppearanceExpenseDetail(project, state).total;
    }
    return App.Money.roundWon(App.Engine.projectContractAmount(project) * resolvedProjectExpenseRate(project, state));
  }

  function projectExpensePeriod(project) {
    var start = project && project.shootStartMonth;
    var end = project && project.shootEndMonth;
    if (App.Month.parseMonth(start)) {
      if (App.Month.parseMonth(end) && App.Month.diffMonths(start, end) < 0) return null;
      if (!App.Month.parseMonth(end)) end = start;
      return { start: start, end: end };
    }
    if (isSalesProject(project)) {
      var months = [];
      (project.payments || []).forEach(function (pay) {
        if (pay && App.Month.parseMonth(pay.expectedMonth)) months.push(pay.expectedMonth);
      });
      months.sort();
      if (months.length) {
        return { start: months[0], end: months[months.length - 1] };
      }
    }
    return null;
  }

  function projectExpensePeriodIssue(project) {
    if (!project) return "";
    var start = project.shootStartMonth;
    var end = project.shootEndMonth;
    var sales = isSalesProject(project);
    if (App.Month.parseMonth(start) && App.Month.parseMonth(end) && App.Month.diffMonths(start, end) < 0) {
      return (sales ? "종료월" : "촬영 종료월") + "이 " + (sales ? "시작월" : "촬영 시작월") +
        "보다 빠릅니다. 기간을 다시 확인해 주세요.";
    }
    if (!App.Month.parseMonth(start)) {
      return sales ? "수행 기간 또는 입금월이 없어 계산하지 않습니다." : "촬영 시작월이 없어 계산하지 않습니다.";
    }
    return "";
  }

  function projectExpenseItemName(project) {
    if (isSalesProject(project)) return (project.name || "영업") + " 영업 진행비";
    return (project.name || "작품") + " 진행비";
  }

  function calculateProjectExpenseDetail(project, state) {
    var appearance = (App.Defaults && App.Defaults.usesAppearanceExpense && App.Defaults.usesAppearanceExpense(project))
      ? calculateAppearanceExpenseDetail(project, state)
      : null;
    var empty = { total: 0, months: {}, rate: 0, amountMode: "auto", appearance: appearance };
    if (!project) return empty;
    var rate = resolvedProjectExpenseRate(project, state);
    var amountMode = projectExpenseAmountMode(project);
    var total = calculateProjectExpenseRegisteredTotal(project, state);
    if (!total) return { total: 0, months: {}, rate: rate, amountMode: amountMode, appearance: appearance };
    var period = projectExpensePeriod(project);
    if (!period) return { total: 0, months: {}, rate: rate, amountMode: amountMode, appearance: appearance };
    var monthList = App.Month.getSimulationMonths(period.start, period.end);
    if (!monthList.length) return { total: 0, months: {}, rate: rate, amountMode: amountMode, appearance: appearance };
    var base = Math.floor(total / monthList.length);
    var remainder = total - base * monthList.length;
    var months = {};
    monthList.forEach(function (m, i) {
      months[m] = base + (i === monthList.length - 1 ? remainder : 0);
    });
    return { total: total, months: months, rate: rate, amountMode: amountMode, appearance: appearance };
  }

  function calculateProjectExpenseTotal(project, state) {
    return calculateProjectExpenseDetail(project, state).total;
  }

  function calculateProjectExpenses(projects, months, state) {
    var byMonth = {};
    (months || []).forEach(function (m) { byMonth[m] = { total: 0, items: [] }; });
    var warnings = [];
    (projects || []).forEach(function (project) {
      if (!App.Engine.isProjectInBudget(project)) return;
      if (project.expenseInclude === false) return;
      var registered = calculateProjectExpenseRegisteredTotal(project, state);
      if (!registered) return;
      if (!projectExpensePeriod(project)) {
        var sales = isSalesProject(project);
        var issue = projectExpensePeriodIssue(project);
        warnings.push({
          code: sales ? "project_expense_no_period" : "project_expense_no_shoot_month",
          projectId: project.id,
          message: (project.name || (sales ? "영업" : "작품")) + " 진행비율이 설정됐지만 " +
            (issue || (sales ? "수행 기간 또는 입금월이 없어 계산하지 않습니다." : "촬영 시작월이 없어 계산하지 않습니다."))
        });
        return;
      }
      var detail = calculateProjectExpenseDetail(project, state);
      if (!detail.total) return;
      var itemName = projectExpenseItemName(project);
      Object.keys(detail.months).forEach(function (m) {
        if (!byMonth[m]) return;
        var amt = App.Money.roundWon(detail.months[m]);
        if (!amt) return;
        byMonth[m].total = App.Money.roundWon(byMonth[m].total + amt);
        byMonth[m].items.push({
          projectId: project.id,
          name: itemName,
          amount: amt
        });
      });
    });
    return { byMonth: byMonth, warnings: warnings };
  }

  function compareMonthRange(month, startMonth, endMonth) {
    if (!App.Month.parseMonth(month)) return "outside";
    if (App.Month.diffMonths(startMonth, month) < 0) return "before";
    if (App.Month.diffMonths(month, endMonth) < 0) return "after";
    return "inPeriod";
  }

  function explainProjectExpenseGap(state, startMonth, endMonth) {
    if (!startMonth || !endMonth) {
      var period = App.Month.resolveSimulationPeriod(state || {});
      startMonth = startMonth || period.startMonth;
      endMonth = endMonth || period.endMonth;
    }
    var items = [];
    var byId = {};
    (state && state.projects || []).forEach(function (project) {
      if (!project || !App.Engine.isProjectInBudget(project) || project.expenseInclude === false) return;
      var registered = calculateProjectExpenseRegisteredTotal(project, state);
      if (!registered) return;
      var detail = calculateProjectExpenseDetail(project, state);
      var inPeriod = 0;
      var before = 0;
      var after = 0;
      var months = Object.keys(detail.months || {});
      months.forEach(function (m) {
        var amount = App.Money.roundWon(detail.months[m]);
        var bucket = compareMonthRange(m, startMonth, endMonth);
        if (bucket === "inPeriod") inPeriod += amount;
        else if (bucket === "before") before += amount;
        else if (bucket === "after") after += amount;
      });
      inPeriod = App.Money.roundWon(inPeriod);
      before = App.Money.roundWon(before);
      after = App.Money.roundWon(after);
      var issues = [];
      if (!projectExpensePeriod(project)) {
        issues.push({
          severity: "bad",
          text: projectExpensePeriodIssue(project) || ((isSalesProject(project) ? "수행 기간/입금월" : "촬영 시작월") + "이 없어 자동 진행비가 월별 분석에 반영되지 않습니다.")
        });
      } else if (registered !== App.Money.roundWon(inPeriod + before + after)) {
        issues.push({ severity: "bad", text: "진행비 월별 배분 합계가 등록 진행비와 다릅니다." });
      }
      if (before) issues.push({ severity: "warn", text: "시뮬레이션 시작 전 진행비 " + App.Format.formatWon(before) + "이 있습니다." });
      if (after) issues.push({ severity: "warn", text: "시뮬레이션 종료 후 진행비 " + App.Format.formatWon(after) + "이 있습니다." });
      if (registered !== inPeriod) {
        issues.push({
          severity: "bad",
          text: "등록 진행비 " + App.Format.formatWon(registered) + " 중 월별 분석 반영액은 " +
            App.Format.formatWon(inPeriod) + "입니다."
        });
      }
      var item = {
        kind: "projectExpense",
        id: project.id,
        name: project.name || (isSalesProject(project) ? "영업" : "작품"),
        registered: registered,
        inPeriod: inPeriod,
        before: before,
        after: after,
        gap: App.Money.roundWon(registered - inPeriod),
        issues: issues,
        severity: issues.some(function (x) { return x.severity === "bad"; }) ? "bad" :
          (issues.length ? "warn" : "")
      };
      items.push(item);
      if (item.id) byId["project:" + item.id] = item;
    });
    var registeredTotal = App.Money.roundWon(App.Money.sumBy(items, function (item) { return item.registered; }));
    var inPeriodTotal = App.Money.roundWon(App.Money.sumBy(items, function (item) { return item.inPeriod; }));
    var beforeTotal = App.Money.roundWon(App.Money.sumBy(items, function (item) { return item.before; }));
    var afterTotal = App.Money.roundWon(App.Money.sumBy(items, function (item) { return item.after; }));
    var issueItems = items.filter(function (item) {
      return (item.issues || []).some(function (issue) {
        return issue.severity === "bad" || issue.severity === "warn";
      });
    });
    return {
      startMonth: startMonth,
      endMonth: endMonth,
      registered: registeredTotal,
      inPeriod: inPeriodTotal,
      before: beforeTotal,
      after: afterTotal,
      gap: App.Money.roundWon(registeredTotal - inPeriodTotal),
      items: items,
      issueItems: issueItems,
      hasIssues: registeredTotal !== inPeriodTotal || issueItems.length > 0,
      byId: byId
    };
  }

  function calculateProjectDirectExpenses(projects, months) {
    var byMonth = {};
    (months || []).forEach(function (m) { byMonth[m] = { total: 0, items: [] }; });
    (projects || []).forEach(function (project) {
      if (!App.Engine.isProjectInBudget(project)) return;
      (project.directExpenses || []).forEach(function (exp) {
        if (exp.include === false) return;
        if (App.Engine.isLegacyProjectDirectExpense && App.Engine.isLegacyProjectDirectExpense(project, exp)) return;
        var amount = App.Money.roundWon(exp.amount);
        if (!amount || !byMonth[exp.month]) return;
        byMonth[exp.month].total += amount;
        byMonth[exp.month].items.push({
          projectId: project.id,
          name: (project.name || "작품") + " / " + (exp.name || "직접비"),
          amount: amount
        });
      });
    });
    return { byMonth: byMonth };
  }

  function isLegacyProjectDirectExpense(project, exp) {
    if (!project || !exp) return false;
    if (project.expenseInclude === false) return false;
    if (!calculateProjectExpenseRegisteredTotal(project, null)) return false;
    var key = String(exp.name || "").replace(/\s+/g, "");
    return key === "프로젝트" || key === "프로젝트진행비" || key === "진행비";
  }

  function calculateOtherInflows(items, months) {
    var byMonth = {};
    (months || []).forEach(function (m) { byMonth[m] = { total: 0, items: [] }; });
    (items || []).forEach(function (item) {
      if (item.include === false) return;
      var amount = App.Money.roundWon(item.amount);
      if (!amount || !byMonth[item.month]) return;
      byMonth[item.month].total += amount;
      byMonth[item.month].items.push({
        id: item.id,
        name: item.name || "기타 입금",
        kind: item.kind || "other",
        amount: amount
      });
    });
    return { byMonth: byMonth };
  }

  function calculateDayBasedExpense(items, months, dayMap, mealHeadcountByMonth) {
    var simStart = months && months[0];
    var simEnd = months && months.length ? months[months.length - 1] : simStart;
    var byMonth = {};
    (months || []).forEach(function (m) { byMonth[m] = { total: 0, items: [] }; });
    (items || []).forEach(function (item) {
      if (item.include === false) return;
      (months || []).forEach(function (m) {
        if (!App.Month.appliesInMonth(item, m, simStart, simEnd)) return;
        var days = (dayMap[m] && dayMap[m].workingDays) || 0;
        var amount = 0;
        if (item.type === "perDay") {
          amount = App.Money.roundWon(App.Money.toSafeNumber(item.dailyRate) * days);
        } else {
          var heads = item.useMealHeadcount
            ? App.Money.toSafeNumber(mealHeadcountByMonth[m])
            : App.Money.toSafeNumber(item.headcount);
          amount = App.Money.roundWon(App.Money.toSafeNumber(item.dailyRate) * heads * days);
        }
        if (!amount) return;
        byMonth[m].total += amount;
        byMonth[m].items.push({ id: item.id, name: item.name || "일수 비용", amount: amount });
      });
    });
    return { byMonth: byMonth };
  }

  App.Engine.resolvedLineAmount = resolvedLineAmount;
  App.Engine.isEffectiveLineIncluded = isEffectiveLineIncluded;
  App.Engine.resolvedEffectiveLineAmount = resolvedEffectiveLineAmount;
  App.Engine.followsSimStartMonth = followsSimStartMonth;
  App.Engine.resolvedOneTimeMonth = resolvedOneTimeMonth;
  App.Engine.calculateOneTimeByMonth = calculateOneTimeByMonth;
  App.Engine.calculateRecurringExpenses = calculateRecurringExpenses;
  App.Engine.calculateProjectDirectExpenses = calculateProjectDirectExpenses;
  App.Engine.calculateProjectExpenseDetail = calculateProjectExpenseDetail;
  App.Engine.calculateProjectExpenseRegisteredTotal = calculateProjectExpenseRegisteredTotal;
  App.Engine.calculateAppearanceExpenseDetail = calculateAppearanceExpenseDetail;
  App.Engine.calculateProjectExpenseTotal = calculateProjectExpenseTotal;
  App.Engine.calculateProjectExpenses = calculateProjectExpenses;
  App.Engine.projectExpensePeriodIssue = projectExpensePeriodIssue;
  App.Engine.isLegacyProjectDirectExpense = isLegacyProjectDirectExpense;
  App.Engine.explainProjectExpenseGap = explainProjectExpenseGap;
  App.Engine.calculateOtherInflows = calculateOtherInflows;
  App.Engine.calculateDayBasedExpense = calculateDayBasedExpense;
})();
