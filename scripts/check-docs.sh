#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

required_docs=(
  README.md
  README_EN.md
  KNOWN_LIMITATIONS.md
  CONTRIBUTING.md
  SECURITY.md
  CHANGELOG.md
  RELEASE-v2.3.15-rc2.md
  RELEASE-v2.3.15-rc3.md
  docs/ARCHITECTURE.md
  docs/QUICK_START.md
  docs/LOCAL_MODEL_SETUP.md
  docs/RESULT_STATUS.md
)

required_public_files=(
  examples/simple-mode-input.json
  examples/professional-mode-input.json
  examples/customer-version-example.md
  examples/production-version-example.md
  .github/ISSUE_TEMPLATE/bug_report.yml
  .github/ISSUE_TEMPLATE/feature_request.yml
  .github/ISSUE_TEMPLATE/config.yml
  .github/pull_request_template.md
)

for doc in "${required_docs[@]}"; do
  [[ -f "$doc" ]] || { echo "[FAIL] Missing document: $doc" >&2; exit 1; }
done

for file in "${required_public_files[@]}"; do
  [[ -s "$file" ]] || { echo "[FAIL] Missing public onboarding file: $file" >&2; exit 1; }
done

grep -Fqx 'LOCAL_MODEL_ENABLED=false' .env.example || { echo "[FAIL] .env.example must default to fallback mode" >&2; exit 1; }

for doc in README.md README_EN.md docs/QUICK_START.md docs/LOCAL_MODEL_SETUP.md; do
  rg -q 'LOCAL_MODEL_ENABLED=false' "$doc" || { echo "[FAIL] Missing fallback-default guidance: $doc" >&2; exit 1; }
  rg -q 'LOCAL_MODEL_ENABLED=true' "$doc" || { echo "[FAIL] Missing model-enable guidance: $doc" >&2; exit 1; }
done

for doc in README.md README_EN.md docs/QUICK_START.md; do
  rg -q 'https://github.com/t64c6d7mc5-debug/ppt-outline-generator.git' "$doc" || { echo "[FAIL] Missing public clone URL: $doc" >&2; exit 1; }
  rg -q 'cd ppt-outline-generator' "$doc" || { echo "[FAIL] Missing clone directory: $doc" >&2; exit 1; }
  if rg -q '<repository-url>|local-llm-ppt-script-generator' "$doc"; then
    echo "[FAIL] Stale clone instructions: $doc" >&2
    exit 1
  fi
done

for heading in '项目简介' '功能截图' '核心能力' 'Result-First' '结果状态' '环境要求' '下载方式' '通用本地模型配置' '生成模式' '常见问题' '项目目录' '开发、测试与贡献'; do
  rg -q "$heading" README.md || { echo "[FAIL] Chinese README is missing: $heading" >&2; exit 1; }
done

for heading in 'What it supports' 'Screenshot placeholder' 'Result-First Pipeline' 'Download' 'Requirements' 'Install and start' 'Generic local-model configuration' 'Provider examples' 'Generation modes' 'Result-First status policy' 'Troubleshooting' 'Repository layout' 'Development, testing, and contributions'; do
  rg -q "$heading" README_EN.md || { echo "[FAIL] English README is missing: $heading" >&2; exit 1; }
done

node --input-type=module --eval '
import { readFile, access } from "node:fs/promises";
import path from "node:path";
const root = process.cwd();
const files = ["README.md", "README_EN.md", "KNOWN_LIMITATIONS.md", "CONTRIBUTING.md", "SECURITY.md", "CHANGELOG.md", "RELEASE-v2.3.15-rc2.md", "RELEASE-v2.3.15-rc3.md", "docs/ARCHITECTURE.md", "docs/QUICK_START.md", "docs/LOCAL_MODEL_SETUP.md", "docs/RESULT_STATUS.md"];
const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
for (const file of files) {
  const text = await readFile(path.join(root, file), "utf8");
  for (const match of text.matchAll(linkPattern)) {
    const target = match[1].trim();
    if (!target || target.startsWith("#") || /^[a-z]+:\/\//i.test(target) || target.startsWith("mailto:")) continue;
    const local = target.split("#", 1)[0];
    await access(path.resolve(path.dirname(path.join(root, file)), local));
  }
}
console.log("[OK] Documentation links and bilingual required sections are present.");
'
