# Open Source Audit — v2.3.15-rc2

## Scope

This audit covers the GitHub publish candidate only. It does not inspect or publish ignored local environment files, model services, customer material, private evidence, or operating-system configuration.

## Sensitive-information review

- Personal project paths, personal account paths, desktop launchers, and private application-support launchers: excluded from the candidate tree and scanned for in candidate files.
- `.env`, environment variants, API keys, tokens, cookies, credentials, databases, logs, PID files, caches, model weights, and local runtime artifacts: excluded by `.gitignore` and candidate selection.
- Real regression runs, acceptance evidence, screenshots, customer materials, internal plans, local snapshots, and historical local release notes: excluded from the candidate tree.
- Request UUID values, private prompts, internal hashes, lineage, allocation objects, and raw customer material: not included in public documentation or release receipts.
- Sanitized tests may contain structural field names or synthetic values to verify redaction behavior; they contain no real credentials, personal paths, or customer records.

## Generic configuration review

- `.env.example` contains example-only `LOCAL_MODEL_*` settings, an empty API key, and an empty model ID.
- The public configuration does not require Qwen, a private model alias, a personal endpoint, a personal path, or a fixed provider port.
- OpenWebUI, Ollama, LM Studio, MLX server, llama.cpp server, vLLM, and other OpenAI-compatible Chat Completions services are documented as examples.
- The portable scripts resolve the repository root from their own location. They do not download models, rewrite provider configuration, or delete user data.
- A missing or unavailable model endpoint leaves deterministic fallback available and is not represented as a successful model response.

## License and release state

- License: MIT (`LICENSE`).
- Public release documentation: Chinese and English README files, architecture, quick start, local-model setup, result-status contract, limitations, contributing, security, changelog, and rc2 release notes.
- No Git repository was initialized, no commit/tag/remote was created, and no push, deployment, or GitHub release was performed.

## Verification performed

| Check | Result |
| --- | --- |
| Startup-script syntax | PASS |
| Environment-check script | PASS; unavailable or incomplete model configuration remains fallback-capable |
| Documentation links and bilingual required sections | PASS |
| Candidate-tree personal-path and likely-secret scan | PASS |
| Runtime-version and frontend contract focused tests | PASS |
| Result-First and fallback coverage | PASS in full suite |
| `npm test` | 492/492 PASS |
| `npm run check` | PASS |
| `bash scripts/prepublish-check.sh` | PASS after final manifest generation |

## Maintainer action before publication

Review `RELEASE_MANIFEST-v2.3.15-rc2.txt`, this audit, and all candidate files. Confirm screenshots, if later added, are sanitized. Only after human review should a maintainer initialize a repository, create a commit, add a remote, or publish to GitHub.
