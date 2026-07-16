import assert from "node:assert/strict";
import { test } from "node:test";
import { finalizeOutlineForApi } from "../lib/output-adapter.js";
import { buildInternalDiagnostics } from "../lib/planner-retention.js";
import { createAppServer } from "../server.js";
import { OutlineQualityError } from "../lib/generate-outline.js";

test("v2.3.15 customer success response strips sidecar lineage and internal diagnostics", () => {
  const output = finalizeOutlineForApi(candidate(), qualityReport());
  const serialized = JSON.stringify(output);

  assert.doesNotMatch(serialized, /content_item_id|planner_item_id|requirement_id|lineage_parent_ids|safe_hash|origin/);
  assert.equal(output.quality_report.planning_model.content_used, true);
  assert.equal(output.quality_report.request_id, "req_safe_123");
});

test("v2.3.15 public quality report excludes gate state and internal diagnostics", () => {
  const output = finalizeOutlineForApi(candidate(), qualityReport());

  assert.equal(output.quality_report.score, 95);
  assert.equal(output.quality_report.threshold, 95);
  assert.equal("hard_gates" in output.quality_report, false);
  assert.equal("internal_diagnostics" in output.quality_report, false);
});

test("v2.3.15 internal diagnostics retain scoring details that public reports redact", () => {
  const report = qualityReport();
  const internal = buildInternalDiagnostics(report, { requestScopeId: report.request_id });
  const publicReport = finalizeOutlineForApi(candidate(), report).quality_report;

  assert.deepEqual(internal.confirmed_fact_coverage, report.confirmed_fact_coverage);
  assert.deepEqual(internal.dimensions, report.dimensions);
  assert.deepEqual(internal.content_state, report.content_state);
  assert.deepEqual(internal.warnings, report.warnings);
  assert.equal(internal.support_tier, report.support_tier);
  assert.equal(internal.planning_model.model_id, "qwen3:32b");
  assert.deepEqual(internal.risk_rule_diagnostics, report.risk_rule_diagnostics);
  assert.deepEqual(internal.required_section_diagnostics, report.required_section_diagnostics);
  assert.equal(internal.must_include_rule_source, "structured");
  assert.equal(internal.must_include_rules.length, 1);
  assert.deepEqual(internal.industry_profile_diagnostics, report.industry_profile_diagnostics);
  assert.deepEqual(internal.planning_model.planner_response_structure_diagnostics, report.planning_model.planner_response_structure_diagnostics);
  assert.deepEqual(internal.planning_model.planner_response_path_diagnostics, report.planning_model.planner_response_path_diagnostics);
  assert.deepEqual(internal.planning_model.repair_request_diagnostics, report.planning_model.repair_request_diagnostics);
  assert.deepEqual(internal.requirement_fulfillment, report.requirement_fulfillment);

  for (const field of [
    "confirmed_fact_coverage",
    "dimensions",
    "content_state",
    "warnings",
    "support_tier",
    "risk_rule_diagnostics",
    "required_section_diagnostics",
    "must_include_rules",
    "industry_profile_diagnostics",
    "planner_response_structure_diagnostics",
    "planner_response_path_diagnostics",
    "repair_request_diagnostics"
  ]) assert.equal(field in publicReport, false, field);
  assert.equal("requirement_fulfillment" in publicReport, false);
  assert.equal(publicReport.planning_model.model_id, "qwen3:32b");
  assert.equal("planner_response_structure_diagnostics" in publicReport.planning_model, false);
  assert.equal("planner_response_path_diagnostics" in publicReport.planning_model, false);
  assert.equal("repair_request_diagnostics" in publicReport.planning_model, false);
});

test("v2.3.15 quality failures recover through the same redacted fallback boundary", async () => {
  const server = createAppServer({
    generateOutlineFn: async () => {
      throw new OutlineQualityError("quality failed", qualityReport());
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/outline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requirement: "测试" })
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.doesNotMatch(JSON.stringify(payload), /content_item_id|planner_item_id|requirement_id|lineage_parent_ids|safe_hash|origin/);
  assert.equal("planner_response_structure_diagnostics" in payload.quality_report.planning_model, false);
  assert.equal("planner_response_path_diagnostics" in payload.quality_report.planning_model, false);
  assert.equal("repair_request_diagnostics" in payload.quality_report.planning_model, false);
  assert.equal("required_section_selection_diagnostics" in payload.quality_report.planning_model, false);
    assert.equal(payload.success, true);
    assert.equal(payload.quality_status, "fallback");
    assert.ok(payload.customer_version && payload.production_version);
    assert.equal(payload.source_summary.model_used, false);
    assert.equal(payload.source_summary.fallback_used, true);
    assert.equal("hard_gates" in payload.quality_report, false);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
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
    slides: [{ index: 1, title: "封面", key_message: "结论", content: "• 正文", slide_type: "cover", role: "cover", evidence_status: "framework_only", evidence_sources: [], data_requirements: [], speaker_notes: "备注", visual_spec: {}, visual_suggestion: "结构图", _page_id: "cover:1" }]
  };
}

function qualityReport() {
  return {
    request_id: "req_safe_123",
    score: 95,
    threshold: 95,
    hard_gates: { required_section_coverage: { passed: false, reason: "safe reason" } },
    support_tier: "production",
    dimensions: { page_distinctiveness: { score: 10, max: 10, reasons: ["distinct"] } },
    confirmed_fact_coverage: { total: 2, covered_count: 2, coverage: 1, code: "ok" },
    content_state: { confirmed: [{ key: "page_count", value: "8页" }], suggested: [], needs_confirmation: [] },
    warnings: ["internal warning"],
    risk_rule_diagnostics: [{ rule_source: "structured" }],
    required_section_diagnostics: [{ required_item: "项目定位", covered: true }],
    must_include_rule_source: "structured",
    must_include_rules: [{ original_requirement: "项目定位" }],
    must_include_rules_schema_version: 1,
    must_include_source_count: 1,
    must_include_source_hash: "safe-hash",
    industry_profile_diagnostics: { selected_industry_profile: "generic" },
    planning_model: {
      used: true,
      content_used: true,
      model_id: "qwen3:32b",
      planner_response_structure_diagnostics: {
        response_root_type: "object",
        selected_container: "slides",
        raw_item_count: 3,
        safe_structure_hash: "internal-only-hash"
      },
      planner_response_path_diagnostics: {
        candidate_container_paths: ["$.analysis.sections"],
        candidate_item_key_signatures: [{ path: "$.analysis.sections", safe_hash: "internal-path-hash" }],
        safe_structure_path_hash: "internal-path-hash"
      },
      repair_request_diagnostics: {
        requested_page_count: 10,
        supplied_section_count: 1,
        required_top_level_container: "sections",
        safe_prompt_structure_hash: "internal-repair-hash",
        repair_response: { selected_container: "root_single_section", raw_item_count: 1 }
      },
      required_section_selection_diagnostics: {
        required_section_ids: ["internal-section-id"],
        requested_page_count: 10,
        safe_hash: "internal-selection-hash"
      }
    },
    internal_diagnostics: {
      provenance: [{ content_item_id: "content_secret", origin: "planner_model", requirement_id: "req_scope_0_0", planner_item_id: "planner_1", lineage_parent_ids: [], safe_hash: "abc" }]
    },
    requirement_fulfillment: {
      records: [{ atomic_requirement_id: "internal_atomic", source_hash: "internal-source-hash" }],
      diagnostics: {
        pre_residual_count: 2,
        post_residual_count: 0,
        per_section: [{ section_id: "value", generated_bullet_count: 1, generated_character_count: 24 }]
      }
    }
  };
}
