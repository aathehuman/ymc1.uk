/* Add compact weekday labels to the monthly prayer timetable.
   Kept separate from shared site logic so the table stays readable on smaller screens. */
(function () {
  "use strict";

  function formatTimetableDate(dateKey) {
    var parts = dateKey.split("-").map(Number);
    var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12));

    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      weekday: "short",
      day: "numeric",
      month: "short"
    }).format(date);
  }

  function addWeekdays() {
    var tbody = document.getElementById("timetable-body");
    if (!tbody || !Array.isArray(window.PRAYER_DATA) && typeof PRAYER_DATA === "undefined") return;

    var data = typeof PRAYER_DATA !== "undefined" ? PRAYER_DATA : window.PRAYER_DATA;
    var rows = tbody.querySelectorAll("tr");

    for (var i = 0; i < rows.length && i < data.length; i += 1) {
      var firstCell = rows[i].querySelector("td");
      if (firstCell && data[i] && data[i].date) {
        firstCell.textContent = formatTimetableDate(data[i].date);
      }
    }
  }

  function start() {
    addWeekdays();

    var tbody = document.getElementById("timetable-body");
    if (tbody && window.MutationObserver) {
      new MutationObserver(addWeekdays).observe(tbody, { childList: true });
    } else {
      setTimeout(addWeekdays, 500);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
