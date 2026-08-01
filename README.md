# Quest Terminal

A Dungeons & Dragons **5.5e / 2024** companion app for campaigns, live sessions, digital character sheets, encounters, and rules lookup.

Quest Terminal helps DMs and players run games online: import D&D Beyond PDFs, track combat and initiative, browse 5.5e rules content, and chat with a rules-aware assistant.

---

## Features

- **Campaigns & sessions** — party roster, live play UI, notes, and session logs
- **Digital character sheets** — PDF import/resync, editable 5.5e sheet, click-to-roll skills/saves, long rest, resources
- **Combat & initiative** — encounters, turn actions, HP/AC/conditions, death saves, shared combat log
- **Rules browser** — SRD + optional 2024 overlay; typeahead search across spells, monsters, items, and more
- **AI assistant** — Gemini-backed chat grounded in catalog rules content
- **Access control** — closed registration with admin-approved access requests (optional open signup for local dev)

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, Vite, Tailwind CSS 4, React Router |
| Backend | FastAPI, SQLModel / SQLAlchemy, Alembic |
| Database | SQLite (local) or PostgreSQL (production) |
| AI | Google Gemini |
| Deploy | Vercel (frontend) · Render (API + Postgres) |

---

## Repository layout

```
dnd-ai-app/
├── frontend/          # Vite React app (Quest Terminal UI)
├── backend/           # FastAPI API, services, Alembic migrations
│   ├── app/
│   ├── data/          # SRD catalogs (private 2024 overlay is gitignored)
│   ├── scripts/       # start.sh, maintenance helpers
│   └── DEPLOY.md      # Env vars & Render disk / overlay notes
├── render.yaml        # Render service blueprint
└── BACKLOG.md         # Product backlog
```

---

## Prerequisites

- **Node.js** 20+ (for the frontend)
- **Python** 3.12+ (for the backend)
- A **Gemini API key**
- (Optional) Private 2024 overlay JSON under `backend/data/private-2024/` — not in Git

---

## Local development

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # fill in GEMINI_API_KEY and SECRET_KEY
```

Edit `backend/.env` at minimum:

```env
GEMINI_API_KEY=your-gemini-api-key
SECRET_KEY=generate-a-long-random-string
DATABASE_URL=sqlite:///./app.db
CORS_ORIGINS=["http://localhost:5173"]
REGISTRATION_OPEN=true             # convenient for local signup
```

Run migrations and start the API:

```bash
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Or use the production-style starter (migrations + uvicorn):

```bash
bash scripts/start.sh
```

API base: `http://localhost:8000` · docs: `http://localhost:8000/docs`

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env               # leave VITE_API_URL empty for local proxy
npm run dev
```

App: `http://localhost:5173`  
Vite proxies `/api` to `http://localhost:8000`.

---

## Environment variables

### Backend (`backend/.env`)

| Variable | Required | Purpose |
|----------|----------|---------|
| `GEMINI_API_KEY` | yes | Gemini API access |
| `SECRET_KEY` | yes | JWT / auth signing |
| `DATABASE_URL` | yes | SQLite or Postgres URL |
| `CORS_ORIGINS` | recommended | Allowed frontend origins (JSON array) |
| `REGISTRATION_OPEN` | no | `true` for open signup; default closed |
| `BOOTSTRAP_ADMIN_USERNAME` | no | Grant admin / bootstrap first user |
| `BOOTSTRAP_ADMIN_PASSWORD` | no | Only when DB has zero users |
| `PRIVATE_2024_DIR` | no | Path to private PHB/MM/DMG overlay JSON |

Full production notes (Render disk, Postgres, overlay packing): see [`backend/DEPLOY.md`](backend/DEPLOY.md).

### Frontend (`frontend/.env`)

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | Leave empty locally (proxy). Set to your Render API URL in production builds. |

Never commit `.env` files or `backend/data/private-2024/`.

---

## Scripts

**Frontend**

```bash
npm run dev       # Vite dev server
npm run build     # production build
npm run preview   # preview production build
npm run lint      # ESLint
```

**Backend**

```bash
alembic upgrade head
uvicorn app.main:app --reload --port 8000
bash scripts/start.sh
```

---

## Deployment

- **Frontend** → [Vercel](https://vercel.com) (`frontend/`, SPA rewrites in `vercel.json`)
- **Backend** → [Render](https://render.com) (see `render.yaml`: web service + Postgres + optional disk for private overlay)

Set `VITE_API_URL` on Vercel to the Render API origin, and include the Vercel URL in backend `CORS_ORIGINS`.

---

## Rules content & licensing

- Built-in catalogs use **SRD** material suitable for redistribution.
- Optional **2024 private overlays** (PHB / MM / DMG extracts as JSON) stay on disk / outside Git. Do not publish copyrighted PDFs or private extracts.

This project targets **D&D 5.5e (2024 rules)** conventions (e.g. D&D Beyond–style sheets and combat math), not legacy 5e-only assumptions.

---

## Contributing / status

Personal / campaign tooling project. Track planned work in [`BACKLOG.md`](BACKLOG.md).
