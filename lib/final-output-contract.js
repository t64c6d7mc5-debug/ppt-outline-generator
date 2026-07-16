const ROI_TITLE_PATTERN = /(?:客户价值与)?ROI\s*分析|ROI|投资回报分析/gi;
const QUALITY_SYSTEM_PATTERN = /质量验证体系/g;
const EQUIPMENT_BLOCKED_TERMS = /批量生产|物流交付|服务启用|版本确认/g;

import { hasIndustrialEquipmentSignal as hasIndustrialEquipmentProductSignal } from "./product-form.js";

export function enforceFinalOutputContract(outline, context) {
  if (!outline || !context) return outline;
  const contracted = structuredClone(outline);
  const contract = buildContractState(context);

  contracted.title = sanitizeVisibleText(contracted.title, contract, { isTitle: true });
  contracted.subtitle = sanitizeVisibleText(contracted.subtitle, contract);
  contracted.executive_summary = (contracted.executive_summary || []).map(item => sanitizeVisibleText(item, contract));
  contracted.global_visual_style = sanitizeObjectText(contracted.global_visual_style, contract);
  contracted.missing_materials = sanitizeObjectText(contracted.missing_materials || [], contract);
  contracted.production_strategy = sanitizeObjectText(contracted.production_strategy || {}, contract);
  contracted.slides = (contracted.slides || []).map(slide => {
    const next = { ...slide };
    for (const field of ["title", "key_message", "content", "visual_suggestion", "image_prompt", "speaker_notes"]) {
      next[field] = sanitizeVisibleText(next[field], contract, { isTitle: field === "title" });
      next[field] = sanitizeTitleBrandDuplication(next[field], contract);
    }
    return next;
  });
  contracted.title = sanitizeTitleBrandDuplication(contracted.title, contract);
  return contracted;
}

export function buildContractState(context = {}) {
  const sourceText = [
    context.requirement,
    context.topic,
    context.clientMaterials,
    context.industry?.label,
    ...(context.confirmedFacts || []).map(item => item.excerpt),
    ...(context.materialContext?.fragments || []).map(item => item.excerpt)
  ].filter(Boolean).join("\n");
  return {
    context,
    brand: context.materialContext?.brand?.value || "",
    brandAliases: brandAliases(context.materialContext?.brand?.value || ""),
    hasRoiEvidence: hasTraceableRoiEvidence(context),
    hasQualitySystemEvidence: hasTraceableQualitySystemEvidence(context),
    isIndustrialEquipment: hasIndustrialEquipmentSignal(sourceText)
  };
}

export function hasTraceableRoiEvidence(context = {}) {
  return traceableFragments(context).some(fragment => {
    if (!isPositiveTraceable(fragment)) return false;
    const text = fragment.excerpt || "";
    return /ROI|投资回报|回收周期|回本周期|收益|成本|降本|节省|量化价值|经济价值|回报率/i.test(text)
      && !/待确认|待验证|暂无|没有|尚无|未提供/.test(text);
  });
}

export function hasTraceableQualitySystemEvidence(context = {}) {
  return traceableFragments(context).some(fragment => {
    if (!isPositiveTraceable(fragment)) return false;
    const text = fragment.excerpt || "";
    return /质量体系|认证|ISO|制度|标准|完整验证流程|验证流程|检验规范|验收标准|质量标准|质控体系/i.test(text)
      && !/待确认|待验证|暂无|没有|尚无|未提供/.test(text);
  });
}

export function hasIndustrialEquipmentSignal(value) {
  return hasIndustrialEquipmentProductSignal(value);
}

export function sanitizeVisibleText(value, contract, options = {}) {
  if (typeof value !== "string") return value;
  let text = value;
  if (!contract.hasRoiEvidence) {
    text = text.replace(ROI_TITLE_PATTERN, options.isTitle ? "使用条件价值" : "量化价值依据");
  }
  if (!contract.hasQualitySystemEvidence) {
    text = text.replace(QUALITY_SYSTEM_PATTERN, "质量验证与验收依据");
  }
  if (contract.isIndustrialEquipment) {
    text = sanitizeIndustrialEquipmentDelivery(text);
  }
  return options.isTitle ? normalizeTitleSeparators(cleanInstructionShellTitle(text)) : text;
}

/**
 * Keep customer-visible titles focused on the subject when an upstream draft
 * accidentally contains an instruction shell. This only removes directive
 * prefixes and punctuation; it never supplies names, facts, or claims.
 */
export function cleanInstructionShellTitle(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(/^\s*(?:请(?:说明|介绍|阐述|展示)?|本页(?:需要|需|应)|系统(?:建议|提示)|待生成)\s*(?:[:：｜|、,，;；!?！？-]+\s*)?/u, "")
    .replace(/[：:｜|、,，;；!?！？]{2,}/gu, "：")
    .replace(/^[\s：:｜|、,，;；!?！？-]+|[\s：:｜|、,，;；!?！？-]+$/gu, "")
    .trim();
}

function sanitizeObjectText(value, contract) {
  if (typeof value === "string") return sanitizeVisibleText(value, contract);
  if (Array.isArray(value)) return value.map(item => sanitizeObjectText(item, contract));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeObjectText(item, contract)]));
}

function sanitizeIndustrialEquipmentDelivery(value) {
  return String(value || "")
    .replace(/批量生产/g, "设备制造")
    .replace(/物流交付/g, "验收交付")
    .replace(/服务启用/g, "安装调试")
    .replace(/版本确认/g, "方案确认")
    .replace(/批量协作/g, "设备制造")
    .replace(/批量处理/g, "设备制造");
}

function sanitizeTitleBrandDuplication(value, contract) {
  if (typeof value !== "string" || !contract.brand) return value;
  if (value.includes("\n")) {
    return value.split("\n").map(line => sanitizeTitleBrandDuplication(line, contract)).join("\n");
  }
  const parts = value.split(/[｜|]/).map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return value;
  const normalizedBrand = normalizeBrand(contract.brand);
  const seen = new Set();
  const deduped = parts.filter(part => {
    const normalized = normalizeBrand(part);
    if (!normalized) return false;
    const isBrandOrAlias = normalized === normalizedBrand
      || contract.brandAliases.some(alias => normalized === alias || normalizedBrand.includes(normalized));
    if (!isBrandOrAlias) {
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    }
    if (seen.has("brand")) return false;
    seen.add("brand");
    return true;
  });
  return deduped.join("｜") || value;
}

function brandAliases(brand) {
  const normalized = normalizeBrand(brand);
  const withoutSuffix = normalizeBrand(String(brand || "").replace(/(?:有限责任公司|股份有限公司|有限公司|科技|智能|公司)$/g, ""));
  const withoutCompany = normalizeBrand(String(brand || "").replace(/(?:有限责任公司|股份有限公司|有限公司|公司)$/g, ""));
  return [...new Set([normalized, withoutSuffix, withoutCompany].filter(item => item.length >= 2))];
}

function normalizeBrand(value) {
  return String(value || "").replace(/[\s\p{P}\p{S}]+/gu, "");
}

function normalizeTitleSeparators(value) {
  return String(value || "")
    .replace(/｜{2,}/g, "｜")
    .replace(/(?:^｜|｜$)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function traceableFragments(context = {}) {
  const material = context.materialContext || {};
  return [
    ...(material.confirmed_facts || []),
    ...(material.user_material_facts || []),
    ...(material.material_facts || []),
    ...(material.fragments || [])
  ];
}

function isPositiveTraceable(fragment = {}) {
  if (!fragment.excerpt) return false;
  if (fragment.polarity && fragment.polarity !== "positive") return false;
  return ["explicit_confirmed_fact", "user_material_fact", undefined, ""].includes(fragment.assertion_type);
}
