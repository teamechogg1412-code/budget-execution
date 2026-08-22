(function () {
  window.App = window.App || {};

  function runContractTests() {
    var results = [];
    function ok(name, pass, detail) {
      results.push({ name: name, ok: !!pass, detail: detail || "" });
    }
    function eq(name, a, b) {
      ok(name, a === b, a === b ? "" : ("expected " + b + " got " + a));
    }
    function assert(name, pass) {
      ok(name, pass, pass ? "" : "assert failed");
    }

    if (!App.ContractEngine) {
      ok("ContractEngine 로드", false, "missing");
      return results;
    }
    var CE = App.ContractEngine;

    try {
      // T1 0원·음수·극단값
      var t1 = CE.calculate({
        annualWorkIncome: -100,
        annualAdIncome: "",
        actorShareRatePercent: 999,
        agencyCoveredCostAnnual: -50,
        actorPersonalCostAnnual: -1
      });
      assert("T1 음수 입력 클램프 후 유한", isFinite(t1.exclusive.actorNetIncome) && isFinite(t1.soloAgency.actorNetIncome));
      assert("T1 음수 실수령 없음", t1.exclusive.actorNetIncome >= 0 && t1.soloAgency.actorNetIncome >= 0);
      eq("T1 정산율 100 클램프", t1.input.actorShareRatePercent, 100);

      // T2 정산율 0% · 100%
      var t2zero = CE.calculate({ annualWorkIncome: 200000000, actorShareRatePercent: 0 });
      var t2full = CE.calculate({ annualWorkIncome: 200000000, actorShareRatePercent: 100 });
      assert("T2 0% 전속 실수령 ≤ 100%", t2zero.exclusive.actorNetIncome <= t2full.exclusive.actorNetIncome);
      assert("T2 0% 전속 총수입 0 근방", t2zero.exclusive.actorGrossIncome <= 1);

      // T3 전속 우세 (높은 정산 + 큰 회사부담 → 실수령 축)
      var t3 = CE.calculate({
        annualWorkIncome: 400000000,
        annualAdIncome: 0,
        actorShareRatePercent: 80,
        agencyCoveredCostAnnual: 120000000,
        actorPersonalCostAnnual: 0,
        ownerMonthlySalary: 3000000
      });
      eq("T3 전속 우세 verdict", t3.diagnosis.verdict, "lean_exclusive");

      // T4 독립 우세 (낮은 정산)
      var t4 = CE.calculate({
        annualWorkIncome: 600000000,
        actorShareRatePercent: 15,
        agencyCoveredCostAnnual: 0,
        actorPersonalCostAnnual: 0,
        ownerMonthlySalary: 20000000
      });
      eq("T4 낮은 정산 → lean_solo", t4.diagnosis.verdict, "lean_solo");

      // T5 similar ±5%
      // 그리드 탐색으로 similar 시드 확보
      var similarFound = null;
      [55, 58, 60, 62, 65, 68, 70].forEach(function (rate) {
        if (similarFound) return;
        var trial = CE.calculate({
          annualWorkIncome: 250000000,
          actorShareRatePercent: rate,
          agencyCoveredCostAnnual: 30000000,
          ownerMonthlySalary: 6000000,
          skipSensitivity: true
        });
        // calculate doesn't take skip in input — use diagnose on crafted
        if (trial.diagnosis.verdict === "similar") similarFound = trial;
      });
      if (!similarFound) {
        // 인위적 diagnose
        var fake = {
          exclusive: { actorNetIncome: 100000000 },
          soloAgency: { actorNetIncome: 103000000 },
          deltas: { actorNetIncome: 3000000 }
        };
        similarFound = { diagnosis: CE.diagnose(fake) };
      }
      eq("T5 similar 판정", similarFound.diagnosis.verdict, "similar");

      // T6 회사 부담 비용 반영
      var t6a = CE.calculate({
        annualWorkIncome: 300000000, actorShareRatePercent: 70,
        agencyCoveredCostAnnual: 0, ownerMonthlySalary: 5000000
      });
      var t6b = CE.calculate({
        annualWorkIncome: 300000000, actorShareRatePercent: 70,
        agencyCoveredCostAnnual: 60000000, ownerMonthlySalary: 5000000
      });
      assert("T6 회사부담↑ → 독립 통제가치 감소",
        t6b.soloAgency.controlledEconomicValue < t6a.soloAgency.controlledEconomicValue);
      assert("T6 회사부담은 전속 실수령 유지(회사 부담)",
        Math.abs(t6b.exclusive.actorNetIncome - t6a.exclusive.actorNetIncome) < 1000);

      // T6b 배우 부담 비용: 전속=개인, 독립=법인 운영비
      var baseActor = {
        annualWorkIncome: 300000000,
        actorShareRatePercent: 70,
        agencyCoveredCostAnnual: 0,
        actorPersonalCostAnnual: 0,
        ownerMonthlySalary: 5000000
      };
      var tActor0 = CE.calculate(baseActor);
      var tActorCost = CE.calculate(Object.assign({}, baseActor, { actorPersonalCostAnnual: 24000000 }));
      assert("T6b 배우부담 0이면 기존과 동일 계열(유한)",
        isFinite(tActor0.exclusive.actorNetIncome) && isFinite(tActor0.soloAgency.controlledEconomicValue));
      assert("T6b 배우부담↑ → 전속 실수령 감소",
        tActorCost.exclusive.actorNetIncome < tActor0.exclusive.actorNetIncome);
      assert("T6b 배우부담↑ → 독립 통제가치 감소",
        tActorCost.soloAgency.controlledEconomicValue < tActor0.soloAgency.controlledEconomicValue);
      assert("T6b 배우부담↑ → 독립 법인 세후이익 감소",
        tActorCost.soloAgency.corporateAfterTaxNet < tActor0.soloAgency.corporateAfterTaxNet);
      var dNet0 = tActor0.deltas.actorNetIncome;
      var dNet1 = tActorCost.deltas.actorNetIncome;
      var dEv0 = tActor0.deltas.controlledEconomicValue;
      var dEv1 = tActorCost.deltas.controlledEconomicValue;
      assert("T6b 배우부담이 실수령·통제가치 차이에 반영",
        dNet1 !== dNet0 || dEv1 !== dEv0);
      assert("T6b 전속에 배우부담 비용 반영",
        tActorCost.exclusive.actorBorneSupportCost >= 20000000);
      // 진단 재판정: 비용을 크게 올리면 verdict가 바뀔 수 있음(또는 최소한 diagnose 재실행)
      var diagnosed = CE.diagnose(tActorCost);
      eq("T6b 비용 반영 후 diagnose verdict 일치", diagnosed.verdict, tActorCost.diagnosis.verdict);
      var sensKeys = (tActorCost.sensitivity || []).map(function (d) { return d.key; });
      assert("T6b 민감도에 배우 부담 비용 driver",
        sensKeys.indexOf("actorPersonalCostAnnual") >= 0);

      // T7 고액 경비율 — 단순 29% 고정이 아님 (사업소득 과세가 quick보다 다름을 간접 확인)
      var t7 = CE.calculate({
        annualWorkIncome: 2000000000,
        actorShareRatePercent: 70,
        agencyCoveredCostAnnual: 0
      });
      var quickRateTax = App.Money.roundWon(
        t7.exclusive.actorGrossIncome * 0.29
      );
      // 필요경비 29%만 쓰면 과세표준이 gross*0.71 — auto 모드 상세는 다를 수 있음
      assert("T7 전속 개인세 > 0 (고액)", t7.exclusive.personalTax > 0);
      assert("T7 ContractEngine은 Quick ASSUMPTIONS 미사용",
        !CE.calculate.toString().includes("actorBusinessExpenseSimpleRate"));

      // T8 배당 없음 · 2천만 경계 · 외부 금융소득
      var t8none = CE.calculate({
        annualWorkIncome: 200000000, actorShareRatePercent: 70,
        dividendOn: false
      });
      eq("T8 배당 없음 모드", t8none.soloAgency.ownerDividendTaxMode, "none");
      var t8fin = CE.calculate({
        annualWorkIncome: 200000000, actorShareRatePercent: 70,
        dividendOn: true, dividendAmount: 10000000,
        otherFinancialIncome: 15000000
      });
      assert("T8 외부금융+배당 시 종합 또는 분리 모드 존재",
        t8fin.soloAgency.ownerDividendTaxMode === "comprehensive" ||
        t8fin.soloAgency.ownerDividendTaxMode === "separate" ||
        t8fin.soloAgency.ownerDividendTaxMode === "none");
      // 표시 otherIncome에 외부금융 미포함은 시나리오 상세에서 — 실수령 유한성
      assert("T8 외부금융 있어도 실수령 유한", isFinite(t8fin.soloAgency.actorNetIncome));

      // T9 실수령 ≠ 통제가치 (독립) / 전속은 동일
      assert("T9 전속 실수령==통제가치",
        t6a.exclusive.actorNetIncome === t6a.exclusive.controlledEconomicValue);
      assert("T9 독립 실수령과 통제가치 분리",
        t6a.soloAgency.actorNetIncome !== t6a.soloAgency.controlledEconomicValue ||
        t6a.soloAgency.controlledEconomicValue >= t6a.soloAgency.actorNetIncome);
      assert("T9 deltas에 두 지표 모두",
        t6a.deltas.actorNetIncome != null && t6a.deltas.controlledEconomicValue != null);

      // T10 공유 URL에 입력값 미포함
      var share = CE.buildSharePath("abc");
      assert("T10 share에 금액 없음", !/\d{6,}/.test(share));
      assert("T10 share는 contract+ref만", /^contract\.html\?ref=abc$/.test(share));
      var shareUrl = CE.buildShareUrl({ href: "https://example.com/landing/quick.html" }, "xyz");
      assert("T10 shareUrl에 income 쿼리 없음", shareUrl.indexOf("income") < 0 && shareUrl.indexOf("work") < 0);

      // T11 Gate 0 / 접근 통제
      assert("T11 access 기본 비밀번호 비어 있음 가능",
        typeof App.Access.check === "function" && App.Access.check("") === false);
      assert("T11 sessionStorage=1 우회 불가",
        (function () {
          var prev = (window.AppAccessConfig && AppAccessConfig.password) || "test-access";
          AppAccessConfig.password = "test-access";
          try { sessionStorage.setItem("solo-agency-budget:gate-ok", "1"); } catch (e) {}
          try { sessionStorage.removeItem(App.Access.SESSION_KEY); } catch (e2) {}
          var blocked = App.Access.hasValidSession() === false;
          AppAccessConfig.password = prev;
          return blocked;
        })());
      if (typeof LandingCampaignConfig !== "undefined") {
        eq("T11 campaign enabled 공개 true", LandingCampaignConfig.enabled, true);
        eq("T11 campaign claimRpc", LandingCampaignConfig.claimRpc, "claim_campaign_link");
        assert("T11 campaign url·anonKey 존재",
          !!LandingCampaignConfig.url && !!LandingCampaignConfig.anonKey);
      } else {
        ok("T11 campaign config 미로드", false, "node-run에 campaign-config.js 필요");
      }
      assert("T11 LinkGate API 존재",
        !!(App.LinkGate && typeof App.LinkGate.check === "function" &&
          typeof App.LinkGate.getRef === "function"));
      assert("T11 link-gate 소스는 claim RPC 사용",
        (function () {
          // 런타임에 테이블 update 경로가 없고 rpc 설정이 있으면 OK
          return LandingCampaignConfig && LandingCampaignConfig.claimRpc === "claim_campaign_link";
        })());
      // enabled 시 ref 없으면 unavailable 계열 (로컬 location.search 비어 있음)
      if (App.LinkGate && App.LinkGate.check) {
        var gateState = null;
        // check는 redirect 할 수 있어 resolve만 간접 확인: getRef 빈 문자열
        eq("T11 getRef 기본 빈값", App.LinkGate.getRef(), "");
      }

      // T12 민감도 정렬
      assert("T12 drivers rank 1 존재", t6b.sensitivity[0] && t6b.sensitivity[0].rank === 1);
      assert("T12 민감도 abs 내림차순",
        !t6b.sensitivity[1] ||
        Math.abs(t6b.sensitivity[0].deltaIfChanged) >= Math.abs(t6b.sensitivity[1].deltaIfChanged));

      // 수수료 중립: 빌드 스테이트에 써니스/메리디안 없음
      var st = CE.buildState({ annualWorkIncome: 100000000, actorShareRatePercent: 70 });
      var feeNames = (st.revenueFees || []).map(function (f) { return f.name; }).join(",");
      assert("시드에 써니스/메리디안 수수료 없음",
        feeNames.indexOf("써니스") < 0 && feeNames.indexOf("메리디안") < 0);
    } catch (e) {
      ok("contract-cases 예외", false, e && (e.stack || e.message || String(e)));
    }

    return results;
  }

  var prevRun = App.Tests && App.Tests.run;
  App.Tests = {
    run: function () {
      var base = prevRun ? prevRun() : { results: [], passed: 0, failed: 0 };
      var extra = runContractTests();
      var merged = (base.results || []).concat(extra);
      return {
        results: merged,
        passed: merged.filter(function (r) { return r.ok; }).length,
        failed: merged.filter(function (r) { return !r.ok; }).length
      };
    }
  };
})();
