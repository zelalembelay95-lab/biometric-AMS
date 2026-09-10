# PulseAMS — Biometric Attendance Management System

Face and fingerprint attendance, checked four times a day (Morning In,
Before Lunch, After Lunch, Day Out), from an Android phone camera, a
laptop/PC fingerprint sensor, or both. Includes Admin, HR, Employee, and
a walk-up Kiosk terminal.

**Stack:** React + Vite, hosted on **GitHub Pages**, authenticated with
**Firebase Authentication**, data in **Supabase** (Postgres), domain and
CDN/SSL via **Cloudflare**.

---

## 1. What's real vs. what needs your own model/backend

Being upfront about this before you deploy it:

- **Face capture** uses the real device camera (`getUserMedia`). **Face
  matching** (comparing a live frame against a stored template) is not
  implemented — that needs a face-embedding model (e.g. run in-browser
  with a TensorFlow.js model, or server-side) which isn't wired in here.
- **Fingerprint** uses the real **WebAuthn platform authenticator** —
  Touch ID, Windows Hello, Android fingerprint/face unlock. This *is*
  genuine hardware biometric verification. The one simplification: a
  production system generates the WebAuthn challenge and verifies the
  signature on a server (e.g. a Supabase Edge Function); this build does
  that round trip client-side, which is fine for an internal tool but
  worth hardening if attendance data has compliance requirements.
- The kiosk currently reads/writes to Supabase with the public `anon`
  key and no per-device auth. Anyone who can reach the kiosk URL can
  submit an attendance row for any employee ID. For a real deployment,
  either keep the kiosk on a trusted local network only, or add a device
  API key / Edge Function that the kiosk calls instead of hitting
  Supabase directly. This is flagged again in `supabase/schema.sql`.

None of this blocks you from running it — just know where the edges are.

---

## 2. Prerequisites

- Node.js 20+
- A GitHub account and a new repository
- A Firebase project (free Spark plan is enough)
- A Supabase project (free tier is enough)
- A domain managed in Cloudflare (optional — skip §6 if you're fine with
  the default `github.io` URL)

---

## 3. Push this project to GitHub

```bash
cd pulse-ams
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin main
```

Then in the repo on GitHub: **Settings → Pages → Source → GitHub
Actions**. The workflow at `.github/workflows/deploy.yml` will build and
publish `dist/` on every push to `main`.

---

## 4. Set up Firebase Authentication

1. [Firebase Console](https://console.firebase.google.com) → **Add
   project**.
2. **Build → Authentication → Get started → Sign-in method → Email/Password
   → Enable.** (Add Google or another provider later if you want.)
3. **Project settings → General → Your apps → Add app → Web**, register
   it, and copy the config values — you'll need `apiKey`, `authDomain`,
   `projectId`, `appId`.
4. **Authentication → Users → Add user** to create your own account
   first (you'll make it an admin in Supabase in the next step).

---

## 5. Set up Supabase

1. [supabase.com](https://supabase.com) → **New project**.
2. **Project Settings → API** → copy the **Project URL** and **anon
   public key**.
3. **SQL Editor** → paste and run everything in `supabase/schema.sql`.
   This creates `employees`, `attendance_logs`, `devices`, `profiles`,
   plus row-level security policies and a little seed data.
4. **Wire Firebase into Supabase (Third-Party Auth):** in the Supabase
   dashboard, go to **Authentication → Sign In / Providers → Third Party
   Auth** and add **Firebase** as a trusted provider, pointing it at your
   Firebase project ID. This is what lets Supabase accept a Firebase ID
   token directly — no second sign-in step, and `auth.uid()` in your RLS
   policies resolves to the Firebase UID. (Supabase's dashboard wording
   for this has changed over time; search their docs for "Firebase" +
   "Third-Party Auth" if the menu looks different from this.)
5. Back in **SQL Editor**, add yourself as an admin — swap in the UID
   from **Firebase Console → Authentication → Users**:
   ```sql
   insert into profiles (id, email, role)
   values ('<your-firebase-uid>', 'you@company.com', 'admin');
   ```
6. To onboard a real employee later: create their Firebase user, then
   insert a matching `profiles` row with `role = 'employee'` and
   `employee_id` pointing at their `employees.id`. HR/admin accounts
   don't need an `employee_id`.

---

## 6. Local development

```bash
npm install
cp .env.example .env   # fill in the Firebase + Supabase values from §4/§5
npm run dev
```

Open the printed local URL. The **Kiosk** screen works without signing
in; **Employee / HR / Admin** will prompt for the Firebase login you
created in step 4.4.

---

## 7. Configure GitHub Actions secrets

The deploy workflow needs the same values as your `.env`, as **repo
secrets**: **Settings → Secrets and variables → Actions → New repository
secret** — add `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
`VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`,
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

If you're using a custom domain (§8), also add a repo **variable**
(same menu, "Variables" tab) named `CUSTOM_DOMAIN` set to e.g.
`attendance.yourcompany.com`.

Push to `main` (or re-run the workflow from the **Actions** tab) and the
site publishes to `https://<your-user>.github.io/<your-repo>/`.

---

## 8. Point a Cloudflare domain at it (optional)

1. In GitHub: **Settings → Pages → Custom domain** → enter your domain
   (e.g. `attendance.yourcompany.com`) → Save. GitHub shows the DNS
   target you need.
2. In **Cloudflare → DNS**, add a record for that subdomain:
   - Type **CNAME**, Name `attendance`, Target
     `<your-user>.github.io`, Proxy status **Proxied** (orange cloud).
3. In **Cloudflare → SSL/TLS**, set the encryption mode to **Full**
   (not "Flexible" — GitHub Pages serves HTTPS itself, and Flexible can
   cause redirect loops).
4. Back in GitHub Pages, wait for the domain to verify and **enable
   "Enforce HTTPS."**
5. Make sure the `CUSTOM_DOMAIN` repo variable from §7 is set — the
   workflow writes it into `dist/CNAME` on every deploy so GitHub Pages
   doesn't forget your custom domain on the next push.

Your Firebase project also needs to trust the new domain: **Firebase
Console → Authentication → Settings → Authorized domains → Add domain**
→ add `attendance.yourcompany.com` (and keep the `github.io` one while
testing).

---

## 9. Project structure

```
pulse-ams/
├─ src/
│  ├─ App.jsx              # Landing, Kiosk, HR, Employee, Admin screens
│  ├─ main.jsx              # React entry point
│  ├─ index.css             # Tailwind + a couple of custom keyframes
│  └─ lib/
│     ├─ firebase.js        # Firebase Auth client
│     ├─ supabase.js        # Supabase client (uses Firebase ID token)
│     ├─ AuthContext.jsx    # Sign in/out + role lookup
│     ├─ data.js            # All Supabase reads/writes
│     └─ webauthn.js        # Real fingerprint/Face-unlock via WebAuthn
├─ supabase/schema.sql      # Tables, RLS policies, seed data
├─ .github/workflows/deploy.yml
└─ .env.example
```

## 10. Where to go next

- Real face matching: add a TensorFlow.js face-embedding model, store
  each employee's embedding in Supabase, and compare it against the
  kiosk's camera frame instead of the current "enrolled = success" stub
  in `App.jsx`'s `runSimulated()`.
- Move the WebAuthn challenge/verify step server-side (a Supabase Edge
  Function is a natural fit) instead of trusting the browser.
- Lock the kiosk down to your office network or behind a device-specific
  key, per the note in §1.
- Add a `settings` table so HR/Admin can edit the four checkpoint time
  windows without a code change.
