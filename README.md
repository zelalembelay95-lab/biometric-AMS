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

- **Face capture and matching are both real.** Enrollment (Employee
  Portal) and check-in (Kiosk) run an actual face-detection + face-embedding
  model — [face-api.js](https://github.com/justadudewhohacks/face-api.js) —
  entirely in the browser. Enrolling stores a 128-value numeric descriptor
  of your face (`employees.face_descriptor` in Supabase), never a photo.
  Checking in captures a fresh descriptor from the live camera and compares
  it against the stored one; a distance under `0.6` counts as a match (see
  `src/lib/faceRecognition.js`). Model files load from a public CDN at
  runtime rather than being bundled in this repo — see that file's comments
  if you'd rather self-host them.
- **Fingerprint** uses the real **WebAuthn platform authenticator** —
  Touch ID, Windows Hello, Android fingerprint/face unlock. This *is*
  genuine hardware biometric verification. The one simplification: this
  build does the WebAuthn challenge/verify round trip client-side rather
  than on a server, which is fine for an internal tool but worth
  hardening if attendance data has compliance requirements.
- **A shared kiosk device is weaker for fingerprint than for face.**
  WebAuthn on a shared phone just confirms "a recognized finger touched
  this phone" — it can't tell you *which* enrolled finger it was. Face
  recognition doesn't have that problem since it's actually comparing who's
  in front of the camera. If you're running one shared lobby device rather
  than personal employee phones, prefer face check-in there.
- The kiosk currently reads/writes to Supabase with the public `anon`
  key and no per-device auth. Anyone who can reach the kiosk URL can
  submit an attendance row for any employee ID. For a real deployment,
  either keep the kiosk on a trusted local network only, or add a device
  API key / Edge Function that the kiosk calls instead of hitting
  Supabase directly. This is flagged again in `supabase/schema.sql`.
- **Admin account creation is real too** — see §6 — but it requires
  deploying one Supabase Edge Function, which is the one part of this
  setup that isn't pure front-end.

None of this blocks you from running it — just know where the edges are.

---

## 2. Prerequisites

- Node.js 20+
- A GitHub account and a new repository
- A Firebase project (free Spark plan is enough)
- A Supabase project (free tier is enough)
- A domain managed in Cloudflare (optional — skip §9 if you're fine with
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

(No terminal? GitHub's web UI has an "uploading an existing file" link
on a new empty repo's page — drag your project's files in there instead.
Note it tends to skip dotfiles like `.env.example`/`.gitignore`/`.github`,
so double check those made it in, or add them back manually afterward.)

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
2. **Project Settings → API** → copy the **Project URL** and the
   **Publishable key** (this is the current name for what used to be
   called the "anon" key — same purpose, same low privilege level).
3. **SQL Editor** → paste and run everything in `supabase/schema.sql`.
   This creates `employees`, `attendance_logs`, `devices`, `profiles`,
   plus row-level security policies and a little seed data.
4. **Wire Firebase into Supabase (Third-Party Auth):** in the Supabase
   dashboard, go to **Authentication → Sign In / Providers → Third Party
   Auth** and add **Firebase** as a trusted provider, pointing it at your
   Firebase project ID. This is what lets Supabase accept a Firebase ID
   token directly — no second sign-in step, and `auth.jwt() ->> 'sub'` in
   your RLS policies resolves to the Firebase UID. (Supabase's dashboard
   wording for this has changed over time; search their docs for
   "Firebase" + "Third-Party Auth" if the menu looks different.)
5. Back in **SQL Editor**, add yourself as an admin — swap in the UID
   from **Firebase Console → Authentication → Users**:
   ```sql
   insert into profiles (id, email, role)
   values ('<your-firebase-uid>', 'you@company.com', 'admin');
   ```
6. Once you've deployed the Edge Function in §6, you won't need to do
   step 5 manually for anyone else — the Admin Console's Login Accounts
   tab handles creating everyone else's Firebase user + profile row
   together.

---

## 6. Enable Admin account creation (Edge Function)

The Admin Console's **Login Accounts** tab lets an admin create a real
Firebase login (email + password) for someone else, change their role,
or reset their password — none of which the Firebase client SDK can do
on its own (it can only manage the *currently signed-in* session). That
needs a small privileged server function, deployed once:

1. **Get a Firebase service account key:** Firebase Console → ⚙️ Project
   settings → **Service accounts** tab → **Generate new private key**.
   This downloads a `.json` file — keep it secret, never commit it.
2. In Supabase: **Edge Functions → Deploy a new function** (this is a
   web form, no CLI needed). Name it exactly `admin-accounts`, then paste
   the entire contents of `supabase/functions/admin-accounts/index.ts`
   into the code editor, and deploy.
3. Still on that function's page, go to **Settings → Secrets** and add:
   - `FIREBASE_PROJECT_ID` — your Firebase project ID
   - `FIREBASE_SERVICE_ACCOUNT_JSON` — paste the *entire contents* of the
     JSON file from step 1 as the value
   - (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided
     automatically — don't add those yourself.)
4. Make sure you already have a `profiles` row with `role = 'admin'`
   from §5.5 — only an existing admin can call this function; it checks
   that before doing anything.

Once deployed, Admin Console → **Login Accounts** → **Add Account** lets
you create a login with an email, a temporary password, a role
(Employee/HR/Admin), and — for Employee — which workforce record it's
tied to. The same tab lets you change anyone's role, reset their
password, or remove their login entirely.

If the function fails to deploy because `npm:firebase-admin` isn't
supported in your Supabase project's Edge Runtime, let me know the exact
error and I'll swap that part for a version using raw REST calls instead.

---

## 7. Local development

```bash
npm install
cp .env.example .env   # fill in the Firebase + Supabase values from §4/§5
npm run dev
```

Open the printed local URL. The **Kiosk** screen works without signing
in; **Employee / HR / Admin** will prompt for the Firebase login you
created in step 4.4.

No terminal available? Drag the project folder into
[stackblitz.com](https://stackblitz.com) or [codesandbox.io](https://codesandbox.io)
instead — both run `npm install`/`npm run dev` for you in the browser.

---

## 8. Configure GitHub Actions secrets

The deploy workflow needs the same values as your `.env`, as **repo
secrets**: **Settings → Secrets and variables → Actions → New repository
secret** — add `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
`VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`,
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (use your Publishable key
for this last one).

If you don't have a custom domain (§9), also add a repo **variable**
(same menu, "Variables" tab) named `VITE_BASE_PATH` set to
`/<your-repo-name>/` — GitHub Pages serves your site under that subpath,
and the build needs to know it so asset URLs resolve correctly.

If you *are* using a custom domain (§9), add `CUSTOM_DOMAIN` instead, set
to e.g. `attendance.yourcompany.com`, and leave `VITE_BASE_PATH` unset.

Push to `main` (or re-run the workflow from the **Actions** tab) and the
site publishes to `https://<your-user>.github.io/<your-repo>/`.

---

## 9. Point a Cloudflare domain at it (optional)

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
5. Make sure the `CUSTOM_DOMAIN` repo variable from §8 is set — the
   workflow writes it into `dist/CNAME` on every deploy so GitHub Pages
   doesn't forget your custom domain on the next push.

Your Firebase project also needs to trust the new domain: **Firebase
Console → Authentication → Settings → Authorized domains → Add domain**
→ add `attendance.yourcompany.com` (and keep the `github.io` one while
testing).

---

## 10. Project structure

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
│     ├─ webauthn.js        # Real fingerprint/Face-unlock via WebAuthn
│     ├─ faceRecognition.js # Real face detection + matching (face-api.js)
│     └─ adminAccounts.js   # Client wrapper for the admin-accounts function
├─ supabase/
│  ├─ schema.sql            # Tables, RLS policies, seed data
│  └─ functions/admin-accounts/index.ts  # Privileged account create/edit/delete
├─ .github/workflows/deploy.yml
└─ .env.example
```

## 11. Where to go next

- Add basic liveness checks to face check-in (e.g. require a blink or head
  turn) so a printed photo can't pass — face-api.js's descriptor alone
  doesn't defend against that.
- Lock the kiosk down to your office network or behind a device-specific
  key, per the note in §1.
- Add a `settings` table so HR/Admin can edit the four checkpoint time
  windows without a code change.
- If jsdelivr is blocked on your network, self-host the face-api.js model
  files under `/public/models` and point `MODEL_BASE_URL` in
  `src/lib/faceRecognition.js` at them instead.
- Let employees self-serve a password reset/change instead of relying on
  Admin to do it via the Login Accounts tab.
