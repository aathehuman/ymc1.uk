import { errorResponse, getAdminMessaging, json, requireApprovedStaff } from "./_firebase.mjs";

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });

  try {
    await requireApprovedStaff(event, "sendNotifications");
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Invalid JSON body." }); }
    const token = String(body.token || "").trim();
    if (token.length < 40 || token.length > 4096) return json(400, { error: "Invalid notification token." });

    const messageId = await getAdminMessaging().send({
      token,
      notification: { title: "YMC device test", body: "Direct push delivery to this device is working." },
      webpush: {
        notification: {
          icon: "https://ymc1.uk/assets/favicons/staff/android-chrome-192x192.png",
          badge: "https://ymc1.uk/assets/favicons/staff/favicon-32x32.png"
        },
        fcmOptions: { link: "https://ymc1.uk/staff/" }
      },
      data: { type: "device-test", link: "/staff/" }
    });

    return json(200, { ok: true, messageId });
  } catch (error) {
    return errorResponse(error);
  }
}
