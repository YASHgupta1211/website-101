# Jewel Studio — Catalog MVP

React + TypeScript website with a FastAPI backend for jewelry catalog images.

## Current flow

- Upload a JPG, PNG, or WebP photo up to 10 MB.
- Choose product-only photography or a female/male adult model.
- Choose a background; model requests also collect age range, skin tone, and outfit.
- Review the photo filename and preferences before submitting.
- Track queued, generating, ready, failed, and mock-completed requests.
- Compare the original and generated image and download a PNG.
- Reopen the last 12 requests stored in this browser, including after refresh.

History stores request references and preferences, not image bytes. It is specific
to this browser and origin; clearing browser storage removes it. Original and
result files remain on the backend. This development app has no authentication,
private per-user access, durable queue recovery, payments, or quotas yet.

## Run locally

Use Node.js 20.19+ or 22.12+, npm, Python 3.12+, and uv.

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

The frontend calls `http://127.0.0.1:8000`. Keep the backend working directory
as shown because its SQLite database, uploads, and results use relative paths.
The backend adds the missing preferences column to older databases at startup.

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

`GET /jobs/{job_id}` reports status, `GET /jobs/{job_id}/source` serves the
normalized original, and `GET /jobs/{job_id}/result` serves completed image output.
The WhatsApp conversation remains a mock flow; live message handling and result
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

Backend tests use temporary storage and fake provider output. They cover upload
validation, each presentation mode, saved preferences, mock completion, failures,
original/result retrieval, and the existing WhatsApp mock conversation.

For browser checks, upload a photo, choose each presentation mode, review the
summary, confirm, and refresh. Check that mock completion stops polling, history
reopens the original request, unavailable services offer a status recheck, and
the form and comparison remain usable at phone widths.
