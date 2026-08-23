import { errorResponse, getAdminMessaging, json, requireApprovedStaff } from "./_firebase.mjs";

const TOPIC = "ymc-general";
const SITE_ORIGIN = "https://ymc1.uk";

function parseBody(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch {
    const error = new Error("Invalid JSON body.");
    error.statusCode = 400;
    throw error;
  }
}

function cleanText(value, maxLength) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function safeLink(value) {
  if (!value) return `${SITE_ORIGIN}/`;
  const url = new URL(String(value), SITE_ORIGIN);
  if (url.protocol !== "https:" || !["ymc1.uk", "www.ymc1.uk"].includes(url.hostname)) {
    const error = new Error("Notification links must point to ymc1.uk.");
    error.statusCode = 400;
    throw error;
  }
  return url.href;
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });

  try {
    const staff = await requireApprovedStaff(event, "sendNotifications");
    const body = parseBody(event);
    const title = cleanText(body.title, 80);
    const message = cleanText(body.message, 240);
    const link = safeLink(body.link);

    if (!title || !message) {
      const error = new Error("A notification title and message are required.");
      error.statusCode = 400;
      throw error;
    }

    const messageId = await getAdminMessaging().send({
      topic: TOPIC,
      notification: { title, body: message },
      webpush: {
        notification: {
          icon: `${SITE_ORIGIN}/assets/favicons/android-chrome-192x192.png`,
          badge: `${SITE_ORIGIN}/assets/favicons/favicon-32x32.png`
        },
        fcmOptions: { link }
      },
      data: { sentBy: staff.uid, link }
    });

    return json(200, { ok: true, messageId });
  } catch (error) {
    return errorResponse(error);
  }
}
