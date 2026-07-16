import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProfessionalPlanningStageRequest,
  buildProfessionalRequest
} from "../js/request-builders.js";
import { runLocalPlanningProfile } from "../lib/local-model-planner.js";

const brief = {
  topic: "新能源汽车产品发布",
  pageCount: 8,
  scenario: "客户评审",
  style: "专业",
  purpose: "产品介绍",
  detailedPurpose: "推动试驾预约",
  audience: "汽车行业客户",
  materialDetails: "已确认核心车型与电池技术",
  materials: ["产品资料"],
  mustHave: "核心车型\n智能驾驶\n电池技术",
  riskPoints: "不编造销量",
  emphasis: "产品可信度",
  followAnswers: "",
  reference: "清晰商务风格",
  needScript: false,
  needImages: true,
  needLayouts: true
};

const MODEL_ENV = {
  LOCAL_MODEL_ENABLED: "true",
  LOCAL_MODEL_PROVIDER: "openai-compatible",
  LOCAL_MODEL_BASE_URL: "http://127.0.0.1:11434/v1",
  LOCAL_MODEL_API_KEY: "test-key",
  LOCAL_MODEL_ID: "ppt-v02"
};

test("professional planning stage requests carry distinct profiles without choosing the server model", () => {
  const questions = buildProfessionalPlanningStageRequest(brief, "clarifying_questions");
  const summary = buildProfessionalPlanningStageRequest(brief, "requirements_summary", {
    questions: ["决策人最关心哪项验证？"],
    followUpAnswers: "重点关注安全验证"
  });

  assert.equal(questions.mode, "professional");
  assert.equal(questions.planning_profile, "clarifying_questions");
  assert.equal(summary.mode, "professional");
  assert.equal(summary.planning_profile, "requirements_summary");
  assert.equal("model_id" in questions, false);
  assert.equal("model_id" in summary, false);
  assert.equal(summary.follow_up_answers, "重点关注安全验证");
  assert.deepEqual(summary.clarifying_questions, ["决策人最关心哪项验证？"]);
  assert.match(summary.requirement, /新能源汽车产品发布/);
  assert.match(summary.client_materials, /核心车型/);
});

test("clarifying questions profile returns structured model content", async () => {
  const requestBodies = [];
  const result = await runLocalPlanningProfile(
    buildProfessionalPlanningStageRequest(brief, "clarifying_questions"),
    {
      env: MODEL_ENV,
      fetchImpl: async (_url, options) => {
        requestBodies.push(JSON.parse(options.body));
        return new Response(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ questions: ["决策人最关心哪项验证？"] }) } }]
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
    }
  );

  assert.equal(result.used, true);
  assert.equal(result.status, "used");
  assert.equal(result.planning_profile, "clarifying_questions");
  assert.deepEqual(result.questions, ["决策人最关心哪项验证？"]);
  assert.equal(requestBodies[0].model, "ppt-v02");
  assert.match(requestBodies[0].messages[1].content, /clarifying_questions/);
  assert.doesNotMatch(requestBodies[0].messages[1].content, /sections/);
});

test("requirements summary profile keeps facts, requirements and pending items separate", async () => {
  const result = await runLocalPlanningProfile(
    buildProfessionalPlanningStageRequest(brief, "requirements_summary", {
      questions: ["决策人最关心哪项验证？"],
      followUpAnswers: "重点关注安全验证"
    }),
    {
      env: MODEL_ENV,
      fetchImpl: async (_url, options) => {
        const body = JSON.parse(options.body);
        assert.equal(body.model, "ppt-v02");
        assert.match(body.messages[1].content, /requirements_summary/);
        assert.doesNotMatch(body.messages[1].content, /sections/);
        return new Response(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({
            summary: "面向汽车行业客户介绍核心车型与电池技术，目标是推动试驾预约。",
            confirmed_facts: ["核心车型", "电池技术"],
            explicit_requirements: ["介绍智能驾驶"],
            pending_items: ["安全验证材料"],
            prohibitions: ["不编造销量"]
          }) } }]
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
    }
  );

  assert.equal(result.used, true);
  assert.equal(result.status, "used");
  assert.equal(result.planning_profile, "requirements_summary");
  assert.match(result.summary, /核心车型/);
  assert.deepEqual(result.confirmed_facts, ["核心车型", "电池技术"]);
  assert.deepEqual(result.pending_items, ["安全验证材料"]);
});

test("planning stage model failure returns transparent deterministic questions", async () => {
  const result = await runLocalPlanningProfile(
    buildProfessionalPlanningStageRequest(brief, "clarifying_questions"),
    {
      env: MODEL_ENV,
      fetchImpl: async () => new Response("{}", { status: 503 })
    }
  );

  assert.equal(result.used, false);
  assert.equal(result.status, "fallback");
  assert.equal(result.fallback_used, true);
  assert.ok(result.reason_code);
  assert.equal(result.planning_profile, "clarifying_questions");
  assert.ok(Array.isArray(result.questions));
  assert.ok(result.questions.length > 0);
});

test("existing professional outline request remains full_quality_outline", () => {
  assert.equal(buildProfessionalRequest(brief).planning_profile, "full_quality_outline");
});
