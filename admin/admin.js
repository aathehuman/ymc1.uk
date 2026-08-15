import { auth, db, isFirebaseConfigured } from "../firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  Timestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const loginPanel = document.querySelector("[data-login-panel]");
const adminPanel = document.querySelector("[data-admin-panel]");
const statusElement = document.querySelector("[data-admin-status]");
const eventForm = document.querySelector("[data-event-form]");
const announcementForm = document.querySelector("[data-announcement-form]");

let editingEventId = null;
let editingAnnouncementId = null;

function setStatus(message, type = "info") {
  if (!statusElement) return;
  statusElement.textContent = message;
  statusElement.dataset.status = type;
}

function timestampValue(value) {
  return value ? Timestamp.fromDate(new Date(value)) : null;
}

function datetimeLocalValue(value) {
  if (!value) return "";
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function text(tag, value, className = "") {
  const element = document.createElement(tag);
  element.textContent = value || "";
  if (className) element.className = className;
  return element;
}

function setField(form, name, value) {
  const field = form.elements.namedItem(name);
  if (!field) return;
  if (field.type === "checkbox") field.checked = Boolean(value);
  else field.value = value ?? "";
}

function resetEditor(form, type) {
  form.reset();
  if (type === "event") {
    editingEventId = null;
    setField(form, "published", true);
  } else {
    editingAnnouncementId = null;
    setField(form, "active", true);
  }

  const submit = form.querySelector("button[type='submit']");
  if (submit) submit.textContent = type === "event" ? "Save Event" : "Save Announcement";
  form.querySelector("[data-cancel-edit]")?.remove();
}

function addCancelButton(form, type) {
  if (form.querySelector("[data-cancel-edit]")) return;
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
  setField(eventForm, "title", item.title || "");
  setField(eventForm, "description", item.description || "");
  setField(eventForm, "startAt", datetimeLocalValue(item.startAt));
  setField(eventForm, "badgeTop", item.badgeTop || "");
  setField(eventForm, "badgeBottom", item.badgeBottom || "");
  setField(eventForm, "linkUrl", item.linkUrl || "");
  setField(eventForm, "linkLabel", item.linkLabel || "");
  setField(eventForm, "published", Boolean(item.published));
  eventForm.querySelector("button[type='submit']").textContent = "Update Event";
  addCancelButton(eventForm, "event");
  eventForm.closest(".admin-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
  setStatus(`Editing event: ${item.title}`);
}

function editAnnouncement(item) {
  editingAnnouncementId = item.id;
  setField(announcementForm, "title", item.title || "");
  setField(announcementForm, "message", item.message || "");
  setField(announcementForm, "priority", item.priority ?? 0);
  setField(announcementForm, "expiresAt", datetimeLocalValue(item.expiresAt));
  setField(announcementForm, "linkUrl", item.linkUrl || "");
  setField(announcementForm, "linkLabel", item.linkLabel || "");
  setField(announcementForm, "active", Boolean(item.active));
  announcementForm.querySelector("button[type='submit']").textContent = "Update Announcement";
  addCancelButton(announcementForm, "announcement");
  announcementForm.closest(".admin-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
  setStatus(`Editing announcement: ${item.title}`);
}

async function isApprovedAdmin(user) {
  const snapshot = await getDoc(doc(db, "admins", user.uid));
  return snapshot.exists();
}

async function loadEvents() {
  const host = document.querySelector("[data-event-list]");
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
        if (editingEventId === item.id) resetEditor(eventForm, "event");
        await loadEvents();
      }
    ));
  });

  if (!items.length) host.append(text("p", "No Firebase events yet.", "firebase-empty"));
}

async function loadAnnouncements() {
  const host = document.querySelector("[data-announcement-list]");
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
        if (editingAnnouncementId === item.id) resetEditor(announcementForm, "announcement");
        await loadAnnouncements();
      }
    ));
  });

  if (!items.length) host.append(text("p", "No announcements yet.", "firebase-empty"));
}

async function publishAnswer(questionItem, answer, card) {
  await addDoc(collection(db, "publishedQas"), {
    question: questionItem.question,
    answer,
    published: true,
    publishedAt: serverTimestamp(),
    sourceQuestionId: questionItem.id
  });
  await updateDoc(doc(db, "questions", questionItem.id), {
    status: "answered",
    answeredAt: serverTimestamp()
  });
  card.remove();
}

async function loadQuestions() {
  const host = document.querySelector("[data-question-list]");
  const snapshot = await getDocs(collection(db, "questions"));
  const items = snapshot.docs.map(document => ({ id: document.id, ...document.data() })).filter(item => item.status !== "answered");
  host.replaceChildren();

  items.forEach(item => {
    const card = document.createElement("article");
    card.className = "admin-item";
    const identity = item.anonymous ? "Anonymous" : [item.name, item.email].filter(Boolean).join(" · ") || "No contact details";
    card.append(text("h3", item.question), text("p", identity, "admin-meta"));

    const answer = document.createElement("textarea");
    answer.placeholder = "Write the approved answer…";
    answer.maxLength = 3000;
    answer.style.width = "100%";
    answer.style.minHeight = "110px";
    answer.style.marginTop = "12px";

    const actions = document.createElement("div");
    actions.className = "admin-actions";
    actions.style.marginTop = "10px";

    const publish = text("button", "Publish Answer", "btn-donate");
    publish.type = "button";
    publish.addEventListener("click", async () => {
      const value = answer.value.trim();
      if (value.length < 5) return setStatus("Write an answer before publishing.", "error");
      publish.disabled = true;
      try {
        await publishAnswer(item, value, card);
        setStatus("Answer published.", "success");
      } catch (error) {
        console.error(error);
        setStatus("The answer could not be published.", "error");
      } finally {
        publish.disabled = false;
      }
    });

    const remove = text("button", "Delete Question", "admin-danger");
    remove.type = "button";
    remove.addEventListener("click", async () => {
      if (!confirm("Delete this submitted question?")) return;
      await deleteDoc(doc(db, "questions", item.id));
      card.remove();
    });

    actions.append(publish, remove);
    card.append(answer, actions);
    host.append(card);
  });

  if (!items.length) host.append(text("p", "No unanswered questions.", "firebase-empty"));
}

async function loadAll() {
  setStatus("Loading content…");
  await Promise.all([loadEvents(), loadAnnouncements(), loadQuestions()]);
  setStatus("Content loaded.", "success");
}

function bindForms() {
  eventForm.addEventListener("submit", async event => {
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
      if (editingEventId) await updateDoc(doc(db, "events", editingEventId), payload);
      else await addDoc(collection(db, "events"), { ...payload, createdAt: serverTimestamp() });
      const wasEditing = Boolean(editingEventId);
      resetEditor(form, "event");
      await loadEvents();
      setStatus(wasEditing ? "Event updated." : "Event saved.", "success");
    } catch (error) {
      console.error(error);
      setStatus("The event could not be saved.", "error");
    }
  });

  announcementForm.addEventListener("submit", async event => {
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
      if (editingAnnouncementId) await updateDoc(doc(db, "announcements", editingAnnouncementId), payload);
      else await addDoc(collection(db, "announcements"), { ...payload, createdAt: serverTimestamp() });
      const wasEditing = Boolean(editingAnnouncementId);
      resetEditor(form, "announcement");
      await loadAnnouncements();
      setStatus(wasEditing ? "Announcement updated." : "Announcement saved.", "success");
    } catch (error) {
      console.error(error);
      setStatus("The announcement could not be saved.", "error");
    }
  });

  document.querySelector("[data-sign-out]").addEventListener("click", () => signOut(auth));
}

if (!isFirebaseConfigured() || !auth || !db) {
  document.querySelector("[data-login-result]").textContent = "Add the Firebase project details in firebase-config.js first.";
} else {
  document.querySelector("[data-login-form]").addEventListener("submit", async event => {
    event.preventDefault();
    const result = document.querySelector("[data-login-result]");
    const data = new FormData(event.currentTarget);
    result.textContent = "Signing in…";
    try {
      await signInWithEmailAndPassword(auth, String(data.get("email") || ""), String(data.get("password") || ""));
      result.textContent = "";
    } catch (error) {
      console.error(error);
      result.textContent = "Sign-in failed. Check the account and password.";
    }
  });

  bindForms();

  onAuthStateChanged(auth, async user => {
    if (!user) {
      loginPanel.classList.remove("hidden");
      adminPanel.classList.add("hidden");
      return;
    }
    if (!(await isApprovedAdmin(user))) {
      await signOut(auth);
      document.querySelector("[data-login-result]").textContent = "This account is not listed as a YMC administrator.";
      return;
    }
    document.querySelector("[data-admin-user]").textContent = user.email || user.uid;
    loginPanel.classList.add("hidden");
    adminPanel.classList.remove("hidden");
    await loadAll();
  });
}
