import hashlib
import hmac
import json
import os

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
