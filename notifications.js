import { app } from "./firebase.js";
import { webPushConfig } from "./firebase-config.js";
import {
  deleteToken,
  getMessaging,
  getToken,
  isSupported
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging.js";

const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const STANDALONE = window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;

function makePanel() {
  const panel = document.createElement("section");
  panel.className = "push-panel";
  panel.innerHTML = `
    <div class="push-panel-copy">
      <span class="push-panel-icon" aria-hidden="true"><i class="fa-solid fa-bell"></i></span>
      <div>
        <strong>YMC notifications</strong>
        <p data-push-copy>Get important mosque announcements on this device.</p>
      </div>
    </div>
    <button class="btn-outline push-panel-button" type="button" data-push-button>Enable notifications</button>
  `;

  const announcements = document.querySelector("[data-firebase-announcements]");
  if (announcements?.parentNode) announcements.insertAdjacentElement("afterend", panel);
  else document.querySelector("main, body")?.prepend(panel);
  return panel;
}

async function postSubscription(token, action) {
  const response = await fetch("/.netlify/functions/push-subscription", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, action })
  });
  if (!response.ok) throw new Error("Could not update notification subscription.");
}

async function getRegistration() {
  return navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
}

async function subscribe(button, copy) {
  if (IOS && !STANDALONE) {
    copy.textContent = "On iPhone, add ymc1.uk to your Home Screen first, then open it there and enable notifications.";
    return;
  }

  button.disabled = true;
  copy.textContent = "Enabling notifications…";
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      copy.textContent = "Notifications are blocked for this site. You can allow them later in your browser or device settings.";
      return;
    }

    if (!webPushConfig?.vapidKey || webPushConfig.vapidKey.startsWith("PASTE_")) {
      copy.textContent = "Notifications are not fully configured yet.";
      console.warn("YMC Web Push VAPID key is missing.");
      return;
    }

    const serviceWorkerRegistration = await getRegistration();
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: webPushConfig.vapidKey,
      serviceWorkerRegistration
    });
    if (!token) throw new Error("Firebase did not return a messaging token.");

    await postSubscription(token, "subscribe");
    localStorage.setItem("ymcPushToken", token);
    localStorage.setItem("ymcPushEnabled", "1");
    button.textContent = "Disable notifications";
    button.dataset.enabled = "true";
    copy.textContent = "Important YMC announcements can now reach this device even when the website is closed.";
  } catch (error) {
    console.error("Could not enable YMC notifications:", error);
    copy.textContent = "Notifications could not be enabled on this device right now.";
  } finally {
    button.disabled = false;
  }
}

async function unsubscribe(button, copy) {
  button.disabled = true;
  copy.textContent = "Disabling notifications…";
  try {
    const messaging = getMessaging(app);
    const token = localStorage.getItem("ymcPushToken");
    if (token) await postSubscription(token, "unsubscribe");
    await deleteToken(messaging).catch(() => false);
    localStorage.removeItem("ymcPushToken");
    localStorage.removeItem("ymcPushEnabled");
    button.textContent = "Enable notifications";
    button.dataset.enabled = "false";
    copy.textContent = "Get important mosque announcements on this device.";
  } catch (error) {
    console.error("Could not disable YMC notifications:", error);
    copy.textContent = "Notifications could not be disabled right now.";
  } finally {
    button.disabled = false;
  }
}

async function init() {
  if (!app || !("Notification" in window) || !("serviceWorker" in navigator) || !(await isSupported())) return;
  const panel = makePanel();
  const button = panel.querySelector("[data-push-button]");
  const copy = panel.querySelector("[data-push-copy]");

  if (localStorage.getItem("ymcPushEnabled") === "1" && Notification.permission === "granted") {
    button.textContent = "Disable notifications";
    button.dataset.enabled = "true";
    copy.textContent = "Important YMC announcements can reach this device.";
  }

  button.addEventListener("click", () => {
    if (button.dataset.enabled === "true") unsubscribe(button, copy);
    else subscribe(button, copy);
  });
}

init().catch(error => console.warn("YMC notifications could not initialise:", error));
