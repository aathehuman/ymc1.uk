import { getAdminFirestore, json, errorResponse, requireApprovedStaff } from "./_firebase.mjs";

const PERMISSIONS = [
  "manageEvents",
  "manageAnnouncements",
  "manageQuestions",
  "manageYouthApplications",
  "sendNotifications",
  "viewAudit"
];

function clean(value, maxLength = 160) {
  return String(value || "").trim().slice(0, maxLength);
}

function timestampIso(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function requireSiteDev(event) {
  const staff = await requireApprovedStaff(event);
  if (staff.profile?.role !== "site-dev") {
    const error = new Error("Site developer access is required.");
    error.statusCode = 403;
    throw error;
  }
  return staff;
}

function normalisePermissions(value = {}) {
  return Object.fromEntries(PERMISSIONS.map(key => [key, value?.[key] === true]));
}

export async function handler(event) {
  try {
    const actor = await requireSiteDev(event);
    const db = getAdminFirestore();

    if (event.httpMethod === "GET") {
      const [adminsSnapshot, logsSnapshot] = await Promise.all([
        db.collection("admins").get(),
        db.collection("auditLogs").orderBy("createdAt", "desc").limit(500).get()
      ]);

      const lastMeaningfulByUid = new Map();
      for (const document of logsSnapshot.docs) {
        const data = document.data() || {};
        const action = String(data.action || "");
        const uid = String(data.actorUid || "");
        if (!uid || action === "staff.sign_in" || action === "staff.sign_out") continue;
        if (!lastMeaningfulByUid.has(uid)) {
          lastMeaningfulByUid.set(uid, {
            action,
            summary: data.summary || "Staff action",
            createdAt: timestampIso(data.createdAt)
          });
        }
      }

      const accounts = adminsSnapshot.docs.map(document => {
        const data = document.data() || {};
        return {
          uid: document.id,
          name: clean(data.fullName || data.name || "", 120),
          email: clean(data.email || "", 180),
          role: clean(data.role || "staff", 40) || "staff",
          permissions: normalisePermissions(data.permissions),
          lastAction: lastMeaningfulByUid.get(document.id) || null,
          isCurrentUser: document.id === actor.uid
        };
      }).sort((a, b) => (a.name || a.email || a.uid).localeCompare(b.name || b.email || b.uid));

      return json(200, { accounts, permissions: PERMISSIONS });
    }

    if (event.httpMethod !== "PUT") return json(405, { error: "Method not allowed." });

    const body = JSON.parse(event.body || "{}");
    const uid = clean(body.uid, 160);
    if (!uid) return json(400, { error: "A staff account is required." });

    const targetRef = db.collection("admins").doc(uid);
    const targetSnapshot = await targetRef.get();
    if (!targetSnapshot.exists) return json(404, { error: "Staff account not found." });

    const current = targetSnapshot.data() || {};
    const requestedRole = clean(body.role || current.role || "staff", 40) || "staff";

    if (uid === actor.uid && requestedRole !== "site-dev") {
      return json(400, { error: "You cannot remove your own site-dev role." });
    }

    const nextPermissions = normalisePermissions(body.permissions || {});
    const update = {
      role: requestedRole,
      permissions: nextPermissions,
      updatedAt: new Date(),
      updatedBy: actor.uid
    };

    if (body.name !== undefined) update.fullName = clean(body.name, 120);

    await targetRef.set(update, { merge: true });

    const targetLabel = clean(current.fullName || current.name || current.email || uid, 120);
    await db.collection("auditLogs").add({
      action: "staff.permissions.update",
      resourceType: "staff",
      resourceId: uid,
      summary: `Updated staff access for ${targetLabel || "a staff account"}.`,
      actorUid: actor.uid,
      actorEmail: actor.email || "",
      actorName: clean(actor.profile?.fullName || actor.profile?.name || actor.email || "YMC staff", 120),
      createdAt: new Date()
    });

    return json(200, {
      ok: true,
      account: {
        uid,
        name: update.fullName ?? clean(current.fullName || current.name || "", 120),
        email: clean(current.email || "", 180),
        role: requestedRole,
        permissions: nextPermissions
      }
    });
  } catch (error) {
    if (error instanceof SyntaxError) return json(400, { error: "Invalid request." });
    return errorResponse(error);
  }
}
