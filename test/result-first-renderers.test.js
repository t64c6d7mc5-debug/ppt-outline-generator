import assert from "node:assert/strict";
import { test } from "node:test";

import { renderCustomerVersion, renderProductionVersion } from "../lib/output-adapter.js";

const OUTLINE = {
  title: "产品介绍",
  subtitle: "面向合作伙伴",
  executive_summary: ["先说明定位，再说明行动。"],
  global_visual_style: { tone: "简洁" },
  missing_materials: [],
  production_strategy: {},
  slides: [{
    index: 1,
    title: "品牌定位",
    key_message: "定位信息待品牌方确认。",
    content: "• 服务对象：待确认\n• 核心价值：待确认\n• 下一步：补充资料",
    visual_suggestion: "使用三栏信息卡",
    speaker_notes: "先交代事实边界。",
    slide_type: "positioning",
    role: "background",
    visual_spec: {}
  }]
};

test("customer renderer returns a complete editable script without production internals", () => {
  const text = renderCustomerVersion(OUTLINE);

  assert.match(text, /^# 产品介绍/m);
  assert.match(text, /## 1\. 品牌定位/);
  assert.match(text, /定位信息待品牌方确认/);
  assert.match(text, /服务对象：待确认/);
  assert.doesNotMatch(text, /speaker_notes|slide_type|visual_spec|制作备注/);
});

test("production renderer contains layout and speaker guidance", () => {
  const text = renderProductionVersion(OUTLINE);

  assert.match(text, /^# 产品介绍｜制作版/m);
  assert.match(text, /页面类型：positioning/);
  assert.match(text, /视觉建议：使用三栏信息卡/);
  assert.match(text, /演讲备注：先交代事实边界/);
});

test("renderers stay non-empty for a minimally valid outline", () => {
  const outline = { title: "最小脚本", slides: [{ index: 1, title: "封面", content: "• 主题\n• 受众\n• 用途" }] };
  assert.ok(renderCustomerVersion(outline).length > 20);
  assert.ok(renderProductionVersion(outline).length > 20);
});
