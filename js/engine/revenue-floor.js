(function () {
  window.App = window.App || {};
  App.Engine = App.Engine || {};

  function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function scaleAmount(value, factor) {
    return App.Money.roundWon(App.Money.toSafeNumber(value) * factor);
  }

  function scalePayments(list, factor) {
    (list || []).forEach(function (p) {
      if (!p) return;
      if (p.inputMode === "amount") p.amount = scaleAmount(p.amount, factor);
    });
  }

  function scaleBudgetRevenue(state, factor) {
    var f = App.Money.toSafeNumber(factor);
    if (!Number.isFinite(f) || f < 0) f = 0;
    (state.projects || []).forEach(function (p) {
      if (!p || p.status === "cancelled") return;
      p.contractAmount = scaleAmount(p.contractAmount, f);
      p.feePerEpisode = scaleAmount(p.feePerEpisode, f);
      scalePayments(p.payments, f);
    });
    (state.salesPlans || []).forEach(function (plan) {
      if (!plan) return;
      plan.amount = scaleAmount(plan.amount, f);
      scalePayments(plan.payments, f);
    });
    return state;
  }

  function snapshotFrom(result, cmp) {
    var k = (result && result.kpis) || {};
    var solo = (cmp && cmp.scenarios && cmp.scenarios.soloAgency) || {};
    var ex = (cmp && cmp.scenarios && cmp.scenarios.exclusiveContract) || {};
    return {
      revenue: App.Money.roundWon(k.revenue),
      operatingProfit: App.Money.roundWon(k.operatingProfit),
      minClosing: App.Money.roundWon(k.minClosing),
      endClosing: App.Money.roundWon(k.endClosing),
      soloEV: App.Money.roundWon(solo.controlledEconomicValue),
      exclusiveEV: App.Money.roundWon(ex.controlledEconomicValue),
      agencyFees: App.Money.roundWon(k.agencyFees),
      projectExpense: App.Money.roundWon(k.projectExpense),
      payroll: App.Money.roundWon(k.payroll)
    };
  }

  function evaluateScaled(state, factor, cache) {
    var key = String(Math.round(factor * 1e8) / 1e8);
    if (cache[key]) return cache[key];
    var cloned = scaleBudgetRevenue(cloneState(state), factor);
    var result = App.Engine.runSimulation(cloned);
    var cmp = App.Engine.runScenarioComparison(cloned, result);
    var snap = snapshotFrom(result, cmp);
    snap.factor = factor;
    cache[key] = snap;
    return snap;
  }

  function findMinWhere(state, cache, pred) {
    var hi = 1;
    var guard = 0;
    while (!pred(evaluateScaled(state, hi, cache)) && hi < 8 && guard < 6) {
      hi *= 2;
      guard += 1;
    }
    var highSnap = evaluateScaled(state, hi, cache);
    if (!pred(highSnap)) {
      return { found: false, revenue: null, snap: highSnap, factor: hi };
    }
    var lo = 0;
    var i;
    for (i = 0; i < 18; i++) {
      var mid = (lo + hi) / 2;
      if (pred(evaluateScaled(state, mid, cache))) hi = mid;
      else lo = mid;
    }
    var found = evaluateScaled(state, hi, cache);
    return { found: true, revenue: found.revenue, snap: found, factor: hi };
  }

  function annualize(amount, monthCount) {
    var n = Number(monthCount) || 0;
    if (!n) return 0;
    return App.Money.roundWon(App.Money.toSafeNumber(amount) * 12 / n);
  }

  function monthIncentiveTotal(state, month) {
    var sum = 0;
    (state.employees || []).forEach(function (emp) {
      if (!emp || emp.include === false) return;
      sum += App.Money.toSafeNumber(
        App.Engine.employeeIncentiveAmount ? App.Engine.employeeIncentiveAmount(emp, month) : 0
      );
    });
    return App.Money.roundWon(sum);
  }

  function monthFixedLoad(row, incentiveAmount) {
    if (!row) return 0;
    var fixedPayroll = App.Money.roundWon((row.payroll || 0) - (incentiveAmount || 0));
    return App.Money.roundWon(
      fixedPayroll + (row.insurance || 0) +
      (row.meal || 0) + (row.recurring || 0) + (row.support || 0) + (row.dayBased || 0)
    );
  }

  function monthlyBurden(state, result) {
    var months = (result && result.months) || [];
    if (!months.length) return null;
    var incentiveByMonth = {};
    months.forEach(function (row) {
      incentiveByMonth[row.month] = monthIncentiveTotal(state, row.month);
    });
    var fixedLoad = function (row) { return monthFixedLoad(row, incentiveByMonth[row.month]); };
    var peak = months[0];
    months.forEach(function (row) {
      if (fixedLoad(row) > fixedLoad(peak)) peak = row;
    });
    var start = months[0].month;
    var end = months[months.length - 1].month;
    var people = [];
    (state.employees || []).forEach(function (emp) {
      if (!emp || emp.include === false) return;
      if (App.Month.appliesInMonth && !App.Month.appliesInMonth(emp, peak.month, start, end)) return;
      var salary = App.Money.roundWon(emp.monthlySalary);
      if (!salary) return;
      var label = App.Defaults.employeeListLabel
        ? App.Defaults.employeeListLabel(emp)
        : (emp.name || emp.role || "직원");
      people.push({ label: label, amount: salary });
    });
    return {
      month: peak.month,
      people: people,
      payroll: App.Money.roundWon((peak.payroll || 0) - (incentiveByMonth[peak.month] || 0)),
      insurance: App.Money.roundWon(peak.insurance),
      meal: App.Money.roundWon(peak.meal),
      recurring: App.Money.roundWon(peak.recurring),
      support: App.Money.roundWon(peak.support),
      dayBased: App.Money.roundWon(peak.dayBased),
      total: fixedLoad(peak)
    };
  }

  function uniqueSamples(list) {
    var seen = {};
    var out = [];
    (list || []).forEach(function (snap) {
      if (!snap) return;
      var key = String(snap.revenue);
      if (seen[key]) return;
      seen[key] = true;
      out.push(snap);
    });
    out.sort(function (a, b) { return a.revenue - b.revenue; });
    return out;
  }

  function analyzeRevenueFloor(state, baseResult) {
    var result = baseResult || App.Engine.runSimulation(state);
    var cmp = App.Engine.runScenarioComparison(state, result);
    var current = snapshotFrom(result, cmp);
    current.factor = 1;
    var months = (result.months || []).map(function (r) { return r.month; });
    var monthCount = months.length;
    var out = {
      monthCount: monthCount,
      startMonth: months[0] || "",
      endMonth: months.length ? months[months.length - 1] : "",
      current: current,
      economicValue: { found: false, revenue: null, snap: null },
      operatingProfit: { found: false, revenue: null, snap: null },
      cash: { found: false, revenue: null, snap: null },
      samples: [],
      burden: monthlyBurden(state, result)
    };
    if (!current.revenue) return out;

    var cache = {};
    cache["1"] = current;
    out.economicValue = findMinWhere(state, cache, function (s) {
      return s.soloEV > s.exclusiveEV;
    });
    out.operatingProfit = findMinWhere(state, cache, function (s) {
      return s.operatingProfit > 0;
    });
    out.cash = findMinWhere(state, cache, function (s) {
      return s.minClosing >= 0;
    });

    var factors = [0.15, 0.2, 0.3, 0.5, 0.7, 1];
    [
      out.economicValue && out.economicValue.factor,
      out.operatingProfit && out.operatingProfit.factor,
      out.cash && out.cash.factor
    ].forEach(function (f) {
      if (f && factors.indexOf(f) < 0) factors.push(f);
    });
    var samples = [current];
    factors.forEach(function (f) {
      samples.push(evaluateScaled(state, f, cache));
    });
    out.samples = uniqueSamples(samples);
    out.pipeline = analyzePipelineDrops(state, current);
    return out;
  }

  function isLiveProject(p) {
    return !!(p && p.status !== "cancelled" && p.includeInBudget !== false);
  }

  function isLivePlan(plan) {
    return !!(plan && plan.includeInBudget && !plan.converted);
  }

  function isConfirmedStatus(status) {
    return status === "confirmed" || status === "completed";
  }

  function categoryLabel(id) {
    var list = (App.Categories || []).concat(App.WorkCategories || []).concat(App.SalesCategories || []);
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) return list[i].label || list[i].name || id;
    }
    return id || "기타";
  }

  function decoratePipelineSnap(snap, label, kind) {
    snap.label = label;
    snap.kind = kind;
    snap.delta = App.Money.roundWon((snap.soloEV || 0) - (snap.exclusiveEV || 0));
    snap.evOk = snap.soloEV > snap.exclusiveEV;
    snap.profitOk = snap.operatingProfit > 0;
    snap.cashOk = snap.minClosing >= 0;
    return snap;
  }

  function evaluateDropped(state, applyFn) {
    var cloned = cloneState(state);
    applyFn(cloned);
    var result = App.Engine.runSimulation(cloned);
    var cmp = App.Engine.runScenarioComparison(cloned, result);
    return snapshotFrom(result, cmp);
  }

  function disableProject(state, id) {
    (state.projects || []).forEach(function (p) {
      if (p && p.id === id) p.includeInBudget = false;
    });
  }

  function disablePlan(state, id) {
    (state.salesPlans || []).forEach(function (plan) {
      if (plan && plan.id === id) plan.includeInBudget = false;
    });
  }

  function analyzePipelineDrops(state, current) {
    var rows = [decoratePipelineSnap(Object.assign({}, current), "지금 전체", "all")];
    var projects = (state.projects || []).filter(isLiveProject);
    var plans = (state.salesPlans || []).filter(isLivePlan);
    var hasUnconfirmed = projects.some(function (p) { return !isConfirmedStatus(p.status); }) ||
      plans.some(function (p) { return !isConfirmedStatus(p.planStatus); });
    var ops = [];
    if (hasUnconfirmed) {
      ops.push({
        label: "확정만",
        kind: "confirmed",
        apply: function (cloned) {
          (cloned.projects || []).forEach(function (p) {
            if (!isConfirmedStatus(p && p.status)) p.includeInBudget = false;
          });
          (cloned.salesPlans || []).forEach(function (plan) {
            if (!isConfirmedStatus(plan && plan.planStatus)) plan.includeInBudget = false;
          });
        }
      });
    }
    if (plans.length) {
      ops.push({
        label: "영업계획 제외",
        kind: "no-plans",
        apply: function (cloned) {
          (cloned.salesPlans || []).forEach(function (plan) { plan.includeInBudget = false; });
        }
      });
    }
    var catCount = {};
    projects.forEach(function (p) {
      var key = p.category || "";
      catCount[key] = (catCount[key] || 0) + 1;
    });
    Object.keys(catCount).forEach(function (cat) {
      if (catCount[cat] < 2) return;
      ops.push({
        label: categoryLabel(cat) + " 제외",
        kind: "drop-category",
        apply: function (cloned) {
          (cloned.projects || []).forEach(function (p) {
            if ((p.category || "") === cat) p.includeInBudget = false;
          });
        }
      });
    });
    projects.forEach(function (p) {
      ops.push({
        label: (p.name || "이름 없는 작품") + " 제외",
        kind: "drop-project",
        apply: function (cloned) { disableProject(cloned, p.id); }
      });
    });
    plans.forEach(function (plan) {
      ops.push({
        label: (plan.name || "이름 없는 영업계획") + " 제외",
        kind: "drop-plan",
        apply: function (cloned) { disablePlan(cloned, plan.id); }
      });
    });
    var seen = {};
    seen[String(current.revenue) + "|all"] = true;
    ops.forEach(function (op) {
      if (rows.length >= 16) return;
      var snap = decoratePipelineSnap(evaluateDropped(state, op.apply), op.label, op.kind);
      var key = String(snap.revenue) + "|" + op.kind;
      if (snap.revenue === current.revenue && op.kind !== "all") return;
      if (op.kind !== "drop-project" && op.kind !== "drop-plan") {
        if (rows.some(function (r) { return r.revenue === snap.revenue; })) return;
      }
      seen[key] = true;
      rows.push(snap);
    });
    return rows;
  }

  App.Engine.scaleBudgetRevenue = scaleBudgetRevenue;
  App.Engine.analyzeRevenueFloor = analyzeRevenueFloor;
  App.Engine.annualizeRevenueFloor = annualize;
})();
