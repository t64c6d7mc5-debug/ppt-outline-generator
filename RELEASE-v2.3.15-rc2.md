# v2.3.15-rc2 Release Candidate

## Scope

This release candidate freezes the Result-First delivery model for GitHub review. The browser UI, `POST /api/outline`, and the controlled runner use the same public pipeline and response contract.

## Delivery contract

- `production_ready`, `review_required`, and `fallback` return HTTP 200 with non-empty customer and production scripts.
- `blocked` is reserved for unrecoverable input, residual sensitive or forbidden content, unrecoverable structural failure, serialization failure, or no safe displayable content after fallback.
- A fallback is explicit deterministic content from normalized user requirements. It is not represented as model output.
- Quality score, ordinary semantic misses, model retention, planner rejection, and partial model provenance are review signals, not standalone blockers.

## Local-model boundary

The repository supports OpenAI-compatible local providers through generic `LOCAL_MODEL_*` configuration. OpenWebUI, Ollama, LM Studio, MLX server, llama.cpp server, and vLLM are documented examples. Model weights, credentials, customer material, real request evidence, databases, logs, caches, and personal launchers are excluded from the candidate tree.

## Release review checklist

1. Review `.env.example`, `README.md`, `README_EN.md`, `docs/`, `SECURITY.md`, and `KNOWN_LIMITATIONS.md`.
2. Run `npm test`, `npm run check`, and `bash scripts/prepublish-check.sh`.
3. Review `OPEN_SOURCE_AUDIT-v2.3.15-rc2.md` and `RELEASE_MANIFEST-v2.3.15-rc2.txt`.
4. Perform a human code and documentation review before initializing a repository, creating a commit, or publishing.

This document does not create a Git repository, commit, tag, remote, push, deployment, or hosted release.
