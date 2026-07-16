const REDACTED_CREDENTIAL = "[敏感凭证已脱敏]";
const REDACTED_LOCAL_PATH = "[本机路径已脱敏]";
const REDACTED_INTERNAL_VALUE = "[内部诊断已脱敏]";
const REDACTED_INTERNAL_PROMPT = "[内部提示已脱敏]";

// image_prompt is an intentional, public production field. This matcher is
// therefore exact/diagnostic-oriented rather than a broad `/prompt/i` filter.
const INTERNAL_PUBLIC_KEY_PATTERN = /^(?:internal(?:_diagnostics?|_prompt)?|public_diagnostic_context|private_diagnostics?|diagnostic_summary|(?:[a-z0-9]+_)*diagnostics?|raw_(?:request|input|materials?|model_(?:request|response))|client_materials?|customer_materials?|material_details|binding(?:_.+|s)?|atomic_requirement_id|requirement_id|requirement_binding(?:_.+|s)?|lineage(?:_.+)?|allocation(?:_.+|s)?|provenance(?:_.+)?|canonical_section_id|required_canonical_sections|content_item_id|planner_item_id|request_scope|(?:[a-z0-9]+_)*hash|gate_id|issue_code|mapping_source|prompt|system_prompt|developer_prompt|api_?key|(?:access|auth|refresh|id)?_?token|authorization|password|secret(?:_key)?)$/i;

const SENSITIVE_VALUE_RULES = Object.freeze([
  {
    reason: "sensitive_value",
    pattern: /\b(?:[A-Z0-9_]*(?:API[_ -]?KEY|(?:ACCESS|AUTH|REFRESH|ID)?[_ -]?TOKEN|AUTHORIZATION|PASSWORD|SECRET(?:[_ -]?KEY)?))\s*[:=]\s*(?:Bearer\s+)?[^\s,"'`;}{\]]+/gi,
    replacement: REDACTED_CREDENTIAL
  },
  {
    reason: "sensitive_value",
    pattern: /\bBearer\s+[^\s,"'`;}{\]]+/gi,
    replacement: REDACTED_CREDENTIAL
  },
  {
    reason: "sensitive_value",
    pattern: /\bsk-[A-Za-z0-9_-]{4,}\b/gi,
    replacement: REDACTED_CREDENTIAL
  },
  {
    reason: "sensitive_value",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    replacement: REDACTED_CREDENTIAL
  },
  {
    reason: "local_path",
    pattern: /(?:file:\/\/)?\/(?:Users|home|root|private|Volumes|Applications|Library|tmp|var\/folders)\/[^\s"'<>`，。；、)\]}]+/gi,
    replacement: REDACTED_LOCAL_PATH
  },
  {
    reason: "local_path",
    pattern: /\b[A-Z]:\\Users\\[^\s"'<>`，。；、)\]}]+/gi,
    replacement: REDACTED_LOCAL_PATH
  },
  {
    reason: "internal_prompt",
    pattern: /\b(?:internal|system|developer)[_ ]+prompt\s*[:=]\s*[^\r\n]*/gi,
    replacement: REDACTED_INTERNAL_PROMPT
  },
  {
    reason: "internal_prompt",
    pattern: /(?:^|[\r\n])[^\r\n]*"role"\s*:\s*"(?:system|developer)"[^\r\n]*/gi,
    replacement: REDACTED_INTERNAL_PROMPT
  },
  {
    reason: "internal_prompt",
    pattern: /<(?:system|developer|internal_prompt)\b[^>]*>[\s\S]*?<\/(?:system|developer|internal_prompt)>/gi,
    replacement: REDACTED_INTERNAL_PROMPT
  },
  {
    reason: "internal_value",
    pattern: /\b(?:binding(?:_[a-z0-9_]+)?|atomic_requirement_id|requirement_id|requirement_binding(?:_[a-z0-9_]+)?|lineage(?:_[a-z0-9_]+)?|allocation(?:_[a-z0-9_]+)?|provenance(?:_[a-z0-9_]+)?|canonical_section_id|required_canonical_sections|content_item_id|planner_item_id|request_scope|(?:[a-z0-9]+_)*hash)\s*[:=]\s*[^\s,"'`;}{\]]+/gi,
    replacement: REDACTED_INTERNAL_VALUE
  },
  {
    reason: "request_hash",
    pattern: /\b(?:sha(?:1|256|384|512)\s*[:=]\s*)?[a-f0-9]{32,128}\b/gi,
    replacement: REDACTED_INTERNAL_VALUE
  }
]);

export function sanitizePublicText(value) {
  let output = String(value ?? "");
  for (const rule of SENSITIVE_VALUE_RULES) {
    output = output.replace(rule.pattern, rule.replacement);
  }
  return output;
}

export function sanitizePublicPlainValue(value, options = {}) {
  const maxDepth = Number.isFinite(options.maxDepth) ? options.maxDepth : 6;
  return sanitizeValue(value, 0, maxDepth, new WeakSet());
}

export function inspectPublicPayloadSafety(value) {
  const reasons = new Set();
  const ancestors = new WeakSet();

  function visit(current) {
    if (typeof current === "string") {
      for (const rule of SENSITIVE_VALUE_RULES) {
        rule.pattern.lastIndex = 0;
        if (rule.pattern.test(current)) reasons.add(rule.reason === "local_path" ? "local_path" : "sensitive_value");
        rule.pattern.lastIndex = 0;
      }
      return;
    }
    if (!current || typeof current !== "object") return;
    if (ancestors.has(current)) {
      reasons.add("unserializable_payload");
      return;
    }
    ancestors.add(current);
    let entries;
    try {
      entries = Object.entries(current);
    } catch {
      reasons.add("uninspectable_payload");
      ancestors.delete(current);
      return;
    }
    for (const [key, item] of entries) {
      if (isInternalPublicKey(key)) reasons.add("internal_key");
      try {
        visit(item);
      } catch {
        reasons.add("uninspectable_payload");
      }
    }
    ancestors.delete(current);
  }

  try {
    visit(value);
    JSON.stringify(value);
  } catch {
    reasons.add("unserializable_payload");
  }

  return Object.freeze({
    safe: reasons.size === 0,
    reasons: Object.freeze([...reasons].sort())
  });
}

export function isInternalPublicKey(key) {
  return INTERNAL_PUBLIC_KEY_PATTERN.test(String(key || ""));
}

function sanitizeValue(value, depth, maxDepth, seen) {
  if (depth > maxDepth) return null;
  if (typeof value === "string") return sanitizePublicText(value).slice(0, 4000);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (typeof value === "bigint") return Number.isSafeInteger(Number(value)) ? Number(value) : String(value);
  if (value === undefined || typeof value === "function" || typeof value === "symbol") return "";
  if (Array.isArray(value)) {
    if (seen.has(value)) return null;
    seen.add(value);
    const result = value.slice(0, 100).map(item => sanitizeValue(item, depth + 1, maxDepth, seen));
    seen.delete(value);
    return result;
  }
  if (!value || typeof value !== "object") return "";
  if (seen.has(value)) return null;
  seen.add(value);
  const entries = Object.entries(value);
  const result = Object.fromEntries(entries
    .filter(([key]) => !isInternalPublicKey(key) && !String(key).startsWith("_"))
    .map(([key, item]) => [key, sanitizeValue(item, depth + 1, maxDepth, seen)]));
  seen.delete(value);
  return result;
}
