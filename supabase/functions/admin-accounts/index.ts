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
const SERVICE_ACCOUNT = JSON.parse(Deno.env.get("{
  "type": "service_account",
  "project_id": "biometric-ams",
  "private_key_id": "dcbef653d0aa88755eed7d018ce867efa9fbbaeb",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7xHOl6mFENq5P\nVzD47Bea/UvNAbs+DFCgRhVPUGJPN3fUcOh/djawKSYSrB4uK0Kq1270mE5ztZMC\nlm+V8hZPMNUm02kA74yYETj2BfGM2EWFOww337MXZQ/YuE6Geu5jZR2TkVKCGudD\n1do5dBYNw4W7xsbXqxkUTdlDmEmkGQC10V3Bg0bE8bnm/59B8KTR5SlBq+Tyd349\nHRshVWNk5peY3oWH28H+ZcHFQCscj6C1Z/oR5lzHwFuVuVEsqd9RCkmOA/g1h6o0\nQep9H6DtQy0TjKqEjuI+RAnS/22uMYdwdjRFk0EnIwwWpWh2PL8pbTRRyFAXRsiI\n3xztIiOfAgMBAAECggEABnidAJYyzmUaC4StZeWn9cDXdkrrVyiZWeS3S7mxIazI\nfvRVgBjJYZL/MCDXJt0wYu8Pp4WmQDuhsXvsNrioq75xmQNQFC/2dLAQZ/42lroh\nrzwkqUyW3NwLk9Zu1vQVgQfec2+VgLqIxyldQ33H7jlcnwuY8OW4UAzl8A45xBEx\np4K92sIL8la9mGk6/xEhzWrLKY98a2hc44faIfeRfWgBcVsvNBguhgkU9V6sLV5s\nSrBzZzgSDK69ZkrQXOaqA7XT9af6unwlj2dv36Lj96n5ET5Mzy98jxM/5BvYEWBO\nvH3oGFArQ7yeDDfr5CQWX/X9jraxcMzTFeA/GnZ52QKBgQDtP3SSHWNI0GBubm6R\nav5wNMDDiwJmxwQHBS6KyqdAAKF+ODyZqAuoJu372qePW2oLYQpoGlxOBnX4wwyT\nHApINPRJDuyEr3rj0k3b8rjR17LtVlcOXlPdUYOidWOs7UecGWL4+rxJORLzBrvP\nlHOgFGv3Z0r4YrwwVuJ/wU42NwKBgQDKm8sgErnY6df0fvEOtnFZm0DH0/G8FTpr\nvhPkQbrF0HCGwJpYT7P0USEErmFZQh59Q5JJx+4sXYpubcadkWbOpUGWTfTczntT\nxYI+6dBmX7yUgsnQu9djSqMRb5APBA0Etgoz9PPzdq2aflX0z9CwdFMqjj/DlWxS\nHmv/3mPJ2QKBgQCSrmPdHsxOrX6haCd2Qudy6jqv61cdwjfsOzjuWKMVQA6Yoh5d\nhfdHDGKhDyv/xy4GQQYVHQ8qsnXnyngQ0ApPYGYUcWSsGG5rQpAex6+bFbgrYvFK\nEenZ8Nbo75kjxkQ677swYp1czCu6E9S0X30pYNbrzHIepbTiUiWRhStc+wKBgQCa\nhrglfiLAjZlnoGm6Duvkq8R8o+l6ybYE9rO1I2yP8qngHIWbVS6q6DWGnHki2orm\nfuLT4uiEbdNm5dLV2k/Oy7t6J3rZ7aGiAsGTukB31AzAOAA0cw+Taxlz8uKskSpc\nrXqapfhpd9pwOmrUjKtd6VqE2nlHcm9rMkisnbD+AQKBgCv2kHGWjfu1ZGmGImgP\np5T0RNvpNf0RzYdO0EmbI30rqAcY7ylUdHe+INhtJU3b90qzR608BDp/0QgKJSOT\nDQIDlwsk4MmpiX/E/tbeh8F5pC2U2kmZTT5CPuEZDcRYxNrfrBbc58JB22pKJCqw\ny8717KMzVBHvSyJG5z6ErdX6\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-fbsvc@biometric-ams.iam.gserviceaccount.com",
  "client_id": "116581902296391242261",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40biometric-ams.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
}
")!);

if (!getApps().length) {
  initializeApp({ credential: cert(SERVICE_ACCOUNT) });
}
const fbAuth = getAuth();

const supabaseAdmin = createClient(
 Deno.env.get("https://twcapjafodjdnuebcqjk.supabase.co")!,
  Deno.env.get("sb_secret_3ua0tsL9UA1CCvyzMw5SKg_4EohOu9JY")!
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
