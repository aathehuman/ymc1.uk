export const firebaseConfig = {
  apiKey: "AIzaSyDTQaRXa_bN34kFfGzb1iyVnvZmZm0fL5w",
  authDomain: "yardleymuslimcentre-bham.firebaseapp.com",
  projectId: "yardleymuslimcentre-bham",
  storageBucket: "yardleymuslimcentre-bham.firebasestorage.app",
  messagingSenderId: "147480820147",
  appId: "1:147480820147:web:7986641ce64e53dd3cb3c6",
  measurementId: "G-V2V69HGKB8"
};

export const appCheckConfig = {
  enabled: true,
  provider: "enterprise",
  siteKey: "6LfYeHItAAAAAOiEVxWRAZoIhPSeLQbNjAdgH5wc"
};

export const siteConfig = {
  id: "ymc",
  name: "Yardley Muslim Centre",
  timeZone: "Europe/London"
};

export function isFirebaseConfigured() {
  return Object.values(firebaseConfig).every(
    value => typeof value === "string" && value.length > 0 && !value.startsWith("PASTE_")
  );
}

export function isAppCheckConfigured() {
  return appCheckConfig.enabled
    && typeof appCheckConfig.siteKey === "string"
    && appCheckConfig.siteKey.length > 0
    && !appCheckConfig.siteKey.startsWith("PASTE_");
}
