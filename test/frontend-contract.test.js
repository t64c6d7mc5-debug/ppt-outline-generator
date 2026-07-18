import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { buildProfessionalRequest, buildSimpleRequest } from "../js/request-builders.js";

test("simple and professional request builders target one compatible API shape", () => {
  const simple = buildSimpleRequest({
    rawNeed: "新能源汽车客户画像分析",
    materialsText: "已有访谈记录",
    styleChoice: "科技感",
    deadline: "明天上午",
    pageChoice: "8",
    purposeChoice: "管理层汇报"
  }, { style: "科技感", purpose: "管理层汇报", pageCount: 8 });
  assert.equal(simple.requirement, "新能源汽车客户画像分析");
  assert.equal(simple.source_mode, "simple");
  assert.equal(simple.has_materials, true);
  assert.equal(simple.page_count, 8);
  assert.equal(simple.purpose, "管理层汇报");

  const autoPurpose = buildSimpleRequest({
    rawNeed: "为澜检智能科技制作一份12页工业AI视觉质检设备公司与产品介绍PPT，用于向汽车零部件、3C电子和食品包装生产企业的工厂负责人、质量负责人、生产负责人、自动化工程师及采购人员，介绍企业定位、核心产品、检测能力、产线集成、定制方案、典型应用场景、项目实施流程、质量验证、交付服务和合作路径，整体风格专业、科技、可信，具有工业制造质感。",
    materialsText: "普通资料｜服务流程\n* 合作推进包括需求访谈、样品测试、安装调试和验收。",
    materialStatus: "有文字资料 / 图片 / 文件，需要整理",
    styleChoice: "auto",
    deadline: "",
    pageChoice: "auto",
    purposeChoice: "auto"
  }, { style: "科技感", purpose: "产品介绍", pageCount: 12 });
  assert.equal(Object.hasOwn(autoPurpose, "purpose"), false);

  const professional = buildProfessionalRequest({
    topic: "新能源汽车客户画像分析",
    pageCount: 8,
    scenario: "汇报",
    style: "科技感",
    purpose: "汇报",
    detailedPurpose: "支持管理层判断",
    audience: "管理层",
    materials: ["有文字资料", "有数据"],
    materialDetails: "已有订单和访谈记录",
    mustHave: "客户分群、决策路径",
    riskPoints: "未确认市场份额",
    emphasis: "业务价值",
    needScript: true,
    needImages: true,
    needLayouts: true,
    reference: "咨询公司风格",
    followAnswers: "重点关注家庭出行",
    deadline: "明天上午"
  });
  assert.equal(professional.source_mode, "professional");
  assert.equal(professional.audience, "管理层");
  assert.deepEqual(professional.material_categories, ["有文字资料", "有数据"]);
  assert.deepEqual(professional.must_include, ["客户分群", "决策路径"]);
  assert.equal(professional.must_include_rules.length, 2);
  assert.equal(professional.must_include_source_count, 2);
  assert.equal(typeof professional.must_include_source_hash, "string");
  assert.equal(professional.must_include_rules_schema_version, 1);
  assert.deepEqual(professional.excluded_content, ["未确认市场份额"]);
  assert.equal(professional.visual_preferences.reference_style, "咨询公司风格");
  assert.equal(professional.follow_up_answers, "重点关注家庭出行");
  assert.equal(professional.deadline, "明天上午");
});

test("simple purpose inference keeps requirement purpose stable after materials", async () => {
  const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  const helpers = source.slice(source.indexOf("function inferSimplePurpose"), source.indexOf("function inferSimpleFocusItems"));
  const { inferSimplePurpose } = Function("normalizeUserInput", `${helpers}; return { inferSimplePurpose };`)(
    value => String(value || "").trim().replace(/\s+/g, " ")
  );
  const requirement = "为澜检智能科技制作一份12页工业AI视觉质检设备公司与产品介绍PPT，用于向汽车零部件、3C电子和食品包装生产企业的工厂负责人、质量负责人、生产负责人、自动化工程师及采购人员，介绍企业定位、核心产品、检测能力、产线集成、定制方案、典型应用场景、项目实施流程、质量验证、交付服务和合作路径，整体风格专业、科技、可信，具有工业制造质感。";
  const materials = "普通资料｜交付能力\n* 交付服务包括现场培训、售后支持、备件响应和检测方案持续优化。";
  const first = { rawNeed: requirement, materialsText: "", purposeChoice: "auto" };
  const second = { rawNeed: requirement, materialsText: materials, purposeChoice: "auto" };

  assert.equal(inferSimplePurpose(first, `${first.rawNeed} ${first.materialsText}`), "产品介绍");
  assert.equal(inferSimplePurpose(second, `${second.rawNeed} ${second.materialsText}`), "产品介绍");
  assert.equal(inferSimplePurpose({
    rawNeed: "制作一份工业 AI 视觉质检设备员工培训课件，用于培训一线操作人员。",
    materialsText: "",
    purposeChoice: "auto"
  }, "制作一份工业 AI 视觉质检设备员工培训课件，用于培训一线操作人员。"), "培训课件");
  assert.equal(inferSimplePurpose({
    rawNeed: requirement,
    materialsText: "",
    purposeChoice: "培训课件"
  }, requirement), "培训课件");
  assert.equal(inferSimplePurpose({
    rawNeed: "为产业园招商推介制作一份12页PPT",
    materialsText: "产品资料待补充",
    purposeChoice: "auto"
  }, "为产业园招商推介制作一份12页PPT 产品资料待补充"), "招商方案");
  assert.equal(inferSimplePurpose({
    rawNeed: "制作园区招商PPT，用于招募入驻企业。",
    materialsText: "",
    purposeChoice: "auto"
  }, "制作园区招商PPT，用于招募入驻企业。"), "招商方案");
  assert.equal(inferSimplePurpose({
    rawNeed: "制作融资路演PPT，面向投资人说明项目计划。",
    materialsText: "",
    purposeChoice: "auto"
  }, "制作融资路演PPT，面向投资人说明项目计划。"), "招商方案");
  for (const phrase of ["合作路径", "合作推进", "合作流程"]) {
    assert.notEqual(inferSimplePurpose({
      rawNeed: `制作一份项目沟通PPT，说明${phrase}。`,
      materialsText: "",
      purposeChoice: "auto"
    }, `制作一份项目沟通PPT，说明${phrase}。`), "招商方案");
  }
  assert.equal(inferSimplePurpose({
    rawNeed: "制作一份客户画像调研报告，用于商业汇报。",
    materialsText: "",
    purposeChoice: "auto"
  }, "制作一份客户画像调研报告，用于商业汇报。"), "商业汇报");
  assert.equal(inferSimplePurpose({
    rawNeed: "制作一份新品开业活动宣传PPT。",
    materialsText: "",
    purposeChoice: "auto"
  }, "制作一份新品开业活动宣传PPT。"), "活动宣传");
});

test("professional final generation calls requestOutline and never calls legacy generator", async () => {
  const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  assert.match(source, /generateBtn\.addEventListener\("click", async \(\) =>/);
  assert.match(source, /await requestOutline\(buildProfessionalRequest\(brief, \{/);
  assert.match(source, /clarifyingQuestions: latestQuestions/);
  assert.match(source, /requirementsSummary: latestSummary/);
  const legacyCalls = source.match(/generateLegacyOutline\s*\(/g) || [];
  assert.equal(legacyCalls.length, 1, "legacy should only appear in its retained function declaration");
  assert.doesNotMatch(source, /const outline = generateLegacyOutline\(brief\)/);
});

test("UI exposes two copy actions, professional deadline, production details and module entry", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  assert.match(html, /id="copyClientBtn"[^>]*>复制客户版</);
  assert.match(html, /id="copyBtn"[^>]*>复制制作版</);
  assert.match(html, /id="professionalDeadline"/);
  assert.match(html, /<script type="module" src="js\/main\.js\?v=2\.3\.15-rc4-result-first-2"><\/script>/);
  assert.doesNotMatch(html, /纯前端离线工具/);
  assert.match(source, /制作与验证信息/);
  assert.match(source, /formatQualityReport/);
});

test("UI consumes server-provided customer and production versions before local compatibility formatting", async () => {
  const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  const buildResultState = source.slice(source.indexOf("function buildResultState"), source.indexOf("function emptyResultState"));
  assert.match(buildResultState, /clientText:\s*outline\.customer_version \|\| outlineToText\(outline, "client"\)/);
  assert.match(buildResultState, /productionText:\s*outline\.production_version \|\| outlineToText\(outline, "production"\)/);
  assert.ok(buildResultState.indexOf("outline.customer_version") < buildResultState.indexOf('outlineToText(outline, "client")'));
  assert.ok(buildResultState.indexOf("outline.production_version") < buildResultState.indexOf('outlineToText(outline, "production")'));
});

test("quality gate failures do not show local service startup hint", async () => {
  const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  assert.match(source, /showGenerationErrorState\(message, mode, qualityReport, errorCode = ""\)/);
  assert.match(source, /接口已返回质量报告，请根据硬性检查原因补充资料、再次生成或保留失败证据。/);
  assert.match(source, /isLocalServiceConnectionError\(message\)\s*\?\s*"请确认本地服务已启动后重试。"/);
  assert.match(source, /modelFailureHint\(errorCode\)/);
  const errorState = source.slice(source.indexOf("function showGenerationErrorState"), source.indexOf("async function requestOutline"));
  assert.match(errorState, /qualityReport\?\.quality_status === "blocked"/);
  assert.match(errorState, /无法安全生成结果/);
  assert.ok(errorState.indexOf("接口已返回质量报告") < errorState.indexOf("请确认本地服务已启动"));
});

test("E.1 normalizes only explicit failed hard gates", async () => {
  const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  const inspectHardGates = source.slice(source.indexOf("function inspectHardGates"), source.indexOf("function normalizeFailedHardGates"));
  assert.match(source, /function normalizeFailedHardGates\(hardGates\)/);
  assert.match(inspectHardGates, /gate === false/);
  assert.match(inspectHardGates, /gate === true\) return/);
  assert.match(inspectHardGates, /gate\.passed === false/);
  assert.match(inspectHardGates, /gate\.passed === true\) return/);
  assert.match(inspectHardGates, /malformed\.push/);
  assert.doesNotMatch(inspectHardGates, /failed\.push\(\{[\s\S]*passed !== true/);
});

test("E.1 repair mapping separates user, system and unknown gates", async () => {
  const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  const mapping = source.slice(source.indexOf("const GATE_REPAIR_RULES"), source.indexOf("function inspectHardGates"));
  assert.match(mapping, /confirmed_fact_coverage:[\s\S]*repairability:\s*REPAIRABILITY\.REQUIRED[\s\S]*target_field:\s*"materialDetails"/);
  assert.match(mapping, /no_fabrication:[\s\S]*target_section:\s*"materials"[\s\S]*target_field:\s*"materialDetails"/);
  assert.match(mapping, /evidence_safety:[\s\S]*target_section:\s*"materials"[\s\S]*target_field:\s*"materialDetails"/);
  assert.match(mapping, /api_contract:[\s\S]*repairability:\s*REPAIRABILITY\.SYSTEM[\s\S]*target_field:\s*""/);
  assert.match(mapping, /unified_server_core:[\s\S]*repairability:\s*REPAIRABILITY\.SYSTEM[\s\S]*target_field:\s*""/);
  assert.match(mapping, /content_layering:[\s\S]*repairability:\s*REPAIRABILITY\.RETRY[\s\S]*target_field:\s*""/);
  assert.match(source, /repairability:\s*REPAIRABILITY\.UNKNOWN/);
  assert.match(source, /appendGateTechnicalDetails/);
});

test("E5.7 professional repair mapping prefers issue_code over gate fallback", async () => {
  const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  const issueMapping = source.slice(source.indexOf("const ISSUE_REPAIR_RULES"), source.indexOf("function inspectHardGates"));
  const repairFlow = source.slice(source.indexOf("function buildRepairTasks"), source.indexOf("function validateRepairTarget"));
  const technicalDetails = source.slice(source.indexOf("function appendGateTechnicalDetails"), source.indexOf("function repairabilityLabel"));

  assert.match(issueMapping, /required_section_coverage:[\s\S]*target_field:\s*"mustHave"/);
  assert.match(issueMapping, /excluded_content:[\s\S]*target_field:\s*"riskPoints"/);
  assert.match(issueMapping, /confirmed_fact_coverage:[\s\S]*target_field:\s*"materialDetails"/);
  assert.match(issueMapping, /evidence_traceability:[\s\S]*target_field:\s*"materialDetails"/);
  assert.match(issueMapping, /audience_coverage:[\s\S]*target_field:\s*"audience"/);
  assert.match(issueMapping, /purpose_coverage:[\s\S]*target_field:\s*"detailedPurpose"/);
  assert.match(repairFlow, /resolveRepairRule\(gate\)/);
  assert.match(repairFlow, /mappingSource:\s*"issue_code"/);
  assert.match(repairFlow, /mappingSource:\s*"gate_fallback"/);
  assert.match(repairFlow, /mappingSource:\s*"unmapped"/);
  assert.match(technicalDetails, /dataset\.issueCode/);
  assert.match(technicalDetails, /dataset\.mappedField/);
  assert.match(technicalDetails, /dataset\.mappingSource/);
});

test("E5.7 professional repair field registry includes content constraints", async () => {
  const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  const registry = source.slice(source.indexOf("const PROFESSIONAL_REPAIR_FIELDS"), source.indexOf("const GATE_REPAIR_RULES"));
  assert.match(registry, /constraints:[\s\S]*mustHave:[\s\S]*riskPoints:[\s\S]*customHighlight:/);
});

test("Result-First success UI renders public warnings without internal diagnostics", async () => {
  const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  const renderApi = source.slice(source.indexOf("function renderApiOutline"), source.indexOf("function renderSimpleDraftNextSteps"));

  assert.match(renderApi, /renderPublicReviewWarnings\(quality\.review_warnings \|\| outline\.review_warnings\)/);
  assert.match(renderApi, /qualityStatus === "fallback"/);
  assert.match(renderApi, /本次模型内容未进入最终脚本，当前展示的是安全兜底版本/);
  assert.doesNotMatch(renderApi, /appendDiagnosticsDetails|risk_rule_diagnostics|required_section_diagnostics|lineage|allocation|binding_id/);
});

test("E5.8 diagnostics JSON copy is explicit, safe and has visible fallback", async () => {
  const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  const copyUi = source.slice(source.indexOf("function appendDiagnosticCopyControl"), source.indexOf("function buildDiagnosticCopyPayload"));
  const payload = source.slice(source.indexOf("function buildDiagnosticCopyPayload"), source.indexOf("function repairabilityLabel"));

  assert.match(copyUi, /复制诊断 JSON/);
  assert.match(copyUi, /navigator\.clipboard\?\.writeText/);
  assert.match(copyUi, /document\.createElement\("textarea"\)/);
  assert.match(copyUi, /fallback\.readOnly = true/);
  assert.match(copyUi, /fallback\.hidden = false/);
  assert.match(copyUi, /fallback\.focus\(\)/);
  assert.match(copyUi, /fallback\.select\(\)/);
  for (const field of [
    "request_id",
    "score",
    "threshold",
    "failed_gates",
    "warnings",
    "must_include",
    "must_include_rules",
    "must_include_rule_diagnostics",
    "confirmed_fact_diagnostics",
    "risk_rule_diagnostics",
    "required_section_diagnostics",
    "industry_profile_diagnostics",
    "repair_history",
    "planning_model",
    "fallback_reason",
    "planning_rejection_reason",
    "gate_id",
    "issue_code",
    "mapped_field",
    "mapping_source"
  ]) {
    assert.match(payload, new RegExp(field));
  }
  assert.match(payload, /shouldRedactDiagnosticKey/);
  assert.match(payload, /\["API", "KEY"\]\.join\("\[_-\]\?"\)/);
  assert.match(payload, /authorization\|cookie\|token\|secret\|password\|env/);
  assert.doesNotMatch(payload, /localStorage|writeFile|fetch\(/);
});

test("E5.9 professional UI preserves mustHave line breaks for structured rules", async () => {
  const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  const readBrief = source.slice(source.indexOf("function readBrief"), source.indexOf("function normalizeAudienceAndPurpose"));
  const normalizeMultilineStart = source.indexOf("function normalizeMultilineInput");
  const normalizeMultiline = source.slice(normalizeMultilineStart, source.indexOf("function sanitize", normalizeMultilineStart));
  assert.match(readBrief, /const mustHaveInput = normalizeMultilineInput\(document\.getElementById\("mustHave"\)\.value\)/);
  assert.doesNotMatch(readBrief, /const mustHaveInput = cleanInput\(document\.getElementById\("mustHave"\)\.value\)/);
  assert.ok(normalizeMultiline.includes('.replace(/\\r\\n?/g, "\\n")'));
  assert.ok(normalizeMultiline.includes('.join("\\n")'));
});

test("E5.8 diagnostics remain production-only and out of client-facing copy", async () => {
  const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  const outlineToText = source.slice(source.indexOf("function outlineToText"), source.indexOf("function formatObject"));
  const formatReport = source.slice(source.indexOf("function formatQualityReport"), source.indexOf("function formatPlanningModel"));
  assert.ok(outlineToText.indexOf('if (version === "client")') < outlineToText.indexOf('【质量报告】'));
  assert.match(formatReport, /风险规则诊断/);
  assert.match(formatReport, /必须内容覆盖诊断/);
  assert.doesNotMatch(outlineToText.slice(0, outlineToText.indexOf('if (version === "client")')), /risk_rule_diagnostics|required_section_diagnostics|诊断 JSON/);
});

test("E.1 repair UI uses safe DOM APIs for response text", async () => {
  const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  const errorArticle = source.slice(source.indexOf("function buildGenerationErrorArticle"), source.indexOf("async function requestOutline"));
  assert.match(errorArticle, /document\.createElement/);
  assert.match(errorArticle, /\.textContent\s*=/);
  assert.match(errorArticle, /\.dataset\.gateCode\s*=/);
  assert.match(errorArticle, /appendAutomaticRepairDetails/);
  assert.match(errorArticle, /changes[\s\S]*\.map\(change => change\?\.issue\)/);
  assert.doesNotMatch(errorArticle, /innerHTML\s*=/);
  assert.doesNotMatch(errorArticle, /onerror/);
  assert.doesNotMatch(errorArticle, /<img src=x onerror=alert\(1\)>/);
});

test("E.1.1 repair UI hides raw gate codes behind technical details", async () => {
  const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  const failureDetails = source.slice(source.indexOf("function appendQualityFailureDetails"), source.indexOf("function appendRepairSummary"));
  const technicalDetails = source.slice(source.indexOf("function appendGateTechnicalDetails"), source.indexOf("function repairabilityLabel"));
  assert.doesNotMatch(failureDetails, /未通过的硬门槛/);
  assert.doesNotMatch(failureDetails, /item\.textContent\s*=\s*`\$\{gate\.code\}/);
  assert.match(failureDetails, /appendGateTechnicalDetails\(details, failedGates, malformedGates\)/);
  assert.match(technicalDetails, /document\.createElement\("details"\)/);
  assert.match(technicalDetails, /appendTextElement\(details, "summary", "技术信息"\)/);
  assert.match(technicalDetails, /item\.dataset\.gateCode\s*=\s*gate\.code/);
  assert.match(technicalDetails, /item\.textContent\s*=\s*`\$\{gate\.code\}/);
});

test("E.1.1 repair summary separates required, system and extra suggestion counts", async () => {
  const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  const summary = source.slice(source.indexOf("function appendRepairSummary"), source.indexOf("function appendRepairTaskList"));
  assert.match(summary, /\["未通过门槛", failedGates\.length\]/);
  assert.match(summary, /\["用户必须补充", tasks\.filter\(task => task\.repairability === REPAIRABILITY\.REQUIRED\)\.length\]/);
  assert.match(summary, /\["系统处理项", tasks\.filter\(task => \[REPAIRABILITY\.RETRY, REPAIRABILITY\.SYSTEM\]\.includes\(task\.repairability\)\)\.length\]/);
  assert.match(summary, /\["额外建议", tasks\.filter\(task => task\.repairability === REPAIRABILITY\.HELPFUL\)\.length \+ warningsCount\]/);
  assert.match(summary, /额外建议可能来自质量提醒，不一定属于失败门槛。/);
  assert.doesNotMatch(summary, /建议完善/);
  assert.doesNotMatch(summary, /REPAIRABILITY\.UNKNOWN/);
});

test("E.1.1 system and unknown task cards avoid duplicate visible copy", async () => {
  const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  const taskList = source.slice(source.indexOf("function appendRepairTaskList"), source.indexOf("function appendRepairWarnings"));
  assert.match(taskList, /appendTextElement\(item, "p", task\.impact\)/);
  assert.match(taskList, /appendTextElement\(item, "p", task\.suggestion\)/);
  assert.doesNotMatch(taskList, /本次生成结果未满足内部质量要求/);
  assert.doesNotMatch(taskList, /appendUnknownGateDetails/);
  assert.doesNotMatch(taskList, /原始 gate code/);
});

test("E.1.1 repair warnings strip internal code prefixes before display", async () => {
  const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  const warnings = source.slice(source.indexOf("function appendRepairWarnings"), source.indexOf("function appendAutomaticRepairDetails"));
  assert.match(warnings, /formatRepairWarningForDisplay\(warning\)/);
  assert.match(warnings, /\.replace\(\/\^\(\?:\[a-z\]\[a-z0-9_\]\*\\s\*\[:：\]\\s\*\)\+\/i/);
  assert.doesNotMatch(warnings, /appendTextElement\(list, "li", warning\)/);
});

test("E.1 regenerate keeps the existing professional generate button entry", async () => {
  const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  const regenerate = source.slice(source.indexOf("function regenerateFromCurrentProfessionalForm"), source.indexOf("function goToRepairTarget"));
  assert.match(regenerate, /generateBtn\.click\(\)/);
  assert.match(regenerate, /canRegenerateFromProfessionalForm\(\)/);
  assert.doesNotMatch(regenerate, /requestOutline/);
  assert.doesNotMatch(regenerate, /buildProfessionalRequest/);
  assert.doesNotMatch(regenerate, /fetch\(/);
});

test("E.1 display copy is not included in request builders", async () => {
  const builders = await readFile(new URL("../js/request-builders.js", import.meta.url), "utf8");
  assert.doesNotMatch(builders, /尚未达到生产级标准|修复任务|去补充|系统已尝试的自动修复|检测到一个尚未建立字段映射的质量问题/);
});

test("simple draft UI shows editable draft state and content-state labels", async () => {
  const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  assert.match(source, /PPT 草案已生成，部分信息待确认/);
  assert.match(source, /生产级 PPT 大纲已生成/);
  assert.match(source, /renderContentStateSummary/);
  assert.match(source, /用户已确认/);
  assert.match(source, /系统建议/);
  assert.match(source, /待确认/);
  assert.match(source, /已生成基础草案，本地规划模型本次未使用/);
  const renderApi = source.slice(source.indexOf("function renderApiOutline"), source.indexOf("function renderContentStateSummary"));
  assert.doesNotMatch(renderApi, /PPT 方案生成失败|生成失败/);
});

test("outline response validation accepts all three complete Result-First success states", async () => {
  const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  const validator = source.slice(source.indexOf("function validateOutlineResponse"), source.indexOf("function resetProfessionalMode"));
  assert.match(validator, /\["production_ready", "review_required", "fallback"\]\.includes\(outline\?\.quality_status\)/);
  assert.match(validator, /outline\.success !== true/);
  assert.match(validator, /typeof outline\.customer_version !== "string"/);
  assert.match(validator, /typeof outline\.production_version !== "string"/);
  assert.doesNotMatch(validator, /outline\.production_ready === true|quality_report\.passed|hard_gates/);
});

test("E.2 simple draft next steps use structured content state without optional-field task triggers", async () => {
  const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  const model = source.slice(source.indexOf("function buildSimpleDraftNextStepModel"), source.indexOf("function renderResultStatusBanner"));
  assert.match(source, /renderSimpleDraftNextSteps\(outline, quality\)/);
  assert.match(model, /quality\?\.content_state/);
  assert.match(model, /normalizeContentStateItems\(contentState\.confirmed\)/);
  assert.match(model, /normalizeContentStateItems\(contentState\.suggested\)/);
  assert.match(model, /normalizeContentStateItems\(contentState\.needs_confirmation\)/);
  assert.match(model, /normalizeMissingMaterials\(outline\?\.missing_materials\)/);
  assert.match(model, /isSimpleMaterialsModeSelected\(\) && !getSimpleMaterialsTextValue\(\)/);
  assert.doesNotMatch(model, /simplePageCount|simpleStyle|simplePurpose|simpleDeadline/);
  assert.match(source, /SIMPLE_NEXT_STEP_VISIBLE_LIMIT = 3/);
  assert.match(source, /warnings[\s\S]*formatRepairWarningForDisplay/);
  assert.doesNotMatch(source.slice(source.indexOf("function renderSimpleReminders"), source.indexOf("function renderSimpleProfessionalEntry")), /data-simple-next-target/);
});

test("E.2 simple next-step key mapping does not use hard gates or free-text labels", async () => {
  const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  const mapping = source.slice(source.indexOf("const SIMPLE_CONTENT_STATE_TARGETS"), source.indexOf("let activeMode"));
  const keyFlow = source.slice(source.indexOf("function normalizeContentStateKey"), source.indexOf("function renderResultStatusBanner"));
  assert.match(mapping, /style:[\s\S]*target:\s*"simpleStyle"/);
  assert.match(mapping, /page_count:[\s\S]*target:\s*"simplePageCount"/);
  assert.match(mapping, /audience:[\s\S]*target:\s*"simpleNeed"/);
  assert.match(mapping, /purpose:[\s\S]*target:\s*"simplePurpose"/);
  assert.match(keyFlow, /key\.startsWith\("missing:"\)/);
  assert.match(keyFlow, /key\.startsWith\("missing_material:"\)/);
  assert.match(keyFlow, /key\.startsWith\("explicit_gap:"\)/);
  assert.doesNotMatch(mapping, /confirmed_fact_coverage|api_contract|content_layering|evidence_safety/);
});

test("E.2 simple material targeting respects the radio branch before focusing textarea", async () => {
  const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  const target = source.slice(source.indexOf("function goToSimpleMaterialsTarget"), source.indexOf("function migrateSimpleFieldsToProfessional"));
  assert.match(target, /selectedRadio\?\.value === SIMPLE_MATERIALS_WITH_DETAILS/);
  assert.match(target, /radioTarget\.focus\(\{ preventScroll: true \}\)/);
  assert.match(target, /请先选择“有文字资料 \/ 图片 \/ 文件，需要整理”/);
  assert.match(target, /materialsText\.focus\(\{ preventScroll: true \}\)/);
  assert.ok(target.indexOf("radioTarget.focus") < target.indexOf("materialsText.focus"));
  assert.doesNotMatch(target, /selectedRadio\.checked\s*=\s*true|radioTarget\.checked\s*=\s*true/);
});

test("E.2 professional switch migrates only explicit safe simple fields into empty professional fields", async () => {
  const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  const migrate = source.slice(source.indexOf("function migrateSimpleFieldsToProfessional"), source.indexOf("function scrollToElement"));
  assert.match(migrate, /simpleNeed\?\.value\.trim\(\) \|\| ""/);
  assert.match(migrate, /simpleMaterialsText\?\.value\.trim\(\) \|\| ""/);
  assert.match(migrate, /selectHasOptionValue\(professionalDeadline, simpleDeadline\.value\)/);
  assert.match(migrate, /simplePurpose\.options\[simplePurpose\.selectedIndex\]\?\.textContent\.trim\(\) \|\| ""/);
  assert.match(migrate, /simplePurpose\.value !== "auto"/);
  assert.match(migrate, /setIfEmpty\(detailedPurpose, purposeText\)/);
  assert.match(migrate, /if \(field\.value\.trim\(\) \|\| !value\) return false/);
  assert.doesNotMatch(migrate, /document\.getElementById\("purpose"\)|simpleStyle|simplePageCount|quality_report|content_state|planning_model|production_ready|output_status/);
});

test("E.2 simple next-step actions keep draft cache and reuse the simple generate button", async () => {
  const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  const actions = source.slice(source.indexOf("function initializeSimpleNextStepActions"), source.indexOf("function applyProfessionalGroupDefaults"));
  assert.match(actions, /simpleGenerateBtn\.click\(\)/);
  assert.match(actions, /migrateSimpleFieldsToProfessional\(\)/);
  assert.match(actions, /setActiveMode\(PROFESSIONAL_MODE\)/);
  assert.doesNotMatch(actions, /requestOutline|buildSimpleRequest|resultCache\[SIMPLE_MODE\]\s*=/);
  assert.match(source, /专业模式更适合/);
  assert.match(source, /带入已有信息并切换到专业模式/);
});

test("E.3.2b gate 2 material template buttons mount once on stable DOM targets", async () => {
  const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  const init = source.slice(source.indexOf("function initializeMaterialTemplateUx"), source.indexOf("function applyProfessionalGroupDefaults"));
  assert.match(source, /initializeMaterialTemplateUx\(\);/);
  assert.match(init, /buttonId:\s*"simpleMaterialTemplateBtn"/);
  assert.match(init, /fieldSelector:\s*"#simpleMaterialsTextField"/);
  assert.match(init, /textareaId:\s*"simpleMaterialsText"/);
  assert.match(init, /details:\s*simpleAdvancedSettings/);
  assert.match(init, /buttonId:\s*"professionalMaterialTemplateBtn"/);
  assert.match(init, /form\.querySelector\('details\[data-professional-section="materials"\]'\)/);
  assert.match(init, /document\.getElementById\("materialDetails"\)/);
  assert.match(init, /document\.getElementById\(options\.buttonId\)\) return/);
  assert.doesNotMatch(init, /legend|nth-child|MutationObserver/);
});

test("E.3.2b gate 2 templates use exact parser aliases and separator", async () => {
  const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  const simpleTemplate = source.slice(source.indexOf("const SIMPLE_MATERIAL_TEMPLATE"), source.indexOf("const PROFESSIONAL_MATERIAL_TEMPLATE"));
  const professionalTemplate = source.slice(source.indexOf("const PROFESSIONAL_MATERIAL_TEMPLATE"), source.indexOf("const simpleForm"));
  const categories = ["企业定位", "目标客户", "产品与工艺", "定制能力", "应用场景", "服务流程", "交付能力"];
  assert.match(source, /const MATERIAL_TEMPLATE_SEPARATOR = "｜"/);
  categories.forEach(category => {
    assert.match(simpleTemplate, new RegExp(`普通资料｜${category}`));
    assert.match(professionalTemplate, new RegExp(`普通资料｜${category}`));
    assert.match(professionalTemplate, new RegExp(`已确认事实｜${category}`));
  });
  assert.match(simpleTemplate, /待确认内容｜目标客户/);
  assert.match(professionalTemplate, /待确认内容｜目标客户/);
  assert.doesNotMatch(simpleTemplate, /已确认事实｜/);
  assert.doesNotMatch(simpleTemplate, /parser|category|assertion_type|gate code/);
  assert.doesNotMatch(professionalTemplate, /parser|category|assertion_type|gate code/);
});

test("E.3.2b gate 2 template insertion is non-destructive and request-free", async () => {
  const source = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  const setup = source.slice(source.indexOf("function setupMaterialTemplateControl"), source.indexOf("function appendDescribedBy"));
  const insert = source.slice(source.indexOf("function insertMaterialTemplateIfEmpty"), source.indexOf("function applyProfessionalGroupDefaults"));
  assert.match(setup, /document\.createElement\("button"\)/);
  assert.match(setup, /button\.type = "button"/);
  assert.match(setup, /button\.textContent = options\.buttonText/);
  assert.match(setup, /note\.textContent = options\.noteText/);
  assert.match(setup, /appendDescribedBy\(textarea, options\.noteId\)/);
  assert.match(insert, /if \(details\) details\.open = true/);
  assert.match(insert, /if \(textarea\.value\.trim\(\)\)/);
  assert.match(insert, /资料区已有内容，未插入模板。/);
  assert.match(insert, /textarea\.value = template/);
  assert.match(insert, /textarea\.focus\(\{ preventScroll: true \}\)/);
  assert.match(insert, /textarea\.setSelectionRange\(cursorPosition, cursorPosition\)/);
  assert.doesNotMatch(insert, /simpleGenerateBtn\.click|generateBtn\.click|requestOutline|fetch\(|checked\s*=/);
  assert.doesNotMatch(insert, /materialDetails\.value|simpleMaterialsRadios|setActiveMode/);
  assert.doesNotMatch(setup + insert, /innerHTML\s*=/);
});

test("professional explicit fields reach the server and remain authoritative", async () => {
  const { generateOutline } = await import("../lib/generate-outline.js");
  const request = buildProfessionalRequest({
    topic: "企业软件产品介绍",
    pageCount: 7,
    scenario: "产品介绍",
    style: "商务正式",
    purpose: "展示",
    detailedPurpose: "用于董事会产品评审",
    audience: "董事会与企业客户",
    materials: ["有文字资料"],
    materialDetails: "项目名称：企业软件产品介绍\n普通素材事实：核心能力、部署边界和使用流程已完成内部梳理",
    mustHave: "核心能力",
    riskPoints: "客户名称",
    emphasis: "产品卖点",
    needScript: false,
    needImages: false,
    needLayouts: true,
    reference: "咨询公司风格",
    followAnswers: "突出部署边界",
    deadline: "三天内"
  });
  const result = await generateOutline(request);
  assert.match(result.subtitle, /董事会与企业客户/);
  assert.match(result.subtitle, /董事会产品评审/);
  assert.equal(result.slides.length, 7);
  assert.equal(result.production_strategy.deadline, "三天内");
  assert.ok(result.slides.every(slide => slide.speaker_notes === "未要求演讲备注。"));
  assert.ok(result.slides.every(slide => slide.visual_spec.ai_allowed === false));
});
