import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";

import { generateOutline, OutlineQualityError } from "../lib/generate-outline.js";
import { runResultFirstPipeline } from "../lib/result-first-pipeline.js";
import { createAppServer } from "../server.js";

const INPUT = {
  requirement: "企业软件产品介绍",
  purpose: "面向潜在客户介绍产品",
  audience: "企业客户",
  page_count: 6,
  include_speaker_notes: true
};

function unavailablePlanner(reasonCode = "LOCAL_MODEL_TIMEOUT") {
  return async () => ({
    analysis: null,
    metadata: {
      enabled: true,
      used: false,
      status: "fallback",
      model_id: "local-model",
      reason_code: reasonCode,
      content_used: false,
      repair_attempted: false,
      repaired: false,
      fallback_used: true
    }
  });
}

test("a model timeout returns a complete honest fallback instead of throwing", async () => {
  const result = await generateOutline(INPUT, {
    planWithLocalModelFn: unavailablePlanner()
  });

  assert.equal(result.success, true);
  assert.equal(result.quality_status, "fallback");
  assert.equal(result.slides.length, 6);
  assert.ok(result.customer_version.length > 100);
  assert.ok(result.production_version.length > 100);
  assert.deepEqual(result.source_summary, {
    model_attempted: true,
    model_used: false,
    model_id: "local-model",
    model_content_retained: false,
    deterministic_completion_used: true,
    fallback_used: true
  });
});

test("disabled model still returns fallback while accurately reporting no model attempt", async () => {
  const result = await generateOutline(INPUT, {
    planWithLocalModelFn: async () => ({
      analysis: null,
      metadata: {
        enabled: false,
        used: false,
        status: "fallback",
        model_id: "",
        reason_code: "LOCAL_MODEL_DISABLED",
        content_used: false,
        fallback_used: true
      }
    })
  });

  assert.equal(result.quality_status, "fallback");
  assert.equal(result.source_summary.model_attempted, false);
  assert.equal(result.source_summary.model_used, false);
  assert.equal(result.source_summary.fallback_used, true);
});

test("the formal pipeline returns the same public response and HTTP status as generateOutline", async () => {
  const options = { planWithLocalModelFn: unavailablePlanner("LOCAL_MODEL_HTTP_ERROR") };
  const direct = await generateOutline(INPUT, options);
  const piped = await runResultFirstPipeline(INPUT, options);

  assert.equal(piped.http_status, 200);
  assert.equal(piped.response.quality_status, direct.quality_status);
  assert.equal(piped.response.slides.length, direct.slides.length);
  assert.deepEqual(piped.response.source_summary, direct.source_summary);
});

test("a short model plan is deterministically completed and transparently returned for review", async () => {
  const result = await generateOutline({ ...INPUT, page_count: 5 }, {
    planWithLocalModelFn: async () => ({
      analysis: {
        audience: "企业客户",
        purpose: "面向潜在客户介绍产品",
        recommended_page_count: 3,
        sections: [
          { section_id: "cover", title: "产品概览", role: "cover", key_message: "围绕客户任务说明产品价值", bullets: ["明确产品定位与适用边界"] },
          { section_id: "market_or_customer_challenge", title: "客户任务", role: "background", key_message: "先界定客户任务", bullets: ["梳理当前问题与待确认资料"] },
          { section_id: "company_positioning", title: "产品定位", role: "analysis", key_message: "说明能力边界", bullets: ["区分已确认能力与待确认信息"] }
        ]
      },
      metadata: {
        enabled: true,
        used: true,
        status: "used",
        model_id: "test-model",
        content_used: true,
        fallback_used: false,
        model_output_page_count_mismatch: true,
        expected_page_count: 5,
        returned_page_count: 3
      }
    })
  });

  assert.equal(result.success, true);
  assert.equal(result.slides.length, 5);
  assert.equal(result.quality_status, "review_required");
  assert.equal(result.source_summary.deterministic_completion_used, true);
  assert.ok(result.review_warnings.includes("model_output_page_count_mismatch"));
  assert.ok(result.customer_version.length > 100);
  assert.ok(result.production_version.length > 100);
});

test("an unresolved completion warning keeps the safe candidate visible with a review status", async () => {
  const result = await generateOutline(INPUT, {
    planWithLocalModelFn: async () => ({
      analysis: {
        audience: "企业客户",
        purpose: "面向潜在客户介绍产品",
        recommended_page_count: 6,
        sections: [
          { section_id: "cover", title: "产品概览", role: "cover", key_message: "介绍产品", bullets: ["保留安全可编辑结构"] }
        ]
      },
      metadata: {
        enabled: true,
        used: true,
        status: "used",
        model_id: "test-model",
        content_used: true,
        fallback_used: false,
        requirement_completion_warning: "REQUIREMENT_FULFILLMENT_BUDGET_EXCEEDED"
      }
    })
  });

  assert.equal(result.quality_status, "review_required");
  assert.ok(result.review_warnings.includes("requirement_fulfillment_budget_exceeded"));
  assert.ok(result.customer_version.length > 100);
  assert.ok(result.production_version.length > 100);
});

test("an internal quality rejection is recovered with the independent safe fallback", async () => {
  const server = createAppServer({
    generateOutlineFn: async () => {
      throw new OutlineQualityError("internal quality message", {
        request_id: "req_quality_recovered",
        score: 92,
        threshold: 95,
        source_summary: {
          model_attempted: true,
          model_used: false,
          model_id: "local-model",
          model_content_retained: false,
          deterministic_completion_used: true,
          fallback_used: true
        }
      });
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/outline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(INPUT)
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.success, true);
    assert.equal(payload.quality_status, "fallback");
    assert.equal(payload.score, 92);
    assert.equal(payload.slides.length, 6);
    assert.ok(payload.customer_version.length > 100);
    assert.ok(payload.production_version.length > 100);
    assert.deepEqual(payload.source_summary, {
      model_attempted: true,
      model_used: false,
      model_id: "local-model",
      model_content_retained: false,
      deterministic_completion_used: true,
      fallback_used: true
    });
    assert.doesNotMatch(JSON.stringify(payload), /internal quality message/);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("SAFE_RESULT_UNAVAILABLE is reserved for a genuinely unusable deterministic fallback", async () => {
  const outcome = await runResultFirstPipeline({}, {
    generateOutlineFn: async () => {
      throw new OutlineQualityError("private internal quality detail", {
        request_id: "req_no_fallback",
        score: 0,
        threshold: 95
      });
    }
  });

  assert.equal(outcome.http_status, 422);
  assert.equal(outcome.response.success, false);
  assert.equal(outcome.response.quality_status, "blocked");
  assert.equal(outcome.response.error_code, "SAFE_RESULT_UNAVAILABLE");
  assert.equal(outcome.response.error_subreason, "FALLBACK_REQUEST_UNUSABLE");
  assert.doesNotMatch(JSON.stringify(outcome.response), /private internal quality detail/);
});

test("an unexpected generator failure still returns the independent safe fallback", async () => {
  const outcome = await runResultFirstPipeline(INPUT, {
    generateOutlineFn: async () => {
      throw new Error("private internal failure detail");
    }
  });

  assert.equal(outcome.http_status, 200);
  assert.equal(outcome.response.success, true);
  assert.equal(outcome.response.quality_status, "fallback");
  assert.equal(outcome.response.source_summary.model_attempted, false);
  assert.equal(outcome.response.source_summary.fallback_used, true);
  assert.ok(outcome.response.customer_version.length > 100);
  assert.ok(outcome.response.production_version.length > 100);
  assert.doesNotMatch(JSON.stringify(outcome.response), /private internal failure detail/);
});

test("an unrecognizable request is blocked only after no safe fallback can be built", async () => {
  const outcome = await runResultFirstPipeline({}, {
    generateOutlineFn: async () => {
      throw new OutlineInputError("missing private request field");
    }
  });

  assert.equal(outcome.http_status, 422);
  assert.equal(outcome.response.success, false);
  assert.equal(outcome.response.quality_status, "blocked");
  assert.doesNotMatch(JSON.stringify(outcome.response), /missing private request field/);
});
