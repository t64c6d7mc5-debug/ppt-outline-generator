import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSimpleRequest, normalizeClientMaterials } from "../js/request-builders.js";
import { generateOutline } from "../lib/generate-outline.js";
import { buildDeterministicFallback } from "../lib/deterministic-fallback.js";
import { adaptOutlineCandidate } from "../lib/output-adapter.js";
import { repairOutline } from "../lib/outline-repair.js";
import { scoreOutline } from "../lib/outline-scorer.js";
import { parseMaterialContext, sourceSupportsSlide } from "../lib/material-context.js";

const MATERIALS = `项目背景
远航计划正在评估新区域市场

已确认事实：
1. 项目尚未正式进入目标市场
2. 当前没有真实订单、访谈或转化数据
3. 定价、首发方案和渠道仍未确定
4. 管理层要求先小范围验证再决定投入

待验证假设
1. 高频通勤人群可能更关注使用成本和服务便利性
2. 家庭增购人群可能更关注空间、安全和售后

已有资料
1. 品牌视觉规范
2. 产品介绍文件

资料缺口
1. 目标人群访谈

决策事项
1. 管理层确认继续、调整或停止项目`;

const INPUT = {
  source_mode: "simple",
  requirement: "制作客户画像分析，用于向管理层汇报",
  has_materials: true,
  client_materials: MATERIALS,
  page_count: 8,
  purpose: "商业汇报"
};

test("simple request preserves headings, numbered lists, blank lines and normalizes CRLF only", () => {
  const raw = "  项目背景\r\n\r\n1. 第一项\r2. 第二项\u0000  \n";
  const normalized = normalizeClientMaterials(raw);
  assert.equal(normalized, "项目背景\n\n1. 第一项\n2. 第二项");
  const payload = buildSimpleRequest({
    rawNeed: "项目汇报",
    materialStatus: "有文字资料 / 图片 / 文件，需要整理",
    materialsText: raw,
    styleChoice: "auto",
    pageChoice: "8",
    deadline: ""
  }, { style: "正式", purpose: "商业汇报", pageCount: 8 });
  assert.equal(payload.client_materials, normalized);
});

test("multiline headings and numbered fields remain structurally parseable", () => {
  const material = parseMaterialContext({ clientMaterials: normalizeClientMaterials(MATERIALS) });
  assert.ok(material.project_background.some(item => item.excerpt.includes("新区域市场")));
  assert.equal(material.confirmed_facts.length, 4);
  assert.equal(material.hypotheses.length, 2);
  assert.equal(material.provided_materials.length, 2);
  assert.equal(material.explicit_gaps.length, 1);
  assert.equal(material.required_decisions.length, 1);
});

test("product material cannot support a segmentation hypothesis while a related hypothesis can", () => {
  const material = parseMaterialContext({ clientMaterials: MATERIALS });
  const product = material.provided_materials.find(item => item.excerpt.includes("产品介绍"));
  const hypothesis = material.hypotheses.find(item => item.excerpt.includes("高频通勤"));
  const slide = {
    slide_type: "segments",
    evidence_status: "hypothesis_pending",
    title: "待验证用户分群假设",
    key_message: "通勤人群的使用成本偏好仍需验证",
    content: "待验证假设：高频通勤人群可能更关注使用成本和服务便利性，不代表真实客户结论。"
  };
  assert.equal(sourceSupportsSlide(product, slide), false);
  assert.equal(sourceSupportsSlide(hypothesis, slide), true);
});

test("generated segmentation binds only related hypothesis sources", async () => {
  const { context, plan, authority, internal } = await generatedInternals(INPUT);
  const segment = internal.slides.find(slide => slide.slide_type === "segments");
  assert.equal(segment.evidence_status, "hypothesis_pending");
  assert.ok(segment.evidence_sources.length > 0);
  assert.ok(segment.evidence_sources.every(source => source.field === "hypotheses" && source.evidence_type === "hypothesis"));
  const runtime = {};
  const result = await generateOutline(INPUT, { runtime });
  assert.equal(runtime.internalDiagnostics.hard_gates.evidence_safety.passed, true);
  assert.equal(runtime.internalDiagnostics.hard_gates.evidence_traceability.passed, true);
  assert.equal(result.quality_status, "fallback");
  assert.ok(result.slides.every(slide => !("evidence_sources" in slide)));
  assert.ok(result.slides.every(slide => !("fragment_id" in slide) && !("source_id" in slide)));
  assert.equal("hard_gates" in result.quality_report, false);
});

test("repair replaces an unrelated source and the next score uses the repaired object", async () => {
  const { context, plan, authority, internal } = await generatedInternals(INPUT);
  const segment = internal.slides.find(slide => slide.slide_type === "segments");
  const wrong = context.materialContext.provided_materials.find(item => item.excerpt.includes("产品介绍"));
  segment.evidence_sources = [publicSource(wrong)];
  const before = scoreOutline(adaptOutlineCandidate(internal), context, plan, metadata(internal, authority));
  assert.equal(before.hard_gates.evidence_traceability.passed, false);
  assert.equal(before.hard_gates.evidence_safety.passed, true);
  const target = before.repair_targets.find(item => item.issue === "evidence-traceability" && item.page_id === segment._pageId && item.source_id === wrong.source_id);
  assert.equal(target.page_id, segment._pageId);
  assert.equal(target.source_id, wrong.source_id);
  const repaired = repairOutline(internal, context, before);
  assert.ok(repaired.actions.some(action => action.page_id === segment._pageId));
  const repairedSegment = repaired.outline.slides.find(slide => slide._pageId === segment._pageId);
  assert.equal(repairedSegment.evidence_status, "hypothesis_pending");
  assert.ok(repairedSegment.evidence_sources.every(source => source.field === "hypotheses"));
  const after = scoreOutline(adaptOutlineCandidate(repaired.outline), context, plan, metadata(repaired.outline, authority));
  assert.equal(after.repair_targets.some(item => item.issue === "evidence-traceability" && item.page_id === segment._pageId && item.source_id === wrong.source_id), false);
});

test("repair records source-only removal and preserves recommendation status", async () => {
  const { context, plan, authority, internal } = await generatedInternals(INPUT);
  const recommendation = internal.slides.at(-1);
  recommendation.evidence_status = "recommendation";
  const wrong = context.materialContext.provided_materials[0];
  recommendation.evidence_sources = [publicSource(wrong)];
  const report = scoreOutline(adaptOutlineCandidate(internal), context, plan, metadata(internal, authority));
  const repaired = repairOutline(internal, context, report);
  const action = repaired.actions.find(item => item.page_id === recommendation._pageId && item.issue === "evidence-traceability");
  assert.ok(action);
  const repairedPage = repaired.outline.slides.find(slide => slide._pageId === recommendation._pageId);
  assert.equal(repairedPage.evidence_status, "recommendation");
  assert.equal(repairedPage.evidence_sources.some(source => source.source_id === wrong.source_id), false);
});

test("explicit proposed segments remain hypothesis-pending without pretending to have sources", async () => {
  const input = {
    requirement: "制作客户画像分析，用于内部评审",
    has_materials: true,
    client_materials: "已有资料：品牌视觉规范\n项目背景：仍处于方案研究阶段",
    page_count: 8
  };
  const { context, plan, authority, internal } = await generatedInternals(input);
  const segment = internal.slides.find(slide => slide.slide_type === "segments");
  assert.equal(segment.evidence_status, "hypothesis_pending");
  assert.deepEqual(segment.evidence_sources, []);
  const report = scoreOutline(adaptOutlineCandidate(internal), context, plan, metadata(internal, authority));
  assert.equal(report.hard_gates.evidence_traceability.passed, true);
  const result = await generateOutline(input);
  assert.equal("evidence_sources" in result.slides.find(slide => slide.slide_type === "segments"), false);
});

test("evidence relevance stays generic across three domains", async () => {
  const cases = [
    ["企业数字化项目", "员工可能更关注流程响应速度"],
    ["消费品市场调研", "年轻消费者可能更关注配料透明度"],
    ["园区招商分析", "成长企业可能更关注配套服务效率"]
  ];
  for (const [topic, hypothesis] of cases) {
    const input = {
      requirement: `制作${topic}客户画像，用于向管理层汇报`,
      has_materials: true,
      client_materials: `项目背景：${topic}处于前期验证阶段\n待验证假设：${hypothesis}\n已有资料：品牌视觉规范`,
      page_count: 8
    };
    const { context, plan, authority, internal } = await generatedInternals(input);
    const segment = internal.slides.find(slide => slide.slide_type === "segments");
    assert.ok(segment.evidence_sources.every(source => source.field === "hypotheses"), topic);
    const report = scoreOutline(adaptOutlineCandidate(internal), context, plan, metadata(internal, authority));
    assert.equal(report.hard_gates.evidence_traceability.passed, true, topic);
    const result = await generateOutline(input);
    assert.equal("evidence_sources" in result.slides.find(slide => slide.slide_type === "segments"), false, topic);
  }
});

async function generatedInternals(input) {
  const fallback = buildDeterministicFallback({ input });
  assert.equal(fallback.ok, true);
  const context = fallback.artifacts.context;
  const authority = context.requestAuthority;
  const plan = fallback.artifacts.plan;
  const internal = structuredClone(fallback.artifacts.internalOutline);
  return { authority, context, plan, internal };
}

function publicSource(fragment) {
  return {
    fragment_id: fragment.fragment_id,
    source_id: fragment.source_id,
    assertion_type: fragment.assertion_type,
    section_type: fragment.section_type,
    field: fragment.field,
    excerpt: fragment.excerpt,
    polarity: fragment.polarity,
    evidence_type: fragment.evidence_type
  };
}

function metadata(sourceOutline, requestAuthority) {
  return { pipeline: sourceOutline.pipeline, sourceOutline, requestAuthority };
}
