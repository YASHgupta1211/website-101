# Authentication setup and launch checklist

Jewel Studio now uses Firebase Authentication for Google sign-in, passwordless
email links, and phone verification codes. Signup and sign-in share the same
screen: first-time successful authentication creates the Firebase account.
The backend verifies Firebase ID tokens and scopes jobs and profiles to the
verified account UID.

A Firebase project has not been connected yet. Without configuration, the landing
page remains public, the studio shows an account-setup message, and protected API
routes fail closed. No fake sign-in or anonymous fallback is enabled.

## 1. Create your Firebase project

1. Open the [Firebase console](https://console.firebase.google.com/) and create a
   project for Jewel Studio. Analytics is optional for this authentication setup.
2. Register a **Web app** in Project settings. Copy the web configuration values.
3. In Authentication, enable **Google** and set its support email.
4. Enable the **Email** provider and **Email link (passwordless sign-in)**. Firebase
   may require enabling the email/password provider toggle as well; Jewel Studio
   itself does not collect passwords.
5. Enable **Phone**. Add Firebase test phone numbers and fixed codes for initial
   testing. Real SMS requires billing and incurs country-specific charges.
6. In Authentication settings, add the exact development and deployed hostnames
   to **Authorized domains**. New projects may not include localhost by default.
   Use the same origin consistently; browser storage and session context differ
   between localhost and 127.0.0.1.
7. Configure the email-link template and support email. Use `/signin` as the app's
   continuation page, keep `handleCodeInApp` enabled, and allow this URL in your
   project's settings. The app never puts the user's email in the callback URL.
8. Set an SMS region policy for the countries you serve and monitor usage. Check
   [Firebase's current limits](https://firebase.google.com/docs/auth/limits) and
   [pricing](https://firebase.google.com/pricing) before enabling public signup.
   Email-link sending quotas also vary by billing plan.

Provider instructions: [Google](https://firebase.google.com/docs/auth/web/google-signin),
[email links](https://firebase.google.com/docs/auth/web/email-link-auth), and
[phone](https://firebase.google.com/docs/auth/web/phone-auth).

## 2. Configure the frontend

Copy `jewel-catalog-mvp/.env.example` to `.env` and fill in:

```dotenv
VITE_FIREBASE_API_KEY=your-web-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_APP_ID=your-web-app-id
VITE_API_URL=http://127.0.0.1:8000
```

These Firebase web identifiers are public client configuration, not service-account
secrets. Never put a Firebase Admin private key or an OpenAI key in `VITE_` values.
Restart Vite after changing `.env`; deployed values are embedded at build time.

## 3. Configure the backend

Add these settings to `jewel-catalog-mvp/backend/.env`, preserving existing keys:

```dotenv
APP_ENV=development
FIREBASE_PROJECT_ID=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=C:/private/firebase-service-account.json
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

For local use, obtain a service-account credential from your Firebase project and
store it outside the repository. The Admin SDK uses Application Default Credentials.
On a compatible cloud host, prefer a bound service identity instead of a downloaded
key. The runtime identity must be able to read Firebase Auth user records because
token verification also checks revocation and disabled accounts.

Use the **same project ID** on the frontend and backend. Restart the backend after
configuration changes. This backend does not require Firestore; jobs and profiles
are still stored in SQLite.

Install the updated dependencies:

```powershell
# From jewel-catalog-mvp/
npm.cmd ci
# From jewel-catalog-mvp/backend/
uv sync
```

Run the normal frontend and backend commands from the repository README.

## Account behavior

- Google sign-in opens a provider popup; allow popups or use email if blocked.
- Email links verify ownership of the email address. On another device or tab,
  re-enter the same address to finish sign-in. No password reset is needed.
- Phone sign-in requires a country-code-prefixed number, SMS consent, and a
  six-digit code. Sending is guarded by reCAPTCHA and a client cooldown; configure
  provider-side quotas and abuse controls before public use.
- Unverified email accounts cannot create jobs or read studio resources.
- Profile name and business are saved on the backend. Email and phone identity
  come from verified Firebase claims and cannot be changed through the profile form.
- Sign-out removes access to the studio. Authenticated image fetches use temporary
  blob URLs that are revoked when the view unmounts; tokens are not put in URLs.
- A new account's history comes from the backend, not another user's localStorage.
  Previous browser-only jobs and profiles are not automatically claimed: the
  application cannot safely prove which account owned them. Existing files and
  database rows are retained, with legacy job ownership left unassigned.
- Different sign-in identities, especially Google versus phone, can create distinct
  accounts. Provider linking/account merging is not implemented. Do not promise
  shared history across separate identities.

## Local emulator (no real messages or billing)

`firebase.json` includes an Authentication emulator on `127.0.0.1:9099` and SPA
hosting rewrites. Use Firebase's official emulator with a demo project:

```powershell
# From jewel-catalog-mvp/
npm.cmd exec --yes --package firebase-tools -- firebase emulators:start --only auth --project demo-jewel-studio
```

For an emulator-only frontend `.env`, use the project ID `demo-jewel-studio`,
`VITE_FIREBASE_AUTH_DOMAIN=demo-jewel-studio.firebaseapp.com`, a nonempty demo web
API key and app ID, and `VITE_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099`.
Set backend `FIREBASE_PROJECT_ID=demo-jewel-studio` and
`FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`. Keep `APP_ENV=development`.

The emulator prints verification links/codes instead of sending messages. It
accepts development tokens; never use its configuration for a deployed service.
The backend rejects emulator configuration with `APP_ENV=production`, and the
frontend only connects to an emulator in Vite development mode.

## Verification

Run the frontend build and backend tests documented in the README. Backend tests
use isolated storage and fake identity verification, never real provider calls.
Also verify against your configured Firebase project before launching:

- First-time and returning Google sign-in; cancelled/blocked popup handling.
- Email-link signup/sign-in, another-device completion, wrong email, expired link,
  resend cooldown, and session restoration after refresh.
- Phone test-number signup/sign-in, incorrect/expired code, resend, and sign-out.
- Two accounts cannot list, view, or download each other's jobs or originals.
- Profile edits persist; switching accounts does not show the previous account's data.
- Missing configuration, invalid/revoked tokens, disabled users, and unverified
  email accounts do not bypass authentication.

## Before everyday users can use the product

Authentication is one launch requirement. Complete these before a public release:

1. Validate real image quality and jewelry fidelity, then deliberately enable real
   generation. Mock completion is not a delivered image.
2. Add per-user quotas, an enforced global spend limit, submission idempotency,
   and rate limiting. A browser cooldown alone is not an abuse-control boundary.
3. Replace the in-memory queue with durable job scheduling, recovery, timeouts,
   and bounded retries. Do not run multiple independent workers against today's
   queue and assume jobs are coordinated.
4. Use durable private image storage and a backed-up database. For a single-host
   pilot, persist the backend working directory and run one app process. For
   scaling or ephemeral hosts, move to managed SQL and private object storage.
5. Deploy the frontend with HTTPS and SPA fallback for `/studio` and `/signin`.
   `firebase.json` supplies Firebase Hosting's fallback if choosing that host.
   Set `VITE_API_URL` to the HTTPS backend URL before building.
6. Deploy the backend with HTTPS, `APP_ENV=production`, explicit `ALLOWED_ORIGINS`,
   production credentials, and no emulator settings. Do not mount uploads or
   generated directories as public static assets. Mock WhatsApp endpoints are
   disabled in production; the signed live webhook remains available.
7. Add monitoring, failure notifications, tested backups/restore, retention and
   deletion rules, a privacy notice explaining image and phone processing,
   support contact, and billing/refund rules if charging users.
8. Invite a small group first. Production WhatsApp media/conversation handling
   and delivery remain separate work after the website pilot is reliable.

No real Firebase project, billing account, domain, or production deployment is
created by these code changes. Configure and verify those external resources
before advertising working signup or public generation.
