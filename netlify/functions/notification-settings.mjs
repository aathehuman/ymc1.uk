import { errorResponse, getAdminFirestore, json, requireApprovedStaff } from "./_firebase.mjs";

const SETTINGS_REF = "settings/notifications";
const PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

const DEFAULTS = {
  prayerNotificationsEnabled: true,
  startNotificationsEnabled: true,
  jamaatRemindersEnabled: true,
  minJamaatGapMinutes: 30,
  jamaatReminderMinutes: 10,
  prayers: {
    Fajr: true,
    Dhuhr: true,
    Asr: true,
    Maghrib: true,
    Isha: true
  }
};

function siteDevOnly(staff) {
  if (staff.profile?.role !== "site-dev") {
    const error = new Error("Site developer access is required.");
    error.statusCode = 403;
    throw error;
  }
}

function parseBody(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch {
    const error = new Error("Invalid JSON body.");
    error.statusCode = 400;
    throw error;
  }
}

function boundedInteger(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normaliseSettings(value = {}) {
  const prayerInput = value.prayers && typeof value.prayers === "object" ? value.prayers : {};
  const prayers = Object.fromEntries(PRAYERS.map(prayer => [
    prayer,
    typeof prayerInput[prayer] === "boolean" ? prayerInput[prayer] : DEFAULTS.prayers[prayer]
  ]));

  return {
    prayerNotificationsEnabled: typeof value.prayerNotificationsEnabled === "boolean"
      ? value.prayerNotificationsEnabled
      : DEFAULTS.prayerNotificationsEnabled,
    startNotificationsEnabled: typeof value.startNotificationsEnabled === "boolean"
      ? value.startNotificationsEnabled
      : DEFAULTS.startNotificationsEnabled,
    jamaatRemindersEnabled: typeof value.jamaatRemindersEnabled === "boolean"
      ? value.jamaatRemindersEnabled
      : DEFAULTS.jamaatRemindersEnabled,
    minJamaatGapMinutes: boundedInteger(value.minJamaatGapMinutes, 1, 180, DEFAULTS.minJamaatGapMinutes),
    jamaatReminderMinutes: boundedInteger(value.jamaatReminderMinutes, 1, 60, DEFAULTS.jamaatReminderMinutes),
    prayers
  };
}

export async function handler(event) {
  if (!["GET", "PUT"].includes(event.httpMethod)) {
    return json(405, { error: "Method not allowed." });
  }

  try {
    const staff = await requireApprovedStaff(event);
    siteDevOnly(staff);

    const db = getAdminFirestore();
    const ref = db.doc(SETTINGS_REF);

    if (event.httpMethod === "GET") {
      const snapshot = await ref.get();
      return json(200, {
        ok: true,
        settings: normaliseSettings(snapshot.exists ? snapshot.data() : {})
      });
    }

    const settings = normaliseSettings(parseBody(event));
    await ref.set({
      ...settings,
      updatedAt: new Date(),
      updatedBy: staff.uid,
      updatedByEmail: staff.email || null
    }, { merge: true });

    return json(200, { ok: true, settings });
  } catch (error) {
    return errorResponse(error);
  }
}
