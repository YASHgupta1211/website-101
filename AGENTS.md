# Repository Guidelines

## Product & Current State

Jewel Studio turns a seller's jewelry photo and guided preferences into a catalog image. The intended channels are the website and WhatsApp. The current focus is a low-budget invited pilot supporting product-only images and female/male adult models, with jewelry accuracy as the priority.

The website supports upload, conditional styling questions, confirmation, job tracking, before-and-after comparison, and PNG download when a real result exists. It stores the last 12 request references and preferences in browser localStorage (`jewel-studio-jobs-v1`); image bytes remain on the backend. History is specific to the browser and origin, not an account or cross-device collection.

Generation currently uses `MOCK_GENERATION = True` in the worker. Mock jobs write a prompt text file and finish as `mock_completed`; they do not produce an image. Keep this status distinct from `completed` in the UI. Live WhatsApp webhook verification and signature checks exist, but incoming conversation handling, media download, and result delivery are not implemented. The guided WhatsApp flow is available through mock endpoints only.

## Project Structure & Module Organization

The application lives in `jewel-catalog-mvp/`.

- `src/App.tsx` contains the React guided upload flow, review step, job polling, comparison, downloads, and browser-local history. `src/main.tsx` mounts the app.
- `src/styles.css` defines the responsive luxury-studio design: ivory, olive, restrained gold, serif headings, and accessible focus states. Preserve this visual direction when extending the interface.
- `public/images/studio-editorial.png` is decorative AI-generated hero artwork. Its provenance and prompt are in `public/images/README.md`. It is an editorial concept, not a customer result or evidence of product accuracy.
- `backend/app/main.py` defines FastAPI startup, SQLite initialization/migration, upload validation, and job/status/source/result endpoints.
- `backend/app/services/preferences.py` validates website catalog preferences. `prompt_builder.py` constructs separate product-only and human-model prompts; `image_generation.py` calls the image-edit API.
- `backend/app/worker.py` processes jobs from an in-memory asyncio queue. `backend/app/routers/whatsapp.py` handles webhook security and SQLite-backed mock conversations.
- `backend/tests/test_catalog_flow.py` contains automated API/worker tests. `backend/test_pipeline.html` is a manual browser harness; repository-root `images.jpg` is an existing image asset.
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

The frontend currently calls `http://127.0.0.1:8000`; backend CORS permits localhost and 127.0.0.1 on port 5173. Keep these aligned when changing development addresses. API documentation is at `/docs`, and `/health` reports basic availability.

## API & Data Conventions

- `POST /jobs` accepts multipart `image` and optional JSON-encoded `preferences`. The supported model types are `Product only`, `Female`, and `Male`. Model requests include adult age range, skin tone, and outfit; product-only requests discard hidden model answers.
- Legacy `style=ivory|sand|midnight` uploads remain supported when preferences are absent. Explicit preferences supply the generation settings; style values are still validated if supplied.
- Upload validation limits files to 10 MB and 25 megapixels and normalizes accepted images to PNG. The website accepts JPEG, PNG, and WebP.
- `GET /jobs/{job_id}` reports status; `/jobs/{job_id}/source` serves the normalized original; `/jobs/{job_id}/result` serves PNG output only for `completed` jobs.
- Persist preferences in `jobs.preferences_json`. Startup creates this column for new databases and adds it to older tables with an empty-object default, preserving existing records. This does not reconstruct preferences for older jobs.
- Current worker states are `received`, `processing`, `completed`, `failed`, and `mock_completed`; the frontend also recognizes `queued`. Polling must stop for terminal states and cancel obsolete requests when changing the selected job or unmounting.
- Close SQLite connections explicitly and preserve transaction handling. Keep generation behavior in services and worker orchestration separate from HTTP handlers.

## Coding Style & Naming Conventions

Match surrounding code. TypeScript uses two-space indentation, single quotes, and omitted statement semicolons. Use PascalCase for React components and types, camelCase for functions and variables, and uppercase snake_case for constants. Python uses four-space indentation and snake_case functions and modules.

TypeScript enables strict and unused-code checks. There is no configured formatter or linter. Keep form controls labeled, choices keyboard-accessible, layouts usable at phone widths, and animations compatible with reduced-motion preferences. Preserve confirmation before generation and customer-friendly recovery actions.

## Testing Guidelines

Backend tests use Python's standard-library unittest with httpx ASGI requests, temporary storage, and fake provider output. They cover upload validation, preference persistence and rejection, product/model prompts, terminal mock and failure states, original/result retrieval, and the WhatsApp mock conversation. Do not use development data or paid provider calls in routine tests. There is no automated frontend test framework or coverage threshold.

For frontend changes, run `npm run build`. For backend changes, run the relevant unittest checks and verify `/health`. For flow changes, manually exercise upload, all presentation modes, conditional questions, review/edit/confirm, mock completion, and failure recovery. Check refresh/history restoration, original/result comparison, polling cancellation, and desktop/phone layouts. Verify unavailable services offer a status recheck instead of encouraging duplicate submissions. Include screenshots for UI changes and record observed verification results and limitations in the PR.

## Commit & Pull Request Guidelines

History uses short, descriptive messages such as `Add WhatsApp integration groundwork`. Follow that style and keep commits focused. PRs should describe the problem and resulting behavior, link relevant issues, list verification steps, and include screenshots for UI changes.

## Security, Configuration & Deployment Limits

Keep API keys in `backend/.env`. Image generation uses `OPENAI_API_KEY`; WhatsApp verification uses `WHATSAPP_VERIFY_TOKEN` and `WHATSAPP_APP_SECRET`. Keep secrets out of frontend code, `VITE_` variables, and logs. Preserve signature verification before accepting webhook events.

Do not switch off mock mode or make paid image-generation calls merely to run routine checks. Enable real generation deliberately when requested, with credentials and model access configured.

Exclude credentials, SQLite databases, uploaded images, generated customer outputs, bytecode, dependencies, and build artifacts from commits. Decorative website assets under `public/images/` belong in source control; customer output under `backend/generated/` does not. Preserve existing user changes and runtime data.

This is a development prototype: authentication, per-user file authorization, quotas, payments, durable queue recovery, and production WhatsApp delivery are not implemented. Job IDs are tracking references, not authorization. Browser history does not make job processing durable; queued work is currently lost when the in-memory queue restarts. Do not describe the app as production-ready without addressing these gaps.
