import assert from "node:assert/strict";
import { test } from "node:test";

import { fulfillPlannerRequirements } from "../lib/requirement-fulfillment.js";
import {
  createRequirementBindings,
  validatePlannerRequirementBindings
} from "../lib/requirement-binding.js";

function plan(original, label, sectionId, options = {}) {
  return {
    original_requirement: original,
    atomic_requirements: [{
      label,
      ...(options.sourceRefs ? { source_refs: options.sourceRefs } : {})
    }],
    section_id: sectionId,
    source_field: options.sourceField || "must_include"
  };
}

function bindingsFor(plans, sections) {
  return createRequirementBindings(plans, sections, "fulfillment-engine");
}

function modelBindings(bindings) {
  return bindings.map(parent => ({
    requirement_id: parent.requirement_id,
    atomic_requirements: parent.atomic_requirements.map(atomic => ({
      requirement_id: atomic.requirement_id,
      canonical_section_id: atomic.canonical_section_id
    }))
  }));
}

function analysisFor(bindings, sections) {
  return {
    sections: structuredClone(sections),
    requirement_bindings: modelBindings(bindings)
  };
}

function runFulfillment(analysis, bindings, options = {}) {
  return fulfillPlannerRequirements({
    analysis,
    requirementBindings: bindings,
    validation: validatePlannerRequirementBindings(analysis, bindings),
    confirmedFacts: options.confirmedFacts || [],
    delivery: options.delivery || { maxContentPoints: 5 },
    requestScopeId: "fulfillment-engine"
  });
}

test("v2.3.15 fulfillment is a no-op when Qwen already satisfies every atomic", () => {
  const bindings = bindingsFor([
    plan("方案必须配置监测终端与分析平台。", "监测终端与分析平台", "architecture")
  ], ["architecture"]);
  const analysis = analysisFor(bindings, [{
    section_id: "architecture",
    key_message: "方案配置监测终端与分析平台。",
    bullets: ["方案配置监测终端与分析平台。"]
  }]);

  const result = runFulfillment(analysis, bindings);
  assert.equal(result.diagnostics.attempted, false);
  assert.equal(result.records.length, 0);
  assert.deepEqual(result.analysis, analysis);
  assert.equal(result.validation.valid, true);
});

test("v2.3.15 fulfillment adds one complete same-block bullet when model content is split", () => {
  const bindings = bindingsFor([
    plan(
      "项目计划采用专业直驱模拟器和沉浸式显示设备。",
      "专业直驱模拟器和沉浸式显示设备",
      "architecture"
    )
  ], ["architecture"]);
  const analysis = analysisFor(bindings, [{
    section_id: "architecture",
    key_message: "体验硬件分层配置。",
    bullets: ["项目采用专业直驱模拟器。", "沉浸式显示设备用于视觉呈现。"]
  }]);

  const result = runFulfillment(analysis, bindings);
  assert.equal(result.validation.valid, true);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].origin, "deterministic_requirement_fulfillment");
  assert.equal(result.analysis.sections[0].bullets.length, 3);
  assert.match(result.analysis.sections[0].bullets[2], /项目.*采用.*专业直驱模拟器.*沉浸式显示设备/);
  assert.deepEqual(result.analysis.sections[0].bullets.slice(0, 2), analysis.sections[0].bullets);
});

test("v2.3.15 fulfillment handles all compatible residual atomics in one compound bullet", () => {
  const bindings = bindingsFor([
    plan("合作双方共同策划培训活动。", "活动合作", "model"),
    plan("合作双方共同评估品牌曝光与运营增益。", "合作价值", "model")
  ], ["model"]);
  const analysis = analysisFor(bindings, [{
    section_id: "model",
    key_message: "合作模式仍需细化。",
    bullets: ["合作双方将建立沟通机制。"]
  }]);

  const result = runFulfillment(analysis, bindings);
  assert.equal(result.validation.valid, true);
  assert.equal(result.records.length, 2);
  assert.equal(new Set(result.records.map(item => item.content_item_key)).size, 1);
  assert.equal(result.diagnostics.per_section[0].generated_bullet_count, 1);
  assert.match(result.analysis.sections[0].bullets[1], /培训活动/);
  assert.match(result.analysis.sections[0].bullets[1], /品牌曝光.*运营增益/);
});

test("v2.3.15 fulfillment fails closed when an exact fact source cannot be resolved", () => {
  const bindings = bindingsFor([
    plan("项目地点：华南区域", "项目地点：华南区域", "background", {
      sourceField: "confirmed_fact",
      sourceRefs: [{ source_id: "source-missing", fragment_id: "fragment-missing" }]
    })
  ], ["background"]);
  const analysis = analysisFor(bindings, [{
    section_id: "background",
    key_message: "项目背景信息。",
    bullets: ["地点信息尚未写入。"]
  }]);

  const result = runFulfillment(analysis, bindings);
  assert.equal(result.validation.valid, false);
  assert.equal(result.records.length, 0);
  assert.equal(result.diagnostics.unresolved[0].reason_code, "EXACT_SOURCE_NOT_FOUND");
  assert.deepEqual(result.analysis, analysis);
});

test("v2.3.15 fulfillment is idempotent and preserves section identity and page count", () => {
  const bindings = bindingsFor([
    plan("合作机构共同策划培训活动。", "活动合作", "model")
  ], ["model"]);
  const analysis = analysisFor(bindings, [{
    section_id: "model",
    key_message: "合作方向清晰。",
    bullets: ["合作机构建立常态沟通。"]
  }]);

  const first = runFulfillment(analysis, bindings);
  const second = runFulfillment(first.analysis, bindings);
  assert.equal(first.validation.valid, true);
  assert.equal(second.records.length, 0);
  assert.deepEqual(second.analysis, first.analysis);
  assert.deepEqual(second.analysis.sections.map(item => item.section_id), analysis.sections.map(item => item.section_id));
});

test("v2.3.15 fulfillment rejects a patch that cannot fit the remaining page budget", () => {
  const bindings = bindingsFor([
    plan("合作机构共同策划培训活动。", "活动合作", "model")
  ], ["model"]);
  const analysis = analysisFor(bindings, [{
    section_id: "model",
    key_message: "核心结论".repeat(24),
    bullets: [
      "第一条既有模型内容必须保留。",
      "第二条既有模型内容必须保留。",
      "第三条既有模型内容必须保留。"
    ]
  }]);

  const result = runFulfillment(analysis, bindings, { delivery: { maxContentPoints: 3 } });
  assert.equal(result.validation.valid, false);
  assert.equal(result.records.length, 0);
  assert.equal(result.diagnostics.unresolved[0].reason_code, "REQUIREMENT_FULFILLMENT_BUDGET_EXCEEDED");
  assert.deepEqual(result.analysis, analysis);
});
