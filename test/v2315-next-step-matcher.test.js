import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequirementBindings, validatePlannerRequirementBindings } from "../lib/requirement-binding.js";

const PATH = ["初步洽谈", "场地考察", "资料补充", "方案评估", "合作确认"];

test("v2.3.15 next-step binding accepts one ordered five-step business block in plan", () => {
  const result = validateNextStepBinding({
    key_message: `合作推进按${PATH.join("、")}逐步推进。`,
    bullets: ["每个节点由合作方共同确认输入与下一项安排。"]
  });

  assert.equal(result.valid, true);
  assert.equal(result.reason, null);
});

test("v2.3.15 next-step binding rejects reversed, incomplete, or generic path wording", () => {
  const reversed = validateNextStepBinding({ key_message: "资料补充后开展场地考察，再进行初步洽谈、方案评估与合作确认。" });
  const incomplete = validateNextStepBinding({ key_message: "初步洽谈、场地考察、资料补充、方案评估逐步推进。" });
  const generic = validateNextStepBinding({ key_message: "合作流程将逐步推进。" });

  for (const result of [reversed, incomplete, generic]) {
    assert.equal(result.valid, false);
    assert.equal(result.reason, "REQUIREMENT_BINDING_CONTENT_MISSING");
  }
});

test("v2.3.15 next-step binding never stitches separate sections or content blocks", () => {
  const splitBlocks = validateNextStepBinding({
    key_message: "初步洽谈、场地考察与资料补充。",
    bullets: ["方案评估与合作确认。"]
  });
  const wrongSection = validateNextStepBinding({ key_message: "" }, {
    section_id: "architecture",
    key_message: `合作推进按${PATH.join("、")}逐步推进。`
  });

  assert.equal(splitBlocks.valid, false);
  assert.equal(wrongSection.valid, false);
  assert.equal(wrongSection.reason, "REQUIREMENT_BINDING_CONTENT_MISSING");
});

test("v2.3.15 existing literal next-step match and unrelated atomic behavior remain unchanged", () => {
  const literal = validateNextStepBinding({ key_message: "下一步由合作方提交资料并进入评估。" });
  const otherExpected = createRequirementBindings([{
    original_requirement: "必须说明企业团建。",
    atomic_requirements: [{ label: "企业团建" }],
    section_id: "service",
    source_field: "must_include"
  }], ["service"], "other");
  const otherAnalysis = {
    sections: [{ section_id: "service", key_message: "企业团建活动支持团队协作", bullets: [] }],
    requirement_bindings: modelBindings(otherExpected)
  };

  assert.equal(literal.valid, true);
  assert.equal(validatePlannerRequirementBindings(otherAnalysis, otherExpected).valid, true);
});

test("v2.3.15 missing next-step binding or plan section retains existing fail-closed decisions", () => {
  const expected = nextStepExpected();
  const missingBinding = validatePlannerRequirementBindings({ sections: [{ section_id: "plan", key_message: PATH.join("、"), bullets: [] }], requirement_bindings: [] }, expected);
  const missingPlan = validatePlannerRequirementBindings({
    sections: [{ section_id: "architecture", key_message: PATH.join("、"), bullets: [] }],
    requirement_bindings: modelBindings(expected)
  }, expected);

  assert.equal(missingBinding.reason, "REQUIREMENT_BINDINGS_MISSING");
  assert.equal(missingPlan.reason, "REQUIREMENT_BINDING_SECTION_MISSING");
});

function validateNextStepBinding(planSection = {}, extraSection = null) {
  const expected = nextStepExpected();
  return validatePlannerRequirementBindings({
    sections: [
      { section_id: "plan", key_message: "", bullets: [], ...planSection },
      ...(extraSection ? [extraSection] : [])
    ],
    requirement_bindings: modelBindings(expected)
  }, expected);
}

function nextStepExpected() {
  return createRequirementBindings([{
    original_requirement: "必须给出从初步洽谈、场地考察、资料补充、方案评估到合作确认的完整路径。",
    atomic_requirements: [{ label: "下一步事项" }],
    section_id: "plan",
    source_field: "must_include"
  }], ["plan"], "next");
}

function modelBindings(expected) {
  return expected.map(parent => ({
    requirement_id: parent.requirement_id,
    atomic_requirements: parent.atomic_requirements.map(atomic => ({
      requirement_id: atomic.requirement_id,
      canonical_section_id: atomic.canonical_section_id
    }))
  }));
}
