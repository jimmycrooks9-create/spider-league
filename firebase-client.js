import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";

let services = null;

export function getFirebaseServices() {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase has not been connected yet.");
  }

  if (!services) {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    services = {
      app,
      auth: getAuth(app),
      db: getFirestore(app)
    };
  }

  return services;
}

export { isFirebaseConfigured };
