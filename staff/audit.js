import { auth } from "../firebase.js";

const host = document.querySelector("[data-audit-list]");
const refreshButton = document.querySelector("[data-refresh-audit]");

function text(tag, value, className = "") {
  const element = document.createElement(tag);
  element.textContent = value || "";
  if (className) element.className = className;
  return element;
}

function formatWhen(value) {
  if (!value) return "Time unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London"
  }).format(date);
}

function actionIcon(action) {
  if (action.startsWith("staff.")) return "fa-user-shield";
  if (action.startsWith("event.")) return "fa-calendar-days";
  if (action.startsWith("announcement.")) return "fa-bullhorn";
  if (action.startsWith("question.")) return "fa-circle-question";
  if (action.startsWith("youth_application.")) return "fa-people-group";
  return "fa-clock-rotate-left";
}

async function authenticatedRequest(method, body) {
  const user = auth.currentUser;
  if (!user) throw new Error("Staff sign-in is required.");
  const token = await user.getIdToken();

  const response = await fetch("/.netlify/functions/audit-log", {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Audit log request failed.");
  return payload;
}

export async function writeAuditLog(action, resourceType, resourceId, summary) {
  return authenticatedRequest("POST", {
    action,
    resourceType,
    resourceId: resourceId || "",
    summary
  });
}

export async function loadAuditLog() {
  if (!host) return;
  host.replaceChildren(text("p", "Loading audit log…", "firebase-empty"));
  if (refreshButton) refreshButton.disabled = true;

  try {
    const payload = await authenticatedRequest("GET");
    const logs = Array.isArray(payload.logs) ? payload.logs : [];
    host.replaceChildren();

    logs.forEach(log => {
      const row = document.createElement("article");
      row.className = "staff-audit-row";

      const icon = document.createElement("span");
      icon.className = "staff-audit-icon";
      icon.setAttribute("aria-hidden", "true");
      const iconElement = document.createElement("i");
      iconElement.className = `fa-solid ${actionIcon(String(log.action || ""))}`;
      icon.append(iconElement);

      const copy = document.createElement("div");
      copy.className = "staff-audit-copy";
      copy.append(
        text("strong", log.summary || "Staff action"),
        text(
          "span",
          `${log.actorName || log.actorEmail || "YMC staff"} · ${formatWhen(log.createdAt)}`,
          "staff-audit-meta"
        )
      );

      row.append(icon, copy);
      host.append(row);
    });

    if (!logs.length) {
      host.append(text("p", "No staff actions have been recorded yet.", "firebase-empty"));
    }
  } catch (error) {
    console.error("Unable to load audit log", error);
    host.replaceChildren(text("p", "The audit log could not be loaded.", "firebase-empty"));
  } finally {
    if (refreshButton) refreshButton.disabled = false;
  }
}

refreshButton?.addEventListener("click", loadAuditLog);
