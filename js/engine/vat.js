(function () {
  window.App = window.App || {};
  App.Engine = App.Engine || {};

  var DEFAULT_VAT_RATE = 0.1;

  function resolveVatSettings(state) {
    var raw = (state && state.settings && state.settings.vat) || {};
    return {
      on: raw.on !== false,
      rate: (raw.rate !== null && raw.rate !== undefined && raw.rate !== "") ? App.Money.toRatio(raw.rate) : DEFAULT_VAT_RATE,
      period: raw.period === "monthly" ? "monthly" : "quarterly",
      filingLagMonths: Math.max(0, Math.round(App.Money.toSafeNumber(
        raw.filingLagMonths !== null && raw.filingLagMonths !== undefined ? raw.filingLagMonths : 1
      )))
    };
  }

  function quarterOfMonth(monthNum) {
    return Math.floor((monthNum - 1) / 3) + 1;
  }

  function vatPeriodKey(month, settings) {
    var parsed = App.Month.parseMonth(month);
    if (!parsed) return "";
    if (settings.period === "monthly") return month;
    return parsed.year + "-Q" + quarterOfMonth(parsed.month);
  }

  function vatPeriodEndMonth(periodKey, settings) {
    if (settings.period === "monthly") return periodKey;
    var m = /^(\d{4})-Q([1-4])$/.exec(periodKey);
    if (!m) return periodKey;
    var year = Number(m[1]);
    var endMonthNum = Number(m[2]) * 3;
    return App.Month.normalizeMonth(year + "-" + (endMonthNum < 10 ? "0" + endMonthNum : String(endMonthNum)));
  }

  function vatFilingMonth(periodKey, settings) {
    var endMonth = vatPeriodEndMonth(periodKey, settings);
    return App.Month.addMonths(endMonth, settings.filingLagMonths);
  }

  function isVatApplicable(sourceItem, defaultOn) {
    if (!sourceItem) return defaultOn !== false;
    if (sourceItem.vatApplicable === true) return true;
    if (sourceItem.vatApplicable === false) return false;
    return defaultOn !== false;
  }

  function vatAmountFor(amount, rate) {
    return App.Money.roundWon(App.Money.toSafeNumber(amount) * rate);
  }

  // 매입세액(부가세 대급금)은 비용 항목별 과세 여부를 정확히 알 수 없어 반영하지 않는다.
  // 매출세액(부가세 예수금)만 현금흐름에 반영하고, 신고월에 그 전액을 납부하는 것으로 계산한다.
  function calculateVatCashFlow(state, parts, months) {
    var settings = resolveVatSettings(state);
    var outputByMonth = {};
    (months || []).forEach(function (m) { outputByMonth[m] = 0; });

    var empty = {
      settings: settings,
      outputByMonth: outputByMonth,
      settlementByMonth: {},
      periods: [],
      pendingLiability: 0,
      byMonth: {}
    };
    if (!settings.on) return empty;

    var projectById = {};
    (state.projects || []).forEach(function (p) { if (p && p.id) projectById[p.id] = p; });

    (months || []).forEach(function (m) {
      var items = (parts.revenue && parts.revenue.byMonth[m] && parts.revenue.byMonth[m].items) || [];
      items.forEach(function (it) {
        var project = it.projectId ? projectById[it.projectId] : null;
        if (!isVatApplicable(project, true)) return;
        outputByMonth[m] = App.Money.roundWon(outputByMonth[m] + vatAmountFor(it.amount, settings.rate));
      });
    });

    var periodTotals = {};
    var periodOrder = [];
    (months || []).forEach(function (m) {
      var key = vatPeriodKey(m, settings);
      if (!key) return;
      if (!periodTotals[key]) {
        periodTotals[key] = { key: key, output: 0 };
        periodOrder.push(key);
      }
      periodTotals[key].output = App.Money.roundWon(periodTotals[key].output + (outputByMonth[m] || 0));
    });

    var periods = periodOrder.map(function (key) {
      var t = periodTotals[key];
      return { key: key, output: t.output, net: t.output, filingMonth: vatFilingMonth(key, settings) };
    });

    var lastMonth = months && months.length ? months[months.length - 1] : null;
    var settlementByMonth = {};
    var pendingLiability = 0;
    periods.forEach(function (p) {
      if (!p.net) return;
      var settled = lastMonth ? App.Month.diffMonths(p.filingMonth, lastMonth) >= 0 : false;
      if (settled) {
        settlementByMonth[p.filingMonth] = App.Money.roundWon((settlementByMonth[p.filingMonth] || 0) + p.net);
      } else {
        pendingLiability = App.Money.roundWon(pendingLiability + p.net);
      }
    });

    var runningBalance = 0;
    var byMonth = {};
    (months || []).forEach(function (m) {
      runningBalance = App.Money.roundWon(
        runningBalance + (outputByMonth[m] || 0) - (settlementByMonth[m] || 0)
      );
      byMonth[m] = {
        output: outputByMonth[m] || 0,
        settlement: settlementByMonth[m] || 0,
        balance: runningBalance
      };
    });

    return {
      settings: settings,
      outputByMonth: outputByMonth,
      settlementByMonth: settlementByMonth,
      periods: periods,
      pendingLiability: pendingLiability,
      byMonth: byMonth
    };
  }

  App.Engine.resolveVatSettings = resolveVatSettings;
  App.Engine.vatPeriodKey = vatPeriodKey;
  App.Engine.vatPeriodEndMonth = vatPeriodEndMonth;
  App.Engine.vatFilingMonth = vatFilingMonth;
  App.Engine.isVatApplicable = isVatApplicable;
  App.Engine.calculateVatCashFlow = calculateVatCashFlow;
})();
