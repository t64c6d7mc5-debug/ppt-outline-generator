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

echo "[OK] Node.js $(node --version)"
echo "[OK] npm $(npm --version)"

if [[ ! -f .env ]]; then
  echo "[WARN] .env is absent. The app can still start in deterministic fallback mode."
  exit 0
fi

set +e
node --env-file=.env --input-type=module --eval '
const enabled = String(process.env.LOCAL_MODEL_ENABLED || "false").toLowerCase() === "true";
const base = String(process.env.LOCAL_MODEL_BASE_URL || "").trim();
const model = String(process.env.LOCAL_MODEL_ID || "").trim();
if (!enabled) {
  console.log("[INFO] Local-model attempts are disabled; fallback remains available.");
  process.exit(0);
}
if (!base || !model) {
  console.log("[WARN] Local-model endpoint or model ID is not configured; fallback remains available.");
  process.exit(0);
}
const root = base.replace(/\/+$/, "");
const probes = [...new Set([`${root}/models`, root])];
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 5000);
try {
  let reachable = false;
  for (const url of probes) {
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (response.ok || response.status === 401 || response.status === 403) {
        reachable = true;
        break;
      }
    } catch {}
  }
  console.log(reachable
    ? "[OK] Configured OpenAI-compatible endpoint is reachable."
    : "[WARN] Configured model endpoint is unavailable; fallback remains available.");
} finally {
  clearTimeout(timer);
}
'
status=$?
set -e

if [[ "$status" -ne 0 ]]; then
  echo "[WARN] Endpoint probe could not complete; fallback remains available."
fi
