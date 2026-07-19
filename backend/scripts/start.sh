#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

PRIVATE_DIR="${PRIVATE_2024_DIR:-data/private-2024}"
if [[ -d "$PRIVATE_DIR" ]]; then
  echo "Private 2024 overlay found at $PRIVATE_DIR"
  if [[ -f "$PRIVATE_DIR/manifest.json" ]]; then
    echo "Overlay manifest:"
    cat "$PRIVATE_DIR/manifest.json"
  fi
else
  echo "No private 2024 overlay at $PRIVATE_DIR (running SRD-only)."
fi

echo "Running database migrations..."
alembic upgrade head
echo "Migrations complete."

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
