# v2.3.15-rc4 - Privacy and Portable Test Fix

## Highlights

- Removes machine-specific launcher references from the public launcher test.
- Uses a temporary, portable fixture for launcher health, mismatch diagnostics, log-tail output, and owned-process cleanup coverage.
- Keeps local model, UI, and PPT services outside the public test path.

## Compatibility and scope

- The Result-First Pipeline, deterministic fallback, model prompts, validators, quality states, safety rules, and model-call behavior are unchanged from rc3.
- rc2 and rc3 remain available and unchanged.
- rc4 is the recommended pre-release for a portable, privacy-clean source package.

## Release status

This is a pre-release. It does not configure a model, alter local service settings, or create a hosted deployment.
