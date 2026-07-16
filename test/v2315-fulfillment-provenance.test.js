import assert from "node:assert/strict";
import { test } from "node:test";

import {
  reconcileProvenanceAfterFinalization
} from "../lib/content-provenance.js";
import { toPublicQualityReport } from "../lib/output-adapter.js";
import { evaluatePlannerRetention } from "../lib/planner-retention.js";
import { buildRequestAuthority, parseRequestContext } from "../lib/request-context.js";
import { generateSlide } from "../lib/slide-generator.js";

test("v2.3.15 deterministic fulfillment bullet keeps separate provenance and does not inflate planner retention", () => {
  const { context, runtime } = fulfillmentContext({
    keyMessage: "模型给出产品定位判断。",
    bullets: ["模型补充应用场景。", "方案配置监测终端与分析平台。"],
    records: [fulfillmentRecord("content", "方案配置监测终端与分析平台。")]
  });
  const slide = generateSlide({ id: "company_positioning", role: "background" }, 2, context, { aiImages: 0 }, runtime);
  const outline = { slides: [slide] };
  reconcileProvenanceAfterFinalization(runtime, outline, outline);

  const deterministic = runtime.provenanceIndex.items.filter(item => item.origin === "deterministic_requirement_fulfillment");
  const planner = runtime.provenanceIndex.items.filter(item => item.origin === "planner_model");
  const retention = evaluatePlannerRetention(context, outline, runtime);

  assert.equal(deterministic.length, 1);
  assert.equal(deterministic[0].atomic_requirement_ids[0], "atomic_policy_0");
  assert.equal(deterministic[0].current_stage, "final");
  assert.ok(planner.length >= 2);
  assert.equal(retention.evaluated_count, planner.filter(item => ["key_message", "content"].includes(item.field)).length);
  assert.equal(retention.items.some(item => item.content_item_id === deterministic[0].content_item_id), false);
  assert.match(slide.content, /监测终端与分析平台/);
});

test("v2.3.15 key-message fulfillment tracks the planner prefix and deterministic clause independently", () => {
  const patch = "合作方共同策划体验活动。";
  const { context, runtime } = fulfillmentContext({
    keyMessage: `模型给出合作框架；${patch}`,
    bullets: ["模型补充执行边界。"],
    records: [fulfillmentRecord("key_message", patch)]
  });
  const slide = generateSlide({ id: "company_positioning", role: "background" }, 2, context, { aiImages: 0 }, runtime);

  const deterministic = runtime.provenanceIndex.items.find(item => item.origin === "deterministic_requirement_fulfillment");
  const plannerPrefix = runtime.provenanceIndex.items.find(item => item.origin === "planner_model"
    && runtime.provenanceText.get(item.content_item_id).includes("模型给出合作框架"));
  assert.ok(deterministic);
  assert.ok(plannerPrefix);
  assert.equal(runtime.provenanceText.get(deterministic.content_item_id), patch);
  assert.match(slide.key_message, /模型给出合作框架.*合作方共同策划体验活动/);
});

test("v2.3.15 fulfillment content keeps a reserved model slot without exceeding page density", () => {
  const patch = "方案配置监测终端与分析平台。";
  const { context, runtime } = fulfillmentContext({
    keyMessage: "模型给出产品定位判断。",
    bullets: ["模型内容一。", "模型内容二。", "模型内容三。", patch],
    records: [fulfillmentRecord("content", patch)]
  });
  context.delivery.maxContentPoints = 3;

  const slide = generateSlide({ id: "company_positioning", role: "background" }, 2, context, { aiImages: 0 }, runtime);
  const points = slide.content.split("\n").filter(Boolean);

  assert.equal(points.length, 3);
  assert.match(slide.content, /方案配置监测终端与分析平台/);
});

test("v2.3.15 public quality report strips fulfillment policy, budget, IDs, hashes, and lineage", () => {
  const publicReport = toPublicQualityReport({
    request_id: "req_public_fulfillment",
    score: 97,
    threshold: 95,
    hard_gates: { required_section_coverage: { passed: true, code: "" } },
    planning_model: { enabled: true, used: true, status: "used", content_used: true, fallback_used: false },
    requirement_fulfillment: {
      fulfillment_policy: "safe_rephrase_allowed",
      atomic_requirement_id: "atomic_secret",
      source_hash: "internal_hash",
      per_section: [{ budget_rejection_reason: "" }]
    },
    provenance: [{ origin: "deterministic_requirement_fulfillment", content_item_id: "internal_item" }]
  });
  const serialized = JSON.stringify(publicReport);

  assert.doesNotMatch(serialized, /requirement_fulfillment|fulfillment_policy|atomic_secret|internal_hash/);
  assert.doesNotMatch(serialized, /deterministic_requirement_fulfillment|content_item_id|lineage|budget_rejection_reason/);
});

function fulfillmentContext({ keyMessage, bullets, records }) {
  const input = {
    request_id: "req_v2315_fulfillment_provenance",
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
  context.requirementFulfillmentRecords = records;
  return {
    context,
    runtime: { requestScopeId: context.requestScopeId, provenanceIndex: { items: [] } }
  };
}

function fulfillmentRecord(field, text) {
  return {
    content_item_key: "fulfillment_record_0",
    origin: "deterministic_requirement_fulfillment",
    requirement_id: "parent_policy_0",
    atomic_requirement_id: "atomic_policy_0",
    canonical_section_id: "company_positioning",
    field,
    text,
    source_type: "explicit_requirement",
    source_refs: [],
    source_hash: "safe_hash",
    fulfillment_reason: "REQUIREMENT_BINDING_CONTENT_MISSING"
  };
}
