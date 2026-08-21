(function () {
  window.App = window.App || {};

  function normalizeMonth(value) {
    if (value === null || value === undefined) return null;
    var s = String(value).trim();
    if (!s) return null;
    var m = /^(\d{4})-(\d{1,2})$/.exec(s);
    if (!m) {
      m = /^(\d{2})-(\d{1,2})$/.exec(s);
      if (m) {
        var yy = Number(m[1]);
        var fullYear = yy >= 70 ? 1900 + yy : 2000 + yy;
        m = [m[0], String(fullYear), m[2]];
      }
    }
    if (!m) {
      m = /^(\d{4})\s*년\s*(\d{1,2})\s*월?$/.exec(s);
    }
    if (!m) return null;
    var year = Number(m[1]);
    var month = Number(m[2]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
    return formatMonth(year, month);
  }

  function parseMonth(yyyyMm) {
    var normalized = normalizeMonth(yyyyMm);
    if (!normalized) return null;
    var m = /^(\d{4})-(\d{2})$/.exec(normalized);
    if (!m) return null;
    var year = Number(m[1]);
    var month = Number(m[2]);
    if (month < 1 || month > 12) return null;
    return { year: year, month: month };
  }

  function formatMonth(year, month) {
    var mm = month < 10 ? "0" + month : String(month);
    return year + "-" + mm;
  }

  function addMonths(yyyyMm, n) {
    var p = parseMonth(yyyyMm);
    if (!p) return "";
    var idx = p.year * 12 + (p.month - 1) + App.Money.toSafeNumber(n);
    var year = Math.floor(idx / 12);
    var month = (idx % 12) + 1;
    if (month <= 0) {
      year -= 1;
      month += 12;
    }
    return formatMonth(year, month);
  }

  function diffMonths(a, b) {
    var pa = parseMonth(a);
    var pb = parseMonth(b);
    if (!pa || !pb) return 0;
    return (pb.year - pa.year) * 12 + (pb.month - pa.month);
  }

  function compareMonths(a, b) {
    return diffMonths(a, b);
  }

  function isInRange(month, start, end) {
    if (!parseMonth(month) || !parseMonth(start) || !parseMonth(end)) return false;
    return diffMonths(start, month) >= 0 && diffMonths(month, end) >= 0;
  }

  function getSimulationMonths(startMonth, endMonth) {
    var start = parseMonth(startMonth) ? startMonth : "2027-01";
    var end = parseMonth(endMonth) ? endMonth : start;
    if (diffMonths(start, end) < 0) end = start;
    var months = [];
    var cursor = start;
    var guard = 0;
    while (diffMonths(cursor, end) >= 0 && guard < 120) {
      months.push(cursor);
      cursor = addMonths(cursor, 1);
      guard += 1;
    }
    return months;
  }

  function resolveSimulationPeriod(state) {
    var profile = (state && state.profile) || {};
    var warnings = [];
    var start = profile.startMonth;
    var end = profile.endMonth;
    if (!parseMonth(start)) start = "2027-01";
    if (!parseMonth(end) || diffMonths(start, end) < 0) {
      end = start;
      warnings.push({ code: "period_corrected", message: "종료월이 시작월보다 빨라 1개월로 보정했습니다." });
    }
    var months = getSimulationMonths(start, end);
    if (months.length > 36) {
      warnings.push({ code: "period_long", message: "권장 기간은 36개월입니다. 현재 " + months.length + "개월입니다." });
    }
    return {
      startMonth: start,
      endMonth: end,
      months: months,
      monthCount: months.length,
      warnings: warnings
    };
  }

  function usesCustomPeriod(item) {
    if (!item || typeof item !== "object") return false;
    return item.periodMode === "custom" || item.monthMode === "custom";
  }

  function appliesInMonth(item, month, simStart, simEnd) {
    if (!item || item.include === false) return false;
    if (!parseMonth(month)) return false;
    var start = simStart;
    var end = simEnd;
    if (usesCustomPeriod(item)) {
      if (parseMonth(item.startMonth)) start = item.startMonth;
      if (parseMonth(item.endMonth)) end = item.endMonth;
    }
    if (!parseMonth(start) || !parseMonth(end)) return false;
    return isInRange(month, start, end);
  }

  function monthLabel(yyyyMm) {
    var p = parseMonth(yyyyMm);
    if (!p) return "";
    return formatMonth(p.year, p.month);
  }

  function daysInMonth(yyyyMm) {
    var p = parseMonth(yyyyMm);
    if (!p) return 0;
    return new Date(p.year, p.month, 0).getDate();
  }

  function dateKey(year, month, day) {
    var mm = month < 10 ? "0" + month : String(month);
    var dd = day < 10 ? "0" + day : String(day);
    return year + "-" + mm + "-" + dd;
  }

  App.Month = {
    normalizeMonth: normalizeMonth,
    parseMonth: parseMonth,
    formatMonth: formatMonth,
    addMonths: addMonths,
    diffMonths: diffMonths,
    compareMonths: compareMonths,
    isInRange: isInRange,
    getSimulationMonths: getSimulationMonths,
    resolveSimulationPeriod: resolveSimulationPeriod,
    usesCustomPeriod: usesCustomPeriod,
    appliesInMonth: appliesInMonth,
    monthLabel: monthLabel,
    daysInMonth: daysInMonth,
    dateKey: dateKey
  };
})();
