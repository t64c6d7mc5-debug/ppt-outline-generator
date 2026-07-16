import { buildProfessionalPlanningStageRequest, buildProfessionalRequest, buildSimpleRequest, normalizeClientMaterials } from "./request-builders.js";

const SIMPLE_MODE = "simple";
const PROFESSIONAL_MODE = "professional";
const SIMPLE_MATERIALS_WITH_DETAILS = "有文字资料 / 图片 / 文件，需要整理";
const SIMPLE_NEXT_STEP_VISIBLE_LIMIT = 3;
const MATERIAL_TEMPLATE_SEPARATOR = "｜";
const SIMPLE_MATERIAL_TEMPLATE = `普通资料｜企业定位
*

普通资料｜目标客户
*

普通资料｜产品与工艺
*

普通资料｜定制能力
*

普通资料｜应用场景
*

普通资料｜服务流程
*

普通资料｜交付能力
*

待确认内容｜目标客户
*`;
const PROFESSIONAL_MATERIAL_TEMPLATE = `普通资料｜企业定位
*

普通资料｜目标客户
*

普通资料｜产品与工艺
*

普通资料｜定制能力
*

普通资料｜应用场景
*

普通资料｜服务流程
*

普通资料｜交付能力
*

已确认事实｜企业定位
*

已确认事实｜目标客户
*

已确认事实｜产品与工艺
*

已确认事实｜定制能力
*

已确认事实｜应用场景
*

已确认事实｜服务流程
*

已确认事实｜交付能力
*

待确认内容｜目标客户
*`;

const simpleForm = document.getElementById("simpleForm");
const form = document.getElementById("outlineForm");
const cards = document.getElementById("cards");
const emptyState = document.getElementById("emptyState");
const emptyStateTitle = document.getElementById("emptyStateTitle");
const emptyStateText = document.getElementById("emptyStateText");
const resultTitle = document.getElementById("resultTitle");
const resultModeLabel = document.getElementById("resultModeLabel");
const finalStepLabel = document.getElementById("finalStepLabel");
const finalStepTitle = document.getElementById("finalStepTitle");
const copyActions = document.getElementById("copyActions");
const copyBtn = document.getElementById("copyBtn");
const copyClientBtn = document.getElementById("copyClientBtn");
const toast = document.getElementById("toast");
const simpleModeBtn = document.getElementById("simpleModeBtn");
const professionalModeBtn = document.getElementById("professionalModeBtn");
const simpleGenerateBtn = document.getElementById("simpleGenerateBtn");
const simpleResetBtn = document.getElementById("simpleResetBtn");
const simplePageCount = document.getElementById("simplePageCount");
const simpleCustomPageField = document.getElementById("simpleCustomPageField");
const simpleAdvancedSettings = document.getElementById("simpleAdvancedSettings");
const simpleMaterialsRadios = document.querySelectorAll('input[name="simpleMaterials"]');
const questionBtn = document.getElementById("questionBtn");
const summaryBtn = document.getElementById("summaryBtn");
const generateBtn = document.getElementById("generateBtn");
const resetBtn = document.getElementById("resetBtn");
const resultActions = document.getElementById("resultActions");
const expandAllBtn = document.getElementById("expandAllBtn");
const collapseAllBtn = document.getElementById("collapseAllBtn");
const backToTopBtn = document.getElementById("backToTopBtn");
const resultPanel = document.querySelector(".result-panel");
const questionBox = document.getElementById("questionBox");
const summaryBox = document.getElementById("summaryBox");
const followAnswers = document.getElementById("followAnswers");
const professionalResultOnly = document.querySelectorAll(".professional-result-only");
const professionalSections = Array.from(form.querySelectorAll("details.professional-section"));
const professionalMobileQuery = typeof window.matchMedia === "function"
  ? window.matchMedia("(max-width: 680px)")
  : null;
const motionTimers = new WeakMap();

const SIMPLE_CONTENT_STATE_TARGETS = {
  style: { target: "simpleStyle", container: "simpleAdvancedSettings", action: "field" },
  page_count: { target: "simplePageCount", container: "simpleAdvancedSettings", action: "field" },
  audience: { target: "simpleNeed", container: "", action: "field" },
  purpose: { target: "simplePurpose", container: "simpleAdvancedSettings", action: "field" }
};

let activeMode = SIMPLE_MODE;
let professionalGroupsTouched = false;
let latestQuestions = [];
let latestSummary = "";
let currentClientText = "";
let currentProductionText = "";
let resultCache = {
  [SIMPLE_MODE]: { outline: null, clientText: "", productionText: "" },
  [PROFESSIONAL_MODE]: { outline: null, clientText: "", productionText: "" }
};

const legacyUiCopyContract = [
  "PPT 草案已生成，部分信息待确认",
  "生产级 PPT 大纲已生成",
  "已生成基础草案，本地规划模型本次未使用"
];
const legacyQualityFailureDetailsContract = [
  "最终分数：",
  "生产阈值：",
  "未通过的硬门槛：",
  "gate.reason"
];

const bannedTerms = [
  "具体数据",
  "客户案例",
  "营收",
  "市场份额",
  "获奖",
  "合作品牌",
  "投资金额",
  "融资金额",
  "企业数量",
  "转化率",
  "销售额",
  "利润",
  "增长率"
];

const restrictedClaimTerms = [
  "第一",
  "唯一",
  "最强",
  "最好",
  "绝对",
  "保证"
];

const scenarioStructures = {
  "汇报": ["背景", "进展", "关键成果", "问题", "解决方案", "计划", "资源需求"],
  "答辩": ["研究背景", "目标", "方法", "过程", "结果", "总结"],
  "商业计划": ["市场机会", "痛点", "解决方案", "商业模式", "竞争优势", "落地计划"],
  "产品介绍": ["用户痛点", "产品定位", "核心功能", "使用场景", "价值总结"],
  "课程分享": ["问题引入", "知识框架", "案例解释", "练习互动", "总结复盘"]
};

const productIntroStructure = [
  "封面与沟通目标",
  "客户痛点与使用背景",
  "产品定位与适用对象",
  "核心功能模块",
  "典型应用场景",
  "服务流程与交付方式",
  "合作模式与资料准备",
  "总结与下一步沟通"
];

const trainingStructure = [
  "课程目标与学习收益",
  "为什么要学：问题引入",
  "知识框架：工具能做什么",
  "操作流程：从输入到输出",
  "实操练习与常见问题",
  "总结复盘与行动清单"
];

const purposeProfiles = {
  "汇报": {
    focus: "让听众快速判断进展、问题和下一步资源需求",
    closing: "请确认下一阶段优先级、责任人和资源支持。"
  },
  "说服": {
    focus: "先建立共识，再用证据链推动听众接受方案",
    closing: "建议现场确认共识点和待决策事项。"
  },
  "展示": {
    focus: "把亮点、流程和价值呈现得直观易懂",
    closing: "用亮点回顾和后续了解入口收束。"
  },
  "招商": {
    focus: "突出机会、合作价值、落地方式和风险边界",
    closing: "引导潜在合作方进入下一轮沟通或资料交换。"
  },
  "答辩": {
    focus: "证明问题、方法、过程和结论的完整性",
    closing: "用研究贡献和不足展望收束，方便评委提问。"
  },
  "培训": {
    focus: "先建立知识框架，再推动理解、练习和复盘",
    closing: "用练习任务和复盘清单帮助听众带走方法。"
  },
  "销售转化": {
    focus: "从客户痛点推到产品价值，再给明确下一步动作",
    closing: "引导客户咨询、试用、预约演示或确认方案。"
  }
};

const styleProfiles = {
  "正式": {
    tone: "结构严谨、表达稳重、适合汇报/答辩",
    visual: "深蓝、灰白、稳重线条、标准图表",
    wording: "使用结论先行、依据支撑、风险提示、行动建议的表达",
    layout: "标题区清楚，正文采用三段式或左右分栏，图表注明口径"
  },
  "简洁": {
    tone: "短句、少废话、一页一个重点",
    visual: "大留白、单色图标、轻量图表",
    wording: "每页只保留一个判断，正文控制在三条以内",
    layout: "一页一个核心句，使用大标题加三点清单"
  },
  "高级": {
    tone: "商业质感、品牌感、价值表达",
    visual: "深色底、低饱和图片、精致留白、品牌色点缀",
    wording: "先给洞察，再给价值和场景，让页面像提案而不是资料堆叠",
    layout: "封面杂志化，中间页用大图加短文案，关键页可用金句收束"
  },
  "活泼": {
    tone: "互动感、轻松表达、适合课程分享",
    visual: "明亮色彩、插画、互动卡片、对话气泡",
    wording: "多用问题、例子、互动提示，把复杂内容讲得好懂",
    layout: "用卡片、步骤条和问答模块，保留互动区"
  },
  "科技感": {
    tone: "数据化、系统化、流程化、适合 AI/数字化/产品项目",
    visual: "科技蓝、数据网格、流程图、系统架构图",
    wording: "强调系统、流程、指标、能力边界和迭代路径",
    layout: "用架构图、流程闭环、指标看板和路线图表达"
  }
};

const simpleStyleProfiles = {
  "简洁": {
    tone: "表达直接、层级清楚、一页一个重点",
    visual: "白底或浅色底、少量品牌色、清晰图标和简洁图表",
    layout: "采用大标题加三点内容，避免堆字"
  },
  "高级": {
    tone: "商业质感、克制、结论先行",
    visual: "深色或低饱和背景、精致留白、品牌色点缀和高质量图片",
    layout: "封面杂志化，正文页以短结论、图表和大留白组织"
  },
  "科技感": {
    tone: "系统化、数据化、偏理性分析",
    visual: "科技蓝、深色底、线框图、流程图和数据看板",
    layout: "用分析框架、流程闭环和维度矩阵呈现"
  },
  "商务正式": {
    tone: "稳重、清楚、适合汇报和对外沟通",
    visual: "深蓝、灰白、标准图表、正式标题区",
    layout: "采用结论区、依据区和行动区的三段式结构"
  },
  "活泼": {
    tone: "轻松、有互动感、适合课堂或活动",
    visual: "明亮色彩、插画、圆角信息卡和互动提示",
    layout: "用卡片、步骤条和问答模块降低阅读压力"
  },
  "答辩风": {
    tone: "逻辑完整、方法清楚、结论稳妥",
    visual: "学术蓝、白底图表、研究框架和流程图",
    layout: "按背景、目标、方法、结果、总结展开"
  },
  "招商路演风": {
    tone: "机会清楚、价值明确、行动导向",
    visual: "商务深色、项目实景、资源地图和合作路径图",
    layout: "先讲机会和资源，再讲合作价值和落地路径"
  },
  "温暖": {
    tone: "亲和、生活方式感、适合开业和品牌故事",
    visual: "暖色图片、自然光、门店场景、轻量手写感元素",
    layout: "用大图、短文案和场景化卡片营造氛围"
  },
  "视觉冲击强": {
    tone: "标题明确、卖点突出、适合宣传传播",
    visual: "大图、强对比色、醒目标题和活动主视觉",
    layout: "每页保留一个强主标题，辅以少量关键信息"
  }
};

const simplePurposeProfiles = {
  "作业 / 课程汇报": {
    scene: "课程汇报",
    audience: "老师、同学或课程评审",
    goal: "把主题背景、核心观点、分析过程和结论讲清楚",
    closing: "最后一页建议用结论复盘和提问页收束，方便课堂展示或老师点评。"
  },
  "商业汇报": {
    scene: "商业汇报 / 分析报告",
    audience: "客户、老板或业务决策人",
    goal: "帮助听众理解问题、分析维度、核心发现和下一步建议",
    closing: "最后一页建议收束为关键结论、机会点、资料确认和下一步沟通。"
  },
  "产品介绍": {
    scene: "产品 / 服务介绍",
    audience: "潜在客户、合作方或内部评审人",
    goal: "讲清产品定位、客户痛点、核心卖点、应用场景和合作方式",
    closing: "最后一页建议引导客户确认资料、预约沟通或进入下一步合作。"
  },
  "公司介绍": {
    scene: "公司介绍",
    audience: "客户、合作方或招聘/招商沟通对象",
    goal: "说明公司定位、业务范围、核心优势、服务流程和合作价值",
    closing: "最后一页建议留下联系入口和下一步沟通事项。"
  },
  "招商方案": {
    scene: "招商方案",
    audience: "潜在合作方、入驻企业或投资沟通对象",
    goal: "突出项目定位、资源优势、入驻价值、支持政策和合作路径",
    closing: "最后一页建议引导进入资料交换、现场参观或合作细节沟通。"
  },
  "培训课件": {
    scene: "培训课件",
    audience: "员工、学员或培训对象",
    goal: "建立学习目标、知识框架、操作方法、练习任务和行动清单",
    closing: "最后一页建议用复盘、练习任务和行动清单帮助听众带走方法。"
  },
  "答辩展示": {
    scene: "答辩展示",
    audience: "老师、评委或专家",
    goal: "证明背景、目标、方法、过程、结果和结论的完整性",
    closing: "最后一页建议用结论、创新点、不足和后续方向收束。"
  },
  "活动宣传": {
    scene: "活动 / 开业宣传",
    audience: "顾客、朋友圈读者或本地生活受众",
    goal: "把开业第一印象、现场氛围、到店理由、活动玩法和行动入口讲清楚",
    closing: "最后一页建议用到店入口、咨询方式和资料确认清单收束。"
  },
  "其他": {
    scene: "通用展示",
    audience: "目标听众",
    goal: "先把主题讲清楚，再组织重点内容和下一步动作",
    closing: "最后一页建议用总结和下一步确认事项收束。"
  }
};

const simpleStructureTemplates = {
  "作业 / 课程汇报": ["封面", "主题背景", "汇报目标", "核心观点", "分析过程", "案例或资料说明", "结论复盘", "提问与下一步"],
  "商业汇报": ["封面", "背景与问题", "分析维度", "核心发现", "人群 / 市场 / 产品拆解", "机会点与风险", "策略建议", "总结与下一步"],
  "产品介绍": ["封面与产品定位", "客户痛点", "产品 / 服务能力", "核心卖点", "应用场景", "使用流程", "资料准备 / 合作方式", "总结与行动号召"],
  "公司介绍": ["公司定位", "业务范围", "核心优势", "代表产品 / 服务", "服务流程", "合作价值", "适用客户", "联系与下一步"],
  "招商方案": ["项目 / 园区 / 品牌定位", "招商背景", "资源优势", "入驻价值", "服务支持", "合作模式", "落地流程", "下一步沟通"],
  "培训课件": ["课程目标", "为什么要学", "知识框架", "核心方法", "实操练习", "常见问题", "使用边界", "行动清单"],
  "答辩展示": ["封面", "研究背景", "研究目标", "研究方法", "过程与依据", "结果展示", "结论与创新", "不足与展望"],
  "活动宣传": ["封面", "门店定位", "开业亮点", "产品与环境", "目标客群", "活动玩法", "朋友圈传播内容", "行动号召"],
  "其他": ["封面", "背景说明", "核心目标", "重点内容", "执行思路", "资料清单", "风险边界", "总结与下一步"]
};

const audienceProfiles = [
  { pattern: /老板|领导|管理层|高层/, concern: "结论、资源投入、风险和下一步决策", logic: "先结论后依据，减少铺垫，突出决策价值" },
  { pattern: /客户|甲方|采购|合作方/, concern: "价值、可信度、交付方式和合作风险", logic: "先痛点共识，再展示方案与交付路径" },
  { pattern: /评委|导师|专家|老师/, concern: "逻辑完整、方法可靠、过程清楚和创新点", logic: "按背景、目标、方法、结果逐层论证" },
  { pattern: /投资人|投资机构|股东/, concern: "机会、模式、壁垒、增长路径和退出空间", logic: "先市场机会，再讲商业闭环和落地计划" },
  { pattern: /员工|团队|学员|新员工/, concern: "理解成本、操作步骤、练习反馈和行动清单", logic: "先搭框架，再用案例和练习降低理解门槛" }
];

const invalidPlaceholderTerms = [
  String.fromCharCode(30456, 20851, 20449, 24687),
  ["x", "x", "x"].join(""),
  ["内容", "一"].join(""),
  ["内容", "二"].join(""),
  ["待完善", "内容"].join("")
];
const invalidPlaceholderPattern = new RegExp(invalidPlaceholderTerms.map(escapeRegExp).join("|"), "g");

const protectedNormalTerms = [
  "AI 内容生产",
  "AI内容生产",
  "AI 展示屏",
  "AI展示屏",
  "AI 视频",
  "AI视频",
  "AI 能力",
  "AI能力",
  "智能视频",
  "智能工具",
  "数字化展示",
  "企业宣传",
  "自动化内容生产",
  "展示屏",
  "内容生产",
  "视频",
  "能力",
  "AI"
];

const supplementLists = {
  default: "待客户补充：项目背景材料、现有文字资料、关键图片素材、品牌视觉规范",
  data: "待客户补充：数据口径、资料来源、统计范围、图表原始文件",
  aiParkBase: "待客户补充：园区现有宣传素材、展示屏尺寸、招商政策、企业案例、品牌视觉规范",
  aiVideo: "待客户补充：AI 视频案例、脚本文案、展示屏播放素材、园区空间实拍图",
  company: "待客户补充：企业服务内容、入驻企业介绍、企业宣传素材、活动宣传素材",
  launch: "待客户补充：审核负责人、上线范围、内容更新频率、展示屏播放排期",
  landing: "待客户补充：试点场景、首批内容制作范围、审核机制、展示屏上线范围"
};

const aiParkSections = [
  "园区招商目标",
  "AI视频内容矩阵",
  "AI展示屏触点",
  "企业宣传素材体系",
  "自动化内容生产流程",
  "数字化展示能力",
  "合作落地路径",
  "执行排期与分工"
];

const aiParkSectionDetails = {
  "园区招商目标": {
    title: "园区招商：先把价值主张讲清楚",
    content: "本页围绕园区招商展开，明确这套 AI 宣传推广方案服务的对象、招商沟通场景和对外展示价值。重点不是喊口号，而是说明园区如何用更清晰的内容体系吸引企业了解、到访和进一步洽谈。",
    focus: "先讲招商沟通为什么需要内容升级，再说明 AI 视频、展示屏和数字化展陈如何共同降低企业理解成本。",
    image: `建议使用园区入口、招商接待区、产业地图或企业入驻动线示意图；若客户没有素材，写“${supplementLists.aiParkBase}”。`,
    layout: "建议采用上方一句招商价值主张，下方三栏展示“吸引企业、展示实力、承接洽谈”的结构。",
    speaker: "讲述时把听众带入招商场景：企业首次了解园区时，最需要看到定位、能力和落地方式，而不是堆满资料。"
  },
  "AI视频内容矩阵": {
    title: "AI 视频：形成可持续的园区传播内容",
    content: "本页说明 AI 视频在园区宣传中的角色：用于园区形象片、企业服务介绍、产业政策解读、招商短视频和活动回顾。强调内容矩阵和生产效率，不虚构播放量、转化率或未经确认的案例数据。",
    focus: "讲清楚 AI 视频不是单条宣传片，而是一套可反复生产、适配多渠道的内容资产。",
    image: `建议使用短视频脚本板、分镜图、屏幕预览、多平台发布矩阵示意；缺少真实素材时写“${supplementLists.aiVideo}”。`,
    layout: "建议采用矩阵布局：左侧列内容类型，右侧列使用场景和输出形式。",
    speaker: "讲这一页时强调“持续更新”与“多场景复用”，让园区宣传从临时制作变成常态化内容运营。"
  },
  "AI展示屏触点": {
    title: "AI 展示屏：把园区能力变成可感知触点",
    content: "本页围绕 AI 展示屏写园区线下触点，包括招商大厅、企业服务中心、会议接待区、活动现场和公共展示区。重点呈现信息展示、互动讲解、企业宣传轮播和活动内容更新。",
    focus: "突出展示屏如何把抽象的数字化能力变成来访企业看得见、问得到、能理解的现场体验。",
    image: `建议使用大厅大屏、交互屏、接待动线图或屏幕内容样机；没有实拍图时写“${supplementLists.aiVideo}”。`,
    layout: "建议采用场景动线图：从到访入口到接待区，再到洽谈区，标出屏幕承担的信息功能。",
    speaker: "讲述时不要只说设备，而要说企业进入园区后在哪些触点看到园区定位、服务能力和合作入口。"
  },
  "企业宣传素材体系": {
    title: "企业宣传：帮助入驻企业更好被看见",
    content: "本页说明方案如何服务企业宣传：企业介绍短片、产品亮点内容、招聘宣传、活动海报和展屏轮播素材。表达重点是园区提供宣传赋能，帮助企业提升对外展示质量。",
    focus: "从园区招商延伸到企业服务，说明这套方案不仅宣传园区，也能帮助企业做品牌露出。",
    image: `建议使用企业宣传模板、视频封面墙、海报样机或企业服务流程图；真实企业素材不足时写“${supplementLists.company}”。`,
    layout: "建议采用“园区统一模板 + 企业个性化内容 + 多渠道展示”的三段式排版。",
    speaker: "讲这一页时强调企业宣传不是孤立物料，而是园区服务能力的一部分，有利于形成更完整的招商服务叙事。"
  },
  "自动化内容生产流程": {
    title: "自动化内容生产：从需求到发布的标准流程",
    content: `本页拆解自动化内容生产流程：收集主题、生成脚本、制作视觉素材、合成视频、审核修改、发布展示。资料不足时保留流程框架，并标注“${supplementLists.launch}”。`,
    focus: "让客户看到内容生产不是靠临时灵感，而是可以建立流程、分工和审核机制。",
    image: "建议使用流程闭环图、内容工单流转图、脚本到视频的步骤图。",
    layout: "建议用横向流程图，从输入需求到多终端展示，末尾加审核节点。",
    speaker: "讲述时重点解释每一步由谁提供材料、谁审核、最终产出到哪里展示，避免只谈概念。"
  },
  "数字化展示能力": {
    title: "数字化展示能力：形成园区对外展示系统",
    content: "本页聚焦数字化展示能力：线上宣传页面、线下展示屏、活动内容、企业服务素材和招商讲解材料统一管理。重点说明统一内容口径和多端同步展示。",
    focus: "突出园区从单次宣传升级为数字化展示系统，提升招商接待、企业服务和品牌传播的一致性。",
    image: "建议使用内容中台示意、展示屏与线上页面联动图、数字化展厅结构图。",
    layout: "建议采用中心辐射图：中心是内容资产库，外围是招商、活动、企业宣传、展示屏等应用端。",
    speaker: "讲这一页时把能力说成系统：内容沉淀、统一管理、多端分发、持续更新。"
  },
  "合作落地路径": {
    title: "合作落地：从试点到常态运营",
    content: `本页给出合作落地路径：先选择试点场景，再确认素材和审核机制，随后完成首批内容制作、展示屏上线和运营复盘。没有客户资料时写“${supplementLists.landing}”。`,
    focus: "给出可执行的合作路径，让客户知道下一步怎么开始，而不是停留在方案介绍。",
    image: "建议使用三阶段路线图：试点启动、内容上线、常态运营。",
    layout: "建议采用时间轴或阶段卡片，每阶段写清输入、动作和交付物。",
    speaker: "讲述时强调先小范围试点，再根据园区反馈逐步扩展到招商、企业服务和活动宣传。"
  },
  "执行排期与分工": {
    title: "执行排期：明确材料、审核和上线节奏",
    content: `本页用于收束执行计划，列出客户需补充的资料、双方分工、审核节点和上线顺序。涉及具体周期、人力和预算时写“${supplementLists.launch}”。`,
    focus: "把方案落到项目管理：谁给资料、谁做内容、谁审核、什么时候上线。",
    image: "建议使用甘特图、责任分工表或上线清单。",
    layout: "建议用四列表格：资料准备、内容制作、审核修改、上线展示。",
    speaker: "讲这一页时把风险提前说清楚：没有素材、口径或审核机制，内容生产就无法稳定推进。"
  }
};

simpleModeBtn.addEventListener("click", () => {
  setActiveMode(SIMPLE_MODE);
});

professionalModeBtn.addEventListener("click", () => {
  setActiveMode(PROFESSIONAL_MODE);
});

simplePageCount.addEventListener("change", () => {
  simpleCustomPageField.classList.toggle("is-hidden", simplePageCount.value !== "custom");
});

simpleMaterialsRadios.forEach(radio => {
  radio.addEventListener("change", () => {
    if (radio.checked && radio.value !== "只有一句话需求") {
      simpleAdvancedSettings.open = true;
    }
  });
});

expandAllBtn.addEventListener("click", () => {
  cards.querySelectorAll("details.production-details").forEach(item => {
    item.open = true;
  });
});

collapseAllBtn.addEventListener("click", () => {
  cards.querySelectorAll("details.production-details").forEach(item => {
    item.open = false;
  });
});

backToTopBtn.addEventListener("click", () => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  resultPanel.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  restartMotionClass(resultPanel, "is-target-highlight", 900);
});

simpleGenerateBtn.addEventListener("click", async () => {
  const simpleFormData = collectSimpleForm();
  if (!simpleFormData) return;

  const simpleNeed = inferSimpleNeed(simpleFormData);
  setActiveMode(SIMPLE_MODE);
  showGenerationLoadingState(SIMPLE_MODE);

  try {
    const requestInput = buildSimpleRequest(simpleFormData, simpleNeed);
    const outline = await requestOutline(requestInput);
    resultCache[SIMPLE_MODE] = buildResultState(outline);
    renderModeResult();
    showToast(outline.production_ready ? "生产级大纲已生成" : "可编辑草案已生成，部分信息待确认");
  } catch (error) {
    resultCache[SIMPLE_MODE] = emptyResultState();
    const message = error instanceof TypeError
      ? "无法连接本地生成服务，请确认 npm start 正在运行。"
      : error.message || "生成失败，请稍后重试";
    showGenerationErrorState(message, SIMPLE_MODE, error.qualityReport, error.code);
  } finally {
    simpleGenerateBtn.disabled = false;
    simpleGenerateBtn.textContent = "生成 PPT 方案";
    simpleGenerateBtn.classList.remove("is-loading");
  }
});

simpleForm.addEventListener("submit", event => {
  event.preventDefault();
  simpleGenerateBtn.click();
});

simpleResetBtn.addEventListener("click", () => {
  simpleForm.reset();
  simpleCustomPageField.classList.add("is-hidden");
  simpleAdvancedSettings.open = false;
  resultCache[SIMPLE_MODE] = emptyResultState();
  if (activeMode === SIMPLE_MODE) renderModeResult();
});

questionBtn.addEventListener("click", async () => {
  const brief = readBrief();
  if (!brief) return;

  questionBtn.disabled = true;
  questionBtn.textContent = "正在调用本地模型…";
  try {
    const result = await requestPlanningStage(buildProfessionalPlanningStageRequest(brief, "clarifying_questions"));
    if (result.used && Array.isArray(result.questions) && result.questions.length) {
      latestQuestions = result.questions;
      renderQuestions(latestQuestions);
      showToast("已由本地模型生成追问");
    } else {
      latestQuestions = buildQuestions(brief);
      renderQuestions(latestQuestions, `规则备用草稿（本地模型未成功完成本阶段：${result.reason_code || "UNKNOWN"}）`);
    }
  } catch (error) {
    latestQuestions = buildQuestions(brief);
    renderQuestions(latestQuestions, `规则备用草稿（本地模型请求失败：${error.message || "UNKNOWN"}）`);
  } finally {
    questionBtn.disabled = false;
    questionBtn.textContent = "生成追问";
  }
});

summaryBtn.addEventListener("click", async () => {
  const brief = readBrief();
  if (!brief) return;

  if (!latestQuestions.length) {
    latestQuestions = buildQuestions(brief);
    renderQuestions(latestQuestions, "当前追问尚未由本地模型生成，以下为规则备用草稿");
  }

  summaryBtn.disabled = true;
  summaryBtn.textContent = "正在调用本地模型…";
  try {
    const result = await requestPlanningStage(buildProfessionalPlanningStageRequest(brief, "requirements_summary", {
      questions: latestQuestions,
      followUpAnswers: followAnswers.value
    }));
    if (result.used && result.summary) {
      latestSummary = result.summary;
      renderSummary(result);
      showToast("已由本地模型生成需求摘要");
    } else {
      latestSummary = buildSummary(brief);
      renderSummary({ summary: latestSummary, fallback_used: true, reason_code: result.reason_code });
    }
  } catch (error) {
    latestSummary = buildSummary(brief);
    renderSummary({ summary: latestSummary, fallback_used: true, reason_code: error.message || "UNKNOWN" });
  } finally {
    summaryBtn.disabled = false;
    summaryBtn.textContent = "生成需求摘要";
  }
});

generateBtn.addEventListener("click", async () => {
  const brief = readBrief();
  if (!brief) return;

  if (!latestSummary) {
    latestSummary = buildSummary(brief);
    summaryBox.classList.remove("muted-box");
    summaryBox.innerHTML = latestSummary;
  }

  setActiveMode(PROFESSIONAL_MODE);
  showGenerationLoadingState(PROFESSIONAL_MODE);
  try {
    const outline = await requestOutline(buildProfessionalRequest(brief, {
      clarifyingQuestions: latestQuestions,
      clarifyingAnswers: followAnswers.value,
      requirementsSummary: latestSummary
    }));
    resultCache[PROFESSIONAL_MODE] = buildResultState(outline);
    renderModeResult();
    showToast("专业模式 PPT 大纲已通过统一服务生成");
  } catch (error) {
    resultCache[PROFESSIONAL_MODE] = emptyResultState();
    const message = error instanceof TypeError
      ? "无法连接本地生成服务，请确认 npm start 正在运行。"
      : error.message || "生成失败，请稍后重试";
    showGenerationErrorState(message, PROFESSIONAL_MODE, error.qualityReport, error.code);
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = "确认需求并生成 PPT 大纲";
    generateBtn.classList.remove("is-loading");
  }
});

form.addEventListener("submit", event => {
  event.preventDefault();
  generateBtn.click();
});

resetBtn.addEventListener("click", () => {
  resetProfessionalMode();
});

copyBtn.addEventListener("click", async () => {
  if (!currentProductionText) return;
  await copyText(currentProductionText);
  showToast("已复制制作版");
});

copyClientBtn.addEventListener("click", async () => {
  if (!currentClientText) return;
  await copyText(currentClientText);
  showToast("已复制客户版");
});

initializeProfessionalGroupControls();
initializeResultNavigationFeedback();
initializeRepairFlowActions();
initializeSimpleNextStepActions();
initializeMaterialTemplateUx();
setActiveMode(SIMPLE_MODE);

function setActiveMode(mode) {
  activeMode = mode;
  const isSimple = mode === SIMPLE_MODE;

  simpleForm.classList.toggle("is-hidden", !isSimple);
  form.classList.toggle("is-hidden", isSimple);
  simpleModeBtn.classList.toggle("is-active", isSimple);
  professionalModeBtn.classList.toggle("is-active", !isSimple);
  simpleModeBtn.setAttribute("aria-pressed", String(isSimple));
  professionalModeBtn.setAttribute("aria-pressed", String(!isSimple));

  professionalResultOnly.forEach(item => {
    item.classList.toggle("is-hidden", isSimple);
  });

  resultModeLabel.textContent = isSimple ? "普通模式结果" : "专业模式步骤 2-4";
  finalStepLabel.textContent = isSimple ? "结果" : "步骤四";
  finalStepTitle.textContent = isSimple ? "生成 PPT 方案初稿" : "确认需求后生成完整 PPT 大纲和演讲脚本";
  emptyStateTitle.textContent = isSimple ? "还没有生成 PPT 方案" : "还没有生成最终结果";
  emptyStateText.textContent = isSimple
    ? "填写简易需求后，这里会展示总标题、整体逻辑结构、逐页制作提纲、配图建议和演讲备注。"
    : "确认需求后，这里会用卡片展示总标题、整体逻辑结构、逐页内容、讲述重点、配图、排版和演讲备注。";

  if (!isSimple) applyProfessionalGroupDefaults();
  restartMotionClass(isSimple ? simpleForm : form, "motion-panel-enter", 260);
  renderModeResult();
}

function initializeProfessionalGroupControls() {
  professionalSections.forEach(section => {
    const summary = section.querySelector("summary");
    if (!summary) return;
    summary.addEventListener("click", () => {
      professionalGroupsTouched = true;
    });
    summary.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        professionalGroupsTouched = true;
      }
    });
  });

  if (!professionalMobileQuery) return;

  const syncDefaults = () => {
    if (activeMode === PROFESSIONAL_MODE) applyProfessionalGroupDefaults();
  };
  if (typeof professionalMobileQuery.addEventListener === "function") {
    professionalMobileQuery.addEventListener("change", syncDefaults);
  } else if (typeof professionalMobileQuery.addListener === "function") {
    professionalMobileQuery.addListener(syncDefaults);
  }
}

function initializeResultNavigationFeedback() {
  cards.addEventListener("click", event => {
    const link = event.target.closest(".result-nav-links a");
    if (!link) return;
    const targetId = link.getAttribute("href");
    if (!targetId || !targetId.startsWith("#slide-")) return;
    const target = document.getElementById(targetId.slice(1));
    if (!target) return;
    restartMotionClass(target, "is-target-highlight", 900);
  });
}

function initializeRepairFlowActions() {
  cards.addEventListener("click", event => {
    const targetButton = event.target.closest("[data-repair-target-field]");
    if (targetButton) {
      goToRepairTarget(targetButton.dataset.repairTargetSection || "", targetButton.dataset.repairTargetField || "");
      return;
    }

    if (event.target.closest("[data-repair-action='back-to-form']")) {
      if (activeMode !== PROFESSIONAL_MODE) setActiveMode(PROFESSIONAL_MODE);
      scrollToElement(form);
      return;
    }

    if (event.target.closest("[data-repair-action='regenerate']")) {
      regenerateFromCurrentProfessionalForm();
    }
  });
}

function initializeSimpleNextStepActions() {
  cards.addEventListener("click", event => {
    const targetButton = event.target.closest("[data-simple-next-target]");
    if (targetButton) {
      goToSimpleNextStepTarget(targetButton.dataset.simpleNextTarget || "");
      return;
    }

    if (event.target.closest("[data-simple-action='regenerate']")) {
      simpleGenerateBtn.click();
      return;
    }

    if (event.target.closest("[data-simple-action='switch-professional']")) {
      migrateSimpleFieldsToProfessional();
      setActiveMode(PROFESSIONAL_MODE);
      scrollToElement(form);
    }
  });
}

function initializeMaterialTemplateUx() {
  setupMaterialTemplateControl({
    buttonId: "simpleMaterialTemplateBtn",
    noteId: "simpleMaterialTemplateNote",
    fieldSelector: "#simpleMaterialsTextField",
    textareaId: "simpleMaterialsText",
    details: simpleAdvancedSettings,
    buttonText: "插入资料结构模板",
    noteText: "按栏目整理资料后，第二版会更具体；也可以继续直接粘贴普通文字。",
    template: SIMPLE_MATERIAL_TEMPLATE
  });

  const professionalMaterialsSection = form.querySelector('details[data-professional-section="materials"]');
  const professionalMaterialTextarea = document.getElementById("materialDetails");
  setupMaterialTemplateControl({
    buttonId: "professionalMaterialTemplateBtn",
    noteId: "professionalMaterialTemplateNote",
    field: professionalMaterialTextarea?.closest(".field"),
    textarea: professionalMaterialTextarea,
    details: professionalMaterialsSection,
    buttonText: "插入专业资料模板",
    noteText: "只有客户已经明确确认的内容，才能填写到“已确认事实”。每条事实单独列出；普通背景资料不会自动变成已确认事实。不确定的内容填写到“待确认内容”。插入模板不会自动提交，也不会覆盖已有资料。",
    template: PROFESSIONAL_MATERIAL_TEMPLATE
  });
}

function setupMaterialTemplateControl(options) {
  if (document.getElementById(options.buttonId)) return;

  const field = options.field || document.querySelector(options.fieldSelector);
  const textarea = options.textarea || document.getElementById(options.textareaId);
  if (!field || !textarea) return;

  const tools = document.createElement("div");
  tools.className = "material-template-tools";

  const button = document.createElement("button");
  button.className = "ghost-btn material-template-btn";
  button.id = options.buttonId;
  button.type = "button";
  button.textContent = options.buttonText;
  button.setAttribute("aria-label", options.buttonText);
  button.setAttribute("aria-describedby", options.noteId);

  const note = document.createElement("p");
  note.className = "field-hint material-template-note";
  note.id = options.noteId;
  note.textContent = options.noteText;

  appendDescribedBy(textarea, options.noteId);
  tools.append(button, note);
  field.insertBefore(tools, textarea);

  button.addEventListener("click", () => {
    insertMaterialTemplateIfEmpty(textarea, options.template, options.details);
  });
}

function appendDescribedBy(element, id) {
  const current = element.getAttribute("aria-describedby") || "";
  const ids = current.split(/\s+/).filter(Boolean);
  if (!ids.includes(id)) ids.push(id);
  element.setAttribute("aria-describedby", ids.join(" "));
}

function insertMaterialTemplateIfEmpty(textarea, template, details) {
  if (details) details.open = true;

  if (textarea.value.trim()) {
    showToast("资料区已有内容，未插入模板。");
    textarea.focus({ preventScroll: true });
    return;
  }

  textarea.value = template;
  textarea.focus({ preventScroll: true });
  const firstBulletIndex = textarea.value.indexOf("*");
  const cursorPosition = firstBulletIndex >= 0 ? firstBulletIndex + 1 : textarea.value.length;
  textarea.setSelectionRange(cursorPosition, cursorPosition);
}

function applyProfessionalGroupDefaults() {
  if (professionalGroupsTouched || !professionalSections.length) return;

  const isMobile = professionalMobileQuery?.matches ?? window.innerWidth <= 680;
  professionalSections.forEach((section, index) => {
    section.open = !isMobile || index === 0;
  });
}

function restartMotionClass(element, className, duration = 260) {
  if (!element) return;
  const timers = motionTimers.get(element) || {};
  if (timers[className]) {
    window.clearTimeout(timers[className]);
  }
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  timers[className] = window.setTimeout(() => {
    element.classList.remove(className);
    delete timers[className];
  }, duration);
  motionTimers.set(element, timers);
}

function applyResultMotion() {
  restartMotionClass(cards, "motion-result-enter", 260);
  const animatedItems = cards.querySelectorAll(".deck-summary, .result-nav, .logic-card, .page-card, .deck-production-details");
  animatedItems.forEach((item, index) => {
    item.style.setProperty("--motion-order", String(Math.min(index, 5)));
    restartMotionClass(item, "motion-enter", 360);
  });
}

function clearLoadingMotion() {
  cards.classList.remove("is-loading-result");
  simpleGenerateBtn.classList.remove("is-loading");
  generateBtn.classList.remove("is-loading");
}

function renderModeResult() {
  clearLoadingMotion();
  const state = resultCache[activeMode];
  currentClientText = state.clientText || "";
  currentProductionText = state.productionText || "";

  if (!state.outline) {
    cards.innerHTML = "";
    cards.hidden = true;
    emptyState.style.display = "grid";
    copyActions.hidden = true;
    copyBtn.disabled = true;
    copyClientBtn.disabled = true;
    resultActions.hidden = true;
    resultTitle.textContent = activeMode === SIMPLE_MODE ? "PPT 方案结果" : "问答、摘要与完整结果";
    restartMotionClass(emptyState, "motion-result-enter", 260);
    return;
  }

  renderOutline(state.outline);
  cards.hidden = false;
  emptyState.style.display = "none";
  copyActions.hidden = false;
  copyBtn.disabled = false;
  copyClientBtn.disabled = false;
  resultActions.hidden = false;
  applyResultMotion();
}

function resultStatusDisplay({ qualityStatus, isDraft, quality }) {
  if (qualityStatus === "production_ready") {
    return {
      label: "生产级通过",
      title: "生产级通过",
      description: "当前大纲已通过专业质量检查，可以继续复制制作版或客户版。"
    };
  }
  if (qualityStatus === "review_required") {
    return {
      label: "可人工复核并继续制作",
      title: "可人工复核并继续制作",
      description: "当前大纲已满足安全输出条件；请根据人工复核警告确认后继续制作客户版或制作版。"
    };
  }
  if (qualityStatus === "fallback") {
    return {
      label: "安全兜底版本",
      title: "安全兜底版本",
      description: "本地模型输出未被采用或当前不可用；系统已根据你的表单生成完整可编辑脚本，请人工复核后使用。"
    };
  }
  if (isDraft) {
    return {
      label: "可编辑草案",
      title: "可编辑草案",
      description: "当前内容适合继续补充和调整，生产级输出前仍需确认事实边界。"
    };
  }
  return {
    label: quality.status_label || "质量状态待确认",
    title: "质量状态待确认",
    description: "当前结果需要进一步复核质量报告和资料边界。"
  };
}

function buildResultState(outline) {
  return {
    outline,
    clientText: outline.customer_version || outlineToText(outline, "client"),
    productionText: outline.production_version || outlineToText(outline, "production")
  };
}

function emptyResultState() {
  return { outline: null, clientText: "", productionText: "" };
}

function showGenerationLoadingState(mode) {
  const button = mode === SIMPLE_MODE ? simpleGenerateBtn : generateBtn;
  button.disabled = true;
  button.textContent = "正在生成…";
  button.classList.add("is-loading");
  resultTitle.textContent = "正在生成 PPT 方案";
  emptyState.style.display = "none";
  cards.hidden = false;
  cards.classList.add("is-loading-result");
  resultActions.hidden = true;
  const modeText = mode === SIMPLE_MODE
    ? "普通模式会优先生成可编辑草案，并标记待确认资料。"
    : "专业模式会按生产级质量门槛检查结构、事实边界和交付完整性。";
  cards.innerHTML = `
    <article class="deck-summary generation-state" role="status" aria-live="polite">
      <h3>正在生成结构化大纲</h3>
      <p>${escapeHtml(modeText)}</p>
      <ol class="clean-list">
        <li>理解需求：读取主题、用途、受众和客户资料。</li>
        <li>规划内容结构：组织页面逻辑和每页角色。</li>
        <li>生成页面大纲：输出标题、正文、视觉建议和讲述重点。</li>
        <li>执行质量检查：区分可编辑草案、生产级通过、降级提示或需补充资料。</li>
      </ol>
    </article>
  `;
  copyActions.hidden = true;
  copyBtn.disabled = true;
  copyClientBtn.disabled = true;
  applyResultMotion();
}

const REPAIRABILITY = {
  REQUIRED: "user_input_required",
  HELPFUL: "user_input_helpful",
  RETRY: "system_retry",
  SYSTEM: "system_issue",
  UNKNOWN: "unknown"
};

const PROFESSIONAL_REPAIR_FIELDS = {
  basics: { label: "基础需求", fields: { topic: "PPT 主题", pageCount: "页数" } },
  audience: { label: "受众与用途", fields: { detailedPurpose: "详细使用目的", audience: "目标观众" } },
  materials: { label: "客户已有资料", fields: { materialDetails: "资料详情" } },
  constraints: { label: "内容重点与风险边界", fields: { mustHave: "必须呈现的重点内容", riskPoints: "不能提的内容或风险点", customHighlight: "希望突出具体内容" } },
  delivery: { label: "交付要求", fields: { reference: "参考风格或素材边界" } }
};

const GATE_REPAIR_RULES = {
  confirmed_fact_coverage: {
    repairability: REPAIRABILITY.REQUIRED,
    title: "已确认事实不足",
    impact: "生产级交付需要明确哪些事实可以写进正文，避免把假设写成客户结论。",
    suggestion: "补充客户原文、数据口径、已确认结论、来源或明确“暂无数据”。",
    target_section: "materials",
    target_field: "materialDetails"
  },
  material_context_coverage: {
    repairability: REPAIRABILITY.REQUIRED,
    title: "项目背景或关键上下文不足",
    impact: "缺少项目背景会让页面退化为通用模板，难以服务真实交付。",
    suggestion: "补充项目阶段、业务背景、客户现状、品牌或市场进入信息。",
    target_section: "materials",
    target_field: "materialDetails"
  },
  required_decisions: {
    repairability: REPAIRABILITY.REQUIRED,
    title: "决策对象或行动要求不明确",
    impact: "生产级方案需要知道听众看完后要做什么判断或行动。",
    suggestion: "写清楚这份 PPT 要支持谁做决策，以及需要确认、推进或选择什么。",
    target_section: "audience",
    target_field: "detailedPurpose"
  },
  audience_alignment: {
    repairability: REPAIRABILITY.REQUIRED,
    title: "目标受众与用途不够稳定",
    impact: "受众漂移会导致标题、封面和行动页服务错对象。",
    suggestion: "补充最终观看对象、角色和他们最关心的判断。",
    target_section: "audience",
    target_field: "audience"
  },
  material_relevance: {
    repairability: REPAIRABILITY.HELPFUL,
    title: "客户素材语义保留不足",
    impact: "补充更清晰的原始材料可能帮助结果减少模板感。",
    suggestion: "补充必须保留的客户原文、关键词、项目特征或资料边界。",
    target_section: "materials",
    target_field: "materialDetails"
  },
  evidence_traceability: {
    repairability: REPAIRABILITY.HELPFUL,
    title: "页面结论缺少可追溯来源",
    impact: "补充证据来源可能帮助系统把页面结论绑定到真实资料。",
    suggestion: "补充数据来源、客户原文、截图内容、访谈结论或明确哪些只是待验证假设。",
    target_section: "materials",
    target_field: "materialDetails"
  },
  no_fabrication: {
    repairability: REPAIRABILITY.HELPFUL,
    title: "存在未获资料支持的结论",
    impact: "生产级交付不能使用未确认数值、绝对化结论或效果承诺。",
    suggestion: "补充可验证数据、来源口径，或明确没有数据时只能写待确认。",
    target_section: "materials",
    target_field: "materialDetails"
  },
  evidence_safety: {
    repairability: REPAIRABILITY.HELPFUL,
    title: "事实、假设或证据边界不安全",
    impact: "补充证据边界可能帮助系统区分已确认事实、待验证假设和不能写的内容。",
    suggestion: "补充来源、口径、确认状态，或说明哪些内容只能作为假设表达。",
    target_section: "materials",
    target_field: "materialDetails"
  },
  required_section_coverage: {
    repairability: REPAIRABILITY.HELPFUL,
    title: "明确要求内容覆盖不足",
    impact: "客户已经写明的内容模块没有稳定进入最终页面，可能导致方案不完整。",
    suggestion: "检查“必须呈现的重点内容”和“希望突出具体内容”，补充可直接进入页面的表达或保留失败证据再次生成。",
    target_section: "constraints",
    target_field: "mustHave"
  },
  visual_semantics: {
    repairability: REPAIRABILITY.HELPFUL,
    title: "视觉表达与页面语义不匹配",
    impact: "补充视觉参考可能帮助页面类型、图示和素材边界更贴合内容。",
    suggestion: "补充参考风格、图片素材、不能使用的视觉类型或行业表达边界。",
    target_section: "delivery",
    target_field: "reference"
  },
  title_content_match: {
    repairability: REPAIRABILITY.HELPFUL,
    title: "标题与正文主题不一致",
    impact: "更明确的主题可能帮助系统收紧页面表达。",
    suggestion: "确认主题、业务对象和这份 PPT 的核心范围。",
    target_section: "basics",
    target_field: "topic"
  },
  narrative_dependencies: {
    repairability: REPAIRABILITY.RETRY,
    title: "内容顺序或依赖关系未满足内部要求",
    impact: "当前资料可能没有问题，本次生成结构未满足内部质量要求。",
    suggestion: "可以重新生成；如果持续出现，请保留失败证据。",
    target_section: "",
    target_field: ""
  },
  manual_page_count: {
    repairability: REPAIRABILITY.RETRY,
    title: "页数未满足内部输出要求",
    impact: "当前资料可能没有问题，本次生成结果未满足页数一致性要求。",
    suggestion: "可以重新生成；如果持续出现，请检查本地生成服务。",
    target_section: "",
    target_field: ""
  },
  cover_clean: {
    repairability: REPAIRABILITY.RETRY,
    title: "封面含内部生产话术",
    impact: "当前资料可能没有问题，本次生成结果混入了不应展示给客户的内部话术。",
    suggestion: "可以重新生成；如果持续出现，请保留失败证据。",
    target_section: "",
    target_field: ""
  },
  content_layering: {
    repairability: REPAIRABILITY.RETRY,
    title: "客户内容和制作备注混层",
    impact: "当前资料可能没有问题，本次生成结果未满足客户版与制作版分层要求。",
    suggestion: "可以重新生成；如果持续出现，请保留失败证据。",
    target_section: "",
    target_field: ""
  },
  final_output_integrity: {
    repairability: REPAIRABILITY.SYSTEM,
    title: "最终输出完整性未满足内部要求",
    impact: "当前资料可能没有问题，本次生成结果未满足内部完整性检查。",
    suggestion: "可以重新生成；如果持续出现，请检查本地生成服务或保留失败证据。",
    target_section: "",
    target_field: ""
  },
  api_contract: {
    repairability: REPAIRABILITY.SYSTEM,
    title: "输出结构未满足接口契约",
    impact: "当前资料可能没有问题，本次生成结果结构不完整。",
    suggestion: "可以重新生成；如果持续出现，请检查本地生成服务。",
    target_section: "",
    target_field: ""
  },
  unified_server_core: {
    repairability: REPAIRABILITY.SYSTEM,
    title: "结果未标记为统一生成核心",
    impact: "当前资料可能没有问题，本次生成未满足内部链路标记要求。",
    suggestion: "可以重新生成；如果持续出现，请检查本地生成服务。",
    target_section: "",
    target_field: ""
  }
};

const ISSUE_REPAIR_RULES = {
  required_section_coverage: {
    repairability: REPAIRABILITY.HELPFUL,
    title: "明确要求内容覆盖不足",
    impact: "客户已经写明的内容模块没有稳定进入最终页面，可能导致方案不完整。",
    suggestion: "检查“必须呈现的重点内容”和“希望突出具体内容”，补充可直接进入页面的表达或保留失败证据再次生成。",
    target_section: "constraints",
    target_field: "mustHave"
  },
  excluded_content: {
    repairability: REPAIRABILITY.HELPFUL,
    title: "风险边界仍被触发",
    impact: "客户明确不允许写入的内容或关系可能进入了标题、正文、结论、图示或备注。",
    suggestion: "检查“不能提的内容或风险点”，确认禁止对象、禁止区域和禁止关系表达。",
    target_section: "constraints",
    target_field: "riskPoints"
  },
  confirmed_fact_coverage: {
    repairability: REPAIRABILITY.REQUIRED,
    title: "已确认事实不足",
    impact: "生产级交付需要明确哪些事实可以写进正文，避免把假设写成客户结论。",
    suggestion: "补充客户原文、数据口径、已确认结论、来源或明确“暂无数据”。",
    target_section: "materials",
    target_field: "materialDetails"
  },
  evidence_traceability: {
    repairability: REPAIRABILITY.HELPFUL,
    title: "页面结论缺少可追溯来源",
    impact: "补充证据来源可能帮助系统把页面结论绑定到真实资料。",
    suggestion: "补充数据来源、客户原文、截图内容、访谈结论或明确哪些只是待验证假设。",
    target_section: "materials",
    target_field: "materialDetails"
  },
  audience_coverage: {
    repairability: REPAIRABILITY.REQUIRED,
    title: "目标受众覆盖不足",
    impact: "受众信息没有稳定进入最终输出，可能导致页面服务错对象。",
    suggestion: "补充最终观看对象、角色和他们最关心的判断。",
    target_section: "audience",
    target_field: "audience"
  },
  purpose_coverage: {
    repairability: REPAIRABILITY.REQUIRED,
    title: "使用目的覆盖不足",
    impact: "用途信息没有稳定进入最终输出，可能导致结尾行动不明确。",
    suggestion: "补充这份 PPT 要支持的判断、行动或合作推进目标。",
    target_section: "audience",
    target_field: "detailedPurpose"
  }
};

function inspectHardGates(hardGates) {
  const failed = [];
  const malformed = [];
  const entries = Array.isArray(hardGates)
    ? hardGates.map((gate, index) => [gate?.code || gate?.gate_code || `gate_${index + 1}`, gate])
    : hardGates && typeof hardGates === "object"
      ? Object.entries(hardGates)
      : [];

  if (!entries.length && hardGates !== undefined && hardGates !== null) {
    malformed.push({ code: "hard_gates", rawGate: hardGates, reason: "hard_gates 格式异常" });
  }

  entries.forEach(([code, gate]) => {
    const stableCode = String(code || "").trim();
    if (!stableCode) {
      malformed.push({ code: "", rawGate: gate, reason: "缺少 gate code" });
      return;
    }
    if (gate === false) {
      failed.push({ code: stableCode, rawGate: gate, reason: "", details: null, malformed: false });
      return;
    }
    if (gate === true) return;
    if (gate && typeof gate === "object") {
      if (gate.passed === false) {
        failed.push({
          code: stableCode,
          rawGate: gate,
          reason: typeof gate.reason === "string" ? gate.reason : "",
          details: gate,
          malformed: false
        });
        return;
      }
      if (gate.passed === true) return;
      malformed.push({ code: stableCode, rawGate: gate, reason: "无法确认 passed 状态" });
      return;
    }
    malformed.push({ code: stableCode, rawGate: gate, reason: "gate 值格式异常" });
  });

  return { failed, malformed };
}

function normalizeFailedHardGates(hardGates) {
  return inspectHardGates(hardGates).failed;
}

function showGenerationErrorState(message, mode, qualityReport, errorCode = "") {
  clearLoadingMotion();
  if (mode === PROFESSIONAL_MODE) {
    generateBtn.disabled = false;
    generateBtn.textContent = "确认需求并生成 PPT 大纲";
    generateBtn.classList.remove("is-loading");
  } else {
    simpleGenerateBtn.disabled = false;
    simpleGenerateBtn.textContent = "生成 PPT 方案";
    simpleGenerateBtn.classList.remove("is-loading");
  }
  const failedGates = normalizeFailedHardGates(qualityReport?.hard_gates);
  const hardGateInspection = inspectHardGates(qualityReport?.hard_gates);
  const isQualityFailure = Boolean(qualityReport);
  const isBlocked = qualityReport?.quality_status === "blocked";
  const legacyQualityFailureHeadingContract = isBlocked
    ? "无法安全生成结果"
    : qualityReport ? "质量检查未通过" : "暂时无法生成";
  const statusClass = isQualityFailure ? "status-failure" : "status-error";
  resultTitle.textContent = isBlocked
    ? "无法安全生成结果"
    : isQualityFailure ? "尚未达到生产级标准" : "生成服务暂时不可用";
  emptyState.style.display = "none";
  cards.hidden = false;
  resultActions.hidden = true;
  cards.replaceChildren(buildGenerationErrorArticle({
    message,
    mode,
    qualityReport,
    errorCode,
    failedGates,
    malformedGates: hardGateInspection.malformed,
    statusClass,
    legacyQualityFailureHeadingContract
  }));
  copyActions.hidden = true;
  copyBtn.disabled = true;
  copyClientBtn.disabled = true;
  applyResultMotion();
  showToast("生成失败，结果区已显示原因");
}

function buildGenerationErrorArticle({
  message,
  mode,
  qualityReport,
  errorCode,
  failedGates,
  malformedGates,
  statusClass,
  legacyQualityFailureHeadingContract
}) {
  const article = document.createElement("article");
  article.className = "deck-summary result-summary";
  article.setAttribute("role", "alert");
  article.dataset.errorMode = mode;
  article.dataset.legacyHeadingContract = legacyQualityFailureHeadingContract;

  const banner = document.createElement("div");
  banner.className = `status-banner ${statusClass}`;
  const isBlocked = qualityReport?.quality_status === "blocked";
  appendTextElement(
    banner,
    "strong",
    isBlocked ? "无法安全生成结果" : qualityReport ? "尚未达到生产级标准" : "生成服务暂时不可用"
  );
  appendTextElement(
    banner,
    "p",
    isBlocked
      ? "系统未能生成可安全展示的完整脚本；普通质量问题不会触发此页面。"
      : qualityReport ? "补充以下关键信息后可再次生成。" : "请检查本地服务或稍后重试。"
  );
  article.appendChild(banner);

  appendTextElement(article, "h3", isBlocked ? "本次没有可安全展示的结果" : qualityReport ? "质量检查需要补充资料" : "暂时无法生成");
  appendTextElement(article, "p", message);

  if (qualityReport) {
    appendQualityFailureDetails(article, qualityReport, failedGates, malformedGates);
    appendRepairSummary(article, failedGates, qualityReport);
    appendRepairTaskList(article, failedGates, mode);
    appendRepairWarnings(article, qualityReport.warnings);
    appendAutomaticRepairDetails(article, qualityReport.repairs);
    appendTextElement(article, "p", "接口已返回质量报告，请根据硬性检查原因补充资料、再次生成或保留失败证据。");
  } else {
    appendTextElement(
      article,
      "p",
      isLocalServiceConnectionError(message)
        ? "请确认本地服务已启动后重试。"
        : modelFailureHint(errorCode) || "请根据错误原因调整配置或稍后重试。"
    );
  }

  return article;
}

function appendQualityFailureDetails(container, qualityReport, failedGates, malformedGates) {
  const details = document.createElement("div");
  details.className = "quality-failure-details";
  appendLabeledText(details, "最终分数", `${String(qualityReport.score ?? "-")} / 100`);
  appendLabeledText(details, "生产阈值", String(qualityReport.threshold ?? 95));
  appendLabeledText(details, "质量状态", qualityReport.status_label || "质量检查未通过");

  if (failedGates.length || malformedGates.length) {
    appendGateTechnicalDetails(details, failedGates, malformedGates);
  }

  appendDiagnosticsDetails(details, qualityReport, failedGates);

  container.appendChild(details);
}

function appendRepairSummary(container, failedGates, qualityReport) {
  const tasks = buildRepairTasks(failedGates);
  const warningsCount = safeArray(qualityReport.warnings).filter(item => typeof item === "string" && item.trim()).length;
  const summary = document.createElement("section");
  summary.className = "repair-summary";
  summary.setAttribute("aria-label", "修复摘要");

  const counts = [
    ["未通过门槛", failedGates.length],
    ["用户必须补充", tasks.filter(task => task.repairability === REPAIRABILITY.REQUIRED).length],
    ["系统处理项", tasks.filter(task => [REPAIRABILITY.RETRY, REPAIRABILITY.SYSTEM].includes(task.repairability)).length],
    ["额外建议", tasks.filter(task => task.repairability === REPAIRABILITY.HELPFUL).length + warningsCount]
  ];

  counts.forEach(([label, value]) => {
    const item = document.createElement("div");
    appendTextElement(item, "strong", String(value));
    appendTextElement(item, "span", label);
    summary.appendChild(item);
  });

  appendTextElement(
    summary,
    "p",
    "额外建议可能来自质量提醒，不一定属于失败门槛。"
  );
  appendTextElement(
    summary,
    "p",
    canRegenerateFromProfessionalForm()
      ? "当前可以使用现有专业表单值再次生成，但不承诺一定通过。"
      : "当前需要保持专业模式、完成表单校验且不处于生成中，才能再次生成。"
  );
  container.appendChild(summary);
}

function appendRepairTaskList(container, failedGates, mode) {
  const tasks = buildRepairTasks(failedGates);
  if (!tasks.length) return;

  const section = document.createElement("section");
  section.className = "repair-task-section";
  appendTextElement(section, "h4", "修复任务");
  const list = document.createElement("ol");
  list.className = "repair-task-list";

  tasks.forEach(task => {
    const item = document.createElement("li");
    item.className = `repair-task repair-${task.repairability}`;
    item.dataset.gateCode = task.code;
    item.dataset.repairability = task.repairability;

    const header = document.createElement("div");
    header.className = "repair-task-header";
    appendTextElement(header, "strong", task.title);
    appendTextElement(header, "span", repairabilityLabel(task.repairability));
    item.appendChild(header);

    appendTextElement(item, "p", task.impact);
    appendTextElement(item, "p", task.suggestion);

    if (task.targetValid && mode === PROFESSIONAL_MODE) {
      appendTextElement(item, "p", `建议位置：${task.sectionLabel} / ${task.fieldLabel}`);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary-btn repair-action-btn";
      button.dataset.repairTargetSection = task.target_section;
      button.dataset.repairTargetField = task.target_field;
      button.textContent = `去补充${task.fieldLabel}`;
      item.appendChild(button);
    }

    list.appendChild(item);
  });

  section.appendChild(list);
  const actions = document.createElement("div");
  actions.className = "repair-actions";
  const backButton = document.createElement("button");
  backButton.type = "button";
  backButton.className = "ghost-btn";
  backButton.dataset.repairAction = "back-to-form";
  backButton.textContent = "返回专业表单";
  actions.appendChild(backButton);
  const retryButton = document.createElement("button");
  retryButton.type = "button";
  retryButton.className = "primary-btn";
  retryButton.dataset.repairAction = "regenerate";
  retryButton.textContent = "再次生成";
  retryButton.disabled = mode !== PROFESSIONAL_MODE || !canRegenerateFromProfessionalForm();
  actions.appendChild(retryButton);
  section.appendChild(actions);
  container.appendChild(section);
}

function appendRepairWarnings(container, warnings) {
  const safeWarnings = safeArray(warnings).filter(item => typeof item === "string" && item.trim());
  if (!safeWarnings.length) return;
  const section = document.createElement("section");
  section.className = "repair-warning-list";
  appendTextElement(section, "h4", "建议完善");
  const list = document.createElement("ul");
  list.className = "clean-list";
  safeWarnings.forEach(warning => appendTextElement(list, "li", formatRepairWarningForDisplay(warning)));
  section.appendChild(list);
  container.appendChild(section);
}

function formatRepairWarningForDisplay(warning) {
  const cleaned = warning
    .split(/[；;]/)
    .map(part => part.trim().replace(/^(?:[a-z][a-z0-9_]*\s*[:：]\s*)+/i, "").trim())
    .filter(Boolean)
    .join("；");
  return cleaned || "请复核质量提醒。";
}

function appendAutomaticRepairDetails(container, repairs) {
  const rounds = safeArray(repairs).filter(round => round && typeof round === "object" && Array.isArray(round.changes));
  if (!rounds.length) return;
  const details = document.createElement("details");
  details.className = "automatic-repair-details";
  appendTextElement(details, "summary", "系统已尝试的自动修复");
  rounds.forEach(round => {
    const block = document.createElement("div");
    block.className = "repair-round";
    appendTextElement(block, "strong", `第 ${String(round.round ?? "-")} 轮：${String(round.before_score ?? "-")} -> ${String(round.after_score ?? "-")}`);
    const issues = [...new Set(round.changes
      .map(change => change?.issue)
      .filter(issue => typeof issue === "string" && issue.trim()))];
    if (issues.length) {
      const list = document.createElement("ul");
      issues.forEach(issue => appendTextElement(list, "li", issue));
      block.appendChild(list);
    }
    details.appendChild(block);
  });
  container.appendChild(details);
}

function buildRepairTasks(failedGates) {
  return failedGates.map(gate => {
    const resolution = resolveRepairRule(gate);
    const rule = resolution.rule || {
      repairability: REPAIRABILITY.UNKNOWN,
      title: "检测到一个尚未建立字段映射的质量问题",
      impact: "系统识别到质量问题，但当前前端没有可靠字段映射。",
      suggestion: "建议检查项目背景、客户资料和交付要求；也可以再次生成。",
      target_section: "",
      target_field: ""
    };
    const target = validateRepairTarget(rule.target_section, rule.target_field);
    return {
      code: gate.code,
      issue_code: resolution.issueCode,
      mapped_field: rule.target_field || "",
      mapping_source: resolution.mappingSource,
      reason: gate.reason,
      user_actionable: [REPAIRABILITY.REQUIRED, REPAIRABILITY.HELPFUL].includes(rule.repairability),
      retry_recommended: true,
      targetValid: target.valid,
      sectionLabel: target.sectionLabel,
      fieldLabel: target.fieldLabel,
      ...rule
    };
  });
}

function resolveRepairRule(gate) {
  const issueCodes = safeArray(gate?.details?.issue_codes)
    .concat(safeArray(gate?.rawGate?.issue_codes))
    .map(code => String(code || "").trim())
    .filter(Boolean);
  for (const issueCode of issueCodes) {
    if (ISSUE_REPAIR_RULES[issueCode]) {
      return { rule: ISSUE_REPAIR_RULES[issueCode], issueCode, mappingSource: "issue_code" };
    }
  }
  if (GATE_REPAIR_RULES[gate.code]) {
    return { rule: GATE_REPAIR_RULES[gate.code], issueCode: issueCodes[0] || "", mappingSource: "gate_fallback" };
  }
  return { rule: null, issueCode: issueCodes[0] || "", mappingSource: "unmapped" };
}

function validateRepairTarget(sectionId, fieldId) {
  if (!sectionId || !fieldId) return { valid: false, sectionLabel: "", fieldLabel: "" };
  const section = form.querySelector(`details.professional-section[data-professional-section="${CSS.escape(sectionId)}"]`);
  const field = document.getElementById(fieldId);
  const focusable = field && typeof field.focus === "function" && !field.disabled;
  const containsField = Boolean(section && field && section.contains(field));
  const sectionMeta = PROFESSIONAL_REPAIR_FIELDS[sectionId];
  return {
    valid: Boolean(section && field && focusable && containsField),
    sectionLabel: sectionMeta?.label || sectionId,
    fieldLabel: sectionMeta?.fields?.[fieldId] || fieldId
  };
}

function appendGateTechnicalDetails(container, failedGates, malformedGates) {
  const details = document.createElement("details");
  details.className = "repair-technical-details";
  appendTextElement(details, "summary", "技术信息");

  if (failedGates.length) {
    const block = document.createElement("div");
    appendTextElement(block, "strong", "未通过 gate code");
    const list = document.createElement("ul");
    failedGates.forEach(gate => {
      const item = document.createElement("li");
      const task = buildRepairTasks([gate])[0];
      item.dataset.gateCode = gate.code;
      item.dataset.issueCode = task.issue_code || "";
      item.dataset.mappingSource = task.mapping_source || "";
      item.dataset.mappedField = task.mapped_field || "";
      item.textContent = `${gate.code}｜issue=${task.issue_code || "未提供"}｜field=${task.mapped_field || "未映射"}｜source=${task.mapping_source}：${gate.reason || "未说明原因"}`;
      list.appendChild(item);
    });
    block.appendChild(list);
    details.appendChild(block);
  }

  if (malformedGates.length) {
    const block = document.createElement("div");
    appendTextElement(block, "strong", "未识别的质量门槛结构");
    const list = document.createElement("ul");
    malformedGates.forEach(gate => {
      const item = document.createElement("li");
      item.textContent = `${gate.code || "unknown"}：${gate.reason || "格式异常"}`;
      list.appendChild(item);
    });
    block.appendChild(list);
    details.appendChild(block);
  }

  container.appendChild(details);
}

function appendDiagnosticsDetails(container, qualityReport = {}, failedGates = []) {
  const section = document.createElement("section");
  section.className = "diagnostics-panel";
  appendTextElement(section, "h4", "诊断信息");
  appendDiagnosticCopyControl(section, qualityReport, failedGates);
  appendIndustryProfileDiagnostics(section, qualityReport.industry_profile_diagnostics || {});
  appendRiskRuleDiagnostics(section, safeArray(qualityReport.risk_rule_diagnostics));
  appendRequiredSectionDiagnostics(section, safeArray(qualityReport.required_section_diagnostics));
  container.appendChild(section);
}

function appendIndustryProfileDiagnostics(container, diagnostic) {
  const details = document.createElement("details");
  details.className = "diagnostic-details industry-profile-diagnostics";
  appendTextElement(details, "summary", "行业与 fallback 诊断");
  appendDiagnosticField(details, "selected_industry_profile", diagnostic?.selected_industry_profile);
  appendDiagnosticField(details, "profile_trigger_terms", diagnostic?.profile_trigger_terms);
  appendDiagnosticField(details, "profile_confidence", diagnostic?.profile_confidence);
  container.appendChild(details);
}

function appendRiskRuleDiagnostics(container, diagnostics) {
  const details = document.createElement("details");
  details.className = "diagnostic-details risk-rule-diagnostics";
  appendTextElement(details, "summary", "风险规则诊断");

  if (!diagnostics.length) {
    appendTextElement(details, "p", "暂无风险规则诊断。");
    container.appendChild(details);
    return;
  }

  diagnostics.forEach((diagnostic, index) => {
    const block = document.createElement("div");
    block.className = "diagnostic-card";
    appendTextElement(block, "strong", `规则 ${index + 1}`);
    appendDiagnosticField(block, "rule_source", diagnostic?.rule_source);
    appendDiagnosticField(block, "raw_text", diagnostic?.raw_text);
    appendDiagnosticField(block, "subject_terms", diagnostic?.subject_terms);
    appendDiagnosticField(block, "entities", diagnostic?.entities);
    appendDiagnosticField(block, "prohibited_relations", diagnostic?.prohibited_relations);
    appendDiagnosticField(block, "forbidden_zones", diagnostic?.forbidden_zones);
    appendDiagnosticField(block, "matched_region", diagnostic?.matched_region);
    appendDiagnosticField(block, "matched_clause", diagnostic?.matched_clause);
    appendDiagnosticField(block, "violation_reason", diagnostic?.violation_reason);
    appendDiagnosticField(block, "parse_error", diagnostic?.parse_error);
    appendDiagnosticField(block, "fallback_reason", diagnostic?.fallback_reason);
    details.appendChild(block);
  });

  container.appendChild(details);
}

function appendRequiredSectionDiagnostics(container, diagnostics) {
  const details = document.createElement("details");
  details.className = "diagnostic-details required-section-diagnostics";
  appendTextElement(details, "summary", "必须内容覆盖诊断");

  if (!diagnostics.length) {
    appendTextElement(details, "p", "暂无必须内容覆盖诊断。");
    container.appendChild(details);
    return;
  }

  diagnostics.forEach((diagnostic, index) => {
    const block = document.createElement("div");
    block.className = "diagnostic-card";
    appendTextElement(block, "strong", `要求 ${index + 1}`);
    appendDiagnosticField(block, "required_item", diagnostic?.required_item);
    appendDiagnosticField(block, "covered", diagnostic?.covered);
    appendDiagnosticField(block, "matched_page", diagnostic?.matched_page);
    appendDiagnosticField(block, "matched_excerpt", diagnostic?.matched_excerpt);
    appendDiagnosticField(block, "coverage_reason", diagnostic?.coverage_reason);
    appendDiagnosticField(block, "keyword_only_rejected", diagnostic?.keyword_only_rejected);
    details.appendChild(block);
  });

  container.appendChild(details);
}

function appendDiagnosticField(container, label, value) {
  const paragraph = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = `${label}：`;
  paragraph.appendChild(strong);
  paragraph.append(document.createTextNode(formatDiagnosticValue(value)));
  container.appendChild(paragraph);
}

function formatDiagnosticValue(value) {
  if (Array.isArray(value)) {
    const items = value
      .map(item => formatDiagnosticValue(item))
      .filter(item => item && item !== "未提供");
    return items.length ? items.join("、") : "未提供";
  }
  if (value && typeof value === "object") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  const text = String(value ?? "").trim();
  return text || "未提供";
}

function appendDiagnosticCopyControl(container, qualityReport = {}, failedGates = []) {
  const wrapper = document.createElement("div");
  wrapper.className = "diagnostic-copy-control";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary-btn";
  button.textContent = "复制诊断 JSON";
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  const fallback = document.createElement("textarea");
  fallback.className = "diagnostic-copy-fallback";
  fallback.readOnly = true;
  fallback.hidden = true;
  fallback.setAttribute("aria-label", "手动复制诊断 JSON");

  button.addEventListener("click", async () => {
    const diagnosticText = JSON.stringify(buildDiagnosticCopyPayload(qualityReport, failedGates), null, 2);
    fallback.value = diagnosticText;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(diagnosticText);
      fallback.hidden = true;
      status.textContent = "诊断 JSON 已复制。";
    } catch {
      fallback.hidden = false;
      status.textContent = "自动复制失败，请在下方文本框中手动全选复制。";
      fallback.focus();
      fallback.select();
    }
  });

  wrapper.appendChild(button);
  wrapper.appendChild(status);
  wrapper.appendChild(fallback);
  container.appendChild(wrapper);
}

function buildDiagnosticCopyPayload(qualityReport = {}, failedGates = []) {
  const gates = safeArray(failedGates).map(gate => {
    const task = buildRepairTasks([gate])[0];
    return {
      gate_id: gate.code || "",
      reason: gate.reason || "",
      issue_code: task?.issue_code || "",
      mapped_field: task?.mapped_field || "",
      mapping_source: task?.mapping_source || ""
    };
  });
  return redactDiagnosticPayload({
    request_id: qualityReport.request_id || qualityReport.requestId || "未提供",
    quality_status: qualityReport.quality_status || "blocked",
    source_summary: qualityReport.source_summary || {},
    error_code: qualityReport.error_code || "",
    score: qualityReport.score ?? null,
    threshold: qualityReport.threshold ?? null,
    failed_gates: gates,
    warnings: safeArray(qualityReport.warnings),
    must_include: safeArray(qualityReport.must_include),
    must_include_rules: safeArray(qualityReport.must_include_rules),
    must_include_rule_source: qualityReport.must_include_rule_source || "",
    must_include_rule_diagnostics: safeArray(qualityReport.must_include_rule_diagnostics),
    must_include_rules_schema_version: qualityReport.must_include_rules_schema_version || "",
    must_include_source_count: qualityReport.must_include_source_count ?? null,
    must_include_source_hash: qualityReport.must_include_source_hash || "",
    confirmed_fact_diagnostics: safeArray(qualityReport.confirmed_fact_diagnostics),
    risk_rule_diagnostics: safeArray(qualityReport.risk_rule_diagnostics),
    required_section_diagnostics: safeArray(qualityReport.required_section_diagnostics),
    industry_profile_diagnostics: qualityReport.industry_profile_diagnostics || {},
    repair_history: safeArray(qualityReport.repairs),
    diagnostic_summary: qualityReport.diagnostic_summary || {},
    planning_model: sanitizePlanningModelForDiagnostics(qualityReport.planning_model)
  });
}

function sanitizePlanningModelForDiagnostics(model = {}) {
  return {
    enabled: model.enabled === true,
    used: model.used === true,
    status: model.status || "",
    model_id: model.model_id || "",
    reason_code: model.reason_code || "",
    content_used: model.content_used === true,
    repair_attempted: model.repair_attempted === true,
    repaired: model.repaired === true,
    fallback_used: model.fallback_used === true,
    fallback_reason: model.fallback_reason || "",
    planning_rejection_reason: model.planning_rejection_reason || ""
  };
}

function redactDiagnosticPayload(value, key = "") {
  if (shouldRedactDiagnosticKey(key)) return "[redacted]";
  if (Array.isArray(value)) return value.map(item => redactDiagnosticPayload(item, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      redactDiagnosticPayload(entryValue, entryKey)
    ]));
  }
  const localProviderMarker = ["OPEN", "WEBUI"].join("");
  const apiKeyMarker = ["API", "KEY"].join("[_-]?");
  const sensitiveValuePattern = new RegExp(`/Users/|Bearer\\s+|${localProviderMarker}|${apiKeyMarker}|TOKEN|SECRET`, "i");
  if (typeof value === "string" && sensitiveValuePattern.test(value)) {
    return "[redacted]";
  }
  return value;
}

function shouldRedactDiagnosticKey(key) {
  return /api[_-]?key|authorization|cookie|token|secret|password|env|credential|local[_-]?path|file[_-]?path/i.test(String(key || ""));
}

function repairabilityLabel(value) {
  const labels = {
    [REPAIRABILITY.REQUIRED]: "必须补充",
    [REPAIRABILITY.HELPFUL]: "建议补充",
    [REPAIRABILITY.RETRY]: "建议重试",
    [REPAIRABILITY.SYSTEM]: "系统问题",
    [REPAIRABILITY.UNKNOWN]: "未建立映射"
  };
  return labels[value] || "待处理";
}

function appendLabeledText(container, label, value) {
  const paragraph = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = `${label}：`;
  paragraph.appendChild(strong);
  paragraph.append(document.createTextNode(value));
  container.appendChild(paragraph);
}

function appendTextElement(container, tagName, text) {
  const element = document.createElement(tagName);
  element.textContent = String(text ?? "");
  container.appendChild(element);
  return element;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function canRegenerateFromProfessionalForm() {
  return activeMode === PROFESSIONAL_MODE
    && !generateBtn.disabled
    && !generateBtn.classList.contains("is-loading")
    && form.checkValidity();
}

function regenerateFromCurrentProfessionalForm() {
  if (activeMode !== PROFESSIONAL_MODE) setActiveMode(PROFESSIONAL_MODE);
  if (!canRegenerateFromProfessionalForm()) {
    form.reportValidity();
    showToast("请先补充必填信息后再生成");
    return;
  }
  generateBtn.click();
}

function goToRepairTarget(sectionId, fieldId) {
  if (activeMode !== PROFESSIONAL_MODE) setActiveMode(PROFESSIONAL_MODE);
  const target = validateRepairTarget(sectionId, fieldId);
  if (!target.valid) {
    showToast("暂时无法自动定位字段，请检查专业表单");
    return;
  }
  const section = form.querySelector(`details.professional-section[data-professional-section="${CSS.escape(sectionId)}"]`);
  const field = document.getElementById(fieldId);
  section.open = true;
  scrollToElement(field);
  const highlightTarget = field.closest(".field") || field;
  restartMotionClass(highlightTarget, "is-repair-target-highlight", 900);
  field.focus({ preventScroll: true });
}

function goToSimpleNextStepTarget(targetId) {
  if (activeMode !== SIMPLE_MODE) setActiveMode(SIMPLE_MODE);

  if (targetId === "simpleMaterialsText") {
    goToSimpleMaterialsTarget();
    return;
  }

  const field = document.getElementById(targetId);
  if (!field || typeof field.focus !== "function") {
    showToast("暂时无法自动定位字段，请在普通模式中手动补充");
    return;
  }
  if (simpleAdvancedSettings.contains(field)) simpleAdvancedSettings.open = true;
  scrollToElement(field);
  const highlightTarget = field.closest(".field") || field;
  restartMotionClass(highlightTarget, "is-repair-target-highlight", 900);
  field.focus({ preventScroll: true });
}

function goToSimpleMaterialsTarget() {
  simpleAdvancedSettings.open = true;
  const selectedRadio = document.querySelector('input[name="simpleMaterials"]:checked');
  const materialsText = document.getElementById("simpleMaterialsText");
  const hasMaterialsMode = selectedRadio?.value === SIMPLE_MATERIALS_WITH_DETAILS;

  if (!hasMaterialsMode) {
    const radioTarget = selectedRadio || simpleMaterialsRadios[0];
    const group = radioTarget?.closest("fieldset") || radioTarget;
    if (!radioTarget || typeof radioTarget.focus !== "function") {
      showToast("请先在客户资料情况中选择资料状态");
      return;
    }
    scrollToElement(group);
    restartMotionClass(group, "is-repair-target-highlight", 900);
    radioTarget.focus({ preventScroll: true });
    showToast("请先选择“有文字资料 / 图片 / 文件，需要整理”");
    return;
  }

  if (!materialsText || typeof materialsText.focus !== "function") {
    showToast("暂时无法定位客户资料输入区");
    return;
  }
  scrollToElement(materialsText);
  const highlightTarget = materialsText.closest(".field") || materialsText;
  restartMotionClass(highlightTarget, "is-repair-target-highlight", 900);
  materialsText.focus({ preventScroll: true });
  if (!materialsText.value.trim()) showToast("请补充客户资料内容");
}

function migrateSimpleFieldsToProfessional() {
  const simpleNeed = document.getElementById("simpleNeed");
  const topic = document.getElementById("topic");
  setIfEmpty(topic, simpleNeed?.value.trim() || "");

  const simpleMaterialsText = document.getElementById("simpleMaterialsText");
  const materialDetails = document.getElementById("materialDetails");
  setIfEmpty(materialDetails, simpleMaterialsText?.value.trim() || "");

  const simpleDeadline = document.getElementById("simpleDeadline");
  const professionalDeadline = document.getElementById("professionalDeadline");
  if (simpleDeadline && professionalDeadline && selectHasOptionValue(professionalDeadline, simpleDeadline.value)) {
    setIfEmpty(professionalDeadline, simpleDeadline.value);
  }

  const simplePurpose = document.getElementById("simplePurpose");
  const detailedPurpose = document.getElementById("detailedPurpose");
  if (simplePurpose && simplePurpose.value !== "auto") {
    const purposeText = simplePurpose.options[simplePurpose.selectedIndex]?.textContent.trim() || "";
    setIfEmpty(detailedPurpose, purposeText);
  }

  showToast("已带入可安全迁移的信息，请继续完善专业表单");
}

function setIfEmpty(field, value) {
  if (!field || typeof field.value !== "string") return false;
  if (field.value.trim() || !value) return false;
  field.value = value;
  return true;
}

function selectHasOptionValue(select, value) {
  return Boolean(value) && Array.from(select.options || []).some(option => option.value === value);
}

function scrollToElement(element) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
}

async function requestOutline(input) {
  const response = await fetch("/api/outline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error || `请求失败（HTTP ${response.status}）`);
    error.publicResponse = payload;
    error.qualityReport = buildPublicErrorQualityReport(payload);
    error.code = payload?.error_code || payload?.code || "";
    throw error;
  }
  validateOutlineResponse(payload);
  return payload;
}

function buildPublicErrorQualityReport(payload = {}) {
  const report = payload?.quality_report && typeof payload.quality_report === "object"
    ? payload.quality_report
    : {};
  return {
    ...report,
    quality_status: payload?.quality_status || report.quality_status || "blocked",
    source_summary: payload?.source_summary || report.source_summary || {},
    error_code: payload?.error_code || report.error_code || ""
  };
}

async function requestPlanningStage(input) {
  const response = await fetch("/api/planning-stage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || `请求失败（HTTP ${response.status}）`);
  return payload || {};
}

function renderQuestions(questions, notice = "") {
  questionBox.classList.remove("muted-box");
  questionBox.innerHTML = `${notice ? `<p class="muted-note">${escapeHtml(notice)}</p>` : ""}<ol>${questions.map(question => `<li>${escapeHtml(question)}</li>`).join("")}</ol>`;
}

function renderSummary(result) {
  summaryBox.classList.remove("muted-box");
  const sections = [
    result.summary,
    ...(result.confirmed_facts?.length ? [`已确认事实：${result.confirmed_facts.join("；")}`] : []),
    ...(result.explicit_requirements?.length ? [`明确要求：${result.explicit_requirements.join("；")}`] : []),
    ...(result.pending_items?.length ? [`待确认项：${result.pending_items.join("；")}`] : []),
    ...(result.prohibitions?.length ? [`禁止内容：${result.prohibitions.join("；")}`] : [])
  ].filter(Boolean);
  const notice = result.fallback_used ? `<p class="muted-note">规则备用草稿（本地模型未成功完成本阶段：${escapeHtml(result.reason_code || "UNKNOWN")}）</p>` : "";
  summaryBox.innerHTML = `${notice}${sections.map(item => `<p>${escapeHtml(item)}</p>`).join("")}`;
}

function isLocalServiceConnectionError(message) {
  return /无法连接本地生成服务/.test(message);
}

function modelFailureHint(code) {
  const hints = {
    LOCAL_MODEL_CONFIG_MISSING: "本地规划模型缺少有效配置，请检查服务端 .env。",
    LOCAL_MODEL_TIMEOUT: "本地规划模型响应超时，本次未完成模型规划。",
    LOCAL_MODEL_UNAVAILABLE: "无法连接本地规划模型，请检查已配置的 OpenAI-compatible 本地服务。",
    LOCAL_MODEL_HTTP_ERROR: "本地规划模型返回错误状态，请检查模型服务日志。",
    INVALID_MODEL_RESPONSE: "本地规划模型返回内容为空或格式无效。",
    INVALID_MODEL_JSON: "本地规划模型未返回可用 JSON，已被安全拦截。"
  };
  return hints[code] || "";
}

function validateOutlineResponse(outline) {
  const successfulStatus = ["production_ready", "review_required", "fallback"].includes(outline?.quality_status);
  if (!outline
    || outline.success !== true
    || !successfulStatus
    || typeof outline.title !== "string"
    || !outline.title.trim()
    || !Array.isArray(outline.slides)
    || !outline.slides.length
    || typeof outline.customer_version !== "string"
    || !outline.customer_version.trim()
    || typeof outline.production_version !== "string"
    || !outline.production_version.trim()) {
    throw new Error("接口返回的数据结构不完整");
  }
  const valid = outline.slides.every((slide, offset) => {
    return slide?.index === offset + 1
      && ["title", "content", "visual_suggestion"].every(key => typeof slide[key] === "string" && slide[key].trim());
  });
  if (!valid) throw new Error("接口返回的 slides 数据不完整");
}

function resetProfessionalMode() {
  form.reset();
  document.querySelector('input[name="materials"][value="只有主题"]').checked = true;
  followAnswers.value = "";
  latestQuestions = [];
  latestSummary = "";
  resultCache[PROFESSIONAL_MODE] = emptyResultState();
  currentClientText = "";
  currentProductionText = "";
  questionBox.className = "muted-box";
  questionBox.textContent = "填写项目需求后，点击“生成追问”。";
  summaryBox.className = "muted-box";
  summaryBox.textContent = "点击“生成需求摘要”后，会整理主题、场景、观众、目的、重点、风格、风险和交付内容。";
  if (activeMode === PROFESSIONAL_MODE) renderModeResult();
}

function collectSimpleForm() {
  const rawNeed = normalizeUserInput(document.getElementById("simpleNeed").value);
  if (!rawNeed) {
    showToast("请先填写一句话需求");
    document.getElementById("simpleNeed").focus();
    return null;
  }

  return {
    rawNeed,
    materialStatus: document.querySelector('input[name="simpleMaterials"]:checked')?.value || "只有一句话需求",
    materialsText: normalizeClientMaterials(document.getElementById("simpleMaterialsText").value),
    pageChoice: document.getElementById("simplePageCount").value,
    customPage: document.getElementById("simpleCustomPageCount").value,
    styleChoice: document.getElementById("simpleStyle").value,
    purposeChoice: document.getElementById("simplePurpose").value,
    deadline: normalizeUserInput(document.getElementById("simpleDeadline").value)
  };
}

function inferSimpleNeed(formData) {
  const source = `${formData.rawNeed} ${formData.materialsText}`;
  const purpose = inferSimplePurpose(formData, source);
  const topic = inferSimpleTopic(formData.rawNeed);
  const focusItems = inferSimpleFocusItems(formData.rawNeed, formData.materialsText, topic, purpose);
  const pageCount = inferSimplePageCount(formData);
  const style = inferSimpleStyle(formData, source);
  const profile = simplePurposeProfiles[purpose] || simplePurposeProfiles["其他"];
  const hasDetailedMaterials = formData.materialStatus !== "只有一句话需求" && Boolean(formData.materialsText);

  return {
    ...formData,
    topic,
    pageCount,
    style,
    purpose,
    focusItems,
    profile,
    hasDetailedMaterials,
    audience: inferSimpleAudience(source, profile),
    missingMaterials: buildSimpleMissingMaterials(topic, purpose)
  };
}

function inferSimplePageCount(formData) {
  if (formData.pageChoice === "custom") {
    return clampPageCount(formData.customPage || 8);
  }

  if (formData.pageChoice !== "auto") {
    return clampPageCount(formData.pageChoice);
  }

  const source = formData.rawNeed;
  const digitMatch = source.match(/(\d{1,2})\s*页/);
  if (digitMatch) return clampPageCount(digitMatch[1]);

  const chinesePageMap = {
    "六": 6,
    "八": 8,
    "十": 10,
    "十二": 12
  };
  const chineseMatch = source.match(/(十二|十|八|六)\s*页/);
  if (chineseMatch) return chinesePageMap[chineseMatch[1]] || 8;

  return 8;
}

function inferSimpleStyle(formData, source) {
  if (formData.styleChoice !== "auto") return formData.styleChoice;
  if (/高级|高端|大气|质感/.test(source)) return "高级";
  if (/科技|AI|ai|人工智能|数字化|新能源|系统/.test(source)) return "科技感";
  if (/温暖|咖啡店|开业|生活方式|治愈|亲和/.test(source)) return "温暖";
  if (/答辩|论文|课题|毕业/.test(source)) return "答辩风";
  if (/招商|路演|融资|入驻/.test(source)) return "招商路演风";
  if (/汇报|商务|公司|企业|方案/.test(source)) return "商务正式";
  if (/活泼|轻松|可爱|课堂互动/.test(source)) return "活泼";
  if (/视觉冲击|醒目|海报|宣传感/.test(source)) return "视觉冲击强";
  return "简洁";
}

function inferSimplePurpose(formData, source) {
  if (formData.purposeChoice !== "auto") return formData.purposeChoice;
  const requirementPurpose = inferRequirementPurpose(formData.rawNeed);
  if (requirementPurpose) return requirementPurpose;
  return inferPurposeFromSource(source);
}

function inferRequirementPurpose(rawNeed) {
  const requirement = normalizeUserInput(rawNeed);
  if (!requirement) return "";
  if (/开业|活动|宣传|朋友圈|海报|到店|探店/.test(requirement)) return "活动宣传";
  if (/作业|课程汇报|老师|课堂|小组展示/.test(requirement)) return "作业 / 课程汇报";
  if (/答辩|论文|毕业|课题/.test(requirement)) return "答辩展示";
  if (/培训课件|用于培训|内训|教学|课程/.test(requirement)) return "培训课件";
  if (isProductIntroRequirement(requirement)) return "产品介绍";
  if (isInvestmentOr招商Requirement(requirement)) return "招商方案";
  if (/商业|客户画像|市场|竞品|行业|报告|调研/.test(requirement)) return "商业汇报";
  if (/公司|企业|品牌介绍|团队介绍/.test(requirement)) return "公司介绍";
  return "";
}

function isProductIntroRequirement(requirement) {
  if (/公司与产品介绍\s*(?:PPT|ppt|幻灯片|演示文稿)?|企业与产品介绍\s*(?:PPT|ppt|幻灯片|演示文稿)?|产品介绍|产品能力介绍|产品能力|功能介绍|服务介绍|解决方案介绍/.test(requirement)) return true;
  return /用于向[^，,。；;]{2,80}?介绍/.test(requirement)
    && /企业定位|核心产品|产品能力|检测能力|检测场景|定制方案|实施流程|交付服务|公司能力|产品组合|合作方式|合作路径|应用场景|产线集成/.test(requirement);
}

function isInvestmentOr招商Requirement(requirement) {
  if (/招商|园区招商|招商推介|招商路演|入驻|融资路演|投资人|投资机构|投资者|入驻企业招募|招募入驻企业/.test(requirement)) return true;
  return false;
}

function inferPurposeFromSource(source) {
  if (/开业|活动|宣传|朋友圈|海报|到店|探店/.test(source)) return "活动宣传";
  if (/作业|课程汇报|老师|课堂|小组展示/.test(source)) return "作业 / 课程汇报";
  if (/答辩|论文|毕业|课题/.test(source)) return "答辩展示";
  if (/培训|员工|课程|内训|教学/.test(source)) return "培训课件";
  if (/商业|分析|客户画像|市场|竞品|行业|报告|调研/.test(source)) return "商业汇报";
  if (/产品|服务|解决方案|功能|卖点/.test(source)) return "产品介绍";
  if (/公司|企业|品牌介绍|团队介绍/.test(source)) return "公司介绍";
  if (isInvestmentOr招商Requirement(source)) return "招商方案";
  return "其他";
}

function inferSimpleTopic(rawNeed) {
  const normalized = normalizeUserInput(rawNeed);
  let candidate = normalized.split(/PPT|ppt|幻灯片/)[0] || normalized.split(/[，,。；;]/)[0] || normalized;

  for (let index = 0; index < 8; index += 1) {
    candidate = candidate
      .replace(/^(请|麻烦|帮我|给我|我要|我想|想要|需要|做|制作|设计|生成|出|弄|一个|一份|份|关于|围绕)\s*/g, "")
      .trim();
  }

  candidate = candidate
    .replace(/\d{1,2}\s*页(左右)?/g, "")
    .replace(/(十二|十|八|六)\s*页(左右)?/g, "")
    .replace(/风格.*$/g, "")
    .replace(/明天.*$/g, "")
    .replace(/今晚.*$/g, "")
    .replace(/[\s，,。；;：:]+$/g, "")
    .trim();

  if (!candidate || candidate.length > 34) {
    candidate = normalized.split(/[，,。；;]/)[0] || normalized;
    candidate = candidate.replace(/^(请|麻烦|帮我|给我|我要|我想|想要|需要|做|制作|设计|生成|一个|一份|关于|围绕)\s*/g, "").trim();
  }

  return candidate || "PPT 方案";
}

function inferSimpleFocusItems(rawNeed, materialsText, topic, purpose) {
  const focusFromSentence = extractFocusItemsFromSentence(rawNeed);
  if (focusFromSentence.length) return focusFromSentence.slice(0, 8);

  const focusFromMaterials = extractFocusItemsFromSentence(materialsText);
  if (focusFromMaterials.length) return focusFromMaterials.slice(0, 8);

  if (/新能源汽车|客户画像/.test(topic)) {
    return ["市场背景与分析目标", "新能源汽车用户画像", "配置偏好", "性能关注点", "价格区间与购买决策", "目标人群分层", "消费痛点与机会点", "总结与建议"];
  }

  if (/咖啡店|开业/.test(topic)) {
    return ["门店定位", "开业亮点", "产品与环境", "目标客群", "活动玩法", "朋友圈传播内容", "行动号召"];
  }

  const defaults = {
    "作业 / 课程汇报": ["主题背景", "核心观点", "分析过程", "案例或资料", "结论复盘"],
    "商业汇报": ["背景与问题", "分析维度", "核心发现", "拆解分析", "机会点与建议"],
    "产品介绍": ["客户痛点", "产品定位", "核心卖点", "应用场景", "合作方式"],
    "公司介绍": ["公司定位", "业务范围", "核心优势", "服务流程", "合作价值"],
    "招商方案": ["项目定位", "资源优势", "入驻价值", "服务支持", "合作路径"],
    "培训课件": ["课程目标", "知识框架", "核心方法", "实操练习", "行动清单"],
    "答辩展示": ["研究背景", "研究目标", "研究方法", "结果展示", "结论展望"],
    "活动宣传": ["活动主题", "亮点展示", "产品或场景", "目标人群", "传播渠道", "行动号召"],
    "其他": ["背景说明", "核心目标", "重点内容", "执行思路", "总结与下一步"]
  };

  return defaults[purpose] || defaults["其他"];
}

function extractFocusItemsFromSentence(text) {
  const source = normalizeUserInput(text);
  const matched = source.match(/从(.+?)(?:几个方面|方面|维度|角度)(?:分析|展开|来讲|说明)?/);
  if (!matched) return [];
  return splitListItems(matched[1]).filter(item => !/等|几个/.test(item));
}

function inferSimpleAudience(source, profile) {
  if (/咖啡店|门店|开业|本地生活|朋友圈|餐饮|生活方式|顾客|到店|探店/.test(source)) {
    if (/招商/.test(source)) return "顾客、朋友圈读者和轻量招商沟通对象";
    return "顾客、朋友圈读者或本地生活受众";
  }
  if (/老板|领导|管理层/.test(source)) return "老板、领导或管理层";
  if (/客户|甲方|合作方|招商/.test(source)) return "客户、合作方或招商沟通对象";
  if (/老师|课堂|课程|作业/.test(source)) return "老师、同学或课程评审";
  if (/评委|答辩|论文|毕业/.test(source)) return "老师、评委或专家";
  if (/员工|学员|培训|内训/.test(source)) return "员工、学员或培训对象";
  if (/朋友圈|开业|活动|顾客/.test(source)) return "潜在顾客、合作方或社交平台受众";
  return profile.audience;
}

function buildSimpleMissingMaterials(topic, purpose) {
  if (/新能源汽车|客户画像/.test(topic)) {
    return "真实销售或用户调研数据、品牌/车型资料、价格区间来源、用户访谈或画像样本、图表口径、配图素材";
  }

  if (/咖啡店|开业/.test(topic)) {
    return "门店照片、门店地址、菜单、Logo、营业时间、开业活动规则、朋友圈图片素材、联系方式";
  }

  const missingMap = {
    "商业汇报": "真实数据来源、分析口径、客户资料、品牌资料、案例素材、图表原始文件",
    "产品介绍": "产品资料、功能说明、真实截图、价格或合作方式、客户案例授权、品牌视觉规范",
    "公司介绍": "公司 Logo、业务资料、团队信息、代表项目、资质材料、联系方式",
    "招商方案": "项目资料、招商政策、区位或资源证明、合作模式、现场图片、联系人信息",
    "培训课件": "课程目标、学员背景、案例材料、练习任务、内部规范、讲师要求",
    "活动宣传": "活动时间地点、主视觉、产品图片、活动规则、报名或咨询方式、品牌素材",
    "答辩展示": "论文或课题资料、研究方法、实验/调研结果、参考文献、导师要求",
    "作业 / 课程汇报": "课程要求、评分标准、参考资料、案例素材、课堂展示时长",
    "其他": "主题背景、关键资料、图片素材、参考风格、审核负责人"
  };

  return missingMap[purpose] || missingMap["其他"];
}

function buildSimpleOutline(need) {
  const structure = buildSimpleStructure(need);
  const pages = buildSimplePages(need, structure);
  const title = `${need.topic}｜${need.profile.scene}方案`;

  return {
    title,
    logic: buildSimpleLogic(need, structure),
    summary: buildSimpleSummary(need, structure),
    pages,
    closing: buildSimpleClosing(need),
    proofNote: buildSimpleRiskNotice(need)
  };
}

function buildSimpleStructure(need) {
  if (need.purpose === "商业汇报" && need.pageCount === 10) {
    const hasVehicleFocus = /新能源汽车|客户画像/.test(need.topic) || need.focusItems.some(item => /配置|性能|价格|目标人群/.test(item));
    if (hasVehicleFocus) {
      return [
        "封面",
        "分析背景",
        "分析目标与方法",
        "目标人群概览",
        "配置偏好分析",
        "性能关注点分析",
        "价格区间分析",
        "购买决策因素",
        "机会点与建议",
        "总结与下一步"
      ];
    }
  }

  const base = simpleStructureTemplates[need.purpose] || simpleStructureTemplates["其他"];
  return fitSimpleStructure(base, need.pageCount, need);
}

function fitSimpleStructure(base, count, need) {
  if (count === base.length) return [...base];
  if (count < base.length) return base.slice(0, count - 1).concat(base[base.length - 1]).slice(0, count);

  const structure = [...base];
  const expansionItems = getSimpleExpansionItems(need).filter(item => !structure.includes(item));
  let index = 0;
  while (structure.length < count) {
    const next = expansionItems[index] || `重点深化 ${index + 1}`;
    structure.splice(structure.length - 1, 0, next);
    index += 1;
  }
  return structure.slice(0, count);
}

function getSimpleExpansionItems(need) {
  if (need.purpose === "商业汇报") {
    return ["分析目标与方法", "目标人群概览", "配置偏好分析", "性能关注点分析", "价格区间分析", "购买决策因素", "机会点与建议"];
  }
  return need.focusItems.map(item => `${item}深化`);
}

function buildSimpleLogic(need, structure) {
  if (isSimpleLifestyleNeed(need)) {
    const light招商 = /招商/.test(need.rawNeed) ? "若需要兼顾招商，只把门店定位、客群和传播亮点作为辅助说明，不把整份内容做成路演稿。" : "";
    return `整体逻辑采用“${structure.join(" → ")}”展开。先建立《${need.topic}》的开业第一印象，再用门店氛围、产品画面、目标客群、活动玩法和朋友圈传播把“为什么值得来”讲清楚，最后落到到店入口和资料确认。${light招商}`;
  }

  return `整体逻辑采用“${structure.join(" → ")}”展开。先把${need.topic}的沟通目标讲清楚，再围绕${need.focusItems.join("、")}组织正文，最后收束到资料确认和下一步动作。`;
}

function buildSimpleSummary(need, structure) {
  const base = isSimpleLifestyleNeed(need)
    ? `这是一份 ${need.pageCount} 页面向顾客、朋友圈传播和门店开业沟通的宣传型 PPT 初稿，整体采用${need.style}风格。内容会先营造《${need.topic}》的第一印象，再展开门店定位、开业亮点、产品与环境、目标客群、活动玩法和传播入口，让客户看完就知道正式制作时要补哪些真实素材。`
    : `这是一份 ${need.pageCount} 页${need.profile.scene} PPT 初稿，面向${need.audience}，整体采用${need.style}风格。内容主线从${structure[0]}进入，逐步展开${need.focusItems.slice(0, 5).join("、")}，最后给出总结和下一步沟通动作。`;
  const deadline = need.deadline ? `交付节奏可按“${need.deadline}”预留审核与修改时间。` : "";
  const materialLine = need.hasDetailedMaterials
    ? "已提供资料应优先作为正文依据，资料中没有出现的数据、客户名称、品牌合作、案例、价格和效果承诺不写入正文。"
    : "客户目前只提供基础需求，以下内容为初步方案，具体数据、案例、品牌信息、图片素材和细节仍需客户进一步确认。";

  return compactText([base, materialLine, deadline]);
}

function buildSimplePages(need, structure) {
  const style = simpleStyleProfiles[need.style] || simpleStyleProfiles["简洁"];
  return structure.map((section, index) => {
    const pageNo = index + 1;
    const isFirst = pageNo === 1;
    const isLast = pageNo === structure.length;

    return {
      pageNo,
      title: buildSimplePageTitle(section, need, isFirst, isLast),
      content: buildSimplePageContent(section, need, isFirst, isLast),
      talkFocus: buildSimpleTalkFocus(section, need, isFirst, isLast),
      image: buildSimpleImageSuggestion(section, need, isFirst, isLast),
      layout: buildSimpleLayoutSuggestion(section, need, style, isFirst, isLast),
      speaker: buildSimpleSpeakerNote(section, need, isFirst, isLast)
    };
  });
}

function buildSimplePageTitle(section, need, isFirst, isLast) {
  if (isFirst) return `${need.topic}：方案封面`;
  if (isLast) return /行动号召/.test(section) ? "行动号召" : "总结与下一步";
  return section;
}

function buildSimplePageContent(section, need, isFirst, isLast) {
  const materialNote = need.hasDetailedMaterials
    ? "正文优先整理客户已提供资料，未在资料中出现的信息保持为空或放入后续确认清单。"
    : "这一页只搭结构和表达方向，真实数据、图片和案例需要后续确认。";

  if (isFirst) {
    if (isSimpleLifestyleNeed(need)) {
      return `封面要先给出《${need.topic}》的开业第一印象：温暖、清楚、有画面感。副标题可以写成“门店开业宣传初稿”，让客户知道这份 PPT 主要服务到店沟通、朋友圈传播和开业资料整理。`;
    }

    return `封面明确《${need.topic}》的主题、用途和整体风格。副标题可写成“${need.profile.scene}初稿”，让客户一眼知道这份 PPT 用于${need.profile.goal}。`;
  }

  if (isLast) {
    if (isSimpleLifestyleNeed(need)) {
      return `用温暖但明确的方式收束全篇：前半部分回顾门店定位、开业亮点、产品环境和传播入口，后半部分列出正式制作前要补齐的资料，包括${need.missingMaterials}。`;
    }

    return `收束全篇重点，回到《${need.topic}》的核心目的：${need.profile.goal}。页面下半部分放资料确认清单和下一步动作，建议补充：${need.missingMaterials}。`;
  }

  if (/分析背景|背景与问题|主题背景|招商背景|研究背景|背景说明/.test(section)) {
    return `说明为什么需要做《${need.topic}》：从当前场景、沟通对象和要解决的问题切入，建立分析或展示的必要性。${materialNote}`;
  }

  if (/分析目标|汇报目标|研究目标|核心目标/.test(section)) {
    return `明确本次 PPT 要回答的问题和分析范围，建议围绕${need.focusItems.join("、")}建立正文框架。方法表达保持稳妥，具体样本、口径和数据来源由客户确认。`;
  }

  if (/目标人群|客群/.test(section)) {
    return `搭建目标人群分析页，建议从基础属性、使用场景、购买或到店动机、决策顾虑和内容偏好几个维度写。具体人群分层以客户提供的调研、门店位置或业务资料为准。`;
  }

  if (/配置/.test(section)) {
    return `围绕配置偏好展开，建议拆成续航、空间、智能座舱、辅助驾驶、舒适性配置等方向。页面只写分析维度和判断逻辑，不写未经确认的车型数据或占比。`;
  }

  if (/性能/.test(section)) {
    return `围绕性能关注点展开，建议说明动力体验、续航表现、补能便利性、安全性和长期使用成本如何影响用户判断。具体参数和对比结论以客户资料为准。`;
  }

  if (/价格/.test(section)) {
    return `围绕价格区间和购买决策展开，建议用入门、主流、高端等层级表达预算差异，不直接写具体价格数字。若需要价格表，必须由客户提供车型、区域和时间口径。`;
  }

  if (/购买决策/.test(section)) {
    return `拆解影响决策的关键因素：品牌信任、使用成本、补能条件、售后服务、家庭需求和政策环境。页面重点是解释决策链路，不承诺具体转化效果。`;
  }

  if (/核心发现|核心观点/.test(section)) {
    return `提炼 3 到 4 个可直接进入 PPT 的核心判断，每个判断都要对应客户提供的信息或后续需要验证的材料。避免使用夸张排名和绝对化措辞。`;
  }

  if (/人群 \/ 市场 \/ 产品拆解|拆解分析|分析过程/.test(section)) {
    return `把《${need.topic}》拆成${need.focusItems.slice(0, 5).join("、")}几个模块，每个模块只服务一个结论。${materialNote}`;
  }

  if (/机会点|策略建议/.test(section)) {
    return `把前面的分析转化为可执行建议，建议从内容表达、产品/服务优化、传播重点、客户沟通和资料准备几个方向提出。所有建议都保持为方向，不写未经验证的收益承诺。`;
  }

  if (/门店定位|公司定位|产品定位|项目 \/ 园区 \/ 品牌定位|封面与产品定位/.test(section)) {
    if (isSimpleLifestyleNeed(need)) {
      return `明确这家店想给顾客留下的第一印象：适合谁来、适合什么场景、希望大家记住什么关键词。门店地址、品牌故事和空间照片需要客户提供后再写进正式稿。`;
    }

    return `明确《${need.topic}》的定位：服务谁、解决什么需求、希望给听众留下什么第一印象。若涉及门店、品牌或项目背景，地址、品牌故事和创始信息必须由客户确认后再写。`;
  }

  if (/开业亮点|活动主题|亮点/.test(section)) {
    if (isSimpleLifestyleNeed(need)) {
      return `把开业亮点写成顾客愿意第一次到店的理由，例如氛围、产品、体验、拍照点或社交分享点。优惠、价格、赠品和具体活动时间必须等客户确认后再落文案。`;
    }

    return `提炼开业或活动亮点，可以从空间氛围、产品特色、体验感、互动玩法和传播话题展开。优惠、价格、赠品和时间节点不直接编写，等客户确认活动规则后再落文案。`;
  }

  if (/产品与环境|产品 \/ 服务能力|代表产品 \/ 服务|产品或场景/.test(section)) {
    if (isSimpleLifestyleNeed(need)) {
      return `这一页用产品和空间建立“想来坐坐”的感觉：咖啡产品、吧台细节、座位区、自然光、外带杯或菜单都可以作为画面方向。没有实拍图时先预留图片位，不虚构真实门店画面。`;
    }

    return `展示产品、服务或门店环境的可视内容。优先使用真实图片、菜单、产品图、空间照片或服务截图；如果暂无素材，先预留图片位和说明文案。`;
  }

  if (/活动玩法/.test(section)) {
    if (isSimpleLifestyleNeed(need)) {
      return `把参与方式讲清楚，但不要替客户编优惠规则。页面可以先预留打卡、试饮、分享、预约或到店咨询等模块，等客户确认活动细节后再补正式文案。`;
    }

    return `设计活动玩法页，建议预留到店打卡、试饮体验、会员引导、社交分享或预约咨询等模块。具体玩法、优惠力度和参与规则必须由客户确认。`;
  }

  if (/朋友圈传播|传播渠道/.test(section)) {
    if (isSimpleLifestyleNeed(need)) {
      return `把朋友圈内容整理成好转发、好理解、有画面感的表达：先放主视觉，再放产品和环境，最后放开业信息与咨询入口。地址、营业时间和联系方式等关键信息等客户确认后再写。`;
    }

    return `整理朋友圈或社交平台传播内容：主视觉标题、短文案、图片顺序、转发理由和咨询入口。文案要温暖、简洁、适合转发，不编写未经确认的地址、价格或营业时间。`;
  }

  if (/客户痛点/.test(section)) {
    return `说明目标客户为什么需要这项产品或服务，建议从现实困扰、现有方案不足和使用期待切入。${materialNote}`;
  }

  if (/核心卖点|核心优势|资源优势/.test(section)) {
    return `提炼 3 到 4 个核心优势，每个优势都要对应实际能力、资源或服务动作。避免写“行业第一”“唯一”等夸张表达。`;
  }

  if (/应用场景|适用客户|入驻价值|合作价值/.test(section)) {
    return `按真实使用场景说明价值，让听众知道什么情况下适合继续沟通。涉及客户案例、合作品牌或效果表现时，只使用客户确认材料。`;
  }

  if (/使用流程|服务流程|落地流程|核心方法/.test(section)) {
    return `把执行路径拆成清楚步骤：需求确认、资料整理、初稿制作、审核修改、最终交付或落地。每一步都写清客户需要配合的动作。`;
  }

  if (/资料准备|合作方式|合作模式|联系与下一步|下一步沟通/.test(section)) {
    return `说明下一步合作或制作前需要确认的资料，建议列出${need.missingMaterials}。这页用于降低沟通成本，让客户知道接下来要给什么。`;
  }

  if (/课程目标|为什么要学|知识框架|实操练习|常见问题|使用边界|行动清单/.test(section)) {
    return `围绕培训学习展开：先说明学习目标，再讲方法框架和实际练习。涉及内部制度、工具账号、案例资料和考核要求时，以客户确认信息为准。`;
  }

  if (/研究方法|过程与依据|结果展示|结论与创新|不足与展望/.test(section)) {
    return `按答辩逻辑表达这一页：说明方法、过程、依据或结论之间的关系。实验数据、参考文献和导师要求必须由客户提供，不能凭空补结论。`;
  }

  return `本页围绕“${section}”展开，先给一句核心结论，再用 2 到 3 个要点说明与《${need.topic}》的关系。${materialNote}`;
}

function buildSimpleTalkFocus(section, need, isFirst, isLast) {
  const mappedFocus = getSimpleSectionTalkFocus(section, need, isFirst, isLast);
  if (mappedFocus) return mappedFocus;

  return `这一页聚焦“${section}”的核心表达，先把它和《${need.topic}》的关系讲清楚，再说明正式制作时需要客户确认哪些素材或口径。`;
}

function buildSimpleImageSuggestion(section, need, isFirst, isLast) {
  const mappedImage = getSimpleSectionImageSuggestion(section, need, isFirst, isLast);
  if (mappedImage) return mappedImage;

  if (/招商|园区|入驻/.test(`${need.topic}${section}`)) return "建议使用项目实景、区位图、资源地图、合作流程图或入驻价值矩阵。";
  if (/培训|课程|知识|练习/.test(`${need.topic}${section}`)) return "建议使用知识框架图、步骤图、练习卡片或课堂互动页。";
  return "建议使用与页面主题匹配的真实图片、流程图、信息卡或表格，不使用不存在的案例截图。";
}

function buildSimpleLayoutSuggestion(section, need, style, isFirst, isLast) {
  if (isFirst) return `封面采用主标题、副标题、场景图三层结构，整体视觉保持${style.visual}。`;
  if (isLast) return "结尾页采用左侧三点总结、右侧资料清单和下一步动作的结构。";
  if (/分析|目标人群|配置|性能|价格|购买决策/.test(section)) return "建议采用左侧结论、右侧矩阵/图表的结构，并在角标预留资料来源位置。";
  if (/门店|开业|产品与环境|朋友圈/.test(section)) return "建议采用大图加短文案结构，用 2 到 3 个卡片承接关键信息。";
  return style.layout;
}

function buildSimpleSpeakerNote(section, need, isFirst, isLast) {
  const mappedNote = getSimpleSectionSpeakerNote(section, need, isFirst, isLast);
  if (mappedNote) return mappedNote;

  return `这一页可以先解释“${section}”为什么放在这里，再告诉客户正式制作时需要哪些材料支撑。没有客户确认的信息，保持为方向性表达。`;
}

function isSimpleLifestyleNeed(need) {
  const source = `${need.topic} ${need.rawNeed} ${need.purpose} ${need.style}`;
  return /活动宣传|开业|咖啡店|门店|本地生活|朋友圈|餐饮|生活方式|顾客|到店|探店/.test(source);
}

function getSimpleSectionImageSuggestion(section, need, isFirst, isLast) {
  const cleanSection = cleanSectionName(section);

  if (isSimpleLifestyleNeed(need)) {
    const lifestyleImages = {
      "封面": "建议使用门店外观、暖色咖啡产品图或自然光空间图作为主视觉；没有实拍图时先预留一张大图位，标题压在画面留白处。",
      "门店定位": "建议使用门店外观、空间氛围图或品牌关键词板，帮助设计师先建立这家店的气质方向。",
      "开业亮点": "建议使用开业海报主视觉、亮点卡片或活动主视觉，不直接放未经确认的优惠金额和活动规则。",
      "产品与环境": "建议使用咖啡产品特写、吧台细节、座位区、自然光场景或菜单局部图，重点营造“想来坐坐”的画面感。",
      "目标客群": "建议使用生活方式人群图、消费场景图或客群标签卡，表达适合办公、约会、独处、朋友小聚等场景。",
      "活动玩法": "建议使用打卡流程图、开业活动卡片或社交分享示意，把参与路径画清楚，具体优惠内容等客户确认。",
      "朋友圈传播内容": "建议使用朋友圈九宫格样机、主视觉图和短文案样式，标出图片顺序、转发理由和咨询入口。",
      "行动号召": "建议使用到店路线、预约二维码占位、联系方式卡片或下一步动作清单，地址和二维码等真实信息由客户提供。"
    };

    if (isFirst) return lifestyleImages["封面"];
    if (isLast) return lifestyleImages["行动号召"];
    if (lifestyleImages[cleanSection]) return lifestyleImages[cleanSection];
  }

  const analysisImages = {
    "封面": "建议使用新能源汽车主视觉、人群标签和分析主题副标题组合，不放未经授权的品牌车型实拍图。",
    "分析背景": "建议使用行业趋势图、用户变化趋势、市场背景图或数据来源占位，视觉上先建立分析语境。",
    "分析目标与方法": "建议使用分析框架图、研究路径图或维度拆解图，把配置、性能、价格、目标人群的关系画清楚。",
    "目标人群概览": "建议使用用户画像卡片、人群分层矩阵或典型用户标签，具体标签需等待调研数据验证。",
    "配置偏好分析": "建议使用配置对比表、功能偏好矩阵或车型配置卡片，数据列先做占位，等客户提供口径后填入。",
    "性能关注点分析": "建议使用性能指标雷达图、续航 / 补能 / 安全维度图或使用场景对比图，不编造具体参数。",
    "价格区间分析": "建议使用价格带分层图、预算区间矩阵或价格敏感度示意，具体价格区间由客户资料确认。",
    "购买决策因素": "建议使用决策链路图、影响因素权重图或购买路径图，呈现从关注到比较再到购买的过程。",
    "机会点与建议": "建议使用策略矩阵、机会点卡片或行动优先级图，把分析结果转成设计师可排版的建议模块。",
    "总结与下一步": `建议使用资料清单、下一步流程图或结论卡片，明确后续需要补充：${need.missingMaterials}。`
  };

  if (isFirst && /新能源汽车|客户画像/.test(need.topic)) return analysisImages["封面"];
  if (isLast && /新能源汽车|客户画像|配置|性能|价格|目标人群/.test(`${need.topic}${need.focusItems.join("")}`)) return analysisImages["总结与下一步"];
  if (analysisImages[cleanSection]) return analysisImages[cleanSection];

  return "";
}

function getSimpleSectionTalkFocus(section, need, isFirst, isLast) {
  const cleanSection = cleanSectionName(section);

  if (isSimpleLifestyleNeed(need)) {
    const lifestyleFocus = {
      "封面": `重点让客户一眼感受到《${need.topic}》的开业氛围，不急着堆信息，先建立温暖、清楚、适合转发的第一印象。`,
      "门店定位": "重点说明这家店想给顾客留下什么印象，适合哪些到店场景，以及为什么值得第一次来看看。",
      "开业亮点": "重点把亮点讲成顾客愿意第一次到店的理由，但不替客户编写优惠、价格或赠品。",
      "产品与环境": "重点用产品图和空间图建立“想来坐坐”的感觉，少用空泛形容词，多留真实画面位置。",
      "目标客群": "重点说明适合哪些人来、为什么会来，以及他们在朋友圈里会被什么画面或理由打动。",
      "活动玩法": "重点讲清参与方式和到店动作，活动规则、优惠力度和时间以客户最终确认为准。",
      "朋友圈传播内容": "重点说明图片顺序、短文案和转发理由，让内容适合普通顾客快速看懂并愿意分享。",
      "行动号召": "重点让客户知道正式稿需要放什么联系方式、到店入口、营业时间和活动规则。"
    };

    if (isFirst) return lifestyleFocus["封面"];
    if (isLast) return lifestyleFocus["行动号召"];
    if (lifestyleFocus[cleanSection]) return lifestyleFocus[cleanSection];
  }

  const analysisFocus = {
    "封面": `重点说明《${need.topic}》是一份分析初稿，后续结论需要客户提供数据、品牌资料和调研材料支撑。`,
    "分析背景": "重点说明为什么要做这份分析，先建立行业和用户变化的背景，不急着给出未经验证的结论。",
    "分析目标与方法": "重点告诉听众本次会从哪些维度看问题，配置、性能、价格和目标人群之间如何形成分析框架。",
    "目标人群概览": "重点说明这里是画像框架，不是最终人群结论；真实标签需要用户调研或销售数据验证。",
    "配置偏好分析": "重点说明用户为什么关注续航、空间、智能座舱等配置，以及这些配置如何影响购买判断。",
    "性能关注点分析": "重点说明续航、补能、安全和使用成本等性能维度如何影响实际用车信心，不直接写具体参数。",
    "价格区间分析": "重点说明不同预算层级对应不同决策关注点，但不直接写具体价格或价格带结论。",
    "购买决策因素": "重点说明品牌信任、补能条件、售后服务和家庭需求如何共同影响购买动作。",
    "机会点与建议": "重点把前面的分析转化成可执行方向，让客户知道哪些内容值得后续补数据、做图表或展开策略。",
    "总结与下一步": "重点收束结论，并提醒客户补充数据、品牌资料、用户调研和配图素材后再进入正式制作。"
  };

  if (isFirst && /新能源汽车|客户画像/.test(need.topic)) return analysisFocus["封面"];
  if (isLast && /新能源汽车|客户画像|配置|性能|价格|目标人群/.test(`${need.topic}${need.focusItems.join("")}`)) return analysisFocus["总结与下一步"];
  if (analysisFocus[cleanSection]) return analysisFocus[cleanSection];

  return "";
}

function getSimpleSectionSpeakerNote(section, need, isFirst, isLast) {
  const cleanSection = cleanSectionName(section);

  if (isSimpleLifestyleNeed(need)) {
    const lifestyleNotes = {
      "封面": `这一页可以对客户说：先不用把所有信息塞满，开业宣传第一眼要让人觉得舒服、想点开、想去看看，后面再慢慢补门店照片和具体信息。`,
      "门店定位": "这一页先聊这家店的气质：是适合通勤外带、周末小坐、朋友聊天，还是适合拍照打卡。定位说清楚，后面的图片和文案才不会散。",
      "开业亮点": "这一页把亮点说成顾客愿意来的理由。可以先预留活动、产品、空间和体验四类位置，但不要替客户编优惠和时间。",
      "产品与环境": "这一页要靠真实画面打动人。正式制作前最好让客户补产品特写、吧台、座位区和门头图，文案只负责把氛围说清楚。",
      "目标客群": "这一页说明哪些人最可能被吸引，比如附近上班族、周末约会、朋友小聚或喜欢安静空间的人。具体客群仍要结合门店位置和客户资料。",
      "活动玩法": "这一页把参与路径讲顺：看到宣传、了解亮点、到店或咨询、参与活动。优惠力度和活动规则先留给客户确认。",
      "朋友圈传播内容": "这一页提醒客户朋友圈内容要短、清楚、有画面感。图片顺序可以先按门头、产品、环境、活动、联系方式来排。",
      "行动号召": `这一页收尾时告诉客户：正式稿需要补齐${need.missingMaterials}，这些信息确认后才能把宣传入口落准。`
    };

    if (isFirst) return lifestyleNotes["封面"];
    if (isLast) return lifestyleNotes["行动号召"];
    if (lifestyleNotes[cleanSection]) return lifestyleNotes[cleanSection];
  }

  const analysisNotes = {
    "封面": `这一页先把《${need.topic}》定位成分析初稿，告诉客户当前先搭结构，真正的判断需要后续数据和资料支撑。`,
    "分析背景": "这一页先讲为什么要做分析：客户画像不是为了堆概念，而是为了找到用户关注点和后续表达重点。",
    "分析目标与方法": "这一页说明分析方法：先定维度，再看资料，再形成判断。不要把方法页讲成结论页。",
    "目标人群概览": "这一页强调画像只是框架。年龄、城市、预算、使用场景等标签都要等客户数据或调研材料确认。",
    "配置偏好分析": "这一页围绕配置偏好展开，讲清续航、空间、智能座舱等配置为什么会改变用户判断，不补未经确认的车型数据。",
    "性能关注点分析": "这一页把性能讲成使用信心：续航、补能、安全和成本如何影响购买犹豫，具体参数留给客户资料。",
    "价格区间分析": "这一页说明预算层级会改变用户关注点，但不要写具体价格数字。等客户给车型和区域口径后再做图表。",
    "购买决策因素": "这一页连接用户关注点和购买动作：从兴趣、比较、顾虑到下单，每一步都需要相应内容支撑。",
    "机会点与建议": "这一页把前面分析翻译成可执行方向，例如后续要补哪些数据、哪些图表、哪些人群故事和哪些传播重点。",
    "总结与下一步": `这一页用来收束：结构已经有了，正式制作前还需要补齐${need.missingMaterials}，避免把初稿写成未经验证的正式报告。`
  };

  if (isFirst && /新能源汽车|客户画像/.test(need.topic)) return analysisNotes["封面"];
  if (isLast && /新能源汽车|客户画像|配置|性能|价格|目标人群/.test(`${need.topic}${need.focusItems.join("")}`)) return analysisNotes["总结与下一步"];
  if (analysisNotes[cleanSection]) return analysisNotes[cleanSection];

  return "";
}

function buildSimpleClosing(need) {
  if (isSimpleLifestyleNeed(need)) {
    return `${need.profile.closing}行动号召可以写成到店路线、咨询方式、预约入口、朋友圈转发提示或开业信息确认。正式制作前建议确认：${need.missingMaterials}。`;
  }

  const actionLine = /活动宣传|产品介绍|公司介绍|招商方案/.test(need.purpose)
    ? "行动号召可以写成咨询、预约、到店、报名、资料交换或下一轮沟通，但具体入口信息由客户确认后再放入页面。"
    : "行动号召可以写成确认资料、补充数据、审核初稿或进入下一步制作。";
  return `${need.profile.closing}${actionLine} 制作前建议确认：${need.missingMaterials}。`;
}

function buildSimpleRiskNotice(need) {
  if (!need.hasDetailedMaterials) {
    return `资料确认提醒：当前方案基于客户提供的初步需求生成，未包含真实数据、品牌资料、图片素材、客户案例或详细业务信息。后续制作前建议补充：${need.missingMaterials}。`;
  }

  return `资料使用提醒：本方案优先参考客户提供的资料内容；资料中没有出现的数据、客户名称、品牌合作、案例、价格和效果承诺不写入正文。后续制作前仍建议确认：${need.missingMaterials}。`;
}

function readBrief() {
  const topic = normalizeUserInput(document.getElementById("topic").value);
  if (!topic) {
    showToast("请先填写 PPT 主题");
    document.getElementById("topic").focus();
    return null;
  }

  const userRiskTerms = parseTerms(document.getElementById("riskPoints").value);
  const allRiskTerms = [...new Set([...bannedTerms, ...userRiskTerms])];
  const cleanInput = value => normalizeUserInput(value);
  const materials = [...document.querySelectorAll('input[name="materials"]:checked')].map(item => item.value);
  const selectedPurpose = document.getElementById("purpose").value;
  const detailedPurpose = cleanInput(document.getElementById("detailedPurpose").value);
  const rawAudience = cleanInput(document.getElementById("audience").value);
  const normalized = normalizeAudienceAndPurpose(topic, rawAudience, selectedPurpose, detailedPurpose);
  const materialDetails = normalizeClientMaterials(document.getElementById("materialDetails").value);
  const mustHaveInput = normalizeMultilineInput(document.getElementById("mustHave").value);
  const selectedEmphasis = document.getElementById("emphasis").value;
  const customHighlight = cleanInput(document.getElementById("customHighlight").value);

  return {
    topic,
    pageCount: clampPageCount(document.getElementById("pageCount").value),
    scenario: document.getElementById("scenario").value,
    style: document.getElementById("style").value,
    purpose: selectedPurpose,
    detailedPurpose,
    purposeDetail: normalized.purposeDetail,
    audience: normalized.audience,
    materials: materials.length ? materials : ["只有主题"],
    materialDetails,
    mustHave: mustHaveInput || getDefaultMustHave(topic),
    riskPoints: normalizeUserInput(document.getElementById("riskPoints").value),
    emphasis: customHighlight || selectedEmphasis,
    emphasisCategory: selectedEmphasis,
    customHighlight,
    needScript: document.getElementById("needScript").checked,
    needImages: document.getElementById("needImages").checked,
    needLayouts: document.getElementById("needLayouts").checked,
    reference: cleanInput(document.getElementById("reference").value) || "参考成熟商务 PPT 的清晰结构",
    deadline: cleanInput(document.getElementById("professionalDeadline").value),
    followAnswers: normalizeClientMaterials(followAnswers.value),
    allRiskTerms,
    userRiskTerms
  };
}

function clampPageCount(value) {
  const number = Number(value);
  if (Number.isNaN(number)) return 8;
  return Math.min(Math.max(number, 3), 30);
}

function buildQuestions(brief) {
  const questions = [];
  const profile = getAudienceProfile(brief.audience);

  if (brief.audience === "尚未明确的目标观众") {
    questions.push("这份 PPT 最终给谁看：老板、客户、评委、投资人、团队，还是学员？");
  } else {
    questions.push(`目标观众是“${brief.audience}”，他们最关心决策、合作、评审、学习还是购买转化？`);
  }

  questions.push(`这份 PPT 的使用目的目前理解为“${brief.purposeDetail}”，是否还需要补充更具体的行动目标？`);

  if (/老板|客户|评委|投资人|领导/.test(brief.audience)) {
    questions.push(`是否需要重点说服${shortText(brief.audience, 16)}？如果需要，他们最可能质疑哪一点？`);
  } else {
    questions.push(`听众看完后希望立刻做什么：理解信息、形成共识、参与练习，还是进入下一步沟通？`);
  }

  if (brief.materialDetails) {
    questions.push(`已有资料说明为“${shortText(brief.materialDetails, 30)}”，哪些内容已经可以直接进正文，哪些还需要客户确认？`);
  } else if (brief.materials.includes("只有主题")) {
    questions.push("目前资料偏少，是否有必须放进去的证明材料、图片、品牌规范或客户原文？");
  } else {
    questions.push(`已有资料包括“${brief.materials.join("、")}”，哪些内容必须进正文，哪些只适合放附录或备注？`);
  }

  if (brief.riskPoints || brief.userRiskTerms.length) {
    questions.push("除了已填写的风险点，还有没有不能写的敏感材料、客户名、合作方、财务信息或未确认结论？");
  } else {
    questions.push("有哪些内容不能写：未确认资料、客户名称、合作方、资金信息、排名表述，还是内部敏感信息？");
  }

  if (profile.concern.includes("理解成本")) {
    questions.push("是否需要加入练习互动、提问页或课后行动清单，帮助听众真正学会？");
  }

  return questions.slice(0, 5);
}

function buildSummary(brief) {
  const profile = getAudienceProfile(brief.audience);
  const style = styleProfiles[brief.style];
  const purpose = purposeProfiles[brief.purpose];
  const structure = buildStructure(brief);
  const delivery = [
    "PPT 总标题",
    "整体逻辑结构",
    "逐页标题与核心内容",
    "每页讲述重点",
    brief.needImages ? "每页配图建议" : "不展开配图建议",
    brief.needLayouts ? "每页排版建议" : "不展开排版建议",
    brief.needScript ? "每页演讲备注" : "不展开完整演讲备注"
  ].join("、");

  const items = [
    `PPT 主题：${brief.topic}。`,
    `使用场景：${brief.scenario}；基础结构会按“${structure.join(" → ")}”组织。`,
    `目标观众：${brief.audience}；他们更关心${profile.concern}。`,
    `使用目的：${brief.purposeDetail}；下拉分类为${brief.purpose}，用于参考${purpose.focus}。`,
    `内容重点：${brief.mustHave}。`,
    `资料情况：${brief.materials.join("、")}；${brief.materialDetails ? `详细说明：${brief.materialDetails}。` : "暂无更详细资料说明。"}`,
    `风格方向：${brief.style}，需要${style.tone}；希望突出${brief.emphasis}${brief.customHighlight ? `；下拉突出项“${brief.emphasisCategory}”仅作为风格参考` : ""}。`,
    `风险限制：不虚构未确认的经营、合作、资金、排名或第三方背书内容；用户填写的风险点会自动避开。`,
    `最终交付：${delivery}。`
  ];

  if (brief.followAnswers) {
    items.splice(5, 0, `追问补充：${brief.followAnswers}。`);
  }

  if (brief.materials.includes("只有主题") && !brief.materialDetails) {
    items.splice(4, 0, `资料判断：目前资料较少，最终大纲会在配图建议或下一步资料清单中标注具体待补充项，例如“${getSupplementForSection("园区招商目标", brief)}”。`);
  }

  return `<ul>${items.map(item => `<li>${escapeHtml(sanitize(item, brief.topic, brief.allRiskTerms, { allowSupplement: true }))}</li>`).join("")}</ul>`;
}

/** @deprecated v2.3.0: retained only as rollback reference. Production UI must call POST /api/outline. */
function generateLegacyOutline(brief) {
  const profile = getAudienceProfile(brief.audience);
  const style = styleProfiles[brief.style];
  const purpose = purposeProfiles[brief.purpose];
  const structure = buildStructure(brief);
  const title = buildDeckTitle(brief, profile);
  const logic = buildDeckLogic(brief, profile, purpose);
  const pages = buildPages(brief, structure, profile, style, purpose);

  return {
    title: sanitize(title, brief.topic, brief.allRiskTerms),
    logic: sanitize(logic, brief.topic, brief.allRiskTerms),
    summary: sanitize(`这是一份 ${brief.pageCount} 页 ${brief.scenario} 场景 PPT。目标观众是${brief.audience}；使用目的是${brief.purposeDetail}；内容突出${brief.emphasis}，风格采用${brief.style}表达。`, brief.topic, brief.allRiskTerms),
    pages,
    closing: sanitize(buildClosing(brief, purpose), brief.topic, brief.allRiskTerms, { allowSupplement: true }),
    proofNote: sanitize(`生成逻辑已根据目标观众、使用目的、场景结构、风格方向和风险点重组内容；资料不足处会按页面主题列出具体待补充项，不虚构未确认的经营、合作、资金或第三方背书内容。`, brief.topic, brief.allRiskTerms)
  };
}

function buildDeckTitle(brief, profile) {
  const suffix = {
    "汇报": "项目汇报与推进建议",
    "说服": "共识建立与行动方案",
    "展示": "核心价值展示方案",
    "招商": "合作价值与落地方案",
    "答辩": "研究思路与成果答辩",
    "培训": "知识框架与行动训练",
    "销售转化": "客户价值与转化方案"
  };

  if (brief.style === "高级") return `${brief.topic}｜${suffix[brief.purpose]}高端提案`;
  if (brief.style === "科技感") return `${brief.topic}｜系统化${suffix[brief.purpose]}`;
  if (brief.style === "简洁") return `${brief.topic}｜一页一重点制作提纲`;
  return `${brief.topic}｜${suffix[brief.purpose]}`;
}

function buildDeckLogic(brief, profile, purpose) {
  if (isProductIntroDeck(brief)) {
    return `整体逻辑采用“${buildStructure(brief).join(" → ")}”作为主线。基础目的归类为${brief.purpose}，但详细目的以“${brief.purposeDetail}”为准；内容必须围绕客户痛点、产品定位、功能模块、应用场景、交付流程、合作模式和下一步资料准备展开。`;
  }

  if (isTrainingDeck(brief)) {
    return `整体逻辑采用“${buildStructure(brief).join(" → ")}”作为主线。基础目的归类为${brief.purpose}，但详细目的以“${brief.purposeDetail}”为准；内容先建立学习动机，再讲知识框架、操作流程、实操练习、风险边界和行动清单。`;
  }

  if (isAiParkPromotion(brief.topic)) {
    return `整体逻辑采用“园区招商目标 → AI 视频内容矩阵 → AI 展示屏触点 → 企业宣传素材体系 → 自动化内容生产流程 → 数字化展示能力 → 合作落地路径”的主线。目标观众是${brief.audience}；使用目的是${brief.purposeDetail}。内容先说明园区为什么需要升级招商展示方式，再讲 AI 内容生产和线下展示屏如何形成对外传播能力，最后落到试点、审核、上线和常态运营路径。`;
  }

  const scene = scenarioStructures[brief.scenario].join(" → ");
  return `整体逻辑采用“${scene}”作为主线。目标观众是${brief.audience}，先回应他们关心的${profile.concern}，再围绕“${brief.mustHave}”安排正文。使用目的是${brief.purposeDetail}，每页讲述都要服务于“${purpose.focus}”，结尾给出明确总结或行动号召。`;
}

function buildStructure(brief) {
  const count = brief.pageCount;

  if (isProductIntroDeck(brief)) {
    return fitSpecialStructure(productIntroStructure, count);
  }

  if (isTrainingDeck(brief)) {
    return fitSpecialStructure(trainingStructure, count);
  }

  if (isAiParkPromotion(brief.topic)) {
    const aiParkStructure = ["封面与目标", ...aiParkSections, "总结/行动号召"];
    if (count <= aiParkStructure.length) return aiParkStructure.slice(0, count - 1).concat("总结/行动号召").slice(0, count);
    const structure = [...aiParkStructure];
    while (structure.length < count) {
      structure.splice(structure.length - 1, 0, `运营复盘与迭代${structure.length - aiParkStructure.length + 1}`);
    }
    return structure.slice(0, count);
  }

  const base = scenarioStructures[brief.scenario];
  if (count <= base.length + 2) {
    const middleCount = Math.max(count - 2, 1);
    return ["封面与目标", ...base.slice(0, middleCount), "总结/行动号召"].slice(0, count);
  }

  const structure = ["封面与目标", ...base];
  while (structure.length < count - 1) {
    const next = base[(structure.length - 1) % base.length];
    structure.push(`${next}深化`);
  }
  structure.push("总结/行动号召");
  return structure.slice(0, count);
}

function fitSpecialStructure(base, count) {
  if (count === base.length) return [...base];
  if (count < base.length) return base.slice(0, count - 1).concat(base[base.length - 1]).slice(0, count);

  const structure = [...base];
  const expansionPool = base.slice(1, -1);
  while (structure.length < count) {
    const next = expansionPool[(structure.length - base.length) % expansionPool.length];
    structure.splice(structure.length - 1, 0, `${next}补充`);
  }
  return structure.slice(0, count);
}

function buildPages(brief, structure, profile, style, purpose) {
  return structure.map((section, index) => {
    const pageNo = index + 1;
    const isFirst = pageNo === 1;
    const isLast = pageNo === structure.length;
    const title = buildPageTitle(section, brief, isFirst, isLast);

    const content = buildPageContent(section, brief, profile, purpose, isFirst, isLast);
    const talkFocus = buildTalkFocus(section, brief, profile, purpose, isFirst, isLast);
    const image = brief.needImages ? buildImageSuggestion(section, brief, style, isFirst, isLast) : "本次设置为不展开配图建议。";
    const layout = brief.needLayouts ? buildLayoutSuggestion(section, brief, style, isFirst, isLast) : "本次设置为不展开每页排版建议。";
    const speaker = brief.needScript ? buildSpeakerNote(section, brief, profile, isFirst, isLast) : "本次设置为不展开完整演讲备注。";

    return {
      pageNo,
      title: sanitize(title, brief.topic, brief.allRiskTerms),
      content: sanitize(content, brief.topic, brief.allRiskTerms),
      talkFocus: sanitize(talkFocus, brief.topic, brief.allRiskTerms),
      image: sanitize(image, brief.topic, brief.allRiskTerms, { allowSupplement: true }),
      layout: sanitize(layout, brief.topic, brief.allRiskTerms),
      speaker: sanitize(speaker, brief.topic, brief.allRiskTerms)
    };
  });
}

function buildPageTitle(section, brief, isFirst, isLast) {
  if (isProductIntroDeck(brief) || isTrainingDeck(brief)) return section;

  if (isFirst) return `${brief.topic}：目标与沟通框架`;
  if (isLast) return "总结/行动号召";
  return `${section}：${buildSectionTitle(section, brief)}`;
}

function buildSectionTitle(section, brief) {
  if (isAiParkPromotion(brief.topic)) {
    const detail = aiParkSectionDetails[cleanSectionName(section)];
    if (detail) return detail.title.replace(/^[^：]+：/, "");
  }

  const map = {
    "背景": "为什么现在要讲",
    "进展": "目前做到哪里",
    "关键成果": "已经形成什么阶段价值",
    "问题": "当前卡点与影响",
    "解决方案": "下一步怎么做",
    "计划": "节奏与里程碑",
    "资源需求": "需要哪些支持",
    "研究背景": "问题来源与价值",
    "目标": "研究/项目要回答什么",
    "方法": "如何证明与推进",
    "过程": "关键步骤与依据",
    "结果": "阶段结论与验证情况",
    "市场机会": "为什么值得进入",
    "痛点": "用户或行业真正的问题",
    "商业模式": "价值如何形成闭环",
    "竞争优势": "差异化从哪里来",
    "落地计划": "如何执行与验证",
    "用户痛点": "用户为什么需要",
    "产品定位": "产品解决什么问题",
    "核心功能": "功能如何服务价值",
    "使用场景": "在什么场景中发挥作用",
    "价值总结": "给用户带来什么改变",
    "问题引入": "先建立学习动机",
    "知识框架": "先搭清晰地图",
    "案例解释": "用例子讲懂",
    "练习互动": "让听众参与",
    "总结复盘": "带走行动清单"
  };

  const clean = section.replace("深化", "");
  return map[clean] || `围绕${brief.emphasis}展开`;
}

function buildPageContent(section, brief, profile, purpose, isFirst, isLast) {
  const aiParkDetail = getAiParkDetail(section, brief);
  if (aiParkDetail && !isFirst && !isLast) return aiParkDetail.content;
  const modules = buildContentModules(brief);

  if (isFirst) {
    if (isProductIntroDeck(brief)) {
      return `封面明确《${brief.topic}》的沟通目标：向${brief.audience}说明产品解决的问题、适用场景、交付流程和合作前资料准备。详细使用目的以“${brief.purposeDetail}”为准，突出${brief.emphasis}。`;
    }

    if (isTrainingDeck(brief)) {
      return `本页直接说明《${brief.topic}》的课程目标和学习收益：让${brief.audience}理解能用什么、什么时候用、如何安全使用、如何审核输出结果，并把学习内容落到日常工作。`;
    }

    if (isAiParkPromotion(brief.topic)) {
      return `说明《${brief.topic}》的沟通目标：目标观众是${brief.audience}，使用目的是${brief.purposeDetail}。内容围绕园区招商、AI 视频、AI 展示屏、企业宣传、自动化内容生产和数字化展示能力，搭建一套能对外讲清园区价值、对内沉淀内容资产的推广方案。`;
    }
    return `说明本次 PPT 的主题、观众、沟通目标和内容边界。开场要让${brief.audience}知道这份材料将回答什么问题，以及为什么与他们关心的${profile.concern}有关。`;
  }

  if (isLast) {
    if (isProductIntroDeck(brief)) {
      return buildProductSummaryContent(brief, modules);
    }

    if (isTrainingDeck(brief)) {
      return buildTrainingSummaryContent(brief, modules);
    }

    if (isAiParkPromotion(brief.topic)) {
      return `本页作为商业落地页，收束为五项下一步：一是确认下一步资料清单，包括园区现有宣传素材、展示屏尺寸、招商政策和品牌视觉规范；二是确认试点场景，例如招商大厅、企业服务中心或活动现场；三是确认审核机制，包括审核负责人、修改轮次和上线口径；四是确认展示屏上线范围，包括播放点位、内容栏目和更新频率；五是确认首批内容制作范围，包括园区形象视频、招商短视频、企业宣传素材和展示屏轮播内容。`;
    }
    return `收束前文结论，回到${brief.purposeDetail}目标，整理关键判断、待补充信息和下一步动作。${purpose.closing}`;
  }

  const materialNote = buildMaterialNote(brief);

  return buildGeneralPageContent(section, brief, profile, purpose, materialNote);
}

function buildTalkFocus(section, brief, profile, purpose, isFirst, isLast) {
  const aiParkDetail = getAiParkDetail(section, brief);
  if (aiParkDetail && !isFirst && !isLast) return aiParkDetail.focus;

  if (isProductIntroDeck(brief) && isFirst) return "开场先明确客户会听到什么：问题、定位、功能、场景、流程、合作模式和下一步资料准备。";
  if (isTrainingDeck(brief) && isFirst) return "开场直接说明课程收益，让听众知道学完后可以在日常工作中完成哪些安全、可控的辅助任务。";
  if (isFirst) return `讲清楚“为什么是这个主题、为什么给这些人看、听完要形成什么判断”。`;
  if (isProductIntroDeck(brief) && isLast) return "把产品价值和合作边界一起收束，推动客户确认资料、案例、参数和合作模式。";
  if (isTrainingDeck(brief) && isLast) return "用复盘和行动清单收尾，提醒听众把工具输出交回人工审核。";
  if (isLast) return `把全篇压缩成三句话：核心结论、下一步动作、需要听众确认或支持的事项。`;
  return buildGeneralTalkFocus(section, brief, profile);
}

function buildImageSuggestion(section, brief, style, isFirst, isLast) {
  const aiParkDetail = getAiParkDetail(section, brief);
  if (aiParkDetail && !isFirst && !isLast) return aiParkDetail.image;

  if (isFirst) return `封面建议使用${style.visual}，搭配主题关键词和一张能代表项目场景的主视觉。`;
  if (isLast) {
    if (isAiParkPromotion(brief.topic)) {
      return "建议使用商业落地路线图或五项确认清单，包含资料清单、试点场景、审核机制、展示屏上线范围、首批内容制作范围。";
    }
    return `最后一页建议使用行动清单、路线图或简洁总结页，视觉保持${style.visual}。`;
  }

  const specialImage = buildSpecialImageSuggestion(section, brief);
  if (specialImage) return specialImage;

  const byScenario = {
    "汇报": "进度表、问题矩阵、资源需求表或流程图",
    "答辩": "研究框架、方法流程、结果对比图或逻辑闭环图",
    "商业计划": "市场机会图、商业模式画布、合作路径图或落地路线图",
    "产品介绍": "用户场景图、产品结构图、功能路径图或价值对比图",
    "课程分享": "知识框架图、案例截图、互动练习卡或复盘清单"
  };

  if (brief.materialDetails || !brief.materials.includes("只有主题")) {
    return `建议使用${byScenario[brief.scenario]}；优先匹配客户已有资料，缺少对应可视素材时放入下一步资料清单统一补齐，不使用不存在的证明素材。`;
  }

  return `建议使用${byScenario[brief.scenario]}；如果客户没有提供图片，标注“${getSupplementForSection(section, brief)}”，不要使用不存在的证明素材。`;
}

function buildSpecialImageSuggestion(section, brief) {
  const key = cleanSectionName(section);
  const productImages = {
    "客户痛点与使用背景": "建议使用痛点卡片、制作成本沟通链路图或传统制作流程阻塞示意图。",
    "产品定位与适用对象": "建议使用产品定位坐标、适用对象分层图或服务边界示意图。",
    "核心功能模块": "建议使用功能模块矩阵、能力分层图或从输入到输出的能力结构图。",
    "典型应用场景": "建议使用应用场景矩阵、内容类型卡片或多场景封面墙。",
    "服务流程与交付方式": "建议使用横向流程箭头、交付节点图或审核流转图。",
    "合作模式与资料准备": "建议使用合作模式分层表、资料准备清单或确认事项看板。"
  };
  const trainingImages = {
    "为什么要学：问题引入": "建议使用日常任务卡片、工作流堵点图或问题引导页。",
    "知识框架：工具能做什么": "建议使用工具能力分类图或工作类型矩阵。",
    "操作流程：从输入到输出": "建议使用六步流程图或输入输出闭环图。",
    "实操练习与常见问题": "建议使用练习任务卡、常见问题清单或风险提醒卡。",
    "总结复盘与行动清单": "建议使用行动清单、复盘表或内部审核流程提示。"
  };

  if (isProductIntroDeck(brief)) return productImages[key] || "";
  if (isTrainingDeck(brief)) return trainingImages[key] || "";
  return "";
}

function buildLayoutSuggestion(section, brief, style, isFirst, isLast) {
  const aiParkDetail = getAiParkDetail(section, brief);
  if (aiParkDetail && !isFirst && !isLast) return aiParkDetail.layout;

  if (isFirst) return `封面采用主标题、简短副标题、场景视觉三层结构；${style.layout}。`;
  if (isLast) {
    if (isAiParkPromotion(brief.topic)) {
      return "结尾页采用五栏清单或路线图布局，分别对应资料清单、试点场景、审核机制、上线范围、首批内容制作范围。";
    }
    return `结尾页采用总结三点加行动按钮式布局，留出提问或沟通入口。`;
  }

  if (brief.emphasis === "数据专业") {
    return "建议使用左侧结论、右侧图表的结构，并在图表角标注明资料来源和确认状态。";
  }

  if (brief.emphasis === "视觉高级") {
    return "建议使用大标题、少量正文、强留白和一张高质量视觉图，避免信息挤满页面。";
  }

  if (brief.emphasis === "逻辑清晰") {
    return "建议使用编号结构或流程箭头，让前后逻辑一眼能看懂。";
  }

  return `${style.layout}，重点让“${section}”这一页只有一个主结论。`;
}

function buildSpeakerNote(section, brief, profile, isFirst, isLast) {
  const aiParkDetail = getAiParkDetail(section, brief);
  if (aiParkDetail && !isFirst && !isLast) return aiParkDetail.speaker;

  if (isFirst) {
    return `开场先问候听众，然后说明这份《${brief.topic}》不是资料堆叠。目标观众是${brief.audience}，使用目的是${brief.purposeDetail}。接着说明本次内容如何帮助听众判断《${brief.topic}》的价值、边界和下一步行动。`;
  }

  if (isLast) {
    if (isAiParkPromotion(brief.topic)) {
      return "结尾先复述商业落地路径，再请客户确认五件事：资料清单、试点场景、审核机制、展示屏上线范围、首批内容制作范围。语气要像项目启动会，不要新增未经确认的数字或合作背书。";
    }
    return `结尾先复述核心结论，再说明下一步行动。不要新增未经确认的信息，把待补充资料和风险边界说清楚，方便客户继续补充。`;
  }

  return buildGeneralSpeakerNote(section, brief);
}

function buildClosing(brief, purpose) {
  if (isProductIntroDeck(brief)) {
    return "最后一页建议以“产品价值回顾 → 合作边界确认 → 下一步资料清单”收尾，引导客户确认案例可披露范围、技术参数、合作模式、品牌规范、素材权限和审核流程。";
  }

  if (isTrainingDeck(brief)) {
    return "最后一页建议以“课程复盘 → 练习任务 → 内部审核建议”收尾，提醒听众保护敏感数据、检查输出结果，并由人工完成最终判断。";
  }

  if (isAiParkPromotion(brief.topic)) {
    return `最后一页建议以商业落地为核心收尾：确认下一步资料清单、试点场景、审核机制、展示屏上线范围和首批内容制作范围。行动号召可以写为：先完成资料和点位确认，再启动首批 AI 视频、展示屏轮播和企业宣传素材制作。`;
  }

  if (brief.purpose === "销售转化") {
    return `最后一页建议以“客户问题回顾 → 产品/方案价值 → 下一步沟通动作”收尾，引导预约演示、咨询方案或确认需求。`;
  }

  if (brief.purpose === "招商") {
    return `最后一页建议以合作价值、合作方式和下一步对接资料收尾，让潜在合作方知道如何继续沟通。`;
  }

  if (brief.purpose === "培训") {
    return `最后一页建议用知识复盘、练习任务和行动清单收尾，帮助听众带走可执行方法。`;
  }

  return `最后一页建议围绕“结论、行动、待确认事项”收尾。${purpose.closing}`;
}

function getAudienceProfile(audience) {
  const matched = audienceProfiles.find(item => item.pattern.test(audience));
  return matched || {
    concern: "信息是否清楚、价值是否成立、下一步是否明确",
    logic: "先建立背景，再呈现重点，最后给行动方向"
  };
}

function isProductIntroDeck(brief) {
  return brief.scenario === "产品介绍";
}

function isTrainingDeck(brief) {
  return brief.scenario === "课程分享" || brief.purpose === "培训" || /课程|培训|学习|学员/.test(brief.purposeDetail || "");
}

function buildMaterialNote(brief) {
  if (brief.materialDetails) {
    const details = trimSentenceEnd(brief.materialDetails);
    if (isTrainingDeck(brief)) {
      return `客户已有资料说明：${details}。正文优先使用这些已确认材料，工具清单、内部规范、数据脱敏规则和内容审核流程按客户确认范围表达。`;
    }
    return `客户已有资料说明：${details}。正文优先使用这些已确认材料，技术参数、合作模式和审核流程按客户确认范围表达。`;
  }

  if (brief.materials.includes("只有主题")) {
    return "客户当前资料较少，正文先搭建清晰结构和表达边界，具体证明材料放到配图建议或下一步资料清单中补齐。";
  }

  return `可引用客户已提供的${brief.materials.join("、")}，但需要保持口径清楚。`;
}

const contentModuleLabels = {
  painPoints: ["服务要解决的核心问题", "核心问题", "客户痛点", "用户痛点", "痛点", "问题"],
  functions: ["智能视频制作服务的核心能力", "核心能力", "核心功能模块", "核心功能", "功能模块", "功能类内容"],
  scenarios: ["典型应用场景", "应用场景", "使用场景", "内容场景", "场景类内容"],
  flows: ["服务落地流程", "服务流程", "落地流程", "基础操作流程", "操作流程", "流程类内容"],
  deliveryModes: ["交付模式", "合作模式", "交付方式"],
  materialPrep: ["客户需要配合提供的资料", "客户需要提供的资料", "客户资料准备", "资料准备", "资料清单", "需要准备哪些资料"],
  riskBoundaries: ["风险边界", "风险提醒", "不能提的风险点", "不能提的内容", "风险限制"],
  trainingWorkTypes: ["常见使用场景", "常见工作场景", "工具能辅助哪些日常工作", "能辅助哪些日常工作", "辅助哪些日常工作", "工作类型"],
  trainingPractice: ["实操练习", "练习任务", "常见问题"],
  trainingEmphasis: ["必须强调", "注意事项", "使用边界"]
};

const semanticBoundaryLabels = Object.values(contentModuleLabels).flat();

function buildContentModules(brief) {
  const mainSource = [brief.mustHave, brief.followAnswers].filter(Boolean).join("；");
  const riskText = compactText([
    extractSegmentText(mainSource, contentModuleLabels.riskBoundaries),
    extractSegmentText(mainSource, contentModuleLabels.trainingEmphasis),
    brief.riskPoints,
    extractRiskHints(brief.materialDetails)
  ]);

  return {
    painPoints: extractSegmentText(mainSource, contentModuleLabels.painPoints) || extractPainFallback(mainSource),
    functions: extractModuleItems(mainSource, contentModuleLabels.functions),
    scenarios: extractModuleItems(mainSource, contentModuleLabels.scenarios),
    flows: extractModuleItems(mainSource, contentModuleLabels.flows),
    deliveryModes: extractModuleItems(mainSource, contentModuleLabels.deliveryModes),
    materialPrep: extractModuleItems(mainSource, contentModuleLabels.materialPrep),
    riskBoundaries: riskText,
    trainingWorkTypes: extractModuleItems(mainSource, contentModuleLabels.trainingWorkTypes),
    trainingFlow: extractModuleItems(mainSource, contentModuleLabels.flows),
    trainingPractice: extractSegmentText(mainSource, contentModuleLabels.trainingPractice)
  };
}

function extractSegmentText(source, labels) {
  const segments = splitSemanticSegments(source);
  const matched = segments.find(segment => labels.some(label => segment.includes(label)));
  if (!matched) return "";
  return stripSegmentLabel(matched, labels);
}

function extractModuleItems(source, labels) {
  return splitListItems(extractSegmentText(source, labels));
}

function splitSemanticSegments(text) {
  let source = normalizeUserInput(text)
    .replace(/\s*\d+\s*[.．、]\s*/g, "；")
    .replace(/\s*[•·*-]\s*/g, "；");

  [...semanticBoundaryLabels]
    .sort((a, b) => b.length - a.length)
    .forEach(label => {
      const pattern = new RegExp(`\\s*(${escapeRegExp(label)}(?:包括|包含|有|为|是|[:：]))`, "g");
      source = source.replace(pattern, "；$1");
    });

  return source
    .split(/[；;]/)
    .map(item => trimSentenceEnd(item.replace(/^\d+\s*[.．、]\s*/, "")))
    .filter(Boolean);
}

function stripSegmentLabel(segment, labels) {
  const matchedLabel = labels
    .slice()
    .sort((a, b) => b.length - a.length)
    .find(label => segment.includes(label));
  if (!matchedLabel) return trimSentenceEnd(segment);

  const start = segment.indexOf(matchedLabel) + matchedLabel.length;
  return trimSentenceEnd(segment.slice(start).replace(/^(包括|包含|有|为|是|[:：])\s*/, ""));
}

function extractPainFallback(source) {
  const segments = splitSemanticSegments(source);
  const firstMeaningful = segments.find(segment => !semanticBoundaryLabels.some(label => segment.includes(label)));
  return firstMeaningful || "";
}

function extractRiskHints(text) {
  const source = normalizeUserInput(text);
  if (!source) return "";
  const sentences = source
    .split(/[。；;]/)
    .map(item => item.trim())
    .filter(item => /不能|不要|不得|未经确认|仍需|尚未确认|风险/.test(item));
  return compactText(sentences);
}

function compactText(parts) {
  return parts
    .map(item => trimSentenceEnd(item))
    .filter(Boolean)
    .filter((item, index, array) => array.indexOf(item) === index)
    .join("；");
}

function buildProductPainContent(brief, modules) {
  const pain = modules.painPoints || "传统方式存在周期长、沟通成本高、内容复用难、不同平台素材适配麻烦等问题";
  return `本页只围绕客户痛点和使用背景展开：${pain}。重点说明这些问题为什么会影响${brief.audience}对内容效率、沟通成本和素材复用的判断，从而引出为什么需要智能视频制作服务。`;
}

function buildProductPositionContent(brief) {
  return `本页说明${brief.topic}的产品定位：面向${brief.audience}，用于把视频内容需求、素材处理、制作输出和审核协同整理成可推进的服务。适用对象是有企业宣传、内容运营、培训、活动传播或产品说明需求的团队；服务边界是辅助内容生产与交付协同，不替客户确认技术参数、商业承诺或最终审核结论。`;
}

function buildProductFunctionContent(modules) {
  const functions = formatList(modules.functions, "脚本生成、配音生成、素材整理、自动剪辑、字幕生成、模板化输出");
  return `本页只呈现核心功能模块：${functions}。这些模块用于说明服务具备哪些内容生产能力，每个模块只对应一类具体能力。`;
}

function buildProductScenarioContent(modules) {
  const scenarios = formatList(modules.scenarios, "企业宣传片、电商短视频、培训课程视频、活动预热视频、产品介绍视频");
  return `本页只呈现典型应用场景：${scenarios}。每个场景用于帮助客户判断服务是否适配自己的内容需求。`;
}

function buildProductFlowContent(modules) {
  const flow = formatList(modules.flows, "需求沟通、素材收集、脚本确认、视频制作、客户审核、修改交付");
  return `本页只说明服务流程：${flow}。重点让客户看清从需求进入到交付完成的推进顺序，以及每一步需要确认的动作。`;
}

function buildProductCooperationContent(modules) {
  const delivery = formatList(modules.deliveryModes, "标准化模板制作、半定制内容制作、定制化项目制作");
  const materials = formatList(modules.materialPrep, "品牌视觉规范、产品资料、图片视频素材、参考风格、审核负责人");
  const risk = modules.riskBoundaries ? `风险边界需要提前确认：${modules.riskBoundaries}。` : "风险边界需要提前确认：不虚构客户案例、不承诺具体效率提升、不写未经确认的技术参数。";
  return `本页只说明合作模式、资料准备和确认事项。合作模式包括：${delivery}。客户需要配合提供的资料包括：${materials}。${risk}`;
}

function buildProductSummaryContent(brief, modules) {
  const materials = formatList(modules.materialPrep, "品牌视觉规范、产品资料、图片视频素材、参考风格、审核负责人");
  return `本页只做总结与下一步沟通：回顾《${brief.topic}》的产品价值，确认服务边界和客户决策关注点。下一步资料清单包括：${materials}；同时确认案例可披露范围、技术参数、合作模式和审核流程。`;
}

function buildTrainingProblemContent(brief) {
  return `本页只做问题引入：${brief.audience}在日常工作中会遇到文字起草、资料整理、纪要提炼、表格处理和内容初稿等任务，需要知道哪些任务适合智能工具辅助，哪些内容必须由人工判断。`;
}

function buildTrainingFrameworkContent(modules) {
  const workTypes = formatList(modules.trainingWorkTypes.length ? modules.trainingWorkTypes : modules.scenarios, "文字生成、会议纪要整理、资料摘要、表格整理、图片处理、简单方案初稿");
  return `本页只讲工具能辅助的工作类型：${workTypes}。重点说明工具适合辅助起草、整理和初步加工，最终判断与发布仍由人工完成。`;
}

function buildTrainingFlowContent() {
  return "本页只讲基础操作流程：明确任务、输入背景、提出要求、检查结果、修改完善、人工确认。每一步都对应一个实际动作，帮助非技术背景听众知道如何从真实任务开始使用。";
}

function buildTrainingPracticeContent() {
  return "本页只写三块内容：实操练习，选择一个低风险日常任务，写清背景、目标、限制条件和输出格式；常见问题，输入太模糊、忽略审核、结果不准确、格式不符合要求；风险提醒，不要上传敏感数据，不要直接复制未经审核的结果，不要让工具替代最终判断。";
}

function buildTrainingSummaryContent(brief) {
  return `本页只做总结复盘与行动清单：复盘《${brief.topic}》学到的工具用途、适用边界和人工审核要求；给出后续练习任务，建议课后选择一个日常工作任务完成一次安全练习；提醒所有输出都需要内部审核和人工确认；行动清单是选任务、写要求、看结果、做审核、再使用。`;
}

function extractListAfterLabels(brief, labels) {
  const source = [brief.mustHave, brief.followAnswers, brief.materialDetails].filter(Boolean).join("；");
  for (const label of labels) {
    const pattern = new RegExp(`${escapeRegExp(label)}(?:包括|包含|有|为|是|：|:)\\s*([^；。]+)`);
    const matched = source.match(pattern);
    if (matched && matched[1]) return splitListItems(matched[1]);
  }
  return [];
}

function extractFirstClause(text, beforeLabel) {
  const source = normalizeUserInput(text);
  const beforeIndex = source.indexOf(beforeLabel);
  const target = beforeIndex > -1 ? source.slice(0, beforeIndex) : source;
  return target.split(/[；。]/).map(item => item.trim()).find(Boolean) || "";
}

function splitListItems(text) {
  return normalizeUserInput(text)
    .split(/[、，,\/]/)
    .map(item => item.replace(/^(和|以及|及)/, "").trim())
    .filter(Boolean);
}

function formatList(items, fallback) {
  return items.length ? items.join("、") : fallback;
}

function trimSentenceEnd(text) {
  return normalizeUserInput(text).replace(/[。；;，,、\s]+$/g, "");
}

function cleanSectionName(section) {
  return String(section || "").replace(/(深化|补充|\d+)$/g, "");
}

function normalizeAudienceAndPurpose(topic, rawAudience, selectedPurpose, detailedPurpose) {
  const defaultAudience = isAiParkPromotion(topic) ? "园区老板、招商客户、企业负责人" : "尚未明确的目标观众";
  const purposeLike = /展示|提升|吸引力|招商|宣传|推广|说服|转化|成交|汇报|培训|答辩|展示能力/.test(rawAudience);
  const audienceLike = /老板|客户|负责人|领导|团队|评委|投资人|企业负责人|招商客户|招商团队|学员|员工|管理层|合作方/.test(rawAudience);
  const movedPurpose = rawAudience && purposeLike && !audienceLike ? rawAudience : "";

  return {
    audience: movedPurpose ? defaultAudience : (rawAudience || defaultAudience),
    purposeDetail: detailedPurpose || movedPurpose || getPurposeDetail(topic, selectedPurpose)
  };
}

function getPurposeDetail(topic, selectedPurpose) {
  if (isAiParkPromotion(topic) && selectedPurpose === "招商") {
    return "展示园区 AI 能力，提升招商吸引力";
  }

  const purposeMap = {
    "汇报": "汇报项目背景、进展、问题、方案和下一步计划",
    "说服": "建立共识并推动听众接受方案",
    "展示": "清晰展示项目亮点、能力和价值",
    "招商": "呈现合作价值并推动进一步招商沟通",
    "答辩": "证明研究或项目过程完整、方法可靠、结论清楚",
    "培训": "帮助听众理解方法、完成练习并带走行动清单",
    "销售转化": "回应客户痛点并推动咨询、试用或方案确认"
  };

  return purposeMap[selectedPurpose] || selectedPurpose;
}

function getDefaultMustHave(topic) {
  if (isAiParkPromotion(topic)) {
    return "园区招商、AI 视频、AI 展示屏、企业宣传、自动化内容生产、数字化展示能力、合作落地路径";
  }

  return supplementLists.default;
}

function isAiParkPromotion(topic) {
  return /园区/.test(topic) && /AI|ai|人工智能|宣传|推广|招商|数字化/.test(topic);
}

function getAiParkDetail(section, brief) {
  if (!isAiParkPromotion(brief.topic)) return null;
  const key = cleanSectionName(section);
  if (aiParkSectionDetails[key]) return aiParkSectionDetails[key];

  if (/运营复盘/.test(section)) {
    return {
      title: "运营复盘：持续优化园区传播效果",
      content: `本页用于说明后续运营复盘方式，包括内容更新频率、展示屏内容排期、企业素材补充、招商反馈收集和下一轮优化方向。涉及具体表现、反馈数量或转化情况时写“${supplementLists.launch}”。`,
      focus: "把方案从一次性交付延伸到持续运营，让园区后续可以不断更新内容和优化展示触点。",
      image: `建议使用复盘看板、内容日历、反馈闭环图；缺少资料时写“${supplementLists.launch}”。`,
      layout: "建议采用四象限：内容更新、展示触点、企业反馈、下一轮优化。",
      speaker: "讲述时强调复盘不是为了给出夸张结果，而是为了建立可持续改进的运营机制。"
    };
  }

  return null;
}

function getSupplementForSection(section, brief) {
  if (isAiParkPromotion(brief.topic)) {
    const key = cleanSectionName(section);
    if (["园区招商目标", "AI展示屏触点"].includes(key)) return supplementLists.aiParkBase;
    if (["AI视频内容矩阵", "自动化内容生产流程"].includes(key)) return supplementLists.aiVideo;
    if (["企业宣传素材体系", "数字化展示能力"].includes(key)) return supplementLists.company;
    if (["合作落地路径", "执行排期与分工"].includes(key) || /运营复盘/.test(key)) return supplementLists.launch;
    return supplementLists.aiParkBase;
  }

  const key = cleanSectionName(section);
  if (/数据|结果|进展|成果|市场|计划/.test(key)) return supplementLists.data;
  return supplementLists.default;
}

function buildGeneralPageContent(section, brief, profile, purpose, materialNote) {
  const cleanSection = cleanSectionName(section);
  const modules = buildContentModules(brief);
  const contentMap = {
    "背景": `本页说明${brief.topic}的项目背景、沟通对象和当前阶段要解决的核心问题。重点把背景讲成决策语境，让${brief.audience}理解为什么现在需要推进。${materialNote}`,
    "进展": `本页梳理${brief.topic}已经完成的工作、已确认的信息和仍需补齐的材料。表达重点是阶段状态，不用未确认结果制造成果感。${materialNote}`,
    "关键成果": `本页呈现${brief.topic}已经形成的阶段价值，可以写成成果类别、可见变化和下一步应用方向。没有客户确认材料时写“${getSupplementForSection(cleanSection, brief)}”。`,
    "问题": `本页聚焦影响${brief.topic}推进的主要卡点，区分信息缺口、资源缺口、协同问题和风险边界，让问题服务于后续方案。${materialNote}`,
    "解决方案": `本页给出针对${brief.topic}的解决路径，按“要解决什么、怎么做、由谁配合、产出什么”展开。${materialNote}`,
    "计划": `本页安排${brief.topic}的阶段计划，建议拆成准备、制作、审核、上线或汇报四类动作。涉及具体周期时写“${getSupplementForSection(cleanSection, brief)}”。`,
    "资源需求": `本页明确${brief.topic}需要的资料、人员配合、审核口径和决策支持，让听众知道下一步需要提供什么。${materialNote}`,
    "市场机会": `本页围绕${brief.topic}说明机会来源、目标对象和价值空间，只写趋势判断和客户已确认的材料，不虚构规模或排名。${materialNote}`,
    "痛点": `本页把${brief.topic}对应的客户痛点拆成认知、效率、展示和转化四类问题，为后续方案建立必要性。${materialNote}`,
    "解决方案": `本页把${brief.topic}的方案拆成核心模块、执行流程和交付形态，避免只写概念。${materialNote}`,
    "商业模式": `本页说明${brief.topic}如何形成合作闭环，包括服务对象、交付内容、合作方式和后续运营，不写未确认的收益承诺。${materialNote}`,
    "竞争优势": `本页从流程、体验、内容生产效率、交付协同和可持续运营角度讲${brief.topic}的差异，不写绝对化比较。${materialNote}`,
    "落地计划": `本页给出${brief.topic}的落地步骤，建议从试点场景、资料清单、制作审核、上线展示和复盘优化展开。${materialNote}`,
    "用户痛点": `本页说明目标用户为什么需要${brief.topic}，用真实使用场景替代空泛描述。${materialNote}`,
    "产品定位": `本页明确${brief.topic}服务谁、解决什么问题、适合什么场景，让产品边界清楚。${materialNote}`,
    "核心功能": `本页把${brief.topic}拆成可理解的功能模块，每个模块对应一个使用价值。${materialNote}`,
    "使用场景": `本页展示${brief.topic}进入真实场景后的流程，让观众看到如何使用、何时使用、由谁使用。${materialNote}`,
    "价值总结": `本页总结${brief.topic}带来的价值，围绕效率、体验、展示、协同或转化路径表达，不写未确认结果。${materialNote}`,
    "问题引入": `本页用一个真实问题引出${brief.topic}，让听众知道为什么要学或为什么要听。${materialNote}`,
    "知识框架": `本页搭建${brief.topic}的知识框架，用模块化方式降低理解成本。${materialNote}`,
    "案例解释": `本页可以用假设场景或客户已提供材料解释${brief.topic}，没有真实素材时写“${getSupplementForSection(cleanSection, brief)}”。`,
    "练习互动": `本页设计一个围绕${brief.topic}的小练习或互动问题，让听众把方法带入自己的工作场景。${materialNote}`,
    "总结复盘": `本页复盘${brief.topic}的关键知识和行动清单，让听众知道下一步怎么做。${materialNote}`,
    "客户痛点与使用背景": buildProductPainContent(brief, modules),
    "产品定位与适用对象": buildProductPositionContent(brief),
    "核心功能模块": buildProductFunctionContent(modules),
    "典型应用场景": buildProductScenarioContent(modules),
    "服务流程与交付方式": buildProductFlowContent(modules),
    "合作模式与资料准备": buildProductCooperationContent(modules),
    "为什么要学：问题引入": buildTrainingProblemContent(brief),
    "知识框架：工具能做什么": buildTrainingFrameworkContent(modules),
    "操作流程：从输入到输出": buildTrainingFlowContent(modules),
    "实操练习与常见问题": buildTrainingPracticeContent(modules),
    "总结复盘与行动清单": buildTrainingSummaryContent(brief, modules)
  };

  return contentMap[cleanSection] || `本页围绕${brief.topic}的“${cleanSection}”展开，先给结论，再给执行动作，最后标注客户需要补充的资料。${materialNote}`;
}

function buildGeneralTalkFocus(section, brief, profile) {
  const cleanSection = cleanSectionName(section);
  const focusMap = {
    "背景": "不要泛泛介绍背景，要把背景讲成为什么现在必须推进。",
    "进展": "按已完成、正在做、待确认三层讲清，不夸大阶段成果。",
    "关键成果": "只讲客户已确认的阶段价值，未确认内容写待补充。",
    "问题": "把问题讲成阻碍决策或落地的真实卡点。",
    "解决方案": "每个方案动作都要对应一个问题，避免空泛建议。",
    "计划": "强调节奏、责任和审核节点，让听众知道怎么推进。",
    "资源需求": "明确需要听众提供哪些支持或确认哪些口径。",
    "市场机会": "讲趋势和机会，不写未经确认的规模或排名。",
    "痛点": "把痛点讲具体，连接到后续方案模块。",
    "商业模式": "讲合作闭环和交付方式，不讲未经确认的收益。",
    "竞争优势": "讲差异来源，不做绝对化比较。",
    "落地计划": "讲试点、上线、复盘三步，让方案可执行。",
    "客户痛点与使用背景": "把痛点说成客户决策中的真实阻力，连接到后续产品能力。",
    "产品定位与适用对象": "说明产品服务谁、解决什么问题、适合哪些内容团队和决策角色。",
    "核心功能模块": "逐项讲清功能与价值，不用资料不足替代客户已经写出的能力清单。",
    "典型应用场景": "按场景说明输入材料、输出形式和审核重点，让客户判断是否适用。",
    "服务流程与交付方式": "用流程降低客户不确定感，讲清每一步的确认动作和交付物。",
    "合作模式与资料准备": "把合作模式、资料清单和待确认边界讲清，方便客户进入下一轮沟通。",
    "为什么要学：问题引入": "用日常任务引出学习必要性，让非技术听众先建立使用场景。",
    "知识框架：工具能做什么": "讲清工具能辅助的工作类型，同时强调人工判断和审核责任。",
    "操作流程：从输入到输出": "只讲六步基础操作：明确任务、输入背景、提出要求、检查结果、修改完善、人工确认。",
    "实操练习与常见问题": "只讲练习任务、常见问题和三条风险提醒，避免堆叠完整风险限制。",
    "总结复盘与行动清单": "只做课程复盘、后续练习任务、内部审核提醒和行动清单。"
  };

  return focusMap[cleanSection] || `本页先说与${brief.audience}最相关的结论，再说明它如何回应${profile.concern}。`;
}

function buildGeneralSpeakerNote(section, brief) {
  const cleanSection = cleanSectionName(section);
  const noteMap = {
    "客户痛点与使用背景": `这一页先和客户对齐问题：传统制作方式容易出现周期长、沟通成本高、复用困难和多平台适配麻烦。把这些问题和《${brief.topic}》要解决的决策场景连接起来。`,
    "产品定位与适用对象": `这一页说明《${brief.topic}》不是单次视频制作，而是一套面向企业宣传、内容运营、培训和活动推广的服务解决方案。客户需要判断自己是否具备基础资料、审核人和交付节奏。`,
    "核心功能模块": `这一页逐项讲核心能力，重点落在客户已经提供的能力清单上。每讲一个功能，都补一句它如何减少沟通反复、提升内容复用或明确交付边界。`,
    "典型应用场景": `这一页按企业宣传片、电商短视频、培训课程视频、活动预热视频和产品介绍视频等场景展开。提醒客户不同场景的素材、时长、审核口径和输出格式会不同。`,
    "服务流程与交付方式": `这一页让客户看到合作如何推进：先沟通需求和收集素材，再确认脚本、制作视频、客户审核、修改交付。重点是减少不确定感。`,
    "合作模式与资料准备": `这一页收拢到合作前准备。客户需要确认功能资料、案例可用范围、技术参数、品牌规范、素材权限和审核负责人，合作模式可以按标准化、半定制、定制化分层沟通。`,
    "为什么要学：问题引入": `这一页从日常工作切入：写文字、整理纪要、摘要资料、处理表格和图片时，智能工具可以提高起草效率，但不能替代判断。`,
    "知识框架：工具能做什么": `这一页讲清工具的能力边界：它适合辅助生成初稿、整理信息和处理简单素材，不适合承接敏感数据、未经确认结论或最终判断。`,
    "操作流程：从输入到输出": `这一页只带听众走六步：明确任务，输入背景，提出要求，检查结果，修改完善，人工确认。`,
    "实操练习与常见问题": `这一页只安排一个低风险日常任务练习，并提醒三类常见问题：输入太模糊、忽略审核、格式不符合要求。风险提醒控制在三条：不上传敏感数据，不直接复制未经审核的结果，不让工具替代最终判断。`,
    "总结复盘与行动清单": `这一页复盘课程收获，布置后续练习任务，提醒内部审核和人工确认，最后用行动清单收束。`
  };

  return noteMap[cleanSection] || `讲这一页时围绕“${cleanSection}”展开，直接说明它和《${brief.topic}》的关系，再提醒客户只使用已确认资料，不编造经营、合作、资金或第三方背书内容。`;
}

function renderOutline(outline) {
  if (Array.isArray(outline.slides)) {
    renderApiOutline(outline);
    return;
  }

  resultTitle.textContent = outline.title;
  cards.innerHTML = `
    <article class="deck-summary">
      <h3>${escapeHtml(outline.title)}</h3>
      <p>${escapeHtml(outline.summary)}</p>
      <p>${escapeHtml(outline.proofNote)}</p>
    </article>
    <article class="logic-card">
      <h3>PPT 整体逻辑结构</h3>
      <p>${escapeHtml(outline.logic)}</p>
    </article>
    ${outline.pages.map(page => `
      <article class="page-card">
        <div class="page-card-header">
          <span class="page-index">${page.pageNo}</span>
          <h3>${escapeHtml(page.title)}</h3>
        </div>
        <div class="page-card-body">
          <div class="detail-block full">
            <span class="detail-label">每一页核心内容</span>
            <p>${escapeHtml(page.content)}</p>
          </div>
          <div class="detail-block">
            <span class="detail-label">每一页讲述重点</span>
            <p>${escapeHtml(page.talkFocus)}</p>
          </div>
          <div class="detail-block">
            <span class="detail-label">每一页配图建议</span>
            <p>${escapeHtml(page.image)}</p>
          </div>
          <div class="detail-block">
            <span class="detail-label">每一页排版建议</span>
            <p>${escapeHtml(page.layout)}</p>
          </div>
          <div class="detail-block">
            <span class="detail-label">每一页演讲备注</span>
            <p>${escapeHtml(page.speaker)}</p>
          </div>
        </div>
      </article>
    `).join("")}
    <article class="logic-card">
      <h3>最后一页总结/行动号召</h3>
      <p>${escapeHtml(outline.closing)}</p>
    </article>
  `;
}

function renderApiOutline(outline) {
  resultTitle.textContent = outline.title;
  const quality = outline.quality_report || {};
  const planningModel = quality.planning_model || {};
  const qualityStatus = outline.quality_status || quality.quality_status || outline.output_status || quality.output_status || "review_required";
  const rawOutputStatus = qualityStatus;
  const isDraft = outline.output_status === "draft" || quality.output_status === "draft";
  const productionReady = qualityStatus === "production_ready";
  const sourceSummary = outline.source_summary || quality.source_summary || {};
  const planningModelNotice = qualityStatus === "fallback"
    ? "本次模型内容未进入最终脚本，当前展示的是安全兜底版本。"
    : "";
  const displayStatus = resultStatusDisplay({ qualityStatus, isDraft, quality });
  const resultStatusText = displayStatus.label;
  const statusClass = productionReady ? "quality-pass" : "quality-review";
  const contentStateHtml = renderContentStateSummary(outline.content_state_summary || quality.content_state);
  const reviewWarningsHtml = renderPublicReviewWarnings(quality.review_warnings || outline.review_warnings);
  const simpleNextStepsHtml = activeMode === SIMPLE_MODE && isDraft
    ? renderSimpleDraftNextSteps(outline, quality)
    : "";
  const navHtml = renderResultNavigation(outline.slides);
  cards.innerHTML = `
    <article class="deck-summary result-summary">
      ${renderResultStatusBanner({ qualityStatus, isDraft, planningModel, quality, resultStatusText, rawOutputStatus })}
      <h3>${escapeHtml(outline.title)}</h3>
      ${outline.subtitle ? `<p>${escapeHtml(outline.subtitle)}</p>` : ""}
      ${Array.isArray(outline.executive_summary) && outline.executive_summary.length ? `
        <ul class="clean-list">${outline.executive_summary.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      ` : ""}
      <p class="quality-badge ${statusClass}">${escapeHtml(resultStatusText)} · ${escapeHtml(String(quality.score ?? "-"))}/100</p>
      ${isDraft ? `<p role="status">当前结果为可编辑草案，不等于生产级通过；请重点复核事实边界、系统建议和待确认内容。</p>` : ""}
      ${contentStateHtml}
      ${reviewWarningsHtml}
      ${planningModelNotice ? `<p role="status">${escapeHtml(planningModelNotice)}</p>` : ""}
    </article>
    ${simpleNextStepsHtml}
    ${navHtml}
    ${outline.slides.map(slide => `
      <article class="page-card" id="slide-${slide.index}">
        <div class="page-card-header">
          <span class="page-index">${slide.index}</span>
          <h3>${escapeHtml(slide.title)}</h3>
        </div>
        <div class="page-card-body">
          <div class="detail-block full key-message-block">
            <span class="detail-label">关键结论</span>
            <p>${escapeHtml(slide.key_message || "")}</p>
          </div>
          <div class="detail-block full">
            <span class="detail-label">客户可见正文</span>
            <p>${escapeHtml(slide.content)}</p>
          </div>
          <div class="detail-block full">
            <span class="detail-label">视觉建议</span>
            <p>${escapeHtml(slide.visual_suggestion)}</p>
          </div>
        </div>
        <details class="production-details">
          <summary>制作与验证信息</summary>
          <div class="production-grid">
            <div><strong>页面目标</strong><p>${escapeHtml(slide.objective || "")}</p></div>
            <div><strong>证据状态</strong><p>${escapeHtml(slide.evidence_status || "")}</p></div>
            <div class="wide"><strong>证据来源</strong><p>${escapeHtml(formatEvidenceSources(slide.evidence_sources))}</p></div>
            <div><strong>数据需求</strong><p>${escapeHtml((slide.data_requirements || []).join("、") || "无新增资料要求")}</p></div>
            <div><strong>图片提示词</strong><p>${escapeHtml(slide.image_prompt || "")}</p></div>
            <div class="wide"><strong>演讲备注</strong><p>${escapeHtml(slide.speaker_notes || "")}</p></div>
          </div>
        </details>
      </article>
    `).join("")}
    <details class="production-details deck-production-details">
      <summary>全局制作、资料与质量报告</summary>
      <div class="production-grid">
        <div class="wide"><strong>全局视觉规范</strong><p>${escapeHtml(formatObject(outline.global_visual_style))}</p></div>
        <div class="wide"><strong>资料缺口</strong><p>${escapeHtml(formatMissingMaterials(outline.missing_materials))}</p></div>
        <div class="wide"><strong>制作策略</strong><p>${escapeHtml(formatObject(outline.production_strategy))}</p></div>
        <div class="wide"><strong>结果来源</strong><p>${escapeHtml(formatPublicSourceSummary(sourceSummary))}</p></div>
        <div class="wide"><strong>人工复核提醒</strong><p>${escapeHtml(publicReviewWarningText(quality.review_warnings || outline.review_warnings))}</p></div>
      </div>
    </details>
  `;
}

function renderSimpleDraftNextSteps(outline, quality) {
  const model = buildSimpleDraftNextStepModel(outline, quality);
  if (!model.confirmed.length && !model.tasks.length && !model.reminders.length) {
    return renderSimpleProfessionalEntry();
  }

  const visibleTasks = model.tasks.slice(0, SIMPLE_NEXT_STEP_VISIBLE_LIMIT);
  const hiddenTasks = model.tasks.slice(SIMPLE_NEXT_STEP_VISIBLE_LIMIT);

  return `
    <article class="simple-next-steps" aria-label="普通模式下一步完善">
      <div class="simple-next-steps-header">
        <span>下一步完善</span>
        <h3>继续接单，不中断当前草案</h3>
        <p>普通 Draft 已成功生成；下面只根据结构化资料状态提示下一步，不把默认空选项当成缺失。</p>
      </div>
      ${renderSimpleConfirmedItems(model.confirmed)}
      ${visibleTasks.length ? `
        <section class="simple-task-section" aria-label="补充任务">
          <h4>补充任务</h4>
          <ol class="simple-task-list">
            ${visibleTasks.map(renderSimpleTaskItem).join("")}
          </ol>
        </section>
      ` : ""}
      ${hiddenTasks.length ? `
        <details class="simple-task-more">
          <summary>还有 ${hiddenTasks.length} 条补充项</summary>
          <ol class="simple-task-list">
            ${hiddenTasks.map(renderSimpleTaskItem).join("")}
          </ol>
        </details>
      ` : ""}
      ${renderSimpleReminders(model.reminders)}
      ${renderSimpleProfessionalEntry()}
      <div class="simple-next-actions">
        <button class="primary-btn" type="button" data-simple-action="regenerate">再次生成</button>
      </div>
    </article>
  `;
}

function buildSimpleDraftNextStepModel(outline, quality) {
  const contentState = quality?.content_state && typeof quality.content_state === "object"
    ? quality.content_state
    : {};
  const confirmed = normalizeContentStateItems(contentState.confirmed).map(item => ({
    key: normalizeContentStateKey(item.key),
    title: formatContentStateTitle(item),
    text: formatContentStateText(item)
  }));
  const tasks = [];

  normalizeContentStateItems(contentState.needs_confirmation).forEach(item => {
    const key = normalizeContentStateKey(item.key);
    if (isSimpleMaterialNeedKey(key)) {
      tasks.push(buildSimpleTask("needs_confirmation", key, item, "simpleMaterialsText"));
      return;
    }
    tasks.push(buildSimpleTask("needs_confirmation", key || "unknown", item, ""));
  });

  normalizeMissingMaterials(outline?.missing_materials).forEach(item => {
    tasks.push({
      bucket: "needs_confirmation",
      key: `missing_material:${item.label}`,
      title: "资料缺口",
      text: item.label,
      target: "simpleMaterialsText",
      priority: 1
    });
  });

  if (isSimpleMaterialsModeSelected() && !getSimpleMaterialsTextValue()) {
    tasks.push({
      bucket: "needs_confirmation",
      key: "selected_materials_empty",
      title: "客户资料",
      text: "已选择有资料模式，请补充客户资料内容。",
      target: "simpleMaterialsText",
      priority: 1
    });
  }

  normalizeContentStateItems(contentState.suggested).forEach(item => {
    const key = normalizeContentStateKey(item.key);
    const mapping = SIMPLE_CONTENT_STATE_TARGETS[key];
    tasks.push(buildSimpleTask("suggested", key || "unknown", item, mapping?.target || ""));
  });

  const reminders = safeArray(quality?.warnings)
    .filter(item => typeof item === "string" && item.trim())
    .map(formatRepairWarningForDisplay);

  return {
    confirmed: dedupeSimpleConfirmed(confirmed),
    tasks: dedupeSimpleTasks(tasks).sort(compareSimpleTasks),
    reminders
  };
}

function normalizeContentStateItems(items) {
  return safeArray(items).filter(item => item && typeof item === "object" && typeof item.key === "string");
}

function normalizeMissingMaterials(items) {
  return safeArray(items)
    .filter(item => item && typeof item === "object" && typeof item.label === "string" && item.label.trim())
    .map(item => ({ label: item.label.trim() }));
}

function normalizeContentStateKey(key) {
  return typeof key === "string" ? key.trim() : "";
}

function isSimpleMaterialNeedKey(key) {
  return key.startsWith("missing:") || key.startsWith("missing_material:") || key.startsWith("explicit_gap:");
}

function buildSimpleTask(bucket, key, item, target) {
  return {
    bucket,
    key,
    title: formatContentStateTitle(item),
    text: formatContentStateText(item),
    target,
    priority: bucket === "needs_confirmation" ? 1 : 2
  };
}

function formatContentStateTitle(item) {
  return String(item?.label || "资料项").trim();
}

function formatContentStateText(item) {
  return String(item?.value || "").trim() || "请复核该资料项。";
}

function dedupeSimpleConfirmed(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = item.key || `${item.title}:${item.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
}

function dedupeSimpleTasks(tasks) {
  const byKey = new Map();
  tasks.forEach(task => {
    const normalizedKey = task.key.startsWith("missing_material:") ? `missing_material:${task.text}` : task.key;
    const key = `${task.bucket}:${normalizedKey}:${task.target || "display"}`;
    const existing = byKey.get(key);
    if (!existing || task.priority < existing.priority) byKey.set(key, task);
  });
  return [...byKey.values()];
}

function compareSimpleTasks(a, b) {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.title.localeCompare(b.title, "zh-Hans-CN");
}

function renderSimpleConfirmedItems(items) {
  if (!items.length) return "";
  return `
    <section class="simple-confirmed-section" aria-label="当前已确认">
      <h4>当前已确认</h4>
      <ul class="clean-list">
        ${items.map(item => `<li><strong>${escapeHtml(item.title)}：</strong>${escapeHtml(item.text)}</li>`).join("")}
      </ul>
    </section>
  `;
}

function renderSimpleTaskItem(task) {
  const label = task.bucket === "needs_confirmation" ? "待确认" : "建议补充";
  return `
    <li class="simple-task-item" data-simple-task-bucket="${escapeHtml(task.bucket)}" data-simple-task-key="${escapeHtml(task.key)}">
      <div class="simple-task-header">
        <strong>${escapeHtml(task.title)}</strong>
        <span>${escapeHtml(label)}</span>
      </div>
      <p>${escapeHtml(task.text)}</p>
      ${task.target ? `<button class="secondary-btn simple-task-action" type="button" data-simple-next-target="${escapeHtml(task.target)}">去补充</button>` : ""}
    </li>
  `;
}

function renderSimpleReminders(reminders) {
  if (!reminders.length) return "";
  return `
    <details class="simple-reminders">
      <summary>额外提醒</summary>
      <ul class="clean-list">
        ${reminders.map(item => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </details>
  `;
}

function renderSimpleProfessionalEntry() {
  return `
    <section class="simple-professional-entry" aria-label="专业模式更适合">
      <div>
        <h4>专业模式更适合</h4>
        <p>需要演讲稿、配图、排版或生产级质量检查？切换前会带入主题、非空客户资料、非空截止时间，以及可安全作为说明文本的用途。</p>
        <p>不会覆盖专业模式中已有的非空字段；不会带入 Draft 正文、质量报告、content_state、warnings、模型状态或内部数据；切换后仍需自行补充受众、内容约束和交付细节，也不会自动提交专业模式。</p>
      </div>
      <button class="ghost-btn" type="button" data-simple-action="switch-professional">带入已有信息并切换到专业模式</button>
    </section>
  `;
}

function isSimpleMaterialsModeSelected() {
  return document.querySelector('input[name="simpleMaterials"]:checked')?.value === SIMPLE_MATERIALS_WITH_DETAILS;
}

function getSimpleMaterialsTextValue() {
  return document.getElementById("simpleMaterialsText")?.value.trim() || "";
}

function renderResultStatusBanner({ qualityStatus, isDraft, planningModel, quality, resultStatusText, rawOutputStatus = "" }) {
  const productionReady = qualityStatus === "production_ready";
  const isFallback = qualityStatus === "fallback";
  const reviewRequired = qualityStatus === "review_required";
  const displayStatus = resultStatusDisplay({ qualityStatus, isDraft, quality });
  const toneClass = productionReady
    ? "status-production"
    : reviewRequired
    ? "status-draft"
    : isFallback
    ? "status-fallback"
    : isDraft
    ? "status-draft"
    : "status-failure";
  const rawProductionReady = productionReady ? "true" : "false";
  const rawPlanningStatus = planningModel.status || "";
  const supportTierLabel = supportTierDisplayLabel(quality.support_tier);
  return `
    <div class="status-banner ${toneClass}" data-output-status="${escapeHtml(rawOutputStatus)}" data-production-ready="${escapeHtml(rawProductionReady)}" data-planning-model-status="${escapeHtml(rawPlanningStatus)}">
      <strong>${escapeHtml(displayStatus.title)}</strong>
      <p>${escapeHtml(displayStatus.description)}</p>
      <div class="status-meta">
        <span class="status-pill">${escapeHtml(resultStatusText)}</span>
        <span class="status-pill">分数 ${escapeHtml(String(quality.score ?? "-"))}/${escapeHtml(String(quality.threshold ?? 95))}</span>
        ${supportTierLabel ? `<span class="status-pill">${escapeHtml(supportTierLabel)}</span>` : ""}
      </div>
    </div>
  `;
}

const PUBLIC_REVIEW_WARNING_LABELS = Object.freeze({
  material_relevance: "部分内容与现有资料的对应关系需要人工确认。",
  required_section_coverage: "部分明确要求已安全补齐，建议确认覆盖是否充分。",
  instruction_shell_title: "个别页面标题已自动清洁，建议确认表达是否自然。",
  title_content_match: "个别页面的标题与正文需要进一步对齐。",
  title_body_alignment: "个别页面的标题与正文需要进一步对齐。",
  model_content_retention: "最终脚本未完整保留模型原始表达，建议人工复核。",
  model_content_not_retained: "最终脚本主要由安全规则补齐，建议人工复核。",
  model_output_page_count_mismatch: "模型页数与目标页数不同，系统已安全重组。",
  quality_below_production_threshold: "当前质量分未达到生产标准，建议人工复核。",
  planner_rejected: "模型候选未被直接采用，系统已生成可编辑结果。",
  safe_deterministic_fallback_used: "当前展示安全兜底版本，请补充资料并人工复核。",
  local_model_unavailable: "本地模型当前不可用，系统已生成安全兜底版本。",
  requirement_fulfillment_budget_exceeded: "部分要求在当前页数内需要人工确认取舍。"
});

function renderPublicReviewWarnings(items = []) {
  const labels = publicReviewWarningLabels(items);
  if (!labels.length) return "";
  return `
    <section class="review-warning-list" role="status" aria-label="人工复核提醒">
      <strong>建议人工复核</strong>
      <ul class="clean-list">${labels.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </section>
  `;
}

function publicReviewWarningText(items = []) {
  const labels = publicReviewWarningLabels(items);
  return labels.length ? labels.join("；") : "当前没有额外的人工复核提醒。";
}

function publicReviewWarningLabels(items = []) {
  return [...new Set(safeArray(items).map(item => {
    const code = typeof item === "string" ? item : item?.code || item?.gate_id || item?.id || "";
    return PUBLIC_REVIEW_WARNING_LABELS[String(code).trim()] || "存在需要人工复核的质量项。";
  }).filter(Boolean))];
}

function formatPublicSourceSummary(source = {}) {
  if (source.fallback_used) return "安全兜底生成；本地模型内容未作为最终脚本来源。";
  if (source.model_content_retained) {
    return source.deterministic_completion_used
      ? "本地模型内容已采用，并由安全规则完成必要补齐。"
      : "本地模型内容已采用。";
  }
  if (source.model_attempted) return "已尝试本地模型；最终脚本主要由安全规则生成。";
  return "本次脚本由安全规则生成。";
}

function supportTierDisplayLabel(supportTier) {
  if (supportTier === "production") return "专业质量检查";
  return "";
}

function renderResultNavigation(slides = []) {
  if (!Array.isArray(slides) || slides.length < 2) return "";
  return `
    <nav class="result-nav" aria-label="大纲页面目录">
      <strong>页面目录</strong>
      <div class="result-nav-links">
        ${slides.map(slide => `<a href="#slide-${slide.index}">第 ${slide.index} 页</a>`).join("")}
      </div>
    </nav>
  `;
}

function renderContentStateSummary(summary = {}) {
  const groups = [
    ["用户已确认", summary.confirmed || [], "confirmed"],
    ["系统建议", summary.suggested || [], "suggested"],
    ["待确认", summary.needs_confirmation || [], "needs-confirmation"]
  ].filter(([, items]) => Array.isArray(items) && items.length);
  if (!groups.length) return "";
  return `
    <div class="content-state-grid" aria-label="资料状态摘要">
      ${groups.map(([label, items, className]) => `
        <div class="content-state-card ${className}">
          <strong>${escapeHtml(label)}</strong>
          <ul class="clean-list">${items.slice(0, 6).map(item => `<li>${escapeHtml(typeof item === "string" ? item : `${item.label || ""}：${item.value || ""}`)}</li>`).join("")}</ul>
        </div>
      `).join("")}
    </div>
  `;
}

function outlineToText(outline, version = "production") {
  if (Array.isArray(outline.slides)) {
    const slides = outline.slides.map(slide => [
      `第${slide.index}页：${slide.title}`,
      `关键结论：${slide.key_message || ""}`,
      `正文：${slide.content}`,
      `视觉建议：${slide.visual_suggestion}`,
      ...(version === "production" ? [
        `证据状态：${slide.evidence_status || ""}`,
        `证据来源：${formatEvidenceSources(slide.evidence_sources)}`,
        `数据需求：${(slide.data_requirements || []).join("、") || "无新增资料要求"}`,
        `图片提示词：${slide.image_prompt}`,
        `演讲备注：${slide.speaker_notes || ""}`
      ] : [])
    ].join("\n")).join("\n\n");
    const customerSections = [
      `【PPT 总标题】\n${outline.title}`,
      outline.subtitle ? `【副标题】\n${outline.subtitle}` : "",
      `【执行摘要】\n${(outline.executive_summary || []).map(item => `• ${item}`).join("\n")}`,
      `【逐页内容】\n${slides}`
    ].filter(Boolean);
    if (version === "client") return customerSections.join("\n\n");
    return [
      ...customerSections,
      `【全局视觉规范】\n${formatObject(outline.global_visual_style)}`,
      `【资料缺口】\n${formatMissingMaterials(outline.missing_materials)}`,
      `【制作策略】\n${formatObject(outline.production_strategy)}`,
      `【质量报告】\n${formatQualityReport(outline.quality_report)}`
    ].join("\n\n");
  }

  const pages = outline.pages.map(page => [
    `第${page.pageNo}页：${page.title}`,
    `核心内容：${page.content}`,
    `讲述重点：${page.talkFocus}`,
    `配图建议：${page.image}`,
    `排版建议：${page.layout}`,
    `演讲备注：${page.speaker}`
  ].join("\n")).join("\n\n");

  return [
    `【PPT 总标题】\n${outline.title}`,
    `【PPT 整体逻辑结构】\n${outline.logic}`,
    `【整体说明】\n${outline.summary}\n${outline.proofNote}`,
    `【逐页制作提纲】\n${pages}`,
    `【最后一页总结/行动号召】\n${outline.closing}`
  ].join("\n\n");
}

function formatObject(value) {
  if (!value || typeof value !== "object") return "无";
  return Object.entries(value).map(([key, item]) => `${key}：${String(item)}`).join("；");
}

function formatMissingMaterials(items) {
  if (!Array.isArray(items) || !items.length) return "无新增资料缺口";
  return items.map(item => `${item.label}（用于：${(item.required_for || []).join("、")}）`).join("；");
}

function formatEvidenceSources(items) {
  if (!Array.isArray(items) || !items.length) return "无直接客户材料来源";
  return items.map(item => `${item.field}：${item.excerpt}`).join("；");
}

function formatRepairs(items) {
  if (!Array.isArray(items) || !items.length) return "初次生成已达到当前返回标准，未触发自动修复。";
  return items.map(item => `第 ${item.round} 轮：${item.before_score} → ${item.after_score}，修复 ${item.changes.length} 项`).join("；");
}

function formatQualityReport(report = {}) {
  const dimensions = Object.entries(report.dimensions || {}).map(([name, item]) => `${name} ${item.score}/${item.max}（${(item.reasons || []).join("；")}）`).join("\n");
  const gates = Object.entries(report.hard_gates || {}).map(([name, gate]) => `${gate.passed ? "通过" : "失败"} ${name}：${gate.reason}`).join("\n");
  const riskDiagnostics = formatRiskDiagnosticsForText(report.risk_rule_diagnostics);
  const requiredDiagnostics = formatRequiredDiagnosticsForText(report.required_section_diagnostics);
  return [
    `状态：${report.status_label || "待确认"}`,
    `总分：${report.score ?? "-"}/${report.threshold ?? 95}`,
    `支持级别：${report.support_tier || "-"}`,
    `自动修复轮次：${report.repair_rounds ?? 0}`,
    `需求规划模型：${formatPlanningModel(report.planning_model)}`,
    dimensions,
    gates,
    `警告：${(report.warnings || []).join("；") || "无"}`,
    `风险规则诊断：${riskDiagnostics}`,
    `必须内容覆盖诊断：${requiredDiagnostics}`
  ].filter(Boolean).join("\n");
}

function formatRiskDiagnosticsForText(diagnostics) {
  const items = safeArray(diagnostics);
  if (!items.length) return "暂无风险规则诊断";
  return items.map((item, index) => [
    `规则${index + 1}`,
    `rule_source=${formatDiagnosticValue(item?.rule_source)}`,
    `raw_text=${formatDiagnosticValue(item?.raw_text)}`,
    `subject_terms=${formatDiagnosticValue(item?.subject_terms)}`,
    `entities=${formatDiagnosticValue(item?.entities)}`,
    `prohibited_relations=${formatDiagnosticValue(item?.prohibited_relations)}`,
    `forbidden_zones=${formatDiagnosticValue(item?.forbidden_zones)}`,
    `matched_region=${formatDiagnosticValue(item?.matched_region)}`,
    `matched_clause=${formatDiagnosticValue(item?.matched_clause)}`,
    `violation_reason=${formatDiagnosticValue(item?.violation_reason)}`,
    `parse_error=${formatDiagnosticValue(item?.parse_error)}`,
    `fallback_reason=${formatDiagnosticValue(item?.fallback_reason)}`
  ].join("；")).join("\n");
}

function formatRequiredDiagnosticsForText(diagnostics) {
  const items = safeArray(diagnostics);
  if (!items.length) return "暂无必须内容覆盖诊断";
  return items.map((item, index) => [
    `要求${index + 1}`,
    `required_item=${formatDiagnosticValue(item?.required_item)}`,
    `covered=${formatDiagnosticValue(item?.covered)}`,
    `matched_page=${formatDiagnosticValue(item?.matched_page)}`,
    `matched_excerpt=${formatDiagnosticValue(item?.matched_excerpt)}`,
    `coverage_reason=${formatDiagnosticValue(item?.coverage_reason)}`,
    `keyword_only_rejected=${formatDiagnosticValue(item?.keyword_only_rejected)}`
  ].join("；")).join("\n");
}

function formatPlanningModel(model = {}) {
  if (!model.enabled) return "未启用，使用现有规则规划";
  if (model.used) return `已使用本地模型 ${model.model_id || ""}`.trim();
  return `安全降级为现有规则（${model.reason_code || "LOCAL_MODEL_UNAVAILABLE"}）`;
}

function parseTerms(text) {
  return normalizeUserInput(text)
    .split(/[，,、；;。\n\r\t]+/)
    .map(item => item.trim())
    .filter(shouldUseRiskTerm);
}

function normalizeUserInput(value) {
  return String(value || "")
    .replace(/\r\n|\r|\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMultilineInput(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .split("\n")
    .map(line => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitize(text, topic, riskTerms, options = {}) {
  if (!text) return "";

  const placeholder = "__PPT_TOPIC_EXACT__";
  const protectedTerms = protectNormalTerms(normalizeUserInput(text));
  let output = protectedTerms.text.split(topic).join(placeholder);
  const terms = [...new Set(riskTerms || bannedTerms)];

  terms.forEach(term => {
    if (!shouldReplaceRiskTerm(term, topic)) return;
    if (bannedTerms.includes(term)) return;
    const replacement = options.allowSupplement ? supplementLists.default : "需规避的敏感信息";
    output = output.replace(new RegExp(escapeRegExp(term), "g"), replacement);
  });

  output = output
    .replace(/第一(名|位|梯队|品牌|选择)/g, "需客户确认的领先表述")
    .replace(/唯一|最强|最好|绝对|保证/g, "需客户确认的稳妥表述")
    .replace(/真实客户|标杆客户|头部客户/g, options.allowSupplement ? supplementLists.company : "需客户确认的客户案例")
    .replace(invalidPlaceholderPattern, options.allowSupplement ? supplementLists.default : "客户后续资料");

  output = protectedTerms.restore(output).split(placeholder).join(topic);
  return finalCleanOutput(output, topic, options);
}

function shouldUseRiskTerm(term) {
  if (!term || term.length < 2) return false;
  if (/^(不要|不能|禁止|避免|不写|不要写|不要提|不能提)/.test(term)) return false;
  return shouldReplaceRiskTerm(term, "");
}

function shouldReplaceRiskTerm(term, topic) {
  const cleanTerm = normalizeUserInput(term);
  if (!cleanTerm || cleanTerm === topic) return false;
  if (cleanTerm.length < 3 && !/[A-Za-z0-9]/.test(cleanTerm)) return false;
  if (isProtectedNormalTerm(cleanTerm)) return false;
  if (/^(不要|不能|禁止|避免|不写|不要写|不要提|不能提)/.test(cleanTerm)) return false;
  return true;
}

function isProtectedNormalTerm(term) {
  const normalized = normalizeComparable(term);
  return protectedNormalTerms.some(item => normalizeComparable(item) === normalized);
}

function protectNormalTerms(text) {
  const sortedTerms = [...protectedNormalTerms].sort((a, b) => b.length - a.length);
  const replacements = [];
  let output = text;

  sortedTerms.forEach((term, index) => {
    const token = `__PROTECTED_NORMAL_TERM_${index}__`;
    const pattern = new RegExp(escapeRegExp(term), "g");
    if (pattern.test(output)) {
      output = output.replace(pattern, token);
      replacements.push([token, term]);
    }
  });

  return {
    text: output,
    restore(value) {
      return replacements.reduce((result, [token, term]) => result.split(token).join(term), value);
    }
  };
}

function normalizeComparable(text) {
  return String(text || "").replace(/\s+/g, "").toLowerCase();
}

function finalCleanOutput(text, topic, options = {}) {
  const allowSupplement = Boolean(options.allowSupplement);
  const aiValuePhrase = `《${topic}》的价值、边界和下一步行动`;
  let output = normalizeUserInput(text)
    .replace(/待客户补充：\s*待客户补充：/g, "待客户补充：")
    .replace(/(需规避的敏感信息[、，,]\s*)+需规避的敏感信息/g, "需规避的敏感信息")
    .replace(/人工确认\s+实操案例/g, "人工确认。实操案例")
    .replace(/输出结果应该如何审核。；/g, "输出结果应该如何审核。")
    .replace(/内容突出([^。]+)。+，风格/g, "内容突出$1，风格")
    .replace(/待客户补充：项目背景材料、现有文字资料、关键图片素材、品牌视觉规范\s*视频/g, "AI 视频")
    .replace(/待客户补充：项目背景材料、现有文字资料、关键图片素材、品牌视觉规范\s*展示屏/g, "AI 展示屏")
    .replace(/待客户补充：项目背景材料、现有文字资料、关键图片素材、品牌视觉规范\s*能力/g, "AI 能力")
    .replace(/项目背景材料、现有文字资料、关键图片素材、品牌视觉规范\s*视频/g, "AI 视频")
    .replace(/项目背景材料、现有文字资料、关键图片素材、品牌视觉规范\s*展示屏/g, "AI 展示屏")
    .replace(/项目背景材料、现有文字资料、关键图片素材、品牌视觉规范\s*能力/g, "AI 能力");

  if (!isAiParkPromotion(topic)) {
    const staleParkPhrase = ["园区 AI 宣传推广方案", "的落地价值"].join("");
    output = output.replace(new RegExp(escapeRegExp(staleParkPhrase), "g"), aiValuePhrase);
  }

  if (!allowSupplement) {
    output = output
      .replace(/“待客户补充：([^”]+)”/g, "“需客户后续确认的资料”")
      .replace(/待客户补充：([^。；，,]+)/g, "需客户后续确认的资料");
  }

  return normalizeUserInput(output)
    .replace(/(需规避的敏感信息[、，,]\s*)+需规避的敏感信息/g, "需规避的敏感信息")
    .replace(/。{2,}/g, "。")
    .replace(/；。/g, "。")
    .replace(/，。/g, "。")
    .replace(/。；/g, "。")
    .replace(/。，/g, "，");
}

function shortText(text, maxLength) {
  const clean = normalizeUserInput(text).replace(/\s+/g, "");
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength)}...`;
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 1800);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch (error) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
}
