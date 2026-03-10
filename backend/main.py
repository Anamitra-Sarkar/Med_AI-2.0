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
import numpy as np
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
MAX_DATA_URL_BYTES = 11 * 1024 * 1024
BASE_SYSTEM_PROMPT = (
    "You are Valeon, a helpful medical AI assistant. "
    "Provide accurate, empathetic, and evidence-based health information. "
    "Always remind users to consult a qualified healthcare professional for diagnosis and treatment."
)

# ---------------------------------------------------------------------------
# DR Grade metadata — used by the grade-aware summarizer
# ---------------------------------------------------------------------------
DR_GRADE_META = [
    {
        "grade": 0,
        "label": "No Diabetic Retinopathy (Grade 0)",
        "severity": "none",
        "clinical": "No signs of diabetic retinopathy detected. Blood vessels appear healthy.",
    },
    {
        "grade": 1,
        "label": "Mild Non-Proliferative DR (Grade 1)",
        "severity": "mild",
        "clinical": "Microaneurysms present — small balloon-like swellings in tiny blood vessels.",
    },
    {
        "grade": 2,
        "label": "Moderate Non-Proliferative DR (Grade 2)",
        "severity": "moderate",
        "clinical": "More extensive microaneurysms, haemorrhages, hard exudates and/or cotton-wool spots.",
    },
    {
        "grade": 3,
        "label": "Severe Non-Proliferative DR (Grade 3)",
        "severity": "severe",
        "clinical": "Widespread haemorrhages, venous beading and/or intraretinal microvascular abnormalities.",
    },
    {
        "grade": 4,
        "label": "Proliferative DR (Grade 4)",
        "severity": "critical",
        "clinical": "New abnormal blood vessels growing on the retina or optic disc — high risk of vision loss.",
    },
]

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
# Summarizers
# ---------------------------------------------------------------------------

def summarize_prediction(model_name: str, predictions: dict[str, float]) -> str:
    """Generic summarizer for all models except diabetic retinopathy."""
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


def summarize_dr_prediction(predictions: dict[str, float]) -> str:
    """Grade-aware summarizer specifically for Diabetic Retinopathy.

    Pre-extracts all dict values into plain variables so the prompt
    f-string contains zero backslash escapes — required for Python 3.10
    compatibility (PEP 701 backslash-in-fstring only lands in 3.12).
    """
    grade_keys = [
        "Grade 0 - No DR",
        "Grade 1 - Mild DR",
        "Grade 2 - Moderate DR",
        "Grade 3 - Severe DR",
        "Grade 4 - Proliferative DR",
    ]
    probs = [predictions.get(k, 0.0) for k in grade_keys]
    predicted_grade = int(np.argmax(probs))
    meta = DR_GRADE_META[predicted_grade]

    # Pre-extract to plain variables — no dict subscript inside f-string
    grade_label = meta["label"]
    grade_severity = meta["severity"]
    grade_clinical = meta["clinical"]

    sorted_preds = sorted(zip(grade_keys, probs), key=lambda x: x[1], reverse=True)
    prob_lines = "\n".join(
        f"  - {label}: {prob * 100:.2f}%" for label, prob in sorted_preds
    )

    prompt = (
        "A patient's retinal fundus image was analysed by the RetinaGuard DR Grading model "
        "(trained on the IDRiD dataset, 5-class grading system: Grade 0-4).\n\n"
        f"Predicted grade: {grade_label}\n"
        f"Severity: {grade_severity}\n"
        f"Clinical finding: {grade_clinical}\n\n"
        f"Full probability breakdown:\n{prob_lines}\n\n"
        "Write a clear, empathetic, patient-friendly summary that:\n"
        "1. States the detected DR grade and what it means in simple language.\n"
        "2. Explains the specific findings associated with this grade (e.g. microaneurysms, "
        "haemorrhages, exudates, new vessel growth) based on the severity level.\n"
        "3. Gives appropriate urgency: Grade 0 = reassuring but maintain check-ups; "
        "Grade 1-2 = monitor closely; Grade 3-4 = seek ophthalmologist urgently.\n"
        "4. Reminds the patient this is AI-assisted and a healthcare professional must confirm.\n"
        "Do NOT use markdown, bullet points, or thinking tags. Plain text only."
    )

    response = groq_client.chat.completions.create(
        model=SUMMARIZER_MODEL,
        messages=[
            {"role": "system", "content": "You are a concise medical report summariser for diabetic retinopathy grading. Output plain text only."},
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

@app.get("/health", operation_id="health_check_get")
async def health_check_get():
    return {"status": "ok", "service": "valeon-api"}

@app.head("/health", operation_id="health_check_head", include_in_schema=False)
async def health_check_head():
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
    theme: str | None = Field(default=None, pattern="^(light|dark)$")

class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    email: str | None = Field(default=None, min_length=3, max_length=320)
    diseases: str | None = Field(default=None, max_length=2000)
    height: str | None = Field(default=None, max_length=50)
    weight: str | None = Field(default=None, max_length=50)
    left_eye_power: str | None = Field(default=None, max_length=50)
    right_eye_power: str | None = Field(default=None, max_length=50)
    theme: str | None = Field(default=None, pattern="^(light|dark)$")

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
    col = _chats_collection()
    uid = _sanitize(firebase_uid)
    cursor = col.find(
        {"firebase_uid": uid},
        {"messages": 0},
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
    update: dict[str, Any] = {
        "$push": {"messages": msg},
        "$set": {"updated_at": now},
    }
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
    file_type: str = Field(..., min_length=1, max_length=100)
    model_type: str = Field(..., min_length=1, max_length=100)
    model_label: str = Field(..., min_length=1, max_length=200)
    predictions: dict[str, float] | None = Field(default=None)
    summary: str | None = Field(default=None, max_length=5000)
    data_url: str | None = Field(default=None)

@app.post("/api/uploads", status_code=201)
async def record_upload(req: RecordUploadRequest):
    col = _uploads_collection()
    data_url = req.data_url
    if data_url is not None:
        if len(data_url.encode("utf-8")) > MAX_DATA_URL_BYTES:
            raise HTTPException(status_code=413, detail="Image data URL exceeds the 11 MB storage limit.")
        if not data_url.startswith("data:image/"):
            raise HTTPException(status_code=400, detail="data_url must be a valid image data URL.")
    doc = {
        "firebase_uid": _sanitize(req.firebase_uid),
        "filename": _sanitize(req.filename),
        "file_type": _sanitize(req.file_type),
        "model_type": _sanitize(req.model_type),
        "model_label": _sanitize(req.model_label),
        "predictions": req.predictions,
        "summary": _sanitize(req.summary) if req.summary else None,
        "data_url": data_url,
        "uploaded_at": _utcnow(),
    }
    result = col.insert_one(doc)
    doc["_id"] = result.inserted_id
    saved = _serialize(doc)
    saved["uploaded_at"] = doc["uploaded_at"].isoformat()
    return saved

@app.get("/api/uploads/{firebase_uid}")
async def list_uploads(firebase_uid: str):
    col = _uploads_collection()
    uid = _sanitize(firebase_uid)
    cursor = col.find({"firebase_uid": uid}).sort("uploaded_at", DESCENDING).limit(100)
    uploads = []
    for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        doc["uploaded_at"] = doc["uploaded_at"].isoformat()
        doc.setdefault("data_url", None)
        uploads.append(doc)
    return {"uploads": uploads}

@app.delete("/api/uploads/{firebase_uid}/{upload_id}", status_code=204)
async def delete_upload(firebase_uid: str, upload_id: str):
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
        if model_key == "diabetic_retinopathy":
            summary = summarize_dr_prediction(predictions)
        else:
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

_OVERPASS_QUERY_TEMPLATE = (
    '[out:json][timeout:25];('
    'node["amenity"="hospital"](around:{radius},{lat},{lon});'
    'node["amenity"="clinic"](around:{radius},{lat},{lon});'
    'node["amenity"="pharmacy"](around:{radius},{lat},{lon});'
    ');out body;'
)

@app.post("/api/nearby-care")
async def nearby_care(req: NearbyCareRequest):
    lat, lon, radius = req.lat, req.lon, req.radius
    query = _OVERPASS_QUERY_TEMPLATE.format(radius=radius, lat=lat, lon=lon)
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
        if not name:
            continue
        amenity = tags.get("amenity", "hospital")
        results.append({
            "name": name,
            "type": AMENITY_TYPE_MAP.get(amenity, amenity),
            "lat": element.get("lat"),
            "lon": element.get("lon"),
            "address": tags.get("addr:full") or ", ".join(filter(None, [
                tags.get("addr:housenumber"),
                tags.get("addr:street"),
                tags.get("addr:city"),
            ])) or None,
            "phone": tags.get("phone") or tags.get("contact:phone"),
            "website": tags.get("website") or tags.get("contact:website"),
            "opening_hours": tags.get("opening_hours"),
        })
    return {"results": results}
