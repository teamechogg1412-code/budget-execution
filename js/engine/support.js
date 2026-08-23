(function () {
  window.App = window.App || {};
  App.Engine = App.Engine || {};

  var VEHICLE_LINKED_FIELDS = { "sp-vehicle-rent": "monthlyRent", "sp-vehicle-insurance": "monthlyInsurance" };

  function vehicleAppliesInMonth(v, month, simStart, simEnd) {
    if (!v || v.include === false) return false;
    if (!App.Month.parseMonth(month)) return false;
    var start = App.Month.normalizeMonth(v.startMonth) || simStart;
    var end = App.Month.normalizeMonth(v.endMonth) || simEnd;
    if (!App.Month.parseMonth(start) || !App.Month.parseMonth(end)) return false;
    return App.Month.isInRange(month, start, end);
  }

  function vehicleFieldMonthlyTotal(vehicles, field, month, simStart, simEnd) {
    var total = 0;
    (vehicles || []).forEach(function (v) {
      if (!vehicleAppliesInMonth(v, month, simStart, simEnd)) return;
      total += App.Money.toSafeNumber(v[field]);
    });
    return App.Money.roundWon(total);
  }

  function vehicleFieldSnapshotTotal(vehicles, field) {
    var total = 0;
    (vehicles || []).forEach(function (v) {
      if (!v || v.include === false) return;
      total += App.Money.toSafeNumber(v[field]);
    });
    return App.Money.roundWon(total);
  }

  function supportPolicyMonthlyAmount(item, state) {
    var vehicleField = item && VEHICLE_LINKED_FIELDS[item.id];
    if (vehicleField) {
      return vehicleFieldSnapshotTotal((state && state.vehicles) || [], vehicleField);
    }
    if (!item || item.calcMode !== "monthlyFixed") return 0;
    var qty = App.Money.toSafeNumber(item.quantity);
    if (!qty || qty < 1) qty = 1;
    return App.Money.roundWon(App.Money.toSafeNumber(item.unitAmount) * qty);
  }

  function calculateSupportPolicies(state, months) {
    var policies = (state && state.settings && state.settings.supportPolicies) || [];
    var simStart = months && months[0];
    var simEnd = months && months.length ? months[months.length - 1] : simStart;
    var soloByMonth = {};
    var soloActorByMonth = {};
    var exclusiveByMonth = {};
    var exclusiveActorByMonth = {};
    (months || []).forEach(function (m) {
      soloByMonth[m] = { total: 0, items: [] };
      soloActorByMonth[m] = { total: 0, items: [] };
      exclusiveByMonth[m] = { total: 0, items: [] };
      exclusiveActorByMonth[m] = { total: 0, items: [] };
    });
    var byPolicy = [];
    (policies || []).forEach(function (item) {
      if (!item || item.include !== true) return;
      if (item.costClass !== "sga") return;
      if (VEHICLE_LINKED_FIELDS[item.id]) return;
      var soloShare = App.Money.toRatio(item.soloCompanyShareRate != null ? item.soloCompanyShareRate : 1);
      var exShare = App.Money.toRatio(item.exclusiveCompanyShareRate != null ? item.exclusiveCompanyShareRate : 1);
      var monthly = supportPolicyMonthlyAmount(item, state);
      if (!monthly) return;
      var soloAmt = App.Money.roundWon(monthly * soloShare);
      var soloActorAmt = App.Money.roundWon(monthly - soloAmt);
      var exCompanyAmt = App.Money.roundWon(monthly * exShare);
      var exActorAmt = App.Money.roundWon(monthly - exCompanyAmt);
      var soloTotal = 0;
      var soloActorTotal = 0;
      var exCompanyTotal = 0;
      var exActorTotal = 0;
      (months || []).forEach(function (m) {
        if (!App.Month.appliesInMonth(item, m, simStart, simEnd)) return;
        if (soloAmt) {
          soloByMonth[m].total = App.Money.roundWon(soloByMonth[m].total + soloAmt);
          soloByMonth[m].items.push({ id: item.id, name: item.name || "회사 지원", amount: soloAmt, group: item.group });
          soloTotal += soloAmt;
        }
        if (soloActorAmt) {
          soloActorByMonth[m].total = App.Money.roundWon(soloActorByMonth[m].total + soloActorAmt);
          soloActorByMonth[m].items.push({ id: item.id, name: item.name || "회사 지원", amount: soloActorAmt, group: item.group });
          soloActorTotal += soloActorAmt;
        }
        if (exCompanyAmt) {
          exclusiveByMonth[m].total = App.Money.roundWon(exclusiveByMonth[m].total + exCompanyAmt);
          exclusiveByMonth[m].items.push({ id: item.id, name: item.name || "회사 지원", amount: exCompanyAmt, group: item.group });
        }
        if (exActorAmt) {
          exclusiveActorByMonth[m].total = App.Money.roundWon(exclusiveActorByMonth[m].total + exActorAmt);
          exclusiveActorByMonth[m].items.push({ id: item.id, name: item.name || "회사 지원", amount: exActorAmt, group: item.group });
        }
        exCompanyTotal += exCompanyAmt;
        exActorTotal += exActorAmt;
      });
      if (soloTotal || soloActorTotal || exCompanyTotal || exActorTotal) {
        byPolicy.push({
          id: item.id,
          name: item.name || "회사 지원",
          group: item.group,
          soloCost: App.Money.roundWon(soloTotal),
          soloActorCost: App.Money.roundWon(soloActorTotal),
          exclusiveCompanyValue: App.Money.roundWon(exCompanyTotal),
          exclusiveActorCost: App.Money.roundWon(exActorTotal)
        });
      }
    });
    return {
      soloByMonth: soloByMonth,
      soloActorByMonth: soloActorByMonth,
      exclusiveByMonth: exclusiveByMonth,
      exclusiveActorByMonth: exclusiveActorByMonth,
      byPolicy: byPolicy,
      soloTotal: App.Money.sumBy(byPolicy, function (p) { return p.soloCost; }),
      soloActorCostTotal: App.Money.sumBy(byPolicy, function (p) { return p.soloActorCost; }),
      exclusiveCompanyValueTotal: App.Money.sumBy(byPolicy, function (p) { return p.exclusiveCompanyValue; }),
      exclusiveActorCostTotal: App.Money.sumBy(byPolicy, function (p) { return p.exclusiveActorCost; })
    };
  }

  function lunchTruckPolicy(policies) {
    return (policies || []).filter(function (p) { return p && p.id === "sp-lunch-truck"; })[0] || null;
  }

  function lunchTruckDefaultPrice(policies) {
    var policy = lunchTruckPolicy(policies);
    if (!policy || policy.include !== true) return 0;
    return App.Money.roundWon(policy.unitAmount);
  }

  function lunchTruckPeriod(project) {
    var start = project && project.shootStartMonth;
    if (!App.Month.parseMonth(start)) return null;
    var end = project.shootEndMonth;
    if (!App.Month.parseMonth(end) || App.Month.diffMonths(start, end) < 0) end = start;
    return { start: start, end: end };
  }

  function calculateLunchTruckDetail(project, defaultPrice) {
    var empty = { total: 0, months: {}, count: 0, unitPrice: 0, basis: "auto" };
    if (!project || project.lunchTruckInclude === false) return empty;
    if (!App.Engine.isProjectInBudget(project)) return empty;
    if (App.Defaults.isSalesCategory && App.Defaults.isSalesCategory(project.category)) return empty;
    var count = App.Defaults.resolvedLunchTruckCount(project);
    if (!count) return empty;
    var price = App.Defaults.resolvedLunchTruckUnitPrice(project, defaultPrice);
    var total = App.Money.roundWon(count * price);
    var basis = App.Money.toSafeNumber(project.lunchTruckCount) > 0 ? "manual" : "auto";
    if (!total) return { total: 0, months: {}, count: count, unitPrice: price, basis: basis };
    var period = lunchTruckPeriod(project);
    if (!period) return { total: total, months: {}, count: count, unitPrice: price, basis: basis };
    var payMonth = App.Month.addMonths(period.start, 1);
    var months = {};
    months[payMonth] = total;
    return { total: total, months: months, count: count, unitPrice: price, basis: basis };
  }

  function lunchTruckProjectRows(state, defaultPrice) {
    var rows = [];
    (state.projects || []).forEach(function (project) {
      var detail = calculateLunchTruckDetail(project, defaultPrice);
      if (!detail.count) return;
      rows.push({
        id: project.id,
        name: project.name || "작품",
        category: project.category,
        basis: detail.basis,
        count: detail.count,
        unitPrice: detail.unitPrice,
        amount: detail.total,
        months: detail.months
      });
    });
    return rows;
  }

  function calculateLunchTruckSupport(state, months) {
    var byMonth = {};
    (months || []).forEach(function (m) { byMonth[m] = { total: 0, items: [] }; });
    var defaultPrice = lunchTruckDefaultPrice((state.settings && state.settings.supportPolicies) || []);
    var rows = lunchTruckProjectRows(state, defaultPrice);
    rows.forEach(function (row) {
      Object.keys(row.months).forEach(function (m) {
        if (!byMonth[m]) return;
        var amt = App.Money.roundWon(row.months[m]);
        if (!amt) return;
        byMonth[m].total = App.Money.roundWon(byMonth[m].total + amt);
        byMonth[m].items.push({ projectId: row.id, name: row.name + " 밥차", amount: amt });
      });
    });
    var byProject = rows.map(function (row) {
      return { id: row.id, name: row.name, category: row.category, basis: row.basis, count: row.count, unitPrice: row.unitPrice, amount: row.amount };
    });
    return {
      byMonth: byMonth,
      byProject: byProject,
      total: App.Money.sumBy(byProject, function (p) { return p.amount; }),
      defaultPrice: defaultPrice
    };
  }

  function emptySupportMonths(months) {
    var soloByMonth = {};
    var soloActorByMonth = {};
    var exclusiveByMonth = {};
    var exclusiveActorByMonth = {};
    (months || []).forEach(function (m) {
      soloByMonth[m] = { total: 0, items: [] };
      soloActorByMonth[m] = { total: 0, items: [] };
      exclusiveByMonth[m] = { total: 0, items: [] };
      exclusiveActorByMonth[m] = { total: 0, items: [] };
    });
    return {
      soloByMonth: soloByMonth,
      soloActorByMonth: soloActorByMonth,
      exclusiveByMonth: exclusiveByMonth,
      exclusiveActorByMonth: exclusiveActorByMonth,
      byPolicy: [],
      soloTotal: 0,
      soloActorCostTotal: 0,
      exclusiveCompanyValueTotal: 0,
      exclusiveActorCostTotal: 0
    };
  }

  function vehicleDepositLines(vehicles, startMonth) {
    return (vehicles || []).map(function (v) {
      if (!v || v.include === false) return null;
      var amount = App.Money.roundWon(v.deposit);
      if (!amount) return null;
      return {
        id: "veh-dep-" + (v.id || ""),
        name: (v.name || "차량") + " 보증금",
        actualAmount: amount,
        include: true,
        monthMode: "custom",
        month: App.Month.normalizeMonth(v.startMonth) || App.Month.normalizeMonth(startMonth)
      };
    }).filter(Boolean);
  }

  function depositsForSimulation(state) {
    var vehicles = (state && state.vehicles) || [];
    var startMonth = state && state.profile && state.profile.startMonth;
    var skipIds = {};
    var skipNames = {};
    vehicles.forEach(function (v) {
      if (!v) return;
      if (v.sourceDepositId) skipIds[v.sourceDepositId] = true;
      if (v.name) skipNames[v.name] = true;
    });
    var fromDeposits = [];
    ((state && state.deposits) || []).forEach(function (d) {
      if (!d) return;
      if (d.id && skipIds[d.id]) return;
      var name = d.name || "";
      if (App.Defaults && App.Defaults.isVehicleDepositName && App.Defaults.isVehicleDepositName(name)) {
        var display = App.Defaults.displayNameFromVehicleDeposit
          ? App.Defaults.displayNameFromVehicleDeposit(name)
          : name;
        if (vehicles.length && skipNames[display]) return;
      }
      fromDeposits.push(d);
    });
    return fromDeposits.concat(vehicleDepositLines(vehicles, startMonth));
  }

  function calculateVehicleSupport(vehicles, months) {
    var out = emptySupportMonths(months);
    var simStart = months && months[0];
    var simEnd = months && months.length ? months[months.length - 1] : simStart;
    (vehicles || []).forEach(function (v) {
      if (!v || v.include === false) return;
      function addLine(id, name, monthly) {
        var amount = App.Money.roundWon(monthly);
        if (!amount) return;
        var total = 0;
        (months || []).forEach(function (m) {
          if (!vehicleAppliesInMonth(v, m, simStart, simEnd)) return;
          out.soloByMonth[m].total = App.Money.roundWon(out.soloByMonth[m].total + amount);
          out.soloByMonth[m].items.push({ id: id, name: name, amount: amount, group: "vehicle" });
          out.exclusiveByMonth[m].total = App.Money.roundWon(out.exclusiveByMonth[m].total + amount);
          out.exclusiveByMonth[m].items.push({ id: id, name: name, amount: amount, group: "vehicle" });
          total += amount;
        });
        if (total) {
          out.byPolicy.push({
            id: id,
            name: name,
            group: "vehicle",
            soloCost: App.Money.roundWon(total),
            soloActorCost: 0,
            exclusiveCompanyValue: App.Money.roundWon(total),
            exclusiveActorCost: 0
          });
        }
      }
      var label = v.name || "차량";
      addLine("veh-rent-" + v.id, label + " 렌트료", v.monthlyRent);
      addLine("veh-ins-" + v.id, label + " 보험료", v.monthlyInsurance);
    });
    out.soloTotal = App.Money.sumBy(out.byPolicy, function (p) { return p.soloCost; });
    out.soloActorCostTotal = 0;
    out.exclusiveCompanyValueTotal = App.Money.sumBy(out.byPolicy, function (p) { return p.exclusiveCompanyValue; });
    out.exclusiveActorCostTotal = 0;
    return out;
  }

  function supportRowVehicleId(p) {
    var id = String((p && p.id) || "");
    var m = id.match(/^veh-(?:rent|ins)-(.+)$/);
    return m ? m[1] : "";
  }

  function isActorPersonalSupportRow(p, state) {
    if (!p) return false;
    if (p.group === "selfCare") return true;
    var vehId = supportRowVehicleId(p);
    if (!vehId) return false;
    var veh = ((state && state.vehicles) || []).filter(function (v) { return v && v.id === vehId; })[0];
    return !!(veh && veh.kind === "actor");
  }

  function actorSupportBenefitTotal(state, support, field) {
    field = field || "soloCost";
    return App.Money.sumBy((support && support.byPolicy) || [], function (p) {
      if (!isActorPersonalSupportRow(p, state)) return 0;
      return p[field] || 0;
    });
  }

  function actorSupportBenefitSplit(state, support) {
    var common = 0;
    var soloUnique = 0;
    var exclusiveUnique = 0;
    ((support && support.byPolicy) || []).forEach(function (p) {
      if (!isActorPersonalSupportRow(p, state)) return;
      var soloAmt = App.Money.roundWon(p.soloCost);
      var exAmt = App.Money.roundWon(p.exclusiveCompanyValue);
      var shared = Math.min(soloAmt, exAmt);
      if (shared < 0) shared = 0;
      common += shared;
      soloUnique += soloAmt - shared;
      exclusiveUnique += exAmt - shared;
    });
    return {
      common: App.Money.roundWon(common),
      soloUnique: App.Money.roundWon(soloUnique),
      exclusiveUnique: App.Money.roundWon(exclusiveUnique)
    };
  }

  function mergeSupportResults(a, b, months) {
    a = a || emptySupportMonths(months);
    b = b || emptySupportMonths(months);
    var soloByMonth = {};
    var soloActorByMonth = {};
    var exclusiveByMonth = {};
    var exclusiveActorByMonth = {};
    (months || []).forEach(function (m) {
      var aS = (a.soloByMonth && a.soloByMonth[m]) || { total: 0, items: [] };
      var bS = (b.soloByMonth && b.soloByMonth[m]) || { total: 0, items: [] };
      soloByMonth[m] = {
        total: App.Money.roundWon((aS.total || 0) + (bS.total || 0)),
        items: (aS.items || []).concat(bS.items || [])
      };
      var aSA = (a.soloActorByMonth && a.soloActorByMonth[m]) || { total: 0, items: [] };
      var bSA = (b.soloActorByMonth && b.soloActorByMonth[m]) || { total: 0, items: [] };
      soloActorByMonth[m] = {
        total: App.Money.roundWon((aSA.total || 0) + (bSA.total || 0)),
        items: (aSA.items || []).concat(bSA.items || [])
      };
      var aE = (a.exclusiveByMonth && a.exclusiveByMonth[m]) || { total: 0, items: [] };
      var bE = (b.exclusiveByMonth && b.exclusiveByMonth[m]) || { total: 0, items: [] };
      exclusiveByMonth[m] = {
        total: App.Money.roundWon((aE.total || 0) + (bE.total || 0)),
        items: (aE.items || []).concat(bE.items || [])
      };
      var aA = (a.exclusiveActorByMonth && a.exclusiveActorByMonth[m]) || { total: 0, items: [] };
      var bA = (b.exclusiveActorByMonth && b.exclusiveActorByMonth[m]) || { total: 0, items: [] };
      exclusiveActorByMonth[m] = {
        total: App.Money.roundWon((aA.total || 0) + (bA.total || 0)),
        items: (aA.items || []).concat(bA.items || [])
      };
    });
    var byPolicy = (a.byPolicy || []).concat(b.byPolicy || []);
    return {
      soloByMonth: soloByMonth,
      soloActorByMonth: soloActorByMonth,
      exclusiveByMonth: exclusiveByMonth,
      exclusiveActorByMonth: exclusiveActorByMonth,
      byPolicy: byPolicy,
      soloTotal: App.Money.sumBy(byPolicy, function (p) { return p.soloCost; }),
      soloActorCostTotal: App.Money.sumBy(byPolicy, function (p) { return p.soloActorCost; }),
      exclusiveCompanyValueTotal: App.Money.sumBy(byPolicy, function (p) { return p.exclusiveCompanyValue; }),
      exclusiveActorCostTotal: App.Money.sumBy(byPolicy, function (p) { return p.exclusiveActorCost; })
    };
  }

  App.Engine.supportPolicyMonthlyAmount = supportPolicyMonthlyAmount;
  App.Engine.vehicleFieldMonthlyTotal = vehicleFieldMonthlyTotal;
  App.Engine.vehicleFieldSnapshotTotal = vehicleFieldSnapshotTotal;
  App.Engine.calculateSupportPolicies = calculateSupportPolicies;
  App.Engine.calculateLunchTruckDetail = calculateLunchTruckDetail;
  App.Engine.lunchTruckDefaultPrice = lunchTruckDefaultPrice;
  App.Engine.lunchTruckProjectRows = lunchTruckProjectRows;
  App.Engine.calculateLunchTruckSupport = calculateLunchTruckSupport;
  App.Engine.vehicleDepositLines = vehicleDepositLines;
  App.Engine.depositsForSimulation = depositsForSimulation;
  App.Engine.calculateVehicleSupport = calculateVehicleSupport;
  App.Engine.isActorPersonalSupportRow = isActorPersonalSupportRow;
  App.Engine.actorSupportBenefitTotal = actorSupportBenefitTotal;
  App.Engine.actorSupportBenefitSplit = actorSupportBenefitSplit;
  App.Engine.mergeSupportResults = mergeSupportResults;
})();
