(function () {
  window.App = window.App || {};

  function uid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function taxSettings() {
    return {
      year: 2027,
      mode: "corporate",
      cashOutMonth: null,
      cashOutMode: "none",
      localTaxRate: 0.10,
      liquidationTaxRate: 0.154,
      lossCarryforward: {
        apply: true,
        openingBalance: 0,
        limitRate: 1
      },
      adjustments: [],
      corporateBrackets: [
        { upTo: 200000000, rate: 0.10, deduction: 0 },
        { upTo: 20000000000, rate: 0.20, deduction: 20000000 },
        { upTo: 300000000000, rate: 0.22, deduction: 420000000 },
        { upTo: Infinity, rate: 0.25, deduction: 9420000000 }
      ],
      incomeBrackets: [
        { upTo: 14000000, rate: 0.06, deduction: 0 },
        { upTo: 50000000, rate: 0.15, deduction: 1260000 },
        { upTo: 88000000, rate: 0.24, deduction: 5760000 },
        { upTo: 150000000, rate: 0.35, deduction: 15440000 },
        { upTo: 300000000, rate: 0.38, deduction: 19940000 },
        { upTo: 500000000, rate: 0.4, deduction: 25940000 },
        { upTo: 1000000000, rate: 0.42, deduction: 35940000 },
        { upTo: Infinity, rate: 0.45, deduction: 65940000 }
      ]
    };
  }

  function toCount(value) {
    var n = Math.round(App.Money.toSafeNumber(value));
    return n < 0 ? 0 : n;
  }

  function defaultBaseRates() {
    return {
      ad: { months6: 0, months12: 0, count6: 0, count12: 0 },
      seeding: { perEvent: 0, count: 0 },
      pictorial: { perEvent: 0, count: 0 },
      magazine: { perEvent: 0, count: 0 },
      event: { perEvent: 0, count: 0 },
      ambassador: { months6: 0, months12: 0, count6: 0, count12: 0 }
    };
  }

  function normalizeCategoryId(value) {
    var raw = String(value || "").trim();
    if (!raw) return "";
    var compact = raw.replace(/\s+/g, "").toLowerCase();
    var aliases = {
      "tvcf": "ad",
      "cf": "ad",
      "광고": "ad",
      "광고a": "ad",
      "드라마": "drama",
      "ott": "ott",
      "ott시리즈": "ott",
      "영화": "movie",
      "예능": "variety",
      "공연": "performance",
      "기타작품": "other",
      "시딩": "seeding",
      "제품시딩": "seeding",
      "유가화보": "pictorial",
      "화보": "pictorial",
      "매거진": "magazine",
      "행사": "event",
      "브랜드행사": "event",
      "앰버서더": "ambassador",
      "브랜드앰버서더": "ambassador",
      "기타영업": "salesOther"
    };
    if (aliases[compact]) return aliases[compact];
    var cats = App.Categories || [];
    for (var i = 0; i < cats.length; i++) {
      if (cats[i].id === raw) return cats[i].id;
      if (String(cats[i].label || "").replace(/\s+/g, "").toLowerCase() === compact) return cats[i].id;
    }
    return raw;
  }

  function rateRowById(id) {
    return (App.RateRows || []).filter(function (r) { return r.id === id; })[0] || null;
  }

  function nestGet(obj, key) {
    return String(key || "").split(".").reduce(function (acc, part) {
      return acc == null ? acc : acc[part];
    }, obj);
  }

  function getBaseRate(rates, row) {
    return App.Money.roundWon(nestGet(rates || {}, row && row.rateKey));
  }

  function getExpectedCount(rates, row) {
    return toCount(nestGet(rates || {}, row && row.countKey));
  }

  function expectedRowTotal(rates, row) {
    return App.Money.roundWon(getBaseRate(rates, row) * getExpectedCount(rates, row));
  }

  function expectedGroupTotals(rates) {
    var groups = [];
    var seen = {};
    (App.RateRows || []).forEach(function (row) {
      if (seen[row.group]) {
        seen[row.group].total += expectedRowTotal(rates, row);
        return;
      }
      var item = { id: row.group, label: row.label, unit: row.unit, total: expectedRowTotal(rates, row) };
      seen[row.group] = item;
      groups.push(item);
    });
    var grand = 0;
    groups.forEach(function (g) { grand += g.total; });
    return { groups: groups, grand: App.Money.roundWon(grand) };
  }

  function ensureBaseRates(state) {
    if (!state || typeof state !== "object") return state;
    if (!state.profile || typeof state.profile !== "object") state.profile = {};
    var fallback = defaultBaseRates();
    var raw = state.profile.baseRates;
    if (!raw || typeof raw !== "object") raw = {};
    function moneyField(obj, key, fallbackVal) {
      return App.Money.roundWon(obj && obj[key] != null ? obj[key] : fallbackVal);
    }
    function countField(obj, key, fallbackVal) {
      return toCount(obj && obj[key] != null ? obj[key] : fallbackVal);
    }
    var ad = raw.ad && typeof raw.ad === "object" ? raw.ad : {};
    var seeding = raw.seeding && typeof raw.seeding === "object" ? raw.seeding : {};
    var pictorial = raw.pictorial && typeof raw.pictorial === "object" ? raw.pictorial : {};
    var magazine = raw.magazine && typeof raw.magazine === "object" ? raw.magazine : {};
    var event = raw.event && typeof raw.event === "object" ? raw.event : {};
    var ambassador = raw.ambassador && typeof raw.ambassador === "object" ? raw.ambassador : {};
    state.profile.baseRates = {
      ad: {
        months6: moneyField(ad, "months6", fallback.ad.months6),
        months12: moneyField(ad, "months12", fallback.ad.months12),
        count6: countField(ad, "count6", fallback.ad.count6),
        count12: countField(ad, "count12", fallback.ad.count12)
      },
      seeding: {
        perEvent: moneyField(seeding, "perEvent", fallback.seeding.perEvent),
        count: countField(seeding, "count", fallback.seeding.count)
      },
      pictorial: {
        perEvent: moneyField(pictorial, "perEvent", fallback.pictorial.perEvent),
        count: countField(pictorial, "count", fallback.pictorial.count)
      },
      magazine: {
        perEvent: moneyField(magazine, "perEvent", fallback.magazine.perEvent),
        count: countField(magazine, "count", fallback.magazine.count)
      },
      event: {
        perEvent: moneyField(event, "perEvent", fallback.event.perEvent),
        count: countField(event, "count", fallback.event.count)
      },
      ambassador: {
        months6: moneyField(ambassador, "months6", fallback.ambassador.months6),
        months12: moneyField(ambassador, "months12", fallback.ambassador.months12),
        count6: countField(ambassador, "count6", fallback.ambassador.count6),
        count12: countField(ambassador, "count12", fallback.ambassador.count12)
      }
    };
    return state;
  }

  function normalizePlanPayment(item) {
    if (!item || typeof item !== "object") return null;
    var month = App.Month.normalizeMonth(item.expectedMonth);
    return {
      id: item.id || uid(),
      label: item.label || "지급",
      inputMode: item.inputMode === "amount" ? "amount" : "percent",
      amount: App.Money.roundWon(item.amount),
      percentage: App.Money.toSafeNumber(item.percentage),
      expectedMonth: month,
      actualDate: item.actualDate || null,
      paymentStatus: item.paymentStatus || "expected"
    };
  }

  function normalizeSalesPlan(item) {
    if (!item || typeof item !== "object") return null;
    item.category = normalizeCategoryId(item.category);
    var row = rateRowById(item.rateId);
    if (!row && item.category) {
      row = (App.RateRows || []).filter(function (r) {
        return r.category === item.category && (r.term || null) === (item.term || null);
      })[0];
    }
    var month = App.Month.normalizeMonth(item.month);
    var out = {
      id: item.id || uid(),
      rateId: item.rateId || (row && row.id) || "",
      category: item.category || (row && row.category) || "other",
      term: item.term != null ? item.term : (row && row.term) || null,
      name: item.name == null ? ((row && row.planName) || "계획") : item.name,
      amount: App.Money.roundWon(item.amount),
      month: month,
      includeInBudget: !!item.includeInBudget,
      planStatus: item.planStatus === "negotiating" || item.planStatus === "confirmed" || item.planStatus === "scheduled"
        ? item.planStatus
        : "planned",
      converted: !!item.converted,
      convertedProjectId: item.convertedProjectId || null
    };
    if (Array.isArray(item.payments)) {
      out.payments = item.payments.map(normalizePlanPayment).filter(function (p) { return !!p; });
    }
    return out;
  }

  function ensureSalesPlans(state) {
    if (!state || typeof state !== "object") return state;
    var list = Array.isArray(state.salesPlans) ? state.salesPlans : [];
    list.forEach(function (item, i) {
      var n = normalizeSalesPlan(item);
      if (n) list[i] = n;
    });
    state.salesPlans = list.filter(function (p) { return !!p; });
    return state;
  }

  function normalizeRevenueFee(item) {
    if (!item || typeof item !== "object") return null;
    var category = (item.category === "agency" || item.category === "project") ? "agency" : "sga";
    return {
      id: item.id || uid(),
      name: item.name || "",
      basis: item.basis || "totalRevenue",
      revenueScope: item.revenueScope || item.basis || "totalRevenue",
      rate: App.Money.toRatio(item.rate),
      category: category,
      include: item.include !== false
    };
  }

  function newRevenueFee() {
    return {
      id: uid(),
      name: "",
      basis: "totalRevenue",
      revenueScope: "totalRevenue",
      rate: 0,
      category: "sga",
      include: true
    };
  }

  function defaultRevenueFees() {
    return [
      { id: uid(), name: "써니스", basis: "totalRevenue", revenueScope: "totalRevenue", rate: 0.05, category: "sga", include: true },
      { id: uid(), name: "메리디안", basis: "totalRevenue", revenueScope: "totalRevenue", rate: 0.15, category: "agency", include: true }
    ];
  }

  function isBlankRevenueFee(item) {
    if (!item || typeof item !== "object") return true;
    return !String(item.name || "").trim() &&
      !App.Money.toSafeNumber(item.rate) &&
      (item.category === undefined || item.category === "" || item.category === "sga") &&
      item.include !== false;
  }

  function isLegacyBlankRevenueFeeList(list) {
    return Array.isArray(list) && list.length > 0 && list.every(isBlankRevenueFee);
  }

  function ensureRevenueFees(state) {
    if (!state || typeof state !== "object") return state;
    if (!state.settings || typeof state.settings !== "object") state.settings = {};
    var userCleared = state.settings.revenueFeesUserCleared === true;
    if (!Array.isArray(state.revenueFees) || isLegacyBlankRevenueFeeList(state.revenueFees) ||
        (state.revenueFees.length === 0 && !userCleared)) {
      state.revenueFees = defaultRevenueFees();
      return state;
    }
    state.revenueFees = state.revenueFees.map(normalizeRevenueFee).filter(function (f) { return !!f; });
    return state;
  }

  function validSupportGroup(value) {
    return value === "daily" || value === "selfCare" || value === "production";
  }

  function validSupportCalcMode(value) {
    return value === "monthlyFixed" || value === "perPersonMonth" || value === "perOccurrence" ||
      value === "perProject" || value === "directAmount";
  }

  function validSupportCostClass(value) {
    return value === "sga" || value === "project";
  }

  function validSupportPayer(value) {
    return value === "company" || value === "actor" || value === "share";
  }

  function clampShareRate(value) {
    var n = App.Money.toRatio(value);
    if (n > 1) n = 1;
    if (n < 0) n = 0;
    return n;
  }

  function payerFromShareRate(rate) {
    if (rate === 0) return "actor";
    if (rate === 1) return "company";
    return "share";
  }

  function shareRateFromPayer(payer, fallbackRate) {
    if (payer === "actor") return 0;
    if (payer === "company") return 1;
    return clampShareRate(fallbackRate);
  }

  function syncSupportPolicyPayer(item) {
    if (!item || typeof item !== "object") return item;
    if (validSupportPayer(item.soloPayer) && item.soloPayer !== "share") {
      item.soloCompanyShareRate = shareRateFromPayer(item.soloPayer, item.soloCompanyShareRate);
    } else {
      item.soloCompanyShareRate = clampShareRate(item.soloCompanyShareRate != null ? item.soloCompanyShareRate : 1);
      item.soloPayer = payerFromShareRate(item.soloCompanyShareRate);
    }
    if (validSupportPayer(item.exclusivePayer) && item.exclusivePayer !== "share") {
      item.exclusiveCompanyShareRate = shareRateFromPayer(item.exclusivePayer, item.exclusiveCompanyShareRate);
    } else {
      item.exclusiveCompanyShareRate = clampShareRate(
        item.exclusiveCompanyShareRate != null ? item.exclusiveCompanyShareRate : 1
      );
      item.exclusivePayer = payerFromShareRate(item.exclusiveCompanyShareRate);
    }
    return item;
  }

  var DEFAULT_LUNCH_TRUCK_UNIT_AMOUNT = 5000000;

  function supportPolicyTemplate(extra) {
    var item = {
      id: "",
      name: "",
      group: "selfCare",
      calcMode: "monthlyFixed",
      unitAmount: 0,
      quantity: 1,
      include: true,
      startMonth: null,
      endMonth: null,
      costClass: "sga",
      separateFromProjectExpense: true,
      soloPayer: "company",
      exclusivePayer: "company",
      soloCompanyShareRate: 1,
      exclusiveCompanyShareRate: 1,
      note: ""
    };
    return Object.assign(item, extra || {});
  }

  function defaultSupportPolicies() {
    return [
      supportPolicyTemplate({ id: "sp-vehicle-rent", name: "차량 렌트료", group: "daily", calcMode: "monthlyFixed", costClass: "sga", include: true }),
      supportPolicyTemplate({ id: "sp-vehicle-insurance", name: "차량 보험료", group: "daily", calcMode: "monthlyFixed", costClass: "sga", include: true }),
      supportPolicyTemplate({ id: "sp-vehicle-tax", name: "자동차세", group: "daily", calcMode: "monthlyFixed", costClass: "sga", include: true }),
      supportPolicyTemplate({ id: "sp-acting-class", name: "연기수업료", group: "selfCare", calcMode: "monthlyFixed", costClass: "sga", include: true }),
      supportPolicyTemplate({ id: "sp-pt", name: "PT비", group: "selfCare", calcMode: "monthlyFixed", costClass: "sga", include: true }),
      supportPolicyTemplate({ id: "sp-massage", name: "경락 / 마사지", group: "selfCare", calcMode: "monthlyFixed", costClass: "sga", include: true }),
      supportPolicyTemplate({ id: "sp-dermatology", name: "피부과 / 피부관리", group: "selfCare", calcMode: "monthlyFixed", costClass: "sga", include: true }),
      supportPolicyTemplate({ id: "sp-props", name: "소품비", group: "selfCare", calcMode: "monthlyFixed", costClass: "sga", include: true }),
      supportPolicyTemplate({ id: "sp-styling", name: "스타일링비", group: "selfCare", calcMode: "monthlyFixed", costClass: "sga", include: true }),
      supportPolicyTemplate({
        id: "sp-lunch-truck", name: "밥차", group: "production", calcMode: "perOccurrence",
        costClass: "project", include: true, unitAmount: DEFAULT_LUNCH_TRUCK_UNIT_AMOUNT
      })
    ];
  }

  var SUPPORT_CATALOG_ORDER = [
    "sp-vehicle-rent", "sp-vehicle-insurance", "sp-vehicle-tax",
    "sp-acting-class", "sp-pt", "sp-massage", "sp-dermatology", "sp-props", "sp-styling", "sp-lunch-truck"
  ];
  var SUPPORT_CATALOG_IDS = {};
  SUPPORT_CATALOG_ORDER.forEach(function (id) { SUPPORT_CATALOG_IDS[id] = true; });

  var RETIRED_SUPPORT_IDS = {
    "sp-toll-parking": true,
    "sp-actor-transport": true,
    "sp-set-meal": true,
    "sp-set-other": true,
    "sp-shoot-transport": true,
    "sp-shoot-travel": true,
    "sp-on-set-meal": true,
    "sp-production-other": true,
    "sp-actor-meal": true,
    "sp-actor-fuel": true
  };
  var RETIRED_SUPPORT_NAME_KEYS = {
    "통행료/주차비": true,
    "배우이동비": true,
    "현장식비": true,
    "촬영이동비": true,
    "기타현장지원비": true
  };

  function supportNameKey(name) {
    return String(name || "").replace(/\s+/g, "").replace(/·/g, "/");
  }

  function isSupportCatalogId(id) {
    return !!SUPPORT_CATALOG_IDS[id];
  }

  function isRetiredSupportPolicy(item) {
    if (!item) return false;
    if (RETIRED_SUPPORT_IDS[item.id]) return true;
    return !!RETIRED_SUPPORT_NAME_KEYS[supportNameKey(item.name)];
  }

  function resolveSupportInclude(item) {
    if (!item) return false;
    if (item.include === true || item.included === true) return true;
    if (item.include === false || item.included === false) return false;
    return isSupportCatalogId(item.id);
  }

  function normalizeSupportPolicy(item) {
    if (!item || typeof item !== "object") return null;
    var quantity = Math.round(App.Money.toSafeNumber(item.quantity != null ? item.quantity : 1));
    if (quantity < 0) quantity = 0;
    var out = {
      id: item.id || uid(),
      name: item.name == null ? "" : String(item.name),
      group: validSupportGroup(item.group) ? item.group : "selfCare",
      calcMode: validSupportCalcMode(item.calcMode) ? item.calcMode : "monthlyFixed",
      unitAmount: App.Money.roundWon(item.unitAmount),
      quantity: quantity || 1,
      include: resolveSupportInclude(item),
      startMonth: App.Month.normalizeMonth(item.startMonth),
      endMonth: App.Month.normalizeMonth(item.endMonth),
      costClass: validSupportCostClass(item.costClass) ? item.costClass : "sga",
      separateFromProjectExpense: item.separateFromProjectExpense !== false,
      soloPayer: validSupportPayer(item.soloPayer) ? item.soloPayer : null,
      exclusivePayer: validSupportPayer(item.exclusivePayer) ? item.exclusivePayer : null,
      soloCompanyShareRate: item.soloCompanyShareRate,
      exclusiveCompanyShareRate: item.exclusiveCompanyShareRate,
      note: item.note == null ? "" : String(item.note)
    };
    if (out.include !== true) out.include = false;
    if (out.id === "sp-lunch-truck") {
      out.unitAmountUserSet = item.unitAmountUserSet === true;
      if (!out.unitAmountUserSet && !out.unitAmount) {
        out.unitAmount = DEFAULT_LUNCH_TRUCK_UNIT_AMOUNT;
      }
    }
    return syncSupportPolicyPayer(out);
  }

  function newSupportPolicy() {
    return supportPolicyTemplate({
      id: uid(),
      name: "",
      group: "selfCare",
      calcMode: "monthlyFixed",
      include: true,
      costClass: "sga"
    });
  }

  var VEHICLE_SUPPORT_IDS = ["sp-vehicle-rent", "sp-vehicle-insurance", "sp-vehicle-tax"];
  var VEHICLE_SPLIT_NEW_IDS = ["sp-vehicle-rent", "sp-vehicle-insurance"];

  function isVehicleSupportPolicy(item) {
    if (!item) return false;
    if (VEHICLE_SUPPORT_IDS.indexOf(item.id) >= 0) return true;
    return /차량\s*렌트|주유|차량\s*보험|자동차\s*보험|자동차\s*세/.test(item.name || "");
  }

  var COST_TAB_EDITABLE_SUPPORT_IDS = { "sp-props": true, "sp-styling": true };

  function isCostTabEditableSupportPolicy(item) {
    if (!item) return false;
    if (isRetiredSupportPolicy(item) || isVehicleSupportPolicy(item)) return false;
    if (COST_TAB_EDITABLE_SUPPORT_IDS[item.id]) return true;
    if (!isSupportCatalogId(item.id) && (item.costClass || "sga") === "sga") return true;
    return false;
  }

  function sortSupportPolicies(list) {
    var rank = {};
    SUPPORT_CATALOG_ORDER.forEach(function (id, i) { rank[id] = i; });
    return (list || []).slice().sort(function (a, b) {
      var ra = rank[a.id];
      var rb = rank[b.id];
      if (ra == null && rb == null) return 0;
      if (ra == null) return 1;
      if (rb == null) return -1;
      return ra - rb;
    });
  }

  function migrateVehicleSupportSplit(list) {
    var byId = {};
    list.forEach(function (item) { byId[item.id] = item; });
    VEHICLE_SPLIT_NEW_IDS.forEach(function (id) {
      if (byId[id]) return;
      var extra = { id: id, group: "daily", calcMode: "monthlyFixed", costClass: "sga", include: true };
      if (id === "sp-vehicle-rent") extra.name = "차량 렌트료";
      if (id === "sp-vehicle-insurance") extra.name = "차량 보험료";
      list.push(normalizeSupportPolicy(supportPolicyTemplate(extra)));
    });
    return sortSupportPolicies(list);
  }

  function injectMissingCatalogPolicies(list) {
    var byId = {};
    list.forEach(function (item) { byId[item.id] = item; });
    defaultSupportPolicies().forEach(function (preset) {
      if (byId[preset.id]) return;
      list.push(normalizeSupportPolicy(preset));
    });
    return list;
  }

  function overlappingVehicleOpex(state) {
    var patterns = /차량\s*렌트|차량렌트|차량\s*보험|자동차\s*보험/;
    return ((state && state.recurringExpenses) || []).filter(function (item) {
      if (!item || item.include === false) return false;
      return patterns.test(item.name || "");
    });
  }

  function supportVehicleHasAmount(state) {
    return ((state && state.vehicles) || []).some(function (v) {
      return v && v.include !== false &&
        (App.Money.toSafeNumber(v.monthlyRent) > 0 || App.Money.toSafeNumber(v.monthlyInsurance) > 0);
    });
  }

  function ensureSupportPolicies(state) {
    if (!state || typeof state !== "object") return state;
    if (!state.settings || typeof state.settings !== "object") state.settings = {};
    if (!Array.isArray(state.settings.supportPolicies)) {
      state.settings.supportPolicies = defaultSupportPolicies();
      return state;
    }
    var raw = state.settings.supportPolicies;
    var hadRetired = raw.some(isRetiredSupportPolicy);
    var normalized = raw.map(normalizeSupportPolicy).filter(function (item) {
      return !!item && !isRetiredSupportPolicy(item);
    });
    if (hadRetired) {
      injectMissingCatalogPolicies(normalized);
      normalized.forEach(function (item) {
        if (isSupportCatalogId(item.id)) item.include = true;
      });
    } else {
      var beforeIds = {};
      normalized.forEach(function (item) { beforeIds[item.id] = true; });
      injectMissingCatalogPolicies(normalized);
      normalized.forEach(function (item) {
        if (!beforeIds[item.id] && isSupportCatalogId(item.id)) item.include = true;
      });
    }
    state.settings.supportPolicies = migrateVehicleSupportSplit(normalized);
    return state;
  }

  function defaultPersonalTaxSettings(kind) {
    return {
      mode: "auto",
      manualTaxAmount: 0,
      effectiveRate: 0,
      year: 2026,
      incomeType: kind === "exclusiveContract" ? "business" : "earned",
      useLinkedIncome: true,
      attributedIncome: 0,
      additionalIncome: 0,
      necessaryExpenses: 0,
      otherAdjustment: 0,
      incomeDeduction: 0,
      taxCredit: 0,
      prepaidTax: 0,
      withholdingTax: 0
    };
  }

  function defaultPersonalTaxCommon(yearHint) {
    return {
      year: yearHint || 2026,
      mode: "auto"
    };
  }

  function normalizePersonalTaxCommon(raw, soloTax, exTax, yearHint) {
    raw = raw && typeof raw === "object" ? raw : {};
    var mode = raw.mode;
    if (mode !== "auto" && mode !== "rate" && mode !== "manual") {
      if (exTax && soloTax && exTax.mode === soloTax.mode) mode = exTax.mode;
      else if (exTax && exTax.mode) mode = exTax.mode;
      else if (soloTax && soloTax.mode) mode = soloTax.mode;
      else mode = "auto";
    }
    var year = Number(raw.year);
    if (!year || year < 2000 || year > 2100) {
      year = (exTax && Number(exTax.year)) || (soloTax && Number(soloTax.year)) || yearHint || 2026;
    }
    return { year: year, mode: mode };
  }

  function applyPersonalTaxCommon(state) {
    ensureScenarioSettings(state);
    var common = state.settings.personalTaxCommon;
    if (!common) return state;
    ["soloAgency", "exclusiveContract"].forEach(function (id) {
      var tax = state.settings.scenarios[id] && state.settings.scenarios[id].personalTax;
      if (!tax) return;
      tax.year = common.year;
      tax.mode = common.mode;
    });
    return state;
  }

  function personalTaxForScenario(state, id) {
    ensureScenarioSettings(state);
    var sc = state.settings.scenarios[id];
    return (sc && sc.personalTax) || defaultPersonalTaxSettings(id);
  }

  function defaultCostBurdenRules() {
    return {
      projectDirect: "deductBeforeSplit",
      projectExpense: "company",
      lunchTruck: "company",
      revenueLinkedFees: "deductBeforeSplit",
      payroll: "company",
      opex: "company",
      startup: "company",
      assetsAndDeposits: "company",
      actorPersonalCosts: "actor"
    };
  }

  function defaultScenarioSettings() {
    return {
      personalTaxCommon: defaultPersonalTaxCommon(),
      scenarioComparison: {
        enabledScenarioIds: ["soloAgency", "exclusiveContract"]
      },
      scenarios: {
        soloAgency: {
          label: "1인 기획사",
          usesCurrentOperatingModel: true,
          ownerPayout: {
            salaryEmployeeId: null,
            bonusAmount: 0,
            bonusMonth: null,
            dividendMode: "rate",
            dividendAmount: 0,
            dividendRate: 0.20,
            dividendOn: true,
            dividendMonth: null,
            profitShareWorkRate: 0,
            profitShareSalesRate: 0
          },
          personalTax: defaultPersonalTaxSettings("soloAgency")
        },
        exclusiveContract: {
          label: "기존 회사 전속",
          companyShareRate: 0.30,
          actorShareRate: 0.70,
          costBurdenRules: defaultCostBurdenRules(),
          actorPersonalCosts: defaultActorPersonalCosts(),
          actorPersonalCatalogRemoved: [],
          personalTax: defaultPersonalTaxSettings("exclusiveContract")
        }
      }
    };
  }

  function defaultActorPersonalCosts() {
    return [
      { id: "apc-hair", name: "헤어", unitAmount: 100000, quantity: 1, include: true },
      { id: "apc-makeup", name: "메이크업", unitAmount: 100000, quantity: 1, include: true },
      { id: "apc-styling", name: "스타일링", unitAmount: 500000, quantity: 1, include: true }
    ];
  }

  var ACTOR_PERSONAL_CATALOG_IDS = { "apc-hair": true, "apc-makeup": true, "apc-styling": true };

  function isActorPersonalCatalogId(id) {
    return !!ACTOR_PERSONAL_CATALOG_IDS[id];
  }

  function normalizeActorPersonalCatalogRemoved(list) {
    if (!Array.isArray(list)) return [];
    var seen = {};
    var out = [];
    list.forEach(function (id) {
      var key = String(id || "");
      if (!isActorPersonalCatalogId(key) || seen[key]) return;
      seen[key] = true;
      out.push(key);
    });
    return out;
  }

  function normalizeActorPersonalCost(item) {
    if (!item || typeof item !== "object") return null;
    var qty = item.quantity == null || item.quantity === "" ? 1 : Math.round(App.Money.toSafeNumber(item.quantity));
    if (qty < 0) qty = 0;
    var hasUnit = item.unitAmount != null && item.unitAmount !== "";
    var unit = App.Money.roundWon(hasUnit ? item.unitAmount : item.amount);
    return {
      id: item.id || uid(),
      name: item.name || "",
      unitAmount: unit,
      quantity: qty,
      amount: App.Money.roundWon(unit * qty),
      include: item.include !== false
    };
  }

  function normalizeActorPersonalCosts(list) {
    if (!Array.isArray(list)) return [];
    return list.map(normalizeActorPersonalCost).filter(function (item) { return !!item; });
  }

  function actorPersonalCostAmount(item) {
    var norm = normalizeActorPersonalCost(item);
    if (!norm || item.include === false) return 0;
    return norm.amount;
  }

  function ensureActorPersonalCostList(rawList, removed) {
    var list = normalizeActorPersonalCosts(rawList);
    var removedMap = {};
    normalizeActorPersonalCatalogRemoved(removed).forEach(function (id) { removedMap[id] = true; });
    var have = {};
    list.forEach(function (it) { if (it && it.id) have[it.id] = true; });
    defaultActorPersonalCosts().forEach(function (seed) {
      if (removedMap[seed.id] || have[seed.id]) return;
      list.push(normalizeActorPersonalCost(seed));
    });
    return list;
  }

  function newActorPersonalCost() {
    return { id: uid(), name: "", unitAmount: 0, quantity: 1, amount: 0, include: true };
  }

  function normalizePersonalTaxMode(raw) {
    if (raw === "auto" || raw === "rate" || raw === "manual") return raw;
    return "auto";
  }

  function normalizePersonalTax(raw, kind, yearHint) {
    raw = raw && typeof raw === "object" ? raw : {};
    var fallback = defaultPersonalTaxSettings(kind);
    var year = Number(raw.year);
    if (!year || year < 2000 || year > 2100) year = yearHint || fallback.year;
    var incomeType = raw.incomeType;
    if (incomeType !== "earned" && incomeType !== "business" && incomeType !== "mixed" && incomeType !== "other") {
      incomeType = fallback.incomeType;
    }
    return {
      mode: raw.mode != null && String(raw.mode) !== "" ? normalizePersonalTaxMode(raw.mode) : "auto",
      manualTaxAmount: App.Money.roundWon(raw.manualTaxAmount),
      effectiveRate: App.Money.toRatio(raw.effectiveRate),
      year: year,
      incomeType: incomeType,
      useLinkedIncome: raw.useLinkedIncome !== false,
      attributedIncome: App.Money.roundWon(raw.attributedIncome),
      additionalIncome: App.Money.roundWon(raw.additionalIncome),
      necessaryExpenses: App.Money.roundWon(raw.necessaryExpenses),
      otherAdjustment: App.Money.roundWon(raw.otherAdjustment),
      incomeDeduction: App.Money.roundWon(raw.incomeDeduction),
      taxCredit: App.Money.roundWon(raw.taxCredit),
      prepaidTax: App.Money.roundWon(raw.prepaidTax),
      withholdingTax: App.Money.roundWon(raw.withholdingTax)
    };
  }

  function validBurdenRule(value) {
    return value === "company" || value === "actor" || value === "deductBeforeSplit" || value === "ignore";
  }

  function normalizeCostBurdenRules(raw) {
    var base = defaultCostBurdenRules();
    raw = raw && typeof raw === "object" ? raw : {};
    Object.keys(base).forEach(function (key) {
      if (validBurdenRule(raw[key])) base[key] = raw[key];
    });
    base.projectExpense = "company";
    base.lunchTruck = "company";
    return base;
  }

  function normalizeEnabledScenarioIds(settings) {
    var known = { soloAgency: true, exclusiveContract: true };
    var raw = settings && settings.scenarioComparison && settings.scenarioComparison.enabledScenarioIds;
    if (Array.isArray(raw)) {
      var seen = {};
      return raw.filter(function (id) {
        if (!known[id] || seen[id]) return false;
        seen[id] = true;
        return true;
      });
    }
    var out = [];
    var scenarios = (settings && settings.scenarios) || {};
    if (scenarios.soloAgency && scenarios.soloAgency.enabled === false) {
      // Legacy field only. Default is enabled unless explicitly false.
    } else {
      out.push("soloAgency");
    }
    if (scenarios.exclusiveContract && scenarios.exclusiveContract.enabled === false) {
      // Legacy field only. Default is enabled unless explicitly false.
    } else {
      out.push("exclusiveContract");
    }
    return out;
  }

  function ensureScenarioSettings(state) {
    if (!state || typeof state !== "object") return state;
    if (!state.settings || typeof state.settings !== "object") state.settings = {};
    var defaults = defaultScenarioSettings();
    var rawScenarios = state.settings.scenarios && typeof state.settings.scenarios === "object"
      ? state.settings.scenarios
      : {};
    var rawSolo = rawScenarios.soloAgency && typeof rawScenarios.soloAgency === "object" ? rawScenarios.soloAgency : {};
    var rawContract = rawScenarios.exclusiveContract && typeof rawScenarios.exclusiveContract === "object" ? rawScenarios.exclusiveContract : {};
    var rawOwner = rawSolo.ownerPayout && typeof rawSolo.ownerPayout === "object" ? rawSolo.ownerPayout : {};

    var yearHint = 2026;
    var startParsed = App.Month.parseMonth(state.profile && state.profile.startMonth);
    if (startParsed) yearHint = startParsed.year;

    var soloTax = normalizePersonalTax(rawSolo.personalTax, "soloAgency", yearHint);
    var exTax = normalizePersonalTax(rawContract.personalTax, "exclusiveContract", yearHint);
    state.settings.personalTaxCommon = normalizePersonalTaxCommon(
      state.settings.personalTaxCommon,
      soloTax,
      exTax,
      yearHint
    );
    state.settings.scenarioComparison = {
      enabledScenarioIds: normalizeEnabledScenarioIds(state.settings)
    };
    state.settings.scenarios = {
      soloAgency: {
        label: rawSolo.label || defaults.scenarios.soloAgency.label,
        usesCurrentOperatingModel: true,
        ownerPayout: {
          salaryEmployeeId: rawOwner.salaryEmployeeId || null,
          bonusAmount: App.Money.roundWon(rawOwner.bonusAmount),
          bonusMonth: App.Month.normalizeMonth(rawOwner.bonusMonth),
          dividendMode: rawOwner.dividendMode === "rate" ? "rate" : "amount",
          dividendAmount: App.Money.roundWon(rawOwner.dividendAmount),
          dividendRate: App.Money.toRatio(rawOwner.dividendRate),
          dividendOn: rawOwner.dividendOn != null
            ? rawOwner.dividendOn !== false
            : (rawOwner.dividendMode === "rate"
              ? App.Money.toRatio(rawOwner.dividendRate) > 0
              : App.Money.roundWon(rawOwner.dividendAmount) > 0),
          dividendMonth: App.Month.normalizeMonth(rawOwner.dividendMonth),
          profitShareWorkRate: App.Money.toRatio(rawOwner.profitShareWorkRate),
          profitShareSalesRate: App.Money.toRatio(rawOwner.profitShareSalesRate)
        },
        personalTax: soloTax
      },
      exclusiveContract: {
        label: rawContract.label || defaults.scenarios.exclusiveContract.label,
        companyShareRate: App.Money.toRatio(rawContract.companyShareRate != null ? rawContract.companyShareRate : defaults.scenarios.exclusiveContract.companyShareRate),
        actorShareRate: App.Money.toRatio(rawContract.actorShareRate != null ? rawContract.actorShareRate : defaults.scenarios.exclusiveContract.actorShareRate),
        costBurdenRules: normalizeCostBurdenRules(rawContract.costBurdenRules),
        actorPersonalCosts: ensureActorPersonalCostList(
          rawContract.actorPersonalCosts,
          rawContract.actorPersonalCatalogRemoved
        ),
        actorPersonalCatalogRemoved: normalizeActorPersonalCatalogRemoved(rawContract.actorPersonalCatalogRemoved),
        personalTax: exTax
      }
    };
    delete state.settings.analysisMode;
    delete state.settings.splitBasis;
    delete state.settings.scenarios.soloAgency.enabled;
    delete state.settings.scenarios.soloAgency.splitBasis;
    delete state.settings.scenarios.exclusiveContract.enabled;
    delete state.settings.scenarios.exclusiveContract.splitBasis;
    return state;
  }

  function monthIdList(months) {
    return (months || []).map(function (m) {
      return typeof m === "string" ? m : (m && m.month);
    }).filter(Boolean);
  }

  function withholdingAt(amount, nationalRate, combinedRate, label, kind) {
    var gross = App.Money.roundWon(amount);
    if (gross <= 0) {
      return { national: 0, local: 0, total: 0, rate: combinedRate, label: label, kind: kind };
    }
    var national = App.Money.roundWon(gross * nationalRate);
    var local = App.Money.roundWon(national * 0.10);
    return {
      national: national,
      local: local,
      total: App.Money.roundWon(national + local),
      rate: combinedRate,
      label: label,
      kind: kind
    };
  }

  function ownerDividendWithholding(amount) {
    return withholdingAt(amount, 0.14, 0.154, "배당소득세 (15.4%)", "dividend");
  }

  function ownerProfitShareWithholding(amount) {
    return withholdingAt(amount, 0.03, 0.033, "사업소득세 (3.3%)", "business");
  }

  function isDividendOn(payout) {
    payout = payout || {};
    if (payout.dividendOn === false) return false;
    if (payout.dividendOn === true) return true;
    if (payout.dividendMode === "rate") return App.Money.toRatio(payout.dividendRate) > 0;
    return App.Money.roundWon(payout.dividendAmount) > 0;
  }

  function clampMonthToPeriod(month, list) {
    month = App.Month.normalizeMonth(month);
    if (!month || !(list || []).length) return month;
    if (list.indexOf(month) >= 0) return month;
    if (month < list[0]) return list[0];
    return list[list.length - 1];
  }

  function nextMarchMonth(year) {
    return String(Number(year) + 1) + "-03";
  }

  function lastMarchInPeriod(list) {
    var marches = (list || []).filter(function (m) { return String(m).slice(5) === "03"; });
    return marches.length ? marches[marches.length - 1] : null;
  }

  function mergeDividendPayments(payments) {
    var byMonth = {};
    var order = [];
    (payments || []).forEach(function (p) {
      var month = App.Month.normalizeMonth(p && p.month);
      var amount = App.Money.roundWon(p && p.amount);
      if (!month || amount <= 0) return;
      if (!byMonth[month]) {
        byMonth[month] = { month: month, amount: 0, sourceYears: [] };
        order.push(month);
      }
      byMonth[month].amount = App.Money.roundWon(byMonth[month].amount + amount);
      if (p.sourceYear != null && byMonth[month].sourceYears.indexOf(p.sourceYear) < 0) {
        byMonth[month].sourceYears.push(p.sourceYear);
      }
    });
    return order.map(function (month) { return byMonth[month]; });
  }

  function yearOperatingProfit(row, fallback) {
    if (row && row.preTaxProfit != null) return App.Money.roundWon(row.preTaxProfit);
    if (row && row.operatingProfit != null) return App.Money.roundWon(row.operatingProfit);
    return App.Money.roundWon(fallback);
  }

  function dividendYearsFrom(list, byYear) {
    var years = (App.TaxYear && App.TaxYear.yearsFromMonths)
      ? App.TaxYear.yearsFromMonths(list)
      : [];
    if (years.length) return years;
    return byYear ? Object.keys(byYear).map(Number).filter(Boolean).sort(function (a, b) { return a - b; }) : [];
  }

  function resolveOwnerDividend(state, months, ctx) {
    ensureScenarioSettings(state);
    var payout = (((state.settings || {}).scenarios || {}).soloAgency || {}).ownerPayout || {};
    var mode = payout.dividendMode === "rate" ? "rate" : "amount";
    var rate = App.Money.toRatio(payout.dividendRate);
    var on = isDividendOn(payout);
    var list = monthIdList(months);
    var payments = [];
    var yearRows = [];
    ctx = ctx && typeof ctx === "object" ? ctx : {};
    var byYear = ctx.byYear && typeof ctx.byYear === "object" ? ctx.byYear : null;
    var years = dividendYearsFrom(list, byYear);
    var taxParts = ownerDividendWithholding(1);
    if (on && mode === "rate") {
      if (years.length) {
        years.forEach(function (year) {
          var row = (byYear && (byYear[year] || byYear[String(year)])) || {};
          var op = yearOperatingProfit(row, years.length === 1 ? ctx.operatingProfit : 0);
          var base = op > 0 ? op : 0;
          var amount = App.Money.roundWon(base * rate);
          var month = clampMonthToPeriod(nextMarchMonth(year), list);
          yearRows.push({
            year: year,
            operatingProfit: op,
            rate: rate,
            amount: amount,
            taxRate: taxParts.rate,
            taxLabel: taxParts.label,
            month: month
          });
          if (!amount) return;
          payments.push({
            sourceYear: year,
            amount: amount,
            month: month
          });
        });
      } else {
        var base = yearOperatingProfit(null, ctx.operatingProfit != null ? ctx.operatingProfit : ctx.afterTaxNet);
        if (base < 0) base = 0;
        var lump = App.Money.roundWon(base * rate);
        if (lump) {
          payments.push({
            sourceYear: null,
            amount: lump,
            month: clampMonthToPeriod(lastMarchInPeriod(list) || (list.length ? list[list.length - 1] : null), list)
          });
        }
      }
    } else if (on) {
      var amount = App.Money.roundWon(payout.dividendAmount);
      if (amount > 0) {
        var explicit = App.Month.normalizeMonth(payout.dividendMonth);
        var month = explicit && list.indexOf(explicit) >= 0
          ? explicit
          : (lastMarchInPeriod(list) || (list.length ? list[list.length - 1] : explicit));
        payments.push({ sourceYear: null, amount: amount, month: month });
      }
      years.forEach(function (year) {
        var row = (byYear && (byYear[year] || byYear[String(year)])) || {};
        var op = yearOperatingProfit(row, years.length === 1 ? ctx.operatingProfit : 0);
        yearRows.push({
          year: year,
          operatingProfit: op,
          rate: rate,
          amount: 0,
          taxRate: taxParts.rate,
          taxLabel: taxParts.label,
          month: clampMonthToPeriod(nextMarchMonth(year), list)
        });
      });
    } else {
      years.forEach(function (year) {
        var row = (byYear && (byYear[year] || byYear[String(year)])) || {};
        var op = yearOperatingProfit(row, years.length === 1 ? ctx.operatingProfit : 0);
        yearRows.push({
          year: year,
          operatingProfit: op,
          rate: rate,
          amount: 0,
          taxRate: taxParts.rate,
          taxLabel: taxParts.label,
          month: clampMonthToPeriod(nextMarchMonth(year), list)
        });
      });
    }
    payments = mergeDividendPayments(payments);
    var total = App.Money.roundWon(payments.reduce(function (sum, p) { return sum + p.amount; }, 0));
    return {
      amount: total,
      month: payments[0] ? payments[0].month : null,
      payments: payments,
      mode: mode,
      rate: rate,
      years: yearRows
    };
  }

  function setOwnerDividendOn(state, on) {
    ensureScenarioSettings(state);
    var payout = state.settings.scenarios.soloAgency.ownerPayout;
    payout.dividendOn = !!on;
    if (on && payout.dividendMode !== "amount") payout.dividendMode = "rate";
    if (on && payout.dividendMode === "rate" && !App.Money.toRatio(payout.dividendRate)) {
      payout.dividendRate = 0.20;
    }
    return state;
  }

  function workSalesRevenueByYear(state, list) {
    var inPeriod = {};
    (list || []).forEach(function (m) { inPeriod[m] = true; });
    var byYear = {};
    function add(year, kind, amt) {
      year = Number(year);
      if (!year) return;
      if (!byYear[year]) byYear[year] = { work: 0, sales: 0 };
      byYear[year][kind] = App.Money.roundWon(byYear[year][kind] + App.Money.roundWon(amt));
    }
    (state.projects || []).forEach(function (p) {
      if (!p || p.status === "cancelled") return;
      var kind = isSalesCategory(p.category) ? "sales" : "work";
      (p.payments || []).forEach(function (pay) {
        var month = App.Month.normalizeMonth(pay.expectedMonth || pay.month);
        if (!month || !inPeriod[month]) return;
        var amt = App.Engine && App.Engine.resolvePaymentAmount
          ? App.Engine.resolvePaymentAmount(p, pay)
          : App.Money.roundWon(pay.amount);
        add(App.TaxYear ? App.TaxYear.yearOf(month) : Number(String(month).slice(0, 4)), kind, amt);
      });
    });
    return byYear;
  }

  function resolveOwnerProfitShare(state, months) {
    ensureScenarioSettings(state);
    var payout = (((state.settings || {}).scenarios || {}).soloAgency || {}).ownerPayout || {};
    var workRate = App.Money.toRatio(payout.profitShareWorkRate);
    var salesRate = App.Money.toRatio(payout.profitShareSalesRate);
    var list = monthIdList(months);
    var byYear = workSalesRevenueByYear(state, list);
    var years = dividendYearsFrom(list, byYear);
    var workRevenue = 0;
    var salesRevenue = 0;
    var workPayments = [];
    var salesPayments = [];
    years.forEach(function (year) {
      var y = byYear[year] || { work: 0, sales: 0 };
      workRevenue = App.Money.roundWon(workRevenue + y.work);
      salesRevenue = App.Money.roundWon(salesRevenue + y.sales);
      var month = clampMonthToPeriod(nextMarchMonth(year), list);
      var workAmt = App.Money.roundWon(Math.max(0, y.work) * workRate);
      var salesAmt = App.Money.roundWon(Math.max(0, y.sales) * salesRate);
      if (workAmt) workPayments.push({ sourceYear: year, amount: workAmt, month: month });
      if (salesAmt) salesPayments.push({ sourceYear: year, amount: salesAmt, month: month });
    });
    var payments = mergeDividendPayments(workPayments.concat(salesPayments));
    var workAmount = App.Money.roundWon(Math.max(0, workRevenue) * workRate);
    var salesAmount = App.Money.roundWon(Math.max(0, salesRevenue) * salesRate);
    var total = App.Money.roundWon(payments.reduce(function (sum, p) { return sum + p.amount; }, 0));
    return {
      workRevenue: workRevenue,
      salesRevenue: salesRevenue,
      workRate: workRate,
      salesRate: salesRate,
      workAmount: workAmount,
      salesAmount: salesAmount,
      workPayments: workPayments,
      salesPayments: salesPayments,
      amount: total,
      payments: payments,
      tax: ownerProfitShareWithholding(total)
    };
  }

  function setOwnerDividendMode(state, mode) {
    ensureScenarioSettings(state);
    state.settings.scenarios.soloAgency.ownerPayout.dividendMode = mode === "rate" ? "rate" : "amount";
    return state;
  }

  function ownerDividendForMonth(state, month, months, ctx) {
    var resolved = resolveOwnerDividend(state, months, ctx);
    var found = (resolved.payments || []).filter(function (p) { return p.month === month; })[0];
    return found ? found.amount : 0;
  }

  function isScenarioEnabled(state, id) {
    ensureScenarioSettings(state);
    return (state.settings.scenarioComparison.enabledScenarioIds || []).indexOf(id) >= 0;
  }

  function setScenarioEnabled(state, id, enabled) {
    ensureScenarioSettings(state);
    var known = { soloAgency: true, exclusiveContract: true };
    if (!known[id]) return state;
    var on = {};
    (state.settings.scenarioComparison.enabledScenarioIds || []).forEach(function (sid) {
      if (known[sid]) on[sid] = true;
    });
    if (enabled) on[id] = true;
    else delete on[id];
    var out = [];
    if (on.soloAgency) out.push("soloAgency");
    if (on.exclusiveContract) out.push("exclusiveContract");
    state.settings.scenarioComparison.enabledScenarioIds = out;
    return state;
  }

  function derivedSplitBasis(rules) {
    var src = rules && typeof rules === "object" ? rules : {};
    var keys = Object.keys(defaultCostBurdenRules());
    for (var i = 0; i < keys.length; i++) {
      if (src[keys[i]] === "deductBeforeSplit") return "netAfterDeductibleCosts";
    }
    return "grossRevenue";
  }

  function applySplitBasisToggle(state, basis) {
    ensureScenarioSettings(state);
    var rules = state.settings.scenarios.exclusiveContract.costBurdenRules;
    if (basis === "grossRevenue") {
      if (rules.projectDirect === "deductBeforeSplit") rules.projectDirect = "company";
      if (rules.revenueLinkedFees === "deductBeforeSplit") rules.revenueLinkedFees = "company";
    } else {
      rules.projectDirect = "deductBeforeSplit";
      rules.revenueLinkedFees = "deductBeforeSplit";
    }
    return state;
  }

  function normalizeShareRates(state) {
    ensureScenarioSettings(state);
    var contract = state.settings.scenarios.exclusiveContract;
    var company = App.Money.toRatio(contract.companyShareRate);
    if (company > 1) company = 1;
    if (company < 0) company = 0;
    contract.companyShareRate = company;
    contract.actorShareRate = App.Money.toRatio(1 - company);
    return state;
  }

  function ensureDeposits(state) {
    if (!state || typeof state !== "object") return state;
    (state.deposits || []).forEach(function (item) {
      if (!item || typeof item !== "object") return;
      if (item.expectedReturnMonth === undefined) item.expectedReturnMonth = item.returnMonth || null;
      item.expectedReturnMonth = App.Month.normalizeMonth(item.expectedReturnMonth);
      item.returnMonth = App.Month.normalizeMonth(item.returnMonth);
      if (item.returnAmount === undefined) item.returnAmount = null;
      if (item.returned === undefined) item.returned = false;
    });
    return state;
  }

  var VEHICLE_KINDS = [
    { id: "actor", label: "배우 차량" },
    { id: "staff", label: "스텝 차량" },
    { id: "other", label: "기타" }
  ];

  function validVehicleKind(value) {
    return VEHICLE_KINDS.some(function (k) { return k.id === value; });
  }

  function vehicleKindLabel(kind) {
    var row = VEHICLE_KINDS.filter(function (k) { return k.id === kind; })[0];
    return row ? row.label : "기타";
  }

  function isVehicleDepositName(name) {
    var n = String(name || "");
    if (!n || /사무실/.test(n)) return false;
    if (/차량보증금/.test(n)) return true;
    return /보증금/.test(n) && /차량|리무진|렌트/.test(n);
  }

  function displayNameFromVehicleDeposit(name) {
    var n = String(name || "");
    if (/하이리무진/.test(n)) return "하이리무진";
    if (/일반/.test(n)) return "스텝 차량";
    var stripped = n.replace(/^차량보증금_?/, "").trim();
    return stripped || "차량";
  }

  function kindFromVehicleDeposit(name) {
    var n = String(name || "");
    if (/하이리무진|배우/.test(n)) return "actor";
    if (/일반|스텝/.test(n)) return "staff";
    return "other";
  }

  function depositLineAmount(item) {
    if (!item) return 0;
    if (item.actualAmount !== null && item.actualAmount !== undefined && item.actualAmount !== "") {
      return App.Money.roundWon(item.actualAmount);
    }
    if (item.estimatedAmount !== null && item.estimatedAmount !== undefined && item.estimatedAmount !== "") {
      return App.Money.roundWon(item.estimatedAmount);
    }
    var qty = Math.max(App.Money.toSafeNumber(item.qty), 1);
    return App.Money.roundWon(App.Money.toSafeNumber(item.unitPrice) * qty);
  }

  function newVehicle(startMonth) {
    return {
      id: uid(),
      name: "",
      kind: "actor",
      deposit: 0,
      monthlyRent: 0,
      monthlyInsurance: 0,
      startMonth: App.Month.normalizeMonth(startMonth),
      endMonth: null,
      include: true,
      sourceDepositId: null
    };
  }

  function normalizeVehicle(item) {
    if (!item || typeof item !== "object") return null;
    return {
      id: item.id || uid(),
      name: item.name == null ? "" : String(item.name),
      kind: validVehicleKind(item.kind) ? item.kind : "other",
      deposit: App.Money.roundWon(item.deposit),
      monthlyRent: App.Money.roundWon(item.monthlyRent),
      monthlyInsurance: App.Money.roundWon(item.monthlyInsurance),
      startMonth: App.Month.normalizeMonth(item.startMonth),
      endMonth: App.Month.normalizeMonth(item.endMonth),
      include: item.include !== false,
      sourceDepositId: item.sourceDepositId || null
    };
  }

  function vehicleAlreadyMigrated(vehicles, dep) {
    var display = displayNameFromVehicleDeposit(dep && dep.name);
    var amount = depositLineAmount(dep);
    return (vehicles || []).some(function (v) {
      if (!v) return false;
      if (dep && dep.id && v.sourceDepositId === dep.id) return true;
      return v.name === display && App.Money.roundWon(v.deposit) === amount;
    });
  }

  function migrateVehicleDeposits(state) {
    if (!state || typeof state !== "object") return state;
    if (!Array.isArray(state.vehicles)) state.vehicles = [];
    if (!Array.isArray(state.deposits)) state.deposits = [];
    var kept = [];
    state.deposits.forEach(function (dep) {
      if (!dep || !isVehicleDepositName(dep.name)) {
        kept.push(dep);
        return;
      }
      if (!vehicleAlreadyMigrated(state.vehicles, dep)) {
        state.vehicles.push(normalizeVehicle({
          name: displayNameFromVehicleDeposit(dep.name),
          kind: kindFromVehicleDeposit(dep.name),
          deposit: depositLineAmount(dep),
          monthlyRent: 0,
          monthlyInsurance: 0,
          startMonth: dep.month,
          endMonth: null,
          include: dep.include !== false,
          sourceDepositId: dep.id || null
        }));
      }
    });
    state.deposits = kept;
    return state;
  }

  function ensureVehicles(state) {
    if (!state || typeof state !== "object") return state;
    if (!Array.isArray(state.vehicles)) state.vehicles = [];
    state.vehicles = state.vehicles.map(normalizeVehicle).filter(Boolean);
    migrateVehicleDeposits(state);
    return state;
  }

  function vehicleSgaHasAmount(state) {
    return ((state && state.vehicles) || []).some(function (v) {
      return v && v.include !== false &&
        (App.Money.toSafeNumber(v.monthlyRent) > 0 || App.Money.toSafeNumber(v.monthlyInsurance) > 0);
    });
  }

  function vehiclePolicyAmountOverlap(state) {
    var vehicles = (state && state.vehicles) || [];
    var policies = (state && state.settings && state.settings.supportPolicies) || [];
    var vehRent = vehicles.some(function (v) {
      return v && v.include !== false && App.Money.toSafeNumber(v.monthlyRent) > 0;
    });
    var vehIns = vehicles.some(function (v) {
      return v && v.include !== false && App.Money.toSafeNumber(v.monthlyInsurance) > 0;
    });
    var polRent = policies.some(function (p) {
      return p && p.include === true && p.id === "sp-vehicle-rent" && App.Money.toSafeNumber(p.unitAmount) > 0;
    });
    var polIns = policies.some(function (p) {
      return p && p.include === true && p.id === "sp-vehicle-insurance" && App.Money.toSafeNumber(p.unitAmount) > 0;
    });
    return (vehRent && polRent) || (vehIns && polIns);
  }

  function isIncorporationCostName(name) {
    return /등록면허|지방교육|법원|수입증지|법인인감|인감|명판|스탬프|스템프|법무사|대중문화|등록업|인증서|설립/.test(name || "");
  }

  function normalizeSetupCostType(item) {
    if (!item || typeof item !== "object") return "oneTimeBusiness";
    if (item.setupCostType === "incorporation" || item.setupCostType === "oneTimeBusiness") {
      return item.setupCostType;
    }
    return isIncorporationCostName(item.name) ? "incorporation" : "oneTimeBusiness";
  }

  function ensureCorporateSettings(state) {
    if (!state || typeof state !== "object") return state;
    if (!state.settings || typeof state.settings !== "object") state.settings = {};
    if (state.settings.corporateStatus !== "existing" && state.settings.corporateStatus !== "new") {
      state.settings.corporateStatus = "new";
    }
    (state.startupExpenses || []).forEach(function (item) {
      if (!item || typeof item !== "object") return;
      item.setupCostType = normalizeSetupCostType(item);
      if (item.forceInclude === undefined) item.forceInclude = false;
    });
    return state;
  }

  function defaultRevenueExpenseRates() {
    return { work: 0.20, sales: 0.10, appearanceLight: 1.5, appearanceHeavy: 3 };
  }

  function getRevenueExpenseRates(state) {
    var fallback = defaultRevenueExpenseRates();
    var raw = state && state.settings && state.settings.revenueExpenseRates;
    if (!raw || typeof raw !== "object") return fallback;
    return {
      work: App.Money.toRatio(raw.work != null ? raw.work : fallback.work),
      sales: App.Money.toRatio(raw.sales != null ? raw.sales : fallback.sales),
      appearanceLight: App.Money.toSafeNumber(raw.appearanceLight != null ? raw.appearanceLight : fallback.appearanceLight) || fallback.appearanceLight,
      appearanceHeavy: App.Money.toSafeNumber(raw.appearanceHeavy != null ? raw.appearanceHeavy : fallback.appearanceHeavy) || fallback.appearanceHeavy
    };
  }

  function ensureRevenueExpenseRates(state) {
    if (!state || typeof state !== "object") return state;
    if (!state.settings || typeof state.settings !== "object") state.settings = {};
    state.settings.revenueExpenseRates = getRevenueExpenseRates(state);
    return state;
  }

  function newTaxAdjustment(year) {
    return { id: uid(), year: Number(year) || 2027, amount: 0, label: "" };
  }

  function normalizeTaxAdjustments(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(function (item) {
      if (!item || typeof item !== "object") return null;
      return {
        id: item.id || uid(),
        year: Number(item.year) || 2027,
        amount: App.Money.roundWon(item.amount),
        label: item.label || ""
      };
    }).filter(function (item) { return !!item; });
  }

  function normalizeLossCarryforward(raw) {
    raw = raw && typeof raw === "object" ? raw : {};
    var limit = App.Money.toSafeNumber(raw.limitRate);
    if (!Number.isFinite(limit) || limit <= 0) limit = 1;
    if (limit > 1) limit = 1;
    var apply = raw.apply != null ? raw.apply !== false : raw.enabled !== false;
    return {
      apply: apply,
      openingBalance: Math.max(0, App.Money.roundWon(raw.openingBalance)),
      limitRate: limit
    };
  }

  function migrateCorporateBrackets(saved, fallback) {
    if (!Array.isArray(saved) || !saved.length) return fallback;
    if (App.CorporateTax && App.CorporateTax.isCatalogCorporateBrackets &&
        App.CorporateTax.isCatalogCorporateBrackets(saved) &&
        Number(saved[0] && saved[0].rate) === 0.09) {
      return fallback;
    }
    return saved;
  }

  function ensureTaxSettings(state) {
    if (!state || typeof state !== "object") return state;
    if (!state.settings || typeof state.settings !== "object") state.settings = {};
    var fallback = taxSettings();
    var raw = state.settings.tax && typeof state.settings.tax === "object" ? state.settings.tax : {};
    var cashOutMode = raw.cashOutMode === "nextMarch" ? "nextMarch" : "none";
    state.settings.tax = {
      year: Number(raw.year) || fallback.year,
      mode: raw.mode || fallback.mode,
      cashOutMonth: App.Month.normalizeMonth(raw.cashOutMonth) || null,
      cashOutMode: cashOutMode,
      localTaxRate: raw.localTaxRate != null ? App.Money.toSafeNumber(raw.localTaxRate) : fallback.localTaxRate,
      liquidationTaxRate: raw.liquidationTaxRate != null ? App.Money.toSafeNumber(raw.liquidationTaxRate) : fallback.liquidationTaxRate,
      lossCarryforward: normalizeLossCarryforward(raw.lossCarryforward),
      adjustments: normalizeTaxAdjustments(raw.adjustments),
      corporateBrackets: migrateCorporateBrackets(raw.corporateBrackets, fallback.corporateBrackets),
      incomeBrackets: Array.isArray(raw.incomeBrackets) && raw.incomeBrackets.length ? raw.incomeBrackets : fallback.incomeBrackets
    };
    return state;
  }

  function ensureVatSettings(state) {
    if (!state || typeof state !== "object") return state;
    if (!state.settings || typeof state.settings !== "object") state.settings = {};
    var raw = state.settings.vat && typeof state.settings.vat === "object" ? state.settings.vat : {};
    state.settings.vat = {
      on: raw.on !== false,
      rate: (raw.rate !== null && raw.rate !== undefined && raw.rate !== "") ? App.Money.toRatio(raw.rate) : 0.1,
      period: raw.period === "monthly" ? "monthly" : "quarterly",
      filingLagMonths: Math.max(0, Math.round(App.Money.toSafeNumber(
        raw.filingLagMonths !== null && raw.filingLagMonths !== undefined ? raw.filingLagMonths : 1
      )))
    };
    return state;
  }

  function ensureInsuranceRates(state) {
    if (!state || typeof state !== "object") return state;
    if (!state.settings || typeof state.settings !== "object") state.settings = {};
    var raw = state.settings.insuranceRates && typeof state.settings.insuranceRates === "object"
      ? state.settings.insuranceRates : {};
    state.settings.insuranceRates = {
      pensionEmployer: raw.pensionEmployer != null && Math.abs(App.Money.toSafeNumber(raw.pensionEmployer) - 0.045) > 1e-8
        ? App.Money.toSafeNumber(raw.pensionEmployer)
        : 0.0475,
      health: raw.health != null ? App.Money.toSafeNumber(raw.health) : 0.040674,
      employment: raw.employment != null ? App.Money.toSafeNumber(raw.employment) : 0.0115,
      industrialAccident: raw.industrialAccident != null ? App.Money.toSafeNumber(raw.industrialAccident) : 0.009,
      useCaps: raw.useCaps !== false
    };
    return state;
  }

  function appearanceExpenseKind(category) {
    if (category === "ad" || category === "pictorial") return "heavy";
    if (category === "seeding" || category === "event" || category === "ambassador") return "light";
    return "";
  }

  function usesAppearanceExpense(project) {
    if (!project || project.expenseAmountMode === "manual") return false;
    if (project.expenseRateMode === "custom") return false;
    return !!appearanceExpenseKind(project.category);
  }

  function appearanceSessionUnitTotal(state) {
    var fallback = { "apc-hair": 100000, "apc-makeup": 100000, "apc-styling": 500000 };
    var contract = state && state.settings && state.settings.scenarios && state.settings.scenarios.exclusiveContract;
    var items = (contract && contract.actorPersonalCosts) || [];
    var byId = {};
    items.forEach(function (it) {
      if (it && it.id) byId[it.id] = it;
    });
    var total = 0;
    Object.keys(fallback).forEach(function (id) {
      var it = byId[id];
      var unit = it && it.unitAmount != null && it.unitAmount !== "" ? it.unitAmount : fallback[id];
      total += App.Money.roundWon(unit);
    });
    return App.Money.roundWon(total);
  }

  function appearanceExpenseMultiplier(category, state) {
    var rates = getRevenueExpenseRates(state);
    var kind = appearanceExpenseKind(category);
    if (kind === "heavy") return App.Money.toSafeNumber(rates.appearanceHeavy) || 3;
    if (kind === "light") return App.Money.toSafeNumber(rates.appearanceLight) || 1.5;
    return 1;
  }

  function appearanceOccurrenceCount(project) {
    var n = Math.round(App.Money.toSafeNumber(project && project.episodes));
    return n > 0 ? n : 1;
  }

  function getDefaultExpenseRate(state, category) {
    var rates = getRevenueExpenseRates(state);
    return isSalesCategory(category) ? rates.sales : rates.work;
  }

  function hasStoredExpenseRate(project) {
    return !!(project && project.expenseRate != null && project.expenseRate !== "");
  }

  function resolvedExpenseRate(project, state) {
    if (!project) return 0;
    if (project.expenseRateMode === "custom") return App.Money.toRatio(project.expenseRate);
    return getDefaultExpenseRate(state, project.category);
  }

  function migrateProjectExpenseRate(project) {
    if (!project || typeof project !== "object") return project;
    if (project.expenseInclude === undefined) project.expenseInclude = true;
    project.expenseAmountMode = project.expenseAmountMode === "manual" ? "manual" : "auto";
    project.expenseManualAmount = App.Money.roundWon(project.expenseManualAmount);
    var stored = hasStoredExpenseRate(project) ? App.Money.toRatio(project.expenseRate) : 0;
    var hasMode = project.expenseRateMode === "default" || project.expenseRateMode === "custom";
    if (!hasMode) {
      if (stored > 0) {
        project.expenseRateMode = "custom";
        project.expenseRate = stored;
      } else {
        project.expenseRateMode = "default";
        project.expenseRate = stored;
      }
      return project;
    }
    project.expenseRate = stored;
    if (project.expenseRateMode === "custom" && !(stored > 0) && !project.expenseRateUserSet) {
      project.expenseRateMode = "default";
    }
    return project;
  }

  function isLunchTruckWorkCategory(category) {
    if (!category) return false;
    if (isSalesCategory(category)) return false;
    if (App.WorkCategories && App.WorkCategories.some(function (c) { return c.id === category; })) return true;
    return category === "drama" || category === "ott" || category === "movie" ||
      category === "variety" || category === "performance" || category === "other";
  }

  function isLunchTruckAutoCategory(category) {
    return isLunchTruckWorkCategory(category);
  }

  function resolvedLunchTruckCount(project) {
    if (!project) return 0;
    if (!isLunchTruckWorkCategory(project.category)) return 0;
    var override = Math.max(0, Math.round(App.Money.toSafeNumber(project.lunchTruckCount)));
    if (override > 0) return override;
    return 1;
  }

  function resolvedLunchTruckUnitPrice(project, defaultPrice) {
    var override = project && App.Money.roundWon(project.lunchTruckPrice);
    return override > 0 ? override : App.Money.roundWon(defaultPrice);
  }

  function migrateLunchTruckFields(project) {
    if (!project || typeof project !== "object") return project;
    if (project.lunchTruckInclude === undefined) project.lunchTruckInclude = true;
    else project.lunchTruckInclude = project.lunchTruckInclude !== false;
    project.lunchTruckCount = Math.max(0, Math.round(App.Money.toSafeNumber(project.lunchTruckCount)));
    project.lunchTruckPrice = App.Money.roundWon(project.lunchTruckPrice);
    return project;
  }

  function ensureProjectFields(state) {
    if (!state || typeof state !== "object") return state;
    if (!Array.isArray(state.projects)) state.projects = [];
    (state.projects || []).forEach(function (p) {
      if (!p || typeof p !== "object") return;
      p.category = normalizeCategoryId(p.category) || p.category;
      p.status = mapDealStatus(p.status);
      if (p.includeInBudget === undefined) p.includeInBudget = true;
      p.shootStartMonth = App.Month.normalizeMonth(p.shootStartMonth);
      p.shootEndMonth = App.Month.normalizeMonth(p.shootEndMonth);
      (p.payments || []).forEach(function (pay) {
        if (!pay || typeof pay !== "object") return;
        pay.expectedMonth = App.Month.normalizeMonth(pay.expectedMonth);
      });
      (p.directExpenses || []).forEach(function (exp) {
        if (!exp || typeof exp !== "object") return;
        exp.month = App.Month.normalizeMonth(exp.month);
      });
      migrateProjectExpenseRate(p);
      migrateLunchTruckFields(p);
    });
    return state;
  }

  function normalizeCommonMonthFields(state) {
    if (!state || typeof state !== "object") return state;
    if (state.profile && typeof state.profile === "object") {
      state.profile.startMonth = App.Month.normalizeMonth(state.profile.startMonth) || state.profile.startMonth;
      state.profile.endMonth = App.Month.normalizeMonth(state.profile.endMonth) || state.profile.endMonth;
    }
    ["startupExpenses", "otherOneTimeExpenses", "deposits", "assets", "otherInflows"].forEach(function (key) {
      (state[key] || []).forEach(function (item) {
        if (!item || typeof item !== "object") return;
        item.month = App.Month.normalizeMonth(item.month);
      });
    });
    ["recurringExpenses", "dayBasedExpenses", "employees", "vehicles"].forEach(function (key) {
      (state[key] || []).forEach(function (item) {
        if (!item || typeof item !== "object") return;
        item.startMonth = App.Month.normalizeMonth(item.startMonth);
        item.endMonth = App.Month.normalizeMonth(item.endMonth);
      });
    });
    return state;
  }

  var RETIRED_RECURRING_NAME_KEYS = {
    "차량렌트_9575": true,
    "차량렌트_7653": true,
    "영업인력차량": true,
    "주유비및차량유지비": true,
    "물적인프라사용료": true,
    "전기요금": true,
    "인터넷사용료": true,
    "케이티텔레캅출입": true,
    "사무실청소비": true,
    "수도요금": true,
    "더존위하고": true,
    "PolarisOffice": true,
    "WindowsHome": true,
    "한글": true,
    "책상": true,
    "모니터": true,
    "본체": true,
    "의자": true,
    "책꽂이": true,
    "추가책장": true,
    "카메라장비": true,
    "사무실공간": true,
    "정수기": true,
    "소회의실사용": true,
    "대회의실사용": true,
    "탕비실공용": true,
    "주차": true,
    "재무아웃소싱": true,
    "마케팅아웃소싱": true,
    "고문료": true
  };

  function recurringNameKey(name) {
    return String(name || "").replace(/\s+/g, "");
  }

  function isRetiredRecurringExpense(item) {
    if (!item) return false;
    var key = recurringNameKey(item.name);
    if (RETIRED_RECURRING_NAME_KEYS[key]) return true;
    var lower = key.toLowerCase();
    return lower === "microsoft시스템/office" ||
      lower === "microsoftoffice" ||
      lower === "office" ||
      lower === "polarisoffice" ||
      lower === "windowshome";
  }

  function removeRetiredRecurringExpenses(state) {
    if (!state || typeof state !== "object") return state;
    if (!Array.isArray(state.recurringExpenses)) return state;
    state.recurringExpenses = state.recurringExpenses.filter(function (item) {
      return !isRetiredRecurringExpense(item);
    });
    return state;
  }

  function normalizeRent2fRecurringExpense(state) {
    if (!state || typeof state !== "object") return state;
    (state.recurringExpenses || []).forEach(function (item) {
      if (!item || typeof item !== "object") return;
      if (recurringNameKey(item.name) !== "임대료") return;
      var amount = App.Money.toSafeNumber(item.amount);
      var categoryKey = recurringNameKey(item.category || "").toLowerCase();
      if (amount === 500000 || categoryKey === "rent" || categoryKey === "sga") {
        item.name = "임대료(2층)";
        if (!item.note) {
          item.note = "월 임대료에 사무공간, 소프트웨어, 유틸리티, 시설·장비 및 공용공간 사용료가 포함됩니다.";
        }
      }
    });
    return state;
  }

  function isRentRecurringExpense(item) {
    return !!(item && recurringNameKey(item.name) === "임대료(2층)");
  }

  function isMarketingRecurringExpense(item) {
    return !!(item && recurringNameKey(item.name) === "바이럴마케팅비");
  }

  function recurringExpenseGroupId(item) {
    if (isRentRecurringExpense(item)) return "rent";
    if (isMarketingRecurringExpense(item)) return "marketing";
    return "sga";
  }

  var WELFARE_MULTIPLIER = 2;
  var DEFAULT_MEAL_EXTRA_RATE = 0.5;

  function welfareMultiplier(state) {
    return WELFARE_MULTIPLIER;
  }

  function mealExtraRate(state) {
    var meal = state && state.settings && state.settings.meal;
    if (!meal || meal.extraRate == null || meal.extraRate === "") return DEFAULT_MEAL_EXTRA_RATE;
    return App.Money.toRatio(meal.extraRate);
  }

  function mealExtraAmount(mealBase, state) {
    return App.Money.roundWon(App.Money.roundWon(mealBase) * mealExtraRate(state));
  }

  function welfareAmountFromMealBase(mealBase, state) {
    var base = App.Money.roundWon(mealBase);
    var extra = mealExtraAmount(base, state);
    return App.Money.roundWon((base + extra) * welfareMultiplier(state));
  }

  function ensureMealSettings(state) {
    if (!state || typeof state !== "object") return state;
    if (!state.settings || typeof state.settings !== "object") state.settings = {};
    var meal = state.settings.meal;
    if (!meal || typeof meal !== "object") {
      state.settings.meal = {
        dailyRate: 15000,
        calendarMode: "weekdaysExcludingHolidays",
        workWeek: [1, 2, 3, 4, 5],
        extraRate: DEFAULT_MEAL_EXTRA_RATE
      };
      return state;
    }
    if (meal.extraRate == null || meal.extraRate === "") meal.extraRate = DEFAULT_MEAL_EXTRA_RATE;
    else meal.extraRate = App.Money.toRatio(meal.extraRate);
    return state;
  }

  function ensureSgaFamily(state) {
    if (!state || typeof state !== "object") return state;
    function tag(item) {
      if (!item || typeof item !== "object") return;
      if (!item.family) item.family = "sga";
    }
    (state.employees || []).forEach(tag);
    (state.recurringExpenses || []).forEach(function (item) {
      tag(item);
      if (item) item.category = "sga";
    });
    (state.dayBasedExpenses || []).forEach(tag);
    return state;
  }

  function followsSimStartMonth(item) {
    return !item || item.monthMode !== "custom";
  }

  function syncFollowSimStartMonths(state) {
    if (!state || typeof state !== "object") return state;
    var start = App.Month.normalizeMonth(state.profile && state.profile.startMonth);
    if (!start) return state;
    function syncLine(item) {
      if (!item || typeof item !== "object") return;
      if (item.monthMode === "custom") return;
      item.month = start;
    }
    (state.startupExpenses || []).forEach(syncLine);
    (state.deposits || []).forEach(syncLine);
    (state.assets || []).forEach(syncLine);
    return state;
  }

  function isLegacyCopiedSimWindow(item) {
    var start = App.Month.normalizeMonth(item && item.startMonth);
    var end = App.Month.normalizeMonth(item && item.endMonth);
    if (end !== "2027-09") return false;
    return start === "2026-11" || start === "2026-12";
  }

  function normalizeFollowSimPeriods(state) {
    if (!state || typeof state !== "object") return state;
    function normalize(item, promoteLegacy) {
      if (!item || typeof item !== "object") return;
      if (item.monthMode === "custom") return;
      if (item.periodMode === "custom") {
        if (promoteLegacy && isLegacyCopiedSimWindow(item)) {
          item.periodMode = "full";
          item.startMonth = null;
          item.endMonth = null;
        }
        return;
      }
      item.periodMode = "full";
      if (App.Month.parseMonth(item.startMonth) || App.Month.parseMonth(item.endMonth)) {
        item.startMonth = null;
        item.endMonth = null;
      }
    }
    (state.recurringExpenses || []).forEach(function (item) { normalize(item, true); });
    (state.dayBasedExpenses || []).forEach(function (item) { normalize(item, true); });
    (state.employees || []).forEach(function (item) { normalize(item, false); });
    ((state.settings && state.settings.supportPolicies) || []).forEach(function (item) {
      normalize(item, true);
    });
    return state;
  }

  function ensureCore(state) {
    normalizeCommonMonthFields(state);
    syncFollowSimStartMonths(state);
    ensureMeta(state);
    ensureBaseRates(state);
    ensureSalesPlans(state);
    ensureRevenueExpenseRates(state);
    ensureTaxSettings(state);
    ensureVatSettings(state);
    ensureInsuranceRates(state);
    ensureProjectFields(state);
    ensureRevenueFees(state);
    ensureSupportPolicies(state);
    ensureEmployeeComparisonBurden(state);
    migrateEmployeeIncentiveOccasions(state);
    migrateSeveranceDefaultMode(state);
    removeRetiredRecurringExpenses(state);
    normalizeRent2fRecurringExpense(state);
    ensureSgaFamily(state);
    ensureDeposits(state);
    ensureVehicles(state);
    ensureCorporateSettings(state);
    ensureScenarioSettings(state);
    ensureMealSettings(state);
    normalizeFollowSimPeriods(state);
    return state;
  }

  var COMPARISON_BURDEN_TYPES = ["onePersonOnly", "bothCompany", "actorBorne", "custom"];

  function validComparisonBurdenType(value) {
    return COMPARISON_BURDEN_TYPES.indexOf(value) >= 0;
  }

  function inferComparisonBurdenType(emp) {
    var text = ((emp && emp.role) || "") + " " + ((emp && emp.name) || "");
    if (/대표/.test(text)) return "onePersonOnly";
    if (/본부장/.test(text)) return "actorBorne";
    return "bothCompany";
  }

  function isDirectorLikeEmployee(emp) {
    var text = ((emp && emp.role) || "") + " " + ((emp && emp.name) || "");
    return /본부장/.test(text);
  }

  function isOwnerEmployee(emp) {
    var text = ((emp && emp.role) || "") + " " + ((emp && emp.name) || "");
    return /대표/.test(text);
  }

  function employeeListLabel(emp) {
    if (isOwnerEmployee(emp)) return "대표자(배우)";
    var n = String((emp && emp.name) || "").trim();
    var r = String((emp && emp.role) || "").trim();
    if (n && r && n !== r) return n + " / " + r;
    return n || r || "직원";
  }

  function resolveComparisonBurdenType(emp) {
    if (emp && validComparisonBurdenType(emp.comparisonBurdenType)) return emp.comparisonBurdenType;
    return inferComparisonBurdenType(emp);
  }

  function migrateDirectorActorBorne(state) {
    if (!state || typeof state !== "object") return state;
    if (!state.settings || typeof state.settings !== "object") state.settings = {};
    if (state.settings.directorActorBorneMigrated) return state;
    (state.employees || []).forEach(function (emp) {
      if (!emp || typeof emp !== "object") return;
      if (isDirectorLikeEmployee(emp) && emp.comparisonBurdenType === "bothCompany") {
        emp.comparisonBurdenType = "actorBorne";
      }
    });
    state.settings.directorActorBorneMigrated = true;
    return state;
  }

  function ensureEmployeeComparisonBurden(state) {
    if (!state || typeof state !== "object") return state;
    (state.employees || []).forEach(function (emp) {
      if (!emp || typeof emp !== "object") return;
      if (!validComparisonBurdenType(emp.comparisonBurdenType)) {
        emp.comparisonBurdenType = inferComparisonBurdenType(emp);
      }
      if (emp.comparisonBurdenType === "custom") {
        emp.customExclusiveBurden = emp.customExclusiveBurden !== false;
      }
    });
    migrateDirectorActorBorne(state);
    return state;
  }

  function migrateSeveranceDefaultMode(state) {
    if (!state || typeof state !== "object") return state;
    if (!state.settings || typeof state.settings !== "object") return state;
    var sev = state.settings.severance;
    if (!sev || typeof sev !== "object") return state;
    if (sev.mode !== "manual") return state;
    var manual = state.severanceManual;
    var hasManualEntry = manual && typeof manual === "object" &&
      Object.keys(manual).some(function (k) { return App.Money.toSafeNumber(manual[k]) !== 0; });
    if (hasManualEntry) return state;
    sev.mode = "decemberFull";
    return state;
  }

  function migrateEmployeeIncentiveOccasions(state) {
    if (!state || typeof state !== "object") return state;
    (state.employees || []).forEach(function (emp) {
      if (!emp || typeof emp !== "object") return;
      if (emp.incentiveSeollal == null) emp.incentiveSeollal = 0;
      if (emp.incentiveChuseok == null) emp.incentiveChuseok = 0;
      if (emp.incentiveYearEnd == null) emp.incentiveYearEnd = 0;
      var legacy = App.Money.toSafeNumber(emp.incentiveAmount);
      if (legacy) {
        emp.incentiveYearEnd = App.Money.roundWon(App.Money.toSafeNumber(emp.incentiveYearEnd) + legacy * 12);
      }
      emp.incentiveAmount = 0;
    });
    return state;
  }

  function ensureMeta(state) {
    if (!state || typeof state !== "object") return state;
    if (!state.meta || typeof state.meta !== "object") state.meta = {};
    var meta = state.meta;
    if (!meta.actorId) meta.actorId = uid();
    if (!meta.budgetId) meta.budgetId = uid();
    if (!meta.title) {
      meta.title = (state.profile && (state.profile.companyName || state.profile.actorName)) || "1인 기획사 예산안";
    }
    if (!meta.storageMode) meta.storageMode = "local";
    if (!meta.createdAt) meta.createdAt = new Date().toISOString();
    if (!meta.updatedAt) meta.updatedAt = meta.createdAt;
    return state;
  }

  function ensureState(state) {
    ensureCore(state);
    migrateSalesPlansToProjects(state);
    return state;
  }

  function applyBaseRateToProject(project, baseRates, term) {
    if (!project) return project;
    var rates = baseRates || defaultBaseRates();
    var fee = 0;
    var usedTerm = term || null;
    if (project.category === "ad") {
      usedTerm = term || "months6";
      fee = App.Money.roundWon(rates.ad && rates.ad[usedTerm]);
      if (fee) {
        project.adTerm = usedTerm;
        project.term = usedTerm;
      }
    } else if (project.category === "ambassador") {
      usedTerm = term || "months6";
      fee = App.Money.roundWon(rates.ambassador && rates.ambassador[usedTerm]);
      if (fee) project.term = usedTerm;
    } else if (project.category === "seeding") {
      fee = App.Money.roundWon(rates.seeding && rates.seeding.perEvent);
    } else if (project.category === "pictorial") {
      fee = App.Money.roundWon(rates.pictorial && rates.pictorial.perEvent);
    } else if (project.category === "magazine") {
      fee = App.Money.roundWon(rates.magazine && rates.magazine.perEvent);
    } else if (project.category === "event") {
      fee = App.Money.roundWon(rates.event && rates.event.perEvent);
    }
    if (fee) {
      if (!App.Money.toSafeNumber(project.episodes)) project.episodes = 1;
      project.feePerEpisode = fee;
      project.contractAmount = App.Money.roundWon(App.Money.toSafeNumber(project.episodes) * fee);
    }
    return project;
  }

  var REVENUE_GEN_POOL = [
    { id: "drama", type: "work", weight: 5, min: 200000000, max: 900000000 },
    { id: "ott", type: "work", weight: 3, min: 150000000, max: 600000000 },
    { id: "movie", type: "work", weight: 2, min: 150000000, max: 500000000 },
    { id: "variety", type: "work", weight: 2, min: 30000000, max: 150000000 },
    { id: "performance", type: "work", weight: 1, min: 30000000, max: 120000000 },
    { id: "other", type: "work", weight: 1, min: 50000000, max: 250000000 },
    { id: "ad", type: "sales", weight: 3, min: 150000000, max: 350000000 },
    { id: "ambassador", type: "sales", weight: 2, min: 100000000, max: 300000000 },
    { id: "seeding", type: "sales", weight: 2, min: 20000000, max: 60000000 },
    { id: "pictorial", type: "sales", weight: 2, min: 15000000, max: 30000000 },
    { id: "magazine", type: "sales", weight: 1, min: 5000000, max: 20000000 },
    { id: "event", type: "sales", weight: 2, min: 10000000, max: 30000000 },
    { id: "salesOther", type: "sales", weight: 1, min: 10000000, max: 50000000 }
  ];

  function weightedPickRevenueTemplate(pool) {
    var totalWeight = pool.reduce(function (sum, t) { return sum + t.weight; }, 0);
    var r = Math.random() * totalWeight;
    for (var i = 0; i < pool.length; i++) {
      r -= pool[i].weight;
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  function roundToNiceRevenueAmount(value) {
    var unit = 5000000;
    return Math.max(unit, Math.round(value / unit) * unit);
  }

  function fillRevenueBudget(budgetWon, pool) {
    var chunks = [];
    if (!pool.length) return chunks;
    var remaining = App.Money.roundWon(budgetWon);
    var guard = 0;
    while (remaining > 0 && guard < 40) {
      guard += 1;
      var tmpl = weightedPickRevenueTemplate(pool);
      var raw = tmpl.min + Math.random() * (tmpl.max - tmpl.min);
      var amount = roundToNiceRevenueAmount(raw);
      if (amount >= remaining || remaining - amount < 5000000) {
        chunks.push({ category: tmpl.id, amount: remaining });
        remaining = 0;
        break;
      }
      chunks.push({ category: tmpl.id, amount: amount });
      remaining -= amount;
    }
    if (remaining > 0 && chunks.length) chunks[chunks.length - 1].amount += remaining;
    return chunks;
  }

  function fitPaymentsToContract(project) {
    if (!project) return project;
    var total = App.Engine && App.Engine.projectContractAmount
      ? App.Engine.projectContractAmount(project)
      : App.Money.roundWon(project.contractAmount);
    var pays = project.payments || [];
    if (!total || !pays.length) return project;
    var allocated = 0;
    var last = pays.length - 1;
    pays.forEach(function (p, i) {
      var amt = i === last
        ? App.Money.roundWon(total - allocated)
        : App.Money.roundWon(total * App.Money.toRatio(p.percentage != null ? p.percentage : 0));
      if (amt < 0) amt = 0;
      p.inputMode = "amount";
      p.amount = amt;
      p.percentage = total ? amt / total : 0;
      allocated = App.Money.roundWon(allocated + amt);
    });
    return project;
  }

  function autoGenerateRevenuePlanToTarget(state, targetWon) {
    ensureCore(state);
    var target = App.Money.roundWon(targetWon);
    if (!(target > 0)) return { added: 0, gap: 0 };
    var existing = App.Money.sumBy((state.projects || []).filter(function (p) {
      return p.status !== "cancelled";
    }), function (p) { return App.Engine.projectContractAmount(p); });
    var gap = target - existing;
    if (gap <= 0) return { added: 0, gap: gap };

    var period = App.Month.resolveSimulationPeriod(state);
    var months = (period.months && period.months.length) ? period.months : [state.profile.startMonth];
    var safeMonths = months.slice(0, Math.max(1, months.length - 5));
    if (!safeMonths.length) safeMonths = months;

    var workPool = REVENUE_GEN_POOL.filter(function (t) { return t.type === "work"; });
    var salesPool = REVENUE_GEN_POOL.filter(function (t) { return t.type === "sales"; });
    var workRatio = 0.6 + Math.random() * 0.2;
    var workBudget = Math.round(gap * workRatio);
    var salesBudget = gap - workBudget;
    var chunks = fillRevenueBudget(workBudget, workPool).concat(fillRevenueBudget(salesBudget, salesPool));

    chunks.forEach(function (chunk) {
      var month = safeMonths[Math.floor(Math.random() * safeMonths.length)];
      var proj = newProject(month, chunk.category, state);
      var n = state.projects.filter(function (p) { return p.category === chunk.category; }).length + 1;
      var catLabel = (App.Categories.filter(function (c) { return c.id === chunk.category; })[0] || {}).label || chunk.category;
      proj.name = catLabel + " " + n;
      proj.payments = defaultPaymentSplit(month);
      proj.payments.forEach(function (pay) {
        pay.expectedMonth = clampMonthToPeriod(pay.expectedMonth, months);
      });
      proj.shootStartMonth = month;
      proj.shootEndMonth = month;
      if (isSalesCategory(chunk.category)) proj.episodes = 1;
      proj.contractAmount = chunk.amount;
      fitPaymentsToContract(proj);
      state.projects.push(proj);
    });

    return { added: chunks.length, gap: gap };
  }

  function newSalesPlan(row, amount, seq) {
    return {
      id: uid(),
      rateId: (row && row.id) || "",
      category: (row && row.category) || "other",
      term: (row && row.term) || null,
      name: "",
      amount: App.Money.roundWon(amount),
      month: null,
      includeInBudget: false,
      planStatus: "planned",
      converted: false,
      convertedProjectId: null
    };
  }

  function nextPlanSeq(plans, rateId) {
    return (plans || []).filter(function (p) { return p.rateId === rateId; }).length + 1;
  }

  function addSalesPlanForRow(state, rateId) {
    ensureCore(state);
    var row = rateRowById(rateId);
    if (!row) return null;
    var plan = newSalesPlan(row, getBaseRate(state.profile.baseRates, row), nextPlanSeq(state.salesPlans, row.id));
    state.salesPlans.push(plan);
    return plan;
  }

  function addSalesPlanForGroup(state, groupId) {
    ensureCore(state);
    var rows = (App.RateRows || []).filter(function (r) { return r.group === groupId; });
    if (!rows.length) return null;
    var chosen = rows[0];
    for (var i = 0; i < rows.length; i++) {
      if (getExpectedCount(state.profile.baseRates, rows[i]) > 0) {
        chosen = rows[i];
        break;
      }
    }
    return addSalesPlanForRow(state, chosen.id);
  }

  function fillSalesPlansToTargets(state) {
    ensureCore(state);
    var added = 0;
    (App.RateRows || []).forEach(function (row) {
      var target = getExpectedCount(state.profile.baseRates, row);
      var have = state.salesPlans.filter(function (p) { return p.rateId === row.id; }).length;
      for (var i = have; i < target; i++) {
        state.salesPlans.push(newSalesPlan(row, getBaseRate(state.profile.baseRates, row), i + 1));
        added += 1;
      }
    });
    return added;
  }

  function convertSalesPlan(state, planId, startMonth) {
    ensureCore(state);
    var plan = (state.salesPlans || []).filter(function (p) { return p.id === planId; })[0];
    if (!plan || plan.converted) return null;
    plan.planStatus = "confirmed";
    plan.includeInBudget = true;
    return plan;
  }

  function mapDealStatus(status) {
    if (status === "negotiating" || status === "confirmed" || status === "completed" ||
        status === "cancelled" || status === "expected") return status;
    return "expected";
  }

  function salesPlanToProject(plan) {
    var payments = [];
    if (Array.isArray(plan.payments) && plan.payments.length) {
      payments = plan.payments.map(function (pay) {
        return {
          id: pay.id || uid(),
          label: pay.label || "지급",
          inputMode: pay.inputMode === "amount" ? "amount" : "percent",
          amount: App.Money.roundWon(pay.amount),
          percentage: App.Money.toSafeNumber(pay.percentage),
          expectedMonth: App.Month.normalizeMonth(pay.expectedMonth || plan.month),
          actualDate: pay.actualDate || null,
          paymentStatus: pay.paymentStatus || "expected"
        };
      });
    } else if (App.Month.parseMonth(plan.month) && App.Money.roundWon(plan.amount)) {
      payments = [newPayment(plan.month, { label: "입금", percentage: 1 })];
    }
    return {
      id: uid(),
      sourcePlanId: plan.id,
      category: plan.category || "ad",
      name: plan.name || "",
      status: mapDealStatus(plan.planStatus),
      episodes: 1,
      feePerEpisode: 0,
      contractAmount: App.Money.roundWon(plan.amount),
      shootStartMonth: App.Month.normalizeMonth(plan.month),
      shootEndMonth: null,
      term: plan.term || null,
      adTerm: plan.term || null,
      note: "",
      probability: null,
      fee: null,
      includeInBudget: !!plan.includeInBudget,
      payments: payments,
      directExpenses: [],
      expenseRateMode: "default",
      expenseRate: 0,
      expenseAmountMode: "auto",
      expenseManualAmount: 0,
      expenseInclude: true
    };
  }

  function migrateSalesPlansToProjects(state) {
    if (!state || typeof state !== "object") return state;
    if (!Array.isArray(state.projects)) state.projects = [];
    (state.salesPlans || []).forEach(function (plan) {
      if (!plan || plan.converted) return;
      var existing = state.projects.filter(function (p) {
        return p && (p.sourcePlanId === plan.id || (plan.convertedProjectId && p.id === plan.convertedProjectId));
      })[0];
      if (existing) {
        plan.converted = true;
        plan.convertedProjectId = existing.id;
        return;
      }
      var project = salesPlanToProject(plan);
      state.projects.push(project);
      plan.converted = true;
      plan.convertedProjectId = project.id;
    });
    return state;
  }

  function ensureProjects(state) {
    return ensureState(state);
  }

  function isSalesCategory(id) {
    var normalized = normalizeCategoryId(id);
    return (App.SalesCategories || []).some(function (c) { return c.id === normalized; });
  }

  function isCountedWorkStatus(status) {
    return status !== "cancelled";
  }

  function workContractTotal(state) {
    return App.Money.sumBy(state.projects || [], function (p) {
      if (p.status === "cancelled" || !isCountedWorkStatus(p.status)) return 0;
      return App.Engine.projectContractAmount(p);
    });
  }

  function salesPlanAmountTotal(state) {
    return App.Money.sumBy(state.salesPlans || [], function (p) {
      if (p.converted) return 0;
      return p.amount;
    });
  }

  function salesPlanProgress(state) {
    ensureCore(state);
    var rates = state.profile.baseRates;
    var rows = (App.RateRows || []).map(function (row) {
      var planned = (state.salesPlans || []).filter(function (p) { return p.rateId === row.id; });
      var target = getExpectedCount(rates, row);
      var plannedCount = planned.length;
      var plannedAmount = App.Money.sumBy(planned, function (p) { return p.amount; });
      return {
        row: row,
        target: target,
        planned: plannedCount,
        unplaced: Math.max(0, target - plannedCount),
        targetAmount: expectedRowTotal(rates, row),
        plannedAmount: plannedAmount,
        plans: planned
      };
    });
    var targetTotal = 0;
    var plannedTotal = 0;
    rows.forEach(function (r) {
      targetTotal += r.targetAmount;
      plannedTotal += r.plannedAmount;
    });
    var groups = [];
    var groupMap = {};
    rows.forEach(function (item) {
      var gid = item.row.group;
      if (!groupMap[gid]) {
        groupMap[gid] = {
          id: gid,
          label: item.row.label,
          unit: item.row.unit,
          category: item.row.category,
          rateRows: [],
          target: 0,
          planned: 0,
          plannedAmount: 0,
          targetAmount: 0,
          plans: []
        };
        groups.push(groupMap[gid]);
      }
      var g = groupMap[gid];
      g.rateRows.push(item.row);
      g.target += item.target;
      g.planned += item.planned;
      g.targetAmount += item.targetAmount;
      g.plannedAmount += item.plannedAmount;
      g.plans = g.plans.concat(item.plans);
    });
    groups.forEach(function (g) {
      var seen = {};
      var uniq = [];
      (state.salesPlans || []).forEach(function (p) {
        if (!p || seen[p.id]) return;
        var match = p.category === g.category || g.rateRows.some(function (r) { return r.id === p.rateId; });
        if (!match) return;
        seen[p.id] = true;
        uniq.push(p);
      });
      g.planned = uniq.length;
      g.plannedAmount = App.Money.roundWon(App.Money.sumBy(uniq, function (p) { return p.amount; }));
      g.plans = uniq;
      g.unplaced = Math.max(0, g.target - g.planned);
      g.over = Math.max(0, g.planned - g.target);
      g.targetAmount = App.Money.roundWon(g.targetAmount);
    });
    return {
      rows: rows,
      groups: groups,
      targetTotal: App.Money.roundWon(targetTotal),
      plannedTotal: App.Money.roundWon(plannedTotal),
      unplacedTotal: Math.max(0, App.Money.roundWon(targetTotal) - App.Money.roundWon(plannedTotal))
    };
  }

  function salesGroupHeadText(g) {
    if (!g) return "";
    var unit = g.unit || "건";
    var text = "목표 " + g.target + unit + " · 계획 " + g.planned + unit;
    if (g.over) text += " · 목표 대비 +" + g.over + unit;
    else if (g.unplaced) text += " · 미배치 " + g.unplaced + unit;
    text += " · 예상 " + App.Format.formatWon(g.plannedAmount);
    return text;
  }

  function salesGroupCompactMeta(g) {
    if (!g) return "";
    var text = "목표 " + g.target + " · 계획 " + g.planned;
    if (g.over) text += " · +" + g.over;
    else if (g.unplaced) text += " · 미배치 " + g.unplaced;
    return text;
  }

  function emptyState() {
    return {
      version: 1,
      meta: {
        actorId: uid(),
        budgetId: uid(),
        title: "1인 기획사 예산안",
        storageMode: "local",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      profile: {
        actorName: "",
        companyName: "",
        startMonth: "2027-01",
        endMonth: "2027-12",
        initialCash: 0,
        safetyCash: 0,
        baseRates: defaultBaseRates()
      },
      activityPlan: App.Categories.map(function (c) {
        return { category: c.id, plannedCount: 0 };
      }),
      salesPlans: [],
      revenueFees: defaultRevenueFees(),
      startupExpenses: [],
      deposits: [],
      vehicles: [],
      assets: [],
      projects: [],
      employees: [],
      recurringExpenses: [],
      dayBasedExpenses: [],
      otherOneTimeExpenses: [],
      otherInflows: [],
      severanceManual: {},
      mealExtraHeadcount: 0,
      customHolidays: [],
      forcedWorkdays: [],
      settings: {
        corporateStatus: "new",
        personalTaxCommon: defaultPersonalTaxCommon(),
        scenarioComparison: {
          enabledScenarioIds: ["soloAgency", "exclusiveContract"]
        },
        scenarios: defaultScenarioSettings().scenarios,
        initialCashTiming: "beforeOutflows",
        supportPolicies: defaultSupportPolicies(),
        meal: {
          dailyRate: 15000,
          calendarMode: "weekdaysExcludingHolidays",
          workWeek: [1, 2, 3, 4, 5],
          extraRate: DEFAULT_MEAL_EXTRA_RATE
        },
        insuranceRates: {
          pensionEmployer: 0.0475,
          health: 0.040674,
          employment: 0.0115,
          industrialAccident: 0.009,
          useCaps: true
        },
        severance: { mode: "auto", autoMonths: 12 },
        tax: taxSettings(),
        currency: "KRW",
        revenueExpenseRates: defaultRevenueExpenseRates()
      }
    };
  }

  function newProject(startMonth, category, state) {
    var cat = normalizeCategoryId(category) || "drama";
    var rate = getDefaultExpenseRate(state, cat);
    return {
      id: uid(),
      category: cat,
      name: "",
      status: "expected",
      episodes: "",
      feePerEpisode: 0,
      contractAmount: 0,
      shootStartMonth: null,
      shootEndMonth: null,
      note: "",
      probability: null,
      fee: null,
      payments: [],
      directExpenses: [],
      includeInBudget: true,
      expenseRateMode: "default",
      expenseRate: rate,
      expenseAmountMode: "auto",
      expenseManualAmount: 0,
      expenseInclude: true,
      lunchTruckInclude: true,
      lunchTruckCount: 0,
      lunchTruckPrice: 0
    };
  }

  function newPayment(startMonth, preset) {
    var month = App.Month.normalizeMonth(startMonth) || "2027-01";
    var row = {
      id: uid(),
      label: (preset && preset.label) || "지급",
      inputMode: "percent",
      amount: 0,
      percentage: preset && preset.percentage != null ? preset.percentage : 0,
      expectedMonth: month,
      actualDate: null,
      paymentStatus: "expected"
    };
    return row;
  }

  function defaultPaymentSplit(startMonth) {
    var start = startMonth || "2027-01";
    return [
      newPayment(start, { label: "계약금", percentage: 0.1 }),
      newPayment(App.Month.addMonths(start, 2), { label: "중도금", percentage: 0.5 }),
      newPayment(App.Month.addMonths(start, 5), { label: "잔금", percentage: 0.4 })
    ];
  }

  function copiedItemName(name) {
    var base = String(name || "").trim();
    if (!base) base = "이름 없는 건";
    if (/\s*복사본$/.test(base) || /\s*\(복사\)$/.test(base)) return base;
    return base + " 복사본";
  }

  function cloneEntityWithNewIds(value) {
    if (value == null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(cloneEntityWithNewIds);
    var out = {};
    Object.keys(value).forEach(function (k) {
      if (k === "createdAt" || k === "updatedAt" || k === "sourcePlanId") return;
      if (k === "id") {
        out.id = uid();
        return;
      }
      out[k] = cloneEntityWithNewIds(value[k]);
    });
    return out;
  }

  function cloneRevenueItem(project) {
    var copy = cloneEntityWithNewIds(project || {});
    if (!copy.id) copy.id = uid();
    copy.name = copiedItemName(project && project.name);
    if (!Array.isArray(copy.payments)) copy.payments = [];
    if (!Array.isArray(copy.directExpenses)) copy.directExpenses = [];
    return copy;
  }

  function cloneExpenseItem(item) {
    var copy = cloneEntityWithNewIds(item || {});
    if (!copy.id) copy.id = uid();
    copy.name = copiedItemName(item && item.name);
    return copy;
  }

  function newLine(name) {
    return {
      id: uid(),
      name: name || "",
      category: "",
      unitPrice: 0,
      qty: 1,
      estimatedAmount: null,
      actualAmount: null,
      include: true,
      month: "",
      note: "",
      excludeReason: "",
      accountSubject: ""
    };
  }

  App.uid = uid;
  App.Defaults = {
    taxSettings: taxSettings,
    emptyState: emptyState,
    newProject: newProject,
    newPayment: newPayment,
    newLine: newLine,
    copiedItemName: copiedItemName,
    cloneEntityWithNewIds: cloneEntityWithNewIds,
    cloneRevenueItem: cloneRevenueItem,
    cloneExpenseItem: cloneExpenseItem,
    defaultPaymentSplit: defaultPaymentSplit,
    defaultBaseRates: defaultBaseRates,
    ensureBaseRates: ensureBaseRates,
    ensureSalesPlans: ensureSalesPlans,
    ensureRevenueFees: ensureRevenueFees,
    ensureSupportPolicies: ensureSupportPolicies,
    ensureEmployeeComparisonBurden: ensureEmployeeComparisonBurden,
    isLunchTruckWorkCategory: isLunchTruckWorkCategory,
    isLunchTruckAutoCategory: isLunchTruckAutoCategory,
    resolvedLunchTruckCount: resolvedLunchTruckCount,
    resolvedLunchTruckUnitPrice: resolvedLunchTruckUnitPrice,
    DEFAULT_LUNCH_TRUCK_UNIT_AMOUNT: DEFAULT_LUNCH_TRUCK_UNIT_AMOUNT,
    resolveComparisonBurdenType: resolveComparisonBurdenType,
    isDirectorLikeEmployee: isDirectorLikeEmployee,
    isOwnerEmployee: isOwnerEmployee,
    employeeListLabel: employeeListLabel,
    validComparisonBurdenType: validComparisonBurdenType,
    defaultSupportPolicies: defaultSupportPolicies,
    normalizeSupportPolicy: normalizeSupportPolicy,
    newSupportPolicy: newSupportPolicy,
    syncSupportPolicyPayer: syncSupportPolicyPayer,
    isVehicleSupportPolicy: isVehicleSupportPolicy,
    isCostTabEditableSupportPolicy: isCostTabEditableSupportPolicy,
    migrateEmployeeIncentiveOccasions: migrateEmployeeIncentiveOccasions,
    ensureVatSettings: ensureVatSettings,
    overlappingVehicleOpex: overlappingVehicleOpex,
    supportVehicleHasAmount: supportVehicleHasAmount,
    vehicleSgaHasAmount: vehicleSgaHasAmount,
    vehiclePolicyAmountOverlap: vehiclePolicyAmountOverlap,
    VEHICLE_KINDS: VEHICLE_KINDS,
    validVehicleKind: validVehicleKind,
    vehicleKindLabel: vehicleKindLabel,
    isVehicleDepositName: isVehicleDepositName,
    displayNameFromVehicleDeposit: displayNameFromVehicleDeposit,
    newVehicle: newVehicle,
    normalizeVehicle: normalizeVehicle,
    ensureVehicles: ensureVehicles,
    isRetiredSupportPolicy: isRetiredSupportPolicy,
    isRetiredRecurringExpense: isRetiredRecurringExpense,
    removeRetiredRecurringExpenses: removeRetiredRecurringExpenses,
    isRentRecurringExpense: isRentRecurringExpense,
    isMarketingRecurringExpense: isMarketingRecurringExpense,
    recurringExpenseGroupId: recurringExpenseGroupId,
    welfareMultiplier: welfareMultiplier,
    mealExtraRate: mealExtraRate,
    mealExtraAmount: mealExtraAmount,
    welfareAmountFromMealBase: welfareAmountFromMealBase,
    DEFAULT_MEAL_EXTRA_RATE: DEFAULT_MEAL_EXTRA_RATE,
    VEHICLE_SUPPORT_IDS: VEHICLE_SUPPORT_IDS,
    ensureCorporateSettings: ensureCorporateSettings,
    normalizeSetupCostType: normalizeSetupCostType,
    isIncorporationCostName: isIncorporationCostName,
    normalizeRevenueFee: normalizeRevenueFee,
    newRevenueFee: newRevenueFee,
    defaultRevenueFees: defaultRevenueFees,
    defaultRevenueExpenseRates: defaultRevenueExpenseRates,
    getRevenueExpenseRates: getRevenueExpenseRates,
    ensureRevenueExpenseRates: ensureRevenueExpenseRates,
    getDefaultExpenseRate: getDefaultExpenseRate,
    appearanceExpenseKind: appearanceExpenseKind,
    usesAppearanceExpense: usesAppearanceExpense,
    appearanceSessionUnitTotal: appearanceSessionUnitTotal,
    appearanceExpenseMultiplier: appearanceExpenseMultiplier,
    appearanceOccurrenceCount: appearanceOccurrenceCount,
    resolvedExpenseRate: resolvedExpenseRate,
    ensureState: ensureState,
    ensureTaxSettings: ensureTaxSettings,
    ensureInsuranceRates: ensureInsuranceRates,
    followsSimStartMonth: followsSimStartMonth,
    ensureScenarioSettings: ensureScenarioSettings,
    resolveOwnerDividend: resolveOwnerDividend,
    setOwnerDividendMode: setOwnerDividendMode,
    setOwnerDividendOn: setOwnerDividendOn,
    isDividendOn: isDividendOn,
    ownerDividendForMonth: ownerDividendForMonth,
    ownerDividendWithholding: ownerDividendWithholding,
    ownerProfitShareWithholding: ownerProfitShareWithholding,
    resolveOwnerProfitShare: resolveOwnerProfitShare,
    normalizePersonalTax: normalizePersonalTax,
    normalizePersonalTaxCommon: normalizePersonalTaxCommon,
    defaultPersonalTaxSettings: defaultPersonalTaxSettings,
    defaultPersonalTaxCommon: defaultPersonalTaxCommon,
    applyPersonalTaxCommon: applyPersonalTaxCommon,
    personalTaxForScenario: personalTaxForScenario,
    defaultCostBurdenRules: defaultCostBurdenRules,
    defaultActorPersonalCosts: defaultActorPersonalCosts,
    isActorPersonalCatalogId: isActorPersonalCatalogId,
    actorPersonalCostAmount: actorPersonalCostAmount,
    normalizeActorPersonalCosts: normalizeActorPersonalCosts,
    newActorPersonalCost: newActorPersonalCost,
    newTaxAdjustment: newTaxAdjustment,
    isScenarioEnabled: isScenarioEnabled,
    setScenarioEnabled: setScenarioEnabled,
    derivedSplitBasis: derivedSplitBasis,
    applySplitBasisToggle: applySplitBasisToggle,
    normalizeShareRates: normalizeShareRates,
    applyBaseRateToProject: applyBaseRateToProject,
    autoGenerateRevenuePlanToTarget: autoGenerateRevenuePlanToTarget,
    fitPaymentsToContract: fitPaymentsToContract,
    rateRowById: rateRowById,
    getBaseRate: getBaseRate,
    getExpectedCount: getExpectedCount,
    expectedRowTotal: expectedRowTotal,
    expectedGroupTotals: expectedGroupTotals,
    newSalesPlan: newSalesPlan,
    addSalesPlanForRow: addSalesPlanForRow,
    addSalesPlanForGroup: addSalesPlanForGroup,
    fillSalesPlansToTargets: fillSalesPlansToTargets,
    convertSalesPlan: convertSalesPlan,
    salesPlanProgress: salesPlanProgress,
    salesGroupHeadText: salesGroupHeadText,
    salesGroupCompactMeta: salesGroupCompactMeta,
    normalizePlanPayment: normalizePlanPayment,
    workContractTotal: workContractTotal,
    salesPlanAmountTotal: salesPlanAmountTotal,
    isCountedWorkStatus: isCountedWorkStatus,
    isSalesCategory: isSalesCategory,
    mapDealStatus: mapDealStatus,
    migrateSalesPlansToProjects: migrateSalesPlansToProjects,
    ensureProjects: ensureProjects
  };
})();
