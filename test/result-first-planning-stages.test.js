import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildFallbackClarifyingQuestions,
  buildFallbackRequirementsSummary,
  runLocalPlanningProfile
} from "../lib/local-model-planner.js";
import { runResultFirstPipeline } from "../lib/result-first-pipeline.js";

const INPUT = {
  requirement: "新能源汽车品牌介绍",
  page_count: 10,
  purpose: "向潜在消费者和合作伙伴介绍品牌",
  audience: "潜在消费者与合作伙伴",
  must_include: ["品牌定位", "核心车型矩阵", "技术价值"],
  excluded_content: ["不得编造销量和技术参数"]
};

test("deterministic clarifying questions are project-specific and complete", () => {
  const questions = buildFallbackClarifyingQuestions(INPUT);

  assert.ok(questions.length >= 3 && questions.length <= 5);
  assert.ok(questions.every(Boolean));
  assert.match(questions.join("\n"), /新能源汽车|品牌|车型|技术/);
});

test("deterministic requirements summary preserves user facts and boundaries", () => {
  const result = buildFallbackRequirementsSummary(INPUT);
  const text = JSON.stringify(result);

  assert.match(result.summary, /新能源汽车品牌介绍/);
  assert.match(result.summary, /10/);
  assert.ok(result.explicit_requirements.some(item => /核心车型矩阵/.test(item)));
  assert.ok(result.prohibitions.some(item => /不得编造/.test(item)));
  assert.doesNotMatch(text, /已实现|市场份额为|销量达到/);
});

test("disabled local model returns usable clarifying questions as an honest fallback", async () => {
  const result = await runLocalPlanningProfile({
    ...INPUT,
    planning_profile: "clarifying_questions"
  }, {
    env: { LOCAL_MODEL_ENABLED: "false" }
  });

  assert.equal(result.used, false);
  assert.equal(result.content_used, false);
  assert.equal(result.fallback_used, true);
  assert.equal(result.status, "fallback");
  assert.ok(result.questions.length >= 3);
});

test("model transport failure returns a usable deterministic summary instead of an empty stage", async () => {
  let calls = 0;
  const result = await runLocalPlanningProfile({
    ...INPUT,
    planning_profile: "requirements_summary"
  }, {
    config: {
      enabled: true,
      provider: "openai-compatible",
      modelId: "local-model",
      endpoint: "http://127.0.0.1:1234/v1/chat/completions",
      apiKey: "",
      timeoutMs: 100,
      supportsJsonSchema: false,
      maxRepairAttempts: 1
    },
    fetchImpl: async () => {
      calls += 1;
      throw new Error("offline");
    }
  });

  assert.equal(calls, 1);
  assert.equal(result.status, "fallback");
  assert.equal(result.used, false);
  assert.equal(result.fallback_used, true);
  assert.ok(result.summary);
  assert.ok(Array.isArray(result.explicit_requirements));
});

test("invalid JSON in all three model stages still yields a complete fallback deck", async () => {
  const config = {
    enabled: true,
    provider: "openai-compatible",
    modelId: "local-model",
    endpoint: "http://127.0.0.1:1234/v1/chat/completions",
    apiKey: "",
    timeoutMs: 5_000,
    supportsJsonSchema: false,
    maxRepairAttempts: 1
  };
  const invalidResponse = async () => new Response(JSON.stringify({
    choices: [{ message: { content: "not valid model JSON" } }]
  }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });

  const questions = await runLocalPlanningProfile({
    ...INPUT,
    planning_profile: "clarifying_questions"
  }, { config, fetchImpl: invalidResponse });
  const summary = await runLocalPlanningProfile({
    ...INPUT,
    planning_profile: "requirements_summary"
  }, { config, fetchImpl: invalidResponse });
  const final = await runResultFirstPipeline(INPUT, {
    planWithLocalModelFn: async () => ({
      analysis: null,
      metadata: {
        enabled: true,
        used: false,
        status: "fallback",
        model_id: "local-model",
        reason_code: "INVALID_MODEL_JSON",
        content_used: false,
        repair_attempted: true,
        repaired: false,
        fallback_used: true,
        planning_rejection_reason: "REPAIR_INVALID_MODEL_JSON"
      }
    })
  });

  assert.equal(questions.status, "fallback");
  assert.ok(questions.questions.length >= 3);
  assert.equal(summary.status, "fallback");
  assert.ok(summary.summary.length > 0);
  assert.equal(final.http_status, 200);
  assert.equal(final.response.success, true);
  assert.equal(final.response.quality_status, "fallback");
  assert.equal(final.response.slides.length, 10);
  assert.ok(final.response.customer_version.length > 100);
  assert.ok(final.response.production_version.length > 100);
  assert.deepEqual(final.response.source_summary, {
    model_attempted: true,
    model_used: false,
    model_id: "local-model",
    model_content_retained: false,
    deterministic_completion_used: true,
    fallback_used: true
  });
});
