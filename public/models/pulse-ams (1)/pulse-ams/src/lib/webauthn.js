// Real platform biometric API (Touch ID / Windows Hello / Android
// fingerprint or face unlock) via WebAuthn. The raw biometric never leaves
// the device — only a signed credential is exchanged. In production, the
// challenge should be generated server-side (e.g. a Supabase Edge Function)
// and the resulting signature verified there too; this client-only version
// is fine for demos but skips that server round trip.

export const WEBAUTHN_SUPPORTED =
  typeof window !== "undefined" && !!window.PublicKeyCredential && !!navigator.credentials;

function randomBytes(len) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return arr;
}
function strToBuffer(str) {
  return new TextEncoder().encode(str);
}
function bufToBase64url(buf) {
  const bytes = new Uint8Array(buf);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64urlToBuf(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const str = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(str);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}

export async function registerPlatformBiometric(employee) {
  if (!WEBAUTHN_SUPPORTED) throw new Error("unsupported");
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: "PulseAMS" },
      user: { id: strToBuffer(employee.id), name: employee.id, displayName: employee.name },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
      timeout: 60000,
      attestation: "none",
    },
  });
  if (!cred) throw new Error("cancelled");
  return bufToBase64url(cred.rawId);
}

export async function verifyPlatformBiometric(credentialId) {
  if (!WEBAUTHN_SUPPORTED) throw new Error("unsupported");
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [{ id: base64urlToBuf(credentialId), type: "public-key" }],
      userVerification: "required",
      timeout: 60000,
    },
  });
  if (!assertion) throw new Error("cancelled");
  return true;
}
