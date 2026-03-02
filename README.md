# Valeon — Your Premium AI Health Companion

A production-ready Progressive Web App for AI-powered health assistance and medical diagnostics.

## Architecture

| Layer | Technology | Deployment |
|-------|-----------|------------|
| Frontend | Next.js (App Router) + TailwindCSS + Framer Motion | Vercel |
| Backend | FastAPI (Python) | HuggingFace Spaces (Docker) |
| Database | MongoDB Atlas | Cloud |
| Auth | Firebase Authentication | Cloud |
| AI | Groq API (Llama 4 Maverick + Qwen3-32B) | Cloud |

## Features

- **AI Health Chat** — Streaming chat powered by Llama 4 Maverick with vision support
- **ClearView Cataract Screening** — CNN-based cataract detection
- **RetinaGuard DR Grading** — Diabetic retinopathy severity grading
- **NephroScan CT Analysis** — Kidney CT classification (EfficientNet)
- **DermaVision Skin Analysis** — Multi-class skin disease detection
- **CardioInsight MRI Classifier** — Cardiac MRI analysis
- **Nearby Care Locator** — Google Maps integration for nearby healthcare
- **Light/Dark Mode** — Persisted theme preference
- **PWA** — Installable, offline-capable Progressive Web App

## Getting Started

### Frontend

```bash
cd frontend
cp .env.example .env.local
# Fill in environment variables
npm install
npm run dev
```

### Backend

```bash
cd backend
cp .env.example .env
# Fill in environment variables
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 7860
```

### Docker (Backend)

```bash
cd backend
docker build -t valeon-backend .
docker run -p 7860:7860 --env-file .env valeon-backend
```

## Environment Variables

### Frontend (.env.local)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend API URL |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase app ID |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps API key |

### Backend (.env)

| Variable | Description |
|----------|-------------|
| `GROQ_API_KEY` | Groq API key |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `GOOGLE_MAPS_API_KEY` | Google Maps API key |

## Deployment

### Frontend → Vercel
1. Connect the repo to Vercel
2. Set root directory to `frontend`
3. Add environment variables
4. Deploy

### Backend → HuggingFace Spaces
The GitHub Actions workflow automatically syncs the `backend/` folder to HuggingFace Spaces on push to `main`.

Required GitHub Secrets:
- `HF_TOKEN` — HuggingFace access token
- `HF_SPACE_NAME` — HuggingFace space name (e.g., `username/valeon-backend`)

## License

See [LICENSE](LICENSE) for details.
