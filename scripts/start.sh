#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "[FAIL] Node.js 22 or newer is required." >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "[FAIL] npm is required." >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [[ "$NODE_MAJOR" -lt 22 ]]; then
  echo "[FAIL] Node.js 22 or newer is required; found $(node --version)." >&2
  exit 1
fi

if [[ -f .env ]]; then
  exec node --env-file=.env server.js
fi

echo "[WARN] .env is absent. Starting in deterministic fallback mode."
exec env LOCAL_MODEL_ENABLED=false node server.js
