import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore, json, errorResponse } from "./_firebase.mjs";

const MAX_QUESTION_AGE_MS = 15 * 60 * 1000;
const PENDING_LOCK_MS = 2 * 60 * 1000;

function validQuestionId(value) {
  return /^[A-Za-z0-9_-]{1,200}$/.test(value);
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function timestampMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });

  let questionRef = null;
  let claimed = false;

  try {
    const body = JSON.parse(event.body || "{}");
    const questionId = String(body.questionId || "").trim();
    if (!validQuestionId(questionId)) return json(400, { error: "Invalid question ID." });

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    const to = String(process.env.YMC_QUESTION_NOTIFY_EMAIL || "info@ymc1.uk").trim();
    if (!apiKey || !from) throw httpError(503, "Resend is not configured yet.");
    if (!to) throw httpError(503, "The staff notification address is not configured.");

    const db = getAdminFirestore();
    questionRef = db.doc(`questions/${questionId}`);
    const now = Date.now();

    const question = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(questionRef);
      if (!snapshot.exists) throw httpError(404, "Question not found.");

      const data = snapshot.data() || {};
      if (data.status !== "new") throw httpError(409, "This question is no longer new.");

      const createdAt = timestampMillis(data.createdAt);
      if (!createdAt || Math.abs(now - createdAt) > MAX_QUESTION_AGE_MS) {
        throw httpError(409, "This question is too old to trigger a new-submission notification.");
      }

      if (data.staffNotifiedAt) return { skipped: true, reason: "Staff were already notified." };

      const pendingAt = timestampMillis(data.staffNotificationPendingAt);
      if (pendingAt && now - pendingAt < PENDING_LOCK_MS) {
        return { skipped: true, reason: "A staff notification is already being sent." };
      }

      transaction.update(questionRef, { staffNotificationPendingAt: new Date(now) });
      return {
        skipped: false,
        publishPublicly: data.publishPublicly === true
      };
    });

    if (question.skipped) return json(200, { ok: true, skipped: true, reason: question.reason });
    claimed = true;

    const siteUrl = String(process.env.YMC_PUBLIC_URL || "https://ymc1.uk").replace(/\/+$/, "");
    const staffUrl = String(process.env.YMC_STAFF_URL || `${siteUrl}/staff/`);
    const deliveryLabel = question.publishPublicly
      ? "The sender has allowed the approved question and answer to be published publicly."
      : "The sender requested a private reply. Nothing should be published publicly.";
    const subject = "New YMC Q&A question";
    const text = `Assalamu alaykum.\n\nA new question has been submitted through the Yardley Muslim Centre Q&A page.\n\n${deliveryLabel}\n\nReview it in the staff portal:\n${staffUrl}\n\nYardley Muslim Centre`;
    const html = `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,sans-serif;color:#17202a"><div style="max-width:600px;margin:0 auto;padding:32px 18px"><div style="background:#ffffff;border:1px solid #e2e6ea;border-radius:12px;padding:30px"><p style="margin:0 0 18px;font-size:16px">Assalamu alaykum.</p><p style="margin:0 0 18px;line-height:1.65">A new question has been submitted through the Yardley Muslim Centre Q&amp;A page.</p><p style="margin:0 0 24px;line-height:1.65"><strong>${question.publishPublicly ? "Public publishing allowed:" : "Private reply:"}</strong> ${question.publishPublicly ? "the approved question and answer may be published publicly." : "nothing should be published publicly."}</p><p style="margin:0 0 26px"><a href="${staffUrl}" style="display:inline-block;background:#245b32;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:7px;font-weight:700">Review in staff portal</a></p><p style="margin:0;line-height:1.65"><strong>Yardley Muslim Centre</strong></p></div><p style="margin:14px 4px 0;color:#6c7680;font-size:12px;line-height:1.5">The question itself is kept in the staff portal rather than copied into this notification email.</p></div></body></html>`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "ymc1.uk-question-notifier"
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
        html,
        reply_to: "info@ymc1.uk"
      })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Resend API error", response.status, result);
      throw httpError(502, "The staff notification email could not be sent.");
    }

    await questionRef.update({
      staffNotifiedAt: new Date(),
      staffNotificationPendingAt: FieldValue.delete(),
      staffNotificationLastFailedAt: FieldValue.delete()
    });

    return json(200, { ok: true, id: result.id || null });
  } catch (error) {
    if (claimed && questionRef) {
      try {
        await questionRef.update({
          staffNotificationPendingAt: FieldValue.delete(),
          staffNotificationLastFailedAt: new Date()
        });
      } catch (cleanupError) {
        console.error("Could not clear staff notification lock", cleanupError);
      }
    }

    if (error instanceof SyntaxError) return json(400, { error: "Invalid request." });
    return errorResponse(error);
  }
}
