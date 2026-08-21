(function () {
  window.App = window.App || {};
  var F = function () { return App.Format; };
  var esc = function (v) { return App.Format.escapeHtml(v); };

  function withUnit(inner, unit, cls) {
    return '<span class="with-unit' + (cls ? " " + cls : "") + '">' + inner + '<span class="unit">' + esc(unit) + "</span></span>";
  }

  function moneyInput(path, value, extra) {
    return withUnit(
      '<input type="text" inputmode="numeric" data-path="' + esc(path) + '" data-kind="money" value="' +
        esc(App.Format.formatGrouped(value)) + '" ' + (extra || "") + ">",
      "원"
    );
  }

  function textInput(path, value, extra) {
    return '<input type="text" data-path="' + esc(path) + '" value="' + esc(value || "") + '" ' + (extra || "") + ">";
  }

  function percentInput(path, value, extra, cls) {
    return withUnit(textInput(path, value, extra), "%", cls);
  }

  function monthInput(path, value) {
    var month = App.Month.normalizeMonth(value) || "";
    return '<input type="month" data-path="' + esc(path) + '" value="' + esc(month) + '">';
  }

  function compactMonthInput(path, value) {
    var month = App.Month.normalizeMonth(value);
    return '<span class="yy-mm" title="YYYY-MM 형식으로 직접 입력할 수 있습니다">' +
      '<input type="text" inputmode="numeric" class="yy-mm-face" data-path="' + esc(path) +
      '" data-kind="month" placeholder="YYYY-MM" value="' + esc(month || "") + '"></span>';
  }

  function isoMonthInput(path, value) {
    var month = App.Month.normalizeMonth(value);
    return '<span class="iso-mm" title="YYYY-MM 형식으로 직접 입력할 수 있습니다">' +
      '<input type="text" inputmode="numeric" class="yy-mm-face" data-path="' + esc(path) +
      '" data-kind="month" placeholder="YYYY-MM" value="' + esc(month || "") + '"></span>';
  }

  function selectInput(path, value, options) {
    var html = '<select data-path="' + esc(path) + '">';
    options.forEach(function (opt) {
      html += '<option value="' + esc(opt.id) + '"' + (opt.id === value ? " selected" : "") + ">" + esc(opt.label) + "</option>";
    });
    return html + "</select>";
  }

  function kpi(label, value, cls, about) {
    return '<div class="kpi ' + (cls || "") + '"><div class="label">' + esc(label) +
      '</div><div class="value">' + esc(value) + "</div>" +
      (about ? '<div class="about">' + esc(about) + "</div>" : "") + "</div>";
  }

  function costItemKey(list, item, index) {
    return list + ":" + ((item && item.id) || String(index));
  }

  function allCostItemKeys(state) {
    var keys = [];
    ["startupExpenses", "deposits", "assets", "otherOneTimeExpenses", "employees", "recurringExpenses", "otherInflows"].forEach(function (list) {
      (state[list] || []).forEach(function (item, i) {
        keys.push(costItemKey(list, item, i));
        if (list === "employees" && empIncentive(item)) keys.push(costItemKey(list, item, i) + "-incentive");
      });
    });
    return keys;
  }

  function isSecOpen(ui, id) {
    if (!ui || !ui.costSecOpen) return true;
    return ui.costSecOpen[id] !== false;
  }

  function isItemOpen(ui, key) {
    return !!(ui && ui.costItemOpen && ui.costItemOpen[key]);
  }


  function yyMonth(value) {
    return App.Format.formatMonthIso(value) || "미정";
  }

  function periodText(start, end) {
    return yyMonth(start) + "~" + (end ? yyMonth(end) : "계속");
  }

  function itemPeriodLabel(item) {
    if (!App.Month.usesCustomPeriod(item)) return "전체기간";
    return periodText(item.startMonth, item.endMonth);
  }

  function renderPeriodMode(pathPrefix, item, simStart, simEnd) {
    var custom = App.Month.usesCustomPeriod(item);
    var name = pathPrefix.replace(/\./g, "-") + "periodMode";
    var html = '<div class="period-mode">';
    html += '<span class="period-mode-label">적용기간</span>';
    html += '<label class="check"><input type="radio" name="' + esc(name) + '" data-path="' + pathPrefix +
      'periodMode" value="full"' + (custom ? "" : " checked") + ">시뮬레이션 전체</label>";
    html += '<label class="check"><input type="radio" name="' + esc(name) + '" data-path="' + pathPrefix +
      'periodMode" value="custom"' + (custom ? " checked" : "") + ">직접 지정</label>";
    html += "</div>";
    if (custom) {
      html += '<div class="row-fields period-custom">';
      html += '<div class="field"><label>시작월</label>' + compactMonthInput(pathPrefix + "startMonth", item.startMonth || simStart) + "</div>";
      html += '<div class="field"><label>종료월</label>' + compactMonthInput(pathPrefix + "endMonth", item.endMonth || simEnd) + "</div>";
      html += "</div>";
    }
    return html;
  }

  function includeLabel(on) {
    return on ? "포함" : "미포함";
  }

  function opexAccountLabel(groupId) {
    if (groupId === "rent") return "임대료";
    if (groupId === "marketing") return "마케팅비";
    return "일반 판관비";
  }

  function costFamilyAccount(kind, extra) {
    extra = extra || {};
    if (kind === "startup") {
      return {
        family: "설립비용",
        account: extra.setupType === "oneTimeBusiness" ? "기타 일회성" : "설립비"
      };
    }
    if (kind === "deposit") return { family: "보증금", account: extra.account || (extra.vehicle ? "차량 보증금" : "보증금") };
    if (kind === "asset") return { family: "자산", account: extra.account || "비품" };
    if (kind === "inflow") return { family: "보증금", account: extra.account || extra.kindLabel || "기타 입금" };
    if (kind === "employee") return { family: "판관비", account: "인건비" };
    if (kind === "incentive") return { family: "판관비", account: "인센티브" };
    if (kind === "recurring") return { family: "판관비", account: opexAccountLabel(extra.groupId) };
    if (kind === "welfare") return { family: "판관비", account: "복리후생비" };
    if (kind === "vehicle") return { family: "판관비", account: "차량비" };
    if (kind === "actor") return { family: "판관비", account: "배우 활동지원" };
    if (kind === "onetime") return { family: "판관비", account: "일회성 판관비" };
    return { family: extra.family || "판관비", account: extra.account || "판관비" };
  }

  function familyBadge(label) {
    var extra = label === "작품" ? " cat-badge-work" : label === "영업" ? " cat-badge-sales" : "";
    return '<span class="cat-badge' + extra + ' cat-badge-family">' + esc(label) + "</span>";
  }

  function fundingAccountSubject(kind, row) {
    if (row && row.accountSubject) return row.accountSubject;
    if (kind === "asset") return "비품";
    if (kind === "inflow") return "";
    return "보증금";
  }

  function fundingFamilySelect(list, index, family) {
    var cur = family === "자산" ? "asset" : "deposit";
    return '<select class="cat-badge cat-badge-family cost-family-select" data-action="funding-family" data-list="' +
      esc(list) + '" data-index="' + index + '">' +
      '<option value="deposit"' + (cur === "deposit" ? " selected" : "") + ">보증금</option>" +
      '<option value="asset"' + (cur === "asset" ? " selected" : "") + ">자산</option>" +
      "</select>";
  }

  function costListCols() {
    return '<div class="cost-cols cost-row-list" aria-hidden="true">' +
      "<span>상위구분</span><span>계정과목</span><span>항목</span>" +
      '<span class="num">금액</span><span>단위</span><span>기간</span><span>상태</span></div>';
  }

  function costUnitText(unit) {
    return unit != null && String(unit).trim() !== "" ? String(unit).trim() : "-";
  }

  function costRowListClass(base, extraClass) {
    var cls = (base + " " + (extraClass || "")).replace(/\bcost-row-list\b/g, " ").replace(/\s+/g, " ").trim();
    return cls + " cost-row-list";
  }

  function costGroupLabel(text, extraClass) {
    return '<div class="' + costRowListClass("cost-group-label", extraClass) + '">' +
      "<span></span><span></span><span>" + esc(text) + "</span>" +
      "<span></span><span></span><span></span><span></span></div>";
  }

  function costSubtotalBar(label, amountText, extraText, extraClass) {
    return '<div class="' + costRowListClass("cost-subtotal", extraClass) + '">' +
      "<span></span><span></span><span>" + esc(label) + "</span>" +
      '<span class="cost-amt">' + (amountText || "") + "</span>" +
      '<span class="cost-unit">-</span>' +
      "<span>" + (extraText ? esc(extraText) : "") + "</span>" +
      "<span></span></div>";
  }

  function costSummaryCells(opts) {
    var key = opts.key || "";
    var html = "";
    html += '<span class="cost-family">' + familyBadge(opts.family) + "</span>";
    html += '<span class="cost-account">' + catBadge(null, opts.account, { static: true }) + "</span>";
    html += '<span class="cost-name"' + (key ? ' data-computed="cost-name" data-item="' + esc(key) + '"' : "") + ">";
    html += '<i class="chev' + (opts.chevron === false ? " chev-ghost" : "") + '" aria-hidden="true"></i>';
    html += (opts.nameHtml || esc(opts.name || "항목")) + "</span>";
    html += '<span class="cost-amt"' + (key ? ' data-computed="cost-amt" data-item="' + esc(key) + '"' : "") + ">" +
      (opts.amountHtml != null ? opts.amountHtml : esc(opts.amount || "")) + "</span>";
    html += '<span class="cost-unit"' + (key ? ' data-computed="cost-unit" data-item="' + esc(key) + '"' : "") + ">" +
      esc(costUnitText(opts.unit)) + "</span>";
    html += '<span class="cost-period"' + (key ? ' data-computed="cost-period" data-item="' + esc(key) + '"' : "") +
      (opts.period ? ' title="' + esc(opts.period) + '"' : "") + ">" +
      esc(opts.period || "") + "</span>";
    html += '<span class="cost-flag"' + (opts.flagAttr === false ? "" : (key ? ' data-computed="cost-flag" data-item="' + esc(key) + '"' : "")) + ">" +
      (opts.statusHtml != null ? opts.statusHtml : esc(opts.status || "")) + "</span>";
    return html;
  }

  function overrideCount(item) {
    return Object.keys((item && item.overrides) || {}).length;
  }

  function lineEstimatedAmount(row) {
    if (!row) return 0;
    if (row.estimatedAmount !== null && row.estimatedAmount !== undefined && row.estimatedAmount !== "") {
      return App.Money.roundWon(row.estimatedAmount);
    }
    var qty = Math.max(App.Money.toSafeNumber(row.qty), 1);
    return App.Money.roundWon(App.Money.toSafeNumber(row.unitPrice) * qty);
  }

  function lineDisplayAmount(row) {
    if (!row) return 0;
    return App.Engine.resolvedLineAmount({
      include: true,
      actualAmount: row.actualAmount,
      estimatedAmount: row.estimatedAmount,
      qty: row.qty,
      unitPrice: row.unitPrice
    });
  }

  function lineStats(rows, corporateStatus) {
    var n = 0;
    var sum = 0;
    var est = 0;
    (rows || []).forEach(function (row) {
      est += lineEstimatedAmount(row);
      if (corporateStatus && !App.Engine.isEffectiveLineIncluded(row, corporateStatus)) return;
      if (!corporateStatus && row.include === false) return;
      n += 1;
      sum += App.Engine.resolvedLineAmount(row);
    });
    return { n: n, sum: sum, est: est };
  }

  function startupRegistryGroupName(name) {
    return /등록면허세|지방교육세|법원수입증지|법인인감제작|법무사수수료|설립\s*부대비용/.test(name || "")
      ? "registry"
      : "other";
  }

  function startupRegistryRows(rows) {
    return (rows || []).filter(function (row) {
      return startupRegistryGroupName(row && row.name) === "registry";
    });
  }

  function startupOtherRows(rows) {
    return (rows || []).filter(function (row) {
      return startupRegistryGroupName(row && row.name) !== "registry";
    });
  }

  function startupDisplayEntries(rows, variant) {
    var out = [];
    if (variant !== "startup") {
      (rows || []).forEach(function (row, i) { out.push({ row: row, index: i }); });
      return out;
    }
    (rows || []).forEach(function (row, i) {
      if (startupRegistryGroupName(row && row.name) === "registry") out.push({ row: row, index: i, group: "registry" });
    });
    (rows || []).forEach(function (row, i) {
      if (startupRegistryGroupName(row && row.name) !== "registry") out.push({ row: row, index: i, group: "other" });
    });
    return out;
  }

  function recExpenseGroupId(item) {
    return (App.Defaults && App.Defaults.recurringExpenseGroupId) ? App.Defaults.recurringExpenseGroupId(item) : "sga";
  }

  function recMonthlySum(items, groupId) {
    var sum = 0;
    (items || []).forEach(function (item) {
      if (App.Defaults && App.Defaults.isRetiredRecurringExpense && App.Defaults.isRetiredRecurringExpense(item)) return;
      if (groupId && recExpenseGroupId(item) !== groupId) return;
      if (item.include !== false) sum += App.Money.roundWon(item.amount);
    });
    return sum;
  }

  function recurringAppliedTotal(item, start, end) {
    if (!item || item.include === false) return 0;
    var months = App.Month.getSimulationMonths(start, end) || [];
    var total = 0;
    months.forEach(function (m) {
      if (!App.Month.appliesInMonth(item, m, start, end)) return;
      var amount = item.overrides && item.overrides[m] !== undefined && item.overrides[m] !== ""
        ? App.Money.roundWon(item.overrides[m])
        : App.Money.roundWon(item.amount);
      total += amount;
    });
    return App.Money.roundWon(total);
  }

  function recurringPeriodCellText(item) {
    var period = itemPeriodLabel(item);
    var ov = overrideCount(item);
    if (ov) period += " · 변동 " + ov + "건";
    return period;
  }

  function recurringAmountInnerHtml(item, start, end) {
    var html = esc(App.Format.formatWon(item && item.amount));
    if (!overrideCount(item)) return html;
    html += '<small class="cost-amt-note">기간합 ' +
      esc(App.Format.formatWon(recurringAppliedTotal(item, start, end))) + "</small>";
    return html;
  }

  function recGroupAppliedTotal(items, groupId, start, end) {
    var sum = 0;
    (items || []).forEach(function (item) {
      if (App.Defaults && App.Defaults.isRetiredRecurringExpense && App.Defaults.isRetiredRecurringExpense(item)) return;
      if (groupId && recExpenseGroupId(item) !== groupId) return;
      sum += recurringAppliedTotal(item, start, end);
    });
    return App.Money.roundWon(sum);
  }

  function recGroupHasOverrides(items, groupId) {
    return (items || []).some(function (item) {
      if (App.Defaults && App.Defaults.isRetiredRecurringExpense && App.Defaults.isRetiredRecurringExpense(item)) return false;
      if (groupId && recExpenseGroupId(item) !== groupId) return false;
      if (item.include === false) return false;
      return overrideCount(item) > 0;
    });
  }

  function recGroupSummaryParts(items, groupId, state) {
    var start = state && state.profile && state.profile.startMonth;
    var end = state && state.profile && state.profile.endMonth;
    var n = recGroupCount(items, groupId);
    var monthly = recMonthlySum(items, groupId);
    var period = n + "건";
    if (recGroupHasOverrides(items, groupId)) {
      var periodSum = recGroupAppliedTotal(items, groupId, start, end);
      period += periodSum ? " · 기간합 " + App.Format.formatWon(periodSum) : " · 월별 변동 있음";
    }
    return {
      amount: App.Format.formatWon(monthly),
      unit: "월",
      period: period
    };
  }

  function recGroupSummaryText(items, groupId, state) {
    var p = recGroupSummaryParts(items, groupId, state);
    return p.period + " · " + p.unit + " " + p.amount;
  }

  function recGroupCount(items, groupId) {
    var n = 0;
    (items || []).forEach(function (item) {
      if (App.Defaults && App.Defaults.isRetiredRecurringExpense && App.Defaults.isRetiredRecurringExpense(item)) return;
      if (recExpenseGroupId(item) === groupId) n += 1;
    });
    return n;
  }

  function salarySum(employees) {
    return App.Money.sumBy(employees || [], function (e) {
      if (!e || e.include === false) return 0;
      return App.Money.roundWon(e.monthlySalary);
    });
  }

  function sgaMonthlyTotal(state) {
    return App.Money.roundWon(salarySum(state && state.employees) + recMonthlySum((state && state.recurringExpenses) || []));
  }

  function supportSgaMonthlySum(policies, state) {
    return App.Money.sumBy((policies || []).filter(function (p) {
      return p.include === true && p.costClass === "sga";
    }), function (p) {
      var share = App.Money.toRatio(p.soloCompanyShareRate != null ? p.soloCompanyShareRate : 1);
      return (App.Engine.supportPolicyMonthlyAmount(p, state) || 0) * share;
    });
  }

  function inflowSum(items) {
    return App.Money.sumBy(items || [], function (item) {
      return item.include === false ? 0 : item.amount;
    });
  }

  function lineSecText(rows, corporateStatus) {
    var s = lineStats(rows, corporateStatus);
    return "반영 " + s.n + "건 · " + App.Format.formatWon(s.sum);
  }

  function costGrandTotalText(rows, corporateStatus) {
    var s = lineStats(rows, corporateStatus);
    return "전체 합계 " + App.Format.formatWon(s.sum);
  }

  function empTitle(e, genericOwner) {
    if (genericOwner && App.Defaults.isOwnerEmployee && App.Defaults.isOwnerEmployee(e)) {
      return App.Defaults.employeeListLabel(e);
    }
    var n = ((e && e.name) || "").trim();
    var r = ((e && e.role) || "").trim();
    if (n && r && n !== r) return n + " / " + r;
    return n || r || "직원";
  }

  function compactMonthLoose(attrs, value, emptyLabel) {
    var month = App.Month.normalizeMonth(value);
    return '<span class="yy-mm" title="YYYY-MM 형식으로 직접 입력할 수 있습니다">' +
      '<input type="text" inputmode="numeric" class="yy-mm-face" ' + (attrs || "") +
      ' placeholder="' + esc(emptyLabel || "YYYY-MM") + '" value="' + esc(month || "") + '"></span>';
  }

  function renderCostSection(opts) {
    var isGroup = /\bcost-sec-group\b/.test(opts.extraClass || "");
    var html = '<details class="cost-sec' + (opts.extraClass ? " " + opts.extraClass : "") +
      '" data-cost-sec="' + esc(opts.id) + '"' + (opts.open ? " open" : "") + ">";
    if (isGroup) {
      html += '<summary><div class="cost-sec-head cost-row-list">';
      html += '<span class="cost-group-title"><span class="chev" aria-hidden="true"></span><b>' +
        esc(opts.title) + "</b></span>";
      html += '<span class="cost-amt"' + (opts.id ? ' data-computed="cost-sec-amt" data-sec="' + esc(opts.id) + '"' : "") +
        ">" + esc(opts.amount || "") + "</span>";
      html += '<span class="cost-unit"' + (opts.id ? ' data-computed="cost-sec-unit" data-sec="' + esc(opts.id) + '"' : "") +
        ">" + esc(opts.unit || "") + "</span>";
      html += '<span class="cost-period cost-sec-sum" data-computed="cost-sec" data-sec="' +
        esc(opts.id) + '">' + esc(opts.period || opts.summary || "") + "</span>";
      if (opts.addAction) {
        html += '<span class="cost-flag"><button type="button" class="btn" data-action="' +
          esc(opts.addAction) + '"' + (opts.addAttrs || "") + ">" +
          esc(opts.addLabel || "+ 항목") + "</button></span>";
      } else {
        html += '<span class="cost-flag"></span>';
      }
      html += "</div></summary>";
    } else {
      html += '<summary><div class="cost-sec-head">';
      html += '<span class="chev" aria-hidden="true"></span>';
      html += "<b>" + esc(opts.title) + "</b>";
      html += '<span class="cost-sec-sum" data-computed="cost-sec" data-sec="' + esc(opts.id) + '">' + esc(opts.summary || "") + "</span>";
      if (opts.addAction) {
        html += '<button type="button" class="btn" data-action="' + esc(opts.addAction) + '"' + (opts.addAttrs || "") + ">" +
          esc(opts.addLabel || "+ 항목") + "</button>";
      } else {
        html += "<span></span>";
      }
      html += "</div></summary>";
    }
    html += '<div class="cost-sec-body">' + (opts.body || "") + "</div></details>";
    return html;
  }

  function costCols(kind, extraClass) {
    if (kind === "recurring") {
      return '<div class="cost-cols cost-row-recurring" aria-hidden="true"><span></span><span>구분</span><span>항목</span><span>금액</span><span>기간</span><span></span><span>상태</span></div>';
    }
    if (kind === "employee") {
      return '<div class="cost-cols cost-row-emp' + (extraClass ? " " + extraClass : "") +
        '" aria-hidden="true"><span></span><span>구분</span><span>이름 / 직책</span><span>금액</span><span>기간</span><span>상태</span></div>';
    }
    if (kind === "inflow") {
      return '<div class="cost-cols cost-row-inflow" aria-hidden="true"><span></span><span>항목명</span><span>금액</span><span>월</span><span>종류</span></div>';
    }
    if (kind === "startup") {
      return '<div class="cost-cols cost-row-startup" aria-hidden="true"><span></span><span>항목</span><span>일반 설립비용</span><span>실제 예상안</span><span>반영월</span><span>상태</span></div>';
    }
    if (kind === "deposit") {
      return '<div class="cost-cols cost-row-deposit" aria-hidden="true"><span></span><span>구분</span><span>항목</span><span>금액</span><span>월</span><span>회수</span><span>상태</span></div>';
    }
    if (kind === "onetime") {
      return '<div class="cost-cols cost-row-onetime" aria-hidden="true"><span></span><span>구분</span><span>항목</span><span>금액</span><span>월</span><span>상태</span></div>';
    }
    return '<div class="cost-cols cost-row-line" aria-hidden="true"><span></span><span>항목명</span><span>금액</span><span>월</span><span>상태</span></div>';
  }

  function foundingMonthFace(row, startMonth) {
    if (App.Defaults.followsSimStartMonth(row)) {
      var followed = startMonth || row.month;
      return (App.Format.formatMonthIso(followed) || followed || "시작월") + " · 시작월";
    }
    var custom = row && row.month || startMonth;
    return App.Format.formatMonthIso(custom) || custom || "미정";
  }

  function renderStartupSubtotal(label, rows, corporateStatus) {
    var s = lineStats(rows, corporateStatus);
    return costSubtotalBar(label, App.Format.formatWon(s.sum), s.n + "건", "cost-row-startup cost-row-list");
  }

  function renderLineAccordions(list, rows, startMonth, ui, variant, corporateStatus, opts) {
    opts = opts || {};
    variant = variant || "line";
    corporateStatus = corporateStatus || "new";
    var html = opts.noWrap ? "" : ('<div class="cost-list">' + costListCols());
    var entries = startupDisplayEntries(rows, variant);
    var registrySubtotalRendered = false;
    if (variant === "startup" && startupRegistryRows(rows).length) {
      html += costGroupLabel("법인설립등기 비용", "cost-row-startup cost-row-list");
    }
    entries.forEach(function (entry) {
      var row = entry.row;
      var i = entry.index;
      if (variant === "startup" && entry.group === "other" && !registrySubtotalRendered && startupRegistryRows(rows).length) {
        html += renderStartupSubtotal("법인설립등기 비용 소계", startupRegistryRows(rows), corporateStatus);
        html += costGroupLabel("기타 초기비용", "cost-row-startup cost-row-list");
        registrySubtotalRendered = true;
      }
      var key = costItemKey(list, row, i);
      var rawIncluded = row.include !== false;
      var setupType = variant === "startup" ? App.Defaults.normalizeSetupCostType(row) : "";
      var included = variant === "startup"
        ? App.Engine.isEffectiveLineIncluded(row, corporateStatus)
        : rawIncluded;
      var mutedByStatus = rawIncluded && !included;
      var p = list + "." + i + ".";
      var followsStart = (variant === "startup" || variant === "deposit" || variant === "asset") &&
        App.Defaults.followsSimStartMonth(row);
      var monthVal = followsStart ? (startMonth || row.month) : (row.month || startMonth);
      var monthFace = (variant === "startup" || variant === "deposit" || variant === "asset")
        ? foundingMonthFace(row, startMonth)
        : yyMonth(monthVal);
      var kind = variant === "deposit" ? "deposit" : (variant === "onetime" ? "onetime" : (variant === "startup" ? "startup" : "asset"));
      if (variant === "line") kind = "asset";
      var accountSubject = (variant === "deposit" || variant === "asset") ? fundingAccountSubject(kind, row) : "";
      var labels = costFamilyAccount(kind, { setupType: setupType, account: accountSubject });
      var amountText = App.Format.formatWon(lineDisplayAmount(row));
      var periodFace = monthFace;
      if (variant === "deposit" && row.expectedReturnMonth) periodFace += " · 회수 " + (App.Format.formatMonthIso(row.expectedReturnMonth) || row.expectedReturnMonth);
      var rowClass = "cost-row" + (variant === "startup" ? " cost-row-startup" : "") + " cost-row-list";
      html += '<details class="cost-item' + (included ? "" : " off") + '" data-cost-item="' + esc(key) + '"' +
        (isItemOpen(ui, key) ? " open" : "") + ">";
      html += '<summary><div class="' + rowClass + '">';
      html += costSummaryCells({
        key: key,
        family: labels.family,
        account: labels.account,
        name: row.name || "항목",
        amount: amountText,
        unit: "1회",
        period: periodFace,
        status: mutedByStatus ? "미반영" : includeLabel(included)
      });
      html += "</div></summary>";
      html += '<div class="cost-item-body">';
      html += '<div class="row-fields">';
      if (variant === "deposit" || variant === "asset") {
        html += '<div class="field"><label>구분</label>' + fundingFamilySelect(list, i, labels.family) + "</div>";
        html += '<div class="field"><label>계정과목</label>' + textInput(p + "accountSubject", accountSubject, 'placeholder="예: 차량운반구, 건물, 기타보증금"') + "</div>";
      }
      html += '<div class="field"><label>항목명</label>' + textInput(p + "name", row.name) + "</div>";
      if (variant === "startup") {
        html += '<div class="field"><label>초기비용 구분</label>' + selectInput(p + "setupCostType", setupType, [
          { id: "incorporation", label: "설립 관련" },
          { id: "oneTimeBusiness", label: "기타 일회성" }
        ]) + "</div>";
      }
      html += '<div class="field"><label>' + (variant === "startup" ? "일반 설립비용" : "예상금액") + "</label>" + moneyInput(p + "estimatedAmount", row.estimatedAmount) + "</div>";
      html += '<div class="field"><label>' + (variant === "startup" ? "실제 예상안" : (variant === "deposit" ? "납부금액" : "반영금액")) + "</label>" +
        moneyInput(p + "actualAmount", row.actualAmount) + "</div>";
      html += '<div class="field"><label>' + (variant === "deposit" ? "납부월" : "반영월") + "</label>" +
        ((variant === "startup" || variant === "deposit" || variant === "asset")
          ? isoMonthInput(p + "month", monthVal)
          : compactMonthInput(p + "month", monthVal)) + "</div>";
      html += '<div class="field"><label class="check"><input type="checkbox" data-path="' + p +
        'include" data-kind="bool"' + (rawIncluded ? " checked" : "") + ">포함</label></div>";
      if (variant === "startup" && setupType === "incorporation") {
        html += '<div class="field"><label class="check"><input type="checkbox" data-path="' + p +
          'forceInclude" data-kind="bool"' + (row.forceInclude === true ? " checked" : "") + ">강제 반영</label></div>";
      }
      html += "</div>";
      if (mutedByStatus) {
        html += '<p class="muted small">기존 법인 기준이라 설립 관련 비용은 현재 시뮬레이션에서 미반영됩니다. 필요하면 강제 반영을 켜세요.</p>';
      }
      if (variant === "deposit") {
        html += '<div class="row-fields">';
        html += '<div class="field"><label>예상 회수월</label>' + isoMonthInput(p + "expectedReturnMonth", row.expectedReturnMonth) + "</div>";
        html += '<div class="field"><label>회수금액</label>' + moneyInput(p + "returnAmount", row.returnAmount != null ? row.returnAmount : lineDisplayAmount(row)) + "</div>";
        html += '<div class="field"><label class="check"><input type="checkbox" data-path="' + p +
          'returned" data-kind="bool"' + (row.returned ? " checked" : "") + ">회수 여부</label></div>";
        html += "</div>";
        html += '<p class="muted small">회수월은 미정이어도 됩니다. 지금은 구조를 저장하며, 입금 반영은 아래 보증금 회수 항목으로 넣을 수 있습니다.</p>';
      }
      html += '<div class="field"><label>메모</label>' + textInput(p + "note", row.note || row.excludeReason || "") + "</div>";
      html += '<button type="button" class="btn danger" data-action="remove-line" data-list="' + list + '" data-index="' + i + '">삭제</button>';
      html += "</div></details>";
    });
    if (variant === "startup" && startupRegistryRows(rows).length && !registrySubtotalRendered) {
      html += renderStartupSubtotal("법인설립등기 비용 소계", startupRegistryRows(rows), corporateStatus);
    }
    if (variant === "startup" && startupOtherRows(rows).length) {
      html += renderStartupSubtotal("기타 초기비용 소계", startupOtherRows(rows), corporateStatus);
    }
    if (!opts.noWrap && !(rows || []).length) html += '<div class="cost-empty muted small">항목이 없습니다.</div>';
    if (!opts.noWrap) html += "</div>";
    return html;
  }

  function empIncentive(e) {
    if (!e) return 0;
    return App.Money.roundWon(
      App.Money.toSafeNumber(e.incentiveSeollal) +
      App.Money.toSafeNumber(e.incentiveChuseok) +
      App.Money.toSafeNumber(e.incentiveYearEnd)
    );
  }

  function empMonthlyTotal(e) {
    return App.Money.roundWon(e && e.monthlySalary);
  }

  function empAmountCellText(e) {
    return App.Format.formatWon(empMonthlyTotal(e));
  }

  function empIncentiveTitle(e) {
    var r = ((e && e.role) || "").trim();
    var n = ((e && e.name) || "").trim();
    return (r || n || "직원") + " 인센티브";
  }

  function empIncentiveKey(e, i) {
    return costItemKey("employees", e, i) + "-incentive";
  }

  function empIncentiveRowHtml(e, i, linked, ui) {
    var incentive = empIncentive(e);
    if (!incentive) return "";
    var included = e.include !== false;
    var labels = costFamilyAccount("incentive");
    var seollal = App.Money.roundWon(e.incentiveSeollal);
    var chuseok = App.Money.roundWon(e.incentiveChuseok);
    var yearEnd = App.Money.roundWon(e.incentiveYearEnd);
    var key = empIncentiveKey(e, i);
    var html = '<details class="cost-item employee-incentive-readonly' + (included ? "" : " off") + '" data-cost-item="' + esc(key) + '"' +
      (isItemOpen(ui, key) ? " open" : "") + ">";
    html += '<summary><div class="cost-row cost-row-list">';
    html += costSummaryCells({
      key: key,
      family: labels.family,
      account: labels.account,
      name: empIncentiveTitle(e),
      amount: App.Format.formatWon(incentive),
      unit: "년",
      period: itemPeriodLabel(e),
      status: linked ? "[조직 설정 연동]" : (included ? "포함" : "미포함"),
      flagAttr: false
    });
    html += "</div></summary>";
    html += '<div class="cost-item-body">';
    html += '<div class="tax-summary-mini cost-calc">';
    if (seollal) html += calcLine("설", App.Format.formatWon(seollal));
    if (chuseok) html += calcLine("추석", App.Format.formatWon(chuseok));
    if (yearEnd) html += calcLine("연말(12월)", App.Format.formatWon(yearEnd));
    html += calcLine("연간 합계", App.Format.formatWon(incentive), { hl: true });
    html += "</div>";
    html += '<p class="muted small">설·추석·연말에 각 1회, 해당 월에 전액 반영됩니다. 시뮬레이션이 여러 해에 걸치면 그 횟수만큼 매년 반영되므로, 전체 기간 실제 반영액은 위 "연간 합계"보다 클 수 있습니다. 월별 실제 반영액은 분석 &gt; 월별 분석에서 확인합니다.</p>';
    html += "</div>";
    html += "</details>";
    return html;
  }

  function renderEmployeeAccordions(state, ui, linked, opts) {
    opts = opts || {};
    var start = state.profile.startMonth;
    var end = state.profile.endMonth;
    var html = opts.noWrap ? "" : ('<div class="cost-list">' + costListCols());
    (state.employees || []).forEach(function (e, i) {
      var key = costItemKey("employees", e, i);
      var included = e.include !== false;
      var p = "employees." + i + ".";
      var labels = costFamilyAccount("employee");
      var empDefaultOpen = !linked && !(ui && ui.costItemOpen && (key in ui.costItemOpen));
      html += '<details class="cost-item' + (included ? "" : " off") + '" data-cost-item="' + esc(key) + '"' +
        ((isItemOpen(ui, key) || empDefaultOpen) ? " open" : "") + ">";
      html += '<summary><div class="cost-row cost-row-list">';
      html += costSummaryCells({
        key: key,
        family: labels.family,
        account: labels.account,
        name: empTitle(e, linked),
        amount: empAmountCellText(e),
        unit: "월",
        period: itemPeriodLabel(e),
        status: linked ? "[조직 설정 연동]" : includeLabel(included),
        flagAttr: !linked
      });
      html += "</div></summary>";
      html += '<div class="cost-item-body">';
      if (linked) {
        html += '<p class="muted small">[조직 설정 연동] 인건비는 시뮬레이션 설정 &gt; 조직·인건비에서 수정합니다. 여기서 다시 입력하지 않습니다.</p>';
        html += '<div class="row-fields">';
        html += '<div class="field"><label>이름</label><div class="readonly">' + esc(e.name || "—") + "</div></div>";
        html += '<div class="field"><label>직책</label><div class="readonly">' + esc(e.role || "—") + "</div></div>";
        html += '<div class="field"><label>월급여</label><div class="readonly">' + App.Format.formatWon(e.monthlySalary) + "</div></div>";
        html += '<div class="field"><label>인센티브(연간)</label><div class="readonly">' + App.Format.formatWon(empIncentive(e)) + "</div></div>";
        html += '<div class="field"><label>기간</label><div class="readonly">' + esc(itemPeriodLabel(e)) + "</div></div>";
        html += "</div>";
        html += '<button type="button" class="btn" data-action="goto-org-staff">조직·인건비에서 수정</button>';
      } else {
        html += '<div class="row-fields">';
        html += '<div class="field"><label>이름</label>' + textInput(p + "name", e.name) + "</div>";
        html += '<div class="field"><label>직책</label>' + textInput(p + "role", e.role) + "</div>";
        html += '<div class="field"><label>월급여</label>' + moneyInput(p + "monthlySalary", e.monthlySalary) + "</div>";
        html += "</div>";
        html += '<p class="muted small">인센티브는 설·추석·연말 3회, 해당 월에 전액 한 번에 반영됩니다.</p>';
        html += '<div class="row-fields">';
        html += '<div class="field"><label>인센티브(설)</label>' + moneyInput(p + "incentiveSeollal", e.incentiveSeollal) + "</div>";
        html += '<div class="field"><label>인센티브(추석)</label>' + moneyInput(p + "incentiveChuseok", e.incentiveChuseok) + "</div>";
        html += '<div class="field"><label>인센티브(연말)</label>' + moneyInput(p + "incentiveYearEnd", e.incentiveYearEnd) + "</div>";
        html += "</div>";
        html += renderPeriodMode(p, e, start, end);
        html += '<div class="inline cost-flags">';
        html += '<label class="check"><input type="checkbox" data-path="' + p + 'insure" data-kind="bool"' + (e.insure ? " checked" : "") + ">보험 여부</label>";
        html += '<label class="check"><input type="checkbox" data-path="' + p + 'meal" data-kind="bool"' + (e.meal ? " checked" : "") + ">식대 여부</label>";
        html += '<label class="check"><input type="checkbox" data-path="' + p + 'severance" data-kind="bool"' + (e.severance ? " checked" : "") + ">퇴직 여부</label>";
        html += '<label class="check"><input type="checkbox" data-path="' + p + 'include" data-kind="bool"' + (included ? " checked" : "") + ">포함</label>";
        html += "</div>";
        var burdenType = App.Defaults.resolveComparisonBurdenType(e);
        html += '<div class="field"><label>비교 부담유형</label>' +
          selectInput(p + "comparisonBurdenType", burdenType, App.ComparisonBurdenTypes || []) + "</div>";
        if (burdenType === "custom") {
          html += '<label class="check"><input type="checkbox" data-path="' + p +
            'customExclusiveBurden" data-kind="bool"' + (e.customExclusiveBurden !== false ? " checked" : "") +
            ">기존 회사 전속 비교에서 회사 부담으로 계산</label>";
        }
        html += '<button type="button" class="btn danger" data-action="remove-employee" data-index="' + i + '">삭제</button>';
      }
      html += "</div></details>";
      html += empIncentiveRowHtml(e, i, linked, ui);
    });
    if (!(state.employees || []).length) html += '<div class="cost-empty muted small">직원이 없습니다.</div>';
    if (!opts.noWrap) html += "</div>";
    return html;
  }

  function renderRecurringAccordions(state, ui, groupId, opts) {
    opts = opts || {};
    var start = state.profile.startMonth;
    var end = state.profile.endMonth;
    var html = opts.noWrap ? "" : ('<div class="cost-list">' + costListCols());
    var count = 0;
    (state.recurringExpenses || []).forEach(function (item, i) {
      if (App.Defaults && App.Defaults.isRetiredRecurringExpense && App.Defaults.isRetiredRecurringExpense(item)) return;
      var cat = recExpenseGroupId(item);
      if (groupId && cat !== groupId) return;
      count += 1;
      var key = costItemKey("recurringExpenses", item, i);
      var included = item.include !== false;
      var rent2fLinked = isRent2fRecurring(item);
      var ov = overrideCount(item);
      var p = "recurringExpenses." + i + ".";
      var labels = costFamilyAccount("recurring", { groupId: cat });
      var period = recurringPeriodCellText(item);
      if (rent2fLinked) period += " · 임대료 탭 연동";
      html += '<details class="cost-item' + (included ? "" : " off") + '" data-cost-item="' + esc(key) + '"' +
        (isItemOpen(ui, key) ? " open" : "") + ">";
      html += '<summary><div class="cost-row cost-row-list">';
      html += costSummaryCells({
        key: key,
        family: labels.family,
        account: labels.account,
        name: item.name || "운영비",
        amountHtml: recurringAmountInnerHtml(item, start, end),
        unit: ov ? "변동" : "월",
        period: period,
        status: includeLabel(included)
      });
      html += "</div></summary>";
      html += '<div class="cost-item-body">';
      if (rent2fLinked) {
        html += '<p class="muted small">이 항목은 비용 &gt; 임대료(2층) 정보 탭의 월 임대료와 연동됩니다. 포함 항목은 별도 비용으로 합산하지 않습니다.</p>';
        html += '<button type="button" class="btn" data-action="goto-rent2f">임대료(2층) 탭 보기</button>';
      }
      html += '<div class="row-fields">';
      html += '<div class="field"><label>항목명</label>' + textInput(p + "name", item.name) + "</div>";
      html += '<div class="field"><label>구분</label>' + selectInput(p + "category", item.category || "sga", App.OpexGroups) + "</div>";
      html += '<div class="field"><label>월 금액</label>' + moneyInput(p + "amount", item.amount) + "</div>";
      html += '<div class="field"><label class="check"><input type="checkbox" data-path="' + p +
        'include" data-kind="bool"' + (included ? " checked" : "") + ">포함</label></div>";
      html += "</div>";
      html += renderPeriodMode(p, item, start, end);
      html += '<div class="cost-ov-block"><div class="small">특정 월만 다르게 · 0원이면 해당 월 제외</div>';
      var keys = Object.keys(item.overrides || {}).sort();
      if (keys.length) {
        html += '<p class="muted small">기본 월 금액은 ' + esc(App.Format.formatWon(item.amount)) +
          "이지만, 아래 " + keys.length + "개월은 override 금액으로 대체됩니다. 분석 &gt; 월별 분석에는 이 override가 실제 반영된 값으로 표시됩니다.</p>";
        html += '<table class="cost-ov"><thead><tr><th>월</th><th class="num">금액</th><th></th></tr></thead><tbody>';
        keys.forEach(function (m) {
          html += "<tr><td>" + esc(yyMonth(m)) + '</td><td class="num">' + App.Format.formatWon(item.overrides[m]) +
            '</td><td><button type="button" class="btn danger" data-action="remove-override" data-index="' + i +
            '" data-month="' + esc(m) + '">삭제</button></td></tr>';
        });
        html += "</tbody></table>";
      }
      html += '<div class="inline cost-ov-add">';
      html += compactMonthLoose('data-override-month="' + i + '"', "", "월");
      html += withUnit('<input type="text" placeholder="금액" inputmode="numeric" data-kind="money" data-override-amount="' + i + '">', "원");
      html += '<button type="button" class="btn" data-action="add-override" data-index="' + i + '">+ Override</button>';
      html += "</div></div>";
      html += '<div class="field"><label>메모</label><textarea data-path="' + p + 'note">' + esc(item.note || "") + "</textarea></div>";
      html += '<button type="button" class="btn danger" data-action="remove-recurring" data-index="' + i + '">삭제</button>';
      html += "</div></details>";
    });
    if (!count) html += '<div class="cost-empty muted small">항목이 없습니다.</div>';
    if (!opts.noWrap) html += "</div>";
    return html;
  }

  function renderInflowAccordions(state, ui, opts) {
    opts = opts || {};
    var start = state.profile.startMonth;
    var kinds = [
      { id: "depositReturn", label: "보증금 반환" },
      { id: "other", label: "기타 현금" }
    ];
    var html = opts.noWrap ? "" : ('<div class="cost-list">' + costListCols());
    (state.otherInflows || []).forEach(function (item, i) {
      var key = costItemKey("otherInflows", item, i);
      var included = item.include !== false;
      var p = "otherInflows." + i + ".";
      var kindLabel = (kinds.filter(function (k) { return k.id === (item.kind || "other"); })[0] || kinds[1]).label;
      var labels = costFamilyAccount("inflow", { kindLabel: kindLabel });
      html += '<details class="cost-item' + (included ? "" : " off") + '" data-cost-item="' + esc(key) + '"' +
        (isItemOpen(ui, key) ? " open" : "") + ">";
      html += '<summary><div class="cost-row cost-row-list">';
      html += costSummaryCells({
        key: key,
        family: labels.family,
        account: labels.account,
        name: item.name || "입금",
        amount: App.Format.formatWon(item.amount),
        unit: "1회",
        period: yyMonth(item.month || start),
        status: includeLabel(included)
      });
      html += "</div></summary>";
      html += '<div class="cost-item-body">';
      html += '<div class="row-fields">';
      html += '<div class="field"><label>항목</label>' + textInput(p + "name", item.name) + "</div>";
      html += '<div class="field"><label>금액</label>' + moneyInput(p + "amount", item.amount) + "</div>";
      html += '<div class="field"><label>월</label>' + compactMonthInput(p + "month", item.month || start) + "</div>";
      html += '<div class="field"><label>종류</label>' + selectInput(p + "kind", item.kind || "other", kinds) + "</div>";
      html += "</div>";
      html += '<button type="button" class="btn danger" data-action="remove-inflow" data-index="' + i + '">삭제</button>';
      html += "</div></details>";
    });
    if (!opts.noWrap && !(state.otherInflows || []).length) html += '<div class="cost-empty muted small">항목이 없습니다.</div>';
    if (!opts.noWrap) html += "</div>";
    return html;
  }

  function autoSupportMonthlyAmount(p, state) {
    var share = App.Money.toRatio(p.soloCompanyShareRate != null ? p.soloCompanyShareRate : 1);
    return App.Money.roundWon((App.Engine.supportPolicyMonthlyAmount(p, state) || 0) * share);
  }

  function renderAutoSupportRows(list, state, account) {
    var html = "";
    var labels = costFamilyAccount(account === "차량비" ? "vehicle" : "actor");
    (list || []).forEach(function (p) {
      if (p.include !== true) return;
      html += '<div class="cost-item support-readonly">';
      html += '<div class="cost-row cost-row-list">';
      html += costSummaryCells({
        family: labels.family,
        account: labels.account,
        name: p.name || "회사 지원",
        amount: App.Format.formatWon(autoSupportMonthlyAmount(p, state)),
        unit: "월",
        period: "전체기간",
        status: "포함",
        chevron: false
      });
      html += "</div></div>";
    });
    if (!html) html = '<div class="cost-empty muted small">포함 항목 없음</div>';
    return html;
  }

  function renderAutoSupportList(list, state, account, opts) {
    opts = opts || {};
    if (opts.noWrap) return renderAutoSupportRows(list, state, account);
    return '<div class="cost-list">' + costListCols() + renderAutoSupportRows(list, state, account) + "</div>";
  }

  function renderCostTabEditableSupportRows(entries, state, ui, account) {
    var labels = costFamilyAccount(account === "차량비" ? "vehicle" : "actor");
    var html = "";
    (entries || []).forEach(function (entry) {
      var item = entry.item;
      var i = entry.index;
      var key = "supportPolicies:" + ((item && item.id) || String(i));
      var included = item.include === true || item.included === true;
      var p = "settings.supportPolicies." + i + ".";
      var mode = item.calcMode || "monthlyFixed";
      var period = App.Month.usesCustomPeriod(item) ? periodText(item.startMonth, item.endMonth) : "시뮬레이션 전체";
      html += '<details class="cost-item' + (included ? "" : " off") + '" data-cost-item="' + esc(key) + '"' +
        (isItemOpen(ui, key) ? " open" : "") + ">";
      html += '<summary><div class="cost-row cost-row-list">';
      html += costSummaryCells({
        family: labels.family,
        account: labels.account,
        name: item.name || "지원 항목",
        amount: App.Format.formatWon(autoSupportMonthlyAmount(item, state)),
        unit: "월",
        period: period,
        statusHtml: supportDeleteButton("remove-support-policy", 'data-index="' + i + '"')
      });
      html += "</div></summary>";
      html += '<div class="cost-item-body">';
      html += '<div class="row-fields">';
      html += '<div class="field"><label>항목명</label>' + textInput(p + "name", item.name, 'placeholder="지원 항목"') + "</div>";
      html += '<div class="field"><label>계산 방식</label>' + selectInput(p + "calcMode", mode, supportCalcModeOptions()) + "</div>";
      html += '<div class="field"><label>금액 ' + esc(supportAmountHint(mode)) + "</label>" +
        moneyInput(p + "unitAmount", item.unitAmount) + "</div>";
      if (supportShowsQuantity(mode, item)) {
        html += '<div class="field"><label>' + esc(supportQuantityLabel(mode, item)) + "</label>" +
          withUnit(textInput(p + "quantity", item.quantity, 'data-kind="count"'),
            supportQuantityUnit(mode, item)) + "</div>";
      }
      html += '<div class="field"><label class="check"><input type="checkbox" data-path="' + p +
        'include" data-kind="bool"' + (included ? " checked" : "") + ">포함</label></div>";
      html += "</div>";
      html += '<p class="muted small">원본은 시뮬레이션 설정 &gt; 회사 지원입니다. 여기서 금액과 포함 여부를 바로 수정할 수 있습니다.</p>';
      html += "</div></details>";
    });
    return html;
  }

  function mealCalendarModeLabel(mode) {
    var found = {
      weekdaysExcludingHolidays: "평일 + 공휴일 제외",
      weekdays: "월~금",
      allDays: "모든 날짜",
      custom: "사용자 지정 요일"
    }[mode];
    return found || "평일 + 공휴일 제외";
  }

  function calcLine(label, valueText, opts) {
    opts = opts || {};
    return '<div class="tax-line' + (opts.hl ? " hl" : "") + '"><span>' + esc(label) +
      "</span><b>" + esc(valueText) + "</b></div>";
  }

  function renderWelfareSection(state, result, ui) {
    var meal = (state.settings && state.settings.meal) || {};
    var row = (result && result.months && result.months[0]) || {};
    var welfareAmt = row.meal || 0;
    var baseAmt = row.mealBaseAmount || 0;
    var extraAmt = row.mealExtraAmount != null ? row.mealExtraAmount : (App.Defaults.mealExtraAmount ? App.Defaults.mealExtraAmount(baseAmt, state) : 0);
    var extraRate = row.mealExtraRate != null ? row.mealExtraRate : (App.Defaults.mealExtraRate ? App.Defaults.mealExtraRate(state) : 0.5);
    var multiplier = row.welfareMultiplier || (App.Defaults.welfareMultiplier ? App.Defaults.welfareMultiplier(state) : 2);
    var bufferedAmt = App.Money.roundWon(baseAmt + extraAmt);
    var body = '<div class="cost-item-body meal-body">';
    body += '<div class="row-fields meal-fields">';
    body += '<div class="field"><label>1인 1일 식대</label>' + moneyInput("settings.meal.dailyRate", meal.dailyRate) + "</div>";
    body += '<div class="field"><label>직원 외 추가 인원</label>' + withUnit(textInput("mealExtraHeadcount", state.mealExtraHeadcount, 'data-kind="number"'), "명") + "</div>";
    body += '<div class="field"><label>계산 기준</label>' + selectInput("settings.meal.calendarMode", meal.calendarMode, [
      { id: "weekdaysExcludingHolidays", label: "평일 + 공휴일 제외" },
      { id: "weekdays", label: "월~금" },
      { id: "allDays", label: "모든 날짜" },
      { id: "custom", label: "사용자 지정 요일" }
    ]) + "</div>";
    body += '<div class="field"><label>회식·야근 여유</label>' + percentInput("settings.meal.extraRate", pctView(extraRate), 'data-kind="percent"') + "</div>";
    body += "</div>";
    body += '<div class="tax-summary-mini cost-calc">';
    body += calcLine("1인 1일 식대", App.Format.formatWon(row.mealDailyRate != null ? row.mealDailyRate : meal.dailyRate));
    body += calcLine("대상 인원", (row.mealHeadcount || 0) + "명");
    body += calcLine("계산 기준", mealCalendarModeLabel(meal.calendarMode));
    body += calcLine("월 식대 산출액", App.Format.formatWon(baseAmt));
    body += calcLine("회식·야근 여유 +" + pctView(extraRate) + "%", App.Format.formatWon(extraAmt));
    body += calcLine("여유 포함 식대", App.Format.formatWon(bufferedAmt));
    body += calcLine("복리후생 배율", "× " + multiplier);
    body += calcLine("최종 복리후생비", App.Format.formatWon(welfareAmt), { hl: true });
    body += "</div>";
    body += '<p class="muted small">기준월: ' + esc(App.Format.formatMonthIso(row.month) || "-") +
      " · 평일 식대에 회식·야근 여유를 더한 뒤 × " + multiplier + "로 복리후생비를 잡습니다. 식대 자체는 계산 근거일 뿐 별도로 비용에 반영되지 않습니다.</p>";
    body += '<p class="muted small">식대는 월별 근무일수에 따라 자동 계산되므로, 실제 월별 금액은 달라질 수 있습니다. 옆에 보이는 금액은 시뮬레이션 첫 달(' +
      esc(App.Format.formatMonthIso(row.month) || "-") + ') 기준입니다. 월별 실제 금액은 분석 &gt; 월별 분석에서 확인합니다.</p>';
    body += "</div>";
    var labels = costFamilyAccount("welfare");
    var list = '<details class="cost-item" data-cost-item="welfare:meal"' +
      (isItemOpen(ui, "welfare:meal") ? " open" : "") + ">";
    list += '<summary><div class="cost-row cost-row-list">';
    list += costSummaryCells({
      family: labels.family,
      account: labels.account,
      name: "식대(" + (App.Format.formatMonthIso(row.month) || "기준월") + ")",
      amount: App.Format.formatWon(welfareAmt),
      unit: "월·변동",
      period: "전체기간",
      status: "자동계산"
    });
    list += "</div></summary>";
    list += body;
    list += "</details>";
    return renderCostSection({
      id: "welfare",
      title: "복리후생비",
      amount: App.Format.formatWon(welfareAmt),
      unit: "월·변동",
      period: "식대 + 회식·야근 " + pctView(extraRate) + "% × " + multiplier,
      extraClass: "cost-sec-child cost-sec-flat cost-sec-group",
      open: isSecOpen(ui, "welfare"),
      body: list
    });
  }

  function setComputedText(root, sel, text) {
    root.querySelectorAll(sel).forEach(function (el) { el.textContent = text; });
  }

  function setComputedHtml(root, sel, html) {
    root.querySelectorAll(sel).forEach(function (el) { el.innerHTML = html; });
  }

  function patchCosts(root, state) {
    if (!root || !root.querySelector(".view-costs")) return;
    var start = state.profile.startMonth;
    setComputedText(root, '[data-computed="cost-sec"][data-sec="startup"]',
      costGrandTotalText(state.startupExpenses, (state.settings && state.settings.corporateStatus) || "new"));
    setComputedText(root, '[data-computed="cost-sec"][data-sec="deposits"]', lineSecText(fundingDepositRows(state)));
    setComputedText(root, '[data-computed="cost-sec"][data-sec="assets"]', lineSecText(state.assets));
    setComputedText(root, '[data-computed="cost-sec-amt"][data-sec="payroll"]',
      App.Format.formatWon(salarySum(state.employees)));
    setComputedText(root, '[data-computed="cost-sec-unit"][data-sec="payroll"]', "월");
    setComputedText(root, '[data-computed="cost-sec"][data-sec="payroll"]', "조직 설정 연동");
    setComputedText(root, '[data-computed="cost-sec"][data-sec="sga-parent"]', "");
    ["rent", "marketing", "sga"].forEach(function (gid) {
      var parts = recGroupSummaryParts(state.recurringExpenses, gid, state);
      setComputedText(root, '[data-computed="cost-sec-amt"][data-sec="recurring-' + gid + '"]', parts.amount);
      setComputedText(root, '[data-computed="cost-sec-unit"][data-sec="recurring-' + gid + '"]', parts.unit);
      setComputedText(root, '[data-computed="cost-sec"][data-sec="recurring-' + gid + '"]', parts.period);
    });
    setComputedText(root, '[data-computed="cost-sec"][data-sec="inflows"]', "합계 " + App.Format.formatWon(inflowSum(state.otherInflows)));

    function patchItem(key, included, fields) {
      var details = root.querySelector('[data-cost-item="' + key + '"]');
      if (details) details.classList.toggle("off", included === false);
      Object.keys(fields).forEach(function (name) {
        setComputedText(root, '[data-computed="cost-' + name + '"][data-item="' + key + '"]', fields[name]);
      });
    }

    (state.startupExpenses || []).forEach(function (row, i) {
      var key = costItemKey("startupExpenses", row, i);
      var corp = (state.settings && state.settings.corporateStatus) || "new";
      var effective = App.Engine.isEffectiveLineIncluded(row, corp);
      var mutedByStatus = row.include !== false && !effective;
      patchItem(key, effective, {
        name: row.name || "항목",
        amt: App.Format.formatWon(lineDisplayAmount(row)),
        est: App.Format.formatWon(lineEstimatedAmount(row)),
        period: foundingMonthFace(row, start),
        flag: mutedByStatus ? "미반영" : includeLabel(effective)
      });
    });
    (state.deposits || []).forEach(function (row, i) {
      var key = costItemKey("deposits", row, i);
      patchItem(key, row.include !== false, {
        name: row.name || "항목",
        amt: App.Format.formatWon(lineDisplayAmount(row)),
        period: foundingMonthFace(row, start),
        return: row.expectedReturnMonth || "미정",
        flag: includeLabel(row.include !== false)
      });
    });
    (state.assets || []).forEach(function (row, i) {
      var key = costItemKey("assets", row, i);
      patchItem(key, row.include !== false, {
        name: row.name || "항목",
        amt: App.Format.formatWon(lineDisplayAmount(row)),
        period: foundingMonthFace(row, start),
        flag: includeLabel(row.include !== false)
      });
    });
    (state.otherOneTimeExpenses || []).forEach(function (row, i) {
      var key = costItemKey("otherOneTimeExpenses", row, i);
      patchItem(key, row.include !== false, {
        name: row.name || "항목",
        amt: App.Format.formatWon(lineDisplayAmount(row)),
        period: yyMonth(row.month || start),
        flag: includeLabel(row.include !== false)
      });
    });
    (state.employees || []).forEach(function (e, i) {
      var key = costItemKey("employees", e, i);
      patchItem(key, e.include !== false, {
        name: empTitle(e, true),
        amt: empAmountCellText(e),
        period: itemPeriodLabel(e)
      });
      if (empIncentive(e)) {
        patchItem(empIncentiveKey(e, i), e.include !== false, {
          name: empIncentiveTitle(e),
          amt: App.Format.formatWon(empIncentive(e)),
          period: itemPeriodLabel(e)
        });
      }
    });
    (state.recurringExpenses || []).forEach(function (item, i) {
      var key = costItemKey("recurringExpenses", item, i);
      var ov = overrideCount(item);
      var end = state.profile.endMonth;
      patchItem(key, item.include !== false, {
        name: item.name || "운영비",
        period: recurringPeriodCellText(item),
        unit: ov ? "변동" : "월",
        flag: includeLabel(item.include !== false)
      });
      setComputedHtml(root, '[data-computed="cost-amt"][data-item="' + key + '"]',
        recurringAmountInnerHtml(item, start, end));
    });
    (state.otherInflows || []).forEach(function (item, i) {
      var key = costItemKey("otherInflows", item, i);
      var kindLabel = item.kind === "depositReturn" ? "보증금 반환" : "기타 현금";
      patchItem(key, item.include !== false, {
        name: item.name || "입금",
        amt: App.Format.formatWon(item.amount),
        period: yyMonth(item.month || start),
        cat: kindLabel
      });
    });
  }

  function revenueGapOf(state, result) {
    if (result && result.revenueGap) return result.revenueGap;
    return App.Engine.explainRevenueGap(state);
  }

  function projectExpenseGapOf(state, result) {
    if (result && result.projectExpenseGap) return result.projectExpenseGap;
    return App.Engine.explainProjectExpenseGap(state);
  }

  function renderRevenueGapBanner(gap, heading) {
    if (!gap || !gap.hasIssues) return "";
    var html = '<div class="banner recon-banner">';
    html += "<b>" + esc(heading || "등록 매출과 기간 입금이 다릅니다") + "</b>";
    html += '<div class="recon-lines">';
    html += "<div>등록 계약금액 <b>" + App.Format.formatWon(gap.registered) + "</b></div>";
    html += "<div>기간 내 입금 <b>" + App.Format.formatWon(gap.inPeriod) + "</b></div>";
    if (gap.before) {
      html += "<div>기간 이전 <b>" + App.Format.formatWon(gap.before) + "</b></div>";
    }
    if (gap.after) {
      html += "<div>기간 이후 <b>" + App.Format.formatWon(gap.after) + "</b></div>";
    }
    html += '<div class="' + (gap.gap ? "recon-gap" : "") + '">차이 <b>' +
      App.Format.formatWon(gap.gap) + "</b></div>";
    html += "</div>";
    if ((gap.issueItems || []).length) {
      html += '<ul class="warn-list">';
      gap.issueItems.forEach(function (item) {
        (item.issues || []).forEach(function (issue) {
          if (issue.severity !== "bad" && issue.severity !== "warn") return;
          html += "<li>" + esc(item.name) + " — " + esc(issue.text) + "</li>";
        });
      });
      html += "</ul>";
    }
    html += "</div>";
    return html;
  }

  function renderProjectExpenseGapBanner(gap) {
    if (!gap || !gap.hasIssues) return "";
    var html = '<div class="banner recon-banner">';
    html += "<b>월별 분석 프로젝트 진행비가 등록 수익의 총 진행비와 다릅니다</b>";
    html += '<div class="recon-lines">';
    html += "<div>등록 총 진행비 <b>" + App.Format.formatWon(gap.registered) + "</b></div>";
    html += "<div>월별 분석 반영 <b>" + App.Format.formatWon(gap.inPeriod) + "</b></div>";
    if (gap.before) html += "<div>기간 이전 <b>" + App.Format.formatWon(gap.before) + "</b></div>";
    if (gap.after) html += "<div>기간 이후 <b>" + App.Format.formatWon(gap.after) + "</b></div>";
    html += '<div class="' + (gap.gap ? "recon-gap" : "") + '">차이 <b>' +
      App.Format.formatWon(gap.gap) + "</b></div>";
    html += "</div>";
    if ((gap.issueItems || []).length) {
      html += '<ul class="warn-list">';
      gap.issueItems.forEach(function (item) {
        (item.issues || []).forEach(function (issue) {
          if (issue.severity !== "bad" && issue.severity !== "warn") return;
          html += "<li>" + esc(item.name) + " — " + esc(issue.text) + "</li>";
        });
      });
      html += "</ul>";
    }
    html += "</div>";
    return html;
  }

  function projectExpenseRowGapItem(row, gap) {
    if (!gap || !gap.byId || !row || !row.id) return null;
    var id = String(row.id || "");
    if (id.indexOf("pexp-") === 0) return gap.byId["project:" + id.slice(5)] || null;
    return null;
  }

  function formatDashMoney(value) {
    var n = App.Money.roundWon(value);
    var abs = Math.abs(n);
    var sign = n < 0 ? "-" : "";
    if (!abs) return "0원";
    if (abs >= 100000000) {
      var eok = abs / 100000000;
      var text = eok >= 100 ? eok.toFixed(0) : eok.toFixed(2);
      text = text.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
      return sign + text + "억";
    }
    if (abs >= 10000) {
      return sign + Math.round(abs / 10000).toLocaleString("ko-KR") + "만";
    }
    return App.Format.formatWon(n);
  }

  function dashLedgerGroup(result, id) {
    return ((result && result.ledger && result.ledger.groups) || []).filter(function (g) {
      return g.id === id;
    })[0];
  }

  function groupTotalAmount(group) {
    return group && group.subtotal ? App.Money.roundWon(group.subtotal.total) : 0;
  }

  function dashMetric(label, amount, cls) {
    return '<div class="dash-metric' + (cls ? " " + cls : "") + '"><span>' + esc(label) +
      "</span><b title=\"" + esc(App.Format.formatWon(amount)) + '">' +
      esc(formatDashMoney(amount)) + "</b></div>";
  }

  function renderSavedLoadGate(state) {
    var seed = (App.Sample && App.Sample.load) ? App.Sample.load() : state;
    var p = (seed && seed.profile) || {};
    var title = (seed.meta && (seed.meta.title || seed.meta.label)) || p.actorName || "최종 예산안";
    var period = (App.Format.formatMonthIso(p.startMonth) || p.startMonth || "") +
      " ~ " + (App.Format.formatMonthIso(p.endMonth) || p.endMonth || "");
    var html = '<div class="view-dashboard dash-load-screen">';
    html += '<div class="dash-load-card">';
    html += "<h2>저장된 값 불러오기</h2>";
    html += '<p class="muted">' + esc(title) + (period.trim() !== "~" ? " · " + esc(period) : "") +
      " 최종 예산안을 불러옵니다.</p>";
    html += '<div class="dash-load-actions">';
    html += '<button type="button" class="btn primary" data-action="load-saved">저장된 값 불러오기</button>';
    html += '<button type="button" class="btn" data-action="import">JSON 파일에서 가져오기</button>';
    html += '<button type="button" class="btn btn-quiet" data-action="dismiss-saved-load">이 화면으로 계속</button>';
    html += "</div>";
    var budgets = (App.Store && App.Store.listBudgets) ? App.Store.listBudgets() : [];
    if (budgets.length) {
      html += '<div class="dash-load-local">';
      html += '<p class="muted small">이 브라우저에 저장된 예산안</p>';
      budgets.slice(0, 5).forEach(function (b) {
        html += '<button type="button" class="btn dash-load-local-item" data-action="switch-budget" data-id="' +
          esc(b.id) + '">' + esc(b.name || "이름 없음") +
          '<span class="muted small">' + esc(budgetPeriodLabel(b)) + "</span></button>";
      });
      html += "</div>";
    }
    html += "</div></div>";
    return html;
  }

  function renderDashboard(state, result, ui) {
    if (ui && ui.savedLoadOpen) {
      return renderSavedLoadGate(state);
    }
    var k = result.kpis;
    var gap = revenueGapOf(state, result);
    var html = '<div class="view-dashboard">';
    html += renderRevenueGapBanner(gap);
    var skipPayCodes = {
      payment_short: true,
      payment_over: true,
      payment_before_period: true,
      payment_after_period: true
    };
    var extraWarn = (result.warnings || []).filter(function (w) {
      return !(gap && gap.hasIssues && skipPayCodes[w.code]);
    });
    if (extraWarn.length) {
      html += '<div class="banner"><b>확인</b><ul class="warn-list">';
      extraWarn.forEach(function (w) { html += "<li>" + esc(w.message) + "</li>"; });
      html += "</ul></div>";
    }
    html += renderDashHero(result);
    html += '<p class="muted small">기본 시드는 법인 설립·운영 예산 엑셀을 그대로 옮겨 둔 틀입니다. 배우명과 작품만 바꿔도 설립비·인건비·사무실·차량 구조는 같이 쓸 수 있습니다.</p>';

    html += '<div class="dash-split">';
    var cogsG = dashLedgerGroup(result, "cogs-total");
    var grossG = dashLedgerGroup(result, "gross-profit");
    var sgaG = dashLedgerGroup(result, "opex-sga-parent");
    html += '<div class="card"><h2>손익계산서 (1배 기준)</h2>';
    html += '<p class="muted small">전체 기간 누적, 굵직한 계정과목 소계만 반영합니다. 상세는 분석 &gt; 월별 분석에서 확인합니다.</p>';
    html += scenarioBlockLine("총매출", k.revenue, { plus: true });
    html += scenarioBlockLine("매출원가", groupTotalAmount(cogsG), { cost: true });
    html += scenarioBlockLine("매출총이익", groupTotalAmount(grossG), { subtotal: true });
    html += scenarioBlockLine("판관비", groupTotalAmount(sgaG), { cost: true });
    html += scenarioBlockLine("영업이익", k.operatingProfit, { subtotal: true });
    html += scenarioBlockLine("법인세", k.tax, { cost: true });
    html += scenarioBlockLine("세후이익", k.profitAfterTax, { total: true });
    html += "</div>";

    var cmp = App.Engine.runScenarioComparison(state, result);
    var soloEV = App.Money.roundWon(cmp.scenarios.soloAgency.controlledEconomicValue);
    var exEV = App.Money.roundWon(cmp.scenarios.exclusiveContract.controlledEconomicValue);
    var evDelta = App.Money.roundWon(cmp.deltas.controlledEconomicValue);
    html += '<div class="card"><h2>1인 기획사 vs 기존 회사 전속</h2>';
    html += '<p class="muted small">같은 매출 기준, 지금 시점 경제가치 비교입니다. 상세 산식은 분석 &gt; 시나리오 비교에서 확인합니다.</p>';
    html += '<div class="dash-metrics">';
    html += dashMetric("1인 기획사 경제가치", soloEV, "hero" + (evDelta >= 0 ? " good" : ""));
    html += dashMetric("기존 회사 전속 경제가치", exEV);
    html += dashMetric("차이(1인 − 전속)", evDelta, evDelta >= 0 ? "good" : "bad");
    html += "</div></div></div>";
    return html;
  }

  function simStatusText(state, months) {
    return "기간 " + months.length + "개월 · 최초 보유현금 " + App.Format.formatWon(state.profile.initialCash) +
      " · 최소 안전잔액 " + App.Format.formatWon(state.profile.safetyCash);
  }

  function simTabId(ui) {
    var tab = (ui && ui.simTab) || "basics";
    if (tab === "opex") return "basics";
    if (tab === "org" || tab === "support" || tab === "fees" || tab === "tax" || tab === "settings") return tab;
    return "basics";
  }

  function renderSimTabs(tab) {
    var html = '<div class="cost-tabs sim-tabs">';
    [
      { id: "basics", label: "기본 설정" },
      { id: "org", label: "조직·인건비" },
      { id: "support", label: "회사 지원" },
      { id: "fees", label: "수수료·정책" },
      { id: "tax", label: "세금·비교조건" },
      { id: "settings", label: "설정" }
    ].forEach(function (t) {
      html += '<button type="button" class="' + (tab === t.id ? "active" : "") +
        '" data-action="sim-tab" data-tab="' + t.id + '">' + esc(t.label) + "</button>";
    });
    html += "</div>";
    return html;
  }

  function renderSimBasics(state, result) {
    var p = state.profile;
    var months = (result && result.months && result.months.length)
      ? result.months.map(function (r) { return r.month; })
      : App.Engine.resolveSimulationPeriod(state).months;
    var corp = (state.settings && state.settings.corporateStatus) || "new";
    var html = '<div class="card sim-compact"><h2>기본정보</h2><div class="sim-grid-3">';
    html += '<div class="field"><label>배우명</label>' + textInput("profile.actorName", p.actorName) + "</div>";
    html += '<div class="field"><label>법인명</label>' + textInput("profile.companyName", p.companyName) + "</div>";
    html += '<div class="field"><label>법인 상태</label>' +
      selectInput("settings.corporateStatus", corp, [
        { id: "new", label: "신규 설립" },
        { id: "existing", label: "기존 법인" }
      ]) + "</div>";
    html += "</div></div>";

    html += '<div class="card sim-compact"><h2>시뮬레이션 기간</h2><div class="sim-grid-3">';
    html += '<div class="field"><label>시작월</label>' + monthInput("profile.startMonth", p.startMonth) + "</div>";
    html += '<div class="field"><label>종료월</label>' + monthInput("profile.endMonth", p.endMonth) + "</div>";
    html += '<div class="field"><label>총 기간</label><div class="readonly" data-computed="sim-months">' +
      months.length + "개월</div></div>";
    html += "</div>";
    html += '<p class="muted small">모든 월 반복 항목은 별도 기간 예외가 없는 한 이 기간 전체에 적용됩니다. 초기비용·보증금·자산은 항목에서 월을 직접 바꾸지 않으면 시작월에 반영됩니다.</p></div>';

    html += '<div class="card sim-compact"><h2>초기 자금</h2><div class="sim-grid-3">';
    html += '<div class="field"><label>최초 보유현금</label>' + moneyInput("profile.initialCash", p.initialCash) + "</div>";
    html += '<div class="field"><label>최소 안전잔액</label>' + moneyInput("profile.safetyCash", p.safetyCash) + "</div>";
    html += '<div class="field"><label>최초현금 시점</label>' +
      selectInput("settings.initialCashTiming", state.settings.initialCashTiming, [
        { id: "beforeOutflows", label: "설립·보증금 지출 전" },
        { id: "afterOutflows", label: "설립·보증금 지출 후" }
      ]) + "</div>";
    html += "</div><p class=\"muted small\">" +
      (corp === "existing"
        ? "이미 설립된 법인을 기준으로 하며 등록면허세·법무사 설립비 등 설립 관련 비용은 기본적으로 반영하지 않습니다."
        : "시뮬레이션 시작 시 법인을 새로 설립하는 것으로 보고 설립 관련 초기비용을 반영합니다.") +
      " 월초 숫자는 항상 최초 보유현금입니다. 지출 후를 고르면 시작월 설립/보증금/자산만 현금흐름에서 빼지 않습니다.</p></div>";
    return html;
  }

  function renderStaffMealCard(state, result) {
    var meal = (state.settings && state.settings.meal) || {};
    var extra = App.Money.toSafeNumber(state.mealExtraHeadcount);
    var first = result && result.months && result.months[0];
    var staff, head;
    if (first) {
      head = App.Money.toSafeNumber(first.mealHeadcount);
      staff = Math.max(0, head - extra);
    } else {
      staff = 0;
      (state.employees || []).forEach(function (e) {
        if (e && e.include !== false && e.meal) staff += 1;
      });
      head = staff + extra;
    }
    var monthly = first ? App.Money.roundWon(first.meal) : 0;
    var extraRate = (meal.extraRate != null && meal.extraRate !== "")
      ? meal.extraRate
      : (App.Defaults.mealExtraRate ? App.Defaults.mealExtraRate(state) : 0.5);
    var html = '<div class="card sim-compact"><h2>직원 식대</h2>';
    html += '<p class="muted small">조직 인원 × 근무일 기준입니다. 작품이 없는 달과 영업일에도 나갑니다. 회식·야근 여유를 더한 뒤 복리후생비로 반영됩니다. 배우 활동 식대와는 별개이며, 비용 &gt; 운영비 판관비에 자동 반영됩니다.</p>';
    html += '<div class="sim-grid-3">';
    html += '<div class="field"><label>1인 1일 식대</label>' + moneyInput("settings.meal.dailyRate", meal.dailyRate) + "</div>";
    html += '<div class="field"><label>직원 외 추가 인원</label>' + withUnit(textInput("mealExtraHeadcount", state.mealExtraHeadcount, 'data-kind="number"'), "명") + "</div>";
    html += '<div class="field"><label>계산 기준</label>' + selectInput("settings.meal.calendarMode", meal.calendarMode, [
      { id: "weekdaysExcludingHolidays", label: "평일 + 공휴일 제외" },
      { id: "weekdays", label: "월~금" },
      { id: "allDays", label: "모든 날짜" },
      { id: "custom", label: "사용자 지정 요일" }
    ]) + "</div>";
    html += '<div class="field"><label>회식·야근 여유</label>' + percentInput("settings.meal.extraRate", pctView(extraRate), 'data-kind="percent"') + "</div>";
    html += "</div>";
    html += '<div class="sim-meal-sum">';
    html += "<span>대상 직원 " + staff + "명</span>";
    html += "<span>추가 " + extra + "명</span>";
    html += "<span>합계 " + head + "명</span>";
    html += "<b>월 복리후생비 " + App.Format.formatWon(monthly) + "</b>";
    html += "</div>";
    html += '<p class="muted small">월 식대 산출액 = 단가 × (식대 직원 수 + 추가인원) × 실적용 근무일. 여기에 회식·야근 여유 ' +
      pctView(extraRate) + '%를 더한 뒤 복리후생 배율을 곱합니다. 위 월 금액은 시뮬레이션 첫 달 기준입니다.</p></div>';
    return html;
  }

  function renderSimOrg(state, result, ui) {
    var html = '<div class="card sim-compact sim-org-card">';
    html += '<div class="section-title"><h2>인건비</h2><button type="button" class="btn" data-action="add-employee">+ 직원</button></div>';
    html += '<p class="muted small">대표·본부장·실무진을 직원 단위로 등록합니다. 같은 직급이 여러 명이면 행을 추가하세요. 인원 합산 필드는 두지 않고 기존 직원 데이터를 그대로 씁니다.</p>';
    html += renderEmployeeAccordions(state, ui || {});
    html += "</div>";
    html += renderStaffMealCard(state, result);
    return html;
  }

  function renderSimulation(state, result, ui) {
    var tab = simTabId(ui);
    var months = (result && result.months && result.months.length)
      ? result.months.map(function (r) { return r.month; })
      : App.Engine.resolveSimulationPeriod(state).months;
    var html = '<div class="view-simulation">';
    html += renderSimTabs(tab);
    if (tab === "org") html += renderSimOrg(state, result, ui);
    else if (tab === "support") html += renderSupportPolicies(state, ui);
    else if (tab === "fees") html += renderRevenueFees(state, result);
    else if (tab === "tax") html += renderScenarioSettings(state, result, ui);
    else if (tab === "settings") html += renderSettings(state);
    else html += renderSimBasics(state, result);
    html += '<p class="muted small sim-status" data-computed="sim-status">' + simStatusText(state, months) + "</p>";
    html += "</div>";
    return html;
  }

  function renderRevenue(state, result, ui) {
    var html = '<div class="view-revenue">';
    html += '<div class="setup-split">';
    html += '<div class="setup-main">';
    html += renderRevenuePlan(state, result, ui);
    html += "</div>";
    html += renderConfirmedContracts(state, result);
    html += "</div></div>";
    if (ui && ui.revenueRateHelpOpen) html += renderRevenueRateHelpModal(state);
    return html;
  }

  function feeCategoryOptions() {
    return App.FeeCostCategories || [{ id: "sga", label: "판관비" }, { id: "agency", label: "에이전시 수수료" }];
  }

  function feeCategoryLabel(id) {
    var g = feeCategoryOptions().filter(function (c) { return c.id === id; })[0];
    return g ? g.label : id;
  }

  function revenueScopeOptions() {
    var opts = [
      { id: "totalRevenue", label: "전체 매출" },
      { id: "workRevenue", label: "작품 매출" },
      { id: "salesRevenue", label: "광고/영업 매출" }
    ];
    (App.WorkCategories || []).forEach(function (c) {
      opts.push({ id: "category:" + c.id, label: c.label + "만" });
    });
    (App.SalesCategories || []).forEach(function (c) {
      opts.push({ id: "category:" + c.id, label: c.label + "만" });
    });
    return opts;
  }

  function renderRevenueFees(state, result) {
    var fees = state.revenueFees || [];
    var totals = (result && result.revenueFees && result.revenueFees.totalsByFee) || {};
    var grand = 0;
    var html = '<div class="card sim-compact"><h2>매출 연동 수수료</h2>';
    html += '<p class="muted small">전체 매출(기간 내 예산에 반영되는 입금액) × 수수료율로 자동 계산됩니다. 수수료율이나 매출이 바뀌면 즉시 재계산됩니다.</p>';
    if (!fees.length) {
      html += '<p class="muted">등록된 매출 연동 수수료가 없습니다.</p>';
    } else {
      html += '<div class="scroll"><table><thead><tr><th>명칭</th><th>기준</th><th class="num">수수료율</th><th>비용 분류</th><th>포함</th><th class="num">예상 비용 (원)</th><th></th></tr></thead><tbody>';
      fees.forEach(function (fee, i) {
        var prefix = "revenueFees." + i + ".";
        var included = fee.include !== false;
        var amt = included ? App.Money.roundWon(totals[fee.id]) : 0;
        if (included) grand += amt;
        var pctVal = Math.round(App.Money.toSafeNumber(fee.rate) * 10000) / 100;
        html += "<tr" + (included ? "" : ' class="muted"') + ">";
        html += "<td>" + textInput(prefix + "name", fee.name, 'placeholder="예: 써니스"') + "</td>";
        html += "<td>" + selectInput(prefix + "revenueScope", fee.revenueScope || fee.basis || "totalRevenue", revenueScopeOptions()) + "</td>";
        html += '<td class="num">' + percentInput(prefix + "rate", pctVal, 'data-kind="fee-rate"') + "</td>";
        html += "<td>" + selectInput(prefix + "category", fee.category, feeCategoryOptions()) + "</td>";
        html += '<td><input type="checkbox" data-path="' + esc(prefix + "include") + '" data-kind="bool"' + (included ? " checked" : "") + "></td>";
        html += '<td class="num"><span data-computed="fee-amount" data-fee-id="' + esc(fee.id) + '">' + App.Format.formatWon(amt) + "</span></td>";
        html += '<td><button class="btn danger" data-action="remove-fee" data-index="' + i + '">삭제</button></td>';
        html += "</tr>";
      });
      html += '</tbody><tfoot><tr class="total-row"><td colspan="5">매출 연동 수수료 합계</td>' +
        '<td class="num"><span data-computed="fee-grand">' + App.Format.formatWon(grand) + "</span></td><td></td></tr></tfoot></table></div>";
    }
    html += '<div class="inline" style="margin-top:8px"><button class="btn" data-action="add-fee">+ 수수료 항목</button></div>';
    html += "</div>";
    return html;
  }

  function supportCalcModeOptions() {
    return App.SupportCalcModes || [];
  }

  function supportCostClassOptions() {
    return App.SupportCostClasses || [
      { id: "sga", label: "판관비" },
      { id: "project", label: "프로젝트 직접비" }
    ];
  }

  function supportGroupOptions() {
    return App.SupportPolicyGroups || [];
  }

  function supportAmountHint(mode) {
    if (mode === "perPersonMonth") return "/ 인·월";
    if (mode === "perOccurrence") return "/ 회";
    if (mode === "perProject") return "/ 작품";
    if (mode === "directAmount") return "(기간 합계)";
    return "/ 월";
  }

  function supportShowsQuantity(mode, item) {
    if (item && App.Defaults.isVehicleSupportPolicy(item) && item.id === "sp-vehicle-rent") return true;
    return mode === "perPersonMonth" || mode === "perOccurrence" || mode === "perProject" || mode === "monthlyFixed";
  }

  function supportQuantityLabel(mode, item) {
    if (item && (item.id === "sp-vehicle-rent" || /렌트료/.test(item.name || ""))) return "차량 대수";
    if (mode === "perPersonMonth") return "인원";
    if (mode === "perProject") return "작품 수";
    if (mode === "monthlyFixed") return "수량";
    return "예상 횟수";
  }

  function supportQuantityUnit(mode, item) {
    if (item && (item.id === "sp-vehicle-rent" || /렌트료/.test(item.name || ""))) return "대";
    if (mode === "perPersonMonth") return "명";
    if (mode === "perProject") return "작품";
    if (mode === "monthlyFixed") return "개";
    return "회";
  }

  function soloPayerOptions() {
    return [
      { id: "company", label: "법인 부담" },
      { id: "actor", label: "배우 부담" }
    ];
  }

  function exclusivePayerOptions() {
    return [
      { id: "company", label: "회사 부담" },
      { id: "actor", label: "배우 부담" }
    ];
  }

  function supportModeLabel(mode) {
    var row = (App.SupportCalcModes || []).filter(function (m) { return m.id === mode; })[0];
    return row ? row.label : "월 정액";
  }

  function isSupportOpen(ui, id) {
    return !!(ui && ui.supportOpen && ui.supportOpen[id]);
  }

  function lunchTruckApplicableProjects(state) {
    var rows = [];
    (state.projects || []).forEach(function (project, idx) {
      if (!project || project.status === "cancelled") return;
      if (App.Defaults.isSalesCategory && App.Defaults.isSalesCategory(project.category)) return;
      rows.push({ project: project, index: idx });
    });
    return rows;
  }

  function renderLunchTruckPolicyBody(item, index, state) {
    var p = "settings.supportPolicies." + index + ".";
    var defaultPrice = App.Money.roundWon(item.unitAmount);
    var rows = lunchTruckApplicableProjects(state);
    var html = '<div class="support-item-body">';
    html += '<div class="sim-grid-3">';
    html += '<div class="field"><label>밥차 기본 단가</label>' +
      withUnit(moneyInput(p + "unitAmount", item.unitAmount), "원 / 회") + "</div>";
    html += "</div>";
    html += "<h4>연동 작품</h4>";
    if (!rows.length) {
      html += '<p class="muted small">등록된 작품이 없습니다. 수익 탭에서 작품을 등록하면 여기 자동으로 나타납니다.</p>';
    } else {
      html += '<div class="scroll"><table><thead><tr><th>작품명</th><th>구분</th><th>기준</th><th class="num">횟수</th><th class="num">단가</th><th class="num">예상금액</th><th>포함</th></tr></thead><tbody>';
      var total = 0;
      var countTotal = 0;
      rows.forEach(function (row) {
        var project = row.project;
        var pp = "projects." + row.index + ".";
        var auto = App.Money.toSafeNumber(project.lunchTruckCount) <= 0;
        var detail = App.Engine.calculateLunchTruckDetail(project, defaultPrice);
        var count = App.Defaults.resolvedLunchTruckCount(project);
        total += detail.total;
        countTotal += detail.count;
        html += "<tr" + (project.lunchTruckInclude === false || project.includeInBudget === false ? ' class="muted"' : "") + ">";
        html += "<td>" + esc(project.name || "이름 없는 작품") + "</td>";
        html += "<td>" + esc(categoryLabel(project.category)) + "</td>";
        html += "<td>" + (auto ? "작품당 1회" : "횟수 지정") + "</td>";
        html += '<td class="num">' +
          withUnit(textInput(pp + "lunchTruckCount", auto ? 1 : project.lunchTruckCount, 'data-kind="count"'), "회") +
          "</td>";
        html += '<td class="num">' + moneyInput(pp + "lunchTruckPrice", project.lunchTruckPrice, 'placeholder="' + defaultPrice + '"') + "</td>";
        html += '<td class="num">' + App.Format.formatWon(detail.total) + "</td>";
        html += '<td><input type="checkbox" data-path="' + pp + 'lunchTruckInclude" data-kind="bool"' +
          (project.lunchTruckInclude !== false ? " checked" : "") + "></td>";
        html += "</tr>";
      });
      html += "</tbody><tfoot><tr class=\"total-row\"><td colspan=\"3\">합계</td><td class=\"num\">" +
        countTotal + "회</td><td></td><td class=\"num\">" +
        App.Format.formatWon(App.Money.roundWon(total)) + "</td><td></td></tr></tfoot></table></div>";
    }
    html += '<p class="muted small">작품 1건당 밥차 1회입니다. 회차 수와 무관합니다. 횟수를 바꾸면 그 작품만 예외로 반영됩니다. 단가를 비워두면 기본 단가(500만 원)를 씁니다. 비용은 각 작품의 촬영 시작월 다음달에 한꺼번에 반영됩니다.</p>';
    html += "</div>";
    return html;
  }

  var VEHICLE_LINKED_POLICY_FIELDS = { "sp-vehicle-rent": "monthlyRent", "sp-vehicle-insurance": "monthlyInsurance" };

  function renderVehicleLinkedPolicyBody(item, field, state) {
    var vehicles = (state.vehicles || []).filter(function (v) { return v && v.include !== false && App.Money.toSafeNumber(v[field]) > 0; });
    var html = '<div class="support-item-body">';
    html += '<p class="muted small">이 항목은 시뮬레이션 설정 &gt; 회사 지원 상단의 <b>차량</b> 카드에서 자동 집계됩니다. 여기서는 직접 수정할 수 없고, 금액을 바꾸려면 차량 카드에서 바꾸세요.</p>';
    if (!vehicles.length) {
      html += '<p class="muted small">포함된 차량 중 금액이 있는 차량이 없습니다.</p>';
    } else {
      html += '<div class="scroll"><table><thead><tr><th>차량</th><th class="num">금액</th><th>적용기간</th></tr></thead><tbody>';
      var total = 0;
      vehicles.forEach(function (v) {
        var amt = App.Money.roundWon(v[field]);
        total += amt;
        html += "<tr><td>" + esc(v.name || "차량") + "</td><td class=\"num\">" + App.Format.formatWon(amt) + "</td>" +
          "<td>" + esc(periodText(v.startMonth, v.endMonth)) + "</td></tr>";
      });
      html += '</tbody><tfoot><tr class="total-row"><td>합계</td><td class="num">' +
        App.Format.formatWon(App.Money.roundWon(total)) + "</td><td></td></tr></tfoot></table></div>";
    }
    html += "</div>";
    return html;
  }

  function supportToggleButton(id) {
    return '<button type="button" class="support-toggle" data-action="toggle-support-open" data-id="' +
      esc(id) + '"><span class="chev" aria-hidden="true"></span></button>';
  }

  function supportDeleteButton(action, extra) {
    return '<button type="button" class="btn danger btn-sm" data-action="' + esc(action) + '" ' +
      (extra || "") + ">삭제</button>";
  }

  function renderSupportCompactRow(opts) {
    var html = '<div class="support-row">';
    html += '<div class="support-lead">' + (opts.leadHtml || "") + "</div>";
    html += '<button type="button" class="support-name" data-action="toggle-support-open" data-id="' +
      esc(opts.id) + '">' + esc(opts.name || "") + "</button>";
    html += '<span class="support-mode">' + (opts.modeHtml != null ? opts.modeHtml : esc(opts.mode || "—")) + "</span>";
    html += '<span class="support-amt">' + (opts.amountHtml != null ? opts.amountHtml : esc(opts.amount || "—")) + "</span>";
    html += '<span class="support-period">' + (opts.periodHtml != null ? opts.periodHtml : esc(opts.period || "—")) + "</span>";
    html += '<div class="support-actions">' + (opts.actionsHtml || "") + "</div>";
    html += "</div>";
    return html;
  }

  function renderSupportColHeader() {
    return '<div class="support-row support-cols-head" aria-hidden="true">' +
      "<span></span>" +
      '<span class="support-name">항목</span>' +
      '<span class="support-mode">기준</span>' +
      '<span class="support-amt">금액</span>' +
      '<span class="support-period">적용</span>' +
      '<span class="support-actions">관리</span>' +
      "</div>";
  }

  function renderSupportPolicyItem(item, index, ui, state) {
    var p = "settings.supportPolicies." + index + ".";
    var included = item.include === true || item.included === true;
    var mode = item.calcMode || "monthlyFixed";
    var id = item.id || String(index);
    var open = isSupportOpen(ui, id);
    var isLunchTruck = item.id === "sp-lunch-truck";
    var vehicleField = VEHICLE_LINKED_POLICY_FIELDS[item.id];
    var period = App.Month.usesCustomPeriod(item) ? periodText(item.startMonth, item.endMonth) : "시뮬레이션 전체";
    var modeText = supportModeLabel(mode);
    var amountHtml = App.Format.formatWon(App.Engine.supportPolicyMonthlyAmount(item) || item.unitAmount) +
      " " + esc(supportAmountHint(mode));
    var periodTextValue = period;
    if (isLunchTruck) {
      var ltSupport = App.Engine.lunchTruckProjectRows(state, App.Money.roundWon(item.unitAmount));
      var ltCount = App.Money.sumBy(ltSupport, function (r) { return r.count; });
      var ltTotal = included ? App.Money.sumBy(ltSupport, function (r) { return r.amount; }) : 0;
      modeText = "1회 단가 " + App.Format.formatWon(item.unitAmount);
      amountHtml = "예상 " + ltCount + "회 · " + App.Format.formatWon(ltTotal);
      periodTextValue = "작품 연동";
    } else if (vehicleField) {
      var vehTotal = App.Engine.vehicleFieldSnapshotTotal(state.vehicles || [], vehicleField);
      modeText = "자동 합계";
      amountHtml = App.Format.formatWon(vehTotal) + " / 월";
      periodTextValue = "차량 설정 연동";
    }
    var leadHtml = '<label class="check support-include" title="포함"><input type="checkbox" data-path="' +
      p + 'include" data-kind="bool"' + (included ? " checked" : "") +
      '><span class="support-include-text">포함</span></label>' + supportToggleButton(id);
    var html = '<div class="support-item' + (included ? "" : " off") + (open ? " open" : "") + '">';
    html += renderSupportCompactRow({
      id: id,
      leadHtml: leadHtml,
      name: item.name || "지원 항목",
      mode: modeText,
      amountHtml: amountHtml,
      period: periodTextValue,
      actionsHtml: vehicleField ? "" : supportDeleteButton("remove-support-policy", 'data-index="' + index + '"')
    });
    if (open && isLunchTruck) {
      html += renderLunchTruckPolicyBody(item, index, state);
    } else if (open && vehicleField) {
      html += renderVehicleLinkedPolicyBody(item, vehicleField, state);
    } else if (open) {
      html += '<div class="support-item-body">';
      html += '<div class="sim-grid-3">';
      html += '<div class="field"><label>항목명</label>' + textInput(p + "name", item.name, 'placeholder="지원 항목"') + "</div>";
      html += '<div class="field"><label>계산 방식</label>' + selectInput(p + "calcMode", mode, supportCalcModeOptions()) + "</div>";
      html += '<div class="field"><label>금액 ' + esc(supportAmountHint(mode)) + "</label>" +
        moneyInput(p + "unitAmount", item.unitAmount) + "</div>";
      if (supportShowsQuantity(mode, item)) {
        html += '<div class="field"><label>' + esc(supportQuantityLabel(mode, item)) + "</label>" +
          withUnit(textInput(p + "quantity", item.quantity, 'data-kind="count"'),
            supportQuantityUnit(mode, item)) + "</div>";
      }
      html += '<div class="field"><label>구분</label>' +
        selectInput(p + "group", item.group || "selfCare", supportGroupOptions()) + "</div>";
      html += '<div class="field"><label>비용 분류</label>' +
        selectInput(p + "costClass", item.costClass || "sga", supportCostClassOptions()) + "</div>";
      html += '<div class="field"><label>1인 기획사</label>' +
        selectInput(p + "soloPayer", item.soloPayer === "actor" ? "actor" : "company", soloPayerOptions()) + "</div>";
      html += '<div class="field"><label>기존 회사</label>' +
        selectInput(p + "exclusivePayer", item.exclusivePayer === "actor" ? "actor" : "company", exclusivePayerOptions()) + "</div>";
      html += "</div>";
      html += '<div class="support-item-flags">';
      html += '<label class="check"><input type="checkbox" data-path="' + p +
        'separateFromProjectExpense" data-kind="bool"' +
        (item.separateFromProjectExpense !== false ? " checked" : "") + ">작품 진행비와 별도 반영</label>";
      html += "</div>";
      html += '<div class="field"><label>메모</label>' + textInput(p + "note", item.note || "") + "</div>";
      html += "</div>";
    }
    html += "</div>";
    return html;
  }

  var VEHICLE_SECTION_ID = "vehicles-section";

  function vehicleAmountSummary(v) {
    return "보증금 " + App.Format.formatWon(v.deposit) + " · 렌트 " + App.Format.formatWon(v.monthlyRent) +
      "/월 · 보험 " + App.Format.formatWon(v.monthlyInsurance) + "/월";
  }

  function vehicleTotals(state) {
    var vehicles = state.vehicles || [];
    return {
      count: vehicles.length,
      deposit: App.Money.sumBy(vehicles, function (v) { return v.deposit; }),
      rent: App.Money.sumBy(vehicles, function (v) { return v.monthlyRent; }),
      insurance: App.Money.sumBy(vehicles, function (v) { return v.monthlyInsurance; })
    };
  }

  function renderVehicleItem(v, index, ui) {
    var p = "vehicles." + index + ".";
    var id = v.id || String(index);
    var open = isSupportOpen(ui, id);
    var html = '<div class="support-item' + (open ? " open" : "") + '">';
    html += renderSupportCompactRow({
      id: id,
      leadHtml: '<span class="support-include-spacer" aria-hidden="true"></span>' + supportToggleButton(id),
      name: v.name || "이름 없는 차량",
      mode: App.Defaults.vehicleKindLabel(v.kind),
      amount: vehicleAmountSummary(v),
      period: "—",
      actionsHtml: supportDeleteButton("remove-vehicle", 'data-id="' + esc(id) + '"')
    });
    if (open) {
      html += '<div class="support-item-body">';
      html += '<div class="sim-grid-3">';
      html += '<div class="field"><label>차량명</label>' + textInput(p + "name", v.name, 'placeholder="차량명"') + "</div>";
      html += '<div class="field"><label>구분</label>' +
        selectInput(p + "kind", v.kind || "actor", App.Defaults.VEHICLE_KINDS || []) + "</div>";
      html += '<div class="field"><label>보증금</label>' + moneyInput(p + "deposit", v.deposit) + "</div>";
      html += '<div class="field"><label>월 렌트료</label>' + moneyInput(p + "monthlyRent", v.monthlyRent) + "</div>";
      html += '<div class="field"><label>월 보험료</label>' + moneyInput(p + "monthlyInsurance", v.monthlyInsurance) + "</div>";
      html += '<div class="field"><label>계약 시작월</label>' + isoMonthInput(p + "startMonth", v.startMonth) + "</div>";
      html += '<div class="field"><label>계약 종료월</label>' + isoMonthInput(p + "endMonth", v.endMonth) + "</div>";
      html += "</div></div>";
    }
    html += "</div>";
    return html;
  }

  function renderVehicles(state, ui) {
    App.Defaults.ensureVehicles(state);
    var totals = vehicleTotals(state);
    var html = "<h3>차량 <span class=\"muted small\">" + totals.count + "대 · 보증금 " +
      App.Format.formatWon(totals.deposit) + " · 렌트 " + App.Format.formatWon(totals.rent) +
      "/월 · 보험 " + App.Format.formatWon(totals.insurance) + "/월</span></h3>";
    (state.vehicles || []).forEach(function (v, i) {
      html += renderVehicleItem(v, i, ui);
    });
    if (!(state.vehicles || []).length) {
      html += '<p class="muted small">등록된 차량이 없습니다.</p>';
    }
    html += '<div class="inline" style="margin-top:8px"><button type="button" class="btn" data-action="add-vehicle">+ 차량 추가</button></div>';
    return html;
  }

  function fundingDepositRows(state) {
    return (state.deposits || []).concat(App.Engine.vehicleDepositLines(state.vehicles || []));
  }

  function vehicleDepositSourceRows(state) {
    return (state.vehicles || []).filter(function (v) {
      return v && v.include !== false && App.Money.toSafeNumber(v.deposit) > 0;
    });
  }

  function renderVehicleFundingRows(state) {
    var vehicles = vehicleDepositSourceRows(state);
    if (!vehicles.length) return "";
    var html = "";
    vehicles.forEach(function (v) {
      var endLabel = App.Format.formatMonthIso(v.endMonth) || "미정";
      var labels = costFamilyAccount("deposit", { vehicle: true });
      html += '<div class="cost-item vehicle-readonly">';
      html += '<div class="cost-row cost-row-list">';
      html += costSummaryCells({
        family: labels.family,
        account: labels.account,
        name: (v.name || "차량") + " (" + App.Defaults.vehicleKindLabel(v.kind) + ")",
        amount: App.Format.formatWon(v.deposit),
        unit: "1회",
        period: (App.Format.formatMonthIso(v.startMonth) || "미정") + (endLabel !== "미정" ? " ~ " + endLabel : ""),
        status: "차량 연동",
        chevron: false
      });
      html += "</div></div>";
    });
    return html;
  }

  function renderSupportPolicies(state, ui) {
    App.Defaults.ensureSupportPolicies(state);
    var list = ((state.settings && state.settings.supportPolicies) || []).filter(function (item) {
      return !App.Defaults.isRetiredSupportPolicy(item);
    });
    var groups = supportGroupOptions();
    var html = '<div class="card sim-compact support-policies"><h2>회사 지원 / 복리후생</h2>';
    html += renderSupportColHeader();
    html += renderVehicles(state, ui);
    if (App.Defaults.supportVehicleHasAmount(state) && App.Defaults.overlappingVehicleOpex(state).length) {
      html += '<p class="muted small" style="color:var(--warn)">비용 &gt; 운영비에 차량렌트·주유 항목이 이미 있습니다. 회사 지원의 차량 금액을 넣으면 1인 기획사 판관비에 두 번 들어갑니다. 배우 차량 지원은 여기만 쓰고, 운영비의 같은 항목은 빼 주세요.</p>';
    }
    if (!list.length) {
      html += '<p class="muted">등록된 지원 항목이 없습니다.</p>';
    } else {
      groups.forEach(function (group) {
        var rows = [];
        list.forEach(function (item, i) {
          if ((item.group || "selfCare") === group.id) rows.push({ item: item, index: i });
        });
        if (!rows.length) return;
        html += "<h3>" + esc(group.label) + "</h3>";
        rows.forEach(function (row) {
          html += renderSupportPolicyItem(row.item, row.index, ui, state);
        });
      });
      var unknown = [];
      list.forEach(function (item, i) {
        var known = groups.some(function (g) { return g.id === item.group; });
        if (!known) unknown.push({ item: item, index: i });
      });
      if (unknown.length) {
        html += "<h3>기타</h3>";
        unknown.forEach(function (row) {
          html += renderSupportPolicyItem(row.item, row.index, ui, state);
        });
      }
    }
    html += '<div class="inline" style="margin-top:8px"><button type="button" class="btn" data-action="add-support-policy">+ 지원 항목</button></div>';
    html += "</div>";
    return html;
  }

  function pctView(ratio) {
    return String(Math.round(App.Money.toSafeNumber(ratio) * 1000) / 10);
  }

  function narrowTaxLabel(label) {
    return String(label || "").replace(/\s*\([^)]*\)\s*$/, "");
  }

  function ownerPayoutShortLabel(solo, detail) {
    if (detail && detail.payoutIncomeLabel) return detail.payoutIncomeLabel;
    if (solo && solo.ownerDividendMode === "rate") return "대표 배당";
    return "대표 배당";
  }

  function ownerPayoutAmountLabel(solo) {
    if (solo && solo.ownerDividendMode === "rate") {
      return "대표 배당 (영업이익 × " + pctView(solo.ownerDividendRate) + "%)";
    }
    return "대표 배당";
  }

  function ownerPayoutTaxLabel(solo, detail) {
    if (detail && detail.payoutTaxLabel) return detail.payoutTaxLabel;
    if (solo && solo.ownerPayoutTaxLabel) return solo.ownerPayoutTaxLabel;
    return "배당소득세 (15.4%)";
  }

  function burdenOptions() {
    return [
      { id: "company", label: "회사 부담" },
      { id: "actor", label: "배우 부담" },
      { id: "deductBeforeSplit", label: "배분 전 공제" },
      { id: "ignore", label: "비교 제외" }
    ];
  }

  function simAttributionYearText(result) {
    var months = (result && result.months) || [];
    var years = App.TaxYear && App.TaxYear.yearsFromMonths ? App.TaxYear.yearsFromMonths(months) : [];
    if (!years.length) return "시뮬 기간 자동";
    if (years.length === 1) return String(years[0]) + " (자동)";
    return years[0] + "–" + years[years.length - 1] + " (자동)";
  }

  function renderPersonalTaxFields(prefix, tax, common, opts) {
    tax = tax || App.Defaults.defaultPersonalTaxSettings();
    common = common || {};
    opts = opts || {};
    var mode = common.mode === "rate" || common.mode === "auto" || common.mode === "manual"
      ? common.mode
      : (tax.mode === "rate" || tax.mode === "auto" || tax.mode === "manual" ? tax.mode : "auto");
    var year = common.year || tax.year || 2026;
    if (opts.autoOnly) {
      return '<div class="row-fields">' +
        '<div class="field"><label>개인세금</label><div class="readonly-val">누진세율 자동</div></div>' +
        '<div class="field"><label>귀속연도</label><div class="readonly-val">' +
        esc(opts.yearText || "시뮬 기간 자동") + "</div></div></div>" +
        '<p class="muted small">근로소득은 누진세율로 계산하고, 배당은 배당소득세 15.4%, 수익배분은 사업소득세·주민세 3.3%를 더합니다. 귀속연도는 시뮬레이션 기간에서 자동입니다.</p>';
    }
    var html = '<div class="row-fields">';
    html += '<div class="field"><label>개인세금 방식</label>' +
      selectInput("settings.personalTaxCommon.mode", mode, [
        { id: "auto", label: "자동 계산 (누진세율)" },
        { id: "manual", label: "수동 세액" },
        { id: "rate", label: "유효세율" }
      ]) + "</div>";
    if (mode === "rate") {
      html += '<div class="field"><label>유효세율</label>' +
        percentInput(prefix + ".effectiveRate", pctView(tax.effectiveRate), 'data-kind="percent"') + "</div>";
    } else if (mode === "manual") {
      html += '<div class="field"><label>수동 개인세금</label>' +
        moneyInput(prefix + ".manualTaxAmount", tax.manualTaxAmount) + "</div>";
    } else {
      html += '<div class="field"><label>귀속연도</label>' +
        selectInput("settings.personalTaxCommon.year", String(year), taxYearOptions()) + "</div>";
    }
    html += "</div>";
    html += '<p class="muted small">자동 계산 시 1인 기획사는 대표 급여의 근로소득세에, 배당이면 배당소득세 15.4%, 수익배분이면 사업소득세 3.3%를 더합니다. 수동 세액을 고르면 입력값이 우선합니다.</p>';
    return html;
  }

  function personalTaxSummaryLine(label, value, opts) {
    opts = opts || {};
    return '<div class="tax-line' + (opts.hl ? " hl" : "") + '"><span>' + esc(label) +
      "</span><b>" + App.Format.formatWon(value) + "</b></div>";
  }

  function renderPersonalTaxSummary(scn) {
    var d = scn.personalTaxDetail || {};
    var html = '<div class="tax-summary-mini">';
    html += personalTaxSummaryLine("배우 귀속소득", scn.actorGrossIncome);
    html += personalTaxSummaryLine("필요경비/공제", App.Money.roundWon(
      (d.necessaryExpenses || 0) + (d.otherAdjustment || 0) + (d.incomeDeduction || 0)
    ));
    html += personalTaxSummaryLine("과세표준", d.taxableBase || 0);
    html += personalTaxSummaryLine("종합소득세", scn.incomeTax);
    html += personalTaxSummaryLine("지방소득세", scn.localIncomeTax);
    html += personalTaxSummaryLine("총 개인세금", scn.personalTax);
    html += personalTaxSummaryLine("세후 배우 실수령", scn.actorNetIncome, { hl: true });
    html += '<p class="muted small">상세 공제내역은 분석 &gt; 종합소득세 계산에서 수정합니다.</p>';
    html += "</div>";
    return html;
  }

  function renderScenarioSettings(state, result, ui) {
    App.Defaults.ensureScenarioSettings(state);
    var ids = state.settings.scenarioComparison.enabledScenarioIds || [];
    var solo = state.settings.scenarios.soloAgency;
    var contract = state.settings.scenarios.exclusiveContract;
    var cmp = App.Engine.runScenarioComparison(state, result);
    var split = App.Defaults.derivedSplitBasis(contract.costBurdenRules);
    var shareSum = App.Money.toSafeNumber(contract.companyShareRate) + App.Money.toSafeNumber(contract.actorShareRate);
    var shareOk = Math.abs(shareSum - 1) < 0.0005;
    var employees = [{ id: "", label: "자동 (대표 역할 직원)" }].concat((state.employees || []).map(function (emp) {
      return { id: emp.id, label: ((emp.name || "직원") + (emp.role ? " · " + emp.role : "")) };
    }));
    var soloEdit = !!(ui && ui.soloTaxFormEdit);
    var html = '<div class="card sim-compact scenario-settings"><h2>비교 시나리오</h2>';
    html += '<p class="muted small">같은 수익 데이터를 기준으로 비교할 시나리오를 고릅니다. 결과는 분석 &gt; 시나리오 비교에 표시됩니다.</p>';
    html += '<div class="scenario-enable">';
    [
      { id: "soloAgency", label: "1인 기획사" },
      { id: "exclusiveContract", label: "기존 회사 전속" }
    ].forEach(function (opt) {
      var on = ids.indexOf(opt.id) >= 0;
      html += '<label class="check"><input type="checkbox" data-action="toggle-scenario" data-id="' +
        esc(opt.id) + '"' + (on ? " checked" : "") + "> " + esc(opt.label) + "</label>";
    });
    html += "</div></div>";

    html += '<details class="card scenario-acc"' + (ids.indexOf("soloAgency") >= 0 ? " open" : "") + ">";
    html += "<summary>1인 기획사</summary>";
    html += '<div class="scenario-acc-body">';
    html += '<div class="scenario-edit-bar">';
    html += '<p class="muted small">법인 운영 결과는 현재 시뮬레이션을 그대로 씁니다. 급여·인센티브는 조직·인건비, 배당·수익배분은 여기서 지정합니다.</p>';
    html += '<button type="button" class="btn' + (soloEdit ? " primary" : "") +
      '" data-action="toggle-solo-tax-edit">' + (soloEdit ? "완료" : "수정") + "</button>";
    html += "</div>";
    html += '<fieldset class="solo-tax-form"' + (soloEdit ? "" : " disabled") + ">";
    html += '<div class="field"><label>대표자 급여 직원</label>' +
      selectInput("settings.scenarios.soloAgency.ownerPayout.salaryEmployeeId", solo.ownerPayout.salaryEmployeeId || "", employees) + "</div>";
    var divOn = App.Defaults.isDividendOn
      ? App.Defaults.isDividendOn(solo.ownerPayout)
      : solo.ownerPayout.dividendOn !== false;
    var divMode = solo.ownerPayout.dividendMode === "rate" ? "rate" : "amount";
    var resolvedDiv = App.Defaults.resolveOwnerDividend
      ? App.Defaults.resolveOwnerDividend(state, (result && result.months) || [], {
          afterTaxNet: result && result.kpis && result.kpis.taxDetail
            ? App.Money.roundWon(result.kpis.taxDetail.afterTaxNet)
            : 0,
          operatingProfit: result && result.kpis ? result.kpis.operatingProfit : 0,
          byYear: result && result.kpis && result.kpis.taxDetail && result.kpis.taxDetail.byYear
        })
      : { amount: App.Money.roundWon(solo.ownerPayout.dividendAmount), years: [] };
    var divTax = App.Defaults.ownerDividendWithholding(1);
    html += "<h3>배당</h3>";
    html += '<div class="plan-filter dividend-on-toggle">';
    html += '<label class="check"><input type="radio" name="solo-div-on" data-action="set-dividend-on" data-on="1"' +
      (divOn ? " checked" : "") + "> 배당 있음</label>";
    html += '<label class="check"><input type="radio" name="solo-div-on" data-action="set-dividend-on" data-on="0"' +
      (divOn ? "" : " checked") + "> 배당 없음</label>";
    html += "</div>";
    if (divOn) {
      html += '<div class="div-year-wrap"><table class="div-year-table"><thead><tr>';
      html += "<th>연도</th><th class=\"num\">영업이익연동</th><th class=\"num\">배당비율</th>";
      html += "<th class=\"num\">배당액</th><th class=\"num\">납부할 세율</th><th>배당지급일</th>";
      html += "</tr></thead><tbody>";
      var divYears = resolvedDiv.years || [];
      if (!divYears.length) {
        html += '<tr><td colspan="6" class="muted">시뮬레이션 기간의 연도가 여기 자동으로 채워집니다.</td></tr>';
      }
      divYears.forEach(function (row, idx) {
        html += "<tr>";
        html += "<td>" + esc(String(row.year)) + "</td>";
        html += '<td class="num">' + App.Format.formatWon(row.operatingProfit) + "</td>";
        html += "<td class=\"num\">";
        if (idx === 0) {
          html += percentInput("settings.scenarios.soloAgency.ownerPayout.dividendRate", pctView(solo.ownerPayout.dividendRate), 'data-kind="percent"');
        } else {
          html += '<span class="muted">' + esc(pctView(row.rate)) + "%</span>";
        }
        html += "</td>";
        html += '<td class="num">' + App.Format.formatWon(row.amount) +
          (divMode === "rate" ? '<div class="auto">자동</div>' : "") + "</td>";
        html += '<td class="num">' + esc(pctView(divTax.rate)) + "%</td>";
        html += "<td>" + (row.month ? esc(App.Month.monthLabel(row.month)) : "—") + "</td>";
        html += "</tr>";
      });
      html += "</tbody></table></div>";
      if (divMode !== "rate") {
        html += '<div class="row-fields">';
        html += '<div class="field"><label>지정 배당액</label>' +
          moneyInput("settings.scenarios.soloAgency.ownerPayout.dividendAmount", App.Money.roundWon(solo.ownerPayout.dividendAmount)) + "</div>";
        html += "</div>";
      }
      html += '<p class="muted small">연도는 시뮬레이션 기간에서 자동입니다. 그 해 영업이익이 플러스일 때만 비율을 곱하고, 다음 해 3월에 지급합니다. 시뮬이 그 전에 끝나면 마지막 달에 지급합니다. 적자면 0원입니다. 배당소득세·주민세 원천징수 15.4%입니다. 손익비용이 아니라 이익잉여금 인출입니다.</p>';
    }
    var resolvedShare = App.Defaults.resolveOwnerProfitShare
      ? App.Defaults.resolveOwnerProfitShare(state, (result && result.months) || [])
      : { workRevenue: 0, salesRevenue: 0, workAmount: 0, salesAmount: 0, tax: { rate: 0.033 } };
    var shareTax = App.Defaults.ownerProfitShareWithholding
      ? App.Defaults.ownerProfitShareWithholding(1)
      : { rate: 0.033 };
    html += "<h3>수익배분</h3>";
    html += '<p class="muted small">작품·영업 매출에 배분율을 곱합니다. 사업소득세·주민세 3.3%입니다. 배당과 별도이며, 손익비용이 아니라 이익잉여금 인출입니다.</p>';
    html += '<div class="div-year-wrap"><table class="div-year-table"><thead><tr>';
    html += "<th>구분</th><th class=\"num\">기간 매출</th><th class=\"num\">수익배분율</th>";
    html += "<th class=\"num\">배분액</th><th class=\"num\">납부할 세율</th>";
    html += "</tr></thead><tbody>";
    html += "<tr><td>작품</td>";
    html += '<td class="num">' + App.Format.formatWon(resolvedShare.workRevenue) + "</td>";
    html += '<td class="num">' + percentInput("settings.scenarios.soloAgency.ownerPayout.profitShareWorkRate", pctView(solo.ownerPayout.profitShareWorkRate), 'data-kind="percent"') + "</td>";
    html += '<td class="num">' + App.Format.formatWon(resolvedShare.workAmount) + '<div class="auto">자동</div></td>';
    html += '<td class="num">' + esc(pctView(shareTax.rate)) + "%</td></tr>";
    html += "<tr><td>영업</td>";
    html += '<td class="num">' + App.Format.formatWon(resolvedShare.salesRevenue) + "</td>";
    html += '<td class="num">' + percentInput("settings.scenarios.soloAgency.ownerPayout.profitShareSalesRate", pctView(solo.ownerPayout.profitShareSalesRate), 'data-kind="percent"') + "</td>";
    html += '<td class="num">' + App.Format.formatWon(resolvedShare.salesAmount) + '<div class="auto">자동</div></td>';
    html += '<td class="num">' + esc(pctView(shareTax.rate)) + "%</td></tr>";
    html += "</tbody></table></div>";
    html += '<div class="field" style="max-width:220px"><label>법인 잔여현금 청산(인출) 세율</label>' +
      percentInput("settings.tax.liquidationTaxRate", pctView(state.settings.tax.liquidationTaxRate), 'data-kind="percent"') + "</div>";
    html += '<p class="muted small">법인에 남는 현금을 나중에 배당·급여 등으로 개인화할 때 드는 세금의 단순 가정 세율입니다(기본 15.4% = 배당소득세 원천징수율). 실제 청산소득 법인세 등 별도 규정은 반영하지 않습니다.</p>';
    html += "<h3>개인세금</h3>";
    html += renderPersonalTaxFields(
      "settings.scenarios.soloAgency.personalTax",
      solo.personalTax,
      state.settings.personalTaxCommon,
      { autoOnly: true, yearText: simAttributionYearText(result) }
    );
    html += renderPersonalTaxSummary(cmp.scenarios.soloAgency);
    html += "</fieldset>";
    html += "</div></details>";

    html += '<details class="card scenario-acc"' + (ids.indexOf("exclusiveContract") >= 0 ? " open" : "") + ">";
    html += "<summary>기존 회사 전속</summary>";
    html += '<div class="scenario-acc-body">';
    html += '<div class="row-fields">';
    html += '<div class="field"><label>회사 배분율</label>' +
      percentInput("settings.scenarios.exclusiveContract.companyShareRate", pctView(contract.companyShareRate), 'data-kind="percent"') + "</div>";
    html += '<div class="field"><label>배우 배분율</label>' +
      percentInput("settings.scenarios.exclusiveContract.actorShareRate", pctView(contract.actorShareRate), 'data-kind="percent"') + "</div>";
    html += "</div>";
    html += '<div class="inline scenario-share-ops">';
    html += '<button type="button" class="btn" data-action="normalize-share-rates">합계 100% 맞추기</button>';
    if (!shareOk) {
      html += '<span class="muted small" style="color:var(--warn)">합계 ' + pctView(shareSum) + "% · 저장은 되지만 계산 시 경고합니다.</span>";
    }
    html += "</div>";

    html += "<h3>배분 기준</h3>";
    html += '<p class="muted small">토글은 저장값이 아닙니다. 기타 프로젝트 직접비·매출연동 수수료의 부담 규칙만 바꿉니다. 진행비와 밥차비는 1인 기획사·기존 회사 전속 모두 회사가 100% 부담하며, 배우 귀속소득에서 빼지 않습니다.</p>';
    html += '<div class="plan-filter">';
    html += '<button type="button" class="plan-filter-btn' + (split === "grossRevenue" ? " active" : "") +
      '" data-action="set-split-basis" data-basis="grossRevenue">총매출 기준</button>';
    html += '<button type="button" class="plan-filter-btn' + (split === "netAfterDeductibleCosts" ? " active" : "") +
      '" data-action="set-split-basis" data-basis="netAfterDeductibleCosts">비용 차감 후</button>';
    html += "</div>";

    html += "<h3>비용 부담 규칙</h3>";
    html += '<div class="row-fields burden-fields">';
    [
      { key: "projectDirect", label: "기타 프로젝트 직접비" },
      { key: "revenueLinkedFees", label: "매출연동·에이전시 수수료" },
      { key: "payroll", label: "직원 급여" },
      { key: "opex", label: "판관비" },
      { key: "startup", label: "초기 설립비" },
      { key: "assetsAndDeposits", label: "자산·보증금" },
      { key: "actorPersonalCosts", label: "배우 개인 활동비" }
    ].forEach(function (row) {
      html += '<div class="field"><label>' + esc(row.label) + "</label>" +
        selectInput("settings.scenarios.exclusiveContract.costBurdenRules." + row.key, contract.costBurdenRules[row.key], burdenOptions()) +
        "</div>";
    });
    html += "</div>";
    html += '<p class="muted small">진행비·밥차비는 기존 회사가 100% 부담했던 제작비입니다. 비교표에는 발생액을 그대로 보여 주고, 배우 정산에서는 차감하지 않습니다.</p>';
    html += "<h3>배우 개인 활동비</h3>";
    html += '<p class="muted small">헤어·메이크업·스타일링 1회 단가가 기본으로 들어 있습니다. 단가와 횟수는 직접 수정할 수 있고, 부담 규칙이 배우 부담이면 전속 실수령에서 뺍니다.</p>';
    (contract.actorPersonalCosts || []).forEach(function (item, i) {
      var p = "settings.scenarios.exclusiveContract.actorPersonalCosts." + i + ".";
      var lineAmt = App.Defaults.actorPersonalCostAmount
        ? App.Defaults.actorPersonalCostAmount(Object.assign({}, item, { include: true }))
        : App.Money.roundWon(item.amount);
      html += '<div class="actor-personal-row">';
      html += '<div class="row-fields">';
      html += '<div class="field"><label>항목</label>' + textInput(p + "name", item.name, 'placeholder="항목"') + "</div>";
      html += '<div class="field"><label>1회 단가</label>' +
        withUnit(moneyInput(p + "unitAmount", item.unitAmount), "원 / 회") + "</div>";
      html += '<div class="field"><label>횟수</label>' +
        withUnit(textInput(p + "quantity", item.quantity, 'data-kind="count"'), "회") + "</div>";
      html += '<div class="field"><label>합계</label><div class="readonly">' + esc(App.Format.formatWon(lineAmt)) + "</div></div>";
      html += "</div>";
      html += '<div class="inline">';
      html += '<label class="check"><input type="checkbox" data-path="' + p + 'include" data-kind="bool"' +
        (item.include !== false ? " checked" : "") + ">포함</label>";
      html += '<button type="button" class="btn danger" data-action="remove-actor-personal-cost" data-index="' + i + '">삭제</button>';
      html += "</div></div>";
    });
    html += '<button type="button" class="btn" data-action="add-actor-personal-cost">+ 배우 개인 활동비</button>';
    html += renderPersonalTaxFields(
      "settings.scenarios.exclusiveContract.personalTax",
      contract.personalTax,
      state.settings.personalTaxCommon
    );
    html += renderPersonalTaxSummary(cmp.scenarios.exclusiveContract);
    html += "</div></details>";
    return html;
  }

  function isWorkCat(id) {
    return (App.WorkCategories || []).some(function (c) { return c.id === id; });
  }

  function isSalesCat(id) {
    return (App.SalesCategories || []).some(function (c) { return c.id === id; });
  }

  function registeredDealTotal(state, sales) {
    var sum = 0;
    (state.projects || []).forEach(function (p) {
      if (!p || p.status === "cancelled") return;
      var isSales = isSalesCat(p.category);
      if (sales ? !isSales : isSales) return;
      sum += App.Engine.projectContractAmount(p);
    });
    if (sales) {
      (state.salesPlans || []).forEach(function (plan) {
        if (!plan || plan.converted) return;
        sum += App.Money.roundWon(plan.amount);
      });
    }
    return App.Money.roundWon(sum);
  }

  function registeredExpenseTotal(state, sales) {
    var sum = 0;
    (state.projects || []).forEach(function (p) {
      if (!p || p.status === "cancelled") return;
      var isSales = isSalesCat(p.category);
      if (sales ? !isSales : isSales) return;
      sum += App.Engine.calculateProjectExpenseRegisteredTotal
        ? App.Engine.calculateProjectExpenseRegisteredTotal(p, state)
        : App.Engine.calculateProjectExpenseDetail(p, state).total;
    });
    return App.Money.roundWon(sum);
  }

  function categoryStatusCounts(rows) {
    var counts = { expected: 0, negotiating: 0, confirmed: 0 };
    (rows || []).forEach(function (item) {
      var st = item.project && item.project.status;
      if (st && counts[st] != null) counts[st] += 1;
    });
    return counts;
  }

  function workCategoryOptions(project) {
    var opts = (App.Categories || []).slice();
    var seen = {};
    opts.forEach(function (c) { seen[c.id] = true; });
    if (project && project.category && !seen[project.category]) {
      opts.push({ id: project.category, label: project.category });
    }
    return opts;
  }

  function projectsInCategory(state, catId) {
    var rows = [];
    (state.projects || []).forEach(function (p, idx) {
      if (p.category === catId) rows.push({ project: p, idx: idx });
    });
    return rows;
  }

  function categoryWorkStats(rows) {
    var n = 0;
    var sum = 0;
    rows.forEach(function (item) {
      if (item.project.status === "cancelled") return;
      n += 1;
      sum += App.Engine.projectContractAmount(item.project);
    });
    return { n: n, sum: sum };
  }

  function isWorkGroupOpen(ui, id, hasItems) {
    if (!ui || !ui.workOpen) return !!hasItems;
    if (ui.workOpen[id] === false) return false;
    if (ui.workOpen[id] === true) return true;
    return !!hasItems;
  }

  function isWorkItemOpen(ui, id) {
    return !!(ui && ui.workItemOpen && ui.workItemOpen[id]);
  }

  function workStatusLabel(status) {
    var st = (App.Statuses || []).filter(function (s) { return s.id === status; })[0];
    return st ? st.label : (status || "");
  }

  function workShootText(p) {
    if (!p.shootStartMonth && !p.shootEndMonth) return "미정";
    var a = App.Format.formatMonthIso(p.shootStartMonth) || "미정";
    var b = p.shootEndMonth ? (App.Format.formatMonthIso(p.shootEndMonth) || "") : "";
    if (!b || b === a) return a;
    return a + "~" + b;
  }

  function workPayText(p) {
    var n = (p.payments || []).length;
    return n ? n + "회" : "미설정";
  }

  function workPayView(project, gapItem) {
    var n = ((project && project.payments) || []).length;
    var text = n ? n + "회" : "미설정";
    var tone = "";
    var title = "";
    if (!gapItem) return { text: text, tone: tone, title: title };
    if (gapItem.cancelled) return { text: text, tone: "", title: "취소 상태" };
    var bad = (gapItem.issues || []).filter(function (issue) { return issue.severity === "bad"; })[0];
    var warn = (gapItem.issues || []).filter(function (issue) { return issue.severity === "warn"; })[0];
    if (gapItem.budgetOff) {
      return { text: "예산 OFF", tone: "warn", title: warn ? warn.text : "예산 반영 OFF" };
    }
    if (bad) {
      title = bad.text;
      if (bad.code === "payment_short") {
        text = (n ? n + "회 · " : "") + "부족 " + App.Format.formatWon(gapItem.contract - gapItem.scheduled);
      } else if (bad.code === "payment_over") {
        text = (n ? n + "회 · " : "") + "초과 " + App.Format.formatWon(gapItem.scheduled - gapItem.contract);
      } else if (bad.code === "no_month") {
        text = "미설정";
      }
      return { text: text, tone: "bad", title: title };
    }
    if (warn) {
      return { text: text, tone: "warn", title: warn.text };
    }
    if (gapItem.fallback) {
      return { text: "미설정", tone: "", title: "지급 미설정 · 발생월에 계약금액 전액 반영" };
    }
    return { text: text, tone: "", title: "" };
  }

  function gapItemForProject(gap, project) {
    if (!gap || !gap.byId || !project || !project.id) return null;
    return gap.byId["project:" + project.id] || null;
  }

  function gapItemForRow(gap, row) {
    if (!gap || !gap.byId || !row) return null;
    if (row.kind === "plan") return gap.byId["plan:" + row.id] || null;
    return gap.byId["project:" + row.id] || null;
  }

  function gapItemMemo(item) {
    if (!item) return "";
    var bad = (item.issues || []).filter(function (issue) { return issue.severity === "bad"; })[0];
    if (bad) return bad.text;
    var warn = (item.issues || []).filter(function (issue) { return issue.severity === "warn"; })[0];
    return warn ? warn.text : "";
  }

  function ledgerRowGapItem(row, gap) {
    if (!gap || !gap.byId || !row || !row.id) return null;
    var id = String(row.id);
    if (id.indexOf("rev-") === 0) return gap.byId["project:" + id.slice(4)] || null;
    if (id.indexOf("plan-") === 0) return gap.byId["plan:" + id.slice(5)] || null;
    return null;
  }

  function ledgerRowMemo(item) {
    if (!item) return "";
    var bad = (item.issues || []).filter(function (issue) { return issue.severity === "bad"; })[0];
    if (bad) {
      if (bad.code === "payment_short") {
        return "지급 부족 " + App.Format.formatWon(item.contract - item.scheduled);
      }
      if (bad.code === "payment_over") {
        return "지급 초과 " + App.Format.formatWon(item.scheduled - item.contract);
      }
      if (bad.code === "no_month") return "발생월 없음 · 입금 0원";
      return bad.text;
    }
    var warn = (item.issues || []).filter(function (issue) { return issue.severity === "warn"; })[0];
    if (!warn) return "";
    if (warn.code === "budget_off") return "예산 OFF";
    if (warn.code === "before") return "기간 이전 입금 있음";
    if (warn.code === "after") return "기간 이후 예정";
    return warn.text;
  }

  function statusBadge(id, label) {
    return '<span class="st-badge st-' + esc(id || "") + '">' + esc(label) + "</span>";
  }

  function typeBadge(label) {
    return '<span class="chip revenue-type-badge">' + esc(label) + "</span>";
  }

  function catBadge(id, label, opts) {
    opts = opts || {};
    var text = label || categoryLabel(id) || id;
    if (opts.static) return '<span class="cat-badge">' + esc(text) + "</span>";
    return '<button type="button" class="cat-badge' + (opts.active ? " active" : "") +
      '" data-action="filter-plan-category" data-category="' + esc(id || "") + '">' + esc(text) + "</button>";
  }

  function listedProjects(state, ui) {
    var filter = (ui && ui.planFilter) || "all";
    var catFilter = (ui && ui.planCategory) || "";
    var rank = {};
    revenuePlanOrder().forEach(function (entry, i) {
      rank[entry.cat.id] = i;
    });
    var rows = [];
    (state.projects || []).forEach(function (p, idx) {
      if (!p) return;
      var type = isSalesCat(p.category) ? "sales" : "work";
      if (filter !== "all" && filter !== type) return;
      if (catFilter && p.category !== catFilter) return;
      rows.push({
        project: p,
        idx: idx,
        type: type,
        rank: rank[p.category] != null ? rank[p.category] : 999
      });
    });
    rows.sort(function (a, b) {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.idx - b.idx;
    });
    if (ui && ui.revenueDraft) {
      var draft = ui.revenueDraft;
      var draftType = isSalesCat(draft.category) ? "sales" : "work";
      if ((filter === "all" || filter === draftType) && (!catFilter || draft.category === catFilter)) {
        var sourceIdx = -1;
        (state.projects || []).forEach(function (p, idx) {
          if (p && p.id === ui.revenueDraftSourceId) sourceIdx = idx;
        });
        rows.push({
          project: draft,
          idx: sourceIdx >= 0 ? sourceIdx + 0.5 : 9999,
          type: draftType,
          rank: rank[draft.category] != null ? rank[draft.category] : 999,
          draft: true
        });
        rows.sort(function (a, b) {
          if (a.rank !== b.rank) return a.rank - b.rank;
          return a.idx - b.idx;
        });
      }
    }
    return rows;
  }

  function workExpenseMonthCount(project, state) {
    var detail = App.Engine.calculateProjectExpenseDetail(project, state);
    return Object.keys((detail && detail.months) || {}).length;
  }

  function workPeriodHint(project, state) {
    var amount = App.Engine.calculateProjectExpenseRegisteredTotal
      ? App.Engine.calculateProjectExpenseRegisteredTotal(project, state)
      : 0;
    if (!amount) return "";
    var n = workExpenseMonthCount(project, state);
    if (n) return "진행비 월별 " + n + "개월";
    return "촬영월 없음 · 현금 0";
  }

  function projectVatAmount(project, state) {
    App.Defaults.ensureVatSettings(state);
    var rate = App.Money.toRatio(state.settings.vat.rate);
    return App.Money.roundWon(App.Engine.projectContractAmount(project) * rate);
  }

  function workPathPrefix(pi, isDraft) {
    return isDraft ? "revenueDraft." : "projects." + pi + ".";
  }

  function workActionAttrs(pi, isDraft) {
    return isDraft ? ' data-draft="1"' : ' data-index="' + pi + '"';
  }

  function renderWorkRow(project, pi, state, result, ui, opts) {
    opts = opts || {};
    var isDraft = !!opts.draft;
    var open = isDraft || isWorkItemOpen(ui, project.id);
    var cancelled = project.status === "cancelled";
    var off = !isDraft && (cancelled || project.includeInBudget === false);
    var catId = project.category || "";
    var pay = workPayView(project, isDraft ? null : gapItemForProject(revenueGapOf(state, result), project));
    var scale = isSalesCat(project.category) ? "" : App.Format.formatCount(project.episodes, project.category);
    var hint = workPeriodHint(project, state);
    var html = '<details class="work-item' + (off ? " off" : "") + (isDraft ? " is-draft" : "") +
      '" data-work-item="' + esc(project.id) + '"' + (open ? " open" : "") + ">";
    html += '<summary><div class="work-grid work-row">';
    html += '<span class="work-kind">' + familyBadge(isSalesCat(project.category) ? "영업" : "작품") + "</span>";
    html += '<span class="work-cat">' + catBadge(catId, categoryLabel(catId), { active: ui && ui.planCategory === catId }) + "</span>";
    html += '<span class="work-name"><span class="work-title-row"><i class="chev" aria-hidden="true"></i>' +
      '<span class="work-title">' + esc(project.name || "이름 없는 건") + "</span>";
    if (scale) html += '<span class="work-name-meta">' + esc(scale) + "</span>";
    else if (pay.text && !pay.tone) html += '<span class="work-name-meta">' + esc(pay.text) + "</span>";
    html += "</span>";
    if (pay.tone) {
      html += '<span class="work-pay-flag recon-' + pay.tone + '"' +
        (pay.title ? ' title="' + esc(pay.title) + '"' : "") + ">" + esc(pay.text) + "</span>";
    }
    html += "</span>";
    html += '<span class="work-amt" data-computed="total" data-index="' + pi + '">' +
      App.Format.formatWon(App.Engine.projectContractAmount(project)) + "</span>";
    html += '<span class="work-vat" data-computed="work-vat" data-index="' + pi + '">' +
      App.Format.formatWon(projectVatAmount(project, state)) + "</span>";
    html += '<span class="work-xp" data-computed="proj-expense-compact" data-index="' + pi + '">' +
      projectExpenseCompactHtml(project, state) + "</span>";
    html += '<span class="work-period">' + esc(workShootText(project));
    if (hint) html += '<span class="work-period-hint">' + esc(hint) + "</span>";
    html += "</span>";
    html += '<span class="work-status">';
    if (isDraft) {
      html += statusBadge("expected", "미저장");
    } else if (project.status && project.status !== "expected") {
      html += statusBadge(project.status, workStatusLabel(project.status));
    }
    html += '<span class="work-ops">';
    if (isDraft) {
      html += '<button type="button" class="btn primary" data-action="save-revenue-draft">저장</button>';
      html += '<button type="button" class="btn" data-action="cancel-revenue-draft">취소</button>';
    } else {
      html += '<button type="button" class="btn" data-action="edit-project" data-id="' + esc(project.id) + '">수정</button>';
      html += '<button type="button" class="btn" data-action="copy-project" data-id="' + esc(project.id) + '">복사</button>';
      html += '<button type="button" class="btn danger" data-action="remove-project" data-index="' + pi + '">삭제</button>';
    }
    html += "</span></span>";
    html += "</div></summary>";
    html += '<div class="work-item-body">' + renderWorkCard(project, pi, state, result, true, ui, { draft: isDraft });
    html += '<div class="work-item-foot">';
    if (isDraft) {
      html += '<button type="button" class="btn primary" data-action="save-revenue-draft">저장</button>';
      html += '<button type="button" class="btn" data-action="cancel-revenue-draft">취소</button>';
    } else {
      if (!cancelled && project.status !== "confirmed") {
        html += '<button type="button" class="btn" data-action="confirm-project" data-index="' + pi + '">확정</button>';
      }
    }
    html += "</div></div>";
    html += "</details>";
    return html;
  }

  function renderRevenueTypeGroup(label, rows, state, result, ui) {
    if (!rows.length) return "";
    var sum = 0;
    var n = 0;
    var html = '<div class="rev-group">';
    rows.forEach(function (row) {
      if (!row.draft && row.project.status !== "cancelled") {
        n += 1;
        sum += App.Engine.projectContractAmount(row.project);
      }
      html += renderWorkRow(row.project, row.idx, state, result, ui, { draft: !!row.draft });
    });
    if (n) {
      html += '<div class="work-grid rev-sub">';
      html += '<span class="work-kind">' + familyBadge(label) + "</span>";
      html += "<span></span>";
      html += "<span>" + esc(label) + " 소계</span>";
      html += '<span class="work-amt">' + App.Format.formatWon(sum) + "</span>";
      html += "<span></span><span></span>";
      html += "<span>" + n + "건</span>";
      html += "<span></span>";
      html += "</div>";
    }
    html += "</div>";
    return html;
  }

  function renderRevenueLedger(state, result, ui) {
    var rows = listedProjects(state, ui);
    var html = '<div class="rev-ledger">';
    html += '<div class="work-grid work-cols" aria-hidden="true">';
    html += "<span>상위구분</span><span>구분</span><span>건명</span><span class=\"num num-center\">금액</span>" +
      "<span class=\"num num-center\">부가세</span><span class=\"num\">진행비</span><span>기간</span><span>상태</span></div>";
    if (!rows.length) {
      html += '<div class="plan-empty-line"><span>등록된 수익 건이 없습니다.</span></div>';
      html += "</div>";
      return html;
    }
    var workRows = rows.filter(function (row) { return row.type !== "sales"; });
    var salesRows = rows.filter(function (row) { return row.type === "sales"; });
    html += renderRevenueTypeGroup("작품", workRows, state, result, ui);
    html += renderRevenueTypeGroup("영업", salesRows, state, result, ui);
    html += "</div>";
    return html;
  }

  function revenuePlanOrder() {
    var workIds = ["drama", "ott", "movie", "variety", "performance"];
    var salesIds = ["ad", "ambassador", "seeding", "pictorial", "magazine", "event", "salesOther"];
    var order = [];
    workIds.forEach(function (id) {
      var c = (App.WorkCategories || []).filter(function (x) { return x.id === id; })[0];
      if (c) order.push({ cat: c, type: "work" });
    });
    salesIds.forEach(function (id) {
      var c = (App.SalesCategories || []).filter(function (x) { return x.id === id; })[0];
      if (c) order.push({ cat: c, type: "sales" });
    });
    var other = (App.WorkCategories || []).filter(function (x) { return x.id === "other"; })[0];
    if (other) order.push({ cat: other, type: "work" });
    return order;
  }

  function planFilterBar(ui) {
    var active = (ui && ui.planFilter) || "all";
    var opts = [{ id: "all", label: "전체" }, { id: "work", label: "작품" }, { id: "sales", label: "영업" }];
    var html = '<div class="plan-filter">';
    opts.forEach(function (o) {
      html += '<button type="button" class="plan-filter-btn' + (active === o.id ? " active" : "") +
        '" data-action="set-plan-filter" data-filter="' + esc(o.id) + '">' + esc(o.label) + "</button>";
    });
    html += "</div>";
    return html;
  }

  function revenueRateSummaryText(state) {
    App.Defaults.ensureRevenueExpenseRates(state);
    var rates = state.settings.revenueExpenseRates;
    return "작품 " + pctView(rates.work) + "% · 영업 " + pctView(rates.sales) +
      "% · 시딩 " + rates.appearanceLight + "배 · 광고 " + rates.appearanceHeavy + "배";
  }

  function renderRevenueRateBar(state) {
    App.Defaults.ensureRevenueExpenseRates(state);
    var rates = state.settings.revenueExpenseRates;
    var html = '<div class="rev-rate-groups">';
    html += '<div class="rev-rate-group">';
    html += "<h3>진행비 기본률</h3>";
    html += '<div class="rev-rate-row"><span>작품</span>' +
      percentInput("settings.revenueExpenseRates.work", pctView(rates.work), 'data-kind="fee-rate"') + "</div>";
    html += '<div class="rev-rate-row"><span>영업</span>' +
      percentInput("settings.revenueExpenseRates.sales", pctView(rates.sales), 'data-kind="fee-rate"') + "</div>";
    html += '<p class="muted small">드라마·영화·OTT 등 작품과, 헤메·식대 자동이 아닌 영업 건에 씁니다. 기본값 사용이 켜진 건은 계약금액 × 이 비율입니다.</p>';
    html += "</div>";
    html += '<div class="rev-rate-group rev-rate-group-mult">';
    html += "<h3>헤메·식대 배율</h3>";
    html += '<div class="rev-rate-row"><span>시딩·행사·앰버서더</span>' +
      withUnit(textInput("settings.revenueExpenseRates.appearanceLight", rates.appearanceLight, 'data-kind="number" inputmode="decimal"'), "배") +
      "</div>";
    html += '<div class="rev-rate-row"><span>광고·화보</span>' +
      withUnit(textInput("settings.revenueExpenseRates.appearanceHeavy", rates.appearanceHeavy, 'data-kind="number" inputmode="decimal"'), "배") +
      "</div>";
    html += '<p class="muted small">계약금 % 대신 헤어·메이크업·스타일링 1회 단가와 당일 식대에 횟수와 배율을 곱합니다.</p>';
    html += "</div></div>";
    return html;
  }

  function renderRevenueRateHelpModal(state) {
    var html = '<div class="app-modal-backdrop" role="presentation">';
    html += '<div class="app-modal app-modal-rates" role="dialog" aria-modal="true" aria-labelledby="rev-rate-help-title">';
    html += '<div class="app-modal-head">';
    html += '<h3 id="rev-rate-help-title">진행비·배율</h3>';
    html += '<button type="button" class="app-modal-x" data-action="close-revenue-rate-help" aria-label="닫기">×</button>';
    html += "</div>";
    html += '<div class="app-modal-body">';
    html += renderRevenueRateBar(state);
    html += '<section class="app-modal-section"><h4>개별 수익의 우선순위</h4>';
    html += '<p class="app-modal-note">개별 수익에서 진행비 반영을 끄면 진행비는 0입니다. 수동 금액 사용을 켜면 입력한 총액이 사용됩니다. 헤메·식대 자동 또는 기본값 사용을 끄면 계약금액 × 해당 건의 진행비율로 계산합니다.</p>';
    html += "</section>";
    html += "</div>";
    html += '<div class="app-modal-foot"><button type="button" class="btn" data-action="close-revenue-rate-help">확인</button></div>';
    html += "</div></div>";
    return html;
  }

  function renderRevenuePlan(state, result, ui) {
    App.Defaults.ensureState(state);
    var addCat = (ui && ui.planAddCategory) || "drama";
    var html = '<div class="card rates-card setup-block">';
    html += '<div class="rev-plan-head">';
    html += "<h2>매출 계획</h2>";
    html += '<button type="button" class="btn btn-sm rev-rate-btn" data-action="open-revenue-rate-help">';
    html += "<span>진행비·배율</span>";
    html += '<span class="rev-rate-btn-vals" data-computed="rev-rate-summary">' +
      esc(revenueRateSummaryText(state)) + "</span>";
    html += "</button>";
    html += "</div>";
    html += '<div class="rev-toolbar">';
    html += planFilterBar(ui);
    html += '<label class="rev-add-cat"><span>카테고리</span>' +
      '<select data-plan-add-cat>' +
      workCategoryOptions({ category: addCat }).map(function (c) {
        return '<option value="' + esc(c.id) + '"' + (c.id === addCat ? " selected" : "") + ">" + esc(c.label) + "</option>";
      }).join("") + "</select></label>";
    html += '<button type="button" class="btn primary" data-action="add-revenue">+ 수익 추가</button>';
    html += "</div>";
    html += '<p class="muted small">왼쪽 금액이 오른쪽 작품·영업 소계로 모입니다. 수정·복사·삭제는 각 행에서 하고, 복사본은 저장해야 합계에 반영됩니다.</p>';
    html += renderRevenueGapBanner(revenueGapOf(state, result));
    html += renderRevenueLedger(state, result, ui);
    html += "</div>";
    return html;
  }

  function renderRateAccordion(state, group, rates, open, ui) {
    var html = '<details class="rate-acc plan-cat" data-rate-group="' + esc(group.id) + '"' + (open ? " open" : "") + ">";
    html += '<summary><div class="plan-cat-head">';
    html += '<span class="chev" aria-hidden="true"></span>';
    html += '<span class="plan-cat-title"><span class="plan-cat-name">' + esc(group.label) + "</span>" + typeBadge("영업") + "</span>";
    html += '<span class="plan-cat-meta" data-computed="rate-meta" data-group="' + esc(group.id) + '">' +
      App.Defaults.salesGroupCompactMeta(group) + "</span>";
    html += '<b class="plan-cat-amt" data-computed="rate-plan-amt" data-group="' + esc(group.id) + '">' +
      App.Format.formatWon(group.plannedAmount) + "</b>";
    html += '<button type="button" class="btn btn-sm" data-action="add-sales-plan" data-group="' + esc(group.id) +
      '" title="' + esc(group.label) + ' 활동 추가">+</button>';
    html += "</div></summary>";
    html += '<div class="rate-acc-body">';
    html += '<div class="rate-bar">';
    group.rateRows.forEach(function (row, i) {
      if (i) html += '<span class="rate-bar-sep" aria-hidden="true">|</span>';
      html += '<div class="rate-bar-item">';
      html += '<b>' + esc(row.basis) + "</b>";
      html += '<span class="muted">기본단가</span>';
      html += moneyInput("profile.baseRates." + row.rateKey, App.Defaults.getBaseRate(rates, row));
      html += '<span class="muted">목표</span>';
      html += withUnit(
        textInput("profile.baseRates." + row.countKey, App.Defaults.getExpectedCount(rates, row), 'data-kind="count"'),
        row.unit,
        "compact-count"
      );
      html += "</div>";
    });
    html += "</div>";
    html += '<div class="rate-expected">목표기준 예상 <b data-computed="rate-group" data-group="' + esc(group.id) + '">' +
      App.Format.formatWon(group.targetAmount) + "</b></div>";
    html += renderGroupPlanTable(state, group, ui);
    html += "</div></details>";
    return html;
  }

  function groupPlanItems(state, group) {
    var items = [];
    (state.salesPlans || []).forEach(function (plan, idx) {
      if (plan.category === group.category || (group.rateRows || []).some(function (row) { return row.id === plan.rateId; })) {
        items.push({ plan: plan, idx: idx });
      }
    });
    return items;
  }

  function planTermLabel(plan, group) {
    if (!group || !(group.rateRows || []).length) return "";
    if (group.rateRows.length === 1) return group.rateRows[0].basis;
    var row = group.rateRows.filter(function (r) { return r.id === plan.rateId; })[0];
    if (row) return row.basis;
    if (plan.term === "months12") return "12개월";
    if (plan.term === "months6") return "6개월";
    return "";
  }

  function planPayLabel(plan) {
    var n = (plan.payments || []).length;
    if (!n) return "미설정";
    return n + "회";
  }

  function planStatusLabel(plan) {
    if (plan.converted) return "계약 등록됨";
    var st = (App.PlanStatuses || []).filter(function (s) { return s.id === (plan.planStatus || "planned"); })[0];
    return st ? st.label : "계획";
  }

  function planStatusOptions(plan) {
    var allow = { planned: true, negotiating: true, confirmed: true };
    if (plan && plan.planStatus === "scheduled") allow.scheduled = true;
    return (App.PlanStatuses || []).filter(function (s) { return allow[s.id]; });
  }

  function planScaleLabel(group) {
    var unit = (group.rateRows && group.rateRows[0] && group.rateRows[0].unit) || "건";
    return "1" + unit;
  }

  function renderGroupPlanTable(state, group, ui) {
    var plans = groupPlanItems(state, group);
    var editId = ui && ui.planEditId;
    var payOpen = (ui && ui.planPayOpen) || {};
    var html = '<div class="plan-list">';
    if (!plans.length) {
      html += '<div class="plan-empty-line"><span>등록된 항목 없음</span>' +
        '<button type="button" class="btn btn-sm" data-action="add-sales-plan" data-group="' + esc(group.id) + '">+ 추가</button></div>';
      html += "</div>";
      return html;
    }
    html += '<div class="plan-grid plan-cols" aria-hidden="true">';
    html += "<span>활동명</span><span>배지</span><span>규모</span><span>금액</span><span>예상시기</span><span>지급</span><span>관리</span></div>";
    plans.forEach(function (item) {
      var plan = item.plan;
      var editing = !plan.converted && editId === plan.id;
      var openPay = !!payOpen[plan.id];
      html += '<div class="plan-block' + (plan.includeInBudget ? "" : " off") + (plan.converted ? " converted" : "") + '">';
      if (editing) html += renderPlanEditRow(plan, item.idx, group);
      else html += renderPlanViewRow(plan, item.idx, group, openPay);
      if (openPay) html += renderPlanPayPanel(plan, item.idx, state.profile.startMonth);
      html += "</div>";
    });
    html += "</div>";
    return html;
  }

  function renderPlanViewRow(plan, idx, group, openPay) {
    var statusId = plan.converted ? "confirmed" : (plan.planStatus || "planned");
    var html = '<div class="plan-grid plan-row">';
    html += '<span class="plan-name">' + esc(plan.name || "이름 없는 활동") + "</span>";
    html += '<span class="plan-badges">' + typeBadge("영업") + statusBadge(statusId, planStatusLabel(plan)) +
      (!plan.converted && !plan.includeInBudget ? statusBadge("off", "미반영") : "") + "</span>";
    html += '<span class="plan-scale">' + esc(planScaleLabel(group)) + "</span>";
    html += '<span class="plan-amt">' + App.Format.formatWon(plan.amount) + "</span>";
    html += '<span class="plan-month">' + esc(plan.month || "미정") + "</span>";
    html += '<span class="plan-pay">';
    html += '<button type="button" class="btn-link" data-action="toggle-plan-pay" data-id="' + esc(plan.id) + '">' +
      (openPay ? "▼ " : "") + esc(planPayLabel(plan)) + (openPay ? "" : " >") + "</button>";
    html += "</span>";
    html += '<span class="plan-ops">';
    if (!plan.converted) {
      html += '<button type="button" class="btn" data-action="edit-sales-plan" data-id="' + esc(plan.id) + '">수정</button> ';
      if (plan.planStatus !== "confirmed") {
        html += '<button type="button" class="btn" data-action="convert-sales-plan" data-id="' + esc(plan.id) + '">확정</button> ';
      }
    }
    html += '<button type="button" class="btn danger" data-action="remove-sales-plan" data-id="' + esc(plan.id) + '">삭제</button>';
    html += "</span></div>";
    return html;
  }

  function renderPlanEditRow(plan, idx, group) {
    var p = "salesPlans." + idx + ".";
    var split = group.rateRows.length > 1;
    var html = '<div class="plan-grid plan-row plan-edit">';
    html += "<span>" + textInput(p + "name", plan.name, 'placeholder="활동명"') + "</span>";
    html += "<span>";
    if (split) {
      html += selectInput(p + "rateId", plan.rateId || group.rateRows[0].id, group.rateRows.map(function (row) {
        return { id: row.id, label: row.basis };
      }));
    } else {
      html += typeBadge("영업");
    }
    html += "</span>";
    html += "<span>" + selectInput(p + "planStatus", plan.planStatus || "planned", planStatusOptions(plan)) + "</span>";
    html += "<span>" + moneyInput(p + "amount", plan.amount) + "</span>";
    html += "<span>" + isoMonthInput(p + "month", plan.month) + "</span>";
    html += '<span class="plan-pay"><button type="button" class="btn-link" data-action="toggle-plan-pay" data-id="' +
      esc(plan.id) + '">' + esc(planPayLabel(plan)) + " ></button></span>";
    html += '<span class="plan-ops">';
    html += '<label class="check"><input type="checkbox" data-path="' + p +
      'includeInBudget" data-kind="bool"' + (plan.includeInBudget ? " checked" : "") + ">예산</label> ";
    html += '<button type="button" class="btn primary" data-action="save-sales-plan">저장</button> ';
    html += '<button type="button" class="btn danger" data-action="remove-sales-plan" data-id="' + esc(plan.id) + '">삭제</button>';
    html += "</span></div>";
    return html;
  }

  function renderPlanPayPanel(plan, idx, startMonth) {
    var pays = plan.payments || [];
    var total = App.Money.roundWon(plan.amount);
    var paySum = 0;
    pays.forEach(function (pay) {
      paySum += App.Engine.resolvePlanPaymentAmount(plan, pay);
    });
    var pctSum = total ? Math.round(paySum / total * 1000) / 10 : 0;
    var diff = paySum - total;
    var html = '<div class="plan-pay-panel">';
    html += "<h4>지급 일정</h4>";
    html += '<table class="plan-pay-table"><thead><tr><th>항목</th><th class="num">비율</th><th>예상 입금월</th><th class="num">금액</th><th></th></tr></thead><tbody>';
    pays.forEach(function (pay, yi) {
      var pp = "salesPlans." + idx + ".payments." + yi + ".";
      var amt = App.Engine.resolvePlanPaymentAmount(plan, pay);
      var pctView = "";
      if (pay.inputMode === "amount" && total) {
        pctView = String(Math.round(amt / total * 1000) / 10);
      } else if (App.Money.toSafeNumber(pay.percentage)) {
        pctView = String(Math.round(App.Money.toSafeNumber(pay.percentage) * 1000) / 10);
      }
      html += "<tr><td>" + textInput(pp + "label", pay.label) + "</td>";
      html += '<td class="num">' + percentInput(pp + "percentage", pctView, 'data-kind="percent"', "compact-pct") + "</td>";
      html += "<td>" + isoMonthInput(pp + "expectedMonth", pay.expectedMonth) + "</td>";
      html += "<td class=\"num\">" + moneyInput(pp + "amount", amt, 'data-plan-pay="' + idx + "-" + yi + '"') +
        (pay.inputMode === "amount" ? '<div class="chip">수동</div>' : '<div class="auto">자동</div>') + "</td>";
      html += '<td><button type="button" class="btn danger" data-action="remove-plan-payment" data-id="' +
        esc(plan.id) + '" data-pay="' + yi + '">삭제</button></td></tr>';
    });
    if (!pays.length) {
      html += '<tr><td colspan="5" class="muted small">지급일정이 없습니다. 없으면 예상시기 월에 모델료 전액이 들어갑니다.</td></tr>';
    }
    html += "</tbody><tfoot><tr class=\"total-row\"><td>합계</td>";
    html += '<td class="num" data-computed="plan-pct-sum" data-plan="' + idx + '">' + pctSum + "%</td><td></td>";
    html += '<td class="num"><span data-computed="plan-pay-sum" data-plan="' + idx + '">' + App.Format.formatWon(paySum) + "</span>";
    if (total && diff) {
      html += '<div class="about" style="color:var(--warn)">모델료와 ' + App.Format.formatWon(Math.abs(diff)) +
        (diff < 0 ? " 부족" : " 초과") + "</div>";
    }
    html += "</td><td></td></tr></tfoot></table>";
    html += '<div class="inline plan-pay-actions">';
    html += '<button type="button" class="btn" data-action="lump-plan-payment" data-id="' + esc(plan.id) + '">100% 일시불</button>';
    html += '<button type="button" class="btn" data-action="add-plan-payment" data-id="' + esc(plan.id) + '">+ 지급 추가</button>';
    html += "</div></div>";
    return html;
  }

  function patchSales(root, state) {
    if (!root || !root.querySelector(".view-revenue, .rates-card")) return;
    root.querySelectorAll('[data-computed="rev-rate-summary"]').forEach(function (el) {
      el.textContent = revenueRateSummaryText(state);
    });
    var progress = App.Defaults.salesPlanProgress(state);
    (progress.groups || []).forEach(function (g) {
      root.querySelectorAll('[data-computed="rate-meta"][data-group="' + g.id + '"]').forEach(function (el) {
        el.textContent = App.Defaults.salesGroupCompactMeta(g);
      });
      root.querySelectorAll('[data-computed="rate-plan-amt"][data-group="' + g.id + '"]').forEach(function (el) {
        el.textContent = App.Format.formatWon(g.plannedAmount);
      });
      root.querySelectorAll('[data-computed="rate-group"][data-group="' + g.id + '"]').forEach(function (el) {
        el.textContent = App.Format.formatWon(g.targetAmount);
      });
    });
    root.querySelectorAll('[data-computed="plan-grand"]').forEach(function (el) {
      el.textContent = App.Format.formatWon(progress.plannedTotal);
    });
    root.querySelectorAll('[data-computed="plan-unplaced"]').forEach(function (el) {
      el.textContent = App.Format.formatWon(progress.unplacedTotal);
    });
    (state.projects || []).forEach(function (project, pi) {
      var detail = App.Engine.calculateProjectExpenseDetail(project, state);
      var included = project.expenseInclude !== false;
      var monthCount = Object.keys(detail.months).length;
      var avg = monthCount ? Math.round(detail.total / monthCount) : 0;
      var pctVal = projectExpensePctView(project, state);
      root.querySelectorAll('[data-computed="proj-expense-total"][data-index="' + pi + '"]').forEach(function (el) {
        el.textContent = App.Format.formatWon(detail.total);
      });
      root.querySelectorAll('[data-computed="proj-expense-summary"][data-index="' + pi + '"]').forEach(function (el) {
        el.textContent = projectExpenseSummaryText(project, detail, monthCount, avg, included);
      });
      root.querySelectorAll('[data-computed="proj-expense-compact"][data-index="' + pi + '"]').forEach(function (el) {
        el.innerHTML = projectExpenseCompactHtml(project, state);
      });
      var rateInp = root.querySelector('input[data-path="projects.' + pi + '.expenseRate"]');
      if (rateInp && document.activeElement !== rateInp && project.expenseRateMode === "default") {
        rateInp.value = pctVal;
      }
      root.querySelectorAll('input[data-kind="expense-mode"][data-path="projects.' + pi + '.expenseRateMode"]').forEach(function (el) {
        el.checked = project.expenseRateMode === "default";
      });
    });
    (state.salesPlans || []).forEach(function (plan, i) {
      var total = App.Money.roundWon(plan.amount);
      var paySum = 0;
      (plan.payments || []).forEach(function (pay, j) {
        var amt = App.Engine.resolvePlanPaymentAmount(plan, pay);
        paySum += amt;
        var inp = root.querySelector('input[data-plan-pay="' + i + "-" + j + '"]');
        if (inp && document.activeElement !== inp && pay.inputMode !== "amount") {
          inp.value = App.Format.formatGrouped(amt);
        }
      });
      var pctSum = total ? Math.round(paySum / total * 1000) / 10 : 0;
      root.querySelectorAll('[data-computed="plan-pct-sum"][data-plan="' + i + '"]').forEach(function (el) {
        el.textContent = pctSum + "%";
      });
      root.querySelectorAll('[data-computed="plan-pay-sum"][data-plan="' + i + '"]').forEach(function (el) {
        el.textContent = App.Format.formatWon(paySum);
      });
    });
    var cats = [].concat(App.WorkCategories || [], App.SalesCategories || []);
    cats.forEach(function (c) {
      var stats = categoryWorkStats(projectsInCategory(state, c.id));
      root.querySelectorAll('[data-computed="work-count"][data-cat="' + c.id + '"]').forEach(function (el) {
        el.textContent = stats.n + "건";
      });
      root.querySelectorAll('[data-computed="work-amt"][data-cat="' + c.id + '"]').forEach(function (el) {
        el.textContent = App.Format.formatWon(stats.sum);
      });
    });
    (state.projects || []).forEach(function (p, i) {
      if (!p || p.status === "cancelled") return;
      var amt = App.Engine.projectContractAmount(p);
      root.querySelectorAll('[data-computed="reg-amt"][data-kind="project"][data-index="' + i + '"]').forEach(function (el) {
        el.textContent = App.Format.formatWon(amt);
      });
    });
    (state.salesPlans || []).forEach(function (plan, i) {
      if (!plan || plan.converted) return;
      var amt = App.Money.roundWon(plan.amount);
      root.querySelectorAll('[data-computed="reg-amt"][data-kind="plan"][data-index="' + i + '"]').forEach(function (el) {
        el.textContent = App.Format.formatWon(amt);
      });
    });
    var regWorks = registeredDealTotal(state, false);
    var regPlans = registeredDealTotal(state, true);
    var regWorkXp = registeredExpenseTotal(state, false);
    var regSalesXp = registeredExpenseTotal(state, true);
    var regTotal = App.Money.roundWon(regWorks + regPlans);
    var regXpTotal = App.Money.roundWon(regWorkXp + regSalesXp);
    root.querySelectorAll('[data-computed="reg-works"]').forEach(function (el) {
      el.textContent = App.Format.formatWon(regWorks);
    });
    root.querySelectorAll('[data-computed="reg-plans"]').forEach(function (el) {
      el.textContent = App.Format.formatWon(regPlans);
    });
    root.querySelectorAll('[data-computed="reg-total"]').forEach(function (el) {
      el.textContent = App.Format.formatWon(regTotal);
    });
    root.querySelectorAll('[data-computed="reg-xp-total"]').forEach(function (el) {
      el.textContent = App.Format.formatWon(regXpTotal);
    });
    root.querySelectorAll('[data-computed="reg-net-after-xp"]').forEach(function (el) {
      el.textContent = App.Format.formatWon(App.Money.roundWon(regTotal - regXpTotal));
    });
  }

  function categoryLabel(id) {
    var cat = (App.Categories || []).filter(function (c) { return c.id === id; })[0];
    return cat ? cat.label : (id || "");
  }

  function registeredContractRows(state) {
    var rows = [];
    (state.projects || []).forEach(function (p, idx) {
      if (!p || p.status === "cancelled") return;
      rows.push({
        kind: "project",
        id: p.id,
        index: idx,
        typeLabel: isSalesCat(p.category) ? "영업" : "작품",
        catId: p.category,
        cat: categoryLabel(p.category),
        name: p.name || "이름 없는 건",
        statusId: p.status || "",
        statusLabel: workStatusLabel(p.status),
        amount: App.Engine.projectContractAmount(p)
      });
    });
    (state.salesPlans || []).forEach(function (plan, idx) {
      if (!plan || plan.converted) return;
      rows.push({
        kind: "plan",
        id: plan.id,
        index: idx,
        typeLabel: "영업",
        catId: plan.category,
        cat: categoryLabel(plan.category),
        name: plan.name || "이름 없는 활동",
        statusId: plan.planStatus || "planned",
        statusLabel: planStatusLabel(plan),
        amount: App.Money.roundWon(plan.amount)
      });
    });
    return rows;
  }

  function renderRegisteredSideRow(row, gap) {
    var item = gapItemForRow(gap, row);
    var memo = gapItemMemo(item);
    var tone = item && item.severity ? item.severity : "";
    var html = '<article class="reg-row' + (tone ? " recon-" + tone : "") + '">';
    html += '<div class="reg-line"><span class="reg-name">' + catBadge(row.catId, row.cat, { static: true }) +
      '<span class="reg-title">' + esc(row.name) + "</span></span>";
    html += '<div class="reg-amt" data-computed="reg-amt" data-kind="' + esc(row.kind) + '" data-index="' + row.index + '">' +
      App.Format.formatWon(row.amount) + "</div></div>";
    if (memo) html += '<p class="reg-memo">' + esc(memo) + "</p>";
    html += "</article>";
    return html;
  }

  function renderConfirmedContracts(state, result) {
    var rows = registeredContractRows(state);
    var gap = revenueGapOf(state, result);
    var works = registeredDealTotal(state, false);
    var plans = registeredDealTotal(state, true);
    var workXp = registeredExpenseTotal(state, false);
    var salesXp = registeredExpenseTotal(state, true);
    var totalRevenue = App.Money.roundWon(works + plans);
    var totalExpense = App.Money.roundWon(workXp + salesXp);
    var netAfterExpense = App.Money.roundWon(totalRevenue - totalExpense);
    var workRows = rows.filter(function (row) { return row.typeLabel !== "영업"; });
    var salesRows = rows.filter(function (row) { return row.typeLabel === "영업"; });
    var html = '<aside class="card setup-side">';
    html += "<h2>등록 수익</h2>";
    html += '<p class="muted small setup-side-note">왼쪽 계약금액의 합입니다.</p>';
    html += '<div class="setup-side-body">';
    if (!rows.length) {
      html += '<p class="muted">등록된 수익 건이 없습니다.</p>';
    } else {
      if (workRows.length) {
        html += '<div class="reg-group">';
        workRows.forEach(function (row) { html += renderRegisteredSideRow(row, gap); });
        html += '<div class="reg-subtotal is-hero"><span>작품 소계</span><b data-computed="reg-works">' +
          App.Format.formatWon(works) + "</b></div>";
        html += "</div>";
      }
      if (salesRows.length) {
        html += '<div class="reg-group">';
        salesRows.forEach(function (row) { html += renderRegisteredSideRow(row, gap); });
        html += '<div class="reg-subtotal is-hero"><span>영업 소계</span><b data-computed="reg-plans">' +
          App.Format.formatWon(plans) + "</b></div>";
        html += "</div>";
      }
    }
    html += "</div>";
    html += '<div class="setup-side-foot">';
    if (gap && gap.hasIssues) {
      html += '<div class="recon-box">';
      html += '<div class="recon-line"><span>기간 내 입금</span><b>' + App.Format.formatWon(gap.inPeriod) + "</b></div>";
      if (gap.before) {
        html += '<div class="recon-line"><span>기간 이전</span><b>' + App.Format.formatWon(gap.before) + "</b></div>";
      }
      if (gap.after) {
        html += '<div class="recon-line"><span>기간 이후</span><b>' + App.Format.formatWon(gap.after) + "</b></div>";
      }
      html += '<div class="recon-line recon-gap"><span>등록 − 기간입금</span><b>' +
        App.Format.formatWon(gap.gap) + "</b></div>";
      html += "</div>";
    }
    html += '<div class="reg-final-title">TOTAL</div>';
    html += '<div class="reg-total"><span>총 매출</span><b data-computed="reg-total">' +
      App.Format.formatWon(totalRevenue) + "</b></div>";
    html += '<div class="reg-total xp"><span>총 진행비</span><b data-computed="reg-xp-total">' +
      App.Format.formatWon(totalExpense) + "</b></div>";
    html += '<div class="reg-total net"><span>진행비 차감 후 수익</span><b data-computed="reg-net-after-xp">' +
      App.Format.formatWon(netAfterExpense) + "</b></div>";
    html += "</div></aside>";
    return html;
  }

  function paymentTable(project, pi, start, compact, opts) {
    opts = opts || {};
    var isDraft = !!opts.draft;
    var prefix = workPathPrefix(pi, isDraft);
    var actionAttrs = workActionAttrs(pi, isDraft);
    var html = compact
      ? '<table class="pay-table"><thead><tr><th class="col-label">항목</th><th class="col-pct num">입금 %</th><th class="col-month">예상 입금일</th><th class="col-amt num">금액</th><th class="col-del"></th></tr></thead><tbody>'
      : '<table><thead><tr><th>항목</th><th class="num">입금 %</th><th>예상 입금월</th><th class="num">금액</th><th></th></tr></thead><tbody>';
    (project.payments || []).forEach(function (pay, yi) {
      var pp = prefix + "payments." + yi + ".";
      html += "<tr><td class=\"col-label\">" + textInput(pp + "label", pay.label) + "</td>";
      var pctView = "";
      var total = App.Engine.projectContractAmount(project);
      if (pay.inputMode === "amount" && total) {
        pctView = String(Math.round(App.Engine.resolvePaymentAmount(project, pay) / total * 1000) / 10);
      } else if (App.Money.toSafeNumber(pay.percentage)) {
        pctView = String(Math.round(App.Money.toSafeNumber(pay.percentage) * 1000) / 10);
      }
      html += '<td class="col-pct num">' + percentInput(pp + "percentage", pctView, 'data-kind="percent"', compact ? "compact-pct" : "") + "</td>";
      html += '<td class="col-month">' + (compact ? compactMonthInput(pp + "expectedMonth", pay.expectedMonth || start) : monthInput(pp + "expectedMonth", pay.expectedMonth || start)) + "</td>";
      if (compact) {
        html += '<td class="num col-amt"><span class="pay-auto"><span class="readonly" data-computed="pay" data-index="' + pi + '" data-pay="' + yi + '">' +
          App.Format.formatWon(App.Engine.resolvePaymentAmount(project, pay)) + '</span><span class="auto">자동</span></span></td>';
      } else {
        html += '<td class="num"><span class="readonly" data-computed="pay" data-index="' + pi + '" data-pay="' + yi + '">' +
          App.Format.formatWon(App.Engine.resolvePaymentAmount(project, pay)) + '</span><div class="auto">자동</div></td>';
      }
      html += '<td class="col-del"><button class="btn danger" data-action="remove-payment"' + actionAttrs + ' data-pay="' + yi + '">삭제</button></td></tr>';
    });
    if (!(project.payments || []).length) {
      var occur = App.Engine.projectOccurrenceMonth(project);
      var occurLabel = occur || "시작월";
      html += '<tr><td colspan="5" class="muted small">지급일정이 없습니다. 없으면 ' +
        esc(occurLabel) + "에 계약금액 전액이 월별 분석에 들어갑니다.</td></tr>";
    }
    var paySum = 0;
    var pctSum = 0;
    (project.payments || []).forEach(function (pay) {
      paySum += App.Engine.resolvePaymentAmount(project, pay);
      pctSum += App.Money.toSafeNumber(pay.percentage) * 100;
    });
    html += "</tbody>";
    html += '<tfoot><tr class="total-row"><td class="col-label">합계</td>';
    html += '<td class="num col-pct"><span data-computed="pct-sum" data-index="' + pi + '">' + (Math.round(pctSum * 10) / 10) + "%</span></td>";
    html += '<td class="col-month"></td>';
    html += '<td class="num col-amt"><span data-computed="pay-sum" data-index="' + pi + '">' + App.Format.formatWon(paySum) + "</span>";
    if (!compact) {
      html += '<div class="about">총출연료 <span data-computed="total" data-index="' + pi + '">' + App.Format.formatWon(App.Engine.projectContractAmount(project)) + "</span></div>";
    }
    html += '</td><td class="col-del"></td></tr></tfoot></table>';
    html += '<div class="inline" style="margin-top:8px">';
    App.PaymentPresets.forEach(function (preset) {
      html += '<button class="btn" data-action="add-payment"' + actionAttrs + ' data-label="' + esc(preset.label) +
        '" data-pct="' + preset.percentage + '">+ ' + esc(preset.label) + "</button>";
    });
    html += '<button class="btn" data-action="add-payment"' + actionAttrs + '>+ 지급 추가</button></div>';
    return html;
  }

  function projectExpensePctView(project, state) {
    return Math.round(App.Money.toSafeNumber(App.Defaults.resolvedExpenseRate(project, state)) * 10000) / 100;
  }

  function projectExpenseCompactHtml(project, state) {
    var detail = App.Engine.calculateProjectExpenseDetail(project, state);
    var amount = App.Engine.calculateProjectExpenseRegisteredTotal
      ? App.Engine.calculateProjectExpenseRegisteredTotal(project, state)
      : detail.total;
    if (detail.amountMode === "manual") {
      return '<span class="work-xp-amt">수동 · ' + App.Format.formatWon(amount) + "</span>";
    }
    if (detail.appearance) {
      return '<span class="work-xp-amt">헤메·식대 ×' + detail.appearance.multiplier + " · " +
        App.Format.formatWon(amount) + "</span>";
    }
    var pct = Math.round(App.Money.toSafeNumber(detail.rate) * 10000) / 100;
    return '<span class="work-xp-amt">' + pct + "% · " + App.Format.formatWon(amount) + "</span>";
  }

  function projectExpenseCompactText(project, state) {
    var detail = App.Engine.calculateProjectExpenseDetail(project, state);
    var amount = App.Engine.calculateProjectExpenseRegisteredTotal
      ? App.Engine.calculateProjectExpenseRegisteredTotal(project, state)
      : detail.total;
    if (detail.amountMode === "manual") return "수동 · " + App.Format.formatWon(amount);
    if (detail.appearance) {
      return "헤메·식대 ×" + detail.appearance.multiplier + " · " + App.Format.formatWon(amount);
    }
    var pct = Math.round(App.Money.toSafeNumber(detail.rate) * 10000) / 100;
    return pct + "% · " + App.Format.formatWon(amount);
  }

  function projectExpenseSummaryText(project, detail, monthCount, avg, included) {
    if (detail && detail.appearance) {
      var a = detail.appearance;
      var text = "헤어·메이크업·스타일링 " + App.Format.formatWon(a.session) +
        " + 당일 식대 " + App.Format.formatWon(a.meal) +
        " = " + App.Format.formatWon(a.base) +
        " × " + a.occurrences + "회 × " + a.multiplier;
      if (monthCount) text += " · " + (isSalesCat(project && project.category) ? "수행기간" : "촬영기간") +
        " " + monthCount + "개월 · 월 평균 약 " + App.Format.formatWon(avg);
      if (!included) text = "(반영 OFF · 참고값) " + text;
      return text;
    }
    if (!detail.total) {
      return isSalesCat(project && project.category)
        ? "진행비율을 입력하면 수행기간 또는 입금월에 자동 계산됩니다."
        : "진행비율을 입력하면 자동 계산됩니다.";
    }
    var label = isSalesCat(project && project.category) ? "수행기간" : "촬영기간";
    var text = (detail.amountMode === "manual" ? "수동 총액 · " : "") +
      label + " " + monthCount + "개월 · 월 평균 약 " + App.Format.formatWon(avg);
    if (!included) text = "(반영 OFF · 참고값) " + text;
    return text;
  }

  function renderProjectExpenseBlock(project, pi, ui, state, opts) {
    opts = opts || {};
    var isDraft = !!opts.draft;
    var prefix = workPathPrefix(pi, isDraft);
    var sales = isSalesCat(project.category);
    var detail = App.Engine.calculateProjectExpenseDetail(project, state);
    var included = project.expenseInclude !== false;
    var monthKeys = Object.keys(detail.months);
    var monthCount = monthKeys.length;
    var avg = monthCount ? Math.round(detail.total / monthCount) : 0;
    var open = !!(ui && ui.expenseDetailOpen && ui.expenseDetailOpen[project.id]);
    var pctVal = projectExpensePctView(project, state);
    var useDefault = project.expenseRateMode === "default";
    var useManualAmount = project.expenseAmountMode === "manual";
    var periodIssue = App.Engine.projectExpensePeriodIssue ? App.Engine.projectExpensePeriodIssue(project) : "";
    var html = '<div class="proj-expense-block' + (included ? "" : " off") + '"><h3>' +
      (sales ? "영업 진행비" : "프로젝트 진행비") + "</h3>";
    html += '<p class="muted small">' + (detail.appearance
      ? "계약금 % 대신 헤어·메이크업·스타일링 1회 단가와 당일 식대를 더한 뒤 배율을 곱합니다. 시딩·행사·앰버서더는 +50%(×1.5), 광고·유가화보는 3배수입니다. 단가는 세금·비교조건의 배우 개인 활동비에서 수정합니다."
      : (sales
        ? "계약금액 × 진행비율을 수행기간에 균등 배분합니다. 기간이 없으면 입금월에 반영합니다. 에이전시 수수료·회사 지원과 별개입니다."
        : "총출연료 × 진행비율을 촬영기간에 균등 배분합니다. 현장 식비·촬영 이동·현장 운영 등 작품 수행 직접비가 여기에 포함됩니다. 촬영 종료월이 없으면 촬영 시작월에 전액 반영합니다.")) + "</p>";
    html += '<div class="row-fields">';
    html += '<div class="field"><label class="check"><input type="checkbox" data-path="' + prefix +
      'expenseInclude" data-kind="bool"' + (included ? " checked" : "") + ">진행비 반영</label></div>";
    if (!detail.appearance) {
      html += '<div class="field"><label>진행비율</label>' +
        percentInput(prefix + "expenseRate", pctVal, 'data-kind="fee-rate"') + "</div>";
    }
    html += '<div class="field"><label class="check"><input type="checkbox" data-path="' + prefix +
      'expenseRateMode" data-kind="expense-mode"' + (useDefault ? " checked" : "") + ">" +
      (detail.appearance ? "헤메·식대 자동" : "기본값 사용") + "</label></div>";
    html += '<div class="field"><label class="check"><input type="checkbox" data-path="' + prefix +
      'expenseAmountMode" data-kind="expense-amount-mode"' + (useManualAmount ? " checked" : "") + ">수동 금액 사용</label></div>";
    html += '<div class="field"><label>수동 총 진행비</label>' +
      moneyInput(prefix + "expenseManualAmount", project.expenseManualAmount || 0, useManualAmount ? "" : "disabled") + "</div>";
    html += '<div class="field"><label>총 진행비</label><div class="readonly" data-computed="proj-expense-total" data-index="' +
      pi + '">' + App.Format.formatWon(detail.total) + "</div></div>";
    html += "</div>";
    if (periodIssue && detail.total) {
      html += '<p class="muted small recon-bad">' + esc(periodIssue) + "</p>";
    }
    html += '<p class="muted small" data-computed="proj-expense-summary" data-index="' + pi + '">' +
      projectExpenseSummaryText(project, detail, monthCount, avg, included) + "</p>";
    if (monthCount) {
      html += '<button type="button" class="btn-link" data-action="toggle-expense-detail" data-id="' + esc(project.id) + '">' +
        (open ? "▼ 월별 보기" : "월별 보기 >") + "</button>";
      if (open) {
        html += '<table class="mini-sum"><thead><tr><th>월</th><th class="num">진행비 (원)</th></tr></thead><tbody>';
        monthKeys.forEach(function (m) {
          html += "<tr><td>" + esc(m) + '</td><td class="num">' + App.Format.formatWon(detail.months[m]) + "</td></tr>";
        });
        html += "</tbody></table>";
      }
    }
    html += "</div>";
    return html;
  }

  function renderWorkCard(project, pi, state, result, full, ui, opts) {
    opts = opts || {};
    var isDraft = !!opts.draft;
    var start = state.profile.startMonth;
    var prefix = workPathPrefix(pi, isDraft);
    var actionAttrs = workActionAttrs(pi, isDraft);
    var labels = App.episodeFields(project.category);
    var sales = isSalesCat(project.category);
    var total = App.Engine.projectContractAmount(project);
    var html = '<div class="project">';
    html += '<div class="project-head"><div><span class="chip">' + esc((App.Categories.filter(function (c) { return c.id === project.category; })[0] || {}).label || project.category) +
      "</span> <b>" + esc(project.name || "이름 없는 건") + "</b></div>";
    if (!isDraft) {
      html += '<button class="btn danger" data-action="remove-project" data-index="' + pi + '">삭제</button>';
    }
    html += "</div>";
    html += '<div class="row-fields' + (full ? " contract-fields" : "") + '">';
    html += '<div class="field' + (full ? " field-name" : "") + '"><label>' +
      (sales ? "건명" : "작품명") + "</label>" + textInput(prefix + "name", project.name) + "</div>";
    html += '<div class="field' + (full ? " field-cat" : "") + '"><label>구분</label>' + selectInput(prefix + "category", project.category, workCategoryOptions(project)) + "</div>";
    if (full) {
      html += '<div class="field field-status"><label>상태</label>' + selectInput(prefix + "status", project.status, App.Statuses) + "</div>";
      html += '<div class="field"><label class="check"><input type="checkbox" data-path="' + prefix +
        'includeInBudget" data-kind="bool"' + (project.includeInBudget !== false ? " checked" : "") + ">예산 반영</label></div>";
      html += '<div class="field"><label class="check"><input type="checkbox" data-path="' + prefix +
        'vatApplicable" data-kind="bool"' + (project.vatApplicable !== false ? " checked" : "") + ">VAT 과세</label></div>";
    }
    if (sales) {
      html += '<div class="field' + (full ? " field-total" : "") + '"><label>계약 예상금액</label>' +
        moneyInput(prefix + "contractAmount", total) + "</div>";
    } else {
      html += '<div class="field' + (full ? " field-count" : "") + '"><label>' + esc(labels.count) + "</label>" +
        withUnit(textInput(prefix + "episodes", project.episodes, 'data-kind="number"'), labels.count === "횟수" ? "건" : "회", full ? "compact-count" : "") + "</div>";
      html += '<div class="field' + (full ? " field-fee" : "") + '"><label>' + esc(labels.unit) + "</label>" + moneyInput(prefix + "feePerEpisode", project.feePerEpisode) + "</div>";
      html += '<div class="field' + (full ? " field-total" : "") + '"><label>' + esc(labels.total) + ' <span class="auto">회차 × 단가</span></label>' +
        '<div class="readonly" data-computed="total" data-index="' + pi + '">' + App.Format.formatWon(total) + "</div></div>";
    }
    if (full) {
      html += '<div class="field field-month"><label>' + (sales ? "시작월" : "촬영 시작") +
        "</label>" + monthInput(prefix + "shootStartMonth", project.shootStartMonth) + "</div>";
      html += '<div class="field field-month"><label>' + (sales ? "종료월" : "촬영 종료") +
        "</label>" + monthInput(prefix + "shootEndMonth", project.shootEndMonth) + "</div>";
    }
    html += "</div>";
    var paySum = App.Money.sumBy(project.payments || [], function (pay) {
      return App.Engine.resolvePaymentAmount(project, pay);
    });
    var pctSum = 0;
    (project.payments || []).forEach(function (pay) {
      pctSum += App.Money.toSafeNumber(pay.percentage) * 100;
    });
    html += '<table class="mini-sum"><thead><tr>';
    if (!sales) {
      html += "<th class=\"num\">" + esc(labels.count) + "</th><th class=\"num\">" + esc(labels.unit) + " (원)</th>";
    }
    html += "<th class=\"num\">계약금액 (원)</th><th class=\"num\">지급 합계 (원)</th><th class=\"num\">비율 합</th></tr></thead>";
    html += '<tbody><tr class="total-row">';
    if (!sales) {
      html += '<td class="num">' + App.Format.formatCount(project.episodes, project.category) + "</td>";
      html += '<td class="num">' + (App.Money.toSafeNumber(project.feePerEpisode) ? App.Format.formatWon(project.feePerEpisode) : "—") + "</td>";
    }
    html += '<td class="num" data-computed="total" data-index="' + pi + '">' + App.Format.formatWon(total) + "</td>";
    html += '<td class="num" data-computed="pay-sum" data-index="' + pi + '">' + App.Format.formatWon(paySum) + "</td>";
    html += '<td class="num" data-computed="pct-sum" data-index="' + pi + '">' + (Math.round(pctSum * 10) / 10) + "%</td>";
    html += "</tr></tbody></table>";
    html += "<h3>지급 일정</h3>";
    if (!(project.payments || []).length) {
      html += '<p class="muted small">지급일정이 없으면 ' + (sales ? "시작월" : "촬영 시작월") +
        "에 계약금액 전액이 월별 분석 수입으로 들어갑니다. 촬영/계약 기간으로 균등 배분하지 않습니다.</p>";
    } else {
      html += '<p class="muted small">월별 분석 수입은 지급 일정의 입금월·입금금액을 그대로 사용합니다. 합계는 계약금액과 같아야 합니다.</p>';
      if (total && paySum !== total) {
        html += '<p class="muted small recon-bad">지급 일정 합계가 계약금액과 일치하지 않습니다. ' +
          App.Format.formatWon(Math.abs(total - paySum)) + (paySum < total ? " 부족합니다." : " 초과합니다.") + "</p>";
      }
    }
    html += paymentTable(project, pi, start, full, { draft: isDraft });

    if (full) {
      html += '<div class="row-fields" style="margin-top:12px">';
      html += '<div class="field"><label>성사수수료 요율</label>' +
        percentInput(prefix + "fee.rate", project.fee && project.fee.rate != null ? App.Money.toSafeNumber(project.fee.rate) * 100 : "", 'data-kind="fee-rate"') +
        '<div class="muted small">입금월 예정입금 × 요율.</div></div>';
      html += '<div class="field"><label>수수료명</label>' + textInput(prefix + "fee.name", (project.fee && project.fee.name) || "성사수수료") + "</div>";
      html += "</div>";
      html += renderProjectExpenseBlock(project, pi, ui, state, { draft: isDraft });
      html += '<h3>추가 직접비</h3><button class="btn" data-action="add-direct"' + actionAttrs + '>+ 직접비</button>';
      html += '<p class="muted small">위 프로젝트 진행비에 포함되지 않는 별도 수동 직접비만 입력합니다.</p>';
      html += '<table><thead><tr><th>항목</th><th class="num">금액 (원)</th><th>월</th><th></th></tr></thead><tbody>';
      var directSum = 0;
      var skippedDirectCount = 0;
      (project.directExpenses || []).forEach(function (d, di) {
        if (App.Engine.isLegacyProjectDirectExpense && App.Engine.isLegacyProjectDirectExpense(project, d)) {
          skippedDirectCount += 1;
          return;
        }
        var dp = prefix + "directExpenses." + di + ".";
        directSum += App.Money.roundWon(d.amount);
        html += "<tr><td>" + textInput(dp + "name", d.name) + "</td><td>" + moneyInput(dp + "amount", d.amount) +
          "</td><td>" + monthInput(dp + "month", d.month || start) +
          '</td><td><button class="btn danger" data-action="remove-direct"' + actionAttrs + ' data-direct="' + di + '">삭제</button></td></tr>';
      });
      html += "</tbody><tfoot><tr class=\"total-row\"><td>추가 직접비 합계</td><td class=\"num\">" +
        App.Format.formatWon(directSum) + "</td><td colspan=\"2\"></td></tr></tfoot></table>";
      if (skippedDirectCount) {
        html += '<p class="muted small">기존 데이터의 프로젝트 진행비 중복 항목 ' + skippedDirectCount +
          "건은 위 자동/수동 진행비와 겹쳐 계산에서 제외했습니다.</p>";
      }
      var summary = (result.projectSummaries || []).filter(function (x) { return x.id === project.id; })[0];
      if (summary) {
        html += '<table class="mini-sum"><thead><tr><th>계약</th><th class="num">진행비+직접비 (원)</th><th class="num">기여이익 (원)</th></tr></thead>';
        html += '<tbody><tr class="total-row"><td>' + App.Format.formatWon(summary.contractAmount) +
          '</td><td class="num">− ' + App.Format.formatWon(summary.directExpenses) +
          '</td><td class="num">' + App.Format.formatWon(summary.contribution) +
          ' <span class="auto">참고치</span></td></tr></tbody></table>';
      }
    }
    html += "</div>";
    return html;
  }

  function paymentLines(project) {
    var total = App.Engine.projectContractAmount(project);
    return (project.payments || []).map(function (pay) {
      var amt = App.Engine.resolvePaymentAmount(project, pay);
      var pct = total ? Math.round(amt / total * 1000) / 10 : Math.round(App.Money.toSafeNumber(pay.percentage) * 1000) / 10;
      var month = pay.expectedMonth ? (App.Format.formatMonthIso(pay.expectedMonth) || "미정") : "미정";
      return esc(pay.label || "지급") + " " + pct + "% · " + month + " · " + App.Format.formatWon(amt);
    });
  }

  function renderOverviewTable(state, showHeading) {
    var projects = state.projects || [];
    if (!projects.length) return '<p class="muted">등록된 작품이 없습니다.</p>';
    var html = "";
    if (showHeading !== false) html += "<h3>전체 현황</h3>";
    html += '<p class="muted small">단위: 금액은 원, 비율은 %, 회차·횟수는 회·건입니다.</p>';
    html += '<div class="scroll"><table class="overview"><thead><tr>';
    html += "<th>구분</th><th>작품명</th><th class=\"num\">회차/횟수</th><th class=\"num\">회당·건당 (원)</th><th class=\"num\">총출연료 (원)</th><th>지급 일정 (% · 월 · 원)</th><th class=\"num\">지급 합계 (원)</th></tr></thead><tbody>";
    var grandTotal = 0;
    var grandPay = 0;
    var grandCount = 0;
    App.Categories.forEach(function (c) {
      var rows = [];
      projects.forEach(function (p) {
        if (p.category === c.id && p.status !== "cancelled") rows.push(p);
      });
      if (!rows.length) return;
      var subTotal = 0;
      var subPay = 0;
      rows.forEach(function (p) {
        var total = App.Engine.projectContractAmount(p);
        var paySum = App.Money.sumBy(p.payments || [], function (pay) {
          return App.Engine.resolvePaymentAmount(p, pay);
        });
        subTotal += total;
        subPay += paySum;
        grandCount += 1;
        var lines = paymentLines(p);
        html += "<tr><td>" + esc(c.label) + "</td><td>" + esc(p.name || "이름 없는 작품") + "</td>";
        html += '<td class="num">' + App.Format.formatCount(p.episodes, p.category) + "</td>";
        html += '<td class="num">' + (App.Money.toSafeNumber(p.feePerEpisode) ? App.Format.formatWon(p.feePerEpisode) : "—") + "</td>";
        html += '<td class="num">' + App.Format.formatWon(total) + '<div class="about">' + App.Format.formatWonAbout(total) + "</div></td>";
        html += '<td class="pay-lines">' + (lines.length ? lines.join("<br>") : "—") + "</td>";
        html += '<td class="num">' + App.Format.formatWon(paySum) + "</td></tr>";
      });
      grandTotal += subTotal;
      grandPay += subPay;
      html += '<tr class="sub-row"><td colspan="4">' + esc(c.label) + " 소계 (" + rows.length + "건)</td>";
      html += '<td class="num">' + App.Format.formatWon(subTotal) + "</td><td></td>";
      html += '<td class="num">' + App.Format.formatWon(subPay) + "</td></tr>";
    });
    html += "</tbody><tfoot><tr class=\"total-row\"><td colspan=\"4\">전체 합계 (" + grandCount + "건)</td>";
    html += '<td class="num">' + App.Format.formatWon(grandTotal) + '<div class="about">' + App.Format.formatWonAbout(grandTotal) + "</div></td><td></td>";
    html += '<td class="num">' + App.Format.formatWon(grandPay) + "</td></tr></tfoot></table></div>";
    return html;
  }

  function renderProjects(state, result) {
    var html = '<div class="view-projects">';
    html += '<div class="section-title"><h2>작품 / 계약</h2><div class="inline">';
    App.Categories.forEach(function (c) {
      html += '<button class="btn" data-action="add-project" data-category="' + esc(c.id) + '">+ ' + esc(c.label) + "</button>";
    });
    html += "</div></div>";
    html += '<div class="card">' + renderOverviewTable(state) + "</div>";
    html += '<p class="muted small">사업 설정의 활동계획과 같은 작품입니다. 여기서 상태·수수료·직접비까지 다룹니다.</p>';
    (state.projects || []).forEach(function (project, pi) {
      html += renderWorkCard(project, pi, state, result, true);
    });
    if (!state.projects.length) html += '<div class="card muted">아직 작품이 없습니다.</div>';
    html += "</div>";
    return html;
  }

  function renderCostFoot(rows, estLabel, actLabel, corporateStatus) {
    var s = lineStats(rows, corporateStatus);
    return '<div class="cost-foot-row cost-row-list">' +
      "<span></span><span></span><span>전체 합계</span>" +
      '<span class="cost-amt" title="' + esc(actLabel) + '"><b data-computed="cost-act-total">' +
      App.Format.formatWon(s.sum) + "</b></span>" +
      '<span class="cost-unit">1회</span>' +
      "<span>" + s.n + "건</span>" +
      '<span title="' + esc(estLabel) + '">' + App.Format.formatWon(s.est) + "</span></div>";
  }

  function renderCosts(state, result, ui) {
    App.Defaults.ensureSupportPolicies(state);
    var start = state.profile.startMonth;
    var meal = (state.settings && state.settings.meal) || {};
    var tab = (ui && ui.costTab) || "opex";
    var corporateStatus = (state.settings && state.settings.corporateStatus) || "new";
    var corporateLabel = corporateStatus === "existing" ? "기존 법인" : "신규 설립";
    var html = '<div class="view-costs">';
    html += '<div class="cost-tabs">';
    [
      { id: "startup", label: "초기비용" },
      { id: "rent2f", label: "임대료(2층)" },
      { id: "funding", label: "자산·보증금" },
      { id: "opex", label: "운영비" },
      { id: "project", label: "프로젝트 진행비" }
    ].forEach(function (t) {
      html += '<button type="button" class="' + (tab === t.id ? "active" : "") +
        '" data-action="cost-tab" data-tab="' + t.id + '">' + esc(t.label) + "</button>";
    });
    html += "</div>";
    if (tab !== "rent2f") {
      html += '<div class="cost-toolbar">';
      html += '<button type="button" class="btn" data-action="expand-cost-all">전체 펼치기</button>';
      html += '<button type="button" class="btn" data-action="collapse-cost-all">전체 접기</button>';
      html += "</div>";
    }
    html += '<div class="cost-sheet">';

    if (tab === "startup") {
      html += renderCostSection({
        id: "startup",
        title: "설립 시 1회 비용",
        summary: costGrandTotalText(state.startupExpenses, corporateStatus),
        addAction: "add-line",
        addAttrs: ' data-list="startupExpenses"',
        extraClass: "cost-sec-flat",
        open: isSecOpen(ui, "startup"),
        body: '<p class="muted small">법인 상태: ' + esc(corporateLabel) +
          (corporateStatus === "existing" ? " · 설립 관련 비용은 현재 시뮬레이션에서는 미반영" : " · 설립 관련 초기비용 반영") +
          "</p><div class=\"cost-list\">" + costListCols() +
          renderLineAccordions("startupExpenses", state.startupExpenses, start, ui, "startup", corporateStatus, { noWrap: true }) +
          renderCostFoot(state.startupExpenses, "일반 법인 설립 소요비용", "실제 예상안 반영", corporateStatus) +
          "</div>"
      });
    } else if (tab === "rent2f") {
      html += renderRent2fTab(state, ui);
    } else if (tab === "funding") {
      html += '<p class="muted small cost-intro">현금은 지출되지만 보증금 또는 자산으로 남는 항목입니다. 보증금은 손익 비용으로 처리하지 않습니다. 차량 보증금은 시뮬레이션 설정 &gt; 회사 지원에서 수정합니다.</p>';
      html += '<details class="compat-hidden" data-cost-sec="deposits" open></details>';
      html += '<details class="compat-hidden" data-cost-sec="assets" open></details>';
      html += '<details class="compat-hidden" data-cost-sec="inflows" open></details>';
      html += '<div class="cost-add-row">';
      html += '<button type="button" class="btn" data-action="add-line" data-list="deposits">+ 보증금</button>';
      html += '<button type="button" class="btn" data-action="add-line" data-list="assets">+ 자산</button>';
      html += '<button type="button" class="btn" data-action="add-inflow">+ 보증금 반환 등</button>';
      html += "</div>";
      html += '<div class="cost-list">';
      html += costListCols();
      html += renderLineAccordions("deposits", state.deposits, start, ui, "deposit", null, { noWrap: true });
      html += renderVehicleFundingRows(state);
      html += renderLineAccordions("assets", state.assets, start, ui, "asset", null, { noWrap: true });
      html += renderInflowAccordions(state, ui, { noWrap: true });
      if (!(state.deposits || []).length && !(state.assets || []).length &&
        !vehicleDepositSourceRows(state).length && !(state.otherInflows || []).length) {
        html += '<div class="cost-empty muted small">항목이 없습니다.</div>';
      }
      var fund = lineStats(fundingDepositRows(state));
      var cap = lineStats(state.assets);
      html += '<div class="cost-foot-row cost-row-list"><span></span><span></span><span>현금투입 합계</span><span class="cost-amt"><b data-computed="cost-fund-total">' +
        App.Format.formatWon(fund.sum + cap.sum) + '</b></span><span class="cost-unit">-</span><span></span><span></span></div>';
      html += "</div>";
    } else if (tab === "project") {
      html += '<p class="muted small cost-intro">각 프로젝트의 진행비·밥차비와 에이전시 수수료를 모은 읽기 전용 요약입니다. 원본은 수익 탭의 각 프로젝트, 매출연동 수수료는 시뮬레이션 설정 &gt; 수수료·정책에서 설정합니다.</p>';
      var pgLedger = result && result.ledger;
      var pgProjectGroup = ledgerGroupById(pgLedger, "project");
      var pgAgencyGroup = ledgerGroupById(pgLedger, "agency");
      function pgRows(group, account) {
        if (!(group && group.rows && group.rows.length)) {
          return '<div class="cost-empty muted small">등록된 항목 없음</div>';
        }
        return group.rows.map(function (row) {
          return '<div class="cost-item"><div class="cost-row cost-row-list">' +
            costSummaryCells({
              family: "매출원가",
              account: account,
              name: row.label,
              amount: App.Format.formatWon(App.Money.roundWon(-row.total)),
              unit: "전체기간",
              period: "자동계산",
              status: "포함",
              chevron: false
            }) + "</div></div>";
        }).join("");
      }
      var pgProjectTotal = pgProjectGroup ? App.Money.roundWon(-pgProjectGroup.subtotal.total) : 0;
      var pgAgencyTotal = pgAgencyGroup ? App.Money.roundWon(-pgAgencyGroup.subtotal.total) : 0;
      html += '<div class="cost-list">';
      html += costListCols();
      html += renderCostSection({
        id: "project-direct",
        title: "프로젝트 직접비 (진행비·밥차비)",
        amount: App.Format.formatWon(pgProjectTotal),
        unit: "전체기간",
        period: (pgProjectGroup ? pgProjectGroup.rows.length : 0) + "건",
        extraClass: "cost-sec-child cost-sec-flat cost-sec-group",
        open: isSecOpen(ui, "project-direct"),
        body: pgRows(pgProjectGroup, "진행비")
      });
      html += renderCostSection({
        id: "project-agency",
        title: "에이전시 수수료",
        amount: App.Format.formatWon(pgAgencyTotal),
        unit: "전체기간",
        period: (pgAgencyGroup ? pgAgencyGroup.rows.length : 0) + "건",
        extraClass: "cost-sec-child cost-sec-flat cost-sec-group",
        open: isSecOpen(ui, "project-agency"),
        body: pgRows(pgAgencyGroup, "에이전시 수수료")
      });
      html += '<div class="cost-foot-row cost-row-list"><span></span><span></span><span>매출원가 합계</span><span class="cost-amt"><b>' +
        App.Format.formatWon(pgProjectTotal + pgAgencyTotal) + '</b></span><span class="cost-unit">전체기간</span><span></span><span></span></div>';
      html += "</div>";
    } else {
      html += '<details class="compat-hidden" data-cost-sec="recurring" open></details>';
      var sgaBody = '<div class="cost-list">';
      sgaBody += costListCols();
      sgaBody += renderCostSection({
        id: "payroll",
        title: "인건비",
        amount: App.Format.formatWon(salarySum(state.employees)),
        unit: "월",
        period: "조직 설정 연동",
        extraClass: "cost-sec-child cost-sec-flat cost-sec-group",
        open: isSecOpen(ui, "payroll"),
        body: renderEmployeeAccordions(state, ui, true, { noWrap: true })
      });
      var insGroup = ledgerGroupById(result && result.ledger, "insurance");
      var insTotal = insGroup ? App.Money.roundWon(-insGroup.subtotal.total) : 0;
      sgaBody += renderCostSection({
        id: "insurance",
        title: "4대보험 (회사 부담)",
        amount: App.Format.formatWon(insTotal),
        unit: "전체기간",
        period: "급여 연동 자동계산",
        extraClass: "cost-sec-child cost-sec-flat cost-sec-group",
        open: isSecOpen(ui, "insurance"),
        body: ((insGroup && insGroup.rows.length) ? insGroup.rows.map(function (row) {
            return '<div class="cost-item"><div class="cost-row cost-row-list">' +
              costSummaryCells({
                family: "판관비",
                account: "4대보험",
                name: row.label,
                amount: App.Format.formatWon(App.Money.roundWon(-row.total)),
                unit: "전체기간",
                period: "자동계산",
                status: "포함",
                chevron: false
              }) + "</div></div>";
          }).join("") : '<div class="cost-empty muted small">대상 직원 없음</div>')
      });
      var rentParts = recGroupSummaryParts(state.recurringExpenses, "rent", state);
      sgaBody += renderCostSection({
        id: "recurring-rent",
        title: "임대료",
        amount: rentParts.amount,
        unit: rentParts.unit,
        period: rentParts.period,
        addAction: "add-recurring",
        addAttrs: ' data-category="rent"',
        extraClass: "cost-sec-child cost-sec-flat cost-sec-group",
        open: isSecOpen(ui, "recurring-rent"),
        body: renderRecurringAccordions(state, ui, "rent", { noWrap: true })
      });
      var mktParts = recGroupSummaryParts(state.recurringExpenses, "marketing", state);
      sgaBody += renderCostSection({
        id: "recurring-marketing",
        title: "마케팅비",
        amount: mktParts.amount,
        unit: mktParts.unit,
        period: mktParts.period,
        addAction: "add-recurring",
        addAttrs: ' data-category="marketing"',
        extraClass: "cost-sec-child cost-sec-flat cost-sec-group",
        open: isSecOpen(ui, "recurring-marketing"),
        body: renderRecurringAccordions(state, ui, "marketing", { noWrap: true })
      });
      sgaBody += renderWelfareSection(state, result, ui);

      var supportSgaEntries = [];
      (state.settings.supportPolicies || []).forEach(function (p, i) {
        if (p.costClass === "sga") supportSgaEntries.push({ item: p, index: i });
      });
      var vehicleList = supportSgaEntries.filter(function (e) { return App.Defaults.isVehicleSupportPolicy(e.item); })
        .map(function (e) { return e.item; });
      var actorEntries = supportSgaEntries.filter(function (e) { return !App.Defaults.isVehicleSupportPolicy(e.item); });
      var actorList = actorEntries.map(function (e) { return e.item; });
      var actorReadonlyList = actorEntries.filter(function (e) { return !App.Defaults.isCostTabEditableSupportPolicy(e.item); })
        .map(function (e) { return e.item; });
      var actorEditableEntries = actorEntries.filter(function (e) { return App.Defaults.isCostTabEditableSupportPolicy(e.item); });
      function autoListStats(list) {
        var included = list.filter(function (p) { return p.include === true; });
        return {
          n: included.length,
          sum: App.Money.sumBy(included, function (p) { return autoSupportMonthlyAmount(p, state); })
        };
      }
      var vehicleStats = autoListStats(vehicleList);
      var actorStats = autoListStats(actorList);
      sgaBody += renderCostSection({
        id: "support-vehicle",
        title: "차량비",
        amount: App.Format.formatWon(vehicleStats.sum),
        unit: "월",
        period: vehicleStats.n + "건",
        extraClass: "cost-sec-child cost-sec-flat cost-sec-group",
        open: isSecOpen(ui, "support-vehicle"),
        body: renderAutoSupportList(vehicleList, state, "차량비", { noWrap: true })
      });
      var actorEditableHtml = renderCostTabEditableSupportRows(actorEditableEntries, state, ui, "배우 활동지원");
      sgaBody += renderCostSection({
        id: "support-actor",
        title: "배우 활동지원",
        amount: App.Format.formatWon(actorStats.sum),
        unit: "월",
        period: actorStats.n + "건",
        extraClass: "cost-sec-child cost-sec-flat cost-sec-group",
        open: isSecOpen(ui, "support-actor"),
        body: renderAutoSupportList(actorReadonlyList, state, "배우 활동지원", { noWrap: true }) + actorEditableHtml
      });

      var sgaFees = (state.revenueFees || []).filter(function (f) { return (f.category || "sga") === "sga"; });
      var feeTotals = (result && result.revenueFees && result.revenueFees.totalsByFee) || {};
      var sgaFeeSum = App.Money.sumBy(sgaFees.filter(function (f) { return f.include !== false; }),
        function (f) { return feeTotals[f.id]; });
      sgaBody += renderCostSection({
        id: "revenue-fees",
        title: "매출연동 수수료",
        amount: App.Format.formatWon(sgaFeeSum),
        unit: "전체기간",
        period: sgaFees.length + "건",
        extraClass: "cost-sec-child cost-sec-flat cost-sec-group",
        open: isSecOpen(ui, "revenue-fees"),
        body: (sgaFees.length ? sgaFees.map(function (f) {
            var included = f.include !== false;
            return '<div class="cost-item' + (included ? "" : " off") + '"><div class="cost-row cost-row-list">' +
              costSummaryCells({
                family: "판관비",
                account: "매출연동 수수료",
                name: f.name || "수수료",
                amount: App.Format.formatWon(included ? App.Money.roundWon(feeTotals[f.id]) : 0),
                unit: "전체기간",
                period: pctView(f.rate) + "%",
                status: included ? "포함" : "제외",
                chevron: false
              }) + "</div></div>";
          }).join("") : '<div class="cost-empty muted small">등록된 매출연동 수수료 없음</div>')
      });
      var sgaParts = recGroupSummaryParts(state.recurringExpenses, "sga", state);
      sgaBody += renderCostSection({
        id: "recurring-sga",
        title: "일반 판관비",
        amount: sgaParts.amount,
        unit: sgaParts.unit,
        period: sgaParts.period,
        addAction: "add-recurring",
        addAttrs: ' data-category="sga"',
        extraClass: "cost-sec-child cost-sec-flat cost-sec-group",
        open: isSecOpen(ui, "recurring-sga"),
        body: renderRecurringAccordions(state, ui, "sga", { noWrap: true })
      });

      var welfareMonthly = (result && result.months && result.months[0]) ? result.months[0].meal : 0;
      var recurringTotal = salarySum(state.employees) + recMonthlySum(state.recurringExpenses) +
        welfareMonthly + vehicleStats.sum + actorStats.sum;
      sgaBody += '<div class="cost-foot-row cost-row-list"><span></span><span></span><span>판관비 합계</span>' +
        '<span class="cost-amt"><b>' + App.Format.formatWon(recurringTotal) +
        '</b></span><span class="cost-unit">월</span><span></span><span></span></div>';
      sgaBody += "</div>";

      html += renderCostSection({
        id: "sga-parent",
        title: (App.SgaFamily && App.SgaFamily.label) || "판관비",
        extraClass: "cost-sec-parent cost-sec-flat",
        open: isSecOpen(ui, "sga-parent"),
        body: sgaBody
      });
    }

    html += "</div></div>";
    return html;
  }

  function rent2fMonthlyAmount(state) {
    var rows = (state && state.recurringExpenses) || [];
    var found = rows.filter(function (item) {
      if (!item || item.include === false) return false;
      if (App.Defaults && App.Defaults.isRetiredRecurringExpense && App.Defaults.isRetiredRecurringExpense(item)) return false;
      var name = String(item.name || "").replace(/\s+/g, "");
      return name === "임대료" || name === "임대료(2층)";
    });
    if (!found.length) return 500000;
    return App.Money.roundWon(App.Money.sumBy(found, function (item) { return item.amount; }));
  }

  function isRent2fRecurring(item) {
    if (!item) return false;
    var name = String(item.name || "").replace(/\s+/g, "");
    return name === "임대료" || name === "임대료(2층)";
  }

  function rent2fSourceIndex(state) {
    var rows = (state && state.recurringExpenses) || [];
    for (var i = 0; i < rows.length; i++) {
      if (isRent2fRecurring(rows[i])) return i;
    }
    return -1;
  }

  function rent2fPeriodLabel(state) {
    var row = ((state && state.recurringExpenses) || []).filter(function (item) {
      return isRent2fRecurring(item) && item.include !== false;
    })[0];
    return row ? itemPeriodLabel(row) : "시뮬레이션 전체";
  }

  function rentComparables() {
    return [
      {
        src: "assets/rent-comparables/shared-office.png",
        title: "공유오피스 지점 시세",
        meta: "1인실 월 35만~ · 지점별 상이",
        note: "집기·소프트웨어·공용공간은 별도인 경우가 많음"
      },
      {
        src: "assets/rent-comparables/banpo.png",
        title: "반포동 일반상가",
        meta: "월세 1,500 / 150만 · 계약 43㎡",
        note: "관리비 10만 · 권리금 없음"
      },
      {
        src: "assets/rent-comparables/jamwon.png",
        title: "잠원동 일반상가",
        meta: "월세 1,500 / 146만 · 계약 66.11㎡",
        note: "4/5층 · 확인매물"
      },
      {
        src: "assets/rent-comparables/seocho.png",
        title: "서초동 일반상가",
        meta: "월세 1,000 / 100만 · 계약 28.1㎡",
        note: "4/5층 · 권리금 없음"
      }
    ];
  }

  function renderRentComparables(opts) {
    opts = opts || {};
    var html = '<section class="rent-comps">';
    if (!opts.noTitle) html += "<h2>시장 비교군</h2>";
    html += '<p class="muted small">근처 공유오피스·일반상가 시세입니다. 2층 월 임대료가 낮은지 보기 위한 증빙이며, 시뮬레이션 금액에는 넣지 않습니다. 그림을 누르면 원본을 엽니다.</p>';
    html += '<div class="rent-comp-grid">';
    rentComparables().forEach(function (item) {
      html += '<figure class="rent-comp">';
      html += '<a href="' + esc(item.src) + '" target="_blank" rel="noopener">';
      html += '<img src="' + esc(item.src) + '" alt="' + esc(item.title) + '">';
      html += "</a>";
      html += "<figcaption>";
      html += "<b>" + esc(item.title) + "</b>";
      html += "<span>" + esc(item.meta) + "</span>";
      html += '<span class="muted">' + esc(item.note) + "</span>";
      html += "</figcaption>";
      html += "</figure>";
    });
    html += "</div></section>";
    return html;
  }

  function renderRent2fTab(state, ui) {
    var sub = (ui && ui.rent2fTab) === "comps" ? "comps" : "included";
    var monthly = rent2fMonthlyAmount(state);
    var groups = [
      { label: "소프트웨어", items: ["더존 위하고", "Microsoft 시스템/Office", "Polaris Office", "Windows Home", "한글"] },
      { label: "유틸리티", items: ["전기요금", "인터넷 사용료", "케이티텔레캅 출입", "사무실 청소비", "수도요금"] },
      { label: "시설장치", items: ["책상", "모니터", "본체", "의자", "책꽂이", "추가 책장", "카메라 장비", "사무실 공간", "정수기"] },
      { label: "공간대여", items: ["소회의실 사용", "대회의실 사용", "탕비실 공용", "주차"] }
    ];
    var srcIdx = rent2fSourceIndex(state);
    var html = '<div class="rent-info">';
    html += '<div class="cost-tabs sim-tabs rent-subtabs">';
    [
      { id: "included", label: "포함 내역" },
      { id: "comps", label: "시장 비교군" }
    ].forEach(function (t) {
      html += '<button type="button" class="' + (sub === t.id ? "active" : "") +
        '" data-action="rent2f-tab" data-tab="' + t.id + '">' + esc(t.label) + "</button>";
    });
    html += "</div>";
    if (sub === "comps") {
      html += renderRentComparables({ noTitle: true });
      html += "</div>";
      return html;
    }
    html += '<div class="rent-basics">';
    html += '<div class="rent-fact rent-basic">';
    html += "<span>월 임대료</span>";
    if (srcIdx >= 0) {
      html += '<div class="rent-amount-field">' +
        moneyInput("recurringExpenses." + srcIdx + ".amount", state.recurringExpenses[srcIdx].amount) +
        " / 월</div>";
    } else {
      html += "<b>" + App.Format.formatWon(monthly) + " / 월</b>";
    }
    html += "</div>";
    html += '<div class="rent-fact rent-basic">';
    html += "<span>적용기간</span>";
    html += "<b>" + esc(rent2fPeriodLabel(state)) + "</b>";
    html += "</div>";
    html += '<div class="rent-fact rent-basic">';
    html += "<span>연동</span>";
    html += srcIdx >= 0
      ? "<b>운영비 &gt; 판관비 &gt; 임대료(2층)</b>"
      : "<b>연동할 임대료(2층) 항목이 없습니다</b>";
    html += "</div>";
    html += "</div>";
    html += '<p class="muted small cost-intro">월 임대료에 사무공간, 소프트웨어, 유틸리티, 시설·장비 및 공용공간 사용료가 포함되어 있습니다. 아래 항목은 별도 비용으로 계산되지 않습니다.</p>';
    html += '<div class="rent-facts">';
    groups.forEach(function (g) {
      html += '<section class="rent-fact-group">';
      html += "<h3>" + esc(g.label) + "</h3>";
      g.items.forEach(function (name) {
        html += '<div class="rent-fact">';
        html += "<span>" + esc(name) + "</span>";
        html += "<b>포함</b>";
        html += "</div>";
      });
      html += "</section>";
    });
    html += "</div>";
    html += '<p class="muted small">월별 분석에는 임대료 한 행만 반영됩니다. 위 포함 항목은 운영비나 자산 구입으로 자동 생성하지 않습니다.</p>';
    html += "</div>";
    return html;
  }

  function ledgerYearOfMonth(month) {
    var p = App.Month.parseMonth(month);
    return p ? String(p.year) : String(month || "").slice(0, 4);
  }

  function ledgerYearGroups(months) {
    var groups = [];
    var map = {};
    (months || []).forEach(function (m) {
      var y = ledgerYearOfMonth(m);
      if (!y) return;
      if (!map[y]) {
        map[y] = { year: y, months: [] };
        groups.push(map[y]);
      }
      map[y].months.push(m);
    });
    return groups;
  }

  function isLedgerYearOpen(ui, year) {
    var key = String(year);
    if (ui && ui.ledgerYearOpen && ui.ledgerYearOpen[key] === true) return true;
    if (ui && ui.ledgerYearOpen && ui.ledgerYearOpen[key] === false) return false;
    return false;
  }

  function ledgerYearsOf(months) {
    return ledgerYearGroups(months).map(function (g) { return g.year; });
  }

  function ledgerColumnLayout(months, ui) {
    var years = ledgerYearGroups(months).map(function (g) {
      return {
        year: g.year,
        months: g.months,
        open: isLedgerYearOpen(ui, g.year)
      };
    });
    var cols = [];
    years.forEach(function (g) {
      if (g.open) {
        g.months.forEach(function (m, i) {
          cols.push({
            kind: "month",
            year: g.year,
            month: m,
            lastInYear: i === g.months.length - 1
          });
        });
      } else {
        cols.push({
          kind: "year",
          year: g.year,
          months: g.months,
          lastInYear: true
        });
      }
    });
    return { years: years, cols: cols, anyOpen: years.some(function (g) { return g.open; }) };
  }

  function ledgerYearColumnValue(values, monthsInYear, mode) {
    if (mode === "last") {
      var last = monthsInYear && monthsInYear.length ? monthsInYear[monthsInYear.length - 1] : null;
      return App.Money.roundWon((values && last && values[last]) || 0);
    }
    var total = 0;
    (monthsInYear || []).forEach(function (m) {
      total = App.Money.roundWon(total + App.Money.roundWon((values && values[m]) || 0));
    });
    return total;
  }

  function ledgerColClass(col, selected) {
    var cls = "";
    if (col.lastInYear) cls += " year-end";
    if (col.kind === "month" && col.month === selected) cls += " selected";
    if (col.kind === "year" && selected && (col.months || []).indexOf(selected) >= 0) cls += " selected";
    return cls;
  }

  function ledgerCells(values, months, selected, showZero, ui, opts) {
    opts = opts || {};
    var layout = ledgerColumnLayout(months, ui);
    var html = "";
    layout.cols.forEach(function (col) {
      var value = col.kind === "year"
        ? ledgerYearColumnValue(values, col.months, opts.yearMode)
        : (values && values[col.month]);
      html += '<td class="num month-col' + (col.kind === "year" ? " year-col" : "") +
        ledgerColClass(col, selected) + '">' +
        App.Format.formatLedgerCell(value, showZero) + "</td>";
    });
    return html;
  }

  function ledgerEmptyCells(months, ui) {
    var layout = ledgerColumnLayout(months, ui);
    var html = "";
    layout.cols.forEach(function (col) {
      html += '<td' + (col.lastInYear ? ' class="year-end"' : "") + "></td>";
    });
    return html;
  }

  function renderLedgerThead(months, selected, ui) {
    var layout = ledgerColumnLayout(months, ui);
    var anyOpen = layout.anyOpen;
    var html = "<thead>";
    html += '<tr class="ledger-year-head-row">';
    html += '<th class="sticky-g"' + (anyOpen ? ' rowspan="2"' : "") + ">구분</th>";
    html += '<th class="sticky-n"' + (anyOpen ? ' rowspan="2"' : "") + ">항목</th>";
    html += '<th class="num sticky-t"' + (anyOpen ? ' rowspan="2"' : "") + ">TOTAL</th>";
    layout.years.forEach(function (g) {
      var open = g.open;
      var spanAttrs = "";
      if (open) spanAttrs += ' colspan="' + g.months.length + '"';
      else if (anyOpen) spanAttrs += ' rowspan="2"';
      var selectedYear = selected && g.months.indexOf(selected) >= 0;
      html += '<th class="num ledger-year-head' + (open ? " is-open" : " is-collapsed") +
        (selectedYear ? " selected" : "") + ' year-end"' + spanAttrs +
        ' data-action="toggle-ledger-year" data-year="' + esc(g.year) +
        '" title="클릭하면 ' + esc(g.year) + '년 월 컬럼을 펼치거나 접습니다" aria-expanded="' +
        (open ? "true" : "false") + '">';
      html += '<span class="ledger-fold-label"><span class="chev ledger-year-chev" aria-hidden="true"></span>' +
        esc(g.year) + "</span></th>";
    });
    html += "</tr>";
    if (anyOpen) {
      html += '<tr class="ledger-month-head">';
      layout.years.forEach(function (g) {
        if (!g.open) return;
        g.months.forEach(function (m, i) {
          html += '<th class="num month-btn' + (m === selected ? " selected" : "") +
            (i === g.months.length - 1 ? " year-end" : "") +
            '" data-action="select-month" data-month="' + esc(m) + '">' +
            esc(App.Format.formatMonthShort(m)) + "</th>";
        });
      });
      html += "</tr>";
    }
    html += "</thead>";
    return html;
  }

  function ledgerGroupDefaultOpen(id) {
    return id !== "startup" && id !== "funding";
  }

  function isLedgerGroupOpen(ui, id) {
    if (ui && ui.ledgerOpen && ui.ledgerOpen[id] === true) return true;
    if (ui && ui.ledgerOpen && ui.ledgerOpen[id] === false) return false;
    return ledgerGroupDefaultOpen(id);
  }

  function renderLedgerGroup(group, months, selected, gap, ui, projectExpenseGap, opts) {
    opts = opts || {};
    if (!group) return "";
    var groupCol = opts.sectionLabel || group.sectionLabel || group.parentLabel || group.label;
    var foldLabel = opts.foldLabel || (group.label + " 소계");
    var extraRowClass = opts.rowClass ? " " + opts.rowClass : "";
    if (group.summaryOnly) {
      var tone = group.kind === "profit-summary" ? "ledger-profit-row" :
        (group.kind === "income-summary" || group.kind === "expense-summary" ? "ledger-key-row" : "ledger-summary-row");
      var kindClass = group.kind ? " ledger-kind-" + group.kind : "";
      var summaryHtml = '<tr class="sub-row ' + tone + kindClass + extraRowClass + '">';
      summaryHtml += '<td class="sticky-g">' + esc(groupCol) + "</td>";
      summaryHtml += '<td class="sticky-n">' + esc(group.label) + "</td>";
      summaryHtml += '<td class="num sticky-t">' + App.Format.formatGrouped(group.subtotal.total) + "</td>";
      summaryHtml += ledgerCells(group.subtotal.values, months, selected, true, ui);
      summaryHtml += "</tr>";
      return summaryHtml;
    }
    if (!(group.rows || []).length && group.kind === "income") return "";
    var open = isLedgerGroupOpen(ui, group.id);
    var html = "";
    if (open) {
      group.rows.forEach(function (row) {
        var item = group.kind === "income" ? ledgerRowGapItem(row, gap) : null;
        if (!item && group.id === "project") item = projectExpenseRowGapItem(row, projectExpenseGap);
        var memo = item ? ledgerRowMemo(item) : "";
        html += '<tr class="ledger-row' + (group.kind === "income" ? " income-row" : "") +
          extraRowClass + (memo ? " recon-row" : "") + '">';
        html += '<td class="sticky-g">' + esc(groupCol) + "</td>";
        html += '<td class="sticky-n">' + esc(row.label) + "</td>";
        html += '<td class="num sticky-t' + (memo ? " recon-bad" : "") + '"' +
          (memo ? ' title="' + esc(memo) + '"' : "") + ">" +
          App.Format.formatGrouped(row.total) +
          (memo ? '<span class="ledger-memo">' + esc(memo) + "</span>" : "") +
          "</td>";
        html += ledgerCells(row.values, months, selected, !!row.showZero, ui);
        html += "</tr>";
      });
    }
    html += '<tr class="sub-row ledger-toggle-row' + (group.kind ? " ledger-kind-" + group.kind : "") +
      extraRowClass + (open ? "" : " is-collapsed") +
      '" data-action="toggle-ledger-group" data-group="' + esc(group.id || "") +
      '" aria-expanded="' + (open ? "true" : "false") + '" title="클릭하면 세부 항목을 접거나 펼칩니다">';
    html += '<td class="sticky-g">' + esc(groupCol) + "</td>";
    html += '<td class="sticky-n"><span class="ledger-fold-label"><span class="chev" aria-hidden="true"></span>' +
      esc(foldLabel) +
      (open ? "" : '<span class="ledger-fold-count"> · ' + group.rows.length + "건</span>") +
      "</span></td>";
    html += '<td class="num sticky-t">' + App.Format.formatGrouped(group.subtotal.total) + "</td>";
    html += ledgerCells(group.subtotal.values, months, selected, true, ui);
    html += "</tr>";
    return html;
  }

  function ledgerGroupById(ledger, id) {
    return ((ledger && ledger.groups) || []).filter(function (g) { return g.id === id; })[0];
  }

  function cashflowResultLabel(row) {
    if (!row) return "";
    if (row.id === "vatOutput") return "부가세 예수금";
    return row.label;
  }

  function renderCashflowResultRow(row, months, selected, extraClass, title, ui) {
    var html = '<tr class="total-row ledger-result ledger-cashflow-item' + (extraClass ? " " + extraClass : "") + '">';
    html += '<td class="sticky-g">현금흐름</td>';
    html += '<td class="sticky-n"' + (title ? ' title="' + esc(title) + '"' : "") + ">" +
      esc(cashflowResultLabel(row));
    if (row && row.id === "closing") {
      html += '<span class="kpi-tag kpi-tag-warn">법인세만 차감</span>';
    }
    html += "</td>";
    html += '<td class="num sticky-t">' +
      (row && row.id === "closing" ? sameAmountStar("기말 맞춤 · 시나리오 비교의 법인잔여와 같은 금액") : "") +
      App.Format.formatGrouped(row.total) + "</td>";
    html += ledgerCells(row.values, months, selected, true, ui, {
      yearMode: row.id === "closing" ? "last" : "sum"
    });
    html += "</tr>";
    return html;
  }

  function renderLedgerCashflowBlock(ledger, months, selected, gap, ui, projectExpenseGap) {
    var open = isLedgerGroupOpen(ui, "cashflow");
    var html = "";
    html += '<tr class="result-head ledger-toggle-row ledger-cashflow-head' + (open ? "" : " is-collapsed") +
      '" data-action="toggle-ledger-group" data-group="cashflow" aria-expanded="' +
      (open ? "true" : "false") + '" title="클릭하면 현금흐름 항목을 접거나 펼칩니다">';
    html += '<td class="sticky-g">현금흐름</td>';
    html += '<td class="sticky-n"><span class="ledger-fold-label"><span class="chev" aria-hidden="true"></span>현금흐름</span></td>';
    html += '<td class="sticky-t"></td>';
    html += ledgerEmptyCells(months, ui);
    html += "</tr>";
    if (open) {
      var funding = ledgerGroupById(ledger, "funding");
      if (funding) {
        html += renderLedgerGroup(funding, months, selected, gap, ui, projectExpenseGap, {
          sectionLabel: "현금흐름",
          foldLabel: "자산·보증금 이동",
          rowClass: "ledger-cashflow-item"
        });
      }
      var dividend = ledgerGroupById(ledger, "dividend");
      if (dividend) {
        html += renderLedgerGroup(dividend, months, selected, gap, ui, projectExpenseGap, {
          sectionLabel: "현금흐름",
          foldLabel: "대표 배당",
          rowClass: "ledger-cashflow-item"
        });
      }
      var profitShare = ledgerGroupById(ledger, "profit-share");
      if (profitShare) {
        html += renderLedgerGroup(profitShare, months, selected, gap, ui, projectExpenseGap, {
          sectionLabel: "현금흐름",
          foldLabel: "수익배분",
          rowClass: "ledger-cashflow-item"
        });
      }
      var otherIn = ledgerGroupById(ledger, "otherIn");
      if (otherIn) {
        html += renderLedgerGroup(otherIn, months, selected, gap, ui, projectExpenseGap, {
          sectionLabel: "현금흐름",
          foldLabel: "보증금 회수·기타 입금",
          rowClass: "ledger-cashflow-item"
        });
      }
      var cashFlowResultIds = { vatOutput: true, vatSettlement: true, taxCorporateLocal: true };
      ((ledger && ledger.results) || []).forEach(function (row) {
        if (!cashFlowResultIds[row.id]) return;
        if (!row.total) return;
        var title = row.id === "vatOutput" ? "매출세액. 손익이 아니라 현금 유입입니다." : "";
        html += renderCashflowResultRow(row, months, selected, "", title, ui);
      });
    }
    var closing = ((ledger && ledger.results) || []).filter(function (row) { return row.id === "closing"; })[0];
    if (closing) {
      html += renderCashflowResultRow(closing, months, selected, "ledger-closing-row",
        "통장 잔액에서 아직 안 낸 법인세·주민세만 뺀 금액입니다. 미납 부가세는 빼지 않습니다.", ui);
    }
    return html;
  }

  function taxYearOptions() {
    return (App.PersonalTax.availableYears() || [2026]).map(function (y) {
      return { id: String(y), label: String(y) };
    });
  }

  function formatBracketRate(rate) {
    var pct = Math.round(App.Money.toSafeNumber(rate) * 1000) / 10;
    return String(pct).replace(/\.0$/, "") + "%";
  }

  function analysisTabs(tab, ui) {
    var selectedM = selectedMultiplierStep(ui);
    var onFloor = tab === "revenue-floor";
    var html = '<div class="cost-tabs analysis-tabs">';
    MULTIPLIER_STEPS.forEach(function (m) {
      html += '<button type="button" class="' + (!onFloor && selectedM === m ? "active" : "") +
        '" data-action="select-multiplier" data-m="' + m + '">' + m + "배" +
        (m === 1 ? " · 지금" : "") + "</button>";
    });
    html += '<button type="button" class="' + (onFloor ? "active" : "") +
      '" data-action="analysis-tab" data-tab="revenue-floor">참고(매출하한)</button>';
    html += "</div>";
    return html;
  }

  function multiplierBaseTotal(state) {
    return App.Money.sumBy((state.projects || []).filter(function (p) {
      return p.status !== "cancelled";
    }), function (p) { return App.Engine.projectContractAmount(p); });
  }

  var MULTIPLIER_STEPS = [1, 2, 3, 4, 5];

  function selectedMultiplierStep(ui) {
    var m = ui && ui.multiplierSelected;
    return MULTIPLIER_STEPS.indexOf(m) >= 0 ? m : 1;
  }

  function getMultiplierRun(state, result, ui, multiplier) {
    var m = selectedMultiplierStep({ multiplierSelected: multiplier });
    if (m === 1 || !multiplierBaseTotal(state)) {
      return { multiplier: 1, sandbox: state, result: result, cmp: null };
    }
    var cache = ensureMultiplierCache(state, ui || {});
    if (!cache.runs) cache.runs = {};
    if (!cache.runs[m]) {
      cache.runs[m] = multiplierScenario(state, cache.extras[m], m);
    }
    return cache.runs[m];
  }

  function analysisFoldOpen(ui, id) {
    var open = ui && ui.analysisFoldOpen;
    if (open && Object.prototype.hasOwnProperty.call(open, id)) return !!open[id];
    var tab = (ui && ui.analysisTab) || "compare";
    if (tab === "monthly") return id === "monthly" || id === "cash";
    if (tab === "income-tax") return id === "glance";
    return id === "scenarios" || id === "cash";
  }

  function renderAnalysisFold(id, title, ui, bodyFn) {
    var open = analysisFoldOpen(ui, id);
    var html = '<section class="analysis-fold' + (open ? " is-open" : "") + '">';
    html += '<button type="button" class="analysis-fold-head" data-action="toggle-analysis-fold" data-id="' +
      esc(id) + '" aria-expanded="' + (open ? "true" : "false") + '">';
    html += '<span class="chev" aria-hidden="true"></span>' + esc(title) + "</button>";
    if (open) html += '<div class="analysis-fold-body">' + bodyFn() + "</div>";
    html += "</section>";
    return html;
  }

  function renderMultiplierSummaryTable(state, ui) {
    var scenarios = multiplierScenarios(state, ui);
    if (!scenarios.length) return "";
    function row(label, get, opts) {
      opts = opts || {};
      var r = '<tr' + (opts.strong ? ' class="strong"' : "") + '><th>' + esc(label) + "</th>";
      scenarios.forEach(function (s) {
        var v = get(s);
        var text = opts.delta ? analysisDisplayAmount(v, "delta") : App.Format.formatWon(v);
        r += '<td class="num' + (v < 0 ? " is-neg" : "") + '">' + text + "</td>";
      });
      return r + "</tr>";
    }
    var html = '<div class="card mult-summary-card"><h2>0. 배수 비교 한눈에</h2>';
    html += '<p class="muted small">현재 등록 매출을 1배로 두고, 2~5배는 작품·영업 건을 무작위로 추가해 참고로 계산합니다. 실제 매출 계획(수익 탭)에는 반영되지 않습니다.</p>';
    html += '<div class="mult-table-wrap"><table class="mult-table"><thead><tr><th></th>';
    scenarios.forEach(function (s) { html += "<th>" + s.multiplier + "배</th>"; });
    html += "</tr></thead><tbody>";
    html += row("총매출", function (s) { return s.revenue; }, { strong: true });
    html += row("1인 기획사 경제가치", function (s) { return s.solo; });
    html += row("기존 회사 전속 경제가치", function (s) { return s.exclusive; });
    html += row("차이(1인 − 전속)", function (s) { return s.delta; }, { strong: true, delta: true });
    html += "</tbody></table></div></div>";
    return html;
  }

  function renderAnalysisCompareView(state, result, ui) {
    var selectedM = selectedMultiplierStep(ui);
    var run = getMultiplierRun(state, result, ui, selectedM);
    var viewState = run.sandbox || state;
    var viewResult = run.result || result;
    var html = "";
    if (selectedM !== 1 && run.cmp) {
      html += '<p class="muted small analysis-mult-note"><b>' + selectedM +
        "배</b> 참고입니다. 현재 등록 매출에 작품·영업 건을 추가해 다시 계산하며, 수익 탭 계획은 바뀌지 않습니다. " +
        '<button type="button" class="btn btn-sm" data-action="regenerate-multiples">배수 다시 생성</button></p>';
    }
    html += renderAnalysisConsistencyBanner(viewState, viewResult, ui);
    html += renderMultiplierSummaryTable(state, ui);
    html += '<div class="analysis-fold-controls">';
    html += '<button type="button" class="btn btn-quiet" data-action="analysis-folds-collapse">전체 접기</button>';
    html += '<button type="button" class="btn btn-quiet" data-action="analysis-folds-expand">전체 펴기</button>';
    html += "</div>";
    html += renderAnalysisFold("monthly", "1. 월별 분석", ui, function () {
      return renderMonthlyLedgerCard(viewState, viewResult, ui);
    });
    html += renderAnalysisFold("cash", "2. 기말 현금 맞춤", ui, function () {
      return renderAnalysisTaxKpis(viewResult, ui);
    });
    html += renderAnalysisFold("scenarios", "3. 시나리오 비교", ui, function () {
      return renderScenarioComparisonView(viewState, viewResult, ui);
    });
    html += renderAnalysisFold("glance", "4. 한눈에 비교", ui, function () {
      return renderPersonalTaxCalculator(state, viewResult, ui, {
        cmp: run.cmp,
        selectedM: selectedM
      });
    });
    return html;
  }

  function ensureMultiplierCache(state, ui) {
    var base = multiplierBaseTotal(state);
    if (!ui.multiplierCache || ui.multiplierCache.base !== base) {
      ui.multiplierCache = { base: base, extras: {}, runs: {} };
    }
    var cache = ui.multiplierCache;
    MULTIPLIER_STEPS.forEach(function (m) {
      if (m === 1 || cache.extras[m]) return;
      var sandbox = JSON.parse(JSON.stringify(state));
      var before = sandbox.projects.length;
      App.Defaults.autoGenerateRevenuePlanToTarget(sandbox, base * m);
      cache.extras[m] = sandbox.projects.slice(before);
    });
    return cache;
  }

  function multiplierScenario(state, extras, multiplier) {
    var sandbox = JSON.parse(JSON.stringify(state));
    if (extras && extras.length) sandbox.projects = sandbox.projects.concat(extras);
    var result = App.Engine.runSimulation(sandbox);
    var cmp = App.Engine.runScenarioComparison(sandbox, result);
    return {
      multiplier: multiplier,
      sandbox: sandbox,
      result: result,
      cmp: cmp,
      revenue: App.Money.roundWon(cmp.commonRevenue),
      solo: App.Money.roundWon(cmp.scenarios.soloAgency.controlledEconomicValue),
      exclusive: App.Money.roundWon(cmp.scenarios.exclusiveContract.controlledEconomicValue),
      delta: App.Money.roundWon(cmp.deltas.controlledEconomicValue)
    };
  }

  function multiplierScenarios(state, ui) {
    var cache = ensureMultiplierCache(state, ui || {});
    if (!cache.base) return [];
    return MULTIPLIER_STEPS.map(function (m) {
      return multiplierScenario(state, m === 1 ? [] : cache.extras[m], m);
    });
  }

  function renderEvCompareChart(title, noteHtml, rows) {
    if (!(rows || []).length) return "";
    var maxEv = 0;
    rows.forEach(function (s) {
      maxEv = Math.max(maxEv, s.soloEV || 0, s.exclusiveEV || 0);
    });
    var html = '<section class="floor-sec">';
    html += "<h3>" + esc(title) + "</h3>";
    if (noteHtml) html += '<p class="muted small">' + noteHtml + "</p>";
    html += '<div class="floor-chart">';
    html += '<div class="floor-legend"><span><i class="floor-swatch solo"></i>1인 기획사</span>' +
      "<span><i class=\"floor-swatch ex\"></i>기존 회사 전속</span></div>";
    rows.forEach(function (s) {
      html += '<div class="floor-chart-row' + (s.now ? " is-now" : "") + '">';
      html += '<div class="floor-chart-label">' +
        (s.extra || "") +
        esc(App.Format.formatWonAbout(s.revenue).replace(/^약 /, "")) +
        (s.now ? "<em>지금</em>" : "") + "</div>";
      html += '<div class="floor-bars">';
      html += '<div class="floor-bar-line"><div class="floor-bar solo" style="width:' +
        floorBarWidth(s.soloEV, maxEv).toFixed(1) + '%"></div><b>' +
        App.Format.formatWonAbout(s.soloEV).replace(/^약 /, "") + "</b></div>";
      html += '<div class="floor-bar-line"><div class="floor-bar ex" style="width:' +
        floorBarWidth(s.exclusiveEV, maxEv).toFixed(1) + '%"></div><b>' +
        App.Format.formatWonAbout(s.exclusiveEV).replace(/^약 /, "") + "</b></div>";
      html += "</div></div>";
    });
    html += "</div></section>";
    return html;
  }

  function renderMultiplierFloorBlock(state, ui) {
    var scenarios = multiplierScenarios(state, ui);
    if (!scenarios.length) return "";
    var chartRows = scenarios.map(function (s) {
      return {
        revenue: s.revenue,
        soloEV: s.solo,
        exclusiveEV: s.exclusive,
        now: s.multiplier === 1,
        extra: '<span class="floor-chart-factor">' + s.multiplier + "배</span>"
      };
    });
    var html = renderEvCompareChart(
      "매출이 늘면 어느 쪽이 유리한가",
      "현재 등록 매출을 1배로 두고, 2~5배는 위 1~5배 탭과 같이 작품·영업 건을 추가해 다시 계산합니다. 위 차트(같은 믹스를 비율로 줄임)와는 구성이 다릅니다.",
      chartRows
    );
    html += '<section class="floor-sec">';
    html += "<h3>배수로 키우면 경제가치는</h3>";
    html += '<p class="muted small">1인 기획사와 기존 회사 전속의 실질 경제가치입니다. 상세는 위 1~5배에서 월별·시나리오·한눈을 펼쳐 보면 됩니다.</p>';
    html += '<div class="floor-panel">';
    html += '<table class="floor-table"><thead><tr><th>배수</th><th class="num">총매출</th>' +
      '<th class="num">1인 기획사</th><th class="num">기존 회사 전속</th><th class="num">차이</th></tr></thead><tbody>';
    scenarios.forEach(function (s) {
      html += '<tr class="' + (s.multiplier === 1 ? "is-now" : (s.delta >= 0 ? "ok" : "warn")) + '">';
      html += "<td>" + s.multiplier + "배" + (s.multiplier === 1 ? " · 지금" : "") + "</td>";
      html += '<td class="num">' + App.Format.formatWonAbout(s.revenue) + "</td>";
      html += '<td class="num">' + App.Format.formatWonAbout(s.solo) + "</td>";
      html += '<td class="num">' + App.Format.formatWonAbout(s.exclusive) + "</td>";
      html += '<td class="num">' + analysisDisplayAmount(s.delta, "delta") + "</td></tr>";
    });
    html += "</tbody></table></div>";
    html += '<p class="muted small"><button type="button" class="btn btn-sm" data-action="regenerate-multiples">배수 다시 생성</button> ' +
      '<button type="button" class="btn-link" data-action="select-multiplier" data-m="2">2배로 상세 보기</button></p>';
    html += "</section>";
    return html;
  }

  function scenarioLabel(state, id) {
    var sc = state.settings && state.settings.scenarios && state.settings.scenarios[id];
    if (sc && sc.label) return sc.label;
    if (id === "exclusiveContract") return "기존 회사 전속";
    return "1인 기획사";
  }

  function scenarioCell(value, show) {
    if (!show) return { html: "—", numeric: false };
    if (value && value.kind === "text") {
      return { html: esc(value.text), numeric: false, cls: "muted" };
    }
    var num = value && value.kind === "money" ? value.value : value;
    var badge = value && value.kind === "money" && value.badge ? catBadge(null, value.badge, { static: true }) + " " : "";
    return { html: badge + App.Format.formatWon(num), numeric: true };
  }

  function sameExclusiveLine(a, b) {
    if (!a || !b) return false;
    if (a.kind !== b.kind) return false;
    if (a.kind === "text") return a.text === b.text;
    return a.badge === b.badge;
  }

  function renderScenarioMetricTable(cmp, ids) {
    var showSolo = ids.indexOf("soloAgency") >= 0;
    var showEx = ids.indexOf("exclusiveContract") >= 0;
    var solo = cmp.scenarios.soloAgency;
    var ex = cmp.scenarios.exclusiveContract;
    var lines = ex.lines || {};
    var html = '<table class="scenario-compare"><thead><tr><th>항목</th>';
    if (showSolo) html += "<th class=\"num\">" + esc(solo.label) + "</th>";
    if (showEx) html += "<th class=\"num\">" + esc(ex.label) + "</th>";
    html += "</tr></thead><tbody>";
    function row(label, soloVal, exVal, opts) {
      opts = opts || {};
      var soloCell = scenarioCell(soloVal, showSolo && opts.solo !== false);
      var exCell = scenarioCell(exVal, showEx && opts.ex !== false);
      var labelHtml = esc(label);
      if (opts.parent) {
        labelHtml = '<span class="scenario-fold-label"><span class="chev" aria-hidden="true"></span>' + esc(label) + "</span>";
      } else if (opts.child) {
        labelHtml = '<span class="scenario-nest">' + esc(label) + "</span>";
      }
      if (opts.tab) {
        labelHtml = '<button type="button" class="btn-link" data-action="analysis-tab" data-tab="' +
          esc(opts.tab) + '">' + esc(label) + "</button>";
      }
      var trClass = [];
      if (opts.highlight) trClass.push("hl");
      if (opts.parent) trClass.push("scenario-parent");
      if (opts.child) trClass.push("scenario-child");
      html += "<tr" + (trClass.length ? ' class="' + trClass.join(" ") + '"' : "") + "><th>" + labelHtml + "</th>";
      if (showSolo) html += '<td class="num' + (soloCell.cls ? " " + soloCell.cls : "") + '">' + soloCell.html + "</td>";
      if (showEx) html += '<td class="num' + (exCell.cls ? " " + exCell.cls : "") + '">' + exCell.html + "</td>";
      html += "</tr>";
    }
    var exCosts = exclusiveCompareCosts(ex);
    row("총 매출", solo.totalRevenue, ex.totalRevenue);
    row("프로젝트 직접비", solo.projectDirectTotal, ex.projectDirectTotal != null ? ex.projectDirectTotal : lines.projectDirectTotal, { parent: true });
    row("진행비", solo.projectExpense, lines.projectExpense, { child: true });
    row("밥차비", solo.lunchTruck, lines.lunchTruck, { child: true });
    if (App.Money.roundWon(solo.projectDirectOther) || App.Money.roundWon(ex.projectDirectOther)) {
      row("기타 직접비", solo.projectDirectOther, lines.projectDirect, { child: true });
    }
    row("매출연동·에이전시 수수료", solo.commissionFees, { kind: "text", text: "—" });
    row("회사 운영비(판관비)", solo.opexOperating, exCosts.opex);
    row("배우 활동지원", solo.supportCost, exCosts.actorSupport);
    row("배우 부담 지원비", 0, ex.actorBorneSupportCost, { solo: false });
    row("배분 전 공제", 0, ex.deductibleBeforeSplit, { solo: false });
    row("배분 기준금액", solo.totalRevenue, ex.splitBase);
    row("회사 수익배분", 0, ex.companyShare, { solo: false });
    row("배우 귀속 매출", solo.actorAttributedRevenue, ex.actorAttributedRevenue);
    row("법인 세전이익", solo.corporatePreTaxProfit, 0, { ex: false });
    row("법인세", solo.corporateTax, 0, { ex: false });
    row("세후 법인 잔여이익", solo.corporateEndingCash, 0, { ex: false });
    row("대표 급여 총액", solo.earnedGross, 0, { ex: false });
    row("대표 인센티브 (급여 총액에 포함)", solo.ownerIncentiveAmount, 0, { ex: false });
    if (App.Money.roundWon(solo.ownerDividendAmount)) {
      row(ownerPayoutAmountLabel(solo), solo.ownerDividendAmount, 0, { ex: false });
      row(ownerPayoutTaxLabel(solo), solo.ownerDividendTax, 0, { ex: false, tab: "income-tax" });
    }
    if (App.Money.roundWon(solo.ownerProfitShareAmount)) {
      row("수익배분", solo.ownerProfitShareAmount, 0, { ex: false });
      row(solo.ownerProfitShareTaxLabel || "사업소득세 (3.3%)", solo.ownerProfitShareTax, 0, { ex: false, tab: "income-tax" });
    }
    row("대표 신용카드 사용분", solo.ownerCorporateCardValue, 0, { ex: false });
    row("개인 귀속소득", solo.actorGrossIncome, ex.actorGrossIncome);
    row("배우 부담 인건비", 0, ex.directorCost, { solo: false });
    row("근로/종합소득세", solo.incomeTax, ex.incomeTax, { tab: "income-tax" });
    row("지방소득세", solo.localIncomeTax, ex.localIncomeTax, { tab: "income-tax" });
    row("급여 원천징수 (기납부)", solo.withholdingTax, ex.withholdingTax, { tab: "income-tax" });
    row("개인 최종 세부담", solo.personalTax, ex.personalTax, { tab: "income-tax" });
    row("대표 급여 세후 실수령", solo.actorNetIncome, 0, { ex: false, tab: "income-tax" });
    row("총 세부담", solo.totalTaxBurden, ex.totalTaxBurden, { tab: "income-tax" });
    row("배우 개인 실수령", solo.actorNetIncome, ex.actorNetIncome, { highlight: true });
    row("실질 경제가치", solo.controlledEconomicValue, ex.controlledEconomicValue);
    html += "</tbody></table>";
    return html;
  }

  function exclusiveSupportCell(p) {
    if (p.exclusiveCompanyValue && !p.exclusiveActorCost) {
      return catBadge(null, "기존 회사 부담", { static: true }) + " " + App.Format.formatWon(p.exclusiveCompanyValue);
    }
    if (p.exclusiveActorCost && !p.exclusiveCompanyValue) {
      return catBadge(null, "배우 부담", { static: true }) + " " + App.Format.formatWon(p.exclusiveActorCost);
    }
    if (p.exclusiveCompanyValue) return App.Format.formatWon(p.exclusiveCompanyValue) + " 지원";
    return "—";
  }

  function supportCompareRow(name, soloAmt, exclusiveHtml, hl) {
    return "<tr" + (hl ? ' class="hl"' : "") + "><th>" + esc(name) +
      '</th><td class="num">' + App.Format.formatWon(-App.Money.roundWon(soloAmt || 0)) +
      '</td><td class="num">' + exclusiveHtml + "</td></tr>";
  }

  function renderSupportValueTables(cmp) {
    var rows = (cmp.scenarios.exclusiveContract && cmp.scenarios.exclusiveContract.supportBreakdown) || [];
    if (!rows.length) return "";
    var vehicleIds = App.Defaults.VEHICLE_SUPPORT_IDS || [];
    var vehicleRows = [];
    var otherRows = [];
    rows.forEach(function (p) {
      if (!p.soloCost && !p.exclusiveCompanyValue && !p.exclusiveActorCost) return;
      if (vehicleIds.indexOf(p.id) >= 0 || p.group === "vehicle" || String(p.id).indexOf("veh-") === 0) vehicleRows.push(p);
      else otherRows.push(p);
    });
    if (!vehicleRows.length && !otherRows.length) return "";
    var html = '<div class="card sim-compact" style="margin-top:12px"><h3>회사 지원가치</h3>';
    html += '<p class="muted small">1인 기획사와 기존 회사 전속 모두, 배우 개인이 실제로 누리는 지원만 경제가치에 더합니다. 회사 운영비는 비용으로만 반영합니다.</p>';
    html += '<table class="scenario-compare"><thead><tr><th>항목</th><th class="num">1인 기획사</th><th class="num">기존 회사 전속</th></tr></thead><tbody>';
    var vSolo = 0;
    var vEx = 0;
    vehicleRows.forEach(function (p) {
      vSolo += p.soloCost || 0;
      vEx += p.exclusiveCompanyValue || 0;
      html += supportCompareRow(p.name, p.soloCost, exclusiveSupportCell(p));
    });
    if (vehicleRows.length) {
      html += supportCompareRow("회사 이동지원 합계", vSolo, App.Format.formatWon(vEx) + " 지원", true);
    }
    otherRows.forEach(function (p) {
      html += supportCompareRow(p.name, p.soloCost, exclusiveSupportCell(p));
    });
    html += supportCompareRow(
      "회사 지원가치 합계",
      cmp.scenarios.soloAgency.supportCost,
      App.Format.formatWon(cmp.scenarios.exclusiveContract.companySupportValue) + " 지원",
      true
    );
    html += "</tbody></table></div>";
    return html;
  }

  function exclusiveBearerBadge(bearer) {
    if (bearer === "actor") return catBadge(null, "배우 부담", { static: true });
    if (bearer === "company") return catBadge(null, "기존 회사 부담", { static: true });
    return catBadge(null, "해당 없음", { static: true });
  }

  function renderPayrollBreakdownTable(cmp) {
    var rows = (cmp.scenarios.soloAgency && cmp.scenarios.soloAgency.payrollBreakdown) || [];
    if (!rows.length) return "";
    var ex = cmp.scenarios.exclusiveContract || {};
    var html = '<div class="card sim-compact" style="margin-top:12px"><h3>인건비 상세</h3>';
    html += '<p class="muted small">1인 기획사에서는 전원 법인 인건비입니다. 기존 회사 전속은 직원별 부담주체(해당 없음 / 기존 회사 부담 / 배우 부담)에 따라 다르게 계산합니다. 비교 부담유형은 시뮬레이션 설정 &gt; 조직·인건비에서 직원별로 바꿀 수 있습니다.</p>';
    html += '<p class="muted small">직원별 금액은 급여·인센티브만입니다. 식대는 인원 단위로 합산되어 개인별로 나누지 않고, 아래 합계에는 배우 부담 인원의 식대까지 포함되어 있어 개인 금액의 단순 합과 다를 수 있습니다.</p>';
    html += '<table class="scenario-compare"><thead><tr><th>직원</th><th class="num">1인 기획사</th><th class="num">기존 회사 전속</th></tr></thead><tbody>';
    var soloTotal = 0;
    var exCompanyTotal = 0;
    rows.forEach(function (r) {
      soloTotal += r.soloAmount || 0;
      if (r.exclusiveBearer === "company") exCompanyTotal += r.exclusiveAmount || 0;
      var exCell = r.exclusiveBearer === "notApplicable"
        ? exclusiveBearerBadge(r.exclusiveBearer)
        : exclusiveBearerBadge(r.exclusiveBearer) + " " + App.Format.formatWon(r.exclusiveAmount);
      html += "<tr><th>" + esc(r.name) + (r.role ? ' <span class="muted small">/ ' + esc(r.role) + "</span>" : "") + "</th>" +
        '<td class="num">' + catBadge(null, "법인 부담", { static: true }) + " " + App.Format.formatWon(r.soloAmount) + "</td>" +
        '<td class="num">' + exCell + "</td></tr>";
    });
    html += '<tr class="hl"><th>인건비 합계</th><td class="num">' + App.Format.formatWon(App.Money.roundWon(soloTotal)) +
      '</td><td class="num">기존 회사 ' + App.Format.formatWon(exCompanyTotal) + " · 배우 " +
      App.Format.formatWon(ex.directorCost) + " (식대 포함)</td></tr>";
    html += "</tbody></table></div>";
    return html;
  }

  function isRoadManagerEmployee(row) {
    return /로드매니저/.test(((row && row.role) || "") + ((row && row.name) || ""));
  }

  function isVehicleRentSupport(p) {
    if (!p) return false;
    var id = String(p.id || "");
    if (id === "sp-vehicle-rent" || id.indexOf("veh-rent-") === 0) return true;
    return /렌트/.test(p.name || "");
  }

  function isVehicleSupportRow(p) {
    if (!p) return false;
    if (p.group === "vehicle") return true;
    if (String(p.id || "").indexOf("veh-") === 0) return true;
    return !!(App.Defaults.isVehicleSupportPolicy && App.Defaults.isVehicleSupportPolicy(p));
  }

  function exclusiveCompareCosts(ex) {
    var payroll = (ex && ex.payrollBreakdown) || [];
    var support = (ex && ex.supportBreakdown) || [];
    var companyPayRows = payroll.filter(function (r) {
      return r && r.exclusiveBearer === "company" && App.Money.roundWon(r.exclusiveAmount);
    });
    var roadRows = companyPayRows.filter(isRoadManagerEmployee);
    var rentRows = support.filter(function (p) {
      return isVehicleRentSupport(p) && App.Money.roundWon(p.exclusiveCompanyValue);
    });
    var actorSupportRows = support.filter(function (p) {
      return !isVehicleSupportRow(p) && App.Money.roundWon(p.exclusiveCompanyValue);
    });
    var supportAllRows = support.filter(function (p) {
      return App.Money.roundWon(p.exclusiveCompanyValue);
    });
    var companyPayroll = App.Money.sumBy(companyPayRows, function (r) { return r.exclusiveAmount; });
    var roadManager = App.Money.sumBy(roadRows, function (r) { return r.exclusiveAmount; });
    var vehicleRent = App.Money.sumBy(rentRows, function (p) { return p.exclusiveCompanyValue; });
    var actorSupport = App.Money.sumBy(actorSupportRows, function (p) { return p.exclusiveCompanyValue; });
    var projectExpense = App.Money.roundWon(ex && ex.projectExpense);
    var lunchTruck = App.Money.roundWon(ex && ex.lunchTruck);
    var opex = App.Money.roundWon(vehicleRent + roadManager);
    var share = App.Money.roundWon(ex && ex.companyShare);
    var companySupportValue = App.Money.roundWon(ex && ex.companySupportValue);
    var companyCostTotal = App.Money.roundWon(
      projectExpense + lunchTruck + companyPayroll + companySupportValue
    );
    var remaining = App.Money.roundWon(share - companyCostTotal);
    return {
      companyShare: share,
      projectExpense: projectExpense,
      lunchTruck: lunchTruck,
      vehicleRent: vehicleRent,
      rentRows: rentRows,
      roadManager: roadManager,
      roadRows: roadRows,
      companyPayroll: companyPayroll,
      companyPayRows: companyPayRows,
      opex: opex,
      actorSupport: actorSupport,
      actorSupportRows: actorSupportRows,
      companyCostTotal: companyCostTotal,
      remaining: remaining,
      supportAllRows: supportAllRows,
      companySupportValue: companySupportValue,
      economicRemaining: remaining
    };
  }

  function analysisSignRole(opts) {
    opts = opts || {};
    if (opts.sign) return opts.sign;
    if (opts.cost) return "out";
    if (opts.plus) return "in";
    if (opts.signed) return "delta";
    return "result";
  }

  function analysisShownNumber(amount, role) {
    var n = App.Money.roundWon(amount);
    if (role === "out") return n ? -Math.abs(n) : 0;
    if (role === "in") return n ? Math.abs(n) : 0;
    return n;
  }

  function analysisDisplayAmount(amount, role) {
    var shown = analysisShownNumber(amount, role);
    var text = App.Format.formatWon(shown);
    if ((role === "in" || role === "delta") && shown > 0) text = "+" + text;
    return text;
  }

  function analysisAmountClass(amount, role) {
    return analysisShownNumber(amount, role) < 0 ? " is-neg" : "";
  }

  function analysisNegClassAttr(amount, role) {
    return analysisShownNumber(amount, role) < 0 ? ' class="is-neg"' : "";
  }

  function analysisValueClass(text) {
    return String(text || "").charAt(0) === "-" ? " is-neg" : "";
  }

  function exclusiveCompanyEconomics(ex) {
    return exclusiveCompareCosts(ex);
  }

  function scenarioBlockAmount(amount, opts) {
    return analysisDisplayAmount(amount, analysisSignRole(opts));
  }

  function scenarioNestLine(label, amount, opts) {
    opts = opts || {};
    return '<div class="scenario-block-line nest"><span>' + esc(label) + "</span><b" +
      analysisNegClassAttr(amount, analysisSignRole(opts)) + ">" +
      scenarioBlockAmount(amount, opts) + "</b></div>";
  }

  function scenarioBlockLine(label, amount, opts) {
    opts = opts || {};
    var cls = "scenario-block-line";
    if (opts.total) cls += " total";
    if (opts.subtotal) cls += " subtotal";
    if (opts.mute) cls += " mute";
    return '<div class="' + cls + '"><span>' + esc(label) + "</span><b" +
      analysisNegClassAttr(amount, analysisSignRole(opts)) + ">" +
      scenarioBlockAmount(amount, opts) + "</b></div>";
  }

  function scenarioMiniRow(label, amount, sign) {
    sign = sign || "result";
    return "<tr><th>" + esc(label) + '</th><td class="num' + analysisAmountClass(amount, sign) + '">' +
      analysisDisplayAmount(amount, sign) + "</td></tr>";
  }

  function corporateTaxParts(result) {
    var d = (result && result.kpis && result.kpis.taxDetail) || {};
    return {
      taxableIncome: App.Money.roundWon(d.taxable),
      corporateTax: App.Money.roundWon(d.corporate),
      localIncomeTax: App.Money.roundWon(d.local)
    };
  }

  function scenarioEconomicValueRateDeltaText(soloValue, exclusiveValue, revenue) {
    var soloRate = scenarioEconomicValueRate(soloValue, revenue);
    var exclusiveRate = scenarioEconomicValueRate(exclusiveValue, revenue);
    if (soloRate == null || exclusiveRate == null) return "—";
    var diff = soloRate - exclusiveRate;
    var text = App.Format.formatPct(diff) + "p";
    if (diff > 0) text = "+" + text;
    return text;
  }

  function scenarioEconomicValueRate(value, revenue) {
    var base = App.Money.roundWon(revenue);
    if (!base) return null;
    return App.Money.roundWon(value) / Math.abs(base);
  }

  function scenarioEconomicValueRateText(value, revenue) {
    var rate = scenarioEconomicValueRate(value, revenue);
    return rate == null ? "—" : App.Format.formatPct(rate);
  }

  function scenarioYearsFromResult(result, solo, ex) {
    if (App.TaxYear && App.TaxYear.yearsFromMonths) {
      var fromMonths = App.TaxYear.yearsFromMonths((result && result.months) || []);
      if (fromMonths.length) return fromMonths;
    }
    return taxYearList(ex || {}, solo || {}, { detail: (ex && ex.personalTaxDetail) || {} }, { detail: (solo && solo.personalTaxDetail) || {} }, result);
  }

  function yearEndClosing(result, year) {
    var months = ((result && result.months) || []).filter(function (r) {
      return Number(String(r.month).slice(0, 4)) === Number(year);
    });
    if (!months.length) return 0;
    return App.Money.roundWon(months[months.length - 1].closing);
  }

  function corpYearView(result, year) {
    var row = ((result && result.kpis && result.kpis.taxDetail && result.kpis.taxDetail.byYear) || {})[year] || {};
    var preTaxProfit = App.Money.roundWon(row.preTaxProfit);
    var corporateTax = App.Money.roundWon(row.corporateTax);
    var localIncomeTax = App.Money.roundWon(row.localIncomeTax);
    var afterTaxNet = row.afterTaxNet != null
      ? App.Money.roundWon(row.afterTaxNet)
      : App.Money.roundWon(preTaxProfit - corporateTax - localIncomeTax);
    return {
      preTaxProfit: preTaxProfit,
      taxableIncome: App.Money.roundWon(row.taxableIncome),
      nolUsed: App.Money.roundWon(row.nolUsed),
      nolIncurred: App.Money.roundWon(row.nolIncurred),
      corporateTax: corporateTax,
      localIncomeTax: localIncomeTax,
      afterTaxNet: afterTaxNet
    };
  }

  function soloPersonYearView(solo, year) {
    var d = taxYearDetailOf(solo && solo.personalTaxDetail, year) || {};
    var incomeTax = App.Money.roundWon(d.determinedTax != null ? d.determinedTax : d.incomeTax);
    var local = App.Money.roundWon(d.localIncomeTax);
    var salary = App.Money.roundWon(d.earnedGross);
    var dividend = App.Money.roundWon(d.otherIncome);
    var dividendTax = App.Money.roundWon(d.dividendTax);
    var profitShare = App.Money.roundWon(d.businessIncome);
    var profitShareTax = App.Money.roundWon(d.profitShareTax);
    var net = d.afterTaxIncome != null
      ? App.Money.roundWon(d.afterTaxIncome)
      : App.Money.roundWon(salary + dividend + profitShare - incomeTax - local - dividendTax - profitShareTax);
    return {
      salary: salary,
      dividend: dividend,
      dividendTax: dividendTax,
      profitShare: profitShare,
      profitShareTax: profitShareTax,
      profitShareTaxLabel: d.profitShareTaxLabel || "사업소득세 (3.3%)",
      payoutTaxLabel: d.payoutTaxLabel || ownerPayoutTaxLabel(solo, d),
      payoutIncomeLabel: d.payoutIncomeLabel || ownerPayoutShortLabel(solo, d),
      incomeTax: incomeTax,
      localIncomeTax: local,
      net: net
    };
  }

  function exclusivePersonYearView(ex, year) {
    var slice = ((ex && ex.taxYears) || []).filter(function (s) { return Number(s.year) === Number(year); })[0] || {};
    var d = taxYearDetailOf(ex && ex.personalTaxDetail, year) || {};
    var incomeTax = App.Money.roundWon(d.determinedTax != null ? d.determinedTax : d.incomeTax);
    var local = App.Money.roundWon(d.localIncomeTax);
    var gross = App.Money.roundWon(slice.actorGross != null ? slice.actorGross : d.yearActorGross);
    var net = d.afterTaxIncome != null
      ? App.Money.roundWon(d.afterTaxIncome)
      : App.Money.roundWon(App.Money.roundWon(slice.taxableIncome) - incomeTax - local);
    var directorCost = App.Money.roundWon(slice.directorCost);
    var actorSupport = App.Money.roundWon(slice.actorSupport);
    return {
      gross: gross,
      directorCost: directorCost,
      actorSupport: actorSupport,
      preTax: App.Money.roundWon(gross - directorCost - actorSupport),
      incomeTax: incomeTax,
      localIncomeTax: local,
      net: net
    };
  }

  function scenarioYearPlus() {
    return '<div class="scenario-year-plus" aria-hidden="true"></div>';
  }

  function scenarioYearColsHtml(years, renderCol) {
    var n = (years || []).length;
    var html = '<div class="scenario-year-cols' + (n > 1 ? " years-" + n : "") + '">';
    (years || []).forEach(function (year, i) {
      if (i) html += scenarioYearPlus();
      html += renderCol(year);
    });
    html += "</div>";
    return html;
  }

  function scenarioYearCol(year, lines) {
    var html = '<div class="scenario-year-col">';
    html += "<h5>" + esc(String(year)) + "</h5>";
    (lines || []).forEach(function (line) {
      html += scenarioBlockLine(line.label, line.amount, { total: !!line.total, sign: line.sign || "result" });
    });
    html += "</div>";
    return html;
  }

  function scenarioHelpButton(action, label) {
    if (!action) return "";
    return '<button type="button" class="help-q" data-action="' + esc(action) +
      '" aria-label="' + esc(label || "설명") + '">?</button>';
  }

  function sameAmountStar(title, tone) {
    var cls = "same-amt" + (tone === "gold" ? " same-amt-gold" : "");
    return '<span class="' + cls + '" title="' + esc(title) + '">' +
      '<span class="same-amt-star" aria-hidden="true">★</span>' +
      '<span class="same-amt-txt">같은 금액</span></span>';
  }

  function scenarioGroupFoot(label, amount, helpAction, sameTitle, sameTone) {
    return '<div class="scenario-year-sum">' +
      '<span class="scenario-year-sum-arrow" aria-hidden="true">↓</span>' +
      '<span class="scenario-year-sum-k-wrap"><span class="scenario-year-sum-k">' + esc(label) + "</span>" +
      scenarioHelpButton(helpAction, label + " 설명") + "</span>" +
      "<b>" + (sameTitle ? sameAmountStar(sameTitle, sameTone) : "") + App.Format.formatWon(amount) + "</b></div>";
  }

  function scenarioFamilyEqRow(label, amount, sameTitle, sameTone) {
    return '<div class="scenario-family-eq-row"><span>' + esc(label) + "</span><b>" +
      (sameTitle ? sameAmountStar(sameTitle, sameTone) : "") +
      App.Format.formatWon(amount) + "</b></div>";
  }

  function scenarioFamilyJoin(sign) {
    return '<div class="scenario-join-mini" aria-hidden="true">' + (sign === "-" ? "−" : "+") + "</div>";
  }

  function soloCashForEconomicValue(solo) {
    if (!solo) return 0;
    if (solo.corporateCashForEconomicValue != null) {
      return App.Money.roundWon(solo.corporateCashForEconomicValue);
    }
    return App.Money.roundWon(solo.corporateEndingCash);
  }

  function soloProfitForEconomicValue(solo) {
    if (!solo) return 0;
    if (solo.corporateAfterTaxNet != null) return App.Money.roundWon(solo.corporateAfterTaxNet);
    return 0;
  }

  function corpProfitCashBridge(result, solo, periodAfterTax) {
    var k = (result && result.kpis) || {};
    var months = (result && result.months) || [];
    var initial = App.Money.roundWon(k.initialCash);
    var otherIn = App.Money.sumBy(months, function (r) { return r.otherInflow || 0; });
    var vatNet = App.Money.roundWon(
      App.Money.sumBy(months, function (r) { return r.vatOutput || 0; }) -
      App.Money.sumBy(months, function (r) { return r.vatSettlement || 0; })
    );
    var funding = App.Money.roundWon(k.fundingOut);
    var dividend = App.Money.roundWon(k.dividend);
    var cash = soloCashForEconomicValue(solo);
    var profit = App.Money.roundWon(periodAfterTax);
    var delta = App.Money.roundWon(cash - profit);
    var explained = App.Money.roundWon(initial + otherIn + vatNet - funding - dividend);
    return {
      initial: initial,
      otherIn: otherIn,
      vatNet: vatNet,
      funding: funding,
      dividend: dividend,
      other: App.Money.roundWon(delta - explained),
      cash: cash,
      profit: profit,
      delta: delta
    };
  }

  function renderSoloFamilyTotal(solo, revenue) {
    var card = App.Money.roundWon(solo.ownerCorporateCardValue);
    var profit = soloProfitForEconomicValue(solo);
    var cashGap = App.Money.roundWon(
      soloCashForEconomicValue(solo) - profit + App.Money.roundWon(solo.ownerDividendAmount)
    );
    var rateText = scenarioEconomicValueRateText(solo.controlledEconomicValue, revenue);
    var html = '<div class="scenario-family-total">';
    html += '<div class="scenario-family-eq">';
    html += scenarioFamilyEqRow("전체 기간 누적 세후순이익", profit,
      "왼쪽 법인 「전체 기간 세후순이익」과 같은 금액", "gold");
    html += scenarioFamilyJoin();
    html += scenarioFamilyEqRow("대표 개인 세후 실수령", solo.actorNetIncome);
    if (App.Money.roundWon(solo.ownerDividendAmount)) {
      html += scenarioFamilyJoin("-");
      html += scenarioFamilyEqRow(
        solo.ownerDividendMode === "rate" ? "대표 배당 (영업이익 연동)" : "대표 배당 (이익잉여금 인출)",
        solo.ownerDividendAmount
      );
    }
    if (card) {
      html += scenarioFamilyJoin();
      html += scenarioFamilyEqRow("대표 신용카드 사용분", card);
    }
    html += "</div>";
    html += '<div class="scenario-family-result"><span>1인 기획사 경제가치</span><b>' +
      App.Format.formatWon(solo.controlledEconomicValue) + "</b></div>";
    html += '<div class="scenario-family-rate">매출 대비 경제가치율 ' + esc(rateText) + "</div>";
    if (cashGap) {
      html += '<p class="muted small">손익 외 현금 ' + App.Format.formatWon(cashGap) +
        "원은 법인 통장에는 반영되지만 경제가치 비교에서는 제외</p>";
    }
    html += "</div>";
    return html;
  }

  function renderExclusiveFamilyTotal(ex, revenue) {
    var rateText = scenarioEconomicValueRateText(ex.controlledEconomicValue, revenue);
    var html = '<div class="scenario-family-total">';
    html += '<div class="scenario-family-eq">';
    html += scenarioFamilyEqRow("세후 개인 실수령", ex.actorNetIncome);
    html += "</div>";
    html += '<div class="scenario-family-result"><span>기존 회사 전속 경제가치</span><b>' +
      App.Format.formatWon(ex.controlledEconomicValue) + "</b></div>";
    html += '<div class="scenario-family-rate">매출 대비 경제가치율 ' + esc(rateText) + "</div>";
    html += "</div>";
    return html;
  }

  function scenarioDetailFoldBody(ui, id, summary, innerHtml, helpAction) {
    return '<details class="tax-fold scenario-fold" data-tax-fold="' + esc(id) + '"' +
      (taxFoldOpen(ui, id) ? " open" : "") + "><summary>" + esc(summary) +
      scenarioHelpButton(helpAction, summary + " 설명") + "</summary>" +
      '<div class="tax-fold-body">' + innerHtml + "</div></details>";
  }

  function scenarioDetailFold(ui, id, summary, rowsHtml, helpAction) {
    return scenarioDetailFoldBody(ui, id, summary, '<table class="scenario-mini">' + rowsHtml + "</table>", helpAction);
  }

  function personalTaxYearColLines(detail) {
    var f = personalTaxYearFacts(detail);
    if (!f) return [{ label: "과세표준", amount: 0, sign: "result" }];
    var lines = [];
    if (f.earnedGross) {
      lines.push({ label: "대표자 급여", amount: f.earnedGross, sign: "in" });
      lines.push({ label: "근로소득공제", amount: f.earnedIncomeDeduction, sign: "out" });
    } else if (f.taxableIncome) {
      lines.push({ label: "과세 대상 소득", amount: f.taxableIncome, sign: "in" });
    }
    if (f.otherIncome) {
      lines.push({ label: f.payoutIncomeLabel || "대표 배당", amount: f.otherIncome, sign: "in" });
    }
    lines.push({ label: "과세표준", amount: f.taxableBase, sign: "result" });
    lines.push({ label: "산출세액", amount: f.assessed, sign: "out" });
    lines.push({ label: "세액공제", amount: f.taxCredit, sign: "out" });
    lines.push({ label: "결정세액", amount: f.determined, sign: "result" });
    lines.push({ label: "지방소득세", amount: f.local, sign: "out" });
    if (f.dividendTax) {
      lines.push({ label: f.payoutTaxLabel || "배당소득세 (15.4%)", amount: f.dividendTax, sign: "out" });
    }
    lines.push({ label: "연도 총세액", amount: f.total, sign: "out" });
    lines.push({ label: "세후 개인 실수령", amount: f.afterTax, total: true, sign: "result" });
    return lines;
  }

  function exclusiveTaxYearColLines(ex, year) {
    var v = exclusivePersonYearView(ex, year);
    var f = personalTaxYearFacts(taxYearDetailOf(ex && ex.personalTaxDetail, year));
    var lines = [
      { label: "배우 귀속소득", amount: v.gross, sign: "in" },
      { label: "배우 부담 인건비", amount: v.directorCost, sign: "out" }
    ];
    if (v.actorSupport) {
      lines.push({ label: "배우 부담 지원비", amount: v.actorSupport, sign: "out" });
    }
    lines.push({ label: "실과세표준", amount: v.preTax, sign: "result" });
    if (f) {
      lines.push({ label: "과세표준", amount: f.taxableBase, sign: "result" });
      lines.push({ label: "산출세액", amount: f.assessed, sign: "out" });
      lines.push({ label: "세액공제", amount: f.taxCredit, sign: "out" });
      lines.push({ label: "결정세액", amount: f.determined, sign: "result" });
      lines.push({ label: "지방소득세", amount: f.local, sign: "out" });
      lines.push({ label: "연도 총세액", amount: f.total, sign: "out" });
      lines.push({
        label: "세후 개인 실수령",
        amount: f.afterTax || v.net,
        total: true,
        sign: "result"
      });
    } else {
      lines.push({ label: "세후 개인 실수령", amount: v.net, total: true, sign: "result" });
    }
    return lines;
  }

  function exclusiveBurdenMiniRow(label, amount) {
    return "<tr><th>" + esc(label) + '</th><td class="num' + analysisAmountClass(amount, "out") + '">' +
      catBadge(null, "기존 회사 100% 부담", { static: true }) + " " +
      analysisDisplayAmount(amount, "out") + "</td></tr>";
  }

  function renderSoloCorpGroup(solo, result, years, ui) {
    var tax = corporateTaxParts(result);
    var k = (result && result.kpis) || {};
    var html = '<section class="scenario-group scenario-group-corp">';
    html += "<h3>법인</h3>";
    html += scenarioYearColsHtml(years, function (year) {
      var v = corpYearView(result, year);
      var lines = [
        { label: "세전이익", amount: v.preTaxProfit, sign: "result" }
      ];
      if (v.nolUsed) {
        lines.push({ label: "이월결손금 공제", amount: v.nolUsed, sign: "out" });
      }
      lines.push(
        { label: "과세표준", amount: v.taxableIncome, sign: "result" },
        { label: "법인세", amount: v.corporateTax, sign: "out" },
        { label: "지방소득세", amount: v.localIncomeTax, sign: "out" },
        { label: "세후순이익", amount: v.afterTaxNet, total: true, sign: "result" }
      );
      return scenarioYearCol(year, lines);
    });
    var periodAfterTax = App.Money.roundWon(
      years.reduce(function (sum, year) {
        return sum + corpYearView(result, year).afterTaxNet;
      }, 0)
    );
    var bridge = corpProfitCashBridge(result, solo, periodAfterTax);
    html += scenarioGroupFoot("전체 기간 세후순이익", periodAfterTax, "open-scenario-corp-help",
      "아래 1인 기획사 경제가치의 누적 세후순이익과 같은 금액", "gold");
    if (bridge.delta) {
      html += scenarioGroupFoot("손익 외 현금", bridge.delta, "open-scenario-corp-help");
    }
    html += scenarioGroupFoot("전체 세후 법인잔여", soloCashForEconomicValue(solo), "open-scenario-corp-help",
      "위 기말 맞춤의 월말 자금 · 월별 분석 표와 같은 금액");
    html += scenarioDetailFold(ui, "scenario-corp", "법인 계산 상세 보기",
      scenarioMiniRow("총매출", solo.totalRevenue, "in") +
      scenarioMiniRow("프로젝트 직접비", solo.projectDirectTotal, "out") +
      scenarioMiniRow("매출연동·에이전시 수수료", solo.commissionFees, "out") +
      scenarioMiniRow("판관비", solo.opexOperating, "out") +
      scenarioMiniRow("인건비", solo.payroll, "out") +
      scenarioMiniRow("배우 활동지원", solo.supportCost, "out") +
      scenarioMiniRow("초기비용", k.startupCost, "out") +
      scenarioMiniRow("세전이익", solo.corporatePreTaxProfit, "result") +
      scenarioMiniRow("법인세", tax.corporateTax, "out") +
      scenarioMiniRow("법인지방소득세", tax.localIncomeTax, "out") +
      scenarioMiniRow("세후순이익", App.Money.roundWon(
        solo.corporatePreTaxProfit - tax.corporateTax - tax.localIncomeTax
      ), "result") +
      (bridge.initial ? scenarioMiniRow("최초 보유현금", bridge.initial, "in") : "") +
      (bridge.vatNet ? scenarioMiniRow("부가세 예수금−납부", bridge.vatNet, "result") : "") +
      (bridge.otherIn ? scenarioMiniRow("보증금 회수·기타입금", bridge.otherIn, "in") : "") +
      (bridge.funding ? scenarioMiniRow("보증금·자산", bridge.funding, "out") : "") +
      (bridge.dividend ? scenarioMiniRow("대표 배당", bridge.dividend, "out") : "") +
      (bridge.other ? scenarioMiniRow("기타 현금 조정", bridge.other, "result") : "") +
      (bridge.delta ? scenarioMiniRow("손익 외 현금", bridge.delta, "result") : "") +
      scenarioMiniRow("법인 세후 잔여", bridge.cash, "result"),
      "open-scenario-corp-help");
    if (ui && ui.scenarioCorpHelpOpen) html += renderScenarioCorpHelpModal(solo, bridge);
    html += "</section>";
    return html;
  }

  function renderScenarioCorpHelpModal(solo, bridge) {
    var html = '<div class="app-modal-backdrop" role="presentation">';
    html += '<div class="app-modal" role="dialog" aria-modal="true" aria-labelledby="scenario-corp-help-title">';
    html += '<div class="app-modal-head"><h3 id="scenario-corp-help-title">법인 카드 설명</h3>';
    html += '<button type="button" class="app-modal-x" data-action="close-scenario-corp-help" aria-label="닫기">×</button>';
    html += "</div>";
    html += '<div class="app-modal-body">';
    html += '<section class="app-modal-section"><h4>전체 기간 세후순이익</h4>';
    html += '<p class="app-modal-note">「세후순이익」은 그 해 세전손익에서 당해 법인세·주민세만 뺀 금액입니다. 적자면 과세표준은 0이어도 손실이 그대로 남고, 그 결손금은 다음 해 과세표준에서 빼 세금을 줄입니다.</p>';
    html += "</section>";
    if (bridge.delta) {
      html += '<section class="app-modal-section"><h4>손익 외 현금</h4>';
      html += '<p class="app-modal-note">세후순이익은 장부 이익이고, 법인잔여는 통장입니다. 차이 ' +
        App.Format.formatWon(bridge.delta) + "은 손익에 넣지 않는 현금입니다. 법인 통장 잔액에는 남지만 1인 기획사 경제가치 비교에는 넣지 않습니다.";
      if (bridge.initial) html += " 최초 보유현금 " + App.Format.formatWon(bridge.initial) + ".";
      if (bridge.vatNet) html += " 부가세 예수금−납부 " + App.Format.formatWon(bridge.vatNet) + ".";
      if (bridge.otherIn) html += " 보증금 회수·기타입금 " + App.Format.formatWon(bridge.otherIn) + ".";
      if (bridge.funding) html += " 보증금·자산 " + App.Format.formatWon(-Math.abs(bridge.funding)) + ".";
      if (bridge.dividend) html += " 대표 배당 " + App.Format.formatWon(-Math.abs(bridge.dividend)) + ".";
      html += "</p></section>";
    }
    html += '<section class="app-modal-section"><h4>전체 세후 법인잔여</h4>';
    html += '<p class="app-modal-note">법인잔여는 통장에서 아직 안 낸 법인세·주민세를 뺀 금액입니다. 기간말 현금 ' +
      App.Format.formatWon(solo.corporateEndingCash) + "과 다를 수 있습니다. 1인 기획사 경제가치는 이 통장잔액이 아니라 전체 기간 누적 세후순이익을 사용합니다.</p></section>";
    html += '<section class="app-modal-section"><h4>법인 계산 상세 보기</h4>';
    html += '<p class="app-modal-note">세후순이익은 세전이익에서 법인세·법인지방소득세를 뺀 손익 기준 금액입니다. ' +
      "위쪽 「전체 세후 법인잔여」는 최초 보유현금·보증금·자산 구입 등 손익 외 현금이동까지 포함한 실제 통장잔액이라 서로 다를 수 있습니다.</p></section>";
    html += "</div>";
    html += '<div class="app-modal-foot"><button type="button" class="btn" data-action="close-scenario-corp-help">확인</button></div>';
    html += "</div></div>";
    return html;
  }

  function renderSoloPersonGroup(solo, years, ui) {
    var d = solo.personalTaxDetail || {};
    var html = '<section class="scenario-group scenario-group-solo-person">';
    html += "<h3>대표 개인</h3>";
    html += scenarioYearColsHtml(years, function (year) {
      var v = soloPersonYearView(solo, year);
      var lines = [
        { label: "급여", amount: v.salary, sign: "in" }
      ];
      if (v.dividend) {
        lines.push({ label: ownerPayoutShortLabel(solo, v), amount: v.dividend, sign: "in" });
      }
      if (v.profitShare) {
        lines.push({ label: "수익배분", amount: v.profitShare, sign: "in" });
      }
      lines.push(
        { label: "종합소득세", amount: v.incomeTax, sign: "out" },
        { label: "지방소득세", amount: v.localIncomeTax, sign: "out" }
      );
      if (v.dividendTax) {
        lines.push({ label: narrowTaxLabel(ownerPayoutTaxLabel(solo, v)), amount: v.dividendTax, sign: "out" });
      }
      if (v.profitShareTax) {
        lines.push({ label: narrowTaxLabel(v.profitShareTaxLabel || "사업소득세 (3.3%)"), amount: v.profitShareTax, sign: "out" });
      }
      lines.push({ label: "실수령", amount: v.net, total: true, sign: "result" });
      return scenarioYearCol(year, lines);
    });
    html += scenarioGroupFoot("전체 세후 개인실수령", solo.actorNetIncome, "open-scenario-solo-person-help");
    var personInner = scenarioYearColsHtml(years, function (year) {
      return scenarioYearCol(year + " 귀속", personalTaxYearColLines(taxYearDetailOf(d, year)));
    });
    var personSum = scenarioMiniYearHead("전체기간 합계") +
      scenarioMiniRow("대표자 급여", d.earnedGross != null ? d.earnedGross : solo.earnedGross, "in");
    if (solo.ownerIncentiveAmount) {
      personSum += scenarioMiniRow("대표 인센티브 (급여에 포함)", solo.ownerIncentiveAmount, "in");
    }
    if (solo.ownerDividendAmount) {
      personSum += scenarioMiniRow(ownerPayoutShortLabel(solo), solo.ownerDividendAmount, "in");
      personSum += scenarioMiniRow(ownerPayoutTaxLabel(solo), solo.ownerDividendTax, "out");
    }
    if (solo.ownerProfitShareAmount) {
      personSum += scenarioMiniRow("수익배분", solo.ownerProfitShareAmount, "in");
      personSum += scenarioMiniRow(solo.ownerProfitShareTaxLabel || "사업소득세 (3.3%)", solo.ownerProfitShareTax, "out");
    }
    personSum += scenarioMiniRow("근로소득공제", d.earnedIncomeDeduction, "out") +
      scenarioMiniRow("과세표준", d.taxableBase, "result") +
      scenarioMiniRow("산출세액", d.assessedTax, "out") +
      scenarioMiniRow("세액공제", d.taxCredit, "out") +
      scenarioMiniRow("결정세액", d.determinedTax != null ? d.determinedTax : solo.incomeTax, "result") +
      scenarioMiniRow("지방소득세", solo.localIncomeTax, "out") +
      scenarioMiniRow("급여 원천징수 (기납부)", solo.withholdingTax, "out") +
      scenarioMiniRow("개인 최종 세부담", solo.personalTax, "out");
    html += scenarioDetailFoldBody(ui, "scenario-solo-person", "개인 세금 상세 보기",
      personInner + '<table class="scenario-mini">' + personSum + "</table>",
      "open-scenario-solo-person-help");
    if (ui && ui.scenarioSoloPersonHelpOpen) html += renderScenarioSoloPersonHelpModal();
    html += "</section>";
    return html;
  }

  function renderScenarioSoloPersonHelpModal() {
    var html = '<div class="app-modal-backdrop" role="presentation">';
    html += '<div class="app-modal" role="dialog" aria-modal="true" aria-labelledby="scenario-solo-person-help-title">';
    html += '<div class="app-modal-head"><h3 id="scenario-solo-person-help-title">대표 개인 카드 설명</h3>';
    html += '<button type="button" class="app-modal-x" data-action="close-scenario-solo-person-help" aria-label="닫기">×</button>';
    html += "</div>";
    html += '<div class="app-modal-body">';
    html += '<section class="app-modal-section"><h4>개인 세금 상세 보기</h4>';
    html += '<p class="app-modal-note">한눈에 비교의 종소세 계산기와 같은 연도별 산식입니다. 각 귀속연도를 따로 계산한 뒤 더하며, 합친 과세표준에 세율을 다시 적용하지 않습니다.</p></section>';
    html += "</div>";
    html += '<div class="app-modal-foot"><button type="button" class="btn" data-action="close-scenario-solo-person-help">확인</button></div>';
    html += "</div></div>";
    return html;
  }

  function renderExclusivePersonGroup(ex, years, ui) {
    var html = '<section class="scenario-group scenario-group-ex-person">';
    html += "<h3>배우 개인</h3>";
    html += scenarioYearColsHtml(years, function (year) {
      var v = exclusivePersonYearView(ex, year);
      return scenarioYearCol(year, [
        { label: "귀속소득", amount: v.gross, sign: "in" },
        { label: "종합소득세", amount: v.incomeTax, sign: "out" },
        { label: "지방소득세", amount: v.localIncomeTax, sign: "out" },
        { label: "실수령", amount: v.net, total: true, sign: "result" }
      ]);
    });
    html += scenarioGroupFoot("전체 세후 개인실수령", ex.actorNetIncome, "open-scenario-ex-person-help");
    var exTaxInner = scenarioYearColsHtml(years, function (year) {
      return scenarioYearCol(year + " 귀속", exclusiveTaxYearColLines(ex, year));
    });
    var exSum = scenarioMiniYearHead("전체기간 배분·합계") +
      scenarioMiniRow("총매출", ex.totalRevenue, "in") +
      exclusiveBurdenMiniRow("진행비", ex.projectExpense) +
      exclusiveBurdenMiniRow("밥차비", ex.lunchTruck) +
      scenarioMiniRow("배분 전 공제", ex.deductibleBeforeSplit, "out") +
      scenarioMiniRow("배분 기준금액", ex.splitBase, "result") +
      scenarioMiniRow("회사 수익배분", ex.companyShare, "out") +
      scenarioMiniRow("배우 귀속소득", ex.actorGrossIncome, "in") +
      scenarioMiniRow("배우 부담 인건비", ex.directorCost, "out") +
      scenarioMiniRow("배우 부담 지원비", ex.actorBorneSupportCost, "out") +
      scenarioMiniRow("실과세표준", App.Money.roundWon(
        ex.actorGrossIncome - ex.directorCost - ex.actorBorneSupportCost
      ), "result") +
      scenarioMiniRow("종합소득세", ex.incomeTax, "out") +
      scenarioMiniRow("지방소득세", ex.localIncomeTax, "out") +
      scenarioMiniRow("세후 개인 실수령", ex.actorNetIncome, "result") +
      scenarioMiniRow("기존 회사 전속 경제가치", ex.controlledEconomicValue, "result");
    html += scenarioDetailFoldBody(ui, "scenario-exclusive", "배분 계산 상세 보기",
      exTaxInner + '<table class="scenario-mini">' + exSum + "</table>",
      "open-scenario-ex-person-help");
    if (ui && ui.scenarioExPersonHelpOpen) html += renderScenarioExPersonHelpModal();
    html += "</section>";
    return html;
  }

  function renderScenarioExPersonHelpModal() {
    var html = '<div class="app-modal-backdrop" role="presentation">';
    html += '<div class="app-modal" role="dialog" aria-modal="true" aria-labelledby="scenario-ex-person-help-title">';
    html += '<div class="app-modal-head"><h3 id="scenario-ex-person-help-title">배우 개인 카드 설명</h3>';
    html += '<button type="button" class="app-modal-x" data-action="close-scenario-ex-person-help" aria-label="닫기">×</button>';
    html += "</div>";
    html += '<div class="app-modal-body">';
    html += '<section class="app-modal-section"><h4>전체 세후 개인실수령</h4>';
    html += '<p class="app-modal-note">위 「배우 귀속소득」은 배우 부담 인건비·지원비를 빼기 전 금액입니다. 세금은 그 두 항목을 뺀 금액을 기준으로 계산되며, 아래 상세 보기에서 확인할 수 있습니다.</p></section>';
    html += '<section class="app-modal-section"><h4>배분 계산 상세 보기</h4>';
    html += '<p class="app-modal-note">종소세도 각 귀속연도를 따로 계산한 뒤 더하며, 합친 과세표준에 세율을 다시 적용하지 않습니다.</p></section>';
    html += "</div>";
    html += '<div class="app-modal-foot"><button type="button" class="btn" data-action="close-scenario-ex-person-help">확인</button></div>';
    html += "</div></div>";
    return html;
  }

  function renderExclusiveCompanyGroup(ex) {
    var eco = exclusiveCompareCosts(ex);
    var costOpt = { cost: true };
    var html = '<section class="scenario-group scenario-group-company">';
    html += "<h3>회사 측 경제성</h3>";
    html += '<div class="scenario-year-cols" style="grid-template-columns:minmax(0,1fr)">';
    html += '<div class="scenario-year-col">';
    html += "<h5>전체기간</h5>";
    html += scenarioBlockLine("수익배분 몫", eco.companyShare, { plus: true });
    html += '<div class="scenario-block-head">회사 부담 비용</div>';
    html += scenarioBlockLine("진행비", eco.projectExpense, costOpt);
    html += scenarioBlockLine("밥차비", eco.lunchTruck, costOpt);
    html += scenarioBlockLine("매니저 인건비", eco.companyPayroll, costOpt);
    eco.companyPayRows.forEach(function (r) {
      html += scenarioNestLine(r.name || r.role || "로드매니저", r.exclusiveAmount, costOpt);
    });
    html += scenarioBlockLine("배우 지원비", eco.companySupportValue, costOpt);
    eco.supportAllRows.forEach(function (p) {
      html += scenarioNestLine(p.name || "지원", p.exclusiveCompanyValue, costOpt);
    });
    html += scenarioBlockLine("비용 합계", eco.companyCostTotal, { cost: true, subtotal: true });
    var remainRateText = scenarioEconomicValueRateText(eco.economicRemaining, ex.totalRevenue);
    html += '<div class="scenario-result">';
    html += '<span class="scenario-result-k">회사 최종 잔여</span>';
    html += '<b class="scenario-result-v' + (eco.economicRemaining < 0 ? " is-neg" : "") + '">' +
      App.Format.formatWon(eco.economicRemaining) + "</b>";
    html += '<em class="scenario-result-rate">매출 대비 ' + esc(remainRateText) + "</em>";
    html += "</div>";
    html += "</div></div></section>";
    return html;
  }

  function renderSoloFamily(solo, result, years, ui, revenue) {
    var html = '<section class="scenario-family scenario-family-solo">';
    html += "<h3>1인 기획사</h3>";
    html += '<div class="scenario-family-body">';
    html += renderSoloCorpGroup(solo, result, years, ui);
    html += '<div class="scenario-join" aria-hidden="true"></div>';
    html += renderSoloPersonGroup(solo, years, ui);
    html += "</div>";
    html += renderSoloFamilyTotal(solo, revenue);
    html += "</section>";
    return html;
  }

  function renderExclusiveFamily(ex, years, ui, revenue) {
    var html = '<section class="scenario-family scenario-family-ex">';
    html += "<h3>기존 회사 전속</h3>";
    html += '<div class="scenario-family-body">';
    html += renderExclusivePersonGroup(ex, years, ui);
    html += renderExclusiveCompanyGroup(ex);
    html += "</div>";
    html += renderExclusiveFamilyTotal(ex, revenue);
    html += "</section>";
    return html;
  }

  function scenarioCommonSupportNote(cmp) {
    var amt = App.Money.roundWon(cmp && cmp.commonActorSupportValue);
    if (!amt) {
      var solo = cmp && cmp.scenarios && cmp.scenarios.soloAgency;
      var ex = cmp && cmp.scenarios && cmp.scenarios.exclusiveContract;
      amt = App.Money.roundWon((ex && ex.actorSupportValue) || (solo && solo.actorSupportValue) || 0);
    }
    if (!amt) return "";
    return '<p class="muted small">공통 지원비 ' + App.Format.formatWon(amt) +
      "원은 양 시나리오에서 동일하게 발생하므로 경제가치 비교에서 제외</p>";
  }

  function renderScenarioVerdict(cmp) {
    var solo = cmp.scenarios.soloAgency;
    var ex = cmp.scenarios.exclusiveContract;
    var revenue = App.Money.roundWon(cmp.commonRevenue);
    var delta = App.Money.roundWon(cmp.deltas && cmp.deltas.controlledEconomicValue);
    var rateText = scenarioEconomicValueRateDeltaText(
      solo.controlledEconomicValue, ex.controlledEconomicValue, revenue
    );
    var html = '<p class="muted small">비교 기준 총매출 <b>' + App.Format.formatWon(revenue) +
      "</b>입니다. 배우 입장에서 어느 구조가 경제적으로 유리한지만 비교합니다. 경제가치·매출 대비 비율은 위 두 카드에서 확인합니다.</p>";
    html += '<div class="scenario-verdict scenario-verdict-delta-only">';
    html += '<div class="scenario-verdict-spacer" aria-hidden="true"></div>';
    html += '<div class="scenario-verdict-spacer" aria-hidden="true"></div>';
    html += '<div class="scenario-verdict-item scenario-verdict-delta scenario-verdict-end"><span>차이</span><b' +
      analysisNegClassAttr(delta, "delta") + ">" +
      analysisDisplayAmount(delta, "delta") + '</b><em>' + esc(rateText) + "</em></div>";
    html += "</div>";
    html += scenarioCommonSupportNote(cmp);
    return html;
  }

  function renderScenarioComparisonView(state, result, ui) {
    App.Defaults.ensureScenarioSettings(state);
    var ids = state.settings.scenarioComparison.enabledScenarioIds || [];
    var html = '<div class="card scenario-story-card"><h2>시나리오 비교</h2>';
    if (!ids.length) {
      html += '<p class="muted">비교할 시나리오를 시뮬레이션 설정에서 켜세요.</p></div>';
      return html;
    }
    var cmp = App.Engine.runScenarioComparison(state, result);
    var showSolo = ids.indexOf("soloAgency") >= 0;
    var showEx = ids.indexOf("exclusiveContract") >= 0;
    var solo = cmp.scenarios.soloAgency;
    var ex = cmp.scenarios.exclusiveContract;
    html += '<p class="muted small">1인 기획사는 법인 가치와 대표 개인 가치를 합한 결과이고, 기존 회사 전속과 같은 매출 기준으로 비교합니다. 연도별 세후 결과는 합산이며, 세금 산식은 각 칸의 상세 보기에서 확인합니다.</p>';
    if (ids.length === 1) {
      html += '<p class="muted small">현재 <b>' + esc(scenarioLabel(state, ids[0])) +
        "</b>만 켜져 있습니다.</p>";
    }
    (cmp.warnings || []).forEach(function (w) {
      html += '<p class="muted small" style="color:var(--warn)">' + esc(w.message) + "</p>";
    });

    var years = scenarioYearsFromResult(result, solo, ex);
    if (!years.length) years = [2026];
    var boardClass = "scenario-compare-board";
    if (showSolo && showEx) boardClass += " both";
    else if (showSolo) boardClass += " solo-only";
    else boardClass += " ex-only";
    var boardRevenue = App.Money.roundWon(cmp.commonRevenue);
    html += '<div class="' + boardClass + '">';
    if (showSolo) html += renderSoloFamily(solo, result, years, ui, boardRevenue);
    if (showSolo && showEx) html += '<div class="scenario-compare-vs" aria-hidden="true">VS</div>';
    if (showEx) html += renderExclusiveFamily(ex, years, ui, boardRevenue);
    html += "</div>";

    if (showSolo && showEx) html += renderScenarioVerdict(cmp);

    html += '<p class="muted small">세후 개인 실수령은 종합소득세 납부 후 개인에게 실제 남는 돈입니다. 매출이 줄면 언제부터 1인 기획사가 불리해지는지는 <button type="button" class="btn-link" data-action="analysis-tab" data-tab="revenue-floor">참고(매출하한)</button>에서, 배우가 보는 다른 요약은 <button type="button" class="btn-link" data-action="analysis-tab" data-tab="income-tax">한눈에 비교</button>에서 확인합니다.</p>';
    html += "</div>";
    return html;
  }

  function taxResultLine(label, value, opts) {
    opts = opts || {};
    var cls = "tax-line";
    if (opts.key) cls += " key";
    if (opts.mute) cls += " mute";
    if (opts.total) cls += " total";
    if (opts.hl) cls += " hl";
    cls += analysisValueClass(value);
    return '<div class="' + cls + '">' +
      "<span>" + esc(label) + "</span><b>" + esc(value) + "</b></div>";
  }

  function taxResultStackLine(label, value, opts) {
    opts = opts || {};
    var role = analysisSignRole(opts);
    var cls = "tax-line";
    if (opts.key) cls += " key";
    if (opts.mute) cls += " mute";
    if (opts.total) cls += " total";
    if (opts.hl) cls += " hl";
    cls += analysisAmountClass(value, role);
    return '<div class="' + cls + '"><span>' + esc(label) + "</span>" +
      taxMoneyStack(value, { sign: role }) + "</div>";
  }

  function taxIncomeTypeOptions() {
    return [
      { id: "earned", label: "근로·기타 개인소득" },
      { id: "business", label: "사업소득" },
      { id: "mixed", label: "혼합" },
      { id: "other", label: "기타" }
    ];
  }

  function taxPairRow(leftHtml, rightHtml, cls) {
    return "<tr" + (cls ? ' class="' + cls + '"' : "") + "><td>" + leftHtml + "</td><td>" + rightHtml + "</td></tr>";
  }

  function taxFieldCell(label, controlHtml) {
    return '<div class="tax-cell-field"><label>' + esc(label) + "</label>" + controlHtml + "</div>";
  }

  function taxOutCell(label, value) {
    return '<div class="tax-out' + analysisValueClass(value) + '"><span>' + esc(label) + "</span><b>" + esc(value) + "</b></div>";
  }

  function taxAutoOutCell(label, value) {
    return '<div class="tax-out' + analysisValueClass(value) + '"><span>' + esc(label) + "</span><b>" + esc(value) +
      '</b><span class="tax-auto-tag">자동 계산</span></div>';
  }

  function taxIncomeCell(prefix, tax, linked, label) {
    var title = label || "개인 귀속소득";
    var html = '<label class="check"><input type="checkbox" data-path="' + prefix +
      '.useLinkedIncome" data-kind="bool"' + (tax.useLinkedIncome !== false ? " checked" : "") +
      ">자동 연결</label>";
    if (tax.useLinkedIncome === false) {
      html += taxFieldCell(title, moneyInput(prefix + ".attributedIncome", tax.attributedIncome));
    } else {
      html += '<div class="tax-auto-value"><span class="tax-auto-k">' + esc(title) + "</span>" +
        "<b>" + App.Format.formatWon(linked) + '</b><span class="tax-auto-tag">시나리오 연동</span></div>';
    }
    return html;
  }

  function taxPanelFromScenario(state, cmp, id) {
    var prefix = "settings.scenarios." + id + ".personalTax";
    var tax = App.Defaults.personalTaxForScenario(state, id);
    var row = (cmp.scenarios && cmp.scenarios[id]) || {};
    var detail = row.personalTaxDetail || {};
    var linked = row.actorGrossIncome || 0;
    var brackets = detail;
    if (tax.mode !== "auto") {
      brackets = App.Engine.calculatePersonalTaxDetail(linked, tax);
    }
    return {
      id: id,
      prefix: prefix,
      tax: tax,
      row: row,
      detail: detail,
      linked: linked,
      taxableBase: brackets.taxableBase,
      bracketRate: brackets.bracketRate,
      progressiveDeduction: brackets.progressiveDeduction
    };
  }

  function signedWon(value) {
    return analysisDisplayAmount(value, "delta");
  }

  function signedWonAbout(value) {
    var shown = analysisShownNumber(value, "delta");
    var about = App.Format.formatWonAbout(shown);
    if (shown > 0) return about.replace(/^약 /, "약 +");
    return about;
  }

  function taxMoneyStack(value, opts) {
    opts = opts || {};
    var role = analysisSignRole(opts);
    var shown = analysisShownNumber(value, role);
    var won = analysisDisplayAmount(value, role);
    var about = App.Format.formatWonAbout(shown);
    if ((role === "in" || role === "delta") && shown > 0) {
      about = about.replace(/^약 /, "약 +");
    }
    var html = '<span class="tax-money' + (shown < 0 ? " is-neg" : "") + '"><b class="tax-money-won">' + esc(won) + "</b>";
    if (about && about !== won) html += '<span class="tax-money-eok">' + esc(about) + "</span>";
    return html + "</span>";
  }

  function taxFoldOpen(ui, id) {
    return !!(ui && ui.taxFoldOpen && ui.taxFoldOpen[id]);
  }

  function taxHeroMetric(label, value, opts) {
    opts = opts || {};
    if (opts.empty) {
      return '<div class="tax-hero-metric"><span class="tax-hero-k">' + esc(label) +
        '</span><span class="tax-hero-empty">—</span></div>';
    }
    var role = analysisSignRole(opts);
    return '<div class="tax-hero-metric' + (opts.total ? " total" : "") +
      analysisAmountClass(value, role) + '"><span class="tax-hero-k">' +
      esc(label) + "</span>" + taxMoneyStack(value, { sign: role }) + "</div>";
  }

  function taxFlowStep(label, value, opts) {
    opts = opts || {};
    var role = analysisSignRole(opts);
    var html = '<div class="tax-flow-step' + (opts.total ? " total" : "") +
      analysisAmountClass(value, role) + '">';
    html += '<span class="tax-flow-k">' + esc(label) + "</span>";
    html += '<span class="tax-flow-v">' + taxMoneyStack(value, { sign: role }) + "</span>";
    html += "</div>";
    return html;
  }

  function taxKeepCopy(exNet, soloNet, keepDelta) {
    if (keepDelta > 0 && soloNet < exNet) {
      return "1인 기획사는 당장 개인 통장에 들어오는 돈은 적지만, 법인에 자산을 남길 수 있어 현재 기준 약 " +
        App.Format.formatWonAbout(keepDelta).replace(/^약 /, "") + "의 경제적 가치가 더 큽니다.";
    }
    if (keepDelta > 0) {
      return "1인 기획사는 현재 기준 총 경제가치가 약 " +
        App.Format.formatWonAbout(keepDelta).replace(/^약 /, "") + " 더 큽니다.";
    }
    if (keepDelta < 0) {
      return "현재 기준 기존 회사 전속의 경제가치가 약 " +
        App.Format.formatWonAbout(-keepDelta).replace(/^약 /, "") + " 더 큽니다.";
    }
    return "현재 기준 두 선택지의 총 경제가치는 같습니다.";
  }

  function taxYearDetailOf(detail, year) {
    var list = (detail && detail.years) || [];
    var found = list.filter(function (d) { return Number(d.year) === Number(year); })[0];
    if (found) return found;
    if (detail && !list.length && Number(detail.year) === Number(year)) return detail;
    return null;
  }

  function taxYearList(ex, solo, left, right, result) {
    var seen = {};
    function add(year) {
      var y = Number(year);
      if (y) seen[y] = true;
    }
    (ex.taxYears || []).forEach(function (s) { add(s.year); });
    ((left.detail && left.detail.years) || []).forEach(function (d) { add(d.year); });
    ((right.detail && right.detail.years) || []).forEach(function (d) { add(d.year); });
    Object.keys(solo.corporateTaxByYear || {}).forEach(add);
    Object.keys((result && result.kpis && result.kpis.taxDetail && result.kpis.taxDetail.byYear) || {}).forEach(add);
    var years = Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
    return years.length ? years : [2026];
  }

  function personalTaxYearFacts(detail) {
    if (!detail) return null;
    var assessed = detail.assessedTax != null ? detail.assessedTax : detail.incomeTax;
    var determined = detail.determinedTax != null ? detail.determinedTax : detail.incomeTax;
    var total = detail.totalPersonalTax != null ? detail.totalPersonalTax
      : App.Money.roundWon(determined + App.Money.roundWon(detail.localIncomeTax));
    var taxableIncome = detail.yearTaxableIncome != null ? detail.yearTaxableIncome
      : (detail.comprehensiveIncome != null ? detail.comprehensiveIncome : detail.attributedIncome);
    return {
      earnedGross: App.Money.roundWon(detail.earnedGross),
      earnedIncomeDeduction: App.Money.roundWon(detail.earnedIncomeDeduction),
      otherIncome: App.Money.roundWon(detail.otherIncome),
      dividendTax: App.Money.roundWon(detail.dividendTax),
      payoutIncomeLabel: detail.payoutIncomeLabel || "대표 배당",
      payoutTaxLabel: detail.payoutTaxLabel || "배당소득세 (15.4%)",
      taxableIncome: App.Money.roundWon(taxableIncome),
      taxableBase: App.Money.roundWon(detail.taxableBase),
      assessed: App.Money.roundWon(assessed),
      taxCredit: App.Money.roundWon(detail.taxCredit),
      determined: App.Money.roundWon(determined),
      local: App.Money.roundWon(detail.localIncomeTax),
      total: App.Money.roundWon(total),
      afterTax: App.Money.roundWon(detail.afterTaxIncome)
    };
  }

  function taxYearPersonalLines(detail) {
    var f = personalTaxYearFacts(detail);
    if (!f) {
      return taxResultLine("과세 대상 소득", "—") +
        taxResultLine("과세표준", "—") +
        taxResultLine("산출세액", "—") +
        taxResultLine("세액공제", "—") +
        taxResultLine("결정세액", "—") +
        taxResultLine("지방소득세", "—") +
        taxResultLine("연도 총세액", "—", { hl: true });
    }
    var html = "";
    if (f.earnedGross) {
      html += taxResultLine("대표자 총급여", analysisDisplayAmount(f.earnedGross, "result"), { key: true });
      html += taxResultLine("근로소득공제", analysisDisplayAmount(f.earnedIncomeDeduction, "out"));
    } else {
      html += taxResultLine("과세 대상 소득", analysisDisplayAmount(f.taxableIncome, "result"), { key: true });
    }
    if (f.otherIncome) {
      html += taxResultLine(f.payoutIncomeLabel || "대표 배당", analysisDisplayAmount(f.otherIncome, "in"));
    }
    html += taxResultLine("과세표준", analysisDisplayAmount(f.taxableBase, "result"));
    html += taxResultLine("산출세액", analysisDisplayAmount(f.assessed, "out"));
    html += taxResultLine("세액공제", analysisDisplayAmount(f.taxCredit, "out"));
    html += taxResultLine("결정세액", analysisDisplayAmount(f.determined, "result"));
    html += taxResultLine("지방소득세", analysisDisplayAmount(f.local, "out"));
    if (f.dividendTax) {
      html += taxResultLine(f.payoutTaxLabel || "배당소득세 (15.4%)", analysisDisplayAmount(f.dividendTax, "out"));
    }
    html += taxResultLine("연도 총세액", analysisDisplayAmount(f.total, "out"), { hl: true });
    if (f.afterTax) html += taxResultLine("세후 개인 실수령", analysisDisplayAmount(f.afterTax, "result"));
    return html;
  }

  function scenarioMiniYearHead(label) {
    return '<tr class="scenario-mini-year"><th colspan="2">' + esc(label) + "</th></tr>";
  }

  function renderPersonalTaxCalculator(state, result, ui, opts) {
    App.Defaults.ensureScenarioSettings(state);
    App.Defaults.ensureTaxSettings(state);
    opts = opts || {};
    var selectedM = opts.selectedM != null ? opts.selectedM : selectedMultiplierStep(ui);
    var cmp = opts.cmp || App.Engine.runScenarioComparison(state, result);
    var common = state.settings.personalTaxCommon || App.Defaults.defaultPersonalTaxCommon();
    var mode = common.mode === "rate" || common.mode === "auto" || common.mode === "manual" ? common.mode : "auto";
    var year = common.year || 2026;
    var table = App.PersonalTax.resolveTable(year);
    var left = taxPanelFromScenario(state, cmp, "exclusiveContract");
    var right = taxPanelFromScenario(state, cmp, "soloAgency");
    var source = (left.detail && left.detail.source) || (right.detail && right.detail.source) || App.PersonalTax.SOURCE;
    var ex = left.row || {};
    var solo = right.row || {};
    var revenue = App.Money.roundWon(cmp.commonRevenue);
    var keepDelta = App.Money.roundWon(cmp.deltas && cmp.deltas.controlledEconomicValue);
    var liqDelta = App.Money.roundWon(cmp.deltas && cmp.deltas.controlledEconomicValueAfterLiquidation);

    function inputRow(label, field, kind) {
      var leftCtrl = kind === "percent"
        ? percentInput(left.prefix + "." + field, pctView(left.tax[field]), 'data-kind="percent"')
        : moneyInput(left.prefix + "." + field, left.tax[field]);
      var rightCtrl = kind === "percent"
        ? percentInput(right.prefix + "." + field, pctView(right.tax[field]), 'data-kind="percent"')
        : moneyInput(right.prefix + "." + field, right.tax[field]);
      return taxPairRow(
        taxFieldCell(label, leftCtrl) + '<span class="tax-auto-tag">수동 입력</span>',
        taxFieldCell(label, rightCtrl) + '<span class="tax-auto-tag">수동 입력</span>',
        "tax-row-input"
      );
    }

    function outRow(label, leftVal, rightVal, cls) {
      return taxPairRow(taxOutCell(label, leftVal), taxOutCell(label, rightVal), cls);
    }

    function autoRow(label, leftVal, rightVal, cls) {
      return taxPairRow(taxAutoOutCell(label, leftVal), taxAutoOutCell(label, rightVal), cls || "tax-row-mute");
    }

    var ld = left.detail || {};
    var rd = right.detail || {};
    var html = '<div class="card tax-calc-card" data-multiplier="' + selectedM + '">';
    html += "<h2>같은 매출이라면, 실제로 얼마나 차이 날까?</h2>";
    html += '<p class="muted small">같은 매출 <b>' + App.Format.formatWon(revenue) + "</b> (" +
      esc(App.Format.formatWonAbout(revenue)) + ") 기준입니다.";
    if (selectedM !== 1 && opts.cmp) {
      html += " 현재 등록 매출의 " + selectedM +
        "배로, 작품·영업 건을 추가한 참고값입니다. 수익 탭 계획은 바뀌지 않습니다.";
    } else {
      html += " 세금 계산식은 바꾸지 않고, 배우가 바로 볼 결론만 위에 둡니다.";
    }
    html += "</p>";

    html += '<div class="tax-hero-grid">';
    html += '<article class="tax-hero-card tax-hero-solo">';
    html += "<h3>1인 기획사</h3>";
    html += taxHeroMetric("내가 바로 받는 돈", solo.actorNetIncome);
    html += taxHeroMetric("전체 기간 누적 세후순이익", soloProfitForEconomicValue(solo));
    if (App.Money.roundWon(solo.ownerCorporateCardValue)) {
      html += taxHeroMetric("대표 신용카드 사용분", solo.ownerCorporateCardValue, { sign: "in" });
    }
    html += taxHeroMetric("지금 기준 총 경제가치", solo.controlledEconomicValue, { total: true });
    html += "</article>";
    html += '<article class="tax-hero-card">';
    html += "<h3>기존 회사 전속</h3>";
    html += taxHeroMetric("내가 바로 받는 돈", ex.actorNetIncome);
    html += taxHeroMetric("지금 기준 총 경제가치", ex.controlledEconomicValue, { total: true });
    html += "</article></div>";

    html += '<div class="tax-callout tax-decision">';
    html += '<p class="tax-callout-kicker">1인 기획사 선택 효과</p>';
    html += '<p class="tax-callout-value">' + esc(signedWon(keepDelta)) +
      ' <span class="tax-money-eok">' + esc(signedWonAbout(keepDelta)) + "</span></p>";
    html += "<p>" + esc(taxKeepCopy(ex.actorNetIncome, solo.actorNetIncome, keepDelta)) + "</p>";
    html += "</div>";

    html += '<div class="tax-flow-grid">';
    html += '<section class="tax-flow-col"><h3>1인 기획사 · 돈의 흐름</h3>';
    html += taxFlowStep("총 매출", revenue, { sign: "in" });
    html += '<div class="tax-flow-arrow">↓ 법인 운영 · 대표 급여</div>';
    html += taxFlowStep("대표 급여", solo.earnedGross || solo.actorGrossIncome, { sign: "in" });
    if (App.Money.roundWon(solo.ownerDividendAmount)) {
      html += '<div class="tax-flow-arrow">↓ ' + esc(ownerPayoutShortLabel(solo)) + "</div>";
      html += taxFlowStep(ownerPayoutShortLabel(solo), solo.ownerDividendAmount, { sign: "in" });
    }
    html += '<div class="tax-flow-arrow">↓ 개인 세금</div>';
    html += taxFlowStep("개인 세금", solo.personalTax, { sign: "out" });
    html += '<div class="tax-flow-arrow">↓</div>';
    html += taxFlowStep("내 개인 통장에 남는 돈", solo.actorNetIncome);
    html += '<div class="tax-flow-arrow">그리고 법인</div>';
    html += taxFlowStep("법인세", solo.corporateTax, { sign: "out" });
    html += taxFlowStep("전체 기간 누적 세후순이익", soloProfitForEconomicValue(solo));
    if (App.Money.roundWon(solo.ownerCorporateCardValue)) {
      html += taxFlowStep("대표 신용카드 사용분", solo.ownerCorporateCardValue, { sign: "in" });
    }
    html += '<div class="tax-flow-arrow">=</div>';
    html += taxFlowStep("내가 보유하게 되는 전체 가치", solo.controlledEconomicValue, { total: true });
    html += "</section>";
    html += '<section class="tax-flow-col"><h3>기존 회사 · 돈의 흐름</h3>';
    html += taxFlowStep("총 매출", revenue, { sign: "in" });
    html += '<div class="tax-flow-arrow">↓ 회사 정산</div>';
    html += taxFlowStep("배우 귀속소득", ex.actorGrossIncome, { sign: "in" });
    html += '<div class="tax-flow-arrow">↓ 배우 부담 인건비</div>';
    html += taxFlowStep("배우 부담 인건비", ex.directorCost, { sign: "out" });
    if (App.Money.roundWon(ex.actorBorneSupportCost)) {
      html += '<div class="tax-flow-arrow">↓ 배우 부담 지원비</div>';
      html += taxFlowStep("배우 부담 지원비", ex.actorBorneSupportCost, { sign: "out" });
    }
    html += '<div class="tax-flow-arrow">↓ 개인 세금</div>';
    html += taxFlowStep("개인 세금", ex.personalTax, { sign: "out" });
    html += '<div class="tax-flow-arrow">↓</div>';
    html += taxFlowStep("내 개인 통장에 남는 돈", ex.actorNetIncome);
    html += '<div class="tax-flow-arrow">=</div>';
    html += taxFlowStep("내가 보유하게 되는 전체 가치", ex.controlledEconomicValue, { total: true });
    html += "</section></div>";

    html += '<div class="tax-liq-card">';
    html += "<h3>법인을 지금 청산한다면?</h3>";
    html += '<p class="muted small">법인을 지금 정리할 경우 예상 세금입니다. 잔여현금을 청산세율만큼 내고 전액 인출한다는 단순 가정이며, 실제로는 급여·배당으로 나눠 빼 세율을 낮출 수 있습니다.</p>';
    html += '<div class="tax-liq-grid">';
    html += '<section class="tax-verdict-block"><h3>법인 유지</h3>';
    html += taxResultStackLine("내 개인 통장에 남는 돈", solo.actorNetIncome, { key: true });
    html += taxResultStackLine("전체 기간 누적 세후순이익", soloProfitForEconomicValue(solo), { key: true });
    html += taxResultStackLine("총 경제가치", solo.controlledEconomicValue, { hl: true });
    html += "</section>";
    html += '<section class="tax-verdict-block tax-decision"><h3>지금 청산한다고 가정</h3>';
    html += taxResultStackLine("청산 전 법인 잔여", solo.corporateEndingCash);
    if (solo.pendingTaxLiability) {
      html += taxResultStackLine("미납 부가세·법인세·지방소득세", solo.pendingTaxLiability, { sign: "out" });
      html += taxResultStackLine("미납세금 차감 후 잔여", solo.corpCashAfterPendingTax);
    }
    html += taxResultStackLine("법인을 지금 정리할 경우 예상 세금 (" + pctView(solo.liquidationTaxRate) + "%)",
      solo.corporateLiquidationTax, { sign: "out" });
    html += taxResultStackLine("청산 후 법인 잔여", solo.corporateCashAfterLiquidation, { key: true });
    html += taxResultStackLine("내 개인 통장에 남는 돈", solo.actorNetIncome);
    html += taxResultStackLine("청산 후 경제가치", solo.controlledEconomicValueAfterLiquidation, { hl: true });
    html += "</section></div>";
    html += '<div class="tax-liq-compare">';
    html += taxResultStackLine("기존 회사 전속", ex.controlledEconomicValue, { key: true });
    html += taxResultStackLine("1인 기획사 즉시 청산 가정", solo.controlledEconomicValueAfterLiquidation, { key: true });
    html += taxResultStackLine("차이", liqDelta, { hl: true, sign: "delta" });
    html += "</div>";
    html += "<p><b>법인을 유지하면 " + esc(signedWonAbout(keepDelta)) +
      ", 지금 청산한다고 가정해도 " + esc(signedWonAbout(liqDelta)) + "</b></p>";
    html += "</div>";

    html += '<details class="tax-fold" data-tax-fold="settings"' + (taxFoldOpen(ui, "settings") ? " open" : "") + ">";
    html += "<summary>계산 조건 및 세부 설정</summary>";
    html += '<div class="tax-fold-body">';
    html += '<p class="muted small">자동 계산은 시뮬레이션이 걸친 모든 과세연도를 각각 계산합니다. 참고연도는 세율표 조회용이며, 15개월을 한 과세기간으로 합치지 않습니다.</p>';
    html += '<div class="tax-common">';
    html += "<h3>공통 세금 설정</h3>";
    html += '<div class="tax-basis">';
    html += '<div class="field tax-field-year"><label>' +
      (mode === "auto" ? "세율표 참고연도" : "귀속연도") + "</label>" +
      selectInput("settings.personalTaxCommon.year", String(year), taxYearOptions()) + "</div>";
    html += '<div class="field tax-field-mode"><label>계산방식</label>' +
      selectInput("settings.personalTaxCommon.mode", mode, [
        { id: "auto", label: "자동 계산" },
        { id: "manual", label: "수동 세액" },
        { id: "rate", label: "유효세율" }
      ]) + "</div>";
    html += '<div class="field tax-field-table"><label>기본 세율표</label>' +
      '<div class="tax-table-label">' + esc(String(table.year)) + " 기준</div></div>";
    html += "</div>";
    html += '<h3>법인세 이월결손금 / 세무조정</h3>';
    html += '<p class="muted small">1인 기획사(중소기업) 가정으로 다음 해 과세표준에서 100%까지 공제합니다. 소급공제는 없습니다.</p>';
    var nol = (state.settings.tax && state.settings.tax.lossCarryforward) || {};
    html += '<label class="check"><input type="checkbox" data-path="settings.tax.lossCarryforward.apply" data-kind="bool"' +
      (nol.apply !== false ? " checked" : "") + ">이월결손금 적용</label>";
    html += '<div class="row-fields">';
    html += '<div class="field"><label>시작 전 이월결손금</label>' +
      moneyInput("settings.tax.lossCarryforward.openingBalance", nol.openingBalance) + "</div>";
    html += '<div class="field"><label>공제한도</label>' +
      percentInput("settings.tax.lossCarryforward.limitRate", pctView(nol.limitRate == null ? 1 : nol.limitRate), 'data-kind="percent"') + "</div>";
    html += '<div class="field"><label>세금 현금 납부</label>' +
      selectInput("settings.tax.cashOutMode", state.settings.tax.cashOutMode === "nextMarch" ? "nextMarch" : "none", [
        { id: "none", label: "통장에서는 미차감 (기본)" },
        { id: "nextMarch", label: "각 연도 세액을 다음 해 3월 통장에서 차감" }
      ]) + "</div>";
    html += "</div>";
    html += '<p class="muted small">계산된 법인세·주민세는 월별 분석의 「법인세 및 주민세 납부」와 월말 자금에 자동 반영됩니다. 기본은 통장 잔액을 건드리지 않고 월말 자금에서만 미납분을 뺍니다. 「다음 해 3월」을 고르면 그때 통장에서도 차감합니다.</p>';
    var adjs = (state.settings.tax && state.settings.tax.adjustments) || [];
    html += '<div class="section-title"><h3>세무조정</h3>';
    html += '<button type="button" class="btn" data-action="add-tax-adjustment">+ 조정</button></div>';
    html += '<p class="muted small">양수는 과세소득 증가, 음수는 감소입니다. 접대비 한도 등은 직접 넣습니다.</p>';
    adjs.forEach(function (adj, i) {
      html += '<div class="inline">';
      html += '<input type="number" data-path="settings.tax.adjustments.' + i + '.year" data-kind="number" value="' + esc(adj.year || "") + '" min="2000" max="2100">';
      html += moneyInput("settings.tax.adjustments." + i + ".amount", adj.amount);
      html += textInput("settings.tax.adjustments." + i + ".label", adj.label || "");
      html += '<button type="button" class="btn danger" data-action="remove-tax-adjustment" data-index="' + i + '">삭제</button>';
      html += "</div>";
    });
    html += "</div>";
    html += '<div class="tax-compare">';
    html += '<table class="tax-pair"><thead><tr><th>기존 회사 전속</th><th>1인 기획사</th></tr></thead><tbody>';
    html += taxPairRow(
      taxIncomeCell(left.prefix, left.tax, ld.businessIncome || left.linked, "개인 사업소득"),
      taxIncomeCell(right.prefix, right.tax, rd.earnedGross || right.linked, "대표자 총급여"),
      "tax-row-income tax-row-key"
    );
    html += inputRow("기타 종합소득", "additionalIncome");
    html += inputRow("필요경비", "necessaryExpenses");
    html += inputRow("추가 소득공제", "incomeDeduction");
    html += inputRow("기타 과세조정", "otherAdjustment");
    html += inputRow("기타 기납부세액", "prepaidTax");
    if (mode === "manual") html += inputRow("수동 세액", "manualTaxAmount");
    if (mode === "rate") html += inputRow("유효세율", "effectiveRate", "percent");
    html += "</tbody></table></div>";
    if (mode !== "auto") {
      html += '<p class="muted small">비교표의 개인세금은 현재 <b>' +
        (mode === "manual" ? "수동 세액" : "유효세율") + "</b>을 우선 사용합니다. 과세표준·최고세율은 누진세율 참고값입니다.</p>";
    }
    html += "</div></details>";

    html += '<details class="tax-fold" data-tax-fold="detail"' + (taxFoldOpen(ui, "detail") ? " open" : "") + ">";
    html += "<summary>세금 계산 상세 보기</summary>";
    html += '<div class="tax-fold-body">';
    html += "<h3>귀속연도별 세금</h3>";
    html += '<p class="muted small">각 과세연도를 계산한 뒤, 켜져 있으면 이월결손금만 다음 해 과세표준에서 뺍니다. 다음 해 적자가 이전 해 세액을 깎지는 않습니다.</p>';
    var taxYears = taxYearList(ex, solo, left, right, result);
    var corpByYear = (result && result.kpis && result.kpis.taxDetail && result.kpis.taxDetail.byYear) || {};
    taxYears.forEach(function (taxYear) {
      var exYear = taxYearDetailOf(ld, taxYear);
      var soloYear = taxYearDetailOf(rd, taxYear);
      var corpYear = corpByYear[taxYear] || corpByYear[String(taxYear)] || {};
      html += '<details class="tax-year-fold"' + (taxFoldOpen(ui, "year-" + taxYear) ? " open" : "") +
        ' data-tax-fold="year-' + taxYear + '">';
      html += "<summary>" + taxYear + " 귀속</summary>";
      html += '<div class="tax-liq-grid">';
      html += '<section class="tax-verdict-block"><h3>기존 회사 전속 · 종합소득세</h3>';
      html += taxYearPersonalLines(exYear);
      html += "</section>";
      html += '<section class="tax-verdict-block"><h3>1인 기획사 · 근로소득세</h3>';
      html += taxYearPersonalLines(soloYear);
      html += "<h3>법인세</h3>";
      html += taxResultLine("장부 세전이익", analysisDisplayAmount(corpYear.preTaxProfit || 0, "result"));
      if (corpYear.taxAdjustment) {
        html += taxResultLine("세무조정", analysisDisplayAmount(corpYear.taxAdjustment, "delta"));
      }
      html += taxResultLine("과세 대상 소득", analysisDisplayAmount(corpYear.taxableIncome || 0, "result"), { key: true });
      if (corpYear.nolUsed) html += taxResultLine("이월결손금 사용", analysisDisplayAmount(corpYear.nolUsed, "out"));
      if (corpYear.nolIncurred) html += taxResultLine("당해 결손금", analysisDisplayAmount(corpYear.nolIncurred, "result"));
      if (corpYear.nolClosing) html += taxResultLine("기말 이월 잔액", analysisDisplayAmount(corpYear.nolClosing, "result"));
      html += taxResultLine("법인세", analysisDisplayAmount(corpYear.corporateTax || 0, "out"));
      html += taxResultLine("지방소득세", analysisDisplayAmount(corpYear.localIncomeTax || 0, "out"));
      html += taxResultLine("연도 총세액", analysisDisplayAmount(corpYear.totalTax || 0, "out"));
      html += taxResultLine("세후순이익", analysisDisplayAmount(
        corpYear.afterTaxNet != null
          ? corpYear.afterTaxNet
          : App.Money.roundWon((corpYear.preTaxProfit || 0) - (corpYear.corporateTax || 0) - (corpYear.localIncomeTax || 0)),
        "result"
      ), { hl: true });
      html += "</section></div></details>";
    });
    html += '<div class="tax-year-total">';
    html += "<h3>전체기간 세금 합계</h3>";
    html += '<p class="muted small">' + taxYears.join(" + ") + " 귀속 세액의 합입니다. 합친 과세표준에 세율을 다시 적용하지 않습니다.</p>";
    html += '<div class="tax-liq-grid">';
    html += '<section class="tax-verdict-block"><h3>기존 회사 전속</h3>';
    html += taxResultLine("개인 세금 총액", analysisDisplayAmount(ex.personalTax, "out"), { hl: true });
    html += "</section>";
    html += '<section class="tax-verdict-block"><h3>1인 기획사</h3>';
    html += taxResultLine("개인 세금 총액", analysisDisplayAmount(solo.personalTax, "out"), { key: true });
    html += taxResultLine("법인 세금 총액", analysisDisplayAmount(solo.corporateTax, "out"), { key: true });
    html += taxResultLine("세금 합계", analysisDisplayAmount(solo.totalTaxBurden, "out"), { hl: true });
    html += "</section></div></div>";

    html += "<h3>종합소득세 계산</h3>";
    html += '<p class="muted small">시나리오 비교 대표 개인 상세와 같은 연도별 산식입니다. 아래는 ' +
      taxYears.join(" + ") + " 귀속 결과를 더한 표시이며, 합친 과세표준에 세율을 다시 적용하지 않습니다.</p>";
    html += '<div class="tax-compare">';
    html += '<table class="tax-pair"><thead><tr><th>기존 회사 전속</th><th>1인 기획사</th></tr></thead><tbody>';
    html += autoRow("근로소득공제",
      ld.earnedGross ? analysisDisplayAmount(ld.earnedIncomeDeduction, "out") : "—",
      rd.earnedGross ? analysisDisplayAmount(rd.earnedIncomeDeduction, "out") : "—");
    html += autoRow("근로소득금액",
      ld.earnedGross ? analysisDisplayAmount(ld.earnedIncomeAmount, "result") : "—",
      rd.earnedGross ? analysisDisplayAmount(rd.earnedIncomeAmount, "result") : "—");
    html += autoRow("기본/자동 소득공제", analysisDisplayAmount(0, "out"), analysisDisplayAmount(0, "out"));
    html += autoRow("종합소득금액", analysisDisplayAmount(ld.comprehensiveIncome, "result"), analysisDisplayAmount(rd.comprehensiveIncome, "result"));
    html += outRow("과세표준", analysisDisplayAmount(left.taxableBase, "result"), analysisDisplayAmount(right.taxableBase, "result"));
    html += autoRow("적용 최고세율", "연도별로 다름", "연도별로 다름");
    html += autoRow("누진공제", "연도별로 다름", "연도별로 다름");
    html += autoRow("산출세액", analysisDisplayAmount(ld.assessedTax != null ? ld.assessedTax : ld.incomeTax, "out"), analysisDisplayAmount(rd.assessedTax != null ? rd.assessedTax : rd.incomeTax, "out"));
    html += autoRow("자동 세액공제", analysisDisplayAmount(ld.autoTaxCredit, "out"), analysisDisplayAmount(rd.autoTaxCredit, "out"));
    html += outRow("결정세액", analysisDisplayAmount(left.row.determinedTax != null ? left.row.determinedTax : left.row.incomeTax, "result"), analysisDisplayAmount(right.row.determinedTax != null ? right.row.determinedTax : right.row.incomeTax, "result"));
    html += outRow("추가 납부 종합소득세", analysisDisplayAmount(ld.additionalIncomeTax, "out"), analysisDisplayAmount(rd.additionalIncomeTax, "out"));
    html += outRow("지방소득세", analysisDisplayAmount(left.row.localIncomeTax, "out"), analysisDisplayAmount(right.row.localIncomeTax, "out"));
    html += outRow("개인 최종 세부담", analysisDisplayAmount(left.row.personalTax, "out"), analysisDisplayAmount(right.row.personalTax, "out"), "tax-row-key");
    html += outRow("세후 개인 실수령", analysisDisplayAmount(left.row.actorNetIncome, "result"), analysisDisplayAmount(right.row.actorNetIncome, "result"), "tax-row-hl");
    html += autoRow("법인세", "—", analysisDisplayAmount(right.row.corporateTax, "out"));
    html += autoRow("법인 잔여현금", "—", analysisDisplayAmount(right.row.corporateEndingCash, "result"));
    html += "</tbody></table></div></div></details>";

    html += '<p class="muted small tax-disclaimer">시뮬레이션용 예상세액이며 실제 신고세액과 다를 수 있습니다. ' +
      esc(source) + "</p>";
    html += "</div>";
    return html;
  }

  function renderLedgerHelpModal() {
    var html = '<div class="app-modal-backdrop" role="presentation">';
    html += '<div class="app-modal" role="dialog" aria-modal="true" aria-labelledby="ledger-help-title">';
    html += '<div class="app-modal-head">';
    html += '<h3 id="ledger-help-title">월별 손익 · 현금흐름 안내</h3>';
    html += '<button type="button" class="app-modal-x" data-action="close-ledger-help" aria-label="닫기">×</button>';
    html += "</div>";
    html += '<div class="app-modal-body">';
    html += '<section class="app-modal-section"><h4>월별 손익</h4>';
    html += '<p class="app-modal-note">매출에서 프로젝트 직접비와 에이전시 수수료 등 매출원가를 차감해 매출총이익을 계산합니다.</p>';
    html += '<p class="app-modal-note">매출총이익에서 인건비, 임대료, 마케팅비 등 판관비를 차감해 영업이익을 계산합니다.</p>';
    html += '<p class="app-modal-note">영업이익은 세전 금액이며, 법인세 및 개인소득세는 별도의 세금 분석에서 계산합니다.</p>';
    html += "</section>";
    html += '<section class="app-modal-section"><h4>현금흐름</h4>';
    html += '<p class="app-modal-note">손익계산서에 비용으로 처리되지 않더라도 실제 현금이 이동하는 항목은 월별 현금흐름에 반영합니다.</p>';
    html += '<p class="app-modal-note">예: 보증금, 자산 구입, 부가세 예수금·납부, 법인세 및 주민세 납부.</p>';
    html += '<p class="app-modal-note">부가세와 법인세·주민세는 귀속월이 아니라 실제 입금·납부월에 현금으로 반영하며, 손익에는 넣지 않습니다.</p>';
    html += '<p class="app-modal-note">월말 자금은 통장 잔액에서 아직 납부하지 않은 법인세·주민세를 뺀 실제 남는 금액입니다.</p>';
    html += "</section>";
    html += '<section class="app-modal-section"><h4>표 읽는 순서</h4>';
    html += '<p class="app-modal-note">매출 → 매출원가 → 매출총이익 → 판관비 → 영업이익 → 현금흐름(자산·보증금 등 손익 외 현금 이동, 부가세, 법인세·주민세 납부) → 월말 자금</p>';
    html += "</section>";
    html += "</div>";
    html += '<div class="app-modal-foot"><button type="button" class="btn" data-action="close-ledger-help">확인</button></div>';
    html += "</div></div>";
    return html;
  }

  function floorBarWidth(value, maxAbs) {
    var max = App.Money.toSafeNumber(maxAbs);
    if (!max) return 0;
    var n = Math.max(0, App.Money.toSafeNumber(value));
    return Math.max(0, Math.min(100, (n / max) * 100));
  }

  function floorFoundText(row) {
    if (!row || !row.found) return "범위 안에서는 조건을 넘지 않음";
    return App.Format.formatWonAbout(row.revenue);
  }

  function floorFactorLabel(factor) {
    var n = Math.round(App.Money.toSafeNumber(factor) * 100) / 100;
    return n + "배";
  }

  function floorTag(ok, okText, badText) {
    return '<i class="floor-tag' + (ok ? " is-ok" : " is-warn") + '">' +
      esc(ok ? okText : badText) + "</i>";
  }

  function renderRevenueFloorView(state, result, ui) {
    var floor = App.Engine.analyzeRevenueFloor(state, result);
    var monthCount = floor.monthCount || 0;
    var html = '<div class="card floor-card">';
    html += '<div class="floor-head">';
    html += "<div><h2>참고 · 매출하한 기준</h2>";
    html += '<p class="muted small">지금 입력된 인건비·운영비·시작자금·기간은 그대로 두고, 기간 매출만 같은 비율로 줄여 엔진으로 다시 계산한 참고값입니다. ' +
      "전속 배분과 1인 기획사 경제가치 정의는 시나리오 비교와 같습니다.</p></div>";
    if (floor.startMonth && floor.endMonth) {
      html += '<div class="floor-period">' + esc(floor.startMonth) + " ~ " + esc(floor.endMonth) +
        "<em>" + monthCount + "개월 · 연환산은 12/" + monthCount + "</em></div>";
    }
    html += "</div>";

    if (!floor.current || !floor.current.revenue) {
      html += '<p class="muted">기간 매출이 0원이면 하한을 계산할 수 없습니다. 수익을 등록하면 현재 비용 구조 기준으로 다시 계산합니다.</p></div>';
      return html;
    }

    html += '<div class="floor-kpis">';
    html += '<div class="floor-kpi"><span class="floor-kpi-k">경제가치 역전</span><b>' +
      esc(floorFoundText(floor.economicValue)) + "</b><span>전속보다 경제가치가 커지는 매출</span></div>";
    html += '<div class="floor-kpi"><span class="floor-kpi-k">영업이익 흑자</span><b>' +
      esc(floorFoundText(floor.operatingProfit)) + "</b><span>영업이익이 플러스로 바뀌는 매출</span></div>";
    html += '<div class="floor-kpi"><span class="floor-kpi-k">통장 유지</span><b>' +
      esc(floorFoundText(floor.cash)) + "</b><span>통장이 마이너스로 안 내려가는 매출</span></div>";
    html += "</div>";

    var cur = floor.current;
    var evOk = floor.economicValue.found && cur.revenue >= floor.economicValue.revenue;
    html += '<div class="floor-note' + (evOk ? " is-ok" : " is-warn") + '">';
    html += "<span>지금 기간 매출 <b>" + App.Format.formatWonAbout(cur.revenue) + "</b></span>";
    html += "<span>1인 기획사 " + App.Format.formatWonAbout(cur.soloEV) +
      " · 전속 " + App.Format.formatWonAbout(cur.exclusiveEV) + "</span>";
    html += floorTag(evOk, "경제가치 하한 이상", "경제가치 하한 미달");
    html += "</div>";

    var samples = floor.samples || [];
    var maxEv = 0;
    samples.forEach(function (s) {
      maxEv = Math.max(maxEv, s.soloEV || 0, s.exclusiveEV || 0);
    });
    if (samples.length) {
      html += '<section class="floor-sec">';
      html += "<h3>매출이 줄면 어느 쪽이 유리한가</h3>";
      html += '<p class="muted small">막대는 경제가치입니다. 1인 기획사는 고정비가 커서 매출이 낮을수록 전속에 밀립니다.</p>';
      html += '<div class="floor-chart">';
      html += '<div class="floor-legend"><span><i class="floor-swatch solo"></i>1인 기획사</span>' +
        "<span><i class=\"floor-swatch ex\"></i>기존 회사 전속</span></div>";
      samples.forEach(function (s) {
        var now = s.revenue === cur.revenue;
        html += '<div class="floor-chart-row' + (now ? " is-now" : "") + '">';
        html += '<div class="floor-chart-label">' +
          '<span class="floor-chart-factor">' + esc(floorFactorLabel(s.factor)) + "</span>" +
          esc(App.Format.formatWonAbout(s.revenue).replace(/^약 /, "")) +
          (now ? "<em>지금</em>" : "") + "</div>";
        html += '<div class="floor-bars">';
        html += '<div class="floor-bar-line"><div class="floor-bar solo" style="width:' +
          floorBarWidth(s.soloEV, maxEv).toFixed(1) + '%"></div><b>' +
          App.Format.formatWonAbout(s.soloEV).replace(/^약 /, "") + "</b></div>";
        html += '<div class="floor-bar-line"><div class="floor-bar ex" style="width:' +
          floorBarWidth(s.exclusiveEV, maxEv).toFixed(1) + '%"></div><b>' +
          App.Format.formatWonAbout(s.exclusiveEV).replace(/^약 /, "") + "</b></div>";
        html += "</div></div>";
      });
      html += "</div></section>";
    }
    html += renderMultiplierFloorBlock(state, ui);

    html += '<section class="floor-sec">';
    html += "<h3>세 가지 하한이 다른 이유</h3>";
    html += '<div class="floor-panel">';
    html += '<table class="floor-table"><thead><tr><th>기준</th><th class="num">기간 매출</th><th class="num">연환산</th><th>의미</th></tr></thead><tbody>';
    function floorRow(cls, label, row, meaning) {
      var period = row && row.found ? App.Format.formatWonAbout(row.revenue) : "—";
      var year = row && row.found
        ? App.Format.formatWonAbout(App.Engine.annualizeRevenueFloor(row.revenue, monthCount))
        : "—";
      return '<tr class="' + cls + '"><td>' + esc(label) + '</td><td class="num">' + esc(period) +
        '</td><td class="num">' + esc(year) + "</td><td>" + esc(meaning) + "</td></tr>";
    }
    html += floorRow(
      evOk ? "ok" : "warn",
      "전속 대비 경제가치",
      floor.economicValue,
      "이보다 낮으면 전속이 더 유리"
    );
    html += floorRow(
      "",
      "영업이익 흑자",
      floor.operatingProfit,
      "수수료·인건비·운영비를 커버"
    );
    html += floorRow(
      "",
      "통장 유지",
      floor.cash,
      "최저잔액이 마이너스로 안 내려감"
    );
    html += '<tr class="ok"><td>지금 기간 매출</td><td class="num">' +
      App.Format.formatWonAbout(cur.revenue) + '</td><td class="num">' +
      App.Format.formatWonAbout(App.Engine.annualizeRevenueFloor(cur.revenue, monthCount)) +
      "</td><td>현재 저장본 기준</td></tr>";
    html += "</tbody></table></div>";
    html += '<p class="muted small">입금 월은 현재 지급 일정을 유지한 채 금액만 비율로 줄입니다. 인건비·보증금·시작자금은 바꾸지 않습니다.</p>';
    html += "</section>";

    html += '<div class="floor-two">';
    html += '<section class="floor-panel">';
    html += "<h3>이 구조의 월 고정 부담</h3>";
    var burden = floor.burden;
    if (burden) {
      html += '<p class="muted small">고정비가 가장 큰 달(' + esc(burden.month) +
        ") 기준입니다. 작품 진행비·성사수수료는 빼 둔 운영 부담입니다.</p>";
      html += '<p class="muted small">월 고정 부담은 매월 반복되는 비용만 계산하며, 인센티브·상여·퇴직급여 등 비정기 비용은 제외합니다.</p>';
      html += '<table class="floor-table"><thead><tr><th>항목</th><th class="num">월 규모</th></tr></thead><tbody>';
      (burden.people || []).forEach(function (p) {
        html += "<tr><td>" + esc(p.label) + '</td><td class="num">' + App.Format.formatWon(p.amount) + "</td></tr>";
      });
      if (burden.insurance) html += "<tr><td>4대보험</td><td class=\"num\">" + App.Format.formatWon(burden.insurance) + "</td></tr>";
      if (burden.meal) html += "<tr><td>복리후생비</td><td class=\"num\">" + App.Format.formatWon(burden.meal) + "</td></tr>";
      if (burden.recurring) html += "<tr><td>반복 운영비</td><td class=\"num\">" + App.Format.formatWon(burden.recurring) + "</td></tr>";
      if (burden.support) html += "<tr><td>회사 지원</td><td class=\"num\">" + App.Format.formatWon(burden.support) + "</td></tr>";
      if (burden.dayBased) html += "<tr><td>일수 비용</td><td class=\"num\">" + App.Format.formatWon(burden.dayBased) + "</td></tr>";
      html += '<tr class="ok"><td>소계</td><td class="num">' + App.Format.formatWon(burden.total) + "</td></tr>";
      html += "</tbody></table>";
    } else {
      html += '<p class="muted small">월 고정 부담을 계산할 기간이 없습니다.</p>';
    }
    html += "</section><section class=\"floor-panel\">";
    html += "<h3>지금 매출과 하한</h3>";
    html += '<table class="floor-table"><thead><tr><th>기준</th><th class="num">차이</th><th>판정</th></tr></thead><tbody>';
    function vsRow(label, row) {
      if (!row || !row.found) {
        return "<tr><td>" + esc(label) + '</td><td class="num">—</td><td>' +
          floorTag(false, "", "하한을 찾지 못함") + "</td></tr>";
      }
      var diff = App.Money.roundWon(cur.revenue - row.revenue);
      var ok = diff >= 0;
      return '<tr class="' + (ok ? "ok" : "warn") + '"><td>' + esc(label) + '</td><td class="num">' +
        (ok ? "+" : "") + App.Format.formatWonAbout(diff) + "</td><td>" +
        floorTag(ok, "하한 이상", "하한 미달") + "</td></tr>";
    }
    html += vsRow("경제가치", floor.economicValue);
    html += vsRow("영업이익", floor.operatingProfit);
    html += vsRow("통장 유지", floor.cash);
    html += "</tbody></table>";
    html += "</section></div>";

    var pipeline = floor.pipeline || [];
    if (pipeline.length > 1) {
      html += '<section class="floor-sec">';
      html += "<h3>지금 파이프라인에서 빼 보면</h3>";
      html += '<p class="muted small">인건비·임대 등 고정 판관비는 그대로 둡니다. 작품을 빼면 그 작품의 AP(성사수수료)·프로젝트 진행비·밥차도 엔진이 같이 빼고, 남은 작품 기준으로 다시 계산합니다.</p>';
      html += '<div class="floor-scroll"><table class="floor-table"><thead><tr><th>구성</th><th class="num">기간 매출</th><th class="num">AP</th><th class="num">진행비</th><th>1인 vs 전속</th><th class="num">영업이익</th><th class="num">최저잔액</th></tr></thead><tbody>';
      pipeline.forEach(function (row) {
        var cls = row.kind === "all" ? "is-now" : (row.evOk && row.cashOk ? "ok" : (row.evOk ? "" : "warn"));
        var vs = row.evOk
          ? floorTag(true, "1인이 " + App.Format.formatWonAbout(row.delta), "")
          : floorTag(false, "", "전속이 유리");
        html += '<tr class="' + cls + '"><td>' + esc(row.label) + '</td><td class="num">' +
          App.Format.formatWonAbout(row.revenue) + '</td><td class="num">' +
          App.Format.formatWonAbout(row.agencyFees) + '</td><td class="num">' +
          App.Format.formatWonAbout(row.projectExpense) + "</td><td>" + vs +
          '</td><td class="num">' + App.Format.formatWonAbout(row.operatingProfit) +
          '</td><td class="num">' + App.Format.formatWonAbout(row.minClosing) + "</td></tr>";
      });
      html += "</tbody></table></div></section>";
    }

    html += '<section class="floor-close">';
    html += "<h3>한 줄로</h3>";
    var lines = [];
    if (floor.cash.found) {
      lines.push("이 비용 규모를 유지하면 같은 기간에 매출 " + App.Format.formatWonAbout(floor.cash.revenue) + "은 나와야 통장이 버팁니다.");
    }
    if (floor.economicValue.found) {
      lines.push("전속과 비교해 1인 기획사를 택할 이유는 " + App.Format.formatWonAbout(floor.economicValue.revenue) + "부터 생깁니다.");
    }
    lines.push("지금 기간 매출은 " + App.Format.formatWonAbout(cur.revenue) + "입니다.");
    html += "<p>" + esc(lines.join(" ")) + "</p>";
    html += '<p class="muted small">인건비를 줄이거나 시작자금을 더 넣으면 하한은 내려갑니다. 숫자는 하드코딩하지 않고 현재 저장본을 엔진에 다시 넣어 계산합니다.</p>';
    html += "</section></div>";
    return html;
  }

  function analysisPayableTaxDetail(result) {
    var k = (result && result.kpis) || {};
    var vat = App.Money.roundWon(k.vatPendingLiability || 0);
    var corp = App.Money.roundWon(k.corporateTaxPending || 0);
    var local = App.Money.roundWon(k.localTaxPending || 0);
    return { vat: vat, corp: corp, local: local, total: App.Money.roundWon(vat + corp + local) };
  }

  function analysisTaxKpiCard(label, valueText, cls, aboutText, helpAction, extra) {
    extra = extra || {};
    var html = '<div class="kpi' + (cls ? " " + cls : "") + '">';
    html += '<div class="label">' + esc(label);
    if (extra.tag) {
      html += '<span class="kpi-tag' + (extra.tagClass ? " " + extra.tagClass : "") + '">' + esc(extra.tag) + "</span>";
    }
    if (helpAction) {
      html += '<button type="button" class="help-q" data-action="' + esc(helpAction) +
        '" aria-label="' + esc(label) + ' 상세">?</button>';
    }
    html += "</div>";
    html += '<div class="value">' + esc(valueText) + "</div>";
    if (aboutText) html += '<div class="about">' + esc(aboutText) + "</div>";
    if (extra.note) html += '<div class="kpi-note">' + esc(extra.note) + "</div>";
    html += "</div>";
    return html;
  }

  function renderAnalysisTaxHelpModal(detail) {
    var html = '<div class="app-modal-backdrop" role="presentation">';
    html += '<div class="app-modal" role="dialog" aria-modal="true" aria-labelledby="analysis-tax-help-title">';
    html += '<div class="app-modal-head">';
    html += '<h3 id="analysis-tax-help-title">납부할 세금 상세</h3>';
    html += '<button type="button" class="app-modal-x" data-action="close-analysis-tax-help" aria-label="닫기">×</button>';
    html += "</div>";
    html += '<div class="app-modal-body">';
    html += '<section class="app-modal-section">';
    html += '<div class="app-modal-row"><span>부가세</span><b>' + App.Format.formatWon(detail.vat) + "</b></div>";
    html += '<div class="app-modal-row"><span>법인세</span><b>' + App.Format.formatWon(detail.corp) + "</b></div>";
    html += '<div class="app-modal-row"><span>법인지방소득세</span><b>' + App.Format.formatWon(detail.local) + "</b></div>";
    html += '<div class="app-modal-row app-modal-row-total"><span>합계</span><b>' + App.Format.formatWon(detail.total) + "</b></div>";
    html += "</section>";
    html += '<p class="app-modal-note">이미 낸 세금이나 대표·배우 개인 종합소득세는 포함하지 않습니다. 표의 월말 자금은 아직 안 낸 법인세·주민세만 빼고, 미납 부가세는 빼지 않습니다. 위 실질 가용현금만 부가세까지 뺍니다.</p>';
    html += "</div></div></div>";
    return html;
  }

  function cashReconRow(label, amount, opts) {
    opts = opts || {};
    var html = '<div class="cash-recon-row' + (opts.cls ? " " + opts.cls : "") + '">';
    html += '<span class="cash-recon-label">' + esc(label);
    if (opts.tag) {
      html += '<span class="kpi-tag' + (opts.tagClass ? " " + opts.tagClass : "") + '">' + esc(opts.tag) + "</span>";
    }
    html += "</span>";
    html += "<b" + (opts.valueClass ? ' class="' + opts.valueClass + '"' : "") + ">" +
      (opts.same ? sameAmountStar(opts.same) : "") +
      (opts.minus ? "− " : "") + App.Format.formatWon(amount) + "</b>";
    html += "</div>";
    return html;
  }

  function renderAnalysisTaxKpis(result, ui) {
    var k = (result && result.kpis) || {};
    var detail = analysisPayableTaxDetail(result);
    var endClosing = App.Money.roundWon(k.endClosing);
    var available = App.Money.roundWon(endClosing - detail.total);
    var afterTax = App.Money.roundWon(k.endClosingAfterTax != null ? k.endClosingAfterTax : endClosing);
    var corpLocal = App.Money.roundWon(detail.corp + detail.local);
    var html = '<div class="analysis-cash-board">';
    html += '<div class="cash-recon">';
    html += '<p class="muted small">같은 기말을 통장 → 표의 월말 자금 → 실질 가용 순으로 맞춘 계산입니다.</p>';
    html += cashReconRow("통장 잔액", endClosing, {
      cls: endClosing < 0 ? "is-bad" : "",
      tag: "통장"
    });
    html += cashReconRow("미납 법인세·주민세", corpLocal, { cls: "is-sub", minus: true });
    html += cashReconRow("표의 월말 자금", afterTax, {
      cls: "is-mid" + (afterTax < 0 ? " is-bad" : ""),
      tag: "법인세만 차감",
      tagClass: "kpi-tag-warn",
      same: "시나리오 비교의 전체 세후 법인잔여 · 월별 분석 표와 같은 금액"
    });
    html += cashReconRow("미납 부가세", detail.vat, { cls: "is-sub", minus: true });
    html += cashReconRow("실질 가용현금", available, {
      cls: "is-total" + (available < 0 ? " is-bad" : ""),
      tag: "부가세까지 차감",
      valueClass: available < 0 ? "is-neg" : "is-ok"
    });
    html += "</div>";
    html += '<div class="analysis-kpi-side">';
    html += analysisTaxKpiCard("납부할 세금", App.Format.formatWon(detail.total), "warn",
      "부가세 + 법인세 + 지방소득세", "open-analysis-tax-help");
    html += analysisTaxKpiCard("최저 잔액", App.Format.formatWon(k.minClosing), k.minClosing < 0 ? "bad" : "",
      k.minMonth ? App.Month.monthLabel(k.minMonth) : "");
    html += "</div></div>";
    if (ui && ui.analysisTaxHelpOpen) html += renderAnalysisTaxHelpModal(detail);
    return html;
  }

  function analysisCheckValueText(v) {
    if (typeof v === "number") return App.Format.formatWon(v);
    return String(v);
  }

  function renderAnalysisConsistencyBanner(state, result, ui) {
    if (!App.Engine.validateAnalysisConsistency) return "";
    var report = App.Engine.validateAnalysisConsistency(state, result);
    var html = "";
    if (report.valid) {
      html += '<p class="consistency-ok">✓ 데이터 정합성 정상 — 모든 분석 항목이 원본 설정과 일치합니다.</p>';
      return html;
    }
    html += '<div class="consistency-warn">';
    html += '<p class="consistency-warn-line"><span>⚠ 데이터 정합성 오류 ' + report.errors.length + '건</span>' +
      '<button type="button" class="btn btn-sm" data-action="toggle-analysis-consistency">' +
      (ui && ui.analysisConsistencyOpen ? "오류 접기" : "오류 보기") + "</button></p>";
    if (ui && ui.analysisConsistencyOpen) {
      html += '<div class="consistency-list">';
      report.errors.forEach(function (e) {
        html += '<div class="consistency-item">';
        html += "<b>⚠ " + esc(e.label) + "</b>";
        html += '<div class="consistency-row"><span>원본</span><span>' + esc(e.source || "-") +
          "</span><b>" + esc(analysisCheckValueText(e.expected)) + "</b></div>";
        html += '<div class="consistency-row"><span>분석</span><span>' + esc(e.analysisPath || "-") +
          "</span><b>" + esc(analysisCheckValueText(e.actual)) + "</b></div>";
        if (typeof e.difference === "number") {
          html += '<div class="consistency-row consistency-diff"><span>차이</span><span></span><b' +
            (e.difference !== 0 ? ' class="is-neg"' : "") + ">" +
            esc(App.Format.formatWon(e.difference)) + "</b></div>";
        }
        html += "</div>";
      });
      html += "</div>";
    }
    html += "</div>";
    return html;
  }

  function renderAnalysis(state, result, ui) {
    var tab = (ui && ui.analysisTab) || "compare";
    var html = '<div class="view-analysis">';
    html += analysisTabs(tab, ui);
    if (tab === "revenue-floor") {
      html += renderRevenueFloorView(state, result, ui);
      html += "</div>";
      return html;
    }
    html += renderAnalysisCompareView(state, result, ui);
    html += "</div>";
    return html;
  }

  function renderMonthlyLedgerCard(state, result, ui) {
    var selected = ui.selectedMonth || (result.months[0] && result.months[0].month);
    var ledger = result.ledger || { months: [], groups: [], results: [] };
    var months = ledger.months.length ? ledger.months : result.months.map(function (r) { return r.month; });
    var html = '<div class="card ledger-card">';
    html += '<div class="ledger-head">';
    html += "<h2>월별 손익 · 현금흐름</h2>";
    html += '<button type="button" class="help-q" data-action="open-ledger-help" aria-label="월별 손익·현금흐름 안내">?</button>';
    html += '<div class="ledger-year-controls">';
    html += '<button type="button" class="btn btn-quiet" data-action="ledger-years-collapse">전체 접기</button>';
    html += '<button type="button" class="btn btn-quiet" data-action="ledger-years-expand">전체 펼치기</button>';
    html += "</div>";
    html += "</div>";
    html += '<p class="muted small ledger-lead">월별 매출과 비용을 기준으로 손익을 계산하고, 실제 입·출금 시점을 함께 보여줍니다. 월말 자금은 아직 안 낸 법인세·주민세를 뺀 금액입니다.</p>';
    html += '<p class="muted small ledger-guide"><span><b>손익:</b> 매출 → 매출원가 → 매출총이익 → 판관비 → 영업이익</span>';
    html += "<span><b>현금흐름:</b> 자산·보증금, 부가세, 법인세·주민세 납부 등 손익 밖 현금 이동과 월말 자금</span></p>";
    if (ui && ui.ledgerHelpOpen) html += renderLedgerHelpModal();
    html += renderRevenueGapBanner(revenueGapOf(state, result), "월별 분석 수입이 등록 계약금액과 다릅니다");
    html += renderProjectExpenseGapBanner(projectExpenseGapOf(state, result));
    var yearsOpen = ledgerColumnLayout(months, ui).anyOpen;
    html += '<div class="ledger-scroll"><table class="ledger' + (yearsOpen ? " years-open" : "") + '">';
    html += renderLedgerThead(months, selected, ui);
    html += "<tbody>";
    var gap = revenueGapOf(state, result);
    var projectExpenseGap = projectExpenseGapOf(state, result);
    (ledger.groups || []).forEach(function (g) {
      if (g.id === "funding" || g.id === "otherIn" || g.id === "dividend" || g.id === "profit-share") return;
      html += renderLedgerGroup(g, months, selected, gap, ui, projectExpenseGap);
    });
    html += renderLedgerCashflowBlock(ledger, months, selected, gap, ui, projectExpenseGap);
    html += "</tbody></table></div></div>";
    return html;
  }

  function renderVatSettingsCard(state) {
    App.Defaults.ensureVatSettings(state);
    var vat = state.settings.vat;
    var html = '<div class="card"><h2>부가가치세(VAT)</h2>';
    html += '<label class="check"><input type="checkbox" data-path="settings.vat.on" data-kind="bool"' +
      (vat.on !== false ? " checked" : "") + ">부가세 현금흐름 반영</label>";
    html += '<div class="row-fields">';
    html += '<div class="field"><label>세율</label>' +
      percentInput("settings.vat.rate", pctView(vat.rate), 'data-kind="percent"') + "</div>";
    html += '<div class="field"><label>신고 주기</label>' +
      selectInput("settings.vat.period", vat.period, [
        { id: "quarterly", label: "분기별" },
        { id: "monthly", label: "매월" }
      ]) + "</div>";
    html += '<div class="field"><label>신고·납부 시차</label>' +
      withUnit(textInput("settings.vat.filingLagMonths", vat.filingLagMonths, 'data-kind="count"'), "개월 후") + "</div>";
    html += "</div>";
    html += '<p class="muted small">매출 입금 시 부가세(예수금)만 공급가액과 별도로 현금에 함께 들어옵니다. ' +
      '매입 비용의 부가세(대급금)는 항목별 과세 여부를 정확히 알 수 없어 반영하지 않습니다 — 비용은 등록한 금액 그대로만 현금에서 나갑니다. ' +
      '신고 주기가 끝난 뒤 설정한 시차만큼 지난 달에 그 기간 매출세액 전액이 한 번에 현금에서 빠집니다(매입세액 공제 없음). ' +
      '손익(매출·비용·영업이익·법인세)에는 영향을 주지 않고, 현금흐름과 대시보드 자금 안정성에만 반영됩니다.</p>';
    html += '<p class="muted small">작품별로 「VAT 과세」 체크를 해제하면 그 작품 매출만 부가세 계산에서 제외됩니다.</p>';
    html += "</div>";
    return html;
  }

  function renderSettings(state) {
    var ins = state.settings.insuranceRates;
    App.Defaults.ensureInsuranceRates(state);
    ins = state.settings.insuranceRates;
    var html = '<div class="card"><h2>4대보험 요율 <span class="auto">회사 부담 · 직원별 상한</span></h2><div class="row-fields">';
    html += '<div class="field"><label>국민연금 사용자부담</label>' + percentInput("settings.insuranceRates.pensionEmployer", (ins.pensionEmployer * 100).toFixed(3), 'data-kind="ratio"') + "</div>";
    html += '<div class="field"><label>건강보험</label>' + percentInput("settings.insuranceRates.health", (ins.health * 100).toFixed(4), 'data-kind="ratio"') + "</div>";
    html += '<div class="field"><label>고용보험</label>' + percentInput("settings.insuranceRates.employment", (ins.employment * 100).toFixed(3), 'data-kind="ratio"') + "</div>";
    html += '<div class="field"><label>산재보험</label>' + percentInput("settings.insuranceRates.industrialAccident", (ins.industrialAccident * 100).toFixed(3), 'data-kind="ratio"') + "</div>";
    html += "</div>";
    html += '<label class="check"><input type="checkbox" data-path="settings.insuranceRates.useCaps" data-kind="bool"' +
      (ins.useCaps !== false ? " checked" : "") + ">국민연금 상·하한 · 건강보험 보수월액 상한 적용</label>";
    var refMonth = (state.profile && state.profile.startMonth) || "2026-12";
    var pRule = App.InsuranceRules && App.InsuranceRules.pensionFor(refMonth);
    var hRule = App.InsuranceRules && App.InsuranceRules.healthFor(refMonth);
    if (pRule && hRule) {
      html += '<p class="muted small">' + esc(refMonth) + " 기준 국민연금 하한 " +
        App.Format.formatWon(pRule.min) + " · 상한 " + App.Format.formatWon(pRule.max) +
        " · 건보 상한 " + App.Format.formatWon(hRule.max) +
        ". 국민연금 회사부담은 2026년부터 4.75%(그 이전 4.5%). 직원별로 계산한 뒤 합칩니다. 회사 부담분만 반영합니다.</p>";
    } else {
      html += '<p class="muted small">직원별로 계산한 뒤 합칩니다. 회사 부담분만 반영합니다.</p>';
    }
    html += "</div>";

    html += '<div class="card"><h2>퇴직급여</h2>';
    html += selectInput("settings.severance.mode", state.settings.severance.mode, [
      { id: "auto", label: "근무월 안분 (월급여 / 12)" },
      { id: "decemberFull", label: "매년 12월 월급여 100%" },
      { id: "manual", label: "직접 입력" }
    ]);
    html += '<p class="muted small">기본은 퇴직 대상 직원의 월급여를 12로 나눈 금액을 재직 달마다 넣습니다. 15개월이면 월급 × 15/12가 기간 합계입니다. 「매년 12월」은 그달 월급 전액을 12월에만 넣습니다.</p></div>';

    html += renderVatSettingsCard(state);

    html += '<div class="card"><div class="section-title"><h2>회사 휴무일</h2><button class="btn" data-action="add-holiday">+ 휴무</button></div>';
    (state.customHolidays || []).forEach(function (h, i) {
      html += '<div class="inline"><input type="date" data-path="customHolidays.' + i + '.date" value="' + esc(h.date || "") + '">';
      html += textInput("customHolidays." + i + ".label", h.label);
      html += '<button class="btn danger" data-action="remove-holiday" data-index="' + i + '">삭제</button></div>';
    });
    html += "</div>";
    html += '<div class="card"><div class="section-title"><h2>강제 근무일 (촬영 등)</h2><button class="btn" data-action="add-workday">+ 근무일</button></div>';
    (state.forcedWorkdays || []).forEach(function (h, i) {
      html += '<div class="inline"><input type="date" data-path="forcedWorkdays.' + i + '.date" value="' + esc(h.date || "") + '">';
      html += textInput("forcedWorkdays." + i + ".label", h.label);
      html += '<button class="btn danger" data-action="remove-workday" data-index="' + i + '">삭제</button></div>';
    });
    html += "</div>";
    html += '<div class="card"><h2>안내</h2><p class="muted">숫자는 이 PC 브라우저에만 저장됩니다. 서버로 올라가지 않습니다. 세금·보험은 의사결정용 근사치입니다. 공휴일 데이터는 2026–2028년입니다.</p></div>';
    return html;
  }

  function renderSetup(state, result, ui) {
    return renderRevenue(state, result, ui);
  }

  function renderSticky() {
    return "";
  }

  function renderDashHero(result) {
    var k = result.kpis;
    var afterTax = k.endClosingAfterTax != null ? k.endClosingAfterTax : k.endClosing;
    var html = '<div class="dash-hero">';
    html += kpi("기간말 현금", App.Format.formatWon(k.endClosing), k.endClosing < 0 ? "bad" : "good", "통장 잔액");
    html += kpi("월말 자금", App.Format.formatWon(afterTax), afterTax < 0 ? "bad" : "good", "미납 법인세·주민세 차감");
    html += kpi("최저 잔액", App.Format.formatWon(k.minClosing), k.minClosing < 0 ? "bad" : "", k.minMonth ? App.Month.monthLabel(k.minMonth) : "");
    html += kpi("기간 입금", App.Format.formatWon(k.inflowInPeriod), "good");
    html += kpi("추가 필요자금", App.Format.formatWon(k.deficitCover), k.deficitCover > 0 ? "bad" : "good");
    html += "</div>";
    return html;
  }

  function renderView(view, state, result, ui) {
    if (view === "simulation") return renderSimulation(state, result, ui);
    if (view === "revenue" || view === "projects" || view === "setup") return renderRevenue(state, result, ui);
    if (view === "costs") return renderCosts(state, result, ui);
    if (view === "analysis") return renderAnalysis(state, result, ui);
    if (view === "settings") return renderSettings(state);
    return renderDashboard(state, result, ui);
  }

  function budgetPeriodLabel(b) {
    if (!b || (!b.startMonth && !b.endMonth)) return "기간 미정";
    return (App.Format.formatMonthIso(b.startMonth) || "미정") + "~" + (App.Format.formatMonthIso(b.endMonth) || "미정");
  }

  function renderBudgetSwitcherButton(state) {
    var title = (state.meta && state.meta.title) ||
      (state.profile && (state.profile.companyName || state.profile.actorName)) || "예산안";
    return '<button type="button" class="btn btn-quiet" data-action="toggle-budget-panel">예산안: ' + esc(title) + " ▾</button>";
  }

  function renderBudgetPanel(ui) {
    if (!ui || !ui.budgetPanelOpen) return "";
    var budgets = (App.Store && App.Store.listBudgets) ? App.Store.listBudgets() : [];
    var activeId = App.Store && App.Store.getActiveBudgetId ? App.Store.getActiveBudgetId() : null;
    var html = '<div class="budget-panel">';
    html += "<h3>예산안 목록</h3>";
    if (!budgets.length) {
      html += '<p class="muted small">저장된 예산안이 없습니다.</p>';
    } else {
      html += '<div class="budget-list">';
      budgets.forEach(function (b) {
        var active = b.id === activeId;
        html += '<div class="budget-row' + (active ? " active" : "") + '">';
        html += '<div class="budget-row-main">';
        html += '<span class="budget-dot' + (active ? "" : " off") + '">' + (active ? "●" : "○") + "</span>";
        html += '<span class="budget-name">' + esc(b.name || "이름 없음") + "</span>";
        html += '<span class="muted small budget-meta">' + esc(budgetPeriodLabel(b)) + "</span>";
        html += "</div>";
        html += '<div class="budget-row-ops">';
        if (!active) {
          html += '<button type="button" class="btn" data-action="switch-budget" data-id="' + esc(b.id) + '">불러오기</button>';
        }
        html += '<button type="button" class="btn" data-action="rename-budget" data-id="' + esc(b.id) + '">이름변경</button>';
        html += '<button type="button" class="btn" data-action="duplicate-budget" data-id="' + esc(b.id) + '">복제</button>';
        html += '<button type="button" class="btn danger" data-action="delete-budget" data-id="' + esc(b.id) + '"' +
          (budgets.length <= 1 ? " disabled" : "") + ">삭제</button>";
        html += "</div></div>";
      });
      html += "</div>";
    }
    html += '<div class="inline" style="margin-top:10px">';
    html += '<button type="button" class="btn" data-action="new-budget">+ 새 예산안 (빈 상태)</button>';
    html += '<button type="button" class="btn" data-action="new-budget-copy">+ 새 예산안 (현재 복제)</button>';
    html += '<button type="button" class="btn danger" data-action="reset">현재 예산안을 최종 시드로 되돌리기</button>';
    html += "</div></div>";
    return html;
  }

  App.Render = {
    renderView: renderView,
    renderSticky: renderSticky,
    patchCosts: patchCosts,
    patchSales: patchSales,
    costItemKeys: allCostItemKeys,
    isLedgerGroupOpen: isLedgerGroupOpen,
    isLedgerYearOpen: isLedgerYearOpen,
    ledgerYearsOf: ledgerYearsOf,
    ledgerYearColumnValue: ledgerYearColumnValue,
    exclusiveCompanyEconomics: exclusiveCompanyEconomics,
    renderBudgetSwitcherButton: renderBudgetSwitcherButton,
    renderBudgetPanel: renderBudgetPanel
  };
})();
