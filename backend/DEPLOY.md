# Backend environment variables

Copy to `backend/.env` for local development.

## Required

```env
GEMINI_API_KEY=your-gemini-api-key
SECRET_KEY=generate-a-long-random-string-at-least-32-chars
```

## Database

**Local (default):**

```env
DATABASE_URL=sqlite:///./app.db
```

**Production (Render PostgreSQL):**

After creating a Postgres instance on Render, set `DATABASE_URL` on the web service. Render provides a value like:

```env
DATABASE_URL=postgresql://dnd_ai_user:password@dpg-xxxxx-a/dnd_ai
```

The app normalizes `postgres://` URLs automatically. On startup it runs `alembic upgrade head` before serving requests.

Use the **Internal Database URL** when the API and Postgres are both on Render (lower latency, no public egress).

## Optional

```env
SQL_ECHO=false
GEMINI_MODEL=gemini-3.5-flash
GEMINI_MODEL_FALLBACK=gemini-2.5-flash-lite
CORS_ORIGINS=["http://localhost:5173","https://dnd-ai-app.vercel.app"]
```

## First account bootstrap

When the database has no users, these create one account on startup:

```env
BOOTSTRAP_ADMIN_USERNAME=dm
BOOTSTRAP_ADMIN_PASSWORD=choose-a-strong-password
```

Remove or leave blank after the first successful deploy.

## Render web service settings

| Setting | Value |
|---------|--------|
| Root directory | `backend` |
| Build command | `pip install -r requirements.txt` |
| Start command | `bash scripts/start.sh` |

Link the Postgres database to the web service so `DATABASE_URL` is injected (or paste the Internal URL manually).

## Frontend (Vercel)

```env
VITE_API_URL=https://your-render-service.onrender.com
```

## Note on file uploads

Character PDFs and portraits are stored on the server filesystem under `backend/uploads/`. Render’s filesystem is **ephemeral** — uploads are lost on redeploy unless you add a persistent disk or object storage (S3/R2). PostgreSQL fixes **accounts and game data**; uploads are a separate follow-up.
