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
      webpush: {
        headers: { TTL: "300" }
      },
      data: {
        type: "device-test",
        title: "YMC device test",
        body: "Direct push delivery to this device is working.",
        link: "/staff/"
      }
    });

    return json(200, { ok: true, messageId });
  } catch (error) {
    return errorResponse(error);
  }
}
