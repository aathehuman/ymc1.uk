import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  ReCaptchaV3Provider
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app-check.js";
import {
  browserLocalPersistence,
  getAuth,
  setPersistence
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import {
  appCheckConfig,
  firebaseConfig,
  isAppCheckConfigured,
  isFirebaseConfigured,
  siteConfig
} from "./firebase-config.js";

let app = null;
let auth = null;
let db = null;
let appCheck = null;
let firebaseError = null;

if (isFirebaseConfigured()) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    setPersistence(auth, browserLocalPersistence).catch(error => {
      console.warn("Firebase Auth persistence could not be enabled:", error);
    });

    if (isAppCheckConfigured()) {
      const provider = appCheckConfig.provider === "v3"
        ? new ReCaptchaV3Provider(appCheckConfig.siteKey)
        : new ReCaptchaEnterpriseProvider(appCheckConfig.siteKey);

      appCheck = initializeAppCheck(app, {
        provider,
        isTokenAutoRefreshEnabled: true
      });
    }
  } catch (error) {
    firebaseError = error;
    console.error("Firebase failed to initialise:", error);
  }
}

export {
  app,
  appCheck,
  auth,
  db,
  firebaseError,
  isFirebaseConfigured,
  siteConfig
};
