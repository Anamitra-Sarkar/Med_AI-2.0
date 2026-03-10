"""Valeon – Medical AI backend (FastAPI)."""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

import bleach
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, StreamingResponse
from groq import Groq
from pydantic import BaseModel, Field
from pymongo import MongoClient

from models import MODEL_REGISTRY, predict

load_dotenv()

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# App + CORS
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Valeon API",
    version="1.0.0",
    description="Medical AI diagnostic backend powering the Valeon platform.",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Origins: localhost dev, any Vercel deployment, and the HuggingFace Space itself
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=(
        r"^https?://localhost:3000$"
        r"|^https://.*\.vercel\.app$"
        r"|^https://.*\.hf\.space$"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Clients
# ---------------------------------------------------------------------------
_groq_api_key = os.getenv("GROQ_API_KEY")
if not _groq_api_key:
    logger.warning("GROQ_API_KEY is not set – chat and summarisation endpoints will fail.")
groq_client = Groq(api_key=_groq_api_key)

# MongoDB (optional – endpoints degrade gracefully if unavailable)
_mongo_client: MongoClient | None = None
_db: Any = None

MONGODB_URI = os.getenv("MONGODB_URI")
if MONGODB_URI:
    try:
        _mongo_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
        _db = _mongo_client["valeon"]
        logger.info("Connected to MongoDB Atlas.")
    except Exception as exc:
        logger.warning("MongoDB connection failed: %s", exc)
else:
    logger.warning("MONGODB_URI is not set – profile endpoints will return 503.")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"}
CHAT_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
SUMMARIZER_MODEL = "qwen/qwen3-32b"
BASE_SYSTEM_PROMPT = (
    "You are Valeon, a helpful medical AI assistant. "
    "Provide accurate, empathetic, and evidence-based health information. "
    "Always remind users to consult a qualified healthcare professional for diagnosis and treatment."
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _sanitize(text: str) -> str:
    """Strip dangerous HTML / JS from user-supplied text."""
    cleaned = bleach.clean(text, tags=[], attributes={}, strip=True)
    return cleaned.strip()


def _build_system_prompt(user_profile: dict | None) -> str:
    """Extend the base system prompt with patient context when a profile is available."""
    if not user_profile:
        return BASE_SYSTEM_PROMPT

    parts = []
    if user_profile.get("name"):
        parts.append(f"Patient name: {_sanitize(user_profile['name'])}")
    if user_profile.get("email"):
        parts.append(f"Email: {_sanitize(user_profile['email'])}")
    if user_profile.get("diseases"):
        parts.append(f"Known conditions: {_sanitize(user_profile['diseases'])}")
    if user_profile.get("height"):
        parts.append(f"Height: {_sanitize(user_profile['height'])}")
    if user_profile.get("weight"):
        parts.append(f"Weight: {_sanitize(user_profile['weight'])}")
    if user_profile.get("left_eye_power"):
        parts.append(f"Left eye power: {_sanitize(user_profile['left_eye_power'])}")
    if user_profile.get("right_eye_power"):
        parts.append(f"Right eye power: {_sanitize(user_profile['right_eye_power'])}")

    if not parts:
        return BASE_SYSTEM_PROMPT

    profile_ctx = (
        "\n\nPatient profile (use this context to personalise every response — "
        "address the patient by name, factor in their conditions, and tailor advice accordingly):\n"
        + "\n".join(f"  \u2022 {p}" for p in parts)
    )
    return BASE_SYSTEM_PROMPT + profile_ctx


def _profiles_collection():
    if _db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    return _db["profiles"]


async def _validate_upload(file: UploadFile) -> bytes:
    """Read upload, enforce size & type limits."""
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type: {file.content_type}. Allowed: {', '.join(sorted(ALLOWED_CONTENT_TYPES))}",
        )
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 10 MB limit")
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty file")
    return data


def _serialize_profile(doc: dict) -> dict:
    """Convert MongoDB document to JSON-safe dict."""
    doc["id"] = str(doc.pop("_id"))
    return doc


# ---------------------------------------------------------------------------
# Summarizer (shared by diagnostic endpoints)
# ---------------------------------------------------------------------------


def summarize_prediction(model_name: str, predictions: dict[str, float]) -> str:
    """Call qwen3-32b to produce a human-readable diagnostic summary."""
    sorted_preds = sorted(predictions.items(), key=lambda x: x[1], reverse=True)
    pred_text = "\n".join(f"  - {cls}: {prob * 100:.2f}%" for cls, prob in sorted_preds)
    prompt = (
        f"You are a medical AI report generator. A patient submitted a medical image "
        f"analysed by the **{model_name}** diagnostic model.\n\n"
        f"Prediction probabilities:\n{pred_text}\n\n"
        f"Write a concise, empathetic, patient-friendly summary of the results. "
        f"Highlight the most likely finding, explain what it means in simple terms, "
        f"note any secondary findings worth mentioning, and remind the patient to "
        f"consult a healthcare professional for a definitive diagnosis. "
        f"Do NOT use markdown formatting. Do NOT include thinking tags or chain-of-thought."
    )

    response = groq_client.chat.completions.create(
        model=SUMMARIZER_MODEL,
        messages=[
            {
                "role": "system",
                "content": "You are a concise medical report summariser. Output plain text only. No thinking tags, no markdown.",
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
        max_completion_tokens=1024,
    )
    raw = response.choices[0].message.content or ""
    # Strip any residual chain-of-thought blocks that some model versions emit
    cleaned = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
    return cleaned


# ---------------------------------------------------------------------------
# Routes – Root & Health
# ---------------------------------------------------------------------------


@app.get("/", include_in_schema=False)
async def root():
    """Redirect bare root requests to the interactive API docs."""
    return RedirectResponse(url="/docs")


@app.api_route("/health", methods=["GET", "HEAD"])
async def health_check():
    """Liveness probe – supports both GET and HEAD (used by HuggingFace Spaces)."""
    return {"status": "ok", "service": "valeon-api"}


# ---------------------------------------------------------------------------
# Routes – Chat (SSE streaming)
# ---------------------------------------------------------------------------


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    history: list[dict[str, str]] = Field(default_factory=list)
    user_profile: dict[str, Any] | None = Field(default=None)


@app.post("/api/chat")
async def chat(req: ChatRequest):
    message = _sanitize(req.message)
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty after sanitisation")

    system_content = _build_system_prompt(req.user_profile)

    messages: list[dict[str, str]] = [{"role": "system", "content": system_content}]
    for entry in req.history[-20:]:
        role = entry.get("role", "user")
        if role not in ("user", "assistant"):
            continue
        messages.append({"role": role, "content": _sanitize(entry.get("content", ""))})
    messages.append({"role": "user", "content": message})

    stream = groq_client.chat.completions.create(
        model=CHAT_MODEL,
        messages=messages,
        temperature=0.7,
        max_completion_tokens=2048,
        stream=True,
    )

    async def _event_generator():
        try:
            for chunk in stream:
                delta = chunk.choices[0].delta
                if delta.content:
                    payload = json.dumps({"content": delta.content})
                    yield f"data: {payload}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as exc:
            logger.error("Chat stream error: %s", exc)
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"

    return StreamingResponse(_event_generator(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Routes – Image analysis (vision)
# ---------------------------------------------------------------------------


@app.post("/api/analyze-image")
async def analyze_image(
    file: UploadFile = File(...),
    prompt: str = Form(default="Describe this medical image in detail."),
):
    image_bytes = await _validate_upload(file)
    prompt = _sanitize(prompt) or "Describe this medical image in detail."

    import base64

    b64 = base64.b64encode(image_bytes).decode()
    mime = file.content_type or "image/jpeg"

    response = groq_client.chat.completions.create(
        model=CHAT_MODEL,
        messages=[
            {"role": "system", "content": BASE_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                ],
            },
        ],
        temperature=0.4,
        max_completion_tokens=2048,
    )
    return {"analysis": response.choices[0].message.content}


# ---------------------------------------------------------------------------
# Routes – Summarizer (standalone)
# ---------------------------------------------------------------------------


class SummarizeRequest(BaseModel):
    model_name: str
    predictions: dict[str, float]


@app.post("/api/summarize")
async def summarize(req: SummarizeRequest):
    model_name = _sanitize(req.model_name)
    if not model_name:
        raise HTTPException(status_code=400, detail="model_name is required")
    summary = summarize_prediction(model_name, req.predictions)
    return {"summary": summary}


# ---------------------------------------------------------------------------
# Routes – Profile CRUD
# ---------------------------------------------------------------------------


class ProfileCreate(BaseModel):
    firebase_uid: str = Field(..., min_length=1, max_length=200)
    name: str = Field(..., min_length=1, max_length=200)
    email: str = Field(..., min_length=3, max_length=320)
    diseases: str | None = Field(default=None, max_length=2000)
    height: str | None = Field(default=None, max_length=50)
    weight: str | None = Field(default=None, max_length=50)
    left_eye_power: str | None = Field(default=None, max_length=50)
    right_eye_power: str | None = Field(default=None, max_length=50)


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    email: str | None = Field(default=None, min_length=3, max_length=320)
    diseases: str | None = Field(default=None, max_length=2000)
    height: str | None = Field(default=None, max_length=50)
    weight: str | None = Field(default=None, max_length=50)
    left_eye_power: str | None = Field(default=None, max_length=50)
    right_eye_power: str | None = Field(default=None, max_length=50)


@app.post("/api/profile", status_code=201)
async def create_profile(profile: ProfileCreate):
    col = _profiles_collection()
    doc = profile.model_dump()
    doc["name"] = _sanitize(doc["name"])
    doc["email"] = _sanitize(doc["email"])
    if doc.get("diseases"):
        doc["diseases"] = _sanitize(doc["diseases"])
    col.update_one(
        {"firebase_uid": doc["firebase_uid"]},
        {"$set": doc},
        upsert=True,
    )
    saved = col.find_one({"firebase_uid": doc["firebase_uid"]})
    return _serialize_profile(saved)


@app.get("/api/profile/{firebase_uid}")
async def get_profile(firebase_uid: str):
    col = _profiles_collection()
    uid = _sanitize(firebase_uid)
    doc = col.find_one({"firebase_uid": uid})
    if not doc:
        raise HTTPException(status_code=404, detail="Profile not found")
    return _serialize_profile(doc)


@app.put("/api/profile/{firebase_uid}")
async def update_profile(firebase_uid: str, profile: ProfileUpdate):
    col = _profiles_collection()
    uid = _sanitize(firebase_uid)
    updates = {k: v for k, v in profile.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    for field in ("name", "email", "diseases"):
        if field in updates and isinstance(updates[field], str):
            updates[field] = _sanitize(updates[field])
    result = col.update_one({"firebase_uid": uid}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Profile not found")
    doc = col.find_one({"firebase_uid": uid})
    return _serialize_profile(doc)


# ---------------------------------------------------------------------------
# Routes – Diagnostic models
# ---------------------------------------------------------------------------


async def _run_diagnostic(model_key: str, file: UploadFile) -> dict:
    """Shared logic for all five diagnostic endpoints."""
    image_bytes = await _validate_upload(file)
    try:
        predictions = predict(model_key, image_bytes)
    except Exception as exc:
        logger.error("Prediction error (%s): %s", model_key, exc)
        raise HTTPException(status_code=500, detail=f"Model inference failed: {exc}")
    try:
        summary = summarize_prediction(model_key, predictions)
    except Exception as exc:
        logger.error("Summarisation error (%s): %s", model_key, exc)
        summary = "Summary unavailable. Please review the raw prediction probabilities."
    return {
        "model": model_key,
        "predictions": predictions,
        "summary": summary,
    }


@app.post("/api/diagnose/cataract")
async def diagnose_cataract(file: UploadFile = File(...)):
    return await _run_diagnostic("cataract", file)


@app.post("/api/diagnose/diabetic-retinopathy")
async def diagnose_diabetic_retinopathy(file: UploadFile = File(...)):
    return await _run_diagnostic("diabetic_retinopathy", file)


@app.post("/api/diagnose/kidney")
async def diagnose_kidney(file: UploadFile = File(...)):
    return await _run_diagnostic("kidney", file)


@app.post("/api/diagnose/skin")
async def diagnose_skin(file: UploadFile = File(...)):
    return await _run_diagnostic("skin", file)


@app.post("/api/diagnose/cardiac")
async def diagnose_cardiac(file: UploadFile = File(...)):
    return await _run_diagnostic("cardiac", file)


# ---------------------------------------------------------------------------
# Routes – Nearby Care (Overpass API proxy – no Google Maps)
# ---------------------------------------------------------------------------


class NearbyCareRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    radius: int = Field(default=3000, ge=100, le=50000)


OVERPASS_URL = "https://overpass-api.de/api/interpreter"

AMENITY_TYPE_MAP = {
    "hospital": "hospital",
    "clinic": "clinic",
    "pharmacy": "pharmacy",
}


@app.post("/api/nearby-care")
async def nearby_care(req: NearbyCareRequest):
    lat = req.lat
    lon = req.lon
    radius = req.radius

    query = (
        f"[out:json][timeout:25];"
        f"("
        f'node["amenity"="hospital"](around:{radius},{lat},{lon});'
        f'node["amenity"="clinic"](around:{radius},{lat},{lon});'
        f'node["amenity"="pharmacy"](around:{radius},{lat},{lon});'
        f");"
        f"out body;"
    )

    async with httpx.AsyncClient(timeout=20) as client:
        try:
            resp = await client.post(OVERPASS_URL, data={"data": query})
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="Overpass API timed out")
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Overpass API error")
        data = resp.json()

    results = []
    for element in data.get("elements", []):
        tags = element.get("tags", {})
        name = tags.get("name") or tags.get("name:en")
        if not name:
            continue
        amenity = tags.get("amenity", "hospital")
        results.append({
            "name": name,
            "type": AMENITY_TYPE_MAP.get(amenity, amenity),
            "lat": element.get("lat"),
            "lon": element.get("lon"),
            "address": tags.get("addr:full")
            or ", ".join(
                filter(
                    None,
                    [
                        tags.get("addr:housenumber"),
                        tags.get("addr:street"),
                        tags.get("addr:city"),
                    ],
                )
            )
            or None,
            "phone": tags.get("phone") or tags.get("contact:phone"),
            "website": tags.get("website") or tags.get("contact:website"),
            "opening_hours": tags.get("opening_hours"),
        })
    return {"results": results}
