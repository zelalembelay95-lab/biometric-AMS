// Supabase Edge Function: admin-accounts
//
// Firebase's client SDK can only ever sign up/sign in the *current*
// browser session — there is no client-side way for an Admin to create a
// login for someone else without hijacking their own session. Creating,
// re-passwording, or deleting *other people's* accounts is a privileged
// server-side operation, which is what this function does using the
// Firebase Admin SDK, guarded so only a caller whose own profile has
// role = 'admin' can invoke it.
//
// DEPLOY (no CLI needed):
//   Supabase Dashboard → Edge Functions → Deploy a new function → name it
//   "admin-accounts" → paste this whole file in as index.ts → Deploy.
//
// SECRETS (Edge Functions → admin-accounts → Settings → Secrets):
//   FIREBASE_PROJECT_ID            e.g. "your-project-id"
//   FIREBASE_SERVICE_ACCOUNT_JSON  paste the full contents of the JSON key
//     from Firebase Console → Project settings → Service accounts →
//     Generate new private key
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically by
// Supabase into every Edge Function — you don't set those yourself.

import { initializeApp, cert, getApps } from "npm:firebase-admin@12/app";
import { getAuth } from "npm:firebase-admin@12/auth";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";

const FIREBASE_PROJECT_ID = Deno.env.get("FIREBASE_PROJECT_ID")!;
const SERVICE_ACCOUNT = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON")!);

if (!getApps().length) {
  initializeApp({ credential: cert(SERVICE_ACCOUNT) });
}
const fbAuth = getAuth();

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Verifies the caller's Firebase ID token against Firebase's own public
// keys (the standard way to verify Firebase tokens without the Admin SDK's
// session cookies), then checks their profiles.role is 'admin'.
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

async function requireAdmin(req: Request): Promise<string> {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("missing_token");

  const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
    issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    audience: FIREBASE_PROJECT_ID,
  });
  const uid = payload.sub as string;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", uid)
    .single();
  if (error || !data || data.role !== "admin") throw new Error("not_admin");
  return uid;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    await requireAdmin(req);
    const { action, ...body } = await req.json();

    if (action === "create") {
      const { email, password, role, employeeId } = body;
      if (!email || !password || !role) throw new Error("missing_fields");
      if (password.length < 6) throw new Error("password_too_short");

      const userRecord = await fbAuth.createUser({ email, password });

      const { error } = await supabaseAdmin.from("profiles").insert({
        id: userRecord.uid,
        email,
        role,
        employee_id: role === "employee" ? employeeId ?? null : null,
      });
      if (error) {
        // Roll back the Firebase user so we don't leave an orphaned login
        // with no matching profile/role.
        await fbAuth.deleteUser(userRecord.uid).catch(() => {});
        throw error;
      }

      return json({ uid: userRecord.uid });
    }

    if (action === "setPassword") {
      const { uid, password } = body;
      if (!uid || !password) throw new Error("missing_fields");
      if (password.length < 6) throw new Error("password_too_short");
      await fbAuth.updateUser(uid, { password });
      return json({ ok: true });
    }

    if (action === "setRole") {
      const { uid, role, employeeId } = body;
      if (!uid || !role) throw new Error("missing_fields");
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ role, employee_id: role === "employee" ? employeeId ?? null : null })
        .eq("id", uid);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "delete") {
      const { uid } = body;
      if (!uid) throw new Error("missing_fields");
      await fbAuth.deleteUser(uid).catch(() => {}); // ok if already gone
      const { error } = await supabaseAdmin.from("profiles").delete().eq("id", uid);
      if (error) throw error;
      return json({ ok: true });
    }

    throw new Error("unknown_action");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = message === "not_admin" ? 403 : message === "missing_token" ? 401 : 400;
    return json({ error: message }, status);
  }
});
