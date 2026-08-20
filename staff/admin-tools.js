import { auth, db } from "../firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { writeAuditLog } from "./audit.js";

const statusElement = document.querySelector("[data-admin-status]");
const eventForm = document.querySelector("[data-event-form]");
const announcementForm = document.querySelector("[data-announcement-form]");
let editingEventId = null;
let editingAnnouncementId = null;
let bound = false;

function setStatus(message, type = "info") {
  if (!statusElement) return;
  statusElement.textContent = message;
  statusElement.dataset.status = type;
}

function text(tag, value, className = "") {
  const element = document.createElement(tag);
  element.textContent = value || "";
  if (className) element.className = className;
  return element;
}

function timestampValue(value) {
  return value ? Timestamp.fromDate(new Date(value)) : null;
}

function datetimeLocalValue(value) {
  if (!value) return "";
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function setField(form, name, value) {
  const field = form?.elements.namedItem(name);
  if (!field) return;
  if (field.type === "checkbox") field.checked = Boolean(value);
  else field.value = value ?? "";
}

async function recordAudit(action, resourceType, resourceId, summary) {
  try {
    await writeAuditLog(action, resourceType, resourceId, summary);
  } catch (error) {
    console.warn("Could not record audit event", action, error);
  }
}

async function sendAnswerNotification(item) {
  const email = String(item.email || "").trim();
  if (!email) return { skipped: true };
  if (!auth.currentUser) throw new Error("Staff sign-in is required.");

  const token = await auth.currentUser.getIdToken();
  const response = await fetch("/.netlify/functions/send-question-answer", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ questionId: item.id })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Could not send the answer email.");
  return payload;
}

function showPortalView(name) {
  document.querySelectorAll("[data-view]").forEach(section => {
    section.classList.toggle("hidden", section.dataset.view !== name);
  });
  document.querySelectorAll("[data-view-button]").forEach(button => {
    button.classList.toggle("active", button.dataset.viewButton === name);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll("[data-go-view]").forEach(button => {
  button.addEventListener("click", () => showPortalView(button.dataset.goView));
});

function resetEditor(form, type) {
  form?.reset();
  if (type === "event") {
    editingEventId = null;
    setField(form, "published", true);
  } else {
    editingAnnouncementId = null;
    setField(form, "active", true);
  }

  const submit = form?.querySelector("button[type='submit']");
  if (submit) submit.textContent = type === "event" ? "Save Event" : "Save Announcement";
  form?.querySelector("[data-cancel-edit]")?.remove();
}

function addCancelButton(form, type) {
  if (!form || form.querySelector("[data-cancel-edit]")) return;
  const submit = form.querySelector("button[type='submit']");
  if (!submit) return;

  const cancel = text("button", "Cancel Edit", "admin-secondary");
  cancel.type = "button";
  cancel.dataset.cancelEdit = "";
  cancel.addEventListener("click", () => {
    resetEditor(form, type);
    setStatus("Edit cancelled.");
  });
  submit.insertAdjacentElement("afterend", cancel);
}

function itemCard(title, description, meta, status, onEdit, onDelete) {
  const card = document.createElement("article");
  card.className = "admin-item";

  const top = document.createElement("div");
  top.className = "admin-item-top";

  const copy = document.createElement("div");
  copy.className = "admin-item-copy";
  copy.append(text("h3", title), text("p", description));

  const metaRow = document.createElement("div");
  metaRow.className = "admin-item-meta-row";
  metaRow.append(text("span", meta, "admin-meta"));
  if (status) {
    metaRow.append(text("span", status.label, `admin-status-badge ${status.active ? "is-active" : "is-inactive"}`));
  }
  copy.append(metaRow);

  const actions = document.createElement("div");
  actions.className = "admin-item-actions";

  const edit = text("button", "Edit", "admin-edit");
  edit.type = "button";
  edit.addEventListener("click", onEdit);

  const remove = text("button", "Delete", "admin-danger");
  remove.type = "button";
  remove.addEventListener("click", async () => {
    if (!confirm(`Delete “${title}”?`)) return;
    remove.disabled = true;
    try {
      await onDelete();
    } finally {
      remove.disabled = false;
    }
  });

  actions.append(edit, remove);
  top.append(copy, actions);
  card.append(top);
  return card;
}

function editEvent(item) {
  editingEventId = item.id;
  setField(eventForm, "type", item.type || "special");
  setField(eventForm, "title", item.title);
  setField(eventForm, "description", item.description);
  setField(eventForm, "startAt", datetimeLocalValue(item.startAt));
  setField(eventForm, "badgeTop", item.badgeTop);
  setField(eventForm, "badgeBottom", item.badgeBottom);
  setField(eventForm, "linkUrl", item.linkUrl);
  setField(eventForm, "linkLabel", item.linkLabel);
  setField(eventForm, "published", item.published);
  eventForm.querySelector("button[type='submit']").textContent = "Update Event";
  addCancelButton(eventForm, "event");
  eventForm.closest(".staff-card")?.scrollIntoView({ behavior: "smooth" });
}

function editAnnouncement(item) {
  editingAnnouncementId = item.id;
  setField(announcementForm, "title", item.title);
  setField(announcementForm, "message", item.message);
  setField(announcementForm, "priority", item.priority ?? 0);
  setField(announcementForm, "expiresAt", datetimeLocalValue(item.expiresAt));
  setField(announcementForm, "linkUrl", item.linkUrl);
  setField(announcementForm, "linkLabel", item.linkLabel);
  setField(announcementForm, "active", item.active);
  announcementForm.querySelector("button[type='submit']").textContent = "Update Announcement";
  addCancelButton(announcementForm, "announcement");
  announcementForm.closest(".staff-card")?.scrollIntoView({ behavior: "smooth" });
}

async function loadEvents() {
  const host = document.querySelector("[data-event-list]");
  if (!host) return;

  const snapshot = await getDocs(collection(db, "events"));
  const items = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
  host.replaceChildren();

  items.forEach(item => {
    host.append(itemCard(
      item.title,
      item.description,
      item.type || "special",
      { label: item.published ? "Published" : "Draft", active: Boolean(item.published) },
      () => editEvent(item),
      async () => {
        await deleteDoc(doc(db, "events", item.id));
        await recordAudit("event.delete", "event", item.id, `Deleted event: ${item.title || "Untitled event"}.`);
        if (editingEventId === item.id) resetEditor(eventForm, "event");
        await loadEvents();
      }
    ));
  });

  if (!items.length) host.append(text("p", "No events yet.", "firebase-empty"));
}

async function loadAnnouncements() {
  const host = document.querySelector("[data-announcement-list]");
  if (!host) return;

  const snapshot = await getDocs(collection(db, "announcements"));
  const items = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
  host.replaceChildren();

  items.forEach(item => {
    host.append(itemCard(
      item.title,
      item.message,
      `Priority ${Number(item.priority || 0)}`,
      { label: item.active ? "Active" : "Inactive", active: Boolean(item.active) },
      () => editAnnouncement(item),
      async () => {
        await deleteDoc(doc(db, "announcements", item.id));
        await recordAudit("announcement.delete", "announcement", item.id, `Deleted announcement: ${item.title || "Untitled announcement"}.`);
        if (editingAnnouncementId === item.id) resetEditor(announcementForm, "announcement");
        await loadAnnouncements();
      }
    ));
  });

  if (!items.length) host.append(text("p", "No announcements yet.", "firebase-empty"));
}

async function loadQuestions() {
  const host = document.querySelector("[data-question-list]");
  if (!host) return;

  const snapshot = await getDocs(collection(db, "questions"));
  const items = snapshot.docs
    .map(document => ({ id: document.id, ...document.data() }))
    .filter(item => item.status !== "answered");
  host.replaceChildren();

  items.forEach(item => {
    const card = document.createElement("article");
    card.className = "admin-item";

    const isPublic = item.publishPublicly === true;
    const hasEmail = Boolean(String(item.email || "").trim());
    const consentRecorded = Object.prototype.hasOwnProperty.call(item, "publishPublicly");
    const identity = item.anonymous
      ? ["Anonymous", item.email].filter(Boolean).join(" · ")
      : [item.name, item.email].filter(Boolean).join(" · ") || "No contact details";
    const delivery = isPublic
      ? (hasEmail ? "Public if approved · email notification requested" : "Public if approved · no email notification")
      : (consentRecorded
        ? (hasEmail ? "Private reply by email" : "Private reply only · no email supplied")
        : (hasEmail ? "Legacy submission · treated as private · email reply available" : "Legacy submission · treated as private · no email supplied"));

    card.append(
      text("h3", item.question),
      text("p", identity, "admin-meta"),
      text("p", delivery, "admin-meta")
    );

    const answer = document.createElement("textarea");
    answer.placeholder = "Write the approved answer…";
    answer.maxLength = 3000;
    answer.style.width = "100%";
    answer.style.minHeight = "110px";
    answer.style.marginTop = "12px";
    answer.value = String(item.answer || "");

    const actions = document.createElement("div");
    actions.className = "admin-actions";
    actions.style.marginTop = "10px";

    const answerButton = text(
      "button",
      item.status === "answer_pending_email" ? "Retry Private Email" : "Answer Question",
      "btn-donate"
    );
    answerButton.type = "button";

    if (!isPublic && !hasEmail) {
      answerButton.disabled = true;
      answerButton.title = "This submission cannot be published without consent and has no email address for a private reply.";
    }

    answerButton.addEventListener("click", async () => {
      const value = answer.value.trim();
      if (value.length < 5) return setStatus("Write an answer before answering the question.", "error");
      answerButton.disabled = true;
      const questionRef = doc(db, "questions", item.id);

      if (isPublic) {
        try {
          const batch = writeBatch(db);
          const publishedRef = doc(collection(db, "publishedQas"));
          batch.update(questionRef, { status: "answered", answer: value, answeredAt: serverTimestamp() });
          batch.set(publishedRef, {
            question: item.question,
            answer: value,
            published: true,
            publishedAt: serverTimestamp(),
            sourceQuestionId: item.id
          });
          await batch.commit();
          await recordAudit("question.answer_public", "question", item.id, "Published an approved Q&A answer.");

          let notificationSent = false;
          let notificationFailed = false;
          if (hasEmail) {
            try {
              await sendAnswerNotification(item);
              notificationSent = true;
            } catch (error) {
              notificationFailed = true;
              console.error("Public answer published but notification email failed", error);
            }
          }

          card.remove();
          if (notificationSent) setStatus("Answer published and email notification sent.", "success");
          else if (notificationFailed) setStatus("Answer published, but the email notification could not be sent.", "error");
          else setStatus("Answer published.", "success");
        } catch (error) {
          console.error(error);
          setStatus("The answer could not be published.", "error");
          answerButton.disabled = false;
        }
        return;
      }

      try {
        const wasPending = item.status === "answer_pending_email";
        await updateDoc(questionRef, {
          status: "answer_pending_email",
          answer: value,
          answerPreparedAt: serverTimestamp()
        });
        item.status = "answer_pending_email";
        item.answer = value;
        answerButton.textContent = "Retry Private Email";

        if (!wasPending) {
          await recordAudit("question.prepare_private", "question", item.id, "Prepared a private Q&A answer for email delivery.");
        }

        try {
          await sendAnswerNotification(item);
          await recordAudit("question.answer_private", "question", item.id, "Sent an approved Q&A answer privately by email.");
          card.remove();
          setStatus("Private answer emailed successfully. Nothing was published.", "success");
        } catch (error) {
          console.error("Private answer saved but email failed", error);
          setStatus("Private answer saved, but the email could not be sent. You can retry from this question.", "error");
          answerButton.disabled = false;
        }
      } catch (error) {
        console.error(error);
        setStatus("The private answer could not be saved.", "error");
        answerButton.disabled = false;
      }
    });

    const remove = text("button", "Delete Question", "admin-danger");
    remove.type = "button";
    remove.addEventListener("click", async () => {
      if (!confirm("Delete this submitted question?")) return;
      await deleteDoc(doc(db, "questions", item.id));
      await recordAudit("question.delete", "question", item.id, "Deleted a submitted Q&A question.");
      card.remove();
    });

    actions.append(answerButton, remove);
    card.append(answer, actions);
    host.append(card);
  });

  if (!items.length) host.append(text("p", "No unanswered questions.", "firebase-empty"));
}

async function loadAll() {
  setStatus("Loading website content…");
  try {
    await Promise.all([loadEvents(), loadAnnouncements(), loadQuestions()]);
    setStatus("Content loaded.", "success");
  } catch (error) {
    console.error(error);
    setStatus("Some content could not be loaded.", "error");
  }
}

function bindForms() {
  if (bound) return;
  bound = true;

  eventForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      type: String(data.get("type") || "special"),
      title: String(data.get("title") || "").trim(),
      description: String(data.get("description") || "").trim(),
      startAt: timestampValue(data.get("startAt")),
      badgeTop: String(data.get("badgeTop") || "").trim(),
      badgeBottom: String(data.get("badgeBottom") || "").trim(),
      linkUrl: String(data.get("linkUrl") || "").trim(),
      linkLabel: String(data.get("linkLabel") || "").trim(),
      published: data.get("published") === "on",
      updatedAt: serverTimestamp()
    };

    try {
      const wasEditing = Boolean(editingEventId);
      let resourceId = editingEventId;
      if (wasEditing) {
        await updateDoc(doc(db, "events", editingEventId), payload);
        await recordAudit("event.update", "event", editingEventId, `Updated event: ${payload.title || "Untitled event"}.`);
      } else {
        const reference = await addDoc(collection(db, "events"), { ...payload, createdAt: serverTimestamp() });
        resourceId = reference.id;
        await recordAudit("event.create", "event", resourceId, `Created event: ${payload.title || "Untitled event"}.`);
      }

      resetEditor(form, "event");
      await loadEvents();
      setStatus(wasEditing ? "Event updated." : "Event saved.", "success");
    } catch (error) {
      console.error(error);
      setStatus("The event could not be saved.", "error");
    }
  });

  announcementForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      title: String(data.get("title") || "").trim(),
      message: String(data.get("message") || "").trim(),
      priority: Number(data.get("priority") || 0),
      expiresAt: timestampValue(data.get("expiresAt")),
      linkUrl: String(data.get("linkUrl") || "").trim(),
      linkLabel: String(data.get("linkLabel") || "").trim(),
      active: data.get("active") === "on",
      updatedAt: serverTimestamp()
    };

    try {
      const wasEditing = Boolean(editingAnnouncementId);
      let resourceId = editingAnnouncementId;
      if (wasEditing) {
        await updateDoc(doc(db, "announcements", editingAnnouncementId), payload);
        await recordAudit("announcement.update", "announcement", editingAnnouncementId, `Updated announcement: ${payload.title || "Untitled announcement"}.`);
      } else {
        const reference = await addDoc(collection(db, "announcements"), { ...payload, createdAt: serverTimestamp() });
        resourceId = reference.id;
        await recordAudit("announcement.create", "announcement", resourceId, `Created announcement: ${payload.title || "Untitled announcement"}.`);
      }

      resetEditor(form, "announcement");
      await loadAnnouncements();
      setStatus(wasEditing ? "Announcement updated." : "Announcement saved.", "success");
    } catch (error) {
      console.error(error);
      setStatus("The announcement could not be saved.", "error");
    }
  });
}

bindForms();

onAuthStateChanged(auth, async user => {
  if (!user) return;
  try {
    const admin = await getDoc(doc(db, "admins", user.uid));
    if (admin.exists()) await loadAll();
  } catch (error) {
    console.error("Unable to initialise staff content tools", error);
  }
});