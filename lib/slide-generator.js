import { applyIndustryProfile } from "./industry-profiles.js";
import { createEvidenceState, evidenceLabel, toEvidenceSource } from "./evidence-state.js";
import { hasTraceableQualitySystemEvidence, hasTraceableRoiEvidence } from "./final-output-contract.js";
import {
  collectTraceableSegments,
  hasPositiveGeographicEvidence,
  resolveChannelState,
  sourceRenderedInSlide,
  sourceSupportsSlide
} from "./material-context.js";
import { isPhysicalProductContext, isSoftwareProductContext } from "./product-form.js";
import { planSlideVisual } from "./visual-planner.js";
import { PRODUCT_INTRO_ROLE_SELECTION_MATRIX } from "./outline-templates.js";
import {
  attachPendingText,
  trackPlannerText,
  trackRequirementFulfillmentText,
  trackSystemInstructionShell
} from "./content-provenance.js";

const KEY_MESSAGES = {
  dataBasis: "先统一研究目标、资料来源和字段口径，才能形成可靠的用户判断。",
  sampleOverview: "样本覆盖、购车阶段和关键字段的完整性决定后续分群是否可信。",
  demographics: "人口属性必须与家庭任务、城市环境和预算边界交叉解释。",
  geography: "地域差异应建立在样本覆盖和渠道条件之上，不能由局部样本外推。",
  preferences: "预算、产品形态与功能偏好需要放在同一比较框架中验证。",
  motivation: "购买动机需要区分任务、体验、情境和风险，避免用单一标签解释决策。",
  scenarios: "真实使用任务是连接用户需求、产品能力和服务触点的关键依据。",
  channels: "不同决策阶段需要匹配不同信息、体验与咨询触点。",
  factors: "必要条件、加分项与否决因素应分开验证，才能解释真实选择。",
  segments: "用户分群应同时考虑任务、预算、产品偏好和使用条件，不能只按年龄划分。",
  archetype: "典型画像必须能够回溯到样本证据，并清楚标注仍待验证的判断。",
  needsJourney: "从需求到下单的完整路径比孤立痛点更能指导产品、营销和渠道动作。",
  implications: "业务建议应对应已识别的用户任务和证据缺口，并通过小范围验证推进。",
  background: "背景与现状必须先界定问题、目标与边界，再讨论方案价值和实施路径。",
  positioning: "清晰的目标对象和价值主张是后续资源组织与合作转化的前提。",
  resources: "资源优势只有关联可核验资料和目标对象需求时才具有说服力。",
  architecture: "方案架构应说明模块职责、输入输出和协作关系，而不是堆叠概念。",
  value: "价值表达必须连接具体能力、使用条件和可验证结果。",
  model: "合作模式需要同时说明双方责任、启动条件、交付物和验收节点。",
  plan: "落地计划应按依赖关系明确阶段输入、责任人与交付物。",
  origin: "历史文化分析应先界定时代、地域和证据边界。",
  timeline: "历史脉络需要由可核验的文本、作品和空间证据共同支撑。",
  aesthetics: "审美判断应连接可见形式、文化语境与具体作品证据。",
  contemporary: "当代转译应保留历史依据与使用边界，避免表面化复制传统符号。",
  closing: "下一步应优先补齐关键证据、确认责任并形成可复核的行动节奏。",
  market_or_customer_challenge: "先说明客户任务与沟通阻碍，才能让产品介绍从真实需求出发。",
  company_positioning: "企业定位应清楚回答服务谁、解决什么任务、能力边界在哪里。",
  target_audience: "目标客户页要把客户类型与决策关注分开，避免泛泛描述受众。",
  product_portfolio: "产品组合应展示不同产品或服务包的适用任务，而不是堆叠名称。",
  product_or_process_capability: "产品与工艺能力需要连接客户任务、处理过程和可交付结果。",
  customization_capability: "定制能力应明确可定制范围、客户输入和确认边界。",
  application_scenarios: "应用场景把产品能力放进真实使用路径，帮助客户判断匹配度。",
  service_process: "服务流程页要让客户知道每一步需要提供什么、确认什么、得到什么。",
  quality_or_validation: "质量验证页只呈现有资料支撑的验证动作和待补充证据，不夸大结论。",
  delivery_and_collaboration: "交付协作页应说明周期条件、协作输入和影响交付的依赖项。",
  customer_value: "客户价值必须由具体能力和使用条件支撑，不能替代为未经验证的收益承诺。",
  cooperation_next_step: "合作下一步应收束到可执行动作、资料准备和确认节点。",
  source_and_material_gap: "资料缺口页帮助制作团队识别哪些内容可用、哪些仍需补充。",
  assumptions_and_boundaries: "边界页明确事实、假设和禁写内容，避免把待确认信息写成结论。"
};

const INTERNAL_PHRASES = /结构化 PPT 策划提纲|不补造数据|当前资料为空|快速交付|制作策略|系统规则/;
const PROJECT_CUSTOMER_PENDING_PHRASES = /核验|待核验|待验证|未确认|待补充|未提供|缺失|缺少|资料缺口|政策细则待|目标企业名单待|企业数量|投资数据/;
const PROJECT_SECTION_ANCHOR_CATEGORIES = {
  cover: ["identity"],
  background: ["identity", "location", "space", "timeline"],
  positioning: ["industry", "facility", "service"],
  industry: ["industry", "target"],
  resources: ["location", "space", "facility", "metric"],
  service: ["service", "facility"],
  architecture: ["industry", "facility", "service", "target"],
  process: ["target", "service", "timeline"],
  value: ["industry", "facility", "service", "space", "target"],
  model: ["service", "timeline"],
  plan: ["timeline", "service"],
  closing: ["identity", "industry", "facility", "service", "timeline"]
};

const PRODUCT_INTRO_ALLOCATION_CACHE = Symbol("productIntroMaterialAllocation");
const PRODUCT_INTRO_SECTION_CAPACITY = {
  market_or_customer_challenge: { totalSlots: 1, confirmedSlots: 1, minGeneric: 3 },
  company_positioning: { totalSlots: 2, confirmedSlots: 2, minGeneric: 3 },
  target_audience: { totalSlots: 2, confirmedSlots: 2, minGeneric: 3 },
  product_portfolio: { totalSlots: 1, confirmedSlots: 1, minGeneric: 3 },
  product_or_process_capability: { totalSlots: 3, confirmedSlots: 3, minGeneric: 2 },
  customization_capability: { totalSlots: 2, confirmedSlots: 2, minGeneric: 3 },
  application_scenarios: { totalSlots: 3, confirmedSlots: 3, minGeneric: 2 },
  service_process: { totalSlots: 2, confirmedSlots: 2, minGeneric: 3 },
  quality_or_validation: { totalSlots: 1, confirmedSlots: 1, minGeneric: 3 },
  delivery_and_collaboration: { totalSlots: 4, confirmedSlots: 4, minGeneric: 1 },
  customer_value: { totalSlots: 1, confirmedSlots: 1, minGeneric: 3 },
  cooperation_next_step: { totalSlots: 1, confirmedSlots: 1, minGeneric: 3 },
  source_and_material_gap: { totalSlots: 1, confirmedSlots: 0, minGeneric: 3 },
  assumptions_and_boundaries: { totalSlots: 1, confirmedSlots: 0, minGeneric: 3 },
  problem: { totalSlots: 1, confirmedSlots: 1, minGeneric: 3 },
  position: { totalSlots: 2, confirmedSlots: 2, minGeneric: 3 },
  capabilities: { totalSlots: 3, confirmedSlots: 3, minGeneric: 2 },
  scenarios: { totalSlots: 3, confirmedSlots: 3, minGeneric: 2 },
  flow: { totalSlots: 2, confirmedSlots: 2, minGeneric: 3 },
  value: { totalSlots: 1, confirmedSlots: 1, minGeneric: 3 },
  closing: { totalSlots: 1, confirmedSlots: 1, minGeneric: 3 }
};
const SOFTWARE_PRODUCT_SECTION_CAPACITY_OVERRIDES = {
  product_or_process_capability: { totalSlots: 5, confirmedSlots: 5, minGeneric: 0 },
  customization_capability: { totalSlots: 3, confirmedSlots: 3, minGeneric: 2 },
  service_process: { totalSlots: 3, confirmedSlots: 3, minGeneric: 2 },
  quality_or_validation: { totalSlots: 2, confirmedSlots: 2, minGeneric: 3 },
  delivery_and_collaboration: { totalSlots: 4, confirmedSlots: 4, minGeneric: 1 }
};
const PRODUCT_INTRO_CATEGORY_MAP = {
  company_positioning: { preferred: ["company_positioning"], fallback: ["customer_value", "position"], label: "企业定位" },
  target_audience: { preferred: ["target_audience"], fallback: ["market_or_customer_challenge", "position"], label: "目标客户" },
  product_and_process: { preferred: ["product_or_process_capability"], fallback: ["product_portfolio", "capabilities"], label: "产品与工艺" },
  software_function: { preferred: ["product_or_process_capability"], fallback: ["capabilities"], label: "核心功能" },
  software_access_integration: { preferred: ["customization_capability"], fallback: ["product_or_process_capability"], label: "接入与集成" },
  software_implementation: { preferred: ["service_process"], fallback: ["flow"], label: "实施流程" },
  software_validation: { preferred: ["quality_or_validation"], fallback: ["delivery_and_collaboration"], label: "验证与安全" },
  software_deployment_security: { preferred: ["delivery_and_collaboration", "quality_or_validation"], fallback: [], label: "部署与安全" },
  software_delivery: { preferred: ["delivery_and_collaboration"], fallback: [], label: "软件交付" },
  software_next_step: { preferred: ["cooperation_next_step"], fallback: [], label: "下一步确认" },
  customization_capability: { preferred: ["customization_capability"], fallback: ["customer_value", "capabilities"], label: "定制能力" },
  application_scenario: { preferred: ["application_scenarios"], fallback: ["scenarios"], label: "应用场景" },
  service_process: { preferred: ["service_process"], fallback: ["delivery_and_collaboration", "flow"], label: "服务流程" },
  quality_check: { preferred: ["quality_or_validation"], fallback: ["product_or_process_capability"], label: "质量检查" },
  delivery_capability: { preferred: ["delivery_and_collaboration"], fallback: [], label: "交付能力" }
};
const PRODUCT_INTRO_SECTION_DETAIL_REQUIREMENTS = {
  product_or_process_capability: [
    { details: ["core_product"], min: 1 },
    { details: ["material_structure"], min: 1 },
    { details: ["production_process"], min: 1 },
    { details: ["software_core_function"], min: 1 }
  ],
  customization_capability: [
    { details: ["software_access"], min: 1 },
    { details: ["software_integration", "software_configuration_boundary"], min: 1 }
  ],
  service_process: [
    { details: ["software_implementation", "software_go_live"], min: 2 }
  ],
  quality_or_validation: [
    { details: ["software_permission", "software_security", "software_acceptance_metric", "software_performance_pending"], min: 1 }
  ],
  delivery_and_collaboration: [
    { details: ["delivery_readiness", "production_arrangement"], min: 1 },
    { details: ["delivery_content"], min: 1 },
    { details: ["delivery_method"], min: 1 },
    { details: ["software_deployment"], min: 1 },
    { details: ["software_delivery_content"], min: 1 },
    { details: ["software_delivery_method"], min: 1 }
  ],
  cooperation_next_step: [
    { details: ["software_next_step", "software_scope_confirmation"], min: 1 }
  ]
};
const PRODUCT_INTRO_SECTION_ORDER = PRODUCT_INTRO_ROLE_SELECTION_MATRIX[15];
const STRUCTURED_ASSERTION_TYPES = new Set(["explicit_confirmed_fact", "user_material_fact", "pending_suggestion"]);

export function generateSlide(section, index, context, visualBudget, runtime = null) {
  const baseRecipe = context.type.recipes[section.id] || buildAppendixRecipe(section.id, context.type.label);
  const recipe = sanitizeRecipe(applyIndustryProfile(baseRecipe, context.type.id, section.id, context.industry), context);
  const evidence = createEvidenceState(section.id, recipe, context);
  const title = buildSlideTitle(section.id, recipe, context, evidence);
  const contentResult = buildContentPoints(section.id, recipe, context, evidence, runtime);
  const contentPoints = contentResult.points;
  const keyMessage = buildKeyMessage(section.id, title, context, evidence, runtime, contentResult);
  const slideId = `${section.id}:${index}`;
  attachPendingText(runtime, keyMessage, slideId, "key_message");
  contentPoints.forEach(point => attachPendingText(runtime, point, slideId, "content"));
  const semanticStatus = resolveContentEvidenceStatus(section.id, evidence.status, contentPoints);
  const draftSlide = {
    title,
    key_message: keyMessage,
    content: contentPoints.join("\n"),
    slide_type: section.id,
    role: section.role,
    evidence_status: semanticStatus
  };
  const directSourceIds = contentResult.sources.map(source => source.source_id);
  const directSourceKeys = new Set(contentResult.sources.map(source => evidenceSourceKey(source)));
  const sourceById = new Map(context.materialContext.fragments.map(fragment => [fragment.source_id, fragment]));
  const sourceCandidates = dedupeEvidenceSources(contentResult.sources);
  const initialEvidenceSources = sourceCandidates.filter(source => {
    const fragment = sourceById.get(source.source_id);
    return sourceCandidateSupportsSlide(source, fragment, draftSlide, { directSourceIds, directSourceKeys });
  });
  const evidenceStatus = resolveEvidenceStatus(semanticStatus, initialEvidenceSources, contentPoints);
  const sourceSlide = { ...draftSlide, evidence_status: evidenceStatus };
  const evidenceSources = sourceCandidates.filter(source => {
    const fragment = sourceById.get(source.source_id);
    return sourceCandidateSupportsSlide(source, fragment, sourceSlide, { directSourceIds, directSourceKeys });
  });
  const segments = section.id === "segments" ? collectTraceableSegments(context) : [];
  const visualRecipe = applyPersonaVisualPolicy(recipe.visual, section.id, context, segments);
  const visualContext = context.type.id === "product_intro" ? { ...context, topic: titleTopicFor(context) } : context;
  const visual = planSlideVisual(visualRecipe, visualContext, section.id, visualBudget, {
    role: section.role,
    title,
    keyMessage,
    content: contentPoints.join("\n"),
    entityCount: segments.length,
    entityLabels: segments.map(item => item.label)
  });
  const speakerNotes = context.includeSpeakerNotes
    ? buildSpeakerNotes(title, keyMessage, { ...evidence, status: evidenceStatus }, context, runtime, section.id)
    : "未要求演讲备注。";
  attachPendingText(runtime, speakerNotes, slideId, "speaker_notes");

  return {
    index,
    title,
    content: contentPoints.map(point => `• ${point}`).join("\n"),
    visual_suggestion: modelVisualDirection(section.id, context) || visual.visual_suggestion,
    image_prompt: visual.image_prompt,
    slide_type: section.id,
    role: section.role,
    objective: objectiveFor(section.role, title),
    key_message: keyMessage,
    evidence_status: evidenceStatus,
    evidence_sources: evidenceSources,
    data_requirements: evidence.dataRequirements,
    speaker_notes: speakerNotes,
    visual_spec: visual.visual_spec,
    _pageId: `${section.id}:${index}`,
    _evidence: evidence,
    _section: section
  };
}

function resolveEvidenceStatus(status, sources, contentPoints = []) {
  if (status === "hypothesis_pending" && !sources.some(source => source.evidence_type === "hypothesis")) {
    const explicitPendingHypotheses = contentPoints.some(point => /不代表真实.*结论/.test(point));
    if (!explicitPendingHypotheses) return "framework_only";
  }
  if (["source_supported", "partially_supported"].includes(status)
    && !sources.some(source => source.polarity === "positive" && source.evidence_type === "provided_source")) return "framework_only";
  return status;
}

function resolveContentEvidenceStatus(sectionId, status, points) {
  if (sectionId === "needsJourney" && points.some(point => /待验证痛点|待验证偏好|需核验因素|潜在影响项|待验证方向/.test(point))) {
    return "hypothesis_pending";
  }
  return status;
}

export function buildPresentationTitle(context) {
  const suffix = selectTitleSubtitle(context);
  const brand = context.materialContext.brand?.value;
  const displayTopic = titleTopicFor(context);
  const topic = brand && !displayTopic.includes(brand) ? `${brand}｜${displayTopic}` : displayTopic;
  return `${topic}｜${suffix}`;
}

export function buildSubtitle(context) {
  if (context.type?.id === "project_plan") {
    const audience = compactProjectAudience(context);
    const purpose = compactProjectPurpose(context);
    return normalizeSubtitle([audience ? `面向${audience}` : "", purpose].filter(Boolean).join("，"))
      || "从项目事实到合作行动的推介框架";
  }
  const audience = context.audience === "目标听众" ? "" : `面向${context.audience}`;
  const purpose = context.purpose ? `用于${context.purpose}` : "";
  return [audience, purpose].filter(Boolean).join("，") || "从事实依据到行动建议的演示框架";
}

export function stripSlideInternals(slide) {
  const { _evidence, _section, ...publicSlide } = slide;
  return publicSlide;
}

export function containsInternalPhrase(text) {
  return INTERNAL_PHRASES.test(String(text || ""));
}

function buildSlideTitle(sectionId, recipe, context, evidence) {
  if (sectionId === "cover") return buildCoverTitle(context);
  const modelTitle = context.planningSectionIntents?.[sectionId]?.title;
  if (modelTitle && titleCompatibleWithSection(modelTitle, sectionId, context)) return modelTitle;
  const projectTitle = projectPlanFallbackTitle(sectionId, context);
  if (projectTitle) return projectTitle;
  if (context.type.id === "customer_persona" && sectionId === "sampleOverview") return "样本结构与数据质量";
  if (context.type.id === "customer_persona" && sectionId === "segments") {
    return evidence.status === "hypothesis_pending" ? "待验证用户分群假设" : "核心用户分群分析";
  }
  if (sectionId === "geography" && !hasPositiveGeographicEvidence(context)) return "地域与城市验证框架";
  return replaceTokens(recipe.title, context);
}

function titleCompatibleWithSection(title, sectionId, context) {
  const text = String(title || "");
  if (text.length < 3 || text.length > 32) return false;
  if (/销量|份额|补贴|名单|排名|第一|领先/.test(text)) return false;
  if (context.type.id === "product_intro") return productIntroTitleCompatible(text, sectionId, context);
  if (context.type.id === "project_plan") return projectPlanTitleCompatible(text, sectionId);
  return true;
}

function productIntroTitleCompatible(text, sectionId, context) {
  if (/高效|增值|增长|收益|盈利|爆款|权威|认证|产能|销量|份额|排名|第一|领先/.test(text)) return false;
  if (/ROI|投资回报/.test(text) && !hasTraceableRoiEvidence(context)) return false;
  if (/质量验证体系/.test(text) && !hasTraceableQualitySystemEvidence(context)) return false;
  if (!productIntroTitleClaimSupported(text, context)) return false;
  if (hasDuplicatedBrandAlias(text, context)) return false;
  if (hasUnsupportedProductIntroScopeClaim(text, context)) return false;
  if (isPhysicalProductContext(context) && /上线|系统|软件|平台|自动化运营/.test(text)) return false;
  const sectionPatterns = {
    market_or_customer_challenge: /客户|任务|挑战|需求|沟通|采购|行业|市场|机会|背景/,
    company_positioning: /定位|能力|边界|企业|公司/,
    target_audience: /客户|受众|决策|采购|使用/,
    product_portfolio: /产品|组合|类别|适用/,
    product_or_process_capability: /产品|工艺|能力|流程|处理/,
    customization_capability: /定制|配置|确认|协作/,
    application_scenarios: /场景|使用|应用|路径/,
    service_process: /流程|协作|节点|服务|确认/,
    quality_or_validation: /质量|验证|资料|依据|检查|安全|补能|电池/,
    delivery_and_collaboration: /交付|协作|周期|验收|排期|服务|渠道|支持|补能/,
    customer_value: /价值|使用条件|决策依据|能力|渠道|合作/,
    cooperation_next_step: /合作|下一步|行动|入口|确认|未来|规划/,
    source_and_material_gap: /资料|来源|缺口|补充/,
    assumptions_and_boundaries: /边界|假设|确认|禁写/
  };
  return sectionPatterns[sectionId]?.test(text) ?? true;
}

function productIntroTitleClaimSupported(text, context) {
  const claimGroups = [
    {
      title: /(?:技术|核心|差异化|领先)优势/,
      evidence: /(?:技术|核心|差异化|竞争|相对|对比|领先|优势|壁垒|专利|算法|精度|速度|稳定性).{0,18}(?:优势|差异|对比|领先|优于|专利|壁垒|更高|更低|更快|更稳定|提升|降低)/
    },
    {
      title: /(?:工艺|产品|质量|完整)体系/,
      evidence: /(?:工艺体系|产品体系|质量体系|完整体系|质量管理体系|验证体系|认证|制度|规范|完整(?:工艺|产品|质量|验证|服务)?流程|全流程|ISO|SOP|检验标准|验收标准)/
    },
    {
      title: /(?:质量|效率|良率)提升|显著改善/,
      evidence: /(?:质量|效率|良率|缺陷率|误检率|漏检率|节拍|成本).{0,18}(?:提升|改善|提高|降低|减少|缩短|优化|验证|测试|数据|结果|客户验证|实测|量化|%|％|\d)/
    },
    {
      title: /(?:交付|服务|售后|全程)保障/,
      evidence: /(?:保障|承诺|条款|SLA|质保|保修|响应承诺|响应时间|售后保障|服务保障|交付保障|合同|服务等级|备件响应)/
    }
  ];
  const evidenceText = trustedProductIntroEvidenceText(context);
  return claimGroups.every(group => !group.title.test(text) || group.evidence.test(evidenceText));
}

function trustedProductIntroEvidenceText(context) {
  const fragments = context.materialContext?.fragments || [];
  return fragments
    .filter(fragment => ["client_materials", "follow_up_answer", "material_category"].some(prefix => String(fragment.source_id || "").startsWith(prefix)))
    .filter(fragment => ["explicit_confirmed_fact", "user_material_fact"].includes(fragment.assertion_type))
    .map(fragment => fragment.excerpt)
    .join("\n");
}

function hasUnsupportedProductIntroScopeClaim(text, context) {
  const unsupportedClaims = ["全场景", "全链路", "全周期", "一站式", "顶级"];
  const sourceText = `${context.requirement || ""}\n${context.clientMaterials || ""}`;
  return unsupportedClaims.some(claim => text.includes(claim) && !sourceText.includes(claim));
}

function buildContentPoints(sectionId, recipe, context, evidence, runtime) {
  const materialItems = materialItemsForSection(sectionId, context);
  if (sectionId === "cover") {
    const fallback = [
      { text: trackSystemInstructionShell(runtime, { text: `汇报对象：${context.audience}`, sectionId, field: "content" }) },
      { text: trackSystemInstructionShell(runtime, { text: `汇报用途：${context.purpose}`, sectionId, field: "content" }) },
      { text: trackSystemInstructionShell(runtime, { text: "项目 / 企业：待填写", sectionId, field: "content" }) },
      { text: trackSystemInstructionShell(runtime, { text: "日期：待填写", sectionId, field: "content" }) }
    ];
    return mergeContentItems(materialItems, fallback, context.delivery.maxContentPoints);
  }

  const modelItems = modelContentItems(sectionId, context, runtime);
  if (modelItems.length) {
    const hasFulfillmentItem = modelItems.some(item => item.fulfillment === true);
    const limit = hasFulfillmentItem
      ? context.delivery.maxContentPoints
      : Math.max(context.delivery.maxContentPoints, modelItems.length);
    return mergeContentItems(materialItems, modelItems, limit);
  }

  if (context.type.id === "customer_persona" && sectionId === "segments" && evidence.status === "hypothesis_pending") {
    if (materialItems.length) {
      return mergeContentItems(materialItems, [], Math.max(context.delivery.maxContentPoints, materialItems.length));
    }
    return mergeContentItems([
      { text: "待验证分群假设，不代表真实客户结论。" },
      { text: "分析维度：按任务场景、预算边界、使用条件和验证资料建立分群框架。" },
      { text: "输出边界：资料未形成命名客群前，不新增任何行业常识画像。" }
    ], [], context.delivery.maxContentPoints);
  }

  let genericItems = recipe.points
    .map(point => sanitizeGeneratedText(replaceTokens(point, context), context))
    .filter(point => !containsInternalPhrase(point))
    .map(text => ({ text }));
  if (context.type.id === "project_plan") {
    genericItems = genericItems.filter(item => !PROJECT_CUSTOMER_PENDING_PHRASES.test(item.text));
  }
  if (isRecommendationSection(sectionId) && !context.hasCustomerEvidence) {
    genericItems.forEach(item => { item.text = conditionalizeRecommendation(item.text); });
  }
  if (sectionId === "needsJourney") {
    const pending = genericItems.find(item => /待验证痛点|待验证偏好|需核验因素|潜在影响项/.test(item.text));
    if (pending && !/不代表真实/.test(pending.text)) pending.text = `${pending.text}，不代表真实客户结论。`;
    const path = genericItems.find(item => /决策路径|阶段路径|旅程/.test(item.text));
    const prioritized = [path, pending, ...genericItems].filter(Boolean);
    return mergeContentItems(materialItems.slice(0, 2), prioritized, context.delivery.maxContentPoints);
  }
  if (!context.hasMaterials && sectionId === "dataBasis") {
    genericItems.unshift({ text: "证据边界：当前没有真实客户资料，本次仅建立分析框架与待验证方向，不形成客户事实或市场结论。" });
  }
  if (context.mustInclude.length && ["content", "implications", "value", "actions"].includes(sectionId)) {
    genericItems.unshift({ text: trackSystemInstructionShell(runtime, { text: `重点内容：${context.mustInclude.slice(0, 3).join("、")}`, sectionId, field: "content" }) });
  }
  if (context.emphasis && ["implications", "value", "closing"].includes(sectionId)) {
    genericItems.unshift({ text: trackSystemInstructionShell(runtime, { text: `表达重点：围绕${context.emphasis}形成具体判断或行动`, sectionId, field: "content" }) });
  }
  return mergeContentItems(materialItems, genericItems, Math.max(3, context.delivery.maxContentPoints));
}

function buildKeyMessage(sectionId, title, context, evidence, runtime, contentResult = {}) {
  if (sectionId === "cover") return trackSystemInstructionShell(runtime, { text: `${titleTopicFor(context)}将围绕证据基础、核心分析与行动建议展开。`, sectionId, field: "key_message" });
  const rawModelMessage = context.planningSectionIntents?.[sectionId]?.key_message || "";
  const sanitizedModelMessage = sanitizeModelContent(rawModelMessage, context);
  const evidenceMessage = buildEvidenceBackedKeyMessage(sectionId, title, contentResult.sources);
  const modelMessageCompatible = sanitizedModelMessage && keyMessageCompatibleWithSection(sanitizedModelMessage, sectionId, context);
  const modelMessageBecamePending = sanitizedModelMessage !== rawModelMessage && /待确认|待品牌方确认|资料缺失/.test(sanitizedModelMessage);
  if (modelMessageCompatible && !(modelMessageBecamePending && evidenceMessage)) {
    const fulfillmentRecords = fulfillmentRecordsFor(context, sectionId, "key_message", rawModelMessage);
    if (fulfillmentRecords.length) {
      const patches = uniqueFulfillmentPatches(fulfillmentRecords);
      const plannerText = stripFulfillmentPatches(rawModelMessage, patches);
      if (plannerText) {
        trackPlannerText(runtime, {
          rawText: plannerText,
          sanitizedText: sanitizeModelContent(plannerText, context),
          context,
          sectionId,
          field: "key_message"
        });
      }
      for (const patch of patches) {
        const records = fulfillmentRecords.filter(item => item.text === patch);
        trackRequirementFulfillmentText(runtime, {
          rawText: patch,
          sanitizedText: sanitizeModelContent(patch, context),
          records,
          sectionId,
          field: "key_message"
        });
      }
      return sanitizedModelMessage;
    }
    return trackPlannerText(runtime, { rawText: rawModelMessage, sanitizedText: sanitizedModelMessage, context, sectionId, field: "key_message" });
  }
  if (evidenceMessage) return evidenceMessage;
  if (context.type.id === "project_plan" && context.industry.id === "park_investment" && sectionId === "architecture") {
    return "招商触达与转化体系应串联内容口径、目标企业触达、到访洽谈和入驻推进。";
  }
  if (context.type.id === "customer_persona" && sectionId === "segments" && evidence.status === "hypothesis_pending") {
    return "当前分群仅用于提出可验证方向，必须在订单、调研或访谈资料到位后确认。";
  }
  if (sectionId === "segments" && context.type.id === "market_analysis") {
    return "细分市场机会应同时验证需求清晰度、可触达性、能力匹配和进入门槛。";
  }
  if (sectionId === "closing" && context.type.id === "work_summary") {
    return "总结与承诺应明确成果边界、改进责任和下一阶段可核验的行动。";
  }
  return trackSystemInstructionShell(runtime, {
    text: KEY_MESSAGES[sectionId] || `${title}需要围绕明确对象、判断维度和验证资料形成可执行结论。`,
    sectionId,
    field: "key_message"
  });
}

function buildEvidenceBackedKeyMessage(sectionId, title, sources = []) {
  if (!["resources", "architecture"].includes(sectionId)) return "";
  const excerpts = [...new Set(sources
    .filter(source => source?.polarity === "positive" && source.excerpt)
    .map(source => String(source.excerpt).replace(/[。；;]+$/g, "").trim())
    .filter(Boolean))]
    .slice(0, 3);
  return excerpts.length ? `${title}：${excerpts.join("；")}。` : "";
}

function keyMessageCompatibleWithSection(message, sectionId, context) {
  if (context.type.id !== "project_plan") return true;
  if (!["resources", "architecture"].includes(sectionId)) return true;
  return projectPlanTitleCompatible(message, sectionId);
}

function modelContentItems(sectionId, context, runtime) {
  const intent = context.planningSectionIntents?.[sectionId];
  if (!intent?.bullets?.length) return [];
  const items = intent.bullets
    .map(item => {
      const text = sanitizeModelContent(item, context);
      if (!text) return null;
      const records = fulfillmentRecordsFor(context, sectionId, "content", item);
      return {
        text: records.length
          ? trackRequirementFulfillmentText(runtime, { rawText: item, sanitizedText: text, records, sectionId, field: "content" })
          : trackPlannerText(runtime, { rawText: item, sanitizedText: text, context, sectionId, field: "content" }),
        fulfillment: records.length > 0
      };
    })
    .filter(item => item?.text);
  return [
    ...items.filter(item => item.fulfillment),
    ...items.filter(item => !item.fulfillment)
  ];
}

function fulfillmentRecordsFor(context, sectionId, field, text) {
  return (Array.isArray(context?.requirementFulfillmentRecords) ? context.requirementFulfillmentRecords : [])
    .filter(item => item?.origin === "deterministic_requirement_fulfillment"
      && item?.canonical_section_id === sectionId
      && item?.field === field
      && String(item?.text || "")
      && (field === "key_message" ? String(text || "").includes(item.text) : item.text === text));
}

function uniqueFulfillmentPatches(records) {
  return [...new Set(records.map(item => String(item?.text || "")).filter(Boolean))];
}

function stripFulfillmentPatches(value, patches) {
  let text = String(value || "");
  for (const patch of patches) text = text.replace(patch, "");
  return text.replace(/[；;]{2,}/g, "；").replace(/^[；;\s]+|[；;\s]+$/g, "").trim();
}

function modelVisualDirection(sectionId, context) {
  return sanitizeModelContent(context.planningSectionIntents?.[sectionId]?.visual_direction, context);
}

export function sanitizeModelContent(value, context) {
  let text = String(value || "")
    .replace(/```(?:json)?|```/gi, "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  if (hasUnsupportedNumericClaim(text, context)) {
    const claimSpecific = text.replace(/[^。；;]*?(?:销量|市场份额|续航|门店数量|门店数|网点数量|网点数)[^。；;]*/g, match => {
      const label = match.match(/销量|市场份额|续航|门店数量|门店数|网点数量|网点数/)?.[0] || "数据";
      return `${label}：待品牌方确认`;
    });
    if (claimSpecific !== text) return claimSpecific;
    return `${inferPendingClaimLabel(text)}：待品牌方确认`;
  }
  if (hasUnsupportedModelPromiseClaim(text, context)) {
    return `${inferPendingClaimLabel(text)}：待品牌方确认`;
  }
  return text;
}

function hasUnsupportedNumericClaim(text, context) {
  const source = `${context.requirement || ""}\n${context.clientMaterials || ""}`;
  const numericClaims = [
    ...String(text).matchAll(/(?:L\d\+?级?|\d{4}年|\d+(?:\.\d+)?(?:\s*(?:%|V|v|kW|KW|km|公里|万公里|年|月|日|小时|级|座|家|个|款|步|阶段|项|层|万|亿|元))?)/g)
  ].map(match => match[0]).filter(token => !/^\d$/.test(token));
  const chineseNumericClaims = [
    ...String(text).matchAll(/[一二三四五六七八九十两]+(?:年|步|级|家|座|个|款|阶段|项|层|公里|小时)/g)
  ].map(match => match[0]);
  const allClaims = [...numericClaims, ...chineseNumericClaims]
    .filter(token => !source.includes(token));
  if (allClaims.length) return true;
  return /(?:销量|市场份额|续航|门店数量|门店数|网点数量|网点数).{0,16}\d|\d.{0,16}(?:销量|市场份额|续航|门店数量|门店数|网点数量|网点数)/.test(text);
}

function hasUnsupportedModelPromiseClaim(text, context) {
  const source = `${context.requirement || ""}\n${context.clientMaterials || ""}`;
  const claimPatterns = [
    /全场景|全链路|全周期|一站式|顶级/,
    /独家代理|区域保护|返利|质保|保修|道路救援/,
    /开业营销|建店|代理政策|激励计划|标准化建设/,
    /海外布局|上市|落地|推出|启动/,
    /OTA|高压快充|智能驾驶系统/
  ];
  return claimPatterns.some(pattern => pattern.test(text) && !pattern.test(source));
}

function inferPendingClaimLabel(text) {
  if (/销量|市场份额|份额|市场规模|排名/.test(text)) return "市场数据";
  if (/续航|补能|充电|快充|电池|质保|保修|道路救援|安全测试/.test(text)) return "产品与服务数据";
  if (/门店|网点|区域|代理|渠道|返利|建店|开业|合作/.test(text)) return "渠道合作政策";
  if (/规划|路线|推出|落地|启动|上市|海外/.test(text)) return "发展规划";
  if (/规格|参数|级|V|kW|公里|小时/.test(text)) return "产品参数";
  return "相关数据";
}

function buildSpeakerNotes(title, keyMessage, evidence, context, runtime, sectionId) {
  const requirements = evidence.dataRequirements.length ? `需准备：${evidence.dataRequirements.join("、")}。` : "现有资料可支持本页框架。";
  return trackSystemInstructionShell(runtime, {
    text: `讲述时先说明“${keyMessage}”${requirements}证据状态：${evidenceLabel(evidence.status)}。${context.excludedContent.length ? "遵守客户填写的禁用内容和风险边界。" : ""}`,
    sectionId,
    field: "speaker_notes"
  });
}

function objectiveFor(role, title) {
  const verbs = {
    cover: "建立主题与阅读预期",
    background: "界定问题、对象和分析边界",
    evidence: "说明事实依据、样本与验证口径",
    analysis: "拆解关键结构与影响因素",
    insight: "提炼可解释的核心判断",
    recommendation: "将判断转化为业务建议",
    action: "明确验证、责任与下一步"
  };
  return `${verbs[role] || "说明核心内容"}：${title}`;
}

function buildCoverTitle(context) {
  const brand = context.materialContext.brand?.value;
  if (context.type.id === "customer_persona") {
    const subject = context.topic.replace(/客户画像分析|消费者画像分析|用户画像分析|用户画像|用户分析|人群分析/g, "").trim();
    return `${brand || subject || context.industry.label}用户洞察：核心客群与决策路径`;
  }
  if (context.type.id === "project_plan") return `${titleTopicFor(context)}：价值主张与落地路径`;
  if (context.type.id === "history_culture") return `${context.topic}：历史脉络与审美变迁`;
  if (context.type.id === "market_analysis") return `${context.topic}：市场判断与机会验证`;
  if (context.type.id === "business_report") return `${context.topic}：关键进展与决策事项`;
  if (context.type.id === "product_intro") return `${brand || titleTopicFor(context)}：产品能力与合作路径`;
  if (context.type.id === "promotion") return `${context.topic}：传播重点与行动路径`;
  if (context.type.id === "work_summary") return `${context.topic}：成果复盘与下一步`;
  return `${context.topic}：核心问题与内容路径`;
}

function titleTopicFor(context) {
  const topic = String(context.topic || "").trim();
  if (context.type.id === "product_intro") return cleanProductIntroTopic(topic) || "产品介绍";
  if (context.type.id !== "project_plan") return topic;
  if (/方案$/.test(topic)) return topic;
  if (/招商|园区|入驻|合作|项目|建设|实施|落地/.test(topic)) return `${topic}方案`;
  return topic;
}

function cleanProductIntroTopic(value) {
  let topic = String(value || "").trim();
  for (let index = 0; index < 6; index += 1) {
    const next = topic
      .replace(/^(请|麻烦)?(帮我|给我|我要|我想|想要|需要)?(做|制作|生成|设计|出|弄)(一份|一个|一套|份|个|套)?/g, "")
      .replace(/^(请|麻烦)?帮(一家|一个|某个|这家)?/g, "")
      .replace(/^为(一家|一个|某个|这家)?/g, "")
      .replace(/^(关于|围绕)\s*/g, "")
      .trim();
    if (next === topic) break;
    topic = next;
  }
  topic = topic
    .replace(/(?:\d{1,2}|三十|二十|十九|十八|十七|十六|十五|十四|十三|十二|十一|十|九|八|七|六|五|四|三)\s*页(左右)?/g, "")
    .replace(/(?:PPT|ppt|幻灯片|演示文稿)/g, "")
    .replace(/制作一份.*$/g, "")
    .replace(/生成一份.*$/g, "")
    .replace(/做一份.*$/g, "")
    .replace(/大约.*$/g, "")
    .replace(/用于[^，,。；;]+/g, "")
    .replace(/发给[^，,。；;]+/g, "")
    .replace(/(简洁|商务|正式|科技|高级|活泼|年轻|温暖|风格).*$/g, "")
    .replace(/[，,。；;：:\s]+$/g, "")
    .trim();
  if (topic.length > 28) topic = topic.slice(0, 28);
  return topic;
}

function materialItemsForSection(sectionId, context) {
  const material = context.materialContext;
  const items = [];
  const add = (text, fragment) => {
    if (!text || !fragment) return;
    items.push({ text, source: toEvidenceSource(fragment) });
  };
  const structuredItems = productIntroMaterialItemsForSection(sectionId, context);
  if (structuredItems.length) items.push(...structuredItems);
  const addProjectAnchors = () => {
    if (context.type.id !== "project_plan") return;
    const sourceById = new Map(material.fragments.map(fragment => [fragment.source_id, fragment]));
    for (const anchor of anchorsForSection(sectionId, context)) {
      const source = sourceById.get(anchor.source_id);
      if (source) add(formatProjectAnchorForSection(sectionId, anchor, context), source);
    }
  };

  if (sectionId === "cover") {
    if (material.brand) {
      const source = material.fragments.find(fragment => fragment.source_id === material.brand.source_id);
      add(`品牌 / 项目：${material.brand.value}`, source);
    }
    const background = material.project_background[0];
    if (background) add(summarizeMaterialFragment(background), background);
    return items;
  }

  addProjectAnchors();

  if (["dataBasis", "background", "objective"].includes(sectionId)) {
    legacyFragments(material.project_background).slice(0, 2).forEach(fragment => add(summarizeMaterialFragment(fragment), fragment));
    const factPool = legacyFragments([...(material.confirmed_facts || []), ...(material.user_material_facts || [])]);
    factPool.filter(fragment => fragment.semantic_tags.some(tag => ["pre_launch", "no_customer_data", "undetermined_strategy"].includes(tag)))
      .slice(0, 2).forEach(fragment => add(summarizeMaterialFragment(fragment), fragment));
    const strategy = legacyFragments(material.fragments).find(fragment => fragment.semantic_tags.includes("low_cost_validation"));
    if (strategy) add(summarizeMaterialFragment(strategy), strategy);
  }

  if (sectionId === "sampleOverview") {
    legacyFragments([...(material.confirmed_facts || []), ...(material.user_material_facts || [])]).filter(fragment => fragment.semantic_tags.includes("no_customer_data"))
      .slice(0, 1).forEach(fragment => add(summarizeMaterialFragment(fragment), fragment));
    legacyFragments(material.provided_materials).slice(0, 1).forEach(fragment => add(`已有资料：${fragment.excerpt.replace(/^已有资料\s*[：:]?/, "")}`, fragment));
    legacyFragments(material.explicit_gaps).slice(0, 1).forEach(fragment => add(`资料缺口：${fragment.excerpt.replace(/^资料缺口\s*[：:]?/, "")}`, fragment));
  }

  if (["segments", "archetype"].includes(sectionId)) {
    const sourceById = new Map(material.fragments.map(fragment => [fragment.source_id, fragment]));
    collectTraceableSegments(context).forEach(segment => {
      const fragment = sourceById.get(segment.source_id);
      if (fragment) add(`待验证方向：${fragment.excerpt.replace(/^待验证假设\s*[：:]?/, "")}（不代表真实客户结论）`, fragment);
    });
  }

  if (sectionId === "needsJourney") {
    legacyFragments(material.management_questions).slice(0, 2).forEach(fragment => add(`管理层重点问题：${fragment.excerpt.replace(/^管理层(?:重点)?问题\s*[：:]?/, "")}`, fragment));
    legacyFragments(material.hypotheses).slice(0, 1).forEach(fragment => add(`待验证方向：${fragment.excerpt}，不代表真实客户结论。`, fragment));
  }

  if (["implications", "closing", "next", "plan"].includes(sectionId)) {
    const strategy = legacyFragments(material.fragments).find(fragment => fragment.semantic_tags.includes("low_cost_validation"));
    if (strategy) add(`验证策略：先以低成本、小范围验证关键假设，再决定投入规模。`, strategy);
    const decision = legacyFragments(material.required_decisions)[0];
    if (decision && decisionSourceMatchesAuthority(decision, context)) {
      add(`${decisionActorFor(context)}决策事项：依据验证结果选择继续投入、调整方案或停止推进，并确认下一阶段预算、范围和责任人。`, decision);
    }
    legacyFragments(material.fragments).filter(fragment => fragment.semantic_tags.includes("undetermined_strategy"))
      .slice(0, 1).forEach(fragment => add(summarizeMaterialFragment(fragment), fragment));
  }

  return dedupeContentItems(items);
}

function productIntroMaterialItemsForSection(sectionId, context) {
  const allocation = getProductIntroMaterialAllocation(context);
  if (!allocation) return [];
  return allocation.records
    .filter(record => record.assigned_section_id === sectionId)
    .sort((left, right) => left.slot_index - right.slot_index)
    .map(record => ({ text: record.rendered_text, source: toEvidenceSource(record.fragment), allocation: record }));
}

function getProductIntroMaterialAllocation(context) {
  if (context?.type?.id !== "product_intro") return null;
  if (!Object.hasOwn(context, PRODUCT_INTRO_ALLOCATION_CACHE)) {
    Object.defineProperty(context, PRODUCT_INTRO_ALLOCATION_CACHE, {
      value: buildProductIntroMaterialAllocation(context),
      configurable: false,
      enumerable: false,
      writable: false
    });
  }
  return context[PRODUCT_INTRO_ALLOCATION_CACHE];
}

export function buildProductIntroMaterialAllocation(context) {
  const availableSections = new Set(productIntroMappedSectionsForContext(context));
  const capacities = buildProductIntroSectionCapacities(context, availableSections);
  const usedFragments = new Set();
  const records = [];
  const structured = (context.materialContext?.fragments || [])
    .flatMap(fragment => {
      const normalized = normalizeProductIntroFragmentForAllocation(fragment, context);
      return normalized ? [{ fragment: normalized }] : [];
    })
    .map((item, index) => ({ ...item, index }));
  const groups = [
    { assertionType: "explicit_confirmed_fact", priority: 1 },
    { assertionType: "user_material_fact", priority: 2 }
  ];
  for (const group of groups) {
    const groupItems = structured.filter(entry => entry.fragment.assertion_type === group.assertionType);
    assignRequiredProductIntroFragments(groupItems, capacities, availableSections, usedFragments, group.priority, records);
    for (const item of groupItems) {
      if (usedFragments.has(item.fragment.fragment_id)) continue;
      const assigned = assignProductIntroFragment(item.fragment, capacities, availableSections, group.priority, records);
      if (!assigned) continue;
      usedFragments.add(item.fragment.fragment_id);
    }
  }
  return {
    records,
    capacities: Object.fromEntries([...capacities.entries()].map(([sectionId, value]) => [sectionId, {
      total_slots: value.totalSlots,
      confirmed_slots: value.confirmedSlots,
      ordinary_slots: value.totalSlots,
      used_slots: value.used,
      remaining_slots: Math.max(0, value.totalSlots - value.used),
      min_generic_items: value.minGeneric,
      final_content_limit: value.finalContentLimit,
      replacement_positions: value.replacementPositions
    }]))
  };
}

function assignRequiredProductIntroFragments(items, capacities, availableSections, usedFragments, priority, records) {
  for (const [sectionId, requirements] of Object.entries(PRODUCT_INTRO_SECTION_DETAIL_REQUIREMENTS)) {
    if (!availableSections.has(sectionId)) continue;
    for (const requirement of requirements) {
      while (countSectionDetailRecords(records, sectionId, requirement.details) < requirement.min) {
        const item = items.find(entry =>
          !usedFragments.has(entry.fragment.fragment_id)
          && requirement.details.includes(entry.fragment.category_detail)
          && productIntroFragmentCanTargetSection(entry.fragment, sectionId)
        );
        if (!item) break;
        const assigned = assignProductIntroFragmentToSection(item.fragment, sectionId, capacities, priority, records);
        if (!assigned) break;
        usedFragments.add(item.fragment.fragment_id);
      }
    }
  }
}

function countSectionDetailRecords(records, sectionId, details) {
  return records.filter(record =>
    record.assigned_section_id === sectionId
    && details.includes(record.category_detail)
  ).length;
}

function productIntroFragmentCanTargetSection(fragment, sectionId) {
  const mapping = PRODUCT_INTRO_CATEGORY_MAP[fragment.category];
  if (!mapping) return false;
  return [...mapping.preferred, ...mapping.fallback].includes(sectionId);
}

function assignProductIntroFragment(fragment, capacities, availableSections, priority, records) {
  const mapping = PRODUCT_INTRO_CATEGORY_MAP[fragment.category];
  const candidates = [...mapping.preferred, ...mapping.fallback].filter(sectionId => availableSections.has(sectionId));
  for (const sectionId of candidates) {
    const record = assignProductIntroFragmentToSection(fragment, sectionId, capacities, priority, records);
    if (record) return record;
  }
  return null;
}

function assignProductIntroFragmentToSection(fragment, sectionId, capacities, priority, records) {
  const capacity = capacities.get(sectionId);
  if (!capacity || capacity.used >= capacity.totalSlots) return null;
  if (fragment.assertion_type === "explicit_confirmed_fact" && capacity.confirmedUsed >= capacity.confirmedSlots) return null;
  const slotIndex = capacity.used;
  capacity.used += 1;
  if (fragment.assertion_type === "explicit_confirmed_fact") capacity.confirmedUsed += 1;
  const record = {
    fragment_id: fragment.fragment_id,
    source_id: fragment.source_id,
    category: fragment.category,
    category_detail: fragment.category_detail,
    assertion_type: fragment.assertion_type,
    assigned_section_id: sectionId,
    allocation_priority: priority,
    slot_index: slotIndex,
    rendered_text: renderProductIntroFragment(fragment),
    formatting: "label_prefix_original_text",
    fragment
  };
  records.push(record);
  return record;
}

function renderProductIntroFragment(fragment) {
  const label = PRODUCT_INTRO_CATEGORY_MAP[fragment.category]?.label || "客户资料";
  return `${label}：${fragment.excerpt}`;
}

function buildProductIntroSectionCapacities(context, availableSections) {
  const maxContentPoints = context.delivery?.maxContentPoints || 5;
  const entries = PRODUCT_INTRO_SECTION_ORDER
    .filter(sectionId => availableSections.has(sectionId))
    .map(sectionId => {
      const rule = PRODUCT_INTRO_SECTION_CAPACITY[sectionId];
      const effectiveRule = isSoftwareProductContext(context) && SOFTWARE_PRODUCT_SECTION_CAPACITY_OVERRIDES[sectionId]
        ? { ...rule, ...SOFTWARE_PRODUCT_SECTION_CAPACITY_OVERRIDES[sectionId] }
        : rule;
      const finalContentLimit = Math.max(3, maxContentPoints);
      const totalSlots = Math.min(effectiveRule.totalSlots, Math.max(0, finalContentLimit - effectiveRule.minGeneric));
      return [sectionId, {
        ...effectiveRule,
        totalSlots,
        confirmedSlots: Math.min(effectiveRule.confirmedSlots, totalSlots),
        confirmedUsed: 0,
        used: 0,
        finalContentLimit,
        replacementPositions: Array.from({ length: totalSlots }, (_, index) => index)
      }];
    });
  return new Map(entries);
}

function productIntroMappedSectionsForContext(context) {
  const selected = PRODUCT_INTRO_ROLE_SELECTION_MATRIX[context.pageCount] || [];
  return selected.filter(sectionId => PRODUCT_INTRO_SECTION_CAPACITY[sectionId]);
}

function isStructuredMappableFragment(fragment) {
  return fragment
    && fragment.category
    && fragment.category !== "unclassified"
    && STRUCTURED_ASSERTION_TYPES.has(fragment.assertion_type)
    && fragment.assertion_type !== "pending_suggestion";
}

function normalizeProductIntroFragmentForAllocation(fragment, context) {
  if (!fragment || !["explicit_confirmed_fact", "user_material_fact", "pending_suggestion"].includes(fragment.assertion_type)) return null;
  if (isSoftwareProductPhysicalExclusionFact(fragment, context)) return null;
  if (fragment.assertion_type === "pending_suggestion" && !isProductIntroProcessFactDespitePending(fragment.excerpt, context)) return null;
  if (isStructuredMappableFragment(fragment) && PRODUCT_INTRO_CATEGORY_MAP[fragment.category]) {
    const categoryDetail = resolveProductIntroCategoryDetail(fragment, fragment.category, context);
    return {
      ...fragment,
      category: resolveProductIntroCategoryForDetail(fragment, fragment.category, categoryDetail, context),
      category_detail: categoryDetail
    };
  }
  if (fragment.category && fragment.category !== "unclassified") return null;
  const inferredCategory = inferProductIntroCategoryFromFragment(fragment.excerpt, context);
  return inferredCategory && PRODUCT_INTRO_CATEGORY_MAP[inferredCategory]
    ? {
        ...fragment,
        assertion_type: fragment.assertion_type === "pending_suggestion" ? "user_material_fact" : fragment.assertion_type,
        category: resolveProductIntroCategoryForDetail(
          fragment,
          inferredCategory,
          resolveProductIntroCategoryDetail(fragment, inferredCategory, context),
          context
        ),
        category_detail: resolveProductIntroCategoryDetail(fragment, inferredCategory, context)
      }
    : null;
}

function isSoftwareProductPhysicalExclusionFact(fragment, context) {
  if (!isSoftwareProductContext(context)) return false;
  return /不涉及|不包含|不承诺|无需|不需要/.test(fragment.excerpt || "")
    && /批量生产|物流运输|物流交付|样品交付|样品确认|打样|设备制造|视觉检测设备|自动化工位|外箱包装|门店分发/.test(fragment.excerpt || "");
}

function isProductIntroProcessFactDespitePending(excerpt, context) {
  if (context?.type?.id !== "product_intro") return false;
  const text = String(excerpt || "");
  return /(?:材料建议|尺寸确认|结构确认|批量确认|确认报价|样品修改)/.test(text)
    && !/(?:待确认|待补充|是否|不确定|未知|缺口|补充|核实)/.test(text);
}

function inferProductIntroCategoryFromFragment(excerpt, context) {
  if (context?.type?.id !== "product_intro") return "";
  const text = String(excerpt || "");
  if (isSoftwareProductContext(context)) {
    if (/设备台账|数据看板|告警管理|工单(?:管理|协作)|点巡检|权限管理|核心功能|产品功能|访问权限/.test(text)) return "software_function";
    if (/设备接入|网关|标准工业协议|设备接口|接口适配|接口文档|开放能力|安全策略|MES|ERP|企业微信|钉钉|系统集成|现有系统|控制系统|网络条件|现场数据接口|人工录入|移动端巡检/.test(text)) return "software_access_integration";
    if (/需求调研|系统梳理|接入方案确认|账号与权限配置|数据初始化|功能配置|试运行|用户培训|上线验收|实施流程|上线前/.test(text)) return "software_implementation";
    if (/账号权限|角色权限|操作记录|数据范围控制|服务器配置|并发用户量|数据保存周期|安全认证|权限规则|数据口径|验收方式|性能指标/.test(text)) return "software_validation";
    if (/云端部署|本地化部署|部署方式|平台账号|接口配置|培训材料|操作手册|验收记录|分阶段上线|软件项目交付|软件上线|不同工厂|不同车间|服务支持|项目实施|系统配置|使用答疑|问题排查|版本维护/.test(text)) return "software_delivery";
    if (/设备范围|功能范围|接口资料|实施范围|下一步|方案确认/.test(text)) return "software_next_step";
  }
  if (/交付方式|交付内容|批量生产|分批交付|门店分发|统一仓库|物流交付|复购补单|发货/.test(text)) return "delivery_capability";
  if (/打样|样品制作|样品修改|批量确认|需求沟通|尺寸确认|材料建议|结构确认|确认报价/.test(text)) return "service_process";
  if (/外卖保温袋|奶茶手提袋|咖啡外带袋|铝箔保温袋|无纺布手提袋|礼赠包装袋|无纺布|铝膜|珍珠棉|编织布|牛津布|复合膜|裁切|复合|缝制|热压|成品整理|产品类别|核心产品|材料|材质|生产工艺/.test(text)) return "product_and_process";
  if (/质量检查|质量控制|检验项目|检查项目|外观|印刷位置|缝线|封边|配件安装|承重表现|抽检|质检/.test(text)) return "quality_check";
  if (/尺寸|袋型|颜色|品牌图案|提手|拉链|内衬|logo|活动主题|定制/.test(text)) return "customization_capability";
  return "";
}

function resolveProductIntroCategoryDetail(fragment, category, context) {
  const detail = fragment.category_detail;
  if (detail && detail !== "unclassified" && detail !== category) return normalizeProductIntroCategoryDetail(detail, fragment.excerpt, category, context);
  return inferProductIntroCategoryDetailFromFragment(fragment.excerpt, category, context);
}

function resolveProductIntroCategoryForDetail(fragment, category, detail, context) {
  if (!isSoftwareProductContext(context)) return category;
  if (["software_core_function"].includes(detail)) return "software_function";
  if (["software_access", "software_integration", "software_configuration_boundary"].includes(detail)) return "software_access_integration";
  if (["software_implementation", "software_go_live"].includes(detail)) return "software_implementation";
  if (["software_permission", "software_security", "software_acceptance_metric", "software_performance_pending"].includes(detail)) return "software_validation";
  if (["software_deployment", "software_delivery_content", "software_delivery_method", "software_service_support"].includes(detail)) return "software_delivery";
  if (["software_next_step", "software_scope_confirmation"].includes(detail)) return "software_next_step";
  if (category === "delivery_capability" && /软件|平台账号|功能配置|接口配置|培训材料|操作手册|验收记录|分阶段上线|云端部署|本地化部署/.test(fragment.excerpt || "")) return "software_delivery";
  return category;
}

function normalizeProductIntroCategoryDetail(detail, excerpt, category, context) {
  if (detail === "production_and_delivery") return inferProductIntroCategoryDetailFromFragment(excerpt, category, context);
  if (detail === "product_and_process") return inferProductIntroCategoryDetailFromFragment(excerpt, category, context);
  if (isSoftwareProductContext(context) && ["delivery_content", "delivery_method", "delivery_capability"].includes(detail)) {
    return inferProductIntroCategoryDetailFromFragment(excerpt, category, context);
  }
  return detail;
}

function inferProductIntroCategoryDetailFromFragment(excerpt, category, context) {
  if (context?.type?.id !== "product_intro") return category || "unclassified";
  const text = String(excerpt || "");
  if (isSoftwareProductContext(context)) {
    if (category === "software_function") return "software_core_function";
    if (category === "software_access_integration") {
      if (/系统集成|MES|ERP|企业微信|钉钉|接口适配|业务系统/.test(text)) return "software_integration";
      if (/接口文档|开放能力|安全策略|数据范围|未确认|评估|确认/.test(text)) return "software_configuration_boundary";
      return "software_access";
    }
    if (category === "software_implementation") return /上线|试运行|培训|验收/.test(text) ? "software_go_live" : "software_implementation";
    if (category === "software_validation") {
      if (/账号权限|角色权限|权限|操作记录|数据范围/.test(text)) return "software_permission";
      if (/安全|认证/.test(text)) return "software_security";
      if (/验收|数据口径|指标/.test(text)) return "software_acceptance_metric";
      return "software_performance_pending";
    }
    if (category === "software_deployment_security") {
      if (/云端部署|本地化部署|部署方式|网络环境|IT运维|使用规模/.test(text)) return "software_deployment";
      if (/账号权限|角色权限|操作记录|数据范围|安全|认证|服务器配置|并发|保存周期/.test(text)) return "software_security";
      return "software_deployment";
    }
    if (category === "software_delivery") {
      if (/云端部署|本地化部署|部署方式/.test(text)) return "software_deployment";
      if (/分阶段上线|不同工厂|不同车间|设备范围|分别确认/.test(text)) return "software_delivery_method";
      if (/服务内容|项目实施|系统配置|用户培训|使用答疑|问题排查|版本维护|服务时间|升级机制|现场支持/.test(text)) return "software_service_support";
      return "software_delivery_content";
    }
    if (category === "software_next_step") return /范围|接口资料|权限规则|方案确认/.test(text) ? "software_scope_confirmation" : "software_next_step";
    if (category === "delivery_capability") {
      if (/云端部署|本地化部署|部署方式/.test(text)) return "software_deployment";
      if (/分阶段上线|不同工厂|不同车间|分别确认/.test(text)) return "software_delivery_method";
      if (/平台账号|功能配置|设备台账|权限配置|接口配置|培训材料|操作手册|验收记录|软件项目交付/.test(text)) return "software_delivery_content";
    }
  }
  if (category === "product_and_process") {
    if (/生产工艺|工艺流程|裁切|印刷|复合|缝制|热压|封边|配件安装|成品整理/.test(text)) return "production_process";
    if (/材料结构|材料包括|材质|无纺布|铝膜|珍珠棉|编织布|牛津布|复合膜/.test(text)
      && !/保温袋|手提袋|外带袋|包装袋|礼赠包装袋/.test(text)) return "material_structure";
    if (/核心产品|产品类别|产品类型|保温袋|手提袋|外带袋|包装袋|礼赠包装袋/.test(text)) return "core_product";
    if (/材料|材质/.test(text)) return "material_structure";
    return "product_and_process";
  }
  if (category === "delivery_capability") {
    if (/交付内容|成品包装袋|外箱包装|装箱清单|样品确认记录|物流信息/.test(text)) return "delivery_content";
    if (/交付方式|分批交付|门店分发|统一仓库|仓库交付|发货|配送|物流交付/.test(text)) return "delivery_method";
    if (/批量生产前|最终样品|印刷文件|包装要求|确认后进入批量|确认条件/.test(text)) return "delivery_readiness";
    if (/生产安排|样品制作|批量生产/.test(text)) return "production_arrangement";
    return "delivery_capability";
  }
  return category || "unclassified";
}

function legacyFragments(fragments = []) {
  return fragments.filter(fragment => !fragment.category || fragment.category === "unclassified" || !STRUCTURED_ASSERTION_TYPES.has(fragment.assertion_type));
}

function anchorsForSection(sectionId, context) {
  const categories = PROJECT_SECTION_ANCHOR_CATEGORIES[sectionId] || [];
  const seen = new Set();
  return (context.materialAnchors || [])
    .filter(anchor => anchor.categories.some(category => categories.includes(category)))
    .filter(anchor => {
      const key = `${anchor.label}:${anchor.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, ["background", "resources", "value"].includes(sectionId) ? 4 : 3);
}

function formatProjectAnchorForSection(sectionId, anchor, context = {}) {
  const isParkInvestment = context?.industry?.id === "park_investment";
  if (sectionId === "industry" && anchor.categories.includes("industry")) {
    if (isParkInvestment) return `目标企业类型：围绕${anchor.value}相关企业建立招商筛选与沟通优先级`;
    return `目标合作对象：围绕${anchor.value}相关对象建立筛选与沟通优先级`;
  }
  if (sectionId === "architecture" && anchor.categories.includes("industry")) {
    if (isParkInvestment) return `招商内容口径：以${anchor.value}为目标产业表达主线`;
    return `合作内容口径：以${anchor.value}为目标方向表达主线`;
  }
  return `${anchor.label}：${anchor.value}`;
}

function summarizeMaterialFragment(fragment) {
  if (fragment.semantic_tags.includes("pre_launch")) return `市场阶段：${fragment.excerpt}`;
  if (fragment.semantic_tags.includes("market_entry")) return `项目背景：${fragment.excerpt}`;
  if (fragment.semantic_tags.includes("no_customer_data")) return "证据边界：当前尚无真实客户销量、订单、试驾、咨询或转化数据，分析仅用于建立验证框架。";
  if (fragment.semantic_tags.includes("undetermined_strategy")) return `待确认变量：${fragment.excerpt}`;
  if (fragment.semantic_tags.includes("low_cost_validation")) return "验证策略：先低成本验证关键假设，再决定是否扩大投入。";
  return fragment.excerpt.length > 70 ? `${fragment.excerpt.slice(0, 68)}…` : fragment.excerpt;
}

function mergeContentItems(priorityItems, fallbackItems, limit) {
  const items = dedupeContentItems([...priorityItems, ...fallbackItems]).slice(0, limit);
  return {
    points: items.map(item => item.text),
    sources: items.flatMap(item => item.source ? [item.source] : [])
  };
}

function dedupeContentItems(items) {
  return [...new Map(items.filter(item => item?.text).map(item => [item.text, item])).values()];
}

function dedupeEvidenceSources(items) {
  return [...new Map(items.filter(Boolean).map(item => [`${item.source_id}:${item.fragment_id || ""}`, item])).values()];
}

function evidenceSourceKey(source) {
  return `${source?.source_id || ""}:${source?.fragment_id || ""}`;
}

function sourceCandidateSupportsSlide(source, fragment, slide, { directSourceIds, directSourceKeys }) {
  if (!fragment) return false;
  if (sourceSupportsSlide(fragment, slide, { directSourceIds })) return true;
  return directSourceKeys.has(evidenceSourceKey(source)) && sourceRenderedInSlide(fragment, slide);
}

function selectTitleSubtitle(context) {
  const source = `${context.purpose} ${context.requirement}`;
  if (/管理层|老板|决策人/.test(source)) return "管理层决策汇报";
  if (/营销团队|市场团队/.test(source)) return /内部|讨论/.test(source) ? "营销洞察与内部讨论" : "营销洞察与人群策略";
  if (/对外|推介|招商/.test(source) && context.industry.id === "park_investment") return "招商价值与合作路径";
  const defaults = {
    customer_persona: context.industry.id === "food_beverage" ? "消费人群与增长机会" : "用户洞察与业务启示",
    market_analysis: "市场判断与机会验证",
    business_report: "关键进展与管理行动",
    product_intro: "核心价值与应用场景",
    project_plan: "价值主张与落地路径",
    promotion: "传播策略与行动路径",
    work_summary: "成果复盘与下一步",
    history_culture: "历史脉络与当代审美",
    generic: "核心问题与行动框架"
  };
  return defaults[context.type.id] || "洞察与行动建议";
}

function compactPurpose(value) {
  const purpose = cleanSubtitlePart(value);
  if (!purpose) return "";
  if (/招商|推介/.test(purpose)) return "用于招商推介";
  if (/汇报/.test(purpose)) return "用于项目汇报";
  if (/沟通|介绍|展示/.test(purpose)) return "用于项目沟通";
  return purpose.length > 16 ? `${purpose.slice(0, 16)}…` : purpose;
}

function compactProjectPurpose(context) {
  const purpose = cleanSubtitlePart(context.purpose);
  const source = `${context.requirement} ${context.scenario} ${purpose}`;
  if (/招商|推介/.test(source)) return "用于招商推介";
  return compactPurpose(purpose);
}

function compactProjectAudience(context) {
  const audience = cleanSubtitlePart(context.audience);
  if (!audience || audience === "目标听众") return "";
  const text = audience.replace(/^面向/, "");
  if (context.industry?.id === "park_investment") {
    const groups = [];
    if (/入驻|企业|客户/.test(text)) groups.push("入驻企业");
    if (/投资/.test(text)) groups.push("投资相关方");
    if (/招商|主管|部门|管委会/.test(text)) groups.push("招商相关方");
    if (groups.length >= 2) return [...new Set(groups)].join("、");
    if (groups.length === 1) return groups[0];
    return text.length > 14 ? "项目合作相关方" : text;
  }
  return text.length > 18 ? `${text.slice(0, 18)}…` : text;
}

function projectPlanFallbackTitle(sectionId, context) {
  if (context.type.id !== "project_plan" || context.industry.id !== "park_investment") return "";
  const titles = {
    background: "项目基础信息与招商任务",
    positioning: "园区产业定位",
    industry: "目标企业与招商对象",
    architecture: "招商触达与转化体系"
  };
  return titles[sectionId] || "";
}

function projectPlanTitleCompatible(text, sectionId) {
  if (/系统方案|模块职责|输入输出|协作关系|业务层|能力层|运营层|保障层/.test(text)) return false;
  if (sectionId === "background") {
    if (/机遇|趋势|增长|市场规模|战略定位/.test(text)) return false;
    return /项目|基础|背景|任务|目标|概览|边界/.test(text);
  }
  if (sectionId === "positioning") {
    if (/画像|招商对象|目标企业|筛选|沟通优先级|触达/.test(text)) return false;
    return /产业|定位|方向|承接|价值/.test(text);
  }
  if (sectionId === "industry") {
    if (/产业定位|园区定位/.test(text)) return false;
    return /招商对象|目标企业|企业类型|筛选|沟通优先级|触达/.test(text);
  }
  if (sectionId === "resources") return /资源|设施|配套|空间|载体|基础|区位/.test(text);
  if (sectionId === "service") return /服务|支持|体系|能力/.test(text);
  if (sectionId === "architecture") {
    if (/^方案架构$/.test(text)) return false;
    return /招商.*体系|触达|转化|运营|内容口径/.test(text);
  }
  if (sectionId === "process") return /流程|入驻|合作|路径/.test(text);
  if (sectionId === "closing") return /下一步|合作|结论|行动|收束/.test(text);
  return true;
}

function cleanSubtitlePart(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[，,。；;：:、]+$/g, "")
    .replace(/^[，,。；;：:、]+/g, "")
    .trim();
}

function normalizeSubtitle(value) {
  return String(value || "")
    .replace(/[。；;：:]+(?=，)/g, "")
    .replace(/，{2,}/g, "，")
    .replace(/用于用于/g, "用于")
    .replace(/[，,。；;：:、]+$/g, "")
    .trim();
}

function replaceTokens(value, context) {
  return String(value).replaceAll("{topic}", context.topic).replaceAll("{type}", context.type.label).replaceAll("{industry}", context.industry.label);
}

function buildAppendixRecipe(sectionId, typeLabel) {
  const number = sectionId.match(/\d+$/)?.[0] || "";
  return {
    title: `${typeLabel}资料验证附录${number}`,
    points: ["列出本专题使用的数据字段、资料来源和更新时间", "标记缺失、冲突和需要人工确认的信息", "记录分析假设、验证方法和结论使用边界"],
    visual: { kind: `appendix-${number}`, description: "资料来源、字段、状态和责任人四列表", scene: "资料验证表", ai: false },
    needs: []
  };
}

function applyPersonaVisualPolicy(visual, sectionId, context, segments = []) {
  if (context.type.id !== "customer_persona" || !["segments", "archetype"].includes(sectionId)) return visual;
  if (!segments.length) {
    return { ...visual, kind: "segment-framework-matrix", description: "任务场景、预算边界、使用条件与验证资料分群条件矩阵", ai: false };
  }
  const countedVisual = { ...visual, description: `${segments.length}张等宽画像卡片，对应${segments.map(item => item.label).join("、")}` };
  if (!context.explicitHumanVisual) return { ...countedVisual, ai: false };
  return {
    ...countedVisual,
    kind: `${countedVisual.kind}-photo`,
    description: `${countedVisual.description}，人物图与数据字段严格分区`,
    scene: "克制自然的多元用户角色形象，不带数据、文字或属性暗示",
    ai: true
  };
}

function sanitizeRecipe(recipe, context) {
  const visual = recipe.visual || {};
  return {
    ...recipe,
    points: (recipe.points || []).map(point => sanitizeGeneratedText(point, context)),
    visual: {
      ...visual,
      description: sanitizeGeneratedText(visual.description, context),
      scene: sanitizeGeneratedText(visual.scene, context)
    }
  };
}

function sanitizeGeneratedText(value, context) {
  let text = String(value || "");
  if (context.type?.id === "product_intro") {
    text = sanitizeProductIntroWording(text, context);
  }
  if (context.sourceMode === "simple" && !(context.confirmedFacts || []).length) {
    text = text
      .replace(/已确认/g, "建议待确认")
      .replace(/呈现客户建议待确认/g, "梳理待确认")
      .replace(/围绕建议待确认/g, "围绕待确认")
      .replace(/建议待确认服务/g, "待确认服务")
      .replace(/建议待确认产业/g, "待确认产业");
  }
  if (resolveChannelState(context) !== "confirmed_physical_channel") {
    text = text
      .replace(/门店来源/g, "渠道触点来源")
      .replace(/门店咨询记录/g, "咨询触点记录")
      .replace(/门店咨询/g, "咨询触点")
      .replace(/门店转化/g, "渠道转化记录")
      .replace(/门店布局/g, "渠道布局假设")
      .replace(/门店/g, "渠道触点");
  }
  text = text.replace(/(决策路径\s*[：:])([^。\n]+)/g, (_, prefix, stages) => `${prefix}${stages.replace(/[、，,]/g, "→")}`);
  return text
    .replace(/典型痛点/g, "待验证痛点方向")
    .replace(/痛点层/g, "待验证痛点方向")
    .replace(/核心偏好/g, "待验证偏好方向")
    .replace(/真实障碍/g, "潜在影响项")
    .replace(/否决风险/g, "需核验风险");
}

function sanitizeProductIntroWording(value, context) {
  let text = String(value || "");
  text = text
    .replace(/标明自动化、人工确认或制作处理环节/g, "标明关键处理环节、人工确认节点和质量检查方式")
    .replace(/为场景准备真实截图、产品图或后续素材清单/g, "为场景准备真实产品图、细节图、界面素材或后续素材清单")
    .replace(/区分样品、批量、上线或服务交付的不同阶段/g, "区分样品确认、批量处理、验收交付或服务启用的不同阶段")
    .replace(/资料确认—制作处理—验收交付/g, "资料确认—处理协作—验收交付")
    .replace(/能力 × 客户收益价值矩阵/g, "能力 × 使用条件价值矩阵");
  if (!isSoftwareProductContext(context) && isPhysicalProductContext(context) && /工业\s*AI|工业视觉|视觉质检|视觉检测设备|质检设备|检测设备|工业相机|光源|镜头|工控机|PLC|机械手|输送线|产线集成|工位|检测对象|设备制造|安装调试/.test(`${context.requirement || ""} ${context.topic || ""} ${context.clientMaterials || ""} ${context.industry?.label || ""}`)) {
    text = text
      .replace(/真实截图、?/g, "")
      .replace(/截图/g, "设备实拍、检测样张或产线场景照片")
      .replace(/界面素材|页面截图|系统界面/g, "设备实拍、检测样张、工位照片或产线场景素材")
      .replace(/产品素材、细节素材、使用场景素材/g, "设备实拍、检测样张、工位照片和产线场景素材")
      .replace(/真实产品图、细节图、界面素材/g, "设备实拍、检测样张、工位照片和产线场景素材")
      .replace(/上线/g, "安装调试")
      .replace(/服务启用/g, "安装调试")
      .replace(/物流交付/g, "验收交付")
      .replace(/批量处理/g, "设备制造")
      .replace(/批量协作/g, "设备制造")
      .replace(/批量生产/g, "设备制造")
      .replace(/品牌或运营决策方/g, "品牌、采购、运营或品控决策方")
      .replace(/图案、结构、规格、服务或功能配置/g, "检测对象、设备结构、工位条件、接口或算法配置")
      .replace(/资料、样品、版本或沟通对象/g, "资料、测试样品、方案范围或沟通对象")
      .replace(/版本确认/g, "方案确认")
      .replace(/版本、试用范围/g, "方案范围、测试样品和现场条件")
      .replace(/交付或启用依赖/g, "安装调试与验收依赖")
      .replace(/自动化环节/g, "生产或质量检查环节")
      .replace(/事件或作品/g, "订单阶段或交付依赖")
      .replace(/时期节点/g, "交付阶段节点");
  } else if (isPhysicalProductContext(context)) {
    text = text
      .replace(/真实截图、?/g, "")
      .replace(/截图/g, "产品实拍、细节图或应用场景照片")
      .replace(/界面素材|页面截图|系统界面/g, "产品实拍图、样品图、产品细节图或应用场景照片")
      .replace(/产品素材、细节素材、使用场景素材/g, "产品实拍图、样品图、产品细节图和应用场景照片")
      .replace(/真实产品图、细节图、界面素材/g, "产品实拍图、样品图、产品细节图和应用场景照片")
      .replace(/上线/g, "交付验收")
      .replace(/服务启用/g, "物流交付")
      .replace(/批量处理/g, "批量生产")
      .replace(/批量协作/g, "批量生产")
      .replace(/品牌或运营决策方/g, "生产、质量、设备或采购决策方")
      .replace(/图案、结构、规格、服务或功能配置/g, "尺寸、袋型、材料、印刷、提手、拉链、内衬或品牌图案")
      .replace(/资料、样品、版本或沟通对象/g, "资料、样品、袋型、材料或沟通对象")
      .replace(/版本确认/g, "样品确认")
      .replace(/版本、试用范围/g, "袋型、材料、样品和使用场景")
      .replace(/交付或启用依赖/g, "生产、质检与交付依赖")
      .replace(/自动化环节/g, "生产或质量检查环节")
      .replace(/事件或作品/g, "订单阶段或交付依赖")
      .replace(/时期节点/g, "交付阶段节点");
  } else if (isSoftwareProductContext(context)) {
    text = text
      .replace(/真实产品图、细节图、界面素材/g, "系统界面、功能模块、数据流或权限配置素材")
      .replace(/产品素材、细节素材、使用场景素材/g, "功能架构、模块关系、使用场景和数据看板素材")
      .replace(/截图/g, "系统界面或数据看板")
      .replace(/起订量/g, "授权范围")
      .replace(/测试样品/g, "试用范围")
      .replace(/样品确认/g, "方案确认")
      .replace(/打样/g, "试运行")
      .replace(/批量生产/g, "系统上线")
      .replace(/批量处理|批量协作/g, "分阶段上线")
      .replace(/物流运输|物流交付/g, "上线交付")
      .replace(/产能/g, "资源条件")
      .replace(/设备制造/g, "系统配置")
      .replace(/检测样张/g, "数据样例")
      .replace(/工位照片/g, "系统界面")
      .replace(/外箱包装/g, "操作手册")
      .replace(/门店分发/g, "分阶段上线")
      .replace(/检测对象、设备结构、工位条件、接口或算法配置/g, "设备范围、接入方式、接口条件、权限与功能配置")
      .replace(/图案、结构、规格、服务或功能配置/g, "功能模块、设备接入、系统集成、权限或服务配置")
      .replace(/资料、样品、版本或沟通对象/g, "设备范围、功能范围、接口资料、权限规则或沟通对象")
      .replace(/资料、样品、版本/g, "资料、版本、试用范围")
      .replace(/版本、试用范围/g, "功能范围、权限规则、接口资料和实施范围")
      .replace(/交付或启用依赖/g, "部署、配置、培训与验收依赖")
      .replace(/订单阶段或交付依赖/g, "实施阶段或上线依赖")
      .replace(/时期节点/g, "实施里程碑");
  }
  return text;
}

function hasDuplicatedBrandAlias(title, context) {
  const brand = context.materialContext?.brand?.value || "";
  if (!brand || !/[｜|]/.test(title)) return false;
  const parts = String(title).split(/[｜|]/).map(part => normalizeBrand(part)).filter(Boolean);
  const normalizedBrand = normalizeBrand(brand);
  return parts.some((part, index) =>
    part !== normalizedBrand
    && normalizedBrand.includes(part)
    && parts.slice(0, index).includes(normalizedBrand)
  );
}

function normalizeBrand(value) {
  return String(value || "").replace(/[\s\p{P}\p{S}]+/gu, "");
}

function decisionActorFor(context) {
  return context.requestAuthority?.audience?.value || context.audience || "权威决策主体";
}

function decisionSourceMatchesAuthority(fragment, context) {
  const expected = decisionActorFor(context);
  const excerpt = fragment.excerpt;
  if (/董事会/.test(excerpt) && !/董事会/.test(expected)) return false;
  if (/投资委员会/.test(excerpt) && !/投资委员会/.test(expected)) return false;
  return true;
}

function isRecommendationSection(sectionId) {
  return ["implications", "productAdvice", "marketingAdvice", "channelAdvice", "actions", "strategy", "closing", "plan", "next"].includes(sectionId);
}

function conditionalizeRecommendation(value) {
  const text = String(value || "");
  const mapped = text.match(/^([^：:]{1,12}(?:建议|启示))\s*[：:]\s*把(.+?)映射到(.+)$/);
  if (mapped) {
    const subject = /关注点$/.test(mapped[2]) ? mapped[2] : `${mapped[2]}相关关注点`;
    return `${mapped[1]}（待验证）：验证${subject}后，再映射到${mapped[3]}`;
  }
  const recommendation = text.match(/^([^：:]{1,12}(?:建议|启示))\s*[：:]\s*(.+)$/);
  if (recommendation && !/验证.*后|确认后|若|前提/.test(recommendation[2])) {
    return `${recommendation[1]}（待验证）：验证相关事实与假设后，再决定是否${recommendation[2]}`;
  }
  return text;
}
