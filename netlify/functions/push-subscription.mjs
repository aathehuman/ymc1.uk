import { errorResponse, getAdminMessaging, json, requireApprovedStaff } from "./_firebase.mjs";

const TOPICS = {
  general: "ymc-general",
  staff: "ymc-staff"
};

function parseBody(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch {
    const error = new Error("Invalid JSON body.");
    error.statusCode = 400;
    throw error;
  }
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });

  try {
    const { token, action, audience = "general" } = parseBody(event);
    const cleanToken = typeof token === "string" ? token.trim() : "";
    const cleanAudience = String(audience || "general").trim().toLowerCase();
    const topic = TOPICS[cleanAudience];

    if (!cleanToken || cleanToken.length < 40 || cleanToken.length > 4096) {
      const error = new Error("A valid Firebase messaging token is required.");
      error.statusCode = 400;
      throw error;
    }

    if (!["subscribe", "unsubscribe"].includes(action)) {
      const error = new Error("Action must be subscribe or unsubscribe.");
      error.statusCode = 400;
      throw error;
    }

    if (!topic) {
      const error = new Error("Unknown notification audience.");
      error.statusCode = 400;
      throw error;
    }

    if (cleanAudience === "staff") {
      await requireApprovedStaff(event);
    }

    const messaging = getAdminMessaging();
    const result = action === "subscribe"
      ? await messaging.subscribeToTopic([cleanToken], topic)
      : await messaging.unsubscribeFromTopic([cleanToken], topic);

    if (result.failureCount > 0) {
      const error = new Error("Firebase rejected this notification subscription.");
      error.statusCode = 400;
      throw error;
    }

    return json(200, {
      ok: true,
      audience: cleanAudience,
      subscribed: action === "subscribe"
    });
  } catch (error) {
    return errorResponse(error);
  }
}
