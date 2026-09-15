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

const FIREBASE_PROJECT_ID = Deno.env.get("biometric-ams")!;
const SERVICE_ACCOUNT = JSON.parse(Deno.env.get({"
  "type": "service_account",
  "project_id": "biometric-ams",
  "private_key_id": "5afe7bff237a9cfa454d16274d6d58b7e536ef52",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDVz5YAr7Ys4BpA\nDuN5weHBdjBHjgzs3hJOfr5phv4iN5GCFiYD8xHuHH0oBBjIxoPO1FFlJ4Spen1A\nxsVu/KemLd/pxT3o06gQHoBIOOnUFcmlrfqpp9MspEHSlcGX/xNhXCXQlnRp8lxD\n+j3ag61pOFJB2kBWaHu9VMRcLbCJUGtYKlmi19wp2966Sgbu+YMuMINly8NiXGVF\nO3yBrWRuEjkt1YB+MjYO9DTrY17/etXwtudmwtAUUKXLTjbL+LfB8fuRcwocQzGb\noTYog0Pj1XSFNC+fcEH/Ir3oCTVCBzk78kmt9U4VAtvnxemuUHbEt6qUiUHPSLsj\nSm5imLWjAgMBAAECggEAKJ+8fHzmPDiIREuP5P51inCOU8oloou/JrLmMt63QoEU\nYIccyftRGNDI5uWAYAV33cBxhqqvhhQD4F7j/GZ85BIrTRtw29/7OrTQ4ugNZYKO\nQbCAw+NjOEQtTXmuwtZwNDtx4+PyUn7+ENxnDDGgrTFKT8DMIJ7Rg/OrK2hy9mO8\nRWfyWF5slsUGToSOipRBqQKri49AF9Iq5DK5oYfY2zxkjFZkJUkivrKlk7640jbM\nOXAUGYsQkbIhYC2rY1qmz+whGFba+C8LUlAUTfGdQ1MJ7gLUnrs7azbJctZBJcUI\nr2J2giIT4AAY1XVsq7waWgNw1nQjh4+uh14McUH8AQKBgQD0HxyqC0hw1VEy/lyV\njXzbp2K/cFhDBj507RSll69fIWEA7BzxnQMIlgE5liTMRjOfW0KhTh3YmGiC577+\nTLq/ZkICQVO9dYDwHqck5drYf0JYGHFzLutNC1xT8sNwfajikMsd5p6dRPdX5DFm\n4fuFNBLpqSE5qlX5EWQ+1KZbgQKBgQDgNuktpytRkN6ch6YfaNSkSxgDURYrwiAF\nbihdSDQ/S27cIzu22lUWcyn96lTt/Hj/eyHslyPlNkehkRi6U4huZVSr1lUDezb1\nZGaQmh4IcaTZImdmeJTdyy/9s9Gm6jv+6hS2FkXfj+bSRT12MTgeQf1DTnr8zU0X\nnVvziV+zIwKBgQCVLxYjTHXejl3q3crSkf6FdUtBVnR5sS0l42REtee0KP/QwnoF\npUAfVRw2huzB8PzHG8wiK0zN+oWTye/MFDPjl6grHKUCGPbMxs66G8WbnFl84KMk\nEr40/QZVPvv0mLZGjtmx0ieIUIcfLRKLnvpIMsSECpmFVfToGpq6UtW/AQKBgE2D\njk+jKH21aNCSsOLQ+hqmf3G+Gb0dCrb142yEZtOu/2+Jmr5Xcu0k+VJ4Lc5s52Pj\nrNG/WsCGaHM512OrN1J7I6+YlKF0eoaRpEe/kDx5FXWfyEGL1GNtOHUsMoHTHtS9\nFlXxE0z70d/F4j63O2Byjd00B57YVxuf4kcqqfQjAoGAEV4UjuI7rLWT2VaUS2fM\nzb6HRD8QXLkQfKkZTnSTcHGM4SlJFvViajMtCeJNW9isMtyEcScZCawlJsqDqBKp\nqFu2nedajKnvNlGxXK0ayohmDzbV/t3++GR6uIPjUDruFpo3nlztZLRCkOX74J0K\nJo9vH33vp6gtYacD+sy+Fyo=\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-fbsvc@biometric-ams.iam.gserviceaccount.com",
  "client_id": "116581902296391242261",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40biometric-ams.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
"}
)!);

if (!getApps().length) {
  initializeApp({ credential: cert(SERVICE_ACCOUNT) });
}
const fbAuth = getAuth();

const supabaseAdmin = createClient(
  Deno.env.get("https://twcapjafodjdnuebcqjk.supabase.co")!,
  Deno.env.get("sb_secret_yXynKdO_yUUSbT1r87vFxg_IKxqE9mI")!
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
