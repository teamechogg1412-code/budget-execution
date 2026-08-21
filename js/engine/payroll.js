(function () {
  window.App = window.App || {};
  App.Engine = App.Engine || {};

  function employed(emp, month, rangeEnd, rangeStart) {
    if (!emp || emp.include === false) return false;
    var simStart = rangeStart || month;
    var simEnd = rangeEnd || month;
    return App.Month.appliesInMonth(emp, month, simStart, simEnd);
  }

  function employeeIncentiveAmount(emp, m) {
    var parsed = App.Month.parseMonth(m);
    if (!parsed) return 0;
    var total = 0;
    var seollal = App.Money.toSafeNumber(emp.incentiveSeollal);
    if (seollal && App.Holidays && m === App.Holidays.seasonalHolidayMonth(parsed.year, "seollal")) {
      total += seollal;
    }
    var chuseok = App.Money.toSafeNumber(emp.incentiveChuseok);
    if (chuseok && App.Holidays && m === App.Holidays.seasonalHolidayMonth(parsed.year, "chuseok")) {
      total += chuseok;
    }
    var yearEnd = App.Money.toSafeNumber(emp.incentiveYearEnd);
    if (yearEnd && parsed.month === 12) {
      total += yearEnd;
    }
    return App.Money.roundWon(total);
  }

  function calculatePayroll(employees, months) {
    var rangeStart = months && months[0];
    var rangeEnd = months && months.length ? months[months.length - 1] : rangeStart;
    var byMonth = {};
    (months || []).forEach(function (m) {
      var items = [];
      var total = 0;
      (employees || []).forEach(function (emp) {
        if (!employed(emp, m, rangeEnd, rangeStart)) return;
        var salaryAmount = App.Money.roundWon(emp.monthlySalary);
        var incentiveAmount = employeeIncentiveAmount(emp, m);
        var amount = App.Money.roundWon(salaryAmount + incentiveAmount);
        if (!amount) return;
        total += amount;
        items.push({
          id: emp.id, name: emp.name || emp.role || "직원", amount: amount,
          salaryAmount: salaryAmount, incentiveAmount: incentiveAmount, insure: !!emp.insure
        });
      });
      byMonth[m] = { total: total, items: items };
    });
    return { byMonth: byMonth };
  }

  function insuranceBaseOf(amount, month, rates) {
    var n = App.Money.roundWon(amount);
    if (n <= 0) return { pay: 0, pension: 0, health: 0 };
    var useCaps = !rates || rates.useCaps !== false;
    var pensionBase = n;
    var healthBase = n;
    if (useCaps && App.InsuranceRules) {
      pensionBase = App.InsuranceRules.clampPensionBase(n, month);
      healthBase = App.InsuranceRules.clampHealthBase(n, month);
    }
    return { pay: n, pension: pensionBase, health: healthBase };
  }

  function calculateInsurance(payrollByMonth, months, rates) {
    var r = rates || {};
    var byMonth = {};
    (months || []).forEach(function (m) {
      var base = 0;
      var pensionBase = 0;
      var healthBase = 0;
      var pension = 0;
      var health = 0;
      var employment = 0;
      var industrial = 0;
      ((payrollByMonth[m] && payrollByMonth[m].items) || []).forEach(function (item) {
        if (!item.insure) return;
        var bases = insuranceBaseOf(item.amount, m, r);
        base += bases.pay;
        pensionBase += bases.pension;
        healthBase += bases.health;
        var pensionRate = App.InsuranceRules && App.InsuranceRules.resolvePensionEmployer
          ? App.InsuranceRules.resolvePensionEmployer(m, r)
          : App.Money.toSafeNumber(r.pensionEmployer);
        pension += App.Money.roundWon(bases.pension * pensionRate);
        health += App.Money.roundWon(bases.health * App.Money.toSafeNumber(r.health));
        employment += App.Money.roundWon(bases.pay * App.Money.toSafeNumber(r.employment));
        industrial += App.Money.roundWon(bases.pay * App.Money.toSafeNumber(r.industrialAccident));
      });
      byMonth[m] = {
        base: App.Money.roundWon(base),
        pensionBase: App.Money.roundWon(pensionBase),
        healthBase: App.Money.roundWon(healthBase),
        pension: App.Money.roundWon(pension),
        health: App.Money.roundWon(health),
        employment: App.Money.roundWon(employment),
        industrialAccident: App.Money.roundWon(industrial),
        total: App.Money.roundWon(pension + health + employment + industrial)
      };
    });
    return { byMonth: byMonth };
  }

  function severanceEligibleBase(employees, m, months) {
    var base = 0;
    (employees || []).forEach(function (emp) {
      if (!employed(emp, m, months[months.length - 1], months[0]) || !emp.severance) return;
      base += App.Money.roundWon(emp.monthlySalary);
    });
    return base;
  }

  function calculateSeverance(employees, months, payrollByMonth, settings, manual) {
    var mode = (settings && settings.mode) || "manual";
    var autoMonths = Math.max(App.Money.toSafeNumber(settings && settings.autoMonths) || 12, 1);
    var byMonth = {};
    var allZero = true;
    (months || []).forEach(function (m) {
      var amount = 0;
      if (mode === "auto") {
        amount = App.Money.roundWon(severanceEligibleBase(employees, m, months) / autoMonths);
      } else if (mode === "decemberFull") {
        var parsed = App.Month.parseMonth(m);
        if (parsed && parsed.month === 12) {
          amount = App.Money.roundWon(severanceEligibleBase(employees, m, months));
        }
      } else {
        amount = App.Money.roundWon(manual && manual[m]);
      }
      if (amount) allZero = false;
      byMonth[m] = { total: amount };
    });
    return { byMonth: byMonth, mode: mode, allZero: allZero };
  }

  function calculateMealHeadcount(employees, extra, month, rangeEnd, rangeStart) {
    var count = 0;
    (employees || []).forEach(function (emp) {
      if (employed(emp, month, rangeEnd, rangeStart) && emp.meal) count += 1;
    });
    return count + App.Money.toSafeNumber(extra);
  }

  function employeeExclusiveBorne(emp) {
    var type = emp && emp.comparisonBurdenType;
    if (type === "onePersonOnly") return false;
    if (type === "custom") return emp.customExclusiveBurden !== false;
    return true;
  }

  function employeeExclusiveBearer(emp) {
    if (!employeeExclusiveBorne(emp)) return "notApplicable";
    return (emp && emp.comparisonBurdenType) === "actorBorne" ? "actor" : "company";
  }

  App.Engine.employed = employed;
  App.Engine.employeeIncentiveAmount = employeeIncentiveAmount;
  App.Engine.calculatePayroll = calculatePayroll;
  App.Engine.calculateInsurance = calculateInsurance;
  App.Engine.calculateSeverance = calculateSeverance;
  App.Engine.calculateMealHeadcount = calculateMealHeadcount;
  App.Engine.employeeExclusiveBorne = employeeExclusiveBorne;
  App.Engine.employeeExclusiveBearer = employeeExclusiveBearer;
})();
