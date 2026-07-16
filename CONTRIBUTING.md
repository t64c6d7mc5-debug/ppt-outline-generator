# Contributing

## Before opening a change

1. Keep changes scoped to the requested behavior.
2. Do not commit `.env`, customer material, model output, request evidence, credentials, or local paths.
3. Preserve validator, no-fabrication, canonical-section, and public-redaction boundaries unless the change explicitly requires them.
4. Add a focused regression test before changing behavior.
5. Keep provider setup generic: do not add model-name, personal-path, private endpoint, or customer-fixture branches.
6. Do not include model weights, real request records, screenshots, logs, or acceptance evidence in a pull request.

## Local verification

```bash
npm test
npm run check
bash scripts/prepublish-check.sh
```

Do not use real customer material in tests. Add sanitized, generic fixtures only.

## Documentation changes

Update Chinese and English documentation together when a public contract, setup path, status, safety boundary, or script changes. Do not claim that a model is universally high quality, hallucination-free, or a replacement for human review.

## Pull request guidance

Describe the user-visible behavior, affected quality status, safety implications, and verification commands. Keep model configuration changes separate from product logic changes.
