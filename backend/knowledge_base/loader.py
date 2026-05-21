
from __future__ import annotations

import json
from pathlib import Path
from threading import Lock
from typing import Any

BASE_DIR = Path(__file__).resolve().parent
SEED_FILE = BASE_DIR / "seed_data.json"
_LOCK = Lock()


def _ensure_seed_file() -> None:
    if not SEED_FILE.exists():
        SEED_FILE.write_text("[]
", encoding="utf-8")


def load_entries() -> list[dict[str, Any]]:
    _ensure_seed_file()
    with SEED_FILE.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, list):
        raise ValueError("Knowledge base seed_data.json must contain a list")
    return [entry for entry in data if isinstance(entry, dict)]


def _save_entries(entries: list[dict[str, Any]]) -> None:
    tmp = SEED_FILE.with_suffix(".json.tmp")
    with tmp.open("w", encoding="utf-8") as handle:
        json.dump(entries, handle, indent=2, ensure_ascii=False)
        handle.write("
")
    tmp.replace(SEED_FILE)


def next_entry_id(entries: list[dict[str, Any]]) -> str:
    max_num = 0
    for entry in entries:
        entry_id = str(entry.get("id", ""))
        if entry_id.startswith("kb_"):
            suffix = entry_id[3:]
            if suffix.isdigit():
                max_num = max(max_num, int(suffix))
    return f"kb_{max_num + 1:03d}"


def normalize_entry(entry: dict[str, Any]) -> dict[str, Any]:
    required = ["topic", "title", "content", "source", "tags"]
    missing = [key for key in required if not entry.get(key)]
    if missing:
        raise ValueError(f"Missing required knowledge base fields: {', '.join(missing)}")
    tags = entry.get("tags")
    if not isinstance(tags, list):
        raise ValueError("tags must be a list of strings")
    return {
        "id": str(entry.get("id") or "").strip(),
        "topic": str(entry["topic"]).strip(),
        "title": str(entry["title"]).strip(),
        "content": str(entry["content"]).strip(),
        "source": str(entry["source"]).strip(),
        "tags": [str(tag).strip() for tag in tags if str(tag).strip()],
    }


def append_entry(entry: dict[str, Any]) -> dict[str, Any]:
    with _LOCK:
        entries = load_entries()
        normalized = normalize_entry(entry)
        if not normalized["id"]:
            normalized["id"] = next_entry_id(entries)
        entries.append(normalized)
        _save_entries(entries)
        return normalized


def update_entries(entries: list[dict[str, Any]]) -> None:
    with _LOCK:
        _save_entries(entries)
