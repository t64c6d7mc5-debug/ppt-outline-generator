import assert from "node:assert/strict";
import { test } from "node:test";
import { generateOutline } from "../lib/generate-outline.js";
import { buildNarrativePlan } from "../lib/narrative-planner.js";
import { repairOutline } from "../lib/outline-repair.js";
import { scoreOutline } from "../lib/outline-scorer.js";
import { parseRequestContext } from "../lib/request-context.js";
import { genericBenchmark, productionBenchmarks } from "./fixtures/production-benchmarks.js";

test("all golden benchmarks return complete scripts while safety gates remain strict", async () => {
  for (const scenario of productionBenchmarks) {
    const runtime = {};
    const result = await generateOutline(scenario.input, { runtime });
    const report = runtime.internalDiagnostics;
    assert.equal(report.support_tier, "production", scenario.name);
    assert.equal(report.threshold, 95, scenario.name);
    assert.ok(report.repair_rounds <= 2, scenario.name);
    assert.equal(result.success, true, scenario.name);
    assert.ok(["production_ready", "review_required", "fallback"].includes(result.quality_status), scenario.name);
    assert.ok(result.customer_version.trim(), `${scenario.name}: customer version`);
    assert.ok(result.production_version.trim(), `${scenario.name}: production version`);
    for (const gate of ["evidence_safety", "no_fabrication", "api_contract", "final_output_integrity", "unified_server_core"]) {
      assert.equal(report.hard_gates[gate].passed, true, `${scenario.name}: ${gate}: ${report.hard_gates[gate].reason}`);
    }
    for (const item of Object.values(report.dimensions)) {
      assert.ok(Array.isArray(item.reasons) && item.reasons.length, `${scenario.name}: dimension reasons`);
    }
  }
});

test("generic benchmark without a model is presented as a transparent complete fallback", async () => {
  const runtime = {};
  const result = await generateOutline(genericBenchmark.input, { runtime });
  const report = runtime.internalDiagnostics;
  assert.equal(report.support_tier, "generic");
  assert.equal(report.threshold, 95);
  assert.equal(result.success, true);
  assert.equal(result.quality_status, "fallback");
  assert.equal(result.source_summary.model_attempted, false);
  assert.equal(result.source_summary.model_used, false);
  assert.equal(result.source_summary.model_content_retained, false);
  assert.equal(result.source_summary.fallback_used, true);
  assert.ok(result.customer_version.trim());
  assert.ok(result.production_version.trim());
  for (const gate of ["evidence_safety", "no_fabrication", "api_contract"]) {
    assert.equal(report.hard_gates[gate].passed, true);
  }
});

test("persona evidence pages precede segmentation and explicit proposed segments stay hypothesis-pending", async () => {
  const result = await generateOutline({
    requirement: "新能源汽车客户画像分析",
    client_materials: "",
    page_count: 12,
    style: "科技感"
  });
  const segmentIndex = result.slides.findIndex(slide => slide.slide_type === "segments");
  const evidenceIndexes = result.slides
    .map((slide, index) => ({ slide, index }))
    .filter(item => item.slide.role === "evidence")
    .map(item => item.index);
  assert.ok(evidenceIndexes.every(index => index < segmentIndex));
  const segment = result.slides[segmentIndex];
  assert.equal(segment.evidence_status, "hypothesis_pending");
  assert.equal(Object.hasOwn(segment, "evidence_sources"), false, "public outline must not expose internal evidence lineage");
  assert.match(segment.content, /待验证分群假设，不代表真实客户结论/);
  assert.doesNotMatch(segment.content, /高频通勤效率型|家庭综合出行型|科技体验驱动型/);
  assert.match(segment.content, /资料未形成命名客群前，不新增/);
});

test("cover and customer copy fields contain no internal production language", async () => {
  const result = await generateOutline({ requirement: "新能源汽车客户画像分析", deadline: "今晚" });
  const customerText = [
    result.title,
    result.subtitle,
    ...result.executive_summary,
    ...result.slides.flatMap(slide => [slide.title, slide.key_message, slide.content, slide.visual_suggestion])
  ].join("\n");
  assert.doesNotMatch(customerText, /结构化 PPT 策划提纲|不补造数据|当前资料为空|快速交付|制作策略|质量报告|证据状态：/);
});

test("four deadlines change complexity without lowering quality", async () => {
  const base = { requirement: "新能源汽车客户画像分析", style: "科技感" };
  const cases = await Promise.all(["今晚", "明天上午", "三天内", "不急"].map(deadline => generateOutline({ ...base, deadline })));
  assert.deepEqual(cases.map(result => result.slides.length), [6, 8, 10, 12]);
  assert.ok(cases.every(result => result.success === true));
  assert.ok(cases.every(result => ["production_ready", "review_required", "fallback"].includes(result.quality_status)));
  assert.ok(cases.every(result => result.customer_version.trim() && result.production_version.trim()));
  assert.deepEqual(cases.map(result => result.production_strategy.max_ai_images), [0, 1, 2, 2]);
});

test("manual page count is strict for every deadline", async () => {
  for (const deadline of ["今晚", "明天上午", "三天内", "不急"]) {
    const result = await generateOutline({ requirement: "园区招商方案", page_count: 7, deadline });
    assert.equal(result.slides.length, 7);
    assert.equal(result.success, true);
    assert.ok(result.customer_version.trim());
    assert.ok(result.production_version.trim());
    assert.equal(Object.hasOwn(result.quality_report, "hard_gates"), false);
  }
});

test("global visual style is emitted once and data visuals never allow AI generation", async () => {
  const result = await generateOutline({ requirement: "新能源汽车客户画像分析", page_count: 10, style: "科技感" });
  assert.equal(typeof result.global_visual_style.palette, "string");
  for (const slide of result.slides) {
    assert.doesNotMatch(slide.visual_suggestion, /深灰底|电光蓝|统一配色/);
    if (["funnel", "bar_chart", "map", "matrix", "dashboard", "timeline", "roadmap", "architecture", "journey"].includes(slide.visual_spec.visual_type)) {
      assert.equal(slide.visual_spec.ai_allowed, false);
    }
  }
});

test("repairer records explainable before and after changes instead of bypassing scoring", async () => {
  const input = { requirement: "新能源汽车客户画像分析", page_count: 6, style: "科技感" };
  const clean = await generateOutline(input);
  const context = parseRequestContext(input);
  const plan = buildNarrativePlan(context);
  const damaged = structuredClone(clean);
  damaged.pipeline = "server-generate-outline";
  damaged.slides[0].content += "\n• 制作策略：快速交付";
  const before = scoreOutline(damaged, context, plan);
  assert.equal(before.hard_gates.cover_clean.passed, false);
  const repaired = repairOutline(damaged, context, before);
  assert.ok(repaired.actions.some(action => action.issue === "content-layering"));
  const after = scoreOutline(repaired.outline, context, plan);
  assert.equal(after.hard_gates.cover_clean.passed, true);
  assert.ok(after.score >= before.score);
});
