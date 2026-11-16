import asyncio
import sqlite3
from contextlib import closing
from pathlib import Path
import json

from app.services.image_generation import generate_catalog_image
from app.services.prompt_builder import build_catalog_prompt


MOCK_GENERATION = True

DB_PATH = Path("jobs.db")
GENERATED_DIR = Path("generated")

job_queue: asyncio.Queue[str] = asyncio.Queue()


def get_job_data(job_id: str) -> tuple[str, dict]:
    with closing(sqlite3.connect(DB_PATH)) as conn, conn:
        row = conn.execute(
            """
            SELECT image_path, preferences_json
            FROM jobs
            WHERE job_id = ?
            """,
            (job_id,),
        ).fetchone()

    if row is None:
        raise ValueError(f"Job not found: {job_id}")

    image_path, preferences_json = row

    return image_path, json.loads(preferences_json)


def update_status(job_id: str, status: str) -> None:
    with closing(sqlite3.connect(DB_PATH)) as conn, conn:
        conn.execute(
            "UPDATE jobs SET status = ? WHERE job_id = ?",
            (status, job_id),
        )


async def process_job(job_id: str) -> None:
    try:
        update_status(job_id, "processing")

        input_path, preferences = get_job_data(job_id)

        if not preferences:
            raise ValueError("Customer preferences are missing.")

        output_path = GENERATED_DIR / f"{job_id}.png"

        if MOCK_GENERATION:
            prompt = build_catalog_prompt(preferences)

            GENERATED_DIR.mkdir(parents=True, exist_ok=True)
            prompt_path = GENERATED_DIR / f"{job_id}.txt"
            prompt_path.write_text(prompt, encoding="utf-8")

            update_status(job_id, "mock_completed")
            print(f"Mock job {job_id} completed. Prompt saved: {prompt_path}")
            return

        await asyncio.to_thread(
            generate_catalog_image,
            input_path,
            output_path,
            preferences,
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
