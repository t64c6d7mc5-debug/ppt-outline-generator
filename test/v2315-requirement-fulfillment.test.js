import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createRequirementBindings,
  validatePlannerRequirementBindings
} from "../lib/requirement-binding.js";

function requirementPlan({
  sourceField = "must_include",
  label = "项目定位",
  atomic = {}
} = {}) {
  return [{
    original_requirement: `必须说明${label}`,
    atomic_requirements: [{ label, ...atomic }],
    constraints: [],
    page_constraint: null,
    aggregation: "all_of",
    section_id: "content",
    source_field: sourceField
  }];
}

test("v2.3.15 derives safe rephrase policy on the server and ignores a client policy override", () => {
  const bindings = createRequirementBindings(requirementPlan({
    atomic: {
      fulfillment_policy: "exact_source_required",
      fulfillment_policy_schema_version: 999
    }
  }), ["content"], "policy-safe");

  const atomic = bindings[0].atomic_requirements[0];
  assert.equal(atomic.fulfillment_policy_schema_version, 1);
  assert.equal(atomic.fulfillment_policy, "safe_rephrase_allowed");
  assert.equal(atomic.source_refs.length, 0);
  assert.equal(atomic.semantic_contract.version, 1);
});

test("v2.3.15 derives exact-source policy only from a confirmed-fact source with traceable refs", () => {
  const bindings = createRequirementBindings(requirementPlan({
    sourceField: "confirmed_fact",
    label: "项目地点：华南区域",
    atomic: {
      source_refs: [{ source_id: "client-materials-001", fragment_id: "fragment-001" }]
    }
  }), ["content"], "policy-fact");

  const atomic = bindings[0].atomic_requirements[0];
  assert.equal(atomic.fulfillment_policy, "exact_source_required");
  assert.equal(atomic.semantic_contract.type, "exact_confirmed_fact");
  assert.deepEqual(atomic.source_refs, [{ source_id: "client-materials-001", fragment_id: "fragment-001" }]);
});

test("v2.3.15 derives narrative-only policy only from an explicitly narrative source field", () => {
  const bindings = createRequirementBindings(requirementPlan({
    sourceField: "narrative_preference",
    label: "采用克制、专业的叙事语气"
  }), ["content"], "policy-narrative");

  assert.equal(bindings[0].atomic_requirements[0].fulfillment_policy, "narrative_only");
});

test("v2.3.15 fails closed when an internal expected binding lacks explicit fulfillment policy", () => {
  const expectedBindings = [{
    requirement_id: "req_legacy_0",
    atomic_requirements: [{
      requirement_id: "req_legacy_0_0",
      label: "项目定位",
      canonical_section_id: "content"
    }]
  }];
  const analysis = {
    requirement_bindings: [{
      requirement_id: "req_legacy_0",
      atomic_requirements: [{ requirement_id: "req_legacy_0_0", canonical_section_id: "content" }]
    }],
    sections: [{
      section_id: "content",
      key_message: "项目定位清晰",
      bullets: ["项目定位清晰"]
    }]
  };

  const result = validatePlannerRequirementBindings(analysis, expectedBindings);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "REQUIREMENT_FULFILLMENT_POLICY_INVALID");
});

test("v2.3.15 fails closed when exact-source policy has no traceable source", () => {
  const bindings = createRequirementBindings(requirementPlan({
    sourceField: "confirmed_fact",
    label: "项目地点：华南区域"
  }), ["content"], "policy-fact-missing-source");
  const analysis = {
    requirement_bindings: bindings.map(parent => ({
      requirement_id: parent.requirement_id,
      atomic_requirements: parent.atomic_requirements.map(atomic => ({
        requirement_id: atomic.requirement_id,
        canonical_section_id: atomic.canonical_section_id
      }))
    })),
    sections: [{
      section_id: "content",
      key_message: "项目地点位于华南区域",
      bullets: ["项目地点位于华南区域"]
    }]
  };

  const result = validatePlannerRequirementBindings(analysis, bindings);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "REQUIREMENT_FULFILLMENT_POLICY_INVALID");
});

test("v2.3.15 derives generic semantic contracts at binding creation", () => {
  const plans = [{
    original_requirement: "方案必须配置监测终端与分析平台。",
    atomic_requirements: [{ label: "监测终端与分析平台" }],
    section_id: "architecture",
    source_field: "must_include"
  }, {
    original_requirement: "合作机构共同策划培训活动。",
    atomic_requirements: [{ label: "培训活动合作" }],
    section_id: "model",
    source_field: "must_include"
  }, {
    original_requirement: "合作双方共同评估品牌曝光与运营增益。",
    atomic_requirements: [{ label: "合作价值" }],
    section_id: "value",
    source_field: "must_include"
  }, {
    original_requirement: "必须给出从需求确认、现场调研、资料补充、方案评估到合作确认的完整路径。",
    atomic_requirements: ["需求确认", "现场调研", "资料补充", "方案评估", "合作确认"].map(label => ({ label })),
    section_id: "plan",
    source_field: "must_include"
  }, {
    original_requirement: "最后一页必须说明责任主体、合作对象及下一步动作。",
    atomic_requirements: [{ label: "责任主体或合作对象" }],
    section_id: "closing",
    source_field: "must_include"
  }];

  const bindings = createRequirementBindings(plans, ["architecture", "model", "value", "plan", "closing"], "semantic-contracts");
  const atomics = bindings.flatMap(parent => parent.atomic_requirements);

  assert.equal(atomics[0].semantic_contract.type, "objects_relation");
  assert.deepEqual(atomics[0].semantic_contract.component_values.objects, ["监测终端", "分析平台"]);
  assert.equal(atomics[1].semantic_contract.type, "actor_action_object");
  assert.deepEqual(atomics[1].semantic_contract.component_values.objects, ["培训活动"]);
  assert.equal(atomics[2].semantic_contract.type, "actor_action_value");
  assert.deepEqual(atomics[2].semantic_contract.component_values.measurable_value_categories, ["品牌曝光", "运营增益"]);
  assert.ok(atomics.slice(3, 8).every(atomic => atomic.semantic_contract.type === "ordered_steps"));
  assert.deepEqual(atomics[3].semantic_contract.component_values.ordered_steps, ["需求确认", "现场调研", "资料补充", "方案评估", "合作确认"]);
  assert.equal(atomics[8].semantic_contract.type, "responsibility_target_next_action");
});

test("v2.3.15 parent wording does not reclassify unrelated sibling atomics", () => {
  const plans = [{
    original_requirement: "必须介绍项目的目标用户、主要体验项目、空间功能、运营内容和合作价值。",
    atomic_requirements: ["目标用户", "主要体验项目", "空间功能", "运营内容", "合作价值"]
      .map(label => ({ label })),
    section_id: "content",
    source_field: "must_include"
  }];

  const bindings = createRequirementBindings(plans, ["audience", "service", "architecture", "value"], "parent-isolation");
  const atomics = bindings[0].atomic_requirements;
  const byLabel = new Map(atomics.map(atomic => [atomic.label, atomic.semantic_contract]));

  assert.equal(byLabel.get("合作价值").type, "actor_action_value");
  for (const label of ["目标用户", "主要体验项目", "空间功能", "运营内容"]) {
    assert.notEqual(byLabel.get(label).type, "actor_action_value");
  }
});

test("v2.3.15 objects-relation contracts keep relation verbs out of object names", () => {
  const plans = [{
    original_requirement: "项目计划采用专业直驱模拟器和沉浸式显示设备。",
    atomic_requirements: [{ label: "项目计划采用专业直驱模拟器和沉浸式显示设备" }],
    section_id: "architecture",
    source_field: "must_include"
  }];

  const bindings = createRequirementBindings(plans, ["architecture"], "object-relation-normalization");
  const contract = bindings[0].atomic_requirements[0].semantic_contract;

  assert.equal(contract.type, "objects_relation");
  assert.deepEqual(contract.component_values.objects, ["专业直驱模拟器", "沉浸式显示设备"]);
  assert.deepEqual(contract.component_values.relations, ["采用"]);
});

test("v2.3.15 a standalone responsibility atomic does not invent a next-action contract", () => {
  const bindings = createRequirementBindings([{
    original_requirement: "必须明确责任主体或合作对象。",
    atomic_requirements: [{ label: "责任主体或合作对象" }],
    section_id: "closing",
    source_field: "must_include"
  }], ["closing"], "standalone-responsibility");

  const contract = bindings[0].atomic_requirements[0].semantic_contract;
  assert.notEqual(contract.type, "responsibility_target_next_action");
  assert.equal(contract.component_values.relations.length, 0);
});
