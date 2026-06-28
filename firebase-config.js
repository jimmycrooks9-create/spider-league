// Replace these placeholder values with the configuration shown when you
// register a Web app in the Firebase console. Firebase Web API keys are
// project identifiers, not passwords; Firestore Security Rules control access.
export const firebaseConfig = {
  apiKey: "REPLACE_WITH_FIREBASE_API_KEY",
  authDomain: "REPLACE_WITH_PROJECT_ID.firebaseapp.com",
  projectId: "REPLACE_WITH_PROJECT_ID",
  appId: "REPLACE_WITH_FIREBASE_APP_ID"
};

export function isFirebaseConfigured() {
  const required = ["apiKey", "authDomain", "projectId", "appId"];
  return required.every((key) => {
    const value = String(firebaseConfig[key] ?? "").trim();
    return value && !value.startsWith("REPLACE_WITH_");
  });
}
