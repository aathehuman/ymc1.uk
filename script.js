/* ==========================================
   YMC SHARED SITE LOGIC
   Navigation, footer, prayer display and forms
   ========================================== */

const YMC_TIME_ZONE = "Europe/London";
const EVENTS_DATA = [];
let PRAYER_DATA = [];

const NAV_ITEMS = [
  ["/", "Home", "index"],
  ["/prayer.html", "Prayer Times", "prayer"],
  ["/services/", "Services", "services"],
  ["/events.html", "Events", "events"],
  ["/resources/", "Resources", "resources"],
  ["/youth/", "Youth", "youth"],
  ["/about.html", "About", "about"]
];

const ymcClockPartsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: YMC_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23"
});


function ymcLondonParts(date = new Date()) {
  const values = {};
  ymcClockPartsFormatter.formatToParts(date).forEach(part => {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  });
  return values;
}

function localDateString(date = new Date()) {
  const { year, month, day } = ymcLondonParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function ymcDateKeyPlusDays(dateKey, days) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return date.toISOString().slice(0, 10);
}

function ymcFormatDateKey(dateKey, options) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function ymcTimeZoneOffsetMinutes(date) {
  const zoneName = new Intl.DateTimeFormat("en-GB", {
    timeZone: YMC_TIME_ZONE,
    timeZoneName: "shortOffset",
    hour: "2-digit"
  }).formatToParts(date).find(part => part.type === "timeZoneName")?.value || "GMT";

  if (zoneName === "GMT" || zoneName === "UTC") return 0;

  const match = zoneName.match(/(?:GMT|UTC)([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return 0;

  const minutes = Number(match[2]) * 60 + Number(match[3] || 0);
  return match[1] === "-" ? -minutes : minutes;
}

function ymcPrayerInstant(dateKey, time) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wallClockUtc = Date.UTC(year, month - 1, day, hour, minute);

  let offset = ymcTimeZoneOffsetMinutes(new Date(wallClockUtc));
  let instant = wallClockUtc - offset * 60_000;
  const correctedOffset = ymcTimeZoneOffsetMinutes(new Date(instant));
  if (correctedOffset !== offset) instant = wallClockUtc - correctedOffset * 60_000;
  return instant;
}

function getPageKey() {
  const path = location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/" || path === "/index.html") return "index";
  if (path === "/q&a.html" || path === "/qa.html" || path === "/guides.html") return "resources";
  if (path === "/services" || path.startsWith("/services/")) return "services";
  if (path === "/resources" || path.startsWith("/resources/")) return "resources";
  if (path === "/youth" || path.startsWith("/youth/")) return "youth";

  const file = path.split("/").pop() || "index.html";
  return file.replace(".html", "") || "index";
}

function renderSharedLayout() {
  const page = getPageKey();
  const oldNav = document.querySelector(".navbar");

  if (oldNav) {
    const navLinks = NAV_ITEMS.map(([href, label, key]) => (
      `<li><a href="${href}"${page === key ? ' class="active" aria-current="page"' : ""}>${label}</a></li>`
    )).join("");

    oldNav.outerHTML = `<nav class="navbar" aria-label="Main navigation"><div class="nav-container">
      <a href="/" class="nav-logo"><img class="logo-img" src="/assets/logos/edited-logo-notext.png" alt=""><div class="nav-logo-text"><span class="logo-text">YMC.</span><span class="logo-subtext">Yardley Muslim Centre.</span></div></a>
      <ul class="nav-menu" id="navMenu">${navLinks}<li><a href="/donate.html" class="nav-donate${page === "donate" ? " active" : ""}"><i class="fas fa-heart" aria-hidden="true"></i> Donate</a></li></ul>
      <button class="hamburger" id="hamburger" type="button" aria-label="Open navigation menu" aria-expanded="false" aria-controls="navMenu"><span></span><span></span><span></span></button>
    </div></nav>`;
  }

  const oldFooter = document.querySelector(".footer");
  if (oldFooter) {
    oldFooter.outerHTML = `<footer class="footer"><div class="container footer-grid">
      <div class="footer-col"><h3><a class="home-link" href="/">Yardley Muslim Centre</a></h3><p class="footer-tagline">Building Faith, Strengthening Community, Inspiring Futures.</p><div class="social-links"><a href="https://www.facebook.com/YardleyMuslimCentre/" target="_blank" rel="noopener noreferrer" aria-label="YMC on Facebook"><i class="fab fa-facebook-f"></i></a><a href="https://youtube.com/@TaqwaChannel-UK/" target="_blank" rel="noopener noreferrer" aria-label="YMC on YouTube"><i class="fa-brands fa-youtube"></i></a></div></div>
      <div class="footer-col"><h4>Quick Links</h4><ul class="footer-links"><li><a href="/prayer.html">Prayer Times</a></li><li><a href="/services/">Services</a></li><li><a href="/events.html">Events</a></li><li><a href="/resources/">Resources</a></li><li><a href="/youth/">Youth</a></li><li><a href="/about.html">About</a></li></ul></div>
      <div class="footer-col"><h4>Contact Us</h4><p><a href="https://maps.app.goo.gl/7oWLcudyF6aHySRFA" class="footer-link">47-51 Stoney Lane<br>Birmingham, B25 8RE</a></p><p><a href="tel:+447846252413" class="footer-link">07846 252 413</a> / <a href="tel:+447588475739" class="footer-link">07588 475 739</a></p><p><a href="mailto:salam@yardleymuslimcentre.co.uk" class="footer-link">salam@yardleymuslimcentre.co.uk</a></p></div>
      <div class="footer-col footer-donate-col"><h4>Support Us</h4><p>Your donations keep the mosque running.</p><a href="/donate.html" class="btn-donate">Donate Now</a></div>
    </div><div class="footer-bottom"><p>&copy; <span id="year"></span> Yardley Muslim Centre. All rights reserved.</p><p>Website by <a href="https://abdul-aziz.co.uk/">aa-infinitech</a></p></div></footer>`;
  }
}

function initNavbar() {
  const hamburger = document.getElementById("hamburger");
  const navMenu = document.getElementById("navMenu");
  if (!hamburger || !navMenu) return;

  hamburger.addEventListener("click", () => {
    const open = navMenu.classList.toggle("active");
    hamburger.setAttribute("aria-expanded", String(open));
    hamburger.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
  });
}

function ensureOpenGraph() {
  const descriptions = {
    index: "Yardley Muslim Centre — a local masjid and community centre serving Yardley, Birmingham.",
    prayer: "Prayer times and jamaat times at Yardley Muslim Centre.",
    services: "Services at Yardley Muslim Centre.",
    events: "Upcoming events and regular programmes at Yardley Muslim Centre.",
    resources: "Islamic guides, questions and community resources from Yardley Muslim Centre.",
    youth: "Youth programmes and opportunities at Yardley Muslim Centre.",
    about: "About and contact information for Yardley Muslim Centre.",
    donate: "Support Yardley Muslim Centre."
  };

  const description = descriptions[getPageKey()] || descriptions.index;
  const values = {
    "og:title": document.title,
    "og:description": description,
    "og:type": "website",
    "og:image": `${location.origin}/assets/images/hero-thumb.webp`,
    "og:url": location.href
  };

  Object.entries(values).forEach(([property, content]) => {
    let meta = document.querySelector(`meta[property="${property}"]`);
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("property", property);
      document.head.appendChild(meta);
    }
    meta.content = content;
  });
}

function updateClockAndDates() {
  const now = new Date();
  const parts = ymcLondonParts(now);

  const clockEl = document.getElementById("clock");
  if (clockEl) {
    clockEl.innerHTML = `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}<span class="seconds">:${String(parts.second).padStart(2, "0")}</span>`;
  }

  const gregEl = document.getElementById("gregorian-date");
  if (gregEl) {
    gregEl.textContent = new Intl.DateTimeFormat("en-GB", {
      timeZone: YMC_TIME_ZONE,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(now);
  }

  const hijriEl = document.getElementById("hijri-date");
  if (hijriEl) {
    try {
      hijriEl.textContent = new Intl.DateTimeFormat("en-US-u-ca-islamic-umalqura", {
        timeZone: YMC_TIME_ZONE,
        day: "numeric",
        month: "long",
        year: "numeric"
      }).format(now);
    } catch {
      hijriEl.textContent = "";
    }
  }

  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = parts.year;
}

function timeToMinutes(time) {
  if (!time || time === "—" || time === "-") return -1;
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function prayerRows(day) {
  return [
    ["Fajr", day.Fajr, day.FajrJamaat],
    ["Dhuhr", day.Dhuhr, day.DhuhrJamaat],
    ["Asr", day.Asr, day.AsrJamaat],
    ["Maghrib", day.Maghrib, day.MaghribJamaat],
    ["Isha", day.Isha, day.IshaJamaat]
  ];
}

function renderDailyPrayers() {
  const grid = document.getElementById("daily-prayers-grid");
  if (!grid) return;

  const now = new Date();
  const nowParts = ymcLondonParts(now);
  const todayKey = localDateString(now);
  const today = PRAYER_DATA.find(day => day.date === todayKey);
  const dateEl = document.getElementById("today-date-display");

  if (!today) {
    if (dateEl) dateEl.textContent = "The current timetable has not been uploaded yet.";
    grid.innerHTML = '<div class="prayer-unavailable"><i class="fa-regular fa-calendar-xmark"></i><div><strong>Prayer times temporarily unavailable</strong><span>Please check the full timetable or contact the mosque for today’s jamaat times.</span></div></div>';
    return;
  }

  if (dateEl) {
    dateEl.textContent = ymcFormatDateKey(today.date, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }

  const currentMinutes = nowParts.hour * 60 + nowParts.minute;
  const rows = prayerRows(today);
  const next = rows.find(([, start]) => timeToMinutes(start) > currentMinutes)?.[0] || null;

  grid.innerHTML = rows.map(([name, start, jamaat]) => (
    `<article class="prayer-day-card ${name === next ? "is-next" : ""}"><div class="prayer-card-top"><h3>${name}</h3>${name === next ? '<span class="next-chip">Next</span>' : ""}</div><div class="prayer-times-clean"><div class="jamaat-primary"><span class="time-label">Jamaat</span><strong>${jamaat}</strong></div><div class="start-secondary"><span class="time-label">Starts</span><span>${start}</span></div></div></article>`
  )).join("");
}

function renderTimetable() {
  const tbody = document.getElementById("timetable-body");
  const monthLabel = document.getElementById("current-month");
  if (!tbody) return;

  const todayKey = localDateString();
  tbody.innerHTML = PRAYER_DATA.map(day => (
    `<tr class="${day.date === todayKey ? "highlight" : ""}"><td>${ymcFormatDateKey(day.date, { day: "numeric", month: "short" })}</td><td><span class="adhan-time">${day.Fajr}</span><span class="jamaat-time">${day.FajrJamaat}</span></td><td>${day.Sunrise}</td><td><span class="adhan-time">${day.Dhuhr}</span><span class="jamaat-time">${day.DhuhrJamaat}</span></td><td><span class="adhan-time">${day.Asr}</span><span class="jamaat-time">${day.AsrJamaat}</span></td><td><span class="adhan-time">${day.Maghrib}</span><span class="jamaat-time">${day.MaghribJamaat}</span></td><td><span class="adhan-time">${day.Isha}</span><span class="jamaat-time">${day.IshaJamaat}</span></td></tr>`
  )).join("");

  if (monthLabel && PRAYER_DATA.length) {
    monthLabel.textContent = ymcFormatDateKey(PRAYER_DATA[0].date, {
      month: "long",
      year: "numeric"
    });
  }
}

function updateNextPrayer() {
  const nameEl = document.getElementById("next-prayer-name");
  if (!nameEl) return;

  const now = new Date();
  const todayKey = localDateString(now);
  const today = PRAYER_DATA.find(day => day.date === todayKey);
  const timeEl = document.getElementById("next-prayer-time");
  const countEl = document.getElementById("next-prayer-countdown");

  if (!today) {
    nameEl.textContent = "Times unavailable";
    if (timeEl) timeEl.textContent = "";
    if (countEl) countEl.textContent = "";
    return;
  }

  let next = prayerRows(today)
    .map(([name, start]) => ({
      name,
      time: start,
      target: ymcPrayerInstant(todayKey, start)
    }))
    .find(prayer => prayer.target > now.getTime());

  if (!next) {
    const tomorrowKey = ymcDateKeyPlusDays(todayKey, 1);
    const tomorrow = PRAYER_DATA.find(day => day.date === tomorrowKey);

    if (!tomorrow) {
      nameEl.textContent = "Tomorrow’s times pending";
      if (timeEl) timeEl.textContent = "";
      if (countEl) countEl.textContent = "";
      return;
    }

    next = {
      name: "Fajr (Tomorrow)",
      time: tomorrow.Fajr,
      target: ymcPrayerInstant(tomorrowKey, tomorrow.Fajr)
    };
  }

  nameEl.textContent = next.name;
  if (timeEl) timeEl.textContent = next.time;

  const difference = Math.max(0, Math.floor((next.target - now.getTime()) / 1000));
  const hours = Math.floor(difference / 3600);
  const minutes = Math.floor((difference % 3600) / 60);
  const seconds = difference % 60;

  if (countEl) {
    countEl.textContent = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
}

function renderEvents() {
  const regularGrid = document.getElementById("regular-events-grid");
  const specialGrid = document.getElementById("special-events-grid");
  if (!regularGrid && !specialGrid) return;

  const regular = EVENTS_DATA.filter(event => event.type === "regular");
  const today = localDateString();
  const special = EVENTS_DATA
    .filter(event => event.type === "special" && event.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  const card = event => {
    let top = event.badgeTop;
    let bottom = event.badgeBottom;

    if (event.date) {
      top = ymcFormatDateKey(event.date, { month: "short" });
      bottom = Number(event.date.slice(-2));
    }

    return `<article class="event-card"><div class="event-date-badge"><span class="month">${top}</span><span class="day">${bottom}</span></div><div class="event-info"><h3>${event.title}</h3><p>${event.desc}</p></div></article>`;
  };

  if (regularGrid) {
    regularGrid.innerHTML = regular.map(card).join("") || '<p class="empty-state">No regular events are listed at the moment.</p>';
  }

  if (specialGrid) {
    specialGrid.innerHTML = special.map(card).join("") || '<div class="empty-state"><i class="fa-regular fa-calendar"></i><strong>No special events announced yet.</strong><span>New events will appear here when they are confirmed.</span></div>';
  }
}

function initContactForm() {
  const form = document.getElementById("contactForm");
  if (!form) return;

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const button = form.querySelector('button[type="submit"]');
    const success = document.getElementById("form-success");
    const error = document.getElementById("form-error");

    button.textContent = "Sending...";
    button.disabled = true;

    try {
      const response = await fetch(form.action, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new FormData(form)
      });

      if (response.ok) {
        success.style.display = "block";
        error.style.display = "none";
        form.reset();
      } else {
        error.style.display = "block";
      }
    } catch {
      error.style.display = "block";
    } finally {
      button.textContent = "Send Message";
      button.disabled = false;
    }
  });
}

function initCopyButtons() {
  document.querySelectorAll(".copy-btn").forEach(button => {
    button.addEventListener("click", () => {
      navigator.clipboard.writeText(button.dataset.copy).then(() => {
        const oldContent = button.innerHTML;
        button.innerHTML = '<i class="fa-solid fa-check"></i>';
        button.classList.add("copied");

        setTimeout(() => {
          button.innerHTML = oldContent;
          button.classList.remove("copied");
        }, 2000);
      });
    });
  });
}

function respectReducedMotion() {
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const video = document.querySelector(".hero-video");
  if (video) {
    video.pause();
    video.removeAttribute("autoplay");
  }
}

async function loadPrayerData() {
  try {
    const module = await import("/prayer-data.js");
    PRAYER_DATA = Array.isArray(module.PRAYER_DATA) ? module.PRAYER_DATA : [];
  } catch (error) {
    console.error("Unable to load prayer timetable", error);
    PRAYER_DATA = [];
  }
}

async function init() {
  renderSharedLayout();
  initNavbar();
  ensureOpenGraph();
  initContactForm();
  initCopyButtons();
  respectReducedMotion();
  updateClockAndDates();

  await loadPrayerData();
  renderDailyPrayers();
  renderTimetable();
  renderEvents();
  updateNextPrayer();

  setInterval(updateClockAndDates, 1000);
  setInterval(updateNextPrayer, 1000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
