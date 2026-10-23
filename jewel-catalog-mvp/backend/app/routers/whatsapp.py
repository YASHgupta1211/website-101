import hashlib
import hmac
import json
import os
import sqlite3
from pathlib import Path
from uuid import uuid4
from io import BytesIO

from fastapi import File, UploadFile
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse

router = APIRouter(prefix="/webhooks/whatsapp", tags=["WhatsApp"])


@router.get("")
async def verify_webhook(
    hub_mode: str | None = Query(None, alias="hub.mode"),
    hub_verify_token: str | None = Query(None, alias="hub.verify_token"),
    hub_challenge: str | None = Query(None, alias="hub.challenge"),
):
    expected_token = os.getenv("WHATSAPP_VERIFY_TOKEN")

    if (
        hub_mode == "subscribe"
        and expected_token
        and hmac.compare_digest(hub_verify_token or "", expected_token)
        and hub_challenge is not None
    ):
        return PlainTextResponse(hub_challenge)

    raise HTTPException(status_code=403, detail="Verification failed")


@router.post("")
async def receive_webhook(request: Request):
    app_secret = os.getenv("WHATSAPP_APP_SECRET")
    signature = request.headers.get("X-Hub-Signature-256")

    if not app_secret or not signature:
        raise HTTPException(status_code=401, detail="Missing signature")

    body = await request.body()
    expected_signature = (
        "sha256="
        + hmac.new(
            app_secret.encode("utf-8"),
            body,
            hashlib.sha256,
        ).hexdigest()
    )

    if not hmac.compare_digest(signature, expected_signature):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Temporary: inspect the event structure without logging customer content.
    print("WhatsApp webhook received. Object:", payload.get("object"))

    return {"received": True}


DB_PATH = Path("jobs.db")
MOCK_UPLOAD_DIR = Path("uploads/mock_whatsapp")
MOCK_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_IMAGE_SIZE = 10 * 1024 * 1024

QUESTIONS = [
    {
        "key": "model_type",
        "question": "What type of model do you prefer?",
        "options": ["Female", "Male", "Product only"],
    },
    {
        "key": "age_range",
        "question": "What age range should the model appear to be?",
        "options": ["Young adult", "Mature adult"],
    },
    {
        "key": "skin_tone",
        "question": "What skin tone do you prefer?",
        "options": [
            "Fair", "Light-medium", "Medium", "Deep", "Choose for me"
        ],
    },
    {
        "key": "outfit",
        "question": "What outfit style and colour do you prefer?",
        "options": [
            "Traditional", "Contemporary", "Formal", "Custom"
        ],
    },
    {
        "key": "background",
        "question": "What background or overall look do you prefer?",
        "options": [
            "Luxury studio", "Wedding", "Festive", "Minimal", "Choose for me"
        ],
    },
]


def init_mock_sessions():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS mock_sessions (
                session_id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                image_path TEXT,
                answers_json TEXT NOT NULL DEFAULT '{}',
                question_index INTEGER NOT NULL DEFAULT 0
            )
        """)


init_mock_sessions()


class MockMessage(BaseModel):
    message: str


def get_session(session_id: str):
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM mock_sessions WHERE session_id = ?",
            (session_id,),
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Session not found.")

    return dict(row)


@router.post("/mock/start")
def start_mock_conversation():
    session_id = str(uuid4())

    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO mock_sessions (session_id, status, answers_json)
            VALUES (?, 'awaiting_photo', '{}')
            """,
            (session_id,),
        )

    return {
        "session_id": session_id,
        "status": "awaiting_photo",
        "message": "Upload your jewelry photo to begin.",
    }


@router.post("/mock/{session_id}/photo")
async def upload_mock_photo(
    session_id: str,
    image: UploadFile = File(...),
):
    session = get_session(session_id)

    if session["status"] != "awaiting_photo":
        raise HTTPException(
            status_code=409,
            detail="This session is not waiting for a photo.",
        )

    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Upload an image.")

    contents = await image.read(MAX_IMAGE_SIZE + 1)

    if not contents:
        raise HTTPException(status_code=400, detail="Image is empty.")

    if len(contents) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=413, detail="Image exceeds 10 MB.")

    try:
        with Image.open(BytesIO(contents)) as img:
            img.verify()

        with Image.open(BytesIO(contents)) as img:
            img.load()

            if img.width * img.height > 25_000_000:
                raise HTTPException(
                    status_code=413,
                    detail="Image dimensions are too large.",
                )

            normalized = img.convert(
                "RGBA" if "A" in img.getbands() else "RGB"
            )
            path = MOCK_UPLOAD_DIR / f"{session_id}.png"
            normalized.save(path, format="PNG")

    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid image file.")
    finally:
        await image.close()

    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            UPDATE mock_sessions
            SET image_path = ?, status = 'collecting_answers'
            WHERE session_id = ?
            """,
            (str(path), session_id),
        )

    return {
        "session_id": session_id,
        "status": "collecting_answers",
        "question_number": 1,
        **QUESTIONS[0],
    }


@router.post("/mock/{session_id}/message")
def answer_mock_question(session_id: str, body: MockMessage):
    session = get_session(session_id)

    if session["status"] != "collecting_answers":
        raise HTTPException(
            status_code=409,
            detail="Upload the photo before answering questions.",
        )

    answer = body.message.strip()
    if not answer:
        raise HTTPException(status_code=400, detail="Answer cannot be empty.")

    index = session["question_index"]
    if index >= len(QUESTIONS):
        raise HTTPException(status_code=409, detail="Questions are complete.")

    answers = json.loads(session["answers_json"])
    question = QUESTIONS[index]
    answers[question["key"]] = answer
    next_index = index + 1
    complete = next_index == len(QUESTIONS)
    status = "ready_for_generation" if complete else "collecting_answers"

    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            UPDATE mock_sessions
            SET answers_json = ?, question_index = ?, status = ?
            WHERE session_id = ?
            """,
            (json.dumps(answers), next_index, status, session_id),
        )

    if complete:
        return {
            "session_id": session_id,
            "status": status,
            "message": "All five answers collected. No generation job was started.",
            "request": {
                "image_path": session["image_path"],
                "specifications": answers,
                "generation_mode": "mock_not_started",
            },
        }

    return {
        "session_id": session_id,
        "status": status,
        "question_number": next_index + 1,
        **QUESTIONS[next_index],
    }


@router.get("/mock/{session_id}")
def inspect_mock_session(session_id: str):
    session = get_session(session_id)
    return {
        "session_id": session["session_id"],
        "status": session["status"],
        "image_path": session["image_path"],
        "answers": json.loads(session["answers_json"]),
        "questions_answered": session["question_index"],
    }

