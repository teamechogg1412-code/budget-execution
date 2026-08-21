(function () {
  window.App = window.App || {};

  function xmlEscape(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function sheetName(name) {
    var s = String(name || "Sheet").replace(/[:\\\/?*\[\]]/g, " ").replace(/\s+/g, " ").trim();
    if (!s) s = "Sheet";
    return s.length > 31 ? s.slice(0, 31) : s;
  }

  function n(value) {
    return App.Money.roundWon(value);
  }

  function catLabel(id) {
    var rows = [].concat(App.WorkCategories || [], App.SalesCategories || [], App.Categories || []);
    var found = rows.filter(function (c) { return c && c.id === id; })[0];
    return (found && found.label) || id || "";
  }

  function statusLabel(id) {
    var rows = App.Statuses || [];
    var found = rows.filter(function (c) { return c && c.id === id; })[0];
    return (found && found.label) || id || "";
  }

  function s(value) { return { t: "s", v: value == null ? "" : String(value) }; }
  function h(value) { return { t: "s", v: value == null ? "" : String(value), style: "sHeader" }; }
  function won(value) { return { t: "n", v: n(value), style: "sWon" }; }
  function num(value) { return { t: "n", v: App.Money.toSafeNumber(value) }; }
  function pct(value) { return { t: "n", v: App.Money.toSafeNumber(value), style: "sPct" }; }
  function formula(expr) { return { t: "n", f: expr, style: "sWon" }; }
  function matchFormula(expr) { return { t: "b", f: expr, style: "sCheck" }; }

  function cellXml(cell) {
    if (!cell) return "<Cell/>";
    var attrs = "";
    if (cell.style) attrs += ' ss:StyleID="' + cell.style + '"';
    if (cell.f) attrs += ' ss:Formula="' + xmlEscape(cell.f) + '"';
    var type = cell.t === "n" ? "Number" : (cell.t === "b" ? "Boolean" : "String");
    var data = cell.t === "n" ? String(cell.v == null ? 0 : cell.v)
      : (cell.t === "b" ? (cell.v ? "1" : "0") : xmlEscape(cell.v));
    if (cell.f && cell.v == null) data = cell.t === "b" ? "0" : "0";
    return "<Cell" + attrs + '><Data ss:Type="' + type + '">' + data + "</Data></Cell>";
  }

  function rowXml(cells) {
    return "<Row>" + (cells || []).map(cellXml).join("") + "</Row>";
  }

  function worksheetXml(name, rows) {
    var body = (rows || []).map(rowXml).join("");
    return '<Worksheet ss:Name="' + xmlEscape(sheetName(name)) + '"><Table>' + body + "</Table></Worksheet>";
  }

  function blank() { return s(""); }

  function kpisSheet(state, result) {
    var k = (result && result.kpis) || {};
    var p = (state && state.profile) || {};
    var otherProjectDirect = n((k.projectDirect || 0) - (k.projectExpense || 0) - (k.lunchTruck || 0));
    var rows = [
      [h("항목"), h("금액(원)"), h("설명")],
      [s("배우/회사"), s(p.actorName || p.companyName || ""), s("")],
      [s("시뮬 시작월"), s(p.startMonth || ""), s("")],
      [s("시뮬 종료월"), s(p.endMonth || ""), s("")],
      [s("최초 보유현금"), won(k.initialCash), s("시작월 기초")],
      [s("기간 입금"), won(k.inflowInPeriod), s("시뮬 기간 안 매출 입금")],
      [s("기간 이전 입금"), won(k.inflowBeforePeriod), s("최초현금에 포함된 것으로 봄")],
      [s("기간 이후 입금"), won(k.inflowAfterPeriod), s("현금흐름 미반영")],
      [s("인건비(급여+보험+퇴직)"), won(k.payroll), s("4대보험은 회사부담만")],
      [s("운영비"), won(k.opex), s("반복+복리후생+일수+판관수수료+지원")],
      [s("프로젝트 진행비"), won(k.projectExpense), s("월별 반영분. 밥차·설립비용은 여기 없음")],
      [s("밥차"), won(k.lunchTruck), s("진행비와 별도. 손익비용에 따로 더함")],
      [s("에이전시 수수료"), won(k.agencyFees), s("손익비용에 포함")],
      [s("설립비용"), won(k.startup), s("비용 탭 초기비용. 월별비용 설립비용과 같음. 손익비용에 포함")],
      [s("기타 프로젝트 직접비"), won(otherProjectDirect), s("진행비·밥차 제외. 수동 직접비+프로젝트분류 수수료")],
      [s("손익비용 합계"), won(k.pnlExpense), s("월별현금 손익비용 합계와 같아야 함")],
      [s("보증금+자산"), won(k.fundingOut), s("손익 아님")],
      [s("대표 배당"), won(k.dividend), s("손익 아님. 세후 이익잉여금 인출")],
      [s("추정 법인세 등"), won(k.tax), s("손익비용 아님. 기간 손익 기준 참고치. 신고용 아님")],
      [s("영업이익"), won(k.operatingProfit), s("기간 입금 − 손익비용")],
      [s("최저 잔액"), won(k.minClosing), s(k.minMonth || "")],
      [s("기말 현금"), won(k.endClosing), s("월별현금 마지막 기말과 같아야 함")]
    ];
    return rows;
  }

  function guideSheet() {
    return [
      [h("엑셀 검산 안내")],
      [s("금액 단위는 원입니다. 콤마는 표시만이고 값은 정수입니다.")],
      [s("월별현금의 일치 열이 TRUE면 그달 엔진 숫자와 엑셀 공식이 같습니다.")],
      [s("4대보험 시트는 국민연금·건강보험·고용·산재의 회사(사용자) 부담만 있습니다. 직원 원천징수는 세전 월급 안에 있다고 봅니다.")],
      [s("복리후생 = (월 식대 + 회식·야근 여유) × 2 입니다. 식대 자체는 별도 지출이 아닙니다.")],
      [s("광고·시딩·행사·화보·앰버서더 기본 진행비는 계약금 %가 아니라 헤어·메이크업·스타일링 + 당일 식대 × 배율입니다.")],
      [s("촬영월이 없는 작품은 진행비가 등록만 되고 월별 현금에는 안 들어갑니다. 경고 시트를 보세요.")],
      [s("원장 비용은 화면과 같이 음수(지출)입니다. 월별비용 시트는 양수(나간 돈)입니다.")],
      [s("손익비용 = 인건비 + 운영비 + 진행비 + 밥차 + 에이전시 수수료 + 설립비용 + 기타 프로젝트 직접비입니다. 밥차와 설립비용은 진행비에 들어 있지 않습니다.")],
      [s("추정 법인세는 영업이익에 대한 참고 계산이며 손익비용에 넣지 않습니다.")]
    ].map(function (row) { return row; });
  }

  function monthlyCashSheet(result) {
    var months = (result && result.months) || [];
    var header = [
      h("월"), h("기초현금"), h("매출입금"), h("기타입금"), h("부가세예수금"),
      h("손익비용"), h("보증금"), h("자산"), h("세금납부"),
      h("현금지출"), h("기말_엔진"), h("기말_엑셀공식"), h("일치")
    ];
    var rows = [header];
    months.forEach(function (row) {
      rows.push([
        s(row.month),
        won(row.opening),
        won(row.inflow),
        won(row.otherInflow),
        won(row.vatOutput || 0),
        won(row.pnlExpense),
        won(row.deposits),
        won(row.capex),
        won(row.taxCashOut),
        won(row.cashOut),
        won(row.closing),
        formula("=RC[-10]+RC[-9]+RC[-8]+RC[-7]-RC[-2]"),
        matchFormula("=RC[-1]=RC[-2]")
      ]);
    });
    if (months.length) {
      rows.push([
        h("합계"), blank(),
        formula("=SUM(R[-" + months.length + "]C:R[-1]C)"),
        formula("=SUM(R[-" + months.length + "]C:R[-1]C)"),
        formula("=SUM(R[-" + months.length + "]C:R[-1]C)"),
        formula("=SUM(R[-" + months.length + "]C:R[-1]C)"),
        formula("=SUM(R[-" + months.length + "]C:R[-1]C)"),
        formula("=SUM(R[-" + months.length + "]C:R[-1]C)"),
        formula("=SUM(R[-" + months.length + "]C:R[-1]C)"),
        formula("=SUM(R[-" + months.length + "]C:R[-1]C)"),
        won(months[months.length - 1].closing),
        s("마지막 기말"),
        s("")
      ]);
    }
    return rows;
  }

  function monthlyCostSheet(result) {
    var months = (result && result.months) || [];
    var header = [
      h("월"), h("급여"), h("국민연금"), h("건강보험"), h("고용보험"), h("산재보험"),
      h("4대보험합_엔진"), h("4대보험합_엑셀"), h("보험일치"),
      h("퇴직"), h("복리후생"), h("반복운영"), h("회사지원"), h("일수비용"),
      h("직접비"), h("진행비"), h("밥차"), h("성사수수료"), h("매출연동수수료"), h("설립비용")
    ];
    var rows = [header];
    months.forEach(function (row) {
      var d = row.insuranceDetail || {};
      rows.push([
        s(row.month),
        won(row.payroll),
        won(d.pension),
        won(d.health),
        won(d.employment),
        won(d.industrialAccident),
        won(row.insurance),
        formula("=RC[-5]+RC[-4]+RC[-3]+RC[-2]"),
        matchFormula("=RC[-1]=RC[-2]"),
        won(row.severance),
        won(row.meal),
        won(row.recurring),
        won(row.support),
        won(row.dayBased),
        won(row.projectDirect),
        won(row.projectExpense),
        won(row.lunchTruck),
        won(row.fees),
        won(row.revenueFees),
        won(row.oneTimeOpEx)
      ]);
    });
    return rows;
  }

  function ledgerSheet(result) {
    var ledger = (result && result.ledger) || {};
    var months = ledger.months || ((result && result.months) || []).map(function (r) { return r.month; });
    var header = [h("구분"), h("항목")].concat(months.map(h)).concat([h("합계")]);
    var rows = [header];
    (ledger.groups || []).forEach(function (group) {
      var lines = (group.rows && group.rows.length) ? group.rows : [{
        label: (group.label || "") + " 합계",
        values: (group.subtotal && group.subtotal.values) || {},
        total: group.subtotal && group.subtotal.total
      }];
      lines.forEach(function (line) {
        var vals = line.values || {};
        var cells = [s(group.label || ""), s(line.label || "")];
        months.forEach(function (m) { cells.push(won(vals[m])); });
        cells.push(won(line.total));
        rows.push(cells);
      });
    });
    return rows;
  }

  function revenueSheet(state, result) {
    var rows = [[
      h("작품"), h("구분"), h("상태"), h("예산반영"), h("계약금"),
      h("지급라벨"), h("입금월"), h("지급액"), h("기간위치")
    ]];
    var period = App.Month.resolveSimulationPeriod(state || {});
    (state.projects || []).forEach(function (p) {
      var contract = App.Engine.projectContractAmount(p);
      var pays = (p.payments || []).length ? p.payments : [{ label: "(지급 없음)", expectedMonth: "", amount: 0 }];
      pays.forEach(function (pay, i) {
        var amt = App.Engine.resolvePaymentAmount ? App.Engine.resolvePaymentAmount(p, pay) : n(pay && pay.amount);
        var month = App.Month.normalizeMonth(pay && pay.expectedMonth) || "";
        var loc = "";
        if (month && period.startMonth && period.endMonth) {
          if (App.Month.diffMonths(month, period.startMonth) > 0) loc = "기간 이전";
          else if (App.Month.diffMonths(period.endMonth, month) > 0) loc = "기간 이후";
          else loc = "기간 내";
        }
        rows.push([
          s(i === 0 ? (p.name || "") : ""),
          s(i === 0 ? catLabel(p.category) : ""),
          s(i === 0 ? statusLabel(p.status) : ""),
          s(i === 0 ? (p.includeInBudget === false ? "OFF" : "ON") : ""),
          i === 0 ? won(contract) : blank(),
          s((pay && pay.label) || ""),
          s(month),
          won(amt),
          s(loc)
        ]);
      });
    });
    var gap = result && result.revenueGap;
    rows.push([s("")]);
    rows.push([h("매출 검산 등록"), won(gap && gap.registered), s("계약금 합")]);
    rows.push([s("기간 내 입금"), won(gap && gap.inPeriod), s("")]);
    rows.push([s("차이"), won(gap && gap.gap), s("0이어야 지급이 계약을 다 덮음")]);
    return rows;
  }

  function expenseSheet(state, result) {
    var rows = [[
      h("작품"), h("구분"), h("방식"), h("계약금"), h("진행비율"),
      h("헤메단가"), h("당일식대"), h("횟수"), h("배율"),
      h("등록 진행비"), h("월별 반영"), h("차이"), h("촬영/수행 시작"), h("종료")
    ]];
    (state.projects || []).forEach(function (p) {
      if (!p || p.includeInBudget === false) return;
      var detail = App.Engine.calculateProjectExpenseDetail(p, state);
      var registered = App.Engine.calculateProjectExpenseRegisteredTotal
        ? App.Engine.calculateProjectExpenseRegisteredTotal(p, state)
        : detail.total;
      var appearance = detail.appearance;
      var inPeriod = 0;
      Object.keys(detail.months || {}).forEach(function (m) {
        var bucket = "inPeriod";
        if (result && result.months && result.months.length) {
          var start = result.months[0].month;
          var end = result.months[result.months.length - 1].month;
          if (App.Month.diffMonths(m, start) > 0) bucket = "before";
          else if (App.Month.diffMonths(end, m) > 0) bucket = "after";
        }
        if (bucket === "inPeriod") inPeriod += n(detail.months[m]);
      });
      var mode = detail.amountMode === "manual" ? "수동"
        : (appearance ? ("헤메·식대 ×" + appearance.multiplier) : ((Math.round((detail.rate || 0) * 10000) / 100) + "%"));
      rows.push([
        s(p.name || ""),
        s(catLabel(p.category)),
        s(p.expenseInclude === false ? "반영 OFF" : mode),
        won(App.Engine.projectContractAmount(p)),
        pct(detail.rate),
        appearance ? won(appearance.session) : blank(),
        appearance ? won(appearance.meal) : blank(),
        appearance ? num(appearance.occurrences) : blank(),
        appearance ? num(appearance.multiplier) : blank(),
        won(p.expenseInclude === false ? 0 : registered),
        won(p.expenseInclude === false ? 0 : inPeriod),
        won((p.expenseInclude === false ? 0 : registered) - inPeriod),
        s(p.shootStartMonth || ""),
        s(p.shootEndMonth || "")
      ]);
    });
    var gap = result && result.projectExpenseGap;
    rows.push([s("")]);
    rows.push([h("진행비 검산 등록"), won(gap && gap.registered), s("월별 미반영 포함")]);
    rows.push([s("월별 분석 반영"), won(gap && gap.inPeriod), s("CF 진행비 KPI와 같아야 함")]);
    rows.push([s("차이"), won(gap && gap.gap), s("촬영월 없는 건이 여기 잡힘")]);
    return rows;
  }

  function payrollSheet(state, result) {
    var rates = (state.settings && state.settings.insuranceRates) || {};
    var rows = [
      [h("4대보험 요율"), h("값"), h("비고")],
      [s("국민연금 사용자부담"), pct(App.InsuranceRules && App.InsuranceRules.pensionEmployerFor
        ? App.InsuranceRules.pensionEmployerFor("2026-01")
        : rates.pensionEmployer), s("2026년부터 회사 4.75%(총 9.5%의 1/2). 직원 부담도 4.75%는 월급에서 원천. 직원별 기준소득월액 상·하한 후 요율")],
      [s("건강보험(회사)"), pct(rates.health), s("장기요양 회사분 포함 수준. 보수월액 상한 적용")],
      [s("고용보험(회사)"), pct(rates.employment), s("직원별 급여. 상한 없음")],
      [s("산재보험"), pct(rates.industrialAccident), s("전액 회사. 직원별 급여")],
      [s("상·하한 적용"), s(rates.useCaps === false ? "끄기" : "켜기"), s(App.InsuranceRules ? App.InsuranceRules.SOURCE : "")],
      [s("")],
      [h("월"), h("급여총액"), h("보험대상보수"), h("연금기준"), h("건보기준"), h("국민연금"), h("건강보험"), h("고용보험"), h("산재"), h("회사보험합")]
    ];
    ((result && result.months) || []).forEach(function (row) {
      var d = row.insuranceDetail || {};
      rows.push([
        s(row.month),
        won(row.payroll),
        won(d.base),
        won(d.pensionBase != null ? d.pensionBase : d.base),
        won(d.healthBase != null ? d.healthBase : d.base),
        won(d.pension),
        won(d.health),
        won(d.employment),
        won(d.industrialAccident),
        won(row.insurance)
      ]);
    });
    rows.push([s("")]);
    rows.push([h("직원"), h("역할"), h("월급여"), h("보험"), h("식대"), h("퇴직"), h("시작"), h("종료")]);
    (state.employees || []).forEach(function (emp) {
      if (!emp) return;
      rows.push([
        s(emp.name || ""),
        s(emp.role || ""),
        won(emp.monthlySalary),
        s(emp.insure ? "Y" : "N"),
        s(emp.meal ? "Y" : "N"),
        s(emp.severance ? "Y" : "N"),
        s(emp.startMonth || ""),
        s(emp.endMonth || "")
      ]);
    });
    return rows;
  }

  function welfareSheet(result) {
    var rows = [[
      h("월"), h("인원"), h("단가"), h("근무일"), h("월식대"),
      h("회식여유율"), h("회식여유액"), h("배율"), h("복리후생_엔진"), h("복리후생_엑셀"), h("일치")
    ]];
    ((result && result.months) || []).forEach(function (row) {
      var days = (row.mealBreakdown && row.mealBreakdown.workingDays) || 0;
      rows.push([
        s(row.month),
        num(row.mealHeadcount),
        won(row.mealDailyRate),
        num(days),
        won(row.mealBaseAmount),
        pct(row.mealExtraRate),
        won(row.mealExtraAmount),
        num(row.welfareMultiplier || 2),
        won(row.meal),
        formula("=(RC[-5]+RC[-3])*RC[-2]"),
        matchFormula("=RC[-1]=RC[-2]")
      ]);
    });
    return rows;
  }

  function warningSheet(result) {
    var rows = [[h("종류"), h("코드"), h("내용")]];
    ((result && result.warnings) || []).forEach(function (w) {
      rows.push([s("경고"), s(w.code || ""), s(w.message || "")]);
    });
    function pushGap(kind, gap) {
      ((gap && gap.issueItems) || []).forEach(function (item) {
        ((item.issues) || []).forEach(function (issue) {
          rows.push([
            s(kind),
            s(issue.code || issue.severity || ""),
            s((item.name || "") + " — " + (issue.text || ""))
          ]);
        });
      });
    }
    pushGap("매출검산", result && result.revenueGap);
    pushGap("진행비검산", result && result.projectExpenseGap);
    if (rows.length === 1) rows.push([s("(없음)"), s(""), s("경고·검산 이슈가 없습니다.")]);
    return rows;
  }

  function workbookXml(state, result) {
    App.Defaults.ensureState(state);
    result = result || App.Engine.runSimulation(state);
    var sheets = [
      worksheetXml("읽는법", guideSheet()),
      worksheetXml("요약", kpisSheet(state, result)),
      worksheetXml("월별현금", monthlyCashSheet(result)),
      worksheetXml("월별비용", monthlyCostSheet(result)),
      worksheetXml("원장", ledgerSheet(result)),
      worksheetXml("수익", revenueSheet(state, result)),
      worksheetXml("진행비", expenseSheet(state, result)),
      worksheetXml("인건비보험", payrollSheet(state, result)),
      worksheetXml("복리후생", welfareSheet(result)),
      worksheetXml("경고", warningSheet(result))
    ];
    return '<?xml version="1.0" encoding="UTF-8"?>' +
      '<?mso-application progid="Excel.Sheet"?>' +
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"' +
      ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
      "<Styles>" +
      '<Style ss:ID="sHeader"><Font ss:Bold="1"/></Style>' +
      '<Style ss:ID="sWon"><NumberFormat ss:Format="#,##0"/></Style>' +
      '<Style ss:ID="sPct"><NumberFormat ss:Format="0.000%"/></Style>' +
      '<Style ss:ID="sCheck"><Font ss:Bold="1"/></Style>' +
      "</Styles>" +
      sheets.join("") +
      "</Workbook>";
  }

  function fileName(state) {
    var p = (state && state.profile) || {};
    var who = (p.companyName || p.actorName || "1인기획사").replace(/[\\/:*?"<>|]/g, "");
    return who + "_검산_" + (p.startMonth || "") + "_" + (p.endMonth || "") + ".xls";
  }

  function download(state, result) {
    var xml = "\uFEFF" + workbookXml(state, result);
    if (typeof document === "undefined" || !document.createElement) return xml;
    var blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = fileName(state);
    a.click();
    URL.revokeObjectURL(url);
    return xml;
  }

  App.Export = {
    workbookXml: workbookXml,
    fileName: fileName,
    download: download
  };
})();
