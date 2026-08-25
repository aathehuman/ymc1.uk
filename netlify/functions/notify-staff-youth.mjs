import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore, getAdminMessaging } from "./_firebase.mjs";

const STAFF_TOPIC = "ymc-staff";
const SITE_ORIGIN = "https://ymc1.uk";
const MAX_APPLICATION_AGE_MS = 15 * 60 * 1000;
const PENDING_LOCK_MS = 2 * 60 * 1000;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function validId(value) {
  return /^[A-Za-z0-9_-]{1,200}$/.test(value);
}

function timestampMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export default async req => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  let applicationRef = null;
  let claimed = false;

  try {
    const body = await req.json();
    const applicationId = String(body.applicationId || "").trim();
    if (!validId(applicationId)) return json({ error: "Invalid application ID." }, 400);

    const db = getAdminFirestore();
    applicationRef = db.doc(`youthApplications/${applicationId}`);
    const now = Date.now();

    const application = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(applicationRef);
      if (!snapshot.exists) throw Object.assign(new Error("Application not found."), { statusCode: 404 });

      const data = snapshot.data() || {};
      if (data.status !== "new") throw Object.assign(new Error("This application is no longer new."), { statusCode: 409 });

      const createdAt = timestampMillis(data.createdAt);
      if (!createdAt || Math.abs(now - createdAt) > MAX_APPLICATION_AGE_MS) {
        throw Object.assign(new Error("This application is too old to trigger a notification."), { statusCode: 409 });
      }

      if (data.staffPushNotifiedAt) return { skipped: true };
      const pendingAt = timestampMillis(data.staffPushPendingAt);
      if (pendingAt && now - pendingAt < PENDING_LOCK_MS) return { skipped: true };

      transaction.update(applicationRef, { staffPushPendingAt: new Date(now) });
      return {
        skipped: false,
        applicationType: String(data.applicationType || "")
      };
    });

    if (application.skipped) return json({ ok: true, skipped: true });
    claimed = true;

    const typeLabel = application.applicationType === "young-muadhin-imam"
      ? "Young Mu’adhin & Imam"
      : "Young Leader";
    const staffUrl = `${SITE_ORIGIN}/staff/`;
    const messageId = await getAdminMessaging().send({
      topic: STAFF_TOPIC,
      notification: {
        title: `New ${typeLabel} application`,
        body: "A new youth application has been submitted. Tap to review it in the Staff Portal."
      },
      webpush: {
        notification: {
          icon: `${SITE_ORIGIN}/assets/favicons/staff/android-chrome-192x192.png`,
          badge: `${SITE_ORIGIN}/assets/favicons/staff/favicon-32x32.png`
        },
        fcmOptions: { link: staffUrl }
      },
      data: {
        kind: "youth-application",
        applicationId,
        applicationType: application.applicationType,
        link: staffUrl
      }
    });

    await applicationRef.update({
      staffPushNotifiedAt: new Date(),
      staffPushMessageId: messageId,
      staffPushPendingAt: FieldValue.delete(),
      staffPushLastFailedAt: FieldValue.delete()
    });

    return json({ ok: true, messageId });
  } catch (error) {
    console.error(error);
    if (claimed && applicationRef) {
      await applicationRef.update({
        staffPushPendingAt: FieldValue.delete(),
        staffPushLastFailedAt: new Date()
      }).catch(cleanupError => console.error("Could not clear youth push lock", cleanupError));
    }
    return json({ error: error.statusCode ? error.message : "Could not notify staff about this application." }, error.statusCode || 500);
  }
};
