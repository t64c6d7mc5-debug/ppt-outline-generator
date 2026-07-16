import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { toPublicQualityReport } from "../lib/output-adapter.js";

test("public quality report exposes status and source summary without internal diagnostics", () => {
  const report = toPublicQualityReport(qualityReport());

  assert.equal(report.quality_status, "review_required");
  assert.equal(report.score, 92);
  assert.equal(report.planning_model.model_id, "ppt-v02");
  assert.equal("diagnostic_summary" in report, false);
  assert.equal("hard_gates" in report, false);

  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /req_scope_private|atomic_private|safe_hash|lineage|allocation|Authorization|api_key|SEMANTIC_COMPONENTS_MISSING/i);
  assert.equal("required_section_diagnostics" in report, false);
  assert.equal("requirement_binding_content_diagnostics" in report.planning_model, false);
});

test("diagnostic copy payload carries the safe public summary without restoring private fields", async () => {
  const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  const payload = source.slice(source.indexOf("function buildDiagnosticCopyPayload"), source.indexOf("function sanitizePlanningModelForDiagnostics"));

  assert.match(payload, /diagnostic_summary/);
  assert.match(payload, /redactDiagnosticPayload/);
});

function qualityReport() {
  return {
    request_id: "req_public_123",
    score: 92,
    threshold: 95,
    passed: false,
    production_ready: false,
    review_required: true,
    output_status: "review_required",
    status_label: "质量检查未通过",
    hard_gates: {
      required_section_coverage: { passed: false, reason: "内部原因" }
    },
    must_include: ["空间功能", "运营内容"],
    must_include_rules: [{ label: "空间功能" }, { label: "运营内容" }],
    required_section_diagnostics: [{ covered: true }, { covered: false }],
    confirmed_fact_coverage: { total: 1, covered_count: 1 },
    planning_model: {
      enabled: true,
      used: true,
      status: "used",
      model_id: "ppt-v02",
      content_used: false,
      fallback_used: true,
      planning_rejection_reason: "SEMANTIC_COMPONENTS_MISSING",
      requirement_binding_content_diagnostics: {
        repair: {
          mismatches: [{
            atomic_requirement_id: "atomic_private",
            requirement_label: "空间功能",
            canonical_section_id: "architecture",
            accepted: false,
            decision_code: "REQUIREMENT_BINDING_CONTENT_MISSING"
          }]
        }
      }
    },
    public_diagnostic_context: {
      material_details_present: true,
      confirmed_fact_count: 1,
      atomic_contracts: [{
        atomic_requirement_id: "atomic_private",
        requirement_label: "空间功能",
        canonical_section_id: "architecture",
        required_components: ["objects", "relation"],
        missing_components: ["relations"],
        safe_hash: "internal-only"
      }]
    }
  };
}
