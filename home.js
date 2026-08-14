import { db, isFirebaseConfigured } from "./firebase.js";
import {
  collection,
  getDocs,
  limit,
  query,
  where
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
];

const REMINDERS = [
  {
    text: "Surely, in the remembrance of Allah do hearts find comfort.",
    reference: "Qur’an 13:28"
  },
  {
    text: "Allah does not burden any soul with more than it can bear.",
    reference: "Qur’an 2:286"
  },
  {
    text: "Indeed, with hardship comes ease.",
    reference: "Qur’an 94:6"
  },
  {
    text: "Whoever puts their trust in Allah, He is sufficient for them.",
    reference: "Qur’an 65:3"
  },
  {
    text: "The most beloved deeds to Allah are those done consistently, even if small.",
    reference: "Sahih al-Bukhari 6464"
  },
  {
    text: "A good word is charity.",
    reference: "Sahih al-Bukhari 2989"
  },
  {
    text: "The strong believer is better and more beloved to Allah than the weak believer.",
    reference: "Sahih Muslim 2664"
  }
];

function londonDayName(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long"
  }).format(date).toLowerCase();
}

function londonDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function regularEventDay(item) {
  const direct = [item.dayOfWeek, item.weekday, item.recurrenceDay, item.day]
    .find(value => typeof value === "string" && value.trim());

  if (direct) {
    const normalised = direct.trim().toLowerCase();
    const matched = DAY_NAMES.find(day => normalised.includes(day));
    if (matched) return matched;
  }

  const combined = [item.badgeTop, item.badgeBottom, item.title, item.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return DAY_NAMES.find(day => combined.includes(day)) || null;
}

function happensToday(item, now = new Date()) {
  const start = toDate(item.startAt);
  if (start) return londonDateKey(start) === londonDateKey(now);
  if (item.type !== "regular") return false;

  const eventDay = regularEventDay(item);
  return eventDay ? eventDay === londonDayName(now) : false;
}

function formatEventTime(item) {
  const start = toDate(item.startAt);
  if (start) {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    }).format(start);
  }

  return [item.badgeTop, item.badgeBottom].filter(Boolean).join(" ") || "Today";
}

function makeEventItem(title, message, meta) {
  const article = document.createElement("article");
  article.className = "home-today-item";

  if (meta) {
    const small = document.createElement("p");
    small.className = "home-today-meta";
    small.textContent = meta;
    article.append(small);
  }

  const heading = document.createElement("h4");
  heading.textContent = title;
  article.append(heading);

  if (message) {
    const paragraph = document.createElement("p");
    paragraph.textContent = message;
    article.append(paragraph);
  }

  return article;
}

function renderReminder() {
  const text = document.getElementById("hero-reminder-text");
  const reference = document.getElementById("hero-reminder-reference");
  if (!text || !reference) return;

  const dayNumber = londonDateKey()
    .split("-")
    .reduce((total, value) => (total * 31) + Number(value), 0);
  const reminder = REMINDERS[dayNumber % REMINDERS.length];

  text.textContent = `“${reminder.text}”`;
  reference.textContent = reminder.reference;
}

async function renderTodayEvents() {
  const host = document.getElementById("home-today-events");
  if (!host) return;

  if (!isFirebaseConfigured() || !db) {
    host.innerHTML = '<p class="home-today-empty">Live programmes are unavailable.</p>';
    return;
  }

  try {
    const snapshot = await getDocs(query(
      collection(db, "events"),
      where("published", "==", true),
      limit(100)
    ));

    const items = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(item => happensToday(item))
      .sort((a, b) => (
        (toDate(a.startAt)?.getTime() ?? Number.MAX_SAFE_INTEGER)
        - (toDate(b.startAt)?.getTime() ?? Number.MAX_SAFE_INTEGER)
      ));

    host.replaceChildren();

    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "home-today-empty";
      empty.textContent = "No programmes are listed for today.";
      host.append(empty);
      return;
    }

    items.slice(0, 3).forEach(item => {
      host.append(makeEventItem(
        item.title || "YMC programme",
        item.description || "",
        formatEventTime(item)
      ));
    });
  } catch (error) {
    console.error("Unable to load homepage daily programmes", error);
    host.innerHTML = '<p class="home-today-empty">Today’s programmes could not be loaded.</p>';
  }
}

function initHome() {
  renderReminder();
  renderTodayEvents();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initHome);
} else {
  initHome();
}
