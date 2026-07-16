import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");

test("UI copy actions use the two server-rendered script versions when available", () => {
  const resultState = source.slice(source.indexOf("function buildResultState"), source.indexOf("function emptyResultState"));
  assert.match(resultState, /outline\.customer_version\s*\|\|\s*outlineToText\(outline,\s*"client"\)/);
  assert.match(resultState, /outline\.production_version\s*\|\|\s*outlineToText\(outline,\s*"production"\)/);
});

test("UI exposes explicit production, review and safe fallback states", () => {
  const status = source.slice(source.indexOf("function resultStatusDisplay"), source.indexOf("function buildResultState"));
  assert.match(status, /qualityStatus\s*===\s*"production_ready"/);
  assert.match(status, /qualityStatus\s*===\s*"review_required"/);
  assert.match(status, /qualityStatus\s*===\s*"fallback"/);
  assert.match(status, /安全兜底版本/);
});

test("review and fallback results render public review warnings without internal diagnostics", () => {
  const renderApi = source.slice(source.indexOf("function renderApiOutline"), source.indexOf("function renderSimpleDraftNextSteps"));
  assert.match(renderApi, /renderPublicReviewWarnings\(quality\.review_warnings\s*\|\|\s*outline\.review_warnings\)/);
  assert.match(source, /function renderPublicReviewWarnings\(/);
  assert.doesNotMatch(renderApi, /appendDiagnosticsDetails/);
});

test("a valid result-first response does not require a model-specific image prompt", () => {
  const validator = source.slice(source.indexOf("function validateOutlineResponse"), source.indexOf("function resetProfessionalMode"));
  assert.doesNotMatch(validator, /"image_prompt"/);
  assert.match(validator, /customer_version/);
  assert.match(validator, /production_version/);
});

test("HTTP errors preserve the complete result-first public envelope for UI diagnostics", () => {
  const request = source.slice(source.indexOf("async function requestOutline"), source.indexOf("async function requestPlanningStage"));
  assert.match(request, /error\.publicResponse\s*=\s*payload/);
  assert.match(request, /error\.qualityReport\s*=\s*buildPublicErrorQualityReport\(payload\)/);
  assert.match(source, /quality_status:\s*payload\?\.quality_status/);
  assert.match(source, /source_summary:\s*payload\?\.source_summary/);
});

test("blocked UI is distinguished from ordinary quality review and exposes the public contract", () => {
  const errorUi = source.slice(source.indexOf("function showGenerationErrorState"), source.indexOf("function appendRepairWarnings"));
  assert.match(errorUi, /quality_status\s*===\s*"blocked"/);
  assert.match(errorUi, /无法安全生成结果/);
  const diagnostics = source.slice(source.indexOf("function buildDiagnosticCopyPayload"), source.indexOf("function sanitizePlanningModelForDiagnostics"));
  assert.match(diagnostics, /quality_status:/);
  assert.match(diagnostics, /source_summary:/);
});
