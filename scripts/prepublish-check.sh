#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

failures=0
candidate_list="$(mktemp)"
trap 'rm -f "$candidate_list"' EXIT
users_root="/""Users"
private_app_support="/""Library/Application Support/PPT脚本生成器"
private_desktop_launcher="/""Desktop/启动PPT脚本生成器"
personal_path_pattern="${users_root}/(ai作品集|qiuxingbo)/|${private_app_support}|${private_desktop_launcher}"

report_failure() {
  echo "[FAIL] $1" >&2
  failures=1
}

bash scripts/publish-candidate-files.sh > "$candidate_list"
candidate_count="$(tr -cd '\0' < "$candidate_list" | wc -c | tr -d ' ')"
if [[ "$candidate_count" == "0" ]]; then
  report_failure "no publishable files found"
fi

if [[ -d .git ]] && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if git ls-files --error-unmatch .env >/dev/null 2>&1; then
    report_failure ".env is tracked"
  fi
fi

while IFS= read -r -d '' file; do
  case "$file" in
    *"/node_modules/"*|*"/.vercel/"*|*.log|*.pid|*.sqlite|*.sqlite3|*.db|*.gguf|*.safetensors|*.mlx|*.save|*.backup.js|*.tmp|*.temp)
      report_failure "private or generated artifact in candidate list: $file" ;;
    */真实回归/*|*/验收证据/*|*/打开方式/*|*/版本快照/*|*/docs/superpowers/*|*/.superpowers/*)
      report_failure "private evidence or local artifact in candidate list: $file" ;;
    ./.env|./.env.local|./.env.development|./.env.production)
      report_failure "environment file in candidate list: $file" ;;
  esac

  if rg -n --no-messages "$personal_path_pattern" "$file"; then
    report_failure "personal absolute path found: $file"
  fi
  if rg -n --no-messages '(sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{20,}|Bearer[[:space:]][A-Za-z0-9._-]{20,})' "$file"; then
    report_failure "likely secret found: $file"
  fi
  if rg -n --no-messages 'req[_-][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' "$file"; then
    report_failure "real request identifier found: $file"
  fi
done < "$candidate_list"

required_env_lines=(
  'PORT=3100'
  'LOCAL_MODEL_ENABLED=false'
  'LOCAL_MODEL_PROVIDER=openai-compatible'
  'LOCAL_MODEL_BASE_URL=http://127.0.0.1:8080/api'
  'LOCAL_MODEL_API_KEY='
  'LOCAL_MODEL_ID='
  'LOCAL_MODEL_TIMEOUT_MS=120000'
  'LOCAL_MODEL_SUPPORTS_JSON_SCHEMA=true'
  'LOCAL_MODEL_MAX_REPAIR_ATTEMPTS=1'
)
for line in "${required_env_lines[@]}"; do
  if ! grep -Fqx "$line" .env.example; then
    report_failure ".env.example is missing required generic setting: ${line%%=*}"
  fi
done

for script in scripts/start.sh scripts/start-macos.command scripts/check-environment.sh scripts/check-docs.sh scripts/prepublish-check.sh scripts/generate-release-manifest.sh; do
  if [[ ! -x "$script" ]]; then
    report_failure "required publish script is not executable: $script"
  fi
done

for doc in README.md README_EN.md KNOWN_LIMITATIONS.md CONTRIBUTING.md SECURITY.md CHANGELOG.md RELEASE-v2.3.15-rc2.md RELEASE-v2.3.15-rc3.md docs/ARCHITECTURE.md docs/QUICK_START.md docs/LOCAL_MODEL_SETUP.md docs/RESULT_STATUS.md; do
  if [[ ! -f "$doc" ]]; then
    report_failure "required release document is missing: $doc"
  fi
done

if rg -n --no-messages 'v2\.3\.(12|14|15-rc1)' README.md README_EN.md KNOWN_LIMITATIONS.md CONTRIBUTING.md SECURITY.md CHANGELOG.md RELEASE-v2.3.15-rc2.md RELEASE-v2.3.15-rc3.md docs/ARCHITECTURE.md docs/QUICK_START.md docs/LOCAL_MODEL_SETUP.md docs/RESULT_STATUS.md 2>/dev/null; then
  report_failure "public documentation mixes an older release version"
fi

if ! bash scripts/check-docs.sh; then
  report_failure "documentation validation failed"
fi

if ((failures)); then
  echo "Prepublish check failed." >&2
  exit 1
fi

echo "Prepublish check passed: $candidate_count candidate files scanned."
