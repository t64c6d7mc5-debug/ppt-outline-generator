import assert from "node:assert/strict";
import { test } from "node:test";
import { generateOutline } from "../lib/generate-outline.js";
import { buildNarrativePlan } from "../lib/narrative-planner.js";
import { adaptOutlineCandidate, finalizeOutlineForApi } from "../lib/output-adapter.js";
import { repairOutline } from "../lib/outline-repair.js";
import { scoreOutline } from "../lib/outline-scorer.js";
import { parseRequestContext } from "../lib/request-context.js";
import { resolveVisualType } from "../lib/visual-planner.js";

test("audience parsing separates research subjects from presentation audiences", () => {
  const cases = [
    ["向管理层汇报", "管理层与内部决策者", "internal_management"],
    ["面向董事会汇报", "董事会", "board"],
    ["给潜在客户介绍", "潜在客户", "prospective_customer"],
    ["用于内部项目评审", "内部项目评审者", "internal_review"],
    ["制作新能源汽车客户画像", "目标听众", "unspecified"],
    ["制作新能源汽车客户画像，用于向管理层汇报", "管理层与内部决策者", "internal_management"],
    ["分析客户流失原因，面向董事会汇报", "董事会", "board"],
    ["制作产品介绍，给潜在客户展示", "潜在客户", "prospective_customer"],
    ["制作管理层客户沟通培训材料", "管理层与客户沟通相关人员", "internal_training"]
  ];
  for (const [requirement, audience, intent] of cases) {
    const context = parseRequestContext({ requirement });
    assert.equal(context.audience, audience, requirement);
    assert.equal(context.audienceIntent, intent, requirement);
  }
});

test("explicit audience field has the highest priority", () => {
  const context = parseRequestContext({
    requirement: "分析客户流失原因，面向董事会汇报",
    purpose: "给潜在客户展示",
    audience: "集团审计委员会"
  });
  assert.equal(context.audience, "集团审计委员会");
  assert.equal(context.audienceSource, "explicit_field");
});

test("visual template IDs use complete tokens and keep roadmap, map, heatmap and mindmap distinct", () => {
  assert.equal(resolveVisualType({ kind: "ev-action-roadmap", role: "action", title: "业务建议与下一步" }), "roadmap");
  assert.equal(resolveVisualType({ kind: "map", sectionId: "geography", title: "城市分布与区域差异" }), "map");
  assert.equal(resolveVisualType({ kind: "heatmap", role: "analysis", title: "时段热力比较" }), "heatmap");
  assert.equal(resolveVisualType({ kind: "mindmap", role: "analysis", title: "议题关系梳理" }), "mindmap");
  assert.notEqual(resolveVisualType({ kind: "channel-map", role: "recommendation", title: "渠道建议", content: "按触点配置行动" }), "map");
});

test("a recommendation or action slide only permits a map for explicit geographic comparison", () => {
  assert.notEqual(resolveVisualType({
    kind: "map",
    role: "recommendation",
    title: "业务建议",
    content: "按优先级形成行动计划"
  }), "map");
  assert.equal(resolveVisualType({
    kind: "map",
    role: "recommendation",
    title: "区域策略建议",
    content: "比较不同城市覆盖与区域差异，使用分级图例"
  }), "map");
});

test("output adaptation is deterministic, side-effect free and reference isolated", async () => {
  const result = await generateOutline({ requirement: "园区招商方案", page_count: 7 });
  const source = internalSourceFromResult(result);
  const before = structuredClone(source);
  const first = adaptOutlineCandidate(source);
  const second = adaptOutlineCandidate(source);

  assert.deepEqual(source, before, "adapter must not mutate the internal outline");
  assert.deepEqual(first, second, "same input must produce deeply equal candidates");
  assert.notStrictEqual(first.slides, source.slides);
  assert.notStrictEqual(first.slides[0].visual_spec, source.slides[0].visual_spec);
  assert.ok(!Object.hasOwn(first, "quality_report"), "quality report must not participate in scoring");

  first.slides[0].visual_spec.layout = "mutated";
  first.slides[0].data_requirements.push("mutated");
  assert.notEqual(source.slides[0].visual_spec.layout, "mutated");
  assert.notEqual(second.slides[0].visual_spec.layout, "mutated");
  assert.ok(!source.slides[1].data_requirements.includes("mutated"));

  const final = finalizeOutlineForApi(second, result.quality_report);
  assert.ok(final.quality_report);
  assert.ok(final.slides.every(slide => !Object.hasOwn(slide, "_page_id")));
});

test("final-output scoring catches audience drift and visual mismatch even when the internal object is correct", async () => {
  const input = { requirement: "分析客户流失原因，面向董事会汇报", page_count: 8 };
  const context = parseRequestContext(input);
  const plan = buildNarrativePlan(context);
  const clean = await generateOutline(input);
  const source = internalSourceFromResult(clean);
  const candidate = adaptOutlineCandidate(source);
  candidate.subtitle = "面向客户与潜在合作方";
  candidate.slides[0].content = candidate.slides[0].content.replace(/汇报对象：.*$/m, "汇报对象：客户与潜在合作方");
  const action = candidate.slides.find(slide => slide.role === "action");
  action.visual_spec.visual_type = "map";
  action.visual_spec.template_id = "map";
  action.visual_suggestion = "左侧城市地图，右侧区域图例。";

  const report = scoreOutline(candidate, context, plan, { pipeline: source.pipeline, sourceOutline: source });
  assert.ok(report.score < 95);
  assert.equal(report.hard_gates.audience_alignment.passed, false);
  assert.equal(report.hard_gates.visual_semantics.passed, false);
  assert.equal(report.hard_gates.final_output_integrity.passed, false);
});

test("visual repair targets the stable page ID after adaptation, cloning and order checks", async () => {
  const input = { requirement: "新能源汽车客户画像分析", page_count: 8 };
  const context = parseRequestContext(input);
  const plan = buildNarrativePlan(context);
  const clean = await generateOutline(input);
  const source = internalSourceFromResult(clean);
  const action = source.slides.find(slide => slide.slide_type === "implications");
  const geography = source.slides.find(slide => slide.slide_type === "geography");
  action.visual_spec.visual_type = "map";
  action.visual_spec.template_id = "map";
  action.visual_suggestion = "左侧城市地图，右侧区域图例。";
  const candidate = structuredClone(adaptOutlineCandidate(source));
  candidate.slides.reverse();

  const report = scoreOutline(candidate, context, plan, { pipeline: source.pipeline, sourceOutline: source });
  const target = report.repair_targets.find(item => item.page_id === action._pageId);
  assert.ok(target, "visual issue must retain the action page ID");
  const repaired = repairOutline(source, context, report);
  const repairedAction = repaired.outline.slides.find(slide => slide._pageId === action._pageId);
  const repairedGeography = repaired.outline.slides.find(slide => slide._pageId === geography._pageId);
  assert.equal(repairedAction.visual_spec.visual_type, "roadmap");
  assert.equal(repairedGeography.visual_spec.visual_type, "matrix");
});

test("core acceptance request preserves management audience and gives the business action page a roadmap", async () => {
  const runtime = {};
  const result = await generateOutline({
    requirement: "制作一份新能源汽车客户画像分析PPT，用于向管理层汇报。当前没有客户资料，请生成专业的分析框架，明确区分事实、待验证假设和所需补充资料，不得虚构任何数据或客户结论。"
  }, { runtime });
  assert.match(result.subtitle, /管理层|内部决策者/);
  const action = result.slides.find(slide => slide.slide_type === "implications");
  assert.equal(action.visual_spec.visual_type, "roadmap");
  assert.equal(result.success, true);
  assert.ok(["production_ready", "review_required", "fallback"].includes(result.quality_status));
  assert.ok(result.customer_version.trim());
  assert.ok(result.production_version.trim());
  assert.equal(runtime.internalDiagnostics.hard_gates.audience_alignment.passed, true);
  assert.equal(runtime.internalDiagnostics.hard_gates.visual_semantics.passed, true);
  assert.equal(runtime.internalDiagnostics.hard_gates.final_output_integrity.passed, true);
  assert.equal(runtime.internalDiagnostics.hard_gates.no_fabrication.passed, true);
});

function internalSourceFromResult(result) {
  const { quality_report, ...content } = structuredClone(result);
  return {
    ...content,
    pipeline: "server-generate-outline",
    slides: content.slides.map(slide => ({ ...slide, _pageId: `${slide.slide_type}:${slide.index}` }))
  };
}
