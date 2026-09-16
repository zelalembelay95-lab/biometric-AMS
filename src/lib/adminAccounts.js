import { supabase } from "./supabase.js";

async function call(action, payload) {
  const { data, error } = await supabase.functions.invoke("admin-accounts", {
    body: { action, ...payload },
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
