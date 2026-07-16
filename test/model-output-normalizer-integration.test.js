import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildAllowedSectionCatalog,
  extractJsonObject,
  planWithLocalModel
} from "../lib/local-model-planner.js";
import { buildRequestAuthority, parseRequestContext } from "../lib/request-context.js";

const MODEL_ENV = {
  LOCAL_MODEL_ENABLED: "true",
  LOCAL_MODEL_PROVIDER: "openai-compatible",
  LOCAL_MODEL_BASE_URL: "http://127.0.0.1:11434/v1",
  LOCAL_MODEL_ID: "generic-local-model",
  LOCAL_MODEL_MAX_REPAIR_ATTEMPTS: "1"
};

function contextFor(input) {
  return parseRequestContext(input, buildRequestAuthority(input));
}

function unifiedContract(context, count = context.pageCount) {
  const ids = buildAllowedSectionCatalog(context).slice(0, count);
  return {
    title: "用户项目说明",
    subtitle: "只整理用户输入",
    executive_summary: ["本大纲以用户输入为事实边界"],
    sections: ids.map((id, index) => ({
      id,
      role: index === 0 ? "cover" : "analysis",
      title: `第 ${index + 1} 页`,
      key_message: `说明第 ${index + 1} 页已有内容`,
      bullets: ["不增加未确认的事实、数字或合作关系"],
      visual_suggestion: "结构化信息图",
      speaker_notes: "按用户资料讲解"
    })),
    global_visual_style: { tone: "简洁" },
    material_gaps: ["具体事实待用户确认"]
  };
}

function modelResponse(content) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

test("strict unified contract reaches the planner instead of being swallowed by the legacy validator", async () => {
  const input = { requirement: "制作三页项目说明", page_count: 3 };
  const context = contextFor(input);
  let calls = 0;
  const result = await planWithLocalModel(input, context, {
    env: MODEL_ENV,
    fetchImpl: async () => {
      calls += 1;
      return modelResponse(JSON.stringify(unifiedContract(context)));
    }
  });

  assert.equal(calls, 1);
  assert.equal(result.metadata.used, true);
  assert.equal(result.metadata.fallback_used, false);
  assert.equal(result.analysis.sections.length, 3);
  assert.equal(result.analysis.model_output_contract.sections.length, 3);
});

test("fenced, wrapped, and aliased contracts use the same normalization path", async t => {
  const input = { requirement: "制作三页项目说明", page_count: 3 };
  const context = contextFor(input);
  const contract = unifiedContract(context);
  const aliased = {
    TITLE: contract.title,
    Slides: contract.sections.map(section => ({
      Section_ID: section.id.toUpperCase(),
      ROLE: section.role.toUpperCase(),
      Heading: section.title,
      KeyMessage: section.key_message,
      BulletPoints: section.bullets,
      VisualDirection: section.visual_suggestion
    }))
  };
  const cases = {
    fenced: `\`\`\`json\n${JSON.stringify(contract)}\n\`\`\``,
    wrapped: JSON.stringify({ response: { data: { presentation: contract } } }),
    aliased: JSON.stringify(aliased)
  };

  for (const [name, content] of Object.entries(cases)) {
    await t.test(name, async () => {
      let calls = 0;
      const result = await planWithLocalModel(input, context, {
        env: MODEL_ENV,
        fetchImpl: async () => {
          calls += 1;
          return modelResponse(content);
        }
      });
      assert.equal(calls, 1);
      assert.equal(result.metadata.fallback_used, false);
      assert.equal(result.analysis.sections.length, 3);
    });
  }
});

test("invalid model JSON receives at most one controlled repair", async () => {
  const input = { requirement: "制作三页项目说明", page_count: 3 };
  const context = contextFor(input);
  let calls = 0;
  const result = await planWithLocalModel(input, context, {
    env: MODEL_ENV,
    fetchImpl: async () => {
      calls += 1;
      return modelResponse(calls === 1 ? "无法解析的普通文本" : JSON.stringify(unifiedContract(context)));
    }
  });

  assert.equal(calls, 2);
  assert.equal(result.metadata.repair_attempted, true);
  assert.equal(result.metadata.repaired, true);
  assert.equal(result.metadata.fallback_used, false);
  assert.equal(result.analysis.sections.length, 3);
});

test("a failed controlled repair becomes an honest fallback without a third request", async () => {
  const input = { requirement: "制作三页项目说明", page_count: 3 };
  const context = contextFor(input);
  let calls = 0;
  const result = await planWithLocalModel(input, context, {
    env: MODEL_ENV,
    fetchImpl: async () => {
      calls += 1;
      return modelResponse("仍然无法解析");
    }
  });

  assert.equal(calls, 2);
  assert.equal(result.analysis, null);
  assert.equal(result.metadata.used, false);
  assert.equal(result.metadata.repair_attempted, true);
  assert.equal(result.metadata.repaired, false);
  assert.equal(result.metadata.fallback_used, true);
});

test("page-count mismatch preserves normalized model content for deterministic completion", async () => {
  const input = { requirement: "制作三页项目说明", page_count: 3 };
  const context = contextFor(input);
  let calls = 0;
  const result = await planWithLocalModel(input, context, {
    env: MODEL_ENV,
    fetchImpl: async () => {
      calls += 1;
      return modelResponse(JSON.stringify(unifiedContract(context, 2)));
    }
  });

  assert.equal(calls, 1);
  assert.equal(result.metadata.fallback_used, false);
  assert.equal(result.analysis.sections.length, 2);
  assert.ok(result.analysis.warnings.includes("PAGE_COUNT_MISMATCH"));
});

test("unified contracts are not required to echo internal requirement binding IDs", async () => {
  const input = {
    requirement: "制作三页项目说明",
    page_count: 3,
    must_include: ["核心价值", "下一步行动"]
  };
  const context = contextFor(input);
  assert.ok(context.requirementBindings.length > 0);
  let calls = 0;
  const result = await planWithLocalModel(input, context, {
    env: MODEL_ENV,
    fetchImpl: async () => {
      calls += 1;
      return modelResponse(JSON.stringify(unifiedContract(context)));
    }
  });

  assert.equal(calls, 1);
  assert.ok(result.analysis);
  assert.equal(result.metadata.fallback_used, false);
  assert.equal(result.metadata.planning_rejection_reason, undefined);
});

test("the legacy JSON probe also rejects unmatched braces with a bounded scan", () => {
  const content = "{".repeat(20_000);
  const startedAt = performance.now();
  assert.throws(() => extractJsonObject(content));
  const elapsed = performance.now() - startedAt;
  assert.ok(elapsed < 250, `expected bounded scan, got ${elapsed.toFixed(1)}ms`);
});
