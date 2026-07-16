import assert from "node:assert/strict";
import { test } from "node:test";
import { generateOutline } from "../lib/generate-outline.js";
import { analyzeOutlineQuality, analyzeTitleQuality, textSimilarity } from "../lib/outline-quality.js";

const scenarios = {
  evPersona: {
    requirement: "新能源汽车客户画像分析",
    client_materials: "",
    page_count: 6,
    style: "科技感"
  },
  teaPersona: {
    requirement: "奶茶品牌客户画像分析",
    client_materials: "",
    page_count: 8,
    style: "年轻活力"
  },
  parkPlan: {
    requirement: "园区招商方案",
    client_materials: "",
    page_count: 10,
    style: "商务正式"
  },
  westLake: {
    requirement: "西湖审美历史",
    client_materials: "",
    page_count: 12,
    style: "人文东方"
  },
  fullMaterials: {
    requirement: "新能源汽车客户画像分析",
    client_materials: "已有销售订单、调研问卷、访谈记录、城市分布、预算和车型偏好资料",
    page_count: 6,
    style: "科技感"
  }
};

const META_PHRASES = [
  "围绕本页说明",
  "围绕“",
  "先给出结论，再安排事实依据",
  "说明它与目标的关系",
  "本页可使用数据或案例",
  "重点深化"
];

test("five fixed quality scenarios always return complete safe display results", async () => {
  for (const input of Object.values(scenarios)) {
    const result = await generateOutline(input);
    for (const key of ["title", "subtitle", "executive_summary", "global_visual_style", "quality_report", "slides"]) assert.ok(key in result);
    assert.equal(result.slides.length, input.page_count);
    result.slides.forEach((slide, offset) => {
      for (const key of ["index", "title", "content", "visual_suggestion", "image_prompt", "key_message", "evidence_status"]) assert.ok(key in slide);
      assert.equal(slide.index, offset + 1);
      for (const field of ["title", "content", "visual_suggestion", "image_prompt"]) {
        assert.ok(slide[field].trim(), `${field} must not be empty`);
      }
      const contentPoints = slide.content.split("\n").filter(Boolean);
      assert.ok(contentPoints.length >= 3 && contentPoints.length <= 5, "content must have 3-5 points");
      META_PHRASES.forEach(phrase => assert.ok(!slide.content.includes(phrase), `forbidden meta phrase: ${phrase}`));
      assert.doesNotMatch(slide.content, /\d+(?:\.\d+)?%|市场份额(?:为|达到)|用户数量(?:为|达到)|增长率(?:为|达到)|销量(?:为|达到)/);
    });
    assert.equal(result.success, true);
    assert.ok(["production_ready", "review_required", "fallback"].includes(result.quality_status));
    assert.ok(result.customer_version.trim());
    assert.ok(result.production_version.trim());
    assert.equal(result.quality_report.threshold, 95);
    assert.equal(Object.hasOwn(result.quality_report, "hard_gates"), false);
  }
});

test("six-page customer persona uses the professional required structure", async () => {
  const result = await generateOutline(scenarios.evPersona);
  assert.equal(result.title, "新能源汽车客户画像分析｜用户洞察与业务启示");
  const titles = result.slides.map(slide => slide.title);
  assert.match(titles[0], /新能源汽车|用户洞察/);
  assert.match(titles[1], /分析目标|数据基础/);
  assert.match(titles[2], /样本结构|数据质量/);
  assert.match(titles[3], /分群|假设/);
  assert.match(titles[4], /需求|痛点|决策路径/);
  assert.match(titles[5], /下一步|行动|业务启示|沟通/);
  assert.ok(result.slides[1].data_requirements.includes("销售订单数据"));
  assert.ok(result.slides[2].data_requirements.includes("用户样本量"));
  assert.match(result.slides[3].content, /待验证分群假设/);
});

test("spoken style suffix is removed from the inferred title", async () => {
  const result = await generateOutline({
    requirement: "奶茶品牌客户画像分析，年轻活力风格",
    page_count: 8,
    style: "auto"
  });
  assert.equal(result.title, "奶茶品牌客户画像分析｜消费人群与增长机会");
  assert.match(result.global_visual_style.palette, /亮橙、青绿和莓果色/);
});

test("PPT type templates differ materially", async () => {
  const persona = await generateOutline(scenarios.evPersona);
  const project = await generateOutline(scenarios.parkPlan);
  const history = await generateOutline(scenarios.westLake);
  const generic = await generateOutline({ requirement: "团队沟通主题", page_count: 6, style: "简洁" });
  const structures = [persona, project, history, generic].map(result => result.slides.map(slide => slide.title).join("|"));
  assert.equal(new Set(structures).size, structures.length);
  assert.match(project.title, /^园区招商方案｜招商价值与合作路径$/);
  assert.match(history.title, /^西湖审美历史｜历史脉络与当代审美$/);
  assert.match(generic.title, /^团队沟通主题｜核心问题与行动框架$/);
});

test("visual forms and prompts vary by page and distinguish native charts from AI images", async () => {
  const result = await generateOutline(scenarios.evPersona);
  result.slides.slice(1).forEach((slide, index) => {
    const previous = result.slides[index];
    assert.notEqual(slide.visual_suggestion, previous.visual_suggestion);
    assert.ok(textSimilarity(slide.image_prompt, previous.image_prompt) <= 0.8);
  });
  assert.doesNotMatch(result.slides[0].image_prompt, /^不建议使用 AI 生图/);
  assert.match(result.slides[1].image_prompt, /^不使用 AI 生图/);
  assert.match(result.slides[3].image_prompt, /^不使用 AI 生图/);
  assert.match(result.slides[4].image_prompt, /^不使用 AI 生图/);
});

test("provided material categories are recognized and not requested again", async () => {
  const result = await generateOutline(scenarios.fullMaterials);
  const missing = result.missing_materials.map(item => item.label);
  assert.ok(!missing.includes("销售订单数据"));
  assert.ok(!missing.includes("调研问卷"));
  assert.ok(!missing.includes("访谈记录"));
  assert.ok(!missing.includes("城市和地区分布"));
  assert.ok(!missing.includes("预算区间"));
});

test("presentation and cover titles use purpose and value instead of repeating the PPT type", async () => {
  const management = await generateOutline({
    requirement: "新能源汽车客户画像分析",
    purpose: "管理层汇报",
    page_count: 6
  });
  const marketing = await generateOutline({
    requirement: "奶茶品牌用户画像",
    purpose: "营销团队内部讨论",
    page_count: 8
  });
  const external = await generateOutline({
    requirement: "园区招商方案",
    purpose: "对外推介",
    page_count: 10
  });

  assert.equal(management.title, "新能源汽车客户画像分析｜管理层决策汇报");
  assert.equal(marketing.title, "奶茶品牌用户画像｜营销洞察与内部讨论");
  assert.equal(external.title, "园区招商方案｜招商价值与合作路径");
  for (const result of [management, marketing, external]) {
    assert.deepEqual(analyzeTitleQuality(result.title, result.slides[0].title), []);
    assert.doesNotMatch(`${result.title} ${result.slides[0].title}`, /通用方案|客户画像分析：客户画像分析/);
  }
  assert.notEqual(management.title, (await generateOutline({
    requirement: "新能源汽车客户画像分析",
    purpose: "营销团队内部讨论",
    page_count: 6
  })).title);
});

test("industry profiles add relevant depth without cross-industry contamination", async () => {
  const ev = await generateOutline(scenarios.evPersona);
  const tea = await generateOutline(scenarios.teaPersona);
  const park = await generateOutline(scenarios.parkPlan);
  const culture = await generateOutline(scenarios.westLake);
  const evText = flatten(ev);

  for (const term of ["续航", "补能", "智能座舱", "辅助驾驶", "预算", "通勤", "家庭出行", "决策路径", "试驾", "门店咨询"]) {
    assert.match(evText, new RegExp(term), `新能源汽车脚本缺少 ${term}`);
  }
  assert.match(flatten(tea), /门店|外卖|甜度|SKU|复购/);
  assert.match(flatten(park), /目标企业|空间载体|政策|到访|洽谈/);
  assert.match(flatten(culture), /史料|时代|审美|作品|出处/);

  for (const result of [tea, park, culture]) {
    assert.doesNotMatch(flatten(result), /续航焦虑|辅助驾驶|车型级别|充电条件/);
  }
});

test("deadline strategies create visible complexity differences while preserving safeguards", async () => {
  const base = { requirement: "新能源汽车客户画像分析", client_materials: "", style: "科技感" };
  const tonight = await generateOutline({ ...base, deadline: "今晚" });
  const tomorrow = await generateOutline({ ...base, deadline: "明天上午" });
  const threeDays = await generateOutline({ ...base, deadline: "三天内" });
  const noRush = await generateOutline({ ...base, deadline: "不急" });

  assert.deepEqual([tonight, tomorrow, threeDays, noRush].map(result => result.slides.length), [6, 8, 10, 12]);
  assert.ok(tonight.slides.every(slide => {
    const points = slide.content.split("\n").filter(Boolean).length;
    return points >= 3 && points <= 5;
  }));
  assert.ok(tomorrow.slides.every(slide => slide.content.split("\n").length <= 4));
  assert.ok(threeDays.slides.every(slide => slide.content.split("\n").length <= 5));
  assert.doesNotMatch(tonight.slides[0].content, /快速交付|制作策略/);
  assert.equal(tonight.production_strategy.deadline, "今晚");
  assert.equal(noRush.production_strategy.deadline, "不急");
  assert.equal(aiImageCount(tonight), 0);
  assert.ok(aiImageCount(tomorrow) <= 1);
  assert.ok(aiImageCount(threeDays) <= 2);
  assert.ok(aiImageCount(noRush) <= 2);
  assert.doesNotMatch(tonight.slides.slice(1).map(slide => slide.content).join("\n"), /今晚|时间紧张/);
  assert.notEqual(flatten(tonight), flatten(noRush));
});

test("explicit page count always wins and old requests keep the eight-page default", async () => {
  for (const deadline of ["今晚", "明天上午", "三天内", "不急"]) {
    const result = await generateOutline({
      requirement: "新能源汽车客户画像分析",
      page_count: 7,
      deadline
    });
    assert.equal(result.slides.length, 7);
  }
  const inferred = await generateOutline({ requirement: "新能源汽车客户画像分析，要求 9 页", deadline: "今晚" });
  assert.equal(inferred.slides.length, 9);
  const legacy = await generateOutline({ requirement: "新能源汽车客户画像分析" });
  assert.equal(legacy.slides.length, 8);
});

test("persona pages require traceable entities before cards or people photography are allowed", async () => {
  const standard = await generateOutline(scenarios.evPersona);
  const personaSlide = standard.slides.find(slide => slide.slide_type === "segments");
  assert.equal(personaSlide.visual_spec.visual_type, "matrix");
  assert.match(personaSlide.image_prompt, /^不使用 AI 生图/);
  assert.equal(personaSlide.visual_spec.ai_allowed, false);

  const photography = await generateOutline({
    requirement: "新能源汽车客户画像分析，明确使用真人摄影人物",
    has_materials: true,
    client_materials: "待验证假设：城市通勤型用户可能更关注使用效率",
    page_count: 6,
    style: "科技感"
  });
  const photoSlide = photography.slides.find(slide => slide.slide_type === "segments");
  assert.doesNotMatch(photoSlide.image_prompt, /^不使用 AI 生图/);
  assert.equal(photoSlide.visual_spec.ai_allowed, true);
  assert.match(photoSlide.image_prompt, /人物仅作角色识别，不作为用户属性证据/);
  assert.match(photoSlide.image_prompt, /不生成虚假图表/);
});

test("adjacent pages share no complete content sentence", async () => {
  for (const input of Object.values(scenarios)) {
    const result = await generateOutline(input);
    for (let index = 1; index < result.slides.length; index += 1) {
      const previous = sentenceSet(result.slides[index - 1].content);
      const current = sentenceSet(result.slides[index].content);
      const overlap = [...current].filter(sentence => sentence.length >= 10 && previous.has(sentence));
      assert.deepEqual(overlap, []);
    }
  }
});

function sentenceSet(content) {
  return new Set(content.split(/[\n。！？；]+/).map(item => item.replace(/^•\s*/, "").trim()).filter(Boolean));
}

function flatten(result) {
  return `${result.title}\n${result.slides.map(slide => Object.values(slide).join("\n")).join("\n")}`;
}

function aiImageCount(result) {
  return result.slides.filter(slide => slide.visual_spec.ai_allowed).length;
}
