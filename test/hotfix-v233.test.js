import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { resolveQualityStatusLabel } from "../lib/generate-outline.js";
import { parseMaterialContext } from "../lib/material-context.js";
import { analyzeConfirmedFactCoverage } from "../lib/outline-scorer.js";

test("nine explicit confirmed facts pass only when each fact is reasonably covered", () => {
  const material = parseMaterialContext({ clientMaterials: `品牌：星河云平台
项目背景：计划评估进入新的企业服务市场
已确认事实：
- 尚未正式进入目标市场
- 当前无真实客户订单、咨询或转化数据
- 尚未确定定价、首发产品、渠道模式和首批区域
- 管理层希望先低成本验证，再决定扩大投入
- 董事会已批准探索预算，但尚未批准全面推广
- 已有品牌视觉规范
- 已有产品文件
- 已有内部讨论纪要
- 已整理潜在合作伙伴名单` });
  const outline = mockEightPageOutline([
    "星河云平台计划评估新的企业服务市场。",
    "项目尚处于正式市场进入前的验证阶段。",
    "当前缺乏真实客户订单、咨询和转化证据。",
    "定价、首发产品、渠道模式与首批区域仍待确认。",
    "管理层将先做低成本、小范围验证，再决定是否扩大投入。",
    "董事会已批准探索预算，但全面推广仍待确认。",
    "已有品牌视觉规范、已有产品文件、已有内部讨论纪要，并且已整理潜在合作伙伴名单。"
  ], material);
  const coverage = analyzeConfirmedFactCoverage(outline, material);

  assert.deepEqual(coverage.issues, []);
  assert.equal(coverage.total, 9);
  assert.equal(coverage.covered_count, 9);
  assert.equal(coverage.coverage, 1);
  assert.ok(coverage.covered_categories.includes("当前市场进入或项目阶段"));
  assert.ok(coverage.covered_categories.includes("数据与证据边界"));
  assert.ok(coverage.covered_categories.includes("当前管理层策略或验证原则"));
  assert.doesNotMatch(coverage.issues.join("；"), /一半|50%/);
});

test("supplementary explicit facts still require direct coverage and cannot be satisfied by unrelated text", () => {
  const material = parseMaterialContext({ clientMaterials: `已确认事实：
- 已有品牌视觉规范
- 已有产品配置清单
- 已有内部讨论纪要
- 已整理潜在合作伙伴名单` });
  const coverage = analyzeConfirmedFactCoverage(mockOutline("品牌视觉规范、产品配置清单和内部讨论纪要已归档。"), material);
  assert.equal(coverage.applicable, true);
  assert.equal(coverage.coverage, 0);
  assert.match(coverage.issues.join("；"), /explicit_confirmed_fact_coverage_incomplete/);
});

test("semantic paraphrases cover core facts without copying source sentences", () => {
  const material = parseMaterialContext({ clientMaterials: `品牌：Atlas Works
项目背景：计划进入新的企业服务市场
已确认事实：
- 尚未正式进入目标市场
- 当前没有真实客户订单和转化数据
- 尚未确定价格、首发方案、渠道和首批区域
- 管理层要求小范围验证后再扩大投入` });
  const outline = mockOutline("Atlas Works 是本次项目主体。项目仍处于正式市场运营前的可行性验证阶段；现阶段缺乏可用于结论的真实客户行为证据；价格、首发方案与渠道仍待确认；先开展轻量试点，再根据结果决定后续投入。", material);
  const coverage = analyzeConfirmedFactCoverage(outline, material);
  assert.deepEqual(coverage.issues, []);
  assert.ok(coverage.covered_categories.length >= 4);
});

test("confirmed fact coverage fails with a stable code when no explicit confirmed facts were supplied", () => {
  const material = parseMaterialContext({ clientMaterials: "项目背景：内部方案讨论" });
  const coverage = analyzeConfirmedFactCoverage(mockOutline("内部方案讨论"), material);
  assert.equal(coverage.applicable, true);
  assert.equal(coverage.coverage, 0);
  assert.equal(coverage.code, "no_explicit_confirmed_facts");
  assert.match(coverage.issues.join("；"), /no_explicit_confirmed_facts/);
});

test("quality status distinguishes low score from a high score with failed hard gates", () => {
  assert.equal(resolveQualityStatusLabel({
    score: 98,
    threshold: 95,
    productionPassed: false,
    hardGatesPassed: false,
    supportTier: "production"
  }), "总分达到生产阈值，但存在未通过的硬性检查，需人工复核");
  assert.equal(resolveQualityStatusLabel({
    score: 94,
    threshold: 95,
    productionPassed: false,
    hardGatesPassed: false,
    supportTier: "production"
  }), "未达到生产阈值，需人工复核");
});

test("front-end quality failure area exposes score, threshold, failed gate and reason", async () => {
  const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  assert.match(source, /最终分数：/);
  assert.match(source, /生产阈值：/);
  assert.match(source, /未通过的硬门槛：/);
  assert.match(source, /gate\.reason/);
  assert.match(source, /qualityReport \? "质量检查未通过" : "暂时无法生成"/);
});

function mockOutline(content, material = null) {
  return {
    title: "项目分析",
    subtitle: "面向管理层",
    executive_summary: [],
    slides: [{
      title: "项目背景与决策基础",
      key_message: "界定项目事实边界",
      content,
      visual_suggestion: "事实卡片",
      evidence_sources: evidenceSourcesFor(material)
    }]
  };
}

function mockEightPageOutline(coreLines, material = null) {
  return {
    title: "星河云平台市场进入分析",
    subtitle: "面向管理层",
    executive_summary: coreLines.slice(0, 2),
    slides: Array.from({ length: 8 }, (_, index) => ({
      title: `第${index + 1}页`,
      key_message: index < coreLines.length ? coreLines[index] : "围绕验证结果形成下一步判断。",
      content: index < coreLines.length ? coreLines[index] : "补充分析框架与行动安排。",
      visual_suggestion: "结构化信息卡片",
      evidence_sources: evidenceSourcesFor(material)
    }))
  };
}

function evidenceSourcesFor(material) {
  return (material?.confirmed_facts || []).map(fragment => ({
    source_id: fragment.source_id,
    fragment_id: fragment.fragment_id,
    field: fragment.field,
    excerpt: fragment.excerpt,
    polarity: fragment.polarity,
    assertion_type: fragment.assertion_type,
    section_type: fragment.section_type
  }));
}
