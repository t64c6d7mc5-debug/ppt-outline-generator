const DEFAULT_PROVIDER = "openai-compatible";
const DEFAULT_TIMEOUT_MS = 120000;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 300000;

export function loadLocalModelConfig(env = process.env) {
  const source = env && typeof env === "object" ? env : {};
  const usesGenericBaseUrl = hasDefinedOwn(source, "LOCAL_MODEL_BASE_URL");
  const usesLegacyBaseUrl = !usesGenericBaseUrl && hasDefinedOwn(source, "OPENWEBUI_BASE_URL");
  const rawBaseUrl = usesGenericBaseUrl
    ? source.LOCAL_MODEL_BASE_URL
    : usesLegacyBaseUrl
      ? source.OPENWEBUI_BASE_URL
      : "";
  const endpointSuffix = usesLegacyBaseUrl ? "/api/chat/completions" : "/chat/completions";
  const usesGenericApiKey = hasDefinedOwn(source, "LOCAL_MODEL_API_KEY");

  return {
    enabled: parseBoolean(source.LOCAL_MODEL_ENABLED, false),
    provider: cleanString(source.LOCAL_MODEL_PROVIDER, 80)
      || (usesLegacyBaseUrl ? "openwebui" : DEFAULT_PROVIDER),
    modelId: cleanString(source.LOCAL_MODEL_ID, 200),
    endpoint: buildEndpoint(rawBaseUrl, endpointSuffix),
    apiKey: cleanApiKey(usesGenericApiKey ? source.LOCAL_MODEL_API_KEY : source.OPENWEBUI_API_KEY),
    timeoutMs: clampInteger(source.LOCAL_MODEL_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS),
    supportsJsonSchema: parseBoolean(source.LOCAL_MODEL_SUPPORTS_JSON_SCHEMA, false),
    maxRepairAttempts: clampRepairAttempts(source.LOCAL_MODEL_MAX_REPAIR_ATTEMPTS)
  };
}

function hasDefinedOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key) && value[key] !== undefined;
}

function buildEndpoint(value, suffix) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return "";
  }
  if (!/^https?:$/.test(parsed.protocol)) return "";
  if (!parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash) return "";

  const normalized = parsed.href.replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(parsed.pathname.replace(/\/+$/, ""))) return normalized;
  if (suffix.startsWith("/api/") && /\/api$/i.test(parsed.pathname.replace(/\/+$/, ""))) {
    return `${normalized}${suffix.slice(4)}`;
  }
  return `${normalized}${suffix}`;
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return /^(?:1|true|yes|on)$/i.test(String(value).trim());
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function clampRepairAttempts(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 1;
  return parsed <= 0 ? 0 : 1;
}

function cleanString(value, maxLength) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanApiKey(value) {
  const key = String(value || "").trim();
  return /^(?:replace|placeholder|your[_-]?key|<.+>)/i.test(key) ? "" : key;
}
