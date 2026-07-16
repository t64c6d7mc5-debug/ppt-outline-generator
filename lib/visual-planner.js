const GLOBAL_STYLES = {
  "科技感": {
    palette: "深灰底，电光蓝与青绿色作为强调色",
    typography: "现代无衬线字体，数字与结论使用较高字重",
    background: "克制的深色网格或纯色背景",
    chart_style: "细线条、低装饰、统一坐标与图例",
    icon_system: "单线科技图标",
    image_tone: "真实、冷静、避免过度未来化",
    spacing: "清晰网格与充足页边距",
    density: "中等信息密度，一页一个阅读任务"
  },
  "商务正式": {
    palette: "深蓝、灰白与少量金色强调",
    typography: "稳健无衬线字体，结论先行",
    background: "白底或深蓝标题区",
    chart_style: "标准商务图表与清晰数据口径",
    icon_system: "简洁线性商务图标",
    image_tone: "真实专业、避免夸张滤镜",
    spacing: "严格网格和稳定留白",
    density: "中等偏高，但保持层级清楚"
  },
  "年轻活力": {
    palette: "奶油白底，亮橙、青绿和莓果色点缀",
    typography: "亲和圆润的无衬线字体",
    background: "明亮浅色背景",
    chart_style: "圆角卡片与轻量图表",
    icon_system: "轻快扁平图标",
    image_tone: "自然生活方式与真实消费场景",
    spacing: "较大留白与清晰卡片间距",
    density: "中低密度"
  },
  "人文东方": {
    palette: "宣纸白、墨黑、黛青与赭石",
    typography: "标题可使用克制宋体，正文保持高可读性",
    background: "留白充足的纸张质感",
    chart_style: "时间轴、证据板与作品图注统一",
    icon_system: "极简线性文化符号",
    image_tone: "尊重史料、作品原貌与版权边界",
    spacing: "长卷式节奏与宽页边距",
    density: "中低密度"
  },
  "简洁": {
    palette: "白灰底与单一品牌强调色",
    typography: "清晰无衬线字体",
    background: "纯色浅背景",
    chart_style: "轻量图表与短标签",
    icon_system: "统一单色图标",
    image_tone: "自然、克制",
    spacing: "大留白与规则网格",
    density: "低至中等密度"
  }
};

import { isPhysicalProductContext, isSoftwareProductContext } from "./product-form.js";

const STRUCTURAL_VISUAL_TYPES = new Set([
  "funnel", "bar_chart", "map", "heatmap", "mindmap", "matrix", "dashboard",
  "timeline", "roadmap", "architecture", "journey"
]);

const TEMPLATE_TOKEN_TYPES = new Map([
  ["cover", "cover"],
  ["roadmap", "roadmap"],
  ["heatmap", "heatmap"],
  ["mindmap", "mindmap"],
  ["map", "map"],
  ["persona", "persona_cards"],
  ["funnel", "funnel"],
  ["journey", "journey"],
  ["timeline", "timeline"],
  ["architecture", "architecture"],
  ["matrix", "matrix"],
  ["dashboard", "dashboard"],
  ["bar", "bar_chart"],
  ["chart", "bar_chart"],
  ["storyboard", "storyboard"],
  ["photo", "photo"]
]);

export function buildGlobalVisualStyle(context) {
  const base = GLOBAL_STYLES[context.style] || GLOBAL_STYLES["简洁"];
  return {
    ...base,
    reference_style: context.visualPreferences.referenceStyle || "",
    delivery_adjustment: context.delivery.visualComplexity
  };
}

export function planSlideVisual(visual, context, sectionId, visualBudget, semantics = {}) {
  let visualType = resolveVisualType({
    kind: visual.kind,
    description: visual.description,
    sectionId,
    ...semantics
  });
  if (sectionId === "needsJourney" && /决策路径|阶段|旅程|触点/.test(`${semantics.title || ""} ${semantics.keyMessage || ""} ${semantics.content || ""}`)) visualType = "journey";
  if (visualType === "map" && !hasPositiveGeographicEvidence(context)) visualType = "matrix";
  const dataVisual = STRUCTURAL_VISUAL_TYPES.has(visualType);
  const deliveryAllowsAi = visualBudget.aiImages < context.delivery.maxAiImages;
  const aiAllowed = Boolean(visual.ai && !dataVisual && context.visualPreferences.includeImages && deliveryAllowsAi);
  if (aiAllowed) visualBudget.aiImages += 1;

  let schema = buildVisualSchema(visualType, visual.kind, visual.description, aiAllowed, semantics);
  schema = applyProductIntroVisualPolicy(schema, context, sectionId);
  if (context.type?.id === "project_plan" && context.industry?.id === "park_investment" && sectionId === "architecture") {
    schema = {
      ...schema,
      layout: "招商内容、目标触达、转化推进、运营协同四层转化体系",
      primary_elements: ["内容口径", "目标触达", "到访洽谈", "入驻推进"],
      reading_direction: "自上而下"
    };
  }

  const visualSuggestion = `${schema.layout}；主视觉采用${schema.primary_elements.join("、")}；按${schema.reading_direction}阅读。`;
  const imagePrompt = buildImagePrompt(schema, visual, context);
  return { visual_spec: schema, visual_suggestion: visualSuggestion, image_prompt: imagePrompt };
}

function applyProductIntroVisualPolicy(schema, context, sectionId) {
  if (context.type?.id !== "product_intro") return schema;
  if (!["delivery_and_collaboration", "service_process"].includes(sectionId)) return schema;
  const software = isSoftwareProductContext(context);
  const physical = isPhysicalProductContext(context);
  const primaryElements = software && sectionId === "delivery_and_collaboration"
    ? ["部署方式", "账号与配置", "培训材料", "验收记录"]
    : software
      ? ["需求调研", "配置任务", "试运行", "上线验收"]
      : physical
    ? ["订单阶段", "样品确认", "生产或处理节点", "验收与交付依赖"]
    : ["阶段节点", "关键任务", "确认动作", "交付或启用依赖"];
  return {
    ...schema,
    layout: software && sectionId === "delivery_and_collaboration"
      ? "部署架构与上线交付路线图"
      : software
        ? "实施里程碑与上线流程图"
        : sectionId === "delivery_and_collaboration"
      ? "横向交付阶段路线图并配置确认节点"
      : schema.layout,
    primary_elements: primaryElements,
    reading_direction: "从左到右"
  };
}

export function validateVisualSpec(slide, context = {}) {
  const issues = [];
  const spec = slide.visual_spec || {};
  const text = `${slide.visual_suggestion || ""} ${spec.primary_elements?.join(" ") || ""}`;
  if (!spec.visual_type || !spec.layout || !Array.isArray(spec.primary_elements)) issues.push("视觉 schema 不完整");
  let expectedType = resolveVisualType({
    kind: spec.template_id,
    description: text,
    sectionId: slide.slide_type,
    role: slide.role,
    title: slide.title,
    keyMessage: slide.key_message,
    content: slide.content
  });
  if (slide.slide_type === "needsJourney" && /决策路径|阶段|旅程|触点/.test(`${slide.title || ""} ${slide.key_message || ""} ${slide.content || ""}`)) expectedType = "journey";
  if (expectedType === "map" && !hasPositiveGeographicEvidence(context)) expectedType = "matrix";
  if (spec.visual_type && spec.visual_type !== expectedType) {
    issues.push(`视觉类型 ${spec.visual_type} 与页面语义不匹配，应为 ${expectedType}`);
  }
  if (spec.visual_type === "map" && !hasGeographicComparison(slide)) issues.push("非地域比较页面错误使用地图");
  if (spec.visual_type === "map" && !hasPositiveGeographicEvidence(context)) issues.push("缺少肯定性地域数据来源却使用地图");
  if (slide.slide_type === "geography" && !hasPositiveGeographicEvidence(context) && /分布|热力|格局|覆盖现状/.test(slide.title || "")) {
    issues.push("缺少肯定性地域数据时标题仍暗示已有地域结论");
  }
  if (spec.visual_type === "persona_cards") {
    const labels = Array.isArray(spec.entity_labels) ? spec.entity_labels.filter(Boolean) : [];
    if (!Number.isInteger(spec.entity_count) || spec.entity_count < 1) issues.push("画像卡缺少结构化视觉实体数量");
    if (labels.length !== spec.entity_count) issues.push(`画像视觉实体 ${spec.entity_count} 与可追溯实体标签 ${labels.length} 不一致`);
  }
  if (spec.visual_type === "map" && /中心层级|模块连线|系统架构/.test(text)) issues.push("地图页混入架构图语义");
  if (spec.visual_type === "funnel" && /时间轴|阶段节点/.test(text)) issues.push("漏斗页混入时间轴语义");
  if (spec.visual_type === "persona_cards" && /仪表盘|坐标轴/.test(text)) issues.push("画像卡混入仪表盘语义");
  if (spec.visual_type === "roadmap" && /人物拼贴|画像头像/.test(text)) issues.push("路线图混入画像语义");
  if (STRUCTURAL_VISUAL_TYPES.has(spec.visual_type) && spec.ai_allowed) {
    issues.push("数据或结构页面错误允许 AI 生图");
  }
  return issues;
}

export function resolveVisualType({ kind = "", description = "", sectionId = "", role = "", title = "", keyMessage = "", content = "" } = {}) {
  const templateType = typeFromTemplateId(kind);
  const semanticText = `${description} ${sectionId} ${title} ${keyMessage} ${content}`.toLowerCase();
  let candidate = templateType || typeFromSemanticText(semanticText);

  if (candidate === "map" && !hasGeographicComparison({ sectionId, role, title, key_message: keyMessage, content, visual_suggestion: description })) {
    candidate = fallbackTypeForSemanticPage({ role, sectionId, text: semanticText });
  }
  if (["recommendation", "action"].includes(role) && candidate === "map" && !hasGeographicComparison({ sectionId, role, title, key_message: keyMessage, content })) {
    candidate = fallbackTypeForSemanticPage({ role, sectionId, text: semanticText });
  }
  return candidate || "native_cards";
}

export function repairSlideVisual(slide, context) {
  let expectedType = resolveVisualType({
    kind: slide.visual_spec?.template_id,
    description: slide.visual_suggestion,
    sectionId: slide.slide_type,
    role: slide.role,
    title: slide.title,
    keyMessage: slide.key_message,
    content: slide.content
  });
  if (slide.slide_type === "needsJourney" && /决策路径|阶段|旅程|触点/.test(`${slide.title || ""} ${slide.key_message || ""} ${slide.content || ""}`)) expectedType = "journey";
  if (expectedType === "map" && !hasPositiveGeographicEvidence(context)) expectedType = "matrix";
  const description = slide.visual_spec?.primary_elements?.join("、") || slide.visual_suggestion;
  const entityLabels = extractEntityLabels(slide);
  const schema = buildVisualSchema(expectedType, slide.visual_spec?.template_id || slide.slide_type, description, false, {
    entityCount: entityLabels.length,
    entityLabels
  });
  return {
    visual_spec: schema,
    visual_suggestion: `${schema.layout}；主视觉采用${schema.primary_elements.join("、")}；按${schema.reading_direction}阅读。`,
    image_prompt: `不使用 AI 生图；按“${schema.layout}”制作 PPT 原生视觉。${schema.data_placeholder_strategy}。`
  };
}

export function hasGeographicComparison(slide = {}) {
  if (slide.sectionId === "geography" || slide.slide_type === "geography") return true;
  const text = `${slide.title || ""} ${slide.key_message || slide.keyMessage || ""} ${slide.content || ""} ${slide.visual_suggestion || ""}`;
  const hasGeography = /地域|区域|城市|省份|地理|区县|国家|市场分布|空间分布/.test(text);
  const hasComparison = /比较|对比|分级|分布|差异|层级|热度|覆盖|占位|图例/.test(text);
  return hasGeography && hasComparison;
}

function typeFromTemplateId(kind) {
  const tokens = String(kind || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  for (const token of tokens) {
    if (TEMPLATE_TOKEN_TYPES.has(token)) return TEMPLATE_TOKEN_TYPES.get(token);
  }
  return "";
}

function typeFromSemanticText(source) {
  if (/封面/.test(source)) return "cover";
  if (/路线图|排期|阶段计划/.test(source)) return "roadmap";
  if (/热力图/.test(source)) return "heatmap";
  if (/思维导图/.test(source)) return "mindmap";
  if (/地域地图|区域地图|城市地图|地理地图/.test(source)) return "map";
  if (/画像|分群卡/.test(source)) return "persona_cards";
  if (/漏斗|证据分层/.test(source)) return "funnel";
  if (/旅程|决策路径/.test(source)) return "journey";
  if (/时间轴|里程碑/.test(source)) return "timeline";
  if (/架构|目标树|指标树/.test(source)) return "architecture";
  if (/矩阵|雷达|轮盘|画布/.test(source)) return "matrix";
  if (/仪表板/.test(source)) return "dashboard";
  if (/条形|柱状|图表/.test(source)) return "bar_chart";
  if (/故事板|场景组图/.test(source)) return "storyboard";
  if (/流程|触点|路径/.test(source)) return "journey";
  if (/摄影|实景主图|场景照片/.test(source)) return "photo";
  return "native_cards";
}

function fallbackTypeForSemanticPage({ role, sectionId, text }) {
  if (/路线|阶段|下一步|行动|落地|计划/.test(text) || role === "action") return "roadmap";
  if (/优先级|比较|对比|匹配|建议|策略/.test(text) || role === "recommendation") return "matrix";
  if (/流程|触点|旅程|渠道|路径/.test(text)) return "journey";
  if (sectionId === "geography") return "map";
  return "native_cards";
}

function buildVisualSchema(visualType, templateId, description, aiAllowed, semantics = {}) {
  const dataVisual = STRUCTURAL_VISUAL_TYPES.has(visualType);
  const schema = {
    visual_type: visualType,
    template_id: templateId,
    layout: layoutFor(visualType, semantics.entityCount),
    primary_elements: elementsFor(visualType, description),
    reading_direction: readingDirectionFor(visualType),
    data_placeholder_strategy: dataVisual ? "使用字段名、口径与待补数据占位，不绘制虚构数值" : "不需要数据占位",
    ai_allowed: Boolean(aiAllowed),
    fallback_visual: fallbackFor(visualType)
  };
  if (visualType === "persona_cards") {
    schema.entity_count = Number(semantics.entityCount) || 0;
    schema.entity_labels = [...(semantics.entityLabels || [])];
  }
  return schema;
}

function layoutFor(type, entityCount = 0) {
  return ({
    cover: "左侧标题与副标题留白，右侧单一行业主视觉",
    map: "左侧区域地图，右侧图例与区域说明",
    heatmap: "二维热力网格配清晰图例与口径说明",
    mindmap: "中心主题向外展开的分支结构",
    persona_cards: `${entityCount || 1}张等宽画像卡片，按可追溯分群对象自适应排列`,
    funnel: "自上而下的分层漏斗",
    journey: "从左到右的节点路径",
    roadmap: "横向阶段路线图并配置责任泳道",
    timeline: "单轴时间线与证据节点",
    architecture: "自上而下的分层架构",
    matrix: "二维矩阵或四象限",
    dashboard: "主图表加两块辅助信息区",
    bar_chart: "单一坐标轴的条形或柱状图",
    storyboard: "横向三格场景故事板",
    photo: "一张主图配短结论",
    native_cards: "三栏原生信息卡片"
  })[type];
}

function extractEntityLabels(slide) {
  const sources = (slide.evidence_sources || []).filter(source => source.field === "hypotheses");
  return [...new Set(sources.map(source => {
    const value = source.excerpt.replace(/^待验证假设\s*[：:]?/, "").trim();
    return value.match(/^([^：:，,。；;]{2,28}?(?:型(?:首购|增购|换购)?用户|型人群|类人群|用户群|客户群|客群|目标企业|商户|家庭))/)?.[1] || value.slice(0, 20);
  }).filter(Boolean))];
}

function elementsFor(type, description) {
  const base = {
    cover: ["标题区", "副标题区", "单一行业主视觉"],
    map: ["区域轮廓", "分级图例", "样本或资料状态标签"],
    heatmap: ["横向分类", "纵向分类", "热度图例", "数据口径"],
    mindmap: ["中心主题", "一级分支", "二级要点", "关系连线"],
    persona_cards: ["角色名称", "核心任务", "关注点", "障碍", "待验证标记"],
    funnel: ["来源层级", "字段口径", "证据状态"],
    journey: ["阶段节点", "关键任务", "阻碍", "验证资料"],
    roadmap: ["阶段", "责任主体", "输入", "交付物"],
    timeline: ["时期节点", "事件或作品", "证据出处"],
    architecture: ["层级", "模块", "输入输出关系"],
    matrix: ["横轴", "纵轴", "分类标签", "证据状态"],
    dashboard: ["主指标框架", "分类视图", "口径说明"],
    bar_chart: ["分类轴", "指标占位", "数据口径"],
    storyboard: ["场景", "任务", "触发条件", "障碍"],
    photo: ["真实场景图", "短标题", "价值说明"],
    native_cards: ["短标题", "图标", "三条核心信息"]
  }[type];
  return base || [description];
}

function readingDirectionFor(type) {
  if (["funnel", "architecture"].includes(type)) return "自上而下";
  if (["matrix", "dashboard", "map", "heatmap", "mindmap"].includes(type)) return "先主图、后图例与说明";
  return "从左到右";
}

function fallbackFor(type) {
  if (type === "cover" || type === "photo" || type === "storyboard") return "使用品牌色几何形状和行业图标的 PPT 原生版式";
  return `使用 PPT 原生${layoutFor(type)}`;
}

function buildImagePrompt(schema, visual, context) {
  if (!schema.ai_allowed) {
    return `不使用 AI 生图；按“${schema.layout}”制作 PPT 原生视觉。${schema.data_placeholder_strategy}。`;
  }
  const personaRule = schema.visual_type === "persona_cards" ? "人物仅作角色识别，不作为用户属性证据，" : "";
  return `${context.topic}，${visual.scene || visual.description}，${context.style}，${personaRule}真实自然，16:9 横版，无文字，无水印，无数据界面，不生成虚假图表`;
}
import { hasPositiveGeographicEvidence } from "./material-context.js";
