import { auth } from "./firebase.js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function call(action, payload) {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in as an admin to do this.");
  const firebaseToken = await user.getIdToken();

  // Deliberately NOT using supabase.functions.invoke() here, and
  // deliberately sending no Authorization header at all: Supabase's Edge
  // Functions gateway runs a built-in check on Authorization before the
  // function's own code ever executes, and that check only understands
  // the old JWT-format keys — this project's publishable key isn't
  // JWT-shaped, so sending it there gets rejected outright ("Invalid
  // Compact JWS"), and supabase-js's automatic token injection can't be
  // fully suppressed except by bypassing it with a plain fetch. With
  // Authorization absent and only apikey present, Supabase's gateway
  // issues its own temporary pass and forwards the request normally —
  // our function then does its own real authentication using the
  // Firebase token carried in the body below.
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-accounts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ action, firebaseToken, ...payload }),
  });

  let data;
  try {
    data = await res.json();
  } catch (_) {
    throw new Error(`Unexpected response from server (status ${res.status})`);
  }

  if (!res.ok) throw new Error(data?.error || `Request failed (status ${res.status})`);
  if (data?.error) throw new Error(data.error);
  return data;
}

export function createLoginAccount({ email, password, role, employeeId }) {
  return call("create", { email, password, role, employeeId });
}
export function resetAccountPassword({ uid, password }) {
  return call("setPassword", { uid, password });
}
export function setAccountRole({ uid, role, employeeId }) {
  return call("setRole", { uid, role, employeeId });
}
export function updateAccountEmail({ uid, email }) {
  return call("updateEmail", { uid, email });
}
export function deleteLoginAccount({ uid }) {
  return call("delete", { uid });
}
