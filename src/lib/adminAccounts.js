import { supabase } from "./supabase.js";

async function call(action, payload) {
  const { data, error } = await supabase.functions.invoke("admin-accounts", {
    body: { action, ...payload },
  });
  if (error) throw error;
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
export function deleteLoginAccount({ uid }) {
  return call("delete", { uid });
}
