// Firebase configuration for Spider League.
// Firestore Security Rules control access to league data.
export const firebaseConfig = {
  apiKey: "AIzaSyCHEPNGmVXp7tdRjdfqDE6CBWDl5L6mRKo",
  authDomain: "spider-league-5d9d3.firebaseapp.com",
  projectId: "spider-league-5d9d3",
  appId: "1:683881652755:web:a4d1dca3b44e5b639095e6"
};

export function isFirebaseConfigured() {
  const required = ["apiKey", "authDomain", "projectId", "appId"];

  return required.every((key) => {
    const value = String(firebaseConfig[key] ?? "").trim();
    return value && !value.startsWith("REPLACE_WITH_");
  });
}
