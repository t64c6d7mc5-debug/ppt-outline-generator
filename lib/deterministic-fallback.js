import { collectMissingMaterials } from "./evidence-state.js";
import { enforceFinalOutputContract } from "./final-output-contract.js";
import { buildNarrativePlan } from "./narrative-planner.js";
import { adaptOutlineCandidate } from "./output-adapter.js";
import { buildRequestAuthority, parseRequestContext } from "./request-context.js";
import {
  buildPresentationTitle,
  buildSubtitle,
  generateSlide,
  stripSlideInternals
} from "./slide-generator.js";
import { buildGlobalVisualStyle } from "./visual-planner.js";

/**
 * Builds a complete PPT script without model output. The context is derived
 * exclusively from the user's request, so a failed model attempt can never
 * contaminate the fallback with invented names, facts, numbers or relations.
 */
export function buildDeterministicFallback({ input = {} } = {}) {
  const normalizedInput = normalizeFallbackInput(input);
  const authority = buildRequestAuthority(normalizedInput);
  const context = parseRequestContext(normalizedInput, authority);
  if (context?.error || !hasRecognizableTopic(normalizedInput, context)) {
    return {
      ok: false,
      reason_code: "FALLBACK_REQUEST_UNUSABLE",
      source: "deterministic_fallback",
      modelUsed: false,
      deterministicCompletionUsed: false,
      outline: null
    };
  }

  const plan = ensureClosingSectionLast(buildNarrativePlan(context));
  if (!plan.length || plan.length !== context.pageCount) {
    return {
      ok: false,
      reason_code: "FALLBACK_STRUCTURE_UNRECOVERABLE",
      source: "deterministic_fallback",
      modelUsed: false,
      deterministicCompletionUsed: false,
      outline: null
    };
  }

  const visualBudget = { aiImages: 0 };
  const isolatedRuntime = {};
  let slides = plan
    .map((section, index) => generateSlide(section, index + 1, context, visualBudget, isolatedRuntime))
    .map(stripSlideInternals);
  slides = ensureActionClosingSlide(slides, context);
  slides = applyExplicitMustHave(slides, context.mustInclude, context.excludedContent);
  const rawOutline = {
    title: buildPresentationTitle(context),
    subtitle: buildSubtitle(context),
    executive_summary: buildSafeExecutiveSummary(context, slides),
    global_visual_style: buildGlobalVisualStyle(context),
    missing_materials: collectMissingMaterials(slides, context),
    production_strategy: buildFallbackProductionStrategy(context),
    slides,
    pipeline: "server-result-first"
  };
  const sanitized = enforceFinalOutputContract(rawOutline, context);

  const result = {
    ok: true,
    reason_code: "",
    source: "deterministic_fallback",
    modelUsed: false,
    deterministicCompletionUsed: true,
    outline: sanitizeFallbackOutline(adaptOutlineCandidate(sanitized))
  };
  Object.defineProperty(result, "artifacts", {
    enumerable: false,
    value: Object.freeze({ internalOutline: sanitized, context, plan, runtime: isolatedRuntime })
  });
  return result;
}

function hasRecognizableTopic(input, context) {
  const explicit = String(input?.topic || input?.requirement || "").trim();
  return Boolean(explicit && String(context?.topic || context?.requirement || "").trim());
}

function buildSafeExecutiveSummary(context, slides) {
  const bodyTitles = slides.slice(1, -1).map(slide => slide.title).filter(Boolean).slice(0, 5);
  return [
    `本脚本围绕“${context.topic}”组织，用于${context.purpose}。`,
    bodyTitles.length
      ? `内容按封面、${bodyTitles.join("、")}与行动收束页形成完整结构。`
      : "内容按封面、主体与行动收束页形成完整结构。",
    "未获用户确认的事实、数字、参数与关系均保留为待确认或建议补充资料。"
  ];
}

function normalizeFallbackInput(input = {}) {
  const delivery = input.delivery_requirements && typeof input.delivery_requirements === "object"
    ? input.delivery_requirements
    : {};
  const requirement = firstText(input.requirement, input.topic);
  const clarifying = firstText(input.follow_up_answers, input.clarifying_answers, input.clarifyingAnswers);
  const summary = firstText(input.requirements_summary, input.requirementsSummary);
  const confirmedFacts = toList(firstDefined(input.confirmed_facts, input.confirmedFacts));
  const confirmedMaterial = confirmedFacts.length
    ? `已确认事实：\n${confirmedFacts.map(item => `- ${item}`).join("\n")}`
    : "";
  const materials = [
    firstText(input.client_materials, input.materialDetails),
    confirmedMaterial,
    clarifying,
    summary
  ].filter(Boolean).join("\n");
  return {
    request_id: firstText(input.request_id, input.requestId),
    requirement,
    page_count: firstDefined(input.page_count, input.pageCount),
    purpose: firstText(input.purpose),
    detailed_purpose: firstText(input.detailed_purpose, input.detailedPurpose),
    audience: firstText(input.audience),
    style: firstText(input.style),
    scenario: firstText(input.scenario),
    deadline: firstText(input.deadline),
    client_materials: materials,
    material_categories: toList(firstDefined(input.material_categories, input.materialCategories)),
    confirmed_facts: confirmedFacts,
    has_materials: materials ? true : input.has_materials,
    must_include: toList(firstDefined(input.must_include, input.mustHave)),
    must_include_rules: Array.isArray(input.must_include_rules) ? structuredClone(input.must_include_rules) : undefined,
    must_include_rules_schema_version: input.must_include_rules_schema_version,
    excluded_content: toList(firstDefined(input.excluded_content, input.forbiddenContent)),
    emphasis: firstText(input.emphasis, input.desiredEmphasis),
    follow_up_answers: clarifying,
    include_speaker_notes: firstDefined(input.include_speaker_notes, delivery.include_speaker_notes),
    visual_preferences: input.visual_preferences,
    source_mode: input.source_mode || "fallback",
    planning_profile: input.planning_profile || "full_quality_outline"
  };
}

function ensureClosingSectionLast(plan = []) {
  if (plan.length < 2) return plan;
  const copy = plan.map(section => ({ ...section }));
  const closingIndex = copy.findIndex((section, index) => index > 0 && (
    section.role === "action"
    || section.id === "closing"
    || section.id === "cooperation_next_step"
    || section.id === "next"
  ));
  if (closingIndex >= 0 && closingIndex !== copy.length - 1) {
    const [closing] = copy.splice(closingIndex, 1);
    copy.push(closing);
  }
  copy.forEach((section, index) => {
    section.role = index === 0 ? "cover" : index === copy.length - 1 ? "action" : section.role === "action" ? "analysis" : section.role;
  });
  return copy;
}

function applyExplicitMustHave(slides = [], mustHave = [], excluded = []) {
  const requirements = toList(mustHave)
    .map(item => item.trim())
    .filter(item => item && !isExcludedRequirement(item, excluded));
  if (!requirements.length || slides.length < 2) return slides;
  const next = slides.map(slide => ({ ...slide }));
  const bodyIndexes = next.length > 2
    ? Array.from({ length: next.length - 2 }, (_, offset) => offset + 1)
    : [next.length - 1];
  requirements.forEach((requirement, offset) => {
    if (JSON.stringify(next).includes(requirement)) return;
    const index = bodyIndexes[offset % bodyIndexes.length];
    const points = visiblePoints(next[index].content);
    const statement = `• ${requirement}：按用户要求保留可编辑结构；具体事实、数据与责任主体待确认。`;
    // Never evict an evidence-backed point merely to repeat a must-have label.
    // If a page is already full, the key message carries the explicit label
    // while the original body and its traceable evidence remain intact.
    if (points.length < 5) points.push(statement);
    while (points.length < 3) points.push("• 本页信息边界与所需资料待进一步确认。");
    next[index].content = points.slice(0, 5).join("\n");
    if (!String(next[index].key_message || "").includes(requirement)) {
      next[index].key_message = `${requirement}按用户要求纳入本页，相关事实边界待确认。`;
    }
  });
  return next;
}

function ensureActionClosingSlide(slides = [], context = {}) {
  if (!slides.length) return slides;
  const next = slides.map(slide => ({ ...slide }));
  const index = next.length - 1;
  next[index] = {
    ...next[index],
    index: index + 1,
    title: "下一步确认与沟通",
    key_message: "以资料确认、责任分工和下一步沟通形成可执行的行动闭环。",
    content: [
      "• 确认本次 PPT 的使用场景、核心受众与最终目标。",
      "• 补充品牌、产品、数据、参数与合作关系等待确认资料。",
      "• 明确双方责任主体、审核节点和下一步沟通安排。",
      "• 在事实核对完成后进入设计制作与最终复核。"
    ].join("\n"),
    visual_suggestion: "采用四步行动清单或横向流程图，突出确认事项、责任主体与下一步节点。",
    slide_type: next[index].slide_type || "closing",
    role: "action",
    objective: "形成清晰、可执行且不包含未经确认承诺的下一步行动。",
    evidence_status: "framework_only",
    evidence_sources: [],
    data_requirements: ["使用场景", "资料清单", "责任主体", "审核节点"],
    speaker_notes: context.includeSpeakerNotes
      ? "说明本页只定义后续确认路径，不代表价格、周期、效果或合作关系已经确定。"
      : "未要求演讲备注。"
  };
  return next;
}

function visiblePoints(value) {
  return String(value || "").split("\n").map(line => line.trim()).filter(Boolean).map(line => line.startsWith("•") ? line : `• ${line}`);
}

function isExcludedRequirement(requirement, excluded) {
  const normalized = requirement.replace(/\s+/g, "");
  return toList(excluded).some(item => {
    const term = String(item || "").replace(/\s+/g, "");
    return term && (normalized.includes(term) || term.includes(normalized));
  });
}

function firstDefined(...values) {
  return values.find(value => value !== undefined && value !== null && String(value).trim() !== "");
}

function firstText(...values) {
  const value = firstDefined(...values);
  return typeof value === "string" ? value.trim() : "";
}

function toList(value) {
  if (Array.isArray(value)) return value.map(item => String(item || "").trim()).filter(Boolean);
  return String(value || "").split(/[\n,，;；]+/).map(item => item.trim()).filter(Boolean);
}

function buildFallbackProductionStrategy(context) {
  return {
    deadline: context.delivery?.label || "未指定",
    content_density: `${context.delivery?.maxContentPoints || 5} 条以内 / 页`,
    visual_complexity: context.delivery?.visualComplexity || "中",
    max_ai_images: Number.isFinite(context.delivery?.maxAiImages)
      ? context.delivery.maxAiImages
      : "按页面语义控制",
    manual_page_count: context.manualPageCount === true
  };
}

function sanitizeFallbackOutline(outline = {}) {
  return {
    ...outline,
    slides: (outline.slides || []).map(({ _page_id, ...slide }) => ({
      ...slide,
      slide_type: /^verificationAppendix/i.test(slide.slide_type) ? "appendix" : slide.slide_type
    }))
  };
}
