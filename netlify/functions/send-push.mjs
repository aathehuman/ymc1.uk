import { errorResponse, getAdminMessaging, json, requireApprovedStaff } from "./_firebase.mjs";

const TOPICS = {
  public: "ymc-general",
  staff: "ymc-staff"
};
const SITE_ORIGIN = "https://ymc1.uk";
const STAFF_ORIGIN = "https://staff.ymc1.uk";

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

function safeLink(value, audience) {
  const baseOrigin = audience === "staff" ? STAFF_ORIGIN : SITE_ORIGIN;
  if (!value) return `${baseOrigin}/`;
  const url = new URL(String(value), baseOrigin);
  const allowedHost = audience === "staff"
    ? url.hostname === "staff.ymc1.uk"
    : ["ymc1.uk", "www.ymc1.uk"].includes(url.hostname);
  if (url.protocol !== "https:" || !allowedHost) {
    const error = new Error("Notification links must use the matching YMC site.");
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
    const audience = String(body.audience || "public").trim().toLowerCase();
    const topic = TOPICS[audience];
    const link = safeLink(body.link, audience);

    if (!topic) {
      const error = new Error("Notification audience must be public or staff.");
      error.statusCode = 400;
      throw error;
    }

    if (!title || !message) {
      const error = new Error("A notification title and message are required.");
      error.statusCode = 400;
      throw error;
    }

    const iconFolder = audience === "staff" ? "staff" : "main";
    const messageId = await getAdminMessaging().send({
      topic,
      notification: { title, body: message },
      webpush: {
        notification: {
          icon: `${SITE_ORIGIN}/assets/favicons/${iconFolder}/android-chrome-192x192.png`,
          badge: `${SITE_ORIGIN}/assets/favicons/${iconFolder}/favicon-32x32.png`
        },
        fcmOptions: { link }
      },
      data: { sentBy: staff.uid, audience, link }
    });

    return json(200, { ok: true, audience, messageId });
  } catch (error) {
    return errorResponse(error);
  }
}
