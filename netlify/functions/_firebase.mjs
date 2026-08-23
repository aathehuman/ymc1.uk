import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

function getAdminApp() {
  if (getApps().length) return getApps()[0];

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured.");

  const serviceAccount = JSON.parse(raw);
  return initializeApp({ credential: cert(serviceAccount) });
}

export function getAdminFirestore() {
  return getFirestore(getAdminApp());
}

export function getAdminMessaging() {
  return getMessaging(getAdminApp());
}

export async function requireApprovedStaff(event, permission = null) {
  const header = event.headers?.authorization || event.headers?.Authorization || "";
  if (!header.startsWith("Bearer ")) {
    const error = new Error("Authentication required.");
    error.statusCode = 401;
    throw error;
  }

  const token = header.slice(7).trim();
  const app = getAdminApp();
  const decoded = await getAuth(app).verifyIdToken(token);
  const snapshot = await getFirestore(app).doc(`admins/${decoded.uid}`).get();

  if (!snapshot.exists) {
    const error = new Error("This account is not approved for YMC staff access.");
    error.statusCode = 403;
    throw error;
  }

  const profile = snapshot.data() || {};
  if (permission && profile.role !== "site-dev" && profile.permissions?.[permission] !== true) {
    const error = new Error("Your staff account does not have permission for this action.");
    error.statusCode = 403;
    throw error;
  }

  return {
    uid: decoded.uid,
    email: decoded.email || profile.email || null,
    profile
  };
}

export function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

export function errorResponse(error) {
  console.error(error);
  return json(error.statusCode || 500, {
    error: error.statusCode ? error.message : "Something went wrong on the server."
  });
}
