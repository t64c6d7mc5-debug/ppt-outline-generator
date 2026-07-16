import { createHash } from "node:crypto";
import { collectMissingMaterials } from "./evidence-state.js";
import { enforceFinalOutputContract } from "./final-output-contract.js";
import { buildNarrativePlan } from "./narrative-planner.js";
import { planWithLocalModel } from "./local-model-planner.js";
import { fulfillPlannerRequirements } from "./requirement-fulfillment.js";
import { adaptOutlineCandidate, finalizeOutlineForApi } from "./output-adapter.js";
import { repairOutline } from "./outline-repair.js";
import { scoreOutline } from "./outline-scorer.js";
import { buildRequestAuthority, parseRequestContext } from "./request-context.js";
import {
  buildPresentationTitle,
  buildSubtitle,
  generateSlide,
  stripSlideInternals
} from "./slide-generator.js";
import { buildGlobalVisualStyle } from "./visual-planner.js";
import { buildInternalDiagnostics, evaluatePlannerRetention } from "./planner-retention.js";
import { reconcileProvenanceAfterFinalization } from "./content-provenance.js";
import { resolveResultStatus } from "./result-status.js";
import { buildDeterministicFallback } from "./deterministic-fallback.js";

const PRODUCTION_THRESHOLD = 95;
const GENERIC_RETURN_FLOOR = 90;

export class OutlineInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "OutlineInputError";
  }
}

export class OutlineQualityError extends Error {
  constructor(message, qualityReport) {
    super(message);
    this.name = "OutlineQualityError";
    this.qualityReport = qualityReport;
  }
}

/**
 * The single asynchronous generation boundary for simple and professional mode.
 */
export async function generateOutline(input = {}, options = {}) {
  const initialAuthority = buildRequestAuthority(input);
  const initialContext = parseRequestContext(input, initialAuthority);
  if (initialContext.error) throw new OutlineInputError(initialContext.error);
  const runtime = options.runtime || {};
  runtime.requestScopeId ||= initialContext.requestScopeId;

  const planner = options.planWithLocalModelFn || planWithLocalModel;
  let rawPlanningResult;
  try {
    rawPlanningResult = await planner(input, initialContext, options.localModelOptions || {});
  } catch {
    rawPlanningResult = {
      analysis: null,
      metadata: {
        enabled: true,
        used: false,
        status: "fallback",
        model_id: "",
        reason_code: "LOCAL_MODEL_UNAVAILABLE",
        content_used: false,
        repair_attempted: false,
        repaired: false,
        fallback_used: true
      }
    };
  }
  const planningResult = applyRequirementFulfillment(rawPlanningResult, initialContext);
  runtime.requirementFulfillment = planningResult.fulfillment
    ? {
      records: structuredClone(planningResult.fulfillment.records || []),
      diagnostics: structuredClone(planningResult.fulfillment.diagnostics || {})
    }
    : null;
  let requestAuthority = planningResult.analysis
    ? buildRequestAuthority(input, planningResult.analysis)
    : initialAuthority;
  let context = planningResult.analysis
    ? parseRequestContext(input, requestAuthority, planningResult.analysis)
    : initialContext;
  if (context.error) throw new OutlineInputError(context.error);
  context.requirementFulfillmentRecords = planningResult.fulfillment?.records || [];

  let selectedSource = planningResult.analysis ? "model" : "deterministic_fallback";
  let plan;
  let outline;
  if (selectedSource === "deterministic_fallback") {
    const fallback = buildDeterministicFallback({ input });
    if (!fallback.ok || !fallback.artifacts?.internalOutline) {
      throw new OutlineQualityError("系统无法生成可安全展示的 PPT 脚本", {
        request_id: initialContext.requestId || "",
        score: 0,
        threshold: PRODUCTION_THRESHOLD,
        quality_status: "blocked",
        review_warnings: [],
        source_summary: {
          model_attempted: rawPlanningResult?.metadata?.enabled === true,
          model_used: false,
          model_id: String(rawPlanningResult?.metadata?.model_id || ""),
          model_content_retained: false,
          deterministic_completion_used: false,
          fallback_used: false
        }
      });
    }
    context = fallback.artifacts.context;
    requestAuthority = context.requestAuthority;
    plan = fallback.artifacts.plan;
    outline = fallback.artifacts.internalOutline;
  } else {
    plan = buildNarrativePlan(context);
    const visualBudget = { aiImages: 0 };
    const internalSlides = plan.map((section, offset) => generateSlide(section, offset + 1, context, visualBudget, runtime));
    const slides = internalSlides.map(stripSlideInternals);
    const title = buildPresentationTitle(context);
    const subtitle = buildSubtitle(context);
    outline = {
      title,
      subtitle,
      executive_summary: buildExecutiveSummary(slides, context),
      global_visual_style: buildGlobalVisualStyle(context),
      missing_materials: collectMissingMaterials(slides, context),
      production_strategy: buildProductionStrategy(context),
      slides,
      pipeline: "server-result-first"
    };
    const preContractOutline = outline;
    outline = enforceFinalOutputContract(outline, context);
    reconcileProvenanceAfterFinalization(runtime, preContractOutline, outline);
  }
  let candidate = adaptOutlineCandidate(outline);
  const initialReport = scoreFinalCandidate(candidate, outline, context, plan, requestAuthority, runtime);
  let currentReport = initialReport;
  const repairHistory = [];
  const target = context.supportTier === "production" ? PRODUCTION_THRESHOLD : GENERIC_RETURN_FLOOR;

  // Deterministic repair is part of the shared safety/structure pipeline for
  // both model and fallback candidates. It does not call the local model and
  // therefore cannot create retry loops or misrepresent fallback provenance.
  for (let round = 1; round <= 2 && needsRepair(currentReport, target); round += 1) {
    const beforeReport = currentReport;
    const beforeHash = canonicalOutlineHash(outline);
    const beforeFailedGates = failedGateNames(beforeReport);
    const repaired = repairOutline(outline, context, currentReport, runtime);
    const nextOutline = enforceFinalOutputContract(repaired.outline, context);
    const nextCandidate = adaptOutlineCandidate(nextOutline);
    const nextReport = scoreFinalCandidate(nextCandidate, nextOutline, context, plan, requestAuthority, runtime);
    const afterHash = canonicalOutlineHash(nextOutline);
    const afterFailedGates = failedGateNames(nextReport);
    const changed = beforeHash !== afterHash;
    const improved = nextReport.score > beforeReport.score || afterFailedGates.length < beforeFailedGates.length;
    repairHistory.push({
      round,
      attempted: true,
      changed,
      improved,
      before_score: beforeReport.score,
      after_score: nextReport.score,
      before_failed_gates: beforeFailedGates,
      after_failed_gates: afterFailedGates,
      before_hash: beforeHash,
      after_hash: afterHash,
      changes: repaired.actions,
      candidate_failed_gate_details: failedGateDetails(nextReport),
      candidate_risk_rule_diagnostics: nextReport.risk_rule_diagnostics || [],
      candidate_required_section_diagnostics: nextReport.required_section_diagnostics || [],
      candidate_confirmed_fact_coverage: nextReport.confirmed_fact_coverage,
      candidate_confirmed_fact_diagnostics: nextReport.confirmed_fact_diagnostics || [],
      rejection_reason: improved ? "" : changed ? "candidate_did_not_improve_quality" : "candidate_unchanged"
    });
    if (!changed || !improved) break;
    outline = nextOutline;
    candidate = nextCandidate;
    currentReport = nextReport;
  }

  let planningMetadata = enrichPlanningMetadata(planningResult.metadata, context, outline, runtime);
  selectedSource = selectedSource === "model" && planningMetadata.fallback_used !== true
    ? "model"
    : "deterministic_fallback";
  let acceptance = resolveReleaseAcceptance({
    score: currentReport.score,
    hardGates: currentReport.hard_gates,
    requiredSectionDiagnostics: currentReport.required_section_diagnostics,
    candidateAvailable: true,
    fallbackAvailable: selectedSource === "deterministic_fallback",
    selectedSource,
    modelAttempt: planningMetadata
  });
  if (acceptance.quality_status === "blocked" && selectedSource === "model") {
    const fallback = buildDeterministicFallback({ input });
    if (fallback.ok && fallback.artifacts?.internalOutline) {
      context = fallback.artifacts.context;
      requestAuthority = context.requestAuthority;
      plan = fallback.artifacts.plan;
      outline = fallback.artifacts.internalOutline;
      candidate = adaptOutlineCandidate(outline);
      currentReport = scoreFinalCandidate(candidate, outline, context, plan, requestAuthority, runtime);
      selectedSource = "deterministic_fallback";
      planningMetadata = {
        ...planningMetadata,
        status: "fallback",
        content_used: false,
        fallback_used: true,
        fallback_reason: "MODEL_CANDIDATE_NOT_SAFE_FOR_FINAL_OUTPUT"
      };
      acceptance = resolveReleaseAcceptance({
        score: currentReport.score,
        hardGates: currentReport.hard_gates,
        requiredSectionDiagnostics: currentReport.required_section_diagnostics,
        candidateAvailable: true,
        fallbackAvailable: true,
        selectedSource,
        modelAttempt: planningMetadata
      });
    }
  }
  const productionPassed = acceptance.quality_status === "production_ready";
  const outputStatus = acceptance.quality_status;
  const contentState = buildContentState(
    input,
    context,
    outline,
    selectedSource === "model" ? planningResult : { ...planningResult, analysis: null }
  );
  outline.content_state_summary = buildContentStateSummary(contentState);
  candidate = adaptOutlineCandidate(outline);

  const sourceSummary = {
    model_attempted: planningMetadata.enabled === true || planningMetadata.used === true,
    model_used: selectedSource === "model" && planningMetadata.used === true,
    model_id: String(planningMetadata.model_id || ""),
    model_content_retained: selectedSource === "model" && planningMetadata.content_used === true,
    deterministic_completion_used: selectedSource === "deterministic_fallback"
      || Boolean(planningResult.fulfillment?.records?.length)
      || planningMetadata.model_output_page_count_mismatch === true
      || Boolean(planningMetadata.requirement_completion_warning)
      || (planningMetadata.used === true && planningMetadata.content_used !== true),
    fallback_used: selectedSource === "deterministic_fallback"
  };
  const qualityReport = {
    request_id: context.requestId || "",
    score: currentReport.score,
    threshold: PRODUCTION_THRESHOLD,
    support_tier: context.supportTier,
    passed: productionPassed,
    production_ready: productionPassed,
    review_required: acceptance.quality_status === "review_required",
    quality_status: acceptance.quality_status,
    review_warnings: acceptance.review_warnings,
    output_status: outputStatus,
    status_label: resolveQualityStatusLabel({
      score: currentReport.score,
      threshold: PRODUCTION_THRESHOLD,
      productionPassed,
      hardGatesPassed: acceptance.blocking_gates.length === 0,
      supportTier: context.supportTier,
      qualityStatus: acceptance.quality_status
    }),
    initial_score: initialReport.score,
    repair_rounds: repairHistory.length,
    dimensions: currentReport.dimensions,
    hard_gates: currentReport.hard_gates,
    confirmed_fact_coverage: currentReport.confirmed_fact_coverage,
    confirmed_fact_diagnostics: currentReport.confirmed_fact_diagnostics,
    risk_rule_diagnostics: currentReport.risk_rule_diagnostics,
    required_section_diagnostics: currentReport.required_section_diagnostics,
    must_include_rule_source: context.mustIncludeRuleSource,
    must_include_rule_diagnostics: context.mustIncludeRuleDiagnostics || [],
    must_include_rules_schema_version: context.mustIncludeRulesSchemaVersion,
    must_include_source_count: context.mustIncludeSourceCount,
    must_include_source_hash: context.mustIncludeSourceHash,
    must_include: context.mustInclude,
    must_include_rules: context.mustIncludeRules || [],
    public_diagnostic_context: buildPublicDiagnosticContext(context),
    industry_profile_diagnostics: context.industryDiagnostics,
    planner_content_retention: evaluatePlannerRetention(context, outline, runtime),
    requirement_fulfillment: structuredClone(runtime.requirementFulfillment || {}),
    content_state: contentState,
    repairs: repairHistory,
    warnings: buildQualityWarnings(currentReport.warnings, planningMetadata),
    planning_model: structuredClone(planningMetadata),
    source_summary: sourceSummary
  };
  runtime.internalDiagnostics = buildInternalDiagnostics(qualityReport, runtime);

  if (acceptance.quality_status === "blocked") {
    throw new OutlineQualityError("生成结果未通过生产安全门槛", qualityReport);
  }

  const final = finalizeOutlineForApi(candidate, qualityReport);
  if (final?.success === false) {
    throw new OutlineQualityError("系统无法生成可安全展示的 PPT 脚本", {
      ...qualityReport,
      quality_status: "blocked",
      output_status: "blocked"
    });
  }
  return {
    ...final,
    output_status: outputStatus,
    quality_status: acceptance.quality_status,
    production_ready: productionPassed
  };
}

function buildPublicDiagnosticContext(context = {}) {
  return {
    material_details_present: Boolean(String(context.clientMaterials || "").trim()),
    confirmed_fact_count: Array.isArray(context.confirmedFacts) ? context.confirmedFacts.length : 0,
    atomic_contracts: (context.requirementBindings || []).flatMap(parent => (parent.atomic_requirements || []).map(atomic => ({
      atomic_requirement_id: String(atomic.requirement_id || ""),
      requirement_label: String(atomic.label || "").slice(0, 120),
      canonical_section_id: String(atomic.canonical_section_id || "").slice(0, 80),
      required_components: Array.isArray(atomic.semantic_contract?.required_components)
        ? atomic.semantic_contract.required_components.map(item => String(item || "").slice(0, 80)).filter(Boolean)
        : [],
      missing_components: missingSemanticContractComponents(atomic.semantic_contract)
    })))
  };
}

function missingSemanticContractComponents(contract = {}) {
  const values = contract?.component_values && typeof contract.component_values === "object"
    ? contract.component_values
    : {};
  return (Array.isArray(contract?.required_components) ? contract.required_components : [])
    .map(item => String(item || "").trim())
    .filter(Boolean)
    .filter(component => {
      const value = values[component];
      return Array.isArray(value)
        ? !value.some(item => String(item || "").trim())
        : !String(value || "").trim();
    });
}

export function applyRequirementFulfillment(planningResult = {}, context = {}) {
  const candidateAnalysis = planningResult.analysis || planningResult.fulfillment_candidate;
  if (!candidateAnalysis) {
    return { ...planningResult, fulfillment: null };
  }
  const completionInput = attachRequestSideRequirementBindings(
    candidateAnalysis,
    context.requirementBindings || []
  );
  const fulfillment = fulfillPlannerRequirements({
    analysis: completionInput,
    requirementBindings: context.requirementBindings || [],
    confirmedFacts: context.confirmedFacts || [],
    delivery: context.delivery || {},
    requestScopeId: context.requestScopeId || "request"
  });
  const metadata = { ...(planningResult.metadata || {}) };
  metadata.requirement_fulfillment_applied = fulfillment.records.length > 0;
  metadata.requirement_fulfillment_residual_count = fulfillment.diagnostics.post_residual_count;
  if (fulfillment.validation.valid) {
    metadata.status = "used";
    metadata.fallback_used = false;
    delete metadata.planning_rejection_reason;
    delete metadata.fallback_reason;
    return {
      ...planningResult,
      analysis: fulfillment.analysis,
      metadata,
      fulfillment
    };
  }
  metadata.fallback_used = false;
  metadata.requirement_fulfillment_applied = fulfillment.records.length > 0;
  metadata.requirement_completion_warning = fulfillment.diagnostics.unresolved[0]?.reason_code
    || fulfillment.validation.reason
    || "REQUIREMENT_FULFILLMENT_UNRESOLVED";
  return {
    ...planningResult,
    analysis: fulfillment.analysis || structuredClone(candidateAnalysis),
    candidate_analysis: structuredClone(candidateAnalysis),
    metadata,
    fulfillment
  };
}

function attachRequestSideRequirementBindings(analysis, requirementBindings) {
  const cloned = structuredClone(analysis || {});
  cloned.requirement_bindings = (Array.isArray(requirementBindings) ? requirementBindings : []).map(parent => ({
    requirement_id: parent.requirement_id,
    atomic_requirements: (parent.atomic_requirements || []).map(atomic => ({
      requirement_id: atomic.requirement_id,
      canonical_section_id: atomic.canonical_section_id
    }))
  }));
  return cloned;
}

export function enrichPlanningMetadata(metadata, context, outline, runtime = null) {
  const cloned = structuredClone(metadata || {});
  const text = [
    outline.title,
    outline.subtitle,
    ...(outline.slides || []).flatMap(slide => [slide.title, slide.key_message, slide.content, slide.visual_suggestion])
  ].join("\n");
  const modelItems = Object.values(context.planningSectionIntents || {})
    .flatMap(intent => [intent.key_message, ...(intent.bullets || []), intent.visual_direction])
    .map(item => String(item || "").trim())
    .filter(Boolean);
  const retention = runtime ? evaluatePlannerRetention(context, outline, runtime) : null;
  if (cloned.planner_response_structure_diagnostics) {
    const plannerItems = (runtime?.provenanceIndex?.items || []).filter(item => item.origin === "planner_model");
    const stageCount = stage => plannerItems.filter(item => item.current_stage === stage).length;
    cloned.planner_response_structure_diagnostics = {
      ...cloned.planner_response_structure_diagnostics,
      planning_section_intents_generated: Object.keys(context.planningSectionIntents || {}).length > 0,
      planning_section_intent_count: Object.keys(context.planningSectionIntents || {}).length,
      planner_item_id_count: plannerItems.filter(item => item.planner_item_id).length,
      generated_item_count: stageCount("generated"),
      transformed_item_count: stageCount("sanitized"),
      final_item_count: stageCount("final"),
      dropped_item_count: stageCount("dropped"),
      drop_reason_counts: summarizePlannerDropReasons(plannerItems)
    };
  }
  const retained = retention ? retention.retained_count : modelItems.filter(item => item.length >= 6 && modelItemRetainedOrSafelyPending(item, text)).length;
  cloned.content_used = retention ? retention.content_used : modelItems.length ? retained > 0 : false;
  cloned.planner_content_retention = retention || { retained_count: retained, evaluated_count: modelItems.length };
  cloned.fallback_used = Boolean(cloned.fallback_used || !context.planningAnalysis);
  if (cloned.fallback_used && !cloned.fallback_reason) {
    cloned.fallback_reason = cloned.reason_code || (!context.planningAnalysis ? "MODEL_PLAN_NOT_AVAILABLE" : "MODEL_CONTENT_NOT_RETAINED");
  }
  if (cloned.used === true && !context.planningAnalysis && !cloned.planning_rejection_reason) {
    cloned.planning_rejection_reason = cloned.repair_attempted
      ? "MODEL_PLAN_REPAIR_NOT_ACCEPTED"
      : "MODEL_PLAN_NOT_ACCEPTED";
  }
  return cloned;
}

function summarizePlannerDropReasons(items) {
  return items.reduce((counts, item) => {
    if (!item.drop_reason) return counts;
    counts[item.drop_reason] = (counts[item.drop_reason] || 0) + 1;
    return counts;
  }, {});
}

function canonicalOutlineHash(outline) {
  return createHash("sha256").update(JSON.stringify(canonicalize(outline))).digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
}

function failedGateNames(report) {
  return Object.entries(report?.hard_gates || {})
    .filter(([, gate]) => gate && gate.passed === false)
    .map(([name]) => name)
    .sort();
}

function failedGateDetails(report) {
  return Object.entries(report?.hard_gates || {})
    .filter(([, gate]) => gate && gate.passed === false)
    .map(([gate_id, gate]) => ({
      gate_id,
      reason: gate.reason || "",
      issue_codes: gate.issue_codes || [],
      code: gate.code || ""
    }));
}

function modelItemRetainedOrSafelyPending(item, text) {
  if (text.includes(item)) return true;
  if (!text.includes("待品牌方确认")) return false;
  return /(?:销量|市场份额|续航|门店数量|网点数量|L\d|高压快充|质保|保修|道路救援|独家代理|区域保护|返利|开业营销|建店|海外布局|智能驾驶系统|\d{4}年|\d+(?:\.\d+)?(?:V|公里|年|小时|级|万公里)|[一二三四五六七八九十两]+(?:年|步|阶段))/.test(item);
}

function buildQualityWarnings(warnings, planningMetadata) {
  const items = [...(warnings || [])];
  if (planningMetadata?.status === "fallback") {
    items.push("本地规划模型不可用，已使用现有规则安全生成");
  }
  return [...new Set(items)];
}

export { buildPresentationTitle } from "./slide-generator.js";

export function resolveQualityStatusLabel({ score, threshold = PRODUCTION_THRESHOLD, productionPassed, hardGatesPassed, supportTier, qualityStatus }) {
  if (productionPassed) return "生产级质量检查通过";
  if (qualityStatus === "review_required") return "质量达到可复核标准，请人工复核后使用";
  if (qualityStatus === "blocked") return "未达到安全发布条件，已阻止输出";
  if (supportTier === "generic") return "通用框架，建议人工复核";
  if (score < threshold) return "未达到生产阈值，需人工复核";
  if (!hardGatesPassed) return "总分达到生产阈值，但存在未通过的硬性检查，需人工复核";
  return "未达到生产级通过条件，需人工复核";
}

const SAFETY_BLOCKING_GATES = new Set([
  "evidence_safety",
  "no_fabrication",
  "evidence_traceability",
  "public_secret_leak",
  "forbidden_content"
]);

const STRUCTURE_BLOCKING_GATES = new Set([
  "api_contract",
  "final_output_integrity",
  "content_layering",
  "semantic_page_count",
  "manual_page_count"
]);

/**
 * Classifies the existing scorer output for the public release policy without
 * changing scorer, validator, threshold, or individual gate semantics.
 */
export function resolveReleaseAcceptance({
  score,
  hardGates = {},
  requiredSectionDiagnostics = [],
  candidateAvailable = true,
  fallbackAvailable = false,
  selectedSource = "model",
  modelAttempt = {}
} = {}) {
  const failedGateIds = Object.entries(hardGates)
    .filter(([, gate]) => gate?.passed === false)
    .map(([gateId]) => gateId);
  const qualityFailures = [];
  const safetyFailures = [];
  const structureFailures = [];

  for (const gateId of failedGateIds) {
    if (gateId === "confirmed_fact_coverage") {
      qualityFailures.push(gateId);
      continue;
    }
    if (SAFETY_BLOCKING_GATES.has(gateId)) {
      safetyFailures.push(gateId);
      continue;
    }
    if (STRUCTURE_BLOCKING_GATES.has(gateId)) {
      structureFailures.push(gateId);
      continue;
    }
    qualityFailures.push(gateId);
  }

  const result = resolveResultStatus({
    candidateAvailable,
    fallbackAvailable,
    selectedSource,
    score,
    productionThreshold: PRODUCTION_THRESHOLD,
    qualityFailures: [...qualityFailures].sort(),
    safetyFailures: [...safetyFailures].sort(),
    structureFailures: [...structureFailures].sort(),
    modelAttempt
  });
  return {
    quality_status: result.quality_status,
    http_status: result.http_status,
    review_warnings: result.review_warnings,
    blocking_gates: result.blocking_reasons
  };
}

function buildExecutiveSummary(slides, context) {
  if (context?.sourceMode === "simple" && !(context.confirmedFacts || []).length) {
    const structure = slides.slice(1, 6).map(slide => slide.title).filter(Boolean).join("、");
    const missing = [...new Set(slides.flatMap(slide => slide.data_requirements || []))].slice(0, 4).join("、");
    return [
      `本草案围绕“${context.topic}”展开，用于${context.purpose}，当前不等同于生产级定稿。`,
      structure ? `系统建议先按${structure}组织内容，形成可编辑的页面骨架。` : "系统建议先搭建主题、结构、页面顺序和表达方向，形成可编辑的页面骨架。",
      missing ? `生产级输出前建议补充${missing}等关键资料。` : "生产级输出前建议补充项目事实、数据口径、案例素材和审核结论。"
    ];
  }
  if (context?.type?.id === "project_plan") {
    const anchors = context.materialAnchors || [];
    const byCategory = category => anchors.find(anchor => anchor.categories.includes(category));
    const identity = byCategory("identity");
    const location = byCategory("location");
    const space = byCategory("space");
    const industry = byCategory("industry");
    const facility = byCategory("facility");
    const service = byCategory("service");
    const timeline = byCategory("timeline");
    const summary = [
      [identity, location, space].filter(Boolean).length
        ? `项目基础：${[identity?.value, location?.value, space?.value].filter(Boolean).join("，")}。`
        : "",
      [industry, facility, service].filter(Boolean).length
        ? `推介重点：围绕${[industry?.value, facility?.value, service?.value].filter(Boolean).join("、")}组织招商叙事。`
        : "",
      timeline
        ? `下一步行动：以${timeline.value}为时间锚点，推进资料包、目标企业沟通和入驻合作确认。`
        : "下一步行动：围绕目标企业沟通、资料补充和入驻合作确认推进。"
    ].filter(Boolean);
    if (summary.length >= 2) return summary.slice(0, 3);
  }
  const candidates = slides
    .filter(slide => ["analysis", "insight", "recommendation", "action"].includes(slide.role))
    .map(slide => slide.key_message);
  return [...new Set(candidates)].slice(0, 3);
}

function buildProductionStrategy(context) {
  return {
    deadline: context.delivery.label,
    content_density: `${context.delivery.maxContentPoints} 条以内 / 页`,
    visual_complexity: context.delivery.visualComplexity,
    max_ai_images: Number.isFinite(context.delivery.maxAiImages) ? context.delivery.maxAiImages : "按页面语义控制",
    manual_page_count: context.manualPageCount
  };
}

function needsRepair(report, target) {
  return report.score < target || Object.values(report.hard_gates).some(gate => !gate.passed);
}

function scoreFinalCandidate(candidate, sourceOutline, context, plan, requestAuthority, runtime) {
  return scoreOutline(candidate, context, plan, {
    pipeline: sourceOutline.pipeline,
    sourceOutline,
    requestAuthority,
    runtime
  });
}

export { cleanInstructionShellTitle } from "./final-output-contract.js";

function buildContentState(input, context, outline, planningResult) {
  const tracker = createContentStateTracker();
  addStateItem(tracker, "confirmed", { key: "requirement", label: "用户需求", value: context.requirement, source: "explicit_field" });
  if (input.page_count !== undefined && input.page_count !== null && String(input.page_count).trim()) {
    addStateItem(tracker, "confirmed", { key: "page_count", label: "页数", value: `${context.pageCount}页`, source: "explicit_field" });
  } else if (/(?:\d{1,2}|十二|十|八|六)\s*页/.test(context.requirement)) {
    addStateItem(tracker, "confirmed", { key: "page_count", label: "页数", value: `${context.pageCount}页`, source: "requirement_phrase" });
  }
  if (normalizeStateValue(input.audience)) {
    addStateItem(tracker, "confirmed", { key: "audience", label: "受众", value: context.audience, source: "explicit_field" });
  } else if (["requirement_phrase", "material_phrase"].includes(context.audienceSource)) {
    addStateItem(tracker, "confirmed", { key: "audience", label: "受众", value: context.audience, source: context.audienceSource });
  }
  if (normalizeStateValue(input.detailed_purpose) || normalizeStateValue(input.purpose)) {
    addStateItem(tracker, "confirmed", { key: "purpose", label: "用途", value: context.purpose, source: "explicit_field" });
  } else if (/用于|面向|给|供/.test(context.requirement)) {
    addStateItem(tracker, "confirmed", { key: "purpose", label: "用途", value: context.purpose, source: "requirement_phrase" });
  }
  if (normalizeStateValue(input.scenario)) {
    addStateItem(tracker, "confirmed", { key: "scenario", label: "场景", value: context.scenario, source: "explicit_field" });
  }
  if (normalizeStateValue(input.style) && !["auto", "自动判断"].includes(normalizeStateValue(input.style))) {
    addStateItem(tracker, "confirmed", { key: "style", label: "风格", value: context.style, source: "explicit_field" });
  }
  for (const fragment of context.materialContext.confirmed_facts || []) {
    addStateItem(tracker, "confirmed", {
      key: `fact:${fragment.fragment_id}`,
      label: "用户确认事实",
      value: fragment.excerpt,
      source: fragment.assertion_type || "explicit_confirmed_fact",
      source_id: fragment.source_id
    });
  }

  const analysis = planningResult.analysis || null;
  if (analysis) {
    if (!hasStateKey(tracker, "audience")) addStateItem(tracker, "suggested", { key: "audience", label: "受众", value: analysis.audience, source: "local_model" });
    if (!hasStateKey(tracker, "purpose")) addStateItem(tracker, "suggested", { key: "purpose", label: "用途", value: analysis.purpose, source: "local_model" });
    if (!hasStateKey(tracker, "scenario")) addStateItem(tracker, "suggested", { key: "scenario", label: "场景", value: analysis.business_scenario, source: "local_model" });
    if (!hasStateKey(tracker, "page_count") && Number.isInteger(analysis.recommended_page_count)) {
      addStateItem(tracker, "suggested", { key: "page_count", label: "推荐页数", value: `${analysis.recommended_page_count}页`, source: "local_model" });
    }
    if (Array.isArray(analysis.sections) && analysis.sections.length) {
      addStateItem(tracker, "suggested", {
        key: "structure",
        label: "内容结构",
        value: analysis.sections.map(section => section.title || section.section_id).filter(Boolean).join("、"),
        source: "local_model"
      });
    }
  }
  if (!hasStateKey(tracker, "style")) addStateItem(tracker, "suggested", { key: "style", label: "表达风格", value: context.style, source: "system_inference" });
  if (!hasStateKey(tracker, "page_count")) addStateItem(tracker, "suggested", { key: "page_count", label: "推荐页数", value: `${context.pageCount}页`, source: "system_inference" });

  for (const item of missingConfirmationItems(context, outline)) addStateItem(tracker, "needs_confirmation", item);
  return freezeContentState(tracker);
}

function createContentStateTracker() {
  return { confirmed: [], suggested: [], needs_confirmation: [], keys: new Set() };
}

function addStateItem(tracker, bucket, item) {
  const key = item?.key || `${item?.label}:${item?.value}`;
  const value = normalizeStateValue(item?.value);
  if (!key || !value || tracker.keys.has(key)) return;
  tracker.keys.add(key);
  tracker[bucket].push(Object.freeze({
    key,
    label: item.label,
    value,
    source: item.source,
    ...(item.source_id ? { source_id: item.source_id } : {})
  }));
}

function hasStateKey(tracker, key) {
  return tracker.keys.has(key);
}

function freezeContentState(tracker) {
  return Object.freeze({
    confirmed: Object.freeze([...tracker.confirmed]),
    suggested: Object.freeze([...tracker.suggested]),
    needs_confirmation: Object.freeze([...tracker.needs_confirmation])
  });
}

function buildContentStateSummary(contentState) {
  const summarize = items => items.slice(0, 6).map(item => `${item.label}：${item.value}`);
  return {
    confirmed: summarize(contentState.confirmed),
    suggested: summarize(contentState.suggested),
    needs_confirmation: summarize(contentState.needs_confirmation)
  };
}

function missingConfirmationItems(context, outline) {
  const items = [];
  const anchors = context.materialAnchors || [];
  const hasCategory = category => anchors.some(anchor => anchor.categories.includes(category));
  if (context.type.id === "project_plan") {
    [
      ["location", "项目地点", "地点或区位资料"],
      ["space", "项目面积/载体", "面积、空间或载体条件"],
      ["industry", "产业方向", "主导产业或招商方向"],
      ["facility", "园区设施", "研发、生产、展示或办公设施"],
      ["service", "服务能力", "政策、人才、供应链或运营服务"],
      ["target", "目标企业", "目标企业类型或招商对象"]
    ].forEach(([category, label, value]) => {
      if (!hasCategory(category)) items.push({ key: `missing:${category}`, label, value, source: "missing_confirmed_fact" });
    });
  }
  for (const material of outline.missing_materials || []) {
    addUniqueMissing(items, {
      key: `missing_material:${material.label}`,
      label: "资料缺口",
      value: material.label,
      source: material.source || "missing_materials"
    });
  }
  for (const gap of context.materialContext.explicit_gaps || []) {
    addUniqueMissing(items, {
      key: `explicit_gap:${gap.source_id}`,
      label: "用户待补资料",
      value: gap.excerpt.replace(/^(?:资料缺口|待补充资料)\s*[：:]\s*/, "").trim(),
      source: "client_explicit_gap",
      source_id: gap.source_id
    });
  }
  return items;
}

function addUniqueMissing(items, item) {
  if (!normalizeStateValue(item.value) || items.some(existing => existing.key === item.key || existing.value === item.value)) return;
  items.push(item);
}

function normalizeStateValue(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
