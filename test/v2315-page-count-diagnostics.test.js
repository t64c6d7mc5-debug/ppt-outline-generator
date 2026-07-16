import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildRequiredSectionSelectionDiagnostics,
  planWithLocalModel
} from "../lib/local-model-planner.js";
import { finalizeOutlineForApi } from "../lib/output-adapter.js";

const allowedSections = [
  "cover",
  "market_or_customer_challenge",
  "company_positioning",
  "product_portfolio",
  "product_or_process_capability",
  "quality_or_validation",
  "target_audience",
  "delivery_and_collaboration",
  "customer_value",
  "cooperation_next_step"
];

function context(pageCount = 10) {
  return {
    pageCount,
    requestedPageCount: pageCount,
    type: { base: ["cover", "cooperation_next_step"], extensions: allowedSections.slice(1, -1) },
    requirementBindings: [{
      requirement_id: "req_test_0",
      atomic_requirements: [
        { requirement_id: "a1", canonical_section_id: "market_or_customer_challenge" },
        { requirement_id: "a2", canonical_section_id: "market_or_customer_challenge" },
        { requirement_id: "a3", canonical_section_id: "company_positioning" },
        { requirement_id: "a4", canonical_section_id: "product_portfolio" },
        { requirement_id: "a5", canonical_section_id: "product_or_process_capability" },
        { requirement_id: "a6", canonical_section_id: "quality_or_validation" },
        { requirement_id: "a7", canonical_section_id: "target_audience" },
        { requirement_id: "a8", canonical_section_id: "delivery_and_collaboration" },
        { requirement_id: "a9", canonical_section_id: "customer_value" },
        { requirement_id: "a10", canonical_section_id: "cooperation_next_step" }
      ]
    }]
  };
}

test("v2.3.15 page diagnostics reports ten-page minimum without blocking ten pages", () => {
  const diagnostics = buildRequiredSectionSelectionDiagnostics(context(10), allowedSections, { page_count: 10 });

  assert.equal(diagnostics.requested_page_count, 10);
  assert.equal(diagnostics.normalized_page_count, 10);
  assert.equal(diagnostics.unique_required_section_count, 9);
  assert.equal(diagnostics.fixed_section_count, 1);
  assert.equal(diagnostics.total_minimum_page_count, 10);
  assert.equal(diagnostics.duplicate_section_count, 1);
  assert.equal(diagnostics.allocation_rejection_reason, "");
  assert.deepEqual(diagnostics.required_canonical_sections, [
    "market_or_customer_challenge",
    "company_positioning",
    "product_portfolio",
    "product_or_process_capability",
    "quality_or_validation",
    "target_audience",
    "delivery_and_collaboration",
    "customer_value",
    "cooperation_next_step"
  ]);
});

test("v2.3.15 page diagnostics reports the exact ten-page minimum for an eight-page rejection", () => {
  const diagnostics = buildRequiredSectionSelectionDiagnostics(context(8), allowedSections, { pageCount: 8 });

  assert.equal(diagnostics.requested_page_count, 8);
  assert.equal(diagnostics.normalized_page_count, 8);
  assert.equal(diagnostics.total_minimum_page_count, 10);
  assert.equal(diagnostics.allocation_rejection_reason, "REQUIRED_SECTION_COUNT_EXCEEDS_PAGE_COUNT");
});

test("v2.3.15 page diagnostics accepts snake_case and camelCase request page fields", () => {
  const snake = buildRequiredSectionSelectionDiagnostics(context(10), allowedSections, { page_count: "10" });
  const camel = buildRequiredSectionSelectionDiagnostics(context(10), allowedSections, { pageCount: "10" });

  assert.equal(snake.requested_page_count, 10);
  assert.equal(camel.requested_page_count, 10);
  assert.equal(snake.normalized_page_count, camel.normalized_page_count);
});

test("v2.3.15 page diagnostics exposes the actual default source when page count is absent", () => {
  const diagnostics = buildRequiredSectionSelectionDiagnostics(context(8), allowedSections, {});

  assert.equal(diagnostics.requested_page_count, 8);
  assert.equal(diagnostics.normalized_page_count, 8);
  assert.equal(diagnostics.page_count_source, "normalized_context_default");
});

test("v2.3.15 allocation diagnostics remain internal and are absent from public output", () => {
  const report = {
    request_id: "req_safe",
    score: 92,
    threshold: 95,
    hard_gates: { required_section_coverage: { passed: false } },
    planning_model: {
      enabled: true,
      used: false,
      status: "fallback",
      model_id: "ppt-v02",
      fallback_used: true,
      planning_rejection_reason: "REQUIRED_SECTION_COUNT_EXCEEDS_PAGE_COUNT",
      required_section_selection_diagnostics: buildRequiredSectionSelectionDiagnostics(context(8), allowedSections, { page_count: 8 })
    },
    must_include: [],
    required_section_diagnostics: []
  };
  const output = finalizeOutlineForApi(candidate(), report);
  const selection = report.planning_model.required_section_selection_diagnostics;

  assert.equal(selection.requested_page_count, 8);
  assert.equal(selection.total_minimum_page_count, 10);
  assert.deepEqual(selection.required_canonical_sections, context(8).requirementBindings[0].atomic_requirements
    .map(item => item.canonical_section_id)
    .filter((id, index, ids) => ids.indexOf(id) === index));
  assert.equal("diagnostic_summary" in output.quality_report, false);
  assert.equal("required_section_selection_diagnostics" in output.quality_report.planning_model, false);
  assert.doesNotMatch(JSON.stringify(output), /req_test_0|a1|safe_hash|lineage|客户/);
});

function candidate() {
  return {
    title: "标题",
    subtitle: "副标题",
    executive_summary: [],
    content_state_summary: {},
    global_visual_style: {},
    missing_materials: [],
    production_strategy: {},
    slides: [{
      index: 1,
      title: "封面",
      content: "正文",
      visual_suggestion: "结构图",
      slide_type: "cover",
      role: "cover",
      evidence_status: "framework_only",
      evidence_sources: [],
      data_requirements: [],
      speaker_notes: "备注",
      visual_spec: {},
      _page_id: "cover:1"
    }]
  };
}
