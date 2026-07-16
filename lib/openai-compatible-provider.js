import { Buffer } from "node:buffer";

const MAX_RESPONSE_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 120000;
const SAFE_REASON_CODES = new Set([
  "LOCAL_MODEL_CONFIG_MISSING",
  "LOCAL_MODEL_TIMEOUT",
  "LOCAL_MODEL_UNAVAILABLE",
  "LOCAL_MODEL_HTTP_ERROR",
  "INVALID_MODEL_RESPONSE",
  "INVALID_MODEL_JSON"
]);

export class LocalModelError extends Error {
  constructor(code, safeMessage, httpStatus = 503) {
    super(safeMessage);
    this.name = "LocalModelError";
    this.code = SAFE_REASON_CODES.has(code) ? code : "LOCAL_MODEL_UNAVAILABLE";
    this.safeMessage = safeMessage;
    this.httpStatus = httpStatus;
  }
}

export async function requestChatCompletion(options = {}) {
  try {
    return await performChatCompletion(options);
  } catch (error) {
    if (error instanceof LocalModelError) throw error;
    throw new LocalModelError("LOCAL_MODEL_UNAVAILABLE", "无法连接本地模型服务");
  }
}

async function performChatCompletion({
  config,
  messages,
  responseFormat,
  maxTokens,
  temperature,
  fetchImpl
}) {
  assertUsableConfig(config);
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new LocalModelError("LOCAL_MODEL_CONFIG_MISSING", "本地模型请求配置无效");
  }

  const fetcher = fetchImpl || globalThis.fetch;
  if (typeof fetcher !== "function") {
    throw new LocalModelError("LOCAL_MODEL_UNAVAILABLE", "无法连接本地模型服务");
  }

  const headers = { "Content-Type": "application/json" };
  const apiKey = typeof config.apiKey === "string" ? config.apiKey.trim() : "";
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const body = {
    model: config.modelId,
    stream: false,
    messages
  };
  if (Number.isFinite(maxTokens) && maxTokens > 0) body.max_tokens = Math.floor(maxTokens);
  if (Number.isFinite(temperature)) body.temperature = temperature;
  if (config.supportsJsonSchema === true && responseFormat !== undefined && responseFormat !== null) {
    body.response_format = responseFormat;
  }

  let serializedBody;
  try {
    serializedBody = JSON.stringify(body);
  } catch {
    throw new LocalModelError("LOCAL_MODEL_CONFIG_MISSING", "本地模型请求配置无效");
  }

  const controller = new AbortController();
  const timeoutMs = normalizeTimeout(config.timeoutMs);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    try {
      response = await fetcher(config.endpoint, {
        method: "POST",
        headers,
        body: serializedBody,
        signal: controller.signal
      });
    } catch (error) {
      if (error?.name === "AbortError" || controller.signal.aborted) {
        throw new LocalModelError("LOCAL_MODEL_TIMEOUT", "本地模型响应超时");
      }
      throw new LocalModelError("LOCAL_MODEL_UNAVAILABLE", "无法连接本地模型服务");
    }

    if (!response || typeof response.ok !== "boolean") {
      throw new LocalModelError("INVALID_MODEL_RESPONSE", "本地模型响应格式无效", 502);
    }
    if (!response.ok) {
      throw new LocalModelError("LOCAL_MODEL_HTTP_ERROR", "本地模型服务返回错误状态");
    }

    let raw;
    try {
      raw = await readLimitedText(response, MAX_RESPONSE_BYTES, controller.signal);
    } catch (error) {
      if (error?.name === "AbortError" || controller.signal.aborted) {
        throw new LocalModelError("LOCAL_MODEL_TIMEOUT", "本地模型响应超时");
      }
      throw new LocalModelError("INVALID_MODEL_RESPONSE", "本地模型响应格式无效", 502);
    }
    if (!raw.trim()) {
      throw new LocalModelError("INVALID_MODEL_RESPONSE", "本地模型返回空响应", 502);
    }

    let envelope;
    try {
      envelope = JSON.parse(raw);
    } catch {
      throw new LocalModelError("INVALID_MODEL_RESPONSE", "本地模型响应格式无效", 502);
    }

    const choice = envelope?.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new LocalModelError("INVALID_MODEL_RESPONSE", "本地模型没有返回可用内容", 502);
    }

    return {
      content: content.trim(),
      responseMeta: {
        provider: cleanString(config.provider, 80) || "openai-compatible",
        modelId: cleanString(envelope?.model, 200) || config.modelId,
        finishReason: cleanString(choice?.finish_reason, 80) || null,
        usage: normalizeUsage(envelope?.usage)
      }
    };
  } finally {
    clearTimeout(timer);
  }
}

function assertUsableConfig(config) {
  if (!config || typeof config !== "object") {
    throw new LocalModelError("LOCAL_MODEL_CONFIG_MISSING", "本地模型配置不完整");
  }
  if (config.enabled !== true) {
    throw new LocalModelError("LOCAL_MODEL_CONFIG_MISSING", "本地模型未启用");
  }
  if (!cleanString(config.modelId, 200) || !isHttpEndpoint(config.endpoint)) {
    throw new LocalModelError("LOCAL_MODEL_CONFIG_MISSING", "本地模型配置不完整");
  }
}

function isHttpEndpoint(value) {
  let parsed;
  try {
    parsed = new URL(String(value || ""));
  } catch {
    return false;
  }
  return /^https?:$/.test(parsed.protocol)
    && Boolean(parsed.hostname)
    && !parsed.username
    && !parsed.password;
}

function normalizeTimeout(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_TIMEOUT_MS;
}

async function readLimitedText(response, limit, signal) {
  const declaredHeader = response.headers?.get?.("content-length");
  const declared = declaredHeader === null || declaredHeader === undefined
    ? Number.NaN
    : Number(declaredHeader);
  if (Number.isFinite(declared) && declared > limit) {
    cancelBodyBestEffort(response.body);
    throw new Error("response too large");
  }

  if (response.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: false });
    let byteCount = 0;
    let text = "";
    try {
      while (true) {
        const { done, value } = await raceWithAbort(reader.read(), signal);
        if (done) break;
        const chunk = value instanceof Uint8Array ? value : new Uint8Array(value || []);
        byteCount += chunk.byteLength;
        if (byteCount > limit) {
          cancelReaderBestEffort(reader);
          throw new Error("response too large");
        }
        text += decoder.decode(chunk, { stream: true });
      }
      text += decoder.decode();
      return text;
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // The stream may already be cancelled or released.
      }
    }
  }

  const text = await raceWithAbort(response.text(), signal);
  if (Buffer.byteLength(text, "utf8") > limit) throw new Error("response too large");
  return text;
}

function cancelBodyBestEffort(body) {
  if (!body || typeof body.cancel !== "function") return;
  try {
    Promise.resolve(body.cancel()).catch(() => {});
  } catch {
    // Cancellation is advisory; the safe size error must still be returned.
  }
}

function cancelReaderBestEffort(reader) {
  if (!reader || typeof reader.cancel !== "function") return;
  try {
    Promise.resolve(reader.cancel()).catch(() => {});
  } catch {
    // Cancellation is advisory; the safe size error must still be returned.
  }
}

async function raceWithAbort(promise, signal) {
  if (signal?.aborted) throw abortError();
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(abortError());
    signal?.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([promise, aborted]);
  } finally {
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  }
}

function abortError() {
  const error = new Error("aborted");
  error.name = "AbortError";
  return error;
}

function normalizeUsage(value) {
  return {
    promptTokens: nonNegativeInteger(value?.prompt_tokens),
    completionTokens: nonNegativeInteger(value?.completion_tokens),
    totalTokens: nonNegativeInteger(value?.total_tokens)
  };
}

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function cleanString(value, maxLength) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}
