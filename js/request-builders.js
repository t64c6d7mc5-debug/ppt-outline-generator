import { parseRiskRules, subjectTermsFromRules } from "./risk-rules.js";
import {
  MUST_INCLUDE_RULES_SCHEMA_VERSION,
  buildMustIncludeRules,
  mustIncludeSourceHash
} from "../lib/structured-requirement.js";

export function buildSimpleRequest(formData, simpleNeed) {
  const request = {
    source_mode: "simple",
    planning_profile: "simple",
    allow_draft: true,
    requirement: formData.rawNeed,
    has_materials: formData.materialStatus !== "只有一句话需求",
    client_materials: normalizeClientMaterials(formData.materialsText),
    style: formData.styleChoice === "auto" ? "auto" : simpleNeed.style
  };
  if (formData.purposeChoice && formData.purposeChoice !== "auto" && simpleNeed.purpose) request.purpose = simpleNeed.purpose;
  if (formData.deadline) request.deadline = formData.deadline;
  if (formData.pageChoice !== "auto") request.page_count = simpleNeed.pageCount;
  return request;
}

export function normalizeClientMaterials(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .split("\n")
    .map(line => line.replace(/[\t ]+$/g, ""))
    .join("\n")
    .trim();
}

export function buildProfessionalRequest(brief, options = {}) {
  const excludedContentRules = parseRiskRules(brief.riskPoints, "riskPoints");
  const legacyExcludedContent = subjectTermsFromRules(excludedContentRules);
  const mustIncludeItems = splitList(brief.mustHave);
  const mustIncludeRules = buildMustIncludeRules(mustIncludeItems);
  const requirementsSummary = stripMarkup(options.requirementsSummary || "");
  const clarifyingAnswers = normalizeClientMaterials(options.clarifyingAnswers || brief.followAnswers || "");
  return {
    source_mode: "professional",
    mode: "professional",
    planning_profile: "full_quality_outline",
    requirement: brief.topic,
    client_materials: normalizeClientMaterials(brief.materialDetails || ""),
    page_count: brief.pageCount,
    style: brief.style,
    purpose: brief.purpose,
    detailed_purpose: brief.detailedPurpose || brief.purposeDetail || "",
    audience: brief.audience || "",
    scenario: brief.scenario || "",
    deadline: brief.deadline || "",
    material_categories: (brief.materials || []).filter(item => item !== "只有主题"),
    material_status: (brief.materials || []).filter(Boolean).join("、") || "只有主题",
    must_include: mustIncludeItems,
    must_include_rules: mustIncludeRules,
    must_include_rules_schema_version: MUST_INCLUDE_RULES_SCHEMA_VERSION,
    must_include_source_count: mustIncludeItems.length,
    must_include_source_hash: mustIncludeSourceHash(mustIncludeItems),
    must_include_source: mustIncludeItems,
    excluded_content: legacyExcludedContent.length ? legacyExcludedContent : splitList(brief.riskPoints),
    excluded_content_rules: excludedContentRules,
    emphasis: brief.emphasis || "",
    desired_emphasis: brief.emphasis || "",
    detailed_emphasis: brief.customHighlight || "",
    visual_preferences: {
      include_images: brief.needImages !== false,
      include_layouts: brief.needLayouts !== false,
      reference_style: brief.reference || ""
    },
    include_speaker_notes: brief.needScript !== false,
    follow_up_answers: clarifyingAnswers,
    clarifying_questions: Array.isArray(options.clarifyingQuestions) ? options.clarifyingQuestions.slice(0, 5) : [],
    clarifying_answers: clarifyingAnswers,
    requirements_summary: requirementsSummary,
    confirmed_facts: Array.isArray(brief.confirmedFacts) ? brief.confirmedFacts.slice(0, 30) : [],
    delivery_requirements: {
      include_speaker_notes: brief.needScript !== false,
      include_images: brief.needImages !== false,
      include_layouts: brief.needLayouts !== false,
      reference_style: brief.reference || "",
      deadline: brief.deadline || ""
    }
  };
}

export function buildProfessionalPlanningStageRequest(brief, planningProfile, options = {}) {
  const profile = planningProfile === "requirements_summary"
    ? "requirements_summary"
    : "clarifying_questions";
  const request = {
    source_mode: "professional",
    mode: "professional",
    planning_profile: profile,
    requirement: brief.topic || "",
    page_count: brief.pageCount,
    scenario: brief.scenario || "",
    style: brief.style || "",
    purpose: brief.purpose || "",
    detailed_purpose: brief.detailedPurpose || brief.purposeDetail || "",
    audience: brief.audience || "",
    client_materials: normalizeClientMaterials(brief.materialDetails || ""),
    material_categories: (brief.materials || []).filter(item => item !== "只有主题"),
    must_include: splitList(brief.mustHave),
    excluded_content: splitList(brief.riskPoints),
    visual_preferences: {
      reference_style: brief.reference || "",
      include_images: brief.needImages !== false,
      include_layouts: brief.needLayouts !== false
    },
    follow_up_answers: normalizeClientMaterials(options.followUpAnswers || brief.followAnswers || "")
  };
  if (profile === "requirements_summary") {
    request.clarifying_questions = Array.isArray(options.questions) ? options.questions.slice(0, 5) : [];
  }
  return request;
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(item => String(item || "").trim()).filter(Boolean);
  const source = String(value || "").replace(/\r\n?/g, "\n").trim();
  if (!source) return [];
  const lines = source
    .split(/\n+/)
    .map(item => item.replace(/^\s*(?:[-*•]|\d+[.、)]|[一二三四五六七八九十]+[、.）])\s*/, "").trim())
    .filter(Boolean);
  if (lines.length > 1) return lines;
  if (/[。！？!?]/.test(source) || /必须|不得|不能|最后一页|从.+到/.test(source)) return [source];
  return source.split(/[，,、；;]+/).map(item => item.trim()).filter(Boolean);
}

function stripMarkup(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 3000);
}
