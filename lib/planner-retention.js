export function evaluatePlannerRetention(context = {}, outline = {}, runtime = null) {
  const index = runtime?.provenanceIndex;
  if (!index?.items?.length) return { content_used: false, retained_count: 0, evaluated_count: 0, items: [] };
  const bindings = new Map((context.requirementBindings || [])
    .flatMap(parent => parent.atomic_requirements || [])
    .map(item => [item.requirement_id, item]));
  const requiresBinding = bindings.size > 0;
  const items = index.items
    .filter(item => item.origin === "planner_model")
    .filter(item => ["key_message", "content"].includes(item.field))
    .map(item => evaluateItem(item, bindings, requiresBinding, outline, runtime));
  const retained = items.filter(item => item.retained);
  return {
    content_used: retained.length > 0,
    retained_count: retained.length,
    evaluated_count: items.length,
    items
  };
}

export function buildInternalDiagnostics(qualityReport = {}, runtime = null) {
  return {
    request_id: qualityReport.request_id || runtime?.requestScopeId || "",
    score: qualityReport.score,
    threshold: qualityReport.threshold,
    support_tier: qualityReport.support_tier,
    passed: qualityReport.passed,
    production_ready: qualityReport.production_ready,
    review_required: qualityReport.review_required,
    quality_status: qualityReport.quality_status,
    review_warnings: structuredClone(qualityReport.review_warnings || []),
    output_status: qualityReport.output_status,
    status_label: qualityReport.status_label,
    initial_score: qualityReport.initial_score,
    repair_rounds: qualityReport.repair_rounds,
    dimensions: structuredClone(qualityReport.dimensions || {}),
    hard_gates: structuredClone(qualityReport.hard_gates || {}),
    confirmed_fact_coverage: structuredClone(qualityReport.confirmed_fact_coverage || {}),
    confirmed_fact_diagnostics: structuredClone(qualityReport.confirmed_fact_diagnostics || []),
    risk_rule_diagnostics: structuredClone(qualityReport.risk_rule_diagnostics || []),
    required_section_diagnostics: structuredClone(qualityReport.required_section_diagnostics || []),
    must_include_rule_source: qualityReport.must_include_rule_source,
    must_include_rule_diagnostics: structuredClone(qualityReport.must_include_rule_diagnostics || []),
    must_include_rules_schema_version: qualityReport.must_include_rules_schema_version,
    must_include_source_count: qualityReport.must_include_source_count,
    must_include_source_hash: qualityReport.must_include_source_hash,
    must_include: structuredClone(qualityReport.must_include || []),
    must_include_rules: structuredClone(qualityReport.must_include_rules || []),
    industry_profile_diagnostics: structuredClone(qualityReport.industry_profile_diagnostics || {}),
    content_state: structuredClone(qualityReport.content_state || {}),
    warnings: structuredClone(qualityReport.warnings || []),
    planning_model: structuredClone(qualityReport.planning_model || {}),
    planner_retention: structuredClone(qualityReport.planner_content_retention || {}),
    requirement_fulfillment: structuredClone(qualityReport.requirement_fulfillment || {}),
    provenance: structuredClone(runtime?.provenanceIndex?.items || []),
    repair_history: structuredClone(qualityReport.repairs || [])
  };
}

function evaluateItem(item, bindings, requiresBinding, outline, runtime) {
  const binding = bindings.get(item.requirement_id);
  const slide = findSlide(outline, item.slide_id);
  const text = runtime?.provenanceText?.get(item.content_item_id) || "";
  const fieldText = String(slide?.[item.field] || "");
  const lineageReachedFinal = item.current_stage !== "dropped" && Boolean(slide) && Boolean(text) && fieldText.includes(text);
  const validSection = !binding || slide?.slide_type === binding.canonical_section_id;
  const substantive = text.length >= 6 && !isInstructionShell(text);
  const businessContent = !binding || businessContentMatches(binding.label, fieldText);
  const retained = item.origin === "planner_model"
    && (!requiresBinding || Boolean(binding))
    && validSection
    && lineageReachedFinal
    && substantive
    && businessContent;
  return {
    content_item_id: item.content_item_id,
    planner_item_id: item.planner_item_id,
    requirement_id: item.requirement_id,
    retained,
    reason: retained ? "planner_content_retained" : retentionReason({ binding, validSection, lineageReachedFinal, substantive, businessContent })
  };
}

function retentionReason({ binding, validSection, lineageReachedFinal, substantive, businessContent }) {
  if (!binding) return "requirement_binding_missing";
  if (!validSection) return "canonical_section_mismatch";
  if (!lineageReachedFinal) return "lineage_not_in_final_output";
  if (!substantive) return "not_substantive_business_content";
  if (!businessContent) return "business_constraint_not_retained";
  return "not_retained";
}

function businessContentMatches(label, text) {
  const terms = String(label || "").split(/[、，,和与及\s]+/).map(item => item.trim()).filter(item => item.length >= 2);
  return !terms.length || terms.some(term => String(text || "").includes(term));
}

function isInstructionShell(text) {
  return /^(?:汇报用途|演示目的|本方案将|本页(?:将|说明|介绍)|需要说明|将围绕|重点呈现|用于向)/.test(String(text || ""));
}

function findSlide(outline, slideId) {
  const [slideType, indexText] = String(slideId || "").split(":");
  const index = Number(indexText);
  return (outline.slides || []).find(slide => slide._pageId === slideId || slide._page_id === slideId || (slide.slide_type === slideType && slide.index === index));
}
