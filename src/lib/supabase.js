import { createClient } from "@supabase/supabase-js";
import { auth } from "./firebase.js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Supabase supports "Third-Party Auth" providers (Authentication > Sign In /
// Providers > Third Party Auth in the Supabase dashboard). Once you add
// Firebase Auth there, Supabase trusts Firebase-issued ID tokens directly —
// no separate Supabase sign-in step, and auth.uid() in your RLS policies
// resolves to the Firebase UID. The `accessToken` callback below is what
// hands supabase-js a fresh Firebase ID token on every request.
//
// Double-check the exact setup screen in your Supabase project, since
// dashboard wording can change — see README "Wiring Firebase + Supabase".
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  accessToken: async () => {
    const user = auth.currentUser;
    if (!user) return null;
    return await user.getIdToken();
  },
});
