import { auth, db } from "../firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { writeAuditLog } from "./audit.js";

const host = document.querySelector("[data-youth-application-list]");

function text(tag, value, className = "") {
  const element = document.createElement(tag);
  element.textContent = value || "";
  if (className) element.className = className;
  return element;
}

async function recordAudit(action, resourceId, summary) {
  try {
    await writeAuditLog(action, "youth_application", resourceId, summary);
  } catch (error) {
    console.warn("Could not record youth application audit event", error);
  }
}

function applicationLabel(type) {
  return type === "young-muadhin-imam" ? "Young Mu’adhin & Imam" : "Young Leader";
}

function submittedAt(value) {
  if (!value) return "Submission time unavailable";
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "Submission time unavailable";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London"
  }).format(date);
}

function detail(label, value) {
  if (!value) return null;
  const row = document.createElement("p");
  row.className = "admin-application-detail";
  row.append(text("strong", `${label}: `), document.createTextNode(value));
  return row;
}

function renderApplication(item) {
  const card = document.createElement("article");
  card.className = "admin-item admin-application-item";

  const headingRow = document.createElement("div");
  headingRow.className = "admin-item-top";

  const copy = document.createElement("div");
  copy.className = "admin-item-copy";
  copy.append(
    text("h3", item.fullName || "Unnamed applicant"),
    text("p", applicationLabel(item.applicationType), "admin-meta")
  );

  const metaRow = document.createElement("div");
  metaRow.className = "admin-item-meta-row";
  metaRow.append(
    text("span", submittedAt(item.createdAt), "admin-meta"),
    text(
      "span",
      item.status === "reviewed" ? "Reviewed" : "New",
      `admin-status-badge ${item.status === "reviewed" ? "is-active" : "is-inactive"}`
    )
  );
  copy.append(metaRow);

  const actions = document.createElement("div");
  actions.className = "admin-item-actions";

  const review = text("button", item.status === "reviewed" ? "Mark New" : "Mark Reviewed", "admin-edit");
  review.type = "button";
  review.addEventListener("click", async () => {
    review.disabled = true;
    try {
      const nextStatus = item.status === "reviewed" ? "new" : "reviewed";
      await updateDoc(doc(db, "youthApplications", item.id), { status: nextStatus });
      await recordAudit(
        nextStatus === "reviewed" ? "youth_application.mark_reviewed" : "youth_application.mark_new",
        item.id,
        nextStatus === "reviewed" ? "Marked a youth application as reviewed." : "Marked a youth application as new."
      );
      await loadApplications();
    } catch (error) {
      console.error("Unable to update youth application", error);
      review.disabled = false;
    }
  });

  const remove = text("button", "Delete", "admin-danger");
  remove.type = "button";
  remove.addEventListener("click", async () => {
    if (!confirm(`Delete the application from “${item.fullName || "this applicant"}”?`)) return;
    remove.disabled = true;
    try {
      await deleteDoc(doc(db, "youthApplications", item.id));
      await recordAudit("youth_application.delete", item.id, "Deleted a youth application.");
      card.remove();
    } catch (error) {
      console.error("Unable to delete youth application", error);
      remove.disabled = false;
    }
  });

  actions.append(review, remove);
  headingRow.append(copy, actions);
  card.append(headingRow);

  const details = document.createElement("div");
  details.className = "admin-application-details";
  [
    detail("Age group", item.ageGroup),
    detail("Applicant email", item.email),
    detail("Applicant phone", item.phone),
    detail("Parent/guardian", item.guardianName),
    detail("Parent/guardian contact", item.guardianContact),
    detail("Interests", item.interests),
    detail("Experience", item.experience),
    detail("Why they applied", item.motivation),
    detail("Availability", item.availability)
  ].filter(Boolean).forEach(row => details.append(row));

  card.append(details);
  return card;
}

async function loadApplications() {
  if (!host || !db) return;
  host.replaceChildren(text("p", "Loading applications…", "firebase-empty"));

  try {
    const snapshot = await getDocs(collection(db, "youthApplications"));
    const items = snapshot.docs
      .map(document => ({ id: document.id, ...document.data() }))
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

    host.replaceChildren();
    items.forEach(item => host.append(renderApplication(item)));
    if (!items.length) host.append(text("p", "No youth applications yet.", "firebase-empty"));
  } catch (error) {
    console.error("Unable to load youth applications", error);
    host.replaceChildren(text(
      "p",
      "Youth applications could not be loaded. Make sure the latest Firestore rules have been deployed.",
      "firebase-empty"
    ));
  }
}

onAuthStateChanged(auth, async user => {
  if (!host) return;
  if (!user) {
    host.replaceChildren();
    return;
  }

  try {
    const admin = await getDoc(doc(db, "admins", user.uid));
    if (admin.exists()) await loadApplications();
  } catch (error) {
    console.error("Unable to verify youth applications access", error);
  }
});
