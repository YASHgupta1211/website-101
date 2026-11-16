from pathlib import Path
from uuid import uuid4
import sqlite3
import json
import asyncio
from contextlib import asynccontextmanager, closing

from fastapi.params import Form
from app.worker import GENERATED_DIR, job_queue, worker_loop

from fastapi import FastAPI, File, HTTPException, UploadFile
from io import BytesIO
from PIL import Image, UnidentifiedImageError
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from app.routers.whatsapp import router as whatsapp_router
from app.services.preferences import CatalogPreferences
from pydantic import ValidationError


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    worker_task = asyncio.create_task(worker_loop())
    try:
        yield
    finally:
        worker_task.cancel()
        try:
            await worker_task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title="Jewelry Catalog API",
    lifespan=lifespan,
)

app.include_router(whatsapp_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

DB_PATH = Path("jobs.db")
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
CATALOG_BACKGROUNDS = {
    "ivory": "Soft ivory",
    "sand": "Warm sand",
    "midnight": "Midnight",
}


def init_db():
    with closing(sqlite3.connect(DB_PATH)) as conn, conn:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS jobs (
                job_id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                image_path TEXT NOT NULL,
                preferences_json TEXT NOT NULL DEFAULT '{}'
            )
        """)
        columns = {
            row[1] for row in conn.execute("PRAGMA table_info(jobs)")
        }
        if "preferences_json" not in columns:
            conn.execute("""
                ALTER TABLE jobs
                ADD COLUMN preferences_json TEXT NOT NULL DEFAULT '{}'
            """)


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/jobs", status_code=202)
async def create_job(
    image: UploadFile = File(...),
    style: str = Form("ivory"),
    preferences: str | None = Form(None),
):
    if style not in CATALOG_BACKGROUNDS:
        raise HTTPException(status_code=400, detail="Invalid catalog style.")
    try:
        if preferences is None:
            customer_preferences = CatalogPreferences(
                background=CATALOG_BACKGROUNDS[style]
            )
        else:
            customer_preferences = CatalogPreferences.model_validate_json(preferences)
    except ValidationError:
        raise HTTPException(
            status_code=422,
            detail="Choose a supported option for each catalog preference.",
        )

    # 1. Check the declared content type.
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail="Please upload an image.",
        )

    # 2. Read at most 10 MB + 1 byte to detect oversized uploads.
    contents = await image.read(MAX_FILE_SIZE + 1)

    if not contents:
        raise HTTPException(status_code=400, detail="Image is empty.")

    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="Image exceeds 10 MB.",
        )

    # 3. Verify that the uploaded bytes contain a valid image.
    try:
        with Image.open(BytesIO(contents)) as img:
            img.verify()

        # Reopen after verify(), then normalize to PNG.
        with Image.open(BytesIO(contents)) as img:
            img.load()

            if img.width * img.height > 25_000_000:
                raise HTTPException(
                    status_code=413,
                    detail="Image dimensions are too large.",
                )

            # Preserve transparency where possible.
            if img.mode in ("RGBA", "LA") or "transparency" in img.info:
                normalized = img.convert("RGBA")
            else:
                normalized = img.convert("RGB")

            buffer = BytesIO()
            normalized.save(buffer, format="PNG")
            png_bytes = buffer.getvalue()

    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is not a valid supported image.",
        )

    # 4. Save the normalized image as PNG.
    job_id = str(uuid4())
    image_path = UPLOAD_DIR / f"{job_id}.png"
    image_path.write_bytes(png_bytes)

    # 5. Create the database record.
    try:
        with closing(sqlite3.connect(DB_PATH)) as conn, conn:
            conn.execute(
                """
                INSERT INTO jobs (job_id, status, image_path, preferences_json)
                VALUES (?, ?, ?, ?)
                """,
                (
                    job_id,
                    "received",
                    str(image_path),
                    json.dumps(customer_preferences.for_generation()),
                ),
            )
    except Exception:
        image_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=500,
            detail="Could not create job.",
        )

    # 6. Send the job to the worker.
    await job_queue.put(job_id)

    return {"job_id": job_id, "status": "received"}


@app.get("/jobs/{job_id}")
def get_job(job_id: str):
    with closing(sqlite3.connect(DB_PATH)) as conn, conn:
        conn.row_factory = sqlite3.Row
        job = conn.execute(
            "SELECT job_id, status FROM jobs WHERE job_id = ?", (job_id,)
        ).fetchone()

    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")

    return dict(job)


@app.get("/jobs/{job_id}/result")
def get_job_result(job_id: str):
    # Check whether the job exists and is completed.
    with closing(sqlite3.connect(DB_PATH)) as conn, conn:
        row = conn.execute(
            "SELECT status FROM jobs WHERE job_id = ?",
            (job_id,),
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Job not found.")

    if row[0] != "completed":
        raise HTTPException(
            status_code=409,
            detail=f"Image is not ready. Current status: {row[0]}",
        )

    # Locate the output image.
    output_path = GENERATED_DIR / f"{job_id}.png"

    if not output_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Generated image file not found.",
        )

    return FileResponse(
        path=output_path,
        media_type="image/png",
        filename=f"{job_id}.png",
    )


@app.get("/jobs/{job_id}/source")
def get_job_source(job_id: str):
    with closing(sqlite3.connect(DB_PATH)) as conn, conn:
        row = conn.execute(
            "SELECT image_path FROM jobs WHERE job_id = ?", (job_id,)
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Job not found.")

    image_path = Path(row[0])
    if not image_path.is_file():
        raise HTTPException(status_code=404, detail="Original image is unavailable.")

    return FileResponse(path=image_path, media_type="image/png")
