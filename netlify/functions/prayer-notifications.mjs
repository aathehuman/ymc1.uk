import { PRAYER_DATA } from "../../prayer-data.js";
import { getAdminFirestore, getAdminMessaging } from "./_firebase.mjs";

const TOPIC = "ymc-general";
const SITE_ORIGIN = "https://ymc1.uk";
const TIME_ZONE = "Europe/London";
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

function londonNowParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter(part => part.type !== "literal")
      .map(part => [part.type, part.value])
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute)
  };
}

function toMinutes(value) {
  if (!/^\d{2}:\d{2}$/.test(String(value || ""))) return null;
  const [hour, minute] = String(value).split(":").map(Number);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function formatTime(value) {
  const minutes = toMinutes(value);
  if (minutes == null) return value;
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function normaliseSettings(value = {}) {
  const prayers = {};
  for (const prayer of PRAYERS) {
    prayers[prayer] = typeof value.prayers?.[prayer] === "boolean"
      ? value.prayers[prayer]
      : DEFAULTS.prayers[prayer];
  }

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
    minJamaatGapMinutes: Number.isFinite(Number(value.minJamaatGapMinutes))
      ? Number(value.minJamaatGapMinutes)
      : DEFAULTS.minJamaatGapMinutes,
    jamaatReminderMinutes: Number.isFinite(Number(value.jamaatReminderMinutes))
      ? Number(value.jamaatReminderMinutes)
      : DEFAULTS.jamaatReminderMinutes,
    prayers
  };
}

function dueNow(currentMinutes, dueMinutes) {
  return currentMinutes >= dueMinutes && currentMinutes <= dueMinutes + 2;
}

async function sendOnce({ db, id, title, body, data = {} }) {
  const ref = db.doc(`notificationRuns/${id}`);

  try {
    await ref.create({
      status: "sending",
      createdAt: new Date(),
      title,
      body
    });
  } catch (error) {
    if (error?.code === 6 || error?.code === "already-exists") return false;
    throw error;
  }

  try {
    const messageId = await getAdminMessaging().send({
      topic: TOPIC,
      notification: { title, body },
      webpush: {
        notification: {
          icon: `${SITE_ORIGIN}/assets/favicons/main/android-chrome-192x192.png`,
          badge: `${SITE_ORIGIN}/assets/favicons/main/favicon-32x32.png`
        },
        fcmOptions: { link: `${SITE_ORIGIN}/prayer.html` }
      },
      data: {
        link: `${SITE_ORIGIN}/prayer.html`,
        automated: "true",
        ...data
      }
    });

    await ref.update({
      status: "sent",
      sentAt: new Date(),
      messageId
    });
    return true;
  } catch (error) {
    await ref.delete().catch(() => {});
    throw error;
  }
}

export async function handler() {
  const db = getAdminFirestore();
  const now = londonNowParts();
  const today = PRAYER_DATA.find(row => row.date === now.date);

  if (!today) {
    console.log(`No prayer timetable row found for ${now.date}.`);
    return { statusCode: 200 };
  }

  const settingsSnapshot = await db.doc("settings/notifications").get();
  const settings = normaliseSettings(settingsSnapshot.exists ? settingsSnapshot.data() : {});

  if (!settings.prayerNotificationsEnabled) {
    console.log("Automatic prayer notifications are disabled.");
    return { statusCode: 200 };
  }

  const sent = [];

  for (const prayer of PRAYERS) {
    if (!settings.prayers[prayer]) continue;

    const start = today[prayer];
    const jamaat = today[`${prayer}Jamaat`];
    const startMinutes = toMinutes(start);
    const jamaatMinutes = toMinutes(jamaat);
    if (startMinutes == null || jamaatMinutes == null) continue;

    if (settings.startNotificationsEnabled && dueNow(now.minutes, startMinutes)) {
      const id = `${now.date}-${prayer.toLowerCase()}-start`;
      const title = `${prayer} time has begun`;
      const body = jamaatMinutes === startMinutes
        ? `Jamaat at YMC is at ${formatTime(jamaat)}.`
        : `Jamaat at YMC is at ${formatTime(jamaat)}.`;

      if (await sendOnce({
        db,
        id,
        title,
        body,
        data: { prayer, kind: "start", timetableDate: now.date }
      })) sent.push(id);
    }

    const gap = jamaatMinutes - startMinutes;
    const reminderDue = jamaatMinutes - settings.jamaatReminderMinutes;
    if (
      settings.jamaatRemindersEnabled
      && gap >= settings.minJamaatGapMinutes
      && reminderDue >= 0
      && dueNow(now.minutes, reminderDue)
    ) {
      const id = `${now.date}-${prayer.toLowerCase()}-jamaat-${settings.jamaatReminderMinutes}`;
      const title = `${prayer} jamaat in ${settings.jamaatReminderMinutes} minutes`;
      const body = `Jamaat at YMC begins at ${formatTime(jamaat)}.`;

      if (await sendOnce({
        db,
        id,
        title,
        body,
        data: { prayer, kind: "jamaat-reminder", timetableDate: now.date }
      })) sent.push(id);
    }
  }

  console.log(sent.length ? `Sent: ${sent.join(", ")}` : `No prayer notification due at ${now.time}.`);
  return { statusCode: 200 };
}
