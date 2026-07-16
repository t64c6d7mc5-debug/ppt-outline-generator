const SECTION_CANDIDATES = [
  [/定位|价值主张|项目角色/, ["company_positioning", "positioning", "position"]],
  [/目标用户|目标客户|目标受众|受众/, ["target_audience", "industry", "positioning"]],
  [/体验|功能|技术|设备|产品|模拟器|显示|驾驶|竞速|团建|启蒙/, ["product_or_process_capability", "architecture", "capabilities", "content"]],
  [/空间|资源|场地/, ["resources", "application_scenarios", "architecture"]],
  [/运营|服务|支持/, ["service", "delivery_and_collaboration", "service_process", "process"]],
  [/合作价值|价值/, ["customer_value", "value", "implications"]],
  [/合作|联合运营|条款|模式/, ["model", "delivery_and_collaboration", "service_process"]],
  [/洽谈|考察|资料|评估|确认|行动|下一步|路径|明确动作/, ["cooperation_next_step", "plan", "process", "closing"]]
];

import { findOrderedPathInSingleBlock } from "./ordered-path.js";
import {
  hasActivityPartnership,
  hasConcreteCooperationValue,
  hasConcreteNextAction,
  hasControlledEquipmentRelation,
  deriveAtomicSemanticContract,
  hasExplicitTargetAudience,
  hasResponsibleEntity,
  semanticContractContentEvidence
} from "./requirement-semantics.js";

const MAX_DIAGNOSTIC_TOKENS = 12;
const MAX_DIAGNOSTIC_TOKEN_LENGTH = 16;
const FULFILLMENT_POLICY_SCHEMA_VERSION = 1;
const FULFILLMENT_POLICIES = new Set([
  "exact_source_required",
  "safe_rephrase_allowed",
  "narrative_only"
]);
const SEMANTIC_CONTRACT_TYPES = new Set([
  "objects_relation",
  "actor_action_object",
  "actor_action_value",
  "ordered_steps",
  "responsibility_target_next_action",
  "exact_confirmed_fact"
]);

/**
 * Keeps request-scoped binding order while collapsing repeated canonical
 * targets. This is the shared source for planner and narrative selection.
 */
export function deriveRequiredCanonicalSectionIds(requirementBindings = [], allowedSections = []) {
  const allowed = new Set(allowedSections || []);
  const sectionIds = [];
  const invalidSectionIds = [];
  const referenceCounts = {};
  let atomicRequirementCount = 0;

  for (const parent of Array.isArray(requirementBindings) ? requirementBindings : []) {
    for (const atomic of Array.isArray(parent?.atomic_requirements) ? parent.atomic_requirements : []) {
      atomicRequirementCount += 1;
      const sectionId = String(atomic?.canonical_section_id || "").trim();
      if (!sectionId || !allowed.has(sectionId)) {
        invalidSectionIds.push(sectionId || "missing");
        continue;
      }
      referenceCounts[sectionId] = (referenceCounts[sectionId] || 0) + 1;
      if (!sectionIds.includes(sectionId)) sectionIds.push(sectionId);
    }
  }

  return Object.freeze({
    valid: invalidSectionIds.length === 0,
    section_ids: Object.freeze(sectionIds),
    invalid_section_ids: Object.freeze([...new Set(invalidSectionIds)]),
    binding_parent_count: Array.isArray(requirementBindings) ? requirementBindings.length : 0,
    atomic_requirement_count: atomicRequirementCount,
    reference_counts: Object.freeze(referenceCounts)
  });
}

export function resolveRequiredSectionSelectionAuthority({
  requirementBindings,
  legacyRequiredSectionPlan = [],
  allowedSections = []
} = {}) {
  const allowed = new Set(allowedSections || []);
  const legacySectionIds = stableLegacySectionIds(legacyRequiredSectionPlan, allowed);
  const bindingsPresent = Array.isArray(requirementBindings);
  if (!bindingsPresent) return selectionResult({
    authority: "legacy_required_section_plan",
    valid: true,
    requiredSectionIds: legacySectionIds,
    legacySectionIds,
    binding: null
  });

  if (!requirementBindings.length) {
    const valid = legacySectionIds.length === 0;
    return selectionResult({
      authority: valid ? "requirement_bindings" : "requirement_bindings_invalid",
      valid,
      conflictCode: valid ? "" : "REQUIREMENT_BINDINGS_EMPTY",
      requiredSectionIds: [],
      legacySectionIds,
      binding: deriveRequiredCanonicalSectionIds(requirementBindings, allowedSections)
    });
  }

  const binding = deriveRequiredCanonicalSectionIds(requirementBindings, allowedSections);
  return selectionResult({
    authority: binding.valid ? "requirement_bindings" : "requirement_bindings_invalid",
    valid: binding.valid,
    conflictCode: binding.valid ? "" : "REQUIRED_SECTION_ID_INVALID",
    requiredSectionIds: binding.valid ? binding.section_ids : [],
    legacySectionIds,
    binding
  });
}

export function createRequirementBindings(requiredSectionPlan = [], allowedSections = [], requestScopeId = "") {
  const allowed = new Set(allowedSections);
  const scope = String(requestScopeId || "request").replace(/[^a-zA-Z0-9_-]/g, "_");
  return requiredSectionPlan.map((parent, parentIndex) => {
    const parentId = `req_${scope}_${parentIndex}`;
    const scopedSectionId = parentScopedSectionId(parent, allowed);
    const atomicRequirements = (parent.atomic_requirements || []).map((atomic, atomicIndex) => {
      const label = String(atomic?.label || atomic || "").trim();
      const fulfillment = buildAtomicFulfillmentDefinition({ parent, atomic, label });
      return {
        requirement_id: `${parentId}_${atomicIndex}`,
        label,
        canonical_section_id: scopedSectionId || resolveCanonicalSectionId(label, parent.section_id, allowed),
        ...fulfillment
      };
    });
    return {
      requirement_id: parentId,
      original_requirement: parent.original_requirement || parent.label || "",
      atomic_requirements: atomicRequirements,
      constraints: structuredClone(parent.constraints || []),
      page_constraint: structuredClone(parent.page_constraint || null),
      aggregation: parent.aggregation || "all_of",
      source_field: parent.source_field || "must_include"
    };
  });
}

function parentScopedSectionId(parent = {}, allowed = new Set()) {
  const pageConstraint = parent?.page_constraint;
  if (pageConstraint?.type === "cover" && allowed.has("cover")) return "cover";
  if (pageConstraint?.type === "last") {
    return ["cooperation_next_step", "closing", "plan", "actions"].find(sectionId => allowed.has(sectionId)) || "";
  }
  const atomicCount = Array.isArray(parent?.atomic_requirements) ? parent.atomic_requirements.length : 0;
  const orderedParent = atomicCount > 1 && /(?:路径|流程|步骤|从.+到)/.test(String(parent?.original_requirement || parent?.label || ""));
  if (!orderedParent) return "";
  return ["cooperation_next_step", "plan", "process", "closing"].find(sectionId => allowed.has(sectionId)) || "";
}

function stableLegacySectionIds(plan, allowed) {
  const ids = [];
  for (const item of Array.isArray(plan) ? plan : []) {
    const sectionId = String(item?.section_id || "").trim();
    if (!sectionId || sectionId === "content" || !allowed.has(sectionId) || ids.includes(sectionId)) continue;
    ids.push(sectionId);
  }
  return ids;
}

function selectionResult({ authority, valid, conflictCode = "", requiredSectionIds, legacySectionIds, binding }) {
  const required = [...requiredSectionIds];
  const legacy = [...legacySectionIds];
  const bindingOnly = required.filter(sectionId => !legacy.includes(sectionId));
  const legacyOnly = legacy.filter(sectionId => !required.includes(sectionId));
  return Object.freeze({
    authority,
    valid,
    conflict_code: conflictCode,
    required_section_ids: Object.freeze(required),
    selection_authority: authority,
    binding_required_section_count: required.length,
    legacy_plan_section_count: legacy.length,
    authority_conflict_count: bindingOnly.length + legacyOnly.length,
    binding_only_section_ids_count: bindingOnly.length,
    legacy_only_section_ids_count: legacyOnly.length,
    binding_parent_count: binding?.binding_parent_count || 0,
    atomic_requirement_count: binding?.atomic_requirement_count || 0,
    invalid_section_ids: binding?.invalid_section_ids || Object.freeze([]),
    reference_counts: binding?.reference_counts || Object.freeze({})
  });
}

export function validatePlannerRequirementBindings(analysis = {}, expectedBindings = []) {
  const contentDiagnostics = buildFullBindingContentDiagnostics(analysis, expectedBindings);
  const policyValidation = validateBindingFulfillmentPolicies(expectedBindings);
  if (!policyValidation.valid) {
    return invalid("REQUIREMENT_FULFILLMENT_POLICY_INVALID", [], policyValidation.requirement_id, contentDiagnostics);
  }
  if (!expectedBindings.length) return validBindingResult([], contentDiagnostics);
  const returned = Array.isArray(analysis.requirement_bindings) ? analysis.requirement_bindings : [];
  if (!returned.length) return invalid("REQUIREMENT_BINDINGS_MISSING", [], "", contentDiagnostics);
  const sections = new Map((analysis.sections || []).map(section => [section.section_id, section]));
  const returnedByParent = new Map(returned.map(item => [item.requirement_id, item]));
  const diagnostics = [];
  const summary = {
    checked_atomic_count: 0,
    passed_atomic_count: 0,
    failed_atomic_count: 0,
    unknown_id_count: 0,
    missing_section_count: 0
  };

  for (const expectedParent of expectedBindings) {
    const actualParent = returnedByParent.get(expectedParent.requirement_id);
    if (!actualParent) return invalid("REQUIREMENT_BINDING_MISSING", diagnostics, expectedParent.requirement_id, contentDiagnostics);
    const actualAtomic = new Map((actualParent.atomic_requirements || []).map(item => [item.requirement_id, item]));
    for (const expectedAtomic of expectedParent.atomic_requirements || []) {
      summary.checked_atomic_count += 1;
      const actual = actualAtomic.get(expectedAtomic.requirement_id);
      if (!actual) return invalid("ATOMIC_REQUIREMENT_BINDING_MISSING", diagnostics, expectedAtomic.requirement_id, contentDiagnostics);
      if (actual.canonical_section_id !== expectedAtomic.canonical_section_id) {
        return invalid("REQUIREMENT_BINDING_SECTION_MISMATCH", diagnostics, expectedAtomic.requirement_id, contentDiagnostics);
      }
      const section = sections.get(actual.canonical_section_id);
      if (!section) return invalid("REQUIREMENT_BINDING_SECTION_MISSING", diagnostics, expectedAtomic.requirement_id, contentDiagnostics);
      const contentEvidence = atomicBusinessContentEvidence(
        expectedAtomic.label,
        section,
        actual.canonical_section_id,
        expectedAtomic.semantic_contract
      );
      if (!contentEvidence.combined_match) {
        return invalid("REQUIREMENT_BINDING_CONTENT_MISSING", diagnostics, expectedAtomic.requirement_id, contentDiagnostics);
      }
      diagnostics.push({
        requirement_id: expectedAtomic.requirement_id,
        canonical_section_id: actual.canonical_section_id,
        accepted: true
      });
      summary.passed_atomic_count += 1;
    }
  }
  return validBindingResult(diagnostics, contentDiagnostics);
}

function buildAtomicFulfillmentDefinition({ parent = {}, atomic = {}, label = "" } = {}) {
  const sourceField = String(parent?.source_field || "must_include").trim();
  const policy = sourceField === "confirmed_fact"
    ? "exact_source_required"
    : sourceField === "narrative_preference"
      ? "narrative_only"
      : "safe_rephrase_allowed";
  const sourceRefs = sanitizeSourceRefs(atomic?.source_refs);
  const semanticContract = deriveAtomicSemanticContract({
    label,
    parentOriginal: parent?.original_requirement || parent?.label || "",
    parentAtomicLabels: (Array.isArray(parent?.atomic_requirements) ? parent.atomic_requirements : [])
      .map(item => String(item?.label || item || "").trim()),
    fulfillmentPolicy: policy,
    sourceRefs
  });
  return {
    fulfillment_policy_schema_version: FULFILLMENT_POLICY_SCHEMA_VERSION,
    fulfillment_policy: policy,
    semantic_contract: structuredClone(semanticContract),
    source_refs: structuredClone(sourceRefs)
  };
}

function validateBindingFulfillmentPolicies(requirementBindings = []) {
  for (const parent of Array.isArray(requirementBindings) ? requirementBindings : []) {
    for (const atomic of Array.isArray(parent?.atomic_requirements) ? parent.atomic_requirements : []) {
      const requirementId = String(atomic?.requirement_id || "");
      const contract = atomic?.semantic_contract;
      const policy = String(atomic?.fulfillment_policy || "");
      const sourceRefs = sanitizeSourceRefs(atomic?.source_refs);
      const valid = atomic?.fulfillment_policy_schema_version === FULFILLMENT_POLICY_SCHEMA_VERSION
        && FULFILLMENT_POLICIES.has(policy)
        && contract?.version === 1
        && SEMANTIC_CONTRACT_TYPES.has(contract?.type)
        && contract?.aggregation === "all_of"
        && contract?.same_block === true
        && Array.isArray(contract?.required_components)
        && contract.required_components.length > 0
        && contract?.component_values
        && typeof contract.component_values === "object"
        && (policy !== "exact_source_required" || sourceRefs.length > 0);
      if (!valid) return { valid: false, requirement_id: requirementId };
    }
  }
  return { valid: true, requirement_id: "" };
}

function sanitizeSourceRefs(value) {
  return (Array.isArray(value) ? value : []).flatMap(item => {
    const sourceId = String(item?.source_id || "").trim().slice(0, 160);
    const fragmentId = String(item?.fragment_id || "").trim().slice(0, 160);
    if (!sourceId) return [];
    return [{ source_id: sourceId, ...(fragmentId ? { fragment_id: fragmentId } : {}) }];
  });
}

function buildFullBindingContentDiagnostics(analysis = {}, expectedBindings = []) {
  const returned = Array.isArray(analysis.requirement_bindings) ? analysis.requirement_bindings : [];
  const returnedByParent = new Map(returned.map(item => [item?.requirement_id, item]));
  const sections = new Map((Array.isArray(analysis.sections) ? analysis.sections : []).map(section => [section?.section_id, section]));
  const atomicResults = [];

  for (const expectedParent of Array.isArray(expectedBindings) ? expectedBindings : []) {
    const actualParent = returnedByParent.get(expectedParent?.requirement_id);
    const actualAtomic = new Map((Array.isArray(actualParent?.atomic_requirements) ? actualParent.atomic_requirements : [])
      .map(item => [item?.requirement_id, item]));
    for (const expectedAtomic of Array.isArray(expectedParent?.atomic_requirements) ? expectedParent.atomic_requirements : []) {
      atomicResults.push(observeAtomicBinding({
        analysis,
        expectedParent,
        expectedAtomic,
        actualParent,
        actual: actualAtomic.get(expectedAtomic?.requirement_id),
        sections,
        returnedBindingsPresent: returned.length > 0
      }));
    }
  }

  const mismatches = atomicResults.filter(item => item.accepted !== true);
  const contentMismatches = mismatches.filter(item => item.decision_code === "REQUIREMENT_BINDING_CONTENT_MISSING");
  const firstContentMismatch = contentMismatches[0] || null;
  return bindingContentDiagnostics({
    decisionCode: mismatches[0]?.decision_code || "",
    contentMismatchCount: contentMismatches.length,
    firstFailedBinding: firstContentMismatch ? compatibilityFailureView(firstContentMismatch) : null,
    atomicResults,
    mismatches,
    summary: {
      checked_atomic_count: atomicResults.length,
      passed_atomic_count: atomicResults.length - mismatches.length,
      failed_atomic_count: mismatches.length,
      unknown_id_count: mismatches.filter(item => [
        "REQUIREMENT_BINDINGS_MISSING",
        "REQUIREMENT_BINDING_MISSING",
        "ATOMIC_REQUIREMENT_BINDING_MISSING",
        "REQUIREMENT_BINDING_SECTION_MISMATCH"
      ].includes(item.decision_code)).length,
      missing_section_count: mismatches.filter(item => item.decision_code === "REQUIREMENT_BINDING_SECTION_MISSING").length
    }
  });
}

function observeAtomicBinding({ analysis, expectedParent, expectedAtomic, actualParent, actual, sections, returnedBindingsPresent }) {
  const base = {
    parent_requirement_id: String(expectedParent?.requirement_id || ""),
    atomic_requirement_id: String(expectedAtomic?.requirement_id || ""),
    requirement_label: boundedDiagnosticLabel(expectedAtomic?.label),
    canonical_section_id: String(expectedAtomic?.canonical_section_id || ""),
    binding_exists: Boolean(actual),
    section_exists: false,
    section_index: null,
    key_message_match: false,
    bullets_match: false,
    match_source: "none",
    normalized_requirement_terms: diagnosticTerms(expectedAtomic?.label),
    matched_terms: [],
    missing_terms: diagnosticTerms(expectedAtomic?.label),
    normalized_key_message_tokens: [],
    normalized_bullet_tokens: [],
    accepted: false,
    decision_code: ""
  };
  if (!returnedBindingsPresent) return Object.freeze({ ...base, decision_code: "REQUIREMENT_BINDINGS_MISSING" });
  if (!actualParent) return Object.freeze({ ...base, decision_code: "REQUIREMENT_BINDING_MISSING" });
  if (!actual) return Object.freeze({ ...base, decision_code: "ATOMIC_REQUIREMENT_BINDING_MISSING" });
  if (actual.canonical_section_id !== expectedAtomic.canonical_section_id) {
    return Object.freeze({ ...base, decision_code: "REQUIREMENT_BINDING_SECTION_MISMATCH" });
  }
  const section = sections.get(actual.canonical_section_id);
  if (!section) return Object.freeze({ ...base, decision_code: "REQUIREMENT_BINDING_SECTION_MISSING" });
  const contentEvidence = atomicBusinessContentEvidence(
    expectedAtomic.label,
    section,
    actual.canonical_section_id,
    expectedAtomic.semantic_contract
  );
  const accepted = contentEvidence.combined_match === true;
  return Object.freeze({
    ...base,
    section_exists: true,
    section_index: sectionIndex(analysis.sections, actual.canonical_section_id),
    key_message_match: contentEvidence.key_message_match,
    bullets_match: contentEvidence.bullets_match,
    match_source: contentEvidence.match_source,
    normalized_requirement_terms: contentEvidence.requirement_terms,
    matched_terms: contentEvidence.matched_terms,
    missing_terms: contentEvidence.missing_terms,
    normalized_key_message_tokens: contentEvidence.key_message_tokens,
    normalized_bullet_tokens: contentEvidence.bullet_tokens,
    accepted,
    decision_code: accepted ? "ACCEPTED" : "REQUIREMENT_BINDING_CONTENT_MISSING"
  });
}

function compatibilityFailureView(value) {
  return {
    parent_requirement_id: value.parent_requirement_id,
    atomic_requirement_id: value.atomic_requirement_id,
    canonical_section_id: value.canonical_section_id,
    binding_exists: value.binding_exists,
    section_exists: value.section_exists,
    section_index: value.section_index,
    key_message_match: value.key_message_match,
    bullets_match: value.bullets_match,
    match_source: value.match_source,
    normalized_requirement_terms: value.normalized_requirement_terms,
    matched_terms: value.matched_terms,
    missing_terms: value.missing_terms,
    normalized_key_message_tokens: value.normalized_key_message_tokens,
    normalized_bullet_tokens: value.normalized_bullet_tokens
  };
}

function validBindingResult(diagnostics, contentDiagnostics) {
  return { valid: true, reason: null, diagnostics, content_diagnostics: contentDiagnostics };
}

function invalid(reason, diagnostics, requirementId, contentDiagnostics) {
  return {
    valid: false,
    reason,
    diagnostics: [...diagnostics, { requirement_id: requirementId, accepted: false, reason }],
    content_diagnostics: contentDiagnostics
  };
}

function atomicBusinessContentPresent(label, section = {}, canonicalSectionId = "") {
  return atomicBusinessContentEvidence(label, section, canonicalSectionId).combined_match;
}

function atomicBusinessContentEvidence(label, section = {}, canonicalSectionId = "", semanticContract = null) {
  const patterns = businessPatterns(label);
  const keyMessage = String(section.key_message || "");
  const bulletBlocks = Array.isArray(section.bullets) ? section.bullets.map(item => String(item || "")) : [];
  const bullets = bulletBlocks.join("\n");
  const text = `${section.key_message || ""}\n${(section.bullets || []).join("\n")}`;
  const semanticMatcher = semanticMatcherForAtomic(label, canonicalSectionId);
  const contractEvidence = semanticContractContentEvidence(semanticContract, section);
  const combinedMatches = patterns.map(pattern => patternMatches(pattern, text));
  const keyMatches = patterns.map(pattern => patternMatches(pattern, keyMessage));
  const bulletMatches = patterns.map(pattern => patternMatches(pattern, bullets));
  const orderedPath = String(label || "") === "下一步事项" && canonicalSectionId === "plan"
    ? {
      key_message: findOrderedPathInSingleBlock([keyMessage]).matched,
      bullets: findOrderedPathInSingleBlock(bulletBlocks).matched
    }
    : { key_message: false, bullets: false };
  const literalCombinedMatch = combinedMatches.every(Boolean);
  const literalKeyMessageMatch = keyMatches.every(Boolean);
  const literalBulletsMatch = bulletMatches.every(Boolean);
  const semanticCombinedMatch = semanticMatcher ? [keyMessage, ...bulletBlocks].some(block => semanticMatcher(block)) : false;
  const semanticKeyMessageMatch = semanticMatcher ? semanticMatcher(keyMessage) : false;
  const semanticBulletsMatch = semanticMatcher ? bulletBlocks.some(block => semanticMatcher(block)) : false;
  const contractApplies = contractEvidence.applicable && !semanticMatcher;
  const combinedMatch = contractApplies
    ? contractEvidence.combined_match
    : semanticMatcher
      ? semanticCombinedMatch
      : literalCombinedMatch || orderedPath.key_message || orderedPath.bullets;
  const keyMessageMatch = contractApplies
    ? contractEvidence.key_message_match
    : semanticMatcher
      ? semanticKeyMessageMatch
      : literalKeyMessageMatch || orderedPath.key_message;
  const bulletsMatch = contractApplies
    ? contractEvidence.bullets_match
    : semanticMatcher
      ? semanticBulletsMatch
      : literalBulletsMatch || orderedPath.bullets;
  const requirementTerms = diagnosticTerms(label);
  const matchedTerms = requirementTerms.filter((term, index) => combinedMatches[index] || (combinedMatch && index >= combinedMatches.length));
  return {
    combined_match: combinedMatch,
    key_message_match: keyMessageMatch,
    bullets_match: bulletsMatch,
    match_source: contractApplies && combinedMatch
      ? keyMessageMatch ? "key_message_semantic_contract" : "bullets_semantic_contract"
      : semanticMatcher && combinedMatch
      ? keyMessageMatch ? "key_message_semantic" : bulletsMatch ? "bullets_semantic" : "combined_semantic"
      : orderedPath.key_message || orderedPath.bullets
        ? "ordered_path_same_block"
        : keyMessageMatch ? "key_message" : bulletsMatch ? "bullets" : combinedMatch ? "combined" : "none",
    requirement_terms: requirementTerms,
    matched_terms: combinedMatch ? boundedTerms(matchedTerms.length ? matchedTerms : requirementTerms) : boundedTerms(matchedTerms),
    missing_terms: combinedMatch ? [] : boundedTerms(requirementTerms.filter((term, index) => !combinedMatches[index] || index >= combinedMatches.length)),
    key_message_tokens: diagnosticTextTokens(keyMessage),
    bullet_tokens: diagnosticTextTokens(bullets)
  };
}

function semanticMatcherForAtomic(label, canonicalSectionId = "") {
  const text = String(label || "");
  if (text === "目标用户") return hasExplicitTargetAudience;
  if (text === "活动合作") return hasActivityPartnership;
  if (text === "责任主体或合作对象" && canonicalSectionId === "closing") return hasClosingResponsibility;
  if (/合作价值/.test(text)) return hasConcreteCooperationValue;
  if (/专业直驱模拟器/.test(text) && /沉浸式显示设备/.test(text)) return hasControlledEquipmentRelation;
  if (text === "明确动作") return hasConcreteNextAction;
  return null;
}

function hasClosingResponsibility(value = "") {
  const text = String(value || "").normalize("NFKC").replace(/\s+/g, "");
  return hasResponsibleEntity(text) || /责任主体|合作对象|负责方|对接方|执行方/.test(text);
}

function bindingContentDiagnostics({ decisionCode = "", contentMismatchCount = 0, firstFailedBinding = null, atomicResults = [], mismatches = [], summary = {} } = {}) {
  return Object.freeze({
    decision_code: String(decisionCode || ""),
    content_mismatch_count: Number(contentMismatchCount) || 0,
    first_failed_binding: firstFailedBinding ? Object.freeze(firstFailedBinding) : null,
    mismatch_summary: Object.freeze({
      checked_atomic_count: Number(summary.checked_atomic_count) || 0,
      passed_atomic_count: Number(summary.passed_atomic_count) || 0,
      failed_atomic_count: Number(summary.failed_atomic_count) || 0,
      unknown_id_count: Number(summary.unknown_id_count) || 0,
      missing_section_count: Number(summary.missing_section_count) || 0
    }),
    atomic_results: Object.freeze(atomicResults.map(item => Object.freeze(item))),
    mismatches: Object.freeze(mismatches.map(item => Object.freeze(item)))
  });
}

function boundedDiagnosticLabel(value) {
  return String(value || "").normalize("NFKC").trim().slice(0, 32);
}

function sectionIndex(sections, sectionId) {
  return Math.max(0, (Array.isArray(sections) ? sections : []).findIndex(section => section?.section_id === sectionId));
}

function patternMatches(pattern, text) {
  pattern.lastIndex = 0;
  return pattern.test(text);
}

function diagnosticTerms(label) {
  return boundedTerms(String(label || "")
    .normalize("NFKC")
    .split(/[、，,；;。\s]+/)
    .map(value => value.trim())
    .filter(value => value.length >= 2));
}

function diagnosticTextTokens(value) {
  const normalized = String(value || "")
    .normalize("NFKC")
    .replace(/[。！？!?；;，,、\n\r\t]/g, " ")
    .replace(/(?:项目|本页|方案|采用|支持|提供|通过|实现|围绕|以及)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return boundedTerms(normalized.split(" ").flatMap(segment => segmentDiagnosticToken(segment)));
}

function segmentDiagnosticToken(segment) {
  const value = String(segment || "").trim();
  if (!value) return [];
  const chunks = [];
  for (let index = 0; index < value.length; index += 8) chunks.push(value.slice(index, index + 8));
  return chunks;
}

function boundedTerms(values) {
  const terms = [];
  for (const value of Array.isArray(values) ? values : []) {
    const term = String(value || "").trim().slice(0, MAX_DIAGNOSTIC_TOKEN_LENGTH);
    if (term && !terms.includes(term)) terms.push(term);
    if (terms.length >= MAX_DIAGNOSTIC_TOKENS) break;
  }
  return terms;
}

function businessPatterns(label = "") {
  const text = String(label || "");
  const known = [
    [/项目定位/, [/项目定位|项目角色|定位/]],
    [/目标用户/, [/目标用户|目标客户|受众/]],
    [/主要体验项目/, [/体验项目|驾驶体验|竞速/]],
    [/空间功能/, [/空间|功能区|接待区|展示区/]],
    [/运营内容/, [/运营|活动|服务/]],
    [/合作价值/, [/合作价值|价值/]],
    [/单人驾驶体验/, [/单人驾驶/]],
    [/多人竞速活动/, [/多人竞速/]],
    [/企业团建/, [/企业团建/]],
    [/青少年赛车启蒙/, [/青少年.*启蒙|赛车启蒙/]],
    [/专业直驱模拟器/, [/专业直驱模拟器/]],
    [/沉浸式显示设备/, [/沉浸式显示设备/]],
    [/场地合作/, [/场地合作/]],
    [/活动合作/, [/活动合作/]],
    [/联合运营/, [/联合运营/]],
    [/初步洽谈/, [/初步洽谈/]],
    [/场地考察/, [/场地考察/]],
    [/资料补充/, [/资料补充/]],
    [/方案评估/, [/方案评估/]],
    [/合作确认/, [/合作确认/]],
    [/明确动作/, [/(?:安排|开展|确认|提交|推进).{0,16}(?:行动|洽谈|考察|资料|评估|确认)/]],
    [/责任主体或合作对象/, [/(?:双方|合作方|运营方|项目方|负责人|合作对象)/]],
    [/下一步事项/, [/下一步|后续/]]
  ];
  const matched = known.find(([pattern]) => pattern.test(text));
  if (matched) return matched[1];
  const terms = text.split(/[、，,和与及\s]+/).map(item => item.trim()).filter(item => item.length >= 2);
  return terms.length ? terms.map(term => new RegExp(escapeRegExp(term))) : [new RegExp(escapeRegExp(text))];
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveCanonicalSectionId(label, legacySectionId, allowed) {
  const candidates = SECTION_CANDIDATES.find(([pattern]) => pattern.test(label))?.[1] || [];
  return [legacySectionId, ...candidates]
    .find(sectionId => allowed.has(sectionId))
    || [...allowed].find(sectionId => sectionId !== "cover" && sectionId !== "closing")
    || [...allowed][0]
    || "";
}
