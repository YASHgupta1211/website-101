# Jewel Studio

A jewelry catalog-image studio built with React, TypeScript, and FastAPI. Sellers upload a product photo, answer guided styling questions, and request a new image using their original photo, preset instructions, and preferences.

The product is intended for both the website and WhatsApp. The current website works with a mock generation pipeline; the WhatsApp conversation is a development mock.

**Current generation mode:** mock. Requests save an assembled prompt, not an AI-generated image. The decorative hero photograph is an editorial concept, not a demonstrated customer result.

## Current outlook

| Area | Implemented | Still needed |
| --- | --- | --- |
| Website | Public landing page, protected dashboard, responsive studio UI | Production hosting and domain |
| Accounts | Google, passwordless email-link, phone-code signup/sign-in; account profile | Configure a real Firebase project and verify provider delivery |
| Catalog flow | Upload validation, guided preferences, confirmation, job tracking, comparison/download UI | Enable and evaluate real image generation |
| Privacy | Verified tokens, owner-scoped jobs/files, account-owned history | Retention/deletion policy and operational controls |
| Reliability | SQLite records, schema upgrades, worker, failure handling | Durable queue, restart recovery, quotas, spending limits, backups |
| WhatsApp | Signed webhook verification and authenticated mock conversation | Live media handling, conversation flow, result delivery, onboarding |

The code is a development prototype, not a deployed public service. Authentication
has been exercised with Firebase's local emulator; image generation remains in
mock mode. Configure Firebase first, then validate the real generation pipeline
before inviting everyday users.

## Features

- JPEG, PNG, and WebP uploads up to 10 MB, with server-side image validation and PNG normalization.
- Product-only photography or female/male adult models.
- Background presets, plus model age, skin tone, outfit, and scene choices where relevant.
- A confirmation step before submitting a generation request.
- Job progress, explicit mock completion, readable errors, and connection recovery.
- Original/result comparison and PNG downloads for completed real generations.
- Google, passwordless email-link, and phone-code signup/sign-in through Firebase.
- The latest 12 account-owned requests, with status recovery across devices.
- A responsive ivory, olive, and gold studio interface with custom icons and editorial artwork.
- WhatsApp webhook verification, signature validation, and a guided mock conversation.

Profiles belong to authenticated accounts; job creation and history require verified email or phone ownership. Job status, originals, and results require authenticated owner access. Existing anonymous jobs are preserved but are not automatically assigned to a new account.

## Requirements

- Node.js 20.19+ or 22.12+ and npm.
- Python 3.12+ and uv.
- An OpenAI API key and access to the configured image model only when deliberately enabling real generation.

## Run locally

First follow [Firebase setup](jewel-catalog-mvp/docs/AUTH_AND_DEPLOYMENT.md) and copy the frontend/backend `.env.example` files to `.env` with your project settings. No live Firebase project has been connected yet. Then open two terminals from the repository root.

**Frontend:**

```sh
cd jewel-catalog-mvp
npm ci
npm run dev
```

**Backend:**

```sh
cd jewel-catalog-mvp/backend
uv sync
uv run uvicorn app.main:app --reload
```

Keep the backend working directory as shown: the database, uploads, and generated files use relative paths. Both processes must run for the website flow to work.

| Service | Default address |
| --- | --- |
| Website | http://127.0.0.1:5173 |
| API documentation | http://127.0.0.1:8000/docs |
| Health check | http://127.0.0.1:8000/health |

Set the frontend API address with `VITE_API_URL` and backend CORS with `ALLOWED_ORIGINS`. Defaults allow local development on ports 5173 and 8000. Keep these aligned when changing ports or deploying.

On Windows PowerShell, use `npm.cmd` instead of `npm` if script execution policy blocks `npm.ps1`.

## How requests work

```text
Firebase sign-in -> Verified token -> Photo + preferences
                                             |
                                             v
                          Backend validation -> SQLite job + in-memory queue
                                             |
                                             v
                           Worker -> Prompt builder -> Generation service
                                             |
                                             v
                           Status/result <- Website polls by job ID
```

A job ID identifies one generation request. The database stores its status, image path, and preferences. The worker processes queued requests separately from the upload response.

### Mock mode

`MOCK_GENERATION = True` in `backend/app/worker.py` is the current default. The worker writes `backend/generated/<job_id>.txt`, reports `mock_completed`, and does not call the image API. The website stops polling and explains that no image was generated; download remains disabled.

### Real generation

To enable real image editing deliberately:

1. Add `OPENAI_API_KEY=your_api_key` to `jewel-catalog-mvp/backend/.env`, preserving the Firebase and other existing settings.
2. Confirm access to the model configured in `backend/app/services/image_generation.py`.
3. Change `MOCK_GENERATION` to `False` in the worker and restart the backend if necessary.

The current service submits the original image and constructed prompt to the image-edit API, requesting a high-quality 1024 x 1024 PNG. Provider calls incur charges. Routine tests use mock output and require no paid API calls.

## API overview

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/health` | Basic availability check |
| GET / PUT | `/me` | Read/update the signed-in account profile |
| GET | `/jobs` | List the signed-in account's jobs |
| POST | `/jobs` | Submit an image and preferences; returns a job ID |
| GET | `/jobs/{job_id}` | Retrieve status |
| GET | `/jobs/{job_id}/source` | Retrieve the normalized original photo |
| GET | `/jobs/{job_id}/result` | Download the result of a `completed` job |
| GET / POST | `/webhooks/whatsapp` | Verify subscription / validate incoming webhook signatures |

Use `/docs` to explore the API. Job and profile endpoints require `Authorization: Bearer <Firebase ID token>`. Job routes require verified email or phone ownership; health and signed live webhooks remain public.

`POST /jobs` accepts multipart `image` and optional JSON-encoded `preferences`, for example:

```json
{
  "model_type": "Female",
  "age_range": "Mature adult",
  "skin_tone": "Choose for me",
  "outfit": "Traditional",
  "background": "Luxury studio"
}
```

For product-only images, submit `model_type: "Product only"` and a background. Hidden model answers are omitted from saved product-only preferences. Unsupported values are rejected. Legacy `style=ivory|sand|midnight` uploads still work when preferences are absent.

Worker statuses are `received`, `processing`, `completed`, `failed`, and `mock_completed`; the frontend also recognizes `queued`. Only `completed` has an image download. On startup, older job tables receive the missing `preferences_json` column without deleting existing rows; missing historical answers are not reconstructed.

## WhatsApp development

The webhook supports verification using `WHATSAPP_VERIFY_TOKEN` and signature validation using `WHATSAPP_APP_SECRET`, configured in `backend/.env`.

Authenticated development-only mock endpoints under `/webhooks/whatsapp/mock` allow starting a session, uploading a photo, answering guided questions, and creating a queued job. Use the API documentation with a Firebase bearer token to explore the development flow. The legacy HTML harness has not been updated for authenticated requests. Mock endpoints are disabled with `APP_ENV=production`.

The live webhook does not yet download WhatsApp media, conduct conversations, or deliver generated images. Those steps and Meta production onboarding remain future work.

## Project layout

```text
AGENTS.md                           Contributor and agent guidelines
jewel-catalog-mvp/
  src/App.tsx                       Landing page and protected catalog dashboard
  src/AuthPage.tsx                  Google, email-link, and phone signup/sign-in
  src/AuthContext.tsx               Firebase session and account profile state
  src/SiteChrome.tsx                Shared navigation, account dialog, and footer
  src/api.ts                        Authenticated requests and token refresh
  src/styles.css                    Responsive studio design
  public/images/                    Decorative artwork and generation provenance
  backend/app/main.py               FastAPI app, validation, database, and endpoints
  backend/app/auth.py               Firebase verification and access guards
  backend/app/worker.py             Queue processing and mock/real generation
  backend/app/services/             Preferences, prompts, and image-edit integration
  backend/app/routers/whatsapp.py    Webhook security and mock conversations
  backend/tests/                    Isolated API and worker checks
  backend/test_pipeline.html        Legacy harness without auth-token support
  docs/AUTH_AND_DEPLOYMENT.md        Firebase setup and launch prerequisites
  firebase.json                     Local Auth emulator and SPA hosting rewrites
```

Runtime data is stored in `backend/jobs.db`, `backend/uploads/`, and `backend/generated/`. Keep runtime files out of source control.

## Verification

From `jewel-catalog-mvp/`:

```sh
npm run build
```

From `jewel-catalog-mvp/backend/`:

```sh
uv run python -B -m unittest discover -s tests -v
```

The current backend suite contains 18 tests using temporary databases/uploads and fake provider output. They cover validation, preference persistence, product/model prompts, mock completion, worker failures, source/result retrieval, and the WhatsApp mock flow.

For UI changes, check desktop and phone layouts, upload validation, conditional questions, review/edit/confirm, terminal statuses, refresh/history recovery, and connection-error recovery. There is no configured frontend test framework or coverage threshold.

### Last implementation verification

The production build and 18 backend tests passed during the authentication
implementation. Desktop/mobile browser checks exercised Google sign-in,
passwordless email-link completion, phone-code signup, incorrect-code recovery,
private image retrieval, refresh/history restoration, and cross-account isolation
against the official Firebase Auth emulator. No real email/SMS or paid image calls
were used. These results do not establish live-provider or production readiness.

## Before a public launch

This is a development prototype. Generation quotas, payments, durable queue recovery, and production WhatsApp delivery are not implemented. Authentication and per-user authorization are implemented but require Firebase configuration before live use. Job IDs are tracking references, not access controls. Account history can restore status checks but cannot recover work lost from the in-memory queue after a backend restart.

Keep secrets on the backend and out of `VITE_` variables, logs, and commits. Do not commit credentials, databases, uploaded photos, generated customer outputs, bytecode, dependencies, or build artifacts.

See [application notes](jewel-catalog-mvp/README.md), [artwork provenance](jewel-catalog-mvp/public/images/README.md), and [repository guidelines](AGENTS.md) for more detail.

See [authentication setup and deployment checklist](jewel-catalog-mvp/docs/AUTH_AND_DEPLOYMENT.md) for Firebase project creation, Google/email/phone providers, SMS billing, local emulation, and the remaining public-launch requirements.
