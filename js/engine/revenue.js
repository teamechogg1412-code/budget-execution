(function () {
  window.App = window.App || {};
  App.Engine = App.Engine || {};

  function isCancelled(project) {
    return project && project.status === "cancelled";
  }

  function isProjectInBudget(project) {
    if (!project || isCancelled(project)) return false;
    if (project.includeInBudget === false) return false;
    return true;
  }

  function projectContractAmount(project) {
    if (!project) return 0;
    var episodes = App.Money.toSafeNumber(project.episodes);
    var fee = App.Money.toSafeNumber(project.feePerEpisode);
    if (episodes > 0 && fee > 0) return App.Money.roundWon(episodes * fee);
    return App.Money.roundWon(project.contractAmount);
  }

  function resolvePaymentAmount(project, payment) {
    if (!project || !payment || !isProjectInBudget(project)) return 0;
    var total = projectContractAmount(project);
    if (payment.inputMode !== "amount") {
      return App.Money.roundWon(total * App.Money.toRatio(payment.percentage));
    }
    return App.Money.roundWon(payment.amount);
  }

  function projectOccurrenceMonth(project) {
    if (!project) return null;
    return App.Month.normalizeMonth(project.shootStartMonth) ||
      App.Month.normalizeMonth(project.shootEndMonth);
  }

  function hasDatedPayments(payments) {
    return (payments || []).some(function (p) {
      return !!(p && App.Month.parseMonth(p.expectedMonth));
    });
  }

  function fallbackLumpPayment(month, amount, label) {
    var won = App.Money.roundWon(amount);
    var m = App.Month.normalizeMonth(month);
    if (!m || !won) return [];
    return [{
      id: "occurrence-lump",
      label: label || "입금",
      inputMode: "amount",
      amount: won,
      percentage: 1,
      expectedMonth: m
    }];
  }

  function paymentsForMonthlyRevenue(project) {
    var occur = projectOccurrenceMonth(project);
    var pays = (project && project.payments) || [];
    if (!hasDatedPayments(pays)) {
      return fallbackLumpPayment(occur, projectContractAmount(project), "입금");
    }
    return pays.map(function (p) {
      if (!p) return null;
      return Object.assign({}, p, {
        expectedMonth: App.Month.normalizeMonth(p.expectedMonth) || occur
      });
    }).filter(function (p) { return p && App.Month.parseMonth(p.expectedMonth); });
  }

  function planPaymentsForMonthlyRevenue(plan) {
    var occur = App.Month.normalizeMonth(plan && plan.month);
    var pays = (plan && plan.payments) || [];
    if (!hasDatedPayments(pays)) {
      return fallbackLumpPayment(occur, plan && plan.amount, "입금");
    }
    return pays.map(function (p) {
      if (!p) return null;
      return Object.assign({}, p, {
        expectedMonth: App.Month.normalizeMonth(p.expectedMonth) || occur
      });
    }).filter(function (p) { return p && App.Month.parseMonth(p.expectedMonth); });
  }

  function calculateProjectPayments(projects) {
    var warnings = [];
    var details = (projects || []).map(function (project) {
      var explicit = hasDatedPayments(project.payments);
      var payments = (explicit ? (project.payments || []) : []).map(function (p) {
        return {
          id: p.id,
          label: p.label || "지급",
          expectedMonth: App.Month.normalizeMonth(p.expectedMonth),
          amount: resolvePaymentAmount(project, p)
        };
      });
      var sum = App.Money.sumBy(payments, function (p) { return p.amount; });
      var contract = isProjectInBudget(project) ? projectContractAmount(project) : 0;
      var diff = sum - contract;
      if (explicit && isProjectInBudget(project) && contract > 0 && diff !== 0) {
        warnings.push({
          code: diff < 0 ? "payment_short" : "payment_over",
          projectId: project.id,
          message: (project.name || "작품") + ": 지급 일정 합계가 계약금액과 일치하지 않습니다. " +
            App.Format.formatWon(Math.abs(diff)) + (diff < 0 ? " 부족합니다." : " 초과합니다.")
        });
      }
      if (isCancelled(project) && (project.payments || []).length) {
        warnings.push({
          code: "cancelled_with_payments",
          projectId: project.id,
          message: (project.name || "작품") + "은 취소 상태라 입금·직접비·수수료를 0으로 봅니다."
        });
      }
      return { project: project, payments: payments, sum: sum, contract: contract, diff: diff };
    });
    return { details: details, warnings: warnings };
  }

  function calculateMonthlyRevenue(projects, months, startMonth, endMonth) {
    var byMonth = {};
    (months || []).forEach(function (m) {
      byMonth[m] = { total: 0, items: [] };
    });
    var before = 0;
    var after = 0;
    var warnings = [];
    (projects || []).forEach(function (project) {
      if (!isProjectInBudget(project)) return;
      paymentsForMonthlyRevenue(project).forEach(function (payment) {
        var amount = resolvePaymentAmount(project, payment);
        if (!amount) return;
        var month = App.Month.normalizeMonth(payment.expectedMonth);
        if (!month) return;
        if (App.Month.diffMonths(month, startMonth) > 0) {
          before += amount;
          warnings.push({
            code: "payment_before_period",
            projectId: project.id,
            message: "시작월 이전 입금 " + App.Format.formatWon(amount) +
              "은 최초 보유현금에 이미 포함된 것으로 봅니다."
          });
          return;
        }
        if (App.Month.diffMonths(endMonth, month) > 0) {
          after += amount;
          warnings.push({
            code: "payment_after_period",
            projectId: project.id,
            message: (project.name || "작품") + " " + (payment.label || "") +
              " " + App.Format.formatWon(amount) + "은 기간 이후 입금 예정입니다."
          });
          return;
        }
        if (!byMonth[month]) return;
        byMonth[month].total += amount;
        byMonth[month].items.push({
          projectId: project.id,
          projectName: project.name || "작품",
          category: project.category || "other",
          label: payment.label || "지급",
          amount: amount
        });
      });
    });
    Object.keys(byMonth).forEach(function (m) {
      byMonth[m].total = App.Money.roundWon(byMonth[m].total);
    });
    return { byMonth: byMonth, before: before, after: after, warnings: warnings };
  }

  function calculateRevenueLinkedFees(projects, inflowByMonth, months) {
    var byMonth = {};
    (months || []).forEach(function (m) { byMonth[m] = { total: 0, items: [] }; });
    var warnings = [];
    (projects || []).forEach(function (project) {
      if (!isProjectInBudget(project) || !project.fee) return;
      var fee = project.fee;
      var hasAmount = fee.amount !== null && fee.amount !== undefined && fee.amount !== "";
      var rate = App.Money.toRatio(fee.rate);
      if (!hasAmount && !rate) {
        warnings.push({
          code: "fee_without_rate",
          projectId: project.id,
          message: (project.name || "작품") + " 수수료에 요율/금액이 없습니다."
        });
        return;
      }
      var fixedApplied = false;
      (months || []).forEach(function (m) {
        var monthInflow = 0;
        ((inflowByMonth[m] && inflowByMonth[m].items) || []).forEach(function (item) {
          if (item.projectId === project.id) monthInflow += item.amount;
        });
        if (!monthInflow) return;
        var amount = 0;
        if (hasAmount) {
          if (fixedApplied) return;
          amount = App.Money.roundWon(fee.amount);
          fixedApplied = true;
        } else {
          amount = App.Money.roundWon(monthInflow * rate);
        }
        if (!amount) return;
        byMonth[m].total += amount;
        byMonth[m].items.push({
          projectId: project.id,
          name: fee.name || "성사수수료",
          amount: amount
        });
      });
    });
    return { byMonth: byMonth, warnings: warnings };
  }

  function planAsContract(plan) {
    return { contractAmount: App.Money.roundWon(plan && plan.amount), episodes: 0, feePerEpisode: 0 };
  }

  function resolvePlanPaymentAmount(plan, payment) {
    return resolvePaymentAmount(planAsContract(plan), payment);
  }

  function addPlanInflow(byMonth, startMonth, endMonth, plan, month, amount, label) {
    var won = App.Money.roundWon(amount);
    var monthKey = App.Month.normalizeMonth(month);
    if (!won || !monthKey) return;
    if (App.Month.diffMonths(monthKey, startMonth) > 0) return;
    if (App.Month.diffMonths(endMonth, monthKey) > 0) return;
    if (!byMonth[monthKey]) return;
    byMonth[monthKey].total += won;
    byMonth[monthKey].items.push({
      planId: plan.id,
      projectName: plan.name || "영업 계획",
      category: plan.category || "salesOther",
      label: label || "활동계획",
      amount: won
    });
  }

  function calculatePlanInflows(salesPlans, months, startMonth, endMonth) {
    var byMonth = {};
    (months || []).forEach(function (m) { byMonth[m] = { total: 0, items: [] }; });
    (salesPlans || []).forEach(function (plan) {
      if (!plan || !plan.includeInBudget || plan.converted) return;
      planPaymentsForMonthlyRevenue(plan).forEach(function (payment) {
        addPlanInflow(
          byMonth, startMonth, endMonth, plan,
          payment.expectedMonth,
          resolvePlanPaymentAmount(plan, payment),
          payment.label || "지급"
        );
      });
    });
    Object.keys(byMonth).forEach(function (m) {
      byMonth[m].total = App.Money.roundWon(byMonth[m].total);
    });
    return { byMonth: byMonth };
  }

  function paymentAmountFromContract(contract, payment) {
    if (!payment) return 0;
    var total = App.Money.roundWon(contract);
    if (payment.inputMode !== "amount") {
      return App.Money.roundWon(total * App.Money.toRatio(payment.percentage));
    }
    return App.Money.roundWon(payment.amount);
  }

  function monthInflowBucket(month, startMonth, endMonth) {
    var m = App.Month.normalizeMonth(month);
    if (!m) return "none";
    if (App.Month.diffMonths(m, startMonth) > 0) return "before";
    if (App.Month.diffMonths(endMonth, m) > 0) return "after";
    return "in";
  }

  function addInflowBucket(target, month, amount, startMonth, endMonth) {
    var amt = App.Money.roundWon(amount);
    if (!amt) return;
    var bucket = monthInflowBucket(month, startMonth, endMonth);
    if (bucket === "before") target.before += amt;
    else if (bucket === "after") target.after += amt;
    else if (bucket === "in") target.inPeriod += amt;
  }

  function roundBuckets(target) {
    target.inPeriod = App.Money.roundWon(target.inPeriod);
    target.before = App.Money.roundWon(target.before);
    target.after = App.Money.roundWon(target.after);
    return target;
  }

  function pushMismatchIssue(issues, contract, scheduled) {
    if (!contract || scheduled === contract) return "";
    var diff = App.Money.roundWon(contract - scheduled);
    var code = diff > 0 ? "payment_short" : "payment_over";
    issues.push({
      code: code,
      severity: "bad",
      text: "지급 일정 합계 " + App.Format.formatWon(scheduled) +
        " · 계약보다 " + App.Format.formatWon(Math.abs(diff)) + (diff > 0 ? " 부족" : " 초과")
    });
    return "bad";
  }

  function pushPeriodIssues(issues, buckets, severity) {
    if (buckets.before) {
      issues.push({
        code: "before",
        severity: "warn",
        text: "기간 이전 입금 " + App.Format.formatWon(buckets.before) +
          " (최초현금에 포함된 것으로 봄)"
      });
      if (!severity) severity = "warn";
    }
    if (buckets.after) {
      issues.push({
        code: "after",
        severity: "warn",
        text: "기간 이후 예정 " + App.Format.formatWon(buckets.after)
      });
      if (!severity) severity = "warn";
    }
    return severity;
  }

  function projectRevenueGapItem(project, startMonth, endMonth) {
    var name = (project && project.name) || "작품";
    var cancelled = isCancelled(project);
    var budgetOff = !cancelled && !!(project && project.includeInBudget === false);
    var contract = projectContractAmount(project);
    var explicit = hasDatedPayments(project && project.payments);
    var occur = projectOccurrenceMonth(project);
    var scheduled = 0;
    var buckets = { inPeriod: 0, before: 0, after: 0 };
    var issues = [];
    var severity = "";

    if (explicit) {
      (project.payments || []).forEach(function (p) {
        scheduled += paymentAmountFromContract(contract, p);
      });
    }
    scheduled = App.Money.roundWon(scheduled);

    if (!cancelled && !budgetOff) {
      paymentsForMonthlyRevenue(project).forEach(function (p) {
        addInflowBucket(buckets, p.expectedMonth, resolvePaymentAmount(project, p), startMonth, endMonth);
      });
    }
    roundBuckets(buckets);

    if (cancelled) {
      severity = "";
    } else if (budgetOff) {
      issues.push({
        code: "budget_off",
        severity: "warn",
        text: "예산 반영 OFF → 월별 분석·기간 입금 0원"
      });
      severity = "warn";
    } else if (!explicit && !occur && contract) {
      issues.push({
        code: "no_month",
        severity: "bad",
        text: "지급 미설정이고 발생월이 없어 월별 분석 0원"
      });
      severity = "bad";
    } else if (explicit) {
      severity = pushMismatchIssue(issues, contract, scheduled) || severity;
    }

    if (!cancelled && !budgetOff) {
      severity = pushPeriodIssues(issues, buckets, severity);
    }

    return {
      kind: "project",
      id: project && project.id,
      name: name,
      contract: cancelled ? 0 : contract,
      registered: cancelled ? 0 : contract,
      scheduled: explicit ? scheduled : ((!cancelled && !budgetOff && occur) ? contract : 0),
      inPeriod: buckets.inPeriod,
      before: buckets.before,
      after: buckets.after,
      explicit: explicit,
      fallback: !cancelled && !budgetOff && !explicit && !!occur && !!contract,
      cancelled: cancelled,
      budgetOff: budgetOff,
      issues: issues,
      severity: severity
    };
  }

  function planRevenueGapItem(plan, startMonth, endMonth) {
    if (!plan || plan.converted) return null;
    var name = plan.name || "영업 계획";
    var budgetOff = !plan.includeInBudget;
    var contract = App.Money.roundWon(plan.amount);
    var explicit = hasDatedPayments(plan.payments);
    var occur = App.Month.normalizeMonth(plan.month);
    var scheduled = 0;
    var buckets = { inPeriod: 0, before: 0, after: 0 };
    var issues = [];
    var severity = "";

    if (explicit) {
      (plan.payments || []).forEach(function (p) {
        scheduled += resolvePlanPaymentAmount(plan, p);
      });
    }
    scheduled = App.Money.roundWon(scheduled);

    if (!budgetOff) {
      planPaymentsForMonthlyRevenue(plan).forEach(function (p) {
        addInflowBucket(buckets, p.expectedMonth, resolvePlanPaymentAmount(plan, p), startMonth, endMonth);
      });
    }
    roundBuckets(buckets);

    if (budgetOff && contract) {
      issues.push({
        code: "budget_off",
        severity: "warn",
        text: "예산 반영 OFF → 월별 분석·기간 입금 0원"
      });
      severity = "warn";
    } else if (!explicit && !occur && contract) {
      issues.push({
        code: "no_month",
        severity: "bad",
        text: "지급 미설정이고 예상시기가 없어 월별 분석 0원"
      });
      severity = "bad";
    } else if (explicit) {
      severity = pushMismatchIssue(issues, contract, scheduled) || severity;
    }

    if (!budgetOff) {
      severity = pushPeriodIssues(issues, buckets, severity);
    }

    return {
      kind: "plan",
      id: plan.id,
      name: name,
      contract: contract,
      registered: contract,
      scheduled: explicit ? scheduled : (!budgetOff && occur ? contract : 0),
      inPeriod: buckets.inPeriod,
      before: buckets.before,
      after: buckets.after,
      explicit: explicit,
      fallback: !budgetOff && !explicit && !!occur && !!contract,
      cancelled: false,
      budgetOff: budgetOff,
      issues: issues,
      severity: severity
    };
  }

  function explainRevenueGap(state, startMonth, endMonth) {
    if (!startMonth || !endMonth) {
      var period = App.Month.resolveSimulationPeriod(state || {});
      startMonth = startMonth || period.startMonth;
      endMonth = endMonth || period.endMonth;
    }
    var items = [];
    var byId = {};
    (state && state.projects || []).forEach(function (project) {
      if (!project) return;
      var item = projectRevenueGapItem(project, startMonth, endMonth);
      items.push(item);
      if (item.id) byId["project:" + item.id] = item;
    });
    (state && state.salesPlans || []).forEach(function (plan) {
      var item = planRevenueGapItem(plan, startMonth, endMonth);
      if (!item) return;
      items.push(item);
      if (item.id) byId["plan:" + item.id] = item;
    });

    var registered = 0;
    var inPeriod = 0;
    var before = 0;
    var after = 0;
    items.forEach(function (item) {
      registered += item.registered || 0;
      inPeriod += item.inPeriod || 0;
      before += item.before || 0;
      after += item.after || 0;
    });
    registered = App.Money.roundWon(registered);
    inPeriod = App.Money.roundWon(inPeriod);
    before = App.Money.roundWon(before);
    after = App.Money.roundWon(after);
    var issueItems = items.filter(function (item) {
      return (item.issues || []).some(function (issue) {
        return issue.severity === "bad" || issue.severity === "warn";
      });
    });
    var gap = App.Money.roundWon(registered - inPeriod);
    return {
      startMonth: startMonth,
      endMonth: endMonth,
      registered: registered,
      inPeriod: inPeriod,
      before: before,
      after: after,
      gap: gap,
      items: items,
      issueItems: issueItems,
      hasIssues: gap !== 0 || issueItems.length > 0,
      byId: byId
    };
  }

  App.Engine.isCancelled = isCancelled;
  App.Engine.isProjectInBudget = isProjectInBudget;
  App.Engine.projectContractAmount = projectContractAmount;
  App.Engine.resolvePaymentAmount = resolvePaymentAmount;
  App.Engine.resolvePlanPaymentAmount = resolvePlanPaymentAmount;
  App.Engine.projectOccurrenceMonth = projectOccurrenceMonth;
  App.Engine.paymentsForMonthlyRevenue = paymentsForMonthlyRevenue;
  App.Engine.calculateProjectPayments = calculateProjectPayments;
  App.Engine.calculateMonthlyRevenue = calculateMonthlyRevenue;
  App.Engine.calculateRevenueLinkedFees = calculateRevenueLinkedFees;
  App.Engine.calculatePlanInflows = calculatePlanInflows;
  App.Engine.explainRevenueGap = explainRevenueGap;
})();
