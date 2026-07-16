const SUPPORTED_POLICIES = new Set([
  "exact_source_required",
  "safe_rephrase_allowed",
  "narrative_only"
]);

const SUPPORTED_CONTRACT_TYPES = new Set([
  "objects_relation",
  "actor_action_object",
  "actor_action_value",
  "ordered_steps",
  "responsibility_target_next_action",
  "exact_confirmed_fact"
]);

const INSTRUCTION_SHELL_PATTERN = /(?:必须|不得|禁止|请(?:说明|介绍|表达|包含)|要求(?:说明|介绍|表达|包含)|需要(?:说明|介绍|表达|包含))/;

export function compileSemanticObligation({
  fulfillmentPolicy,
  semanticContract,
  sourceEvidence = [],
  sectionContext = {},
  budget = {}
} = {}) {
  const policy = String(fulfillmentPolicy || "");
  const contract = semanticContract && typeof semanticContract === "object" ? semanticContract : null;
  if (!SUPPORTED_POLICIES.has(policy) || !validContract(contract)) {
    return unresolved("SEMANTIC_OBLIGATION_CONTRACT_INVALID");
  }
  if (policy === "narrative_only") return unresolved("NARRATIVE_ONLY_NOT_FULFILLABLE");

  const values = normalizeComponentValues(contract.component_values);
  if (containsInstructionShell(values)) return unresolved("INSTRUCTION_SHELL_COMPONENT");

  const compiled = contract.type === "exact_confirmed_fact"
    ? compileExactFact(values, sourceEvidence)
    : compileStructuredContract(contract.type, values);
  if (compiled.status !== "compiled") return compiled;

  const maxChars = positiveInteger(budget.max_chars, 88);
  if (normalizedLength(compiled.text) > maxChars) {
    return unresolved("SEMANTIC_OBLIGATION_BUDGET_EXCEEDED");
  }

  return Object.freeze({
    ...compiled,
    contentBlock: "single_bullet",
    consumedComponents: Object.freeze(Object.keys(values)),
    sectionId: String(sectionContext?.section_id || "")
  });
}

function compileStructuredContract(type, values) {
  if (type === "objects_relation") {
    const subject = scalar(values.subject);
    const objects = list(values.objects);
    const relation = first(values.relations);
    const outcome = scalar(values.outcome);
    if (!subject || !objects.length || !relation) return unresolved("SEMANTIC_COMPONENTS_MISSING");
    return compiled(`${subject}${relation}${joinList(objects)}${outcome ? `，${outcome}` : ""}。`);
  }

  if (type === "actor_action_object") {
    const actor = renderActor(first(values.actors));
    const action = first(values.actions);
    const objects = list(values.objects);
    if (!actor || !action || !objects.length) return unresolved("SEMANTIC_COMPONENTS_MISSING");
    return compiled(`${actor}${action}${joinList(objects)}。`);
  }

  if (type === "actor_action_value") {
    const actor = renderActor(first(values.actors));
    const action = first(values.actions);
    const categories = list(values.measurable_value_categories);
    if (!actor || !action || !categories.length) return unresolved("SEMANTIC_COMPONENTS_MISSING");
    return compiled(`${actor}${action}，可从${joinList(categories)}等维度评估潜在合作价值，具体结果待确认。`);
  }

  if (type === "ordered_steps") {
    const steps = list(values.ordered_steps);
    if (steps.length < 2) return unresolved("SEMANTIC_COMPONENTS_MISSING");
    return compiled(`下一步依次推进${steps.join("、")}。`);
  }

  if (type === "responsibility_target_next_action") {
    const responsibilities = list(values.responsibilities);
    const targets = list(values.targets);
    const nextAction = first(values.next_actions);
    if (!responsibilities.length || !targets.length || !nextAction) return unresolved("SEMANTIC_COMPONENTS_MISSING");
    if (values.identities_confirmed === true) {
      return compiled(`${joinList(responsibilities)}负责对接${joinList(targets)}，并${nextAction}。`);
    }
    return compiled(`具体${joinList(responsibilities)}、${joinList(targets)}及对接分工待双方确认，确认后${nextAction}。`);
  }

  return unresolved("SEMANTIC_CONTRACT_UNSUPPORTED");
}

function compileExactFact(values, sourceEvidence) {
  const sourceIds = new Set(list(values.source_ids));
  const source = (Array.isArray(sourceEvidence) ? sourceEvidence : []).find(item => {
    const sourceId = String(item?.source_id || "");
    const traceable = item?.polarity !== "negative"
      && ["explicit_confirmed_fact", "user_material_fact"].includes(String(item?.assertion_type || ""));
    return sourceIds.has(sourceId) && traceable && String(item?.excerpt || "").trim();
  });
  if (!source) return unresolved("EXACT_SOURCE_NOT_FOUND");
  const text = String(source.excerpt || "").replace(/\s+/g, " ").trim();
  return Object.freeze({
    status: "compiled",
    text,
    sourceType: "confirmed_fact",
    sourceRefs: Object.freeze([Object.freeze({
      source_id: String(source.source_id || ""),
      ...(source.fragment_id ? { fragment_id: String(source.fragment_id) } : {})
    })]),
    reasonCode: ""
  });
}

function validContract(contract) {
  return contract?.version === 1
    && SUPPORTED_CONTRACT_TYPES.has(contract?.type)
    && contract?.aggregation === "all_of"
    && contract?.same_block === true
    && Array.isArray(contract?.required_components)
    && contract.required_components.length > 0
    && contract?.component_values
    && typeof contract.component_values === "object";
}

function normalizeComponentValues(values) {
  return Object.fromEntries(Object.entries(values || {}).map(([key, value]) => {
    if (Array.isArray(value)) return [key, value.map(normalizeText).filter(Boolean)];
    if (typeof value === "boolean") return [key, value];
    return [key, normalizeText(value)];
  }));
}

function containsInstructionShell(values) {
  return Object.values(values).flatMap(value => Array.isArray(value) ? value : [value])
    .some(value => typeof value === "string" && INSTRUCTION_SHELL_PATTERN.test(value));
}

function normalizeText(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function normalizedLength(value) {
  return Array.from(normalizeText(value).replace(/\s+/g, "")).length;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function list(value) {
  return (Array.isArray(value) ? value : []).map(normalizeText).filter(Boolean);
}

function scalar(value) {
  return typeof value === "string" ? normalizeText(value) : "";
}

function first(value) {
  return list(value)[0] || "";
}

function renderActor(value) {
  const actor = normalizeText(value);
  return ["合作双方", "双方"].includes(actor) ? "合作方" : actor;
}

function joinList(values) {
  if (values.length <= 1) return values[0] || "";
  if (values.length === 2) return `${values[0]}与${values[1]}`;
  return `${values.slice(0, -1).join("、")}及${values.at(-1)}`;
}

function compiled(text) {
  return Object.freeze({
    status: "compiled",
    text,
    sourceType: "explicit_requirement",
    sourceRefs: Object.freeze([]),
    reasonCode: ""
  });
}

function unresolved(reasonCode) {
  return Object.freeze({
    status: "unresolved",
    text: "",
    contentBlock: "single_bullet",
    consumedComponents: Object.freeze([]),
    sourceType: "",
    sourceRefs: Object.freeze([]),
    reasonCode
  });
}
