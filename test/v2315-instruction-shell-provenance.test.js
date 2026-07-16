import assert from "node:assert/strict";
import { test } from "node:test";
import { enrichPlanningMetadata } from "../lib/generate-outline.js";
import { buildNarrativePlan } from "../lib/narrative-planner.js";
import { buildRequestAuthority, parseRequestContext } from "../lib/request-context.js";
import { scoreOutline } from "../lib/outline-scorer.js";

test("v2.3.15 deterministic required text remains transparently non-model without rejecting the result", () => {
  const metadata = enrichPlanningMetadata({ enabled: true, used: true, status: "used", fallback_used: false }, bindingContext(), outlineWith("模型业务结论"), {
    provenanceIndex: {
      items: [{
        content_item_id: "content_required_1",
        origin: "required_business_content",
        requirement_id: "req_scope_0_0",
        planner_item_id: "",
        slide_id: "positioning:2",
        field: "key_message",
        current_stage: "final",
        lineage_parent_ids: []
      }]
    },
    provenanceText: new Map([["content_required_1", "模型业务结论"]])
  });

  assert.equal(metadata.content_used, false);
  assert.equal(metadata.status, "used");
  assert.equal(metadata.planning_rejection_reason, undefined);
  assert.deepEqual(metadata.planner_content_retention, {
    content_used: false,
    retained_count: 0,
    evaluated_count: 0,
    items: []
  });
});

test("v2.3.15 bound planner business text retained in its canonical section makes content_used true", () => {
  const metadata = enrichPlanningMetadata({ enabled: true, used: true, status: "used", fallback_used: false }, bindingContext(), outlineWith("模型业务结论"), {
    provenanceIndex: {
      items: [{
        content_item_id: "content_planner_1",
        origin: "planner_model",
        requirement_id: "req_scope_0_0",
        planner_item_id: "planner_scope_1",
        slide_id: "positioning:2",
        field: "key_message",
        current_stage: "final",
        lineage_parent_ids: []
      }]
    },
    provenanceText: new Map([["content_planner_1", "模型业务结论"]])
  });

  assert.equal(metadata.content_used, true);
});

test("v2.3.15 only provenance-marked instruction shell is excluded from required coverage", () => {
  const input = { requirement: "项目介绍", source_mode: "professional", must_include: ["合作价值"], page_count: 3 };
  const authority = buildRequestAuthority(input);
  const context = parseRequestContext(input, authority);
  const outline = coverageOutline("重点内容：合作价值");
  const shellReport = scoreOutline(outline, context, buildNarrativePlan(context), {
    requestAuthority: authority,
    runtime: { provenanceIndex: { items: [{ origin: "system_instruction_shell", slide_id: "value:2", field: "content" }] } }
  });
  const customerReport = scoreOutline(outline, context, buildNarrativePlan(context), {
    requestAuthority: authority,
    runtime: { provenanceIndex: { items: [{ origin: "customer_material", slide_id: "value:2", field: "content" }] } }
  });

  assert.equal(shellReport.required_section_diagnostics[0].covered, false);
  assert.equal(customerReport.required_section_diagnostics[0].covered, true);
});

function bindingContext() {
  return {
    planningAnalysis: { sections: [{ section_id: "positioning" }] },
    planningSectionIntents: { positioning: { key_message: "模型业务结论", bullets: [], visual_direction: "" } },
    requirementBindings: [{
      requirement_id: "req_scope_0",
      atomic_requirements: [{ requirement_id: "req_scope_0_0", label: "业务结论", canonical_section_id: "positioning" }]
    }]
  };
}

function outlineWith(message) {
  return {
    title: "标题",
    subtitle: "副标题",
    slides: [{ index: 2, slide_type: "positioning", title: "定位", key_message: message, content: "• 正文", visual_suggestion: "结构图" }]
  };
}

function coverageOutline(content) {
  return {
    title: "项目介绍",
    subtitle: "面向合作伙伴",
    executive_summary: [],
    missing_materials: [],
    production_strategy: {},
    slides: [
      { _page_id: "cover:1", index: 1, slide_type: "cover", role: "cover", title: "封面", key_message: "主题", content: "• 项目介绍", visual_suggestion: "封面", evidence_sources: [], data_requirements: [], speaker_notes: "", visual_spec: {} },
      { _page_id: "value:2", index: 2, slide_type: "value", role: "insight", title: "价值说明", key_message: "价值说明", content, visual_suggestion: "矩阵", evidence_sources: [], data_requirements: [], speaker_notes: "", visual_spec: {} },
      { _page_id: "closing:3", index: 3, slide_type: "closing", role: "action", title: "下一步", key_message: "行动", content: "• 确认资料", visual_suggestion: "路线图", evidence_sources: [], data_requirements: [], speaker_notes: "", visual_spec: {} }
    ]
  };
}
