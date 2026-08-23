importScripts("https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDTQaRXa_bN34kFfGzb1iyVnvZmZm0fL5w",
  authDomain: "yardleymuslimcentre-bham.firebaseapp.com",
  projectId: "yardleymuslimcentre-bham",
  storageBucket: "yardleymuslimcentre-bham.firebasestorage.app",
  messagingSenderId: "147480820147",
  appId: "1:147480820147:web:7986641ce64e53dd3cb3c6"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  // Messages sent by YMC use a notification payload, so supported browsers can
  // display them automatically. This handler remains as a safe fallback for
  // data-only messages sent later.
  if (payload.notification) return;

  const data = payload.data || {};
  self.registration.showNotification(data.title || "Yardley Muslim Centre", {
    body: data.body || "There is a new update from YMC.",
    icon: "/assets/favicons/android-chrome-192x192.png",
    badge: "/assets/favicons/favicon-32x32.png",
    data: { link: data.link || "/" }
  });
});

self.addEventListener("notificationclick", event => {
  const link = event.notification?.data?.link;
  if (!link) return;
  event.notification.close();
  event.waitUntil(clients.openWindow(link));
});
