# Repository Guidelines

## Project Structure & Module Organization

The application lives in `jewel-catalog-mvp/`.

- `src/App.tsx` contains the React upload, style selection, and job-tracking interface. `src/main.tsx` mounts the app, and `src/styles.css` defines styling.
- `backend/app/main.py` defines the FastAPI application, upload validation, and job endpoints.
- `backend/app/routers/whatsapp.py` handles webhook verification and mock conversation flows.
- `backend/app/worker.py` processes queued jobs. `backend/app/services/` contains prompt construction and image generation.
- `backend/test_pipeline.html` is a manual browser harness. The repository-root `images.jpg` is an image asset.
- Runtime data includes `backend/jobs.db`, `backend/uploads/`, and `backend/generated/`.

## Build, Test, and Development Commands

Use Node.js 20.19+ or 22.12+, npm, Python 3.12+, and uv.

Run frontend commands from `jewel-catalog-mvp/`.

- `npm ci` installs dependencies from the lockfile.
- `npm run dev` starts Vite, normally on port 5173.
- `npm run build` runs TypeScript checks and creates the production bundle.
- `npm run preview` serves the production build locally.

Run backend commands from `jewel-catalog-mvp/backend/`.

- `uv sync` installs Python dependencies.
- `uv run uvicorn app.main:app --reload` starts FastAPI on port 8000 and its in-process worker. Keep this working directory because storage paths are relative.

## Coding Style & Naming Conventions

Match surrounding code. TypeScript uses two-space indentation, single quotes, and omitted statement semicolons. Use PascalCase for React components and types, camelCase for functions and variables, and uppercase snake_case for constants. Python uses four-space indentation and snake_case functions and modules. Keep HTTP handlers in routers and generation logic in services.

TypeScript enables strict and unused-code checks. The repository has no configured formatter or linter.

## Testing Guidelines

There is no automated test framework or coverage threshold. Run `npm run build`, check `/health`, and manually exercise uploads, validation errors, job polling, and the WhatsApp mock flow. The worker currently enables `MOCK_GENERATION`, which writes prompts and reports `mock_completed`. Record observed results and failures in the PR.

## Commit & Pull Request Guidelines

History uses short, descriptive messages such as `Add WhatsApp integration groundwork`. Follow that style and keep commits focused. PRs should describe changes, link relevant issues, list verification steps, and include screenshots for UI changes.

## Security & Configuration

Keep API keys in `backend/.env`. WhatsApp verification uses `WHATSAPP_VERIFY_TOKEN` and `WHATSAPP_APP_SECRET`. Keep secrets out of `VITE_` variables. Exclude credentials, SQLite databases, uploaded images, and generated outputs from commits.
