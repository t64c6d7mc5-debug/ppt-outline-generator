# Changelog

## v2.3.15-rc3 - 2026-07-18

- Publishes the public-onboarding release candidate with local-model calls disabled by default for new installations.
- Documents deterministic fallback as the safe default until an OpenAI-compatible endpoint, model ID, and any required credentials are configured.
- Adds sanitized examples and GitHub issue and pull-request templates for public collaboration.
- Keeps the Result-First Pipeline, deterministic fallback behavior, model prompts, validators, quality states, and safety rules unchanged from rc2.

## v2.3.15-rc2 - 2026-07-16

- Freezes the public release candidate around the verified Result-First delivery contract.
- Adds portable `start.sh`, `start-macos.command`, `check-environment.sh`, publish-candidate inventory, and SHA-256 manifest tooling without personal paths or model-specific startup behavior.
- Updates `.env.example` to a generic OpenAI-compatible template with no model ID, credential, private provider value, or personal path.
- Adds bilingual local-model setup and result-status documentation, plus an rc2 release review checklist.
- Adds release-candidate auditing for personal paths, likely secrets, real request identifiers, ignored local artifacts, required public documents, and generic configuration.
- Excludes prior local release notes and private local evidence from the publish candidate tree; no Git repository, commit, tag, remote, push, deployment, or model configuration is created by this release preparation.

## Earlier local history

Earlier local release notes and regression artifacts are intentionally excluded from the public candidate because they may contain machine-specific paths or private evidence.

> Verification note: these entries describe the intended release-candidate changes. They do not assert that final tests or the single real-model acceptance request have passed.
