const DEFAULT_FORBIDDEN_ZONES = ["页面标题", "副标题", "正文", "页面结论", "图示文字", "演讲备注"];
const DEFAULT_CONTENT_ZONES = ["正文", "页面结论", "图示文字", "演讲备注"];

export function parseRiskRules(value, sourceField = "riskPoints") {
  return splitRiskLines(value)
    .flatMap(line => parseRiskLine(line, sourceField))
    .map(rule => normalizeRiskRule(rule, sourceField))
    .filter(Boolean);
}

export function normalizeRiskRule(rule, sourceField = "excluded_content") {
  if (!rule || typeof rule !== "object") return null;
  const rawText = normalizeText(rule.raw_text || rule.rawText || rule.text || "");
  const subjectTerms = toTermList(rule.subject_terms || rule.subjectTerms || rule.subject || rule.term);
  const entities = toTermList(rule.entities || rule.entity);
  const claimTerms = toTermList(rule.claim_terms || rule.claimTerms || rule.claims);
  const forbiddenClaimRoles = normalizeClaimRoles(rule.forbidden_claim_roles || rule.forbiddenClaimRoles || rule.forbidden_contexts || rule.forbiddenContexts);
  const forbiddenZones = normalizeZones(rule.forbidden_zones || rule.forbiddenZones || rule.zones);
  const prohibitedRelations = toTermList(rule.prohibited_relations || rule.prohibitedRelations || rule.relations || rule.relation);
  const allowedNegationContexts = toTermList(rule.allowed_negation_contexts || rule.allowedNegationContexts);
  const confirmationScope = normalizeText(rule.confirmation_scope || rule.confirmationScope || "");
  const parseError = normalizeText(rule.parse_error || rule.parseError || "");
  const ruleType = normalizeText(rule.rule_type || rule.ruleType || inferRuleType({ subjectTerms, entities, claimTerms, parseError }));

  if (parseError || (!subjectTerms.length && !entities.length && !claimTerms.length)) {
    return {
      raw_text: rawText,
      subject_terms: [],
      entities: [],
      claim_terms: [],
      forbidden_claim_roles: [],
      forbidden_zones: [],
      prohibited_relations: prohibitedRelations,
      confirmation_scope: confirmationScope,
      source_field: normalizeText(rule.source_field || rule.sourceField || sourceField),
      rule_type: "structured_parse_error",
      parse_error: parseError || "missing_structured_terms"
    };
  }

  return {
    raw_text: rawText || [...subjectTerms, ...entities, ...claimTerms].join("、"),
    subject_terms: subjectTerms,
    ...(entities.length ? { entities } : {}),
    ...(claimTerms.length ? { claim_terms: claimTerms } : {}),
    ...(forbiddenClaimRoles.length ? { forbidden_claim_roles: forbiddenClaimRoles } : {}),
    forbidden_zones: forbiddenZones.length ? forbiddenZones : defaultZonesFor(ruleType),
    ...(prohibitedRelations.length ? { prohibited_relations: prohibitedRelations } : {}),
    ...(allowedNegationContexts.length ? { allowed_negation_contexts: allowedNegationContexts } : {}),
    ...(confirmationScope ? { confirmation_scope: confirmationScope } : {}),
    source_field: normalizeText(rule.source_field || rule.sourceField || sourceField),
    rule_type: ruleType
  };
}

export function subjectTermsFromRules(rules = []) {
  return [...new Set((rules || [])
    .filter(rule => !["prohibited_relationship_claim", "structured_parse_error"].includes(rule.rule_type))
    .flatMap(rule => rule.subject_terms || [])
    .map(normalizeText)
    .filter(Boolean))];
}

function parseRiskLine(line, sourceField) {
  const rawText = normalizeRiskLineText(line);
  if (!rawText) return [];

  const zoneMatch = rawText.match(/^(.+?)不得作为(.+?)出现$/);
  if (zoneMatch) {
    const contexts = normalizeRoleAndZoneList(zoneMatch[2]);
    return [{
      raw_text: rawText,
      subject_terms: toTermList(zoneMatch[1]),
      forbidden_claim_roles: contexts.roles,
      forbidden_zones: contexts.zones,
      allowed_negation_contexts: ["不作为", "不计入", "尚未确认", "待确认", "不写成"],
      source_field: sourceField,
      rule_type: "subject_forbidden_zones"
    }];
  }

  const metricMatch = rawText.match(/^不得虚构或暗示具体(.+)$/);
  if (metricMatch) {
    return [{
      raw_text: rawText,
      subject_terms: toTermList(metricMatch[1]),
      forbidden_zones: [...DEFAULT_FORBIDDEN_ZONES],
      source_field: sourceField,
      rule_type: "prohibited_metric_claim"
    }];
  }

  const relationshipMatch = rawText.match(/^不得虚构(.+)$/);
  if (relationshipMatch) {
    const scope = normalizeText(relationshipMatch[1]);
    const body = scope.replace(/^已合作的/, "");
    const terms = toTermList(body);
    const claimTerms = terms.filter(term => /客户案例|经营成果/.test(term));
    const entities = terms.filter(term => !/客户案例|经营成果/.test(term));
    return [{
      raw_text: rawText,
      subject_terms: [],
      entities,
      ...(claimTerms.length ? { claim_terms: claimTerms } : {}),
      prohibited_relations: prohibitedRelationsFor(scope),
      confirmation_scope: scope,
      forbidden_zones: [...DEFAULT_FORBIDDEN_ZONES],
      source_field: sourceField,
      rule_type: "prohibited_relationship_claim"
    }];
  }

  const promotionMatch = rawText.match(/^不得使用(.+?)等未经证实的宣传表达$/);
  if (promotionMatch) {
    return [{
      raw_text: rawText,
      subject_terms: [],
      claim_terms: quotedTerms(promotionMatch[1]),
      forbidden_zones: [...DEFAULT_FORBIDDEN_ZONES],
      source_field: sourceField,
      rule_type: "unverified_promotion_phrase"
    }];
  }

  const pendingMatch = rawText.match(/^不得把尚未确认的(.+?)写成确定事实$/);
  if (pendingMatch) {
    return [{
      raw_text: rawText,
      subject_terms: toTermList(pendingMatch[1]),
      forbidden_zones: [...DEFAULT_CONTENT_ZONES],
      allowed_negation_contexts: ["尚未确认", "待确认", "未确认"],
      source_field: sourceField,
      rule_type: "pending_fact_must_not_be_asserted"
    }];
  }

  const derivedMatch = rawText.match(/^不得根据缺失的数据反向推导项目具有(.+)$/);
  if (derivedMatch) {
    return [{
      raw_text: rawText,
      subject_terms: [],
      claim_terms: toTermList(derivedMatch[1]),
      forbidden_zones: [...DEFAULT_CONTENT_ZONES],
      source_field: sourceField,
      rule_type: "prohibited_derived_claim"
    }];
  }

  const legacyMatch = rawText.match(/^(.+?)(?:不得|不能|不要|禁止|避免|不允许)(?:出现|写入|提及|作为事实|作为优势|写成事实)?$/);
  if (legacyMatch && !/[。！？]/.test(legacyMatch[1])) {
    return [{
      raw_text: rawText,
      subject_terms: toTermList(legacyMatch[1]),
      forbidden_zones: [...DEFAULT_FORBIDDEN_ZONES],
      source_field: sourceField,
      rule_type: "forbidden_subject"
    }];
  }

  return [{
    raw_text: rawText,
    subject_terms: [],
    source_field: sourceField,
    rule_type: "structured_parse_error",
    parse_error: "unsupported_risk_rule"
  }];
}

function splitRiskLines(value) {
  if (Array.isArray(value)) {
    return value.flatMap(item => splitRiskLines(item));
  }
  const source = String(value || "").replace(/\r\n?/g, "\n").trim();
  if (!source) return [];
  const firstPass = source
    .split(/\n{2,}|\n+|(?=^\s*(?:[-*•]|\d+[.、)]|[一二三四五六七八九十]+[、.）]))/m)
    .map(item => item.replace(/^\s*(?:[-*•]|\d+[.、)]|[一二三四五六七八九十]+[、.）])\s*/, "").trim())
    .filter(Boolean);
  const sentencePass = firstPass.flatMap(item => splitChineseSentences(item));
  return sentencePass.map(normalizeText).filter(Boolean);
}

function splitChineseSentences(value) {
  const text = String(value || "").trim();
  if (!text) return [];
  const parts = text.match(/[^。！？!?]+[。！？!?]?/g) || [text];
  return parts.map(item => item.trim()).filter(Boolean);
}

function normalizeRoleAndZoneList(value) {
  const roles = [];
  const zones = [];
  for (const item of toTermList(value)) {
    if (/^标题$|页面标题/.test(item)) zones.push("页面标题");
    else if (/正文结论|结论/.test(item)) zones.push("正文结论");
    else if (/图示|图示内容|视觉/.test(item)) zones.push("图示文字");
    else if (/优势/.test(item)) roles.push("优势");
    else if (/服务/.test(item)) roles.push("服务");
    else if (/支持内容|支持/.test(item)) roles.push("支持内容");
    else roles.push(item);
  }
  return { roles: [...new Set(roles)], zones: [...new Set(zones)] };
}

function toTermList(value) {
  if (Array.isArray(value)) return value.flatMap(toTermList);
  return String(value || "")
    .replace(/以及/g, "、")
    .replace(/等信息/g, "")
    .replace(/等未经证实的宣传表达/g, "")
    .split(/[，,、/]+|或|和|与|及/)
    .map(term => normalizeText(term)
      .replace(/^(?:关于|涉及|针对|已合作的)/, "")
      .replace(/[。.!！?？]+$/g, ""))
    .filter(term => term && !/^(?:不得|不能|不要|禁止|避免|不允许)$/.test(term));
}

function normalizeClaimRoles(value) {
  if (Array.isArray(value)) return value.flatMap(normalizeClaimRoles);
  return toTermList(value).map(item => item === "服务/支持内容" ? ["服务", "支持内容"] : item).flat().filter(Boolean);
}

function normalizeZones(value) {
  if (Array.isArray(value)) return value.flatMap(normalizeZones);
  return toTermList(value).map(zone => {
    if (/^标题$|页面标题/.test(zone)) return "页面标题";
    if (/正文结论|结论/.test(zone)) return "正文结论";
    if (/图示|图示内容|视觉/.test(zone)) return "图示文字";
    if (/^正文$/.test(zone)) return "正文";
    if (/^副标题$/.test(zone)) return "副标题";
    if (/演讲备注/.test(zone)) return "演讲备注";
    return zone;
  }).filter(Boolean);
}

function quotedTerms(value) {
  const matches = [...String(value || "").matchAll(/[“"]([^”"]+)[”"]/g)].map(match => normalizeText(match[1]));
  return matches.length ? matches : toTermList(value);
}

function inferRuleType({ subjectTerms, entities, claimTerms, parseError }) {
  if (parseError) return "structured_parse_error";
  if (entities.length) return "prohibited_relationship_claim";
  if (claimTerms.length && !subjectTerms.length) return "unverified_promotion_phrase";
  return "forbidden_subject";
}

function defaultZonesFor(ruleType) {
  if (["pending_fact_must_not_be_asserted", "prohibited_derived_claim"].includes(ruleType)) return [...DEFAULT_CONTENT_ZONES];
  return [...DEFAULT_FORBIDDEN_ZONES];
}

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeRiskLineText(value) {
  return normalizeText(value).replace(/[。.!！?？]+$/g, "");
}

function prohibitedRelationsFor(scope) {
  const relations = [];
  if (/已合作|合作/.test(scope)) relations.push("已合作", "已有合作案例");
  if (/支持/.test(scope)) relations.push("已获得支持");
  if (/客户案例|案例/.test(scope)) relations.push("已有客户案例");
  if (/经营成果|成果/.test(scope)) relations.push("已有经营成果");
  return relations.length ? [...new Set(relations)] : ["已确认关系"];
}
