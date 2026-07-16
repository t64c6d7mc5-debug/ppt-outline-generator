import {
  generateOutline,
  OutlineInputError,
  OutlineQualityError
} from "./generate-outline.js";
import {
  buildBlockedPublicResponse,
  buildPublicResponse,
  inspectPublicPayloadSafety
} from "./output-adapter.js";
import { buildDeterministicFallback } from "./deterministic-fallback.js";

/**
 * The sole HTTP-facing orchestration boundary. UI, API and controlled runners
 * all call this wrapper, so they cannot apply different acceptance rules.
 */
export async function runResultFirstPipeline(input = {}, options = {}) {
  const generator = options.generateOutlineFn || generateOutline;
  try {
    const response = await generator(input, options);
    // `success:false` is the authoritative unsafe-public-result marker. A
    // legacy caller may append an acceptance status after the adapter returns;
    // rebuild the minimal blocked envelope so that status cannot downgrade a
    // redaction failure back to HTTP 200.
    if (response?.success === false) {
      return {
        http_status: 422,
        response: buildBlockedPublicResponse({
          qualityReport: response.quality_report || {},
          errorCode: response.error_code || "UNSAFE_PUBLIC_RESULT"
        }),
        internalDiagnostics: options.runtime?.internalDiagnostics || null
      };
    }
    if (!inspectPublicPayloadSafety(response).safe) {
      return {
        http_status: 422,
        response: buildBlockedPublicResponse({
          qualityReport: response?.quality_report || {},
          errorCode: "PUBLIC_RESPONSE_RESIDUAL_LEAK"
        }),
        internalDiagnostics: options.runtime?.internalDiagnostics || null
      };
    }
    return {
      http_status: 200,
      response,
      internalDiagnostics: options.runtime?.internalDiagnostics || null
    };
  } catch (error) {
    if (error instanceof OutlineInputError) {
      return blockedOutcome(options, {
        request_id: input?.request_id || ""
      }, "REQUEST_UNRECOVERABLE");
    }
    return recoverFailureWithFallback(input, options, error);
  }
}

function recoverFailureWithFallback(input, options, error) {
  const priorQualityReport = error instanceof OutlineQualityError && error.qualityReport
    ? error.qualityReport
    : {};
  try {
    const fallback = buildDeterministicFallback({ input });
    if (!fallback.ok || !fallback.outline) {
      return blockedOutcome(
        options,
        withFallbackFailureReport(priorQualityReport, input),
        "SAFE_RESULT_UNAVAILABLE",
        fallback.reason_code || "FALLBACK_OUTPUT_EMPTY"
      );
    }
    const sourceSummary = fallbackSourceSummary(priorQualityReport);
    const qualityReport = {
      ...priorQualityReport,
      request_id: priorQualityReport?.request_id || input?.request_id || "",
      score: Number(priorQualityReport?.score || 0),
      threshold: Number(priorQualityReport?.threshold || 95),
      passed: false,
      production_ready: false,
      review_required: false,
      quality_status: "fallback",
      output_status: "fallback",
      source_summary: sourceSummary
    };
    const response = buildPublicResponse({
      candidate: fallback.outline,
      status: {
        quality_status: "fallback",
        review_warnings: [
          ...(Array.isArray(priorQualityReport?.review_warnings) ? priorQualityReport.review_warnings : []),
          "safe_deterministic_fallback_used"
        ]
      },
      sourceSummary,
      qualityReport
    });
    if (!isRenderableFallbackResponse(response) || !inspectPublicPayloadSafety(response).safe) {
      return blockedOutcome(
        options,
        response?.quality_report || qualityReport,
        "SAFE_RESULT_UNAVAILABLE",
        response?.success === false ? "FALLBACK_PUBLIC_RESPONSE_REJECTED" : "FALLBACK_RENDER_EMPTY"
      );
    }
    return {
      http_status: 200,
      response,
      internalDiagnostics: options.runtime?.internalDiagnostics || null
    };
  } catch {
    return blockedOutcome(
      options,
      withFallbackFailureReport(priorQualityReport, input),
      "SAFE_RESULT_UNAVAILABLE",
      "FALLBACK_BUILDER_EXCEPTION"
    );
  }
}

function fallbackSourceSummary(qualityReport = {}) {
  const source = qualityReport?.source_summary || {};
  const planner = qualityReport?.planning_model || {};
  return {
    model_attempted: source.model_attempted === true || planner.enabled === true || planner.used === true,
    model_used: false,
    model_id: String(source.model_id || planner.model_id || ""),
    model_content_retained: false,
    deterministic_completion_used: true,
    fallback_used: true
  };
}

function withFallbackFailureReport(qualityReport = {}, input = {}) {
  return {
    ...qualityReport,
    request_id: qualityReport?.request_id || input?.request_id || "",
    quality_status: "blocked",
    output_status: "blocked"
  };
}

function isRenderableFallbackResponse(response) {
  return response?.success === true
    && response?.quality_status === "fallback"
    && Array.isArray(response?.outline?.slides)
    && response.outline.slides.length > 0
    && String(response?.customer_version || "").trim().length > 0
    && String(response?.production_version || "").trim().length > 0;
}

function blockedOutcome(options, qualityReport, errorCode, errorSubreason = "") {
  return {
    http_status: 422,
    response: buildBlockedPublicResponse({ qualityReport, errorCode, errorSubreason }),
    internalDiagnostics: options.runtime?.internalDiagnostics || null
  };
}

export { OutlineInputError, OutlineQualityError };
