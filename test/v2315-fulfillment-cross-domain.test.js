import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { fulfillPlannerRequirements } from "../lib/requirement-fulfillment.js";
import {
  createRequirementBindings,
  validatePlannerRequirementBindings
} from "../lib/requirement-binding.js";

test("v2.3.15 enterprise profile uses traceable confirmed facts and refuses an unsourced company fact", () => {
  const plan = [atomicPlan("企业名称：远航科技", "企业名称：远航科技", "background", {
    sourceField: "confirmed_fact",
    sourceRefs: [{ source_id: "client_materials-enterprise", fragment_id: "enterprise-name" }]
  })];
  const supported = scenario(plan, [{ section_id: "background", key_message: "企业概况。", bullets: [] }], {
    confirmedFacts: [{
      source_id: "client_materials-enterprise",
      fragment_id: "enterprise-name",
      excerpt: "企业名称：远航科技",
      assertion_type: "explicit_confirmed_fact",
      polarity: "positive"
    }]
  });
  const unsupported = scenario(plan, [{ section_id: "background", key_message: "企业概况。", bullets: [] }]);

  assert.equal(supported.validation.valid, true);
  assert.match(supported.analysis.sections[0].bullets[0], /企业名称：远航科技/);
  assert.equal(unsupported.validation.valid, false);
  assert.equal(unsupported.diagnostics.unresolved[0].reason_code, "EXACT_SOURCE_NOT_FOUND");
  assert.doesNotMatch(JSON.stringify(unsupported.analysis), /远航科技/);
});

test("v2.3.15 product solution compiles two objects and one relation without inventing models", () => {
  const result = scenario([
    atomicPlan("方案采用监测终端和分析平台。", "监测终端和分析平台", "architecture")
  ], [{ section_id: "architecture", key_message: "系统分层建设。", bullets: ["监测终端负责采集。", "分析平台负责处理。"] }]);

  assert.equal(result.validation.valid, true);
  assert.match(result.analysis.sections[0].bullets.at(-1), /方案采用监测终端与分析平台/);
  assert.doesNotMatch(result.analysis.sections[0].bullets.at(-1), /型号|品牌|领先|顶级/);
});

test("v2.3.15 activity proposal handles multiple split residuals in one section without cross-block matching", () => {
  const result = scenario([
    atomicPlan("合作机构共同策划营销活动。", "活动合作", "model"),
    atomicPlan("合作机构共同评估品牌曝光与运营增益。", "合作价值", "model")
  ], [{
    section_id: "model",
    key_message: "合作方向待细化。",
    bullets: ["合作机构负责沟通。", "共同策划执行方案。", "营销活动按计划推进。"]
  }]);

  assert.equal(result.validation.valid, true);
  assert.equal(result.diagnostics.generated_bullet_count, 1);
  assert.equal(result.records.length, 2);
  assert.match(result.analysis.sections[0].bullets.at(-1), /合作机构.*共同策划.*营销活动/);
  assert.match(result.analysis.sections[0].bullets.at(-1), /品牌曝光.*运营增益/);
});

test("v2.3.15 business plan keeps potential value separate from an unavailable confirmed financial fact", () => {
  const value = scenario([
    atomicPlan("渠道方共同评估获客与收入潜力。", "合作价值", "value")
  ], [{ section_id: "value", key_message: "价值方向仍需验证。", bullets: [] }]);
  const fact = scenario([
    atomicPlan("年度收入：5000万元", "年度收入：5000万元", "value", {
      sourceField: "confirmed_fact",
      sourceRefs: [{ source_id: "missing-financial-source" }]
    })
  ], [{ section_id: "value", key_message: "财务表现。", bullets: [] }]);

  assert.equal(value.validation.valid, true);
  assert.match(value.analysis.sections[0].bullets[0], /潜在合作价值.*具体结果待确认/);
  assert.doesNotMatch(value.analysis.sections[0].bullets[0], /5000|已实现|确定收入/);
  assert.equal(fact.validation.valid, false);
  assert.doesNotMatch(JSON.stringify(fact.analysis), /5000万元/);
});

test("v2.3.15 implementation plan emits one ordered path block plus a transparent responsibility block", () => {
  const path = {
    original_requirement: "必须给出从需求确认、现场调研、资料补充、方案评审到实施确认的完整流程。",
    atomic_requirements: ["需求确认", "现场调研", "资料补充", "方案评审", "实施确认"].map(label => ({ label })),
    section_id: "plan",
    source_field: "must_include"
  };
  const responsibility = atomicPlan(
    "责任主体、合作对象和下一步推进安排尚未确认。",
    "责任主体或合作对象",
    "plan"
  );
  const result = scenario([path, responsibility], [{
    section_id: "plan",
    key_message: "实施路径待展开。",
    bullets: ["需求确认后进入实施准备。"]
  }]);

  assert.equal(result.validation.valid, true);
  assert.equal(result.analysis.sections[0].bullets.filter(item => /需求确认.*现场调研.*资料补充.*方案评审.*实施确认/.test(item)).length, 1);
  assert.ok(result.analysis.sections[0].bullets.some(item => /责任主体.*合作对象.*待双方确认/.test(item)));
  assert.equal(result.records.length, 6);
});

test("v2.3.15 racing case stays contract-driven and does not pollute other domain outputs", () => {
  const racing = scenario([
    atomicPlan("项目计划采用专业直驱模拟器和沉浸式显示设备。", "专业直驱模拟器和沉浸式显示设备", "architecture"),
    atomicPlan("活动运营方共同举办赛事与体验活动。", "活动合作", "model")
  ], [
    { section_id: "architecture", key_message: "体验硬件分层配置。", bullets: [] },
    { section_id: "model", key_message: "活动机制待细化。", bullets: [] }
  ]);
  const product = scenario([
    atomicPlan("方案采用传感模块和管理控制台。", "传感模块和管理控制台", "architecture")
  ], [{ section_id: "architecture", key_message: "产品架构。", bullets: [] }]);
  const implementationSources = [
    readFileSync(new URL("../lib/requirement-fulfillment.js", import.meta.url), "utf8"),
    readFileSync(new URL("../lib/semantic-obligation-compiler.js", import.meta.url), "utf8")
  ].join("\n");

  assert.equal(racing.validation.valid, true);
  assert.equal(product.validation.valid, true);
  assert.doesNotMatch(JSON.stringify(product.analysis), /赛车|星驰|直驱模拟器|沉浸式显示设备|赛事/);
  assert.doesNotMatch(implementationSources, /星驰GT|赛车体验中心|专业直驱模拟器|沉浸式显示设备/);
});

function atomicPlan(original, label, sectionId, options = {}) {
  return {
    original_requirement: original,
    atomic_requirements: [{ label, ...(options.sourceRefs ? { source_refs: options.sourceRefs } : {}) }],
    section_id: sectionId,
    source_field: options.sourceField || "must_include"
  };
}

function scenario(plans, sections, options = {}) {
  const sectionIds = [...new Set(sections.map(item => item.section_id))];
  const bindings = createRequirementBindings(plans, sectionIds, options.requestScopeId || "cross-domain");
  const analysis = {
    sections: structuredClone(sections),
    requirement_bindings: bindings.map(parent => ({
      requirement_id: parent.requirement_id,
      atomic_requirements: parent.atomic_requirements.map(atomic => ({
        requirement_id: atomic.requirement_id,
        canonical_section_id: atomic.canonical_section_id
      }))
    }))
  };
  return fulfillPlannerRequirements({
    analysis,
    requirementBindings: bindings,
    validation: validatePlannerRequirementBindings(analysis, bindings),
    confirmedFacts: options.confirmedFacts || [],
    delivery: { maxContentPoints: 5 },
    requestScopeId: options.requestScopeId || "cross-domain"
  });
}
