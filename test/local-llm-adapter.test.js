import assert from "node:assert/strict";
import { test } from "node:test";
import { loadLocalModelConfig } from "../lib/local-model-config.js";
import {
  LocalModelError,
  requestChatCompletion
} from "../lib/openai-compatible-provider.js";

const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "outline",
    strict: true,
    schema: {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"],
      additionalProperties: false
    }
  }
};

function providerConfig(overrides = {}) {
  return {
    enabled: true,
    provider: "openai-compatible",
    modelId: "vendor/general-model",
    endpoint: "http://127.0.0.1:11434/v1/chat/completions",
    apiKey: "",
    timeoutMs: 1000,
    supportsJsonSchema: false,
    maxRepairAttempts: 1,
    ...overrides
  };
}

function completionResponse({
  content = "{\"title\":\"可用结果\"}",
  model = "server-reported-model",
  finishReason = "stop",
  usage = { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 }
} = {}) {
  return new Response(JSON.stringify({
    model,
    choices: [{ message: { content }, finish_reason: finishReason }],
    usage
  }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

async function captureRequest({ config = providerConfig(), responseFormat = RESPONSE_FORMAT } = {}) {
  let captured;
  const result = await requestChatCompletion({
    config,
    messages: [{ role: "user", content: "生成大纲" }],
    responseFormat,
    maxTokens: 900,
    temperature: 0.2,
    fetchImpl: async (url, options) => {
      captured = {
        url: String(url),
        headers: options.headers,
        body: JSON.parse(options.body)
      };
      return completionResponse();
    }
  });
  return { captured, result };
}

test("new LOCAL_MODEL settings take priority over legacy OpenWebUI aliases", () => {
  const config = loadLocalModelConfig({
    LOCAL_MODEL_ENABLED: "true",
    LOCAL_MODEL_PROVIDER: "openai-compatible",
    LOCAL_MODEL_BASE_URL: "http://127.0.0.1:11434/v1/",
    LOCAL_MODEL_API_KEY: "new-key",
    LOCAL_MODEL_ID: "vendor/general-model",
    LOCAL_MODEL_TIMEOUT_MS: "8000",
    LOCAL_MODEL_SUPPORTS_JSON_SCHEMA: "true",
    LOCAL_MODEL_MAX_REPAIR_ATTEMPTS: "0",
    OPENWEBUI_BASE_URL: "http://127.0.0.1:8080",
    OPENWEBUI_API_KEY: "legacy-key"
  });

  assert.deepEqual(config, {
    enabled: true,
    provider: "openai-compatible",
    modelId: "vendor/general-model",
    endpoint: "http://127.0.0.1:11434/v1/chat/completions",
    apiKey: "new-key",
    timeoutMs: 8000,
    supportsJsonSchema: true,
    maxRepairAttempts: 0
  });
});

test("legacy OpenWebUI aliases retain the legacy API route", () => {
  const config = loadLocalModelConfig({
    LOCAL_MODEL_ENABLED: "true",
    OPENWEBUI_BASE_URL: "http://127.0.0.1:8080/",
    OPENWEBUI_API_KEY: "legacy-key",
    LOCAL_MODEL_ID: "legacy-alias"
  });

  assert.equal(config.provider, "openwebui");
  assert.equal(config.endpoint, "http://127.0.0.1:8080/api/chat/completions");
  assert.equal(config.apiKey, "legacy-key");
  assert.equal(config.modelId, "legacy-alias");
});

test("a complete chat-completions endpoint is not appended twice", () => {
  const generic = loadLocalModelConfig({
    LOCAL_MODEL_ENABLED: "true",
    LOCAL_MODEL_BASE_URL: "http://127.0.0.1:11434/v1/chat/completions",
    LOCAL_MODEL_ID: "local-model"
  });
  const legacy = loadLocalModelConfig({
    LOCAL_MODEL_ENABLED: "true",
    OPENWEBUI_BASE_URL: "http://127.0.0.1:8080/api/chat/completions",
    LOCAL_MODEL_ID: "local-model"
  });

  assert.equal(generic.endpoint, "http://127.0.0.1:11434/v1/chat/completions");
  assert.equal(legacy.endpoint, "http://127.0.0.1:8080/api/chat/completions");
});

test("an explicitly empty new API key does not fall back to a legacy secret", () => {
  const config = loadLocalModelConfig({
    LOCAL_MODEL_ENABLED: "true",
    LOCAL_MODEL_BASE_URL: "http://127.0.0.1:11434/v1",
    LOCAL_MODEL_API_KEY: "",
    OPENWEBUI_API_KEY: "legacy-secret",
    LOCAL_MODEL_ID: "no-auth-model"
  });

  assert.equal(config.apiKey, "");
});

test("placeholder API keys are treated as missing and never sent", async () => {
  const config = loadLocalModelConfig({
    LOCAL_MODEL_ENABLED: "true",
    LOCAL_MODEL_BASE_URL: "http://127.0.0.1:11434/v1",
    LOCAL_MODEL_API_KEY: "replace_with_local_key",
    LOCAL_MODEL_ID: "local-model"
  });
  const { captured } = await captureRequest({ config });

  assert.equal(config.apiKey, "");
  assert.equal(Object.hasOwn(captured.headers, "Authorization"), false);
});

test("missing or invalid configuration never invents a fixed endpoint or model", () => {
  const missing = loadLocalModelConfig({ LOCAL_MODEL_ENABLED: "true" });
  const invalid = loadLocalModelConfig({
    LOCAL_MODEL_ENABLED: "true",
    LOCAL_MODEL_BASE_URL: "file:///private/model-service",
    LOCAL_MODEL_ID: "custom-model"
  });

  assert.equal(missing.modelId, "");
  assert.equal(missing.endpoint, "");
  assert.equal(invalid.endpoint, "");
  assert.doesNotMatch(JSON.stringify({ missing, invalid }), /127\.0\.0\.1:8080|qwen/i);
});

test("repair attempts are bounded to zero or one", () => {
  assert.equal(loadLocalModelConfig({ LOCAL_MODEL_MAX_REPAIR_ATTEMPTS: "0" }).maxRepairAttempts, 0);
  assert.equal(loadLocalModelConfig({ LOCAL_MODEL_MAX_REPAIR_ATTEMPTS: "1" }).maxRepairAttempts, 1);
  assert.equal(loadLocalModelConfig({ LOCAL_MODEL_MAX_REPAIR_ATTEMPTS: "9" }).maxRepairAttempts, 1);
  assert.equal(loadLocalModelConfig({ LOCAL_MODEL_MAX_REPAIR_ATTEMPTS: "-4" }).maxRepairAttempts, 0);
});

test("an empty API key omits Authorization and unsupported schema mode omits response_format", async () => {
  const { captured, result } = await captureRequest({
    config: providerConfig({ apiKey: "", supportsJsonSchema: false })
  });

  assert.equal(captured.url, "http://127.0.0.1:11434/v1/chat/completions");
  assert.equal(Object.hasOwn(captured.headers, "Authorization"), false);
  assert.equal(Object.hasOwn(captured.body, "response_format"), false);
  assert.equal(result.content, "{\"title\":\"可用结果\"}");
});

test("configured authentication and JSON Schema are sent without transformation", async () => {
  const { captured } = await captureRequest({
    config: providerConfig({ apiKey: "provider-key", supportsJsonSchema: true })
  });

  assert.equal(captured.headers.Authorization, "Bearer provider-key");
  assert.deepEqual(captured.body.response_format, RESPONSE_FORMAT);
  assert.equal(captured.body.max_tokens, 900);
  assert.equal(captured.body.temperature, 0.2);
});

test("model IDs are opaque and do not select request behavior", async () => {
  const bodies = [];
  for (const modelId of ["qwen3:32b", "vendor/unrelated-model"]) {
    const { captured } = await captureRequest({
      config: providerConfig({ modelId, supportsJsonSchema: true })
    });
    bodies.push(captured.body);
  }

  assert.equal(bodies[0].model, "qwen3:32b");
  assert.equal(bodies[1].model, "vendor/unrelated-model");
  const withoutModel = bodies.map(({ model, ...body }) => body);
  assert.deepEqual(withoutModel[0], withoutModel[1]);
});

test("provider returns normalized response metadata", async () => {
  const result = await requestChatCompletion({
    config: providerConfig(),
    messages: [{ role: "user", content: "生成大纲" }],
    fetchImpl: async () => completionResponse()
  });

  assert.deepEqual(result, {
    content: "{\"title\":\"可用结果\"}",
    responseMeta: {
      provider: "openai-compatible",
      modelId: "server-reported-model",
      finishReason: "stop",
      usage: {
        promptTokens: 11,
        completionTokens: 7,
        totalTokens: 18
      }
    }
  });
});

test("transport failures become safe LocalModelError values", async () => {
  let capturedSignal;
  await assert.rejects(
    requestChatCompletion({
      config: providerConfig({ timeoutMs: 10 }),
      messages: [{ role: "user", content: "生成大纲" }],
      fetchImpl: async (_url, { signal }) => {
        capturedSignal = signal;
        throw new Error("private host and credential details");
      }
    }),
    error => {
      assert.ok(error instanceof LocalModelError);
      assert.equal(error.code, "LOCAL_MODEL_UNAVAILABLE");
      assert.equal(error.safeMessage, "无法连接本地模型服务");
      assert.doesNotMatch(error.message, /private|credential/i);
      return true;
    }
  );
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(capturedSignal?.aborted, false, "failed fetch must clear its timeout");
});

test("disabled provider configuration never sends a request", async () => {
  let calls = 0;
  await assert.rejects(
    requestChatCompletion({
      config: providerConfig({ enabled: false }),
      messages: [{ role: "user", content: "生成大纲" }],
      fetchImpl: async () => {
        calls += 1;
        return completionResponse();
      }
    }),
    error => error instanceof LocalModelError && error.code === "LOCAL_MODEL_CONFIG_MISSING"
  );
  assert.equal(calls, 0);
});

test("HTTP failures do not expose the upstream response body", async () => {
  await assert.rejects(
    requestChatCompletion({
      config: providerConfig(),
      messages: [{ role: "user", content: "生成大纲" }],
      fetchImpl: async () => new Response("private upstream stack and token", { status: 500 })
    }),
    error => {
      assert.ok(error instanceof LocalModelError);
      assert.equal(error.code, "LOCAL_MODEL_HTTP_ERROR");
      assert.doesNotMatch(error.message, /private|stack|token/i);
      return true;
    }
  );
});

test("timeouts become a safe LocalModelError", async () => {
  await assert.rejects(
    requestChatCompletion({
      config: providerConfig({ timeoutMs: 5 }),
      messages: [{ role: "user", content: "生成大纲" }],
      fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          const error = new Error("private timeout detail");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      })
    }),
    error => {
      assert.ok(error instanceof LocalModelError);
      assert.equal(error.code, "LOCAL_MODEL_TIMEOUT");
      assert.equal(error.safeMessage, "本地模型响应超时");
      return true;
    }
  );
});

test("timeout remains active while the response body is being read", async () => {
  await assert.rejects(
    requestChatCompletion({
      config: providerConfig({ timeoutMs: 5 }),
      messages: [{ role: "user", content: "生成大纲" }],
      fetchImpl: async () => ({
        ok: true,
        headers: { get: () => null },
        text: async () => new Promise(() => {})
      })
    }),
    error => error instanceof LocalModelError && error.code === "LOCAL_MODEL_TIMEOUT"
  );
});

test("oversized or malformed envelopes become safe invalid-response errors", async t => {
  await t.test("declared oversized response", async () => {
    let cancelled = false;
    const body = new ReadableStream({
      cancel() { cancelled = true; }
    });
    await assert.rejects(
      requestChatCompletion({
        config: providerConfig(),
        messages: [{ role: "user", content: "生成大纲" }],
        fetchImpl: async () => ({
          ok: true,
          headers: { get: name => name === "content-length" ? String(300 * 1024) : null },
          body,
          text: async () => "{}"
        })
      }),
      error => error instanceof LocalModelError && error.code === "INVALID_MODEL_RESPONSE"
    );
    await Promise.resolve();
    assert.equal(cancelled, true);
  });

  await t.test("malformed JSON envelope", async () => {
    await assert.rejects(
      requestChatCompletion({
        config: providerConfig(),
        messages: [{ role: "user", content: "生成大纲" }],
        fetchImpl: async () => new Response("not-json", { status: 200 })
      }),
      error => error instanceof LocalModelError && error.code === "INVALID_MODEL_RESPONSE"
    );
  });

  await t.test("streaming response stops reading once the byte limit is exceeded", async () => {
    let pulledChunks = 0;
    let cancelled = false;
    const chunk = new Uint8Array(64 * 1024).fill(65);
    const body = new ReadableStream({
      pull(controller) {
        pulledChunks += 1;
        if (pulledChunks <= 10) controller.enqueue(chunk);
        else controller.close();
      },
      cancel() {
        cancelled = true;
      }
    });

    await assert.rejects(
      requestChatCompletion({
        config: providerConfig(),
        messages: [{ role: "user", content: "生成大纲" }],
        fetchImpl: async () => new Response(body, { status: 200 })
      }),
      error => error instanceof LocalModelError && error.code === "INVALID_MODEL_RESPONSE"
    );

    assert.ok(pulledChunks < 10, "provider must not buffer the entire oversized stream");
    assert.equal(cancelled, true);
  });

  await t.test("a provider cancel promise cannot hang oversized-response handling", async () => {
    const chunk = new Uint8Array(64 * 1024).fill(65);
    const body = new ReadableStream({
      pull(controller) { controller.enqueue(chunk); },
      cancel() { return new Promise(() => {}); }
    });
    const request = requestChatCompletion({
      config: providerConfig({ timeoutMs: 10 }),
      messages: [{ role: "user", content: "生成大纲" }],
      fetchImpl: async () => new Response(body, { status: 200 })
    }).then(
      () => "resolved",
      error => error instanceof LocalModelError && error.code === "INVALID_MODEL_RESPONSE" ? "invalid" : "wrong-error"
    );

    let watchdog;
    try {
      const outcome = await Promise.race([
        request,
        new Promise(resolve => { watchdog = setTimeout(() => resolve("hung"), 50); })
      ]);
      assert.equal(outcome, "invalid");
    } finally {
      clearTimeout(watchdog);
    }
  });
});
