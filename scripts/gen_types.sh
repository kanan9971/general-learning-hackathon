#!/usr/bin/env bash
# Regenerate OpenAPI TypeScript types for the mobile app.
# Usage: from repo root → scripts/gen_types.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/apps/mobile/src/api/schema.d.ts"
cd "$ROOT/backend"
if [[ -x .venv/bin/python ]]; then
  PY=.venv/bin/python
else
  PY=python3
fi
"$PY" - <<'PY' > /tmp/deskready-openapi.json
from app.main import create_app
import json
print(json.dumps(create_app().openapi()))
PY
if command -v npx >/dev/null 2>&1; then
  npx --yes openapi-typescript /tmp/deskready-openapi.json -o "$OUT"
  echo "Wrote $OUT"
else
  echo "npx not found; wrote OpenAPI to /tmp/deskready-openapi.json only" >&2
  exit 1
fi
