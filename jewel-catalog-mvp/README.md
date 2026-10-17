# Jewel Studio — AI Catalog MVP (Phase 1)

A React + TypeScript frontend prototype for a jewelry catalog-generation product.

## Current scope
- Upload JPG, PNG, or WebP files up to 10 MB.
- Preview the selected source image.
- Choose one of three catalog background styles.
- Generate a **local demo composition** using the browser canvas.
- Download the composition as a PNG.
- Responsive layout and basic upload error handling.

## Not implemented yet
- Real AI image generation (the current output is a layout mock, not AI-edited photography).
- Authentication.
- FastAPI backend, PostgreSQL, private object storage, and background worker.
- Production-grade server-side upload validation and quotas.

## Requirements
- Node.js 20.19+ or 22.12+
- npm

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Verify production build

```bash
npm run build
npm run preview
```

## Next phase
Build the FastAPI backend and authentication integration. Then add private uploads, a PostgreSQL job record, a background worker, and a real image-generation API. Keep provider API keys on the backend; never put them in frontend environment variables prefixed with `VITE_`.
