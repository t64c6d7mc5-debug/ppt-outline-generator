import {
  inspectPublicPayloadSafety,
  sanitizePublicPlainValue,
  sanitizePublicText
} from "./public-redaction.js";

/**
 * Build the exact public content shape used for final-output scoring.
 * `_page_id` is transient repair metadata and is removed before the API response.
 */
export function adaptOutlineCandidate(outline) {
  return {
    title: outline.title,
    subtitle: outline.subtitle,
    executive_summary: [...outline.executive_summary],
    content_state_summary: structuredClone(outline.content_state_summary || {}),
    global_visual_style: structuredClone(outline.global_visual_style),
    missing_materials: outline.missing_materials.map(item => ({
      ...structuredClone(item),
      required_for: [...item.required_for]
    })),
    production_strategy: structuredClone(outline.production_strategy),
    slides: outline.slides.map(slide => ({
      _page_id: slide._pageId,
      index: slide.index,
      title: slide.title,
      content: slide.content,
      visual_suggestion: slide.visual_suggestion,
      image_prompt: slide.image_prompt,
      slide_type: slide.slide_type,
      role: slide.role,
      objective: slide.objective,
      key_message: slide.key_message,
      evidence_status: slide.evidence_status,
      evidence_sources: (slide.evidence_sources || []).map(source => structuredClone(source)),
      data_requirements: [...slide.data_requirements],
      speaker_notes: slide.speaker_notes,
      visual_spec: structuredClone(slide.visual_spec)
    }))
  };
}

export function finalizeOutlineForApi(candidate, qualityReport) {
  return buildPublicResponse({
    candidate,
    status: {
      quality_status: String(qualityReport?.quality_status || qualityReport?.output_status || "review_required"),
      review_warnings: qualityReport?.review_warnings || []
    },
    sourceSummary: sourceSummaryFromQualityReport(qualityReport),
    qualityReport
  });
}

export function buildPublicResponse({ candidate, status = {}, sourceSummary = {}, qualityReport = {} } = {}) {
  try {
    const outline = sanitizePublicOutline(candidate || {});
    const qualityStatus = ["production_ready", "review_required", "fallback"].includes(status?.quality_status)
      ? status.quality_status
      : "review_required";
    const reviewWarnings = sanitizeReviewWarnings(status?.review_warnings);
    const normalizedSourceSummary = normalizeSourceSummary(sourceSummary, qualityStatus);
    const publicQualityReport = toPublicQualityReport({
      ...qualityReport,
      quality_status: qualityStatus,
      review_warnings: reviewWarnings,
      source_summary: normalizedSourceSummary
    });

    const response = {
      success: true,
      quality_status: qualityStatus,
      score: Number(qualityReport?.score || 0),
      production_threshold: Number(qualityReport?.threshold || 95),
      review_warnings: reviewWarnings,
      source_summary: normalizedSourceSummary,
      customer_version: renderCustomerVersion(outline),
      production_version: renderProductionVersion(outline),
      outline,
      quality_report: publicQualityReport,
      // Compatibility aliases for existing UI and API clients.
      ...outline,
      production_ready: qualityStatus === "production_ready",
      output_status: qualityStatus
    };
    return inspectPublicPayloadSafety(response).safe
      ? response
      : buildBlockedPublicResponse({ qualityReport, errorCode: "PUBLIC_RESPONSE_RESIDUAL_LEAK" });
  } catch {
    return buildBlockedPublicResponse({ qualityReport, errorCode: "PUBLIC_RESPONSE_REDACTION_FAILED" });
  }
}

export function buildBlockedPublicResponse({
  qualityReport = {},
  errorCode = "UNSAFE_PUBLIC_RESULT",
  errorSubreason = ""
} = {}) {
  let publicQualityReport;
  try {
    publicQualityReport = toPublicQualityReport({
      ...qualityReport,
      quality_status: "blocked",
      review_warnings: []
    });
  } catch {
    publicQualityReport = minimalBlockedQualityReport();
  }
  const response = {
    success: false,
    quality_status: "blocked",
    error: "系统无法生成可安全展示的 PPT 脚本",
    error_code: boundedText(errorCode, 80) || "UNSAFE_PUBLIC_RESULT",
    ...(boundedDiagnosticCode(errorSubreason) ? { error_subreason: boundedDiagnosticCode(errorSubreason) } : {}),
    quality_report: publicQualityReport
  };
  return inspectPublicPayloadSafety(response).safe ? response : {
    success: false,
    quality_status: "blocked",
    error: "系统无法生成可安全展示的 PPT 脚本",
    error_code: "PUBLIC_RESPONSE_REDACTION_FAILED",
    quality_report: minimalBlockedQualityReport()
  };
}

function boundedDiagnosticCode(value) {
  const code = String(value || "").trim().slice(0, 80);
  return /^[A-Z][A-Z0-9_]{1,79}$/.test(code) ? code : "";
}

export function toPublicQualityReport(qualityReport = {}) {
  const qualityStatus = ["production_ready", "review_required", "fallback", "blocked"].includes(qualityReport?.quality_status)
    ? qualityReport.quality_status
    : String(qualityReport?.output_status || "");
  const sourceSummary = normalizeSourceSummary(
    qualityReport?.source_summary || sourceSummaryFromQualityReport(qualityReport),
    qualityStatus
  );
  return {
    request_id: boundedText(qualityReport.request_id, 120),
    score: Number(qualityReport.score || 0),
    threshold: Number(qualityReport.threshold || 0),
    passed: qualityStatus === "production_ready",
    production_ready: qualityStatus === "production_ready",
    review_required: qualityStatus === "review_required",
    fallback: qualityStatus === "fallback",
    quality_status: qualityStatus,
    review_warnings: sanitizeReviewWarnings(qualityReport.review_warnings),
    output_status: qualityStatus,
    status_label: publicStatusLabel(qualityStatus),
    source_summary: sourceSummary,
    planning_model: {
      used: sourceSummary.model_used,
      status: sourceSummary.model_used ? "used" : qualityStatus === "fallback" ? "fallback" : "not_used",
      model_id: sourceSummary.model_id,
      content_used: sourceSummary.model_content_retained,
      fallback_used: sourceSummary.fallback_used
    }
  };
}

export function renderCustomerVersion(outline = {}) {
  const lines = [`# ${String(outline.title || "PPT 脚本").trim()}`];
  if (outline.subtitle) lines.push("", String(outline.subtitle).trim());
  if (Array.isArray(outline.executive_summary) && outline.executive_summary.length) {
    lines.push("", "## 核心摘要", ...outline.executive_summary.map(item => `- ${String(item).trim()}`));
  }
  for (const [offset, slide] of (Array.isArray(outline.slides) ? outline.slides : []).entries()) {
    lines.push("", `## ${slide.index || offset + 1}. ${String(slide.title || `第 ${offset + 1} 页`).trim()}`);
    if (slide.key_message) lines.push("", `关键结论：${String(slide.key_message).trim()}`);
    const content = normalizeVisibleContent(slide.content);
    if (content) lines.push("", content);
    if (slide.visual_suggestion) lines.push("", `视觉建议：${String(slide.visual_suggestion).trim()}`);
  }
  return lines.join("\n").trim();
}

export function renderProductionVersion(outline = {}) {
  const lines = [`# ${String(outline.title || "PPT 脚本").trim()}｜制作版`];
  if (outline.subtitle) lines.push("", String(outline.subtitle).trim());
  for (const [offset, slide] of (Array.isArray(outline.slides) ? outline.slides : []).entries()) {
    lines.push("", `## ${slide.index || offset + 1}. ${String(slide.title || `第 ${offset + 1} 页`).trim()}`);
    lines.push(`页面类型：${String(slide.slide_type || slide.role || "content").trim()}`);
    if (slide.key_message) lines.push(`关键结论：${String(slide.key_message).trim()}`);
    const content = normalizeVisibleContent(slide.content);
    if (content) lines.push("", content);
    lines.push("", `视觉建议：${String(slide.visual_suggestion || "采用与页面语义一致的清晰版式").trim()}`);
    lines.push(`演讲备注：${String(slide.speaker_notes || "按页面关键结论讲解，并核对待确认资料。").trim()}`);
  }
  return lines.join("\n").trim();
}

function sanitizePublicOutline(candidate = {}) {
  return {
    title: sanitizePublicText(candidate.title || "").trim(),
    subtitle: sanitizePublicText(candidate.subtitle || "").trim(),
    executive_summary: boundedTextList(candidate.executive_summary, 8, 500),
    content_state_summary: sanitizeContentStateSummary(candidate.content_state_summary),
    global_visual_style: sanitizePlainValue(candidate.global_visual_style),
    missing_materials: sanitizePlainValue(candidate.missing_materials || []),
    production_strategy: sanitizePlainValue(candidate.production_strategy || {}),
    slides: (Array.isArray(candidate.slides) ? candidate.slides : []).map((slide, offset) => ({
      index: Number(slide?.index || offset + 1),
      title: sanitizePublicText(slide?.title || "").trim(),
      content: sanitizePublicText(slide?.content || "").trim(),
      visual_suggestion: sanitizePublicText(slide?.visual_suggestion || "").trim(),
      image_prompt: sanitizePublicText(slide?.image_prompt || "").trim(),
      slide_type: sanitizePublicText(slide?.slide_type || "").trim(),
      role: sanitizePublicText(slide?.role || "").trim(),
      objective: sanitizePublicText(slide?.objective || "").trim(),
      key_message: sanitizePublicText(slide?.key_message || "").trim(),
      evidence_status: sanitizePublicText(slide?.evidence_status || "").trim(),
      data_requirements: boundedTextList(slide?.data_requirements, 20, 240),
      speaker_notes: sanitizePublicText(slide?.speaker_notes || "").trim(),
      visual_spec: sanitizePlainValue(slide?.visual_spec || {})
    }))
  };
}

function normalizeSourceSummary(value = {}, qualityStatus = "") {
  return Object.freeze({
    model_attempted: value?.model_attempted === true,
    model_used: value?.model_used === true,
    model_id: boundedText(value?.model_id, 120),
    model_content_retained: value?.model_content_retained === true,
    deterministic_completion_used: value?.deterministic_completion_used === true,
    fallback_used: value?.fallback_used === true || qualityStatus === "fallback"
  });
}

function sourceSummaryFromQualityReport(qualityReport = {}) {
  if (qualityReport?.source_summary && typeof qualityReport.source_summary === "object") {
    return qualityReport.source_summary;
  }
  const planner = qualityReport?.planning_model || {};
  return {
    model_attempted: planner.enabled === true || planner.used === true,
    model_used: planner.used === true,
    model_id: planner.model_id || "",
    model_content_retained: planner.content_used === true,
    deterministic_completion_used: Boolean(qualityReport?.requirement_fulfillment?.records?.length),
    fallback_used: planner.fallback_used === true || qualityReport?.quality_status === "fallback"
  };
}

function sanitizeContentStateSummary(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    confirmed: boundedTextList(source.confirmed, 6, 240),
    suggested: boundedTextList(source.suggested, 6, 240),
    needs_confirmation: boundedTextList(source.needs_confirmation, 6, 240)
  };
}

function sanitizePlainValue(value, depth = 0) {
  return sanitizePublicPlainValue(value, { maxDepth: Math.max(0, 5 - depth) });
}

function normalizeVisibleContent(value) {
  return String(value || "").split("\n").map(line => line.trim()).filter(Boolean).join("\n");
}

function buildPublicDiagnosticSummary(qualityReport = {}) {
  const planner = qualityReport.planning_model || {};
  const requiredDiagnostics = Array.isArray(qualityReport.required_section_diagnostics)
    ? qualityReport.required_section_diagnostics
    : [];
  const requiredCount = requiredDiagnostics.length || boundedCount(qualityReport.must_include);
  const coveredCount = requiredDiagnostics.filter(item => item?.covered === true).length;
  const context = qualityReport.public_diagnostic_context || {};
  const contracts = new Map((Array.isArray(context.atomic_contracts) ? context.atomic_contracts : [])
    .map(item => [String(item?.atomic_requirement_id || ""), item]));
  const phase = planner.requirement_binding_content_diagnostics?.repair
    || planner.requirement_binding_content_diagnostics?.initial
    || {};
  const failedAtomics = uniqueFailedAtomics(phase.mismatches, contracts);
  const allocationDiagnostics = planner.required_section_selection_diagnostics;

  return {
    input: {
      must_include_count: boundedCount(qualityReport.must_include),
      must_include_rule_count: boundedCount(qualityReport.must_include_rules),
      material_details_present: context.material_details_present === true,
      confirmed_fact_count: boundedNumber(context.confirmed_fact_count)
    },
    required_section_coverage: {
      required_count: requiredCount,
      covered_count: coveredCount,
      missing_count: Math.max(0, requiredCount - coveredCount)
    },
    planner_failure: {
      rejection_reason: String(planner.planning_rejection_reason || ""),
      failed_atomics: failedAtomics
    },
    fallback_result: {
      used: planner.used === true,
      fallback_used: planner.fallback_used === true,
      reason_code: String(planner.reason_code || ""),
      rejection_reason: String(planner.planning_rejection_reason || "")
    },
    ...(allocationDiagnostics && typeof allocationDiagnostics === "object"
      ? { required_section_allocation: publicRequiredSectionAllocation(allocationDiagnostics) }
      : {})
  };
}

function publicRequiredSectionAllocation(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    requested_page_count: boundedNumber(source.requested_page_count),
    normalized_page_count: boundedNumber(source.normalized_page_count),
    page_count_source: boundedText(source.page_count_source, 40),
    unique_required_section_count: boundedNumber(source.unique_required_section_count),
    fixed_section_count: boundedNumber(source.fixed_section_count),
    total_minimum_page_count: boundedNumber(source.total_minimum_page_count),
    required_canonical_sections: boundedTextList(source.required_canonical_sections, 30, 80),
    duplicate_section_count: boundedNumber(source.duplicate_section_count),
    allocation_rejection_reason: boundedText(source.allocation_rejection_reason, 80)
  };
}

function uniqueFailedAtomics(rows, contracts) {
  const seen = new Set();
  const summary = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row?.accepted === true) continue;
    const atomicId = String(row?.atomic_requirement_id || "");
    const contract = contracts.get(atomicId) || {};
    const requirementLabel = boundedText(contract.requirement_label || row?.requirement_label, 120);
    const canonicalSectionId = boundedText(contract.canonical_section_id || row?.canonical_section_id, 80);
    if (!requirementLabel || !canonicalSectionId) continue;
    const dedupeKey = `${requirementLabel}:${canonicalSectionId}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    summary.push({
      requirement_label: requirementLabel,
      canonical_section_id: canonicalSectionId,
      missing_components: boundedTextList(
        contract.missing_components?.length
          ? contract.missing_components
          : contract.required_components?.length
            ? contract.required_components
            : row?.missing_terms,
        8,
        80
      )
    });
    if (summary.length >= 12) break;
  }
  return summary;
}

function boundedCount(value) {
  return Array.isArray(value) ? value.length : 0;
}

function boundedNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function boundedTextList(values, limit, length) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(item => boundedText(item, length))
    .filter(Boolean))].slice(0, limit);
}

function boundedText(value, length) {
  return sanitizePublicText(value || "").replace(/\s+/g, " ").trim().slice(0, length);
}

function sanitizeReviewWarnings(values) {
  const safeCodes = [];
  let genericReviewNeeded = false;
  for (const value of Array.isArray(values) ? values : []) {
    const warning = String(value || "").trim();
    if (/^[a-z][a-z0-9_.:-]{0,79}$/i.test(warning)) safeCodes.push(warning);
    else if (warning) genericReviewNeeded = true;
  }
  if (genericReviewNeeded) safeCodes.push("manual_review_recommended");
  return [...new Set(safeCodes)].slice(0, 20);
}

function publicStatusLabel(qualityStatus) {
  return ({
    production_ready: "已达到生产标准",
    review_required: "建议人工复核",
    fallback: "安全兜底版本",
    blocked: "无法安全生成结果"
  })[qualityStatus] || "";
}

function minimalBlockedQualityReport() {
  return {
    request_id: "",
    score: 0,
    threshold: 0,
    passed: false,
    production_ready: false,
    review_required: false,
    fallback: false,
    quality_status: "blocked",
    review_warnings: [],
    output_status: "blocked",
    status_label: "",
    source_summary: normalizeSourceSummary({}, "blocked"),
    planning_model: {
      used: false,
      status: "not_used",
      model_id: "",
      content_used: false,
      fallback_used: false
    }
  };
}

export { inspectPublicPayloadSafety } from "./public-redaction.js";

/** Backward-compatible internal adapter entrypoint. */
export function adaptOutlineForApi(outline) {
  const candidate = adaptOutlineCandidate(outline);
  return finalizeOutlineForApi(candidate, outline.quality_report);
}
