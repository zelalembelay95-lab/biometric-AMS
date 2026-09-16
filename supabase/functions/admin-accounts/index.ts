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

// Reading/parsing the Firebase secrets happens lazily, inside a function,
// rather than at the top of the file. If a secret is missing or the JSON
// is malformed, a top-level throw would crash the *entire module* before
// it can even register a request handler — which breaks the CORS
// preflight too, and shows up in the browser as a generic "failed to send
// a request" with no useful detail. Doing it lazily means a bad secret
// instead produces a normal JSON error response you can actually read.
let fbAuthCached: ReturnType<typeof getAuth> | null = null;
let projectIdCached: string | null = null;

function getProjectId(): string {
  if (projectIdCached) return projectIdCached;
  const id = Deno.env.get("FIREBASE_PROJECT_ID");
  if (!id) throw new Error("missing_secret_FIREBASE_PROJECT_ID");
  projectIdCached = id;
  return id;
}

function getFbAuth() {
  if (fbAuthCached) return fbAuthCached;
  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("missing_secret_FIREBASE_SERVICE_ACCOUNT_JSON");
  let serviceAccount: unknown;
  try {
    serviceAccount = JSON.parse(raw);
  } catch {
    throw new Error("invalid_json_FIREBASE_SERVICE_ACCOUNT_JSON");
  }
  if (!getApps().length) {
    initializeApp({ credential: cert(serviceAccount as object) });
  }
  fbAuthCached = getAuth();
  return fbAuthCached;
}

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
    issuer: `https://securetoken.google.com/${getProjectId()}`,
    audience: getProjectId(),
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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

      const userRecord = await getFbAuth().createUser({ email, password });

      const { error } = await supabaseAdmin.from("profiles").insert({
        id: userRecord.uid,
        email,
        role,
        employee_id: role === "employee" ? employeeId ?? null : null,
      });
      if (error) {
        // Roll back the Firebase user so we don't leave an orphaned login
        // with no matching profile/role.
        await getFbAuth().deleteUser(userRecord.uid).catch(() => {});
        throw error;
      }

      return json({ uid: userRecord.uid });
    }

    if (action === "setPassword") {
      const { uid, password } = body;
      if (!uid || !password) throw new Error("missing_fields");
      if (password.length < 6) throw new Error("password_too_short");
      await getFbAuth().updateUser(uid, { password });
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

    if (action === "updateEmail") {
      const { uid, email } = body;
      if (!uid || !email) throw new Error("missing_fields");
      await getFbAuth().updateUser(uid, { email });
      const { error } = await supabaseAdmin.from("profiles").update({ email }).eq("id", uid);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "delete") {
      const { uid } = body;
      if (!uid) throw new Error("missing_fields");
      await getFbAuth().deleteUser(uid).catch(() => {}); // ok if already gone
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
