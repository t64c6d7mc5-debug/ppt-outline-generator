const STRATEGIES = {
  unspecified: {
    id: "unspecified",
    label: "未指定",
    maxContentPoints: 5,
    maxAiImages: Number.POSITIVE_INFINITY,
    visualComplexity: "current",
    coverNote: ""
  },
  tonight: {
    id: "tonight",
    label: "今晚",
    maxContentPoints: 3,
    maxAiImages: 0,
    visualComplexity: "fast",
    coverNote: "制作策略：快速交付版优先三条核心信息与 PPT 原生卡片、图表和时间轴"
  },
  tomorrow_morning: {
    id: "tomorrow_morning",
    label: "明天上午",
    maxContentPoints: 4,
    maxAiImages: 1,
    visualComplexity: "standard",
    coverNote: "制作策略：保留完整核心结构，以标准组件为主，封面最多使用一张 AI 主视觉"
  },
  three_days: {
    id: "three_days",
    label: "三天内",
    maxContentPoints: 5,
    maxAiImages: 2,
    visualComplexity: "balanced",
    coverNote: "制作策略：在核心结构上增加细分画像与决策路径，允许组合图表和少量定制视觉"
  },
  no_rush: {
    id: "no_rush",
    label: "不急",
    maxContentPoints: 5,
    maxAiImages: 2,
    visualComplexity: "research",
    coverNote: "制作策略：研究型版本增加交叉分析、证据校验、典型画像与多轮验证方法"
  }
};

export function resolveDeliveryStrategy(value) {
  const deadline = String(value ?? "").replace(/\s+/g, "").trim();
  if (!deadline || deadline === "未指定" || deadline === "auto") return STRATEGIES.unspecified;
  if (/今晚|今天晚上|当晚/.test(deadline)) return STRATEGIES.tonight;
  if (/明天上午|明早|次日上午/.test(deadline)) return STRATEGIES.tomorrow_morning;
  if (/三天内|3天内|三日内|3日内/.test(deadline)) return STRATEGIES.three_days;
  if (/不急|不限时间|时间充足/.test(deadline)) return STRATEGIES.no_rush;
  return STRATEGIES.unspecified;
}

export function resolveDeliveryPageCount({ value, requirement, type, strategy }) {
  const provided = value !== undefined && value !== null && String(value).trim() !== "";
  const explicit = provided ? Number(value) : Number.NaN;
  if (provided && Number.isFinite(explicit)) return clamp(explicit);

  const digitMatch = String(requirement || "").match(/(\d{1,2})\s*页/);
  if (digitMatch) return clamp(Number(digitMatch[1]));

  const chineseNumbers = { "六": 6, "八": 8, "十": 10, "十二": 12 };
  const chineseMatch = String(requirement || "").match(/(十二|十|八|六)\s*页/);
  if (chineseMatch) return chineseNumbers[chineseMatch[1]];

  if (strategy.id === "tonight") return 6;
  if (strategy.id === "tomorrow_morning") return 8;
  if (strategy.id === "three_days") return type.extensions.length ? 10 : Math.min(10, type.base.length + 1);
  if (strategy.id === "no_rush") return type.extensions.length ? 12 : Math.min(12, type.base.length + 2);
  return 8;
}

export function simplifyVisualForDelivery(visual, sectionId, strategy) {
  const source = { ...visual };
  if (strategy.visualComplexity !== "fast") return source;
  if (sectionId === "cover") {
    return {
      kind: "fast-cover",
      description: "左侧标题与三项要点，右侧使用品牌色几何色块和行业图标",
      scene: "快速交付封面版式",
      ai: false
    };
  }
  return {
    kind: `fast-${sectionId}`,
    description: `${fastVisualName(source)}，只保留一个主要阅读动作`,
    scene: `快速交付${sectionId}版式`,
    ai: false
  };
}

function fastVisualName(visual) {
  if (/时间轴|路线图|阶段/.test(visual.description)) return "单行三阶段时间轴";
  if (/流程|旅程|路径/.test(visual.description)) return "单行步骤流程图";
  if (/矩阵|交叉/.test(visual.description)) return "四象限原生矩阵";
  if (/图表|柱状|条形|分布/.test(visual.description)) return "单一原生条形图";
  return "三栏 PPT 原生信息卡片";
}

function clamp(value) {
  return Math.min(30, Math.max(3, Math.round(value)));
}
