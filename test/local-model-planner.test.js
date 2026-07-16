import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { generateOutline } from "../lib/generate-outline.js";
import {
  buildPlannerResponsePathDiagnostics,
  buildAllowedSectionCatalog,
  extractJsonObject,
  loadLocalModelConfig,
  planWithLocalModel,
  validatePlanningResponse
} from "../lib/local-model-planner.js";
import { createRequirementBindings } from "../lib/requirement-binding.js";
import { buildRequestAuthority, parseRequestContext } from "../lib/request-context.js";
import { buildNarrativePlan } from "../lib/narrative-planner.js";
import { createAppServer } from "../server.js";

const API_KEY = "local-secret-for-test-only";

function modelEnv(overrides = {}) {
  return {
    LOCAL_MODEL_ENABLED: "true",
    LOCAL_MODEL_PROVIDER: "openai-compatible",
    LOCAL_MODEL_BASE_URL: "http://127.0.0.1:11434/v1",
    LOCAL_MODEL_API_KEY: API_KEY,
    LOCAL_MODEL_ID: "test-local-model",
    ...overrides
  };
}

test("local model config is disabled by default without inventing a provider route or model", () => {
  const config = loadLocalModelConfig({});
  assert.equal(config.enabled, false);
  assert.equal(config.timeoutMs, 120000);
  assert.equal(config.provider, "openai-compatible");
  assert.equal(config.endpoint, "");
  assert.equal(config.modelId, "");
});

test("missing endpoint and model never trigger a request even when a placeholder key is present", async () => {
  let calls = 0;
  const result = await planWithLocalModel({}, contextFor("客户画像分析"), {
    env: { LOCAL_MODEL_ENABLED: "true", LOCAL_MODEL_API_KEY: "replace_with_local_key" },
    fetchImpl: async () => { calls += 1; }
  });
  assert.equal(calls, 0);
  assert.equal(result.metadata.status, "fallback");
  assert.equal(result.metadata.reason_code, "LOCAL_MODEL_CONFIG_MISSING");
});

test("different PPT types expose different canonical section whitelists", () => {
  const persona = buildAllowedSectionCatalog(contextFor("新能源汽车客户画像分析"));
  const project = buildAllowedSectionCatalog(contextFor("园区招商项目方案"));
  assert.ok(persona.includes("segments"));
  assert.ok(!project.includes("segments"));
  assert.ok(project.includes("architecture"));
});

test("JSON extraction accepts plain, fenced and explanatory responses with escaped braces", () => {
  const expected = { text: "quoted \\\"{value}\\\"", nested: { ok: true } };
  for (const source of [
    JSON.stringify(expected),
    `\`\`\`json\n${JSON.stringify(expected)}\n\`\`\``,
    `分析完成。${JSON.stringify(expected)}以上是结果。`,
    `先忽略说明中的 {not-json}，正式结果是 ${JSON.stringify(expected)}`
  ]) {
    assert.deepEqual(JSON.parse(extractJsonObject(source)), expected);
  }
  assert.throws(() => extractJsonObject("说明 {\"a\": 1"));
});

test("planning response accepts only canonical section IDs and allowed roles", () => {
  const result = validatePlanningResponse({
    recommended_page_count: 8,
    sections: [
      { section_id: "cover", title: "封面", role: "cover", objective: "界定主题" },
      { section_id: "dataBasis", title: "数据", role: "evidence", objective: "证据基础" },
      { section_id: "segments", title: "分群", role: "analysis", objective: "提出假设" },
      { section_id: "invented", title: "虚构", role: "analysis", objective: "不得进入" },
      { section_id: "implications", title: "行动", role: "admin", objective: "错误角色" }
    ]
  }, ["cover", "dataBasis", "segments", "implications"]);
  assert.deepEqual(result.sections.map(item => item.section_id), ["cover", "dataBasis", "segments"]);
  assert.equal(result.recommended_page_count, 8);
  assert.equal(result.planner_response_structure_diagnostics.selected_container, "sections");
  assert.throws(() => validatePlanningResponse(JSON.parse('{"nested":{"__proto__":{"polluted":true}}}'), ["cover"]));
  assert.equal(validatePlanningResponse({ audience: "目标听众" }, ["cover"]).audience, "");
});

test("planning response keeps valid sections when model uses section-like role labels", () => {
  const result = validatePlanningResponse({
    recommended_page_count: 12,
    sections: [
      { section_id: "cover", title: "封面", role: "cover", objective: "建立主题" },
      { section_id: "positioning", title: "产业定位", role: "positioning", objective: "说明产业方向" },
      { section_id: "resources", title: "空间资源", role: "resources", objective: "说明载体条件" },
      { section_id: "plan", title: "招商计划", role: "plan", objective: "说明行动路径" },
      { section_id: "invented", title: "虚构页", role: "plan", objective: "不得进入" }
    ]
  }, ["cover", "background", "positioning", "resources", "plan"]);
  assert.deepEqual(result.sections.map(item => item.section_id), ["cover", "positioning", "resources", "plan"]);
  assert.deepEqual(result.sections.map(item => item.role), ["cover", "background", "evidence", "action"]);
});

test("planning response records only safe structure diagnostics when sections are filtered", () => {
  const result = validatePlanningResponse({
    slides: [
      { section_id: "cover", title: "private title", role: "cover", key_message: "private message", bullets: ["private bullet"] },
      { section_id: "positioning", title: "private title", role: "positioning", keyMessage: "alternate private message", bullets: "not-an-array" },
      { section_id: "invented", title: "private title", role: "analysis", key_message: "private message" },
      { section_id: "resources", title: "private title", role: "not-an-allowed-role", key_message: "private message" }
    ],
    pages: [{ section_id: "should-not-be-selected" }],
    requirement_bindings: [{ requirement_id: "private-parent", atomic_requirements: [{ requirement_id: "private-atomic", canonical_section_id: "cover" }] }]
  }, ["cover", "positioning", "resources"]);

  const diagnostics = result.planner_response_structure_diagnostics;
  assert.equal(diagnostics.response_root_type, "object");
  assert.equal(diagnostics.parsed_root_type, "object");
  assert.deepEqual(diagnostics.container_presence, { sections: false, slides: true, pages: true, outline: false });
  assert.equal(diagnostics.selected_container, "slides");
  assert.equal(diagnostics.raw_item_count, 4);
  assert.equal(diagnostics.parseable_item_count, 4);
  assert.equal(diagnostics.canonical_section_id_hit_count, 3);
  assert.equal(diagnostics.noncanonical_section_id_count, 1);
  assert.equal(diagnostics.valid_role_count, 2);
  assert.equal(diagnostics.invalid_role_count, 2);
  assert.equal(diagnostics.missing_role_count, 0);
  assert.equal(diagnostics.key_message_present_count, 3);
  assert.equal(diagnostics.keyMessage_present_count, 1);
  assert.equal(diagnostics.bullet_item_total, 1);
  assert.equal(diagnostics.requirement_binding_parent_count, 1);
  assert.equal(diagnostics.requirement_binding_atomic_count, 1);
  assert.equal(diagnostics.accepted_section_count, 3);
  assert.equal(diagnostics.filtered_section_count, 1);
  assert.equal(diagnostics.retained_section_count, 3);
  assert.equal(diagnostics.filter_reason_counts.noncanonical_section_id, 1);
  assert.equal(diagnostics.filter_reason_counts.invalid_role, 0);
  assert.equal(diagnostics.filter_reason_counts.insufficient_sections, 0);
  assert.match(diagnostics.safe_structure_hash, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(diagnostics), /private|invented|positioning|resources|cover/i);
});

test("planner response path diagnostics observe nested wrapper containers without reading planner text", () => {
  const result = validatePlanningResponse({
    analysis: {
      sections: [
        { section_id: "cover", role: "cover", key_message: "private planner message", bullets: ["private bullet"] }
      ]
    },
    result: {
      plan: {
        slides: [
          { sectionId: "resources", type: "evidence", keyMessage: "private nested message", points: ["private point"] }
        ]
      }
    },
    custom_wrapper: {
      outline: [{ id: "private-id", content: "private custom content" }]
    }
  }, ["cover", "resources"]);

  const diagnostics = result.planner_response_path_diagnostics;
  assert.equal(diagnostics.response_root_type, "object");
  assert.ok(diagnostics.safe_root_keys.includes("analysis"));
  assert.ok(diagnostics.safe_root_keys.includes("result"));
  assert.ok(diagnostics.safe_root_keys.includes("custom_wrapper"));
  assert.ok(diagnostics.candidate_container_paths.includes("$.analysis.sections"));
  assert.ok(diagnostics.candidate_container_paths.includes("$.result.plan.slides"));
  assert.ok(diagnostics.candidate_container_paths.includes("$.custom_wrapper.outline"));
  assert.deepEqual(diagnostics.nested_sections_paths, ["$.analysis.sections"]);
  assert.deepEqual(diagnostics.nested_slides_paths, ["$.result.plan.slides"]);
  assert.ok(diagnostics.candidate_array_count >= 2);
  assert.ok(diagnostics.candidate_object_array_paths.length >= 3);
  assert.ok(diagnostics.candidate_item_key_signatures.length >= 3);
  assert.doesNotMatch(JSON.stringify(diagnostics), /private planner|private bullet|private nested|private point/i);
  assert.match(diagnostics.safe_structure_path_hash, /^[a-f0-9]{64}$/);
});

test("planner response path diagnostics hash unsafe keys and truncate cyclic or over-limit traversal", () => {
  const unsafeKey = "unsafe key with customer text";
  const response = { sections: [{ section_id: "cover", role: "cover" }] };
  response[unsafeKey] = { pages: Array.from({ length: 4 }, () => ({ content: "private" })) };
  response.loop = response;
  let cursor = response;
  for (let index = 0; index < 4; index += 1) {
    cursor.next = { value: index };
    cursor = cursor.next;
  }

  const diagnostics = buildPlannerResponsePathDiagnostics(response);
  assert.equal(diagnostics.traversal_truncated, true);
  assert.equal(diagnostics.maximum_observed_depth, 3);
  assert.ok(diagnostics.safe_root_keys.some(key => key.startsWith("hash:")));
  assert.equal(JSON.stringify(diagnostics).includes(unsafeKey), false);
  assert.equal(JSON.stringify(diagnostics).includes("private"), false);
  assert.ok(diagnostics.candidate_array_lengths.some(item => item.path === "$.sections" && item.length === 1));
});

test("a valid root single section enters normal validation without being accepted as a full plan", () => {
  const result = validatePlanningResponse(rootSingleSection(), ["cover", "dataBasis", "segments"]);

  assert.equal(result.planner_response_structure_diagnostics.selected_container, "root_single_section");
  assert.equal(result.planner_response_structure_diagnostics.raw_item_count, 1);
  assert.equal(result.planner_response_structure_diagnostics.parseable_item_count, 1);
  assert.equal(result.sections.length, 0);
  assert.equal(result.validated_repair_candidates.length, 1);
  assert.equal(result.validated_repair_candidates[0].section_id, "cover");
});

test("a valid root single section is normalized once and completed without a model retry", async () => {
  await withModelEnvironment(async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return modelResponse(calls === 1
        ? rootSingleSection()
        : withPlannerBusinessContent(validAnalysis({ recommended_page_count: 3 })));
    };
    try {
      const runtime = {};
      const result = await generateOutline({
        requirement: "制作新能源汽车客户画像分析",
        audience: "管理层",
        purpose: "内部汇报",
        page_count: 3
      }, { runtime });
      assert.equal(calls, 1);
      assert.equal(runtime.internalDiagnostics.planning_model.repair_attempted, false);
      assert.equal(runtime.internalDiagnostics.planning_model.repaired, false);
      assert.equal(result.quality_report.planning_model.fallback_used, false);
      assert.equal(result.slides.length, 3);
      assert.equal(result.quality_status, "review_required");
      assert.equal(runtime.internalDiagnostics.planning_model.planner_response_structure_diagnostics.planning_section_intent_count, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("an invalid root section shape receives one normalization repair then safely falls back", async () => {
  const context = { ...contextFor("客户画像分析"), pageCount: 3, manualPageCount: true };
  let calls = 0;
  const result = await planWithLocalModel({ requirement: "客户画像分析", page_count: 3 }, context, {
    env: modelEnv(),
    fetchImpl: async () => {
      calls += 1;
      return modelResponse({ section_id: "not_allowed", role: "not_a_role", key_message: "错误结构" });
    }
  });

  assert.equal(calls, 2);
  assert.equal(result.analysis, null);
  assert.equal(result.metadata.fallback_used, true);
  assert.equal(result.metadata.repair_attempted, true);
  assert.equal(result.metadata.planning_rejection_reason, "REPAIR_INVALID_MODEL_JSON");
});

test("ordinary envelope objects are not mistaken for root single sections", () => {
  const result = validatePlanningResponse({ requirement_summary: "说明", audience: "管理层" }, ["cover"]);
  assert.equal(result.planner_response_structure_diagnostics.selected_container, "unsupported");
  assert.equal(result.sections.length, 0);
});

test("usable sections filtered by the legacy validator are retained by the model normalizer", async () => {
  const context = contextFor("客户画像分析");
  const result = await planWithLocalModel({ requirement: "客户画像分析" }, context, {
    env: modelEnv(),
    fetchImpl: async () => modelResponse({
      slides: [
        { section_id: "cover", role: "cover", key_message: "private message" },
        { section_id: "segments", role: "analysis", key_message: "private message" }
      ]
    })
  });

  assert.equal(result.analysis.sections.length, 2);
  assert.deepEqual(result.analysis.sections.map(section => section.section_id), ["cover", "segments"]);
  assert.equal(result.metadata.used, true);
  assert.equal(result.metadata.fallback_used, false);
  assert.equal(result.metadata.repair_attempted, false);
  assert.equal(result.metadata.planner_response_structure_diagnostics.retained_section_count, 2);
  assert.equal(result.metadata.planner_response_structure_diagnostics.selected_container, "normalized_model_output");
  assert.doesNotMatch(JSON.stringify(result.metadata.planner_response_structure_diagnostics), /private|segments|cover/i);
});

test("model request receives the current type-specific whitelist and keeps the key server-side", async () => {
  const context = contextFor("新能源汽车客户画像分析");
  const allowed = buildAllowedSectionCatalog(context);
  let captured;
  const result = await planWithLocalModel({ requirement: "新能源汽车客户画像分析" }, context, {
    env: {
      LOCAL_MODEL_ENABLED: "true",
      OPENWEBUI_API_KEY: API_KEY,
      OPENWEBUI_BASE_URL: "http://127.0.0.1:8080",
      LOCAL_MODEL_ID: "qwen3:32b"
    },
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return modelResponse(validAnalysis({ audience: "管理层", recommended_page_count: 9 }));
    }
  });
  assert.equal(result.metadata.used, true);
  assert.equal(captured.url, "http://127.0.0.1:8080/api/chat/completions");
  assert.equal(captured.options.headers.Authorization, `Bearer ${API_KEY}`);
  const body = JSON.parse(captured.options.body);
  const prompt = JSON.parse(body.messages[1].content);
  assert.deepEqual(prompt.allowed_canonical_section_ids, allowed);
  assert.ok(prompt.allowed_canonical_section_ids.includes("segments"));
  assert.doesNotMatch(JSON.stringify(result), new RegExp(API_KEY));
});

test("the initial structured-output request exposes the page envelope without requiring a content retry", async () => {
  const context = { ...contextFor("新能源汽车客户画像分析"), pageCount: 3, manualPageCount: true };
  const allowed = buildAllowedSectionCatalog(context);
  const capturedBodies = [];
  const result = await planWithLocalModel({ requirement: "新能源汽车客户画像分析", page_count: 3 }, context, {
    env: modelEnv({ LOCAL_MODEL_SUPPORTS_JSON_SCHEMA: "true" }),
    fetchImpl: async (_url, options) => {
      capturedBodies.push(JSON.parse(options.body));
      return modelResponse(capturedBodies.length === 1
        ? rootSingleSection()
        : withPlannerBusinessContent(validAnalysis({ recommended_page_count: 3 })));
    }
  });

  assert.equal(result.metadata.repaired, false);
  assert.equal(capturedBodies.length, 1);
  for (const body of capturedBodies) {
    assert.equal(body.response_format.type, "json_schema");
    const schema = body.response_format.json_schema.schema;
    assert.deepEqual(schema.required, ["sections", "requirement_bindings"]);
    assert.equal(schema.properties.sections.minItems, 3);
    assert.equal(schema.properties.sections.maxItems, 3);
    assert.deepEqual(schema.properties.sections.items.properties.section_id.enum, allowed);
    assert.deepEqual(schema.properties.sections.items.properties.role.enum, [
      "cover", "background", "evidence", "analysis", "insight", "recommendation", "action"
    ]);
    assert.deepEqual(schema.properties.sections.items.required, [
      "section_id", "title", "role", "objective", "key_message", "bullets", "visual_direction", "evidence_status"
    ]);
  }
});

test("invalid JSON safely falls back regardless of the removed strict-model legacy flag", async () => {
  const fetchImpl = async () => modelResponseText("这里没有 JSON");
  const fallback = await planWithLocalModel({}, contextFor("客户画像分析"), {
    env: modelEnv(),
    fetchImpl
  });
  assert.equal(fallback.metadata.reason_code, "INVALID_MODEL_JSON");
  const legacyStrict = await planWithLocalModel({}, contextFor("客户画像分析"), {
    env: modelEnv({ LOCAL_MODEL_REQUIRED: "true" }),
    fetchImpl
  });
  assert.equal(legacyStrict.metadata.status, "fallback");
  assert.equal(legacyStrict.metadata.reason_code, "INVALID_MODEL_JSON");
});

test("timeout and oversized upstream responses produce safe reason codes", async () => {
  const timeout = await planWithLocalModel({}, contextFor("客户画像分析"), {
    env: modelEnv(),
    fetchImpl: async () => { throw new DOMException("timed out", "AbortError"); }
  });
  assert.equal(timeout.metadata.reason_code, "LOCAL_MODEL_TIMEOUT");

  const oversized = await planWithLocalModel({}, contextFor("客户画像分析"), {
    env: modelEnv(),
    fetchImpl: async () => new Response("{}", { status: 200, headers: { "Content-Length": String(300000) } })
  });
  assert.equal(oversized.metadata.reason_code, "INVALID_MODEL_RESPONSE");
});

test("explicit audience, purpose and page count remain authoritative over model analysis", () => {
  const input = {
    requirement: "制作新能源汽车客户画像",
    audience: "管理层",
    purpose: "内部经营汇报",
    page_count: 6
  };
  const model = {
    audience: "潜在客户",
    purpose: "对外销售",
    recommended_page_count: 15,
    industry: "餐饮",
    business_scenario: "外部路演",
    sections: []
  };
  const originalAuthority = buildRequestAuthority(input);
  const authority = buildRequestAuthority(input, model);
  const context = parseRequestContext(input, authority, model);
  assert.equal(context.audience, "管理层");
  assert.equal(context.purpose, "内部经营汇报");
  assert.equal(context.pageCount, 6);
  assert.equal(originalAuthority.audience.value, "管理层");
  assert.equal(Object.isFrozen(originalAuthority), true);
});

test("model suggestions fill only missing audience, purpose, scenario and automatic page count", () => {
  const input = { requirement: "制作一份企业主题演示" };
  const model = {
    audience: "项目评审委员会",
    purpose: "项目立项评审",
    recommended_page_count: 11,
    industry: "通用行业",
    business_scenario: "内部立项",
    sections: []
  };
  const authority = buildRequestAuthority(input, model);
  const context = parseRequestContext(input, authority, model);
  assert.equal(authority.audience.source, "local_model");
  assert.equal(context.audience, "项目评审委员会");
  assert.equal(context.purpose, "项目立项评审");
  assert.equal(context.scenario, "内部立项");
  assert.equal(context.pageCount, 11);
  assert.equal(context.manualPageCount, false);
});

test("a purpose stated in the original requirement outranks model inference", () => {
  const input = { requirement: "制作企业数字化方案，用于内部项目评审" };
  const model = { purpose: "对外销售路演", recommended_page_count: 9, sections: [] };
  const authority = buildRequestAuthority(input, model);
  const context = parseRequestContext(input, authority, model);
  assert.equal(context.purpose, "内部项目评审");
});

test("validated canonical extension suggestions enter the plan without breaking page count or endpoints", () => {
  const input = { requirement: "制作新能源汽车客户画像分析" };
  const model = {
    recommended_page_count: 7,
    sections: [
      { section_id: "cover", role: "cover" },
      { section_id: "dataBasis", role: "evidence" },
      { section_id: "segments", role: "analysis" },
      { section_id: "geography", role: "evidence" }
    ]
  };
  const authority = buildRequestAuthority(input, model);
  const context = parseRequestContext(input, authority, model);
  const plan = buildNarrativePlan(context);
  assert.equal(plan.length, 7);
  assert.equal(plan[0].role, "cover");
  assert.equal(plan.at(-1).role, "action");
  assert.ok(plan.some(section => section.id === "geography"));
});

test("page-count mismatch remains usable telemetry and retains model section intents", async () => {
  await withModelEnvironment(async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => modelResponse(withPlannerBusinessContent(validAnalysis({
      audience: "潜在客户",
      purpose: "对外销售",
      recommended_page_count: 12
    })));
    try {
      const runtime = {};
      const result = await generateOutline({
        requirement: "制作新能源汽车客户画像分析",
        audience: "管理层",
        purpose: "内部汇报",
        page_count: 6
      }, { runtime });
      assert.equal(result.slides.length, 6);
      assert.match(result.subtitle, /管理层/);
      assert.equal(result.quality_report.planning_model.used, true);
      assert.equal("planner_response_structure_diagnostics" in result.quality_report.planning_model, false);
      assert.equal(runtime.internalDiagnostics.planning_model.planner_response_structure_diagnostics.selected_container, "sections");
      assert.equal(runtime.internalDiagnostics.planning_model.planner_response_structure_diagnostics.validated_section_count, 3);
      assert.equal(runtime.internalDiagnostics.planning_model.planner_response_structure_diagnostics.retained_section_count, 3);
      assert.equal(runtime.internalDiagnostics.planning_model.planner_response_structure_diagnostics.planning_section_intent_count, 3);
      assert.equal(runtime.internalDiagnostics.planning_model.planner_response_structure_diagnostics.repair_decision_code, "NO_REPAIR_NOT_NEEDED");
      assert.equal(result.quality_report.planning_model.fallback_used, false);
      for (const field of ["title", "slides", "quality_report"]) assert.ok(field in result);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("accepted three-section planner response records retained sections and generated intents", async () => {
  await withModelEnvironment(async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => modelResponse(withPlannerBusinessContent(validAnalysis({
      recommended_page_count: 3
    })));
    try {
      const runtime = {};
      const result = await generateOutline({
        requirement: "制作新能源汽车客户画像分析",
        audience: "管理层",
        purpose: "内部汇报",
        page_count: 3
      }, { runtime });
      const diagnostics = runtime.internalDiagnostics.planning_model.planner_response_structure_diagnostics;
      assert.equal(result.quality_report.planning_model.used, true);
      assert.equal(result.quality_report.planning_model.fallback_used, false);
      assert.equal(diagnostics.selected_container, "sections");
      assert.equal(diagnostics.retained_section_count, 3);
      assert.equal(diagnostics.planning_section_intent_count, 3);
      assert.equal(diagnostics.planning_section_intents_generated, true);
      assert.equal(diagnostics.repair_decision_code, "NO_REPAIR_NOT_NEEDED");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("legal canonical sections with a complete requirement binding remain accepted without repair", async () => {
  const baseContext = contextFor("新能源汽车客户画像分析");
  const requirementBindings = createRequirementBindings([{
    original_requirement: "必须说明目标用户。",
    atomic_requirements: [{ label: "目标用户" }],
    section_id: "segments",
    source_field: "must_include"
  }], buildAllowedSectionCatalog(baseContext), "test");
  const context = {
    ...baseContext,
    pageCount: 3,
    manualPageCount: true,
    requiredSections: ["目标用户"],
    requirementBindings
  };
  const result = await planWithLocalModel({ requirement: "新能源汽车客户画像分析", page_count: 3 }, context, {
    env: modelEnv(),
    fetchImpl: async () => modelResponse({
      sections: [
        { section_id: "cover", role: "cover", key_message: "客户画像分析" , bullets: ["明确分析目标"] },
        { section_id: "dataBasis", role: "evidence", key_message: "数据基础", bullets: ["梳理已有用户信息"] },
        { section_id: "segments", role: "analysis", key_message: "目标用户分层", bullets: ["目标用户包括核心购车人群"] }
      ],
      requirement_bindings: requirementBindings.map(parent => ({
        requirement_id: parent.requirement_id,
        atomic_requirements: parent.atomic_requirements.map(atomic => ({
          requirement_id: atomic.requirement_id,
          canonical_section_id: atomic.canonical_section_id
        }))
      }))
    })
  });

  assert.ok(result.analysis);
  assert.equal(result.metadata.repair_attempted, false);
  assert.equal(result.metadata.fallback_used, false);
  assert.equal(result.metadata.planner_response_structure_diagnostics.retained_section_count, 3);
  assert.equal(result.metadata.planner_response_structure_diagnostics.repair_decision_code, "NO_REPAIR_NOT_NEEDED");
});

test("generateOutline records a clear safe fallback warning", async () => {
  await withModelEnvironment(async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => modelResponseText("invalid output");
    try {
      const runtime = {};
      const result = await generateOutline({ requirement: "咖啡店开业宣传", page_count: 5 }, { runtime });
      assert.equal(result.quality_report.planning_model.status, "fallback");
      assert.ok(runtime.internalDiagnostics.warnings.includes("本地规划模型不可用，已使用现有规则安全生成"));
      assert.equal("warnings" in result.quality_report, false);
      assert.doesNotMatch(JSON.stringify(result), new RegExp(API_KEY));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("E5.2 online model suggestions are contracted before public output and scoring", async () => {
  await withModelEnvironment(async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => modelResponse(withPlannerBusinessContent(validAnalysis({
      audience: "投资人",
      purpose: "招商方案",
      ppt_type: "project_plan",
      industry: "园区招商",
      business_scenario: "招商路演",
      recommended_page_count: 9,
      sections: [
        { section_id: "cover", title: "封面", role: "cover", objective: "招商开场" },
        { section_id: "company_positioning", title: "澜检智能科技｜澜检智能｜企业定位", role: "positioning", objective: "重复品牌" },
        { section_id: "quality_or_validation", title: "质量验证体系", role: "evidence", objective: "建立质量背书" },
        { section_id: "delivery_and_collaboration", title: "批量生产与物流交付", role: "action", objective: "说明服务启用和版本确认" },
        { section_id: "customer_value", title: "客户价值与ROI分析", role: "insight", objective: "说明 ROI" }
      ]
    })));
    try {
      const runtime = {};
      const result = await generateOutline({
        source_mode: "simple",
        allow_draft: true,
        requirement: INDUSTRIAL_AI_REQUIREMENT,
        client_materials: INDUSTRIAL_AI_MATERIALS_WITHOUT_ROI_OR_QUALITY_SYSTEM,
        has_materials: true,
        style: "auto",
        purpose: "auto"
      }, { runtime });
      const visible = visibleText(result);
      assert.equal(result.quality_report.planning_model.used, true);
      assert.equal(runtime.internalDiagnostics.planning_model.model_id, "qwen3:32b");
      assert.equal(result.quality_report.planning_model.model_id, "qwen3:32b");
      assert.match(result.subtitle, /用于产品介绍/);
      assert.match(result.slides[0].content, /汇报用途：产品介绍/);
      assert.doesNotMatch(visible, /澜检智能科技[｜|]澜检智能/);
      assert.doesNotMatch(visible, /ROI分析|质量验证体系|批量生产|物流交付|服务启用|版本确认/);
      assert.match(visible, /设备制造|安装调试|试运行|验收交付|售后支持/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("E5.2 fallback path uses the same final output contract as online planning", async () => {
  await withModelEnvironment(async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => modelResponseText("invalid output");
    try {
      const result = await generateOutline({
        source_mode: "simple",
        allow_draft: true,
        requirement: INDUSTRIAL_AI_REQUIREMENT,
        client_materials: INDUSTRIAL_AI_MATERIALS_WITHOUT_ROI_OR_QUALITY_SYSTEM,
        has_materials: true,
        style: "auto",
        purpose: "auto"
      });
      const visible = visibleText(result);
      assert.equal(result.quality_report.planning_model.status, "fallback");
      assert.match(result.subtitle, /用于产品介绍/);
      assert.doesNotMatch(visible, /ROI分析|质量验证体系|批量生产|物流交付|服务启用|版本确认/);
      assert.match(visible, /设备制造|安装调试|试运行|验收交付|售后支持/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("legacy strict-model flag cannot turn an unavailable local model into an API failure", async () => {
  await withModelEnvironment(async () => {
    process.env.LOCAL_MODEL_REQUIRED = "true";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      if (String(url).includes("/api/chat/completions")) throw new TypeError("connection refused with secret");
      return originalFetch(url, options);
    };
    const server = createAppServer();
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const response = await originalFetch(`http://127.0.0.1:${server.address().port}/api/outline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirement: "新能源汽车客户画像分析" })
      });
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.success, true);
      assert.equal(payload.quality_status, "fallback");
      assert.ok(payload.customer_version);
      assert.ok(payload.production_version);
      assert.equal(payload.source_summary.model_used, false);
      assert.equal(payload.source_summary.fallback_used, true);
      assert.doesNotMatch(JSON.stringify(payload), /secret|Authorization|Bearer/i);
    } finally {
      server.close();
      await once(server, "close");
      globalThis.fetch = originalFetch;
    }
  });
});

test("local env files are protected and the browser never contains Open WebUI credentials or URL", async () => {
  const [packageText, ignoreText, exampleText, frontendText] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.gitignore", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../js/main.js", import.meta.url), "utf8")
  ]);
  assert.equal(JSON.parse(packageText).scripts["start:local"], "node --env-file=.env server.js");
  assert.match(ignoreText, /^\.env$/m);
  assert.match(ignoreText, /^\.env\.\*$/m);
  assert.match(ignoreText, /^!\.env\.example$/m);
  assert.match(exampleText, /LOCAL_MODEL_TIMEOUT_MS=120000/);
  assert.match(exampleText, /LOCAL_MODEL_BASE_URL=http:\/\/127\.0\.0\.1:8080\/api/);
  assert.match(exampleText, /^LOCAL_MODEL_API_KEY=$/m);
  assert.match(exampleText, /^LOCAL_MODEL_ID=$/m);
  assert.doesNotMatch(frontendText, /OPENWEBUI|API_KEY|127\.0\.0\.1:8080|Authorization:\s*Bearer/i);
  assert.match(frontendText, /fetch\("\/api\/outline"/);
});

function contextFor(requirement) {
  const input = { requirement };
  const authority = buildRequestAuthority(input);
  return parseRequestContext(input, authority);
}

const INDUSTRIAL_AI_REQUIREMENT = "为澜检智能科技制作一份12页工业AI视觉质检设备公司与产品介绍PPT，用于向汽车零部件、3C电子和食品包装生产企业的工厂负责人、质量负责人、生产负责人、自动化工程师及采购人员，介绍企业定位、核心产品、检测能力、产线集成、定制方案、典型应用场景、项目实施流程、质量验证、交付服务和合作路径，整体风格专业、科技、可信，具有工业制造质感。";

const INDUSTRIAL_AI_MATERIALS_WITHOUT_ROI_OR_QUALITY_SYSTEM = `普通资料｜企业定位
* 澜检智能科技是一家面向制造企业提供工业视觉检测设备与智能质量管理方案的技术服务公司。

普通资料｜目标客户
* 目标客户包括汽车零部件、3C电子和食品包装生产企业的工厂负责人、质量负责人及采购人员。

普通资料｜产品与工艺
* 产品能力包括工业相机、光源、镜头、工控机、PLC、MES、机械手和输送线集成。

普通资料｜定制能力
* 定制方案围绕检测对象、产线节拍、工位空间、光学方案、算法模型和本地部署要求配置。

普通资料｜应用场景
* 汽车零部件：装配完整性、尺寸偏差和表面缺陷检测。
* 3C电子：外壳划痕、零件缺失、标签和字符检测。
* 食品包装：封口完整性、印刷偏移、异物和包装外观检测。

普通资料｜服务流程
* 实施流程包括需求调研、样品测试、方案确认、设备制造、安装调试、试运行和验收交付。

普通资料｜交付能力
* 交付服务包括现场培训、售后支持、备件响应和检测方案持续优化。`;

function visibleText(result) {
  return [
    result.title,
    result.subtitle,
    ...(result.executive_summary || []),
    ...result.slides.flatMap(slide => [slide.title, slide.key_message, slide.content, slide.visual_suggestion])
  ].join("\n");
}

function validAnalysis(overrides = {}) {
  return {
    schema_version: 1,
    requirement_summary: "建立可验证的客户画像框架",
    audience: "管理层",
    purpose: "内部决策汇报",
    ppt_type: "customer_persona",
    industry: "新能源汽车",
    business_scenario: "市场进入验证",
    recommended_page_count: 8,
    sections: [
      { section_id: "cover", title: "封面", role: "cover", objective: "界定主题" },
      { section_id: "dataBasis", title: "数据基础", role: "evidence", objective: "明确证据" },
      { section_id: "segments", title: "分群", role: "analysis", objective: "提出假设" }
    ],
    ambiguities: [],
    warnings: [],
    ...overrides
  };
}

function rootSingleSection(overrides = {}) {
  return {
    section_id: "cover",
    title: "客户画像分析",
    role: "cover",
    objective: "明确分析主题",
    key_message: "建立可验证的客户画像分析框架。",
    bullets: ["明确分析目标", "梳理关键决策问题", "提出下一步分析路径"],
    visual_direction: "使用简洁的分析框架图。",
    evidence_status: "framework_only",
    ...overrides
  };
}

function withPlannerBusinessContent(analysis) {
  const copy = structuredClone(analysis);
  copy.sections = copy.sections.map(section => {
    const keyMessage = `${section.title}围绕${section.objective}形成具体业务结论。`;
    return {
      ...section,
      key_message: section.key_message || keyMessage,
      bullets: section.bullets?.length ? section.bullets : [keyMessage],
      visual_direction: section.visual_direction || "使用结构化业务信息图呈现。",
      evidence_status: section.evidence_status || "source_supported"
    };
  });
  copy.requirement_bindings = copy.requirement_bindings || [];
  return copy;
}

function modelResponse(analysis) {
  return modelResponseText(JSON.stringify(analysis));
}

function modelResponseText(content) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

async function withModelEnvironment(callback) {
  const previous = {
    enabled: process.env.LOCAL_MODEL_ENABLED,
    required: process.env.LOCAL_MODEL_REQUIRED,
    key: process.env.OPENWEBUI_API_KEY,
    url: process.env.OPENWEBUI_BASE_URL,
    model: process.env.LOCAL_MODEL_ID
  };
  Object.assign(process.env, {
    LOCAL_MODEL_ENABLED: "true",
    LOCAL_MODEL_REQUIRED: "false",
    OPENWEBUI_API_KEY: API_KEY,
    OPENWEBUI_BASE_URL: "http://127.0.0.1:8080",
    LOCAL_MODEL_ID: "qwen3:32b"
  });
  try {
    await callback();
  } finally {
    restoreEnv("LOCAL_MODEL_ENABLED", previous.enabled);
    restoreEnv("LOCAL_MODEL_REQUIRED", previous.required);
    restoreEnv("OPENWEBUI_API_KEY", previous.key);
    restoreEnv("OPENWEBUI_BASE_URL", previous.url);
    restoreEnv("LOCAL_MODEL_ID", previous.model);
  }
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
