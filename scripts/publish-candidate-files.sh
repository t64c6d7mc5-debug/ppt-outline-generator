#!/usr/bin/env bash
set -euo pipefail

# Emits NUL-delimited repository-relative paths that are safe to publish.
# The list is shared by the prepublish audit and release-manifest generator.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -d .git ]] && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git ls-files -co --exclude-standard -z
  exit 0
fi

find . \
  \( -path './.git' -o -path './node_modules' -o -path './.vercel' \
    -o -path './真实回归' -o -path './验收证据' -o -path './打开方式' -o -path './版本快照' \
    -o -path './docs/superpowers' -o -path './.superpowers' \
    -o -path './BASELINE-v2.3.15.md' -o -path './CURRENT-STATE-v2.3.15.md' -o -path './PROJECT_STATUS_20260620.md' \
    -o -path './RELEASE-v2.3.5.md' -o -path './RELEASE-v2.3.6.md' -o -path './RELEASE-v2.3.14.md' -o -path './RELEASE-v2.3.15.md' \
    -o -path './RELEASE-v2.3.15-rc1.md' -o -path './PUBLISH-CANDIDATE-v2.3.15-rc1.md' -o -path './RELEASE-E4.1.md' \
    -o -path './RELEASE-E5.1.md' -o -path './RELEASE-E5.2.md' -o -path './RELEASE-E5.2.1.md' -o -path './RELEASE-E5.3.md' -o -path './RELEASE-E5.4.1.md' \
    -o -path './checksum-summary.txt' -o -path './snapshot-manifest.txt' \
    -o -path './test/fixtures/ai-park-professional-input.js' -o -path './test/fixtures/ai-park-quality-failure-outline.js' -o -path './test/fixtures/racing-center-professional-input.js' \
    -o -path './test/v2314-professional-quality-gates.test.js' -o -path './test/v2315-atomic-mismatch-diagnostics.test.js' -o -path './test/v2315-concentrated-atomic-fixes.test.js' \
    -o -path './test/v2315-content-obligation.test.js' -o -path './test/v2315-final-four-matchers.test.js' -o -path './test/v2315-required-section-authority.test.js' \
    -o -path './test/v2315-required-section-selection.test.js' -o -path './test/v2315-requirement-binding.test.js' \
  \) -prune -o \
  -type f ! -name '.env' ! -name '.env.local' ! -name '.env.development' ! -name '.env.production' \
    ! -name '*.backup.js' ! -name '*.save' ! -name '*.tmp' ! -name '*.temp' \
    ! -name '*.log' ! -name '*.pid' ! -name '*.sqlite' ! -name '*.sqlite3' ! -name '*.db' \
    ! -name '*.gguf' ! -name '*.safetensors' ! -name '*.mlx' -print0
