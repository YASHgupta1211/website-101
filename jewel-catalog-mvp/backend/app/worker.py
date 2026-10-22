import asyncio
import sqlite3
from pathlib import Path

from app.services.image_generation import generate_catalog_image

DB_PATH = Path("jobs.db")
GENERATED_DIR = Path("generated")

job_queue: asyncio.Queue[str] = asyncio.Queue()


def get_image_path(job_id: str) -> str:
    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute(
            "SELECT image_path FROM jobs WHERE job_id = ?",
            (job_id,),
        ).fetchone()

    if row is None:
        raise ValueError(f"Job not found: {job_id}")

    return row[0]


def update_status(job_id: str, status: str) -> None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "UPDATE jobs SET status = ? WHERE job_id = ?",
            (status, job_id),
        )


async def process_job(job_id: str) -> None:
    try:
        update_status(job_id, "processing")

        input_path = get_image_path(job_id)
        output_path = GENERATED_DIR / f"{job_id}.png"

        # Run the synchronous API call without blocking FastAPI.
        await asyncio.to_thread(
            generate_catalog_image,
            input_path,
            output_path,
        )

        update_status(job_id, "completed")

    except Exception as exc:
        update_status(job_id, "failed")
        print(f"Job {job_id} failed: {exc}")


async def worker_loop() -> None:
    while True:
        job_id = await job_queue.get()
        try:
            await process_job(job_id)
        finally:
            job_queue.task_done()
