import assert from "node:assert/strict";
import { test } from "node:test";

import { compileSemanticObligation } from "../lib/semantic-obligation-compiler.js";

const BUDGET = { max_chars: 88 };

function compile(type, componentValues, options = {}) {
  return compileSemanticObligation({
    fulfillmentPolicy: options.policy || "safe_rephrase_allowed",
    semanticContract: {
      version: 1,
      type,
      aggregation: "all_of",
      same_block: true,
      required_components: options.requiredComponents || Object.keys(componentValues),
      component_values: componentValues
    },
    sourceEvidence: options.sourceEvidence || [],
    sectionContext: { section_id: options.sectionId || "content" },
    budget: options.budget || BUDGET
  });
}

test("v2.3.15 compiler expresses multiple objects and their relation without a label branch", () => {
  const result = compile("objects_relation", {
    subject: "方案",
    objects: ["监测终端", "分析平台"],
    relations: ["配置"],
    outcome: "共同构成业务支撑体系"
  });

  assert.equal(result.status, "compiled");
  assert.match(result.text, /方案.*配置.*监测终端.*分析平台.*共同构成业务支撑体系/);
  assert.deepEqual(result.consumedComponents, ["subject", "objects", "relations", "outcome"]);
});

test("v2.3.15 compiler keeps actor action and business object in one content block", () => {
  const result = compile("actor_action_object", {
    actors: ["合作双方"],
    actions: ["共同策划"],
    objects: ["体验活动"]
  });

  assert.equal(result.status, "compiled");
  assert.match(result.text, /合作方.*共同策划.*体验活动/);
  assert.equal(result.contentBlock, "single_bullet");
});

test("v2.3.15 compiler frames measurable value categories as potential evaluation rather than achieved facts", () => {
  const result = compile("actor_action_value", {
    actors: ["合作双方"],
    actions: ["共同评估"],
    measurable_value_categories: ["品牌曝光", "运营增益"]
  });

  assert.equal(result.status, "compiled");
  assert.match(result.text, /合作方.*共同评估.*品牌曝光.*运营增益.*潜在.*待确认/);
  assert.doesNotMatch(result.text, /已经|已实现|已获得/);
});

test("v2.3.15 compiler preserves every ordered step in one block", () => {
  const steps = ["需求确认", "现场调研", "资料补充", "方案评估", "合作确认"];
  const result = compile("ordered_steps", { ordered_steps: steps });

  assert.equal(result.status, "compiled");
  assert.ok(steps.every(step => result.text.includes(step)));
  assert.ok(steps.every((step, index) => index === 0 || result.text.indexOf(steps[index - 1]) < result.text.indexOf(step)));
});

test("v2.3.15 compiler uses a transparent boundary when responsibility identities are unconfirmed", () => {
  const result = compile("responsibility_target_next_action", {
    responsibilities: ["责任主体"],
    targets: ["合作对象"],
    next_actions: ["推进方案确认"],
    identities_confirmed: false
  });

  assert.equal(result.status, "compiled");
  assert.match(result.text, /责任主体.*合作对象.*待双方确认.*推进方案确认/);
  assert.doesNotMatch(result.text, /某公司|某团队|负责人张/);
});

test("v2.3.15 compiler emits an exact confirmed fact only with traceable evidence", () => {
  const result = compile("exact_confirmed_fact", { source_ids: ["source-001"] }, {
    policy: "exact_source_required",
    sourceEvidence: [{
      source_id: "source-001",
      fragment_id: "fragment-001",
      excerpt: "项目地点：华南区域",
      polarity: "positive",
      assertion_type: "explicit_confirmed_fact"
    }]
  });

  assert.equal(result.status, "compiled");
  assert.equal(result.text, "项目地点：华南区域");
  assert.equal(result.sourceType, "confirmed_fact");
  assert.deepEqual(result.sourceRefs, [{ source_id: "source-001", fragment_id: "fragment-001" }]);
});

test("v2.3.15 compiler fails closed for missing fact evidence, narrative policy, shell text, and budget overflow", () => {
  const missingFact = compile("exact_confirmed_fact", { source_ids: ["missing"] }, {
    policy: "exact_source_required"
  });
  const narrative = compile("objects_relation", {
    subject: "方案",
    objects: ["清晰叙事"],
    relations: ["采用"]
  }, { policy: "narrative_only" });
  const shell = compile("actor_action_object", {
    actors: ["必须说明合作主体"],
    actions: ["共同策划"],
    objects: ["体验活动"]
  });
  const overflow = compile("ordered_steps", {
    ordered_steps: ["第一阶段安排一段非常长的流程说明", "第二阶段安排另一段非常长的流程说明"]
  }, { budget: { max_chars: 12 } });

  assert.equal(missingFact.reasonCode, "EXACT_SOURCE_NOT_FOUND");
  assert.equal(narrative.reasonCode, "NARRATIVE_ONLY_NOT_FULFILLABLE");
  assert.equal(shell.reasonCode, "INSTRUCTION_SHELL_COMPONENT");
  assert.equal(overflow.reasonCode, "SEMANTIC_OBLIGATION_BUDGET_EXCEEDED");
});
