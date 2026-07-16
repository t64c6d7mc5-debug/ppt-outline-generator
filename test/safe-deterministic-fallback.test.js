import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDeterministicFallback } from "../lib/deterministic-fallback.js";

function visibleText(result) {
  return JSON.stringify(result.outline);
}

test("a topic-only request produces a complete exact-length safe fallback", () => {
  const result = buildDeterministicFallback({
    input: {
      requirement: "新能源汽车品牌介绍",
      purpose: "对外介绍",
      audience: "潜在消费者与合作伙伴",
      page_count: 8,
      include_speaker_notes: true
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.source, "deterministic_fallback");
  assert.equal(result.modelUsed, false);
  assert.equal(result.outline.slides.length, 8);
  assert.equal(result.outline.slides[0].role, "cover");
  assert.equal(result.outline.slides.at(-1).role, "action");
  assert.match(result.outline.slides.at(-1).title, /下一步|行动|合作|沟通/);
  assert.ok(result.outline.slides.every(slide => slide.title && slide.key_message));
  assert.ok(result.outline.slides.every(slide => {
    const bullets = String(slide.content || "").split("\n").filter(line => line.trim());
    return bullets.length >= 3 && bullets.length <= 5;
  }));
  assert.ok(result.outline.slides.every(slide => slide.visual_suggestion));
  assert.ok(result.outline.slides.every(slide => slide.speaker_notes));
  assert.match(visibleText(result), /待确认|待补充|建议补充/);
});

test("fallback respects the speaker-notes switch", () => {
  const result = buildDeterministicFallback({
    input: {
      requirement: "团队年度复盘",
      page_count: 6,
      include_speaker_notes: false
    }
  });

  assert.equal(result.ok, true);
  assert.ok(result.outline.slides.every(slide => slide.speaker_notes === "未要求演讲备注。"));
});

test("fallback is deterministic and does not mix consecutive projects", () => {
  const firstInput = {
    requirement: "北极星咖啡品牌介绍",
    page_count: 7,
    must_include: ["品牌定位", "门店体验", "合作下一步"]
  };
  const first = buildDeterministicFallback({ input: firstInput });
  const firstAgain = buildDeterministicFallback({ input: structuredClone(firstInput) });
  const second = buildDeterministicFallback({
    input: {
      requirement: "工业检测设备方案介绍",
      page_count: 7,
      must_include: ["设备能力", "验收条件"]
    }
  });

  assert.deepEqual(first, firstAgain);
  assert.match(visibleText(first), /北极星咖啡/);
  for (const requirement of firstInput.must_include) {
    assert.match(visibleText(first), new RegExp(requirement));
  }
  assert.doesNotMatch(visibleText(second), /北极星咖啡|门店体验/);
  assert.match(visibleText(second), /工业检测设备/);
});

test("long fallback decks still end with a real CTA and never expose canonical IDs", () => {
  const result = buildDeterministicFallback({
    input: {
      requirement: "城市更新项目介绍",
      page_count: 15,
      must_include: ["项目定位", "空间规划", "合作下一步"]
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.outline.slides.length, 15);
  const closing = result.outline.slides.at(-1);
  assert.equal(closing.role, "action");
  assert.match(`${closing.title}\n${closing.key_message}\n${closing.content}`, /下一步|行动|联系|沟通|确认/);
  assert.doesNotMatch(visibleText(result), /market_or_customer_challenge|company_positioning|verificationAppendix|target_audience/);
});

test("topic aliases, nested delivery settings, clarifying answers and summary normalize into fallback", () => {
  const result = buildDeterministicFallback({
    input: {
      topic: "智慧园区项目说明",
      pageCount: 6,
      mustHave: ["设备范围", "验收边界"],
      clarifying_answers: "设备范围由双方后续确认",
      requirements_summary: "用于管理层评审",
      delivery_requirements: { include_speaker_notes: false }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.outline.slides.length, 6);
  assert.match(visibleText(result), /智慧园区项目说明/);
  assert.match(visibleText(result), /设备范围/);
  assert.match(visibleText(result), /验收边界/);
  assert.ok(result.outline.slides.every(slide => slide.speaker_notes === "未要求演讲备注。"));
});

test("an unrecognizable request fails explicitly instead of inventing a topic", () => {
  const result = buildDeterministicFallback({ input: { requirement: "", page_count: 8 } });

  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "FALLBACK_REQUEST_UNUSABLE");
  assert.equal(result.outline, null);
});
