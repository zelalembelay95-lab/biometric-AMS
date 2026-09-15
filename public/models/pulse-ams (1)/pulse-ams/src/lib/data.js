import { supabase } from "./supabase.js";

/* Employees ------------------------------------------------------------ */

export async function fetchEmployees() {
  const { data, error } = await supabase.from("employees").select("*").order("name");
  if (error) throw error;
  return data;
}

export async function insertEmployee(emp) {
  const { data, error } = await supabase.from("employees").insert(emp).select().single();
  if (error) throw error;
  return data;
}

export async function updateEmployeeRow(id, patch) {
  const { data, error } = await supabase.from("employees").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteEmployeeRow(id) {
  const { error } = await supabase.from("employees").delete().eq("id", id);
  if (error) throw error;
}

/* Attendance logs -------------------------------------------------------*/

export async function fetchLogs({ from } = {}) {
  let query = supabase.from("attendance_logs").select("*").order("date", { ascending: false }).order("time", { ascending: false });
  if (from) query = query.gte("date", from);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function insertLog(log) {
  const { data, error } = await supabase.from("attendance_logs").insert(log).select().single();
  if (error) throw error;
  return data;
}

/* Devices ----------------------------------------------------------------*/

export async function fetchDevices() {
  const { data, error } = await supabase.from("devices").select("*").order("name");
  if (error) throw error;
  return data;
}

export async function setDeviceActive(id, active) {
  const { data, error } = await supabase.from("devices").update({ active }).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

/* Profiles (login accounts) --------------------------------------------*/

export async function fetchProfiles() {
  const { data, error } = await supabase.from("profiles").select("*").order("email");
  if (error) throw error;
  return data;
}
