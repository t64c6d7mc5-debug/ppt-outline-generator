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
  docs/ARCHITECTURE.md
  docs/QUICK_START.md
  docs/LOCAL_MODEL_SETUP.md
  docs/RESULT_STATUS.md
)

for doc in "${required_docs[@]}"; do
  [[ -f "$doc" ]] || { echo "[FAIL] Missing document: $doc" >&2; exit 1; }
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
const files = ["README.md", "README_EN.md", "KNOWN_LIMITATIONS.md", "CONTRIBUTING.md", "SECURITY.md", "CHANGELOG.md", "RELEASE-v2.3.15-rc2.md", "docs/ARCHITECTURE.md", "docs/QUICK_START.md", "docs/LOCAL_MODEL_SETUP.md", "docs/RESULT_STATUS.md"];
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
