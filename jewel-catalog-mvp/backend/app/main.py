from pathlib import Path
from uuid import uuid4
import sqlite3
import asyncio
from contextlib import asynccontextmanager

from fastapi.params import Form
from app.worker import job_queue, worker_loop

from fastapi import FastAPI, File, HTTPException, UploadFile
from io import BytesIO
from PIL import Image, UnidentifiedImageError
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from app.routers.whatsapp import router as whatsapp_router


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


def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS jobs (
                job_id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                image_path TEXT NOT NULL
            )
        """)


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/jobs", status_code=202)
async def create_job(
    image: UploadFile = File(...),
    style: str = Form("ivory"),
):
    if style not in {"ivory", "sand", "midnight"}:
        raise HTTPException(status_code=400, detail="Invalid catalog style.")
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
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute(
                """
                INSERT INTO jobs (job_id, status, image_path)
                VALUES (?, ?, ?)
                """,
                (job_id, "received", str(image_path)),
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
    with sqlite3.connect(DB_PATH) as conn:
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
    with sqlite3.connect(DB_PATH) as conn:
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
    output_path = Path("generated") / f"{job_id}.png"

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
