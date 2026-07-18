# v2.3.15-rc3 - Public Onboarding Release Candidate

## Highlights

- Local-model calls are disabled by default in `.env.example`, so a new installation can start with the deterministic fallback before any model service is configured.
- Once an OpenAI-compatible endpoint, model ID, and any required credentials are configured, set `LOCAL_MODEL_ENABLED=true` to use richer, request-specific model output.
- README and quick-start guidance now explain the default fallback path and optional local-model setup in Chinese and English.
- The public repository includes sanitized examples plus issue and pull-request templates for collaboration.

## Verification scope

- The release candidate is intended for a clean clone, `npm install`, and offline fallback-first startup review.
- The Result-First Pipeline, deterministic fallback, model prompts, validators, quality states, and safety rules are unchanged from rc2.
- No model weights, credentials, customer material, real request evidence, private launchers, or machine-specific paths are part of this release.

## Release status

This is a pre-release for public installation and documentation review. It is not a stable release and does not create a hosted service or configure a local model automatically.
