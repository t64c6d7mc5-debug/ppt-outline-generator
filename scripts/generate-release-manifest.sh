#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="$(node -p 'JSON.parse(require("node:fs").readFileSync("package.json", "utf8")).version')"
MANIFEST="RELEASE_MANIFEST-v${VERSION}.txt"
TEMP_MANIFEST="$(mktemp)"
TEMP_CANDIDATES="$(mktemp)"
trap 'rm -f "$TEMP_MANIFEST" "$TEMP_CANDIDATES"' EXIT

bash scripts/publish-candidate-files.sh > "$TEMP_CANDIDATES"

{
  printf 'PPT Outline Generator release manifest: v%s\n' "$VERSION"
  printf 'Algorithm: SHA-256\n'
  printf 'Generated from the .gitignore-filtered publish candidate tree.\n'
  printf 'The manifest file itself is intentionally omitted from the hash list because a file cannot contain a stable hash of itself.\n\n'
  while IFS= read -r -d '' file; do
    [[ "$file" == "./$MANIFEST" || "$file" == "$MANIFEST" ]] && continue
    shasum -a 256 "$file"
  done < "$TEMP_CANDIDATES" | LC_ALL=C sort
} > "$TEMP_MANIFEST"

mv "$TEMP_MANIFEST" "$MANIFEST"
printf 'Generated %s\n' "$MANIFEST"
