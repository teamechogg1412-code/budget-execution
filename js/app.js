(function () {
  window.App = window.App || {};

  function seedState() {
    return (App.Defaults.seedState || App.Sample.load)();
  }

  var state = seedState();
  var result = null;
    var ui = { view: "dashboard", selectedMonth: null, savedAt: null, loadError: false, savedLoadOpen: false, rateOpen: {}, costTab: "opex", rent2fTab: "included", analysisTab: "scenarios", simTab: "basics", supportOpen: {}, costSecOpen: {}, costItemOpen: {}, planEditId: null, planPayOpen: {}, workOpen: {}, workItemOpen: {}, ledgerOpen: {}, ledgerYearOpen: {}, budgetPanelOpen: false, moreMenuOpen: false, personalTaxScenario: "", taxFoldOpen: {}, settingsFoldOpen: {}, revenueRateHelpOpen: false, ledgerHelpOpen: false, multiplierHelpOpen: false, scenarioCompareHelpOpen: false, scenarioCorpHelpOpen: false, scenarioSoloPersonHelpOpen: false, scenarioExPersonHelpOpen: false, analysisTaxHelpOpen: false, analysisConsistencyOpen: false, revenueDraft: null, revenueDraftSourceId: null };
  var saveTimer = null;

  function getByPath(obj, path) {
    return path.split(".").reduce(function (acc, key) {
      if (acc == null) return acc;
      return acc[key];
    }, obj);
  }

  function setByPath(obj, path, value) {
    var parts = path.split(".");
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var key = parts[i];
      var nextKey = parts[i + 1];
      var nextIsIndex = /^\d+$/.test(nextKey);
      if (cur[key] == null) cur[key] = nextIsIndex ? [] : {};
      cur = cur[key];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function parseValue(el) {
    var kind = el.getAttribute("data-kind");
    var raw = el.type === "checkbox" ? el.checked : el.value;
    if (kind === "bool") return !!raw;
    if (kind === "count") {
      var c = Math.round(App.Money.toSafeNumber(raw));
      return c < 0 ? 0 : c;
    }
    if (kind === "money" || kind === "number") return App.Money.toSafeNumber(raw);
    if (kind === "percent") return App.Money.clampPercentInput(raw) / 100;
    if (kind === "ratio") return App.Money.toSafeNumber(raw) / 100;
    if (kind === "fee-rate") return App.Money.clampPercentInput(raw) / 100;
    if (kind === "expense-mode") return el.checked ? "default" : "custom";
    if (kind === "expense-amount-mode") return el.checked ? "manual" : "auto";
    if (kind === "month" || el.type === "month") return App.Month.normalizeMonth(raw);
    return raw;
  }

  function ensureFee(projectIndex) {
    var p = state.projects[projectIndex];
    if (!p.fee) p.fee = { name: "성사수수료", rate: 0, amount: null, basis: "inflow" };
    return p.fee;
  }

  function recompute() {
    result = App.Engine.runSimulation(state);
    var months = (result.months || []).map(function (r) { return r.month; });
    if (ui.selectedMonth && months.indexOf(ui.selectedMonth) < 0) {
      ui.selectedMonth = months[0] || null;
    }
  }

  function doSave() {
    if (App.Store.save(state)) {
      ui.savedAt = new Date();
      var el = document.getElementById("saved");
      if (el) el.textContent = "저장됨 " + ui.savedAt.toLocaleTimeString("ko-KR");
      if (App.RemoteStore && App.RemoteStore.isEnabled()) {
        App.RemoteStore.save(state).then(function (res) {
          if (!res || !res.ok) return;
          var remoteEl = document.getElementById("saved");
          if (remoteEl) remoteEl.textContent = "원격 저장됨 " + ui.savedAt.toLocaleTimeString("ko-KR");
        }).catch(function () {});
      }
      return true;
    }
    return false;
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(doSave, 300);
  }

  function flushSave() {
    clearTimeout(saveTimer);
    doSave();
  }

  function refreshBudgetSwitcher() {
    var el = document.getElementById("budget-switcher");
    if (el) el.innerHTML = App.Render.renderBudgetSwitcherButton(state);
  }

  function refreshBudgetPanel() {
    var el = document.getElementById("budget-panel");
    if (el) el.innerHTML = App.Render.renderBudgetPanel(ui);
  }

  function setMoreMenuOpen(open) {
    ui.moreMenuOpen = !!open;
    var menu = document.getElementById("more-menu");
    var btn = document.querySelector('[data-action="toggle-more"]');
    if (menu) menu.hidden = !ui.moreMenuOpen;
    if (btn) btn.setAttribute("aria-expanded", ui.moreMenuOpen ? "true" : "false");
  }

  function refreshSticky() {
    var kpisEl = document.getElementById("sticky-kpis");
    var top = document.querySelector(".top");
    var onDash = ui.view === "dashboard";
    if (kpisEl) {
      kpisEl.innerHTML = "";
      kpisEl.hidden = true;
    }
    if (top) top.classList.toggle("is-dashboard", onDash);
    if (ui.savedLoadOpen) {
      document.getElementById("sub").textContent = "조건 입력 → 현금흐름 자동 계산";
      var switcher = document.getElementById("budget-switcher");
      if (switcher) switcher.innerHTML = "";
      return;
    }
    var sub = [];
    sub.push((App.Defaults && App.Defaults.actorDisplayName) ? App.Defaults.actorDisplayName() : "배우");
    if (state.profile.companyName) sub.push(state.profile.companyName);
    sub.push(App.Month.monthLabel(state.profile.startMonth) + " – " + App.Month.monthLabel(state.profile.endMonth));
    document.getElementById("sub").textContent = sub.join(" · ");
    refreshBudgetSwitcher();
    syncSetupStickyTop();
  }

  var UNLOCK_KEY = "solo-agency-budget:gate-ok"; // legacy — Access.SESSION_KEY 사용

  function markSavedLoadDone() {
    ui.savedLoadOpen = false;
    ui.unlockError = false;
    if (App.Access && App.Access.persistUnlockSession) {
      App.Access.persistUnlockSession();
    } else {
      try { sessionStorage.setItem(UNLOCK_KEY, "1"); } catch (err) {}
    }
  }

  function unlockFromGate() {
    var input = document.querySelector("[data-unlock-password]");
    var value = input ? input.value : "";
    if (!App.Access || !App.Access.check(value)) {
      ui.unlockError = true;
      renderMain();
      return;
    }
    markSavedLoadDone();
    ui.view = "dashboard";
    if (App.Telegram && App.Telegram.notifyAccessOnce) App.Telegram.notifyAccessOnce();
    refreshSticky();
    renderMain();
  }

  function applyCanonicalSeed() {
    var prevMeta = state.meta;
    state = seedState();
    if (prevMeta && prevMeta.budgetId) {
      state.meta = state.meta || {};
      state.meta.budgetId = prevMeta.budgetId;
      state.meta.title = prevMeta.title;
      state.meta.createdAt = prevMeta.createdAt;
    }
  }

  function activateBudget(newState) {
    if (!newState) return;
    if (ui.savedLoadOpen) markSavedLoadDone();
    state = newState;
    ui.selectedMonth = null;
    ui.budgetPanelOpen = false;
    recompute();
    refreshSticky();
    refreshBudgetPanel();
    renderMain();
  }

  function syncSetupStickyTop() {
    var header = document.querySelector(".top");
    if (!header) return;
    var h = Math.ceil(header.getBoundingClientRect().height);
    document.documentElement.style.setProperty("--setup-sticky-top", h + "px");
  }

  function fitOneLine(el, maxPx, minPx) {
    if (!el) return;
    el.style.fontSize = "";
    var size = maxPx;
    el.style.fontSize = size + "px";
    var n = 0;
    while (n++ < 16 && size > minPx && el.scrollWidth > el.clientWidth + 1) {
      size -= 0.5;
      el.style.fontSize = size + "px";
    }
  }

  function fitCostItemNames() {
    var mobile = false;
    try { mobile = window.matchMedia("(max-width: 960px)").matches; } catch (err) {}
    var nodes = document.querySelectorAll(".view-costs .cost-name, .view-simulation .cost-name");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i].querySelector(".cost-name-text") || nodes[i];
      el.style.fontSize = "";
      if (!mobile) continue;
      fitOneLine(el, 13, 9);
    }
    var feeAmts = document.querySelectorAll('[data-computed="fee-amount"], [data-computed="fee-grand"]');
    for (var j = 0; j < feeAmts.length; j++) fitOneLine(feeAmts[j], 14, 10);
  }

  function renderMain(opts) {
    var keepScroll = opts && opts.keepLedgerScroll;
    var scroller = keepScroll ? document.querySelector(".ledger-scroll") : null;
    var pos = scroller ? { left: scroller.scrollLeft, top: scroller.scrollTop } : null;
    document.getElementById("view").innerHTML = App.Render.renderView(ui.view, state, result, ui);
    document.body.classList.toggle("is-locked", !!ui.savedLoadOpen);
    document.querySelectorAll(".nav button").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-view") === ui.view);
    });
    syncSetupStickyTop();
    if (ui.savedLoadOpen) {
      var pw = document.querySelector("[data-unlock-password]");
      if (pw) pw.focus();
    }
    if (pos) {
      var next = document.querySelector(".ledger-scroll");
      if (next) {
        next.scrollLeft = pos.left;
        next.scrollTop = pos.top;
      }
    }
    fitCostItemNames();
  }

  function restorePayoutFitFocus(key, fromEnd) {
    var next = document.querySelector('[data-payout-fit="' + key + '"]');
    if (key === "dividendOn" || key === "profitSettleOn") {
      var checked = document.querySelector('[data-payout-fit="' + key + '"]:checked');
      if (checked) next = checked;
    }
    if (!next) return;
    next.focus();
    try {
      var pos = Math.max(0, String(next.value || "").length - fromEnd);
      next.setSelectionRange(pos, pos);
    } catch (err) {}
  }

  function refreshPayoutFitPreview(el) {
    var key = el.getAttribute("data-payout-fit");
    App.Render.applyPayoutFitDraft(state, result, ui, key, parseValue(el));
    if (ui.payoutFitTrial) {
      if (!state.settings) state.settings = {};
      state.settings.payoutFitDraft = JSON.parse(JSON.stringify(ui.payoutFitTrial));
      scheduleSave();
    }
    if (key === "profitSettleOn") {
      if (!ui.analysisFoldOpen) ui.analysisFoldOpen = {};
      ui.analysisFoldOpen["payout-fit"] = true;
      afterChange(true);
      return;
    }
    if (!ui.analysisFoldOpen) ui.analysisFoldOpen = {};
    ui.analysisFoldOpen["payout-fit"] = true;
    var fromEnd = String(el.value || "").length - (el.selectionStart || 0);
    renderMain({ keepLedgerScroll: true });
    restorePayoutFitFocus(key, fromEnd);
  }

  function afterChange(rerender) {
    recompute();
    refreshSticky();
    patchComputed();
    scheduleSave();
    if (rerender || ui.view === "dashboard" || ui.view === "analysis") renderMain();
  }

  function formatMoneyField(el, finalize) {
    if (!el || el.getAttribute("data-kind") !== "money") return;
    var formatted = finalize
      ? App.Format.formatGrouped(App.Money.toSafeNumber(el.value))
      : App.Format.formatTypingGrouped(el.value);
    if (el.value === formatted) return;
    var fromEnd = el.value.length - (el.selectionStart || 0);
    el.value = formatted;
    try {
      var pos = Math.max(0, formatted.length - fromEnd);
      el.setSelectionRange(pos, pos);
    } catch (err) {}
  }

  function patchComputed() {
    (state.projects || []).forEach(function (p, i) {
      p.contractAmount = App.Engine.projectContractAmount(p);
      document.querySelectorAll('[data-computed="total"][data-index="' + i + '"]').forEach(function (el) {
        el.textContent = App.Format.formatWon(p.contractAmount);
      });
      var pctSum = 0;
      var paySum = 0;
      (p.payments || []).forEach(function (pay, j) {
        pctSum += App.Money.toSafeNumber(pay.percentage) * 100;
        var amt = App.Engine.resolvePaymentAmount(p, pay);
        paySum += amt;
        var payEl = document.querySelector('[data-computed="pay"][data-index="' + i + '"][data-pay="' + j + '"]');
        if (payEl) payEl.textContent = App.Format.formatWon(amt);
      });
      var pctText = (Math.round(pctSum * 10) / 10) + "%";
      document.querySelectorAll('[data-computed="pct-sum"][data-index="' + i + '"]').forEach(function (el) {
        el.textContent = pctText;
      });
      document.querySelectorAll('[data-computed="pay-sum"][data-index="' + i + '"]').forEach(function (el) {
        el.textContent = App.Format.formatWon(paySum);
      });
    });
    App.Defaults.ensureBaseRates(state);
    var rates = state.profile.baseRates;
    (App.RateRows || []).forEach(function (row) {
      var total = App.Defaults.expectedRowTotal(rates, row);
      document.querySelectorAll('[data-computed="rate-total"][data-rate-id="' + row.id + '"]').forEach(function (el) {
        el.textContent = App.Format.formatWon(total);
      });
    });
    var groups = App.Defaults.expectedGroupTotals(rates);
    groups.groups.forEach(function (g) {
      document.querySelectorAll('[data-computed="rate-group"][data-group="' + g.id + '"]').forEach(function (el) {
        el.textContent = App.Format.formatWon(g.total);
      });
    });
    document.querySelectorAll('[data-computed="rate-grand"]').forEach(function (el) {
      el.textContent = App.Format.formatWon(groups.grand);
    });
    var progress = App.Defaults.salesPlanProgress(state);
    (progress.groups || []).forEach(function (g) {
      document.querySelectorAll('[data-computed="rate-meta"][data-group="' + g.id + '"]').forEach(function (el) {
        el.textContent = App.Defaults.salesGroupCompactMeta(g);
      });
      document.querySelectorAll('[data-computed="rate-plan-amt"][data-group="' + g.id + '"]').forEach(function (el) {
        el.textContent = App.Format.formatWon(g.plannedAmount);
      });
    });
    document.querySelectorAll('[data-computed="plan-grand"]').forEach(function (el) {
      el.textContent = App.Format.formatWon(progress.plannedTotal);
    });
    document.querySelectorAll('[data-computed="plan-unplaced"]').forEach(function (el) {
      el.textContent = App.Format.formatWon(progress.unplacedTotal);
    });
    if (result && result.revenueFees) {
      var feeTotals = result.revenueFees.totalsByFee || {};
      var feeGrand = 0;
      (state.revenueFees || []).forEach(function (fee) {
        var amt = fee.include === false ? 0 : App.Money.roundWon(feeTotals[fee.id]);
        if (fee.include !== false) feeGrand += amt;
        document.querySelectorAll('[data-computed="fee-amount"][data-fee-id="' + fee.id + '"]').forEach(function (el) {
          el.textContent = App.Format.formatWon(amt);
        });
      });
      document.querySelectorAll('[data-computed="fee-grand"]').forEach(function (el) {
        el.textContent = App.Format.formatWon(feeGrand);
      });
    }
    var simMonths = (result && result.months) ? result.months.length :
      App.Engine.resolveSimulationPeriod(state).monthCount;
    document.querySelectorAll('[data-computed="sim-months"]').forEach(function (el) {
      el.textContent = simMonths + "개월";
    });
    document.querySelectorAll('[data-computed="sim-status"]').forEach(function (el) {
      el.textContent = "기간 " + simMonths + "개월 · 최초 보유현금 " + App.Format.formatWon(state.profile.initialCash) +
        " · 최소 안전잔액 " + App.Format.formatWon(state.profile.safetyCash);
    });
    if (App.Render.patchSales) App.Render.patchSales(document.getElementById("view"), state);
    if (App.Render.patchCosts) App.Render.patchCosts(document.getElementById("view"), state);
  }

  var HELP_FLAGS = [
    "revenueRateHelpOpen", "ledgerHelpOpen", "multiplierHelpOpen", "scenarioCompareHelpOpen",
    "scenarioCorpHelpOpen", "scenarioSoloPersonHelpOpen", "scenarioExPersonHelpOpen",
    "analysisTaxHelpOpen", "liqHelpOpen", "payoutFitHelpOpen"
  ];

  function anyHelpOpen() {
    return HELP_FLAGS.some(function (k) { return ui[k]; });
  }

  function closeAllHelp() {
    HELP_FLAGS.forEach(function (k) { ui[k] = false; });
  }

  function bind() {
    document.body.addEventListener("input", function (e) {
      var el = e.target;
      formatMoneyField(el, false);
      if (el.getAttribute("data-payout-fit")) {
        refreshPayoutFitPreview(el);
        return;
      }
      if (!el.getAttribute("data-path")) return;
      applyField(el, false);
    });
    document.body.addEventListener("change", function (e) {
      var el = e.target;
      formatMoneyField(el, true);
      if (el.type === "month") {
        var wrap = el.closest(".yy-mm, .iso-mm");
        var face = wrap && wrap.querySelector(".yy-mm-face");
        if (face) {
          var month = App.Month.normalizeMonth(el.value);
          face.textContent = month || "미정";
          face.classList.toggle("unset", !el.value);
        }
      }
      if (el.getAttribute("data-kind") === "month") {
        el.value = App.Month.normalizeMonth(el.value) || "";
      }
      if (el.getAttribute("data-action") === "funding-family") {
        moveFundingFamily(el);
        return;
      }
      if (el.getAttribute("data-plan-add-cat") != null) {
        ui.planAddCategory = el.value;
        return;
      }
      if (el.getAttribute("data-payout-fit")) {
        refreshPayoutFitPreview(el);
        return;
      }
      if (!el.getAttribute("data-path")) return;
      applyField(el, true);
    });
    document.body.addEventListener("click", function (e) {
      if (e.target.closest("summary select")) {
        e.stopPropagation();
        return;
      }
      var summaryAction = e.target.closest("summary [data-action]");
      if (summaryAction) {
        e.preventDefault();
        e.stopPropagation();
        if (summaryAction.tagName !== "SELECT") handleAction(summaryAction);
        return;
      }
      if (e.target.closest("summary input, summary textarea, summary .with-unit, summary button")) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
    document.body.addEventListener("click", function (e) {
      if (e.target.closest("summary [data-action], summary input, summary select, summary textarea, summary .with-unit")) e.preventDefault();
      if (e.target.classList && e.target.classList.contains("app-modal-backdrop")) {
        closeAllHelp();
        renderMain();
        return;
      }
      var btn = e.target.closest("[data-action]");
      if (!btn || btn.tagName === "SELECT") {
        if (ui.moreMenuOpen && !e.target.closest(".more-wrap")) setMoreMenuOpen(false);
        return;
      }
      handleAction(btn);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target && e.target.getAttribute &&
          e.target.getAttribute("data-unlock-password") != null) {
        e.preventDefault();
        unlockFromGate();
        return;
      }
      if (e.key !== "Escape") return;
      var closed = false;
      if (ui.moreMenuOpen) { setMoreMenuOpen(false); closed = true; }
      if (anyHelpOpen()) {
        closeAllHelp();
        renderMain();
        closed = true;
      }
      if (closed) return;
    });
    document.body.addEventListener("toggle", function (e) {
      if (e.target && e.target.getAttribute && e.target.getAttribute("data-rate-group")) {
        ui.rateOpen[e.target.getAttribute("data-rate-group")] = !!e.target.open;
      }
      if (e.target && e.target.getAttribute && e.target.getAttribute("data-cost-sec")) {
        if (!ui.costSecOpen) ui.costSecOpen = {};
        ui.costSecOpen[e.target.getAttribute("data-cost-sec")] = !!e.target.open;
      }
      if (e.target && e.target.getAttribute && e.target.getAttribute("data-cost-item")) {
        if (!ui.costItemOpen) ui.costItemOpen = {};
        ui.costItemOpen[e.target.getAttribute("data-cost-item")] = !!e.target.open;
      }
      if (e.target && e.target.getAttribute && e.target.getAttribute("data-work-group")) {
        if (!ui.workOpen) ui.workOpen = {};
        ui.workOpen[e.target.getAttribute("data-work-group")] = !!e.target.open;
      }
      if (e.target && e.target.getAttribute && e.target.getAttribute("data-work-item")) {
        if (!ui.workItemOpen) ui.workItemOpen = {};
        ui.workItemOpen[e.target.getAttribute("data-work-item")] = !!e.target.open;
      }
      if (e.target && e.target.getAttribute && e.target.getAttribute("data-support-item")) {
        if (!ui.supportOpen) ui.supportOpen = {};
        ui.supportOpen[e.target.getAttribute("data-support-item")] = !!e.target.open;
      }
      if (e.target && e.target.getAttribute && e.target.getAttribute("data-tax-fold")) {
        if (!ui.taxFoldOpen) ui.taxFoldOpen = {};
        ui.taxFoldOpen[e.target.getAttribute("data-tax-fold")] = !!e.target.open;
      }
      if (e.target && e.target.getAttribute && e.target.getAttribute("data-settings-fold")) {
        if (!ui.settingsFoldOpen) ui.settingsFoldOpen = {};
        ui.settingsFoldOpen[e.target.getAttribute("data-settings-fold")] = !!e.target.open;
      }
    }, true);
    document.getElementById("import-file").addEventListener("change", function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          state = App.Store.parseImport(String(reader.result));
          markSavedLoadDone();
          afterChange(true);
        } catch (err) {
          alert("가져오기에 실패했습니다. " + (err.message || err));
        }
      };
      reader.readAsText(file, "utf-8");
      e.target.value = "";
    });
    window.addEventListener("resize", function () {
      syncSetupStickyTop();
      fitCostItemNames();
    });
    if (window.ResizeObserver) {
      var header = document.querySelector(".top");
      if (header) new ResizeObserver(syncSetupStickyTop).observe(header);
    }
  }

  function findProjectById(id) {
    return (state.projects || []).filter(function (p) { return p && p.id === id; })[0] || null;
  }

  function actionProject(btn) {
    if (btn.getAttribute("data-draft") === "1") return ui.revenueDraft || null;
    var idx = Number(btn.getAttribute("data-index"));
    return state.projects[idx] || null;
  }

  function clearRevenueDraft() {
    if (ui.revenueDraft && ui.workItemOpen) delete ui.workItemOpen[ui.revenueDraft.id];
    ui.revenueDraft = null;
    ui.revenueDraftSourceId = null;
  }

  function commitRevenueDraft() {
    var copy = ui.revenueDraft;
    if (!copy) return null;
    var sourceId = ui.revenueDraftSourceId;
    var inserted = false;
    if (!Array.isArray(state.projects)) state.projects = [];
    for (var i = 0; i < state.projects.length; i++) {
      if (state.projects[i] && state.projects[i].id === sourceId) {
        state.projects.splice(i + 1, 0, copy);
        inserted = true;
        break;
      }
    }
    if (!inserted) state.projects.push(copy);
    var savedId = copy.id;
    ui.revenueDraft = null;
    ui.revenueDraftSourceId = null;
    if (!ui.workItemOpen) ui.workItemOpen = {};
    ui.workItemOpen[savedId] = true;
    return copy;
  }

  function applyRevenueDraftField(path, value, fromChange) {
    if (!ui.revenueDraft) return;
    if (path.indexOf("revenueDraft.fee.") === 0 && !ui.revenueDraft.fee) {
      ui.revenueDraft.fee = { name: "성사수수료", rate: 0, amount: null, basis: "inflow" };
    }
    setByPath(ui, path, value);
    var draft = ui.revenueDraft;
    if (/\.(episodes|feePerEpisode)$/.test(path)) {
      draft.contractAmount = App.Engine.projectContractAmount(draft);
    }
    if (/^revenueDraft\.contractAmount$/.test(path) && App.Defaults.isSalesCategory(draft.category)) {
      draft.episodes = 1;
      draft.feePerEpisode = 0;
    }
    if (/^revenueDraft\.category$/.test(path) && App.Defaults.isSalesCategory(value)) {
      if (!App.Money.toSafeNumber(draft.episodes)) draft.episodes = 1;
    }
    if (/^revenueDraft\.expenseRate$/.test(path)) {
      draft.expenseRateMode = "custom";
      draft.expenseRateUserSet = true;
    }
    if (/^revenueDraft\.expenseRateMode$/.test(path)) {
      if (value === "custom") draft.expenseRateUserSet = true;
      if (value === "default") draft.expenseRateUserSet = false;
    }
    if (/^revenueDraft\.expenseAmountMode$/.test(path)) {
      if (value === "manual" && !App.Money.roundWon(draft.expenseManualAmount)) {
        var autoClone = Object.assign({}, draft, { expenseAmountMode: "auto" });
        draft.expenseManualAmount = App.Engine.calculateProjectExpenseDetail(autoClone, state).total;
      }
    }
    if (/^revenueDraft\.payments\.\d+\.percentage$/.test(path)) {
      setByPath(ui, path.replace(/\.percentage$/, ".inputMode"), "percent");
    }
    if (fromChange) renderMain();
  }

  function applyField(el, fromChange) {
    var path = el.getAttribute("data-path");
    if (/^revenueFees\.\d+\.rateByYear\.\d{4}$/.test(path)) {
      var rawYear = el.type === "checkbox" ? el.checked : el.value;
      if (rawYear === "" || rawYear == null) {
        var yp = path.split(".");
        var feeIdx = Number(yp[1]);
        var yearKey = yp[3];
        var feeObj = state.revenueFees && state.revenueFees[feeIdx];
        if (feeObj && feeObj.rateByYear && typeof feeObj.rateByYear === "object") {
          delete feeObj.rateByYear[yearKey];
          if (!Object.keys(feeObj.rateByYear).length) delete feeObj.rateByYear;
        }
        afterChange(fromChange);
        return;
      }
    }
    var value = parseValue(el);
    if (path.indexOf("revenueDraft.") === 0) {
      applyRevenueDraftField(path, value, fromChange);
      return;
    }
    if (path.indexOf(".fee.") !== -1) {
      var idx = Number(path.split(".")[1]);
      ensureFee(idx);
    }
    setByPath(state, path, value);
    if (/\.profitShare(Work|Sales)Rate$/.test(path) || /profitShareRateByYear\.\d{4}$/.test(path)) {
      App.Defaults.ensureScenarioSettings(state);
      state.settings.scenarios.soloAgency.ownerPayout.profitShareOn = true;
    }
    if (/\.periodMode$/.test(path) && value === "custom") {
      var item = getByPath(state, path.replace(/\.periodMode$/, ""));
      if (item && typeof item === "object") {
        if (!App.Month.parseMonth(item.startMonth)) item.startMonth = state.profile.startMonth;
        if (!App.Month.parseMonth(item.endMonth)) item.endMonth = state.profile.endMonth;
      }
    }
    if (path === "settings.scenarios.soloAgency.ownerPayout.dividendRate") {
      App.Defaults.setOwnerDividendMode(state, "rate");
      App.Defaults.setOwnerDividendOn(state, true);
    }
    if (path === "settings.scenarios.soloAgency.ownerPayout.dividendAmount") {
      App.Defaults.setOwnerDividendMode(state, "amount");
      App.Defaults.setOwnerDividendOn(state, true);
    }
    if (/\.percentage$/.test(path)) {
      setByPath(state, path.replace(/\.percentage$/, ".inputMode"), "percent");
    }
    if (/^salesPlans\.\d+\.payments\.\d+\.amount$/.test(path)) {
      setByPath(state, path.replace(/\.amount$/, ".inputMode"), "amount");
    }
    if (/^salesPlans\.\d+\.rateId$/.test(path)) {
      var planIdx = Number(path.split(".")[1]);
      var plan = state.salesPlans[planIdx];
      var row = App.Defaults.rateRowById(value);
      if (plan && row) {
        plan.term = row.term;
        plan.category = row.category;
      }
    }
    if (/\.(episodes|feePerEpisode)$/.test(path)) {
      var pi = Number(path.split(".")[1]);
      if (state.projects[pi]) {
        state.projects[pi].contractAmount = App.Engine.projectContractAmount(state.projects[pi]);
      }
    }
    if (/^projects\.\d+\.contractAmount$/.test(path)) {
      var ci = Number(path.split(".")[1]);
      var deal = state.projects[ci];
      if (deal && App.Defaults.isSalesCategory(deal.category)) {
        deal.episodes = 1;
        deal.feePerEpisode = 0;
      }
    }
    if (/^projects\.\d+\.category$/.test(path) && App.Defaults.isSalesCategory(value)) {
      var gi = Number(path.split(".")[1]);
      var moved = state.projects[gi];
      if (moved && !App.Money.toSafeNumber(moved.episodes)) moved.episodes = 1;
    }
    if (/^projects\.\d+\.expenseRate$/.test(path)) {
      var ri = Number(path.split(".")[1]);
      if (state.projects[ri]) {
        state.projects[ri].expenseRateMode = "custom";
        state.projects[ri].expenseRateUserSet = true;
      }
    }
    if (/^projects\.\d+\.expenseRateMode$/.test(path)) {
      var mi = Number(path.split(".")[1]);
      var mp = state.projects[mi];
      if (mp && value === "custom") {
        var rateInp = document.querySelector('input[data-path="projects.' + mi + '.expenseRate"]');
        if (rateInp) mp.expenseRate = App.Money.clampPercentInput(rateInp.value) / 100;
        else mp.expenseRate = App.Defaults.getDefaultExpenseRate(state, mp.category);
        mp.expenseRateUserSet = true;
      }
      if (mp && value === "default") mp.expenseRateUserSet = false;
    }
    if (/^projects\.\d+\.expenseAmountMode$/.test(path)) {
      var ai = Number(path.split(".")[1]);
      var ap = state.projects[ai];
      if (ap && value === "manual" && !App.Money.roundWon(ap.expenseManualAmount)) {
        var autoClone = Object.assign({}, ap, { expenseAmountMode: "auto" });
        ap.expenseManualAmount = App.Engine.calculateProjectExpenseDetail(autoClone, state).total;
      }
    }
    if (/^settings\.supportPolicies\.\d+\.unitAmount$/.test(path)) {
      var spi = Number(path.split(".")[2]);
      var spItem = state.settings && state.settings.supportPolicies && state.settings.supportPolicies[spi];
      if (spItem) spItem.unitAmountUserSet = true;
    }
    if (/\.personalTax\.year$/.test(path) || /personalTaxCommon\.year$/.test(path)) {
      var taxYear = Number(value);
      setByPath(state, path, taxYear >= 2000 && taxYear <= 2100 ? taxYear : 2026);
    }
    if (/personalTaxCommon\.(year|mode)$/.test(path)) {
      App.Defaults.applyPersonalTaxCommon(state);
    } else if (/\.personalTax\.(year|mode)$/.test(path)) {
      App.Defaults.ensureScenarioSettings(state);
      var srcTax = getByPath(state, path.replace(/\.(year|mode)$/, ""));
      if (srcTax && state.settings.personalTaxCommon) {
        if (/\.year$/.test(path)) state.settings.personalTaxCommon.year = srcTax.year;
        if (/\.mode$/.test(path)) state.settings.personalTaxCommon.mode = srcTax.mode;
      }
      App.Defaults.applyPersonalTaxCommon(state);
    }
    if (/\.(exclusivePayer|soloPayer)$/.test(path) && /^settings\.supportPolicies\.\d+\./.test(path)) {
      var policy = getByPath(state, path.replace(/\.(exclusivePayer|soloPayer)$/, ""));
      if (policy && value === "share") {
        var shareKey = /\.soloPayer$/.test(path) ? "soloCompanyShareRate" : "exclusiveCompanyShareRate";
        var currentShare = App.Money.toRatio(policy[shareKey]);
        if (currentShare <= 0 || currentShare >= 1) policy[shareKey] = 0.5;
      }
      App.Defaults.syncSupportPolicyPayer(policy);
    }
    if (/\.(soloCompanyShareRate|exclusiveCompanyShareRate)$/.test(path) && /^settings\.supportPolicies\.\d+\./.test(path)) {
      var sharePolicy = getByPath(state, path.replace(/\.(soloCompanyShareRate|exclusiveCompanyShareRate)$/, ""));
      if (sharePolicy) {
        var payerKey = /\.soloCompanyShareRate$/.test(path) ? "soloPayer" : "exclusivePayer";
        sharePolicy[payerKey] = "share";
        App.Defaults.syncSupportPolicyPayer(sharePolicy);
        var complement = document.querySelector('[data-share-complement="' + path + '"]');
        if (complement) complement.textContent = (Math.round((1 - App.Money.toRatio(value)) * 1000) / 10) + "%";
      }
    }
    if (/^vehicles\.\d+\.startMonth$/.test(path)) {
      var vehMonth = getByPath(state, path.replace(/\.startMonth$/, ""));
      if (vehMonth && typeof vehMonth === "object") vehMonth.monthMode = "custom";
    }
    if (/^(employees|recurringExpenses|dayBasedExpenses)\.\d+\.(startMonth|endMonth)$/.test(path)) {
      var periodItem = getByPath(state, path.replace(/\.(startMonth|endMonth)$/, ""));
      if (periodItem && typeof periodItem === "object") periodItem.periodMode = "custom";
    }
    if (/^(startupExpenses|deposits|assets)\.\d+\.month$/.test(path)) {
      var lineMonth = getByPath(state, path.replace(/\.month$/, ""));
      if (lineMonth && typeof lineMonth === "object") lineMonth.monthMode = "custom";
    }
    var rerender = fromChange;
    afterChange(rerender);
  }

  function moveFundingFamily(el) {
    var from = el.getAttribute("data-list");
    var idx = Number(el.getAttribute("data-index"));
    var to = el.value === "asset" ? "assets" : "deposits";
    if (!from || from === to || !Array.isArray(state[from])) {
      renderMain();
      return;
    }
    var item = state[from].splice(idx, 1)[0];
    if (!item) {
      renderMain();
      return;
    }
    if (to === "assets") {
      item.category = "capex";
    } else {
      item.category = "deposit";
      if (item.expectedReturnMonth === undefined) item.expectedReturnMonth = null;
      if (item.returnAmount === undefined) item.returnAmount = null;
      if (item.returned === undefined) item.returned = false;
    }
    if (!Array.isArray(state[to])) state[to] = [];
    state[to].push(item);
    openNewCostItem(to, item);
    afterChange(true);
  }

  function costSecIdsForTab(tab) {
    if (tab === "startup") return ["startup"];
    if (tab === "funding") return ["deposits", "assets", "inflows"];
    if (tab === "project") return ["project-direct", "project-agency"];
    return ["sga-parent", "payroll", "insurance", "recurring-rent", "recurring-marketing", "welfare", "support-vehicle", "support-actor", "revenue-fees", "recurring-sga"];
  }

  var COST_LIST_SEC = {
    startupExpenses: "startup",
    deposits: "deposits",
    assets: "assets",
    otherOneTimeExpenses: "other",
    employees: "payroll",
    otherInflows: "inflows"
  };

  function openNewCostItem(list, item) {
    if (!ui.costItemOpen) ui.costItemOpen = {};
    if (!ui.costSecOpen) ui.costSecOpen = {};
    if (item && item.id) ui.costItemOpen[list + ":" + item.id] = true;
    if (list === "recurringExpenses") {
      ui.costSecOpen["sga-parent"] = true;
      ui.costSecOpen["recurring-" + ((item && item.category) || "sga")] = true;
      return;
    }
    if (list === "employees") ui.costSecOpen["sga-parent"] = true;
    var sec = COST_LIST_SEC[list];
    if (sec) ui.costSecOpen[sec] = true;
  }

  function findSalesPlan(id) {
    return (state.salesPlans || []).filter(function (p) { return p.id === id; })[0] || null;
  }

  function keepWorkItemOpen(index) {
    var p = state.projects[index];
    if (!p || !p.id) return;
    if (!ui.workItemOpen) ui.workItemOpen = {};
    ui.workItemOpen[p.id] = true;
  }

  function analysisFoldOpenFromUi(id) {
    var open = ui.analysisFoldOpen;
    if (open && Object.prototype.hasOwnProperty.call(open, id)) return !!open[id];
    var tab = ui.analysisTab || "compare";
    if (tab === "monthly") return id === "monthly" || id === "cash";
    if (tab === "income-tax") return id === "glance";
    return id === "monthly";
  }

  function handleAction(btn) {
    var action = btn.getAttribute("data-action");
    if (ui.savedLoadOpen && action !== "unlock-app") return;
    var index = Number(btn.getAttribute("data-index"));
    var start = state.profile.startMonth;

    if (action === "nav") {
      ui.view = btn.getAttribute("data-view");
      if (ui.view === "projects") ui.view = "revenue";
      if (ui.view === "setup") ui.view = "simulation";
      if (ui.view === "settings") {
        ui.view = "simulation";
        ui.simTab = "settings";
      }
      closeAllHelp();
      setMoreMenuOpen(false);
      renderMain();
      refreshSticky();
      return;
    }
    if (action === "open-revenue-rate-help") {
      closeAllHelp();
      ui.revenueRateHelpOpen = true;
      renderMain();
      var firstRate = document.querySelector(".app-modal-rates input");
      if (firstRate) firstRate.focus();
      else {
        var closeBtn = document.querySelector(".app-modal-x");
        if (closeBtn) closeBtn.focus();
      }
      return;
    }
    if (action === "close-revenue-rate-help") {
      ui.revenueRateHelpOpen = false;
      renderMain();
      return;
    }
    if (action === "open-ledger-help") {
      closeAllHelp();
      ui.ledgerHelpOpen = true;
      renderMain();
      var ledgerClose = document.querySelector(".app-modal-x");
      if (ledgerClose) ledgerClose.focus();
      return;
    }
    if (action === "close-ledger-help") {
      ui.ledgerHelpOpen = false;
      renderMain();
      return;
    }
    if (action === "open-multiplier-help") {
      closeAllHelp();
      ui.multiplierHelpOpen = true;
      renderMain();
      var multClose = document.querySelector(".app-modal-x");
      if (multClose) multClose.focus();
      return;
    }
    if (action === "close-multiplier-help") {
      ui.multiplierHelpOpen = false;
      renderMain();
      return;
    }
    if (action === "open-scenario-compare-help") {
      closeAllHelp();
      ui.scenarioCompareHelpOpen = true;
      renderMain();
      var compareHelpClose = document.querySelector(".app-modal-x");
      if (compareHelpClose) compareHelpClose.focus();
      return;
    }
    if (action === "close-scenario-compare-help") {
      ui.scenarioCompareHelpOpen = false;
      renderMain();
      return;
    }
    if (action === "open-payout-fit-help") {
      closeAllHelp();
      ui.payoutFitHelpOpen = true;
      renderMain();
      var payoutFitHelpClose = document.querySelector(".app-modal-x");
      if (payoutFitHelpClose) payoutFitHelpClose.focus();
      return;
    }
    if (action === "close-payout-fit-help") {
      ui.payoutFitHelpOpen = false;
      renderMain();
      return;
    }
    if (action === "payout-fit-apply") {
      App.Render.applyPayoutFitPreview(state, result, ui);
      if (ui.payoutFitTrial) {
        if (!state.settings) state.settings = {};
        state.settings.payoutFitDraft = JSON.parse(JSON.stringify(ui.payoutFitTrial));
        scheduleSave();
      }
      if (!ui.analysisFoldOpen) ui.analysisFoldOpen = {};
      ui.analysisFoldOpen["payout-fit"] = true;
      ui.analysisFoldOpen.monthly = true;
      ui.analysisFoldOpen.cash = true;
      renderMain();
      return;
    }
    if (action === "payout-fit-revert") {
      App.Render.revertPayoutFitPreview(state, result, ui);
      if (ui.payoutFitTrial) {
        if (!state.settings) state.settings = {};
        state.settings.payoutFitDraft = JSON.parse(JSON.stringify(ui.payoutFitTrial));
        scheduleSave();
      }
      if (!ui.analysisFoldOpen) ui.analysisFoldOpen = {};
      ui.analysisFoldOpen["payout-fit"] = true;
      renderMain();
      return;
    }
    if (action === "toggle-payout-fit-tax") {
      var taxId = btn.getAttribute("data-id");
      if (!taxId) return;
      if (!ui.payoutFitTaxOpen) ui.payoutFitTaxOpen = {};
      ui.payoutFitTaxOpen[taxId] = !ui.payoutFitTaxOpen[taxId];
      if (!ui.analysisFoldOpen) ui.analysisFoldOpen = {};
      ui.analysisFoldOpen["payout-fit"] = true;
      renderMain();
      return;
    }
    if (action === "toggle-payout-fit-section") {
      var sectionId = btn.getAttribute("data-id");
      if (!sectionId) return;
      if (!ui.payoutFitSectionOpen) ui.payoutFitSectionOpen = {};
      ui.payoutFitSectionOpen[sectionId] = !ui.payoutFitSectionOpen[sectionId];
      if (!ui.analysisFoldOpen) ui.analysisFoldOpen = {};
      ui.analysisFoldOpen["payout-fit"] = true;
      renderMain();
      return;
    }
    if (action === "open-liq-help") {
      closeAllHelp();
      ui.liqHelpOpen = true;
      renderMain();
      var liqClose = document.querySelector(".app-modal-x");
      if (liqClose) liqClose.focus();
      return;
    }
    if (action === "close-liq-help") {
      ui.liqHelpOpen = false;
      renderMain();
      return;
    }
    if (action === "reset-profit-share-expense-rate") {
      state.settings.scenarios.soloAgency.ownerPayout.profitShareExpenseRateOverride = null;
      renderMain();
      return;
    }
    if (action === "reset-exclusive-actor-expense-rate") {
      state.settings.scenarios.exclusiveContract.actorExpenseRateOverride = null;
      renderMain();
      return;
    }
    if (action === "open-analysis-tax-help") {
      closeAllHelp();
      ui.analysisTaxHelpOpen = true;
      renderMain();
      var taxHelpClose = document.querySelector(".app-modal-x");
      if (taxHelpClose) taxHelpClose.focus();
      return;
    }
    if (action === "close-analysis-tax-help") {
      ui.analysisTaxHelpOpen = false;
      renderMain();
      return;
    }
    if (action === "toggle-analysis-consistency") {
      ui.analysisConsistencyOpen = !ui.analysisConsistencyOpen;
      renderMain();
      return;
    }
    if (action === "open-scenario-corp-help") {
      closeAllHelp();
      ui.scenarioCorpHelpOpen = true;
      renderMain();
      var corpHelpClose = document.querySelector(".app-modal-x");
      if (corpHelpClose) corpHelpClose.focus();
      return;
    }
    if (action === "close-scenario-corp-help") {
      ui.scenarioCorpHelpOpen = false;
      renderMain();
      return;
    }
    if (action === "open-scenario-solo-person-help") {
      closeAllHelp();
      ui.scenarioSoloPersonHelpOpen = true;
      renderMain();
      var soloPersonHelpClose = document.querySelector(".app-modal-x");
      if (soloPersonHelpClose) soloPersonHelpClose.focus();
      return;
    }
    if (action === "close-scenario-solo-person-help") {
      ui.scenarioSoloPersonHelpOpen = false;
      renderMain();
      return;
    }
    if (action === "open-scenario-ex-person-help") {
      closeAllHelp();
      ui.scenarioExPersonHelpOpen = true;
      renderMain();
      var exPersonHelpClose = document.querySelector(".app-modal-x");
      if (exPersonHelpClose) exPersonHelpClose.focus();
      return;
    }
    if (action === "close-scenario-ex-person-help") {
      ui.scenarioExPersonHelpOpen = false;
      renderMain();
      return;
    }
    if (action === "toggle-more") {
      ui.budgetPanelOpen = false;
      refreshBudgetPanel();
      setMoreMenuOpen(!ui.moreMenuOpen);
      return;
    }
    if (action === "export") { setMoreMenuOpen(false); App.Store.download(state); return; }
    if (action === "export-excel") {
      if (!result) recompute();
      App.Export.download(state, result);
      setMoreMenuOpen(false);
      return;
    }
    if (action === "import") { setMoreMenuOpen(false); document.getElementById("import-file").click(); return; }
    if (action === "goto-rent2f") {
      ui.view = "costs";
      ui.costTab = "rent2f";
      ui.rent2fTab = "included";
      renderMain();
      refreshSticky();
      return;
    }
    if (action === "unlock-app") {
      unlockFromGate();
      return;
    }
    if (action === "load-saved") {
      applyCanonicalSeed();
      markSavedLoadDone();
      afterChange(true);
      return;
    }
    if (action === "reset") {
      setMoreMenuOpen(false);
      if (confirm("저장된 최종 시드로 되돌릴까요? 지금 입력은 덮어씁니다.")) {
        applyCanonicalSeed();
        markSavedLoadDone();
        afterChange(true);
      }
      return;
    }
    if (action === "toggle-budget-panel") {
      setMoreMenuOpen(false);
      ui.budgetPanelOpen = !ui.budgetPanelOpen;
      refreshBudgetPanel();
      return;
    }
    if (action === "switch-budget") {
      var switchId = btn.getAttribute("data-id");
      if (switchId === App.Store.getActiveBudgetId()) { ui.budgetPanelOpen = false; refreshBudgetPanel(); return; }
      flushSave();
      activateBudget(App.Store.switchActiveBudget(switchId));
      return;
    }
    if (action === "new-budget") {
      var newName = prompt("새 예산안 이름", "새 예산안");
      if (newName === null) return;
      flushSave();
      var newId = App.Store.createBudget(newName || "새 예산안");
      if (newId) activateBudget(App.Store.switchActiveBudget(newId));
      return;
    }
    if (action === "new-budget-copy") {
      var copyName = prompt("복제할 예산안 이름", (App.Defaults.budgetDisplayTitle(state) || "예산안") + " 복사본");
      if (copyName === null) return;
      flushSave();
      var copyId = App.Store.createBudget(copyName || "예산안 복사본", { fromState: state });
      if (copyId) activateBudget(App.Store.switchActiveBudget(copyId));
      return;
    }
    if (action === "rename-budget") {
      var renameId = btn.getAttribute("data-id");
      var current = (App.Store.listBudgets() || []).filter(function (b) { return b.id === renameId; })[0];
      var renamed = prompt("예산안 이름", (current && App.Defaults.displayBudgetName(current.name)) || "배우");
      if (!renamed) return;
      App.Store.renameBudget(renameId, renamed);
      if (renameId === App.Store.getActiveBudgetId() && state.meta) {
        state.meta.title = renamed;
        refreshSticky();
      }
      refreshBudgetPanel();
      return;
    }
    if (action === "duplicate-budget") {
      var dupId = btn.getAttribute("data-id");
      var dupSrc = (App.Store.listBudgets() || []).filter(function (b) { return b.id === dupId; })[0];
      var dupName = prompt("복제본 이름", ((dupSrc && App.Defaults.displayBudgetName(dupSrc.name)) || "예산안") + " 복사본");
      if (dupName === null) return;
      if (dupId === App.Store.getActiveBudgetId()) flushSave();
      App.Store.duplicateBudget(dupId, dupName || undefined);
      refreshBudgetPanel();
      return;
    }
    if (action === "delete-budget") {
      var delId = btn.getAttribute("data-id");
      if (!confirm("이 예산안을 삭제할까요? 되돌릴 수 없습니다.")) return;
      var wasActive = delId === App.Store.getActiveBudgetId();
      if (!App.Store.deleteBudget(delId)) {
        alert("마지막 예산안은 삭제할 수 없습니다.");
        return;
      }
      if (wasActive) {
        activateBudget(App.Store.load());
      } else {
        refreshBudgetPanel();
      }
      return;
    }
    if (action === "select-month") {
      ui.selectedMonth = btn.getAttribute("data-month");
      renderMain({ keepLedgerScroll: true });
      return;
    }
    if (action === "toggle-ledger-group") {
      var ledgerId = btn.getAttribute("data-group");
      if (!ledgerId) return;
      if (!ui.ledgerOpen) ui.ledgerOpen = {};
      ui.ledgerOpen[ledgerId] = !App.Render.isLedgerGroupOpen(ui, ledgerId);
      renderMain({ keepLedgerScroll: true });
      return;
    }
    if (action === "toggle-ledger-year") {
      var yearId = btn.getAttribute("data-year");
      if (!yearId) return;
      if (!ui.ledgerYearOpen) ui.ledgerYearOpen = {};
      ui.ledgerYearOpen[yearId] = !App.Render.isLedgerYearOpen(ui, yearId);
      renderMain({ keepLedgerScroll: true });
      return;
    }
    if (action === "ledger-years-collapse" || action === "ledger-years-expand") {
      var openAll = action === "ledger-years-expand";
      var ledgerMonths = (result && result.ledger && result.ledger.months) || [];
      var years = App.Render.ledgerYearsOf(ledgerMonths);
      if (!ui.ledgerYearOpen) ui.ledgerYearOpen = {};
      years.forEach(function (year) { ui.ledgerYearOpen[year] = openAll; });
      renderMain({ keepLedgerScroll: true });
      return;
    }
    if (action === "cost-tab") {
      ui.costTab = btn.getAttribute("data-tab") || "opex";
      renderMain();
      return;
    }
    if (action === "rent2f-tab") {
      ui.costTab = "rent2f";
      ui.rent2fTab = btn.getAttribute("data-tab") || "included";
      renderMain();
      return;
    }
    if (action === "analysis-tab") {
      var nextTab = btn.getAttribute("data-tab") || "compare";
      if (nextTab === "multiples") nextTab = "compare";
      ui.analysisTab = nextTab;
      closeAllHelp();
      renderMain();
      return;
    }
    if (action === "toggle-analysis-fold") {
      var foldId = btn.getAttribute("data-id");
      if (!foldId) return;
      if (!ui.analysisFoldOpen) {
        ui.analysisFoldOpen = {
          monthly: analysisFoldOpenFromUi("monthly"),
          cash: analysisFoldOpenFromUi("cash"),
          scenarios: analysisFoldOpenFromUi("scenarios"),
          glance: analysisFoldOpenFromUi("glance"),
          "payout-fit": analysisFoldOpenFromUi("payout-fit")
        };
      }
      ui.analysisFoldOpen[foldId] = !ui.analysisFoldOpen[foldId];
      if (ui.analysisTab === "revenue-floor") ui.analysisTab = "compare";
      renderMain();
      return;
    }
    if (action === "analysis-folds-collapse" || action === "analysis-folds-expand") {
      var foldOn = action === "analysis-folds-expand";
      ui.analysisFoldOpen = {
        monthly: foldOn,
        cash: foldOn,
        scenarios: foldOn,
        glance: foldOn,
        "payout-fit": foldOn
      };
      if (ui.analysisTab === "revenue-floor") ui.analysisTab = "compare";
      renderMain();
      return;
    }
    if (action === "personal-tax-scenario") {
      ui.personalTaxScenario = btn.getAttribute("data-id") || "";
      renderMain();
      return;
    }
    if (action === "sim-tab") {
      ui.simTab = btn.getAttribute("data-tab") || "basics";
      if (ui.simTab === "opex") ui.simTab = "basics";
      renderMain();
      return;
    }
    if (action === "goto-org-staff") {
      ui.view = "simulation";
      ui.simTab = "org";
      if (!ui.settingsFoldOpen) ui.settingsFoldOpen = {};
      ui.settingsFoldOpen["org-payroll"] = true;
      renderMain();
      refreshSticky();
      return;
    }
    if (action === "toggle-support-open") {
      var supportId = btn.getAttribute("data-id");
      if (!supportId) return;
      if (!ui.supportOpen) ui.supportOpen = {};
      ui.supportOpen[supportId] = !ui.supportOpen[supportId];
      renderMain();
      return;
    }
    if (action === "add-vehicle") {
      App.Defaults.ensureVehicles(state);
      var newVehicle = App.Defaults.newVehicle(state.profile && state.profile.startMonth);
      state.vehicles.push(newVehicle);
      if (!ui.supportOpen) ui.supportOpen = {};
      ui.supportOpen["vehicles-section"] = true;
      ui.supportOpen[newVehicle.id] = true;
      afterChange(true);
      return;
    }
    if (action === "remove-vehicle") {
      App.Defaults.ensureVehicles(state);
      var vehicleId = btn.getAttribute("data-id");
      var vIdx = -1;
      (state.vehicles || []).forEach(function (veh, vi) {
        if (veh && veh.id === vehicleId) vIdx = vi;
      });
      if (vIdx >= 0) state.vehicles.splice(vIdx, 1);
      afterChange(true);
      return;
    }
    if (action === "toggle-scenario") {
      var sid = btn.getAttribute("data-id");
      var on = btn.type === "checkbox" ? btn.checked : !App.Defaults.isScenarioEnabled(state, sid);
      App.Defaults.setScenarioEnabled(state, sid, on);
      afterChange(true);
      return;
    }
    if (action === "set-split-basis") {
      App.Defaults.applySplitBasisToggle(state, btn.getAttribute("data-basis"));
      afterChange(true);
      return;
    }
    if (action === "toggle-solo-tax-edit") {
      ui.soloTaxFormEdit = !ui.soloTaxFormEdit;
      if (ui.soloTaxFormEdit) {
        if (!ui.taxFoldOpen) ui.taxFoldOpen = {};
        ui.taxFoldOpen["scenario-solo"] = true;
      }
      renderMain();
      return;
    }
    if (action === "set-dividend-on") {
      App.Defaults.setOwnerDividendOn(state, btn.getAttribute("data-on") === "1");
      afterChange(true);
      return;
    }
    if (action === "set-profit-share-on") {
      App.Defaults.setOwnerProfitShareOn(state, btn.getAttribute("data-on") === "1");
      if (ui.payoutFitTrial) ui.payoutFitTrial.profitSettleOn = btn.getAttribute("data-on") === "1";
      if (state.settings && state.settings.payoutFitDraft) {
        state.settings.payoutFitDraft.profitSettleOn = btn.getAttribute("data-on") === "1";
        if (btn.getAttribute("data-on") !== "1") state.settings.payoutFitDraft.profitSettle = 0;
      }
      afterChange(true);
      return;
    }
    if (action === "set-dividend-mode") {
      App.Defaults.setOwnerDividendMode(state, btn.getAttribute("data-mode"));
      afterChange(true);
      return;
    }
    if (action === "normalize-share-rates") {
      App.Defaults.normalizeShareRates(state);
      afterChange(true);
      return;
    }
    if (action === "add-actor-personal-cost") {
      App.Defaults.ensureScenarioSettings(state);
      state.settings.scenarios.exclusiveContract.actorPersonalCosts.push(App.Defaults.newActorPersonalCost());
      afterChange(true);
      return;
    }
    if (action === "remove-actor-personal-cost") {
      App.Defaults.ensureScenarioSettings(state);
      var contract = state.settings.scenarios.exclusiveContract;
      var removedCost = contract.actorPersonalCosts[index];
      if (removedCost && App.Defaults.isActorPersonalCatalogId && App.Defaults.isActorPersonalCatalogId(removedCost.id)) {
        if (!Array.isArray(contract.actorPersonalCatalogRemoved)) contract.actorPersonalCatalogRemoved = [];
        if (contract.actorPersonalCatalogRemoved.indexOf(removedCost.id) < 0) {
          contract.actorPersonalCatalogRemoved.push(removedCost.id);
        }
      }
      contract.actorPersonalCosts.splice(index, 1);
      afterChange(true);
      return;
    }
    if (action === "add-tax-adjustment") {
      App.Defaults.ensureTaxSettings(state);
      var years = (result && result.kpis && result.kpis.taxDetail && result.kpis.taxDetail.years) || [];
      state.settings.tax.adjustments.push(App.Defaults.newTaxAdjustment(years[years.length - 1] || 2027));
      afterChange(true);
      return;
    }
    if (action === "remove-tax-adjustment") {
      App.Defaults.ensureTaxSettings(state);
      state.settings.tax.adjustments.splice(index, 1);
      afterChange(true);
      return;
    }
    if (action === "add-support-policy") {
      App.Defaults.ensureSupportPolicies(state);
      var added = App.Defaults.newSupportPolicy();
      state.settings.supportPolicies.push(added);
      if (!ui.supportOpen) ui.supportOpen = {};
      ui.supportOpen[added.id] = true;
      afterChange(true);
      return;
    }
    if (action === "remove-support-policy") {
      App.Defaults.ensureSupportPolicies(state);
      var removed = state.settings.supportPolicies[index];
      state.settings.supportPolicies.splice(index, 1);
      if (removed && ui.supportOpen) delete ui.supportOpen[removed.id];
      afterChange(true);
      return;
    }
    if (action === "set-plan-filter") {
      ui.planFilter = btn.getAttribute("data-filter") || "all";
      ui.planCategory = "";
      renderMain();
      return;
    }
    if (action === "filter-plan-category") {
      var cid = btn.getAttribute("data-category") || "";
      if (ui.planCategory === cid) {
        ui.planCategory = "";
      } else {
        ui.planCategory = cid;
        ui.planFilter = "all";
      }
      renderMain();
      return;
    }
    if (action === "expand-cost-all") {
      ui.costSecOpen = {};
      costSecIdsForTab(ui.costTab || "opex").forEach(function (id) { ui.costSecOpen[id] = true; });
      ui.costItemOpen = {};
      (App.Render.costItemKeys(state) || []).forEach(function (k) { ui.costItemOpen[k] = true; });
      renderMain();
      return;
    }
    if (action === "collapse-cost-all") {
      ui.costSecOpen = {};
      costSecIdsForTab(ui.costTab || "opex").forEach(function (id) { ui.costSecOpen[id] = false; });
      ui.costItemOpen = {};
      (App.Render.costItemKeys(state) || []).forEach(function (k) { ui.costItemOpen[k] = false; });
      renderMain();
      return;
    }
    if (action === "add-revenue" || action === "add-project") {
      var cat = btn.getAttribute("data-category");
      if (!cat && action === "add-revenue") {
        var addSel = document.querySelector("[data-plan-add-cat]");
        cat = (addSel && addSel.value) || ui.planAddCategory || "drama";
      }
      cat = cat || "drama";
      var proj = App.Defaults.newProject(start, cat, state);
      var n = state.projects.filter(function (p) { return p.category === cat; }).length + 1;
      var catLabel = (App.Categories.filter(function (c) { return c.id === cat; })[0] || {}).label || cat;
      proj.name = catLabel + " " + n;
      proj.payments = App.Defaults.defaultPaymentSplit(start);
      if (App.Defaults.isSalesCategory(cat)) {
        proj.episodes = 1;
        proj.shootStartMonth = start;
      }
      App.Defaults.applyBaseRateToProject(proj, state.profile.baseRates);
      state.projects.push(proj);
      if (!ui.workOpen) ui.workOpen = {};
      if (!ui.workItemOpen) ui.workItemOpen = {};
      ui.planFilter = "all";
      ui.planCategory = "";
      ui.workOpen[cat] = true;
      ui.workItemOpen[proj.id] = true;
    } else if (action === "regenerate-multiples") {
      ui.multiplierCache = null;
    } else if (action === "select-multiplier") {
      ui.multiplierSelected = Number(btn.getAttribute("data-m")) || 1;
      if (ui.analysisTab === "revenue-floor") ui.analysisTab = "compare";
    } else if (action === "remove-project") {
      var removed = state.projects[index];
      state.projects.splice(index, 1);
      if (removed && ui.workItemOpen) delete ui.workItemOpen[removed.id];
      if (removed && ui.revenueDraftSourceId === removed.id) clearRevenueDraft();
    } else if (action === "edit-project") {
      var editId = btn.getAttribute("data-id");
      if (!editId) return;
      if (!ui.workItemOpen) ui.workItemOpen = {};
      ui.workItemOpen[editId] = true;
      renderMain();
      return;
    } else if (action === "toggle-work-ops") {
      var opsId = btn.getAttribute("data-id");
      if (!opsId) return;
      if (!ui.workOpsOpen) ui.workOpsOpen = {};
      ui.workOpsOpen[opsId] = !ui.workOpsOpen[opsId];
      renderMain();
      return;
    } else if (action === "copy-project") {
      var source = findProjectById(btn.getAttribute("data-id"));
      if (!source) return;
      var copy = App.Defaults.cloneRevenueItem(source);
      ui.revenueDraft = copy;
      ui.revenueDraftSourceId = source.id;
      if (!ui.workOpen) ui.workOpen = {};
      if (!ui.workItemOpen) ui.workItemOpen = {};
      ui.workOpen[copy.category] = true;
      ui.workItemOpen[copy.id] = true;
      renderMain();
      return;
    } else if (action === "save-revenue-draft") {
      if (!commitRevenueDraft()) return;
    } else if (action === "cancel-revenue-draft") {
      clearRevenueDraft();
      renderMain();
      return;
    } else if (action === "toggle-work-item") {
      var wid = btn.getAttribute("data-id");
      if (!ui.workItemOpen) ui.workItemOpen = {};
      ui.workItemOpen[wid] = !ui.workItemOpen[wid];
      renderMain();
      return;
    } else if (action === "toggle-expense-detail") {
      var expId = btn.getAttribute("data-id");
      if (!ui.expenseDetailOpen) ui.expenseDetailOpen = {};
      ui.expenseDetailOpen[expId] = !ui.expenseDetailOpen[expId];
      renderMain();
      return;
    } else if (action === "add-payment") {
      var payTarget = actionProject(btn);
      if (!payTarget) return;
      if (!payTarget.payments) payTarget.payments = [];
      var pay = App.Defaults.newPayment(start);
      if (btn.getAttribute("data-label")) pay.label = btn.getAttribute("data-label");
      if (btn.getAttribute("data-pct")) pay.percentage = App.Money.toSafeNumber(btn.getAttribute("data-pct"));
      payTarget.payments.push(pay);
      if (btn.getAttribute("data-draft") === "1") {
        renderMain();
        return;
      }
      keepWorkItemOpen(index);
    } else if (action === "remove-payment") {
      var payHost = actionProject(btn);
      if (!payHost || !payHost.payments) return;
      payHost.payments.splice(Number(btn.getAttribute("data-pay")), 1);
      if (btn.getAttribute("data-draft") === "1") {
        renderMain();
        return;
      }
      keepWorkItemOpen(index);
    } else if (action === "add-direct") {
      var directHost = actionProject(btn);
      if (!directHost) return;
      if (!directHost.directExpenses) directHost.directExpenses = [];
      directHost.directExpenses.push({
        id: App.uid(), name: "", amount: 0, month: start, include: true
      });
      if (btn.getAttribute("data-draft") === "1") {
        renderMain();
        return;
      }
      keepWorkItemOpen(index);
    } else if (action === "remove-direct") {
      var directRm = actionProject(btn);
      if (!directRm || !directRm.directExpenses) return;
      directRm.directExpenses.splice(Number(btn.getAttribute("data-direct")), 1);
      if (btn.getAttribute("data-draft") === "1") {
        renderMain();
        return;
      }
      keepWorkItemOpen(index);
    } else if (action === "add-line") {
      var list = btn.getAttribute("data-list");
      var item = App.Defaults.newLine("");
      item.month = start;
      if (list === "startupExpenses") item.setupCostType = "incorporation";
      if (list === "deposits") {
        item.category = "deposit";
        item.accountSubject = "보증금";
        item.expectedReturnMonth = null;
        item.returnAmount = null;
        item.returned = false;
      }
      if (list === "assets") {
        item.category = "capex";
        item.accountSubject = "비품";
      }
      if (list === "otherOneTimeExpenses") item.category = "opex";
      if (!Array.isArray(state[list])) state[list] = [];
      state[list].push(item);
      openNewCostItem(list, item);
    } else if (action === "remove-line") {
      state[btn.getAttribute("data-list")].splice(index, 1);
    } else if (action === "add-employee") {
      var emp = {
        id: App.uid(), name: "", role: "", monthlySalary: 0,
        incentiveSeollal: 0, incentiveChuseok: 0, incentiveYearEnd: 0,
        periodMode: "full", startMonth: null, endMonth: null,
        insure: true, insureLimited: false, meal: true, severance: false, include: true
      };
      state.employees.push(emp);
      openNewCostItem("employees", emp);
      if (!ui.settingsFoldOpen) ui.settingsFoldOpen = {};
      ui.settingsFoldOpen["org-payroll"] = true;
    } else if (action === "remove-employee") {
      state.employees.splice(index, 1);
    } else if (action === "add-recurring") {
      var recCategory = btn.getAttribute("data-category") || "sga";
      var recDefaultName = recCategory === "rent" ? "임대료" : (recCategory === "marketing" ? "바이럴 마케팅비" : "");
      var rec = {
        id: App.uid(), name: recDefaultName, category: recCategory, type: "recurring",
        amount: 0, periodMode: "full", startMonth: null, endMonth: null,
        include: true, overrides: {}, note: ""
      };
      state.recurringExpenses.push(rec);
      openNewCostItem("recurringExpenses", rec);
    } else if (action === "remove-recurring") {
      state.recurringExpenses.splice(index, 1);
    } else if (action === "add-override") {
      var monthEl = document.querySelector('[data-override-month="' + index + '"]');
      var amountEl = document.querySelector('[data-override-amount="' + index + '"]');
      var m = App.Month.normalizeMonth(monthEl && monthEl.value);
      if (!m) return;
      if (!state.recurringExpenses[index].overrides) state.recurringExpenses[index].overrides = {};
      state.recurringExpenses[index].overrides[m] = App.Money.toSafeNumber(amountEl && amountEl.value);
      openNewCostItem("recurringExpenses", state.recurringExpenses[index]);
    } else if (action === "remove-override") {
      delete state.recurringExpenses[index].overrides[btn.getAttribute("data-month")];
    } else if (action === "add-inflow") {
      var inflow = {
        id: App.uid(), name: "보증금 반환", amount: 0, month: start, include: true, kind: "depositReturn"
      };
      if (!Array.isArray(state.otherInflows)) state.otherInflows = [];
      state.otherInflows.push(inflow);
      openNewCostItem("otherInflows", inflow);
    } else if (action === "remove-inflow") {
      state.otherInflows.splice(index, 1);
    } else if (action === "add-fee") {
      if (!Array.isArray(state.revenueFees)) state.revenueFees = [];
      if (!state.settings) state.settings = {};
      state.settings.revenueFeesUserCleared = false;
      state.revenueFees.push(App.Defaults.newRevenueFee());
    } else if (action === "remove-fee") {
      state.revenueFees.splice(index, 1);
      if (!state.settings) state.settings = {};
      state.settings.revenueFeesUserCleared = state.revenueFees.length === 0;
    } else if (action === "confirm-project") {
      if (state.projects[index]) {
        state.projects[index].status = "confirmed";
        keepWorkItemOpen(index);
      }
    } else if (action === "remove-sales-plan") {
      var rid = btn.getAttribute("data-id");
      state.salesPlans = (state.salesPlans || []).filter(function (p) { return p.id !== rid; });
      if (ui.planEditId === rid) ui.planEditId = null;
      if (ui.planPayOpen) delete ui.planPayOpen[rid];
    } else if (action === "edit-sales-plan") {
      ui.planEditId = btn.getAttribute("data-id");
      renderMain();
      return;
    } else if (action === "save-sales-plan") {
      ui.planEditId = null;
      renderMain();
      return;
    } else if (action === "toggle-plan-pay") {
      var payId = btn.getAttribute("data-id");
      if (!ui.planPayOpen) ui.planPayOpen = {};
      ui.planPayOpen[payId] = !ui.planPayOpen[payId];
      renderMain();
      return;
    } else if (action === "add-plan-payment") {
      var planAdd = findSalesPlan(btn.getAttribute("data-id"));
      if (!planAdd) return;
      if (!planAdd.payments) planAdd.payments = [];
      planAdd.payments.push(App.Defaults.newPayment(planAdd.month || start, { label: "지급", percentage: 0 }));
      if (!ui.planPayOpen) ui.planPayOpen = {};
      ui.planPayOpen[planAdd.id] = true;
    } else if (action === "lump-plan-payment") {
      var planLump = findSalesPlan(btn.getAttribute("data-id"));
      if (!planLump) return;
      planLump.payments = [App.Defaults.newPayment(planLump.month || start, { label: "모델료", percentage: 1 })];
      if (!ui.planPayOpen) ui.planPayOpen = {};
      ui.planPayOpen[planLump.id] = true;
    } else if (action === "remove-plan-payment") {
      var planRm = findSalesPlan(btn.getAttribute("data-id"));
      if (!planRm || !planRm.payments) return;
      planRm.payments.splice(Number(btn.getAttribute("data-pay")), 1);
      if (!ui.planPayOpen) ui.planPayOpen = {};
      ui.planPayOpen[planRm.id] = true;
    } else if (action === "fill-sales-plans") {
      App.Defaults.fillSalesPlansToTargets(state);
    } else if (action === "convert-sales-plan") {
      var convertedPlan = App.Defaults.convertSalesPlan(state, btn.getAttribute("data-id"), start);
      if (convertedPlan && convertedPlan.category) ui.rateOpen[convertedPlan.category] = true;
    } else if (action === "add-holiday") {
      state.customHolidays.push({ date: "", label: "회사 휴무" });
      if (!ui.settingsFoldOpen) ui.settingsFoldOpen = {};
      ui.settingsFoldOpen.holidays = true;
    } else if (action === "remove-holiday") {
      state.customHolidays.splice(index, 1);
    } else if (action === "add-workday") {
      state.forcedWorkdays.push({ date: "", label: "촬영" });
      if (!ui.settingsFoldOpen) ui.settingsFoldOpen = {};
      ui.settingsFoldOpen.workdays = true;
    } else if (action === "remove-workday") {
      state.forcedWorkdays.splice(index, 1);
    } else {
      return;
    }
    afterChange(true);
  }

  function boot() {
    var loaded = App.Store.load();
    if (loaded && loaded.error) {
      ui.loadError = true;
      state = seedState();
    } else if (loaded && loaded.settings) {
        state = App.Defaults.ensureState(loaded);
    } else {
      state = seedState();
    }
    recompute();
    bind();
    try {
      var viewQ = new URLSearchParams(window.location.search).get("view");
      if (viewQ === "projects") viewQ = "revenue";
      if (viewQ === "setup") viewQ = "simulation";
      if (viewQ === "settings") {
        viewQ = "simulation";
        ui.simTab = "settings";
      }
      if (viewQ) ui.view = viewQ;
    } catch (err) {}
    try {
      if (App.Access && App.Access.isPublicMode && App.Access.isPublicMode()) {
        ui.savedLoadOpen = false;
      } else if (App.Access && App.Access.hasValidSession) {
        ui.savedLoadOpen = !App.Access.hasValidSession();
      } else {
        ui.savedLoadOpen = sessionStorage.getItem(UNLOCK_KEY) !== "1";
      }
    } catch (err) {
      ui.savedLoadOpen = true;
    }
    refreshSticky();
    renderMain();
    if (!ui.savedLoadOpen && App.Telegram && App.Telegram.notifyAccessOnce) {
      App.Telegram.notifyAccessOnce();
    }
    if (ui.loadError) {
      document.getElementById("saved").textContent = "저장 데이터를 읽지 못해 새로 시작합니다";
    }
    if (!ui.savedLoadOpen && App.RemoteStore && App.RemoteStore.isEnabled()) {
      var savedEl = document.getElementById("saved");
      if (savedEl) savedEl.textContent = "원격 저장소 확인 중";
      App.RemoteStore.loadLatest().then(function (res) {
        if (!res || !res.ok || !res.state) return;
        state = App.Defaults.ensureState(res.state);
        recompute();
        refreshSticky();
        renderMain();
        var remoteEl = document.getElementById("saved");
        if (remoteEl) remoteEl.textContent = "원격 데이터 불러옴";
      }).catch(function () {
        var fallbackEl = document.getElementById("saved");
        if (fallbackEl && !ui.savedAt) fallbackEl.textContent = "로컬 데이터 사용 중";
      });
    }
  }

  App.ui = ui;
  App.getState = function () { return state; };
  App.boot = boot;
})();
