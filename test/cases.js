(function () {
  window.App = window.App || {};

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function empty() {
    return App.Defaults.emptyState();
  }

  function noOwnerDividend(state) {
    App.Defaults.ensureScenarioSettings(state);
    state.settings.scenarios.soloAgency.ownerPayout.dividendMode = "amount";
    state.settings.scenarios.soloAgency.ownerPayout.dividendAmount = 0;
    state.settings.scenarios.soloAgency.ownerPayout.dividendRate = 0;
    state.settings.scenarios.soloAgency.ownerPayout.dividendOn = false;
    return state;
  }

  function runTests() {
    var results = [];
    function pass(name) { results.push({ name: name, ok: true }); }
    function fail(name, detail) { results.push({ name: name, ok: false, detail: String(detail) }); }
    function assert(name, cond, detail) {
      if (cond) pass(name);
      else fail(name, detail || "");
    }
    function eq(name, actual, expected) {
      if (actual === expected) pass(name);
      else fail(name, "expected " + expected + " got " + actual);
    }
    function hasWarning(result, code) {
      return (result.warnings || []).some(function (w) { return w.code === code; });
    }
    function monthRow(result, month) {
      return result.months.filter(function (r) { return r.month === month; })[0];
    }

    try {
      var s1 = empty();
      var r1 = App.Engine.runSimulation(s1);
      assert("Case1 예외 없음", !!r1.kpis);
      eq("Case1 입금 0", r1.kpis.inflowInPeriod, 0);
      eq("Case1 비용 0", r1.kpis.pnlExpense, 0);
      eq("Case1 월말=초기현금", r1.kpis.endClosing, 0);
      assert("Case1 시나리오 기본 활성", s1.settings.scenarioComparison.enabledScenarioIds.indexOf("soloAgency") >= 0 &&
        s1.settings.scenarioComparison.enabledScenarioIds.indexOf("exclusiveContract") >= 0);
      assert("Case1 splitBasis 저장 없음", App.Store.exportJson(s1).indexOf("splitBasis") < 0 &&
        App.Store.exportJson(s1).indexOf("analysisMode") < 0 &&
        App.Store.exportJson(s1).indexOf('"enabled":') < 0);
      assert("Case1 치명 경고 없음", r1.warnings.every(function (w) {
        return w.code === "severance_manual_empty" || w.code === "period_long";
      }));
      assert("Case1 NaN 없음", r1.months.every(function (row) {
        return Number.isFinite(row.closing) && Number.isFinite(row.pnlExpense);
      }));
    } catch (e) { fail("Case1 예외", e.message || e); }

    try {
      var legacyScenario = empty();
      var beforeScenarioKpi = App.Engine.runSimulation(legacyScenario).kpis.endClosing;
      legacyScenario.settings.analysisMode = "both";
      legacyScenario.settings.splitBasis = "grossRevenue";
      delete legacyScenario.settings.scenarioComparison;
      legacyScenario.settings.scenarios.soloAgency.enabled = false;
      legacyScenario.settings.scenarios.exclusiveContract.enabled = true;
      legacyScenario.settings.scenarios.exclusiveContract.splitBasis = "netAfterDeductibleCosts";
      var restoredScenario = App.Store.parseImport(App.Store.exportJson(legacyScenario));
      assert("Scenario 구 enabled를 enabledScenarioIds로 복원", restoredScenario.settings.scenarioComparison.enabledScenarioIds.length === 1 &&
        restoredScenario.settings.scenarioComparison.enabledScenarioIds[0] === "exclusiveContract");
      var scenarioJson = App.Store.exportJson(restoredScenario);
      assert("Scenario 파생 필드 제거", scenarioJson.indexOf("analysisMode") < 0 &&
        scenarioJson.indexOf("splitBasis") < 0 &&
        scenarioJson.indexOf('"enabled":') < 0);
      eq("Scenario 스키마 추가 후 V1 KPI 불변", App.Engine.runSimulation(restoredScenario).kpis.endClosing, beforeScenarioKpi);
      eq("Scenario 기본 공제 규칙", restoredScenario.settings.scenarios.exclusiveContract.costBurdenRules.projectDirect, "deductBeforeSplit");
    } catch (e) { fail("Scenario 스키마 예외", e.message || e); }

    try {
      var sUi = empty();
      var beforeUiKpi = App.Engine.runSimulation(sUi).kpis.endClosing;
      App.Defaults.setScenarioEnabled(sUi, "exclusiveContract", false);
      assert("시나리오 끄기", sUi.settings.scenarioComparison.enabledScenarioIds.length === 1 &&
        sUi.settings.scenarioComparison.enabledScenarioIds[0] === "soloAgency");
      App.Defaults.setScenarioEnabled(sUi, "exclusiveContract", true);
      App.Defaults.setScenarioEnabled(sUi, "soloAgency", true);
      eq("시나리오 다시 켜기 2개", sUi.settings.scenarioComparison.enabledScenarioIds.length, 2);
      eq("기본 배분 파생은 비용차감후", App.Defaults.derivedSplitBasis(sUi.settings.scenarios.exclusiveContract.costBurdenRules), "netAfterDeductibleCosts");
      App.Defaults.applySplitBasisToggle(sUi, "grossRevenue");
      eq("총매출 토글 직접비", sUi.settings.scenarios.exclusiveContract.costBurdenRules.projectDirect, "company");
      eq("총매출 토글 수수료", sUi.settings.scenarios.exclusiveContract.costBurdenRules.revenueLinkedFees, "company");
      eq("총매출 토글 급여 유지", sUi.settings.scenarios.exclusiveContract.costBurdenRules.payroll, "company");
      eq("총매출 파생", App.Defaults.derivedSplitBasis(sUi.settings.scenarios.exclusiveContract.costBurdenRules), "grossRevenue");
      assert("토글 후 splitBasis 저장 없음", App.Store.exportJson(sUi).indexOf("splitBasis") < 0 &&
        App.Store.exportJson(sUi).indexOf("analysisMode") < 0);
      App.Defaults.applySplitBasisToggle(sUi, "netAfterDeductibleCosts");
      eq("비용차감 토글 직접비", sUi.settings.scenarios.exclusiveContract.costBurdenRules.projectDirect, "deductBeforeSplit");
      sUi.settings.scenarios.exclusiveContract.companyShareRate = 0.4;
      sUi.settings.scenarios.exclusiveContract.actorShareRate = 0.7;
      App.Defaults.normalizeShareRates(sUi);
      eq("배분율 100% 회사", sUi.settings.scenarios.exclusiveContract.companyShareRate, 0.4);
      eq("배분율 100% 배우", sUi.settings.scenarios.exclusiveContract.actorShareRate, 0.6);
      sUi.settings.scenarios.exclusiveContract.personalTax.mode = "rate";
      sUi.settings.scenarios.exclusiveContract.personalTax.effectiveRate = 0.35;
      var roundUi = App.Store.parseImport(App.Store.exportJson(sUi));
      eq("UI 설정 JSON 왕복 세율", roundUi.settings.scenarios.exclusiveContract.personalTax.effectiveRate, 0.35);
      eq("UI 설정 JSON 왕복 배분", roundUi.settings.scenarios.exclusiveContract.actorShareRate, 0.6);
      eq("UI 변경 후 V1 KPI 불변", App.Engine.runSimulation(roundUi).kpis.endClosing, beforeUiKpi);

      var htmlSimUi = App.Render.renderView("simulation", sUi, App.Engine.runSimulation(sUi), { simTab: "tax" });
      assert("비교 시나리오 카드", htmlSimUi.indexOf("비교 시나리오") >= 0);
      assert("법인 청산세율 입력 필드", htmlSimUi.indexOf('data-path="settings.tax.liquidationTaxRate"') >= 0);
      assert("대표 배당 연도표", htmlSimUi.indexOf("영업이익연동") >= 0 && htmlSimUi.indexOf("배당지급일") >= 0);
      assert("배당 비율 입력", htmlSimUi.indexOf('data-path="settings.scenarios.soloAgency.ownerPayout.dividendRate"') >= 0 &&
        htmlSimUi.indexOf("배당비율") >= 0);
      eq("배당 기본은 영업이익 20%", App.Defaults.ensureScenarioSettings(empty()).settings.scenarios.soloAgency.ownerPayout.dividendRate, 0.2);
      assert("배당 연도 자동", htmlSimUi.indexOf("<td>2027</td>") >= 0);
      assert("전속 배분율", htmlSimUi.indexOf("회사 배분율") >= 0 && htmlSimUi.indexOf("배우 배분율") >= 0);
      assert("배분 기준 토글", htmlSimUi.indexOf("총매출 기준") >= 0 && htmlSimUi.indexOf("비용 차감 후") >= 0);
      assert("개인세금 방식", htmlSimUi.indexOf("개인세금 방식") >= 0);
      assert("splitBasis 입력 없음", htmlSimUi.indexOf("splitBasis") < 0 && htmlSimUi.indexOf("analysisMode") < 0);
      assert("enabledScenarioIds만 체크", htmlSimUi.indexOf('data-action="toggle-scenario"') >= 0);
      assert("기본 헤어 항목", htmlSimUi.indexOf("헤어") >= 0 && htmlSimUi.indexOf('data-path="settings.scenarios.exclusiveContract.actorPersonalCosts.0.unitAmount"') >= 0);
      assert("기본 메이크업 항목", htmlSimUi.indexOf("메이크업") >= 0);
      assert("기본 스타일링 항목", htmlSimUi.indexOf("스타일링") >= 0);
      assert("1회 단가 수정 필드", htmlSimUi.indexOf("1회 단가") >= 0 && htmlSimUi.indexOf("원 / 회") >= 0);
      assert("횟수 수정 필드", htmlSimUi.indexOf('data-path="settings.scenarios.exclusiveContract.actorPersonalCosts.0.quantity"') >= 0);
      var htmlSimTabs = App.Render.renderView("simulation", sUi, App.Engine.runSimulation(sUi), {});
      assert("설정 2차 탭 기본", htmlSimTabs.indexOf("기본 설정") >= 0 && htmlSimTabs.indexOf("조직·인건비") >= 0);
      assert("설정 2차 탭 나머지", htmlSimTabs.indexOf("회사 지원") >= 0 && htmlSimTabs.indexOf("수수료·정책") >= 0 && htmlSimTabs.indexOf("세금·비교조건") >= 0);
      assert("설정에 회사 운영비 탭 없음", htmlSimTabs.indexOf("회사 운영비") < 0);
      assert("기본 탭에 비교 본문 없음", htmlSimTabs.indexOf("비교 시나리오") < 0);
      assert("기본 탭 3열 정보", htmlSimTabs.indexOf("기본정보") >= 0 && htmlSimTabs.indexOf("시작월") >= 0 && htmlSimTabs.indexOf("최초 보유현금") >= 0);

      var htmlAnalysisDefault = App.Render.renderView("analysis", sUi, App.Engine.runSimulation(sUi), {});
      var tabsHtml = htmlAnalysisDefault.slice(
        htmlAnalysisDefault.indexOf("analysis-tabs"),
        htmlAnalysisDefault.indexOf("</div>", htmlAnalysisDefault.indexOf("analysis-tabs"))
      );
      assert("분석 1~5배 탭", tabsHtml.indexOf("1배 · 지금") >= 0 && tabsHtml.indexOf("2배") >= 0 &&
        tabsHtml.indexOf("5배") >= 0);
      assert("분석 서브탭 매출하한", tabsHtml.indexOf("참고(매출하한)") >= 0);
      assert("배수 비교 탭 제거", tabsHtml.indexOf("배수 비교") < 0);
      assert("접기 월별·현금·시나리오·한눈", htmlAnalysisDefault.indexOf('data-id="monthly"') >= 0 &&
        htmlAnalysisDefault.indexOf('data-id="cash"') >= 0 &&
        htmlAnalysisDefault.indexOf('data-id="scenarios"') >= 0 &&
        htmlAnalysisDefault.indexOf('data-id="glance"') >= 0);
      assert("분석 섹션 번호", htmlAnalysisDefault.indexOf("1. 월별 분석") >= 0 &&
        htmlAnalysisDefault.indexOf("2. 기말 현금 맞춤") >= 0 &&
        htmlAnalysisDefault.indexOf("3. 시나리오 비교") >= 0 &&
        htmlAnalysisDefault.indexOf("4. 한눈에 비교") >= 0);
      assert("기말 현금은 월별과 시나리오 사이",
        htmlAnalysisDefault.indexOf('data-id="monthly"') < htmlAnalysisDefault.indexOf('data-id="cash"') &&
        htmlAnalysisDefault.indexOf('data-id="cash"') < htmlAnalysisDefault.indexOf('data-id="scenarios"'));
      assert("분석 전체 접기", htmlAnalysisDefault.indexOf("analysis-folds-collapse") >= 0 &&
        htmlAnalysisDefault.indexOf("전체 접기") >= 0);
      assert("분석 전체 펴기", htmlAnalysisDefault.indexOf("analysis-folds-expand") >= 0 &&
        htmlAnalysisDefault.indexOf("전체 펴기") >= 0);
      assert("분석 탭 순서", tabsHtml.indexOf("1배 · 지금") < tabsHtml.indexOf("5배") &&
        tabsHtml.indexOf("5배") < tabsHtml.indexOf("참고(매출하한)"));
      assert("기본은 시나리오 비교", htmlAnalysisDefault.indexOf("월별 손익 · 현금흐름") < 0 &&
        htmlAnalysisDefault.indexOf("1인 기획사 경제가치") >= 0);
      var htmlMonthly = App.Render.renderView("analysis", sUi, App.Engine.runSimulation(sUi), { analysisTab: "monthly" });
      assert("월별 짧은 안내", htmlMonthly.indexOf("실제 입·출금 시점을 함께 보여줍니다") >= 0);
      assert("월별 손익 순서 안내", htmlMonthly.indexOf("매출 → 매출원가 → 매출총이익 → 판관비 → 영업이익") >= 0);
      assert("월별 긴 설명은 기본 숨김", htmlMonthly.indexOf("영업이익은 세전") < 0);
      assert("월별 도움말 버튼", htmlMonthly.indexOf("open-ledger-help") >= 0);
      assert("월별 도움말 모달 기본 닫힘", htmlMonthly.indexOf('id="ledger-help-title"') < 0);
      var htmlLedgerHelp = App.Render.renderView("analysis", sUi, App.Engine.runSimulation(sUi), { analysisTab: "monthly", ledgerHelpOpen: true });
      assert("월별 도움말 모달 열림", htmlLedgerHelp.indexOf('id="ledger-help-title"') >= 0);
      assert("도움말에 세전 영업이익", htmlLedgerHelp.indexOf("영업이익은 세전") >= 0);
      assert("도움말에 표 읽는 순서", htmlLedgerHelp.indexOf("손익 외 현금 이동") >= 0);
      assert("선택 월 상세 카드 없음", htmlMonthly.indexOf('id="month-detail"') < 0);
      assert("월별 탭에 식대 근거 반복 없음", htmlMonthly.indexOf("식대 계산 근거") < 0);
      assert("월별 세금분석에 마진율 없음", htmlMonthly.indexOf("예상 마진율") < 0);
      assert("구형 수익/세금 분석 제거", htmlMonthly.indexOf("수익 / 세금 분석") < 0);
      assert("구형 세금 현금 납부월 제거", htmlMonthly.indexOf("세금 현금 납부월") < 0);
      assert("구형 Cash Flow 요약 제거", htmlMonthly.indexOf("Cash Flow 요약") < 0);
      assert("월별에 cashOutMonth 입력 없음", htmlMonthly.indexOf("settings.tax.cashOutMonth") < 0);
      var htmlBoth = App.Render.renderView("analysis", sUi, App.Engine.runSimulation(sUi), { analysisTab: "scenarios" });
      assert("비교 탭에서 원장 숨김", htmlBoth.indexOf("월별 손익 · 현금흐름") < 0);
      assert("비교 탭 총매출", htmlBoth.indexOf("총매출") >= 0);
      assert("비교 탭 실수령", htmlBoth.indexOf("세후 개인 실수령") >= 0);
      assert("비교 탭 법인 블록", htmlBoth.indexOf("과세표준") >= 0);
      assert("비교 탭 대표 급여 블록", htmlBoth.indexOf("대표자 급여") >= 0);
      assert("비교 탭 경제가치 결론", htmlBoth.indexOf("1인 기획사 경제가치") >= 0);
      assert("비교 탭 법인 상세보기", htmlBoth.indexOf("법인 계산 상세 보기") >= 0);
      assert("비교 탭 개인 상세보기", htmlBoth.indexOf("개인 세금 상세 보기") >= 0);
      assert("비교 탭 배분 상세보기", htmlBoth.indexOf("배분 계산 상세 보기") >= 0);
      assert("비교 탭에 상세 비교 없음", htmlBoth.indexOf("상세 비교 보기") < 0);
      var sNone = empty();
      sNone.settings.scenarioComparison.enabledScenarioIds = [];
      var htmlNone = App.Render.renderView("analysis", sNone, App.Engine.runSimulation(sNone), { analysisTab: "scenarios" });
      assert("0개 빈 상태", htmlNone.indexOf("비교할 시나리오를 시뮬레이션 설정에서 켜세요") >= 0);
      var sOne = empty();
      App.Defaults.setScenarioEnabled(sOne, "exclusiveContract", false);
      var htmlOne = App.Render.renderView("analysis", sOne, App.Engine.runSimulation(sOne), { analysisTab: "scenarios" });
      assert("1개 단일 요약 안내", htmlOne.indexOf("1인 기획사") >= 0 && htmlOne.indexOf("만 켜져 있습니다") >= 0);
      assert("1개도 요약 표", htmlOne.indexOf("세후 개인 실수령") >= 0);
    } catch (e) { fail("Scenario UI 예외", e.message || e); }

    try {
      var sPol = empty();
      var catalog = sPol.settings.supportPolicies || [];
      var defaultNames = [
        "차량 렌트료", "차량 보험료",
        "연기수업료", "PT비", "경락 / 마사지", "피부과 / 피부관리", "밥차"
      ];
      var removedNames = [
        "현장 식비", "촬영 이동비", "기타 현장 지원비", "배우 주유/이동",
        "통행료 / 주차비", "배우 이동비", "배우 식대", "주유비"
      ];
      var defaultCatalogCount = App.Defaults.defaultSupportPolicies().length;
      eq("지원정책 기본 항목 수", catalog.length, defaultCatalogCount);
      assert("신규 시뮬레이션 기본 포함 ON", catalog.every(function (p) { return p.include === true; }));
      assert("기본 카탈로그 include true", App.Defaults.defaultSupportPolicies().every(function (p) { return p.include === true; }));
      var lunchCatalog = catalog.filter(function (p) { return p.id === "sp-lunch-truck"; })[0];
      eq("밥차 기본 단가 5백만원", lunchCatalog.unitAmount, 5000000);
      assert("밥차 외 지원 기본 금액 0", catalog.filter(function (p) { return p.id !== "sp-lunch-truck"; }).every(function (p) {
        return p.unitAmount === 0;
      }));
      assert("금액 0이어도 포함 유지", catalog.filter(function (p) { return p.id !== "sp-lunch-truck"; }).every(function (p) {
        return p.include === true && p.unitAmount === 0;
      }));
      defaultNames.forEach(function (name) {
        assert("기본 항목 " + name, catalog.some(function (p) { return p.name === name && p.include === true; }));
      });
      removedNames.forEach(function (name) {
        assert("기본목록에서 제거 " + name, !catalog.some(function (p) { return p.name === name; }));
      });
      assert("배우 식대/주유비는 카탈로그에서 완전히 빠짐", !catalog.some(function (p) {
        return p.id === "sp-actor-meal" || p.id === "sp-actor-fuel";
      }));
      assert("밥차는 프로젝트 직접비", catalog.filter(function (p) { return p.id === "sp-lunch-truck"; })[0].costClass === "project");
      assert("수업은 판관비", catalog.filter(function (p) { return p.id === "sp-acting-class"; })[0].costClass === "sga");
      var exportedPol = JSON.parse(App.Store.exportJson(sPol));
      assert("내보내기 include 보존", (exportedPol.settings.supportPolicies || []).every(function (p) { return p.include === true; }));
      var importedPol = App.Store.parseImport(JSON.stringify(exportedPol));
      assert("가져오기 include 보존", (importedPol.settings.supportPolicies || []).every(function (p) { return p.include === true; }));
      var keptOff = empty();
      keptOff.settings.supportPolicies[0].include = false;
      var restoredOff = App.Store.parseImport(App.Store.exportJson(keptOff));
      eq("기존 해제 상태는 유지", restoredOff.settings.supportPolicies[0].include, false);
      var legacySet = empty();
      legacySet.settings.supportPolicies.push(App.Defaults.normalizeSupportPolicy({
        id: "sp-set-meal", name: "현장 식비", group: "production", include: false, unitAmount: 0
      }));
      var restoredLegacy = App.Store.parseImport(App.Store.exportJson(legacySet));
      assert("legacy 현장 식비 JSON 로드 가능", !!restoredLegacy && Array.isArray(restoredLegacy.settings.supportPolicies));
      assert("legacy 현장 식비는 기본 목록에서 제거", !(restoredLegacy.settings.supportPolicies || []).some(function (p) {
        return p.id === "sp-set-meal" || p.name === "현장 식비";
      }));
      eq("legacy 정리 후 기본 건수", restoredLegacy.settings.supportPolicies.length, defaultCatalogCount);
      assert("legacy 정리 후 기본 포함 ON", restoredLegacy.settings.supportPolicies.every(function (p) {
        return p.include === true;
      }));
      eq("included 별칭도 include", App.Defaults.normalizeSupportPolicy({ name: "PT", included: true }).include, true);
      eq("카탈로그 id 필드 없으면 include true", App.Defaults.normalizeSupportPolicy({ id: "sp-pt", name: "PT비" }).include, true);
      eq("명시 include false는 유지", App.Defaults.normalizeSupportPolicy({ id: "sp-pt", include: false }).include, false);

      var rawDump = JSON.parse(JSON.stringify(empty()));
      rawDump.settings.supportPolicies.forEach(function (p, i) {
        if (i >= 3) p.include = false;
      });
      rawDump.settings.supportPolicies = rawDump.settings.supportPolicies.concat([
        { id: "sp-toll-parking", name: "통행료 / 주차비", group: "daily", include: true, unitAmount: 0 },
        { id: "sp-actor-transport", name: "배우 이동비", group: "daily", include: true, unitAmount: 0 },
        { id: "sp-set-meal", name: "현장 식비", group: "production", include: false, unitAmount: 0 },
        { id: "sp-shoot-transport", name: "촬영 이동비", group: "production", include: false, unitAmount: 0 },
        { id: "sp-set-other", name: "기타 현장 지원비", group: "production", include: false, unitAmount: 0 }
      ]);
      var cleanedDump = App.Defaults.ensureState(rawDump);
      eq("구 카탈로그 정리 후 건수", cleanedDump.settings.supportPolicies.length, defaultCatalogCount);
      assert("구 카탈로그 정리 후 전부 포함 ON", cleanedDump.settings.supportPolicies.every(function (p) {
        return p.include === true;
      }));
      ["통행료 / 주차비", "배우 이동비", "현장 식비", "촬영 이동비", "기타 현장 지원비"].forEach(function (name) {
        assert("구 카탈로그에서 제거 " + name, !cleanedDump.settings.supportPolicies.some(function (p) {
          return p.name === name;
        }));
      });
      var actorPay = App.Defaults.normalizeSupportPolicy({ name: "PT", exclusivePayer: "actor" });
      eq("전속 배우 부담 비율 0", actorPay.exclusiveCompanyShareRate, 0);
      eq("전속 배우 부담 주체", actorPay.exclusivePayer, "actor");
      var sharePay = App.Defaults.normalizeSupportPolicy({
        name: "PT", exclusivePayer: "share", exclusiveCompanyShareRate: 0.7
      });
      eq("비율 분담 저장", sharePay.exclusiveCompanyShareRate, 0.7);
      eq("비율 분담 주체", sharePay.exclusivePayer, "share");

      var beforePol = App.Engine.runSimulation(sPol).kpis.endClosing;
      sPol.settings.supportPolicies.forEach(function (p) {
        p.include = true;
        p.unitAmount = 1000000;
      });
      var afterPol = App.Engine.runSimulation(sPol);
      assert("판관비 지원항목 포함시 CF 감소(자동 연동)", afterPol.kpis.endClosing < beforePol);
      var vehicleLinkedIds = { "sp-vehicle-rent": true, "sp-vehicle-insurance": true };
      var sgaCount = sPol.settings.supportPolicies.filter(function (p) {
        return p.costClass === "sga" && !vehicleLinkedIds[p.id];
      }).length;
      eq("지원정책 판관비 자동반영 금액(차량 연동 항목 제외)", afterPol.kpis.supportSga, sgaCount * 1000000 * afterPol.months.length);
      var lunchTruckRow = afterPol.months[0].supportItems.filter(function (it) { return it.id === "sp-lunch-truck"; })[0];
      assert("costClass=project 항목은 판관비 자동연동 대상 아님", !lunchTruckRow);

      var seedPol = App.Sample.load();
      var seedEnd = App.Engine.runSimulation(seedPol).kpis.endClosing;
      eq("시드에 지원정책 주입", (seedPol.settings.supportPolicies || []).length, catalog.length);
      eq("시드 기말 지원정책 불변", seedEnd, 1204738995);
      var rawOld = JSON.parse(App.Store.exportJson(App.Sample.load()));
      delete rawOld.settings.supportPolicies;
      var restoredPol = App.Store.parseImport(JSON.stringify(rawOld));
      assert("구 JSON에 카탈로그 주입", (restoredPol.settings.supportPolicies || []).length === catalog.length);
      eq("구 JSON 기말 불변", App.Engine.runSimulation(restoredPol).kpis.endClosing, 1314238995);

      var htmlPol = App.Render.renderView("simulation", empty(), App.Engine.runSimulation(empty()), {
        simTab: "support",
        supportOpen: { "sp-acting-class": true }
      });
      assert("지원정책 제목", htmlPol.indexOf("복리후생") >= 0);
      assert("긴 설명문 삭제됨", htmlPol.indexOf("행을 눌러 상세를 엽니다") < 0 &&
        htmlPol.indexOf("배우가 평소 받는") < 0);
      assert("1인 기획사 법인 부담", htmlPol.indexOf("법인 부담") >= 0);
      assert("진행비 별도 반영", htmlPol.indexOf("작품 진행비와 별도 반영") >= 0);
      assert("화면 현장 식비 없음", htmlPol.indexOf("현장 식비") < 0);
      assert("화면 촬영 이동비 없음", htmlPol.indexOf("촬영 이동비") < 0);
      assert("화면 기타 현장 지원비 없음", htmlPol.indexOf("기타 현장 지원비") < 0);
      assert("화면 통행료/주차비 없음", htmlPol.indexOf("통행료") < 0);
      assert("화면 배우 이동비 없음", htmlPol.indexOf("배우 이동비") < 0);
      assert("화면 배우 식대 없음", htmlPol.indexOf("배우 식대") < 0);
      assert("화면 주유비 없음", htmlPol.indexOf("주유비") < 0);
      eq("화면 포함 체크 건수", (htmlPol.match(/settings\.supportPolicies\.\d+\.include" data-kind="bool" checked/g) || []).length, defaultCatalogCount);
      assert("화면 차량 렌트료", htmlPol.indexOf("차량 렌트료") >= 0);
      assert("화면 차량 보험료", htmlPol.indexOf("차량 보험료") >= 0);
      assert("화면 별도 지원", htmlPol.indexOf("별도 지원") >= 0);
      assert("화면 연기수업료", htmlPol.indexOf("연기수업료") >= 0);
      assert("화면 PT비", htmlPol.indexOf("PT비") >= 0);
      assert("화면 밥차", htmlPol.indexOf("밥차") >= 0);
      assert("회사 지원 공통 열 헤더", htmlPol.indexOf("support-cols-head") >= 0 &&
        htmlPol.indexOf(">항목<") >= 0 && htmlPol.indexOf(">금액<") >= 0);
      assert("회사 지원 공통 행 그리드", /class="support-row"/.test(htmlPol));
      var sVehLinked = empty();
      sVehLinked.vehicles = [
        Object.assign(App.Defaults.newVehicle("2027-01"), { name: "하이리무진", monthlyRent: 2000000, monthlyInsurance: 500000 }),
        Object.assign(App.Defaults.newVehicle("2027-01"), { name: "스텝 차량", monthlyRent: 800000, monthlyInsurance: 300000 })
      ];
      var htmlRentOpen = App.Render.renderView("simulation", sVehLinked, App.Engine.runSimulation(sVehLinked), {
        simTab: "support",
        supportOpen: { "sp-vehicle-rent": true }
      });
      assert("차량 렌트료는 수정 불가, 차량 설정 연동 표시", htmlRentOpen.indexOf("차량 설정 연동") >= 0);
      assert("차량 렌트료 자동 합계 2,800,000", htmlRentOpen.indexOf("2,800,000") >= 0);
      var deleteBtnCount = (htmlRentOpen.match(/data-action="remove-support-policy"/g) || []).length;
      var catalogSgaCount = sVehLinked.settings.supportPolicies.length;
      eq("차량 연동 항목 2개는 삭제 버튼 제외", deleteBtnCount, catalogSgaCount - 2);
      var seedForVeh = App.Sample.load();
      var htmlSeedSupportClosed = App.Render.renderView("simulation", seedForVeh, App.Engine.runSimulation(seedForVeh), {
        simTab: "support"
      });
      assert("기본 접힘 상태에선 차량 상세 입력폼 없음", htmlSeedSupportClosed.indexOf('data-path="vehicles.0.name"') < 0);
      var seedVehOpen = { "vehicles-section": true };
      seedForVeh.vehicles.forEach(function (v) { seedVehOpen[v.id] = true; });
      var htmlSeedSupport = App.Render.renderView("simulation", seedForVeh, App.Engine.runSimulation(seedForVeh), {
        simTab: "support", supportOpen: seedVehOpen
      });
      assert("하이리무진 표시", htmlSeedSupport.indexOf("하이리무진") >= 0);
      assert("스텝 차량 표시", htmlSeedSupport.indexOf("스텝 차량") >= 0);
      assert("차량보증금_ 필드명 제거", htmlSeedSupport.indexOf("차량보증금_") < 0);
      assert("차량 추가 버튼", htmlSeedSupport.indexOf("+ 차량 추가") >= 0);
      assert("차량명 입력폼", htmlSeedSupport.indexOf('data-path="vehicles.0.name"') >= 0);
      assert("보증금 입력폼", htmlSeedSupport.indexOf('data-path="vehicles.0.deposit"') >= 0);
      assert("렌트료 입력폼", htmlSeedSupport.indexOf('data-path="vehicles.0.monthlyRent"') >= 0);
      assert("보험료 입력폼", htmlSeedSupport.indexOf('data-path="vehicles.0.monthlyInsurance"') >= 0);
      var htmlOrgMeal = App.Render.renderView("simulation", empty(), App.Engine.runSimulation(empty()), { simTab: "org" });
      assert("직원 식대와 구분", htmlOrgMeal.indexOf("직원 식대") >= 0);
    } catch (e) { fail("지원정책 스키마 예외", e.message || e); }

    try {
      var sCmp = empty();
      noOwnerDividend(sCmp);
      sCmp.profile.startMonth = "2027-01";
      sCmp.profile.endMonth = "2027-01";
      var pRev = App.Defaults.newProject("2027-01", "drama");
      pRev.name = "비교용 드라마";
      pRev.status = "confirmed";
      pRev.contractAmount = 1000000000;
      pRev.directExpenses = [{ id: "dx", name: "직접비", amount: 100000000, month: "2027-01", include: true }];
      pRev.payments = [Object.assign(App.Defaults.newPayment("2027-01"), { amount: 1000000000, inputMode: "amount" })];
      sCmp.projects = [pRev];
      sCmp.revenueFees = [];
      sCmp.employees = [{
        id: "ceo-1", name: "대표", role: "대표이사", monthlySalary: 10000000,
        include: true, insure: false, meal: false, severance: false
      }];
      var soloRun = App.Engine.runSimulation(sCmp);
      var cmp = App.Engine.runScenarioComparison(sCmp, soloRun);
      eq("공통 매출 = kpis.revenue", cmp.commonRevenue, soloRun.kpis.revenue);
      eq("양쪽 총매출 동일", cmp.scenarios.soloAgency.totalRevenue, cmp.scenarios.exclusiveContract.totalRevenue);
      eq("1인 기획사 배우 귀속 매출=총매출", cmp.scenarios.soloAgency.actorAttributedRevenue, cmp.commonRevenue);
      eq("전속 배우 귀속 매출=개인 귀속", cmp.scenarios.exclusiveContract.actorAttributedRevenue, cmp.scenarios.exclusiveContract.actorGrossIncome);
      eq("세전이익=V1", cmp.scenarios.soloAgency.corporatePreTaxProfit, soloRun.kpis.operatingProfit);
      eq("법인세=V1", cmp.scenarios.soloAgency.corporateTax, soloRun.kpis.tax);
      eq("판관비=V1 opex", cmp.scenarios.soloAgency.opex, soloRun.kpis.opex);
      eq("급여=V1 payroll", cmp.scenarios.soloAgency.payroll, soloRun.kpis.payroll);
      eq("배분 전 공제 직접비 1억", cmp.scenarios.exclusiveContract.deductibleBeforeSplit, 100000000);
      eq("배분 기준금액 9억", cmp.scenarios.exclusiveContract.splitBase, 900000000);
      eq("전속 배우 70%", cmp.scenarios.exclusiveContract.actorGrossIncome, 630000000);
      eq("전속 회사 30%", cmp.scenarios.exclusiveContract.companyShare, 270000000);
      eq("회사 부담 급여는 실수령 미차감", cmp.scenarios.exclusiveContract.actorBorneCosts, 0);
      eq("본부장 없으면 배우 부담도 0", cmp.scenarios.exclusiveContract.directorCost, 0);
      eq("1인 기획사 기말=V1", cmp.scenarios.soloAgency.corporateEndingCash, soloRun.kpis.endClosing);
      eq("1인 기획사 급여=ledger", cmp.scenarios.soloAgency.actorGrossIncome, soloRun.ledger.ceoSalary);
      eq("readCommonRevenue 재합산 없음", App.Engine.readCommonRevenue(soloRun).total, soloRun.kpis.revenue);
      eq("비교 후 V1 기말 불변", App.Engine.runSimulation(sCmp).kpis.endClosing, soloRun.kpis.endClosing);
      var exSlice = cmp.scenarios.exclusiveContract.taxYears[0];
      eq("전속 한 해 과세소득=귀속-본부장", exSlice.taxableIncome,
        App.Money.roundWon(exSlice.actorGross - exSlice.directorCost - (exSlice.actorSupport || 0)));
      var exYearTax = App.Engine.calculatePersonalTaxDetail(exSlice.taxableIncome, {
        mode: "auto", year: 2027, useLinkedIncome: true, incomeType: "business"
      });
      eq("신규 기본 자동세 전속", cmp.scenarios.exclusiveContract.personalTax, exYearTax.totalPersonalTax);
      eq("신규 기본 자동세 실수령", cmp.scenarios.exclusiveContract.actorNetIncome,
        exSlice.actorGross - exSlice.directorCost - exYearTax.totalPersonalTax);
      eq("배우 부담은 본부장 비용과 동일", cmp.scenarios.exclusiveContract.actorBorneCosts,
        cmp.scenarios.exclusiveContract.directorCost);
      var soloPayTax = App.Engine.calculatePersonalTaxDetail(soloRun.ledger.ceoSalary, {
        mode: "auto", year: 2026, useLinkedIncome: true, incomeType: "earned"
      });
      eq("1인 자동 종합소득세", cmp.scenarios.soloAgency.incomeTax, soloPayTax.determinedTax);
      eq("1인 자동 지방소득세", cmp.scenarios.soloAgency.localIncomeTax, soloPayTax.localIncomeTax);
      assert("1인 급여에 근로소득공제 적용", soloPayTax.earnedIncomeDeduction > 0);
      eq("1인 총세부담=법인세+개인세", cmp.scenarios.soloAgency.totalTaxBurden,
        cmp.scenarios.soloAgency.corporateTax + cmp.scenarios.soloAgency.personalTax);

      var sCardValue = empty();
      sCardValue.profile.startMonth = "2027-01";
      sCardValue.profile.endMonth = "2027-12";
      sCardValue.recurringExpenses = [{
        id: "card-ceo", name: "법인카드(대표)", amount: 1000000,
        include: true, overrides: {}
      }];
      sCardValue.employees = [{
        id: "ceo-card", name: "대표", role: "대표이사", monthlySalary: 10000000,
        include: true, insure: false, meal: false, severance: false
      }];
      var rCardValue = App.Engine.runSimulation(sCardValue);
      var soloCardValue = App.Engine.runScenarioComparison(sCardValue, rCardValue).scenarios.soloAgency;
      eq("대표 법인카드 사용가치", soloCardValue.ownerCorporateCardValue, 12000000);
      eq("실질 경제가치에 대표 법인카드 포함", soloCardValue.controlledEconomicValue,
        App.Money.roundWon(soloCardValue.actorNetIncome + soloCardValue.corporateAfterTaxNet +
          soloCardValue.ownerCorporateCardValue));
      eq("법인카드는 판관비로만 비용 반영", rCardValue.kpis.opex, 12000000);

      var sYearSalary = empty();
      sYearSalary.profile.startMonth = "2026-10";
      sYearSalary.profile.endMonth = "2027-12";
      sYearSalary.employees = [{
        id: "ceo-year", name: "대표", role: "대표이사", monthlySalary: 20000000,
        include: true, insure: false, meal: false, severance: false
      }];
      var rYearSalary = App.Engine.runSimulation(sYearSalary);
      var cmpYearSalary = App.Engine.runScenarioComparison(sYearSalary, rYearSalary).scenarios.soloAgency;
      var tax2026Salary = App.Engine.calculatePersonalTaxDetail(60000000, {
        mode: "auto", year: 2026, useLinkedIncome: true, incomeType: "earned"
      });
      var tax2027Salary = App.Engine.calculatePersonalTaxDetail(240000000, {
        mode: "auto", year: 2027, useLinkedIncome: true, incomeType: "earned"
      });
      eq("대표 급여 연도별 총급여", cmpYearSalary.earnedGross, 300000000);
      eq("대표 급여 연도별 근로소득세",
        cmpYearSalary.incomeTax,
        tax2026Salary.determinedTax + tax2027Salary.determinedTax);
      eq("대표 급여 연도별 지방소득세",
        cmpYearSalary.localIncomeTax,
        tax2026Salary.localIncomeTax + tax2027Salary.localIncomeTax);

      sCmp.settings.scenarios.exclusiveContract.personalTax.mode = "rate";
      sCmp.settings.scenarios.exclusiveContract.personalTax.effectiveRate = 0.30;
      var cmpRate = App.Engine.runScenarioComparison(sCmp, soloRun);
      eq("유효세율 개인세금", cmpRate.scenarios.exclusiveContract.personalTax, 189000000);
      eq("세율 후 실수령", cmpRate.scenarios.exclusiveContract.actorNetIncome, 441000000);

      sCmp.settings.scenarios.exclusiveContract.personalTax.mode = "manual";
      sCmp.settings.scenarios.exclusiveContract.personalTax.manualTaxAmount = 100000000;
      var cmpMan = App.Engine.runScenarioComparison(sCmp, soloRun);
      eq("수동 개인세금", cmpMan.scenarios.exclusiveContract.personalTax, 100000000);
      eq("수동 후 실수령", cmpMan.scenarios.exclusiveContract.actorNetIncome, 530000000);

      sCmp.settings.scenarios.exclusiveContract.companyShareRate = 0.4;
      sCmp.settings.scenarios.exclusiveContract.actorShareRate = 0.7;
      var cmpWarn = App.Engine.runScenarioComparison(sCmp, soloRun);
      assert("배분율 합계 경고", (cmpWarn.warnings || []).some(function (w) { return w.code === "share_rate_sum"; }));

      sCmp.employees.push({
        id: "other-1", name: "영업", role: "본부장", monthlySalary: 2000000,
        include: true, insure: false, meal: false, severance: false
      });
      var solo2 = App.Engine.runSimulation(sCmp);
      sCmp.settings.scenarios.soloAgency.ownerPayout.salaryEmployeeId = "other-1";
      var cmpEmp = App.Engine.runScenarioComparison(sCmp, solo2);
      var otherRow = ((solo2.ledger.groups || []).filter(function (g) { return g.id === "payroll"; })[0].rows || [])
        .filter(function (r) { return r.id === "emp-other-1"; })[0];
      eq("지정 직원 급여", cmpEmp.scenarios.soloAgency.actorGrossIncome, -otherRow.total);

      sCmp.settings.scenarios.exclusiveContract.companyShareRate = 0.3;
      sCmp.settings.scenarios.exclusiveContract.actorShareRate = 0.7;
      sCmp.settings.scenarios.exclusiveContract.personalTax.mode = "manual";
      sCmp.settings.scenarios.exclusiveContract.personalTax.manualTaxAmount = 0;
      var netCompany = App.Engine.runScenarioComparison(sCmp, solo2).scenarios.exclusiveContract.actorNetIncome;
      sCmp.recurringExpenses = [{ id: "rent", name: "임대료", amount: 50000000, include: true, overrides: {} }];
      var soloOpex = App.Engine.runSimulation(sCmp);
      var cmpOpex = App.Engine.runScenarioComparison(sCmp, soloOpex);
      eq("회사 부담 판관비는 전속 실수령 불변", cmpOpex.scenarios.exclusiveContract.actorNetIncome, netCompany);
      assert("판관비는 V1 기말을 바꿈", soloOpex.kpis.endClosing !== solo2.kpis.endClosing);

      sCmp.settings.scenarios.exclusiveContract.actorPersonalCosts = [
        { id: "style", name: "스타일리스트", unitAmount: 50000000, quantity: 1, include: true }
      ];
      sCmp.settings.scenarios.exclusiveContract.actorPersonalCatalogRemoved = ["apc-hair", "apc-makeup", "apc-styling"];
      var cmpActor = App.Engine.runScenarioComparison(sCmp, soloOpex);
      eq("개인활동비는 본부장 비용과 별개", cmpActor.scenarios.exclusiveContract.actorBorneCosts,
        cmpActor.scenarios.exclusiveContract.directorCost);
      eq("개인활동비는 전속 실수령 미차감", cmpActor.scenarios.exclusiveContract.actorNetIncome, netCompany);
      sCmp.settings.scenarios.exclusiveContract.actorPersonalCosts[0].include = false;
      eq("배우 부담 미포함", App.Engine.runScenarioComparison(sCmp, soloOpex).scenarios.exclusiveContract.actorBorneCosts, 0);

      var sApc = empty();
      App.Defaults.ensureScenarioSettings(sApc);
      var apc = sApc.settings.scenarios.exclusiveContract.actorPersonalCosts;
      eq("기본 개인활동비 3건", apc.length, 3);
      eq("헤어 1회 10만", apc.filter(function (it) { return it.id === "apc-hair"; })[0].unitAmount, 100000);
      eq("메이크업 1회 10만", apc.filter(function (it) { return it.id === "apc-makeup"; })[0].unitAmount, 100000);
      eq("스타일링 1회 50만", apc.filter(function (it) { return it.id === "apc-styling"; })[0].unitAmount, 500000);
      var hair = apc.filter(function (it) { return it.id === "apc-hair"; })[0];
      hair.unitAmount = 200000;
      hair.quantity = 3;
      eq("단가·횟수 수정 합계", App.Defaults.actorPersonalCostAmount(hair), 600000);
      hair.include = false;
      eq("미포함이면 0", App.Defaults.actorPersonalCostAmount(hair), 0);

      sCmp.settings.scenarios.exclusiveContract.actorPersonalCosts = [];
      sCmp.settings.scenarios.exclusiveContract.costBurdenRules.projectDirect = "company";
      var cmpGross = App.Engine.runScenarioComparison(sCmp, soloOpex);
      eq("직접비 회사부담 시 공제 0", cmpGross.scenarios.exclusiveContract.deductibleBeforeSplit, 0);
      eq("직접비 회사부담 시 배우 7억", cmpGross.scenarios.exclusiveContract.actorGrossIncome, 700000000);

      sCmp.settings.scenarios.exclusiveContract.costBurdenRules.projectDirect = "ignore";
      eq("직접비 ignore도 공제 0", App.Engine.runScenarioComparison(sCmp, soloOpex).scenarios.exclusiveContract.deductibleBeforeSplit, 0);

      sCmp.settings.scenarios.exclusiveContract.costBurdenRules.projectDirect = "deductBeforeSplit";
      sCmp.revenueFees = [{ id: "sga-fee", name: "파트너", rate: 0.10, category: "sga", include: true }];
      var soloFee = App.Engine.runSimulation(sCmp);
      var cmpFee = App.Engine.runScenarioComparison(sCmp, soloFee);
      eq("수수료 이중공제 없음", cmpFee.scenarios.exclusiveContract.deductibleBeforeSplit, 200000000);
      eq("수수료 공제 후 기준 8억", cmpFee.scenarios.exclusiveContract.splitBase, 800000000);

      sCmp.settings.scenarios.exclusiveContract.costBurdenRules.projectDirect = "company";
      sCmp.settings.scenarios.exclusiveContract.costBurdenRules.revenueLinkedFees = "company";
      var cmpFeeCompany = App.Engine.runScenarioComparison(sCmp, soloFee);
      eq("company 규칙에서도 sga 수수료가 프로젝트 비용에 반영(손실 없음)",
        cmpFeeCompany.scenarios.exclusiveContract.projectCosts, 200000000);
      eq("비교표용 수수료는 양쪽 1억", cmpFee.scenarios.soloAgency.commissionFees, 100000000);
      eq("전속 수수료 버킷=매출연동", cmpFee.scenarios.exclusiveContract.lines.revenueLinkedFees.value, 100000000);
      eq("1인 기획사 운영비에서 판관비 수수료 제외", cmpFee.scenarios.soloAgency.opexOperating,
        App.Money.roundWon(soloFee.kpis.opex - soloFee.kpis.supportSga - 100000000));
      sCmp.settings.scenarios.exclusiveContract.costBurdenRules.projectDirect = "deductBeforeSplit";
      sCmp.settings.scenarios.exclusiveContract.costBurdenRules.revenueLinkedFees = "deductBeforeSplit";

      var htmlCmp = App.Render.renderView("analysis", sCmp, soloFee, { analysisTab: "scenarios" });
      assert("비교표 10억", htmlCmp.indexOf("1,000,000,000원") >= 0);
      assert("비교표 배분 전 공제", htmlCmp.indexOf("배분 전 공제") >= 0);
      assert("비교표 프로젝트 직접비", htmlCmp.indexOf("프로젝트 직접비") >= 0);
      assert("비교표 매출연동 수수료 행", htmlCmp.indexOf("매출연동·에이전시 수수료") >= 0);
      assert("상세 비교 보기 없음", htmlCmp.indexOf("상세 비교 보기") < 0);
      assert("비교표 차이 열 없음", htmlCmp.indexOf(">차이</th>") < 0);
      assert("분석에서 인건비 상세 제거", htmlCmp.indexOf("인건비 상세") < 0);
      assert("분석에서 회사 지원가치 상세 제거", htmlCmp.indexOf("회사 지원가치 합계") < 0);
      assert("비교표 진행비 하위행", htmlCmp.indexOf("진행비") >= 0);
      assert("비교표 밥차비 하위행", htmlCmp.indexOf("밥차비") >= 0);
      assert("비교표 판관비", htmlCmp.indexOf("판관비") >= 0);
      assert("비교표 배우 활동지원", htmlCmp.indexOf("배우 활동지원") >= 0);
      assert("비교표 회사 부담 문구", htmlCmp.indexOf("기존 회사 100% 부담") >= 0);
      assert("수수료 분류 안내", htmlCmp.indexOf("매출연동·에이전시 수수료") >= 0);
      assert("배우 귀속소득 행", htmlCmp.indexOf("배우 귀속소득") >= 0);
      assert("법인 세전이익 행", htmlCmp.indexOf("세전이익") >= 0);
      assert("법인세 행", htmlCmp.indexOf("법인세") >= 0);
      assert("실수령과 법인현금 분리", htmlCmp.indexOf("세후 개인 실수령") >= 0 && htmlCmp.indexOf("전체 세후 법인잔여") >= 0);
      assert("비교표 근로소득세", htmlCmp.indexOf("종합소득세") >= 0);
      assert("비교표 지방소득세", htmlCmp.indexOf("지방소득세") >= 0);
      assert("대표 급여 세후 표시", htmlCmp.indexOf("대표자 급여") >= 0 && htmlCmp.indexOf("세후 개인 실수령") >= 0);
      assert("비교표 개인 최종 세부담", htmlCmp.indexOf("개인 최종 세부담") >= 0);
      assert("법인 계산 상세 보기", htmlCmp.indexOf("법인 계산 상세 보기") >= 0);
      assert("개인 세금 상세 보기", htmlCmp.indexOf("개인 세금 상세 보기") >= 0);
      assert("배분 계산 상세 보기", htmlCmp.indexOf("배분 계산 상세 보기") >= 0);
      assert("가로 그룹 1인 기획사", htmlCmp.indexOf("<h3>1인 기획사</h3>") >= 0);
      assert("가로 그룹 법인", htmlCmp.indexOf("<h3>법인</h3>") >= 0);
      assert("가로 그룹 대표 개인", htmlCmp.indexOf("<h3>대표 개인</h3>") >= 0);
      assert("가로 그룹 전속", htmlCmp.indexOf("<h3>기존 회사 전속</h3>") >= 0);
      assert("전속 내부 배우 개인", htmlCmp.indexOf("<h3>배우 개인</h3>") >= 0);
      assert("법인+개인 연결", htmlCmp.indexOf("scenario-join") >= 0);
      assert("시나리오 VS는 그룹 사이", htmlCmp.indexOf("scenario-compare-vs") >= 0);
      assert("1인 기획사 합산식", htmlCmp.indexOf("전체 기간 누적 세후순이익") >= 0 && htmlCmp.indexOf("대표 개인 세후 실수령") >= 0);
      assert("전속 경제가치 합산식", htmlCmp.indexOf("세후 개인 실수령") >= 0);
      assert("전속 산식에 회사 지원가치 없음", htmlCmp.indexOf("회사 지원가치") < 0);
      assert("회사 측 전체기간", htmlCmp.indexOf("전체기간") >= 0);
      assert("메인 법인 과세표준", htmlCmp.indexOf("과세표준") >= 0);
      assert("메인 대표자 급여", htmlCmp.indexOf("대표자 급여") >= 0);
      assert("메인 경제가치 결론", htmlCmp.indexOf("1인 기획사 경제가치") >= 0 &&
        htmlCmp.indexOf("기존 회사 전속 경제가치") >= 0);
      assert("메인 차이율", htmlCmp.indexOf("scenario-verdict-delta") >= 0);
      assert("차이는 전속 카드 오른쪽에 정렬", htmlCmp.indexOf("scenario-verdict-end") >= 0);
      eq("차액 A-B 실수령", cmpFee.deltas.actorNetIncome,
        cmpFee.scenarios.soloAgency.actorNetIncome - cmpFee.scenarios.exclusiveContract.actorNetIncome);
      eq("1인 기획사 총매출=공통매출", cmpFee.scenarios.soloAgency.totalRevenue, cmpFee.commonRevenue);
      eq("전속 총매출=공통매출", cmpFee.scenarios.exclusiveContract.totalRevenue, cmpFee.commonRevenue);
      var soloValueRate = cmpFee.scenarios.soloAgency.controlledEconomicValue / cmpFee.commonRevenue;
      var exValueRate = cmpFee.scenarios.exclusiveContract.controlledEconomicValue / cmpFee.commonRevenue;
      assert("1인 기획사 경제가치율", htmlCmp.indexOf("매출 대비 경제가치율 " + App.Format.formatPct(soloValueRate)) >= 0);
      assert("기존 회사 전속 경제가치율", htmlCmp.indexOf("매출 대비 경제가치율 " + App.Format.formatPct(exValueRate)) >= 0);
      var ppDiff = soloValueRate - exValueRate;
      var ppText = (ppDiff > 0 ? "+" : "") + App.Format.formatPct(ppDiff) + "p";
      assert("차이 경제가치율 %p", htmlCmp.indexOf(ppText) >= 0);
      var htmlCmpCorpHelp = App.Render.renderView("analysis", sCmp, soloFee, { analysisTab: "scenarios", scenarioCorpHelpOpen: true });
      assert("하단 구성 법인잔여", htmlCmp.indexOf("법인 세후 잔여") >= 0 &&
        htmlCmpCorpHelp.indexOf(App.Format.formatWon(cmpFee.scenarios.soloAgency.corporateEndingCash)) >= 0);
      assert("하단 구성 대표실수령", htmlCmp.indexOf("대표 개인 세후 실수령") >= 0 &&
        htmlCmp.indexOf(App.Format.formatWon(cmpFee.scenarios.soloAgency.actorNetIncome)) >= 0);
      assert("하단 구성 배우 지원가치 없음", htmlCmp.indexOf("배우 지원가치") < 0);
      assert("하단 구성에 법인카드 사용가치 없음", htmlCmp.indexOf("법인카드 사용가치") < 0);
      assert("하단 구성 배우실수령", htmlCmp.indexOf("세후 개인 실수령") >= 0 &&
        htmlCmp.indexOf(App.Format.formatWon(cmpFee.scenarios.exclusiveContract.actorNetIncome)) >= 0);
      assert("하단 비교는 차이만, 산식 중복 없음", htmlCmp.indexOf("scenario-verdict-formula") < 0);
      assert("경제가치·산식은 위 카드에만 존재", htmlCmp.indexOf("scenario-family-eq") >= 0);
      assert("회사 보조식 중복 제거", htmlCmp.indexOf("− 회사 부담 비용") < 0);
      assert("하단 차이 산식", htmlCmp.indexOf("1인 기획사 경제가치") >= 0 &&
        htmlCmp.indexOf("기존 회사 전속 경제가치") >= 0 && htmlCmp.indexOf("scenario-verdict-delta") >= 0);
      eq("경제가치율은 영업이익 마진과 다름", App.Format.formatPct(soloValueRate) !== App.Format.formatPct(soloFee.kpis.margin), true);
      eq("법인세 불변", cmpFee.scenarios.soloAgency.corporateTax, soloFee.kpis.tax);
    } catch (e) { fail("Scenario 엔진 예외", e.message || e); }

    try {
      function nat(base) {
        return App.Engine.calculatePersonalIncomeTax(base, 2026);
      }
      eq("14,000,000원 세율", nat(14000000).rate, 0.06);
      eq("14,000,000원 세액", nat(14000000).tax, 840000);
      eq("50,000,000원 세율", nat(50000000).rate, 0.15);
      eq("50,000,000원 세액", nat(50000000).tax, 6240000);
      eq("88,000,000원 세율", nat(88000000).rate, 0.24);
      eq("88,000,000원 세액", nat(88000000).tax, 15360000);
      eq("150,000,000원 세액", nat(150000000).tax, 37060000);
      eq("300,000,000원 세액", nat(300000000).tax, 94060000);
      eq("500,000,000원 세액", nat(500000000).tax, 174060000);
      eq("1,000,000,000원 세액", nat(1000000000).tax, 384060000);
      eq("1,064,000,000원 세액", nat(1064000000).tax, 412860000);
      eq("1,064,000,000원 세율", nat(1064000000).rate, 0.45);
      eq("1,064,000,000원 누진공제", nat(1064000000).deduction, 65940000);
      eq("1,064,000,000원 지방세", App.Engine.calculateLocalIncomeTax(412860000, 2026), 41286000);
      eq("5백만 근로소득공제", App.PersonalTax.calculateEarnedIncomeDeduction(5000000), 3500000);
      eq("1천만 근로소득공제", App.PersonalTax.calculateEarnedIncomeDeduction(10000000), 5500000);
      eq("2.4억 근로소득공제", App.PersonalTax.calculateEarnedIncomeDeduction(240000000), 17550000);
      eq("3억 근로소득공제", App.PersonalTax.calculateEarnedIncomeDeduction(300000000), 18750000);
      eq("근로소득공제 한도 2천만", App.PersonalTax.calculateEarnedIncomeDeduction(1000000000), 20000000);
      var earned10 = App.Engine.calculatePersonalTaxDetail(10000000, {
        mode: "auto", year: 2026, useLinkedIncome: true, incomeType: "earned"
      });
      eq("1천만 급여 근로소득금액", earned10.earnedIncomeAmount, 4500000);
      assert("1천만 급여 산출세액 < 총급여 6%", earned10.assessedTax < 600000);
      var withHold = App.Engine.calculatePersonalTaxDetail(300000000, {
        mode: "auto", year: 2026, useLinkedIncome: true, incomeType: "earned", withholdingTax: 50000000
      });
      eq("원천은 총부담에 미가산", withHold.totalPersonalTax, withHold.determinedTax + withHold.localIncomeTax);
      eq("추가납부=결정세액-원천", withHold.additionalIncomeTax, withHold.determinedTax - 50000000);
      eq("잔여납부=총부담-원천", withHold.additionalPayment, withHold.totalPersonalTax - 50000000);
      assert("원천 이중합산 아님", withHold.totalPersonalTax !== withHold.determinedTax + withHold.localIncomeTax + 50000000);
      eq("총부담 != 결정+원천+지방", withHold.totalPersonalTax === withHold.determinedTax + 50000000 + withHold.localIncomeTax, false);
      var withDed = App.Engine.calculatePersonalTaxDetail(50000000, {
        mode: "auto", year: 2026, useLinkedIncome: true, incomeDeduction: 10000000
      });
      eq("공제 시 과세표준", withDed.taxableBase, 40000000);
      eq("공제 시 산출세액", withDed.incomeTax, 4740000);
      assert("공제 시 세액 감소", withDed.incomeTax < nat(50000000).tax);
      var withPre = App.Engine.calculatePersonalTaxDetail(50000000, {
        mode: "auto", year: 2026, useLinkedIncome: true, prepaidTax: 1000000
      });
      eq("기납부 시 추가납부", withPre.additionalPayment, withPre.totalPersonalTax - 1000000);
      assert("기납부 시 추가납부 감소", withPre.additionalPayment < withPre.totalPersonalTax);
      eq("수동 세액 Override", App.Engine.calculateScenarioPersonalTax(1064000000, {
        mode: "manual", manualTaxAmount: 123456789
      }), 123456789);
      var sTax = empty();
      sTax.profile.startMonth = "2027-01";
      sTax.profile.endMonth = "2027-01";
      var pTax = App.Defaults.newProject("2027-01", "drama");
      pTax.status = "confirmed";
      pTax.contractAmount = 1000000000;
      pTax.directExpenses = [{ id: "dx", name: "직접비", amount: 100000000, month: "2027-01", include: true }];
      pTax.payments = [Object.assign(App.Defaults.newPayment("2027-01"), { amount: 1000000000, inputMode: "amount" })];
      sTax.projects = [pTax];
      sTax.revenueFees = [];
      sTax.employees = [{
        id: "ceo-1", name: "대표", role: "대표이사", monthlySalary: 10000000,
        include: true, insure: false, meal: false, severance: false
      }];
      var rTax = App.Engine.runSimulation(sTax);
      var cTax = App.Engine.runScenarioComparison(sTax, rTax);
      eq("두 시나리오 세금 독립", cTax.scenarios.soloAgency.personalTax !== cTax.scenarios.exclusiveContract.personalTax, true);
      eq("비교표 전속 개인세금=자동", cTax.scenarios.exclusiveContract.personalTax,
        App.Engine.calculatePersonalTaxDetail(cTax.scenarios.exclusiveContract.taxYears[0].taxableIncome, {
          mode: "auto", year: 2027, useLinkedIncome: true, incomeType: "business"
        }).totalPersonalTax);
      eq("비교표 전속 실수령=소득-세금-본부장", cTax.scenarios.exclusiveContract.actorNetIncome,
        cTax.scenarios.exclusiveContract.actorGrossIncome - cTax.scenarios.exclusiveContract.personalTax -
        cTax.scenarios.exclusiveContract.directorCost);
      eq("종소세+지방=총세금", cTax.scenarios.exclusiveContract.incomeTax + cTax.scenarios.exclusiveContract.localIncomeTax,
        cTax.scenarios.exclusiveContract.personalTax);
      eq("개인세는 CF 불변", App.Engine.runSimulation(sTax).kpis.endClosing, rTax.kpis.endClosing);
      sTax.settings.scenarios.exclusiveContract.personalTax.mode = "manual";
      sTax.settings.scenarios.exclusiveContract.personalTax.manualTaxAmount = 100000000;
      var cMan = App.Engine.runScenarioComparison(sTax, rTax);
      eq("비교 수동 우선", cMan.scenarios.exclusiveContract.personalTax, 100000000);
      eq("비교 수동 실수령", cMan.scenarios.exclusiveContract.actorNetIncome, 530000000);
      sTax.settings.scenarios.exclusiveContract.personalTax.mode = "auto";
      sTax.settings.scenarios.exclusiveContract.personalTax.incomeDeduction = 1500000;
      sTax.settings.scenarios.exclusiveContract.personalTax.prepaidTax = 2000000;
      var roundTax = App.Store.parseImport(App.Store.exportJson(sTax));
      eq("JSON 모드 auto 복원", roundTax.settings.scenarios.exclusiveContract.personalTax.mode, "auto");
      eq("JSON 소득공제 복원", roundTax.settings.scenarios.exclusiveContract.personalTax.incomeDeduction, 1500000);
      eq("JSON 기납부 복원", roundTax.settings.scenarios.exclusiveContract.personalTax.prepaidTax, 2000000);
      var rawLegacy = JSON.parse(App.Store.exportJson(empty()));
      rawLegacy.settings.scenarios.exclusiveContract.personalTax = { mode: "manual", manualTaxAmount: 777, effectiveRate: 0 };
      var legacyTax = App.Store.parseImport(JSON.stringify(rawLegacy));
      eq("구 JSON 수동 유지", legacyTax.settings.scenarios.exclusiveContract.personalTax.mode, "manual");
      eq("구 JSON 수동액 유지", legacyTax.settings.scenarios.exclusiveContract.personalTax.manualTaxAmount, 777);
      var htmlTax = App.Render.renderView("analysis", sTax, rTax, { analysisTab: "income-tax" });
      var cHtml = App.Engine.runScenarioComparison(sTax, rTax);
      assert("계산기 제목", htmlTax.indexOf("같은 매출이라면, 실제로 얼마나 차이 날까?") >= 0);
      assert("계산기 상세 제목 유지", htmlTax.indexOf("종합소득세 계산") >= 0);
      assert("계산기 주의문구", htmlTax.indexOf("시뮬레이션용 예상세액이며 실제 신고세액과 다를 수 있습니다") >= 0);
      assert("계산기 과세표준", htmlTax.indexOf("과세표준") >= 0);
      assert("계산기 세후 실수령", htmlTax.indexOf("세후 개인 실수령") >= 0);
      assert("결론 내가 바로 받는 돈", htmlTax.indexOf("내가 바로 받는 돈") >= 0);
      assert("결론 전체 기간 누적 세후순이익", htmlTax.indexOf("전체 기간 누적 세후순이익") >= 0);
      assert("결론 선택 효과", htmlTax.indexOf("1인 기획사 선택 효과") >= 0);
      assert("청산 가정 카드", htmlTax.indexOf("법인을 지금 청산한다면?") >= 0);
      assert("세금 상세는 접힘", htmlTax.indexOf("세금 계산 상세 보기") >= 0);
      assert("계산 조건은 접힘", htmlTax.indexOf("계산 조건 및 세부 설정") >= 0);
      var heroIdx = htmlTax.indexOf("1인 기획사 선택 효과");
      assert("결론 강조 박스", heroIdx >= 0 && htmlTax.slice(heroIdx - 80, heroIdx).indexOf("tax-decision") >= 0);
      var liqIdx = htmlTax.indexOf("지금 청산한다고 가정");
      assert("청산 가정 강조", liqIdx >= 0 && htmlTax.slice(liqIdx - 80, liqIdx).indexOf("tax-decision") >= 0);
      assert("청산세 계산 라인 존재", htmlTax.indexOf("청산 후 법인 잔여") >= 0 &&
        htmlTax.indexOf("청산 후 경제가치") >= 0);
      assert("계산기에서 원장 숨김", htmlTax.indexOf("월별 손익 · 현금흐름") < 0);
      assert("한눈에 비교에서 기말 현금 맞춤 본문 숨김", htmlTax.indexOf("analysis-cash-board") < 0);
      assert("한눈에 비교 배수 선택", htmlTax.indexOf('data-action="select-multiplier"') >= 0);
      assert("한눈에 비교 기본 1배", htmlTax.indexOf('data-multiplier="1"') >= 0);
      var htmlTax2x = App.Render.renderView("analysis", sTax, rTax, {
        analysisTab: "income-tax", multiplierSelected: 2
      });
      assert("한눈에 비교 2배 카드", htmlTax2x.indexOf('data-multiplier="2"') >= 0);
      assert("2배 안내", htmlTax2x.indexOf("현재 등록 매출의 2배") >= 0);
      var glanceRev1 = (htmlTax.match(/같은 매출 <b>([^<]+)<\/b>/) || [])[1];
      var glanceRev2 = (htmlTax2x.match(/같은 매출 <b>([^<]+)<\/b>/) || [])[1];
      assert("2배 매출 표시가 1배와 다름", !!(glanceRev1 && glanceRev2 && glanceRev1 !== glanceRev2));
      assert("계산기 T비교표", htmlTax.indexOf("tax-pair") >= 0);
      assert("계산기 좌측 전속", htmlTax.indexOf("<th>기존 회사 전속</th>") >= 0);
      assert("계산기 우측 기획사", htmlTax.indexOf("<th>1인 기획사</th>") >= 0);
      assert("계산기 시나리오 토글 없음", htmlTax.indexOf("personal-tax-scenario") < 0);
      assert("계산기 공통 연도", htmlTax.indexOf("settings.personalTaxCommon.year") >= 0);
      assert("계산기 자동값 박스", htmlTax.indexOf("tax-auto-value") >= 0);
      assert("계산기 자동값 태그", htmlTax.indexOf("시나리오 연동") >= 0);
      assert("계산기 자동 계산 배지", htmlTax.indexOf("자동 계산") >= 0);
      assert("계산기 수동 입력 배지", htmlTax.indexOf("수동 입력") >= 0);
      assert("계산기 근로소득공제", htmlTax.indexOf("근로소득공제") >= 0);
      assert("계산기 누진공제 자동표시", htmlTax.indexOf("누진공제") >= 0);
      assert("누진공제 입력칸 없음", htmlTax.indexOf("progressiveDeduction") < 0);
      assert("표 간소화로 원천징수·추가세액공제 입력행 제거됨", htmlTax.indexOf("급여 원천징수 (기납부)") < 0 &&
        htmlTax.indexOf("추가 세액공제") < 0);
      assert("기타 기납부세액은 유지", htmlTax.indexOf("기타 기납부세액") >= 0);
      assert("계산기 개인 최종 세부담", htmlTax.indexOf("개인 최종 세부담") >= 0);
      assert("계산기 결정세액", htmlTax.indexOf("결정세액") >= 0);
      assert("귀속연도 블록", htmlTax.indexOf("2027 귀속") >= 0);
      assert("전체기간 세금 합계", htmlTax.indexOf("전체기간 세금 합계") >= 0);
      assert("계산기=비교 전속세금", htmlTax.indexOf(App.Format.formatWon(cHtml.scenarios.exclusiveContract.personalTax)) >= 0);
      assert("계산기=비교 전속실수령", htmlTax.indexOf(App.Format.formatWon(cHtml.scenarios.exclusiveContract.actorNetIncome)) >= 0);
      assert("계산기=비교 기획사세금", htmlTax.indexOf(App.Format.formatWon(cHtml.scenarios.soloAgency.personalTax)) >= 0);
      assert("계산기=비교 경제가치 차이", htmlTax.indexOf(App.Format.formatWon(cHtml.deltas.controlledEconomicValue)) >= 0 ||
        htmlTax.indexOf("+" + App.Format.formatWon(cHtml.deltas.controlledEconomicValue)) >= 0);
      eq("JSON 공통연도 복원", roundTax.settings.personalTaxCommon.year, 2026);
      eq("JSON 공통모드 복원", roundTax.settings.personalTaxCommon.mode, "auto");
      sTax.settings.personalTaxCommon.year = 2025;
      App.Defaults.applyPersonalTaxCommon(sTax);
      eq("공통연도 전속 동기화", sTax.settings.scenarios.exclusiveContract.personalTax.year, 2025);
      eq("공통연도 기획사 동기화", sTax.settings.scenarios.soloAgency.personalTax.year, 2025);
    } catch (e) { fail("종합소득세 예외", e.message || e); }

    try {
      eq("tax-year 2026-10", App.TaxYear.yearOf("2026-10"), 2026);
      eq("tax-year 목록", App.TaxYear.yearsFromMonths(["2026-10", "2026-12", "2027-01"]).join(","), "2026,2027");
      var sOneYear = empty();
      sOneYear.profile.startMonth = "2027-01";
      sOneYear.profile.endMonth = "2027-01";
      var pOne = App.Defaults.newProject("2027-01", "drama");
      pOne.status = "confirmed";
      pOne.contractAmount = 100000000;
      pOne.directExpenses = [];
      pOne.payments = [Object.assign(App.Defaults.newPayment("2027-01"), { amount: 100000000, inputMode: "amount" })];
      sOneYear.projects = [pOne];
      sOneYear.revenueFees = [];
      sOneYear.employees = [];
      var rOneYear = App.Engine.runSimulation(sOneYear);
      var lumpOne = App.Engine.calculateEstimatedTax(
        { revenue: rOneYear.kpis.revenue, pnlExpense: rOneYear.kpis.pnlExpense },
        sOneYear.settings.tax,
        2027
      );
      eq("T1 한 해 법인세=기간합산", rOneYear.kpis.tax, lumpOne.total);
      eq("T1 한 해 taxDetail.years 1개", rOneYear.kpis.taxDetail.years.length, 1);

      var sTwo = empty();
      noOwnerDividend(sTwo);
      sTwo.profile.startMonth = "2026-12";
      sTwo.profile.endMonth = "2027-01";
      sTwo.employees = [];
      sTwo.revenueFees = [];
      sTwo.recurringExpenses = [{
        id: "rent-year", name: "월세", amount: 80000000, include: true, overrides: {}
      }];
      var pA = App.Defaults.newProject("2026-12", "drama");
      pA.status = "confirmed";
      pA.name = "2026입금";
      pA.contractAmount = 50000000;
      pA.directExpenses = [];
      pA.payments = [Object.assign(App.Defaults.newPayment("2026-12"), { amount: 50000000, inputMode: "amount" })];
      var pB = App.Defaults.newProject("2027-01", "drama");
      pB.status = "confirmed";
      pB.name = "2027입금";
      pB.contractAmount = 200000000;
      pB.directExpenses = [];
      pB.payments = [Object.assign(App.Defaults.newPayment("2027-01"), { amount: 200000000, inputMode: "amount" })];
      sTwo.projects = [pA, pB];
      App.Defaults.ensureTaxSettings(sTwo);
      sTwo.settings.tax.lossCarryforward.apply = false;
      App.Defaults.ensureVatSettings(sTwo);
      sTwo.settings.vat.on = false;
      var rTwo = App.Engine.runSimulation(sTwo);
      var y2026 = rTwo.kpis.taxDetail.byYear[2026];
      var y2027 = rTwo.kpis.taxDetail.byYear[2027];
      var lumpTwo = App.Engine.calculateEstimatedTax(
        { revenue: rTwo.kpis.revenue, pnlExpense: rTwo.kpis.pnlExpense },
        sTwo.settings.tax
      );
      eq("T2 연도 키 2개", rTwo.kpis.taxDetail.years.length, 2);
      assert("T2 2026 세전이익 적자", y2026.preTaxProfit < 0);
      eq("T2 2026 과세표준 0 (이월 없음)", y2026.taxableIncome, 0);
      eq("T2 2026 법인세 0", y2026.totalTax, 0);
      eq("T2 2026 세후순이익=세전손실", y2026.afterTaxNet, y2026.preTaxProfit);
      assert("T2 2026 세후순이익은 0으로 없애지 않음", y2026.afterTaxNet < 0);
      eq("T2 법인세=연도합", rTwo.kpis.tax, y2026.totalTax + y2027.totalTax);
      assert("T2 연도합 ≠ 기간합산 법인세", rTwo.kpis.tax !== lumpTwo.total);
      assert("T2 연도분리 법인세가 더 큼 (적자 상계 없음)", rTwo.kpis.tax > lumpTwo.total);
      eq("T2 영업이익 불변 공식", rTwo.kpis.operatingProfit, rTwo.kpis.revenue - rTwo.kpis.pnlExpense);
      eq("T2 기말현금은 세금 미차감", rTwo.kpis.endClosing, sTwo.profile.initialCash + rTwo.kpis.revenue - rTwo.kpis.pnlExpense);

      sTwo.settings.tax.lossCarryforward.apply = true;
      var rTwoNol = App.Engine.runSimulation(sTwo);
      var y26n = rTwoNol.kpis.taxDetail.byYear[2026];
      var y27n = rTwoNol.kpis.taxDetail.byYear[2027];
      eq("T2b 2026 과세표준 0", y26n.taxableIncome, 0);
      eq("T2b 2026 세후순이익=세전손실", y26n.afterTaxNet, y26n.preTaxProfit);
      eq("T2b 기간 세후순이익=연도합", rTwoNol.kpis.taxDetail.afterTaxNet,
        App.Money.roundWon(y26n.afterTaxNet + y27n.afterTaxNet));
      eq("T2b 기간 세후순이익=영업이익-세금", rTwoNol.kpis.taxDetail.afterTaxNet,
        App.Money.roundWon(rTwoNol.kpis.operatingProfit - rTwoNol.kpis.tax));
      eq("T2b 2026 발생결손", y26n.nolIncurred, App.Money.roundWon(-y26n.preTaxProfit));
      eq("T2b 2027 사용액", y27n.nolUsed, y26n.nolIncurred);
      eq("T2b 2027 과세표준", y27n.taxableIncome, App.Money.roundWon(y27n.preTaxProfit - y27n.nolUsed));
      var htmlTwoNol = App.Render.renderView("analysis", sTwo, rTwoNol, { analysisTab: "scenarios" });
      assert("시나리오 비교에 이월결손금 공제", htmlTwoNol.indexOf("이월결손금 공제") >= 0);
      assert("시나리오 비교에 2027 공제액",
        htmlTwoNol.indexOf(App.Format.formatWon(-Math.abs(y27n.nolUsed))) >= 0);
      eq("T2b 이월 시 법인세=기간합산", rTwoNol.kpis.tax, lumpTwo.total);
      eq("T2b 기말현금 불변", rTwoNol.kpis.endClosing, rTwo.kpis.endClosing);

      sTwo.settings.tax.lossCarryforward.openingBalance = 10000000;
      var rOpen = App.Engine.runSimulation(sTwo);
      var y27o = rOpen.kpis.taxDetail.byYear[2027];
      eq("시작잔액 2027 사용", y27o.nolUsed, App.Money.roundWon(10000000 + y26n.nolIncurred));
      eq("시작잔액 2027 과세표준", y27o.taxableIncome, App.Money.roundWon(y27o.preTaxProfit - y27o.nolUsed));
      sTwo.settings.tax.lossCarryforward.openingBalance = 0;

      var sLim = empty();
      sLim.profile.startMonth = "2027-01";
      sLim.profile.endMonth = "2027-01";
      sLim.employees = [];
      sLim.revenueFees = [];
      var pLim = App.Defaults.newProject("2027-01", "drama");
      pLim.status = "confirmed";
      pLim.contractAmount = 50000000;
      pLim.directExpenses = [];
      pLim.expenseInclude = false;
      pLim.payments = [Object.assign(App.Defaults.newPayment("2027-01"), { amount: 50000000, inputMode: "amount" })];
      sLim.projects = [pLim];
      App.Defaults.ensureTaxSettings(sLim);
      sLim.settings.tax.lossCarryforward.openingBalance = 100000000;
      sLim.settings.tax.lossCarryforward.limitRate = 0.8;
      var rLim = App.Engine.runSimulation(sLim);
      var yLim = rLim.kpis.taxDetail.byYear[2027];
      eq("한도 80% 사용 4000만", yLim.nolUsed, 40000000);
      eq("한도 80% 과세표준 1000만", yLim.taxableIncome, 10000000);

      var sBack = empty();
      sBack.profile.startMonth = "2026-12";
      sBack.profile.endMonth = "2027-01";
      sBack.employees = [];
      sBack.revenueFees = [];
      var pBack = App.Defaults.newProject("2026-12", "drama");
      pBack.status = "confirmed";
      pBack.contractAmount = 50000000;
      pBack.directExpenses = [];
      pBack.expenseInclude = false;
      pBack.payments = [Object.assign(App.Defaults.newPayment("2026-12"), { amount: 50000000, inputMode: "amount" })];
      sBack.projects = [pBack];
      sBack.recurringExpenses = [{
        id: "loss27", name: "비용", amount: 0, include: true,
        overrides: { "2027-01": 20000000 }
      }];
      App.Defaults.ensureTaxSettings(sBack);
      var rBack = App.Engine.runSimulation(sBack);
      var lumpBack26 = App.Engine.calculateEstimatedTax({ revenue: 50000000, pnlExpense: 0 }, sBack.settings.tax, 2026);
      eq("소급없음 2026 과세표준", rBack.kpis.taxDetail.byYear[2026].taxableIncome, 50000000);
      eq("소급없음 2026 세액", rBack.kpis.taxDetail.byYear[2026].totalTax, lumpBack26.total);
      eq("소급없음 2027 과세표준 0", rBack.kpis.taxDetail.byYear[2027].taxableIncome, 0);
      eq("소급없음 2027 발생결손", rBack.kpis.taxDetail.byYear[2027].nolIncurred, 20000000);

      var sChain = empty();
      sChain.profile.startMonth = "2026-12";
      sChain.profile.endMonth = "2028-01";
      sChain.employees = [];
      sChain.revenueFees = [];
      sChain.recurringExpenses = [{
        id: "chain", name: "비용", amount: 0, include: true,
        overrides: { "2026-12": 10000000, "2027-01": 20000000 }
      }];
      var pChain = App.Defaults.newProject("2028-01", "drama");
      pChain.status = "confirmed";
      pChain.contractAmount = 50000000;
      pChain.directExpenses = [];
      pChain.expenseInclude = false;
      pChain.payments = [Object.assign(App.Defaults.newPayment("2028-01"), { amount: 50000000, inputMode: "amount" })];
      sChain.projects = [pChain];
      App.Defaults.ensureTaxSettings(sChain);
      var rChain = App.Engine.runSimulation(sChain);
      eq("3년체인 2028 과세표준 2000만", rChain.kpis.taxDetail.byYear[2028].taxableIncome, 20000000);
      eq("3년체인 사용 3000만", rChain.kpis.taxDetail.byYear[2028].nolUsed, 30000000);

      sTwo.settings.tax.adjustments = [{ id: "adj1", year: 2027, amount: -10000000, label: "접대비" }];
      var rAdj = App.Engine.runSimulation(sTwo);
      eq("세무조정 금액", rAdj.kpis.taxDetail.byYear[2027].taxAdjustment, -10000000);
      eq("세무조정 2027 과세표준", rAdj.kpis.taxDetail.byYear[2027].taxableIncome,
        App.Money.roundWon(rAdj.kpis.taxDetail.byYear[2027].adjustedProfit - rAdj.kpis.taxDetail.byYear[2027].nolUsed));
      sTwo.settings.tax.adjustments = [];

      var sMar = empty();
      sMar.profile.startMonth = "2026-12";
      sMar.profile.endMonth = "2027-03";
      sMar.employees = [];
      sMar.revenueFees = [];
      var pMar = App.Defaults.newProject("2026-12", "drama");
      pMar.status = "confirmed";
      pMar.contractAmount = 100000000;
      pMar.directExpenses = [];
      pMar.expenseInclude = false;
      pMar.payments = [Object.assign(App.Defaults.newPayment("2026-12"), { amount: 100000000, inputMode: "amount" })];
      sMar.projects = [pMar];
      App.Defaults.ensureTaxSettings(sMar);
      var rMarNone = App.Engine.runSimulation(sMar);
      sMar.settings.tax.cashOutMode = "nextMarch";
      var rMar = App.Engine.runSimulation(sMar);
      var tax2026Mar = rMar.kpis.taxDetail.byYear[2026].totalTax;
      var marPay = monthRow(rMar, "2027-03");
      eq("nextMarch 3월 납부", marPay.taxCashOut, tax2026Mar);
      eq("nextMarch 법인세 납부=귀속법인세", marPay.corporateTaxCashOut,
        rMar.kpis.taxDetail.byYear[2026].corporateTax);
      eq("nextMarch 지방소득세 납부=귀속지방세", marPay.localIncomeTaxCashOut,
        rMar.kpis.taxDetail.byYear[2026].localIncomeTax);
      eq("nextMarch 법인세+지방=총납부",
        App.Money.roundWon(marPay.corporateTaxCashOut + marPay.localIncomeTaxCashOut), tax2026Mar);
      eq("nextMarch 매출월은 세액 미차감", monthRow(rMar, "2026-12").taxCashOut, 0);
      eq("nextMarch 기말=미차감-세액", rMar.kpis.endClosing, rMarNone.kpis.endClosing - tax2026Mar);
      eq("nextMarch 1월은 미납부", monthRow(rMar, "2027-01").taxCashOut, 0);
      var htmlMar = App.Render.renderView("analysis", sMar, rMar, { analysisTab: "monthly" });
      assert("nextMarch 법인세 및 주민세 납부 행", htmlMar.indexOf("법인세 및 주민세 납부") >= 0);
      assert("nextMarch 분리 납부행 없음", htmlMar.indexOf("법인지방소득세 납부") < 0);
      assert("nextMarch 현금증감 없음", htmlMar.indexOf("현금증감") < 0);
      sMar.settings.tax.cashOutMonth = "2027-01";
      var rWin = App.Engine.runSimulation(sMar);
      eq("지정월이 합계를 이김", monthRow(rWin, "2027-01").taxCashOut, rWin.kpis.tax);
      eq("지정월이면 3월 0", monthRow(rWin, "2027-03").taxCashOut, 0);

      var sThree = empty();
      sThree.profile.startMonth = "2026-12";
      sThree.profile.endMonth = "2028-01";
      var rThree = App.Engine.runSimulation(sThree);
      eq("T3 3개 과세연도", rThree.kpis.taxDetail.years.join(","), "2026,2027,2028");

      var cmpTwo = App.Engine.runScenarioComparison(sTwo, rTwo);
      var exSlices = cmpTwo.scenarios.exclusiveContract.taxYears;
      eq("T4 전속 연도 슬라이스 2개", exSlices.length, 2);
      var lumpExGross = App.Money.roundWon(Math.max(0, cmpTwo.commonRevenue -
        App.Engine.splitCostsByRule(App.Engine.exclusiveCostBuckets(sTwo, rTwo),
          sTwo.settings.scenarios.exclusiveContract.costBurdenRules).deductibleBeforeSplit) *
        App.Money.toRatio(sTwo.settings.scenarios.exclusiveContract.actorShareRate));
      var lumpExTax = App.Engine.calculateScenarioPersonalTaxDetail(lumpExGross, {
        mode: "auto", year: 2027, useLinkedIncome: true, incomeType: "business"
      }).totalPersonalTax;
      assert("T4 전속 종소세 ≠ 기간 한 과세표준", cmpTwo.scenarios.exclusiveContract.personalTax !== lumpExTax);
      eq("T4 전속 종소세=연도합", cmpTwo.scenarios.exclusiveContract.personalTax,
        App.Money.roundWon((cmpTwo.scenarios.exclusiveContract.personalTaxByYear[2026] || 0) +
          (cmpTwo.scenarios.exclusiveContract.personalTaxByYear[2027] || 0)));

      var htmlTwoBoard = App.Render.renderView("analysis", sTwo, rTwo, { analysisTab: "scenarios" });
      assert("가로 비교 2026 열", htmlTwoBoard.indexOf("<h5>2026</h5>") >= 0);
      assert("가로 비교 2027 열", htmlTwoBoard.indexOf("<h5>2027</h5>") >= 0);
      assert("회사는 전체기간 1열", htmlTwoBoard.indexOf("<h5>전체기간</h5>") >= 0);
      assert("전체 세후 footer", htmlTwoBoard.indexOf("전체 세후 법인잔여") >= 0 &&
        htmlTwoBoard.indexOf("전체 세후 개인실수령") >= 0);
      assert("법인잔여에 같은 금액 별", htmlTwoBoard.indexOf("전체 세후 법인잔여") >= 0 &&
        htmlTwoBoard.indexOf("same-amt") >= 0);
      assert("세후순이익에 노랑 같은 금액 별", htmlTwoBoard.indexOf("same-amt-gold") >= 0 &&
        htmlTwoBoard.indexOf("전체 기간 누적 세후순이익") >= 0);
      assert("연도 탭 없음", htmlTwoBoard.indexOf("data-action=\"scenario-year\"") < 0);
      assert("시나리오 개인 상세 2026 귀속", htmlTwoBoard.indexOf("2026 귀속") >= 0);
      assert("시나리오 개인 상세 2027 귀속", htmlTwoBoard.indexOf("2027 귀속") >= 0);

      var htmlTwo = App.Render.renderView("analysis", sTwo, rTwo, { analysisTab: "income-tax" });
      assert("T9 2026 귀속 UI", htmlTwo.indexOf("2026 귀속") >= 0);
      assert("T9 2027 귀속 UI", htmlTwo.indexOf("2027 귀속") >= 0);
      assert("T9 전체기간 합계 UI", htmlTwo.indexOf("전체기간 세금 합계") >= 0);
      assert("T9 이월결손금 설정", htmlTwo.indexOf("이월결손금 적용") >= 0);
      assert("T9 세무조정 UI", htmlTwo.indexOf("세무조정") >= 0);
      var htmlNol = App.Render.renderView("analysis", sTwo, rTwoNol, { analysisTab: "income-tax" });
      assert("T9 당해 결손금 UI", htmlNol.indexOf("당해 결손금") >= 0);
      assert("T9 이월결손금 사용 UI", htmlNol.indexOf("이월결손금 사용") >= 0);

      var sample = App.Sample.load();
      var sampleRun = App.Engine.runSimulation(sample);
      eq("샘플 기말현금 불변", sampleRun.kpis.endClosing, 1204738995);
      eq("샘플 최저잔액 불변", sampleRun.kpis.minClosing, 8576879);
      eq("샘플 추가 필요자금 0", sampleRun.kpis.deficitCover, 0);
      var htmlSampleDash = App.Render.renderView("dashboard", sample, sampleRun);
      assert("샘플 대시보드에 권장 운전자금 없음", htmlSampleDash.indexOf("권장 운전자금") < 0);
      assert("대시보드에 작품 전체 상세 없음", htmlSampleDash.indexOf("작품 전체") < 0);
      assert("대시보드에 지급 일정 표 없음", htmlSampleDash.indexOf("지급 일정 (% · 월 · 원)") < 0);
      assert("대시보드 손익계산서 유지", htmlSampleDash.indexOf("손익계산서") >= 0 &&
        htmlSampleDash.indexOf("총매출") >= 0 && htmlSampleDash.indexOf("매출총이익") >= 0 &&
        htmlSampleDash.indexOf("영업이익") >= 0 && htmlSampleDash.indexOf("세후이익") >= 0);
      assert("대시보드 1인 vs 전속 비교", htmlSampleDash.indexOf("1인 기획사 vs 기존 회사 전속") >= 0 &&
        htmlSampleDash.indexOf("1인 기획사 경제가치") >= 0 && htmlSampleDash.indexOf("기존 회사 전속 경제가치") >= 0);
      assert("대시보드에서 손익카드 제거", htmlSampleDash.indexOf("손익 · 현금 구분") < 0);
      var dashCmp = htmlSampleDash.slice(htmlSampleDash.indexOf("1인 기획사 vs 기존 회사 전속"));
      assert("비교 카드에 보증금 없음", dashCmp.indexOf("보증금") < 0);
      assert("대시보드 현금 요약 유지", htmlSampleDash.indexOf("추가 필요자금") >= 0);
      assert("대시보드 히어로 KPI", htmlSampleDash.indexOf("dash-hero") >= 0 && htmlSampleDash.indexOf("월말 자금") >= 0);
      assert("대시보드 히어로 기간말 현금", htmlSampleDash.indexOf("기간말 현금") >= 0);
      assert("대시보드 히어로 최저 잔액", htmlSampleDash.indexOf("최저 잔액") >= 0);
      assert("대시보드 히어로 기간 입금", htmlSampleDash.indexOf("기간 입금") >= 0);
      eq("헤더 미니 KPI는 대시보드 외 미렌더", App.Render.renderSticky(sampleRun), "");
      var htmlLoadGate = App.Render.renderView("dashboard", sample, sampleRun, { savedLoadOpen: true });
      assert("첫 화면 불러오기 카드", htmlLoadGate.indexOf("저장된 값 불러오기") >= 0 &&
        htmlLoadGate.indexOf('data-action="load-saved"') >= 0);
      assert("첫 화면에서는 대시보드 숫자 숨김", htmlLoadGate.indexOf("dash-hero") < 0);
      assert("일반 대시보드는 불러오기 카드 없음", htmlSampleDash.indexOf('data-action="load-saved"') < 0);
      ["simulation", "revenue", "costs", "analysis", "settings"].forEach(function (view) {
        var htmlOther = App.Render.renderView(view, sample, sampleRun, {
          costTab: "opex", analysisTab: "monthly", simTab: "org"
        });
        assert(view + " 탭에 헤더 KPI 없음", htmlOther.indexOf("kpis-mini") < 0 && htmlOther.indexOf("dash-hero") < 0);
      });
    } catch (e) { fail("귀속연도 분리 예외", e.message || e); }

    try {
      var s2 = empty();
      s2.profile.startMonth = "2027-01";
      s2.profile.endMonth = "2027-12";
      var p = App.Defaults.newProject();
      p.name = "A 드라마";
      p.contractAmount = 600000000;
      p.status = "confirmed";
      p.payments = [
        Object.assign(App.Defaults.newPayment("2027-01"), { label: "계약금", amount: 120000000, inputMode: "amount" }),
        Object.assign(App.Defaults.newPayment("2027-04"), { label: "중도금", amount: 240000000, inputMode: "amount" }),
        Object.assign(App.Defaults.newPayment("2027-09"), { label: "잔금", amount: 240000000, inputMode: "amount" })
      ];
      s2.projects = [p];
      var r2 = App.Engine.runSimulation(s2);
      eq("Case2 1월 입금", monthRow(r2, "2027-01").inflow, 120000000);
      eq("Case2 3월 입금 0", monthRow(r2, "2027-03").inflow, 0);
      eq("Case2 4월 입금", monthRow(r2, "2027-04").inflow, 240000000);
      eq("Case2 9월 입금", monthRow(r2, "2027-09").inflow, 240000000);
      eq("Case2 기간 입금 합", r2.kpis.inflowInPeriod, 600000000);
    } catch (e) { fail("Case2 예외", e.message || e); }

    try {
      var sDashY = empty();
      sDashY.profile.startMonth = "2026-10";
      sDashY.profile.endMonth = "2027-12";
      sDashY.profile.initialCash = 60000000;
      var pDashY = App.Defaults.newProject("2026-10", "drama", sDashY);
      pDashY.name = "연도분할 작품";
      pDashY.status = "confirmed";
      pDashY.contractAmount = 800000000;
      pDashY.shootStartMonth = "2026-10";
      pDashY.shootEndMonth = "2026-12";
      pDashY.payments = [
        Object.assign(App.Defaults.newPayment("2026-12"), { amount: 200000000, inputMode: "amount" }),
        Object.assign(App.Defaults.newPayment("2027-03"), { amount: 600000000, inputMode: "amount" })
      ];
      sDashY.projects = [pDashY];
      var rDashY = App.Engine.runSimulation(sDashY);
      eq("연도분할 계약총액 전체", rDashY.kpis.contractTotal, 800000000);
      eq("연도분할 입금 전체", rDashY.kpis.inflowInPeriod, 800000000);
      eq("연도분할 2026 입금", monthRow(rDashY, "2026-12").inflow, 200000000);
      eq("연도분할 2027 입금", monthRow(rDashY, "2027-03").inflow, 600000000);
      var grossAll = rDashY.kpis.revenue - rDashY.kpis.projectDirect - rDashY.kpis.agencyFees;
      eq("연도분할 매출총이익=매출-직접비-수수료",
        App.Money.roundWon((rDashY.ledger.groups.filter(function (g) { return g.id === "gross-profit"; })[0] || { subtotal: { total: 0 } }).subtotal.total),
        App.Money.roundWon(grossAll));
    } catch (e) { fail("대시보드 연도분할 예외", e.message || e); }

    try {
      var s3 = empty();
      var p3 = App.Defaults.newProject();
      p3.contractAmount = 600000000;
      p3.payments = [
        Object.assign(App.Defaults.newPayment("2027-01"), { amount: 550000000, inputMode: "amount" })
      ];
      s3.projects = [p3];
      var r3 = App.Engine.runSimulation(s3);
      assert("Case3 부족 경고", hasWarning(r3, "payment_short"));
      eq("Case3 입금은 5.5억", r3.kpis.inflowInPeriod, 550000000);
    } catch (e) { fail("Case3 예외", e.message || e); }

    try {
      var s4 = empty();
      s4.profile.startMonth = "2027-03";
      s4.profile.endMonth = "2027-03";
      s4.settings.meal.dailyRate = 15000;
      s4.settings.meal.calendarMode = "weekdaysExcludingHolidays";
      s4.mealExtraHeadcount = 3;
      var r4 = App.Engine.runSimulation(s4);
      var row4 = monthRow(r4, "2027-03");
      var days4 = row4.mealBreakdown.workingDays;
      eq("Case4 식대 공식", row4.mealBaseAmount, 15000 * 3 * days4);
      eq("Case4 회식야근 여유 50%", row4.mealExtraAmount, App.Money.roundWon(row4.mealBaseAmount * 0.5));
      eq("Case4 복리후생비 = (식대+여유) x2", row4.meal, App.Money.roundWon((row4.mealBaseAmount + row4.mealExtraAmount) * 2));
      assert("Case4 적용일 > 0", days4 > 0);
      assert("Case4 공휴일 제외됨", row4.mealBreakdown.holidaysExcluded >= 1);
    } catch (e) { fail("Case4 예외", e.message || e); }

    try {
      var s5 = empty();
      s5.profile.startMonth = "2027-03";
      s5.profile.endMonth = "2027-03";
      s5.settings.meal.dailyRate = 15000;
      s5.mealExtraHeadcount = 3;
      var base5 = App.Engine.runSimulation(s5);
      s5.forcedWorkdays = [{ date: "2027-03-01", label: "촬영" }];
      var r5 = App.Engine.runSimulation(s5);
      eq("Case5 식대 1일 증가", r5.months[0].mealBaseAmount, base5.months[0].mealBaseAmount + 15000 * 3);
      eq("Case5 강제근무 1", r5.months[0].mealBreakdown.forcedOn, 1);
    } catch (e) { fail("Case5 예외", e.message || e); }

    try {
      var s6 = empty();
      s6.profile.startMonth = "2027-01";
      s6.profile.endMonth = "2027-03";
      s6.profile.initialCash = 20000000;
      s6.recurringExpenses = [{
        id: "r1", name: "고정비", amount: 15000000,
        startMonth: "2027-01", endMonth: "2027-03", include: true, overrides: {}
      }];
      var r6 = App.Engine.runSimulation(s6);
      assert("Case6 음수월", r6.months.some(function (m) { return m.closing < 0; }));
      eq("Case6 적자보전", r6.kpis.deficitCover, Math.max(0, -r6.kpis.minClosing));
      var htmlDash6 = App.Render.renderView("dashboard", s6, r6);
      var startCash6 = App.Money.roundWon(s6.profile.initialCash + r6.kpis.deficitCover);
      assert("대시보드 추가 필요자금", htmlDash6.indexOf("추가 필요자금") >= 0);
      assert("대시보드 최소 운전자금 명칭 제거", htmlDash6.indexOf("최소 운전자금") < 0);
      assert("대시보드 권장 운전자금 제거", htmlDash6.indexOf("권장 운전자금") < 0);
      assert("대시보드 추가 필요자금 금액", htmlDash6.indexOf(App.Format.formatWon(r6.kpis.deficitCover)) >= 0);
      eq("최소 시작자금 = 최초현금 + 추가필요", startCash6, App.Money.roundWon(s6.profile.initialCash + Math.max(0, -r6.kpis.minClosing)));
    } catch (e) { fail("Case6 예외", e.message || e); }

    try {
      var s7 = empty();
      s7.profile.startMonth = "2027-01";
      s7.profile.endMonth = "2027-01";
      s7.profile.initialCash = 100000000;
      s7.deposits = [{
        id: "d1", name: "사무실", actualAmount: 50000000, include: true, month: "2027-01", qty: 1
      }];
      var r7 = App.Engine.runSimulation(s7);
      eq("Case7 현금유출에 보증금", r7.months[0].deposits, 50000000);
      eq("Case7 손익비용 0", r7.months[0].pnlExpense, 0);
      eq("Case7 영업이익 불변", r7.kpis.operatingProfit, 0);
      eq("Case7 월말", r7.months[0].closing, 50000000);
    } catch (e) { fail("Case7 예외", e.message || e); }

    try {
      var s8 = empty();
      var before = App.Engine.runSimulation(s8);
      var proj = App.Defaults.newProject();
      proj.contractAmount = 10000000;
      proj.payments = [Object.assign(App.Defaults.newPayment("2027-01"), { amount: 10000000, inputMode: "amount" })];
      s8.projects = [proj];
      s8.employees = [{
        id: "e1", name: "매니저", monthlySalary: 3000000,
        startMonth: "2027-01", endMonth: "2027-12", insure: false, meal: false, include: true
      }];
      s8.recurringExpenses = [{
        id: "r2", name: "임대", amount: 1000000,
        startMonth: "2027-01", endMonth: "2027-12", include: true, overrides: {}
      }];
      var mid = App.Engine.runSimulation(s8);
      assert("Case8 합계 증가", mid.kpis.inflowInPeriod > before.kpis.inflowInPeriod &&
        mid.kpis.pnlExpense > before.kpis.pnlExpense);
      s8.projects = [];
      s8.employees = [];
      s8.recurringExpenses = [];
      var after = App.Engine.runSimulation(s8);
      eq("Case8 삭제 후 복귀 입금", after.kpis.inflowInPeriod, before.kpis.inflowInPeriod);
      eq("Case8 삭제 후 복귀 비용", after.kpis.pnlExpense, before.kpis.pnlExpense);
    } catch (e) { fail("Case8 예외", e.message || e); }

    try {
      var s9 = empty();
      s9.profile.initialCash = "";
      s9.projects = [{
        id: "p", name: "x", status: "expected", contractAmount: "abc",
        payments: [{ id: "1", label: "계약금", inputMode: "amount", amount: null, expectedMonth: "2027-01" }],
        directExpenses: []
      }];
      var r9 = App.Engine.runSimulation(s9);
      assert("Case9 NaN 없음", r9.months.every(function (row) {
        return Number.isFinite(row.closing) && Number.isFinite(row.inflow) && Number.isFinite(row.pnlExpense);
      }));
      eq("Case9 문자 금액 0", r9.kpis.inflowInPeriod, 0);
    } catch (e) { fail("Case9 예외", e.message || e); }

    try {
      var s10 = empty();
      s10.profile.startMonth = "2027-01";
      s10.profile.endMonth = "2027-12";
      s10.recurringExpenses = [{
        id: "r3", name: "임대", amount: 1000000,
        periodMode: "custom", startMonth: "2027-01", endMonth: "2027-12", include: true, overrides: {}
      }];
      eq("Case10 12개월", App.Engine.runSimulation(s10).months.length, 12);
      s10.profile.endMonth = "2028-12";
      var r10 = App.Engine.runSimulation(s10);
      eq("Case10 24개월", r10.months.length, 24);
      eq("Case10 2028-01 반복비 0", monthRow(r10, "2028-01").recurring, 0);
      eq("Case10 2027-12 반복비", monthRow(r10, "2027-12").recurring, 1000000);
    } catch (e) { fail("Case10 예외", e.message || e); }

    try {
      var s11 = empty();
      s11.profile.startMonth = "2027-01";
      s11.profile.endMonth = "2027-01";
      s11.profile.initialCash = 10000000;
      var item = {
        id: "st1", name: "CI", actualAmount: 3000000, estimatedAmount: 3000000,
        include: true, month: "2027-01", qty: 1
      };
      s11.startupExpenses = [item];
      var on = App.Engine.runSimulation(s11);
      item.include = false;
      var off = App.Engine.runSimulation(s11);
      eq("Case11 OFF 시 비용 300만 감소", on.kpis.pnlExpense - off.kpis.pnlExpense, 3000000);
      eq("Case11 OFF 시 현금 300만 덜 나감", off.kpis.endClosing - on.kpis.endClosing, 3000000);
      eq("Case11 estimated 유지", item.estimatedAmount, 3000000);
      item.estimatedAmount = 5000000;
      item.actualAmount = 5000000;
      var off2 = App.Engine.runSimulation(s11);
      eq("Case11 OFF 후 금액 수정해도 현금 불변", off2.kpis.endClosing, off.kpis.endClosing);
    } catch (e) { fail("Case11 예외", e.message || e); }

    try {
      var s11b = empty();
      s11b.profile.startMonth = "2027-01";
      s11b.profile.endMonth = "2027-01";
      s11b.profile.initialCash = 10000000;
      s11b.settings.corporateStatus = "new";
      s11b.startupExpenses = [{
        id: "inc1", name: "등록면허세", actualAmount: 1000000, estimatedAmount: 1000000,
        include: true, month: "2027-01", qty: 1, setupCostType: "incorporation"
      }];
      var newCorp = App.Engine.runSimulation(s11b);
      s11b.settings.corporateStatus = "existing";
      var existingCorp = App.Engine.runSimulation(s11b);
      eq("Case11b 신규 설립비 반영", newCorp.months[0].startupCost, 1000000);
      eq("Case11b 기존 설립비 0", existingCorp.months[0].startupCost, 0);
      eq("Case11b 기존 현금 100만 증가", existingCorp.kpis.endClosing - newCorp.kpis.endClosing, 1000000);
      eq("Case11b 데이터 금액 유지", s11b.startupExpenses[0].actualAmount, 1000000);
      s11b.startupExpenses[0].forceInclude = true;
      eq("Case11b 기존 강제반영", App.Engine.runSimulation(s11b).months[0].startupCost, 1000000);
      s11b.settings.corporateStatus = "new";
      eq("Case11b 신규 복원", App.Engine.runSimulation(s11b).months[0].startupCost, 1000000);
    } catch (e) { fail("Case11b 예외", e.message || e); }

    try {
      var s11c = empty();
      s11c.profile.startMonth = "2027-01";
      s11c.profile.endMonth = "2027-01";
      s11c.profile.initialCash = 10000000;
      s11c.settings.corporateStatus = "existing";
      s11c.startupExpenses = [{
        id: "ot1", name: "브랜드 리뉴얼", actualAmount: 2000000, estimatedAmount: 2000000,
        include: true, month: "2027-01", qty: 1, setupCostType: "oneTimeBusiness"
      }];
      s11c.deposits = [{ id: "dep1", name: "새 사무실 보증금", actualAmount: 5000000, include: true, month: "2027-01", qty: 1 }];
      s11c.assets = [{ id: "asset1", name: "컴퓨터", actualAmount: 3000000, include: true, month: "2027-01", qty: 1 }];
      var r11c = App.Engine.runSimulation(s11c);
      eq("Case11c 기존 법인 기타 일회성 반영", r11c.months[0].startupCost, 2000000);
      eq("Case11c 기존 법인 보증금 유지", r11c.months[0].deposits, 5000000);
      eq("Case11c 기존 법인 자산 유지", r11c.months[0].capex, 3000000);
    } catch (e) { fail("Case11c 예외", e.message || e); }

    try {
      var s12 = empty();
      var p12 = App.Defaults.newProject();
      p12.contractAmount = 600000000;
      p12.payments = [{
        id: "pay", label: "계약금", inputMode: "percent", percentage: 0.2,
        amount: 0, expectedMonth: "2027-01"
      }];
      s12.projects = [p12];
      eq("Case12 20% of 6억", App.Engine.runSimulation(s12).kpis.inflowInPeriod, 120000000);
      p12.contractAmount = 300000000;
      eq("Case12 20% of 3억", App.Engine.runSimulation(s12).kpis.inflowInPeriod, 60000000);
    } catch (e) { fail("Case12 예외", e.message || e); }

    try {
      var s13 = empty();
      s13.profile.actorName = "테스트";
      s13.profile.initialCash = 12345;
      var json = App.Store.exportJson(s13);
      var back = App.Store.parseImport(json);
      var a = App.Engine.runSimulation(s13).kpis;
      var b = App.Engine.runSimulation(back).kpis;
      eq("Case13 왕복 초기현금", b.initialCash, a.initialCash);
      eq("Case13 왕복 월말", b.endClosing, a.endClosing);
    } catch (e) { fail("Case13 예외", e.message || e); }

    try {
      var s14 = empty();
      s14.profile.startMonth = "2027-01";
      s14.profile.endMonth = "2027-03";
      s14.profile.initialCash = 20000000;
      s14.profile.safetyCash = 50000000;
      s14.recurringExpenses = [{
        id: "r4", name: "고정비", amount: 15000000,
        startMonth: "2027-01", endMonth: "2027-03", include: true, overrides: {}
      }];
      var r14 = App.Engine.runSimulation(s14);
      eq("Case14 권장운전자금", r14.kpis.recommended, Math.max(0, 50000000 - r14.kpis.minClosing));
    } catch (e) { fail("Case14 예외", e.message || e); }

    try {
      var s15 = empty();
      s15.profile.startMonth = "2029-01";
      s15.profile.endMonth = "2029-12";
      s15.settings.meal.calendarMode = "weekdaysExcludingHolidays";
      s15.settings.meal.dailyRate = 15000;
      s15.mealExtraHeadcount = 1;
      var r15 = App.Engine.runSimulation(s15);
      assert("Case15 holiday_year_missing", hasWarning(r15, "holiday_year_missing"));
      var jan = monthRow(r15, "2029-01");
      assert("Case15 식대 유한", Number.isFinite(jan.meal));
      eq("Case15 공휴일 제외 0", jan.mealBreakdown.holidaysExcluded, 0);
      assert("Case15 평일만", jan.mealBreakdown.workingDays === jan.mealBreakdown.weekdays);
    } catch (e) { fail("Case15 예외", e.message || e); }

    try {
      var s16 = empty();
      s16.profile.startMonth = "2027-01";
      s16.profile.endMonth = "2027-01";
      s16.profile.initialCash = 80000000;
      s16.deposits = [{
        id: "d2", name: "보증금", actualAmount: 50000000, include: true, month: "2027-01"
      }];
      s16.settings.initialCashTiming = "beforeOutflows";
      var before = App.Engine.runSimulation(s16);
      eq("Case16 before opening", before.months[0].opening, 80000000);
      eq("Case16 before deposits", before.months[0].deposits, 50000000);
      eq("Case16 before closing", before.months[0].closing, 30000000);
      s16.settings.initialCashTiming = "afterOutflows";
      var after = App.Engine.runSimulation(s16);
      eq("Case16 after opening 유지", after.months[0].opening, 80000000);
      eq("Case16 after deposits 0", after.months[0].deposits, 0);
      eq("Case16 after closing", after.months[0].closing, 80000000);
      assert("Case16 경고", hasWarning(after, "startup_already_in_opening"));
    } catch (e) { fail("Case16 예외", e.message || e); }

    try {
      var s17 = empty();
      s17.profile.startMonth = "2027-01";
      s17.profile.endMonth = "2027-12";
      var p17 = App.Defaults.newProject();
      p17.contractAmount = 100000000;
      p17.payments = [Object.assign(App.Defaults.newPayment("2027-01"), { amount: 100000000, inputMode: "amount" })];
      s17.projects = [p17];
      var noTaxCash = App.Engine.runSimulation(s17);
      s17.settings.tax.cashOutMonth = "2027-12";
      var withTaxCash = App.Engine.runSimulation(s17);
      eq("Case17 pnlExpense 동일", withTaxCash.kpis.pnlExpense, noTaxCash.kpis.pnlExpense);
      eq("Case17 과세표준 동일", withTaxCash.kpis.taxDetail.taxable, noTaxCash.kpis.taxDetail.taxable);
      assert("Case17 납부월 taxCashOut", monthRow(withTaxCash, "2027-12").taxCashOut > 0);
      assert("Case17 납부월 closing 감소", monthRow(withTaxCash, "2027-12").closing < monthRow(noTaxCash, "2027-12").closing);
    } catch (e) { fail("Case17 예외", e.message || e); }

    try {
      var s18 = empty();
      s18.profile.startMonth = "2027-01";
      s18.profile.endMonth = "2027-12";
      s18.profile.initialCash = 0;
      var p18 = App.Defaults.newProject();
      p18.contractAmount = 10000000;
      p18.payments = [Object.assign(App.Defaults.newPayment("2026-12"), { amount: 10000000, inputMode: "amount" })];
      s18.projects = [p18];
      var r18 = App.Engine.runSimulation(s18);
      eq("Case18 1월 입금 0", monthRow(r18, "2027-01").inflow, 0);
      eq("Case18 기간이전 KPI", r18.kpis.inflowBeforePeriod, 10000000);
      eq("Case18 월초 자동가산 없음", r18.months[0].opening, 0);
      assert("Case18 경고", hasWarning(r18, "payment_before_period"));
    } catch (e) { fail("Case18 예외", e.message || e); }

    try {
      var s19 = empty();
      s19.profile.startMonth = "2027-01";
      s19.profile.endMonth = "2027-01";
      s19.profile.initialCash = 0;
      s19.otherInflows = [{
        id: "o1", name: "보증금 반환", amount: 50000000, month: "2027-01",
        include: true, kind: "depositReturn"
      }];
      var r19 = App.Engine.runSimulation(s19);
      eq("Case19 otherInflow", r19.months[0].otherInflow, 50000000);
      eq("Case19 매출 불변", r19.kpis.revenue, 0);
      eq("Case19 과세표준 0", r19.kpis.taxDetail.taxable, 0);
      eq("Case19 월말 증가", r19.months[0].closing, 50000000);
    } catch (e) { fail("Case19 예외", e.message || e); }

    try {
      var s20 = empty();
      s20.profile.startMonth = "2027-01";
      s20.profile.endMonth = "2027-12";
      var p20 = App.Defaults.newProject("2027-01", "drama");
      p20.name = "테스트 드라마";
      p20.episodes = 10;
      p20.feePerEpisode = 1000000;
      p20.payments = [
        Object.assign(App.Defaults.newPayment("2027-01"), { label: "계약금", inputMode: "percent", percentage: 0.1 }),
        Object.assign(App.Defaults.newPayment("2027-03"), { label: "중도금", inputMode: "percent", percentage: 0.5 }),
        Object.assign(App.Defaults.newPayment("2027-06"), { label: "잔금", inputMode: "percent", percentage: 0.4 })
      ];
      s20.projects = [p20];
      var r20 = App.Engine.runSimulation(s20);
      eq("Case20 총출연료", App.Engine.projectContractAmount(p20), 10000000);
      eq("Case20 1월 10%", monthRow(r20, "2027-01").inflow, 1000000);
      eq("Case20 3월 50%", monthRow(r20, "2027-03").inflow, 5000000);
      eq("Case20 6월 40%", monthRow(r20, "2027-06").inflow, 4000000);
      eq("Case20 2월 0", monthRow(r20, "2027-02").inflow, 0);
    } catch (e) { fail("Case20 예외", e.message || e); }

    try {
      eq("수미표 6천만", App.Format.formatGrouped(60000000), "60,000,000");
      eq("수미표 5백만", App.Format.formatGrouped(5000000), "5,000,000");
      eq("수미표 0원", App.Format.formatGrouped(0), "0");
      eq("수미표 입력중", App.Format.formatTypingGrouped("60000000"), "60,000,000");
      eq("수미표 쉼표유지", App.Format.formatTypingGrouped("60,000,000"), "60,000,000");
      eq("YY-MM 26-12", App.Format.formatMonthYyMm("2026-12"), "26-12");
      eq("YY-MM 27-09", App.Format.formatMonthYyMm("2027-09"), "27-09");
      eq("YY-MM 27-01", App.Format.formatMonthYyMm("2027-01"), "27-01");
    } catch (e) { fail("수미표 예외", e.message || e); }

    try {
      var sRate = empty();
      eq("기본단가 광고6 기본 0", sRate.profile.baseRates.ad.months6, 0);
      eq("기본단가 시딩 기본 0", sRate.profile.baseRates.seeding.perEvent, 0);
      var parsedOld = JSON.parse(App.Store.exportJson(empty()));
      delete parsedOld.profile.baseRates;
      var restored = App.Store.parseImport(JSON.stringify(parsedOld));
      eq("구 JSON 기본단가 복원", restored.profile.baseRates.ad.months12, 0);
      var rMissing = App.Engine.runSimulation(restored);
      assert("구 JSON 시뮬 OK", !!rMissing.kpis);

      restored.profile.baseRates.ad.months6 = 300000000;
      restored.profile.baseRates.ad.months12 = 500000000;
      restored.profile.baseRates.seeding.perEvent = 5000000;
      restored.profile.baseRates.event.perEvent = 10000000;
      var pAd = App.Defaults.applyBaseRateToProject(App.Defaults.newProject("2027-01", "ad"), restored.profile.baseRates);
      eq("신규 광고 6개월 단가", pAd.feePerEpisode, 300000000);
      eq("신규 광고 횟수 1", pAd.episodes, 1);
      eq("신규 광고 총액", pAd.contractAmount, 300000000);
      var pSeed = App.Defaults.applyBaseRateToProject(App.Defaults.newProject("2027-01", "seeding"), restored.profile.baseRates);
      pSeed.episodes = 3;
      pSeed.contractAmount = App.Engine.projectContractAmount(pSeed);
      eq("시딩 3회 예상", pSeed.contractAmount, 15000000);
      var pEv = App.Defaults.applyBaseRateToProject(App.Defaults.newProject("2027-01", "event"), restored.profile.baseRates);
      pEv.episodes = 2;
      eq("행사 2회 예상", App.Engine.projectContractAmount(pEv), 20000000);

      var existingFee = 111000000;
      var existing = { category: "ad", episodes: 1, feePerEpisode: existingFee };
      restored.profile.baseRates.ad.months6 = 999000000;
      eq("기존 계약 단가 불변", existing.feePerEpisode, existingFee);

      var seed = App.Sample.load();
      var beforeIn = App.Engine.runSimulation(seed).kpis.inflowInPeriod;
      seed.profile.baseRates.ad.months6 = 500000000;
      eq("단가변경 기존매출 불변", App.Engine.runSimulation(seed).kpis.inflowInPeriod, beforeIn);
      var round = App.Store.parseImport(App.Store.exportJson(restored));
      eq("기본단가 JSON 왕복", round.profile.baseRates.event.perEvent, 10000000);
      eq("구 JSON 예상개수 0", restored.profile.baseRates.ad.count6, 0);
      eq("구 JSON 화보단가 0", restored.profile.baseRates.pictorial.perEvent, 0);
      eq("구 JSON 활동계획 배열", Array.isArray(restored.salesPlans) && restored.salesPlans.length === 0, true);
    } catch (e) { fail("기본단가 예외", e.message || e); }

    try {
      var sPlan = empty();
      var ad6 = App.Defaults.rateRowById("ad-6");
      var seedRow = App.Defaults.rateRowById("seeding");
      sPlan.profile.baseRates.ad.months6 = 100000000;
      sPlan.profile.baseRates.ad.count6 = 2;
      sPlan.profile.baseRates.ad.months12 = 200000000;
      sPlan.profile.baseRates.ad.count12 = 1;
      sPlan.profile.baseRates.seeding.perEvent = 50000000;
      sPlan.profile.baseRates.seeding.count = 3;
      sPlan.profile.baseRates.pictorial.perEvent = 20000000;
      sPlan.profile.baseRates.pictorial.count = 2;
      sPlan.profile.baseRates.event.perEvent = 20000000;
      sPlan.profile.baseRates.event.count = 4;
      sPlan.profile.baseRates.ambassador.months6 = 100000000;
      sPlan.profile.baseRates.ambassador.count6 = 1;
      eq("TVCF 6개월 총액", App.Defaults.expectedRowTotal(sPlan.profile.baseRates, ad6), 200000000);
      eq("시딩 총액", App.Defaults.expectedRowTotal(sPlan.profile.baseRates, seedRow), 150000000);
      eq("기본활동 예상매출", App.Defaults.expectedGroupTotals(sPlan.profile.baseRates).grand, 200000000 + 200000000 + 150000000 + 40000000 + 80000000 + 100000000);
      var gAd = App.Defaults.salesPlanProgress(sPlan).groups.filter(function (g) { return g.id === "ad"; })[0];
      eq("TVCF 그룹 목표 3건", gAd.target, 3);
      eq("TVCF 그룹 예상", gAd.targetAmount, 400000000);
      eq("개수 변경 시 계획 없음", (sPlan.salesPlans || []).length, 0);
      var beforeEnd = App.Engine.runSimulation(sPlan).kpis.endClosing;
      App.Defaults.fillSalesPlansToTargets(sPlan);
      eq("자동생성 수량", sPlan.salesPlans.length, 2 + 1 + 3 + 2 + 4 + 1);
      eq("자동생성 월 미정", sPlan.salesPlans[0].month, null);
      eq("자동생성 예산 OFF", sPlan.salesPlans[0].includeInBudget, false);
      sPlan.salesPlans[0].includeInBudget = true;
      eq("미정 월은 미반영", App.Engine.runSimulation(sPlan).kpis.inflowInPeriod, 0);
      sPlan.salesPlans[0].includeInBudget = false;
      eq("초안만 있으면 현금 불변", App.Engine.runSimulation(sPlan).kpis.endClosing, beforeEnd);
      sPlan.profile.baseRates.ad.count6 = 5;
      eq("목표만 늘려도 계획 유지", sPlan.salesPlans.filter(function (p) { return p.rateId === "ad-6"; }).length, 2);
      var one = sPlan.salesPlans.filter(function (p) { return p.rateId === "ad-6"; })[0];
      one.month = "2027-01";
      one.amount = 100000000;
      one.includeInBudget = true;
      eq("예산 반영 ON 입금", monthRow(App.Engine.runSimulation(sPlan), "2027-01").inflow, 100000000);
      one.includeInBudget = false;
      eq("예산 반영 OFF 입금", monthRow(App.Engine.runSimulation(sPlan), "2027-01").inflow, 0);
      one.includeInBudget = true;
      var converted = App.Defaults.convertSalesPlan(sPlan, one.id, "2027-01");
      assert("계약 전환", !!converted);
      var convertedPlan = sPlan.salesPlans.filter(function (p) { return p.id === one.id; })[0];
      eq("전환 후 확정", convertedPlan.planStatus, "confirmed");
      eq("전환 후 예산 ON", convertedPlan.includeInBudget, true);
      eq("전환 후 프로젝트 추가 없음", sPlan.projects.length, 0);
      eq("전환 후 1월 입금=모델료", monthRow(App.Engine.runSimulation(sPlan), "2027-01").inflow, 100000000);
      eq("전환 표시 아님", convertedPlan.converted, false);
      App.Defaults.addSalesPlanForGroup(sPlan, "ad");
      var added = sPlan.salesPlans[sPlan.salesPlans.length - 1];
      eq("그룹 추가 시 6개월 단가 복사", added.amount, 100000000);
      eq("그룹 추가 rateId", added.rateId, "ad-6");
      var seed = App.Sample.load();
      var seedIn = App.Engine.runSimulation(seed).kpis.inflowInPeriod;
      seed.profile.baseRates.ad.count6 = 9;
      App.Defaults.fillSalesPlansToTargets(seed);
      eq("시드 계획 생성해도 확정매출 불변", App.Engine.runSimulation(seed).kpis.inflowInPeriod, seedIn);
      eq("시드 기말 불변", App.Engine.runSimulation(seed).kpis.endClosing, 1204738995);

      var sPay = empty();
      sPay.profile.startMonth = "2027-01";
      sPay.profile.endMonth = "2027-12";
      var planSplit = App.Defaults.newSalesPlan(App.Defaults.rateRowById("ad-12"), 300000000);
      planSplit.name = "삼성전자 TVCF";
      planSplit.month = "2027-03";
      planSplit.includeInBudget = true;
      planSplit.payments = [
        App.Defaults.newPayment("2027-03", { label: "계약금", percentage: 0.2 }),
        App.Defaults.newPayment("2027-05", { label: "중도금", percentage: 0.4 }),
        App.Defaults.newPayment("2027-08", { label: "잔금", percentage: 0.4 })
      ];
      sPay.salesPlans = [planSplit];
      var rSplit = App.Engine.runSimulation(sPay);
      eq("분할 3월 계약금", monthRow(rSplit, "2027-03").inflow, 60000000);
      eq("분할 5월 중도금", monthRow(rSplit, "2027-05").inflow, 120000000);
      eq("분할 8월 잔금", monthRow(rSplit, "2027-08").inflow, 120000000);
      eq("분할 4월 0", monthRow(rSplit, "2027-04").inflow, 0);
      eq("활동월에 전액 넣지 않음", monthRow(rSplit, "2027-03").inflow !== 300000000, true);

      var oldPlan = {
        id: "old-1", rateId: "seeding", category: "seeding", name: "구 시딩",
        amount: 50000000, month: "2027-02", includeInBudget: true
      };
      var restoredPay = App.Store.parseImport(JSON.stringify(Object.assign(empty(), { salesPlans: [oldPlan] })));
      restoredPay.profile.startMonth = "2027-01";
      restoredPay.profile.endMonth = "2027-12";
      eq("구 JSON 지급일정 없음", restoredPay.salesPlans[0].payments == null || restoredPay.salesPlans[0].payments.length === 0, true);
      eq("구 JSON fallback 입금월", monthRow(App.Engine.runSimulation(restoredPay), "2027-02").inflow, 50000000);
      assert("구 JSON 영업건 마이그레이션", (restoredPay.projects || []).some(function (p) { return p.sourcePlanId === "old-1"; }));
      eq("구 JSON 플랜 converted", restoredPay.salesPlans[0].converted, true);

      var sOver = empty();
      sOver.profile.baseRates.ad.count6 = 1;
      sOver.profile.baseRates.ad.count12 = 0;
      sOver.salesPlans = [
        App.Defaults.newSalesPlan(App.Defaults.rateRowById("ad-6"), 100000000),
        App.Defaults.newSalesPlan(App.Defaults.rateRowById("ad-6"), 100000000),
        App.Defaults.newSalesPlan(App.Defaults.rateRowById("ad-12"), 200000000)
      ];
      var gOver = App.Defaults.salesPlanProgress(sOver).groups.filter(function (g) { return g.id === "ad"; })[0];
      eq("목표 초과 허용", gOver.planned, 3);
      eq("목표 1건", gOver.target, 1);
      eq("목표 대비 +2", gOver.over, 2);
      assert("헤더 +건", App.Defaults.salesGroupHeadText(gOver).indexOf("목표 대비 +2건") >= 0);

      var manualPay = App.Defaults.newPayment("2027-05", { label: "중도금", percentage: 0.4 });
      manualPay.inputMode = "amount";
      manualPay.amount = 90000000;
      planSplit.payments[1] = manualPay;
      eq("수동 금액 CF", monthRow(App.Engine.runSimulation(sPay), "2027-05").inflow, 90000000);

      var htmlSales = App.Render.renderView("revenue", sPay, rSplit, { workItemOpen: {} });
      assert("등록 그리드", htmlSales.indexOf("work-grid") >= 0);
      assert("활동명 컬럼", htmlSales.indexOf("삼성전자 TVCF") >= 0);
      assert("기간 표시", htmlSales.indexOf("27-03") >= 0);
      assert("지급 3회", htmlSales.indexOf("3회") >= 0);
      assert("건 추가 버튼", htmlSales.indexOf('data-action="add-revenue"') >= 0);
      assert("목표 문구 없음", htmlSales.indexOf("목표") < 0 && htmlSales.indexOf("미배치") < 0);
      assert("활동 추가 버튼 없음", htmlSales.indexOf('data-action="add-sales-plan"') < 0);
      assert("엑셀형 구분 열", htmlSales.indexOf(">구분</span>") >= 0 || htmlSales.indexOf("구분") >= 0);
      assert("수익 상위구분 열", htmlSales.indexOf(">상위구분</span>") >= 0);
      assert("수익 영업 배지", /cat-badge-family">영업<\/span>/.test(htmlSales));
      assert("카테고리 아코디언 없음", htmlSales.indexOf("work-acc") < 0);
      assert("빈 카테고리 안내 없음", htmlSales.indexOf("등록된 항목 없음") < 0);
      eq("화면 마이그레이션 후 분할 유지", monthRow(App.Engine.runSimulation(sPay), "2027-03").inflow, 60000000);

      var sMix = empty();
      sMix.projects = [{
        id: "harem", name: "하렘의 남자들", category: "ott", status: "negotiating",
        episodes: 16, feePerEpisode: 50000000, contractAmount: 800000000, payments: [], directExpenses: []
      }];
      var tvcfPlan = App.Defaults.newSalesPlan(App.Defaults.rateRowById("ad-12"), 300000000);
      tvcfPlan.name = "TVCF 12개월 1";
      sMix.salesPlans = [tvcfPlan];
      eq("하렘 총출연료", App.Engine.projectContractAmount(sMix.projects[0]), 800000000);
      eq("확정/협의 작품", App.Defaults.workContractTotal(sMix), 800000000);
      eq("영업 활동 계획", App.Defaults.salesPlanAmountTotal(sMix), 300000000);
      eq("총 예상 매출", App.Defaults.workContractTotal(sMix) + App.Defaults.salesPlanAmountTotal(sMix), 1100000000);
      var htmlMix = App.Render.renderView("revenue", sMix, App.Engine.runSimulation(sMix), {});
      assert("매출 계획 통합 영역", htmlMix.indexOf("매출 계획") >= 0);
      assert("작품 배지 숨김", htmlMix.indexOf('revenue-type-badge">작품') < 0);
      assert("영업 배지 숨김", htmlMix.indexOf('revenue-type-badge">영업') < 0);
      assert("예상 배지 숨김", htmlMix.indexOf("st-expected") < 0);
      assert("OTT 카테고리", htmlMix.indexOf("OTT 시리즈") >= 0);
      assert("하렘 한 줄", htmlMix.indexOf("하렘의 남자들") >= 0);
      assert("수익 추가 버튼", htmlMix.indexOf("+ 수익 추가") >= 0);
      assert("카테고리 badge", htmlMix.indexOf("cat-badge") >= 0);
      assert("수익 작품 상위구분 배지", /cat-badge-family">작품<\/span>/.test(htmlMix));
      assert("탭 통합 후 작품탭 문구 없음", htmlMix.indexOf("작품 / 계약") < 0);
      assert("2컬럼 레이아웃", htmlMix.indexOf("setup-split") >= 0);
      assert("오른쪽 계약 패널", htmlMix.indexOf("setup-side") >= 0);
      assert("등록 수익 제목", htmlMix.indexOf("등록 수익") >= 0);
      assert("패널에 TVCF 계획", htmlMix.indexOf("TVCF 12개월 1") >= 0);
      assert("패널 합계 속성", htmlMix.indexOf('data-computed="reg-total"') >= 0);
      assert("패널 합계 11억", /data-computed="reg-total">1,100,000,000원/.test(htmlMix));
    } catch (e) { fail("활동계획 예외", e.message || e); }

    function ledgerGroup(result, id) {
      return ((result.ledger && result.ledger.groups) || []).filter(function (g) { return g.id === id; })[0];
    }
    function ledgerResult(result, id) {
      return ((result.ledger && result.ledger.results) || []).filter(function (r) { return r.id === id; })[0];
    }
    function ledgerItem(group, label) {
      return ((group && group.rows) || []).filter(function (r) { return r.label === label; })[0];
    }

    try {
      var seedL = App.Sample.load();
      var rL = App.Engine.runSimulation(seedL);
      var inc = ledgerResult(rL, "incomeTotal");
      var exp = ledgerResult(rL, "expenseTotal");
      var pnl = ledgerResult(rL, "pnl");
      var close = ledgerResult(rL, "closing");
      assert("원장 존재", !!rL.ledger && (rL.ledger.groups || []).length > 0);
      eq("원장 월수", rL.ledger.months.length, 15);
      eq("원장 시작월", rL.ledger.months[0], "2026-10");
      eq("원장 종료월", rL.ledger.months[rL.ledger.months.length - 1], "2027-12");
      var monthOk = rL.months.every(function (cf) {
        return inc.values[cf.month] === cf.inflow &&
          exp.values[cf.month] === -cf.pnlExpense &&
          pnl.values[cf.month] === App.Money.roundWon(cf.inflow - cf.pnlExpense) &&
          close.values[cf.month] === App.Money.roundWon(
            cf.closingAfterTax != null ? cf.closingAfterTax : cf.closing
          );
      });
      assert("원장=Cash Flow 월별", monthOk);
      eq("원장 수입 TOTAL=기간입금", inc.total, rL.kpis.inflowInPeriod);
      eq("원장 지출 TOTAL=-pnlExpense", exp.total, -rL.kpis.pnlExpense);
      eq("원장 월말 TOTAL=세후월말", close.total, rL.kpis.endClosingAfterTax);
      eq("세후월말=기말-미납법인세주민세", rL.kpis.endClosingAfterTax,
        App.Money.roundWon(rL.kpis.endClosing - rL.kpis.corporateTaxPending - rL.kpis.localTaxPending));
      eq("샘플 기말 현금", rL.kpis.endClosing, 1204738995);
      eq("샘플 최저 잔액", rL.kpis.minClosing, 8576879);

      var revenueWork = ledgerGroup(rL, "revenue-work");
      var revenueSales = ledgerGroup(rL, "revenue-sales");
      var revenueTotal = ledgerGroup(rL, "revenue-total");
      assert("원장 작품/영업 수입 그룹", !!revenueWork && !!revenueSales && !!revenueTotal);
      eq("원장 총 수입=작품+영업", revenueTotal.subtotal.total,
        App.Money.roundWon(revenueWork.subtotal.total + revenueSales.subtotal.total));
      eq("원장 총 수입=기간입금", revenueTotal.subtotal.total, rL.kpis.inflowInPeriod);
      eq("원장 총 매출 라벨", revenueTotal.label, "총 매출");

      var cogsGroup = ledgerGroup(rL, "cogs-total");
      var grossGroup = ledgerGroup(rL, "gross-profit");
      var opGroup = ledgerGroup(rL, "operating-profit");
      var projectGroupL = ledgerGroup(rL, "project");
      var agencyGroupL = ledgerGroup(rL, "agency");
      var sgaGroupL = ledgerGroup(rL, "opex-sga-parent");
      var fundingGroupL = ledgerGroup(rL, "funding");
      var groupIdsL = (rL.ledger.groups || []).map(function (g) { return g.id; });
      assert("매출원가·매출총이익·영업이익 행", !!cogsGroup && !!grossGroup && !!opGroup);
      eq("매출원가=직접비+수수료", cogsGroup.subtotal.total,
        App.Money.roundWon(projectGroupL.subtotal.total + ((agencyGroupL && agencyGroupL.subtotal.total) || 0)));
      eq("매출총이익=총매출+매출원가", grossGroup.subtotal.total,
        App.Money.roundWon(revenueTotal.subtotal.total + cogsGroup.subtotal.total));
      eq("영업이익=매출총이익+판관비", opGroup.subtotal.total,
        App.Money.roundWon(grossGroup.subtotal.total + sgaGroupL.subtotal.total));
      eq("영업이익=기존 영업손익", opGroup.subtotal.total, pnl.total);
      eq("영업이익=KPI", opGroup.subtotal.total, rL.kpis.operatingProfit);
      assert("자산·보증금은 영업이익 뒤", groupIdsL.indexOf("funding") > groupIdsL.indexOf("operating-profit"));
      assert("자산·보증금은 총매출 뒤", groupIdsL.indexOf("funding") > groupIdsL.indexOf("revenue-total"));
      assert("직접비는 총매출 뒤", groupIdsL.indexOf("project") > groupIdsL.indexOf("revenue-total"));
      assert("매출총이익은 매출원가 뒤", groupIdsL.indexOf("gross-profit") > groupIdsL.indexOf("cogs-total"));
      rL.ledger.months.forEach(function (m) {
        eq("월별 총매출=작품+영업 " + m, revenueTotal.subtotal.values[m],
          App.Money.roundWon((revenueWork.subtotal.values[m] || 0) + (revenueSales.subtotal.values[m] || 0)));
        eq("월별 매출총이익 " + m, grossGroup.subtotal.values[m],
          App.Money.roundWon((revenueTotal.subtotal.values[m] || 0) + (cogsGroup.subtotal.values[m] || 0)));
        eq("월별 영업이익 " + m, opGroup.subtotal.values[m],
          App.Money.roundWon((grossGroup.subtotal.values[m] || 0) + (sgaGroupL.subtotal.values[m] || 0)));
        eq("월별 영업이익=Cash Flow " + m, opGroup.subtotal.values[m],
          App.Money.roundWon(monthRow(rL, m).inflow - monthRow(rL, m).pnlExpense));
      });
      assert("자산·보증금은 손익에 안 넣음", fundingGroupL.kind === "funding");
      var harem = ledgerItem(revenueWork, "하렘의 남자들");
      var sister = ledgerItem(revenueWork, "언니 이번생엔 내가 왕비야");
      assert("하렘 행", !!harem);
      eq("하렘 TOTAL", harem.total, 800000000);
      eq("하렘 26-11 계약금", harem.values["2026-11"], 80000000);
      eq("하렘 27-01 중도금", harem.values["2027-01"], 400000000);
      eq("하렘 27-05 잔금", harem.values["2027-05"], 320000000);
      eq("하렘 26-12 빈칸", harem.values["2026-12"], 0);
      assert("언니 행", !!sister);
      eq("언니 26-12 계약금", sister.values["2026-12"], 80000000);
      assert("12월 작품입금 있음", monthRow(rL, "2026-12").inflow > 0);

      var sLedgerSales = empty();
      sLedgerSales.profile.startMonth = "2026-10";
      sLedgerSales.profile.endMonth = "2026-10";
      function salesProject(cat, name, amount) {
        var p = App.Defaults.newProject("2026-10", cat, sLedgerSales);
        p.name = name;
        p.status = "confirmed";
        p.contractAmount = amount;
        p.payments = [Object.assign(App.Defaults.newPayment("2026-10"), { amount: amount, inputMode: "amount" })];
        return p;
      }
      sLedgerSales.projects = [
        salesProject("브랜드 앰버서더", "브랜드 앰버서더", 200000000),
        salesProject("브랜드 행사", "브랜드 행사 C", 2000000),
        salesProject("유가화보", "유가화보 A", 2000000),
        salesProject("행사", "브랜드 행사 B", 2000000),
        salesProject("광고", "광고A", 30000000)
      ];
      var rLedgerSales = App.Engine.runSimulation(sLedgerSales);
      var salesGroup = ledgerGroup(rLedgerSales, "revenue-sales");
      var workGroup = ledgerGroup(rLedgerSales, "revenue-work");
      var totalGroup = ledgerGroup(rLedgerSales, "revenue-total");
      eq("2026-10 영업 수입 소계 236M", salesGroup.subtotal.values["2026-10"], 236000000);
      eq("2026-10 총 수입 236M", totalGroup.subtotal.values["2026-10"], 236000000);
      (rLedgerSales.ledger.months || []).forEach(function (m) {
        var workSum = App.Money.sumBy((workGroup && workGroup.rows) || [], function (row) { return row.values[m]; });
        var salesSum = App.Money.sumBy((salesGroup && salesGroup.rows) || [], function (row) { return row.values[m]; });
        eq("원장 작품 소계 invariant " + m, workGroup ? workGroup.subtotal.values[m] : 0, workSum);
        eq("원장 영업 소계 invariant " + m, salesGroup ? salesGroup.subtotal.values[m] : 0, salesSum);
        eq("원장 총수입 invariant " + m, totalGroup.subtotal.values[m], App.Money.roundWon(workSum + salesSum));
      });
      eq("원장 총수입 TOTAL invariant", totalGroup.subtotal.total,
        App.Money.roundWon((workGroup ? workGroup.subtotal.total : 0) + (salesGroup ? salesGroup.subtotal.total : 0)));

      var rent = ledgerItem(ledgerGroup(rL, "opex-rent"), "임대료(2층)");
      assert("임대료(2층) 행", !!rent);
      eq("임대료 26-11 전체기간 연동", rent.values["2026-11"], -500000);
      eq("임대료 26-12", rent.values["2026-12"], -500000);
      eq("임대료 TOTAL", rent.total, -500000 * 15);

      var ceo = ledgerItem(ledgerGroup(rL, "payroll"), "대표자(배우)");
      assert("대표 급여 행", !!ceo);
      eq("대표 26-11", ceo.values["2026-11"], -20000000);
      eq("대표 26-12", ceo.values["2026-12"], -20000000);
      eq("인건비 행수", ledgerGroup(rL, "payroll").rows.length, 6);
      eq("대표 인센티브 합", ledgerItem(ledgerGroup(rL, "payroll"), "대표 인센티브").total, -41000000);
      eq("영업 인센티브 행 0원", ledgerItem(ledgerGroup(rL, "payroll"), "영업 인센티브").total, 0);
      eq("로드매니저 인센티브 행 0원", ledgerItem(ledgerGroup(rL, "payroll"), "로드매니저 인센티브").total, 0);
      eq("대표 인센티브 26-12", ledgerItem(ledgerGroup(rL, "payroll"), "대표 인센티브").values["2026-12"], -20000000);
      eq("대표 인센티브 27-09", ledgerItem(ledgerGroup(rL, "payroll"), "대표 인센티브").values["2027-09"], -1000000);
      eq("대표 인센티브 27-12", ledgerItem(ledgerGroup(rL, "payroll"), "대표 인센티브").values["2027-12"], -20000000);
      eq("4대보험 행수", ledgerGroup(rL, "insurance").rows.length, 4);
      assert("국민연금 음수", ledgerItem(ledgerGroup(rL, "insurance"), "국민연금").values["2026-12"] < 0);

      seedL.employees.push({
        id: "emp-new", name: "추가직원", role: "매니저", monthlySalary: 3000000,
        periodMode: "custom", startMonth: "2027-03", endMonth: "2027-09", insure: true, meal: true, severance: false, include: true
      });
      var rAdd = App.Engine.runSimulation(seedL);
      eq("직원 추가 시 인건비 행", ledgerGroup(rAdd, "payroll").rows.length, 8);
      eq("추가직원 27-03", ledgerItem(ledgerGroup(rAdd, "payroll"), "추가직원 / 매니저").values["2027-03"], -3000000);
      eq("추가직원 27-02 0", ledgerItem(ledgerGroup(rAdd, "payroll"), "추가직원 / 매니저").values["2027-02"], 0);

      var parsedOld2 = JSON.parse(App.Store.exportJson(App.Sample.load()));
      delete parsedOld2.ledger;
      var restored2 = App.Store.parseImport(JSON.stringify(parsedOld2));
      var rOld = App.Engine.runSimulation(restored2);
      eq("구 JSON 기말 동일", rOld.kpis.endClosing, rL.kpis.endClosing);
      eq("구 JSON 원장 수입", ledgerResult(rOld, "incomeTotal").total, rL.kpis.inflowInPeriod);
      assert("저장 JSON에 ledger 없음", App.Store.exportJson(App.Sample.load()).indexOf('"ledger"') < 0);
    } catch (e) { fail("원장 예외", e.message || e); }

    try {
      var seedC = App.Sample.load();
      var rC = App.Engine.runSimulation(seedC);
      var ent = ledgerItem(ledgerGroup(rC, "opex-sga"), "접대비");
      assert("접대비 행", !!ent);
      eq("접대비 기본월", ent.values["2026-12"], -200000);
      eq("접대비 Override 27-06", ent.values["2027-06"], -1200000);
      eq("비용UI 검증용 기말", rC.kpis.endClosing, 1204738995);
      eq("비용UI 검증용 최저", rC.kpis.minClosing, 8576879);

      var jsonC = App.Store.exportJson(seedC);
      assert("JSON에 accordion 상태 없음", jsonC.indexOf("costItemOpen") < 0 && jsonC.indexOf("costSecOpen") < 0);

      if (App.Render && App.Render.renderView) {
        var html = App.Render.renderView("costs", seedC, rC, { costTab: "opex", costSecOpen: {}, costItemOpen: {} });
        assert("비용 탭 아코디언 루트", html.indexOf('class="view-costs"') >= 0);
        assert("비용 서브탭", html.indexOf("cost-tabs") >= 0 && html.indexOf("초기비용") >= 0 && html.indexOf("자산·보증금") >= 0);
        assert("기본 운영비 탭", html.indexOf("4대보험 (회사 부담)") >= 0 && html.indexOf("차량비") >= 0);
        assert("전체 접기 버튼", html.indexOf("전체 접기") >= 0);
        assert("인건비 섹션 펼침", html.indexOf('data-cost-sec="payroll" open') >= 0);
        assert("판관비 아코디언", html.indexOf('data-cost-sec="recurring-sga"') >= 0);
        eq("개별 항목 기본 접힘", (html.match(/data-cost-item="[^"]+" open/g) || []).length, 0);
        assert("YY-MM 26-10", html.indexOf("26-10") >= 0);
        assert("YY-MM 27-09", html.indexOf("27-09") >= 0);
        assert("천단위 콤마 월액", html.indexOf("1,000,000원") >= 0 && /class="cost-unit"[^>]*>월</.test(html));
        assert("비용 테이블 단위 열", html.indexOf(">단위<") >= 0);
        assert("그룹 헤더도 7열 그리드", html.indexOf('class="cost-sec-head cost-row-list"') >= 0 &&
          html.indexOf("cost-group-title") >= 0);
        function costListRowCells(src, name) {
          var parts = src.split('<div class="cost-row cost-row-list">');
          for (var i = 1; i < parts.length; i++) {
            var end = parts[i].indexOf("</div>");
            if (end < 0) continue;
            var row = parts[i].slice(0, end);
            if (row.indexOf(">" + name + "<") < 0) continue;
            var cells = [];
            row.replace(/<span\b[^>]*>([\s\S]*?)<\/span>/g, function (_, inner) {
              cells.push(String(inner).replace(/<[^>]+>/g, "").trim());
              return _;
            });
            return cells;
          }
          return null;
        }
        [
          "대표자(배우)",
          "영업 / 영업(본부장급)",
          "로드매니저",
          "임대료(2층)",
          "차량 렌트료",
          "연기수업료",
          "스타일링비"
        ].forEach(function (name) {
          var cells = costListRowCells(html, name);
          assert(name + " 7열", !!(cells && cells.length === 7));
          assert(name + " 금액에 주기 없음", !!(cells && cells[3] && cells[3].indexOf("/") < 0));
          assert(name + " 단위 월", !!(cells && cells[4] === "월"));
        });
        assert("식대 행은 기준월을 이름에 표기(월별 변동값이라 다른 항목과 다름)",
          html.indexOf(">식대(") >= 0 && /class="cost-unit"[^>]*>월·변동</.test(html));
        assert("회식·야근 여유 표시", html.indexOf("회식·야근 여유") >= 0);
        assert("운영비 복리후생 4열", html.indexOf("meal-fields") >= 0);
        assert("운영비 계산내역 폭 클래스", html.indexOf("cost-calc") >= 0);
        assert("변동 Override 표시", html.indexOf("변동 1건") >= 0);
        assert("운영비에 설립비 없음", html.indexOf("등록면허세") < 0);
        assert("인건비 접힌 이름", html.indexOf("대표자(배우)") >= 0);
        assert("비용 인건비에 배우 실명 없음", html.indexOf("이종원 / 대표이사") < 0);
        assert("비용 인건비 연동 배지", html.indexOf("[조직 설정 연동]") >= 0);
        assert("비용 상위구분 판관비", html.indexOf("cat-badge-family") >= 0 && html.indexOf(">판관비<") >= 0);
        assert("비용 계정과목 인건비", /cat-badge">인건비<\/span>/.test(html));
        assert("복리후생 식대 1행", html.indexOf(">식대(") >= 0 && html.indexOf("자동계산") >= 0);
        assert("식대 행에 기준월 표기로 월별 변동 안내", html.indexOf("월별 근무일수에 따라 자동 계산") >= 0);
        assert("비용 인건비 급여 입력 없음", html.indexOf('data-path="employees.0.monthlySalary"') < 0);
        var htmlStart = App.Render.renderView("costs", seedC, rC, { costTab: "startup", costSecOpen: {}, costItemOpen: {} });
        assert("초기비용 탭 등록면허세", htmlStart.indexOf("등록면허세") >= 0);
        assert("초기비용 상위구분", /cat-badge cat-badge-family">설립비용<\/span>/.test(htmlStart));
        assert("초기비용 계정과목 설립비", /cat-badge">설립비<\/span>/.test(htmlStart));
        assert("초기비용 합계 문구", htmlStart.indexOf("실제 예상안 반영") >= 0);
        assert("초기비용 상단 전체 합계", htmlStart.indexOf("전체 합계") >= 0);
        assert("초기비용 설명문 없음", htmlStart.indexOf("통상적인 법인 설립") < 0);
        assert("법인설립등기 비용 묶음", htmlStart.indexOf("법인설립등기 비용") >= 0 && htmlStart.indexOf("법인설립등기 비용 소계") >= 0);
        assert("기타 초기비용 소계", htmlStart.indexOf("기타 초기비용") >= 0 && htmlStart.indexOf("기타 초기비용 소계") >= 0);
        assert("초기비용 행 공통 그리드", htmlStart.indexOf('class="cost-row cost-row-startup cost-row-list"') >= 0 &&
          htmlStart.indexOf('class="cost-subtotal cost-row-startup cost-row-list"') >= 0 &&
          htmlStart.indexOf('class="cost-group-label cost-row-startup cost-row-list"') >= 0);
        assert("법무사수수료 위 배치", htmlStart.indexOf("법무사수수료") >= 0 &&
          htmlStart.indexOf("현판제작") >= 0 &&
          htmlStart.indexOf("법무사수수료") < htmlStart.indexOf("현판제작"));
        var htmlFund = App.Render.renderView("costs", seedC, rC, { costTab: "funding", costSecOpen: {}, costItemOpen: {} });
        assert("보증금 탭", htmlFund.indexOf("사무실보증금") >= 0);
        assert("시드 차량운반구 0", htmlFund.indexOf("차량운반구") >= 0);
        assert("시드 건물 0", htmlFund.indexOf("건물") >= 0);
        assert("시드 기타보증금 0", htmlFund.indexOf("기타보증금") >= 0);
        assert("자산·보증금 소계 행 없음", htmlFund.indexOf("보증금 소계") < 0);
        assert("자산·보증금 섹션바 없음", htmlFund.indexOf("자산 구입") < 0 && htmlFund.indexOf("보증금 회수·기타 입금") < 0);
        var openMap = {};
        openMap["recurringExpenses:" + seedC.recurringExpenses[0].id] = true;
        var openHtml = App.Render.renderView("costs", seedC, rC, {
          costTab: "opex",
          costSecOpen: { "recurring-sga": true },
          costItemOpen: openMap
        });
        assert("지정 항목만 펼침", openHtml.indexOf('data-cost-item="' + ("recurringExpenses:" + seedC.recurringExpenses[0].id) + '" open') >= 0);
        eq("지정 외 항목은 접힘", (openHtml.match(/data-cost-item="[^"]+" open/g) || []).length, 1);
      }

      eq("시드 초기비용 KPI", rC.kpis.startupCost, 1361900);
      eq("시드 보증금+자산 현금", rC.kpis.fundingOut, 45000000);
      eq("시드 보증금 현금", rC.kpis.deposits, 45000000);
      eq("시드 자산 0 (미포함)", rC.kpis.capex, 0);
      eq("운영비+초기비용=손익비용", App.Money.roundWon(rC.kpis.opexPnl + rC.kpis.startupCost), rC.kpis.pnlExpense);
      assert("원장 초기비용 그룹", !!ledgerGroup(rC, "startup"));
      assert("원장 자산·보증금 그룹", ledgerGroup(rC, "funding").kind === "funding");
      eq("원장 사무실보증금", ledgerItem(ledgerGroup(rC, "funding"), "사무실보증금").values["2026-10"], -5000000);
      var parsedDep = JSON.parse(App.Store.exportJson(seedC));
      parsedDep.deposits[0].expectedReturnMonth = "2027-09";
      var restoredDep = App.Store.parseImport(JSON.stringify(parsedDep));
      eq("보증금 회수월 호환", restoredDep.deposits[0].expectedReturnMonth, "2027-09");
      eq("회수 필드 저장 후에도 기말 동일", App.Engine.runSimulation(restoredDep).kpis.endClosing, rC.kpis.endClosing);
    } catch (e) { fail("비용 아코디언 예외", e.message || e); }

    try {
      var sFee = empty();
      noOwnerDividend(sFee);
      sFee.profile.startMonth = "2027-01";
      sFee.profile.endMonth = "2027-12";
      sFee.profile.initialCash = 0;
      var pFee = App.Defaults.newProject("2027-01", "drama");
      pFee.name = "매출연동 테스트";
      pFee.status = "confirmed";
      pFee.contractAmount = 1100000000;
      pFee.payments = [
        Object.assign(App.Defaults.newPayment("2027-01"), { label: "1차", amount: 400000000, inputMode: "amount" }),
        Object.assign(App.Defaults.newPayment("2027-04"), { label: "2차", amount: 320000000, inputMode: "amount" }),
        Object.assign(App.Defaults.newPayment("2027-07"), { label: "3차", amount: 380000000, inputMode: "amount" })
      ];
      sFee.projects = [pFee];
      sFee.revenueFees = [
        { id: "sunnies", name: "써니스", basis: "totalRevenue", rate: 0.05, category: "sga", include: true },
        { id: "meridian", name: "메리디안", basis: "totalRevenue", rate: 0.15, category: "agency", include: true }
      ];

      var rFee = App.Engine.runSimulation(sFee);
      eq("Fee 기간매출", rFee.kpis.inflowInPeriod, 1100000000);
      eq("Fee 써니스 1월", monthRow(rFee, "2027-01").revenueFeeSga, 20000000);
      eq("Fee 메리디안 1월", monthRow(rFee, "2027-01").revenueFeeAgency, 60000000);
      eq("Fee 써니스 4월", monthRow(rFee, "2027-04").revenueFeeSga, 16000000);
      eq("Fee 메리디안 4월", monthRow(rFee, "2027-04").revenueFeeAgency, 48000000);
      eq("Fee 2월 0 (매출 없음)", monthRow(rFee, "2027-02").revenueFees, 0);
      eq("Fee 써니스 합계", rFee.revenueFees.totalsByFee.sunnies, 55000000);
      eq("Fee 메리디안 합계", rFee.revenueFees.totalsByFee.meridian, 165000000);
      eq("Fee 합계 KPI", rFee.kpis.revenueLinkedFeesTotal, 220000000);
      eq("Fee opex에 써니스 포함", rFee.kpis.opex,
        App.Money.sumBy(rFee.months, function (r) { return r.recurring + r.meal + r.dayBased; }) + 55000000);
      eq("Fee agencyFees에 메리디안 포함", rFee.kpis.agencyFees,
        App.Money.sumBy(rFee.months, function (r) { return r.fees; }) + 165000000);
      eq("Fee projectDirect에 메리디안 미포함", rFee.kpis.projectDirect,
        App.Money.sumBy(rFee.months, function (r) { return r.projectDirect + r.projectExpense; }));
      eq("Fee pnlExpense에 220M 포함", rFee.kpis.pnlExpense, 220000000);

      var sunniesRow = ledgerItem(ledgerGroup(rFee, "opex-sga"), "써니스 · 매출연동 5%");
      var meridianRow = ledgerItem(ledgerGroup(rFee, "agency"), "메리디안 · 매출연동 15%");
      assert("써니스 판관비 행 존재", !!sunniesRow);
      assert("메리디안 에이전시 수수료 행 존재", !!meridianRow);
      eq("써니스 행 TOTAL", sunniesRow && sunniesRow.total, -55000000);
      eq("메리디안 행 TOTAL", meridianRow && meridianRow.total, -165000000);
      eq("써니스 행 1월값", sunniesRow && sunniesRow.values["2027-01"], -20000000);
      eq("메리디안 행 4월값", meridianRow && meridianRow.values["2027-04"], -48000000);

      var closingBefore = rFee.kpis.endClosing;

      sFee.revenueFees[0].rate = 0.07;
      sFee.revenueFees[1].rate = 0.10;
      var rFee2 = App.Engine.runSimulation(sFee);
      eq("요율변경 써니스 7% 1월", monthRow(rFee2, "2027-01").revenueFeeSga, 28000000);
      eq("요율변경 메리디안 10% 1월", monthRow(rFee2, "2027-01").revenueFeeAgency, 40000000);
      eq("요율변경 써니스 합계", rFee2.revenueFees.totalsByFee.sunnies, 77000000);
      eq("요율변경 메리디안 합계", rFee2.revenueFees.totalsByFee.meridian, 110000000);
      eq("요율변경 합계 KPI", rFee2.kpis.revenueLinkedFeesTotal, 187000000);
      eq("요율변경시 기말현금 즉시 재계산", rFee2.kpis.endClosing - closingBefore, 220000000 - 187000000);

      var pAdd = App.Defaults.newProject("2027-02", "ad");
      pAdd.status = "confirmed";
      pAdd.contractAmount = 100000000;
      pAdd.payments = [Object.assign(App.Defaults.newPayment("2027-02"), { amount: 100000000, inputMode: "amount" })];
      sFee.projects.push(pAdd);
      var rFee3 = App.Engine.runSimulation(sFee);
      assert("매출 추가시 수수료 자동 증가", rFee3.kpis.revenueLinkedFeesTotal > rFee2.kpis.revenueLinkedFeesTotal);
      eq("매출 추가분 수수료 정확", rFee3.kpis.revenueLinkedFeesTotal - rFee2.kpis.revenueLinkedFeesTotal, 100000000 * (0.07 + 0.10));

      sFee.revenueFees[0].revenueScope = "category:ad";
      sFee.revenueFees[1].revenueScope = "workRevenue";
      var rFeeScoped = App.Engine.runSimulation(sFee);
      eq("광고만 수수료", rFeeScoped.revenueFees.totalsByFee.sunnies, 7000000);
      eq("작품 매출만 수수료", rFeeScoped.revenueFees.totalsByFee.meridian, 110000000);
      eq("광고만 2월 수수료", monthRow(rFeeScoped, "2027-02").revenueFeeSga, 7000000);
      eq("광고만 1월 수수료 없음", monthRow(rFeeScoped, "2027-01").revenueFeeSga, 0);
      eq("작품 매출 1월 수수료", monthRow(rFeeScoped, "2027-01").revenueFeeAgency, 40000000);
      sFee.revenueFees[0].revenueScope = "totalRevenue";
      sFee.revenueFees[1].revenueScope = "totalRevenue";

      sFee.revenueFees[0].include = false;
      var rFeeOff = App.Engine.runSimulation(sFee);
      eq("포함OFF 써니스 0", rFeeOff.revenueFees.totalsByFee.sunnies, 0);
      assert("포함OFF 판관비 행 제거", !ledgerItem(ledgerGroup(rFeeOff, "opex-sga"), "써니스 · 매출연동 7%"));
      eq("포함OFF 설정값 유지", sFee.revenueFees[0].rate, 0.07);
      sFee.revenueFees[0].include = true;

      var decimalFee = empty();
      decimalFee.profile.startMonth = "2027-01";
      decimalFee.profile.endMonth = "2027-01";
      var pDec = App.Defaults.newProject("2027-01", "drama");
      pDec.status = "confirmed";
      pDec.contractAmount = 100000000;
      pDec.payments = [Object.assign(App.Defaults.newPayment("2027-01"), { amount: 100000000, inputMode: "amount" })];
      decimalFee.projects = [pDec];
      decimalFee.revenueFees = [{ id: "dec", name: "소수점파트너", rate: 0.0725, category: "sga", include: true }];
      var rDec = App.Engine.runSimulation(decimalFee);
      eq("소수점 퍼센트 계산", rDec.revenueFees.totalsByFee.dec, 7250000);

      var noRateFee = empty();
      noRateFee.revenueFees = [{ id: "zero", name: "무요율", rate: 0, category: "sga", include: true }];
      var rNoRate = App.Engine.runSimulation(noRateFee);
      assert("요율 없음 경고", hasWarning(rNoRate, "revenue_fee_without_rate"));

      var emptyDefault = empty();
      assert("기본 상태 매출연동수수료 써니스/메리디안 기본값", Array.isArray(emptyDefault.revenueFees) &&
        emptyDefault.revenueFees.length === 2 &&
        emptyDefault.revenueFees[0].name === "써니스" && emptyDefault.revenueFees[0].rate === 0.05 &&
        emptyDefault.revenueFees[0].category === "sga" &&
        emptyDefault.revenueFees[1].name === "메리디안" && emptyDefault.revenueFees[1].rate === 0.15 &&
        emptyDefault.revenueFees[1].category === "agency");
      var parsedNoFees = JSON.parse(App.Store.exportJson(App.Sample.load()));
      delete parsedNoFees.revenueFees;
      var restoredNoFees = App.Store.parseImport(JSON.stringify(parsedNoFees));
      assert("구 JSON 매출연동수수료 기본값 복원", Array.isArray(restoredNoFees.revenueFees) &&
        restoredNoFees.revenueFees.length === 2 && restoredNoFees.revenueFees[0].name === "써니스" &&
        restoredNoFees.revenueFees[1].name === "메리디안");
      eq("구 JSON 기말현금 = 기본값 적용 결과", App.Engine.runSimulation(restoredNoFees).kpis.endClosing, 901188995);
      var parsedBlankFees = JSON.parse(App.Store.exportJson(App.Sample.load()));
      parsedBlankFees.revenueFees = [
        { id: "old1", name: "", basis: "totalRevenue", rate: 0, category: "sga", include: true },
        { id: "old2", name: "", basis: "totalRevenue", rate: 0, category: "sga", include: true }
      ];
      var restoredBlankFees = App.Store.parseImport(JSON.stringify(parsedBlankFees));
      assert("구 빈 수수료 행 프리셋 승격", restoredBlankFees.revenueFees.length === 2 &&
        restoredBlankFees.revenueFees[0].name === "써니스" &&
        restoredBlankFees.revenueFees[1].name === "메리디안");
      var parsedDeletedFees = JSON.parse(App.Store.exportJson(App.Sample.load()));
      parsedDeletedFees.revenueFees = [];
      var restoredDeletedFees = App.Store.parseImport(JSON.stringify(parsedDeletedFees));
      assert("구 빈 수수료 배열도 프리셋 복원", restoredDeletedFees.revenueFees.length === 2 &&
        restoredDeletedFees.revenueFees[0].name === "써니스" &&
        restoredDeletedFees.revenueFees[1].name === "메리디안");
      var parsedUserClearedFees = JSON.parse(App.Store.exportJson(App.Sample.load()));
      parsedUserClearedFees.revenueFees = [];
      parsedUserClearedFees.settings.revenueFeesUserCleared = true;
      var restoredUserClearedFees = App.Store.parseImport(JSON.stringify(parsedUserClearedFees));
      eq("사용자 명시 삭제 수수료 빈 배열 유지", restoredUserClearedFees.revenueFees.length, 0);

      if (App.Render && App.Render.renderView) {
        var htmlFee = App.Render.renderView("simulation", sFee, rFee2, { simTab: "fees", rateOpen: {}, workOpen: {} });
        assert("매출 연동 수수료 섹션", htmlFee.indexOf("매출 연동 수수료") >= 0);
        assert("써니스 입력값 표시", htmlFee.indexOf("써니스") >= 0);
        assert("메리디안 입력값 표시", htmlFee.indexOf("메리디안") >= 0);
        assert("판관비 옵션", htmlFee.indexOf("판관비") >= 0);
        assert("에이전시 수수료 옵션", htmlFee.indexOf("에이전시 수수료") >= 0);
        assert("수수료 기준 선택 옵션", htmlFee.indexOf("작품 매출") >= 0 && htmlFee.indexOf("TVCF만") >= 0);
        assert("수수료 항목 추가 버튼", htmlFee.indexOf("+ 수수료 항목") >= 0);
        var htmlOrg = App.Render.renderView("simulation", sFee, rFee2, { simTab: "org" });
        assert("조직 탭 인건비", htmlOrg.indexOf("인건비") >= 0 && htmlOrg.indexOf("직원 식대") >= 0);
        assert("조직 탭에는 판관비 없음(별도 탭으로 분리)", htmlOrg.indexOf("회사 운영비 (판관비)") < 0);
        var htmlSimTabs = App.Render.renderView("simulation", sFee, rFee2, { simTab: "basics" });
        assert("설정에 회사 운영비 탭 없음", htmlSimTabs.indexOf(">회사 운영비<") < 0 && htmlSimTabs.indexOf('data-tab="opex"') < 0);
        assert("설정에 회사 지원 탭 유지", htmlSimTabs.indexOf(">회사 지원<") >= 0);
        var htmlCostOpex = App.Render.renderView("costs", sFee, rFee2, { costTab: "opex" });
        assert("운영비는 비용 탭에서 관리", htmlCostOpex.indexOf("4대보험 (회사 부담)") >= 0);
        assert("비용 인건비는 조직 설정 연동", htmlCostOpex.indexOf("조직 설정 연동") >= 0);
        assert("비용 인건비에서 직원 추가 없음", htmlCostOpex.indexOf("+ 직원") < 0);
        assert("비용 인건비에서 급여 재입력 없음", htmlCostOpex.indexOf('data-path="employees.0.monthlySalary"') < 0);
        var htmlSupport = App.Render.renderView("simulation", sFee, rFee2, { simTab: "support" });
        assert("회사 지원 섹션", htmlSupport.indexOf("회사 지원 / 복리후생") >= 0 &&
          htmlSupport.indexOf("연기수업료") >= 0 &&
          htmlSupport.indexOf("+ 지원 항목") >= 0);
        assert("설정에 영업 목표 없음", htmlFee.indexOf("영업 활동 목표") < 0 && htmlFee.indexOf("미배치") < 0);
        assert("설정에 활동 추가 없음", htmlFee.indexOf("fill-sales-plans") < 0 && htmlFee.indexOf("add-sales-plan") < 0);
        assert("설정에 수익 연동 기본 비용률 없음", htmlFee.indexOf("수익 연동 기본 비용률") < 0);
        assert("설정에 진행비 기본률 없음", htmlFee.indexOf("진행비 기본률") < 0);
      }
    } catch (e) { fail("매출연동수수료 예외", e.message || e); }

    try {
      var pXp = App.Defaults.newProject("2026-09", "drama");
      pXp.name = "하렘의 남자들";
      pXp.status = "confirmed";
      pXp.episodes = 16;
      pXp.feePerEpisode = 50000000;
      pXp.shootStartMonth = "2026-09";
      pXp.shootEndMonth = "2027-02";
      pXp.expenseRate = 0.20;
      pXp.expenseRateMode = "custom";
      pXp.expenseInclude = true;

      eq("진행비 총출연료 기준", App.Engine.projectContractAmount(pXp), 800000000);
      var xpDetail = App.Engine.calculateProjectExpenseDetail(pXp);
      eq("진행비 총액 = 출연료×비율", xpDetail.total, 160000000);
      eq("진행비 개월수 6개월", Object.keys(xpDetail.months).length, 6);
      eq("진행비 09월", xpDetail.months["2026-09"], 26666666);
      eq("진행비 10월", xpDetail.months["2026-10"], 26666666);
      eq("진행비 11월", xpDetail.months["2026-11"], 26666666);
      eq("진행비 12월", xpDetail.months["2026-12"], 26666666);
      eq("진행비 01월", xpDetail.months["2027-01"], 26666666);
      eq("진행비 잔액은 마지막달(02월)", xpDetail.months["2027-02"], 26666670);
      var xpSum = 0;
      Object.keys(xpDetail.months).forEach(function (m) { xpSum += xpDetail.months[m]; });
      eq("진행비 월별 합계 = 총액", xpSum, 160000000);

      pXp.expenseRate = 0.15;
      pXp.expenseRateMode = "custom";
      eq("진행비율 변경시 즉시 재계산", App.Engine.calculateProjectExpenseDetail(pXp).total, 120000000);
      pXp.expenseRate = 0.20;

      pXp.feePerEpisode = 60000000;
      eq("총출연료 변경시 재계산 (16×6천만×20%)", App.Engine.calculateProjectExpenseDetail(pXp).total, 192000000);
      pXp.feePerEpisode = 50000000;

      pXp.shootEndMonth = "2027-04";
      var xpDetail8 = App.Engine.calculateProjectExpenseDetail(pXp);
      eq("촬영기간 변경시 8개월로 재배분", Object.keys(xpDetail8.months).length, 8);
      eq("8개월 균등 배분 (160M/8)", xpDetail8.months["2026-09"], 20000000);
      pXp.shootEndMonth = "2027-02";

      pXp.shootStartMonth = "2027-05";
      pXp.shootEndMonth = "2027-04";
      var xpBadPeriod = App.Engine.calculateProjectExpenseDetail(pXp);
      eq("촬영 종료가 시작보다 빠르면 1개월 몰아넣지 않음", xpBadPeriod.total, 0);
      assert("촬영기간 역전 경고", /촬영 종료월/.test(App.Engine.projectExpensePeriodIssue(pXp)));
      var sBadPeriod = empty();
      sBadPeriod.projects = [pXp];
      var rBadPeriod = App.Engine.runSimulation(sBadPeriod);
      assert("월별 분석 진행비 기간 오류 경고", hasWarning(rBadPeriod, "project_expense_no_shoot_month"));
      var openBadPeriod = { workItemOpen: {} };
      openBadPeriod.workItemOpen[pXp.id] = true;
      var htmlBadPeriod = App.Render.renderView("revenue", sBadPeriod, rBadPeriod, openBadPeriod);
      assert("수익 상세 진행비 기간 오류 표시", htmlBadPeriod.indexOf("촬영 종료월") >= 0 &&
        htmlBadPeriod.indexOf("촬영 시작월") >= 0);
      pXp.shootStartMonth = "2026-09";
      pXp.shootEndMonth = "2027-02";

      var pNoEnd = App.Defaults.newProject("2026-09", "drama");
      pNoEnd.episodes = 16;
      pNoEnd.feePerEpisode = 50000000;
      pNoEnd.shootStartMonth = "2026-09";
      pNoEnd.shootEndMonth = null;
      pNoEnd.expenseRate = 0.20;
      pNoEnd.expenseRateMode = "custom";
      var noEndDetail = App.Engine.calculateProjectExpenseDetail(pNoEnd);
      eq("종료월 없으면 시작월 1개월만", Object.keys(noEndDetail.months).length, 1);
      eq("종료월 없으면 시작월 전액 반영", noEndDetail.months["2026-09"], 160000000);

      var pNoRate = App.Defaults.newProject("2026-09", "drama");
      pNoRate.episodes = 16;
      pNoRate.feePerEpisode = 50000000;
      pNoRate.shootStartMonth = "2026-09";
      pNoRate.shootEndMonth = "2027-02";
      eq("신규 작품 기본모드", pNoRate.expenseRateMode, "default");
      eq("신규 작품 진행비 금액모드 기본 자동", pNoRate.expenseAmountMode, "auto");
      eq("신규 작품 수동 진행비 기본 0", pNoRate.expenseManualAmount, 0);
      eq("신규 작품 기본 진행비율 20%", App.Defaults.resolvedExpenseRate(pNoRate), 0.20);
      eq("기본 20% → 총액", App.Engine.calculateProjectExpenseDetail(pNoRate).total, 160000000);

      pNoRate.expenseAmountMode = "manual";
      pNoRate.expenseManualAmount = 60000000;
      var pManualDetail = App.Engine.calculateProjectExpenseDetail(pNoRate);
      eq("수동 총 진행비가 비율 계산보다 우선", pManualDetail.total, 60000000);
      eq("수동 진행비도 같은 촬영기간으로 배분", Object.keys(pManualDetail.months).length, 6);
      eq("수동 진행비 월별 합계", App.Money.sumBy(Object.keys(pManualDetail.months), function (m) { return pManualDetail.months[m]; }), 60000000);
      var sManualXp = empty();
      sManualXp.profile.startMonth = "2026-09";
      sManualXp.profile.endMonth = "2027-02";
      sManualXp.projects = [pNoRate];
      var rManualXp = App.Engine.runSimulation(sManualXp);
      eq("수동 진행비가 KPI에 반영", rManualXp.kpis.projectExpense, 60000000);
      var htmlManualXp = App.Render.renderView("revenue", sManualXp, rManualXp, { workItemOpen: (function () { var o = {}; o[pNoRate.id] = true; return o; })() });
      assert("수동 금액 사용 UI", htmlManualXp.indexOf("수동 금액 사용") >= 0 && htmlManualXp.indexOf("60,000,000") >= 0);
      assert("수동 compact 표시", htmlManualXp.indexOf("수동 · 60,000,000원") >= 0);
      var roundManual = App.Store.parseImport(App.Store.exportJson(sManualXp));
      eq("수동 진행비 모드 JSON 보존", roundManual.projects[0].expenseAmountMode, "manual");
      eq("수동 진행비 금액 JSON 보존", roundManual.projects[0].expenseManualAmount, 60000000);
      pNoRate.expenseAmountMode = "auto";
      pNoRate.expenseManualAmount = 0;

      var pLegacyDx = App.Defaults.newProject("2026-09", "drama");
      pLegacyDx.name = "하렘의 남자들";
      pLegacyDx.status = "confirmed";
      pLegacyDx.episodes = 16;
      pLegacyDx.feePerEpisode = 50000000;
      pLegacyDx.shootStartMonth = "2026-09";
      pLegacyDx.shootEndMonth = "2027-02";
      pLegacyDx.expenseRateMode = "custom";
      pLegacyDx.expenseRate = 0.20;
      pLegacyDx.lunchTruckInclude = false;
      pLegacyDx.directExpenses = [{ id: "legacy-project", name: "프로젝트", amount: 100000000, month: "2026-11", include: true }];
      var sLegacyDx = empty();
      sLegacyDx.profile.startMonth = "2026-09";
      sLegacyDx.profile.endMonth = "2027-02";
      sLegacyDx.projects = [pLegacyDx];
      var rLegacyDx = App.Engine.runSimulation(sLegacyDx);
      eq("기존 프로젝트 직접비 중복 행은 KPI에서 제외", rLegacyDx.kpis.projectDirect, 160000000);
      assert("기존 프로젝트 직접비 중복 행은 원장에도 없음", !ledgerItem(ledgerGroup(rLegacyDx, "project"), "하렘의 남자들 / 프로젝트"));

      var sXp = empty();
      sXp.profile.startMonth = "2026-11";
      sXp.profile.endMonth = "2027-12";
      sXp.profile.initialCash = 0;
      sXp.projects = [pXp];
      pXp.lunchTruckInclude = false;
      var rXp = App.Engine.runSimulation(sXp);
      eq("시뮬기간 밖(09,10월) 제외 후 kpi", rXp.kpis.projectExpense, 106666668);
      eq("11월 진행비", monthRow(rXp, "2026-11").projectExpense, 26666666);
      eq("27-02 진행비(잔액)", monthRow(rXp, "2027-02").projectExpense, 26666670);
      eq("27-03 진행비 없음", monthRow(rXp, "2027-03").projectExpense, 0);
      eq("projectDirect에 진행비 포함", rXp.kpis.projectDirect, 106666668);
      var xpRow = ledgerItem(ledgerGroup(rXp, "project"), "[자동] 하렘의 남자들 진행비");
      assert("원장에 자동 진행비 행 존재", !!xpRow);
      eq("원장 진행비 TOTAL", xpRow && xpRow.total, -106666668);
      eq("원장 진행비 11월값", xpRow && xpRow.values["2026-11"], -26666666);

      var closingBeforeXp = rXp.kpis.endClosing;
      sXp.profile.startMonth = "2026-09";
      var rXpFull = App.Engine.runSimulation(sXp);
      eq("기간 앞당기면 09,10월 다시 나타남", rXpFull.kpis.projectExpense, 160000000);
      assert("기간 확장시 기말현금 달라짐", rXpFull.kpis.endClosing !== closingBeforeXp);
      sXp.settings.scenarios.exclusiveContract.personalTax.mode = "manual";
      sXp.settings.scenarios.exclusiveContract.personalTax.manualTaxAmount = 0;
      sXp.settings.scenarios.soloAgency.personalTax.mode = "manual";
      sXp.settings.scenarios.soloAgency.personalTax.manualTaxAmount = 0;
      var cmpXp = App.Engine.runScenarioComparison(sXp, rXpFull);
      eq("1인 기획사 진행비는 법인 비용", cmpXp.scenarios.soloAgency.projectExpense, 160000000);
      eq("전속 진행비 금액", cmpXp.scenarios.exclusiveContract.projectExpense, 160000000);
      eq("전속 진행비는 배우 실수령 미차감", cmpXp.scenarios.exclusiveContract.actorBorneCosts,
        cmpXp.scenarios.exclusiveContract.directorCost);
      eq("기본 진행비 부담은 회사", sXp.settings.scenarios.exclusiveContract.costBurdenRules.projectExpense, "company");
      eq("전속 진행비 표시 kind", cmpXp.scenarios.exclusiveContract.lines.projectExpense.kind, "money");
      eq("전속 진행비 표시 금액", cmpXp.scenarios.exclusiveContract.lines.projectExpense.value, 160000000);
      eq("전속 진행비 표시 배지", cmpXp.scenarios.exclusiveContract.lines.projectExpense.badge, "기존 회사 100% 부담");
      var htmlXpCmp = App.Render.renderView("analysis", sXp, rXpFull, { analysisTab: "scenarios" });
      assert("비교표 진행비 행", htmlXpCmp.indexOf("진행비") >= 0);
      assert("비교표 진행비 회사 100% 부담 배지", htmlXpCmp.indexOf("기존 회사 100% 부담") >= 0);
      eq("1인 기획사 프로젝트 직접비=진행비+밥차+기타", cmpXp.scenarios.soloAgency.projectDirectTotal,
        App.Money.roundWon(cmpXp.scenarios.soloAgency.projectExpense + cmpXp.scenarios.soloAgency.lunchTruck +
          cmpXp.scenarios.soloAgency.projectDirectOther));
      eq("전속 프로젝트 직접비 발생액 동일", cmpXp.scenarios.exclusiveContract.projectDirectTotal,
        cmpXp.scenarios.soloAgency.projectDirectTotal);
      eq("월별 KPI 직접비(수수료 제외)=시나리오 직접비", cmpXp.scenarios.soloAgency.projectDirectTotal,
        App.Money.roundWon(rXpFull.kpis.projectDirect - App.Money.sumBy(rXpFull.months, function (r) { return r.revenueFeeProject; })));
      sXp.profile.startMonth = "2026-11";

      pXp.expenseInclude = false;
      var rXpOff = App.Engine.runSimulation(sXp);
      eq("반영 OFF면 kpi 0", rXpOff.kpis.projectExpense, 0);
      assert("반영 OFF면 원장 행 없음", !ledgerItem(ledgerGroup(rXpOff, "project"), "[자동] 하렘의 남자들 진행비"));
      eq("반영 OFF에도 참고값(비율) 유지", pXp.expenseRate, 0.20);
      eq("반영 OFF에도 detail 총액은 유지", App.Engine.calculateProjectExpenseDetail(pXp).total, 160000000);
      pXp.expenseInclude = true;

      var pNoShoot = App.Defaults.newProject("2026-09", "drama");
      pNoShoot.name = "촬영월 미정";
      pNoShoot.status = "confirmed";
      pNoShoot.episodes = 1;
      pNoShoot.feePerEpisode = 100000000;
      pNoShoot.expenseRate = 0.20;
      pNoShoot.expenseRateMode = "custom";
      pNoShoot.shootStartMonth = null;
      var sNoShoot = empty();
      sNoShoot.profile.startMonth = "2027-01";
      sNoShoot.profile.endMonth = "2027-03";
      sNoShoot.projects = [pNoShoot];
      var rNoShoot = App.Engine.runSimulation(sNoShoot);
      eq("촬영월 없으면 진행비 0", rNoShoot.kpis.projectExpense, 0);
      assert("촬영월 없음 경고", hasWarning(rNoShoot, "project_expense_no_shoot_month"));

      var pOldJson = { id: "old-1", category: "drama", name: "구 데이터", status: "confirmed",
        episodes: 2, feePerEpisode: 100000000, shootStartMonth: "2027-01", shootEndMonth: "2027-02",
        payments: [], directExpenses: [] };
      eq("구 JSON 필드 없으면 기본률 상속", App.Engine.calculateProjectExpenseDetail(pOldJson).total, 40000000);
      var sOldXp = empty();
      sOldXp.projects = [pOldJson];
      assert("구 JSON 예외 없이 시뮬 OK", !!App.Engine.runSimulation(sOldXp).kpis);

      var pAgency = App.Defaults.newProject("2027-01", "ad");
      pAgency.name = "광고 1";
      pAgency.status = "confirmed";
      pAgency.contractAmount = 300000000;
      pAgency.expenseRateMode = "custom";
      pAgency.expenseRate = 0;
      pAgency.fee = { name: "광고 AP", rate: 0.10, amount: null, basis: "inflow" };
      pAgency.payments = [Object.assign(App.Defaults.newPayment("2027-01"), { amount: 300000000, inputMode: "amount" })];
      var sAgency = empty();
      sAgency.profile.startMonth = "2027-01";
      sAgency.profile.endMonth = "2027-01";
      sAgency.projects = [pAgency];
      sAgency.revenueFees = [];
      var rAgency = App.Engine.runSimulation(sAgency);
      eq("성사수수료는 agencyFees로", rAgency.kpis.agencyFees, 30000000);
      eq("성사수수료는 projectDirect 미포함", rAgency.kpis.projectDirect, 0);
      var agencyFeeRow = ledgerItem(ledgerGroup(rAgency, "agency"), "광고 1 광고 AP");
      assert("성사수수료 원장 agency 그룹", !!agencyFeeRow);
      assert("성사수수료 project 그룹에는 없음", !ledgerItem(ledgerGroup(rAgency, "project"), "광고 1 광고 AP"));

      var soloAgencyRun = App.Engine.runSimulation(sAgency);
      var cmpAgency = App.Engine.runScenarioComparison(sAgency, soloAgencyRun);
      var bucketsAgency = App.Engine.exclusiveCostBuckets(sAgency, soloAgencyRun);
      eq("전속 시나리오: 성사수수료는 revenueLinkedFees 버킷", bucketsAgency.revenueLinkedFees, 30000000);
      eq("전속 시나리오: 성사수수료는 projectDirect 버킷 아님", bucketsAgency.projectDirect, 0);

      var sLegacyCat = empty();
      sLegacyCat.profile.startMonth = "2027-01";
      sLegacyCat.profile.endMonth = "2027-01";
      var pLegacyCat = App.Defaults.newProject("2027-01", "drama");
      pLegacyCat.status = "confirmed";
      pLegacyCat.contractAmount = 100000000;
      pLegacyCat.payments = [Object.assign(App.Defaults.newPayment("2027-01"), { amount: 100000000, inputMode: "amount" })];
      sLegacyCat.projects = [pLegacyCat];
      sLegacyCat.revenueFees = [{ id: "legacy1", name: "구분류파트너", rate: 0.10, category: "project", include: true }];
      var rLegacyCat = App.Engine.runSimulation(sLegacyCat);
      eq("구 project 분류는 agency로 계산", monthRow(rLegacyCat, "2027-01").revenueFeeAgency, 10000000);
      eq("구 project 분류는 revenueFeeProject 아님", monthRow(rLegacyCat, "2027-01").revenueFeeProject, 0);
      assert("구 project 분류 원장도 agency 그룹", !!ledgerItem(ledgerGroup(rLegacyCat, "agency"), "구분류파트너 · 매출연동 10%"));
      var normalizedLegacy = App.Defaults.normalizeRevenueFee({ id: "legacy2", name: "정규화", rate: 0.1, category: "project", include: true });
      eq("normalizeRevenueFee도 project를 agency로", normalizedLegacy.category, "agency");
      assert("FeeCostCategories에 project 옵션 없음", !(App.FeeCostCategories || []).some(function (c) { return c.id === "project"; }));

      var sDef = empty();
      eq("설정 기본 작품비율 20%", sDef.settings.revenueExpenseRates.work, 0.20);
      eq("설정 기본 영업비율 10%", sDef.settings.revenueExpenseRates.sales, 0.10);
      eq("설정 헤메·식대 경량 배율 1.5", sDef.settings.revenueExpenseRates.appearanceLight, 1.5);
      eq("설정 헤메·식대 중량 배율 3", sDef.settings.revenueExpenseRates.appearanceHeavy, 3);
      var pDef = App.Defaults.newProject("2026-09", "drama", sDef);
      pDef.name = "기본값 드라마";
      pDef.status = "confirmed";
      pDef.episodes = 16;
      pDef.feePerEpisode = 50000000;
      pDef.shootStartMonth = "2026-09";
      pDef.shootEndMonth = "2027-02";
      eq("신규 작품 기본값 사용", pDef.expenseRateMode, "default");
      eq("신규 작품 20% 상속", App.Engine.calculateProjectExpenseDetail(pDef, sDef).total, 160000000);
      sDef.settings.revenueExpenseRates.work = 0.18;
      eq("기본값 사용 건은 설정 변경 따라감", App.Engine.calculateProjectExpenseDetail(pDef, sDef).total, 144000000);
      pDef.expenseRateMode = "custom";
      pDef.expenseRate = 0.25;
      sDef.settings.revenueExpenseRates.work = 0.10;
      eq("개별 설정은 기본비율 변경 무관", App.Engine.calculateProjectExpenseDetail(pDef, sDef).total, 200000000);

      var pSalesXp = App.Defaults.newProject("2027-01", "ad", sDef);
      pSalesXp.name = "TVCF";
      pSalesXp.status = "confirmed";
      pSalesXp.contractAmount = 300000000;
      pSalesXp.shootStartMonth = "2027-01";
      pSalesXp.shootEndMonth = "2027-06";
      sDef.settings.revenueExpenseRates.sales = 0.10;
      eq("신규 영업 기본모드", pSalesXp.expenseRateMode, "default");
      eq("광고 기본은 헤메·식대 ×3", App.Engine.calculateProjectExpenseDetail(pSalesXp, sDef).total, 2100000);
      var sSalesXp = empty();
      sSalesXp.profile.startMonth = "2027-01";
      sSalesXp.profile.endMonth = "2027-06";
      sSalesXp.projects = [pSalesXp];
      sSalesXp.revenueFees = [];
      var rSalesXp = App.Engine.runSimulation(sSalesXp);
      eq("영업 진행비 kpi", rSalesXp.kpis.projectExpense, 2100000);
      assert("원장 영업 진행비", !!ledgerItem(ledgerGroup(rSalesXp, "project"), "[자동] TVCF 영업 진행비"));
      eq("영업 6개월 균등", monthRow(rSalesXp, "2027-01").projectExpense, 350000);
      var cmpSales = App.Engine.runScenarioComparison(sSalesXp, rSalesXp);
      eq("1인 기획사 영업 진행비는 법인 비용", cmpSales.scenarios.soloAgency.projectExpense, 2100000);
      eq("전속 영업 진행비는 회사 부담", cmpSales.scenarios.exclusiveContract.projectExpense, 2100000);
      eq("전속 영업 진행비 배우 실수령 미차감", cmpSales.scenarios.exclusiveContract.actorBorneCosts,
        cmpSales.scenarios.exclusiveContract.directorCost);

      var pMagXp = App.Defaults.newProject("2027-01", "magazine", sDef);
      pMagXp.name = "매거진";
      pMagXp.status = "confirmed";
      pMagXp.contractAmount = 100000000;
      pMagXp.shootStartMonth = "2027-01";
      pMagXp.shootEndMonth = "2027-01";
      eq("매거진은 영업 10% 유지", App.Engine.calculateProjectExpenseDetail(pMagXp, sDef).total, 10000000);

      var pSeedXp = App.Defaults.newProject("2027-01", "seeding", sDef);
      pSeedXp.name = "시딩";
      pSeedXp.status = "confirmed";
      pSeedXp.contractAmount = 5000000;
      pSeedXp.shootStartMonth = "2027-01";
      pSeedXp.shootEndMonth = "2027-01";
      eq("시딩은 헤메·식대 ×1.5", App.Engine.calculateProjectExpenseDetail(pSeedXp, sDef).total, 1050000);
      pSeedXp.episodes = 2;
      eq("시딩 2회는 원가×1.5×2", App.Engine.calculateProjectExpenseDetail(pSeedXp, sDef).total, 2100000);

      var pEvtXp = App.Defaults.newProject("2027-01", "event", sDef);
      pEvtXp.status = "confirmed";
      pEvtXp.shootStartMonth = "2027-01";
      pEvtXp.shootEndMonth = "2027-01";
      eq("행사는 시딩과 같은 1.5배", App.Engine.calculateProjectExpenseDetail(pEvtXp, sDef).total, 1050000);

      var pAmbXp = App.Defaults.newProject("2027-01", "ambassador", sDef);
      pAmbXp.status = "confirmed";
      pAmbXp.shootStartMonth = "2027-01";
      pAmbXp.shootEndMonth = "2027-01";
      eq("앰버서더는 시딩과 같은 1.5배", App.Engine.calculateProjectExpenseDetail(pAmbXp, sDef).total, 1050000);

      var pPicXp = App.Defaults.newProject("2027-01", "pictorial", sDef);
      pPicXp.status = "confirmed";
      pPicXp.shootStartMonth = "2027-01";
      pPicXp.shootEndMonth = "2027-01";
      eq("유가화보는 광고와 같은 3배", App.Engine.calculateProjectExpenseDetail(pPicXp, sDef).total, 2100000);

      var pAdCustom = App.Defaults.newProject("2027-01", "ad", sDef);
      pAdCustom.status = "confirmed";
      pAdCustom.contractAmount = 300000000;
      pAdCustom.shootStartMonth = "2027-01";
      pAdCustom.shootEndMonth = "2027-01";
      pAdCustom.expenseRateMode = "custom";
      pAdCustom.expenseRate = 0.10;
      eq("광고 개별 %는 계약금 비율", App.Engine.calculateProjectExpenseDetail(pAdCustom, sDef).total, 30000000);

      var hair = sDef.settings.scenarios.exclusiveContract.actorPersonalCosts.filter(function (it) {
        return it.id === "apc-hair";
      })[0];
      hair.unitAmount = 200000;
      eq("헤어 단가 수정이 광고 진행비에 반영", App.Engine.calculateProjectExpenseDetail(pPicXp, sDef).total, 2400000);
      hair.unitAmount = 100000;

      var hairOff = sDef.settings.scenarios.exclusiveContract.actorPersonalCosts.filter(function (it) {
        return it.id === "apc-hair";
      })[0];
      hairOff.include = false;
      eq("개인활동비 포함 OFF여도 진행비 단가 유지", App.Engine.calculateProjectExpenseDetail(pPicXp, sDef).total, 2100000);
      hairOff.include = true;

      sDef.employees = [{ id: "meal-1", name: "대표", monthlySalary: 1000000, include: true, meal: true }];
      sDef.settings.meal.dailyRate = 10000;
      eq("당일 식대 포함 광고 3배", App.Engine.calculateProjectExpenseDetail(pPicXp, sDef).total, (700000 + 10000) * 3);
      sDef.employees = [];
      sDef.settings.meal.dailyRate = 15000;

      var sXpGap = empty();
      sXpGap.profile.startMonth = "2027-01";
      sXpGap.profile.endMonth = "2027-12";
      var pXpGap = App.Defaults.newProject("2027-01", "drama", sXpGap);
      pXpGap.name = "기간 밖 작품";
      pXpGap.contractAmount = 100000000;
      pXpGap.shootStartMonth = "2026-12";
      pXpGap.shootEndMonth = "2026-12";
      pXpGap.expenseRateMode = "custom";
      pXpGap.expenseRate = 0.2;
      pXpGap.expenseInclude = true;
      sXpGap.projects = [pXpGap];
      var rXpGap = App.Engine.runSimulation(sXpGap);
      eq("진행비 검산 등록", rXpGap.projectExpenseGap.registered, 20000000);
      eq("진행비 검산 월별반영 0", rXpGap.projectExpenseGap.inPeriod, 0);
      eq("진행비 검산 차이", rXpGap.projectExpenseGap.gap, 20000000);
      assert("진행비 검산 이슈", rXpGap.projectExpenseGap.hasIssues);
      var htmlXpGap = App.Render.renderView("analysis", sXpGap, rXpGap, { analysisTab: "monthly" });
      assert("분석 진행비 불일치 배너", htmlXpGap.indexOf("월별 분석 프로젝트 진행비가 등록 수익의 총 진행비와 다릅니다") >= 0 &&
        htmlXpGap.indexOf("기간 밖 작품") >= 0);

      var pPayOnly = App.Defaults.newProject("2027-01", "ad", sDef);
      pPayOnly.name = "입금월만";
      pPayOnly.status = "confirmed";
      pPayOnly.contractAmount = 100000000;
      pPayOnly.shootStartMonth = null;
      pPayOnly.payments = [Object.assign(App.Defaults.newPayment("2027-03"), { amount: 100000000, inputMode: "amount" })];
      var sPayOnly = empty();
      sPayOnly.profile.startMonth = "2027-01";
      sPayOnly.profile.endMonth = "2027-03";
      sPayOnly.projects = [pPayOnly];
      sPayOnly.revenueFees = [];
      var rPayOnly = App.Engine.runSimulation(sPayOnly);
      eq("영업 기간없으면 입금월 반영", monthRow(rPayOnly, "2027-03").projectExpense, 2100000);
      eq("영업 입금월 외 0", monthRow(rPayOnly, "2027-01").projectExpense, 0);

      var sMig = empty();
      sMig.projects = [{
        id: "legacy-rate", category: "drama", name: "구비율", status: "confirmed",
        episodes: 2, feePerEpisode: 100000000, shootStartMonth: "2027-01", shootEndMonth: "2027-02",
        payments: [], directExpenses: [], expenseRate: 0.15
      }];
      App.Defaults.ensureState(sMig);
      eq("기존 비율은 custom", sMig.projects[0].expenseRateMode, "custom");
      eq("기존 비율 유지", sMig.projects[0].expenseRate, 0.15);
      eq("기존 비율 덮어쓰지 않음", App.Engine.calculateProjectExpenseDetail(sMig.projects[0], sMig).total, 30000000);

      var sMig0 = empty();
      sMig0.projects = [{
        id: "legacy-zero", category: "drama", name: "구제로", status: "confirmed",
        episodes: 2, feePerEpisode: 100000000, shootStartMonth: "2027-01", shootEndMonth: "2027-02",
        payments: [], directExpenses: []
      }];
      App.Defaults.ensureState(sMig0);
      eq("구 JSON 무필드는 default", sMig0.projects[0].expenseRateMode, "default");
      eq("구 JSON 무필드 저장비율 0", sMig0.projects[0].expenseRate, 0);
      eq("구 JSON 무필드는 기본률 20%", App.Engine.calculateProjectExpenseDetail(sMig0.projects[0], sMig0).total, 40000000);

      var seedXp = (App.Defaults.seedState || App.Sample.load)();
      eq("시드 기본률 적용 기말", App.Engine.runSimulation(seedXp).kpis.endClosing, 1204738995);
      App.Defaults.ensureState(seedXp);
      eq("시드 마이그레이션 후 기말", App.Engine.runSimulation(seedXp).kpis.endClosing, 1204738995);
      assert("시드에 작품 있음", (seedXp.projects || []).length > 0);
      eq("시드 진행비 kpi", App.Engine.runSimulation(seedXp).kpis.projectExpense, 228144000);

      var sChain = empty();
      sChain.profile.startMonth = "2027-01";
      sChain.profile.endMonth = "2027-01";
      var pWork8 = App.Defaults.newProject("2027-01", "drama", sChain);
      pWork8.name = "작품8억";
      pWork8.status = "confirmed";
      pWork8.contractAmount = 800000000;
      pWork8.shootStartMonth = "2027-01";
      pWork8.shootEndMonth = "2027-01";
      pWork8.payments = [Object.assign(App.Defaults.newPayment("2027-01"), { amount: 800000000, inputMode: "amount" })];
      sChain.projects = [pWork8];
      sChain.revenueFees = [];
      eq("작품 8억 × 기본 20%", App.Engine.calculateProjectExpenseDetail(pWork8, sChain).total, 160000000);
      eq("작품 8억 CF 진행비", App.Engine.runSimulation(sChain).kpis.projectExpense, 160000000);
      sChain.settings.revenueExpenseRates.work = 0.25;
      eq("기본률 25%로 즉시 재계산", App.Engine.calculateProjectExpenseDetail(pWork8, sChain).total, 200000000);
      eq("기본률 25% CF", App.Engine.runSimulation(sChain).kpis.projectExpense, 200000000);
      sChain.settings.revenueExpenseRates.work = 0.20;

      var pSales3 = App.Defaults.newProject("2027-01", "ad", sChain);
      pSales3.name = "광고3억";
      pSales3.status = "confirmed";
      pSales3.contractAmount = 300000000;
      pSales3.shootStartMonth = "2027-01";
      pSales3.shootEndMonth = "2027-01";
      pSales3.payments = [Object.assign(App.Defaults.newPayment("2027-01"), { amount: 300000000, inputMode: "amount" })];
      eq("영업 3억 × 헤메·식대 3배", App.Engine.calculateProjectExpenseDetail(pSales3, sChain).total, 2100000);

      pWork8.expenseRateMode = "custom";
      pWork8.expenseRate = 0.15;
      pWork8.expenseRateUserSet = true;
      eq("개별 override 15%", App.Engine.calculateProjectExpenseDetail(pWork8, sChain).total, 120000000);
      pWork8.expenseRate = 0;
      eq("명시적 override 0%", App.Engine.calculateProjectExpenseDetail(pWork8, sChain).total, 0);
      eq("명시적 0%는 CF 0", App.Engine.runSimulation(sChain).kpis.projectExpense, 0);

      var sZeroKeep = empty();
      sZeroKeep.projects = [{
        id: "zero-user", category: "drama", name: "명시적0", status: "confirmed",
        contractAmount: 800000000, shootStartMonth: "2027-01", shootEndMonth: "2027-01",
        expenseRateMode: "custom", expenseRate: 0, expenseRateUserSet: true, expenseInclude: true,
        payments: [], directExpenses: []
      }];
      App.Defaults.ensureState(sZeroKeep);
      eq("명시적 0%는 import 후에도 custom", sZeroKeep.projects[0].expenseRateMode, "custom");
      eq("명시적 0%는 import 후에도 0", App.Engine.calculateProjectExpenseDetail(sZeroKeep.projects[0], sZeroKeep).total, 0);
      var roundZero = App.Store.parseImport(App.Store.exportJson(sZeroKeep));
      eq("JSON 왕복 후 custom 0% 유지", roundZero.projects[0].expenseRateMode, "custom");
      eq("JSON 왕복 후 진행비 0", App.Engine.calculateProjectExpenseDetail(roundZero.projects[0], roundZero).total, 0);

      var sReclaim = empty();
      sReclaim.projects = [{
        id: "old-custom-zero", category: "drama", name: "구custom0", status: "confirmed",
        contractAmount: 800000000, shootStartMonth: "2027-01", shootEndMonth: "2027-01",
        expenseRateMode: "custom", expenseRate: 0, expenseInclude: true,
        payments: [], directExpenses: []
      }];
      App.Defaults.ensureState(sReclaim);
      eq("구 custom 0은 기본률로 회복", sReclaim.projects[0].expenseRateMode, "default");
      eq("구 custom 0은 20% 상속", App.Engine.calculateProjectExpenseDetail(sReclaim.projects[0], sReclaim).total, 160000000);

      var sMix = empty();
      sMix.profile.startMonth = "2027-01";
      sMix.profile.endMonth = "2027-01";
      var pMixA = App.Defaults.newProject("2027-01", "drama", sMix);
      pMixA.name = "기본작품";
      pMixA.status = "confirmed";
      pMixA.contractAmount = 800000000;
      pMixA.shootStartMonth = "2027-01";
      pMixA.shootEndMonth = "2027-01";
      var pMixB = App.Defaults.newProject("2027-01", "drama", sMix);
      pMixB.name = "개별작품";
      pMixB.status = "confirmed";
      pMixB.contractAmount = 800000000;
      pMixB.shootStartMonth = "2027-01";
      pMixB.shootEndMonth = "2027-01";
      pMixB.expenseRateMode = "custom";
      pMixB.expenseRate = 0.15;
      pMixB.expenseRateUserSet = true;
      sMix.projects = [pMixA, pMixB];
      sMix.revenueFees = [];
      var rMix = App.Engine.runSimulation(sMix);
      eq("건별 합산 진행비", rMix.kpis.projectExpense, 160000000 + 120000000);
      var cmpMix = App.Engine.runScenarioComparison(sMix, rMix);
      eq("1인 기획사 비교에도 같은 진행비", cmpMix.scenarios.soloAgency.projectExpense, 280000000);
      eq("전속 비교에도 같은 진행비", cmpMix.scenarios.exclusiveContract.projectExpense, 280000000);

      if (App.Render && App.Render.renderView) {
        var htmlRate = App.Render.renderView("simulation", empty(), App.Engine.runSimulation(empty()), { simTab: "fees" });
        assert("수수료 탭에 기본 비용률 없음", htmlRate.indexOf("수익 연동 기본 비용률") < 0);
        var htmlBasic = App.Render.renderView("simulation", empty(), App.Engine.runSimulation(empty()), { simTab: "basics" });
        assert("기본 설정에 기본 비용률 없음", htmlBasic.indexOf("수익 연동 기본 비용률") < 0);
        assert("기본 설정에 진행비 기본률 없음", htmlBasic.indexOf("진행비 기본률") < 0);
        pDef.expenseRateMode = "default";
        var sUiXp = empty();
        sUiXp.projects = [pDef];
        var htmlRev = App.Render.renderView("revenue", sUiXp, App.Engine.runSimulation(sUiXp), { workItemOpen: {} });
        assert("매출 계획에 진행비·배율 버튼", htmlRev.indexOf("진행비·배율") >= 0 &&
          htmlRev.indexOf("open-revenue-rate-help") >= 0);
        assert("매출 계획 버튼에 현재 값", htmlRev.indexOf("작품 20%") >= 0 && htmlRev.indexOf("영업 10%") >= 0 &&
          htmlRev.indexOf("시딩 1.5배") >= 0 && htmlRev.indexOf("광고 3배") >= 0);
        assert("매출 계획 기본률 입력은 모달", htmlRev.indexOf("settings.revenueExpenseRates.work") < 0 &&
          htmlRev.indexOf("settings.revenueExpenseRates.sales") < 0);
        assert("매출 계획 배율 입력은 모달", htmlRev.indexOf("settings.revenueExpenseRates.appearanceLight") < 0 &&
          htmlRev.indexOf("settings.revenueExpenseRates.appearanceHeavy") < 0);
        assert("매출 계획 상시 설명문 제거", htmlRev.indexOf("계약금 %가 아니라") < 0);
        assert("안내 모달은 기본 닫힘", htmlRev.indexOf('id="rev-rate-help-title"') < 0);
        var htmlRevHelp = App.Render.renderView("revenue", sUiXp, App.Engine.runSimulation(sUiXp), { workItemOpen: {}, revenueRateHelpOpen: true });
        assert("안내 모달 열림", htmlRevHelp.indexOf('id="rev-rate-help-title"') >= 0);
        assert("모달에 진행비 기본률", htmlRevHelp.indexOf("진행비 기본률") >= 0);
        assert("모달에 헤메·식대 배율", htmlRevHelp.indexOf("헤메·식대 배율") >= 0);
        assert("모달에 작품 기본률 경로", htmlRevHelp.indexOf("settings.revenueExpenseRates.work") >= 0);
        assert("모달에 영업 기본률 경로", htmlRevHelp.indexOf("settings.revenueExpenseRates.sales") >= 0);
        assert("모달에 헤메 경량 배율 경로", htmlRevHelp.indexOf("settings.revenueExpenseRates.appearanceLight") >= 0);
        assert("모달에 헤메 중량 배율 경로", htmlRevHelp.indexOf("settings.revenueExpenseRates.appearanceHeavy") >= 0);
        assert("안내 모달에 작품 비율", htmlRevHelp.indexOf("20%") >= 0);
        assert("안내 모달에 영업 비율", htmlRevHelp.indexOf("10%") >= 0);
        assert("안내 모달에 경량 배율", htmlRevHelp.indexOf("1.5배") >= 0);
        assert("안내 모달에 중량 배율", htmlRevHelp.indexOf("3배") >= 0);
        assert("compact 진행비 표시", htmlRev.indexOf("20% ·") >= 0);
        assert("compact에 기본/개별 라벨 없음", htmlRev.indexOf(">기본<") < 0 && htmlRev.indexOf(">개별<") < 0);
        assert("우측 진행비 개별 소계 숨김", htmlRev.indexOf("작품 진행비") < 0 && htmlRev.indexOf("영업 진행비") < 0);
        assert("우측 TOTAL 정산", htmlRev.indexOf("TOTAL") >= 0 &&
          htmlRev.indexOf("총 매출") >= 0 &&
          htmlRev.indexOf("총 진행비") >= 0 &&
          htmlRev.indexOf("진행비 차감 후 수익") >= 0);
        assert("우측 기본률 160M", htmlRev.indexOf("160,000,000원") >= 0);
        var sDetailCost = empty();
        var pDetailCost = App.Defaults.newProject("2027-01", "drama", sDetailCost);
        pDetailCost.name = "하렘의 남자들";
        pDetailCost.status = "confirmed";
        pDetailCost.contractAmount = 800000000;
        pDetailCost.shootStartMonth = "2027-01";
        pDetailCost.shootEndMonth = "2027-01";
        pDetailCost.expenseRateMode = "custom";
        pDetailCost.expenseRate = 0.2;
        pDetailCost.directExpenses = [{ id: "manual-dx", name: "추가 현장비", amount: 10000000, month: "2027-01", include: true }];
        sDetailCost.projects = [pDetailCost];
        var rDetailCost = App.Engine.runSimulation(sDetailCost);
        eq("프로젝트 요약 직접비=자동진행비+추가직접비", rDetailCost.projectSummaries[0].directExpenses, 170000000);
        eq("프로젝트 요약 기여이익", rDetailCost.projectSummaries[0].contribution, 630000000);
        var openDetail = { workItemOpen: {} };
        openDetail.workItemOpen[pDetailCost.id] = true;
        var htmlDetailCost = App.Render.renderView("revenue", sDetailCost, rDetailCost, openDetail);
        assert("상세 직접비 요약은 진행비 포함", htmlDetailCost.indexOf("진행비+직접비") >= 0 &&
          htmlDetailCost.indexOf("170,000,000원") >= 0 &&
          htmlDetailCost.indexOf("630,000,000원") >= 0);
        assert("수동 표는 추가 직접비로 표시", htmlDetailCost.indexOf("추가 직접비 합계") >= 0);
        var htmlSeedRev = App.Render.renderView("revenue", App.Sample.load(), App.Engine.runSimulation(App.Sample.load()), {});
        assert("시드 compact 하렘", htmlSeedRev.indexOf("하렘의 남자들") >= 0);
        assert("시드 compact 영업 헤메·식대", htmlSeedRev.indexOf("헤메·식대 ×3 ·") >= 0);
        assert("시드 compact에도 기본 라벨 없음", htmlSeedRev.indexOf(">기본<") < 0);
        var sRevSummary = empty();
        var pRevWork = App.Defaults.newProject("2027-01", "drama", sRevSummary);
        pRevWork.name = "작품 요약";
        pRevWork.status = "confirmed";
        pRevWork.episodes = 16;
        pRevWork.contractAmount = 1600000000;
        var pRevSales = App.Defaults.newProject("2027-01", "ad", sRevSummary);
        pRevSales.name = "영업 요약";
        pRevSales.status = "confirmed";
        pRevSales.contractAmount = 655000000;
        sRevSummary.projects = [pRevWork, pRevSales];
        var htmlRevSummary = App.Render.renderView("revenue", sRevSummary, App.Engine.runSimulation(sRevSummary), {});
        assert("회차는 건명과 한 줄", htmlRevSummary.indexOf(
          '<span class="work-title">작품 요약</span><span class="work-name-meta">16회</span>'
        ) >= 0);
        assert("우측 예시 작품/영업 소계", htmlRevSummary.indexOf("1,600,000,000원") >= 0 &&
          htmlRevSummary.indexOf("655,000,000원") >= 0);
        assert("우측 작품·영업 소계 폰트 동일", htmlRevSummary.indexOf('reg-subtotal is-hero"><span>작품 소계') >= 0 &&
          htmlRevSummary.indexOf('reg-subtotal is-hero"><span>영업 소계') >= 0);
        assert("왼쪽 소계에도 상위구분 배지",
          htmlRevSummary.indexOf('work-grid rev-sub') >= 0 &&
          htmlRevSummary.indexOf('cat-badge-work cat-badge-family">작품</span></span><span></span><span>작품 소계') >= 0 &&
          htmlRevSummary.indexOf('cat-badge-sales cat-badge-family">영업</span></span><span></span><span>영업 소계') >= 0);
        assert("우측 예시 총 진행비", htmlRevSummary.indexOf("총 진행비") >= 0 &&
          htmlRevSummary.indexOf("322,100,000원") >= 0);
        assert("우측 예시 진행비 차감 후 수익", htmlRevSummary.indexOf("진행비 차감 후 수익") >= 0 &&
          htmlRevSummary.indexOf("1,932,900,000원") >= 0);
        pDef.expenseRateMode = "custom";
        pDef.expenseRate = 0.15;
        var htmlCustom = App.Render.renderView("revenue", sUiXp, App.Engine.runSimulation(sUiXp), { workItemOpen: {} });
        assert("compact 개별 진행비도 라벨 없이 표시", htmlCustom.indexOf(">개별<") < 0 && htmlCustom.indexOf("15% ·") >= 0);
        assert("우측 소계는 건별 합산", htmlCustom.indexOf("120,000,000원") >= 0);
        var openUi = { workItemOpen: {} };
        openUi.workItemOpen[pDef.id] = true;
        var htmlOpen = App.Render.renderView("revenue", sUiXp, App.Engine.runSimulation(sUiXp), openUi);
        assert("상세 기본값 사용", htmlOpen.indexOf("기본값 사용") >= 0);
        assert("상세 영업 진행비 아님(작품)", htmlOpen.indexOf("프로젝트 진행비") >= 0);
        var pUiAd = App.Defaults.newProject("2027-01", "ad", sUiXp);
        pUiAd.name = "광고 UI";
        pUiAd.status = "confirmed";
        pUiAd.contractAmount = 300000000;
        pUiAd.shootStartMonth = "2027-01";
        pUiAd.shootEndMonth = "2027-01";
        sUiXp.projects.push(pUiAd);
        var openAd = { workItemOpen: {} };
        openAd.workItemOpen[pUiAd.id] = true;
        var htmlAdOpen = App.Render.renderView("revenue", sUiXp, App.Engine.runSimulation(sUiXp), openAd);
        assert("광고 상세 헤메·식대 자동", htmlAdOpen.indexOf("헤메·식대 자동") >= 0);
      }
    } catch (e) { fail("작품 진행비 예외", e.message || e); }

    try {
      var sPeriod = empty();
      sPeriod.profile.startMonth = "2026-11";
      sPeriod.profile.endMonth = "2027-12";
      sPeriod.profile.initialCash = 60000000;
      sPeriod.recurringExpenses = [
        { id: "rent-full", name: "임대료", amount: 500000, include: true, overrides: {} },
        {
          id: "adv-custom", name: "컨설팅비", amount: 1000000, include: true, overrides: {},
          periodMode: "custom", startMonth: "2027-01", endMonth: "2027-09"
        },
        {
          id: "ent-ov", name: "접대비", amount: 200000, include: true,
          overrides: { "2027-03": 700000, "2027-08": 0 }
        }
      ];
      sPeriod.employees = [
        { id: "ceo", name: "대표이사", role: "대표이사", monthlySalary: 15000000, include: true, insure: true, meal: false, severance: false },
        {
          id: "rm", name: "로드매니저", role: "로드매니저", monthlySalary: 2500000,
          periodMode: "custom", startMonth: "2027-01", endMonth: "2027-09",
          include: true, insure: true, meal: false, severance: false
        }
      ];
      sPeriod.startupExpenses = [{
        id: "lic", name: "등록면허세", actualAmount: 340000, estimatedAmount: 340000,
        include: true, month: "2026-11", qty: 1
      }];
      sPeriod.deposits = [{
        id: "dep", name: "사무실보증금", actualAmount: 45000000, estimatedAmount: 45000000,
        include: true, month: "2026-11", qty: 1
      }];
      var pIn = App.Defaults.newProject("2026-11", "drama");
      pIn.name = "하렘의 남자들";
      pIn.status = "confirmed";
      pIn.contractAmount = 800000000;
      pIn.payments = [
        Object.assign(App.Defaults.newPayment("2026-11"), { amount: 80000000, inputMode: "amount" }),
        Object.assign(App.Defaults.newPayment("2027-01"), { amount: 400000000, inputMode: "amount" }),
        Object.assign(App.Defaults.newPayment("2028-02"), { amount: 320000000, inputMode: "amount" })
      ];
      sPeriod.projects = [pIn];
      sPeriod.revenueFees = [];
      sPeriod.settings.revenueFeesUserCleared = true;
      sPeriod = App.Defaults.ensureState(sPeriod);

      var rPeriod = App.Engine.runSimulation(sPeriod);
      eq("기간 14개월", rPeriod.months.length, 14);
      eq("기간 첫월", rPeriod.months[0].month, "2026-11");
      eq("기간 끝월", rPeriod.months[13].month, "2027-12");
      eq("원장 월 수=시뮬레이션 월", rPeriod.ledger.months.length, 14);
      eq("원장 끝 열", rPeriod.ledger.months[13], "2027-12");

      eq("전체기간 임대료 11월", monthRow(rPeriod, "2026-11").recurring, 500000 + 200000);
      eq("전체기간 임대료 12월", monthRow(rPeriod, "2027-12").recurring, 500000 + 200000);
      var rentRow = ledgerItem(ledgerGroup(rPeriod, "opex-rent"), "임대료(2층)");
      assert("rent2f 자동 리네이밍 행 존재", !!rentRow);
      eq("임대료(2층) TOTAL 14개월", rentRow.total, -500000 * 14);

      eq("직접기간 컨설팅비 26-12 0", ledgerItem(ledgerGroup(rPeriod, "opex-sga"), "컨설팅비").values["2026-12"], 0);
      eq("직접기간 컨설팅비 27-01", ledgerItem(ledgerGroup(rPeriod, "opex-sga"), "컨설팅비").values["2027-01"], -1000000);
      eq("직접기간 컨설팅비 27-09", ledgerItem(ledgerGroup(rPeriod, "opex-sga"), "컨설팅비").values["2027-09"], -1000000);
      eq("직접기간 컨설팅비 27-10 0", ledgerItem(ledgerGroup(rPeriod, "opex-sga"), "컨설팅비").values["2027-10"], 0);
      eq("컨설팅비 TOTAL 9개월", ledgerItem(ledgerGroup(rPeriod, "opex-sga"), "컨설팅비").total, -1000000 * 9);

      var entRow = ledgerItem(ledgerGroup(rPeriod, "opex-sga"), "접대비");
      eq("Override 기본월", entRow.values["2026-11"], -200000);
      eq("Override 27-03", entRow.values["2027-03"], -700000);
      eq("Override 0원 제외", entRow.values["2027-08"], 0);

      eq("대표 전체기간 11월", ledgerItem(ledgerGroup(rPeriod, "payroll"), "대표자(배우)").values["2026-11"], -15000000);
      eq("대표 전체기간 12월", ledgerItem(ledgerGroup(rPeriod, "payroll"), "대표자(배우)").values["2027-12"], -15000000);
      eq("로드매니저 26-12 0", ledgerItem(ledgerGroup(rPeriod, "payroll"), "로드매니저").values["2026-12"], 0);
      eq("로드매니저 27-01", ledgerItem(ledgerGroup(rPeriod, "payroll"), "로드매니저").values["2027-01"], -2500000);
      eq("로드매니저 27-09", ledgerItem(ledgerGroup(rPeriod, "payroll"), "로드매니저").values["2027-09"], -2500000);
      eq("로드매니저 27-10 0", ledgerItem(ledgerGroup(rPeriod, "payroll"), "로드매니저").values["2027-10"], 0);

      assert("11월 보험 있음", monthRow(rPeriod, "2026-11").insurance > 0);
      assert("로드매니저 없는 달에도 대표 보험", monthRow(rPeriod, "2026-11").insurance > 0);
      var insJan = monthRow(rPeriod, "2027-01").insurance;
      var insNov = monthRow(rPeriod, "2026-11").insurance;
      assert("급여월 증가 시 보험 증가", insJan > insNov);

      eq("초기비용 11월 1회", monthRow(rPeriod, "2026-11").startupCost, 340000);
      eq("초기비용 12월 0", monthRow(rPeriod, "2026-12").startupCost, 0);
      eq("보증금 CF", monthRow(rPeriod, "2026-11").deposits, 45000000);
      eq("보증금 손익 제외", monthRow(rPeriod, "2026-11").pnlExpense, monthRow(rPeriod, "2026-11").payroll + monthRow(rPeriod, "2026-11").insurance + monthRow(rPeriod, "2026-11").recurring + 340000);

      eq("작품 26-11 입금", monthRow(rPeriod, "2026-11").inflow, 80000000);
      eq("작품 27-01 입금", monthRow(rPeriod, "2027-01").inflow, 400000000);
      eq("기간 밖 지급 제외", rPeriod.kpis.inflowInPeriod, 480000000);
      eq("기간 이후 입금 유지값", rPeriod.kpis.inflowAfterPeriod, 320000000);
      assert("2028-02 열 없음", rPeriod.ledger.months.indexOf("2028-02") < 0);

      var jsonKeep = App.Store.exportJson(sPeriod);
      assert("기간 밖 지급 데이터 유지", jsonKeep.indexOf("2028-02") >= 0);

      sPeriod.profile.endMonth = "2028-06";
      var rWide = App.Engine.runSimulation(sPeriod);
      eq("종료월 확장 20개월", rWide.months.length, 20);
      eq("확장 끝 열", rWide.ledger.months[19], "2028-06");
      eq("기간 밖 지급 재노출", monthRow(rWide, "2028-02").inflow, 320000000);
      eq("확장 후 기간입금", rWide.kpis.inflowInPeriod, 800000000);
      eq("전체기간 TOTAL 재계산", ledgerItem(ledgerGroup(rWide, "opex-rent"), "임대료(2층)").total, -500000 * 20);
      eq("직접기간은 확장 안 함", ledgerItem(ledgerGroup(rWide, "opex-sga"), "컨설팅비").total, -1000000 * 9);
      assert("기말/최저 재계산", rWide.kpis.endClosing !== rPeriod.kpis.endClosing);
      assert("확장 후 최저월 존재", !!rWide.kpis.minMonth);

      sPeriod.profile.endMonth = "2027-12";
      var rBack = App.Engine.runSimulation(sPeriod);
      eq("줄여도 데이터 유지", sPeriod.projects[0].payments[2].expectedMonth, "2028-02");
      eq("축소 후 다시 제외", rBack.kpis.inflowInPeriod, 480000000);
      eq("축소 후 기말 복원", rBack.kpis.endClosing, rPeriod.kpis.endClosing);

      var restored = App.Store.parseImport(App.Store.exportJson(sPeriod));
      eq("JSON 복원 기말", App.Engine.runSimulation(restored).kpis.endClosing, rPeriod.kpis.endClosing);
      eq("JSON 복원 최저", App.Engine.runSimulation(restored).kpis.minClosing, rPeriod.kpis.minClosing);
      assert("구 start/end는 직접지정", App.Month.usesCustomPeriod(restored.recurringExpenses[1]));
      assert("start/end 없으면 전체기간", !App.Month.usesCustomPeriod(restored.recurringExpenses[0]));

      var seedP = App.Sample.load();
      var seedBefore = App.Engine.runSimulation(seedP);
      eq("시드 회귀 기말", seedBefore.kpis.endClosing, 1204738995);
      eq("시드 회귀 최저", seedBefore.kpis.minClosing, 8576879);
      seedP.profile.endMonth = "2027-12";
      var seedExt = App.Engine.runSimulation(seedP);
      eq("시드 기존 운영비는 전체기간 유지", monthRow(seedExt, "2027-12").recurring, 8350000);
      eq("시드 기간 밖 데이터 삭제 안 함", seedP.recurringExpenses[0].endMonth == null || seedP.recurringExpenses[0].endMonth === "", true);

      if (App.Render && App.Render.renderView) {
        var htmlSim = App.Render.renderView("simulation", sPeriod, rPeriod, {});
        assert("기간 시작월 라벨", htmlSim.indexOf("시작월") >= 0);
        assert("기간 종료월 라벨", htmlSim.indexOf("종료월") >= 0);
        assert("기간 안내 문구", htmlSim.indexOf("모든 월 반복 항목은 별도 기간 예외가 없는 한 이 기간 전체에 적용됩니다.") >= 0);
        assert("총 14개월 표시", htmlSim.indexOf("14개월") >= 0);
        var htmlCost = App.Render.renderView("costs", sPeriod, rPeriod, { costTab: "opex", costSecOpen: { payroll: true, "recurring-sga": true }, costItemOpen: {} });
        assert("접힌 행 전체기간", htmlCost.indexOf("전체기간") >= 0);
        assert("접힌 행 직접기간", htmlCost.indexOf("2027-01~2027-09") >= 0);
        var htmlA = App.Render.renderView("analysis", sPeriod, rPeriod, { analysisTab: "monthly" });
        assert("분석 기본 2026 연도 헤더", htmlA.indexOf('data-year="2026"') >= 0);
        assert("분석 기본 2027 연도 헤더", htmlA.indexOf('data-year="2027"') >= 0);
        assert("분석 기본은 월 헤더 숨김", htmlA.indexOf(">11월<") < 0);
        assert("분석 28년 헤더 없음", htmlA.indexOf('data-year="2028"') < 0);
        var htmlAOpen = App.Render.renderView("analysis", sPeriod, rPeriod, {
          analysisTab: "monthly",
          ledgerYearOpen: { "2026": true, "2027": true }
        });
        assert("분석 펼치면 11월", htmlAOpen.indexOf(">11월<") >= 0);
        assert("분석 펼치면 12월", htmlAOpen.indexOf(">12월<") >= 0);
        var htmlWide = App.Render.renderView("analysis", sPeriod, rWide, { analysisTab: "monthly" });
        assert("확장 후 2028 연도 헤더", htmlWide.indexOf('data-year="2028"') >= 0);
        var htmlWideOpen = App.Render.renderView("analysis", sPeriod, rWide, {
          analysisTab: "monthly",
          ledgerYearOpen: { "2026": true, "2027": true, "2028": true }
        });
        assert("확장 후 28-02 열", htmlWideOpen.indexOf('data-month="2028-02"') >= 0);
        assert("확장 후 28-06 열", htmlWideOpen.indexOf('data-month="2028-06"') >= 0);
      }
    } catch (e) { fail("기간 공통 기준 예외", e.message || e); }

    try {
      function clearBudgetStorage() {
        Object.keys(localStorage._d || {}).forEach(function (k) {
          if (k.indexOf("solo-agency-budget:") === 0) delete localStorage._d[k];
        });
      }

      clearBudgetStorage();
      var legacyState = empty();
      legacyState.profile.actorName = "레거시배우";
      legacyState.profile.companyName = "레거시법인";
      localStorage.setItem(App.Store.KEY, JSON.stringify(legacyState));
      var migrated = App.Store.load();
      eq("구 단일키 마이그레이션 배우명", migrated.profile.actorName, "레거시배우");
      var idxAfterMigrate = App.Store.listBudgets();
      eq("마이그레이션 후 예산안 1개", idxAfterMigrate.length, 1);
      eq("마이그레이션 항목 id = meta.budgetId", idxAfterMigrate[0].id, migrated.meta.budgetId);
      eq("기존 KPI 불변(마이그레이션 전후)", App.Engine.runSimulation(migrated).kpis.endClosing,
        App.Engine.runSimulation(legacyState).kpis.endClosing);

      App.Store.save(migrated);
      eq("save 후에도 예산안 1개 유지 (중복 생성 안 됨)", App.Store.listBudgets().length, 1);

      var id2 = App.Store.createBudget("두번째 예산안");
      assert("createBudget id 반환", !!id2);
      eq("생성 후 목록 2개", App.Store.listBudgets().length, 2);
      var entry2 = App.Store.listBudgets().filter(function (b) { return b.id === id2; })[0];
      eq("새 예산안 이름", entry2.name, "두번째 예산안");
      eq("createBudget은 active를 안 바꿈", App.Store.getActiveBudgetId(), migrated.meta.budgetId);

      var switched = App.Store.switchActiveBudget(id2);
      assert("전환된 state 존재", !!switched);
      eq("전환 후 active 변경", App.Store.getActiveBudgetId(), id2);
      switched.profile.actorName = "두번째배우";
      App.Store.save(switched);
      var backTo1 = App.Store.switchActiveBudget(migrated.meta.budgetId);
      eq("예산안 전환은 서로 독립적 (1번 배우명 불변)", backTo1.profile.actorName, "레거시배우");
      var backTo2 = App.Store.switchActiveBudget(id2);
      eq("2번 예산안 수정 유지", backTo2.profile.actorName, "두번째배우");

      var id3 = App.Store.duplicateBudget(id2, "복제본");
      assert("duplicateBudget id 반환", !!id3);
      eq("복제 후 목록 3개", App.Store.listBudgets().length, 3);
      var dup = App.Store.switchActiveBudget(id3);
      eq("복제본은 원본과 같은 내용으로 시작", dup.profile.actorName, "두번째배우");
      dup.profile.actorName = "복제본배우";
      App.Store.save(dup);
      var origAfterDupEdit = App.Store.switchActiveBudget(id2);
      eq("복제본 수정이 원본에 영향 없음", origAfterDupEdit.profile.actorName, "두번째배우");
      assert("복제본 id는 원본과 다름", id3 !== id2);

      App.Store.renameBudget(id3, "이름바뀜");
      eq("이름 변경 반영", App.Store.listBudgets().filter(function (b) { return b.id === id3; })[0].name, "이름바뀜");

      var okDelete = App.Store.deleteBudget(id3);
      assert("삭제 성공", okDelete);
      eq("삭제 후 목록 2개", App.Store.listBudgets().length, 2);
      assert("삭제된 예산안 목록에서 제거됨", !App.Store.listBudgets().some(function (b) { return b.id === id3; }));

      App.Store.deleteBudget(id2);
      eq("마지막 직전까지 삭제 가능, 1개 남음", App.Store.listBudgets().length, 1);
      var lastId = App.Store.listBudgets()[0].id;
      var blockedDelete = App.Store.deleteBudget(lastId);
      eq("마지막 예산안 삭제는 거부", blockedDelete, false);
      eq("마지막 예산안 삭제 거부 후에도 1개 유지", App.Store.listBudgets().length, 1);

      var quotaState = App.Store.load();
      var realSetItem = localStorage.setItem;
      localStorage.setItem = function () { throw new Error("QuotaExceededError"); };
      eq("localStorage 실패시 save는 false", App.Store.save(quotaState), false);
      eq("localStorage 실패시 createBudget은 null", App.Store.createBudget("실패해야함"), null);
      localStorage.setItem = realSetItem;
      assert("quota 복구 후 정상 저장", App.Store.save(quotaState));

      var jsonRoundTrip = App.Store.exportJson(App.Store.load());
      var reimported = App.Store.parseImport(jsonRoundTrip);
      assert("JSON export/import는 예산안 구조와 무관하게 동작", !!reimported.profile);

      clearBudgetStorage();
      var freshLoad = App.Store.load();
      assert("아무 키도 없을 때 예외 없이 로드", !!freshLoad && !freshLoad.error);
      eq("최초 실행시 예산안 1개 자동 생성", App.Store.listBudgets().length, 1);

      var beforeResetMeta = App.Store.load().meta.budgetId;
      var beforeResetId = App.Store.getActiveBudgetId();
      eq("초기화 전 활성 id 확인", beforeResetMeta, beforeResetId);
    } catch (e) { fail("다중 예산안 저장 예외", e.message || e); }

    try {
      function clearBudgetStorage2() {
        Object.keys(localStorage._d || {}).forEach(function (k) {
          if (k.indexOf("solo-agency-budget:") === 0) delete localStorage._d[k];
        });
      }
      function withIndexWriteFailing(fn) {
        var real = localStorage.setItem;
        localStorage.setItem = function (key, value) {
          if (key === App.Store.INDEX_KEY) throw new Error("QuotaExceededError");
          return real.call(localStorage, key, value);
        };
        try { fn(); } finally { localStorage.setItem = real; }
      }

      clearBudgetStorage2();
      var seedA = App.Store.load();
      var idA = App.Store.getActiveBudgetId();
      var idxSnapshotBefore = JSON.stringify(JSON.parse(localStorage.getItem(App.Store.INDEX_KEY)));

      withIndexWriteFailing(function () {
        var failedId = App.Store.createBudget("실패할예산안");
        eq("index 쓰기 실패시 createBudget은 null", failedId, null);
      });
      eq("createBudget 롤백 후 목록 그대로 1개", App.Store.listBudgets().length, 1);
      eq("createBudget 롤백 후 index 내용 불변", JSON.stringify(JSON.parse(localStorage.getItem(App.Store.INDEX_KEY))), idxSnapshotBefore);

      withIndexWriteFailing(function () {
        var renameOk = App.Store.renameBudget(idA, "바뀔뻔한이름");
        eq("index 쓰기 실패시 renameBudget은 false", renameOk, false);
      });
      eq("renameBudget 실패 후 이름 불변", App.Store.listBudgets()[0].name, seedA.meta.title);

      var idB = App.Store.createBudget("두번째");
      withIndexWriteFailing(function () {
        var switchResult = App.Store.switchActiveBudget(idB);
        eq("index 쓰기 실패시 switchActiveBudget은 null", switchResult, null);
      });
      eq("switchActiveBudget 실패 후 active 불변", App.Store.getActiveBudgetId(), idA);

      withIndexWriteFailing(function () {
        var deleteOk = App.Store.deleteBudget(idB);
        eq("index 쓰기 실패시 deleteBudget은 false", deleteOk, false);
      });
      eq("deleteBudget 실패 후 목록 그대로 2개", App.Store.listBudgets().length, 2);
      assert("deleteBudget 실패해도 item은 여전히 읽힘", !!App.Store.switchActiveBudget(idB));
      App.Store.switchActiveBudget(idA);

      clearBudgetStorage2();
    } catch (e) { fail("저장 실패 롤백 예외", e.message || e); }

    try {
      var sm = empty();
      sm.profile.startMonth = "2027-01";
      sm.profile.endMonth = "2027-01";
      sm.settings.meal.dailyRate = 10000;
      sm.mealExtraHeadcount = 2;
      sm.employees = [
        { id: "m1", name: "대표", monthlySalary: 1000000, include: true, meal: true },
        { id: "m2", name: "본부장", monthlySalary: 1000000, include: true, meal: true },
        { id: "m3", name: "실무", monthlySalary: 1000000, include: true, meal: true }
      ];
      var rmA = App.Engine.runSimulation(sm);
      eq("식대A 전원ON+추가2 = 5명", monthRow(rmA, "2027-01").mealHeadcount, 5);

      sm.employees[0].meal = false;
      var rmB = App.Engine.runSimulation(sm);
      eq("식대B 1명OFF = 자동2+추가2=4명", monthRow(rmB, "2027-01").mealHeadcount, 4);

      sm.employees = sm.employees.filter(function (e) { return e.id !== "m3"; });
      var rmC = App.Engine.runSimulation(sm);
      eq("식대C 직원삭제 즉시 반영 = 3명", monthRow(rmC, "2027-01").mealHeadcount, 3);
    } catch (e) { fail("식대 자동인원 A/B/C 예외", e.message || e); }

    try {
      var smD = empty();
      smD.profile.startMonth = "2027-01";
      smD.profile.endMonth = "2027-03";
      smD.settings.meal.dailyRate = 10000;
      smD.mealExtraHeadcount = 0;
      smD.employees = [
        { id: "d1", name: "대표", monthlySalary: 1000000, include: true, meal: true },
        { id: "d2", name: "신규", monthlySalary: 1000000, include: true, meal: true, periodMode: "custom", startMonth: "2027-03" }
      ];
      var rmD = App.Engine.runSimulation(smD);
      eq("식대D 시작월 이전 제외 1월 = 1명", monthRow(rmD, "2027-01").mealHeadcount, 1);
      eq("식대D 시작월 이전 제외 2월 = 1명", monthRow(rmD, "2027-02").mealHeadcount, 1);
      eq("식대D 시작월 도래 3월 = 2명", monthRow(rmD, "2027-03").mealHeadcount, 2);
    } catch (e) { fail("식대 자동인원 D(미래 시작월) 예외", e.message || e); }

    try {
      var smE = empty();
      smE.profile.startMonth = "2027-01";
      smE.profile.endMonth = "2027-03";
      smE.settings.meal.dailyRate = 10000;
      smE.mealExtraHeadcount = 0;
      smE.employees = [
        { id: "e1", name: "대표", monthlySalary: 1000000, include: true, meal: true },
        { id: "e2", name: "퇴사예정", monthlySalary: 1000000, include: true, meal: true, periodMode: "custom", endMonth: "2027-01" }
      ];
      var rmE = App.Engine.runSimulation(smE);
      eq("식대E 종료월 포함 1월 = 2명", monthRow(rmE, "2027-01").mealHeadcount, 2);
      eq("식대E 종료월 이후 2월 = 1명", monthRow(rmE, "2027-02").mealHeadcount, 1);
      eq("식대E 종료월 이후 3월 = 1명", monthRow(rmE, "2027-03").mealHeadcount, 1);
    } catch (e) { fail("식대 자동인원 E(과거 종료월) 예외", e.message || e); }

    try {
      var smF = empty();
      smF.profile.startMonth = "2027-01";
      smF.profile.endMonth = "2027-01";
      smF.settings.meal.dailyRate = 10000;
      smF.mealExtraHeadcount = 0;
      smF.employees = [{ id: "f1", name: "대표", monthlySalary: 1000000, include: true, meal: true }];
      var rmF1 = App.Engine.runSimulation(smF);
      var days1 = monthRow(rmF1, "2027-01").mealBreakdown.workingDays;
      eq("식대F 변경 전 금액", monthRow(rmF1, "2027-01").mealBaseAmount, 10000 * 1 * days1);
      smF.settings.meal.dailyRate = 20000;
      var rmF2 = App.Engine.runSimulation(smF);
      var days2 = monthRow(rmF2, "2027-01").mealBreakdown.workingDays;
      eq("식대F 단가 변경 즉시 재계산", monthRow(rmF2, "2027-01").mealBaseAmount, 20000 * 1 * days2);
    } catch (e) { fail("식대 자동인원 F(단가 변경) 예외", e.message || e); }

    try {
      var smX = empty();
      smX.profile.startMonth = "2027-01";
      smX.profile.endMonth = "2027-01";
      smX.settings.meal.dailyRate = 10000;
      smX.mealExtraHeadcount = 0;
      smX.employees = [{ id: "x1", name: "대표", monthlySalary: 1000000, include: true, meal: true }];
      var rmX1 = App.Engine.runSimulation(smX);
      var baseX = monthRow(rmX1, "2027-01").mealBaseAmount;
      eq("식대여유 기본 50%", monthRow(rmX1, "2027-01").mealExtraAmount, App.Money.roundWon(baseX * 0.5));
      eq("식대여유 후 복리후생 x2", monthRow(rmX1, "2027-01").meal, App.Money.roundWon(baseX * 1.5 * 2));
      smX.settings.meal.extraRate = 0;
      var rmX0 = App.Engine.runSimulation(smX);
      eq("식대여유 0%면 가산 없음", monthRow(rmX0, "2027-01").mealExtraAmount, 0);
      eq("식대여유 0%면 기존 x2", monthRow(rmX0, "2027-01").meal, App.Money.roundWon(baseX * 2));
      var htmlX = App.Render.renderView("costs", smX, rmX1, { costTab: "opex", costSecOpen: { welfare: true } });
      assert("비용 복리후생에 회식·야근", htmlX.indexOf("회식·야근 여유") >= 0);
      assert("복리후생 4열 입력", htmlX.indexOf("meal-fields") >= 0);
      assert("복리후생 계산내역 전체폭", htmlX.indexOf("cost-calc") >= 0);
    } catch (e) { fail("식대 회식야근 여유 예외", e.message || e); }

    try {
      var smUi = empty();
      smUi.profile.startMonth = "2027-01";
      smUi.profile.endMonth = "2027-01";
      smUi.mealExtraHeadcount = 2;
      smUi.employees = [
        { id: "u1", name: "대표", monthlySalary: 1000000, include: true, meal: true },
        { id: "u2", name: "미래직원", monthlySalary: 1000000, include: true, meal: true, periodMode: "custom", startMonth: "2027-06" }
      ];
      var rmUi = App.Engine.runSimulation(smUi);
      var htmlUi = App.Render.renderView("simulation", smUi, rmUi, { simTab: "org" });
      var headUi = monthRow(rmUi, "2027-01").mealHeadcount;
      assert("식대UI 대상직원=합계-추가(월기준 정합)", htmlUi.indexOf("대상 직원 " + (headUi - 2) + "명") >= 0);
      assert("식대UI 합계=엔진값", htmlUi.indexOf("합계 " + headUi + "명") >= 0);
    } catch (e) { fail("식대 자동인원 UI 정합 예외", e.message || e); }

    try {
      var st = empty();
      delete st.settings.scenarios;
      delete st.settings.scenarioComparison;
      st = App.Defaults.ensureState(st);
      eq("종소세 기본 모드는 auto (레거시/미설정 상태)", st.settings.scenarios.soloAgency.personalTax.mode, "auto");
      eq("종소세 기본 모드는 auto (전속 시나리오도 동일)", st.settings.scenarios.exclusiveContract.personalTax.mode, "auto");
    } catch (e) { fail("종소세 기본모드 예외", e.message || e); }

    try {
      var sTaxA = empty();
      noOwnerDividend(sTaxA);
      sTaxA.profile.startMonth = "2027-01";
      sTaxA.profile.endMonth = "2027-01";
      var pTaxA = App.Defaults.newProject("2027-01", "drama");
      pTaxA.status = "confirmed";
      pTaxA.contractAmount = 1000000000;
      pTaxA.payments = [Object.assign(App.Defaults.newPayment("2027-01"), { amount: 1000000000, inputMode: "amount" })];
      sTaxA.projects = [pTaxA];
      sTaxA.employees = [{
        id: "ceo-tax", name: "대표", role: "대표이사", monthlySalary: 300000000,
        include: true, insure: false, meal: false, severance: false
      }];
      var soloRunA = App.Engine.runSimulation(sTaxA);
      var cmpA = App.Engine.runScenarioComparison(sTaxA, soloRunA);
      assert("TEST A 귀속소득 > 0", cmpA.scenarios.soloAgency.actorGrossIncome > 0);
      assert("TEST A 종합소득세 자동 계산됨(0 아님)", cmpA.scenarios.soloAgency.incomeTax > 0);
      assert("TEST A 지방소득세 자동 계산됨(0 아님)", cmpA.scenarios.soloAgency.localIncomeTax > 0);
      var expectDetailA = App.Engine.calculatePersonalTaxDetail(
        cmpA.scenarios.soloAgency.actorGrossIncome,
        sTaxA.settings.scenarios.soloAgency.personalTax
      );
      eq("TEST A 세후실수령=독립계산과 동일(중복계산/하드코딩 없음)", cmpA.scenarios.soloAgency.actorNetIncome, expectDetailA.afterTaxIncome);
      assert("TEST A 세후실수령 < 귀속소득", cmpA.scenarios.soloAgency.actorNetIncome < cmpA.scenarios.soloAgency.actorGrossIncome);

      sTaxA.settings.scenarios.exclusiveContract.actorShareRate = 0.5;
      sTaxA.settings.scenarios.exclusiveContract.companyShareRate = 0.5;
      var cmpB = App.Engine.runScenarioComparison(sTaxA, soloRunA);
      assert("TEST B 배분율 변경시 귀속소득도 변경", cmpB.scenarios.exclusiveContract.actorGrossIncome !== cmpA.scenarios.exclusiveContract.actorGrossIncome);
      assert("TEST B 배분율 변경시 세금도 자동 재계산", cmpB.scenarios.exclusiveContract.incomeTax !== cmpA.scenarios.exclusiveContract.incomeTax);

      assert("TEST C 시나리오별 귀속소득 서로 다름", cmpA.scenarios.soloAgency.actorGrossIncome !== cmpA.scenarios.exclusiveContract.actorGrossIncome);
      assert("TEST C 시나리오별 세금 독립 계산", cmpA.scenarios.soloAgency.incomeTax !== cmpA.scenarios.exclusiveContract.incomeTax);

      var linkedTax = App.Engine.calculateScenarioPersonalTaxDetail(
        cmpA.scenarios.soloAgency.actorGrossIncome,
        sTaxA.settings.scenarios.soloAgency.personalTax
      );
      eq("TEST D 자동연결 ON이면 임의 attributedIncome 무시하고 연결값 사용", linkedTax.attributedIncome, cmpA.scenarios.soloAgency.actorGrossIncome);
      sTaxA.settings.scenarios.soloAgency.personalTax.attributedIncome = 1;
      var linkedTax2 = App.Engine.calculateScenarioPersonalTaxDetail(
        cmpA.scenarios.soloAgency.actorGrossIncome,
        sTaxA.settings.scenarios.soloAgency.personalTax
      );
      eq("TEST D 자동연결 ON이면 수동 attributedIncome 값은 무시됨", linkedTax2.attributedIncome, cmpA.scenarios.soloAgency.actorGrossIncome);

      var reimported = App.Store.parseImport(App.Store.exportJson(sTaxA));
      var cmpReimport = App.Engine.runScenarioComparison(reimported, App.Engine.runSimulation(reimported));
      eq("TEST E JSON 재저장/불러오기 후에도 자동 세액 유지", cmpReimport.scenarios.soloAgency.incomeTax, cmpA.scenarios.soloAgency.incomeTax);
    } catch (e) { fail("종소세-시나리오 연동 A~E 예외", e.message || e); }

    try {
      var legacyVeh = empty();
      legacyVeh.profile.startMonth = "2027-01";
      legacyVeh.profile.endMonth = "2027-01";
      legacyVeh.settings.supportPolicies = [
        { id: "sp-actor-meal", name: "배우 식대", group: "daily", calcMode: "monthlyFixed",
          unitAmount: 300000, quantity: 1, include: true, costClass: "sga" },
        { id: "sp-actor-fuel", name: "배우 주유/이동", group: "daily", calcMode: "monthlyFixed",
          unitAmount: 500000, quantity: 1, include: true, costClass: "sga",
          soloPayer: "company", exclusivePayer: "company", soloCompanyShareRate: 1, exclusiveCompanyShareRate: 1 }
      ];
      var migratedVeh = App.Defaults.ensureState(JSON.parse(JSON.stringify(legacyVeh)));
      var vehList = migratedVeh.settings.supportPolicies;
      assert("레거시 배우 식대는 완전히 제거", !vehList.some(function (p) { return p.id === "sp-actor-meal"; }));
      assert("레거시 배우 주유/이동은 완전히 제거(이름 무관)", !vehList.some(function (p) { return p.id === "sp-actor-fuel"; }));
      assert("차량 렌트료 신규 추가", vehList.some(function (p) { return p.id === "sp-vehicle-rent" && p.name === "차량 렌트료"; }));
      assert("차량 보험료 신규 추가", vehList.some(function (p) { return p.id === "sp-vehicle-insurance" && p.name === "차량 보험료"; }));
      assert("통행료/주차비는 더 이상 추가 안 함", !vehList.some(function (p) { return p.id === "sp-toll-parking"; }));
      assert("배우 이동비는 더 이상 추가 안 함", !vehList.some(function (p) { return p.id === "sp-actor-transport"; }));
      eq("신규 항목 기본 금액 0", vehList.filter(function (p) { return p.id === "sp-vehicle-rent"; })[0].unitAmount, 0);
      eq("신규 항목도 기본 포함 ON", vehList.filter(function (p) { return p.id === "sp-vehicle-rent"; })[0].include, true);

      var reMigrated = App.Defaults.ensureState(JSON.parse(JSON.stringify(migratedVeh)));
      eq("재정규화해도 항목 수 불변(중복 생성/재생성 없음)", reMigrated.settings.supportPolicies.length, vehList.length);
      assert("재정규화해도 배우 식대/주유비 재생성 안 됨", !reMigrated.settings.supportPolicies.some(function (p) {
        return p.id === "sp-actor-meal" || p.id === "sp-actor-fuel";
      }));

      var runLegacyFuel = App.Engine.runSimulation(migratedVeh);
      eq("제거된 배우식대/주유비는 판관비 계산에 없음", runLegacyFuel.kpis.supportSga, 0);

      var seedOpex = App.Sample.load();
      seedOpex.vehicles[0].monthlyRent = 2000000;
      seedOpex.recurringExpenses.push({
        id: "opex-veh-dup", name: "차량렌트_테스트", category: "vehicle", type: "recurring",
        amount: 1500000, startMonth: "2026-12", endMonth: "2027-09", include: true, overrides: {}, note: ""
      });
      var overlap = App.Defaults.overlappingVehicleOpex(seedOpex);
      assert("운영비 차량렌트 중복 감지", overlap.some(function (item) { return /차량렌트/.test(item.name); }));
      var htmlDup = App.Render.renderView("simulation", seedOpex, App.Engine.runSimulation(seedOpex), { simTab: "support" });
      assert("중복 경고 문구", htmlDup.indexOf("두 번 들어갑니다") >= 0);
    } catch (e) { fail("차량 지원항목 마이그레이션 예외", e.message || e); }

    try {
      var sVeh = empty();
      sVeh.profile.startMonth = "2027-01";
      sVeh.profile.endMonth = "2027-01";
      sVeh.vehicles = [Object.assign(App.Defaults.newVehicle("2027-01"), { name: "하이리무진", monthlyRent: 2000000, monthlyInsurance: 0 })];
      sVeh = App.Defaults.ensureState(sVeh);
      var vRun = App.Engine.runSimulation(sVeh);
      var rentRow = vRun.months[0].supportItems.filter(function (it) { return it.id === "veh-rent-" + sVeh.vehicles[0].id; })[0];
      eq("차량 렌트료 반영", rentRow.amount, 2000000);

      var sExVal = empty();
      sExVal.profile.startMonth = "2027-01";
      sExVal.profile.endMonth = "2027-01";
      var pExVal = App.Defaults.newProject("2027-01", "drama");
      pExVal.status = "confirmed";
      pExVal.contractAmount = 1000000000;
      pExVal.payments = [Object.assign(App.Defaults.newPayment("2027-01"), { amount: 1000000000, inputMode: "amount" })];
      sExVal.projects = [pExVal];
      var veh2 = Object.assign(App.Defaults.newVehicle("2027-01"), { name: "하이리무진", monthlyRent: 0, monthlyInsurance: 0 });
      sExVal.vehicles = [veh2];
      sExVal = App.Defaults.ensureState(sExVal);
      var withoutVehicleRun = App.Engine.runSimulation(sExVal);
      var withoutVehicle = App.Engine.runScenarioComparison(sExVal, withoutVehicleRun);
      eq("차량렌트 0원이면 지원가치 0", withoutVehicle.scenarios.exclusiveContract.companySupportValue, 0);

      sExVal.vehicles[0].monthlyRent = 2000000;
      var withVehicleRun = App.Engine.runSimulation(sExVal);
      var withVehicle = App.Engine.runScenarioComparison(sExVal, withVehicleRun);
      assert("1인기획사 판관비에 차량렌트 반영되어 CF 감소", withVehicleRun.kpis.endClosing < withoutVehicleRun.kpis.endClosing);
      eq("1인기획사 판관비 지원비 = 렌트료", withVehicleRun.kpis.supportSga, 2000000);
      eq("회사부담 렌트는 현금지급 실수령 불변", withVehicle.scenarios.exclusiveContract.actorNetIncome,
        withoutVehicle.scenarios.exclusiveContract.actorNetIncome);
      eq("공통 배우차량은 전속 경제가치에 가산하지 않음",
        withVehicle.scenarios.exclusiveContract.controlledEconomicValue,
        withoutVehicle.scenarios.exclusiveContract.controlledEconomicValue);
      eq("전속 경제가치 = 실수령 + 고유혜택",
        withVehicle.scenarios.exclusiveContract.controlledEconomicValue,
        withVehicle.scenarios.exclusiveContract.actorNetIncome +
          (withVehicle.scenarios.exclusiveContract.uniqueBenefitValue || 0));
      eq("배우전용 차량 렌트는 배우 지원가치(분류)", withVehicle.scenarios.exclusiveContract.actorSupportValue, 2000000);
      eq("기존회사 회사지원가치 = 렌트료", withVehicle.scenarios.exclusiveContract.companySupportValue, 2000000);
      var htmlVehCmp = App.Render.renderView("analysis", sExVal, withVehicleRun, { analysisTab: "scenarios" });
      assert("회사 패널에 차량 렌트", htmlVehCmp.indexOf("하이리무진") >= 0);
      assert("회사 패널에 남는 금액", htmlVehCmp.indexOf("회사 최종 잔여") >= 0);
      assert("분석에서 지원가치 상세 합계 없음", htmlVehCmp.indexOf("회사 지원가치 합계") < 0);

      var second = Object.assign(App.Defaults.newVehicle("2027-01"), { name: "스텝 차량", monthlyRent: 800000, monthlyInsurance: 0 });
      sExVal.vehicles.push(second);
      var twoVehRun = App.Engine.runScenarioComparison(sExVal, App.Engine.runSimulation(sExVal));
      eq("차량 2대 합산 지원가치", twoVehRun.scenarios.exclusiveContract.companySupportValue, 2800000);
      sExVal.vehicles.pop();
    } catch (e) { fail("차량 지원 시나리오 반영 예외", e.message || e); }

    try {
      var sBen = empty();
      sBen.profile.startMonth = "2027-01";
      sBen.profile.endMonth = "2027-01";
      sBen.recurringExpenses = [{
        id: "card-ceo-ben", name: "법인카드(대표)", amount: 3000000, include: true, overrides: {}
      }];
      sBen.vehicles = [
        Object.assign(App.Defaults.newVehicle("2027-01"), { name: "하이리무진", kind: "actor", monthlyRent: 2000000, monthlyInsurance: 0 }),
        Object.assign(App.Defaults.newVehicle("2027-01"), { name: "스텝 차량", kind: "staff", monthlyRent: 800000, monthlyInsurance: 0 })
      ];
      sBen = App.Defaults.ensureState(sBen);
      var ptBen = (sBen.settings.supportPolicies || []).filter(function (p) { return p.id === "sp-pt"; })[0];
      assert("PT 정책 존재(배우지원 분류)", !!ptBen);
      ptBen.include = true;
      ptBen.unitAmount = 1000000;
      var rBen = App.Engine.runSimulation(sBen);
      var cBen = App.Engine.runScenarioComparison(sBen, rBen);
      var soloB = cBen.scenarios.soloAgency;
      var exB = cBen.scenarios.exclusiveContract;
      eq("배우 지원가치=PT+배우차량", soloB.actorSupportValue, 3000000);
      eq("양쪽 배우 지원가치 동일기준", soloB.actorSupportValue, exB.actorSupportValue);
      eq("공통 지원은 경제가치에서 제외", soloB.commonActorSupportValue, 3000000);
      eq("스텝차량은 회사 지원비에만", exB.companySupportValue, 3800000);
      eq("법인카드 금액은 유지", soloB.ownerCorporateCardValue, 3000000);
      eq("1인 경제가치=세후순이익+실수령+법인카드", soloB.controlledEconomicValue,
        App.Money.roundWon(soloB.corporateAfterTaxNet + soloB.actorNetIncome + soloB.ownerCorporateCardValue));
      eq("경제가치 법인잔여는 미납 법인세·주민세 차감", soloB.corporateCashForEconomicValue,
        App.Money.roundWon(soloB.corporateEndingCash - (soloB.pendingCorporateLocal || 0)));
      eq("1인 고유혜택=법인카드", soloB.uniqueBenefitValue, soloB.ownerCorporateCardValue);
      eq("전속 경제가치=실수령(공통지원 제외)", exB.controlledEconomicValue,
        App.Money.roundWon(exB.actorNetIncome));
      eq("전속 고유혜택 없음", exB.uniqueBenefitValue, 0);
      var htmlBen = App.Render.renderView("analysis", sBen, rBen, { analysisTab: "scenarios" });
      assert("산식 라벨 대표 신용카드 사용분", htmlBen.indexOf("대표 신용카드 사용분") >= 0);
      assert("산식 라벨 배우 지원가치 없음", htmlBen.indexOf("배우 지원가치") < 0);
      assert("공통 지원 제외 안내", htmlBen.indexOf("양 시나리오에서 동일하게 발생하므로 경제가치 비교에서 제외") >= 0);
      assert("공통 지원 금액 표시", htmlBen.indexOf(App.Format.formatWon(soloB.commonActorSupportValue)) >= 0);
      eq("시드 기말 불변(경제가치 산식)", App.Engine.runSimulation(App.Sample.load()).kpis.endClosing, 1204738995);
    } catch (e) { fail("배우 지원가치 동일기준 예외", e.message || e); }

    try {
      var seedVeh = App.Sample.load();
      eq("시드 차량 2대", seedVeh.vehicles.length, 2);
      eq("시드 하이리무진 이름", seedVeh.vehicles[0].name, "하이리무진");
      eq("시드 스텝 차량 이름", seedVeh.vehicles[1].name, "스텝 차량");
      eq("시드 하이리무진 보증금", seedVeh.vehicles[0].deposit, 30000000);
      eq("시드 일반 차량 보증금", seedVeh.vehicles[1].deposit, 10000000);
      eq("시드 렌트료", seedVeh.vehicles[0].monthlyRent, 2000000);
      eq("시드 스텝 렌트료", seedVeh.vehicles[1].monthlyRent, 800000);
      eq("시드 보험료 임의값 없음", seedVeh.vehicles[0].monthlyInsurance, 0);
      eq("시드 시작월 YYYY-MM", seedVeh.vehicles[0].startMonth, "2026-11");
      assert("시드 deposits에 차량보증금 없음", seedVeh.deposits.every(function (d) {
        return !/차량보증금/.test(d.name || "");
      }));
      var seedVehRun = App.Engine.runSimulation(seedVeh);
      eq("시드 차량 전환 후 기말 불변", seedVehRun.kpis.endClosing, 1204738995);
      eq("시드 차량 전환 후 보증금 45M", seedVehRun.kpis.deposits, 45000000);
      assert("시드 차량 렌트는 판관비", seedVehRun.kpis.supportSga > 0);
      eq("원장 하이리무진 보증금", ledgerItem(ledgerGroup(seedVehRun, "funding"), "하이리무진 보증금").values["2026-10"], -30000000);
      eq("원장 스텝 차량 보증금", ledgerItem(ledgerGroup(seedVehRun, "funding"), "스텝 차량 보증금").values["2026-10"], -10000000);

      var vehEditOpen = { "vehicles-section": true };
      seedVeh.vehicles.forEach(function (v) { vehEditOpen[v.id] = true; });
      var htmlVehEdit = App.Render.renderView("simulation", seedVeh, seedVehRun, { simTab: "support", supportOpen: vehEditOpen });
      assert("차량명 인라인 입력", htmlVehEdit.indexOf('data-path="vehicles.0.name"') >= 0);
      assert("구분 입력", htmlVehEdit.indexOf('data-path="vehicles.0.kind"') >= 0);
      assert("보증금 입력", htmlVehEdit.indexOf('data-path="vehicles.0.deposit"') >= 0);
      assert("월 렌트료 입력", htmlVehEdit.indexOf('data-path="vehicles.0.monthlyRent"') >= 0);
      assert("월 보험료 입력", htmlVehEdit.indexOf('data-path="vehicles.0.monthlyInsurance"') >= 0);
      assert("계약 시작월 YYYY-MM", htmlVehEdit.indexOf('data-path="vehicles.0.startMonth"') >= 0 &&
        htmlVehEdit.indexOf('value="2026-11"') >= 0);
      assert("수정 버튼 없음", htmlVehEdit.indexOf(">수정<") < 0);

      var legacyVehDep = App.Sample.load();
      var beforeLegacyEnd = App.Engine.runSimulation(legacyVehDep).kpis.endClosing;
      legacyVehDep.vehicles = [];
      legacyVehDep.deposits = [
        { id: "d-off", name: "사무실보증금", actualAmount: 5000000, estimatedAmount: 50000000, include: true, month: "2026-11" },
        { id: "d-hi", name: "차량보증금_하이리무진", actualAmount: 30000000, estimatedAmount: 30000000, include: true, month: "2026-11" },
        { id: "d-st", name: "차량보증금_일반", actualAmount: 10000000, estimatedAmount: 10000000, include: true, month: "2026-11" }
      ];
      var noVehEnd = App.Engine.runSimulation(legacyVehDep).kpis.endClosing;
      assert("레거시 보증금만이면 렌트 미차감", noVehEnd > beforeLegacyEnd);
      var migratedVehDep = App.Defaults.ensureState(JSON.parse(JSON.stringify(legacyVehDep)));
      assert("레거시 하이리무진 이관", migratedVehDep.vehicles.some(function (v) {
        return v.name === "하이리무진" && v.deposit === 30000000 && v.kind === "actor";
      }));
      assert("레거시 스텝 차량 이관", migratedVehDep.vehicles.some(function (v) {
        return v.name === "스텝 차량" && v.deposit === 10000000 && v.kind === "staff";
      }));
      assert("레거시 차량보증금 행 제거", migratedVehDep.deposits.every(function (d) {
        return !/차량보증금/.test(d.name || "");
      }));
      eq("레거시 이관 후 기말 동일", App.Engine.runSimulation(migratedVehDep).kpis.endClosing, noVehEnd);
      eq("재이관해도 차량 수 불변", App.Defaults.ensureState(migratedVehDep).vehicles.length, migratedVehDep.vehicles.length);

      var sCar = empty();
      sCar.profile.startMonth = "2027-01";
      sCar.profile.endMonth = "2027-03";
      sCar.profile.initialCash = 100000000;
      sCar.settings.supportPolicies = App.Defaults.defaultSupportPolicies();
      sCar.vehicles = [{
        id: "v-test",
        name: "테스트차",
        kind: "actor",
        deposit: 30000000,
        monthlyRent: 5000000,
        monthlyInsurance: 500000,
        startMonth: "2027-01",
        endMonth: "2027-03",
        include: true
      }];
      var rCar = App.Engine.runSimulation(sCar);
      var jan = monthRow(rCar, "2027-01");
      eq("보증금 현금 차감", rCar.kpis.deposits, 30000000);
      eq("1월 보증금", jan.deposits, 30000000);
      eq("렌트+보험만 판관비", rCar.kpis.supportSga, (5000000 + 500000) * 3);
      eq("1월 렌트+보험", jan.support, 5500000);
      eq("보증금은 손익 비용 아님", rCar.kpis.pnlExpense, rCar.kpis.supportSga);
      assert("보증금을 렌트에 합산하지 않음", jan.support === 5500000);

      var sCar2 = JSON.parse(JSON.stringify(sCar));
      sCar2.vehicles[0].deposit = 20000000;
      eq("보증금 변경시 현금만 변동", App.Engine.runSimulation(sCar2).kpis.endClosing, rCar.kpis.endClosing + 10000000);

      var sExCar = empty();
      sExCar.profile.startMonth = "2027-01";
      sExCar.profile.endMonth = "2027-01";
      var pExCar = App.Defaults.newProject("2027-01", "drama");
      pExCar.status = "confirmed";
      pExCar.contractAmount = 1000000000;
      pExCar.payments = [Object.assign(App.Defaults.newPayment("2027-01"), { amount: 1000000000, inputMode: "amount" })];
      sExCar.projects = [pExCar];
      sExCar.settings.supportPolicies = App.Defaults.defaultSupportPolicies();
      var withoutCarRun = App.Engine.runSimulation(sExCar);
      var withoutCar = App.Engine.runScenarioComparison(sExCar, withoutCarRun);
      sExCar.vehicles = [{
        id: "v-ex",
        name: "하이리무진",
        kind: "actor",
        deposit: 0,
        monthlyRent: 2000000,
        monthlyInsurance: 300000,
        startMonth: "2027-01",
        endMonth: "2027-01",
        include: true
      }];
      var withCarRun = App.Engine.runSimulation(sExCar);
      var withCar = App.Engine.runScenarioComparison(sExCar, withCarRun);
      assert("1인기획사 차량비로 CF 감소", withCarRun.kpis.endClosing < withoutCarRun.kpis.endClosing);
      eq("1인기획사 판관비 = 렌트+보험", withCarRun.kpis.supportSga, 2300000);
      eq("기존회사 실수령에서 차량비 미차감", withCar.scenarios.exclusiveContract.actorNetIncome,
        withoutCar.scenarios.exclusiveContract.actorNetIncome);
      eq("기존회사 회사지원가치 = 렌트+보험", withCar.scenarios.exclusiveContract.companySupportValue, 2300000);
      eq("기존회사 배우부담 차량비 0", withCar.scenarios.exclusiveContract.actorBorneSupportCost, 0);
      assert("세전이익에 렌트·보험 반영", withCarRun.kpis.operatingProfit < withoutCarRun.kpis.operatingProfit);

      sCar.vehicles.push(App.Defaults.newVehicle("2027-01"));
      eq("차량 추가", sCar.vehicles.length, 2);
      sCar.vehicles.splice(1, 1);
      eq("차량 삭제", sCar.vehicles.length, 1);

      var htmlFundVeh = App.Render.renderView("costs", seedVeh, seedVehRun, { costTab: "funding" });
      assert("비용탭 차량 보증금 섹션", htmlFundVeh.indexOf("차량 보증금") >= 0);
      assert("비용탭 차량명 표시", htmlFundVeh.indexOf("하이리무진") >= 0);
      assert("비용탭 차량 배지", /cat-badge">차량 보증금<\/span>/.test(htmlFundVeh) && htmlFundVeh.indexOf(">차량 연동<") >= 0);
      assert("비용탭 일반 배지", htmlFundVeh.indexOf('value="보증금"') >= 0 || htmlFundVeh.indexOf(">보증금</option>") >= 0);
      assert("비용탭 사무실보증금 유지", htmlFundVeh.indexOf("사무실보증금") >= 0);
      assert("차량 보증금과 일반 보증금이 하나의 표 헤더를 공유",
        htmlFundVeh.indexOf("상위구분") >= 0 && htmlFundVeh.indexOf("사무실보증금") >= 0 &&
        htmlFundVeh.indexOf("차량 보증금") >= 0);
      assert("차량 보증금 행이 1행으로 노출됨",
        /<div class="cost-item vehicle-readonly">/.test(htmlFundVeh));
      assert("차량 보증금 행도 항목열 화살표 자리를 비워 맞춤",
        htmlFundVeh.indexOf('class="chev chev-ghost"') >= 0);
      assert("차량 보증금 행에 실제 금액 텍스트가 노출됨(요약에 숨지 않음)",
        htmlFundVeh.indexOf("30,000,000원") >= 0);
    } catch (e) { fail("차량 collection 예외", e.message || e); }

    try {
      eq("normalize YYYY-MM 유지", App.Month.normalizeMonth("2027-04"), "2027-04");
      eq("normalize YYYY-M 보정", App.Month.normalizeMonth("2027-4"), "2027-04");
      eq("normalize YY-MM 보정", App.Month.normalizeMonth("26-10"), "2026-10");
      eq("normalize 한글 월 보정", App.Month.normalizeMonth("2027년 04월"), "2027-04");

      var sMonth = empty();
      sMonth.profile.startMonth = "26-10";
      sMonth.profile.endMonth = "2027년 01월";
      var pMonth = App.Defaults.newProject("2027-04", "drama");
      pMonth.name = "월 포맷 테스트";
      pMonth.status = "confirmed";
      pMonth.contractAmount = 300000000;
      pMonth.shootStartMonth = "2027년 04월";
      pMonth.shootEndMonth = "27-06";
      pMonth.expenseRateMode = "custom";
      pMonth.expenseRate = 0.10;
      pMonth.payments = [
        Object.assign(App.Defaults.newPayment("26-10"), { label: "계약금", amount: 100000000, inputMode: "amount" }),
        Object.assign(App.Defaults.newPayment("2027년 01월"), { label: "잔금", amount: 200000000, inputMode: "amount" })
      ];
      sMonth.projects = [pMonth];
      var normalizedMonthState = App.Defaults.ensureState(sMonth);
      eq("시뮬 시작월 YYYY-MM 저장", normalizedMonthState.profile.startMonth, "2026-10");
      eq("시뮬 종료월 YYYY-MM 저장", normalizedMonthState.profile.endMonth, "2027-01");
      eq("촬영 시작월 YYYY-MM 저장", normalizedMonthState.projects[0].shootStartMonth, "2027-04");
      eq("촬영 종료월 YYYY-MM 저장", normalizedMonthState.projects[0].shootEndMonth, "2027-06");
      eq("지급월 26-10 → 2026-10", normalizedMonthState.projects[0].payments[0].expectedMonth, "2026-10");
      eq("지급월 한글 → 2027-01", normalizedMonthState.projects[0].payments[1].expectedMonth, "2027-01");
      var jsonMonth = App.Store.exportJson(normalizedMonthState);
      assert("JSON에 YYYY-MM 지급월", jsonMonth.indexOf('"expectedMonth": "2026-10"') >= 0);
      assert("JSON에 26-10 저장 없음", jsonMonth.indexOf('"26-10"') < 0);
      var roundMonth = App.Store.parseImport(jsonMonth);
      eq("JSON 가져오기 지급월 복원", roundMonth.projects[0].payments[0].expectedMonth, "2026-10");
      var rMonth = App.Engine.runSimulation(roundMonth);
      eq("Cash Flow 2026-10 입금", monthRow(rMonth, "2026-10").inflow, 100000000);
      eq("연도 넘어간 2027-01 입금", monthRow(rMonth, "2027-01").inflow, 200000000);

      roundMonth.profile.endMonth = "2027-06";
      var rExpenseMonth = App.Engine.runSimulation(roundMonth);
      eq("진행비 2027-04 반영", monthRow(rExpenseMonth, "2027-04").projectExpense, 10000000);
      eq("진행비 2027-06 반영", monthRow(rExpenseMonth, "2027-06").projectExpense, 10000000);

      var planMonth = App.Defaults.newSalesPlan((App.RateRows || [])[0], 100000000, 1);
      planMonth.month = "2026-10";
      planMonth.payments = [
        App.Defaults.newPayment("2026-10", { label: "계약금", percentage: 0.2 }),
        App.Defaults.newPayment("2026-12", { label: "중도금", percentage: 0.4 })
      ];
      planMonth.payments[1].expectedMonth = "2027-01";
      var salesRound = App.Defaults.ensureState(Object.assign(empty(), { salesPlans: [planMonth] }));
      eq("수동 수정한 지급월 자동생성으로 덮어쓰지 않음", salesRound.salesPlans[0].payments[1].expectedMonth, "2027-01");
    } catch (e) { fail("월 포맷 정규화 예외", e.message || e); }

    try {
      var sBur = empty();
      sBur.profile.startMonth = "2027-01";
      sBur.profile.endMonth = "2027-01";
      var pBur = App.Defaults.newProject("2027-01", "drama");
      pBur.status = "confirmed";
      pBur.contractAmount = 1000000000;
      pBur.payments = [Object.assign(App.Defaults.newPayment("2027-01"), { amount: 1000000000, inputMode: "amount" })];
      sBur.projects = [pBur];
      sBur.employees = [
        { id: "ceo-b", name: "이종원", role: "대표이사", monthlySalary: 20000000, include: true, insure: false, meal: true, severance: false },
        { id: "sales-b", name: "영업", role: "영업(본부장급)", monthlySalary: 5000000, include: true, insure: false, meal: true, severance: false },
        { id: "road-b", name: "로드매니저", role: "로드매니저", monthlySalary: 3500000, include: true, insure: false, meal: true, severance: false }
      ];
      sBur = App.Defaults.ensureState(sBur);
      eq("대표이사 기본 부담유형 1인전용", sBur.employees[0].comparisonBurdenType, "onePersonOnly");
      eq("영업 기본 부담유형 배우부담", sBur.employees[1].comparisonBurdenType, "actorBorne");
      eq("로드매니저 기본 부담유형 양쪽부담", sBur.employees[2].comparisonBurdenType, "bothCompany");

      var rBur = App.Engine.runSimulation(sBur);
      var cmpBur = App.Engine.runScenarioComparison(sBur, rBur);
      var soloScn = cmpBur.scenarios.soloAgency;
      var exScn = cmpBur.scenarios.exclusiveContract;
      eq("1인 기획사 인건비는 3명 전액(기존 로직 불변)", soloScn.payroll, 28500000);
      eq("기존회사 인건비는 로드매니저만", exScn.payroll, 3500000);
      assert("payrollBreakdown 3명", soloScn.payrollBreakdown.length, 3);
      var ceoRow = soloScn.payrollBreakdown.filter(function (r) { return r.id === "ceo-b"; })[0];
      var salesRow = soloScn.payrollBreakdown.filter(function (r) { return r.id === "sales-b"; })[0];
      eq("대표 exclusiveBorne=false", ceoRow.exclusiveBorne, false);
      eq("영업 exclusiveBorne=true", salesRow.exclusiveBorne, true);
      eq("영업 exclusiveBearer=actor", salesRow.exclusiveBearer, "actor");
      eq("대표 solo 급여 표시", ceoRow.soloAmount, 20000000);
      eq("본부장 급여는 배우 부담 금액", salesRow.exclusiveAmount, 5000000);
      assert("배우 부담 인건비에 본부장 포함", exScn.payrollActorBorne >= 5000000);

      var headcountAll = rBur.months[0].mealHeadcount;
      eq("식대 대상은 여전히 3명(기존 로직 불변)", headcountAll, 3);
      var burBuckets = App.Engine.exclusiveCostBuckets(sBur, rBur);
      var mealAllAmount = rBur.months[0].meal;
      assert("기존회사 opex(식대 포함)는 대표 몫 제외해 더 작음", burBuckets.opex < mealAllAmount);

      sBur.employees[0].comparisonBurdenType = "custom";
      sBur.employees[0].customExclusiveBurden = true;
      var rBur2 = App.Engine.runSimulation(sBur);
      var cmpBur2 = App.Engine.runScenarioComparison(sBur, rBur2);
      eq("사용자지정 true면 대표도 기존회사 인건비 포함", cmpBur2.scenarios.exclusiveContract.payroll, 23500000);

      sBur.employees[0].customExclusiveBurden = false;
      var rBur3 = App.Engine.runSimulation(sBur);
      var cmpBur3 = App.Engine.runScenarioComparison(sBur, rBur3);
      eq("사용자지정 false면 대표는 다시 제외", cmpBur3.scenarios.exclusiveContract.payroll, 3500000);

      var legacyEmp = { settings: {}, employees: [
        { id: "leg-ceo", name: "김대표", role: "대표", monthlySalary: 10000000, include: true },
        { id: "leg-mgr", name: "박매니저", role: "매니저", monthlySalary: 3000000, include: true }
      ] };
      var migratedEmp = App.Defaults.ensureState(JSON.parse(JSON.stringify(legacyEmp)));
      eq("레거시 JSON 대표 추론", migratedEmp.employees[0].comparisonBurdenType, "onePersonOnly");
      eq("레거시 JSON 매니저 추론", migratedEmp.employees[1].comparisonBurdenType, "bothCompany");
      eq("레거시 급여 보존", migratedEmp.employees[0].monthlySalary, 10000000);

      var legacyDir = { settings: {}, employees: [
        { id: "leg-dir", name: "영업", role: "영업(본부장급)", monthlySalary: 5000000, include: true, comparisonBurdenType: "bothCompany" }
      ] };
      var migratedDir = App.Defaults.ensureState(JSON.parse(JSON.stringify(legacyDir)));
      eq("레거시 본부장 bothCompany → 배우부담", migratedDir.employees[0].comparisonBurdenType, "actorBorne");
      migratedDir.employees[0].comparisonBurdenType = "bothCompany";
      var migratedDir2 = App.Defaults.ensureState(migratedDir);
      eq("마이그레이션 이후 수동 bothCompany는 유지", migratedDir2.employees[0].comparisonBurdenType, "bothCompany");

      var htmlBur = App.Render.renderView("simulation", sBur, rBur, { simTab: "org" });
      assert("직원 상세에 비교 부담유형 select", htmlBur.indexOf("비교 부담유형") >= 0);
      var htmlBurOpen = App.Render.renderView("simulation", sBur, rBur, {
        simTab: "org", costItemOpen: { "employees-ceo-b": true }
      });
      assert("커스텀 체크박스는 comparisonBurdenType이 custom일 때만", true);

      var htmlCmpBur = App.Render.renderView("analysis", sBur, rBur, { analysisTab: "scenarios" });
      assert("분석에서 인건비 상세 미표시", htmlCmpBur.indexOf("인건비 상세") < 0);
      var htmlOrgBur = App.Render.renderView("simulation", sBur, rBur, { simTab: "org" });
      assert("설정 조직에서 대표 이름", htmlOrgBur.indexOf("이종원") >= 0);
    } catch (e) { fail("직원 비교 부담유형 예외", e.message || e); }

    try {
      var sMix = empty();
      sMix.profile.startMonth = "2027-01";
      sMix.profile.endMonth = "2027-01";
      var pMix = App.Defaults.newProject("2027-01", "drama");
      pMix.status = "confirmed";
      pMix.contractAmount = 1000000000;
      pMix.payments = [Object.assign(App.Defaults.newPayment("2027-01"), { amount: 1000000000, inputMode: "amount" })];
      sMix.projects = [pMix];
      sMix.employees = [
        { id: "ceo-mix", name: "이종원", role: "대표이사", monthlySalary: 20000000, include: true, insure: false, meal: false, severance: false },
        {
          id: "lead-mix", name: "영업", role: "영업(본부장급)", monthlySalary: 5000000, include: true,
          insure: false, meal: false, severance: false, comparisonBurdenType: "actorBorne"
        },
        {
          id: "mgr-mix", name: "로드매니저", role: "로드매니저", monthlySalary: 3500000, include: true,
          insure: false, meal: false, severance: false, comparisonBurdenType: "bothCompany"
        }
      ];
      sMix.settings.scenarioComparison = { enabledScenarioIds: ["soloAgency", "exclusiveContract"] };
      sMix = App.Defaults.ensureState(sMix);
      sMix.settings.scenarios.exclusiveContract.actorPersonalCosts = [];
      var rMix = App.Engine.runSimulation(sMix);
      var cmpMix = App.Engine.runScenarioComparison(sMix, rMix);
      var soloMix = cmpMix.scenarios.soloAgency;
      var exMix = cmpMix.scenarios.exclusiveContract;

      eq("CASE5 1인 기획사는 대표/본부장/로드매니저 전원 법인 부담", soloMix.payroll, 28500000);
      var bd = exMix.payrollBreakdown;
      eq("CASE7 대표이사는 기존 회사 전속에서 해당 없음", bd.filter(function (r) { return r.name === "이종원"; })[0].exclusiveBearer, "notApplicable");
      eq("CASE3 본부장 인건비는 배우 부담", bd.filter(function (r) { return r.name === "영업"; })[0].exclusiveBearer, "actor");
      eq("CASE1 로드매니저 인건비는 기존 회사 부담", bd.filter(function (r) { return r.name === "로드매니저"; })[0].exclusiveBearer, "company");
      eq("CASE3 본부장 인건비 금액", exMix.payrollActorBorne, 5000000 * 1);
      eq("CASE1 로드매니저 인건비는 배우 실수령에서 제외(회사 부담 총액에 포함)", exMix.payroll, 3500000);
      var actorPersonalCostsTotal = App.Money.sumBy(sMix.settings.scenarios.exclusiveContract.actorPersonalCosts || [], function (item) {
        return item && item.include !== false ? App.Money.roundWon(item.amount) : 0;
      });
      eq("CASE11 배우 부담 비용 = 본부장 비용 1회", exMix.actorBorneCosts, exMix.directorCost);
      eq("전속 과세소득 = 귀속매출 − 본부장 − 지원", exMix.taxYears[0].taxableIncome,
        App.Money.roundWon(exMix.taxYears[0].actorGross - exMix.taxYears[0].directorCost - (exMix.taxYears[0].actorSupport || 0)));
      eq("본부장 비용은 귀속연도 슬라이스에 있음", exMix.taxYears[0].directorCost, 5000000);
      eq("슬라이스 배우 부담 = 본부장", exMix.taxYears[0].actorBorneCosts, exMix.taxYears[0].directorCost);
      eq("CASE4 본부장 인건비가 회사 지원가치에 없음(0)", exMix.companySupportValue, 0);
      var mixCompanyPay = App.Money.sumBy(bd.filter(function (r) { return r.exclusiveBearer === "company"; }), function (r) {
        return r.exclusiveAmount;
      });
      eq("회사 부담 인건비는 로드매니저만", mixCompanyPay, 3500000);
      var nestedSupport = App.Money.sumBy(exMix.supportBreakdown || [], function (p) {
        return App.Money.roundWon(p && p.exclusiveCompanyValue);
      });
      eq("배우 지원비 소계=하위 합(이중합산 기준값)", nestedSupport, App.Money.roundWon(exMix.companySupportValue));
      var mixCostTotal = App.Money.roundWon(
        App.Money.roundWon(exMix.projectExpense) +
        App.Money.roundWon(exMix.lunchTruck) +
        mixCompanyPay +
        App.Money.roundWon(exMix.companySupportValue)
      );
      var mixCompanyRemain = App.Money.roundWon(exMix.companyShare - mixCostTotal);
      eq("회사 잔여 = 배분몫 − 진행비 − 밥차 − 회사인건비 − 지원가치", mixCompanyRemain,
        App.Money.roundWon(exMix.companyShare - exMix.projectExpense - exMix.lunchTruck - mixCompanyPay - exMix.companySupportValue));
      eq("본부장 비용은 회사 경제성에서 이중차감되지 않음", mixCompanyRemain,
        App.Money.roundWon(exMix.companyShare - mixCostTotal));
      assert("회사부담 합계에 지원 하위 이중합산 없음", mixCostTotal === App.Money.roundWon(
        exMix.projectExpense + exMix.lunchTruck + mixCompanyPay + nestedSupport
      ));

      sMix.employees[1].monthlySalary = 7000000;
      var rMix2 = App.Engine.runSimulation(sMix);
      var cmpMix2 = App.Engine.runScenarioComparison(sMix, rMix2);
      eq("CASE8 급여 변경 시 비교표 자동 반영(하드코딩 아님)", cmpMix2.scenarios.exclusiveContract.payrollActorBorne, 7000000);
      eq("본부장 인상은 1회만 배우 부담", cmpMix2.scenarios.exclusiveContract.actorBorneCosts,
        cmpMix2.scenarios.exclusiveContract.directorCost);
      eq("본부장 200만 인상이 2배가 아님",
        App.Money.roundWon(cmpMix2.scenarios.exclusiveContract.directorCost - exMix.directorCost), 2000000);
      eq("회사 부담 합계는 본부장 인상과 무관",
        App.Render.exclusiveCompanyEconomics(cmpMix2.scenarios.exclusiveContract).companyCostTotal, mixCostTotal);

      var netAt7 = cmpMix2.scenarios.exclusiveContract.actorNetIncome;
      var valueAt7 = cmpMix2.scenarios.exclusiveContract.controlledEconomicValue;
      sMix.employees[1].monthlySalary = 0;
      var exZero = App.Engine.runScenarioComparison(sMix, App.Engine.runSimulation(sMix)).scenarios.exclusiveContract;
      eq("본부장 0원이면 배우 부담 0", exZero.directorCost, 0);
      eq("본부장 0원이면 actorBorneCosts 0", exZero.actorBorneCosts, 0);
      assert("본부장 0원이면 실수령 증가", exZero.actorNetIncome > netAt7);
      assert("본부장 0원이면 경제가치 증가", exZero.controlledEconomicValue > valueAt7);
      eq("본부장 0원이어도 회사 부담 합계 불변",
        App.Render.exclusiveCompanyEconomics(exZero).companyCostTotal, mixCostTotal);
      eq("연도별 본부장 합=전체", App.Money.sumBy(exMix.taxYears, function (s) { return s.directorCost; }),
        exMix.directorCost);

      var htmlMix = App.Render.renderView("analysis", sMix, rMix, { analysisTab: "scenarios" });
      assert("회사 측 경제성 패널", htmlMix.indexOf("회사 측 경제성") >= 0);
      assert("회사에 남는 금액 라벨", htmlMix.indexOf("회사 최종 잔여") >= 0);
      assert("회사에 남는 금액 숫자", htmlMix.indexOf(App.Format.formatWon(mixCompanyRemain)) >= 0);
      assert("회사 부담 비용 합계 라벨", htmlMix.indexOf("비용 합계") >= 0);
      assert("회사 부담 비용 합계 숫자", htmlMix.indexOf(App.Format.formatWon(-mixCostTotal)) >= 0);
      assert("회사 패널에 진행비", htmlMix.indexOf("진행비") >= 0);
      assert("회사 패널에 밥차비", htmlMix.indexOf("밥차비") >= 0);
      assert("회사 패널에 로드매니저", htmlMix.indexOf("로드매니저") >= 0);
      assert("순이익이라는 말은 안 씀", htmlMix.indexOf("회사 순이익") < 0);
      assert("badge 통일: 기존 회사 100% 부담", htmlMix.indexOf("기존 회사 100% 부담") >= 0);
      assert("전속 상세에 배우 부담 인건비 유지", htmlMix.indexOf("배우 부담 인건비") >= 0);
      assert("배우 부담 비용 합계 행 제거", htmlMix.indexOf("배우 부담 비용") < 0);
      assert("실과세표준은 상세에만", htmlMix.indexOf("실과세표준") >= 0 &&
        htmlMix.indexOf("배분 계산 상세 보기") >= 0);
      assert("급여 단일 뭉뚱그림 행 제거됨", !/<th>급여<\/th>/.test(htmlMix));
    } catch (e) { fail("인건비 부담주체 개별화 예외", e.message || e); }

    try {
      var sChain = App.Defaults.ensureState(App.Sample.load());
      var rChain0 = App.Engine.runSimulation(sChain);
      var cChain0 = App.Engine.runScenarioComparison(sChain, rChain0);
      var eco0 = App.Render.exclusiveCompanyEconomics(cChain0.scenarios.exclusiveContract);
      var htmlChain0 = App.Render.renderView("analysis", sChain, rChain0, { analysisTab: "scenarios" });
      assert("연쇄 전 합계 라벨", htmlChain0.indexOf("비용 합계") >= 0);
      assert("연쇄 전 합계 숫자", htmlChain0.indexOf(App.Format.formatWon(-eco0.companyCostTotal)) >= 0);
      assert("연쇄 전 잔여 숫자", htmlChain0.indexOf(App.Format.formatWon(eco0.economicRemaining)) >= 0);
      assert("회사 최종 잔여 라벨", htmlChain0.indexOf("회사 최종 잔여") >= 0);
      assert("연도 합산 기호", htmlChain0.indexOf("scenario-year-plus") >= 0);
      assert("긴 잔여 문구 제거", htmlChain0.indexOf("이 계약에서 회사에 남는 금액") < 0);
      assert("잔여 금액에 + 없음", htmlChain0.indexOf("+" + App.Format.formatWon(eco0.economicRemaining)) < 0);
      var remainRate0 = cChain0.scenarios.exclusiveContract.totalRevenue
        ? eco0.economicRemaining / Math.abs(cChain0.scenarios.exclusiveContract.totalRevenue) : null;
      assert("매출 대비 비율 표시", remainRate0 != null &&
        htmlChain0.indexOf("매출 대비 " + App.Format.formatPct(remainRate0)) >= 0);
      assert("회사 보조식 수익배분 제거", htmlChain0.indexOf("회사 수익배분 " + App.Format.formatWon(eco0.companyShare)) < 0);
      assert("회사 보조식 부담비용 제거", htmlChain0.indexOf("− 회사 부담 비용 " + App.Format.formatWon(eco0.companyCostTotal)) < 0);
      eq("잔여는 엔진 공식", eco0.economicRemaining, App.Money.roundWon(eco0.companyShare - eco0.companyCostTotal));
      eq("합계는 중복 없는 부모합", eco0.companyCostTotal, App.Money.roundWon(
        eco0.projectExpense + eco0.lunchTruck + eco0.companyPayroll + eco0.companySupportValue
      ));

      var pt = (sChain.settings.supportPolicies || []).filter(function (p) { return p.id === "sp-pt"; })[0];
      assert("PT 정책 존재", !!pt);
      pt.include = true;
      pt.unitAmount = App.Money.roundWon(pt.unitAmount) + 1000000;
      var rChain1 = App.Engine.runSimulation(sChain);
      var cChain1 = App.Engine.runScenarioComparison(sChain, rChain1);
      var eco1 = App.Render.exclusiveCompanyEconomics(cChain1.scenarios.exclusiveContract);
      var supportDelta = App.Money.roundWon(eco1.companySupportValue - eco0.companySupportValue);
      assert("PT 인상 후 지원비 증가", supportDelta > 0);
      eq("개별비용→합계 연쇄", eco1.companyCostTotal, App.Money.roundWon(eco0.companyCostTotal + supportDelta));
      eq("합계→잔여 연쇄", eco1.economicRemaining, App.Money.roundWon(eco0.economicRemaining - supportDelta));
      eq("수익배분 몫은 지원비와 독립", eco1.companyShare, eco0.companyShare);
      eq("전속 경제가치=실수령+고유혜택", cChain1.scenarios.exclusiveContract.controlledEconomicValue,
        App.Money.roundWon(cChain1.scenarios.exclusiveContract.actorNetIncome +
          (cChain1.scenarios.exclusiveContract.uniqueBenefitValue || 0)));
      eq("공통 PT는 전속 경제가치 불변", cChain1.scenarios.exclusiveContract.controlledEconomicValue,
        cChain0.scenarios.exclusiveContract.controlledEconomicValue);
      var d0 = App.Money.roundWon(cChain0.deltas.controlledEconomicValue);
      var d1 = App.Money.roundWon(cChain1.deltas.controlledEconomicValue);
      eq("차이=1인-전속(재계산)", d1, App.Money.roundWon(
        cChain1.scenarios.soloAgency.controlledEconomicValue -
        cChain1.scenarios.exclusiveContract.controlledEconomicValue
      ));
      assert("경제가치 차이 변동", d1 !== d0);
      var rate0 = cChain0.scenarios.exclusiveContract.controlledEconomicValue
        ? (cChain0.scenarios.soloAgency.controlledEconomicValue - cChain0.scenarios.exclusiveContract.controlledEconomicValue) /
          Math.abs(cChain0.scenarios.exclusiveContract.controlledEconomicValue)
        : null;
      var rate1 = cChain1.scenarios.exclusiveContract.controlledEconomicValue
        ? (cChain1.scenarios.soloAgency.controlledEconomicValue - cChain1.scenarios.exclusiveContract.controlledEconomicValue) /
          Math.abs(cChain1.scenarios.exclusiveContract.controlledEconomicValue)
        : null;
      assert("차이율 재계산", rate1 !== rate0);
      var htmlChain1 = App.Render.renderView("analysis", sChain, rChain1, { analysisTab: "scenarios" });
      assert("연쇄 후 합계 숫자", htmlChain1.indexOf(App.Format.formatWon(-eco1.companyCostTotal)) >= 0);
      assert("연쇄 후 잔여 숫자", htmlChain1.indexOf(App.Format.formatWon(eco1.economicRemaining)) >= 0);
      var remainRate1 = cChain1.scenarios.exclusiveContract.totalRevenue
        ? eco1.economicRemaining / Math.abs(cChain1.scenarios.exclusiveContract.totalRevenue) : null;
      assert("매출 대비 비율 연쇄", remainRate1 != null && remainRate1 !== remainRate0 &&
        htmlChain1.indexOf("매출 대비 " + App.Format.formatPct(remainRate1)) >= 0);
      assert("보조식 잔여 연쇄 제거", htmlChain1.indexOf("= 회사 최종 잔여 " + App.Format.formatWon(eco1.economicRemaining)) < 0);
      assert("연쇄 후 전속 경제가치 숫자", htmlChain1.indexOf(App.Format.formatWon(cChain1.scenarios.exclusiveContract.controlledEconomicValue)) >= 0);
      assert("연쇄 후 차이 숫자", htmlChain1.indexOf(App.Format.formatWon(d1)) >= 0);
      assert("연쇄 후 전속 구성 지원가치", htmlChain1.indexOf(App.Format.formatWon(cChain1.scenarios.exclusiveContract.companySupportValue)) >= 0);
      assert("연쇄 후 배우 실수령 구성", htmlChain1.indexOf("세후 개인 실수령") >= 0 &&
        htmlChain1.indexOf(App.Format.formatWon(cChain1.scenarios.exclusiveContract.actorNetIncome)) >= 0);

      var jsonChain = App.Store.exportJson(sChain);
      var restoredChain = App.Store.parseImport(jsonChain);
      var rJson = App.Engine.runSimulation(restoredChain);
      var cJson = App.Engine.runScenarioComparison(restoredChain, rJson);
      var ecoJson = App.Render.exclusiveCompanyEconomics(cJson.scenarios.exclusiveContract);
      eq("JSON 왕복 후 회사부담 합계 동일", ecoJson.companyCostTotal, eco1.companyCostTotal);
      eq("JSON 왕복 후 잔여 동일", ecoJson.economicRemaining, eco1.economicRemaining);
    } catch (e) { fail("회사 경제성 동적 연쇄 예외", e.message || e); }

    try {
      var sLt = empty();
      sLt.profile.startMonth = "2026-09";
      sLt.profile.endMonth = "2027-05";
      function ltProj(cat, name, episodes, shootStart, shootEnd, amt) {
        var p = App.Defaults.newProject(shootStart, cat);
        p.name = name;
        p.episodes = episodes;
        p.contractAmount = amt;
        p.status = "confirmed";
        p.shootStartMonth = shootStart;
        p.shootEndMonth = shootEnd;
        p.payments = [Object.assign(App.Defaults.newPayment(shootStart), { amount: amt, inputMode: "amount" })];
        return p;
      }
      var drama1 = ltProj("drama", "하렘의 남자들", 16, "2026-09", "2026-12", 800000000);
      var drama2 = ltProj("drama", "언니 이번생엔 내가 왕비야", 16, "2026-12", "2027-05", 800000000);
      var movieA = ltProj("movie", "영화 A", "", "2027-01", "2027-01", 300000000);
      movieA.lunchTruckCount = 3;
      sLt.projects = [drama1, drama2, movieA];
      sLt.settings.supportPolicies = App.Defaults.defaultSupportPolicies();
      var ltPolicy = sLt.settings.supportPolicies.filter(function (p) { return p.id === "sp-lunch-truck"; })[0];
      ltPolicy.unitAmount = 1000000;
      sLt = App.Defaults.ensureState(sLt);

      var rLt = App.Engine.runSimulation(sLt);
      eq("작품당 1회+영화 3회", rLt.kpis.lunchTruck, 5000000);
      var byProj = rLt.lunchTruck.byProject;
      eq("하렘 밥차 = 작품당 1회×단가", byProj.filter(function (p) { return p.id === drama1.id; })[0].amount, 1000000);
      eq("하렘 밥차는 회차 16이 아님", byProj.filter(function (p) { return p.id === drama1.id; })[0].count, 1);
      eq("영화 밥차 = 수동 3회×단가", byProj.filter(function (p) { return p.id === movieA.id; })[0].basis, "manual");
      eq("영화 밥차 금액", byProj.filter(function (p) { return p.id === movieA.id; })[0].amount, 3000000);

      eq("밥차는 시작월 자체에는 반영 안 됨", monthRow(rLt, "2026-09").lunchTruck, 0);
      eq("하렘 밥차는 시작월 다음달(10월)에 일괄 반영", monthRow(rLt, "2026-10").lunchTruck, 1000000);
      eq("언니 밥차는 시작월 다음달(1월)에 일괄 반영", monthRow(rLt, "2027-01").lunchTruck, 1000000);
      eq("영화 밥차는 시작월 다음달(2월)에 일괄 반영", monthRow(rLt, "2027-02").lunchTruck, 3000000);

      drama1.episodes = 20;
      var rLt2 = App.Engine.runSimulation(sLt);
      eq("회차 변경해도 밥차는 작품당 1회", rLt2.lunchTruck.byProject.filter(function (p) { return p.id === drama1.id; })[0].amount, 1000000);
      drama1.episodes = 16;

      movieA.lunchTruckPrice = 2000000;
      var rLt3 = App.Engine.runSimulation(sLt);
      eq("작품별 단가 override 반영", rLt3.lunchTruck.byProject.filter(function (p) { return p.id === movieA.id; })[0].amount, 6000000);
      movieA.lunchTruckPrice = 0;

      movieA.lunchTruckInclude = false;
      var rLt4 = App.Engine.runSimulation(sLt);
      assert("작품별 포함 해제시 그 작품만 제외", !rLt4.lunchTruck.byProject.some(function (p) { return p.id === movieA.id; }));
      eq("나머지 작품은 그대로", rLt4.kpis.lunchTruck, 2000000);
      movieA.lunchTruckInclude = true;

      var origLen = sLt.projects.length;
      sLt.projects = sLt.projects.filter(function (p) { return p.id !== movieA.id; });
      var rLt5 = App.Engine.runSimulation(sLt);
      eq("작품 삭제시 밥차도 자동 제거", rLt5.kpis.lunchTruck, 2000000);
      sLt.projects = [drama1, drama2, movieA];
      assert("복원 확인", sLt.projects.length === origLen);

      var cmpLt = App.Engine.runScenarioComparison(sLt, App.Engine.runSimulation(sLt));
      eq("1인기획사 밥차=법인 부담(kpi와 동일)", cmpLt.scenarios.soloAgency.lunchTruck, 5000000);
      eq("전속 밥차 버킷은 직접비와 분리", App.Engine.exclusiveCostBuckets(sLt, rLt).lunchTruck, 5000000);
      eq("전속 직접비 버킷에 밥차 미포함", App.Engine.exclusiveCostBuckets(sLt, rLt).projectDirect, 0);
      eq("기존회사 배우부담비용에 밥차 미포함", cmpLt.scenarios.exclusiveContract.actorBorneCosts,
        cmpLt.scenarios.exclusiveContract.directorCost);
      var splitLtForced = App.Engine.splitCostsByRule({
        projectExpense: 228144000,
        lunchTruck: 15000000,
        projectDirect: 0,
        revenueLinkedFees: 0,
        payroll: 0,
        opex: 0,
        startup: 0,
        assetsAndDeposits: 0,
        actorPersonalCosts: 0,
        actorBornePayroll: 0
      }, { projectExpense: "actor", lunchTruck: "deductBeforeSplit", projectDirect: "deductBeforeSplit" });
      eq("진행비를 actor로 저장해도 배우 부담 0", splitLtForced.actorBorneCosts, 0);
      eq("밥차를 배전공제로 저장해도 공제 0", splitLtForced.deductibleBeforeSplit, 0);
      eq("진행비+밥차는 회사 부담 합계", splitLtForced.companyBorneCosts, 243144000);
      var splitLtDefault = App.Engine.splitCostsByRule(
        App.Engine.exclusiveCostBuckets(sLt, rLt),
        sLt.settings.scenarios.exclusiveContract.costBurdenRules
      );
      eq("기본 규칙에서 밥차·진행비는 배분 전 공제 아님", splitLtDefault.deductibleBeforeSplit,
        App.Engine.exclusiveCostBuckets(sLt, rLt).projectDirect +
        App.Engine.exclusiveCostBuckets(sLt, rLt).revenueLinkedFees);
      eq("시나리오 직접비=진행비+밥차+기타", cmpLt.scenarios.soloAgency.projectDirectTotal,
        App.Money.roundWon(cmpLt.scenarios.soloAgency.projectExpense + cmpLt.scenarios.soloAgency.lunchTruck +
          cmpLt.scenarios.soloAgency.projectDirectOther));
      eq("전속 직접비 발생액=1인 기획사", cmpLt.scenarios.exclusiveContract.projectDirectTotal,
        cmpLt.scenarios.soloAgency.projectDirectTotal);
      var ltProjectGroup = ledgerGroup(rLt, "project");
      var ltFeeAbs = App.Money.sumBy(ltProjectGroup.rows || [], function (row) {
        return String(row.id || "").indexOf("revfee-") === 0 ? App.Money.roundWon(-(row.total || 0)) : 0;
      });
      eq("월별 원장 프로젝트 소계(수수료 제외)=시나리오 직접비", cmpLt.scenarios.soloAgency.projectDirectTotal,
        App.Money.roundWon(-(ltProjectGroup.subtotal.total) - ltFeeAbs));

      var pAd = App.Defaults.newProject("2027-01", "ad");
      pAd.name = "광고A";
      pAd.status = "confirmed";
      pAd.contractAmount = 100000000;
      sLt.projects.push(pAd);
      var rLt6 = App.Engine.runSimulation(App.Defaults.ensureState(sLt));
      assert("영업(TVCF) 작품은 밥차 대상 아님", !rLt6.lunchTruck.byProject.some(function (p) { return p.id === pAd.id; }));
      sLt.projects.pop();

      var legacyLt = empty();
      legacyLt.profile.startMonth = "2027-01";
      legacyLt.profile.endMonth = "2027-02";
      legacyLt.settings.supportPolicies = [
        { id: "sp-lunch-truck", name: "밥차", group: "production", calcMode: "perOccurrence",
          costClass: "project", unitAmount: 500000, include: true }
      ];
      legacyLt.projects = [{ id: "leg-drama", category: "drama", name: "레거시 드라마", episodes: 10,
        status: "confirmed", contractAmount: 100000000, shootStartMonth: "2027-01", shootEndMonth: "2027-01",
        payments: [] }];
      var migratedLt = App.Defaults.ensureState(JSON.parse(JSON.stringify(legacyLt)));
      eq("레거시 프로젝트 lunchTruckInclude 기본 true", migratedLt.projects[0].lunchTruckInclude, true);
      eq("레거시 프로젝트 lunchTruckCount 기본 0", migratedLt.projects[0].lunchTruckCount, 0);
      var rLegacy = App.Engine.runSimulation(migratedLt);
      eq("레거시 드라마도 작품당 1회(회차 10 무시)", rLegacy.kpis.lunchTruck, 500000);

      eq("costBurdenRules 기본값 lunchTruck=company", App.Defaults.defaultCostBurdenRules().lunchTruck, "company");

      var htmlLt = App.Render.renderView("simulation", sLt, rLt, {
        simTab: "support", supportOpen: { "sp-lunch-truck": true }
      });
      assert("밥차 헤더 예상 횟수 표시", htmlLt.indexOf("예상 5회") >= 0);
      assert("밥차 표에 작품명", htmlLt.indexOf("하렘의 남자들") >= 0 && htmlLt.indexOf("영화 A") >= 0);
      assert("밥차 표에 작품당1회/횟수지정 구분", htmlLt.indexOf("작품당 1회") >= 0 && htmlLt.indexOf("횟수 지정") >= 0);
      assert("밥차 표에 구분 드라마", htmlLt.indexOf("드라마") >= 0);
      assert("밥차 표 합계 횟수", htmlLt.indexOf("5회") >= 0);

      ltPolicy = sLt.settings.supportPolicies.filter(function (p) { return p.id === "sp-lunch-truck"; })[0];
      ltPolicy.unitAmount = 0;
      ltPolicy.unitAmountUserSet = true;
      var zeroRows = App.Engine.lunchTruckProjectRows(sLt, 0);
      eq("단가 0이어도 작품 횟수 유지", App.Money.sumBy(zeroRows, function (r) { return r.count; }), 5);
      eq("단가 0이면 금액 0", App.Money.sumBy(zeroRows, function (r) { return r.amount; }), 0);
      var htmlLtZero = App.Render.renderView("simulation", sLt, App.Engine.runSimulation(sLt), { simTab: "support" });
      assert("단가 0이어도 헤더에 5회", htmlLtZero.indexOf("예상 5회") >= 0);
      assert("단가 0이면 헤더 금액 0원", htmlLtZero.indexOf("예상 5회 · 0원") >= 0);
      ltPolicy = sLt.settings.supportPolicies.filter(function (p) { return p.id === "sp-lunch-truck"; })[0];
      ltPolicy.unitAmount = 1000000;
      ltPolicy.unitAmountUserSet = true;

      var sPair = empty();
      sPair.profile.startMonth = "2027-01";
      sPair.profile.endMonth = "2027-02";
      var dA = ltProj("drama", "하렘의 남자들", 16, "2027-01", "2027-01", 800000000);
      var dB = ltProj("drama", "언니 이번생엔 내가 왕비야", 16, "2027-01", "2027-01", 800000000);
      sPair.projects = [dA, dB];
      sPair.settings.supportPolicies = App.Defaults.defaultSupportPolicies();
      var pairPol = sPair.settings.supportPolicies.filter(function (p) { return p.id === "sp-lunch-truck"; })[0];
      pairPol.unitAmount = 0;
      pairPol.unitAmountUserSet = true;
      App.Defaults.ensureState(sPair);
      var pairRows = App.Engine.lunchTruckProjectRows(sPair, 0);
      eq("드라마 2편은 작품당 1회씩 2회", App.Money.sumBy(pairRows, function (r) { return r.count; }), 2);
      eq("단가 0원 예상 비용 0", App.Money.sumBy(pairRows, function (r) { return r.amount; }), 0);
      var htmlPair = App.Render.renderView("simulation", sPair, App.Engine.runSimulation(sPair), { simTab: "support" });
      assert("헤더 예상 2회", htmlPair.indexOf("예상 2회") >= 0);
      pairPol = sPair.settings.supportPolicies.filter(function (p) { return p.id === "sp-lunch-truck"; })[0];
      pairPol.unitAmount = 5000000;
      pairPol.unitAmountUserSet = true;
      eq("단가 5백만이면 1,000만", App.Engine.runSimulation(sPair).kpis.lunchTruck, 10000000);

      pairPol.include = false;
      eq("밥차 포함 OFF면 비용 0", App.Engine.runSimulation(sPair).kpis.lunchTruck, 0);
      var htmlPairOff = App.Render.renderView("simulation", sPair, App.Engine.runSimulation(sPair), { simTab: "support" });
      assert("포함 OFF여도 연동 횟수는 표시", htmlPairOff.indexOf("예상 2회") >= 0);
      assert("포함 OFF면 헤더 금액 0원", htmlPairOff.indexOf("예상 2회 · 0원") >= 0);
      pairPol.include = true;

      dA.includeInBudget = false;
      eq("예산 반영 OFF 작품은 밥차 합계에서 제외", App.Money.sumBy(App.Engine.lunchTruckProjectRows(sPair, 5000000), function (r) { return r.count; }), 1);
      dA.includeInBudget = true;
      eq("예산 반영 ON 복원", App.Money.sumBy(App.Engine.lunchTruckProjectRows(sPair, 5000000), function (r) { return r.count; }), 2);

      var htmlPairOpen = App.Render.renderView("simulation", sPair, App.Engine.runSimulation(sPair), {
        simTab: "support", supportOpen: { "sp-lunch-truck": true }
      });
      assert("펼침에 연동 작품 제목", htmlPairOpen.indexOf("연동 작품") >= 0);
      assert("펼침에 하렘 작품당 1회", htmlPairOpen.indexOf("하렘의 남자들") >= 0 && htmlPairOpen.indexOf("작품당 1회") >= 0);
      assert("펼침 합계 2회", htmlPairOpen.indexOf("2회") >= 0);

      var sOtt = empty();
      sOtt.profile.startMonth = "2027-01";
      sOtt.profile.endMonth = "2027-02";
      var pDrama20 = ltProj("drama", "드라마20", 20, "2027-01", "2027-01", 100000000);
      var pOtt12 = ltProj("ott", "OTT12", 12, "2027-01", "2027-01", 100000000);
      sOtt.projects = [pDrama20, pOtt12];
      sOtt.settings.supportPolicies = App.Defaults.defaultSupportPolicies();
      sOtt.settings.supportPolicies.filter(function (p) { return p.id === "sp-lunch-truck"; })[0].unitAmount = 1000000;
      eq("드라마+OTT=작품 2건 비용", App.Engine.runSimulation(sOtt).kpis.lunchTruck, 2000000);

      var sMovieOnly = empty();
      sMovieOnly.profile.startMonth = "2027-01";
      sMovieOnly.profile.endMonth = "2027-02";
      var pMovie = ltProj("movie", "영화만", "", "2027-01", "2027-01", 100000000);
      sMovieOnly.projects = [pMovie];
      sMovieOnly.settings.supportPolicies = App.Defaults.defaultSupportPolicies();
      sMovieOnly.settings.supportPolicies.filter(function (p) { return p.id === "sp-lunch-truck"; })[0].unitAmount = 1000000;
      eq("영화 기본도 작품당 1회", App.Engine.runSimulation(sMovieOnly).kpis.lunchTruck, 1000000);
      pMovie.lunchTruckCount = 3;
      eq("영화 수동 3회", App.Engine.runSimulation(sMovieOnly).kpis.lunchTruck, 3000000);

      dB.episodes = 20;
      eq("회차 변경해도 밥차 횟수 불변", App.Engine.lunchTruckProjectRows(sPair, 5000000).filter(function (r) { return r.id === dB.id; })[0].count, 1);
      sPair.projects = [dA];
      eq("작품 삭제 즉시 감소", App.Money.sumBy(App.Engine.lunchTruckProjectRows(sPair, 5000000), function (r) { return r.count; }), 1);

      var restoredLt = App.Store.parseImport(App.Store.exportJson(sOtt));
      eq("JSON 왕복 후 연동 유지", App.Engine.runSimulation(restoredLt).kpis.lunchTruck, 2000000);

      var htmlCmpLt = App.Render.renderView("analysis", sLt, rLt, { analysisTab: "scenarios" });
      assert("비교표 밥차비 하위행", htmlCmpLt.indexOf("밥차비") >= 0);
      assert("비교표 밥차 금액 표시", htmlCmpLt.indexOf("5,000,000원") >= 0);
      assert("비교표 직접비에 밥차 안내", htmlCmpLt.indexOf("프로젝트 직접비") >= 0);
    } catch (e) { fail("밥차 작품연동 예외", e.message || e); }

    try {
      var sAcc = empty();
      sAcc.vehicles = [
        Object.assign(App.Defaults.newVehicle("2026-11"), { name: "하이리무진", monthlyRent: 2000000, monthlyInsurance: 0, deposit: 30000000 }),
        Object.assign(App.Defaults.newVehicle("2027-01"), { name: "일반 스텝 차량", monthlyRent: 800000, monthlyInsurance: 0, deposit: 10000000 })
      ];
      sAcc = App.Defaults.ensureState(sAcc);
      var rAcc = App.Engine.runSimulation(sAcc);
      var vid0 = sAcc.vehicles[0].id;
      var vid1 = sAcc.vehicles[1].id;

      var htmlClosed = App.Render.renderView("simulation", sAcc, rAcc, { simTab: "support" });
      assert("기본 상태에서 차량 섹션 접힘(상세필드 없음)", htmlClosed.indexOf("차량명") < 0);
      assert("기본 상태에서도 요약 헤더는 보임", htmlClosed.indexOf("차량") >= 0 && htmlClosed.indexOf("2대") >= 0);
      assert("접힌 상태에서도 합계 정확", htmlClosed.indexOf("보증금 40,000,000원") >= 0 &&
        htmlClosed.indexOf("렌트 2,800,000원/월") >= 0);

      var htmlSectionOnly = App.Render.renderView("simulation", sAcc, rAcc, {
        simTab: "support", supportOpen: { "vehicles-section": true }
      });
      assert("섹션만 펼치면 차량명 한 줄 요약은 보임", htmlSectionOnly.indexOf("하이리무진") >= 0);
      assert("섹션만 펼쳐도 개별 차량 상세는 접힘", htmlSectionOnly.indexOf("차량명") < 0);
      assert("개별 차량 요약에 렌트/보험 표시", htmlSectionOnly.indexOf("렌트 2,000,000원/월") >= 0);

      var openBoth = {};
      openBoth["vehicles-section"] = true;
      openBoth[vid0] = true;
      openBoth[vid1] = true;
      var htmlBothOpen = App.Render.renderView("simulation", sAcc, rAcc, { simTab: "support", supportOpen: openBoth });
      var detailFieldCount = (htmlBothOpen.match(/data-path="vehicles\.\d+\.name"/g) || []).length;
      eq("두 차량 동시에 독립적으로 펼칠 수 있음", detailFieldCount, 2);

      var openOne = {};
      openOne["vehicles-section"] = true;
      openOne[vid0] = true;
      var htmlOneOpen = App.Render.renderView("simulation", sAcc, rAcc, { simTab: "support", supportOpen: openOne });
      eq("한 차량만 펼치면 상세 필드 1개만",
        (htmlOneOpen.match(/data-path="vehicles\.\d+\.name"/g) || []).length, 1);
      assert("펼친 차량은 계약월 필드도 보임", htmlOneOpen.indexOf("계약 시작월") >= 0);

      sAcc.vehicles[0].monthlyRent = 2500000;
      var rAcc2 = App.Engine.runSimulation(sAcc);
      var htmlUpdated = App.Render.renderView("simulation", sAcc, rAcc2, { simTab: "support" });
      assert("차량 금액 수정시 접힌 요약도 즉시 갱신", htmlUpdated.indexOf("렌트 3,300,000원/월") >= 0);

      assert("계산 로직은 접힘 상태와 무관(Cash Flow 그대로)", rAcc2.kpis.supportSga > rAcc.kpis.supportSga);

      var htmlEmpty = App.Render.renderView("simulation", empty(), App.Engine.runSimulation(empty()), {
        simTab: "support", supportOpen: { "vehicles-section": true }
      });
      assert("차량 없을 때 안내문구", htmlEmpty.indexOf("등록된 차량이 없습니다") >= 0);
      assert("차량 없을 때 0대 요약", htmlEmpty.indexOf("차량") >= 0 && htmlEmpty.indexOf("0대") >= 0);
    } catch (e) { fail("차량 아코디언 예외", e.message || e); }

    try {
      var sPay = empty();
      sPay.profile.startMonth = "2027-01";
      sPay.profile.endMonth = "2027-01";
      sPay.profile.initialCash = 100000000;
      sPay.employees = [{
        id: "ceo-link", name: "대표이사", role: "대표이사",
        monthlySalary: 20000000, include: true, insure: false, meal: false, severance: false
      }, {
        id: "sales-link", name: "영업", role: "영업/본부장",
        monthlySalary: 5000000, include: true, insure: false, meal: false, severance: false
      }, {
        id: "road-link", name: "로드매니저", role: "로드매니저",
        monthlySalary: 3500000, include: true, insure: false, meal: false, severance: false
      }];
      sPay.recurringExpenses = [{
        id: "rent-link", name: "임대료", category: "rent", amount: 1000000,
        startMonth: "2027-01", endMonth: "2027-01", include: true, overrides: {}
      }];
      assert("운영비 복제 컬렉션 없음", sPay.operatingCosts == null && sPay.companyOpex == null &&
        !(sPay.settings && sPay.settings.operatingCosts));
      var rPay1 = App.Engine.runSimulation(sPay);
      eq("인건비는 employees 단일소스", rPay1.months[0].payroll, 28500000);
      eq("반복운영비는 recurringExpenses 단일소스", rPay1.months[0].recurring, 1000000);
      var end1 = rPay1.kpis.endClosing;
      sPay.employees[0].monthlySalary = 25000000;
      var rPay2 = App.Engine.runSimulation(sPay);
      eq("조직 급여 변경이 기간말 현금에 반영", end1 - rPay2.kpis.endClosing, 5000000);
      eq("급여 변경 후 인건비 월액", rPay2.months[0].payroll, 33500000);
      eq("급여 변경이 반복운영비를 건드리지 않음", rPay2.months[0].recurring, 1000000);

      var htmlCostPay = App.Render.renderView("costs", sPay, rPay2, { costTab: "opex" });
      assert("비용 인건비에 조직 직원 표시", htmlCostPay.indexOf("대표자(배우)") >= 0 &&
        htmlCostPay.indexOf("영업 / 영업/본부장") >= 0 && htmlCostPay.indexOf("로드매니저") >= 0);
      assert("비용 인건비 연동 상태", htmlCostPay.indexOf("[조직 설정 연동]") >= 0);
      assert("비용에서 급여 재입력 없음", htmlCostPay.indexOf('data-path="employees.0.monthlySalary"') < 0);
      assert("비용에서 직원 추가 없음", htmlCostPay.indexOf("+ 직원") < 0);
      assert("조직으로 이동 버튼", htmlCostPay.indexOf('data-action="goto-org-staff"') >= 0);
      assert("일반 운영비는 비용에서 수정", htmlCostPay.indexOf('data-path="recurringExpenses.0.name"') >= 0 &&
        htmlCostPay.indexOf('data-path="recurringExpenses.0.category"') >= 0 &&
        htmlCostPay.indexOf('data-path="recurringExpenses.0.amount"') >= 0 &&
        htmlCostPay.indexOf('data-path="recurringExpenses.0.include"') >= 0);

      var htmlOrgPay = App.Render.renderView("simulation", sPay, rPay2, { simTab: "org" });
      assert("조직에서 급여 수정", htmlOrgPay.indexOf('data-path="employees.0.monthlySalary"') >= 0);
      assert("조직에서 직원 추가", htmlOrgPay.indexOf("+ 직원") >= 0);
      assert("조직 탭은 연동 읽기전용이 아님", htmlOrgPay.indexOf("[조직 설정 연동]") < 0);

      var htmlSimPay = App.Render.renderView("simulation", sPay, rPay2, { simTab: "basics" });
      assert("설정 탭에 회사 운영비 없음", htmlSimPay.indexOf(">회사 운영비<") < 0 &&
        htmlSimPay.indexOf('data-tab="opex"') < 0);

      var htmlSupportPay = App.Render.renderView("simulation", sPay, rPay2, { simTab: "support" });
      assert("회사 지원은 원본에서만 수정, 비용 탭엔 연동 배지로 표시", htmlSupportPay.indexOf("회사 지원") >= 0 &&
        htmlCostPay.indexOf("배우 활동지원") >= 0 && htmlCostPay.indexOf("차량비") >= 0);
      assert("지원 항목이 반복운영비에 섞이지 않음", !(sPay.recurringExpenses || []).some(function (item) {
        return /차량|밥차|연기수업|주유/.test(item.name || "");
      }));
    } catch (e) { fail("운영비 단일소스·인건비 연동 예외", e.message || e); }

    try {
      var retiredNames = ["차량렌트_9575", "차량렌트_7653", "영업 인력 차량", "물적인프라사용료", "주유비 및 차량유지비", "전기요금", "인터넷 사용료", "사무실 청소비", "수도요금", "재무 아웃소싱", "마케팅 아웃소싱", "고문료"];
      var keptNames = [
        "임대료(2층)", "임직원 보험",
        "법인카드(직원)", "법인카드(대표)", "교통비", "통신요금", "세무사 기장료", "접대비", "기타 잡비"
      ];
      var seedRet = App.Sample.load();
      var seedRecNames = seedRet.recurringExpenses.map(function (r) { return r.name; });
      retiredNames.forEach(function (name) {
        assert("신규 시드에 없음: " + name, seedRecNames.indexOf(name) < 0);
      });
      keptNames.forEach(function (name) {
        assert("신규 시드에 유지됨: " + name, seedRecNames.indexOf(name) >= 0);
      });

      var legacyOpex = empty();
      legacyOpex.profile.startMonth = "2027-01";
      legacyOpex.profile.endMonth = "2027-01";
      legacyOpex.recurringExpenses = [
        { id: "r1", name: "임대료(2층)", category: "rent", amount: 500000, startMonth: "2027-01", endMonth: "2027-01", include: true, overrides: {} },
        { id: "r2", name: "차량렌트_9575", category: "vehicle", amount: 2000000, startMonth: "2027-01", endMonth: "2027-01", include: true, overrides: {} },
        { id: "r4", name: "물적인프라사용료", category: "rent", amount: 200000, startMonth: "2027-01", endMonth: "2027-01", include: true, overrides: {} },
        { id: "r5", name: "전기요금", category: "sga", amount: 100000, startMonth: "2027-01", endMonth: "2027-01", include: true, overrides: {} },
        { id: "r6", name: "인터넷 사용료", category: "sga", amount: 50000, startMonth: "2027-01", endMonth: "2027-01", include: true, overrides: {} },
        { id: "r3", name: "재무 아웃소싱", category: "admin", amount: 5000000, startMonth: "2027-01", endMonth: "2027-01", include: true, overrides: {} }
      ];
      var migratedOpex = App.Defaults.ensureState(JSON.parse(JSON.stringify(legacyOpex)));
      eq("기존 저장데이터에서 포함/퇴역 항목 제거", migratedOpex.recurringExpenses.length, 1);
      eq("남은 항목은 임대료(2층)", migratedOpex.recurringExpenses[0].name, "임대료(2층)");

      var reNormalized = App.Defaults.ensureState(JSON.parse(JSON.stringify(migratedOpex)));
      eq("재정규화해도 다시 생성되지 않음", reNormalized.recurringExpenses.length, 1);

      var afterEnsure = App.Defaults.ensureState(JSON.parse(JSON.stringify(legacyOpex)));
      var runAfter = App.Engine.runSimulation(afterEnsure);
      eq("제거 후 판관비/Cash Flow에 임대료만 남음", runAfter.months[0].recurring, 500000);
      assert("제거 후 ghost cost 없음", !ledgerItem(ledgerGroup(runAfter, "opex-sga"), "차량렌트_9575") &&
        !ledgerItem(ledgerGroup(runAfter, "opex-sga"), "물적인프라사용료") &&
        !ledgerItem(ledgerGroup(runAfter, "opex-sga"), "전기요금") &&
        !ledgerItem(ledgerGroup(runAfter, "opex-sga"), "인터넷 사용료") &&
        !ledgerItem(ledgerGroup(runAfter, "opex-sga"), "재무 아웃소싱"));

      var sampleForCosts = App.Sample.load();
      var htmlCostOpexTab = App.Render.renderView("costs", sampleForCosts, App.Engine.runSimulation(sampleForCosts), { costTab: "opex" });
      retiredNames.forEach(function (name) {
        assert("비용 운영비에 표시 안 됨: " + name, htmlCostOpexTab.indexOf(name) < 0);
      });
      assert("비용 운영비에 임대료는 그대로", htmlCostOpexTab.indexOf("임대료") >= 0);
      assert("운영비 임대료 행은 정보 탭과 연동 표시", htmlCostOpexTab.indexOf("임대료 탭 연동") >= 0 &&
        htmlCostOpexTab.indexOf("임대료(2층) 탭 보기") >= 0);
      assert("비용 운영비에서 반복항목 수정 가능", htmlCostOpexTab.indexOf('data-path="recurringExpenses.') >= 0);
      var htmlRent2fTab = App.Render.renderView("costs", sampleForCosts, App.Engine.runSimulation(sampleForCosts), { costTab: "rent2f" });
      assert("임대료 탭은 자산 탭 앞에 있음",
        htmlRent2fTab.indexOf('data-tab="startup"') < htmlRent2fTab.indexOf('data-tab="rent2f"') &&
        htmlRent2fTab.indexOf('data-tab="rent2f"') < htmlRent2fTab.indexOf('data-tab="funding"'));
      assert("임대료 탭 제목과 월액 표시", htmlRent2fTab.indexOf("임대료(2층)") >= 0 &&
        htmlRent2fTab.indexOf('value="500,000"') >= 0 && htmlRent2fTab.indexOf("/ 월") >= 0);
      assert("임대료 탭은 운영비 임대료 행과 연동", htmlRent2fTab.indexOf("운영비") >= 0 &&
        htmlRent2fTab.indexOf("판관비") >= 0 && htmlRent2fTab.indexOf("임대료(2층)") >= 0);
      assert("임대료 탭 설명 표시", htmlRent2fTab.indexOf("아래 항목은 별도 비용으로 계산되지 않습니다") >= 0);
      assert("임대료 포함 항목 표시", htmlRent2fTab.indexOf("더존 위하고") >= 0 &&
        htmlRent2fTab.indexOf("인터넷 사용료") >= 0 &&
        htmlRent2fTab.indexOf("소회의실 사용") >= 0);
      assert("임대료 포함 항목은 기본정보형 목록", htmlRent2fTab.indexOf("rent-facts") >= 0 &&
        (htmlRent2fTab.match(/>포함</g) || []).length >= 20);
      assert("임대료 서브탭 분리", htmlRent2fTab.indexOf('data-action="rent2f-tab"') >= 0 &&
        htmlRent2fTab.indexOf('data-tab="included"') >= 0 &&
        htmlRent2fTab.indexOf('data-tab="comps"') >= 0);
      assert("포함 내역 탭에는 비교군 그림 없음", htmlRent2fTab.indexOf("assets/rent-comparables/") < 0);
      var htmlRent2fComps = App.Render.renderView("costs", sampleForCosts, App.Engine.runSimulation(sampleForCosts), { costTab: "rent2f", rent2fTab: "comps" });
      assert("임대료 탭 시장 비교군", htmlRent2fComps.indexOf("시장 비교군") >= 0 &&
        htmlRent2fComps.indexOf("assets/rent-comparables/shared-office.png") >= 0 &&
        htmlRent2fComps.indexOf("반포동 일반상가") >= 0 &&
        htmlRent2fComps.indexOf("잠원동 일반상가") >= 0 &&
        htmlRent2fComps.indexOf("서초동 일반상가") >= 0);
      assert("시장 비교군 탭에는 포함 목록 없음", htmlRent2fComps.indexOf("더존 위하고") < 0 &&
        htmlRent2fComps.indexOf("rent-facts") < 0);
      var rent2fSrcIdx = sampleForCosts.recurringExpenses.map(function (r) { return r.name; }).indexOf("임대료(2층)");
      assert("임대료 정보 탭 금액이 운영비 항목과 같은 data-path로 입력 가능", rent2fSrcIdx >= 0 &&
        htmlRent2fTab.indexOf('data-path="recurringExpenses.' + rent2fSrcIdx + '.amount"') >= 0);
      var htmlSimNoOpex = App.Render.renderView("simulation", App.Sample.load(), App.Engine.runSimulation(App.Sample.load()), { simTab: "opex" });
      assert("구 회사 운영비 탭은 기본 설정으로 폴백", htmlSimNoOpex.indexOf("회사 운영비 (판관비)") < 0);
      assert("구 탭 폴백 후에도 기본 설정 보임", htmlSimNoOpex.indexOf("시뮬레이션 기간") >= 0);
    } catch (e) { fail("회사 운영비 항목 제거 예외", e.message || e); }

    try {
      var sTaxLink = empty();
      sTaxLink.profile.startMonth = "2027-01";
      sTaxLink.profile.endMonth = "2027-01";
      var pTaxLink = App.Defaults.newProject("2027-01", "drama");
      pTaxLink.status = "confirmed";
      pTaxLink.contractAmount = 1000000000;
      pTaxLink.payments = [Object.assign(App.Defaults.newPayment("2027-01"), { amount: 1000000000, inputMode: "amount" })];
      sTaxLink.projects = [pTaxLink];
      sTaxLink = App.Defaults.ensureState(sTaxLink);
      eq("기존 회사 전속 개인세금 기본값은 자동계산", sTaxLink.settings.scenarios.exclusiveContract.personalTax.mode, "auto");

      var rTaxLink = App.Engine.runSimulation(sTaxLink);
      var cmpTaxLink = App.Engine.runScenarioComparison(sTaxLink, rTaxLink);
      var ex1 = cmpTaxLink.scenarios.exclusiveContract;
      assert("자동 모드에서 종합소득세 0원 아님", ex1.incomeTax > 0);

      var htmlTaxTab = App.Render.renderView("simulation", sTaxLink, rTaxLink, { simTab: "tax" });
      assert("세금 탭에 배우 귀속소득 요약", htmlTaxTab.indexOf("배우 귀속소득") >= 0);
      assert("세금 탭에 과세표준 요약", htmlTaxTab.indexOf("과세표준") >= 0);
      assert("세금 탭에 세후 배우 실수령 요약", htmlTaxTab.indexOf("세후 배우 실수령") >= 0);
      assert("세금 탭 귀속소득 금액 표시", htmlTaxTab.indexOf(App.Format.formatWon(ex1.actorGrossIncome)) >= 0);
      assert("세금 탭 세후실수령 금액이 시나리오 비교와 동일", htmlTaxTab.indexOf(App.Format.formatWon(ex1.actorNetIncome)) >= 0);

      var htmlAnalysisCmp = App.Render.renderView("analysis", sTaxLink, rTaxLink, { analysisTab: "scenarios" });
      assert("분석 탭 시나리오비교에도 같은 세후실수령", htmlAnalysisCmp.indexOf(App.Format.formatWon(ex1.actorNetIncome)) >= 0);

      sTaxLink.settings.scenarios.exclusiveContract.actorShareRate = 0.5;
      sTaxLink.settings.scenarios.exclusiveContract.companyShareRate = 0.5;
      var rTaxLink2 = App.Engine.runSimulation(sTaxLink);
      var cmpTaxLink2 = App.Engine.runScenarioComparison(sTaxLink, rTaxLink2);
      var ex2 = cmpTaxLink2.scenarios.exclusiveContract;
      assert("배분율 변경시 귀속소득 자동 변경", ex2.actorGrossIncome !== ex1.actorGrossIncome);
      assert("배분율 변경시 종합소득세도 자동 재계산", ex2.incomeTax !== ex1.incomeTax);
      assert("배분율 변경시 세후실수령도 자동 재계산", ex2.actorNetIncome !== ex1.actorNetIncome);

      sTaxLink.settings.scenarios.exclusiveContract.personalTax.mode = "manual";
      sTaxLink.settings.scenarios.exclusiveContract.personalTax.manualTaxAmount = 50000000;
      var cmpManual = App.Engine.runScenarioComparison(sTaxLink, App.Engine.runSimulation(sTaxLink));
      eq("수동 모드 선택시 수동 세액 우선", cmpManual.scenarios.exclusiveContract.personalTax, 50000000);

      sTaxLink.settings.scenarios.exclusiveContract.personalTax.mode = "auto";
      sTaxLink.settings.scenarios.exclusiveContract.personalTax.incomeDeduction = 20000000;
      var cmpDeduct = App.Engine.runScenarioComparison(sTaxLink, App.Engine.runSimulation(sTaxLink));
      assert("종소세 계산기 소득공제 수정시 시나리오 세금도 반영",
        cmpDeduct.scenarios.exclusiveContract.incomeTax < cmpTaxLink2.scenarios.exclusiveContract.incomeTax);

      var soloScn = cmpTaxLink.scenarios.soloAgency;
      assert("1인 기획사는 별도 구조(법인세+대표급여) 유지", soloScn.corporateTax >= 0 && soloScn.corporatePreTaxProfit !== undefined);
      assert("두 시나리오 귀속소득 서로 다른 소스", soloScn.actorGrossIncome !== ex1.actorGrossIncome ||
        soloScn.personalTaxDetail.incomeType !== ex1.personalTaxDetail.incomeType);
    } catch (e) { fail("기존 회사 전속 종소세 연결 예외", e.message || e); }

    try {
      var sRev = empty();
      sRev.profile.startMonth = "2026-09";
      sRev.profile.endMonth = "2027-09";
      sRev.revenueFees = [];
      var pHaremPay = App.Defaults.newProject("2026-09", "drama");
      pHaremPay.name = "하렘의 남자들";
      pHaremPay.status = "confirmed";
      pHaremPay.contractAmount = 800000000;
      pHaremPay.shootStartMonth = "2026-09";
      pHaremPay.shootEndMonth = "2026-12";
      pHaremPay.expenseInclude = false;
      pHaremPay.payments = [
        Object.assign(App.Defaults.newPayment("2026-11"), { amount: 400000000, inputMode: "amount", label: "계약금" }),
        Object.assign(App.Defaults.newPayment("2027-01"), { amount: 320000000, inputMode: "amount", label: "중도금" }),
        Object.assign(App.Defaults.newPayment("2027-04"), { amount: 80000000, inputMode: "amount", label: "잔금" })
      ];
      sRev.projects = [pHaremPay];
      var rRev = App.Engine.runSimulation(sRev);
      eq("지급일정 11월 4억", monthRow(rRev, "2026-11").inflow, 400000000);
      eq("촬영기간 9월은 수입 0(균등배분 안 함)", monthRow(rRev, "2026-09").inflow, 0);
      eq("촬영기간 12월은 수입 0", monthRow(rRev, "2026-12").inflow, 0);
      eq("지급일정 1월 3.2억", monthRow(rRev, "2027-01").inflow, 320000000);
      eq("지급일정 4월 8천만", monthRow(rRev, "2027-04").inflow, 80000000);
      var haremLedger = ledgerItem(ledgerGroup(rRev, "revenue-work"), "하렘의 남자들");
      eq("월별 분석 TOTAL=지급 합계", haremLedger.total, 800000000);
      eq("월별 분석 11월 셀", haremLedger.values["2026-11"], 400000000);
      eq("월별 분석 9월 셀 0", haremLedger.values["2026-09"], 0);

      pHaremPay.payments.push(Object.assign(App.Defaults.newPayment("2027-04"), {
        amount: 50000000, inputMode: "amount", label: "추가"
      }));
      var rSameMonth = App.Engine.runSimulation(sRev);
      eq("같은 달 지급은 합산", monthRow(rSameMonth, "2027-04").inflow, 130000000);
      pHaremPay.payments.pop();

      pHaremPay.payments[2].expectedMonth = "2027-05";
      var rMoved = App.Engine.runSimulation(sRev);
      eq("지급월 이동 후 4월 제거", monthRow(rMoved, "2027-04").inflow, 0);
      eq("지급월 이동 후 5월 추가", monthRow(rMoved, "2027-05").inflow, 80000000);
      pHaremPay.payments[2].expectedMonth = "2027-04";
      pHaremPay.payments.splice(1, 1);
      var rDeleted = App.Engine.runSimulation(sRev);
      eq("지급 삭제 후 1월 제거", monthRow(rDeleted, "2027-01").inflow, 0);
      eq("지급 삭제 후 11월 유지", monthRow(rDeleted, "2026-11").inflow, 400000000);
      eq("지급 삭제 후 TOTAL 감소", ledgerItem(ledgerGroup(rDeleted, "revenue-work"), "하렘의 남자들").total, 480000000);

      var pPic = App.Defaults.newProject("2027-03", "pictorial");
      pPic.name = "유가화보 B";
      pPic.status = "confirmed";
      pPic.contractAmount = 50000000;
      pPic.shootStartMonth = "2027-03";
      pPic.shootEndMonth = "2027-03";
      pPic.payments = [];
      pPic.expenseInclude = false;
      var pEvt = App.Defaults.newProject("2027-06", "event");
      pEvt.name = "브랜드 행사 A";
      pEvt.status = "confirmed";
      pEvt.contractAmount = 80000000;
      pEvt.shootStartMonth = "2027-06";
      pEvt.payments = [];
      pEvt.expenseInclude = false;
      var pSeedPay = App.Defaults.newProject("2027-02", "seeding");
      pSeedPay.name = "제품 시딩";
      pSeedPay.status = "confirmed";
      pSeedPay.contractAmount = 15000000;
      pSeedPay.shootStartMonth = "2027-02";
      pSeedPay.payments = [];
      pSeedPay.expenseInclude = false;
      var sZeroPay = empty();
      sZeroPay.profile.startMonth = "2026-11";
      sZeroPay.profile.endMonth = "2027-09";
      sZeroPay.revenueFees = [];
      sZeroPay.projects = [pPic, pEvt, pSeedPay];
      var rZeroPay = App.Engine.runSimulation(sZeroPay);
      eq("유가화보 B 미설정→발생월", monthRow(rZeroPay, "2027-03").inflow, 50000000);
      eq("브랜드 행사 A 미설정→발생월", monthRow(rZeroPay, "2027-06").inflow, 80000000);
      eq("제품 시딩 미설정→발생월", monthRow(rZeroPay, "2027-02").inflow, 15000000);
      eq("유가화보 TOTAL=계약금액", ledgerItem(ledgerGroup(rZeroPay, "revenue-sales"), "유가화보 B").total, 50000000);
      eq("행사 TOTAL=계약금액", ledgerItem(ledgerGroup(rZeroPay, "revenue-sales"), "브랜드 행사 A").total, 80000000);
      eq("시딩 TOTAL=계약금액", ledgerItem(ledgerGroup(rZeroPay, "revenue-sales"), "제품 시딩").total, 15000000);

      var pFmt = App.Defaults.newProject("2027-04", "drama");
      pFmt.name = "월포맷";
      pFmt.status = "confirmed";
      pFmt.contractAmount = 100000000;
      pFmt.expenseInclude = false;
      pFmt.payments = [Object.assign(App.Defaults.newPayment("2027-04"), {
        amount: 100000000, inputMode: "amount", expectedMonth: "2027-4"
      })];
      var sFmt = empty();
      sFmt.profile.startMonth = "2027-01";
      sFmt.profile.endMonth = "2027-12";
      sFmt.revenueFees = [];
      sFmt.projects = [pFmt];
      eq("YYYY-M 입금월도 해당 월 반영", monthRow(App.Engine.runSimulation(sFmt), "2027-04").inflow, 100000000);

      var sWarnPay = empty();
      var pWarnPay = App.Defaults.newProject();
      pWarnPay.name = "불일치";
      pWarnPay.status = "confirmed";
      pWarnPay.contractAmount = 100000000;
      pWarnPay.payments = [Object.assign(App.Defaults.newPayment("2027-01"), {
        amount: 70000000, inputMode: "amount"
      })];
      sWarnPay.projects = [pWarnPay];
      var rWarnPay = App.Engine.runSimulation(sWarnPay);
      assert("불일치 경고 문구", (rWarnPay.warnings || []).some(function (w) {
        return String(w.message).indexOf("지급 일정 합계가 계약금액과 일치하지 않습니다") >= 0;
      }));
      eq("불일치여도 계산은 막지 않음", rWarnPay.kpis.inflowInPeriod, 70000000);
      var gapWarn = rWarnPay.revenueGap || App.Engine.explainRevenueGap(sWarnPay);
      eq("검산 등록=계약", gapWarn.registered, 100000000);
      eq("검산 기간입금=지급합계", gapWarn.inPeriod, 70000000);
      eq("검산 차이=부족분", gapWarn.gap, 30000000);
      assert("검산 payment_short", (gapWarn.items || []).some(function (it) {
        return (it.issues || []).some(function (issue) { return issue.code === "payment_short"; });
      }));
      var warnOpen = {};
      warnOpen[pWarnPay.id] = true;
      var htmlWarnPay = App.Render.renderView("revenue", sWarnPay, rWarnPay, { workItemOpen: warnOpen });
      assert("수익화면 불일치 안내", htmlWarnPay.indexOf("지급 일정 합계가 계약금액과 일치하지 않습니다") >= 0);
      assert("수익 지급열 부족 표시", htmlWarnPay.indexOf("부족") >= 0);
      assert("수익 사이드바 기간입금 검산", htmlWarnPay.indexOf("기간 내 입금") >= 0);

      var pAdGap = App.Defaults.newProject();
      pAdGap.name = "광고A";
      pAdGap.category = "ad";
      pAdGap.status = "confirmed";
      pAdGap.contractAmount = 300000000;
      pAdGap.expenseInclude = false;
      pAdGap.payments = [
        Object.assign(App.Defaults.newPayment("2027-01"), { amount: 60000000, inputMode: "amount" }),
        Object.assign(App.Defaults.newPayment("2027-03"), { amount: 60000000, inputMode: "amount" })
      ];
      var sAdGap = empty();
      sAdGap.profile.startMonth = "2026-11";
      sAdGap.profile.endMonth = "2027-09";
      sAdGap.revenueFees = [];
      sAdGap.projects = [pAdGap];
      var rAdGap = App.Engine.runSimulation(sAdGap);
      eq("광고A 기간입금=1.2억", rAdGap.kpis.inflowInPeriod, 120000000);
      eq("광고A 검산 차이=1.8억", rAdGap.revenueGap.gap, 180000000);
      assert("광고A short 이슈", rAdGap.revenueGap.items.some(function (it) {
        return it.name === "광고A" && it.issues.some(function (issue) { return issue.code === "payment_short"; });
      }));
      var htmlAdRev = App.Render.renderView("revenue", sAdGap, rAdGap, {});
      assert("광고A 지급열 1.8억 부족", htmlAdRev.indexOf("180,000,000원") >= 0);
      var htmlAdAn = App.Render.renderView("analysis", sAdGap, rAdGap, { analysisTab: "monthly" });
      assert("월별 검산 배너", htmlAdAn.indexOf("등록 계약금액") >= 0);
      assert("월별 TOTAL 부족 메모", htmlAdAn.indexOf("지급 부족") >= 0);

      var pFbGap = App.Defaults.newProject();
      pFbGap.name = "시딩";
      pFbGap.category = "seeding";
      pFbGap.status = "confirmed";
      pFbGap.contractAmount = 50000000;
      pFbGap.shootStartMonth = "2027-04";
      pFbGap.payments = [];
      pFbGap.expenseInclude = false;
      var sFbGap = empty();
      sFbGap.revenueFees = [];
      sFbGap.projects = [pFbGap];
      var rFbGap = App.Engine.runSimulation(sFbGap);
      eq("발생월 폴백은 기간입금=계약", rFbGap.kpis.inflowInPeriod, 50000000);
      eq("발생월 폴백은 차이 0", rFbGap.revenueGap.gap, 0);
      assert("발생월 폴백은 short 아님", !(rFbGap.revenueGap.items || []).some(function (it) {
        return (it.issues || []).some(function (issue) { return issue.code === "payment_short"; });
      }));
      var htmlFbRev = App.Render.renderView("revenue", sFbGap, rFbGap, {});
      assert("발생월 폴백은 검산배너 없음", htmlFbRev.indexOf("등록 매출과 기간 입금이 다릅니다") < 0);

      var htmlEmptyPay = App.Render.renderView("revenue", sZeroPay, rZeroPay, { workItemOpen: {} });
      assert("지급 미설정 안내", htmlEmptyPay.indexOf("지급일정이 없으면") >= 0);

      eq("시드 기말 현금 불변", App.Engine.runSimulation(App.Sample.load()).kpis.endClosing, 1204738995);
      eq("시드 검산 차이 0", App.Engine.runSimulation(App.Sample.load()).revenueGap.gap, 0);
    } catch (e) { fail("지급일정-월별분석 연동 예외", e.message || e); }

    try {
      var sCopy = empty();
      sCopy.profile.startMonth = "2026-10";
      sCopy.profile.endMonth = "2027-12";
      sCopy.revenueFees = [];
      var pCopySrc = App.Defaults.newProject("2026-10", "drama");
      pCopySrc.name = "하렘의 남자들";
      pCopySrc.status = "confirmed";
      pCopySrc.episodes = 16;
      pCopySrc.feePerEpisode = 50000000;
      pCopySrc.contractAmount = 800000000;
      pCopySrc.shootStartMonth = "2026-10";
      pCopySrc.shootEndMonth = "2027-04";
      pCopySrc.expenseInclude = false;
      pCopySrc.payments = [
        Object.assign(App.Defaults.newPayment("2026-10"), { amount: 800000000, inputMode: "amount", label: "계약금" })
      ];
      var srcPayId = pCopySrc.payments[0].id;
      sCopy.projects = [pCopySrc];
      var rCopyBefore = App.Engine.runSimulation(sCopy);
      var beforeRev = rCopyBefore.kpis.revenue;
      eq("복사 전 매출 8억", beforeRev, 800000000);

      var htmlCopyBtn = App.Render.renderView("revenue", sCopy, rCopyBefore, {});
      assert("수익 행 수정 버튼", htmlCopyBtn.indexOf('data-action="edit-project"') >= 0);
      assert("수익 행 복사 버튼", htmlCopyBtn.indexOf('data-action="copy-project"') >= 0);
      assert("수익 행 삭제 버튼", htmlCopyBtn.indexOf('data-action="remove-project"') >= 0);
      assert("수정-복사-삭제 순서", htmlCopyBtn.indexOf("edit-project") < htmlCopyBtn.indexOf("copy-project") &&
        htmlCopyBtn.indexOf("copy-project") < htmlCopyBtn.indexOf("remove-project"));
      assert("행 버튼은 summary 안에", /<summary[\s\S]*data-action="edit-project"[\s\S]*data-action="copy-project"[\s\S]*data-action="remove-project"[\s\S]*<\/summary>/.test(htmlCopyBtn));

      var cloned = App.Defaults.cloneRevenueItem(pCopySrc);
      assert("복사본 새 id", cloned.id && cloned.id !== pCopySrc.id);
      assert("지급 id도 새로 생성", cloned.payments[0].id && cloned.payments[0].id !== srcPayId);
      eq("원본 지급 id 불변", pCopySrc.payments[0].id, srcPayId);
      eq("복사본 이름", cloned.name, "하렘의 남자들 복사본");
      eq("복사본 기간 시작 유지", cloned.shootStartMonth, "2026-10");
      eq("복사본 기간 종료 유지", cloned.shootEndMonth, "2027-04");
      eq("복사본 회차 유지", cloned.episodes, 16);
      eq("복사본 금액 유지", App.Engine.projectContractAmount(cloned), 800000000);

      cloned.payments[0].amount = 1;
      eq("복사본 수정이 원본 지급에 영향 없음", pCopySrc.payments[0].amount, 800000000);
      cloned.payments[0].amount = 800000000;

      var htmlDraft = App.Render.renderView("revenue", sCopy, rCopyBefore, {
        revenueDraft: cloned,
        revenueDraftSourceId: pCopySrc.id
      });
      assert("draft 이름 표시", htmlDraft.indexOf("하렘의 남자들 복사본") >= 0);
      assert("draft 저장 버튼", htmlDraft.indexOf("save-revenue-draft") >= 0);
      assert("draft 취소 버튼", htmlDraft.indexOf("cancel-revenue-draft") >= 0);
      assert("draft 중 우측 패널에 복사본 없음", htmlDraft.indexOf("setup-side") >= 0 &&
        htmlDraft.slice(htmlDraft.indexOf("setup-side")).indexOf("하렘의 남자들 복사본") < 0);
      eq("draft 중 엔진 매출 불변", App.Engine.runSimulation(sCopy).kpis.revenue, beforeRev);
      eq("draft 중 원본만 유지", sCopy.projects.length, 1);

      var cancelledDraft = App.Defaults.cloneRevenueItem(pCopySrc);
      eq("취소 시나리오도 매출 불변", App.Engine.runSimulation(sCopy).kpis.revenue, beforeRev);
      assert("취소 후 원본만", sCopy.projects.length === 1 && !sCopy.projects.some(function (p) {
        return p.id === cancelledDraft.id;
      }));

      cloned.name = "하렘의 남자들 시즌2";
      sCopy.projects.push(cloned);
      var rCopySaved = App.Engine.runSimulation(sCopy);
      eq("CASE A 제목만 변경 후 매출 +8억", rCopySaved.kpis.revenue, 1600000000);
      var htmlSaved = App.Render.renderView("revenue", sCopy, rCopySaved, {});
      assert("저장 후 우측 패널 복사본", htmlSaved.indexOf("setup-side") >= 0 &&
        htmlSaved.slice(htmlSaved.indexOf("setup-side")).indexOf("하렘의 남자들 시즌2") >= 0);
      assert("작품 소계 반영", htmlSaved.indexOf("작품 소계") >= 0);

      cloned.feePerEpisode = 31250000;
      cloned.contractAmount = App.Engine.projectContractAmount(cloned);
      cloned.payments[0].amount = cloned.contractAmount;
      var rCopyCut = App.Engine.runSimulation(sCopy);
      eq("CASE C 5억만 추가", rCopyCut.kpis.revenue, 800000000 + 500000000);

      cloned.payments[0].expectedMonth = "2027-06";
      cloned.shootStartMonth = "2027-06";
      cloned.shootEndMonth = "2027-08";
      var rCopyMoved = App.Engine.runSimulation(sCopy);
      eq("CASE D 원본 10월 입금 유지", monthRow(rCopyMoved, "2026-10").inflow, 800000000);
      eq("CASE D 새 기간 6월 입금", monthRow(rCopyMoved, "2027-06").inflow, 500000000);
      eq("CASE E 원본 이름 불변", pCopySrc.name, "하렘의 남자들");
      eq("CASE E 원본 금액 불변", App.Engine.projectContractAmount(pCopySrc), 800000000);
      eq("CASE E 원본 기간 불변", pCopySrc.shootStartMonth, "2026-10");

      var jsonCopy = App.Store.exportJson(sCopy);
      var restoredCopy = App.Store.parseImport(jsonCopy);
      eq("CASE F 복원 건수", restoredCopy.projects.length, 2);
      assert("CASE F 원본 유지", restoredCopy.projects.some(function (p) { return p.name === "하렘의 남자들"; }));
      assert("CASE F 복사본 유지", restoredCopy.projects.some(function (p) { return p.name === "하렘의 남자들 시즌2"; }));
      assert("CASE F id 서로 다름", restoredCopy.projects[0].id !== restoredCopy.projects[1].id);
      eq("CASE F 복원 매출", App.Engine.runSimulation(restoredCopy).kpis.revenue, rCopyMoved.kpis.revenue);

      var pAdCopy = App.Defaults.newProject("2027-01", "ad");
      pAdCopy.name = "광고 캠페인";
      pAdCopy.contractAmount = 100000000;
      var adClone = App.Defaults.cloneRevenueItem(pAdCopy);
      eq("광고도 복사 가능", adClone.category, "ad");
      eq("광고 복사본 이름", adClone.name, "광고 캠페인 복사본");
      assert("광고 복사본 새 id", adClone.id !== pAdCopy.id);
    } catch (e) { fail("수익 복사 예외", e.message || e); }

    try {
      assert("판관비 하위 분류 parent=sga", (App.OpexGroups || []).every(function (g) { return g.parent === "sga"; }));
      eq("sga 카테고리 라벨은 판관비", (App.OpexGroups || []).filter(function (g) { return g.id === "sga"; })[0].label, "판관비");
      assert("rent 카테고리는 제거", !(App.OpexGroups || []).some(function (g) { return g.id === "rent"; }));

      var seedSga = App.Sample.load();
      var beforeSga = App.Engine.runSimulation(seedSga);
      App.Defaults.ensureState(seedSga);
      var afterSga = App.Engine.runSimulation(seedSga);
      eq("판관비 재분류 후 기말 불변", afterSga.kpis.endClosing, 1204738995);
      eq("판관비 재분류 후 운영비 KPI 불변", afterSga.kpis.opex, beforeSga.kpis.opex);
      eq("판관비 재분류 후 손익비용 불변", afterSga.kpis.pnlExpense, beforeSga.kpis.pnlExpense);
      assert("인건비 family=sga", (seedSga.employees || []).every(function (e) { return e.family === "sga"; }));
      assert("반복운영비 family=sga", (seedSga.recurringExpenses || []).every(function (e) { return e.family === "sga"; }));
      assert("임대료(2층)는 판관비 category", seedSga.recurringExpenses.some(function (e) {
        return e.name === "임대료(2층)" && e.category === "sga";
      }));

      var jsonSga = App.Store.exportJson(seedSga);
      var restoredSga = App.Store.parseImport(jsonSga);
      eq("JSON 왕복 기말 불변", App.Engine.runSimulation(restoredSga).kpis.endClosing, 1204738995);
      assert("JSON 왕복 family 유지", restoredSga.employees[0].family === "sga");

      var payGroup = ledgerGroup(afterSga, "payroll");
      var insGroup = ledgerGroup(afterSga, "insurance");
      var parentGroup = ledgerGroup(afterSga, "opex-sga-parent");
      assert("원장 인건비 그룹 유지", !!payGroup);
      assert("원장 판관비 합계 그룹", !!parentGroup && parentGroup.summaryOnly);
      eq("원장 인건비 parentLabel", payGroup.parentLabel, "판관비");
      var sgaChildGroupIds = {
        payroll: true, insurance: true, "opex-rent": true, "opex-sga": true, "opex-marketing": true,
        welfare: true, "support-vehicle": true, "support-actor": true, "opex-onetime": true,
        startup: true
      };
      var childTotal = 0;
      afterSga.ledger.groups.forEach(function (g) {
        if (sgaChildGroupIds[g.id]) childTotal += g.subtotal.total;
      });
      eq("판관비 합계=하위 합(중복 없음)", parentGroup.subtotal.total, childTotal);
      eq("원장 지출 TOTAL=-pnlExpense", ledgerResult(afterSga, "expenseTotal").total, -afterSga.kpis.pnlExpense);

      var htmlSga = App.Render.renderView("costs", seedSga, afterSga, {
        costTab: "opex",
        costSecOpen: { "sga-parent": true, "recurring-sga": true },
        costItemOpen: {}
      });
      assert("판관비 대분류", htmlSga.indexOf('data-cost-sec="sga-parent"') >= 0);
      assert("인건비가 판관비 안에", htmlSga.indexOf('data-cost-sec="sga-parent"') < htmlSga.indexOf('data-cost-sec="payroll"'));
      assert("임대료는 판관비 하위 별도 행", htmlSga.indexOf("임대료(2층)") >= 0 && htmlSga.indexOf('data-cost-sec="recurring-rent"') >= 0);
      assert("판관비 일반 판관비 그룹", htmlSga.indexOf('data-cost-sec="recurring-sga"') >= 0);
      assert("인건비 연동 유지", htmlSga.indexOf("조직 설정 연동") >= 0);
      assert("판관비 합계는 월 금액", /판관비 합계<\/span><span class="cost-amt"><b>[^<]+원<\/b><\/span><span class="cost-unit">월<\/span>/.test(htmlSga));
      assert("운영비 중간 합계 숨김", htmlSga.indexOf("반복비용 합계") < 0 &&
        htmlSga.indexOf("일회성 비용 합계") < 0 && htmlSga.indexOf("일회성 판관비") < 0);
      assert("하위 + 항목 유지", htmlSga.indexOf('data-action="add-recurring"') >= 0);
      assert("차량비·배우 활동지원은 판관비 안", htmlSga.indexOf('data-cost-sec="support-vehicle"') >= 0 &&
        htmlSga.indexOf('data-cost-sec="support-actor"') >= 0 &&
        htmlSga.indexOf('data-cost-sec="sga-parent"') < htmlSga.indexOf('data-cost-sec="support-vehicle"'));
      assert("복리후생비는 판관비 안, 식대 대분류 없음", htmlSga.indexOf('data-cost-sec="welfare"') >= 0 &&
        htmlSga.indexOf('data-cost-sec="meal"') < 0);
      assert("배우 활동지원 편집 항목도 7열", htmlSga.indexOf("스타일링비") >= 0 &&
        htmlSga.indexOf("cost-editable-support") < 0 && htmlSga.indexOf('data-action="remove-support-policy"') >= 0 &&
        htmlSga.indexOf(">단위<") >= 0);

      var htmlMonthlySga = App.Render.renderView("analysis", seedSga, afterSga, { analysisTab: "monthly" });
      assert("월별 분석 구분에 판관비", htmlMonthlySga.indexOf(">판관비<") >= 0);
      assert("월별 분석 인건비 소계 유지", htmlMonthlySga.indexOf("인건비 소계") >= 0);
    } catch (e) { fail("판관비 계층 재분류 예외", e.message || e); }

    try {
      var seedFold = App.Sample.load();
      var rFold = App.Engine.runSimulation(seedFold);
      var startMonth = rFold.months[0] && rFold.months[0].month;
      var nextMonth = App.Month.addMonths(startMonth, 1);
      eq("원장 접기 후 기말 불변", App.Engine.runSimulation(App.Sample.load()).kpis.endClosing, rFold.kpis.endClosing);
      assert("시작월 초기비용 발생", monthRow(rFold, startMonth).startupCost > 0);
      eq("시작월 다음달 초기비용 0", monthRow(rFold, nextMonth).startupCost, 0);
      assert("시작월 보증금 발생", monthRow(rFold, startMonth).deposits > 0);
      var htmlFold = App.Render.renderView("analysis", seedFold, rFold, { analysisTab: "monthly" });
      assert("초기비용 소계 접기", htmlFold.indexOf('data-action="toggle-ledger-group"') >= 0 &&
        htmlFold.indexOf('data-group="startup"') >= 0);
      assert("보증금 소계 접기", htmlFold.indexOf('data-group="funding"') >= 0);
      assert("초기비용 소계는 보임", htmlFold.indexOf("초기비용 소계") >= 0);
      assert("보증금 이동은 보임", htmlFold.indexOf("자산·보증금 이동") >= 0);
      assert("초기비용 세목 기본 접힘", htmlFold.indexOf('sticky-n">등록면허세') < 0);
      assert("보증금 세목 기본 접힘", htmlFold.indexOf('sticky-n">사무실보증금') < 0);
      var tableFold = htmlFold.slice(htmlFold.indexOf('<table class="ledger'));
      assert("표에서 총 매출이 직접비보다 앞", tableFold.indexOf("총 매출") < tableFold.indexOf("프로젝트 직접비"));
      assert("표에서 매출총이익이 판관비 소계보다 앞", tableFold.indexOf("매출총이익") < tableFold.indexOf("판관비 소계"));
      assert("표에서 영업이익이 보증금보다 앞", tableFold.indexOf(">영업이익<") < tableFold.indexOf("자산·보증금"));
      assert("표에서 영업이익이 현금흐름보다 앞", tableFold.indexOf(">영업이익<") < tableFold.indexOf("현금흐름"));
      assert("표에서 현금흐름이 자산·보증금 이동보다 앞", tableFold.indexOf("현금흐름") < tableFold.indexOf("자산·보증금 이동"));
      assert("표에서 자산·보증금 이동이 월말 자금보다 앞", tableFold.indexOf("자산·보증금 이동") < tableFold.indexOf("월말 자금"));
      assert("하단 자산 중복행 없음", htmlFold.indexOf("자산·보증금·기타입금") < 0 &&
        htmlFold.indexOf("자산·보증금/기타입금") < 0);
      assert("현금증감 행 없음", htmlFold.indexOf("현금증감") < 0);
      assert("월말 자금 행", htmlFold.indexOf("월말 자금") >= 0);
      assert("자산·보증금 이동 행", htmlFold.indexOf("자산·보증금 이동") >= 0);
      assert("법인세 및 주민세 납부 행", htmlFold.indexOf("법인세 및 주민세 납부") >= 0);
      assert("월말 자금 안내", htmlFold.indexOf("아직 안 낸 법인세·주민세") >= 0);
      rFold.months.forEach(function (row, i) {
        eq("cashOut 구성 " + row.month, row.cashOut,
          App.Engine.monthCashOut
            ? App.Engine.monthCashOut(row)
            : App.Money.roundWon(row.pnlExpense + row.deposits + row.capex + row.taxCashOut + (row.vatSettlement || 0) + (row.dividend || 0)));
        eq("월말 자금 공식 " + row.month, row.closing,
          App.Money.roundWon(row.opening + row.inflow + row.otherInflow + (row.vatOutput || 0) - row.cashOut));
        if (i > 0) eq("월초=전월말 " + row.month, row.opening, rFold.months[i - 1].closing);
      });
      var htmlFoldOpen = App.Render.renderView("analysis", seedFold, rFold, {
        analysisTab: "monthly",
        ledgerOpen: { startup: true, funding: true }
      });
      assert("펼치면 초기비용 세목", htmlFoldOpen.indexOf('sticky-n">등록면허세') >= 0);
      assert("펼치면 보증금 세목", htmlFoldOpen.indexOf('sticky-n">사무실보증금') >= 0);

      var tableYears = htmlFold.slice(htmlFold.indexOf('<table class="ledger'));
      assert("기본 연도는 접힘", tableYears.indexOf("year-col") >= 0);
      assert("2026 연도 헤더", tableYears.indexOf('data-year="2026"') >= 0);
      assert("2027 연도 헤더", tableYears.indexOf('data-year="2027"') >= 0);
      assert("접힌 연도는 colspan 없음", tableYears.indexOf("colspan=") < 0);
      assert("연도 경계선", tableYears.indexOf("year-end") >= 0);
      assert("전체 접기 버튼", htmlFold.indexOf("ledger-years-collapse") >= 0);
      assert("전체 펼치기 버튼", htmlFold.indexOf("ledger-years-expand") >= 0);
      var revFold = ledgerGroup(rFold, "revenue-total");
      var opFold = ledgerGroup(rFold, "operating-profit");
      var months2026 = rFold.ledger.months.filter(function (m) { return m.indexOf("2026") === 0; });
      var months2027 = rFold.ledger.months.filter(function (m) { return m.indexOf("2027") === 0; });
      assert("기본 월 헤더 숨김", tableYears.indexOf('data-month="' + months2026[0] + '"') < 0);
      var rev2026 = App.Render.ledgerYearColumnValue(revFold.subtotal.values, months2026, "sum");
      var rev2027 = App.Render.ledgerYearColumnValue(revFold.subtotal.values, months2027, "sum");
      eq("총매출 2026+2027=TOTAL", App.Money.roundWon(rev2026 + rev2027), revFold.subtotal.total);
      eq("영업이익 연도합=월합", App.Money.roundWon(
        App.Render.ledgerYearColumnValue(opFold.subtotal.values, months2026, "sum") +
        App.Render.ledgerYearColumnValue(opFold.subtotal.values, months2027, "sum")
      ), opFold.subtotal.total);
      assert("접힌 표에 2026 매출합", tableYears.indexOf(App.Format.formatGrouped(rev2026)) >= 0);
      var htmlYearsOpen = App.Render.renderView("analysis", seedFold, rFold, {
        analysisTab: "monthly",
        ledgerYearOpen: { "2026": true, "2027": true }
      });
      assert("전체 펼치면 2026 첫월", htmlYearsOpen.indexOf('data-month="' + months2026[0] + '"') >= 0);
      assert("전체 펼치면 2027 첫월", htmlYearsOpen.indexOf('data-month="' + months2027[0] + '"') >= 0);
      assert("전체 펼치면 연도합계 컬럼 없음", htmlYearsOpen.indexOf("year-col") < 0);
      assert("펼쳐도 TOTAL 유지", htmlYearsOpen.indexOf(App.Format.formatGrouped(revFold.subtotal.total)) >= 0);
      assert("펼치면 연도 colspan", htmlYearsOpen.indexOf("colspan=") >= 0);
      var htmlYearMixed = App.Render.renderView("analysis", seedFold, rFold, {
        analysisTab: "monthly",
        ledgerYearOpen: { "2027": true }
      });
      assert("2026만 접히면 그 해 월 숨김", htmlYearMixed.indexOf('data-month="' + months2026[0] + '"') < 0);
      assert("2027만 펼치면 그 해 월 표시", htmlYearMixed.indexOf('data-month="' + months2027[0] + '"') >= 0);
      assert("혼합이면 2026 연도합계 컬럼", htmlYearMixed.indexOf("year-col") >= 0);
      var closeFold = ledgerResult(rFold, "closing");
      eq("월말 자금 접힌 연도는 그 해 마지막 월",
        App.Render.ledgerYearColumnValue(closeFold.values, months2026, "last"),
        closeFold.values[months2026[months2026.length - 1]]);
    } catch (e) { fail("월별원장 접기 예외", e.message || e); }

    try {
      var sFollow = empty();
      sFollow.profile.startMonth = "2026-10";
      sFollow.profile.endMonth = "2026-12";
      sFollow.profile.initialCash = 60000000;
      sFollow.startupExpenses = [{
        id: "st-follow", name: "등록면허세", actualAmount: 340000, estimatedAmount: 340000,
        include: true, month: "2026-11", qty: 1
      }];
      sFollow.deposits = [{
        id: "dep-follow", name: "사무실보증금", actualAmount: 5000000, estimatedAmount: 5000000,
        include: true, month: "2026-11", qty: 1
      }];
      sFollow.vehicles = [{
        id: "veh-follow", name: "하이리무진", kind: "actor", deposit: 30000000,
        monthlyRent: 0, monthlyInsurance: 0, startMonth: "2026-11", include: true
      }];
      var rFollow = App.Engine.runSimulation(sFollow);
      eq("시작월 따라 초기비용 10월", monthRow(rFollow, "2026-10").startupCost, 340000);
      eq("구월 초기비용 0", monthRow(rFollow, "2026-11").startupCost, 0);
      eq("시작월 따라 사무실 보증금 10월", monthRow(rFollow, "2026-10").deposits, 35000000);
      eq("구월 보증금 0", monthRow(rFollow, "2026-11").deposits, 0);

      sFollow.startupExpenses[0].monthMode = "custom";
      sFollow.deposits[0].monthMode = "custom";
      sFollow.vehicles[0].monthMode = "custom";
      var rCustom = App.Engine.runSimulation(sFollow);
      eq("직접지정 초기비용은 11월", monthRow(rCustom, "2026-11").startupCost, 340000);
      eq("직접지정 시 시작월 초기비용 0", monthRow(rCustom, "2026-10").startupCost, 0);
      eq("직접지정 보증금은 11월", monthRow(rCustom, "2026-11").deposits, 35000000);

      var sSync = empty();
      sSync.profile.startMonth = "2026-10";
      sSync.startupExpenses = [{ name: "등록면허세", actualAmount: 340000, include: true, month: "2026-11" }];
      App.Defaults.ensureState(sSync);
      eq("ensureState가 시작월로 맞춤", sSync.startupExpenses[0].month, "2026-10");
      sSync.startupExpenses[0].month = "2026-12";
      sSync.startupExpenses[0].monthMode = "custom";
      App.Defaults.ensureState(sSync);
      eq("직접지정은 ensureState가 덮지 않음", sSync.startupExpenses[0].month, "2026-12");

      var seedStart = App.Sample.load();
      var rSeedStart = App.Engine.runSimulation(seedStart);
      var seedFirst = rSeedStart.months[0].month;
      eq("시드 초기비용은 시드 시작월", monthRow(rSeedStart, seedFirst).startupCost, rSeedStart.kpis.startupCost);
    } catch (e) { fail("초기비용 시작월 연동 예외", e.message || e); }

    try {
      var sOpexFollow = empty();
      sOpexFollow.profile.startMonth = "2026-10";
      sOpexFollow.profile.endMonth = "2027-12";
      sOpexFollow.recurringExpenses = [{
        id: "net-left", name: "통신요금", amount: 50000, include: true, overrides: {},
        startMonth: "2026-12", endMonth: "2027-09"
      }];
      sOpexFollow.employees = [{
        id: "ceo-full", name: "대표", monthlySalary: 1000000, include: true,
        insure: false, meal: false, startMonth: "2026-12", endMonth: "2027-09"
      }];
      sOpexFollow.vehicles = [{
        id: "veh-opex", name: "스텝 차량", kind: "staff", deposit: 0,
        monthlyRent: 800000, monthlyInsurance: 0, startMonth: "2026-11", include: true
      }];
      var rOpexLeft = App.Engine.runSimulation(sOpexFollow);
      eq("잔여 start/end 운영비 10월", monthRow(rOpexLeft, "2026-10").recurring, 50000);
      eq("잔여 start/end 운영비 27-12", monthRow(rOpexLeft, "2027-12").recurring, 50000);
      eq("잔여 start/end 인건비 10월", monthRow(rOpexLeft, "2026-10").payroll, 1000000);
      eq("잔여 start/end 차량렌트 10월", monthRow(rOpexLeft, "2026-10").support, 800000);
      assert("잔여 날짜만 있으면 전체기간", !App.Month.usesCustomPeriod(sOpexFollow.recurringExpenses[0]));

      App.Defaults.ensureState(sOpexFollow);
      eq("ensureState가 잔여 운영비를 full로", sOpexFollow.recurringExpenses[0].periodMode, "full");
      eq("ensureState가 잔여 날짜를 비움", sOpexFollow.recurringExpenses[0].startMonth, null);
      eq("ensureState 후 인건비도 full", sOpexFollow.employees[0].periodMode, "full");

      var sOpexLegacy = empty();
      sOpexLegacy.profile.startMonth = "2026-10";
      sOpexLegacy.profile.endMonth = "2027-12";
      sOpexLegacy.recurringExpenses = [{
        id: "card-legacy", name: "법인카드", amount: 1000000, include: true, overrides: {},
        periodMode: "custom", startMonth: "2026-12", endMonth: "2027-09"
      }, {
        id: "consult-keep", name: "컨설팅비", amount: 2000000, include: true, overrides: {},
        periodMode: "custom", startMonth: "2027-01", endMonth: "2027-09"
      }];
      sOpexLegacy.employees = [{
        id: "rm-keep", name: "로드매니저", monthlySalary: 2500000, include: true,
        periodMode: "custom", startMonth: "2027-01", endMonth: "2027-09",
        insure: false, meal: false
      }];
      App.Defaults.ensureState(sOpexLegacy);
      eq("구 시드창 운영비는 전체기간 승격", sOpexLegacy.recurringExpenses[0].periodMode, "full");
      eq("실제 예외 컨설팅비는 유지", sOpexLegacy.recurringExpenses[1].periodMode, "custom");
      eq("실제 예외 직원은 유지", sOpexLegacy.employees[0].periodMode, "custom");
      var rOpexLeg = App.Engine.runSimulation(sOpexLegacy);
      eq("승격 운영비 10월", monthRow(rOpexLeg, "2026-10").recurring, 1000000);
      eq("승격 운영비 27-12", monthRow(rOpexLeg, "2027-12").recurring, 1000000);
      eq("예외 컨설팅비 10월 0", ledgerItem(ledgerGroup(rOpexLeg, "opex-sga"), "컨설팅비").values["2026-10"], 0);
      eq("예외 컨설팅비 27-01", ledgerItem(ledgerGroup(rOpexLeg, "opex-sga"), "컨설팅비").values["2027-01"], -2000000);
      eq("예외 직원 10월 0", monthRow(rOpexLeg, "2026-10").payroll, 0);
      eq("예외 직원 27-01", monthRow(rOpexLeg, "2027-01").payroll, 2500000);

      sOpexFollow.vehicles[0].monthMode = "custom";
      var rVehCustom = App.Engine.runSimulation(sOpexFollow);
      eq("직접지정 차량렌트 10월 0", monthRow(rVehCustom, "2026-10").support, 0);
      eq("직접지정 차량렌트 11월", monthRow(rVehCustom, "2026-11").support, 800000);

      eq("시드 기말 불변(운영비 기간)", App.Engine.runSimulation(App.Sample.load()).kpis.endClosing, 1204738995);
      eq("시드 최저 불변(운영비 기간)", App.Engine.runSimulation(App.Sample.load()).kpis.minClosing, 8576879);
    } catch (e) { fail("운영비 시뮬레이션 기간 연동 예외", e.message || e); }

    try {
      var sDec = empty();
      sDec.profile.startMonth = "2026-11";
      sDec.profile.endMonth = "2027-12";
      sDec.settings.severance.mode = "decemberFull";
      sDec.employees = [
        { id: "ceo-dec", name: "대표", role: "대표이사", monthlySalary: 10000000, include: true, insure: false, meal: false, severance: false },
        { id: "lead-dec", name: "본부장", role: "영업/본부장", monthlySalary: 6000000, include: true, insure: false, meal: false, severance: true },
        {
          id: "mgr-dec", name: "매니저", role: "로드매니저", monthlySalary: 2500000,
          periodMode: "custom", startMonth: "2027-01", endMonth: "2027-12",
          include: true, insure: false, meal: false, severance: true
        }
      ];
      var rDec = App.Engine.runSimulation(sDec);
      eq("12월 아닌 달 퇴직급여 0 (11월)", monthRow(rDec, "2026-11").severance, 0);
      eq("12월 아닌 달 퇴직급여 0 (1월)", monthRow(rDec, "2027-01").severance, 0);
      eq("2026-12 퇴직급여 = 본부장만(매니저 미입사)", monthRow(rDec, "2026-12").severance, 6000000);
      eq("2027-12 퇴직급여 = 본부장+매니저 100%", monthRow(rDec, "2027-12").severance, 6000000 + 2500000);
      assert("퇴직 미대상(대표)은 제외", monthRow(rDec, "2026-12").severance < 10000000 + 6000000);

      sDec.employees[1].include = false;
      var rDecOff = App.Engine.runSimulation(sDec);
      eq("미포함 직원은 12월 퇴직급여에서 제외", monthRow(rDecOff, "2027-12").severance, 2500000);

      eq("시드 severance 모드 = 매년 12월 100%", App.Sample.load().settings.severance.mode, "decemberFull");
      var seedDecEmp = App.Sample.load().employees;
      assert("시드 영업(본부장) 퇴직 대상", seedDecEmp.filter(function (e) { return e.name === "영업"; })[0].severance === true);
      assert("시드 로드매니저 퇴직 대상", seedDecEmp.filter(function (e) { return e.name === "로드매니저"; })[0].severance === true);
      assert("시드 대표이사는 퇴직 대상 아님", seedDecEmp.filter(function (e) { return e.name === "이종원"; })[0].severance === false);
      eq("시드 2026-12 퇴직급여 = 영업+로드매니저 월급", monthRow(App.Engine.runSimulation(App.Sample.load()), "2026-12").severance, 8180000);

      eq("신규 빈 상태 기본 severance 모드 = 근무월 안분", App.Defaults.emptyState().settings.severance.mode, "auto");

      var legacyManualEmpty = App.Defaults.ensureState({
        settings: { severance: { mode: "manual", autoMonths: 12 } },
        employees: [{ id: "leg1", name: "본부장", role: "본부장", monthlySalary: 4000000, include: true, severance: true }]
      });
      eq("구버전 직접입력(빈값)은 매년 12월 100%로 승격", legacyManualEmpty.settings.severance.mode, "decemberFull");

      var legacyManualWithData = App.Defaults.ensureState({
        settings: { severance: { mode: "manual", autoMonths: 12 } },
        severanceManual: { "2027-06": 1234567 },
        employees: [{ id: "leg2", name: "본부장", role: "본부장", monthlySalary: 4000000, include: true, severance: true }]
      });
      eq("직접입력에 실제 값이 있으면 모드 유지", legacyManualWithData.settings.severance.mode, "manual");

      var explicitAuto = App.Defaults.ensureState({ settings: { severance: { mode: "auto", autoMonths: 12 } } });
      eq("auto 모드는 그대로 유지", explicitAuto.settings.severance.mode, "auto");

      var sAccr = empty();
      sAccr.profile.startMonth = "2026-10";
      sAccr.profile.endMonth = "2027-12";
      sAccr.settings.severance.mode = "auto";
      sAccr.employees = [
        { id: "lead-acc", name: "본부장", monthlySalary: 5000000, include: true, insure: false, meal: false, severance: true },
        { id: "mgr-acc", name: "로드매니저", monthlySalary: 3500000, include: true, insure: false, meal: false, severance: true }
      ];
      var rAccr = App.Engine.runSimulation(sAccr);
      eq("퇴직 15개월 월액", monthRow(rAccr, "2026-10").severance, App.Money.roundWon((5000000 + 3500000) / 12));
      eq("퇴직 15개월 합계", App.Money.sumBy(rAccr.months, function (row) { return row.severance; }),
        App.Money.roundWon((5000000 + 3500000) / 12) * 15);
    } catch (e) { fail("퇴직급여 매년 12월 100% 예외", e.message || e); }

    try {
      var sCap = empty();
      sCap.profile.startMonth = "2026-06";
      sCap.profile.endMonth = "2026-07";
      sCap.employees = [
        { id: "ceo-cap", name: "대표", monthlySalary: 20000000, include: true, insure: true, meal: false, severance: false },
        { id: "lead-cap", name: "본부장", monthlySalary: 5000000, include: true, insure: true, meal: false, severance: false }
      ];
      var rCap = App.Engine.runSimulation(sCap);
      var dJun = monthRow(rCap, "2026-06").insuranceDetail;
      var dJul = monthRow(rCap, "2026-07").insuranceDetail;
      eq("상한 미만은 급여 그대로", dJun.pensionBase - App.InsuranceRules.clampPensionBase(20000000, "2026-06"),
        App.InsuranceRules.clampPensionBase(5000000, "2026-06"));
      eq("6월 연금기준 = 상한+본부장", dJun.pensionBase,
        App.InsuranceRules.clampPensionBase(20000000, "2026-06") + 5000000);
      eq("7월 연금상한이 더 큼", App.InsuranceRules.pensionFor("2026-07").max > App.InsuranceRules.pensionFor("2026-06").max ? 1 : 0, 1);
      eq("7월 대표 연금기준 = 새 상한", App.InsuranceRules.clampPensionBase(20000000, "2026-07"),
        App.InsuranceRules.pensionFor("2026-07").max);
      eq("6월 국민연금", dJun.pension, App.Money.roundWon(dJun.pensionBase * sCap.settings.insuranceRates.pensionEmployer));
      assert("합산급여×요율보다 작음", dJun.pension < App.Money.roundWon(25000000 * sCap.settings.insuranceRates.pensionEmployer));
      eq("건보기준은 보수월액 상한", dJun.healthBase,
        App.InsuranceRules.clampHealthBase(20000000, "2026-06") + 5000000);

      var sLow = empty();
      sLow.profile.startMonth = "2026-12";
      sLow.profile.endMonth = "2026-12";
      sLow.employees = [
        { id: "low1", name: "스태프", monthlySalary: 200000, include: true, insure: true, meal: false, severance: false }
      ];
      var rLow = App.Engine.runSimulation(sLow);
      eq("하한 미만은 하한 적용", monthRow(rLow, "2026-12").insuranceDetail.pensionBase,
        App.InsuranceRules.pensionFor("2026-12").min);

      sCap.settings.insuranceRates.useCaps = false;
      var rNoCap = App.Engine.runSimulation(sCap);
      eq("상한 끄면 급여합이 기준", monthRow(rNoCap, "2026-06").insuranceDetail.pensionBase, 25000000);

      var htmlIns = App.Render.renderView("settings", sCap, rCap, {});
      assert("설정에 상한 안내", htmlIns.indexOf("국민연금 상·하한") >= 0);
    } catch (e) { fail("4대보험 상한 예외", e.message || e); }

    try {
      eq("2025 국민연금 회사 4.5%", App.InsuranceRules.pensionEmployerFor("2025-12"), 0.045);
      eq("2026 국민연금 회사 4.75%", App.InsuranceRules.pensionEmployerFor("2026-01"), 0.0475);
      eq("구기본 0.045는 2026에 4.75%로 해석",
        App.InsuranceRules.resolvePensionEmployer("2026-10", { pensionEmployer: 0.045 }), 0.0475);
      eq("수동 요율은 유지", App.InsuranceRules.resolvePensionEmployer("2026-10", { pensionEmployer: 0.05 }), 0.05);

      var tax2025 = App.Engine.calculateEstimatedTax({ revenue: 200000000, pnlExpense: 0 }, { localTaxRate: 0.10 }, 2025);
      var tax2026lo = App.Engine.calculateEstimatedTax({ revenue: 200000000, pnlExpense: 0 }, { localTaxRate: 0.10 }, 2026);
      eq("2025 2억 이하 법인세율 9%", tax2025.rate, 0.09);
      eq("2026 2억 이하 법인세율 10%", tax2026lo.rate, 0.10);
      eq("2026 2억 법인세", tax2026lo.corporate, 20000000);
      eq("2026 2억 지방소득세", tax2026lo.local, 2000000);

      var tax2026hi = App.Engine.calculateEstimatedTax(
        { revenue: 1065339370, pnlExpense: 0 },
        { localTaxRate: 0.10 },
        2026
      );
      eq("2026 영업이익 10%/20% 법인세", tax2026hi.corporate, 193067874);
      eq("2026 영업이익 지방소득세", tax2026hi.local, 19306787);
      eq("2026 영업이익 법인세등 합계", tax2026hi.total, 212374661);

      var tax2025hi = App.Engine.calculateEstimatedTax(
        { revenue: 1065339370, pnlExpense: 0 },
        { localTaxRate: 0.10 },
        2025
      );
      eq("2025 구세율 법인세등 합계", tax2025hi.total, 200655928);

      var oldBrackets = App.Defaults.ensureState({
        settings: {
          tax: {
            corporateBrackets: [
              { upTo: 200000000, rate: 0.09, deduction: 0 },
              { upTo: 20000000000, rate: 0.19, deduction: 20000000 }
            ]
          },
          insuranceRates: { pensionEmployer: 0.045 }
        }
      });
      eq("구세율 JSON은 2026 표시세율로 승격", oldBrackets.settings.tax.corporateBrackets[0].rate, 0.10);
      eq("구 국민연금 JSON은 4.75%로 승격", oldBrackets.settings.insuranceRates.pensionEmployer, 0.0475);
      var migratedTax = App.Engine.calculateEstimatedTax(
        { revenue: 1065339370, pnlExpense: 0 },
        oldBrackets.settings.tax,
        2026
      );
      eq("구세율 저장본도 2026은 신세율", migratedTax.total, 212374661);
    } catch (e) { fail("2026 법인세·국민연금 요율 예외", e.message || e); }

    try {
      var sInc = empty();
      sInc.profile.startMonth = "2027-12";
      sInc.profile.endMonth = "2027-12";
      sInc.employees = [
        { id: "inc1", name: "본부장", role: "본부장", monthlySalary: 3000000, incentiveYearEnd: 500000, include: true, insure: false, meal: false, severance: false }
      ];
      var rInc = App.Engine.runSimulation(sInc);
      eq("인센티브가 인건비에 합산", monthRow(rInc, "2027-12").payroll, 3500000);

      var payItem = ledgerItem(ledgerGroup(rInc, "payroll"), "본부장");
      var incItem = ledgerItem(ledgerGroup(rInc, "payroll"), "본부장 인센티브");
      eq("급여 행은 월급여만", payItem && payItem.values["2027-12"], -3000000);
      eq("인센티브 행은 분리 표시", incItem && incItem.values["2027-12"], -500000);
      eq("인건비 소계는 급여+인센티브", ledgerGroup(rInc, "payroll").subtotal.values["2027-12"], -3500000);

      var htmlInc = App.Render.renderView("costs", sInc, rInc, { costTab: "opex", costSecOpen: { payroll: true }, costItemOpen: {} });
      assert("비용 탭 급여 행은 급여만 표시", htmlInc.indexOf("3,000,000원") >= 0 &&
        htmlInc.indexOf("인센티브 연 500,000원") < 0);
      assert("비용 탭 인센티브는 별도 행으로 표시", htmlInc.indexOf("500,000원") >= 0 &&
        htmlInc.indexOf(">인센티브<") >= 0 && /class="cost-unit"[^>]*>년</.test(htmlInc));
      assert("인센티브 행은 펼칠 수 있는 details", htmlInc.indexOf('<details class="cost-item employee-incentive-readonly" data-cost-item="employees:inc1-incentive">') >= 0);
      assert("인센티브 행도 초기비용과 같은 7열 리스트", /employee-incentive-readonly[\s\S]*?class="cost-row cost-row-list"/.test(htmlInc));
      var htmlIncOpenMap = {};
      htmlIncOpenMap["employees:inc1-incentive"] = true;
      var htmlIncOpen = App.Render.renderView("costs", sInc, rInc, { costTab: "opex", costSecOpen: { payroll: true }, costItemOpen: htmlIncOpenMap });
      assert("인센티브 펼치면 연말 금액과 발생월 안내 표시",
        htmlIncOpen.indexOf("연말(12월)") >= 0 &&
        htmlIncOpen.indexOf("여러 해에 걸치면 그 횟수만큼 매년 반영") >= 0);
      assert("인센티브 펼치면 연간 합계도 표시", htmlIncOpen.indexOf("연간 합계") >= 0);

      var htmlIncOrg = App.Render.renderView("simulation", sInc, rInc, { simTab: "org" });
      assert("조직·인건비 화면에 인센티브 입력 필드", htmlIncOrg.indexOf('data-path="employees.0.incentiveYearEnd"') >= 0);
      assert("조직·인건비도 비용탭과 같은 7열 그리드", htmlIncOrg.indexOf('class="cost-cols cost-row-list"') >= 0 &&
        htmlIncOrg.indexOf('class="cost-row cost-row-list"') >= 0 &&
        htmlIncOrg.indexOf("상위구분") >= 0 && htmlIncOrg.indexOf("계정과목") >= 0);
      assert("펼칠 수 있는 인건비 행에 클릭 표시", htmlIncOrg.indexOf('<i class="chev" aria-hidden="true"></i>') >= 0);

      var htmlIncLedger = App.Render.renderView("analysis", sInc, rInc, { analysisTab: "monthly" });
      assert("분석표에 인센티브 행", htmlIncLedger.indexOf("본부장 인센티브") >= 0);

      sInc.employees[0].include = false;
      var rIncOff = App.Engine.runSimulation(sInc);
      eq("미포함 직원 인센티브도 제외", monthRow(rIncOff, "2027-12").payroll, 0);

      assert("조직·인건비 직원 행은 기본 펼침(0으로도 확인 가능)", htmlIncOrg.indexOf('<details class="cost-item" data-cost-item="employees:inc1" open>') >= 0);
      var htmlIncCostLinked = App.Render.renderView("costs", sInc, App.Engine.runSimulation(sInc), { costTab: "opex", costSecOpen: { payroll: true }, costItemOpen: {} });
      assert("비용탭(연동) 인건비 행은 기본 접힘 유지", htmlIncCostLinked.indexOf('<details class="cost-item" data-cost-item="employees:inc1" open>') < 0);
    } catch (e) { fail("인건비 인센티브 예외", e.message || e); }

    try {
      var sZeroInc = App.Defaults.ensureState(App.Sample.load());
      (sZeroInc.employees || []).forEach(function (emp) {
        emp.incentiveSeollal = 0;
        emp.incentiveChuseok = 0;
        emp.incentiveYearEnd = 0;
        emp.incentiveAmount = 0;
      });
      var rZero0 = App.Engine.runSimulation(sZeroInc);
      var pay0 = ledgerGroup(rZero0, "payroll");
      ["대표 인센티브", "영업 인센티브", "로드매니저 인센티브"].forEach(function (label) {
        var row = ledgerItem(pay0, label);
        assert("0원이어도 인센티브 행 " + label, !!row);
        eq(label + " TOTAL 0", row.total, 0);
        (rZero0.ledger.months || []).forEach(function (m) {
          eq(label + " 월 0 " + m, row.values[m], 0);
        });
        assert(label + " 0원도 셀 표시", row.showZero === true);
      });
      var htmlZeroInc = App.Render.renderView("analysis", sZeroInc, rZero0, { analysisTab: "monthly" });
      assert("분석표 대표 인센티브", htmlZeroInc.indexOf("대표 인센티브") >= 0);
      assert("분석표 영업 인센티브", htmlZeroInc.indexOf("영업 인센티브") >= 0);
      assert("분석표 로드매니저 인센티브", htmlZeroInc.indexOf("로드매니저 인센티브") >= 0);

      var jsonZero = App.Store.parseImport(App.Store.exportJson(sZeroInc));
      var rJsonZero = App.Engine.runSimulation(jsonZero);
      eq("JSON 후 인센티브 행수", ledgerGroup(rJsonZero, "payroll").rows.filter(function (row) {
        return String(row.id || "").indexOf("-incentive") >= 0;
      }).length, 3);
      eq("JSON 후 대표 인센티브 0", ledgerItem(ledgerGroup(rJsonZero, "payroll"), "대표 인센티브").total, 0);

      var salesEmp = (sZeroInc.employees || []).filter(function (emp) {
        return emp && /본부장/.test((emp.role || "") + (emp.name || ""));
      })[0];
      assert("영업 직원 존재", !!salesEmp);
      var pnl0 = ledgerResult(rZero0, "pnl").total;
      var close0 = rZero0.kpis.endClosing;
      var paySub0 = pay0.subtotal.total;
      var sga0 = ledgerGroup(rZero0, "opex-sga-parent").subtotal.total;
      var ins0 = ledgerGroup(rZero0, "insurance").subtotal.total;
      salesEmp.incentiveYearEnd = 1000000;
      var rZero1 = App.Engine.runSimulation(sZeroInc);
      var pay1 = ledgerGroup(rZero1, "payroll");
      eq("인센티브 변경 후 12월 반영", ledgerItem(pay1, "영업 인센티브").values["2026-12"], -1000000);
      eq("인센티브 변경 후 다음 해 12월도 반영", ledgerItem(pay1, "영업 인센티브").values["2027-12"], -1000000);
      eq("다른 인센티브 행은 0 유지", ledgerItem(pay1, "대표 인센티브").total, 0);
      eq("로드매니저 인센티브 행은 0 유지", ledgerItem(pay1, "로드매니저 인센티브").total, 0);
      var payDelta = App.Money.roundWon(pay1.subtotal.total - paySub0);
      var insDelta = App.Money.roundWon(ledgerGroup(rZero1, "insurance").subtotal.total - ins0);
      var sgaDelta = App.Money.roundWon(ledgerGroup(rZero1, "opex-sga-parent").subtotal.total - sga0);
      eq("인건비 소계 연쇄", payDelta, -2000000);
      eq("판관비 연쇄", sgaDelta, App.Money.roundWon(payDelta + insDelta));
      eq("영업이익 연쇄", App.Money.roundWon(ledgerResult(rZero1, "pnl").total - pnl0), sgaDelta);
      eq("Cash Flow 연쇄", App.Money.roundWon(rZero1.kpis.endClosing - close0), App.Money.roundWon(payDelta + insDelta));

      var restoredMut = App.Store.parseImport(App.Store.exportJson(sZeroInc));
      eq("JSON 후 입력 인센티브 유지", ledgerItem(ledgerGroup(App.Engine.runSimulation(restoredMut), "payroll"), "영업 인센티브").values["2026-12"], -1000000);
    } catch (e) { fail("0원 인센티브 행 유지 예외", e.message || e); }

    try {
      var sOwnerInc = empty();
      sOwnerInc.profile.startMonth = "2027-12";
      sOwnerInc.profile.endMonth = "2027-12";
      sOwnerInc.employees = [
        { id: "owner1", name: "김대표", role: "대표이사", monthlySalary: 10000000, incentiveYearEnd: 2000000, include: true, insure: false, meal: false, severance: false }
      ];
      sOwnerInc.settings.scenarioComparison = { enabledScenarioIds: ["soloAgency", "exclusiveContract"] };
      sOwnerInc.settings.scenarios.soloAgency.ownerPayout.salaryEmployeeId = "owner1";
      var rOwnerInc = App.Engine.runSimulation(sOwnerInc);
      var cmpOwnerInc = App.Engine.runScenarioComparison(sOwnerInc, rOwnerInc);
      eq("대표 인센티브가 시나리오에 별도로 집계", cmpOwnerInc.scenarios.soloAgency.ownerIncentiveAmount, 2000000);
      eq("대표 급여 총액에는 인센티브가 이미 포함", cmpOwnerInc.scenarios.soloAgency.earnedGross, 12000000);

      var htmlOwnerCmp = App.Render.renderView("analysis", sOwnerInc, rOwnerInc, { analysisTab: "scenarios" });
      assert("시나리오 비교표에 대표 인센티브 행", htmlOwnerCmp.indexOf("대표 인센티브") >= 0 &&
        htmlOwnerCmp.indexOf("2,000,000원") >= 0);
    } catch (e) { fail("대표 인센티브 별도 반영 예외", e.message || e); }

    try {
      var sDivBase = empty();
      sDivBase.profile.startMonth = "2027-12";
      sDivBase.profile.endMonth = "2027-12";
      sDivBase.profile.initialCash = 50000000;
      var pDiv = App.Defaults.newProject("2027-12", "drama");
      pDiv.name = "배당테스트";
      pDiv.status = "confirmed";
      pDiv.contractAmount = 40000000;
      pDiv.expenseInclude = false;
      pDiv.lunchTruckInclude = false;
      pDiv.payments = [Object.assign(App.Defaults.newPayment("2027-12"), { amount: 40000000, inputMode: "amount" })];
      sDivBase.projects = [pDiv];
      sDivBase.revenueFees = [];
      sDivBase.employees = [
        { id: "owner1", name: "김대표", role: "대표이사", monthlySalary: 10000000, include: true, insure: false, meal: false, severance: false }
      ];
      sDivBase.settings.scenarioComparison = { enabledScenarioIds: ["soloAgency"] };
      sDivBase.settings.scenarios.soloAgency.ownerPayout.salaryEmployeeId = "owner1";
      sDivBase.settings.scenarios.soloAgency.ownerPayout.dividendMode = "amount";
      sDivBase.settings.scenarios.soloAgency.ownerPayout.dividendAmount = 0;
      sDivBase.settings.scenarios.soloAgency.ownerPayout.dividendRate = 0;
      var rDivBase = App.Engine.runSimulation(sDivBase);
      var cmpDivBase = App.Engine.runScenarioComparison(sDivBase, rDivBase).scenarios.soloAgency;

      var sDiv = clone(sDivBase);
      sDiv.settings.scenarios.soloAgency.ownerPayout.dividendMode = "amount";
      sDiv.settings.scenarios.soloAgency.ownerPayout.dividendAmount = 10000000;
      sDiv.settings.scenarios.soloAgency.ownerPayout.dividendOn = true;
      var sDivRate = clone(sDivBase);
      sDivRate.settings.scenarios.soloAgency.ownerPayout.dividendMode = "rate";
      sDivRate.settings.scenarios.soloAgency.ownerPayout.dividendRate = 0.5;
      sDivRate.settings.scenarios.soloAgency.ownerPayout.dividendOn = true;
      var rDiv = App.Engine.runSimulation(sDiv);
      var cmpDiv = App.Engine.runScenarioComparison(sDiv, rDiv).scenarios.soloAgency;
      var divTax = App.Defaults.ownerDividendWithholding(10000000);

      eq("배당은 손익비용 불변", rDiv.kpis.pnlExpense, rDivBase.kpis.pnlExpense);
      eq("배당은 영업이익 불변", rDiv.kpis.operatingProfit, rDivBase.kpis.operatingProfit);
      eq("배당 KPI", rDiv.kpis.dividend, 10000000);
      eq("배당 월 현금 인출", monthRow(rDiv, "2027-12").dividend, 10000000);
      eq("배당 후 기말 = 기말-배당", rDiv.kpis.endClosing, rDivBase.kpis.endClosing - 10000000);
      eq("배당소득세 15.4%", cmpDiv.ownerDividendTax, divTax.total);
      eq("금액 배당 세율 라벨", cmpDiv.ownerPayoutTaxLabel, "배당소득세 (15.4%)");
      eq("배당은 개인 총소득에 가산", cmpDiv.actorGrossIncome, cmpDivBase.actorGrossIncome + 10000000);
      eq("배당 후 개인세 = 근로세+배당세", cmpDiv.personalTax, cmpDivBase.personalTax + divTax.total);
      eq("경제가치는 배당세만큼만 감소", cmpDiv.controlledEconomicValue,
        cmpDivBase.controlledEconomicValue - divTax.total);
      eq("원장 배당 행", ledgerItem(ledgerGroup(rDiv, "dividend"), "대표 배당").values["2027-12"], -10000000);

      var htmlDivSet = App.Render.renderView("simulation", sDiv, rDiv, { simTab: "tax" });
      assert("설정에 배당 금액 유지", htmlDivSet.indexOf("10,000,000") >= 0);
      var htmlDivCmp = App.Render.renderView("analysis", sDiv, rDiv, { analysisTab: "scenarios" });
      assert("시나리오에 대표 배당 행", htmlDivCmp.indexOf("대표 배당") >= 0);
      assert("시나리오에 배당소득세", htmlDivCmp.indexOf("배당소득세") >= 0);
      var htmlDivLed = App.Render.renderView("analysis", sDiv, rDiv, { analysisTab: "monthly" });
      assert("월별 분석에 대표 배당", htmlDivLed.indexOf("대표 배당") >= 0);
      assert("배당은 손익 소계로 중복 표시 안 함", htmlDivLed.indexOf("배당 소계") < 0);

      var rDivRate = App.Engine.runSimulation(sDivRate);
      var cmpDivRate = App.Engine.runScenarioComparison(sDivRate, rDivRate).scenarios.soloAgency;
      var expectedRateDiv = App.Money.roundWon(Math.max(0, rDivBase.kpis.operatingProfit) * 0.5);
      var rateTax = App.Defaults.ownerDividendWithholding(expectedRateDiv);
      eq("수익비율 배당액 = 영업이익 50%", rDivRate.kpis.dividend, expectedRateDiv);
      assert("수익비율 배당액 양수", expectedRateDiv > 0);
      eq("수익비율도 영업이익 불변", rDivRate.kpis.operatingProfit, rDivBase.kpis.operatingProfit);
      eq("수익비율 후 기말", rDivRate.kpis.endClosing, rDivBase.kpis.endClosing - expectedRateDiv);
      eq("영업이익 연동 배당세 15.4%", cmpDivRate.ownerDividendTax, rateTax.total);
      eq("배당 세율은 15.4%", rateTax.rate, 0.154);
      eq("배당 세율 라벨", cmpDivRate.ownerPayoutTaxLabel, "배당소득세 (15.4%)");
      eq("수익비율 후 개인세 = 근로세+배당세", cmpDivRate.personalTax, cmpDivBase.personalTax + rateTax.total);
      eq("수익비율 경제가치는 배당세만큼만 감소", cmpDivRate.controlledEconomicValue,
        cmpDivBase.controlledEconomicValue - rateTax.total);
      var htmlDivRate = App.Render.renderView("simulation", sDivRate, rDivRate, { simTab: "tax" });
      assert("수익비율 입력 필드", htmlDivRate.indexOf('data-path="settings.scenarios.soloAgency.ownerPayout.dividendRate"') >= 0);
      assert("영업이익 비율로 배당액 표시", htmlDivRate.indexOf("영업이익연동") >= 0 &&
        htmlDivRate.indexOf(App.Format.formatWon(expectedRateDiv)) >= 0);
      assert("배당 안내문에 배당소득세 15.4%", htmlDivRate.indexOf("배당소득세") >= 0 && htmlDivRate.indexOf("15.4%") >= 0);
      var htmlDivRateCmp = App.Render.renderView("analysis", sDivRate, rDivRate, { analysisTab: "scenarios" });
      assert("시나리오에 영업이익 연동 배당 행", htmlDivRateCmp.indexOf("영업이익") >= 0 && htmlDivRateCmp.indexOf("대표 배당") >= 0);
      assert("시나리오에 배당소득세", htmlDivRateCmp.indexOf("배당소득세 (15.4%)") >= 0);

      var htmlDivOff = App.Render.renderView("simulation", sDivBase, rDivBase, { simTab: "tax" });
      assert("배당 있음/없음 선택", htmlDivOff.indexOf("배당 있음") >= 0 && htmlDivOff.indexOf("배당 없음") >= 0);
      assert("수정 버튼으로 폼 활성화", htmlDivOff.indexOf('data-action="toggle-solo-tax-edit"') >= 0 && htmlDivOff.indexOf(">수정<") >= 0);
      assert("기본은 폼 비활성", htmlDivOff.indexOf('<fieldset class="solo-tax-form" disabled>') >= 0);
      var htmlDivOnEdit = App.Render.renderView("simulation", sDivRate, rDivRate, { simTab: "tax", soloTaxFormEdit: true });
      assert("수정 중이면 완료", htmlDivOnEdit.indexOf(">완료<") >= 0 && htmlDivOnEdit.indexOf("solo-tax-form\" disabled") < 0);
      assert("수익배분은 별도 섹션", htmlDivOnEdit.indexOf("<h3>수익배분</h3>") >= 0 &&
        htmlDivOnEdit.indexOf("profitShareWorkRate") >= 0 && htmlDivOnEdit.indexOf("profitShareSalesRate") >= 0);
      assert("수익배분 세율 3.3%", htmlDivOnEdit.indexOf("사업소득세·주민세 3.3%") >= 0);
      assert("개인세금 누진세율 자동", htmlDivOnEdit.indexOf("누진세율 자동") >= 0);
      assert("귀속연도 자동반영", htmlDivOnEdit.indexOf("(자동)") >= 0);

      var sShare = clone(sDivBase);
      sShare.settings.scenarios.soloAgency.ownerPayout.dividendOn = false;
      sShare.settings.scenarios.soloAgency.ownerPayout.profitShareWorkRate = 0.10;
      sShare.settings.scenarios.soloAgency.ownerPayout.profitShareSalesRate = 0;
      var rShare = App.Engine.runSimulation(sShare);
      var cmpShare = App.Engine.runScenarioComparison(sShare, rShare).scenarios.soloAgency;
      var shareAmt = App.Money.roundWon(40000000 * 0.10);
      var shareTax = App.Defaults.ownerProfitShareWithholding(shareAmt);
      eq("작품 수익배분액", rShare.kpis.profitShare, shareAmt);
      eq("수익배분은 손익비용 불변", rShare.kpis.pnlExpense, rDivBase.kpis.pnlExpense);
      eq("수익배분 후 기말", rShare.kpis.endClosing, rDivBase.kpis.endClosing - shareAmt);
      eq("수익배분 사업소득세 3.3%", cmpShare.ownerProfitShareTax, shareTax.total);
      eq("수익배분 세율 라벨", cmpShare.ownerProfitShareTaxLabel, "사업소득세 (3.3%)");

      var sOff = clone(sDivRate);
      sOff.settings.scenarios.soloAgency.ownerPayout.dividendOn = false;
      var rOff = App.Engine.runSimulation(sOff);
      eq("배당 없음이면 현금 0", rOff.kpis.dividend, 0);

      var sMarDiv = empty();
      sMarDiv.settings.scenarios.soloAgency.ownerPayout.dividendOn = true;
      sMarDiv.profile.startMonth = "2026-10";
      sMarDiv.profile.endMonth = "2027-12";
      sMarDiv.profile.initialCash = 100000000;
      var pMarDiv = App.Defaults.newProject("2026-12", "drama");
      pMarDiv.name = "결산배당";
      pMarDiv.status = "confirmed";
      pMarDiv.contractAmount = 40000000;
      pMarDiv.expenseInclude = false;
      pMarDiv.lunchTruckInclude = false;
      pMarDiv.payments = [Object.assign(App.Defaults.newPayment("2026-12"), { amount: 40000000, inputMode: "amount" })];
      sMarDiv.projects = [pMarDiv];
      sMarDiv.revenueFees = [];
      sMarDiv.employees = [];
      sMarDiv.settings.scenarios.soloAgency.ownerPayout.dividendMode = "rate";
      sMarDiv.settings.scenarios.soloAgency.ownerPayout.dividendRate = 0.5;
      var rMarDiv = App.Engine.runSimulation(sMarDiv);
      var net2026 = ((rMarDiv.kpis.taxDetail && rMarDiv.kpis.taxDetail.byYear) || {})[2026] || {};
      var expectedMar = App.Money.roundWon(Math.max(0, App.Money.roundWon(net2026.preTaxProfit)) * 0.5);
      assert("2026 결산 배당 양수", expectedMar > 0);
      eq("2026 영업이익 배당은 2027-03", monthRow(rMarDiv, "2027-03").dividend, expectedMar);
    } catch (e) { fail("대표 배당 반영 예외", e.message || e); }

    try {
      var sSign = App.Defaults.ensureState(App.Sample.load());
      sSign.settings.scenarioComparison = { enabledScenarioIds: ["soloAgency", "exclusiveContract"] };
      var rSign = App.Engine.runSimulation(sSign);
      var cSign = App.Engine.runScenarioComparison(sSign, rSign);
      var htmlSign = App.Render.renderView("analysis", sSign, rSign, { analysisTab: "scenarios" });
      var htmlTaxSign = App.Render.renderView("analysis", sSign, rSign, { analysisTab: "income-tax" });
      var soloS = cSign.scenarios.soloAgency;
      var exS = cSign.scenarios.exclusiveContract;
      assert("엔진 총매출 원본은 양수", exS.totalRevenue > 0);
      assert("엔진 진행비 원본은 양수", exS.projectExpense > 0);
      assert("엔진 회사배분 원본은 양수", exS.companyShare > 0);
      assert("총매출 + 표시", htmlSign.indexOf("+" + App.Format.formatWon(exS.totalRevenue)) >= 0);
      assert("진행비 - 표시", htmlSign.indexOf("-" + App.Format.formatWon(exS.projectExpense)) >= 0);
      assert("전속 상세 회사배분은 유출 -", htmlSign.indexOf("-" + App.Format.formatWon(exS.companyShare)) >= 0);
      assert("회사 경제성 배분몫은 유입 +", htmlSign.indexOf("+" + App.Format.formatWon(exS.companyShare)) >= 0);
      assert("세후 실수령은 강제 + 없음", htmlSign.indexOf("+" + App.Format.formatWon(exS.actorNetIncome)) < 0);
      assert("세후 법인잔여는 강제 + 없음", htmlSign.indexOf("+" + App.Format.formatWon(soloS.corporateEndingCash)) < 0);
      assert("0원은 +0/-0 아님", htmlSign.indexOf("+0원") < 0 && htmlSign.indexOf("-0원") < 0);
      assert("한눈에 총매출 +", htmlTaxSign.indexOf("+" + App.Format.formatWon(cSign.commonRevenue)) >= 0);
      if (exS.personalTax) {
        assert("한눈에 개인세금 -", htmlTaxSign.indexOf("-" + App.Format.formatWon(exS.personalTax)) >= 0);
      }
      assert("한눈에 실수령 강제 + 없음", htmlTaxSign.indexOf("+" + App.Format.formatWon(exS.actorNetIncome)) < 0);
      assert("한눈에 0원은 +0/-0 아님", htmlTaxSign.indexOf("+0원") < 0 && htmlTaxSign.indexOf("-0원") < 0);

      var ptSign = (sSign.settings.supportPolicies || []).filter(function (p) { return p.id === "sp-pt"; })[0];
      assert("PT 정책", !!ptSign);
      ptSign.include = true;
      ptSign.unitAmount = 1000000;
      var rSupSign = App.Engine.runSimulation(sSign);
      var cSupSign = App.Engine.runScenarioComparison(sSign, rSupSign);
      var htmlSupSign = App.Render.renderView("analysis", sSign, rSupSign, { analysisTab: "scenarios" });
      var htmlTaxSup = App.Render.renderView("analysis", sSign, rSupSign, { analysisTab: "income-tax" });
      var supVal = cSupSign.scenarios.exclusiveContract.companySupportValue;
      assert("지원가치 엔진 원본은 양수", supVal > 0);
      eq("전속 경제가치에 지원 미가산", cSupSign.scenarios.exclusiveContract.controlledEconomicValue,
        cSupSign.scenarios.exclusiveContract.actorNetIncome);
      assert("전속 산식에 회사 지원가치 + 없음", htmlSupSign.indexOf("+" + App.Format.formatWon(supVal)) < 0 ||
        htmlSupSign.indexOf("회사 지원가치") < 0);
      assert("회사 부담 지원비는 -", htmlSupSign.indexOf("-" + App.Format.formatWon(supVal)) >= 0);
      assert("한눈에 지원가치를 경제가치에 더하지 않음", htmlTaxSup.indexOf("회사 지원가치") < 0);
    } catch (e) { fail("분석 화면 부호 표시 예외", e.message || e); }

    try {
      var seedXl = App.Defaults.ensureState(App.Sample.load());
      var rXl = App.Engine.runSimulation(seedXl);
      var xmlXl = App.Export.workbookXml(seedXl, rXl);
      assert("엑셀 워크북 생성", xmlXl.indexOf("<Workbook") >= 0);
      assert("엑셀 월별현금 시트", xmlXl.indexOf('ss:Name="월별현금"') >= 0);
      assert("엑셀 진행비 시트", xmlXl.indexOf('ss:Name="진행비"') >= 0);
      assert("엑셀 인건비보험 시트", xmlXl.indexOf('ss:Name="인건비보험"') >= 0);
      assert("엑셀 시드 기말 숫자", xmlXl.indexOf(String(rXl.kpis.endClosing)) >= 0);
      assert("엑셀 시드 진행비 숫자", xmlXl.indexOf(String(rXl.kpis.projectExpense)) >= 0);
      assert("엑셀 요약에 설립비용", xmlXl.indexOf("설립비용") >= 0 &&
        xmlXl.indexOf(String(rXl.kpis.startup)) >= 0);
      assert("엑셀 월별비용 설립비용 열", xmlXl.indexOf(">설립비용<") >= 0 || xmlXl.indexOf("설립비용") >= 0);
      assert("엑셀 요약에 손익비용 합계", xmlXl.indexOf("손익비용 합계") >= 0 &&
        xmlXl.indexOf(String(rXl.kpis.pnlExpense)) >= 0);
      assert("엑셀 밥차는 진행비와 별도 안내", xmlXl.indexOf("진행비와 별도") >= 0);
      assert("엑셀 법인세는 손익비용 아님 안내", xmlXl.indexOf("손익비용 아님") >= 0);
      assert("엑셀 요약에 설립기타라는 새 이름 없음", xmlXl.indexOf("설립기타") < 0);
      eq("엑셀 요약 항목합=손익비용", App.Money.roundWon(
        rXl.kpis.payroll + rXl.kpis.opex + rXl.kpis.projectExpense + rXl.kpis.lunchTruck +
        rXl.kpis.agencyFees + rXl.kpis.startup +
        (rXl.kpis.projectDirect - rXl.kpis.projectExpense - rXl.kpis.lunchTruck)
      ), rXl.kpis.pnlExpense);
      assert("엑셀 기말 검산 공식(부가세예수금 포함)", xmlXl.indexOf("=RC[-10]+RC[-9]+RC[-8]+RC[-7]-RC[-2]") >= 0);
      assert("엑셀 월별현금 시트에 부가세예수금 컬럼", xmlXl.indexOf("부가세예수금") >= 0);
      assert("엑셀 회사부담 안내", xmlXl.indexOf("회사(사용자) 부담만") >= 0);
      eq("엑셀 파일명", App.Export.fileName(seedXl), "이종원_검산_2026-10_2027-12.xls");
      var sEsc = empty();
      sEsc.profile.startMonth = "2027-01";
      sEsc.profile.endMonth = "2027-01";
      sEsc.projects = [{
        id: "esc-1", category: "drama", name: "A & B <C>", status: "confirmed",
        contractAmount: 100, shootStartMonth: "2027-01", shootEndMonth: "2027-01",
        expenseRateMode: "custom", expenseRate: 0, expenseInclude: true,
        payments: [], directExpenses: []
      }];
      var xmlEsc = App.Export.workbookXml(sEsc);
      assert("엑셀 특수문자 이스케이프", xmlEsc.indexOf("A &amp; B &lt;C&gt;") >= 0);
      assert("엑셀 원문 태그 없음", xmlEsc.indexOf("A & B <C>") < 0);
    } catch (e) { fail("엑셀 검산보내기 예외", e.message || e); }

    try {
      var seedNew = App.Sample.load();
      var mkItem = seedNew.recurringExpenses.filter(function (r) { return r.name === "바이럴 마케팅비"; })[0];
      assert("시드에 바이럴 마케팅비 존재", !!mkItem);
      eq("바이럴 마케팅비 기본 0원", mkItem && mkItem.amount, 0);
      eq("바이럴 마케팅비 기본 포함", mkItem && mkItem.include, true);
      var propsItemSeed = seedNew.settings.supportPolicies.filter(function (p) { return p.id === "sp-props"; })[0];
      var stylingItemSeed = seedNew.settings.supportPolicies.filter(function (p) { return p.id === "sp-styling"; })[0];
      assert("시드에 소품비 존재", !!propsItemSeed && propsItemSeed.name === "소품비");
      assert("시드에 스타일링비 존재", !!stylingItemSeed && stylingItemSeed.name === "스타일링비");
      eq("소품비 selfCare 그룹", propsItemSeed.group, "selfCare");
      eq("스타일링비 selfCare 그룹", stylingItemSeed.group, "selfCare");

      var catalogOrderNames = seedNew.settings.supportPolicies.map(function (p) { return p.name; });
      var idxDerm = catalogOrderNames.indexOf("피부과 / 피부관리");
      var idxProps = catalogOrderNames.indexOf("소품비");
      var idxStyling = catalogOrderNames.indexOf("스타일링비");
      var idxTruck = catalogOrderNames.indexOf("밥차");
      assert("배우 활동지원 순서: 피부관리 < 소품비 < 스타일링비 < 밥차",
        idxDerm < idxProps && idxProps < idxStyling && idxStyling < idxTruck);

      var sNewCost = empty();
      sNewCost.profile.startMonth = "2027-01";
      sNewCost.profile.endMonth = "2027-01";
      var rBefore = App.Engine.runSimulation(sNewCost);
      eq("CASE1 0원일 때 반복비용 불변", rBefore.months[0].recurring, 0);
      eq("CASE1 0원일 때 지원비용 불변", rBefore.months[0].support, 0);

      sNewCost.recurringExpenses = [
        { id: "mk1", name: "바이럴 마케팅비", category: "sga", amount: 1000000, periodMode: "full", include: true, overrides: {} }
      ];
      var rMk = App.Engine.runSimulation(sNewCost);
      eq("CASE2 바이럴 마케팅비 100만원 반영", rMk.months[0].recurring, 1000000);
      var htmlMk = App.Render.renderView("costs", sNewCost, rMk, { costTab: "opex", costSecOpen: { "sga-parent": true, "recurring-marketing": true }, costItemOpen: {} });
      assert("마케팅비 전용 섹션에 표시(일반 판관비 아님)", htmlMk.indexOf('data-cost-sec="recurring-marketing"') >= 0);
      assert("override 없으면 단위=월, 변동 문구 없음",
        /class="cost-unit"[^>]*>월</.test(htmlMk) && htmlMk.indexOf("월별 변동 있음") < 0);

      sNewCost.recurringExpenses[0].amount = 0;
      sNewCost.recurringExpenses[0].overrides = { "2027-01": 2000000 };
      var rMkOv = App.Engine.runSimulation(sNewCost);
      eq("override 있으면 그 달은 override 금액 반영", rMkOv.months[0].recurring, 2000000);
      var htmlMkOv = App.Render.renderView("costs", sNewCost, rMkOv, { costTab: "opex", costSecOpen: { "sga-parent": true, "recurring-marketing": true }, costItemOpen: {} });
      assert("override 있으면 단위=변동으로 표시", /class="cost-unit"[^>]*>변동</.test(htmlMkOv));
      assert("override 있으면 기간합을 옅게 표시", htmlMkOv.indexOf("기간합 2,000,000원") >= 0);
      assert("마케팅 그룹 요약에도 기간합", htmlMkOv.indexOf("기간합") >= 0);
      assert("override 있어도 기본 금액 0원은 그대로 표시(과장 없음)", htmlMkOv.indexOf(">0원") >= 0);
      assert("변동 건수 문구가 잘리지 않음", htmlMkOv.indexOf("변동 1건") >= 0);
      var htmlMkOvOpen = App.Render.renderView("costs", sNewCost, rMkOv, { costTab: "opex", costSecOpen: { "sga-parent": true, "recurring-marketing": true }, costItemOpen: { "recurringExpenses:mk1": true } });
      assert("펼치면 override가 실제 반영값이라는 안내",
        htmlMkOvOpen.indexOf("기본 월 금액은 0원이지만") >= 0 &&
        htmlMkOvOpen.indexOf("월별 분석에는 이 override가 실제 반영된 값으로 표시") >= 0);

      sNewCost.recurringExpenses[0].amount = 1000000;
      sNewCost.recurringExpenses[0].overrides = {};
      sNewCost.recurringExpenses[0].include = false;
      var rMkOff = App.Engine.runSimulation(sNewCost);
      eq("CASE5 제외 시 반복비용에서 빠짐", rMkOff.months[0].recurring, 0);

      App.Defaults.ensureSupportPolicies(sNewCost);
      var propsRow = sNewCost.settings.supportPolicies.filter(function (p) { return p.id === "sp-props"; })[0];
      var stylingRow = sNewCost.settings.supportPolicies.filter(function (p) { return p.id === "sp-styling"; })[0];
      propsRow.unitAmount = 500000;
      stylingRow.unitAmount = 2000000;
      var rSupport = App.Engine.runSimulation(sNewCost);
      eq("CASE3 소품비 50만원 + CASE4 스타일링비 200만원 합산 반영", rSupport.months[0].support, 2500000);

      propsRow.include = false;
      var rSupportOff = App.Engine.runSimulation(sNewCost);
      eq("CASE5 소품비 제외 시 그만큼 감소", rSupportOff.months[0].support, 2000000);

      sNewCost.recurringExpenses[0].include = true;
      var rForMonthly = App.Engine.runSimulation(sNewCost);
      var htmlMonthlyMk = App.Render.renderView("analysis", sNewCost, rForMonthly, { analysisTab: "monthly" });
      assert("CASE6 월별 분석에 마케팅비 그룹", htmlMonthlyMk.indexOf("마케팅비") >= 0);

      var jsonMk = App.Store.exportJson(sNewCost);
      var restoredMk = App.Store.parseImport(jsonMk);
      var restoredMkItem = restoredMk.recurringExpenses.filter(function (r) { return r.name === "바이럴 마케팅비"; })[0];
      eq("CASE7 JSON 왕복 후 마케팅비 유지", restoredMkItem && restoredMkItem.amount, 1000000);
      var restoredStyling = restoredMk.settings.supportPolicies.filter(function (p) { return p.id === "sp-styling"; })[0];
      eq("CASE7 JSON 왕복 후 스타일링비 유지", restoredStyling && restoredStyling.unitAmount, 2000000);

      var legacySave = { settings: {}, employees: [], recurringExpenses: [] };
      var migratedSave = App.Defaults.ensureState(JSON.parse(JSON.stringify(legacySave)));
      assert("기존 저장분에도 소품비 자동 추가", migratedSave.settings.supportPolicies.some(function (p) { return p.id === "sp-props"; }));
      assert("기존 저장분에도 스타일링비 자동 추가", migratedSave.settings.supportPolicies.some(function (p) { return p.id === "sp-styling"; }));
      var legacyToggled = { settings: { supportPolicies: [
        { id: "sp-acting-class", name: "연기수업료", group: "selfCare", calcMode: "monthlyFixed", costClass: "sga", include: false, unitAmount: 0, quantity: 1 }
      ] }, employees: [], recurringExpenses: [] };
      var migratedToggled = App.Defaults.ensureState(JSON.parse(JSON.stringify(legacyToggled)));
      var actingAfter = migratedToggled.settings.supportPolicies.filter(function (p) { return p.id === "sp-acting-class"; })[0];
      eq("기존에 꺼둔 항목은 소품비 추가 후에도 그대로 꺼짐", actingAfter.include, false);
    } catch (e) { fail("바이럴 마케팅비·소품비·스타일링비 예외", e.message || e); }

    try {
      var sDepOnce = empty();
      sDepOnce.profile.startMonth = "2026-11";
      sDepOnce.profile.endMonth = "2026-12";
      sDepOnce.profile.initialCash = 100000000;
      sDepOnce.revenueFees = [];
      sDepOnce.deposits = [{
        id: "d-once", name: "사무실보증금", actualAmount: 45000000, include: true, month: "2026-11"
      }];
      var rDepOnce = App.Engine.runSimulation(sDepOnce);
      var novDep = monthRow(rDepOnce, "2026-11");
      eq("보증금 엔진 1회", novDep.deposits, 45000000);
      eq("보증금은 cashOut에 1회만", novDep.cashOut,
        App.Money.roundWon(novDep.pnlExpense + novDep.deposits + novDep.capex + novDep.taxCashOut + (novDep.vatSettlement || 0)));
      eq("월말=월초+유입-유출(보증금 1회)", novDep.closing,
        App.Money.roundWon(novDep.opening + novDep.inflow + novDep.otherInflow + (novDep.vatOutput || 0) - novDep.cashOut));
      eq("원장 자산·보증금 소계=-보증금", ledgerGroup(rDepOnce, "funding").subtotal.values["2026-11"], -45000000);
      assert("하단 cashMove 행 없음", !ledgerResult(rDepOnce, "cashMove"));
      assert("하단 cashDelta 행 없음", !ledgerResult(rDepOnce, "cashDelta"));
      eq("12월 월초=11월 월말", monthRow(rDepOnce, "2026-12").opening, novDep.closing);
      var htmlDepOnce = App.Render.renderView("analysis", sDepOnce, rDepOnce, { analysisTab: "monthly" });
      assert("하단 자산·보증금/기타입금 없음", htmlDepOnce.indexOf("자산·보증금·기타입금") < 0 &&
        htmlDepOnce.indexOf("자산·보증금/기타입금") < 0);
      assert("현금증감 행 없음", htmlDepOnce.indexOf("현금증감") < 0);
      assert("월말 자금 행", htmlDepOnce.indexOf("월말 자금") >= 0);
      assert("현금흐름 안 자산·보증금 이동은 유지", htmlDepOnce.indexOf("자산·보증금 이동") >= 0);

      App.Defaults.ensureTaxSettings(sDepOnce);
      var pTaxPay = App.Defaults.newProject("2026-11", "drama");
      pTaxPay.status = "confirmed";
      pTaxPay.contractAmount = 100000000;
      pTaxPay.directExpenses = [];
      pTaxPay.expenseInclude = false;
      pTaxPay.payments = [Object.assign(App.Defaults.newPayment("2026-11"), { amount: 100000000, inputMode: "amount" })];
      sDepOnce.projects = [pTaxPay];
      sDepOnce.settings.tax.cashOutMonth = "2026-12";
      var rTaxPay = App.Engine.runSimulation(sDepOnce);
      var decPay = monthRow(rTaxPay, "2026-12");
      eq("지정월 법인세+지방=taxCashOut",
        App.Money.roundWon((decPay.corporateTaxCashOut || 0) + (decPay.localIncomeTaxCashOut || 0)), decPay.taxCashOut);
      eq("원장 법인세 및 주민세 납부=-taxCashOut", ledgerResult(rTaxPay, "taxCorporateLocal").values["2026-12"],
        -decPay.taxCashOut);
      assert("원장 분리 법인세행 없음", !ledgerResult(rTaxPay, "taxCorporate"));
      assert("원장 분리 지방세행 없음", !ledgerResult(rTaxPay, "taxLocal"));
      eq("지정월 세후월말=통장", monthRow(rTaxPay, "2026-12").closingAfterTax, decPay.closing);
      eq("11월은 법인세 미납부", monthRow(rTaxPay, "2026-11").taxCashOut, 0);
      var htmlTaxPay = App.Render.renderView("analysis", sDepOnce, rTaxPay, { analysisTab: "monthly" });
      assert("법인세 및 주민세 납부 표시", htmlTaxPay.indexOf("법인세 및 주민세 납부") >= 0);
      assert("법인지방소득세 분리행 없음", htmlTaxPay.indexOf("법인지방소득세 납부") < 0);
    } catch (e) { fail("월별 현금흐름 구조 예외", e.message || e); }

    try {
      var seedFloor = App.Sample.load();
      var rFloor0 = App.Engine.runSimulation(seedFloor);
      var beforeRev = rFloor0.kpis.revenue;
      var beforeEnd = rFloor0.kpis.endClosing;
      var halfState = JSON.parse(JSON.stringify(seedFloor));
      App.Engine.scaleBudgetRevenue(halfState, 0.5);
      var rHalf = App.Engine.runSimulation(halfState);
      assert("매출 50% 스케일", Math.abs(rHalf.kpis.revenue - App.Money.roundWon(beforeRev * 0.5)) < 1000000);
      eq("스케일 후 원본 매출 불변", App.Engine.runSimulation(seedFloor).kpis.revenue, beforeRev);
      eq("스케일 후 원본 기말 불변", App.Engine.runSimulation(seedFloor).kpis.endClosing, beforeEnd);

      var floor = App.Engine.analyzeRevenueFloor(seedFloor, rFloor0);
      eq("하한 분석 현재매출=엔진", floor.current.revenue, beforeRev);
      assert("경제가치 하한 존재", !!(floor.economicValue && floor.economicValue.found));
      assert("경제가치 하한 < 현재", floor.economicValue.revenue < beforeRev);
      assert("하한에서 1인 EV가 더 큼", floor.economicValue.snap.soloEV > floor.economicValue.snap.exclusiveEV);
      assert("영업이익 하한에서 영업이익>0", floor.operatingProfit.found && floor.operatingProfit.snap.operatingProfit > 0);
      assert("현금 하한에서 최저잔액>=0", floor.cash.found && floor.cash.snap.minClosing >= 0);
      var belowFactor = (floor.economicValue.revenue / beforeRev) * 0.9;
      var belowState = JSON.parse(JSON.stringify(seedFloor));
      App.Engine.scaleBudgetRevenue(belowState, belowFactor);
      var rBelow = App.Engine.runSimulation(belowState);
      var cBelow = App.Engine.runScenarioComparison(belowState, rBelow);
      assert("하한 아래면 전속이 유리",
        cBelow.scenarios.soloAgency.controlledEconomicValue <=
        cBelow.scenarios.exclusiveContract.controlledEconomicValue);

      var htmlFloor = App.Render.renderView("analysis", seedFloor, rFloor0, { analysisTab: "revenue-floor" });
      assert("매출하한 본문", htmlFloor.indexOf("참고 · 매출하한 기준") >= 0);
      assert("매출하한에서 원장 숨김", htmlFloor.indexOf("월별 손익 · 현금흐름") < 0);
      assert("현재 매출 대비 하한", htmlFloor.indexOf("지금 기간 매출") >= 0);
      assert("월 고정 부담", htmlFloor.indexOf("이 구조의 월 고정 부담") >= 0);
      assert("매출이 줄면 차트", htmlFloor.indexOf("매출이 줄면 어느 쪽이 유리한가") >= 0);
      assert("매출이 늘면 배수 차트", htmlFloor.indexOf("매출이 늘면 어느 쪽이 유리한가") >= 0);
      assert("배수 경제가치 표", htmlFloor.indexOf("배수로 키우면 경제가치는") >= 0);
      assert("배수 1배 행", htmlFloor.indexOf("1배 · 지금") >= 0);
      assert("배수 5배 행", htmlFloor.indexOf("5배") >= 0);
      assert("파이프라인 제외 표", htmlFloor.indexOf("지금 파이프라인에서 빼 보면") >= 0);
      assert("파이프라인 전체 행", (floor.pipeline || []).some(function (row) { return row.kind === "all"; }));
      assert("파이프라인 확정만", (floor.pipeline || []).some(function (row) { return row.kind === "confirmed"; }));
      assert("언니 제외 행", (floor.pipeline || []).some(function (row) { return row.label.indexOf("언니") >= 0; }));
      var unniDrop = (floor.pipeline || []).filter(function (row) { return row.label.indexOf("언니") >= 0; })[0];
      assert("언니 제외 매출 감소", !!(unniDrop && unniDrop.revenue < beforeRev));
      eq("언니 제외해도 인건비 불변", unniDrop.payroll, floor.current.payroll);
      assert("언니 제외 시 AP 감소", unniDrop.agencyFees < floor.current.agencyFees);
      assert("파이프라인 표에 AP", htmlFloor.indexOf(">AP<") >= 0);
      assert("파이프라인 표에 진행비", htmlFloor.indexOf(">진행비<") >= 0);
      eq("파이프라인 분석 후 원본 매출 불변", App.Engine.runSimulation(seedFloor).kpis.revenue, beforeRev);
      var sEmptyFloor = empty();
      var rEmptyFloor = App.Engine.runSimulation(sEmptyFloor);
      var htmlEmptyFloor = App.Render.renderView("analysis", sEmptyFloor, rEmptyFloor, { analysisTab: "revenue-floor" });
      assert("매출 0이면 하한 안내", htmlEmptyFloor.indexOf("기간 매출이 0원") >= 0);
    } catch (e) { fail("매출하한 참고 연동 예외", e.message || e); }

    try {
      var sVat = empty();
      noOwnerDividend(sVat);
      sVat.profile.startMonth = "2026-01";
      sVat.profile.endMonth = "2026-06";
      sVat.profile.initialCash = 0;
      App.Defaults.ensureVatSettings(sVat);
      sVat.settings.vat.on = true;
      sVat.settings.vat.rate = 0.1;
      sVat.settings.vat.period = "quarterly";
      sVat.settings.vat.filingLagMonths = 1;
      sVat.revenueFees = [];
      var pVat = App.Defaults.newProject("2026-03", "drama");
      pVat.expenseInclude = false;
      pVat.status = "confirmed";
      pVat.name = "VAT테스트";
      pVat.contractAmount = 100000000;
      pVat.directExpenses = [];
      pVat.payments = [Object.assign(App.Defaults.newPayment("2026-03"), { amount: 100000000, inputMode: "amount" })];
      sVat.projects = [pVat];
      var rVat = App.Engine.runSimulation(sVat);

      eq("VAT 매출월 현금유입 = 공급가액+매출VAT(110,000,000)",
        monthRow(rVat, "2026-03").inflow + monthRow(rVat, "2026-03").vatOutput, 110000000);
      eq("VAT 손익 매출은 공급가액 100,000,000 그대로", rVat.kpis.revenue, 100000000);
      eq("VAT 매출월 vatOutput = 10,000,000", monthRow(rVat, "2026-03").vatOutput, 10000000);
      eq("VAT 4월 납부액 -10,000,000", monthRow(rVat, "2026-04").vatSettlement, 10000000);
      eq("원장 부가세 예수금=vatOutput", ledgerResult(rVat, "vatOutput").values["2026-03"], 10000000);
      eq("원장 부가세 납부=-vatSettlement", ledgerResult(rVat, "vatSettlement").values["2026-04"], -10000000);
      var htmlVat = App.Render.renderView("analysis", sVat, rVat, { analysisTab: "monthly" });
      assert("부가세 예수금 행", htmlVat.indexOf("부가세 예수금") >= 0);
      assert("부가세 납부 행", htmlVat.indexOf("부가세 납부") >= 0);
      var tableVat = htmlVat.slice(htmlVat.indexOf('<table class="ledger'));
      assert("VAT 표에서 영업이익이 현금흐름보다 앞", tableVat.indexOf(">영업이익<") < tableVat.indexOf("현금흐름"));
      assert("VAT 표에서 현금흐름이 부가세보다 앞", tableVat.indexOf("현금흐름") < tableVat.indexOf("부가세 예수금"));
      assert("VAT 표에서 부가세 납부가 월말 자금보다 앞", tableVat.indexOf("부가세 납부") < tableVat.indexOf("월말 자금"));
      assert("VAT 표에서 현금증감 없음", htmlVat.indexOf("현금증감") < 0);
      assert("VAT 표에서 월말 자금", htmlVat.indexOf("월말 자금") >= 0);
      eq("VAT 4월 납부 후 미납액 0", rVat.kpis.vatPendingLiability, 0);

      var chainOk = true;
      for (var vi = 1; vi < rVat.months.length; vi++) {
        if (rVat.months[vi].opening !== rVat.months[vi - 1].closing) chainOk = false;
      }
      assert("VAT 반영 후에도 전월 월말=다음월 월초 연속", chainOk);

      eq("VAT 3월 월말현금 = 초기현금+공급가액+매출VAT",
        monthRow(rVat, "2026-03").closing, 0 + 100000000 + 10000000);
      eq("VAT 4월 월말현금 = 3월 월말 - VAT납부", monthRow(rVat, "2026-04").closing,
        monthRow(rVat, "2026-03").closing - 10000000);
      eq("VAT 반영해도 최종 순현금흐름은 0(패스스루)", rVat.kpis.endClosing, 100000000);

      var sVatOff = JSON.parse(JSON.stringify(sVat));
      sVatOff.settings.vat.on = false;
      var rVatOff = App.Engine.runSimulation(sVatOff);
      assert("VAT 켜기 전/후 3월 월말현금이 다르게 재계산됨(+매출VAT)",
        monthRow(rVat, "2026-03").closing !== monthRow(rVatOff, "2026-03").closing);
      eq("VAT OFF면 vatOutput 0", monthRow(rVatOff, "2026-03").vatOutput, 0);
      eq("VAT OFF면 4월 납부 없음", monthRow(rVatOff, "2026-04").vatSettlement, 0);

      var sVatPending = JSON.parse(JSON.stringify(sVat));
      sVatPending.profile.endMonth = "2026-03";
      var rVatPending = App.Engine.runSimulation(sVatPending);
      eq("신고월이 기간 밖이면 미납 VAT로 잡힘", rVatPending.kpis.vatPendingLiability, 10000000);
      eq("실질 가용현금 = 통장현금 - 미납VAT", rVatPending.kpis.availableCashExVat,
        rVatPending.kpis.endClosing - 10000000);
      assert("미납 VAT가 있으면 실질 가용현금이 통장현금보다 작음",
        rVatPending.kpis.availableCashExVat < rVatPending.kpis.endClosing);

      pVat.vatApplicable = false;
      var rVatItemOff = App.Engine.runSimulation(sVat);
      eq("프로젝트별 VAT 미적용 시 매출VAT 0", monthRow(rVatItemOff, "2026-03").vatOutput, 0);
      pVat.vatApplicable = true;

      var vatJson = App.Store.exportJson(sVat);
      var vatRestored = App.Store.parseImport(vatJson);
      eq("JSON 왕복 후 VAT 설정 유지(세율)", vatRestored.settings.vat.rate, 0.1);
      eq("JSON 왕복 후 VAT 설정 유지(주기)", vatRestored.settings.vat.period, "quarterly");
      eq("JSON 왕복 후 프로젝트 VAT 적용 여부 유지", vatRestored.projects[0].vatApplicable, true);

      var legacyVatSave = { settings: {}, employees: [], projects: [], recurringExpenses: [] };
      var migratedVat = App.Defaults.ensureState(JSON.parse(JSON.stringify(legacyVatSave)));
      assert("기존 저장분(vat 필드 없음)도 오류 없이 기본값 채움",
        !!migratedVat.settings.vat && migratedVat.settings.vat.on === true && migratedVat.settings.vat.rate === 0.1);
      assert("기존 저장분 시뮬레이션도 예외 없이 실행", !!App.Engine.runSimulation(migratedVat).kpis);
    } catch (e) { fail("부가세 현금흐름 예외", e.message || e); }

    try {
      var sKpi = empty();
      sKpi.profile.startMonth = "2027-01";
      sKpi.profile.endMonth = "2027-01";
      var W = App.Format.formatWon;

      var rKpi0 = App.Engine.runSimulation(sKpi);
      rKpi0.kpis.endClosing = 100000000;
      rKpi0.kpis.vatPendingLiability = 0;
      rKpi0.kpis.corporateTaxPending = 0;
      rKpi0.kpis.localTaxPending = 0;
      rKpi0.kpis.minClosing = 5000000;
      var htmlKpi0 = App.Render.renderView("analysis", sKpi, rKpi0, {});
      var occur100M = (htmlKpi0.match(new RegExp(W(100000000).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
      assert("미납세금 0이면 기말현금·실질가용현금 동일값 두 번 표시", occur100M >= 2);
      assert("미납세금 0이면 납부할 세금 0원", htmlKpi0.indexOf(W(0)) >= 0);

      var rVatOnly = App.Engine.runSimulation(sVatPending);
      assert("VAT 단독 시나리오는 실제로 미납 VAT를 가짐", rVatOnly.kpis.vatPendingLiability === 10000000);
      rVatOnly.kpis.corporateTaxPending = 0;
      rVatOnly.kpis.localTaxPending = 0;
      var htmlKpiVat = App.Render.renderView("analysis", sVatPending, rVatOnly, {});
      assert("VAT만 미납이면 납부할 세금=VAT 금액", htmlKpiVat.indexOf(W(10000000)) >= 0);
      assert("VAT만 미납이면 실질 가용현금=기말-VAT",
        htmlKpiVat.indexOf(W(rVatOnly.kpis.endClosing - 10000000)) >= 0);

      var rKpi2 = App.Engine.runSimulation(sKpi);
      rKpi2.kpis.endClosing = 100000000;
      rKpi2.kpis.vatPendingLiability = 0;
      rKpi2.kpis.corporateTaxPending = 8000000;
      rKpi2.kpis.localTaxPending = 800000;
      rKpi2.kpis.deposits = 999999999;
      var htmlKpi2 = App.Render.renderView("analysis", sKpi, rKpi2, {});
      assert("법인세+지방세 미납 합산 표시", htmlKpi2.indexOf(W(8800000)) >= 0);
      assert("실질 가용현금=기말-법인세-지방세(보증금 재차감 없음)", htmlKpi2.indexOf(W(91200000)) >= 0);

      var htmlKpi2Detail = App.Render.renderView("analysis", sKpi, rKpi2, { analysisTaxHelpOpen: true });
      assert("납부할 세금 상세에 법인세 금액", htmlKpi2Detail.indexOf(W(8000000)) >= 0);
      assert("납부할 세금 상세에 지방소득세 금액", htmlKpi2Detail.indexOf(W(800000)) >= 0);
      assert("납부할 세금 상세 합계", htmlKpi2Detail.indexOf(W(8800000)) >= 0);

      var seedKpiReal = App.Sample.load();
      var rKpiReal = App.Engine.runSimulation(seedKpiReal);
      var htmlKpiReal = App.Render.renderView("analysis", seedKpiReal, rKpiReal, {});
      eq("기말 현금잔액 카드 = 마지막 월 closing", rKpiReal.kpis.endClosing,
        rKpiReal.months[rKpiReal.months.length - 1].closing);
      assert("기말 현금잔액 카드에 실제 kpis.endClosing 표시", htmlKpiReal.indexOf(W(rKpiReal.kpis.endClosing)) >= 0);
      assert("기말 현금 맞춤 통장 태그", htmlKpiReal.indexOf('kpi-tag">통장') >= 0);
      assert("기말 현금 맞춤에 표의 월말 자금", htmlKpiReal.indexOf("표의 월말 자금") >= 0 &&
        htmlKpiReal.indexOf(W(rKpiReal.kpis.endClosingAfterTax)) >= 0);
      var htmlKpiMonthly = App.Render.renderView("analysis", seedKpiReal, rKpiReal, { analysisTab: "monthly" });
      assert("월말 자금 법인세만 차감 태그", htmlKpiMonthly.indexOf('kpi-tag kpi-tag-warn">법인세만 차감') >= 0);
      assert("실질 가용현금은 월말자금에서 미납 부가세를 더 뺌", htmlKpiReal.indexOf("미납 부가세") >= 0 &&
        htmlKpiReal.indexOf("부가세까지 차감") >= 0);
      assert("같은 금액 별 표기", htmlKpiReal.indexOf("same-amt") >= 0 && htmlKpiReal.indexOf("같은 금액") >= 0);
    } catch (e) { fail("분석 탭 세금 KPI 예외", e.message || e); }

    try {
      var pFit = App.Defaults.newProject("2027-01", "ambassador");
      pFit.includeInBudget = true;
      pFit.contractAmount = 54085439;
      pFit.payments = App.Defaults.defaultPaymentSplit("2027-01");
      App.Defaults.fitPaymentsToContract(pFit);
      var fitSum = App.Money.roundWon(App.Money.sumBy(pFit.payments, function (p) {
        return App.Engine.resolvePaymentAmount(pFit, p);
      }));
      eq("지급 합계를 계약에 맞춤", fitSum, 54085439);

      var sMul = App.Sample.load();
      var beforeN = sMul.projects.length;
      var baseMul = App.Money.sumBy(sMul.projects.filter(function (p) {
        return p.status !== "cancelled";
      }), function (p) { return App.Engine.projectContractAmount(p); });
      var gen = App.Defaults.autoGenerateRevenuePlanToTarget(sMul, baseMul * 2);
      assert("2배 생성 건수", gen.added > 0);
      var extras = sMul.projects.slice(beforeN);
      extras.forEach(function (p, i) {
        assert("생성 작품 촬영월 " + i, !!App.Month.parseMonth(p.shootStartMonth));
        var contract = App.Engine.projectContractAmount(p);
        var scheduled = App.Money.roundWon(App.Money.sumBy(p.payments, function (pay) {
          return App.Engine.resolvePaymentAmount(p, pay);
        }));
        eq("생성 작품 지급=계약 " + i, scheduled, contract);
      });
      var rMul = App.Engine.runSimulation(sMul);
      extras.forEach(function (p, i) {
        var xp = rMul.projectExpenseGap && rMul.projectExpenseGap.byId["project:" + p.id];
        if (xp && xp.registered) {
          eq("생성 작품 진행비 월별 반영 " + i, xp.inPeriod, xp.registered);
          assert("생성 작품 촬영월 누락 없음 " + i, !(xp.issues || []).some(function (iss) {
            return String(iss.text).indexOf("촬영 시작월이 없어") >= 0;
          }));
        }
        var rev = rMul.revenueGap && rMul.revenueGap.byId["project:" + p.id];
        if (rev) eq("생성 작품 입금=계약 " + i, rev.scheduled, rev.contract);
      });

      var seedMulUi = App.Sample.load();
      var rMulUi = App.Engine.runSimulation(seedMulUi);
      var htmlMul2 = App.Render.renderView("analysis", seedMulUi, rMulUi, {
        analysisTab: "monthly", multiplierSelected: 2
      });
      assert("2배 월별에 촬영월 누락 배너 없음", htmlMul2.indexOf("촬영 시작월이 없어") < 0);
      assert("2배 월별에 1원 초과 배너 없음", htmlMul2.indexOf("1원 초과") < 0);
    } catch (e) { fail("배수 자동 반영 예외", e.message || e); }

    try {
      var seedVal = App.Sample.load();
      var rVal = App.Engine.runSimulation(seedVal);
      var reportVal = App.Engine.validateAnalysisConsistency(seedVal, rVal);
      assert("CASE A 실제 시드는 정합성 정상", reportVal.valid && reportVal.errors.length === 0);

      var htmlValOk = App.Render.renderView("analysis", seedVal, rVal, { analysisTab: "monthly" });
      assert("정상일 때 배너에 체크 표시", htmlValOk.indexOf("데이터 정합성 정상") >= 0);
      assert("정상일 때 오류 보기 버튼 없음", htmlValOk.indexOf("오류 보기") < 0);

      var rValBad = App.Engine.runSimulation(App.Sample.load());
      rValBad.kpis.revenue = App.Money.roundWon(rValBad.kpis.revenue) + 1;
      var reportBad = App.Engine.validateAnalysisConsistency(seedVal, rValBad);
      assert("CASE B 1원만 달라도 오류로 잡힘", !reportBad.valid &&
        reportBad.errors.some(function (e) { return e.key === "totalRevenueKpis" && Math.abs(e.difference) === 1; }));

      var htmlValBad = App.Render.renderView("analysis", seedVal, rValBad, { analysisTab: "monthly" });
      assert("오류 있을 때 배너에 건수와 오류보기 버튼", htmlValBad.indexOf("데이터 정합성 오류") >= 0 &&
        htmlValBad.indexOf("오류 보기") >= 0 && htmlValBad.indexOf("데이터 정합성 정상") < 0);
      assert("접힌 상태에선 상세 목록 없음", htmlValBad.indexOf("consistency-list") < 0);

      var htmlValBadOpen = App.Render.renderView("analysis", seedVal, rValBad,
        { analysisTab: "monthly", analysisConsistencyOpen: true });
      assert("펼치면 원본/분석/차이 상세 표시", htmlValBadOpen.indexOf("consistency-list") >= 0 &&
        htmlValBadOpen.indexOf("<span>원본</span>") >= 0 && htmlValBadOpen.indexOf("<span>분석</span>") >= 0 &&
        htmlValBadOpen.indexOf("<span>차이</span>") >= 0);
      assert("펼치면 오류 접기 버튼으로 라벨 전환", htmlValBadOpen.indexOf("오류 접기") >= 0);

      var seedTruck = App.Sample.load();
      var truckPolicy = seedTruck.settings.supportPolicies.filter(function (p) { return p.id === "sp-lunch-truck"; })[0];
      truckPolicy.costClass = "sga";
      var rTruck = App.Engine.runSimulation(seedTruck);
      var reportTruck = App.Engine.validateAnalysisConsistency(seedTruck, rTruck);
      assert("CASE H 밥차가 sga로 잘못 분류되면 중복 반영 위험으로 오류",
        !reportTruck.valid && reportTruck.errors.some(function (e) { return e.key === "lunchTruckDup"; }));

      var seedFee = App.Sample.load();
      seedFee.revenueFees = (seedFee.revenueFees || []).map(function (f) {
        return Object.assign({}, f, { rate: f.rate ? f.rate * 1.5 : f.rate });
      });
      var rFee = App.Engine.runSimulation(seedFee);
      var reportFee = App.Engine.validateAnalysisConsistency(seedFee, rFee);
      assert("CASE F 수수료 정책을 바꿔도 분석이 같이 바뀌어 정합성 오류 없음", reportFee.valid);

      var seedEmptyVal = App.Defaults.emptyState();
      var rEmptyVal = App.Engine.runSimulation(seedEmptyVal);
      assert("빈 상태도 정합성 정상", App.Engine.validateAnalysisConsistency(seedEmptyVal, rEmptyVal).valid);

      var jsonVal = App.Store.exportJson(seedVal);
      var restoredVal = App.Store.parseImport(jsonVal);
      var rRestoredVal = App.Engine.runSimulation(restoredVal);
      assert("CASE J JSON 왕복 후에도 정합성 정상",
        App.Engine.validateAnalysisConsistency(restoredVal, rRestoredVal).valid);
    } catch (e) { fail("분석 탭 정합성 검증 레이어 예외", e.message || e); }

    try {
      var sCbc = empty();
      sCbc.profile.startMonth = "2027-01";
      sCbc.profile.endMonth = "2027-01";
      sCbc.employees = [
        { id: "cbc1", name: "로드매니저", role: "로드매니저", monthlySalary: 3000000,
          comparisonBurdenType: "bothCompany", include: true, insure: false, meal: false, severance: false }
      ];
      var rCbc = App.Engine.runSimulation(sCbc);
      var exCbc = App.Engine.runScenarioComparison(sCbc, rCbc).scenarios.exclusiveContract;
      eq("회사부담 인건비는 companyBorneCosts에 정확히 1회만 반영", exCbc.companyBorneCosts, exCbc.payroll);
    } catch (e) { fail("기존회사 companyBorneCosts 이중계상 방지 예외", e.message || e); }

    try {
      var sRoadActor = empty();
      sRoadActor.profile.startMonth = "2027-01";
      sRoadActor.profile.endMonth = "2027-01";
      sRoadActor.employees = [
        { id: "road1", name: "로드매니저", role: "로드매니저", monthlySalary: 3000000,
          comparisonBurdenType: "actorBorne", include: true, insure: false, meal: false, severance: false }
      ];
      var rRoadActor = App.Engine.runSimulation(sRoadActor);
      var exRoadActor = App.Engine.runScenarioComparison(sRoadActor, rRoadActor).scenarios.exclusiveContract;
      eq("직책이 '본부장'이 아니어도 배우 부담 직원 인건비는 배우 부담 인건비에 반영",
        exRoadActor.directorCost, 3000000);
      eq("배우 부담 인건비가 실수령에서 실제로 차감됨",
        exRoadActor.actorNetIncome, exRoadActor.actorGrossIncome - 3000000 - exRoadActor.personalTax);
    } catch (e) { fail("직책 무관 배우 부담 인건비 반영 예외", e.message || e); }

    try {
      var sLiq = empty();
      sLiq.profile.startMonth = "2027-01";
      sLiq.profile.endMonth = "2027-01";
      var rLiq = App.Engine.runSimulation(sLiq);
      rLiq.kpis.endClosing = 100000000;
      rLiq.kpis.vatPendingLiability = 10000000;
      rLiq.kpis.corporateTaxPending = 5000000;
      rLiq.kpis.localTaxPending = 500000;
      sLiq.settings.tax.liquidationTaxRate = 0;
      var cmpLiq = App.Engine.runScenarioComparison(sLiq, rLiq);
      var soloLiq = cmpLiq.scenarios.soloAgency;
      eq("즉시 청산 기준 현금가치 = 기간말현금 - 미납VAT - 미납법인세 - 미납지방소득세",
        soloLiq.corpCashAfterPendingTax, 84500000);
      eq("미납세금 합계 필드도 정확히 노출", soloLiq.pendingTaxLiability, 15500000);

      var sLiq2 = JSON.parse(JSON.stringify(sLiq));
      var rLiq2 = App.Engine.runSimulation(sLiq2);
      rLiq2.kpis.endClosing = 100000000;
      rLiq2.kpis.vatPendingLiability = 10000000;
      rLiq2.kpis.corporateTaxPending = 5000000;
      rLiq2.kpis.localTaxPending = 500000;
      sLiq2.settings.tax.liquidationTaxRate = 0.154;
      var soloLiq2 = App.Engine.runScenarioComparison(sLiq2, rLiq2).scenarios.soloAgency;
      eq("청산소득세는 미납세금 차감 후 금액을 기준으로 계산",
        soloLiq2.corporateLiquidationTax, Math.round(84500000 * 0.154));
      eq("청산 후 잔여현금 = 미납세금·청산소득세 모두 차감",
        soloLiq2.corporateCashAfterLiquidation, 84500000 - Math.round(84500000 * 0.154));

      var sLiqPaid = JSON.parse(JSON.stringify(sLiq));
      var rLiqPaid = App.Engine.runSimulation(sLiqPaid);
      rLiqPaid.kpis.endClosing = 100000000;
      rLiqPaid.kpis.vatPendingLiability = 0;
      rLiqPaid.kpis.corporateTaxPending = 0;
      rLiqPaid.kpis.localTaxPending = 0;
      sLiqPaid.settings.tax.liquidationTaxRate = 0;
      var soloLiqPaid = App.Engine.runScenarioComparison(sLiqPaid, rLiqPaid).scenarios.soloAgency;
      eq("이미 납부 완료된 세금은 다시 차감하지 않음(미납 0이면 기간말현금 그대로)",
        soloLiqPaid.corpCashAfterPendingTax, 100000000);
    } catch (e) { fail("즉시 청산가치 미납세금 반영 예외", e.message || e); }

    try {
      var seedCorp = App.Sample.load();
      var rCorp = App.Engine.runSimulation(seedCorp);
      var cmpCorp = App.Engine.runScenarioComparison(seedCorp, rCorp);
      var byYearCorp = rCorp.kpis.taxDetail.byYear;
      var years2 = Object.keys(byYearCorp);
      var htmlCorp = App.Render.renderView("analysis", seedCorp, rCorp, { analysisTab: "scenarios" });
      eq("경제가치 법인현금=통장-미납법인세주민세",
        cmpCorp.scenarios.soloAgency.corporateCashForEconomicValue,
        App.Money.roundWon(rCorp.kpis.endClosing - rCorp.kpis.corporateTaxPending - rCorp.kpis.localTaxPending));
      eq("1인 경제가치=세후순이익+실수령+카드",
        cmpCorp.scenarios.soloAgency.controlledEconomicValue,
        App.Money.roundWon(
          cmpCorp.scenarios.soloAgency.corporateAfterTaxNet +
          cmpCorp.scenarios.soloAgency.actorNetIncome +
          cmpCorp.scenarios.soloAgency.ownerCorporateCardValue
        ));
      eq("시나리오 세후순이익=엔진 기간합",
        cmpCorp.scenarios.soloAgency.corporateAfterTaxNet,
        App.Money.roundWon(rCorp.kpis.taxDetail.afterTaxNet));
      years2.forEach(function (y) {
        var row = byYearCorp[y];
        var properNet = App.Money.roundWon(row.preTaxProfit - row.corporateTax - row.localIncomeTax);
        eq(y + "년 엔진 세후순이익=세전-세금", row.afterTaxNet, properNet);
        assert(y + "년 연도별 세후순이익이 화면에 올바른 값으로 표시",
          htmlCorp.indexOf(App.Format.formatWon(properNet)) >= 0,
          "expected " + App.Format.formatWon(properNet) + " in html for year " + y);
      });
      var periodNet = App.Money.roundWon(rCorp.kpis.taxDetail.afterTaxNet);
      eq("기간 세후순이익=연도합", periodNet,
        years2.reduce(function (sum, y) {
          return App.Money.roundWon(sum + byYearCorp[y].afterTaxNet);
        }, 0));
      assert("전체 기간 세후순이익 라벨", htmlCorp.indexOf("전체 기간 세후순이익") >= 0);
      assert("기간 세후순이익 숫자", htmlCorp.indexOf(App.Format.formatWon(periodNet)) >= 0);
      assert("연도별 카드는 '세후순이익' 라벨 사용(세전손익-법인세-지방소득세)",
        htmlCorp.indexOf("세후순이익") >= 0);
      assert("전체 누적 통장잔액은 별도 라벨로 구분", htmlCorp.indexOf("전체 세후 법인잔여") >= 0);
      assert("법인 카드에 설명 도움말 버튼 존재", htmlCorp.indexOf("open-scenario-corp-help") >= 0);
      var htmlCorpHelp = App.Render.renderView("analysis", seedCorp, rCorp, { analysisTab: "scenarios", scenarioCorpHelpOpen: true });
      assert("두 개념이 다를 수 있다는 안내 문구는 도움말 안에 존재", htmlCorpHelp.indexOf("실제 통장잔액이라") >= 0);
      assert("설명문은 카드 본문에는 상시 노출되지 않음", htmlCorp.indexOf("실제 통장잔액이라") < 0);
      var cashEv = cmpCorp.scenarios.soloAgency.corporateCashForEconomicValue;
      var profitCashGap = App.Money.roundWon(cashEv - periodNet);
      eq("법인잔여=세후순이익+손익외현금", cashEv, App.Money.roundWon(periodNet + profitCashGap));
      if (profitCashGap) {
        assert("손익 외 현금 라벨", htmlCorp.indexOf("손익 외 현금") >= 0);
        assert("손익 외 현금 금액", htmlCorp.indexOf(App.Format.formatWon(profitCashGap)) >= 0);
        assert("손익외현금은 경제가치에서 제외",
          cmpCorp.scenarios.soloAgency.controlledEconomicValue !==
          App.Money.roundWon(
            cashEv +
            cmpCorp.scenarios.soloAgency.actorNetIncome +
            cmpCorp.scenarios.soloAgency.ownerCorporateCardValue
          ));
        assert("손익외현금 비교제외 안내", htmlCorp.indexOf("경제가치 비교에서는 제외") >= 0);
      }
    } catch (e) { fail("법인 연도별 세후순이익 표시 예외", e.message || e); }

    try {
      var seedPerson = App.Sample.load();
      var rPerson = App.Engine.runSimulation(seedPerson);
      var cmpPerson = App.Engine.runScenarioComparison(seedPerson, rPerson);
      var htmlPerson = App.Render.renderView("analysis", seedPerson, rPerson, { analysisTab: "scenarios" });
      var htmlPersonTax = App.Render.renderView("analysis", seedPerson, rPerson, { analysisTab: "income-tax" });
      var htmlPersonHelp = App.Render.renderView("analysis", seedPerson, rPerson, { analysisTab: "scenarios", scenarioSoloPersonHelpOpen: true });
      assert("대표 개인 카드에 설명 도움말 버튼 존재", htmlPerson.indexOf("open-scenario-solo-person-help") >= 0);
      assert("대표 개인 상세보기에 연도별 합산 안내 문구는 도움말 안에 존재",
        htmlPersonHelp.indexOf("각 귀속연도를 따로 계산한 뒤 더하며") >= 0);
      assert("시나리오·계산기 공통 합산 안내",
        htmlPersonHelp.indexOf("합친 과세표준에 세율을 다시 적용하지 않습니다") >= 0 &&
        htmlPersonTax.indexOf("합친 과세표준에 세율을 다시 적용하지 않습니다") >= 0);
      assert("한눈에 비교 연도별 상이", htmlPersonTax.indexOf("연도별로 다름") >= 0);
      var soloYears = ((cmpPerson.scenarios.soloAgency.personalTaxDetail || {}).years) || [];
      soloYears.forEach(function (yd) {
        var det = App.Format.formatWon(yd.determinedTax != null ? yd.determinedTax : yd.incomeTax);
        assert(yd.year + "년 결정세액이 시나리오 상세에 있음", htmlPerson.indexOf(det) >= 0);
        assert(yd.year + "년 결정세액이 종소세 계산기에 있음", htmlPersonTax.indexOf(det) >= 0);
        if (yd.earnedGross) {
          var pay = App.Format.formatWon(yd.earnedGross);
          assert(yd.year + "년 급여가 시나리오 상세에 있음", htmlPerson.indexOf(pay) >= 0);
          assert(yd.year + "년 급여가 종소세 계산기에 있음", htmlPersonTax.indexOf(pay) >= 0);
        }
      });
    } catch (e) { fail("대표 개인 연도별 합산 안내 문구 예외", e.message || e); }

    try {
      var seedLiqCard = App.Sample.load();
      var rLiqCard = App.Engine.runSimulation(seedLiqCard);
      var cmpLiqCard = App.Engine.runScenarioComparison(seedLiqCard, rLiqCard);
      var soloLiqCard = cmpLiqCard.scenarios.soloAgency;
      assert("시드는 미납세금이 있어 청산 카드 검증에 의미 있음", soloLiqCard.pendingTaxLiability > 0);
      var htmlLiqCard = App.Render.renderView("analysis", seedLiqCard, rLiqCard, { analysisTab: "income-tax" });
      assert("청산 카드에 미납세금 차감 행 표시", htmlLiqCard.indexOf("미납 부가세·법인세·지방소득세") >= 0);
      assert("청산 카드에 미납세금 차감 후 잔여 표시",
        htmlLiqCard.indexOf(App.Format.formatWon(soloLiqCard.corpCashAfterPendingTax)) >= 0);
      eq("청산 전 잔여 - 미납세금 = 미납세금 차감 후 잔여",
        soloLiqCard.corporateEndingCash - soloLiqCard.pendingTaxLiability, soloLiqCard.corpCashAfterPendingTax);
      eq("차감 후 잔여 - 청산세금 = 청산 후 잔여",
        soloLiqCard.corpCashAfterPendingTax - soloLiqCard.corporateLiquidationTax, soloLiqCard.corporateCashAfterLiquidation);
    } catch (e) { fail("청산 카드 미납세금 표시 예외", e.message || e); }

    try {
      var seedExPerson = App.Sample.load();
      var rExPerson = App.Engine.runSimulation(seedExPerson);
      var cmpExPerson = App.Engine.runScenarioComparison(seedExPerson, rExPerson);
      var exPerson = cmpExPerson.scenarios.exclusiveContract;
      var htmlExPerson = App.Render.renderView("analysis", seedExPerson, rExPerson, { analysisTab: "scenarios" });
      var htmlExPersonHelp = App.Render.renderView("analysis", seedExPerson, rExPerson, { analysisTab: "scenarios", scenarioExPersonHelpOpen: true });
      assert("배우 개인 상세보기에 배우 부담 지원비 행 표시", htmlExPerson.indexOf("배우 부담 지원비") >= 0);
      assert("배우 개인 카드에 설명 도움말 버튼 존재", htmlExPerson.indexOf("open-scenario-ex-person-help") >= 0);
      assert("배우 귀속소득이 배분 전 금액이라는 안내는 도움말 안에 존재", htmlExPersonHelp.indexOf("빼기 전 금액입니다") >= 0);
      var preTaxShown = App.Money.roundWon(
        exPerson.actorGrossIncome - exPerson.directorCost - exPerson.actorBorneSupportCost
      );
      assert("실과세표준이 화면에 정확히 표시(귀속소득-인건비-지원비)",
        htmlExPerson.indexOf("실과세표준") >= 0 &&
        htmlExPerson.indexOf(App.Format.formatWon(preTaxShown)) >= 0);
      assert("전속 종소세 2026 귀속", htmlExPerson.indexOf("2026 귀속") >= 0);
      assert("전속 종소세 연도별 합산 안내는 도움말 안에 존재", htmlExPersonHelp.indexOf("종소세도 각 귀속연도") >= 0);
      ((exPerson.personalTaxDetail && exPerson.personalTaxDetail.years) || []).forEach(function (yd) {
        var det = App.Format.formatWon(yd.determinedTax != null ? yd.determinedTax : yd.incomeTax);
        assert(yd.year + "년 전속 결정세액이 상세에 있음", htmlExPerson.indexOf(det) >= 0);
      });
    } catch (e) { fail("배우 개인 배분 상세 예외", e.message || e); }

    try {
      var legacyDirector = {
        settings: {},
        employees: [
          { id: "dir1", name: "김본부장", role: "본부장", monthlySalary: 5000000, comparisonBurdenType: "bothCompany", include: true },
          { id: "dir2", name: "박대표", role: "대표이사", monthlySalary: 10000000, comparisonBurdenType: "onePersonOnly", include: true }
        ],
        recurringExpenses: []
      };
      var migratedDirector = App.Defaults.ensureState(JSON.parse(JSON.stringify(legacyDirector)));
      var mDir = migratedDirector.employees.filter(function (e) { return e.id === "dir1"; })[0];
      eq("본부장급 bothCompany 직원은 1회성 마이그레이션으로 actorBorne 전환", mDir.comparisonBurdenType, "actorBorne");
      var mCeo = migratedDirector.employees.filter(function (e) { return e.id === "dir2"; })[0];
      eq("대표이사(onePersonOnly)는 마이그레이션 영향 없음", mCeo.comparisonBurdenType, "onePersonOnly");
      assert("마이그레이션 완료 플래그 저장", migratedDirector.settings.directorActorBorneMigrated === true);

      mDir.comparisonBurdenType = "bothCompany";
      var reMigrated = App.Defaults.ensureState(JSON.parse(JSON.stringify(migratedDirector)));
      var mDir2 = reMigrated.employees.filter(function (e) { return e.id === "dir1"; })[0];
      eq("마이그레이션은 1회만 실행되어 이후 사용자가 되돌린 값은 유지", mDir2.comparisonBurdenType, "bothCompany");
    } catch (e) { fail("본부장 배우부담 1회성 마이그레이션 예외", e.message || e); }

    try {
      var sBurden = empty();
      sBurden.profile.startMonth = "2026-01";
      sBurden.profile.endMonth = "2026-12";
      sBurden.employees = [
        { id: "b1", name: "테스트직원", role: "직원", monthlySalary: 3000000,
          incentiveYearEnd: 12000000, comparisonBurdenType: "bothCompany",
          include: true, insure: false, meal: false, severance: false }
      ];
      var rBurden = App.Engine.runSimulation(sBurden);
      eq("실제 12월 급여 현금흐름에는 인센티브 반영", monthRow(rBurden, "2026-12").payroll, 3000000 + 12000000);
      eq("실제 1월 급여 현금흐름은 기본급만", monthRow(rBurden, "2026-01").payroll, 3000000);
      var floorBurden = App.Engine.analyzeRevenueFloor(sBurden, rBurden);
      assert("피크 월 인건비 부담 계산됨", !!floorBurden.burden);
      var peopleSum = App.Money.sumBy(floorBurden.burden.people, function (p) { return p.amount; });
      eq("월 고정 부담 개인별 항목은 인센티브 제외 기본급만", peopleSum, 3000000);
      eq("월 고정 부담 소계도 인센티브 제외", floorBurden.burden.total, 3000000);
      assert("인센티브 있는 달과 없는 달의 고정 부담 동일 (12월이 튀지 않음)",
        floorBurden.burden.month !== "2026-12" || floorBurden.burden.total === 3000000);
    } catch (e) { fail("월 고정 부담 인센티브 제외 예외", e.message || e); }

    try {
      var sSev = empty();
      sSev.profile.startMonth = "2026-01";
      sSev.profile.endMonth = "2026-12";
      sSev.employees = [
        { id: "s1", name: "퇴직테스트", role: "직원", monthlySalary: 3000000,
          comparisonBurdenType: "bothCompany",
          include: true, insure: false, meal: false, severance: true }
      ];
      var rSev = App.Engine.runSimulation(sSev);
      assert("12월 퇴직급여가 실제 현금흐름에 반영됨", monthRow(rSev, "2026-12").severance > 0);
      var floorSev = App.Engine.analyzeRevenueFloor(sSev, rSev);
      assert("퇴직급여 지급월에도 월 고정 부담 계산됨", !!floorSev.burden);
      eq("퇴직급여 지급월에도 월 고정 부담이 튀지 않음", floorSev.burden.total, 3000000);
      assert("월 고정 부담 응답에 퇴직급여 필드 없음", floorSev.burden.severance === undefined);
    } catch (e) { fail("월 고정 부담 퇴직급여 제외 예외", e.message || e); }

    try {
      var sFlow = empty();
      sFlow.profile.startMonth = "2027-01";
      sFlow.profile.endMonth = "2027-01";
      App.Defaults.ensureSupportPolicies(sFlow);
      var actingPolicy = sFlow.settings.supportPolicies.filter(function (p) { return p.id === "sp-acting-class"; })[0];
      actingPolicy.include = true;
      actingPolicy.unitAmount = 11000000;
      actingPolicy.exclusiveCompanyShareRate = 0;
      var rFlow = App.Engine.runSimulation(sFlow);
      var cmpFlow = App.Engine.runScenarioComparison(sFlow, rFlow);
      var exFlow = cmpFlow.scenarios.exclusiveContract;
      assert("배우 부담 지원비가 실제로 발생하는 케이스", exFlow.actorBorneSupportCost > 0);
      var htmlFlow = App.Render.renderView("analysis", sFlow, rFlow, { analysisTab: "income-tax" });
      assert("한눈에 비교 전속 돈의 흐름에 배우 부담 지원비 단계 표시",
        htmlFlow.indexOf("배우 부담 지원비") >= 0);
      assert("배우 부담 지원비 금액이 화면에 정확히 표시",
        htmlFlow.indexOf(App.Format.formatWon(exFlow.actorBorneSupportCost)) >= 0);
      eq("돈의 흐름 반영 후 실수령 = 귀속소득-인건비-지원비-세금",
        exFlow.actorNetIncome,
        App.Money.roundWon(exFlow.actorGrossIncome - exFlow.directorCost - exFlow.actorBorneSupportCost - exFlow.personalTax));
    } catch (e) { fail("한눈에 비교 돈의 흐름 지원비 반영 예외", e.message || e); }

    try {
      var sPayMonth = empty();
      sPayMonth.profile.startMonth = "2026-10";
      sPayMonth.profile.endMonth = "2027-12";
      var payProject = App.Defaults.newProject("2026-11", "drama");
      payProject.name = "월입력테스트";
      payProject.contractAmount = 100000000;
      payProject.payments = [Object.assign(App.Defaults.newPayment("2026-11"), { amount: 100000000, inputMode: "amount" })];
      sPayMonth.projects = [payProject];
      var rPayMonth = App.Engine.runSimulation(sPayMonth);
      var htmlPayMonth = App.Render.renderView("revenue", sPayMonth, rPayMonth, { revenueTab: "work" });
      assert("예상 입금일이 직접 타이핑 가능한 텍스트 입력으로 렌더링됨",
        /data-path="projects\.0\.payments\.0\.expectedMonth"[^>]*data-kind="month"/.test(htmlPayMonth) ||
        /data-kind="month"[^>]*data-path="projects\.0\.payments\.0\.expectedMonth"/.test(htmlPayMonth));
      assert("예상 입금일 필드에 네이티브 month 피커(입력 불가 방식) 안 씀",
        !new RegExp('data-path="projects\\.0\\.payments\\.0\\.expectedMonth"[^>]*type="month"').test(htmlPayMonth));
      assert("2026-11로 정상 표시", htmlPayMonth.indexOf('value="2026-11"') >= 0);
    } catch (e) { fail("예상 입금일 직접 입력 예외", e.message || e); }

    var passed = results.filter(function (x) { return x.ok; }).length;
    var failed = results.filter(function (x) { return !x.ok; }).length;
    return { results: results, passed: passed, failed: failed };
  }

  App.Tests = { run: runTests };
})();
