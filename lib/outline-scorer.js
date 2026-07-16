import { industryHasForbiddenTerms } from "./industry-profiles.js";
import {
  hasIndustrialEquipmentSignal,
  hasTraceableQualitySystemEvidence,
  hasTraceableRoiEvidence
} from "./final-output-contract.js";
import { textSimilarity } from "./outline-quality.js";
import { validateNarrativePlan } from "./narrative-planner.js";
import { containsInternalPhrase } from "./slide-generator.js";
import { isInstructionShellTitle } from "./structured-requirement.js";
import { validateVisualSpec } from "./visual-planner.js";
import { evaluatePlannerRetention } from "./planner-retention.js";
import { COOPERATION_PATH_STEPS, findOrderedPathInSingleBlock } from "./ordered-path.js";
import { hasConcreteNextAction, hasControlledEquipmentRelation } from "./requirement-semantics.js";
import {
  collectTraceableSegments,
  extractNamedSegmentLines,
  extractSegmentSemanticTerms,
  fragmentCoveredByText,
  resolveChannelState,
  semanticTagCovered,
  sourceRenderedInSlide,
  sourceSupportsSlide
} from "./material-context.js";

const WEIGHTS = {
  title_quality: 8,
  narrative_order: 14,
  content_specificity: 12,
  industry_relevance: 10,
  evidence_safety: 16,
  page_distinctiveness: 8,
  visual_match: 10,
  material_gaps: 7,
  deadline_fit: 5,
  api_integrity: 10
};

const INDUSTRY_TERMS = {
  new_energy_vehicle: ["续航", "补能", "试驾", "车型", "充电", "智能座舱", "辅助驾驶", "家庭出行"],
  food_beverage: ["门店", "外卖", "甜度", "SKU", "复购", "时段", "口味"],
  park_investment: ["目标企业", "空间", "政策", "到访", "洽谈", "产业", "园区"],
  history_culture: ["史料", "时代", "审美", "作品", "出处", "图像", "空间"]
};

const VAGUE_PHRASES = ["深入分析", "综合考虑", "全面提升", "持续优化", "加强建设", "形成闭环"];
const CUSTOMER_FIELDS = ["title", "subtitle"];

export function scoreOutline(outline, context, plan, metadata = {}) {
  const dimensions = {};
  const issueCodes = [];
  const repairTargets = [];
  const customerText = customerVisibleText(outline);
  const allHardGates = {};
  const requestAuthority = metadata.requestAuthority || context.requestAuthority;
  const material = requestAuthority?.materialContext || context.materialContext;

  const authorityAudience = requestAuthority?.audience || context.requestAuthority?.audience;
  const audienceIssues = audienceAlignmentIssues(outline, authorityAudience, repairTargets);
  const materialContextIssues = materialContextCoverageIssues(outline, material);
  const confirmedFactCoverage = analyzeConfirmedFactCoverage(outline, material, {
    strict: ["simple", "professional"].includes(context.sourceMode),
    requireEvidenceBinding: context.sourceMode === "professional"
  });
  const confirmedFactDiagnostics = confirmedFactCoverageDiagnostics(outline, material, {
    requireEvidenceBinding: context.sourceMode === "professional"
  });
  for (const diagnostic of confirmedFactDiagnostics.filter(item => !item.covered)) {
    const fragment = (material?.confirmed_facts || []).find(item => item.source_id === diagnostic.source_id);
    const targetSlide = diagnostic.page_id
      ? (outline.slides || []).find(slide => slideId(slide) === diagnostic.page_id)
      : suggestFactRepairSlide(fragment, outline);
    repairTargets.push({
      issue: diagnostic.expressed ? "confirmed-fact-evidence-binding" : "confirmed-fact-expression-missing",
      source_id: diagnostic.source_id,
      fragment_id: diagnostic.fragment_id,
      page_id: slideId(targetSlide),
      page_index: targetSlide?.index || diagnostic.page_index || null,
      issue_owner: diagnostic.issue_owner,
      repairability: diagnostic.repairability
    });
  }
  const confirmedFactIssues = confirmedFactCoverage.issues;
  const decisionIssues = requiredDecisionIssues(outline, material, authorityAudience);
  const segmentIssues = segmentProvenanceIssues(outline, context, repairTargets);
  const traceabilityIssues = [...evidenceTraceabilityIssues(outline, material, repairTargets), ...segmentIssues];
  const evidenceSourceSafetyIssues = evidenceSourceSafetyIssuesFor(outline, material);
  const semanticSafetyIssues = semanticSafetyIssuesFor(outline, context, repairTargets);
  const relevanceIssues = materialRelevanceIssues(outline, material);
  const requiredCoverageDiagnostics = requiredSectionCoverageDiagnostics(excludeProvenanceInstructionShells(outline, metadata.runtime), context, plan);
  const requiredCoverageIssues = requiredCoverageDiagnostics
    .filter(item => !item.covered)
    .map(item => item.required_item);
  const excludedContentDiagnostics = evaluateExcludedContent(outline, context);
  const genericTemplateIssues = genericTemplatePollutionIssues(outline, context);
  const instructionTitleIssues = instructionShellTitleIssues(outline);
  const explicitPurposeIssues = explicitPurposeAuthorityIssues(outline, context);
  const semanticPageIssues = semanticPageCountIssues(outline, context);
  const modelRetentionIssues = modelContentRetentionIssues(outline, context, metadata.runtime);
  if (materialContextIssues.length) issueCodes.push("material-context-missing");
  if (confirmedFactIssues.length) issueCodes.push("confirmed-fact-coverage");
  if (decisionIssues.length) issueCodes.push("required-decisions");
  if (traceabilityIssues.length) issueCodes.push("evidence-traceability");
  if (segmentIssues.length) issueCodes.push("segment-provenance");
  if (semanticSafetyIssues.length) issueCodes.push("semantic-safety");
  if (relevanceIssues.length) issueCodes.push("material-relevance");
  if (requiredCoverageIssues.length) issueCodes.push("required-section-coverage");
  if (genericTemplateIssues.length) issueCodes.push("generic-template-pollution");
  if (instructionTitleIssues.length) issueCodes.push("instruction-shell-title");
  if (explicitPurposeIssues.length) issueCodes.push("explicit-purpose-authority");
  if (semanticPageIssues.length) issueCodes.push("semantic-page-count");
  if (modelRetentionIssues.length) issueCodes.push("model-content-retention");
  dimensions.title_quality = scoreTitleQuality(outline, context, issueCodes, audienceIssues);
  const narrativeIssues = validateNarrativePlan(plan, context);
  dimensions.narrative_order = dimension(WEIGHTS.narrative_order, narrativeIssues, "章节满足依赖关系并按证据、分析、建议、行动推进", 4);
  narrativeIssues.forEach(() => issueCodes.push("narrative-order"));
  dimensions.content_specificity = scoreSpecificity(outline, issueCodes, [...confirmedFactIssues, ...decisionIssues, ...relevanceIssues]);
  dimensions.industry_relevance = scoreIndustry(outline, context, issueCodes, materialContextIssues);
  dimensions.evidence_safety = scoreEvidence(outline, context, issueCodes, [...evidenceSourceSafetyIssues, ...semanticSafetyIssues], excludedContentDiagnostics);
  dimensions.page_distinctiveness = scoreDistinctiveness(outline, issueCodes);
  dimensions.visual_match = scoreVisual(outline, context, issueCodes, repairTargets);
  dimensions.material_gaps = scoreMaterialGaps(outline, context, issueCodes, material);
  dimensions.deadline_fit = scoreDeadline(outline, context, issueCodes);
  const finalIntegrityIssues = finalOutputIntegrityIssues(outline, context, plan, metadata.sourceOutline);
  dimensions.api_integrity = scoreApi(outline, context, issueCodes, finalIntegrityIssues);

  const coverText = outline.slides[0] ? `${outline.slides[0].title} ${outline.slides[0].key_message} ${outline.slides[0].content}` : "";
  const fabricated = /\d+(?:\.\d+)?%|市场份额(?:为|达到)|用户数量(?:为|达到)|增长率(?:为|达到)|销量(?:为|达到)|保证|绝对领先|行业第一/.test(customerText);
  const hypothesisSafe = outline.slides
    .filter(slide => slide.evidence_status === "hypothesis_pending")
    .every(slide => /待验证/.test(`${slide.title} ${slide.key_message} ${slide.content}`) && /不代表真实/.test(slide.content));
  const titleMatch = !issueCodes.includes("title-content-mismatch");
  const visualSafe = !issueCodes.includes("visual-semantic-mismatch");
  const apiSafe = dimensions.api_integrity.score === dimensions.api_integrity.max;
  const layeringSafe = !containsInternalPhrase(customerText) && !/证据状态：|需准备：|质量报告|自动修复/.test(customerText);
  const pipeline = metadata.pipeline || outline.pipeline;
  const unifiedServerCore = ["server-result-first", "server-generate-outline"].includes(pipeline);

  Object.assign(allHardGates, {
    evidence_safety: {
      passed: dimensions.evidence_safety.score === dimensions.evidence_safety.max && hypothesisSafe,
      reason: dimensions.evidence_safety.score < dimensions.evidence_safety.max
        ? dimensions.evidence_safety.reasons.join("；")
        : hypothesisSafe ? "事实、框架与待验证假设已区分，证据来源可追溯" : "待验证假设缺少明确标记",
      issue_codes: dimensions.evidence_safety.score < dimensions.evidence_safety.max ? evidenceSafetyIssueCodes(dimensions.evidence_safety.reasons) : []
    },
    no_fabrication: { passed: !fabricated, reason: fabricated ? "检测到未经资料支持的数值或绝对化结论" : "未检测到虚构数值或绝对化结论" },
    narrative_dependencies: { passed: narrativeIssues.length === 0, reason: narrativeIssues.length ? narrativeIssues.join("；") : "章节依赖和顺序正确" },
    cover_clean: { passed: !containsInternalPhrase(coverText), reason: containsInternalPhrase(coverText) ? "封面含内部生产话术" : "封面仅包含客户可见信息" },
    title_content_match: { passed: titleMatch, reason: titleMatch ? "标题、key message 与正文主题一致" : "存在标题与正文主题不匹配" },
    visual_semantics: { passed: visualSafe, reason: visualSafe ? "逐页视觉类型与指令一致" : "存在视觉类型串台" },
    audience_alignment: { passed: audienceIssues.length === 0, reason: audienceIssues.length ? audienceIssues.join("；") : `最终受众与原始${requestAuthority?.audience?.source || context.audienceSource}依据一致：${requestAuthority?.audience?.value || context.audience}`, issue_codes: audienceIssues.length ? ["audience_coverage"] : [] },
    material_context_coverage: { passed: materialContextIssues.length === 0, reason: materialContextIssues.length ? materialContextIssues.join("；") : "品牌、项目背景与市场阶段已合理覆盖" },
    confirmed_fact_coverage: {
      passed: confirmedFactIssues.length === 0,
      reason: confirmedFactIssues.length
        ? confirmedFactIssues.join("；")
        : confirmedFactCoverage.applicable
          ? `明确确认事实覆盖率 ${confirmedFactCoverage.covered_count}/${confirmedFactCoverage.total}`
          : "未提供需进入客户正文的核心已确认事实，本项不适用",
      code: confirmedFactCoverage.code,
      coverage: confirmedFactCoverage.coverage,
      covered_count: confirmedFactCoverage.covered_count,
      total: confirmedFactCoverage.total,
      covered_categories: confirmedFactCoverage.covered_categories,
      available_categories: confirmedFactCoverage.available_categories,
      applicable: confirmedFactCoverage.applicable,
      issue_codes: confirmedFactIssues.length ? ["confirmed_fact_coverage"] : []
    },
    required_decisions: { passed: decisionIssues.length === 0, reason: decisionIssues.length ? decisionIssues.join("；") : "客户明确决策要求已进入最终行动页", issue_codes: decisionIssues.length ? ["purpose_coverage"] : [] },
    evidence_traceability: { passed: traceabilityIssues.length === 0, reason: traceabilityIssues.length ? traceabilityIssues.join("；") : "证据状态均有存在、相关且极性正确的原始来源", issue_codes: traceabilityIssues.length ? ["evidence_traceability"] : [] },
    material_relevance: { passed: relevanceIssues.length === 0, reason: relevanceIssues.length ? relevanceIssues.join("；") : "最终内容保留客户素材的关键语义，未退化为通用模板" },
    required_section_coverage: { passed: requiredCoverageIssues.length === 0, reason: requiredCoverageIssues.length ? `明确要求内容未覆盖：${requiredCoverageIssues.join("、")}` : "用户明确要求的内容模块已按页面预算覆盖", issue_codes: requiredCoverageIssues.length ? ["required_section_coverage"] : [] },
    generic_template_pollution: { passed: genericTemplateIssues.length === 0, reason: genericTemplateIssues.length ? genericTemplateIssues.join("；") : "未检测到多页通用模板污染" },
    instruction_shell_title: { passed: instructionTitleIssues.length === 0, reason: instructionTitleIssues.length ? instructionTitleIssues.join("；") : "标题已去除任务指令外壳和执行参数" },
    explicit_purpose_authority: { passed: explicitPurposeIssues.length === 0, reason: explicitPurposeIssues.length ? explicitPurposeIssues.join("；") : "显式用途字段已进入最终输出" },
    semantic_page_count: { passed: semanticPageIssues.length === 0, reason: semanticPageIssues.length ? semanticPageIssues.join("；") : "页数由业务页面构成，未用通用附录补齐" },
    title_body_alignment: { passed: titleMatch, reason: titleMatch ? "标题、key message 与正文主题一致" : "存在标题与正文主题不匹配" },
    model_content_retention: { passed: modelRetentionIssues.length === 0, reason: modelRetentionIssues.length ? modelRetentionIssues.join("；") : "模型具体正文已保留或本次无模型正文可保留" },
    manual_page_count: { passed: !context.manualPageCount || outline.slides.length === context.requestedPageCount, reason: `输出 ${outline.slides.length} 页，要求 ${context.requestedPageCount} 页` },
    api_contract: { passed: apiSafe, reason: apiSafe ? "旧字段与新增分层字段完整" : "API 字段或类型不完整" },
    final_output_integrity: { passed: finalIntegrityIssues.length === 0, reason: finalIntegrityIssues.length ? finalIntegrityIssues.join("；") : "最终公开对象与内部页面、顺序及制作字段同步" },
    content_layering: { passed: layeringSafe, reason: layeringSafe ? "客户内容与制作备注已分层" : "客户内容混入制作备注" },
    unified_server_core: { passed: unifiedServerCore, reason: unifiedServerCore ? "结果由唯一服务端生成核心产出" : "结果未标记为统一服务端核心" }
  });

  const total = Object.values(dimensions).reduce((sum, item) => sum + item.score, 0);
  return {
    score: total,
    dimensions,
    hard_gates: allHardGates,
    confirmed_fact_coverage: confirmedFactCoverage,
    confirmed_fact_diagnostics: confirmedFactDiagnostics,
    risk_rule_diagnostics: riskRuleDiagnostics(context, excludedContentDiagnostics),
    required_section_diagnostics: requiredCoverageDiagnostics,
    issue_codes: [...new Set(issueCodes)],
    repair_targets: repairTargets,
    warnings: collectWarnings(dimensions, allHardGates)
  };
}

function scoreTitleQuality(outline, context, issueCodes, audienceIssues) {
  const reasons = [];
  let score = WEIGHTS.title_quality;
  const titles = outline.slides.map(slide => normalize(slide.title));
  if (new Set(titles).size !== titles.length) {
    score -= 2;
    reasons.push("存在重复页面标题");
    issueCodes.push("duplicate-title");
  }
  const missingMessage = outline.slides.filter(slide => !slide.key_message?.trim());
  if (missingMessage.length) {
    score -= 3;
    reasons.push(`${missingMessage.length} 页缺少 key message`);
    issueCodes.push("missing-key-message");
  }
  const repeatedMessage = outline.slides.filter(slide => normalize(slide.key_message) === normalize(slide.title));
  if (repeatedMessage.length) {
    score -= 1;
    reasons.push("key message 仅重复标题");
    issueCodes.push("repeated-key-message");
  }
  const mismatches = outline.slides.slice(1).filter(slide => !titleMatchesSlide(slide));
  if (mismatches.length) {
    score -= Math.min(3, mismatches.length);
    reasons.push(`${mismatches.length} 页标题与正文缺少语义对应：${mismatches.map(slide => slide.title).join("、")}`);
    issueCodes.push("title-content-mismatch");
  }
  if (audienceIssues.length) {
    score -= 4;
    reasons.push(...audienceIssues);
    issueCodes.push("audience-mismatch");
  }
  const duplicatedBrand = duplicatedBrandTitleIssues(outline, context);
  if (duplicatedBrand.length) {
    score -= Math.min(3, duplicatedBrand.length);
    reasons.push(...duplicatedBrand);
    issueCodes.push("duplicated-brand-title");
  }
  if (!reasons.length) reasons.push("标题唯一、准确，且每页 key message 独立说明判断或任务");
  return result(score, WEIGHTS.title_quality, reasons);
}

function scoreSpecificity(outline, issueCodes, materialIssues = []) {
  const lines = outline.slides.slice(1).flatMap(slide => slide.content.split("\n").filter(Boolean));
  const vague = lines.filter(line => VAGUE_PHRASES.some(term => line.includes(term)) && !/[：:]/.test(line));
  const concrete = lines.filter(line => /[：:×→]|验证|比较|记录|明确|核验|映射|区分|建立|补齐|形成/.test(line));
  let score = WEIGHTS.content_specificity;
  const reasons = [];
  if (vague.length) {
    score -= Math.min(4, vague.length);
    reasons.push(`${vague.length} 条内容使用空泛表达且未给出对象或动作`);
    issueCodes.push("vague-content");
  }
  if (lines.length && concrete.length / lines.length < 0.65) {
    score -= 3;
    reasons.push("明确对象、比较维度、验证方法或业务动作的内容占比不足");
    issueCodes.push("low-specificity");
  }
  if (materialIssues.length) {
    score -= Math.min(6, materialIssues.length * 2);
    reasons.push(...materialIssues);
    issueCodes.push("material-content-missing");
  }
  if (!reasons.length) reasons.push(`${concrete.length}/${lines.length} 条正文包含明确对象、维度、验证方法或动作`);
  return result(score, WEIGHTS.content_specificity, reasons);
}

function scoreIndustry(outline, context, issueCodes, materialContextIssues = []) {
  const text = customerVisibleText(outline);
  const forbidden = industryHasForbiddenTerms(context.industry, text);
  const industrialDeliveryIssues = industrialEquipmentDeliveryIssues(text, context);
  const expected = INDUSTRY_TERMS[context.industry.id] || [];
  const hits = expected.filter(term => text.includes(term));
  let score = WEIGHTS.industry_relevance;
  const reasons = [];
  if (forbidden.length) {
    score -= Math.min(6, forbidden.length * 2);
    reasons.push(`检测到跨行业污染：${forbidden.join("、")}`);
    issueCodes.push("cross-industry-pollution");
  }
  if (expected.length && hits.length < 3) {
    score -= 3;
    reasons.push(`专项行业维度不足，仅命中：${hits.join("、") || "无"}`);
    issueCodes.push("low-industry-specificity");
  }
  if (materialContextIssues.length) {
    score -= Math.min(6, materialContextIssues.length * 3);
    reasons.push(...materialContextIssues);
    issueCodes.push("material-context-missing");
  }
  if (industrialDeliveryIssues.length) {
    score -= Math.min(6, industrialDeliveryIssues.length * 2);
    reasons.push(...industrialDeliveryIssues);
    issueCodes.push("industrial-equipment-delivery-language");
  }
  if (!reasons.length) reasons.push(expected.length ? `使用了${hits.length}个与章节相关的${context.industry.label}专业维度，且无跨行业污染` : `类型模板与${context.type.label}任务匹配，未混入其他行业术语`);
  return result(score, WEIGHTS.industry_relevance, reasons);
}

function scoreEvidence(outline, context, issueCodes, sourceSafetyIssues = [], excludedContentDiagnostics = null) {
  const text = customerVisibleText(outline);
  const reasons = [];
  let score = WEIGHTS.evidence_safety;
  if (/\d+(?:\.\d+)?%|保证|绝对领先|行业第一|市场份额(?:为|达到)/.test(text)) {
    score -= 10;
    reasons.push("出现未建立来源的数值或绝对化结论");
    issueCodes.push("fabricated-claim");
  }
  const unsafeHypotheses = outline.slides.filter(slide => slide.evidence_status === "hypothesis_pending" && !/待验证/.test(`${slide.title} ${slide.content}`));
  if (unsafeHypotheses.length) {
    score -= 6;
    reasons.push("待验证假设被写成事实");
    issueCodes.push("unsafe-hypothesis");
  }
  const excludedHits = (excludedContentDiagnostics || evaluateExcludedContent(outline, context)).filter(hit => hit.violation);
  if (excludedHits.length) {
    score -= 8;
    reasons.push(`客户排除内容仍出现在正文：${[...new Set(excludedHits.map(hit => hit.subject))].join("、")}`);
    issueCodes.push("excluded-content-leak");
  }
  if (sourceSafetyIssues.length) {
    score -= Math.min(12, sourceSafetyIssues.length * 3);
    reasons.push(...sourceSafetyIssues);
    issueCodes.push("evidence-source-safety");
  }
  const contractEvidenceIssues = unsupportedEvidenceTitleIssues(outline, context);
  if (contractEvidenceIssues.length) {
    score -= Math.min(10, contractEvidenceIssues.length * 4);
    reasons.push(...contractEvidenceIssues);
    issueCodes.push("unsupported-contract-claim");
  }
  if (!reasons.length) reasons.push("事实、分析框架、待验证假设和建议均使用对应证据状态，未发现虚构数值");
  return result(score, WEIGHTS.evidence_safety, reasons);
}

export function evaluateExcludedContent(outline, context) {
  if (context.excludedContentRuleSource === "structured_parse_error") {
    return (context.excludedContentParseErrors || []).map(error => ({
      violation: false,
      rule_source: "structured_parse_error",
      parse_error: error.parse_error,
      source_field: error.source_field,
      raw_text: error.raw_text,
      violation_reason: "structured rules parse failed; legacy excluded_content was not used"
    }));
  }
  const ruleSource = context.excludedContentRules?.length
    ? (context.excludedContentRuleSource || "structured")
    : "legacy_fallback";
  const rules = context.excludedContentRules?.length
    ? context.excludedContentRules
    : (context.excludedContent || []).map(term => ({
      raw_text: term,
      subject_terms: [term],
      forbidden_zones: ["页面标题", "副标题", "正文", "页面结论", "图示文字", "演讲备注"],
      source_field: "excluded_content",
      rule_type: "forbidden_subject"
    }));
  const regions = collectInspectableRegions(outline);
  const hits = [];
  for (const rule of rules) {
    if (rule.rule_type === "prohibited_relationship_claim") {
      for (const region of regions) {
        if (!zoneAppliesToRegion(rule.forbidden_zones || [], region.kind)) continue;
        const segments = splitSemanticSegments(region.text);
        for (const segment of segments) {
          const match = relationshipViolationForSegment(segment, rule);
          if (!match.matched) continue;
          hits.push({
            violation: match.violation,
            subject: match.subject,
            raw_text: rule.raw_text,
            rule_source: ruleSource,
            rule_type: rule.rule_type,
            source_field: rule.source_field,
            subject_terms: rule.subject_terms || [],
            entities: rule.entities || [],
            prohibited_relations: rule.prohibited_relations || [],
            forbidden_zones: rule.forbidden_zones || [],
            matched_region: region.kind,
            region: region.kind,
            slide_index: region.slide_index,
            matched_clause: segment,
            segment,
            violation_reason: match.reason
          });
        }
      }
      continue;
    }
    const subjects = rule.subject_terms?.length ? rule.subject_terms : rule.claim_terms || [];
    for (const subject of subjects) {
      const aliases = subjectAliases(subject);
      for (const region of regions) {
        const segments = splitSemanticSegments(region.text);
        for (const segment of segments) {
          if (!aliases.some(alias => alias && segment.includes(alias))) continue;
          const zoneViolation = zoneAppliesToRegion(rule.forbidden_zones || [], region.kind)
            && isPositiveForbiddenSegment(segment, aliases);
          const roleViolation = claimRoleViolationForSegment(segment, aliases, rule.forbidden_claim_roles || []);
          const claimViolation = claimTermViolationForSegment(segment, aliases, rule);
          const violation = zoneViolation || roleViolation || claimViolation;
          hits.push({
            violation,
            subject,
            raw_text: rule.raw_text,
            rule_source: ruleSource,
            rule_type: rule.rule_type,
            source_field: rule.source_field,
            subject_terms: rule.subject_terms || [],
            claim_terms: rule.claim_terms || [],
            forbidden_claim_roles: rule.forbidden_claim_roles || [],
            entities: rule.entities || [],
            prohibited_relations: rule.prohibited_relations || [],
            forbidden_zones: rule.forbidden_zones || [],
            matched_region: region.kind,
            region: region.kind,
            slide_index: region.slide_index,
            matched_clause: segment,
            segment,
            violation_reason: violation
              ? violationReasonFor({ zoneViolation, roleViolation, claimViolation, rule })
              : "boundary_or_negative_clause"
          });
        }
      }
    }
  }
  return hits;
}

function scoreDistinctiveness(outline, issueCodes) {
  let duplicates = 0;
  for (let index = 0; index < outline.slides.length; index += 1) {
    for (let other = index + 1; other < outline.slides.length; other += 1) {
      if (textSimilarity(outline.slides[index].content, outline.slides[other].content) > 0.72) duplicates += 1;
    }
  }
  const score = Math.max(0, WEIGHTS.page_distinctiveness - duplicates * 2);
  if (duplicates) issueCodes.push("similar-pages");
  return result(score, WEIGHTS.page_distinctiveness, duplicates ? [`检测到 ${duplicates} 组高相似页面`] : ["全篇页面意图和正文差异明确，无高相似页面"]);
}

function scoreVisual(outline, context, issueCodes, repairTargets) {
  const issues = outline.slides.flatMap(slide => validateVisualSpec(slide, context).map(issue => {
    repairTargets.push({ issue: "visual-semantic-mismatch", page_id: slide._page_id, page_index: slide.index, reason: issue });
    return `${slide.index}:${issue}`;
  }));
  const repeatedGlobal = outline.slides.filter(slide => /深灰底|电光蓝|宣纸白|奶油白底|统一配色/.test(slide.visual_suggestion));
  if (repeatedGlobal.length) issues.push(`${repeatedGlobal.length} 页重复全局视觉规范`);
  if (issues.length) issueCodes.push("visual-semantic-mismatch");
  return dimension(WEIGHTS.visual_match, issues, "视觉 schema、页面构图和 AI 使用边界匹配，且未重复全局样式", 3);
}

function scoreMaterialGaps(outline, context, issueCodes, material) {
  const labels = outline.missing_materials.map(item => item.label);
  const duplicates = labels.length - new Set(labels).size;
  const requestedProvided = labels.filter(label => [...context.availableMaterials].some(id => context.materialLabels.get(id) === label));
  const issues = [];
  if (duplicates) issues.push(`资料缺口重复 ${duplicates} 项`);
  if (requestedProvided.length) issues.push(`重复索要已提供资料：${requestedProvided.join("、")}`);
  const missingExplicit = (material?.explicit_gaps || []).filter(gap => !outline.missing_materials.some(item => item.source_id === gap.source_id));
  if (missingExplicit.length) issues.push(`遗漏 ${missingExplicit.length} 项客户明确资料缺口`);
  if (issues.length) issueCodes.push("invalid-material-gaps");
  return dimension(WEIGHTS.material_gaps, issues, "资料缺口已去重、关联页面，且不会重复索要已提供资料", 3);
}

function scoreDeadline(outline, context, issueCodes) {
  const issues = [];
  const maxPoints = context.delivery.maxContentPoints;
  const dense = outline.slides.filter(slide => slide.content.split("\n").filter(Boolean).length > maxPoints);
  const aiCount = outline.slides.filter(slide => slide.visual_spec.ai_allowed).length;
  if (dense.length) issues.push(`${dense.length} 页内容密度超过 ${context.delivery.label} 策略`);
  if (aiCount > context.delivery.maxAiImages) issues.push(`AI 图片数 ${aiCount} 超过上限 ${context.delivery.maxAiImages}`);
  if (issues.length) issueCodes.push("deadline-mismatch");
  return dimension(WEIGHTS.deadline_fit, issues, `内容密度和视觉复杂度符合“${context.delivery.label}”策略，正确性门槛未降低`, 2);
}

function scoreApi(outline, context, issueCodes, finalIntegrityIssues) {
  const issues = [...finalIntegrityIssues];
  if (typeof outline.title !== "string" || !outline.title.trim()) issues.push("缺少总标题");
  if (!Array.isArray(outline.executive_summary)) issues.push("执行摘要不是数组");
  if (!outline.global_visual_style || typeof outline.global_visual_style !== "object") issues.push("缺少全局视觉规范");
  if (!Array.isArray(outline.slides) || outline.slides.length !== context.pageCount) issues.push("页数或 slides 不完整");
  for (const [offset, slide] of outline.slides.entries()) {
    if (slide.index !== offset + 1) issues.push(`第 ${offset + 1} 页页码不连续`);
    for (const key of ["title", "content", "visual_suggestion", "image_prompt", "key_message", "evidence_status", "speaker_notes"]) {
      if (typeof slide[key] !== "string" || !slide[key].trim()) issues.push(`第 ${offset + 1} 页缺少 ${key}`);
    }
    if (!Array.isArray(slide.data_requirements) || !Array.isArray(slide.evidence_sources) || !slide.visual_spec) issues.push(`第 ${offset + 1} 页扩展字段不完整`);
  }
  if (issues.length) issueCodes.push("api-contract");
  return dimension(WEIGHTS.api_integrity, issues, "旧五字段、新增分层字段、页码和类型均完整", 3);
}

function audienceAlignmentIssues(outline, authorityAudience, repairTargets = []) {
  if (!authorityAudience || authorityAudience.source === "default") return [];
  const expectedValue = authorityAudience.value;
  const expected = normalize(expectedValue);
  const subtitle = normalize(outline.subtitle);
  const cover = normalize(outline.slides[0]?.content);
  const issues = [];
  if (!subtitle.includes(expected) && !cover.includes(expected)) issues.push(`最终客户可见内容未保留权威受众“${expectedValue}”`);
  if (!cover.includes(expected)) issues.push(`最终封面未保留权威受众“${expectedValue}”`);

  const visibleAudience = `${outline.subtitle || ""} ${outline.slides[0]?.content || ""}`;
  if (["internal_management", "board", "internal_review", "internal_training"].includes(authorityAudience.intent)
    && /客户与潜在合作方/.test(visibleAudience)) {
    issues.push("内部决策或评审受众被改写为外部客户");
  }
  const action = [...outline.slides].reverse().find(slide => ["action", "recommendation"].includes(slide.role)) || outline.slides.at(-1);
  const controlledFields = [
    outline.title,
    outline.subtitle,
    ...outline.slides.flatMap(slide => [slide.title, slide.key_message]),
    action?.content,
    action?.speaker_notes,
    ...(action?.evidence_sources || []).map(source => source.excerpt)
  ].filter(Boolean).join("\n");
  const disallowed = authorityAudience.intent === "board"
    ? []
    : ["董事会", "投资委员会"].filter(actor => new RegExp(`${actor}[^。；;\\n]{0,24}(?:决策|批准|确认|继续|调整|停止)`).test(controlledFields));
  if (disallowed.length) {
    const reason = `权威决策主体“${expectedValue}”被漂移为：${disallowed.join("、")}`;
    issues.push(reason);
    if (action?._page_id) repairTargets.push({ issue: "decision-actor-drift", page_id: action._page_id, page_index: action.index, reason });
  }
  return issues;
}

function materialContextCoverageIssues(outline, material) {
  if (!material?.fragments?.length) return [];
  const text = customerVisibleText(outline);
  const requiredIds = new Set(["brand", "market_entry", "china_market", "pre_launch"]);
  const missing = (material.critical_anchors || []).filter(anchor => requiredIds.has(anchor.id) && !anchorCovered(anchor, text, material));
  return missing.map(anchor => `关键项目背景未覆盖：${anchor.label}`);
}

export function analyzeConfirmedFactCoverage(outline, material, { strict = true, requireEvidenceBinding = true } = {}) {
  const explicitFacts = (material?.confirmed_facts || [])
    .filter(fragment => fragment.assertion_type === "explicit_confirmed_fact");
  if (!explicitFacts.length) {
    return coverageResult({
      applicable: strict,
      available: [],
      covered: [],
      total: 0,
      coveredCount: 0,
      code: strict ? "no_explicit_confirmed_facts" : "not_applicable",
      issues: strict ? ["no_explicit_confirmed_facts：未提供明确确认事实，无法计算生产级确认事实覆盖率"] : []
    });
  }
  const factStates = explicitFacts.map(fragment => ({
    fragment,
    category: confirmedFactCategory(fragment),
    ...confirmedFactState(fragment, outline, { requireEvidenceBinding })
  }));
  const coveredFacts = factStates.filter(item => item.covered);
  const total = explicitFacts.length;
  const coveredCount = coveredFacts.length;
  const coverage = total ? coveredCount / total : 0;
  const available = [...new Set(factStates.map(item => item.category))];
  const covered = [...new Set(coveredFacts.map(item => item.category))];
  const issues = [];
  if (coveredCount < total) {
    const missing = factStates.filter(item => !item.covered).map(item => item.fragment.source_id).join("、");
    issues.push(`explicit_confirmed_fact_coverage_incomplete：明确确认事实覆盖不足，已覆盖 ${coveredCount}/${total}，缺失 ${missing}`);
  }
  return coverageResult({
    applicable: true,
    available,
    covered,
    total,
    coveredCount,
    code: issues.length ? "explicit_confirmed_fact_coverage_incomplete" : "ok",
    issues
  });
}

export function confirmedFactState(fragment, outline, { requireEvidenceBinding = true } = {}) {
  const identityValue = confirmedIdentityValue(fragment);
  if (identityValue) {
    const identitySlide = (outline.slides || []).find(slide => exactIdentityTitleMatch(identityValue, slide.title))
      || (exactIdentityTitleMatch(identityValue, outline.title) ? (outline.slides || [])[0] : null);
    if (identitySlide) {
      return {
        covered: true,
        expressed: true,
        evidence_bound: true,
        binding_mode: "identity_title_exact_match",
        page_index: identitySlide.index || 1,
        page_title: identitySlide.title || outline.title || "",
        page_id: slideId(identitySlide)
      };
    }
  }
  for (const slide of outline.slides || []) {
    const slideText = `${slide.title || ""}\n${slide.key_message || ""}\n${slide.content || ""}\n${slide.visual_suggestion || ""}`;
    const expressed = fragmentCoveredByText(fragment, slideText)
      || fragment.semantic_tags.some(tag => semanticTagCovered(tag, slideText));
    if (!expressed) continue;
    const sourceBound = (slide.evidence_sources || []).some(source =>
      source.source_id === fragment.source_id
      && source.fragment_id === fragment.fragment_id
      && source.excerpt === fragment.excerpt
      && source.field === fragment.field
      && source.polarity === fragment.polarity
      && source.assertion_type === fragment.assertion_type
    );
    return {
      covered: requireEvidenceBinding ? sourceBound : expressed,
      expressed,
      evidence_bound: sourceBound,
      binding_mode: sourceBound ? "evidence_source_exact_match" : "none",
      page_index: slide.index,
      page_title: slide.title || "",
      page_id: slideId(slide)
    };
  }
  return { covered: false, expressed: false, evidence_bound: false, binding_mode: "none", page_index: null, page_title: "", page_id: "" };
}

function confirmedFactCoverageDiagnostics(outline, material, { requireEvidenceBinding = true } = {}) {
  return (material?.confirmed_facts || [])
    .filter(fragment => fragment.assertion_type === "explicit_confirmed_fact")
    .map(fragment => {
      const state = confirmedFactState(fragment, outline, { requireEvidenceBinding });
      return {
        source_id: fragment.source_id,
        fragment_id: fragment.fragment_id,
        field: fragment.field,
        assertion_type: fragment.assertion_type,
        polarity: fragment.polarity,
        excerpt: fragment.excerpt,
        expressed: state.expressed,
        evidence_bound: state.evidence_bound,
        covered: state.covered,
        page_index: state.page_index,
        page_title: state.page_title,
        page_id: state.page_id,
        binding_mode: state.binding_mode,
        issue_owner: state.covered ? "none" : state.expressed ? "system" : "model",
        repairability: state.covered ? "none" : state.expressed ? "deterministic" : "regenerate",
        missing_reason: state.covered
          ? ""
          : state.expressed && !state.evidence_bound
            ? "evidence_binding_missing_or_mismatch"
            : "fact_not_expressed"
      };
    });
}

function coverageResult({ applicable, available, covered, total, coveredCount, code, issues }) {
  return {
    applicable,
    available_categories: available,
    covered_categories: covered,
    total,
    covered_count: coveredCount,
    coverage: total ? Number((coveredCount / total).toFixed(4)) : 0,
    code,
    issues
  };
}

function confirmedFactCategory(fragment) {
  if (fragment.semantic_tags.includes("brand")) return "品牌或项目主体";
  if (fragment.semantic_tags.some(tag => ["market_entry", "china_market", "pre_launch", "project_stage"].includes(tag))) return "当前市场进入或项目阶段";
  if (fragment.semantic_tags.includes("no_customer_data")) return "数据与证据边界";
  if (fragment.semantic_tags.includes("undetermined_strategy")) return "尚未确定的关键业务变量";
  if (fragment.semantic_tags.includes("low_cost_validation")) return "当前管理层策略或验证原则";
  if (fragment.semantic_tags.includes("approval_resources")) return "董事会批准、预算或资源状态";
  return "明确确认事实";
}

function requiredDecisionIssues(outline, material, authorityAudience) {
  if (!material?.required_decisions?.length) return [];
  const action = [...outline.slides].reverse().find(slide => ["action", "recommendation"].includes(slide.role)) || outline.slides.at(-1);
  const text = `${action?.title || ""} ${action?.key_message || ""} ${action?.content || ""}`;
  const issues = [];
  const expected = authorityAudience?.value;
  if (expected && !normalize(text).includes(normalize(expected))) issues.push(`最终行动页缺少权威决策主体“${expected}”`);
  if (!/(决策|确认)/.test(text)) issues.push("最终行动页缺少明确决策事项");
  if (!/继续/.test(text) || !/调整/.test(text) || !/停止/.test(text)) issues.push("最终行动页缺少继续、调整或停止的决策逻辑");
  return issues;
}

function segmentProvenanceIssues(outline, context, repairTargets = []) {
  const allowed = collectTraceableSegments(context);
  const allowedByLabel = new Map(allowed.map(item => [normalizeSegment(item.label), item]));
  const issues = [];
  for (const slide of outline.slides.filter(item => ["segments", "archetype"].includes(item.slide_type))) {
    const named = extractNamedSegmentLines(slide);
    const traceable = named.filter(item => allowedByLabel.has(normalizeSegment(item.label)));
    const untraceable = named.filter(item => !allowedByLabel.has(normalizeSegment(item.label)));
    for (const item of untraceable) {
      const reason = `第 ${slide.index} 页存在无来源命名分群：${item.label}`;
      issues.push(reason);
      repairTargets.push({ issue: "segment-provenance", page_id: slide._page_id, page_index: slide.index, entity_label: item.label, reason });
    }
    for (const item of traceable) {
      const source = allowedByLabel.get(normalizeSegment(item.label));
      const expectedTerms = source.semantic_terms || extractSegmentSemanticTerms(source.excerpt, source.label);
      const missingTerms = expectedTerms.filter(term => !normalizeSegment(item.line).includes(normalizeSegment(term)));
      if (missingTerms.length) {
        const reason = `第 ${slide.index} 页分群“${item.label}”丢失或替换来源核心语义：${missingTerms.join("、")}`;
        issues.push(reason);
        repairTargets.push({
          issue: "segment-semantic-drift",
          page_id: slide._page_id,
          page_index: slide.index,
          entity_label: item.label,
          source_id: source.source_id,
          reason
        });
      }
    }
    if (slide.visual_spec?.visual_type === "persona_cards") {
      const visualCount = slide.visual_spec.entity_count;
      const visualLabels = (slide.visual_spec.entity_labels || []).map(normalizeSegment);
      const traceableLabels = traceable.map(item => normalizeSegment(item.label));
      if (visualCount !== traceable.length || !sameSet(visualLabels, traceableLabels)) {
        const reason = `第 ${slide.index} 页分群实体 ${traceable.length} 个，与视觉实体 ${visualCount ?? "未声明"} 个不一致`;
        issues.push(reason);
        repairTargets.push({ issue: "visual-semantic-mismatch", page_id: slide._page_id, page_index: slide.index, reason });
      }
    }
  }
  return [...new Set(issues)];
}

function semanticSafetyIssuesFor(outline, context, repairTargets = []) {
  const issues = [];
  const sourceById = new Map(context.materialContext.fragments.map(fragment => [fragment.source_id, fragment]));
  const physicalChannelConfirmed = resolveChannelState(context) === "confirmed_physical_channel";
  for (const slide of outline.slides) {
    const lines = String(slide.content || "").split("\n");
    if (!physicalChannelConfirmed && lines.some(line => /门店(?:来源|咨询|转化|布局|记录|数据)/.test(line) && !/尚未|未确定|待确认|没有|缺少/.test(line))) {
      const reason = `第 ${slide.index} 页在渠道未获确认时使用确定性门店表达`;
      issues.push(reason);
      repairTargets.push({ issue: "channel-certainty", page_id: slide._page_id, page_index: slide.index, reason });
    }
    const hasRelevantPositiveSource = (slide.evidence_sources || []).some(source => {
      const fragment = sourceById.get(source.source_id);
      return fragment?.polarity === "positive" && sourceSupportsSlide(fragment, slide);
    });
    const unsafeClaim = lines.find(line => /(?:痛点|偏好|障碍)\s*[：:]/.test(line)
      && !/(?:待验证|需核验|潜在|假设|可能|待确认)/.test(line)
      && !hasRelevantPositiveSource);
    if (unsafeClaim) {
      const reason = `第 ${slide.index} 页将未经验证的痛点、偏好或障碍写成客户事实`;
      issues.push(reason);
      repairTargets.push({ issue: "unsupported-customer-claim", page_id: slide._page_id, page_index: slide.index, reason });
    }
    if (["recommendation", "action"].includes(slide.role)) {
      const hypothesisTerms = collectTraceableSegments(context).flatMap(item => item.semantic_terms || []);
      const upgraded = lines.find(line => hypothesisTerms.some(term => normalizeSegment(line).includes(normalizeSegment(term)))
        && /(?:建议|启示|应当|应该|必须|优先|映射到)/.test(line)
        && !/(?:待验证|验证[^。；;]*后|确认后|若|前提|视验证结果)/.test(line));
      if (upgraded) {
        const reason = `第 ${slide.index} 页将待验证关注点升级为确定性建议`;
        issues.push(reason);
        repairTargets.push({ issue: "recommendation-evidence-boundary", page_id: slide._page_id, page_index: slide.index, reason });
      }
    }
  }
  return [...new Set(issues)];
}

function normalizeSegment(value) {
  return String(value || "").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function sameSet(left, right) {
  return left.length === right.length && left.every(item => right.includes(item));
}

function evidenceTraceabilityIssues(outline, material, repairTargets = []) {
  if (!material) return [];
  const sourceById = new Map(material.fragments.map(fragment => [fragment.source_id, fragment]));
  const issues = [];
  for (const slide of outline.slides) {
    const sources = slide.evidence_sources || [];
    if (slide.evidence_status === "framework_only" && !sources.length && hasRenderedUserFact(slide, material)) {
      const reason = `第 ${slide.index} 页包含具体用户材料事实但未绑定可靠来源`;
      issues.push(reason);
      repairTargets.push({ issue: "evidence-traceability", page_id: slide._page_id, page_index: slide.index, reason });
    }
    if (["source_supported", "partially_supported"].includes(slide.evidence_status) && !sources.length) {
      issues.push(`第 ${slide.index} 页标记 ${slide.evidence_status} 但没有证据来源`);
      continue;
    }
    let positiveRelevant = 0;
    for (const source of sources) {
      const original = sourceById.get(source.source_id);
      if (!original) {
        issues.push(`第 ${slide.index} 页引用不存在的 source_id ${source.source_id}`);
        continue;
      }
      if (!source.fragment_id || source.fragment_id !== original.fragment_id) issues.push(`第 ${slide.index} 页来源 fragment_id 缺失或与原始材料不一致`);
      if (source.excerpt !== original.excerpt) issues.push(`第 ${slide.index} 页来源摘录与原始材料不一致`);
      if (source.field !== original.field || source.polarity !== original.polarity) issues.push(`第 ${slide.index} 页来源结构化字段或极性被改写`);
      if (source.assertion_type !== original.assertion_type || source.section_type !== original.section_type) issues.push(`第 ${slide.index} 页来源断言类型或区块类型被改写`);
      if (!sourceActuallySupportsSlide(original, slide)) {
        const reason = `第 ${slide.index} 页来源与页面结论不相关：${source.source_id}`;
        issues.push(reason);
        repairTargets.push({ issue: "evidence-traceability", page_id: slide._page_id, page_index: slide.index, source_id: source.source_id, reason });
      }
      if (original.polarity === "positive" && sourceActuallySupportsSlide(original, slide)) positiveRelevant += 1;
      if (original.polarity === "negative" && !/(无|没有|尚未|未确定|缺少|待确认|待补|证据边界)/.test(slide.content)) {
        issues.push(`第 ${slide.index} 页把否定性材料用于正向结论`);
      }
      if (original.evidence_type === "hypothesis" && !/待验证|假设/.test(slide.content)) {
        issues.push(`第 ${slide.index} 页未将假设来源标为待验证`);
      }
    }
    if (["source_supported", "partially_supported"].includes(slide.evidence_status) && positiveRelevant === 0) {
      issues.push(`第 ${slide.index} 页的支持状态没有直接相关的肯定性证据`);
    }
  }
  return [...new Set(issues)];
}

function hasRenderedUserFact(slide, material) {
  return [
    ...(material?.confirmed_facts || []),
    ...(material?.user_material_facts || []),
    ...(material?.material_facts || [])
  ].some(fragment => sourceRenderedInSlide(fragment, slide));
}

function evidenceSourceSafetyIssuesFor(outline, material) {
  if (!material) return [];
  const sourceById = new Map(material.fragments.map(fragment => [fragment.source_id, fragment]));
  const issues = [];
  for (const slide of outline.slides) {
    let positiveRelevant = 0;
    for (const source of slide.evidence_sources || []) {
      const original = sourceById.get(source.source_id);
      if (!original) {
        issues.push(`第 ${slide.index} 页引用不存在或伪造的来源 ${source.source_id}`);
        continue;
      }
      if (source.fragment_id !== original.fragment_id
        || source.excerpt !== original.excerpt
        || source.field !== original.field
        || source.polarity !== original.polarity
        || source.assertion_type !== original.assertion_type
        || source.section_type !== original.section_type) {
        issues.push(`第 ${slide.index} 页来源内容、字段或极性被改写`);
      }
      const relevant = sourceActuallySupportsSlide(original, slide);
      if (original.polarity === "positive" && relevant) positiveRelevant += 1;
      if (original.polarity === "negative" && !/(无|没有|尚未|未确定|缺少|待确认|待补|证据边界)/.test(slide.content)) {
        issues.push(`第 ${slide.index} 页把否定性材料用于肯定结论`);
      }
      if (original.evidence_type === "hypothesis" && !/待验证|假设/.test(slide.content)) {
        issues.push(`第 ${slide.index} 页把待验证假设写成已确认事实`);
      }
    }
    if (["source_supported", "partially_supported"].includes(slide.evidence_status) && positiveRelevant === 0) {
      issues.push(`第 ${slide.index} 页将无直接支持的材料包装成 ${slide.evidence_status}`);
    }
  }
  return [...new Set(issues)];
}

function sourceActuallySupportsSlide(fragment, slide) {
  return sourceRenderedInSlide(fragment, slide) || sourceSupportsSlide(fragment, slide);
}

function materialRelevanceIssues(outline, material) {
  if (!material?.fragments?.length) return [];
  const informative = material.fragments.filter(fragment => !["audience", "unclassified"].includes(fragment.field));
  if (informative.length < 4) return [];
  const text = customerVisibleText(outline);
  const anchors = material.critical_anchors || [];
  const covered = anchors.filter(anchor => anchorCovered(anchor, text, material));
  const sourceCount = new Set(outline.slides.flatMap(slide => (slide.evidence_sources || []).map(source => source.source_id))).size;
  const issues = [];
  if (anchors.length && covered.length / anchors.length < 0.6) issues.push(`高信息量素材仅覆盖 ${covered.length}/${anchors.length} 个关键语义锚点`);
  if (sourceCount < 2) issues.push("高信息量素材未形成至少两处可追溯页面引用，疑似退化为通用模板");
  return issues;
}

function anchorCovered(anchor, text, material) {
  if (anchor.id === "brand") return normalize(text).includes(normalize(anchor.value));
  if ((anchor.semantic_tags || []).some(tag => semanticTagCovered(tag, text))) return true;
  const sourceById = new Map(material.fragments.map(fragment => [fragment.source_id, fragment]));
  return (anchor.source_ids || []).some(id => fragmentCoveredByText(sourceById.get(id), text));
}

function finalOutputIntegrityIssues(outline, context, plan, sourceOutline) {
  const issues = [];
  if (Object.hasOwn(outline, "quality_report")) issues.push("质量报告错误参与递归评分");
  const ids = outline.slides.map(slide => slide._page_id);
  if (ids.some(id => typeof id !== "string" || !id)) issues.push("最终候选页面缺少稳定标识");
  if (new Set(ids).size !== ids.length) issues.push("最终候选页面标识重复");
  const plannedTypes = plan.map(section => section.id);
  const finalTypes = outline.slides.map(slide => slide.slide_type);
  if (!deepEqual(finalTypes, plannedTypes)) issues.push("最终页面顺序与叙事计划不一致");

  if (!sourceOutline) return issues;
  const sourceIds = sourceOutline.slides.map(slide => slide._pageId);
  if (!deepEqual(ids, sourceIds)) issues.push("最终页面标识或顺序与内部页面不一致");
  for (const field of ["title", "subtitle", "executive_summary", "global_visual_style", "missing_materials", "production_strategy"]) {
    if (!deepEqual(outline[field], sourceOutline[field])) issues.push(`最终 ${field} 与内部对象不同步`);
  }
  const sourceById = new Map(sourceOutline.slides.map(slide => [slide._pageId, slide]));
  for (const slide of outline.slides) {
    const source = sourceById.get(slide._page_id);
    if (!source) continue;
    for (const field of [
      "index", "title", "content", "visual_suggestion", "image_prompt", "slide_type", "role",
      "objective", "key_message", "evidence_status", "evidence_sources", "data_requirements", "speaker_notes", "visual_spec"
    ]) {
      if (!deepEqual(slide[field], source[field])) issues.push(`页面 ${slide._page_id} 的 ${field} 在适配后发生变化`);
    }
  }
  if (outline.slides.length !== context.pageCount) issues.push("最终页面数量与请求不一致");
  return issues;
}

function requiredSectionCoverageIssues(outline, context, plan) {
  return requiredSectionCoverageDiagnostics(outline, context, plan)
    .filter(item => !item.covered)
    .map(item => item.required_item)
    .length
    ? [`明确要求内容未覆盖：${requiredSectionCoverageDiagnostics(outline, context, plan).filter(item => !item.covered).map(item => item.required_item).join("、")}`]
    : [];
}

function requiredSectionCoverageDiagnostics(outline, context, plan) {
  if (context.mustIncludeRuleSource === "structured_parse_error") {
    return (context.mustIncludeRuleDiagnostics || []).map((item, index) => ({
      required_item: "must_include_rules",
      original_requirement: item.raw_text || "must_include_rules 结构错误",
      atomic_requirements: [],
      constraints: [],
      expected_page: null,
      actual_page: null,
      covered: false,
      matched_page: null,
      matched_excerpt: "",
      coverage_reason: "structured_parse_error",
      keyword_only_rejected: false,
      missing_terms: ["must_include_rules"],
      constraint_status: "structured_parse_error",
      rule_source: "structured_parse_error",
      parse_error: item.parse_error,
      original_rule_count: item.original_rule_count,
      parsed_rule_count: item.parsed_rule_count,
      failed_rule_index: item.failed_rule_index ?? index,
      client_atomic_count: item.client_atomic_count,
      server_atomic_count: item.server_atomic_count,
      structure_validation_status: item.structure_validation_status || "failed",
      structure_validation_error: item.structure_validation_error || item.parse_error
    }));
  }
  const required = context.requiredSectionPlan || [];
  if (!required.length) return [];
  return required.map(item => requiredItemCoverage(item, outline));
}

function excludeProvenanceInstructionShells(outline, runtime) {
  const shellItems = runtime?.provenanceIndex?.items?.filter(item => item.origin === "system_instruction_shell") || [];
  if (!shellItems.length) return outline;
  const fieldsBySlide = new Map();
  for (const item of shellItems) {
    if (!item.slide_id || !item.field) continue;
    const fields = fieldsBySlide.get(item.slide_id) || new Set();
    fields.add(item.field);
    fieldsBySlide.set(item.slide_id, fields);
  }
  return {
    ...outline,
    slides: (outline.slides || []).map(slide => {
      const fields = fieldsBySlide.get(slideId(slide));
      if (!fields?.size) return slide;
      const copy = { ...slide };
      for (const field of fields) copy[field] = "";
      return copy;
    })
  };
}

function requiredItemSemanticallyCovered(label, text) {
  return requiredItemCoverage(label, { slides: [], title: "", subtitle: "", executive_summary: [text] }).covered;
}

function requiredItemCoverage(item, outline) {
  const label = typeof item === "string" ? item : item?.label;
  const originalRequirement = typeof item === "string" ? item : item?.original_requirement || label;
  const atomicItems = typeof item === "string" || !(item?.atomic_requirements || []).length
    ? [{ label }]
    : item.atomic_requirements;
  const pageConstraint = typeof item === "string" ? parsePageConstraintFromText(label) : item?.page_constraint || parsePageConstraintFromText(label);
  const constraints = typeof item === "string" ? [] : item?.constraints || [];
  const base = {
    required_item: label,
    original_requirement: originalRequirement,
    atomic_requirements: [],
    constraints,
    expected_page: expectedPageLabel(pageConstraint),
    actual_page: null,
    covered: false,
    matched_page: null,
    matched_excerpt: "",
    coverage_reason: "not_found",
    keyword_only_rejected: false,
    missing_terms: [],
    constraint_status: constraints.length ? "constraints_tracked" : "none"
  };
  if (!normalize(label)) return { ...base, covered: true, coverage_reason: "empty_label" };
  const pathSteps = COOPERATION_PATH_STEPS;
  if (pathSteps.every(step => atomicItems.some(atomic => (atomic.label || atomic) === step))) {
    return requiredPathCoverage(base, pathSteps, outline, pageConstraint);
  }
  const atomicResults = atomicItems.map(atomic => requiredAtomicCoverage(atomic.label || atomic, outline, pageConstraint));
  const covered = atomicResults.every(result => result.covered);
  const firstHit = atomicResults.find(result => result.covered);
  return {
    ...base,
    atomic_requirements: atomicResults,
    covered,
    matched_page: covered ? firstHit?.matched_page || null : null,
    actual_page: covered ? firstHit?.actual_page || firstHit?.matched_page || null : null,
    matched_excerpt: covered ? firstHit?.matched_excerpt || "" : "",
    coverage_reason: covered ? "all_atomic_requirements_covered" : "atomic_requirement_missing",
    keyword_only_rejected: atomicResults.some(result => result.keyword_only_rejected),
    missing_terms: atomicResults.filter(result => !result.covered).map(result => result.atomic_requirement)
  };
}

function requiredAtomicCoverage(label, outline, pageConstraint = null) {
  const instructionShellOnly = instructionShellMentions(label, outline);
  const base = {
    atomic_requirement: label,
    covered: false,
    matched_page: null,
    actual_page: null,
    matched_excerpt: "",
    coverage_reason: instructionShellOnly ? "instruction_shell_only" : "not_found",
    keyword_only_rejected: instructionShellOnly,
    missing_terms: [label],
    expected_page: expectedPageLabel(pageConstraint)
  };
  const raw = String(label || "");
  const targets = targetSlidesForConstraint(outline, pageConstraint);
  const targetText = targets.map(coverageSlideText).filter(Boolean).join("\n");
  const allText = pageConstraint ? targetText : businessCoverageText(outline);
  const normalizedText = normalize(allText);
  if (!normalize(raw)) return { ...base, covered: true, coverage_reason: "empty_label", missing_terms: [] };
  if (pageConstraint && !targets.length) return { ...base, coverage_reason: "page_constraint_no_target" };

  if (["明确动作", "责任主体或合作对象", "下一步事项"].includes(raw)) {
    const result = lastPageActionAtomic(raw, targets.at(-1) || targets[0]);
    return result.covered ? atomicHit(base, result.slide, result.reason) : { ...base, keyword_only_rejected: result.keyword_only_rejected, coverage_reason: result.reason };
  }

  if (/专业直驱模拟器/.test(raw) && /沉浸式显示设备/.test(raw)) {
    const objects = ["专业直驱模拟器", "沉浸式显示设备"];
    const missing = objects.filter(term => !normalizedText.includes(normalize(term)));
    const relationPresent = hasControlledEquipmentRelation(allText);
    if (!missing.length && relationPresent) {
      return atomicHit(base, findBusinessMatchingSlide(outline, objects, pageConstraint), "controlled_equipment_relation");
    }
    return {
      ...base,
      missing_terms: [...missing, ...(!relationPresent ? ["计划使用或采用关系"] : [])],
      coverage_reason: "controlled_equipment_relation_missing"
    };
  }

  if (normalizedText.includes(normalize(raw))) return atomicHit(base, findBusinessMatchingSlide(outline, [raw], pageConstraint), "exact_label");

  const matched = requiredCoverageRules().find(([pattern]) => pattern.test(raw));
  if (matched) {
    const [,, matcher, keywordOnly] = matched;
    if (keywordOnly?.test(allText) && !matcher(allText)) {
      return instructionShellOnly ? base : { ...base, keyword_only_rejected: true, coverage_reason: "keyword_only_rejected" };
    }
    return matcher(allText) ? atomicHit(base, findBusinessMatchingSlide(outline, [raw], pageConstraint), "semantic_rule") : base;
  }

  const terms = raw.split(/[、，,和与及\s]+/)
    .map(item => item.trim().replace(/(?:优势|体系|价值|内容|情况|说明|介绍)$/g, ""))
    .filter(item => item.length >= 2);
  if (terms.length >= 2) {
    const missing = terms.filter(term => !normalizedText.includes(normalize(term)));
    return missing.length
      ? { ...base, missing_terms: missing, coverage_reason: "all_terms_missing" }
      : atomicHit(base, findBusinessMatchingSlide(outline, terms, pageConstraint), "all_terms");
  }

  const bigrams = [];
  for (let index = 0; index < raw.length - 1; index += 1) bigrams.push(raw.slice(index, index + 2));
  const pairHits = bigrams.filter(pair => normalizedText.includes(normalize(pair))).length;
  return pairHits >= Math.min(2, bigrams.length)
    ? atomicHit(base, findBusinessMatchingSlide(outline, [raw], pageConstraint), "bigram_fallback")
    : base;
}

function requiredPathCoverage(base, steps, outline, pageConstraint) {
  const targets = targetSlidesForConstraint(outline, pageConstraint).filter(slide => !isInstructionShellSlide(slide));
  let matchedSlide = null;
  let matchedBlock = "";
  for (const slide of targets) {
    const match = findOrderedPathInSingleBlock(coverageBlocks(slide), steps);
    if (match.matched) {
      matchedSlide = slide;
      matchedBlock = match.matched_block;
    }
    if (matchedSlide) break;
  }
  const allBusinessText = businessCoverageText(outline);
  const globallyMatched = steps.filter(step => allBusinessText.includes(step));
  const covered = Boolean(matchedSlide);
  return {
    ...base,
    atomic_requirements: steps.map(step => ({
      atomic_requirement: step,
      covered,
      matched_page: matchedSlide?.index || null,
      actual_page: matchedSlide?.index || null,
      matched_excerpt: covered ? compactExcerpt(matchedBlock) : "",
      coverage_reason: covered ? "ordered_path_same_block" : "path_not_in_single_ordered_block",
      keyword_only_rejected: !covered && globallyMatched.includes(step),
      missing_terms: covered || globallyMatched.includes(step) ? [] : [step],
      expected_page: expectedPageLabel(pageConstraint)
    })),
    covered,
    matched_page: matchedSlide?.index || null,
    actual_page: matchedSlide?.index || null,
    matched_excerpt: covered ? compactExcerpt(matchedBlock) : "",
    coverage_reason: covered ? "ordered_path_same_block" : "path_not_in_single_ordered_block",
    keyword_only_rejected: !covered && globallyMatched.length > 0,
    missing_terms: steps.filter(step => !globallyMatched.includes(step)),
    path_order_valid: covered,
    path_same_block: covered,
    matched_steps: covered ? [...steps] : globallyMatched,
    missing_steps: steps.filter(step => !globallyMatched.includes(step))
  };
}

function lastPageActionAtomic(label, slide) {
  const text = slideText(slide);
  if (!slide) return { covered: false, reason: "page_constraint_no_target" };
  if (label === "明确动作") {
    const covered = hasConcreteNextAction(text);
    return { covered, slide, reason: covered ? "last_slide_specific_action" : "last_slide_action_missing", keyword_only_rejected: /行动建议|下一步|期待合作|谢谢/.test(text) };
  }
  if (label === "责任主体或合作对象") {
    const covered = /商业综合体|运营方|项目团队|合作方|负责人|双方|客户|设计师|品牌方/.test(text);
    return { covered, slide, reason: covered ? "last_slide_actor_present" : "last_slide_actor_missing" };
  }
  const covered = /进一步洽谈|初步洽谈|场地考察|补充项目资料|资料补充|方案评估|合作确认|下一步/.test(text);
  return { covered, slide, reason: covered ? "last_slide_next_step_present" : "last_slide_next_step_missing", keyword_only_rejected: /行动建议|下一步|期待合作|谢谢/.test(text) && !covered };
}

function parsePageConstraintFromText(value = "") {
  const text = String(value || "");
  if (/最后一页/.test(text)) return { type: "last", expected_page: "last" };
  if (/封面/.test(text)) return { type: "cover", expected_page: 1 };
  const match = text.match(/第\s*(\d{1,2})\s*页/);
  return match ? { type: "index", expected_page: Number(match[1]) } : null;
}

function expectedPageLabel(pageConstraint) {
  if (!pageConstraint) return null;
  if (pageConstraint.type === "last") return "last";
  if (pageConstraint.type === "cover") return 1;
  return pageConstraint.expected_page || null;
}

function targetSlidesForConstraint(outline, pageConstraint) {
  const slides = outline.slides || [];
  if (!pageConstraint) return slides.length ? slides : [{ index: null, title: "", key_message: "", content: customerVisibleText(outline), visual_suggestion: "" }];
  if (pageConstraint.type === "last") return slides.length ? [slides.at(-1)] : [];
  if (pageConstraint.type === "cover") return slides.length ? [slides[0]] : [];
  if (pageConstraint.type === "index") return slides.filter(slide => slide.index === pageConstraint.expected_page);
  return slides;
}

function findMatchingSlide(outline, needle, pageConstraint = null) {
  const slides = targetSlidesForConstraint(outline, pageConstraint);
  const normalizedNeedle = normalize(needle);
  return slides.find(item => normalize(slideText(item)).includes(normalizedNeedle)) || slides.find(item => slideText(item)) || null;
}

function findBusinessMatchingSlide(outline, needles, pageConstraint = null) {
  const slides = targetSlidesForConstraint(outline, pageConstraint).filter(slide => !isInstructionShellSlide(slide));
  return slides.find(slide => needles.every(needle => normalize(coverageSlideText(slide)).includes(normalize(needle))))
    || slides.find(slide => coverageSlideText(slide))
    || null;
}

function coverageBlocks(slide) {
  if (!slide || isInstructionShellSlide(slide)) return [];
  return [slide.title, slide.key_message, ...(String(slide.content || "").split(/\n+/)), slide.visual_suggestion]
    .map(value => String(value || "").trim())
    .filter(value => value && !isInstructionShellText(value));
}

function coverageSlideText(slide) {
  return coverageBlocks(slide).join("\n");
}

function businessCoverageText(outline) {
  return (outline.slides || [])
    .filter(slide => slide.role !== "cover" && slide.slide_type !== "cover")
    .map(coverageSlideText)
    .filter(Boolean)
    .join("\n");
}

function isInstructionShellSlide(slide) {
  if (!slide) return false;
  if (slide.role === "cover" || slide.slide_type === "cover") return true;
  const blocks = [slide.key_message, slide.content].filter(Boolean);
  return blocks.length > 0 && blocks.every(isInstructionShellText);
}

function isInstructionShellText(value) {
  const text = String(value || "").trim();
  return /^(?:汇报用途|演示目的|本方案将|本页(?:将|说明|介绍)|需要说明|将围绕|重点呈现|用于向).*(?:介绍|说明|呈现|展开|阅读结构)/.test(text);
}

function instructionShellMentions(label, outline) {
  const needle = normalize(label);
  if (!needle) return false;
  return (outline.slides || []).some(slide => [slide.title, slide.key_message, slide.content]
    .filter(Boolean)
    .some(value => isInstructionShellText(value) && normalize(value).includes(needle)));
}

function atomicHit(base, slide, reason) {
  return {
    ...base,
    covered: true,
    matched_page: slide?.index || null,
    actual_page: slide?.index || null,
    matched_excerpt: compactExcerpt(slide ? slideText(slide) : ""),
    coverage_reason: reason,
    missing_terms: []
  };
}

function genericTemplatePollutionIssues(outline, context) {
  const hasModelContent = (context.planningAnalysis?.sections || []).some(section => section.key_message || (section.bullets || []).length);
  if (!(context.requiredSections || []).length && !hasModelContent) return [];
  const pollutionPatterns = [
    /需要围绕明确对象、判断维度和验证资料形成可执行结论/,
    /说明主题涉及的对象、范围和使用场景/,
    /区分已知信息、分析假设和待确认事项/,
    /建立后续内容的统一概念与边界/
  ];
  const hits = outline.slides.flatMap(slide => [slide.key_message, slide.content].filter(Boolean))
    .filter(text => pollutionPatterns.some(pattern => pattern.test(text)));
  return hits.length >= 2 ? [`${hits.length} 处正文仍为通用模板句，疑似未使用具体业务内容`] : [];
}

function instructionShellTitleIssues(outline) {
  const titles = [outline.title, outline.subtitle, ...outline.slides.map(slide => slide.title)];
  return titles.some(isInstructionShellTitle) ? ["标题或副标题含任务指令外壳、页数或 PPT 执行参数"] : [];
}

function explicitPurposeAuthorityIssues(outline, context) {
  const explicitPurpose = context.structuredRequirement?.explicitPurpose;
  if (!explicitPurpose) return [];
  const text = customerVisibleText(outline);
  const parts = explicitPurpose.split(/[，,、；;和及与]+/).map(normalize).filter(item => item.length >= 3);
  const hits = parts.filter(part => normalize(text).includes(part));
  return hits.length >= Math.min(2, parts.length) ? [] : [`显式汇报目的未充分进入最终输出：${explicitPurpose}`];
}

function semanticPageCountIssues(outline, context) {
  const issues = [];
  if (context.manualPageCount && outline.slides.length !== context.requestedPageCount) {
    issues.push(`输出 ${outline.slides.length} 页，要求 ${context.requestedPageCount} 页`);
  }
  if ((context.requiredSections || []).length && outline.slides.some(slide => /^verificationAppendix/.test(slide.slide_type) || /资料验证附录/.test(slide.title))) {
    issues.push("使用通用资料验证附录补齐明确业务页");
  }
  return issues;
}

function modelContentRetentionIssues(outline, context, runtime = null) {
  if (!context.planningAnalysis?.sections?.length) return [];
  if (runtime) {
    const retention = evaluatePlannerRetention(context, outline, runtime);
    const required = Math.max(1, Math.ceil(retention.evaluated_count * 0.3));
    return retention.retained_count >= required
      ? []
      : [`planning_model.used=true 但模型 key_message/bullets 保留不足：${retention.retained_count}/${retention.evaluated_count}`];
  }
  const modelItems = context.planningAnalysis.sections
    .filter(section => section.content_complete || section.key_message || (section.bullets || []).length)
    .flatMap(section => [section.key_message, ...(section.bullets || [])])
    .map(normalize)
    .filter(item => item.length >= 6);
  if (!modelItems.length) return [];
  const text = normalize(customerVisibleText(outline));
  const retained = modelItems.filter(item => modelItemRetainedOrSafelyPending(item, text)).length;
  const required = Math.max(2, Math.ceil(modelItems.length * 0.3));
  return retained >= required ? [] : [`planning_model.used=true 但模型 key_message/bullets 保留不足：${retained}/${modelItems.length}`];
}

function modelItemRetainedOrSafelyPending(item, normalizedText) {
  if (normalizedText.includes(item)) return true;
  if (!normalizedText.includes(normalize("待品牌方确认"))) return false;
  return /(?:销量|市场份额|续航|门店数量|网点数量|L\d|高压快充|质保|保修|道路救援|独家代理|区域保护|返利|开业营销|建店|海外布局|智能驾驶系统|\d{4}年|\d+(?:\.\d+)?(?:V|公里|年|小时|级|万公里)|[一二三四五六七八九十两]+(?:年|步|阶段))/.test(item);
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function titleMatchesSlide(slide) {
  const compactTitle = String(slide.title).replace(/分析|框架|概览|核心|关键|与|及|的|页/g, "");
  const compactBody = normalize(`${slide.key_message} ${slide.content}`);
  if (roadmapTitleMatchesBody(compactTitle, compactBody)) return true;
  if (processTitleMatchesBody(compactTitle, compactBody)) return true;
  const terms = compactTitle.split(/[：:、｜|\s]/).filter(term => term.length >= 2);
  if (terms.some(term => compactBody.includes(normalize(term)))) return true;
  for (let index = 0; index < compactTitle.length - 1; index += 1) {
    if (compactBody.includes(normalize(compactTitle.slice(index, index + 2)))) return true;
  }
  return false;
}

function roadmapTitleMatchesBody(title, body) {
  const hasRoadmapTitle = /实施路线图|路线图|推进计划|落地路径|阶段规划|阶段计划|排期|行动计划/.test(title);
  if (!hasRoadmapTitle) return false;
  const roadmapSignals = ["第一阶段", "第二阶段", "第三阶段", "阶段", "步骤", "节点", "责任", "交付物", "复盘", "推进", "排期", "里程碑"];
  return roadmapSignals.filter(signal => body.includes(normalize(signal))).length >= 2;
}

function processTitleMatchesBody(title, body) {
  const hasProcessTitle = /流程|路径|步骤|机制/.test(title);
  if (!hasProcessTitle) return false;
  const processSignals = ["接洽", "资料交换", "到访", "沟通", "确认", "签约", "入驻", "节点", "步骤", "入口"];
  return processSignals.filter(signal => body.includes(normalize(signal))).length >= 2;
}

function duplicatedBrandTitleIssues(outline, context) {
  const brand = context.materialContext?.brand?.value || "";
  if (!brand) return [];
  const normalizedBrand = normalizeBrand(brand);
  return [outline.title, ...outline.slides.map(slide => slide.title)].flatMap((title, index) => {
    const parts = String(title || "").split(/[｜|]/).map(part => normalizeBrand(part)).filter(Boolean);
    const hasFull = parts.includes(normalizedBrand);
    const hasAlias = parts.some(part => part !== normalizedBrand && normalizedBrand.includes(part));
    return hasFull && hasAlias ? [`第 ${index || "总"} 标题重复拼接企业全称与简称`] : [];
  });
}

function unsupportedEvidenceTitleIssues(outline, context) {
  const titles = [outline.title, ...outline.slides.map(slide => slide.title)].join("\n");
  const issues = [];
  if (/ROI|投资回报/.test(titles) && !hasTraceableRoiEvidence(context)) {
    issues.push("无结构化 ROI、收益、成本、回收周期或量化价值资料时出现 ROI 类标题");
  }
  if (/质量验证体系/.test(titles) && !hasTraceableQualitySystemEvidence(context)) {
    issues.push("无质量体系、认证、制度、标准或完整验证流程资料时出现“质量验证体系”标题");
  }
  return issues;
}

function industrialEquipmentDeliveryIssues(text, context) {
  const sourceText = `${context.requirement || ""} ${context.topic || ""} ${context.clientMaterials || ""} ${context.industry?.label || ""}`;
  if (!hasIndustrialEquipmentSignal(sourceText)) return [];
  const hits = [...new Set((String(text || "").match(/批量生产|物流交付|服务启用|版本确认/g) || []))];
  return hits.length ? [`工业设备交付页混入不适用措辞：${hits.join("、")}`] : [];
}

function normalizeBrand(value) {
  return String(value || "").replace(/[\s\p{P}\p{S}]+/gu, "");
}

function dimension(max, issues, successReason, penalty) {
  return result(Math.max(0, max - issues.length * penalty), max, issues.length ? issues : [successReason]);
}

function result(score, max, reasons) {
  return { score: Math.max(0, Math.min(max, score)), max, reasons };
}

function collectWarnings(dimensions, gates) {
  const warnings = [];
  for (const [name, value] of Object.entries(dimensions)) {
    if (value.score < value.max) warnings.push(`${name}: ${value.reasons.join("；")}`);
  }
  for (const [name, gate] of Object.entries(gates)) {
    if (!gate.passed) warnings.push(`${name}: ${gate.reason}`);
  }
  return warnings;
}

function customerVisibleText(outline) {
  return [
    ...CUSTOMER_FIELDS.map(field => outline[field] || ""),
    ...(outline.executive_summary || []),
    ...outline.slides.flatMap(slide => [slide.title, slide.key_message, slide.content, slide.visual_suggestion])
  ].join("\n");
}

function collectInspectableRegions(outline) {
  const regions = [
    { kind: "页面标题", text: outline.title || "" },
    { kind: "副标题", text: outline.subtitle || "" },
    { kind: "正文", text: (outline.executive_summary || []).join("\n") }
  ];
  for (const slide of outline.slides || []) {
    regions.push(
      { kind: "页面标题", slide_index: slide.index, text: slide.title || "" },
      { kind: "页面结论", slide_index: slide.index, text: slide.key_message || "" },
      { kind: "正文", slide_index: slide.index, text: slide.content || "" },
      { kind: "图示文字", slide_index: slide.index, text: [slide.visual_suggestion, slide.image_prompt, slide.visual_spec?.description].filter(Boolean).join("\n") },
      { kind: "演讲备注", slide_index: slide.index, text: slide.speaker_notes || "" }
    );
  }
  return regions.filter(region => region.text);
}

function riskRuleDiagnostics(context, hits = []) {
  const rules = context.excludedContentRules || [];
  if (context.excludedContentRuleSource === "structured_parse_error") {
    return (context.excludedContentParseErrors || []).map(error => ({
      rule_source: "structured_parse_error",
      parse_error: error.parse_error,
      source_field: error.source_field,
      raw_text: error.raw_text
    }));
  }
  return rules.map(rule => {
    const ruleHits = hits.filter(hit => hit.raw_text === rule.raw_text);
    return {
      rule_source: context.excludedContentRuleSource || (rules.length ? "structured" : "legacy_fallback"),
      raw_text: rule.raw_text,
      subject_terms: rule.subject_terms || [],
      claim_terms: rule.claim_terms || [],
      entities: rule.entities || [],
      prohibited_relations: rule.prohibited_relations || [],
      forbidden_claim_roles: rule.forbidden_claim_roles || [],
      forbidden_zones: rule.forbidden_zones || [],
      rule_type: rule.rule_type,
      source_field: rule.source_field,
      matches: ruleHits.map(hit => ({
        violation: hit.violation,
        matched_region: hit.matched_region || hit.region,
        matched_clause: hit.matched_clause || hit.segment,
        violation_reason: hit.violation_reason
      }))
    };
  });
}

function zoneAppliesToRegion(zones, region) {
  if (!zones?.length) return true;
  if (zones.includes(region)) return true;
  if (region === "正文" && zones.some(zone => /^正文$/.test(zone))) return true;
  if (region === "页面结论" && zones.some(zone => /正文结论/.test(zone))) return true;
  if (region === "图示文字" && zones.some(zone => /图示/.test(zone))) return true;
  if (region === "页面标题" && zones.some(zone => /标题/.test(zone))) return true;
  if (region === "演讲备注") return true;
  return false;
}

function subjectAliases(subject) {
  const normalized = String(subject || "").trim();
  const aliases = [normalized];
  if (/政策补贴/.test(normalized)) aliases.push("补贴");
  return [...new Set(aliases.filter(Boolean))];
}

function splitSemanticSegments(text) {
  return String(text || "")
    .split(/(?<=[。！？；;])|\n+|[；;]/)
    .flatMap(item => item.split(/(?=但|但是|然而|不过)/))
    .map(item => item.trim())
    .filter(Boolean);
}

function isPositiveForbiddenSegment(segment, aliases) {
  const containsSubject = aliases.some(alias => segment.includes(alias));
  if (!containsSubject) return false;
  if (/不是没有|并非没有|不能说没有|不代表没有/.test(segment)) return true;
  const boundaryOnly = /不得|不能|禁止|避免|不要|不应|不可|未确认|尚未确认|待确认|待核实|不得虚构|不能虚构|不作为|不写入|不涉及|不将/.test(segment)
    && !/(?:但|但是|然而|不过).*(?:可|可以|提供|支持|具备|有|拥有|作为|形成)/.test(segment);
  if (boundaryOnly) return false;
  return true;
}

function claimRoleViolationForSegment(segment, aliases, roles = []) {
  if (!roles.length) return false;
  if (!aliases.some(alias => segment.includes(alias))) return false;
  if (!isPositiveForbiddenSegment(segment, aliases)) return false;
  return roles.some(role => {
    if (role === "优势") return /优势|价值|卖点|亮点|支撑|加分项/.test(segment);
    if (role === "服务") return /服务|办理|申报|协助|支持/.test(segment);
    if (role === "支持内容") return /支持|支撑|扶持|资源/.test(segment);
    return segment.includes(role);
  });
}

function claimTermViolationForSegment(segment, aliases, rule = {}) {
  if (!aliases.some(alias => segment.includes(alias))) return false;
  if (!isPositiveForbiddenSegment(segment, aliases)) return false;
  if (rule.rule_type === "unverified_promotion_phrase") return true;
  if (rule.rule_type === "prohibited_metric_claim") return true;
  if (rule.rule_type === "pending_fact_must_not_be_asserted") return true;
  if (rule.rule_type === "prohibited_derived_claim") return true;
  return false;
}

function violationReasonFor({ zoneViolation, roleViolation, claimViolation, rule }) {
  if (roleViolation) return "subject_used_as_forbidden_claim_role";
  if (zoneViolation) return "subject_used_in_forbidden_zone";
  if (claimViolation) return `${rule.rule_type || "claim"}_positive_claim`;
  return "positive_forbidden_subject_claim";
}

function relationshipViolationForSegment(segment, rule) {
  const scopedSegment = String(segment || "").replace(/^(?:已确认事实|明确事实|确认事实|已知事实)\s*[：:]\s*/, "");
  const entities = [...new Set([...(rule.entities || []), ...(rule.subject_terms || []).filter(term => !/客户案例|经营成果/.test(term))])];
  const claimTerms = [...new Set([...(rule.claim_terms || []), ...(rule.subject_terms || []).filter(term => /客户案例|经营成果/.test(term))])];
  const matchedEntity = entities.find(entity => scopedSegment.includes(entity));
  const matchedClaim = claimTerms.find(term => scopedSegment.includes(term));
  if (!matchedEntity && !matchedClaim) return { matched: false, violation: false, subject: "", reason: "no_entity" };
  if (/尚待确认|待确认|未确认|讨论|寻找|目标观众|目标合作对象|潜在合作对象|合作负责人|合作方/.test(scopedSegment) && !/已(?:经)?(?:与|和)?[^。！？；;，,]{0,18}(?:合作|支持)|已有|已获得|已取得/.test(scopedSegment)) {
    return { matched: true, violation: false, subject: matchedEntity || matchedClaim, reason: "allowed_context_or_pending" };
  }
  const relationPattern = /已(?:经)?(?:与|和)?[^。！？；;，,]{0,18}(合作|支持)|已获得[^。！？；;，,]{0,18}支持|已有[^。！？；;，,]{0,18}(合作案例|客户案例)|已取得[^。！？；;，,]{0,18}经营成果|成熟经营成果/;
  const violation = relationPattern.test(scopedSegment);
  return {
    matched: true,
    violation,
    subject: matchedEntity || matchedClaim,
    reason: violation ? "prohibited_relationship_positive_claim" : "relationship_not_asserted"
  };
}

function confirmedIdentityValue(fragment) {
  if (!fragment || fragment.assertion_type !== "explicit_confirmed_fact") return "";
  const match = String(fragment.excerpt || "").match(/^(?:项目名称|品牌名称|企业名称|主题名称|项目名|品牌名)(?:为|是|[：:])\s*[“\"']?(.+?)[”\"']?[。；;]?$/);
  return match?.[1]?.trim() || "";
}

function exactIdentityTitleMatch(identityValue, title) {
  const identity = normalize(identityValue);
  const candidate = normalize(title);
  return identity.length >= 3 && candidate.includes(identity);
}

function slideId(slide) {
  return slide?._page_id || slide?._pageId || "";
}

function suggestFactRepairSlide(fragment, outline) {
  const slides = outline?.slides || [];
  if (confirmedIdentityValue(fragment)) return slides.find(slide => slide.role === "cover" || slide.slide_type === "cover") || slides[0] || null;
  const terms = extractSegmentSemanticTerms(fragment?.excerpt || "").filter(term => term.length >= 2);
  const ranked = slides
    .filter(slide => slide.role !== "cover" && slide.slide_type !== "cover")
    .map(slide => ({ slide, score: terms.filter(term => slideText(slide).includes(term)).length }))
    .sort((a, b) => b.score - a.score || (a.slide.index || 0) - (b.slide.index || 0));
  return ranked[0]?.slide || slides[0] || null;
}

function requiredCoverageRules() {
  return [
    [/园区定位|项目定位/, "positioning", text => /园区|项目/.test(text) && /定位|面向|角色|方向|载体|适合/.test(text), /园区|项目|定位/],
    [/目标用户|目标企业/, "target", text => /目标|面向|适合/.test(text) && /用户|企业|客户|受众|人群/.test(text), /目标|用户|企业/],
    [/单人驾驶体验/, "solo_drive", text => /单人|个人|单车|独立/.test(text) && /驾驶|赛车|体验/.test(text), /单人|驾驶|体验/],
    [/多人竞速活动/, "race_group", text => /多人|组队|团队|竞速|比赛/.test(text) && /活动|体验|赛事|竞赛/.test(text), /多人|竞速|活动/],
    [/企业团建/, "team_building", text => /企业|团队|公司/.test(text) && /团建|团队活动|团队建设/.test(text), /企业|团建/],
    [/青少年赛车启蒙/, "youth", text => /青少年|少年|亲子|学生/.test(text) && /赛车|驾驶|启蒙|体验/.test(text), /青少年|赛车|启蒙/],
    [/空间功能/, "space", text => /空间|场地|区域/.test(text) && /功能|分区|体验|接待|展示|运营/.test(text), /空间|功能/],
    [/运营内容/, "operations", text => /运营/.test(text) && /预约|接待|排班|安全|教练|车辆|设备|活动|日常|会员|维护/.test(text), /运营|内容/],
    [/合作价值/, "value", text => /合作/.test(text) && /价值|收益|转化|客流提升|体验提升|品牌曝光|招商效率|商业回报/.test(text), /合作|价值/],
    [/场地合作/, "venue", text => /场地|空间/.test(text) && /合作|共建|租赁|使用|联合/.test(text), /场地|合作/],
    [/活动合作/, "event", text => /活动|赛事|体验日|主题活动/.test(text) && /合作|联合|共创|共办/.test(text), /活动|合作/],
    [/联合运营/, "joint_ops", text => /联合/.test(text) && /运营|经营|管理|活动/.test(text), /联合|运营/],
    [/方案评估到合作确认|合作确认路径|下一步路径/, "path", text => /方案评估|评估/.test(text) && /合作确认|确认合作|合作意向/.test(text) && /下一步|路径|流程|推进/.test(text), /方案评估|合作确认|下一步/],
    [/合作方式/, "cooperation", text => /合作/.test(text) && /方式|模式|机制|路径|方案/.test(text), /合作|方式/],
    [/入驻流程/, "entry_process", text => /入驻/.test(text) && /流程|步骤|路径|办理|推进/.test(text), /入驻|流程/],
    [/合作下一步/, "next", text => /合作/.test(text) && /下一步|后续|推进|行动|确认/.test(text), /合作|下一步/]
  ];
}

function coverageHit(base, outline, needle, reason, forcedPage = null) {
  if (forcedPage) {
    const slide = (outline.slides || []).find(item => item.index === forcedPage);
    return { ...base, covered: true, matched_page: forcedPage, matched_excerpt: compactExcerpt(slideText(slide)), coverage_reason: reason };
  }
  const slides = outline.slides || [];
  const normalizedNeedle = normalize(needle);
  const slide = slides.find(item => normalize(slideText(item)).includes(normalizedNeedle)) || slides.find(item => slideText(item));
  return {
    ...base,
    covered: true,
    matched_page: slide?.index || null,
    matched_excerpt: compactExcerpt(slide ? slideText(slide) : customerVisibleText(outline)),
    coverage_reason: reason
  };
}

function slideText(slide) {
  if (!slide) return "";
  return [slide.title, slide.key_message, slide.content, slide.visual_suggestion].filter(Boolean).join("\n");
}

function compactExcerpt(value) {
  return String(value || "").replace(/\s+/g, " ").slice(0, 120);
}

function evidenceSafetyIssueCodes(reasons = []) {
  const text = reasons.join("；");
  const codes = [];
  if (/客户排除内容/.test(text)) codes.push("excluded_content");
  if (/证据|来源|追溯/.test(text)) codes.push("evidence_traceability");
  if (/虚构|数值|绝对化|待验证假设/.test(text)) codes.push("confirmed_fact_coverage");
  return codes.length ? [...new Set(codes)] : ["evidence_safety"];
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}
