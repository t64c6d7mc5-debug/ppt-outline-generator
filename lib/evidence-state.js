export function createEvidenceState(sectionId, recipe, context) {
  const needs = recipe.needs || [];
  const sourceFragments = context.materialContext.fragments.filter(fragment =>
    fragment.polarity === "positive"
    && fragment.material_type_ids.some(id => needs.includes(id))
  );
  const available = needs.filter(id => sourceFragments.some(fragment => fragment.material_type_ids.includes(id)));
  const missing = needs.filter(id => !context.availableMaterials.has(id));
  const dataRequirements = missing.map(id => context.materialLabels.get(id) || id);

  let status = "framework_only";
  if (["implications", "productAdvice", "marketingAdvice", "channelAdvice", "actions", "strategy", "closing", "plan", "next"].includes(sectionId)) {
    status = "recommendation";
  } else if (context.type.id === "customer_persona" && ["segments", "archetype"].includes(sectionId) && !context.hasCustomerEvidence) {
    status = "hypothesis_pending";
  } else if (needs.length && available.length === needs.length) {
    status = "source_supported";
  } else if (available.length) {
    status = "partially_supported";
  }

  return {
    status,
    dataRequirements,
    availableMaterials: available.map(id => context.materialLabels.get(id) || id),
    missingMaterialIds: missing,
    evidenceSources: [],
    candidateSources: dedupeSources(sourceFragments.map(toEvidenceSource))
  };
}

export function collectMissingMaterials(slides, context) {
  const byLabel = new Map();
  for (const slide of slides) {
    for (const label of slide.data_requirements || []) {
      if (!byLabel.has(label)) byLabel.set(label, { label, required_for: [] });
      byLabel.get(label).required_for.push(slide.title);
    }
  }
  for (const gap of context?.materialContext?.explicit_gaps || []) {
    const label = gap.excerpt.replace(/^(?:资料缺口|待补充资料)\s*[：:]\s*/, "").trim();
    if (!label) continue;
    if (!byLabel.has(label)) byLabel.set(label, { label, required_for: [], source_id: gap.source_id, source: "client_explicit" });
    byLabel.get(label).required_for.push("客户明确资料缺口");
  }
  return [...byLabel.values()].map(item => ({
    ...item,
    required_for: [...new Set(item.required_for)],
    priority: item.required_for.length >= 2 ? "high" : "normal"
  }));
}

export function toEvidenceSource(fragment) {
  return {
    fragment_id: fragment.fragment_id,
    source_id: fragment.source_id,
    assertion_type: fragment.assertion_type,
    section_type: fragment.section_type,
    field: fragment.field,
    excerpt: fragment.excerpt,
    polarity: fragment.polarity,
    evidence_type: fragment.evidence_type
  };
}

function dedupeSources(items) {
  return [...new Map(items.map(item => [item.source_id, item])).values()];
}

export function evidenceLabel(status) {
  return ({
    source_supported: "资料支持",
    partially_supported: "部分资料支持",
    framework_only: "分析框架",
    hypothesis_pending: "待验证假设",
    recommendation: "业务建议"
  })[status] || "待核验";
}
