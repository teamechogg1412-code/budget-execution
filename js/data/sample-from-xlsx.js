(function () {
  window.App = window.App || {};

  function line(opts) {
    var item = App.Defaults.newLine(opts.name);
    item.category = opts.category || "";
    item.unitPrice = opts.unitPrice || 0;
    item.qty = opts.qty == null ? 1 : opts.qty;
    item.estimatedAmount = opts.estimated != null ? opts.estimated : null;
    item.actualAmount = opts.actual != null ? opts.actual : null;
    item.include = opts.include !== false;
    item.month = opts.month || "2026-11";
    item.note = opts.note || "";
    item.excludeReason = opts.excludeReason || "";
    if (opts.accountSubject) item.accountSubject = opts.accountSubject;
    return item;
  }

  function sampleState() {
    var state = App.Defaults.emptyState();
    state.profile.actorName = "이종원";
    state.profile.companyName = "";
    state.profile.startMonth = "2026-11";
    state.profile.endMonth = "2027-09";
    state.profile.initialCash = 60000000;
    state.profile.safetyCash = 0;
    state.settings.initialCashTiming = "beforeOutflows";
    state.settings.meal.dailyRate = 12000;

    state.activityPlan = App.Categories.map(function (c) {
      var planned = 0;
      if (c.id === "drama") planned = 2;
      if (c.id === "ad") planned = 3;
      if (c.id === "movie") planned = 1;
      return { category: c.id, plannedCount: planned };
    });

    function payPct(label, pct, month) {
      return {
        id: App.uid(),
        label: label,
        inputMode: "percent",
        amount: 0,
        percentage: pct,
        expectedMonth: month,
        actualDate: null,
        paymentStatus: "expected"
      };
    }

    function work(opts) {
      return {
        id: App.uid(),
        category: opts.category,
        name: opts.name,
        status: opts.status || "confirmed",
        episodes: opts.episodes || "",
        feePerEpisode: opts.feePerEpisode || 0,
        contractAmount: opts.contractAmount,
        shootStartMonth: opts.shootStartMonth || null,
        shootEndMonth: opts.shootEndMonth || null,
        note: opts.note || "기본 시드",
        probability: null,
        fee: opts.fee || null,
        payments: opts.payments,
        directExpenses: [],
        expenseRateMode: "default",
        expenseRate: 0,
        expenseInclude: true
      };
    }

    state.projects = [
      work({
        category: "drama",
        name: "하렘의 남자들",
        contractAmount: 230000000,
        shootStartMonth: "2026-12",
        shootEndMonth: "2027-09",
        fee: { name: "성사수수료", rate: 0.20, amount: null, basis: "inflow" },
        payments: [
          payPct("12월 입금", 218500000 / 230000000, "2026-12"),
          payPct("잔금", 11500000 / 230000000, "2027-09")
        ]
      }),
      work({
        category: "drama",
        name: "언니내왕",
        contractAmount: 1200000000,
        fee: { name: "성사수수료", rate: 0.10, amount: null, basis: "inflow" },
        payments: [
          payPct("1차", 500000000 / 1200000000, "2026-12"),
          payPct("2차", 400000000 / 1200000000, "2027-03"),
          payPct("3차", 300000000 / 1200000000, "2027-08")
        ]
      }),
      work({
        category: "ad",
        name: "광고 1",
        status: "expected",
        contractAmount: 300000000,
        fee: { name: "광고 AP", rate: 0.10, amount: null, basis: "inflow" },
        payments: [payPct("입금", 1, "2027-02")]
      }),
      work({
        category: "ad",
        name: "광고 2",
        status: "expected",
        contractAmount: 300000000,
        fee: { name: "광고 AP", rate: 0.10, amount: null, basis: "inflow" },
        payments: [payPct("입금", 1, "2027-05")]
      }),
      work({
        category: "ad",
        name: "광고 3",
        status: "expected",
        contractAmount: 300000000,
        fee: { name: "광고 AP", rate: 0.10, amount: null, basis: "inflow" },
        payments: [payPct("입금", 1, "2027-08")]
      })
    ];

    state.employees = [
      { id: App.uid(), name: "이종원", role: "대표이사", monthlySalary: 15000000, periodMode: "custom", startMonth: "2026-12", endMonth: "2027-09", insure: true, meal: true, severance: false, include: true },
      { id: App.uid(), name: "영업", role: "영업(본부장급)", monthlySalary: 6000000, periodMode: "custom", startMonth: "2026-12", endMonth: "2027-09", insure: true, meal: true, severance: true, include: true, comparisonBurdenType: "actorBorne" },
      { id: App.uid(), name: "로드매니저", role: "로드매니저", monthlySalary: 2500000, periodMode: "custom", startMonth: "2027-01", endMonth: "2027-09", insure: true, meal: true, severance: true, include: true, comparisonBurdenType: "bothCompany" }
    ];
    state.mealExtraHeadcount = 2;

    state.deposits = [
      line({ name: "사무실보증금", actual: 5000000, estimated: 50000000, month: "2026-11", note: "에코 카페 기준", accountSubject: "보증금" }),
      line({ name: "기타보증금", actual: 0, estimated: 0, month: "2026-11", accountSubject: "기타보증금" })
    ];
    state.vehicles = [
      {
        id: "veh-hi-limousine",
        name: "하이리무진",
        kind: "actor",
        deposit: 30000000,
        monthlyRent: 0,
        monthlyInsurance: 0,
        startMonth: "2026-11",
        endMonth: null,
        include: true
      },
      {
        id: "veh-staff",
        name: "일반 스텝 차량",
        kind: "staff",
        deposit: 10000000,
        monthlyRent: 0,
        monthlyInsurance: 0,
        startMonth: "2026-11",
        endMonth: null,
        include: true
      }
    ];

    state.startupExpenses = [
      line({ name: "등록면허세", actual: 340000, estimated: 340000, month: "2026-11" }),
      line({ name: "지방교육세", actual: 22500, estimated: 22500, month: "2026-11" }),
      line({ name: "법원수입증지", actual: 30000, estimated: 30000, month: "2026-11" }),
      line({ name: "법인인감제작", actual: 50000, estimated: 50000, month: "2026-11" }),
      line({ name: "명판 및 스템프", actual: 50000, estimated: 50000, month: "2026-11" }),
      line({ name: "현판제작", actual: 100000, estimated: 100000, month: "2026-11" }),
      line({ name: "법무사수수료", actual: 100000, estimated: 500000, month: "2026-11" }),
      line({ name: "대중문화등록업 수수료", actual: 25000, estimated: 25000, month: "2026-11" }),
      line({ name: "법인인증서", unitPrice: 4400, qty: 2, actual: 4400, estimated: 8800, month: "2026-11" }),
      line({ name: "설립 부대비용", actual: 50000, estimated: 50000, month: "2026-11" }),
      line({ name: "명함 및 리플렛", actual: 400000, estimated: 1000000, month: "2026-11" }),
      line({ name: "도메인 구입비", actual: 50000, estimated: 50000, month: "2026-11" }),
      line({ name: "이메일 셋팅", actual: 21000, estimated: 21000, month: "2026-11" }),
      line({ name: "구글드라이브", actual: 119000, estimated: 119000, month: "2026-11" }),
      line({ name: "웹사이트 제작", actual: 500000, estimated: 5000000, month: "2026-11" })
    ];

    state.assets = [
      line({ name: "컴퓨터", estimated: 1500000, actual: 1500000, include: false, excludeReason: "에코 제공", month: "2026-11", accountSubject: "비품" }),
      line({ name: "책상 및 의자", estimated: 1500000, actual: 1500000, include: false, excludeReason: "에코 제공", month: "2026-11", accountSubject: "비품" }),
      line({ name: "차량운반구", actual: 0, estimated: 0, include: true, month: "2026-11", accountSubject: "차량운반구" }),
      line({ name: "건물", actual: 0, estimated: 0, include: true, month: "2026-11", accountSubject: "건물" })
    ];

    function rec(name, amount, extra) {
      return Object.assign({
        id: App.uid(),
        name: name,
        category: "sga",
        type: "recurring",
        amount: amount,
        periodMode: "full",
        startMonth: "",
        endMonth: "",
        include: true,
        overrides: extra && extra.overrides ? extra.overrides : {},
        note: extra && extra.note || ""
      }, extra || {});
    }

    state.recurringExpenses = [
      rec("임대료(2층)", 500000, {
        category: "rent",
        note: "월 임대료에 사무공간, 소프트웨어, 유틸리티, 시설·장비 및 공용공간 사용료가 포함됩니다."
      }),
      rec("임직원 보험", 500000),
      rec("법인카드(직원)", 1000000),
      rec("법인카드(대표)", 5000000),
      rec("교통비", 150000),
      rec("통신요금", 50000),
      rec("세무사 기장료", 450000),
      rec("접대비", 200000, { overrides: { "2027-06": 1200000 } }),
      rec("기타 잡비", 500000),
      rec("바이럴 마케팅비", 0)
    ];

    state.meta = { source: "xlsx-seed", label: "1인 기획사 기본 시드" };
    return state;
  }

  App.Sample = { load: sampleState };
  App.Defaults.seedState = sampleState;
})();
