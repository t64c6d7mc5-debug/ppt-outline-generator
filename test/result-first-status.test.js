import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveResultStatus } from "../lib/result-status.js";

test("a safe high-quality model result is production_ready", () => {
  const result = resolveResultStatus({
    candidateAvailable: true,
    selectedSource: "model",
    score: 97,
    productionThreshold: 95
  });

  assert.deepEqual(result, {
    quality_status: "production_ready",
    http_status: 200,
    review_warnings: [],
    blocking_reasons: []
  });
});

test("ordinary quality failures and a low score require review but never block a safe result", () => {
  const result = resolveResultStatus({
    candidateAvailable: true,
    selectedSource: "model",
    score: 42,
    productionThreshold: 95,
    qualityFailures: [
      "material_relevance",
      "required_section_coverage",
      "instruction_shell_title",
      "model_content_retention"
    ],
    modelAttempt: {
      attempted: true,
      used: true,
      content_used: false,
      status: "rejected",
      reason_code: "MODEL_CONTENT_NOT_RETAINED_IN_FINAL_OUTPUT"
    }
  });

  assert.equal(result.quality_status, "review_required");
  assert.equal(result.http_status, 200);
  assert.deepEqual(result.blocking_reasons, []);
  assert.ok(result.review_warnings.includes("model_content_retention"));
  assert.ok(result.review_warnings.includes("model_content_not_retained"));
  assert.ok(result.review_warnings.includes("planner_rejected"));
  assert.ok(result.review_warnings.includes("quality_below_production_threshold"));
});

test("a complete safe deterministic result is fallback when the model is unavailable", () => {
  const result = resolveResultStatus({
    candidateAvailable: true,
    fallbackAvailable: true,
    selectedSource: "deterministic_fallback",
    score: 99,
    modelAttempt: {
      attempted: true,
      used: false,
      content_used: false,
      status: "unavailable",
      reason_code: "LOCAL_MODEL_TIMEOUT"
    }
  });

  assert.equal(result.quality_status, "fallback");
  assert.equal(result.http_status, 200);
  assert.deepEqual(result.blocking_reasons, []);
  assert.ok(result.review_warnings.includes("safe_deterministic_fallback_used"));
  assert.ok(result.review_warnings.includes("local_model_unavailable"));
});

test("an available safe fallback wins when no model candidate exists", () => {
  const result = resolveResultStatus({
    candidateAvailable: false,
    fallbackAvailable: true,
    selectedSource: "deterministic_fallback",
    score: 0
  });

  assert.equal(result.quality_status, "fallback");
  assert.equal(result.http_status, 200);
});

test("only absence of every candidate or unrecoverable selected-output risks block", () => {
  const absent = resolveResultStatus({
    candidateAvailable: false,
    fallbackAvailable: false,
    selectedSource: "none"
  });
  const unsafe = resolveResultStatus({
    candidateAvailable: true,
    fallbackAvailable: false,
    selectedSource: "model",
    safetyFailures: ["public_secret_leak"]
  });
  const broken = resolveResultStatus({
    candidateAvailable: true,
    fallbackAvailable: false,
    selectedSource: "model",
    structureFailures: ["outline_empty"]
  });

  assert.deepEqual(absent, {
    quality_status: "blocked",
    http_status: 422,
    review_warnings: [],
    blocking_reasons: ["no_safe_displayable_candidate"]
  });
  assert.equal(unsafe.quality_status, "blocked");
  assert.deepEqual(unsafe.blocking_reasons, ["public_secret_leak"]);
  assert.equal(broken.quality_status, "blocked");
  assert.deepEqual(broken.blocking_reasons, ["outline_empty"]);
});

test("warnings are stable, deduplicated, and do not expose arbitrary model reason text", () => {
  const result = resolveResultStatus({
    candidateAvailable: true,
    selectedSource: "model",
    score: 92,
    qualityFailures: ["material_relevance", "material_relevance"],
    modelAttempt: {
      attempted: true,
      used: true,
      content_used: true,
      status: "used",
      reason_code: "sensitive free-form provider message"
    }
  });

  assert.deepEqual(result.review_warnings, [
    "material_relevance",
    "quality_below_production_threshold"
  ]);
});

test("deterministic page completion and unresolved requirement completion force a review warning", () => {
  const result = resolveResultStatus({
    candidateAvailable: true,
    selectedSource: "model",
    score: 99,
    modelAttempt: {
      attempted: true,
      used: true,
      content_used: true,
      status: "used",
      model_output_page_count_mismatch: true,
      requirement_completion_warning: "REQUIREMENT_FULFILLMENT_BUDGET_EXCEEDED"
    }
  });

  assert.equal(result.quality_status, "review_required");
  assert.ok(result.review_warnings.includes("model_output_page_count_mismatch"));
  assert.ok(result.review_warnings.includes("requirement_fulfillment_budget_exceeded"));
});
