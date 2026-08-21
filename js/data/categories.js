(function () {
  window.App = window.App || {};

  App.Categories = [
    { id: "drama", label: "드라마" },
    { id: "ott", label: "OTT 시리즈" },
    { id: "movie", label: "영화" },
    { id: "variety", label: "예능" },
    { id: "ad", label: "TVCF" },
    { id: "seeding", label: "시딩" },
    { id: "pictorial", label: "유가 화보" },
    { id: "magazine", label: "매거진" },
    { id: "event", label: "행사" },
    { id: "ambassador", label: "앰버서더" },
    { id: "salesOther", label: "기타 영업" },
    { id: "performance", label: "공연" },
    { id: "other", label: "기타 작품" }
  ];

  App.RateRows = [
    { id: "ad-6", group: "ad", category: "ad", term: "months6", label: "TVCF", planName: "TVCF 6개월", basis: "6개월", unit: "건", rateKey: "ad.months6", countKey: "ad.count6" },
    { id: "ad-12", group: "ad", category: "ad", term: "months12", label: "TVCF", planName: "TVCF 12개월", basis: "12개월", unit: "건", rateKey: "ad.months12", countKey: "ad.count12" },
    { id: "seeding", group: "seeding", category: "seeding", term: null, label: "시딩", planName: "시딩", basis: "1회", unit: "회", rateKey: "seeding.perEvent", countKey: "seeding.count" },
    { id: "pictorial", group: "pictorial", category: "pictorial", term: null, label: "유가 화보", planName: "유가 화보", basis: "1회", unit: "회", rateKey: "pictorial.perEvent", countKey: "pictorial.count" },
    { id: "magazine", group: "magazine", category: "magazine", term: null, label: "매거진", planName: "매거진", basis: "1회", unit: "회", rateKey: "magazine.perEvent", countKey: "magazine.count" },
    { id: "event", group: "event", category: "event", term: null, label: "행사", planName: "행사", basis: "1회", unit: "회", rateKey: "event.perEvent", countKey: "event.count" },
    { id: "ambassador-6", group: "ambassador", category: "ambassador", term: "months6", label: "앰버서더", planName: "앰버서더 6개월", basis: "6개월", unit: "건", rateKey: "ambassador.months6", countKey: "ambassador.count6" },
    { id: "ambassador-12", group: "ambassador", category: "ambassador", term: "months12", label: "앰버서더", planName: "앰버서더 12개월", basis: "12개월", unit: "건", rateKey: "ambassador.months12", countKey: "ambassador.count12" }
  ];

  App.Statuses = [
    { id: "expected", label: "예상" },
    { id: "negotiating", label: "협의" },
    { id: "confirmed", label: "확정" },
    { id: "completed", label: "완료" },
    { id: "cancelled", label: "취소" }
  ];

  App.WorkCategories = [
    { id: "drama", label: "드라마" },
    { id: "ott", label: "OTT 시리즈" },
    { id: "movie", label: "영화" },
    { id: "variety", label: "예능" },
    { id: "performance", label: "공연" },
    { id: "other", label: "기타 작품" }
  ];

  App.SalesCategories = [
    { id: "ad", label: "TVCF" },
    { id: "seeding", label: "시딩" },
    { id: "pictorial", label: "유가 화보" },
    { id: "magazine", label: "매거진" },
    { id: "event", label: "행사" },
    { id: "ambassador", label: "앰버서더" },
    { id: "salesOther", label: "기타 영업" }
  ];

  App.PlanStatuses = [
    { id: "planned", label: "계획" },
    { id: "negotiating", label: "협의" },
    { id: "confirmed", label: "확정" },
    { id: "scheduled", label: "예정" }
  ];

  App.PaymentPresets = [
    { label: "계약금", percentage: 0.1 },
    { label: "중도금", percentage: 0.5 },
    { label: "잔금", percentage: 0.4 }
  ];

  App.episodeFields = function (category) {
    if (category === "ad" || category === "event" || category === "pictorial" || category === "seeding" ||
        category === "magazine" || category === "ambassador" || category === "salesOther") {
      return { count: "횟수", unit: "건당 금액", total: "총금액" };
    }
    return { count: "회차", unit: "회당 출연료", total: "총출연료" };
  };

  App.ExpenseGroups = [
    { id: "startup", label: "설립" },
    { id: "sga", label: "판관비" },
    { id: "project", label: "프로젝트" },
    { id: "deposit", label: "보증금" },
    { id: "capex", label: "자산" }
  ];

  App.OpexGroups = [
    { id: "sga", label: "판관비", parent: "sga" }
  ];

  App.SgaFamily = { id: "sga", label: "판관비" };

  App.FeeCostCategories = [
    { id: "sga", label: "판관비" },
    { id: "agency", label: "에이전시 수수료" }
  ];

  App.SupportPolicyGroups = [
    { id: "daily", label: "일상 / 운영 지원" },
    { id: "selfCare", label: "배우 활동 / 자기관리" },
    { id: "production", label: "별도 지원" }
  ];

  App.SupportCalcModes = [
    { id: "monthlyFixed", label: "월 정액" },
    { id: "perPersonMonth", label: "1인당 월" },
    { id: "perOccurrence", label: "1회당" },
    { id: "perProject", label: "작품당" },
    { id: "directAmount", label: "직접 금액" }
  ];

  App.SupportCostClasses = [
    { id: "sga", label: "판관비" },
    { id: "project", label: "프로젝트 직접비" }
  ];

  App.ComparisonBurdenTypes = [
    { id: "onePersonOnly", label: "1인 기획사에서만 발생 (해당 없음)" },
    { id: "bothCompany", label: "양쪽 모두 발생 · 기존 회사 부담" },
    { id: "actorBorne", label: "양쪽 모두 발생 · 배우 부담" },
    { id: "custom", label: "사용자 지정" }
  ];
})();
