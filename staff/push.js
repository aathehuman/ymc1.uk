import { app, auth } from "../firebase.js";
import { webPushConfig } from "../firebase-config.js";
import {
  getMessaging,
  getToken,
  isSupported
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging.js";
import { writeAuditLog } from "./audit.js";

const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const STANDALONE = window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
const STAFF_TOKEN_KEY = "ymcStaffPushToken";
const STAFF_ENABLED_KEY = "ymcStaffPushEnabled";

function ensureStaffManifest() {
  if (document.querySelector('link[rel="manifest"]')) return;
  const link = document.createElement("link");
  link.rel = "manifest";
  link.href = "/staff/site.webmanifest";
  document.head.append(link);
}

async function getRegistration() {
  return navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
}

async function postStaffSubscription(token, action) {
  const user = auth?.currentUser;
  if (!user) throw new Error("Sign in again to change staff notifications.");
  const idToken = await user.getIdToken();
  const response = await fetch("/.netlify/functions/push-subscription", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify({ token, action, audience: "staff" })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Could not update staff notifications.");
}

function buildStaffSubscriptionCard() {
  const view = document.querySelector('[data-view="home"]');
  if (!view || view.querySelector("[data-staff-push-card]")) return null;

  const card = document.createElement("section");
  card.className = "staff-card staff-admin-card";
  card.dataset.staffPushCard = "";
  card.style.marginTop = "20px";
  card.innerHTML = `
    <div class="staff-card-heading">
      <span class="staff-card-icon"><i class="fa-solid fa-bell"></i></span>
      <div>
        <h3>Staff notifications</h3>
        <p data-staff-push-copy>Get alerts for new questions, youth applications and other staff-only updates on this device.</p>
      </div>
    </div>
    <div class="staff-heading-actions">
      <button class="btn-outline" type="button" data-staff-push-button>Enable staff notifications</button>
    </div>
    <p class="staff-status" data-staff-push-status aria-live="polite"></p>
  `;

  const actionGrid = view.querySelector(".staff-action-grid");
  if (actionGrid) actionGrid.insertAdjacentElement("afterend", card);
  else view.append(card);
  return card;
}

async function initStaffSubscriptionCard() {
  ensureStaffManifest();
  if (!app || !("Notification" in window) || !("serviceWorker" in navigator) || !(await isSupported())) return;

  const card = buildStaffSubscriptionCard();
  if (!card) return;
  const button = card.querySelector("[data-staff-push-button]");
  const copy = card.querySelector("[data-staff-push-copy]");
  const status = card.querySelector("[data-staff-push-status]");

  if (localStorage.getItem(STAFF_ENABLED_KEY) === "1" && Notification.permission === "granted") {
    button.textContent = "Disable staff notifications";
    button.dataset.enabled = "true";
    copy.textContent = "Staff-only alerts can reach this device.";
  }

  button.addEventListener("click", async () => {
    if (IOS && !STANDALONE) {
      status.textContent = "On iPhone, add the Staff Portal to your Home Screen, open it from there, then enable staff notifications.";
      return;
    }

    button.disabled = true;
    status.textContent = button.dataset.enabled === "true" ? "Disabling…" : "Enabling…";

    try {
      if (button.dataset.enabled === "true") {
        const token = localStorage.getItem(STAFF_TOKEN_KEY);
        if (token) await postStaffSubscription(token, "unsubscribe");
        localStorage.removeItem(STAFF_TOKEN_KEY);
        localStorage.removeItem(STAFF_ENABLED_KEY);
        button.textContent = "Enable staff notifications";
        button.dataset.enabled = "false";
        copy.textContent = "Get alerts for new questions, youth applications and other staff-only updates on this device.";
        status.textContent = "Staff notifications disabled on this device.";
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notifications are blocked for the Staff Portal on this device.");
      if (!webPushConfig?.vapidKey || webPushConfig.vapidKey.startsWith("PASTE_")) throw new Error("Web push is not fully configured yet.");

      const serviceWorkerRegistration = await getRegistration();
      const messaging = getMessaging(app);
      const token = await getToken(messaging, {
        vapidKey: webPushConfig.vapidKey,
        serviceWorkerRegistration
      });
      if (!token) throw new Error("Firebase did not return a messaging token.");

      await postStaffSubscription(token, "subscribe");
      localStorage.setItem(STAFF_TOKEN_KEY, token);
      localStorage.setItem(STAFF_ENABLED_KEY, "1");
      button.textContent = "Disable staff notifications";
      button.dataset.enabled = "true";
      copy.textContent = "Staff-only alerts can reach this device.";
      status.textContent = "Staff notifications enabled.";
    } catch (error) {
      console.error("Could not change staff notifications:", error);
      status.textContent = error.message || "Staff notifications could not be changed right now.";
    } finally {
      button.disabled = false;
    }
  });
}

function buildPushCard() {
  const view = document.querySelector('[data-view="content"]');
  if (!view || view.querySelector('[data-push-form]')) return;

  const card = document.createElement("section");
  card.className = "staff-card staff-admin-card";
  card.innerHTML = `
    <div class="staff-card-heading">
      <span class="staff-card-icon"><i class="fa-solid fa-bell"></i></span>
      <div>
        <h3>Send notification</h3>
        <p>Send an important push notification to devices that have enabled YMC notifications.</p>
      </div>
    </div>
    <form class="staff-form" data-push-form>
      <label>Title<input name="title" maxlength="80" placeholder="Important YMC update" required></label>
      <label>Message<textarea name="message" maxlength="240" placeholder="Write the notification message…" required></textarea></label>
      <label>Open when tapped<input name="link" maxlength="300" value="/" placeholder="/events.html"></label>
      <button class="btn-donate" type="submit"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Send notification</button>
      <p class="staff-status" data-push-status aria-live="polite"></p>
    </form>
  `;

  const firstGrid = view.querySelector(".staff-admin-grid");
  if (firstGrid) firstGrid.insertAdjacentElement("afterend", card);
  else view.append(card);

  const form = card.querySelector("[data-push-form]");
  const status = card.querySelector("[data-push-status]");

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const user = auth?.currentUser;
    if (!user) {
      status.textContent = "Sign in again before sending a notification.";
      return;
    }

    const data = new FormData(form);
    const payload = {
      title: String(data.get("title") || "").trim(),
      message: String(data.get("message") || "").trim(),
      link: String(data.get("link") || "/").trim() || "/"
    };

    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    status.textContent = "Sending…";

    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/.netlify/functions/send-push", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "The notification could not be sent.");

      status.textContent = "Notification sent to subscribed devices.";
      form.reset();
      form.elements.namedItem("link").value = "/";

      try {
        await writeAuditLog(
          "notification.send",
          "push-notification",
          result.messageId || "",
          `Sent notification: ${payload.title}`
        );
      } catch (error) {
        console.warn("Could not record notification in the audit log", error);
      }
    } catch (error) {
      console.error("Could not send push notification:", error);
      status.textContent = error.message || "The notification could not be sent.";
    } finally {
      submit.disabled = false;
    }
  });
}

buildPushCard();
initStaffSubscriptionCard().catch(error => console.warn("Staff notifications could not initialise:", error));
