# Jewel Studio — Catalog MVP

React + TypeScript website with a FastAPI backend for jewelry catalog images.

## Pages and setup status

- `/` is the public landing page with jewelry styling references.
- `/signin` handles Google, passwordless email links, and SMS-code signup/sign-in.
- `/studio` is the protected catalog dashboard and account-owned request history.

The Firebase integration is implemented and has been tested with the local Auth
emulator. A real Firebase project, provider configuration, credentials, and
production hosting still need setup. Generation currently produces mock prompt
files rather than images. See the [project overview](../README.md) for the overall
status and the [setup guide](docs/AUTH_AND_DEPLOYMENT.md) for activation steps.

## Current flow

- Sign up or sign in with Google, a passwordless email link, or a phone verification code.
- Upload a JPG, PNG, or WebP photo up to 10 MB.
- Choose product-only photography or a female/male adult model.
- Choose a background; model requests also collect age range, skin tone, and outfit.
- Review the photo filename and preferences before submitting.
- Track queued, generating, ready, failed, and mock-completed requests.
- Compare the original and generated image and download a PNG.
- Reopen your latest 12 account-owned requests, including on another device.

Firebase verifies identities; the backend scopes jobs, original photos, results,
and profiles to the signed-in account. Configure a Firebase project before using
sign-in: see [authentication setup and launch checklist](docs/AUTH_AND_DEPLOYMENT.md).
No real project or billing account is created by the code. Without configuration,
the landing page works and protected resources remain unavailable.

Durable queue recovery, payments, generation quotas, and production WhatsApp
delivery remain future work. Generation is still in mock mode.

## Run locally

Use Node.js 20.19+ or 22.12+, npm, Python 3.12+, and uv.

Before signing in, copy the frontend and backend `.env.example` files to `.env`
only if those files do not already exist. Fill in the Firebase settings or use the
local emulator instructions. Preserve existing secrets and configuration when
adding settings. On PowerShell, use `npm.cmd` if `npm.ps1` is blocked.

From `jewel-catalog-mvp/`:

```sh
npm ci
npm run dev
```

From `jewel-catalog-mvp/backend/`, in another terminal:

```sh
uv sync
uv run uvicorn app.main:app --reload
```

The frontend uses `VITE_API_URL`, defaulting to `http://127.0.0.1:8000`. Keep the backend working directory
as shown because its SQLite database, uploads, and results use relative paths.
Startup upgrades older databases with preference/ownership metadata and the users
table. Legacy anonymous requests remain stored but are not automatically assigned
to new accounts.

## Generation modes

`backend/app/worker.py` currently sets `MOCK_GENERATION = True`. Mock jobs save
the assembled prompt under `backend/generated/<job_id>.txt` and stop at
`mock_completed`. The website explains that no image was generated and disables
the image download.

Real image editing is implemented in the image-generation service but is not
exercised by routine checks. To enable it deliberately, set `MOCK_GENERATION`
to `False` and configure `OPENAI_API_KEY` in `backend/.env`. Provider calls incur
charges; confirm model access before enabling. Never put secrets in frontend code.

## API compatibility

`POST /jobs` accepts multipart `image` and optional JSON-encoded `preferences`.
Preferences include `model_type` (`Product only`, `Female`, or `Male`) and
`background`, plus `age_range`, `skin_tone`, and `outfit` for model images.
Unsupported values are rejected; hidden model choices are omitted from saved
product-only preferences. Legacy `style=ivory|sand|midnight` uploads still work
when `preferences` is absent. Explicit preferences take precedence over style.

`GET /jobs` lists account-owned requests, `/me` reads or updates the profile,
and `GET /jobs/{job_id}` reports status, `GET /jobs/{job_id}/source` serves the
normalized original, and `GET /jobs/{job_id}/result` serves completed image output.
All job and profile endpoints require a Firebase bearer token. Generation and
job access additionally require verified email or phone ownership. The WhatsApp
mock also requires authentication and is disabled with `APP_ENV=production`.
The live webhook retains signature checks. The WhatsApp conversation remains a mock flow; live message handling and result
delivery are future work.

## Verification

From `jewel-catalog-mvp/`:

```sh
npm run build
```

From `jewel-catalog-mvp/backend/`:

```sh
uv run python -B -m unittest discover -s tests -v
```

The 18 backend tests use temporary storage and fake provider output. They cover upload
validation, each presentation mode, saved preferences, mock completion, failures,
original/result retrieval, and the existing WhatsApp mock conversation.

For browser checks, upload a photo, choose each presentation mode, review the
summary, confirm, and refresh. Check that mock completion stops polling, history
reopens the original request, unavailable services offer a status recheck, and
the form and comparison remain usable at phone widths.

## Authentication checks

The backend suite also covers missing/invalid/revoked sessions, disabled users,
unverified emails, phone accounts, profile isolation, cross-account resource
access, safe migration of legacy jobs, and production mock restrictions.
Google, email-link, and phone flows were exercised locally with Firebase's
Authentication emulator; real provider configuration and delivery must still be
verified on your Firebase project. See the setup guide for emulator commands,
Firebase Console steps, environment variables, and production prerequisites.

## Next launch milestones

1. Configure Firebase and verify real Google, email-link, and phone flows.
2. Deliberately enable real generation and evaluate jewelry fidelity.
3. Add durable job recovery, per-user quotas, rate limits, and spending controls.
4. Deploy with HTTPS, persistent private storage, backups, monitoring, and retention rules.
5. Run an invited website pilot before completing live WhatsApp delivery.

The previous implementation passed its production build, backend suite, and
Auth-emulator browser checks. This documentation update does not rerun those
checks or activate external services.
