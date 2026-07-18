import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const controlledEvidenceUrl = new URL("../真实回归/tools/v2315-controlled-evidence.mjs", import.meta.url);
const controlledEvidenceAvailable = existsSync(fileURLToPath(controlledEvidenceUrl));
const controlledEvidence = controlledEvidenceAvailable ? await import(controlledEvidenceUrl) : {};
const {
  acquireExclusiveRunLock,
  buildAcceptanceArtifacts,
  captureSingleRequestRun,
  createLocalModelTelemetryObserver,
  createOpenWebUiTelemetryObserver,
  createRunIdentity,
  loadProjectEnv
} = controlledEvidence;
const controlledTest = controlledEvidenceAvailable ? test : test.skip;

controlledTest("v2.3.15 controlled runner loads project env without exposing values", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "v2315-env-"));
  const envPath = path.join(root, ".env");
  await writeFile(envPath, "LOCAL_MODEL_ENABLED=true\nLOCAL_MODEL_ID=test-model\nOPENWEBUI_API_KEY=secret-value\n", "utf8");
  const previousEnabled = process.env.LOCAL_MODEL_ENABLED;
  const previousModelId = process.env.LOCAL_MODEL_ID;
  delete process.env.LOCAL_MODEL_ENABLED;
  delete process.env.LOCAL_MODEL_ID;
  try {
    const summary = loadProjectEnv({ projectRoot: root, envPath });
    assert.deepEqual(summary, { local_model_enabled: true, local_model_id_configured: true });
    assert.equal(process.env.LOCAL_MODEL_ENABLED, "true");
    assert.equal(process.env.LOCAL_MODEL_ID, "test-model");
    assert.equal(JSON.stringify(summary).includes("secret-value"), false);
  } finally {
    if (previousEnabled === undefined) delete process.env.LOCAL_MODEL_ENABLED;
    else process.env.LOCAL_MODEL_ENABLED = previousEnabled;
    if (previousModelId === undefined) delete process.env.LOCAL_MODEL_ID;
    else process.env.LOCAL_MODEL_ID = previousModelId;
  }
});

controlledTest("v2.3.15 controlled runner fails fast when project env is absent", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "v2315-env-missing-"));
  assert.throws(
    () => loadProjectEnv({ projectRoot: root, envPath: path.join(root, ".env") }),
    error => error?.code === "PROJECT_ENV_REQUIRED"
  );
});

controlledTest("v2.3.15 controlled telemetry observes the generic OpenAI-compatible endpoint", async () => {
  const endpoint = "http://127.0.0.1:1234/v1/chat/completions";
  const responses = [];
  const fetchImpl = async input => {
    responses.push(String(input));
    return new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ sections: [] }) } }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const observer = createLocalModelTelemetryObserver({ fetchImpl, endpoint });

  await observer.fetch(endpoint, {
    method: "POST",
    body: JSON.stringify({ messages: [{ role: "user", content: "{}" }] })
  });

  assert.deepEqual(responses, [endpoint]);
  assert.equal(observer.calls.length, 1);
  assert.equal(observer.calls[0].kind, "initial");
});

controlledTest("v2.3.15 legacy OpenWebUI observer remains a behavior-only alias", async () => {
  const endpoint = "http://127.0.0.1:7788/custom/chat/completions";
  const observer = createOpenWebUiTelemetryObserver({
    endpoint,
    fetchImpl: async () => new Response(JSON.stringify({ choices: [] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    })
  });
  await observer.fetch(endpoint, { method: "POST", body: "{}" });
  assert.equal(observer.calls.length, 1);
});

controlledTest("v2.3.15 evidence harness rejects a concurrent runner before any request", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "v2315-lock-"));
  const lockPath = path.join(root, ".run.lock");
  const first = await acquireExclusiveRunLock(lockPath, { run_id: "run-a", pid: 101 });
  try {
    await assert.rejects(
      acquireExclusiveRunLock(lockPath, { run_id: "run-b", pid: 202 }),
      error => error?.code === "EVIDENCE_RUN_LOCKED"
    );
  } finally {
    await first.release();
    await rm(root, { recursive: true, force: true });
  }
});

controlledTest("v2.3.15 evidence harness sends at most one request and writes one unique paired run", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "v2315-capture-"));
  let requestCount = 0;
  try {
    const identity = createRunIdentity({
      now: new Date("2026-07-14T08:00:00.000Z"),
      pid: 303,
      runId: "run-safe"
    });
    const result = await captureSingleRequestRun({
      rootDir: root,
      lockPath: path.join(root, ".run.lock"),
      identity,
      executeRequest: async run => {
        requestCount += 1;
        return {
          publicResponse: { request_id: "req-safe", run_id: run.run_id, status: 422 },
          internalDiagnostics: { request_id: "req-safe", run_id: run.run_id, score: 97 }
        };
      }
    });

    assert.equal(requestCount, 1);
    assert.equal(result.valid_for_acceptance, true);
    assert.match(path.basename(result.evidence_dir), /^20260714-160000-pid-303-run-run-safe$/);
    const files = await readdir(result.evidence_dir);
    assert.ok(files.includes("public-response.json"));
    assert.ok(files.includes("internal-diagnostics.json"));
    const publicEvidence = JSON.parse(await readFile(path.join(result.evidence_dir, "public-response.json"), "utf8"));
    const internalEvidence = JSON.parse(await readFile(path.join(result.evidence_dir, "internal-diagnostics.json"), "utf8"));
    assert.equal(publicEvidence.run_id, "run-safe");
    assert.equal(internalEvidence.run_id, "run-safe");
    assert.equal(publicEvidence.request_id, internalEvidence.request_id);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

controlledTest("v2.3.15 evidence harness writes the complete paired acceptance evidence set", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "v2315-evidence-set-"));
  try {
    const identity = createRunIdentity({
      now: new Date("2026-07-14T08:05:00.000Z"),
      pid: 313,
      runId: "run-evidence-set"
    });
    const result = await captureSingleRequestRun({
      rootDir: root,
      lockPath: path.join(root, ".run.lock"),
      identity,
      executeRequest: async run => ({
        publicResponse: { request_id: "req-evidence-set", run_id: run.run_id, http_status: 422 },
        internalDiagnostics: { request_id: "req-evidence-set", run_id: run.run_id, score: 97 },
        requestMetadata: { request_id: "req-evidence-set", run_id: run.run_id, http_status: 422 },
        safeSummary: { request_id: "req-evidence-set", run_id: run.run_id, score: 97 },
        harnessSafeLog: { request_id: "req-evidence-set", run_id: run.run_id, event: "request_complete" }
      })
    });

    assert.equal(result.valid_for_acceptance, true);
    const files = await readdir(result.evidence_dir);
    for (const file of [
      "public-response.json",
      "internal-diagnostics.json",
      "request-metadata.json",
      "safe-summary.json",
      "evidence-index.json",
      "harness-safe-log.json"
    ]) {
      assert.ok(files.includes(file), `missing ${file}`);
      const evidence = JSON.parse(await readFile(path.join(result.evidence_dir, file), "utf8"));
      assert.equal(evidence.request_id, "req-evidence-set");
      assert.equal(evidence.run_id, "run-evidence-set");
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

controlledTest("v2.3.15 evidence harness quarantines mismatched request ids instead of writing canonical evidence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "v2315-mismatch-"));
  try {
    const identity = createRunIdentity({ pid: 404, runId: "run-mismatch" });
    const result = await captureSingleRequestRun({
      rootDir: root,
      lockPath: path.join(root, ".run.lock"),
      identity,
      executeRequest: async run => ({
        publicResponse: { request_id: "req-public", run_id: run.run_id },
        internalDiagnostics: { request_id: "req-internal", run_id: run.run_id }
      })
    });

    assert.equal(result.valid_for_acceptance, false);
    assert.equal(result.invalid_reason, "REQUEST_ID_MISMATCH");
    const files = await readdir(result.evidence_dir);
    assert.ok(files.includes("invalid-run.json"));
    assert.ok(!files.includes("public-response.json"));
    assert.ok(!files.includes("internal-diagnostics.json"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

controlledTest("v2.3.15 evidence harness quarantines a mismatched metadata request id", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "v2315-metadata-mismatch-"));
  try {
    const identity = createRunIdentity({ pid: 414, runId: "run-metadata-mismatch" });
    const result = await captureSingleRequestRun({
      rootDir: root,
      lockPath: path.join(root, ".run.lock"),
      identity,
      executeRequest: async run => ({
        publicResponse: { request_id: "req-paired", run_id: run.run_id },
        internalDiagnostics: { request_id: "req-paired", run_id: run.run_id },
        requestMetadata: { request_id: "req-other", run_id: run.run_id }
      })
    });

    assert.equal(result.valid_for_acceptance, false);
    assert.equal(result.invalid_reason, "REQUEST_ID_MISMATCH");
    const files = await readdir(result.evidence_dir);
    assert.ok(files.includes("invalid-run.json"));
    assert.ok(!files.includes("request-metadata.json"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

controlledTest("v2.3.15 evidence harness writes only allowed diagnostic fields", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "v2315-safe-fields-"));
  try {
    const identity = createRunIdentity({ pid: 424, runId: "run-safe-fields" });
    const result = await captureSingleRequestRun({
      rootDir: root,
      lockPath: path.join(root, ".run.lock"),
      identity,
      executeRequest: async run => ({
        publicResponse: {
          request_id: "req-safe-fields",
          run_id: run.run_id,
          http_status: 422,
          Authorization: "Bearer MUST_NOT_PERSIST",
          allocation_data: { internal_slot_plan: "MUST_NOT_PERSIST" },
          outline: { slides: [{ content: "客户原文不得落盘" }] }
        },
        internalDiagnostics: {
          request_id: "req-safe-fields",
          run_id: run.run_id,
          score: 97,
          threshold: 95,
          api_key: "MUST_NOT_PERSIST",
          prompt: "完整提示词不得落盘",
          planning_model: {
            used: true,
            raw_model_response: "完整模型响应不得落盘",
            planner_response_structure_diagnostics: {
              selected_container: "sections",
              raw_item_count: 10,
              parseable_item_count: 10,
              retained_section_count: 10
            }
          },
          provenance: [{ content_item_id: "private", text: "模型原文不得落盘" }]
        },
        requestMetadata: { request_id: "req-safe-fields", run_id: run.run_id, http_status: 422 }
      })
    });

    const internal = JSON.parse(await readFile(path.join(result.evidence_dir, "internal-diagnostics.json"), "utf8"));
    const publicEvidence = JSON.parse(await readFile(path.join(result.evidence_dir, "public-response.json"), "utf8"));
    const serialized = JSON.stringify({ internal, publicEvidence });
    assert.equal(internal.score, 97);
    assert.equal(internal.planning_model.used, true);
    assert.equal(internal.planning_model.initial.selected_container, "sections");
    assert.doesNotMatch(serialized, /MUST_NOT_PERSIST|完整提示词|完整模型响应|客户原文|模型原文/);
    assert.deepEqual(internal.provenance, {
      generated_count: 0,
      sanitized_count: 0,
      final_count: 0,
      dropped_count: 0,
      drop_reason_counts: {}
    });
    assert.equal("content_item_id" in internal.provenance, false);
    assert.equal("text" in internal.provenance, false);
    assert.equal("outline" in publicEvidence, false);
    assert.equal(publicEvidence.public_api_redaction.allocation_data_leak_detected, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

controlledTest("v2.3.15 evidence accepts a public outline but persists only result metadata", () => {
  const identity = createRunIdentity({ pid: 428, runId: "run-result-metadata" });
  const artifacts = buildAcceptanceArtifacts({
    publicResponse: {
      request_id: "req-result-metadata",
      run_id: identity.run_id,
      http_status: 200,
      success: true,
      quality_status: "review_required",
      score: 92,
      production_threshold: 95,
      review_warnings: ["material_relevance"],
      source_summary: {
        model_attempted: true,
        model_used: true,
        model_id: "local/model-7b",
        model_content_retained: false,
        deterministic_completion_used: true,
        fallback_used: false
      },
      customer_version: "CUSTOMER_BODY_MUST_NOT_PERSIST",
      production_version: "PRODUCTION_BODY_MUST_NOT_PERSIST",
      outline: {
        title: "OUTLINE_TITLE_MUST_NOT_PERSIST",
        sections: [
          { title: "PAGE_ONE_MUST_NOT_PERSIST" },
          { title: "PAGE_TWO_MUST_NOT_PERSIST" }
        ]
      }
    },
    internalDiagnostics: {
      request_id: "req-result-metadata",
      run_id: identity.run_id,
      score: 92,
      threshold: 95
    },
    requestMetadata: {
      request_id: "req-result-metadata",
      run_id: identity.run_id,
      http_status: 200,
      endpoint_request_count: 1
    }
  }, identity, 1);

  assert.equal(artifacts.publicResponse.public_api_redaction.passed, true);
  assert.deepEqual(artifacts.publicResponse.result_presence, {
    customer_version: { nonempty: true, character_count: 30 },
    production_version: { nonempty: true, character_count: 32 },
    outline: { nonempty: true, page_count: 2 }
  });
  assert.deepEqual(artifacts.publicResponse.source_summary, {
    model_attempted: true,
    model_used: true,
    model_id: "local/model-7b",
    model_content_retained: false,
    deterministic_completion_used: true,
    fallback_used: false
  });
  const serialized = JSON.stringify(artifacts);
  assert.doesNotMatch(serialized, /CUSTOMER_BODY|PRODUCTION_BODY|OUTLINE_TITLE|PAGE_ONE|PAGE_TWO/);
});

controlledTest("v2.3.15 evidence detects value-level secrets and internal runtime data", () => {
  const identity = createRunIdentity({ pid: 429, runId: "run-value-leaks" });
  const artifacts = buildAcceptanceArtifacts({
    publicResponse: {
      request_id: "req-value-leaks",
      run_id: identity.run_id,
      http_status: 200,
      success: true,
      quality_status: "review_required",
      source_summary: {
        model_attempted: true,
        model_used: true,
        model_id: "/Users/example/private/model.gguf"
      },
      customer_version: [
        "Authorization: Bearer test-local-secret",
        "本机文件 /Users/example/private/project.json",
        "system_prompt: do not expose this",
        `sha256=${"a".repeat(64)}`,
        "lineage_parent=planner-private",
        "allocation_priority=7"
      ].join("\n"),
      production_version: "safe production summary",
      outline: { sections: [{ title: "safe" }] }
    },
    internalDiagnostics: {
      request_id: "req-value-leaks",
      run_id: identity.run_id,
      planning_model: {
        status: "rejected",
        planning_rejection_reason: "sk-internal"
      }
    },
    requestMetadata: {
      request_id: "req-value-leaks",
      run_id: identity.run_id,
      http_status: 200
    }
  }, identity, 1);

  assert.equal(artifacts.publicResponse.public_api_redaction.passed, false);
  assert.equal(artifacts.publicResponse.public_api_redaction.detected_value_leak_count, 6);
  assert.deepEqual(artifacts.publicResponse.public_api_redaction.value_leak_categories, [
    "allocation",
    "hash",
    "lineage",
    "local_path",
    "prompt",
    "secret"
  ]);
  assert.doesNotMatch(JSON.stringify(artifacts), /test-local-secret|sk-internal|\/Users\/example|do not expose|planner-private/);
  assert.equal(artifacts.publicResponse.source_summary.model_id, "");
  assert.equal(artifacts.internalDiagnostics.planning_model.planning_rejection_reason, "");
});

controlledTest("v2.3.15 evidence harness preserves safe fulfillment acceptance evidence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "v2315-fulfillment-evidence-"));
  try {
    const identity = createRunIdentity({ pid: 434, runId: "run-fulfillment-evidence" });
    const result = await captureSingleRequestRun({
      rootDir: root,
      lockPath: path.join(root, ".run.lock"),
      identity,
      executeRequest: async run => ({
        publicResponse: {
          request_id: "req-fulfillment-evidence",
          run_id: run.run_id,
          http_status: 200,
          quality_report: { score: 97, threshold: 95, passed: true }
        },
        internalDiagnostics: {
          request_id: "req-fulfillment-evidence",
          run_id: run.run_id,
          score: 97,
          threshold: 95,
          requirement_fulfillment: {
            records: [
              {
                origin: "deterministic_requirement_fulfillment",
                source_type: "explicit_requirement",
                fulfillment_reason: "REQUIREMENT_BINDING_CONTENT_MISSING",
                requirement_id: "private-parent-id",
                atomic_requirement_id: "private-atomic-id",
                source_hash: "private-hash",
                text: "客户要求原文不得写入安全摘要"
              }
            ],
            diagnostics: {
              attempted: true,
              pre_residual_count: 1,
              post_residual_count: 0,
              fulfilled_count: 1,
              unresolved_count: 0,
              generated_bullet_count: 1,
              generated_character_count: 24,
              per_section: [{
                canonical_section_id: "model",
                bullet_count_before: 3,
                bullet_count_after: 4,
                character_count_before: 120,
                character_count_after: 144,
                generated_bullet_count: 1,
                generated_character_count: 24,
                budget_rejection_reason: ""
              }],
              unresolved: []
            }
          },
          required_section_diagnostics: [{
            required_item: "合作要求",
            covered: true,
            atomic_requirements: [{
              atomic_requirement: "活动合作",
              covered: true,
              matched_page: 6,
              expected_page: null,
              coverage_reason: "semantic_match",
              missing_terms: []
            }]
          }]
        },
        requestMetadata: {
          request_id: "req-fulfillment-evidence",
          run_id: run.run_id,
          http_status: 200,
          endpoint_request_count: 1,
          internal_model_call_count: 2
        }
      })
    });

    const internal = JSON.parse(await readFile(path.join(result.evidence_dir, "internal-diagnostics.json"), "utf8"));
    const summary = JSON.parse(await readFile(path.join(result.evidence_dir, "safe-summary.json"), "utf8"));
    const publicEvidence = JSON.parse(await readFile(path.join(result.evidence_dir, "public-response.json"), "utf8"));
    assert.deepEqual(internal.requirement_fulfillment, {
      attempted: true,
      record_count: 1,
      origin_counts: { deterministic_requirement_fulfillment: 1 },
      source_type_counts: { explicit_requirement: 1 },
      fulfillment_reason_counts: { REQUIREMENT_BINDING_CONTENT_MISSING: 1 },
      pre_residual_count: 1,
      post_residual_count: 0,
      fulfilled_count: 1,
      unresolved_count: 0,
      generated_bullet_count: 1,
      generated_character_count: 24,
      per_section: [{
        canonical_section_id: "model",
        bullet_count_before: 3,
        bullet_count_after: 4,
        character_count_before: 120,
        character_count_after: 144,
        generated_bullet_count: 1,
        generated_character_count: 24,
        budget_rejection_reason: ""
      }],
      unresolved_reason_counts: {}
    });
    assert.deepEqual(internal.required_atomic_matrix, [{
      atomic_requirement: "活动合作",
      covered: true,
      matched_page: 6,
      expected_page: "",
      coverage_reason: "semantic_match",
      missing_terms: []
    }]);
    assert.equal(summary.requirement_fulfillment.post_residual_count, 0);
    assert.equal(summary.requirement_fulfillment.source_type_counts.explicit_requirement, 1);
    const serialized = JSON.stringify({ internal, summary, publicEvidence });
    assert.doesNotMatch(serialized, /private-parent-id|private-atomic-id|private-hash|客户要求原文/);
    assert.equal("requirement_fulfillment" in publicEvidence.quality_report, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

controlledTest("v2.3.15 evidence harness releases its lock after a single failed request", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "v2315-release-"));
  const lockPath = path.join(root, ".run.lock");
  let requestCount = 0;
  try {
    await assert.rejects(
      captureSingleRequestRun({
        rootDir: root,
        lockPath,
        identity: createRunIdentity({ pid: 505, runId: "run-error" }),
        executeRequest: async () => {
          requestCount += 1;
          throw new Error("controlled failure");
        }
      }),
      /controlled failure/
    );
    assert.equal(requestCount, 1);
    const next = await acquireExclusiveRunLock(lockPath, { run_id: "run-next", pid: 606 });
    await next.release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
