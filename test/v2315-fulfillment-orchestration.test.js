import assert from "node:assert/strict";
import { test } from "node:test";

import { applyRequirementFulfillment } from "../lib/generate-outline.js";
import { planWithLocalModel } from "../lib/local-model-planner.js";
import { createRequirementBindings } from "../lib/requirement-binding.js";

const TEST_ENV = {
  LOCAL_MODEL_ENABLED: "true",
  LOCAL_MODEL_REQUIRED: "false",
  OPENWEBUI_API_KEY: "test-key",
  OPENWEBUI_BASE_URL: "http://127.0.0.1:8080",
  LOCAL_MODEL_ID: "test-planner"
};

test("v2.3.15 preserves an incomplete model candidate without spending a second model call", async () => {
  const context = plannerContext();
  let calls = 0;
  const result = await planWithLocalModel({ requirement: "商务合作方案" }, context, {
    env: TEST_ENV,
    fetchImpl: async () => {
      calls += 1;
      return modelResponse(analysisFor(context, { equipment: false, activity: false, marker: calls === 1 ? "initial" : "repair" }));
    }
  });

  assert.equal(calls, 1);
  assert.equal(result.analysis?.sections?.length, 3);
  assert.equal(result.analysis.sections[0].objective, "initial");
  assert.equal(result.fulfillment_candidate, undefined);
  assert.equal(result.metadata.repair_attempted, false);
  assert.equal(result.metadata.fallback_used, false);
});

test("v2.3.15 leaves missing atomics to deterministic completion instead of model retries", async () => {
  const context = plannerContext();
  let calls = 0;
  const result = await planWithLocalModel({ requirement: "商务合作方案" }, context, {
    env: TEST_ENV,
    fetchImpl: async () => {
      calls += 1;
      return modelResponse(calls === 1
        ? analysisFor(context, { equipment: false, activity: false, marker: "initial" })
        : analysisFor(context, { equipment: true, activity: false, marker: "repair" }));
    }
  });

  assert.equal(calls, 1);
  assert.equal(result.analysis.sections[0].objective, "initial");
  assert.equal(result.metadata.repair_attempted, false);
  assert.equal(result.metadata.fallback_used, false);
});

test("v2.3.15 never exposes a structurally invalid response as a fulfillment candidate", async () => {
  const context = plannerContext();
  let calls = 0;
  const result = await planWithLocalModel({ requirement: "商务合作方案" }, context, {
    env: TEST_ENV,
    fetchImpl: async () => {
      calls += 1;
      const invalid = analysisFor(context, { equipment: false, activity: false, marker: "invalid" });
      invalid.sections[1].section_id = "architecture";
      return modelResponse(invalid);
    }
  });

  assert.equal(calls, 1);
  assert.equal(result.fulfillment_candidate, undefined);
  assert.equal(result.metadata.repair_attempted, false);
});

test("v2.3.15 orchestration accepts only a candidate that passes post-fulfillment binding validation", () => {
  const context = plannerContext();
  const candidate = analysisFor(context, { equipment: false, activity: false, marker: "candidate" });
  const result = applyRequirementFulfillment({
    analysis: null,
    fulfillment_candidate: candidate,
    metadata: {
      enabled: true,
      used: true,
      status: "used",
      fallback_used: false,
      content_used: false,
      repair_attempted: true,
      repaired: false,
      planning_rejection_reason: "REPAIR_REQUIREMENT_BINDING_CONTENT_MISSING"
    }
  }, context);

  assert.equal(result.analysis?.sections?.length, 3);
  assert.equal(result.fulfillment.validation.valid, true);
  assert.equal(result.fulfillment.records.length, 2);
  assert.equal(result.metadata.fallback_used, false);
  assert.equal(result.metadata.planning_rejection_reason, undefined);
  assert.equal(result.metadata.requirement_fulfillment_applied, true);
});

test("accepted model analysis is safely completed without requiring internal binding echoes", () => {
  const context = plannerContext();
  const candidate = analysisFor(context, { equipment: false, activity: false, marker: "direct-model" });
  candidate.requirement_bindings = [];
  const result = applyRequirementFulfillment({
    analysis: candidate,
    metadata: {
      enabled: true,
      used: true,
      status: "used",
      fallback_used: false,
      content_used: false
    }
  }, context);

  assert.equal(result.analysis?.sections?.length, 3);
  assert.equal(result.fulfillment.validation.valid, true);
  assert.equal(result.fulfillment.records.length, 2);
  assert.ok(result.fulfillment.records.every(item => item.origin === "deterministic_requirement_fulfillment"));
  assert.equal(result.metadata.fallback_used, false);
  assert.equal(result.metadata.requirement_fulfillment_applied, true);
});

function plannerContext() {
  const sections = ["architecture", "model", "closing"];
  const requiredSectionPlan = [
    {
      original_requirement: "项目计划采用监测终端和分析平台。",
      atomic_requirements: [{ label: "监测终端和分析平台" }],
      section_id: "architecture",
      source_field: "must_include"
    },
    {
      original_requirement: "合作机构共同策划体验活动。",
      atomic_requirements: [{ label: "活动合作" }],
      section_id: "model",
      source_field: "must_include"
    }
  ];
  return {
    type: { id: "project_plan", label: "项目方案", base: sections, extensions: [], recipes: {} },
    pageCount: 3,
    requestedPageCount: 3,
    manualPageCount: true,
    requiredSections: requiredSectionPlan.map(item => item.original_requirement),
    requiredSectionPlan,
    requirementBindings: createRequirementBindings(requiredSectionPlan, sections, "req_fulfillment_orchestration"),
    requestScopeId: "req_fulfillment_orchestration",
    materialContext: { fragments: [] },
    delivery: { maxContentPoints: 5 },
    confirmedFacts: []
  };
}

function analysisFor(context, { equipment, activity, marker }) {
  const sections = [
    {
      section_id: "architecture",
      title: "系统架构",
      role: "background",
      objective: marker,
      key_message: equipment ? "项目采用监测终端和分析平台。" : "说明系统方向。",
      bullets: ["保持业务边界。"],
      visual_direction: "定位图",
      evidence_status: "framework_only"
    },
    {
      section_id: "model",
      title: "合作模式",
      role: "analysis",
      objective: marker,
      key_message: "合作机制仍需细化。",
      bullets: activity ? ["合作方共同策划体验活动。"] : ["合作方建立沟通机制。"],
      visual_direction: "关系图",
      evidence_status: "framework_only"
    },
    {
      section_id: "closing",
      title: "下一步",
      role: "action",
      objective: marker,
      key_message: "明确后续安排。",
      bullets: ["进入下一轮沟通。"],
      visual_direction: "路径图",
      evidence_status: "framework_only"
    }
  ];
  return {
    recommended_page_count: 3,
    sections,
    requirement_bindings: context.requirementBindings.map(parent => ({
      requirement_id: parent.requirement_id,
      atomic_requirements: parent.atomic_requirements.map(atomic => ({
        requirement_id: atomic.requirement_id,
        canonical_section_id: atomic.canonical_section_id
      }))
    }))
  };
}

function modelResponse(analysis) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(analysis) } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
