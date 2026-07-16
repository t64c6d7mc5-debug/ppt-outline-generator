import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import packageInfo from "../package.json" with { type: "json" };
import { generateOutline, OutlineInputError } from "../lib/generate-outline.js";
import { createAppServer } from "../server.js";

let server;
let baseUrl;

before(async () => {
  server = createAppServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await once(server, "close");
});

test("generateOutline is async and returns the stable schema", async () => {
  const pending = generateOutline({
    requirement: "制作一份新能源汽车客户画像分析 PPT",
    client_materials: "已有访谈摘要",
    page_count: 6,
    style: "科技感"
  });
  assert.equal(typeof pending?.then, "function");

  const result = await pending;
  for (const key of ["title", "subtitle", "executive_summary", "global_visual_style", "quality_report", "slides"]) assert.ok(key in result);
  assert.equal(result.success, true);
  assert.ok(["production_ready", "review_required", "fallback"].includes(result.quality_status));
  assert.ok(result.customer_version.trim());
  assert.ok(result.production_version.trim());
  assert.equal(result.slides.length, 6);
  result.slides.forEach((slide, offset) => {
    for (const key of ["index", "title", "content", "visual_suggestion", "image_prompt", "key_message", "evidence_status"]) assert.ok(key in slide);
    assert.equal(slide.index, offset + 1);
    for (const key of ["title", "content", "visual_suggestion", "image_prompt"]) {
      assert.equal(typeof slide[key], "string");
      assert.ok(slide[key].length > 0);
    }
  });
});

test("generateOutline rejects an empty requirement", async () => {
  await assert.rejects(() => generateOutline({ requirement: "" }), OutlineInputError);
});

test("POST /api/outline returns JSON slides", async () => {
  const response = await fetch(`${baseUrl}/api/outline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requirement: "咖啡店开业宣传", page_count: 5, style: "温暖" })
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/json/);
  const payload = await response.json();
  assert.equal(payload.success, true);
  assert.ok(["production_ready", "review_required", "fallback"].includes(payload.quality_status));
  assert.equal(payload.slides.length, 5);
  assert.ok(payload.customer_version.trim());
  assert.ok(payload.production_version.trim());
  assert.ok(payload.quality_report);
  assert.equal(payload.quality_report.threshold, 95);
  assert.equal("risk_rule_diagnostics" in payload.quality_report, false);
  assert.equal("required_section_diagnostics" in payload.quality_report, false);
});

test("POST /api/outline returns a complete transparent fallback when the local model is disabled", async () => {
  const previousLocalModel = process.env.LOCAL_MODEL_ENABLED;
  process.env.LOCAL_MODEL_ENABLED = "false";
  try {
    const response = await fetch(`${baseUrl}/api/outline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_mode: "professional",
        allow_draft: true,
        requirement: "制作一个团队沟通主题PPT",
        page_count: 6
      })
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(payload.quality_report);
    assert.equal(payload.success, true);
    assert.equal(payload.quality_status, "fallback");
    assert.equal(payload.source_summary.model_attempted, false);
    assert.equal(payload.source_summary.model_used, false);
    assert.equal(payload.source_summary.model_content_retained, false);
    assert.equal(payload.source_summary.fallback_used, true);
    assert.ok(payload.customer_version.trim());
    assert.ok(payload.production_version.trim());
    assert.equal("risk_rule_diagnostics" in payload.quality_report, false);
    assert.equal("required_section_diagnostics" in payload.quality_report, false);
  } finally {
    if (previousLocalModel === undefined) delete process.env.LOCAL_MODEL_ENABLED;
    else process.env.LOCAL_MODEL_ENABLED = previousLocalModel;
  }
});

test("API carries purpose and deadline to the generator without breaking legacy requests", async () => {
  const modernResponse = await fetch(`${baseUrl}/api/outline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requirement: "新能源汽车客户画像分析",
      purpose: "管理层汇报",
      deadline: "今晚",
      style: "科技感"
    })
  });
  assert.equal(modernResponse.status, 200);
  const modern = await modernResponse.json();
  assert.equal(modern.title, "新能源汽车客户画像分析｜管理层决策汇报");
  assert.equal(modern.slides.length, 6);
  assert.doesNotMatch(modern.slides[0].content, /快速交付|制作策略/);

  const legacyResponse = await fetch(`${baseUrl}/api/outline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requirement: "新能源汽车客户画像分析" })
  });
  assert.equal(legacyResponse.status, 200);
  const legacy = await legacyResponse.json();
  assert.equal(legacy.slides.length, 8);
  assert.ok(legacy.quality_report);
});

test("API validation returns a visible client error payload", async () => {
  const response = await fetch(`${baseUrl}/api/outline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requirement: "" })
  });
  assert.equal(response.status, 422);
  const payload = await response.json();
  assert.equal(payload.success, false);
  assert.equal(payload.quality_status, "blocked");
  assert.equal(typeof payload.error, "string");
});

test("static HTML, CSS, and JS are served with correct content types", async () => {
  const cases = [
    ["/", /text\/html/],
    ["/css/styles.css", /text\/css/],
    ["/js/main.js", /text\/javascript/]
  ];
  for (const [pathname, contentType] of cases) {
    const response = await fetch(`${baseUrl}${pathname}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), contentType);
    assert.ok((await response.text()).length > 100);
  }
});

test("served UI exposes v2.3.15-rc2 deadline choices and sends optional request fields", async () => {
  const html = await (await fetch(`${baseUrl}/`)).text();
  const javascript = await (await fetch(`${baseUrl}/js/main.js`)).text();
  const requestBuilders = await (await fetch(`${baseUrl}/js/request-builders.js`)).text();
  assert.equal(packageInfo.version, "2.3.15-rc2");
  assert.match(html, /PPT Outline Generator v2\.3\.15-rc2/);
  assert.match(html, /PPT 大纲生成工作台 v2\.3\.15-rc2/);
  assert.doesNotMatch(html, /v2\.3\.5/);
  assert.match(html, /<select id="simpleDeadline">/);
  for (const label of ["未指定", "今晚", "明天上午", "三天内", "不急"]) {
    assert.match(html, new RegExp(`>${label}<`));
  }
  assert.match(javascript, /buildSimpleRequest\(simpleFormData, simpleNeed\)/);
  assert.match(requestBuilders, /request\.deadline = formData\.deadline/);
  assert.match(requestBuilders, /formData\.purposeChoice !== "auto"/);
  assert.match(requestBuilders, /has_materials: formData\.materialStatus/);
  assert.match(requestBuilders, /formData\.pageChoice !== "auto"/);
});

test("public release documentation excludes legacy local history", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const ignoreRules = await readFile(new URL("../.gitignore", import.meta.url), "utf8");
  assert.doesNotMatch(readme, /2\.3\.5|\/Users\//);
  assert.match(ignoreRules, /RELEASE-v2\.3\.5\.md/);
  assert.match(ignoreRules, /真实回归/);
});
