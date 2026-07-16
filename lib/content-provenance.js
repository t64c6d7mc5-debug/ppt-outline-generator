import { createHash } from "node:crypto";

export function ensureProvenanceIndex(runtime = {}) {
  if (!runtime.provenanceIndex || typeof runtime.provenanceIndex !== "object") runtime.provenanceIndex = {};
  const index = runtime.provenanceIndex;
  if (!Array.isArray(index.items)) index.items = [];
  if (!Array.isArray(index.pending)) index.pending = [];
  if (!Number.isInteger(index.next_id)) index.next_id = 1;
  if (!(runtime.provenanceText instanceof Map)) runtime.provenanceText = new Map();
  index.request_scope_id ||= runtime.requestScopeId || "";
  return index;
}

export function trackPlannerText(runtime, { rawText, sanitizedText, context, sectionId, field }) {
  if (!runtime) return sanitizedText;
  const index = ensureProvenanceIndex(runtime);
  const plannerItemId = `planner_${index.request_scope_id || "request"}_${index.next_id}`;
  const requirementIds = requirementIdsForSection(context, sectionId);
  const generated = register(index, runtime, {
    origin: "planner_model",
    requirement_id: requirementIds[0] || "",
    requirement_ids: requirementIds,
    planner_item_id: plannerItemId,
    source_stage: "planner_analysis",
    current_stage: "generated",
    field,
    lineage_parent_ids: [],
    text: rawText
  });
  const finalItem = rawText === sanitizedText ? generated : register(index, runtime, {
    ...generated,
    content_item_id: undefined,
    current_stage: "sanitized",
    lineage_parent_ids: [generated.content_item_id],
    text: sanitizedText
  });
  index.pending.push({ text: sanitizedText, content_item_id: finalItem.content_item_id, section_id: sectionId, field });
  return sanitizedText;
}

export function trackRequirementFulfillmentText(runtime, { rawText, sanitizedText, records = [], sectionId, field }) {
  if (!runtime) return sanitizedText;
  const index = ensureProvenanceIndex(runtime);
  const requirementIds = [...new Set(records.map(item => String(item?.requirement_id || "")).filter(Boolean))];
  const atomicRequirementIds = [...new Set(records.map(item => String(item?.atomic_requirement_id || "")).filter(Boolean))];
  const sourceRefs = records.flatMap(item => Array.isArray(item?.source_refs) ? item.source_refs : []);
  const generated = register(index, runtime, {
    origin: "deterministic_requirement_fulfillment",
    requirement_id: requirementIds[0] || "",
    requirement_ids: requirementIds,
    atomic_requirement_id: atomicRequirementIds[0] || "",
    atomic_requirement_ids: atomicRequirementIds,
    fulfillment_id: String(records[0]?.fulfillment_id || records[0]?.content_item_key || ""),
    source_type: String(records[0]?.source_type || ""),
    source_refs: sourceRefs,
    source_hash: String(records[0]?.source_hash || ""),
    fulfillment_reason: String(records[0]?.fulfillment_reason || ""),
    source_stage: "requirement_fulfillment",
    current_stage: "generated",
    field,
    lineage_parent_ids: [],
    text: rawText
  });
  const finalItem = rawText === sanitizedText ? generated : register(index, runtime, {
    ...generated,
    content_item_id: undefined,
    current_stage: "sanitized",
    lineage_parent_ids: [generated.content_item_id],
    text: sanitizedText
  });
  index.pending.push({ text: sanitizedText, content_item_id: finalItem.content_item_id, section_id: sectionId, field });
  return sanitizedText;
}

export function trackSystemInstructionShell(runtime, { text, sectionId, field }) {
  if (!runtime) return text;
  const index = ensureProvenanceIndex(runtime);
  const record = register(index, runtime, {
    origin: "system_instruction_shell",
    requirement_id: "",
    requirement_ids: [],
    planner_item_id: "",
    source_stage: "system_generation",
    current_stage: "generated",
    field,
    lineage_parent_ids: [],
    text
  });
  index.pending.push({ text, content_item_id: record.content_item_id, section_id: sectionId, field });
  return text;
}

export function attachPendingText(runtime, text, slideId, field) {
  if (!runtime?.provenanceIndex) return;
  const index = ensureProvenanceIndex(runtime);
  const sectionId = String(slideId || "").split(":")[0];
  const matches = index.pending
    .map((item, pendingIndex) => ({ item, pendingIndex }))
    .filter(({ item }) => item.field === field
      && (!item.section_id || item.section_id === sectionId)
      && item.text
      && (item.text === text || String(text || "").includes(item.text)));
  for (const { item: pending } of matches) {
    const item = index.items.find(candidate => candidate.content_item_id === pending.content_item_id);
    if (!item) continue;
    item.slide_id = slideId;
    item.field = field;
    item.current_stage = "slotted";
  }
  for (const { pendingIndex } of matches.sort((left, right) => right.pendingIndex - left.pendingIndex)) {
    index.pending.splice(pendingIndex, 1);
  }
}

export function reconcileProvenanceAfterRepair(runtime, _beforeOutline = {}, afterOutline = {}) {
  reconcile(runtime, afterOutline, "repair_retained", "repair_replaced_text");
}

export function reconcileProvenanceAfterFinalization(runtime, _beforeOutline = {}, afterOutline = {}) {
  reconcile(runtime, afterOutline, "final", "final_contract_replaced_text");
}

function reconcile(runtime, afterOutline, retainedStage, dropReason) {
  if (!runtime?.provenanceIndex) return;
  const index = ensureProvenanceIndex(runtime);
  for (const item of index.items) {
    if (!["planner_model", "deterministic_requirement_fulfillment"].includes(item.origin) || !item.slide_id || !item.field) continue;
    const afterSlide = findSlide(afterOutline, item.slide_id);
    const originalText = runtime.provenanceText.get(item.content_item_id) || "";
    const afterText = String(afterSlide?.[item.field] || "");
    if (originalText && afterText.includes(originalText)) {
      item.current_stage = retainedStage;
    } else {
      item.current_stage = "dropped";
      item.drop_reason = dropReason;
    }
  }
}

function register(index, runtime, item) {
  const contentItemId = `content_${index.request_scope_id || "request"}_${index.next_id++}`;
  const record = {
    content_item_id: contentItemId,
    origin: item.origin,
    requirement_id: item.requirement_id || "",
    requirement_ids: [...(item.requirement_ids || [])],
    atomic_requirement_id: item.atomic_requirement_id || "",
    atomic_requirement_ids: [...(item.atomic_requirement_ids || [])],
    planner_item_id: item.planner_item_id || "",
    fulfillment_id: item.fulfillment_id || "",
    source_type: item.source_type || "",
    source_refs: structuredClone(item.source_refs || []),
    source_hash: item.source_hash || "",
    fulfillment_reason: item.fulfillment_reason || "",
    source_stage: item.source_stage,
    current_stage: item.current_stage,
    slide_id: item.slide_id || "",
    field: item.field || "",
    lineage_parent_ids: [...(item.lineage_parent_ids || [])],
    safe_hash: safeHash(item.text)
  };
  index.items.push(record);
  runtime.provenanceText.set(contentItemId, String(item.text || ""));
  return record;
}

function requirementIdsForSection(context = {}, sectionId = "") {
  return (context.requirementBindings || [])
    .flatMap(parent => parent.atomic_requirements || [])
    .filter(item => item.canonical_section_id === sectionId)
    .map(item => item.requirement_id)
    .filter(Boolean);
}

function findSlide(outline, slideId) {
  const [slideType, indexText] = String(slideId || "").split(":");
  const index = Number(indexText);
  return (outline.slides || []).find(slide => slide._pageId === slideId || slide._page_id === slideId || (slide.slide_type === slideType && slide.index === index));
}

function safeHash(value) {
  return createHash("sha256").update(String(value || "")).digest("hex").slice(0, 16);
}
