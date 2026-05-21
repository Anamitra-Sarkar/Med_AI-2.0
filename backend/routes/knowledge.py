from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field

from knowledge_base.loader import append_entry
from knowledge_base.retriever import rebuild, retrieve

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])

class KnowledgeCreateRequest(BaseModel):
  title: str = Field(..., min_length=1, max_length=200)
  topic: str = Field(..., min_length=1, max_length=100)
  content: str = Field(..., min_length=1, max_length=6000)
  source: str = Field(..., min_length=1, max_length=200)
  tags: list[str] = Field(default_factory=list)

def _require_admin_key(x_admin_key: str | None) -> None:
  admin_key = os.getenv("ADMIN_KEY")
  if not admin_key or x_admin_key != admin_key:
    raise HTTPException(status_code=401, detail="Unauthorized")

@router.post("/add")
async def add_knowledge_item(payload: KnowledgeCreateRequest, x_admin_key: str | None = Header(default=None, alias="X-Admin-Key")):
  _require_admin_key(x_admin_key)
  entry = append_entry(payload.model_dump())
  rebuild()
  return {"status": "ok", "entry": entry}

@router.get("/search")
async def search_knowledge(q: str = Query(..., min_length=1, max_length=500), top_k: int = Query(default=5, ge=1, le=10)):
  results = retrieve(q, top_k=top_k)
  return {"query": q, "results": results}
