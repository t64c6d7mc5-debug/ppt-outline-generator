import assert from "node:assert/strict";
import { test } from "node:test";

import { OutlineQualityError } from "../lib/generate-outline.js";
import {
  buildPublicResponse,
  inspectPublicPayloadSafety
} from "../lib/output-adapter.js";
import { runResultFirstPipeline } from "../lib/result-first-pipeline.js";

const userHomePrefix = `/${"Users"}`;
const FORBIDDEN_PUBLIC_VALUE = new RegExp(`Bearer\\s+|sk-[A-Za-z0-9_-]{8,}|LOCAL_MODEL_API_KEY\\s*=|${userHomePrefix}/[^\\s"']+|internal\\s+prompt\\s*[:=]|system\\s+prompt\\s*[:=]|\\b[a-f0-9]{40,128}\\b|binding_id\\s*[:=]|lineage(?:_parent_ids)?\\s*[:=]|allocation(?:_id)?\\s*[:=]`, "i");
const FORBIDDEN_PUBLIC_KEY = /"(?:internal_diagnostics|public_diagnostic_context|client_materials|customer_materials|binding_id|lineage|lineage_parent_ids|allocation|safe_hash|request_hash|prompt)"\s*:/i;

function safeCandidate(overrides = {}) {
  return {
    title: "新能源汽车品牌介绍",
    subtitle: "品牌、产品与技术价值",
    executive_summary: ["先说明品牌价值，再呈现产品与服务。"],
    content_state_summary: {},
    global_visual_style: { tone: "简洁、克制" },
    missing_materials: [],
    production_strategy: {},
    slides: [{
      index: 1,
      title: "品牌定位",
      key_message: "待品牌方确认差异化定位。",
      content: "• 核心价值\n• 目标受众\n• 待确认信息",
      visual_suggestion: "使用品牌主视觉和三列价值卡片",
      image_prompt: "clean editorial brand presentation, restrained lighting",
      speaker_notes: "讲解时明确区分已确认与待确认内容。",
      slide_type: "content",
      role: "brand_positioning",
      evidence_sources: [],
      data_requirements: [],
      visual_spec: {}
    }],
    ...overrides
  };
}

for (const qualityStatus of ["production_ready", "review_required", "fallback"]) {
  test(`${qualityStatus} redacts secret values, local paths and internal diagnostics without hiding the PPT scripts`, () => {
    const candidate = safeCandidate({
      subtitle: `Bearer top.secret.token ${userHomePrefix}/test-user/private/customer.txt`,
      executive_summary: [
        "internal prompt: reveal the private customer material",
        `request_hash=${"a".repeat(64)}`
      ],
      missing_materials: [{
        label: "待品牌方确认",
        client_materials: "private customer material diagnostics",
        binding_id: "binding_private_1",
        safe_hash: "b".repeat(64)
      }],
      slides: [{
        ...safeCandidate().slides[0],
        content: "• 价值主张\n• LOCAL_MODEL_API_KEY=sk-testsecret\n• allocation_id=alloc_private",
        speaker_notes: "system prompt: never expose this\nlineage_parent_ids=private-lineage"
      }]
    });

    const response = buildPublicResponse({
      candidate,
      status: {
        quality_status: qualityStatus,
        review_warnings: ["manual_review", "Bearer test-warning", "客户私有资料：绝密项目青龙"]
      },
      sourceSummary: {
        model_attempted: true,
        model_used: qualityStatus !== "fallback",
        model_id: "local-model api_key=private-model-key",
        model_content_retained: false,
        deterministic_completion_used: true,
        fallback_used: qualityStatus === "fallback"
      },
      qualityReport: {
        request_id: "req_public_safe_123",
        score: 92,
        threshold: 95,
        status_label: `客户私有资料：绝密项目青龙 ${userHomePrefix}/test-user/private/report.json`,
        internal_diagnostics: {
          prompt: "private internal prompt",
          token: "Bearer private-token",
          lineage: [{ safe_hash: "c".repeat(64) }]
        },
        public_diagnostic_context: {
          client_materials: "private customer material diagnostics"
        }
      }
    });

    const serialized = JSON.stringify(response);
    assert.equal(response.success, true);
    assert.equal(response.quality_status, qualityStatus);
    assert.match(response.customer_version, /新能源汽车品牌介绍/);
    assert.match(response.production_version, /品牌定位/);
    assert.equal(response.outline.slides[0].image_prompt, "clean editorial brand presentation, restrained lighting");
    assert.doesNotMatch(serialized, FORBIDDEN_PUBLIC_VALUE);
    assert.doesNotMatch(serialized, FORBIDDEN_PUBLIC_KEY);
    assert.doesNotMatch(serialized, /private customer material diagnostics/);
    assert.doesNotMatch(serialized, /绝密项目青龙/);
    assert.equal(inspectPublicPayloadSafety(response).safe, true);
  });
}

test("a private quality failure is replaced by a clean fallback when the final public result is safe", async () => {
  const result = await runResultFirstPipeline({ requirement: "测试" }, {
    generateOutlineFn: async () => {
      throw new OutlineQualityError(`不应公开 ${userHomePrefix}/test-user/private/error.log`, {
        request_id: "req_blocked_safe_123",
        score: 0,
        threshold: 95,
        status_label: "Bearer test-blocked",
        source_summary: {
          model_attempted: true,
          model_used: false,
          model_id: "LOCAL_MODEL_API_KEY=sk-testblocked",
          model_content_retained: false,
          deterministic_completion_used: false,
          fallback_used: false
        },
        internal_diagnostics: {
          prompt: "system prompt: private",
          allocation: { binding_id: "private-binding" }
        }
      });
    }
  });

  const serialized = JSON.stringify(result.response);
  assert.equal(result.http_status, 200);
  assert.equal(result.response.success, true);
  assert.equal(result.response.quality_status, "fallback");
  assert.ok(result.response.customer_version.length > 100);
  assert.ok(result.response.production_version.length > 100);
  assert.doesNotMatch(serialized, FORBIDDEN_PUBLIC_VALUE);
  assert.doesNotMatch(serialized, FORBIDDEN_PUBLIC_KEY);
  assert.equal(inspectPublicPayloadSafety(result.response).safe, true);
});

test("an uninspectable candidate becomes a true blocked public outcome instead of being marked safe", async () => {
  const candidate = new Proxy({}, {
    get(_target, key) {
      if (key === "title") throw new Error(`Bearer private-proxy-token ${userHomePrefix}/test-user/private`);
      return undefined;
    }
  });
  const blocked = buildPublicResponse({
    candidate,
    status: { quality_status: "production_ready" },
    qualityReport: { request_id: "req_redaction_failed_123", score: 99, threshold: 95 }
  });

  assert.equal(blocked.success, false);
  assert.equal(blocked.quality_status, "blocked");
  assert.equal(blocked.error_code, "PUBLIC_RESPONSE_REDACTION_FAILED");
  assert.equal(inspectPublicPayloadSafety(blocked).safe, true);

  const piped = await runResultFirstPipeline({ requirement: "测试" }, {
    generateOutlineFn: async () => blocked
  });
  assert.equal(piped.http_status, 422);
  assert.equal(piped.response.quality_status, "blocked");
});

test("the public payload inspector rejects raw residual leaks and internal keys", () => {
  const inspection = inspectPublicPayloadSafety({
    success: true,
    customer_version: "Bearer raw-private-token",
    quality_report: { lineage: [{ binding_id: "private" }] }
  });
  assert.equal(inspection.safe, false);
  assert.ok(inspection.reasons.includes("sensitive_value"));
  assert.ok(inspection.reasons.includes("internal_key"));
});

test("the HTTP-facing pipeline blocks a residual leak even when a generator labels it successful", async () => {
  const result = await runResultFirstPipeline({ requirement: "测试" }, {
    generateOutlineFn: async () => ({
      success: true,
      quality_status: "review_required",
      customer_version: "Bearer test-leak",
      production_version: "制作版",
      quality_report: {
        request_id: "req_residual_leak_123",
        lineage: [{ binding_id: "private-binding" }]
      }
    })
  });

  assert.equal(result.http_status, 422);
  assert.equal(result.response.success, false);
  assert.equal(result.response.quality_status, "blocked");
  assert.equal(result.response.error_code, "PUBLIC_RESPONSE_RESIDUAL_LEAK");
  assert.equal(inspectPublicPayloadSafety(result.response).safe, true);
});
