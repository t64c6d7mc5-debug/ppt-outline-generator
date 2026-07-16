import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cleanInstructionShellTitle,
  resolveReleaseAcceptance
} from "../lib/generate-outline.js";
import { finalizeOutlineForApi, toPublicQualityReport } from "../lib/output-adapter.js";

function gate(passed) {
  return { passed, reason: passed ? "ok" : "failed" };
}

test("release acceptance returns review_required for score 92 with review-only gates", () => {
  const acceptance = resolveReleaseAcceptance({
    score: 92,
    hardGates: {
      material_relevance: gate(false),
      instruction_shell_title: gate(false),
      title_content_match: gate(false),
      title_body_alignment: gate(false),
      required_section_coverage: gate(false)
    },
    requiredSectionDiagnostics: [{
      covered: false,
      coverage_reason: "semantic_match_not_found"
    }]
  });

  assert.equal(acceptance.quality_status, "review_required");
  assert.equal(acceptance.http_status, 200);
  assert.deepEqual(acceptance.review_warnings.sort(), [
    "instruction_shell_title",
    "material_relevance",
    "quality_below_production_threshold",
    "required_section_coverage",
    "title_body_alignment",
    "title_content_match"
  ]);
});

test("release acceptance keeps score 96 reviewable when a quality warning remains", () => {
  const acceptance = resolveReleaseAcceptance({
    score: 96,
    hardGates: { material_relevance: gate(false) },
    requiredSectionDiagnostics: []
  });

  assert.equal(acceptance.quality_status, "review_required");
  assert.equal(acceptance.http_status, 200);
  assert.deepEqual(acceptance.review_warnings, ["material_relevance"]);
});

test("release acceptance reviews low scores, fact coverage and missing sections but blocks unresolved fabrication", () => {
  const lowScore = resolveReleaseAcceptance({ score: 88, hardGates: {}, requiredSectionDiagnostics: [] });
  const factCoverage = resolveReleaseAcceptance({
    score: 96,
    hardGates: { confirmed_fact_coverage: { passed: false, code: "explicit_confirmed_fact_coverage_incomplete" } },
    requiredSectionDiagnostics: []
  });
  const fabrication = resolveReleaseAcceptance({
    score: 96,
    hardGates: { no_fabrication: gate(false) },
    requiredSectionDiagnostics: []
  });
  const missingCoreSection = resolveReleaseAcceptance({
    score: 96,
    hardGates: { required_section_coverage: gate(false) },
    requiredSectionDiagnostics: [{ covered: false, missing_section: true }]
  });

  assert.equal(fabrication.quality_status, "blocked");
  assert.equal(fabrication.http_status, 422);
  assert.equal(lowScore.quality_status, "review_required");
  assert.equal(lowScore.http_status, 200);
  assert.equal(factCoverage.quality_status, "review_required");
  assert.equal(factCoverage.http_status, 200);
  assert.equal(missingCoreSection.quality_status, "review_required");
  assert.equal(missingCoreSection.http_status, 200);
  assert.ok(factCoverage.review_warnings.includes("confirmed_fact_coverage"));
  assert.ok(fabrication.blocking_gates.includes("no_fabrication"));
  assert.ok(missingCoreSection.review_warnings.includes("required_section_coverage"));
});

test("release acceptance treats an absent confirmed-fact registry as reviewable, not as a fact conflict", () => {
  const acceptance = resolveReleaseAcceptance({
    score: 92,
    hardGates: { confirmed_fact_coverage: { passed: false, code: "no_explicit_confirmed_facts" } },
    requiredSectionDiagnostics: []
  });

  assert.equal(acceptance.quality_status, "review_required");
  assert.deepEqual(acceptance.review_warnings, [
    "confirmed_fact_coverage",
    "quality_below_production_threshold"
  ]);
});

test("instruction-shell title cleaning preserves the subject without inventing facts", () => {
  assert.equal(cleanInstructionShellTitle("请说明：项目合作路径！！"), "项目合作路径");
  assert.equal(cleanInstructionShellTitle("本页需要｜合作价值"), "合作价值");
  assert.equal(cleanInstructionShellTitle("待生成：品牌合作"), "品牌合作");
});

test("review_required public output exposes warnings without internal diagnostics", () => {
  const report = toPublicQualityReport({
    score: 92,
    threshold: 95,
    quality_status: "review_required",
    review_warnings: ["material_relevance"],
    hard_gates: { material_relevance: gate(false) },
    planning_model: { model_id: "ppt-v02" },
    required_section_diagnostics: [],
    must_include: [],
    must_include_rules: []
  });
  const serialized = JSON.stringify(report);

  assert.equal(report.quality_status, "review_required");
  assert.deepEqual(report.review_warnings, ["material_relevance"]);
  assert.doesNotMatch(serialized, /lineage|safe_hash|allocation|requirement_id/i);
});

test("review_required exposes stable top-level delivery fields as well as a redacted quality report", () => {
  const output = finalizeOutlineForApi({
    title: "标题",
    subtitle: "副标题",
    executive_summary: [],
    content_state_summary: {},
    global_visual_style: {},
    missing_materials: [],
    production_strategy: {},
    slides: []
  }, {
    score: 92,
    quality_status: "review_required",
    review_warnings: ["material_relevance"],
    hard_gates: {}
  });

  assert.equal(output.quality_status, "review_required");
  assert.deepEqual(output.review_warnings, ["material_relevance"]);
});
