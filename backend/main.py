"""Valeon – Medical AI backend (FastAPI)."""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any

import bleach
import httpx
from bson import ObjectId
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, StreamingResponse
from groq import Groq
from pydantic import BaseModel, Field
from pymongo import MongoClient, DESCENDING

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

_mongo_client: MongoClient | None = None
_db: Any = None

MONGODB_URI = os.getenv("MONGODB_URI")
if MONGODB_URI:
    try:
        _mongo_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
        _db = _mongo_client["valeon"]
        # Indexes for performance
        _db["chat_sessions"].create_index([("firebase_uid", 1), ("updated_at", DESCENDING)])
        _db["uploads"].create_index([("firebase_uid", 1), ("uploaded_at", DESCENDING)])
        logger.info("Connected to MongoDB Atlas.")
    except Exception as exc:
        logger.warning("MongoDB connection failed: %s", exc)
else:
    logger.warning("MONGODB_URI is not set – profile/chat/upload endpoints will return 503.")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
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
    cleaned = bleach.clean(text, tags=[], attributes={}, strip=True)
    return cleaned.strip()

def _build_system_prompt(user_profile: dict | None) -> str:
    if not user_profile:
        return BASE_SYSTEM_PROMPT
    parts = []
    if user_profile.get("name"): parts.append(f"Patient name: {_sanitize(user_profile['name'])}")
    if user_profile.get("email"): parts.append(f"Email: {_sanitize(user_profile['email'])}")
    if user_profile.get("diseases"): parts.append(f"Known conditions: {_sanitize(user_profile['diseases'])}")
    if user_profile.get("height"): parts.append(f"Height: {_sanitize(user_profile['height'])}")
    if user_profile.get("weight"): parts.append(f"Weight: {_sanitize(user_profile['weight'])}")
    if user_profile.get("left_eye_power"): parts.append(f"Left eye power: {_sanitize(user_profile['left_eye_power'])}")
    if user_profile.get("right_eye_power"): parts.append(f"Right eye power: {_sanitize(user_profile['right_eye_power'])}")
    if not parts:
        return BASE_SYSTEM_PROMPT
    profile_ctx = (
        "\n\nPatient profile:\n" + "\n".join(f"  \u2022 {p}" for p in parts)
    )
    return BASE_SYSTEM_PROMPT + profile_ctx

def _get_db():
    if _db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    return _db

def _profiles_collection():
    return _get_db()["profiles"]

def _chats_collection():
    return _get_db()["chat_sessions"]

def _uploads_collection():
    return _get_db()["uploads"]

async def _validate_upload(file: UploadFile) -> bytes:
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=415, detail=f"Unsupported file type: {file.content_type}")
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 10 MB limit")
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty file")
    return data

def _serialize(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    return doc

def _utcnow() -> datetime:
    return datetime.now(timezone.utc)

# ---------------------------------------------------------------------------
# Summarizer
# ---------------------------------------------------------------------------

def summarize_prediction(model_name: str, predictions: dict[str, float]) -> str:
    sorted_preds = sorted(predictions.items(), key=lambda x: x[1], reverse=True)
    pred_text = "\n".join(f"  - {cls}: {prob * 100:.2f}%" for cls, prob in sorted_preds)
    prompt = (
        f"You are a medical AI report generator. A patient submitted a medical image "
        f"analysed by the **{model_name}** diagnostic model.\n\n"
        f"Prediction probabilities:\n{pred_text}\n\n"
        f"Write a concise, empathetic, patient-friendly summary. Highlight the most likely "
        f"finding, explain it in simple terms, note secondary findings, and remind the patient "
        f"to consult a healthcare professional. Do NOT use markdown or thinking tags."
    )
    response = groq_client.chat.completions.create(
        model=SUMMARIZER_MODEL,
        messages=[
            {"role": "system", "content": "You are a concise medical report summariser. Output plain text only."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
        max_completion_tokens=1024,
    )
    raw = response.choices[0].message.content or ""
    return re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()

# ---------------------------------------------------------------------------
# Routes – Root & Health
# ---------------------------------------------------------------------------

@app.get("/", include_in_schema=False)
async def root():
    return RedirectResponse(url="/docs")

@app.api_route("/health", methods=["GET", "HEAD"])
async def health_check():
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
        if role not in ("user", "assistant"): continue
        messages.append({"role": role, "content": _sanitize(entry.get("content", ""))})
    messages.append({"role": "user", "content": message})
    stream = groq_client.chat.completions.create(
        model=CHAT_MODEL, messages=messages, temperature=0.7,
        max_completion_tokens=2048, stream=True,
    )
    async def _event_generator():
        try:
            for chunk in stream:
                delta = chunk.choices[0].delta
                if delta.content:
                    yield f"data: {json.dumps({'content': delta.content})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as exc:
            logger.error("Chat stream error: %s", exc)
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"
    return StreamingResponse(_event_generator(), media_type="text/event-stream")

# ---------------------------------------------------------------------------
# Routes – Image analysis
# ---------------------------------------------------------------------------

@app.post("/api/analyze-image")
async def analyze_image(file: UploadFile = File(...), prompt: str = Form(default="Describe this medical image in detail.")):
    image_bytes = await _validate_upload(file)
    prompt = _sanitize(prompt) or "Describe this medical image in detail."
    import base64
    b64 = base64.b64encode(image_bytes).decode()
    mime = file.content_type or "image/jpeg"
    response = groq_client.chat.completions.create(
        model=CHAT_MODEL,
        messages=[
            {"role": "system", "content": BASE_SYSTEM_PROMPT},
            {"role": "user", "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
            ]},
        ],
        temperature=0.4, max_completion_tokens=2048,
    )
    return {"analysis": response.choices[0].message.content}

# ---------------------------------------------------------------------------
# Routes – Summarizer
# ---------------------------------------------------------------------------

class SummarizeRequest(BaseModel):
    model_name: str
    predictions: dict[str, float]

@app.post("/api/summarize")
async def summarize(req: SummarizeRequest):
    model_name = _sanitize(req.model_name)
    if not model_name:
        raise HTTPException(status_code=400, detail="model_name is required")
    return {"summary": summarize_prediction(model_name, req.predictions)}

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
    if doc.get("diseases"): doc["diseases"] = _sanitize(doc["diseases"])
    col.update_one({"firebase_uid": doc["firebase_uid"]}, {"$set": doc}, upsert=True)
    saved = col.find_one({"firebase_uid": doc["firebase_uid"]})
    return _serialize(saved)

@app.get("/api/profile/{firebase_uid}")
async def get_profile(firebase_uid: str):
    col = _profiles_collection()
    uid = _sanitize(firebase_uid)
    doc = col.find_one({"firebase_uid": uid})
    if not doc: raise HTTPException(status_code=404, detail="Profile not found")
    return _serialize(doc)

@app.put("/api/profile/{firebase_uid}")
async def update_profile(firebase_uid: str, profile: ProfileUpdate):
    col = _profiles_collection()
    uid = _sanitize(firebase_uid)
    updates = {k: v for k, v in profile.model_dump().items() if v is not None}
    if not updates: raise HTTPException(status_code=400, detail="No fields to update")
    for field in ("name", "email", "diseases"):
        if field in updates and isinstance(updates[field], str):
            updates[field] = _sanitize(updates[field])
    result = col.update_one({"firebase_uid": uid}, {"$set": updates})
    if result.matched_count == 0: raise HTTPException(status_code=404, detail="Profile not found")
    doc = col.find_one({"firebase_uid": uid})
    return _serialize(doc)

# ---------------------------------------------------------------------------
# Routes – Chat History
# ---------------------------------------------------------------------------

class ChatMessagePayload(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=0, max_length=20000)

class CreateChatSessionRequest(BaseModel):
    firebase_uid: str = Field(..., min_length=1, max_length=200)
    title: str = Field(default="New Chat", max_length=200)

class AppendMessageRequest(BaseModel):
    firebase_uid: str = Field(..., min_length=1, max_length=200)
    message: ChatMessagePayload

@app.post("/api/chats", status_code=201)
async def create_chat_session(req: CreateChatSessionRequest):
    """Create a new empty chat session. Returns the session id."""
    col = _chats_collection()
    now = _utcnow()
    doc = {
        "firebase_uid": _sanitize(req.firebase_uid),
        "title": _sanitize(req.title),
        "messages": [],
        "created_at": now,
        "updated_at": now,
    }
    result = col.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _serialize(doc)

@app.get("/api/chats/{firebase_uid}")
async def list_chat_sessions(firebase_uid: str):
    """List all chat sessions for a user, newest first."""
    col = _chats_collection()
    uid = _sanitize(firebase_uid)
    cursor = col.find(
        {"firebase_uid": uid},
        {"messages": 0},  # exclude messages for the list view
    ).sort("updated_at", DESCENDING).limit(50)
    sessions = []
    for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        doc["created_at"] = doc["created_at"].isoformat()
        doc["updated_at"] = doc["updated_at"].isoformat()
        sessions.append(doc)
    return {"sessions": sessions}

@app.get("/api/chats/{firebase_uid}/{session_id}")
async def get_chat_session(firebase_uid: str, session_id: str):
    """Get a single chat session including all messages."""
    col = _chats_collection()
    uid = _sanitize(firebase_uid)
    try:
        oid = ObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session id")
    doc = col.find_one({"_id": oid, "firebase_uid": uid})
    if not doc: raise HTTPException(status_code=404, detail="Chat session not found")
    doc["id"] = str(doc.pop("_id"))
    doc["created_at"] = doc["created_at"].isoformat()
    doc["updated_at"] = doc["updated_at"].isoformat()
    return doc

@app.post("/api/chats/{firebase_uid}/{session_id}/messages")
async def append_message(firebase_uid: str, session_id: str, req: AppendMessageRequest):
    """Append a single message to a session and update title from first user message."""
    col = _chats_collection()
    uid = _sanitize(firebase_uid)
    if uid != _sanitize(req.firebase_uid):
        raise HTTPException(status_code=403, detail="UID mismatch")
    try:
        oid = ObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session id")
    msg = {"role": req.message.role, "content": _sanitize(req.message.content), "ts": _utcnow().isoformat()}
    now = _utcnow()
    # Auto-title from first user message (truncate to 60 chars)
    update: dict[str, Any] = {
        "$push": {"messages": msg},
        "$set": {"updated_at": now},
    }
    # Only update title if it's still "New Chat" and this is a user message
    session = col.find_one({"_id": oid, "firebase_uid": uid}, {"title": 1})
    if session and session.get("title") == "New Chat" and req.message.role == "user":
        raw_title = req.message.content[:60].strip()
        update["$set"]["title"] = raw_title if raw_title else "New Chat"
    result = col.update_one({"_id": oid, "firebase_uid": uid}, update)
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return {"ok": True}

@app.delete("/api/chats/{firebase_uid}/{session_id}", status_code=204)
async def delete_chat_session(firebase_uid: str, session_id: str):
    """Delete a chat session."""
    col = _chats_collection()
    uid = _sanitize(firebase_uid)
    try:
        oid = ObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session id")
    result = col.delete_one({"_id": oid, "firebase_uid": uid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Chat session not found")

# ---------------------------------------------------------------------------
# Routes – File Upload Records
# ---------------------------------------------------------------------------

class RecordUploadRequest(BaseModel):
    firebase_uid: str = Field(..., min_length=1, max_length=200)
    filename: str = Field(..., min_length=1, max_length=500)
    file_type: str = Field(..., min_length=1, max_length=100)  # e.g. "image/jpeg"
    model_type: str = Field(..., min_length=1, max_length=100) # e.g. "cataract"
    model_label: str = Field(..., min_length=1, max_length=200) # human-readable label
    predictions: dict[str, float] | None = Field(default=None)
    summary: str | None = Field(default=None, max_length=5000)

@app.post("/api/uploads", status_code=201)
async def record_upload(req: RecordUploadRequest):
    """Record metadata of a diagnostic file upload."""
    col = _uploads_collection()
    doc = {
        "firebase_uid": _sanitize(req.firebase_uid),
        "filename": _sanitize(req.filename),
        "file_type": _sanitize(req.file_type),
        "model_type": _sanitize(req.model_type),
        "model_label": _sanitize(req.model_label),
        "predictions": req.predictions,
        "summary": _sanitize(req.summary) if req.summary else None,
        "uploaded_at": _utcnow(),
    }
    result = col.insert_one(doc)
    doc["_id"] = result.inserted_id
    saved = _serialize(doc)
    saved["uploaded_at"] = doc["uploaded_at"].isoformat()
    return saved

@app.get("/api/uploads/{firebase_uid}")
async def list_uploads(firebase_uid: str):
    """List all recorded file uploads for a user, newest first."""
    col = _uploads_collection()
    uid = _sanitize(firebase_uid)
    cursor = col.find({"firebase_uid": uid}).sort("uploaded_at", DESCENDING).limit(100)
    uploads = []
    for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        doc["uploaded_at"] = doc["uploaded_at"].isoformat()
        uploads.append(doc)
    return {"uploads": uploads}

@app.delete("/api/uploads/{firebase_uid}/{upload_id}", status_code=204)
async def delete_upload(firebase_uid: str, upload_id: str):
    """Delete an upload record."""
    col = _uploads_collection()
    uid = _sanitize(firebase_uid)
    try:
        oid = ObjectId(upload_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid upload id")
    result = col.delete_one({"_id": oid, "firebase_uid": uid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Upload record not found")

# ---------------------------------------------------------------------------
# Routes – Diagnostic models
# ---------------------------------------------------------------------------

async def _run_diagnostic(model_key: str, file: UploadFile) -> dict:
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
    return {"model": model_key, "predictions": predictions, "summary": summary}

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
# Routes – Nearby Care
# ---------------------------------------------------------------------------

class NearbyCareRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    radius: int = Field(default=3000, ge=100, le=50000)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
AMENITY_TYPE_MAP = {"hospital": "hospital", "clinic": "clinic", "pharmacy": "pharmacy"}

@app.post("/api/nearby-care")
async def nearby_care(req: NearbyCareRequest):
    lat, lon, radius = req.lat, req.lon, req.radius
    query = (
        f"[out:json][timeout:25];("
        f'node["amenity"="hospital"](around:{radius},{lat},{lon});'
        f'node["amenity"="clinic"](around:{radius},{lat},{lon});'
        f'node["amenity"="pharmacy"](around:{radius},{lat},{lon}););"
        f"out body;"
    )
    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=5.0, read=28.0, write=5.0, pool=5.0)) as client:
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
        if not name: continue
        amenity = tags.get("amenity", "hospital")
        results.append({
            "name": name,
            "type": AMENITY_TYPE_MAP.get(amenity, amenity),
            "lat": element.get("lat"),
            "lon": element.get("lon"),
            "address": tags.get("addr:full") or ", ".join(filter(None, [
                tags.get("addr:housenumber"), tags.get("addr:street"), tags.get("addr:city"),
            ])) or None,
            "phone": tags.get("phone") or tags.get("contact:phone"),
            "website": tags.get("website") or tags.get("contact:website"),
            "opening_hours": tags.get("opening_hours"),
        })
    return {"results": results}
