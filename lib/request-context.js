import { MATERIAL_TYPES, STYLE_THEMES, TYPE_DEFINITIONS } from "./outline-templates.js";
import { detectIndustryProfileForType } from "./industry-profiles.js";
import { resolveDeliveryPageCount, resolveDeliveryStrategy } from "./delivery-strategies.js";
import { normalizeMultiline, parseMaterialContext } from "./material-context.js";
import {
  buildCoverageMapForPlan,
  buildRequiredSectionPlan,
  cleanInstructionTopic,
  normalizeMustIncludeRuleState,
  parseStructuredRequirement,
  sectionIdsForRequiredPlan
} from "./structured-requirement.js";
import { createRequirementBindings, resolveRequiredSectionSelectionAuthority } from "./requirement-binding.js";
import { normalizeRiskRule, parseRiskRules, subjectTermsFromRules } from "../js/risk-rules.js";

export const PRODUCT_INTRO_PAGE_LIMIT_MESSAGE = "产品介绍类型当前支持 3–15 页。更长内容建议拆分为公司介绍、产品手册或案例专题。";

export function buildRequestAuthority(input = {}, planningAnalysis = null) {
  const rawRequest = structuredClone(input);
  const structuredRequirement = parseStructuredRequirement(input.requirement);
  const materialCategories = toList(input.material_categories).filter(item => item !== "只有主题");
  const materialContext = parseMaterialContext({
    clientMaterials: input.client_materials,
    materialCategories,
    followUpAnswers: input.follow_up_answers
  });
  const purpose = normalizePurposeInput(input.detailed_purpose)
    || normalizePurposeInput(input.purpose)
    || structuredRequirement.explicitPurpose
    || inferPurpose(normalize(input.requirement), structuredRequirement);
  const candidates = [];
  const explicitAudience = normalize(input.audience);
  if (explicitAudience) candidates.push({
    value: explicitAudience,
    source: "explicit_field",
    intent: classifyAudienceIntent(explicitAudience),
    evidence: explicitAudience,
    roles: splitAudienceRoles(explicitAudience)
  });
  if (structuredRequirement.explicitAudience) candidates.push({
    value: structuredRequirement.explicitAudience,
    source: "requirement_label",
    intent: classifyAudienceIntent(structuredRequirement.explicitAudience),
    evidence: structuredRequirement.fields.audience,
    roles: splitAudienceRoles(structuredRequirement.explicitAudience)
  });
  const requirementAudience = extractStatedAudience(normalize(input.requirement));
  if (requirementAudience) candidates.push({ ...requirementAudience, source: "requirement_phrase" });
  const materialAudience = extractMaterialAudience(materialContext);
  if (materialAudience) candidates.push({ ...materialAudience, source: "material_phrase" });
  const modelAudience = normalize(planningAnalysis?.audience);
  if (modelAudience) candidates.push({
    value: modelAudience,
    source: "local_model",
    intent: classifyAudienceIntent(modelAudience),
    evidence: "validated_local_model",
    roles: splitAudienceRoles(modelAudience)
  });
  const inferredAudience = inferAudienceFromPurpose(`${purpose} ${normalize(input.scenario)}`, normalize(input.requirement));
  if (inferredAudience) candidates.push({ ...inferredAudience, source: "purpose_inference", evidence: purpose, roles: splitAudienceRoles(inferredAudience.value) });
  const audience = candidates[0] || { value: "目标听众", source: "default", intent: "unspecified", evidence: "", roles: [] };
  return deepFreeze({ rawRequest, audience: { ...audience, candidates }, materialContext, structuredRequirement });
}

export function parseRequestContext(input = {}, requestAuthority = buildRequestAuthority(input), planningAnalysis = null) {
  const requirement = normalize(input.requirement);
  if (!requirement) return { error: "requirement 不能为空" };

  const materialCategories = toList(input.material_categories).filter(item => item !== "只有主题");
  const followUpAnswers = normalize(input.follow_up_answers);
  const clientMaterials = [normalizeMultiline(input.client_materials), ...materialCategories, followUpAnswers]
    .filter(Boolean)
    .join("\n");
  const materialContext = requestAuthority.materialContext;
  const structuredRequirement = requestAuthority.structuredRequirement || parseStructuredRequirement(requirement);
  const type = resolveRequestType(requirement, structuredRequirement);
  const industrySource = `${requirement} ${clientMaterials.replace(/\n/g, " ")}`;
  const detectedIndustry = detectIndustryProfileForType(industrySource, type.id);
  const modelIndustry = normalize(planningAnalysis?.industry);
  const industry = detectedIndustry.id === "generic" && modelIndustry
    ? detectIndustryProfileForType(modelIndustry, type.id)
    : detectedIndustry;
  const industryDiagnostics = {
    selected_industry_profile: industry.id,
    profile_trigger_terms: industry.profile_trigger_terms || [],
    profile_confidence: industry.profile_confidence || (industry.id === "generic" ? "none" : "strong_signal")
  };
  const delivery = resolveDeliveryStrategy(input.deadline);
  const explicitPageCount = input.page_count !== undefined
    && input.page_count !== null
    && String(input.page_count).trim() !== "";
  const manualPageCountValue = extractManualPageCount(input.page_count, requirement, explicitPageCount);
  const inferredManualPageCount = manualPageCountValue !== null && !explicitPageCount;
  if (type.id === "product_intro" && manualPageCountValue !== null && (manualPageCountValue < 3 || manualPageCountValue > 15)) {
    return { error: PRODUCT_INTRO_PAGE_LIMIT_MESSAGE };
  }
  const modelPageCount = !explicitPageCount && !inferredManualPageCount
    ? planningAnalysis?.recommended_page_count
    : undefined;
  const pageCount = resolveDeliveryPageCount({ value: modelPageCount ?? input.page_count, requirement, type, strategy: delivery });
  const style = resolveStyle(input.style, `${requirement} ${clientMaterials}`);
  const statedPurpose = structuredRequirement.explicitPurpose || extractStatedPurpose(requirement);
  const explicitPurpose = normalizePurposeInput(input.detailed_purpose) || normalizePurposeInput(input.purpose);
  const purpose = explicitPurpose
    || structuredRequirement.explicitPurpose
    || inferPurposeForType(requirement, type)
    || statedPurpose
    || normalize(planningAnalysis?.purpose)
    || inferPurpose(requirement, structuredRequirement);
  const topic = structuredRequirement.topic || inferTitle(requirement);
  const mustIncludeRuleState = normalizeMustIncludeRuleState(input);
  const requiredSections = mustIncludeRuleState.hasStructured
    ? mustIncludeRuleState.plan.map(item => item.original_requirement || item.label).filter(Boolean)
    : [...new Set([
      ...structuredRequirement.requiredSections,
      ...toList(input.must_include)
    ])];
  const requiredSectionPlan = mustIncludeRuleState.hasStructured
    ? mustIncludeRuleState.plan
    : structuredRequirement.sectionPlan.length
      ? structuredRequirement.sectionPlan
      : buildRequiredSectionPlan(requiredSections);
  const requestId = normalize(input.request_id) || `req_${crypto.randomUUID()}`;
  const allowedSectionIds = [...(type.base || []), ...(type.extensions || [])];
  const requirementBindings = createRequirementBindings(requiredSectionPlan, allowedSectionIds, requestId);
  const requiredSectionSelection = resolveRequiredSectionSelectionAuthority({
    requirementBindings: requiredSectionPlan.length ? requirementBindings : undefined,
    legacyRequiredSectionPlan: requiredSectionPlan,
    allowedSections: allowedSectionIds
  });
  const availableMaterials = new Set();
  const materialLabels = new Map();

  MATERIAL_TYPES.forEach(([id, pattern, label]) => {
    materialLabels.set(id, label);
    if (materialContext.available_material_types.includes(id)) availableMaterials.add(id);
  });

  const supportTier = type.id !== "generic" || industry.id !== "generic" ? "production" : "generic";
  const materialAnchors = buildMaterialAnchors(materialContext.confirmed_facts);
  const excludedRuleState = normalizeExcludedRules(input);
  const excludedRules = excludedRuleState.rules;

  return {
    requestId,
    requestScopeId: requestId,
    requirement,
    topic,
    type,
    industry,
    industryDiagnostics,
    supportTier,
    requestAuthority,
    materialContext,
    clientMaterials,
    materialCategories,
    availableMaterials,
    materialLabels,
    hasMaterials: input.has_materials === undefined
      ? Boolean(clientMaterials && !/^只有主题$/.test(clientMaterials))
      : input.has_materials === true,
    hasCustomerEvidence: materialContext.has_customer_evidence,
    pageCount,
    requestedPageCount: pageCount,
    manualPageCount: explicitPageCount || inferredManualPageCount,
    style,
    theme: STYLE_THEMES[style] || STYLE_THEMES["简洁"],
    purpose,
    audience: requestAuthority.audience.value,
    audienceSource: requestAuthority.audience.source,
    audienceIntent: requestAuthority.audience.intent,
    confirmedFacts: materialContext.confirmed_facts,
    materialAnchors,
    industryAnchors: materialAnchors.filter(anchor => anchor.categories.includes("industry")),
    hypotheses: materialContext.hypotheses,
    materialGaps: materialContext.explicit_gaps,
    scenario: normalize(input.scenario) || normalize(planningAnalysis?.business_scenario),
    deadline: normalize(input.deadline),
    delivery,
    mustInclude: mustIncludeRuleState.hasStructured ? requiredSections : toList(input.must_include),
    mustIncludeRules: mustIncludeRuleState.hasStructured ? requiredSectionPlan : [],
    excludedContent: subjectTermsFromRules(excludedRules),
    excludedContentRules: excludedRules,
    excludedContentRuleSource: excludedRuleState.rule_source,
    excludedContentParseErrors: excludedRuleState.parse_errors,
    emphasis: normalize(input.emphasis),
    visualPreferences: normalizeVisualPreferences(input.visual_preferences),
    includeSpeakerNotes: input.include_speaker_notes !== false,
    followUpAnswers,
    planningProfile: input.planning_profile || "full_quality_outline",
    sourceMode: normalize(input.source_mode) || "api",
    planningAnalysis,
    planningSectionIntents: buildPlanningSectionIntents(planningAnalysis),
    structuredRequirement,
    requiredSections,
    requiredSectionPlan,
    requirementBindings,
    mustIncludeRuleSource: mustIncludeRuleState.rule_source,
    mustIncludeRuleDiagnostics: mustIncludeRuleState.diagnostics,
    mustIncludeRulesSchemaVersion: input.must_include_rules_schema_version,
    mustIncludeSourceCount: input.must_include_source_count,
    mustIncludeSourceHash: input.must_include_source_hash,
    requiredSectionIds: requiredSectionSelection.required_section_ids,
    requiredSectionSelectionAuthority: requiredSectionSelection.authority,
    requiredSectionSelectionDiagnostics: requiredSectionSelection,
    requiredSectionCoverageMap: buildCoverageMapForPlan(requiredSectionPlan, sectionIdsForRequiredPlan(requiredSectionPlan, Math.max(1, pageCount - 1))),
    explicitHumanVisual: /写实真人|真人摄影|人物照片|品牌人物|真人组图|摄影人物/.test(
      `${requirement} ${normalize(input.visual_preferences?.reference_style)}`
    )
  };
}

function normalizeExcludedRules(input = {}) {
  const hasStructured = Array.isArray(input.excluded_content_rules);
  if (hasStructured) {
    const normalized = input.excluded_content_rules
      .map(rule => normalizeRiskRule(rule, "excluded_content_rules"))
      .filter(Boolean);
    const parseErrors = normalized
      .filter(rule => rule.parse_error || rule.rule_type === "structured_parse_error")
      .map(rule => ({
        rule_source: "structured_parse_error",
        parse_error: rule.parse_error || "structured_rule_invalid",
        source_field: rule.source_field || "excluded_content_rules",
        raw_text: rule.raw_text || ""
      }));
    const valid = normalized.filter(rule => !rule.parse_error && rule.rule_type !== "structured_parse_error");
    if (parseErrors.length) {
      return { rules: [], rule_source: "structured_parse_error", parse_errors: parseErrors };
    }
    return { rules: valid, rule_source: "structured", parse_errors: [] };
  }
  return {
    rules: toList(input.excluded_content).map(term => ({
      raw_text: term,
      subject_terms: [term],
      forbidden_zones: ["页面标题", "副标题", "正文", "页面结论", "图示文字", "演讲备注"],
      source_field: "excluded_content",
      rule_type: "forbidden_subject"
    })),
    rule_source: "legacy_fallback",
    parse_errors: []
  };
}

function buildMaterialAnchors(fragments = []) {
  return fragments.flatMap(fragment => {
    const parsed = parseFactLine(fragment.excerpt);
    const categories = categoriesForFact(parsed.label, parsed.value);
    if (!parsed.value || !categories.length) return [];
    return [{
      label: parsed.label || "明确事实",
      value: parsed.value,
      text: fragment.excerpt,
      source_id: fragment.source_id,
      fragment_id: fragment.fragment_id,
      categories
    }];
  });
}

function parseFactLine(excerpt) {
  const match = String(excerpt || "").match(/^([^：:]{2,16})[：:]\s*(.+)$/);
  if (!match) return { label: "", value: normalize(excerpt) };
  return { label: normalize(match[1]), value: normalize(match[2]) };
}

function categoriesForFact(label, value) {
  const text = `${label} ${value}`;
  const categories = [];
  if (/项目名称|品牌|企业名称/.test(label)) categories.push("identity");
  if (/地点|区位|位置|城市|区域|地址/.test(label)) categories.push("location");
  if (/面积|空间|载体|厂房|楼宇|办公/.test(text)) categories.push("space");
  if (/产业方向|行业|产业|赛道|业务方向|产品方向/.test(label)) categories.push("industry");
  if (/设施|配套|研发中心|厂房|实验室|展示|路演|办公|生产/.test(text)) categories.push("facility");
  if (/服务|能力|对接|辅导|咨询|申报|支持|运营/.test(text)) categories.push("service");
  if (/目标客户|目标企业|招商对象|客群|受众|客户类型|企业类型/.test(label)) categories.push("target");
  if (/时间|建设时间|启动|计划|阶段|周期|年份|\d{4}年/.test(text)) categories.push("timeline");
  if (/数据|数值|金额|规模|数量|平方米|亩|亿元|万元|%/.test(text)) categories.push("metric");
  return [...new Set(categories)];
}

function buildPlanningSectionIntents(planningAnalysis) {
  const sections = Array.isArray(planningAnalysis?.sections) ? planningAnalysis.sections : [];
  return Object.freeze(Object.fromEntries(sections.map(section => [
    section.section_id,
    Object.freeze({
      title: normalize(section.title),
      objective: normalize(section.objective),
      role: normalize(section.role),
      key_message: normalize(section.key_message),
      bullets: Object.freeze(Array.isArray(section.bullets) ? section.bullets.map(normalize).filter(Boolean) : []),
      visual_direction: normalize(section.visual_direction),
      evidence_status: normalize(section.evidence_status),
      content_complete: Boolean(section.content_complete)
    })
  ])));
}

function resolveRequestType(requirement, structuredRequirement) {
  const firstMatch = TYPE_DEFINITIONS.find(definition => definition.pattern.test(requirement));
  if (firstMatch && firstMatch.id !== "generic") return firstMatch;
  const source = `${requirement}\n${structuredRequirement?.requiredSections?.join("、") || ""}\n${structuredRequirement?.fields?.purpose || ""}`;
  const byId = id => TYPE_DEFINITIONS.find(definition => definition.id === id);
  if (/招生宣传|招生介绍|专业招生|院校宣传/.test(source)) return byId("promotion");
  if (/招商介绍|招商方案|招商推介/.test(source) && !/产品矩阵|核心技术|产品介绍|品牌介绍/.test(source)) return byId("project_plan");
  if (/品牌介绍|客户提案|产品介绍|产品矩阵|核心技术|产品特点|品牌特点|安全体系|补能服务|合作支持|产品能力|功能介绍/.test(source)) return byId("product_intro");
  return firstMatch || TYPE_DEFINITIONS.at(-1);
}

function resolveStyle(value, source) {
  const selected = normalize(value);
  if (selected && selected !== "auto" && selected !== "自动判断") return selected;
  if (/历史|文化|审美|人文|传统/.test(source)) return "人文东方";
  if (/奶茶|年轻|潮流|活力|开业/.test(source)) return "年轻活力";
  if (/科技|AI|人工智能|数字化|新能源|系统/i.test(source)) return "科技感";
  if (/招商|汇报|经营|商务|企业|园区/.test(source)) return "商务正式";
  if (/高级|高端|质感|大气/.test(source)) return "高级";
  return "简洁";
}

function inferTitle(requirement) {
  const structured = parseStructuredRequirement(requirement);
  let title = cleanRequirementTopic(structured.firstTopicLine || requirement)
    .replace(/(?:\d{1,2}|十二|十|八|六)\s*页(左右)?/g, "")
    .replace(/[，,。；;]\s*(用于|面向|给|供).*/g, "")
    .replace(/[，,。；;：:]\s*[^，,。；;]{0,12}风格.*$/g, "")
    .replace(/[，,。；;：:]\s*(风格|明天|今晚|截止).*$/g, "")
    .replace(/(?:PPT|ppt|幻灯片|演示文稿)\s*$/g, "")
    .replace(/[，,。；;：:\s]+$/g, "")
    .trim();
  if (title.length > 36) title = title.slice(0, 36);
  return title || "PPT 方案";
}

function cleanRequirementTopic(requirement) {
  let title = cleanInstructionTopic(requirement);
  const prefixPattern = /^(?:(?:请|麻烦)?(?:帮我|给我|我要|我想|想要|需要)(?:做|制作|生成|设计|出|弄)(?:一份|一个|一套|份|个|套)?|(?:请|麻烦)?(?:做|制作|生成|设计|出|弄)(?:一份|一个|一套|份|个|套))/;
  for (let index = 0; index < 4; index += 1) {
    const next = title.replace(prefixPattern, "").trim();
    if (next === title) break;
    title = next;
  }
  return title;
}

function inferPurpose(requirement, structuredRequirement = parseStructuredRequirement(requirement)) {
  const clause = structuredRequirement.explicitPurpose || extractStatedPurpose(requirement);
  if (clause) return clause;
  if (/产品介绍|产品能力|功能介绍|公司与产品介绍|企业与产品介绍|服务介绍/.test(requirement)) return "产品介绍";
  if (/管理层|老板|决策/.test(requirement)) return "管理层汇报";
  if (/营销团队|市场团队/.test(requirement)) return "营销团队内部讨论";
  if (/对外推介|招商推介/.test(requirement)) return "对外推介";
  return "主题沟通与决策支持";
}

function inferPurposeForType(requirement, type) {
  if (type?.id === "product_intro" && /产品介绍|产品能力|功能介绍|公司与产品介绍|企业与产品介绍|服务介绍|介绍企业定位|介绍.*产品能力/.test(requirement)) return "产品介绍";
  return "";
}

function extractStatedPurpose(requirement) {
  const labelled = normalize(requirement.match(/(?:汇报目的|演示目的|使用目的)\s*[：:]\s*([^。\n；;]{2,120})/)?.[1]);
  if (labelled) return labelled;
  return normalize(requirement.match(/(?:用于|给|供)([^，,。；;]{2,40})/)?.[1]);
}

function extractStatedAudience(requirement) {
  const normalized = normalize(requirement);
  const patterns = [
    /汇报对象(?:是|为|：|:)?\s*([^，,。；;]{2,20})/,
    /用于向([^，,。；;]{2,60}?)(?:介绍|说明|展示)/,
    /(?:用于)?向([^，,。；;]{1,16}?)(?:进行)?(?:汇报|展示|介绍|沟通|说明)/,
    /面向([^，,。；;]{1,16}?)(?:进行)?(?:汇报|展示|介绍|沟通|说明)?(?:[，,。；;]|$)/,
    /给([^，,。；;]{1,16}?)(?:展示|介绍|汇报|沟通|说明)/
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const audience = normalizeAudiencePhrase(match[1]);
    if (audience) return { value: audience.value, intent: audience.intent, evidence: match[0], roles: splitAudienceRoles(match[1]) };
  }
  if (/用于内部(?:项目|方案|产品)?评审|内部(?:项目|方案|产品)?评审/.test(normalized)) {
    return { value: "内部项目评审者", intent: "internal_review", evidence: "内部项目评审", roles: ["内部项目评审者"] };
  }
  return null;
}

function extractMaterialAudience(materialContext) {
  const fragment = materialContext.fragments.find(item => item.field === "audience");
  if (!fragment) return null;
  const phrase = fragment.excerpt.replace(/^(?:汇报对象|面向对象|汇报给)\s*[：:]\s*/, "").trim();
  if (!phrase) return null;
  return {
    value: phrase,
    intent: classifyAudienceIntent(phrase),
    evidence: fragment.excerpt,
    roles: splitAudienceRoles(phrase)
  };
}

function normalizeAudiencePhrase(value) {
  const phrase = normalize(value).replace(/^(向|给|为)/, "").replace(/(?:进行|作)?$/, "");
  if (!phrase) return null;
  if (/董事会/.test(phrase)) return { value: "董事会", intent: "board" };
  if (/管理层|高管|领导|决策层|决策者|老板/.test(phrase)) {
    return { value: "管理层与内部决策者", intent: "internal_management" };
  }
  if (/潜在客户|意向客户/.test(phrase)) return { value: "潜在客户", intent: "prospective_customer" };
  if (/客户|合作方/.test(phrase)) return { value: phrase, intent: "external_customer" };
  if (/内部.*评审|项目评审/.test(phrase)) return { value: "内部项目评审者", intent: "internal_review" };
  return { value: phrase, intent: classifyAudienceIntent(phrase) };
}

function splitAudienceRoles(value) {
  return normalize(value).split(/(?:和|及|与|、|，|,|\/)+/).map(normalize).filter(Boolean);
}

function inferAudienceFromPurpose(source, requirement) {
  if (/管理层.*客户沟通.*培训|高管.*客户沟通.*培训/.test(requirement)) {
    return { value: "管理层与客户沟通相关人员", intent: "internal_training" };
  }
  if (/董事会/.test(source)) return { value: "董事会", intent: "board" };
  if (/内部.*评审|项目评审/.test(source)) return { value: "内部项目评审者", intent: "internal_review" };
  if (/管理层|高管|老板|领导|决策层|决策者/.test(source)) {
    return { value: "管理层与内部决策者", intent: "internal_management" };
  }
  if (/潜在客户|意向客户/.test(source)) return { value: "潜在客户", intent: "prospective_customer" };
  if (/营销团队|市场团队/.test(source)) return { value: "营销与市场团队", intent: "internal_team" };
  if (/评委|答辩|老师/.test(source)) return { value: "评委与专业听众", intent: "review_panel" };
  if (/员工|学员|内部培训/.test(source)) return { value: "员工与学员", intent: "internal_training" };
  return null;
}

function classifyAudienceIntent(value) {
  if (/董事会/.test(value)) return "board";
  if (/管理层|高管|老板|领导|决策层|决策者/.test(value)) return "internal_management";
  if (/内部.*评审|项目评审/.test(value)) return "internal_review";
  if (/潜在客户|意向客户/.test(value)) return "prospective_customer";
  if (/客户|合作方/.test(value)) return "external_customer";
  if (/培训|员工|学员/.test(value)) return "internal_training";
  return "custom";
}

function normalizeVisualPreferences(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    includeImages: source.include_images !== false,
    includeLayouts: source.include_layouts !== false,
    referenceStyle: normalize(source.reference_style)
  };
}

function toList(value) {
  if (Array.isArray(value)) return value.map(normalize).filter(Boolean);
  return normalize(value).split(/[，,、；;\n]+/).map(normalize).filter(Boolean);
}

function extractManualPageCount(value, requirement, explicitPageCount) {
  if (explicitPageCount) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.round(numeric) : null;
  }
  const digitMatch = String(requirement || "").match(/(\d{1,2})\s*页/);
  if (digitMatch) return Number(digitMatch[1]);
  const chineseNumbers = { "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10, "十一": 11, "十二": 12, "十三": 13, "十四": 14, "十五": 15, "十六": 16, "十七": 17, "十八": 18, "十九": 19, "二十": 20, "三十": 30 };
  const chineseMatch = String(requirement || "").match(/(三十|二十|十九|十八|十七|十六|十五|十四|十三|十二|十一|十|九|八|七|六|五|四|三)\s*页/);
  return chineseMatch ? chineseNumbers[chineseMatch[1]] : null;
}

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizePurposeInput(value) {
  const normalized = normalize(value);
  return ["auto", "自动判断", "自动"].includes(normalized) ? "" : normalized;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
