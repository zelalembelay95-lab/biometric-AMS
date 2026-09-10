import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// All values come from environment variables (see .env.example) so no
// secrets are committed to the repo. Firebase web config is not sensitive
// by itself, but keeping it in env vars keeps per-environment (staging vs
// production) setups clean.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
