# Repository Guidelines

## Product & Current State

Jewel Studio turns a seller's jewelry photo and guided preferences into a catalog image. The intended channels are the website and WhatsApp. The current focus is a low-budget invited pilot supporting product-only images and female/male adult models, with jewelry accuracy as the priority.

The website supports Firebase Google, passwordless email-link, and phone-code signup/sign-in, guided styling questions, confirmation, tracking, original/result comparison, and PNG download when a real result exists. Firebase must be configured before live sign-in works; missing configuration fails closed. Profiles and the latest 12 job references are loaded from the backend for the current UID. Browser-local profiles/history are no longer treated as account identity or imported into an account. Legacy anonymous database records are retained with no assigned owner.

Generation currently uses `MOCK_GENERATION = True` in the worker. Mock jobs write a prompt text file and finish as `mock_completed`; they do not produce an image. Keep this status distinct from `completed` in the UI. Live WhatsApp webhook verification and signature checks exist, but incoming conversation handling, media download, and result delivery are not implemented. The guided WhatsApp flow is available through authenticated mock endpoints only; these are disabled with `APP_ENV=production`.

The app routes are `/` (public landing page), `/signin` (signup/sign-in and email-link completion), and `/studio` (authenticated dashboard). Do not replace the landing page with the dashboard or bypass the studio gate. First-time and returning users share the same provider flows; email uses passwordless links, not passwords. Firebase project creation, provider activation, authorized domains, and credentials remain external setup steps.

## Project Structure & Module Organization

The application lives in `jewel-catalog-mvp/`.

- `src/App.tsx` contains the guided upload flow, polling, private image fetches, and account-owned history. `src/AuthContext.tsx`, `src/AuthPage.tsx`, and `src/firebase.ts` provide Firebase session and signup flows; `src/api.ts` attaches refreshed bearer tokens. `src/SiteChrome.tsx` handles the account profile. `src/main.tsx` mounts the app.
- `src/styles.css` defines the responsive luxury-studio design: ivory, olive, restrained gold, serif headings, and accessible focus states. Preserve this visual direction when extending the interface.
- `public/images/studio-editorial.png` is decorative AI-generated hero artwork. Its provenance and prompt are in `public/images/README.md`. It is an editorial concept, not a customer result or evidence of product accuracy.
- `backend/app/auth.py` verifies Firebase ID tokens (including revocation/disabled-user checks) and enforces verified email or phone ownership. `docs/AUTH_AND_DEPLOYMENT.md` describes setup and public-launch prerequisites.
- `backend/app/main.py` defines FastAPI startup, SQLite initialization/migration, upload validation, and job/status/source/result endpoints.
- `backend/app/services/preferences.py` validates website catalog preferences. `prompt_builder.py` constructs separate product-only and human-model prompts; `image_generation.py` calls the image-edit API.
- `backend/app/worker.py` processes jobs from an in-memory asyncio queue. `backend/app/routers/whatsapp.py` handles webhook security and SQLite-backed mock conversations.
- `backend/tests/test_catalog_flow.py` contains automated API/worker tests. `backend/test_pipeline.html` is a legacy manual browser harness without bearer-token support; use authenticated `/docs` or tests for the current API; repository-root `images.jpg` is an existing image asset.
- Frontend/backend `.env.example` files document configuration. `firebase.json` provides SPA hosting rewrites and a local Auth emulator; it does not represent an active deployment.
- Runtime data includes `backend/jobs.db`, `backend/uploads/`, and `backend/generated/`. Build output is `dist/`; dependencies and TypeScript build caches are under `node_modules/`.

## Build, Test, and Development Commands

Use Node.js 20.19+ or 22.12+, npm, Python 3.12+, and uv.

Run frontend commands from `jewel-catalog-mvp/`:

- `npm ci` installs dependencies from the lockfile.
- `npm run dev` starts Vite, normally on port 5173.
- `npm run build` runs TypeScript checks and creates the production bundle.
- `npm run preview` serves the production build locally. The backend must also run for API features.

On Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm.ps1`.

Run backend commands from `jewel-catalog-mvp/backend/`:

- `uv sync` installs Python dependencies.
- `uv run uvicorn app.main:app --reload` starts FastAPI on port 8000 and its in-process worker. Keep this working directory because storage paths are relative.
- `uv run python -B -m unittest discover -s tests -v` runs isolated backend tests without real provider calls.

The frontend uses `VITE_API_URL` (default `http://127.0.0.1:8000`); backend `ALLOWED_ORIGINS` defaults to localhost and 127.0.0.1 on port 5173. Keep these aligned when changing development addresses. API documentation is at `/docs`, and `/health` reports basic availability.

## API & Data Conventions

- Job endpoints require a Firebase bearer token and verified email or phone ownership. Every job query, original, and result must enforce `owner_id`; return 404 for other users' jobs. `GET /me` and `PUT /me` expose/update the authenticated profile; name and business are editable, while email and phone come from Firebase claims. Never infer identity from a client-supplied UID, email, job ID, or localStorage.
- `GET /jobs` lists account-owned history. Never put ID tokens in image URLs: fetch authenticated image blobs and revoke object URLs when the view unmounts. Use private/no-store responses for account resources.
- `POST /jobs` accepts multipart `image` and optional JSON-encoded `preferences`. The supported model types are `Product only`, `Female`, and `Male`. Model requests include adult age range, skin tone, and outfit; product-only requests discard hidden model answers.
- Legacy `style=ivory|sand|midnight` uploads remain supported when preferences are absent. Explicit preferences supply the generation settings; style values are still validated if supplied.
- Upload validation limits files to 10 MB and 25 megapixels and normalizes accepted images to PNG. The website accepts JPEG, PNG, and WebP.
- `GET /jobs/{job_id}` reports status; `/jobs/{job_id}/source` serves the normalized original; `/jobs/{job_id}/result` serves PNG output only for `completed` jobs.
- Persist preferences in `jobs.preferences_json`. Startup creates this column for new databases and adds it to older tables with an empty-object default, preserving existing records. Startup also adds owner, original-filename, and creation-time columns plus a users table. This does not reconstruct preferences or assign account ownership to older anonymous jobs.
- Current worker states are `received`, `processing`, `completed`, `failed`, and `mock_completed`; the frontend also recognizes `queued`. Polling must stop for terminal states and cancel obsolete requests when changing the selected job or unmounting.
- Close SQLite connections explicitly and preserve transaction handling. Keep generation behavior in services and worker orchestration separate from HTTP handlers.

## Coding Style & Naming Conventions

Match surrounding code. TypeScript uses two-space indentation, single quotes, and omitted statement semicolons. Use PascalCase for React components and types, camelCase for functions and variables, and uppercase snake_case for constants. Python uses four-space indentation and snake_case functions and modules.

TypeScript enables strict and unused-code checks. There is no configured formatter or linter. Keep form controls labeled, choices keyboard-accessible, layouts usable at phone widths, and animations compatible with reduced-motion preferences. Preserve confirmation before generation and customer-friendly recovery actions.

## Testing Guidelines

Backend tests use Python's standard-library unittest with httpx ASGI requests, temporary storage, and fake provider output. They cover upload validation, preference persistence and rejection, product/model prompts, terminal mock and failure states, original/result retrieval, and the WhatsApp mock conversation. Do not use development data or paid provider calls in routine tests. Security tests cover missing/invalid/revoked tokens, unverified email, owner isolation, profile separation, and legacy migration. Firebase Authentication emulation uses a demo project without real SMS or email; never enable emulator settings on production. The current suite contains 18 backend tests. There is no automated frontend test framework or coverage threshold. Prior browser checks used the official Auth emulator for Google, email-link, and phone signup without real messages; production provider delivery still needs verification.

For frontend changes, run `npm run build`. For backend changes, run the relevant unittest checks and verify `/health`. For flow changes, manually exercise upload, all presentation modes, conditional questions, review/edit/confirm, mock completion, and failure recovery. Check refresh/history restoration, original/result comparison, polling cancellation, and desktop/phone layouts. Verify unavailable services offer a status recheck instead of encouraging duplicate submissions. Include screenshots for UI changes and record observed verification results and limitations in the PR.

## Documentation Maintenance

Keep root `README.md` as the project overview and quick start, `jewel-catalog-mvp/README.md` as application notes, and `docs/AUTH_AND_DEPLOYMENT.md` as the detailed Firebase and launch guide. Keep the distinction between implemented code, emulator verification, externally configured services, and production readiness explicit. Preserve mock generation unless real generation is deliberately requested.

## Commit & Pull Request Guidelines

History uses short, descriptive messages such as `Add WhatsApp integration groundwork`. Follow that style and keep commits focused. PRs should describe the problem and resulting behavior, link relevant issues, list verification steps, and include screenshots for UI changes.

## Security, Configuration & Deployment Limits

Keep API keys in `backend/.env`. Image generation uses `OPENAI_API_KEY`; WhatsApp verification uses `WHATSAPP_VERIFY_TOKEN` and `WHATSAPP_APP_SECRET`. Keep secrets out of frontend code, `VITE_` variables, and logs. Firebase web app identifiers in `VITE_FIREBASE_*` are public configuration, not Admin credentials. Keep service-account JSON outside the repository and use `GOOGLE_APPLICATION_CREDENTIALS` or workload identity for the backend. Frontend/backend project IDs must match; never set `FIREBASE_AUTH_EMULATOR_HOST` on production. Preserve signature verification before accepting webhook events.

Do not switch off mock mode or make paid image-generation calls merely to run routine checks. Enable real generation deliberately when requested, with credentials and model access configured.

Exclude credentials, SQLite databases, uploaded images, generated customer outputs, bytecode, dependencies, and build artifacts from commits. Decorative website assets under `public/images/` belong in source control; customer output under `backend/generated/` does not. Preserve existing user changes and runtime data.

This is a development prototype: Firebase project configuration, generation quotas, payments, durable queue recovery, and production WhatsApp delivery remain launch requirements. Authentication and owner-scoped file access are implemented; they do not make the remaining infrastructure production-ready. Job IDs are tracking references, not authorization. Account history does not make job processing durable; queued work is currently lost when the in-memory queue restarts. Do not describe the app as production-ready without addressing these gaps.
