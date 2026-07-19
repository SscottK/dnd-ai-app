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
PRIVATE_2024_DIR=/var/data/private-2024
```

`PRIVATE_2024_DIR` points at the private PHB/MM/DMG overlay JSON. Locally you can omit it (defaults to `backend/data/private-2024`). On Render, set it to the path on your persistent disk.

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
| Plan | **Starter** (~$7/mo — no free-tier spin-down) |
| Root directory | `backend` |
| Build command | `pip install -r requirements.txt` |
| Start command | `bash scripts/start.sh` |
| Disk mount path | `/var/data` |
| Disk size | `1` GB is enough |
| Env `PRIVATE_2024_DIR` | `/var/data/private-2024` |

Link the Postgres database to the web service so `DATABASE_URL` is injected (or paste the Internal URL manually).

### Persistent disk + private 2024 overlay

Book extracts stay **out of Git**. Put only the JSON overlay on the disk (not the PDFs).

**1. Upgrade the web service** to Starter (or higher) and add a disk:

- Dashboard → your service → **Disks** → mount path `/var/data`, size **1 GB**  
  or apply `render.yaml` (already includes `plan: starter` + disk + `PRIVATE_2024_DIR`).

**2. On your WSL machine**, pack the overlay:

```bash
cd /home/scott/dnd-ai-app/backend/data
tar -czf /tmp/private-2024.tar.gz private-2024
```

**3. Host that tarball somewhere temporary** you can `curl` (private S3/R2, transfer.sh, etc.). Do not commit it.

**4. Open Render Shell** on the web service and unpack onto the disk:

```bash
mkdir -p /var/data
curl -L "YOUR_TARBALL_URL" | tar -xz -C /var/data
ls /var/data/private-2024
# expect: backgrounds.json feats.json magic_items.json manifest.json monsters.json species.json spells.json
```

**5. Restart** the service (or wait for the next deploy). Startup logs should show:

`Private 2024 overlay found at /var/data/private-2024`

Redeploys keep `/var/data/**`. Re-upload only when you regenerate the overlay.

Optional: character PDFs/portraits auto-store under `/var/data/uploads` when the disk is mounted (see uploads note below).

## Frontend (Vercel)

```env
VITE_API_URL=https://your-render-service.onrender.com
```

## Note on file uploads

Character PDFs and portraits are stored under **`/var/data/uploads`** when a Render disk is mounted at `/var/data` (same disk as the private-2024 overlay). Locally they use `backend/uploads/`.

Override with env `UPLOADS_DIR` if needed. Without a persistent disk, uploads are wiped on every redeploy — the digital sheet remains in Postgres, but **Open PDF / PDF tab** will 404 until you Replace PDF.
