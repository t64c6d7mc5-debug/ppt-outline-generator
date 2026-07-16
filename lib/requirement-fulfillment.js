import { createHash } from "node:crypto";

import { validatePlannerRequirementBindings } from "./requirement-binding.js";
import { compileSemanticObligation } from "./semantic-obligation-compiler.js";

const MAX_GENERATED_BULLET_CHARS = 88;
const MAX_KEY_MESSAGE_CHARS = 96;
const MAX_SECTION_CHARS = 360;

export function fulfillPlannerRequirements({
  analysis,
  requirementBindings = [],
  validation = null,
  confirmedFacts = [],
  delivery = {},
  requestScopeId = "request"
} = {}) {
  const initialValidation = validation || validatePlannerRequirementBindings(analysis, requirementBindings);
  if (initialValidation.valid) return noOpResult(analysis, initialValidation);

  const working = structuredClone(analysis || {});
  const bindingIndex = indexBindings(requirementBindings);
  const residuals = initialValidation.content_diagnostics?.atomic_results?.filter(item => item?.accepted !== true) || [];
  const compiledItems = [];
  const unresolved = [];

  for (const residual of residuals) {
    const binding = bindingIndex.get(residual.atomic_requirement_id);
    if (!binding || residual.decision_code !== "REQUIREMENT_BINDING_CONTENT_MISSING") {
      unresolved.push(unresolvedItem(residual, "REQUIREMENT_FULFILLMENT_STRUCTURE_INVALID"));
      continue;
    }
    const result = compileSemanticObligation({
      fulfillmentPolicy: binding.atomic.fulfillment_policy,
      semanticContract: binding.atomic.semantic_contract,
      sourceEvidence: confirmedFacts,
      sectionContext: { section_id: binding.atomic.canonical_section_id },
      budget: { max_chars: MAX_GENERATED_BULLET_CHARS }
    });
    if (result.status !== "compiled") {
      unresolved.push(unresolvedItem(residual, result.reasonCode));
      continue;
    }
    compiledItems.push({ residual, binding, result });
  }

  const records = [];
  const perSection = [];
  for (const group of groupCompiledItems(compiledItems)) {
    const section = (working.sections || []).find(item => item?.section_id === group.section_id);
    if (!section) {
      group.items.forEach(item => unresolved.push(unresolvedItem(item.residual, "REQUIREMENT_BINDING_SECTION_MISSING")));
      continue;
    }
    const patch = buildPatch(group.items);
    const placement = placePatch(section, patch.text, delivery);
    perSection.push(placement.diagnostics);
    if (!placement.applied) {
      group.items.forEach(item => unresolved.push(unresolvedItem(item.residual, placement.reason_code)));
      continue;
    }
    const contentItemKey = `fulfillment_${safeHash(`${requestScopeId}:${group.section_id}:${placement.field}:${patch.text}`)}`;
    for (const item of group.items) {
      records.push(Object.freeze({
        fulfillment_id: contentItemKey,
        content_item_key: contentItemKey,
        origin: "deterministic_requirement_fulfillment",
        requirement_id: item.binding.parent.requirement_id,
        atomic_requirement_id: item.binding.atomic.requirement_id,
        canonical_section_id: group.section_id,
        field: placement.field,
        text: patch.text,
        source_type: item.result.sourceType,
        source_refs: structuredClone(item.result.sourceRefs || []),
        source_hash: safeHash(JSON.stringify(item.result.sourceRefs?.length ? item.result.sourceRefs : patch.text)),
        fulfillment_reason: item.residual.decision_code
      }));
    }
  }

  const finalValidation = validatePlannerRequirementBindings(working, requirementBindings);
  return Object.freeze({
    analysis: working,
    records: Object.freeze(records),
    validation: finalValidation,
    diagnostics: Object.freeze({
      attempted: true,
      pre_residual_count: residuals.length,
      post_residual_count: finalValidation.content_diagnostics?.mismatch_summary?.failed_atomic_count || 0,
      fulfilled_count: records.length,
      unresolved_count: unresolved.length,
      generated_bullet_count: perSection.reduce((total, item) => total + item.generated_bullet_count, 0),
      generated_character_count: perSection.reduce((total, item) => total + item.generated_character_count, 0),
      per_section: Object.freeze(perSection.map(item => Object.freeze(item))),
      unresolved: Object.freeze(unresolved.map(item => Object.freeze(item)))
    })
  });
}

function indexBindings(requirementBindings) {
  const index = new Map();
  for (const parent of Array.isArray(requirementBindings) ? requirementBindings : []) {
    for (const atomic of Array.isArray(parent?.atomic_requirements) ? parent.atomic_requirements : []) {
      index.set(atomic.requirement_id, { parent, atomic });
    }
  }
  return index;
}

function groupCompiledItems(items) {
  const groups = new Map();
  for (const item of items) {
    const type = item.binding.atomic.semantic_contract?.type;
    const isolated = type === "exact_confirmed_fact";
    const key = isolated
      ? `${item.binding.atomic.canonical_section_id}:${item.binding.atomic.requirement_id}`
      : type === "ordered_steps"
        ? `${item.binding.atomic.canonical_section_id}:ordered:${safeHash(JSON.stringify(item.binding.atomic.semantic_contract))}`
        : `${item.binding.atomic.canonical_section_id}:compound:${item.binding.atomic.fulfillment_policy}`;
    if (!groups.has(key)) groups.set(key, { section_id: item.binding.atomic.canonical_section_id, items: [] });
    groups.get(key).items.push(item);
  }
  return [...groups.values()];
}

function buildPatch(items) {
  const clauses = [...new Set(items.map(item => stripTerminal(item.result.text)).filter(Boolean))];
  return { text: `${clauses.join("；")}。` };
}

function placePatch(section, text, delivery) {
  const maxBullets = positiveInteger(delivery?.maxContentPoints, 5);
  const bullets = Array.isArray(section.bullets) ? section.bullets : [];
  section.bullets = bullets;
  const beforeBulletCount = bullets.length;
  const beforeCharacters = sectionCharacters(section);
  const textCharacters = normalizedLength(text);
  const sectionLimit = Math.min(maxBullets * MAX_GENERATED_BULLET_CHARS, MAX_SECTION_CHARS);
  const duplicate = bullets.some(item => normalize(item) === normalize(text)) || normalize(section.key_message).includes(normalize(text));
  if (duplicate) return placementResult(section, false, "", "", beforeBulletCount, beforeCharacters, 0, 0);

  if (beforeBulletCount < maxBullets
    && textCharacters <= MAX_GENERATED_BULLET_CHARS
    && beforeCharacters + textCharacters <= sectionLimit) {
    bullets.push(text);
    return placementResult(section, true, "content", "", beforeBulletCount, beforeCharacters, 1, textCharacters);
  }

  const keyMessage = String(section.key_message || "").trim();
  const appended = `${keyMessage.replace(/[。；;]+$/g, "")}；${text}`;
  if (keyMessage
    && normalizedLength(appended) <= MAX_KEY_MESSAGE_CHARS
    && sectionCharacters({ ...section, key_message: appended }) <= sectionLimit) {
    section.key_message = appended;
    return placementResult(section, true, "key_message", "", beforeBulletCount, beforeCharacters, 0, textCharacters);
  }

  return placementResult(
    section,
    false,
    "",
    "REQUIREMENT_FULFILLMENT_BUDGET_EXCEEDED",
    beforeBulletCount,
    beforeCharacters,
    0,
    0
  );
}

function placementResult(section, applied, field, reasonCode, beforeBulletCount, beforeCharacters, generatedBulletCount, generatedCharacters) {
  return {
    applied,
    field,
    reason_code: reasonCode,
    diagnostics: {
      canonical_section_id: String(section?.section_id || ""),
      bullet_count_before: beforeBulletCount,
      bullet_count_after: Array.isArray(section?.bullets) ? section.bullets.length : 0,
      character_count_before: beforeCharacters,
      character_count_after: sectionCharacters(section),
      generated_bullet_count: generatedBulletCount,
      generated_character_count: generatedCharacters,
      budget_rejection_reason: reasonCode
    }
  };
}

function noOpResult(analysis, validation) {
  return Object.freeze({
    analysis: structuredClone(analysis || {}),
    records: Object.freeze([]),
    validation,
    diagnostics: Object.freeze({
      attempted: false,
      pre_residual_count: 0,
      post_residual_count: 0,
      fulfilled_count: 0,
      unresolved_count: 0,
      generated_bullet_count: 0,
      generated_character_count: 0,
      per_section: Object.freeze([]),
      unresolved: Object.freeze([])
    })
  });
}

function unresolvedItem(residual, reasonCode) {
  return {
    parent_requirement_id: String(residual?.parent_requirement_id || ""),
    atomic_requirement_id: String(residual?.atomic_requirement_id || ""),
    canonical_section_id: String(residual?.canonical_section_id || ""),
    reason_code: String(reasonCode || "REQUIREMENT_FULFILLMENT_UNRESOLVED")
  };
}

function sectionCharacters(section) {
  return normalizedLength([
    section?.key_message || "",
    ...(Array.isArray(section?.bullets) ? section.bullets : [])
  ].join(""));
}

function normalizedLength(value) {
  return Array.from(normalize(value)).length;
}

function normalize(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, "").trim();
}

function stripTerminal(value) {
  return String(value || "").trim().replace(/[。；;]+$/g, "");
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function safeHash(value) {
  return createHash("sha256").update(String(value || "")).digest("hex").slice(0, 16);
}
