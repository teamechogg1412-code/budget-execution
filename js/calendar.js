(function () {
  window.App = window.App || {};

  function dateSet(list) {
    var set = {};
    (list || []).forEach(function (item) {
      var key = typeof item === "string" ? item : item && item.date;
      if (key) set[key] = item.label || true;
    });
    return set;
  }

  function calculateWorkingDays(month, settings, customHolidays, forcedWorkdays) {
    var parsed = App.Month.parseMonth(month);
    var empty = {
      workingDays: 0,
      weekdays: 0,
      holidaysExcluded: 0,
      customOff: 0,
      forcedOn: 0,
      missingHolidayYear: false
    };
    if (!parsed) return empty;

    var mode = (settings && settings.calendarMode) || "weekdaysExcludingHolidays";
    var workWeek = (settings && settings.workWeek) || [1, 2, 3, 4, 5];
    var custom = dateSet(customHolidays);
    var forced = dateSet(forcedWorkdays);
    var yearOk = App.Holidays.hasYearData(parsed.year);
    var holidayMap = App.Holidays.getHolidayMap(parsed.year);
    var needsHolidays = mode === "weekdaysExcludingHolidays" || mode === "custom";

    var weekdays = 0;
    var holidaysExcluded = 0;
    var customOff = 0;
    var forcedOn = 0;
    var workingDays = 0;
    var days = App.Month.daysInMonth(month);

    for (var d = 1; d <= days; d++) {
      var date = new Date(parsed.year, parsed.month - 1, d);
      var dow = date.getDay();
      var key = App.Month.dateKey(parsed.year, parsed.month, d);
      var isWeekend = dow === 0 || dow === 6;
      if (!isWeekend) weekdays += 1;

      if (forced[key]) {
        workingDays += 1;
        forcedOn += 1;
        continue;
      }
      if (custom[key]) {
        customOff += 1;
        continue;
      }

      var isHoliday = !!holidayMap[key];
      var include = false;
      if (mode === "allDays") {
        include = true;
      } else if (mode === "weekdays") {
        include = !isWeekend;
      } else if (mode === "custom") {
        include = workWeek.indexOf(dow) !== -1;
        if (include && isHoliday && yearOk) {
          include = false;
          holidaysExcluded += 1;
        }
      } else {
        include = !isWeekend;
        if (include && isHoliday && yearOk) {
          include = false;
          holidaysExcluded += 1;
        }
      }

      if (include) workingDays += 1;
    }

    return {
      workingDays: workingDays,
      weekdays: weekdays,
      holidaysExcluded: holidaysExcluded,
      customOff: customOff,
      forcedOn: forcedOn,
      missingHolidayYear: needsHolidays && !yearOk
    };
  }

  App.Calendar = {
    calculateWorkingDays: calculateWorkingDays
  };
})();
