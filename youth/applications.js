import { db, isFirebaseConfigured } from "../firebase.js";
import {
  addDoc,
  collection,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const SUBMISSION_COOLDOWN_MS = 5 * 60 * 1000;
const ALLOWED_TYPES = new Set(["young-leader", "young-muadhin-imam"]);
const UNDER_18_AGE_GROUPS = new Set(["13-15", "16-17"]);

function value(data, name) {
  return String(data.get(name) || "").trim();
}

function showResult(result, message, type) {
  result.textContent = message;
  result.dataset.status = type;
}

function validateApplication(payload) {
  if (!ALLOWED_TYPES.has(payload.applicationType)) {
    return "This application type is not available.";
  }

  if (payload.fullName.length < 2) {
    return "Please enter your full name.";
  }

  if (!["13-15", "16-17", "18-plus"].includes(payload.ageGroup)) {
    return "Please select your age group.";
  }

  if (UNDER_18_AGE_GROUPS.has(payload.ageGroup)) {
    if (payload.guardianName.length < 2 || payload.guardianContact.length < 3) {
      return "Applicants under 18 must provide a parent or guardian name and contact detail.";
    }
  } else if (!payload.email && !payload.phone) {
    return "Please provide an email address or phone number so YMC can contact you.";
  }

  if (payload.motivation.length < 20) {
    return "Please explain a little more about why you want to apply.";
  }

  if (!payload.consent) {
    return "Please confirm that YMC may use these details to review and respond to the application.";
  }

  return "";
}

function initialiseForm(form) {
  const result = form.querySelector("[data-form-result]");
  const submit = form.querySelector("button[type='submit']");

  if (!result || !submit) return;

  if (!isFirebaseConfigured() || !db) {
    showResult(result, "Applications are temporarily unavailable. Please contact YMC directly.", "error");
    submit.disabled = true;
    return;
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const data = new FormData(form);
    if (value(data, "website")) return;

    const applicationType = form.dataset.applicationType || "";
    const payload = {
      applicationType,
      fullName: value(data, "fullName"),
      ageGroup: value(data, "ageGroup"),
      email: value(data, "email"),
      phone: value(data, "phone"),
      guardianName: value(data, "guardianName"),
      guardianContact: value(data, "guardianContact"),
      interests: value(data, "interests"),
      experience: value(data, "experience"),
      motivation: value(data, "motivation"),
      availability: value(data, "availability"),
      consent: data.get("consent") === "on",
      status: "new",
      createdAt: serverTimestamp()
    };

    const validationError = validateApplication(payload);
    if (validationError) {
      showResult(result, validationError, "error");
      return;
    }

    const cooldownKey = `ymc-youth-application-${applicationType}`;
    const lastSubmission = Number(localStorage.getItem(cooldownKey) || 0);
    if (Date.now() - lastSubmission < SUBMISSION_COOLDOWN_MS) {
      showResult(result, "An application was recently submitted from this browser. Please wait a few minutes before trying again.", "error");
      return;
    }

    submit.disabled = true;
    submit.textContent = "Sending…";

    try {
      const applicationRef = await addDoc(collection(db, "youthApplications"), payload);

      try {
        const notificationResponse = await fetch("/.netlify/functions/notify-staff-youth", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ applicationId: applicationRef.id })
        });
        if (!notificationResponse.ok) {
          const notificationResult = await notificationResponse.json().catch(() => ({}));
          console.warn("Application saved, but staff push failed:", notificationResult.error || notificationResponse.status);
        }
      } catch (notificationError) {
        console.warn("Application saved, but staff push could not be requested:", notificationError);
      }

      localStorage.setItem(cooldownKey, String(Date.now()));
      form.reset();
      showResult(result, "Application received. YMC will review it and contact you or your parent/guardian if appropriate, InShaaAllah.", "success");
    } catch (error) {
      console.error("Youth application could not be submitted", error);
      showResult(result, "The application could not be sent. Please try again later or contact YMC directly.", "error");
    } finally {
      submit.disabled = false;
      submit.textContent = "Submit Application";
    }
  });
}

document.querySelectorAll("[data-youth-application-form]").forEach(initialiseForm);
