export const RESULT_STATUS = Object.freeze({
  PRODUCTION_READY: "production_ready",
  REVIEW_REQUIRED: "review_required",
  FALLBACK: "fallback",
  BLOCKED: "blocked"
});

const FALLBACK_SOURCES = new Set(["fallback", "deterministic_fallback", "safe_deterministic_fallback"]);

/**
 * Resolve the public delivery status after a candidate has already been built,
 * repaired, sanitized and validated. Quality diagnostics never become release
 * blockers here; only risks that remain on the selected public candidate do.
 */
export function resolveResultStatus({
  candidateAvailable = false,
  fallbackAvailable = false,
  selectedSource = "none",
  score = 0,
  productionThreshold = 95,
  qualityFailures = [],
  safetyFailures = [],
  structureFailures = [],
  modelAttempt = {}
} = {}) {
  const warnings = uniqueSafeCodes(qualityFailures);
  const blockingReasons = uniqueSafeCodes([...safetyFailures, ...structureFailures]);
  const hasDisplayableCandidate = candidateAvailable || fallbackAvailable;

  if (!hasDisplayableCandidate && !blockingReasons.length) {
    blockingReasons.push("no_safe_displayable_candidate");
  }

  if (blockingReasons.length) {
    return {
      quality_status: RESULT_STATUS.BLOCKED,
      http_status: 422,
      review_warnings: warnings,
      blocking_reasons: blockingReasons
    };
  }

  const fallbackSelected = FALLBACK_SOURCES.has(String(selectedSource || "").toLowerCase())
    || (!candidateAvailable && fallbackAvailable);
  appendModelWarnings(warnings, modelAttempt);

  if (fallbackSelected) {
    appendUnique(warnings, "safe_deterministic_fallback_used");
    return {
      quality_status: RESULT_STATUS.FALLBACK,
      http_status: 200,
      review_warnings: warnings,
      blocking_reasons: []
    };
  }

  if (Number(score) < Number(productionThreshold)) {
    appendUnique(warnings, "quality_below_production_threshold");
  }

  return {
    quality_status: warnings.length
      ? RESULT_STATUS.REVIEW_REQUIRED
      : RESULT_STATUS.PRODUCTION_READY,
    http_status: 200,
    review_warnings: warnings,
    blocking_reasons: []
  };
}

function appendModelWarnings(warnings, modelAttempt = {}) {
  const attempted = modelAttempt?.attempted === true || modelAttempt?.enabled === true;
  const used = modelAttempt?.used === true;
  const status = String(modelAttempt?.status || "").toLowerCase();

  if (attempted && !used && ["disabled", "failed", "timeout", "unavailable", "error"].includes(status)) {
    appendUnique(warnings, "local_model_unavailable");
  }
  if (used && modelAttempt?.content_used === false) {
    appendUnique(warnings, "model_content_not_retained");
  }
  if (status === "rejected") {
    appendUnique(warnings, "planner_rejected");
  }
  if (modelAttempt?.model_output_page_count_mismatch === true) {
    appendUnique(warnings, "model_output_page_count_mismatch");
  }
  const completionWarning = normalizeDiagnosticCode(modelAttempt?.requirement_completion_warning).toLowerCase();
  if (/^requirement_[a-z0-9_]+$/.test(completionWarning)) {
    appendUnique(warnings, completionWarning);
  }
}

function uniqueSafeCodes(values) {
  const result = [];
  for (const value of Array.isArray(values) ? values : []) {
    const code = normalizeDiagnosticCode(value);
    if (code) appendUnique(result, code);
  }
  return result;
}

function normalizeDiagnosticCode(value) {
  const code = String(value || "").trim();
  return /^[a-z][a-z0-9_]{1,79}$/i.test(code) ? code : "";
}

function appendUnique(items, value) {
  if (value && !items.includes(value)) items.push(value);
}
