import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPublicResponse } from "../lib/output-adapter.js";

function candidate() {
  return {
    title: "安全脚本",
    subtitle: "可编辑结果",
    executive_summary: ["摘要"],
    content_state_summary: {},
    global_visual_style: {},
    missing_materials: [],
    production_strategy: {},
    slides: [{
      index: 1,
      title: "封面",
      key_message: "说明主题",
      content: "• 主题\n• 受众\n• 用途",
      visual_suggestion: "大标题封面",
      speaker_notes: "开场说明",
      slide_type: "cover",
      role: "cover",
      evidence_sources: [],
      data_requirements: [],
      visual_spec: {}
    }]
  };
}

for (const qualityStatus of ["production_ready", "review_required", "fallback"]) {
  test(`${qualityStatus} public response is HTTP-200-ready with both script versions`, () => {
    const response = buildPublicResponse({
      candidate: candidate(),
      status: {
        quality_status: qualityStatus,
        review_warnings: qualityStatus === "production_ready" ? [] : ["manual_review_recommended"]
      },
      sourceSummary: {
        model_attempted: true,
        model_used: qualityStatus !== "fallback",
        model_id: "local-model",
        model_content_retained: qualityStatus === "production_ready",
        deterministic_completion_used: qualityStatus !== "production_ready",
        fallback_used: qualityStatus === "fallback"
      },
      qualityReport: {
        score: qualityStatus === "production_ready" ? 98 : 72,
        threshold: 95,
        request_id: "req_public_123",
        internal_diagnostics: { prompt: "secret prompt", lineage: [{ safe_hash: "secret" }] },
        hard_gates: { model_content_retention: { passed: false, reason: "private" } },
        public_diagnostic_context: { client_materials: "private customer material" }
      }
    });

    assert.equal(response.success, true);
    assert.equal(response.quality_status, qualityStatus);
    assert.equal(response.production_threshold, 95);
    assert.ok(response.customer_version.length > 20);
    assert.ok(response.production_version.length > 20);
    assert.equal(response.outline.slides.length, 1);
    assert.equal(response.source_summary.fallback_used, qualityStatus === "fallback");
    assert.equal(response.title, response.outline.title);
    assert.deepEqual(response.slides, response.outline.slides);
    assert.doesNotMatch(JSON.stringify(response), /secret prompt|safe_hash|lineage|allocation|private customer material|hard_gates/);
  });
}

test("source summary never equates a model attempt with retained model content", () => {
  const response = buildPublicResponse({
    candidate: candidate(),
    status: { quality_status: "review_required", review_warnings: ["model_content_not_retained"] },
    sourceSummary: {
      model_attempted: true,
      model_used: true,
      model_id: "local-model",
      model_content_retained: false,
      deterministic_completion_used: true,
      fallback_used: false
    },
    qualityReport: { score: 92, threshold: 95 }
  });

  assert.equal(response.source_summary.model_used, true);
  assert.equal(response.source_summary.model_content_retained, false);
  assert.equal(response.source_summary.deterministic_completion_used, true);
});
