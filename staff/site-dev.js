import { auth, db } from "../firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { writeAuditLog } from "./audit.js";

const PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
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
  return `
    <label class="staff-check">
      <input type="checkbox" name="${name}">
      <span><strong>${label}</strong>${description ? `<small>${description}</small>` : ""}</span>
    </label>
  `;
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
  });
  tabs.append(tab);

  const section = document.createElement("section");
  section.className = "hidden";
  section.dataset.view = "site-dev";
  section.innerHTML = `
    <div class="staff-section-heading">
      <p class="staff-kicker">Site developer</p>
      <h2>Notification automation</h2>
      <p>Control the automatic prayer notifications sent from YMC's published site.</p>
    </div>

    <section class="staff-card staff-admin-card">
      <div class="staff-card-heading">
        <span class="staff-card-icon"><i class="fa-solid fa-bell"></i></span>
        <div>
          <h3>Prayer notifications</h3>
          <p>Uses YMC's own timetable. Changes only affect future automatic notifications.</p>
        </div>
      </div>
      <form class="staff-form" data-prayer-notification-settings>
        ${checkbox("prayerNotificationsEnabled", "Automatic prayer notifications", "Master switch for all scheduled salah notifications.")}
        ${checkbox("startNotificationsEnabled", "Prayer start notifications", "Send when each enabled prayer time begins.")}
        ${checkbox("jamaatRemindersEnabled", "Jamaat reminders", "Send a second reminder only when the start-to-jamaat gap is long enough.")}

        <div class="staff-form-grid">
          <label>Minimum start-to-jamaat gap
            <div class="staff-input-suffix"><input type="number" name="minJamaatGapMinutes" min="1" max="180" required><span>minutes</span></div>
          </label>
          <label>Remind before jamaat
            <div class="staff-input-suffix"><input type="number" name="jamaatReminderMinutes" min="1" max="60" required><span>minutes</span></div>
          </label>
        </div>

        <fieldset class="staff-dev-prayers">
          <legend>Enabled prayers</legend>
          <div class="staff-dev-prayer-grid">
            ${PRAYERS.map(prayer => checkbox(`prayer-${prayer}`, prayer)).join("")}
          </div>
        </fieldset>

        <div class="staff-callout">
          <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
          <p>With the default 30-minute gap and 10-minute reminder, a prayer with a 77-minute gap gets a second push 10 minutes before jamaat, while a 15-minute gap does not.</p>
        </div>

        <button class="btn-donate" type="submit">Save automation settings</button>
        <p class="staff-status" data-prayer-notification-status aria-live="polite"></p>
      </form>
    </section>
  `;
  content.append(section);

  section.querySelector("[data-prayer-notification-settings]")?.addEventListener("submit", saveSettings);
}

async function token() {
  if (!auth.currentUser) throw new Error("Sign in again to continue.");
  return auth.currentUser.getIdToken();
}

function applySettings(settings) {
  const form = document.querySelector("[data-prayer-notification-settings]");
  if (!form) return;

  for (const key of ["prayerNotificationsEnabled", "startNotificationsEnabled", "jamaatRemindersEnabled"]) {
    form.elements.namedItem(key).checked = Boolean(settings[key]);
  }
  form.elements.namedItem("minJamaatGapMinutes").value = settings.minJamaatGapMinutes ?? 30;
  form.elements.namedItem("jamaatReminderMinutes").value = settings.jamaatReminderMinutes ?? 10;

  for (const prayer of PRAYERS) {
    form.elements.namedItem(`prayer-${prayer}`).checked = settings.prayers?.[prayer] !== false;
  }
}

async function loadSettings() {
  const status = document.querySelector("[data-prayer-notification-status]");
  if (!status) return;
  status.textContent = "Loading settings…";

  try {
    const response = await fetch("/.netlify/functions/notification-settings", {
      headers: { authorization: `Bearer ${await token()}` }
    });
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
    prayers: Object.fromEntries(PRAYERS.map(prayer => [
      prayer,
      form.elements.namedItem(`prayer-${prayer}`).checked
    ]))
  };

  submit.disabled = true;
  status.textContent = "Saving…";

  try {
    const response = await fetch("/.netlify/functions/notification-settings", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${await token()}`
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Could not save notification settings.");

    applySettings(result.settings || payload);
    status.textContent = "Automation settings saved.";

    try {
      await writeAuditLog(
        "notification.settings.update",
        "notification-settings",
        "prayer-automation",
        "Updated automatic prayer notification settings."
      );
    } catch (error) {
      console.warn("Could not record notification settings update", error);
    }
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
    if (snapshot.exists() && snapshot.data()?.role === "site-dev") {
      buildSiteDevView();
    }
  } catch (error) {
    console.warn("Could not check site developer role", error);
  }
});
