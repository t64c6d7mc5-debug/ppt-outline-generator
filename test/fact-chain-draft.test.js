import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildProfessionalRequest, buildSimpleRequest } from "../js/request-builders.js";
import { generateOutline } from "../lib/generate-outline.js";
import { buildDeterministicFallback } from "../lib/deterministic-fallback.js";
import { parseMaterialContext } from "../lib/material-context.js";
import { buildNarrativePlan } from "../lib/narrative-planner.js";
import { adaptOutlineCandidate } from "../lib/output-adapter.js";
import { repairOutline } from "../lib/outline-repair.js";
import { scoreOutline } from "../lib/outline-scorer.js";
import { buildRequestAuthority, parseRequestContext } from "../lib/request-context.js";
import { toEvidenceSource } from "../lib/evidence-state.js";
import { buildProductIntroMaterialAllocation, buildSubtitle } from "../lib/slide-generator.js";
import { createAppServer } from "../server.js";

const PROFESSIONAL_MATERIALS = `项目背景
项目名称：滨海智造园招商更新
地点：上海临港
面积：12万平方米
产业方向：智能制造与新能源装备

已确认事实：
- 项目位于上海临港
- 规划面积12万平方米
- 已建成标准厂房与路演中心
- 管理层已确认先开展小范围招商验证

资料缺口：
- 首批目标企业访谈待补充`;

const PRODUCT_INTRO_STRUCTURED_CONFIRMED = `测试素材，以下仅用于验收：

已确认事实｜目标客户
* 目标客户为连锁茶饮品牌、咖啡店、烘焙门店、轻食餐饮品牌、外卖运营团队。

已确认事实｜产品与工艺
* 产品材料包括铝箔保温层、加厚无纺布、食品接触级内衬、环保牛皮纸。
* 工艺能力包括覆膜、防油、加固手提、烫金、局部 UV、四色印刷。

已确认事实｜定制能力
* 定制能力包括品牌 logo、活动主题、节日限定图案、尺寸结构、起订量方案。

已确认事实｜应用场景
* 应用场景包括外卖配送、门店打包、节日促销、品牌联名、企业团购。

已确认事实｜服务流程
* 服务流程包括需求沟通、尺寸材质建议、设计打样、确认报价、批量生产、质检包装、物流交付。

已确认事实｜交付能力
* 交付能力为常规样品 3 到 5 天，批量订单 7 到 15 天，支持分批发货和复购补单。

待确认内容｜目标客户
* 不得写未提供的客户名称、认证资质、销售额、市场份额或合作品牌。`;

const PRODUCT_INTRO_STRUCTURED_ORDINARY = `普通资料｜企业定位
* 专注外卖保温袋、奶茶袋、咖啡袋和餐饮外带包装定制的供应商。

普通资料｜目标客户
* 连锁茶饮品牌、咖啡店、烘焙门店、轻食餐饮品牌、外卖运营团队。

普通资料｜产品与工艺
* 产品类别包括铝箔保温袋、无纺布保温袋、牛皮纸奶茶袋、咖啡外带袋、节日主题包装袋。
* 材料与工艺包括铝箔保温层、加厚无纺布、食品接触级内衬、环保牛皮纸、覆膜、防油、加固手提、烫金、局部 UV、四色印刷。

普通资料｜定制能力
* 可定制品牌 logo、活动主题、节日限定图案、尺寸结构、起订量方案。

普通资料｜应用场景
* 适用于外卖配送、门店打包、节日促销、品牌联名、企业团购。

普通资料｜服务流程
* 服务流程包括需求沟通、尺寸材质建议、设计打样、确认报价、批量生产、质检包装、物流交付。

普通资料｜交付能力
* 常规样品 3 到 5 天，批量订单 7 到 15 天，支持分批发货和复购补单。

待确认内容｜目标客户
* 目标客户名单仍需客户确认。`;

const PRODUCT_INTRO_REAL_D1_MATERIALS = `普通资料｜企业定位
* 测试素材公司专注外卖保温袋、奶茶袋、咖啡袋和餐饮外带包装定制。

普通资料｜目标客户
* 客户沟通对象包括茶饮、咖啡、烘焙、轻食和外卖运营团队。

已确认事实｜目标客户
* 目标客户为连锁茶饮品牌、咖啡店、烘焙门店、轻食餐饮品牌、外卖运营团队。

已确认事实｜产品与工艺
* 产品材料包括铝箔保温层、加厚无纺布、食品接触级内衬、环保牛皮纸。
* 工艺能力包括覆膜、防油、加固手提、烫金、局部 UV、四色印刷。

已确认事实｜定制能力
* 定制能力包括品牌 logo、活动主题、节日限定图案、尺寸结构、起订量方案。

已确认事实｜应用场景
* 应用场景包括外卖配送、门店打包、节日促销、品牌联名、企业团购。

已确认事实｜服务流程
* 服务流程包括需求沟通、尺寸材质建议、设计打样、确认报价、批量生产、质检包装、物流交付。

已确认事实｜交付能力
* 交付能力为常规样品 3 到 5 天，批量订单 7 到 15 天，支持分批发货和复购补单。

待确认内容｜目标客户
* 是否需要补充重点客户行业和采购决策人。`;

let server;
let baseUrl;

before(async () => {
  server = createAppServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test("professional request preserves multiline materials for section parsing", () => {
  const request = buildProfessionalRequest({
    topic: "园区招商方案",
    materialDetails: PROFESSIONAL_MATERIALS,
    pageCount: 8,
    style: "商务正式",
    purpose: "内部评审",
    audience: "管理层",
    materials: ["有文字资料"]
  });
  assert.match(request.client_materials, /\n已确认事实：\n- 项目位于上海临港/);
  const material = parseMaterialContext({ clientMaterials: request.client_materials });
  assert.equal(material.confirmed_facts.length, 8);
  assert.ok(material.confirmed_facts.every(item => item.assertion_type === "explicit_confirmed_fact"));
  assert.ok(material.confirmed_facts.some(item => item.excerpt.includes("上海临港")));
  assert.ok(material.pending_suggestions.some(item => item.excerpt.includes("首批目标企业访谈")));
});

test("professional field facts enter confirmed without promoting supplemental or background text", () => {
  const material = parseMaterialContext({ clientMaterials: `项目背景：
本项目处于招商准备阶段
项目名称：滨海智造园
地点：上海临港
面积：12万平方米
产业方向：智能制造与新能源装备
园区设施：标准厂房与路演中心
服务能力：招商接待、企业宣传、展示屏发布
建设时间：2025年完成一期建设
明确数据：首期载体面积12万平方米

补充资料：
- 这是客户补充给制作团队的参考口径

普通说明：已确认事实这几个字出现在正文里，但不能切换章节` });
  const excerpts = material.confirmed_facts.map(item => item.excerpt);
  assert.equal(material.confirmed_facts.length, 8);
  assert.ok(excerpts.some(item => item.includes("项目名称：滨海智造园")));
  assert.ok(excerpts.some(item => item.includes("地点：上海临港")));
  assert.ok(excerpts.some(item => item.includes("服务能力：招商接待")));
  assert.ok(!excerpts.some(item => /招商准备阶段|补充给制作团队|普通说明/.test(item)));
  assert.ok(material.supplemental.some(item => item.excerpt.includes("客户补充")));
});

test("professional material headings stop confirmed fact section inheritance", () => {
  const material = parseMaterialContext({ clientMaterials: `${PROFESSIONAL_MATERIALS}

普通素材事实：
- 产业方向为智能制造与新能源装备

待确认事项：
- 首批目标企业名单待确认
- 是否没有客户数据待确认` });
  assert.equal(material.confirmed_facts.length, 8);
  assert.ok(material.material_facts.some(item => item.excerpt.includes("产业方向")));
  assert.ok(material.pending_items.some(item => item.excerpt.includes("首批目标企业名单")));
  assert.ok(!material.confirmed_facts.some(item => /待确认|是否没有/.test(item.excerpt)));
});

test("confirmed facts support explicit negative facts but not pending negatives", () => {
  const material = parseMaterialContext({ clientMaterials: `已确认事实：
- 已确认当前暂无正式预算
- 已确认一期不包含住宿功能
- 已确认项目尚未开工

待确认事项：
- 是否没有客户数据待确认
- 尚未确定是否收集订单数据` });
  assert.equal(material.confirmed_facts.length, 3);
  assert.ok(material.confirmed_facts.some(item => item.polarity === "negative" && item.excerpt.includes("暂无正式预算")));
  assert.ok(material.confirmed_facts.some(item => item.excerpt.includes("不包含住宿功能")));
  assert.ok(material.confirmed_facts.some(item => item.polarity === "negative" && item.excerpt.includes("尚未开工")));
  assert.ok(material.pending_items.every(item => item.assertion_type === "pending_suggestion"));
  assert.ok(!material.confirmed_facts.some(item => /是否没有|尚未确定是否/.test(item.excerpt)));
});

test("section heading recognition is conservative and deterministic", () => {
  for (const heading of ["普通素材事实：", "普通素材事实:", "普通素材事实", "  普通素材事实  "]) {
    const material = parseMaterialContext({ clientMaterials: `已确认事实：
- 项目位于上海临港
${heading}
- 产业方向为智能制造与新能源装备` });
    assert.equal(material.confirmed_facts.length, 1, heading);
    assert.equal(material.material_facts.length, 1, heading);
  }

  const colonBody = parseMaterialContext({ clientMaterials: `已确认事实：
- 项目说明：位于上海临港，规划面积12万平方米` });
  assert.equal(colonBody.confirmed_facts.length, 1);

  const inlineAlias = parseMaterialContext({ clientMaterials: `项目背景：
这一段正文提到已确认事实：客户曾经讨论过招商方向，但它不是独立章节标题
- 后续行不应继承到 confirmed` });
  assert.equal(inlineAlias.confirmed_facts.length, 0);

  const unknownHeading = parseMaterialContext({ clientMaterials: `已确认事实：
- 项目位于上海临港
其他说明：
- 这行不应继承为确认事实` });
  assert.equal(unknownHeading.confirmed_facts.length, 1);
  assert.ok(!unknownHeading.confirmed_facts.some(item => item.excerpt.includes("这行不应")));
});

test("legacy unstructured material remains traceable and unclassified", () => {
  const material = parseMaterialContext({ clientMaterials: `企业定位是一家包装供应商。
目标客户包括连锁茶饮品牌。` });
  assert.equal(material.fragments.length, 2);
  assert.equal(material.fragments[0].source_id, "client_materials-001");
  assert.equal(material.fragments[0].fragment_id, "client_materials:unclassified:001");
  assert.equal(material.fragments[0].assertion_type, "user_material_fact");
  assert.equal(material.fragments[0].field, "unclassified");
  assert.equal(material.fragments[0].section_type, "unclassified");
  assert.equal(material.fragments[0].category, "unclassified");
  assert.ok(material.user_material_facts.some(item => item.excerpt.includes("包装供应商")));
});

test("legacy single confirmed fact heading remains explicit and unclassified", () => {
  const material = parseMaterialContext({ clientMaterials: `已确认事实
* 客户已确认服务流程包含需求沟通和物流交付` });
  assert.equal(material.confirmed_facts.length, 1);
  const [fact] = material.confirmed_facts;
  assert.equal(fact.assertion_type, "explicit_confirmed_fact");
  assert.equal(fact.field, "confirmed_facts");
  assert.equal(fact.section_type, "confirmed_facts");
  assert.equal(fact.category, "unclassified");
  assert.match(fact.excerpt, /服务流程包含需求沟通/);
});

test("compound controlled headings assign independent category and assertion type", () => {
  const material = parseMaterialContext({ clientMaterials: `普通资料｜目标客户
* 连锁茶饮品牌和咖啡店是主要沟通对象

已确认事实｜服务流程
* 客户已确认服务流程包含需求沟通、设计打样和物流交付

待确认内容｜交付能力
* 批量交付周期仍需客户确认` });
  const audience = material.material_facts.find(item => item.excerpt.includes("连锁茶饮"));
  const confirmed = material.confirmed_facts.find(item => item.excerpt.includes("设计打样"));
  const pending = material.pending_items.find(item => item.excerpt.includes("批量交付周期"));
  assert.ok(audience);
  assert.equal(audience.assertion_type, "user_material_fact");
  assert.equal(audience.field, "material_facts");
  assert.equal(audience.section_type, "material_facts");
  assert.equal(audience.category, "target_audience");
  assert.ok(confirmed);
  assert.equal(confirmed.assertion_type, "explicit_confirmed_fact");
  assert.equal(confirmed.field, "confirmed_facts");
  assert.equal(confirmed.section_type, "confirmed_facts");
  assert.equal(confirmed.category, "service_process");
  assert.ok(pending);
  assert.equal(pending.assertion_type, "pending_suggestion");
  assert.equal(pending.field, "pending_items");
  assert.equal(pending.section_type, "pending_items");
  assert.equal(pending.category, "delivery_capability");
  assert.ok(!material.confirmed_facts.some(item => item.excerpt.includes("批量交付周期")));
});

test("invalid compound headings reset state and never inherit confirmed identity", () => {
  const material = parseMaterialContext({ clientMaterials: `已确认事实｜服务流程
* 服务流程包含需求沟通

已确认内容｜目标客户
* 这一行不应继承确认身份

已确认事实｜未知类别
* 这一行也不应继承确认身份

已确认事实｜目标客户｜额外
* 这一行仍不应继承确认身份

已确认事实｜
* 这一行还是普通内容

普通资料｜产品与工艺
* 产品工艺包含覆膜和热封。` });
  assert.equal(material.confirmed_facts.length, 1);
  assert.equal(material.confirmed_facts[0].category, "service_process");
  const resetFragments = material.fragments.filter(item => /不应继承|还是普通内容/.test(item.excerpt));
  assert.equal(resetFragments.length, 4);
  assert.ok(resetFragments.every(item => item.assertion_type === "user_material_fact"));
  assert.ok(resetFragments.every(item => item.category === "unclassified"));
  assert.ok(resetFragments.every(item => item.field === "unclassified"));
  const product = material.material_facts.find(item => item.excerpt.includes("产品工艺包含覆膜"));
  assert.ok(product);
  assert.equal(product.assertion_type, "user_material_fact");
  assert.equal(product.category, "product_and_process");
});

test("compound title words inside paragraph do not switch section", () => {
  const material = parseMaterialContext({ clientMaterials: `项目背景：
这段正文只是提到 已确认事实｜目标客户 这个格式，不是独立标题。
* 后续内容继续描述交付细节。` });
  assert.equal(material.confirmed_facts.length, 0);
  assert.equal(material.fragments.length, 2);
  assert.ok(material.fragments.every(item => item.assertion_type === "user_material_fact"));
  assert.ok(material.fragments.every(item => item.category === "unclassified"));
  assert.ok(material.fragments.every(item => item.section_type === "project_background"));
});

test("parseMaterialContext generates deterministic fragment and source IDs", () => {
  const first = parseMaterialContext({ clientMaterials: PROFESSIONAL_MATERIALS });
  const second = parseMaterialContext({ clientMaterials: PROFESSIONAL_MATERIALS });
  assert.deepEqual(
    first.fragments.map(item => [item.fragment_id, item.source_id, item.assertion_type, item.section_type, item.excerpt]),
    second.fragments.map(item => [item.fragment_id, item.source_id, item.assertion_type, item.section_type, item.excerpt])
  );
});

test("product intro allocation is global, capacity-aware and confirmed-first", () => {
  const context = productIntroContext({
    source_mode: "professional",
    client_materials: `${PRODUCT_INTRO_STRUCTURED_CONFIRMED}

普通资料｜产品与工艺
* 普通资料不应抢占已经由 confirmed 用完的能力页槽位。

普通资料｜目标客户
* 普通资料可在 confirmed 之后使用剩余定位页槽位。`
  });
  const allocation = buildProductIntroMaterialAllocation(context);
  assert.deepEqual(allocation.capacities.product_or_process_capability, {
    total_slots: 3,
    confirmed_slots: 3,
    ordinary_slots: 3,
    used_slots: 3,
    remaining_slots: 0,
    min_generic_items: 2,
    final_content_limit: 5,
    replacement_positions: [0, 1, 2]
  });
  assert.equal(new Set(allocation.records.map(item => item.fragment_id)).size, allocation.records.length);
  assert.equal(allocation.records.filter(item => item.assigned_section_id === "product_or_process_capability").length, 3);
  const ordinaryCapability = allocation.records.find(item => item.rendered_text.includes("普通资料不应抢占"));
  assert.ok(ordinaryCapability);
  assert.equal(ordinaryCapability.assigned_section_id, "product_or_process_capability");
  assert.equal(ordinaryCapability.allocation_priority, 2);
  assert.ok(allocation.records.filter(item => item.assigned_section_id === "product_or_process_capability").every((item, index, items) =>
    index === 0 || items[index - 1].allocation_priority <= item.allocation_priority
  ));
  const ordinaryAudience = allocation.records.find(item => item.rendered_text.includes("普通资料可在 confirmed"));
  assert.ok(ordinaryAudience);
  assert.equal(ordinaryAudience.assigned_section_id, "target_audience");
  assert.equal(ordinaryAudience.allocation_priority, 2);
  assert.ok(allocation.records.filter(item => item.assigned_section_id === "target_audience").every((item, index, items) =>
    index === 0 || items[index - 1].allocation_priority <= item.allocation_priority
  ));
});

test("product intro allocation fallback and fragment identity are deterministic", () => {
  const context = productIntroContext({
    source_mode: "professional",
    client_materials: `已确认事实｜目标客户
* 目标客户第一条事实。
* 目标客户第二条事实。
* 目标客户第三条事实。`
  });
  const allocation = buildProductIntroMaterialAllocation(context);
  assert.equal(allocation.records.length, 3);
  assert.deepEqual(allocation.records.map(item => item.assigned_section_id), ["target_audience", "target_audience", "market_or_customer_challenge"]);
  assert.equal(new Set(allocation.records.map(item => item.fragment_id)).size, 3);
  assert.equal(new Set(allocation.records.map(item => item.rendered_text)).size, 3);
});

test("product intro allocation allows different fragments from one source identity", () => {
  const context = productIntroContext({
    source_mode: "professional",
    client_materials: PRODUCT_INTRO_STRUCTURED_CONFIRMED
  });
  const allocation = buildProductIntroMaterialAllocation(context);
  const sourceIds = allocation.records.map(item => item.source_id);
  assert.equal(sourceIds.length, 7);
  assert.equal(new Set(allocation.records.map(item => item.fragment_id)).size, 7);
  assert.ok(allocation.records.every(item => item.rendered_text.includes(item.fragment.excerpt)));
});

test("product intro structured confirmed facts render, bind and cover without leaking allocation data", async () => {
  const input = productIntroInput({
    source_mode: "professional",
    client_materials: PRODUCT_INTRO_STRUCTURED_CONFIRMED
  });
  const { result, internalDiagnostics } = await generateOutlineWithInternalDiagnostics(input);
  const text = flattenOutline(result);
  for (const expected of [
    "目标客户为连锁茶饮品牌",
    "产品材料包括铝箔保温层",
    "工艺能力包括覆膜",
    "定制能力包括品牌 logo",
    "应用场景包括外卖配送",
    "服务流程包括需求沟通",
    "交付能力为常规样品 3 到 5 天"
  ]) {
    assert.match(text, new RegExp(expected));
  }
  assert.equal(internalDiagnostics.confirmed_fact_coverage.total, 7);
  assert.equal(internalDiagnostics.confirmed_fact_coverage.covered_count, 7);
  assert.equal(internalDiagnostics.confirmed_fact_coverage.code, "ok");
  assert.equal("confirmed_fact_coverage" in result.quality_report, false);
  assert.ok(!text.includes("目标客户名单仍需客户确认"));
  assertNoInternalUsageLeak(result);
  const fallback = buildDeterministicFallback({ input });
  assert.equal(fallback.ok, true);
  const evidencePairs = fallback.artifacts.internalOutline.slides.flatMap(slide => (slide.evidence_sources || []).map(source => ({
    slide_type: slide.slide_type,
    source_id: source.source_id,
    fragment_id: source.fragment_id,
    excerpt: source.excerpt
  })));
  assert.ok(evidencePairs.length >= 7);
  assert.ok(evidencePairs.every(pair => fallback.artifacts.internalOutline.slides.some(slide => slide.slide_type === pair.slide_type && slide.content.includes(pair.excerpt))));
  assert.doesNotMatch(JSON.stringify(result), /evidence_sources|fragment_id|source_id/);
});

test("product intro real D1 direct material keeps internal evidence while public output is redacted", async () => {
  const input = productIntroInput({
    style: "正式",
    purpose: "展示",
    material_categories: [],
    must_include: ["目标客户", "产品材料", "工艺能力", "定制能力", "应用场景", "服务流程", "交付能力"],
    excluded_content: ["未提供的客户名称", "认证资质", "销售额", "市场份额", "合作品牌不得写成事实"],
    emphasis: "逻辑清晰",
    client_materials: PRODUCT_INTRO_REAL_D1_MATERIALS
  });
  const { result, internalDiagnostics } = await generateOutlineWithInternalDiagnostics(input);

  const page2 = result.slides.find(slide => slide.slide_type === "target_audience");
  assert.ok(page2);
  assert.match(page2.content, /客户沟通对象包括茶饮、咖啡、烘焙、轻食和外卖运营团队/);
  const fallback = buildDeterministicFallback({ input });
  const internalPage2 = fallback.artifacts.internalOutline.slides.find(slide => slide.slide_type === "target_audience");
  assert.ok(internalPage2.evidence_sources.some(source =>
    source.source_id === "client_materials-002"
    && source.fragment_id === "client_materials:material_facts:002"
    && source.excerpt === "客户沟通对象包括茶饮、咖啡、烘焙、轻食和外卖运营团队。"
  ));
  assert.ok(internalPage2.evidence_sources.some(source =>
    source.source_id === "client_materials-003"
    && source.fragment_id === "client_materials:confirmed_facts:003"
    && internalPage2.content.includes(source.excerpt)
  ));
  assert.equal(internalDiagnostics.hard_gates.evidence_traceability.passed, true);
  assert.equal(internalDiagnostics.confirmed_fact_coverage.total, 7);
  assert.equal(internalDiagnostics.confirmed_fact_coverage.covered_count, 7);
  assert.equal(internalDiagnostics.confirmed_fact_coverage.code, "ok");
  assert.equal("confirmed_fact_coverage" in result.quality_report, false);
  assert.equal("evidence_sources" in page2, false);
  assert.ok(!flattenOutline(result).includes("是否需要补充重点客户行业和采购决策人"));
  assertNoInternalUsageLeak(result);
});

test("product intro structured ordinary facts use at least four categories without confirmed coverage", async () => {
  const { result, internalDiagnostics } = await generateOutlineWithInternalDiagnostics(productIntroInput({
    source_mode: "simple",
    allow_draft: true,
    output_intent: "draft_allowed",
    client_materials: PRODUCT_INTRO_STRUCTURED_ORDINARY
  }));
  const text = flattenOutline(result);
  const used = [
    "专注外卖保温袋",
    "连锁茶饮品牌",
    "产品类别包括铝箔保温袋",
    "可定制品牌 logo",
    "适用于外卖配送",
    "服务流程包括需求沟通",
    "常规样品 3 到 5 天"
  ].filter(item => text.includes(item));
  assert.ok(used.length >= 4);
  assert.equal(internalDiagnostics.confirmed_fact_coverage.total, 0);
  assert.equal("confirmed_fact_coverage" in result.quality_report, false);
  assert.ok(!text.includes("目标客户名单仍需客户确认"));
  assertNoInternalUsageLeak(result);
});

test("product intro structured and legacy material paths stay mutually exclusive", async () => {
  const result = await generateOutline(productIntroInput({
    source_mode: "simple",
    allow_draft: true,
    output_intent: "draft_allowed",
    client_materials: `${PRODUCT_INTRO_STRUCTURED_ORDINARY}

旧格式普通资料仍应保留在 legacy 路径中。`
  }));
  const text = flattenOutline(result);
  assert.equal(countOccurrences(text, "产品类别包括铝箔保温袋"), 1);
  assert.equal(countOccurrences(text, "旧格式普通资料仍应保留在 legacy 路径中"), 0);
  assertNoInternalUsageLeak(result);
});

test("zero explicit confirmed facts remains visible as a gate warning without pretending a conflict exists", async () => {
  const runtime = {};
  const result = await generateOutline({
    source_mode: "professional",
    requirement: "制作园区招商方案",
    audience: "管理层",
    page_count: 6,
    client_materials: "项目背景：临港项目处于前期沟通阶段"
  }, { runtime });
  assert.equal(runtime.internalDiagnostics.hard_gates.confirmed_fact_coverage.passed, false);
  assert.equal("hard_gates" in result.quality_report, false);
  assert.equal(result.quality_status, "fallback");
  assert.ok(result.customer_version && result.production_version);
});

test("confirmed fact coverage remains available internally while final and HTTP output redact it", async () => {
  const coverageChainMaterials = PROFESSIONAL_MATERIALS.replace("\n- 管理层已确认先开展小范围招商验证", "");
  const input = {
    source_mode: "professional",
    requirement: "园区招商方案",
    audience: "管理层",
    purpose: "内部评审",
    page_count: 8,
    client_materials: coverageChainMaterials
  };
  const runtime = {};
  const result = await generateOutline(input, { runtime });
  const qualityReport = runtime.internalDiagnostics;
  assert.equal(qualityReport.confirmed_fact_coverage.total, 7);
  assert.equal(qualityReport.confirmed_fact_coverage.covered_count, 7);
  assert.equal(qualityReport.confirmed_fact_coverage.code, "ok");
  assert.equal("confirmed_fact_coverage" in result.quality_report, false);

  const response = await fetch(`${baseUrl}/api/outline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal("confirmed_fact_coverage" in payload.quality_report, false);
});

test("invalid or missing source IDs cannot be repaired by fuzzy source guessing", () => {
  const input = {
    source_mode: "professional",
    requirement: "园区招商方案",
    audience: "管理层",
    page_count: 8,
    client_materials: PROFESSIONAL_MATERIALS
  };
  const authority = buildRequestAuthority(input);
  const context = parseRequestContext(input, authority);
  const plan = buildNarrativePlan(context);
  const candidate = adaptOutlineCandidate({
    title: "园区招商方案",
    subtitle: "面向管理层",
    executive_summary: ["项目位于上海临港"],
    global_visual_style: {},
    missing_materials: [],
    production_strategy: {},
    pipeline: "server-generate-outline",
    slides: [{
      _pageId: "background:1",
      index: 1,
      title: "项目背景",
      content: "• 项目位于上海临港",
      visual_suggestion: "信息卡片",
      image_prompt: "不使用 AI 生图",
      slide_type: "background",
      role: "background",
      objective: "说明背景",
      key_message: "项目位于上海临港",
      evidence_status: "source_supported",
      evidence_sources: [{ source_id: "missing-source", excerpt: "项目位于上海临港", field: "confirmed_facts", polarity: "positive", evidence_type: "provided_source" }],
      data_requirements: [],
      speaker_notes: "",
      visual_spec: {}
    }]
  });
  const report = scoreOutline(candidate, context, plan, {
    pipeline: "server-generate-outline",
    sourceOutline: candidate,
    requestAuthority: authority
  });
  assert.equal(report.hard_gates.evidence_traceability.passed, false);
});

test("score alone cannot promote a deterministic fallback to production_ready", async () => {
  const review = await generateOutline({
    source_mode: "simple",
    allow_draft: true,
    requirement: "制作一个团队沟通主题PPT",
    page_count: 6
  });
  assert.equal(review.output_status, "fallback");
  assert.equal(review.quality_status, "fallback");
  assert.equal(review.quality_report.passed, false);
  assert.equal(review.quality_report.production_ready, false);
  assert.equal(review.quality_report.review_required, false);
  assert.equal(review.quality_report.threshold, 95);
  assert.equal(review.source_summary.fallback_used, true);
  assert.equal("hard_gates" in review.quality_report, false);
  assert.ok(review.customer_version && review.production_version);

  const professional = await generateOutline({ source_mode: "professional", allow_draft: true, requirement: "制作一个团队沟通主题PPT", page_count: 6 });
  assert.equal(professional.quality_status, "fallback");
});

test("simple and professional responses return complete fallback scripts when no model is used", async () => {
  const simpleResponse = await fetch(`${baseUrl}/api/outline`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      source_mode: "simple",
      allow_draft: true,
      requirement: "帮我做一份新能源汽车产业园招商 PPT"
    })
  });
  const simple = await simpleResponse.json();
  assert.equal(simpleResponse.status, 200, JSON.stringify(simple));
  assert.equal(simple.output_status, "fallback");
  assert.equal(simple.quality_status, "fallback");
  assert.equal(simple.production_ready, false);
  assert.equal(simple.quality_report.passed, false);
  assert.equal(simple.quality_report.production_ready, false);
  assert.equal(simple.source_summary.fallback_used, true);
  assert.ok(simple.customer_version && simple.production_version);
  assert.ok(Array.isArray(simple.slides) && simple.slides.length > 0);
  assert.deepEqual(simple.slides.map(slide => slide.index), simple.slides.map((_, index) => index + 1));

  const professionalResponse = await fetch(`${baseUrl}/api/outline`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      source_mode: "professional",
      allow_draft: true,
      requirement: "制作一个团队沟通主题PPT",
      page_count: 6
    })
  });
  const professional = await professionalResponse.json();
  assert.equal(professionalResponse.status, 200, JSON.stringify(professional));
  assert.equal(professional.quality_status, "fallback");
  assert.ok(professional.customer_version && professional.production_version);
});

test("simple mode cleans spoken action prefixes without changing formal titles", async () => {
  const park = await generateOutline({
    source_mode: "simple",
    allow_draft: true,
    requirement: "帮我做一份新能源汽车产业园招商PPT"
  });
  assert.equal(park.title, "新能源汽车产业园招商方案｜招商价值与合作路径");
  assert.equal(park.slides[0].title, "新能源汽车产业园招商方案：价值主张与落地路径");
  assert.doesNotMatch(`${park.title}\n${park.slides[0].title}`, /^做|帮我做|我要做/);
  assert.match(park.executive_summary[0], /本脚本围绕“新能源汽车产业园招商”/);
  assert.match(park.executive_summary[1], /完整结构/);
  assert.match(park.executive_summary[2], /待确认|建议补充资料/);

  const launch = await generateOutline({
    source_mode: "simple",
    allow_draft: true,
    requirement: "我要做一个咖啡品牌发布会PPT"
  });
  assert.doesNotMatch(launch.title, /我要做一个|我要做|做一个/);
  assert.match(launch.title, /咖啡品牌发布会/);

  const formal = await generateOutline({
    source_mode: "simple",
    allow_draft: true,
    requirement: "做时间的朋友PPT"
  });
  assert.match(formal.title, /^做时间的朋友/);

  const brand = await generateOutline({
    source_mode: "simple",
    allow_draft: true,
    requirement: "做自己品牌发布会PPT"
  });
  assert.match(brand.title, /^做自己品牌发布会/);
});

test("roadmap-like titles match staged execution content semantically", () => {
  const input = { source_mode: "simple", allow_draft: true, requirement: "园区招商方案", page_count: 6 };
  const authority = buildRequestAuthority(input);
  const context = parseRequestContext(input, authority);
  const plan = buildNarrativePlan(context);
  for (const title of ["实施路线图", "推进计划", "落地路径", "阶段规划"]) {
    const candidate = adaptOutlineCandidate(baseOutline([
      {
        _pageId: "cover:1",
        index: 1,
        title: "园区招商方案",
        content: "• 汇报对象：目标听众",
        slide_type: "cover",
        role: "cover",
        key_message: "建立主题与阅读预期",
        evidence_status: "framework_only",
        evidence_sources: []
      },
      {
        _pageId: "plan:2",
        index: 2,
        title,
        content: "• 第一阶段完成资料确认和目标企业梳理\n• 第二阶段推进到访沟通和责任分工\n• 第三阶段形成交付物并建立复盘机制",
        slide_type: "plan",
        role: "action",
        key_message: "按阶段、节点、责任和交付物推进招商草案。",
        evidence_status: "recommendation",
        evidence_sources: []
      }
    ]));
    const report = scoreOutline(candidate, context, plan, {
      pipeline: "server-generate-outline",
      sourceOutline: candidate,
      requestAuthority: authority
    });
    assert.equal(report.hard_gates.title_content_match.passed, true, title);
    assert.ok(!report.issue_codes.includes("title-content-mismatch"), title);
  }
});

test("simple mode content state keeps user constraints ahead of model suggestions", async () => {
  await withMockLocalPlanning(projectPlanAnalysis({
    audience: "潜在客户",
    purpose: "招商推介",
    business_scenario: "外部招商",
    recommended_page_count: 8,
    sections: realLikeProjectPlanSections().slice(0, 8)
  }), async () => {
    const { result, internalDiagnostics } = await generateOutlineWithInternalDiagnostics({
      source_mode: "simple",
      allow_draft: true,
      requirement: "请向管理层汇报新能源汽车产业园招商方案，做8页",
      style: "商务正式"
    });
    const state = internalDiagnostics.content_state;
    assert.equal(result.output_status, "review_required");
    assert.equal(result.production_ready, false);
    assert.ok(result.customer_version && result.production_version);
    assert.equal(result.slides.length, 8);
    assert.equal(result.quality_report.planning_model.used, true);
    assert.ok(state.confirmed.some(item => item.key === "page_count" && item.value === "8页"));
    assert.ok(state.confirmed.some(item => item.key === "audience" && /管理层/.test(item.value)));
    assert.ok(state.confirmed.some(item => item.key === "style" && item.value === "商务正式"));
    assert.ok(state.suggested.some(item => item.key === "scenario" && item.source === "local_model"));
    assert.ok(state.suggested.some(item => item.key === "structure" && item.source === "local_model"));
    assert.ok(state.needs_confirmation.some(item => item.key === "missing:location"));
    assertMutuallyExclusiveContentState(state);
    assert.ok(result.content_state_summary.suggested.some(item => /内容结构/.test(item)));
  });
});

test("simple mode model failure remains transparently traceable as complete fallback", async () => {
  const previous = {
    enabled: process.env.LOCAL_MODEL_ENABLED,
    required: process.env.LOCAL_MODEL_REQUIRED,
    key: process.env.OPENWEBUI_API_KEY,
    url: process.env.OPENWEBUI_BASE_URL,
    model: process.env.LOCAL_MODEL_ID
  };
  Object.assign(process.env, {
    LOCAL_MODEL_ENABLED: "true",
    LOCAL_MODEL_REQUIRED: "false",
    OPENWEBUI_API_KEY: "local-test-key",
    OPENWEBUI_BASE_URL: "http://127.0.0.1:8080",
    LOCAL_MODEL_ID: "qwen3:32b"
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("127.0.0.1:8080")) throw new Error("model unavailable");
    return originalFetch(url, options);
  };
  try {
    const { result, internalDiagnostics } = await generateOutlineWithInternalDiagnostics({
      source_mode: "simple",
      allow_draft: true,
      requirement: "帮我做一份新能源汽车产业园招商 PPT"
    });
    assert.equal(result.output_status, "fallback");
    assert.equal(result.quality_status, "fallback");
    assert.equal(result.quality_report.planning_model.used, false);
    assert.equal(result.quality_report.planning_model.status, "fallback");
    assert.equal(internalDiagnostics.planning_model.reason_code, "LOCAL_MODEL_UNAVAILABLE");
    assert.equal(result.source_summary.fallback_used, true);
    assert.equal(result.source_summary.model_used, false);
    assert.ok(result.customer_version && result.production_version);
    assert.ok(internalDiagnostics.warnings.some(item => /本地规划模型不可用/.test(item)));
    assert.equal("warnings" in result.quality_report, false);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("LOCAL_MODEL_ENABLED", previous.enabled);
    restoreEnv("LOCAL_MODEL_REQUIRED", previous.required);
    restoreEnv("OPENWEBUI_API_KEY", previous.key);
    restoreEnv("OPENWEBUI_BASE_URL", previous.url);
    restoreEnv("LOCAL_MODEL_ID", previous.model);
  }
});

test("required local model failure returns an explicit safe fallback instead of an HTTP error", async () => {
  const previous = {
    enabled: process.env.LOCAL_MODEL_ENABLED,
    required: process.env.LOCAL_MODEL_REQUIRED,
    key: process.env.OPENWEBUI_API_KEY,
    url: process.env.OPENWEBUI_BASE_URL,
    model: process.env.LOCAL_MODEL_ID
  };
  Object.assign(process.env, {
    LOCAL_MODEL_ENABLED: "true",
    LOCAL_MODEL_REQUIRED: "true",
    OPENWEBUI_API_KEY: "local-test-key",
    OPENWEBUI_BASE_URL: "http://127.0.0.1:8080",
    LOCAL_MODEL_ID: "qwen3:32b"
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("127.0.0.1:8080")) throw new Error("model unavailable");
    return originalFetch(url, options);
  };
  try {
    const response = await fetch(`${baseUrl}/api/outline`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source_mode: "simple",
        allow_draft: true,
        requirement: "帮我做一份新能源汽车产业园招商 PPT"
      })
    });
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.quality_status, "fallback");
    assert.equal(payload.source_summary.model_used, false);
    assert.equal(payload.source_summary.fallback_used, true);
    assert.ok(payload.customer_version && payload.production_version);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("LOCAL_MODEL_ENABLED", previous.enabled);
    restoreEnv("LOCAL_MODEL_REQUIRED", previous.required);
    restoreEnv("OPENWEBUI_API_KEY", previous.key);
    restoreEnv("OPENWEBUI_BASE_URL", previous.url);
    restoreEnv("LOCAL_MODEL_ID", previous.model);
  }
});

test("model analysis never becomes confirmed facts", () => {
  const input = { requirement: "制作企业项目汇报", source_mode: "simple" };
  const model = { audience: "管理层", purpose: "内部汇报", business_scenario: "项目复盘", sections: [] };
  const authority = buildRequestAuthority(input, model);
  const context = parseRequestContext(input, authority, model);
  assert.deepEqual(context.materialContext.model_inferences, []);
  assert.deepEqual(context.materialContext.confirmed_facts, []);
});

test("model analysis cannot change explicit confirmed fact denominator", () => {
  const input = {
    source_mode: "professional",
    requirement: "园区招商方案",
    audience: "管理层",
    page_count: 8,
    client_materials: PROFESSIONAL_MATERIALS
  };
  const model = {
    audience: "管理层",
    purpose: "内部评审",
    business_scenario: "招商更新",
    confirmed_facts: ["模型推断：已有完整招商线索"],
    pending_suggestions: ["模型建议：增加预算页"],
    sections: [{ section_id: "background", role: "background", objective: "背景" }]
  };
  const authority = buildRequestAuthority(input, model);
  const context = parseRequestContext(input, authority, model);
  assert.equal(context.materialContext.confirmed_facts.length, 8);
});

test("project-plan subtitle removes mechanical punctuation and duplicate purpose wording", () => {
  const input = {
    source_mode: "professional",
    requirement: "产业园招商方案",
    audience: "项目负责人。",
    detailed_purpose: "用于项目沟通。",
    client_materials: "已确认事实：\n项目名称：滨海智造园"
  };
  const authority = buildRequestAuthority(input);
  const context = parseRequestContext(input, authority);
  const subtitle = buildSubtitle(context);
  assert.equal(subtitle, "面向项目负责人，用于招商推介");
  assert.doesNotMatch(subtitle, /。，|，，|。。|用于用于|[，。；;：:]$/);
});

test("professional industry anchors and model planning survive into project-plan pages", async () => {
  await withMockLocalPlanning(projectPlanAnalysis({
    industry: "新能源汽车",
    sections: projectPlanSections()
  }), async () => {
    const { result, internalDiagnostics } = await generateOutlineWithInternalDiagnostics({
      source_mode: "professional",
      requirement: "请为新能源汽车产业园招商推介制作一份12页PPT",
      audience: "拟入驻新能源汽车企业、产业投资人和招商主管部门",
      detailed_purpose: "用于对外招商推介，说明园区产业定位、空间基础、设施条件、企业服务和入驻合作路径",
      page_count: 12,
      style: "商务正式",
      has_materials: true,
      material_categories: ["项目资料"],
      client_materials: `已确认事实
项目名称：临港新能源汽车产业园
项目地点：上海临港
项目面积：12万平方米
产业方向：新能源汽车整车、动力电池、智能驾驶、核心零部件
园区设施：研发中心、标准厂房、路演中心
服务能力：供应链对接、政策申报辅导、企业展示服务
建设时间：2026年启动招商
明确数据：首期载体面积12万平方米
补充资料
招商政策细则待补充
目标企业名单待补充`
    });
    const text = flattenOutline(result);
    const positioning = result.slides.find(slide => slide.slide_type === "positioning");
    const industry = result.slides.find(slide => slide.slide_type === "industry");
    const architecture = result.slides.find(slide => slide.slide_type === "architecture");
    assert.equal(result.slides.length, 12);
    assert.equal(result.quality_report.passed, true);
    assert.equal(result.quality_report.planning_model.used, true);
    assert.equal(internalDiagnostics.dimensions.page_distinctiveness.score, internalDiagnostics.dimensions.page_distinctiveness.max);
    assert.equal(internalDiagnostics.confirmed_fact_coverage.covered_count, 8);
    assert.equal(internalDiagnostics.confirmed_fact_coverage.total, 8);
    assert.match(positioning.content, /产业链方向|空间承接|协同关系/);
    assert.match(industry.content, /目标产业链环节|重点企业类型|企业筛选条件|沟通优先级/);
    assert.notEqual(positioning.content, industry.content);
    assert.match(architecture.content, /招商内容|目标触达|转化推进|运营协同/);
    assert.doesNotMatch(architecture.content, /业务层、能力层、运营层和保障层|系统方案|数据和协作关系/);
    assert.match(text, /新能源汽车整车、动力电池、智能驾驶、核心零部件/);
    assert.match(text, /研发中心、标准厂房、路演中心/);
    assert.match(text, /供应链对接、政策申报辅导、企业展示服务/);
    assert.match(text, /12万平方米/);
    assert.doesNotMatch(text, /未确认面积|面积未确认|系统上线|方案上线|销售订单数据|调研问卷|核验政策|核验区位|政策口径|政策细则待|目标企业名单待|业务层、能力层、运营层和保障层/);
    assert.ok(result.executive_summary.filter(item => /新能源汽车|研发中心|标准厂房|供应链对接|目标企业/.test(item)).length >= 2);
    assert.match(result.subtitle, /用于招商推介/);
    assert.doesNotMatch(result.subtitle, /说明园区产业定位、空间基础、设施条件、企业服务和入驻合作路径/);
    assert.doesNotMatch(result.subtitle, /。，|，，|。。|[，。；;：:]$/);
  });
});

test("realistic qwen project-plan titles are narrowed to customer-visible park招商 roles", async () => {
  await withMockLocalPlanning(projectPlanAnalysis({
    industry: "园区招商",
    purpose: "用于项目沟通",
    sections: realLikeProjectPlanSections()
  }), async () => {
    const { result, internalDiagnostics } = await generateOutlineWithInternalDiagnostics({
      source_mode: "professional",
      requirement: "请为新能源汽车产业园招商推介制作一份12页PPT",
      audience: "拟入驻新能源汽车企业、产业投资人和招商主管部门",
      detailed_purpose: "用于项目沟通",
      page_count: 12,
      style: "商务正式",
      has_materials: true,
      material_categories: ["项目资料"],
      client_materials: `已确认事实
项目名称：临港新能源汽车产业园
项目地点：上海临港新片区
项目面积：12万平方米
产业方向：新能源汽车整车、动力电池、智能驾驶、核心零部件
园区设施：研发中心、标准厂房、路演中心
服务能力：政策申报、人才服务、供应链对接
建设时间：2026年启动招商
明确数据：规划建筑面积12万平方米`
    });
    const background = result.slides.find(slide => slide.slide_type === "background");
    const positioning = result.slides.find(slide => slide.slide_type === "positioning");
    const industry = result.slides.find(slide => slide.slide_type === "industry");
    const architecture = result.slides.find(slide => slide.slide_type === "architecture");
    const text = flattenOutline(result);

    assert.equal(result.slides.length, 12);
    assert.equal(result.quality_report.passed, true);
    assert.equal(result.quality_report.planning_model.used, true);
    assert.equal(internalDiagnostics.dimensions.page_distinctiveness.score, internalDiagnostics.dimensions.page_distinctiveness.max);
    assert.equal(internalDiagnostics.hard_gates.audience_alignment.passed, true);
    assert.equal(internalDiagnostics.hard_gates.confirmed_fact_coverage.passed, true);
    assert.equal("hard_gates" in result.quality_report, false);
    assert.equal(result.subtitle, "面向入驻企业、投资相关方、招商相关方，用于招商推介");
    assert.doesNotMatch(result.subtitle, /拟入驻新能源汽车企业、产业投资人和招商主管部门|用于项目沟通|。，|，，|。。/);
    assert.equal(background.title, "项目基础信息与招商任务");
    assert.doesNotMatch(background.title, /发展机遇|市场趋势|战略定位/);
    assert.equal(positioning.title, "园区产业定位");
    assert.match(positioning.content, /产业链方向|空间承接|组合价值|协同关系/);
    assert.doesNotMatch(positioning.content, /企业筛选条件|沟通优先级/);
    assert.equal(industry.title, "目标企业与招商对象");
    assert.match(industry.content, /目标企业类型|企业筛选条件|沟通优先级/);
    assert.doesNotMatch(industry.content, /空间承接：/);
    assert.equal(architecture.title, "招商触达与转化体系");
    assert.match(architecture.content, /招商内容|目标触达|转化推进|运营协同/);
    assert.doesNotMatch(text, /方案架构|模块职责|输入输出|协作关系|业务层、能力层、运营层和保障层|未确认面积|面积未确认|销售订单数据|调研问卷/);
  });
});

test("realistic qwen project-plan narrowing is generic for non-vehicle parks", async () => {
  await withMockLocalPlanning(projectPlanAnalysis({
    industry: "园区招商",
    purpose: "用于项目沟通",
    sections: realLikeProjectPlanSections()
  }), async () => {
    const { result, internalDiagnostics } = await generateOutlineWithInternalDiagnostics({
      source_mode: "professional",
      requirement: "请为生物医药产业园招商推介制作一份12页PPT",
      audience: "拟入驻药企、产业投资人和平台招商团队",
      detailed_purpose: "用于项目沟通",
      page_count: 12,
      style: "商务正式",
      has_materials: true,
      material_categories: ["项目资料"],
      client_materials: `已确认事实
项目名称：湾区生物医药创新园
项目地点：广州南沙
项目面积：8万平方米
产业方向：创新药研发、医疗器械、细胞治疗、检测服务
园区设施：中试平台、洁净厂房、共享实验室
服务能力：注册申报辅导、临床资源对接、投融资路演
建设时间：2026年开放入驻
明确数据：一期载体面积8万平方米`
    });
    const text = flattenOutline(result);
    const industry = result.slides.find(slide => slide.slide_type === "industry");
    const architecture = result.slides.find(slide => slide.slide_type === "architecture");

    assert.equal(result.slides.length, 12);
    assert.equal(result.quality_report.passed, true);
    assert.equal(internalDiagnostics.dimensions.page_distinctiveness.score, internalDiagnostics.dimensions.page_distinctiveness.max);
    assert.equal(result.subtitle, "面向入驻企业、投资相关方、招商相关方，用于招商推介");
    assert.equal(industry.title, "目标企业与招商对象");
    assert.equal(architecture.title, "招商触达与转化体系");
    assert.match(text, /创新药研发、医疗器械、细胞治疗、检测服务/);
    assert.match(text, /目标企业类型：围绕创新药研发、医疗器械、细胞治疗、检测服务相关企业建立招商筛选与沟通优先级/);
    assert.doesNotMatch(text, /新能源汽车整车|动力电池|智能驾驶|核心零部件|方案架构|模块职责|输入输出|协作关系/);
  });
});

test("project-plan anchor transfer is generic across non-vehicle park materials", async () => {
  await withMockLocalPlanning(projectPlanAnalysis({
    industry: "生物医药",
    sections: projectPlanSections()
  }), async () => {
    const { result, internalDiagnostics } = await generateOutlineWithInternalDiagnostics({
      source_mode: "professional",
      requirement: "请为生物医药产业园招商推介制作一份12页PPT",
      audience: "拟入驻药企、研发机构和平台招商团队",
      detailed_purpose: "用于对外招商推介，说明园区定位、实验平台、厂房条件和企业服务",
      page_count: 12,
      style: "商务正式",
      has_materials: true,
      material_categories: ["项目资料"],
      client_materials: `已确认事实
项目名称：湾区生物医药创新园
项目地点：广州南沙
项目面积：8万平方米
产业方向：创新药研发、医疗器械、细胞治疗、检测服务
园区设施：中试平台、洁净厂房、共享实验室
服务能力：注册申报辅导、临床资源对接、投融资路演
建设时间：2026年开放入驻
明确数据：一期载体面积8万平方米`
    });
    const text = flattenOutline(result);
    const architecture = result.slides.find(slide => slide.slide_type === "architecture");
    assert.equal(result.slides.length, 12);
    assert.equal(result.quality_report.passed, true);
    assert.equal(internalDiagnostics.dimensions.page_distinctiveness.score, internalDiagnostics.dimensions.page_distinctiveness.max);
    assert.match(text, /创新药研发、医疗器械、细胞治疗、检测服务/);
    assert.match(text, /中试平台、洁净厂房、共享实验室/);
    assert.match(text, /注册申报辅导、临床资源对接、投融资路演/);
    assert.match(architecture.content, /招商内容|目标触达|转化推进|运营协同/);
    assert.doesNotMatch(text, /核验政策|核验区位|政策口径|政策细则待|目标企业名单待|业务层、能力层、运营层和保障层/);
    assert.doesNotMatch(text, /新能源汽车整车|动力电池|智能驾驶|核心零部件/);
  });
});

test("framework_only cannot hide concrete user facts without reliable sources", () => {
  const input = {
    source_mode: "professional",
    requirement: "园区招商方案",
    audience: "管理层",
    page_count: 8,
    client_materials: PROFESSIONAL_MATERIALS
  };
  const authority = buildRequestAuthority(input);
  const context = parseRequestContext(input, authority);
  const plan = buildNarrativePlan(context);
  const candidate = adaptOutlineCandidate(baseOutline([{
    _pageId: "background:1",
    index: 1,
    title: "项目背景",
    content: "• 项目位于上海临港",
    slide_type: "background",
    role: "background",
    key_message: "项目位于上海临港",
    evidence_status: "framework_only",
    evidence_sources: []
  }]));
  const report = scoreOutline(candidate, context, plan, {
    pipeline: "server-generate-outline",
    sourceOutline: candidate,
    requestAuthority: authority
  });
  assert.equal(report.hard_gates.evidence_traceability.passed, false);
  assert.match(report.hard_gates.evidence_traceability.reason, /具体用户材料事实/);
});

test("pure framework pages may stay framework_only without evidence sources", () => {
  const input = {
    source_mode: "professional",
    requirement: "园区招商方案",
    audience: "管理层",
    page_count: 8,
    client_materials: PROFESSIONAL_MATERIALS
  };
  const authority = buildRequestAuthority(input);
  const context = parseRequestContext(input, authority);
  const plan = buildNarrativePlan(context);
  const candidate = adaptOutlineCandidate(baseOutline([{
    _pageId: "framework:1",
    index: 1,
    title: "分析框架",
    content: "• 明确目标对象、判断维度和验证资料\n• 区分事实、假设和待确认事项",
    slide_type: "framework",
    role: "analysis",
    key_message: "先建立分析框架，再补充证据。",
    evidence_status: "framework_only",
    evidence_sources: []
  }]));
  const report = scoreOutline(candidate, context, plan, {
    pipeline: "server-generate-outline",
    sourceOutline: candidate,
    requestAuthority: authority
  });
  assert.equal(report.hard_gates.evidence_traceability.passed, true);
});

test("evidence sources stay limited to actually rendered user sources", () => {
  const material = parseMaterialContext({ clientMaterials: `已确认事实：
- 管理层已确认先开展小范围招商验证
- 已确认预算已落实` });
  const used = material.confirmed_facts[0];
  const unused = material.confirmed_facts[1];
  const input = { source_mode: "professional", requirement: "园区招商方案", audience: "管理层", page_count: 6, client_materials: `已确认事实：\n- 管理层已确认先开展小范围招商验证\n- 已确认预算已落实` };
  const authority = buildRequestAuthority(input);
  const context = parseRequestContext(input, authority);
  const plan = buildNarrativePlan(context);
  const candidate = adaptOutlineCandidate(baseOutline([{
    _pageId: "background:1",
    index: 1,
    title: "项目背景",
    content: `• ${used.excerpt}`,
    slide_type: "background",
    role: "background",
    key_message: used.excerpt,
    evidence_status: "source_supported",
    evidence_sources: [toEvidenceSource(used)]
  }]));
  const report = scoreOutline(candidate, context, plan, {
    pipeline: "server-generate-outline",
    sourceOutline: candidate,
    requestAuthority: authority
  });
  assert.equal(report.hard_gates.evidence_traceability.passed, true);
  assert.ok(!candidate.slides[0].evidence_sources.some(source => source.source_id === unused.source_id));
});

test("repair removes stale sources instead of preserving unsupported provenance", () => {
  const input = {
    source_mode: "professional",
    requirement: "园区招商方案",
    audience: "管理层",
    page_count: 8,
    client_materials: PROFESSIONAL_MATERIALS
  };
  const authority = buildRequestAuthority(input);
  const context = parseRequestContext(input, authority);
  const wrong = context.materialContext.confirmed_facts.find(item => item.excerpt.includes("规划面积"));
  const outline = baseOutline([{
    _pageId: "background:1",
    index: 1,
    title: "项目背景",
    content: "• 项目位于上海临港",
    slide_type: "background",
    role: "background",
    key_message: "项目位于上海临港",
    evidence_status: "source_supported",
    evidence_sources: [toEvidenceSource(wrong)]
  }]);
  const repaired = repairOutline(outline, context, {
    issue_codes: ["evidence-traceability"],
    repair_targets: [{ issue: "evidence-traceability", page_id: "background:1", source_id: wrong.source_id }]
  });
  assert.ok(repaired.actions.some(action => action.issue === "evidence-traceability"));
  assert.deepEqual(repaired.outline.slides[0].evidence_sources, []);
  assert.equal(repaired.outline.slides[0].evidence_status, "source_supported");
});

test("unused global evidence sources are rejected and removed from pages", () => {
  const input = {
    source_mode: "professional",
    requirement: "园区招商方案",
    audience: "管理层",
    page_count: 8,
    client_materials: PROFESSIONAL_MATERIALS
  };
  const authority = buildRequestAuthority(input);
  const context = parseRequestContext(input, authority);
  const plan = buildNarrativePlan(context);
  const unused = context.materialContext.confirmed_facts.find(item => item.excerpt.includes("已建成标准厂房"));
  const candidate = adaptOutlineCandidate(baseOutline([{
    _pageId: "background:1",
    index: 1,
    title: "项目背景",
    content: "• 项目位于上海临港",
    slide_type: "background",
    role: "background",
    key_message: "项目位于上海临港",
    evidence_status: "source_supported",
    evidence_sources: [toEvidenceSource(unused)]
  }]));
  const report = scoreOutline(candidate, context, plan, {
    pipeline: "server-generate-outline",
    sourceOutline: candidate,
    requestAuthority: authority
  });
  assert.equal(report.hard_gates.evidence_traceability.passed, false);
  assert.match(report.hard_gates.evidence_traceability.reason, /来源与页面结论不相关/);

  const repaired = repairOutline(baseOutline([{
    _pageId: "background:1",
    index: 1,
    title: "项目背景",
    content: "• 项目位于上海临港",
    slide_type: "background",
    role: "background",
    key_message: "项目位于上海临港",
    evidence_status: "source_supported",
    evidence_sources: [toEvidenceSource(unused)]
  }]), context, {
    issue_codes: ["evidence-traceability"],
    repair_targets: [{ issue: "evidence-traceability", page_id: "background:1", source_id: unused.source_id }]
  });
  assert.deepEqual(repaired.outline.slides[0].evidence_sources, []);
});

test("pages without rendered evidence do not bind sources", () => {
  const material = parseMaterialContext({ clientMaterials: `已确认事实：
- 项目位于上海临港` });
  const used = material.confirmed_facts[0];
  const input = { source_mode: "professional", requirement: "园区招商方案", audience: "管理层", page_count: 6, client_materials: `已确认事实：\n- 项目位于上海临港` };
  const authority = buildRequestAuthority(input);
  const context = parseRequestContext(input, authority);
  const plan = buildNarrativePlan(context);
  const candidate = adaptOutlineCandidate(baseOutline([{
    _pageId: "framework:1",
    index: 1,
    title: "分析框架",
    content: "• 明确目标对象、判断维度和验证资料",
    slide_type: "framework",
    role: "analysis",
    key_message: "先建立分析框架。",
    evidence_status: "source_supported",
    evidence_sources: [toEvidenceSource(used)]
  }]));
  const report = scoreOutline(candidate, context, plan, {
    pipeline: "server-generate-outline",
    sourceOutline: candidate,
    requestAuthority: authority
  });
  assert.equal(report.hard_gates.evidence_traceability.passed, false);
});

test("user pending items may support hypothesis pages but model hypotheses cannot", () => {
  const input = {
    source_mode: "professional",
    requirement: "园区招商方案",
    audience: "管理层",
    page_count: 6,
    client_materials: `待确认事项：\n- 首批目标企业名单待确认`
  };
  const authority = buildRequestAuthority(input);
  const context = parseRequestContext(input, authority);
  const pending = context.materialContext.pending_items[0];
  const plan = buildNarrativePlan(context);
  const candidate = adaptOutlineCandidate(baseOutline([{
    _pageId: "hypothesis:1",
    index: 1,
    title: "待确认目标企业",
    content: `• 待验证方向：${pending.excerpt}，不代表真实客户结论。`,
    slide_type: "segments",
    role: "analysis",
    key_message: "目标企业名单仍需验证。",
    evidence_status: "hypothesis_pending",
    evidence_sources: [toEvidenceSource(pending)]
  }]));
  const report = scoreOutline(candidate, context, plan, {
    pipeline: "server-generate-outline",
    sourceOutline: candidate,
    requestAuthority: authority
  });
  assert.equal(report.hard_gates.evidence_traceability.passed, true);

  const modelOnly = { ...candidate, slides: [{ ...candidate.slides[0], evidence_sources: [{ source_id: "model-1", fragment_id: "model-1", assertion_type: "model_inference", section_type: "model", field: "model", excerpt: "模型推断目标企业", polarity: "unknown", evidence_type: "hypothesis" }] }] };
  const modelReport = scoreOutline(modelOnly, context, plan, {
    pipeline: "server-generate-outline",
    sourceOutline: modelOnly,
    requestAuthority: authority
  });
  assert.equal(modelReport.hard_gates.evidence_traceability.passed, false);
});

function baseOutline(slides) {
  return {
    title: "园区招商方案",
    subtitle: "面向管理层",
    executive_summary: slides.map(slide => slide.key_message),
    global_visual_style: {},
    missing_materials: [],
    production_strategy: {},
    pipeline: "server-generate-outline",
    slides: slides.map(slide => ({
      visual_suggestion: "信息卡片",
      image_prompt: "不使用 AI 生图",
      objective: "说明核心内容",
      data_requirements: [],
      speaker_notes: "",
      visual_spec: { type: "cards", composition: "信息卡片", data_policy: "不使用虚构数据" },
      ...slide
    }))
  };
}

function productIntroInput(overrides = {}) {
  return {
    source_mode: "professional",
    requirement: "测试素材：餐饮外带包装供应商产品介绍",
    page_count: 10,
    scenario: "产品介绍",
    style: "简洁",
    purpose: "展示",
    detailed_purpose: "用于向连锁茶饮、咖啡和轻食餐饮客户介绍公司能力、产品组合、定制流程和合作方式。",
    audience: "连锁茶饮品牌采购负责人、咖啡店运营负责人、餐饮品牌市场负责人。",
    material_categories: ["有文字资料"],
    must_include: ["企业定位", "产品矩阵", "材料与工艺优势", "定制能力", "应用场景", "服务流程", "交付能力", "合作方式"],
    excluded_content: ["未提供的客户名称", "认证资质", "销售额", "市场份额", "合作品牌不得写成事实"],
    emphasis: "产品卖点",
    visual_preferences: {
      include_images: true,
      include_layouts: true,
      reference_style: "简洁商务产品手册风格，突出产品图、材料剖面和流程图"
    },
    include_speaker_notes: true,
    deadline: "三天内",
    ...overrides
  };
}

async function generateOutlineWithInternalDiagnostics(input) {
  const runtime = {};
  const result = await generateOutline(input, { runtime });
  assert.ok(runtime.internalDiagnostics);
  return { result, internalDiagnostics: runtime.internalDiagnostics };
}

function productIntroContext(overrides = {}) {
  const input = productIntroInput(overrides);
  const authority = buildRequestAuthority(input);
  return parseRequestContext(input, authority);
}

function assertNoInternalUsageLeak(value) {
  const serialized = JSON.stringify(value);
  assert.ok(!serialized.includes("_material_usage"));
  assert.ok(!serialized.includes("allocation_priority"));
  assert.ok(!serialized.includes("assigned_section_id"));
  assert.ok(!serialized.includes("slot_index"));
}

function countOccurrences(source, pattern) {
  return String(source || "").split(pattern).length - 1;
}

function projectPlanAnalysis(overrides = {}) {
  const analysis = {
    schema_version: 1,
    requirement_summary: "产业园招商推介PPT",
    audience: "目标企业与招商团队",
    purpose: "对外招商推介",
    ppt_type: "project_plan",
    industry: "园区招商",
    business_scenario: "产业园区招商推介",
    recommended_page_count: 12,
    sections: projectPlanSections(),
    ambiguities: [],
    warnings: [],
    ...overrides
  };
  return {
    ...analysis,
    sections: withProjectPlanBusinessContent(analysis.sections),
    requirement_bindings: analysis.requirement_bindings || []
  };
}

function withProjectPlanBusinessContent(sections = []) {
  const businessContent = {
    cover: "产业园招商主题、对象与沟通目标形成统一开场。",
    background: "项目名称、区位、建设基础与招商任务共同构成项目背景。",
    positioning: "产业方向、空间承接与协同关系共同形成园区定位。",
    resources: "空间载体、研发设施与配套条件支撑目标企业落地。",
    service: "企业服务围绕资源对接、申报辅导与运营协同展开。",
    plan: "招商计划按目标触达、沟通推进与合作确认形成执行节奏。",
    value: "园区价值来自产业协同、空间条件与企业服务的组合。",
    process: "合作流程覆盖接洽、资料确认、方案沟通与入驻推进。",
    industry: "目标企业围绕产业方向建立筛选条件与沟通优先级。",
    model: "合作机制围绕入驻、资源协同与持续运营展开。",
    architecture: "招商体系连接内容准备、目标触达、转化推进与运营协同。",
    closing: "合作双方应明确下一步沟通、资料补充与确认动作。"
  };
  return sections.map(section => {
    const keyMessage = businessContent[section.section_id] || `${section.title}形成明确业务结论。`;
    return {
      ...section,
      key_message: section.key_message || keyMessage,
      bullets: section.bullets?.length ? section.bullets : [keyMessage],
      visual_direction: section.visual_direction || "使用结构化业务信息图呈现。",
      evidence_status: section.evidence_status || "source_supported"
    };
  });
}

function projectPlanSections() {
  return [
    { section_id: "cover", title: "产业园招商推介", role: "cover", objective: "建立项目认知" },
    { section_id: "background", title: "项目基础信息", role: "background", objective: "展示项目名称、地点和面积" },
    { section_id: "positioning", title: "园区产业定位", role: "positioning", objective: "说明产业方向" },
    { section_id: "resources", title: "空间资源与设施", role: "resources", objective: "展示载体和设施" },
    { section_id: "service", title: "企业服务支持", role: "service", objective: "说明服务能力" },
    { section_id: "plan", title: "招商实施计划", role: "plan", objective: "说明招商节奏" },
    { section_id: "value", title: "园区核心价值", role: "value", objective: "说明合作价值" },
    { section_id: "process", title: "入驻合作流程", role: "process", objective: "说明入驻路径" },
    { section_id: "industry", title: "重点产业领域", role: "industry", objective: "展开产业锚点" },
    { section_id: "model", title: "合作模式与机制", role: "model", objective: "说明合作机制" },
    { section_id: "architecture", title: "招商体系架构", role: "architecture", objective: "说明招商体系" },
    { section_id: "closing", title: "合作结论与下一步", role: "closing", objective: "收束行动" }
  ];
}

function realLikeProjectPlanSections() {
  return [
    { section_id: "cover", title: "新能源汽车产业园招商推介", role: "cover", objective: "建立项目认知" },
    { section_id: "background", title: "新能源汽车产业发展机遇与园区战略定位", role: "background", objective: "说明发展机遇与战略定位" },
    { section_id: "positioning", title: "园区产业方向与目标企业画像", role: "positioning", objective: "说明产业方向和目标企业" },
    { section_id: "industry", title: "产业定位与招商对象", role: "industry", objective: "说明招商对象" },
    { section_id: "resources", title: "区位与空间基础", role: "resources", objective: "说明项目空间" },
    { section_id: "service", title: "企业服务体系", role: "service", objective: "说明服务能力" },
    { section_id: "architecture", title: "方案架构", role: "architecture", objective: "说明方案架构" },
    { section_id: "process", title: "入驻合作流程", role: "process", objective: "说明合作路径" },
    { section_id: "value", title: "产业协同价值", role: "value", objective: "说明价值" },
    { section_id: "model", title: "合作机制", role: "model", objective: "说明机制" },
    { section_id: "plan", title: "下一步行动计划", role: "plan", objective: "说明计划" },
    { section_id: "closing", title: "合作价值与下一步", role: "closing", objective: "收束行动" }
  ];
}

async function withMockLocalPlanning(analysis, callback) {
  const previous = {
    enabled: process.env.LOCAL_MODEL_ENABLED,
    required: process.env.LOCAL_MODEL_REQUIRED,
    key: process.env.OPENWEBUI_API_KEY,
    url: process.env.OPENWEBUI_BASE_URL,
    model: process.env.LOCAL_MODEL_ID
  };
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, {
    LOCAL_MODEL_ENABLED: "true",
    LOCAL_MODEL_REQUIRED: "false",
    OPENWEBUI_API_KEY: "local-test-key",
    OPENWEBUI_BASE_URL: "http://127.0.0.1:8080",
    LOCAL_MODEL_ID: "qwen3:32b"
  });
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(analysis) } }]
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  try {
    await callback();
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("LOCAL_MODEL_ENABLED", previous.enabled);
    restoreEnv("LOCAL_MODEL_REQUIRED", previous.required);
    restoreEnv("OPENWEBUI_API_KEY", previous.key);
    restoreEnv("OPENWEBUI_BASE_URL", previous.url);
    restoreEnv("LOCAL_MODEL_ID", previous.model);
  }
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function flattenOutline(outline) {
  return [
    outline.title,
    outline.subtitle,
    ...(outline.executive_summary || []),
    ...outline.slides.flatMap(slide => [
      slide.title,
      slide.key_message,
      slide.content,
      slide.visual_suggestion,
      ...(slide.data_requirements || [])
    ])
  ].join("\n");
}

function assertMutuallyExclusiveContentState(state) {
  const seen = new Set();
  for (const bucket of ["confirmed", "suggested", "needs_confirmation"]) {
    for (const item of state[bucket] || []) {
      assert.ok(!seen.has(item.key), `${item.key} appears in multiple content-state buckets`);
      seen.add(item.key);
    }
  }
}
