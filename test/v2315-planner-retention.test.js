import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRequestAuthority, parseRequestContext } from "../lib/request-context.js";
import { generateSlide } from "../lib/slide-generator.js";
import { repairOutline } from "../lib/outline-repair.js";
import * as provenance from "../lib/content-provenance.js";

test("v2.3.15 planner business text keeps string output and records slide lineage", () => {
  const { context, runtime } = plannerContext("合作价值来自可核验的体验与运营安排。", ["合作对象先确认资料边界。"]);
  const slide = generateSlide({ id: "company_positioning", role: "background" }, 2, context, { aiImages: 0 }, runtime);

  assert.equal(typeof slide.key_message, "string");
  assert.equal(typeof slide.content, "string");
  assert.match(slide.key_message, /合作价值来自可核验/);
  assert.ok(runtime.provenanceIndex.items.some(item => item.origin === "planner_model"));
  assert.ok(runtime.provenanceIndex.items.some(item => item.slide_id === "company_positioning:2" && item.field === "key_message"));
});

test("v2.3.15 planner sanitization creates transformed lineage without replacing text with objects", () => {
  const { context, runtime } = plannerContext("本方案可实现100%收益。", ["合作对象先确认资料边界。"]);
  const slide = generateSlide({ id: "company_positioning", role: "background" }, 2, context, { aiImages: 0 }, runtime);

  assert.equal(typeof slide.key_message, "string");
  assert.match(slide.key_message, /待品牌方确认/);
  const transformed = runtime.provenanceIndex.items.find(item => item.origin === "planner_model" && item.lineage_parent_ids.length > 0);
  assert.ok(transformed);
  assert.ok(transformed.lineage_parent_ids.length > 0);
});

test("v2.3.15 repair reconciliation retains unchanged planner lineage and drops replaced text", () => {
  const runtime = {
    requestScopeId: "req_v2315_repair",
    provenanceIndex: {
      items: [
        { content_item_id: "content_req_v2315_repair_1", origin: "planner_model", slide_id: "positioning:2", field: "key_message", safe_hash: "", lineage_parent_ids: [], current_stage: "slotted" },
        { content_item_id: "content_req_v2315_repair_2", origin: "planner_model", slide_id: "positioning:2", field: "content", safe_hash: "", lineage_parent_ids: [], current_stage: "slotted" }
      ]
    },
    provenanceText: new Map([
      ["content_req_v2315_repair_1", "保留的模型结论"],
      ["content_req_v2315_repair_2", "被替换的模型要点"]
    ])
  };
  const before = { slides: [{ index: 2, slide_type: "positioning", key_message: "保留的模型结论", content: "• 被替换的模型要点" }] };
  const after = { slides: [{ index: 2, slide_type: "positioning", key_message: "保留的模型结论", content: "• 确定性修复文本" }] };

  provenance.reconcileProvenanceAfterRepair(runtime, before, after);

  assert.equal(runtime.provenanceIndex.items[0].current_stage, "repair_retained");
  assert.equal(runtime.provenanceIndex.items[1].current_stage, "dropped");
  assert.equal(runtime.provenanceIndex.items[1].drop_reason, "repair_replaced_text");
});

test("v2.3.15 outline repair updates the sidecar instead of reclassifying planner text", () => {
  const runtime = {
    requestScopeId: "req_v2315_repair_flow",
    provenanceIndex: {
      items: [{ content_item_id: "content_req_v2315_repair_flow_1", origin: "planner_model", slide_id: "positioning:2", field: "content", lineage_parent_ids: [], current_stage: "slotted" }]
    },
    provenanceText: new Map([["content_req_v2315_repair_flow_1", "交付形式：结构化 PPT 策划提纲"]])
  };
  const outline = { slides: [{ index: 2, slide_type: "positioning", content: "• 交付形式：结构化 PPT 策划提纲", key_message: "业务结论", title: "定位", visual_suggestion: "结构图", evidence_sources: [] }], missing_materials: [] };
  const context = { materialContext: { confirmed_facts: [], fragments: [] }, excludedContent: [], audience: "合作伙伴", availableMaterials: new Set(), materialLabels: new Map() };

  repairOutline(outline, context, { issue_codes: [], repair_targets: [] }, runtime);

  assert.equal(runtime.provenanceIndex.items[0].current_stage, "dropped");
  assert.equal(runtime.provenanceIndex.items[0].drop_reason, "repair_replaced_text");
});

function plannerContext(keyMessage, bullets) {
  const input = {
    request_id: "req_v2315_retention",
    requirement: "产品介绍方案",
    purpose: "产品介绍",
    audience: "合作伙伴",
    page_count: 4
  };
  const planningAnalysis = {
    sections: [{
      section_id: "company_positioning",
      title: "产品定位",
      role: "background",
      objective: "说明产品定位",
      key_message: keyMessage,
      bullets,
      visual_direction: "定位图",
      evidence_status: "framework_only",
      content_complete: true
    }],
    requirement_bindings: []
  };
  const context = parseRequestContext(input, buildRequestAuthority(input, planningAnalysis), planningAnalysis);
  return { context, runtime: { requestScopeId: context.requestScopeId, provenanceIndex: { items: [] } } };
}
