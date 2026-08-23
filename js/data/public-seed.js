(function () {
  window.App = window.App || {};

  // 공개용(배우 영입 링크) 기본 시드. 실제 클라이언트 데이터를 절대 담지 않는다.
  // 모든 항목은 "(예시)"가 붙은 가상의 숫자다. js/data/sample-from-xlsx.js(비공개, 실제 시드)와 절대 병합하지 말 것.
  var RAW = {
    version: 1,
    profile: {
      actorName: "",
      companyName: "",
      startMonth: "2027-01",
      endMonth: "2027-12",
      initialCash: 50000000,
      safetyCash: 0
    },
    activityPlan: [
      { category: "drama", plannedCount: 1 },
      { category: "ott", plannedCount: 0 },
      { category: "movie", plannedCount: 0 },
      { category: "variety", plannedCount: 0 },
      { category: "ad", plannedCount: 2 },
      { category: "pictorial", plannedCount: 0 },
      { category: "event", plannedCount: 0 },
      { category: "performance", plannedCount: 0 },
      { category: "other", plannedCount: 0 }
    ],
    startupExpenses: [
      {
        id: "seed-su-1", name: "법인 설립 비용(예시)", category: "", unitPrice: 0, qty: 1,
        estimatedAmount: 1000000, actualAmount: 1000000, include: true, month: "2027-01",
        note: "", excludeReason: "", setupCostType: "incorporation", forceInclude: false
      }
    ],
    deposits: [
      {
        id: "seed-dep-1", name: "사무실 보증금(예시)", category: "", unitPrice: 0, qty: 1,
        estimatedAmount: 10000000, actualAmount: 10000000, include: true, month: "2027-01",
        note: "", excludeReason: "", expectedReturnMonth: null, returnAmount: null, returned: false, returnMonth: null
      }
    ],
    assets: [],
    projects: [
      {
        id: "seed-proj-1",
        category: "drama",
        name: "드라마 (예시)",
        status: "expected",
        episodes: 16,
        feePerEpisode: 10000000,
        contractAmount: 160000000,
        shootStartMonth: "2027-02",
        shootEndMonth: "2027-06",
        note: "",
        probability: null,
        fee: null,
        payments: [
          { id: "seed-pay-1a", label: "계약금", inputMode: "percent", amount: 0, percentage: 0.2, expectedMonth: "2027-02", actualDate: null, paymentStatus: "expected" },
          { id: "seed-pay-1b", label: "중도금", inputMode: "percent", amount: 0, percentage: 0.4, expectedMonth: "2027-04", actualDate: null, paymentStatus: "expected" },
          { id: "seed-pay-1c", label: "잔금", inputMode: "percent", amount: 0, percentage: 0.4, expectedMonth: "2027-07", actualDate: null, paymentStatus: "expected" }
        ],
        directExpenses: [],
        includeInBudget: true,
        expenseInclude: true,
        expenseRateMode: "default",
        expenseRate: 0.15,
        lunchTruckInclude: false,
        lunchTruckCount: 0,
        lunchTruckPrice: 0,
        expenseAmountMode: "auto",
        expenseManualAmount: 0
      },
      {
        id: "seed-proj-2",
        category: "ad",
        name: "광고 (예시)",
        status: "expected",
        episodes: 1,
        feePerEpisode: 0,
        contractAmount: 100000000,
        shootStartMonth: "2027-03",
        shootEndMonth: null,
        note: "",
        probability: null,
        fee: null,
        payments: [
          { id: "seed-pay-2a", label: "계약금", inputMode: "percent", amount: 0, percentage: 0.5, expectedMonth: "2027-03", actualDate: null, paymentStatus: "expected" },
          { id: "seed-pay-2b", label: "잔금", inputMode: "percent", amount: 0, percentage: 0.5, expectedMonth: "2027-09", actualDate: null, paymentStatus: "expected" }
        ],
        directExpenses: [],
        includeInBudget: true,
        expenseInclude: true,
        expenseRateMode: "default",
        expenseRate: 0,
        lunchTruckInclude: false,
        lunchTruckCount: 0,
        lunchTruckPrice: 0,
        expenseAmountMode: "auto",
        expenseManualAmount: 0
      }
    ],
    employees: [
      {
        id: "seed-emp-1", name: "대표이사(본인)", role: "대표이사", monthlySalary: 5000000,
        startMonth: null, endMonth: null, insure: true, insureLimited: true, meal: true, severance: false, include: true,
        periodMode: "full", comparisonBurdenType: "onePersonOnly", family: "sga",
        incentiveSeollal: 0, incentiveChuseok: 0, incentiveYearEnd: 0, incentiveAmount: 0
      },
      {
        id: "seed-emp-2", name: "매니저(예시)", role: "로드매니저", monthlySalary: 3000000,
        startMonth: null, endMonth: null, insure: true, meal: true, severance: true, include: true,
        periodMode: "full", comparisonBurdenType: "bothCompany", family: "sga",
        incentiveSeollal: 0, incentiveChuseok: 0, incentiveYearEnd: 0, incentiveAmount: 0
      }
    ],
    recurringExpenses: [
      { id: "seed-rec-1", name: "사무실 임대료(예시)", category: "sga", type: "recurring", amount: 1000000, startMonth: null, endMonth: null, include: true, overrides: {}, note: "", family: "sga", periodMode: "full" },
      { id: "seed-rec-2", name: "세무사 기장료(예시)", category: "sga", type: "recurring", amount: 300000, startMonth: null, endMonth: null, include: true, overrides: {}, note: "", family: "sga", periodMode: "full" },
      { id: "seed-rec-3", name: "차량 렌트료(예시)", category: "sga", type: "recurring", amount: 2000000, startMonth: null, endMonth: null, include: true, overrides: {}, note: "", family: "sga", periodMode: "full" },
      { id: "seed-rec-4", name: "기타 잡비(예시)", category: "sga", type: "recurring", amount: 500000, startMonth: null, endMonth: null, include: true, overrides: {}, note: "", family: "sga", periodMode: "full" }
    ],
    revenueFees: [
      {
        id: "seed-fee-sales",
        name: "작품·광고 영업 수수료(예시)",
        basis: "totalRevenue",
        revenueScope: "totalRevenue",
        rate: 0.15,
        category: "agency",
        include: true
      },
      {
        id: "seed-fee-finance",
        name: "재무 아웃소싱 수수료(예시)",
        basis: "totalRevenue",
        revenueScope: "totalRevenue",
        rate: 0.05,
        category: "sga",
        include: true
      }
    ],
    dayBasedExpenses: [],
    otherOneTimeExpenses: [],
    otherInflows: [],
    severanceManual: {},
    mealExtraHeadcount: 0,
    customHolidays: [],
    forcedWorkdays: [],
    settings: {
      initialCashTiming: "beforeOutflows",
      tax: {
        year: 2027,
        mode: "corporate",
        cashOutMonth: null,
        cashOutMode: "none",
        localTaxRate: 0.10
      }
    },
    meta: {
      source: "public-seed",
      label: "예시값",
      title: "예시 배우"
    }
  };

  function publicSeedState() {
    return App.Defaults.ensureState(JSON.parse(JSON.stringify(RAW)));
  }

  App.PublicSample = { load: publicSeedState };
  App.Defaults.seedState = publicSeedState;
})();
