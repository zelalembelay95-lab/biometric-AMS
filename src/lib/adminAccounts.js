import { supabase } from "./supabase.js";
import { auth } from "./firebase.js";

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function call(action, payload) {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in as an admin to do this.");
  const firebaseToken = await user.getIdToken();

  // The login token travels inside the JSON body, not a header. Two
  // platform-level restrictions forced this: Supabase's gateway validates
  // Authorization against its own signing key before the function even
  // runs (rejecting a Firebase-signed token outright — so Authorization is
  // explicitly pinned to the Supabase key here instead of being left to
  // default to the Firebase token), and CORS preflight only allows a fixed
  // set of headers no function-side config can expand (so nothing new is
  // added there — the real token rides in the body instead, which neither
  // restriction touches).
  const { data, error } = await supabase.functions.invoke("admin-accounts", {
    body: { action, firebaseToken, ...payload },
    headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (error) {
    // On a non-2xx response, supabase-js gives a generic "non-2xx status
    // code" message and tucks the function's actual JSON error body away in
    // error.context (the raw Response) instead of surfacing it directly —
    // dig it out so the real reason shows up instead of that generic text.
    let message = error.message;
    if (error.context && typeof error.context.json === "function") {
      try {
        const body = await error.context.json();
        if (body?.error) message = body.error;
      } catch (_) { /* body wasn't JSON — fall back to the generic message */ }
    }
    throw new Error(message);
  }
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
