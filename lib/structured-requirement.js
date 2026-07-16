const FIELD_ALIASES = {
  audience: ["汇报对象", "目标受众", "面向对象"],
  purpose: ["汇报目的", "演示目的", "使用目的"],
  requiredSections: ["PPT需要包含", "必须包含", "内容模块"],
  characteristics: ["品牌特点", "项目特点", "产品特点"],
  outputRequirements: ["要求", "输出要求"]
};

const FIELD_BY_ALIAS = new Map(Object.entries(FIELD_ALIASES).flatMap(([field, aliases]) => aliases.map(alias => [alias, field])));
const FIELD_HEADING_PATTERN = new RegExp(`^(${[...FIELD_BY_ALIAS.keys()].join("|")})\\s*[：:]\\s*(.*)$`);
export const MUST_INCLUDE_RULES_SCHEMA_VERSION = 1;

const REQUIRED_SECTION_RULES = [
  { pattern: /品牌定位|企业定位|项目定位|定位/, sectionId: "company_positioning", group: "positioning" },
  { pattern: /行业机会|市场机会|市场背景|行业背景|客户挑战|沟通挑战/, sectionId: "market_or_customer_challenge", group: "opportunity" },
  { pattern: /目标用户|目标客户|目标受众|用户画像|客户画像/, sectionId: "target_audience", group: "audience" },
  { pattern: /产品矩阵|产品组合|产品线|车型矩阵|产品类别/, sectionId: "product_portfolio", group: "portfolio" },
  { pattern: /核心技术|技术能力|核心能力|智能座舱|辅助驾驶|功能能力/, sectionId: "product_or_process_capability", group: "capability" },
  { pattern: /材料与工艺|材料|工艺优势|工艺能力|产品材料/, sectionId: "product_or_process_capability", group: "capability" },
  { pattern: /定制能力|定制方案|配置方式/, sectionId: "customization_capability", group: "customization" },
  { pattern: /应用场景|使用场景|典型场景/, sectionId: "application_scenarios", group: "scenario" },
  { pattern: /安全体系|质量体系|验证体系|电池安全|安全能力/, sectionId: "quality_or_validation", group: "safety" },
  { pattern: /补能服务|服务网络|售后网络|长期用户服务|用户服务/, sectionId: "delivery_and_collaboration", group: "service_delivery" },
  { pattern: /交付能力|交付内容|交付方式|交付协作/, sectionId: "delivery_and_collaboration", group: "service_delivery" },
  { pattern: /渠道合作价值|合作价值|客户价值|经销价值|渠道价值/, sectionId: "customer_value", group: "value" },
  { pattern: /合作支持|经销合作支持|渠道支持|销售支持/, sectionId: "delivery_and_collaboration", group: "support" },
  { pattern: /合作方式|合作模式|合作入口/, sectionId: "cooperation_next_step", group: "next_step" },
  { pattern: /未来规划|发展规划|合作下一步|下一步|合作路径/, sectionId: "cooperation_next_step", group: "next_step" },
  { pattern: /实施流程|上线流程|服务流程|推进流程/, sectionId: "service_process", group: "process" }
];

const ACTION_VERB = "(?:做(?:一份|一个|一套|份|个|套)|制作|生成|设计|出|弄)";
const INSTRUCTION_TITLE_PREFIX = new RegExp(`^(?:(?:请|麻烦)?(?:帮我|给我|我要|我想|想要|需要)?${ACTION_VERB}(?:一份|一个|一套|份|个|套)?|(?:请|麻烦)?${ACTION_VERB}(?:一份|一个|一套|份|个|套)|(?:请|麻烦)?(?:帮)?为(?:一家|一个|某个|这家|某)?)`);

export function parseStructuredRequirement(requirement = "") {
  const normalized = normalizeMultiline(requirement);
  const fields = Object.fromEntries(Object.keys(FIELD_ALIASES).map(field => [field, ""]));
  const firstTopicLine = firstNonFieldLine(normalized);
  let currentField = "";

  for (const rawLine of normalized.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const heading = line.match(FIELD_HEADING_PATTERN);
    if (heading) {
      currentField = FIELD_BY_ALIAS.get(heading[1]) || "";
      appendField(fields, currentField, heading[2]);
      continue;
    }
    if (currentField) appendField(fields, currentField, line);
  }

  const requiredItems = splitList(fields.requiredSections);
  const sectionPlan = buildRequiredSectionPlan(requiredItems);
  return Object.freeze({
    firstTopicLine,
    fields: Object.freeze(fields),
    explicitAudience: cleanSentence(fields.audience),
    explicitPurpose: cleanSentence(fields.purpose),
    requiredSections: Object.freeze(requiredItems),
    sectionPlan: Object.freeze(sectionPlan.map(Object.freeze)),
    topic: cleanInstructionTopic(firstTopicLine || normalized)
  });
}

export function cleanInstructionTopic(value = "") {
  let topic = cleanSentence(value);
  for (let index = 0; index < 6; index += 1) {
    const next = topic
      .replace(INSTRUCTION_TITLE_PREFIX, "")
      .replace(/^(关于|围绕)\s*/, "")
      .trim();
    if (next === topic) break;
    topic = next;
  }
  topic = topic
    .replace(/(?:\d{1,2}|三十|二十|十九|十八|十七|十六|十五|十四|十三|十二|十一|十|九|八|七|六|五|四|三)\s*页(?:左右)?/g, "")
    .replace(/(?:PPT|ppt|幻灯片|演示文稿)/g, "")
    .replace(/(?:做(?:一份|一个|一套|份|个|套)|制作|生成|设计)(?:一份|一个|一套|份|个|套)?/g, "")
    .replace(/^(?:一家|一个|某个|某|这家)/, "")
    .replace(/[，,。；;]\s*(用于|给|供).*/g, "")
    .replace(/[，,。；;：:]\s*[^，,。；;]{0,14}风格.*$/g, "")
    .replace(/[，,。；;：:]\s*(风格|明天|今晚|截止).*$/g, "")
    .replace(/[，,。；;：:\s]+$/g, "")
    .trim();
  if (/品牌介绍$/.test(topic) && /合作|经销|渠道/.test(value)) topic = topic.replace(/品牌介绍$/, "品牌合作介绍");
  topic = topic
    .replace(/制作品牌介绍/g, "品牌介绍")
    .replace(/生成品牌介绍/g, "品牌介绍")
    .replace(/品牌品牌介绍/g, "品牌介绍")
    .replace(/品牌介绍介绍/g, "品牌介绍");
  if (/^面向[^的]{2,24}的/.test(topic)) {
    const object = topic.replace(/^面向([^的]{2,24})的/, "");
    if (object && /品牌|产品|企业|项目|专业|方案/.test(object)) {
      topic = /介绍$/.test(object) ? object : `${object}${/合作|招商/.test(value) ? "合作" : ""}介绍`;
    }
  }
  if (/品牌介绍$/.test(topic) && /合作|经销|渠道/.test(value)) topic = topic.replace(/品牌介绍$/, "品牌合作介绍");
  if (topic.length > 32) topic = topic.slice(0, 32);
  return topic || "PPT 方案";
}

export function isInstructionShellTitle(value = "") {
  return /^(?:为一家|为一个|为某|请生成|请制作|制作|生成|帮我|给我)/.test(String(value || "").trim())
    || /(?:\d{1,2}\s*页|PPT|ppt|演示文稿)/.test(String(value || ""));
}

export function buildRequiredSectionPlan(items = []) {
  return splitList(items).map(label => {
    const structure = parseRequirementStructure(label);
    const ruleText = [label, ...structure.atomic_requirements.map(item => item.label)].join(" ");
    const rule = REQUIRED_SECTION_RULES.find(item => item.pattern.test(ruleText));
    return {
      label,
      original_requirement: label,
      atomic_requirements: structure.atomic_requirements,
      constraints: structure.constraints,
      page_constraint: structure.page_constraint,
      aggregation: structure.aggregation,
      section_id: rule?.sectionId || "content",
      group: rule?.group || "custom"
    };
  });
}

export function buildMustIncludeRules(value = "") {
  const requirements = splitList(value);
  return requirements.map((requirement, index) => {
    const structure = parseRequirementStructure(requirement);
    const ruleText = [requirement, ...structure.atomic_requirements.map(item => item.label)].join(" ");
    const rule = REQUIRED_SECTION_RULES.find(item => item.pattern.test(ruleText));
    return {
      original_requirement: requirement,
      atomic_requirements: structure.atomic_requirements.map(item => item.label),
      constraints: structure.constraints,
      page_constraint: structure.page_constraint,
      aggregation: structure.aggregation,
      section_id: rule?.sectionId || "content",
      group: rule?.group || "custom",
      source_field: "mustHave"
    };
  });
}

export function mustIncludeSourceHash(value = "") {
  const source = splitList(value).join("\n");
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function normalizeMustIncludeRuleState(input = {}) {
  if (!Array.isArray(input.must_include_rules)) {
    return {
      hasStructured: false,
      rule_source: "legacy_fallback",
      rules: [],
      plan: [],
      diagnostics: []
    };
  }

  const rules = input.must_include_rules;
  const sourceItems = splitList(input.must_include_source || input.must_include);
  const expectedCount = Number(input.must_include_source_count);
  const schemaVersion = Number(input.must_include_rules_schema_version);
  const sourceHash = String(input.must_include_source_hash || "");
  const expectedHash = mustIncludeSourceHash(sourceItems);
  const diagnostics = [];
  const fail = (parseError, extra = {}) => ({
    hasStructured: true,
    rule_source: "structured_parse_error",
    rules: [],
    plan: [],
    diagnostics: [{
      rule_source: "structured_parse_error",
      parse_error: parseError,
      original_rule_count: sourceItems.length,
      parsed_rule_count: rules.length,
      failed_rule_index: extra.failed_rule_index ?? null,
      client_atomic_count: extra.client_atomic_count ?? null,
      server_atomic_count: extra.server_atomic_count ?? null,
      structure_validation_status: "failed",
      structure_validation_error: parseError,
      source_field: "must_include_rules",
      raw_text: extra.raw_text || ""
    }]
  });

  if (schemaVersion !== MUST_INCLUDE_RULES_SCHEMA_VERSION) return fail("unsupported_must_include_rules_schema_version");
  if (!Number.isInteger(expectedCount) || expectedCount !== rules.length || expectedCount !== sourceItems.length) {
    return fail("must_include_source_count_mismatch");
  }
  if (!sourceHash || sourceHash !== expectedHash) return fail("must_include_source_hash_mismatch");
  if (!rules.length && sourceItems.length) return fail("must_include_rules_empty");

  const normalized = [];
  for (let index = 0; index < rules.length; index += 1) {
    const submitted = rules[index] || {};
    const original = cleanListItem(submitted.original_requirement || "");
    if (!original) return fail("original_requirement_empty", { failed_rule_index: index });
    if (original !== sourceItems[index]) {
      return fail("original_requirement_mismatch", { failed_rule_index: index, raw_text: original });
    }
    const serverRule = buildMustIncludeRules([original])[0];
    const clientAtomic = toAtomicLabels(submitted.atomic_requirements);
    const serverAtomic = toAtomicLabels(serverRule.atomic_requirements);
    if (!clientAtomic.length) {
      return fail("atomic_requirements_empty", {
        failed_rule_index: index,
        client_atomic_count: clientAtomic.length,
        server_atomic_count: serverAtomic.length,
        raw_text: original
      });
    }
    if (!sameStringList(clientAtomic, serverAtomic)) {
      return fail("atomic_requirements_mismatch", {
        failed_rule_index: index,
        client_atomic_count: clientAtomic.length,
        server_atomic_count: serverAtomic.length,
        raw_text: original
      });
    }
    if (!sameStringList((submitted.constraints || []).map(constraintKey), (serverRule.constraints || []).map(constraintKey))) {
      return fail("constraints_mismatch", { failed_rule_index: index, raw_text: original });
    }
    if (JSON.stringify(submitted.page_constraint || null) !== JSON.stringify(serverRule.page_constraint || null)) {
      return fail("page_constraint_mismatch", { failed_rule_index: index, raw_text: original });
    }
    if (submitted.aggregation !== "all_of") return fail("aggregation_mismatch", { failed_rule_index: index, raw_text: original });
    normalized.push({
      label: original,
      original_requirement: original,
      atomic_requirements: serverRule.atomic_requirements.map(label => ({ label })),
      constraints: serverRule.constraints,
      page_constraint: serverRule.page_constraint,
      aggregation: "all_of",
      section_id: serverRule.section_id,
      group: serverRule.group,
      source_field: submitted.source_field || "mustHave",
      structure_validation_status: "ok"
    });
  }

  return {
    hasStructured: true,
    rule_source: "structured",
    rules: normalized,
    plan: normalized,
    diagnostics
  };
}

export function sectionIdsForRequiredPlan(plan = [], pageBudget = 0) {
  const ids = [];
  for (const item of plan) {
    const id = item.section_id;
    if (!id || id === "content") continue;
    if (!ids.includes(id)) ids.push(id);
  }
  const budget = Number.isInteger(pageBudget) && pageBudget > 0 ? pageBudget : ids.length;
  return ids.slice(0, budget);
}

export function buildCoverageMapForPlan(plan = [], selectedSectionIds = []) {
  const selected = new Set(selectedSectionIds);
  return plan.map(item => ({
    required_section: item.label,
    assigned_section_id: requiredItemCovered(item, selected) ? item.section_id : "",
    covered: requiredItemCovered(item, selected)
  }));
}

export function requiredItemCovered(item, selectedSectionIds = new Set()) {
  const selected = selectedSectionIds instanceof Set ? selectedSectionIds : new Set(selectedSectionIds);
  if (selected.has(item.section_id)) return true;
  const alternatives = compatibleSectionIds(item);
  return alternatives.some(id => selected.has(id));
}

export function compatibleSectionIds(item = {}) {
  const label = item.label || "";
  const ids = new Set([item.section_id].filter(Boolean));
  if (/补能服务|用户服务|售后网络|服务网络/.test(label)) {
    ids.add("delivery_and_collaboration").add("service_process").add("quality_or_validation");
  }
  if (/渠道合作价值|合作价值|经销价值|渠道价值/.test(label)) {
    ids.add("customer_value").add("delivery_and_collaboration").add("cooperation_next_step");
  }
  if (/合作支持|渠道支持|销售支持|合作方式|合作模式/.test(label)) {
    ids.add("delivery_and_collaboration").add("service_process").add("cooperation_next_step");
  }
  if (/安全体系|电池安全/.test(label)) {
    ids.add("quality_or_validation").add("product_or_process_capability");
  }
  return [...ids];
}

export function splitList(value = "") {
  if (Array.isArray(value)) return value.map(item => cleanListItem(item)).filter(Boolean);
  const source = Array.isArray(value) ? value.join("\n") : String(value || "");
  const lines = source
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .map(item => cleanSentence(item).replace(/^[*•\-]\s*/, "").replace(/^\d+[.、)]\s*/, ""))
    .filter(Boolean);
  if (lines.length > 1) return lines;
  if (/[。！？!?]/.test(source) || /必须|不得|不能|最后一页|从.+到/.test(source)) return lines;
  return source
    .split(/(?:；|;|，|,|、|和|及|与)+/)
    .map(item => cleanSentence(item).replace(/^[*•\-]\s*/, "").replace(/^\d+[.、)]\s*/, ""))
    .filter(Boolean);
}

export function normalizeMultiline(value = "") {
  return String(value || "").replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function firstNonFieldLine(value) {
  for (const rawLine of value.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (FIELD_HEADING_PATTERN.test(line)) break;
    return line;
  }
  return "";
}

function appendField(fields, field, value) {
  const text = cleanSentence(value);
  if (!field || !text) return;
  fields[field] = [fields[field], text].filter(Boolean).join("\n");
}

function cleanSentence(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^[*•\-]\s*/, "")
    .replace(/^[，,。；;：:\s]+|[。；;\s]+$/g, "")
    .trim();
}

function cleanListItem(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^[*•\-]\s*/, "")
    .replace(/^\d+[.、)]\s*/, "")
    .replace(/^[，,；;：:\s]+|[；;\s]+$/g, "")
    .trim();
}

export function parseRequirementStructure(label = "") {
  const original = cleanSentence(label);
  const constraints = extractConstraints(original);
  const pageConstraint = parsePageConstraint(original);
  const requirementText = original
    .replace(/但不得.+$/g, "")
    .replace(/但不能.+$/g, "")
    .replace(/不能将.+$/g, "")
    .replace(/不得自行.+$/g, "");
  const atomicLabels = atomicLabelsForRequirement(requirementText, pageConstraint);
  return {
    atomic_requirements: atomicLabels.map(item => ({ label: item })),
    constraints,
    page_constraint: pageConstraint,
    aggregation: "all_of"
  };
}

function extractConstraints(value = "") {
  const constraints = [];
  const matches = String(value || "").match(/(?:但)?(?:不得|不能|禁止|不允许)[^。；;]+/g) || [];
  for (const match of matches) {
    const text = cleanSentence(match.replace(/^但/, ""));
    if (!text) continue;
    constraints.push({ raw_text: text, rule_type: "negative_constraint" });
    if (/具体合作条款/.test(text)) {
      ["具体费用", "分工", "合作条款", "收益安排"].forEach(item => {
        constraints.push({ raw_text: `不得虚构${item}`, rule_type: "unconfirmed_contract_detail", subject: item });
      });
    }
  }
  return uniqueBy(constraints, item => `${item.rule_type}:${item.raw_text}:${item.subject || ""}`);
}

function toAtomicLabels(items = []) {
  return (items || [])
    .map(item => cleanListItem(typeof item === "string" ? item : item?.label || item?.atomic_requirement || ""))
    .filter(Boolean);
}

function constraintKey(item = {}) {
  return `${item.rule_type || ""}:${item.raw_text || ""}:${item.subject || ""}`;
}

function sameStringList(left = [], right = []) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function parsePageConstraint(value = "") {
  const text = String(value || "");
  if (/最后一页/.test(text)) return { type: "last", label: "最后一页", expected_page: "last" };
  if (/封面/.test(text)) return { type: "cover", label: "封面", expected_page: 1 };
  const pageMatch = text.match(/第\s*(\d{1,2})\s*页/);
  if (pageMatch) return { type: "index", label: `第${pageMatch[1]}页`, expected_page: Number(pageMatch[1]) };
  return null;
}

function atomicLabelsForRequirement(value = "", pageConstraint = null) {
  const text = cleanSentence(value)
    .replace(/^必须(?:说明|介绍|明确介绍|讲清楚|给出|标注)?/, "")
    .replace(/^需要(?:说明|介绍|明确)?/, "");
  if (/最后一页/.test(value) && /合作行动|可执行/.test(value)) return ["明确动作", "责任主体或合作对象", "下一步事项"];
  if (/从初步洽谈/.test(value) || /方案评估到合作确认/.test(value)) return ["初步洽谈", "场地考察", "资料补充", "方案评估", "合作确认"];
  if (/场地合作|活动合作|联合运营/.test(value)) return ["场地合作", "活动合作", "联合运营"];
  if (/目标用户|主要体验项目|空间功能|运营内容|合作价值/.test(value)) {
    return ["目标用户", "主要体验项目", "空间功能", "运营内容", "合作价值"].filter(item => value.includes(item));
  }
  if (/单人驾驶体验|多人竞速活动|企业团建|青少年赛车启蒙/.test(value)) {
    return ["单人驾驶体验", "多人竞速活动", "企业团建", "青少年赛车启蒙"].filter(item => value.includes(item));
  }
  if (/政府补贴|入驻率|企业数量/.test(value)) {
    return ["政府补贴", "入驻率", "企业数量"].filter(item => value.includes(item));
  }
  if (/项目定位/.test(value)) return ["项目定位"];
  if (!/[，,、]/.test(text)) return pageConstraint?.type === "last" ? ["下一步事项"] : [text].filter(Boolean);
  const list = text
    .replace(/。.*$/g, "")
    .split(/[，,、]+|和|及|与/)
    .map(item => cleanSentence(item).replace(/^(?:项目的|项目|主要|明确|可执行的)/, ""))
    .filter(item => item.length >= 2 && !/最后一页/.test(item));
  if (list.length) return [...new Set(list)];
  return pageConstraint?.type === "last" ? ["下一步事项"] : [text].filter(Boolean);
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
