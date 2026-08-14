import { db, isFirebaseConfigured } from "./firebase.js";
import {
  addDoc,
  collection,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const SUBMISSION_COOLDOWN_MS = 60_000;

function setStatus(message, type = "info") {
  document.querySelectorAll("[data-firebase-status]").forEach(element => {
    element.textContent = message;
    element.dataset.status = type;
    element.hidden = false;
  });
}

function textElement(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = value || "";
  return element;
}

function toMillis(value) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  if (typeof value.toMillis === "function") return value.toMillis();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

function regularEventDayRank(item) {
  const weekdayOrder = ["friday", "saturday", "sunday", "monday", "tuesday", "wednesday", "thursday"];
  const searchable = [
    item.day,
    item.weekday,
    item.badgeTop,
    item.badgeBottom,
    item.title,
    item.description
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const index = weekdayOrder.findIndex(day => searchable.includes(day) || searchable.includes(day.slice(0, 3)));
  return index === -1 ? weekdayOrder.length : index;
}

function safeLink(link, url, label) {
  if (!url || !label) return;
  try {
    const resolved = new URL(url, location.origin);
    if (!["http:", "https:", "mailto:", "tel:"].includes(resolved.protocol)) return;
    link.href = resolved.href;
    link.textContent = label;
    if (resolved.origin !== location.origin && ["http:", "https:"].includes(resolved.protocol)) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
  } catch {
    link.remove();
  }
}

async function renderAnnouncements() {
  const host = document.querySelector("[data-firebase-announcements]");
  if (!host || !db) return;

  const snapshot = await getDocs(query(
    collection(db, "announcements"),
    where("active", "==", true),
    limit(20)
  ));

  const now = Date.now();
  const items = snapshot.docs
    .map(document => ({ id: document.id, ...document.data() }))
    .filter(item => !item.expiresAt || toMillis(item.expiresAt) >= now)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));

  if (!items.length) return;

  host.replaceChildren();
  host.hidden = false;

  items.forEach(item => {
    const notice = document.createElement("article");
    notice.className = "firebase-notice";
    notice.append(
      textElement("strong", "firebase-notice-title", item.title || "Notice"),
      textElement("p", "firebase-notice-message", item.message || "")
    );

    if (item.linkUrl && item.linkLabel) {
      const link = document.createElement("a");
      link.className = "firebase-notice-link";
      safeLink(link, item.linkUrl, item.linkLabel);
      if (link.isConnected || link.href) notice.append(link);
    }

    host.append(notice);
  });
}

function eventBadge(item) {
  if (item.startAt) {
    const date = typeof item.startAt.toDate === "function"
      ? item.startAt.toDate()
      : new Date(item.startAt);

    if (!Number.isNaN(date.getTime())) {
      return {
        top: date.toLocaleDateString("en-GB", { month: "short", timeZone: "Europe/London" }),
        bottom: date.toLocaleDateString("en-GB", { day: "numeric", timeZone: "Europe/London" })
      };
    }
  }

  return {
    top: item.badgeTop || (item.type === "regular" ? "Every" : "Soon"),
    bottom: item.badgeBottom || (item.type === "regular" ? "Week" : "—")
  };
}

function buildEventCard(item) {
  const card = document.createElement("article");
  card.className = "event-card";

  const badgeValues = eventBadge(item);
  const badge = document.createElement("div");
  badge.className = "event-date-badge";
  badge.append(
    textElement("span", "month", badgeValues.top),
    textElement("span", "day", badgeValues.bottom)
  );

  const info = document.createElement("div");
  info.className = "event-info";
  info.append(
    textElement("h3", "", item.title || "Untitled event"),
    textElement("p", "", item.description || "")
  );

  if (item.linkUrl && item.linkLabel) {
    const link = document.createElement("a");
    link.className = "firebase-event-link";
    safeLink(link, item.linkUrl, item.linkLabel);
    if (link.href) info.append(link);
  }

  card.append(badge, info);
  return card;
}

async function renderEvents() {
  const regularGrid = document.getElementById("regular-events-grid");
  const specialGrid = document.getElementById("special-events-grid");
  if ((!regularGrid && !specialGrid) || !db) return;

  const snapshot = await getDocs(query(
    collection(db, "events"),
    where("published", "==", true),
    limit(100)
  ));

  const events = snapshot.docs
    .map(document => ({ id: document.id, ...document.data() }))
    .sort((a, b) => toMillis(a.startAt) - toMillis(b.startAt));

  if (!events.length) return;

  const regular = events
    .filter(item => item.type === "regular")
    .sort((a, b) => {
      const dayDifference = regularEventDayRank(a) - regularEventDayRank(b);
      if (dayDifference !== 0) return dayDifference;
      return toMillis(a.startAt) - toMillis(b.startAt);
    });
  const special = events.filter(item => item.type !== "regular");

  if (regularGrid && regular.length) {
    regularGrid.replaceChildren(...regular.map(buildEventCard));
  }

  if (specialGrid && special.length) {
    specialGrid.replaceChildren(...special.map(buildEventCard));
  }
}

async function renderPublishedQas() {
  const host = document.querySelector("[data-published-qas]");
  if (!host || !db) return;

  const snapshot = await getDocs(query(
    collection(db, "publishedQas"),
    where("published", "==", true),
    limit(100)
  ));

  const items = snapshot.docs
    .map(document => ({ id: document.id, ...document.data() }))
    .sort((a, b) => toMillis(b.publishedAt) - toMillis(a.publishedAt));

  host.replaceChildren();

  if (!items.length) {
    host.append(textElement("p", "firebase-empty", "No questions have been published yet."));
    return;
  }

  items.forEach(item => {
    const card = document.createElement("article");
    card.className = "qa-card";
    card.append(
      textElement("h3", "qa-question", item.question || "Question"),
      textElement("p", "qa-answer", item.answer || "")
    );
    host.append(card);
  });
}

function initialiseQuestionForm() {
  const form = document.querySelector("[data-question-form]");
  if (!form || !db) return;

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const button = form.querySelector("button[type='submit']");
    const result = form.querySelector("[data-form-result]");
    const data = new FormData(form);
    const question = String(data.get("question") || "").trim();
    const honeypot = String(data.get("website") || "").trim();

    if (honeypot) return;

    if (question.length < 10) {
      result.textContent = "Please add a little more detail to your question.";
      result.dataset.status = "error";
      return;
    }

    const lastSubmission = Number(localStorage.getItem("ymc-question-submitted-at") || 0);
    if (Date.now() - lastSubmission < SUBMISSION_COOLDOWN_MS) {
      result.textContent = "Please wait a minute before submitting another question.";
      result.dataset.status = "error";
      return;
    }

    button.disabled = true;
    button.textContent = "Sending…";

    try {
      const anonymous = data.get("anonymous") === "on";
      await addDoc(collection(db, "questions"), {
        name: anonymous ? "" : String(data.get("name") || "").trim(),
        email: String(data.get("email") || "").trim(),
        anonymous,
        question,
        status: "new",
        createdAt: serverTimestamp()
      });

      localStorage.setItem("ymc-question-submitted-at", String(Date.now()));
      form.reset();
      result.textContent = "Question sent. It will be reviewed before anything is published, InShaaAllah.";
      result.dataset.status = "success";
    } catch (error) {
      console.error(error);
      result.textContent = "The question could not be sent. Please try again later.";
      result.dataset.status = "error";
    } finally {
      button.disabled = false;
      button.textContent = "Send Question";
    }
  });
}

async function init() {
  if (!isFirebaseConfigured() || !db) {
    setStatus("Live content is not connected yet. The normal website remains available.", "setup");
    return;
  }

  try {
    await Promise.all([
      renderAnnouncements(),
      renderEvents(),
      renderPublishedQas()
    ]);
    initialiseQuestionForm();
  } catch (error) {
    console.error(error);
    setStatus("Live content could not be loaded. The normal website content is still available.", "error");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
