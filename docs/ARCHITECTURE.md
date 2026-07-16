# Result-First Architecture

Public release contract: `v2.3.15-rc2`, response contract version `2`.

## Product boundary

The application is a Node.js HTTP server with browser assets. It produces editable PPT scripts and production guidance. It does not generate final visual slide files and it does not depend on a specific model family.

## One public pipeline

The browser UI, `POST /api/outline`, and the controlled runner use the same Result-First Pipeline:

1. `normalizeRequest`
2. `buildRequirementContext`
3. `invokeLocalModel`
4. `parseAndNormalizeModelOutput`
5. `buildBestAvailableCandidate`
6. `applySafeRequirementCompletion`
7. `sanitizeAndRepairOutline`
8. `validateSafetyAndStructure`
9. `calculateQualityStatus`
10. `renderCustomerVersion`
11. `renderProductionVersion`
12. `buildPublicResponse`

The HTTP server only projects the pipeline's status. The UI and controlled runner do not maintain independent planner, fallback, acceptance, retention, or HTTP-status rules.

## OpenAI-compatible model adapter

The generic adapter reads server-side `LOCAL_MODEL_*` configuration and calls an OpenAI-compatible Chat Completions endpoint. It supports optional authentication, optional JSON Schema output, a bounded timeout, a bounded response size, and zero or one repair attempt.

OpenWebUI, Ollama, LM Studio, MLX server, llama.cpp server, vLLM, and similar compatible services are provider choices. Qwen is a tested example, not a runtime dependency or a business branch. Model IDs, credentials, weights, and routing remain outside the repository.

Legacy `OPENWEBUI_BASE_URL` and `OPENWEBUI_API_KEY` environment aliases are accepted for migration when the generic variables are absent.

The application does not download model weights, send one model call per atomic requirement, or retry indefinitely. Planning stages and the final outline use the configured bounded attempt policy; model failure selects deterministic behavior rather than mutating provider configuration.

## Model-output normalization

The normalizer accepts strict JSON, fenced JSON, common field-name variants, string or array bullets, partial sections, and limited plain-text output. It maps usable content to one internal outline contract:

```text
title
subtitle
executive_summary
sections[]:
  id
  role
  title
  key_message
  bullets
  visual_suggestion
  speaker_notes
global_visual_style
material_gaps
```

Missing structural fields are completed conservatively. The normalizer does not invent brands, numbers, technical specifications, relationships, or outcomes. If parsing and at most one configured repair cannot yield a usable model candidate, the pipeline selects deterministic fallback.

## Candidate and source boundary

The pipeline keeps these sources distinct:

- `planner_model`: content retained from a successful model candidate or a safe transformation of it.
- `deterministic_requirement_fulfillment`: safe completion based on explicit user requirements.
- `deterministic_fallback`: a standalone script built from normalized user input when model content is unavailable or unusable.

`model_used=true` means the provider returned a usable model response. `model_content_retained=true` means model content actually survived into the selected public result. Neither flag implies the other. Deterministic content is never relabeled as model content.

Provenance, lineage, retention ratio, and source counts remain internal quality and telemetry signals. Retention failure alone cannot hide an otherwise safe script.

## Deterministic safe fallback

Fallback only uses normalized user-provided information: topic, page count, purpose, audience, style, materials, confirmed facts, must-have items, forbidden content, emphasis, clarification answers, requirements summary, and delivery requirements.

It creates the requested page count with a cover, body structure, and a final action page. Each page includes a title, key message, three to five body points, visual guidance, and speaker notes when requested. Unknown facts use conservative pending-confirmation language. The output is stable and does not carry planner-model provenance.

## Safety completion and sanitization

A partial model candidate is completed before it is rejected. Compatible requirements can share a page; missing calls to action or responsibility fields receive conservative language; unsupported claims are removed or changed to pending confirmation. The final sanitizer and structure validator then inspect the selected candidate.

Quality issues such as wording, title alignment, semantic coverage, generic phrasing, and model-content retention become review warnings. Residual secrets, prompts, private paths, forbidden content, unrecoverable fabrication, empty output, serialization failure, or unrecoverable structure remain blocking.

## Status boundary

- `production_ready` (HTTP 200): safe, complete, non-fallback output that meets the production threshold and has no remaining review warning.
- `review_required` (HTTP 200): safe, complete, displayable output with a lower score or quality warnings.
- `fallback` (HTTP 200): safe, complete deterministic output selected because model content was unavailable or unusable.
- `blocked` (HTTP 422): no safe, non-empty, structurally valid public result can be built.

The quality score does not independently cause `blocked`.

## Public data boundary

Successful responses contain a redacted status, source summary, customer version, production version, editable outline, and public quality report. The output adapter excludes API keys, tokens, prompts, local absolute paths, binding IDs, request-scoped hashes, internal lineage/allocation objects, and raw private customer material.

Internal diagnostics may retain the minimum evidence required for local debugging, but they are not part of the public response or release candidate.

## Release boundary

The public candidate contains generic scripts, `.env.example`, sanitized tests, documentation, and the MIT license. It excludes `.env`, model weights, customer materials, real regression evidence, acceptance screenshots, databases, logs, PID files, caches, request records, private prompts, and personal desktop launchers.
