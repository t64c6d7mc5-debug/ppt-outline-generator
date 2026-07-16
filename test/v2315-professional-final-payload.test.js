import test from "node:test";
import assert from "node:assert/strict";
import { buildProfessionalRequest } from "../js/request-builders.js";
import { buildRequestAuthority, parseRequestContext } from "../lib/request-context.js";

const brief = {
  topic: "新能源汽车产品发布",
  pageCount: 8,
  scenario: "客户评审",
  style: "专业",
  purpose: "产品介绍",
  detailedPurpose: "推动试驾预约",
  purposeDetail: "推动试驾预约",
  audience: "汽车行业客户",
  materialDetails: "已确认核心车型、智能驾驶和电池技术",
  materials: ["有文字资料"],
  mustHave: "核心车型\n智能驾驶\n电池技术",
  riskPoints: "不编造销量",
  emphasis: "产品可信度",
  customHighlight: "安全验证",
  followAnswers: "客户重点关注安全验证",
  needScript: true,
  needImages: true,
  needLayouts: true,
  reference: "清晰商务风格",
  deadline: "待确认"
};

test("final professional payload preserves the full structured form and stage context", () => {
  const payload = buildProfessionalRequest(brief, {
    clarifyingQuestions: ["决策人最关心哪项验证？"],
    clarifyingAnswers: "客户重点关注安全验证",
    requirementsSummary: "目标是面向汽车行业客户介绍核心车型与电池技术并推动试驾预约。"
  });

  assert.equal(payload.mode, "professional");
  assert.equal(payload.planning_profile, "full_quality_outline");
  assert.equal("model_id" in payload, false);
  assert.equal(payload.must_include.length, 3);
  assert.equal(payload.must_include_rules.length, 3);
  assert.equal(payload.must_include_source_count, 3);
  assert.match(payload.client_materials, /核心车型/);
  assert.equal(payload.material_status, "有文字资料");
  assert.deepEqual(payload.clarifying_questions, ["决策人最关心哪项验证？"]);
  assert.equal(payload.clarifying_answers, "客户重点关注安全验证");
  assert.match(payload.requirements_summary, /推动试驾预约/);
  assert.equal(payload.desired_emphasis, "产品可信度");
  assert.equal(payload.detailed_emphasis, "安全验证");
  assert.deepEqual(payload.delivery_requirements, {
    include_speaker_notes: true,
    include_images: true,
    include_layouts: true,
    reference_style: "清晰商务风格",
    deadline: "待确认"
  });

  const context = parseRequestContext(payload, buildRequestAuthority(payload));
  assert.equal(context.mustInclude.length, 3);
  assert.equal(context.mustIncludeRules.length, 3);
  assert.ok(context.mustIncludeRuleDiagnostics);
  assert.ok(context.confirmedFacts.length > 0);
  assert.ok(context.requiredSectionSelectionDiagnostics);
  assert.equal(context.planningProfile, "full_quality_outline");
});

test("stage context cannot overwrite original must-have or risk fields", () => {
  const payload = buildProfessionalRequest(brief, {
    clarifyingQuestions: ["不要改写核心车型"],
    clarifyingAnswers: "摘要中的风险不能覆盖原始风险",
    requirementsSummary: "待确认摘要"
  });
  assert.deepEqual(payload.must_include, ["核心车型", "智能驾驶", "电池技术"]);
  assert.match(payload.excluded_content.join("\n"), /销量/);
  assert.match(payload.client_materials, /智能驾驶/);
});
