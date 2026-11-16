# Jewel Studio

A jewelry catalog-image studio built with React, TypeScript, and FastAPI. Sellers upload a product photo, answer guided styling questions, and request a new image using their original photo, preset instructions, and preferences.

The product is intended for both the website and WhatsApp. The current website works with a mock generation pipeline; the WhatsApp conversation is a development mock.

**Current generation mode:** mock. Requests save an assembled prompt, not an AI-generated image. The decorative hero photograph is an editorial concept, not a demonstrated customer result.

## Features

- JPEG, PNG, and WebP uploads up to 10 MB, with server-side image validation and PNG normalization.
- Product-only photography or female/male adult models.
- Background presets, plus model age, skin tone, outfit, and scene choices where relevant.
- A confirmation step before submitting a generation request.
- Job progress, explicit mock completion, readable errors, and connection recovery.
- Original/result comparison and PNG downloads for completed real generations.
- The last 12 requests saved in the current browser, with status recovery after refresh.
- A responsive ivory, olive, and gold studio interface with custom icons and editorial artwork.
- WhatsApp webhook verification, signature validation, and a guided mock conversation.

Browser history stores request references and preferences, not image bytes. It is specific to the browser and origin; it is not an account or cross-device history.

## Requirements

- Node.js 20.19+ or 22.12+ and npm.
- Python 3.12+ and uv.
- An OpenAI API key and access to the configured image model only when deliberately enabling real generation.

## Run locally

Open two terminals from the repository root.

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

The frontend API address is currently defined in `src/App.tsx`. Backend CORS allows localhost and 127.0.0.1 on port 5173. Keep these settings aligned if changing ports.

On Windows PowerShell, use `npm.cmd` instead of `npm` if script execution policy blocks `npm.ps1`.

## How requests work

```text
Photo + preferences -> Backend validation -> SQLite job + in-memory queue
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

1. Create `jewel-catalog-mvp/backend/.env` with `OPENAI_API_KEY=your_api_key`.
2. Confirm access to the model configured in `backend/app/services/image_generation.py`.
3. Change `MOCK_GENERATION` to `False` in the worker and restart the backend if necessary.

The current service submits the original image and constructed prompt to the image-edit API, requesting a high-quality 1024 x 1024 PNG. Provider calls incur charges. Routine tests use mock output and require no paid API calls.

## API overview

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/health` | Basic availability check |
| POST | `/jobs` | Submit an image and preferences; returns a job ID |
| GET | `/jobs/{job_id}` | Retrieve status |
| GET | `/jobs/{job_id}/source` | Retrieve the normalized original photo |
| GET | `/jobs/{job_id}/result` | Download the result of a `completed` job |
| GET / POST | `/webhooks/whatsapp` | Verify subscription / validate incoming webhook signatures |

Use `/docs` to explore and submit multipart requests interactively.

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

The mock endpoints under `/webhooks/whatsapp/mock` allow starting a session, uploading a photo, answering guided questions, and creating a queued job. Use the API documentation or `backend/test_pipeline.html` to explore the development flow.

The live webhook does not yet download WhatsApp media, conduct conversations, or deliver generated images. Those steps and Meta production onboarding remain future work.

## Project layout

```text
AGENTS.md                           Contributor and agent guidelines
jewel-catalog-mvp/
  src/App.tsx                       Guided upload, tracking, and comparison UI
  src/styles.css                    Responsive studio design
  public/images/                    Decorative artwork and generation provenance
  backend/app/main.py               FastAPI app, validation, database, and endpoints
  backend/app/worker.py             Queue processing and mock/real generation
  backend/app/services/             Preferences, prompts, and image-edit integration
  backend/app/routers/whatsapp.py    Webhook security and mock conversations
  backend/tests/                    Isolated API and worker checks
  backend/test_pipeline.html        Manual development harness
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

Backend tests use temporary databases/uploads and fake provider output. They cover validation, preference persistence, product/model prompts, mock completion, worker failures, source/result retrieval, and the WhatsApp mock flow.

For UI changes, check desktop and phone layouts, upload validation, conditional questions, review/edit/confirm, terminal statuses, refresh/history recovery, and connection-error recovery. There is no configured frontend test framework or coverage threshold.

## Before a public launch

This is a development prototype. Authentication, per-user file authorization, quotas, payments, durable queue recovery, and production WhatsApp delivery are not implemented. Job IDs are tracking references, not access controls. Browser history can restore status checks but cannot recover work lost from the in-memory queue after a backend restart.

Keep secrets on the backend and out of `VITE_` variables, logs, and commits. Do not commit credentials, databases, uploaded photos, generated customer outputs, bytecode, dependencies, or build artifacts.

See [application notes](jewel-catalog-mvp/README.md), [artwork provenance](jewel-catalog-mvp/public/images/README.md), and [repository guidelines](AGENTS.md) for more detail.
