(function () {
  window.App = window.App || {};
  App.Engine = App.Engine || {};

  var OPEX_GROUPS = [
    { id: "sga", label: "판관비", test: null }
  ];

  function emptyValues(months) {
    var values = {};
    (months || []).forEach(function (m) { values[m] = 0; });
    return values;
  }

  function addAmount(values, month, amount) {
    if (values[month] === undefined) return;
    values[month] = App.Money.roundWon((values[month] || 0) + App.Money.roundWon(amount));
  }

  function sumValues(values) {
    var total = 0;
    Object.keys(values || {}).forEach(function (k) {
      total += App.Money.roundWon(values[k]);
    });
    return App.Money.roundWon(total);
  }

  function scaleValues(values, sign) {
    var out = {};
    Object.keys(values || {}).forEach(function (k) {
      out[k] = App.Money.roundWon(values[k] * sign);
    });
    return out;
  }

  function finishRow(id, label, values, kind) {
    return {
      id: id,
      label: label,
      values: values,
      total: sumValues(values),
      kind: kind || "expense"
    };
  }

  function employeeIncentiveLabel(emp) {
    var role = String((emp && emp.role) || "");
    var name = String((emp && emp.name) || "");
    if (/대표/.test(role) || /대표/.test(name)) return "대표 인센티브";
    return (name || role || "직원") + " 인센티브";
  }

  function subtotal(rows, months) {
    var values = emptyValues(months);
    (rows || []).forEach(function (row) {
      (months || []).forEach(function (m) {
        values[m] = App.Money.roundWon((values[m] || 0) + App.Money.roundWon(row.values[m] || 0));
      });
    });
    return { values: values, total: sumValues(values) };
  }

  function opexGroupOf(item) {
    if (App.Defaults && App.Defaults.recurringExpenseGroupId) {
      return App.Defaults.recurringExpenseGroupId(item);
    }
    return "sga";
  }

  function opexLabel(id) {
    var g = OPEX_GROUPS.filter(function (x) { return x.id === id; })[0];
    return g ? g.label : "운영비";
  }

  function pctLabel(rate) {
    return (Math.round(App.Money.toSafeNumber(rate) * 10000) / 100) + "%";
  }

  function revenueFeeRows(parts, months, category) {
    var map = {};
    var order = [];
    (months || []).forEach(function (m) {
      ((((parts.revenueFees || {}).byMonth || {})[m] || {}).items || []).forEach(function (it) {
        if (it.category !== category) return;
        var key = "revfee-" + it.feeId;
        if (!map[key]) {
          var label = (it.name || "매출 연동 수수료") + " · 매출연동 " + pctLabel(it.rate);
          map[key] = { id: key, label: label, values: emptyValues(months) };
          order.push(key);
        }
        addAmount(map[key].values, m, -App.Money.roundWon(it.amount));
      });
    });
    return order.map(function (k) { return finishRow(map[k].id, map[k].label, map[k].values); });
  }

  function collectFromByMonth(byMonth, months, keyFn, labelFn, sign) {
    var map = {};
    (months || []).forEach(function (m) {
      (((byMonth && byMonth[m]) || {}).items || []).forEach(function (it) {
        var key = keyFn(it, m);
        if (!map[key]) {
          map[key] = { id: key, label: labelFn(it), values: emptyValues(months) };
        }
        addAmount(map[key].values, m, App.Money.roundWon(it.amount) * sign);
      });
    });
    return Object.keys(map).map(function (k) { return finishRow(map[k].id, map[k].label, map[k].values); });
  }

  function makeGroup(id, label, rows, months, kind) {
    var sub = subtotal(rows, months);
    return {
      id: id,
      label: label,
      kind: kind || "expense",
      rows: rows,
      subtotal: sub
    };
  }

  function sgaParentLabel() {
    return (App.SgaFamily && App.SgaFamily.label) || "판관비";
  }

  function withSgaParent(group) {
    if (group) group.parentLabel = sgaParentLabel();
    return withSection(group, sgaParentLabel());
  }

  function withSection(group, section) {
    if (group) group.sectionLabel = section;
    return group;
  }

  function makeSummaryGroup(id, label, values, kind) {
    return {
      id: id,
      label: label,
      kind: kind || "summary",
      rows: [],
      subtotal: { values: values, total: sumValues(values) },
      summaryOnly: true
    };
  }

  function addGroupInto(target, group, months) {
    if (!group || !group.subtotal) return;
    (months || []).forEach(function (m) {
      addAmount(target, m, group.subtotal.values[m] || 0);
    });
  }

  function isSalesRevenueCategory(category) {
    if (App.Defaults && App.Defaults.isSalesCategory) {
      return App.Defaults.isSalesCategory(category);
    }
    return false;
  }

  function buildBudgetLedger(state, parts, flows) {
    var months = (parts && parts.months) || [];
    var groups = [];

    var workRevRows = [];
    var salesRevRows = [];
    (state.projects || []).forEach(function (p) {
      if (p.status === "cancelled") return;
      var values = emptyValues(months);
      (months || []).forEach(function (m) {
        ((((parts.revenue || {}).byMonth || {})[m] || {}).items || []).forEach(function (it) {
          if (it.projectId === p.id) addAmount(values, m, it.amount);
        });
      });
      var row = finishRow("rev-" + p.id, p.name || "이름 없는 작품", values, "income");
      if (isSalesRevenueCategory(p.category)) salesRevRows.push(row);
      else workRevRows.push(row);
    });
    (state.salesPlans || []).forEach(function (plan) {
      if (!plan.includeInBudget || plan.converted) return;
      var values = emptyValues(months);
      (months || []).forEach(function (m) {
        ((((parts.planInflows || {}).byMonth || {})[m] || {}).items || []).forEach(function (it) {
          if (it.planId === plan.id) addAmount(values, m, it.amount);
        });
      });
      if (!sumValues(values)) return;
      salesRevRows.push(finishRow("plan-" + plan.id, "계획 · " + (plan.name || "영업계획"), values, "income"));
    });
    var revenueGroups = [];
    if (workRevRows.length) {
      revenueGroups.push(withSection(makeGroup("revenue-work", "작품 수입", workRevRows, months, "income"), "매출"));
    }
    if (salesRevRows.length) {
      revenueGroups.push(withSection(makeGroup("revenue-sales", "영업 수입", salesRevRows, months, "income"), "매출"));
    }
    var totalRevenueValues = emptyValues(months);
    revenueGroups.forEach(function (g) {
      months.forEach(function (m) { addAmount(totalRevenueValues, m, g.subtotal.values[m] || 0); });
    });
    if (revenueGroups.length) {
      groups = groups.concat(revenueGroups);
      groups.push(withSection(makeSummaryGroup("revenue-total", "총 매출", totalRevenueValues, "income-summary"), "매출"));
    }

    var startupRows = collectFromByMonth((parts.startup || {}).byMonth, months, function (it) {
      return "start-" + (it.id || it.name);
    }, function (it) { return it.name || "설립비"; }, -1);
    var startupGroup = startupRows.length
      ? withSgaParent(makeGroup("startup", "초기비용", startupRows, months))
      : null;

    var depositRows = collectFromByMonth((parts.deposits || {}).byMonth, months, function (it) {
      return "dep-" + (it.id || it.name);
    }, function (it) { return it.name || "보증금"; }, -1);
    var capexRows = collectFromByMonth((parts.assets || {}).byMonth, months, function (it) {
      return "cap-" + (it.id || it.name);
    }, function (it) { return it.name || "자산"; }, -1);
    var fundingRows = depositRows.concat(capexRows);
    var fundingGroup = fundingRows.length
      ? withSection(makeGroup("funding", "자산·보증금", fundingRows, months, "funding"), "현금성/자산 이동")
      : null;

    var dividendValues = emptyValues(months);
    (flows || []).forEach(function (row) {
      addAmount(dividendValues, row.month, -App.Money.roundWon(row.dividend));
    });
    var dividendGroup = sumValues(dividendValues)
      ? withSection(makeGroup("dividend", "배당", [
          finishRow("owner-dividend", "대표 배당", dividendValues, "funding")
        ], months, "funding"), "현금성/자산 이동")
      : null;

    var otherInRows = collectFromByMonth((parts.otherInflows || {}).byMonth, months, function (it) {
      return "oin-" + (it.id || it.name);
    }, function (it) { return it.name || "기타 입금"; }, 1);
    var otherInGroup = otherInRows.length
      ? withSection(makeGroup("otherIn", "보증금 회수·기타 입금", otherInRows, months, "funding"), "현금성/자산 이동")
      : null;

    var projectRows = [];
    (state.projects || []).forEach(function (p) {
      if (p.status === "cancelled") return;
      (p.directExpenses || []).forEach(function (exp, idx) {
        if (exp.include === false) return;
        if (App.Engine.isLegacyProjectDirectExpense && App.Engine.isLegacyProjectDirectExpense(p, exp)) return;
        var values = emptyValues(months);
        var amt = App.Money.roundWon(exp.amount);
        if (amt && values[exp.month] !== undefined) addAmount(values, exp.month, -amt);
        projectRows.push(finishRow("direct-" + p.id + "-" + (exp.id || idx), (p.name || "작품") + " / " + (exp.name || "직접비"), values));
      });
    });
    (months || []).forEach(function (m) {
      ((((parts.projectExpense || {}).byMonth || {})[m] || {}).items || []).forEach(function (it) {
        var key = "pexp-" + it.projectId;
        var existing = projectRows.filter(function (r) { return r.id === key; })[0];
        if (!existing) {
          existing = finishRow(key, "[자동] " + (it.name || "작품 진행비"), emptyValues(months));
          projectRows.push(existing);
        }
        addAmount(existing.values, m, -App.Money.roundWon(it.amount));
        existing.total = sumValues(existing.values);
      });
    });
    (months || []).forEach(function (m) {
      ((((parts.lunchTruck || {})[m]) || {}).items || []).forEach(function (it) {
        var key = "lunch-" + it.projectId;
        var existing = projectRows.filter(function (r) { return r.id === key; })[0];
        if (!existing) {
          existing = finishRow(key, "[자동] " + (it.name || "밥차"), emptyValues(months));
          projectRows.push(existing);
        }
        addAmount(existing.values, m, -App.Money.roundWon(it.amount));
        existing.total = sumValues(existing.values);
      });
    });
    projectRows = projectRows.concat(revenueFeeRows(parts, months, "project"));
    var projectGroup = withSection(makeGroup("project", "프로젝트 직접비", projectRows, months), "매출원가");
    groups.push(projectGroup);

    var settleMap = {};
    var settleOrder = [];
    (months || []).forEach(function (m) {
      ((((parts.profitSettle || {}).byMonth || {})[m] || {}).items || []).forEach(function (it) {
        var key = "settle-" + (it.projectId || it.id || it.name);
        if (!settleMap[key]) {
          var rateText = it.rate ? " · " + pctLabel(it.rate) : "";
          settleMap[key] = {
            id: key,
            label: "[자동] " + (it.name || "프로젝트") + " 수익정산" + rateText,
            values: emptyValues(months)
          };
          settleOrder.push(key);
        }
        addAmount(settleMap[key].values, m, -App.Money.roundWon(it.amount));
      });
    });
    var settleRows = settleOrder.map(function (k) {
      return finishRow(settleMap[k].id, settleMap[k].label, settleMap[k].values);
    }).filter(function (row) { return row.total; });
    var profitSettleGroup = settleRows.length
      ? withSection(makeGroup("profit-settle", "수익정산", settleRows, months), "매출원가")
      : null;
    if (profitSettleGroup) groups.push(profitSettleGroup);

    var agencyRows = [];
    (months || []).forEach(function (m) {
      ((((parts.fees || {}).byMonth || {})[m] || {}).items || []).forEach(function (it, idx) {
        var key = "fee-" + (it.projectId || idx) + "-" + (it.name || "fee");
        var existing = agencyRows.filter(function (r) { return r.id === key; })[0];
        if (!existing) {
          var proj = (state.projects || []).filter(function (p) { return p.id === it.projectId; })[0];
          var label = ((proj && proj.name) ? proj.name + " " : "") + (it.name || "성사수수료");
          existing = finishRow(key, label, emptyValues(months));
          agencyRows.push(existing);
        }
        addAmount(existing.values, m, -App.Money.roundWon(it.amount));
        existing.total = sumValues(existing.values);
      });
    });
    agencyRows = agencyRows.concat(revenueFeeRows(parts, months, "agency"));
    var agencyGroup = agencyRows.length
      ? withSection(makeGroup("agency", "에이전시 수수료", agencyRows, months), "매출원가")
      : null;
    if (agencyGroup) groups.push(agencyGroup);

    var cogsValues = emptyValues(months);
    addGroupInto(cogsValues, projectGroup, months);
    addGroupInto(cogsValues, profitSettleGroup, months);
    addGroupInto(cogsValues, agencyGroup, months);
    groups.push(withSection(makeSummaryGroup("cogs-total", "매출원가 합계", cogsValues, "expense-summary"), "매출원가"));

    var grossValues = emptyValues(months);
    months.forEach(function (m) {
      grossValues[m] = App.Money.roundWon((totalRevenueValues[m] || 0) + (cogsValues[m] || 0));
    });
    groups.push(withSection(makeSummaryGroup("gross-profit", "매출총이익", grossValues, "profit-summary"), "매출총이익"));

    var payRows = [];
    (state.employees || []).forEach(function (emp) {
      if (emp.include === false) return;
      var salaryValues = emptyValues(months);
      var incentiveValues = emptyValues(months);
      (months || []).forEach(function (m) {
        ((((parts.payroll || {}).byMonth || {})[m] || {}).items || []).forEach(function (it) {
          if (it.id !== emp.id) return;
          var salaryAmt = it.salaryAmount != null
            ? it.salaryAmount
            : App.Money.roundWon(it.amount - App.Money.roundWon(it.incentiveAmount));
          addAmount(salaryValues, m, -App.Money.roundWon(salaryAmt));
          addAmount(incentiveValues, m, -App.Money.roundWon(it.incentiveAmount));
        });
      });
      var label = App.Defaults.employeeListLabel
        ? App.Defaults.employeeListLabel(emp)
        : (emp.name || emp.role || "직원");
      payRows.push(finishRow("emp-" + emp.id, label, salaryValues));
      var incRow = finishRow("emp-" + emp.id + "-incentive", employeeIncentiveLabel(emp), incentiveValues);
      incRow.showZero = true;
      payRows.push(incRow);
    });
    groups.push(withSgaParent(makeGroup("payroll", "인건비", payRows, months)));

    var insKeys = [
      { key: "pension", label: "국민연금" },
      { key: "health", label: "건강보험" },
      { key: "employment", label: "고용보험" },
      { key: "industrialAccident", label: "산재보험" }
    ];
    var insRows = insKeys.map(function (k) {
      var values = emptyValues(months);
      (months || []).forEach(function (m) {
        var d = ((parts.insurance || {}).byMonth || {})[m] || {};
        addAmount(values, m, -App.Money.roundWon(d[k.key]));
      });
      return finishRow("ins-" + k.key, k.label, values);
    });
    groups.push(withSgaParent(makeGroup("insurance", "4대보험", insRows, months)));

    var opexBuckets = { rent: [], marketing: [], sga: [] };
    (state.recurringExpenses || []).forEach(function (item) {
      if (item.include === false) return;
      if (App.Defaults && App.Defaults.isRetiredRecurringExpense && App.Defaults.isRetiredRecurringExpense(item)) return;
      var values = emptyValues(months);
      (months || []).forEach(function (m) {
        ((((parts.recurring || {}).byMonth || {})[m] || {}).items || []).forEach(function (it) {
          if (it.id === item.id) addAmount(values, m, -it.amount);
        });
      });
      var bucketKey = opexGroupOf(item);
      var bucketId = (bucketKey === "rent" || bucketKey === "marketing") ? bucketKey : "sga";
      opexBuckets[bucketId].push(finishRow("rec-" + item.id, item.name || "운영비", values));
    });
    (state.dayBasedExpenses || []).forEach(function (item) {
      if (item.include === false) return;
      var values = emptyValues(months);
      (months || []).forEach(function (m) {
        ((((parts.dayBased || {}).byMonth || {})[m] || {}).items || []).forEach(function (it) {
          if (it.id === item.id) addAmount(values, m, -it.amount);
        });
      });
      opexBuckets.sga.push(finishRow("day-" + item.id, item.name || "일수 비용", values));
    });
    var sevValues = emptyValues(months);
    (flows || []).forEach(function (row) {
      addAmount(sevValues, row.month, -App.Money.roundWon(row.severance));
    });
    opexBuckets.sga.push(finishRow("severance", "퇴직급여", sevValues));
    opexBuckets.sga = opexBuckets.sga.concat(revenueFeeRows(parts, months, "sga"));
    if (opexBuckets.rent.length) groups.push(withSgaParent(makeGroup("opex-rent", "임대료", opexBuckets.rent, months)));
    if (opexBuckets.marketing.length) groups.push(withSgaParent(makeGroup("opex-marketing", "마케팅비", opexBuckets.marketing, months)));
    if (opexBuckets.sga.length) groups.push(withSgaParent(makeGroup("opex-sga", "일반 판관비", opexBuckets.sga, months)));

    var welfareValues = emptyValues(months);
    (flows || []).forEach(function (row) {
      addAmount(welfareValues, row.month, -App.Money.roundWon(row.meal));
    });
    groups.push(withSgaParent(makeGroup("welfare", "복리후생비", [finishRow("welfare", "복리후생비", welfareValues)], months)));

    var supportRows = collectFromByMonth(parts.support, months, function (it) {
      return "sup-" + it.id;
    }, function (it) { return it.name || "회사 지원"; }, -1);
    var vehicleRows = [];
    var otherSupportRows = [];
    supportRows.forEach(function (row) {
      var id = String(row.id || "").replace(/^sup-/, "");
      if (id.indexOf("veh-") === 0 || App.Defaults.VEHICLE_SUPPORT_IDS.indexOf(id) >= 0) vehicleRows.push(row);
      else otherSupportRows.push(row);
    });
    if (vehicleRows.length) groups.push(withSgaParent(makeGroup("support-vehicle", "차량비", vehicleRows, months)));
    if (otherSupportRows.length) groups.push(withSgaParent(makeGroup("support-actor", "배우 활동지원", otherSupportRows, months)));

    var otherOpRows = collectFromByMonth((parts.otherOneTime || {}).byMonth, months, function (it) {
      return "ot-" + (it.id || it.name);
    }, function (it) { return it.name || "기타 운영비"; }, -1);
    if (otherOpRows.length) groups.push(withSgaParent(makeGroup("opex-onetime", "일회성 판관비", otherOpRows, months)));
    if (startupGroup) groups.push(startupGroup);

    var sgaChildIds = {
      payroll: true, insurance: true, welfare: true,
      "opex-rent": true, "opex-marketing": true, "opex-sga": true,
      "support-vehicle": true, "support-actor": true, "opex-onetime": true,
      startup: true
    };
    var sgaTotalValues = emptyValues(months);
    groups.forEach(function (g) {
      if (!sgaChildIds[g.id]) return;
      months.forEach(function (m) { addAmount(sgaTotalValues, m, g.subtotal.values[m] || 0); });
    });
    groups.push(withSection(makeSummaryGroup("opex-sga-parent", "판관비 소계", sgaTotalValues, "expense-summary"), sgaParentLabel()));

    var operatingValues = emptyValues(months);
    months.forEach(function (m) {
      operatingValues[m] = App.Money.roundWon((grossValues[m] || 0) + (sgaTotalValues[m] || 0));
    });
    groups.push(withSection(makeSummaryGroup("operating-profit", "영업이익", operatingValues, "profit-summary"), "영업이익"));

    if (fundingGroup) groups.push(fundingGroup);
    if (dividendGroup) groups.push(dividendGroup);
    if (otherInGroup) groups.push(otherInGroup);

    var incomeValues = emptyValues(months);
    var expenseValues = emptyValues(months);
    groups.forEach(function (g) {
      if (g.summaryOnly) return;
      if (g.kind === "income") {
        months.forEach(function (m) { addAmount(incomeValues, m, g.subtotal.values[m] || 0); });
      } else if (g.kind !== "funding") {
        months.forEach(function (m) { addAmount(expenseValues, m, g.subtotal.values[m] || 0); });
      }
    });
    var pnlValues = emptyValues(months);
    months.forEach(function (m) {
      pnlValues[m] = App.Money.roundWon((incomeValues[m] || 0) + (expenseValues[m] || 0));
    });
    var closeValues = emptyValues(months);
    (flows || []).forEach(function (row) {
      closeValues[row.month] = App.Money.roundWon(
        row.closingAfterTax != null ? row.closingAfterTax : row.closing
      );
    });
    var last = flows && flows.length ? flows[flows.length - 1] : null;

    var vatOutputValues = emptyValues(months);
    var vatSettlementValues = emptyValues(months);
    var corpLocalPayValues = emptyValues(months);
    (flows || []).forEach(function (row) {
      vatOutputValues[row.month] = App.Money.roundWon(row.vatOutput || 0);
      vatSettlementValues[row.month] = App.Money.roundWon(-(row.vatSettlement || 0));
      var taxPay = row.taxPayDisplay != null
        ? App.Money.roundWon(row.taxPayDisplay)
        : App.Money.roundWon((row.corporateTaxCashOut || 0) + (row.localIncomeTaxCashOut || 0));
      corpLocalPayValues[row.month] = App.Money.roundWon(-taxPay);
    });
    var results = [
      finishRow("incomeTotal", "월간 수입 합계", incomeValues, "income"),
      finishRow("expenseTotal", "월간 손익비용 합계", expenseValues, "expense"),
      finishRow("pnl", "영업이익", pnlValues, "result"),
      finishRow("vatOutput", "부가세 예수금(매출세액)", vatOutputValues, "vat"),
      finishRow("vatSettlement", "부가세 납부", vatSettlementValues, "vat"),
      finishRow("taxCorporateLocal", "법인세 및 주민세 납부", corpLocalPayValues, "tax"),
      finishRow("closing", "월말 자금", closeValues, "result")
    ];
    results[results.length - 1].total = last
      ? App.Money.roundWon(last.closingAfterTax != null ? last.closingAfterTax : last.closing)
      : 0;

    var ceoTotal = 0;
    (state.employees || []).forEach(function (emp) {
      if (emp.include === false) return;
      var text = (emp.name || "") + " " + (emp.role || "");
      if (/대표/.test(text)) {
        payRows.forEach(function (row) {
          if (row.id === "emp-" + emp.id || row.id === "emp-" + emp.id + "-incentive") {
            ceoTotal += -row.total;
          }
        });
      }
    });

    return {
      months: months,
      groups: groups,
      results: results,
      ceoSalary: App.Money.roundWon(ceoTotal)
    };
  }

  App.Engine.opexGroupOf = opexGroupOf;
  App.Engine.opexLabel = opexLabel;
  App.Engine.buildBudgetLedger = buildBudgetLedger;
})();
