import test from "node:test";
import assert from "node:assert/strict";

import { normalizeModelOutput } from "../lib/model-output-normalizer.js";

const ALLOWED_SECTIONS = ["cover", "value", "closing"];

function canonicalContract() {
  return {
    title: "已提供的项目方案",
    subtitle: "只整理输入内容",
    executive_summary: ["围绕现有材料形成三页提纲"],
    sections: [
      {
        id: "cover",
        role: "cover",
        title: "项目封面",
        key_message: "说明已提供的项目主题",
        bullets: ["材料范围以用户输入为准"],
        visual_suggestion: "采用简洁封面",
        speaker_notes: "说明材料边界"
      },
      {
        id: "value",
        role: "insight",
        title: "核心价值",
        key_message: "呈现材料中已经明确的价值",
        bullets: ["不补充外部事实", "不推断未说明关系"],
        visual_suggestion: "双栏信息卡",
        speaker_notes: "逐项说明输入内容"
      },
      {
        id: "closing",
        role: "action",
        title: "后续安排",
        key_message: "后续动作以输入内容为准",
        bullets: ["确认仍待补充的材料"],
        visual_suggestion: "单列行动清单",
        speaker_notes: "不承诺未提供结果"
      }
    ],
    global_visual_style: { tone: "简洁", palette: ["深蓝", "白色"] },
    material_gaps: ["缺少可核验的补充材料"]
  };
}

function options(overrides = {}) {
  return {
    allowedSections: ALLOWED_SECTIONS,
    pageCount: 3,
    ...overrides
  };
}

test("normalizes strict JSON into the unified contract and existing planning analysis shape", () => {
  const payload = canonicalContract();

  const result = normalizeModelOutput(JSON.stringify(payload), options());

  assert.equal(result.ok, true);
  assert.equal(result.reason_code, "");
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.contract, payload);
  assert.equal(result.planningAnalysis.recommended_page_count, 3);
  assert.deepEqual(result.planningAnalysis.sections[1], {
    section_id: "value",
    title: "核心价值",
    role: "insight",
    objective: "",
    key_message: "呈现材料中已经明确的价值",
    bullets: ["不补充外部事实", "不推断未说明关系"],
    visual_direction: "双栏信息卡",
    evidence_status: "",
    speaker_notes: "逐项说明输入内容",
    content_complete: true
  });
});

test("extracts JSON from a markdown fence", () => {
  const payload = canonicalContract();
  const content = ["```json", JSON.stringify(payload), "```"].join("\n");

  const result = normalizeModelOutput(content, options());

  assert.equal(result.ok, true);
  assert.deepEqual(result.contract, payload);
  assert.ok(result.warnings.includes("FENCED_JSON_EXTRACTED"));
});

test("normalizes snake case, camel case, aliases, and key casing", () => {
  const content = JSON.stringify({
    TITLE: "别名输入标题",
    SubTitle: "别名输入副标题",
    ExecutiveSummary: "摘要甲\n- 摘要乙",
    Slides: [{
      Section_ID: "COVER",
      ROLE: "COVER",
      Heading: "别名封面",
      KeyMessage: "别名核心信息",
      BulletPoints: "材料甲\n• 材料乙",
      VisualDirection: "别名视觉方向",
      SpeakerNotes: "别名演讲备注"
    }],
    GlobalVisualStyle: { Tone: "克制" },
    MissingMaterials: "缺口甲\n缺口乙"
  });

  const result = normalizeModelOutput(content, options({ allowedSections: ["cover"], pageCount: 1 }));

  assert.equal(result.ok, true);
  assert.deepEqual(result.contract, {
    title: "别名输入标题",
    subtitle: "别名输入副标题",
    executive_summary: ["摘要甲", "摘要乙"],
    sections: [{
      id: "cover",
      role: "cover",
      title: "别名封面",
      key_message: "别名核心信息",
      bullets: ["材料甲", "材料乙"],
      visual_suggestion: "别名视觉方向",
      speaker_notes: "别名演讲备注"
    }],
    global_visual_style: { Tone: "克制" },
    material_gaps: ["缺口甲", "缺口乙"]
  });
  assert.ok(result.warnings.includes("FIELD_ALIASES_NORMALIZED"));
  assert.ok(result.warnings.includes("BULLETS_STRING_NORMALIZED"));
});

test("cleans a bullet string into a bounded string array", () => {
  const payload = canonicalContract();
  payload.sections[1].bullets = " • 第一条输入要点 \n- 第二条输入要点\n3. 第三条输入要点\n- 第二条输入要点 ";

  const result = normalizeModelOutput(JSON.stringify(payload), options());

  assert.equal(result.ok, true);
  assert.deepEqual(result.contract.sections[1].bullets, [
    "第一条输入要点",
    "第二条输入要点",
    "第三条输入要点"
  ]);
  assert.ok(result.warnings.includes("BULLETS_STRING_NORMALIZED"));
});

test("recovers a missing key message only by copying the first supplied bullet", () => {
  const payload = canonicalContract();
  delete payload.sections[1].key_message;
  payload.sections[1].bullets = ["输入中的唯一核心表述", "另一条输入内容"];

  const result = normalizeModelOutput(JSON.stringify(payload), options());

  assert.equal(result.ok, true);
  assert.equal(result.contract.sections[1].key_message, "输入中的唯一核心表述");
  assert.ok(result.warnings.includes("KEY_MESSAGE_DERIVED_FROM_BULLET"));
  const normalizedSection = JSON.stringify(result.contract.sections[1]);
  assert.doesNotMatch(normalizedSection, /品牌|100|合作关系|增长率/);
});

test("parses only explicitly sectioned ordinary text without inventing content", () => {
  const content = [
    "标题：纯文本方案",
    "副标题：可识别的结构化文本",
    "摘要：只整理已提供信息",
    "",
    "## [cover] 封面",
    "角色：cover",
    "核心信息：介绍项目主题",
    "- 项目主题来自用户输入",
    "视觉建议：简洁封面",
    "演讲备注：说明材料范围",
    "",
    "## [value] 核心价值",
    "角色：insight",
    "核心信息：展示已提供价值",
    "- 不增加外部事实",
    "视觉建议：双栏信息卡"
  ].join("\n");

  const result = normalizeModelOutput(content, options({ allowedSections: ["cover", "value"], pageCount: 2 }));

  assert.equal(result.ok, true);
  assert.ok(result.warnings.includes("PLAIN_TEXT_PARSED"));
  assert.deepEqual(result.contract, {
    title: "纯文本方案",
    subtitle: "可识别的结构化文本",
    executive_summary: ["只整理已提供信息"],
    sections: [
      {
        id: "cover",
        role: "cover",
        title: "封面",
        key_message: "介绍项目主题",
        bullets: ["项目主题来自用户输入"],
        visual_suggestion: "简洁封面",
        speaker_notes: "说明材料范围"
      },
      {
        id: "value",
        role: "insight",
        title: "核心价值",
        key_message: "展示已提供价值",
        bullets: ["不增加外部事实"],
        visual_suggestion: "双栏信息卡",
        speaker_notes: ""
      }
    ],
    global_visual_style: {},
    material_gaps: []
  });
});

test("unwraps bounded response, data, and presentation wrappers", () => {
  const payload = canonicalContract();
  const content = JSON.stringify({ response: { data: { presentation: payload } } });

  const result = normalizeModelOutput(content, options());

  assert.equal(result.ok, true);
  assert.deepEqual(result.contract, payload);
  assert.ok(result.warnings.includes("WRAPPER_UNWRAPPED"));
});

test("rejects empty model output with a stable failure contract", () => {
  for (const content of ["", "  \n\t ", null, undefined]) {
    const result = normalizeModelOutput(content, options());
    assert.deepEqual(result, {
      ok: false,
      contract: null,
      planningAnalysis: null,
      warnings: [],
      reason_code: "EMPTY_MODEL_OUTPUT"
    });
  }
});

test("rejects prose that cannot be mapped reliably to explicit sections", () => {
  const result = normalizeModelOutput(
    "这是一段普通项目介绍，没有页面标记、章节 ID 或可核验的字段边界。",
    options()
  );

  assert.equal(result.ok, false);
  assert.equal(result.contract, null);
  assert.equal(result.planningAnalysis, null);
  assert.equal(result.reason_code, "UNRELIABLE_MODEL_OUTPUT");
});

test("retains usable model content when section count differs from pageCount", () => {
  const payload = canonicalContract();
  payload.sections.pop();

  const result = normalizeModelOutput(JSON.stringify(payload), options());

  assert.equal(result.ok, true);
  assert.equal(result.contract.sections.length, 2);
  assert.equal(result.planningAnalysis.recommended_page_count, 2);
  assert.ok(result.warnings.includes("PAGE_COUNT_MISMATCH"));
});

test("rejects section IDs outside the supplied allowlist", () => {
  const payload = canonicalContract();
  payload.sections[1].id = "invented_section";

  const result = normalizeModelOutput(JSON.stringify(payload), options());

  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "UNSUPPORTED_SECTION_ID");
});

test("rejects sections with no usable key message or bullets", () => {
  const payload = canonicalContract();
  payload.sections[1].key_message = "";
  payload.sections[1].bullets = [];

  const result = normalizeModelOutput(JSON.stringify(payload), options());

  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "UNUSABLE_SECTION_CONTENT");
});

test("rejects prototype-related keys before normalization", () => {
  const base = canonicalContract();
  const unsafeStringWrapper = `${JSON.stringify(base).slice(0, -1)},"__proto__":{"polluted":true}}`;
  const unsafeContents = [
    unsafeStringWrapper,
    JSON.stringify({ response: { prototype: { polluted: true }, data: base } }),
    JSON.stringify({ response: { constructor: { polluted: true }, data: base } }),
    JSON.stringify({ response: { Constructor: { polluted: true }, data: base } }),
    JSON.stringify({ result: unsafeStringWrapper })
  ];

  for (const content of unsafeContents) {
    const result = normalizeModelOutput(content, options());
    assert.equal(result.ok, false);
    assert.equal(result.reason_code, "UNSAFE_MODEL_OUTPUT");
  }
  assert.equal(Object.prototype.polluted, undefined);
});

test("unmatched braces are rejected within a bounded linear scan", () => {
  const content = "{".repeat(20_000);
  const startedAt = performance.now();
  const result = normalizeModelOutput(content, options());
  const elapsed = performance.now() - startedAt;

  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "UNRELIABLE_MODEL_OUTPUT");
  assert.ok(elapsed < 250, `expected bounded scan, got ${elapsed.toFixed(1)}ms`);
});
