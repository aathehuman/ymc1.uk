import { auth, db, isFirebaseConfigured } from "../firebase.js";
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { loadAuditLog, writeAuditLog } from "./audit.js";
import "./push.js";
import "./site-dev.js";

const loginPanel = document.querySelector("[data-login-panel]");
const portal = document.querySelector("[data-portal]");
const loginForm = document.querySelector("[data-login-form]");
const loginResult = document.querySelector("[data-login-result]");
const resetPasswordButton = document.querySelector("[data-reset-password]");
const mailDialog = document.querySelector("[data-mail-dialog]");
let loginRequested = false;

function setStatus(element, message) { if (element) element.textContent = message || ""; }

async function profileFor(user) {
  const snapshot = await getDoc(doc(db, "admins", user.uid));
  return snapshot.exists() ? snapshot.data() || {} : null;
}

function can(profile, permission) {
  return profile?.role === "site-dev" || profile?.permissions?.[permission] === true;
}

function applyPermissionVisibility(profile) {
  window.YMC_STAFF_PROFILE = profile;
  const websiteAllowed = can(profile, "manageEvents") || can(profile, "manageAnnouncements") || can(profile, "sendNotifications");
  const submissionsAllowed = can(profile, "manageQuestions") || can(profile, "manageYouthApplications");

  const websiteTab = document.querySelector('[data-view-button="content"]');
  const submissionsTab = document.querySelector('[data-view-button="submissions"]');
  const auditTab = document.querySelector('[data-view-button="audit"]');
  if (websiteTab) websiteTab.hidden = !websiteAllowed;
  if (submissionsTab) submissionsTab.hidden = !submissionsAllowed;
  if (auditTab) auditTab.hidden = !can(profile, "viewAudit");

  const eventForm = document.querySelector("[data-event-form]");
  const announcementForm = document.querySelector("[data-announcement-form]");
  const youthList = document.querySelector("[data-youth-application-list]");
  const questionList = document.querySelector("[data-question-list]");
  if (eventForm?.closest(".staff-card")) eventForm.closest(".staff-card").hidden = !can(profile, "manageEvents");
  if (announcementForm?.closest(".staff-card")) announcementForm.closest(".staff-card").hidden = !can(profile, "manageAnnouncements");
  if (youthList?.closest(".staff-card")) youthList.closest(".staff-card").hidden = !can(profile, "manageYouthApplications");
  if (questionList?.closest(".staff-card")) questionList.closest(".staff-card").hidden = !can(profile, "manageQuestions");

  document.querySelectorAll(".staff-action-card[data-go-view='content']").forEach(el => el.hidden = !websiteAllowed);
  document.querySelectorAll(".staff-action-card[data-go-view='submissions']").forEach(el => el.hidden = !submissionsAllowed);
}

function showView(name) {
  const button = document.querySelector(`[data-view-button="${name}"]`);
  if (button?.hidden) name = "home";
  document.querySelectorAll("[data-view]").forEach(section => section.classList.toggle("hidden", section.dataset.view !== name));
  document.querySelectorAll("[data-view-button]").forEach(tab => tab.classList.toggle("active", tab.dataset.viewButton === name));
  if (name === "audit") loadAuditLog();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openMailDialog() {
  if (!mailDialog) return;
  if (typeof mailDialog.showModal === "function") mailDialog.showModal();
  else window.open("https://mail.zoho.eu/", "_blank", "noopener,noreferrer");
}
function closeMailDialog() { if (mailDialog?.open) mailDialog.close(); }

loginForm?.addEventListener("submit", async event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const email = String(data.get("email") || "").trim();
  const password = String(data.get("password") || "");
  setStatus(loginResult, "Signing in…");
  loginRequested = true;
  try { await signInWithEmailAndPassword(auth, email, password); setStatus(loginResult, ""); }
  catch (error) { loginRequested = false; console.error(error); setStatus(loginResult, "Sign-in failed. Check the account and password."); }
});

resetPasswordButton?.addEventListener("click", async () => {
  const emailField = loginForm?.elements.namedItem("email");
  const email = String(emailField?.value || "").trim();
  if (!email) { setStatus(loginResult, "Enter your staff email above first, then choose Forgot password."); emailField?.focus(); return; }
  if (emailField && !emailField.checkValidity()) { setStatus(loginResult, "Enter a valid email address first."); emailField.reportValidity(); return; }
  resetPasswordButton.disabled = true;
  setStatus(loginResult, "Requesting a password reset…");
  try { await sendPasswordResetEmail(auth, email); setStatus(loginResult, "If a staff account exists for that email, a password reset link has been sent."); }
  catch (error) { console.warn("Password reset request failed", error); setStatus(loginResult, "The reset email could not be requested right now. Please try again shortly."); }
  finally { resetPasswordButton.disabled = false; }
});

document.querySelector("[data-sign-out]")?.addEventListener("click", async () => {
  try { await writeAuditLog("staff.sign_out", "staff", auth.currentUser?.uid || "", "Signed out of the staff portal."); }
  catch (error) { console.warn("Could not record staff sign-out", error); }
  await signOut(auth);
});

document.querySelectorAll("[data-view-button]").forEach(button => button.addEventListener("click", () => showView(button.dataset.viewButton)));
document.querySelector("[data-open-mail]")?.addEventListener("click", openMailDialog);
document.querySelector("[data-close-mail-dialog]")?.addEventListener("click", closeMailDialog);
document.querySelector("[data-cancel-mail-dialog]")?.addEventListener("click", closeMailDialog);
document.querySelector("[data-open-zoho]")?.addEventListener("click", closeMailDialog);
mailDialog?.addEventListener("click", event => { if (event.target === mailDialog) closeMailDialog(); });

if (!isFirebaseConfigured() || !auth || !db) {
  setStatus(loginResult, "Firebase is not configured.");
} else {
  onAuthStateChanged(auth, async user => {
    if (!user) {
      loginPanel.classList.remove("hidden");
      portal.classList.add("hidden");
      return;
    }
    try {
      const profile = await profileFor(user);
      if (!profile) {
        loginRequested = false;
        await signOut(auth);
        setStatus(loginResult, "This account is not approved for YMC staff access.");
        return;
      }
      document.querySelector("[data-user-email]").textContent = profile.fullName || profile.name || user.email || user.uid;
      applyPermissionVisibility(profile);
      loginPanel.classList.add("hidden");
      portal.classList.remove("hidden");
      showView("home");
      if (loginRequested) {
        loginRequested = false;
        try { await writeAuditLog("staff.sign_in", "staff", user.uid, "Signed in to the staff portal."); }
        catch (error) { console.warn("Could not record staff sign-in", error); }
      }
    } catch (error) {
      loginRequested = false;
      console.error(error);
      await signOut(auth);
      setStatus(loginResult, "Could not verify staff access.");
    }
  });
}
