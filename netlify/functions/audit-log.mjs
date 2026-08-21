import { requireApprovedStaff, getAdminFirestore, json, errorResponse } from "./_firebase.mjs";

const ALLOWED_ACTIONS = new Set([
  "staff.sign_in",
  "staff.sign_out",
  "event.create",
  "event.update",
  "event.delete",
  "announcement.create",
  "announcement.update",
  "announcement.delete",
  "question.answer_public",
  "question.prepare_private",
  "question.answer_private",
  "question.delete",
  "youth_application.mark_reviewed",
  "youth_application.mark_new",
  "youth_application.delete"
]);

const ALLOWED_RESOURCE_TYPES = new Set([
  "staff",
  "event",
  "announcement",
  "question",
  "youth_application"
]);

function clean(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function timestampIso(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function handler(event) {
  try {
    const staff = await requireApprovedStaff(event);
    const db = getAdminFirestore();

    if (event.httpMethod === "GET") {
      const snapshot = await db.collection("auditLogs")
        .orderBy("createdAt", "desc")
        .limit(100)
        .get();

      return json(200, {
        logs: snapshot.docs.map(document => {
          const data = document.data() || {};
          return {
            id: document.id,
            action: data.action || "",
            resourceType: data.resourceType || "",
            resourceId: data.resourceId || "",
            summary: data.summary || "",
            actorEmail: data.actorEmail || "",
            actorName: data.actorName || "",
            createdAt: timestampIso(data.createdAt)
          };
        })
      });
    }

    if (event.httpMethod !== "POST") {
      return json(405, { error: "Method not allowed." });
    }

    const body = JSON.parse(event.body || "{}");
    const action = clean(body.action, 80);
    const resourceType = clean(body.resourceType, 40);
    const resourceId = clean(body.resourceId, 200);
    const summary = clean(body.summary, 180);

    if (!ALLOWED_ACTIONS.has(action)) {
      return json(400, { error: "Unsupported audit action." });
    }
    if (!ALLOWED_RESOURCE_TYPES.has(resourceType)) {
      return json(400, { error: "Unsupported audit resource type." });
    }
    if (!summary) {
      return json(400, { error: "Audit summary is required." });
    }

    const actorName = clean(
      staff.profile?.fullName || staff.profile?.name || staff.email || "YMC staff",
      120
    );

    const reference = await db.collection("auditLogs").add({
      action,
      resourceType,
      resourceId,
      summary,
      actorUid: staff.uid,
      actorEmail: staff.email || "",
      actorName,
      createdAt: new Date()
    });

    return json(200, { ok: true, id: reference.id });
  } catch (error) {
    if (error instanceof SyntaxError) return json(400, { error: "Invalid request." });
    return errorResponse(error);
  }
}
