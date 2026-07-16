import assert from "node:assert/strict";
import { test } from "node:test";
import { generateOutline } from "../lib/generate-outline.js";
import { buildDeterministicFallback } from "../lib/deterministic-fallback.js";
import { adaptOutlineCandidate } from "../lib/output-adapter.js";
import { repairOutline } from "../lib/outline-repair.js";
import { scoreOutline } from "../lib/outline-scorer.js";
import { collectTraceableSegments, parseMaterialContext } from "../lib/material-context.js";

const SPECIAL_MATERIALS = `品牌：E-Motion Europe
项目背景：欧洲品牌计划研究进入中国市场，目前处于市场可行性验证阶段
汇报对象：管理层与内部决策者

已确认事实
1. 尚未正式进入中国市场
2. 当前没有真实销量、订单、试驾、咨询或转化数据
3. 定价、首发车型、渠道模式和首批城市尚未确定
4. 管理层希望先低成本验证，再决定大规模投入

待验证假设
1. 城市通勤型首购用户可能更关注补能便利与使用成本
2. 家庭增购用户可能更关注空间、安全与家庭充电条件
3. 高端换购与科技兴趣用户可能更关注智能体验与品牌差异

资料缺口
1. 城市样本、区域分布和渠道覆盖数据尚未取得
2. 客户访谈与真实行为记录待补充

决策事项
1. 管理层与内部决策者确认继续、调整或停止下一阶段验证`;

const SPECIAL_INPUT = {
  source_mode: "simple",
  requirement: "制作一份新能源汽车客户画像分析，用于向管理层与内部决策者汇报",
  has_materials: true,
  client_materials: SPECIAL_MATERIALS,
  page_count: 8,
  style: "科技感",
  purpose: "商业汇报",
  deadline: "明天上午"
};

test("named segments come only from explicit hypotheses or explicit segmentation facts", () => {
  const material = parseMaterialContext({ clientMaterials: `${SPECIAL_MATERIALS}\n已确认事实：目标市场人群年龄与预算范围待研究` });
  const segments = collectTraceableSegments({ materialContext: material });
  assert.deepEqual(segments.map(item => item.label), ["城市通勤型首购用户", "家庭增购用户", "高端换购与科技兴趣用户"]);
});

test("three source segments produce exactly three public entities and three visual entities", async () => {
  const result = await generateOutline(SPECIAL_INPUT);
  const slide = result.slides.find(item => item.slide_type === "segments");
  assert.equal(slide.content.split("\n").filter(line => /待验证方向/.test(line)).length, 3);
  assert.equal(slide.visual_spec.entity_count, 3);
  assert.equal(slide.visual_spec.entity_labels.length, 3);
  assert.doesNotMatch(slide.content, /任务效率型|综合价值型|体验驱动型/);
});

test("segment names and core semantic sets remain faithful to each original source", async () => {
  const result = await generateOutline(SPECIAL_INPUT);
  const slide = result.slides.find(item => item.slide_type === "segments");
  const pairs = [
    ["城市通勤型首购用户", ["补能便利", "使用成本"]],
    ["家庭增购用户", ["空间", "安全", "家庭充电条件"]],
    ["高端换购与科技兴趣用户", ["智能体验", "品牌差异"]]
  ];
  for (const [label, terms] of pairs) {
    const line = slide.content.split("\n").find(item => item.includes(label));
    assert.ok(line, label);
    for (const term of terms) assert.match(line, new RegExp(term), `${label}:${term}`);
  }
  assert.doesNotMatch(slide.content, /通勤效率|长期使用价值/);
});

test("segment semantic drift is a hard failure and repair restores the source wording", async () => {
  const state = await generatedInternals(SPECIAL_INPUT);
  const slide = state.internal.slides.find(item => item.slide_type === "segments");
  slide.content = slide.content.replace(/补能便利与使用成本/, "通勤效率");
  const before = score(state, state.internal);
  assert.equal(before.hard_gates.evidence_traceability.passed, false);
  const repaired = repairOutline(state.internal, state.context, before);
  const fixed = repaired.outline.slides.find(item => item.slide_type === "segments");
  assert.match(fixed.content, /补能便利与使用成本/);
  assert.doesNotMatch(fixed.content, /通勤效率/);
});

test("untraceable named segment is a hard failure and repair removes it", async () => {
  const state = await generatedInternals(SPECIAL_INPUT);
  const slide = state.internal.slides.find(item => item.slide_type === "segments");
  slide.content += "\n• 待验证方向：额外探索型用户关注未知因素（不代表真实客户结论）";
  slide.visual_spec.entity_count += 1;
  slide.visual_spec.entity_labels.push("额外探索型用户");
  const before = score(state, state.internal);
  assert.equal(before.hard_gates.evidence_traceability.passed, false);
  const repaired = repairOutline(state.internal, state.context, before);
  assert.ok(repaired.actions.some(action => action.issue === "segment-provenance"));
  assert.doesNotMatch(repaired.outline.slides.find(item => item.slide_type === "segments").content, /额外探索型用户/);
});

test("visual entity count mismatch is a hard failure and is rebuilt from traceable entities", async () => {
  const state = await generatedInternals(SPECIAL_INPUT);
  const slide = state.internal.slides.find(item => item.slide_type === "segments");
  slide.visual_spec.entity_count = 4;
  const before = score(state, state.internal);
  assert.equal(before.hard_gates.visual_semantics.passed, false);
  const repaired = repairOutline(state.internal, state.context, before);
  const afterSlide = repaired.outline.slides.find(item => item.slide_type === "segments");
  assert.equal(afterSlide.visual_spec.entity_count, 3);
});

test("authority controls decision actor while other organizations remain ordinary participants", async () => {
  const result = await generateOutline({
    ...SPECIAL_INPUT,
    client_materials: `${SPECIAL_MATERIALS}\n项目背景：投资委员会参与预算材料准备，但不作为本次汇报决策主体`
  });
  const action = result.slides.at(-1);
  assert.match(`${result.subtitle}\n${action.content}`, /管理层与内部决策者/);
  assert.doesNotMatch(`${action.title}\n${action.key_message}\n${action.content}`, /董事会决策|投资委员会决策/);
});

test("decision actor drift is a hard failure and repair restores authority", async () => {
  const state = await generatedInternals(SPECIAL_INPUT);
  const action = state.internal.slides.at(-1);
  action.content += "\n• 董事会决策事项：决定继续、调整或停止下一阶段验证";
  const before = score(state, state.internal);
  assert.equal(before.hard_gates.audience_alignment.passed, false);
  assert.equal(before.hard_gates.required_decisions.passed, false);
  const repaired = repairOutline(state.internal, state.context, before);
  assert.match(repaired.outline.slides.at(-1).content, /管理层与内部决策者决策事项/);
  assert.doesNotMatch(repaired.outline.slides.at(-1).content, /董事会决策事项/);
});

test("undetermined channels use neutral touchpoints while confirmed physical channels may use store terms", async () => {
  const uncertain = await generateOutline(SPECIAL_INPUT);
  assert.doesNotMatch(uncertain.slides.map(item => item.content).join("\n"), /门店来源|门店咨询记录|门店转化|门店布局/);
  const confirmed = await generateOutline({
    ...SPECIAL_INPUT,
    client_materials: SPECIAL_MATERIALS.replace("渠道模式和首批城市尚未确定", "首批城市尚未确定") + "\n已确认事实：现有直营门店咨询记录可供分析"
  });
  assert.match(confirmed.slides.map(item => item.content).join("\n"), /门店/);
});

test("deterministic store wording without confirmed channel evidence is a hard failure and repair neutralizes it", async () => {
  const state = await generatedInternals(SPECIAL_INPUT);
  const slide = state.internal.slides.find(item => item.slide_type === "sampleOverview");
  slide.content += "\n• 门店来源：整理咨询与转化记录";
  const before = score(state, state.internal);
  assert.equal(before.hard_gates.evidence_safety.passed, false);
  const repaired = repairOutline(state.internal, state.context, before);
  assert.doesNotMatch(repaired.outline.slides.find(item => item._pageId === slide._pageId).content, /门店来源/);
});

test("map requires positive geographic evidence and otherwise becomes a decision framework", async () => {
  const withoutData = await generateOutline(SPECIAL_INPUT);
  const geography = withoutData.slides.find(item => item.slide_type === "geography");
  assert.notEqual(geography.visual_spec.visual_type, "map");
  assert.match(geography.title, /验证框架|进入条件/);
  assert.doesNotMatch(geography.title, /地域与城市分布/);
  const withData = await generateOutline({
    ...SPECIAL_INPUT,
    client_materials: SPECIAL_MATERIALS.replace("城市样本、区域分布和渠道覆盖数据尚未取得", "客户访谈待补充") + "\n已确认事实：已提供城市样本分布数据与区域渠道覆盖明细"
  });
  assert.equal(withData.slides.find(item => item.slide_type === "geography").visual_spec.visual_type, "map");
});

test("geographic conclusion title without data is a hard failure and repair restores framework semantics", async () => {
  const state = await generatedInternals(SPECIAL_INPUT);
  const slide = state.internal.slides.find(item => item.slide_type === "geography");
  slide.title = "地域与城市分布";
  const before = score(state, state.internal);
  assert.equal(before.hard_gates.visual_semantics.passed, false);
  const repaired = repairOutline(state.internal, state.context, before);
  const fixed = repaired.outline.slides.find(item => item._pageId === slide._pageId);
  assert.match(fixed.title, /验证框架|进入条件/);
});

test("map injected without positive geography evidence is a hard failure and repair replaces it", async () => {
  const state = await generatedInternals(SPECIAL_INPUT);
  const slide = state.internal.slides.find(item => item.slide_type === "geography");
  slide.visual_spec = { ...slide.visual_spec, visual_type: "map", template_id: "map", layout: "区域地图", primary_elements: ["区域轮廓", "图例"], ai_allowed: false };
  const before = score(state, state.internal);
  assert.equal(before.hard_gates.visual_semantics.passed, false);
  const repaired = repairOutline(state.internal, state.context, before);
  assert.notEqual(repaired.outline.slides.find(item => item._pageId === slide._pageId).visual_spec.visual_type, "map");
});

test("unverified pains remain hypotheses and factual wording is detected and repaired", async () => {
  const state = await generatedInternals(SPECIAL_INPUT);
  const journey = state.internal.slides.find(item => item.slide_type === "needsJourney");
  journey.content += "\n• 典型痛点：信息不透明与方案比较困难";
  journey.evidence_status = "framework_only";
  const before = score(state, state.internal);
  assert.equal(before.hard_gates.evidence_safety.passed, false);
  const repaired = repairOutline(state.internal, state.context, before);
  const fixed = repaired.outline.slides.find(item => item._pageId === journey._pageId);
  assert.equal(fixed.evidence_status, "hypothesis_pending");
  assert.match(fixed.content, /待验证痛点/);
});

test("recommendations cannot promote pending interests into deterministic product advice", async () => {
  const clean = await generateOutline(SPECIAL_INPUT);
  const cleanAction = clean.slides.at(-1);
  assert.doesNotMatch(cleanAction.content, /产品建议[^\n]*映射到车型配置/);

  const state = await generatedInternals(SPECIAL_INPUT);
  const action = state.internal.slides.at(-1);
  action.content += "\n• 产品建议：把补能便利、空间、智能体验映射到车型配置与传播说明";
  const before = score(state, state.internal);
  assert.equal(before.hard_gates.evidence_safety.passed, false);
  const repaired = repairOutline(state.internal, state.context, before);
  const repairedContent = repaired.outline.slides.at(-1).content;
  assert.doesNotMatch(repairedContent, /产品建议：把补能便利、空间、智能体验映射到车型配置/);
  assert.match(repairedContent, /产品建议（待验证）：验证[^\n]*后，再映射到车型配置/);
});

test("decision journey is identified semantically and contains real stages", async () => {
  const result = await generateOutline(SPECIAL_INPUT);
  const journey = result.slides.find(item => item.slide_type === "needsJourney");
  assert.equal(journey.visual_spec.visual_type, "journey");
  assert.match(journey.content, /决策路径[^\n]*→/);
  assert.match(journey.content, /认知[^\n]*比较[^\n]*(?:体验|咨询)/);
});

test("special regression returns a complete safe fallback without exposing hard gates", async () => {
  const runtime = {};
  const result = await generateOutline(SPECIAL_INPUT, { runtime });
  assert.equal(result.quality_status, "fallback");
  assert.ok(result.customer_version && result.production_version);
  assert.equal("warnings" in result.quality_report, false);
  assert.equal("hard_gates" in result.quality_report, false);
  for (const gate of ["evidence_safety", "evidence_traceability", "visual_semantics"]) {
    assert.equal(runtime.internalDiagnostics.hard_gates[gate].passed, true, gate);
  }
});

test("semantic rules remain generic across unrelated domains", async () => {
  const cases = [
    ["企业数字化项目", "一线流程执行用户可能更关注响应效率", "流程触点"],
    ["消费品市场调研", "成分关注型消费者可能更关注配料透明度", "零售触点"],
    ["园区招商分析", "成长型目标企业可能更关注配套服务效率", "招商触点"]
  ];
  for (const [topic, hypothesis, touchpoint] of cases) {
    const runtime = {};
    const result = await generateOutline({
      requirement: `制作${topic}客户画像，用于向管理层汇报`,
      has_materials: true,
      client_materials: `项目背景：${topic}处于前期验证阶段\n已确认事实：渠道模式尚未确定\n待验证假设：${hypothesis}\n资料缺口：地域样本与${touchpoint}覆盖资料待补充`,
      page_count: 8
    }, { runtime });
    assert.ok(result.quality_report.score >= 90, topic);
    assert.equal(runtime.internalDiagnostics.hard_gates.evidence_safety.passed, true, topic);
    assert.equal(runtime.internalDiagnostics.hard_gates.visual_semantics.passed, true, topic);
    assert.equal(runtime.internalDiagnostics.hard_gates.evidence_traceability.passed, true, topic);
    assert.equal("hard_gates" in result.quality_report, false, topic);
    const segment = result.slides.find(item => item.slide_type === "segments");
    assert.equal(segment.evidence_status, "hypothesis_pending", topic);
    assert.equal(segment.visual_spec.entity_count, 1, topic);
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

function score(state, outline) {
  return scoreOutline(adaptOutlineCandidate(outline), state.context, state.plan, {
    pipeline: outline.pipeline,
    sourceOutline: outline,
    requestAuthority: state.authority
  });
}
