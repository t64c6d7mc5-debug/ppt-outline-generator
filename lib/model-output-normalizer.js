const MAX_INPUT_CHARS = 512_000;
const MAX_ARRAY_ITEMS = 40;
const MAX_STRING_CHARS = 4_000;
const MAX_WRAPPER_DEPTH = 5;
const MAX_SAFE_NODES = 10_000;

const PROTOTYPE_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const WRAPPER_KEYS = new Set([
  "response", "result", "data", "payload", "output", "content", "presentation",
  "deck", "plan", "planning", "analysis", "outline"
].map(normalizeKey));

const TOP_LEVEL_FIELDS = Object.freeze({
  title: ["deck_title", "presentation_title", "ppt_title"],
  subtitle: ["sub_title", "deck_subtitle"],
  executive_summary: ["executiveSummary", "summary", "overview", "requirement_summary"],
  sections: ["slides", "pages", "outline"],
  global_visual_style: ["globalVisualStyle", "visual_style", "visualStyle", "style"],
  material_gaps: ["materialGaps", "missing_materials", "missingMaterials", "gaps"]
});

const SECTION_FIELDS = Object.freeze({
  id: ["section_id", "sectionId", "slide_type", "slideType", "page_id", "pageId"],
  role: ["section_role", "sectionRole"],
  title: ["heading", "section_title", "sectionTitle", "slide_title", "slideTitle"],
  key_message: ["keyMessage", "core_message", "coreMessage", "key_takeaway", "keyTakeaway", "message", "conclusion"],
  bullets: ["bullet_points", "bulletPoints", "points", "content"],
  visual_suggestion: ["visualSuggestion", "visual_direction", "visualDirection", "visual", "layout"],
  speaker_notes: ["speakerNotes", "notes", "narration"]
});

/**
 * Normalize a local model response without evaluating, completing, or inventing
 * business facts. Any recovered key message is copied verbatim from supplied
 * content; safety and quality decisions remain downstream responsibilities.
 */
export function normalizeModelOutput(content, { allowedSections = [], pageCount } = {}) {
  if (content === null || content === undefined || (typeof content === "string" && !content.trim())) {
    return failure("EMPTY_MODEL_OUTPUT");
  }
  if (typeof content !== "string") return failure("UNSUPPORTED_MODEL_OUTPUT_TYPE");
  if (content.length > MAX_INPUT_CHARS) return failure("MODEL_OUTPUT_TOO_LARGE");

  const text = content.trim();
  const extracted = extractStructuredValue(text);
  let source = extracted?.value;
  const warnings = [];

  if (extracted?.kind === "fenced") warnings.push("FENCED_JSON_EXTRACTED");
  if (extracted?.kind === "embedded") warnings.push("EMBEDDED_JSON_EXTRACTED");

  if (source === undefined) {
    source = parseExplicitPlainText(text);
    if (!source) return failure("UNRELIABLE_MODEL_OUTPUT");
    warnings.push("PLAIN_TEXT_PARSED");
  }

  if (!isSafeTree(source)) return failure("UNSAFE_MODEL_OUTPUT", warnings);

  const located = locateContractRoot(source);
  if (!located) return failure("MISSING_SECTIONS", warnings);
  if (!isSafeTree(located.value)) return failure("UNSAFE_MODEL_OUTPUT", warnings);
  if (located.depth > 0) warnings.push("WRAPPER_UNWRAPPED");

  const normalized = normalizeContract(located.value, { allowedSections, pageCount, warnings });
  if (!normalized.ok) return failure(normalized.reason_code, unique(warnings));

  const contract = normalized.contract;
  const resultWarnings = unique(warnings);
  return {
    ok: true,
    contract,
    planningAnalysis: toPlanningAnalysis(contract, resultWarnings),
    warnings: resultWarnings,
    reason_code: ""
  };
}

function normalizeContract(value, { allowedSections, pageCount, warnings }) {
  const title = scalarField(value, "title", TOP_LEVEL_FIELDS.title, warnings);
  const subtitle = scalarField(value, "subtitle", TOP_LEVEL_FIELDS.subtitle, warnings);
  const executiveSummaryField = aliasedField(value, "executive_summary", TOP_LEVEL_FIELDS.executive_summary);
  recordAlias(executiveSummaryField, warnings);
  const executiveSummary = cleanStringArray(executiveSummaryField.value, {
    maxItems: 12,
    maxChars: 800,
    splitString: true
  });

  const sectionsField = aliasedField(value, "sections", TOP_LEVEL_FIELDS.sections);
  recordAlias(sectionsField, warnings);
  if (!Array.isArray(sectionsField.value) || sectionsField.value.length === 0) {
    return { ok: false, reason_code: "MISSING_SECTIONS" };
  }

  const sectionResult = normalizeSections(sectionsField.value, allowedSections, warnings);
  if (!sectionResult.ok) return sectionResult;

  const requestedPageCount = normalizePageCount(pageCount);
  if (requestedPageCount !== null && sectionResult.sections.length !== requestedPageCount) {
    warnings.push("PAGE_COUNT_MISMATCH");
  }

  const visualStyleField = aliasedField(value, "global_visual_style", TOP_LEVEL_FIELDS.global_visual_style);
  recordAlias(visualStyleField, warnings);
  const materialGapsField = aliasedField(value, "material_gaps", TOP_LEVEL_FIELDS.material_gaps);
  recordAlias(materialGapsField, warnings);

  return {
    ok: true,
    contract: {
      title,
      subtitle,
      executive_summary: executiveSummary,
      sections: sectionResult.sections,
      global_visual_style: normalizeVisualStyle(visualStyleField.value),
      material_gaps: cleanMaterialGaps(materialGapsField.value)
    }
  };
}

function normalizeSections(items, allowedSections, warnings) {
  const allowedLookup = buildAllowedLookup(allowedSections);
  const constrained = allowedLookup.size > 0;
  const sections = [];
  const seenIds = new Set();

  for (const item of items.slice(0, MAX_ARRAY_ITEMS)) {
    if (!isPlainObject(item)) return { ok: false, reason_code: "INVALID_SECTION_SHAPE" };

    const idField = aliasedField(item, "id", SECTION_FIELDS.id);
    const roleField = aliasedField(item, "role", SECTION_FIELDS.role);
    const titleField = aliasedField(item, "title", SECTION_FIELDS.title);
    const keyMessageField = aliasedField(item, "key_message", SECTION_FIELDS.key_message);
    const bulletsField = aliasedField(item, "bullets", SECTION_FIELDS.bullets);
    const visualField = aliasedField(item, "visual_suggestion", SECTION_FIELDS.visual_suggestion);
    const notesField = aliasedField(item, "speaker_notes", SECTION_FIELDS.speaker_notes);
    [idField, roleField, titleField, keyMessageField, bulletsField, visualField, notesField]
      .forEach(field => recordAlias(field, warnings));

    const rawId = cleanString(idField.value, 120);
    if (!rawId) return { ok: false, reason_code: "MISSING_SECTION_ID" };
    const id = constrained ? allowedLookup.get(rawId.toLocaleLowerCase("en-US")) : rawId;
    if (!id) return { ok: false, reason_code: "UNSUPPORTED_SECTION_ID" };
    if (id !== rawId) warnings.push("SECTION_ID_CASE_NORMALIZED");
    if (seenIds.has(id)) return { ok: false, reason_code: "DUPLICATE_SECTION_ID" };
    seenIds.add(id);

    const bullets = cleanStringArray(bulletsField.value, {
      maxItems: 12,
      maxChars: 1_000,
      splitString: true
    });
    if (typeof bulletsField.value === "string") warnings.push("BULLETS_STRING_NORMALIZED");

    let keyMessage = cleanString(keyMessageField.value, 1_200);
    if (!keyMessage && bullets.length) {
      keyMessage = bullets[0];
      warnings.push("KEY_MESSAGE_DERIVED_FROM_BULLET");
    }
    if (!keyMessage && bullets.length === 0) {
      return { ok: false, reason_code: "UNUSABLE_SECTION_CONTENT" };
    }

    const rawRole = cleanString(roleField.value, 80);
    const role = rawRole.toLocaleLowerCase("en-US");
    if (rawRole && rawRole !== role) warnings.push("ROLE_CASE_NORMALIZED");

    sections.push({
      id,
      role,
      title: cleanString(titleField.value, 300),
      key_message: keyMessage,
      bullets,
      visual_suggestion: cleanString(visualField.value, 1_200),
      speaker_notes: cleanString(notesField.value, 2_000)
    });
  }

  if (sections.length !== items.length) return { ok: false, reason_code: "TOO_MANY_SECTIONS" };
  return { ok: true, sections };
}

function toPlanningAnalysis(contract, warnings) {
  return {
    schema_version: 1,
    requirement_summary: contract.executive_summary.join("\n"),
    recommended_page_count: contract.sections.length,
    sections: contract.sections.map(section => ({
      section_id: section.id,
      title: section.title,
      role: section.role,
      objective: "",
      key_message: section.key_message,
      bullets: [...section.bullets],
      visual_direction: section.visual_suggestion,
      evidence_status: "",
      speaker_notes: section.speaker_notes,
      content_complete: Boolean(section.key_message || section.bullets.length || section.visual_suggestion)
    })),
    ambiguities: [...contract.material_gaps],
    warnings: [...warnings]
  };
}

function extractStructuredValue(text) {
  const strict = tryParseJson(text);
  if (strict !== undefined) return { value: strict, kind: "strict" };

  const fencePattern = /```(?:json)?\s*([\s\S]*?)```/gi;
  for (const match of text.matchAll(fencePattern)) {
    const fenced = tryParseJson(match[1].trim());
    if (fenced !== undefined) return { value: fenced, kind: "fenced" };
  }

  for (const candidate of balancedTopLevelObjects(text)) {
    const embedded = tryParseJson(candidate);
    if (embedded !== undefined) return { value: embedded, kind: "embedded" };
  }
  return null;
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function balancedTopLevelObjects(source) {
  const candidates = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
    }
    else if (character === "}") {
      if (depth === 0) continue;
      depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push(source.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return candidates;
}

function locateContractRoot(source) {
  const queue = [{ value: source, depth: 0 }];
  const seen = new Set();
  while (queue.length) {
    const current = queue.shift();
    if (current.depth > MAX_WRAPPER_DEPTH || seen.has(current.value)) continue;
    if (current.value && typeof current.value === "object") seen.add(current.value);

    if (Array.isArray(current.value)) return { value: { sections: current.value }, depth: current.depth };
    if (!isPlainObject(current.value)) continue;

    const sections = aliasedField(current.value, "sections", TOP_LEVEL_FIELDS.sections);
    if (Array.isArray(sections.value)) return current;
    if (current.depth === MAX_WRAPPER_DEPTH) continue;

    for (const [key, value] of Object.entries(current.value)) {
      if (!WRAPPER_KEYS.has(normalizeKey(key))) continue;
      if (value && (Array.isArray(value) || isPlainObject(value))) {
        queue.push({ value, depth: current.depth + 1 });
      } else if (typeof value === "string") {
        const parsed = tryParseJson(value.trim());
        if (parsed && (Array.isArray(parsed) || isPlainObject(parsed))) {
          queue.push({ value: parsed, depth: current.depth + 1 });
        }
      }
    }
  }
  return null;
}

function parseExplicitPlainText(text) {
  const root = {
    title: "",
    subtitle: "",
    executive_summary: [],
    sections: [],
    global_visual_style: {},
    material_gaps: []
  };
  let currentSection = null;
  let unmappedLineCount = 0;

  for (const rawLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const heading = parseExplicitSectionHeading(line);
    if (heading) {
      currentSection = {
        id: heading.id,
        role: "",
        title: heading.title,
        key_message: "",
        bullets: [],
        visual_suggestion: "",
        speaker_notes: ""
      };
      root.sections.push(currentSection);
      continue;
    }

    const labelled = parseLabelledLine(line);
    if (!currentSection && labelled) {
      if (["title", "标题", "主题"].includes(labelled.label)) root.title = labelled.value;
      else if (["subtitle", "sub_title", "副标题"].includes(labelled.label)) root.subtitle = labelled.value;
      else if (["summary", "executive_summary", "摘要", "执行摘要"].includes(labelled.label)) {
        root.executive_summary.push(labelled.value);
      } else if (["material_gaps", "missing_materials", "资料缺口", "材料缺口"].includes(labelled.label)) {
        root.material_gaps.push(labelled.value);
      } else unmappedLineCount += 1;
      continue;
    }

    if (currentSection && labelled) {
      if (["role", "角色", "叙事角色"].includes(labelled.label)) currentSection.role = labelled.value;
      else if (["key_message", "keymessage", "核心信息", "关键信息", "核心结论"].includes(labelled.label)) {
        currentSection.key_message = labelled.value;
      } else if (["visual_suggestion", "visual_direction", "视觉建议", "视觉方向", "画面建议"].includes(labelled.label)) {
        currentSection.visual_suggestion = labelled.value;
      } else if (["speaker_notes", "speakernotes", "演讲备注", "备注"].includes(labelled.label)) {
        currentSection.speaker_notes = labelled.value;
      } else if (["bullets", "bullet_points", "要点", "正文"].includes(labelled.label)) {
        currentSection.bullets.push(...cleanStringArray(labelled.value, { maxItems: 12, maxChars: 1_000, splitString: true }));
      } else unmappedLineCount += 1;
      continue;
    }

    const bullet = currentSection ? parseBulletLine(line) : "";
    if (bullet) currentSection.bullets.push(bullet);
    else unmappedLineCount += 1;
  }

  if (!root.sections.length || unmappedLineCount > 0) return null;
  return root;
}

function parseExplicitSectionHeading(line) {
  const withoutMarkdown = line.replace(/^#{1,6}\s*/, "").trim();
  const bracketed = withoutMarkdown.match(/^(?:第?\s*\d+\s*[页章]?\s*[.、:：-]?\s*)?\[([A-Za-z][A-Za-z0-9_-]*)\]\s*(?:[|｜:：-]\s*)?(.*)$/);
  if (bracketed) return { id: bracketed[1], title: cleanString(bracketed[2], 300) };
  const delimited = withoutMarkdown.match(/^(?:第?\s*\d+\s*[页章]?\s*[.、:：-]?\s*)?([A-Za-z][A-Za-z0-9_-]*)\s*[|｜:：-]\s*(.+)$/);
  if (delimited) return { id: delimited[1], title: cleanString(delimited[2], 300) };
  return null;
}

function parseLabelledLine(line) {
  const match = line.match(/^([^:：]{1,40})[:：]\s*(.*)$/);
  if (!match) return null;
  return {
    label: normalizeLabel(match[1]),
    value: cleanString(match[2], MAX_STRING_CHARS)
  };
}

function parseBulletLine(line) {
  const match = line.match(/^(?:[-*•·]\s*|\d+[.)、]\s*)(.+)$/);
  return match ? cleanString(match[1], 1_000) : "";
}

function aliasedField(object, canonical, aliases = []) {
  if (!isPlainObject(object)) return { found: false, key: "", value: undefined, aliased: false };
  const candidates = [canonical, ...aliases];
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeKey(candidate);
    for (const key of Object.keys(object)) {
      if (normalizeKey(key) !== normalizedCandidate) continue;
      return {
        found: true,
        key,
        value: object[key],
        aliased: key !== canonical
      };
    }
  }
  return { found: false, key: "", value: undefined, aliased: false };
}

function scalarField(object, canonical, aliases, warnings) {
  const field = aliasedField(object, canonical, aliases);
  recordAlias(field, warnings);
  return cleanString(field.value, MAX_STRING_CHARS);
}

function recordAlias(field, warnings) {
  if (field?.aliased) warnings.push("FIELD_ALIASES_NORMALIZED");
}

function cleanStringArray(value, { maxItems, maxChars, splitString }) {
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === "string" && splitString
      ? value.replace(/\r\n?/g, "\n").split(/\n+/)
      : value === undefined || value === null
        ? []
        : [value];
  const cleaned = [];
  const seen = new Set();
  for (const rawItem of rawItems.slice(0, maxItems * 2)) {
    const item = cleanString(rawItem, maxChars).replace(/^(?:[-*•·]\s*|\d+[.)、]\s*)/, "").trim();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    cleaned.push(item);
    if (cleaned.length >= maxItems) break;
  }
  return cleaned;
}

function cleanMaterialGaps(value) {
  if (Array.isArray(value)) {
    const mapped = value.map(item => {
      if (!isPlainObject(item)) return item;
      const field = aliasedField(item, "description", ["gap", "material", "item", "name", "reason"]);
      return field.value;
    });
    return cleanStringArray(mapped, { maxItems: 20, maxChars: 800, splitString: false });
  }
  return cleanStringArray(value, { maxItems: 20, maxChars: 800, splitString: true });
}

function normalizeVisualStyle(value) {
  if (isPlainObject(value)) return cloneSafeValue(value, 0);
  const description = cleanString(value, 1_000);
  return description ? { description } : {};
}

function cloneSafeValue(value, depth) {
  if (depth > 6) return null;
  if (typeof value === "string") return cleanString(value, MAX_STRING_CHARS);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY_ITEMS).map(item => cloneSafeValue(item, depth + 1));
  if (!isPlainObject(value)) return null;
  const copy = {};
  for (const [key, item] of Object.entries(value).slice(0, MAX_ARRAY_ITEMS)) {
    if (isPrototypeKey(key)) continue;
    copy[key] = cloneSafeValue(item, depth + 1);
  }
  return copy;
}

function isSafeTree(root) {
  const stack = [root];
  let visited = 0;
  while (stack.length) {
    const value = stack.pop();
    visited += 1;
    if (visited > MAX_SAFE_NODES) return false;
    if (Array.isArray(value)) {
      for (const item of value) stack.push(item);
      continue;
    }
    if (value === null || typeof value !== "object") continue;
    if (!isPlainObject(value)) return false;
    for (const key of Object.keys(value)) {
      if (isPrototypeKey(key)) return false;
      stack.push(value[key]);
    }
  }
  return true;
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function buildAllowedLookup(allowedSections) {
  const lookup = new Map();
  if (!Array.isArray(allowedSections)) return lookup;
  for (const value of allowedSections) {
    const id = cleanString(value, 120);
    if (id) lookup.set(id.toLocaleLowerCase("en-US"), id);
  }
  return lookup;
}

function normalizePageCount(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function cleanString(value, maxChars) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

function normalizeKey(value) {
  return String(value || "").toLocaleLowerCase("en-US").replace(/[^a-z0-9\u4e00-\u9fff]/g, "");
}

function isPrototypeKey(value) {
  return PROTOTYPE_KEYS.has(String(value || "").toLocaleLowerCase("en-US"));
}

function normalizeLabel(value) {
  const label = String(value || "").trim();
  return /[\u4e00-\u9fff]/.test(label)
    ? label.replace(/\s+/g, "")
    : label.toLocaleLowerCase("en-US").replace(/[\s-]+/g, "_");
}

function unique(values) {
  return [...new Set(values)];
}

function failure(reasonCode, warnings = []) {
  return {
    ok: false,
    contract: null,
    planningAnalysis: null,
    warnings: unique(warnings),
    reason_code: reasonCode
  };
}
