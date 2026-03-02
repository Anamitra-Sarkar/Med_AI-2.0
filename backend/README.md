---
title: Med AI 2.0 Backend
emoji: 🏥
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# Med AI 2.0 — Backend API

This is the FastAPI backend for **Med AI 2.0**, a medical AI assistant that provides intelligent healthcare analysis and predictions.

## Stack

- **Framework**: FastAPI + Uvicorn
- **Runtime**: Python 3.10 (Docker)
- **Port**: 7860

## Endpoints

The API is auto-documented at `/docs` (Swagger UI) and `/redoc` once the Space is running.

## Environment Variables

Set the following secrets in your HuggingFace Space settings:

| Variable | Description |
|---|---|
| See `.env.example` | All required keys listed there |

## Notes

- This Space is automatically synced from the `backend/` directory of the [GitHub repository](https://github.com/Anamitra-Sarkar/Med_AI-2.0).
- Do not edit files directly in this Space — push changes to GitHub instead.
