import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSimpleRequest, buildProfessionalRequest } from "../js/request-builders.js";
import { buildAllowedSectionCatalog, planWithLocalModel } from "../lib/local-model-planner.js";
import { buildRequestAuthority, parseRequestContext } from "../lib/request-context.js";

const ENV = {
  LOCAL_MODEL_ENABLED: "true",
  LOCAL_MODEL_REQUIRED: "false",
  OPENWEBUI_API_KEY: "test-key",
  OPENWEBUI_BASE_URL: "http://127.0.0.1:8080",
  LOCAL_MODEL_ID: "ppt-v02"
};

function contextFor(input) {
  const authority = buildRequestAuthority(input);
  const context = parseRequestContext(input, authority);
  assert.equal(context.error, undefined);
  return context;
}

function validAnalysis(context) {
  const ids = buildAllowedSectionCatalog(context).slice(0, 3);
  return {
    requirement_summary: context.requirement,
    audience: context.audience || "相关业务团队",
    purpose: context.purpose || "方案沟通",
    ppt_type: context.type.id,
    industry: context.industry.id,
    business_scenario: "业务说明",
    recommended_page_count: 3,
    sections: ids.map((section_id, index) => ({
      section_id,
      title: `页面${index + 1}`,
      role: index === 0 ? "cover" : "analysis",
      objective: "说明当前页面职责",
      key_message: `围绕${context.topic}说明页面重点`,
      bullets: ["说明可验证的业务内容"],
      visual_direction: "简洁结构图",
      evidence_status: "framework_only"
    })),
    requirement_bindings: [],
    ambiguities: [],
    warnings: []
  };
}

function modelResponse(analysis) {
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(analysis) } }]
  }), { status: 200, headers: { "content-type": "application/json" } });
}

async function runPlanner(input) {
  const context = contextFor(input);
  const calls = [];
  const result = await planWithLocalModel(input, context, {
    env: ENV,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), body: JSON.parse(options.body) });
      return modelResponse(validAnalysis(context));
    }
  });
  return { result, calls };
}

test("simple mode always attempts the local planner with a lightweight profile", async () => {
  const input = buildSimpleRequest({
    rawNeed: "制作一份客户沟通方案",
    materialsText: "",
    materialStatus: "只有一句话需求",
    styleChoice: "auto",
    purposeChoice: "auto",
    pageChoice: "3",
    deadline: ""
  }, { style: "简洁", purpose: "商业汇报", pageCount: 3 });

  const { result, calls } = await runPlanner(input);
  assert.equal(input.source_mode, "simple");
  assert.equal(input.planning_profile, "simple");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.model, "ppt-v02");
  const prompt = JSON.parse(calls[0].body.messages[1].content);
  assert.equal(prompt.planning_profile, "simple");
  assert.equal(prompt.profile_contract, "lightweight_outline");
  assert.equal(result.metadata.used, true);
  assert.equal(result.metadata.status, "used");
});

test("professional mode keeps the same local model route with the full profile", async () => {
  const input = buildProfessionalRequest({
    topic: "客户沟通方案",
    pageCount: 3,
    scenario: "汇报",
    style: "简洁",
    purpose: "商业汇报",
    audience: "管理层",
    materials: [],
    materialDetails: "",
    mustHave: "",
    riskPoints: ""
  });

  const { result, calls } = await runPlanner(input);
  assert.equal(input.source_mode, "professional");
  assert.equal(input.planning_profile, "full_quality_outline");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.model, "ppt-v02");
  const prompt = JSON.parse(calls[0].body.messages[1].content);
  assert.equal(prompt.planning_profile, "professional");
  assert.equal(prompt.profile_contract, "full_quality_outline");
  assert.equal(result.metadata.used, true);
  assert.equal(result.metadata.status, "used");
});

test("simple mode model failure is explicit and never masquerades as used", async () => {
  const input = buildSimpleRequest({
    rawNeed: "制作一份客户沟通方案",
    materialsText: "",
    materialStatus: "只有一句话需求",
    styleChoice: "auto",
    purposeChoice: "auto",
    pageChoice: "3",
    deadline: ""
  }, { style: "简洁", purpose: "商业汇报", pageCount: 3 });
  const context = contextFor(input);
  const result = await planWithLocalModel(input, context, {
    env: ENV,
    fetchImpl: async () => { throw new TypeError("offline test model unavailable"); }
  });
  assert.equal(result.metadata.used, false);
  assert.equal(result.metadata.status, "fallback");
  assert.equal(result.metadata.reason_code, "LOCAL_MODEL_UNAVAILABLE");
});
