
from __future__ import annotations

from threading import Lock
from typing import Any

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from .loader import load_entries

MIN_SIMILARITY = 0.1
_LOCK = Lock()
_vectorizer: TfidfVectorizer | None = None
_matrix = None
_entries: list[dict[str, Any]] = []


def _entry_text(entry: dict[str, Any]) -> str:
    tags = " ".join(entry.get("tags", []))
    return " ".join(
        [
            str(entry.get("topic", "")),
            str(entry.get("title", "")),
            tags,
            str(entry.get("source", "")),
            str(entry.get("content", "")),
        ]
    ).strip()


def fit() -> None:
    global _vectorizer, _matrix, _entries
    with _LOCK:
        _entries = load_entries()
        corpus = [_entry_text(entry) for entry in _entries]
        _vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2))
        _matrix = _vectorizer.fit_transform(corpus) if corpus else None


def rebuild() -> None:
    fit()


def retrieve(query: str, top_k: int = 3) -> list[dict[str, Any]]:
    if not query or not query.strip():
        return []
    with _LOCK:
        if _vectorizer is None or _matrix is None or not _entries:
            return []
        query_vec = _vectorizer.transform([query])
        scores = cosine_similarity(query_vec, _matrix).flatten()
        ranked = scores.argsort()[::-1][:top_k]
        results: list[dict[str, Any]] = []
        for idx in ranked:
            score = float(scores[idx])
            if score < MIN_SIMILARITY:
                continue
            entry = dict(_entries[idx])
            entry["similarity"] = round(score, 4)
            results.append(entry)
        return results


fit()
