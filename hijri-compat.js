/* YMC Hijri date compatibility fallback for older browsers.
   Modern browsers keep using the site's native Umm al-Qura Intl formatter.
   Some older Android Intl builds silently ignore the requested Islamic calendar
   and return Gregorian month names / BC, so validate the result before showing it. */

(function () {
  "use strict";

  var HIJRI_MONTHS = [
    "Muharram", "Safar", "Rabi al-Awwal", "Rabi al-Thani",
    "Jumada al-Awwal", "Jumada al-Thani", "Rajab", "Sha'ban",
    "Ramadan", "Shawwal", "Dhu al-Qi'dah", "Dhu al-Hijjah"
  ];

  var GREGORIAN_MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  /* Umm al-Qura month starts covering the useful life of older signage devices.
     The native Intl result is still preferred whenever the browser supports it. */
  var UMM_AL_QURA_STARTS = [
    ["2025-06-26", 1447, 1], ["2025-07-26", 1447, 2],
    ["2025-08-24", 1447, 3], ["2025-09-23", 1447, 4],
    ["2025-10-23", 1447, 5], ["2025-11-22", 1447, 6],
    ["2025-12-21", 1447, 7], ["2026-01-20", 1447, 8],
    ["2026-02-18", 1447, 9], ["2026-03-20", 1447, 10],
    ["2026-04-18", 1447, 11], ["2026-05-18", 1447, 12],
    ["2026-06-16", 1448, 1], ["2026-07-15", 1448, 2],
    ["2026-08-14", 1448, 3], ["2026-09-12", 1448, 4],
    ["2026-10-12", 1448, 5], ["2026-11-11", 1448, 6],
    ["2026-12-10", 1448, 7], ["2027-01-09", 1448, 8],
    ["2027-02-08", 1448, 9], ["2027-03-09", 1448, 10],
    ["2027-04-08", 1448, 11], ["2027-05-07", 1448, 12],
    ["2027-06-06", 1449, 1], ["2027-07-05", 1449, 2],
    ["2027-08-03", 1449, 3], ["2027-09-02", 1449, 4],
    ["2027-10-01", 1449, 5], ["2027-10-31", 1449, 6],
    ["2027-11-29", 1449, 7], ["2027-12-29", 1449, 8],
    ["2028-01-28", 1449, 9], ["2028-02-26", 1449, 10],
    ["2028-03-27", 1449, 11], ["2028-04-26", 1449, 12],
    ["2028-05-25", 1450, 1], ["2028-06-24", 1450, 2],
    ["2028-07-23", 1450, 3], ["2028-08-22", 1450, 4],
    ["2028-09-20", 1450, 5], ["2028-10-19", 1450, 6],
    ["2028-11-18", 1450, 7], ["2028-12-17", 1450, 8],
    ["2029-01-16", 1450, 9], ["2029-02-14", 1450, 10],
    ["2029-03-16", 1450, 11], ["2029-04-15", 1450, 12],
    ["2029-05-14", 1451, 1], ["2029-06-13", 1451, 2],
    ["2029-07-13", 1451, 3], ["2029-08-12", 1451, 4],
    ["2029-09-10", 1451, 5], ["2029-10-09", 1451, 6],
    ["2029-11-08", 1451, 7], ["2029-12-07", 1451, 8]
  ];

  function dateKeyToUtc(key) {
    var parts = key.split("-");
    return Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function londonDateKey() {
    if (typeof ymcLondonParts === "function") {
      var parts = ymcLondonParts(new Date());
      return parts.year + "-" + String(parts.month).padStart(2, "0") + "-" + String(parts.day).padStart(2, "0");
    }

    var now = new Date();
    return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
  }

  function isValidHijriText(text) {
    if (!text || /\bBC\b/i.test(text)) return false;

    for (var i = 0; i < GREGORIAN_MONTHS.length; i += 1) {
      if (text.indexOf(GREGORIAN_MONTHS[i]) !== -1) return false;
    }

    for (var j = 0; j < HIJRI_MONTHS.length; j += 1) {
      if (text.indexOf(HIJRI_MONTHS[j]) !== -1) return true;
    }

    return false;
  }

  function fallbackHijriText() {
    var key = londonDateKey();
    var target = dateKeyToUtc(key);
    var selected = null;

    for (var i = 0; i < UMM_AL_QURA_STARTS.length; i += 1) {
      if (dateKeyToUtc(UMM_AL_QURA_STARTS[i][0]) <= target) {
        selected = UMM_AL_QURA_STARTS[i];
      } else {
        break;
      }
    }

    if (!selected) return "Hijri date unavailable";

    var day = Math.floor((target - dateKeyToUtc(selected[0])) / 86400000) + 1;
    if (day < 1 || day > 30) return "Hijri date unavailable";

    return HIJRI_MONTHS[selected[2] - 1] + " " + day + ", " + selected[1] + " AH";
  }

  function repairHijriDate() {
    var element = document.getElementById("hijri-date");
    if (!element || isValidHijriText(element.textContent)) return;
    element.textContent = fallbackHijriText();
  }

  function start() {
    var element = document.getElementById("hijri-date");
    if (!element) return;

    repairHijriDate();

    if (window.MutationObserver) {
      new MutationObserver(repairHijriDate).observe(element, {
        childList: true,
        characterData: true,
        subtree: true
      });
    } else {
      setInterval(repairHijriDate, 1000);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
