import { auth } from "../firebase.js";
import { writeAuditLog } from "./audit.js";

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
