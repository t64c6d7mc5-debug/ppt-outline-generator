import { toEvidenceSource } from "./evidence-state.js";
import {
  extractNamedSegmentLines,
  hasPositiveGeographicEvidence,
  sourceRenderedInSlide,
  sourceSupportsSlide
} from "./material-context.js";
import { buildSubtitle } from "./slide-generator.js";
import { repairSlideVisual } from "./visual-planner.js";
import { reconcileProvenanceAfterRepair } from "./content-provenance.js";

const INTERNAL_PATTERNS = [
  /交付形式：?结构化 PPT 策划提纲[。；;]?/g,
  /内容边界：?[^\n。]*不补造数据[^\n。]*[。；;]?/g,
  /当前资料为空[。；;]?/g,
  /制作策略：?[^\n。]*[。；;]?/g,
  /快速交付[^\n。]*[。；;]?/g
];

export function repairOutline(outline, context, scoreReport, runtime = null) {
  const repaired = structuredClone(outline);
  const actions = [];
  const issueCodes = new Set(scoreReport.issue_codes || []);

  for (const slide of repaired.slides) {
    for (const field of ["title", "key_message", "content", "visual_suggestion"]) {
      const before = slide[field];
      let after = before;
      INTERNAL_PATTERNS.forEach(pattern => { after = after.replace(pattern, ""); });
      after = after.replace(/\n{2,}/g, "\n").trim();
      if (after !== before) {
        slide[field] = after;
        actions.push({ issue: "content-layering", page: slide.index, before, after });
      }
    }
    if (slide.evidence_status === "hypothesis_pending" && !/待验证/.test(`${slide.title} ${slide.content}`)) {
      const before = slide.content;
      slide.content = `• 待验证假设，不代表真实客户结论。\n${before}`;
      actions.push({ issue: "unsafe-hypothesis", page: slide.index, before, after: slide.content });
    }
    if (/深灰底|电光蓝|宣纸白|奶油白底|统一配色/.test(slide.visual_suggestion)) {
      const before = slide.visual_suggestion;
      slide.visual_suggestion = slide.visual_suggestion.replace(/；?整体保持[^。]+。?/g, "").trim();
      actions.push({ issue: "repeated-global-style", page: slide.index, before, after: slide.visual_suggestion });
    }
  }

  if (issueCodes.has("duplicate-title")) {
    const seen = new Set();
    for (const slide of repaired.slides) {
      if (seen.has(slide.title)) {
        const before = slide.title;
        slide.title = `${slide.title}：专项拆解`;
        actions.push({ issue: "duplicate-title", page: slide.index, before, after: slide.title });
      }
      seen.add(slide.title);
    }
  }

  if (issueCodes.has("vague-content")) {
    for (const slide of repaired.slides) {
      const before = slide.content;
      slide.content = slide.content
        .replace(/深入分析/g, "按对象、场景与证据逐项分析")
        .replace(/综合考虑/g, "比较关键维度并记录验证结果")
        .replace(/持续优化/g, "按复盘结果调整具体动作")
        .replace(/形成闭环/g, "明确输入、责任人与复盘节点");
      if (slide.content !== before) actions.push({ issue: "vague-content", page: slide.index, before, after: slide.content });
    }
  }

  if (issueCodes.has("audience-mismatch")) {
    const before = repaired.subtitle;
    repaired.subtitle = buildSubtitle(context);
    if (before !== repaired.subtitle) actions.push({ issue: "audience-mismatch", page: null, before, after: repaired.subtitle });
    const cover = repaired.slides.find(slide => slide.slide_type === "cover");
    if (cover) {
      const coverBefore = cover.content;
      cover.content = cover.content.replace(/^• 汇报对象：.*$/m, `• 汇报对象：${context.audience}`);
      if (coverBefore !== cover.content) {
        actions.push({ issue: "audience-mismatch", page_id: cover._pageId, before: coverBefore, after: cover.content });
      }
    }
  }

  if (issueCodes.has("material-context-missing") || issueCodes.has("material-relevance")) {
    const brand = context.materialContext.brand;
    const cover = repaired.slides.find(slide => slide.slide_type === "cover");
    if (brand && cover) {
      const source = context.materialContext.fragments.find(fragment => fragment.source_id === brand.source_id);
      repairSlideContent(cover, `品牌 / 项目：${brand.value}`, source, context, actions, "material-context-missing");
    }
    const background = repaired.slides.find(slide => ["dataBasis", "background", "objective"].includes(slide.slide_type));
    const source = context.materialContext.project_background[0];
    if (background && source) repairSlideContent(background, `项目背景：${source.excerpt}`, source, context, actions, "material-context-missing");
  }

  const confirmedFactTargets = (scoreReport.repair_targets || []).filter(target => target.issue?.startsWith("confirmed-fact-"));
  if (issueCodes.has("confirmed-fact-coverage") && !confirmedFactTargets.length) {
    const background = repaired.slides.find(slide => ["dataBasis", "background", "objective"].includes(slide.slide_type));
    if (background) {
      for (const source of context.materialContext.confirmed_facts || []) {
        if (!background.content.includes(source.excerpt)) {
          repairSlideContent(background, `已确认事实：${source.excerpt}`, source, context, actions, "confirmed-fact-coverage");
        }
      }
    }
  }

  if (issueCodes.has("required-decisions")) {
    const action = [...repaired.slides].reverse().find(slide => ["action", "recommendation"].includes(slide.role));
    const source = context.materialContext.required_decisions[0];
    if (action && source) {
      repairSlideContent(action, `${decisionActorFor(context)}决策事项：依据验证结果选择继续投入、调整方案或停止推进。`, source, context, actions, "required-decisions");
    }
  }

  const slidesById = new Map(repaired.slides.flatMap(slide => [slide._pageId, slide._page_id]
    .filter(Boolean)
    .map(id => [id, slide])));
  for (const target of scoreReport.repair_targets || []) {
    const slide = slidesById.get(target.page_id);
    if (!slide) continue;
    if (target.issue === "confirmed-fact-evidence-binding") {
      const fragment = context.materialContext.confirmed_facts.find(item => item.source_id === target.source_id && item.fragment_id === target.fragment_id);
      if (fragment) {
        const before = structuredClone(slide.evidence_sources || []);
        slide.evidence_sources = dedupeEvidenceSources([...(slide.evidence_sources || []), toEvidenceSource(fragment)]);
        actions.push({ issue: target.issue, page_id: target.page_id, before, after: structuredClone(slide.evidence_sources) });
      }
    }
    if (target.issue === "confirmed-fact-expression-missing") {
      const fragment = context.materialContext.confirmed_facts.find(item => item.source_id === target.source_id && item.fragment_id === target.fragment_id);
      if (fragment) repairSlideContent(slide, `已确认事实：${fragment.excerpt}`, fragment, context, actions, target.issue);
    }
    if (target.issue === "segment-provenance") {
      const before = slide.content;
      slide.content = slide.content.split("\n").filter(line => {
        const entity = extractNamedSegmentLines({ content: line })[0];
        return !entity || entity.label !== target.entity_label;
      }).join("\n");
      if (slide.content !== before) actions.push({ issue: target.issue, page_id: target.page_id, before, after: slide.content });
    }
    if (target.issue === "segment-semantic-drift") {
      const fragment = context.materialContext.fragments.find(item => item.source_id === target.source_id);
      if (fragment) {
        const before = slide.content;
        slide.content = slide.content.split("\n").map(line => {
          const entity = extractNamedSegmentLines({ content: line })[0];
          if (!entity || entity.label !== target.entity_label) return line;
          const excerpt = fragment.excerpt.replace(/^待验证假设\s*[：:]?/, "");
          return `• 待验证方向：${excerpt}（不代表真实客户结论）`;
        }).join("\n");
        if (slide.content !== before) actions.push({ issue: target.issue, page_id: target.page_id, before, after: slide.content });
      }
    }
    if (target.issue === "channel-certainty") {
      const before = slide.content;
      slide.content = neutralizeChannelTerms(slide.content);
      slide.visual_suggestion = neutralizeChannelTerms(slide.visual_suggestion);
      if (slide.content !== before) actions.push({ issue: target.issue, page_id: target.page_id, before, after: slide.content });
    }
    if (target.issue === "unsupported-customer-claim") {
      const before = { content: slide.content, evidence_status: slide.evidence_status };
      slide.content = markClaimsPending(slide.content);
      slide.evidence_status = "hypothesis_pending";
      if (!/不代表真实.*结论/.test(slide.content)) slide.content = `• 待验证方向，不代表真实客户结论。\n${slide.content}`;
      actions.push({ issue: target.issue, page_id: target.page_id, before, after: { content: slide.content, evidence_status: slide.evidence_status } });
    }
    if (target.issue === "recommendation-evidence-boundary") {
      const before = slide.content;
      slide.content = slide.content.split("\n").map(conditionalizeRecommendationLine).join("\n");
      if (slide.content !== before) actions.push({ issue: target.issue, page_id: target.page_id, before, after: slide.content });
    }
    if (target.issue === "decision-actor-drift") {
      const before = { content: slide.content, speaker_notes: slide.speaker_notes, evidence_sources: structuredClone(slide.evidence_sources || []) };
      const actor = decisionActorFor(context);
      slide.content = slide.content.replace(/(?:董事会|投资委员会)(?=决策事项|决策|批准|确认)/g, actor);
      slide.speaker_notes = slide.speaker_notes.replace(/(?:董事会|投资委员会)(?=决策事项|决策|批准|确认)/g, actor);
      slide.evidence_sources = (slide.evidence_sources || []).filter(source => !actorConflicts(source.excerpt, actor));
      actions.push({ issue: target.issue, page_id: target.page_id, before, after: { content: slide.content, speaker_notes: slide.speaker_notes, evidence_sources: structuredClone(slide.evidence_sources) } });
    }
  }

  if (issueCodes.has("evidence-traceability")) {
    const sourceById = new Map(context.materialContext.fragments.map(fragment => [fragment.source_id, fragment]));
    const targetPageIds = new Set((scoreReport.repair_targets || [])
      .filter(target => target.issue === "evidence-traceability" && target.page_id)
      .map(target => target.page_id));
    for (const slide of repaired.slides) {
      if (targetPageIds.size && !targetPageIds.has(slide._pageId)) continue;
      const beforeSources = structuredClone(slide.evidence_sources || []);
      let nextSources = (slide.evidence_sources || []).filter(source => {
        const original = sourceById.get(source.source_id);
        return original && source.excerpt === original.excerpt && sourceActuallySupportsSlide(original, slide);
      });
      if (slide.evidence_status === "hypothesis_pending") {
        const relatedHypotheses = [
          ...(context.materialContext.hypotheses || []),
          ...(context.materialContext.pending_items || [])
        ]
          .filter(fragment => sourceRenderedInSlide(fragment, slide) && sourceSupportsSlide(fragment, slide))
          .map(toEvidenceSource);
        nextSources = dedupeEvidenceSources([...nextSources, ...relatedHypotheses]);
      }
      slide.evidence_sources = nextSources;
      const beforeStatus = slide.evidence_status;
      if (["source_supported", "partially_supported"].includes(slide.evidence_status)) {
        const positive = slide.evidence_sources.some(source => source.polarity === "positive");
        if (!positive && !hasRenderedUserFact(slide, context)) slide.evidence_status = "framework_only";
      }
      if (slide.evidence_status === "hypothesis_pending" && !slide.evidence_sources.some(source => source.evidence_type === "hypothesis")) {
        slide.evidence_status = "framework_only";
      }
      if (JSON.stringify(beforeSources) !== JSON.stringify(slide.evidence_sources) || beforeStatus !== slide.evidence_status) {
        actions.push({
          issue: "evidence-traceability",
          page_id: slide._pageId,
          before: { evidence_status: beforeStatus, evidence_sources: beforeSources },
          after: { evidence_status: slide.evidence_status, evidence_sources: structuredClone(slide.evidence_sources) }
        });
      }
    }
  }

  const visualTargets = (scoreReport.repair_targets || []).filter(target => target.issue === "visual-semantic-mismatch" && target.page_id);
  for (const target of visualTargets) {
    const slide = slidesById.get(target.page_id);
    if (!slide) continue;
    const before = {
      visual_suggestion: slide.visual_suggestion,
      image_prompt: slide.image_prompt,
      visual_spec: structuredClone(slide.visual_spec)
    };
    const after = repairSlideVisual(slide, context);
    if (slide.slide_type === "geography" && !hasPositiveGeographicEvidence(context) && /分布|热力|格局|覆盖现状/.test(slide.title)) {
      const beforeTitle = slide.title;
      slide.title = "地域与城市验证框架";
      actions.push({ issue: "visual-semantic-mismatch", page_id: target.page_id, before: beforeTitle, after: slide.title });
    }
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      Object.assign(slide, after);
      actions.push({ issue: "visual-semantic-mismatch", page_id: target.page_id, before, after });
    }
  }

  repaired.missing_materials = dedupeMaterials(repaired.missing_materials, context);
  reconcileProvenanceAfterRepair(runtime, outline, repaired);
  return { outline: repaired, actions };
}

function neutralizeChannelTerms(value) {
  return String(value || "")
    .replace(/门店来源/g, "渠道触点来源")
    .replace(/门店咨询记录/g, "咨询触点记录")
    .replace(/门店咨询/g, "咨询触点")
    .replace(/门店转化/g, "渠道转化记录")
    .replace(/门店布局/g, "渠道布局假设");
}

function markClaimsPending(value) {
  return String(value || "")
    .replace(/典型痛点/g, "待验证痛点方向")
    .replace(/核心偏好/g, "待验证偏好方向")
    .replace(/真实障碍/g, "潜在影响项")
    .replace(/(^|\n)(\s*•?\s*)([^\n：:]{0,12})(痛点|偏好|障碍)\s*[：:]/g, "$1$2$3待验证$4方向：");
}

function decisionActorFor(context) {
  return context.requestAuthority?.audience?.value || context.audience || "权威决策主体";
}

function actorConflicts(excerpt, actor) {
  return (/董事会/.test(excerpt) && !/董事会/.test(actor))
    || (/投资委员会/.test(excerpt) && !/投资委员会/.test(actor));
}

function conditionalizeRecommendationLine(line) {
  if (/(?:待验证|验证[^。；;]*后|确认后|若|前提|视验证结果)/.test(line)) return line;
  const mapped = line.match(/^(\s*•?\s*)([^：:]{1,12}(?:建议|启示))\s*[：:]\s*把(.+?)映射到(.+)$/);
  if (mapped) {
    const subject = /关注点$/.test(mapped[3]) ? mapped[3] : `${mapped[3]}相关关注点`;
    return `${mapped[1]}${mapped[2]}（待验证）：验证${subject}后，再映射到${mapped[4]}`;
  }
  return line.replace(/^(\s*•?\s*)([^：:]{1,12}(?:建议|启示))\s*[：:]\s*/, "$1$2（待验证）：验证相关事实与假设后，再决定是否");
}

function dedupeEvidenceSources(items) {
  return [...new Map(items.filter(Boolean).map(item => [item.source_id, item])).values()];
}

function dedupeMaterials(items, context) {
  const provided = new Set([...context.availableMaterials].map(id => context.materialLabels.get(id)));
  const map = new Map();
  for (const item of items || []) {
    if (provided.has(item.label)) continue;
    if (!map.has(item.label)) map.set(item.label, { ...item, required_for: [] });
    map.get(item.label).required_for.push(...(item.required_for || []));
  }
  return [...map.values()].map(item => ({ ...item, required_for: [...new Set(item.required_for)] }));
}

function repairSlideContent(slide, text, fragment, context, actions, issue) {
  if (slide.content.includes(text)) return;
  const before = slide.content;
  const lines = [`• ${text}`, ...slide.content.split("\n").filter(Boolean)];
  slide.content = [...new Set(lines)].join("\n");
  const source = toEvidenceSource(fragment);
  slide.evidence_sources = [...new Map([source, ...(slide.evidence_sources || [])].map(item => [item.source_id, item])).values()];
  actions.push({ issue, page_id: slide._pageId, before, after: slide.content });
}

function hasRenderedUserFact(slide, context) {
  const material = context.materialContext || {};
  return [
    ...(material.confirmed_facts || []),
    ...(material.user_material_facts || []),
    ...(material.material_facts || [])
  ].some(fragment => sourceRenderedInSlide(fragment, slide));
}

function sourceActuallySupportsSlide(fragment, slide) {
  return sourceRenderedInSlide(fragment, slide) || sourceSupportsSlide(fragment, slide);
}
