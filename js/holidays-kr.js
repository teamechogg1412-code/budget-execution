(function () {
  window.App = window.App || {};

  var HOLIDAYS = {
    "2026-01-01": "신정",
    "2026-02-16": "설날 연휴",
    "2026-02-17": "설날",
    "2026-02-18": "설날 연휴",
    "2026-03-01": "삼일절",
    "2026-03-02": "대체공휴일(삼일절)",
    "2026-05-01": "근로자의 날",
    "2026-05-05": "어린이날",
    "2026-05-24": "부처님오신날",
    "2026-05-25": "대체공휴일(부처님오신날)",
    "2026-06-03": "전국동시지방선거",
    "2026-06-06": "현충일",
    "2026-07-17": "제헌절",
    "2026-08-15": "광복절",
    "2026-08-17": "대체공휴일(광복절)",
    "2026-09-24": "추석 연휴",
    "2026-09-25": "추석",
    "2026-09-26": "추석 연휴",
    "2026-09-28": "대체공휴일(추석)",
    "2026-10-03": "개천절",
    "2026-10-05": "대체공휴일(개천절)",
    "2026-10-09": "한글날",
    "2026-12-25": "크리스마스",

    "2027-01-01": "신정",
    "2027-02-06": "설날 연휴",
    "2027-02-07": "설날",
    "2027-02-08": "설날 연휴",
    "2027-02-09": "대체공휴일(설날)",
    "2027-03-01": "삼일절",
    "2027-05-01": "근로자의 날",
    "2027-05-03": "대체공휴일(근로자의 날)",
    "2027-05-05": "어린이날",
    "2027-05-13": "부처님오신날",
    "2027-06-06": "현충일",
    "2027-07-17": "제헌절",
    "2027-07-19": "대체공휴일(제헌절)",
    "2027-08-15": "광복절",
    "2027-08-16": "대체공휴일(광복절)",
    "2027-09-14": "추석 연휴",
    "2027-09-15": "추석",
    "2027-09-16": "추석 연휴",
    "2027-10-03": "개천절",
    "2027-10-04": "대체공휴일(개천절)",
    "2027-10-09": "한글날",
    "2027-10-11": "대체공휴일(한글날)",
    "2027-12-25": "크리스마스",
    "2027-12-27": "대체공휴일(크리스마스)",

    "2028-01-01": "신정",
    "2028-01-26": "설날 연휴",
    "2028-01-27": "설날",
    "2028-01-28": "설날 연휴",
    "2028-03-01": "삼일절",
    "2028-04-12": "국회의원선거",
    "2028-05-01": "근로자의 날",
    "2028-05-02": "부처님오신날",
    "2028-05-05": "어린이날",
    "2028-06-06": "현충일",
    "2028-07-17": "제헌절",
    "2028-08-15": "광복절",
    "2028-10-02": "추석 연휴",
    "2028-10-03": "개천절/추석",
    "2028-10-04": "추석 연휴",
    "2028-10-05": "대체공휴일(개천절)",
    "2028-10-09": "한글날",
    "2028-12-25": "크리스마스"
  };

  var SUPPORTED = [2026, 2027, 2028];

  function hasYearData(year) {
    return SUPPORTED.indexOf(Number(year)) !== -1;
  }

  function getHolidayMap(year) {
    var y = Number(year);
    if (!hasYearData(y)) return {};
    var prefix = y + "-";
    var map = {};
    Object.keys(HOLIDAYS).forEach(function (key) {
      if (key.indexOf(prefix) === 0) map[key] = HOLIDAYS[key];
    });
    return map;
  }

  function holidayName(dateKey) {
    return HOLIDAYS[dateKey] || "";
  }

  var SEASONAL_FALLBACK_MONTH = { seollal: "02", chuseok: "09" };

  function seasonalHolidayMonth(year, occasion) {
    var keyword = occasion === "chuseok" ? "추석" : "설날";
    var map = getHolidayMap(year);
    var found = null;
    Object.keys(map).sort().forEach(function (dateKey) {
      if (found) return;
      var name = map[dateKey];
      if (name.indexOf(keyword) < 0) return;
      if (name.indexOf("연휴") >= 0) return;
      if (name.indexOf("대체공휴일") >= 0) return;
      found = dateKey.slice(0, 7);
    });
    if (found) return found;
    var fallback = SEASONAL_FALLBACK_MONTH[occasion === "chuseok" ? "chuseok" : "seollal"];
    return year + "-" + fallback;
  }

  App.Holidays = {
    SUPPORTED: SUPPORTED.slice(),
    HOLIDAYS: HOLIDAYS,
    hasYearData: hasYearData,
    getHolidayMap: getHolidayMap,
    holidayName: holidayName,
    seasonalHolidayMonth: seasonalHolidayMonth
  };
})();
