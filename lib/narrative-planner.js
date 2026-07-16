import { PRODUCT_INTRO_ROLE_SELECTION_MATRIX } from "./outline-templates.js";

const PERSONA_SEQUENCE = [
  "cover", "dataBasis", "sampleOverview", "demographics", "geography", "preferences",
  "motivation", "scenarios", "channels", "factors", "segments", "archetype",
  "needsJourney", "productAdvice", "marketingAdvice", "channelAdvice", "implications"
];

const PROJECT_SEQUENCE = [
  "cover", "background", "positioning", "industry", "resources", "service",
  "architecture", "process", "value", "model", "plan", "closing"
];

const HISTORY_SEQUENCE = [
  "cover", "origin", "timeline", "imagery", "works", "color", "poetry", "space",
  "aesthetics", "change", "contemporary", "closing"
];

const ROLE_BY_SECTION = {
  cover: "cover",
  market_or_customer_challenge: "background",
  company_positioning: "background",
  target_audience: "evidence",
  product_portfolio: "analysis",
  product_or_process_capability: "analysis",
  customization_capability: "analysis",
  application_scenarios: "evidence",
  service_process: "analysis",
  quality_or_validation: "evidence",
  delivery_and_collaboration: "analysis",
  customer_value: "insight",
  cooperation_next_step: "action",
  source_and_material_gap: "evidence",
  assumptions_and_boundaries: "recommendation",
  dataBasis: "background",
  scope: "background",
  basis: "evidence",
  objective: "background",
  background: "background",
  definition: "background",
  origin: "background",
  goal: "background",
  responsibility: "background",
  problem: "background",
  position: "background",
  positioning: "background",
  sampleOverview: "evidence",
  demographics: "evidence",
  geography: "evidence",
  preferences: "evidence",
  motivation: "evidence",
  scenarios: "evidence",
  channels: "evidence",
  factors: "evidence",
  evidence: "evidence",
  metrics: "evidence",
  progress: "evidence",
  timeline: "evidence",
  imagery: "evidence",
  works: "evidence",
  color: "evidence",
  poetry: "evidence",
  space: "evidence",
  resources: "evidence",
  segments: "analysis",
  archetype: "analysis",
  needsJourney: "analysis",
  trends: "analysis",
  competition: "analysis",
  diagnosis: "analysis",
  question: "analysis",
  content: "analysis",
  aesthetics: "analysis",
  change: "insight",
  capabilities: "analysis",
  architecture: "analysis",
  value: "insight",
  model: "recommendation",
  implications: "recommendation",
  productAdvice: "recommendation",
  marketingAdvice: "recommendation",
  channelAdvice: "recommendation",
  actions: "recommendation",
  strategy: "recommendation",
  risks: "recommendation",
  contemporary: "recommendation",
  method: "action",
  flow: "analysis",
  plan: "action",
  next: "action",
  closing: "action"
};

const ROLE_RANK = { cover: 0, background: 1, evidence: 2, analysis: 3, insight: 4, recommendation: 5, action: 6 };

export function buildNarrativePlan(context) {
  const { type, pageCount } = context;
  const preferredSections = (context.planningAnalysis?.sections || []).map(section => section.section_id);
  const selected = selectSections(type, pageCount, preferredSections, context);
  const sequence = sequenceForType(type);
  const ordered = selected.sort((left, right) => sectionOrder(sequence, left) - sectionOrder(sequence, right));

  return ordered.map((sectionId, index) => {
    const role = roleForSection(sectionId, index, ordered.length);
    const prerequisites = [];
    if (index > 0) prerequisites.push(ordered[index - 1]);
    if (type.id === "customer_persona" && sectionId === "segments") {
      prerequisites.push("dataBasis", "sampleOverview");
      ordered.slice(0, index).filter(id => ROLE_BY_SECTION[id] === "evidence").forEach(id => prerequisites.push(id));
    }
    return {
      id: sectionId,
      role,
      planning_intent: context.planningSectionIntents?.[sectionId] || null,
      priority: priorityForRole(role),
      prerequisites: [...new Set(prerequisites)],
      expandAfter: index ? ordered[index - 1] : null,
      cannotFollow: role === "evidence" ? ["recommendation", "action"] : []
    };
  });
}

export function validateNarrativePlan(plan, context) {
  const issues = [];
  const positions = new Map(plan.map((section, index) => [section.id, index]));
  for (const section of plan) {
    for (const prerequisite of section.prerequisites) {
      if (positions.has(prerequisite) && positions.get(prerequisite) >= positions.get(section.id)) {
        issues.push(`章节 ${section.id} 位于前置章节 ${prerequisite} 之前`);
      }
    }
  }

  let highestRank = -1;
  for (const section of plan) {
    const rank = ROLE_RANK[section.role] ?? 3;
    if (rank < highestRank && section.role !== "evidence") {
      issues.push(`章节 ${section.id} 的叙事角色发生倒退`);
    }
    highestRank = Math.max(highestRank, rank);
  }

  if (context.type.id === "customer_persona") {
    const segmentIndex = positions.get("segments");
    for (const section of plan.filter(item => item.role === "evidence")) {
      if (segmentIndex !== undefined && positions.get(section.id) > segmentIndex) {
        issues.push(`画像依据页 ${section.id} 位于用户分群之后`);
      }
    }
  }
  if (plan.length !== context.pageCount) issues.push(`计划页数 ${plan.length} 与要求 ${context.pageCount} 不一致`);
  if (plan[0]?.role !== "cover") issues.push("封面不是第一章");
  if (plan.at(-1)?.role !== "action" && plan.at(-1)?.role !== "recommendation") issues.push("收束页不是最后一章");
  return issues;
}

function selectSections(type, pageCount, preferredSections = [], context = {}) {
  if (type.id === "product_intro") {
    const requiredIds = context.requiredSectionIds || [];
    if (requiredIds.length) {
      const budget = Math.max(1, pageCount - 1);
      const body = [];
      const filler = ["target_audience", ...PRODUCT_INTRO_ROLE_SELECTION_MATRIX[15].filter(id => id !== "target_audience")];
      for (const id of [...requiredIds, ...preferredSections, ...filler]) {
        if (id === "cover") continue;
        if (!PRODUCT_INTRO_ROLE_SELECTION_MATRIX[15].includes(id)) continue;
        if (!body.includes(id)) body.push(id);
        if (body.length >= budget) break;
      }
      return ["cover", ...body.slice(0, budget)];
    }
    const selected = PRODUCT_INTRO_ROLE_SELECTION_MATRIX[pageCount];
    if (selected) return [...selected];
  }
  const base = [...type.base];
  const closing = base.pop();
  if (pageCount <= type.base.length) {
    return base.slice(0, Math.max(1, pageCount - 1)).concat(closing).slice(0, pageCount);
  }
  const result = [...base];
  const extensionSet = new Set(type.extensions);
  const extensions = [
    ...(context.requiredSectionIds || []).filter(sectionId => extensionSet.has(sectionId)),
    ...preferredSections.filter(sectionId => extensionSet.has(sectionId)),
    ...type.extensions
  ].filter((sectionId, index, items) => items.indexOf(sectionId) === index);
  let appendix = 1;
  while (result.length < pageCount - 1) result.push(extensions.shift() || `verificationAppendix${appendix++}`);
  result.push(closing);
  return result;
}

function sequenceForType(type) {
  if (type.id === "customer_persona") return PERSONA_SEQUENCE;
  if (type.id === "project_plan") return PROJECT_SEQUENCE;
  if (type.id === "history_culture") return HISTORY_SEQUENCE;
  if (type.id === "product_intro") return PRODUCT_INTRO_ROLE_SELECTION_MATRIX[15];
  return [...type.base.slice(0, -1), ...type.extensions, type.base.at(-1)];
}

function sectionOrder(sequence, id) {
  const position = sequence.indexOf(id);
  if (position >= 0) return position;
  if (/^verificationAppendix/.test(id)) return sequence.length - 0.5;
  return sequence.length;
}

function roleForSection(id, index, total) {
  if (index === 0) return "cover";
  if (index === total - 1) return "action";
  if (/^verificationAppendix/.test(id)) return "evidence";
  return ROLE_BY_SECTION[id] || "analysis";
}

function priorityForRole(role) {
  return ({ cover: 100, background: 90, evidence: 80, analysis: 85, insight: 75, recommendation: 70, action: 95 })[role] || 60;
}
