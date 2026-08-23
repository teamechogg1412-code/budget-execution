(function () {
  window.App = window.App || {};

  // 30초 「독립 가능성 테스트」 전용. contract-engine 수치와 동일하다고 주장하지 않는다.
  // 문항·가중치는 방향 안내용이며, 금액·세율을 계산하지 않는다.

  var QUESTIONS = [
    {
      id: "revenue",
      text: "최근 1년 기준, 작품·광고를 합친 수익 규모는?",
      options: [
        { value: "under1", label: "1억 미만", score: 8 },
        { value: "r1to3", label: "1억 ~ 3억", score: 16 },
        { value: "r3to10", label: "3억 ~ 10억", score: 22 },
        { value: "over10", label: "10억 이상", score: 26 }
      ]
    },
    {
      id: "rate",
      text: "현재 전속 정산에서 내가 가져가는 비율은?",
      options: [
        { value: "under50", label: "50% 미만", score: 24 },
        { value: "r50to70", label: "50% ~ 70%", score: 18 },
        { value: "r70to85", label: "70% ~ 85%", score: 10 },
        { value: "over85", label: "85% 이상", score: 4 }
      ]
    },
    {
      id: "covered",
      text: "소속사가 스타일링·차량·매니저 등을 대신 부담하는 정도는?",
      options: [
        { value: "none", label: "거의 없음 / 잘 모르겠음", score: 18 },
        { value: "some", label: "일부 있음", score: 10 },
        { value: "heavy", label: "상당 부분 부담", score: 4 }
      ]
    },
    {
      id: "staff",
      text: "1인 기획사를 만든다면, 바로 둘 스태프는?",
      options: [
        { value: "zero", label: "나 혼자 (0명)", score: 16 },
        { value: "oneTwo", label: "1~2명", score: 10 },
        { value: "threePlus", label: "3명 이상", score: 4 }
      ]
    },
    {
      id: "intent",
      text: "독립·1인 법인에 대한 지금 마음은?",
      options: [
        { value: "notNow", label: "당장 생각 없음", score: 2 },
        { value: "curious", label: "숫자만 궁금함", score: 12 },
        { value: "preparing", label: "준비·검토 중", score: 20 }
      ]
    },
    {
      id: "renewal",
      text: "다음 재계약(또는 조건 협상) 시점은?",
      options: [
        { value: "far", label: "1년 이상 남음", score: 4 },
        { value: "mid", label: "6개월 안쪽", score: 12 },
        { value: "soon", label: "임박했거나 진행 중", score: 18 }
      ]
    }
  ];

  var MAX_SCORE = QUESTIONS.reduce(function (sum, q) {
    var max = 0;
    for (var i = 0; i < q.options.length; i++) {
      if (q.options[i].score > max) max = q.options[i].score;
    }
    return sum + max;
  }, 0);

  function normalizeAnswers(raw) {
    raw = raw && typeof raw === "object" ? raw : {};
    var out = {};
    for (var i = 0; i < QUESTIONS.length; i++) {
      var id = QUESTIONS[i].id;
      out[id] = raw[id] != null ? String(raw[id]) : "";
    }
    return out;
  }

  function scoreAnswers(answers) {
    answers = normalizeAnswers(answers);
    var total = 0;
    var detail = [];
    var missing = [];
    for (var i = 0; i < QUESTIONS.length; i++) {
      var q = QUESTIONS[i];
      var chosen = answers[q.id];
      var hit = null;
      for (var j = 0; j < q.options.length; j++) {
        if (q.options[j].value === chosen) {
          hit = q.options[j];
          break;
        }
      }
      if (!hit) {
        missing.push(q.id);
        detail.push({ id: q.id, value: "", score: 0 });
        continue;
      }
      total += hit.score;
      detail.push({ id: q.id, value: hit.value, score: hit.score });
    }
    return { total: total, max: MAX_SCORE, detail: detail, missing: missing };
  }

  function bandForScore(total) {
    // 상대 비율보다 절대 구간으로 안내 (문항 가중치 합 기준)
    if (total >= 85) return "explore";
    if (total >= 55) return "watch";
    return "stay";
  }

  function resultCopy(band) {
    if (band === "explore") {
      return {
        title: "숫자로 한 번 깊게 볼 가치가 있습니다",
        body: "정산 비율·회사 부담·운영 의향을 종합하면, 전속 유지와 1인 기획사를 같은 지표로 비교해 보는 편이 도움이 됩니다.",
        ctaPrimary: "내 전속계약부터 분석하기",
        ctaPrimaryHref: "contract.html"
      };
    }
    if (band === "watch") {
      return {
        title: "조건에 따라 갈릴 수 있는 구간입니다",
        body: "매출·정산·회사 부담이 조금만 바뀌어도 방향이 달라질 수 있습니다. 대략 점수가 아니라 실제 숫자로 확인하는 것을 권합니다.",
        ctaPrimary: "내 전속계약부터 분석하기",
        ctaPrimaryHref: "contract.html"
      };
    }
    return {
      title: "지금은 전속 구조를 정리해 두는 단계로 보입니다",
      body: "당장 독립이 급하지 않더라도, 전속·정산 조건을 숫자로 보면 협상 기준이 분명해집니다. 원하시면 같은 도구로 바로 비교할 수 있습니다.",
      ctaPrimary: "전속 조건 숫자로 확인하기",
      ctaPrimaryHref: "contract.html"
    };
  }

  function evaluate(answers) {
    var scored = scoreAnswers(answers);
    if (scored.missing.length) {
      return {
        ok: false,
        missing: scored.missing.slice(),
        score: scored.total,
        maxScore: scored.max,
        band: null,
        copy: null,
        detail: scored.detail,
        disclaimer: "결과는 시뮬레이션 예상치이며 실제 세무 신고액과 다를 수 있습니다. 법률·세무 자문이 아닙니다. 이 테스트는 방향 안내용이며, 전속계약 분석(contract) 결과와 같은 수치가 아닙니다."
      };
    }
    var band = bandForScore(scored.total);
    return {
      ok: true,
      missing: [],
      score: scored.total,
      maxScore: scored.max,
      band: band,
      copy: resultCopy(band),
      detail: scored.detail,
      disclaimer: "결과는 시뮬레이션 예상치이며 실제 세무 신고액과 다를 수 있습니다. 법률·세무 자문이 아닙니다. 이 테스트는 방향 안내용이며, 전속계약 분석(contract) 결과와 같은 수치가 아닙니다."
    };
  }

  App.PulseEngine = {
    QUESTIONS: QUESTIONS,
    MAX_SCORE: MAX_SCORE,
    normalizeAnswers: normalizeAnswers,
    scoreAnswers: scoreAnswers,
    bandForScore: bandForScore,
    evaluate: evaluate
  };
})();
