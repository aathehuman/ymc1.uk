import { auth, db } from "../firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { writeAuditLog } from "./audit.js";

const PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
const PERMISSION_LABELS = {
  manageEvents: "Events",
  manageAnnouncements: "Announcements",
  manageQuestions: "Q&A",
  manageYouthApplications: "Youth applications",
  sendNotifications: "Push notifications",
  viewAudit: "Audit log"
};
let installed = false;

function setAllViews(name) {
  document.querySelectorAll("[data-view]").forEach(section => {
    section.classList.toggle("hidden", section.dataset.view !== name);
  });
  document.querySelectorAll("[data-view-button]").forEach(button => {
    button.classList.toggle("active", button.dataset.viewButton === name);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function checkbox(name, label, description = "") {
  return `<label class="staff-check"><input type="checkbox" name="${name}"><span><strong>${label}</strong>${description ? `<small>${description}</small>` : ""}</span></label>`;
}

function formatWhen(value) {
  if (!value) return "No meaningful activity recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No meaningful activity recorded";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }).format(date);
}

async function token() {
  if (!auth.currentUser) throw new Error("Sign in again to continue.");
  return auth.currentUser.getIdToken();
}

function buildSiteDevView() {
  if (installed) return;
  const tabs = document.querySelector(".staff-tabs");
  const content = document.querySelector(".staff-content");
  if (!tabs || !content) return;
  installed = true;

  const tab = document.createElement("button");
  tab.className = "staff-tab";
  tab.type = "button";
  tab.dataset.viewButton = "site-dev";
  tab.innerHTML = '<i class="fa-solid fa-code" aria-hidden="true"></i><span>Site dev</span>';
  tab.addEventListener("click", () => {
    setAllViews("site-dev");
    loadSettings();
    loadAccounts();
  });
  tabs.append(tab);

  const section = document.createElement("section");
  section.className = "hidden";
  section.dataset.view = "site-dev";
  section.innerHTML = `
    <div class="staff-section-heading"><p class="staff-kicker">Site developer</p><h2>Site controls</h2><p>Manage notification automation and staff access from one place.</p></div>

    <section class="staff-card staff-admin-card">
      <div class="staff-card-heading"><span class="staff-card-icon"><i class="fa-solid fa-users-gear"></i></span><div><h3>Staff accounts</h3><p>See approved accounts, recent meaningful activity and control what each person can manage.</p></div></div>
      <div class="staff-admin-list staff-account-permissions" data-staff-accounts><p class="firebase-empty">Open Site dev to load staff accounts.</p></div>
      <p class="staff-status" data-staff-accounts-status aria-live="polite"></p>
    </section>

    <section class="staff-card staff-admin-card">
      <div class="staff-card-heading"><span class="staff-card-icon"><i class="fa-solid fa-bell"></i></span><div><h3>Prayer notifications</h3><p>Uses YMC's own timetable. Changes only affect future automatic notifications.</p></div></div>
      <form class="staff-form" data-prayer-notification-settings>
        ${checkbox("prayerNotificationsEnabled", "Automatic prayer notifications", "Master switch for all scheduled salah notifications.")}
        ${checkbox("startNotificationsEnabled", "Prayer start notifications", "Send when each enabled prayer time begins.")}
        ${checkbox("jamaatRemindersEnabled", "Jamaat reminders", "Send a second reminder only when the start-to-jamaat gap is long enough.")}
        <div class="staff-form-grid">
          <label>Minimum start-to-jamaat gap<div class="staff-input-suffix"><input type="number" name="minJamaatGapMinutes" min="1" max="180" required><span>minutes</span></div></label>
          <label>Remind before jamaat<div class="staff-input-suffix"><input type="number" name="jamaatReminderMinutes" min="1" max="60" required><span>minutes</span></div></label>
        </div>
        <fieldset class="staff-dev-prayers"><legend>Enabled prayers</legend><div class="staff-dev-prayer-grid">${PRAYERS.map(prayer => checkbox(`prayer-${prayer}`, prayer)).join("")}</div></fieldset>
        <div class="staff-callout"><i class="fa-solid fa-circle-info" aria-hidden="true"></i><p>With the default 30-minute gap and 10-minute reminder, a prayer with a 77-minute gap gets a second push 10 minutes before jamaat, while a 15-minute gap does not.</p></div>
        <button class="btn-donate" type="submit">Save automation settings</button>
        <p class="staff-status" data-prayer-notification-status aria-live="polite"></p>
      </form>
    </section>
  `;
  content.append(section);
  section.querySelector("[data-prayer-notification-settings]")?.addEventListener("submit", saveSettings);
}

function accountCard(account) {
  const card = document.createElement("article");
  card.className = "admin-item staff-permission-card";

  const header = document.createElement("div");
  header.className = "admin-item-top";
  const copy = document.createElement("div");
  copy.className = "admin-item-copy";
  const title = document.createElement("h3");
  title.textContent = account.name || account.email || "Unnamed staff account";
  const meta = document.createElement("p");
  meta.className = "admin-meta";
  meta.textContent = `${account.email || "No email saved"} · ${account.role || "staff"}`;
  const last = document.createElement("p");
  last.className = "staff-account-last-action";
  last.textContent = account.lastAction ? `${account.lastAction.summary} · ${formatWhen(account.lastAction.createdAt)}` : "No meaningful activity recorded";
  copy.append(title, meta, last);
  header.append(copy);

  const form = document.createElement("form");
  form.className = "staff-form staff-permission-form";
  form.innerHTML = `
    <label>Display name<input name="name" maxlength="120" value="${String(account.name || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"></label>
    <label>Role<select name="role"><option value="staff" ${account.role !== "site-dev" ? "selected" : ""}>Staff</option><option value="site-dev" ${account.role === "site-dev" ? "selected" : ""}>Site developer</option></select></label>
    <fieldset class="staff-permission-fieldset"><legend>Permissions</legend><div class="staff-permission-grid">${Object.entries(PERMISSION_LABELS).map(([key, label]) => `<label class="staff-check"><input type="checkbox" name="${key}" ${account.permissions?.[key] ? "checked" : ""}><span>${label}</span></label>`).join("")}</div></fieldset>
    <button class="btn-outline" type="submit">Save access</button>
    <p class="staff-status" aria-live="polite"></p>
  `;

  if (account.isCurrentUser) {
    form.elements.namedItem("role").disabled = true;
    form.elements.namedItem("role").value = "site-dev";
  }

  form.addEventListener("submit", event => saveAccount(event, account.uid));
  card.append(header, form);
  return card;
}

async function loadAccounts() {
  const host = document.querySelector("[data-staff-accounts]");
  const status = document.querySelector("[data-staff-accounts-status]");
  if (!host) return;
  host.replaceChildren();
  host.append(Object.assign(document.createElement("p"), { className: "firebase-empty", textContent: "Loading staff accounts…" }));
  if (status) status.textContent = "";

  try {
    const response = await fetch("/.netlify/functions/staff-accounts", { headers: { authorization: `Bearer ${await token()}` } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Could not load staff accounts.");
    host.replaceChildren();
    for (const account of result.accounts || []) host.append(accountCard(account));
    if (!result.accounts?.length) host.append(Object.assign(document.createElement("p"), { className: "firebase-empty", textContent: "No approved staff accounts found." }));
  } catch (error) {
    console.error(error);
    host.replaceChildren(Object.assign(document.createElement("p"), { className: "firebase-empty", textContent: "Staff accounts could not be loaded." }));
    if (status) status.textContent = error.message || "Could not load staff accounts.";
  }
}

async function saveAccount(event, uid) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = form.querySelector(".staff-status");
  const submit = form.querySelector('button[type="submit"]');
  const roleField = form.elements.namedItem("role");
  const payload = {
    uid,
    name: String(form.elements.namedItem("name").value || "").trim(),
    role: roleField.disabled ? "site-dev" : roleField.value,
    permissions: Object.fromEntries(Object.keys(PERMISSION_LABELS).map(key => [key, form.elements.namedItem(key).checked]))
  };
  submit.disabled = true;
  status.textContent = "Saving…";
  try {
    const response = await fetch("/.netlify/functions/staff-accounts", {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${await token()}` },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Could not update staff access.");
    status.textContent = "Access updated.";
    await loadAccounts();
  } catch (error) {
    console.error(error);
    status.textContent = error.message || "Could not update staff access.";
  } finally {
    submit.disabled = false;
  }
}

function applySettings(settings) {
  const form = document.querySelector("[data-prayer-notification-settings]");
  if (!form) return;
  for (const key of ["prayerNotificationsEnabled", "startNotificationsEnabled", "jamaatRemindersEnabled"]) form.elements.namedItem(key).checked = Boolean(settings[key]);
  form.elements.namedItem("minJamaatGapMinutes").value = settings.minJamaatGapMinutes ?? 30;
  form.elements.namedItem("jamaatReminderMinutes").value = settings.jamaatReminderMinutes ?? 10;
  for (const prayer of PRAYERS) form.elements.namedItem(`prayer-${prayer}`).checked = settings.prayers?.[prayer] !== false;
}

async function loadSettings() {
  const status = document.querySelector("[data-prayer-notification-status]");
  if (!status) return;
  status.textContent = "Loading settings…";
  try {
    const response = await fetch("/.netlify/functions/notification-settings", { headers: { authorization: `Bearer ${await token()}` } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Could not load notification settings.");
    applySettings(result.settings || {});
    status.textContent = "";
  } catch (error) {
    console.error(error);
    status.textContent = error.message || "Could not load notification settings.";
  }
}

async function saveSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = form.querySelector("[data-prayer-notification-status]");
  const submit = form.querySelector('button[type="submit"]');
  const payload = {
    prayerNotificationsEnabled: form.elements.namedItem("prayerNotificationsEnabled").checked,
    startNotificationsEnabled: form.elements.namedItem("startNotificationsEnabled").checked,
    jamaatRemindersEnabled: form.elements.namedItem("jamaatRemindersEnabled").checked,
    minJamaatGapMinutes: Number(form.elements.namedItem("minJamaatGapMinutes").value),
    jamaatReminderMinutes: Number(form.elements.namedItem("jamaatReminderMinutes").value),
    prayers: Object.fromEntries(PRAYERS.map(prayer => [prayer, form.elements.namedItem(`prayer-${prayer}`).checked]))
  };
  submit.disabled = true;
  status.textContent = "Saving…";
  try {
    const response = await fetch("/.netlify/functions/notification-settings", {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${await token()}` },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Could not save notification settings.");
    applySettings(result.settings || payload);
    status.textContent = "Automation settings saved.";
    try { await writeAuditLog("notification.settings.update", "notification-settings", "prayer-automation", "Updated automatic prayer notification settings."); } catch (error) { console.warn("Could not record notification settings update", error); }
  } catch (error) {
    console.error(error);
    status.textContent = error.message || "Could not save notification settings.";
  } finally {
    submit.disabled = false;
  }
}

onAuthStateChanged(auth, async user => {
  if (!user || !db) return;
  try {
    const snapshot = await getDoc(doc(db, "admins", user.uid));
    if (snapshot.exists() && snapshot.data()?.role === "site-dev") buildSiteDevView();
  } catch (error) {
    console.warn("Could not check site developer role", error);
  }
});
