import assert from "node:assert/strict";
import { test } from "node:test";
import { enrichPlanningMetadata, generateOutline } from "../lib/generate-outline.js";
import { planWithLocalModel, validatePlanningResponse } from "../lib/local-model-planner.js";
import { buildNarrativePlan } from "../lib/narrative-planner.js";
import { buildRequestAuthority, parseRequestContext } from "../lib/request-context.js";
import { scoreOutline } from "../lib/outline-scorer.js";
import { sanitizeModelContent } from "../lib/slide-generator.js";
import { cleanInstructionTopic } from "../lib/structured-requirement.js";

const API_KEY = "local-secret-for-test-only";

const EV_BRAND_REQUIREMENT = `为一家面向25至40岁年轻家庭用户的新能源汽车品牌制作10页品牌介绍PPT。

汇报对象：潜在经销商与区域合作伙伴。
汇报目的：建立品牌认知，展示产品竞争力，并推动经销合作。

品牌特点：
1. 主打20万至30万元中高端纯电车型。
2. 核心卖点包括智能座舱、辅助驾驶、电池安全、快速补能和家庭出行体验。
3. 当前拥有一款中型SUV和一款纯电轿车。
4. 品牌强调安全、科技、舒适和长期用户服务。
5. 全国正在逐步建设销售与售后网络。

PPT需要包含：
品牌定位、行业机会、目标用户、产品矩阵、核心技术、安全体系、补能服务、渠道合作价值、合作支持和未来规划。

要求：
内容具体，避免空话和重复表达；
不得虚构销量、市场份额、续航数据或门店数量；
缺少真实数据时明确标记为“待品牌方确认”；
整体风格专业、现代、适合商业合作介绍。`;

test("v2.3.14 explicit fields outrank fuzzy purpose and build required-section budget", () => {
  const input = { requirement: EV_BRAND_REQUIREMENT, purpose: "auto", source_mode: "simple" };
  const context = parseRequestContext(input, buildRequestAuthority(input));
  const plan = buildNarrativePlan(context);
  assert.equal(context.topic, "新能源汽车品牌介绍");
  assert.equal(context.type.id, "product_intro");
  assert.equal(context.audience, "潜在经销商与区域合作伙伴");
  assert.equal(context.purpose, "建立品牌认知，展示产品竞争力，并推动经销合作");
  assert.equal(context.pageCount, 10);
  assert.deepEqual(plan.map(section => section.id), [
    "cover",
    "market_or_customer_challenge",
    "company_positioning",
    "target_audience",
    "product_portfolio",
    "product_or_process_capability",
    "quality_or_validation",
    "delivery_and_collaboration",
    "customer_value",
    "cooperation_next_step"
  ]);
});

test("v2.3.14 topic cleanup is generic across unrelated industries", () => {
  const cases = [
    ["为一家咖啡连锁品牌制作招商介绍PPT。", "咖啡连锁品牌招商介绍"],
    ["请生成12页工业机器人产品介绍演示文稿。", "工业机器人产品介绍"],
    ["为某高校制作人工智能专业招生宣传PPT。", "高校人工智能专业招生宣传"],
    ["制作一家包装材料企业的客户提案PPT。", "包装材料企业的客户提案"]
  ];
  for (const [source, expected] of cases) {
    const title = cleanInstructionTopic(source);
    assert.equal(title, expected);
    assert.doesNotMatch(title, /为一家|请生成|制作|页|PPT|演示文稿/i);
  }
});

test("v2.3.14 structured fields accept alias order, english colons and numeric field content", () => {
  const requirement = `内容模块: 产品矩阵、核心技术、合作支持
目标受众: 区域合作伙伴
产品特点: 价格带为20万至30万元，当前拥有2类产品
使用目的: 建立认知并推动合作
输出要求: 10页以内，不虚构销量`;
  const context = parseRequestContext({ requirement, page_count: 6 }, buildRequestAuthority({ requirement, page_count: 6 }));
  assert.equal(context.audience, "区域合作伙伴");
  assert.equal(context.purpose, "建立认知并推动合作");
  assert.equal(context.pageCount, 6);
  assert.deepEqual(context.requiredSections, ["产品矩阵", "核心技术", "合作支持"]);
});

test("v2.3.14 full local-model slide content is retained in final output", async () => {
  const input = {
    request_id: "req_v2315_full_content",
    requirement: EV_BRAND_REQUIREMENT,
    purpose: "auto",
    style: "科技感",
    source_mode: "simple",
    allow_draft: true
  };
  const context = parseRequestContext(input, buildRequestAuthority(input));
  const analysis = withRequirementBindings(validAnalysis({ recommended_page_count: 10, sections: fullEvSections() }), context);
  const result = await withMockedLocalModel(async () => generateOutline(input), analysis);

  const text = visibleText(result);
  assert.equal(result.quality_report.planning_model.used, true);
  assert.equal(result.quality_report.planning_model.content_used, true);
  assert.equal(result.slides.length, 10);
  assert.doesNotMatch(text, /通用演示资料验证附录|为一家|制作10页|PPT。/);
  assert.match(text, /潜在经销商与区域合作伙伴/);
  assert.match(text, /建立品牌认知/);
  assert.match(text, /中型SUV与纯电轿车/);
  assert.match(text, /电池安全.*快速补能/);
  assert.match(text, /合作支持/);
  assert.match(text, /待品牌方确认/);
  assert.doesNotMatch(text, /市场份额达到|销量达到|续航\d|门店数量\d/);
});

test("v2.3.14 unsupported model numeric and policy claims are marked pending by production sanitizer", () => {
  const context = parseRequestContext({ requirement: EV_BRAND_REQUIREMENT, purpose: "auto" }, buildRequestAuthority({ requirement: EV_BRAND_REQUIREMENT, purpose: "auto" }));
  const cases = [
    ["800V高压快充平台", /产品与服务数据：待品牌方确认/],
    ["5年/15万公里质保", /产品与服务数据：待品牌方确认/],
    ["2025年落地智能驾驶系统", /发展规划：待品牌方确认/],
    ["区域独家代理政策", /渠道合作政策：待品牌方确认/]
  ];
  for (const [source, expected] of cases) {
    const sanitized = sanitizeModelContent(source, context);
    assert.match(sanitized, expected);
    assert.notEqual(sanitized, source);
  }
  assert.equal(sanitizeModelContent("目标用户聚焦25至40岁年轻家庭。", context), "目标用户聚焦25至40岁年轻家庭。");
});

test("v2.3.14 sections-only model response remains compatible without content retention requirement", () => {
  const result = validatePlanningResponse({
    recommended_page_count: 3,
    sections: [
      { section_id: "cover", title: "封面", role: "cover", objective: "建立主题" },
      { section_id: "company_positioning", title: "品牌定位", role: "background", objective: "说明定位" },
      { section_id: "cooperation_next_step", title: "下一步", role: "action", objective: "收束合作" }
    ]
  }, ["cover", "company_positioning", "cooperation_next_step"]);
  assert.equal(result.sections.length, 3);
  assert.equal(result.sections.some(section => section.content_complete), false);
});

test("v2.3.14 full slides schema keeps key message bullets and visual direction", () => {
  const result = validatePlanningResponse({
    slides: [
      { section_id: "cover", title: "封面", role: "cover", key_message: "建立合作认知", bullets: ["面向合作伙伴"], visual_direction: "品牌封面" },
      { section_id: "company_positioning", title: "品牌定位", role: "background", key_message: "品牌定位明确", bullets: ["安全、科技、舒适"], visual_direction: "定位画布" },
      { section_id: "cooperation_next_step", title: "未来规划", role: "action", key_message: "下一步待确认", bullets: ["合作节奏待确认"], visual_direction: "路线图" }
    ]
  }, ["cover", "company_positioning", "cooperation_next_step"]);
  assert.equal(result.sections[1].key_message, "品牌定位明确");
  assert.deepEqual(result.sections[1].bullets, ["安全、科技、舒适"]);
  assert.equal(result.sections[1].visual_direction, "定位画布");
  assert.equal(result.sections[1].content_complete, true);
});

test("parseable page gaps stay on the single-call path for deterministic completion", async () => {
  const input = { requirement: EV_BRAND_REQUIREMENT, purpose: "auto" };
  const context = parseRequestContext(input, buildRequestAuthority(input));
  let calls = 0;
  const result = await planWithLocalModel(input, context, {
    env: enabledEnv(),
    fetchImpl: async () => {
      calls += 1;
      return modelResponse(validAnalysis({ recommended_page_count: 10, sections: fullEvSections().slice(0, 8) }));
    }
  });
  assert.equal(calls, 1);
  assert.equal(result.analysis.sections.length, 8);
  assert.equal(result.metadata.repair_attempted, false);
  assert.equal(result.metadata.repaired, false);
  assert.equal(result.metadata.fallback_used, false);
  assert.equal(result.metadata.model_output_page_count_mismatch, true);
  assert.equal(result.metadata.expected_page_count, 10);
  assert.equal(result.metadata.returned_page_count, 8);
});

test("parseable incomplete JSON is retained instead of being discarded as a repair failure", async () => {
  const input = { requirement: EV_BRAND_REQUIREMENT, purpose: "auto" };
  const context = parseRequestContext(input, buildRequestAuthority(input));
  let calls = 0;
  const result = await planWithLocalModel(input, context, {
    env: enabledEnv(),
    fetchImpl: async () => {
      calls += 1;
      return modelResponse(validAnalysis({ recommended_page_count: 10, sections: fullEvSections().slice(0, 8) }));
    }
  });
  assert.equal(calls, 1);
  assert.equal(result.analysis.sections.length, 8);
  assert.equal(result.metadata.repair_attempted, false);
  assert.equal(result.metadata.repaired, false);
  assert.equal(result.metadata.fallback_used, false);
  assert.equal(result.metadata.model_output_page_count_mismatch, true);
});

test("initial model request carries canonical requirements without a semantic repair call", async () => {
  const input = { requirement: EV_BRAND_REQUIREMENT, purpose: "auto" };
  const context = parseRequestContext(input, buildRequestAuthority(input));
  const prompts = [];
  let calls = 0;
  const result = await planWithLocalModel(input, context, {
    env: enabledEnv(),
    fetchImpl: async (_url, options) => {
      calls += 1;
      prompts.push(JSON.parse(JSON.parse(options.body).messages[1].content));
      return modelResponse(validAnalysis({ recommended_page_count: 10, sections: fullEvSections().slice(0, 8) }));
    }
  });

  const expectedIds = context.requiredSectionIds;
  assert.equal(calls, 1);
  assert.deepEqual(prompts[0].required_canonical_section_ids, expectedIds);
  assert.equal("required_section_plan" in prompts[0], false);
  assert.deepEqual(prompts[0].required_section_selection_contract.required_section_ids, expectedIds);
  assert.equal("legacy_requirement_description" in prompts[0].required_section_selection_contract, false);
  assert.equal(result.metadata.repair_diagnostics, null);
  assert.equal(result.metadata.repair_request_diagnostics, null);
  assert.equal(result.metadata.model_output_page_count_mismatch, true);
});

test("semantic completion never consumes a second model call regardless of remaining timeout", async () => {
  const input = { requirement: EV_BRAND_REQUIREMENT, purpose: "auto" };
  const context = parseRequestContext(input, buildRequestAuthority(input));
  let calls = 0;
  const result = await planWithLocalModel(input, context, {
    env: { ...enabledEnv(), LOCAL_MODEL_TIMEOUT_MS: "1000" },
    fetchImpl: async () => {
      calls += 1;
      return modelResponse(validAnalysis({ recommended_page_count: 10, sections: fullEvSections().slice(0, 8) }));
    }
  });
  assert.equal(calls, 1);
  assert.equal(result.analysis.sections.length, 8);
  assert.equal(result.metadata.repair_attempted, false);
  assert.equal(result.metadata.fallback_used, false);
  assert.equal(result.metadata.model_output_page_count_mismatch, true);
});

test("v2.3.14 final gate fails when model content is replaced by generic templates", () => {
  const input = { requirement: EV_BRAND_REQUIREMENT, purpose: "auto" };
  const analysis = validAnalysis({ recommended_page_count: 10, sections: fullEvSections() });
  const context = parseRequestContext(input, buildRequestAuthority(input, analysis), analysis);
  const plan = buildNarrativePlan(context);
  const outline = {
    title: "新能源汽车品牌介绍｜核心价值与应用场景",
    subtitle: "面向潜在经销商与区域合作伙伴，用于建立品牌认知，展示产品竞争力，并推动经销合作",
    slides: plan.map((section, index) => ({
      index: index + 1,
      title: section.id === "cover" ? "新能源汽车品牌介绍：产品能力与合作路径" : `第${index + 1}页`,
      key_message: "本页需要围绕明确对象、判断维度和验证资料形成可执行结论。",
      content: "• 说明主题涉及的对象、范围和使用场景\n• 区分已知信息、分析假设和待确认事项",
      slide_type: section.id,
      role: section.role,
      evidence_status: "framework_only",
      evidence_sources: [],
      data_requirements: [],
      speaker_notes: "",
      visual_spec: { visual_type: "matrix", render_mode: "ppt_native" },
      visual_suggestion: "通用矩阵"
    })),
    missing_materials: [],
    production_strategy: {},
    pipeline: "server-generate-outline"
  };
  const report = scoreOutline(outline, context, plan, { pipeline: outline.pipeline, sourceOutline: outline, requestAuthority: context.requestAuthority });
  assert.equal(report.hard_gates.model_content_retention.passed, false);
  assert.equal(report.hard_gates.generic_template_pollution.passed, false);
});

test("v2.3.14 planning telemetry records called-but-not-retained content without rejecting the candidate", () => {
  const metadata = enrichPlanningMetadata({
    enabled: true,
    used: true,
    status: "used",
    model_id: "ppt-v02",
    fallback_used: false,
    reason_code: ""
  }, {
    planningAnalysis: { sections: [{ section_id: "positioning" }] },
    planningSectionIntents: {
      positioning: {
        key_message: "模型提供的独特定位判断",
        bullets: ["模型生成的独特业务证据"],
        visual_direction: "模型专属视觉方向"
      }
    }
  }, {
    title: "确定性标题",
    subtitle: "确定性副标题",
    slides: [{ title: "确定性页面", key_message: "确定性结论", content: "确定性正文", visual_suggestion: "确定性图示" }]
  });

  assert.equal(metadata.used, true);
  assert.equal(metadata.content_used, false);
  assert.equal(metadata.fallback_used, false);
  assert.equal(metadata.status, "used");
  assert.equal(metadata.planning_rejection_reason, undefined);
  assert.deepEqual(metadata.planner_content_retention, {
    retained_count: 0,
    evaluated_count: 3
  });
});

async function withMockedLocalModel(callback, analysis) {
  const previousFetch = globalThis.fetch;
  const previousEnv = {
    enabled: process.env.LOCAL_MODEL_ENABLED,
    required: process.env.LOCAL_MODEL_REQUIRED,
    key: process.env.OPENWEBUI_API_KEY,
    url: process.env.OPENWEBUI_BASE_URL,
    model: process.env.LOCAL_MODEL_ID
  };
  Object.assign(process.env, enabledEnv());
  globalThis.fetch = async () => modelResponse(analysis);
  try {
    return await callback();
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv("LOCAL_MODEL_ENABLED", previousEnv.enabled);
    restoreEnv("LOCAL_MODEL_REQUIRED", previousEnv.required);
    restoreEnv("OPENWEBUI_API_KEY", previousEnv.key);
    restoreEnv("OPENWEBUI_BASE_URL", previousEnv.url);
    restoreEnv("LOCAL_MODEL_ID", previousEnv.model);
  }
}

function enabledEnv() {
  return {
    LOCAL_MODEL_ENABLED: "true",
    LOCAL_MODEL_REQUIRED: "false",
    OPENWEBUI_API_KEY: API_KEY,
    OPENWEBUI_BASE_URL: "http://127.0.0.1:8080",
    LOCAL_MODEL_ID: "qwen3:32b"
  };
}

function fullEvSections() {
  return [
    section("cover", "新能源汽车品牌合作介绍", "cover", "面向潜在经销商与区域合作伙伴建立品牌合作认知。", ["品牌主张围绕安全、科技、舒适和长期用户服务展开。", "销量、市场份额、续航数据和门店数量：待品牌方确认。"], "品牌封面视觉"),
    section("company_positioning", "品牌定位与核心价值", "background", "品牌应围绕20万至30万元中高端纯电车型建立清晰定位。", ["目标用户聚焦25至40岁年轻家庭。", "核心价值包括安全、科技、舒适和长期用户服务。"], "定位画布"),
    section("market_or_customer_challenge", "行业机会与市场背景", "background", "行业机会应从家庭纯电出行需求和渠道合作窗口切入。", ["家庭用户关注智能体验、补能便利和长期服务。", "市场规模、份额和销量：待品牌方确认。"], "机会矩阵"),
    section("target_audience", "目标用户：25至40岁年轻家庭", "evidence", "目标用户需要把家庭出行体验与购车决策关注拆开说明。", ["重点关注智能座舱、辅助驾驶、电池安全和快速补能。", "家庭成员、通勤半径和预算细分：待品牌方确认。"], "用户关注矩阵"),
    section("product_portfolio", "产品矩阵：中型SUV与纯电轿车", "analysis", "当前产品矩阵由一款中型SUV和一款纯电轿车构成。", ["中型SUV适合家庭空间与多场景出行表达。", "纯电轿车适合通勤效率、科技体验和舒适乘坐表达。"], "车型矩阵"),
    section("product_or_process_capability", "核心技术：智能座舱与辅助驾驶", "analysis", "核心技术应围绕智能座舱、辅助驾驶、电池安全和快速补能形成能力架构。", ["智能座舱负责家庭交互和舒适体验说明。", "辅助驾驶能力边界与实际等级：待品牌方确认。"], "技术架构"),
    section("quality_or_validation", "安全与补能体系", "evidence", "安全体系和补能服务需要标明已知卖点与待确认数据边界。", ["电池安全是合作沟通中的信任基础。", "具体续航里程、充电速度和安全测试数据：待品牌方确认。"], "安全补能双轴图"),
    section("delivery_and_collaboration", "用户服务与渠道合作支持", "analysis", "销售与售后网络正在逐步建设，应转化为合作支持事项。", ["渠道可获得的培训、物料、售后协同政策：待品牌方确认。", "不写未经确认的门店数量或覆盖城市。"], "服务支持流程"),
    section("customer_value", "渠道合作价值", "insight", "渠道合作价值应从产品竞争力、用户服务和区域网络共建说明。", ["经销商关注品牌认知、产品卖点和售后承接能力。", "合作收益、区域政策和返利条件：待品牌方确认。"], "价值矩阵"),
    section("cooperation_next_step", "未来发展规划与合作下一步", "action", "结尾应回到合作确认事项和下一步资料清单。", ["下一步确认区域合作政策、试驾资料、售后支持和培训安排。", "未来车型节奏和网络规划：待品牌方确认。"], "合作路线图")
  ];
}

function section(section_id, title, role, key_message, bullets, visual_direction) {
  return { section_id, title, role, objective: key_message, key_message, bullets, visual_direction, evidence_status: "framework_only" };
}

function validAnalysis(overrides = {}) {
  return {
    schema_version: 1,
    requirement_summary: "新能源汽车品牌合作介绍",
    audience: "潜在经销商与区域合作伙伴",
    purpose: "建立品牌认知，展示产品竞争力，并推动经销合作",
    ppt_type: "product_intro",
    industry: "新能源汽车",
    business_scenario: "经销合作介绍",
    recommended_page_count: 10,
    sections: fullEvSections(),
    ambiguities: [],
    warnings: [],
    ...overrides
  };
}

function withRequirementBindings(analysis, context) {
  const next = structuredClone(analysis);
  next.requirement_bindings = structuredClone(context.requirementBindings);
  const sectionById = new Map(next.sections.map(section => [section.section_id, section]));
  for (const parent of next.requirement_bindings) {
    for (const atomic of parent.atomic_requirements) {
      const section = sectionById.get(atomic.canonical_section_id);
      if (!section) continue;
      const text = bindingBusinessText(atomic.label);
      if (!section.bullets.includes(text)) section.bullets.push(text);
    }
  }
  return next;
}

function bindingBusinessText(label) {
  const copy = {
    "品牌定位": "品牌定位围绕中高端纯电家庭出行建立。",
    "行业机会": "行业机会来自家庭纯电出行需求与渠道合作窗口。",
    "目标用户": "目标用户为25至40岁年轻家庭。",
    "产品矩阵": "产品矩阵包含中型SUV与纯电轿车。",
    "核心技术": "核心技术覆盖智能座舱与辅助驾驶。",
    "安全体系": "安全体系以电池安全为信任基础。",
    "补能服务": "补能服务的具体数据待品牌方确认。",
    "合作价值": "合作价值来自产品竞争力、用户服务与区域网络共建。",
    "合作支持": "合作支持包含培训、物料与售后协同。",
    "未来规划": "未来规划与合作下一步需结合资料确认。"
  };
  return copy[label] || `本页说明${label}。`;
}

function modelResponse(analysis) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(analysis) } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function visibleText(result) {
  return [
    result.title,
    result.subtitle,
    ...(result.executive_summary || []),
    ...result.slides.flatMap(slide => [slide.title, slide.key_message, slide.content, slide.visual_suggestion])
  ].join("\n");
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
