import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildSimpleRequest } from "../js/request-builders.js";
import { generateOutline } from "../lib/generate-outline.js";
import { buildDeterministicFallback } from "../lib/deterministic-fallback.js";
import { adaptOutlineCandidate } from "../lib/output-adapter.js";
import { scoreOutline } from "../lib/outline-scorer.js";
import { buildNarrativePlan } from "../lib/narrative-planner.js";
import { parseMaterialContext } from "../lib/material-context.js";
import { buildRequestAuthority, parseRequestContext } from "../lib/request-context.js";
import { createAppServer } from "../server.js";

const CORE_MATERIALS = `项目背景
品牌：E-Motion Europe
欧洲新能源汽车品牌，计划研究进入中国市场
汇报对象：公司董事会、中国区筹备管理层及内部业务决策者

已确认事实：
- 尚未正式进入中国市场
- 当前无真实销量、订单、试驾、咨询或转化数据
- 尚未确定定价、首发车型、渠道模式和首批城市
- 管理层希望先低成本验证，再决定大规模投入

待验证假设
- 一线城市家庭用户可能更关注补能便利性
- 企业客户可能更关注全生命周期成本

管理层重点问题：
- 中国市场是否值得继续投入
- 先验证哪些客户和城市假设

已有资料
- 欧洲品牌定位说明
- 产品技术路线说明

资料缺口：
- 中国潜在客户访谈
- 竞品价格与配置
- 目标城市政策与基础设施
- 渠道伙伴意向
- 首发车型定义
- 中国定价边界
- 试驾反馈
- 咨询与线索记录
- 订单与转化数据
- 投资预算与阶段门槛

决策事项
- 最后一部分必须列出董事会继续、调整或停止的决策事项`;

const FORM_STATE = {
  rawNeed: "制作一份新能源汽车客户画像分析PPT，用于向管理层和内部决策者汇报；当前没有真实客户数据，请基于现有内部资料建立专业分析框架，明确区分已知事实、待验证假设、建议和所需补充资料，不得虚构任何数据或客户结论。",
  materialStatus: "有文字资料 / 图片 / 文件，需要整理",
  materialsText: CORE_MATERIALS,
  styleChoice: "科技感",
  deadline: "明天上午",
  pageChoice: "8"
};

const SIMPLE_NEED = { style: "科技感", purpose: "商业汇报", pageCount: 8 };

let server;
let baseUrl;
let observedBody;
let observedDiagnostics;

before(async () => {
  server = createAppServer({
    onOutlineRequest: body => { observedBody = body; },
    generateOutlineFn: async input => {
      const runtime = {};
      try {
        return await generateOutline(input, { runtime });
      } finally {
        observedDiagnostics = runtime.internalDiagnostics;
      }
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test("material parser is conservative, traceable and preserves unclassified fragments", () => {
  const material = parseMaterialContext({ clientMaterials: `这一行无法分类但必须保留\n【项目背景】\n海风计划面向集团内部。\n已确认事实：\n- 已提供订单数据\n待验证假设\n- 用户可能偏好订阅制\n已有资料：访谈提纲\n资料缺口\n- 价格测试\n决策事项：是否进入下一阶段` });

  assert.ok(material.fragments.every(fragment => fragment.source_id && fragment.excerpt && fragment.field));
  assert.ok(material.confirmed_facts.some(fragment => fragment.excerpt.includes("已提供订单数据")));
  assert.ok(material.hypotheses.some(fragment => fragment.excerpt.includes("订阅制")));
  assert.ok(material.explicit_gaps.some(fragment => fragment.excerpt.includes("价格测试")));
  assert.ok(material.required_decisions.some(fragment => fragment.excerpt.includes("下一阶段")));
  assert.ok(material.unclassified_fragments.some(fragment => fragment.excerpt.includes("无法分类")));
});

test("order-data wording distinguishes positive, negative, pending and unknown evidence", () => {
  const cases = [
    ["已提供订单数据", "positive", true],
    ["没有订单数据", "negative", false],
    ["订单数据待补充", "pending", false],
    ["尚未确定是否收集订单数据", "unknown", false]
  ];
  for (const [text, polarity, available] of cases) {
    const material = parseMaterialContext({ clientMaterials: `已确认事实：\n- ${text}` });
    const fragment = material.fragments.find(item => item.excerpt === text);
    assert.equal(fragment?.polarity, polarity, text);
    assert.equal(material.available_material_types.includes("orders"), available, text);
  }
});

test("request authority is immutable and preserves competing audience evidence", () => {
  const authority = buildRequestAuthority({
    requirement: "制作客户分析，用于向管理层和内部决策者汇报",
    client_materials: "汇报对象：公司董事会及中国区筹备管理层"
  });
  const context = parseRequestContext({
    requirement: "制作客户分析，用于向管理层和内部决策者汇报",
    client_materials: "汇报对象：公司董事会及中国区筹备管理层"
  }, authority);

  assert.equal(Object.isFrozen(authority), true);
  assert.equal(Object.isFrozen(authority.audience), true);
  assert.equal(context.requestAuthority, authority);
  assert.equal(authority.audience.source, "requirement_phrase");
  assert.match(authority.audience.value, /管理层|内部决策者/);
  assert.ok(authority.audience.candidates.some(candidate => candidate.source === "material_phrase" && /董事会/.test(candidate.value)));
  assert.throws(() => { authority.audience.value = "目标听众"; }, TypeError);
});

test("real simple-mode HTTP request preserves materials and produces a traceable decision outline", async () => {
  const payload = buildSimpleRequest(FORM_STATE, SIMPLE_NEED);
  observedBody = undefined;
  observedDiagnostics = undefined;
  const response = await fetch(`${baseUrl}/api/outline`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json();

  assert.equal(response.status, 200, JSON.stringify(result.quality_report || result));
  const { request_id: requestId, ...observedWithoutRequestId } = observedBody;
  assert.match(requestId, /^req_[0-9a-f-]{36}$/);
  assert.deepEqual(observedWithoutRequestId, payload);
  assert.equal(payload.has_materials, true);
  assert.equal(observedBody.client_materials, CORE_MATERIALS);
  assert.ok(observedBody.client_materials.includes("\n\n已确认事实：\n- 尚未正式进入中国市场"));
  assert.ok(observedBody.client_materials.includes("\n\n待验证假设\n- 一线城市家庭用户"));
  assert.match(result.subtitle, /管理层|内部决策者/);
  assert.doesNotMatch(`${result.title}\n${result.subtitle}\n${result.slides[0].content}`, /目标听众/);
  const visible = customerText(result);
  assert.match(visible, /E-Motion Europe/);
  assert.match(visible, /欧洲.*中国市场|中国市场.*欧洲/);
  assert.match(visible, /尚未.*进入中国市场|市场阶段.*尚未/);
  assert.match(visible, /无真实.*(?:销量|订单|试驾|转化)|没有真实客户数据/);
  assert.match(visible, /尚未确定.*(?:定价|首发车型|渠道模式|首批城市)/);
  assert.match(visible, /低成本|小范围验证/);
  const last = result.slides.at(-1);
  assert.match(`${last.title}\n${last.key_message}\n${last.content}`, /管理层与内部决策者/);
  assert.doesNotMatch(`${last.title}\n${last.key_message}\n${last.content}`, /董事会决策事项/);
  assert.match(last.content, /继续/);
  assert.match(last.content, /调整/);
  assert.match(last.content, /停止/);
  assert.equal(result.slides.length, 8);
  assert.equal(result.slides.filter(slide => slide.evidence_status === "partially_supported").length, 0);
  const fallback = buildDeterministicFallback({ input: payload });
  assert.equal(fallback.ok, true);
  assertTraceableSources(fallback.artifacts.internalOutline, CORE_MATERIALS);
  assert.ok(result.quality_report.score >= 95);
  assert.equal(result.quality_status, "fallback");
  assert.equal(result.quality_report.passed, false);
  assert.equal(result.source_summary.model_used, false);
  assert.equal(result.source_summary.fallback_used, true);
  assert.ok(result.customer_version && result.production_version);
  for (const gate of ["audience_alignment", "material_context_coverage", "confirmed_fact_coverage", "required_decisions", "evidence_traceability", "material_relevance"]) {
    assert.equal(observedDiagnostics.hard_gates[gate].passed, true, gate);
  }
  assert.equal("hard_gates" in result.quality_report, false);
  assert.ok(result.slides.every(slide => !("evidence_sources" in slide)));
});

test("final scoring rejects audience, material, decision and evidence tampering", async () => {
  const input = buildSimpleRequest(FORM_STATE, SIMPLE_NEED);
  const fallback = buildDeterministicFallback({ input });
  assert.equal(fallback.ok, true);
  const authority = fallback.artifacts.context.requestAuthority;
  const context = fallback.artifacts.context;
  const plan = fallback.artifacts.plan;
  const source = structuredClone(fallback.artifacts.internalOutline);

  const audienceDrift = adaptOutlineCandidate(source);
  audienceDrift.subtitle = "面向目标听众，用于商业汇报";
  audienceDrift.slides[0].content = audienceDrift.slides[0].content.replace(/汇报对象：.*$/m, "汇报对象：目标听众");
  assertFailedGate(scoreOutline(audienceDrift, context, plan, metadata(source, authority)), "audience_alignment");

  const missingContext = adaptOutlineCandidate(source);
  missingContext.title = missingContext.title.replace("E-Motion Europe｜", "");
  missingContext.executive_summary = missingContext.executive_summary.map(item => item.replace(/E-Motion Europe/gi, "该项目"));
  for (const slide of missingContext.slides) {
    slide.title = slide.title.replace(/E-Motion Europe/gi, "该项目");
    slide.key_message = slide.key_message.replace(/E-Motion Europe/gi, "该项目");
    slide.content = slide.content.replace(/E-Motion Europe/gi, "该项目");
    slide.visual_suggestion = slide.visual_suggestion.replace(/E-Motion Europe/gi, "该项目");
  }
  assertFailedGate(scoreOutline(missingContext, context, plan, metadata(source, authority)), "material_context_coverage");

  const missingDecision = adaptOutlineCandidate(source);
  const action = missingDecision.slides.at(-1);
  action.content = action.content.replace(/^.*管理层与内部决策者决策事项.*\n?/gm, "");
  assertFailedGate(scoreOutline(missingDecision, context, plan, metadata(source, authority)), "required_decisions");

  const falseEvidence = adaptOutlineCandidate(source);
  const negative = authority.materialContext.fragments.find(fragment => fragment.polarity === "negative");
  falseEvidence.slides[2].evidence_status = "partially_supported";
  falseEvidence.slides[2].evidence_sources = [{
    source_id: negative.source_id,
    field: negative.field,
    excerpt: negative.excerpt,
    polarity: "positive",
    evidence_type: negative.evidence_type
  }];
  assertFailedGate(scoreOutline(falseEvidence, context, plan, metadata(source, authority)), "evidence_traceability");
});

test("material handling remains generic across three unrelated domains", async () => {
  const cases = [
    {
      requirement: "制作企业内部数字化项目评审PPT，用于向管理层汇报",
      materials: "项目背景：集团财务流程数字化试点\n已确认事实：尚未完成全集团推广\n管理层重点问题：是否进入第二阶段\n决策事项：管理层确认继续、调整或停止",
      expected: /财务流程数字化试点/
    },
    {
      requirement: "制作消费品市场调研PPT，面向品牌委员会汇报",
      materials: "项目背景：无糖茶新品概念测试\n已确认事实：没有真实销量数据\n待验证假设：年轻消费者可能关注低糖\n资料缺口：价格接受度\n决策事项：品牌委员会确认继续、调整或停止",
      expected: /无糖茶新品概念测试/
    },
    {
      requirement: "制作园区招商分析PPT，给管委会内部决策",
      materials: "项目背景：临港智造园招商筹备\n已确认事实：尚未确定首批目标企业\n已有资料：产业规划摘要\n资料缺口：企业访谈\n决策事项：管委会确认继续、调整或停止",
      expected: /临港智造园招商筹备/
    }
  ];

  for (const item of cases) {
    const runtime = {};
    const result = await generateOutline({
      source_mode: "simple",
      requirement: item.requirement,
      has_materials: true,
      client_materials: item.materials,
      page_count: 8
    }, { runtime });
    assert.match(customerText(result), item.expected, item.requirement);
    assert.equal(runtime.internalDiagnostics.hard_gates.evidence_traceability.passed, true, item.requirement);
    assert.equal(runtime.internalDiagnostics.hard_gates.material_relevance.passed, true, item.requirement);
    assert.equal("hard_gates" in result.quality_report, false, item.requirement);
  }
});

function customerText(result) {
  return [result.title, result.subtitle, ...(result.executive_summary || []), ...result.slides.flatMap(slide => [slide.title, slide.key_message, slide.content])].join("\n");
}

function assertTraceableSources(result, rawMaterials) {
  for (const slide of result.slides) {
    if (["source_supported", "partially_supported"].includes(slide.evidence_status)) assert.ok(slide.evidence_sources.length > 0);
    for (const source of slide.evidence_sources) {
      assert.ok(source.source_id);
      assert.ok(source.field);
      assert.ok(source.excerpt);
      assert.ok(source.polarity);
      assert.ok(source.evidence_type);
      assert.ok(rawMaterials.includes(source.excerpt), source.excerpt);
    }
  }
}

function metadata(source, authority) {
  return { pipeline: source.pipeline, sourceOutline: source, requestAuthority: authority };
}

function assertFailedGate(report, gate) {
  assert.ok(report.score < 95 || report.hard_gates[gate].passed === false);
  assert.equal(report.hard_gates[gate].passed, false, gate);
}
