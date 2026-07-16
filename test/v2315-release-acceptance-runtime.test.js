import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { readFile } from "node:fs/promises";

import { resolveReleaseAcceptance } from "../lib/generate-outline.js";
import { createAppServer } from "../server.js";

const reviewOnlyGates = {
  material_relevance: { passed: false, code: "material_needs_review" },
  instruction_shell_title: { passed: false, code: "instruction_shell_title" },
  required_section_coverage: { passed: false, code: "" }
};

const nestedSemanticCoverage = [{
  required_item: "项目体验与活动合作",
  covered: false,
  coverage_reason: "atomic_requirement_missing",
  atomic_requirements: [{
    atomic_requirement: "活动合作",
    covered: false,
    coverage_reason: "keyword_only_rejected",
    keyword_only_rejected: true,
    section_exists: true,
    missing_terms: ["活动合作"]
  }]
}];

test("professional review-only nested atomic mismatch is delivered as HTTP 200", async () => {
  const acceptance = resolveReleaseAcceptance({
    score: 92,
    hardGates: reviewOnlyGates,
    requiredSectionDiagnostics: nestedSemanticCoverage
  });

  assert.equal(acceptance.quality_status, "review_required");
  assert.equal(acceptance.http_status, 200);
  assert.deepEqual(acceptance.review_warnings.sort(), [
    "instruction_shell_title",
    "material_relevance",
    "quality_below_production_threshold",
    "required_section_coverage"
  ]);

  const server = createAppServer({
    generateOutlineFn: async () => ({
      title: "专业方案",
      slides: [{ index: 1, title: "封面", content: "正文" }],
      quality_status: acceptance.quality_status,
      review_warnings: acceptance.review_warnings,
      quality_report: {
        score: 92,
        threshold: 95,
        quality_status: acceptance.quality_status,
        review_warnings: acceptance.review_warnings,
        planning_model: {
          used: true,
          status: "used",
          content_used: false,
          fallback_used: true,
          planning_rejection_reason: "SEMANTIC_COMPONENTS_MISSING"
        }
      }
    })
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/outline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_mode: "professional", requirement: "测试" })
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.quality_status, "review_required");
    assert.ok(payload.slides.length > 0);
    assert.ok(payload.review_warnings.length > 0);
    assert.equal(payload.quality_report.planning_model.fallback_used, true);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("professional UI renders review_required as a continue-to-production review state", async () => {
  const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  const status = source.slice(source.indexOf("function resultStatusDisplay"), source.indexOf("function buildResultState"));

  assert.match(status, /review_required/);
  assert.match(status, /可人工复核并继续制作/);
});

test("missing core section is a review warning at acceptance", () => {
  const acceptance = resolveReleaseAcceptance({
    score: 92,
    hardGates: reviewOnlyGates,
    requiredSectionDiagnostics: [{
      ...nestedSemanticCoverage[0],
      atomic_requirements: [{
        ...nestedSemanticCoverage[0].atomic_requirements[0],
        section_exists: false,
        coverage_reason: "not_found"
      }]
    }]
  });

  assert.equal(acceptance.quality_status, "review_required");
  assert.equal(acceptance.http_status, 200);
  assert.ok(acceptance.review_warnings.includes("required_section_coverage"));
});
