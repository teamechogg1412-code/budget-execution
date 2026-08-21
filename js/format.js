(function () {
  window.App = window.App || {};

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatWon(value) {
    var n = App.Money.roundWon(value);
    var sign = n < 0 ? "-" : "";
    return sign + Math.abs(n).toLocaleString("ko-KR") + "원";
  }

  function formatWonAbout(value) {
    var n = App.Money.roundWon(value);
    var abs = Math.abs(n);
    if (abs >= 100000000) {
      var eok = abs / 100000000;
      var text = eok >= 10 ? eok.toFixed(1) : eok.toFixed(2);
      text = text.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
      return (n < 0 ? "-" : "") + "약 " + text + "억원";
    }
    if (abs >= 10000) {
      return (n < 0 ? "-" : "") + "약 " + Math.round(abs / 10000).toLocaleString("ko-KR") + "만원";
    }
    return formatWon(n);
  }

  function formatPct(value) {
    if (value === null || value === undefined) return "—";
    var n = App.Money.toSafeNumber(value);
    if (!Number.isFinite(n)) return "—";
    return (n * 100).toFixed(1) + "%";
  }

  function withComma(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function formatGrouped(value) {
    var n = App.Money.roundWon(value);
    var sign = n < 0 ? "-" : "";
    return sign + withComma(Math.abs(n));
  }

  function formatInputNumber(value) {
    if (value === "" || value === null || value === undefined) return "";
    return formatGrouped(value);
  }

  function formatTypingGrouped(raw) {
    var s = String(raw == null ? "" : raw);
    var negative = /^\s*-/.test(s.replace(/,/g, ""));
    var digits = s.replace(/[^\d]/g, "");
    if (digits === "") return negative ? "-" : "";
    var n = Number(digits);
    if (!Number.isFinite(n)) return "";
    return (negative ? "-" : "") + withComma(n);
  }

  function formatCount(value, category) {
    var n = App.Money.toSafeNumber(value);
    if (!n) return "—";
    var unit = "회";
    if (category && App.episodeFields) {
      unit = App.episodeFields(category).count === "횟수" ? "건" : "회";
    }
    return n.toLocaleString("ko-KR") + unit;
  }

  function formatMonthYyMm(yyyyMm) {
    var p = App.Month.parseMonth(yyyyMm);
    if (!p) return "";
    var yy = String(p.year % 100);
    if (yy.length < 2) yy = "0" + yy;
    var mm = p.month < 10 ? "0" + p.month : String(p.month);
    return yy + "-" + mm;
  }

  function formatMonthIso(yyyyMm) {
    return App.Month.normalizeMonth(yyyyMm) || "";
  }

  function formatMonthShort(yyyyMm) {
    var p = App.Month.parseMonth(yyyyMm);
    if (!p) return formatMonthIso(yyyyMm);
    return p.month + "월";
  }

  function formatLedgerCell(value, showZero) {
    var n = App.Money.roundWon(value);
    if (!n && !showZero) return "";
    return formatGrouped(n);
  }

  App.Format = {
    escapeHtml: escapeHtml,
    formatWon: formatWon,
    formatWonAbout: formatWonAbout,
    formatPct: formatPct,
    formatCount: formatCount,
    formatInputNumber: formatInputNumber,
    formatGrouped: formatGrouped,
    formatTypingGrouped: formatTypingGrouped,
    formatMonthYyMm: formatMonthYyMm,
    formatMonthIso: formatMonthIso,
    formatMonthShort: formatMonthShort,
    formatLedgerCell: formatLedgerCell
  };
})();
