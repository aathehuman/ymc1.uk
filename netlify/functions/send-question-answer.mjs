import { getFirestore } from "firebase-admin/firestore";
import { requireApprovedStaff, json, errorResponse } from "./_firebase.mjs";

function validQuestionId(value) {
  return /^[A-Za-z0-9_-]{1,200}$/.test(value);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function htmlWithLineBreaks(value) {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });

  try {
    await requireApprovedStaff(event);
    const body = JSON.parse(event.body || "{}");
    const questionId = String(body.questionId || "").trim();

    if (!validQuestionId(questionId)) return json(400, { error: "Invalid question ID." });

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) {
      const error = new Error("Resend is not configured yet.");
      error.statusCode = 503;
      throw error;
    }

    const questionRef = getFirestore().doc(`questions/${questionId}`);
    const questionSnapshot = await questionRef.get();
    if (!questionSnapshot.exists) return json(404, { error: "Question not found." });

    const question = questionSnapshot.data() || {};
    const to = String(question.email || "").trim();
    if (!to) return json(200, { ok: true, skipped: true, reason: "No email address was supplied with this question." });

    const publishPublicly = question.publishPublicly === true;
    const answer = String(question.answer || "").trim();
    const questionText = String(question.question || "").trim();

    if (publishPublicly && question.status !== "answered") {
      return json(409, { error: "The public answer must be published before a notification is sent." });
    }

    if (!publishPublicly && !["answer_pending_email", "answered"].includes(question.status)) {
      return json(409, { error: "The private answer must be saved before it is emailed." });
    }

    if (!publishPublicly && !answer) {
      return json(409, { error: "The private answer is missing." });
    }

    const siteUrl = String(process.env.YMC_PUBLIC_URL || "https://ymc1.uk").replace(/\/+$/, "");
    const qaUrl = `${siteUrl}/resources/q-and-a/`;
    const subject = "Your YMC question has been answered";

    const text = publishPublicly
      ? `Assalamu alaykum.\n\nYou chose to allow your question and approved answer to be published publicly. A response from Yardley Muslim Centre is now available.\n\nYou can view the response here:\n${qaUrl}\n\nJazakAllahu Khayran.\n\nYardley Muslim Centre`
      : `Assalamu alaykum.\n\nA response has been prepared to the question you submitted to Yardley Muslim Centre. This reply has been sent to you privately and has not been published on the website.\n\nYour question:\n${questionText}\n\nAnswer:\n${answer}\n\nJazakAllahu Khayran.\n\nYardley Muslim Centre`;

    const html = publishPublicly
      ? `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,sans-serif;color:#17202a"><div style="max-width:600px;margin:0 auto;padding:32px 18px"><div style="background:#ffffff;border:1px solid #e2e6ea;border-radius:12px;padding:30px"><p style="margin:0 0 18px;font-size:16px">Assalamu alaykum.</p><p style="margin:0 0 18px;line-height:1.65">You chose to allow your question and approved answer to be published publicly. A response from Yardley Muslim Centre is now available.</p><p style="margin:0 0 26px"><a href="${escapeHtml(qaUrl)}" style="display:inline-block;background:#245b32;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:7px;font-weight:700">View your response</a></p><p style="margin:0;line-height:1.65">JazakAllahu Khayran.<br><strong>Yardley Muslim Centre</strong></p></div><p style="margin:14px 4px 0;color:#6c7680;font-size:12px;line-height:1.5">This is an automated notification because an email address was supplied with a question submitted to the YMC website.</p></div></body></html>`
      : `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,sans-serif;color:#17202a"><div style="max-width:600px;margin:0 auto;padding:32px 18px"><div style="background:#ffffff;border:1px solid #e2e6ea;border-radius:12px;padding:30px"><p style="margin:0 0 18px;font-size:16px">Assalamu alaykum.</p><p style="margin:0 0 20px;line-height:1.65">A response has been prepared to the question you submitted to Yardley Muslim Centre. This reply has been sent to you privately and has not been published on the website.</p><div style="margin:0 0 18px;padding:16px;background:#f7f8f9;border-radius:8px"><p style="margin:0 0 7px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#68727c">Your question</p><p style="margin:0;line-height:1.65">${htmlWithLineBreaks(questionText)}</p></div><div style="margin:0 0 24px;padding:16px;border-left:4px solid #245b32;background:#f7faf8"><p style="margin:0 0 7px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#68727c">Answer</p><p style="margin:0;line-height:1.65">${htmlWithLineBreaks(answer)}</p></div><p style="margin:0;line-height:1.65">JazakAllahu Khayran.<br><strong>Yardley Muslim Centre</strong></p></div><p style="margin:14px 4px 0;color:#6c7680;font-size:12px;line-height:1.5">This is an automated private reply because an email address was supplied with a question submitted to the YMC website.</p></div></body></html>`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "ymc1.uk-staff-portal"
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
      const error = new Error("The answer email could not be sent.");
      error.statusCode = 502;
      throw error;
    }

    if (!publishPublicly && question.status === "answer_pending_email") {
      const sentAt = new Date();
      await questionRef.update({
        status: "answered",
        answeredAt: sentAt,
        emailSentAt: sentAt
      });
    }

    return json(200, { ok: true, id: result.id || null, delivery: publishPublicly ? "public-notification" : "private-answer" });
  } catch (error) {
    if (error instanceof SyntaxError) return json(400, { error: "Invalid request." });
    return errorResponse(error);
  }
}
