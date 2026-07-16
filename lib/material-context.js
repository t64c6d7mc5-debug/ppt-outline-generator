import { MATERIAL_TYPES } from "./outline-templates.js";

const SECTION_ALIASES = [
  ["project_background", /^(?:项目|业务|研究)?背景(?:与目标)?$/],
  ["confirmed_facts", /^(?:已确认|确认|已知|现状)(?:的)?(?:事实|信息|情况)?$/],
  ["material_facts", /^(?:普通|用户|客户|原始)?素材事实(?:清单)?$/],
  ["supplemental", /^(?:补充|补充资料|补充信息|补充说明|supplemental)(?:清单)?$/i],
  ["hypotheses", /^(?:待验证|待确认|研究)?假设(?:清单)?$/],
  ["pending_items", /^(?:待确认|待核实|待明确)(?:事项|变量|内容|问题|清单)?$/],
  ["management_questions", /^(?:管理层|董事会|决策层)(?:重点|核心)?(?:问题|关注事项)$/],
  ["provided_materials", /^(?:已有|现有|已提供|客户提供)(?:内部)?资料(?:清单)?$/],
  ["explicit_gaps", /^(?:关键|现有|待补充)?资料缺口(?:清单)?$/],
  ["required_decisions", /^(?:董事会|管理层)?(?:决策事项|决策要求|待决策事项)$/]
];

const MATERIAL_CATEGORY_UNCLASSIFIED = "unclassified";

const MATERIAL_IDENTITY_ALIASES = new Map([
  ["普通资料", { field: "material_facts", assertionType: "user_material_fact" }],
  ["已确认事实", { field: "confirmed_facts", assertionType: "explicit_confirmed_fact" }],
  ["待确认内容", { field: "pending_items", assertionType: "pending_suggestion" }]
]);

const MATERIAL_CATEGORY_ALIASES = new Map([
  ["企业定位", "company_positioning"],
  ["目标客户", "target_audience"],
  ["核心功能", "software_function"],
  ["产品功能", "software_function"],
  ["设备接入", "software_access_integration"],
  ["系统集成", "software_access_integration"],
  ["部署与安全", "software_deployment_security"],
  ["权限管理", "software_validation"],
  ["实施流程", "software_implementation"],
  ["上线流程", "software_implementation"],
  ["服务支持", "software_delivery"],
  ["软件交付", "software_delivery"],
  ["核心产品", "product_and_process"],
  ["产品类别", "product_and_process"],
  ["产品类型", "product_and_process"],
  ["材料结构", "product_and_process"],
  ["材料", "product_and_process"],
  ["材质", "product_and_process"],
  ["生产工艺", "product_and_process"],
  ["工艺流程", "product_and_process"],
  ["产品与工艺", "product_and_process"],
  ["定制能力", "customization_capability"],
  ["定制方案", "customization_capability"],
  ["定制字段", "customization_capability"],
  ["应用场景", "application_scenario"],
  ["打样与确认", "service_process"],
  ["打样流程", "service_process"],
  ["样品确认", "service_process"],
  ["服务流程", "service_process"],
  ["质量检查", "quality_check"],
  ["质量控制", "quality_check"],
  ["检验项目", "quality_check"],
  ["检查项目", "quality_check"],
  ["生产与交付", "delivery_capability"],
  ["交付方式", "delivery_capability"],
  ["交付内容", "delivery_capability"],
  ["交付能力", "delivery_capability"]
]);

const MATERIAL_CATEGORY_DETAILS = new Map([
  ["核心功能", "software_core_function"],
  ["产品功能", "software_core_function"],
  ["设备接入", "software_access"],
  ["系统集成", "software_integration"],
  ["部署与安全", "software_deployment_security"],
  ["权限管理", "software_permission"],
  ["实施流程", "software_implementation"],
  ["上线流程", "software_go_live"],
  ["服务支持", "software_service_support"],
  ["软件交付", "software_delivery_content"],
  ["核心产品", "core_product"],
  ["产品类别", "core_product"],
  ["产品类型", "core_product"],
  ["材料结构", "material_structure"],
  ["材料", "material_structure"],
  ["材质", "material_structure"],
  ["生产工艺", "production_process"],
  ["工艺流程", "production_process"],
  ["产品与工艺", "product_and_process"],
  ["生产与交付", "production_and_delivery"],
  ["交付方式", "delivery_method"],
  ["交付内容", "delivery_content"],
  ["交付能力", "delivery_capability"]
]);

const FIELD_NAMES = [
  "project_background", "confirmed_facts", "hypotheses", "management_questions",
  "material_facts", "supplemental", "pending_items", "provided_materials", "explicit_gaps", "required_decisions"
];

export function parseMaterialContext({ clientMaterials = "", materialCategories = [], followUpAnswers = "" } = {}) {
  const fragments = [];
  const buckets = Object.fromEntries(FIELD_NAMES.map(field => [field, []]));
  const unclassified = [];
  const userMaterialFacts = [];
  const modelInferences = [];
  const pendingSuggestions = [];
  let currentSection = "";
  let currentCategory = MATERIAL_CATEGORY_UNCLASSIFIED;
  let currentCategoryDetail = MATERIAL_CATEGORY_UNCLASSIFIED;
  let currentAssertionType = "";
  let sequence = 1;

  const resetState = () => {
    currentSection = "";
    currentCategory = MATERIAL_CATEGORY_UNCLASSIFIED;
    currentCategoryDetail = MATERIAL_CATEGORY_UNCLASSIFIED;
    currentAssertionType = "";
  };

  const addFragment = (raw, field = "", source = "client_materials", sectionType = currentSection || "", options = {}) => {
    const excerpt = cleanFragment(raw);
    if (!excerpt) return null;
    const resolvedField = field || classifyFragment(excerpt);
    const polarity = detectPolarity(excerpt, resolvedField);
    const fragmentSequence = String(sequence++).padStart(3, "0");
    const resolvedSection = sectionType || resolvedField || "unclassified";
    const assertionType = options.assertionType || assertionTypeFor({
      field: resolvedField,
      source,
      sectionType: resolvedSection,
      polarity,
      excerpt
    });
    const fragment = {
      fragment_id: `${source}:${sanitizeIdPart(resolvedSection)}:${fragmentSequence}`,
      source_id: `${source}-${fragmentSequence}`,
      assertion_type: assertionType,
      section_type: resolvedSection || "unclassified",
      field: resolvedField || "unclassified",
      category: options.category || MATERIAL_CATEGORY_UNCLASSIFIED,
      category_detail: options.categoryDetail || MATERIAL_CATEGORY_UNCLASSIFIED,
      excerpt,
      polarity,
      evidence_type: evidenceTypeFor(polarity, resolvedField),
      material_type_ids: matchMaterialTypes(excerpt, polarity, resolvedField),
      semantic_tags: semanticTagsFor(excerpt, resolvedField)
    };
    fragments.push(fragment);
    if (buckets[fragment.field]) buckets[fragment.field].push(fragment);
    else unclassified.push(fragment);
    if (assertionType === "user_material_fact") userMaterialFacts.push(fragment);
    if (assertionType === "pending_suggestion") pendingSuggestions.push(fragment);
    return fragment;
  };

  for (const rawLine of splitMaterialLines(clientMaterials)) {
    const line = cleanFragment(rawLine);
    if (!line) continue;
    const compoundHeading = parseCompoundHeading(line);
    if (compoundHeading) {
      if (compoundHeading.invalid) {
        resetState();
        continue;
      }
      currentSection = compoundHeading.field;
      currentCategory = compoundHeading.category;
      currentCategoryDetail = compoundHeading.categoryDetail;
      currentAssertionType = compoundHeading.assertionType;
      continue;
    }
    const heading = parseHeading(line);
    if (heading) {
      currentSection = heading.field;
      currentCategory = MATERIAL_CATEGORY_UNCLASSIFIED;
      currentCategoryDetail = MATERIAL_CATEGORY_UNCLASSIFIED;
      currentAssertionType = "";
      if (heading.content) addFragment(heading.content, currentSection, "client_materials", currentSection);
      continue;
    }
    if (isUnknownSectionHeading(line)) {
      resetState();
      continue;
    }
    const explicitField = classifyExplicitFragment(line);
    const field = explicitField || currentSection || classifyFragment(line);
    const category = explicitField ? MATERIAL_CATEGORY_UNCLASSIFIED : currentCategory;
    const categoryDetail = explicitField ? MATERIAL_CATEGORY_UNCLASSIFIED : currentCategoryDetail;
    const assertionType = explicitField ? "" : currentAssertionType;
    addFragment(line, field, "client_materials", explicitField || currentSection || field, { category, categoryDetail, assertionType });
  }

  for (const category of materialCategories || []) addFragment(category, "provided_materials", "material_category", "provided_materials");
  for (const answer of splitMaterialLines(followUpAnswers)) addFragment(answer, "", "follow_up_answer", "follow_up_answer");

  const brandFragment = fragments.find(fragment => fragment.field === "brand")
    || fragments.find(fragment => fragment.semantic_tags.includes("brand"))
    || fragments.find(fragment => extractReliableCompanyName(fragment.excerpt));
  const brand = brandFragment ? {
    value: extractReliableCompanyName(brandFragment.excerpt)
      || brandFragment.excerpt.replace(/^(?:品牌|品牌名称|项目名称|企业名称)\s*[：:]\s*/i, "").trim(),
    source_id: brandFragment.source_id,
    excerpt: brandFragment.excerpt
  } : null;
  const positiveEvidenceFragments = fragments.filter(isPositiveEvidenceFragment);
  const availableMaterialTypes = [...new Set(positiveEvidenceFragments.flatMap(fragment => fragment.material_type_ids))];
  const customerEvidenceTypes = availableMaterialTypes.filter(id => [
    "orders", "survey", "interviews", "leads", "sampleSize", "conversion", "testDrives",
    "storeInquiries", "transactions", "channelOrders", "campaignData"
  ].includes(id));

  const confirmedFacts = buckets.confirmed_facts
    .filter(fragment => fragment.assertion_type === "explicit_confirmed_fact");

  return {
    raw_text: normalizeMultiline(clientMaterials),
    brand,
    ...buckets,
    confirmed_facts: confirmedFacts,
    user_material_facts: userMaterialFacts,
    model_inferences: modelInferences,
    pending_suggestions: pendingSuggestions,
    fragments,
    unclassified_fragments: unclassified,
    available_material_types: availableMaterialTypes,
    has_customer_evidence: customerEvidenceTypes.length > 0,
    critical_anchors: buildCriticalAnchors({ brand, fragments })
  };
}

export function sourceSupportsSlide(fragment, slide, { directSourceIds = [] } = {}) {
  if (!fragment || !slide) return false;
  const slideText = `${slide.title || ""} ${slide.key_message || ""} ${slide.content || ""}`;
  const status = slide.evidence_status || "framework_only";
  if (!sourceStatusCompatible(fragment, status, slide.slide_type)) return false;
  if (!sourcePolarityMatchesText(fragment, slideText)) return false;
  if (directSourceIds.includes(fragment.source_id)) return true;
  if (fragment.field === "required_decisions"
    && /(?:董事会|管理层|决策层|委员会|管委会).*(?:决策|确认)/.test(slideText)
    && /继续/.test(slideText) && /调整/.test(slideText) && /停止/.test(slideText)) return true;
  const tagMatches = fragment.semantic_tags.filter(tag => semanticTagCovered(tag, slideText)).length;
  const overlap = semanticOverlap(fragment.excerpt, slideText);
  return overlap >= 0.5 || (tagMatches >= 1 && overlap >= 0.25);
}

export function sourceRenderedInSlide(fragment, slide) {
  if (!fragment || !slide) return false;
  const slideText = `${slide.title || ""} ${slide.key_message || ""} ${slide.content || ""}`;
  const excerpt = String(fragment.excerpt || "").trim();
  const normalizedExcerpt = stripMaterialPrefix(excerpt);
  return Boolean(excerpt && slideText.includes(excerpt))
    || Boolean(normalizedExcerpt && normalizedExcerpt !== excerpt && slideText.includes(normalizedExcerpt));
}

export function collectTraceableSegments(context = {}) {
  const material = context.materialContext || context;
  const candidates = [
    ...(material?.hypotheses || []),
    ...(material?.confirmed_facts || []).filter(isExplicitSegmentFact)
  ];
  const fromMaterials = candidates.flatMap(fragment => {
    const label = extractSegmentLabel(fragment.excerpt);
    return label ? [{
      label,
      semantic_terms: extractSegmentSemanticTerms(fragment.excerpt, label),
      source_id: fragment.source_id,
      excerpt: fragment.excerpt,
      field: fragment.field,
      evidence_type: fragment.evidence_type
    }] : [];
  });
  const explicitText = [context.requirement, ...(context.mustInclude || [])].filter(Boolean).join("\n");
  const fromRequest = extractRequestedSegments(explicitText).map((label, index) => ({
    label,
    semantic_terms: [],
    source_id: `request-segment-${index + 1}`,
    excerpt: label,
    field: "explicit_requirement",
    evidence_type: "requirement"
  }));
  return [...new Map([...fromMaterials, ...fromRequest].map(item => [normalizeForMatch(item.label), item])).values()];
}

export function extractNamedSegmentLines(slide = {}) {
  return String(slide.content || "").split("\n").flatMap(line => {
    const clean = line.replace(/^\s*[•*-]\s*/, "").trim();
    if (!/(?:待验证方向|分群假设|客群|人群|用户|客户|消费者|使用者)/.test(clean)) return [];
    const label = extractSegmentLabel(clean.replace(/^(?:待验证方向|分群假设)\s*[：:]\s*/, ""));
    return label ? [{ label, line: clean }] : [];
  });
}

export function resolveChannelState(context = {}) {
  const fragments = context.materialContext?.fragments || context.fragments || [];
  const related = fragments.filter(fragment => /门店|经销商|直营店|渠道模式|渠道布局/.test(fragment.excerpt));
  if (related.some(fragment => fragment.polarity === "positive" && /(?:已有|现有|设有|拥有|运营|经销商|直营店|门店)/.test(fragment.excerpt))) {
    return "confirmed_physical_channel";
  }
  if (related.some(fragment => fragment.polarity !== "positive" && /未确定|尚未确定|待确认|没有|尚无|暂无/.test(fragment.excerpt))) {
    return "undetermined";
  }
  return "unknown";
}

export function hasPositiveGeographicEvidence(context = {}) {
  const fragments = context.materialContext?.fragments || context.fragments || [];
  return fragments.some(fragment =>
    fragment.polarity === "positive"
    && fragment.evidence_type === "provided_source"
    && /城市|区域|省份|区县|地域|地理/.test(fragment.excerpt)
    && /分布|样本|覆盖|名单|记录|数据|占比|数量|明细/.test(fragment.excerpt)
  );
}

export function extractSegmentLabel(value) {
  const source = String(value || "")
    .replace(/^\s*[•*-]\s*/, "")
    .replace(/^(?:待验证(?:方向|假设)?|已确认(?:客群|分群)?|分群结论)\s*[：:]\s*/, "")
    .trim();
  const colon = source.match(/^([^：:，,。；;]{2,28}(?:型|类|人群|用户|客户|客群|家庭|企业|商户|机构))\s*[：:]/)?.[1];
  if (colon) return colon.trim();
  const lead = source.match(/^([^，,。；;]{2,28}?(?:用户|人群|客户|客群|消费者|使用者|家庭|企业|商户|机构))(?:可能|倾向|更?关注|主要|通常|需要|需|以|，|,|。|；|;|$)/)?.[1];
  return lead?.trim() || "";
}

export function extractSegmentSemanticTerms(value, label = "") {
  let source = String(value || "")
    .replace(/^\s*[•*-]\s*/, "")
    .replace(/（?不代表真实(?:客户|用户|消费者)?结论。?）?/g, "")
    .trim();
  if (label) source = source.replace(label, "");
  source = source.replace(/^(?:待验证(?:方向|假设)?|已确认(?:客群|分群)?|分群结论)\s*[：:]\s*/, "");
  const focus = source.match(/(?:可能)?(?:更)?(?:关注|重视|在意|看重|核心诉求(?:是|为)?|主要需求(?:是|为)?)(.+)$/)?.[1]
    || source.match(/[：:]\s*(.+)$/)?.[1]
    || "";
  return [...new Set(focus
    .replace(/^(?:可能|主要|核心|更)/, "")
    .split(/[、，,；;]|\s*(?:与|和|及)\s*/)
    .map(item => item.replace(/(?:等|相关)?(?:关注点|因素|需求|偏好)$/g, "").trim())
    .filter(item => item.length >= 2 && !/^(?:待验证|需验证|可能)$/.test(item)))];
}

function isExplicitSegmentFact(fragment) {
  return /(?:已确认|明确|分群|客群|画像|用户类型|客户类型)/.test(fragment.excerpt)
    && Boolean(extractSegmentLabel(fragment.excerpt));
}

function extractRequestedSegments(text) {
  const match = String(text || "").match(/(?:分为|包括|包含|指定)([^。；;\n]{4,100})(?:等)?(?:客群|人群|用户群|客户群|分群)/);
  if (!match) return [];
  return match[1].split(/[、，,及和与]/).map(extractSegmentLabel).filter(Boolean);
}

function sourceStatusCompatible(fragment, status, slideType) {
  if (status === "hypothesis_pending") {
    return ["hypotheses", "pending_items"].includes(fragment.field)
      && fragment.evidence_type === "hypothesis";
  }
  if (["source_supported", "partially_supported"].includes(status)) {
    return fragment.polarity === "positive"
      && fragment.evidence_type === "provided_source"
      && ["explicit_confirmed_fact", "user_material_fact"].includes(fragment.assertion_type);
  }
  if (status === "recommendation") {
    return ["confirmed_facts", "hypotheses", "management_questions", "explicit_gaps", "required_decisions", "project_background"].includes(fragment.field);
  }
  if (fragment.field === "hypotheses") return false;
  if (fragment.field === "provided_materials") return ["dataBasis", "sampleOverview"].includes(slideType);
  return true;
}

function assertionTypeFor({ field, source, sectionType, polarity, excerpt }) {
  if (source !== "client_materials") {
    return field === "provided_materials" ? "user_material_fact" : "pending_suggestion";
  }
  if (field === "confirmed_facts" && sectionType === "confirmed_facts") {
    if (polarity === "pending" || isUncertainExpression(excerpt)) return "pending_suggestion";
    return "explicit_confirmed_fact";
  }
  if (["hypotheses", "pending_items", "explicit_gaps", "required_decisions"].includes(field)) return "pending_suggestion";
  if (["supplemental", "project_background"].includes(field)) return "user_material_fact";
  if (polarity === "pending" || /待验证|待确认|建议|需补充|资料缺口/.test(excerpt)) return "pending_suggestion";
  if (field && field !== "unclassified") return "user_material_fact";
  return "user_material_fact";
}

function sanitizeIdPart(value) {
  return String(value || "unclassified").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "unclassified";
}

function sourcePolarityMatchesText(fragment, slideText) {
  if (fragment.evidence_type === "hypothesis" || fragment.polarity === "pending") {
    return /待验证|假设|待确认|需验证/.test(slideText);
  }
  if (fragment.polarity === "negative") {
    return /无|没有|尚未|未确定|缺少|待确认|待补|证据边界|不足/.test(slideText);
  }
  return fragment.polarity !== "unknown"
    || fragment.field === "brand"
    || fragment.field === "project_background"
    || fragment.field === "required_decisions";
}

export function fragmentCoveredByText(fragment, text) {
  if (!fragment) return false;
  if (fragment.semantic_tags.some(tag => semanticTagCovered(tag, text))) return true;
  return semanticOverlap(fragment.excerpt, text) >= 0.34;
}

export function semanticTagCovered(tag, text) {
  const source = String(text || "");
  const patterns = {
    brand: /品牌|项目|企业/,
    market_entry: /进入|进军|拓展|布局|市场进入/,
    china_market: /中国市场|国内市场|中国区/,
    pre_launch: /尚未.*进入|未正式.*进入|筹备阶段|进入前|可行性验证阶段|市场验证阶段/,
    project_stage: /(?:当前|项目|市场).*(?:阶段|试点|筹备|验证|尚未运营|未正式运营)|(?:试点|筹备)(?:阶段|项目)?|尚未.*(?:运营|上线|投产|落地|完成.*(?:推广|部署|实施|建设))/,
    no_customer_data: /无真实.*(?:客户|销量|订单|试驾|咨询|转化).*数据|尚无真实|缺少真实.*数据|缺乏.*真实.*(?:数据|证据)|尚未形成.*(?:数据|证据)|证据基础.*待补/,
    undetermined_strategy: /(?:定价|车型|渠道|城市|目标|范围|对象|企业|伙伴).*(?:未确定|待确认|尚未)|尚未确定.*(?:定价|车型|渠道|城市|目标|范围|对象|企业|伙伴)|关键变量.*待确认/,
    low_cost_validation: /低成本验证|小范围验证|试点验证|轻量.*试点|验证后再.*投入|先.*(?:试点|验证).*(?:再|后).*(?:投入|扩展|扩大)/,
    approval_resources: /(?:董事会|管理层).*(?:批准|审批|预算|资源)|(?:批准|审批|预算|资源).*(?:董事会|管理层)|(?:预算|资源).*(?:已落实|未落实|待确认|尚未确定)/,
    board_decision: /董事会.*(?:决策|确认)|继续.*调整.*停止/,
    evidence_gap: /资料缺口|待补充|尚未确定|缺少|暂无/,
    hypothesis: /待验证|假设|需验证/
  };
  return patterns[tag]?.test(source) || false;
}

export function normalizeMultiline(value) {
  return String(value ?? "")
    .replace(/\r\n?|\u2028|\u2029/g, "\n")
    .split("\n")
    .map(line => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function splitMaterialLines(value) {
  return normalizeMultiline(value).split(/\n+/).flatMap(line => {
    if (/^[^：:]{1,16}[：:]\s*[^，,。；;]+(?:[；;]\s*[^；;]+)+$/.test(line)) return [line];
    return line.split(/(?<=[。；;])\s*/).filter(Boolean);
  });
}

function cleanFragment(value) {
  return String(value || "")
    .replace(/^\s*(?:[-*•·]|\d{1,2}[.、．)]|[一二三四五六七八九十]+[、.．)])\s*/, "")
    .replace(/^\s*[【\[]|[】\]]\s*$/g, "")
    .trim();
}

function stripMaterialPrefix(value) {
  return String(value || "")
    .replace(/^(?:项目背景|业务背景|研究背景|项目名称|企业名称|品牌|品牌名称|地点|项目地点|面积|项目面积|规划面积|产业方向|设施|园区设施|服务|服务能力|建设时间|建成时间|时间|明确数据|数据|阶段状态|已有资料|现有资料|已提供资料|补充资料|补充信息|资料缺口|待补充资料|管理层重点问题|董事会重点问题|决策事项|待确认事项|待验证假设)\s*[：:]\s*/, "")
    .trim();
}

function parseCompoundHeading(line) {
  const normalized = line.replace(/^[【\[]|[】\]]$/g, "").trim();
  if (!normalized.includes("｜")) return null;
  const parts = normalized.split("｜").map(item => item.trim());
  const hasKnownPart = parts.some(part => MATERIAL_IDENTITY_ALIASES.has(part) || MATERIAL_CATEGORY_ALIASES.has(part));
  if (parts.length !== 2 || !parts[0] || !parts[1]) return hasKnownPart ? { invalid: true } : null;
  const identity = MATERIAL_IDENTITY_ALIASES.get(parts[0]);
  const category = MATERIAL_CATEGORY_ALIASES.get(parts[1]);
  const categoryDetail = MATERIAL_CATEGORY_DETAILS.get(parts[1]) || category || MATERIAL_CATEGORY_UNCLASSIFIED;
  if (!identity || !category) return identity || category ? { invalid: true } : null;
  return {
    invalid: false,
    field: identity.field,
    assertionType: identity.assertionType,
    category,
    categoryDetail
  };
}

function parseHeading(line) {
  const normalized = line.replace(/^[【\[]|[】\]]$/g, "").trim();
  const match = normalized.match(/^([^：:]{2,18})(?:[：:]\s*(.*))?$/);
  if (!match) return null;
  if (match[2]?.trim()) return null;
  const heading = match[1].replace(/^\d+[.、．)]\s*|^[一二三四五六七八九十]+[、.．)]\s*/, "").trim();
  const entry = SECTION_ALIASES.find(([, pattern]) => pattern.test(heading));
  return entry ? { field: entry[0], content: "" } : null;
}

function isUnknownSectionHeading(line) {
  const normalized = line.replace(/^[【\[]|[】\]]$/g, "").trim();
  if (!normalized || normalized.length > 24) return false;
  const colon = normalized.match(/^([^：:]{2,18})[：:]?\s*$/);
  if (!colon) return false;
  const label = colon[1].replace(/^\d+[.、．)]\s*|^[一二三四五六七八九十]+[、.．)]\s*/, "").trim();
  if (!label || SECTION_ALIASES.some(([, pattern]) => pattern.test(label))) return false;
  return /(?:事实|事项|信息|资料|缺口|问题|背景|假设|建议|风险|结论|说明|清单|目标|范围)$/.test(label);
}

function classifyFragment(line) {
  const explicit = classifyExplicitFragment(line);
  if (explicit) return explicit;
  if (/董事会.*(?:决策|确认)|决策事项|继续.*调整.*停止/.test(line)) return "required_decisions";
  if (/管理层.*(?:重点|核心)?问题|董事会.*(?:重点|核心)?问题/.test(line)) return "management_questions";
  if (/待验证|假设/.test(line)) return "hypotheses";
  if (/资料缺口|待补充|缺少|尚未确定|未确定|暂无/.test(line)) return "explicit_gaps";
  if (/已提供|已有.*资料|现有.*资料|具备.*资料/.test(line)) return "provided_materials";
  if (/^(?:补充资料|补充信息|补充说明)\s*[：:]/.test(line)) return "supplemental";
  if (/项目背景|计划.*(?:进入|建设|实施|推出)|市场进入|筹备|^(?:欧洲|亚洲|国内|海外|国际).*(?:品牌|企业)/.test(line)) return "project_background";
  if (/尚未|无真实|没有|已确认|当前|希望.*验证|验证.*(?:投入|决策)/.test(line)) return "confirmed_facts";
  return "";
}

function classifyExplicitFragment(line) {
  if (/^(?:品牌|品牌名称)\s*[：:]/i.test(line)) return "brand";
  if (/^(?:已确认事实|确认事实|已知事实|现状信息)\s*[：:]\s*\S+/.test(line)) return "confirmed_facts";
  if (/^(?:项目名称|企业名称|地点|项目地点|面积|项目面积|规划面积|产业方向|设施|园区设施|服务|服务能力|建设时间|建成时间|时间|明确数据|数据)\s*[：:]\s*\S+/.test(line)) return "confirmed_facts";
  if (/^(?:决策事项|决策要求|待决策事项|管理层决策事项|董事会决策事项)\s*[：:]\s*\S+/.test(line)) return "required_decisions";
  if (/^(?:汇报对象|面向对象|汇报给)\s*[：:]/.test(line)) return "audience";
  return "";
}

function detectPolarity(excerpt, field) {
  if (/尚未确定是否|无法确定|不确定是否/.test(excerpt)) return "unknown";
  if (extractReliableCompanyName(excerpt)) return "positive";
  if (/待补充|待提供|待验证|待确认|需补充|需确认/.test(excerpt)) return "pending";
  if (/没有|无真实|尚无|暂无|未提供|缺少|尚未|未确定|不存在/.test(excerpt)) return "negative";
  if (field === "confirmed_facts" || field === "provided_materials" || /已提供|已有|现有|具备|已确认/.test(excerpt)) return "positive";
  return "unknown";
}

function evidenceTypeFor(polarity, field) {
  if (field === "hypotheses" || field === "pending_items") return "hypothesis";
  if (field === "required_decisions") return "decision_requirement";
  if (polarity === "positive") return "provided_source";
  if (polarity === "negative") return "confirmed_absence";
  if (polarity === "pending") return "material_gap";
  return "context_only";
}

function isUncertainExpression(excerpt) {
  return /尚未确定是否|无法确定|不确定是否|是否.*(?:待确认|待定|未知)|未知|不明确/.test(excerpt);
}

function matchMaterialTypes(excerpt, polarity, field) {
  if (polarity !== "positive" && field !== "provided_materials") return [];
  return MATERIAL_TYPES.filter(([, pattern]) => pattern.test(excerpt)).map(([id]) => id);
}

function isPositiveEvidenceFragment(fragment) {
  return fragment.polarity === "positive"
    && fragment.material_type_ids.length > 0
    && fragment.field !== "explicit_gaps";
}

function semanticTagsFor(excerpt, field) {
  const tags = [];
  if (field === "brand" || /^(?:项目名称|企业名称|品牌|品牌名称)\s*[：:]/.test(excerpt) || extractReliableCompanyName(excerpt)) tags.push("brand");
  if (/进入|进军|拓展|布局/.test(excerpt) && /市场|区域|国家/.test(excerpt)) tags.push("market_entry");
  if (/中国市场|中国区|国内市场/.test(excerpt)) tags.push("china_market");
  if (/尚未.*进入|未正式.*进入|筹备阶段|进入前/.test(excerpt)) tags.push("pre_launch");
  if (/(?:当前|项目|市场).*(?:阶段|试点|筹备|验证|尚未运营|未正式运营)|(?:试点|筹备)(?:阶段|项目)?|尚未.*(?:运营|上线|投产|落地|完成.*(?:推广|部署|实施|建设))/.test(excerpt)) tags.push("project_stage");
  if (/(?:没有|无真实|尚无|暂无).*(?:客户|销量|订单|试驾|咨询|转化).*(?:数据|记录)?/.test(excerpt)) tags.push("no_customer_data");
  if (/(?:定价|车型|渠道|城市|目标|范围|对象|企业|伙伴).*(?:尚未|未确定|待确认)/.test(excerpt) || /尚未确定.*(?:定价|车型|渠道|城市|目标|范围|对象|企业|伙伴)/.test(excerpt)) tags.push("undetermined_strategy");
  if (/低成本.*验证|小范围.*验证|试点.*验证|验证.*再.*投入/.test(excerpt)) tags.push("low_cost_validation");
  if (/(?:董事会|管理层).*(?:批准|审批|预算|资源)|(?:批准|审批|预算|资源).*(?:董事会|管理层)|(?:预算|资源).*(?:已落实|未落实|待确认|尚未确定)/.test(excerpt)) tags.push("approval_resources");
  if (field === "required_decisions" || /董事会.*(?:决策|确认)/.test(excerpt)) tags.push("board_decision");
  if (field === "explicit_gaps") tags.push("evidence_gap");
  if (field === "hypotheses") tags.push("hypothesis");
  return [...new Set(tags)];
}

function extractReliableCompanyName(excerpt) {
  const text = String(excerpt || "").trim();
  const explicit = text.match(/^(?:企业名称|公司名称|品牌名称|品牌|项目名称)\s*[：:]\s*([^，,。；;\n]{2,30})/);
  if (explicit) return explicit[1].trim();
  const match = text.match(/^([\u4e00-\u9fa5A-Za-z0-9（）()·]{2,24}(?:科技|智能|智能科技|技术|设备|制造|股份|集团|有限公司|公司))是一家/);
  if (!match) return "";
  const name = match[1].trim();
  if (/^(工业|制造|包装|软件|AI|人工智能|技术服务|设备制造|消费品牌|企业|公司)$/.test(name)) return "";
  return name;
}

function buildCriticalAnchors({ brand, fragments }) {
  const anchors = [];
  if (brand?.value) anchors.push({ id: "brand", label: "品牌", value: brand.value, source_ids: [brand.source_id], semantic_tags: ["brand"] });
  const grouped = new Map();
  for (const fragment of fragments) {
    for (const tag of fragment.semantic_tags) {
      if (["evidence_gap", "hypothesis", "brand"].includes(tag)) continue;
      if (!grouped.has(tag)) grouped.set(tag, []);
      grouped.get(tag).push(fragment);
    }
  }
  for (const [tag, sources] of grouped) {
    anchors.push({ id: tag, label: tag, value: sources[0].excerpt, source_ids: sources.map(item => item.source_id), semantic_tags: [tag] });
  }
  return anchors;
}

function semanticOverlap(left, right) {
  const leftTerms = significantTerms(left);
  const rightText = normalizeForMatch(right);
  if (!leftTerms.length) return 0;
  return leftTerms.filter(term => rightText.includes(term)).length / leftTerms.length;
}

function significantTerms(value) {
  const normalized = normalizeForMatch(value);
  const latin = normalized.match(/[a-z][a-z0-9-]{2,}/gi) || [];
  const chunks = String(value || "").split(/[\s，,。；;：:、（）()\[\]【】/]+/)
    .map(item => normalizeForMatch(item))
    .filter(item => item.length >= 2 && !/^(当前|已经|尚未|进行|相关|资料|情况|需要|明确|公司)$/.test(item))
    .map(item => item.length > 8 ? item.slice(0, 8) : item);
  return [...new Set([...latin.map(normalizeForMatch), ...chunks])].slice(0, 8);
}

function normalizeForMatch(value) {
  return String(value || "").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}
