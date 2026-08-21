(function () {
  window.App = window.App || {};

  function toSafeNumber(value) {
    if (value === null || value === undefined || value === "") return 0;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : 0;
    }
    var s = String(value).replace(/,/g, "").replace(/원/g, "").replace(/%/g, "").trim();
    if (s === "" || s === "-" || s === ".") return 0;
    var n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  function roundWon(value) {
    return Math.round(toSafeNumber(value));
  }

  function toRatio(value) {
    var n = toSafeNumber(value);
    if (n > 1 && n <= 100) return n / 100;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
  }

  function clampPercentInput(value) {
    var n = toSafeNumber(value);
    if (n < 0) return 0;
    if (n > 100) return 100;
    return n;
  }

  function sumBy(items, fn) {
    var list = items || [];
    var total = 0;
    for (var i = 0; i < list.length; i++) {
      total += roundWon(fn(list[i], i));
    }
    return total;
  }

  App.Money = {
    toSafeNumber: toSafeNumber,
    roundWon: roundWon,
    toRatio: toRatio,
    clampPercentInput: clampPercentInput,
    sumBy: sumBy
  };
})();
